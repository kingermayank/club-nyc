import './lovelocks.css'
import { sfx } from '../../audio'
import { play } from '../../sound/library'
import { el, stage, toStage } from '../../engine/stage'
import { world } from '../../engine/world'
import { persist, save } from '../../state'
import { walletOnline } from '../../net/wallet'
import { rest, HttpError } from '../../net/server'
import type { Game } from '../../types'
import type { Pt } from '../../geometry'
import { openMoment, pick, shout, sparks } from './kit'

/**
 * Love Locks, Brooklyn Bridge. Three places, first person:
 *  - the souvenir stand's counter (art/places/lock-stand.jpg): buy a padlock (it comes with its key) from the tin
 *    tray, then make it yours on the newspaper: enamel colour, shape, spray paint from five cans, initials
 *  - the railing (art/places/lock-fence.jpg): carry it to the diamond lattice and snap it shut on a strap, where it
 *    swings and settles among everyone else's locks
 *  - the key: fling it over the rail into the East River (it really flies: up, away, smaller, down, splash), or keep
 *    it. A kept key (or a spare from the stand) opens one of your locks again.
 * The railing is shared: online, every New Yorker's locks hang here (server/src/locks.ts) and the server works out
 * what's in your pocket from what you bought. Offline, your own locks live in save.loveLocks.
 */

const FENCE = '/art/places/lock-fence.jpg'
const STAND = '/art/places/lock-stand.jpg'
/** the railing alone (transparent between the straps), from y 240 down: a thrown key drops behind it */
const RAIL = '/art/places/lock-fence-rail.png'
const SP = '/art/places/sprites/'
const LOCK_PRICE = 12
const KEY_PRICE = 5
/** where a thrown key can come down (the river through the lattice, x), and the ferry on it */
const RIVER = [520, 935]
const BOAT = [788, 302, 862, 346]

// ---------- the railing's lattice (lock-fence.jpg, drawn at 1000 × 565.5) ----------
// the straps cross at riveted points in rows: y 334 (x 120 + k·112.3), y 385 (halfway between), y 438
const X0 = 120.5
const Y0 = 334
const P = 112.3
const SLOPE = 0.887
const BOUNDS = { x1: 84, x2: 946, y1: 302, y2: 480 }
/** a lock's size on the railing (stage units), and where on the drawing its shackle hooks the strap */
const SMALL = 48
const HOOK = 14 / 120

/** the nearest point on a strap to p: locks clip on anywhere along the straps, like the real railing */
function onStrap(p: Pt): Pt {
  let best: Pt = [p[0], p[1]]
  let bd = Infinity
  for (const sign of [1, -1]) {
    const c = X0 + Math.round((p[0] - sign * (p[1] - Y0) / SLOPE - X0) / P) * P
    const len = Math.hypot(1, SLOPE)
    const d: Pt = [1 / len, (sign * SLOPE) / len]
    const t = (p[0] - c) * d[0] + (p[1] - Y0) * d[1]
    const f: Pt = [c + t * d[0], Y0 + t * d[1]]
    const dist = Math.hypot(p[0] - f[0], p[1] - f[1])
    if (dist < bd) (bd = dist), (best = f)
  }
  return [Math.min(BOUNDS.x2, Math.max(BOUNDS.x1, best[0])), Math.min(BOUNDS.y2, Math.max(BOUNDS.y1, best[1]))]
}

// ---------- the locks themselves ----------
type Shape = 'classic' | 'heart' | 'round'
interface Lock { id?: number; x: number; y: number; body: number; shape: Shape; initials: string; paint: string | null; by?: string; at?: number; mine?: boolean; kept?: boolean; removed?: string | null }

/** enamel colours: [base, light, dark] */
const BODIES: [string, string, string][] = [
  ['#e8b33a', '#fff0a8', '#a8741a'], ['#c9d1dc', '#ffffff', '#7d8898'], ['#e5483b', '#ff9a8a', '#9e2a20'], ['#ff8a1e', '#ffc27a', '#b85a08'],
  ['#ffd23f', '#fff3a8', '#c79a10'], ['#3cb371', '#8ee6ad', '#20784a'], ['#20b2aa', '#7fe3dc', '#137470'], ['#2a7bd5', '#86bdf5', '#17498a'],
  ['#8a5cf0', '#c4aaff', '#5532a8'], ['#ff7eb6', '#ffc2dc', '#c24a82'], ['#343946', '#6b7386', '#16181f'], ['#f5f2ea', '#ffffff', '#c3bba8'],
]
const SPRAYS = [
  { id: 'red', color: '#ef2b2b' }, { id: 'yellow', color: '#ffd400' }, { id: 'blue', color: '#16a6f2' }, { id: 'green', color: '#32e03a' }, { id: 'pink', color: '#ff2fc4' },
]
const SHAPES: Record<Shape, string> = {
  classic: 'M25 52 H75 Q88 52 88 65 V101 Q88 114 75 114 H25 Q12 114 12 101 V65 Q12 52 25 52 Z',
  round: 'M50 49 A35 35 0 1 1 49.9 49 Z',
  heart: 'M50 116 C 20 98, 6 82, 10 66 C 14 50, 34 45, 50 60 C 66 45, 86 50, 90 66 C 94 82, 80 98, 50 116 Z',
}
/** the paint layer covers the body's box: x 10..90, y 46..118 of the 100 × 120 drawing, at 2× */
const PW = 160
const PH = 144

