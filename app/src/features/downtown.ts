import './downtown.css'
import { sfx } from '../audio'
import { save, persist } from '../state'
import { el, stage } from '../engine/stage'
import { toast, openOverlay, closeButton } from '../engine/ui'
import { world, onRoom, chatterOk, spawnResident } from '../engine/world'
import { Actor } from '../engine/actor'
import { RESIDENTS, SLOT_MS, locationOf } from '../social/residents'
import { hash } from '../social/rng'
import type { Look } from '../avatar/look'
import type { Game } from '../types'
import type { Pt } from '../geometry'
import { todaysIpo, loadMarket, cityClass } from '../data/ipos'

/**
 * Lower Manhattan: Wall Street (The Bull, the Big Board of tech stocks, a broker who only speaks in stock jargon),
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

// ---------- Wall Street: the Big Board ----------
interface Tick { sym: string; name: string; price: number; move: number; logo?: string; icon?: string; color?: string }
/**
 * The same companies the Exchange trades inside (data/ipos.ts cityClass: today's IPO and the past week's class), at
 * the same prices, ticking a little, plus two board regulars that are jokes, not companies: GPUs and the rent.
 * Prices are in Club NYC coins, never dollars.
 */
function market(): Tick[] {
  const jiggle = (v: number) => Math.round(v * (1 + (Math.random() - 0.5) * 0.02) * 100) / 100
  const city = cityClass(7).map(({ ipo, price, pct }): Tick => {
    const now = jiggle(price)
    const open = ipo.price
    return { sym: ipo.sym, name: ipo.name, price: now, move: Math.round((now - open) * 100) / 100 || (pct >= 0 ? 0.01 : -0.01), logo: ipo.logo, icon: ipo.icon, color: ipo.color }
  })
  const rentBase = 3450
  const rent = jiggle(rentBase + 120)
  return [
    ...city,
    { sym: 'GPU', name: 'GPUs in stock', price: 0, move: -0.01, icon: 'joystick', color: '#5b6475' },
    { sym: 'RENT', name: 'Studio, monthly', price: rent, move: Math.abs(rent - rentBase), icon: 'key', color: '#e5483b' },
  ]
}
const money = (t: Tick) => (t.price >= 1000 ? Math.round(t.price).toLocaleString('en-US') : t.price.toFixed(2))
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
    board.innerHTML = row('top', items) + row('bottom', `<span class="note">TODAY’S IPO: ${todaysIpo().sym}</span>` + '<span class="note">THE BIG BOARD</span><span class="note dim">PRICES IN CLUB NYC COINS</span><span class="note">IPO SEASON</span><span class="note dim">GPUS: SOLD OUT</span><span class="note">PIGEONS: BULLISH ON BREAD</span>')
  }
  render()
  scene.append(board)
  const timer = window.setInterval(render, 20000)
  return () => clearInterval(timer)
}

/** the news crawl across the top of the card (a few at a time, so it reads fresh) */
const HEADLINES = [
  'Every company on this board is an AI company now. Even the rent.',
  'Pigeon AI trained its model on crumbs. Analysts say the crumbs are undervalued.',
  'OpenBagel goes open source. Everything seasoning, no schmear.',
  'Pizza Rat Ventures carried a whole slice down the subway stairs. Strong buy.',
  'GPUs in stock: zero. Same as yesterday. Strong buy.',
  'Brownstone Bank adds a stoop. Deposits up.',
  'Yellowcab Autonomous drives itself. Still honks.',
  'Analysts upgrade pigeons to Strong Buy. Pigeons upgrade analysts to Bread Source.',
  'The rent went up again. It is not on any exchange. It does not need one.',
]
/** a tile's line chart of its last prices */
const spark = (h: number[]) => {
  const lo = Math.min(...h), hi = Math.max(...h), span = hi - lo || 1
  const pts = h.map((v, i) => `${((i / (h.length - 1)) * 100).toFixed(1)},${(21 - ((v - lo) / span) * 18).toFixed(1)}`).join(' ')
  return `<svg class="wsb-spark" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts}"/></svg>`
}
const pct = (t: Tick, from: number) => (from ? ((t.price - from) / from) * 100 : 0)
const BEST = 'board:best'
const CALL_MS = 6000

