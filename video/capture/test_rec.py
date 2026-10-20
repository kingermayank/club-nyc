import asyncio, json, os, sys
from playwright.async_api import async_playwright
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rec import Recorder, HIDE_HUD

BASE = 'http://localhost:5197'
LOOK = {"skin": 2, "hair": "curly", "hairColor": 1, "items": {"body": "denim-jacket", "legs": "black-jeans", "feet": "hightops", "head": "nyc-cap", "hand": "coffee"}}
SAVE = {"created": True, "name": "Bea_NYC", "team": "midtown", "memberSince": "2026-09-01", "coins": 1240, "look": LOOK,
        "owned": ["denim-jacket", "black-jeans", "hightops", "nyc-cap", "coffee"], "stats": {"party-intro": 1},
        "quests": {q: 1 for q in ['walk', 'gift', 'friend', 'job', 'subway']}, "stamps": ["local"], "tour": "done",
        "lastDaily": "", "seenNews": 1}

async def main():
    out = sys.argv[1]
    async with async_playwright() as p:
        b = await p.chromium.launch()
        c = await b.new_context(viewport={'width': 960, 'height': 540}, device_scale_factor=2)
        pg = await c.new_page()
        await pg.goto(BASE + '/play?profile=trailer', wait_until='networkidle')
        await pg.evaluate("s => localStorage.setItem('club-nyc:v2:trailer', s)", json.dumps(SAVE))
        await pg.reload(wait_until='networkidle')
        await pg.add_style_tag(content=HIDE_HUD)
        await pg.wait_for_timeout(6000)
        await pg.evaluate("s => clubNyc.walkTo(s)", [300, 480])
        await pg.wait_for_timeout(1500)
        r = Recorder(pg)
        await r.start()
        await pg.evaluate("s => clubNyc.walkTo(s)", [700, 470])
        await pg.wait_for_timeout(5000)
        await r.stop(out)
        await b.close()

asyncio.run(main())
