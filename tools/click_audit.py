#!/usr/bin/env python3
"""Click audit: click everything in Club NYC the way a player would, and report what does nothing.

usage: .venv/bin/python tools/click_audit.py                      (everything, ~5-15 min)
       .venv/bin/python tools/click_audit.py --rooms soho,pizza   (only these rooms in the rooms phase)
       .venv/bin/python tools/click_audit.py --only rooms,hud     (only some phases; see PHASES below)
       options: --workers N (parallel players for rooms/HUD/shops, default 3), --keep-log (copy the server/Vite log)

What it does
  * Runs on a FROZEN private copy of app/ + server/ (tools/stack.py: rsync without node_modules/data/dist/.env,
    node_modules symlinked back) with a dev game server + Vite on free ports and a throwaway database, so edits made
    while it runs can't disturb it. Never touches your dev servers (5173/5174/8787) or server/data/club-nyc.db.
  * Signs players up through the real UI (Play now -> creator -> 13+ box -> name -> team -> Start exploring), at
    1000x565 with ?desktop. Player A also audits the creator, Rosa's tour and the quest box's "Show me" cards.
  * Rooms: visits every room in app/src/data/rooms.ts and clicks every hotspot (traced cutouts, zones, seats)
    with a real mouse click on a pixel the game's own hit test picks, after checking the hover label; follows every
    choice menu option; clicks a city local and their card's buttons; picks up a coin.
  * HUD: every toolbar button, menu item, hotkey, the chat bar, quest box, ? button, online pill;
    every button inside the panels they open (player card, stamp book, newspaper, community tabs and chips, invite,
    photo booth), every map pin, every subway stop, every shop catalog button, the apartment (decorate, furniture,
    catalog, guestbook, open house, party, StreetCheesy homes) and every job lobby (tabs, start, back, full board).
  * Social (players A and B, plus fresh visitors for invite links): player cards, add friend / accept, Go to a
    friend online and offline, visit a friend's apartment (home / out / offline), a non-friend's apartment from
    their card, joining a house party, mute / block / report (report cancelled), /join/<name> links.
  * Classifies each click: opened a panel, toast/notice, the player or a local spoke, room changed, mini-game or
    lobby started, choice menu, ... or DEAD (nothing visible), SOUND-ONLY, CLOSED-ONLY, BLOCKED (couldn't be
    clicked), UNREACHABLE, ERROR (page error, console error, HTTP 4xx/5xx or a server refusal nobody saw).
  * Excluded on purpose: Delete account, Sign out, real sign-in with Google/X/Discord, external share links
    (their hrefs are recorded, never opened). Buying things in the throwaway database is fine: workers get coins
    from the private server's moderator API (a random ADMIN_TOKEN made for this run).

Writes tools/out/click-audit.json (one entry per interaction) and docs/launch/click-audit.md (summary + every
DEAD/ERROR item with how to reproduce and the suspected code), plus screenshots of problems in tools/out/click-audit/.
"""
import argparse, asyncio, http.cookiejar, json, os, re, secrets, signal, sys, time, traceback, urllib.error, urllib.request

from playwright.async_api import async_playwright

from stack import PrivateStack, ROOT

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
SHOTS = os.path.join(OUT, 'click-audit')
JSON_OUT = os.path.join(OUT, 'click-audit.json')
MD_OUT = os.path.join(ROOT, 'docs', 'launch', 'click-audit.md')
AUDIT_JS = open(os.path.join(HERE, 'click_audit.js'), encoding='utf-8').read()
VIEW = {'width': 1000, 'height': 565}
PHASES = ['onboarding', 'rooms', 'hud', 'panels', 'map', 'subway', 'shops', 'home', 'social', 'invites']

# ---------------------------------------------------------------- classification

# toasts/notices the city shows on its own (quests completing, daily refill, tips on entering a room...)
AMBIENT = re.compile(r'^(✓ |Daily MetroCard refill|\S{1,20} is dancing — press|That’s all the coins|\d+ stamps bonus|Unlocked: Paper Party Hat|Tip: rent skates|'
                     r'Housewarming gifts|\d+ new guestbook|🪩 DANCE JAM|A flash mob is forming|What a flash mob|You’re officially a local|click audit|'
                     r'.{1,40} is online( at|$)|\d+ people are hanging out|.{1,30} is hanging out at|.{1,30} just showed up at|.{1,30} is grabbing a snack|'
                     r'.{1,30} is people-watching|.{1,30} leads .{1,30} this week|A flash mob is forming in|.{1,40} lead the Neighborhood Wars|The Dance Jam just started|'
                     r'.{1,30} wants to be friends|.{1,30} accepted your friend request|.{1,30} signed your guestbook|.{1,30} liked your apartment|.{1,30} is throwing a party|'
                     r'.{1,30} just joined Club NYC through your invite)', re.I)
RATE = re.compile(r'Whoa, slow down', re.I)
SOON = re.compile(r'coming soon|under construction|opens soon|still being (set up|built)|🚧', re.I)
UI_SFX = {'click', 'tick', 'pop', 'whoosh', 'stamp', 'coin', 'ding'}
CLOSE_LIKE = re.compile(r'^\s*(✕|×|close|cancel|done|ok\b|cool!?|got it|keep partying|i’ll be here|maybe later|no thanks|keep looking|keep my|i’ll walk|later\b|back to the city|← back|keep my coin|let’s go)', re.I)
STRONG = ['room', 'game', 'ride', 'tour', 'choice', 'panel', 'panel-update', 'notice', 'toast', 'speech', 'sit', 'emote', 'look', 'mode',
          'fx', 'toggle', 'input', 'download', 'popup', 'navigate', 'stamp']
OK_RESULTS = set(STRONG) | {'closed', 'local-speech', 'remote-speech', 'noop-expected', 'link-ok', 'present', 'coins'}
# messages from the server ("📢 …") or the game that say something went wrong
ERRORISH = re.compile(r'doesn.t exist|unknown place|couldn.t|can.t reach|went wrong|try again|jammed|fell through|didn.t (load|work)|not allowed|failed', re.I)
PROBLEMS = {'DEAD', 'ERROR', 'BLOCKED', 'UNREACHABLE', 'WRONG', 'MISSING-TARGET', 'FAILED'}
DEADISH = {'SOUND-ONLY', 'CLOSED-ONLY', 'DISABLED', 'UNPLACED', 'COMING-SOON', 'ABSENT', 'NOT-A-STOP', 'NO-SHOP'}
QUIET_CONSOLE = re.compile(r'\[vite\]|Download the React DevTools|AudioContext was not allowed', re.I)


def now():
    return time.time()


def log(msg):
    print(f'[{time.strftime("%H:%M:%S")}] {msg}', flush=True)


def norm(s):
    return re.sub(r'\s+', ' ', re.sub(r'\d[\d,]*', '#', s or '')).strip().lower()


def same_label(shown, expected):
    """The hover label shows this hotspot (labels may gain an icon, e.g. “🚪 To SoHo”)."""
    strip = lambda t: re.sub(r'^[^\w♥]+', '', norm(t or ''))
    a, b = strip(shown), strip(expected)
    return bool(a) and (a == b or a.endswith(b) or b.endswith(a))


def ambient(t):
    return bool(AMBIENT.search(t) or AMBIENT.search(re.sub(r'^\S{1,3}\s+', '', t)))


def summarize(before, after, ev):
    """What changed on screen between two snapshots, plus the event log in between."""
    s = {}

    def add(k, v):
        s.setdefault(k, []).append(v)

    opened = []
    for e in ev:
        k = e.get('kind')
        t = (e.get('text') or '').strip()
        if k in ('toast', 'notice'):
            if RATE.search(t):
                add('rate-limited', t)
            elif ambient(t):
                add('ambient', t)
            else:
                add(k, t)
        elif k == 'stamp':
            add('stamp', t)
        elif k == 'say':
            who = e.get('who')
            add('speech' if who == 'player' else 'local-speech' if who == 'npc' else 'remote-speech', f"{e.get('name')}: {e.get('text')}")
        elif k == 'emote' and e.get('who') == 'player':
            add('emote', e.get('pose'))
        elif k == 'sit' and e.get('who') == 'player':
            add('sit', e.get('seat'))
        elif k == 'look':
            add('look', 'outfit changed')
        elif k in ('game', 'payout'):
            add('game', (e.get('cls') or k).split(' ')[0])
        elif k == 'lobby':
            add('game', 'lobby: ' + t[:60])
        elif k in ('ride', 'scene'):
            add('ride', t[:80] or (e.get('cls') or k).split(' ')[0])
        elif k == 'tour':
            add('tour', t)
        elif k in ('fx', 'confetti', 'announce'):
            add('fx', (e.get('cls') or k).split(' ')[0])
        elif k == 'overlay':
            opened.append(e)
        elif k == 'class':
            tgt = e.get('target') or ''
            if tgt == 'stage':
                for c in e.get('plus', []):
                    if c in ('decorating', 'aiming', 'house-dark'):
                        add('mode', c)
            elif 'shake' in e.get('plus', []):
                add('toggle', f'{tgt} shakes (needs input)')
            else:
                add('toggle', f"{tgt}{'[' + e['label'] + ']' if e.get('label') else ''} +{','.join(e.get('plus', []))} -{','.join(e.get('minus', []))}")
        elif k == 'sfx':
            add('sfx', e.get('name'))
        elif k == 'goto':
            add('goto', e.get('room'))
        elif k == 'room':
            add('room', e.get('to'))
        elif k == 'window-open':
            add('popup', e.get('url'))
    b, a = before or {}, after or {}
    if a.get('room') and b.get('room') and b.get('room') != a.get('room'):
        s['room'] = [a['room']]
    bo, ao = b.get('overlay'), a.get('overlay')
    if ao and (not bo or bo['cls'] != ao['cls'] or norm(bo['title']) != norm(ao['title'])):
        add('choice' if ao.get('choices') and 'pop-menu' not in ao['cls'] else 'panel', ao['title'])
    elif ao and bo and ao['sig'] != bo['sig']:
        add('panel-update', ao['title'])
    elif bo and not ao:
        add('closed', bo['title'])
    if not ao and not bo and any(o.get('open') for o in opened):
        add('panel', next(o['title'] for o in opened if o.get('open')) + ' (opened and closed)')
    pb, pa = b.get('player') or {}, a.get('player') or {}
    if pa.get('seat') and pa.get('seat') != pb.get('seat'):
        add('sit', pa['seat'])
    if pa.get('tag') and pb.get('tag') and pa['tag'] != pb['tag']:
        add('toggle', 'name tag changed')
    if (a.get('lobby') and not b.get('lobby')) or (a.get('game') and not b.get('game')):
        add('game', 'lobby' if a.get('lobby') else 'game')
    elif b.get('game') and not a.get('game'):
        add('closed', 'left the game')
    elif b.get('lobby') and not a.get('lobby'):
        add('closed', 'left the lobby')
    if a.get('ride') and not b.get('ride'):
        add('ride', 'subway ride')
    if a.get('scene') and not b.get('scene'):
        add('ride', 'scene card')
    if a.get('tour') and a.get('tour') != b.get('tour'):
        add('tour', a['tour'])
    elif b.get('tour') and not a.get('tour'):
        add('closed', 'tour card: ' + b['tour'])
    plus = set(a.get('stageCls') or []) - set(b.get('stageCls') or [])
    for c in plus:
        add('mode', c)
    for c in set(b.get('stageCls') or []) - set(a.get('stageCls') or []):
        if c == 'decorating':
            add('closed', 'decorating mode')
    if isinstance(a.get('furniture'), int) and isinstance(b.get('furniture'), int) and a['furniture'] != b['furniture']:
        add('fx', f"furniture in the room: {b['furniture']} → {a['furniture']}")
    elif a.get('traySig') and b.get('traySig') and a['traySig'] != b['traySig']:
        add('panel-update', 'decorating tray')
    if a.get('chatLog') != b.get('chatLog') and a.get('chatLog') is not None and b.get('chatLog') is not None:
        add('toggle', 'chat log ' + ('opened' if a.get('chatLog') else 'closed'))
    if a.get('creator') and not b.get('creator'):
        add('panel', 'the New Yorker creator')
    elif b.get('creator') and not a.get('creator'):
        add('mode', 'left the creator for the city')
    elif a.get('creator') and b.get('creatorSig') != a.get('creatorSig'):
        add('panel-update', 'creator step')
    if a.get('partyChip') and not b.get('partyChip'):
        add('fx', 'party-chip')
    if a.get('url') and b.get('url') and a.get('url') != b.get('url'):
        add('navigate', a.get('url'))
    if isinstance(b.get('coins'), int) and isinstance(a.get('coins'), int) and a['coins'] < b['coins']:
        add('coins', f"spent: {b['coins']} → {a['coins']}")
    if a.get('notices') and len(a['notices']) > len(b.get('notices') or []):
        for n in a['notices'][len(b.get('notices') or []):]:
            if not ambient(n) and n not in s.get('notice', []):
                add('notice', n)
    return {k: list(dict.fromkeys(v)) for k, v in s.items()}


def texts_of(sig):
    out = []
    for k in ('toast', 'notice', 'speech', 'panel', 'panel-update', 'choice', 'tour', 'stamp', 'game', 'ride', 'room', 'closed', 'sit', 'emote', 'look', 'input',
              'local-speech', 'remote-speech', 'toggle', 'mode', 'fx', 'popup', 'navigate', 'coins', 'sfx', 'goto', 'rate-limited', 'download'):
        for v in sig.get(k, []):
            out.append(f'{k}: {v}')
    return out


# ---------------------------------------------------------------- the audit

class Audit:
    def __init__(self, args):
        self.args = args
        self.entries = []
        self.notes = []
        self.social = []
        self.base = None
        self.stack = None
        self.browser = None
        self.admin_token = 'click-audit-' + secrets.token_hex(12)
        self.admin_cookies = None
        self.t0 = now()
        self.lobby_done = set()
        self.lobby_btn = {'back': False, 'full': False, 'quit': False}
        self.homes_visited = {}
        self.shops_seen = set()
        self.rooms_seen = set()
        self.room_ids = []
        self.npc_card_done = False
        self.workarounds = set()
        self.lobby_tried = set()
        self.refusals = []
        self.players = []
        self.tour_present = False
        self.counter = 0

    # ---------- recording ----------
    def add(self, area, label, result, *, kind='button', where='', evidence=None, errors=None, http=None, repro='', source='', flags=None, extra=None):
        self.counter += 1
        e = {'id': self.counter, 'area': area, 'where': where, 'label': label, 'kind': kind, 'result': result,
             'ok': result in OK_RESULTS, 'flags': sorted(set(flags or [])), 'evidence': evidence or [], 'errors': errors or [], 'http': http or [],
             'repro': repro, 'source': source, 't': round(now() - self.t0, 1)}
        if extra:
            e.update(extra)
        self.entries.append(e)
        mark = '  ' if e['ok'] and not e['flags'] else '!!' if result in PROBLEMS else ' ~'
        if result in PROBLEMS or self.args.verbose or result in DEADISH or e['flags']:
            log(f"{mark} [{area}] {label[:60]} → {result}{' ' + ','.join(e['flags']) if e['flags'] else ''}  {('; '.join(e['evidence'][:2]))[:140]}{('  ERR ' + '; '.join(e['errors'])[:200]) if e['errors'] else ''}")
        return e

    def record(self, P, area, label, obs, *, kind='button', where='', expect=None, close_like=None, weak_ok=(), allow_http=(), repro='', source='', flags=None, extra=None, noop_ok=False):
        """Classify an observation and add it."""
        sig = obs['sig']
        close_like = CLOSE_LIKE.search(label or '') is not None if close_like is None else close_like
        result = None
        for k in STRONG:
            if k in sig:
                result = k
                break
        if result is None:
            if 'closed' in sig:
                result = 'closed' if close_like else 'CLOSED-ONLY'
            elif 'local-speech' in sig and 'local-speech' in weak_ok:
                result = 'local-speech'
            elif 'remote-speech' in sig and 'remote-speech' in weak_ok:
                result = 'remote-speech'
            elif 'coins' in sig:
                result = 'coins'
            elif noop_ok:
                result = 'noop-expected'
            elif [x for x in sig.get('sfx', []) if x not in UI_SFX]:
                result = 'SOUND-ONLY'
            else:
                result = 'DEAD'
        fl = set(flags or [])
        notes = []
        if expect:
            kind_, val = expect
            if kind_ == 'room':
                got = (sig.get('room') or [None])[-1]
                if got is None and result != 'ERROR':
                    if result in ('closed', 'CLOSED-ONLY', 'noop-expected', 'DEAD', 'SOUND-ONLY', 'coins'):
                        notes.append(f'expected to go {"to " + val if val else "somewhere"}; the room never changed')
                        result = 'DEAD'
                elif got and val and got != val:
                    notes.append(f'went to {got}, expected {val}')
                    result = 'WRONG'
        failed = sig.get('click-failed')
        if failed and result in ('DEAD', 'CLOSED-ONLY', 'SOUND-ONLY', 'noop-expected'):
            m = re.search(r'(<[^>]+>(?:…</\w+>)?(?: from <[^>]+>(?:…</\w+>)?)? subtree intercepts pointer events|<[^>]+>(?:…</\w+>)? intercepts pointer events)', failed[0])
            notes.append('a player can’t click it: ' + (m.group(0) if m else failed[0][:160]))
            result = 'BLOCKED'
        if result == 'DEAD' and sig.get('goto'):
            notes.append(f"called goto('{sig['goto'][-1]}') but the room never changed")
        if 'rate-limited' in sig:
            fl.add('rate-limited')
        alltext = ' '.join(texts_of(sig))
        if SOON.search(alltext) or SOON.search(label or ''):
            fl.add('coming-soon')
        errors = list(obs['errors'])
        for t in sig.get('toast', []) + sig.get('notice', []):
            if t.startswith('📢') and ERRORISH.search(t):
                errors.append(f'server message: {t}')
            elif ERRORISH.search(t):
                fl.add('error-message')
        http = [h for h in obs['http'] if h['status'] not in allow_http]
        soft = obs['soft']
        if http or errors:
            # was the player told? (a toast/notice/panel next to the failure)
            told = any(k in sig for k in ('toast', 'notice', 'panel', 'choice', 'panel-update'))
            if told:
                fl.add('player-was-told')
            result_before = result
            result = 'ERROR'
            notes.append(f'otherwise: {result_before}')
        for sf in soft:
            told = any(k in sig for k in ('toast', 'notice', 'panel', 'choice'))
            notes.append(f"server said no: {sf['path']} {sf.get('sent', '')} → {sf['error']}" + ('' if told else ' (player not told)'))
            if not told and result in OK_RESULTS:
                fl.add('silent-server-refusal')
        ev = notes + texts_of(sig)
        e = self.add(area, label, result, kind=kind, where=where, evidence=ev[:14],
                     errors=[x[:300] for x in errors][:6], http=[f"{h['status']} {h['method']} {h['url']}" for h in http][:6], repro=repro, source=source, flags=fl, extra=extra)
        e['_sig'] = sig
        for r in sig.get('room', []):
            self.rooms_seen.add(r)
        return e

    # ---------- the private server's moderator API (coins for the throwaway players) ----------
    def admin(self, path, body=None, method='POST'):
        url = f'http://localhost:{self.stack.game}/api/admin{path}'
        if self.admin_cookies is None:
            self.admin_cookies = http.cookiejar.CookieJar()
            op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.admin_cookies))
            req = urllib.request.Request(f'http://localhost:{self.stack.game}/api/admin/login', data=json.dumps({'token': self.admin_token}).encode(), headers={'content-type': 'application/json'}, method='POST')
            op.open(req, timeout=10).read()
            self.admin_opener = op
        req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None, headers={'content-type': 'application/json'}, method=method)
        with self.admin_opener.open(req, timeout=10) as r:
            return json.loads(r.read() or b'null')

    def http_get(self, path):
        try:
            with urllib.request.urlopen(self.base + path, timeout=10) as r:
                return r.status, r.read(400000).decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            return e.code, ''
        except Exception as e:
            return 0, str(e)


