import './downtown.css'
import { sfx } from '../audio'
import { el, stage } from '../engine/stage'
import { hold, toast, closeOverlay, openOverlay, closeButton } from '../engine/ui'
import { world, onRoom, chatterOk, spawnResident } from '../engine/world'
import { Actor } from '../engine/actor'
import { RESIDENTS, SLOT_MS, locationOf } from '../social/residents'
import { hash } from '../social/rng'
import type { Look } from '../avatar/look'
import type { Game } from '../types'
import type { Pt } from '../geometry'
import { picCard } from './infocard'

/**
 * Lower Manhattan: Wall Street (The Bull, the pizza-price ticker, a broker who only speaks in stock jargon),
 * the One World Trade plaza (the elevator to the top, the 9/11 Memorial) and Sky Deck 102 up top.
 * Room hooks register on import (game.ts imports this before the first room is built).
 */

const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]

// ---------- a quad-fitted overlay (an LED board painted at an angle in the room art) ----------
type M = number[]
const adj = (m: M): M => [
  m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
  m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
  m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3],
]
const mul = (a: M, b: M): M => {
  const c: M = []
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) c[3 * i + j] = a[3 * i] * b[j] + a[3 * i + 1] * b[3 + j] + a[3 * i + 2] * b[6 + j]
  return c
}
const mulv = (m: M, v: M): M => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]
const basis = (p: Pt[]): M => {
  const m = [p[0][0], p[1][0], p[2][0], p[0][1], p[1][1], p[2][1], 1, 1, 1]
  const v = mulv(adj(m), [p[3][0], p[3][1], 1])
  return mul(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]])
}
/** A CSS matrix3d that maps a w × h box (origin top-left) onto the quad [top-left, top-right, bottom-left, bottom-right]. */
export function quadMatrix(w: number, h: number, q: [Pt, Pt, Pt, Pt]): string {
  const t0 = mul(basis(q), adj(basis([[0, 0], [w, 0], [0, h], [w, h]])))
  const t = t0.map((x) => x / t0[8])
  return `matrix3d(${[t[0], t[3], 0, t[6], t[1], t[4], 0, t[7], 0, 0, 1, 0, t[2], t[5], 0, t[8]].map((v) => +v.toFixed(8)).join(',')})`
}

// ---------- Wall Street: the Pizza Index ----------
interface Tick { sym: string; name: string; price: number; move: number; unit?: string }
/** fake markets, real New York truths */
function market(): Tick[] {
  const wob = (n: number, spread: number) => Math.round((n + (Math.random() - 0.5) * spread) * 100) / 100
  const t = (sym: string, name: string, base: number, spread: number, unit = '$'): Tick => {
    const price = wob(base, spread)
    return { sym, name, price, move: Math.round((price - base) * 100) / 100 || 0.01, unit }
  }
  return [
    t('SLICE', 'Dollar slice', 1.5, 0.3),
    t('MTA', 'Subway fare', 2.9, 0.12),
    t('BAGEL', 'Bagel, plain', 1.75, 0.3),
    t('HALAL', 'Chicken over rice', 9, 1.2),
    t('COFFEE', 'Deli coffee', 2.25, 0.4),
    t('RENT', 'Studio, monthly', 3450, 260),
    { sym: 'PIGEON', name: 'Pigeons per bench', price: 4, move: 1, unit: '' },
    { sym: 'BDGCAT', name: 'Bodega cats', price: 1, move: 0.01, unit: '' },
  ]
}
const money = (t: Tick) => (t.unit === '$' ? `$${t.price >= 100 ? Math.round(t.price).toLocaleString('en-US') : t.price.toFixed(2)}` : String(t.price))
const arrow = (m: number) => (m >= 0 ? '▲' : '▼')

