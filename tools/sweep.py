"""Visit every room headlessly, screenshot it, and report problems (missing geo/cutouts, console errors)."""
import asyncio, os, json, sys
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
SAVE = {"created": True, "name": "QA", "team": "midtown", "memberSince": "2026-09-01", "coins": 999,
        "look": {"skin": 2, "hair": "curly", "hairColor": 1, "items": {"body": "tee-blue", "legs": "jeans", "feet": "sneakers"}},
        "stats": {"party-intro": 1, "team-paid:2026-W41": 1}, "quests": {q: 1 for q in ['walk', 'gift', 'friend', 'job', 'subway']}, "stamps": ["local"]}

async def main():
    rooms = sys.argv[1:]
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1000, 'height': 565})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and '404' not in m.text else None)
        await pg.goto('http://localhost:5173/play?profile=sweep', wait_until='networkidle')
        await pg.evaluate(f"localStorage.setItem('club-nyc:v2:sweep', JSON.stringify({json.dumps(SAVE)}))")
        await pg.reload(wait_until='networkidle')
        await pg.wait_for_timeout(2500)
        if not rooms:
            geo = os.path.join(HERE, '..', 'app', 'src', 'data', 'geo')
            rooms = sorted(f[:-5] for f in os.listdir(geo) if f.endswith('.json') and f != 'map.json')
        bad = []
        for r in rooms:
            await pg.evaluate(f"(()=>{{document.querySelectorAll('.toast,.notice,.title-card').forEach(n=>n.remove()); window.clubNyc.api.goto('{r}')}})()")
            await pg.wait_for_timeout(1800)
            info = await pg.evaluate("""(()=>{const w=window.clubNyc.world; return {room:w.room.id, geo:!!w.geo, hits:w.hits.length, npcs:w.npcs.length, seats:w.seats.length, missing: Object.keys(w.room.objects).filter(k=>!(w.geo&&w.geo.cutouts[k]) && !(w.geo&&w.geo.zones&&w.geo.zones[k])), playerOk: w.nav.walkable(w.player.pos)}})()""")
            await pg.evaluate("document.querySelectorAll('.toast,.notice').forEach(n=>n.remove())")
            await pg.screenshot(path=os.path.join(HERE, 'out', f'sweep-{r}.png'))
            flag = '' if info['geo'] and not info['missing'] and info['playerOk'] else '  <-- CHECK'
            print(f"{r:18} geo={info['geo']} hits={info['hits']:2} npcs={info['npcs']} seats={info['seats']} missing={info['missing']}{flag}")
        for e in errs[:20]:
            print('ERR', e[:300])
        await b.close()

asyncio.run(main())
