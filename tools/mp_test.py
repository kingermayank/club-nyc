"""Two real players, two separate browsers, one city.
usage: .venv/bin/python tools/mp_test.py            (its own private game server + Vite, throwaway database)
       .venv/bin/python tools/mp_test.py <base_url>  (an already-running dev stack, e.g. http://localhost:5173)
Each player signs up through the real UI (Play now -> creator), lands in Times Square, and we check:
they see each other, typed chat shows up as a bubble + in the log for the other person, walking
syncs, friend requests work both ways, and a validated score lands on the shared leaderboard.
The test only ever touches its own two players (found by name), so other people online don't confuse it,
but the private stack is the default so nobody playing on your dev server sees test players at all.
Screenshots go to tools/out/mp-*.png."""
import sys, os, asyncio, time
from playwright.async_api import async_playwright
from stack import PrivateStack  # tools/stack.py: private game server + Vite on free ports, throwaway database

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
BASE = sys.argv[1] if len(sys.argv) > 1 else None
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)
results = []


def check(name, ok, detail=''):
    results.append((name, ok))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  ({detail})' if detail else ''))


async def shot(pg, name):
    await pg.screenshot(path=os.path.join(OUT, f'mp-{name}.png'))


async def onboard(pg, name, team_index, shots=False):
    await pg.goto(BASE + '/play', wait_until='networkidle')
    await pg.wait_for_selector('.si-live.busy, .si-live.quiet', timeout=5000)
    if shots:
        await pg.wait_for_timeout(400)
        await shot(pg, '0a-sign-in')
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
    if shots:
        await shot(pg, '0b-name-check')
    await pg.select_option('.cr-month', '6'); await pg.select_option('.cr-year', '2000'); await pg.click('.cr-age input')  # I'm 13 or older
    await pg.click(nxt)
    await pg.wait_for_selector('.online-pill.on', timeout=10000)
    # brand-new players get Rosa's first-day tour; skip it so the test can drive the city
    try:
        await pg.wait_for_selector('.tour .tour-skip', timeout=9000)
        await pg.click('.tour .tour-skip')
        await pg.wait_for_timeout(300)
    except Exception:
        pass


async def remote_named(pg, name):
    """how many remote players called `name` this page shows (other people online don't count)"""
    return await pg.evaluate("n => [...document.querySelectorAll('.overhead.remote .name-tag b')].filter(b => b.textContent === n).length", name)


# an element's text with emoji put back (the game draws emoji as <img class="ji" alt="🍕">)
TXT = "(el => { const f = (n) => n.nodeType === 3 ? n.data : n.nodeName === 'IMG' ? (n.alt || '') : [...n.childNodes].map(f).join(''); return f(el) })"

# the remote actor for a given player name, on this page
FIND = "(n => [...clubNyc.mp.players.values()].find(a => a.name === n))"


async def main():
    global BASE
    stack = None
    if not BASE:
        stack = PrivateStack()
        BASE = stack.start()
        print(f'private stack: {BASE} (game server on {stack.game})')
    try:
        await run()
    finally:
        if stack:
            stack.stop()
    bad = [n for n, ok in results if not ok]
    print(f'\n{len(results) - len(bad)}/{len(results)} checks passed')
    sys.exit(1 if bad else 0)


