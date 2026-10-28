"""The launch waitlist, the Coming Soon gate and email sign-in, end to end.
usage: .venv/bin/python tools/waitlist_test.py           (its own private stacks: waitlist mode, then open mode)
       .venv/bin/python tools/waitlist_test.py --prod    (also a production build on a throwaway server: ~1 min more)

Runs on private stacks (tools/stack.py: a frozen copy of app/ and server/, a dev game server + Vite on free ports, a
throwaway database), never on your dev servers. In development no email is sent: the server prints each one as an `[email] {...}` line with its links,
and the test reads them from the stack's log. Checks:
  - waitlist signups over HTTP: happy path, duplicate (any case), bad addresses, the honeypot, the per-IP rate limit,
    the confirmation link, the one-click unsubscribe link (and RFC 8058 POST), a tampered link, the honest count
    (hidden below WAITLIST_PUBLIC_MIN), the admin overview, CSV export, deleting a signup, and the launch email
    (refused while still in waitlist mode, sent with force, marks everyone, safe to re-run)
  - waitlist mode: /play, /play.html and /join/<name> show Coming Soon; a wrong preview code says so; the right one
    sets a cookie that opens the game; new guests and sign-ins are refused without it; /play?preview=off locks it again
  - the landing page in waitlist mode (1280 and 390 wide): the hero form, its messages, joined state across all forms,
    the header button, the sheet, the count line; the Coming Soon page's form and an invite link's referrer
  - email sign-in: Continue with Email → the link → a signed-in account with an email identity; the used link again
    (signed in: "That Link Has Expired"; signed out: the front door's expired state); and Link Email from the player
    card attaching the email to the guest's own New Yorker
  - open mode: Play Now is back, /play is the game, the front door offers Continue with Email
Screenshots: tools/out/waitlist/*.png"""
import asyncio, http.client, json, os, re, secrets, shutil, signal, subprocess, sys, tempfile, time
from urllib.parse import urlparse, quote
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
from stack import PrivateStack, free_port, wait_http  # noqa: E402

OUT = os.path.join(HERE, 'out', 'waitlist')
os.makedirs(OUT, exist_ok=True)
PREVIEW = 'wl-preview-' + secrets.token_hex(5)
TOKEN = 'wl-admin-' + secrets.token_hex(8)
TAG = format(int(time.time()) % 100000, 'x')
results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  ({detail})' if detail and not ok else ''), flush=True)


def mail(n):
    return f'wl{TAG}.{n}@example.com'


class Http:
    """A tiny HTTP client with its own cookie jar that never follows redirects (so they can be checked)."""

    def __init__(self, base):
        self.base = base
        self.cookies = {}

    def __call__(self, method, path, body=None, ip=None, headers=None, jar=True):
        u = urlparse(self.base)
        conn = http.client.HTTPConnection(u.hostname, u.port, timeout=20)
        h = {'Accept': 'application/json, text/html'}
        data = None
        if body is not None:
            h['Content-Type'] = 'application/json'
            data = json.dumps(body)
        if ip:
            h['X-Real-IP'] = ip
        if jar and self.cookies:
            h['Cookie'] = '; '.join(f'{k}={v}' for k, v in self.cookies.items())
        h.update(headers or {})
        conn.request(method, path, body=data, headers=h)
        r = conn.getresponse()
        text = r.read().decode('utf-8', 'replace')
        raw = r.getheaders()
        conn.close()
        for k, v in raw:
            if k.lower() == 'set-cookie' and jar:
                name, _, val = v.split(';', 1)[0].partition('=')
                if not val or 'Max-Age=0' in v:
                    self.cookies.pop(name, None)
                else:
                    self.cookies[name] = val
        try:
            js = json.loads(text)
        except Exception:
            js = None
        return r.status, {k.lower(): v for k, v in raw}, text, js


def emails(log_path):
    """the emails the dev server printed instead of sending"""
    out = []
    with open(log_path, encoding='utf-8', errors='replace') as f:
        for line in f:
            if line.startswith('[email] {'):
                try:
                    out.append(json.loads(line[len('[email] '):]))
                except Exception:
                    pass
    return out


def wait_email(log_path, to, subject_part, seen=0, secs=10):
    """the newest email to `to` whose subject contains `subject_part`, once there are more than `seen` of them"""
    for _ in range(int(secs * 4)):
        found = [e for e in emails(log_path) if e.get('to') == to and subject_part in e.get('subject', '')]
        if len(found) > seen:
            return found[-1]
        time.sleep(0.25)
    return None


def path_of(url):
    u = urlparse(url)
    return u.path + (('?' + u.query) if u.query else '')


