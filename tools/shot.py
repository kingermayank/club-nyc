"""Headless QA screenshots.
usage: shot.py <name> <url> [<js> <wait_ms>]...
Each (js, wait) step runs the JS in the page, waits, then saves tools/out/qa-<name>-<i>.png (1000x565 viewport).
Use js '-' for "no script, just wait and shoot". A step's JS may be async (wrap in an async IIFE)."""
import sys, os, asyncio
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))

async def main():
    name, url, rest = sys.argv[1], sys.argv[2], sys.argv[3:]
    steps = list(zip(rest[0::2], rest[1::2]))
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1000, 'height': 565}, device_scale_factor=1)
        logs = []
        pg.on('console', lambda m: logs.append(f'[{m.type}] {m.text}') if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append(f'[pageerror] {e}'))
        await pg.goto(url, wait_until='networkidle')
        for i, (js, wait) in enumerate(steps):
            if js != '-':
                try:
                    r = await pg.evaluate(js)
                    if r is not None:
                        print(f'step {i}:', str(r)[:400])
                except Exception as e:
                    print(f'step {i} JS error:', str(e)[:400])
            await pg.wait_for_timeout(int(wait))
            out = os.path.join(HERE, 'out', f'qa-{name}-{i}.png')
            await pg.screenshot(path=out)
            print('saved', out)
        for l in logs[:15]:
            print(l)
        await b.close()

asyncio.run(main())
