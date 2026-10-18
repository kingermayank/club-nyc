import type { MiniGame, MiniGameContext } from '../types'
import type { AvatarView } from '../../avatar/render'
import {
  W,
  H,
  HORIZON,
  INK,
  FONT,
  loadArt,
  drawSky,
  drawWater,
  drawLiberty,
  libertyHalfWidth,
  libertyIcon,
  drawPier,
  drawSlice,
  type Art,
  type SpriteName,
} from './art'
import './style.css'

/**
 * Ferry Captain — steer the orange ferry from Battery Park to Liberty Island.
 *
 * Side-scroller with depth: the ferry holds the left third and moves up (farther) / down (nearer) across the
 * water. Everything on the water is placed by its waterline y; higher = farther = smaller and slower.
 */

const C = 'ferry-captain-' // CSS class prefix

// ---------- tuning ----------
const FERRY_X = 250 // the ferry holds the left third of the screen
const Y_FAR = 322 // farthest lane the ferry can reach (its waterline)
const Y_NEAR = 528 // nearest lane
const TRIP = 26000 // Battery Park → Liberty Island, in near-lane px (~100 s)
const V0 = 210 // cruise speed at the start (near-lane px/s) …
const V1 = 340 // … ramping up to this by the end
const SKY_PAN = 480 // how far the skyline drifts over the whole trip
const LIBERTY_X = 742 // where Lady Liberty stands when you arrive
const LIVES = 3
const ARRIVAL_BONUS = 20
const Y_DOCK = 336 // the pier's waterline
const Y_MOOR = 378 // the ferry ties up just in front of it
const DOCK_X = 112 // the pier's left end once docked
const R_LAST_OBSTACLE = 3000 // no new obstacles inside this remaining distance
const R_LAST_COINS = 2300
const R_AUTOPILOT = 1300
const BRAKE = 85 // px/s² while easing into the pier
const FALL = 1.05 // seconds a dropped slice takes to hit the water

/** Perspective: 1 at the near lane, 0.6 at the far lane, → 0 at the horizon. Scales sizes and water speed. */
const depth = (y: number) => Math.pow(Math.max(1, y - HORIZON) / (Y_NEAR - HORIZON), 0.355)

type Kind = 'tug' | 'sail' | 'kayak' | 'jetski' | 'barge' | 'log' | 'buoyG' | 'buoyR'
interface KindDef {
  sprite: SpriteName
  /** width at the near lane */
  w: number
  /** waterline, as a fraction of the sprite's height */
  ay: number
  /** how much water it takes up front-to-back (collision depth) */
  beam: number
  /** fraction of the width that actually bumps */
  hit: number
}
const KINDS: Record<Kind, KindDef> = {
  tug: { sprite: 'tugboat', w: 136, ay: 0.9, beam: 22, hit: 0.6 },
  sail: { sprite: 'sailboat', w: 112, ay: 0.915, beam: 18, hit: 0.46 },
  kayak: { sprite: 'kayak', w: 100, ay: 0.78, beam: 13, hit: 0.74 },
  jetski: { sprite: 'jetski', w: 90, ay: 0.84, beam: 15, hit: 0.62 },
  barge: { sprite: 'barge', w: 236, ay: 0.865, beam: 28, hit: 0.84 },
  log: { sprite: 'log', w: 92, ay: 0.74, beam: 12, hit: 0.78 },
  buoyG: { sprite: 'buoy-green', w: 50, ay: 0.9, beam: 14, hit: 0.52 },
  buoyR: { sprite: 'buoy-red', w: 50, ay: 0.9, beam: 14, hit: 0.52 },
}
const FERRY = { w: 180, ay: 0.9, beam: 22, hit: 0.68 }

interface Boat {
  kind: Kind
  x: number
  y: number
  baseY: number
  /** own speed through the water, near-lane px/s (+ = rightwards, same way as the ferry) */
  own: number
  face: 1 | -1
  /** drawn x-scale; eases toward `face` so tacks and turns flip smoothly */
  flip: number
  t: number
  phase: number
  amp: number
  freq: number
  vy: number
  tackLo: number
  tackHi: number
  hit: boolean
  passed: boolean
  kick: number
  kickY: number
  tilt: number
  deco: boolean
  size: number
  wake: number
}
interface Pickup {
  kind: 'coin' | 'ring'
  x: number
  y: number
  phase: number
}
interface Gull {
  x: number
  y: number
  vx: number
  size: number
  t: number
  phase: number
  bomber: boolean
  dropped: boolean
}
interface Slice {
  x0: number
  y0: number
  /** landing spot on the water — it drifts with the current while the slice falls */
  lx: number
  ty: number
  t: number
  rot: number
  spin: number
}
type PKind = 'foam' | 'ring' | 'drop' | 'spark' | 'confetti'
interface Particle {
  k: PKind
  x: number
  y: number
  vx: number
  vy: number
  t: number
  life: number
  r: number
  grow: number
  color: string
  rot: number
  vr: number
  /** drops vanish when they fall back below this y */
  floor: number
  /** drifts with the water */
  water: boolean
}
interface Pop {
  text: string
  x: number
  y: number
  t: number
  life: number
  color: string
  size: number
}

const rand = (a: number, b: number) => a + Math.random() * (b - a)
const randi = (a: number, b: number) => Math.floor(rand(a, b + 1))
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]
const sign = (): 1 | -1 => (Math.random() < 0.5 ? -1 : 1)
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const approach = (v: number, to: number, step: number) => (v < to ? Math.min(to, v + step) : Math.max(to, v - step))
const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

function weighted<T>(table: [T, number][]): T {
  let sum = 0
  for (const [, w] of table) sum += w
  let r = Math.random() * sum
  for (const [v, w] of table) if ((r -= w) <= 0 && w > 0) return v
  return table[0][0]
}

function el<T extends keyof HTMLElementTagNameMap>(tag: T, cls: string, html = ''): HTMLElementTagNameMap[T] {
  const e = document.createElement(tag)
  e.className = cls
  if (html) e.innerHTML = html
  return e
}

const ICON = (n: SpriteName) => `<img src="/art/games/harbor/${n}.png" alt="" draggable="false">`

function boat(kind: Kind, x: number, y: number, own = 0, face: 1 | -1 = own < 0 ? -1 : 1): Boat {
  return {
    kind, x, y, baseY: y, own, face, flip: face, t: 0, phase: rand(0, Math.PI * 2), amp: 0, freq: 0, vy: 0,
    tackLo: y, tackHi: y, hit: false, passed: false, kick: 0, kickY: 0, tilt: 0, deco: false, size: 1, wake: 0,
  }
}

const game: MiniGame = {
  id: 'ferry-captain',
  title: 'Ferry Captain',
  start(ctx) {
    const root = el('div', C + 'root', `<div class="${C}loading">Loading the harbor…</div>`)
    ctx.root.append(root)
    let alive = true
    const cleanups: (() => void)[] = []
    ctx.onExit(() => {
      alive = false
      for (const f of cleanups.splice(0)) f()
    })
    Promise.all([loadArt(), document.fonts.load(`24px ${FONT}`).catch(() => null)])
      .then(([art]) => {
        if (alive) play(ctx, root, art, cleanups)
      })
      .catch((err) => {
        if (!alive) return
        console.error('[ferry-captain]', err)
        root.innerHTML = `<div class="${C}veil"><div class="${C}card"><div class="${C}title ${C}title-sm">Fog on the harbor!</div>
          <p class="${C}lead">The ferry couldn't leave the dock. Try again in a moment.</p>
          <button class="btn ${C}go">Back to shore</button></div></div>`
        root.querySelector('button')!.onclick = () => ctx.end({ coins: 0, lines: ['The harbor was fogged in'] })
      })
  },
}
export default game

