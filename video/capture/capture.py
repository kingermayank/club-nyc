"""Real Club NYC footage for the launch trailer -> video/public/footage/ (1920 x 1080 clips and stills).

usage: .venv/bin/python video/capture/capture.py [scene ...]
       scenes: crowd creator map places jam jobs party stamps extras flashmob hero (default: all)
Needs the private QA copy of the game running (bash tools/qa_stack.sh -> http://localhost:5197). The crowd scene signs
real guest players into that copy; everything else is a single-player test save (?profile=trailer), so nothing here
touches your real save or your dev servers.
"""
import asyncio, json, os, random, re, sys
from playwright.async_api import async_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rec import Recorder, HIDE_HUD  # noqa: E402

BASE = os.environ.get('CLUB_BASE', 'http://localhost:5197')
OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'footage'))
os.makedirs(OUT, exist_ok=True)
VIEW = {'width': 960, 'height': 540}  # x2 = 1920 x 1080

LOOK = {"skin": 2, "hair": "curly", "hairColor": 1,
        "items": {"body": "denim-jacket", "legs": "black-jeans", "feet": "hightops", "head": "nyc-cap", "neck": "team-scarf-midtown", "hand": "coffee"}}
FURNITURE = [{"id": "rug", "x": 500, "y": 480}, {"id": "sofa", "x": 330, "y": 430}, {"id": "jukebox", "x": 700, "y": 410},
             {"id": "lamp", "x": 210, "y": 420}, {"id": "plant", "x": 790, "y": 440}, {"id": "record-player", "x": 600, "y": 420}]
SAVE = {"created": True, "name": "Bea_NYC", "team": "midtown", "memberSince": "2026-09-01", "coins": 1240, "look": LOOK,
        "owned": ["denim-jacket", "black-jeans", "hightops", "nyc-cap", "team-scarf-midtown", "coffee"],
        "furniture": FURNITURE, "stats": {"party-intro": 1},
        # (the flash mob stamp already earned, so no local stops to teach it on camera: "Dance with me! Press D")
        "quests": {q: 1 for q in ['walk', 'gift', 'friend', 'job', 'subway']}, "stamps": ["local", "flash-mob"], "tour": "done",
        "lastDaily": "", "seenNews": 1}
# nudge the clock so a Dance Jam starts 14 s after the page loads (shows start every 8 minutes)
JAM_CLOCK = "(() => { const real = Date.now.bind(Date); const P = 480000; const shift = P - (real() % P) - 14000; Date.now = () => real() + shift })()"


def out(name):
    return os.path.join(OUT, name)


async def seeded(b, profile='trailer', save=SAVE, init=None, hud=False):
    """a single-player page with a test save, standing in Times Square"""
    c = await b.new_context(viewport=VIEW, device_scale_factor=2)
    if init:
        await c.add_init_script(init)
    pg = await c.new_page()
    await pg.goto(f'{BASE}/play?profile={profile}', wait_until='networkidle')
    if save is not None:
        await pg.evaluate("([k, s]) => localStorage.setItem(k, s)", [f'club-nyc:v2:{profile}', json.dumps(save)])
        await pg.reload(wait_until='networkidle')
    if not hud:
        await pg.add_style_tag(content=HIDE_HUD)
    await pg.wait_for_timeout(2500)
    return c, pg


async def goto(pg, room, settle=4500):
    await pg.evaluate("r => clubNyc.api.goto(r)", room)
    await pg.wait_for_timeout(1200)
    await pg.wait_for_function("[...document.images].filter(i => i.offsetParent).every(i => i.complete)", timeout=15000)
    await pg.wait_for_timeout(settle)


async def walk(pg, x, y):
    await pg.evaluate("s => clubNyc.walkTo(s)", [x, y])


async def clip(pg, name, seconds, script=None):
    """record `seconds` of real time while `script` (an async function) runs"""
    r = Recorder(pg)
    await r.start()
    if script:
        await asyncio.gather(script(), pg.wait_for_timeout(seconds * 1000))
    else:
        await pg.wait_for_timeout(seconds * 1000)
    await r.stop(out(name + '.mp4'))


async def still(pg, name):
    await pg.screenshot(path=out(name + '.png'))
    print('  still', name, flush=True)


