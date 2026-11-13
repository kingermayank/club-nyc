"""City Sim: persona agents play Club NYC together in one private city.

    .venv/bin/python tools/sim/citysim.py --agents og,tourist,skeptic,superfan,gamer [--port 8777]

Starts a frozen private stack (game server + Vite on free ports, throwaway database; never your dev servers),
one headless Chromium with a browser context per agent (a 1280x720 window; agents see 960x540 pictures and use those coordinates), and a small
JSON control API on 127.0.0.1:<port>. Agents drive their own browser with tools/sim/city.py:

    .venv/bin/python tools/sim/city.py og look

Everything an agent does is logged to tools/out/sim/<run>/<agent>/actions.jsonl with a screenshot per step;
notes go to docs/research/agent-playtest/journals/<agent>.md. Ctrl+C (or POST /shutdown) stops it all.
"""
import argparse, asyncio, json, os, re, signal, sys, time, traceback
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
TOOLS = os.path.dirname(HERE)
ROOT = os.path.dirname(TOOLS)
sys.path.insert(0, TOOLS)
from stack import PrivateStack  # noqa: E402
from playwright.async_api import async_playwright  # noqa: E402
from PIL import Image  # noqa: E402
import io  # noqa: E402

OBSERVE_PATH = os.path.join(HERE, 'observe.js')
_observe = {'mtime': 0, 'js': ''}


def observe_js():
    """observe.js, re-read whenever it changes (so it can be fixed while a run is going)"""
    m = os.path.getmtime(OBSERVE_PATH)
    if m != _observe['mtime']:
        _observe.update(mtime=m, js=open(OBSERVE_PATH).read())
    return _observe['js']
JOURNALS = os.path.join(ROOT, 'docs', 'research', 'agent-playtest', 'journals')
VIEW = {'width': 1280, 'height': 720}  # a common laptop browser window
AGENT = (960, 540)  # what agents see: screenshots are scaled to this, and every coordinate they read or send is in it
K = VIEW['width'] / AGENT[0]


def to_agent(xy):
    return [round(xy[0] / K), round(xy[1] / K)] if xy else xy


def agent_obs(obs):
    """convert every screen point in an observation into the agent's 960x540 picture space"""
    g = obs.get('game')
    if g:
        g['me']['at'] = to_agent(g['me']['at'])
        for p in g.get('people', []):
            p['at'] = to_agent(p['at'])
        for t in g.get('things', []):
            t['at'] = to_agent(t.get('at'))
        if g.get('seats'):
            g['seats']['some'] = [to_agent(x) for x in g['seats'].get('some', [])]
    for c in obs.get('ctrls', []):
        c['at'] = to_agent(c['at'])
    for m in (obs.get('map') or []) + (obs.get('stations') or []):
        m['at'] = to_agent(m['at'])
    return obs


def map_labels():
    """the map's landmark names, from app/src/features/map.ts (the map draws them as pictures, not text)"""
    src = open(os.path.join(ROOT, 'app', 'src', 'features', 'map.ts')).read()
    return {m.group(1): m.group(2) for m in re.finditer(r"\{ id: '([^']+)', label: '([^']+)'", src)}


MAP_LABELS = map_labels()

# a sound hook: every sfx the game plays is remembered until the next look (agents can't hear)
SOUND_HOOK = """(() => {
  window.__simSounds = []
  const hook = () => {
    const g = window.clubNyc
    const s = g && g.api && g.api.sfx
    if (!s) return false
    if (s.__simHooked) return true
    for (const k of Object.keys(s)) {
      const f = s[k]
      if (typeof f !== 'function') continue
      s[k] = function (...a) { try { if (window.__simSounds.length < 60) window.__simSounds.push(k) } catch (e) {} return f.apply(this, a) }
    }
    s.__simHooked = true
    return true
  }
  const iv = setInterval(() => { try { if (hook()) clearInterval(iv) } catch (e) {} }, 400)
})()"""

SCHEDULE = [
    (0, 18, 'ARRIVE (solo)', 'Start on the landing page like a real visitor. Get into the game, make your New Yorker (look + name that fit you), live through the arrival story and Rosa\'s first-day tour (skip only if your character would). Note first impressions.'),
    (18, 28, 'MEETUP 1 · Times Square, by the Red Steps', 'Everyone heads to Times Square. Say hi in character, introduce yourself in a line, and send friend requests to the other four (click their avatar → their card).'),
    (28, 55, 'ROAM 1 (your own plan)', 'Follow your persona plan. Visit at least 4 places, read the landmark cards, poke at objects, try at least one job (mini-game). Use the subway or the map to travel.'),
    (55, 68, 'MEETUP 2 · Game night at Joe\'s Pizza', 'Meet at Joe\'s Pizza (Little Italy) for Carb-Jitsu duels at the board by the window table (the Rush Hour Run chalkboard is in the Times Sq subway station, the Citi Bike Dash sign is on the High Line). Challenge each other.'),
    (68, 95, 'ROAM 2 (money, home, culture)', 'Spend and earn: shops, wardrobe, a purchase, your apartment (decorate, the listings app), the newspaper, a Broadway show, a second job, the daily challenges. Text a friend or visit a friend\'s place.'),
    (95, 105, 'MEETUP 3 · Farewell', 'Find each other (Friends list shows where people are). Hang out somewhere you choose together (a house party at someone\'s apartment, the Sky Deck, the Brooklyn Bridge); take a group photo at a photo booth if you can; say goodbye in character.'),
    (105, 999, 'WRAP UP', 'Stop playing. Write your final report (see your brief).'),
]


