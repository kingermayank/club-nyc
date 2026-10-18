"""Rosa's first-day tour, the "Show me" pointers and the job lobby, in a real browser.
usage: .venv/bin/python tools/tour_test.py [base_url]     (default http://localhost:5197 — run `bash tools/qa_stack.sh` first)
A brand-new player signs up through the UI, then we walk the whole tour (every card must spotlight something that's
actually on screen, and the card must sit inside the stage), try "Show me" on the first-day list, open a job lobby
(this week / all time / friends), and replay the tour with the ? button. Screenshots: tools/out/tour-*.png."""
import asyncio, os, sys, time
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5197'
OUT = os.path.join(HERE, 'out')
os.makedirs(OUT, exist_ok=True)
results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(('PASS ' if ok else 'FAIL ') + name + (f'  ({detail})' if detail != '' else ''), flush=True)


CARD_STATE = """() => {
  const card = document.querySelector('.tour-card'), hole = document.querySelector('.tour-hole'), stage = document.querySelector('.stage')
  if (!card) return null
  const c = card.getBoundingClientRect(), s = stage.getBoundingClientRect(), h = hole.getBoundingClientRect()
  return {
    title: card.querySelector('.tour-body b')?.textContent ?? '',
    centered: !!document.querySelector('.tour.tour-center'),
    hole: [Math.round(h.width), Math.round(h.height)],
    inside: c.left >= s.left - 1 && c.top >= s.top - 1 && c.right <= s.right + 1 && c.bottom <= s.bottom + 1,
    buttons: [...card.querySelectorAll('button')].map((b) => b.textContent),
  }
}"""


async def onboard(pg, name):
    await pg.goto(BASE + '/play?desktop', wait_until='networkidle')
    await pg.wait_for_selector('.si-live.busy, .si-live.quiet', timeout=8000)
    await pg.click('.si-play')
    await pg.wait_for_selector('.creator-card', timeout=10000)
    nxt = '.creator-actions .btn.go'
    # screen 1: pick a ready-made look, then "That's me"
    await pg.locator('.cr-preset').nth(1).click()
    await pg.wait_for_timeout(250)
    await pg.click(nxt)
    # screen 2: name, 13+, "Walk into the city" (claims the name)
    await pg.wait_for_selector('.creator-name input')
    await pg.fill('.creator-name input', name)
    await pg.wait_for_selector('.cr-avail.ok', timeout=5000)
    await pg.select_option('.cr-month', '6'); await pg.select_option('.cr-year', '2000'); await pg.click('.cr-age input')
    await pg.click(nxt)  # Walk into the city