class Player:
    """One browser context = one New Yorker."""

    def __init__(self, audit, tag, name):
        self.a = audit
        self.tag = tag
        self.name = name
        self.ctx = None
        self.page = None
        self.errs = []
        self.net = []
        self.soft = []
        self.downloads = []
        self.popups = []
        self.hop_tokens = 3.0
        self.hop_t = now()
        self.user_id = None
        self.base_room = 'times-square'
        self._recovering = False

    # ---------- browser ----------
    async def open(self):
        self.ctx = await self.a.browser.new_context(viewport=VIEW, accept_downloads=False)
        try:
            await self.ctx.grant_permissions(['clipboard-read', 'clipboard-write'], origin=self.a.base)
        except Exception:
            pass
        await self.ctx.add_init_script(script=AUDIT_JS)
        self.ctx.on('page', self._on_popup)
        self.page = await self.ctx.new_page()
        self._hook(self.page)
        self.page.set_default_timeout(8000)
        return self

    def _hook(self, pg):
        pg.on('pageerror', lambda e: self.errs.append((now(), f'pageerror: {e}')))
        pg.on('console', lambda m: self.errs.append((now(), f'console.{m.type}: {m.text}')) if m.type == 'error' and not QUIET_CONSOLE.search(m.text) else None)
        pg.on('response', self._on_response)
        pg.on('requestfailed', lambda r: self.net.append((now(), {'status': 0, 'method': r.method, 'url': r.url.replace(self.a.base, ''), 'why': r.failure})) if not self._benign_fail(r) else None)
        pg.on('download', lambda d: self.downloads.append((now(), d.suggested_filename)))
        pg.on('dialog', lambda d: asyncio.ensure_future(d.dismiss()))

    @staticmethod
    def _benign_fail(r):
        f = (r.failure or '')
        # leaving a page or a room cancels in-flight images; aborted fetches are reported by the caller
        return 'ERR_ABORTED' in f and ('/art/' in r.url or r.resource_type in ('image', 'media', 'font'))

    def _on_popup(self, pg):
        if pg == self.page:
            return
        self.popups.append((now(), pg))

    def _on_response(self, r):
        try:
            url = r.url.replace(self.a.base, '')
            if r.status >= 400:
                self.net.append((now(), {'status': r.status, 'method': r.request.method, 'url': url}))
            elif url.startswith('/api/') and r.request.method != 'GET' or url.startswith('/api/wallet') or url.startswith('/api/games'):
                asyncio.ensure_future(self._soft(r, url, r.request.post_data))
        except Exception:
            pass

    async def _soft(self, r, url, sent=None):
        try:
            body = await r.json()
        except Exception:
            return
        if isinstance(body, dict) and (body.get('ok') is False or (body.get('error') and body.get('ok') is not True)) and body.get('accepted') is not True:
            err = body.get('error') or 'ok:false'
            what = ''
            try:
                j = json.loads(sent or 'null') or {}
                what = ' '.join(f'{k}={j[k]}' for k in ('reason', 'item', 'kind', 'id', 'amount', 'ref') if k in j)
            except Exception:
                pass
            rec = {'path': url.split('?')[0], 'error': err, 'sent': what, 'player': self.tag}
            self.soft.append((now(), rec))
            self.a.refusals.append(rec)

    async def close(self):
        try:
            await self.ctx.close()
        except Exception:
            pass

    # ---------- page helpers ----------
    async def js(self, expr, arg=None):
        return await self.page.evaluate(expr, arg)

    async def state(self):
        return await self.js('() => (__audit.attach(), __audit.state())')

    async def wait(self, cond_js, timeout=6.0, arg=None, every=0.1):
        end = now() + timeout
        while now() < end:
            try:
                if await self.js(cond_js, arg):
                    return True
            except Exception:
                pass
            await asyncio.sleep(every)
        return False

    async def hop_wait(self):
        t = now()
        self.hop_tokens = min(3.0, self.hop_tokens + (t - self.hop_t) * 0.9)
        self.hop_t = t
        if self.hop_tokens < 1:
            await asyncio.sleep((1 - self.hop_tokens) / 0.9 + 0.05)
            return await self.hop_wait()

    def hop_take(self, n=1):
        t = now()
        self.hop_tokens = min(3.0, self.hop_tokens + (t - self.hop_t) * 0.9) - n
        self.hop_t = t

    async def observe(self, do, *, timeout=2.5, settle=0.45, min_wait=0.3, max_extra=4.0, until=None):
        """Do one real click/keypress (`do`), then watch until something visible happens (or `timeout`)."""
        await self.hop_wait()
        before = await self.state()
        mark = await self.js('() => __audit.mark()')
        t0 = now()
        n_err, n_net, n_soft, n_dl, n_pop = len(self.errs), len(self.net), len(self.soft), len(self.downloads), len(self.popups)
        exc = None
        try:
            await do()
        except Exception as e:
            exc = e
        deadline = now() + timeout
        hard = deadline + max_extra
        strong_at = None
        last = None
        while True:
            await asyncio.sleep(0.12)
            try:
                last = await self.js('m => (__audit.attach(), __audit.poll(m))', mark)
            except Exception as e:
                if 'navigat' in str(e).lower() or 'context was destroyed' in str(e).lower():
                    await asyncio.sleep(0.5)
                    continue
                raise
            st = last['st']
            sig = summarize(before, st, last['ev'])
            t = now()
            busy = st.get('fading') or (st.get('player') or {}).get('moving') or st.get('gameLoading')
            if any(k in sig for k in STRONG) and strong_at is None:
                strong_at = t
                deadline = min(max(deadline, t), t + settle)
            if until is not None and until(st, sig):
                break
            if busy and t >= deadline and t < hard:
                deadline = t + 0.25
            if t >= deadline and t - t0 >= min_wait:
                break
        await asyncio.sleep(0.05)
        st = last['st'] if last else await self.state()
        sig = summarize(before, st, last['ev'] if last else [])
        rooms = sum(1 for e in (last['ev'] if last else []) if e.get('kind') == 'room')
        if rooms:
            self.hop_take(rooms)
        if len(self.downloads) > n_dl:
            sig.setdefault('download', []).extend(d[1] for d in self.downloads[n_dl:])
        for _, pg in self.popups[n_pop:]:
            try:
                sig.setdefault('popup', []).append(pg.url)
                await pg.close()
            except Exception:
                pass
        errors = [m for _, m in self.errs[n_err:]]
        http = [h for _, h in self.net[n_net:]]
        # "Failed to load resource" console lines duplicate the HTTP list
        if http:
            errors = [m for m in errors if 'Failed to load resource' not in m]
        soft = [s for _, s in self.soft[n_soft:]]
        if exc is not None:
            sig.setdefault('click-failed', []).append(re.sub(r'\s+', ' ', str(exc))[:900])
        return {'before': before, 'after': st, 'sig': sig, 'errors': errors, 'http': http, 'soft': soft, 'exc': exc, 'dt': round(now() - t0, 2), 'events': last['ev'] if last else []}

    async def click_tagged(self, timeout=2500):
        await self.page.locator('[data-audit="t"]').first.click(timeout=timeout)

    async def press(self, key):
        await self.page.keyboard.press(key)

    # ---------- getting back to a clean screen ----------
    async def _click(self, sel, timeout=1500):
        """A real click; if something covers the control, a JS click (and a note: a player couldn't do this)."""
        try:
            await self.page.locator(sel).first.click(timeout=timeout)
            return True
        except Exception as e:
            if 'intercepts pointer events' in str(e) or 'not visible' in str(e) or 'Timeout' in str(e):
                ok = await self.js("s => { const e = document.querySelector(s); if (e) e.click(); return !!e }", sel)
                key = f'covered:{sel}'
                if ok and key not in self.a.workarounds:
                    self.a.workarounds.add(key)
                    m = re.search(r'<[^>]+>[^<]*?(?: from <[^>]+>)? subtree intercepts pointer events', str(e))
                    self.a.notes.append(f'automation workaround: {sel} was covered ({m.group(0)[:160] if m else "not clickable"}); used a JS click to get out')
                return ok
            return False

    async def reset(self, room=None):
        end = now() + 22
        cleared = False
        while now() < end:
            try:
                st = await self.state()
            except Exception:
                await asyncio.sleep(0.5)
                continue
            if not st.get('ready'):
                await asyncio.sleep(0.4)
                continue
            try:
                if st['lobby']:
                    await self._click('.lobby-back')
                elif st['game'] and await self.page.locator('.game-shell:not(.out) .game-quit').count():
                    await self._click('.game-shell:not(.out) .game-quit')
                    await asyncio.sleep(0.45)
                elif st['payout']:
                    await self._click('.payout .btn.go')
                elif st['tour']:
                    if await self.page.locator('.tour .tour-skip').count():
                        await self._click('.tour .tour-skip')
                    else:
                        await self._click('.tour .tour-next')
                    await asyncio.sleep(0.25)
                elif st['ride'] or st['scene'] or 'house-dark' in st['stageCls'] or st['changing'] or st['game']:
                    await asyncio.sleep(0.5)
                elif 'aiming' in st['stageCls']:
                    await self.press('Escape')
                elif 'decorating' in st['stageCls'] and not st['overlay']:
                    await self._click('.decor-tray .btn.go')
                elif st['overlay']:
                    await self.js('() => document.activeElement && document.activeElement.blur && document.activeElement.blur()')
                    await self.press('Escape')
                    await asyncio.sleep(0.12)
                    st2 = await self.state()
                    if st2['overlay']:
                        if await self.page.locator('.overlay.open .x-btn').count():
                            await self._click('.overlay.open .x-btn')
                        else:
                            await self.page.mouse.click(4, 4)
                        await asyncio.sleep(0.15)
                elif st['chatLog']:
                    await self._click('.chat-log-btn')
                else:
                    cleared = True
                    break
            except Exception:
                await asyncio.sleep(0.3)
        if not cleared and not self._recovering:
            st = await self.state()
            self.a.notes.append(f"{self.tag}: the screen stayed blocked ({', '.join(k for k in ('overlay', 'lobby', 'game', 'ride', 'scene', 'tour', 'payout') if st.get(k))}{', ' + ','.join(st.get('stageCls') or []) if st.get('stageCls') else ''}); reloaded the page")
            await self.recover()
        await self.js("() => { document.querySelectorAll('.notice').forEach(n => n.remove()); document.activeElement && document.activeElement.blur && document.activeElement.blur() }")
        if room:
            st = await self.state()
            if st.get('room') != room:
                await self.goto(room)

    async def goto(self, room, tries=3):
        for _ in range(tries):
            await self.hop_wait()
            await self.js('r => clubNyc.api.goto(r)', room)
            self.hop_take()
            ok = await self.wait('r => clubNyc.world.room.id === r && !document.querySelector(".fade.on")', 4.0, room)
            if ok:
                await self.wait('() => __audit.alphaReady()', 3.0)
                await asyncio.sleep(0.15)
                return True
            await asyncio.sleep(0.6)
        return False

    async def recover(self):
        """Reload the game (returning player) after something left the page stuck."""
        self._recovering = True
        try:
            await self.page.goto(self.a.base + '/play?desktop', wait_until='domcontentloaded')
            await self.page.wait_for_selector('.online-pill.on', timeout=15000)
            await self.js('() => __audit.attach()')
            await asyncio.sleep(1.0)
            await self.reset()
            await self.js('() => { clubNyc.save.notifyOff = true }') if self.tag.startswith('W') else None
        except Exception as e:
            log(f'{self.tag}: recover failed: {e}')
        finally:
            self._recovering = False

    async def screenshot(self, name):
        try:
            os.makedirs(SHOTS, exist_ok=True)
            path = os.path.join(SHOTS, re.sub(r'[^\w.-]+', '_', name)[:80] + '.png')
            await self.page.screenshot(path=path)
            return os.path.relpath(path, ROOT)
        except Exception:
            return ''

    # ---------- sign up through the real UI ----------
    async def signup(self, team=0, path='/', audit=None, tour='skip'):
        """Play now -> creator -> Start exploring. `audit` (an Audit) records every creator click."""
        pg = self.page
        await pg.goto(self.a.base + path + ('&' if '?' in path else '?') + 'desktop', wait_until='domcontentloaded')
        await pg.wait_for_selector('.si-live.busy, .si-live.quiet', timeout=15000)
        await asyncio.sleep(0.3)
        rec = audit is not None

        async def step(label, do, **kw):
            if rec:
                obs = await self.observe(do, timeout=kw.pop('timeout', 1.6), settle=0.35)
                return self.a.record(self, 'onboarding', label, obs, kind='button', where='creator', **kw)
            await do()
            await asyncio.sleep(kw.pop('pause', 0.2))

        await step('Play now', lambda: pg.click('.si-play'), timeout=4.0, repro='open /play?desktop → Play now')
        await pg.wait_for_selector('.creator-card', timeout=15000)
        nxt = '.creator-actions .btn.go'
        if rec:
            await step('“Let’s make you →” without ticking 13+', lambda: pg.click(nxt), repro='creator welcome step: click Next without the 13+ box')
            await step('13+ checkbox', lambda: pg.click('.cr-age input'), noop_ok=True)
        else:
            await pg.select_option('.cr-month', '6'); await pg.select_option('.cr-year', '2000'); await pg.click('.cr-age input')
        await step('“Let’s make you →”', lambda: pg.click(nxt))
        await asyncio.sleep(0.25)
        if rec:
            # look step: one option of each row, shuffle
            rows = await pg.locator('.le-row').count()
            for r in range(rows):
                opts = pg.locator('.le-row').nth(r).locator('.le-opt:not(.on)')
                if await opts.count():
                    await step(f'look option (row {r + 1})', lambda o=opts: o.first.click())
            if await pg.locator('.cr-shuffle').count():
                await step('Shuffle 🎲', lambda: pg.click('.cr-shuffle'))
        await step('Next → (look)', lambda: pg.click(nxt))
        await asyncio.sleep(0.25)
        gifts = pg.locator('.le-row').last.locator('.le-opt')
        if rec:
            await step('Next → without a welcome gift', lambda: pg.click(nxt))
            top = pg.locator('.le-row').first.locator('.le-opt:not(.on)')
            if await top.count():
                await step('starter outfit option', lambda: top.first.click())
        await step('welcome gift', lambda: gifts.nth(team % 5).click())
        await step('Next → (style)', lambda: pg.click(nxt))
        await pg.wait_for_selector('.creator-name input')
        if rec:
            await step('name suggestion chip', lambda: pg.locator('.cr-chip').first.click())
            if await pg.locator('.cr-chip.more').count():
                await step('more name suggestions 🎲', lambda: pg.click('.cr-chip.more'))
            await pg.fill('.creator-name input', '')
            await step('Next → with an empty name', lambda: pg.click(nxt))
        await pg.fill('.creator-name input', self.name)
        await pg.wait_for_selector('.cr-avail.ok', timeout=8000)
        await step('Next → (name)', lambda: pg.click(nxt))
        await pg.wait_for_selector('.team-card')
        if rec:
            await step('Get my MetroCard → without a team', lambda: pg.click(nxt))
        await step('team card', lambda: pg.locator('.team-card').nth(team % 5).click())
        await step('Get my MetroCard →', lambda: pg.click(nxt), timeout=4.0)
        await pg.wait_for_selector('.metrocard-id', timeout=15000)
        await asyncio.sleep(0.3)
        if rec:
            dl = pg.locator('.creator-actions .btn.ghost')
            if await dl.count():
                await step('📸 Save card', lambda: dl.first.click(), timeout=2.5)
        await step('Start exploring →', lambda: pg.click('.creator-actions .btn.go'), timeout=2.0)
        await pg.wait_for_selector('.online-pill.on', timeout=15000)
        await self.js('() => __audit.attach()')
        self.user_id = await self.js('() => clubNyc.save.owner')
        if tour == 'skip':
            try:
                await pg.wait_for_selector('.tour .tour-skip', timeout=6000 if self.a.tour_present else 2500)
                await pg.click('.tour .tour-skip')
                await asyncio.sleep(0.3)
            except Exception:
                pass
        return self


# ---------------------------------------------------------------- source lookup (best guess for the report)

class Sources:
    def __init__(self, app_root):
        self.root = app_root
        self.files = {}
        for top, prefix in ((app_root, 'app/'), (os.path.join(os.path.dirname(app_root), 'server'), 'server/')):
            for dp, _, fs in os.walk(os.path.join(top, 'src')):
                for f in fs:
                    if f.endswith(('.ts', '.css')):
                        p = os.path.join(dp, f)
                        try:
                            self.files[prefix + os.path.relpath(p, top)] = open(p, encoding='utf-8').read().split('\n')
                        except Exception:
                            pass

    def room_obj(self, room, obj):
        lines = self.files.get('app/src/data/rooms.ts') or []
        start = None
        rx = re.compile(r"^  '?" + re.escape(room) + r"'?: \{")
        for i, l in enumerate(lines):
            if rx.match(l):
                start = i
                continue
            if start is not None and re.match(r"^  '?[a-z-]+'?: \{", l) and i > start:
                break
            if start is not None and re.search(r"(^|[\s{,])'?" + re.escape(obj) + r"'?:", l):
                return f'app/src/data/rooms.ts:{i + 1}'
        return f'app/src/data/rooms.ts:{start + 1}' if start is not None else ''

    def find(self, text, prefer=()):
        t = re.sub(r'[^\w’\'&♥ .,!?-]+', ' ', text or '')
        t = re.sub(r'\s+', ' ', t).strip(' .')
        cands = [t]
        if len(t) > 24:
            cands.append(t[:24])
        words = [w for w in t.split(' ') if len(w) > 3]
        if len(words) >= 2:
            cands.append(' '.join(words[:3]))
        for c in cands:
            if len(c) < 3:
                continue
            hits = []
            for f, lines in self.files.items():
                for i, l in enumerate(lines):
                    if c in l:
                        hits.append(f'{f}:{i + 1}')
            if hits:
                hits.sort(key=lambda h: (0 if any(p in h for p in prefer) else 1, h))
                return ', '.join(hits[:2])
        return ''

    def grep(self, pattern, prefer=()):
        rx = re.compile(pattern)
        hits = []
        for f, lines in self.files.items():
            for i, l in enumerate(lines):
                if rx.search(l):
                    hits.append(f'{f}:{i + 1}')
        hits.sort(key=lambda h: (0 if any(p in h for p in prefer) else 1, h))
        return ', '.join(hits[:2])


