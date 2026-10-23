import type { MiniGame, MiniGameContext } from '../types'
import type { AvatarView } from '../../avatar/render'
import { save } from '../../state'
import { TOPPINGS, isRuined, makeOrder, verdict, type Order, type Sauce, type ToppingId } from './orders'
import { SliceSound } from './sound'
import './style.css'

// Slice Factory — our Pizzatron 3000. Dough rides the belt toward the oven; sauce it, cheese it and top it
// exactly like the ticket says before it goes in.

const P = 'slice-factory-'
const ART = '/art/games/pizza/'
const COIN = '/art/games/harbor/coin.png'
const BOTTLE_ART: Record<Sauce, string> = { red: '/art/games/halal/bottle-red.png', white: '/art/games/halal/bottle-white.png' }

// ---------- geometry (measured on game-slice.jpg, 1000 × 565 logical px) ----------
const BELT = { top: 258, h: 37, end: 944 }
const SLAT = { gap: 43, vanishX: 474, k: 0.072 }
const BELT_Y = 277 // centre line of a pie riding the belt
const LAND_X = 72 // where the tossed dough lands
const WORK_MAX_X = 872 // past this the pie is in the oven mouth
const OVEN_X = 900 // the oven takes the pie here
const MOUTH = { x: 900, y: 258 }
const BOX = { x: 900, y: 352 }
const CHALK_COINS = { x: 805, y: 62 }
const CALLOUT = { x: 736, y: 162 }

// a pie is drawn top-down and squashed onto the belt
const D = 128
const R = D / 2
const SQ = 0.56
const TOP_SQ = 0.74 // toppings get squashed a little less so they stay readable
const TOSS_T = 0.55

const SHIFT = 30
const MAX_MISTAKES = 5
const TOL = 2 // stray splats of the wrong sauce we forgive

// sauce coverage probes (top-down pie space)
const PROBES: [number, number][] = [[0, 0]]
for (let i = 0; i < 6; i++) PROBES.push([Math.cos((i * Math.PI) / 3) * 20, Math.sin((i * Math.PI) / 3) * 20])
for (let i = 0; i < 10; i++) PROBES.push([Math.cos((i * Math.PI) / 5 + 0.3) * 39, Math.sin((i * Math.PI) / 5 + 0.3) * 39])
const COVER_R = 23
const SAUCE_NEED = 13

interface Rect {
  x: number
  y: number
  w: number
  h: number
}
const BOTTLES: Record<Sauce, { hit: Rect; hl: Rect }> = {
  red: { hit: { x: 8, y: 94, w: 56, h: 120 }, hl: { x: 14, y: 95, w: 46, h: 117 } },
  white: { hit: { x: 64, y: 94, w: 56, h: 120 }, hl: { x: 67, y: 95, w: 46, h: 117 } },
}
const TUB: Rect = { x: 16, y: 312, w: 118, h: 78 }
// frame x0, x1 and inner opening x0, x1 of the six bins
const BIN_X: [number, number, number, number][] = [
  [153, 236, 158, 230],
  [236, 315, 240, 309],
  [315, 394, 320, 388],
  [395, 473, 400, 467],
  [473, 550, 479, 544],
  [550, 637, 556, 629],
]
// the oven's brick front + the steel bracket around the belt, drawn over pies so they slide inside
const OVEN_FRONT: [number, number][] = [
  [858, 150],
  [1000, 150],
  [1000, 345],
  [946, 345],
  [946, 248],
  [871, 236],
  [858, 236],
]
const PITCH: Record<ToppingId, number> = { pepperoni: 1, mushroom: 0.84, pepper: 1.18, sausage: 0.72, olive: 1.32, basil: 1.5 }
const SAUCE_RGB: Record<Sauce, string> = { red: '#d8382f', white: '#f3ead2' }

/** belt speed (px/s) for the n-th order; lunch and dinner rush add a kick */
function beltSpeed(n: number) {
  return Math.min(122, 52 + 2.4 * (n - 1) + (n >= 8 ? 8 : 0) + (n >= 20 ? 8 : 0))
}

type Tool = { kind: 'sauce'; sauce: Sauce } | { kind: 'cheese' } | { kind: 'topping'; id: ToppingId }
const toolKey = (t: Tool | null) => (!t ? '' : t.kind === 'sauce' ? 'sauce-' + t.sauce : t.kind === 'cheese' ? 'cheese' : t.id)

interface Source {
  key: string
  tool: Tool
  hit: Rect
  hl: HTMLDivElement
  art?: HTMLElement
}

interface Pizza {
  order: Order
  el: HTMLDivElement
  bounce: HTMLDivElement
  shadow: HTMLDivElement
  edge: HTMLDivElement
  body: HTMLDivElement
  sauceL: HTMLDivElement
  cheeseL: HTMLDivElement
  topL: HTMLDivElement
  x: number
  y: number
  state: 'toss' | 'belt' | 'oven'
  tossT: number
  covered: Set<number>
  splats: number
  rightSplats: number
  wrongSplats: number
  sauceDone: boolean
  cheese: boolean
  have: Record<ToppingId, number>
  ready: boolean
  ruined: boolean
  boostIn: number
  boosting: boolean
  gone: boolean
}

interface Flyer {
  el: HTMLElement
  t: number
  dur: number
  x0: number
  y0: number
  x1: number
  y1: number
  arc: number
  r0: number
  r1: number
  s0: number
  s1: number
  done?: () => void
}

interface Hint {
  text: string
  dir: 'up' | 'down' | 'left'
  x: number
  y: number
  onPizza?: boolean
}

// ---------- tiny DOM helpers ----------
const cls = (names: string) =>
  names
    .split(' ')
    .filter(Boolean)
    .map((n) => P + n)
    .join(' ')

function div(names: string, parent?: Element | null, html?: string): HTMLDivElement {
  const d = document.createElement('div')
  d.className = cls(names)
  if (html) d.innerHTML = html
  if (parent) parent.append(d)
  return d
}

function sprite(src: string, names: string, parent?: Element | null, width?: number): HTMLImageElement {
  const i = document.createElement('img')
  i.src = src.startsWith('/') ? src : ART + src + '.png'
  i.alt = ''
  i.draggable = false
  i.className = cls(names)
  if (width) i.style.width = width + 'px'
  if (parent) parent.append(i)
  return i
}