async def main():
    name = 'Tour' + format(int(time.time()) % 100000, 'x')
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 1000, 'height': 565})
        pg = await ctx.new_page()
        errors = []
        pg.on('pageerror', lambda e: errors.append(str(e)))
        await onboard(pg, name)

        # ---------- the tour starts by itself for a brand-new player ----------
        await pg.wait_for_selector('.tour-card', timeout=10000)
        await pg.wait_for_timeout(500)
        first = await pg.evaluate(CARD_STATE)
        await pg.screenshot(path=os.path.join(OUT, 'tour-0-welcome.png'))
        check('Rosa’s tour starts by itself for a new New Yorker', first and 'Welcome to New York' in first['title'], first)
        await pg.click('.tour-next')  # Show me around
        # the "try it" card: walking moves the tour on by itself
        await pg.wait_for_timeout(500)
        st = await pg.evaluate(CARD_STATE)
        check('the walking card spotlights your New Yorker', st and st['title'] == 'Walk around' and st['hole'][0] > 10, st)
        await pg.screenshot(path=os.path.join(OUT, 'tour-1-walk.png'))
        await pg.mouse.click(300, 470)  # the pavement
        await pg.wait_for_function("() => document.querySelector('.tour-body b')?.textContent !== 'Walk around'", timeout=5000)
        check('walking moves the tour on by itself', True)
        # every other card: a real spotlight inside the stage
        seen, bad, i = [], [], 2
        while True:
            await pg.wait_for_timeout(450)
            st = await pg.evaluate(CARD_STATE)
            if not st:
                break
            seen.append(st['title'])
            if not st['inside'] or (not st['centered'] and min(st['hole']) < 8):
                bad.append(st)
            await pg.screenshot(path=os.path.join(OUT, f'tour-{i}.png'))
            i += 1
            last = st['buttons'][-1] if st['buttons'] else ''
            # the newest card's button (a card that's just been left fades out for a moment)
            await pg.locator('.tour-next').last.click(timeout=8000)
            if 'Let’s go' in last:
                break
        # five cards in all (the user's rule: onboarding is 4-5 steps): welcome, walk, then these three
        check('every tour card spotlights something on screen and fits inside the game (5 cards in all)', not bad and len(seen) == 3, f'{len(seen)} cards: {seen}' if not bad else bad)
        await pg.wait_for_timeout(400)
        check('the tour is marked done', await pg.evaluate("clubNyc.save.tour") == 'done')
        check('the tour is gone when it ends', not await pg.evaluate("!!document.querySelector('.tour')"))

        # ---------- "Show me" on the first-day list ----------
        await pg.click('.q-show')
        await pg.wait_for_selector('.tour-card', timeout=4000)
        await pg.wait_for_timeout(300)
        st = await pg.evaluate(CARD_STATE)
        await pg.screenshot(path=os.path.join(OUT, 'tour-show-me.png'))
        check('“Show me” points at the next thing to do', st and st['title'] and 'Got it' in ' '.join(st['buttons']), st)
        await pg.click('.tour-next')
        # a quest that's elsewhere offers to take you there
        # finish the steps before the job (walk, welcome gift, a friend) the way play would (the list checks the underlying stats), so "Work a shift" is next
        await pg.evaluate("""() => { const s = clubNyc.save; s.stats.walks = 1; s.stats.clicks = 1; s.stats.snacks = 1; if (!s.owned.includes('nyc-cap')) s.owned.push('nyc-cap')
          const r = clubNyc.residents?.[0]?.id ?? null; if (r && !s.friends.includes(r)) s.friends.push(r); else if (!r) s.friends.push(s.friends[0] ?? 'local'); if (!s.stamps.includes('straphanger')) s.stamps.push('straphanger') }""")
        await pg.evaluate("clubNyc.api.goto('central-park')")
        await pg.wait_for_function("() => document.querySelector('.q-now b')?.textContent === 'Work a shift'", timeout=8000)
        await pg.wait_for_timeout(1500)
        await pg.click('.q-show')
        await pg.wait_for_selector('.tour-card', timeout=4000)
        acts = await pg.evaluate("[...document.querySelectorAll('.tour-card button')].map(b => b.textContent)")
        has_take = any('Take me' in a for a in acts)
        check('a job that’s elsewhere offers “Take me there”', has_take, acts)
        if has_take:
            await pg.click('.tour-act')
            await pg.wait_for_timeout(2600)
            room = await pg.evaluate("clubNyc.world.room.id")
            check('“Take me there” goes there', room == 'pizza', room)
        else:
            await pg.click('.tour-next')

        # ---------- the job lobby: how it works + leaderboards ----------
        await pg.evaluate("clubNyc.api.playGame('slice-factory')")
        await pg.wait_for_selector('.lobby', timeout=6000)
        await pg.wait_for_timeout(600)
        tabs = await pg.evaluate("[...document.querySelectorAll('.lobby-tabs button')].map(b => b.textContent)")
        await pg.screenshot(path=os.path.join(OUT, 'tour-lobby.png'))
        check('a job opens a lobby with this week / all time / friends', tabs == ['This week', 'All time', 'Friends'], tabs)
        for t in range(3):
            await pg.locator('.lobby-tabs button').nth(t).click()
            await pg.wait_for_timeout(500)
            txt = await pg.evaluate("document.querySelector('.lobby-rows').innerText")
            check(f'the “{tabs[t]}” board loads', 'Loading' not in txt and 'Couldn’t' not in txt, txt[:60].replace('\n', ' | '))
        await pg.click('.lobby-back')
        await pg.wait_for_timeout(700)
        check('“Back to the city” leaves the lobby', not await pg.evaluate("!!document.querySelector('.game-shell')"))
        await pg.evaluate("clubNyc.api.playGame('slice-factory')")
        await pg.wait_for_selector('.lobby-full', timeout=6000)
        await pg.click('.lobby-full')
        await pg.wait_for_selector('.community', timeout=5000)
        on = await pg.evaluate("document.querySelector('.cm-chip.on')?.textContent ?? ''")
        check('“Full leaderboard” opens that game’s leaderboard', 'Slice Factory' in on, on)
        await pg.keyboard.press('Escape')
        await pg.wait_for_timeout(400)

        # ---------- the HUD: the online counter sits left of the coins ----------
        r = await pg.evaluate("""() => { const a = document.querySelector('.online-pill')?.getBoundingClientRect(), b = document.querySelector('.coin-plate').getBoundingClientRect(), j = document.querySelector('.jam-chip')?.getBoundingClientRect()
          return { left: !!a && a.right <= b.left + 1 && Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 6, jam: !j || !a || j.top >= a.bottom || j.width === 0 } }""")
        check('the online counter sits left of the coins, clear of the Dance Jam chip', r['left'] and r['jam'], r)
        await pg.screenshot(path=os.path.join(OUT, 'tour-hud.png'))

        # ---------- ? replays the tour ----------
        await pg.click('.help-btn')
        await pg.wait_for_selector('.tour-card', timeout=4000)
        t0 = await pg.evaluate(CARD_STATE)
        check('the ? button replays the tour', t0 and 'Welcome to New York' in t0['title'], t0)
        await pg.keyboard.press('Escape')
        await pg.wait_for_timeout(400)
        check('Escape closes the tour', not await pg.evaluate("!!document.querySelector('.tour')"))
        check('no page errors', not errors, errors[:3])
        await b.close()
    bad = [n for n, ok in results if not ok]
    print(f'\n{len(results) - len(bad)}/{len(results)} checks passed')
    sys.exit(1 if bad else 0)


asyncio.run(main())
