import type { MiniGame, MiniGameContext } from '../types'
import type { Look } from '../../avatar/look'
import type { AvatarView, Pose } from '../../avatar/render'
import './style.css'
import { bagelSfx } from './sound'

/*
  Bagel Counters — Club NYC's homage to Club Penguin's Bean Counters.
  A delivery guy in the back of a box truck tosses coffee sacks and bagel boxes across a SoHo loading alley.
  Catch them on your head (up to 5), walk them over to the pallet by the coffee shop's back door, and dodge
  the cones, flower pots and dive-bombing pigeons. Every 20 deliveries the truck throws faster.
*/

const ID = 'bagel-counters'
/** prefixed class names: k('panel', 'lives') → "bagel-counters-panel bagel-counters-lives" */
const k = (...names: string[]) => names.map((n) => `${ID}-${n}`).join(' ')

const ART = '/art/games/bagel/'
const SRC = {
  bg: '/art/rooms/game-bagel.jpg',
  sack: ART + 'sack.png',
  box: ART + 'bagel-box.png',
  bagel: ART + 'bagel.png',
  cup: ART + 'coffee-cup.png',
  cone: ART + 'cone.png',
  pot: ART + 'flowerpot.png',
  pigeon: ART + 'pigeon.png',
  sackStack: ART + 'sack-stack.png',
}

// ---------- layout (logical px, measured on the 1000 × 565 background) ----------
const FEET_Y = 520 // the player walks along the sidewalk here
const GROUND_Y = 527 // missed things land here
const UNIT = 0.8 // player size (≈120 px tall)
const HEAD_TOP = 127 * UNIT // the carried stack sits this far above the feet
const MIN_X = 66
const MAX_X = 716
const DROP_X = 300 // left of here (in front of the pallet) you unload
const THROWER = { x: 784, y: 334, unit: 0.62 } // standing in the truck's open back
const THROWER_HEAD = 128 * THROWER.unit
const HELD_SCALE = 0.8
const REL_TIME = 0.42 // throw follow-through
const Y_REF = 405 // throws are aimed to cross this height at their target x
const APEX_MIN = 74 // keep arcs on screen, below the HUD
const PALLET = { cx: 233, y: 352, slope: -0.02, scale: 0.8 }
const DOOR = { x: 56, y: 292 } // the coffee shop's back door
const PILE_ROWS = [4, 3, 4, 3, 3, 2, 1]

// ---------- rules ----------
const CATCH_HALF = 40
const BODY_HALF = 16
const LATE_CATCH = 26
const MAX_STACK = 5
const PER_LEVEL = 20
const LEVELS = 5
const START_LIVES = 3
const MAX_LIVES = 5
const DOWN_TIME = 1.35
const INVULN_TIME = 1.3

type Kind = 'sack' | 'box' | 'cone' | 'pot' | 'bagel' | 'cup'
interface KindDef {
  src: string
  w: number
  h: number
  hazard?: boolean
  spin: [number, number]
}
const KIND: Record<Kind, KindDef> = {
  sack: { src: SRC.sack, w: 46, h: 55, spin: [140, 320] },
  box: { src: SRC.box, w: 60, h: 47, spin: [50, 150] },
  cone: { src: SRC.cone, w: 44, h: 54, hazard: true, spin: [280, 520] },
  pot: { src: SRC.pot, w: 35, h: 58, hazard: true, spin: [120, 260] },
  bagel: { src: SRC.bagel, w: 44, h: 36, spin: [520, 820] },
  cup: { src: SRC.cup, w: 33, h: 46, spin: [80, 200] },
}

interface LevelDef {
  /** pause after a throw before the next wind-up (s) */
  gap: number
  /** how long the item is shown over the thrower's head before it flies (s) */
  windup: number
  /** flight time to the aim height (s) */
  T: [number, number]
  g: number
  /** target x range */
  xr: [number, number]
  double: number
  triple: number
  mix: Partial<Record<Kind, number>>
  pigeon: [number, number] | null
  pigeonSpeed: number
  /** chance a hazard is aimed at the player */
  aim: number
  tip: string
}
const LEVEL: LevelDef[] = [
  { gap: 1.0, windup: 0.42, T: [1.2, 1.5], g: 900, xr: [350, 690], double: 0, triple: 0, mix: { sack: 74, box: 18, cone: 8 }, pigeon: null, pigeonSpeed: 0, aim: 0, tip: 'Catch the coffee delivery!' },
  { gap: 0.86, windup: 0.34, T: [1.05, 1.45], g: 1000, xr: [330, 700], double: 0.1, triple: 0, mix: { sack: 62, box: 20, cone: 7, pot: 7, bagel: 4 }, pigeon: null, pigeonSpeed: 0, aim: 0.15, tip: 'Look out for flower pots!' },
  { gap: 0.76, windup: 0.28, T: [0.95, 1.4], g: 1100, xr: [310, 705], double: 0.16, triple: 0, mix: { sack: 58, box: 21, cone: 8, pot: 9, bagel: 4 }, pigeon: [7.5, 11], pigeonSpeed: 320, aim: 0.3, tip: 'Pigeons! Dodge the dive-bombers!' },
  { gap: 0.68, windup: 0.24, T: [0.85, 1.35], g: 1200, xr: [295, 710], double: 0.22, triple: 0.05, mix: { sack: 54, box: 22, cone: 10, pot: 10, bagel: 4 }, pigeon: [5.5, 8.5], pigeonSpeed: 370, aim: 0.45, tip: 'Faster throws!' },
  { gap: 0.6, windup: 0.2, T: [0.75, 1.3], g: 1320, xr: [285, 712], double: 0.28, triple: 0.1, mix: { sack: 50, box: 22, cone: 11, pot: 12, bagel: 5 }, pigeon: [4.5, 7], pigeonSpeed: 410, aim: 0.5, tip: 'Last load: empty the truck!' },
]

const THROWER_LOOK: Look = { skin: 3, hair: 'short', hairColor: 0, items: { head: 'nyc-cap', body: 'tee-blue', legs: 'cargo', feet: 'boots' } }

const STAR_SVG = '<svg viewBox="-12 -12 24 24" width="20" height="20"><path d="M0 -10 L2.9 -3.6 L9.5 -3.1 L4.5 1.4 L5.9 8.1 L0 4.6 L-5.9 8.1 L-4.5 1.4 L-9.5 -3.1 L-2.9 -3.6 Z" fill="#ffd23f" stroke="#1d2140" stroke-width="2.2" stroke-linejoin="round"/></svg>'
const DOWN_ARROW_SVG = '<svg viewBox="0 0 38 44" width="38" height="44"><path d="M11 3 H27 V21 H35 L19 41 L3 21 H11 Z" fill="#ffd166" stroke="#1d2140" stroke-width="3.5" stroke-linejoin="round"/></svg>'
const NEXT_SVG = '<svg viewBox="0 0 26 24" width="26" height="24"><path d="M2 8 H13 V2 L24 12 L13 22 V16 H2 Z" fill="#ffd166" stroke="#1d2140" stroke-width="3" stroke-linejoin="round"/></svg>'

// ---------- tiny math ----------
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const rand = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]
const sign = () => (Math.random() < 0.5 ? -1 : 1)
const approach = (v: number, to: number, d: number) => (v < to ? Math.min(to, v + d) : Math.max(to, v - d))
const easeOut = (t: number) => 1 - (1 - t) * (1 - t)
const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const easeOutBack = (t: number) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2
/** deterministic wiggle so the pallet pile looks hand-stacked */
const jit = (i: number, a: number) => Math.sin(i * 12.9898 + 4.1) * a

