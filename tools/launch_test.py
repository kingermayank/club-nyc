"""Launch-readiness end-to-end test: the production build on an isolated server with a throwaway database.

usage: .venv/bin/python tools/launch_test.py [--keep] [--no-build]
Starts `server/` in production mode on port 8896 (NODE_ENV=production, a known ADMIN_TOKEN, a temp DB,
short referral timers) serving the freshly built `app/dist`, then drives real browsers through:
link previews, the phone page, the 13+ age gate, member numbers, the server wallet (caps, prices,
ownership), invite links (friends, placement, the inviter's payout), reports + auto-mute, admin bans,
announcements, maintenance mode, account deletion, crash reports, backups and a graceful restart.
Screenshots go to tools/out/launch-*.png. Exit code 0 = all checks passed."""
import asyncio, base64, json, os, re, shutil, signal, socket, subprocess, sys, tempfile, time, urllib.request
from playwright.async_api import async_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8896
BASE = f'http://localhost:{PORT}'
# the Terms / Privacy / Rules version new players agree to (shared with the game and the server)
POLICY = re.search(r"POLICY_VERSION = '([^']+)'", open(os.path.join(ROOT, 'app', 'src', 'data', 'policy.ts')).read()).group(1)
TOKEN = 'launch-test-token-' + str(os.getpid())
OUT = os.path.join(ROOT, 'tools', 'out')
os.makedirs(OUT, exist_ok=True)
results = []


def check(ok, what, detail=''):
    results.append((bool(ok), what))
    print(('PASS ' if ok else 'FAIL ') + what + (f'  ({detail})' if detail != '' else ''), flush=True)


def http(path, method='GET', body=None, cookie=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    if body is not None:
        req.add_header('content-type', 'application/json')
    if cookie:
        req.add_header('cookie', cookie)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, r.read().decode('utf-8', 'replace'), r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace'), e.headers


def raw_ws(cookie=None, frame=None):
    """Open /ws by hand (so we can send what a browser never would) and return the server's status line."""
    s = socket.create_connection(('localhost', PORT), timeout=5)
    key = base64.b64encode(os.urandom(16)).decode()
    s.sendall((f'GET /ws HTTP/1.1\r\nHost: localhost:{PORT}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
               f'Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\nOrigin: {BASE}\r\n' + (f'Cookie: {cookie}\r\n' if cookie else '') + '\r\n').encode())
    status = s.recv(4096).decode('latin-1').split('\r\n')[0]
    if frame:
        s.sendall(frame)
        time.sleep(0.6)
    s.close()
    return status


def text_frame(data):
    """A client→server WebSocket text frame (masked, as the protocol requires)."""
    mask = os.urandom(4)
    n = len(data)
    head = bytes([0x81, 0x80 | n]) if n < 126 else bytes([0x81, 0x80 | 126]) + n.to_bytes(2, 'big')
    return head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data))


class Server:
    def __init__(self, db_dir):
        self.db_dir = db_dir
        self.proc = None
        self.log = open(os.path.join(db_dir, 'server.log'), 'a')

    def start(self):
        env = {**os.environ, 'NODE_ENV': 'production', 'PORT': str(PORT), 'PUBLIC_URL': BASE, 'DB_PATH': os.path.join(self.db_dir, 'launch.db'),
               'ADMIN_TOKEN': TOKEN, 'CONTACT_EMAIL': 'moderators@example.test', 'REFERRAL_ACTIVATION_MS': '12000', 'PLAYTIME_TICK_MS': '3000',
               'BACKUP_DIR': os.path.join(self.db_dir, 'backups')}
        self.proc = subprocess.Popen(['npx', 'tsx', 'src/index.ts'], cwd=os.path.join(ROOT, 'server'), env=env, stdout=self.log, stderr=subprocess.STDOUT, preexec_fn=os.setsid)
        for _ in range(60):
            try:
                if http('/api/health')[0] == 200:
                    return
            except Exception:
                pass
            time.sleep(0.5)
        raise SystemExit('server did not start — see ' + self.log.name)

    def stop(self, sig=signal.SIGTERM, wait=12):
        if not self.proc:
            return
        try:
            os.killpg(self.proc.pid, sig)
            self.proc.wait(timeout=wait)
        except Exception:
            os.killpg(self.proc.pid, signal.SIGKILL)
        self.proc = None