# ---------------------------------------------------------------- HTTP: the waitlist and the gate
def http_checks(base, log_path):
    h = Http(base)
    ip = iter(f'198.51.100.{i}' for i in range(1, 250))
    st, _, _, js = h('GET', '/api/launch')
    check('GET /api/launch says waitlist mode, Coming Soon for this visitor, email on (dev log)', st == 200 and js == {'mode': 'waitlist', 'preview': False, 'soon': True, 'email': True}, js)

    # ---- the pages
    st, _, html, _ = h('GET', '/')
    check('the landing page is marked data-launch="waitlist" with a Coming Soon title', st == 200 and 'data-launch="waitlist"' in html and 'Coming Soon' in re.search(r'<title>([^<]*)', html).group(1), re.search(r'<title>([^<]*)', html).group(1))
    for page in ('/play', '/play/', '/play.html', '/join/SomeoneNice'):
        st, _, html, _ = h('GET', page)
        check(f'{page} shows the Coming Soon page, not the game', st == 200 and 'Coming Soon to a Browser Near You' in html and 'src/main.ts' not in html, st)
    st, hd, _, _ = h('GET', '/play?preview=nope')
    check('/play?preview=<code> goes to check the code first (it never stays in the address)', st == 302 and hd.get('location', '').startswith('/api/launch/preview?code=nope&to=%2Fplay'), hd.get('location'))
    st, hd, _, _ = h('GET', path_of(hd.get('location', '/')))
    check('a wrong preview code comes back to Coming Soon with ?code=wrong', st == 302 and hd.get('location') == '/play?code=wrong' and 'club_preview' not in h.cookies, hd.get('location'))
    # ---- new accounts are for testers only
    st, _, _, js = h('POST', '/api/auth/guest')
    check('no new guests in waitlist mode without the preview code (403 coming-soon)', st == 403 and js and js.get('error') == 'coming-soon', (st, js))
    st, _, _, js = h('POST', '/api/auth/email', {'email': mail('nobody')})
    check('no email sign-in links in waitlist mode without the preview code', st == 403 and js and js.get('error') == 'coming-soon', (st, js))
    st, hd, _, _ = h('GET', '/api/auth/google')
    check('a sign-in button visit in waitlist mode lands on the Coming Soon page', st == 302 and hd.get('location') == '/play', (st, hd.get('location')))
    # ---- the preview code
    st, hd, _, _ = h('GET', f'/play?preview={quote(PREVIEW)}')
    st, hd, _, _ = h('GET', path_of(hd.get('location', '/')))
    check('the right preview code sets an httpOnly cookie and goes back to /play', st == 302 and hd.get('location') == '/play' and 'club_preview' in h.cookies and 'HttpOnly' in hd.get('set-cookie', ''), hd.get('set-cookie'))
    st, _, html, _ = h('GET', '/play')
    check('with the preview cookie, /play is the game', st == 200 and 'src/main.ts' in html and 'Coming Soon to a Browser Near You' not in html)
    st, _, html, _ = h('GET', '/join/SomeoneNice')
    check('...and invite links open the game too', st == 200 and 'src/main.ts' in html)
    st, _, _, js = h('GET', '/api/launch')
    check('GET /api/launch knows this browser is a tester', js and js.get('preview') is True and js.get('soon') is False, js)
    st, _, _, js = h('POST', '/api/auth/guest')
    check('a tester can start a guest', st == 200 and js and js.get('ok'), (st, js))
    h2 = Http(base)
    h2.cookies = dict(h.cookies)
    st, hd, _, _ = h2('GET', '/play?preview=off')
    st, hd, _, _ = h2('GET', path_of(hd.get('location', '/')))
    st, _, html, _ = h2('GET', '/play')
    check('/play?preview=off forgets the code (Coming Soon again)', 'club_preview' not in h2.cookies and 'Coming Soon to a Browser Near You' in html, h2.cookies.keys())

    # ---- signups
    a = mail('a')
    st, _, _, js = h('GET', '/api/waitlist/count')
    check('the public count is null while the list is small (no tiny numbers)', st == 200 and js == {'count': None}, js)
    st, _, _, js = h('POST', '/api/waitlist', {'email': f'  {a.upper()}  ', 'source': 'test-hero'}, ip=next(ip))
    check('signing up: "You’re on the list", with a confirmation email (dev: printed)', st == 200 and js and js.get('status') == 'added' and js.get('confirm') is True, (st, js))
    conf = wait_email(log_path, a, 'Thanks for Joining the Club NYC Waitlist')
    links = conf.get('links', []) if conf else []
    confirm_url = next((l for l in links if '/api/waitlist/confirm?token=' in l), None)
    unsub_url = next((l for l in links if '/api/waitlist/unsubscribe?u=' in l), None)
    check('the confirmation email went to the lowercased address, with a confirm and an unsubscribe link', bool(confirm_url and unsub_url), links)
    st, _, _, js = h('POST', '/api/waitlist', {'email': a.replace('wl', 'WL'), 'source': 'test-final'}, ip=next(ip))
    check('the same address again (any case): "Already on the list", still waiting to confirm', st == 200 and js and js.get('status') == 'already' and js.get('pending') is True, js)
    for bad in ('', 'nope', 'a@b', 'two words@example.com', 'x@example.c', 'a@@example.com', ('x' * 250) + '@example.com'):
        st, _, _, js = h('POST', '/api/waitlist', {'email': bad}, ip=next(ip))
        check(f'a bad address is refused: {bad[:24]!r}', st == 400 and js and js.get('error') == 'bad-email', (st, js))
    st, _, _, js = h('POST', '/api/waitlist', {'not': 'a form'}, ip=next(ip))
    check('a malformed body is refused', st == 400, st)
    bot = mail('bot')
    st, _, _, js = h('POST', '/api/waitlist', {'email': bot, 'website': 'http://spam.example'}, ip=next(ip))
    check('the honeypot: a bot gets a polite "added" and nothing is stored (checked below)', st == 200 and js and js.get('status') == 'added', js)
    # ---- the per-IP limit (10 a minute, bursts of 5)
    codes = [h('POST', '/api/waitlist', {'email': mail(f'burst{i}')}, ip='203.0.113.77')[0] for i in range(8)]
    check('one address (IP) signing up over and over is slowed down (429)', codes[:5] == [200] * 5 and 429 in codes[5:], codes)
    st, hd, _, js = h('POST', '/api/waitlist', {'email': mail('burst9')}, ip='203.0.113.77')
    check('...with a Retry-After header', st == 429 and hd.get('retry-after'), hd.get('retry-after'))

    # ---- confirm, and the honest count (WAITLIST_PUBLIC_MIN=3 on this stack)
    st, hd, _, _ = h('GET', path_of(confirm_url), jar=False)
    check('the confirmation link confirms and lands on the landing page with a note', st == 302 and hd.get('location') == '/?waitlist=confirmed', hd.get('location'))
    st, hd, _, _ = h('GET', path_of(confirm_url), jar=False)
    check('clicking it again is harmless', st == 302 and hd.get('location') == '/?waitlist=confirmed', hd.get('location'))
    st, _, _, js = h('GET', '/api/waitlist/count')
    check('one confirmed person is still below the threshold: no count', js == {'count': None}, js)
    for who in ('b', 'c'):
        h('POST', '/api/waitlist', {'email': mail(who), 'source': 'test-sheet', 'ref': 'Inviter_1'}, ip=next(ip))
        e = wait_email(log_path, mail(who), 'Thanks for Joining the Club NYC Waitlist')
        u = next((l for l in (e or {}).get('links', []) if '/confirm?' in l), None)
        if u:
            h('GET', path_of(u), jar=False)
    st, _, _, js = h('GET', '/api/waitlist/count')
    check('three confirmed people: the public count shows, and it’s exact', js == {'count': 3}, js)
    pending = mail('pending')
    h('POST', '/api/waitlist', {'email': pending, 'source': 'test-hero'}, ip=next(ip))
    st, _, _, js = h('GET', '/api/waitlist/count')
    check('an unconfirmed signup isn’t counted', js == {'count': 3}, js)

    # ---- unsubscribe
    bad_unsub = re.sub(r'u=(\d+)\.', lambda m: f'u={int(m.group(1)) + 1}.', unsub_url)
    st, hd, _, _ = h('GET', path_of(bad_unsub), jar=False)
    check('a tampered unsubscribe link does nothing ("that link didn’t work")', st == 302 and hd.get('location') == '/?waitlist=bad-link', hd.get('location'))
    st, hd, _, _ = h('GET', path_of(unsub_url), jar=False)
    check('the one-click unsubscribe link takes you off the list', st == 302 and hd.get('location') == '/?waitlist=unsubscribed', hd.get('location'))
    st, _, _, js = h('GET', '/api/waitlist/count')
    check('...and the count drops back below the threshold', js == {'count': None}, js)
    st, hd, body, _ = h('POST', path_of(unsub_url), jar=False)
    check('mail apps’ one-click unsubscribe (RFC 8058 POST) answers 200, even twice', st == 200, (st, body))

    # ---- the moderator dashboard
    adm = Http(base)
    st, _, _, js = adm('POST', '/api/admin/login', {'token': TOKEN})
    check('moderator login', st == 200 and 'club_admin' in adm.cookies, (st, js))
    st, _, _, w = adm('GET', '/api/admin/waitlist')
    c = (w or {}).get('counts', {})
    check('the dashboard counts: on the list, confirmed, waiting to confirm, unsubscribed', c.get('confirmed') == 2 and c.get('pending', 0) >= 1 and c.get('unsubscribed') == 1 and c.get('eligible') == 2, c)
    check('...signups by day (30 New York days) and where people joined', len((w or {}).get('days', [])) >= 29 and any(s.get('source') == 'test-sheet' for s in w.get('sources', [])), (len(w.get('days', [])), w.get('sources')))
    check('...and who invited them', any(r.get('referrer') == 'Inviter_1' and r.get('n') == 2 for r in w.get('referrers', [])), w.get('referrers'))
    st, _, _, js = adm('GET', f'/api/admin/waitlist/rows?q=wl{TAG}')
    rows = (js or {}).get('rows', [])
    emails_listed = [r['email'] for r in rows]
    check('the honeypot signup was never stored', bot not in emails_listed and not any('bot@' in e for e in emails_listed), emails_listed)
    check('the unsubscribed address is gone (only a fingerprint stays)', a not in emails_listed and any(r['status'] == 'unsubscribed' and r['email'] == '(unsubscribed)' for r in adm('GET', '/api/admin/waitlist/rows')[3]['rows']), emails_listed)
    st, hd, csv, _ = adm('GET', '/api/admin/waitlist.csv')
    check('CSV export: a spreadsheet of who’s still in line', st == 200 and 'text/csv' in hd.get('content-type', '') and 'attachment' in hd.get('content-disposition', '') and csv.startswith('email,status,') and mail('b') in csv and a not in csv, csv[:80])
    st, _, _, js = h('POST', '/api/waitlist', {'email': a}, ip=next(ip))
    check('someone who unsubscribed can join again (a fresh start)', js and js.get('status') == 'added', js)
    victim = next((r for r in adm('GET', f'/api/admin/waitlist/rows?q={quote(pending)}')[3]['rows'] if r['email'] == pending), None)
    st, _, _, js = adm('POST', f"/api/admin/waitlist/{victim['id'] if victim else 0}/delete", {})
    gone = not [r for r in adm('GET', f'/api/admin/waitlist/rows?q={quote(pending)}')[3]['rows'] if r['email'] == pending]
    check('a deletion request: Delete removes the signup for good', js and js.get('ok') and gone, js)

    # ---- the launch email
    st, _, _, js = adm('POST', '/api/admin/waitlist/launch-email', {})
    check('the launch email is refused while the city is still in waitlist mode', js and js.get('error') == 'still-waitlist', js)
    eligible = adm('GET', '/api/admin/waitlist')[3]['counts']['eligible']
    st, _, _, js = adm('POST', '/api/admin/waitlist/launch-email', {'force': True})
    check('...sent with force: it starts in the background and says how many', js and js.get('ok') and js.get('total') == eligible, (js, eligible))
    for _ in range(40):
        job = adm('GET', '/api/admin/waitlist')[3].get('job') or {}
        if not job.get('running'):
            break
        time.sleep(0.25)
    check('the launch email reached everyone eligible (confirmed, still subscribed)', job.get('sent') == eligible and not job.get('failed'), job)
    rows = adm('GET', '/api/admin/waitlist/rows')[3]['rows']
    st_b = next((r['status'] for r in rows if r['email'] == mail('b')), None)
    st_a = next((r['status'] for r in rows if r['email'] == a), None)
    check('...each is marked emailed; the unconfirmed re-signup isn’t', st_b == 'emailed' and st_a == 'waiting to confirm', (st_b, st_a))
    launch = wait_email(log_path, mail('b'), 'Club NYC Is Open')
    check('the launch email has the Play Now link and its own unsubscribe link', launch and any('/play?start=guest' in l for l in launch['links']) and any('/api/waitlist/unsubscribe?u=' in l for l in launch['links']), launch)
    st, _, _, js = adm('POST', '/api/admin/waitlist/launch-email', {'force': True})
    check('running it again is safe: nobody is emailed twice', js and js.get('ok') is False and js.get('error') == 'nobody-left', js)
    st, _, html, _ = adm('GET', '/api/admin/waitlist/launch-email/preview')
    check('the dashboard can preview the launch email (no em dashes, Title Case button)', st == 200 and 'The City Is Open!' in html and '>Play Now<' in html and '—' not in html, st)
    st, _, _, js = adm('POST', '/api/admin/waitlist/launch-email/test', {'to': mail('test')})
    check('Send a Test goes to one address of your choosing', js and js.get('ok') and wait_email(log_path, mail('test'), 'Club NYC Is Open'), js)
    # a third confirmed person (the one who came back), so the landing page's count line has something real to show
    again = wait_email(log_path, a, 'Thanks for Joining the Club NYC Waitlist', seen=1)
    u = next((l for l in (again or {}).get('links', []) if '/confirm?' in l), None)
    if u:
        h('GET', path_of(u), jar=False)
    st, _, _, js = h('GET', '/api/waitlist/count')
    check('rejoined and confirmed: counted again (3)', js == {'count': 3}, js)
    return h.cookies.get('club_preview')


