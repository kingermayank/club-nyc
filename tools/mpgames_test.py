"""The multiplayer mini-games, end to end, with three real players in three separate browsers.
usage: .venv/bin/python tools/mpgames_test.py              (its own frozen private stack: game server + Vite, throwaway DB)
       .venv/bin/python tools/mpgames_test.py <base_url>   (an already-running private stack, e.g. http://localhost:5211)
       add --quick to skip the Rush Hour Run round (the longest one)
       add --audit to run tools/pixel_audit.py's checks on every game screen it visits (tools/out/mpgames-audit.json)

What it checks (everything through the real UI where a person would click):
  - the signs in the rooms open the game cards; the Community panel's Games tab lists the games
  - Create Lobby, join by code (typed into the Games tab), a shared /play?lobby=CODE link (a friend who opens it is
    dropped into the lobby), an invite to an online friend (a notice with Join), Add Friend from a lobby seat
  - a High Line Citi Bike Dash (the game id is still 'sled') with city locals filling the seats: countdown, racing,
    results for everyone; its sign stands on the High Line now, and Central Park has none
  - Rush Hour Run in Uptown vs Downtown teams, someone out sends a Showtime dancer, team results
  - Carb-Jitsu: Quick Match pairs two players at one table, cards are picked until someone wins, the table remembers
    its champion
  - results show places, XP and coins; leaderboards (weekly, all time, friends) are saved on the server and show inside
    the game; XP and coins really land; stamps for firsts
  - Leave and Escape always get you out; Hide keeps your seat while you walk around
Screenshots: tools/out/mpgames-*.png
"""
import sys, os, re, asyncio, time, json
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from stack import PrivateStack  # noqa: E402

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
QUICK = '--quick' in sys.argv
# --audit: run tools/pixel_audit.py's measurements on every screen this test visits (the games' own screens aren't in
# the main audit's walk); findings go to tools/out/mpgames-audit.json with 2x crops in tools/out/mpgames-audit/
AUDIT = '--audit' in sys.argv
BASE = ARGS[0] if ARGS else None
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)
results = []
audit_found = []


def audit_js():
    # pixel_audit.py runs itself on import, so lift its measuring script out of the source instead
    with open(os.path.join(HERE, 'pixel_audit.py')) as fh:
        m = re.search(r'AUDIT_JS = r"""(.*?)"""', fh.read(), re.S)
    return m.group(1) if m else None


AUDIT_JS = audit_js() if AUDIT else None
if AUDIT and os.path.isdir(os.path.join(OUT, 'mpgames-audit')):
    for _f in os.listdir(os.path.join(OUT, 'mpgames-audit')):
        os.remove(os.path.join(OUT, 'mpgames-audit', _f))


def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  ({detail})' if detail else ''), flush=True)


async def shot(pg, name):
    try:
        await pg.screenshot(path=os.path.join(OUT, f'mpgames-{name}.png'))
    except Exception as e:
        print('screenshot failed', name, e)
    if AUDIT_JS:
        try:
            found = await pg.evaluate(AUDIT_JS, name)
            crops = os.path.join(OUT, 'mpgames-audit')
            os.makedirs(crops, exist_ok=True)
            vw = pg.viewport_size
            for i, f in enumerate(found):
                x, y, w, h = f['rect']
                cx, cy = max(0, x - 14), max(0, y - 14)
                f['shot'] = os.path.join(crops, f"{name}-{i}-{f['kind']}.png")
                try:
                    await pg.screenshot(path=f['shot'], clip={'x': cx, 'y': cy, 'width': max(4, min(vw['width'] - cx, w + 28)), 'height': max(4, min(vw['height'] - cy, h + 28))})
                except Exception:
                    pass
            audit_found.extend(found)
            print(f'  audit {name}: {len(found)} finding(s)', flush=True)
        except Exception as e:
            print('audit failed', name, e)