async def run():
    tag = format(int(time.time()) % 100000, 'x')
    na, nb = f'Ana_{tag}', f'Ben_{tag}'
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ca = await b.new_context(viewport={'width': 1000, 'height': 565})
        cb = await b.new_context(viewport={'width': 1000, 'height': 565})
        A, B = await ca.new_page(), await cb.new_page()
        errors = []
        for who, pg in (('A', A), ('B', B)):
            pg.on('pageerror', lambda e, who=who: errors.append(f'{who} pageerror: {e}'))
            pg.on('console', lambda m, who=who: errors.append(f'{who} console.{m.type}: {m.text}') if m.type == 'error' else None)

        await asyncio.gather(onboard(A, na, 0, shots=True), onboard(B, nb, 3))
        check('both players signed up through the UI and connected', True)
        await A.wait_for_timeout(1500)

        # 1. they see each other
        ra, rb = await remote_named(A, nb), await remote_named(B, na)
        check('A sees B in Times Square', ra == 1, f'{ra} named {nb}')
        check('B sees A in Times Square', rb == 1, f'{rb} named {na}')
        tags_b = await B.evaluate("[...document.querySelectorAll('.overhead.remote .name-tag b')].map(b => b.textContent)")
        check('B sees A by name', na in tags_b, str(tags_b))

        # 2. typed chat shows up for the other player
        msg = 'hello from Ana! 🍕'
        await A.click('.chat-input')
        await A.keyboard.type(msg)
        await A.keyboard.press('Enter')
        try:
            await B.wait_for_function(f"m => [...document.querySelectorAll('.overhead.remote .bubble.show')].some(b => {TXT}(b) === m)", arg=msg, timeout=4000)
            check('A\'s typed chat appears as a bubble on B\'s screen', True)
        except Exception:
            check('A\'s typed chat appears as a bubble on B\'s screen', False)
        log_b = await B.evaluate(f"[...document.querySelectorAll('.chat-line')].map(l => {TXT}(l))")
        check('...and in B\'s chat log', any(msg in l for l in log_b), str(log_b[-3:]))
        icons = await B.evaluate("[...document.querySelectorAll('.overhead.remote .bubble img.ji')].map(i => i.alt)")
        check('emoji in chat show as illustrated icons', '🍕' in icons, icons)
        own = await A.evaluate(f"{TXT}(document.querySelector('.overhead.is-player .bubble'))")
        check('A sees their own bubble', own == msg, own)
        await shot(B, '1-chat-seen-by-ben')

        # filtered chat: links and phone numbers never reach other players
        await A.click('.chat-input')
        await A.keyboard.type('add me at www.example.com or 555-123-4567')
        await A.keyboard.press('Enter')
        await B.wait_for_timeout(900)
        log_b = await B.evaluate(f"[...document.querySelectorAll('.chat-line')].map(l => {TXT}(l))")
        last = log_b[-1] if log_b else ''
        check('chat filter strips links/phone numbers', 'example.com' not in last and '4567' not in last, last)

        # 3. walking syncs
        before = await B.evaluate(f"n => {{ const a = {FIND}(n); return a ? [...a.pos] : null }}", na)
        await A.evaluate("clubNyc.walkTo([230, 480])")
        await B.wait_for_timeout(2800)
        after = await B.evaluate(f"n => {{ const a = {FIND}(n); return a ? [...a.pos] : null }}", na)
        a_pos = await A.evaluate("[...clubNyc.world.player.pos]")
        moved = before and after and abs(after[0] - before[0]) > 40
        close = after and abs(after[0] - a_pos[0]) < 6 and abs(after[1] - a_pos[1]) < 6
        check('A walking shows on B\'s screen', bool(moved), f'{before} -> {after}')
        check('...and ends where A actually is', bool(close), f'B sees {after}, A is at {a_pos}')

        # 4. dance syncs
        await A.keyboard.press('d')
        await B.wait_for_timeout(700)
        pose = await B.evaluate(f"n => {FIND}(n)?.view.pose", na)
        check('A dancing shows on B\'s screen', pose == 'dance', pose)
        await shot(B, '2-ana-dancing')

        # 5. friend request B -> A, accepted live
        await B.evaluate(f"n => clubNyc.card({FIND}(n))", na)  # Ana's card, not whoever else is around
        await B.wait_for_selector('.player-card.remote .pc-actions .btn.go', timeout=5000)
        await B.wait_for_timeout(300)
        await shot(B, '3-ana-player-card')
        await B.click('.player-card.remote .pc-actions .btn.go')  # Add Friend
        try:
            await A.wait_for_selector('.notice:has-text("wants to be friends")', timeout=4000)
            check('A gets a live friend request notification', True)
            await shot(A, '4-friend-request')
            await A.click('.notice:has-text("wants to be friends") .notice-btn:has-text("Accept")')
            await B.wait_for_selector('.toast:has-text("accepted your friend request")', timeout=4000)
            check('B is told A accepted', True)
        except Exception as e:
            check('friend request round trip', False, str(e)[:120])
        await A.wait_for_timeout(800)
        fa = await A.evaluate("clubNyc.mp.friends.size")
        check('they are friends on A\'s side', fa == 1, str(fa))

        # 6. a validated score lands on the shared leaderboard
        async def play(pg, score):
            return await pg.evaluate("""async (score) => {
              const r = await (await fetch('/api/games/ferry-captain/start', { method: 'POST' })).json()
              await new Promise(res => setTimeout(res, 11000))
              return (await fetch('/api/games/ferry-captain/finish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ run: r.run, score, coins: 40 }) })).json()
            }""", score)
        ra_, rb_ = await asyncio.gather(play(A, 14), play(B, 9))
        check('A\'s run accepted', ra_.get('accepted') is True, str(ra_))
        check('B\'s run accepted', rb_.get('accepted') is True, str(rb_))
        cheat = await A.evaluate("""async () => {
          const r = await (await fetch('/api/games/ferry-captain/start', { method: 'POST' })).json()
          return (await fetch('/api/games/ferry-captain/finish', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ run: r.run, score: 999, coins: 40 }) })).json()
        }""")
        check('an instant 999 is rejected', cheat.get('accepted') is False, str(cheat))
        board = await B.evaluate("fetch('/api/leaderboard/ferry-captain?scope=friends').then(r => r.json())")
        names = [r['name'] for r in board['rows']]
        check('friends leaderboard shows both, best first', names[:2] == [na, nb], str(names))
        await B.keyboard.press('Escape')
        await B.wait_for_timeout(300)
        await B.keyboard.press('f')
        await B.wait_for_selector('.community')
        await B.click('.cm-tab:has-text("Leaderboards")')
        await B.click('.cm-chip:has-text("Ferry Captain")')
        await B.wait_for_selector('.cm-brow', timeout=5000)
        await B.wait_for_timeout(400)
        await shot(B, '5-leaderboard')
        await B.click('.cm-tab:has-text("City")')
        await B.wait_for_selector('.cm-city-head', timeout=5000)
        await B.wait_for_timeout(300)
        await shot(B, '6-city-tab')
        await B.keyboard.press('Escape')

        # 7. A leaves the room: B sees them go
        await A.evaluate("clubNyc.api.goto('soho')")
        await B.wait_for_timeout(1500)
        check('B sees A leave Times Square', await remote_named(B, na) == 0, str(await remote_named(B, na)))
        await shot(A, '7-ana-in-soho')

        # 8. names are unique: B can't claim A's name
        taken = await B.evaluate("n => fetch('/api/name-available?name=' + n).then(r => r.json())", na)
        check('a taken name is refused', taken.get('ok') is False, str(taken))

        # 9. B visits A's apartment while A is home; B signs A's guestbook
        await A.evaluate("clubNyc.api.goto('apartment')")
        await A.wait_for_timeout(1500)
        a_id = await A.evaluate("clubNyc.save.owner")
        await B.evaluate("id => clubNyc.visit(id)", a_id)
        await B.wait_for_timeout(2500)
        plate = await B.evaluate("document.querySelector('.place-plate b').textContent")
        check('B is in A\'s apartment', na in plate, plate)
        check('A is home and B can see them', await remote_named(B, na) == 1, str(await remote_named(B, na)))
        check('A sees B arrive', await remote_named(A, nb) == 1, str(await remote_named(A, nb)))
        await shot(B, '8-visiting-ana')
        await B.click('.apt-btn.primary')
        await B.fill('.gb-write input', 'Love the vibe in here!')
        await B.click('.gb-write .btn')
        try:
            await A.wait_for_selector('.notice:has-text("signed your guestbook")', timeout=4000)
            check('A is notified of the guestbook note live', True)
        except Exception:
            check('A is notified of the guestbook note live', False)
        book = await A.evaluate("fetch('/api/guestbook').then(r => r.json())")
        check('the note is stored on A\'s guestbook', any('Love the vibe' in e['text'] for e in book['entries']), str(book['entries'][:1]))
        await A.evaluate("clubNyc.api.goto('soho')")
        await A.wait_for_timeout(1200)

        # 10. reload keeps your New Yorker (cloud save + session cookie)
        await A.wait_for_timeout(3500)  # let the debounced cloud save go out
        await A.reload(wait_until='networkidle')
        await A.wait_for_selector('.online-pill.on', timeout=10000)
        room = await A.evaluate("clubNyc.world.room.id")
        nm = await A.evaluate("clubNyc.save.name")
        check('after reload: same name, still in SoHo, no sign-in screen', nm == na and room == 'soho', f'{nm} @ {room}')

        if errors:
            print('\n'.join(errors[:12]))
        await b.close()

asyncio.run(main())
