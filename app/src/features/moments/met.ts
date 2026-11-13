import './met.css'
import { audioCtx, onMute } from '../../audio'
import { avatarMarkup } from '../../avatar/render'
import { randomLook } from '../../avatar/random'
import type { Look } from '../../avatar/look'
import { el, stage } from '../../engine/stage'
import { hold } from '../../engine/ui'
import type { Game } from '../../types'
import { nycDay } from './kit'

/**
 * Go inside the Met. You come in off the steps into the Great Hall, a guard hands you today's admission sticker (its
 * colour changes with the New York date) and it sticks in the corner of the screen while you're inside. From the hall:
 * the grand staircase up to the paintings, the left arch to the Temple of Dendur, the right arch to Arms and Armor.
 *
 * The paintings are the point. The gallery art has blank red walls; the eight paintings (funny takes on pictures that
 * really hang at the Met) are hung on them here, in gilded CSS frames: flat on the far wall, and on the side walls
 * with a projective transform fitted to the art's own lines (measured off met-gallery.jpg, see WALLS). Four hang in
 * this room; the far doorway leads to the next room (the same picture, its walls recoloured green) with the other
 * four. Click one and it fills the screen with a proper wall label beside it. Take a photo once and a guard says
 * "No flash, please."
 *
 * True details only (each is listed in the build report): pay-what-you-wish admission, the Great Hall flowers
 * (Lila Acheson Wallace), the Temple of Dendur (about 15 B.C., given by Egypt in 1965, here since 1978, the pool for
 * the Nile, the 1800s graffiti), the Met's own armor facts, and one line per real painting.
 */

type Pt = [number, number]
type Quad = [Pt, Pt, Pt, Pt]
type Room = 'hall' | 'gal-a' | 'gal-b' | 'dendur' | 'armor'

const ART_HALL = '/art/places/met-hall.jpg'
const ART_GALLERY = '/art/places/met-gallery.jpg'
const ART_DENDUR = '/art/places/met-dendur.jpg'
const ART_ARMOR = '/art/places/met-armor.jpg'

// ---------- the eight paintings ----------
interface Art {
  id: string
  src: string
  w: number
  h: number
  title: string
  artist: string
  real: string
  year: string
  medium: string
  credit: string
  /** one true line about the real painting */
  line: string
}
const ART: Art[] = [
  {
    id: 'washington', src: '/art/met/washington.jpg', w: 1400, h: 792,
    title: 'Washington Crossing the East River', artist: 'Emanuel Leutze', real: 'Washington Crossing the Delaware', year: '1851', medium: 'Oil on canvas',
    credit: 'Gift of the Staten Island Ferry, 2026',
    line: 'The flag in the real one wasn’t adopted until 1777. The crossing was in 1776.',
  },
  {
    id: 'madame-x', src: '/art/met/madame-x.jpg', w: 930, h: 1400,
    title: 'Madame X Waits for the L', artist: 'John Singer Sargent', real: 'Madame X (Madame Pierre Gautreau)', year: '1883–84', medium: 'Oil on canvas',
    credit: 'Purchase, Signal Problems Fund, 2026',
    line: 'Paris called the real one a scandal in 1884. Sargent repainted her fallen strap.',
  },
  {
    id: 'wheat-field', src: '/art/met/wheat-field.jpg', w: 1400, h: 1045,
    title: 'Wheat Field with Cypresses and One Rat', artist: 'Vincent van Gogh', real: 'Wheat Field with Cypresses', year: '1889', medium: 'Oil on canvas',
    credit: 'Lent by a private rat, 2026',
    line: 'Van Gogh painted this view three times. The Met has the first, from July 1889.',
  },
  {
    id: 'aristotle', src: '/art/met/aristotle.jpg', w: 1120, h: 1400,
    title: 'Aristotle with a Bust of a Bodega Cat', artist: 'Rembrandt', real: 'Aristotle with a Bust of Homer', year: '1653', medium: 'Oil on canvas',
    credit: 'Gift of the bodega on the corner, 2026',
    line: 'The Met bought the real one in 1961 for $2.3 million, a record at auction then.',
  },
  {
    id: 'water-pitcher', src: '/art/met/water-pitcher.jpg', w: 1120, h: 1400,
    title: 'Young Woman with a Water Pitcher (Rent Is Due)', artist: 'Johannes Vermeer', real: 'Young Woman with a Water Pitcher', year: 'about 1662', medium: 'Oil on canvas',
    credit: 'Gift of your landlord, 2026',
    line: 'The Met owns five Vermeers. No museum has more.',
  },
  {
    id: 'harvesters', src: '/art/met/harvesters.jpg', w: 1400, h: 1045,
    title: 'The Harvesters (Sunday Brunch)', artist: 'Pieter Bruegel the Elder', real: 'The Harvesters', year: '1565', medium: 'Oil on wood',
    credit: 'Purchase, Bottomless Mimosa Fund, 2026',
    line: 'Bruegel painted six times of the year. Five survive; this is the one in America.',
  },
  {
    id: 'self-portrait', src: '/art/met/self-portrait.jpg', w: 1120, h: 1400,
    title: 'Self-Portrait with a Straw Hat and a MetroCard', artist: 'Vincent van Gogh', real: 'Self-Portrait with a Straw Hat', year: '1887', medium: 'Oil on canvas',
    credit: 'Bequest of a MetroCard that swiped on the first try, 2026',
    line: 'On the back of the real canvas is another Van Gogh: The Potato Peeler.',
  },
  {
    id: 'water-lilies', src: '/art/met/water-lilies.jpg', w: 1400, h: 1400,
    title: 'Bridge over a Pond of Water Lilies, Central Park', artist: 'Claude Monet', real: 'Bridge over a Pond of Water Lilies', year: '1899', medium: 'Oil on canvas',
    credit: 'Gift of the Central Park ducks, 2026',
    line: 'The real bridge is in Monet’s own garden, at Giverny.',
  },
]

