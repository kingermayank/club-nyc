import type { MiniGame, MiniGameContext } from '../types'
import type { AvatarView } from '../../avatar/render'
import type { Look } from '../../avatar/look'
import { SKINS } from '../../avatar/look'
import { grade, makeOrder, nextStep, priceOf, proteinsOf, type Base, type Build, type Kind, type Order, type Protein } from './orders'
import { snd } from './sound'
import './style.css'

// =============================================================================================
// Layout — logical 1000 × 565 space, measured on game-halal.png with tools/grid.py
// =============================================================================================
const P = 'halal-rush-'
const ART = '/art/games/halal/'
const BG = '/art/rooms/game-halal.jpg'
const O = '#1d2140'
const SVGNS = 'http://www.w3.org/2000/svg'

const ROUND = 150 // seconds of lunch rush
const QUEUE_PATIENCE = 34 // seconds someone will stand in line before giving up

interface Pt { x: number; y: number }

/** avatars render at this unit and get scaled down with distance */
const U0 = 1.25
const HORIZON = 186
const COUNTER_Y = 362 // feet of customers standing at the cart (hidden behind it)
const LANE_Y = 312 // the sidewalk lane people walk along, just in front of the trash can
const unitAt = (y: number) => Math.max(0.3, ((y - HORIZON) * 1.21) / (COUNTER_Y - HORIZON))
const SPOTS = [296, 516, 736]
const QUEUE: Pt[] = [
  { x: 882, y: 312 },
  { x: 932, y: 306 },
  { x: 980, y: 301 },
  { x: 1032, y: 297 },
  { x: 1084, y: 293 },
  { x: 1136, y: 290 },
]
const ENTER_X = 1100
const EXIT_X = -90

/** everything in front of the sidewalk: the cart, the stack of containers and the umbrella pole */
const COUNTER_POLY = [
  [0, 565], [0, 331], [5, 327], [6, 290], [8.5, 200], [11.5, 110], [14, 40], [14.5, 16], [44, 16], [43.5, 60],
  [41, 150], [38.5, 260], [37.5, 310], [40, 310.5], [50, 307.5], [60, 303.5], [70, 302], [120, 302.5], [180, 305],
  [186, 306.5], [189, 309], [190.5, 323], [200, 324.5], [754, 324.5], [758, 327], [763, 330.5], [767, 333.5],
  [1000, 333.5], [1000, 565],
]
/** outline of the stack of empty foil containers (left) */
const STACK_POLY = [
  [0, 330], [10, 325], [30, 316], [50, 306], [60, 303], [180, 303], [186, 307], [189, 313], [189, 358], [183, 366],
  [176, 375], [160, 398], [140, 425], [131, 437], [122, 441], [20, 441], [8, 435], [0, 426],
]
const poly = (pts: number[][], dx = 0, dy = 0) => `polygon(${pts.map(([x, y]) => `${x - dx}px ${y - dy}px`).join(',')})`

type Food = 'rice' | Protein | 'salad'
type Sauce = 'white' | 'red'
type Station = 'container' | 'pita' | Food | Sauce | 'trash'
type Mood = 'smile' | 'grin' | 'o' | 'grumpy'

/** the five steam-table trays, left → right (inner opening centers) */
const TRAYS: { id: Food; x: number; name: string; key: string; color: string; steam: boolean }[] = [
  { id: 'rice', x: 264, name: 'Yellow rice', key: '1', color: '#f2c531', steam: true },
  { id: 'chicken', x: 396, name: 'Chicken', key: '2', color: '#d98a4a', steam: true },
  { id: 'lamb', x: 527, name: 'Lamb', key: '3', color: '#7a4a33', steam: true },
  { id: 'falafel', x: 657, name: 'Falafel', key: '4', color: '#a8702c', steam: false },
  { id: 'salad', x: 781, name: 'Salad', key: '5', color: '#5fb847', steam: false },
]
const TRAY_TOP = 288
const TRAY_BOTTOM = 398
const RIM_Y = 387 // inner front edge of the trays: food is clipped here so it sits *in* the tray
const PILE_W = 106
const PILE_SINK = 9

/** where the order gets assembled (bottom-center of the 220×172 build box) */
const BUILD = { x: 480, y: 528, s: 0.78 }
const BOTTLES: Record<Sauce, { x: number; y: number; h: number }> = {
  white: { x: 650, y: 521, h: 100 },
  red: { x: 718, y: 521, h: 100 },
}
const PITA = { x: 54, y: 501, w: 94 }
const TRASH = { x: 948, y: 558, w: 78 }
const CASH_AT = { x: 80, y: 32 }

const NAT: Record<string, [number, number]> = {
  container: [220, 172], pita: [220, 168], platter: [220, 175], rice: [220, 167], chicken: [220, 179],
  lamb: [220, 177], falafel: [220, 182], salad: [220, 185], 'bottle-white': [95, 220], 'bottle-red': [99, 220],
  'drizzle-white': [178, 220], 'drizzle-red': [172, 220],
}

interface Spot { x: number; y: number; w: number }
interface FoodLayout { rice: Spot; one: Spot; oneS: Spot; a: Spot; b: Spot; aS: Spot; bS: Spot; salad: Spot; sauce: Spot & { r: number } }
/** where each layer sits inside the 220×172 build box */
const LAYOUT: Record<Base, FoodLayout> = {
  platter: {
    rice: { x: 112, y: 68, w: 146 },
    one: { x: 104, y: 62, w: 100 },
    oneS: { x: 92, y: 68, w: 92 },
    a: { x: 86, y: 74, w: 86 },
    b: { x: 128, y: 54, w: 86 },
    aS: { x: 74, y: 78, w: 80 },
    bS: { x: 110, y: 62, w: 80 },
    salad: { x: 156, y: 50, w: 74 },
    sauce: { x: 110, y: 64, w: 44, r: -24 },
  },
  pita: {
    rice: { x: 112, y: 84, w: 120 },
    one: { x: 110, y: 80, w: 94 },
    oneS: { x: 98, y: 86, w: 86 },
    a: { x: 90, y: 88, w: 80 },
    b: { x: 130, y: 72, w: 80 },
    aS: { x: 82, y: 92, w: 76 },
    bS: { x: 118, y: 78, w: 76 },
    salad: { x: 150, y: 68, w: 64 },
    sauce: { x: 112, y: 82, w: 42, r: -22 },
  },
}
/** each squirt is a zigzag across the tray; white and hot alternate along its long axis (like platter.png) */
const SAUCE_SLOTS: Record<Sauce, number[]> = { white: [0, 30, -30], red: [15, -15, 45] }
const AXIS = { x: 0.91, y: -0.41 } // the tray's long axis in the build box

const TUTORIAL_ORDER: Order = { base: 'platter', protein: 'chicken', salad: true, white: 2, red: 1 }

// =============================================================================================
// Little SVG bits drawn in the house style (thick #1d2140 outline, flat fill + one shade)
// =============================================================================================
const KETCHUP_SVG = `<svg class="${P}ketchup" viewBox="0 0 40 80" aria-label="ketchup"><rect x="13" y="3" width="14" height="10" rx="3" fill="#f4f4f8" stroke="${O}" stroke-width="3"/><path d="M15 13 L25 13 L26 26 C34 32 35 40 35 48 L35 70 C35 75 31 78 26 78 L14 78 C9 78 5 75 5 70 L5 48 C5 40 6 32 14 26 Z" fill="#d8312b" stroke="${O}" stroke-width="3" stroke-linejoin="round"/><path d="M28 40 C31 44 31 60 30 70 C29 74 27 76 24 76 L26 76 C31 76 33 73 33 68 L33 48 C33 44 31 41 28 40 Z" fill="#a8221d"/><rect x="8" y="45" width="24" height="19" rx="3" fill="#fffdf2" stroke="${O}" stroke-width="2.2"/><circle cx="20" cy="55" r="5" fill="#e8483f" stroke="${O}" stroke-width="1.6"/><path d="M16.5 50.5 L20 52.5 L23.5 50.5" stroke="#3f9b55" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M10 33 L10 41" stroke="#ff9a90" stroke-width="3" stroke-linecap="round"/></svg>`

const TRASH_SVG = `<svg viewBox="0 0 80 100" aria-hidden="true"><path d="M12 32 L68 32 L63 98 L17 98 Z" fill="#b4bccb"/><path d="M50 32 L68 32 L63 98 L52 98 Z" fill="#8f98ab"/><path d="M14.4 55 L65.6 55 L64.6 70 L15.5 70 Z" fill="#2f8a57"/><path d="M50 55 L65.6 55 L64.6 70 L51 70 Z" fill="#237047"/><path d="M27 40 L27.5 50 M40 40 L40 50 M53 40 L52.5 50 M28.3 76 L28.8 90 M40 76 L40 90 M51.7 76 L51.2 90" stroke="#7a8397" stroke-width="3" stroke-linecap="round"/><path d="M14.4 55 L65.6 55 M15.5 70 L64.6 70" stroke="${O}" stroke-width="2.2"/><path d="M12 32 L68 32 L63 98 L17 98 Z" fill="none" stroke="${O}" stroke-width="3" stroke-linejoin="round"/><rect x="10" y="29" width="60" height="6" rx="2" fill="#2b2f3a" stroke="${O}" stroke-width="2"/><g class="${P}trash-lid"><path d="M6 31 Q40 14 74 31 L74 35 Q40 30 6 35 Z" fill="#7d879b" stroke="${O}" stroke-width="3" stroke-linejoin="round"/><rect x="31" y="15" width="18" height="7" rx="3.5" fill="#5b6377" stroke="${O}" stroke-width="3"/></g><rect x="29" y="93" width="22" height="7" rx="2.5" fill="#e8483f" stroke="${O}" stroke-width="2.4"/></svg>`