/** The live LED ticker across the board on the right of Wall Street. */
function mountTicker(scene: HTMLElement) {
  const W = 620
  const H = 110
  const board = el('div', 'ws-ticker')
  board.style.width = `${W}px`
  board.style.height = `${H}px`
  // the board's face in the room art (logical coords): it runs off the right edge of the picture
  board.style.transform = quadMatrix(W, H, [[738, 154], [1000, 52], [738, 202], [1000, 155]])
  const row = (cls: string, items: string) => `<div class="ws-row ${cls}"><div class="ws-run">${items}${items}</div></div>`
  const render = () => {
    const ticks = market()
    const items = ticks.map((t) => `<span class="${t.move >= 0 ? 'up' : 'down'}"><b>${t.sym}</b> ${money(t)} ${arrow(t.move)}${Math.abs(t.move) >= 1 ? Math.round(Math.abs(t.move)) : Math.abs(t.move).toFixed(2)}</span>`).join('')
    board.innerHTML = row('top', items) + row('bottom', '<span class="note">PIZZA INDEX</span><span class="note dim">SLICE TRACKS THE SUBWAY FARE SINCE THE 1960s</span><span class="note">MARKET OPEN</span><span class="note dim">PIGEONS: BULLISH</span>')
  }
  render()
  scene.append(board)
  const timer = window.setInterval(render, 20000)
  return () => clearInterval(timer)
}

/** Clicking the board: the Pizza Index, plus a no-stakes "call the market" guess. */
export function pizzaIndex() {
  const ticks = market()
  const table = el('div', 'ws-index')
  table.innerHTML = ticks.map((t) => `<div class="${t.move >= 0 ? 'up' : 'down'}"><b>${t.sym}</b><span>${t.name}</span><em>${money(t)} ${arrow(t.move)}</em></div>`).join('')
  const call = (dir: 1 | -1) => {
    const real: 1 | -1 = Math.random() < 0.5 ? 1 : -1
    const slice = ticks[0]
    const move = Math.round((0.01 + Math.random() * 0.24) * 100) / 100
    slice.price = Math.round((slice.price + real * move) * 100) / 100
    sfx.tick()
    const out = table.querySelector('div')!
    out.className = real > 0 ? 'up' : 'down'
    out.querySelector('em')!.textContent = `${money(slice)} ${arrow(real)}`
    setTimeout(() => {
      if (dir === real) {
        sfx.ding()
        toast(pick(['Called it. Please don’t quit your day job.', 'Nailed it. The pigeons are taking notes.', 'Right again. Somebody get this New Yorker a corner office.']), '📈')
      } else {
        sfx.squawk()
        toast(pick(['Wrong call. The slice did what the slice wanted.', 'Missed it. Even the pros get it wrong. Mostly the pros.', 'Nope. The market is like the subway: it moves when it wants to.']), '📉')
      }
    }, 450)
  }
  picCard({
    title: 'The Pizza Index',
    kicker: 'Wall Street · Live-ish',
    pic: { room: 'wall-street', rect: [700, 40, 300, 190] },
    text: 'Since the 1960s the price of a New York slice has tracked the subway fare almost exactly. Economists call it the <b>Pizza Principle</b>. Down here it’s on the big board, between the rent and the pigeons.',
    joke: 'RENT is up again. RENT is always up again.',
    extra: table,
    actions: [
      { label: 'SLICE Goes Up', note: 'call it', stay: true, act: () => call(1) },
      { label: 'SLICE Goes Down', note: 'call it', stay: true, act: () => call(-1) },
    ],
  })
}

// ---------- Wall Street: BullMarketBrad, who only speaks in stock jargon ----------
const JARGON = [
  'Let’s circle back after the closing bell.', 'I’m long on pretzels and short on patience.', 'This hot dog? Strong buy.',
  'Synergy. Leverage. Lunch.', 'My portfolio is 90% bagels.', 'Bullish on pigeons. Bearish on Mondays.',
  'Can we take this offline? We’re literally outside.', 'Rent’s up 12% quarter over quarter. Sell!', 'Diversify your snacks.',
  'Buy low, sell high, fold your slice in between.', 'That’s a big ask. Let’s table it.', 'The market’s volatile. So is the 4 train.',
  'I’m not lost. I’m pivoting.', 'SLICE is testing a historic support level.', 'Let’s touch base at the hot dog cart.',
  'Per my last email: hi.', 'Moving the needle. Mostly the coffee needle.', 'I rub the bull every morning. Fiduciary duty.',
]
const BRAD: Look = { skin: 2, hair: 'short', hairColor: 1, items: { body: 'suit', legs: 'black-jeans', feet: 'loafers', hand: 'coffee' } }
const BRAD_SPOTS: Pt[] = [[700, 420], [830, 420], [470, 330], [560, 470], [360, 430], [760, 470]]