// ---------- the gallery's walls, measured off met-gallery.jpg (stage units: the art is 2000 × 1131, halved) ----------
// Each side wall is two lines in the picture: its top (where it meets the cornice) and its bottom (the top of the
// baseboard). Every horizontal line on that wall runs through the point where those two meet, and vertical lines stay
// vertical, so a painting hung on it is a quad with vertical sides whose top and bottom aim at that point. How wide it
// looks follows from depth: the wall's height in the picture is F / depth, F being the camera's focal length.
const F = 640 // in stage units, about a 76° view across the 1000-wide picture
const FAR = { left: 291, right: 704, top: 160, bottom: 331 } // the far wall: 171 tall, so a wall unit is 171 there
const UNIT = FAR.bottom - FAR.top
const FAR_PANELS = { 'far-left': (FAR.left + 417) / 2, 'far-right': (579 + FAR.right) / 2 } // either side of the doorway
const DOOR = { x: 451, y: 217, w: 93, h: 141 } // the doorway in the far wall, to the next room

const lineThrough = (a: Pt, b: Pt) => (x: number) => a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])
function wallOf(top: [Pt, Pt], bot: [Pt, Pt]) {
  const T = lineThrough(...top)
  const B = lineThrough(...bot)
  const h = (x: number) => B(x) - T(x)
  const h0 = h(0)
  const dh = h(1) - h0
  return { bot: B, h, xAt: (z: number) => (F / z - h0) / dh }
}
const WALLS = {
  left: wallOf([[291, 160], [112, 0]], [[291, 331], [0, 367]]),
  right: wallOf([[702, 160], [887, 0]], [[702, 331], [1000, 367]]),
}
/** the floor's edge along the walls: what's above it is wall (for the green room) */
const floorAt = (x: number) => (x < FAR.left ? 436 - (78 * x) / FAR.left : x > 702 ? 358 + (82 * (x - 702)) / 298 : 358)

/** where each painting hangs: `ph` is the picture's height and `fb` its bottom edge, in wall heights; side walls also
 *  take `z`, the depth of its middle (the near corner of the visible wall is about 1.4, the far corner 3.7) */
interface Hang { art: number; wall: 'left' | 'right' | 'far-left' | 'far-right'; ph: number; fb: number; z?: number }
const FRAME = 0.042 // the gilt, in wall heights
const HANGS: Record<'gal-a' | 'gal-b', Hang[]> = {
  'gal-a': [
    { art: 0, wall: 'left', ph: 0.4, fb: 0.2, z: 2.0 },
    { art: 1, wall: 'far-left', ph: 0.5, fb: 0.2 },
    { art: 3, wall: 'far-right', ph: 0.46, fb: 0.22 },
    { art: 2, wall: 'right', ph: 0.4, fb: 0.21, z: 2.0 },
  ],
  'gal-b': [
    { art: 5, wall: 'left', ph: 0.42, fb: 0.2, z: 2.0 },
    { art: 4, wall: 'far-left', ph: 0.42, fb: 0.25 },
    { art: 6, wall: 'far-right', ph: 0.42, fb: 0.25 },
    { art: 7, wall: 'right', ph: 0.44, fb: 0.2, z: 2.0 },
  ],
}