# ---------------------------------------------------------------- the browser: landing, Coming Soon, email sign-in
async def enter_city(pg, base, name):
    await pg.goto(base + '/play', wait_until='networkidle')
    await pg.wait_for_selector('.si-live.busy, .si-live.quiet', timeout=15000)
    await pg.click('.si-play')
    await pg.wait_for_selector('.creator-card', timeout=30000)
    await pg.locator('.cr-preset').nth(1).click()
    await pg.click('.creator-actions .btn.go')
    await pg.wait_for_selector('.creator-name input')
    await pg.fill('.creator-name input', name)
    await pg.wait_for_selector('.cr-avail.ok', timeout=8000)
    await pg.select_option('.cr-month', '6')
    await pg.select_option('.cr-year', '2000')
    await pg.click('.cr-age input')
    await pg.click('.creator-actions .btn.go')
    await pg.wait_for_selector('.online-pill.on', timeout=20000)
    try:
        await pg.wait_for_selector('.tour .tour-skip', timeout=9000)
        await pg.click('.tour .tour-skip')
        await pg.wait_for_timeout(300)
    except Exception:
        pass


async def browser_checks(base, log_path, preview_cookie):
    host = urlparse(base).hostname
    async with async_playwright() as p:
        b = await p.chromium.launch()
        errors = []

        async def page(w=1280, h=800, mobile=False, preview=False):
            ctx = await b.new_context(viewport={'width': w, 'height': h}, is_mobile=mobile, has_touch=mobile)
            if preview:
                await ctx.add_cookies([{'name': 'club_preview', 'value': preview_cookie, 'domain': host, 'path': '/'}])
            pg = await ctx.new_page()
            pg.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
            return pg

        # ---- the landing page, waitlist version
        pg = await page()
        await pg.goto(base + '/?waitlist=confirmed', wait_until='networkidle')
        check('the landing page in waitlist mode shows the form and hides Play Now', await pg.is_visible('.hero-join .wl-input') and not await pg.is_visible('.hero-cta .btn-play'))
        note = await pg.text_content('.l-toast') if await pg.is_visible('.l-toast') else ''
        check('back from the confirmation link: "You’re confirmed!" and a clean address bar', 'confirmed' in (note or '') and 'waitlist=' not in pg.url, (note, pg.url))
        check('the count line shows the real number once it’s above the threshold', await pg.is_visible('.hero-join .wl-count') and 'in line' in (await pg.text_content('.hero-join .wl-count')), await pg.text_content('.hero-join .wl-count'))
        await pg.screenshot(path=os.path.join(OUT, 'landing-waitlist-1280.png'))
        await pg.click('.hero-join button[type=submit]')
        check('Join with an empty field says what to do', 'Type your email' in (await pg.text_content('.hero-join .wl-msg')))
        await pg.fill('#wl-hero', 'not-an-email')
        await pg.click('.hero-join button[type=submit]')
        check('a bad address says so, in words', 'doesn’t look right' in (await pg.text_content('.hero-join .wl-msg')))
        await pg.fill('#wl-hero', mail('landing'))
        await pg.click('.hero-join button[type=submit]')
        await pg.wait_for_selector('.hero-join .wl-done', timeout=8000)
        done = await pg.text_content('.hero-join .wl-done')
        check('joining from the hero: "You’re on the list!" (and check your inbox to confirm)', 'You’re on the list!' in done and 'confirm' in done, done)
        check('...every form on the page shows it (the last call too)', await pg.locator('.final .wl-done').count() == 1)
        check('the address reached the server, with where it came from', wait_email(log_path, mail('landing'), 'Thanks for Joining the Club NYC Waitlist') is not None)
        await pg.screenshot(path=os.path.join(OUT, 'landing-waitlist-joined.png'))
        await pg.reload(wait_until='networkidle')
        check('back again later: the page remembers you joined', await pg.is_visible('.hero-join .wl-done'))
        await pg.click('.hero-join .wl-again')
        check('"Use a Different Email" brings the form back', await pg.is_visible('#wl-hero'))
        await pg.evaluate('scrollTo(0, 0)')
        # the header's Join the Waitlist, Discord link and the hero's trailer button are hidden for now (the user's call)
        check('the header shows no Discord link or Join the Waitlist button, and the hero no trailer button (hidden for now)',
              not await pg.is_visible('.site-header [data-join=header]') and not await pg.is_visible('.site-header .discord-link') and not await pg.is_visible('.hero .btn-trailer'))
        await pg.evaluate("document.querySelector('.mid-cta').scrollIntoView({block: 'center'})")
        await pg.wait_for_timeout(300)
        await pg.click('.mid-cta [data-join=features]')
        await pg.wait_for_selector('#join-sheet[open]', timeout=3000)
        check('further down, Join the Waitlist opens the sheet with its own form, cursor in the field', await pg.evaluate("document.activeElement?.id") == 'wl-sheet')
        await pg.screenshot(path=os.path.join(OUT, 'landing-waitlist-sheet.png'))
        await pg.fill('#wl-sheet', mail('sheet'))
        await pg.click('#join-sheet button[type=submit]')
        await pg.wait_for_selector('#join-sheet .wl-done', timeout=8000)
        check('joining from the sheet works too', 'on the list' in (await pg.text_content('#join-sheet .wl-done')))
        await pg.context.close()

        pg = await page(390, 844, mobile=True)
        await pg.goto(base + '/', wait_until='networkidle')
        overflow = await pg.evaluate('document.documentElement.scrollWidth - innerWidth')
        check('phones: the waitlist landing page fits (no sideways scroll), with the form', overflow <= 0 and await pg.is_visible('#wl-hero'), overflow)
        note = await pg.text_content('.hero-note')
        check('phones are told the city plays on a computer (and can still join)', 'computer' in (note or ''), note)
        await pg.screenshot(path=os.path.join(OUT, 'landing-waitlist-390.png'))
        await pg.fill('#wl-hero', mail('phone'))
        await pg.click('.hero-join button[type=submit]')
        await pg.wait_for_selector('.hero-join .wl-done', timeout=8000)
        check('joining on a phone works', True)
        await pg.context.close()

        # ---- Coming Soon instead of the game
        pg = await page()
        await pg.goto(base + '/play?preview=definitely-wrong', wait_until='networkidle')
        check('a wrong preview code: the Coming Soon page says the code didn’t work', 'Coming Soon to a Browser Near You' in (await pg.text_content('h1')) and await pg.is_visible('.soon-code'))
        await pg.screenshot(path=os.path.join(OUT, 'coming-soon-1280.png'))
        await pg.fill('#wl-soon', mail('soon'))
        await pg.click('.soon-card button[type=submit]')
        await pg.wait_for_selector('.soon-card .wl-done', timeout=8000)
        check('joining from the Coming Soon page', 'on the list' in (await pg.text_content('.soon-card .wl-done')))
        await pg.context.close()

        # ---- the preview code in a browser, then email sign-in
        pg = await page()
        await pg.goto(base + f'/play?preview={quote(PREVIEW)}', wait_until='networkidle')
        await pg.wait_for_selector('.si-play', timeout=15000)
        check('the preview code opens the game’s front door', 'preview=' not in pg.url, pg.url)
        await pg.wait_for_selector('.si-btn.email', timeout=8000)
        await pg.click('.si-btn.email')
        await pg.fill('.si-email-input', mail('signin'))
        await pg.screenshot(path=os.path.join(OUT, 'front-door-email.png'))
        await pg.click('.si-send')
        await pg.wait_for_selector('.si-sent', timeout=8000)
        sent = await pg.text_content('.si-sent')
        check('Continue with Email: "Check your inbox!" with the address masked', 'Check your inbox!' in sent and mail('signin') not in sent and '•••@example.com' in sent, sent)
        await pg.screenshot(path=os.path.join(OUT, 'front-door-sent.png'))
        e = wait_email(log_path, mail('signin'), 'Sign-In Link')
        link = next((l for l in (e or {}).get('links', []) if '/api/auth/email/verify?token=' in l), None)
        check('the sign-in email has a one-time link', bool(link), e)
        await pg.goto(link, wait_until='networkidle')
        await pg.wait_for_selector('.creator-card', timeout=30000)
        me = await pg.evaluate("fetch('/api/me').then(r => r.json())")
        user = (me or {}).get('user') or {}
        check('the link signs in a new account with an email identity, straight to making a New Yorker', 'email' in user.get('providers', []) and user.get('isGuest') is False and 'login=' not in pg.url, user)
        await pg.goto(link, wait_until='networkidle')
        body = await pg.text_content('body')
        check('the same link again while signed in: "That Link Has Expired", with a way back', 'That Link Has Expired' in body and await pg.is_visible('a[href="/play"]'), body[:120])
        await pg.context.close()

        pg = await page(preview=True)
        await pg.goto(link, wait_until='networkidle')
        await pg.wait_for_selector('.si-email-msg.bad', timeout=15000)
        msg = await pg.text_content('.si-email-msg')
        check('the used link signed out: the front door opens the email form saying it expired', 'expired' in msg and 'email=' not in pg.url, (msg, pg.url))
        await pg.screenshot(path=os.path.join(OUT, 'front-door-expired.png'))
        await pg.context.close()

        # ---- a guest links their email from the player card (and keeps their New Yorker)
        pg = await page(1000, 565, preview=True)
        name = f'Wl_{TAG}'
        await enter_city(pg, base, name)
        before = (await pg.evaluate("fetch('/api/me').then(r => r.json())"))['user']
        await pg.click('[aria-label="Player Card & Wardrobe"]')
        await pg.wait_for_selector('.player-card', timeout=5000)
        await pg.locator('.pc-view', has_text='Account').click()
        await pg.wait_for_selector('.link-email', timeout=8000)
        await pg.click('.link-email')
        await pg.fill('.pc-email-input', mail('linked'))
        await pg.screenshot(path=os.path.join(OUT, 'player-card-link-email.png'))
        await pg.click('.pc-email-form button[type=submit]')
        await pg.wait_for_selector('.pc-email-sent', timeout=8000)
        check('Link Email on the player card: "Check your inbox!"', 'Check your inbox!' in (await pg.text_content('.pc-email-sent')))
        await pg.screenshot(path=os.path.join(OUT, 'player-card-link-sent.png'))
        e = wait_email(log_path, mail('linked'), 'Link Your Email')
        check('the email says it links this New Yorker by name', e is not None, e)
        link = next((l for l in (e or {}).get('links', []) if '/verify?token=' in l), None)
        other = await (await b.new_context(viewport={'width': 1000, 'height': 565})).new_page()
        await other.goto(link, wait_until='domcontentloaded')
        await other.wait_for_timeout(1500)
        after = (await pg.evaluate("fetch('/api/me').then(r => r.json())"))['user']
        check('opened anywhere (another browser), the link attaches the email to the same New Yorker', after and after['id'] == before['id'] and 'email' in after.get('providers', []) and after.get('isGuest') is False, (before.get('id'), after))
        await other.context.close()
        await pg.context.close()

        # ---- an invite link before launch
        pg = await page()
        await pg.goto(base + f'/join/{name}', wait_until='networkidle')
        await pg.wait_for_selector('.soon-invite:not([hidden])', timeout=8000)
        check('an invite link before launch: "<name> invited you to Club NYC!" on the Coming Soon page', name in (await pg.text_content('.soon-invite')))
        await pg.screenshot(path=os.path.join(OUT, 'coming-soon-invite.png'))
        await pg.fill('#wl-soon', mail('invited'))
        await pg.click('.soon-card button[type=submit]')
        await pg.wait_for_selector('.soon-card .wl-done', timeout=8000)
        await pg.context.close()
        adm = Http(base)
        adm('POST', '/api/admin/login', {'token': TOKEN})
        rows = adm('GET', f"/api/admin/waitlist/rows?q={quote(mail('invited'))}")[3]['rows']
        check('...and the signup remembers who invited them (source "join")', rows and rows[0].get('referrer') == name and rows[0].get('source') == 'join', rows)
        check('no page errors in the browser', not errors, errors[:3])
        await b.close()