// ---------- sound (shared synth via ctx.sfx, plus a few thuds of our own) ----------
let actx: AudioContext | null = null
let noiseBuf: AudioBuffer | null = null
let muteCheck = { at: -1e9, muted: false }
/** our extra sounds follow the world's sound toggle (persisted in the save) */
function hostMuted(): boolean {
  const now = performance.now()
  if (now - muteCheck.at > 1000) {
    let muted = false
    try {
      muted = !!(JSON.parse(localStorage.getItem('club-nyc:v2') ?? '{}') as { muted?: boolean }).muted
    } catch {
      /* storage unavailable */
    }
    muteCheck = { at: now, muted }
  }
  return muteCheck.muted
}
function audio(): AudioContext | null {
  if (hostMuted()) return null
  try {
    actx ??= new AudioContext()
    if (actx.state === 'suspended') void actx.resume()
    return actx
  } catch {
    return null
  }
}
function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.12, delay = 0, slideTo?: number) {
  const a = audio()
  if (!a) return
  const t = a.currentTime + delay
  const o = a.createOscillator()
  const g = a.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, t)
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(a.destination)
  o.start(t)
  o.stop(t + dur + 0.05)
}
function noise(dur: number, vol = 0.1, freq = 800, delay = 0, type: BiquadFilterType = 'bandpass') {
  const a = audio()
  if (!a) return
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate)
    const d = noiseBuf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  }
  const t = a.currentTime + delay
  const src = a.createBufferSource()
  src.buffer = noiseBuf
  const f = a.createBiquadFilter()
  f.type = type
  f.frequency.value = freq
  const g = a.createGain()
  g.gain.setValueAtTime(vol, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(a.destination)
  src.start(t, Math.random() * 0.4)
  src.stop(t + dur + 0.05)
}
const NOTE = (n: number) => 440 * 2 ** ((n - 69) / 12)
const snd = {
  /** catching: climbs a little scale as the stack grows */
  catch: (n: number) => {
    const m = [67, 69, 71, 74, 76, 79][clamp(n, 0, 5)]
    tone(NOTE(m), 0.16, 'triangle', 0.13)
    tone(NOTE(m + 12), 0.09, 'sine', 0.05, 0.02)
    noise(0.06, 0.07, 500)
  },
  thud: () => {
    tone(150, 0.2, 'sine', 0.24, 0, 50)
    noise(0.14, 0.13, 260)
  },
  tok: () => {
    tone(760, 0.07, 'square', 0.045, 0, 420)
    tone(560, 0.07, 'square', 0.035, 0.08, 330)
  },
  crash: () => {
    noise(0.32, 0.2, 3400, 0, 'highpass')
    noise(0.16, 0.14, 900)
    tone(320, 0.14, 'triangle', 0.07, 0, 130)
  },
  bonk: (soft = false) => {
    tone(soft ? 520 : 420, soft ? 0.1 : 0.18, 'square', soft ? 0.04 : 0.08, 0, 160)
    if (!soft) tone(140, 0.25, 'sine', 0.2, 0.02, 60)
  },
  crunch: () => {
    for (let i = 0; i < 4; i++) noise(0.07, 0.16, 400 + i * 300, i * 0.045)
    tone(110, 0.3, 'sawtooth', 0.06, 0, 50)
  },
  flap: () => {
    for (let i = 0; i < 5; i++) noise(0.05, 0.05, 1600, i * 0.08)
  },
  swish: () => noise(0.16, 0.035, 1100),
  deliver: (i: number) => tone(NOTE(72 + (i % 8) * 2), 0.09, 'square', 0.04),
  splash: () => {
    noise(0.3, 0.12, 1300)
    tone(480, 0.2, 'sine', 0.05, 0, 190)
  },
  chomp: () => {
    noise(0.05, 0.12, 700)
    noise(0.05, 0.12, 900, 0.1)
  },
  lose: () => {
    tone(NOTE(67), 0.24, 'triangle', 0.12)
    tone(NOTE(63), 0.24, 'triangle', 0.12, 0.22)
    tone(NOTE(60), 0.55, 'triangle', 0.12, 0.44)
  },
}