function hangQuad(hg: Hang, ow: number, oh: number): Quad {
  if (hg.wall === 'far-left' || hg.wall === 'far-right') {
    const cx = FAR_PANELS[hg.wall]
    const l = cx - (ow * UNIT) / 2
    const r = cx + (ow * UNIT) / 2
    const t = FAR.bottom - (hg.fb + oh) * UNIT
    const b = FAR.bottom - hg.fb * UNIT
    return [[l, t], [r, t], [r, b], [l, b]]
  }
  const w = WALLS[hg.wall]
  const xa = w.xAt(hg.z! - ow / 2)
  const xb = w.xAt(hg.z! + ow / 2)
  const xl = Math.min(xa, xb)
  const xr = Math.max(xa, xb)
  const y = (x: number, f: number) => w.bot(x) - f * w.h(x)
  return [[xl, y(xl, hg.fb + oh)], [xr, y(xr, hg.fb + oh)], [xr, y(xr, hg.fb)], [xl, y(xl, hg.fb)]]
}

/** a CSS matrix3d that maps a w × h box (transform-origin 0 0) onto a quad: TL, TR, BR, BL (Heckbert's square to quad) */
function quadMatrix(w: number, h: number, [[x0, y0], [x1, y1], [x2, y2], [x3, y3]]: Quad): string {
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3
  let g = 0
  let k = 0
  if (Math.abs(dx3) > 1e-6 || Math.abs(dy3) > 1e-6) {
    const det = dx1 * dy2 - dx2 * dy1
    g = (dx3 * dy2 - dx2 * dy3) / det
    k = (dx1 * dy3 - dx3 * dy1) / det
  }
  const a = (x1 - x0 + g * x1) / w
  const b = (x3 - x0 + k * x3) / h
  const d = (y1 - y0 + g * y1) / w
  const e = (y3 - y0 + k * y3) / h
  const n = (v: number) => +v.toFixed(8)
  return `matrix3d(${n(a)},${n(d)},0,${n(g / w)},${n(b)},${n(e)},0,${n(k / h)},0,0,1,0,${n(x0)},${n(y0)},0,1)`
}

/** the gallery picture with some of its red walls turned museum green: the next room is the same room, repainted */
function greenWalls(img: HTMLImageElement, where: (x: number, y: number) => boolean): HTMLCanvasElement | null {
  try {
    const c = document.createElement('canvas')
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const x = c.getContext('2d', { willReadFrequently: true })!
    x.drawImage(img, 0, 0)
    const data = x.getImageData(0, 0, c.width, c.height)
    const p = data.data
    const s = 1000 / c.width
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i], gr = p[i + 1], b = p[i + 2]
      const hi = Math.max(gr, b)
      // the walls are a deep red with green and blue about equal; the floor is orange (green well above blue)
      if (r < 50 || Math.abs(gr - b) > r * 0.2) continue
      const red = (r - hi) / r
      if (red < 0.22) continue
      const k = i >> 2
      if (!where((k % c.width) * s, Math.floor(k / c.width) * s)) continue
      const t = Math.min(1, (red - 0.22) / 0.2)
      const L = r * 0.92 + hi * 0.3
      p[i] = r + (L * 0.26 - r) * t
      p[i + 1] = gr + (L * 0.53 - gr) * t
      p[i + 2] = b + (L * 0.45 - b) * t
    }
    x.putImageData(data, 0, 0)
    return c
  } catch {
    return null
  }
}

// ---------- the true lines ----------
const LINES = {
  admission: 'New York State residents, and students from NY, NJ and CT, pay what they wish.',
  flowers: 'Fresh flowers in the Great Hall are a Met tradition, paid for by a gift from Lila Acheson Wallace.',
  temple: ['Built around 15 B.C. Egypt gave it to the United States in 1965.', 'Travelers in the 1800s carved their names into it. Please don’t.'],
  pool: 'The pool hints at the Nile, where the temple once stood.',
  glass: 'Here since 1978. The slanted glass wall looks out on Central Park.',
  knights: 'Knights got on their horses without cranes. The crane story is a myth.',
  cases: 'Battle armor weighed about 45 to 55 pounds. Less than a firefighter’s gear.',
}

const CAPTION: Record<Room, string> = { hall: 'Great Hall', 'gal-a': 'Paintings', 'gal-b': 'Paintings', dendur: 'Temple of Dendur', armor: 'Arms and Armor' }

/** today's admission sticker: a different colour every New York day */
const STICKER_COLORS = ['#e8414f', '#ff8a1f', '#f2b705', '#2fa54a', '#1f8fd6', '#7b5cf0', '#ff5fa2']