function spawnBrad() {
  const nav = world.nav
  if (!nav) return () => {}
  const a = new Actor({ ...BRAD, items: { ...BRAD.items } }, 'BullMarketBrad', nav.nearest(pick(BRAD_SPOTS)))
  // a local the room runs by hand: the city's routine doesn't move him, and every word out of him is jargon
  a.mob = true
  a.setTag('BullMarketBrad')
  const plain = a.say.bind(a)
  a.say = (_text: string, ms?: number) => plain(pick(JARGON), ms)
  world.npcs.push(a)
  stage.scene.append(a.wrap)
  let alive = true
  const step = () => {
    if (!alive || !a.wrap.isConnected) return
    if (a.seat) a.standUp()
    if (Math.random() < 0.6) a.path = nav.path(a.pos, nav.nearest(pick(BRAD_SPOTS)))
    else if (chatterOk(7000)) a.say('')
    else if (Math.random() < 0.3) a.emote(pick(['cheer', 'wave'] as const), 2)
    timer = window.setTimeout(step, 4500 + Math.random() * 5000)
  }
  let timer = window.setTimeout(() => {
    if (chatterOk(3000)) a.say('')
    step()
  }, 2500)
  return () => {
    alive = false
    clearTimeout(timer)
  }
}

/**
 * Nobody in the city's routine lives downtown yet (social/residents.ts), so a few locals pass through: people whose
 * day already takes them to the neighbors (Battery Park, the Brooklyn Bridge, Chinatown). The same few for everyone
 * in each 4-minute slot. They wander, sit, and only say this place's own lines (at the World Trade Center: no bits).
 */
function passersBy(room: string, n: number) {
  const nav = world.nav
  if (!nav) return () => {}
  if (world.npcs.some((a) => a.remote)) n -= 1
  const slot = Math.floor(Date.now() / SLOT_MS)
  const near = ['battery-park', 'brooklyn-bridge', 'chinatown', 'soho', 'liberty-island']
  const pool = RESIDENTS.filter((r) => locationOf(r) !== null && [r.home, ...r.haunts].some((h) => near.includes(h)) && !world.npcs.some((a) => a.resident?.id === r.id))
    .sort((a, b) => hash(`${a.id}:${room}:${slot}`) - hash(`${b.id}:${room}:${slot}`))
    .slice(0, Math.max(0, n))
  const lines = world.room.chatter ?? []
  const timers: number[] = []
  let alive = true
  pool.forEach((r, i) => {
    const a = spawnResident(r, { enter: true })
    // run by this room, not the city's routine (which would walk them straight back out)
    a.mob = true
    const step = () => {
      if (!alive || !a.wrap.isConnected) return
      const free = world.seats.filter((s) => ![world.player, ...world.npcs].some((o) => o.seat?.id === s.id))
      const roll = Math.random()
      if (a.seat && roll < 0.55) {
        /* stay seated a while */
      } else if (roll < 0.5) {
        if (a.seat) a.standUp()
        a.path = nav.path(a.pos, nav.randomPoint())
      } else if (roll < 0.68 && free.length && !a.seat) {
        const s = pick(free)
        a.path = nav.path(a.pos, s.stand)
        a.onArrive = () => {
          if (!world.npcs.some((o) => o !== a && o.seat?.id === s.id) && world.player.seat?.id !== s.id) a.sitOn(s)
        }
      } else if (lines.length && chatterOk(9000)) a.say(pick(lines))
      timers[i] = window.setTimeout(step, 5000 + Math.random() * 6000)
    }
    timers[i] = window.setTimeout(step, 3000 + i * 1500)
  })
  return () => {
    alive = false
    timers.forEach(clearTimeout)
  }
}

onRoom('wall-street', ({ scene }) => {
  const offTicker = mountTicker(scene)
  const offBrad = spawnBrad()
  const offLocals = passersBy('wall-street', 2)
  return () => {
    offTicker()
    offBrad()
    offLocals()
  }
})