# ---------------------------------------------------------------- rooms

async def audit_hotspot(A, P, room, h, *, follow=True, label_prefix=''):
    """Hover a hotspot like a player (its label must show), click it, classify. Follows choice menus."""
    area = f'room:{room}'
    label = h['label'] or h['id']
    kind = 'seat' if h['kind'] == 'seat' else 'exit' if h['go'] else 'hotspot'
    src = A.src.room_obj(room, h['id']) if h['kind'] != 'seat' else ''
    repro = f"goto('{room}') → click “{label}”"
    await P.reset(room=room)
    prep = None
    tries = []
    for attempt in range(10):
        try:
            prep = await P.js('a => __audit.prepHit(a[0], a[1])', [h['i'], h['id']])
        except Exception as e:
            prep = {'ok': False, 'reason': f'prep failed: {e}'}
        if prep.get('reason') == 'hotspot list changed':
            info = await P.js('() => __audit.roomInfo()')
            m = [x for x in info['hits'] if x['id'] == h['id'] and x['kind'] == h['kind']]
            if not m:
                break
            h = m[0]
            continue
        if prep.get('ok'):
            break
        tries.append(prep)
        bl = prep.get('blockers') or {}
        people_only = bool(bl) and all(k.startswith('person:') for k in bl)
        # people move on: retry a few times; anything else (HUD, another hotspot) won't change
        if not (people_only or prep.get('reason', '').startswith('taken')) and attempt >= 1:
            break
        await asyncio.sleep(1.0)
    if prep and not prep.get('ok'):
        bl = prep.get('blockers') or {}
        if kind == 'seat' and (prep.get('reason') or '').startswith('taken'):
            return A.add(area, label_prefix + label, 'present', kind=kind, where=room, evidence=[f"seat {h['id']}: {prep['reason']} (a local sat on it every time we looked)"], repro=repro)
        transient = lambda k: k.startswith('person:') or k == 'actor.is-player'
        if kind == 'seat' and any('[sit]' in k for k in bl):
            others = sorted(k for k in bl if '[sit]' not in k)
            return A.add(area, label_prefix + label, 'present', kind=kind, where=room,
                         evidence=[f"{h['id']} is under {', '.join(sorted(k for k in bl if '[sit]' in k))}, which seats you when clicked" + (f" (the rest is under {', '.join(others)})" if others else '')], repro=repro)
        same = [k for k in bl if k.startswith('hotspot:') and norm(k[8:].replace(' [sit]', '')) == norm(label)]
        if bl and same and all(k in same or transient(k) for k in bl):
            return A.add(area, label_prefix + label, 'present', kind=kind, where=room,
                         evidence=[f"{h['id']} sits under another “{label}” hotspot that does the same thing"], repro=repro)
        if bl and all(transient(k) for k in bl):
            return A.add(area, label_prefix + label, 'UNREACHABLE', kind=kind, where=room,
                         evidence=[f"covered by people on all {len(tries)} tries over ~{len(tries)} s ({', '.join(sorted(bl))})"], repro=repro, source=src, flags=['people-in-the-way'])
    if not prep or not prep.get('ok'):
        bl = prep.get('blockers') if prep else None
        top = sorted((bl or {}).items(), key=lambda kv: -kv[1])[:3]
        return A.add(area, label_prefix + label, 'UNREACHABLE', kind=kind, where=room, evidence=[f"{prep.get('reason') if prep else 'no prep'}" + (f"; covered by {', '.join(f'{k} ({v})' for k, v in top)}" if top else '')], repro=repro, source=src)
    chosen, seen = None, []
    for _ in range(2):
        for pt in prep['points']:
            await P.page.mouse.move(pt[0], pt[1])
            await asyncio.sleep(0.06)
            lab = await P.js('() => __audit.hoverLabel()')
            seen.append(lab)
            if lab and same_label(lab, prep['label']):
                chosen = pt
                break
        if chosen:
            break
        await asyncio.sleep(0.4)
        await P.page.mouse.move(2, 2)
        prep2 = await P.js('a => __audit.prepHit(a[0], a[1])', [h['i'], h['id']])
        if prep2.get('ok'):
            prep = prep2
    if not chosen:
        return A.add(area, label_prefix + label, 'UNREACHABLE', kind=kind, where=room, evidence=[f"hover shows {seen[-1]!r} instead of {prep['label']!r} at {prep['stage'][0]}"], repro=repro, source=src)
    timeout = 2.0 if h['instant'] else 3.2
    obs = await P.observe(lambda: P.page.mouse.click(chosen[0], chosen[1]), timeout=timeout, settle=0.5)
    expect = ('room', h['go']) if h['go'] else ('sit', None) if kind == 'seat' else None
    e = A.record(P, area, label_prefix + label, obs, kind=kind, where=room, expect=expect if expect and expect[0] == 'room' else None, repro=repro + f" (stage point {[round(v) for v in P_stage(prep, chosen)]})", source=src)
    if prep.get('coverage') is not None and prep['coverage'] < 0.15 and e['result'] in OK_RESULTS:
        top = sorted((prep.get('blockers') or {}).items(), key=lambda kv: -kv[1])[:2]
        e['flags'] = sorted(set(e['flags']) | {'mostly-hidden'})
        e['evidence'].insert(0, f"only {round(prep['coverage'] * 100)}% of it can be clicked; the rest is under {', '.join(k for k, _ in top) or 'other things'}")
    if h['sit'] and e['result'] == 'DEAD' and prep.get('freeSeats') == 0:
        e['evidence'].insert(0, f"all {prep.get('seats')} seats in the room were taken by city locals: clicking a sit-able thing then does nothing at all (no “Taken!” message)")
        e['source'] = A.src.grep(r'if \(seats\.length\) return sitPlayer', prefer=('world.ts',)) + ' (falls through to an empty action when no seat is free)'
    if h['soon']:
        e['flags'] = sorted(set(e['flags']) | {'coming-soon'})
        if e['result'] in OK_RESULTS:
            e['result'] = 'COMING-SOON'
            e['ok'] = False
    if kind == 'seat' and e['result'] not in ('sit',) and e['result'] in OK_RESULTS:
        e['evidence'].insert(0, 'seat click did not seat the player')
    for r in e['_sig'].get('room', []):
        A.rooms_seen.add(r)
    await note_shop(A, P)
    if e['result'] in PROBLEMS:
        e['shot'] = await P.screenshot(f'{e["id"]}-{room}-{label}')
    if e['_sig'].get('game'):
        await handle_lobby(A, P, area, f'{label}')
    if follow and e['result'] == 'choice':
        choices = (obs['after'].get('overlay') or {}).get('choices') or []
        for k, opt in enumerate(choices):
            await audit_choice(A, P, room, h, k, opt, label, src)
    return e


def P_stage(prep, chosen):
    try:
        i = prep['points'].index(chosen)
        return prep['stage'][i]
    except Exception:
        return [0, 0]


async def note_shop(A, P):
    try:
        cls = await P.js("() => document.querySelector('.overlay.open .catalog')?.className || ''")
        m = re.search(r'shop-([\w-]+)', cls or '')
        if m:
            A.shops_seen.add(m.group(1))
    except Exception:
        pass


async def retrigger(P, room, h):
    """Click a hotspot again (no recording) — used to reach the options of its choice menu."""
    for attempt in range(4):
        await P.reset(room=room)
        prep = await P.js('a => __audit.prepHit(a[0], a[1])', [h['i'], h['id']])
        if prep.get('reason') == 'hotspot list changed':
            info = await P.js('() => __audit.roomInfo()')
            m = [x for x in info['hits'] if x['id'] == h['id'] and x['kind'] == h['kind']]
            if m:
                h.update(m[0])
            continue
        if not prep.get('ok'):
            await asyncio.sleep(0.7)
            continue
        for pt in prep['points']:
            await P.page.mouse.move(pt[0], pt[1])
            await asyncio.sleep(0.06)
            if same_label(await P.js('() => __audit.hoverLabel()') or '', prep['label']):
                await P.page.mouse.click(pt[0], pt[1])
                if await P.wait("() => !!document.querySelector('.overlay.open .choices')", 4.5):
                    return True
                break
        await P.page.mouse.move(2, 2)
        await asyncio.sleep(0.6)
    return False


async def audit_choice(A, P, room, h, k, opt, label, src):
    area = f'room:{room}'
    if not await retrigger(P, room, h):
        return A.add(area, f'{label} → {opt}', 'FAILED', kind='choice-option', where=room, evidence=['could not reopen the menu'], source=src)
    btn = P.page.locator('.overlay.open .choices > button').nth(k)
    obs = await P.observe(lambda: btn.click(timeout=2000), timeout=3.0, settle=0.6)
    e = A.record(P, area, f'{label} → {opt}', obs, kind='choice-option', where=room, close_like=bool(CLOSE_LIKE.search(opt)), repro=f"goto('{room}') → click “{label}” → “{opt}”", source=src)
    if e['result'] in PROBLEMS:
        e['shot'] = await P.screenshot(f'{e["id"]}-{room}-{label}-{opt}')
    await note_shop(A, P)
    if e['_sig'].get('game'):
        await handle_lobby(A, P, area, f'{label} → {opt}')
    return e


async def handle_lobby(A, P, area, via):
    """We're in a job lobby (or a game): audit it once per game, then leave."""
    await asyncio.sleep(0.3)
    st = await P.state()
    if not st['lobby']:
        if st['game']:
            await asyncio.sleep(1.0)
            ok = await P.js("() => !document.querySelector('.game-loading:not([hidden])') && (document.querySelector('.game-root')?.childElementCount || 0) > 0")
            A.add('lobby', f'{via}: game screen loads', 'game' if ok else 'DEAD', kind='game', where=area, evidence=['game root has content' if ok else 'game never finished loading'])
            obs = await P.observe(lambda: P.page.locator('.game-quit').first.click(timeout=2000), timeout=1.5)
            A.record(P, 'lobby', 'Leave game ✕ (in a game)', obs, where=area, close_like=True, source=A.src.find("'game-quit'"))
        return
    title = await P.js("() => __audit.txt(document.querySelector('.lobby h2'))")
    if title in A.lobby_done:
        # generic buttons, once each, the next times a lobby shows up
        if not A.lobby_btn['back']:
            A.lobby_btn['back'] = True
            obs = await P.observe(lambda: P.page.locator('.lobby-back').first.click(timeout=2000), timeout=1.5)
            A.record(P, 'lobby', f'{title}: Back to the city', obs, where=via, close_like=True, source=A.src.find('Back to the city'))
            return
        if not A.lobby_btn['full']:
            A.lobby_btn['full'] = True
            obs = await P.observe(lambda: P.page.locator('.lobby-full').first.click(timeout=2000), timeout=2.5, settle=0.8)
            e = A.record(P, 'lobby', f'{title}: 🏆 Full leaderboard', obs, where=via, source=A.src.find('Full leaderboard'))
            on = await P.js("() => __audit.txt(document.querySelector('.overlay.open .cm-tab.on')) + ' / ' + __audit.txt(document.querySelector('.overlay.open .cm-chip.on'))")
            e['evidence'].append(f'community opened on: {on}')
            if title.lower() not in on.lower() and e['result'] in OK_RESULTS:
                e['evidence'].insert(0, f'expected the {title} board')
                e['result'] = 'WRONG'
                e['ok'] = False
            await P.reset()
            return
        if not A.lobby_btn['quit']:
            A.lobby_btn['quit'] = True
            obs = await P.observe(lambda: P.page.locator('.game-quit').first.click(timeout=2000), timeout=1.5)
            A.record(P, 'lobby', f'{title}: ✕ in the corner', obs, where=via, close_like=True)
            return
        await P.page.locator('.lobby-back').first.click(timeout=2000)
        return
    A.lobby_done.add(title)
    A.add('lobby', f'{title}: lobby opens', 'game', kind='game', where=via, evidence=[f'reached from {via}'])
    tabs = await P.page.locator('.lobby-tabs button').count()
    for i in range(tabs):
        tb = P.page.locator('.lobby-tabs button').nth(i)
        name = (await tb.inner_text()).strip()
        obs = await P.observe(lambda tb=tb: tb.click(timeout=2000), timeout=3.0, settle=0.2,
                              until=lambda st, sig: False)
        await P.wait("() => !/Loading scores/.test(document.querySelector('.lobby-rows')?.textContent || 'x')", 4.0)
        rows = await P.js("() => [...document.querySelectorAll('.lobby-rows li')].map(li => __audit.txt(li))")
        me = await P.js("() => __audit.txt(document.querySelector('.lobby-me'))")
        bad = any(re.search(r'couldn.t load|error', r, re.I) for r in rows) or not rows or any('Loading scores' in r for r in rows)
        e = A.add('lobby', f'{title}: tab “{name}”', 'ERROR' if bad else 'panel-update', kind='tab', where=via,
                  evidence=[f'rows: {rows[:3]}', f'me: {me}'], errors=obs['errors'], http=[f"{h['status']} {h['method']} {h['url']}" for h in obs['http']],
                  source=A.src.find('lobby-tabs'))
        if obs['errors'] or obs['http']:
            e['result'] = 'ERROR'
            e['ok'] = False
    obs = await P.observe(lambda: P.page.locator('.lobby-start').first.click(timeout=2000), timeout=6.0, settle=1.5,
                          until=lambda st, sig: not st.get('lobby') and not st.get('gameLoading') and st.get('game'))
    await asyncio.sleep(1.2)
    ok = await P.js("() => !!document.querySelector('.game-shell:not(.out)') && !document.querySelector('.game-loading:not([hidden])') && (document.querySelector('.game-root')?.childElementCount || 0) > 0")
    if ok:
        obs['sig'].setdefault('game', []).append('the game is running')
    e = A.record(P, 'lobby', f'{title}: Start ▸', obs, where=via, source=A.src.find('lobby-start'))
    if not ok and e['result'] != 'ERROR':
        e['result'] = 'DEAD'
        e['ok'] = False
        e['evidence'].insert(0, 'the game never showed up after Start')
    elif ok:
        if e['result'] not in ('ERROR',):
            e['result'] = 'game'
            e['ok'] = True
        e['evidence'].insert(0, 'the game is running')
    obs = await P.observe(lambda: P.page.locator('.game-quit').first.click(timeout=2000), timeout=1.5)
    e = A.record(P, 'lobby', f'{title}: Leave game ✕ (game screen)', obs, where=via, close_like=True, source=A.src.find("'game-quit'", prefer=('host.ts',)))
    if e['result'] in PROBLEMS:
        e['shot'] = await P.screenshot(f'{e["id"]}-{title}-quit')


async def audit_npc(A, P, room, info):
    """Click a city local like a player; then their card's buttons (all of them once, Visit for several homes)."""
    area = f'room:{room}'
    locals_ = [n for n in info['npcs'] if n['local']]
    if not locals_:
        return
    want = [n for n in locals_ if n['home'] not in A.homes_visited]
    order = (want or []) + [n for n in locals_ if n not in want]

    async def open_card(n):
        await P.reset(room=room)
        await P.js("n => { const a = clubNyc.world.npcs.find(x => x.name === n); if (a) { a.path = []; a.next = 60; a.onArrive = null } __audit.clearView(n) }", n['name'])
        await asyncio.sleep(0.1)
        prep = await P.js('n => __audit.prepPerson(n)', n['name'])
        if not prep.get('ok'):
            return None, prep
        await P.page.mouse.move(*prep['point'])
        await asyncio.sleep(0.06)
        return prep, await P.js('() => __audit.hoverLabel()')
    prep, n = None, None
    for cand in order[:4]:
        prep, lab = await open_card(cand)
        if prep:
            n = cand
            break
    if not prep:
        A.notes.append(f'{room}: couldn’t get a clear click on any city local (crowded); people were not audited here')
        return
    obs = await P.observe(lambda: P.page.mouse.click(*prep['point']), timeout=2.0)
    e = A.record(P, area, f'city local (click a person: {n["name"]})', obs, kind='person', where=room, repro=f"goto('{room}') → click a city local", source=A.src.find('export function npcCard'))
    if e['result'] != 'panel':
        return
    buttons = await P.js("() => [...document.querySelectorAll('.overlay.open .pc-actions button')].map(b => __audit.txt(b))")
    targets = buttons if not A.npc_card_done else [b for b in buttons if 'Visit' in b]
    A.npc_card_done = True
    for b in targets:
        is_visit = 'Visit' in b
        if is_visit and n['home'] in A.homes_visited and A.homes_visited[n['home']] >= 2:
            continue
        prep, lab = await open_card(n)
        if not prep:
            continue
        await P.page.mouse.click(*prep['point'])
        if not await P.wait("() => !!document.querySelector('.overlay.open .pc-actions')", 2.0):
            continue
        btn = P.page.locator('.overlay.open .pc-actions button', has_text=re.sub(r'^\W+', '', b)[:12]).first
        obs = await P.observe(lambda: btn.click(timeout=2000), timeout=3.0, settle=0.6)
        e = A.record(P, 'npc-card', f'{b}' + (f' (local living in a {n["home"]})' if is_visit else ''), obs, kind='button', where=f'{room}: {n["name"]}',
                     expect=('room', None) if is_visit else None, weak_ok=('local-speech',),
                     repro=f"goto('{room}') → click {n['name']} (city local) → {b}", source=A.src.find(re.sub(r'^\W+', '', b), prefer=('playerCard',)))
        if is_visit:
            A.homes_visited[n['home']] = A.homes_visited.get(n['home'], 0) + 1
            e['evidence'].append(f"{n['name']} lives in a {n['home']} (features/apartment.ts residentHome)")
            if e['result'] in PROBLEMS:
                e['shot'] = await P.screenshot(f'{e["id"]}-visit-{n["home"]}')
        await P.reset(room=room)


async def audit_ground_coin(A, P, room):
    pt = await P.js("""() => { const c = [...document.querySelectorAll('.scene .coin:not(.got)')][0]; if (!c) return null;
        const r = c.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const el = document.elementFromPoint(x, y); return el && c.contains(el) ? [x, y] : null }""")
    if not pt:
        return
    obs = await P.observe(lambda: P.page.mouse.click(pt[0], pt[1]), timeout=4.0, settle=0.5,
                          until=lambda st, sig: 'coins' in sig or 'fx' in sig)
    A.record(P, f'room:{room}', 'coin on the ground', obs, kind='coin', where=room, repro=f"goto('{room}') → click a coin on the ground", source=A.src.find('function scatterCoins'))