async def say(pg, line):
    await pg.click('.chat-input')
    await pg.keyboard.type(line, delay=12)
    await pg.keyboard.press('Enter')


# ---------------------------------------------------------------- scenes
async def crowd(b):
    """Times Square with real players: they gather, chat, wave and dance (one long take, cut up in the edit)"""
    friends = [('Ana_NYC', 0), ('BenFromBK', 3), ('Cleo', 5), ('DevSlice', 1), ('Eli_Uptown', 6), ('Fran_Q', 2)]
    ctxs, pages = [], []
    for name, look in [('Bea_NYC', 4)] + friends:
        size = VIEW if name == 'Bea_NYC' else {'width': 640, 'height': 360}
        c = await b.new_context(viewport=size, device_scale_factor=2 if name == 'Bea_NYC' else 1)
        ctxs.append(c)
        pages.append(await c.new_page())

    async def join(pg, name, look):
        await pg.goto(f'{BASE}/play?start=guest', wait_until='networkidle')
        await pg.wait_for_selector('.creator-card', timeout=15000)
        await pg.locator('.cr-preset').nth(look % 8).click()
        await pg.wait_for_timeout(200)
        await pg.click('.creator-actions .btn.go')
        await pg.wait_for_selector('.creator-name input')
        await pg.fill('.creator-name input', name)
        await pg.wait_for_selector('.cr-avail.ok', timeout=8000)
        await pg.select_option('.cr-month', '6')
        await pg.select_option('.cr-year', '2000')
        await pg.click('.cr-age input')
        await pg.click('.creator-actions .btn.go')
        await pg.wait_for_selector('.online-pill.on', timeout=15000)
        try:
            await pg.wait_for_selector('.tour .tour-skip', timeout=8000)
            await pg.click('.tour .tour-skip')
        except Exception:
            pass

    await asyncio.gather(*(join(pg, n, l) for pg, (n, l) in zip(pages, [('Bea_NYC', 4)] + friends)))
    cam, A, B, C, D, E, F = pages
    await cam.add_style_tag(content=HIDE_HUD)
    # everyone starts around the edges of the square
    starts = {A: (170, 470), B: (840, 455), C: (260, 520), D: (760, 520), E: (120, 520), F: (880, 500), cam: (520, 540)}
    for pg, (x, y) in starts.items():
        await walk(pg, x, y)
    await cam.wait_for_timeout(5000)

    async def story():
        await say(A, 'anyone in Times Square?')
        await cam.wait_for_timeout(1300)
        await say(B, 'omw!')
        await cam.wait_for_timeout(1300)
        await say(C, 'save me a spot 🍕')
        await cam.wait_for_timeout(900)
        # everyone heads for the middle
        for pg, (x, y) in {A: (400, 470), B: (585, 462), C: (470, 505), D: (650, 495), E: (330, 500), F: (720, 470), cam: (530, 480)}.items():
            await walk(pg, x, y)
        await cam.wait_for_timeout(3200)
        await A.keyboard.press('w')
        await say(B, 'nice jacket!')
        await cam.wait_for_timeout(700)
        await D.keyboard.press('d')
        await E.keyboard.press('d')
        await cam.wait_for_timeout(900)
        await say(F, 'dance jam later?')
        await C.keyboard.press('c')
        await cam.wait_for_timeout(1500)
        await cam.keyboard.press('d')
        await B.keyboard.press('d')
        await A.keyboard.press('d')
        await cam.wait_for_timeout(1200)
        await say(C, 'this city never sleeps')
        await F.keyboard.press('w')

    await clip(cam, 'crowd', 17, story)
    await still(cam, 'crowd-end')
    for c in ctxs:
        await c.close()


async def creator(b):
    """the New Yorker creator, a new look every beat"""
    c = await b.new_context(viewport=VIEW, device_scale_factor=2)
    pg = await c.new_page()
    await pg.goto(f'{BASE}/play?start=guest', wait_until='networkidle')
    await pg.wait_for_selector('.creator-card', timeout=15000)
    await pg.wait_for_timeout(1500)

    async def flip():
        for i in [1, 2, 5, 3, 6, 7, 4, 0]:
            await pg.locator('.cr-preset').nth(i).click()
            await pg.wait_for_timeout(660)

    await clip(pg, 'creator', 6, flip)
    await still(pg, 'creator')
    # one still per look, for cuts on the beat
    for n, i in enumerate([1, 2, 5, 3, 6, 7]):
        await pg.locator('.cr-preset').nth(i).click()
        await pg.wait_for_timeout(700)
        await still(pg, f'creator-{n + 1}')
    await c.close()
    faces()