/** Rub The Bull for luck: a little shine and a random kind of luck. */
export function rubBull(g: Game) {
  g.emote('wave', 2)
  sfx.coin()
  const bull = [...stage.scene.querySelectorAll<HTMLImageElement>('.cutout')].find((i) => i.src.includes('/wall-street/bull.png'))
  if (bull) {
    bull.classList.remove('ws-shine')
    void bull.offsetWidth
    bull.classList.add('ws-shine')
    setTimeout(() => bull.classList.remove('ws-shine'), 1400)
  }
  const luck = pick([
    { pose: 'cheer' as const, line: 'Feeling lucky! My next slice will be perfectly folded. 🍀' },
    { pose: 'dance' as const, line: 'The bull approves. Bullish vibes only. 🐂' },
    { pose: 'jump' as const, line: 'Luck +1. Rent +0. Can’t win them all.' },
    { pose: 'cheer' as const, line: 'I can feel it: the express train will be on time today.' },
    { pose: 'wave' as const, line: 'Lucky! A seat on the subway is in my future. Probably the 2 a.m. train.' },
  ])
  setTimeout(() => {
    g.emote(luck.pose, 3)
    g.say(luck.line)
    g.confetti(18)
    g.stamp('bull-luck')
  }, 700)
}

// ---------- One World Trade: the elevator to the top ----------
interface Era { year: number; text: string }
const ERAS: Era[] = [
  { year: 1500, text: 'Mannahatta: forests, streams and Lenape trails. No rent yet.' },
  { year: 1626, text: 'New Amsterdam: a Dutch trading post at the tip of the island.' },
  { year: 1653, text: 'A wooden wall goes up on the north edge of town. Guess what they named the street.' },
  { year: 1883, text: 'The Brooklyn Bridge opens across the East River.' },
  { year: 1931, text: 'The Empire State Building opens. Tallest in the world for 40 years.' },
  { year: 1973, text: 'The Twin Towers open here, 110 stories each.' },
  { year: 2001, text: 'September 11, 2001. The towers are lost. We remember.' },
  { year: 2014, text: 'One World Trade Center opens: 1,776 feet.' },
]

const SKYLINE = `<svg class="er-skyline" viewBox="0 0 600 260" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
  <g class="er-era on" data-y="1500"><path d="M0 230 Q60 200 120 222 T240 214 T360 226 T480 210 T600 222 V260 H0Z" fill="#3f8f4f"/><circle cx="80" cy="212" r="16" fill="#2f7a40"/><circle cx="170" cy="216" r="13" fill="#2f7a40"/><circle cx="470" cy="206" r="15" fill="#2f7a40"/></g>
  <g class="er-era" data-y="1626"><rect x="62" y="212" width="18" height="16" fill="#c98f45" stroke="#1d2140" stroke-width="2"/><path d="M60 212 L71 202 L82 212Z" fill="#a8121f" stroke="#1d2140" stroke-width="2"/><rect x="88" y="208" width="16" height="20" fill="#e3c08a" stroke="#1d2140" stroke-width="2"/><path d="M40 228 V196 M40 196 l-10 -10 M40 196 l10 -10 M40 196 l-10 10 M40 196 l10 10" stroke="#1d2140" stroke-width="3"/></g>
  <g class="er-era" data-y="1653"><path d="M116 228 V214 M126 228 V212 M136 228 V214 M146 228 V212 M156 228 V214 M166 228 V212" stroke="#7a4b2a" stroke-width="6" stroke-linecap="round"/></g>
  <g class="er-era" data-y="1883"><path d="M470 228 V160 M540 228 V160" stroke="#a87a4a" stroke-width="12"/><path d="M430 200 Q470 150 470 160 Q505 205 540 160 Q560 190 600 196" fill="none" stroke="#1d2140" stroke-width="2.5"/><rect x="420" y="200" width="180" height="6" fill="#7a5a3a"/></g>
  <g class="er-era" data-y="1931"><path d="M300 228 V120 H312 V96 H318 V70 H322 V40 H324 V70 H328 V96 H334 V120 H346 V228Z" fill="#c9ccd6" stroke="#1d2140" stroke-width="3"/><rect x="356" y="160" width="30" height="68" fill="#9aa6c4" stroke="#1d2140" stroke-width="3"/><rect x="262" y="176" width="28" height="52" fill="#b7c2dd" stroke="#1d2140" stroke-width="3"/></g>
  <g class="er-era er-twins" data-y="1973" data-until="2001"><rect x="186" y="74" width="26" height="154" fill="#d6dbe8" stroke="#1d2140" stroke-width="3"/><rect x="220" y="80" width="26" height="148" fill="#c3c9da" stroke="#1d2140" stroke-width="3"/></g>
  <g class="er-era er-beams" data-y="2001" data-until="2014"><rect x="190" y="0" width="18" height="228" fill="#bfe6ff" opacity=".55"/><rect x="224" y="0" width="18" height="228" fill="#bfe6ff" opacity=".55"/></g>
  <g class="er-era" data-y="2014"><path d="M196 228 L204 70 L216 56 L228 70 L236 228Z" fill="#7fb2ff" stroke="#1d2140" stroke-width="3"/><path d="M216 56 V18" stroke="#1d2140" stroke-width="3"/><path d="M204 70 L236 228 M228 70 L196 228" stroke="#cfe8ff" stroke-width="2"/></g>
  <rect x="0" y="228" width="600" height="32" fill="#2a7bd5"/><path d="M0 238 Q20 234 40 238 T80 238 T120 238 T160 238 T200 238 T240 238 T280 238 T320 238 T360 238 T400 238 T440 238 T480 238 T520 238 T560 238 T600 238" fill="none" stroke="#9fd2ef" stroke-width="3"/>
</svg>`

