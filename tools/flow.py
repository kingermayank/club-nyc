"""Capture every screen of the Club NYC flow (in order) into docs/flow/NN-name.png at 2x.
usage: flow.py [base_url]"""
import asyncio, os, json, sys, datetime
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'docs', 'flow')
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5173'
TODAY = datetime.date.today().strftime('%a %b %d %Y')
QUESTS_DONE = {q: 1 for q in ['walk', 'gift', 'friend', 'job', 'subway']}
LOOK = {"skin": 2, "hair": "curly", "hairColor": 1, "items": {"body": "denim-jacket", "legs": "black-jeans", "feet": "hightops", "head": "nyc-cap", "neck": "team-scarf-midtown", "hand": "coffee"}}
BASE_SAVE = {"created": True, "name": "Mayank", "team": "midtown", "memberSince": "2026-09-01", "coins": 640, "look": LOOK,
             "owned": ["tee-blue", "jeans", "sneakers", "denim-jacket", "black-jeans", "hightops", "nyc-cap", "team-scarf-midtown", "coffee", "iloveny-tee", "foam-crown", "shades", "globe-empire", "toy-taxi", "pizza-slice", "puffer", "camera"],
             "stamps": ["welcome", "local", "regular", "slice-of-life", "straphanger", "top-of-world", "flock", "newshound", "curtain-call", "party-animal", "flash-mob", "new-friend"],
             "friends": ["bagelqueen", "pizzaratfan", "sohosofia", "ferryfrankie", "coneykai"],
             "furniture": [{"id": "sofa", "x": 610, "y": 430}, {"id": "pizza-rug", "x": 470, "y": 505}, {"id": "jukebox", "x": 250, "y": 405}, {"id": "torch-lamp", "x": 805, "y": 420}, {"id": "cat-bed", "x": 360, "y": 525}, {"id": "plant", "x": 170, "y": 470}, {"id": "arcade", "x": 860, "y": 520}],
             "storage": ["taxi-bed", "bagel-bag", "water-tower"], "lastHome": 1, "lastDaily": TODAY,
             "guestbook": [{"from": "bagelqueen", "text": "Love the jukebox!", "at": 1791900000000}, {"from": "sohosofia", "text": "Cozy vibes only ✨", "at": 1791950000000}],
             "stats": {"party-intro": 1, "team-paid:2026-W41": 1, "candy:times-square": 1, "candy:soho": 1, "candy:central-park": 1},
             "quests": QUESTS_DONE}

CLEAN = "document.querySelectorAll('.toast,.notice,.title-card,.stamp-toast').forEach(n=>n.remove())"
n = 0

async def shot(pg, name, wait=900):
    global n
    await pg.wait_for_timeout(wait)
    n += 1
    path = os.path.join(OUT, f'{n:02d}-{name}.png')
    await pg.screenshot(path=path)
    print(path.split('/')[-1])

async def js(pg, code):
    try:
        return await pg.evaluate(code)
    except Exception as e:
        print('  js error:', str(e)[:200])

async def world_page(b, profile, save):
    pg = await b.new_page(viewport={'width': 1000, 'height': 565}, device_scale_factor=2)
    await pg.goto(f'{BASE}/play?profile={profile}', wait_until='networkidle')
    await js(pg, f"localStorage.setItem('club-nyc:v2:{profile}', JSON.stringify({json.dumps(save)}))")
    await pg.reload(wait_until='networkidle')
    await pg.wait_for_timeout(2600)
    await js(pg, CLEAN)
    return pg

async def goto(pg, room, wait=1900):
    await js(pg, f"(()=>{{{CLEAN}; document.querySelector('.overlay .x-btn')?.click(); window.clubNyc.api.goto('{room}')}})()")
    await pg.wait_for_timeout(wait)
    await js(pg, CLEAN)

