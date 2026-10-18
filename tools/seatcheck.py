"""Sit the player on seats in the given rooms and crop a screenshot around each sitter (draw-order QA)."""
import asyncio, os, json, sys
from playwright.async_api import async_playwright
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
SAVE = {"created": True, "name": "QA", "team": "midtown", "memberSince": "2026-09-01", "coins": 999,
        "look": {"skin": 2, "hair": "curly", "hairColor": 3, "items": {"body": "tee-red", "legs": "jeans", "feet": "sneakers"}},
        "stats": {"party-intro": 1}, "quests": {q: 1 for q in ['walk', 'gift', 'friend', 'job', 'subway']}, "stamps": ["local"]}

async def main():
    rooms = sys.argv[1:]
    crops = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1000, 'height': 565})
        await pg.goto('http://localhost:5173/play?profile=seatqa', wait_until='networkidle')
        await pg.evaluate(f"localStorage.setItem('club-nyc:v2:seatqa', JSON.stringify({json.dumps(SAVE)}))")
        await pg.reload(wait_until='networkidle')
        await pg.wait_for_timeout(2500)
        for r in rooms:
            await pg.evaluate(f"(()=>{{document.querySelectorAll('.toast,.notice,.title-card,.quests').forEach(n=>n.remove()); window.clubNyc.api.goto('{r}')}})()")
            await pg.wait_for_timeout(1800)
            seats = await pg.evaluate("window.clubNyc.world.seats.map(s=>({id:s.id, x:s.sit[0], y:s.sit[1], z:s.z??null}))")
            for s in seats[:3]:
                # clear npcs off this seat, then sit the player
                await pg.evaluate(f"""(()=>{{const w=window.clubNyc.world; w.npcs.forEach(a=>{{if(a.seat&&a.seat.id==='{s['id']}') a.standUp()}}); const seat=w.seats.find(x=>x.id==='{s['id']}'); w.player.sitOn(seat); document.querySelectorAll('.toast,.notice').forEach(n=>n.remove())}})()""")
                await pg.wait_for_timeout(500)
                path = os.path.join(HERE, 'out', f'seat-{r}-{s["id"]}.png')
                x, y = s['x'], s['y']
                await pg.screenshot(path=path, clip={'x': max(0, x - 90), 'y': max(0, y - 140), 'width': 180, 'height': 190})
                crops.append((f"{r}/{s['id']}", path))
        await b.close()
    W, H = 180, 190
    cols = 6
    rows = (len(crops) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * (W + 6), rows * (H + 18)), 'white')
    from PIL import ImageDraw
    d = ImageDraw.Draw(sheet)
    for i, (label, path) in enumerate(crops):
        im = Image.open(path)
        X, Y = (i % cols) * (W + 6), (i // cols) * (H + 18)
        sheet.paste(im, (X, Y + 16))
        d.text((X + 2, Y + 2), label, fill='black')
    sheet.save('/tmp/seats.jpg', quality=85)
    print(len(crops), 'seat crops')

asyncio.run(main())