def now_ms():
    return int(time.time() * 1000)


class Agent:
    def __init__(self, sim, aid):
        self.sim, self.id = sim, aid
        self.ctx = None
        self.page = None
        self.pages = []
        self.lock = asyncio.Lock()
        self.seq = 0
        self.dir = os.path.join(sim.out, aid)
        os.makedirs(self.dir, exist_ok=True)
        self.errors = []
        self.chat_seen = []
        self.points = {}
        self.stepping = False
        self.step_ms = 400
        self.cdp = None
        self.count = 0  # game actions (not notes or status checks)
        self.left = None  # {'reason', 'at_action'} once the player closes the tab
        self.log = open(os.path.join(self.dir, 'actions.jsonl'), 'a')
        self.errlog = open(os.path.join(self.dir, 'errors.log'), 'a')

    # ---------- browser ----------
    async def open(self, browser):
        self.ctx = await browser.new_context(viewport=VIEW, device_scale_factor=1, locale='en-US', timezone_id='America/New_York')
        await self.ctx.clock.install()
        await self.ctx.add_init_script(SOUND_HOOK)
        base_host = urlparse(self.sim.base).hostname

        async def gate(route):
            host = urlparse(route.request.url).hostname or ''
            if host in (base_host, 'localhost', '127.0.0.1') or route.request.url.startswith(('data:', 'blob:')):
                await route.continue_()
            else:
                self.errors.append(f'blocked an outside request to {host}')
                await route.abort()
        await self.ctx.route('**/*', gate)
        self.ctx.on('page', self._on_page)
        self.page = await self.ctx.new_page()
        await self.page.goto(self.sim.base + '/', wait_until='domcontentloaded')

    def _on_page(self, pg):
        self.pages.append(pg)
        pg.on('pageerror', lambda e: self.errors.append(f'page error: {str(e)[:300]}'))
        pg.on('console', lambda m: self.errors.append(f'console.{m.type}: {m.text[:300]}') if m.type == 'error' else None)
        pg.on('response', lambda r: self.errors.append(f'HTTP {r.status} {urlparse(r.url).path}') if r.status >= 400 and '/@' not in r.url and 'favicon' not in r.url else None)
        pg.on('requestfailed', lambda r: self.errors.append(f'request failed: {urlparse(r.url).path} ({r.failure})') if 'favicon' not in r.url else None)
        pg.on('close', lambda _p: self._closed(pg))
        if self.page is not None and pg is not self.page:
            self.errors.append(f'a new tab opened ({pg.url or "loading"}); use `tabs` / `tab N`')

    def _closed(self, pg):
        if pg in self.pages:
            self.pages.remove(pg)
        if self.page is pg and self.pages:
            self.page = self.pages[0]

    # ---------- observation ----------
    async def observe(self):
        try:
            return agent_obs(await self.page.evaluate(observe_js(), {'mapLabels': MAP_LABELS, 'blind': self.sim.blind}))
        except Exception as e:
            return {'error': str(e)[:300], 'path': self.page.url, 'text': {}, 'ctrls': [], 'chat': [], 'sounds': []}

    async def shot(self, tag=''):
        self.seq += 1
        path = os.path.join(self.dir, f'{self.seq:04d}{("-" + re.sub(r"[^a-z0-9]+", "-", tag.lower()).strip("-")[:30]) if tag else ""}.png')
        try:
            png = await self.page.screenshot(timeout=8000)
            Image.open(io.BytesIO(png)).convert('RGB').resize(AGENT, Image.LANCZOS).save(path, optimize=True)
        except Exception as e:
            self.errors.append(f'screenshot failed: {str(e)[:120]}')
            return None
        return os.path.relpath(path, ROOT)

    def remember(self, obs):
        self.points = {}
        g = obs.get('game') or {}
        for t in g.get('things', []):
            if t.get('at'):
                self.points[t['ref']] = t['at']
        for p in g.get('people', []):
            if p.get('at'):
                self.points['p:' + p['name']] = p['at']
        for c in obs.get('ctrls', []):
            self.points[c['ref']] = c['at']
        for m in (obs.get('map') or []) + (obs.get('stations') or []):
            self.points[m['ref']] = m['at']

    def render(self, obs, full=True):
        L = []
        sim_min = (time.time() - self.sim.t0) / 60
        g = obs.get('game')
        if obs.get('error'):
            L.append(f'(could not read the page: {obs["error"]})')
        if g:
            me = g['me']
            clock = f'action {self.count}' if self.sim.blind else f'city clock {sim_min:.0f} min'
            L.append(f'[{self.id} · {clock}] {g["place"]} ({g["area"]}) · you are {me.get("name")} at {tuple(me["at"])}{" (sitting)" if me.get("sitting") else ""}' + ('' if self.sim.blind else f' · coins {me.get("coins")} · stamps {me.get("stamps")}{" · team " + me["team"] if me.get("team") else ""}'))
            if me.get('says'):
                L.append(f'  your bubble: "{me["says"]}"')
        else:
            clock = f'action {self.count}' if self.sim.blind else f'city clock {sim_min:.0f} min'
            L.append(f'[{self.id} · {clock}] page {obs.get("path")} · "{obs.get("title", "")}"')
        t = obs.get('text') or {}
        if g:
            if t.get('hud'):
                L.append(f'HUD: {t["hud"]}')
            for k, name in (('panel', 'OPEN PANEL'), ('extra', 'ON SCREEN OVER THE CITY (scenes, cards, chips)'), ('notices', 'NOTICES'), ('toasts', 'TOASTS')):
                if t.get(k):
                    body = t[k] if full else t[k][:500]
                    L.append(f'{name}:\n  ' + body.replace('\n', '\n  '))
            if t.get('hover'):
                L.append(f'HOVER LABEL: {t["hover"]}')
            people = g.get('people', [])
            if g.get('covered'):
                L.append('(the city is behind a full-screen scene or panel right now; deal with that first)')
                people = [p for p in people if p.get('says')]
            if people:
                L.append('PEOPLE HERE: ' + ' | '.join(f'{p["name"]} ({p["kind"]}{", sitting" if p.get("sitting") else ""}{", " + p["pose"] if p.get("pose") not in (None, "idle", "walk", "sit") else ""})' + (f' @{tuple(p["at"])}' if p.get('at') else '') + (f' says "{p["says"]}"' if p.get('says') else '') for p in people))
            if self.sim.blind and not g.get('covered'):
                L.append('THINGS: (not listed: look at the picture, hover to find out what things are, click what you see)')
            if full and not g.get('covered') and not self.sim.blind:
                things = g.get('things', [])
                seen, parts = {}, []
                for th in things:
                    key = (th['label'], th.get('go'))
                    if key in seen:
                        seen[key] += 1
                        continue
                    seen[key] = 1
                    parts.append(th)
                L.append('THINGS (click by ref or point): ' + ' | '.join(
                    f'{th["ref"]} "{th["label"]}"' + (f' → {th["go"]}' if th.get('go') else '') + (' [sit]' if th.get('sit') else '') + (f' @{tuple(th["at"])}' if th.get('at') else ' (not clickable from here)') + (f' ×{seen[(th["label"], th.get("go"))]}' if seen[(th["label"], th.get("go"))] > 1 else '')
                    for th in parts))
                if g.get('seats', {}).get('count'):
                    L.append(f'SEATS: {g["seats"]["count"]} places to sit, e.g. ' + ', '.join(str(tuple(p)) for p in g['seats']['some']))
        else:
            if t.get('page'):
                L.append('PAGE TEXT (what is in view):\n  ' + (t['page'] if full else t['page'][:900]).replace('\n', '\n  '))
            if t.get('scroll') and t['scroll'].get('max'):
                L.append(f'(scrolled {t["scroll"]["y"]} of {t["scroll"]["max"]}px; `scroll 600` to see more)')
        if obs.get('map'):
            L.append('MAP PLACES (click one to go): ' + ' | '.join(f'{m["ref"]} "{m["label"]}" @{tuple(m["at"])}' for m in obs['map']))
        if obs.get('stations'):
            L.append('SUBWAY STATIONS (click one to ride): ' + ' | '.join(f'{m["ref"]} "{m["label"]}" @{tuple(m["at"])}' for m in obs['stations']))
        ctrls = obs.get('ctrls', [])
        if ctrls:
            groups = {}
            for c in ctrls:
                groups.setdefault(c.get('where') or 'page', []).append(c)
            one = lambda c: f'{c["ref"]} {c["kind"]} "{c["label"]}"' + (f' {c["extra"]}' if c.get('extra') else '') + (f' href={c["href"]}' if c.get('href') and not c['href'].startswith('#') else '') + (' (disabled)' if c.get('disabled') else '') + f' @{tuple(c["at"])}'
            for where, cs in groups.items():
                parts, run = [], []
                def flush():
                    if len(run) > 2:
                        sel = [c['ref'] for c in run if 'selected' in (c.get('extra') or '')]
                        parts.append(f'{run[0]["ref"]}..{run[-1]["ref"]}: {len(run)} icons/swatches with no text, from @{tuple(run[0]["at"])} to @{tuple(run[-1]["at"])}' + (f' ({", ".join(sel)} selected)' if sel else '') + ' (see the picture; hover one to learn more)')
                    else:
                        parts.extend(one(c) for c in run)
                    run.clear()
                for c in cs:
                    if c['label'].startswith('(an icon'):
                        run.append(c)
                    else:
                        flush()
                        parts.append(one(c))
                flush()
                L.append(f'CONTROLS [{where}]: ' + ' | '.join(parts))
        if obs.get('focus'):
            L.append(f'KEYBOARD FOCUS: {obs["focus"]}')
        chat = obs.get('chat') or []
        new = [c for c in chat if c not in self.chat_seen]
        if new:
            L.append('NEW CHAT: ' + ' || '.join(new))
        self.chat_seen = (self.chat_seen + new)[-60:]
        if obs.get('sounds'):
            s = obs['sounds']
            L.append('SOUNDS PLAYED: ' + ', '.join(sorted(set(s), key=s.index)))
        if self.errors:
            if self.sim.blind:
                # a player never sees the console: keep it for the researchers
                for e in dict.fromkeys(self.errors):
                    self.errlog.write(f'{now_ms()} action {self.count} {e}\n')
                self.errlog.flush()
            else:
                L.append('ERRORS/WARNINGS SINCE LAST STEP: ' + ' || '.join(dict.fromkeys(self.errors[-12:])))
            self.errors.clear()
        if self.stepping:
            L.append(f'(STEP MODE ON: the game is frozen between your actions and runs {self.step_ms} ms after each one; `advance <ms>` to let it run; `step off` when done)')
        if len(self.pages) > 1:
            L.append(f'(tabs open: {len(self.pages)}; `tabs` to list)')
        if self.sim.blind and self.count >= self.sim.soft_cap:
            L.append(f'(You have been at this a while, roughly {round(self.count / 6)} minutes for a person. Only keep going if you really would; the session ends at action {self.sim.hard_cap}.)')
        return '\n'.join(L)

    # ---------- step mode: freeze the page (JS timers via the fake clock, CSS animations via CDP) ----------
    async def _rate(self, r):
        try:
            if self.cdp is None:
                self.cdp = await self.ctx.new_cdp_session(self.page)
                await self.cdp.send('Animation.enable')
            await self.cdp.send('Animation.setPlaybackRate', {'playbackRate': r})
        except Exception as e:
            self.errors.append(f'(sim) could not change animation speed: {str(e)[:80]}')

    async def freeze(self):
        await self._rate(0)
        # (Python's clock API takes seconds. Aim a little ahead: under load the clock can pass the target before the
        # call lands, which Playwright refuses with "Cannot fast-forward to the past"; then aim further and retry.)
        for ahead in (0.05, 0.3, 1.0):
            now = await self.page.evaluate('Date.now()')
            try:
                await self.page.clock.pause_at(now / 1000 + ahead)
                return
            except Exception as e:
                if 'past' not in str(e):
                    raise
        raise RuntimeError('could not pause the game clock (the test tool, not the game); try the command again')

    async def tick(self, ms):
        """let the frozen page run in real time for ms, then freeze it again"""
        await self.page.clock.resume()
        await self._rate(1)
        await asyncio.sleep(ms / 1000)
        await self.freeze()

    async def unfreeze(self):
        await self.page.clock.resume()
        await self._rate(1)
        await self.page.clock.set_system_time(time.time())

    # ---------- actions ----------
    async def settle(self, ms):
        if self.stepping:
            await self.tick(self.step_ms)
        else:
            await asyncio.sleep(ms / 1000)

    async def point(self, target):
        """'h:broadway' | 'p:Name' | 'c12' | 'x y' -> (x, y), with a fresh look for refs"""
        if isinstance(target, (list, tuple)) and len(target) == 2:
            return int(float(target[0])), int(float(target[1]))
        ref = target
        if ref.startswith('c'):
            loc = self.page.locator(f'[data-sim-ref="{ref}"]')
            if await loc.count():
                box = await loc.first.bounding_box()
                if box:
                    x = min(VIEW['width'] - 1, max(0, box['x'] + box['width'] / 2)) / K
                    y = min(VIEW['height'] - 1, max(0, box['y'] + box['height'] / 2)) / K
                    old = self.points.get(ref)
                    # keep the unobstructed point found by the last look while the control hasn't moved
                    return (old[0], old[1]) if old and abs(old[0] - x) < box['width'] / K / 2 and abs(old[1] - y) < box['height'] / K / 2 else (round(x), round(y))
            if ref in self.points:
                return tuple(self.points[ref])
            raise ValueError(f'no control {ref} on screen (refs change after every look; look again)')
        obs = await self.observe()
        self.remember(obs)
        if ref in self.points:
            return tuple(self.points[ref])
        if ref.startswith('p:'):
            low = ref[2:].lower()
            for k, v in self.points.items():
                if k.startswith('p:') and k[2:].lower() == low:
                    return tuple(v)
        raise ValueError(f'{ref} is not on screen right now (or has no clickable spot); look again')

    async def do(self, cmd, args, opts):
        if self.sim.blind:
            # looking is free (a person looks all the time); doing things takes time
            free = ('note', 'status', 'schedule', 'tabs', 'leave', 'look', 'text', 'shot')
            if self.left and cmd not in ('note',):
                raise ValueError('You closed the tab and left. Write your exit interview now (see your brief).')
            if cmd not in free:
                if self.count >= self.sim.hard_cap:
                    raise ValueError('Your session is over (time is up). Write your exit interview now (see your brief).')
                self.count += 1
            if any(a.startswith(('h:', 'm:')) for a in args[:1]):
                raise ValueError('In this playtest you click what you see: use x y coordinates from the picture (or a cN control / p:Name person).')
            if cmd == 'status':
                return {'text': 'Use the game itself for that (your player card, the friends list, the HUD).'}
            if cmd == 'schedule':
                return {'text': 'There is no schedule. Play as long as you would really play, and leave when you would leave (`leave <why>`).'}
            if cmd == 'leave':
                reason = ' '.join(args).strip() or '(no reason given)'
                self.left = {'reason': reason, 'at_action': self.count}
                g = (await self.observe()).get('game') or {}
                self.log.write(json.dumps({'t': now_ms(), 'min': round((time.time() - self.sim.t0) / 60, 2), 'did': f'leave {reason}', 'room': g.get('room'), 'path': self.page.url, 'left': True}) + '\n')
                self.log.flush()
                self.note(f'[LEFT] after {self.count} actions, in {g.get("place") or self.page.url}: {reason}')
                try:
                    await self.page.goto('about:blank')
                except Exception:
                    pass
                return {'text': 'You closed the tab. Now write your exit interview (see your brief).'}
        pg = self.page
        kb, mouse = pg.keyboard, pg.mouse
        want_shot = opts.get('shot', True)
        wait = float(opts.get('wait', 0.8)) * 1000
        if cmd == 'look':
            return await self.result('look', full=True, shot=True, tag='look')
        if cmd == 'text':
            return await self.result('text', full=True, shot=False)
        if cmd == 'shot':
            return await self.result('shot', full=False, shot=True, tag='shot', brief=True)
        if cmd in ('click', 'dblclick', 'hover', 'rclick'):
            if not args:
                raise ValueError('click needs a ref (h:id, p:Name, c12) or x y')
            pt = await self.point(args if len(args) == 2 and re.match(r'^-?\d', args[0]) else args[0])
            sx, sy = pt[0] * K, pt[1] * K
            await mouse.move(sx, sy, steps=4)
            await asyncio.sleep(0.15)
            if cmd == 'click':
                await mouse.down(); await asyncio.sleep(0.06); await mouse.up()
            elif cmd == 'dblclick':
                await mouse.dblclick(sx, sy)
            elif cmd == 'rclick':
                await mouse.click(sx, sy, button='right')
            await self.settle(wait if cmd != 'hover' else 350)
            res = await self.result(f'{cmd} {" ".join(args)} @{pt}', full=True, shot=want_shot, tag=cmd)
            if cmd == 'hover':
                tip = await pg.evaluate("([x, y]) => { const e = document.elementFromPoint(x, y); const t = e && e.closest('[title]'); return t ? t.getAttribute('title') : '' }", [sx, sy])
                if tip:
                    res['text'] = f'TOOLTIP: {tip}\n' + res['text']
            return res
        if cmd == 'drag':
            # drag x1 y1 x2 y2 [x3 y3 ...] [ms]: press at the first point, move through the rest, release
            nums = [float(a) for a in args if re.match(r'^-?\d+(\.\d+)?$', a)]
            ms = 600.0
            if len(nums) % 2 == 1:
                ms = nums.pop()
            if len(nums) < 4:
                raise ValueError('drag x1 y1 x2 y2 [x3 y3 ...] [ms]  (points in picture coordinates; an odd last number is the duration)')
            pts = [(nums[i] * K, nums[i + 1] * K) for i in range(0, len(nums), 2)]
            await mouse.move(*pts[0])
            if self.stepping:
                # a gesture takes real time: the game runs while your hand moves (it samples the pointer every frame)
                await self.page.clock.resume()
                await self._rate(1)
            await mouse.down()
            seg_ms = ms / (len(pts) - 1)
            for (ax, ay), (bx, by) in zip(pts, pts[1:]):
                steps = max(4, int(seg_ms / 25))
                for i in range(1, steps + 1):
                    await mouse.move(ax + (bx - ax) * i / steps, ay + (by - ay) * i / steps)
                    await asyncio.sleep(seg_ms / 1000 / steps)
            await mouse.up()
            if self.stepping:
                await asyncio.sleep(0.12)
                await self.freeze()
            else:
                await self.settle(wait)
            return await self.result(f'drag {len(pts)} points', full=True, shot=want_shot, tag='drag')
        if cmd == 'say':
            msg = ' '.join(args)[:120]
            box = pg.locator('.chat-input')
            if not await box.count():
                raise ValueError('there is no chat box on screen')
            covered = await pg.evaluate("""() => {
              const b = document.querySelector('.chat-input'); const r = b && b.getBoundingClientRect()
              if (!r || r.width < 2) return true
              const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
              return !(top && (top === b || b.contains(top)))
            }""")
            if covered:
                raise ValueError('the chat box is hidden or covered right now (a panel or scene is open); close it first')
            await box.first.click(timeout=3000)
            await kb.type(msg, delay=18)
            await kb.press('Enter')
            await self.settle(max(wait, 900))
            return await self.result(f'say "{msg}"', full=False, shot=want_shot, tag='say')
        if cmd == 'type':
            await kb.type(' '.join(args), delay=25)
            await self.settle(400)
            return await self.result('type', full=True, shot=want_shot, tag='type')
        if cmd == 'fill':
            if len(args) < 2:
                raise ValueError('fill c12 <text>')
            pt = await self.point(args[0])
            await mouse.click(pt[0] * K, pt[1] * K)
            await kb.press('Meta+A'); await kb.press('Backspace')
            await kb.type(' '.join(args[1:]), delay=25)
            await self.settle(700)
            return await self.result(f'fill {args[0]}', full=True, shot=want_shot, tag='fill')
        if cmd == 'select':
            if len(args) < 2:
                raise ValueError('select c12 <option text or value>')
            loc = pg.locator(f'[data-sim-ref="{args[0]}"]')
            val = ' '.join(args[1:])
            try:
                await loc.select_option(label=val, timeout=3000)
            except Exception:
                await loc.select_option(val, timeout=3000)
            await self.settle(400)
            return await self.result(f'select {args[0]} {val}', full=True, shot=want_shot, tag='select')
        if cmd in ('key', 'press'):
            if not args:
                raise ValueError('key <Key> (Escape, Enter, Space, ArrowLeft, d, m, ...)')
            # game keys shouldn't land in the chat box
            await pg.evaluate("() => { const a = document.activeElement; if (a && a.matches && a.matches('.chat-input')) a.blur() }")
            alias = {'space': 'Space', 'left': 'ArrowLeft', 'right': 'ArrowRight', 'up': 'ArrowUp', 'down': 'ArrowDown', 'esc': 'Escape', 'return': 'Enter', 'enter': 'Enter'}
            for k in args:
                await kb.press(alias.get(k.lower(), k))
                await asyncio.sleep(0.08)
            await self.settle(wait)
            return await self.result(f'key {" ".join(args)}', full=True, shot=want_shot, tag='key')
        if cmd == 'hold':
            if len(args) < 2:
                raise ValueError('hold <Key> <ms>')
            await kb.down(args[0])
            if self.stepping:
                await self.tick(min(float(args[1]), 5000))
            else:
                await asyncio.sleep(min(float(args[1]), 5000) / 1000)
            await kb.up(args[0])
            if not self.stepping:
                await self.settle(200)
            return await self.result(f'hold {args[0]} {args[1]}', full=True, shot=want_shot, tag='hold')
        if cmd == 'scroll':
            dy = float(args[0]) if args else 500
            if len(args) > 2:
                await mouse.move(float(args[1]) * K, float(args[2]) * K)
            else:
                await mouse.move(VIEW['width'] / 2, VIEW['height'] / 2)
            await mouse.wheel(0, dy)
            await self.settle(500)
            return await self.result(f'scroll {dy}', full=True, shot=want_shot, tag='scroll')
        if cmd == 'wait':
            s = min(float(args[0]) if args else 3, 60)
            if self.stepping:
                await self.tick(s * 1000)
            else:
                await asyncio.sleep(s)
            return await self.result(f'wait {s}', full=True, shot=want_shot, tag='wait')
        if cmd == 'step':
            on = (args[0] if args else 'on').lower() == 'on'
            if len(args) > 1:
                self.step_ms = max(50, min(3000, int(float(args[1]))))
            if on and not self.stepping:
                await self.freeze()
                self.stepping = True
            elif not on and self.stepping:
                self.stepping = False
                await self.unfreeze()
            return await self.result(f'step {"on" if on else "off"}', full=True, shot=want_shot, tag='step')
        if cmd == 'advance':
            ms = int(float(args[0])) if args else self.step_ms
            if not self.stepping:
                raise ValueError('advance only works in step mode (`step on`)')
            await self.tick(ms)
            return await self.result(f'advance {ms}', full=True, shot=want_shot, tag='advance')
        if cmd == 'open':
            path = args[0] if args else '/'
            if not path.startswith('/'):
                raise ValueError('open takes a same-site path like /help/ or /play')
            await pg.goto(self.sim.base + path, wait_until='domcontentloaded')
            await asyncio.sleep(1.5)
            return await self.result(f'open {path}', full=True, shot=True, tag='open')
        if cmd == 'back':
            await pg.go_back(wait_until='domcontentloaded')
            await asyncio.sleep(1)
            return await self.result('back', full=True, shot=True, tag='back')
        if cmd == 'tabs':
            return {'text': '\n'.join(f'{i}: {p.url}{" (current)" if p is self.page else ""}' for i, p in enumerate(self.pages))}
        if cmd == 'tab':
            i = int(args[0]) if args else 0
            self.page = self.pages[i]
            self.cdp = None
            await self.page.bring_to_front()
            return await self.result(f'tab {i}', full=True, shot=True, tag='tab')
        if cmd == 'close-tab':
            if self.page is self.pages[0]:
                raise ValueError('that is the game tab; switch to another tab first')
            await self.page.close()
            self.page = self.pages[0]
            self.cdp = None
            return await self.result('close-tab', full=True, shot=True, tag='tab')
        if cmd == 'js':
            # QA only: run an expression in the page (e.g. clubNyc.arrival()); never offered to blind players
            if self.sim.blind:
                raise ValueError('not available in this playtest')
            val = await pg.evaluate(f'async () => {{ return ({" ".join(args)}) }}')
            await self.settle(wait)
            res = await self.result(f'js {" ".join(args)[:40]}', full=True, shot=want_shot, tag='js')
            res['text'] = f'JS RESULT: {json.dumps(val, default=str)[:300]}\n' + res['text']
            return res
        if cmd == 'autopilot':
            on = (args[0] if args else 'on').lower() == 'on'
            await pg.evaluate("on => { if (window.clubNycMp) window.clubNycMp.autopilot = on }", on)
            return {'text': f'race autopilot {"on" if on else "off"} (only the Citi Bike Dash and Rush Hour Run use it; it steers for you like a friend holding the controller)'}
        if cmd == 'note':
            return self.note(' '.join(args), opts.get('shot_path'))
        if cmd == 'status':
            return await self.status()
        if cmd == 'schedule':
            return {'text': self.sim.schedule_text()}
        raise ValueError(f'unknown command {cmd!r}; try: look, text, shot, click, hover, dblclick, drag, say, type, fill, select, key, hold, scroll, wait, step, advance, open, back, tabs, tab, close-tab, autopilot, note, status, schedule')

    async def result(self, what, full=True, shot=True, tag='', brief=False):
        obs = await self.observe()
        self.remember(obs)
        text = self.render(obs, full=full) if not brief else self.render(obs, full=False)
        path = await self.shot(tag) if shot else None
        g = obs.get('game') or {}
        self.log.write(json.dumps({'t': now_ms(), 'min': round((time.time() - self.sim.t0) / 60, 2), 'did': what, 'room': g.get('room'), 'path': obs.get('path'), 'coins': (g.get('me') or {}).get('coins'), 'shot': path}) + '\n')
        self.log.flush()
        return {'text': text + (f'\nSCREENSHOT: {os.path.join(ROOT, path)}' if path else ''), 'shot': path}

    def note(self, text, shot=None):
        os.makedirs(self.sim.journals, exist_ok=True)
        path = os.path.join(self.sim.journals, f'{self.id}.md')
        new = not os.path.exists(path)
        with open(path, 'a') as f:
            if new:
                f.write(f'# Field journal: {self.id}\n\nRun {self.sim.run}. Each line: city-clock minute, place, note.\n\n')
            last = None
            try:
                with open(os.path.join(self.dir, 'actions.jsonl')) as lf:
                    lines = lf.read().strip().splitlines()
                    last = json.loads(lines[-1]) if lines else None
            except Exception:
                pass
            where = (last or {}).get('room') or (last or {}).get('path') or '?'
            ref = shot or (last or {}).get('shot')
            f.write(f'- **{(time.time() - self.sim.t0) / 60:.0f} min · {where}**: {text.strip()}' + (f' _(shot: {ref})_' if ref else '') + '\n')
        return {'text': f'noted in {os.path.relpath(path, ROOT)}'}

    async def status(self):
        info = await self.page.evaluate("""() => {
          const g = window.clubNyc
          if (!g || !g.save) return null
          const s = g.save
          const mp = g.mp
          const friends = mp && mp.friends ? [...mp.friends.values()].map(f => ({ name: f.name, online: f.online, room: f.room })) : []
          const hud = document.querySelector('.hud')
          return { name: s.name, coins: s.coins, owned: (s.owned || []).length, wearing: s.look, stamps: s.stamps, team: s.team, friends, room: g.world && g.world.room && g.world.room.id, hud: hud ? hud.innerText.replace(/\\s+/g, ' ').slice(0, 200) : '' }
        }""")
        if not info:
            return {'text': 'not in the game yet'}
        fr = ', '.join(f'{f["name"]} ({"online in " + str(f.get("room")) if f.get("online") else "offline"})' for f in info['friends']) or 'none yet'
        return {'text': f'{info["name"]} · room {info["room"]} · coins {info["coins"]} · items owned {info["owned"]} · stamps {len(info["stamps"] or [])} ({", ".join(info["stamps"] or [])}) · team {info["team"]}\nHUD: {info["hud"]}\nFRIENDS: {fr}'}