const mix = (a: string, b: string, k: number) => {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
  const [x, y] = [p(a), p(b)]
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',')})`
}

/** Up to Sky Deck 102: the skyline grows outside the elevator window, five hundred years in a few seconds. */
export function elevatorUp(g: Game) {
  const release = hold()
  sfx.ding()
  const car = el('div', 'elevator-ride', `<div class="er-window"><div class="er-sky"></div>${SKYLINE}</div>
    <div class="er-panel"><small>FLOOR</small><b class="er-floor">1</b><span class="er-year">1500</span></div>
    <div class="er-caption"></div><button class="btn small ghost er-skip">Skip Ride</button>`)
  stage.root.append(car)
  const floor = car.querySelector<HTMLElement>('.er-floor')!
  const yearEl = car.querySelector<HTMLElement>('.er-year')!
  const caption = car.querySelector<HTMLElement>('.er-caption')!
  const sky = car.querySelector<HTMLElement>('.er-sky')!
  const eras = [...car.querySelectorAll<SVGGElement>('.er-era')]
  const STEP = 650
  const timers: number[] = []
  let done = false
  const finish = () => {
    if (done) return
    done = true
    timers.forEach(clearTimeout)
    clearInterval(counter)
    car.classList.add('out')
    sfx.ding()
    g.goto('sky-deck', 'one-world-trade')
    setTimeout(() => {
      car.remove()
      release()
    }, 650)
  }
  car.querySelector<HTMLButtonElement>('.er-skip')!.onclick = (e) => {
    e.stopPropagation()
    sfx.click()
    finish()
  }
  const t0 = performance.now()
  const total = STEP * ERAS.length + 600
  const counter = window.setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / total)
    floor.textContent = String(Math.max(1, Math.round(k * 102)))
  }, 50)
  ERAS.forEach((era, i) =>
    timers.push(
      window.setTimeout(() => {
        yearEl.textContent = String(era.year)
        caption.innerHTML = `<b>${era.year}</b> ${era.text}`
        caption.classList.remove('show')
        void caption.offsetWidth
        caption.classList.add('show')
        const k = i / (ERAS.length - 1)
        sky.style.background = `linear-gradient(180deg, ${mix('#7cc4ff', '#f08a4b', k)}, ${mix('#e3f4ff', '#ffd27a', k)})`
        for (const e of eras) {
          const from = +(e.dataset.y ?? 0)
          const until = +(e.dataset.until ?? 99999)
          e.classList.toggle('on', era.year >= from && era.year < until)
        }
        sfx.tick()
      }, 300 + i * STEP),
    ),
  )
  timers.push(window.setTimeout(() => {
    caption.innerHTML = '<b>Floor 102.</b> Welcome to Sky Deck 102. Mind the view.'
  }, 300 + ERAS.length * STEP))
  timers.push(window.setTimeout(finish, 300 + ERAS.length * STEP + 1300))
}

/** Back down to the plaza (shorter: what goes up must come down, ears first). */
export function elevatorDown(g: Game) {
  const release = hold()
  sfx.ding()
  const car = el('div', 'elevator-ride down', `<div class="er-doors"><i></i><i></i></div>
    <div class="er-panel"><small>FLOOR</small><b class="er-floor">102</b></div>
    <div class="er-caption show">Going down. Your ears will pop in 3, 2, 1…</div>`)
  stage.root.append(car)
  const floor = car.querySelector<HTMLElement>('.er-floor')!
  const t0 = performance.now()
  const counter = window.setInterval(() => {
    const k = Math.min(1, (performance.now() - t0) / 2200)
    floor.textContent = String(Math.max(1, Math.round(102 - k * 101)))
  }, 50)
  setTimeout(() => {
    clearInterval(counter)
    car.classList.add('out')
    sfx.ding()
    g.goto('one-world-trade', 'sky-deck')
    setTimeout(() => {
      car.remove()
      release()
      g.say(pick(['*pop* There go my ears.', 'Back on the ground. The ground feels short now.', 'That was faster than my commute.']))
    }, 650)
  }, 2600)
}

// ---------- the Brooklyn Bridge's way back down to Wall Street ----------
/** a blue arrow sign like the ones painted in the room art, pointing back down the promenade toward Wall Street */
const WS_SIGN = `<svg viewBox="0 0 52 72" aria-hidden="true">
  <rect x="22" y="30" width="8" height="40" rx="3" fill="#2f6b4f" stroke="#1d2140" stroke-width="3"/>
  <rect x="3" y="3" width="46" height="36" rx="7" fill="#2a7bd5" stroke="#1d2140" stroke-width="4"/>
  <path d="M8 9 H44" stroke="#78c2ff" stroke-width="3" stroke-linecap="round"/>
  <path d="M34 13 L18 29 M18 29 V19 M18 29 H28" fill="none" stroke="#1d2140" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M34 13 L18 29 M18 29 V19 M18 29 H28" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg><span>Wall St</span>`