# ---------------------------------------------------------------- open mode
async def open_checks(base):
    h = Http(base)
    st, _, html, _ = h('GET', '/')
    check('open mode: the landing page is marked data-launch="open" with its usual title', 'data-launch="open"' in html and 'Coming Soon' not in re.search(r'<title>([^<]*)', html).group(1))
    st, _, html, _ = h('GET', '/play')
    check('open mode: /play is the game', st == 200 and 'src/main.ts' in html)
    st, _, _, js = h('POST', '/api/auth/guest')
    check('open mode: anyone can start a guest', st == 200 and js and js.get('ok'))
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context(viewport={'width': 1280, 'height': 800})).new_page()
        await pg.goto(base + '/', wait_until='networkidle')
        check('open mode: Play Now is back and the waitlist form is hidden', await pg.is_visible('.hero-cta .btn-play') and not await pg.is_visible('#wl-hero') and (await pg.text_content('.hero-cta .play-label')) == 'Play Now')
        await pg.screenshot(path=os.path.join(OUT, 'landing-open-1280.png'))
        pg2 = await (await b.new_context(viewport={'width': 1000, 'height': 565})).new_page()
        await pg2.goto(base + '/play', wait_until='networkidle')
        await pg2.wait_for_selector('.si-btn.email', timeout=15000)
        check('open mode: the front door offers Continue with Email (Title Case)', (await pg2.text_content('.si-btn.email')).strip() == 'Continue with Email' and (await pg2.text_content('.si-play')).strip() == 'Play Now')
        await pg2.screenshot(path=os.path.join(OUT, 'front-door-open.png'))
        await b.close()