const at = (e: HTMLElement, x: number, y: number) => {
  e.style.left = x + 'px'
  e.style.top = y + 'px'
}
const place = (e: HTMLElement, r: Rect) => {
  at(e, r.x, r.y)
  e.style.width = r.w + 'px'
  e.style.height = r.h + 'px'
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const inRect = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h
const centred = (x: number, y: number, extra = '') => `translate(${x}px, ${y}px) translate(-50%, -50%) ${extra}`

const icon = (d: string, color: string) =>
  `<svg viewBox="0 0 24 24" class="${P}ico"><path d="${d}" stroke="#1d2140" stroke-width="7"/><path d="${d}" stroke="${color}" stroke-width="3.6"/></svg>`
const CHECK = icon('M5 12.5l4.5 4.5L19 7', '#45c24e')
const CROSS = icon('M6.5 6.5l11 11M17.5 6.5l-11 11', '#ef4b3f')
const NOTE_ICON = `<svg viewBox="0 0 24 24"><path d="M9 18.5V5.5l10-2v13" fill="none" stroke="#1d2140" stroke-width="2.6" stroke-linejoin="round"/><ellipse cx="6.6" cy="18.6" rx="3.4" ry="2.6" fill="#fff" stroke="#1d2140" stroke-width="2.2"/><ellipse cx="16.6" cy="16.6" rx="3.4" ry="2.6" fill="#fff" stroke="#1d2140" stroke-width="2.2"/></svg>`

// ---------- the order ticket clipped to the rail ----------
class Ticket {
  readonly el: HTMLDivElement
  private row: HTMLDivElement
  private stamp: HTMLDivElement
  private order: Order
  private cells = new Map<string, { cell: HTMLDivElement; lab: HTMLDivElement; html: string; state: string }>()

  constructor(parent: HTMLElement, order: Order) {
    this.order = order
    const el = div('ticket' + (order.dessert ? ' ticket-sweet' : ''), parent)
    el.innerHTML = `<i class="${P}tclip" style="left:24px"></i><i class="${P}tclip" style="right:24px"></i><div class="${P}thead"><b>#${order.n}</b><span>${order.name}</span></div>`
    this.row = div('cells', el)
    this.stamp = div('stamp', el)
    this.el = el
    this.addCell('sauce', 'sauce-' + order.sauce)
    this.addCell('cheese', 'cheese')
    for (const t of TOPPINGS) if (order.toppings[t.id]) this.addCell(t.id, t.id)
    el.animate(
      [
        { transform: 'translateY(-120px) rotate(-8deg)' },
        { transform: 'translateY(6px) rotate(2deg)', offset: 0.6 },
        { transform: 'translateY(-2px) rotate(-1deg)', offset: 0.8 },
        { transform: 'none' },
      ],
      { duration: 480, easing: 'ease-out' },
    )
  }

  private addCell(key: string, art: string, extra = false) {
    const cell = div('cell' + (extra ? ' cell-extra' : ''), this.row)
    const ic = div('cell-ic', cell)
    const img = sprite(art, `ing ing-${art}`, ic)
    if (art === 'cheese') img.style.setProperty('--h', '40deg')
    const lab = div('cell-lab', cell)
    this.cells.set(key, { cell, lab, html: '', state: '' })
    if (extra) cell.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.2)' }, { transform: 'none' }], { duration: 260 })
  }

  private set(key: string, state: '' | 'ok' | 'bad', html: string, bump = true) {
    const c = this.cells.get(key)
    if (!c || (c.html === html && c.state === state)) return
    const first = c.html === ''
    c.html = html
    c.lab.innerHTML = html
    if (c.state !== state) {
      c.cell.classList.toggle(P + 'ok', state === 'ok')
      c.cell.classList.toggle(P + 'bad', state === 'bad')
      c.state = state
    }
    if (bump && !first)
      c.cell.animate([{ transform: 'scale(1.3)' }, { transform: 'scale(0.94)', offset: 0.6 }, { transform: 'none' }], {
        duration: 260,
        easing: 'ease-out',
      })
  }

  update(p: Pizza) {
    const o = this.order
    if (p.wrongSplats > TOL) this.set('sauce', 'bad', CROSS)
    else if (p.sauceDone) this.set('sauce', 'ok', CHECK)
    else {
      const pct = Math.round((p.covered.size / SAUCE_NEED) * 100)
      this.set('sauce', '', `<i class="${P}bar ${P}bar-${o.sauce}"><i style="width:${pct}%"></i></i>`, false)
    }
    this.set('cheese', p.cheese ? 'ok' : '', p.cheese ? CHECK : `<i class="${P}tick"></i>`)
    for (const t of TOPPINGS) {
      const need = o.toppings[t.id] ?? 0
      const have = p.have[t.id]
      if (!need) {
        if (!have) continue
        if (!this.cells.has(t.id)) this.addCell(t.id, t.id, true)
        this.set(t.id, 'bad', `+${have}`)
      } else if (have > need) this.set(t.id, 'bad', `+${have - need}`)
      else if (have === need) this.set(t.id, 'ok', CHECK)
      else this.set(t.id, '', `×${need - have}`)
    }
  }

  stampIt(kind: 'ready' | 'oops') {
    this.stamp.textContent = kind === 'ready' ? 'READY!' : 'OOPS!'
    this.stamp.className = cls('stamp ' + kind)
    this.stamp.animate(
      [
        { transform: 'rotate(-14deg) scale(2.6)', opacity: 0 },
        { transform: 'rotate(-14deg) scale(0.9)', opacity: 1, offset: 0.7 },
        { transform: 'rotate(-14deg) scale(1)', opacity: 1 },
      ],
      { duration: 260, easing: 'ease-in' },
    )
  }

  tear() {
    const el = this.el
    el.animate(
      [
        { transform: 'none', opacity: 1 },
        { transform: 'translate(10px, 14px) rotate(6deg)', opacity: 1, offset: 0.25 },
        { transform: 'translate(40px, 170px) rotate(28deg)', opacity: 0 },
      ],
      { duration: 650, easing: 'ease-in', fill: 'forwards' },
    ).onfinish = () => el.remove()
  }
}

// ---------- the game ----------
class SliceFactory {
  private ctx: MiniGameContext
  private snd: SliceSound
  private scene!: HTMLDivElement
  private world!: HTMLDivElement
  private wall!: HTMLDivElement
  private pizzas!: HTMLDivElement
  private counter!: HTMLDivElement
  private fx!: HTMLDivElement
  private held!: HTMLDivElement
  private hintEl!: HTMLDivElement
  private hintText!: HTMLDivElement
  private musicBtn!: HTMLButtonElement
  private tubLabel!: HTMLDivElement
  private chalkMade!: HTMLElement
  private chalkCoins!: HTMLElement
  private marks: HTMLElement[] = []
  private slats: HTMLDivElement[] = []
  private tapes: HTMLDivElement[] = []
  private sources: Source[] = []
  private hovered: Source | null = null
  private ticket: Ticket | null = null
  private avatars: AvatarView[] = []

  private raf = 0
  private lastNow = 0
  private t = 0
  private paused = false
  private exited = false
  private phase: 'intro' | 'play' | 'ending' | 'over' = 'intro'
  private speed = 24
  private beltPos = 0
  private orderNo = 0
  private resolved = 0
  private pizza: Pizza | null = null
  private leaving: Pizza[] = []
  private flyers: Flyer[] = []
  private timers: { at: number; fn: () => void }[] = []
  private tool: Tool | null = null
  private ptr = { x: -100, y: -100, sx: 0, sy: 0, down: false, moved: false, inside: false, src: null as Source | null }
  private squirting = false
  private lastSplat = { u: 0, v: 0, t: -9 }
  private lastDrip = 0
  private status: HTMLElement | null = null
  private hint: Hint | null = null
  private hintKey = ''
  private hintW = 0

  private made = 0
  private shownMade = 0
  private mistakes = 0
  private coins = 0
  private combo = 0
  private bestCombo = 0
  private dessertAt = 13 + Math.floor(Math.random() * 4)
  private dessert = false
  private dessertMade = 0
  /** eases the belt after burnt pies so a rough patch doesn't end the shift in one go */
  private mercy = 1

  constructor(ctx: MiniGameContext) {
    this.ctx = ctx
    this.snd = new SliceSound(!save.muted)
  }

  boot() {
    this.preload()
    this.build()
    this.showIntro()
    window.addEventListener('pointermove', this.onMove)
    window.addEventListener('pointerup', this.onUp)
    window.addEventListener('pointercancel', this.onUp)
    window.addEventListener('keydown', this.onKey)
    document.addEventListener('visibilitychange', this.onVis)
    this.ctx.onExit(() => this.cleanup())
    this.raf = requestAnimationFrame(this.loop)
  }

  private preload() {
    const names = ['dough', 'sauce-red', 'sauce-white', 'cheese', 'pizza-done', 'pizza-box', ...TOPPINGS.map((t) => t.id)]
    for (const n of names) new Image().src = ART + n + '.png'
    for (const s of [COIN, BOTTLE_ART.red, BOTTLE_ART.white]) new Image().src = s
  }

  private cleanup() {
    if (this.exited) return
    this.exited = true
    cancelAnimationFrame(this.raf)
    window.removeEventListener('pointermove', this.onMove)
    window.removeEventListener('pointerup', this.onUp)
    window.removeEventListener('pointercancel', this.onUp)
    window.removeEventListener('keydown', this.onKey)
    document.removeEventListener('visibilitychange', this.onVis)
    this.snd.dispose()
  }