async def onboard(pg, name, team_index, url=BASE + '/play', age=True, from_creator=False):
    if not from_creator:
        await pg.goto(url, wait_until='networkidle')
        await pg.wait_for_selector('.si-live.busy, .si-live.quiet', timeout=8000)
        await pg.click('.si-play')
    await pg.wait_for_selector('.creator-card', timeout=10000)
    nxt = '.creator-actions .btn.go'
    # screen 1: pick a ready-made look, then "That's me"
    await pg.locator('.cr-preset').nth(team_index % 8).click()
    await pg.wait_for_timeout(250)
    await pg.click(nxt)
    # screen 2: name, 13+, "Walk into the city" (claims the name)
    await pg.wait_for_selector('.creator-name input')
    await pg.fill('.creator-name input', name)
    await pg.wait_for_selector('.cr-avail.ok', timeout=5000)
    if age:
        await pg.select_option('.cr-month', '6'); await pg.select_option('.cr-year', '2000'); await pg.click('.cr-age input')
    await pg.click(nxt)  # Walk into the city -> claim


async def skip_tour(pg, timeout=9000):
    """Brand-new players get Rosa's first-day tour; tests that drive the city skip it."""
    try:
        await pg.wait_for_selector('.tour .tour-skip', timeout=timeout)
        await pg.click('.tour .tour-skip')
        await pg.wait_for_timeout(300)
        return True
    except Exception:
        return False


async def finish_onboarding(pg):
    await pg.wait_for_selector('.online-pill.on', timeout=12000)
    await skip_tour(pg)
    await pg.wait_for_timeout(500)


async def api(pg, path, method='GET', body=None):
    return await pg.evaluate("""async ([path, method, body]) => {
        const r = await fetch('/api' + path, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' })
        let j = null; try { j = await r.json() } catch {}
        return { status: r.status, body: j }
    }""", [path, method, body])


