"""Fresh 2x screenshots for the pitch deck -> docs/deck/shots/*.png
usage: .venv/bin/python tools/deck_shots.py [offline|jam|online|all]
offline: StreetCheesy, a house party, the photo booth, the newspaper (seeded offline save)
jam    : the Dance Jam in Times Square (offline, clock nudged into a show)
online : the front door + three real players chatting in Times Square, and the City tab
(run `npm --prefix server run clean-test-users` afterwards to remove the Ana_/Ben_/Cleo_ accounts)"""
import asyncio, json, os, random, sys
from playwright.async_api import async_playwright

BASE = os.environ.get('CLUB_BASE', 'http://localhost:5173')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'deck', 'shots')
os.makedirs(OUT, exist_ok=True)
VIEW = {'width': 1000, 'height': 565}
LOOK = {"skin": 2, "hair": "curly", "hairColor": 1, "items": {"body": "denim-jacket", "legs": "black-jeans", "feet": "hightops", "head": "nyc-cap", "neck": "team-scarf-midtown", "hand": "coffee"}}
SAVE = {"created": True, "name": "Mayank", "team": "midtown", "memberSince": "2026-09-01", "coins": 3240, "look": LOOK,
        "owned": ["denim-jacket", "black-jeans", "hightops", "nyc-cap", "team-scarf-midtown", "coffee"],
        "furniture": [{"id": "rug", "x": 500, "y": 480}, {"id": "sofa", "x": 330, "y": 430}, {"id": "jukebox", "x": 700, "y": 410}, {"id": "lamp", "x": 210, "y": 420}, {"id": "plant", "x": 790, "y": 440}],
        "stats": {"party-intro": 1, "team-paid:2026-W41": 1, "team-paid:2026-W42": 1},
        "quests": {q: 1 for q in ['walk', 'gift', 'friend', 'job', 'subway']}, "stamps": ["local"],
        "lastDaily": "", "seenNews": 1}
CLEAN = "document.querySelectorAll('.toast,.notice,.title-card,.stamp-toast').forEach(n=>n.remove())"


async def shot(pg, name):
    await pg.evaluate(CLEAN)
    await pg.screenshot(path=os.path.join(OUT, name + '.png'))
    print('saved', name)


async def offline(b):
    c = await b.new_context(viewport=VIEW, device_scale_factor=2)
    pg = await c.new_page()
    await pg.goto(BASE + '/play?profile=deck', wait_until='networkidle')
    await pg.evaluate("s => localStorage.setItem('club-nyc:v2:deck', s)", json.dumps(SAVE))
    await pg.reload(wait_until='networkidle')
    await pg.wait_for_timeout(2500)
    await pg.evaluate("document.querySelector('.quests')?.remove()")
    # the newspaper
    await pg.evaluate("clubNyc.api.newspaper()")
    await pg.wait_for_timeout(1500)
    await shot(pg, 'news-front')
    await pg.click('.np-btn >> nth=1')
    await pg.wait_for_timeout(900)
    await shot(pg, 'news-moments')
    await pg.keyboard.press('Escape')
    # the photo booth, with whoever is around
    await pg.evaluate("clubNyc.photo('I ♥ NY')")
    await pg.wait_for_timeout(1400)
    await pg.click('.pb-actions .btn')
    await pg.wait_for_timeout(9500)
    await shot(pg, 'photobooth')
    await pg.keyboard.press('Escape')
    # home: StreetCheesy and a party
    await pg.evaluate("clubNyc.api.goto('apartment')")
    await pg.wait_for_timeout(2200)
    await pg.evaluate("clubNyc.listings()")
    await pg.wait_for_timeout(1200)
    await shot(pg, 'streetcheesy')
    await pg.keyboard.press('Escape')
    await pg.evaluate("clubNyc.party()")
    await pg.wait_for_timeout(800)
    await shot(pg, 'party-panel')
    await pg.click('.pp-actions .btn.go')
    await pg.wait_for_timeout(16000)
    await pg.keyboard.press('d')
    await pg.wait_for_timeout(1500)
    await shot(pg, 'party')
    await c.close()