def faces():
    """the friends' faces in the group chat: each look's head, cut from its creator still (face-1.png ...)"""
    from PIL import Image
    for n in range(1, 7):
        Image.open(out(f'creator-{n}.png')).convert('RGB').crop((311, 345, 631, 665)).resize((256, 256), Image.LANCZOS).save(out(f'face-{n}.png'))


async def map_scene(b):
    c, pg = await seeded(b)
    await pg.wait_for_timeout(1500)

    async def open_map():
        await pg.wait_for_timeout(300)
        await pg.keyboard.press('m')

    await clip(pg, 'map', 4, open_map)
    await still(pg, 'map')
    await c.close()


PLACES = [('central-park', (300, 470), (640, 480)), ('brooklyn-bridge', (260, 470), (700, 470)), ('liberty-island', (300, 480), (650, 470)),
          ('grand-central', (330, 480), (660, 470)), ('the-met', (300, 480), (640, 470)), ('chinatown', (300, 480), (650, 480)),
          ('rockefeller', (330, 480), (650, 470)), ('high-line', (300, 470), (640, 470)), ('soho', (300, 480), (650, 480))]


async def places(b):
    c, pg = await seeded(b)
    for room, a, z in PLACES:
        try:
            await goto(pg, room)
            await walk(pg, *a)
            await pg.wait_for_timeout(1800)

            async def stroll(z=z):
                await walk(pg, *z)

            await clip(pg, 'place-' + room, 3.5, stroll)
        except Exception as e:
            print('  place', room, 'failed:', e, flush=True)
    await c.close()


async def jam(b):
    """the show starting: confetti, the DJ, and the city's locals pouring onto the floor"""
    c, pg = await seeded(b, init=JAM_CLOCK)
    await pg.wait_for_timeout(5500)

    async def show():
        await walk(pg, 500, 470)
        await pg.wait_for_timeout(5200)
        await pg.keyboard.press('d')

    await clip(pg, 'jam', 16, show)
    await c.close()


JOBS = ['slice-factory', 'halal-rush', 'ferry-captain', 'showtime', 'bagel-counters']


async def jobs(b):
    for game in JOBS:
        c = await b.new_context(viewport=VIEW, device_scale_factor=2)
        pg = await c.new_page()
        try:
            await pg.goto(f'{BASE}/play?profile=trailer&game={game}', wait_until='networkidle')
            await pg.wait_for_timeout(2500)
            await still(pg, 'job-' + game + '-intro')
            start = pg.get_by_role('button', name=re.compile(r'start|play|clock in|let.?s go|cast off|open the cart', re.I)).first
            await start.click(timeout=5000)
            await pg.wait_for_timeout(1800)
            if game == 'slice-factory':
                await clip(pg, 'job-' + game, 9, lambda: slice_shift(pg))
                continue
            if game == 'ferry-captain':
                await clip(pg, 'job-' + game, 6, lambda: steer(pg))
                continue

            async def play():
                rnd = random.Random(game)
                for _ in range(14):
                    x, y = rnd.randint(260, 720), rnd.randint(220, 420)
                    await pg.mouse.move(x, y)
                    await pg.mouse.down()
                    for k in range(6):
                        await pg.mouse.move(x + rnd.randint(-40, 40), y + rnd.randint(-25, 25), steps=2)
                        await pg.wait_for_timeout(25)
                    await pg.mouse.up()
                    for key in ('ArrowLeft', 'ArrowRight', 'Space'):
                        if rnd.random() < 0.3:
                            await pg.keyboard.press(key)
                    await pg.wait_for_timeout(200)

            await clip(pg, 'job-' + game, 5, play)
        except Exception as e:
            print('  job', game, 'failed:', e, flush=True)
        await c.close()


