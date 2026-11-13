"""
Watches the subway station's train through a whole cycle in a real (headless) browser and saves pictures of it.
The page runs continuously here, unlike the desktop app's preview pane, so this is the check for the clips: that they
play, that jumping into the middle of one works, and that nothing crashes.

    .venv/bin/python tools/train_check.py http://localhost:5174 [out-dir]
"""
import asyncio, sys, os
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5174'
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), 'out', 'train')
os.makedirs(OUT, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1280, 'height': 800})
        crashed = []
        pg.on('crash', lambda: crashed.append('crash'))
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        await pg.goto(BASE + '/play?profile=train-check', wait_until='networkidle')
        # a new New Yorker, offline, straight to the street
        if await pg.locator('text=Play Offline Instead').count():
            await pg.click('text=Play Offline Instead')
        if await pg.locator('.cr-door.build').count() or await pg.wait_for_selector('.cr-door.build', timeout=8000):
            await pg.click('.cr-door.build')
            await pg.click('.creator-actions .btn.go')
            await pg.fill('.creator-name input', 'TrainCheck')
            await pg.click('.cr-age input')
            await pg.click('.creator-actions .btn.go')
            await pg.wait_for_selector('.ar-skip', timeout=10000)
            await pg.click('.ar-skip')
            await pg.wait_for_timeout(3500)
        await pg.evaluate("window.clubNyc.api.goto('subway')")
        await pg.wait_for_timeout(2500)
        await pg.evaluate("document.querySelector('.tour .tour-skip, .tour button')?.click()")
        stage = await pg.evaluate("(() => { const r = document.querySelector('.stage').getBoundingClientRect(); return [r.left, r.top, r.width, r.height] })()")
        k = stage[2] / 1000
        clip = {'x': stage[0] + 560 * k, 'y': stage[1], 'width': 440 * k, 'height': 520 * k}
        state = "(() => { const v = document.querySelector('.st-clip'); return { t: ((Date.now() / 1000 + (window.clubNycTrainSkew || 0)) % 80).toFixed(1), board: document.querySelector('.st-board')?.innerText.replace(/\\n/g, ' '), clip: v ? v.currentTime.toFixed(2) + (v.paused ? ' held' : ' running') + (v.classList.contains('on') ? '' : ' (not loaded)') : 'none' } })()"
        async def jump(t):
            await pg.evaluate(f"window.clubNycTrainSkew = (({t} - (Date.now() / 1000) % 80) + 80) % 80")
        # the whole cycle from just before the train comes, a picture every 0.75 s
        await jump(77.5)
        n = 0
        for i in range(62):
            await pg.wait_for_timeout(750)
            # (a card that pops up on its own, like the neighborhood pick, would cover the train)
            await pg.evaluate("document.querySelector('.overlay.open button[aria-label=\"Close\"]')?.click()")
            s = await pg.evaluate(state)
            n += 1
            await pg.screenshot(path=os.path.join(OUT, f'run-{n:02d}.png'), clip=clip)
            print(n, s)
            if i == 14:
                # skip most of the wait at the platform
                await jump(31.6)
        # walking in half-way through each clip
        for name, t in (('arrive', 3.0), ('open', 7.2), ('close', 34.2), ('depart', 37.8)):
            await jump(t)
            await pg.wait_for_timeout(400)
            print('mid', name, await pg.evaluate(state))
            await pg.screenshot(path=os.path.join(OUT, f'mid-{name}.png'), clip=clip)
        # the join: with no train, the clip's frame must be the room. Compare the screen with the clip on and off.
        from PIL import Image, ImageChops
        import io
        await jump(60)
        await pg.wait_for_timeout(700)
        strip = {'x': stage[0] + 690 * k, 'y': stage[1], 'width': 310 * k, 'height': 500 * k}
        # (people and pigeons wander through, so it is measured a few times and the quietest pair counts)
        best = None
        for _ in range(5):
            on = Image.open(io.BytesIO(await pg.screenshot(clip=strip))).convert('RGB')
            await pg.evaluate("document.querySelector('.st-strip').style.display = 'none'")
            await pg.wait_for_timeout(120)
            off = Image.open(io.BytesIO(await pg.screenshot(clip=strip))).convert('RGB')
            await pg.evaluate("document.querySelector('.st-strip').style.display = ''")
            await pg.wait_for_timeout(600)
            hist = ImageChops.difference(on, off).convert('L').histogram()
            n = sum(hist)
            mean = sum(i * c for i, c in enumerate(hist)) / n
            if best is None or mean < best[0]:
                best = (mean, sum(c for i, c in enumerate(hist) if i > 8) / n, max(i for i, c in enumerate(hist) if c), on, off)
        mean, over, top, on, off = best
        print(f'join, empty track: mean difference {mean:.2f} of 255, {over * 100:.2f}% of pixels differ by more than 8, largest {top}')
        on.save(os.path.join(OUT, 'join-on.png')); off.save(os.path.join(OUT, 'join-off.png'))
        print('crashed:', crashed, 'errors:', errors[:3])
        await b.close()

asyncio.run(main())