async def job_room(A, P, room):
    await P.reset()
    ok = await P.goto(room)
    if not ok:
        return A.add(f'room:{room}', f'visit {room}', 'FAILED', kind='room', where=room, evidence=['clubNyc.api.goto did not arrive'])
    info = await P.js('() => __audit.roomInfo()')
    A.add(f'room:{room}', f'room loads ({info["name"]})', 'room' if info['geo'] else 'ERROR', kind='room', where=room,
          evidence=[f"{len(info['hits'])} hotspots, {len(info['npcs'])} people"] + ([] if info['geo'] else ['no geo file']))
    for u in info['unplaced']:
        A.add(f'room:{room}', u['label'], 'UNPLACED', kind='hotspot', where=room, evidence=[f"“{u['id']}” is defined in rooms.ts but has no cutout/zone in geo/{room}.json, so it can never be clicked"],
              source=A.src.room_obj(room, u['id']))
    for h in info['hits']:
        try:
            await audit_hotspot(A, P, room, h)
        except Exception as e:
            A.add(f'room:{room}', h['label'] or h['id'], 'FAILED', kind='hotspot', where=room, evidence=[f'audit error: {str(e)[:200]}'])
            await P.recover()
    try:
        await P.reset(room=room)
        info = await P.js('() => __audit.roomInfo()')
        await audit_ground_coin(A, P, room)
        await audit_npc(A, P, room, info)
    except Exception as e:
        A.notes.append(f'{room}: people/coin audit error: {e}')


# ---------------------------------------------------------------- generic panel explorer

SELF_EXPLAINING = re.compile(r'^\W*(‹|›|prev|next|you live here|you’re here|you are here|request sent|requested|friends|★ friends|sent)\b', re.I)


async def explore(A, P, area, opener, *, root='.overlay.open', base_room='times-square', skip=None, recurse=None, depth=0, max_depth=1,
                  where='', limit=150, timeout=2.2, prefix='', expect_room=None, seen=None):
    """Open a panel with `opener`, then click every clickable thing in it like a player.

    Clicks happen in place while the panel stays the same panel; it's re-opened (fresh) whenever a click closed
    or replaced it. Elements are found again by their position, or by their text when the panel re-opened on
    another tab (Community and the furniture catalog remember their last tab)."""
    seen = seen if seen is not None else set()
    await P.reset(room=base_room)

    async def reopen():
        await P.reset(room=base_room)
        try:
            await opener()
        except Exception:
            return False
        await P.wait("() => !!document.querySelector('.overlay.open > *')", 2.5)
        await asyncio.sleep(0.25)
        return True
    if not await reopen():
        return A.add(area, f'{prefix}open', 'FAILED', where=where, evidence=['could not open the panel'])
    panel0 = await P.js('() => { const o = document.querySelector(".overlay.open"); return o && o.firstElementChild ? __audit.overlayInfo(o) : null }')
    items = await P.js('r => __audit.clickables(r)', root)
    if not items:
        A.notes.append(f'{area}{(" / " + prefix) if prefix else ""}: nothing clickable found in {root}')
    for it in items[:limit]:
        text = it['text'] or it['cls'] or it['tag']
        label = prefix + text
        key = (area, norm(it['text']), it['path'], it['disabled'])
        if key in seen:
            continue
        seen.add(key)
        src = A.src.find(it['text'] or '', prefer=(area.split(':')[0], where.split(' ')[0].lower()))
        why = skip(it) if skip else None
        if why:
            A.add(area, label, 'SKIPPED', where=where, evidence=[why] + ([f"href: {it['href']}"] if it['href'] else []), kind='link' if it['href'] else 'button')
            continue
        if it['href'] and (it['href'].startswith(('http', 'sms:', 'mailto:', 'tel:', '//')) and not it['href'].startswith(A.base)):
            A.add(area, label, 'SKIPPED', kind='link', where=where, evidence=[f"external link, not followed: {it['href'][:160]}"])
            continue
        if it['href'] and not it['href'].startswith('#') and not it['href'].startswith('javascript'):
            await check_link(A, area, label, it['href'], where)
            continue
        if it['disabled']:
            tip = it['title'] or ''
            if SOON.search(text + ' ' + tip):
                A.add(area, label, 'COMING-SOON', where=where, evidence=[f'disabled: “{text}”' + (f'; tooltip “{tip}”' if tip else '')], flags=['coming-soon'], source=src)
            elif tip or SELF_EXPLAINING.search(text):
                A.add(area, label, 'present', where=where, evidence=[f'disabled, and it says why: ' + (f'tooltip “{tip}”' if tip else f'“{text}”')], source=src)
            else:
                A.add(area, label, 'DISABLED', where=where, evidence=['disabled, no tooltip or text saying why'], flags=['no-explanation'], source=src)
            continue
        # find it again (the panel may have re-rendered or re-opened)
        tagged = await P.js('a => __audit.tag(a[0], a[1], a[2])', [root, it['path'], it['text']])
        if not tagged or (it['text'] and norm(tagged['text']) != norm(it['text'])):
            await reopen()
            tagged = await P.js('a => __audit.tag(a[0], a[1], a[2])', [root, it['path'], it['text']])
        if not tagged or (it['text'] and norm(tagged['text']) != norm(it['text']) and not (tagged.get('cls') == it['cls'] and norm(tagged['text']).split(' ')[:1] == norm(it['text']).split(' ')[:1])):
            A.add(area, label, 'FAILED', where=where, evidence=[f"could not find it again (found {tagged and tagged['text']!r})"])
            continue
        if tagged['text'] and it['text'] and norm(tagged['text']) != norm(it['text']):
            label = prefix + tagged['text']
        if it['tag'] == 'select':
            async def do():
                n = await P.page.locator('[data-audit="t"] option').count()
                cur = await P.page.locator('[data-audit="t"]').evaluate('e => e.selectedIndex')
                await P.page.locator('[data-audit="t"]').select_option(index=(cur + 1) % max(1, n))
        elif it['tag'] == 'input' and it['type'] in ('', 'text'):
            async def do():
                await P.page.locator('[data-audit="t"]').click(timeout=2000)
        else:
            async def do():
                await P.click_tagged()
        selected = bool(re.search(r'(^|\s)(on|active|selected)(\s|$)', it['cls'] or ''))
        obs = await P.observe(do, timeout=timeout, settle=0.45)
        is_input = it['tag'] in ('input',)
        e = A.record(P, area, label, obs, where=where, noop_ok=is_input or selected, close_like=bool(CLOSE_LIKE.search(it['text'] or '')) or it['text'] in ('Close', '✕', '×'),
                     repro=f'{where or area} → “{label}”', expect=('room', expect_room(it)) if expect_room and expect_room(it) else None, source=src)
        if selected and e['result'] == 'noop-expected':
            e['evidence'].insert(0, 'already selected')
        await note_shop(A, P)
        if e['_sig'].get('game'):
            await handle_lobby(A, P, area, label)
        if e['result'] in PROBLEMS:
            e['shot'] = await P.screenshot(f'{e["id"]}-{area}-{label}')
        if recurse and depth < max_depth and e['result'] in ('panel-update', 'panel') and recurse(it, e):
            async def deeper(it=it):
                await opener()
                await P.wait("() => !!document.querySelector('.overlay.open > *')", 2.5)
                await asyncio.sleep(0.25)
                ok = await P.js('a => __audit.tag(a[0], a[1], a[2])', [root, it['path'], it['text']])
                if ok:
                    await P.click_tagged()
                    await asyncio.sleep(0.45)
            await explore(A, P, area, deeper, root=root, base_room=base_room, skip=skip, recurse=recurse, depth=depth + 1, max_depth=max_depth,
                          where=where, limit=limit, timeout=timeout, prefix=prefix + (it['text'] or '')[:30] + ' › ', expect_room=expect_room, seen=seen)
            await reopen()
            continue
        # keep going in place if we're still looking at the same panel; otherwise start it fresh
        st = obs['after']
        ov = st.get('overlay') or {}
        bov = obs['before'].get('overlay') or {}
        same = panel0 and ov and ov.get('cls') == panel0.get('cls') and ov.get('sig') == bov.get('sig') and not st.get('lobby') and not st.get('game') and st.get('room') == obs['before'].get('room')
        if not same:
            await reopen()


async def check_link(A, area, label, href, where):
    path = href if href.startswith('/') else '/' + href
    status, body = A.http_get(path)
    spa = path.endswith('.html') and 'id="app"' in body and '/src/main.ts' in body
    ok = status == 200 and not spa
    A.add(area, label, 'link-ok' if ok else 'DEAD', kind='link', where=where, evidence=[f'GET {path} → {status}' + (' (fell back to the game page: the file is missing)' if spa else '')],
          source=A.src.find(href))


# ---------------------------------------------------------------- toolbar, menus, hotkeys

async def toolbar_click(P, label):
    await P.page.locator(f'.toolbar [aria-label="{label}"]').first.click(timeout=2500)


async def job_hud(A, P):
    area = 'hud'
    base = 'times-square'
    await P.reset(room=base)
    labels = await P.js("() => [...document.querySelectorAll('.toolbar .tb-btn')].map(b => b.getAttribute('aria-label'))")
    for lab in labels:
        await P.reset(room=base)
        obs = await P.observe(lambda lab=lab: toolbar_click(P, lab), timeout=3.0, settle=0.6)
        e = A.record(P, area, f'toolbar: {lab}', obs, kind='toolbar', where=base, repro=f'Times Square → toolbar “{lab}”', source=A.src.find(lab, prefer=('hud.ts',)))
        if e['result'] in PROBLEMS:
            e['shot'] = await P.screenshot(f'{e["id"]}-toolbar-{lab}')
        ov = obs['after'].get('overlay') or {}
        if 'pop-menu' in ov.get('cls', ''):
            for k, item in enumerate(ov.get('choices') or []):
                await P.reset(room=base)
                await toolbar_click(P, lab)
                await P.wait("() => !!document.querySelector('.overlay.open .pop-menu')", 2.0)
                btn = P.page.locator('.overlay.open .pop-menu > button').nth(k)
                obs2 = await P.observe(lambda btn=btn: btn.click(timeout=2000), timeout=2.6, settle=0.6)
                e2 = A.record(P, area, f'{lab} › {item}', obs2, kind='menu-item', where=base, repro=f'toolbar “{lab}” → “{item}”',
                              source=A.src.find(re.sub(r'\s*[A-Z?]$', '', item), prefer=('hud.ts',)))
                if 'Snowball' in item and 'mode' in e2['_sig']:
                    obs3 = await P.observe(lambda: P.page.mouse.click(620, 470), timeout=1.5)
                    A.record(P, area, f'{lab} › {item} › click to throw', obs3, kind='menu-item', where=base)
                if e2['result'] in PROBLEMS:
                    e2['shot'] = await P.screenshot(f'{e2["id"]}-menu-{item}')
        if lab == 'Sound on/off':  # turn it back on
            await P.reset()
            await toolbar_click(P, lab)
        if lab == 'My apartment':
            # at home the same button means "decorate"
            await P.reset()
            st = await P.state()
            if st['room'] in ('apartment', 'loft', 'penthouse'):
                obs = await P.observe(lambda: toolbar_click(P, lab), timeout=2.0)
                A.record(P, area, 'toolbar: My apartment (while at home)', obs, kind='toolbar', where=st['room'], repro='go home → toolbar “My apartment” again', source=A.src.find('My apartment', prefer=('hud.ts',)))
    # chat bar
    await P.reset(room=base)
    obs = await P.observe(lambda: P.page.locator('.chat-log-btn').click(), timeout=1.2)
    A.record(P, area, 'chat log button', obs, kind='chat', where=base, source=A.src.find("'chat-log-btn'"))
    await P.reset(room=base)
    await P.page.locator('.chat-input').click()
    await P.page.keyboard.type('hello from the click audit')
    obs = await P.observe(lambda: P.press('Enter'), timeout=1.5)
    A.record(P, area, 'chat: type + Enter', obs, kind='chat', where=base, source=A.src.find('Say something'))
    await P.reset(room=base)
    await P.page.locator('.chat-input').click()
    await P.page.keyboard.type('and the send button')
    obs = await P.observe(lambda: P.page.locator('.chat-send').click(), timeout=1.5)
    A.record(P, area, 'chat: send button', obs, kind='chat', where=base, source=A.src.find("'chat-send'"))
    await P.reset(room=base)
    obs = await P.observe(lambda: P.page.locator('.chat-send').click(), timeout=1.0)
    A.record(P, area, 'chat: send button with an empty box', obs, kind='chat', where=base, noop_ok=True, source=A.src.find("'chat-send'"))
    # HUD bits
    for sel, lab in (('.help-btn', '? (how to play)'), ('.online-pill', 'online pill'), ('.quests .q-head', 'quest box header'), ('.coin-plate', 'coin counter'), ('.place-plate', 'place name plate')):
        await P.reset(room=base)
        if not await P.page.locator(sel).count():
            A.add(area, lab, 'ABSENT', kind='hud', where=base, evidence=[f'{sel} not on screen'])
            continue
        clickable = await P.js("s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).pointerEvents !== 'none' && (e.tagName === 'BUTTON' || getComputedStyle(e).cursor === 'pointer') }", sel)
        if not clickable:
            A.add(area, lab, 'noop-expected', kind='hud', where=base, evidence=['not interactive (no pointer, clicks pass through)'])
            continue
        obs = await P.observe(lambda sel=sel: P.page.locator(sel).first.click(timeout=2000), timeout=2.5, settle=0.5)
        if sel == '.quests .q-head' and obs['before'].get('questsSig') != obs['after'].get('questsSig'):
            obs['sig'].setdefault('panel-update', []).append('quest box list opened/closed')
        A.record(P, area, lab, obs, kind='hud', where=base, source=A.src.find(sel.split(' ')[-1].lstrip('.'), prefer=('hud.ts', 'quests', 'dancejam', 'multiplayer')))
        if sel == '.quests .q-head':
            await P.page.locator(sel).first.click()
    # hotkeys advertised in tooltips and menus
    for key, what in (('m', 'Map'), ('u', 'Subway'), ('n', 'Newspaper'), ('f', 'Friends'), ('p', 'Player card'), ('b', 'Group photo'), ('i', 'Invite'),
                      ('?', 'How to play'), ('d', 'Dance'), ('w', 'Wave'), ('c', 'Cheer'), ('j', 'Jump'), ('s', 'Sit'), ('t', 'Snowball'), ('h', 'Home'), ('Enter', 'focus chat')):
        await P.reset(room=base)
        obs = await P.observe(lambda key=key: P.press(key), timeout=2.0, settle=0.5)
        if key == 'Enter':
            focused = await P.js("() => document.activeElement?.classList.contains('chat-input')")
            if focused:
                obs['sig'].setdefault('input', []).append('chat box focused')
        A.record(P, 'hotkeys', f'key {key} ({what})', obs, kind='hotkey', where=base, source=A.src.find(f"k === '{key}'", prefer=('hud.ts',)))


# ---------------------------------------------------------------- panels

def skip_destructive(it):
    t = it['text'] or ''
    if re.search(r'delete account|delete forever', t, re.I):
        return 'destructive: excluded on purpose'
    if re.search(r'^sign out$', t.strip(), re.I):
        return 'signs out: excluded on purpose'
    if re.search(r'^link (google|x|discord)', t.strip(), re.I) and not it['disabled']:
        return 'real third-party sign-in: excluded'
    return None


async def job_player_card(A, P):
    await explore(A, P, 'player-card', lambda: toolbar_click(P, 'Player card & wardrobe'), skip=skip_destructive,
                  recurse=lambda it, e: (it['text'] or '').strip() in ('Look', 'Account'), where='your player card')


async def job_books(A, P):
    await explore(A, P, 'stamp-book', lambda: toolbar_click(P, 'Stamp book'), where='stamp book')
    await explore(A, P, 'newspaper', lambda: toolbar_click(P, 'Club NYC Times'), where='newspaper',
                  recurse=lambda it, e: 'Next' in (it['text'] or ''), max_depth=5)


async def open_community(P, tab=None):
    await toolbar_click(P, 'Friends & leaderboards')
    await P.wait("() => !!document.querySelector('.overlay.open .community')", 2.0)
    if tab:
        await P.page.locator('.overlay.open .cm-tab', has_text=tab).first.click(timeout=2000)
        await asyncio.sleep(0.5)
        if tab == 'Leaderboards':
            # the panel remembers the last game: start from the first one each time
            await P.page.locator('.overlay.open .cm-chip').first.click(timeout=2000)
            await asyncio.sleep(0.5)


def skip_social(it):
    if re.search(r'add friend', it['text'] or '', re.I):
        return 'friend requests are covered by the social test (the people listed here are other audit players)'
    return None


async def job_community(A, P):
    tabs = []
    await P.reset()
    await open_community(P)
    tabs = await P.js("() => [...document.querySelectorAll('.overlay.open .cm-tab')].map(b => __audit.txt(b).replace(/\\s*\\d.*$/, ''))")
    await P.reset()
    seen = set()
    for t in tabs:
        name = re.sub(r'^\W+', '', t).strip()
        await explore(A, P, 'community', lambda name=name: open_community(P, name), where=f'Friends & leaderboards › {name}', prefix=f'{name} › ', skip=skip_social, timeout=3.0, seen=seen)


async def job_phone(A, P):
    async def invite():
        await toolbar_click(P, 'Phone: camera & invite friends')
        await P.page.locator('.overlay.open .pop-menu > button', has_text='Invite').first.click(timeout=2000)
        await P.wait("() => !!document.querySelector('.overlay.open .invite-panel')", 2.0)
    await explore(A, P, 'invite', invite, where='phone › Invite friends')
    # photo booth: take the photos, then the strip's buttons
    await P.reset()
    await toolbar_click(P, 'Phone: camera & invite friends')
    await P.page.locator('.overlay.open .pop-menu > button', has_text='Group photo').first.click(timeout=2000)
    await P.wait("() => !!document.querySelector('.overlay.open .photobooth')", 2.0)
    obs = await P.observe(lambda: P.page.locator('.overlay.open .photobooth .btn.go').first.click(timeout=2000), timeout=10.0, settle=10.0,
                          until=lambda st, sig: 'Your strip' in ((st.get('overlay') or {}).get('title') or ''))
    A.record(P, 'photo-booth', 'Take 4 photos', obs, where='phone › Group photo', source=A.src.find('Take 4 photos'))
    if await P.page.locator('.overlay.open .pb-strip').count():
        for txt in ('Save photo', 'Share', 'Done'):
            loc = P.page.locator('.overlay.open .pb-actions button', has_text=txt)
            if not await loc.count():
                continue
            obs = await P.observe(lambda loc=loc: loc.first.click(timeout=2000), timeout=2.5)
            A.record(P, 'photo-booth', f'strip: {txt}', obs, where='phone › Group photo', close_like=txt == 'Done', source=A.src.find(txt, prefer=('photobooth',)))
            if txt == 'Done':
                break