const CLOCK_SVG = `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="#fffdf6" stroke="${O}" stroke-width="3"/><circle class="${P}clock-pie" cx="20" cy="20" r="8" fill="none" stroke="#ffcf1f" stroke-width="16" stroke-dasharray="50.27 50.27" transform="rotate(-90 20 20)"/><circle cx="20" cy="20" r="16" fill="none" stroke="${O}" stroke-width="3"/><path d="M20 7 L20 10 M33 20 L30 20 M20 33 L20 30 M7 20 L10 20" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/><circle cx="20" cy="20" r="2.6" fill="${O}"/></svg>`

const HARD_HAT = (fx: number) => {
  const b = fx * 0.5
  return `<path d="M -31 -110 C -32 -134 -16 -145 0 -145 C 16 -145 32 -134 31 -110 Z" fill="#ffcf1f" stroke="${O}" stroke-width="3" stroke-linejoin="round"/><path d="M -6 -144 L 6 -144 L 7 -111 L -7 -111 Z" fill="#f2b705" stroke="${O}" stroke-width="2.2" stroke-linejoin="round"/><path d="M -21 -132 Q -16 -139 -10 -140" fill="none" stroke="#fff6c2" stroke-width="3" stroke-linecap="round"/><path d="M ${-38 + b} -112 Q ${b} -120 ${38 + b} -112 Q ${41 + b} -106 ${35 + b} -105 Q ${b} -112 ${-35 + b} -105 Q ${-41 + b} -106 ${-38 + b} -112 Z" fill="#ffd84a" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>`
}
const VEST_FRONT = `<path d="M -19 -66 C -19 -71 -14 -73 -9 -73 L -6 -73 L -4 -35.5 L -12 -35 C -15 -35 -18 -36 -18 -40 Z" fill="#ff7a1a" stroke="${O}" stroke-width="2.6" stroke-linejoin="round"/><path d="M 19 -66 C 19 -71 14 -73 9 -73 L 6 -73 L 4 -35.5 L 12 -35 C 15 -35 18 -36 18 -40 Z" fill="#ff7a1a" stroke="${O}" stroke-width="2.6" stroke-linejoin="round"/><path d="M -18.7 -56 L -4.7 -56 L -4.5 -51.5 L -18.5 -51.5 Z M 18.7 -56 L 4.7 -56 L 4.5 -51.5 L 18.5 -51.5 Z M -18.3 -46 L -4.3 -46 L -4.2 -41.5 L -18.1 -41.5 Z M 18.3 -46 L 4.3 -46 L 4.2 -41.5 L 18.1 -41.5 Z" fill="#eef2a8" stroke="${O}" stroke-width="1.4"/>`
const VEST_BACK = `<path d="M -19 -66 C -19 -71 -14 -73 -9 -73 L 9 -73 C 14 -73 19 -71 19 -66 L 18 -40 C 18 -36 15 -35 12 -35 L -12 -35 C -15 -35 -18 -36 -18 -40 Z" fill="#ff7a1a" stroke="${O}" stroke-width="2.6"/><path d="M -18.7 -56 L 18.7 -56 L 18.5 -51.5 L -18.5 -51.5 Z M -18.3 -46 L 18.3 -46 L 18.1 -41.5 L -18.1 -41.5 Z" fill="#eef2a8" stroke="${O}" stroke-width="1.4"/>`
const GRUMPY = (fx: number, skin: string) =>
  `<ellipse cx="${fx}" cy="-83.5" rx="8.6" ry="4.8" fill="${skin}"/><path d="M ${-6 + fx} -79.5 Q ${fx} -86.5 ${6 + fx} -79.5" fill="none" stroke="${O}" stroke-width="2.6" stroke-linecap="round"/><path d="M ${-17 + fx} -115.5 L ${-6 + fx} -109.5 M ${17 + fx} -115.5 L ${6 + fx} -109.5" fill="none" stroke="${O}" stroke-width="3.6" stroke-linecap="round"/><g transform="translate(${27 + fx} -129)" fill="none" stroke="#e8323a" stroke-width="2.8" stroke-linecap="round"><path d="M -6.5 -2 Q -2 -2 -2 -6.5 M 2 -6.5 Q 2 -2 6.5 -2 M 6.5 2 Q 2 2 2 6.5 M -2 6.5 Q -2 2 -6.5 2"/></g>`

function svgGroup(markup: string): SVGGElement {
  const g = document.createElementNS(SVGNS, 'g')
  g.setAttribute('class', P + 'deco')
  g.innerHTML = markup
  return g
}

// =============================================================================================
// A customer on the sidewalk: an AvatarView plus walking, depth scaling and costume overlays
// =============================================================================================
class Person {
  wrap: HTMLDivElement
  av: AvatarView
  skin: string
  worker: boolean
  x: number
  y: number
  d: 1 | -1 = -1
  back = false
  mood: Mood = 'smile'
  path: Pt[] = []
  speed = 300
  done: (() => void) | null = null

  constructor(av: AvatarView, look: Look, worker: boolean, x: number, y: number) {
    this.av = av
    this.skin = SKINS[look.skin] ?? SKINS[0]
    this.worker = worker
    this.x = x
    this.y = y
    this.wrap = document.createElement('div')
    this.wrap.className = P + 'cust'
    const shadow = document.createElement('div')
    shadow.className = P + 'shadow'
    const hit = document.createElement('div')
    hit.className = P + 'hit'
    this.wrap.append(shadow, av.el, hit)
    av.face(-1, false)
    this.decorate()
    this.place()
  }

  walk(path: Pt[], speed = 300, done?: () => void) {
    this.path = path.map((p) => ({ ...p }))
    this.speed = speed
    this.done = done ?? null
    if (this.path.length) this.av.setPose('walk')
  }

  turn(d: 1 | -1, back = false) {
    if (d === this.d && back === this.back) return
    this.d = d
    this.back = back
    this.av.face(d, back)
    this.decorate()
  }

  setMood(m: Mood) {
    if (m === this.mood) return
    this.mood = m
    this.av.setMood(m === 'grumpy' ? 'smile' : m)
    this.decorate()
  }

  /** costume bits the avatar library doesn't have (hard hat, hi-vis vest) and the grumpy face */
  decorate() {
    const svg = this.av.el.querySelector('svg')
    if (!svg) return
    svg.querySelectorAll('.' + P + 'deco').forEach((n) => n.remove())
    const head = svg.querySelector('.av-head')
    const upper = svg.querySelector('.av-upper')
    const armL = svg.querySelector('.av-armL')
    const fx = this.back ? 0 : 3 * this.d
    if (this.mood === 'grumpy' && !this.back && head) head.append(svgGroup(GRUMPY(fx, this.skin)))
    if (this.worker) {
      if (upper && armL) upper.insertBefore(svgGroup(this.back ? VEST_BACK : VEST_FRONT), armL)
      if (head) head.append(svgGroup(HARD_HAT(fx)))
    }
  }

  update(dt: number) {
    const tgt = this.path[0]
    if (tgt) {
      const dx = tgt.x - this.x
      const dy = tgt.y - this.y
      const dist = Math.hypot(dx, dy)
      const vertical = Math.abs(dy) > Math.abs(dx)
      const step = this.speed * dt * (vertical ? 0.5 : 1)
      if (!vertical) this.turn(dx < 0 ? -1 : 1, false)
      else this.turn(this.d, dy < 0)
      if (dist <= step) {
        this.x = tgt.x
        this.y = tgt.y
        this.path.shift()
        if (!this.path.length) {
          this.av.setPose('idle')
          const f = this.done
          this.done = null
          f?.()
        }
      } else {
        this.x += (dx / dist) * step
        this.y += (dy / dist) * step
      }
    }
    this.av.update(dt)
    this.place()
  }

  place() {
    const s = unitAt(this.y) / U0
    this.wrap.style.transform = `translate(${this.x.toFixed(1)}px,${this.y.toFixed(1)}px) scale(${s.toFixed(4)})`
    this.wrap.style.zIndex = String(Math.round(this.y))
  }
}

interface Cust {
  kind: Kind
  order: Order
  look: Look
  person: Person
  state: 'enter' | 'queue' | 'toCounter' | 'order' | 'react' | 'leave' | 'gone'
  spot: number
  /** platters still owed (the construction worker wants two) */
  need: number
  patience: number
  patienceMax: number
  waited: number
  bubble: HTMLDivElement | null
  bar: HTMLElement | null
  tutorial: boolean
}