let uid = 0
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
function lockSvg(l: Pick<Lock, 'body' | 'shape' | 'initials' | 'paint'>): string {
  const id = `ll${uid++}`
  const [base, light, dark] = BODIES[l.body] ?? BODIES[0]
  const shape = SHAPES[l.shape] ?? SHAPES.classic
  return `<svg class="ll-svg" viewBox="0 0 100 120" aria-hidden="true">
    <defs><linearGradient id="${id}g" x1="0" y1="0" x2="0.3" y2="1"><stop offset="0" stop-color="${light}"/><stop offset=".45" stop-color="${base}"/><stop offset="1" stop-color="${dark}"/></linearGradient>
      <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8b93a6"/><stop offset=".45" stop-color="#f4f7fb"/><stop offset="1" stop-color="#7d8597"/></linearGradient>
      <clipPath id="${id}c"><path d="${shape}"/></clipPath></defs>
    <g class="ll-shackle"><path d="M31 64 V33 A19 19 0 0 1 69 33 V64" fill="none" stroke="#1d2140" stroke-width="15" stroke-linecap="round"/>
      <path d="M31 64 V33 A19 19 0 0 1 69 33 V64" fill="none" stroke="url(#${id}s)" stroke-width="8" stroke-linecap="round"/></g>
    <path d="${shape}" fill="url(#${id}g)"/>
    ${l.paint ? `<image href="${l.paint}" x="10" y="46" width="80" height="72" preserveAspectRatio="none" clip-path="url(#${id}c)"/>` : ''}
    <ellipse cx="34" cy="66" rx="13" ry="6" fill="#fff" opacity=".38" clip-path="url(#${id}c)"/>
    ${l.initials ? `<text x="50" y="${l.shape === 'heart' ? 84 : 88}" text-anchor="middle" font-family="'Burbank Display','Lilita One',sans-serif" font-size="${l.initials.length > 3 ? 19 : 23}" fill="#fff" stroke="#1d2140" stroke-width="4" paint-order="stroke">${esc(l.initials)}</text>` : ''}
    <path d="M50 ${l.shape === 'heart' ? 92 : 97} m-4 0 a4 4 0 1 1 8 0 l-2 8 h-4 z" fill="#1d2140" opacity=".75"/>
    <path d="${shape}" fill="none" stroke="#1d2140" stroke-width="4" stroke-linejoin="round"/>
  </svg>`
}

// ---------- where the locks live: the server (online) or this save (offline) ----------
interface Pocket { locks: number; keys: number; hung?: number }
interface Railing { locks: Lock[]; total: number; pocket: Pocket; history: Lock[] }
const online = () => walletOnline()
const local = () => (save.loveLocks ??= { locks: 0, keys: 0, hung: [] })

async function loadRailing(): Promise<Railing> {
  if (online()) {
    try {
      const r = await rest<{ locks: Lock[]; total: number; pocket: Pocket | null; history: Lock[] }>('/locks')
      return { locks: r.locks, total: r.total, pocket: r.pocket ?? { locks: 0, keys: 0 }, history: r.history }
    } catch {
      /* the city is unreachable: show what this browser knows */
    }
  }
  const s = local()
  const mine = s.hung.map((h): Lock => ({ ...h, shape: h.shape as Shape, mine: true, by: save.name }))
  return { locks: mine, total: mine.length, pocket: { locks: s.locks, keys: s.keys }, history: [...mine].reverse() }
}

// ---------- the room: your locks (and everyone's) on the railing mesh you can see from the promenade ----------
/** the mesh panel in the room's own painting the railing maps onto */
const PANEL = { x: 93, y: 334, w: 70, h: 46 }
let roomLocks: Lock[] | null = null
export function paintLocks(_g?: Game) {
  if (world.room.id !== 'brooklyn-bridge') return
  const draw = (list: Lock[]) => {
    if (world.room.id !== 'brooklyn-bridge') return
    stage.scene.querySelectorAll('.ll-mini').forEach((n) => n.remove())
    for (const l of list.slice(-60)) {
      const d = el('i', 'll-mini' + (l.mine ? ' mine' : ''))
      d.style.cssText = `left:${PANEL.x + ((l.x - BOUNDS.x1) / (BOUNDS.x2 - BOUNDS.x1)) * PANEL.w}px;top:${PANEL.y + ((l.y - BOUNDS.y1) / (BOUNDS.y2 - BOUNDS.y1)) * PANEL.h}px;--c:${(BODIES[l.body] ?? BODIES[0])[0]}`
      stage.scene.append(d)
    }
  }
  if (roomLocks) draw(roomLocks)
  void loadRailing().then((r) => draw((roomLocks = r.locks)))
}