async def job_lobbies(A, P):
    """Every game's lobby from the community Leaderboards tab ("Play …"), and the lobby's generic buttons."""
    for _ in range(8):
        await P.reset()
        await open_community(P, 'Leaderboards')
        chips = P.page.locator('.overlay.open .cm-chip')
        todo = None
        for i in range(await chips.count()):
            game = re.sub(r'^\W+', '', (await chips.nth(i).inner_text()).strip()).strip()
            if game not in A.lobby_done and game not in A.lobby_tried:
                todo = (i, game)
                break
        if not todo:
            break
        A.lobby_tried.add(todo[1])
        await chips.nth(todo[0]).click()
        await asyncio.sleep(0.6)
        play = P.page.locator('.overlay.open .cm-foot .btn.go')
        if not await play.count():
            break
        obs = await P.observe(lambda: play.first.click(timeout=2000), timeout=3.0)
        e = A.record(P, 'community', f'Leaderboards › {todo[1]} › Play', obs, where='Friends & leaderboards', source=A.src.find('`Play ${g.title}`'))
        if e['_sig'].get('game'):
            await handle_lobby(A, P, 'community', f'Leaderboards › Play {todo[1]}')
    for _ in range(4):
        if all(A.lobby_btn.values()):
            break
        await P.reset()
        await open_community(P, 'Leaderboards')
        play = P.page.locator('.overlay.open .cm-foot .btn.go')
        if not await play.count():
            break
        await play.first.click()
        await P.wait("() => !!document.querySelector('.lobby')", 3.0)
        await handle_lobby(A, P, 'community', 'Leaderboards › Play')


# ---------------------------------------------------------------- map & subway

async def job_map(A, P):
    area = 'map'
    base = 'times-square'
    await P.reset(room=base)
    await toolbar_click(P, 'Map')
    await P.wait("() => !!document.querySelector('.overlay.open .postcard')", 2.0)
    shapes = await P.js('() => __audit.mapShapes()')
    for s in shapes:
        await P.reset(room=base)
        await toolbar_click(P, 'Map')
        await P.wait("() => !!document.querySelector('.overlay.open .postcard')", 2.0)
        await asyncio.sleep(0.2)
        cur = {x['id']: x for x in await P.js('() => __audit.mapShapes()')}.get(s['id'])
        if not cur or not cur.get('ok'):
            A.add(area, f'map pin {s["id"]}', 'UNREACHABLE', kind='map-pin', where='map', evidence=['no visible, uncovered pixel of this shape'], source=A.src.find(f"id: '{s['id']}'", prefer=('map.ts',)))
            continue
        tip, pt = None, None
        for p in cur['points']:
            await P.page.mouse.move(p[0], p[1])
            await asyncio.sleep(0.08)
            tip = await P.js('() => __audit.mapTip()')
            if tip:
                pt = p
                break
        if not pt:
            A.add(area, f'map pin {s["id"]}', 'UNREACHABLE', kind='map-pin', where='map', evidence=['hovering shows no label'], source=A.src.find(f"id: '{s['id']}'", prefer=('map.ts',)))
            continue
        obs = await P.observe(lambda: P.page.mouse.click(pt[0], pt[1]), timeout=2.6, settle=0.6)
        e = A.record(P, area, f'map: {tip}', obs, kind='map-pin', where='map', repro=f'Times Square → Map → click “{tip}”', source=A.src.find(f"id: '{s['id']}'", prefer=('map.ts',)))
        if e['result'] in ('CLOSED-ONLY',) and s['id'] in ('times-square',):
            e['evidence'].insert(0, 'this is where you already are: the map just closes, no message (the subway says “You’re already at this station. Even the express isn’t that fast.”)')
        for r in e['_sig'].get('room', []):
            A.rooms_seen.add(r)
        if e['result'] in PROBLEMS:
            e['shot'] = await P.screenshot(f'{e["id"]}-map-{tip}')
    # buttons on the postcard
    for sel, lab in (('.map-home', 'map: My Place'), ('.map-party', 'map: Halloween Parade')):
        await P.reset(room=base)
        await toolbar_click(P, 'Map')
        await P.wait("() => !!document.querySelector('.overlay.open .postcard')", 2.0)
        if not await P.page.locator(sel).count():
            continue
        obs = await P.observe(lambda sel=sel: P.page.locator(sel).first.click(timeout=2000), timeout=2.5, settle=0.5)
        A.record(P, area, lab, obs, kind='map-pin', where='map', expect=('room', None), source=A.src.find(sel.lstrip('.'), prefer=('map.ts',)))
    await P.reset(room=base)


async def job_subway(A, P):
    area = 'subway'
    await P.reset(room='times-square')

    async def open_board():
        await P.reset()
        await toolbar_click(P, 'Subway')
        await P.wait("() => !!document.querySelector('.overlay.open .subway-board')", 2.0)
        await asyncio.sleep(0.2)
    await open_board()
    stops = await P.js("() => [...document.querySelectorAll('.overlay.open .stop')].map((g, i) => ({ i, name: __audit.txt(g.querySelector('.stop-name')), sub: __audit.txt(g.querySelector('.stop-sub')), here: g.classList.contains('here') }))")
    labels = await P.js("""() => [...document.querySelectorAll('.overlay.open svg text')].filter(t => !t.closest('.stop')).map(t => {
        const cs = getComputedStyle(t); const r = t.getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return { text: __audit.txt(t), pointer: cs.cursor === 'pointer', hit: !!el && el.closest('.stop') !== null } }).filter(x => x.text)""")
    for t in labels:
        # decoration unless it looks or acts clickable
        if not (t['pointer'] or t['hit']):
            continue
        A.add(area, f'subway map label “{t["text"]}”', 'NOT-A-STOP', kind='label', where='subway map', evidence=['looks clickable on the subway map but is not a stop you can ride to'], source=A.src.find(t['text'].replace('🚧', '').strip(), prefer=('subway.ts',)))
    order = sorted(stops, key=lambda s: (not s['here'], s['i']))
    for s in order:
        try:
            await open_board()
            pt = await P.js("""i => { const g = document.querySelectorAll('.overlay.open .stop')[i]; const d = g && g.querySelector('.sw-dot'); if (!d) return null
                const r = d.getBoundingClientRect(); const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2)
                const el = document.elementFromPoint(x, y); return { x, y, inside: !!el && g.contains(el) } }""", s['i'])
            if not pt or not pt['inside']:
                A.add(area, f'stop: {s["name"]} ({s["sub"]})', 'UNREACHABLE', kind='station', where='subway map', evidence=['the stop’s dot is covered by something else'])
                continue
            await P.page.mouse.move(pt['x'], pt['y'])
            await asyncio.sleep(0.1)
            info = await P.js("() => __audit.txt(document.querySelector('.overlay.open .sw-info'))")
            obs = await P.observe(lambda pt=pt: P.page.mouse.click(pt['x'], pt['y']), timeout=6.5, settle=0.4,
                                  until=lambda st, sig: ('room' in sig and not st.get('ride')) or 'toast' in sig)
            e = A.record(P, area, f'stop: {s["name"]} ({s["sub"]})', obs, kind='station', where='subway map', repro=f'toolbar Subway → click “{s["name"]}”',
                         source=A.src.find(f"place: '{s['name']}'", prefer=('subway.ts',)) or A.src.find(s['sub'], prefer=('subway.ts',)))
            if info and s['name'] not in info:
                e['evidence'].append(f'hover info shows {info!r}')
            if s['here'] and e['result'] in OK_RESULTS:
                e['evidence'].insert(0, 'this is the station you are at')
            await P.wait("() => !document.querySelector('.ride-car')", 3.0)
        except Exception as ex:
            A.add(area, f'stop: {s["name"]} ({s["sub"]})', 'FAILED', kind='station', where='subway map', evidence=[f'audit error: {str(ex)[:160]}'])
    await P.reset(room='times-square')


# ---------------------------------------------------------------- shops

def parse_shops(src):
    lines = src.files.get('app/src/avatar/items.ts') or []
    text = '\n'.join(lines)
    m = re.search(r'export const SHOPS[^{]*\{(.*?)\n\}', text, re.S)
    return re.findall(r"^\s*'?([\w-]+)'?:\s*\{\s*name:\s*'([^']+)'", m.group(1), re.M) if m else []


async def job_shop(A, P, sid, name):
    async def opener():
        await P.js('s => clubNyc.api.catalog(s)', sid)
        await P.wait("() => !!document.querySelector('.overlay.open .catalog')", 2.0)
    await explore(A, P, f'shop:{sid}', opener, where=f'{name} catalog (opened with clubNyc.api.catalog)', timeout=2.6,
                  recurse=lambda it, e: 'next' in (it['cls'] or ''), max_depth=8)


# ---------------------------------------------------------------- the apartment, furniture, StreetCheesy, house party

async def apt_btn(P, text):
    """An apartment control by its word (Decorate, Catalog, Guestbook, Open house, Party, Listings) or index."""
    if isinstance(text, int):
        return await P.page.locator('.apt-controls .apt-btn').nth(text).click(timeout=2500)
    await P.page.locator('.apt-controls .apt-btn', has_text=text).first.click(timeout=2500)


async def job_home(A, P):
    area = 'home'
    await P.reset()
    obs = await P.observe(lambda: toolbar_click(P, 'My apartment'), timeout=3.0, settle=0.6)
    e = A.record(P, area, 'toolbar: My apartment (go home)', obs, kind='toolbar', where='times-square', expect=('room', 'apartment'), source=A.src.find('My apartment', prefer=('hud.ts',)))
    home = (await P.state())['room']
    if home not in ('apartment', 'loft', 'penthouse'):
        return
    btns = await P.js("() => [...document.querySelectorAll('.apt-controls .apt-btn')].map(b => ({ text: __audit.txt(b), title: b.title }))")
    for bi, b in enumerate(btns):
        t = b['text']
        await P.reset(room=home)
        obs = await P.observe(lambda bi=bi: apt_btn(P, bi), timeout=2.5, settle=0.5)
        e = A.record(P, area, f'apartment: {t} ({b["title"]})', obs, kind='button', where=home, repro=f'go home → “{t}”', source=A.src.find(b['title'], prefer=('apartment.ts',)))
        if 'Open house' in t:
            await P.reset(room=home)
            obs = await P.observe(lambda bi=bi: apt_btn(P, bi), timeout=2.0)
            A.record(P, area, 'apartment: Open house (toggle back)', obs, where=home, source=A.src.find('Let friends drop by', prefer=('apartment.ts',)))
    # decorate: the tray's items, catalog and Done
    await P.reset(room=home)
    await apt_btn(P, 'Decorate')
    await asyncio.sleep(0.4)
    tray = await P.js("() => [...document.querySelectorAll('.decor-tray .tray-item')].map(b => __audit.txt(b))")
    for t in tray[:4]:
        loc = P.page.locator('.decor-tray .tray-item').first
        obs = await P.observe(lambda loc=loc: loc.click(timeout=2000), timeout=1.5)
        A.record(P, area, f'decorate tray: {t}', obs, where=home, source=A.src.find('tray-item', prefer=('apartment.ts',)))
    for t in ('Furniture Catalog', 'Done'):
        if not await P.page.locator('.decor-tray .btn', has_text=t).count():
            continue
        obs = await P.observe(lambda t=t: P.page.locator('.decor-tray .btn', has_text=t).first.click(timeout=2000), timeout=2.0)
        A.record(P, area, f'decorate tray: {t}', obs, where=home, close_like=t == 'Done', source=A.src.find(t, prefer=('apartment.ts',)))
        await P.reset(room=home)
        if t == 'Furniture Catalog':
            await apt_btn(P, 'Decorate')
            await asyncio.sleep(0.3)
    # the furniture catalog: every tab and buy button
    async def furn_catalog():
        await apt_btn(P, 'Catalog')
        await P.wait("() => !!document.querySelector('.overlay.open .cat-tab')", 2.0)
        await P.page.locator('.overlay.open .cat-tab').first.click(timeout=2000)
        await asyncio.sleep(0.2)
    await explore(A, P, 'furniture-catalog', furn_catalog, base_room=home, where='apartment › Catalog', timeout=2.0)
    # place everything in storage, then click every piece of furniture in the room
    await P.reset(room=home)
    await apt_btn(P, 'Decorate')
    await asyncio.sleep(0.3)
    for _ in range(12):
        loc = P.page.locator('.decor-tray .tray-item')
        if not await loc.count():
            break
        await loc.first.click()
        await asyncio.sleep(0.12)
    await P.page.locator('.decor-tray .btn.go').first.click()
    await asyncio.sleep(0.6)
    pieces = await P.js("() => [...document.querySelectorAll('.furniture-layer .furniture')].map((f, i) => ({ i, name: f.alt, sittable: f.classList.contains('sittable') }))")
    for f in pieces:
        if not f['sittable']:
            A.add(area, f'furniture: {f["name"]}', 'noop-expected', kind='furniture', where=home, evidence=['decor only: no hover glow, clicks pass through it (not presented as clickable)'])
            continue
        await P.reset(room=home)
        pt = await P.js("""i => { const f = document.querySelectorAll('.furniture-layer .furniture')[i]; if (!f) return null; const r = f.getBoundingClientRect();
            for (const [fx, fy] of [[0.5, 0.55], [0.5, 0.4], [0.35, 0.6], [0.65, 0.6], [0.5, 0.75]]) { const x = r.left + r.width * fx, y = r.top + r.height * fy;
              const el = document.elementFromPoint(x, y); if (el === f) return [x, y] }
            return [r.left + r.width / 2, r.top + r.height / 2] }""", f['i'])
        if not pt:
            continue
        obs = await P.observe(lambda pt=pt: P.page.mouse.click(pt[0], pt[1]), timeout=2.2, settle=0.4)
        e = A.record(P, area, f'furniture: {f["name"]}', obs, kind='furniture', where=home, noop_ok=not f['sittable'], repro=f'go home → click the {f["name"]}', source=A.src.find(f["name"], prefer=('apartment.ts',)))
        if not f['sittable'] and e['result'] == 'noop-expected':
            e['evidence'].insert(0, 'decor only (no hover glow, nothing to do)')
        if e['_sig'].get('game'):
            await handle_lobby(A, P, area, f'furniture: {f["name"]}')
    # guestbook / likes / party / listings are covered above; the party panel's own buttons:
    await explore(A, P, 'house-party', lambda: apt_btn(P, 'Party'), base_room=home, where='apartment › Party', timeout=2.0,
                  skip=lambda it: 'start/stop is tested on its own' if 'Start the party' in (it['text'] or '') else None)
    await P.reset(room=home)
    await apt_btn(P, 'Party')
    await asyncio.sleep(0.4)
    obs = await P.observe(lambda: P.page.locator('.overlay.open .btn.go', has_text='Start the party').first.click(timeout=2000), timeout=3.0, settle=0.8)
    A.record(P, 'house-party', '🎉 Start the party', obs, where=home, source=A.src.find('Start the party'))
    if await P.page.locator('.party-chip').count():
        obs = await P.observe(lambda: P.page.locator('.party-chip').first.click(timeout=2000), timeout=2.0)
        A.record(P, 'house-party', 'party chip (DJ controls)', obs, where=home, source=A.src.find("'party-chip'"))
        for t in ('Invite with a link', 'Keep partying', 'End the party'):
            await P.reset(room=home)
            await P.page.locator('.party-chip').first.click()
            await asyncio.sleep(0.3)
            loc = P.page.locator('.overlay.open .btn', has_text=t)
            if not await loc.count():
                continue
            obs = await P.observe(lambda loc=loc: loc.first.click(timeout=2000), timeout=2.2, settle=0.6)
            A.record(P, 'house-party', f'DJ panel: {t}', obs, where=home, close_like=t == 'Keep partying', source=A.src.find(t, prefer=('houseparty',)))
    # StreetCheesy: buy every home you can, move in, and check the Home button still gets you there
    await streetcheesy(A, P)


async def open_listings(P):
    await P.reset()
    st = await P.state()
    if st['room'] in ('apartment', 'loft', 'penthouse'):
        await apt_btn(P, 'Listings')
    else:
        await P.reset(room='apartment')
        await apt_btn(P, 'Listings')
    await P.wait("() => !!document.querySelector('.overlay.open .streetcheesy')", 2.5)
    await asyncio.sleep(0.2)
    return await P.js("""() => [...document.querySelectorAll('.overlay.open .sc-card')].map((c, i) => ({ i, name: __audit.txt(c.querySelector('.sc-name')),
        btn: __audit.txt(c.querySelector('.btn')), disabled: !!c.querySelector('.btn')?.disabled }))""")


async def streetcheesy(A, P):
    """Every listing's button; buy each home; after every move, check the Home button and the map's My Place still get you home."""
    area = 'streetcheesy'
    cards = await open_listings(P)
    for c in cards:
        if c['disabled']:
            if SOON.search(c['btn']):
                A.add(area, f'{c["name"]}: {c["btn"]}', 'COMING-SOON', where='StreetCheesy', evidence=[f'disabled: “{c["btn"]}”'], flags=['coming-soon'], source=A.src.find(c['btn'], prefer=('streetcheesy',)))
            elif SELF_EXPLAINING.search(c['btn']):
                A.add(area, f'{c["name"]}: {c["btn"]}', 'present', where='StreetCheesy', evidence=[f'disabled, and it says why: “{c["btn"]}”'])
            else:
                A.add(area, f'{c["name"]}: {c["btn"]}', 'DISABLED', where='StreetCheesy', evidence=['disabled, no reason given'], flags=['no-explanation'], source=A.src.find(c['btn'], prefer=('streetcheesy',)))
    buyable = [c for c in cards if not c['disabled'] and c['btn'].startswith('Buy')]
    # "Keep looking" once (it should bring the listings back)
    if buyable:
        c = buyable[0]
        await open_listings(P)
        await P.page.locator('.overlay.open .sc-card').nth(c['i']).locator('.btn').click()
        await P.wait("() => !!document.querySelector('.overlay.open .choices')", 2.5)
        if await P.page.locator('.overlay.open .choices > button', has_text='Keep looking').count():
            obs = await P.observe(lambda: P.page.locator('.overlay.open .choices > button', has_text='Keep looking').first.click(timeout=2000), timeout=2.0)
            A.record(P, area, f'{c["name"]}: Keep looking', obs, where='StreetCheesy', source=A.src.find('Keep looking', prefer=('streetcheesy',)))
    for c in buyable:
        cards = await open_listings(P)
        cur = next((x for x in cards if x['name'] == c['name']), None)
        if not cur or cur['disabled']:
            continue
        btn = P.page.locator('.overlay.open .sc-card').nth(cur['i']).locator('.btn')
        obs = await P.observe(lambda btn=btn: btn.click(timeout=2000), timeout=3.0, settle=0.5)
        e = A.record(P, area, f'{c["name"]}: {cur["btn"]}', obs, where='StreetCheesy', source=A.src.find('Buy for', prefer=('streetcheesy',)))
        if e['result'] != 'choice':
            continue
        sign = P.page.locator('.overlay.open .choices > button', has_text='Sign the papers')
        obs = await P.observe(lambda: sign.first.click(timeout=2000), timeout=4.0, settle=1.6)
        e = A.record(P, area, f'{c["name"]}: Sign the papers ✍️', obs, where='StreetCheesy', expect=('room', None), repro=f'StreetCheesy → {cur["btn"]} → Sign the papers',
                     source=A.src.grep(r'export function moveIn', prefer=('streetcheesy',)))
        await asyncio.sleep(1.0)
        await check_home_button(A, P, f'buying the {c["name"]}')
        # move back into the walk-up (proves "Move in" works, and resets the home for the next purchase)
        cards = await open_listings(P)
        walk = next((x for x in cards if 'Move in' in x['btn']), None)
        if walk:
            btn = P.page.locator('.overlay.open .sc-card').nth(walk['i']).locator('.btn')
            obs = await P.observe(lambda btn=btn: btn.click(timeout=2000), timeout=3.0, settle=1.4)
            A.record(P, area, f'{walk["name"]}: {walk["btn"]}', obs, where='StreetCheesy', expect=('room', None), source=A.src.find('Move in', prefer=('streetcheesy',)))
            await asyncio.sleep(0.8)
            await check_home_button(A, P, f'moving into the {walk["name"]}')
    await P.reset()
    if (await P.js('() => clubNyc.save.home')) != 'walkup':
        A.notes.append('StreetCheesy: could not move back to the walk-up through the UI; reset save.home to walkup for the rest of the run')
        await P.js("() => { clubNyc.save.home = 'walkup' }")