async def main():
    keep = '--keep' in sys.argv
    if '--no-build' not in sys.argv:
        print('building the client…', flush=True)
        subprocess.run(['npm', '--prefix', 'app', 'run', 'build'], cwd=ROOT, check=True, stdout=subprocess.DEVNULL)
    tmp = tempfile.mkdtemp(prefix='clubnyc-launch-')
    srv = Server(tmp)
    srv.start()
    tag = str(int(time.time()) % 10000).zfill(4)
    A_NAME, B_NAME, C_NAME, D_NAME = f'Ava{tag}', f'Ben{tag}', f'Cy{tag}', f'Dee{tag}'
    try:
        # ---------- link previews ----------
        st, html, _ = http(f'/join/{A_NAME}')
        check(st == 200 and f'{A_NAME} invited you to Club NYC' in html and '/og/invite.jpg' in html, 'invite links unfurl with a personal title and the invite image')
        st, html, _ = http('/')
        check('og:image' in html and '/og/club-nyc.jpg' in html, 'the home page has a link-preview card')
        # ---------- the landing page (/) and the game (/play) ----------
        check(st == 200 and 'A city you can hang' in html and 'data-play="hero"' in html, 'the front page is the landing page, with a Play now button', st)
        check(f'<link rel="canonical" href="{BASE}/"' in html and f'content="{BASE}/og/club-nyc.jpg"' in html and '"VideoGame"' in html and '"url": "/"' not in html and f'"releaseNotes": "{BASE}/#whats-new"' in html,
              'the landing page has an absolute canonical URL, an absolute share image and VideoGame structured data')
        st2, game, _ = http('/play')
        check(st2 == 200 and '/src/' not in game and 'noindex' in game and 'data-play="hero"' not in game, 'the game is served at /play (and asks search engines to index the landing page instead)', st2)
        check(http('/no-such-page')[0] == 404, 'unknown addresses answer 404 (with the landing page), so search engines don’t index them')
        robots, sitemap = http('/robots.txt')[1], http('/sitemap.xml')[1]
        check(f'Sitemap: {BASE}/sitemap.xml' in robots and 'Disallow: /api/' in robots and f'<loc>{BASE}/</loc>' in sitemap and '/play' not in sitemap,
              'robots.txt points to a sitemap of the landing and policy pages (not the game or the API)')
        check(http('/og/invite.jpg')[0] == 200 and http('/rules.html')[0] == 200 and http('/privacy.html')[0] == 200 and http('/terms.html')[0] == 200, 'preview images and the rules / privacy / terms pages are served')

        # ---------- security + caching headers ----------
        _, _, h = http('/')
        csp = h.get('content-security-policy') or ''
        check("script-src 'self'" in csp and "frame-ancestors 'none'" in csp and h.get('x-frame-options') == 'DENY' and h.get('x-content-type-options') == 'nosniff' and h.get('cache-control') == 'no-cache',
              'pages carry a strict Content-Security-Policy, anti-framing headers and are never cached stale')
        js = re.search(r'/assets/index-[^"]+\.js', html).group(0)
        with urllib.request.urlopen(urllib.request.Request(BASE + js, headers={'Accept-Encoding': 'br, gzip'}), timeout=10) as r:
            enc, cc = r.headers.get('content-encoding'), r.headers.get('cache-control') or ''
        check(enc == 'br' and 'immutable' in cc, 'game code is served brotli-compressed and cached for good', (enc, cc))
        lm = http('/art/ui/logo.png')[2].get('last-modified')
        try:
            urllib.request.urlopen(urllib.request.Request(BASE + '/art/ui/logo.png', headers={'If-Modified-Since': lm}), timeout=10)
            code = 200
        except urllib.error.HTTPError as e:
            code = e.code
        check(code == 304, 'unchanged art answers 304 (returning players don’t re-download the city)', code)
        csp_errors = []
        def watch(pg):
            pg.on('console', lambda m: csp_errors.append(m.text) if 'Content Security Policy' in m.text else None)
            return pg

        async with async_playwright() as p:
            b = await p.chromium.launch()
            # ---------- phones get the friendly page ----------
            phone = await b.new_context(**p.devices['iPhone 13'])
            pp = await phone.new_page()
            await pp.goto(BASE + f'/join/{A_NAME}', wait_until='networkidle')
            await pp.wait_for_timeout(600)
            shown = await pp.evaluate("!!document.querySelector('.desktop-only') && getComputedStyle(document.querySelector('.desktop-only')).display !== 'none'")
            link = await pp.evaluate("document.querySelector('.do-link input')?.value")
            await pp.screenshot(path=os.path.join(OUT, 'launch-phone.png'))
            check(shown, 'phones see the “best on a computer” page')
            check(link and link.endswith(f'/join/{A_NAME}'), 'the link phones send themselves keeps the invite', link)
            await phone.close()

            ctx = [await b.new_context(viewport={'width': 1000, 'height': 565}) for _ in range(4)]
            A, B, C, D = [watch(await c.new_page()) for c in ctx]

            # ---------- the age gate ----------
            await A.goto(BASE + '/play', wait_until='networkidle')
            await A.wait_for_selector('.si-live.busy, .si-live.quiet', timeout=8000)
            live = await A.evaluate("document.querySelector('.si-live')?.innerText ?? ''")
            check('city' in live.lower() and not await A.evaluate("!!document.querySelector('.si-founding')"), 'the front door shows who’s in the city (no founding-member countdown)', live)
            await A.click('.si-play')
            await A.wait_for_selector('.creator-card', timeout=10000)
            await A.click('.creator-actions .btn.go')  # screen 1: That's me
            await A.wait_for_selector('.creator-name input')
            await A.click('.creator-actions .btn.go')  # screen 2, without a birthday or "I agree"
            await A.wait_for_timeout(500)
            err = await A.evaluate("document.querySelector('.cr-err')?.textContent ?? ''")
            check(await A.evaluate("!!document.querySelector('.creator-card')") and 'birth month and year' in err, 'the creator won’t continue without a birth month and year', err)
            await A.select_option('.cr-month', '6'); await A.select_option('.cr-year', '2000')
            await A.click('.creator-actions .btn.go')  # a birthday, but no "I agree"
            await A.wait_for_timeout(500)
            err = await A.evaluate("document.querySelector('.cr-err')?.textContent ?? ''")
            check(await A.evaluate("!!document.querySelector('.creator-card')") and 'Terms' in err, 'the creator won’t continue until you agree to the Terms, Privacy Policy and Community Rules', err)
            years = await A.evaluate("[...document.querySelectorAll('.cr-year option')].map(o => o.value).filter(Boolean).map(Number)")
            check(len(years) >= 90 and max(years) >= time.localtime().tm_year - 1, 'the age question is neutral: every birth year is on the list, nothing is picked for you', (min(years), max(years)))
            await A.click('.creator-actions .btn.ghost')  # back to screen 1, so onboard() starts where it expects
            kid_look = {'skin': 1, 'hair': 'short', 'hairColor': 1, 'items': {}}
            st = await api(A, '/profile', 'POST', {'name': 'Kid' + tag, 'look': kid_look, 'team': 'midtown'})
            check(st['status'] == 400 and (st['body'] or {}).get('error') == 'age', 'the server refuses a profile without a birthday', st)
            st = await api(A, '/profile', 'POST', {'name': 'Kid' + tag, 'look': kid_look, 'team': 'midtown', 'birth': {'m': 1, 'y': 2000}})
            check(st['status'] == 400 and (st['body'] or {}).get('error') == 'consent', 'the server refuses a profile without agreeing to the Terms, Privacy Policy and Rules', st)

            # ---------- under 13: a friendly goodbye, nothing kept, no going back to try another year ----------
            kid = await b.new_context(viewport={'width': 1000, 'height': 565})
            K = watch(await kid.new_page())
            await K.goto(BASE + '/play?start=guest', wait_until='networkidle')
            await K.wait_for_selector('.creator-card', timeout=10000)
            await K.click('.creator-actions .btn.go')
            await K.wait_for_selector('.creator-name input')
            await K.fill('.creator-name input', 'Kid' + tag)
            await K.select_option('.cr-month', '6'); await K.select_option('.cr-year', str(time.localtime().tm_year - 10)); await K.click('.cr-age input')
            await K.click('.creator-actions .btn.go')
            await K.wait_for_selector('.too-young', timeout=6000)
            await K.wait_for_timeout(600)
            gone = (await api(K, '/me'))['body']
            check(gone.get('user') is None, 'an under-13 sign-up sees a friendly goodbye, and the guest account made for the visit is deleted', gone)
            await K.goto(BASE + '/play?start=guest', wait_until='networkidle')
            await K.wait_for_selector('.too-young', timeout=8000)
            check(not await K.evaluate("!!document.querySelector('.creator-card')"), 'going back right away doesn’t offer the creator again (no picking another year)')
            await kid.close()

            # ---------- A: New Yorker #1 (carries on from the creator) ----------
            await onboard(A, A_NAME, 1, from_creator=True)
            await finish_onboarding(A)
            me = (await api(A, '/me'))['body']['user']
            check(me.get('consentVersion') == POLICY, 'the server records which version of the Terms a new player agreed to', me.get('consentVersion'))
            # the MetroCard flips in at the corner once the tour is over
            await A.wait_for_selector('.mc-corner .metrocard-id', timeout=6000)
            card = await A.evaluate("document.querySelector('.mc-corner .metrocard-id')?.innerText ?? ''")
            await A.screenshot(path=os.path.join(OUT, 'launch-metrocard.png'))
            check('No. 0001' in card and 'Founding' not in card, 'the MetroCard shows your real member number (and no founding ribbon)', card.replace('\n', ' | '))
            rects = await A.evaluate("""() => Object.fromEntries(['.online-pill', '.coin-plate', '.jam-chip', '.place-plate', '.quests'].map((s) => {
                const e = document.querySelector(s)
                if (!e || !e.offsetParent) return [s, null]
                const r = e.getBoundingClientRect()
                return [s, [r.left, r.top, r.right, r.bottom]]
            }))""")
            def overlap(a, b):
                return bool(a and b and a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3])
            pill, coins = rects['.online-pill'], rects['.coin-plate']
            check(pill and coins and pill[2] <= coins[0] + 1 and not any(overlap(pill, rects[k]) for k in ['.coin-plate', '.jam-chip', '.place-plate', '.quests']),
                  'the “New Yorkers online” counter sits left of the coins without covering anything', rects)

            # ---------- the server wallet ----------
            w = (await api(A, '/wallet'))['body']
            check(w['coins'] == 50 and 'team-scarf-midtown' not in w['owned'], 'a new wallet starts at 50 coins (team scarf is free, not owned)', w)
            d1 = (await api(A, '/wallet/earn', 'POST', {'reason': 'daily'}))['body']
            d2 = (await api(A, '/wallet/earn', 'POST', {'reason': 'daily'}))['body']
            check(d1['ok'] and not d2['ok'] and d2['error'] == 'cap', 'the daily refill pays once a day', (d1, d2))
            bad = (await api(A, '/wallet/earn', 'POST', {'reason': 'free-money'}))['body']
            check(not bad['ok'] and bad['error'] == 'unknown-reason', 'made-up reasons to get paid are refused')
            paid = 0
            limited = 0
            for _ in range(65):
                r = (await api(A, '/wallet/earn', 'POST', {'reason': 'coin'}))['body'] or {}
                if r.get('error') == 'slow-down':
                    limited += 1
                    await A.wait_for_timeout(600)
                    r = (await api(A, '/wallet/earn', 'POST', {'reason': 'coin'}))['body'] or {}
                paid += 1 if r.get('ok') else 0
            check(limited == 0, 'a busy player isn’t rate-limited by normal play (65 quick claims)', limited)
            check(paid == 60, 'coins on the ground are capped at 60 an hour', paid)
            jam = (await api(A, '/wallet/earn', 'POST', {'reason': 'dance-jam', 'ref': 1}))['body']
            check(not jam['ok'], 'Dance Jam tips can’t be claimed for an old show', jam.get('error'))
            poor = (await api(A, '/wallet/buy', 'POST', {'kind': 'home', 'id': 'penthouse'}))['body']
            check(not poor['ok'] and poor['error'] == 'poor', 'you can’t buy the penthouse without 4,000 coins')
            reward = (await api(A, '/wallet/grant', 'POST', {'item': 'chef-coat'}))['body']
            check(not reward['ok'] and reward['error'] == 'not-earned', 'job uniforms can’t be claimed before working that job')
            before = (await api(A, '/wallet'))['body']['coins']
            buy = (await api(A, '/wallet/buy', 'POST', {'kind': 'item', 'id': 'hotdog'}))['body']
            check(buy['ok'] and buy['coins'] == before - 2 and 'hotdog' in buy['wallet']['owned'], 'buying a hot dog costs its real price and adds it to your wardrobe', buy.get('coins'))
            spoof = await api(A, '/save', 'PUT', {'save': {'coins': 999999, 'owned': ['gold-chain', 'designer-bag'], 'look': {'skin': 1, 'hair': 'short', 'hairColor': 1, 'items': {'body': 'tee-blue'}}}})
            after = (await api(A, '/wallet'))['body']
            check(after['coins'] == buy['coins'] and 'gold-chain' not in after['owned'], 'a doctored save can’t change coins or the wardrobe', after['coins'])

            # ---------- invites ----------
            await A.evaluate("clubNyc.api.goto('times-square')")
            await A.wait_for_timeout(2500)
            await B.goto(BASE + f'/join/{A_NAME}', wait_until='networkidle')
            await B.wait_for_selector('.si-invite:not([hidden])', timeout=8000)
            banner = await B.evaluate("document.querySelector('.si-invite').innerText")
            await B.screenshot(path=os.path.join(OUT, 'launch-invite-front-door.png'))
            check(A_NAME in banner and 'in the city right now' in banner and 'Times Square' not in banner, 'an invite link shows who invited you and that they’re online (never which room)', banner.replace('\n', ' '))
            await B.click('.si-play')
            await onboard(B, B_NAME, 2, from_creator=True)
            await finish_onboarding(B)
            await B.wait_for_timeout(4500)
            b_room = await B.evaluate("clubNyc.world.room.id")
            friends = (await api(B, '/friends'))['body']
            check(any(f['name'] == A_NAME for f in friends['friends']), 'joining through an invite makes you friends right away')
            check(b_room == 'times-square', 'the invited friend lands where the inviter is', b_room)
            bw = (await api(B, '/wallet'))['body']['coins']
            check(bw >= 100, 'the invited friend gets welcome coins', bw)
            # (name tags live in the overhead layer above everyone, one .overhead per person)
            a_sees = await A.evaluate(f"[...document.querySelectorAll('.overhead.remote .name-tag')].some(t => t.innerText.includes('{B_NAME}'))")
            check(a_sees, 'the inviter sees their friend arrive in the same room')
            refs = (await api(A, '/referrals'))['body']
            check(refs['count'] == 1, 'the inviter’s invite count goes up', refs['count'])
            a_before = (await api(A, '/wallet'))['body']['coins']
            await A.wait_for_timeout(16000)  # the friend "really plays" (12 s in this test)
            a_after = (await api(A, '/wallet'))['body']['coins']
            check(a_after - a_before == 100, 'the inviter is paid 100 once the friend has played a while', a_after - a_before)

            # ---------- reports and the auto-moderator ----------
            await onboard(C, C_NAME, 3)
            await finish_onboarding(C)
            await onboard(D, D_NAME, 0)
            await finish_onboarding(D)
            d_id = (await api(D, '/me'))['body']['user']['id']
            for pg in (A, B, C):
                await api(pg, '/reports', 'POST', {'target': d_id, 'reason': 'harassment', 'context': f'{D_NAME}: (test) rude message'})
            await D.wait_for_timeout(800)
            await D.click('.chat-input')
            await D.keyboard.type('hello?')
            await D.keyboard.press('Enter')
            await D.wait_for_timeout(1200)
            log = await D.evaluate("document.body.innerText")
            check('chat is paused' in log.lower() or 'can’t chat' in log.lower(), 'three reports in an hour pause someone’s chat automatically')

            # ---------- the moderator dashboard ----------
            M = watch(await ctx[3].new_page())
            await M.goto(BASE + '/admin.html', wait_until='networkidle')
            await M.fill('#token', TOKEN)
            await M.click('#go')
            await M.wait_for_selector('.stat', timeout=8000)
            stats = await M.evaluate("document.querySelector('[data-panel=overview]').innerText")
            await M.screenshot(path=os.path.join(OUT, 'launch-admin.png'), full_page=True)
            check('New Yorkers online' in stats and 'open reports' in stats and 'came back the next day' in stats, 'the moderator dashboard signs in and shows the city, growth and retention')
            bad_login = http('/api/admin/login', 'POST', {'token': 'nope'})[0]
            check(bad_login == 401, 'a wrong admin token is refused')
            check(http('/api/admin/overview')[0] == 401, 'the admin API is locked without signing in')
            reports = await M.evaluate("fetch('/api/admin/reports').then(r => r.json())")
            check(len(reports['reports']) == 3 and reports['reports'][0]['targetMuted'], 'the reports queue shows the three reports (target already muted)')
            await M.evaluate("tab('reports')")
            await M.wait_for_selector('.report')
            await M.screenshot(path=os.path.join(OUT, 'launch-admin-reports.png'), full_page=True)

            # announcement
            await M.evaluate("fetch('/api/admin/announce', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({text: 'Launch-night Dance Jam in 5 minutes!'})})")
            await A.wait_for_selector('.announce', timeout=5000)
            await A.screenshot(path=os.path.join(OUT, 'launch-announcement.png'))
            check('Launch-night Dance Jam' in await A.evaluate("document.querySelector('.announce').innerText"), 'announcements reach everyone online')

            # ban
            ban = await M.evaluate(f"fetch('/api/admin/users/{d_id}/action', {{method:'POST', headers:{{'content-type':'application/json'}}, body: JSON.stringify({{action:'ban', minutes: 1440, reason: 'Harassing other players'}})}}).then(r => r.json())")
            await D.wait_for_timeout(1500)
            kicked = await D.evaluate("document.body.innerText")
            check(ban.get('ok') and 'removed from the city' in kicked, 'a banned player is removed from the city immediately')
            await D.reload(wait_until='networkidle')
            await D.wait_for_timeout(1500)
            ban_screen = await D.evaluate("document.body.innerText")
            await D.screenshot(path=os.path.join(OUT, 'launch-banned.png'))
            check('suspended' in ban_screen and 'Harassing other players' in ban_screen and 'moderators@example.test' in ban_screen, 'coming back shows the suspension, the reason and how to appeal')

            # maintenance
            await M.evaluate("fetch('/api/admin/maintenance', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({on: true, message: 'Back in five!'})})")
            await A.wait_for_timeout(1500)
            check('Back in five!' in await A.evaluate("document.body.innerText"), 'maintenance mode tells everyone online and closes the city')
            await M.evaluate("fetch('/api/admin/maintenance', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({on: false})})")
            await A.wait_for_selector('.online-pill.on', timeout=45000)
            check(True, 'players reconnect on their own when maintenance ends')

            # ---------- crash reports ----------
            await B.evaluate("setTimeout(() => { throw new Error('launch-test boom') }, 0)")
            await B.wait_for_timeout(1200)
            errs = await M.evaluate("fetch('/api/admin/errors').then(r => r.json())")
            check(any('launch-test boom' in e['message'] for e in errs['errors']), 'crashes in players’ browsers show up on the dashboard')

            # ---------- delete account ----------
            gone = await api(C, '/me', 'DELETE')
            me_after = await api(C, '/me')
            check(gone['status'] == 200 and me_after['body']['user'] is None, 'deleting your account removes it')

            # ---------- backups ----------
            snap = await M.evaluate("fetch('/api/admin/backups', {method:'POST', headers:{'content-type':'application/json'}, body: '{}'}).then(r => r.json())")
            listing = await M.evaluate("fetch('/api/admin/backups').then(r => r.json())")
            check(snap.get('ok') and len(listing.get('backups', [])) >= 1, 'a moderator can take and list database backups', len(listing.get('backups', [])))

            # ---------- nothing a client sends can crash the city ----------
            look = (await api(A, '/me'))['body']['user']['look']
            _, _, gh = http('/api/auth/guest', 'POST', {})
            rob = (gh.get('set-cookie') or '').split(';')[0]
            st, _, _ = http('/api/profile', 'POST', {'name': 'Rob' + tag, 'look': look, 'team': 'midtown', 'birth': {'m': 1, 'y': 2000}, 'consent': POLICY}, cookie=rob)
            probes = {
                'a malformed session cookie': raw_ws('club_sid=%E0%A4%A'),
                'invalid UTF-8 in a message': raw_ws(rob, text_frame(b'{"t":"s","m":"\xff\xfe\xfd"}')),
                'a message over the 4 KB limit': raw_ws(rob, text_frame(b'{"t":"s","m":"' + b'x' * 5000 + b'"}')),
            }
            alive = http('/api/health')[0] == 200
            check(st == 200 and probes['a malformed session cookie'].startswith('HTTP/1.1 401') and '101' in probes['invalid UTF-8 in a message'] and alive,
                  'a malformed cookie, invalid UTF-8 and an oversized message are refused without crashing the server', probes)
            req = urllib.request.Request(BASE + '/api/save', method='PUT', data=b'{}', headers={'content-type': 'application/json', 'origin': 'null', 'cookie': rob})
            try:
                urllib.request.urlopen(req, timeout=5)
                code = 200
            except urllib.error.HTTPError as e:
                code = e.code
            check(code == 403, 'a request from an "Origin: null" page is refused (not a server error)', code)
            check(await A.evaluate("!!document.querySelector('.online-pill.on')"), 'other players stay connected through all of that')

            # ---------- graceful restart ----------
            srv.stop(signal.SIGTERM)
            await A.wait_for_timeout(800)
            srv.start()
            t0 = time.time()
            await A.wait_for_selector('.online-pill.on', timeout=60000)
            check(True, f'after a restart players reconnect by themselves ({time.time() - t0:.1f}s)')
            a_coins = (await api(A, '/wallet'))['body']['coins']
            check(a_coins == a_after, 'wallets survive the restart', a_coins)

            # ---------- a policy update: returning players agree again before heading in ----------
            import sqlite3
            con = sqlite3.connect(os.path.join(tmp, 'launch.db'))
            con.execute('UPDATE users SET consent_version = ? WHERE name = ?', ('2000-01-01', A_NAME))
            con.commit()
            con.close()
            await A.goto(BASE + '/play', wait_until='networkidle')
            await A.wait_for_selector('.consent-panel', timeout=10000)
            asked = await A.evaluate("document.querySelector('.consent-panel h2')?.textContent ?? ''")
            await A.click('.consent-panel .cr-age input')
            await A.click('.consent-panel .btn.go')
            await A.wait_for_selector('.online-pill.on', timeout=15000)
            me = (await api(A, '/me'))['body']['user']
            check('head back in' in asked and me.get('consentVersion') == POLICY, 'after a policy update, a returning player agrees to the new version before heading in', (asked, me.get('consentVersion')))
            check(not csp_errors, 'no Content-Security-Policy violations in any browser all run', csp_errors[:3])
            await b.close()
    finally:
        srv.stop()
        if keep:
            print('kept', tmp)
        else:
            shutil.rmtree(tmp, ignore_errors=True)
    passed = sum(1 for ok, _ in results if ok)
    print(f'\n{passed}/{len(results)} checks passed')
    sys.exit(0 if passed == len(results) else 1)


asyncio.run(main())