async def slice_shift(pg):
    """make a pizza or two the way the ticket says: sauce, cheese, pepperoni"""
    box = await pg.evaluate("(() => { const r = document.querySelector('.slice-factory-scene').getBoundingClientRect(); return [r.left, r.top, r.width / 1000, r.height / 565] })()")
    P = lambda x, y: (box[0] + x * box[2], box[1] + y * box[3])
    pizza = "(() => { const r = [...document.querySelectorAll('.slice-factory-pizza')].map(p => p.getBoundingClientRect()).filter(r => r.width > 0 && r.left + r.width / 2 < innerWidth * 0.78).sort((a, b) => b.left - a.left)[0]; return r ? [r.left + r.width / 2, r.top + r.height / 2, r.width] : null })()"
    for _ in range(2):
        for _ in range(40):
            if await pg.evaluate(pizza):
                break
            await pg.wait_for_timeout(100)
        # sauce: grab the red bottle and scribble on the dough
        await pg.mouse.move(*P(36, 154))
        await pg.mouse.down()
        for k in range(26):
            p = await pg.evaluate(pizza)
            if not p:
                break
            a = k * 0.9
            r = p[2] * (0.12 + 0.2 * (k % 6) / 6)
            await pg.mouse.move(p[0] + r * __import__('math').cos(a), p[1] + r * 0.55 * __import__('math').sin(a), steps=3)
            await pg.wait_for_timeout(30)
        await pg.mouse.up()
        # cheese from the tub
        p = await pg.evaluate(pizza)
        if p:
            await pg.mouse.move(*P(75, 351))
            await pg.mouse.down()
            await pg.mouse.move(p[0], p[1], steps=8)
            await pg.mouse.up()
        await pg.wait_for_timeout(250)
        # three pepperoni
        for dx, dy in ((-0.15, -0.05), (0.15, 0.0), (0.0, 0.08)):
            p = await pg.evaluate(pizza)
            if not p:
                break
            await pg.mouse.move(*P(194, 150))
            await pg.mouse.down()
            await pg.mouse.move(p[0] + dx * p[2], p[1] + dy * p[2], steps=7)
            await pg.mouse.up()
            await pg.wait_for_timeout(120)
        await pg.wait_for_timeout(600)


async def steer(pg):
    for key, ms in (('ArrowUp', 700), ('ArrowDown', 900), ('ArrowUp', 600), ('ArrowDown', 700), ('ArrowUp', 800)):
        await pg.keyboard.down(key)
        await pg.wait_for_timeout(ms)
        await pg.keyboard.up(key)


async def party(b):
    c, pg = await seeded(b)
    await goto(pg, 'apartment', settle=2000)
    await still(pg, 'apartment')
    await pg.evaluate("clubNyc.party()")
    await pg.wait_for_timeout(900)
    await pg.click('.pp-actions .btn.go')
    await pg.add_style_tag(content=HIDE_HUD)
    await pg.wait_for_timeout(30000)  # guests arrive
    await pg.keyboard.press('d')
    await pg.wait_for_timeout(1000)
    await clip(pg, 'party', 6)
    await c.close()


async def stamps(b):
    c, pg = await seeded(b)
    ids = await pg.evaluate("import('/src/data/stamps.ts').then(m => Object.keys(m.STAMPS))")
    await pg.evaluate("ids => { clubNyc.save.stamps = ids }", ids[:26])
    await pg.evaluate("import('/src/features/stampbook.ts').then(m => m.openStampBook())")
    await pg.wait_for_timeout(1500)
    await still(pg, 'stampbook')
    await clip(pg, 'stampbook', 3)
    await c.close()


async def extras(b):
    c, pg = await seeded(b)
    # The Club NYC Times
    await pg.keyboard.press('n')
    await pg.wait_for_timeout(1800)
    await still(pg, 'newspaper')
    await pg.keyboard.press('Escape')
    await pg.wait_for_timeout(600)
    # Neighborhood Wars and the city's day
    for tab in ('teams', 'city'):
        await pg.evaluate("t => import('/src/social/community.ts').then(m => m.openCommunity(t))", tab)
        await pg.wait_for_timeout(1800)
        await still(pg, 'community-' + tab)
        await pg.keyboard.press('Escape')
        await pg.wait_for_timeout(600)
    # the photo booth strip, with whoever is around
    await goto(pg, 'times-square', settle=5000)
    await pg.evaluate("clubNyc.photo('Times Square')")
    await pg.wait_for_timeout(1400)
    await pg.click('.pb-actions .btn')
    await pg.wait_for_timeout(9500)
    await still(pg, 'photobooth')
    await c.close()