async def check_home_button(A, P, how):
    await P.reset()
    await P.goto('soho')
    obs = await P.observe(lambda: toolbar_click(P, 'My apartment'), timeout=3.0, settle=0.6)
    A.record(P, 'streetcheesy', f'after {how}: toolbar “My apartment”', obs, kind='toolbar', where='soho', expect=('room', None),
             repro=f'StreetCheesy → {how} → go anywhere → toolbar “My apartment”', source=A.src.find('export function goHome', prefer=('apartment.ts',)))
    await P.reset(room='chinatown')
    await toolbar_click(P, 'Map')
    await P.wait("() => !!document.querySelector('.overlay.open .postcard')", 2.0)
    if await P.page.locator('.map-home').count():
        obs = await P.observe(lambda: P.page.locator('.map-home').first.click(timeout=2000), timeout=3.0)
        A.record(P, 'streetcheesy', f'after {how}: map “My Place”', obs, kind='map-pin', where='chinatown', expect=('room', None),
                 repro=f'StreetCheesy → {how} → open the map → “My Place”', source=A.src.find('My Place', prefer=('map.ts',)))


# ---------------------------------------------------------------- onboarding extras: Rosa's tour, the quest box

async def audit_tour(A, P, how='after sign-up'):
    """Click Next through every card; flag cards whose spotlight target is missing or off screen."""
    area = 'tour'
    ok = await P.wait("() => !!document.querySelector('.tour:not(.out) .tour-card')", 7.0)
    if not ok:
        A.add(area, f'Rosa’s tour ({how})', 'ABSENT', kind='tour', evidence=['no .tour card appeared (this build may not have the tour)'])
        return
    A.tour_present = True
    seen_back = False
    titles = []
    for n in range(30):
        await asyncio.sleep(0.45)
        card = await P.js("""() => { const t = document.querySelector('.tour:not(.out)'); if (!t) return null; const hole = t.querySelector('.tour-hole'); const card = t.querySelector('.tour-card');
            const hs = hole ? hole.style : {}; const cr = card.getBoundingClientRect();
            return { title: __audit.txt(card.querySelector('b')), text: __audit.txt(card.querySelector('p')), center: t.classList.contains('tour-center'), tryIt: t.classList.contains('tour-try'),
              hole: hole && hs.width ? [parseFloat(hs.left), parseFloat(hs.top), parseFloat(hs.width), parseFloat(hs.height)] : null,
              card: [cr.left, cr.top, cr.width, cr.height], dots: card.querySelectorAll('.tour-dots i').length,
              buttons: [...card.querySelectorAll('.tour-btns button')].map(b => ({ cls: b.className, text: __audit.txt(b) })) } }""")
        if not card:
            break
        titles.append(card['title'])
        idx = len(titles)
        first_or_last = idx == 1 or not any('tour-back' in b['cls'] for b in card['buttons']) and idx > 1
        problems = []
        if card['center'] and not first_or_last:
            problems.append('spotlight target missing (card shown centred)')
        if card['hole']:
            x, y, w, h = card['hole']
            if w <= 0 or h <= 0 or x + w < 0 or y + h < 0 or x > 1000 or y > 565:
                problems.append(f'spotlight off screen at {[round(v) for v in card["hole"]]}')
        cx, cy, cw, ch = card['card']
        if cx < -2 or cy < -2 or cx + cw > 1002 or cy + ch > 567:
            problems.append(f'card partly off screen at {[round(v) for v in card["card"]]}')
        A.add(area, f'tour card {idx}: {card["title"]}', 'MISSING-TARGET' if problems else 'tour', kind='tour-card', where=how,
              evidence=problems + [f"buttons: {', '.join(b['text'] for b in card['buttons'])}", f"spotlight: {[round(v) for v in card['hole']] if card['hole'] else 'none (centred card)'}"],
              source=A.src.find(card['title'][:30], prefer=('tour.ts',)))
        # Back once (card 3 → card 2), then Next again
        if not seen_back and any('tour-back' in b['cls'] for b in card['buttons']) and idx >= 3:
            seen_back = True
            obs = await P.observe(lambda: P.page.locator('.tour .tour-back').first.click(timeout=2000), timeout=1.5, settle=0.5)
            A.record(P, area, f'tour card {idx}: Back', obs, kind='tour-button', where=how, source=A.src.find('tour-back', prefer=('tour.ts',)))
            titles.pop()
            await asyncio.sleep(0.45)
            titles.pop() if titles else None
            continue
        nxt = P.page.locator('.tour .tour-next').first
        label = next((b['text'] for b in card['buttons'] if 'tour-next' in b['cls']), 'Next')
        obs = await P.observe(lambda: nxt.click(timeout=2000), timeout=1.5, settle=0.5)
        e = A.record(P, area, f'tour card {idx}: {label}', obs, kind='tour-button', where=how, close_like=True, source=A.src.find('tour-next', prefer=('tour.ts',)))
    A.tour_titles = titles
    expected = len(re.findall(r'^\s{6}title: ', '\n'.join(A.src.files.get('app/src/features/tour.ts') or []), re.M))
    if expected:
        A.notes.append(f'Rosa’s tour showed {len(set(titles))} cards; tour.ts defines {expected} (steps whose target isn’t on screen are dropped silently).')


async def audit_tour_replays(A, P):
    area = 'tour'
    await P.reset(room='times-square')
    if await P.page.locator('.help-btn').count():
        obs = await P.observe(lambda: P.page.locator('.help-btn').first.click(timeout=2000), timeout=2.0)
        A.record(P, area, '? button (replay the tour)', obs, kind='hud', where='times-square', source=A.src.find("'help-btn'"))
        obs = await P.observe(lambda: P.press('Escape'), timeout=1.2)
        A.record(P, area, 'Escape during the tour', obs, kind='hotkey', where='times-square', close_like=True)
    await P.reset(room='times-square')
    await toolbar_click(P, 'Phone: camera & invite friends')
    loc = P.page.locator('.overlay.open .pop-menu > button', has_text='How to play')
    if await loc.count():
        obs = await P.observe(lambda: loc.first.click(timeout=2000), timeout=2.0)
        A.record(P, area, 'phone › How to play', obs, kind='menu-item', where='times-square', source=A.src.find('How to play', prefer=('hud.ts',)))
        if await P.page.locator('.tour .tour-skip').count():
            obs = await P.observe(lambda: P.page.locator('.tour .tour-skip').first.click(timeout=2000), timeout=1.2)
            A.record(P, area, 'tour: Skip', obs, kind='tour-button', where='times-square', close_like=True)
    await P.reset()


QUEST_IDS = ['walk', 'gift', 'friend', 'job', 'subway']


async def audit_quests(A, P, room):
    """Make each first-day quest current and press its “Show me” (and “Take me there”, if offered)."""
    area = 'quests'
    for i, q in enumerate(QUEST_IDS):
        await P.reset(room=room)
        await P.js("a => { const s = clubNyc.save; s.quests = {}; a.forEach(id => s.quests[id] = Date.now()) }", QUEST_IDS[:i])
        # re-render the box (opening and closing its header re-draws it)
        await P.page.locator('.quests .q-head').first.click()
        await asyncio.sleep(0.1)
        await P.page.locator('.quests .q-head').first.click()
        await asyncio.sleep(0.15)
        if not await P.page.locator('.quests .q-show').count():
            A.add(area, f'quest “{q}”: Show me', 'ABSENT', kind='quest', where=room, evidence=['no “Show me” button (quest already done or box in daily mode)'])
            continue
        cur = await P.js("() => __audit.txt(document.querySelector('.quests .q-now b'))")
        obs = await P.observe(lambda: P.page.locator('.quests .q-show').first.click(timeout=2000), timeout=2.0, settle=0.6)
        e = A.record(P, area, f'Show me: {cur} (in {room})', obs, kind='quest', where=room, repro=f"make “{q}” the current quest (save.quests) in {room} → Show me", source=A.src.find(f"case '{q}'", prefer=('quests.ts',)))
        card = await P.js("""() => { const t = document.querySelector('.tour:not(.out)'); if (!t) return null; const hole = t.querySelector('.tour-hole');
            return { center: t.classList.contains('tour-center'), act: __audit.txt(t.querySelector('.tour-act')), hole: hole && hole.style.width ? [parseFloat(hole.style.left), parseFloat(hole.style.top), parseFloat(hole.style.width), parseFloat(hole.style.height)] : null } }""")
        if card:
            e['evidence'].append(f"spotlight: {'none (centred card)' if card['center'] else [round(v) for v in card['hole'] or []]}")
            if card['hole']:
                x, y, w, h = card['hole']
                if w <= 0 or h <= 0 or x > 1000 or y > 565 or x + w < 0 or y + h < 0:
                    e['result'] = 'MISSING-TARGET'
                    e['ok'] = False
                    e['evidence'].insert(0, 'spotlight off screen')
            if card['act']:
                obs2 = await P.observe(lambda: P.page.locator('.tour .tour-act').first.click(timeout=2000), timeout=3.0, settle=0.6)
                A.record(P, area, f'Show me: {cur} → {card["act"]}', obs2, kind='quest', where=room, expect=('room', None), source=A.src.find(card['act'], prefer=('quests.ts',)))
            else:
                obs2 = await P.observe(lambda: P.page.locator('.tour .tour-next').first.click(timeout=2000), timeout=1.2)
                A.record(P, area, f'Show me: {cur} → Got it', obs2, kind='quest', where=room, close_like=True)
    await P.js('() => { clubNyc.save.quests = {} }')
    await P.reset()


# ---------------------------------------------------------------- social: A and B

async def find_remote(P, name, timeout=8.0):
    return await P.wait('n => [...clubNyc.mp.players.values()].some(a => a.name === n)', timeout, name)


async def open_card_of(A, P, other, label, *, record=True):
    """A real click on another player's avatar (falls back to clubNyc.card if someone stands in front)."""
    await P.reset()
    await find_remote(P, other)
    await P.js('n => __audit.clearView(n)', other)
    await asyncio.sleep(0.15)
    prep = await P.js('n => __audit.prepPerson(n)', other)
    if prep.get('ok'):
        await P.page.mouse.move(*prep['point'])
        await asyncio.sleep(0.06)
        do = lambda: P.page.mouse.click(*prep['point'])
    else:
        do = lambda: P.js(f"n => clubNyc.card([...clubNyc.mp.players.values()].find(a => a.name === n))", other)
    obs = await P.observe(do, timeout=2.5, settle=0.9, until=lambda st, sig: bool(st.get('overlay')) and 'pc-' in str(st.get('overlay')))
    await P.wait("() => document.querySelectorAll('.overlay.open .pc-actions button').length > 1", 4.0)
    if record:
        A.record(P, 'social', label, obs, kind='person', where=(await P.state())['room'], source=A.src.find('export function remoteCard', prefer=('playerCard',)))
    return await P.js("() => [...document.querySelectorAll('.overlay.open .pc-actions button, .overlay.open .pc-safety button')].map(b => ({ text: __audit.txt(b), disabled: b.disabled }))")


async def card_button(A, P, other, text, label, **kw):
    await open_card_of(A, P, other, '', record=False)
    loc = P.page.locator('.overlay.open .pc-actions button, .overlay.open .pc-safety button', has_text=text)
    if not await loc.count():
        return None
    obs = await P.observe(lambda: loc.first.click(timeout=2000), timeout=kw.pop('timeout', 3.0), settle=kw.pop('settle', 0.8))
    return A.record(P, 'social', label, obs, where=(await P.state())['room'], **kw)


def social_case(A, case, outcome, detail):
    A.social.append({'case': case, 'outcome': outcome, 'detail': detail})
    log(f'   social: {case} → {outcome}  {detail[:140]}')


async def community_friend_button(P, friend, which):
    """Open Friends & leaderboards → Friends and return the friend's row button locator (Go / 🏠)."""
    await P.reset()
    await toolbar_click(P, 'Friends & leaderboards')
    await P.wait("() => !!document.querySelector('.overlay.open .community')", 2.0)
    await P.page.locator('.overlay.open .cm-tab', has_text='Friends').first.click(timeout=2000)
    await P.wait('n => [...document.querySelectorAll(".overlay.open .cm-row b")].some(b => b.textContent === n)', 4.0, friend)
    row = P.page.locator('.overlay.open .cm-row', has=P.page.locator('b', has_text=friend)).first
    if which == '🏠':
        return row, row.locator('button[title^="Visit"]').first
    return row, row.locator('button', has_text=which).first