// ---------- the moment ----------
export function loveLocks(g: Game, start: 'fence' | 'stand' = 'fence') {
  if (world.room.id !== 'brooklyn-bridge') return
  const m = openMoment('mo-lovelocks')
  m.root.querySelector('.mo-scrim')?.remove()
  m.root.innerHTML += `<img class="ll-bg" alt="" draggable="false" src="${FENCE}">
    <img class="ll-rail" alt="" draggable="false" src="${RAIL}">
    <div class="ll-layer"></div>
    <div class="ll-top"><span class="ll-count"><i class="ll-ico"></i><b>0</b></span><span class="ll-pocket"></span></div>
    <div class="ll-actions"><span class="ll-coins"><img src="/art/icons/coin.png" alt=""><b></b></span><button class="btn tiny ghost ll-leave" type="button">Step Out</button></div>
    <div class="ll-bar"></div>`
  const bg = m.root.querySelector<HTMLImageElement>('.ll-bg')!
  const railImg = m.root.querySelector<HTMLImageElement>('.ll-rail')!
  const layer = m.root.querySelector<HTMLElement>('.ll-layer')!
  const bar = m.root.querySelector<HTMLElement>('.ll-bar')!
  const pocketEl = m.root.querySelector<HTMLElement>('.ll-pocket')!
  const countEl = m.root.querySelector<HTMLElement>('.ll-count b')!
  const coinsEl = m.root.querySelector<HTMLElement>('.ll-coins b')!
  m.root.querySelector<HTMLElement>('.ll-leave')!.onclick = () => (sfx.click(), m.close())
  new Image().src = STAND

  let rail: Railing = { locks: [], total: 0, pocket: { locks: 0, keys: 0 }, history: [] }
  let view: 'fence' | 'stand' = 'fence'
  /** the lock you're making: what it looks like, and the paint on it */
  const draft: Lock = { x: 0, y: 0, body: 0, shape: 'classic', initials: '', paint: null }
  const paint = document.createElement('canvas')
  paint.width = PW
  paint.height = PH
  const used = new Set<string>()
  /** a lock you've snapped shut but not finished with (the key is still in your hand) */
  let pending: Lock | null = null

  const renderTop = () => {
    countEl.textContent = rail.total.toLocaleString('en-US')
    coinsEl.textContent = String(save.coins)
    pocketEl.innerHTML = `${rail.pocket.locks ? `<span class="ll-chip" title="Locks in your pocket"><i class="ll-ico"></i>${rail.pocket.locks}</span>` : ''}${rail.pocket.keys ? `<span class="ll-chip" title="Keys in your pocket"><img src="${SP}lock-key.png" alt="">${rail.pocket.keys}</span>` : ''}`
  }
  const setBar = (...buttons: { label: string; go?: boolean; act: () => void }[]) => {
    bar.innerHTML = ''
    for (const b of buttons) {
      const btn = el('button', 'btn small ' + (b.go ? 'go' : 'ghost'), b.label)
      btn.onclick = (e) => (e.stopPropagation(), sfx.click(), b.act())
      bar.append(btn)
    }
  }
  const hintAt = (text: string, at: Pt) => {
    m.root.querySelectorAll('.ll-hint').forEach((n) => n.remove())
    if (!text) return
    const h = el('div', 'mo-hint ll-hint', `<span>${text}</span>`)
    h.style.left = `${at[0]}px`
    h.style.top = `${at[1]}px`
    m.root.append(h)
  }

  // ========== the railing ==========
  const nodes = new Map<Lock, HTMLElement>()
  /** a swinging lock: angle, angular velocity */
  const swings = new Map<HTMLElement, { a: number; v: number }>()
  const tip = el('div', 'll-tip')
  const placeLock = (l: Lock, fresh = false) => {
    const n = el('div', 'll-lock' + (l.mine ? ' mine' : '') + (fresh ? ' fresh' : ''), lockSvg(l))
    n.style.cssText = `left:${l.x - SMALL / 2}px;top:${l.y - SMALL * 1.2 * HOOK}px;width:${SMALL}px;z-index:${Math.round(l.y)}`
    n.onpointerenter = () => {
      const when = l.at ? new Date(l.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
      tip.innerHTML = `${l.mine ? '<b>Yours</b>' : l.by ? `<b>${esc(l.by)}</b>` : '<b>A New Yorker</b>'}${when ? `<span>${when}</span>` : ''}`
      tip.style.left = `${l.x}px`
      tip.style.top = `${l.y - 14}px`
      tip.classList.add('on')
    }
    n.onpointerleave = () => tip.classList.remove('on')
    n.onclick = (e) => {
      e.stopPropagation()
      if (holding || keyState !== 'none') return
      if (!l.mine) {
        swings.set(n, { a: 0, v: (Math.random() < 0.5 ? -1 : 1) * 3.5 })
        sfx.tick()
        return
      }
      mineMenu(l, n)
    }
    layer.append(n)
    nodes.set(l, n)
    return n
  }
  const drawRailing = () => {
    layer.innerHTML = ''
    nodes.clear()
    swings.clear()
    for (const l of [...rail.locks].sort((a, b) => a.y - b.y)) placeLock(l)
    layer.append(tip)
  }
  // every lock swings on its own hook: a damped pendulum, nudged by its neighbours when one lands
  m.frame((dt) => {
    for (const [n, s] of swings) {
      s.v += (-38 * s.a - 2.4 * s.v) * dt
      s.a += s.v * dt
      n.style.transform = `rotate(${s.a}rad)`
      if (Math.abs(s.a) < 0.002 && Math.abs(s.v) < 0.01) (n.style.transform = ''), swings.delete(n)
    }
  })

  /** clicking one of your own locks: open it with a key, or go and get a spare */
  const mineMenu = (l: Lock, n: HTMLElement) => {
    m.root.querySelectorAll('.ll-menu').forEach((x) => x.remove())
    const menu = el('div', 'll-menu')
    menu.style.left = `${l.x}px`
    menu.style.top = `${l.y + 34}px`
    const b = el('button', 'btn tiny ' + (rail.pocket.keys ? 'go' : 'ghost'), rail.pocket.keys ? `<img src="${SP}lock-key.png" alt="">Unlock It` : `Spare Key <img src="/art/icons/coin.png" alt="">${KEY_PRICE}`)
    b.onclick = (e) => {
      e.stopPropagation()
      menu.remove()
      if (!rail.pocket.keys) return toStand('key')
      void unlock(l, n)
    }
    menu.append(b)
    m.root.append(menu)
    m.later(() => menu.remove(), 3500)
  }
  const unlock = async (l: Lock, n: HTMLElement) => {
    if (online() && l.id) {
      try {
        const r = await rest<{ pocket: Pocket }>(`/locks/${l.id}/unlock`, { json: {} })
        rail.pocket = r.pocket
      } catch {
        return shout(m, 'No key fits', [l.x, l.y - 20], 'bad')
      }
    } else {
      const s = local()
      if (s.keys < 1) return
      s.keys--
      s.locks++
      s.hung = s.hung.filter((h) => !(h.x === l.x && h.y === l.y && h.at === l.at))
      persist()
      rail.pocket = { locks: s.locks, keys: s.keys }
    }
    play('locks.shut') ?? sfx.click()
    n.classList.add('opened')
    rail.locks = rail.locks.filter((x) => x !== l)
    rail.total = Math.max(0, rail.total - 1)
    roomLocks = rail.locks
    m.later(() => n.remove(), 700)
    renderTop()
    fenceBar()
  }

  // ---------- carrying your lock to the railing ----------
  let holding: HTMLElement | null = null
  const ghost = el('i', 'll-ring')
  const fenceBar = () => {
    if (holding || keyState !== 'none') return
    hintAt('', [0, 0])
    setBar({ label: rail.pocket.locks ? 'Hang Your Lock' : 'Get a Lock', go: true, act: () => toStand() })
  }
  const toFence = (carry = false) => {
    view = 'fence'
    bg.src = FENCE
    m.root.classList.remove('stand')
    m.root.querySelectorAll('.ll-standonly').forEach((x) => x.remove())
    drawRailing()
    renderTop()
    if (!carry) return fenceBar()
    // your lock, open, in your hand: it follows you along the railing and a ring shows where it would clip on
    holding = el('div', 'll-lock held open', lockSvg(draft))
    holding.style.width = '104px'
    m.root.append(holding, ghost)
    setBar({ label: 'Back to the Stand', act: () => (dropHeld(), toStand()) })
    hintAt('Clip it on a strap', [515, 300])
  }
  const dropHeld = () => {
    holding?.remove()
    holding = null
    ghost.remove()
  }
  const free = (p: Pt) => !rail.locks.some((l) => Math.hypot(l.x - p[0], l.y - p[1]) < 22)
  m.root.addEventListener('pointermove', (e) => {
    if (!holding) return
    const p = toStage(e)
    holding.style.transform = `translate(${p[0] - 52}px, ${p[1] - 14}px) rotate(-8deg)`
    const s = onStrap(p)
    const near = Math.hypot(s[0] - p[0], s[1] - p[1]) < 46 && p[1] > 280
    ghost.classList.toggle('on', near)
    ghost.classList.toggle('taken', near && !free(s))
    ghost.style.transform = `translate(${s[0]}px, ${s[1]}px)`
  })
  m.root.addEventListener('pointerdown', (e) => {
    if (!holding || (e.target as Element).closest('button, input')) return
    const p = toStage(e)
    const s = onStrap(p)
    if (Math.hypot(s[0] - p[0], s[1] - p[1]) > 46 || p[1] < 280) return
    if (!free(s)) {
      sfx.squawk()
      return shout(m, 'Taken!', [s[0], s[1] - 30], 'bad')
    }
    clip(s)
  })

  /** snap it shut on the strap at s: the shackle drops, it clicks, it swings, the neighbours jostle */
  const clip = (s: Pt) => {
    dropHeld()
    hintAt('', [0, 0])
    const l: Lock = { ...draft, x: s[0], y: s[1], mine: true, by: save.name, at: Date.now() }
    const n = placeLock(l, true)
    n.classList.add('open')
    requestAnimationFrame(() => requestAnimationFrame(() => n.classList.remove('open')))
    play('locks.shut') ?? sfx.clapper()
    swings.set(n, { a: 0.35, v: 2 })
    for (const [o, on] of nodes) if (o !== l && Math.hypot(o.x - l.x, o.y - l.y) < 60) swings.set(on, { a: 0, v: (o.x < l.x ? -1 : 1) * 1.6 })
    sparks(m, [s[0], s[1] + 20], 6, '#fff3c4')
    rail.locks.push(l)
    rail.total++
    pending = l
    renderTop()
    m.later(() => holdKey(), 650)
  }

  // ---------- the key: over the rail, or into your pocket ----------
  let keyState: 'none' | 'hand' | 'drag' | 'flying' = 'none'
  const KEY_HOME: Pt = [820, 470]
  const key = el('img', 'll-key') as HTMLImageElement
  key.src = SP + 'lock-key.png'
  key.alt = 'Your key'
  key.draggable = false
  let kp: Pt = [...KEY_HOME]
  let kv: Pt = [0, 0]
  let spin = 0
  let rot = -20
  /** the throw in flight: from, where it comes down, how far out (depth), how high it rises, how long it takes */
  let fly = { from: [0, 0] as Pt, to: [0, 0] as Pt, z: 0, peak: 0, t: 0, dur: 1 }
  let trail: { p: Pt; t: number }[] = []
  const putKey = (scale = 1) => {
    key.style.transform = `translate(${kp[0]}px, ${kp[1]}px) translate(-50%, -50%) rotate(${rot}deg) scale(${scale})`
  }
  const holdKey = () => {
    keyState = 'hand'
    kp = [...KEY_HOME]
    rot = -20
    key.classList.remove('gone')
    m.root.append(key)
    putKey()
    hintAt('Fling the key into the river', [820, 410])
    setBar({ label: 'Keep the Key', act: () => keepKey() })
  }
  key.onpointerdown = (e) => {
    if (keyState !== 'hand') return
    e.preventDefault()
    e.stopPropagation()
    key.setPointerCapture(e.pointerId)
    keyState = 'drag'
    trail = [{ p: toStage(e), t: performance.now() }]
    hintAt('', [0, 0])
  }
  key.onpointermove = (e) => {
    if (keyState !== 'drag') return
    kp = toStage(e)
    trail.push({ p: kp, t: performance.now() })
    trail = trail.filter((s) => performance.now() - s.t < 110)
    putKey()
  }
  key.onpointerup = key.onpointercancel = () => {
    if (keyState !== 'drag') return
    const a = trail[0]
    const b = trail[trail.length - 1]
    const dt = Math.max(16, b.t - a.t) / 1000
    kv = [(b.p[0] - a.p[0]) / dt, (b.p[1] - a.p[1]) / dt]
    // a real throw goes up and away; a lazy one just drops on the boards
    if (kv[1] > -320) return fumble()
    // how hard you threw sets how far out it goes (depth z): the river's surface sits higher on the screen the
    // further out you look (the far shore is ~190, just over the top rail ~258), and the key shrinks with distance
    const power = Math.min(1, (-kv[1] - 320) / 2600)
    const z = 140 + power * 2200
    const sideways = Math.max(-260, Math.min(260, kv[0] * 0.22))
    // it comes down in the river you see through the lattice, right of the roadway
    fly = { from: [...kp], to: [Math.max(RIVER[0], Math.min(RIVER[1], kp[0] + sideways)), z < 260 ? 262 : waterAt(z)], z, peak: 210 + power * 150, t: 0, dur: 0.85 + power * 0.7 }
    keyState = 'flying'
    spin = (kv[0] >= 0 ? 1 : -1) * (540 + Math.random() * 360)
    sfx.whoosh()
  }
  // the river seen through the lattice: the further out, the closer to the top rail (~300 far, ~400 near)
  const waterAt = (z: number) => 300 + 130 * (500 / (z + 500))
  const scaleAt = (z: number) => 380 / (380 + z)
  m.frame((dt) => {
    if (keyState !== 'flying') return
    fly.t += dt
    const u = Math.min(1, fly.t / fly.dur)
    // up, out and down: a straight line from hand to landing spot, lifted by a parabola that peaks halfway
    kp = [fly.from[0] + (fly.to[0] - fly.from[0]) * u, fly.from[1] + (fly.to[1] - fly.from[1]) * u - fly.peak * 4 * u * (1 - u)]
    const s = 1 + (scaleAt(fly.z) - 1) * Math.pow(u, 0.7)
    rot += spin * dt * Math.max(0.3, s)
    putKey(s)
    // past the top of the arc it's on the far side of the railing: the straps pass in front of it
    if (u > 0.45 && fly.z >= 260 && key.nextSibling !== railImg) m.root.insertBefore(key, railImg)
    if (u < 1) return
    // a throw that doesn't carry past the railing clangs off the top rail and drops on the boards
    if (fly.z < 260) return fumble(true)
    splash(s)
  })
  const fumble = (onRail = false) => {
    keyState = 'hand'
    play('locks.clink') ?? sfx.tick()
    key.classList.add('drop')
    shout(m, onRail ? 'Clank!' : 'Harder!', [kp[0], Math.min(470, kp[1]) - 30], 'bad')
    m.later(() => {
      key.classList.remove('drop')
      m.root.append(key)
      kp = [...KEY_HOME]
      rot = -20
      putKey()
      hintAt('Throw it up and over', [820, 410])
    }, 650)
  }
  const splash = (s: number) => {
    keyState = 'none'
    key.classList.add('gone')
    const at: Pt = [kp[0], kp[1]]
    play('locks.plop') ?? sfx.pop()
    const w = el('div', 'll-splash')
    w.style.cssText = `left:${at[0]}px;top:${at[1]}px;--s:${Math.max(0.3, s * 1.6)}`
    w.innerHTML = '<i></i><i></i><b></b><b></b><b></b>'
    m.root.insertBefore(w, railImg)
    m.later(() => w.remove(), 1500)
    const feet = Math.round(fly.z * 0.06)
    // the ferry out on the river, through the lattice
    const onTug = at[0] > BOAT[0] && at[0] < BOAT[2] && at[1] > BOAT[1] && at[1] < BOAT[3]
    m.later(() => {
      if (onTug) {
        sfx.toot()
        shout(m, 'Special delivery!', [at[0], at[1] - 26], 'gold')
        g.stamp('tugboat-key')
      } else shout(m, `${feet} ft!`, [at[0], at[1] - 26])
    }, 250)
    m.later(() => void commit(false), 400)
  }
  const keepKey = () => {
    if (keyState !== 'hand') return
    keyState = 'none'
    key.classList.add('pocket')
    m.later(() => key.classList.add('gone'), 450)
    g.say('Keeping the key. Just in case.')
    void commit(true)
  }

  /** the lock is on the railing for good: tell the city (or this save), then the stamps */
  let committing = false
  const commit = async (keep: boolean) => {
    const l = pending
    if (!l || committing) return
    committing = true
    pending = null
    l.kept = keep
    if (online()) {
      try {
        const r = await rest<{ id: number; initials: string; pocket: Pocket }>('/locks', { json: { x: l.x, y: l.y, body: l.body, shape: l.shape, initials: l.initials, paint: l.paint, keepKey: keep } })
        l.id = r.id
        rail.pocket = r.pocket
      } catch (e) {
        // the server said no (no lock bought, too soon): take it back down rather than pretend
        const why = e instanceof HttpError ? e.reason : ''
        const n = nodes.get(l)
        n?.remove()
        rail.locks = rail.locks.filter((x) => x !== l)
        rail.total--
        committing = false
        renderTop()
        fenceBar()
        return shout(m, why === 'too-soon' ? 'One a minute!' : 'Try again', [l.x, l.y - 30], 'bad')
      }
    } else {
      const s = local()
      s.locks = Math.max(0, s.locks - 1)
      if (keep) s.keys++
      s.hung.push({ x: l.x, y: l.y, body: l.body, shape: l.shape, initials: l.initials, paint: l.paint, at: l.at ?? Date.now(), kept: keep })
      // the city's bolt cutters: your newest 8 stay up
      while (s.hung.length > 8) s.hung.shift()
      persist()
      rail.pocket = { locks: s.locks, keys: s.keys }
    }
    committing = false
    roomLocks = rail.locks
    rail.history.unshift(l)
    g.stamp('love-lock')
    if (used.size >= SPRAYS.length) g.stamp('locksmith')
    g.say(pick(keep ? ['It’s up. The key stays with me.', 'On the bridge, and I can still visit it.'] : ['Key is gone. No take-backs.', 'Forever. Or until the bolt cutters.', 'The river has a lot of keys.']))
    renderTop()
    m.later(() => {
      hintAt('', [0, 0])
      setBar(
        { label: rail.pocket.locks ? 'Hang Another' : 'Get Another Lock', go: true, act: () => toStand() },
        { label: 'Done', act: () => m.close() },
      )
    }, 900)
  }
  // closing with the lock clipped on and the key still in your hand: you kept the key
  m.onClose(() => {
    if (pending) void commit(true)
    paintLocks()
  })

  // ========== the souvenir stand ==========
  const TRAY: [number, number, number, number] = [8, 262, 200, 448]
  const BIG = 230
  const BIG_AT: Pt = [537, 362]
  let big: HTMLElement | null = null
  let tool: string | null = null
  let can: HTMLImageElement | null = null
  const bigBox = () => [BIG_AT[0] - BIG / 2, BIG_AT[1] - BIG * 0.6] as Pt
  const refreshBig = () => {
    if (!big) return
    big.innerHTML = lockSvg(draft)
  }
  const toStand = (want: 'lock' | 'key' = 'lock') => {
    view = 'stand'
    m.root.classList.add('stand')
    bg.src = STAND
    layer.innerHTML = ''
    m.root.querySelectorAll('.ll-menu').forEach((x) => x.remove())
    renderTop()
    const tray = el('button', 'll-tray ll-standonly')
    tray.style.cssText = `left:${TRAY[0]}px;top:${TRAY[1]}px;width:${TRAY[2] - TRAY[0]}px;height:${TRAY[3] - TRAY[1]}px`
    tray.setAttribute('aria-label', `Buy a padlock with its key for ${LOCK_PRICE} coins`)
    tray.innerHTML = `<span class="ll-tag"><img src="/art/icons/coin.png" alt="">${LOCK_PRICE}</span>`
    tray.onclick = () => buyLock()
    const spare = el('button', 'll-spare ll-standonly', `<img src="${SP}lock-key.png" alt=""><span class="ll-tag"><img src="/art/icons/coin.png" alt="">${KEY_PRICE}</span>`)
    spare.setAttribute('aria-label', `Buy a spare key for ${KEY_PRICE} coins`)
    spare.onclick = () => buyKey()
    m.root.append(tray, spare)
    if (want === 'key') {
      spare.classList.add('glow')
      hintAt('A spare key', [96, 470])
      setBar({ label: 'Back to the Railing', act: () => toFence() })
      return
    }
    if (rail.pocket.locks > 0) workbench()
    else {
      tray.classList.add('glow')
      hintAt('Pick a lock', [104, 250])
      setBar({ label: 'Back to the Railing', act: () => toFence() })
    }
  }
  const pay = (n: number, reason: string) => g.spend(n, reason)
  const buyLock = () => {
    if (big) return
    if (!pay(LOCK_PRICE, 'lovelock')) return
    sfx.register()
    rail.pocket.locks++
    if (!online()) (local().locks++, persist())
    renderTop()
    workbench(true)
  }
  const buyKey = () => {
    if (!pay(KEY_PRICE, 'lockkey')) return
    sfx.register()
    rail.pocket.keys++
    if (!online()) (local().keys++, persist())
    renderTop()
    shout(m, 'Spare key!', [96, 430])
    m.later(() => toFence(), 700)
  }

  /** the lock on the newspaper: colour, shape, paint, initials */
  const workbench = (fromTray = false) => {
    hintAt('', [0, 0])
    m.root.querySelector('.ll-tray')?.classList.remove('glow')
    big?.remove()
    big = el('div', 'll-lock big ll-standonly' + (fromTray ? ' arrive' : ''))
    const [bx, by] = bigBox()
    big.style.cssText = `left:${bx}px;top:${by}px;width:${BIG}px`
    m.root.append(big)
    refreshBig()

    // enamel chips (left of the lock) and the three shapes under them
    const chips = el('div', 'll-chips ll-standonly')
    BODIES.forEach(([c], i) => {
      const b = el('button', 'll-chip-c' + (draft.body === i ? ' on' : ''))
      b.style.setProperty('--c', c)
      b.setAttribute('aria-label', `Lock colour ${i + 1}`)
      b.onclick = () => {
        draft.body = i
        chips.querySelectorAll('.ll-chip-c').forEach((x, j) => x.classList.toggle('on', j === i))
        sfx.tick()
        refreshBig()
      }
      chips.append(b)
    })
    const shapes = el('div', 'll-shapes ll-standonly')
    for (const sh of Object.keys(SHAPES) as Shape[]) {
      const b = el('button', 'll-shape' + (draft.shape === sh ? ' on' : ''), `<svg viewBox="0 40 100 80"><path d="${SHAPES[sh]}"/></svg>`)
      b.setAttribute('aria-label', `${sh} lock`)
      b.onclick = () => {
        draft.shape = sh
        shapes.querySelectorAll('.ll-shape').forEach((x) => x.classList.toggle('on', x === b))
        sfx.tick()
        refreshBig()
      }
      shapes.append(b)
    }
    // initials: stamped into the lock
    const ini = document.createElement('input')
    ini.className = 'll-initials ll-standonly'
    ini.maxLength = 4
    ini.placeholder = 'A+B'
    ini.value = draft.initials
    ini.setAttribute('aria-label', 'Initials on your lock')
    ini.oninput = () => {
      draft.initials = ini.value.replace(/[^\p{L}\p{N}+&♥ ]/gu, '').toUpperCase().slice(0, 4)
      refreshBig()
    }
    ini.onkeydown = (e) => e.stopPropagation()
    // the spray cans, standing on the paper to the right
    const cans = el('div', 'll-cans ll-standonly')
    for (const s of SPRAYS) {
      const c = el('img', 'll-can' + (tool === s.id ? ' up' : '')) as HTMLImageElement
      c.src = `${SP}spray-${s.id}.png`
      c.alt = `${s.id} spray paint`
      c.draggable = false
      c.onclick = (e) => {
        e.stopPropagation()
        pickCan(s.id === tool ? null : s.id)
      }
      cans.append(c)
    }
    const wipe = el('button', 'btn tiny ghost ll-wipe ll-standonly', 'Wipe')
    wipe.onclick = () => {
      paint.getContext('2d')!.clearRect(0, 0, PW, PH)
      draft.paint = null
      used.clear()
      sfx.whoosh()
      refreshBig()
    }
    m.root.append(chips, shapes, ini, cans, wipe)
    setBar({ label: 'Hang It', go: true, act: () => finish() }, { label: 'Back to the Railing', act: () => (pickCan(null), toFence()) })
    if (!draft.paint) m.later(() => !tool && hintAt('Grab a spray can', [790, 372]), 900)
  }

  const pickCan = (id: string | null) => {
    tool = id
    can?.remove()
    can = null
    m.root.querySelectorAll('.ll-can').forEach((c, i) => c.classList.toggle('up', SPRAYS[i].id === id))
    m.root.classList.toggle('spraying', !!id)
    if (!id) return
    hintAt('', [0, 0])
    play('locks.shake') ?? sfx.whoosh()
    can = el('img', 'll-can-hand') as HTMLImageElement
    can.src = `${SP}spray-${id}.png`
    can.alt = ''
    m.root.append(can)
  }

  // spraying: hold the button over the lock; the mist builds up where you linger, and only sticks to the lock
  let spraying = false
  let hiss: (() => void) | null = null
  let sprayAt: Pt = [0, 0]
  let lastDraw = 0
  const toPaint = (p: Pt): Pt => {
    const [bx, by] = bigBox()
    const s = BIG / 100
    return [((p[0] - bx) / s - 10) * 2, ((p[1] - by) / s - 46) * 2]
  }
  const sprayDots = (dt: number) => {
    if (!tool) return
    const ctx = paint.getContext('2d')!
    const color = SPRAYS.find((s) => s.id === tool)!.color
    const [cx, cy] = toPaint(sprayAt)
    ctx.save()
    ctx.setTransform(2, 0, 0, 2, -20, -92)
    ctx.clip(new Path2D(SHAPES[draft.shape]))
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = color
    const n = Math.round(1500 * dt)
    for (let i = 0; i < n; i++) {
      // a soft, round cloud: most of the paint near the middle, a fine speckle at the edge
      const r = Math.abs(gauss()) * 8
      const a = Math.random() * Math.PI * 2
      ctx.globalAlpha = 0.35 + Math.random() * 0.45
      ctx.beginPath()
      ctx.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0.9 + Math.random() * 1.8, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
    used.add(tool)
  }
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.6
  m.root.addEventListener('pointermove', (e) => {
    if (view !== 'stand' || !can) return
    sprayAt = toStage(e)
    // the can's nozzle sits at the pointer, tipped toward the lock
    can.style.transform = `translate(${sprayAt[0] - 6}px, ${sprayAt[1] - 8}px) rotate(-28deg)`
  })
  m.root.addEventListener('pointerdown', (e) => {
    if (view !== 'stand' || !tool || (e.target as Element).closest('button, input, .ll-can')) return
    sprayAt = toStage(e)
    spraying = true
    hiss = play('locks.spray', { seconds: 20 })
    m.root.classList.add('hissing')
  })
  const stopSpray = () => {
    if (!spraying) return
    spraying = false
    hiss?.()
    hiss = null
    m.root.classList.remove('hissing')
    draft.paint = exportPaint()
    refreshBig()
  }
  m.root.addEventListener('pointerup', stopSpray)
  m.root.addEventListener('pointerleave', stopSpray)
  m.frame((dt, t) => {
    if (!spraying) return
    sprayDots(dt)
    // the mist puffs off the nozzle
    if (Math.random() < 0.5) {
      const p = el('i', 'll-mist')
      p.style.cssText = `left:${sprayAt[0]}px;top:${sprayAt[1]}px;--c:${SPRAYS.find((s) => s.id === tool)!.color};--dx:${(Math.random() - 0.5) * 40}px;--dy:${(Math.random() - 0.5) * 40}px`
      m.root.append(p)
      m.later(() => p.remove(), 600)
    }
    if (t - lastDraw > 0.09) {
      lastDraw = t
      draft.paint = paint.toDataURL('image/png')
      refreshBig()
    }
  })
  /** the paint layer, small enough for the railing (webp where the browser can, else png) */
  const exportPaint = () => {
    // spray speckle barely compresses, so the saved copy is half size (it's drawn ~50 px wide on the railing)
    const small = document.createElement('canvas')
    small.width = PW / 2
    small.height = PH / 2
    small.getContext('2d')!.drawImage(paint, 0, 0, PW / 2, PH / 2)
    for (const [type, q] of [['image/webp', 0.8], ['image/webp', 0.6], ['image/webp', 0.4], ['image/png', 1]] as const) {
      const url = small.toDataURL(type, q)
      if (url.startsWith(`data:${type}`) && url.length < 13_500) return url
    }
    return null
  }

  const finish = () => {
    pickCan(null)
    stopSpray()
    draft.paint = used.size ? exportPaint() : null
    big?.remove()
    big = null
    sfx.pop()
    toFence(true)
  }

  // ---------- open on the railing, then fetch everyone's locks ----------
  toFence()
  void loadRailing().then((r) => {
    if (!m.alive) return
    rail = r
    if (view === 'fence' && !holding && keyState === 'none') drawRailing()
    renderTop()
    if (view === 'fence' && !holding && keyState === 'none') fenceBar()
    if (start === 'stand' && view === 'fence' && !holding) toStand()
  })
}