# ---------------------------------------------------------------- production (a built copy, NODE_ENV=production, LAUNCH_MODE unset)
def prod_checks():
    stack = PrivateStack(frozen=True, prefix='clubnyc-wlprod-')
    stack._freeze()
    port = free_port()
    proc = None
    log = open(os.path.join(stack.tmp, 'prod.log'), 'a')
    try:
        build = subprocess.run(['npx', 'vite', 'build', '--logLevel', 'warn'], cwd=stack.app_dir, stdout=log, stderr=subprocess.STDOUT)
        check('production: the app builds (index, play and the Coming Soon page)', build.returncode == 0 and os.path.exists(os.path.join(stack.app_dir, 'dist', 'soon.html')), build.returncode)
        base = f'http://localhost:{port}'
        env = {k: v for k, v in os.environ.items() if not k.startswith(('GOOGLE_CLIENT', 'X_CLIENT', 'DISCORD_CLIENT', 'ADMIN_TOKEN', 'LAUNCH_MODE', 'RESEND', 'EMAIL_', 'BACKUP_S3_'))}
        env.update({'NODE_ENV': 'production', 'PORT': str(port), 'PUBLIC_URL': base, 'DB_PATH': os.path.join(stack.tmp, 'prod.db'), 'BACKUP_EVERY_HOURS': '0',
                    'BACKUP_DIR': os.path.join(stack.tmp, 'backups'), 'PREVIEW_CODE': PREVIEW, 'ADMIN_TOKEN': TOKEN})
        proc = subprocess.Popen(['npx', 'tsx', 'src/index.ts'], cwd=stack.server_dir, env=env, stdout=log, stderr=subprocess.STDOUT, preexec_fn=os.setsid)
        if not wait_http(base + '/api/health', proc=proc):
            check('production: the server starts', False, 'see ' + log.name)
            return
        h = Http(base)
        st, hd, html, _ = h('GET', '/')
        check('production with LAUNCH_MODE unset is waitlist mode: the landing page says Coming Soon', st == 200 and 'data-launch="waitlist"' in html and 'Coming Soon' in re.search(r'<title>([^<]*)', html).group(1) and '<link rel="canonical"' in html)
        for page in ('/play', '/play.html', '/join/SomeoneNice'):
            st, hd, html, _ = h('GET', page)
            check(f'production: {page} is the built Coming Soon page, with the security headers', st == 200 and 'Coming Soon to a Browser Near You' in html and '/assets/' in html and 'content-security-policy' in hd and 'noindex' in html, st)
        st, hd, html, _ = h('GET', '/join/SomeoneNice')
        check('production: an invite link’s preview says who invited you and that it opens soon', 'SomeoneNice invited you to Club NYC' in html and 'opens soon' in html)
        st, _, _, js = h('POST', '/api/auth/guest', ip='192.0.2.10')
        check('production: no new guests without the preview code', st == 403, st)
        st, _, _, js = h('GET', '/api/auth/providers')
        check('production without Resend: email sign-in is off (hidden on the front door)', js and js.get('email') is False, js)
        st, _, _, js = h('POST', '/api/waitlist', {'email': mail('prod'), 'source': 'prod'}, ip='192.0.2.11')
        check('production without Resend: the waitlist still takes the address (no confirmation email)', js and js.get('status') == 'added' and js.get('confirm') is False, js)
        st, hd, _, _ = h('GET', f'/play?preview={quote(PREVIEW)}', ip='192.0.2.12')
        st, hd, _, _ = h('GET', path_of(hd.get('location', '/')), ip='192.0.2.12')
        st, _, html, _ = h('GET', '/play', ip='192.0.2.12')
        check('production: the preview code opens the built game', 'club_preview' in h.cookies and 'Coming Soon to a Browser Near You' not in html and '/assets/play' in html, h.cookies.keys())
        st, _, _, js = h('POST', '/api/auth/guest', ip='192.0.2.13')
        check('production: a tester can start a guest', st == 200, (st, js))
    finally:
        if proc:
            try:
                os.killpg(proc.pid, signal.SIGTERM)
                proc.wait(timeout=10)
            except Exception:
                pass
        log.close()
        stack.stop()