// ---------- DOM helpers ----------
function div(names: string, parent?: HTMLElement, html?: string): HTMLDivElement {
  const d = document.createElement('div')
  d.className = k(...names.split(' '))
  if (html) d.innerHTML = html
  parent?.append(d)
  return d
}
/** a zero-size element at the anchor with the image hanging off it (ax/ay = anchor inside the image) */
function sprite(parent: HTMLElement, src: string, w: number, h: number, ax = 0.5, ay = 0.5): HTMLDivElement {
  const el = document.createElement('div')
  el.className = k('sprite')
  const img = new Image()
  img.src = src
  img.alt = ''
  img.draggable = false
  img.style.cssText = `left:${(-w * ax).toFixed(1)}px;top:${(-h * ay).toFixed(1)}px;width:${w.toFixed(1)}px;height:${h.toFixed(1)}px`
  el.append(img)
  parent.append(el)
  return el
}
function place(el: HTMLElement, x: number, y: number, r = 0, sx = 1, sy = sx, o?: number) {
  el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${r.toFixed(1)}deg) scale(${sx.toFixed(3)},${sy.toFixed(3)})`
  if (o !== undefined) el.style.opacity = o.toFixed(2)
}
/** override an avatar's arm angles after `update()` (e.g. arms up to balance a stack) */
function setArms(v: AvatarView, l: number, r: number) {
  const svg = v.el.firstElementChild
  svg?.querySelector('.av-armL')?.setAttribute('transform', `rotate(${l.toFixed(1)} -17 -67)`)
  svg?.querySelector('.av-armR')?.setAttribute('transform', `rotate(${r.toFixed(1)} 17 -67)`)
}
function bump(el: HTMLElement) {
  el.classList.remove(k('bump'))
  void el.offsetWidth
  el.classList.add(k('bump'))
}
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = rej
    i.src = src
  })
}

/** The sacks on your head and on the pallet lie flat: cut the top sack out of sack-stack.png. */
async function cutLyingSack(): Promise<{ src: string; aspect: number } | null> {
  try {
    const img = await loadImage(SRC.sackStack)
    const w = img.naturalWidth
    const h = img.naturalHeight
    const cv = document.createElement('canvas')
    cv.width = w
    cv.height = h
    const g = cv.getContext('2d', { willReadFrequently: true })
    if (!g) return null
    g.drawImage(img, 0, 0)
    const id = g.getImageData(0, 0, w, h)
    const d = id.data
    const s = h / 220
    const y0 = Math.round(62 * s)
    const y1 = Math.round(99 * s)
    const navy = (i: number) => d[i + 3] > 100 && d[i + 2] > d[i] + 8 && d[i] + d[i + 1] + d[i + 2] < 330
    // per column: cut below the top sack's dark bottom outline (or where it ends in transparency)
    const cuts: number[] = []
    for (let x = 0; x < w; x++) {
      let cut = -1
      let lastNavy = -1
      for (let y = y0; y < y1; y++) {
        const i = (y * w + x) * 4
        if (d[i + 3] < 40) {
          cut = y
          break
        }
        if (navy(i)) lastNavy = y + 1
      }
      cuts.push(cut >= 0 ? cut : lastNavy >= 0 ? lastNavy : y0)
    }
    // morphological opening removes thin spikes (rope ends, the next sack's outline)
    const R = Math.max(2, Math.round(4 * s))
    const ero = cuts.map((_, x) => Math.min(...cuts.slice(Math.max(0, x - R), x + R + 1)))
    const open = ero.map((_, x) => Math.max(...ero.slice(Math.max(0, x - R), x + R + 1)))
    for (let x = 0; x < w; x++) for (let y = open[x]; y < h; y++) d[(y * w + x) * 4 + 3] = 0
    let minX = w
    let maxX = 0
    let minY = h
    let maxY = 0
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (d[(y * w + x) * 4 + 3] > 8) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
    if (maxX <= minX || maxY <= minY) return null
    g.putImageData(id, 0, 0)
    const out = document.createElement('canvas')
    out.width = maxX - minX + 1
    out.height = maxY - minY + 1
    out.getContext('2d')?.drawImage(cv, minX, minY, out.width, out.height, 0, 0, out.width, out.height)
    const blob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/png'))
    const src = blob ? URL.createObjectURL(blob) : out.toDataURL('image/png')
    await loadImage(src) // decoded before the first catch
    return { src, aspect: out.height / out.width }
  } catch {
    return null
  }
}

// ---------- entities ----------
interface Flyer {
  kind: Kind
  src: string
  el: HTMLDivElement
  shadow: HTMLDivElement
  x: number
  y: number
  vx: number
  vy: number
  g: number
  rot: number
  vrot: number
  w: number
  h: number
  rad: number
  scale: number
  /** no longer catchable (bounced off you or scattered from your stack) */
  dropped: boolean
  bounces: number
  lying: boolean
  /** came from the truck (not scattered off your head) */
  thrown: boolean
  dead: boolean
}
interface Carried {
  kind: 'sack' | 'box'
  src: string
  el: HTMLDivElement
  w: number
  h: number
  step: number
  sq: number
  sqV: number
  dx: number
  jx: number
  jr: number
  lx: number
  ly: number
  lr: number
}
interface Piled {
  el: HTMLDivElement
  x: number
  y: number
  r: number
  h: number
  t: number
}
interface Arc {
  el: HTMLDivElement
  x0: number
  y0: number
  x1: number
  y1: number
  r0: number
  r1: number
  s0: number
  s1: number
  h: number
  t: number
  dur: number
  fade?: boolean
  done?: () => void
  dead?: boolean
}
interface Part {
  el: HTMLElement
  x: number
  y: number
  vx: number
  vy: number
  g: number
  r: number
  vr: number
  t: number
  life: number
  s0: number
  s1: number
  floor?: number
  bounce?: number
  drag?: number
  pop?: boolean
}
interface Decal {
  el: HTMLDivElement
  x: number
  y: number
  r: number
  t: number
  life: number
  squash: boolean
}
interface Held {
  kind: Kind
  el: HTMLDivElement
  t: number
  windup: number
  lx: number
  ly: number
}
interface Pigeon {
  el: HTMLDivElement
  shadow: HTMLDivElement
  x: number
  y: number
  x0: number
  y0: number
  dipX: number
  dipY: number
  x1: number
  y1: number
  speed: number
  t: number
  hit: boolean
  dead: boolean
}

function run(ctx: MiniGameContext) {
  const root = ctx.root
  root.replaceChildren()
  root.classList.add(k('root'))
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  for (const s of Object.values(SRC)) new Image().src = s // warm the cache

  let lying = { src: SRC.sack, aspect: 1.2, ok: false }
  let exited = false
  void cutLyingSack().then((r) => {
    if (!r) return
    if (exited) {
      if (r.src.startsWith('blob:')) URL.revokeObjectURL(r.src)
      return
    }
    lying = { ...r, ok: true }
  })
  const carriedLook = (kind: 'sack' | 'box') => {
    if (kind === 'box') return { src: SRC.box, w: 58, h: 45.4, step: 33 }
    if (!lying.ok) return { src: SRC.sack, w: 40, h: 48, step: 34 }
    const w = 66
    const h = w * lying.aspect
    return { src: lying.src, w, h, step: h - 9 }
  }

  // ---------- scene ----------
  const world = div('shake', root)
  const bg = new Image()
  bg.className = k('bg')
  bg.src = SRC.bg
  bg.alt = ''
  bg.draggable = false
  world.append(bg)
  const zone = div('zone', world, '<span>DROP ZONE</span>')
  const pileL = div('layer', world)
  const throwL = div('layer', world)
  const groundL = div('layer', world)
  const playerL = div('layer', world)
  const flyL = div('layer', world)
  const fxL = div('layer', world)

  // delivery guy in the truck
  const tWrap = div('actor', throwL)
  place(tWrap, THROWER.x, THROWER.y)
  const tBody = div('actor', tWrap)
  const tv = ctx.avatar(THROWER_LOOK, THROWER.unit)
  tBody.append(tv.el)
  tv.face(-1, false)

  // the player
  const pWrap = div('actor', playerL)
  const pShadow = div('shadow', pWrap)
  place(pShadow, 0, 0, 0, 1.15, 1)
  const pBody = div('actor', pWrap)
  const pv = ctx.avatar(ctx.look, UNIT)
  pBody.append(pv.el)
  const pStack = div('actor', pWrap)
  const stars = [0, 1, 2].map(() => {
    const s = div('star', fxL, STAR_SVG)
    s.style.display = 'none'
    return s
  })
  const fullTag = div('full', fxL, 'FULL! Unload ◂')
  const hint = div('hint', fxL, DOWN_ARROW_SVG)

  // ---------- HUD ----------
  const hud = div('hud hidden', root)
  const livesEl = div('panel lives', hud)
  const levelEl = div('panel level', hud, `<span class="${k('level-name')}">Level 1</span><div class="${k('bar')}"><i></i><b>0 / ${PER_LEVEL}</b></div>`)
  const scoreEl = div('panel score', hud, `<img src="${SRC.sackStack}" alt=""><span><small>DELIVERED</small><b>0</b></span>`)
  const levelName = levelEl.querySelector('span') as HTMLElement
  const barFill = levelEl.querySelector('i') as HTMLElement
  const barText = levelEl.querySelector('b') as HTMLElement
  const scoreNum = scoreEl.querySelector('b') as HTMLElement
  const bannerEl = div('banner', root)

  // ---------- intro card ----------
  const overlay = div('overlay', root)
  overlay.innerHTML = `
    <div class="${k('card')}">
      <div class="${k('title')}"><span>Bagel</span><span>Counters</span></div>
      <div class="${k('how')}">
        <div class="${k('step')}">
          <div class="${k('icons')}"><img src="${SRC.sack}" alt=""><img class="${k('sm')}" src="${SRC.box}" alt=""></div>
          <b>Catch</b><span>Stack up to 5 sacks &amp; boxes on your head</span>
        </div>
        <div class="${k('next')}">${NEXT_SVG}</div>
        <div class="${k('step')}">
          <div class="${k('icons')}"><img src="${SRC.sackStack}" alt=""></div>
          <b>Deliver</b><span>Walk left to the pallet to unload</span>
        </div>
        <div class="${k('step', 'bad')}">
          <div class="${k('icons')}"><img class="${k('sm')}" src="${SRC.cone}" alt=""><img class="${k('sm')}" src="${SRC.pot}" alt=""><img class="${k('sm')}" src="${SRC.pigeon}" alt=""></div>
          <b>Dodge</b><span>Cones, flower pots &amp; pigeons cost a life</span>
        </div>
      </div>
      <p class="${k('tip')}">Move with the mouse or <kbd>←</kbd> <kbd>→</kbd>. Catch a deli coffee <img src="${SRC.cup}" alt=""> for an extra life!</p>
      <button class="btn ${k('start')}">Start</button>
    </div>`
  const startBtn = overlay.querySelector('button') as HTMLButtonElement

  // ---------- state ----------
  type Phase = 'intro' | 'ready' | 'play' | 'over'
  let phase: Phase = 'intro'
  let clock = 0
  let level = 1
  let delivered = 0
  let inLevel = 0 // delivered this level
  let reserved = 0 // pile slots handed out this level (includes sacks still in the air)
  let epoch = 0 // bumps every level so in-flight deliveries land on the fresh pile
  let lives = START_LIVES
  let levelBonus = 0
  let loadBonus = 0
  let bagelBonus = 0
  let loadRun = 0
  let streak = 0 // catches in a row without a delivery hitting the ground
  let pause = 0 // the truck waits (level transitions)
  let won = false
  let finished = false
  let endAt = -1

  const P = {
    x: 470,
    vx: 0,
    prevVx: 0,
    target: 470,
    keys: false,
    left: false,
    right: false,
    face: 1 as 1 | -1,
    down: 0,
    downKind: 'fall' as 'fall' | 'flat',
    downDir: -1 as 1 | -1,
    invuln: 0,
    sq: 0,
    sqV: 0,
    th: 0,
    thV: 0,
    cheer: 0,
  }
  const stack: Carried[] = []
  let stackTop = -HEAD_TOP // local y of the stack's top (relative to the feet)
  let unloadCD = 0
  const flyers: Flyer[] = []
  const pile: Piled[] = []
  const arcs: Arc[] = []
  const parts: Part[] = []
  const decals: Decal[] = []
  const pigeons: Pigeon[] = []
  const timers: { at: number; fn: () => void }[] = []
  let held: Held | null = null
  let throwCD = 0.4
  let burst = 0
  let hazardRun = 0
  let cupThrown = false
  let pigeonCD = 0
  const T = { lean: 0, rel: 0, cheer: 0, oops: 0 }
  let shakeT = 0
  let shakeAmp = 0
  let bannerT = 0

  const LV = () => LEVEL[clamp(level, 1, LEVELS) - 1]
  const later = (sec: number, fn: () => void) => timers.push({ at: clock + sec, fn })

  // ---------- input ----------
  const onPointer = (e: PointerEvent) => {
    const p = ctx.toLocal(e)
    P.target = clamp(p.x, MIN_X, MAX_X)
    P.keys = false
  }
  const onKey = (e: KeyboardEvent, down: boolean) => {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
    const key = e.key
    if (key === 'ArrowLeft' || key === 'a' || key === 'A') P.left = down
    else if (key === 'ArrowRight' || key === 'd' || key === 'D') P.right = down
    else return
    if (down) P.keys = true
    if (key.startsWith('Arrow')) e.preventDefault()
  }
  const kd = (e: KeyboardEvent) => onKey(e, true)
  const ku = (e: KeyboardEvent) => onKey(e, false)
  const blur = () => {
    P.left = false
    P.right = false
  }
  root.addEventListener('pointermove', onPointer)
  root.addEventListener('pointerdown', onPointer)
  addEventListener('keydown', kd)
  addEventListener('keyup', ku)
  addEventListener('blur', blur)

  // ---------- HUD ----------
  function renderLives() {
    const slots = Math.max(START_LIVES, lives)
    while (livesEl.children.length < slots) {
      const i = new Image()
      i.src = SRC.cup
      i.alt = ''
      livesEl.append(i)
    }
    while (livesEl.children.length > slots) livesEl.lastElementChild?.remove()
    Array.from(livesEl.children).forEach((c, i) => c.classList.toggle(k('lost'), i >= lives))
  }
  function renderLevel() {
    levelName.textContent = level >= LEVELS ? `Level ${level} · Final load` : `Level ${level}`
    barFill.style.width = `${(clamp(inLevel, 0, PER_LEVEL) / PER_LEVEL) * 100}%`
    barText.textContent = `${clamp(inLevel, 0, PER_LEVEL)} / ${PER_LEVEL}`
  }
  function renderScore() {
    scoreNum.textContent = String(delivered)
    bump(scoreEl)
  }
  function banner(big: string, sub = '', dur = 1.6, tone: '' | 'good' | 'bad' = '') {
    bannerEl.className = k('banner', ...(tone ? [tone] : []))
    bannerEl.innerHTML = `<div class="${k('banner-big')}">${big}</div>` + (sub ? `<div class="${k('banner-sub')}">${sub}</div>` : '')
    void bannerEl.offsetWidth
    bannerEl.classList.add(k('on'))
    bannerT = dur
  }
  renderLives()
  renderLevel()

  // ---------- fx ----------
  function addPart(el: HTMLElement, x: number, y: number, o: Partial<Part> = {}) {
    fxL.append(el)
    const p: Part = { el, x, y, vx: 0, vy: 0, g: 0, r: 0, vr: 0, t: 0, life: 1, s0: 1, s1: 1, ...o }
    parts.push(p)
    place(el, x, y, p.r, p.pop ? 0.01 : p.s0)
    return p
  }
  function dust(x: number, y: number, n = 4, size = 1) {
    for (let i = 0; i < n; i++)
      addPart(div('dust'), x + rand(-14, 14) * size, y - rand(0, 6), {
        vx: rand(-70, 70) * size,
        vy: rand(-55, -15),
        drag: 3,
        life: rand(0.35, 0.55),
        s0: 0.35 * size,
        s1: rand(1, 1.35) * size,
      })
  }
  function ring(x: number, y: number) {
    const el = div('dust')
    el.style.background = 'transparent'
    el.style.boxShadow = 'none'
    el.style.border = '2.5px solid #fff'
    el.style.boxSizing = 'border-box'
    addPart(el, x, y, { life: 0.26, s0: 0.5, s1: 1.6 })
  }
  function floatText(x: number, y: number, text: string, style = '') {
    const el = div('float' + (style ? ' ' + style : ''), undefined, `<span>${text}</span>`)
    addPart(el, x, y, { vy: -70, drag: 1.2, life: 1.0, pop: true })
  }
  function beans(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++)
      addPart(div('bean'), x + rand(-8, 8), y - 6, {
        vx: rand(-170, 170),
        vy: rand(-340, -160),
        g: 1500,
        vr: rand(-720, 720),
        floor: GROUND_Y + rand(0, 8),
        bounce: 0.35,
        drag: 0.6,
        life: rand(0.9, 1.3),
      })
  }
  function shatter(x: number) {
    for (let i = 0; i < 8; i++)
      addPart(div('shard'), x + rand(-10, 10), GROUND_Y - 10, {
        vx: rand(-230, 230),
        vy: rand(-420, -200),
        g: 1500,
        r: rand(0, 360),
        vr: rand(-900, 900),
        floor: GROUND_Y + rand(0, 6),
        bounce: 0.3,
        drag: 0.8,
        life: rand(0.9, 1.3),
        s0: rand(0.8, 1.3),
        s1: rand(0.8, 1.3),
      })
    for (let i = 0; i < 7; i++)
      addPart(div('dirt'), x + rand(-10, 10), GROUND_Y - 8, { vx: rand(-150, 150), vy: rand(-300, -120), g: 1400, floor: GROUND_Y + 4, life: rand(0.6, 0.9), s0: rand(0.7, 1.3) })
    addPart(div('petal'), x, GROUND_Y - 14, { vx: rand(-60, 60), vy: -430, g: 1300, vr: 400, floor: GROUND_Y, bounce: 0.4, life: 1.4, s0: 1.2, s1: 1.2 })
    dust(x, GROUND_Y, 3, 0.8)
  }
  function splashCoffee(x: number) {
    for (let i = 0; i < 9; i++)
      addPart(div('drop'), x + rand(-6, 6), GROUND_Y - 10, { vx: rand(-160, 160), vy: rand(-330, -140), g: 1400, floor: GROUND_Y + 2, life: rand(0.5, 0.8), s0: rand(0.7, 1.2) })
  }
  function feathers(x: number, y: number) {
    for (let i = 0; i < 7; i++)
      addPart(div('feather'), x + rand(-12, 12), y + rand(-8, 8), { vx: rand(-120, 120), vy: rand(-160, -40), g: 160, drag: 2.2, r: rand(0, 180), vr: rand(-260, 260), life: rand(1.0, 1.5) })
  }
  function crumbs(x: number, y: number) {
    for (let i = 0; i < 6; i++) {
      const el = div('dirt')
      el.style.background = '#e2a65a'
      addPart(el, x + rand(-10, 10), y, { vx: rand(-110, 110), vy: rand(-200, -60), g: 900, life: rand(0.4, 0.7), s0: rand(0.5, 1) })
    }
  }
  function confetti(n: number) {
    const cols = ['#ff5a4e', '#ffd166', '#6fb6ff', '#8ff07d', '#ff8fc8', '#fff']
    for (let i = 0; i < n; i++) {
      const el = div('confetti')
      el.style.background = pick(cols)
      addPart(el, rand(80, 920), rand(-60, -10), { vx: rand(-40, 40), vy: rand(40, 160), g: 120, drag: 0.4, r: rand(0, 360), vr: rand(-500, 500), life: rand(2.2, 3.4) })
    }
  }
  function decal(src: string, x: number, y: number, w: number, h: number, r = 0, ax = 0.5, ay = 1, squash = true, life = 1.5) {
    const el = sprite(groundL, src, w, h, ax, ay)
    const d: Decal = { el, x, y, r, t: 0, life, squash }
    decals.push(d)
    place(el, x, y, r)
    return d
  }
  function shake(amp: number, dur: number) {
    if (reduced) return
    shakeAmp = Math.max(shakeAmp, amp)
    shakeT = Math.max(shakeT, dur)
  }

  // ---------- the stack ----------
  function addToStack(kind: 'sack' | 'box', dx: number) {
    const look = carriedLook(kind)
    const el = sprite(pStack, look.src, look.w, look.h, 0.5, 1)
    const cdx = clamp(dx, -30, 30)
    place(el, cdx, stackTop, 0, 1.3, 0.58) // until the next layout pass
    for (const s of stack) s.sqV += 3.2
    stack.push({ kind, src: look.src, el, w: look.w, h: look.h, step: look.step, sq: 0.42, sqV: 0, dx: cdx, jx: rand(-3, 3), jr: rand(-4, 4), lx: cdx, ly: stackTop, lr: 0 })
    P.sqV += 2.4
    P.thV += dx * 0.012
    loadRun = 0
    snd.catch(stack.length - 1)
    if (kind === 'sack') bagelSfx.catchSack()
    else bagelSfx.catchBox()
    ring(P.x + dx * 0.4, FEET_Y + stackTop)
  }
  function scatterStack() {
    stack.forEach((it, i) => {
      const f = makeFlyer(it.kind, P.x + it.lx, FEET_Y + it.ly - it.h / 2, rand(-210, 210), rand(-440, -260) - i * 30, 1300, it.kind === 'sack' && lying.ok, it.w, it.h)
      f.src = it.src
      f.dropped = true
      f.rot = it.lr
      it.el.remove()
    })
    stack.length = 0
  }
  function hurt(kind: 'fall' | 'flat', fromX: number) {
    if (P.down > 0 || phase === 'over' || phase === 'intro') return
    lives = Math.max(0, lives - 1)
    renderLives()
    bump(livesEl)
    P.down = DOWN_TIME
    P.downKind = kind
    P.downDir = fromX >= P.x ? -1 : 1
    P.vx = 0
    scatterStack()
    streak = 0
    shake(kind === 'flat' ? 7 : 10, 0.42)
    T.oops = 1.4
    if (kind === 'flat') {
      snd.crunch()
      floatText(P.x, FEET_Y - 150, 'Too heavy!', 'bad')
    } else {
      snd.bonk()
      floatText(P.x, FEET_Y - 150, pick(['Ouch!', 'Bonk!', 'Oof!']), 'bad')
    }
    dust(P.x, FEET_Y, 6, 1.2)
    if (lives <= 0) {
      phase = 'over'
      dropHeld()
      later(0.9, gameOver)
    }
  }
  function bounceOff(f: Flyer) {
    f.dropped = true
    f.vy = -Math.max(200, Math.abs(f.vy) * 0.45)
    f.vx = (f.x >= P.x ? 1 : -1) * rand(120, 210)
    f.vrot = -f.vrot * 1.4
  }
  function contact(f: Flyer) {
    if (KIND[f.kind].hazard) {
      hurt('fall', f.x + 1)
      bounceOff(f)
      return
    }
    if (f.kind === 'cup') {
      kill(f)
      lives = Math.min(MAX_LIVES, lives + 1)
      renderLives()
      bump(livesEl)
      ctx.sfx.ding()
      floatText(P.x, FEET_Y + stackTop - 30, '+1 life!', 'good big')
      ring(f.x, f.y)
      return
    }
    if (f.kind === 'bagel') {
      kill(f)
      bagelBonus += 2
      snd.chomp()
      ctx.sfx.pop()
      crumbs(f.x, f.y)
      floatText(P.x, FEET_Y + stackTop - 30, 'Fresh bagel! +2', 'gold')
      return
    }
    if (stack.length >= MAX_STACK) {
      // Bean Counters rule: one too many and down you go
      f.dropped = true
      hurt('flat', P.x)
      f.vy = -260
      f.vx = sign() * 140
      return
    }
    addToStack(f.kind as 'sack' | 'box', f.x - P.x)
    kill(f)
    streak++
    const n = streak
    if (n % 5 === 0) later(0.12, () => floatText(P.x, FEET_Y + stackTop - 34, `${n} in a row!`, 'good'))
  }

  // ---------- flyers ----------
  function makeFlyer(kind: Kind, x: number, y: number, vx: number, vy: number, g: number, lyingSack = false, w?: number, h?: number): Flyer {
    const d = KIND[kind]
    const src = lyingSack ? lying.src : d.src
    const ww = w ?? d.w
    const hh = h ?? d.h
    const el = sprite(flyL, src, ww, hh)
    const shadow = div('shadow', groundL)
    const f: Flyer = {
      kind,
      src,
      el,
      shadow,
      x,
      y,
      vx,
      vy,
      g,
      rot: rand(-8, 8),
      vrot: rand(d.spin[0], d.spin[1]) * sign(),
      w: ww,
      h: hh,
      rad: (ww + hh) / 4,
      scale: 1,
      dropped: false,
      bounces: 0,
      lying: lyingSack,
      thrown: false,
      dead: false,
    }
    flyers.push(f)
    drawFlyer(f)
    return f
  }
  function kill(f: Flyer) {
    f.dead = true
    f.el.remove()
    f.shadow.remove()
  }
  function drawFlyer(f: Flyer) {
    place(f.el, f.x, f.y, f.rot, f.scale)
    const near = clamp(1 - (GROUND_Y - f.y) / 380, 0.12, 1)
    place(f.shadow, f.x, GROUND_Y + 1, 0, near * (f.w / 60) * 1.1, near * 0.9, 0.25 + 0.6 * near)
  }
  function launch(kind: Kind, x0: number, y0: number) {
    const L = LV()
    let xt = rand(L.xr[0], L.xr[1])
    if (KIND[kind].hazard && Math.random() < L.aim) xt = clamp(P.x + rand(-30, 30), L.xr[0], L.xr[1])
    const g = L.g * rand(0.93, 1.07)
    const dy = Y_REF - y0
    const vmax = Math.sqrt(2 * g * Math.max(10, y0 - APEX_MIN))
    const tMax = (vmax + Math.sqrt(vmax * vmax + 2 * g * dy)) / g
    const t = Math.min(rand(L.T[0], L.T[1]), tMax)
    const f = makeFlyer(kind, x0, y0, (xt - x0) / t, (dy - 0.5 * g * t * t) / t, g)
    f.thrown = true
    f.scale = HELD_SCALE
    drawFlyer(f)
  }
  function land(f: Flyer) {
    const x = f.x
    if (f.thrown && (f.kind === 'sack' || f.kind === 'box')) streak = 0 // a delivery hit the sidewalk
    switch (f.kind) {
      case 'cone':
        if (f.bounces < 1) {
          f.bounces++
          f.y = GROUND_Y - f.rad * f.scale
          f.vy = -Math.abs(f.vy) * 0.32
          f.vx *= 0.5
          f.vrot = f.vx * 2.4
          snd.tok()
          dust(x, GROUND_Y, 2, 0.6)
          return
        }
        snd.tok()
        decal(SRC.cone, x, GROUND_Y - f.w * 0.5 + 2, f.w, f.h, f.vx <= 0 ? -90 : 90, 0.5, 0.5)
        break
      case 'pot':
        snd.crash()
        shatter(x)
        break
      case 'cup':
        snd.splash()
        splashCoffee(x)
        decal(SRC.cup, x, GROUND_Y - f.w * 0.5 + 2, f.w, f.h, f.vx <= 0 ? -90 : 90, 0.5, 0.5)
        {
          const p = div('puddle', groundL)
          decals.push({ el: p, x: x + 8, y: GROUND_Y, r: 0, t: 0, life: 1.6, squash: false })
        }
        break
      case 'bagel': {
        // a dropped bagel rolls off down the sidewalk
        const el = sprite(fxL, SRC.bagel, f.w * 0.9, f.h * 0.9)
        const dir = f.vx <= 0 ? -1 : 1
        addPart(el, x, GROUND_Y - 14, { vx: dir * 220, vr: dir * 520, life: 1.6 })
        snd.tok()
        break
      }
      case 'sack': {
        snd.thud()
        bagelSfx.beans()
        beans(x, GROUND_Y, 7)
        dust(x, GROUND_Y, 4)
        const look = carriedLook('sack')
        decal(look.src, x, GROUND_Y + 2, look.w, look.h, rand(-5, 5))
        break
      }
      case 'box': {
        snd.thud()
        dust(x, GROUND_Y, 4)
        decal(SRC.box, x, GROUND_Y + 2, 58, 45.4, rand(-6, 6))
        const el = sprite(fxL, SRC.bagel, 22, 18)
        const dir = Math.random() < 0.5 ? -1 : 1
        addPart(el, x + dir * 12, GROUND_Y - 9, { vx: dir * rand(110, 170), vy: -160, g: 900, floor: GROUND_Y - 9, bounce: 0.2, vr: dir * 600, life: 1.3 })
        break
      }
    }
    kill(f)
  }
  function updateFlyers(dt: number) {
    const top = FEET_Y + stackTop
    const canCatch = P.down <= 0 && (phase === 'play' || phase === 'ready')
    for (const f of flyers) {
      if (f.dead) continue
      f.vy += f.g * dt
      f.x += f.vx * dt
      f.y += f.vy * dt
      f.rot += f.vrot * dt
      if (f.scale < 1) f.scale = Math.min(1, f.scale + dt * 0.35)
      if (!f.dropped && f.vy > 0 && canCatch) {
        const hz = !!KIND[f.kind].hazard
        if (!(hz && P.invuln > 0)) {
          const bottom = f.y + f.rad * f.scale * 0.85
          const dx = f.x - P.x
          const win = (hz ? 12 : LATE_CATCH) + f.vy * dt
          if (bottom >= top && bottom <= top + win && Math.abs(dx) <= CATCH_HALF - (hz ? 4 : 0)) {
            contact(f)
            if (f.dead) continue
          } else if (bottom > top && f.y < FEET_Y - 14 && Math.abs(dx) < BODY_HALF + f.w * 0.28 * f.scale) {
            if (hz) hurt('fall', f.x + 1)
            else snd.bonk(true)
            bounceOff(f)
          }
        }
      }
      if (f.vy > 0 && f.y + f.rad * f.scale >= GROUND_Y) {
        land(f)
        if (f.dead) continue
      }
      if (f.x < -100 || f.x > 1100 || f.y > 660) kill(f)
      else drawFlyer(f)
    }
    for (let i = flyers.length - 1; i >= 0; i--) if (flyers[i].dead) flyers.splice(i, 1)
  }

  // ---------- the delivery guy ----------
  function pickKind(): Kind {
    const L = LV()
    if (level >= 2 && !cupThrown && lives < START_LIVES && Math.random() < 0.14) {
      cupThrown = true
      return 'cup'
    }
    const entries = Object.entries(L.mix) as [Kind, number][]
    let r = Math.random() * entries.reduce((a, [, w]) => a + w, 0)
    let kind: Kind = 'sack'
    for (const [kk, w] of entries) {
      r -= w
      if (r <= 0) {
        kind = kk
        break
      }
    }
    if (KIND[kind].hazard && hazardRun >= 2) kind = 'sack'
    hazardRun = KIND[kind].hazard ? hazardRun + 1 : 0
    return kind
  }
  function beginHold(kind: Kind, windup: number) {
    const d = KIND[kind]
    const w = d.w * HELD_SCALE
    const h = d.h * HELD_SCALE
    const lx = -3
    const ly = -THROWER_HEAD - h / 2 + 7
    const el = sprite(tBody, d.src, w, h)
    place(el, lx, ly)
    held = { kind, el, t: 0, windup, lx, ly }
  }
  function dropHeld() {
    held?.el.remove()
    held = null
  }
  function release() {
    if (!held) return
    const h = held
    held = null
    const a = (T.lean * Math.PI) / 180
    const x = THROWER.x + h.lx * Math.cos(a) - h.ly * Math.sin(a)
    const y = THROWER.y + h.lx * Math.sin(a) + h.ly * Math.cos(a)
    h.el.remove()
    launch(h.kind, x, y)
    T.rel = REL_TIME
    snd.swish()
  }
  function throwLogic(dt: number) {
    if (held && phase !== 'intro') {
      held.t += dt
      if (held.t >= held.windup) release()
      return
    }
    if (phase !== 'play' || pause > 0) return
    throwCD -= dt
    if (throwCD > 0) return
    const L = LV()
    const quick = burst > 0
    if (quick) burst--
    else if (Math.random() < L.double) burst = Math.random() < L.triple ? 2 : 1
    beginHold(pickKind(), quick ? L.windup * 0.55 : L.windup * rand(0.9, 1.15))
    throwCD = burst > 0 ? 0.08 : L.gap * rand(0.85, 1.2)
  }
  function animateThrower(dt: number) {
    if (T.rel > 0) T.rel = Math.max(0, T.rel - dt)
    if (T.cheer > 0) T.cheer -= dt
    if (T.oops > 0) T.oops -= dt
    let lean = 0
    if (held) lean = 10 * easeInOut(Math.min(1, held.t / Math.max(0.01, held.windup)))
    else if (T.rel > 0) {
      const p = 1 - T.rel / REL_TIME
      lean = p < 0.2 ? lerp(10, -14, easeOut(p / 0.2)) : lerp(-14, 0, easeInOut((p - 0.2) / 0.8))
    }
    T.lean = lean
    place(tBody, 0, 0, lean)
    tv.setPose(T.cheer > 0 ? 'cheer' : 'idle')
    tv.setMood(T.oops > 0 ? 'o' : T.cheer > 0 ? 'grin' : 'smile')
    tv.update(dt)
    if (T.cheer <= 0) {
      if (held) {
        const w = Math.sin(clock * 10) * 3
        setArms(tv, 136 + w, -136 + w)
        place(held.el, held.lx, held.ly + Math.sin(clock * 10) * 1.2, Math.sin(clock * 7) * 3)
      } else if (T.rel > REL_TIME * 0.4) setArms(tv, 100, 100)
    }
  }

  // ---------- pigeons ----------
  function spawnPigeon() {
    const L = LV()
    const x0 = 1060
    const y0 = rand(105, 165)
    const p: Pigeon = {
      el: sprite(flyL, SRC.pigeon, 72, 76),
      shadow: div('shadow', groundL),
      x: x0,
      y: y0,
      x0,
      y0,
      dipX: clamp(P.x + P.vx * 0.25 + rand(-25, 25), MIN_X + 20, MAX_X - 10),
      dipY: FEET_Y - 84,
      x1: -110,
      y1: rand(40, 90),
      speed: L.pigeonSpeed * rand(0.92, 1.08),
      t: 0,
      hit: false,
      dead: false,
    }
    pigeons.push(p)
    place(p.el, x0, y0, 0, -1, 1)
    // heads-up as it flaps in from the right
    addPart(div('warn', undefined, '!'), 972, clamp(y0 + 12, 90, 200), { life: 0.9, pop: true })
    ctx.sfx.coo()
    snd.flap()
    bagelSfx.wings()
    T.oops = 0.8
  }
  function pigeonY(p: Pigeon, x: number) {
    if (x >= p.dipX) return p.y0 + (p.dipY - p.y0) * clamp((p.x0 - x) / (p.x0 - p.dipX), 0, 1) ** 2.2
    const w = clamp((p.dipX - x) / (p.dipX - p.x1), 0, 1)
    return p.dipY - (p.dipY - p.y1) * (1 - (1 - w) ** 2.6)
  }
  function updatePigeons(dt: number) {
    for (const p of pigeons) {
      p.t += dt
      const nx = p.x - p.speed * dt
      const ny = pigeonY(p, nx)
      const vy = (ny - p.y) / dt
      p.x = nx
      p.y = ny
      const ang = (-Math.atan2(vy, p.speed) * 180) / Math.PI
      const flap = 1 - 0.3 * (0.5 + 0.5 * Math.sin(p.t * 30))
      place(p.el, p.x, p.y, ang * 0.75, -1, flap)
      const near = clamp(1 - (GROUND_Y - p.y) / 380, 0.12, 1)
      place(p.shadow, p.x, GROUND_Y + 1, 0, near, near * 0.9, 0.2 + 0.55 * near)
      if (!p.hit && P.down <= 0 && P.invuln <= 0 && phase === 'play') {
        const top = FEET_Y + stackTop
        const half = stack.length ? 32 : 26
        if (p.y + 18 > top && p.y - 18 < FEET_Y - 34 && Math.abs(p.x - P.x) < half) {
          p.hit = true
          feathers(p.x, p.y)
          ctx.sfx.squawk()
          hurt('fall', P.x + 50)
        }
      }
      if (p.x < -120) {
        p.dead = true
        p.el.remove()
        p.shadow.remove()
      }
    }
    for (let i = pigeons.length - 1; i >= 0; i--) if (pigeons[i].dead) pigeons.splice(i, 1)
  }

  // ---------- unloading & the pallet ----------
  function pileSlot(i: number) {
    let r = 0
    let n = i
    while (r < PILE_ROWS.length - 1 && n >= PILE_ROWS[r]) {
      n -= PILE_ROWS[r]
      r++
    }
    const cnt = PILE_ROWS[r]
    const x = PALLET.cx + (n - (cnt - 1) / 2) * 44 + jit(i, 3)
    const y = PALLET.y + (x - PALLET.cx) * PALLET.slope - r * 19.5
    return { x, y, r: jit(i + 7, 4) }
  }
  function pileTop() {
    let y = PALLET.y - 10
    for (const p of pile) y = Math.min(y, p.y - p.h * PALLET.scale)
    return y
  }
  function unloadLogic(dt: number) {
    zone.classList.toggle(k('on'), stack.length > 0 && phase === 'play')
    const inZone = P.x <= DROP_X && P.down <= 0 && (phase === 'play' || phase === 'ready')
    if (!inZone || !stack.length) {
      unloadCD = 0
      return
    }
    unloadCD -= dt
    if (unloadCD > 0) return
    unloadCD = 0.085
    const it = stack.pop() as Carried
    loadRun++
    const fullLoad = stack.length === 0 && loadRun >= MAX_STACK
    const slot = reserved++
    const ep = epoch
    const pos = pileSlot(slot % PER_LEVEL)
    const sx = P.x + it.lx
    const sy = FEET_Y + it.ly
    it.el.remove()
    const el = sprite(flyL, it.src, it.w, it.h, 0.5, 1)
    place(el, sx, sy, it.lr)
    arcs.push({
      el,
      x0: sx,
      y0: sy,
      x1: pos.x,
      y1: pos.y,
      r0: it.lr,
      r1: pos.r,
      s0: 1,
      s1: PALLET.scale,
      h: 60 + Math.abs(sx - pos.x) * 0.15,
      t: 0,
      dur: 0.34,
      done: () => arrive(el, it.h, slot - (epoch - ep) * PER_LEVEL, fullLoad),
    })
    P.sqV -= 1.2
  }
  function arrive(el: HTMLDivElement, h: number, slot: number, fullLoad: boolean) {
    const pos = pileSlot(Math.max(0, slot) % PER_LEVEL)
    pileL.append(el)
    place(el, pos.x, pos.y, pos.r, PALLET.scale)
    pile.push({ el, x: pos.x, y: pos.y, r: pos.r, h, t: 0 })
    delivered++
    inLevel++
    dust(pos.x, pos.y, 2, 0.5)
    floatText(pos.x, pos.y - 30, '+1', 'gold')
    snd.deliver(inLevel)
    bagelSfx.unload()
    renderScore()
    renderLevel()
    if (fullLoad) {
      loadBonus += 1
      ctx.sfx.coin()
      later(0.12, () => floatText(PALLET.cx, pileTop() - 40, 'Full load bonus +1', 'good'))
    }
    if (inLevel >= PER_LEVEL) levelComplete()
  }
  function levelComplete() {
    const done = level
    inLevel -= PER_LEVEL
    reserved -= PER_LEVEL
    epoch++
    const bonus = 2 * done
    levelBonus += bonus
    // the full pallet gets wheeled into the coffee shop
    pile.forEach((p, i) => {
      arcs.push({ el: p.el, x0: p.x, y0: p.y, x1: DOOR.x + rand(-10, 10), y1: DOOR.y + rand(-12, 12), r0: p.r, r1: rand(-30, 30), s0: PALLET.scale, s1: 0.35, h: 50, t: -0.25 - i * 0.035, dur: 0.42, fade: true, done: () => p.el.remove() })
    })
    pile.length = 0
    bagelSfx.cart()
    later(0.3 + PER_LEVEL * 0.035, () => {
      dust(DOOR.x + 10, DOOR.y + 40, 6, 1.1)
      ring(DOOR.x, DOOR.y)
    })
    if (phase === 'over') {
      // knocked out while the last sacks were still in the air: bank the bonus, keep the game-over flow
      floatText(500, 150, `Level bonus +${bonus}`, 'gold big')
      return
    }
    T.cheer = 1.5
    P.cheer = 1.2
    if (done >= LEVELS) {
      win()
      return
    }
    level++
    cupThrown = false
    pause = 2.3
    const L = LV()
    pigeonCD = L.pigeon ? rand(L.pigeon[0], L.pigeon[1]) * 0.6 + 2.3 : 0
    ctx.sfx.stamp()
    banner(`Level ${level}`, L.tip, 2.1)
    floatText(500, 150, `Level bonus +${bonus}`, 'gold big')
    renderLevel()
    bump(levelEl)
  }

  // ---------- flow ----------
  function startGame() {
    if (phase !== 'intro') return
    ctx.sfx.click()
    overlay.classList.add(k('out'))
    later(0.35, () => overlay.remove())
    hud.classList.remove(k('hidden'))
    phase = 'ready'
    banner('Ready?', 'Catch the coffee delivery!', 1.05)
    later(1.15, () => {
      banner('Go!', '', 0.7, 'good')
      ctx.sfx.honk()
    })
    later(1.55, () => {
      if (phase === 'ready') phase = 'play'
      throwCD = 0.25
    })
  }
  startBtn.addEventListener('click', startGame)
  requestAnimationFrame(() => startBtn.focus({ preventScroll: true }))

  function win() {
    won = true
    phase = 'over'
    dropHeld()
    T.cheer = 5
    P.cheer = 5
    ctx.sfx.stamp()
    later(0.5, () => ctx.sfx.register())
    banner('Truck unloaded!', `All ${delivered} delivered. Nice hustle!`, 3.2, 'good')
    confetti(70)
    endAt = clock + 3.6
  }
  function gameOver() {
    snd.lose()
    banner('Game Over', `${delivered} delivered · reached level ${level}`, 3, 'bad')
    endAt = clock + 3.0
  }
  function finish() {
    if (finished) return
    finished = true
    const extra = levelBonus + loadBonus + bagelBonus + (won ? 10 : 0)
    const lines = [
      `${delivered} ${delivered === 1 ? 'delivery' : 'deliveries'}`,
      won ? 'Emptied the whole truck!' : `Reached level ${level}`,
    ]
    if (extra) lines.push(`Bonuses +${extra}`)
    stop()
    ctx.end({ coins: delivered + extra, score: delivered, lines, flags: won ? ['truck-unloaded'] : [] })
  }

  // ---------- per-frame ----------
  function movePlayer(dt: number) {
    const can = (phase === 'play' || phase === 'ready') && P.down <= 0
    const maxV = 610 - 40 * stack.length
    let want = 0
    if (can) {
      if (P.keys) want = ((P.right ? 1 : 0) - (P.left ? 1 : 0)) * maxV
      else want = clamp((P.target - P.x) * 10, -maxV, maxV)
    }
    P.prevVx = P.vx
    const braking = Math.abs(want) < Math.abs(P.vx) || Math.sign(want) !== Math.sign(P.vx)
    P.vx = approach(P.vx, want, (braking ? 9000 : 5200) * dt)
    P.x += P.vx * dt
    if (P.x < MIN_X) {
      P.x = MIN_X
      P.vx = Math.max(0, P.vx)
    }
    if (P.x > MAX_X) {
      P.x = MAX_X
      P.vx = Math.min(0, P.vx)
    }
    if (P.keys) P.target = P.x
    if (can) {
      if (P.vx < -60 && P.face !== -1) P.face = -1
      else if (P.vx > 60 && P.face !== 1) P.face = 1
      pv.face(P.face, false)
    }
    // the stack lags behind your moves like an inverted pendulum
    const acc = (P.vx - P.prevVx) / dt
    const n = stack.length
    P.thV += (-64 * P.th - 2.5 * P.thV - acc * 0.0026 * (0.5 + 0.12 * n)) * dt
    P.th = clamp(P.th + P.thV * dt, -0.42, 0.42)
  }
  function layoutStack(dt: number) {
    P.sqV += (-420 * P.sq - 16 * P.sqV) * dt
    P.sq += P.sqV * dt
    const n = stack.length
    const wobble = n ? (0.008 + 0.007 * n) * (n >= MAX_STACK ? 1.4 : 1) : 0
    const lean = P.th + (Math.sin(clock * 2.3) * 0.6 + Math.sin(clock * 3.7 + 1) * 0.4) * wobble
    const bob = Math.abs(P.vx) > 50 ? -Math.abs(Math.sin(clock * 11)) * 2 : 0
    const base = -HEAD_TOP * (1 - P.sq) + bob + 4
    let y = base
    for (let i = 0; i < n; i++) {
      const it = stack[i]
      it.sqV += (-520 * it.sq - 15 * it.sqV) * dt
      it.sq += it.sqV * dt
      it.dx *= Math.exp(-dt * 16)
      const sy = 1 - it.sq
      const sx = 1 + it.sq * 0.7
      const x = Math.sin(lean) * (base - y + 10) * 1.3 + it.dx + it.jx
      const r = lean * 57.3 * (0.5 + i * 0.14) + it.jr
      it.lx = x
      it.ly = y
      it.lr = r
      place(it.el, x, y, r, sx, sy)
      y -= it.step * sy
    }
    stackTop = y
  }
  function animatePlayer(dt: number) {
    let rot = 0
    let sx = 1 + P.sq * 0.6
    let sy = 1 - P.sq
    if (P.down > 0) {
      const t = DOWN_TIME - P.down
      if (P.downKind === 'fall') {
        const f = t < 0.24 ? easeOutBack(t / 0.24) : t < 1.02 ? 1 : 1 - easeInOut((t - 1.02) / 0.33)
        rot = P.downDir * 84 * f
      } else {
        const f = t < 0.1 ? t / 0.1 : t < 0.98 ? 1 : 1 - easeOutBack(clamp((t - 0.98) / 0.37, 0, 1))
        sy = 1 - 0.6 * f
        sx = 1 + 0.42 * f
      }
    }
    place(pBody, 0, 0, rot, sx, sy)
    place(pWrap, P.x, FEET_Y)
    pWrap.style.opacity = P.invuln > 0 && P.down <= 0 && Math.floor(clock * 14) % 2 ? '0.45' : '1'
    const moving = Math.abs(P.vx) > 50 && P.down <= 0
    let pose: Pose = moving ? 'walk' : 'idle'
    if (!moving && P.down <= 0 && P.cheer > 0 && !stack.length) pose = 'cheer'
    pv.setPose(pose)
    pv.setMood(P.down > 0 || stack.length >= MAX_STACK ? 'o' : P.cheer > 0 ? 'grin' : 'smile')
    pv.update(dt)
    if (P.down > 0) setArms(pv, 70, -70)
    else if (stack.length) {
      // arms up in a V, hands beside the head (the right arm is drawn over the face, so keep it out wide)
      const w = Math.sin(clock * 9) * 3
      const l = P.th * 30
      setArms(pv, 134 + w + l, -134 + w + l)
    }
    // dizzy stars
    const show = P.down > 0
    stars.forEach((s, i) => {
      s.style.display = show ? '' : 'none'
      if (!show) return
      const t = DOWN_TIME - P.down
      let hx = P.x
      let hy = FEET_Y - 70
      if (P.downKind === 'fall') {
        const a = (P.downDir * 84 * Math.min(1, t / 0.24) * Math.PI) / 180
        hx = P.x + Math.sin(a) * 92 * UNIT
        hy = FEET_Y - Math.cos(a) * 92 * UNIT - 28
      }
      const ang = clock * 6 + (i * Math.PI * 2) / 3
      place(s, hx + Math.cos(ang) * 22, hy + Math.sin(ang) * 7, ang * 30, 0.8 + 0.2 * Math.sin(ang))
    })
    // tags
    const full = stack.length >= MAX_STACK && P.down <= 0 && phase === 'play'
    fullTag.classList.toggle(k('on'), full)
    if (full) fullTag.style.transform = `translate(${P.x.toFixed(1)}px, ${(FEET_Y + stackTop - 12).toFixed(1)}px) translate(-50%, -100%)`
    hint.classList.toggle(k('on'), stack.length > 0 && P.x > DROP_X && phase === 'play')
    place(hint, PALLET.cx, pileTop() - 6)
  }
  function updateArcs(dt: number) {
    for (const a of arcs) {
      a.t += dt
      if (a.t < 0) continue
      const u = Math.min(1, a.t / a.dur)
      const x = lerp(a.x0, a.x1, u)
      const y = lerp(a.y0, a.y1, u) - a.h * 4 * u * (1 - u)
      const s = lerp(a.s0, a.s1, u)
      place(a.el, x, y, lerp(a.r0, a.r1, u), s, s, a.fade ? 1 - u * u : undefined)
      if (u >= 1) {
        a.dead = true
        a.done?.()
      }
    }
    for (let i = arcs.length - 1; i >= 0; i--) if (arcs[i].dead) arcs.splice(i, 1)
  }
  function updatePile(dt: number) {
    for (const p of pile) {
      if (p.t > 0.6) continue
      p.t += dt
      const q = 0.28 * Math.exp(-9 * p.t) * Math.cos(20 * p.t)
      place(p.el, p.x, p.y, p.r, PALLET.scale * (1 + q * 0.6), PALLET.scale * (1 - q))
    }
  }
  function updateParts(dt: number) {
    for (const p of parts) {
      p.t += dt
      p.vy += p.g * dt
      if (p.drag) {
        const d = Math.exp(-p.drag * dt)
        p.vx *= d
        p.vy *= p.g ? 1 : d
      }
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.r += p.vr * dt
      if (p.floor !== undefined && p.y > p.floor) {
        p.y = p.floor
        p.vy = -p.vy * (p.bounce ?? 0)
        p.vx *= 0.7
        p.vr *= 0.6
      }
      const u = p.t / p.life
      let s = lerp(p.s0, p.s1, Math.min(1, u))
      if (p.pop) s *= easeOutBack(Math.min(1, p.t / 0.2))
      place(p.el, p.x, p.y, p.r, Math.max(0.01, s), Math.max(0.01, s), u > 0.65 ? Math.max(0, 1 - (u - 0.65) / 0.35) : 1)
    }
    for (let i = parts.length - 1; i >= 0; i--)
      if (parts[i].t >= parts[i].life) {
        parts[i].el.remove()
        parts.splice(i, 1)
      }
  }
  function updateDecals(dt: number) {
    for (const d of decals) {
      d.t += dt
      const q = d.squash ? 0.42 * Math.exp(-9 * d.t) * Math.cos(17 * d.t) : 0
      const fade = d.t > d.life - 0.45 ? Math.max(0, (d.life - d.t) / 0.45) : 1
      place(d.el, d.x, d.y, d.r, 1 + q * 0.6, 1 - q, fade)
    }
    for (let i = decals.length - 1; i >= 0; i--)
      if (decals[i].t >= decals[i].life) {
        decals[i].el.remove()
        decals.splice(i, 1)
      }
  }
  function updateShake(dt: number) {
    if (shakeT <= 0) return
    shakeT -= dt
    if (shakeT <= 0) {
      world.style.transform = ''
      shakeAmp = 0
      return
    }
    const a = shakeAmp * Math.min(1, shakeT / 0.3)
    const dx = rand(-a, a)
    const dy = rand(-a, a)
    world.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${(1 + (a + 1) / 280).toFixed(4)})`
  }

  function update(dt: number) {
    clock += dt
    for (let i = timers.length - 1; i >= 0; i--)
      if (clock >= timers[i].at) {
        const t = timers[i]
        timers.splice(i, 1)
        t.fn()
      }
    if (bannerT > 0) {
      bannerT -= dt
      if (bannerT <= 0) bannerEl.classList.remove(k('on'))
    }
    if (pause > 0) pause -= dt
    if (P.down > 0) {
      P.down -= dt
      if (lives <= 0) P.down = Math.max(P.down, 0.6) // stay down: game over
      else if (P.down <= 0) {
        P.down = 0
        P.invuln = INVULN_TIME
        dust(P.x, FEET_Y, 3, 0.8)
      }
    } else if (P.invuln > 0) P.invuln -= dt
    if (P.cheer > 0) P.cheer -= dt

    movePlayer(dt)
    layoutStack(dt)
    animatePlayer(dt)
    throwLogic(dt)
    animateThrower(dt)
    if (phase === 'play' && pause <= 0 && LV().pigeon) {
      pigeonCD -= dt
      if (pigeonCD <= 0) {
        const r = LV().pigeon as [number, number]
        pigeonCD = rand(r[0], r[1])
        spawnPigeon()
      }
    }
    updatePigeons(dt)
    updateFlyers(dt)
    unloadLogic(dt)
    updateArcs(dt)
    updatePile(dt)
    updateParts(dt)
    updateDecals(dt)
    updateShake(dt)
    if (endAt > 0 && clock >= endAt) finish()
  }

  // ---------- loop & cleanup ----------
  let raf = 0
  let last = performance.now()
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (dt > 0) update(dt)
  }
  raf = requestAnimationFrame(frame)
  let stopped = false
  function stop() {
    if (stopped) return
    stopped = true
    exited = true
    cancelAnimationFrame(raf)
    if (lying.ok && lying.src.startsWith('blob:')) {
      const url = lying.src
      setTimeout(() => URL.revokeObjectURL(url), 2000) // the payout card may still show our scene
    }
    root.removeEventListener('pointermove', onPointer)
    root.removeEventListener('pointerdown', onPointer)
    removeEventListener('keydown', kd)
    removeEventListener('keyup', ku)
    removeEventListener('blur', blur)
    if (actx) {
      void actx.close().catch(() => undefined)
      actx = null
      noiseBuf = null
    }
  }
  ctx.onExit(stop)
}

const game: MiniGame = {
  id: ID,
  title: 'Bagel Counters',
  start: run,
}
export default game