async def jam(b):
    """The Dance Jam in Times Square, as it really runs (the clock is nudged to 40 s into a show)."""
    c = await b.new_context(viewport=VIEW, device_scale_factor=2)
    await c.add_init_script("(() => { const real = Date.now.bind(Date); const P = 480000; const shift = P - (real() % P) + 40000; Date.now = () => real() + shift })()")
    pg = await c.new_page()
    await pg.goto(BASE + '/play?profile=deck', wait_until='networkidle')
    await pg.evaluate("s => localStorage.setItem('club-nyc:v2:deck', s)", json.dumps(SAVE))
    await pg.reload(wait_until='networkidle')
    await pg.wait_for_timeout(2500)
    await pg.evaluate("document.querySelector('.quests')?.remove(); clubNyc.api.goto('times-square')")
    await pg.wait_for_timeout(9000)  # city locals pour onto the floor
    await pg.evaluate("s => clubNyc.walkTo(s)", [500, 470])
    await pg.wait_for_timeout(2500)
    await pg.keyboard.press('d')
    await pg.wait_for_timeout(1500)
    await pg.wait_for_function("[...document.querySelectorAll('.billboard img')].every(i => i.complete && i.naturalWidth)", timeout=8000)
    await pg.wait_for_timeout(800)
    print('join button showing while dancing:', await pg.evaluate("!!document.querySelector('.jam-join.show')"))
    await shot(pg, 'jam')
    await c.close()


async def onboard(pg, name, team_index):
    await pg.goto(BASE, wait_until='networkidle')
    await pg.wait_for_selector('.si-live.busy, .si-live.quiet', timeout=6000)
    await pg.click('.si-play')
    await pg.wait_for_selector('.creator-card', timeout=10000)
    nxt = '.creator-actions .btn.go'
    await pg.select_option('.cr-month', '6'); await pg.select_option('.cr-year', '2000'); await pg.click('.cr-age input')  # I'm 13 or older
    await pg.click(nxt)
    await pg.wait_for_timeout(250)
    for _ in range(team_index + 1):
        await pg.click('.cr-shuffle')
        await pg.wait_for_timeout(150)
    await pg.click(nxt)
    await pg.wait_for_timeout(250)
    await pg.locator('.le-row').nth(0).locator('.le-opt').nth(team_index % 5).click()
    await pg.locator('.le-row').last.locator('.le-opt').nth((team_index + 2) % 5).click()
    await pg.click(nxt)
    await pg.wait_for_selector('.creator-name input')
    await pg.fill('.creator-name input', name)
    await pg.wait_for_selector('.cr-avail.ok', timeout=5000)
    await pg.click(nxt)
    await pg.wait_for_selector('.team-card')
    await pg.locator('.team-card').nth(team_index).click()
    await pg.click(nxt)
    await pg.wait_for_selector('.metrocard-id', timeout=10000)
    await pg.wait_for_timeout(300)
    await pg.click('.creator-actions .btn.go')
    await pg.wait_for_selector('.online-pill.on', timeout=10000)


async def online(b):
    # the front door
    c0 = await b.new_context(viewport=VIEW, device_scale_factor=2)
    p0 = await c0.new_page()
    await p0.goto(BASE, wait_until='networkidle')
    await p0.wait_for_selector('.si-live.busy, .si-live.quiet', timeout=6000)
    await p0.wait_for_timeout(700)
    await shot(p0, 'signin')
    await c0.close()
    tag = str(random.randint(10, 99))
    names = [f'Ana_NYC{tag}', f'Ben_NYC{tag}', f'Cleo_NYC{tag}']
    ctxs = [await b.new_context(viewport=VIEW, device_scale_factor=2) for _ in names]
    pages = [await c.new_page() for c in ctxs]
    await asyncio.gather(*(onboard(p, n, i) for i, (p, n) in enumerate(zip(pages, names))))
    A, B, C = pages
    await A.wait_for_timeout(1200)
    for pg, spot in ((A, [430, 470]), (B, [545, 455]), (C, [640, 490])):
        await pg.evaluate("s => clubNyc.walkTo(s)", spot)
    await A.wait_for_timeout(3500)
    await B.keyboard.press('d')
    await A.wait_for_timeout(400)
    for pg, line in ((A, 'Who’s coming to the Dance Jam? 🪩'), (C, 'Fold your pizza, people! 🍕')):
        await pg.click('.chat-input')
        await pg.keyboard.type(line)
        await pg.keyboard.press('Enter')
    await A.wait_for_timeout(1100)
    await shot(A, 'mp-chat')
    await A.click('.chat-log-btn')
    await A.wait_for_timeout(500)
    await shot(A, 'mp-chat-log')
    await A.click('.chat-log-btn')
    await A.keyboard.press('f')
    await A.wait_for_selector('.community')
    await A.click('.cm-tab:has-text("City")')
    await A.wait_for_selector('.cm-city-head', timeout=5000)
    await A.wait_for_timeout(500)
    await shot(A, 'mp-city')
    for c in ctxs:
        await c.close()


async def main():
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    async with async_playwright() as p:
        b = await p.chromium.launch()
        if which in ('offline', 'all'):
            await offline(b)
        if which in ('jam', 'all'):
            await jam(b)
        if which in ('online', 'all'):
            await online(b)
        await b.close()

asyncio.run(main())