async def job_social(A, PA, PB):
    na, nb = PA.name, PB.name
    srcs = A.src
    # both in SoHo, not friends yet
    await PA.reset(room='soho')
    await PB.reset(room='soho')
    await find_remote(PA, nb, 10)
    btns = await open_card_of(A, PA, nb, f'click another real player ({nb}) — not friends')
    names = [b['text'] for b in btns]
    has_visit = any('Visit' in t for t in names)
    social_case(A, 'Visit a non-friend’s apartment from their card (open house off)', 'no button' if not has_visit else 'button shown',
                f'card buttons: {names}' + ('' if has_visit else ' — there is no Visit button and nothing says why (friends or open house only)'))
    if not has_visit:
        A.add('social', 'non-friend card: 🏠 Visit their place', 'ABSENT', kind='button', where='soho', evidence=['not offered unless you’re friends or they have open house on; the card doesn’t say so'], source=srcs.find('Visit their place', prefer=('playerCard',)))
    if not any(re.search(r'message|chat|whisper|dm', t, re.I) for t in names):
        A.add('social', 'player card: Message', 'ABSENT', kind='button', where='soho', evidence=[f'no way to message a player from their card (buttons: {names})'], source=srcs.find('export function remoteCard', prefer=('playerCard',)))
    await card_button(A, PA, nb, 'Wave', 'remote card: 👋 Wave', source=srcs.find('👋 Wave', prefer=('playerCard',)))
    e = await card_button(A, PA, nb, 'Mute', 'remote card: 🔇 Mute', source=srcs.find('Mute', prefer=('playerCard',)))
    await card_button(A, PA, nb, 'Unmute', 'remote card: 🔈 Unmute', source=srcs.find('Unmute', prefer=('playerCard',)))
    e = await card_button(A, PA, nb, 'Report', 'remote card: 🚩 Report (dialog opens)', source=srcs.find('🚩 Report', prefer=('playerCard',)))
    if e and e['result'] == 'choice':
        obs = await PA.observe(lambda: PA.page.locator('.overlay.open .x-btn').first.click(timeout=2000), timeout=1.2)
        A.record(PA, 'social', 'report dialog: ✕ (cancel)', obs, where='soho', close_like=True)
    e = await card_button(A, PA, nb, 'Block', 'remote card: 🚫 Block (dialog opens)', source=srcs.find('🚫 Block', prefer=('playerCard',)))
    if e and e['result'] == 'choice':
        obs = await PA.observe(lambda: PA.page.locator('.overlay.open .choices > button', has_text='Cancel').first.click(timeout=2000), timeout=1.2)
        A.record(PA, 'social', 'block dialog: Cancel', obs, where='soho', close_like=True)
    # the API path party invites use, while B is not a friend and has no open house
    obs = await PA.observe(lambda: PA.js('id => clubNyc.visit(id)', PB.user_id), timeout=2.5)
    e = A.record(PA, 'social', 'visit a non-friend’s apartment (clubNyc.visit, open house off)', obs, where='soho', kind='api-path', source=srcs.find('door is closed', prefer=('apartment',)))
    social_case(A, 'Visit a non-friend’s apartment, door closed (API path)', e['result'], '; '.join(e['evidence'][:2]))
    # B turns open house on at home, comes back; A's card for B should now offer the visit
    await PB.reset(room='apartment')
    await PB.page.locator('.apt-controls .apt-btn', has_text='Open house').first.click()
    await asyncio.sleep(4.5)  # the cloud save goes out ~3 s after a change
    await PB.reset(room='soho')
    await find_remote(PA, nb, 10)
    btns = await open_card_of(A, PA, nb, '', record=False)
    if any('Visit' in b['text'] for b in btns):
        await PA.reset()
        e = await card_button(A, PA, nb, 'Visit', 'non-friend card with open house on: 🏠 Visit their place', expect=('room', 'apartment'), source=srcs.find('Visit their place', prefer=('playerCard',)))
        plate = (await PA.state())['plate']
        social_case(A, 'Visit a non-friend’s apartment from their card (open house on)', e['result'] if e else 'no button', f'plate: {plate}')
    else:
        social_case(A, 'Visit a non-friend’s apartment from their card (open house on)', 'no button', f'card buttons: {[b["text"] for b in btns]} (open house may not have reached the server)')
    await PB.reset(room='apartment')
    await PB.page.locator('.apt-controls .apt-btn', has_text='Open house').first.click()
    # friend request A → B, B accepts from the notice
    await PA.reset(room='soho')
    await PB.reset(room='soho')
    await find_remote(PA, nb, 10)
    e = await card_button(A, PA, nb, 'Add Friend', 'remote card: ➕ Add Friend', source=srcs.find('➕ Add Friend', prefer=('playerCard',)))
    got = await PB.wait("() => [...document.querySelectorAll('.notice')].some(n => /wants to be friends/.test(n.textContent))", 6.0)
    if got:
        acc = PB.page.locator('.notice', has_text='wants to be friends').locator('.notice-btn', has_text='Accept').first
        obs = await PB.observe(lambda: acc.click(timeout=2000), timeout=2.5, settle=0.8)
        e = A.record(PB, 'social', 'friend request notice: Accept', obs, where='soho', source=srcs.find('wants to be friends', prefer=('multiplayer',)))
        told = await PA.wait("() => [...document.querySelectorAll('.toast')].some(t => /accepted your friend request/.test(t.textContent))", 5.0)
        social_case(A, 'Friend request (card → notice → Accept)', 'works' if told else 'accepted, but A was not told', f'B accept → {e["result"]}')
    else:
        social_case(A, 'Friend request (card → notice → Accept)', 'B never got the request notice', 'no “wants to be friends” notice within 6 s')
        await PB.js('id => fetch("/api/friends/" + id + "/accept", { method: "POST" })', PA.user_id)
    await asyncio.sleep(1.0)
    btns = await open_card_of(A, PA, nb, 'click a friend (B)')
    social_case(A, 'Friend’s card', 'ok', f'buttons: {[b["text"] + (" (disabled)" if b["disabled"] else "") for b in btns]}')
    for b in btns:
        if b['disabled']:
            A.add('social', f'friend card: {b["text"]}', 'present', where='soho', evidence=['a disabled status label (shows the relationship)'], source=srcs.find(re.sub(r'^\W+', '', b['text']), prefer=('playerCard',)))
    # Go to a friend who is online (B in Chinatown, A in SoHo)
    await PB.reset(room='chinatown')
    await asyncio.sleep(1.2)
    row, go = await community_friend_button(PA, nb, 'Go')
    obs = await PA.observe(lambda: go.click(timeout=2000), timeout=3.5, settle=0.8)
    e = A.record(PA, 'social', 'Friends tab: Go (friend online in Chinatown)', obs, where='soho', expect=('room', 'chinatown'), source=srcs.find("f.online && f.room === world.room.id ? 'Find' : 'Go'", prefer=('community',)))
    sees = await find_remote(PA, nb, 5)
    social_case(A, '“Go” to a friend who is online', e['result'] + ('' if sees else ' (but B is not visible)'), '; '.join(e['evidence'][:3]))
    row, go = await community_friend_button(PA, nb, 'Find')
    if await go.count():
        obs = await PA.observe(lambda: go.click(timeout=2000), timeout=2.0)
        e = A.record(PA, 'social', 'Friends tab: Find (friend in the same room)', obs, where='chinatown', source=srcs.find('is right here', prefer=('multiplayer',)))
        social_case(A, '“Find” a friend in the same room', e['result'], '; '.join(e['evidence'][:2]))
    # visit a friend's apartment while they're home
    await PB.reset()
    await PB.page.locator('.toolbar [aria-label="My apartment"]').click()
    await PB.wait("() => clubNyc.world.room.id === 'apartment'", 4.0)
    await PA.reset(room='soho')
    await asyncio.sleep(1.0)
    row, home = await community_friend_button(PA, nb, '🏠')
    obs = await PA.observe(lambda: home.click(timeout=2000), timeout=3.5, settle=1.0)
    e = A.record(PA, 'social', 'Friends tab: 🏠 (friend at home)', obs, where='soho', expect=('room', 'apartment'), source=srcs.find('Visit ${f.name}’s apartment', prefer=('community',)))
    sees = await find_remote(PA, nb, 5)
    plate = (await PA.state())['plate']
    social_case(A, 'Visit a friend’s apartment while they’re home', e['result'] + (' — B is there' if sees else ' — but B is not visible'), f'plate: {plate}')
    # the friend row's Go while they're home (goToFriend → visitPlayerApartment)
    await PA.reset(room='soho')
    row, go = await community_friend_button(PA, nb, 'Go')
    obs = await PA.observe(lambda: go.click(timeout=2000), timeout=3.5, settle=1.0)
    e = A.record(PA, 'social', 'Friends tab: Go (friend at home)', obs, where='soho', expect=('room', 'apartment'), source=srcs.find('isHomeRoom(f.room)', prefer=('multiplayer',)))
    social_case(A, '“Go” to a friend who is at home', e['result'], f"plate: {(await PA.state())['plate']}")
    # house party: B starts one, A gets the invite and joins
    await PA.reset(room='soho')
    await PB.reset(room='apartment')
    await PB.page.locator('.apt-controls .apt-btn', has_text='Party').first.click()
    await asyncio.sleep(0.4)
    obs = await PB.observe(lambda: PB.page.locator('.overlay.open .btn.go', has_text='Start the party').first.click(timeout=2000), timeout=2.5, settle=0.8)
    A.record(PB, 'social', 'B: 🎉 Start the party (friends)', obs, where='apartment', source=srcs.find('Start the party'))
    got = await PA.wait("() => [...document.querySelectorAll('.notice')].some(n => /throwing a party/.test(__audit.txt(n)))", 6.0)
    if got:
        go = PA.page.locator('.notice', has_text='throwing a party').locator('.notice-btn', has_text='Go').first
        obs = await PA.observe(lambda: go.click(timeout=2000), timeout=3.5, settle=1.2)
        e = A.record(PA, 'social', 'party invite notice: Go', obs, where='soho', expect=('room', 'apartment'), source=srcs.find('is throwing a party', prefer=('houseparty',)))
        chip = await PA.wait("() => !!document.querySelector('.party-chip')", 4.0)
        social_case(A, 'Join a friend’s house party (invite notice → Go)', e['result'] + (' — party is on' if chip else ' — but no party on A’s screen'), '; '.join(e['evidence'][:2]))
    else:
        social_case(A, 'Join a friend’s house party (invite notice → Go)', 'NO INVITE', 'A never got the party notice within 6 s')
    # B ends the party
    if await PB.page.locator('.party-chip').count():
        await PB.reset()
        await PB.page.locator('.party-chip').first.click()
        await asyncio.sleep(0.3)
        if await PB.page.locator('.overlay.open .btn', has_text='End the party').count():
            await PB.page.locator('.overlay.open .btn', has_text='End the party').first.click()
    # visit a friend's apartment while they're out
    await PB.reset(room='times-square')
    await PA.reset(room='soho')
    await asyncio.sleep(1.2)
    row, home = await community_friend_button(PA, nb, '🏠')
    obs = await PA.observe(lambda: home.click(timeout=2000), timeout=3.5, settle=1.0)
    e = A.record(PA, 'social', 'Friends tab: 🏠 (friend out in Times Square)', obs, where='soho', expect=('room', 'apartment'))
    social_case(A, 'Visit a friend’s apartment while they’re out', e['result'], f"plate: {(await PA.state())['plate']}")
    # chat: B says something; A clicks B's name in the chat log
    await PA.reset(room='times-square')
    await asyncio.sleep(1.0)
    await PB.page.locator('.chat-input').click()
    await PB.page.keyboard.type('hi from B')
    await PB.press('Enter')
    await PA.wait("() => [...document.querySelectorAll('.chat-line b')].some(b => b.onclick)", 4.0)
    await PA.page.locator('.chat-log-btn').click()
    await asyncio.sleep(0.3)
    nm = PA.page.locator('.chat-log .chat-line b', has_text=nb).last
    if await nm.count():
        obs = await PA.observe(lambda: nm.click(timeout=2000), timeout=2.5, settle=0.8)
        e = A.record(PA, 'social', 'chat log: click a player’s name', obs, where='times-square', source=srcs.find("row.querySelector('b')!.onclick", prefer=('chat.ts',)))
    # Go to a friend who is offline: B closes the game
    await PB.page.close()
    await asyncio.sleep(9.5)  # the server waits 8 s before telling friends someone left
    await PA.reset(room='soho')
    row, go = await community_friend_button(PA, nb, 'Go')
    rowtext = await row.evaluate('r => __audit.txt(r)') if await row.count() else ''
    disabled = await go.is_disabled() if await go.count() else None
    title = await go.get_attribute('title') if await go.count() else None
    explained = bool(re.search(r'offline', rowtext, re.I))
    A.add('social', 'Friends tab: Go (friend offline)', 'present' if explained else 'DISABLED', where='soho', evidence=[f'Go is disabled; the row says: {rowtext}', f'tooltip={title!r}'],
          flags=[] if explained else ['no-explanation'], source=srcs.find('go.disabled = !f.online', prefer=('community',)))
    social_case(A, '“Go” to a friend who is offline', ('disabled button' if disabled else 'enabled — says they’re offline when clicked') + (' with “💤 Offline” in the row' if 'Offline' in rowtext else ''), f'row: {rowtext}; tooltip: {title!r}')
    row, home = await community_friend_button(PA, nb, '🏠')
    obs = await PA.observe(lambda: home.click(timeout=2000), timeout=3.5, settle=1.0)
    e = A.record(PA, 'social', 'Friends tab: 🏠 (friend offline)', obs, where='soho', expect=('room', 'apartment'))
    social_case(A, 'Visit a friend’s apartment while they’re offline', e['result'], f"plate: {(await PA.state())['plate']}")
    # B comes back: A gets "B is online" with a Go button
    await PA.reset(room='soho')
    await PA.js('() => { clubNyc.save.notifyOff = false }')
    PB.page = await PB.ctx.new_page()
    PB._hook(PB.page)
    await PB.page.goto(A.base + '/play?desktop', wait_until='domcontentloaded')
    await PB.page.wait_for_selector('.online-pill.on', timeout=15000)
    await PB.js('() => __audit.attach()')
    got = await PA.wait("() => [...document.querySelectorAll('.notice')].some(n => /is online/.test(__audit.txt(n)))", 8.0)
    if got:
        go = PA.page.locator('.notice', has_text='is online').locator('.notice-btn', has_text='Go').first
        obs = await PA.observe(lambda: go.click(timeout=2000), timeout=3.5, settle=1.0)
        e = A.record(PA, 'social', '“friend is online” notice: Go', obs, where='soho', expect=('room', None), source=srcs.find('is online${', prefer=('multiplayer',)))
        social_case(A, 'Friend comes online → notice → Go', e['result'], '; '.join(e['evidence'][:2]))
    else:
        social_case(A, 'Friend comes online → notice → Go', 'NO NOTICE', 'no “is online” notice within 8 s')
    # actually block (then undo through the API: there is no unblock button in the game)
    await PB.reset(room='soho')
    await PA.reset(room='soho')
    await find_remote(PA, nb, 8)
    await open_card_of(A, PA, nb, '', record=False)
    loc = PA.page.locator('.overlay.open .pc-safety button', has_text='Block')
    if await loc.count():
        await loc.first.click()
        await PA.wait("() => !!document.querySelector('.overlay.open .choices')", 2.0)
        obs = await PA.observe(lambda: PA.page.locator('.overlay.open .choices > button', has_text='Block').first.click(timeout=2000), timeout=2.5, settle=0.8)
        e = A.record(PA, 'social', 'block dialog: Block (for real)', obs, where='soho', source=srcs.find('Blocked <b>', prefer=('multiplayer',)))
        gone = not await find_remote(PA, nb, 1.0)
        social_case(A, 'Block a player', e['result'] + (' — they disappear' if gone else ' — but they are still visible'), '; '.join(e['evidence'][:2]))
        unblock = srcs.grep(r'[Uu]nblock')
        if not unblock:
            A.add('social', 'Unblock someone', 'ABSENT', kind='button', where='anywhere', evidence=['there is no unblock button anywhere in the game (only DELETE /api/blocks/:id exists)'], source=srcs.grep(r"/blocks", prefer=('multiplayer',)))
        await PA.js('id => fetch("/api/blocks/" + id, { method: "DELETE" })', PB.user_id)


async def job_invites(A, PB_name, PA):
    """/join/<name> links: an existing name, a missing one, garbage, and an existing player following one."""
    area = 'invite-link'
    # an existing name: the sign-in screen says who invited you, and you land next to them as friends
    C = await Player(A, 'C', 'AudC_' + A.tag).open()
    try:
        await C.page.goto(A.base + f'/join/{PB_name}?desktop', wait_until='domcontentloaded')
        await C.page.wait_for_selector('.si-live.busy, .si-live.quiet', timeout=15000)
        shown = await C.wait("() => !document.querySelector('.si-invite')?.hidden", 4.0)
        box = await C.js("() => __audit.txt(document.querySelector('.si-invite'))")
        play = await C.js("() => __audit.txt(document.querySelector('.si-play'))")
        url = await C.js('() => location.pathname')
        A.add(area, f'/join/{PB_name} (existing player)', 'present' if shown else 'DEAD', kind='link', where='sign-in screen', evidence=[f'invite box: {box!r}', f'Play button: {play!r}', f'address bar: {url}'], source=A.src.find('invited you to Club NYC', prefer=('signin',)))
        C.name = 'AudC_' + A.tag
        # continue the sign-up from the invite page
        await signup_from_here(C)
        await asyncio.sleep(3.0)
        toasts = await C.js("() => __audit.log.filter(e => e.kind === 'toast').map(e => e.text)")
        st = await C.state()
        friends = await C.js('() => [...clubNyc.mp.friends.values()].map(f => f.name)')
        social_case(A, 'Follow an invite link for an existing name', f"landed in {st['room']}" + (f", friends with {friends}" if friends else ', not friends yet'),
                    f"toasts: {[t for t in toasts if 'invite' in t.lower() or PB_name in t or 'friend' in t.lower()][:3]}")
    finally:
        await C.close()
    # a name nobody has
    D = await Player(A, 'D', 'AudD_' + A.tag).open()
    try:
        ghost = 'Ghost_' + A.tag[-5:]  # a valid-looking name (2–14 letters) that nobody has
        await D.page.goto(A.base + '/join/' + ghost + '?desktop', wait_until='domcontentloaded')
        await D.page.wait_for_selector('.si-live.busy, .si-live.quiet', timeout=15000)
        await asyncio.sleep(1.5)
        hidden = await D.js("() => !!document.querySelector('.si-invite')?.hidden")
        boxtxt = await D.js("() => __audit.txt(document.querySelector('.si-invite'))")
        play = await D.js("() => __audit.txt(document.querySelector('.si-play'))")
        http = [f"{h['status']} {h['method']} {h['url']}" for _, h in D.net]
        await signup_from_here(D)
        await asyncio.sleep(2.5)
        toasts = [t for t in await D.js("() => __audit.log.filter(e => e.kind === 'toast' || e.kind === 'notice').map(e => e.text)") if not AMBIENT.search(t)]
        told_box = not hidden and bool(re.search(r'couldn.t find|not found|no new yorker|mistyped', boxtxt or '', re.I))
        told = told_box or any(re.search(r'invite|couldn|not found|no one|nobody', t, re.I) for t in toasts)
        A.add(area, f'/join/{ghost} (a name nobody has)', 'present' if told else 'DEAD', kind='link', where='sign-in screen',
              evidence=[f'sign-in screen invite box: {boxtxt!r}' if not hidden else 'sign-in screen: no invite box', f'Play button: {play!r}', f'requests: {http[:3]}', f'after sign-up, messages: {toasts[:4]}'] +
                       ([] if told else ['nothing tells the visitor the invite link is broken']),
              flags=[] if told else ['silent'], source=A.src.find('invited you to Club NYC', prefer=('signin',)))
        social_case(A, 'Follow an invite link for a non-existent name', 'told on the sign-in screen' if told_box else 'told' if told else 'silent',
                    (f'sign-in box: {boxtxt!r}; ' if not hidden else '') + f'{http[:2]}; messages after sign-up: {toasts[:3]}')
    finally:
        await D.close()
    # garbage
    for g in ('', '!!!', 'x', 'ThisNameIsWayTooLong_123', '%F0%9F%8D%95', 'a%20b', '<script>', 'Bob/extra', '..%2F..%2Fapi%2Fme'):
        E = await Player(A, 'E', 'AudE').open()
        try:
            resp = await E.page.goto(A.base + '/join/' + g + '?desktop', wait_until='domcontentloaded')
            ok = await E.wait("() => !!document.querySelector('.signin .si-play, .online-pill')", 10.0)
            url = await E.js('() => location.pathname')
            box = await E.js("() => document.querySelector('.si-invite') ? !document.querySelector('.si-invite').hidden : null")
            errs = [m for _, m in E.errs]
            http = [f"{h['status']} {h['url']}" for _, h in E.net]
            res = 'present' if ok and not errs else 'ERROR' if errs else 'DEAD'
            A.add(area, f'/join/{g}', res, kind='link', where='front door', evidence=[f'page status {resp.status if resp else "?"}; game booted: {ok}; address bar: {url}; invite box shown: {box}'],
                  errors=errs[:3], http=http[:3], source=A.src.find('captureInvite', prefer=('invite.ts',)))
            social_case(A, f'Open /join/{g or "(empty)"}', 'loads the front door' if ok else 'broken', f'address bar stays {url}' + (f'; errors {errs[:1]}' if errs else ''))
        finally:
            await E.close()
    # an existing player follows a friend's link (A's own context, in a second tab, then closed)
    pg = await PA.ctx.new_page()
    PA._hook(pg)
    try:
        await pg.goto(A.base + f'/join/{PB_name}?desktop', wait_until='domcontentloaded')
        ok = await pg.wait_for_selector('.online-pill.on', timeout=15000)
        await asyncio.sleep(2.0)
        msgs = await pg.evaluate("() => __audit.log.filter(e => e.kind === 'toast' || e.kind === 'notice').map(e => e.text)")
        rel = [m for m in msgs if re.search(r'invite|friend|' + re.escape(PB_name), m, re.I)]
        social_case(A, 'An existing player opens a friend’s invite link', 'nothing happens' if not rel else 'told', f'messages: {msgs[:4]}')
        A.add(area, f'/join/{PB_name} while already signed in', 'DEAD' if not rel else 'present', kind='link', where='returning player',
              evidence=['the game opens normally; the invite is ignored (stays in localStorage for a week) and nothing is said'] if not rel else rel, flags=['silent'] if not rel else [],
              source=A.src.find('pendingInvite', prefer=('session',)))
    finally:
        await pg.close()


async def signup_from_here(P):
    pg = P.page
    await pg.click('.si-play')
    await pg.wait_for_selector('.creator-card', timeout=15000)
    nxt = '.creator-actions .btn.go'
    await pg.select_option('.cr-month', '6'); await pg.select_option('.cr-year', '2000'); await pg.click('.cr-age input')
    await pg.click(nxt)
    await asyncio.sleep(0.25)
    await pg.click(nxt)
    await asyncio.sleep(0.25)
    await pg.locator('.le-row').last.locator('.le-opt').nth(1).click()
    await pg.click(nxt)
    await pg.wait_for_selector('.creator-name input')
    await pg.fill('.creator-name input', P.name)
    await pg.wait_for_selector('.cr-avail.ok', timeout=8000)
    await pg.click(nxt)
    await pg.wait_for_selector('.team-card')
    await pg.locator('.team-card').nth(1).click()
    await pg.click(nxt)
    await pg.wait_for_selector('.metrocard-id', timeout=15000)
    await asyncio.sleep(0.3)
    await pg.click('.creator-actions .btn.go')
    await pg.wait_for_selector('.online-pill.on', timeout=15000)
    await P.js('() => __audit.attach()')
    try:
        await pg.wait_for_selector('.tour .tour-skip', timeout=7000)
        await pg.click('.tour .tour-skip')
    except Exception:
        pass


# ---------------------------------------------------------------- the report