  // ---------- scene ----------
  private build() {
    const root = this.ctx.root
    root.innerHTML = ''
    const scene = div('scene', root)
    this.scene = scene
    scene.addEventListener('pointerdown', this.onDown)
    scene.addEventListener('contextmenu', (e) => e.preventDefault())
    const world = div('world', scene)
    this.world = world

    // moving belt slats (they lean toward a vanishing point, like the painted ones)
    const belt = div('belt', world)
    const n = Math.ceil(BELT.end / SLAT.gap) + 2
    for (let i = 0; i < n; i++) this.slats.push(div('slat', belt))
    div('belt-shade', belt)

    // bins filled with toppings, tape labels on the rack
    const bins = div('bins', world)
    TOPPINGS.forEach((t, i) => {
      const [fx0, fx1, ix0, ix1] = BIN_X[i]
      const pile = div('pile', bins)
      const w = ix1 - ix0 - 2
      place(pile, { x: ix0 + 1, y: 112, w, h: 62 })
      this.fillPile(pile, t.id, w)
      const tape = div('tape', bins, `<span>${t.label}</span>`)
      at(tape, (fx0 + fx1) / 2, 193)
      tape.style.setProperty('--r', `${rnd(-3, 3).toFixed(1)}deg`)
      this.tapes.push(tape)
      this.addSource(t.id, { kind: 'topping', id: t.id }, { x: fx0, y: 112, w: fx1 - fx0, h: 96 }, { x: fx0 + 3, y: 121, w: fx1 - fx0 - 6, h: 61 }, bins, pile)
    })

    // the wall: bottles, ticket, chalkboard
    const wall = div('wall', world)
    this.wall = wall
    for (const s of ['red', 'white'] as Sauce[]) {
      const b = BOTTLES[s]
      this.addSource('sauce-' + s, { kind: 'sauce', sauce: s }, b.hit, b.hl, wall)
      // candy recolour of the painted bottle for dessert time
      const tint = div(`tint tint-${s}`, wall)
      place(tint, { x: 0, y: 90, w: 130, h: 125 })
      tint.style.backgroundPosition = '0 -90px'
    }
    const chalk = div('chalk', wall)
    const mark = `<i class="${P}mark"><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="6.5"/><path class="${P}x1" d="M4.5 4.5l11 11"/><path class="${P}x2" d="M15.5 4.5l-11 11"/></svg></i>`
    chalk.innerHTML = `
      <div class="${P}chalk-col"><span class="${P}chalk-lab">PIZZAS</span><b class="${P}chalk-num">0</b><small class="${P}chalk-of">/${SHIFT}</small></div>
      <div class="${P}chalk-col ${P}chalk-col2"><span class="${P}chalk-lab">COINS</span><b class="${P}chalk-num ${P}chalk-gold">0</b></div>
      <div class="${P}chalk-oops"><span class="${P}chalk-lab">OOPS</span>${mark.repeat(MAX_MISTAKES)}</div>`
    const nums = chalk.querySelectorAll<HTMLElement>('.' + P + 'chalk-num')
    this.chalkMade = nums[0]
    this.chalkCoins = nums[1]
    this.marks = [...chalk.querySelectorAll<HTMLElement>('.' + P + 'mark')]

    // pies, then the oven front over them
    this.pizzas = div('pizzas', world)
    const occ = div('occluder', world)
    place(occ, { x: 840, y: 150, w: 160, h: 200 })
    occ.style.clipPath = `polygon(${OVEN_FRONT.map(([x, y]) => `${x - 840}px ${y - 150}px`).join(', ')})`
    div('glow', world)

    // the counter: cheese tub (left) and pizza boxes (right)
    this.counter = div('counter', world)
    const tub = div('tub', this.counter)
    place(tub, TUB)
    tub.innerHTML = `
      <svg class="${P}tub-svg" viewBox="0 0 118 78"><path d="M15 17H103L113 40H5Z" fill="#2c364d" stroke="#1d2140" stroke-width="3" stroke-linejoin="round"/><path d="M18 21H100L106.5 36H11.5Z" fill="none" stroke="#56627c" stroke-width="2"/></svg>
      <div class="${P}tub-pile"></div>
      <svg class="${P}tub-svg" viewBox="0 0 118 78"><defs><linearGradient id="${P}steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9c5d7"/><stop offset="0.45" stop-color="#93a1b8"/><stop offset="1" stop-color="#76839b"/></linearGradient></defs><path d="M4 39.5H114V68Q114 76 106 76H12Q4 76 4 68Z" fill="url(#${P}steel)" stroke="#1d2140" stroke-width="3" stroke-linejoin="round"/><path d="M8 44H110" stroke="#dbe3ee" stroke-width="2" stroke-linecap="round"/><circle cx="13" cy="53" r="2.8" fill="#55627a" stroke="#1d2140" stroke-width="1.6"/><circle cx="105" cy="53" r="2.8" fill="#55627a" stroke="#1d2140" stroke-width="1.6"/></svg>`
    this.tubLabel = div('tape tub-tape', tub, '<span>CHEESE</span>')
    at(this.tubLabel, 59, 59)
    this.tubLabel.style.setProperty('--r', '-2deg')
    const tubPile = tub.querySelector<HTMLElement>('.' + P + 'tub-pile')!
    this.fillTub(tubPile)
    this.addSource('cheese', { kind: 'cheese' }, { x: TUB.x, y: 318, w: TUB.w, h: TUB.h - 4 }, { x: TUB.x - 2, y: 305, w: TUB.w + 4, h: 88 }, this.counter, tubPile)

    this.fx = div('fx', world)

    // hint bubble, held tool, music toggle (outside the shaking world)
    this.hintEl = div('hint', scene)
    this.hintText = div('hint-in', this.hintEl)
    this.hintEl.style.display = 'none'
    this.held = div('held', scene)
    this.held.style.display = 'none'
    const mb = document.createElement('button')
    mb.className = cls('music')
    mb.title = 'Music (M)'
    mb.innerHTML = NOTE_ICON
    mb.addEventListener('pointerdown', (e) => e.stopPropagation())
    mb.addEventListener('click', () => this.toggleMusic())
    scene.append(mb)
    this.musicBtn = mb
    if (!this.snd.enabled) mb.style.display = 'none'
    this.renderBelt()
  }

  private addSource(key: string, tool: Tool, hit: Rect, hlRect: Rect, parent: HTMLElement, art?: HTMLElement) {
    const hl = div('hl hl-' + tool.kind, parent)
    place(hl, hlRect)
    this.sources.push({ key, tool, hit, hl, art })
  }

  private fillPile(pile: HTMLElement, id: ToppingId, w: number) {
    // back to front so the front pieces overlap; the pile is clipped at the bin's front rim
    const spots: [number, number][] = [
      [0.5, 20],
      [0.2, 28],
      [0.8, 28],
      [0.5, 33],
      [0.1, 41],
      [0.37, 41],
      [0.63, 41],
      [0.9, 41],
      [0.26, 52],
      [0.74, 52],
      [0.5, 57],
    ]
    for (const [fx, y] of spots) {
      const s = sprite(id, `piece ing ing-${id}`, pile, 30)
      at(s, fx * w + rnd(-3, 3), y + rnd(-2, 2))
      s.style.transform = `translate(-50%, -50%) scaleY(0.8) rotate(${rnd(0, 360).toFixed(0)}deg)`
    }
  }

  private fillTub(pile: HTMLElement) {
    const spots: [number, number, number][] = [
      [40, 13, 46],
      [74, 12, 44],
      [22, 22, 44],
      [57, 18, 50],
      [93, 22, 44],
      [38, 30, 46],
      [76, 30, 46],
    ]
    spots.forEach(([x, y, s], i) => {
      const c = sprite('cheese', 'piece ing ing-cheese', pile, s)
      at(c, x, y)
      c.style.setProperty('--h', `${i * 51}deg`)
      c.style.transform = `translate(-50%, -50%) scaleY(0.7) rotate(${rnd(0, 360).toFixed(0)}deg)`
    })
  }

  // ---------- flow ----------
  private card(title: string, body: string, button: string, extra = '') {
    const ov = div('overlay', this.scene)
    const card = div('check ' + extra, ov)
    card.innerHTML = `<div class="${P}check-head">${title}</div><div class="${P}check-body">${body}</div><button class="btn ${P}go">${button}</button>`
    return { ov, card, button: card.querySelector('button')! }
  }