onRoom('brooklyn-bridge', ({ scene }) => {
  const sign = el('div', 'ws-sign', WS_SIGN)
  scene.append(sign)
})

// ---------- the 9/11 Memorial: quiet, no jokes ----------
const roses: { x: number; y: number }[] = []
/** where the bronze name panels run along the front of the pool (logical coords; they end at the tree's railing) */
const rimY = (x: number) => 297 - x * 0.117

function drawRoses(scene: HTMLElement) {
  for (const r of roses) {
    const img = el('div', 'wtc-rose', ROSE_SVG)
    img.style.cssText = `left:${r.x}px;top:${r.y}px`
    scene.append(img)
  }
}
const ROSE_SVG = `<svg viewBox="0 0 24 34" aria-hidden="true"><path d="M12 14 C11 20 13 26 12 33" fill="none" stroke="#2f7a40" stroke-width="2.4" stroke-linecap="round"/><path d="M12 24 C8 21 5 22 4 24 C7 26 10 26 12 24Z" fill="#4fae5f" stroke="#1d2140" stroke-width="1.4"/><path d="M6 8 C6 2 18 2 18 8 C18 14 14 16 12 16 C10 16 6 14 6 8Z" fill="#ffffff" stroke="#1d2140" stroke-width="1.8"/><path d="M9 8 C9 5 15 5 15 8 C15 11 12 11 12 9" fill="none" stroke="#c9cfe0" stroke-width="1.4" stroke-linecap="round"/></svg>`

onRoom('one-world-trade', ({ scene }) => {
  drawRoses(scene)
  return passersBy('one-world-trade', 2)
})
onRoom('sky-deck', () => passersBy('sky-deck', 2))