function play(ctx: MiniGameContext, root: HTMLElement, art: Art, cleanups: (() => void)[]) {
  const { sfx } = ctx
  root.innerHTML = ''
  const canvas = el('canvas', C + 'canvas')
  const g = canvas.getContext('2d')!
  const people = el('div', C + 'people')
  const hud = el('div', C + 'hud')
  const ui = el('div', C + 'ui')
  root.append(canvas, people, hud, ui)

  // ---------- HUD ----------
  hud.innerHTML = `
    <div class="${C}lives ${C}pill">${ICON('lifering').repeat(LIVES)}</div>
    <div class="${C}trip ${C}pill">
      <span class="${C}place">Battery<br>Park</span>
      <div class="${C}track"><i class="${C}fill"></i><img class="${C}mini" src="/art/games/harbor/ferry.png" alt="" draggable="false"></div>
      <span class="${C}goal"></span>
      <span class="${C}place">Liberty<br>Island</span>
    </div>
    <div class="${C}coins ${C}pill">${ICON('coin')}<b>0</b></div>`
  hud.querySelector(`.${C}goal`)!.append(libertyIcon(art, 84))
  const lifeEls = [...hud.querySelectorAll<HTMLImageElement>(`.${C}lives img`)]
  const fillEl = hud.querySelector<HTMLElement>(`.${C}fill`)!
  const miniEl = hud.querySelector<HTMLElement>(`.${C}mini`)!
  const coinPill = hud.querySelector<HTMLElement>(`.${C}coins`)!
  const coinEl = coinPill.querySelector('b')!
  const bounce = (e: Element) => {
    e.classList.remove(C + 'pop')
    void (e as HTMLElement).offsetWidth
    e.classList.add(C + 'pop')
  }

  // ---------- crisp canvas at whatever size the stage is shown ----------
  let px = 1
  const fit = () => {
    const r = root.getBoundingClientRect()
    const k = clamp(((r.width || W) / W) * (window.devicePixelRatio || 1), 1, 2.5)
    const w = Math.round(W * k), h = Math.round(H * k)
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w
      canvas.height = h
    }
    px = w / W
  }
  fit()

  // ---------- state ----------
  type Mode = 'intro' | 'play' | 'dock' | 'arrived' | 'turnback' | 'over'
  let mode: Mode = 'intro'
  let modeT = 0
  let clock = 0
  let playTime = 0
  let scroll = 0 // how far the water has slid (visual)
  let dist = 0 // trip progress, near-lane px
  let speed = 70 // current near-lane speed, px/s
  let slow = 1 // bump slow-down
  let ferryY = 430
  let ferryVy = 0
  let knockVy = 0
  let ferryDX = 0
  let ferryFlip = 1
  let lives = LIVES
  let coins = 0
  let bumps = 0
  let invuln = 0
  let sinceBump = 99
  let shake = 0
  let streak = 0
  let lastCoinAt = -9
  let coinSfxAt = -9
  let closeCallAt = -9
  let arrived = false
  let finished = false
  let milestone = 0
  let finalCoins = false
  let wakeAcc = 0
  let sprayAcc = 0
  let shownP = -1
  let banner: HTMLElement | null = null
  const boats: Boat[] = []
  const pickups: Pickup[] = []
  const gulls: Gull[] = []
  const slices: Slice[] = []
  let parts: Particle[] = []
  const pops: Pop[] = []
  const later: { at: number; fn: () => void }[] = []
  const avatars: AvatarView[] = []
  const crowd: { wrap: HTMLElement; av: AvatarView; off: number }[] = []
  let tObstacle = 1.4
  let tCoins = 0.7
  let tRing = rand(17, 22)
  let tBomber = rand(16, 20)
  let tGull = 0.2
  let tDeco = 0.1

  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches // no screen shake
  const after = (sec: number, fn: () => void) => later.push({ at: clock + sec, fn })
  const cruise = () => lerp(V0, V1, clamp(dist / TRIP, 0, 1))

  // ---------- input ----------
  const keys = new Set<string>()
  const keyDownAt = new Map<string, number>()
  const keyUpAt = new Map<string, number>() // quick taps still steer for a moment
  let pointerY: number | null = null
  let steer: 'keys' | 'pointer' = 'pointer'
  const keyOf = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'ArrowUp':
      case 'KeyW':
        return 'up'
      case 'ArrowDown':
      case 'KeyS':
        return 'down'
      case 'Space':
      case 'Enter':
        return 'go'
      case 'KeyH':
        return 'horn'
    }
    return ''
  }
  let hornAt = -9
  const onKeyDown = (e: KeyboardEvent) => {
    const k = keyOf(e)
    if (!k) return
    e.preventDefault()
    if (k === 'horn') {
      // a captain's gotta toot
      if ((mode === 'play' || mode === 'dock') && clock - hornAt > 0.9) {
        hornAt = clock
        sfx.toot()
        pop('TOOT!', FERRY_X + ferryDX, ferryY - 128 * depth(ferryY), '#ffffff', 24)
      }
      return
    }
    if (k === 'go') {
      if (e.repeat) return
      if (mode === 'intro') startPlay()
      else if (mode === 'over') finish()
      return
    }
    if (!keys.has(k)) keyDownAt.set(k, clock)
    keys.add(k)
    keyUpAt.delete(k)
    steer = 'keys'
  }
  const onKeyUp = (e: KeyboardEvent) => {
    const k = keyOf(e)
    if (k && keys.has(k)) keyUpAt.set(k, Math.max(clock, (keyDownAt.get(k) ?? clock) + 0.1))
  }
  const onBlur = () => {
    keys.clear()
    keyUpAt.clear()
  }
  const onPointer = (e: PointerEvent) => {
    const y = ctx.toLocal(e).y
    if (pointerY === null || e.type === 'pointerdown' || Math.abs(y - pointerY) > 2) steer = 'pointer'
    pointerY = y
  }
  addEventListener('keydown', onKeyDown)
  addEventListener('keyup', onKeyUp)
  addEventListener('blur', onBlur)
  addEventListener('resize', fit)
  root.addEventListener('pointermove', onPointer)
  root.addEventListener('pointerdown', onPointer)
  cleanups.push(() => {
    removeEventListener('keydown', onKeyDown)
    removeEventListener('keyup', onKeyUp)
    removeEventListener('blur', onBlur)
    removeEventListener('resize', fit)
    root.removeEventListener('pointermove', onPointer)
    root.removeEventListener('pointerdown', onPointer)
  })

  // ---------- intro card ----------
  const introAv = ctx.avatar(ctx.look, 0.74)
  introAv.setPose('wave')
  avatars.push(introAv)
  const intro = el(
    'div',
    C + 'veil',
    `<div class="${C}card">
      <div class="${C}title">Ferry Captain</div>
      <div class="${C}route">Battery Park <b>→</b> Liberty Island</div>
      <div class="${C}hero"><i class="${C}hero-sea"></i><div class="${C}feet"></div>
        <img class="${C}hero-boat" src="/art/games/harbor/ferry.png" alt="" draggable="false"></div>
      <ul class="${C}how">
        <li>Steer with <kbd>↑</kbd><kbd>↓</kbd> or <kbd>W</kbd><kbd>S</kbd>, or just move your mouse.</li>
        <li>Dodge boats, logs &amp; buoys. Scoop up coins and life rings!</li>
        <li>Three bumps and you're turned back to port.</li>
      </ul>
      <button class="btn ${C}go">Cast off!</button>
    </div>`,
  )
  intro.querySelector(`.${C}feet`)!.append(introAv.el)
  intro.querySelector('button')!.onclick = () => startPlay()
  ui.append(intro)

  function startPlay() {
    if (mode !== 'intro') return
    sfx.click()
    sfx.toot()
    mode = 'play'
    modeT = 0
    intro.classList.add(C + 'out')
    after(0.4, () => {
      intro.remove()
      avatars.splice(avatars.indexOf(introAv), 1)
    })
    hud.classList.add(C + 'on')
    showBanner('Cast off!')
  }

  function showBanner(text: string, extra = '', secs = 2.4) {
    banner?.remove()
    const b = el('div', `${C}banner ${extra}`, text)
    banner = b
    ui.append(b)
    after(secs, () => b.remove())
  }

  const pop = (text: string, x: number, y: number, color: string, size = 26) => pops.push({ text, x, y, t: 0, life: 1.1, color, size })

  // ---------- particles ----------
  const part = (k: PKind, x: number, y: number, o: Partial<Particle> = {}): Particle => {
    const q: Particle = { k, x, y, vx: 0, vy: 0, t: 0, life: 1, r: 3, grow: 0, color: '#fff', rot: 0, vr: 0, floor: 9999, water: false, ...o }
    parts.push(q)
    return q
  }
  const foam = (x: number, y: number, s: number, life = 1, spread = 12) =>
    part('foam', x, y, { vy: rand(-1, 1) * spread * s, life: rand(0.9, 1.4) * life, r: rand(2.5, 5) * s, grow: 13 * s, water: true })
  const drops = (x: number, y: number, s: number, n: number, dir = 0, power = 1) => {
    for (let i = 0; i < n; i++)
      part('drop', x + rand(-6, 6) * s, y, {
        vx: (dir ? dir * rand(30, 150) : rand(-170, 170)) * s * power,
        vy: -rand(90, 240) * s * power,
        life: 1.5,
        r: rand(1.5, 3.4) * s,
        color: Math.random() < 0.6 ? '#f2fbff' : '#9fdcff',
        floor: y + 5 * s,
      })
  }
  const ring = (x: number, y: number, s: number, life = 0.7) => part('ring', x, y, { life, r: 8 * s, grow: 60 * s, water: true })
  const splash = (x: number, y: number, s: number, n: number) => {
    drops(x, y - 4 * s, s, n, 0, 1.25)
    ring(x, y, s)
    ring(x, y, s * 0.6, 0.5)
    for (let i = 0; i < 6; i++) foam(x + rand(-14, 14) * s, y + rand(-3, 3) * s, s, 0.8, 20)
  }
  const sparkles = (x: number, y: number, s: number, n: number, color = '#fff7c2') => {
    for (let i = 0; i < n; i++)
      part('spark', x, y, { vx: rand(-110, 110) * s, vy: rand(-150, -20) * s, life: rand(0.35, 0.65), r: rand(5, 9) * s, color })
  }
  const confetti = () => {
    const cols = ['#ff5a5f', '#ffd166', '#06d6a0', '#4cc9f0', '#f78c6b', '#c77dff', '#ffffff']
    for (let i = 0; i < 150; i++)
      part('confetti', rand(0, W), rand(-260, -10), { vx: rand(-40, 40), vy: rand(40, 120), life: rand(4, 6), r: rand(4, 7), color: pick(cols), rot: rand(0, 6), vr: rand(-7, 7) })
    for (let i = 0; i < 60; i++)
      part('confetti', FERRY_X, ferryY - 70, { vx: rand(-280, 280), vy: rand(-560, -220), life: rand(3.5, 5), r: rand(4, 7), color: pick(cols), rot: rand(0, 6), vr: rand(-9, 9) })
  }

  // ---------- spawning ----------
  /** seconds until something at (x, y) moving `own` through the water reaches the ferry */
  const eta = (x: number, y: number, own: number) => (x - FERRY_X) / Math.max(30, (cruise() - own) * depth(y))
  /** depths where the ferry's centre would bump into `b` */
  function zone(b: Boat): [number, number] {
    const z = ((KINDS[b.kind].beam + FERRY.beam) / 2) * depth(b.y) + 6
    if (b.kind === 'jetski') return [b.baseY - b.amp - z, b.baseY + b.amp + z]
    if (b.kind === 'sail') return [Math.min(b.tackLo, b.y) - z, Math.max(b.tackHi, b.y) + z]
    return [b.y - z, b.y + z]
  }
  /** seconds it takes `b` to slide past a fixed point */
  const passTime = (b: Boat) =>
    ((KINDS[b.kind].w * KINDS[b.kind].hit + FERRY.w * FERRY.hit) * depth(b.y)) / 2 / Math.max(30, (cruise() - b.own) * depth(b.y))
  /** would the ferry still find a gap if these zones arrive at time t? */
  function fair(extra: [number, number][], t: number) {
    const zs = [...extra]
    for (const b of boats) {
      if (b.deco || b.hit) continue
      const te = eta(b.x, b.y, b.own)
      if (te > -0.5 && Math.abs(te - t) < 0.8) zs.push(zone(b))
    }
    zs.sort((a, b) => a[0] - b[0])
    let reach = Y_FAR
    let gap = 0
    for (const [lo, hi] of zs) {
      gap = Math.max(gap, lo - reach)
      reach = Math.max(reach, hi)
    }
    return Math.max(gap, Y_NEAR - reach) >= 60
  }
  /** is something solid at depth y around time t? (keeps coins out of barges) */
  const blockedBy = (b: Boat, y: number, t: number) => {
    const [lo, hi] = zone(b)
    return y > lo && y < hi && Math.abs(eta(b.x, b.y, b.own) - t) < passTime(b) + 0.2
  }
  const blocked = (y: number, t: number) => boats.some((b) => !b.deco && !b.hit && blockedBy(b, y, t))
  const enterX = (kind: Kind, y: number) => W + (KINDS[kind].w * depth(y)) / 2 + 14
  const laneY = () => (Math.random() < 0.3 ? clamp(ferryY + rand(-22, 22), Y_FAR, Y_NEAR) : rand(Y_FAR, Y_NEAR))

  function add(...bs: Boat[]) {
    boats.push(...bs)
    // don't leave coins hiding inside the newcomers
    for (let i = pickups.length - 1; i >= 0; i--) {
      const q = pickups[i]
      if (q.x > W - 20 && bs.some((b) => blockedBy(b, q.y, eta(q.x, q.y, 0)))) pickups.splice(i, 1)
    }
  }
  /** try a few lanes; keep the first that leaves the ferry a way through */
  function place(make: (y: number) => Boat[] | null, lane = laneY) {
    for (let i = 0; i < 10; i++) {
      const bs = make(lane())
      if (!bs) continue
      const t = Math.min(...bs.map((b) => eta(b.x, b.y, b.own)))
      if (fair(bs.map(zone), t)) {
        add(...bs)
        return bs
      }
    }
    return null
  }

  function spawnObstacle() {
    const p = dist / TRIP
    const what = weighted<string>([
      ['log', lerp(2.6, 0.8, p)],
      ['buoy', lerp(2.2, 1, p)],
      ['kayak', 1.6],
      ['tug', lerp(1.8, 2.8, p)],
      ['sail', p > 0.1 ? 2 : 0],
      ['jetski', p > 0.2 ? lerp(0.9, 3, p) : 0],
      ['convoy', p > 0.3 ? 1.4 : 0],
      ['gate', p > 0.06 ? 1.1 : 0],
      ['tour', p > 0.15 ? 0.8 : 0],
    ])
    switch (what) {
      case 'log':
        place((y) => [boat('log', enterX('log', y), y, 0, sign())])
        if (Math.random() < 0.3) place((y) => [boat('log', enterX('log', y) + rand(40, 140), y, 0, sign())])
        break
      case 'buoy':
        place((y) => [boat(Math.random() < 0.5 ? 'buoyR' : 'buoyG', enterX('buoyR', y), y, 0)])
        break
      case 'kayak':
        place((y) => [boat('kayak', enterX('kayak', y), y, rand(15, 40) * sign())])
        break
      case 'tug':
        place((y) => [boat('tug', enterX('tug', y), y, rand(30, 85) * sign())])
        break
      case 'sail':
        place((y) => {
          const b = boat('sail', enterX('sail', y), y, rand(8, 22) * sign())
          const amp = rand(50, 90)
          b.tackLo = clamp(y - amp, Y_FAR, Y_NEAR)
          b.tackHi = clamp(y + amp, Y_FAR, Y_NEAR)
          b.vy = rand(22, 34) * sign()
          b.face = b.vy < 0 ? 1 : -1
          b.flip = b.face
          return [b]
        })
        break
      case 'jetski': {
        const amp = rand(40, 68)
        place(
          (y) => {
            const own = -rand(85, 140)
            const b = boat('jetski', 0, y, own, -1)
            b.amp = amp
            b.freq = rand(2.1, 3)
            // start further out so the "incoming!" marker shows for a moment first
            b.x = enterX('jetski', y) + (cruise() - own) * depth(y) * 0.9
            return [b]
          },
          () => rand(Y_FAR + amp, Y_NEAR - amp),
        )
        break
      }
      case 'convoy':
        // a tug pushing a container barge, both heading the same way as us (slowly)
        place((y) => {
          const s = depth(y)
          const own = rand(18, 34)
          const x = W + (KINDS.barge.w / 2 + KINDS.tug.w - 22) * s + 14
          return [boat('barge', x, y, own, 1), boat('tug', x - (KINDS.barge.w / 2 + KINDS.tug.w / 2 - 22) * s, y, own, 1)]
        })
        break
      case 'gate': {
        // channel markers with coins between them — thread the needle
        const gap = rand(122, 150)
        const bs = place(
          (y) => {
            const a = boat('buoyR', 0, y, 0)
            const b = boat('buoyG', 0, y + gap, 0)
            const t = Math.max(eta(enterX('buoyR', y), y, 0), eta(enterX('buoyG', y + gap), y + gap, 0))
            a.x = FERRY_X + cruise() * depth(a.y) * t
            b.x = FERRY_X + cruise() * depth(b.y) * t
            return [a, b]
          },
          () => rand(Y_FAR, Y_NEAR - gap),
        )
        if (bs) {
          const mid = (bs[0].y + bs[1].y) / 2
          coinRow([mid, mid], 0.16, eta(bs[0].x, bs[0].y, 0) - 0.08)
        }
        break
      }
      case 'tour': {
        // a guided kayak tour paddling in formation
        const own = rand(14, 30) * sign()
        place(
          (y) => [0, 1, 2].map((i) => boat('kayak', enterX('kayak', y + i * 26) + i * 64, y + i * 26, own)),
          () => rand(Y_FAR, Y_NEAR - 52),
        )
        break
      }
    }
  }

  /** a row of coins; coin i reaches the ferry `gap` s after coin i-1. `at` = when the first one arrives (default: asap) */
  function coinRow(ys: number[], gap: number, at = 0) {
    const v = (y: number) => cruise() * depth(y)
    let t = at
    ys.forEach((y, i) => (t = Math.max(t, (W + 30 - FERRY_X) / v(y) - i * gap)))
    ys.forEach((y0, i) => {
      const y = clamp(y0, Y_FAR, Y_NEAR)
      const ti = t + i * gap
      if (!blocked(y, ti)) pickups.push({ kind: 'coin', x: FERRY_X + v(y) * ti, y, phase: i * 0.7 })
    })
  }

  function spawnCoins() {
    const n = randi(3, 5)
    const y0 = rand(Y_FAR + 10, Y_NEAR - 10)
    const shape = pick(['line', 'line', 'diag', 'arc', 'wave'])
    const y1 = clamp(y0 + rand(80, 150) * (y0 > (Y_FAR + Y_NEAR) / 2 ? -1 : 1), Y_FAR, Y_NEAR)
    const ys: number[] = []
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1)
      if (shape === 'diag') ys.push(lerp(y0, y1, u))
      else if (shape === 'arc') ys.push(y0 + (y0 > (Y_FAR + Y_NEAR) / 2 ? -1 : 1) * Math.sin(u * Math.PI) * 70)
      else if (shape === 'wave') ys.push(clamp(y0, Y_FAR + 45, Y_NEAR - 45) + Math.sin(u * Math.PI * 2) * 45)
      else ys.push(y0)
    }
    coinRow(ys, 0.15)
  }

  function spawnRing() {
    for (let i = 0; i < 8; i++) {
      const y = rand(Y_FAR + 10, Y_NEAR - 10)
      const x = W + 50
      if (!blocked(y, eta(x, y, 0))) {
        pickups.push({ kind: 'ring', x, y, phase: 0 })
        return
      }
    }
  }

  function spawnGull(bomber: boolean) {
    const dir = bomber || Math.random() < 0.65 ? -1 : 1
    gulls.push({
      x: dir < 0 ? W + 70 : -70,
      y: bomber ? rand(150, 196) : rand(34, 236),
      vx: dir * (bomber ? 165 : rand(70, 140)),
      size: bomber ? 64 : rand(30, 56),
      t: 0,
      phase: rand(0, 6.3),
      bomber,
      dropped: false,
    })
    if (bomber || Math.random() < 0.2) after(bomber ? 0.5 : rand(0.6, 2), () => sfx.squawk())
  }

  function spawnDeco() {
    if (boats.filter((b) => b.deco).length >= 3) return
    const y = rand(268, 298)
    const b = boat(pick(['sail', 'sail', 'tug', 'barge'] as Kind[]), 0, y, rand(-25, 25))
    b.deco = true
    b.size = 0.8
    b.x = W + (KINDS[b.kind].w * depth(y) * b.size) / 2 + 10
    boats.push(b)
  }

  function director(dt: number) {
    const p = dist / TRIP
    const r = TRIP - dist
    if ((tObstacle -= dt) <= 0 && r > R_LAST_OBSTACLE) {
      spawnObstacle()
      tObstacle = lerp(1.75, 0.98, p) * rand(0.8, 1.2)
    }
    if ((tCoins -= dt) <= 0 && r > R_LAST_COINS) {
      spawnCoins()
      tCoins = rand(4.6, 6.2)
    }
    if (!finalCoins && r <= R_LAST_COINS) {
      // a last trail of coins that leads the way into the pier
      finalCoins = true
      coinRow([Y_MOOR, Y_MOOR, Y_MOOR, Y_MOOR, Y_MOOR], 0.14)
    }
    if ((tRing -= dt) <= 0 && r > R_LAST_OBSTACLE) {
      spawnRing()
      tRing = lives < LIVES ? rand(15, 21) : rand(26, 34)
    }
    if ((tBomber -= dt) <= 0 && p > 0.16 && r > R_LAST_OBSTACLE + 800) {
      spawnGull(true)
      tBomber = lerp(15, 9, p) * rand(0.85, 1.2)
    }
  }

  // ---------- events ----------
  function bump(text: string, x: number, y: number, fromY: number) {
    if (invuln > 0 || mode !== 'play') return false
    lives--
    bumps++
    invuln = 1.8
    sinceBump = 0
    shake = calm ? 0 : 1
    slow = 0.4
    knockVy = (fromY < ferryY ? 1 : -1) * 230
    streak = 0
    splash(x, y, depth(y), 26)
    sfx.clapper()
    sfx.whoosh()
    sfx.piano(36)
    pop(text, FERRY_X, ferryY - 118 * depth(ferryY), '#ff7b6b', 34)
    const icon = lifeEls[lives]
    if (icon) {
      icon.classList.add(C + 'lost')
      bounce(icon)
    }
    if (lives <= 0) turnBack()
    return true
  }

  function hitBoat(b: Boat) {
    const away = b.y < ferryY ? -1 : 1
    if (!bump(pick(['Bonk!', 'Oof!', 'Bump!', 'Whoa!']), (b.x + FERRY_X) / 2, (b.y + ferryY) / 2, b.y)) return
    b.hit = true
    b.kick = 150 // shoved ahead of the ferry …
    b.kickY = away * 90 // … and out of its way
    b.tilt = away * 0.4
  }

  function collect(q: Pickup) {
    pickups.splice(pickups.indexOf(q), 1)
    const s = depth(q.y)
    const fs = depth(ferryY)
    if (q.kind === 'coin') {
      coins++
      streak = clock - lastCoinAt < 0.9 ? streak + 1 : 1
      lastCoinAt = clock
      if (clock - coinSfxAt > 0.05) {
        coinSfxAt = clock
        sfx.coin()
      }
      pop('+1', q.x, q.y - 44 * s, '#ffd166', 26)
      sparkles(q.x, q.y - 18 * s, s, 6)
      if (streak >= 5 && streak % 5 === 0) pop(`Combo ×${streak}!`, FERRY_X + 30, ferryY - 150 * fs, '#7ee081', 30)
      coinEl.textContent = String(coins)
      bounce(coinPill)
    } else {
      if (lives < LIVES) {
        const icon = lifeEls[lives]
        icon.classList.remove(C + 'lost')
        bounce(icon)
        lives++
        pop('+1 life ring!', q.x, q.y - 50 * s, '#ff9f5a', 28)
        sfx.stamp()
      } else {
        coins += 5
        coinEl.textContent = String(coins)
        bounce(coinPill)
        pop('+5 coins!', q.x, q.y - 50 * s, '#ffd166', 28)
        sfx.register()
      }
      sparkles(q.x, q.y - 20 * s, s, 12, '#ffe2c4')
    }
  }

  function arrive() {
    mode = 'arrived'
    modeT = 0
    arrived = true
    ferryVy = 0
    sfx.toot()
    after(0.75, () => sfx.toot())
    after(1.5, () => sfx.stamp())
    confetti()
    showBanner('Welcome to Liberty Island!', C + 'banner-big', 3.3)
    for (const c of crowd) c.av.setPose('cheer')
    after(3.4, showResult)
  }

  function turnBack() {
    mode = 'turnback'
    modeT = 0
    slices.length = 0
    sfx.honk()
    ;[67, 66, 65, 64].forEach((n, i) => after(0.8 + i * 0.42, () => sfx.piano(n)))
    showBanner('Turned back to port!', C + 'banner-sad', 3)
    after(3.1, showResult)
  }

  function showResult() {
    mode = 'over'
    modeT = 0
    const pct = Math.floor(clamp(dist / TRIP, 0, 1) * 100)
    const total = coins + (arrived ? ARRIVAL_BONUS : 0)
    const av = ctx.avatar(ctx.look, 0.86)
    av.setPose(arrived ? 'cheer' : 'idle')
    av.setMood(arrived ? 'grin' : 'o')
    avatars.push(av)
    const lead = arrived
      ? bumps === 0
        ? 'Not a scratch on her. Smooth sailing, Captain!'
        : 'You made it across the harbor!'
      : `The ferry made it ${pct}% of the way. Next time!`
    const card = el(
      'div',
      C + 'veil',
      `<div class="${C}card">
        <div class="${C}title ${C}title-sm">${arrived ? 'Welcome to Liberty Island!' : 'Turned back to port!'}</div>
        <p class="${C}lead">${lead}</p>
        <div class="${C}res">
          <div class="${C}res-cap"><div class="${C}feet"></div></div>
          <div class="${C}stats">
            <div class="${C}stat">${ICON('coin')}<span>Coins fished out</span><b>${coins}</b></div>
            <div class="${C}stat ${C}stat-goal">${arrived ? '' : ICON('ferry')}<span>${arrived ? 'Arrival bonus' : 'Distance'}</span><b>${arrived ? '+' + ARRIVAL_BONUS : pct + '%'}</b></div>
            <div class="${C}stat">${ICON('lifering')}<span>Bumps</span><b>${bumps}</b></div>
          </div>
        </div>
        <button class="btn ${C}go">Collect ${total} coin${total === 1 ? '' : 's'}</button>
      </div>`,
    )
    if (arrived) card.querySelector(`.${C}stat-goal`)!.prepend(libertyIcon(art, 60))
    card.querySelector(`.${C}feet`)!.append(av.el)
    card.querySelector('button')!.onclick = finish
    ui.append(card)
  }

  function finish() {
    if (finished) return
    finished = true
    sfx.click()
    const pct = Math.floor(clamp(dist / TRIP, 0, 1) * 100)
    const fished = `${coins} coin${coins === 1 ? '' : 's'} fished from the harbor`
    const lines = arrived
      ? [`Docked at Liberty Island! +${ARRIVAL_BONUS}`, fished, bumps === 0 ? `Not a scratch · ${fmtTime(playTime)}` : `${bumps} bump${bumps === 1 ? '' : 's'} · ${fmtTime(playTime)}`]
      : [`Turned back to port at ${pct}%`, fished]
    for (const f of cleanups.splice(0)) f()
    ctx.end({ coins: coins + (arrived ? ARRIVAL_BONUS : 0), score: coins, lines, flags: arrived ? ['arrived'] : [] })
  }

  // ---------- update ----------
  function update(dt: number) {
    clock += dt
    modeT += dt
    for (let i = later.length - 1; i >= 0; i--) if (clock >= later[i].at) later.splice(i, 1)[0].fn()
    for (const [k, t] of keyUpAt)
      if (clock >= t) {
        keys.delete(k)
        keyUpAt.delete(k)
      }

    // world speed & trip progress
    const r = TRIP - dist
    if (mode === 'intro') speed = approach(speed, 70, 120 * dt)
    else if (mode === 'play' || mode === 'dock') {
      slow = approach(slow, 1, 0.55 * dt)
      speed = Math.min(cruise() * slow, Math.sqrt(2 * BRAKE * Math.max(0, r)) + 16)
      dist = Math.min(TRIP, dist + speed * dt)
      playTime += dt
    } else speed = approach(speed, 0, 260 * dt)
    scroll += speed * dt
    if (mode === 'play' && TRIP - dist <= R_AUTOPILOT) {
      mode = 'dock'
      modeT = 0
      showBanner('Steady as she goes…')
    }
    if (mode === 'dock' && dist >= TRIP) arrive()

    // steering
    let want = 0
    if (mode === 'play') {
      const up = keys.has('up'), down = keys.has('down')
      if (up !== down) want = down ? 330 : -330
      else if (steer === 'pointer' && pointerY !== null) want = clamp((clamp(pointerY + 34, Y_FAR, Y_NEAR) - ferryY) * 7, -420, 420)
    } else if (mode === 'dock' || mode === 'arrived') want = clamp((Y_MOOR - ferryY) * 2.6, -220, 220)
    ferryVy += (want - ferryVy) * Math.min(1, dt * 12)
    knockVy *= Math.exp(-dt * 5)
    ferryY = clamp(ferryY + (ferryVy + knockVy) * dt, Y_FAR, Y_NEAR)
    if (mode === 'turnback') {
      ferryFlip = Math.cos(Math.PI * clamp(modeT / 0.8, 0, 1)) // turn around …
      if (modeT > 0.6) ferryDX -= Math.min(210, (modeT - 0.6) * 280) * dt // … and head home
    }
    invuln = Math.max(0, invuln - dt)
    sinceBump += dt
    shake = Math.max(0, shake - dt * 2.4)

    if (mode === 'play') director(dt)
    if ((tGull -= dt) <= 0) {
      tGull = rand(2.6, 6)
      spawnGull(false)
    }
    if ((tDeco -= dt) <= 0) {
      tDeco = rand(4, 8)
      spawnDeco()
    }

    updateBoats(dt)
    for (const q of pickups) {
      q.x -= speed * depth(q.y) * dt
      if (q.kind === 'coin' && Math.random() < dt * 0.8) sparkles(q.x + rand(-12, 12) * depth(q.y), q.y - rand(18, 32) * depth(q.y), depth(q.y), 1)
    }
    for (let i = pickups.length - 1; i >= 0; i--) if (pickups[i].x < -60) pickups.splice(i, 1)
    updateGulls(dt)
    updateSlices(dt)
    ferryFx(dt)
    updateParticles(dt)
    for (const q of pops) q.t += dt
    for (let i = pops.length - 1; i >= 0; i--) if (pops[i].t > pops[i].life) pops.splice(i, 1)
    collisions()
    if (mode === 'play') {
      const M: [number, string][] = [
        [0.25, 'Quarter of the way!'],
        [0.48, 'Lady Liberty ahead!'],
        [0.75, 'Almost there, Captain!'],
      ]
      while (milestone < M.length && dist / TRIP >= M[milestone][0]) {
        showBanner(M[milestone][1])
        sfx.ding()
        milestone++
      }
    }
    updateCrowd()
    for (const a of avatars) a.update(dt)

    const p = clamp(dist / TRIP, 0, 1)
    if (Math.abs(p - shownP) > 0.0004) {
      shownP = p
      fillEl.style.width = `${p * 100}%`
      miniEl.style.setProperty('--p', p.toFixed(4))
    }
  }

  function updateBoats(dt: number) {
    for (const b of boats) {
      b.t += dt
      if (b.kind === 'jetski') b.y = clamp(b.baseY + b.amp * Math.sin(b.freq * b.t + b.phase), Y_FAR - 10, Y_NEAR + 10)
      else if (b.kind === 'sail' && b.vy) {
        b.y += b.vy * dt
        if ((b.vy < 0 && b.y <= b.tackLo) || (b.vy > 0 && b.y >= b.tackHi)) {
          b.vy = -b.vy // tack!
          b.face = b.vy < 0 ? 1 : -1
        }
      }
      b.flip = approach(b.flip, b.face, dt * 5)
      b.x -= (speed - b.own) * depth(b.y) * dt
      if (b.hit) {
        b.x += b.kick * dt
        b.y = clamp(b.y + b.kickY * dt, Y_FAR - 20, Y_NEAR + 20)
        b.baseY += b.kickY * dt
        b.kick *= Math.exp(-dt * 2.5)
        b.kickY *= Math.exp(-dt * 3)
        b.tilt *= Math.exp(-dt * 2)
      }
      // wakes behind anything under way
      const s = depth(b.y) * b.size
      if (!b.deco && Math.abs(b.own) > 5 && b.x < W + 60 && b.x > -60) {
        const back = b.own > 0 ? -1 : 1
        b.wake += dt * (b.kind === 'jetski' ? 32 : Math.abs(b.own) * 0.16 + 4)
        while (b.wake > 1) {
          b.wake--
          foam(b.x + back * KINDS[b.kind].w * s * 0.42, b.y + rand(-2, 2) * s, s, b.kind === 'jetski' ? 0.8 : 0.9, 10)
        }
        if (b.kind === 'jetski' && Math.random() < dt * 22) drops(b.x + back * KINDS.jetski.w * s * 0.4, b.y - 4 * s, s, 1, back, 0.9)
      }
    }
    for (let i = boats.length - 1; i >= 0; i--) if (boats[i].x < -320 || boats[i].x > W + 900) boats.splice(i, 1)
  }

  function updateGulls(dt: number) {
    for (const gl of gulls) {
      gl.t += dt
      gl.x += gl.vx * dt
      gl.y += Math.sin(gl.t * 1.3 + gl.phase) * 8 * dt
      if (gl.bomber && !gl.dropped && mode === 'play') {
        // let go so the slice lands right where the ferry is (if it doesn't move!)
        const dropX = FERRY_X + speed * depth(ferryY) * FALL
        if (gl.x <= dropX) {
          gl.dropped = true
          slices.push({ x0: gl.x - gl.size * 0.2, y0: gl.y + gl.size * 0.2, lx: dropX, ty: ferryY, t: 0, rot: -0.4, spin: rand(4, 7) * sign() })
          sfx.squawk()
          pop('Incoming!', dropX, ferryY - 90 * depth(ferryY), '#ffffff', 22)
        }
      }
      if (gl.dropped) gl.y -= 40 * dt
    }
    for (let i = gulls.length - 1; i >= 0; i--) if (gulls[i].x < -120 || gulls[i].x > W + 120) gulls.splice(i, 1)
  }

  function updateSlices(dt: number) {
    for (let i = slices.length - 1; i >= 0; i--) {
      const sl = slices[i]
      sl.t += dt
      sl.lx -= speed * depth(sl.ty) * dt
      sl.rot += sl.spin * dt
      if (sl.t < FALL) continue
      slices.splice(i, 1)
      const fs = depth(ferryY)
      const onDeck =
        Math.abs(ferryY - sl.ty) < ((FERRY.beam + 22) / 2) * fs && Math.abs(sl.lx - FERRY_X) < (FERRY.w * FERRY.hit * fs) / 2 + 14
      if (!(onDeck && bump(pick(["Pizza'd!", 'SPLAT!', 'Extra cheese!']), sl.lx, sl.ty, sl.ty - 1))) {
        splash(sl.lx, sl.ty, depth(sl.ty), 12)
        sfx.pop()
      }
    }
  }

  function ferryFx(dt: number) {
    const fs = depth(ferryY)
    const fx = FERRY_X + ferryDX
    const moving = mode === 'turnback' || speed > 5
    wakeAcc += dt * (moving ? 12 + speed * 0.1 + (mode === 'turnback' ? 24 : 0) : 3)
    while (wakeAcc > 1) {
      wakeAcc--
      foam(fx - ferryFlip * FERRY.w * fs * 0.42, ferryY + rand(-2, 3) * fs, fs, 1.2, 16)
    }
    sprayAcc += dt * (moving ? speed * 0.045 + Math.abs(ferryVy) * 0.05 : 0)
    while (sprayAcc > 1) {
      sprayAcc--
      drops(fx + ferryFlip * FERRY.w * fs * 0.44, ferryY - 6 * fs, fs, 1, -ferryFlip, 0.85)
    }
  }

  function updateParticles(dt: number) {
    for (const q of parts) {
      q.t += dt
      if (q.water) q.x -= speed * depth(q.y) * dt
      q.x += q.vx * dt
      q.y += q.vy * dt
      if (q.k === 'foam') q.vy *= Math.exp(-dt * 1.6)
      else if (q.k === 'drop') q.vy += 780 * dt
      else if (q.k === 'spark') q.vy += 120 * dt
      else if (q.k === 'confetti') {
        q.vy = Math.min(q.vy + 420 * dt, 95)
        q.vx = lerp(q.vx, Math.sin(q.t * 3 + q.rot) * 45, Math.min(1, dt * 2))
        q.rot += q.vr * dt
      }
    }
    parts = parts.filter((q) => q.t < q.life && !(q.k === 'drop' && q.vy > 0 && q.y > q.floor))
    if (parts.length > 1400) parts.splice(0, parts.length - 1400)
  }

  function collisions() {
    if (mode !== 'play' && mode !== 'dock') return
    const fs = depth(ferryY)
    const fHalf = (FERRY.w * FERRY.hit * fs) / 2
    if (mode === 'play') {
      for (const b of boats) {
        if (b.deco || b.hit) continue
        const d = KINDS[b.kind]
        const s = depth(b.y)
        const zy = ((d.beam + FERRY.beam) / 2) * ((s + fs) / 2)
        const dy = Math.abs(b.y - ferryY)
        if (invuln <= 0 && dy < zy && Math.abs(b.x - FERRY_X) < (d.w * d.hit * s) / 2 + fHalf) {
          hitBoat(b)
          break
        }
        if (!b.passed && b.x < FERRY_X) {
          b.passed = true
          if (dy >= zy && dy < zy + 14 && clock - closeCallAt > 5 && invuln <= 0) {
            closeCallAt = clock
            pop(pick(['Close call!', 'Phew!', 'Nice dodge!']), FERRY_X + 20, ferryY - 135 * fs, '#9ff3ff', 24)
          }
        }
      }
    }
    for (let i = pickups.length - 1; i >= 0; i--) {
      const q = pickups[i]
      const s = depth(q.y)
      const reach = q.kind === 'coin' ? 30 : 36
      if (Math.abs(q.y - ferryY) < ((reach + FERRY.beam) / 2) * ((s + fs) / 2) && Math.abs(q.x - FERRY_X) < fHalf + 16 * s) collect(q)
    }
  }

  function updateCrowd() {
    if (mode === 'intro') return
    const s = depth(Y_DOCK)
    const x0 = DOCK_X + s * (TRIP - dist)
    if (!crowd.length && x0 < W + 260 && dist > TRIP / 2) {
      for (const off of [500, 580, 660]) {
        const av = ctx.avatar(ctx.randomLook(), 0.42)
        av.face(-1, false)
        av.setPose(off === 580 ? 'idle' : 'wave')
        const wrap = el('div', C + 'person')
        wrap.append(av.el)
        people.append(wrap)
        crowd.push({ wrap, av, off })
        avatars.push(av)
      }
    }
    for (const c of crowd) {
      const x = x0 + c.off * s
      c.wrap.style.transform = `translate(${x.toFixed(1)}px, ${(Y_DOCK - 40 * s).toFixed(1)}px)`
      c.wrap.style.visibility = x > W + 50 ? 'hidden' : 'visible'
    }
  }

  // ---------- render ----------
  function drawBoat(b: Boat) {
    const d = KINDS[b.kind]
    const im = art.img[d.sprite]
    const s = depth(b.y) * b.size
    const w = d.w * s
    const h = (w * im.height) / im.width
    const bob = Math.sin(clock * 2.4 + b.phase) * 1.6 * s
    let rot = Math.sin(clock * 1.9 + b.phase) * 0.035
    if (b.kind === 'kayak') rot += Math.sin(clock * 6 + b.phase) * 0.045
    else if (b.kind === 'log') rot = Math.sin(clock * 1.6 + b.phase) * 0.06
    else if (b.kind === 'buoyG' || b.kind === 'buoyR') rot = Math.sin(clock * 1.7 + b.phase) * 0.13
    else if (b.kind === 'jetski') rot -= Math.cos(b.freq * b.t + b.phase) * 0.12
    else if (b.kind === 'sail') rot += (b.vy / 34) * 0.06 * b.face
    g.save()
    g.translate(b.x, b.y + bob)
    g.rotate(rot + b.tilt)
    g.scale(b.flip, 1)
    g.drawImage(im, -w / 2, -h * d.ay, w, h)
    g.restore()
  }

  function drawFerry() {
    const s = depth(ferryY)
    const im = art.img.ferry
    const w = FERRY.w * s
    const h = (w * im.height) / im.width
    const bob = Math.sin(clock * 2.2) * 2.2 * s
    let rot = Math.sin(clock * 1.6) * 0.018 + clamp(ferryVy / 330, -1, 1) * 0.07 * ferryFlip
    if (sinceBump < 1.6) rot += Math.exp(-sinceBump * 3.2) * Math.sin(sinceBump * 22) * 0.28
    g.save()
    g.translate(FERRY_X + ferryDX, ferryY + bob)
    g.rotate(rot)
    g.scale(ferryFlip, 1)
    if (invuln > 0 && mode === 'play' && Math.floor(clock * 14) % 2 === 0) g.globalAlpha = 0.45
    g.drawImage(im, -w / 2, -h * FERRY.ay, w, h)
    g.restore()
  }

  function drawPickup(q: Pickup) {
    const s = depth(q.y)
    const coin = q.kind === 'coin'
    const im = coin ? art.img.coin : art.img.lifering
    const w = (coin ? 46 : 68) * s
    const h = (w * im.height) / im.width
    const bob = Math.sin(clock * 3 + q.phase) * 2.5 * s
    g.save()
    g.translate(q.x, q.y + bob)
    if (coin) {
      g.fillStyle = `rgba(255,236,140,${0.22 + Math.sin(clock * 5 + q.phase) * 0.08})`
      g.beginPath()
      g.arc(0, -h * 0.45, w * 0.62, 0, Math.PI * 2)
      g.fill()
    }
    g.rotate(Math.sin(clock * 2 + q.phase) * 0.08)
    g.drawImage(im, -w / 2, -h * 0.84, w, h)
    g.restore()
  }

  function drawGull(gl: Gull) {
    const im = art.img.gull
    const w = gl.size
    const h = (w * im.height) / im.width
    const dir = gl.vx < 0 ? -1 : 1
    const flapping = gl.bomber || Math.sin(gl.t * 0.9 + gl.phase) > -0.35 // flap a while, then glide
    const sy = flapping ? 0.42 + 0.58 * Math.abs(Math.sin(gl.t * 8.5 + gl.phase)) : 0.92
    g.save()
    g.translate(gl.x, gl.y)
    g.rotate(Math.sin(gl.t * 2 + gl.phase) * 0.06)
    g.scale(dir, sy)
    g.drawImage(im, -w / 2, -h * 0.66, w, h)
    g.restore()
    if (gl.bomber && !gl.dropped) drawSlice(g, gl.x + dir * w * 0.3, gl.y + h * 0.2, 32, dir * 0.5)
  }

  function drawSurface() {
    for (const q of parts) {
      if (q.k !== 'foam' && q.k !== 'ring') continue
      const k = q.t / q.life
      const r = q.r + q.grow * k
      g.beginPath()
      g.ellipse(q.x, q.y, r, r * 0.36, 0, 0, Math.PI * 2)
      if (q.k === 'foam') {
        g.globalAlpha = (1 - k) * 0.7
        g.fillStyle = '#ffffff'
        g.fill()
      } else {
        g.globalAlpha = (1 - k) * 0.85
        g.strokeStyle = '#ffffff'
        g.lineWidth = 3 * (1 - k) + 1
        g.stroke()
      }
    }
    g.globalAlpha = 1
    for (const sl of slices) {
      // the slice's shadow grows on the water where it's going to land
      const k = clamp(sl.t / FALL, 0, 1)
      const s = depth(sl.ty)
      const rx = lerp(8, 30, k) * s
      g.fillStyle = `rgba(10,40,95,${lerp(0.18, 0.45, k)})`
      g.beginPath()
      g.ellipse(sl.lx, sl.ty, rx, rx * 0.36, 0, 0, Math.PI * 2)
      g.fill()
      const pulse = 0.5 + 0.5 * Math.sin(clock * 16)
      for (const [w, col] of [
        [6, 'rgba(29,33,64,.45)'],
        [3.2, `rgba(255,90,70,${0.7 + pulse * 0.3})`],
      ] as const) {
        g.lineWidth = w
        g.strokeStyle = col
        g.beginPath()
        g.ellipse(sl.lx, sl.ty, (34 + pulse * 5) * s, (11.5 + pulse * 1.6) * s, 0, 0, Math.PI * 2)
        g.stroke()
      }
    }
  }

  function drawAir() {
    for (const q of parts) {
      const k = q.t / q.life
      if (q.k === 'drop') {
        g.fillStyle = q.color
        g.beginPath()
        g.arc(q.x, q.y, q.r, 0, Math.PI * 2)
        g.fill()
      } else if (q.k === 'spark') {
        const r = q.r * (1 - k)
        g.globalAlpha = 1 - k * 0.5
        g.fillStyle = q.color
        g.beginPath()
        g.moveTo(q.x, q.y - r)
        g.quadraticCurveTo(q.x, q.y, q.x + r, q.y)
        g.quadraticCurveTo(q.x, q.y, q.x, q.y + r)
        g.quadraticCurveTo(q.x, q.y, q.x - r, q.y)
        g.quadraticCurveTo(q.x, q.y, q.x, q.y - r)
        g.fill()
        g.globalAlpha = 1
      }
    }
  }

  function drawConfetti() {
    for (const q of parts) {
      if (q.k !== 'confetti') continue
      const k = q.t / q.life
      g.save()
      g.translate(q.x, q.y)
      g.rotate(q.rot)
      g.scale(Math.cos(q.t * 7 + q.vr), 1)
      g.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 1
      g.fillStyle = q.color
      g.fillRect(-q.r, -q.r * 0.55, q.r * 2, q.r * 1.1)
      g.restore()
    }
  }

  function drawPops() {
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.lineJoin = 'round'
    for (const q of pops) {
      const k = q.t / q.life
      const sc = q.t < 0.12 ? lerp(0.4, 1.18, q.t / 0.12) : q.t < 0.22 ? lerp(1.18, 1, (q.t - 0.12) / 0.1) : 1
      g.save()
      g.translate(q.x, q.y - 36 * k)
      g.scale(sc, sc)
      g.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1
      g.font = `${q.size}px ${FONT}`
      g.lineWidth = q.size * 0.24
      g.strokeStyle = INK
      g.strokeText(q.text, 0, 0)
      g.fillStyle = q.color
      g.fillText(q.text, 0, 0)
      g.restore()
    }
  }

  function drawWarnings() {
    for (const b of boats) {
      if (b.kind !== 'jetski' || b.deco) continue
      const s = depth(b.y)
      if (b.x - (KINDS.jetski.w * s) / 2 < W - 4) continue
      const y = b.y - 24 * s
      const k = 1 + Math.sin(clock * 16) * 0.1
      g.save()
      g.translate(W - 28, y)
      g.scale(k, k)
      g.lineWidth = 3
      g.strokeStyle = INK
      g.fillStyle = '#ffd166'
      g.beginPath()
      g.moveTo(0, -17)
      g.lineTo(16, 12)
      g.lineTo(-16, 12)
      g.closePath()
      g.fill()
      g.stroke()
      g.fillStyle = INK
      g.font = `20px ${FONT}`
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('!', 0, 3)
      g.restore()
    }
  }

  function render() {
    g.setTransform(px, 0, 0, px, 0, 0)
    if (shake > 0) {
      const a = shake * shake * 10
      const z = 1 + shake * 0.035
      g.translate(W / 2 + rand(-a, a), H / 2 + rand(-a, a) * 0.6)
      g.scale(z, z)
      g.translate(-W / 2, -H / 2)
    }
    const p = clamp(dist / TRIP, 0, 1)
    drawSky(g, art, SKY_PAN * p)
    // Lady Liberty rides with the skyline and grows as the ferry closes in
    const lg = 1 / (1 + 8 * (1 - p))
    const lx = LIBERTY_X + SKY_PAN * (1 - p)
    if (lx - libertyHalfWidth(1.12 * lg) < W) drawLiberty(g, art, lx, HORIZON + 1 + 10 * lg, 1.12 * lg)
    drawWater(g, art, scroll, depth)
    for (const b of boats) if (b.deco) drawBoat(b)
    drawSurface()

    // everything floating, far to near
    const items: [number, () => void][] = []
    for (const b of boats) if (!b.deco) items.push([b.y, () => drawBoat(b)])
    for (const q of pickups) items.push([q.y, () => drawPickup(q)])
    items.push([ferryY, drawFerry])
    const pierX = DOCK_X + depth(Y_DOCK) * (TRIP - dist)
    if (mode !== 'intro' && pierX < W + 40) items.push([Y_DOCK, () => drawPier(g, pierX, Y_DOCK, depth(Y_DOCK), clock)])
    items.sort((a, b) => a[0] - b[0])
    for (const [, draw] of items) draw()

    drawAir()
    for (const sl of slices) {
      const k = clamp(sl.t / FALL, 0, 1)
      drawSlice(g, lerp(sl.x0, sl.lx, k), lerp(sl.y0, sl.ty - 12, k * k), lerp(32, 40, k) * Math.max(0.75, depth(sl.ty)), sl.rot)
    }
    for (const gl of gulls) drawGull(gl)
    drawConfetti()
    drawPops()
    g.setTransform(px, 0, 0, px, 0, 0)
    if (mode === 'play') drawWarnings()
  }

  // ---------- loop ----------
  let raf = 0
  let last = performance.now()
  let refit = 0
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000))
    last = now
    if ((refit -= dt) <= 0) {
      refit = 0.5
      fit()
    }
    update(dt)
    render()
  }
  raf = requestAnimationFrame(frame)
  cleanups.push(() => cancelAnimationFrame(raf))
}