  private cardAvatar(card: HTMLElement, pose: 'wave' | 'cheer' | 'idle', mood: 'smile' | 'grin' | 'o') {
    const wrap = div('card-av', card)
    const av = this.ctx.avatar(this.ctx.look, 0.9)
    av.setPose(pose)
    av.setMood(mood)
    wrap.append(av.el)
    this.avatars.push(av)
  }

  private closeCard(ov: HTMLElement) {
    this.avatars = []
    ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: 'forwards' }).onfinish = () => ov.remove()
  }

  private showIntro() {
    const how = (art: string, text: string, extra = '') =>
      `<div class="${P}line ${P}how"><img src="${ART}${art}.png" class="${extra}" alt="" draggable="false"><span>${text}</span></div>`
    const { ov, card, button } = this.card(
      'Slice Factory',
      `<p class="${P}lede">Match the ticket before each pie rides into the oven!</p>` +
        how('sauce-red', '<b>Sauce:</b> grab a bottle, scribble on the dough') +
        how('cheese', '<b>Cheese</b>, then drop the <b>toppings</b> from the bins') +
        how('pizza-done', '<b>5 burnt pies</b> and your shift is over', P + 'burnt'),
      'Start Shift',
      'check-intro',
    )
    this.cardAvatar(card, 'wave', 'grin')
    button.addEventListener('click', () => {
      this.ctx.sfx.click()
      this.closeCard(ov)
      this.startShift()
    })
  }

  private startShift() {
    this.phase = 'play'
    this.snd.wake()
    this.snd.startMusic()
    this.syncMusicBtn()
    this.later(0.35, () => this.spawnNext())
  }

  private spawnNext() {
    if (this.phase !== 'play') return
    this.orderNo++
    const n = this.orderNo
    const sweet = n >= this.dessertAt && n < this.dessertAt + 2
    if (sweet !== this.dessert) this.setDessert(sweet)
    else if (n === 8) this.banner('Lunch Rush!', 'rush')
    else if (n === 20) this.banner('Dinner Rush!', 'rush')
    const order = makeOrder(n, sweet)
    const p = this.makePizza(order)
    this.pizza = p
    this.ticket = new Ticket(this.wall, order)
    this.ticket.update(p)
    this.snd.whoosh()
    if (n === 1) this.later(0.6, () => this.bubble('Your order!', 306, 61, 'left', 2.6))
    this.updateHint()
  }

  private setDessert(on: boolean) {
    this.dessert = on
    this.scene.classList.toggle(P + 'sweet', on)
    this.tapes.forEach((tape, i) => (tape.firstElementChild!.textContent = on ? TOPPINGS[i].candyLabel : TOPPINGS[i].label))
    this.tubLabel.firstElementChild!.textContent = on ? 'SPRINKLES' : 'CHEESE'
    if (on) {
      this.banner('Dessert Pizza!', 'sweet')
      this.snd.sparkle()
      for (let i = 0; i < 4; i++) this.later(i * 0.12, () => this.burst(rnd(250, 750), rnd(150, 260), 10, ['#ff9ccf', '#ffd34d', '#8fe3ff', '#b9f28a'], 70, 7))
    } else this.float(500, 230, 'Back to pizza!', 'good', 1300)
  }

  private finish() {
    if (this.phase === 'over') return
    this.phase = 'over'
    this.setTool(null)
    this.hideHint()
    this.snd.stopMusic(0.8)
    const full = this.resolved >= SHIFT && this.mistakes < MAX_MISTAKES
    const bonus = full ? 10 : 0
    const coins = this.coins + bonus
    const line = (label: string, value: string | number, extra = '') =>
      `<div class="${P}line ${extra}"><span>${label}</span><i></i><b>${value}</b></div>`
    const { card, button } = this.card(
      full ? 'Full Shift!' : 'Shift Over!',
      line('Pizzas made', this.made) +
        line('Best combo', this.bestCombo) +
        line('Burnt pies', this.mistakes) +
        (this.dessertMade ? line('Dessert pizzas', this.dessertMade) : '') +
        (full ? line('Full-shift bonus', '+' + bonus) : '') +
        line('Tips', `<img src="${COIN}" alt="" draggable="false">${coins}`, P + 'total'),
      `Collect ${coins} coin${coins === 1 ? '' : 's'}`,
      'check-end',
    )
    this.cardAvatar(card, this.made >= 8 ? 'cheer' : 'idle', this.made >= 8 ? 'grin' : 'o')
    if (this.made >= 8) this.ctx.sfx.stamp()
    else this.ctx.sfx.tick()
    let sent = false
    button.addEventListener('click', () => {
      if (sent) return
      sent = true
      this.ctx.sfx.coin()
      const flags: string[] = []
      if (full) flags.push('full-shift')
      if (this.dessertMade) flags.push('dessert-pizza')
      const lines = [`${this.made} pizza${this.made === 1 ? '' : 's'} made`, `Best combo: ${this.bestCombo}`]
      if (this.dessertMade) lines.push('Made a dessert pizza!')
      if (full) lines.push(`Full shift bonus +${bonus}`)
      this.cleanup()
      this.ctx.end({ coins, score: this.made, lines, flags })
    })
  }

  // ---------- pies ----------
  private makePizza(order: Order): Pizza {
    const el = div('pizza' + (order.dessert ? ' pz-sweet' : ''), this.pizzas)
    const shadow = div('pshadow', el)
    const bounce = div('bounce', el)
    const edge = div('edge', bounce)
    sprite('dough', 'dough ing ing-dough', edge)
    const body = div('body', bounce)
    sprite('dough', 'dough ing ing-dough', body)
    const sauceL = div('layer', body)
    const cheeseL = div('layer', body)
    const topL = div('layer', body)
    const p: Pizza = {
      order,
      el,
      bounce,
      shadow,
      edge,
      body,
      sauceL,
      cheeseL,
      topL,
      x: -90,
      y: 140,
      state: 'toss',
      tossT: 0,
      covered: new Set(),
      splats: 0,
      rightSplats: 0,
      wrongSplats: 0,
      sauceDone: false,
      cheese: false,
      have: { pepperoni: 0, mushroom: 0, pepper: 0, sausage: 0, olive: 0, basil: 0 },
      ready: false,
      ruined: false,
      boostIn: -1,
      boosting: false,
      gone: false,
    }
    this.renderToss(p, 0)
    return p
  }

  /** dough flies in from the left, spinning, and slaps onto the belt */
  private renderToss(p: Pizza, k: number) {
    p.x = lerp(-90, LAND_X, k)
    p.y = lerp(140, BELT_Y, k) - 120 * 4 * k * (1 - k)
    const sq = lerp(0.95, SQ, k * k)
    const spin = (1 - k) * 420
    p.body.style.transform = `scaleY(${sq}) rotate(${spin}deg)`
    p.edge.style.transform = `translateY(${4 * k}px) scaleY(${sq}) rotate(${spin}deg)`
    p.shadow.style.opacity = String(k * k)
    p.shadow.style.transform = `translateY(${BELT_Y - p.y}px) scale(${0.5 + 0.5 * k})`
    p.el.style.transform = `translate(${p.x}px, ${p.y}px)`
  }

  private land(p: Pizza) {
    p.state = 'belt'
    p.y = BELT_Y
    p.body.style.transform = ''
    p.edge.style.transform = ''
    p.shadow.style.transform = ''
    p.shadow.style.opacity = ''
    p.bounce.animate([{ transform: 'scale(1.16, 0.8)' }, { transform: 'scale(0.96, 1.06)', offset: 0.55 }, { transform: 'none' }], {
      duration: 300,
      easing: 'ease-out',
    })
    this.snd.flop()
    this.burst(p.x - 40, BELT_Y + 14, 5, ['#fff8ea', '#f2e3c4'], 34, 6, -1)
    this.burst(p.x + 40, BELT_Y + 14, 5, ['#fff8ea', '#f2e3c4'], 34, 6, 1)
    this.updateHint()
  }

  private renderPizza(p: Pizza) {
    p.el.style.transform = `translate(${p.x}px, ${p.y}px)`
    // it gets darker as it slides into the oven mouth
    const dark = Math.max(0, Math.min(1, (p.x - 855) / 85))
    p.bounce.style.filter = dark > 0 ? `brightness(${1 - dark * 0.55})` : ''
  }

  /** pointer → top-down pie coords, or null if not over a workable pie */
  private localOn(p: Pizza | null, x: number, y: number, pad: number) {
    if (!p || p.state !== 'belt' || p.x > WORK_MAX_X) return null
    const u = x - p.x
    const v = (y - p.y) / SQ
    return u * u + v * v <= (R + pad) * (R + pad) ? { u, v } : null
  }

  private splatEl(p: Pizza, u: number, v: number, sauce: Sauce, delay = 0) {
    const s = sprite('sauce-' + sauce, `splat ing ing-sauce-${sauce}`, p.sauceL, rnd(42, 54))
    at(s, R + u, R + v)
    const rot = rnd(0, 360).toFixed(0)
    s.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`
    s.animate([{ transform: `translate(-50%, -50%) rotate(${rot}deg) scale(0.15)` }, { transform: `translate(-50%, -50%) rotate(${rot}deg) scale(1)` }], {
      duration: 150,
      delay,
      easing: 'cubic-bezier(.2,1.5,.4,1)',
      fill: 'backwards',
    })
  }

  private addSplat(p: Pizza, u: number, v: number, sauce: Sauce) {
    if (p.splats >= 70) return
    p.splats++
    const r = Math.hypot(u, v)
    const max = R - 22
    if (r > max) {
      u *= max / r
      v *= max / r
    }
    this.splatEl(p, u, v, sauce)
    this.snd.squirt()
    // a couple of droplets fly off
    this.burst(p.x + u, p.y + v * SQ, 2, [SAUCE_RGB[sauce]], 22, 5)
    if (sauce === p.order.sauce) {
      p.rightSplats++
      if (!p.sauceDone) {
        PROBES.forEach(([a, b], i) => {
          if (Math.hypot(a - u, b - v) <= COVER_R) p.covered.add(i)
        })
        if (p.covered.size >= SAUCE_NEED) this.finishSauce(p)
      }
    } else {
      p.wrongSplats++
      if (p.wrongSplats === TOL + 1) this.say(p, p.order.dessert ? 'Wrong drizzle!' : 'Wrong sauce!', 'bad')
    }
    this.afterChange(p)
  }

  /** enough sauce: smooth out the gaps so the pie looks properly sauced */
  private finishSauce(p: Pizza) {
    p.sauceDone = true
    let i = 0
    PROBES.forEach(([a, b], k) => {
      if (p.covered.has(k)) return
      p.covered.add(k)
      this.splatEl(p, a + rnd(-4, 4), b + rnd(-4, 4), p.order.sauce, 40 + i++ * 35)
    })
    this.snd.smear()
    this.burst(p.x, p.y, 8, ['#fff6c2', '#ffd34d'], 70, 6)
  }

  private addCheese(p: Pizza) {
    if (p.cheese) {
      this.snd.sprinkle()
      return
    }
    p.cheese = true
    const spots: [number, number, number][] = [
      [0, 0, 90],
      [-26, -22, 52],
      [26, -21, 52],
      [-25, 24, 52],
      [27, 23, 52],
      [0, -35, 40],
      [0, 36, 40],
    ]
    spots.forEach(([u, v, size], i) => {
      const c = sprite('cheese', 'cheese ing ing-cheese', p.cheeseL, size)
      at(c, R + u, R + v)
      c.style.setProperty('--h', `${(i * 53) % 360}deg`)
      const rot = rnd(0, 360).toFixed(0)
      c.style.transform = `translate(-50%, -50%) rotate(${rot}deg)`
      c.animate(
        [
          { transform: `translate(-50%, -50%) translateY(-70px) rotate(${rot}deg) scale(1.3)`, opacity: 0 },
          { transform: `translate(-50%, -50%) rotate(${rot}deg) scale(1)`, opacity: 1 },
        ],
        { duration: 230, delay: i * 35, easing: 'ease-in', fill: 'backwards' },
      )
    })
    this.snd.sprinkle()
    this.afterChange(p)
  }

  private addTopping(p: Pizza, id: ToppingId, u: number, v: number) {
    const r = Math.hypot(u, v)
    const max = R - 15
    if (r > max) {
      u *= max / r
      v *= max / r
    }
    const w = div('top', p.topL)
    at(w, R + u, R + v)
    const s = sprite(id, `top-img ing ing-${id}`, w)
    s.style.transform = `translate(-50%, -50%) scaleY(${(TOP_SQ / SQ).toFixed(3)}) rotate(${rnd(0, 360).toFixed(0)}deg)`
    w.animate(
      [
        { transform: 'translateY(-75px) scale(1.45)', opacity: 0.5 },
        { transform: 'translateY(0) scale(0.9)', opacity: 1, offset: 0.62 },
        { transform: 'scale(1.08)', offset: 0.82 },
        { transform: 'none' },
      ],
      { duration: 250, easing: 'ease-in' },
    )
    p.have[id]++
    this.snd.plop(PITCH[id])
    this.afterChange(p)
  }

  /** re-check the pie after every change: ready → send it, ruined → send it too */
  private afterChange(p: Pizza) {
    if (p !== this.pizza) return
    this.ticket?.update(p)
    const ruined = isRuined(p.order, p, TOL)
    if (ruined && !p.ruined) {
      p.ruined = true
      p.ready = false
      this.ticket?.stampIt('oops')
      this.ctx.sfx.squawk()
      this.say(p, 'Oops!', 'bad')
      p.boostIn = 1.1
    } else if (!ruined && !p.ready && verdict(p.order, p, TOL) === null) {
      p.ready = true
      this.ticket?.stampIt('ready')
      this.ctx.sfx.stamp()
      this.say(p, 'Order up!', 'good')
      this.burst(p.x, p.y, 10, ['#fff6c2', '#ffd34d', '#ffffff'], 80, 7)
      p.boostIn = 0.35
    }
    this.updateHint()
  }

  // ---------- the oven ----------
  private enterOven(p: Pizza) {
    p.state = 'oven'
    this.pizza = null
    this.leaving.push(p)
    this.squirting = false
    const why = verdict(p.order, p, TOL)
    const ok = why === null
    this.resolved++
    let gain = 0
    if (ok) {
      this.combo++
      this.bestCombo = Math.max(this.bestCombo, this.combo)
      // 2 a pie, +1 on a 5-streak, +2 on a 10-streak; dessert pies pay double
      gain = (2 + (this.combo >= 10 ? 2 : this.combo >= 5 ? 1 : 0)) * (p.order.dessert ? 2 : 1)
      this.coins += gain
      this.made++
      if (p.order.dessert) this.dessertMade++
      this.mercy = Math.min(1, this.mercy + 0.03)
    } else {
      this.combo = 0
      this.mistakes++
      this.mercy = Math.max(0.78, this.mercy - 0.08)
    }
    const slot = this.mistakes - 1
    const combo = this.combo
    this.ticket?.tear()
    this.ticket = null
    this.hideHint()
    this.snd.whoosh()
    this.later(0.42, () => (ok ? this.bakeGood(gain, combo, p.order.dessert) : this.bakeBad(why!, slot)))
    if (this.mistakes >= MAX_MISTAKES || this.resolved >= SHIFT) {
      this.phase = 'ending'
      this.setTool(null)
      this.later(2.9, () => this.finish())
    } else this.later(0.5, () => this.spawnNext())
  }

  private bakeGood(gain: number, combo: number, sweet: boolean) {
    this.flare('good')
    this.snd.sizzle()
    this.snd.ovenDing()
    const box = sprite('pizza-box', 'box', this.counter, 104)
    at(box, BOX.x, BOX.y)
    box.animate(
      [{ transform: 'translate(-50%, -50%) scale(0)' }, { transform: 'translate(-50%, -50%) scale(1.12)', offset: 0.7 }, { transform: 'translate(-50%, -50%) scale(1)' }],
      { duration: 260, easing: 'ease-out', fill: 'backwards' },
    )
    const pie = sprite('pizza-done', 'fly' + (sweet ? ' done-sweet' : ''), this.fx, 92)
    const y1 = BOX.y - 28
    this.fly(pie, {
      x0: MOUTH.x - 6,
      y0: MOUTH.y,
      x1: BOX.x,
      y1,
      arc: 150,
      dur: 0.62,
      r0: 0,
      r1: -360,
      s0: 0.35,
      s1: 0.86,
      done: () => {
        pie.animate(
          [
            { transform: centred(BOX.x, y1, 'scale(0.86)'), opacity: 1 },
            { transform: centred(BOX.x, BOX.y - 4, 'scale(0.5, 0.22)'), opacity: 0 },
          ],
          { duration: 150, easing: 'ease-in', fill: 'forwards' },
        ).onfinish = () => pie.remove()
        box.animate(
          [
            { transform: 'translate(-50%, -50%)' },
            { transform: 'translate(-50%, -44%) scale(1.14, 0.84)', offset: 0.35 },
            { transform: 'translate(-50%, -52%) scale(0.96, 1.06)', offset: 0.7 },
            { transform: 'translate(-50%, -50%)' },
          ],
          { duration: 300, delay: 120, easing: 'ease-out' },
        )
        this.snd.box()
        this.later(0.14, () => {
          this.ctx.sfx.register()
          this.shownMade++
          this.chalk(this.chalkMade, String(this.shownMade))
          this.float(BOX.x, BOX.y - 62, `+${gain}`, 'coins')
          this.coinsFly(BOX.x, BOX.y - 34, Math.min(5, gain), this.coins)
          if (combo >= 2) this.float(752, 226, `Combo ×${combo}!`, 'combo', 1300)
        })
        this.later(0.75, () => {
          this.snd.whoosh()
          box.animate(
            [{ transform: 'translate(-50%, -50%)' }, { transform: 'translate(-50%, -50%) translateX(-10px)', offset: 0.2 }, { transform: 'translate(-50%, -50%) translateX(170px)' }],
            { duration: 450, easing: 'ease-in', fill: 'forwards' },
          ).onfinish = () => box.remove()
        })
      },
    })
  }

  private bakeBad(why: string, slot: number) {
    this.flare('bad')
    this.smoke(MOUTH.x - 6, MOUTH.y - 14, 10)
    this.snd.burnt()
    this.snd.sad()
    this.shake()
    this.callout(why)
    this.marks[slot]?.classList.add(P + 'x')
    this.marks[slot]?.animate([{ transform: 'scale(1.8)' }, { transform: 'none' }], { duration: 320, easing: 'ease-out' })
    const pie = sprite('pizza-done', 'fly burnt', this.fx, 92)
    const x1 = 776 + rnd(-24, 16)
    const y1 = 386
    this.fly(pie, {
      x0: MOUTH.x - 6,
      y0: MOUTH.y,
      x1,
      y1,
      arc: 85,
      dur: 0.7,
      r0: 0,
      r1: -400,
      s0: 0.4,
      s1: 0.9,
      done: () => {
        this.snd.flop()
        this.smoke(x1, y1, 4)
        pie.animate(
          [
            { transform: centred(x1, y1, 'rotate(-400deg) scale(0.9)') },
            { transform: centred(x1, y1 + 8, 'rotate(-400deg) scale(1.15, 0.5)'), offset: 0.12 },
            { transform: centred(x1, y1 + 6, 'rotate(-400deg) scale(1.05, 0.56)'), offset: 0.45 },
            { transform: centred(x1 - 20, 640, 'rotate(-470deg) scale(1, 0.6)') },
          ],
          { duration: 1200, easing: 'ease-in', fill: 'forwards' },
        ).onfinish = () => pie.remove()
      },
    })
  }

  // ---------- input ----------
  private onDown = (e: PointerEvent) => {
    if (this.phase !== 'play' || this.paused) return
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    this.snd.wake()
    if (e.button === 2) {
      this.setTool(null)
      return
    }
    const q = this.ctx.toLocal(e)
    const ptr = this.ptr
    Object.assign(ptr, { x: q.x, y: q.y, sx: q.x, sy: q.y, down: true, moved: false, inside: true, src: null })
    const src = this.sourceAt(q.x, q.y)
    if (src) {
      this.pick(src)
      ptr.src = src
      return
    }
    const tool = this.tool
    if (!tool) return
    if (tool.kind === 'sauce') {
      this.lastSplat.t = -9 // squirt right away (handled in the loop)
      return
    }
    const p = this.pizza
    const loc = this.localOn(p, q.x, q.y, 18)
    if (p && loc) this.apply(p, loc.u, loc.v)
    else this.miss(q.x, q.y)
  }

  private onMove = (e: PointerEvent) => {
    const q = this.ctx.toLocal(e)
    const ptr = this.ptr
    ptr.x = q.x
    ptr.y = q.y
    ptr.inside = q.x >= 0 && q.x <= 1000 && q.y >= 0 && q.y <= 565
    if (ptr.down && !ptr.moved && Math.hypot(q.x - ptr.sx, q.y - ptr.sy) > 8) ptr.moved = true
    this.hover()
  }

  private onUp = (e: PointerEvent) => {
    const ptr = this.ptr
    if (!ptr.down) return
    ptr.down = false
    this.squirting = false
    const src = ptr.src
    ptr.src = null
    const tool = this.tool
    if (this.phase !== 'play' || !src || !ptr.moved || !tool || tool.kind === 'sauce') return
    // dragged something out of a bin / the tub: drop it where it was released
    const q = this.ctx.toLocal(e)
    if (this.sourceAt(q.x, q.y)) return
    const p = this.pizza
    const loc = this.localOn(p, q.x, q.y, 18)
    if (p && loc) this.apply(p, loc.u, loc.v)
    else this.miss(q.x, q.y)
  }

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'm' || e.key === 'M') {
      this.toggleMusic()
      return
    }
    if (this.phase !== 'play') return
    const k = e.key.toLowerCase()
    const find = (key: string) => this.sources.find((s) => s.key === key)
    let src: Source | undefined
    if (k === 'escape') {
      // Escape puts a held tool down (and only then is it the game's: with empty hands it asks to leave)
      if (!this.tool) return
      e.preventDefault()
      this.setTool(null)
    } else if (k === 'q') src = find('sauce-red')
    else if (k === 'w') src = find('sauce-white')
    else if (k === 'e') src = find('cheese')
    else if (k >= '1' && k <= '6') src = find(TOPPINGS[Number(k) - 1].id)
    if (src) this.pick(src)
  }

  private onVis = () => {
    if (document.hidden) {
      this.paused = true
      this.snd.pause()
    } else {
      this.paused = false
      this.lastNow = performance.now()
      if (this.phase !== 'intro') this.snd.wake()
    }
  }

  private sourceAt(x: number, y: number) {
    return this.sources.find((s) => inRect(s.hit, x, y)) ?? null
  }

  private hover() {
    const s = this.phase === 'play' && this.ptr.inside ? this.sourceAt(this.ptr.x, this.ptr.y) : null
    if (s === this.hovered) return
    this.hovered?.hl.classList.remove(P + 'hover')
    s?.hl.classList.add(P + 'hover')
    this.hovered = s
    this.scene.classList.toggle(P + 'pointer', !!s)
  }

  private pick(src: Source) {
    const same = toolKey(this.tool) === src.key
    this.setTool(src.tool)
    this.snd.pickup()
    src.art?.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-4px)' }, { transform: 'translateY(0)' }], { duration: 180, easing: 'ease-out' })
    if (!same) src.hl.animate([{ transform: 'scale(1.08)' }, { transform: 'none' }], { duration: 200, easing: 'ease-out' })
  }

  private setTool(t: Tool | null) {
    this.tool = t
    const key = toolKey(t)
    for (const s of this.sources) s.hl.classList.toggle(P + 'on', s.key === key)
    this.held.innerHTML = ''
    if (t?.kind === 'sauce') {
      const rot = div('held-rot', this.held)
      sprite(BOTTLE_ART[t.sauce], `held-bottle ing ing-bottle-${t.sauce}`, rot)
    } else if (t?.kind === 'cheese') {
      const c = sprite('cheese', 'held-cheese ing ing-cheese', this.held)
      c.style.setProperty('--h', '300deg')
    } else if (t) sprite(t.id, `held-top ing ing-${t.id}`, this.held)
    this.scene.classList.toggle(P + 'holding', !!t)
    this.updateHint()
  }

  private apply(p: Pizza, u: number, v: number) {
    const t = this.tool
    if (t?.kind === 'cheese') this.addCheese(p)
    else if (t?.kind === 'topping') this.addTopping(p, t.id, u, v)
  }

  /** dropped next to the pie: it tumbles off the belt */
  private miss(x: number, y: number) {
    const t = this.tool
    if (!t || t.kind === 'sauce') return
    const art = t.kind === 'cheese' ? 'cheese' : t.id
    const s = sprite(art, `fly ing ing-${art}`, this.fx, t.kind === 'cheese' ? 40 : 30)
    this.fly(s, { x0: x, y0: y, x1: x + rnd(-60, 60), y1: 610, arc: 50, dur: 0.65, r0: 0, r1: rnd(-320, 320), s0: 1, s1: 0.9 })
    this.ctx.sfx.tick()
  }

  // ---------- loop ----------
  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop)
    const dt = this.lastNow ? Math.min(0.05, (now - this.lastNow) / 1000) : 0
    this.lastNow = now
    if (this.paused) return
    this.t += dt
    this.step(dt)
  }

  private step(dt: number) {
    // timers on the game clock
    for (let i = 0; i < this.timers.length; i++) {
      const tm = this.timers[i]
      if (tm.at <= this.t) {
        this.timers.splice(i--, 1)
        tm.fn()
      }
    }

    // belt speed: follows the order number, races when a pie is done
    const p = this.pizza
    const playing = this.phase === 'play' || this.phase === 'ending'
    const base = playing ? beltSpeed(Math.max(1, this.orderNo)) * this.mercy : 22
    const boosting = !!p && p.boosting
    const target = boosting ? Math.max(base * 4, 520) : base
    this.speed += (target - this.speed) * Math.min(1, dt * (boosting ? 5 : 4))
    this.beltPos += this.speed * dt
    this.renderBelt()
    this.snd.setTempo(108 + (base - 54) * 0.42)

    if (p) {
      if (p.state === 'toss') {
        p.tossT += dt
        const k = Math.min(1, p.tossT / TOSS_T)
        this.renderToss(p, k)
        if (k >= 1) this.land(p)
      } else {
        p.x += this.speed * dt
        if (p.boostIn > 0) {
          p.boostIn -= dt
          if (p.boostIn <= 0) {
            p.boosting = true
            this.snd.whoosh()
          }
        }
        if (p.x >= OVEN_X) this.enterOven(p)
      }
      if (p.state !== 'toss') this.renderPizza(p)
    }
    for (const q of this.leaving) {
      q.x += Math.max(this.speed, 160) * dt
      this.renderPizza(q)
      if (q.x > 1040) {
        q.el.remove()
        q.gone = true
      }
    }
    if (this.leaving.some((q) => q.gone)) this.leaving = this.leaving.filter((q) => !q.gone)

    this.stepSquirt()
    this.stepFlyers(dt)
    this.renderHeld()
    this.renderHint()
    for (const av of this.avatars) av.update(dt)
    this.snd.tick()
  }

  private renderBelt() {
    const off = this.beltPos % SLAT.gap
    for (let i = 0; i < this.slats.length; i++) {
      const b = off + (i - 1) * SLAT.gap
      const skew = Math.atan(((b - SLAT.vanishX) * SLAT.k) / BELT.h)
      this.slats[i].style.transform = `translateX(${b.toFixed(2)}px) skewX(${skew.toFixed(4)}rad)`
    }
  }

  private stepSquirt() {
    const ptr = this.ptr
    const tool = this.tool
    if (!ptr.down || tool?.kind !== 'sauce' || this.phase !== 'play') {
      this.squirting = false
      return
    }
    const p = this.pizza
    const loc = this.localOn(p, ptr.x, ptr.y, 4)
    if (!p || !loc) {
      this.squirting = false
      // squeezing over nothing: a few drips fall
      if (this.t - this.lastDrip > 0.14) {
        this.lastDrip = this.t
        const d = div('drip', this.fx)
        d.style.background = SAUCE_RGB[tool.sauce]
        at(d, ptr.x, ptr.y)
        d.animate([{ transform: 'translate(-50%, -50%) scale(1)', opacity: 1 }, { transform: 'translate(-50%, 70px) scale(0.6)', opacity: 0 }], {
          duration: 450,
          easing: 'ease-in',
        }).onfinish = () => d.remove()
      }
      return
    }
    const ls = this.lastSplat
    if (!this.squirting || Math.hypot(loc.u - ls.u, loc.v - ls.v) >= 11 || this.t - ls.t >= 0.11) {
      this.addSplat(p, loc.u, loc.v, tool.sauce)
      ls.u = loc.u
      ls.v = loc.v
      ls.t = this.t
    }
    this.squirting = true
  }

  private renderHeld() {
    const show = !!this.tool && this.ptr.inside && this.phase === 'play'
    this.held.style.display = show ? '' : 'none'
    if (!show) return
    this.held.style.transform = `translate(${this.ptr.x}px, ${this.ptr.y}px)`
    this.held.classList.toggle(P + 'squeeze', this.squirting)
  }

  // ---------- hints (first two orders) ----------
  private updateHint() {
    const p = this.pizza
    let h: Hint | null = null
    if (p && this.phase === 'play' && this.orderNo <= 2 && !p.ready && !p.ruined) {
      const t = this.tool
      const o = p.order
      if (!p.sauceDone) {
        if (t?.kind === 'sauce' && t.sauce === o.sauce) h = { text: 'Scribble it on!', dir: 'down', x: 0, y: 236, onPizza: true }
        else {
          const b = BOTTLES[o.sauce].hl
          const name = o.dessert ? (o.sauce === 'red' ? 'Chocolate' : 'Frosting') : o.sauce === 'red' ? 'Red sauce' : 'White sauce'
          h = { text: `${name} first!`, dir: 'up', x: b.x + b.w / 2 + 6, y: 216 }
        }
      } else if (!p.cheese) {
        if (t?.kind === 'cheese') h = { text: 'Drop it on!', dir: 'down', x: 0, y: 236, onPizza: true }
        else h = { text: o.dessert ? 'Now sprinkles!' : 'Now cheese!', dir: 'left', x: TUB.x + TUB.w + 4, y: 352 }
      } else {
        const need = TOPPINGS.find((tp) => p.have[tp.id] < (o.toppings[tp.id] ?? 0))
        if (need) {
          const left = (o.toppings[need.id] ?? 0) - p.have[need.id]
          if (t?.kind === 'topping' && t.id === need.id) h = { text: `${left} more!`, dir: 'down', x: 0, y: 236, onPizza: true }
          else {
            const i = TOPPINGS.indexOf(need)
            h = { text: `Toppings! ×${left}`, dir: 'up', x: (BIN_X[i][0] + BIN_X[i][1]) / 2, y: 208 }
          }
        }
      }
      if (p.state === 'toss') h = null
    }
    const key = h ? `${h.text}|${h.dir}|${h.x}|${h.y}` : ''
    if (key === this.hintKey) return
    this.hintKey = key
    this.hint = h
    if (!h) {
      this.hintEl.style.display = 'none'
      return
    }
    this.hintEl.style.display = ''
    this.hintEl.className = cls('hint hint-' + h.dir)
    this.hintText.textContent = h.text
    this.hintW = this.hintText.offsetWidth
    this.hintText.animate([{ transform: 'scale(0.4)' }, { transform: 'scale(1.1)' }, { transform: 'none' }], { duration: 240 })
    this.renderHint()
  }

  private hideHint() {
    this.hint = null
    this.hintKey = ''
    this.hintEl.style.display = 'none'
  }

  private renderHint() {
    const h = this.hint
    if (!h) return
    const x = h.onPizza && this.pizza ? Math.min(this.pizza.x, WORK_MAX_X) : h.x
    this.hintEl.style.transform = `translate(${x}px, ${h.y}px)`
    // keep centred bubbles on screen; the arrow still points at the target
    const half = this.hintW / 2
    const shift = h.dir === 'left' ? 0 : Math.max(0, 8 + half - x) - Math.max(0, x + half - 992)
    this.hintText.style.setProperty('--shift', shift.toFixed(1) + 'px')
  }

  /** a one-off speech bubble that fades by itself */
  private bubble(text: string, x: number, y: number, dir: 'up' | 'down' | 'left', secs: number) {
    const b = div('hint hint-' + dir, this.fx)
    div('hint-in', b).textContent = text
    b.style.transform = `translate(${x}px, ${y}px)`
    b.animate([{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.85 }, { opacity: 0 }], { duration: secs * 1000 }).onfinish = () => b.remove()
  }

  // ---------- juice ----------
  private later(s: number, fn: () => void) {
    this.timers.push({ at: this.t + s, fn })
  }

  private fly(el: HTMLElement, f: Omit<Flyer, 'el' | 't'>) {
    const fl: Flyer = { el, t: 0, ...f }
    el.style.transform = centred(f.x0, f.y0, `rotate(${f.r0}deg) scale(${f.s0})`)
    this.flyers.push(fl)
  }

  private stepFlyers(dt: number) {
    if (!this.flyers.length) return
    const done: Flyer[] = []
    for (const f of this.flyers) {
      f.t += dt
      const k = Math.min(1, f.t / f.dur)
      const x = lerp(f.x0, f.x1, k)
      const y = lerp(f.y0, f.y1, k) - f.arc * 4 * k * (1 - k)
      f.el.style.transform = centred(x, y, `rotate(${lerp(f.r0, f.r1, k)}deg) scale(${lerp(f.s0, f.s1, k)})`)
      if (k >= 1) done.push(f)
    }
    if (!done.length) return
    this.flyers = this.flyers.filter((f) => !done.includes(f))
    for (const f of done) {
      if (f.done) f.done()
      else f.el.remove()
    }
  }

  /** status text over the pie; a newer one replaces the old so they never pile up */
  private say(p: Pizza, text: string, kind: string) {
    this.status?.remove()
    this.status = this.float(p.x, p.y - 50, text, kind)
  }

  private float(x: number, y: number, html: string, kind = '', ms = 1100) {
    const e = div('float ' + kind, this.fx, html)
    at(e, x, y)
    e.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
        { transform: 'translate(-50%, -80%) scale(1.15)', opacity: 1, offset: 0.16 },
        { transform: 'translate(-50%, -100%) scale(1)', opacity: 1, offset: 0.7 },
        { transform: 'translate(-50%, -160%) scale(0.95)', opacity: 0 },
      ],
      { duration: ms, easing: 'ease-out', fill: 'forwards' },
    ).onfinish = () => e.remove()
    return e
  }

  private callout(text: string) {
    const c = div('callout', this.fx, text)
    at(c, CALLOUT.x, CALLOUT.y)
    c.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.3) rotate(-6deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.1) rotate(2deg)', opacity: 1, offset: 0.08 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(-1deg)', opacity: 1, offset: 0.14 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(-1deg)', opacity: 1, offset: 0.85 },
        { transform: 'translate(-50%, -70%) scale(0.95) rotate(-1deg)', opacity: 0 },
      ],
      { duration: 2300, easing: 'ease-out', fill: 'forwards' },
    ).onfinish = () => c.remove()
  }

  private banner(text: string, kind: string) {
    const b = div('banner ' + kind, this.fx, text)
    b.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.2) rotate(-8deg)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.15) rotate(3deg)', opacity: 1, offset: 0.12 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(-2deg)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(-2deg)', opacity: 1, offset: 0.8 },
        { transform: 'translate(-50%, -50%) scale(1.4) rotate(-2deg)', opacity: 0 },
      ],
      { duration: 1900, easing: 'ease-out', fill: 'forwards' },
    ).onfinish = () => b.remove()
  }

  private burst(x: number, y: number, n: number, colors: string[], spread: number, size: number, dirX = 0) {
    for (let i = 0; i < n; i++) {
      const d = div('dot', this.fx)
      const s = size * rnd(0.6, 1.2)
      d.style.width = d.style.height = s + 'px'
      d.style.background = colors[i % colors.length]
      at(d, x, y)
      const a = dirX ? (dirX > 0 ? rnd(-0.9, 0.3) : Math.PI + rnd(-0.3, 0.9)) : rnd(0, Math.PI * 2)
      const dist = spread * rnd(0.45, 1)
      d.animate(
        [
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * dist}px), calc(-50% + ${Math.sin(a) * dist * 0.75}px)) scale(0.2)`, opacity: 0 },
        ],
        { duration: rnd(380, 620), easing: 'cubic-bezier(.2,.7,.4,1)', fill: 'forwards' },
      ).onfinish = () => d.remove()
    }
  }

  private smoke(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const s = div('puff', this.fx)
      const size = rnd(24, 44)
      s.style.width = s.style.height = size + 'px'
      at(s, x + rnd(-16, 16), y + rnd(-6, 6))
      s.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0.95 },
          { transform: `translate(calc(-50% + ${rnd(-50, 30)}px), calc(-50% - ${rnd(60, 140)}px)) scale(${rnd(1.6, 2.5)})`, opacity: 0 },
        ],
        { duration: rnd(900, 1500), delay: i * 45, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'backwards' },
      ).onfinish = () => s.remove()
    }
  }

  private flare(kind: 'good' | 'bad') {
    const f = div('flare ' + kind, this.world)
    f.animate([{ opacity: 0 }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: kind === 'good' ? 700 : 1000, easing: 'ease-out' }).onfinish = () =>
      f.remove()
  }

  private shake(px = 6) {
    this.world.animate(
      [
        { transform: 'none' },
        { transform: `translate(${-px}px, ${px * 0.5}px)` },
        { transform: `translate(${px}px, ${-px * 0.4}px)` },
        { transform: `translate(${-px * 0.6}px, ${px * 0.3}px)` },
        { transform: `translate(${px * 0.4}px, 0)` },
        { transform: 'none' },
      ],
      { duration: 380, easing: 'ease-out' },
    )
  }

  private coinsFly(x: number, y: number, n: number, total: number) {
    for (let i = 0; i < n; i++) {
      const c = sprite(COIN, 'fly coin', this.fx, 24)
      this.fly(c, {
        x0: x + rnd(-16, 16),
        y0: y + rnd(-6, 6),
        x1: CHALK_COINS.x + rnd(-6, 6),
        y1: CHALK_COINS.y,
        arc: rnd(70, 110),
        dur: 0.55 + i * 0.08,
        r0: 0,
        r1: 360,
        s0: 0.6,
        s1: 1,
        done: () => {
          c.remove()
          if (i === 0) {
            this.ctx.sfx.coin()
            this.chalk(this.chalkCoins, String(total))
          }
        },
      })
    }
  }

  private chalk(el: HTMLElement, text: string) {
    el.textContent = text
    el.animate([{ transform: 'scale(1.6) rotate(-6deg)' }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.3,1.5,.5,1)' })
  }

  private toggleMusic() {
    if (!this.snd.enabled) return
    this.snd.musicWanted = !this.snd.musicWanted
    if (this.snd.musicWanted && this.phase !== 'intro' && this.phase !== 'over') {
      this.snd.wake()
      this.snd.startMusic()
    } else this.snd.stopMusic()
    this.syncMusicBtn()
  }

  private syncMusicBtn() {
    this.musicBtn.classList.toggle(P + 'off', !this.snd.musicWanted)
  }
}

const game: MiniGame = {
  id: 'slice-factory',
  title: 'Slice Factory',
  start(ctx) {
    new SliceFactory(ctx).boot()
  },
}
export default game