# ---------------------------------------------------------------- the landing page's hero loop, sharp
HI = {'width': 1280, 'height': 723}  # x2 = 2560 x 1446, exactly the stage's shape
ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
# iconic New York, the places anyone recognizes: where the New Yorker starts and where they stroll to
HERO = [('liberty-island', (300, 480), (650, 470)), ('brooklyn-bridge', (260, 470), (700, 470)), ('central-park', (300, 470), (640, 480)),
        ('empire-deck', (300, 470), (650, 470)), ('rockefeller', (330, 480), (650, 470)), ('grand-central', (330, 480), (660, 470))]


async def sharp_page(b, init=None):
    """a 2560 x 1446 test-save page that paints rooms from the original 2688 px artwork (the game ships 2000 px copies)"""
    c = await b.new_context(viewport=HI, device_scale_factor=2)
    if init:
        await c.add_init_script(init)

    async def original_art(route):
        name = route.request.url.split('/art/rooms/')[1].split('?')[0].split('.')[0]
        raw = os.path.join(ROOT, 'app', 'public', 'art', 'raw', name + '.png')
        if os.path.exists(raw):
            await route.fulfill(path=raw, content_type='image/png')
        else:
            await route.continue_()

    await c.route('**/art/rooms/*', original_art)
    pg = await c.new_page()
    await pg.goto(f'{BASE}/play?profile=trailer', wait_until='networkidle')
    await pg.evaluate("([k, s]) => localStorage.setItem(k, s)", ['club-nyc:v2:trailer', json.dumps(SAVE)])
    await pg.reload(wait_until='networkidle')
    await pg.add_style_tag(content=HIDE_HUD)
    await pg.wait_for_timeout(2500)
    return c, pg


async def sharp_clip(pg, name, seconds, script=None):
    r = Recorder(pg, size=(2560, 1446), quality=92)
    await r.start()
    if script:
        await asyncio.gather(script(), pg.wait_for_timeout(seconds * 1000))
    else:
        await pg.wait_for_timeout(seconds * 1000)
    await r.stop(out(name + '.mp4'))


async def hero(b):
    """the landing page's background loop: Times Square mid Dance Jam, then the landmarks, all at 2560 x 1446"""
    c, pg = await sharp_page(b, init=JAM_CLOCK)
    await pg.wait_for_timeout(13000)  # the show starts and the city's locals pour onto the floor
    await walk(pg, 500, 470)
    await pg.wait_for_timeout(3500)
    await pg.keyboard.press('d')
    await pg.wait_for_timeout(1500)
    await sharp_clip(pg, 'hero-times-square', 5)
    await c.close()
    c, pg = await sharp_page(b)
    for room, a, z in HERO:
        try:
            await goto(pg, room, settle=5500)
            await walk(pg, *a)
            await pg.wait_for_timeout(1800)

            async def stroll(z=z):
                await walk(pg, *z)

            await sharp_clip(pg, 'hero-' + room, 3.8, stroll)
        except Exception as e:
            print('  hero', room, 'failed:', e, flush=True)
    await c.close()


async def flashmob(b):
    """a flash mob on the lawn in Central Park: start dancing and the locals drop what they're doing and join in
    (2560 x 1446, so the edit can frame in close on the dancers)"""
    c, pg = await sharp_page(b)
    await goto(pg, 'central-park', settle=5000)
    await walk(pg, 500, 490)
    await pg.wait_for_timeout(2600)
    await pg.keyboard.press('d')
    await pg.wait_for_timeout(600)
    await sharp_clip(pg, 'flashmob', 20)
    await c.close()


SCENES = {'hero': hero, 'flashmob': flashmob, 'crowd': crowd, 'creator': creator, 'map': map_scene, 'places': places, 'jam': jam, 'jobs': jobs,
          'party': party, 'stamps': stamps, 'extras': extras}


async def main():
    which = sys.argv[1:] or list(SCENES)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-gpu'])
        for name in which:
            print('scene', name, flush=True)
            try:
                await SCENES[name](b)
            except Exception as e:
                print('  FAILED', name, e, flush=True)
        await b.close()


asyncio.run(main())