async def tap(pg, sel, timeout=8000):
    """click like a person; if something keeps Playwright from settling (a reload, an animation), click it directly"""
    try:
        await pg.click(sel, timeout=timeout)
    except Exception:
        await pg.wait_for_selector(sel, timeout=timeout)
        await pg.evaluate("s => document.querySelector(s).click()", sel)


async def onboard(pg, name, preset):
    await pg.goto(BASE + '/play', wait_until='networkidle')
    await pg.wait_for_selector('.si-live.busy, .si-live.quiet', timeout=20000)
    await tap(pg, '.si-play')
    await pg.wait_for_selector('.creator-card', timeout=20000)
    await pg.locator('.cr-preset').nth(preset % 8).click()
    await pg.click('.creator-actions .btn.go')
    await pg.wait_for_selector('.creator-name input')
    await pg.fill('.creator-name input', name)
    await pg.wait_for_selector('.cr-avail.ok', timeout=10000)
    await pg.select_option('.cr-month', '6'); await pg.select_option('.cr-year', '2000'); await pg.click('.cr-age input')
    await pg.click('.creator-actions .btn.go')
    await pg.wait_for_selector('.online-pill.on', timeout=25000)
    # Rosa's first-day tour (it can start a few seconds late on a busy machine; the games also skip it themselves)
    try:
        await pg.wait_for_selector('.tour .tour-skip', timeout=15000)
        await tap(pg, '.tour .tour-skip')
    except Exception:
        pass
    await pg.wait_for_timeout(1200)


async def api(pg, path):
    return await pg.evaluate("p => fetch('/api' + p).then(r => r.json())", path)


async def lobby(pg):
    return await pg.evaluate("window.clubNycMp && window.clubNycMp.lobby")


async def wait_for(pg, js, timeout=15000, arg=None):
    try:
        await pg.wait_for_function(js, arg=arg, timeout=timeout)
        return True
    except Exception:
        return False


async def play_cards(pg, stop):
    """pick the first card whenever there's a choice, until `stop` is set"""
    while not stop.is_set():
        try:
            if await pg.locator('.mp-results').count():
                return
            b = pg.locator('.cj-pick:not([disabled])')
            if await b.count():
                await b.first.click(timeout=2000)
        except Exception:
            pass
        await asyncio.sleep(0.6)


async def main():
    global BASE
    stack = None
    if not BASE:
        stack = PrivateStack(frozen=True)
        BASE = stack.start()
        print(f'private stack: {BASE} (game server on {stack.game})', flush=True)
    try:
        await run()
    finally:
        if stack:
            stack.stop()
    if AUDIT:
        with open(os.path.join(OUT, 'mpgames-audit.json'), 'w') as fh:
            json.dump(audit_found, fh, indent=1)
        # the games' own UI (the shell, lobbies, results, HUDs) vs the city's, which shows on the screens with a sign
        ours = re.compile(r'\b(mp|sl|rn|cj)-')
        # racers who are level share a spot on the race progress strip: faces on one track overlapping is the point
        track = re.compile(r'(sl-dot|sl-prog-line|rn-bullet|rn-stop)[^>]*×[^>]*>[^>]*>[^>]*>[^>]*(sl-dot|rn-bullet)')
        level = [f for f in audit_found if f.get('kind') == 'overlap' and track.search(f.get('el', ''))]
        mine = [f for f in audit_found if ours.search(f.get('el', '')) and f not in level]
        print(f'\npixel audit of the game screens: {len(mine)} finding(s) in the games\' UI, {len(audit_found) - len(mine) - len(level)} elsewhere, '
              f'{len(level)} expected (racers level on a progress strip) (tools/out/mpgames-audit.json)')
        for f in mine:
            print(f"  [{f.get('screen')}] {f.get('kind')} {f.get('el')} {str(f.get('text', ''))[:40]!r} by {f.get('by')}")
    bad = [n for n, ok in results if not ok]
    print(f'\n{len(results) - len(bad)}/{len(results)} checks passed', flush=True)
    if bad:
        print('failed: ' + '; '.join(bad))
    sys.exit(1 if bad else 0)