def diagnose(A):
    """Point problems at their likely cause, not just where the button's label is written."""
    rooms_file = A.src.files.get('app/src/data/rooms.ts') or []
    for e in A.entries:
        if e['result'] not in PROBLEMS:
            continue
        ev = ' '.join(e['evidence'] + e['errors'])
        m = re.search(r"called goto\('([\w-]+)'\)", ev)
        if m:
            room = m.group(1)
            has_room = any(re.match(r"^  '?" + re.escape(room) + r"'?: \{", l) for l in rooms_file)
            bits = []
            if not has_room:
                bits.append(f"no '{room}' room in ROOMS (app/src/data/rooms.ts); the {room} art exists in app/public/art/rooms/{room}.jpg")
            bits.append(A.src.grep(r'if \(!next \|\| changing\) return', prefer=('world.ts',)) + ' (goto ignores unknown rooms silently)')
            if room in ('loft', 'penthouse'):
                bits.append(A.src.grep(r'api\.goto\(HOME\[save\.home\]', prefer=('apartment.ts',)) + ' (goHome)')
                bits.append(A.src.grep(r'api\.goto\(residentHome\(r\)\)', prefer=('apartment.ts',)) + ' (visitApartment)')
            e['source'] = '; '.join(b for b in bits if b and not b.startswith(' '))
        if 'That apartment doesn’t exist' in ev:
            e['source'] = '; '.join(x for x in (A.src.grep(r'That apartment doesn’t exist', prefer=('realtime.ts',)) + ' (refuses owners that aren’t real users)',
                                                A.src.grep(r'`npc-\$\{owner\.r\.id\}`', prefer=('apartment.ts',)) + ' (city locals’ homes are joined as npc-<id>)') if x)
        m = re.search(r'<(\w+) class="([\w -]+)">', ev)
        if e['result'] == 'BLOCKED' and m:
            cls = m.group(2).split(' ')[0]
            hit = A.src.grep(r'^\.' + re.escape(cls) + r'\b')
            quit_rule = A.src.grep(r'^\.game-quit \{') if 'quit' in e['label'].lower() or 'Leave game' in e['label'] else ''
            e['source'] = '; '.join(x for x in (hit and f'{hit} (.{cls} covers it)', quit_rule and f'{quit_rule} (the ✕)') if x) or e['source']


def write_outputs(A, partial):
    os.makedirs(OUT, exist_ok=True)
    try:
        diagnose(A)
    except Exception as ex:
        A.notes.append(f'diagnosis pass failed: {ex}')
    for e in A.entries:
        e.pop('_sig', None)
    by_area = {}
    for e in A.entries:
        a = e['area'].split(':')[0] if e['area'].startswith('room:') else e['area']
        d = by_area.setdefault(a, {})
        d[e['result']] = d.get(e['result'], 0) + 1
    problems = [e for e in A.entries if e['result'] in PROBLEMS]
    deadish = [e for e in A.entries if e['result'] in DEADISH or (e['ok'] and set(e['flags']) & {'coming-soon', 'silent-server-refusal', 'mostly-hidden', 'error-message'})]
    data = {'generated': time.strftime('%Y-%m-%d %H:%M:%S'), 'duration_s': round(now() - A.t0), 'snapshot': A.stack.snapshot if A.stack else None,
            'partial': partial, 'counts': {'interactions': len(A.entries), 'problems': len(problems), 'dead_ish': len(deadish)}, 'by_area': by_area,
            'social': A.social, 'notes': A.notes, 'server_refusals': A.refusals, 'rooms': A.room_ids, 'rooms_reached': sorted(A.rooms_seen), 'shops_seen': sorted(A.shops_seen), 'entries': A.entries}
    with open(JSON_OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=1, ensure_ascii=False)
    md = render_md(A, data, problems, deadish)
    os.makedirs(os.path.dirname(MD_OUT), exist_ok=True)
    with open(MD_OUT, 'w', encoding='utf-8') as f:
        f.write(md)
    return data


def esc(s):
    return str(s or '').replace('|', '\\|').replace('\n', ' ')


def render_md(A, data, problems, deadish):
    snap = data.get('snapshot') or {}
    L = []
    L.append('# Click audit')
    L.append('')
    L.append(f"Generated {data['generated']} by `tools/click_audit.py` in {data['duration_s'] // 60} min {data['duration_s'] % 60} s"
             + (f" on a frozen copy of the code taken {snap.get('taken')} (newest source change {snap.get('newest_source_change')})." if snap else '.')
             + (' **Partial run** (' + data['partial'] + ').' if data['partial'] else ''))
    L.append('Re-run: `.venv/bin/python tools/click_audit.py` (add `--rooms soho,pizza` or `--only rooms,hud` to narrow it). Raw results: `tools/out/click-audit.json`; screenshots of problems: `tools/out/click-audit/`.')
    L.append('')
    L.append('## Summary')
    L.append('')
    c = data['counts']
    L.append(f"- **{c['interactions']}** interactions checked, **{c['problems']}** problems (dead, broken or unreachable), **{c['dead_ish']}** dead-ish (coming soon, sound only, disabled without a reason, places you can't go).")
    errs = [e for e in problems if e['result'] == 'ERROR']
    dead = [e for e in problems if e['result'] != 'ERROR']
    L.append(f"- {len(dead)} DEAD/unreachable/wrong and {len(errs)} ERROR items are listed below with how to reproduce them and the suspected code (line numbers are from the snapshot).")
    silent = [s for s in A.social if re.search(r'\b(silent|nothing happens|NO INVITE|NO NOTICE|DEAD|no button|not told|broken)\b|— but', s['outcome'])]
    if silent:
        L.append(f"- Social edge cases that fail silently or need a message: " + '; '.join(f"{s['case']} ({s['outcome']})" for s in silent) + '.')
    for n in A.notes:
        L.append(f'- Note: {n}')
    L.append('')
    L.append('## DEAD and ERROR items')
    L.append('')
    if not problems:
        L.append('None found.')
    else:
        L.append('| # | Where | What | Result | What happened | How to reproduce | Suspected code |')
        L.append('|---|---|---|---|---|---|---|')
        for e in sorted(problems, key=lambda e: (e['result'] != 'ERROR', e['area'], e['id'])):
            what = '; '.join(e['evidence'][:3])
            if e['errors']:
                what += ' — errors: ' + '; '.join(e['errors'][:2])
            if e['http']:
                what += ' — HTTP: ' + '; '.join(e['http'][:3])
            L.append(f"| {e['id']} | {esc(e['area'])} | {esc(e['label'])} | {e['result']}{' (' + ', '.join(e['flags']) + ')' if e['flags'] else ''} | {esc(what)[:400]} | {esc(e['repro'] or e['where'])} | {esc(e['source'])} |")
    L.append('')
    L.append('## Dead-ish')
    L.append('')
    if not deadish:
        L.append('None.')
    else:
        L.append('| # | Where | What | Why it counts | Evidence | Code |')
        L.append('|---|---|---|---|---|---|')
        for e in sorted(deadish, key=lambda e: (e['result'], e['area'])):
            why = {'SOUND-ONLY': 'only plays a sound', 'CLOSED-ONLY': 'only closes the panel', 'DISABLED': 'disabled' + (' with no explanation' if 'no-explanation' in e['flags'] else ''),
                   'UNPLACED': 'defined but never drawn', 'COMING-SOON': 'coming soon / under construction', 'ABSENT': 'missing', 'NOT-A-STOP': 'on the subway map, not a stop',
                   'NO-SHOP': 'shop nobody can reach'}.get(e['result']) or '; '.join({'coming-soon': 'coming soon / under construction', 'mostly-hidden': 'mostly hidden (only a sliver is clickable)',
                   'silent-server-refusal': 'the server refused it and nobody said so', 'error-message': 'works, but shows an error-sounding message'}.get(f, f) for f in e['flags'])
            L.append(f"| {e['id']} | {esc(e['area'])} | {esc(e['label'])} | {esc(why)} | {esc('; '.join(e['evidence'][:2]))[:260]} | {esc(e['source'])} |")
    L.append('')
    if A.refusals:
        L.append('## The server said no (and the game didn’t say anything)')
        L.append('')
        L.append('Calls that came back `ok: false` with no message shown to the player. Each happens in the background of some other click; the coins or item the screen showed may quietly disappear later.')
        L.append('')
        L.append('| Endpoint | Sent | Error | Times |')
        L.append('|---|---|---|---|')
        agg = {}
        for r in A.refusals:
            k = (r['path'], r.get('sent', ''), r['error'])
            agg[k] = agg.get(k, 0) + 1
        for (path, sent, err), n in sorted(agg.items(), key=lambda kv: -kv[1]):
            L.append(f'| `{esc(path)}` | {esc(sent)} | {esc(err)} | {n} |')
        L.append('')
    L.append('## Social edge cases')
    L.append('')
    L.append('| Case | Outcome | Detail |')
    L.append('|---|---|---|')
    for s in A.social:
        L.append(f"| {esc(s['case'])} | {esc(s['outcome'])} | {esc(s['detail'])[:300]} |")
    L.append('')
    L.append('## Everything that worked (counts per area)')
    L.append('')
    L.append('| Area | Results |')
    L.append('|---|---|')
    for area, d in sorted(data['by_area'].items()):
        oks = {k: v for k, v in d.items() if k in OK_RESULTS}
        L.append(f"| {area} | {', '.join(f'{k} {v}' for k, v in sorted(oks.items(), key=lambda kv: -kv[1]))} |")
    L.append('')
    L.append('Result classes: `panel` opened a panel, `panel-update` changed the open panel, `choice` a choice menu, `toast`/`notice` a message, `speech` the player spoke, `local-speech` a city local spoke, `room` changed room, `game` a mini-game or its lobby, `ride` subway/ferry/carriage scene, `sit`/`emote`/`look` the avatar reacted, `fx` an effect, `toggle` a control changed state, `tour` a tour card, `download`, `popup`, `closed` a close button closed its panel, `noop-expected` (focusing a text box). Problems: `DEAD` nothing visible, `ERROR` page/console error or HTTP 4xx/5xx, `BLOCKED` covered so a player can’t click it, `UNREACHABLE` hotspot nobody can hover/click, `WRONG` went somewhere else, `MISSING-TARGET` a tour/“Show me” spotlight with nothing to point at, `FAILED` the audit couldn’t complete the step.')
    L.append('')
    L.append('Excluded on purpose: Delete account, Sign out, real Google/X/Discord sign-in, external share links (recorded, not opened). Workers were given coins through the private server’s moderator API so every purchase could be tried.')
    L.append('')
    return '\n'.join(L)


# ---------------------------------------------------------------- main

async def run(A, args):
    only = set(args.only.split(',')) if args.only else set(PHASES)
    rooms_filter = [r.strip() for r in args.rooms.split(',')] if args.rooms else None
    A.tag = format(int(time.time()) % 1000000, 'x')
    if os.path.isdir(SHOTS):
        for f in os.listdir(SHOTS):
            if f.endswith('.png'):
                os.remove(os.path.join(SHOTS, f))
    async with async_playwright() as pw:
        A.browser = await pw.chromium.launch(headless=True, args=['--autoplay-policy=no-user-gesture-required', '--mute-audio'])
        # player A: onboarding audit (creator, tour, quests), later the social tests
        PA = await Player(A, 'A', 'AudA_' + A.tag).open()
        A.players.append(PA)
        rec_creator = 'onboarding' in only
        await PA.signup(team=0, audit=A if rec_creator else None, tour='audit' if rec_creator else 'skip')
        if rec_creator:
            await audit_tour(A, PA)
            await PA.reset()
        A.room_ids = await room_list(A, PA)
        log(f'rooms in ROOMS: {len(A.room_ids)}')
        # workers for the parallel phases
        nworkers = max(1, args.workers)
        workers = []

        async def mk_worker(i):
            W = await Player(A, f'W{i}', f'AudW{i}_{A.tag}').open()
            await W.signup(team=i)
            await W.js('() => { clubNyc.save.notifyOff = true }')
            try:
                A.admin(f'/users/{W.user_id}/coins', {'amount': 30000, 'reason': 'click audit'})
            except Exception as e:
                A.notes.append(f'could not give worker coins: {e}')
            await asyncio.sleep(0.5)
            await W.reset()
            return W
        jobs = []
        rooms = [r for r in A.room_ids if not rooms_filter or r in rooms_filter]
        heavy = {'central-park': 3, 'pizza': 3, 'coffee': 3, 'rockefeller': 3, 'times-square': 3, 'maison-malle': 2, 'battery-park': 3, 'fifth-ave': 2, 'subway': 2, 'iloveny': 2, 'thread': 2, 'soho': 2}
        if 'rooms' in only:
            for r in sorted(rooms, key=lambda r: -heavy.get(r, 1)):
                jobs.append((heavy.get(r, 1) * 60, f'room {r}', lambda W, r=r: job_room(A, W, r)))
        if 'hud' in only:
            jobs.append((150, 'hud', lambda W: job_hud(A, W)))
        if 'panels' in only:
            jobs.append((90, 'player card', lambda W: job_player_card(A, W)))
            jobs.append((60, 'stamp book + newspaper', lambda W: job_books(A, W)))
            jobs.append((120, 'community', lambda W: job_community(A, W)))
            jobs.append((60, 'phone (invite, photo booth)', lambda W: job_phone(A, W)))
            jobs.append((90, 'job lobbies', lambda W: job_lobbies(A, W)))
        if 'map' in only:
            jobs.append((90, 'map', lambda W: job_map(A, W)))
        if 'subway' in only:
            jobs.append((80, 'subway', lambda W: job_subway(A, W)))
        if 'shops' in only:
            for sid, name in parse_shops(A.src):
                jobs.append((45, f'shop {sid}', lambda W, sid=sid, name=name: job_shop(A, W, sid, name)))
        if 'home' in only:
            jobs.append((160, 'home', lambda W: job_home(A, W)))
        jobs.sort(key=lambda j: -j[0])
        queue = asyncio.Queue()
        for j in jobs:
            queue.put_nowait(j)

        async def worker_loop(i):
            if queue.empty():
                return
            W = await mk_worker(i)
            workers.append(W)
            while not queue.empty():
                if now() - A.t0 > args.max_minutes * 60:
                    A.notes.append('time limit reached: some jobs were skipped')
                    break
                cost, name, fn = queue.get_nowait()
                t = now()
                log(f'{W.tag}: {name} …')
                try:
                    await asyncio.wait_for(fn(W), timeout=max(240, cost * 4))
                except asyncio.TimeoutError:
                    A.notes.append(f'{name}: took too long and was stopped')
                    await W.recover()
                except Exception as e:
                    A.notes.append(f'{name}: audit error {type(e).__name__}: {str(e)[:200]}')
                    traceback.print_exc()
                    await W.recover()
                log(f'{W.tag}: {name} done in {now() - t:.0f}s')

        async def player_a_track():
            if rec_creator:
                await audit_quests(A, PA, 'times-square')
                await PA.goto('apartment')
                await audit_quests(A, PA, 'apartment')
                await audit_tour_replays(A, PA)
            if 'social' in only or 'invites' in only:
                PB = await Player(A, 'B', 'AudB_' + A.tag).open()
                A.players.append(PB)
                await PB.signup(team=3)
                try:
                    if 'social' in only:
                        await asyncio.wait_for(job_social(A, PA, PB), timeout=420)
                except Exception as e:
                    A.notes.append(f'social: audit error {type(e).__name__}: {str(e)[:200]}')
                    traceback.print_exc()
                try:
                    if 'invites' in only:
                        try:
                            await PB.page.goto(A.base + '/play?desktop', wait_until='domcontentloaded')
                            await PB.page.wait_for_selector('.online-pill.on', timeout=15000)
                        except Exception:
                            pass
                        await asyncio.wait_for(job_invites(A, PB.name, PA), timeout=300)
                except Exception as e:
                    A.notes.append(f'invites: audit error {type(e).__name__}: {str(e)[:200]}')
                    traceback.print_exc()

        await asyncio.gather(player_a_track(), *[worker_loop(i + 1) for i in range(nworkers)])
        # rooms no click ever led to (in a full run), shops nobody can open
        if 'rooms' in only and not rooms_filter and {'map', 'subway'} <= only:
            for r in A.room_ids:
                if r not in A.rooms_seen and r != 'times-square':
                    A.add('rooms', f'room “{r}”', 'ABSENT', kind='room', where='whole city', evidence=['no exit, map pin, subway stop or button the audit clicked leads here (only reachable some other way, or not at all)'],
                          source=A.src.room_obj(r, ''))
        if 'rooms' in only and 'shops' in only and not rooms_filter:
            for sid, name in parse_shops(A.src):
                if sid not in A.shops_seen:
                    A.add('shops', f'{name} ({sid})', 'NO-SHOP', kind='shop', where='every room', evidence=['no hotspot in any room opens this shop’s catalog, so its items can’t be bought'], source=A.src.find(f"{sid}: {{ name:", prefer=('items.ts',)) or A.src.find(name, prefer=('items.ts',)))
        await A.browser.close()


async def room_list(A, P):
    """Room ids: from the frozen rooms.ts (the game doesn't expose ROOMS)."""
    lines = A.src.files.get('app/src/data/rooms.ts') or []
    ids = []
    inside = False
    for l in lines:
        if l.startswith('export const ROOMS'):
            inside = True
            continue
        if inside:
            m = re.match(r"^  '?([a-z0-9-]+)'?: \{", l)
            if m:
                ids.append(m.group(1))
            if l.startswith('}'):
                break
    return ids


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--rooms', help='comma-separated room ids to audit (default: every room)')
    ap.add_argument('--only', help='comma-separated phases: ' + ','.join(PHASES))
    ap.add_argument('--workers', type=int, default=3)
    ap.add_argument('--max-minutes', type=float, default=25)
    ap.add_argument('--keep-log', action='store_true', help='copy the private server + Vite log to tools/out/click-audit-stack.log')
    ap.add_argument('--verbose', action='store_true')
    args = ap.parse_args()
    A = Audit(args)
    stack = PrivateStack(frozen=True, env={'ADMIN_TOKEN': A.admin_token}, prefix='clubnyc-audit-')
    A.stack = stack

    def bail(signum, frame):
        raise KeyboardInterrupt()
    signal.signal(signal.SIGTERM, bail)
    partial = ','.join(x for x in (f'rooms={args.rooms}' if args.rooms else '', f'only={args.only}' if args.only else '') if x)
    try:
        A.base = stack.start()
        A.src = Sources(stack.app_dir)
        log(f'private frozen stack: {A.base} (game server :{stack.game}); snapshot {stack.snapshot}')
        asyncio.run(run(A, args))
    except KeyboardInterrupt:
        A.notes.append('interrupted')
        partial = (partial + ',' if partial else '') + 'interrupted'
    finally:
        try:
            if getattr(A, 'src', None) is None:
                A.src = Sources(stack.app_dir)
            data = write_outputs(A, partial)
            log(f"wrote {os.path.relpath(JSON_OUT, ROOT)} and {os.path.relpath(MD_OUT, ROOT)}: {data['counts']}")
        except Exception:
            traceback.print_exc()
        stack.stop(keep_log_to=os.path.join(OUT, 'click-audit-stack.log') if args.keep_log else None)
        log('stopped the private stack and removed the frozen copy')


if __name__ == '__main__':
    main()