class Sim:
    def __init__(self, agents, port, blind=False, soft_cap=70, hard_cap=100, journals=JOURNALS, live=False):
        self.live = live
        self.journals = os.path.join(ROOT, journals) if not os.path.isabs(journals) else journals
        self.ids = agents
        self.port = port
        self.blind, self.soft_cap, self.hard_cap = blind, soft_cap, hard_cap
        self.run = time.strftime('%Y%m%d-%H%M')
        self.out = os.path.join(TOOLS, 'out', 'sim', self.run)
        os.makedirs(self.out, exist_ok=True)
        self.t0 = time.time()
        self.agents = {}
        self.stack = None
        self.base = None
        self.stop = asyncio.Event()

    def schedule_text(self):
        m = (time.time() - self.t0) / 60
        lines = [f'City clock: {m:.0f} min since the city opened.']
        for a, b, name, what in SCHEDULE:
            mark = '▶ NOW' if a <= m < b else ('done' if m >= b else 'later')
            lines.append(f'{mark:6} {a:>3}-{b if b < 999 else "end":>3} min  {name}: {what}')
        return '\n'.join(lines)

    async def handle(self, reader, writer):
        try:
            head = await reader.readuntil(b'\r\n\r\n')
            lines = head.decode('latin1').split('\r\n')
            method, path, _ = lines[0].split(' ', 2)
            length = 0
            for h in lines[1:]:
                if h.lower().startswith('content-length:'):
                    length = int(h.split(':', 1)[1])
            body = await reader.readexactly(length) if length else b''
            if path == '/health':
                res = {'ok': True, 'base': self.base, 'agents': list(self.agents), 'run': self.run, 'minutes': round((time.time() - self.t0) / 60, 1)}
            elif path == '/add' and method == 'POST':
                req = json.loads(body or b'{}')
                added = []
                for aid in req.get('agents', []):
                    if aid not in self.agents:
                        a = Agent(self, aid)
                        await a.open(self.browser)
                        self.agents[aid] = a
                        added.append(aid)
                res = {'ok': True, 'added': added, 'agents': list(self.agents)}
            elif path == '/shutdown' and method == 'POST':
                res = {'ok': True}
                self.stop.set()
            elif path == '/act' and method == 'POST':
                req = json.loads(body or b'{}')
                ag = self.agents.get(req.get('agent'))
                if not ag:
                    res = {'ok': False, 'text': f'unknown agent {req.get("agent")!r}; agents: {", ".join(self.agents)}'}
                else:
                    async with ag.lock:
                        try:
                            r = await asyncio.wait_for(ag.do(req.get('cmd', 'look'), req.get('args') or [], req.get('opts') or {}), timeout=120)
                            res = {'ok': True, **r}
                        except Exception as e:
                            res = {'ok': False, 'text': f'error: {e}'}
                            if not isinstance(e, ValueError):
                                traceback.print_exc()
            else:
                res = {'ok': False, 'text': 'POST /act {agent, cmd, args, opts}'}
            data = json.dumps(res).encode()
            writer.write(b'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ' + str(len(data)).encode() + b'\r\nConnection: close\r\n\r\n' + data)
            await writer.drain()
        except Exception:
            traceback.print_exc()
        finally:
            writer.close()

    def snapshot(self):
        """VACUUM INTO a copy of the private city's database (chat, ledger, jobs, matches) inside the run folder"""
        import sqlite3
        src = os.path.join(self.stack.tmp, 'test.db')
        dst = os.path.join(self.out, 'city.db')
        try:
            if os.path.exists(dst + '.tmp'):
                os.remove(dst + '.tmp')
            con = sqlite3.connect(src)
            con.execute(f"VACUUM INTO '{dst}.tmp'")
            con.close()
            os.replace(dst + '.tmp', dst)
        except Exception as e:
            print(f'[sim] snapshot failed: {e}', flush=True)

    async def snapshots(self):
        while not self.stop.is_set():
            try:
                await asyncio.wait_for(self.stop.wait(), timeout=180)
            except asyncio.TimeoutError:
                await asyncio.to_thread(self.snapshot)

    async def main(self):
        # a frozen copy keeps a playtest's build fixed; --live serves the working tree (hot reload) for QA
        self.stack = PrivateStack(frozen=not self.live, prefix='clubnyc-sim-')
        self.base = await asyncio.to_thread(self.stack.start)
        print(f'[sim] private city at {self.base} (game server on {self.stack.game}); run {self.run}', flush=True)
        server = None
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(args=['--autoplay-policy=no-user-gesture-required', '--mute-audio'])
                self.browser = browser
                for aid in self.ids:
                    a = Agent(self, aid)
                    await a.open(browser)
                    self.agents[aid] = a
                    print(f'[sim] {aid} is on the landing page', flush=True)
                server = await asyncio.start_server(self.handle, '127.0.0.1', self.port)
                # only the main city (port 8777) becomes "current" for the players' controller; a side city on another
                # port (QA, a second test) writes current-<port>.json and never takes over a running playtest
                name = 'current.json' if self.port == 8777 else f'current-{self.port}.json'
                with open(os.path.join(TOOLS, 'out', 'sim', name), 'w') as f:
                    json.dump({'port': self.port, 'base': self.base, 'run': self.run, 'out': os.path.relpath(self.out, ROOT), 'started': self.t0}, f)
                self.t0 = time.time()
                print(f'[sim] control API on http://127.0.0.1:{self.port} · agents: {", ".join(self.ids)}{" · BLIND" if self.blind else ""}', flush=True)
                snaps = asyncio.create_task(self.snapshots())
                await self.stop.wait()
                await snaps
                self.snapshot()
                await browser.close()
        finally:
            if server:
                server.close()
            self.stack.stop(keep_log_to=os.path.join(self.out, 'stack.log'))
            print('[sim] stopped', flush=True)


def cli():
    ap = argparse.ArgumentParser()
    ap.add_argument('--agents', default='og,tourist,skeptic,superfan,gamer')
    ap.add_argument('--port', type=int, default=8777)
    ap.add_argument('--blind', action='store_true', help='players see only what a person sees: no lists of clickable things, no console errors, and they can leave')
    ap.add_argument('--soft', type=int, default=70, help='blind mode: actions before the "you have been at this a while" nudge')
    ap.add_argument('--hard', type=int, default=100, help='blind mode: actions before the session ends')
    ap.add_argument('--journals', default=os.path.relpath(JOURNALS, ROOT), help='folder for the field journals (relative to the repo)')
    ap.add_argument('--live', action='store_true', help='QA: serve the working tree with hot reload instead of a frozen copy (never for playtests)')
    a = ap.parse_args()
    sim = Sim([x.strip() for x in a.agents.split(',') if x.strip()], a.port, a.blind, a.soft, a.hard, a.journals, a.live)
    loop = asyncio.new_event_loop()
    for s in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(s, sim.stop.set)
    loop.run_until_complete(sim.main())


if __name__ == '__main__':
    cli()