/**
 * Clicking the board: the LED wall up close, ten tiles ticking live, and Call It: pick a stock, call it up or down,
 * and six seconds later the board settles it. A streak, a best and a stamp; no coins ride on it (it's a board, not a
 * casino). GPUs are sold out, so there's nothing to call, and calling the rent doesn't count: it only goes up.
 */
export function bigBoard() {
  const ticks = market()
  const open = ticks.map((t) => t.price - t.move)
  // a short made-up history per tile, so every sparkline has a shape from the start
  const hist = ticks.map((t) => Array.from({ length: 13 }, (_, i) => (t.sym === 'GPU' ? 0 : t.price - t.move * (1 - i / 12) + (Math.random() - 0.5) * Math.abs(t.move))).concat(t.price))
  const clock = () => new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })
  let best = save.stats[BEST] ?? 0
  const tile = (t: Tick, i: number) => {
    // the company's own app-icon logo (the tech class), or one of the city's icons on its colour
    const logo = t.logo
      ? `<i class="wsb-logo tile"><img src="${t.logo}" alt="" draggable="false"></i>`
      : `<i class="wsb-logo" style="--c:${t.color ?? '#7b5cff'}"><img src="/art/icons/e/${t.icon ?? 'coin'}.png" alt="" draggable="false"></i>`
    return `<button class="wsb-tile" type="button" role="option" aria-selected="false" data-i="${i}">
        <span class="wsb-top">${logo}<b>${t.sym}</b></span>
        <span class="wsb-name">${t.name}</span>
        <span class="wsb-price"></span>
        <span class="wsb-tag"></span>
      </button>`
  }
  const news = pick([HEADLINES.slice(0, 5), HEADLINES.slice(4)]).join('<i></i>')
  const p = el('div', 'panel wsb')
  p.innerHTML = `<header class="wsb-head"><h2>The Big Board</h2><span class="wsb-sub">Prices in Club NYC coins</span><span class="wsb-live"><i></i>LIVE <em>${clock()}</em></span></header>
    <div class="wsb-grid" role="listbox" aria-label="Pick a stock to call">${ticks.map(tile).join('')}</div>
    <div class="wsb-call" aria-live="polite">
      <p class="wsb-msg"><b>Call It</b><span>Pick a stock, then call it: up or down.</span></p>
      <div class="wsb-btns"><button class="wsb-up" type="button" disabled>▲ Up</button><button class="wsb-down" type="button" disabled>▼ Down</button></div>
      <div class="wsb-streak"><small>Streak</small><b>0</b><small class="wsb-best">Best ${best}</small></div>
    </div>
    <div class="wsb-crawl" aria-hidden="true"><div class="wsb-crawl-run"><span>BREAKING</span>${news}<span>BREAKING</span>${news}</div></div>`
  const tiles = [...p.querySelectorAll<HTMLButtonElement>('.wsb-tile')]
  const msg = p.querySelector<HTMLElement>('.wsb-msg span')!
  const up = p.querySelector<HTMLButtonElement>('.wsb-up')!
  const down = p.querySelector<HTMLButtonElement>('.wsb-down')!
  const streakEl = p.querySelector<HTMLElement>('.wsb-streak b')!
  const bestEl = p.querySelector<HTMLElement>('.wsb-best')!
  const clockEl = p.querySelector<HTMLElement>('.wsb-live em')!

  /** one tile's price, change on the day and sparkline (fixed sizes, so ticking never moves the layout) */
  const paint = (i: number, by = ticks[i].move) => {
    const t = ticks[i]
    const day = pct(t, open[i])
    // the tile's color is its change on the day (like the real boards); each tick blinks its own direction
    const dir = t.sym === 'GPU' ? 'flat' : day >= 0 ? 'up' : 'down'
    tiles[i].classList.remove('up', 'down', 'flat', 'tick-up', 'tick-down')
    tiles[i].classList.add(dir)
    if (t.sym !== 'GPU' && by !== t.move) {
      void tiles[i].offsetWidth
      tiles[i].classList.add(by >= 0 ? 'tick-up' : 'tick-down')
    }
    tiles[i].querySelector('.wsb-price')!.innerHTML = `<em>${money(t)}</em><small>${t.sym === 'GPU' ? 'SOLD OUT' : `${day >= 0 ? '▲' : '▼'} ${Math.abs(day).toFixed(1)}%`}</small>`
    const old = tiles[i].querySelector('.wsb-spark')
    if (old) old.outerHTML = spark(hist[i])
    else tiles[i].insertAdjacentHTML('beforeend', spark(hist[i]))
  }
  const move = (i: number, by: number) => {
    const t = ticks[i]
    if (t.sym === 'GPU') return
    if (t.sym === 'RENT') by = Math.abs(by)
    t.price = Math.max(0.01, Math.round((t.price + by) * 100) / 100)
    hist[i] = [...hist[i].slice(1), t.price]
    paint(i, by)
  }
  ticks.forEach((_, i) => paint(i))

  // ---------- Call It ----------
  let sel = -1
  let streak = 0
  let call: { i: number; dir: 1 | -1; from: number; end: number } | null = null
  const select = (i: number) => {
    if (call) return
    if (ticks[i].sym === 'GPU') {
      sfx.click()
      msg.textContent = 'GPUs: sold out. Nothing to call. Same as yesterday.'
      return
    }
    sfx.tick()
    sel = i
    tiles.forEach((b, k) => {
      b.classList.toggle('sel', k === i)
      b.setAttribute('aria-selected', String(k === i))
    })
    up.disabled = down.disabled = false
    msg.textContent = `${ticks[i].sym} at ${money(ticks[i])}. Up or down in the next six seconds?`
  }
  const settle = () => {
    if (!call || !p.isConnected) return
    const { i, dir, from } = call
    const t = ticks[i]
    const diff = Math.round((t.price - from) * 100) / 100
    tiles[i].classList.remove('called')
    let out: 'hit' | 'miss' | 'flat' = diff === 0 ? 'flat' : Math.sign(diff) === dir ? 'hit' : 'miss'
    if (t.sym === 'RENT') {
      msg.textContent = dir === 1 ? 'Rent went up. Everyone called that. Doesn’t count.' : 'Rent went up. Rent always goes up.'
      out = dir === 1 ? 'flat' : 'miss'
      if (out === 'miss') streak = 0
    } else if (out === 'flat') msg.textContent = `${t.sym} closed flat at ${money(t)}. Nobody wins. Very Wall Street.`
    else if (out === 'hit') {
      streak++
      msg.textContent = `Called it. ${t.sym} ${dir === 1 ? 'up' : 'down'} to ${money(t)}.${streak > 1 ? ` That’s ${streak} in a row.` : ''}`
    } else {
      streak = 0
      msg.textContent = `Missed. ${t.sym} went ${dir === 1 ? 'down' : 'up'} to ${money(t)}. The market does what it wants.`
    }
    if (out === 'hit') {
      sfx.ding()
      if (streak > best) {
        best = streak
        save.stats[BEST] = best
        persist()
        bestEl.textContent = `Best ${best}`
      }
      if (streak >= 5) world.api.stamp('called-it')
    } else if (out === 'miss') sfx.pop()
    streakEl.textContent = String(streak)
    tiles[i].classList.add(out)
    setTimeout(() => tiles[i].classList.remove('hit', 'miss', 'flat'), 900)
    call = null
    up.disabled = down.disabled = sel < 0
  }
  const makeCall = (dir: 1 | -1) => {
    if (sel < 0 || call) return
    sfx.click()
    const t = ticks[sel]
    call = { i: sel, dir, from: t.price, end: performance.now() + CALL_MS }
    tiles[sel].classList.add('called')
    up.disabled = down.disabled = true
    msg.textContent = `Called: ${t.sym} ${dir === 1 ? '▲ up' : '▼ down'} from ${money(t)}…`
  }
  tiles.forEach((b, i) => (b.onclick = () => select(i)))
  up.onclick = () => makeCall(1)
  down.onclick = () => makeCall(-1)

  // live: a couple of tiles move every second; the called one moves every second until it's settled
  const live = window.setInterval(() => {
    if (!p.isConnected) {
      clearInterval(live)
      window.removeEventListener('keydown', keys, true)
      return
    }
    clockEl.textContent = clock()
    for (let k = 0; k < 2; k++) {
      const i = Math.floor(Math.random() * ticks.length)
      if (call?.i === i) continue
      move(i, Math.round((Math.random() - 0.45) * ticks[i].price * 0.012 * 100) / 100 || 0.01)
    }
    if (call) {
      const t = ticks[call.i]
      move(call.i, Math.round((Math.random() - 0.5) * t.price * 0.02 * 100) / 100 || 0.01)
      const left = Math.ceil((call.end - performance.now()) / 1000)
      if (left <= 0) settle()
      else {
        sfx.tick()
        msg.textContent = `Called: ${t.sym} ${call.dir === 1 ? '▲ up' : '▼ down'} from ${money({ ...t, price: call.from })}, ${left}s left`
      }
    }
  }, 1000)
  const keys = (e: KeyboardEvent) => {
    if (!p.isConnected) return
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      makeCall(e.key === 'ArrowUp' ? 1 : -1)
    } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !call) {
      e.preventDefault()
      e.stopPropagation()
      const n = ticks.length
      let i = sel < 0 ? 0 : (sel + (e.key === 'ArrowRight' ? 1 : n - 1)) % n
      if (ticks[i].sym === 'GPU') i = (i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n
      select(i)
      tiles[i].focus({ preventScroll: true })
    }
  }
  window.addEventListener('keydown', keys, true)
  p.append(closeButton())
  openOverlay(p)
}

