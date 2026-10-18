"""Client frame cost with a crowded room.
usage: .venv/bin/python tools/mp_perf.py [base_url] [--min-remote 40] [--seconds 8] [--wait 20] [--shot mp-crowd.png]
  base_url      the game (default http://localhost:5173 — the Vite dev server; a built client served by the game
                server works too, e.g. http://localhost:8899)
  --min-remote  wait until this many other players are on screen before measuring (0 = measure right away)
  --seconds     how long to record frame times
  --wait        how long to wait for the crowd
  --shot        screenshot file name (written to tools/out/)
Signs a guest in, lands in Times Square, prints READY (so a load script can start its bots now — the browser is
then in the first copy of the room and the bots fill it up around it), waits for the crowd, then records frame
times and prints `RESULT {json}`.
Classic use: (cd server && npx tsx scripts/loadtest.ts 45 40 times-square) & .venv/bin/python tools/mp_perf.py
server/scripts/loadtest-scenarios.ts runs it as the `browser` scenario."""
import argparse, asyncio, json, os, re, time
from playwright.async_api import async_playwright

ap = argparse.ArgumentParser()
ap.add_argument('base', nargs='?', default=None)
ap.add_argument('--base', dest='base_flag', default=None)
ap.add_argument('--min-remote', type=int, default=40)
ap.add_argument('--seconds', type=float, default=8)
ap.add_argument('--wait', type=float, default=20)
ap.add_argument('--shot', default='mp-crowd.png')
args = ap.parse_args()
# the Terms / Privacy / Rules version new players agree to (shared with the game and the server)
POLICY = re.search(r"POLICY_VERSION = '([^']+)'", open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'app', 'src', 'data', 'policy.ts')).read()).group(1)
BASE = (args.base_flag or args.base or 'http://localhost:5173').rstrip('/')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
os.makedirs(OUT, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        c = await b.new_context(viewport={'width': 1280, 'height': 723})
        pg = await c.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)[:200]))
        await pg.goto(BASE + '/api/health')
        name = 'Perf_' + format(int(time.time() * 1000) % 0xfffffff, 'x')[:9]
        status = await pg.evaluate("""async ([name, consent]) => {
          await fetch('/api/auth/guest', { method: 'POST' })
          const r = await fetch('/api/profile', { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name, team: 'midtown', birth: { m: 1, y: 2000 }, consent, look: { skin: 2, hair: 'short', hairColor: 1, items: { body: 'tee-red', legs: 'jeans', feet: 'sneakers' } } }) })
          return r.status
        }""", [name, POLICY])
        await pg.goto(BASE + '/play', wait_until='networkidle')
        await pg.wait_for_selector('.online-pill.on', timeout=20000)
        room = await pg.evaluate("(window.clubNyc && clubNyc.world && clubNyc.world.room.id) || 'unknown'")
        print('READY', room, flush=True)
        t0 = time.time()
        if args.min_remote > 0:
            await pg.wait_for_function(f"document.querySelectorAll('.actor.remote').length >= {args.min_remote}", timeout=args.wait * 1000)
            await pg.wait_for_timeout(2000)  # let the arrival animations settle
        crowd_wait = round(time.time() - t0, 1)
        n = await pg.evaluate("document.querySelectorAll('.actor.remote').length")
        inst = await pg.evaluate("(document.querySelector('.online-pill em') || {}).textContent || 'Room 1'")
        # main-thread work per second of wall time (rAF is vsync-capped, so frame times alone hide headroom)
        cdp = await c.new_cdp_session(pg)
        await cdp.send('Performance.enable')
        async def perf():
            return {m['name']: m['value'] for m in (await cdp.send('Performance.getMetrics'))['metrics']}
        m0, w0 = await perf(), time.time()
        stats = await pg.evaluate("""(ms) => new Promise(res => {
          const dts = []; let last = performance.now(); let long = 0, longMs = 0
          new PerformanceObserver(l => { for (const e of l.getEntries()) { long++; longMs += e.duration } }).observe({ type: 'longtask', buffered: false })
          const end = last + ms
          const f = (t) => { dts.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else {
            dts.sort((a, b) => a - b)
            const avg = dts.reduce((a, b) => a + b, 0) / dts.length
            res({ frames: dts.length, fps: +(1000 / avg).toFixed(1), p50: +dts[Math.floor(dts.length * .5)].toFixed(1), p95: +dts[Math.floor(dts.length * .95)].toFixed(1), p99: +dts[Math.floor(dts.length * .99)].toFixed(1), worst: +dts[dts.length - 1].toFixed(1), longTasks: long, longTaskMs: Math.round(longMs) })
          } }
          requestAnimationFrame(f)
        })""", args.seconds * 1000)
        m1, wall = await perf(), time.time() - w0
        busy = lambda k: round(100 * (m1.get(k, 0) - m0.get(k, 0)) / wall, 1)
        stats.update({'mainThreadBusyPct': busy('TaskDuration'), 'scriptPct': busy('ScriptDuration'), 'layoutPct': busy('LayoutDuration'),
                      'stylePct': busy('RecalcStyleDuration'), 'jsHeapMB': round(m1.get('JSHeapUsedSize', 0) / 1048576, 1), 'domNodes': int(m1.get('Nodes', 0))})
        result = {'profileStatus': status, 'room': room, 'instance': inst, 'remotePlayers': n, 'crowdWaitS': crowd_wait, **stats, 'pageErrors': errors[:3]}
        print({'remotePlayers': n, **stats}, flush=True)
        await pg.screenshot(path=os.path.join(OUT, args.shot))
        print('RESULT ' + json.dumps(result), flush=True)
        await b.close()

asyncio.run(main())