async def main():
    os.makedirs(OUT, exist_ok=True)
    for f in os.listdir(OUT):
        if f.endswith('.png'):
            os.remove(os.path.join(OUT, f))
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # ---------- 1. onboarding ----------
        pg = await b.new_page(viewport={'width': 1000, 'height': 565}, device_scale_factor=2)
        await pg.goto(f'{BASE}/play?profile=flow-new', wait_until='networkidle')
        await pg.wait_for_timeout(2600)
        await shot(pg, 'onboarding-welcome', 300)
        await js(pg, "document.querySelector('.creator .btn.go').click()")
        await shot(pg, 'onboarding-look', 700)
        await js(pg, "document.querySelector('.creator .btn.go').click()")
        await js(pg, "(()=>{const o=document.querySelectorAll('.creator .le-opt.item'); o[13]&&o[13].click()})()")
        await shot(pg, 'onboarding-style', 900)
        await js(pg, "document.querySelector('.creator .btn.go').click()")
        await js(pg, "(()=>{const i=document.querySelector('.creator input'); i.value='Mayank'})()")
        await shot(pg, 'onboarding-name', 700)
        await js(pg, "document.querySelector('.creator .btn.go').click()")
        await js(pg, "document.querySelectorAll('.creator .team-card')[1].click()")
        await shot(pg, 'onboarding-team', 900)
        await js(pg, "document.querySelector('.creator .btn.go').click()")
        await shot(pg, 'onboarding-metrocard', 1300)
        await js(pg, "[...document.querySelectorAll('.creator .btn.go')].pop().click()")
        await pg.wait_for_timeout(2600)
        await js(pg, "document.querySelectorAll('.stamp-toast,.toast').forEach(n=>n.remove())")
        await shot(pg, 'arrival-times-square', 400)
        await pg.close()

        # ---------- 2. world tour ----------
        pg = await world_page(b, 'flow', BASE_SAVE)
        # hover glow
        await js(pg, """(()=>{const w=window.clubNyc.world; const h=w.hits.find(h=>h.id==='broadway'); const r=document.querySelector('.stage').getBoundingClientRect(); const s=r.width/1000; document.querySelector('.stage').dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+((h.rect[0]+h.rect[2])/2)*s, clientY:r.top+((h.rect[1]+h.rect[3])/2+30)*s, bubbles:true}))})()""")
        await shot(pg, 'hover-traced-outline', 900)
        await js(pg, "window.clubNyc.api.openMap()")
        await pg.wait_for_timeout(900)
        await js(pg, """(()=>{const art=document.querySelector('.postcard-art'); const b=art.getBoundingClientRect(); art.dispatchEvent(new PointerEvent('pointermove',{clientX:b.left+b.width*0.505, clientY:b.top+b.height*0.30, bubbles:true}))})()""")
        await shot(pg, 'map-postcard', 700)
        await js(pg, "document.querySelector('.postcard .x-btn').click(); window.clubNyc.api.openSubway()")
        await shot(pg, 'subway-map', 1200)
        await js(pg, """(()=>{const s=[...document.querySelectorAll('.subway-map .stop')].find(g=>g.textContent.includes('SoHo')); s.dispatchEvent(new MouseEvent('click',{bubbles:true}))})()""")
        await shot(pg, 'subway-ride', 2300)
        await pg.wait_for_timeout(3200)

        ROOMS = ['times-square', 'broadway', 'iloveny', 'rockefeller', 'fifth-ave', 'toy-palace', 'maison-malle', 'central-park', 'the-met',
                 'empire-deck', 'grand-central', 'subway', 'high-line', 'chelsea-market', 'soho', 'thread', 'sneaker-vault', 'coffee',
                 'chinatown', 'pizza', 'brooklyn-bridge', 'battery-park', 'liberty-island', 'parade', 'apartment']
        for r in ROOMS:
            await goto(pg, r)
            await shot(pg, f'place-{r}', 300)
            if r == 'broadway':
                await js(pg, "window.clubNyc.api.watchShow()")
                await pg.wait_for_timeout(700)
                await js(pg, "document.querySelector('.overlay .choices .btn').click()")
                await pg.wait_for_timeout(1700 + 2600)
                await shot(pg, 'broadway-show', 200)
                await pg.wait_for_timeout(5000)

        # ---------- 3. shops & avatar ----------
        await goto(pg, 'iloveny')
        await js(pg, "window.clubNyc.api.catalog('iloveny','globes')")
        await shot(pg, 'shop-iloveny-snow-globes', 1000)
        await js(pg, "document.querySelector('.catalog .x-btn').click(); window.clubNyc.api.catalog('iloveny','toys')")
        await shot(pg, 'shop-iloveny-toy-taxis', 1000)
        await js(pg, "document.querySelector('.catalog .x-btn').click(); window.clubNyc.api.catalog('thread','jackets')")
        await shot(pg, 'shop-thread-jackets', 1000)
        await js(pg, "document.querySelector('.catalog .x-btn').click(); window.clubNyc.api.catalog('sneakers','kicks')")
        await shot(pg, 'shop-sneaker-vault', 1000)
        await js(pg, "document.querySelector('.catalog .x-btn').click(); import('/src/features/playerCard.ts').then(m=>m.openPlayerCard())")
        await shot(pg, 'player-card-wardrobe', 1200)
        await js(pg, "[...document.querySelectorAll('.pc-view')].find((b) => b.textContent === 'Look').click()")
        await shot(pg, 'player-card-edit-look', 800)
        await js(pg, "document.querySelector('.player-card .x-btn').click()")

        # ---------- 4. social ----------
        await goto(pg, 'soho', 2600)
        await js(pg, "(()=>{const a=window.clubNyc.world.npcs[0]; if(a) import('/src/features/playerCard.ts').then(m=>m.npcCard(a))})()")
        await shot(pg, 'social-person-card', 1200)
        await js(pg, "document.querySelector('.overlay .x-btn')?.click(); import('/src/social/community.ts').then(m=>m.openCommunity('friends'))")
        await shot(pg, 'social-friends', 1200)
        await js(pg, "document.querySelectorAll('.cm-tab')[1].click()")
        await shot(pg, 'social-leaderboards', 900)
        await js(pg, "document.querySelectorAll('.cm-tab')[2].click()")
        await shot(pg, 'social-neighborhood-wars', 900)
        await js(pg, "document.querySelector('.community .x-btn').click()")
        await goto(pg, 'times-square', 2600)
        await js(pg, "window.clubNyc.world.player.emote('dance',0)")
        await pg.wait_for_timeout(9000)
        await js(pg, CLEAN)
        await shot(pg, 'social-flash-mob-takeover', 200)
        await js(pg, "window.clubNyc.world.player.path=[[500,470]]")
        await pg.wait_for_timeout(2500)
        await js(pg, """import('/src/engine/ui.ts').then(m=>m.notify('<b>BagelQueen</b> is hanging out at <b>Rockefeller Center</b>','📍',[{label:'Go',act:()=>{}}]))""")
        await shot(pg, 'social-city-pulse', 900)

        # ---------- 5. apartment ----------
        await goto(pg, 'apartment', 2400)
        await shot(pg, 'apartment-home', 300)
        await js(pg, "document.querySelector('.apt-btn.primary').click()")
        await shot(pg, 'apartment-decorate', 900)
        await js(pg, "[...document.querySelectorAll('.tray-actions .btn')].find(b=>b.textContent.includes('Catalog')).click()")
        await shot(pg, 'apartment-furniture-catalog', 1100)
        await js(pg, "document.querySelector('.catalog .x-btn').click(); [...document.querySelectorAll('.tray-actions .btn')].find(b=>b.textContent.includes('Done')).click()")
        await pg.wait_for_timeout(600)
        await js(pg, "[...document.querySelectorAll('.apt-btn')].find(b=>b.textContent.includes('Guestbook')).click()")
        await shot(pg, 'apartment-guestbook', 900)
        await js(pg, "document.querySelector('.overlay .x-btn')?.click(); import('/src/features/apartment.ts').then(m=>m.visitApartment('bagelqueen'))")
        await pg.wait_for_timeout(2600)
        await js(pg, CLEAN)
        await shot(pg, 'apartment-visit-friend', 300)

        # ---------- 6. newspaper, stamps, party ----------
        await goto(pg, 'times-square', 2000)
        await js(pg, "window.clubNyc.api.newspaper()")
        await shot(pg, 'newspaper-front-page', 1200)
        for i in range(3):
            await js(pg, "[...document.querySelectorAll('.np-btn')].pop().click()")
            await shot(pg, f'newspaper-page-{i + 2}', 800)
        await js(pg, "document.querySelector('.newspaper .x-btn').click(); import('/src/features/stampbook.ts').then(m=>m.openStampBook())")
        await shot(pg, 'stamp-book', 1100)
        await js(pg, "document.querySelector('.stamp-book .x-btn').click(); import('/src/features/party.ts').then(m=>m.openPartyPanel())")
        await shot(pg, 'party-halloween', 1000)
        await js(pg, "document.querySelector('.overlay .x-btn')?.click()")
        await goto(pg, 'parade', 2400)
        await js(pg, "import('/src/features/party.ts').then(m=>m.openCostumeStand())")
        await shot(pg, 'party-free-costumes', 1000)
        await pg.close()

        # ---------- 7. jobs (mini-games) ----------
        for g in ['slice-factory', 'halal-rush', 'ferry-captain', 'bagel-counters', 'showtime']:
            pg = await b.new_page(viewport={'width': 1000, 'height': 565}, device_scale_factor=2)
            await pg.goto(f'{BASE}/play?game={g}', wait_until='networkidle')
            await shot(pg, f'job-{g}-intro', 2500)
            started = await js(pg, """(()=>{const b=[...document.querySelectorAll('button')].find(b=>/start|play|go|let/i.test(b.textContent||'')); if(b){b.click(); return b.textContent.trim()} return null})()""")
            await shot(pg, f'job-{g}-playing', 6500)
            await pg.close()
        await b.close()

asyncio.run(main())