async def main():
    prod = '--prod' in sys.argv
    env = {'LAUNCH_MODE': 'waitlist', 'PREVIEW_CODE': PREVIEW, 'ADMIN_TOKEN': TOKEN, 'WAITLIST_PUBLIC_MIN': '3',
           # X-Real-IP stands in for different visitors, so the per-IP limits can be tested on one machine
           'TRUST_PROXY': 'true'}
    # frozen copies: other people's edits while this runs can't reload its pages mid-flow (like tools/click_audit.py)
    stack = PrivateStack(frozen=True, env=env, prefix='clubnyc-wl-')
    try:
        base = stack.start()
        print(f'waitlist stack: {base} (game server {stack.game})', flush=True)
        preview_cookie = http_checks(base, stack.log.name)
        await browser_checks(base, stack.log.name, preview_cookie)
    finally:
        stack.stop(keep_log_to=os.path.join(OUT, 'waitlist-stack.log'))
    stack = PrivateStack(frozen=True, env={'LAUNCH_MODE': 'open'}, prefix='clubnyc-wlopen-')
    try:
        base = stack.start()
        print(f'open stack: {base}', flush=True)
        await open_checks(base)
    finally:
        stack.stop()
    if prod:
        prod_checks()
    bad = [n for n, ok in results if not ok]
    print(f'\n{len(results) - len(bad)}/{len(results)} checks passed')
    for n in bad:
        print('  FAILED:', n)
    sys.exit(1 if bad else 0)


asyncio.run(main())