const avatarSvg = (look: Look, back = false, mood: 'smile' | 'grin' | 'o' = 'smile', extra = '') =>
  `<svg viewBox="-60 -185 120 192" aria-hidden="true">${avatarMarkup(look, { mood, d: -1, back })}${extra}</svg>`
/** the guard's gold badge, pinned on the blazer */
const BADGE = '<path d="M8 -63 L17 -63 L17 -57 Q17 -51.500 12.500 -49.500 Q8 -51.500 8 -57 Z" fill="#f2cf5b" stroke="#1d2140" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12.500" cy="-57.500" r="1.700" fill="#b8862c"/>'
const GUARD_HAIR = ['short', 'fade', 'buzz', 'bun', 'bald', 'ponytail'] as const

export function enterTheMet(g: Game) {
  if (stage.root.querySelector('.met')) return
  const release = hold()
  const today = nycDay()
  const color = STICKER_COLORS[today % STICKER_COLORS.length]
  // the guard: navy blazer, red tie, a badge, tidy hair
  const guardLook: Look = { ...randomLook(0), hair: GUARD_HAIR[Math.floor(Math.random() * GUARD_HAIR.length)], hairColor: Math.floor(Math.random() * 4), items: { body: 'suit', legs: 'black-jeans', feet: 'loafers' } }
  const flags = g.flags
  const hadSticker = flags['met-sticker'] === today

  const root = el('div', 'met')
  root.style.setProperty('--sticker', color)
  root.innerHTML = `
    <div class="met-view met-hall on" data-room="hall"><img class="met-bg" src="${ART_HALL}" alt="" draggable="false">
      <div class="met-locals">
        <div class="met-local" style="left:170px;top:298px;height:182px">${avatarSvg(randomLook(0.5), true)}</div>
        <div class="met-local" style="left:786px;top:306px;height:172px">${avatarSvg(randomLook(0.5))}</div>
      </div>
      <div class="met-guard">${avatarSvg(guardLook, false, 'smile', BADGE)}</div>
      <p class="met-bubble"></p>
      <button class="met-offer" type="button" aria-label="Take your sticker"><span class="met-sticker-face"><b>M</b></span></button>
      <div class="met-pointer" hidden><span>Take your sticker</span></div>
    </div>
    <div class="met-view met-gallery" data-room="gal-a"><div class="met-bg met-bg-gal"></div>
      <div class="met-local" style="left:224px;top:270px;height:126px">${avatarSvg(randomLook(0.5), true)}</div>
    </div>
    <div class="met-view met-gallery green" data-room="gal-b"><div class="met-bg met-bg-gal"></div>
      <div class="met-local" style="left:716px;top:274px;height:122px">${avatarSvg(randomLook(0.5), true)}</div>
    </div>
    <div class="met-view met-dendur" data-room="dendur"><img class="met-bg" src="${ART_DENDUR}" alt="" draggable="false"><div class="met-shimmer"></div></div>
    <div class="met-view met-armor" data-room="armor"><img class="met-bg" src="${ART_ARMOR}" alt="" draggable="false"></div>
    <div class="met-close" hidden>
      <div class="met-cl-wall"></div>
      <div class="met-cl-art"><div class="met-cl-frame met-gilt"><span class="met-canvas"><img alt="" draggable="false"></span></div></div>
      <div class="met-side">
        <div class="met-label"><b class="met-l-title"></b><p class="met-l-after"></p><p class="met-l-medium"></p><p class="met-l-credit"></p></div>
        <button class="btn small met-photo" type="button">Take a Photo</button>
      </div>
      <button class="met-arrow prev" type="button" aria-label="Previous painting"><svg viewBox="0 0 20 20"><path d="M12.5 4 L6.5 10 L12.5 16" /></svg></button>
      <button class="met-arrow next" type="button" aria-label="Next painting"><svg viewBox="0 0 20 20"><path d="M7.5 4 L13.5 10 L7.5 16" /></svg></button>
      <div class="met-cl-guard">${avatarSvg(guardLook, false, 'o', BADGE)}</div>
      <p class="met-cl-bubble">No flash, please.</p>
    </div>
    <div class="met-caption"><b>The Met</b><span class="met-where">Great Hall</span><span class="met-seen" hidden>${ART.map((_, i) => `<i style="--i:${i}"></i>`).join('')}</span></div>
    <div class="met-actions"><button class="btn tiny ghost met-out" type="button">Exit to Fifth Avenue</button></div>
    <div class="met-sticker" aria-hidden="true" ${hadSticker ? '' : 'hidden'}><span class="met-sticker-face"><b>M</b></span></div>
    <p class="met-line" aria-live="polite"></p>
    <p class="met-hint"></p>
    <div class="met-flash"></div>
    <div class="met-fade"></div>`
  stage.root.append(root)
  const q = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector<T>(s)!
  const views = Object.fromEntries([...root.querySelectorAll<HTMLElement>('.met-view')].map((v) => [v.dataset.room, v])) as Record<Room, HTMLElement>
  const where = q('.met-where')
  const seenRow = q('.met-seen')
  const outBtn = q<HTMLButtonElement>('.met-out')
  const line = q('.met-line')
  const hintEl = q('.met-hint')
  const fade = q('.met-fade')
  const close = q('.met-close')

  // ---------- timers, keys, sound: everything dies with the visit ----------
  let closed = false
  const timers = new Set<number>()
  const later = (f: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.delete(t)
      if (!closed) f()
    }, ms)
    timers.add(t)
    return t
  }
  let lineTimer = 0
  let linePending = 0
  /** one true line at a time, bottom centre; a new one replaces the last */
  const say = (text: string, ms = 6500) => {
    clearTimeout(lineTimer)
    clearTimeout(linePending)
    const wasOn = line.classList.contains('on')
    line.classList.remove('on')
    linePending = later(() => {
      line.textContent = text
      line.classList.add('on')
      lineTimer = later(() => line.classList.remove('on'), ms)
    }, wasOn ? 260 : 0)
  }
  const hush = () => {
    clearTimeout(lineTimer)
    clearTimeout(linePending)
    line.classList.remove('on')
  }
  const hint = (text: string) => {
    hintEl.textContent = text
    hintEl.classList.toggle('on', !!text)
  }

  // the hall's hush: a low room tone, and heels on marble when you walk somewhere
  let stopTone = () => {}
  let step = (_n: number) => {}
  let shutter = () => {}
  const startSound = () => {
    const ctx = audioCtx()
    if (!ctx) return
    const noise = (secs: number) => {
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * secs), ctx.sampleRate)
      const d = buf.getChannelData(0)
      let last = 0
      for (let i = 0; i < d.length; i++) d[i] = last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
      for (let i = 0; i < d.length; i++) d[i] *= 3.5
      return buf
    }
    const white = (secs: number) => {
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * secs), ctx.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      return buf
    }
    const tone = ctx.createBufferSource()
    tone.buffer = noise(4)
    tone.loop = true
    const low = ctx.createBiquadFilter()
    low.type = 'lowpass'
    low.frequency.value = 320
    const bed = ctx.createGain()
    bed.gain.value = 0
    bed.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 2)
    tone.connect(low).connect(bed).connect(ctx.destination)
    tone.start()
    const tick = white(0.06)
    step = (n: number) => {
      for (let i = 0; i < n; i++) {
        const at = ctx.currentTime + i * 0.24
        const src = ctx.createBufferSource()
        src.buffer = tick
        const band = ctx.createBiquadFilter()
        band.type = 'bandpass'
        band.frequency.value = i % 2 ? 1500 : 1750
        band.Q.value = 4
        const gg = ctx.createGain()
        gg.gain.setValueAtTime(0.0001, at)
        gg.gain.linearRampToValueAtTime(0.16 - i * 0.025, at + 0.004)
        gg.gain.exponentialRampToValueAtTime(0.001, at + 0.07)
        src.connect(band).connect(gg).connect(ctx.destination)
        src.start(at)
      }
    }
    const snap = white(0.14)
    shutter = () => {
      for (const [off, f, v] of [[0, 2600, 0.3], [0.08, 1900, 0.22]] as const) {
        const src = ctx.createBufferSource()
        src.buffer = snap
        const hp = ctx.createBiquadFilter()
        hp.type = 'bandpass'
        hp.frequency.value = f
        hp.Q.value = 1.2
        const gg = ctx.createGain()
        const at = ctx.currentTime + off
        gg.gain.setValueAtTime(v, at)
        gg.gain.exponentialRampToValueAtTime(0.001, at + 0.06)
        src.connect(hp).connect(gg).connect(ctx.destination)
        src.start(at)
      }
    }
    stopTone = () => {
      bed.gain.cancelScheduledValues(ctx.currentTime)
      bed.gain.setValueAtTime(bed.gain.value, ctx.currentTime)
      bed.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.5)
      setTimeout(() => tone.stop(), 600)
      step = () => {}
      shutter = () => {}
      stopTone = () => {}
    }
  }
  startSound()
  onMute((m) => (m ? stopTone() : root.isConnected && !closed && startSound()))

  // ---------- moving between rooms: a quick fade ----------
  let room: Room = 'hall'
  let moving = false
  const show = (to: Room) => {
    views[room].classList.remove('on', 'walk')
    room = to
    views[to].classList.add('on')
    where.textContent = CAPTION[to]
    const gallery = to === 'gal-a' || to === 'gal-b'
    seenRow.hidden = !gallery
    outBtn.textContent = to === 'hall' ? 'Exit to Fifth Avenue' : 'Back to the Great Hall'
    if (to === 'hall') revealDoors()
  }
  const go = (to: Room) => {
    if (moving || closed || to === room) return
    moving = true
    hush()
    hint('')
    step(3)
    views[room].classList.add('walk')
    fade.classList.add('on')
    later(() => {
      show(to)
      fade.classList.remove('on')
      later(() => {
        moving = false
        if ((to === 'gal-a' || to === 'gal-b') && !flags['met-looked']) hint('Click a painting')
      }, 260)
    }, 280)
  }

  // ---------- hotspots, each with a small label ----------
  interface Spot { room: Room; label: string; box: [number, number, number, number]; clip?: string; tip?: Pt; act: () => void }
  let templeTurn = 0
  const spots: Spot[] = [
    { room: 'hall', label: 'European Paintings', box: [300, 196, 400, 190], act: () => go('gal-a') },
    { room: 'hall', label: 'The Flowers', box: [336, 160, 126, 186], act: () => say(LINES.flowers) },
    { room: 'hall', label: 'The Flowers', box: [538, 160, 126, 186], act: () => say(LINES.flowers) },
    { room: 'hall', label: 'Temple of Dendur', box: [4, 232, 108, 184], act: () => go('dendur') },
    { room: 'hall', label: 'Arms and Armor', box: [888, 232, 108, 184], act: () => go('armor') },
    { room: 'gal-a', label: 'Next Room', box: [DOOR.x, DOOR.y, DOOR.w, DOOR.h], act: () => go('gal-b') },
    { room: 'gal-b', label: 'Next Room', box: [DOOR.x, DOOR.y, DOOR.w, DOOR.h], act: () => go('gal-a') },
    { room: 'dendur', label: 'Great Hall', box: [0, 188, 82, 118], act: () => go('hall') },
    { room: 'dendur', label: 'The Temple', box: [188, 38, 376, 272], act: () => say(LINES.temple[templeTurn++ % 2]) },
    { room: 'dendur', label: 'The Pool', box: [170, 334, 830, 231], clip: 'polygon(0 11px, 490px 0, 830px 61px, 830px 231px, 280px 231px)', act: () => say(LINES.pool) },
    { room: 'dendur', label: 'The Glass Wall', box: [566, 64, 434, 254], tip: [760, 132], act: () => say(LINES.glass) },
    { room: 'armor', label: 'The Knights', box: [206, 96, 640, 296], act: () => say(LINES.knights) },
    { room: 'armor', label: 'The Armor', box: [0, 182, 166, 222], act: () => say(LINES.cases) },
    { room: 'armor', label: 'The Armor', box: [836, 182, 164, 222], act: () => say(LINES.cases) },
  ]
  const hallTips: HTMLElement[] = []
  for (const s of spots) {
    const [x, y, w, h] = s.box
    const b = el('button', 'met-spot')
    b.type = 'button'
    b.setAttribute('aria-label', s.label)
    b.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px${s.clip ? `;clip-path:${s.clip}` : ''}`
    const tip = el('span', 'met-tip', s.label)
    const [tx, ty] = s.tip ?? [Math.max(90, Math.min(910, x + w / 2)), Math.max(40, y + 6)]
    tip.style.left = `${tx}px`
    tip.style.top = `${ty}px`
    b.onpointerenter = () => tip.classList.add('on')
    b.onpointerleave = () => tip.classList.remove('on')
    b.onfocus = () => tip.classList.add('on')
    b.onblur = () => tip.classList.remove('on')
    b.onclick = (e) => {
      e.stopPropagation()
      if (moving) return
      g.sfx.click()
      s.act()
    }
    views[s.room].append(b, tip)
    if (s.room === 'hall' && s.label !== 'The Flowers') hallTips.push(tip)
  }
  let revealed = false
  /** the first time the hall is yours, its three ways on show for a moment */
  function revealDoors() {
    if (revealed || root.classList.contains('greeting')) return
    revealed = true
    for (const t of hallTips) t.classList.add('show')
    later(() => hallTips.forEach((t) => t.classList.remove('show')), 3200)
  }

  // ---------- the paintings ----------
  const seen = () => flags['met-seen'] ?? 0
  const drawSeen = () => seenRow.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', !!(seen() & (1 << i))))
  drawSeen()
  const S = 600 // CSS px per wall height, before the transform
  const hung: Record<'gal-a' | 'gal-b', number[]> = { 'gal-a': [], 'gal-b': [] }
  for (const key of ['gal-a', 'gal-b'] as const) {
    for (const hg of HANGS[key]) {
      const a = ART[hg.art]
      const ow = (hg.ph * a.w) / a.h + 2 * FRAME
      const oh = hg.ph + 2 * FRAME
      const quad = hangQuad(hg, ow, oh)
      const b = el('button', 'met-art met-gilt')
      b.type = 'button'
      b.setAttribute('aria-label', a.title)
      b.style.cssText = `width:${(ow * S).toFixed(1)}px;height:${(oh * S).toFixed(1)}px;--fw:${(FRAME * S).toFixed(1)}px;transform:${quadMatrix(ow * S, oh * S, quad)}`
      b.innerHTML = `<span class="met-canvas"><img src="${a.src}" alt="" draggable="false"></span>`
      b.onclick = (e) => {
        e.stopPropagation()
        if (!moving) openArt(key, hung[key].indexOf(hg.art))
      }
      views[key].append(b)
      hung[key].push(hg.art)
    }
  }

  // the two gallery rooms are one picture: this room's view through the door, and the next room, repainted green
  const galImg = new Image()
  galImg.src = ART_GALLERY
  const inDoor = (x: number, y: number) => x > DOOR.x - 2 && x < DOOR.x + DOOR.w + 2 && y > DOOR.y - 2 && y < floorAt(x)
  const paintRooms = () => {
    const a = greenWalls(galImg, inDoor)
    const b = greenWalls(galImg, (x, y) => y < floorAt(x) && !inDoor(x, y))
    for (const [key, c] of [['gal-a', a], ['gal-b', b]] as const) {
      const bg = views[key].querySelector<HTMLElement>('.met-bg-gal')!
      if (c) bg.append(c)
      else bg.style.backgroundImage = `url(${ART_GALLERY})`
    }
  }
  if (galImg.complete && galImg.naturalWidth) later(paintRooms, 60)
  else galImg.onload = () => !closed && paintRooms()

  // ---------- up close: the painting fills the screen, its label beside it ----------
  const clArt = q('.met-cl-art')
  const clImg = q<HTMLImageElement>('.met-cl-art img')
  const side = q('.met-side')
  let openRoom: 'gal-a' | 'gal-b' = 'gal-a'
  let openAt = -1
  let lineLater = 0
  function openArt(key: 'gal-a' | 'gal-b', i: number) {
    const n = hung[key].length
    i = (i + n) % n
    const a = ART[hung[key][i]]
    const first = openAt < 0
    openRoom = key
    openAt = i
    flags['met-looked'] = 1
    hint('')
    hush()
    close.classList.toggle('green', key === 'gal-b')
    // the picture fits a 470 × 372 box; its label hangs to the right, level with the frame's bottom, and the two
    // are centred between the arrows
    const k = Math.min(470 / a.w, 372 / a.h)
    const fw = Math.round(a.w * k) + 52
    const fh = Math.round(a.h * k) + 52
    const left = Math.round(80 + (840 - (fw + 40 + 214)) / 2)
    const top = Math.round(268 - fh / 2)
    clArt.style.cssText = `left:${left}px;top:${top}px;width:${fw}px;height:${fh}px`
    clImg.src = a.src
    side.style.left = `${left + fw + 40}px`
    side.style.bottom = `${565 - top - fh}px`
    q('.met-l-title').textContent = a.title
    q('.met-l-after').innerHTML = `After ${a.artist}, <i>${a.real}</i>, ${a.year}`
    q('.met-l-medium').textContent = a.medium
    q('.met-l-credit').textContent = a.credit
    if (first) {
      close.hidden = false
      views[room].classList.add('dim')
      requestAnimationFrame(() => close.classList.add('on'))
    } else {
      clArt.classList.remove('swap')
      void clArt.offsetWidth
      clArt.classList.add('swap')
    }
    // seeing it up close counts
    const bit = 1 << ART.indexOf(a)
    if (!(seen() & bit)) {
      flags['met-seen'] = seen() | bit
      drawSeen()
      if (seen() === (1 << ART.length) - 1) {
        seenRow.classList.add('done')
        g.stamp('met-all-eight')
      }
    }
    clearTimeout(lineLater)
    lineLater = later(() => say(a.line, 7000), 1100)
    outBtn.textContent = 'Step Back'
  }
  function closeArt() {
    if (openAt < 0) return
    openAt = -1
    clearTimeout(lineLater)
    hush()
    close.classList.remove('on')
    views[room].classList.remove('dim')
    outBtn.textContent = 'Back to the Great Hall'
    later(() => openAt < 0 && (close.hidden = true), 260)
  }
  q('.met-arrow.prev').onclick = (e) => (e.stopPropagation(), g.sfx.click(), openArt(openRoom, openAt - 1))
  q('.met-arrow.next').onclick = (e) => (e.stopPropagation(), g.sfx.click(), openArt(openRoom, openAt + 1))
  close.onclick = (e) => {
    if (e.target === close || (e.target as HTMLElement).classList.contains('met-cl-wall')) closeArt()
  }

  // a photo: the flash, and (once) the guard
  let flashed = false
  q('.met-photo').onclick = (e) => {
    e.stopPropagation()
    shutter()
    const flash = q('.met-flash')
    flash.classList.remove('pop', 'soft')
    void flash.offsetWidth
    flash.classList.add(flashed ? 'soft' : 'pop')
    if (flashed) return
    flashed = true
    // one voice at a time: the painting's line steps aside for the guard, and comes back after
    clearTimeout(lineLater)
    hush()
    const at = openAt
    later(() => close.classList.add('guard'), 500)
    later(() => close.classList.remove('guard'), 3300)
    lineLater = later(() => openAt === at && openAt >= 0 && say(ART[hung[openRoom][openAt]].line, 6000), 3700)
  }

  // ---------- coming in: the guard and today's sticker ----------
  const guardBubble = q('.met-bubble')
  const offer = q('.met-offer')
  const pointer = q('.met-pointer')
  const sticker = q('.met-sticker')
  const bubble = (text: string) => {
    guardBubble.classList.remove('on')
    later(() => {
      guardBubble.textContent = text
      guardBubble.classList.add('on')
    }, 120)
  }
  root.classList.add('greeting', 'arrive')
  step(4)
  later(() => root.classList.remove('arrive'), 60)
  later(() => views.hall.classList.add('guard-in'), 500)
  let offered = false
  let taken = false
  const guardOff = (ms: number) => {
    later(() => guardBubble.classList.remove('on'), ms - 300)
    later(() => views.hall.classList.remove('guard-in'), ms)
    later(() => {
      root.classList.remove('greeting')
      revealDoors()
    }, ms + 450)
  }
  if (hadSticker) {
    later(() => bubble('You again. Go on in.'), 1000)
    guardOff(2900)
  } else {
    later(() => bubble('Welcome to the Met.'), 1000)
    later(() => {
      offered = true
      offer.classList.add('on')
      pointer.hidden = false
    }, 1500)
  }
  const takeSticker = () => {
    if (!offered || taken) return
    taken = true
    pointer.hidden = true
    g.sfx.pop()
    // it peels off the backing and flies to the corner of the screen, where it stays while you're inside
    const from = offer.getBoundingClientRect()
    sticker.hidden = false
    const to = sticker.getBoundingClientRect()
    const k = 1000 / stage.root.getBoundingClientRect().width
    // (both boxes are measured with their rotation; the centres are what matter)
    const dx = (from.left + from.width / 2 - (to.left + to.width / 2)) * k
    const dy = (from.top + from.height / 2 - (to.top + to.height / 2)) * k
    sticker.style.transition = 'none'
    sticker.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(14deg) scale(${(74 / 60).toFixed(3)})`
    offer.classList.remove('on')
    offer.classList.add('gone')
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        sticker.style.transition = ''
        sticker.style.transform = ''
        sticker.classList.add('land')
      }),
    )
    flags['met-sticker'] = today
    g.stamp('met-inside')
    bubble('Wear it where we can see it.')
    later(() => say(LINES.admission, 6000), 900)
    guardOff(2600)
  }
  offer.onclick = (e) => {
    e.stopPropagation()
    takeSticker()
  }
  views.hall.addEventListener('click', () => takeSticker())

  // ---------- leaving ----------
  const leave = () => {
    if (closed) return
    closed = true
    for (const t of timers) clearTimeout(t)
    stopTone()
    window.removeEventListener('keydown', keys, true)
    root.classList.add('out')
    setTimeout(() => {
      root.remove()
      release()
    }, 450)
  }
  /** Escape steps back one place at a time: the painting, the room, then out onto Fifth Avenue */
  const back = () => {
    if (openAt >= 0) return closeArt()
    if (room !== 'hall') return go('hall')
    leave()
  }
  outBtn.onclick = (e) => {
    e.stopPropagation()
    g.sfx.click()
    back()
  }
  const keys = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      back()
    } else if (openAt >= 0 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault()
      e.stopPropagation()
      openArt(openRoom, openAt + (e.key === 'ArrowLeft' ? -1 : 1))
    }
  }
  window.addEventListener('keydown', keys, true)
}