/** A white rose on the parapet: the memorial places one on each person's name on their birthday. */
export function placeRose(_g: Game) {
  const p = world.player.pos
  // just beside you on the parapet (right where you stand, you'd hide it)
  const x = Math.max(24, Math.min(286, p[0] - 30))
  const r = { x: x - 8, y: rimY(x) - 22 }
  roses.push(r)
  if (roses.length > 12) roses.shift()
  const img = el('div', 'wtc-rose new', ROSE_SVG)
  img.style.cssText = `left:${r.x}px;top:${r.y}px`
  stage.scene.append(img)
  toast('A white rose, for the names.', '🕊️')
}

const EXHIBIT = [
  { img: 'towers', title: 'The Twin Towers', kicker: '1973 to 2001', text: 'For nearly 30 years the Twin Towers of the World Trade Center stood here, 110 stories each. On September 11, 2001, terrorist attacks destroyed them. 2,977 people were killed that day in New York, at the Pentagon and in Pennsylvania, including more than 400 first responders.' },
  { img: 'today', title: 'The Memorial', kicker: 'Opened 2011', text: 'Two reflecting pools sit in the towers’ footprints, each nearly an acre, with the largest man-made waterfalls in North America. The names of the 2,983 people killed in the attacks of 2001 and 1993 are inscribed in bronze around them.' },
  { img: 'survivor', title: 'The Survivor Tree', kicker: 'Replanted 2010', text: 'A Callery pear found in the rubble in October 2001, burned, with one living branch. It was nursed back to health in the Bronx and replanted here. It blooms white every spring, and its seedlings go to communities around the world that have lived through hard times.' },
  { img: 'tribute', title: 'Tribute in Light', kicker: 'Every September 11', text: 'Every year on the evening of September 11, two beams of light shine about four miles into the sky from Lower Manhattan, one for each tower.' },
]

/** The memorial exhibit: four quiet pages, Back and Next, always a way out. */
export function memorialExhibit(start = 0) {
  let i = start
  const box = el('div', 'panel ic-card quiet wtc-exhibit')
  const render = () => {
    const page = EXHIBIT[i]
    box.innerHTML = `<figure class="ic-frame"><div class="ic-pic is-src cover"><img src="/art/memorial/${page.img}.jpg" alt="" draggable="false"></div><figcaption>${i + 1} of ${EXHIBIT.length}</figcaption></figure>
      <div class="ic-body"><div class="ic-kicker">${page.kicker}</div><h2>${page.title}</h2><p class="ic-text">${page.text}</p><div class="ic-actions"></div></div>`
    const bar = box.querySelector<HTMLElement>('.ic-actions')!
    const btn = (label: string, cls: string, fn: () => void, off = false) => {
      const b = el('button', 'btn small ' + cls, label) as HTMLButtonElement
      b.disabled = off
      b.onclick = () => {
        sfx.click()
        fn()
      }
      bar.append(b)
    }
    btn('Back', 'ghost', () => ((i = Math.max(0, i - 1)), render()), i === 0)
    if (i < EXHIBIT.length - 1) btn('Next', 'go', () => ((i += 1), render()))
    else btn('Close', 'go', () => closeOverlay())
    box.append(closeButton())
  }
  render()
  openOverlay(box)
  world.api.stamp('remember')
}

// ---------- Sky Deck 102 ----------
/** Walk onto the glass disc in the floor: it's a live picture of the street, not a hole. Your knees disagree. */
export function skyPortalJump(g: Game) {
  g.emote('jump', 2)
  sfx.whoosh()
  const portal = [...stage.scene.querySelectorAll<HTMLImageElement>('.cutout')].find((i) => i.src.includes('/sky-deck/portal.png'))
  if (portal) {
    portal.classList.remove('sd-wobble')
    void portal.offsetWidth
    portal.classList.add('sd-wobble')
    setTimeout(() => portal.classList.remove('sd-wobble'), 900)
  }
  setTimeout(() => g.say(pick(['I looked down. I regret looking down.', 'Those taxis look like Tic Tacs. Yellow ones.', 'The floor held. My dignity, less so.', 'Okay. Okay. I’m fine. I’m totally fine.'])), 500)
}