// ---------- Wall Street: BullMarketBrad, who only speaks in stock jargon ----------
const JARGON = [
  'Let’s circle back after the closing bell.', 'I’m long on pretzels and short on patience.', 'This hot dog? Strong buy.',
  'Synergy. Leverage. Lunch.', 'My portfolio is 90% bagels.', 'Bullish on pigeons. Bearish on Mondays.',
  'Can we take this offline? We’re literally outside.', 'Rent’s up 12% quarter over quarter. Sell!', 'Diversify your snacks.',
  'Buy low, sell high, fold your slice in between.', 'That’s a big ask. Let’s table it.', 'The market’s volatile. So is the 4 train.',
  'I’m not lost. I’m pivoting.', 'AI is testing a historic support level.', 'Is it an AI company? Then I’m in.', 'My seed round is my Venmo.', 'We’re pre-revenue. Post-vibes.', 'Let’s touch base at the hot dog cart.',
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
  // his card (features/playerCard.ts) says who he is instead of a locked "Not friends yet" door
  ;(a as Actor & { blurb?: string }).blurb = 'Only speaks stock jargon.'
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
export function passersBy(room: string, n: number) {
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
  // the real IPO calendar, so the board names today's listing (it re-renders every 20 s)
  void loadMarket()
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
/** Up to Sky Deck 102 in the SkyPod: the island grows up outside the cab's walls as you climb (features/skypod.ts). */
export function elevatorUp(g: Game) {
  void import('./skypod').then((m) => m.rideSkyPod(true, () => g.goto('sky-deck', 'one-world-trade')))
}

/** Back down to the plaza (shorter: what goes up must come down, ears first). */
export function elevatorDown(g: Game) {
  void import('./skypod')
    .then((m) => m.rideSkyPod(false, () => g.goto('one-world-trade', 'sky-deck')))
    .then(() => g.say(pick(['*pop* There go my ears.', 'Back on the ground. The ground feels short now.', 'That was faster than my commute.'])))
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
export function placeRose(_g: Game, quiet = false) {
  const p = world.player.pos
  // just beside you on the parapet (right where you stand, you'd hide it)
  const x = Math.max(24, Math.min(286, p[0] - 30))
  const r = { x: x - 8, y: rimY(x) - 22 }
  roses.push(r)
  if (roses.length > 12) roses.shift()
  const img = el('div', 'wtc-rose new', ROSE_SVG)
  img.style.cssText = `left:${r.x}px;top:${r.y}px`
  stage.scene.append(img)
  if (!quiet) toast('A white rose, for the names.', '🕊️')
}

/** The memorial's story, as an exhibit panel over the room (the same one the parapet scene opens: features/memorial.ts). */
export function memorialExhibit(start = 0) {
  void import('./memorial').then((m) => m.memorialStory(stage.root, start))
}