interface BuildState extends Build {
  el: HTMLDivElement
  body: HTMLDivElement
  food: HTMLDivElement
  imgs: Map<Food, HTMLImageElement>
  sauceImgs: HTMLImageElement[]
}

// =============================================================================================
const game: MiniGame = {
  id: 'halal-rush',
  title: 'Halal Rush',
  start(ctx) {
    run(ctx)
  },
}
export default game

function run(ctx: MiniGameContext) {
  const { sfx } = ctx
  let alive = true
  let raf = 0
  let phase: 'intro' | 'play' | 'closing' | 'done' = 'intro'
  let t = 0 // seconds into the rush
  let clock = 0 // seconds since the game opened (drives `after`)
  const timers: { at: number; fn: () => void }[] = []
  const after = (sec: number, fn: () => void) => void timers.push({ at: clock + sec, fn })

  // score
  let cash = 0
  let shownCash = 0
  let tips = 0
  let served = 0
  let perfect = 0
  let sloppy = 0
  let walked = 0
  let combo = 0
  let bestCombo = 0
  let touristsHandled = 0

  // ------------------------------------------------------------------------------------- DOM
  const div = (cls: string, html = '') => {
    const e = document.createElement('div')
    e.className = cls.split(' ').filter(Boolean).map((c) => P + c).join(' ')
    if (html) e.innerHTML = html
    return e
  }
  const img = (name: string, cls = '') => {
    const i = document.createElement('img')
    i.src = ART + name + '.png'
    i.alt = ''
    i.draggable = false
    if (cls) i.className = cls.split(' ').map((c) => P + c).join(' ')
    return i
  }

  ctx.root.innerHTML = ''
  const root = div('game')
  const stage = div('stage')
  const bg = div('bg')
  const street = div('street')
  const fg = div('fg')
  const props = div('props')
  const ui = div('ui')
  const fx = div('fx')
  stage.append(bg, street, fg, props, ui, fx)
  const hud = div('hud')
  const overlay = div('overlay-layer')
  root.append(stage, hud, overlay)
  ctx.root.append(root)
  fg.style.clipPath = poly(COUNTER_POLY)

  // ------------------------------------------------------------------------------- tooltip
  const tip = div('tip')
  ui.append(tip)
  const showTip = (target: HTMLElement, text: string, key: string) => {
    const r = { x: parseFloat(target.style.left) + target.offsetWidth / 2, y: parseFloat(target.style.top) }
    tip.innerHTML = `${text} <kbd>${key}</kbd>`
    tip.style.left = `${r.x}px`
    tip.style.top = `${r.y - 4}px`
    tip.classList.add(P + 'on')
  }
  const hideTip = () => tip.classList.remove(P + 'on')

  // ------------------------------------------------------------------------------ stations
  const stationEls = new Map<Station, HTMLElement>()
  function station(id: Station, name: string, key: string, box: { x: number; y: number; w: number; h: number }, cls: string) {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = `${P}station ${cls.split(' ').map((c) => P + c).join(' ')}`
    b.setAttribute('aria-label', name)
    b.style.left = `${box.x}px`
    b.style.top = `${box.y}px`
    b.style.width = `${box.w}px`
    b.style.height = `${box.h}px`
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      act(id)
    })
    // Enter / Space on a focused station (pointer presses are handled above)
    b.addEventListener('click', (e) => {
      if (e.detail === 0) act(id)
    })
    b.addEventListener('pointerenter', () => showTip(b, name, key))
    b.addEventListener('pointerleave', hideTip)
    props.append(b)
    stationEls.set(id, b)
    return b
  }

  // the stack of containers is painted into the background — a clipped glow copy highlights it
  const stackGlow = div('stackglow', `<div class="${P}stackglow-in"></div>`)
  ;(stackGlow.firstElementChild as HTMLElement).style.clipPath = poly(STACK_POLY)
  const stackBtn = station('container', 'Foil container', 'C', { x: 0, y: 298, w: 192, h: 146 }, 'stack')
  stackBtn.style.clipPath = poly(STACK_POLY, 0, 298)
  props.insertBefore(stackGlow, stackBtn.nextSibling)

  // pitas, piled on the ledge in front of the containers
  const pitaBtn = station('pita', 'Pita', 'P', { x: PITA.x - PITA.w / 2 - 4, y: PITA.y - 98, w: PITA.w + 8, h: 100 }, 'pitas')
  for (let i = 0; i < 3; i++) {
    const p = img('pita', 'pita-one')
    p.style.width = `${PITA.w - i * 3}px`
    p.style.left = `${4 + i * 2.5}px`
    p.style.bottom = `${i * 8}px`
    p.style.rotate = `${[-3, 4, -1][i]}deg`
    pitaBtn.append(p)
  }

  // food piles sitting in the steam-table trays
  const pileImgs = new Map<Food, HTMLImageElement>()
  for (const tr of TRAYS) {
    const b = station(tr.id, tr.name, tr.key, { x: tr.x - 64, y: TRAY_TOP, w: 128, h: TRAY_BOTTOM - TRAY_TOP }, 'tray')
    const glow = div('tray-glow')
    glow.style.top = `${RIM_Y - TRAY_TOP - 40}px`
    const box = div('pilebox')
    box.style.height = `${RIM_Y - TRAY_TOP}px`
    const pile = img(tr.id, 'pile')
    pile.style.width = `${PILE_W}px`
    pile.style.left = `${(128 - PILE_W) / 2}px`
    pile.style.bottom = `${-PILE_SINK}px`
    box.append(pile)
    b.append(glow, box)
    if (tr.steam) for (let i = 0; i < 2; i++) {
      const s = div('steam')
      s.style.left = `${46 + i * 30}px`
      s.style.animationDelay = `${(i * 1.3 + TRAYS.indexOf(tr) * 0.45).toFixed(2)}s`
      b.append(s)
    }
    pileImgs.set(tr.id, pile)
  }

  // squeeze bottles
  const bottleImgs = {} as Record<Sauce, HTMLImageElement>
  for (const s of ['white', 'red'] as Sauce[]) {
    const B = BOTTLES[s]
    const [nw, nh] = NAT['bottle-' + s]
    const w = (B.h * nw) / nh
    const b = station(s, s === 'white' ? 'White sauce' : 'Hot sauce', s === 'white' ? 'W' : 'H', { x: B.x - w / 2 - 6, y: B.y - B.h - 4, w: w + 12, h: B.h + 8 }, `bottle bottle-${s}`)
    const shadow = div('bshadow')
    const im = img('bottle-' + s, 'bottle-img')
    im.style.width = `${w}px`
    b.append(shadow, im)
    bottleImgs[s] = im
  }

  // trash bin
  const trashBtn = station('trash', 'Toss order', 'X', { x: TRASH.x - TRASH.w / 2, y: TRASH.y - (TRASH.w * 100) / 80, w: TRASH.w, h: (TRASH.w * 100) / 80 }, 'trash')
  trashBtn.innerHTML = TRASH_SVG

  // ------------------------------------------------------------------------------------ HUD
  hud.innerHTML = `
    <div class="${P}cash"><i class="${P}coin"></i><div><b class="${P}cash-v">$0</b><small class="${P}served">0 served</small></div></div>
    <div class="${P}combo"></div>
    <div class="${P}clock">${CLOCK_SVG}<b class="${P}clock-v">2:30</b></div>`
  const cashV = hud.querySelector<HTMLElement>(`.${P}cash-v`)!
  const cashBox = hud.querySelector<HTMLElement>(`.${P}cash`)!
  const servedV = hud.querySelector<HTMLElement>(`.${P}served`)!
  const comboEl = hud.querySelector<HTMLElement>(`.${P}combo`)!
  const clockEl = hud.querySelector<HTMLElement>(`.${P}clock`)!
  const clockV = hud.querySelector<HTMLElement>(`.${P}clock-v`)!
  const clockPie = hud.querySelector<SVGCircleElement>(`.${P}clock-pie`)!
  const lineSign = div('line-sign')
  ui.append(lineSign)

  // ------------------------------------------------------------------------------------ fx
  const flyer = (name: string, w: number) => {
    const f = div('fly')
    const im = img(name)
    const [nw, nh] = NAT[name] ?? [100, 100]
    im.style.width = `${w}px`
    im.style.left = `${-w / 2}px`
    im.style.top = `${(-w * nh) / nw / 2}px`
    f.append(im)
    fx.append(f)
    return f
  }
  /** keyframes along a parabola-ish arc between two points */
  const arc = (a: Pt, b: Pt, lift: number, s0: number, s1: number, r0 = 0, r1 = 0, extra = '') => {
    const out: Keyframe[] = []
    const n = 12
    for (let i = 0; i <= n; i++) {
      const k = i / n
      const x = a.x + (b.x - a.x) * k
      const y = a.y + (b.y - a.y) * k - lift * 4 * k * (1 - k)
      out.push({ transform: `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${(r0 + (r1 - r0) * k).toFixed(1)}deg) scale(${(s0 + (s1 - s0) * k).toFixed(3)})${extra}`, offset: k })
    }
    return out
  }
  function floatText(x: number, y: number, text: string, cls = '') {
    const e = div('float ' + cls)
    e.textContent = text
    e.style.left = `${x}px`
    e.style.top = `${y}px`
    fx.append(e)
    e.animate(
      [
        { transform: 'translate(-50%,0) scale(.4)', opacity: 0 },
        { transform: 'translate(-50%,-16px) scale(1.18)', opacity: 1, offset: 0.18 },
        { transform: 'translate(-50%,-26px) scale(1)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%,-50px) scale(.95)', opacity: 0 },
      ],
      { duration: 1400, easing: 'ease-out' },
    ).onfinish = () => e.remove()
  }
  function burst(x: number, y: number, n: number, colors: string[], cls = 'spark', dist = 60, dur = 700) {
    for (let i = 0; i < n; i++) {
      const s = div(cls)
      s.style.left = `${x}px`
      s.style.top = `${y}px`
      s.style.background = colors[i % colors.length]
      fx.append(s)
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6
      const r = dist * (0.6 + Math.random() * 0.6)
      const ex = Math.cos(a) * r
      const ey = Math.sin(a) * r * 0.8 - 10
      s.animate(
        [
          { transform: 'translate(0,0) scale(.2) rotate(0deg)', opacity: 1 },
          { transform: `translate(${ex * 0.8}px,${ey * 0.8}px) scale(1) rotate(120deg)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${ex}px,${ey + 14}px) scale(0) rotate(200deg)`, opacity: 0 },
        ],
        { duration: dur * (0.8 + Math.random() * 0.4), easing: 'cubic-bezier(.2,.7,.3,1)' },
      ).onfinish = () => s.remove()
    }
  }
  /** little bits that hop out and fall (food crumbs, sauce drops) */
  function crumbs(x: number, y: number, n: number, colors: string[], size = 6) {
    for (let i = 0; i < n; i++) {
      const s = div('crumb')
      s.style.left = `${x}px`
      s.style.top = `${y}px`
      s.style.width = s.style.height = `${size * (0.6 + Math.random() * 0.6)}px`
      s.style.background = colors[i % colors.length]
      fx.append(s)
      const vx = (Math.random() - 0.5) * 90
      const up = 18 + Math.random() * 22
      const frames: Keyframe[] = []
      for (let k = 0; k <= 6; k++) {
        const q = k / 6
        frames.push({ transform: `translate(${vx * q}px,${-up * 4 * q * (1 - q) + 16 * q}px)`, opacity: q < 0.75 ? 1 : 0 })
      }
      s.animate(frames, { duration: 420 + Math.random() * 160, easing: 'linear' }).onfinish = () => s.remove()
    }
  }
  function shake(mag = 7) {
    stage.animate(
      [0, -1, 1, -0.7, 0.6, -0.3, 0].map((k, i) => ({ transform: `translate(${k * mag}px,${(i % 2 ? 1 : -1) * Math.abs(k) * mag * 0.35}px)` })),
      { duration: 340, easing: 'ease-out' },
    )
  }
  function nudge(e: Element) {
    e.animate([{ translate: '0 0' }, { translate: '-6px 0' }, { translate: '5px 0' }, { translate: '-3px 0' }, { translate: '0 0' }], { duration: 260 })
  }
  function bump(e: Element, k = 1.22) {
    e.animate([{ scale: '1' }, { scale: `${k}` }, { scale: '1' }], { duration: 260, easing: 'ease-out' })
  }
  const toast = div('toast')
  ui.append(toast)
  let toastAnim: Animation | null = null
  function say(x: number, y: number, text: string) {
    toast.textContent = text
    toast.style.left = `${x}px`
    toast.style.top = `${y}px`
    toastAnim?.cancel()
    toastAnim = toast.animate(
      [
        { opacity: 0, transform: 'translate(-50%,-100%) scale(.6)' },
        { opacity: 1, transform: 'translate(-50%,-100%) scale(1.06)', offset: 0.1 },
        { opacity: 1, transform: 'translate(-50%,-100%) scale(1)', offset: 0.18 },
        { opacity: 1, transform: 'translate(-50%,-100%) scale(1)', offset: 0.8 },
        { opacity: 0, transform: 'translate(-50%,-110%) scale(1)' },
      ],
      { duration: 1500, easing: 'ease-out' },
    )
  }
  function sayAt(id: Station, text: string) {
    const e = stationEls.get(id)
    if (!e) return
    say(parseFloat(e.style.left) + e.offsetWidth / 2, parseFloat(e.style.top) - 6, text)
  }
  function coinsTo(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const c = div('flycoin')
      fx.append(c)
      const a = { x: x + (Math.random() - 0.5) * 30, y: y + (Math.random() - 0.5) * 16 }
      const anim = c.animate(arc(a, CASH_AT, 70 + Math.random() * 40, 1, 0.7), { duration: 620, delay: i * 70, easing: 'cubic-bezier(.45,0,.6,1)', fill: 'backwards' })
      anim.onfinish = () => {
        c.remove()
        if (i === n - 1) bump(cashBox, 1.15)
      }
    }
  }

  // --------------------------------------------------------------------------------- build
  let build: BuildState | null = null
  const isEmpty = (b: BuildState) => !b.rice && !b.proteins.length && !b.salad && !b.white && !b.red
  const restTransform = `translate(${BUILD.x - 110}px,${BUILD.y - 172}px) scale(${BUILD.s})`
  const toRoot = (sx: number, sy: number): Pt => ({ x: BUILD.x + (sx - 110) * BUILD.s, y: BUILD.y + (sy - 172) * BUILD.s })

  function makeBuild(base: Base): BuildState {
    const el = div('build')
    el.style.transform = restTransform
    const body = div('build-body ' + base)
    body.innerHTML = `<div class="${P}build-shadow"></div>${base === 'pita' ? `<div class="${P}foil"></div>` : ''}`
    body.append(img(base === 'platter' ? 'container' : 'pita', 'build-base'))
    const food = div('food')
    body.append(food)
    el.append(body)
    props.append(el)
    return { base, rice: false, proteins: [], salad: false, white: 0, red: 0, el, body, food, imgs: new Map(), sauceImgs: [] }
  }

  function spotFor(b: BuildState, f: Food): Spot {
    const L = LAYOUT[b.base]
    if (f === 'rice') return L.rice
    if (f === 'salad') return L.salad
    const i = b.proteins.indexOf(f)
    if (b.proteins.length <= 1) return b.salad ? L.oneS : L.one
    return i === 0 ? (b.salad ? L.aS : L.a) : b.salad ? L.bS : L.b
  }
  function placeImg(im: HTMLImageElement, name: string, s: Spot) {
    const [nw, nh] = NAT[name]
    const h = (s.w * nh) / nw
    im.style.left = `${s.x - s.w / 2}px`
    im.style.top = `${s.y - h / 2}px`
    im.style.width = `${s.w}px`
  }
  function relayout(b: BuildState) {
    for (const [f, im] of b.imgs) {
      placeImg(im, f, spotFor(b, f))
      im.style.zIndex = f === 'rice' ? '1' : f === 'salad' ? '5' : String(4 - b.proteins.indexOf(f as Protein))
    }
  }

  function grabBase(base: Base) {
    if (build) {
      if (!isEmpty(build)) {
        say(BUILD.x, BUILD.y - 150, 'Serve it or toss it first!')
        nudge(build.el)
        return
      }
      if (build.base === base) {
        nudge(build.el)
        return
      }
      build.el.remove()
      build = null
    }
    const b = makeBuild(base)
    build = b
    const from = base === 'platter' ? { x: 100, y: 340 } : { x: PITA.x, y: PITA.y - 20 }
    const frames = arc(from, { x: BUILD.x, y: BUILD.y }, 110, 0.45, BUILD.s, base === 'platter' ? -25 : 15, 0)
    // the arc helper positions a point; the build box is anchored at its bottom-center
    for (const f of frames) f.transform = (f.transform as string).replace(/translate\(([-\d.]+)px,([-\d.]+)px\)/, (_m, x, y) => `translate(${+x - 110}px,${+y - 172}px)`)
    b.el.animate(frames, { duration: 300, easing: 'cubic-bezier(.3,.2,.4,1)' }).onfinish = () => {
      if (!alive) return
      b.body.animate([{ scale: '1.14 .84' }, { scale: '.95 1.06' }, { scale: '1 1' }], { duration: 240, easing: 'ease-out' })
      crumbs(BUILD.x - 50, BUILD.y - 8, 3, ['#d7dbe6', '#ffffff'], 5)
      crumbs(BUILD.x + 50, BUILD.y - 8, 3, ['#d7dbe6', '#ffffff'], 5)
    }
    if (base === 'platter') snd.clunk()
    else snd.flop()
    root.classList.add(P + 'holding')
    refreshHint()
  }

  function needBase(from: Station) {
    sayAt(from, 'Grab a container or a pita first!')
    for (const id of ['container', 'pita'] as Station[]) stationEls.get(id)?.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.35) drop-shadow(0 0 6px #fff)' }, { filter: 'brightness(1)' }], { duration: 700 })
    sfx.click()
  }

  function addFood(f: Food) {
    const b = build
    if (!b) return needBase(f)
    if (f === 'rice' ? b.rice : f === 'salad' ? b.salad : b.proteins.includes(f)) {
      sayAt(f, f === 'rice' ? 'Already got rice!' : f === 'salad' ? 'Already got salad!' : `Already got ${f}!`)
      nudge(b.el)
      return
    }
    if (f !== 'rice' && f !== 'salad' && b.proteins.length >= 2) {
      sayAt(f, "That's plenty of meat!")
      nudge(b.el)
      return
    }
    if (f === 'rice') b.rice = true
    else if (f === 'salad') b.salad = true
    else b.proteins.push(f)
    const layer = img(f, 'layer')
    layer.style.visibility = 'hidden'
    b.food.append(layer)
    b.imgs.set(f, layer)
    relayout(b)
    // a scoop flies from the tray into the build
    const tr = TRAYS.find((x) => x.id === f)!
    const s = spotFor(b, f)
    const to = toRoot(s.x, s.y)
    const fl = flyer(f, 62)
    const pile = pileImgs.get(f)!
    pile.animate([{ scale: '1 1' }, { scale: '1.06 .9' }, { scale: '1 1' }], { duration: 220, easing: 'ease-out' })
    fl.animate(arc({ x: tr.x, y: 350 }, to, 70, 0.8, (s.w * BUILD.s) / 62, -20, 0), { duration: 260, easing: 'cubic-bezier(.35,.1,.5,1)', fill: 'forwards' }).onfinish = () => fl.remove()
    // the landing runs on the game clock so game state never waits on an animation event
    after(0.26, () => {
      if (build !== b || layer.style.visibility !== 'hidden') return
      layer.style.visibility = ''
      layer.animate([{ scale: '1.25 .7' }, { scale: '.9 1.12' }, { scale: '1 1' }], { duration: 260, easing: 'ease-out' })
      crumbs(to.x, to.y + 6, 5, [tr.color, tr.color, '#ffffff'], 6)
      snd.scoop()
    })
    sfx.pop()
    refreshHint()
  }

  const bottleAnims: Partial<Record<Sauce, Animation>> = {}
  /** the bottle hops over the build, squeezes, and hops back. Returns ms until the sauce hits. */
  function bottleFlight(color: Sauce, at: Pt): number {
    const im = bottleImgs[color]
    const B = BOTTLES[color]
    const prev = bottleAnims[color]
    const ct = Number(prev?.currentTime ?? 0)
    const hovering = !!prev && prev.playState === 'running' && ct > 150 && ct < 560
    prev?.cancel()
    // hover so the upside-down nozzle sits just above where the sauce lands
    const tx = at.x - 22
    const ty = at.y - 66
    const dx = tx - B.x
    const dy = ty - (B.y - B.h / 2)
    const hold = (r: number, ox: number, oy: number) => `translate(${dx + ox}px,${dy + oy}px) rotate(${r}deg)`
    const rest = 'translate(0px,0px) rotate(0deg)'
    const frames: Keyframe[] = hovering
      ? [{ transform: hold(152, 0, 0) }, { transform: hold(160, 30, 10), offset: 0.45 }, { transform: hold(150, 8, 4), offset: 0.7 }, { transform: rest }]
      : [{ transform: rest }, { transform: hold(152, -18, -6), offset: 0.3 }, { transform: hold(160, 30, 10), offset: 0.6 }, { transform: hold(150, 8, 4), offset: 0.78 }, { transform: rest }]
    bottleAnims[color] = im.animate(frames, { duration: hovering ? 430 : 640, easing: 'ease-in-out' })
    return hovering ? 20 : 200
  }

  function squirt(color: Sauce) {
    const b = build
    if (!b) return needBase(color)
    const n = color === 'white' ? b.white : b.red
    if (n >= 3) {
      sayAt(color, "That's plenty!")
      nudge(bottleImgs[color])
      return
    }
    if (color === 'white') b.white++
    else b.red++
    const L = LAYOUT[b.base].sauce
    const name = 'drizzle-' + color
    const layer = img(name, 'layer sauce-layer')
    const u = (SAUCE_SLOTS[color][n] ?? 0) + (Math.random() - 0.5) * 5
    const v = (Math.random() - 0.5) * 8
    const sx = L.x + u * AXIS.x - v * AXIS.y
    const sy = L.y + u * AXIS.y + v * AXIS.x
    placeImg(layer, name, { x: sx, y: sy, w: L.w * (0.92 + Math.random() * 0.14) })
    layer.style.transform = `rotate(${L.r + (Math.random() - 0.5) * 14}deg)`
    layer.style.zIndex = String(10 + b.sauceImgs.length)
    b.food.append(layer)
    b.sauceImgs.push(layer)
    const at = toRoot(sx, sy)
    const delay = bottleFlight(color, at)
    layer.animate([{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }], { duration: 240, delay, fill: 'backwards', easing: 'ease-out' })
    after(delay / 1000, () => {
      if (build !== b) return
      snd.squirt(color === 'red' ? 1.25 : 1)
      crumbs(at.x, at.y, 4, color === 'white' ? ['#ffffff', '#f3efe2'] : ['#e8352b', '#c22a22'], 5)
    })
    refreshHint()
  }

  function toss() {
    const b = build
    if (!b) {
      sayAt('trash', 'Nothing to toss!')
      return
    }
    build = null
    root.classList.remove(P + 'holding')
    const from = { x: BUILD.x, y: BUILD.y }
    const to = { x: TRASH.x, y: TRASH.y - 86 }
    const frames = arc(from, to, 120, BUILD.s, 0.3, 0, 200)
    for (const f of frames) f.transform = (f.transform as string).replace(/translate\(([-\d.]+)px,([-\d.]+)px\)/, (_m, x, y) => `translate(${+x - 110}px,${+y - 172}px)`)
    b.el.animate(frames, { duration: 380, easing: 'cubic-bezier(.4,.1,.6,1)', fill: 'forwards' }).onfinish = () => b.el.remove()
    trashBtn.classList.add(P + 'open')
    after(0.6, () => trashBtn.classList.remove(P + 'open'))
    after(0.34, () => {
      snd.trash()
      crumbs(TRASH.x, TRASH.y - 90, 6, ['#f2c531', '#d98a4a', '#ffffff', '#5fb847'], 6)
      nudge(trashBtn)
    })
    if (combo > 0) say(TRASH.x - 40, TRASH.y - 110, 'Tossed!')
    refreshHint()
  }

  function act(s: Station) {
    if (phase !== 'play') return
    switch (s) {
      case 'container':
        return grabBase('platter')
      case 'pita':
        return grabBase('pita')
      case 'white':
      case 'red':
        return squirt(s)
      case 'trash':
        return toss()
      default:
        return addFood(s)
    }
  }

  // ----------------------------------------------------------------------------- customers
  const customers: Cust[] = []
  const spots: (Cust | null)[] = SPOTS.map(() => null)
  const queue: Cust[] = []
  let spawned = 0
  let touristsSpawned = 0
  let workersSpawned = 0
  let nextSpawn = 0.6
  let tutorial: Cust | null = null

  function lookFor(kind: Kind): Look {
    const base = ctx.randomLook()
    const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
    if (kind === 'tourist') {
      return { ...base, items: { body: 'iloveny-tee', legs: 'shorts', feet: 'slides', head: pick(['foam-crown', 'bucket-hat', 'nyc-cap']), neck: 'camera', hand: 'snow-globe' } }
    }
    if (kind === 'worker') {
      return { ...base, hair: pick(['buzz', 'short'] as const), items: { body: pick(['tee-blue', 'denim-jacket', 'tee-green']), legs: pick(['jeans', 'cargo']), feet: 'boots' } }
    }
    return base
  }

  function pickKind(): Kind {
    if (spawned === 0) return 'normal'
    const touristHere = customers.some((c) => c.kind === 'tourist' && c.state !== 'gone')
    if (t > 22 && touristsSpawned < 2 && !touristHere && (Math.random() < 0.08 || (touristsSpawned === 0 && t > 68))) return 'tourist'
    const workerHere = customers.some((c) => c.kind === 'worker' && c.state !== 'gone')
    if (t > 32 && workersSpawned < 2 && !workerHere && (Math.random() < 0.09 || (workersSpawned === 0 && t > 88))) return 'worker'
    if (Math.random() < 0.1) return 'extra'
    return 'normal'
  }

  function spawn() {
    if (queue.length >= QUEUE.length) return
    const kind = pickKind()
    const first = spawned === 0
    spawned++
    if (kind === 'tourist') touristsSpawned++
    if (kind === 'worker') workersSpawned++
    const order = first ? { ...TUTORIAL_ORDER } : makeOrder(t / ROUND, kind)
    const look = lookFor(kind)
    const slot = QUEUE[queue.length]
    const person = new Person(ctx.avatar(look, U0), look, kind === 'worker', ENTER_X, slot.y)
    street.append(person.wrap)
    const c: Cust = {
      kind, order, look, person, state: 'enter', spot: -1, need: kind === 'worker' ? 2 : 1,
      patience: 1, patienceMax: 1, waited: 0, bubble: null, bar: null, tutorial: first,
    }
    if (first) tutorial = c
    person.wrap.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      serve(c)
    })
    customers.push(c)
    queue.push(c)
    updateQueue()
  }

  function updateQueue() {
    // the head of the line steps up to the nearest free spot
    for (let s = SPOTS.length - 1; s >= 0 && queue.length; s--) {
      if (spots[s] || phase !== 'play') continue
      const c = queue.shift()!
      toCounter(c, s)
    }
    queue.forEach((c, i) => {
      const q = QUEUE[Math.min(i, QUEUE.length - 1)]
      c.person.walk([q], 280, () => {
        if (c.state === 'enter' || c.state === 'queue') {
          c.state = 'queue'
          c.person.turn(-1, false)
        }
      })
    })
    const hidden = queue.filter((_c, i) => QUEUE[Math.min(i, QUEUE.length - 1)].x > 1000).length
    lineSign.textContent = hidden ? `+${hidden} more in line` : ''
    lineSign.classList.toggle(P + 'on', hidden > 0)
  }

  function toCounter(c: Cust, s: number) {
    spots[s] = c
    c.spot = s
    c.state = 'toCounter'
    c.person.walk([{ x: SPOTS[s], y: LANE_Y }, { x: SPOTS[s], y: COUNTER_Y }], 330, () => arrive(c))
  }

  function patienceFor(c: Cust) {
    if (c.tutorial) return 80
    if (c.kind === 'tourist') return 11
    const p = t / ROUND
    const base = 32 - 12 * p
    return c.kind === 'worker' ? base * 1.7 : base
  }

  function headTop(c: Cust) {
    const hat = c.look.items.head || c.kind === 'worker'
    return COUNTER_Y - unitAt(COUNTER_Y) * (hat ? 158 : c.look.hair === 'bun' ? 154 : 146)
  }

  function arrive(c: Cust) {
    if (phase !== 'play') return
    c.state = 'order'
    c.patience = c.patienceMax = patienceFor(c)
    c.person.turn(SPOTS[c.spot] < 500 ? 1 : -1, false)
    c.person.wrap.classList.add(P + 'ready')
    showOrder(c)
    sfx.pop()
    refreshHint()
  }

  const baseIcon = (b: Base) =>
    b === 'platter'
      ? `<span class="${P}ib ${P}ib-platter" title="Rice platter"><img src="${ART}container.png" alt=""><img src="${ART}rice.png" alt="rice platter"></span>`
      : `<span class="${P}ib ${P}ib-pita" title="Pita"><img src="${ART}pita.png" alt="pita"></span>`

  function orderHTML(c: Cust) {
    const o = c.order
    const lines: string[] = []
    const say = c.kind === 'extra' ? 'Extra extra white sauce please!' : c.kind === 'worker' ? (c.need > 1 ? 'Two platters for the crew!' : 'One more for the crew!') : c.kind === 'tourist' ? 'Ketchup on it, please!' : ''
    if (say) lines.push(`<div class="${P}said">${say}</div>`)
    if (c.kind === 'tourist') {
      lines.push(`<div class="${P}row">${baseIcon('platter')}<span class="${P}plus">+</span>${KETCHUP_SVG}</div>`)
    } else {
      const prot = proteinsOf(o.protein).map((p) => `<img class="${P}ip ${P}ip-${p}" src="${ART}${p}.png" alt="${p}">`).join('')
      lines.push(
        `<div class="${P}row">${baseIcon(o.base)}<span class="${P}prot${o.protein === 'combo' ? ' ' + P + 'combo2' : ''}">${prot}</span>${o.salad ? `<img class="${P}ip ${P}ip-salad" src="${ART}salad.png" alt="salad">` : ''}</div>`,
      )
      const sauces: string[] = []
      if (o.white) sauces.push(`<span class="${P}sc"><img src="${ART}bottle-white.png" alt="white sauce"><b>×${o.white}</b></span>`)
      if (o.red) sauces.push(`<span class="${P}sc ${P}sc-hot"><img src="${ART}bottle-red.png" alt="hot sauce"><b>×${o.red}</b></span>`)
      if (sauces.length) lines.push(`<div class="${P}row ${P}sauces">${sauces.join('')}</div>`)
    }
    lines.push(`<div class="${P}pbar"><i></i></div>`)
    if (c.kind === 'worker') lines.push(`<div class="${P}badge">×${c.need}</div>`)
    return lines.join('')
  }

  function placeBubble(c: Cust, b: HTMLElement) {
    b.style.left = `${SPOTS[c.spot]}px`
    b.style.top = `${headTop(c) - 4}px`
  }

  function dropBubble(c: Cust) {
    const b = c.bubble
    c.bubble = null
    c.bar = null
    if (!b) return
    // a bubble on its way out is no longer an order you can click
    b.classList.remove(P + 'order', P + 'urgent')
    b.style.pointerEvents = 'none'
    b.animate([{ scale: '1', opacity: 1 }, { scale: '.6', opacity: 0 }], { duration: 180, easing: 'ease-in', fill: 'forwards' }).onfinish = () => b.remove()
  }

  function showOrder(c: Cust) {
    dropBubble(c)
    const b = div('bubble order')
    b.innerHTML = orderHTML(c)
    placeBubble(c, b)
    b.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      serve(c)
    })
    ui.append(b)
    c.bubble = b
    c.bar = b.querySelector(`.${P}pbar i`)
    b.animate([{ scale: '.3', opacity: 0 }, { scale: '1.08', opacity: 1, offset: 0.6 }, { scale: '1', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.2,.9,.3,1.2)' })
  }

  function speak(c: Cust, text: string, tone: 'good' | 'meh' | 'bad' | 'huh' | 'bad small') {
    dropBubble(c)
    const b = div(`bubble talk ${tone}`)
    b.innerHTML = `<span>${text}</span>`
    if (c.spot >= 0) placeBubble(c, b)
    else {
      b.style.left = `${c.person.x}px`
      b.style.top = `${c.person.y - unitAt(c.person.y) * 150}px`
    }
    ui.append(b)
    c.bubble = b
    b.animate([{ scale: '.3', opacity: 0 }, { scale: '1.1', opacity: 1, offset: 0.6 }, { scale: '1', opacity: 1 }], { duration: 280, easing: 'cubic-bezier(.2,.9,.3,1.2)' })
  }

  function leave(c: Cust, delay: number) {
    after(delay, () => {
      if (c.state === 'gone' || c.state === 'leave') return
      c.state = 'leave'
      c.person.wrap.classList.remove(P + 'ready')
      dropBubble(c)
      if (c.spot >= 0 && spots[c.spot] === c) spots[c.spot] = null
      const x = c.person.x
      c.spot = -1
      c.person.av.setPose('walk')
      c.person.walk([{ x, y: LANE_Y + 3 }, { x: EXIT_X, y: LANE_Y + 3 }], 320, () => gone(c))
      if (phase === 'play') updateQueue()
    })
  }

  function gone(c: Cust) {
    c.state = 'gone'
    c.person.wrap.remove()
    const i = customers.indexOf(c)
    if (i >= 0) customers.splice(i, 1)
  }

  /** a dissatisfied customer leaves the counter */
  function storm(c: Cust, text: string) {
    c.state = 'react'
    c.person.setMood('grumpy')
    c.person.av.setPose('idle')
    c.person.wrap.classList.remove(P + 'ready')
    speak(c, text, 'bad')
    leave(c, 1.2)
  }

  function breakCombo() {
    combo = 0
    comboEl.classList.remove(P + 'on')
  }

  function earn(amount: number, tipAmt: number, x: number, y: number) {
    cash += amount + tipAmt
    tips += tipAmt
    if (amount + tipAmt > 0) {
      floatText(x, y, `+$${amount + tipAmt}`, 'money')
      if (tipAmt > 0) after(0.18, () => floatText(x, y + 26, `incl. $${tipAmt} tip`, 'tipline'))
      coinsTo(x, y + 10, Math.min(6, 2 + Math.floor((amount + tipAmt) / 4)))
      after(0.5, () => sfx.coin())
    }
  }

  function serve(c: Cust) {
    if (phase !== 'play' || c.state !== 'order') return
    const b = build
    const x = SPOTS[c.spot]
    if (!b) {
      if (c.kind === 'tourist') return dismissTourist(c)
      say(x, headTop(c) + 20, 'Make their order first!')
      sfx.click()
      return
    }
    build = null
    root.classList.remove(P + 'holding')
    // finish any layer still in the air so what flies over is what was graded
    for (const im of b.imgs.values()) im.style.visibility = ''
    c.state = 'react'
    c.person.wrap.classList.remove(P + 'ready')
    dropBubble(c) // order taken — the reaction bubble pops up when the food lands
    const to = { x, y: COUNTER_Y - 52 }
    const frames = arc({ x: BUILD.x, y: BUILD.y }, to, 90, BUILD.s, 0.5)
    for (const f of frames) f.transform = (f.transform as string).replace(/translate\(([-\d.]+)px,([-\d.]+)px\)/, (_m, px, py) => `translate(${+px - 110}px,${+py - 172}px)`)
    b.el.style.zIndex = '30'
    b.el.animate(frames, { duration: 330, easing: 'cubic-bezier(.35,.1,.45,1)', fill: 'forwards' }).onfinish = () => {
      b.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' }).onfinish = () => b.el.remove()
    }
    after(0.33, () => resolve(c, b))
    sfx.whoosh()
  }

  function resolve(c: Cust, b: BuildState) {
    const x = SPOTS[c.spot]
    const y = headTop(c) + 40
    // money pops up beside the head so it never covers the face
    const mx = x + (c.spot === SPOTS.length - 1 ? -78 : 78)
    const my = headTop(c) + 64
    if (c.tutorial) {
      tutorial = null
      refreshHint()
    }
    if (c.kind === 'tourist') {
      // anything you hand the ketchup tourist is wrong
      breakCombo()
      c.person.setMood('o')
      speak(c, b.red ? "That's NOT ketchup!!" : "...Where's the ketchup?", 'huh')
      if (b.red) burst(x, y - 20, 8, ['#ffffff', '#ffd9d0'], 'puff', 40, 800)
      sfx.squawk()
      leave(c, 1.4)
      return
    }
    const g = grade(c.order, b)
    const price = priceOf(c.order)
    served++
    servedV.textContent = `${served} served`
    if (g.result === 'wrong') {
      breakCombo()
      shake()
      sfx.squawk()
      floatText(mx, my, '$0', 'nopay')
      storm(c, g.note)
      return
    }
    const frac = Math.max(0, c.patience / c.patienceMax)
    const last = c.need <= 1
    if (g.result === 'perfect') {
      perfect++
      combo++
      bestCombo = Math.max(bestCombo, combo)
      const tipAmt = last ? 1 + Math.round(4 * frac) + Math.min(3, Math.floor(combo / 3)) : 0
      earn(price, tipAmt, mx, my)
      burst(x, y - 10, 12, ['#ffd23f', '#ffffff', '#ff8fc8', '#7fe0ff'])
      sfx.register()
      if (combo >= 2) {
        comboEl.textContent = `Combo ×${combo}`
        comboEl.classList.add(P + 'on')
        bump(comboEl, 1.3)
      }
    } else {
      sloppy++
      breakCombo()
      earn(Math.ceil(price / 2), 0, mx, my)
    }
    c.need--
    if (!last) {
      // the construction worker still wants a second platter
      c.person.av.setPose('jump')
      speak(c, g.result === 'perfect' ? 'Nice! One more!' : `${g.note} ...one more!`, g.result === 'perfect' ? 'good' : 'meh')
      after(1.0, () => {
        if (c.state !== 'react' || phase !== 'play') return
        c.state = 'order'
        c.patience = Math.min(c.patienceMax, c.patience + c.patienceMax * 0.45)
        c.person.wrap.classList.add(P + 'ready')
        showOrder(c)
      })
      return
    }
    if (g.result === 'perfect') {
      c.person.setMood('grin')
      c.person.av.setPose('cheer')
      const lines = ['Perfect!', 'Yesss!', 'Bless you!', 'Just like I like it!', 'Best cart in Midtown!', 'Delicious!']
      speak(c, c.kind === 'extra' ? 'SO much sauce. Perfect!' : c.kind === 'worker' ? 'Crew says thanks!' : lines[Math.floor(Math.random() * lines.length)], 'good')
    } else {
      c.person.setMood('o')
      speak(c, g.note, 'meh')
    }
    leave(c, 1.25)
  }

  function dismissTourist(c: Cust) {
    c.state = 'react'
    c.person.wrap.classList.remove(P + 'ready')
    c.person.setMood('o')
    speak(c, 'No ketchup?! ...OK!', 'huh')
    touristsHandled++
    const x = SPOTS[c.spot]
    floatText(x + (c.spot === SPOTS.length - 1 ? -80 : 80), headTop(c) + 66, 'Good call!', 'goodcall')
    burst(x, headTop(c) + 10, 5, ['#ffffff'], 'qmark', 46, 900)
    sfx.quack()
    if (c.tutorial) tutorial = null
    leave(c, 1.2)
  }

  function timeout(c: Cust) {
    if (c.kind === 'tourist') {
      // leaving without ketchup is fine — nothing lost
      c.state = 'react'
      c.person.wrap.classList.remove(P + 'ready')
      c.person.setMood('o')
      speak(c, 'No ketchup? Weird city...', 'huh')
      touristsHandled++
      burst(SPOTS[c.spot], headTop(c) + 10, 4, ['#ffffff'], 'qmark', 40, 900)
      sfx.quack()
      leave(c, 1.2)
      return
    }
    walked++
    breakCombo()
    sfx.toot()
    storm(c, ['Forget it!', 'Too slow!', "I'm getting a hot dog.", 'Ugh, never mind!'][Math.floor(Math.random() * 4)])
  }

  function giveUpInLine(c: Cust) {
    const i = queue.indexOf(c)
    if (i >= 0) queue.splice(i, 1)
    walked++
    c.state = 'leave'
    c.person.setMood('grumpy')
    speak(c, ['This line is crazy!', 'Forget this line!'][Math.floor(Math.random() * 2)], 'bad small')
    after(1.1, () => dropBubble(c))
    c.person.walk([{ x: ENTER_X + 40, y: c.person.y }], 300, () => gone(c))
    updateQueue()
  }

  // ---------------------------------------------------------------------------- tutorial
  const hint = div('hint', `<div class="${P}hint-text"></div><div class="${P}hint-arrow"><svg viewBox="0 0 30 24" aria-hidden="true"><path d="M3 3 L27 3 L15 21 Z" fill="#ffcf1f" stroke="${O}" stroke-width="3" stroke-linejoin="round"/></svg></div>`)
  ui.append(hint)
  const hintText = hint.firstElementChild as HTMLElement
  let hintKey = ''
  let hinted: HTMLElement | null = null
  function refreshHint() {
    const c = tutorial
    let target = ''
    if (c && c.state === 'order' && phase === 'play') target = nextStep(c.order, build)
    const key = `${target}:${build?.white ?? 0}:${build?.red ?? 0}`
    if (key === hintKey) return
    hintKey = key
    hinted?.classList.remove(P + 'pulse')
    hinted = null
    if (!target || !c) {
      hint.classList.remove(P + 'on')
      return
    }
    let x = 0
    let y = 0
    let text = ''
    let side = false
    const tr = TRAYS.find((q) => q.id === target)
    if (target === 'container') [x, y, text] = [96, 298, 'Grab a container']
    else if (target === 'pita') [x, y, text] = [PITA.x, PITA.y - 104, 'Grab a pita']
    else if (tr) [x, y, text] = [tr.x, 318, target === 'rice' ? 'Scoop rice' : `Add ${target}`]
    else if (target === 'white') [x, y, text] = [BOTTLES.white.x, BOTTLES.white.y - BOTTLES.white.h - 6, `White sauce ×${c.order.white - (build?.white ?? 0)}`]
    else if (target === 'red') [x, y, text] = [BOTTLES.red.x, BOTTLES.red.y - BOTTLES.red.h - 6, `Hot sauce ×${c.order.red - (build?.red ?? 0)}`]
    else if (target === 'trash') [x, y, text] = [TRASH.x, TRASH.y - 104, 'Oops! Toss it']
    else if (target === 'serve') {
      // point at the customer from whichever side is clear of the line
      const left = c.spot === SPOTS.length - 1
      ;[x, y, text, side] = [SPOTS[c.spot] + (left ? -48 : 48), 262, 'Click to serve!', true]
      hint.classList.toggle(P + 'from-left', left)
    }
    hintText.textContent = text
    hint.style.left = `${x}px`
    hint.style.top = `${y}px`
    // slide the label (not the arrow) back inside the stage if it would poke out
    const half = hintText.offsetWidth / 2
    const dx = side ? 0 : x + half > 994 ? 994 - x - half : x - half < 6 ? 6 - x + half : 0
    hintText.style.translate = `${dx}px 0`
    hint.classList.toggle(P + 'side', side)
    if (!side) hint.classList.remove(P + 'from-left')
    hint.classList.add(P + 'on')
    const st = stationEls.get(target as Station)
    if (st) {
      st.classList.add(P + 'pulse')
      hinted = st
    }
  }

  // ---------------------------------------------------------------------------- flow
  const intro = div('intro')
  intro.innerHTML = `
    <div class="${P}card">
      <div class="${P}awning"></div>
      <h1 class="${P}title">Halal Rush</h1>
      <p class="${P}sub">Lunch rush at the Halal Bros cart · W 49th St &amp; 5th Ave</p>
      <div class="${P}steps">
        <div class="${P}step"><div class="${P}step-art"><img src="${ART}container.png" alt=""></div><span>Grab</span></div>
        <i class="${P}arr"></i>
        <div class="${P}step"><div class="${P}step-art ${P}duo"><img src="${ART}rice.png" alt=""><img src="${ART}chicken.png" alt=""></div><span>Scoop</span></div>
        <i class="${P}arr"></i>
        <div class="${P}step"><div class="${P}step-art ${P}duo ${P}tall"><img src="${ART}bottle-white.png" alt=""><img src="${ART}bottle-red.png" alt=""></div><span>Squirt</span></div>
        <i class="${P}arr"></i>
        <div class="${P}step"><div class="${P}step-art"><img src="${ART}platter.png" alt=""></div><span>Serve!</span></div>
      </div>
      <p class="${P}how">Build <b>exactly</b> what's in each bubble, then click the customer.<br>Quick service = bigger tips. Some requests are… not on the menu.</p>
      <button type="button" class="btn ${P}go" disabled>Loading…</button>
      <p class="${P}keys"><kbd>C</kbd> container <kbd>P</kbd> pita <kbd>1</kbd>–<kbd>5</kbd> trays <kbd>W</kbd> white <kbd>H</kbd> hot <kbd>X</kbd> toss</p>
    </div>`
  overlay.append(intro)
  const goBtn = intro.querySelector<HTMLButtonElement>(`.${P}go`)!
  goBtn.addEventListener('click', () => begin())

  // preload the art so nothing pops in mid-rush
  const sprites = ['container', 'pita', 'platter', 'rice', 'chicken', 'lamb', 'falafel', 'salad', 'bottle-white', 'bottle-red', 'drizzle-white', 'drizzle-red']
  const ready = Promise.all(
    [BG, ...sprites.map((n) => ART + n + '.png')].map(
      (src) =>
        new Promise<void>((res) => {
          const i = new Image()
          i.onload = () => res()
          i.onerror = () => res()
          i.src = src
        }),
    ),
  )
  const enableGo = () => {
    if (!alive || phase !== 'intro') return
    goBtn.disabled = false
    goBtn.textContent = 'Open the cart!'
  }
  void ready.then(enableGo)
  after(4, enableGo)

  function begin() {
    if (phase !== 'intro' || goBtn.disabled) return
    phase = 'play'
    t = 0
    nextSpawn = 0.7
    intro.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(1.06)' }], { duration: 320, easing: 'ease-in', fill: 'forwards' }).onfinish = () => intro.remove()
    root.classList.add(P + 'playing')
    sfx.ding()
  }

  function closeUp() {
    phase = 'closing'
    snd.bell()
    hint.classList.remove(P + 'on')
    hinted?.classList.remove(P + 'pulse')
    lineSign.classList.remove(P + 'on')
    if (build) {
      const b = build
      build = null
      b.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' }).onfinish = () => b.el.remove()
    }
    root.classList.remove(P + 'holding')
    queue.length = 0
    for (const c of [...customers]) {
      if (c.state === 'gone' || c.state === 'leave') continue
      c.person.setMood('o')
      if (c.spot >= 0 && c.state !== 'toCounter') speak(c, ['Aww, closed?', 'Tomorrow then!', 'Nooo!'][Math.floor(Math.random() * 3)], 'huh')
      c.state = 'react'
      leave(c, 0.6 + Math.random() * 0.6)
    }
    const closed = div('closed')
    closed.innerHTML = `
      <div class="${P}strings"></div>
      <div class="${P}sign">
        <b>CLOSED</b>
        <span>That's lunch! See you tomorrow.</span>
        <div class="${P}tally">
          <div><em>${served}</em><small>served</small></div>
          <div><em>$${tips}</em><small>tips</small></div>
          <div><em class="${P}total">$0</em><small>total</small></div>
        </div>
      </div>`
    overlay.append(closed)
    closed.animate(
      [
        { transform: 'translateY(-110%) rotate(-4deg)' },
        { transform: 'translateY(4%) rotate(2deg)', offset: 0.6 },
        { transform: 'translateY(-1%) rotate(-1deg)', offset: 0.8 },
        { transform: 'translateY(0) rotate(0deg)' },
      ],
      { duration: 900, easing: 'ease-out' },
    )
    const totalEl = closed.querySelector<HTMLElement>(`.${P}total`)!
    let k = 0
    const count = () => {
      if (!alive) return
      k = Math.min(1, k + 0.06)
      totalEl.textContent = `$${Math.round(cash * k)}`
      if (k < 1) after(0.03, count)
      else bump(totalEl, 1.3)
    }
    after(0.8, count)
    after(3.6, finish)
  }

  let ended = false
  function finish() {
    if (ended) return
    ended = true
    phase = 'done'
    const coins = Math.round(cash / 5)
    const lines = [`${served} order${served === 1 ? '' : 's'} served · ${perfect} perfect`, `$${cash} taken in ($${tips} in tips)`]
    if (bestCombo >= 2) lines.push(`Best combo: ${bestCombo}`)
    if (walked) lines.push(`${walked} got tired of waiting`)
    if (touristsHandled) lines.push(`Ketchup requests politely declined: ${touristsHandled}`)
    if (sloppy) lines.push(`${sloppy} sloppy order${sloppy === 1 ? '' : 's'}`)
    ctx.end({ coins, score: served, lines })
  }

  // ---------------------------------------------------------------------------- keys
  const KEYS: Record<string, Station> = {
    c: 'container', p: 'pita', '1': 'rice', '2': 'chicken', '3': 'lamb', '4': 'falafel', '5': 'salad',
    w: 'white', h: 'red', x: 'trash', backspace: 'trash', delete: 'trash',
  }
  function onKey(e: KeyboardEvent) {
    if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
    if (phase === 'intro' && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      begin()
      return
    }
    const s = KEYS[e.key.toLowerCase()]
    if (!s || phase !== 'play') return
    e.preventDefault()
    const el = stationEls.get(s)
    if (el) {
      el.classList.add(P + 'pressed')
      after(0.12, () => el.classList.remove(P + 'pressed'))
    }
    act(s)
  }
  window.addEventListener('keydown', onKey)

  // ---------------------------------------------------------------------------- loop
  let last = performance.now()
  let lastTick = -1
  function frame(now: number) {
    if (!alive) return
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000))
    last = now
    clock += dt
    for (let i = timers.length - 1; i >= 0; i--) {
      if (timers[i].at <= clock) {
        const f = timers[i].fn
        timers.splice(i, 1)
        f()
      }
    }
    if (phase === 'play') {
      t += dt
      // customers arrive faster as the rush builds
      const nobody = !customers.some((c) => c.state !== 'leave' && c.state !== 'gone')
      if (nobody && nextSpawn > t + 1.2) nextSpawn = t + 1.2
      const holdForTutorial = tutorial && spawned >= 1 && t < 15
      if (t >= nextSpawn && t < ROUND - 7 && !holdForTutorial) {
        spawn()
        const p = t / ROUND
        nextSpawn = t + (7.6 - 3.6 * p) * (0.8 + Math.random() * 0.4)
      }
      for (const c of customers) {
        if (c.state === 'order') {
          c.patience -= dt
          const f = Math.max(0, c.patience / c.patienceMax)
          if (c.bar) {
            c.bar.style.width = `${(f * 100).toFixed(1)}%`
            c.bar.style.background = f > 0.5 ? '#4fc27e' : f > 0.25 ? '#ffcf1f' : '#e8483f'
          }
          c.bubble?.classList.toggle(P + 'urgent', f < 0.22)
          if (c.kind !== 'tourist') {
            c.person.setMood(f < 0.3 ? 'o' : 'smile')
            const pose = c.person.av.pose
            if (f < 0.16 && pose === 'idle') c.person.av.setPose('wave')
            else if (f >= 0.16 && pose === 'wave') c.person.av.setPose('idle')
          }
          if (c.patience <= 0) timeout(c)
        } else if (c.state === 'queue' || c.state === 'enter') {
          c.waited += dt
          if (c.waited > QUEUE_PATIENCE * 0.7) c.person.setMood('o')
          if (c.waited > QUEUE_PATIENCE) giveUpInLine(c)
        }
      }
      const left = Math.max(0, ROUND - t)
      const secs = Math.ceil(left)
      clockV.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
      clockPie.setAttribute('stroke-dasharray', `${((left / ROUND) * 50.27).toFixed(2)} 50.27`)
      clockEl.classList.toggle(P + 'late', left <= 10)
      if (left <= 10 && secs !== lastTick && secs > 0) {
        lastTick = secs
        sfx.tick()
        bump(clockEl, 1.12)
      }
      if (t >= ROUND) closeUp()
    }
    for (const c of [...customers]) c.person.update(dt)
    // count the till up smoothly
    if (shownCash !== cash) {
      shownCash = Math.min(cash, shownCash + Math.max(1, Math.ceil((cash - shownCash) * 0.12)))
      cashV.textContent = `$${shownCash}`
    }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  ctx.onExit(() => {
    alive = false
    cancelAnimationFrame(raf)
    window.removeEventListener('keydown', onKey)
    snd.stop()
    timers.length = 0
  })
}
