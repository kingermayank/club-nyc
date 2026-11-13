"""
Opens every picture info card in the game (the shared "picture, history, pigeon line, button" card) in a headless
browser and saves a picture of each, plus cards.json with what each one says and offers.

    .venv/bin/python tools/card_audit.py http://localhost:5174 [out-dir]
"""
import asyncio, sys, os, json, re
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5174'
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), 'out', 'cards')
os.makedirs(OUT, exist_ok=True)

LIST = """(async () => {
  const { ROOMS } = await import('/src/data/rooms.ts')
  const out = []
  for (const [id, r] of Object.entries(ROOMS)) for (const [k, o] of Object.entries(r.objects ?? {})) {
    const src = o.act ? o.act.toString() : ''
    const kind = src.includes('infocard') ? 'card' : /souv[(]|busker|subwayLife/.test(src) ? 'maybe' : ''
    if (kind) out.push({ room: id, roomName: r.name, obj: k, label: o.label, kind })
  }
  return out
})()"""
OPEN = """(async ([room, obj]) => {
  const { ROOMS } = await import('/src/data/rooms.ts')
  ROOMS[room].objects[obj].act(window.clubNyc.api)
})"""
READ = """(() => {
  const c = document.querySelector('.overlay.open .ic-card, .ic-card')
  if (!c) return null
  const t = (s) => c.querySelector(s)?.innerText.trim() ?? ''
  return { title: t('h2'), kicker: t('.ic-kicker'), text: t('.ic-text'), joke: t('.ic-joke'), caption: t('figcaption'),
    facts: [...c.querySelectorAll('.ic-facts span')].map((e) => e.innerText),
    actions: [...c.querySelectorAll('.ic-actions button')].map((e) => e.innerText.replace(/\\n/g, ' / ')),
    pic: !!c.querySelector('.ic-frame'), extra: c.querySelector('.ic-body').children.length > 0 && !!c.querySelector('.ic-body > :not(.ic-kicker):not(h2):not(.ic-text):not(.ic-facts):not(.ic-joke):not(.ic-actions)'),
    quiet: c.classList.contains('quiet') }
})()"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1280, 'height': 800}, device_scale_factor=2)
        await pg.goto(BASE + '/play?profile=card-audit', wait_until='networkidle')
        if await pg.locator('text=Play Offline Instead').count():
            await pg.click('text=Play Offline Instead')
        try:
            await pg.wait_for_selector('.cr-door.build', timeout=8000)
            await pg.click('.cr-door.build')
            await pg.click('.creator-actions .btn.go')
            await pg.fill('.creator-name input', 'CardAudit')
            await pg.click('.cr-age input')
            await pg.click('.creator-actions .btn.go')
            await pg.wait_for_selector('.ar-skip', timeout=10000)
            await pg.click('.ar-skip')
            await pg.wait_for_timeout(3500)
        except Exception:
            pass
        items = await pg.evaluate(LIST)
        if len(sys.argv) > 3: items = [i for i in items if i['kind'] == sys.argv[3]]
        print(len(items), 'candidates')
        done, room = [], None
        for it in items:
            if it['room'] != room:
                room = it['room']
                await pg.evaluate(f"window.clubNyc.api.goto('{room}')")
                await pg.wait_for_timeout(1800)
            await pg.evaluate("document.querySelectorAll('.overlay.open button[aria-label=\"Close\"]').forEach((b) => b.click())")
            await pg.wait_for_timeout(250)
            await pg.evaluate(OPEN, [it['room'], it['obj']])
            try:
                await pg.wait_for_selector('.ic-card', timeout=2500)
            except Exception:
                print('no card:', it['room'], it['obj']); continue
            await pg.wait_for_timeout(700)
            info = await pg.evaluate(READ)
            name = f"{it['room']}--{re.sub(r'[^a-z0-9-]', '', it['obj'])}.png"
            await pg.locator('.ic-card').first.screenshot(path=os.path.join(OUT, name))
            done.append({**it, **info, 'img': name})
            print('ok', it['room'], it['obj'], '|', info['title'], '|', info['actions'])
            await pg.evaluate("document.querySelectorAll('.overlay.open button[aria-label=\"Close\"]').forEach((b) => b.click())")
            await pg.wait_for_timeout(350)
        json.dump(done, open(os.path.join(OUT, 'cards.json' if len(sys.argv) < 4 else f'cards-{sys.argv[3]}.json'), 'w'), indent=1, ensure_ascii=False)
        print(len(done), 'cards')
        await b.close()

asyncio.run(main())