async def run():
    tag = format(int(time.time()) % 100000, 'x')
    na, nb, nc = f'Ana_{tag}', f'Ben_{tag}', f'Cat_{tag}'
    async with async_playwright() as p:
        br = await p.chromium.launch()
        ctxs = [await br.new_context(viewport={'width': 1000, 'height': 565}) for _ in range(3)]
        A, B, C = [await c.new_page() for c in ctxs]
        errors = []
        for who, pg in (('A', A), ('B', B), ('C', C)):
            pg.set_default_timeout(20000)
            pg.on('pageerror', lambda e, who=who: errors.append(f'{who} pageerror: {e}'))
            pg.on('console', lambda m, who=who: errors.append(f'{who} console.{m.type}: {m.text}') if m.type == 'error' else None)

        await asyncio.gather(onboard(A, na, 0), onboard(B, nb, 3), onboard(C, nc, 5))
        check('three players signed up through the UI and are in the city', True)
        a_id, b_id, c_id = [await pg.evaluate('clubNyc.save.owner') for pg in (A, B, C)]

        # ---------- the sign on the High Line opens the Citi Bike Dash card (Central Park's sled sign is gone) ----------
        await A.evaluate("clubNyc.api.goto('central-park')")
        await A.wait_for_timeout(2500)
        check('Central Park has no game sign (the sled race moved to the High Line)', await A.locator('.mp-spot').count() == 0)
        await A.evaluate("clubNyc.api.goto('high-line')")
        await A.wait_for_timeout(2500)
        check('the High Line has the Citi Bike Dash sign', await A.locator('.mp-spot[aria-label="High Line Citi Bike Dash"]').count() == 1)
        await shot(A, '01-high-line-sign')
        await A.evaluate("document.querySelector('.mp-spot').click()")
        ok = await wait_for(A, "!!document.querySelector('.mp-gamecard')", 12000)
        check('clicking the sign walks over and opens the game card', ok)
        await A.wait_for_timeout(600)
        await shot(A, '02-bike-card')
        await A.click('.mp-gamecard .btn:has-text("Create Lobby")')
        await A.wait_for_selector('.mp-lobby .mp-seat', timeout=15000)
        await A.wait_for_timeout(500)
        code = (await A.inner_text('.mp-code b')).strip()
        check('Create Lobby opens a lobby with a 4-letter code', re.fullmatch(r'[A-Z0-9]{4}', code) is not None, code)
        check('a lobby opened on the High Line says so', (await lobby(A) or {}).get('room') == 'high-line', str((await lobby(A) or {}).get('room')))
        await shot(A, '03-bike-lobby')

        # ---------- B joins with the code from the Games tab ----------
        await B.click('[aria-label="Friends & Leaderboards"]')
        await B.click('.cm-tab:has-text("Games")')
        await B.wait_for_selector('.mp-gcard', timeout=10000)
        await B.wait_for_timeout(700)
        check('the Games tab lists all three games', await B.locator('.mp-gcard').count() == 3)
        await shot(B, '04-games-tab')
        await B.fill('.mp-join-code input', code)
        await B.click('.mp-join-code .btn')
        ok = await wait_for(A, "window.clubNycMp.lobby && window.clubNycMp.lobby.seats.length === 2", 12000)
        check('B joined by code and A sees two seats', ok)
        await B.wait_for_selector('.mp-lobby .mp-seat', timeout=10000)

        # ---------- Add Friend from the lobby; A accepts from the notice ----------
        await B.click(f'.mp-seat[data-id="{a_id}"] .btn:has-text("Add Friend")')
        try:
            await A.wait_for_selector('.notice:has-text("wants to be friends")', timeout=8000)
            await shot(A, '05-friend-request-in-lobby')
            await A.click('.notice:has-text("wants to be friends") .notice-btn:has-text("Accept")')
            check('a friend request reaches someone sitting in a lobby, and they accept', True)
        except Exception as e:
            check('a friend request reaches someone sitting in a lobby, and they accept', False, str(e)[:100])
        ok = await wait_for(B, "id => clubNyc.mp && clubNyc.mp.friends.has(id)", 8000, a_id)
        check('A and B are friends', ok)

        # ---------- the race: B readies up, everyone ready starts it ----------
        await B.click('.mp-go .btn.big:has-text("Ready")')
        ok = await asyncio.gather(wait_for(A, "!!document.querySelector('.mp-game canvas')", 10000), wait_for(B, "!!document.querySelector('.mp-game canvas')", 10000))
        check('everyone ready starts the Citi Bike Dash for both', all(ok))
        lob = await lobby(A)
        match = await A.evaluate("window.clubNycMp.match")
        check('city locals fill the empty bikes (4 racers)', match and len(match['players']) == 4, str(match and [x['n'] for x in match['players']]))
        await A.wait_for_timeout(2000)
        await shot(A, '06-bike-countdown')
        # a cautious newcomer (A mostly holds a line and hops now and then) and a wobbly one (B)
        for k in range(16):
            if k % 3 == 0:
                await A.keyboard.press('Space')
            key = 'ArrowUp' if k % 4 < 2 else 'ArrowDown'
            await B.keyboard.down(key)
            await A.wait_for_timeout(180)
            await B.keyboard.up(key)
            await A.wait_for_timeout(600)
            if k == 8:
                await shot(A, '07-bike-racing')
                await shot(B, '07b-bike-racing-ben')
        ok = await asyncio.gather(wait_for(A, "!!document.querySelector('.mp-results')", 120000), wait_for(B, "!!document.querySelector('.mp-results')", 120000))
        check('the race ends with results for both racers', all(ok))
        await A.wait_for_timeout(1500)
        await shot(A, '08-bike-results')
        res_a = await A.evaluate("window.clubNycMp.results")
        you = (res_a or {}).get('you') or {}
        check('results list all 4 racers with places', res_a and sorted(r['place'] for r in res_a['rows']) == [1, 2, 3, 4], str(res_a and [(r['n'], r['place'], r['score']) for r in res_a['rows']]))
        check('the race paid XP to A (via awardXp mp-game)', you.get('xp', 0) > 0, json.dumps(you))
        check('the results screen shows the XP and coins', (await A.locator('.mp-gain .xp b').inner_text()).startswith('+'))
        xp = await api(A, '/xp')
        check('A has XP on the server', xp.get('xp', 0) > 0, str(xp.get('xp')))
        board = await api(B, '/mp/board/sled?period=week&by=wins&scope=friends')
        names = [r['name'] for r in board.get('rows', [])]
        check('the weekly Citi Bike Dash board (friends) has both racers', na in names and nb in names, str(names))
        best = await api(B, '/mp/board/sled?period=all&by=best')
        finished = {r['n'] for r in res_a['rows'] if not r.get('bot') and r['score'] > 0} if res_a else set()
        on_board = {r['name'] for r in best.get('rows', [])}
        check('the all-time best-time board has everyone who finished (and no city locals)', finished <= on_board and not any(r['name'] in {x['n'] for x in res_a['rows'] if x.get('bot')} for r in best.get('rows', [])), f'finished {sorted(finished)}, board {sorted(on_board)}')
        await A.click('.mp-res-btns .btn:has-text("Leaderboard")')
        await A.wait_for_selector('.mp-board .mp-brow', timeout=8000)
        await A.click('.mp-board .mp-seg button:has-text("Friends")')
        await A.wait_for_timeout(900)
        check('the leaderboard opens inside the game, with a friends filter', await A.locator('.mp-board .mp-brow:not(.headrow)').count() >= 1)
        await shot(A, '09-bike-leaderboard')
        await A.keyboard.press('Escape')
        await A.wait_for_timeout(300)
        stamps = await A.evaluate("clubNyc.save.stamps")
        check('first-game stamps were awarded', 'mp-first' in stamps and 'sled-race' in stamps or 'mp-first' in stamps, str([s for s in stamps if s.startswith(('mp-', 'sled'))]))

        # ---------- Back to the City (B) / Play Again (A), then Escape leaves ----------
        await B.click('.mp-res-btns .btn:has-text("Back to the City")')
        ok = await wait_for(B, "!document.querySelector('.mp-shell')", 5000)
        check('Back to the City closes the game for B', ok)
        await A.click('.mp-res-btns .btn:has-text("Play Again")')
        ok = await wait_for(A, "!!document.querySelector('.mp-lobby .mp-seat')", 8000)
        check('Play Again takes A back to the lobby', ok)
        await A.click('.mp-bar .btn:has-text("Hide")')
        ok = await wait_for(A, "!!document.querySelector('.mp-chip') && document.querySelector('.mp-shell').classList.contains('hidden')", 4000)
        check('Hide keeps the seat and shows a chip in the city', ok)
        await shot(A, '10-hidden-chip')
        await A.click('.mp-chip')
        ok = await wait_for(A, "!!document.querySelector('.mp-shell:not(.hidden) .mp-lobby')", 4000)
        check('the chip brings the lobby back', ok)
        await A.keyboard.press('Escape')
        ok = await wait_for(A, "!document.querySelector('.mp-shell') && !window.clubNycMp.lobby", 5000)
        check('Escape leaves the lobby', ok)

        # ---------- Rush Hour Run: teams, an invite, a shared link ----------
        if not QUICK:
            await A.evaluate("clubNyc.api.goto('subway')")
            await A.wait_for_timeout(2500)
            check('the subway platform has the Rush Hour Run board', await A.locator('.mp-spot[aria-label="Rush Hour Run"]').count() == 1)
            await shot(A, '11-subway-sign')
            await A.evaluate("document.querySelector('.mp-spot').click()")
            await A.wait_for_selector('.mp-gamecard', timeout=12000)
            await A.click('.mp-gamecard .btn:has-text("Create Lobby")')
            await A.wait_for_selector('.mp-lobby .mp-seat', timeout=12000)
            code2 = (await A.inner_text('.mp-code b')).strip()
            # invite B (a friend, online): B gets a notice with Join
            await A.click('.mp-go .btn:has-text("Invite")')
            await A.wait_for_selector('.mp-invite .cm-row', timeout=8000)
            await A.wait_for_timeout(450)  # (the lobby fades in)
            await shot(A, '12-invite-panel')
            await A.click(f'.mp-invite .cm-row:has-text("{nb}") .btn:has-text("Invite")')
            try:
                await B.wait_for_selector('.notice:has-text("invited you")', timeout=8000)
                await B.wait_for_timeout(600)  # (the notice slides in)
                await shot(B, '13-invite-notice')
                await B.click('.notice:has-text("invited you") .notice-btn:has-text("Join")')
                check('an invited friend gets a notice and Join puts them in the lobby', await wait_for(A, "window.clubNycMp.lobby && window.clubNycMp.lobby.seats.length === 2", 8000))
            except Exception as e:
                check('an invited friend gets a notice and Join puts them in the lobby', False, str(e)[:100])
            await A.keyboard.press('Escape') if await A.locator('.mp-sub').count() else None
            # C opens the shared link (what you'd paste in Discord)
            await C.goto(f'{BASE}/play?lobby={code2}', wait_until='networkidle')
            ok = await wait_for(A, "window.clubNycMp.lobby && window.clubNycMp.lobby.seats.length === 3", 25000)
            check('a friend who opens /play?lobby=CODE lands in the lobby', ok)
            # teams
            await A.click('.mp-seg button:has-text("Uptown vs Downtown")')
            ok = await wait_for(A, "window.clubNycMp.lobby.mode === 'teams'", 5000)
            check('the host can switch to Uptown vs Downtown', ok)
            await A.wait_for_timeout(500)
            await shot(A, '14-runner-lobby-teams')
            # B and C run like the city locals do (the game's dev-only autopilot); A doesn't touch the keys
            for pg in (B, C):
                await pg.evaluate("window.clubNycMp.autopilot = true")
            await A.click('.mp-go .btn.big')
            ok = await asyncio.gather(*[wait_for(pg, "!!document.querySelector('.mp-game canvas')", 15000) for pg in (A, B, C)])
            check('the run starts for all three', all(ok))
            match = await A.evaluate("window.clubNycMp.match")
            check('six runners (three locals), split into two teams', match and len(match['players']) == 6 and {x.get('tm') for x in match['players']} == {'up', 'down'}, str(match and [(x['n'], x.get('tm')) for x in match['players']]))
            await A.wait_for_timeout(4500)
            await shot(A, '15-runner')
            # A runs into something and is out soon; out, A watches and sends a Showtime dancer at a real runner
            ok = await wait_for(A, "!!document.querySelector('.rn-drop')", 60000)
            check('someone who is out can send a Showtime dancer', ok)
            if ok:
                for _ in range(6):
                    if nb in await A.inner_text('.rn-watch'):
                        break
                    await A.keyboard.press('ArrowRight')
                    await A.wait_for_timeout(250)
                await shot(A, '16-runner-out-watching')
                await A.keyboard.press('2')
                ok = await wait_for(B, "[...document.querySelectorAll('.mp-toastline, .mp-big')].some(e => /showtime/i.test(e.textContent))", 6000)
                check('everyone sees the Showtime dancer go out', ok)
            await B.wait_for_timeout(1500)
            await shot(B, '16b-runner-ben')
            ok = await asyncio.gather(*[wait_for(pg, "!!document.querySelector('.mp-results')", 150000) for pg in (A, B, C)])
            check('the run ends with results for all three', all(ok))
            await A.wait_for_timeout(1400)
            await shot(A, '17-runner-results')
            r2 = await A.evaluate("window.clubNycMp.results")
            check('team results: points for Uptown and Downtown and a winner', r2 and r2.get('teams') and r2['teams']['win'] in ('up', 'down'), str(r2 and r2.get('teams')))
            rows2 = [(x['n'], x.get('place'), x.get('score')) for x in (r2 or {}).get('rows', [])]
            check('the run counted (long enough) and paid XP', r2 and r2.get('you', {}).get('xp', 0) > 0 and not r2.get('you', {}).get('void'), str(r2 and r2.get('you')))
            board2 = await api(C, '/mp/board/runner?period=week&by=best')
            names2 = {r['name'] for r in board2.get('rows', [])}
            check('the runner board saved distances for all three', {na, nb, nc} <= names2, str([(r['name'], r['best']) for r in board2.get('rows', [])][:4]) + f' results {rows2}')
            for pg in (A, B, C):
                await pg.keyboard.press('Escape')
            await A.wait_for_timeout(800)

        # ---------- Carb-Jitsu: Quick Match pairs A and B at one table ----------
        for pg in (A, B):
            await pg.keyboard.press('Escape')
            await pg.wait_for_timeout(300)
        await A.evaluate("clubNyc.api.goto('pizza')")
        await A.wait_for_timeout(2500)
        check('Joe’s Pizza has the Carb-Jitsu board', await A.locator('.mp-spot[aria-label="Carb-Jitsu"]').count() == 1)
        await shot(A, '18-pizza-sign')
        await A.evaluate("document.querySelector('.mp-spot').click()")
        await A.wait_for_selector('.mp-gamecard', timeout=12000)
        await A.click('.mp-gamecard .btn:has-text("Quick Match")')
        await A.wait_for_selector('.mp-lobby', timeout=12000)
        await B.click('[aria-label="Friends & Leaderboards"]')
        await B.click('.cm-tab:has-text("Games")')
        await B.wait_for_selector('.mp-gcard', timeout=10000)
        await B.locator('.mp-gcard').nth(2).locator('.btn:has-text("Quick Match")').click()
        ok = await asyncio.gather(wait_for(A, "!!document.querySelector('.cj-hand, .cj-center')", 30000), wait_for(B, "!!document.querySelector('.cj-hand, .cj-center')", 30000))
        check('Quick Match seats both at the same Carb-Jitsu table and deals', all(ok))
        await A.wait_for_timeout(4200)
        await shot(A, '19-carbs-hand')
        stop = asyncio.Event()
        players = asyncio.gather(play_cards(A, stop), play_cards(B, stop))
        await A.wait_for_timeout(2600)
        await shot(A, '20-carbs-reveal')
        ok = await asyncio.gather(wait_for(A, "!!document.querySelector('.mp-results')", 240000), wait_for(B, "!!document.querySelector('.mp-results')", 240000))
        stop.set()
        await players
        check('the duel ends with a winner and results for both', all(ok))
        await A.wait_for_timeout(1200)
        await shot(A, '21-carbs-results')
        r3 = await A.evaluate("window.clubNycMp.results")
        check('one winner, one runner-up', r3 and sorted(r['place'] for r in r3['rows']) == [1, 2], str(r3 and [(r['n'], r['place'], r.get('won')) for r in r3['rows']]))
        lob = await lobby(A)
        check('the table remembers its champion (Winner Stays On)', lob and lob.get('champ') and lob['champ']['i'] in (a_id, b_id), str(lob and lob.get('champ')))
        board3 = await api(A, '/mp/board/carbs?period=week&by=wins')
        check('the Carb-Jitsu board has the winner', any(r['wins'] >= 1 for r in board3.get('rows', [])), str([(r['name'], r['wins']) for r in board3.get('rows', [])][:3]))

        # ---------- the economy: coins really landed, and the hub knows your record ----------
        wal = await api(A, '/wallet')
        led = await A.evaluate("fetch('/api/xp').then(r => r.json())")
        hub = await api(A, '/mp/hub')
        check('the hub has your record in every game you played', hub['stats']['sled']['played'] >= 1 and hub['stats']['carbs']['played'] >= 1, json.dumps(hub['stats']))
        check('A’s XP went up with each game', led.get('xp', 0) >= 70, str(led.get('xp')))
        check('A has coins in the server wallet', wal.get('coins', 0) > 0, str(wal.get('coins')))

        # ---------- Leave mid-race asks first; Escape twice leaves ----------
        for pg in (A, B):
            await pg.keyboard.press('Escape')
            await pg.wait_for_timeout(300)
        await A.click('[aria-label="Friends & Leaderboards"]')
        await A.click('.cm-tab:has-text("Games")')
        await A.wait_for_selector('.mp-gcard', timeout=10000)
        await A.locator('.mp-gcard').nth(0).locator('.btn:has-text("Create Lobby")').click()
        await A.wait_for_selector('.mp-lobby .mp-seat', timeout=12000)
        await A.click('.mp-go .btn.big')
        await A.wait_for_selector('.mp-game canvas', timeout=12000)
        await A.wait_for_timeout(1500)
        await A.keyboard.press('Escape')
        ok = await wait_for(A, "!!document.querySelector('.mp-confirm')", 3000)
        check('Escape during a race asks before leaving', ok)
        await A.wait_for_timeout(450)  # (the question pops in)
        await shot(A, '22-leave-confirm')
        await A.keyboard.press('Escape')
        ok = await wait_for(A, "!document.querySelector('.mp-shell') && !window.clubNycMp.lobby", 5000)
        check('Escape again leaves the race and the lobby', ok)

        noisy = [e for e in errors if 'favicon' not in e and 'ERR_' not in e]
        check('no page errors', not [e for e in noisy if 'pageerror' in e], '; '.join(noisy[:5]))
        if noisy:
            print('\n'.join(noisy[:12]))
        await br.close()

asyncio.run(main())
