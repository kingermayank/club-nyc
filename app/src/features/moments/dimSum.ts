import './dimSum.css'
import { audioCtx, onMute } from '../../audio'
import { ITEM } from '../../avatar/items'
import { SKINS } from '../../avatar/look'
import { randomLook } from '../../avatar/random'
import { avatarMarkup } from '../../avatar/render'
import { el, stage, toStage } from '../../engine/stage'
import { hold } from '../../engine/ui'
import { bump, save } from '../../state'
import type { Game } from '../../types'

/**
 * Dim sum in Chinatown, cart style. You sit at a round table in a big old banquet hall, first person: a glass lazy
 * Susan with the teapot on it, your cup, a blank tally card. A waiter pours your first cup (tap two fingers on the
 * table to say thank you). Carts roll down the aisle from the kitchen, one at a time; the cart lady calls out what
 * she has and lifts the lids. Point at a dish and it's yours: it slides onto the lazy Susan and she stamps your card.
 * Click a dish and your chopsticks take a piece, bite by bite, until the steamer is empty and goes on the stack.
 * Drag the glass to spin it. Pour your own tea; when the pot runs dry, open the lid and a waiter brings hot water.
 * "Check, Please" sends the stamped card to the cashier.
 *
 * The art is one painting plus sprites. Everything that moves out of the painting (the teapot, its lid, each piece
 * of food) is cut out of the art at runtime, along its own ink outline, and the hole it leaves is filled in from
 * the pixels around it, so the table under a lifted teapot is still table and an eaten dumpling leaves an empty
 * steamer behind.
 *
 * True details only: going for dim sum is "yum cha" (drink tea) in Cantonese; cart ladies call out their dishes and
 * stamp a card on your table, and the card is the bill; an open teapot lid asks for more hot water; tapping two
 * fingers on the table thanks whoever poured your tea; chicken feet are "phoenix claws", fried and then steamed in
 * black bean sauce; turnip cake is made with radish.
 */

type Pt = [number, number]
type DishId = 'har-gow' | 'siu-mai' | 'char-siu-bao' | 'cheung-fun' | 'turnip-cake' | 'chicken-feet' | 'egg-tart' | 'sesame-ball'

const HALL = '/art/places/dimsum-hall.jpg'
const SPRITES = '/art/places/sprites/'
/** the hall's art is 2000 × 1131: half a pixel per stage unit */
const K = 0.5
const PRICE = 2

// ---------- the painting, measured (stage units unless it says image px) ----------
/** the glass lazy Susan's outer rim */
const GLASS = { x: 484.8, y: 520.7, rx: 279.2, ry: 104.4 }
/** the table's far edge, left to right, just above its ink line: everything behind it is hidden by the table */
const EDGE: Pt[] = [[0, 468.5], [25, 455], [50, 443.5], [75, 434], [100, 424.5], [125, 416.5], [150, 409], [175, 402.5], [200, 397.5], [225, 392.5], [250, 388], [275, 383.5], [300, 379.5], [325, 374.5], [350, 372.5], [375, 368.5], [400, 368], [425, 366], [450, 365], [475, 364], [500, 363.5], [525, 364], [550, 364.5], [575, 365.5], [600, 367], [625, 369], [650, 371], [675, 374.5], [700, 378], [725, 382], [750, 387], [775, 392.5], [800, 398.5], [825, 405], [850, 412], [875, 420.5], [900, 429.5], [925, 440], [950, 453], [975, 469], [1000, 487]]
/** your cup, by the tally card: the tea's surface inside its rim */
const CUP = { x: 797.7, y: 473.6, rx: 29.5, ry: 8.6 }
/** the tally card's outer corners: top left, top right, bottom right, bottom left */
const CARD: [Pt, Pt, Pt, Pt] = [[852.3, 481.9], [903.1, 472.3], [946, 518.1], [885.3, 536]]
/** the teapot, in image px: its crop of the art, where it stands, seeds inside its outline (body, lid, spout,
 *  handle), the hole inside the handle, the tip of the spout, and the lid's lower rim (above it is the lid) */
const POT = {
  box: [444, 748, 422, 274] as const,
  foot: [656, 1001] as Pt,
  seeds: [[650, 930], [620, 815], [800, 865], [475, 870]] as Pt[],
  hole: [505, 870] as Pt,
  spout: [836, 818] as Pt,
  lid: { cx: 662, cy: 822, rx: 92, ry: 19 },
}
/** the table's far edge and the glass rim as ellipses, image px (for filling in behind the teapot) */
const EDGE_E = { cx: 984.65, cy: 1226.06, rx: 1193.7, ry: 492.16 }
const RIM_E = { cx: 969.67, cy: 1041.46, rx: 558.34, ry: 208.76 }

/** the teapot and dishes sit in six places around the lazy Susan; the teapot's place is where the art has it */
const SLOTS = 6
const POT_THETA = Math.atan2(-0.56, -0.198)
const POT_R = 0.594
const DISH_R = 0.62
/** where the cart stops, behind your table, and where it comes from (the far end of the aisle) */
const CART_W = 300
const CART_H = 314
const NEAR = { x: 462, y: 428, s: 1 }
const FAR = { x: 503, y: 252, s: 0.4 }
const LADY_H = 270
/** the waiter stands at the table's far side, right of the aisle */
const WAITER_Y = 426
/** empties pile up on the table, right of the glass */
const STACK: Pt = [930, 452]

// ---------- the dishes ----------
type Cap = [number, number, number, number, number] // a capsule: x1, y1, x2, y2, radius (sprite px)
type Ell = [number, number, number, number, number] // cx, cy, rx, ry, degrees (sprite px)
interface PieceDef {
  /** inside the piece's ink outline: the piece is everything the seeds reach without crossing a line */
  seeds?: Pt[]
  /** or simply a shape (rolls and feet that touch the sauce) */
  cap?: Cap
}
interface DishDef {
  name: string
  call: string
  w: number
  /** where the dish touches the glass, as a share of the sprite's height */
  foot: number
  steamer: boolean
  /** back to front: eaten in this order, so nothing hidden behind a piece is ever needed */
  pieces: PieceDef[]
  /** the bits that aren't a piece (a stray foot, peas), gone with the last bite */
  rest?: Ell
  /** what's left on the plate */
  sauce?: [...Ell, string]
  /** a steamer's paper liner (inside it, a piece leaves liner; outside, bamboo) */
  liner?: Ell
  /** a plate's outline and its blue ring (sprite px, fitted to the art): an empty plate is painted back clean */
  plate?: Ell
  ring?: Ell
  line: string
}
const DISHES: Record<DishId, DishDef> = {
  'har-gow': {
    name: 'Har Gow', call: 'Har gow!', w: 118, foot: 0.84, steamer: true,
    liner: [217, 190, 178, 114, 0],
    pieces: [{ seeds: [[224, 100]] }, { seeds: [[125, 165]] }, { seeds: [[295, 185]] }, { seeds: [[200, 235]] }],
    line: 'Har gow: shrimp in a wrapper thin enough to see through.',
  },
  'siu-mai': {
    name: 'Siu Mai', call: 'Siu mai!', w: 118, foot: 0.84, steamer: true,
    liner: [210, 184, 172, 114, 0],
    pieces: [{ seeds: [[190, 105], [190, 135]] }, { seeds: [[285, 190], [285, 225]] }, { seeds: [[150, 205], [150, 240]] }],
    line: 'Siu mai: pork and shrimp, open at the top.',
  },
  'char-siu-bao': {
    name: 'Char Siu Bao', call: 'Char siu bao!', w: 118, foot: 0.84, steamer: true,
    liner: [213, 190, 180, 112, 0],
    pieces: [{ seeds: [[160, 110], [250, 120]] }, { seeds: [[295, 205]] }, { seeds: [[140, 210]] }],
    line: 'Char siu bao: barbecued pork in a soft steamed bun.',
  },
  'cheung-fun': {
    name: 'Cheung Fun', call: 'Cheung fun!', w: 132, foot: 0.6, steamer: false,
    plate: [209, 149.7, 208.8, 135, -15.1], ring: [210.4, 146.9, 191, 116.3, -16],
    pieces: [{ cap: [80, 130, 320, 55, 30] }, { cap: [100, 180, 355, 115, 30] }, { cap: [130, 232, 360, 180, 30] }],
    rest: [215, 150, 168, 92, -15],
    sauce: [222, 168, 150, 62, -15, '#5b2c12'],
    line: 'Cheung fun: steamed rice noodle rolls under sweet soy sauce.',
  },
  'turnip-cake': {
    name: 'Turnip Cake', call: 'Turnip cake!', w: 128, foot: 0.62, steamer: false,
    plate: [209, 161.8, 204.5, 153.4, -1.9], ring: [209.4, 156.8, 184.1, 132.6, -1.7],
    pieces: [{ seeds: [[150, 120], [260, 140], [200, 150]] }, { seeds: [[110, 180]] }, { seeds: [[285, 190]] }],
    line: 'Turnip cake is made with radish. Nobody is fixing the name.',
  },
  'chicken-feet': {
    name: 'Chicken Feet', call: 'Chicken feet!', w: 124, foot: 0.62, steamer: false,
    plate: [208.2, 150.3, 203.6, 167, -2.1],
    pieces: [{ cap: [65, 160, 170, 60, 28] }, { cap: [95, 200, 340, 85, 30] }, { cap: [140, 250, 360, 135, 30] }, { cap: [240, 245, 320, 205, 27] }],
    rest: [205, 158, 178, 122, 0],
    sauce: [205, 175, 150, 84, 0, '#6a240c'],
    line: 'On the menu they’re phoenix claws. Fried, then steamed in black bean sauce.',
  },
  'egg-tart': {
    name: 'Egg Tarts', call: 'Egg tarts!', w: 126, foot: 0.62, steamer: false,
    plate: [210.4, 191.2, 205.4, 144.9, 0.1], ring: [209.4, 184.9, 186.8, 128.3, 1],
    pieces: [{ seeds: [[200, 80]] }, { seeds: [[115, 185], [100, 262]] }, { seeds: [[300, 185], [300, 268]] }],
    line: 'Egg tarts go fast. Get them while they’re warm.',
  },
  'sesame-ball': {
    name: 'Sesame Balls', call: 'Sesame balls!', w: 124, foot: 0.62, steamer: false,
    plate: [208.9, 194.3, 205.9, 145.7, -1.4], ring: [208.6, 188.1, 185.4, 129.1, -1],
    pieces: [{ seeds: [[210, 75]] }, { seeds: [[130, 195]] }, { seeds: [[290, 195]] }],
    line: 'Sesame balls puff up as they fry, so they’re hollow inside.',
  },
}
const ALL = Object.keys(DISHES) as DishId[]
/** what each cart carries on the way round: steamed, then the plates, then dessert */
const CARTS: DishId[][] = [['har-gow', 'siu-mai', 'char-siu-bao'], ['cheung-fun', 'turnip-cake', 'chicken-feet'], ['egg-tart', 'sesame-ball']]
const TAKEN = ['Good choice!', 'Hot, hot!', 'Enjoy!', 'Very fresh!']

// ---------- small helpers ----------
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2)
const easeOut = (t: number) => 1 - (1 - t) ** 3
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const shuffle = <T,>(a: T[]) => a.map((v) => [Math.random(), v] as const).sort((x, y) => x[0] - y[0]).map(([, v]) => v)
const depth = (y: number) => 1 + (y - 500) * 0.003
const edgeY = (x: number) => {
  const i = Math.max(0, Math.min(EDGE.length - 2, Math.floor(x / 25)))
  const [x0, y0] = EDGE[i]
  const [x1, y1] = EDGE[i + 1]
  return lerp(y0, y1, (x - x0) / (x1 - x0))
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = rej
    i.src = src
  })
}

// ---------- cutting things out of the art ----------
/** dark or see-through pixels: the ink lines a flood can't cross */
function inkLines(d: Uint8ClampedArray, n: number, th: number): Uint8Array {
  const w = new Uint8Array(n)
  for (let i = 0; i < n; i++) w[i] = d[i * 4 + 3] < 128 || (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3 < th ? 1 : 0
  return w
}
/** everything reachable from the seeds without crossing a blocked pixel (4-connected) */
function flood(block: Uint8Array, W: number, H: number, seeds: Pt[]): Uint8Array {
  const out = new Uint8Array(W * H)
  const stack = new Int32Array(W * H)
  let sp = 0
  for (const [x, y] of seeds) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue
    const i = Math.floor(y) * W + Math.floor(x)
    if (block[i] || out[i]) continue
    out[i] = 1
    stack[sp++] = i
  }
  while (sp) {
    const i = stack[--sp]
    const x = i % W
    if (x > 0 && !block[i - 1] && !out[i - 1]) (out[i - 1] = 1), (stack[sp++] = i - 1)
    if (x < W - 1 && !block[i + 1] && !out[i + 1]) (out[i + 1] = 1), (stack[sp++] = i + 1)
    if (i >= W && !block[i - W] && !out[i - W]) (out[i - W] = 1), (stack[sp++] = i - W)
    if (i < W * (H - 1) && !block[i + W] && !out[i + W]) (out[i + W] = 1), (stack[sp++] = i + W)
  }
  return out
}
function dilate(m: Uint8Array, W: number, H: number, n: number): Uint8Array {
  let cur = m
  for (let k = 0; k < n; k++) {
    const nx = cur.slice()
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x
        if (cur[i]) continue
        if ((x > 0 && cur[i - 1]) || (x < W - 1 && cur[i + 1]) || (y > 0 && cur[i - W]) || (y < H - 1 && cur[i + W])) nx[i] = 1
      }
    }
    cur = nx
  }
  return cur
}
function fillHoles(m: Uint8Array, W: number, H: number) {
  const edge: Pt[] = []
  for (let x = 0; x < W; x++) edge.push([x, 0], [x, H - 1])
  for (let y = 0; y < H; y++) edge.push([0, y], [W - 1, y])
  const out = flood(m, W, H, edge)
  for (let i = 0; i < m.length; i++) if (!m[i] && !out[i]) m[i] = 1
}
function shape(W: number, H: number, inside: (x: number, y: number) => boolean): Uint8Array {
  const m = new Uint8Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inside(x, y)) m[y * W + x] = 1
  return m
}
const inCap = ([x1, y1, x2, y2, r]: Cap) => (x: number, y: number) => {
  const dx = x2 - x1
  const dy = y2 - y1
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)))
  return (x - x1 - t * dx) ** 2 + (y - y1 - t * dy) ** 2 <= r * r
}
const inEll = ([cx, cy, rx, ry, deg]: Ell) => {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return (x: number, y: number) => {
    const u = (x - cx) * c + (y - cy) * s
    const v = -(x - cx) * s + (y - cy) * c
    return (u / rx) ** 2 + (v / ry) ** 2 <= 1
  }
}
/** a piece of the art inside its ink outline: the flood from its seeds, plus the outline around it, holes filled */
function outlined(ink: Uint8Array, W: number, H: number, seeds: Pt[], grow: number, hole?: Pt): Uint8Array {
  const body = flood(ink, W, H, seeds)
  const m = dilate(body, W, H, grow)
  for (let i = 0; i < m.length; i++) m[i] = body[i] || (m[i] && ink[i]) ? 1 : 0
  fillHoles(m, W, H)
  if (hole) {
    const gap = flood(ink, W, H, [hole])
    for (let i = 0; i < m.length; i++) if (gap[i]) m[i] = 0
  }
  return m
}

/** Fill the unknown pixels (weight 0) from the known ones around them: a pyramid of averages, pulled back down.
 *  Smooth, and it keeps the colours of whatever is nearby (liner, glass, sauce). */
function pushPull(px: Uint8ClampedArray, W: number, H: number, known: Uint8Array, fill: Uint8Array) {
  type L = { r: Float32Array; g: Float32Array; b: Float32Array; a: Float32Array; W: number; H: number }
  const make = (w: number, h: number): L => ({ r: new Float32Array(w * h), g: new Float32Array(w * h), b: new Float32Array(w * h), a: new Float32Array(w * h), W: w, H: h })
  const base = make(W, H)
  for (let i = 0; i < W * H; i++) {
    if (!known[i]) continue
    base.r[i] = px[i * 4]
    base.g[i] = px[i * 4 + 1]
    base.b[i] = px[i * 4 + 2]
    base.a[i] = 1
  }
  const lv: L[] = [base]
  let cur = base
  while (cur.W > 1 || cur.H > 1) {
    const n = make(Math.ceil(cur.W / 2), Math.ceil(cur.H / 2))
    for (let y = 0; y < n.H; y++) {
      for (let x = 0; x < n.W; x++) {
        let r = 0, g = 0, b = 0, a = 0
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const X = 2 * x + dx
            const Y = 2 * y + dy
            if (X >= cur.W || Y >= cur.H) continue
            const j = Y * cur.W + X
            r += cur.r[j]
            g += cur.g[j]
            b += cur.b[j]
            a += cur.a[j]
          }
        }
        const i = y * n.W + x
        const k = a > 1 ? 1 / a : 1
        n.r[i] = r * k
        n.g[i] = g * k
        n.b[i] = b * k
        n.a[i] = Math.min(1, a)
      }
    }
    lv.push(n)
    cur = n
  }
  // the top: straight colour
  let up = make(cur.W, cur.H)
  for (let i = 0; i < cur.r.length; i++) {
    const a = cur.a[i] || 1
    up.r[i] = cur.r[i] / a
    up.g[i] = cur.g[i] / a
    up.b[i] = cur.b[i] / a
  }
  for (let k = lv.length - 2; k >= 0; k--) {
    const L = lv[k]
    const out = make(L.W, L.H)
    for (let y = 0; y < L.H; y++) {
      const fy = Math.max(0, Math.min(up.H - 1, (y + 0.5) / 2 - 0.5))
      const y0 = Math.floor(fy)
      const y1 = Math.min(up.H - 1, y0 + 1)
      const ty = fy - y0
      for (let x = 0; x < L.W; x++) {
        const fx = Math.max(0, Math.min(up.W - 1, (x + 0.5) / 2 - 0.5))
        const x0 = Math.floor(fx)
        const x1 = Math.min(up.W - 1, x0 + 1)
        const tx = fx - x0
        const s = (A: Float32Array) => (A[y0 * up.W + x0] * (1 - tx) + A[y0 * up.W + x1] * tx) * (1 - ty) + (A[y1 * up.W + x0] * (1 - tx) + A[y1 * up.W + x1] * tx) * ty
        const i = y * L.W + x
        const a = L.a[i]
        out.r[i] = L.r[i] + (1 - a) * s(up.r)
        out.g[i] = L.g[i] + (1 - a) * s(up.g)
        out.b[i] = L.b[i] + (1 - a) * s(up.b)
      }
    }
    up = out
  }
  for (let i = 0; i < W * H; i++) {
    if (!fill[i]) continue
    px[i * 4] = up.r[i]
    px[i * 4 + 1] = up.g[i]
    px[i * 4 + 2] = up.b[i]
    px[i * 4 + 3] = 255
  }
}

/** the pixels under a mask, on their own canvas (cropped to the mask), with a soft one-pixel edge */
interface Part { c: HTMLCanvasElement; x: number; y: number; w: number; h: number }
function cut(px: Uint8ClampedArray, W: number, H: number, m: Uint8Array, crop = true): Part {
  let x0 = W, y0 = H, x1 = -1, y1 = -1
  if (crop) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!m[y * W + x]) continue
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
    }
    if (x1 < 0) (x0 = 0), (y0 = 0), (x1 = 0), (y1 = 0)
    x0 = Math.max(0, x0 - 1)
    y0 = Math.max(0, y0 - 1)
    x1 = Math.min(W - 1, x1 + 1)
    y1 = Math.min(H - 1, y1 + 1)
  } else (x0 = 0), (y0 = 0), (x1 = W - 1), (y1 = H - 1)
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  const out = g.createImageData(w, h)
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x
      const o = ((y - y0) * w + (x - x0)) * 4
      let a = 0
      if (m[i]) a = 1
      else if ((x > 0 && m[i - 1]) || (x < W - 1 && m[i + 1]) || (y > 0 && m[i - W]) || (y < H - 1 && m[i + W])) a = 0.45
      if (!a) continue
      out.data[o] = px[i * 4]
      out.data[o + 1] = px[i * 4 + 1]
      out.data[o + 2] = px[i * 4 + 2]
      out.data[o + 3] = px[i * 4 + 3] * a
    }
  }
  g.putImageData(out, 0, 0)
  return { c, x: x0, y: y0, w, h }
}
const copyCanvas = (src: HTMLCanvasElement) => {
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  c.getContext('2d')!.drawImage(src, 0, 0)
  return c
}

/** a dish, cut into its pieces plus the empty steamer or plate they leave behind */
interface Prepped { W: number; H: number; empty: HTMLCanvasElement; pieces: Part[]; rest?: Part }
const prepared = new Map<DishId, Promise<Prepped | null>>()
function prepDish(id: DishId): Promise<Prepped | null> {
  let p = prepared.get(id)
  if (p) return p
  p = loadImg(`${SPRITES}dish-${id}.png`).then((img) => {
    try {
      const def = DISHES[id]
      const W = img.naturalWidth
      const H = img.naturalHeight
      const c = document.createElement('canvas')
      c.width = W
      c.height = H
      const g = c.getContext('2d', { willReadFrequently: true })!
      g.drawImage(img, 0, 0)
      const data = g.getImageData(0, 0, W, H)
      const px = data.data
      const ink = inkLines(px, W * H, 90)
      const masks = def.pieces.map((p) => (p.cap ? shape(W, H, inCap(p.cap)) : outlined(ink, W, H, p.seeds!, 6)))
      // a piece in front keeps what it covers
      for (let i = masks.length - 2; i >= 0; i--) for (let j = i + 1; j < masks.length; j++) for (let k = 0; k < W * H; k++) if (masks[j][k]) masks[i][k] = 0
      for (const m of masks) for (let k = 0; k < W * H; k++) if (px[k * 4 + 3] < 20) m[k] = 0
      let rest: Uint8Array | undefined
      if (def.rest) {
        rest = shape(W, H, inEll(def.rest))
        for (let k = 0; k < W * H; k++) if (px[k * 4 + 3] < 20 || masks.some((m) => m[k])) rest[k] = 0
      }
      if (def.plate) {
        // crumbs: a pea, an outline's last pixels, anything not plate right beside the food goes with the last bite
        const onPlate = inEll(def.plate)
        const food = new Uint8Array(W * H)
        for (const m of masks) for (let k = 0; k < W * H; k++) if (m[k]) food[k] = 1
        const near = dilate(food, W, H, 12)
        rest ??= new Uint8Array(W * H)
        for (let k = 0; k < W * H; k++) {
          if (!near[k] || food[k] || px[k * 4 + 3] < 20) continue
          const r = px[k * 4], gg = px[k * 4 + 1], b = px[k * 4 + 2]
          const blue = b > 140 && b > r + 45 && b > gg + 15
          const plateish = (r + gg + b) / 3 > 170 && Math.max(r, gg, b) - Math.min(r, gg, b) < 40
          if (!blue && !plateish && onPlate(k % W, Math.floor(k / W))) rest[k] = 1
        }
      }
      const pieces = masks.map((m) => cut(px, W, H, m))
      const restPart = rest ? cut(px, W, H, rest) : undefined
      // the empty steamer or plate: every piece filled in from the liner, plate or sauce around it
      const all = new Uint8Array(W * H)
      for (const m of [...masks, ...(rest ? [rest] : [])]) for (let k = 0; k < W * H; k++) if (m[k]) all[k] = 1
      const hole = dilate(all, W, H, def.plate ? 3 : 1)
      const lumAt = (k: number) => (px[k * 4] + px[k * 4 + 1] + px[k * 4 + 2]) / 3
      const blueAt = (k: number) => px[k * 4 + 2] > 140 && px[k * 4 + 2] > px[k * 4] + 45 && px[k * 4 + 2] > px[k * 4 + 1] + 15
      const at = (k: number): Pt => [k % W, Math.floor(k / W)]
      // fill each kind of surface only from its own kind: liner from liner, bamboo from bamboo, plate from plate
      const region = (inside: (k: number) => boolean, ok: (k: number) => boolean) => {
        const known = new Uint8Array(W * H)
        const fill = new Uint8Array(W * H)
        for (let k = 0; k < W * H; k++) {
          if (!inside(k)) continue
          if (hole[k]) fill[k] = px[k * 4 + 3] > 20 ? 1 : 0
          else if (px[k * 4 + 3] > 200 && ok(k)) known[k] = 1
        }
        pushPull(px, W, H, known, fill)
      }
      const strokeIn = (e: Ell, width: number, colour: string) => {
        const [cx, cy, rx, ry, deg] = e
        g.strokeStyle = colour
        g.lineWidth = width
        g.beginPath()
        g.ellipse(cx, cy, rx, ry, (deg * Math.PI) / 180, 0, Math.PI * 2)
        g.stroke()
      }
      const holeClip = () => {
        const clip = new Path2D()
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (!hole[y * W + x]) continue
            let run = x
            while (run + 1 < W && hole[y * W + run + 1]) run++
            clip.rect(x, y, run - x + 1, 1)
            x = run
          }
        }
        return clip
      }
      if (def.plate) {
        const [cx, cy, rx, ry, deg] = def.plate
        const outer = inEll(def.plate)
        const inner = inEll([cx, cy, rx - 8, ry - 8, deg])
        region((k) => outer(...at(k)), (k) => inner(...at(k)) && lumAt(k) > 150 && !blueAt(k))
        // nothing sticks out past the plate any more
        const edge = inEll([cx, cy, rx + 3, ry + 3, deg])
        for (let k = 0; k < W * H; k++) if ((hole[k] && !outer(...at(k))) || !edge(...at(k))) px[k * 4 + 3] = 0
        g.putImageData(data, 0, 0)
        g.save()
        g.clip(holeClip())
        if (def.ring) strokeIn(def.ring, 5, '#5f8bd0')
        strokeIn([cx, cy, rx - 3.5, ry - 3.5, deg], 7, '#1b1720')
        g.restore()
      } else if (def.liner) {
        const liner = inEll(def.liner)
        region((k) => liner(...at(k)), (k) => lumAt(k) > 140)
        region((k) => !liner(...at(k)), (k) => lumAt(k) > 90)
        g.putImageData(data, 0, 0)
      } else {
        region(() => true, () => true)
        g.putImageData(data, 0, 0)
      }
      const fill = new Uint8Array(W * H)
      for (let k = 0; k < W * H; k++) fill[k] = hole[k] && px[k * 4 + 3] > 20 && (!def.liner || inEll(def.liner)(...at(k))) ? 1 : 0
      if (def.sauce) {
        const [cx, cy, rx, ry, deg, col] = def.sauce
        g.save()
        g.translate(cx, cy)
        g.rotate((deg * Math.PI) / 180)
        g.filter = 'blur(6px)'
        g.globalAlpha = 0.85
        g.fillStyle = col
        g.beginPath()
        g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2)
        g.fill()
        g.filter = 'blur(3px)'
        g.globalAlpha = 0.35
        g.fillStyle = '#fff3dc'
        g.beginPath()
        g.ellipse(-rx * 0.25, -ry * 0.35, rx * 0.35, ry * 0.12, -0.15, 0, Math.PI * 2)
        g.fill()
        g.restore()
      }
      if (def.steamer) {
        // the liner's steam holes, where a piece used to sit
        g.save()
        g.fillStyle = 'rgba(74, 78, 92, 0.55)'
        for (let y = 70; y < 300; y += 36) {
          for (let x = 70 + ((y / 36) % 2) * 26; x < 370; x += 52) {
            const k = Math.round(y) * W + Math.round(x)
            if (!fill[k]) continue
            g.beginPath()
            g.ellipse(x, y, 5.5, 3.6, 0, 0, Math.PI * 2)
            g.fill()
          }
        }
        g.restore()
      }
      return { W, H, empty: c, pieces, rest: restPart }
    } catch {
      return null // a browser that won't read the pixels: the dish still works, it just fades bite by bite
    }
  }, () => null)
  prepared.set(id, p)
  return p
}

/** the teapot: body and lid cut out along their ink lines, and the table and glass painted back in behind them */
interface PotArt { body: HTMLCanvasElement; lid: HTMLCanvasElement; near: HTMLCanvasElement; far: HTMLCanvasElement }
async function prepPot(hall: HTMLImageElement): Promise<PotArt | null> {
  try {
    const [bx, by, W, H] = POT.box
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const g = c.getContext('2d', { willReadFrequently: true })!
    g.drawImage(hall, bx, by, W, H, 0, 0, W, H)
    const data = g.getImageData(0, 0, W, H)
    const px = data.data
    const L = (p: Pt): Pt => [p[0] - bx, p[1] - by]
    const ink = inkLines(px, W * H, 110)
    const pot = outlined(ink, W, H, POT.seeds.map(L), 9, L(POT.hole))
    const lidCut = (x: number, y: number) => {
      const X = x + bx
      const Y = y + by
      const u = (X - POT.lid.cx) / POT.lid.rx
      return Math.abs(u) <= 1 && Y < POT.lid.cy + POT.lid.ry * Math.sqrt(1 - u * u)
    }
    const lidM = shape(W, H, lidCut)
    const bodyM = pot.slice()
    for (let k = 0; k < W * H; k++) {
      lidM[k] = lidM[k] && pot[k] ? 1 : 0
      if (lidM[k]) bodyM[k] = 0
    }
    const body = cut(px, W, H, bodyM, false).c
    const lid = cut(px, W, H, lidM, false).c
    // what was behind it: carpet above the table's edge, the tablecloth, the glass; each filled from its own kind
    const edge = (x: number) => EDGE_E.cy - EDGE_E.ry * Math.sqrt(Math.max(0, 1 - ((x + bx - EDGE_E.cx) / EDGE_E.rx) ** 2)) - by
    const inGlass = (x: number, y: number) => ((x + bx - RIM_E.cx) / RIM_E.rx) ** 2 + ((y + by - RIM_E.cy) / RIM_E.ry) ** 2 <= 1
    // its shadow on the glass goes too (it gets its own, that moves with it)
    const shadow = inEll([656 - bx, 992 - by, 205, 44, 0])
    const hole = dilate(pot, W, H, 2)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (shadow(x, y) && inGlass(x, y)) hole[y * W + x] = 1
    // the table's ink edge, measured on either side of where the knob crossed it, and joined straight across
    const lum = (x: number, y: number) => (px[(y * W + x) * 4] + px[(y * W + x) * 4 + 1] + px[(y * W + x) * 4 + 2]) / 3
    let xa: number = W
    let xb = -1
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (hole[y * W + x] && Math.abs(y - edge(x)) < 14) (xa = Math.min(xa, x)), (xb = Math.max(xb, x))
    const lineAt = (x: number): [number, number] => {
      const e = Math.round(edge(x))
      for (let y = Math.max(0, e - 16); y < Math.min(H - 1, e + 10); y++) {
        if (lum(x, y) >= 70) continue
        let b = y
        while (b + 1 < H && lum(x, b + 1) < 120) b++
        return [y, b]
      }
      return [e - 6, e - 1]
    }
    xa = Math.max(0, xa - 3)
    xb = Math.min(W - 1, xb + 3)
    const [aTop, aBot] = lineAt(xa)
    const [bTop, bBot] = lineAt(xb)
    const across = (x: number) => xb > xa && x >= xa && x <= xb
    const top = (x: number) => (across(x) ? lerp(aTop, bTop, (x - xa) / (xb - xa)) : edge(x) - 6)
    const bot = (x: number) => (across(x) ? lerp(aBot, bBot, (x - xa) / (xb - xa)) + 1 : edge(x))
    // the glass rim behind it: the fitted ellipse, nudged to meet the real line exactly on either side
    const rimY = (x: number) => RIM_E.cy - RIM_E.ry * Math.sqrt(Math.max(0, 1 - ((x + bx - RIM_E.cx) / RIM_E.rx) ** 2)) - by
    let ra = W as number
    let rb = -1
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (hole[y * W + x] && Math.abs(y - rimY(x)) < 12) (ra = Math.min(ra, x)), (rb = Math.max(rb, x))
    ra = Math.max(0, ra - 3)
    rb = Math.min(W - 1, rb + 3)
    const rimAt = (x: number) => {
      const e = Math.round(rimY(x))
      for (let y = Math.max(0, e - 10); y < Math.min(H, e + 10); y++) if (lum(x, y) < 70) return y - rimY(x)
      return 0
    }
    const offA = rimAt(ra)
    const offB = rimAt(rb)
    const rimTop = (x: number) => rimY(x) + (rb > ra ? lerp(offA, offB, (x - ra) / (rb - ra)) : 0)
    const kind = new Uint8Array(W * H) // 1 carpet, 2 the table's ink edge, 3 cloth, 4 glass
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) kind[y * W + x] = y < top(x) ? 1 : y < bot(x) ? 2 : inGlass(x, y) ? 4 : 3
    for (const k of [1, 3, 4]) {
      const known = new Uint8Array(W * H)
      const fill = new Uint8Array(W * H)
      for (let i = 0; i < W * H; i++) {
        if (kind[i] !== k) continue
        if (hole[i]) fill[i] = 1
        // only clean cloth and carpet (no stray ink) to fill from
        else if (k === 4 || (k === 3 ? lum(i % W, Math.floor(i / W)) > 190 : lum(i % W, Math.floor(i / W)) > 45)) known[i] = 1
      }
      pushPull(px, W, H, known, fill)
    }
    g.putImageData(data, 0, 0)
    // the lines that ran behind it: the table's edge and the glass rim with its bright bevel
    const clip = new Path2D()
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!hole[y * W + x]) continue
        let run = x
        while (run + 1 < W && hole[y * W + run + 1]) run++
        clip.rect(x, y, run - x + 1, 1)
        x = run
      }
    }
    g.save()
    g.clip(clip)
    if (xb > xa) {
      g.fillStyle = '#0d0809'
      g.beginPath()
      g.moveTo(xa, aTop)
      g.lineTo(xb + 1, bTop)
      g.lineTo(xb + 1, bBot + 1)
      g.lineTo(xa, aBot + 1)
      g.closePath()
      g.fill()
    }
    const rim = (dy: number, width: number, colour: string) => {
      g.strokeStyle = colour
      g.lineWidth = width
      g.lineJoin = 'round'
      g.beginPath()
      for (let x = ra - 6; x <= rb + 6; x += 2) (x === ra - 6 ? g.moveTo : g.lineTo).call(g, x, rimTop(x) + dy)
      g.stroke()
    }
    rim(8.5, 7, 'rgb(222, 238, 230)')
    rim(2.2, 4.6, 'rgb(12, 34, 32)')
    g.restore()
    // only the filled-in pixels; above the table's edge it sits behind the carts, below it in front of them
    const filled = g.getImageData(0, 0, W, H).data
    const near = new Uint8Array(W * H)
    const far = new Uint8Array(W * H)
    for (let i = 0; i < W * H; i++) if (hole[i]) (kind[i] === 1 ? far : near)[i] = 1
    return { body, lid, near: cut(filled, W, H, near, false).c, far: cut(filled, W, H, far, false).c }
  } catch {
    return null
  }
}

// ---------- the tally card: a quad on the table ----------
/** a CSS matrix3d that maps a w × h box onto four corners (top left, top right, bottom right, bottom left) */
function quad(w: number, h: number, q: [Pt, Pt, Pt, Pt]): string {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q
  const dx1 = x1 - x2
  const dx2 = x3 - x2
  const dy1 = y1 - y2
  const dy2 = y3 - y2
  const sx = x0 - x1 + x2 - x3
  const sy = y0 - y1 + y2 - y3
  const det = dx1 * dy2 - dx2 * dy1
  const gg = (sx * dy2 - dx2 * sy) / det
  const hh = (dx1 * sy - sx * dy1) / det
  const a = x1 - x0 + gg * x1
  const b = x3 - x0 + hh * x3
  const d = y1 - y0 + gg * y1
  const e = y3 - y0 + hh * y3
  return `matrix3d(${[a / w, d / w, 0, gg / w, b / h, e / h, 0, hh / h, 0, 0, 1, 0, x0, y0, 0, 1].map((v) => +v.toFixed(6)).join(',')})`
}
const lerpQuad = (a: [Pt, Pt, Pt, Pt], b: [Pt, Pt, Pt, Pt], t: number) => a.map((p, i) => [lerp(p[0], b[i][0], t), lerp(p[1], b[i][1], t)]) as [Pt, Pt, Pt, Pt]
const rectQuad = (cx: number, cy: number, w: number, h: number, deg: number): [Pt, Pt, Pt, Pt] => {
  const a = (deg * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return ([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as Pt[]).map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]) as [Pt, Pt, Pt, Pt]
}
const CARD_W = 100
const CARD_H = 120

// ---------- drawings ----------
const STICKS = `<svg class="ds-sticks-svg" viewBox="-20 -6 40 330" preserveAspectRatio="none" aria-hidden="true">
  <g class="ds-stick a"><path d="M -4.5 0 L -1.5 0 L 2.5 318 L -8.5 318 Z" fill="#7a2e1c" stroke="#1d2140" stroke-width="2" stroke-linejoin="round"/><path d="M -7.6 250 L 1.6 250 L 2 270 L -8 270 Z" fill="#e0ac4a" stroke="#1d2140" stroke-width="1.5"/></g>
  <g class="ds-stick b"><path d="M 1.5 0 L 4.5 0 L 8.5 318 L -2.5 318 Z" fill="#8a3420" stroke="#1d2140" stroke-width="2" stroke-linejoin="round"/><path d="M -2 250 L 7.6 250 L 8 270 L -2.4 270 Z" fill="#e0ac4a" stroke="#1d2140" stroke-width="1.5"/></g>
</svg>`
const STAMPER = `<svg viewBox="0 0 40 60" aria-hidden="true"><path d="M 13 4 C 13 -1 27 -1 27 4 L 25 30 L 15 30 Z" fill="#a8743f" stroke="#1d2140" stroke-width="2.5" stroke-linejoin="round"/><rect x="6" y="29" width="28" height="12" rx="3" fill="#6d4a2b" stroke="#1d2140" stroke-width="2.5"/><rect x="8" y="41" width="24" height="7" rx="2" fill="#c8323a" stroke="#1d2140" stroke-width="2.5"/></svg>`
const MARK = `<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.6" fill="none" stroke="#c8323a" stroke-width="2.2" stroke-dasharray="40 3 6 2"/><path d="M 5.6 11.6 C 6.6 7.2 13.4 7.2 14.4 11.6 Z" fill="#c8323a"/><path d="M 7.6 8.6 L 8.2 10.6 M 10 7.9 L 10 10.4 M 12.4 8.6 L 11.8 10.6" stroke="#fbf3e6" stroke-width="0.9"/></svg>`
/** your hand on the table, seen from behind: two fingers out, the others curled under, the thumb tucked in */
function handSvg(skin: string, sleeve: string): string {
  const O = 'stroke="#1d2140" stroke-width="3" stroke-linejoin="round"'
  return `<svg viewBox="0 0 140 210" aria-hidden="true">
    <path d="M 22 214 L 30 150 C 60 140 96 140 122 150 L 128 214 Z" fill="${sleeve}" ${O}/>
    <path d="M 30 158 C 22 128 24 92 38 72 L 104 68 C 120 86 124 124 116 158 C 92 168 54 168 30 158 Z" fill="${skin}" ${O}/>
    <path d="M 104 70 C 116 70 122 80 120 92 C 118 102 108 104 102 98" fill="${skin}" ${O}/>
    <path d="M 112 94 C 124 96 128 108 124 118 C 120 126 110 126 106 120" fill="${skin}" ${O}/>
    <path d="M 36 96 C 22 100 18 120 26 132 C 32 140 42 138 46 128" fill="${skin}" ${O}/>
    <path d="M 44 74 L 46 18 C 46 6 66 6 66 18 L 66 76" fill="${skin}" ${O}/>
    <path d="M 68 74 L 70 12 C 70 0 90 0 90 12 L 90 74" fill="${skin}" ${O}/>
    <path d="M 49 20 C 49 13 63 13 63 20 L 62 30 C 58 33 53 33 50 30 Z" fill="#fff6ec" opacity=".75"/>
    <path d="M 73 14 C 73 7 87 7 87 14 L 86 24 C 82 27 77 27 74 24 Z" fill="#fff6ec" opacity=".75"/>
    <path d="M 50 62 C 54 60 58 60 62 62 M 74 60 C 78 58 82 58 86 60 M 52 92 C 62 96 80 96 92 90" stroke="rgba(29,33,64,.3)" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  </svg>`
}
const TOK = `<svg viewBox="-20 -14 40 20" aria-hidden="true"><path d="M -13 -2 L -18 -7 M 0 -5 L 0 -12 M 13 -2 L 18 -7" stroke="#1d2140" stroke-width="2.6" stroke-linecap="round"/></svg>`

// ---------- the moment ----------
export function dimSum(g: Game): void {
  const release = hold()
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
  const root = el('div', 'ds')
  const edgePoly = EDGE.map(([x, y]) => `${x}px ${y}px`).join(', ')
  root.innerHTML = `<img class="ds-hall" src="${HALL}" alt="" draggable="false">
    <div class="ds-table" style="clip-path: polygon(${edgePoly}, 1000px 566px, 0 566px)"></div>
    <div class="ds-glass" aria-hidden="true"></div>
    <svg class="ds-glint" viewBox="0 0 1000 565" aria-hidden="true"><path d=""/></svg>
    <svg class="ds-cup" viewBox="0 0 1000 565" aria-hidden="true">
      <defs><clipPath id="ds-cup-mouth"><ellipse cx="${CUP.x}" cy="${CUP.y}" rx="${CUP.rx}" ry="${CUP.ry}"/></clipPath></defs>
      <g clip-path="url(#ds-cup-mouth)"><ellipse class="ds-tea" cx="${CUP.x}" cy="${CUP.y}" rx="0" ry="0"/><ellipse class="ds-tea-hi" cx="${CUP.x}" cy="${CUP.y}" rx="0" ry="0"/></g>
    </svg>
    <button class="ds-cup-hit" type="button" aria-label="Your tea"></button>
    <div class="ds-cloth" hidden></div>
    <div class="ds-card"><div class="ds-card-paper"></div><div class="ds-marks"></div></div>
    <svg class="ds-pour" viewBox="0 0 1000 565" aria-hidden="true"><path class="ds-stream" d=""/></svg>
    <div class="ds-caption"><b>Dim Sum</b><span>Chinatown</span></div>
    <p class="ds-line" aria-live="polite"></p>
    <div class="ds-actions"><span class="ds-coins" title="Coins"><img src="/art/icons/e/coin.png" alt=""><b></b></span><button class="btn tiny ghost ds-check" type="button">Check, Please</button></div>`
  stage.root.append(root)
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as T
  const table = $('.ds-table')
  const glass = $('.ds-glass')
  const glint = $<SVGPathElement>('.ds-glint path')
  const tea = $<SVGEllipseElement>('.ds-tea')
  const teaHi = $<SVGEllipseElement>('.ds-tea-hi')
  const cloth = $('.ds-cloth')
  const card = $('.ds-card')
  const marks = $('.ds-marks')
  const stream = $<SVGPathElement>('.ds-stream')
  const lineEl = $('.ds-line')
  const coinsEl = $('.ds-coins b')
  const checkBtn = $<HTMLButtonElement>('.ds-check')
  coinsEl.textContent = String(save.coins)
  card.style.transform = quad(CARD_W, CARD_H, CARD)
  cloth.style.transform = quad(CARD_W, CARD_H, rectQuadAround(CARD, 5))

  // ---------- lifetime: timers, tweens, the frame loop ----------
  let closed = false
  let checking = false
  const timers = new Set<number>()
  const wait = (ms: number) =>
    new Promise<void>((res) => {
      const t = window.setTimeout(() => {
        timers.delete(t)
        if (!closed) res()
      }, ms)
      timers.add(t)
    })
  type Tw = { t0: number; dur: number; f: (k: number) => void; res: () => void }
  const tweens = new Set<Tw>()
  const tween = (ms: number, f: (k: number) => void) =>
    new Promise<void>((res) => {
      if (closed) return
      tweens.add({ t0: performance.now(), dur: calm ? Math.min(ms, 120) : ms, f, res })
    })
  const framers: ((dt: number, t: number) => void)[] = []
  let raf = 0
  let last = performance.now()
  const frame = (now: number) => {
    if (closed) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    for (const tw of [...tweens]) {
      const k = Math.min(1, (now - tw.t0) / tw.dur)
      tw.f(k)
      if (k >= 1) {
        tweens.delete(tw)
        tw.res()
      }
    }
    for (const f of framers) f(dt, now / 1000)
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  // ---------- sound: the hall's murmur, porcelain, carts, tea ----------
  const snd = sounds()
  snd.start()
  onMute((m) => (m ? snd.stop() : !closed && snd.start()))

  // ---------- one quiet line at a time ----------
  const lines: string[] = []
  let lineBusy = false
  const said = new Set<string>()
  const line = (text: string, key = text) => {
    if (said.has(key) || closed) return
    said.add(key)
    if (lines.length >= 2) lines.shift()
    lines.push(text)
    if (!lineBusy) nextLine()
  }
  const nextLine = async () => {
    const text = lines.shift()
    if (!text) return void (lineBusy = false)
    lineBusy = true
    lineEl.textContent = text
    lineEl.classList.add('on')
    await wait(Math.max(4200, text.length * 70))
    lineEl.classList.remove('on')
    await wait(900)
    nextLine()
  }

  // ---------- small hints, each shown once ----------
  const hints = new Map<string, HTMLElement>()
  const hinted = new Set<string>()
  const hint = (key: string, text: string, at: Pt) => {
    if (hinted.has(key) || closed || checking) return
    hinted.add(key)
    const h = el('div', 'ds-hint', `<span>${text}</span>`)
    h.style.left = `${at[0]}px`
    h.style.top = `${at[1]}px`
    root.append(h)
    hints.set(key, h)
    // a hint only says it once, for a while
    const t = window.setTimeout(() => unhint(key), 9000)
    timers.add(t)
  }
  const unhint = (key: string) => {
    const h = hints.get(key)
    if (!h) return
    hints.delete(key)
    h.classList.add('gone')
    setTimeout(() => h.remove(), 300)
  }

  const puff = (x: number, y: number, n = 3, spread = 30) => {
    for (let i = 0; i < n; i++) {
      const p = el('i', 'ds-puff')
      p.style.left = `${x + (Math.random() - 0.5) * spread}px`
      p.style.top = `${y + (Math.random() - 0.5) * 8}px`
      p.style.animationDelay = `${i * 0.12}s`
      p.style.setProperty('--dx', `${(Math.random() - 0.5) * 24}px`)
      root.append(p)
      setTimeout(() => p.remove(), 1700)
    }
  }

  // ---------- people behind the table: the cart ladies and the waiter ----------
  const person = (look: ReturnType<typeof randomLook>, cls: string) => {
    const p = el('div', `ds-person ${cls}`, `<svg class="front" viewBox="-60 -185 120 192" aria-hidden="true">${avatarMarkup(look, { mood: 'grin', d: -1 })}</svg><svg class="back" viewBox="-60 -185 120 192" aria-hidden="true">${avatarMarkup(look, { back: true })}</svg><p class="ds-bubble" hidden></p>`)
    root.append(p)
    return p
  }
  /** feet at (x, y), `s` times life size */
  const placePerson = (p: HTMLElement, x: number, y: number, s: number) => {
    const h = LADY_H * s
    p.style.transform = `translate(${(x - (h * 120) / 192 / 2).toFixed(1)}px, ${(y - (h * 185) / 192).toFixed(1)}px)`
    p.style.width = `${((h * 120) / 192).toFixed(1)}px`
    p.style.height = `${h.toFixed(1)}px`
  }
  const bubbleTimers = new WeakMap<HTMLElement, number>()
  const say = (p: HTMLElement, text: string, ms = 2600) => {
    const b = p.querySelector<HTMLElement>('.ds-bubble')!
    b.textContent = text
    b.hidden = false
    b.classList.remove('pop')
    void b.offsetWidth
    b.classList.add('pop')
    clearTimeout(bubbleTimers.get(p))
    bubbleTimers.set(p, window.setTimeout(() => (b.hidden = true), ms))
  }

  let waiter: HTMLElement | null = null
  let waiterX = 745
  const waiterIn = async () => {
    if (waiter) return waiter
    const look = randomLook(0)
    look.items = { ...look.items, body: 'suit' }
    delete look.items.head
    delete look.items.hand
    const w = person(look, 'ds-waiter')
    waiter = w
    // right of the aisle, or left of it when a cart is parked there
    const x = (waiterX = cartLady ? 258 : 745)
    const from = x - 45
    placePerson(w, x, WAITER_Y, 1)
    w.style.opacity = '0'
    await tween(500, (k) => {
      placePerson(w, lerp(from, x, easeOut(k)), WAITER_Y, 1)
      w.style.opacity = String(k)
    })
    return w
  }
  const waiterOut = async () => {
    const w = waiter
    if (!w) return
    waiter = null
    w.querySelector('.ds-bubble')!.setAttribute('hidden', '')
    w.classList.add('away')
    await tween(500, (k) => {
      placePerson(w, lerp(waiterX, waiterX - 45, k), WAITER_Y, 1)
      w.style.opacity = String(1 - k)
    })
    w.remove()
  }

  // ---------- the lazy Susan: the teapot and the dishes go round on it ----------
  interface Obj { el: HTMLElement; slot: number; r: number; ax: number; ay: number; held?: boolean; x: number; y: number; s: number }
  interface Dish extends Obj { id: DishId; left: number; layers: HTMLElement[]; rest?: HTMLElement; prepped: Prepped | null }
  let rot = 0
  let spin = 0
  const slotAngle = (slot: number) => POT_THETA + (slot * Math.PI * 2) / SLOTS + rot
  const slotPos = (slot: number, r: number): Pt => {
    const t = slotAngle(slot)
    return [GLASS.x + r * GLASS.rx * Math.sin(t), GLASS.y + r * GLASS.ry * Math.cos(t)]
  }
  const place = (o: Obj, x: number, y: number, s: number, deg = 0, z?: number) => {
    o.x = x
    o.y = y
    o.s = s
    o.el.style.transform = `translate(${(x - o.ax).toFixed(1)}px, ${(y - o.ay).toFixed(1)}px) scale(${s.toFixed(4)})${deg ? ` rotate(${deg.toFixed(2)}deg)` : ''}`
    o.el.style.zIndex = String(z ?? 100 + Math.round(y))
  }
  const seat = (o: Obj) => {
    const [x, y] = slotPos(o.slot, o.r)
    place(o, x, y, depth(y))
  }

  // the teapot: until its cut-out is ready, the painting's own teapot stands in
  const potEl = el('div', 'ds-pot', `<i class="ds-pot-shadow"></i><div class="ds-pot-art"><canvas class="ds-pot-body"></canvas><svg class="ds-pot-open" viewBox="0 0 211 137" aria-hidden="true"><ellipse cx="109" cy="37.6" rx="42" ry="8.3" fill="#2b1406" stroke="#1d2140" stroke-width="2.4"/><ellipse cx="111" cy="39.5" rx="30" ry="4.5" fill="#6b3a12"/></svg><canvas class="ds-pot-lid"></canvas></div>`)
  const pot: Obj = { el: potEl, slot: 0, r: POT_R, ax: (POT.foot[0] - POT.box[0]) * K, ay: (POT.foot[1] - POT.box[1]) * K, x: 0, y: 0, s: 1 }
  potEl.style.transformOrigin = `${pot.ax}px ${pot.ay}px`
  potEl.hidden = true
  root.append(potEl)
  const potLid = potEl.querySelector<HTMLCanvasElement>('.ds-pot-lid')!
  let potReady = false
  let pours = 4
  let lidOpen = false
  let potBusy = false

  const dishes: Dish[] = []
  const freeSlot = (): number | null => {
    const used = new Set(dishes.map((d) => d.slot))
    let best: number | null = null
    let bestD = 9
    for (let s = 1; s < SLOTS; s++) {
      if (used.has(s)) continue
      // the place nearest the back of the glass, where it lands in plain view
      const a = (((slotAngle(s) - Math.PI) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI
      if (Math.abs(a) < bestD) (bestD = Math.abs(a)), (best = s)
    }
    return best
  }
  const dishEl = (id: DishId, pp: Prepped | null) => {
    const def = DISHES[id]
    const W = pp?.W ?? 420
    const H = pp?.H ?? 420
    const w = def.w
    const h = (w * H) / W
    const e = el('div', 'ds-dish')
    e.style.width = `${w}px`
    e.style.height = `${h.toFixed(1)}px`
    const layers: HTMLElement[] = []
    let rest: HTMLElement | undefined
    if (pp) {
      const base = copyCanvas(pp.empty)
      base.className = 'ds-layer'
      e.append(base)
      const put = (p: Part) => {
        const c = copyCanvas(p.c)
        c.className = 'ds-layer'
        c.style.cssText = `left:${((p.x / W) * 100).toFixed(3)}%;top:${((p.y / H) * 100).toFixed(3)}%;width:${((p.w / W) * 100).toFixed(3)}%;height:${((p.h / H) * 100).toFixed(3)}%`
        e.append(c)
        return c
      }
      if (pp.rest) rest = put(pp.rest)
      for (const p of pp.pieces) layers.push(put(p))
    } else {
      const img = el('img', 'ds-layer') as HTMLImageElement
      img.src = `${SPRITES}dish-${id}.png`
      img.alt = ''
      e.append(img)
    }
    return { e, layers, rest, w, h, ax: w / 2, ay: h * def.foot }
  }

  // ---------- spinning the glass ----------
  let drag: { x: number; rot: number; sign: number; moved: boolean; lastX: number; lastT: number; onTap?: () => void } | null = null
  const startDrag = (e: PointerEvent, onTap?: () => void) => {
    if (checking) return
    e.preventDefault()
    const [x, y] = toStage(e)
    drag = { x, rot, sign: y < GLASS.y ? -1 : 1, moved: false, lastX: x, lastT: performance.now(), onTap }
    spin = 0
    window.addEventListener('pointermove', onDrag)
    window.addEventListener('pointerup', endDrag)
  }
  const onDrag = (e: PointerEvent) => {
    if (!drag) return
    const [x] = toStage(e)
    if (!drag.moved && Math.abs(x - drag.x) > 6) {
      drag.moved = true
      root.classList.add('spinning')
      unhint('spin')
    }
    if (!drag.moved || potBusy) return
    const now = performance.now()
    const before = rot
    rot = drag.rot + (drag.sign * (x - drag.x)) / (GLASS.rx * DISH_R)
    const dt = Math.max(0.008, (now - drag.lastT) / 1000)
    spin = (rot - before) / dt
    drag.lastX = x
    drag.lastT = now
    snd.creak(Math.abs(rot - before))
  }
  const endDrag = () => {
    window.removeEventListener('pointermove', onDrag)
    window.removeEventListener('pointerup', endDrag)
    const d = drag
    drag = null
    root.classList.remove('spinning')
    if (d && !d.moved) d.onTap?.()
    if (d?.moved && performance.now() - d.lastT > 90) spin = 0
  }
  glass.addEventListener('pointerdown', (e) => startDrag(e))
  framers.push((dt) => {
    if (!drag && Math.abs(spin) > 0.01) {
      rot += spin * dt
      spin *= Math.exp(-dt * 2.6)
      snd.creak(Math.abs(spin * dt))
    } else if (!drag) spin = 0
    if (!pot.held && potReady) seat(pot)
    for (const d of dishes) if (!d.held) seat(d)
    // a glint on the rim that goes round with the glass
    const a0 = -rot * 0.8 + 2.2
    const pts: string[] = []
    for (let k = 0; k <= 10; k++) {
      const a = a0 + k * 0.045
      pts.push(`${(GLASS.x + (GLASS.rx - 7) * Math.sin(a)).toFixed(1)} ${(GLASS.y - (GLASS.ry - 6) * Math.abs(Math.cos(a))).toFixed(1)}`)
    }
    glint.setAttribute('d', `M ${pts.join(' L ')}`)
  })

  // ---------- the hall's art, the teapot cut out of it, the dishes cut up ----------
  void loadImg(HALL).then(async (hall) => {
    const art = await prepPot(hall)
    if (closed || !art) return
    const [bx, by] = POT.box
    const far = art.far
    far.className = 'ds-patch far'
    const near = art.near
    near.className = 'ds-patch near'
    for (const c of [far, near]) c.style.cssText = `left:${(bx * K).toFixed(1)}px;top:${(by * K).toFixed(1)}px;width:${(c.width * K).toFixed(1)}px;height:${(c.height * K).toFixed(1)}px`
    root.prepend(far)
    root.querySelector('.ds-hall')!.after(far)
    table.after(near)
    const bodyC = potEl.querySelector<HTMLCanvasElement>('.ds-pot-body')!
    for (const [dst, src] of [[bodyC, art.body], [potLid, art.lid]] as const) {
      dst.width = src.width
      dst.height = src.height
      dst.getContext('2d')!.drawImage(src, 0, 0)
    }
    potEl.hidden = false
    potReady = true
    seat(pot)
  })
  // cut every dish up front, one at a time, so nothing waits when a cart arrives
  void (async () => {
    for (const id of ALL) {
      await prepDish(id)
      await new Promise((r) => setTimeout(r, 30))
      if (closed) return
    }
  })()

  // ---------- tea ----------
  let teaLevel = 0 // 0: what the art shows; 1: a full cup
  const drawTea = () => {
    const f = teaLevel
    tea.style.opacity = f > 0.02 ? '1' : '0'
    tea.setAttribute('cy', (CUP.y + 7 * (1 - f)).toFixed(2))
    tea.setAttribute('rx', (CUP.rx * (0.7 + 0.32 * f)).toFixed(2))
    tea.setAttribute('ry', (CUP.ry * (0.62 + 0.42 * f)).toFixed(2))
    teaHi.setAttribute('cy', (CUP.y + 7 * (1 - f) - 2.2).toFixed(2))
    teaHi.setAttribute('cx', (CUP.x - 9).toFixed(2))
    teaHi.setAttribute('rx', (8 * f).toFixed(2))
    teaHi.setAttribute('ry', (1.6 * f).toFixed(2))
  }
  drawTea()
  let pouredForYou = 0
  const spoutAt = (o: Obj, deg: number): Pt => {
    const sx = (POT.spout[0] - POT.box[0]) * K - o.ax
    const sy = (POT.spout[1] - POT.box[1]) * K - o.ay
    const a = (deg * Math.PI) / 180
    return [o.x + (sx * Math.cos(a) - sy * Math.sin(a)) * o.s, o.y + (sx * Math.sin(a) + sy * Math.cos(a)) * o.s]
  }
  /** lift the pot over to your cup and pour (`by` the waiter, or you) */
  const pour = async (by: 'waiter' | 'you') => {
    if (potBusy || !potReady || checking) return
    potBusy = true
    unhint('pour')
    if (lidOpen) await closeLid()
    pot.held = true
    root.classList.add('pouring')
    const [x0, y0, s0] = [pot.x, pot.y, pot.s]
    const TILT = 38
    const dry = pours <= 0
    // where the pot's foot goes so the spout's tip is just over your cup
    const sx = (POT.spout[0] - POT.box[0]) * K - pot.ax
    const sy = (POT.spout[1] - POT.box[1]) * K - pot.ay
    const a = (TILT * Math.PI) / 180
    const tipX = CUP.x - 5
    const tipY = CUP.y - 44
    const fx = tipX - (sx * Math.cos(a) - sy * Math.sin(a))
    const fy = tipY - (sx * Math.sin(a) + sy * Math.cos(a))
    snd.clink(1)
    await tween(260, (k) => place(pot, x0, y0 - 26 * easeOut(k), s0, 0, 900))
    await tween(620, (k) => {
      const e = ease(k)
      place(pot, lerp(x0, fx, e), lerp(y0 - 26, fy, e) - Math.sin(Math.PI * e) * 24, lerp(s0, 1, e), 0, 900)
    })
    await tween(340, (k) => place(pot, fx, fy, 1, TILT * ease(k), 900))
    const tip = spoutAt(pot, TILT)
    if (!dry) {
      stream.setAttribute('d', `M ${tip[0].toFixed(1)} ${tip[1].toFixed(1)} Q ${(tip[0] + 3).toFixed(1)} ${(tip[1] + 22).toFixed(1)} ${(CUP.x - 2).toFixed(1)} ${(CUP.y + 1).toFixed(1)}`)
      stream.classList.add('on')
      snd.pour(true)
      const from = teaLevel
      await tween(1150, (k) => {
        teaLevel = lerp(from, 1, k)
        drawTea()
      })
      stream.classList.remove('on')
      snd.pour(false)
      puff(CUP.x, CUP.y - 14, 2, 20)
      pours--
    } else {
      // nothing left: a drip, a drop, and that's the pot
      for (let i = 0; i < 2; i++) {
        const d = el('i', 'ds-drip')
        d.style.left = `${tip[0]}px`
        d.style.top = `${tip[1]}px`
        root.append(d)
        setTimeout(() => d.remove(), 700)
        snd.drip()
        await wait(380)
      }
    }
    await tween(300, (k) => place(pot, fx, fy, 1, TILT * (1 - ease(k)), 900))
    const [hx, hy] = slotPos(pot.slot, pot.r)
    const hs = depth(hy)
    await tween(620, (k) => {
      const e = ease(k)
      place(pot, lerp(fx, hx, e), lerp(fy, hy - 20, e) - Math.sin(Math.PI * e) * 24, lerp(1, hs, e), 0, 900)
    })
    const [hx2, hy2] = slotPos(pot.slot, pot.r)
    await tween(200, (k) => place(pot, hx2, hy2 - 20 * (1 - k), depth(hy2), 0, 900))
    snd.clack(0.7)
    pot.held = false
    root.classList.remove('pouring')
    potBusy = false
    if (by === 'waiter') pouredForYou = performance.now()
    if (dry) {
      line('Empty pot.', 'dry')
      hint('lid', 'Open the lid', lidSpot())
    } else if (pours <= 0) hint('lid', 'Open the lid', lidSpot())
  }
  const lidSpot = (): Pt => [pot.x - 2 * pot.s, pot.y - 122 * pot.s]

  // the lid: tip it open and a waiter comes with hot water
  const openLid = async () => {
    if (lidOpen || potBusy || checking) return
    potBusy = true
    lidOpen = true
    unhint('lid')
    potEl.classList.add('lid-open')
    snd.clink(1.2)
    line('An open lid means more hot water, please. No need to say a word.', 'lid')
    await wait(1300)
    const w = await waiterIn()
    say(w, 'Hot water!')
    await wait(700)
    puff(pot.x, pot.y - 110 * pot.s, 5, 36)
    snd.pour(true)
    await wait(1300)
    snd.pour(false)
    pours = 4
    potBusy = false
    await closeLid()
    pouredForYou = performance.now()
    await wait(1500)
    if (waiter === w && !tapWaiting) waiterOut()
  }
  const closeLid = async () => {
    if (!lidOpen) return
    lidOpen = false
    potEl.classList.remove('lid-open')
    await wait(calm ? 50 : 260)
    snd.clink(1.4)
  }
  potEl.addEventListener('pointerdown', (e) => {
    if (!potReady) return
    // the lid is the top of the pot (in the art's own coordinates)
    const r = potLid.getBoundingClientRect()
    const onLid = e.clientX >= r.left + r.width * 0.29 && e.clientX <= r.left + r.width * 0.73 && e.clientY <= r.top + r.height * 0.36
    startDrag(e, () => (onLid ? (lidOpen ? null : void openLid()) : void pour('you')))
  })

  // a sip from your cup
  $('.ds-cup-hit').addEventListener('click', () => {
    if (checking) return
    if (teaLevel < 0.08) {
      hint('pour', 'Pour some tea', [pot.x + 30, pot.y - 120 * pot.s])
      return
    }
    teaLevel = Math.max(0, teaLevel - 0.34)
    drawTea()
    snd.sip()
    puff(CUP.x, CUP.y - 12, 1, 6)
    line('In Cantonese, going for dim sum is yum cha: “drink tea.”', 'yumcha')
  })

  // ---------- two fingers on the table: thank you ----------
  let tapWaiting = false
  let onTapped: (() => void) | null = null
  const skin = SKINS[save.look.skin] ?? SKINS[0]
  const sleeve = (ITEM[save.look.items.body ?? '']?.top as { color?: string } | undefined)?.color ?? '#7aa0d8'
  let tapping = false
  table.addEventListener('pointerdown', async (e) => {
    if (checking || tapping) return
    const [x, y] = toStage(e)
    if (y < edgeY(x) + 4) return
    tapping = true
    unhint('tap')
    // fingertips where you clicked; the nearer the table's edge, the smaller the hand
    const hs = Math.max(0.75, Math.min(1.1, 0.75 + (y - 400) / 320))
    const hand = el('div', 'ds-hand', handSvg(skin, sleeve))
    hand.style.left = `${x - 68 * hs}px`
    hand.style.top = `${y - 4 * hs}px`
    hand.style.width = `${140 * hs}px`
    hand.style.height = `${210 * hs}px`
    root.append(hand)
    const fingers = (lift: number, down: number) => (hand.style.transform = `translateY(${(down - lift).toFixed(1)}px) scaleY(${(1 + lift * 0.012).toFixed(3)})`)
    await tween(240, (k) => fingers(0, (1 - easeOut(k)) * 230))
    for (let i = 0; i < 2; i++) {
      await tween(110, (k) => fingers(9 * Math.sin(k * Math.PI * 0.5), 0))
      await tween(60, (k) => fingers(9 * (1 - k), 0))
      snd.knock()
      const tok = el('i', 'ds-tok', TOK)
      tok.style.left = `${x - 2}px`
      tok.style.top = `${y - 8}px`
      root.append(tok)
      setTimeout(() => tok.remove(), 260)
    }
    await wait(200)
    await tween(260, (k) => fingers(0, ease(k) * 240))
    hand.remove()
    tapping = false
    if (performance.now() - pouredForYou < 15000) {
      pouredForYou = 0
      if (waiter) say(waiter, 'Mm-hm.', 1600)
      line('Two fingers on the table says thank you for the tea. No need to stop talking.', 'tap')
      onTapped?.()
    }
  })

  // ---------- the tally card ----------
  let stamps = 0
  const stampCard = async () => {
    const n = stamps++
    const col = n % 3
    const row = Math.floor(n / 3) % 4
    const x = 22 + col * 28 + ((n * 7) % 5) - 2
    const y = 24 + row * 22 + ((n * 11) % 5) - 2
    const tool = el('div', 'ds-stamper', STAMPER)
    const pt = cardPoint(x, y)
    tool.style.left = `${pt[0] - 20}px`
    tool.style.top = `${pt[1] - 48}px`
    root.append(tool)
    await tween(260, (k) => (tool.style.transform = `translateY(${-(1 - easeOut(k)) * 70}px)`))
    snd.thunk()
    const m = el('i', 'ds-mark', MARK)
    m.style.left = `${x - 9}px`
    m.style.top = `${y - 9}px`
    m.style.transform = `rotate(${((n * 37) % 30) - 15}deg)`
    marks.append(m)
    await wait(120)
    await tween(260, (k) => {
      tool.style.transform = `translateY(${-easeOut(k) * 70}px)`
      tool.style.opacity = String(1 - k)
    })
    tool.remove()
  }
  /** a point on the card (its own 100 × 120 box) on the stage */
  const cardPoint = (u: number, v: number): Pt => {
    const s = u / CARD_W
    const t = v / CARD_H
    const top: Pt = [lerp(CARD[0][0], CARD[1][0], s), lerp(CARD[0][1], CARD[1][1], s)]
    const bot: Pt = [lerp(CARD[3][0], CARD[2][0], s), lerp(CARD[3][1], CARD[2][1], s)]
    return [lerp(top[0], bot[0], t), lerp(top[1], bot[1], t)]
  }

  // ---------- the carts ----------
  let visitN = 0
  const takenThisVisit = new Set<DishId>()
  let cartLady: HTMLElement | null = null
  let leaveNow: (() => void) | null = null
  const cartVisit = async (menu: DishId[]) => {
    const n = visitN++
    const look = randomLook(0.35)
    const cart = el('div', 'ds-cart', `<img src="${SPRITES}dimsum-cart.png" alt="" draggable="false">`)
    root.append(cart)
    const lady = person(look, 'ds-lady')
    cartLady = lady
    const placeCart = (x: number, y: number, s: number, flip: boolean, bob = 0) => {
      cart.style.transform = `translate(${(x - CART_W * 0.47 * s).toFixed(1)}px, ${(y - CART_H * 0.985 * s + bob).toFixed(1)}px) scale(${s.toFixed(4)})${flip ? ' scaleX(-1)' : ''}`
      cart.style.transformOrigin = flip ? `${CART_W * 0.5}px 0` : '0 0'
      placePerson(lady, x + (flip ? -186 : 186) * s, y + (flip ? 6 : -4) * s - Math.abs(bob) * 0.6, s)
      lady.style.zIndex = flip ? '16' : '12'
    }
    // down the aisle from the kitchen
    snd.rumble(true)
    lady.style.opacity = cart.style.opacity = '0'
    await tween(3300, (k) => {
      const e = easeOut(k)
      placeCart(lerp(FAR.x, NEAR.x, e), lerp(FAR.y, NEAR.y, e), lerp(FAR.s, NEAR.s, e), false, calm ? 0 : Math.sin(k * 40) * 1.2 * (1 - e))
      cart.style.opacity = lady.style.opacity = String(Math.min(1, k * 4))
    })
    snd.rumble(false)
    placeCart(NEAR.x, NEAR.y, NEAR.s, false)
    if (closed || checking) return void cart.remove(), lady.remove()
    // she calls out what she has, and lifts the lids
    say(lady, menu.map((id) => DISHES[id].call).join(' '), 3200)
    puff(NEAR.x - 70, 188, 4, 50)
    snd.lid()
    const spots = offerSpots(menu.length)
    const offers = menu.map((id, i) => {
      const def = DISHES[id]
      const o = el('button', 'ds-offer', `<img src="${SPRITES}dish-${id}.png" alt="" draggable="false"><span class="ds-tag"><b>${def.name}</b><em><img src="/art/icons/e/coin.png" alt="">${PRICE}</em></span>`)
      o.type = 'button'
      o.setAttribute('aria-label', `${def.name}, ${PRICE} coins`)
      o.style.left = `${spots[i][0]}px`
      o.style.top = `${spots[i][1]}px`
      o.style.width = `${def.w * 0.86}px`
      o.style.animationDelay = `${0.15 + i * 0.14}s`
      root.append(o)
      return { id, o }
    })
    if (n === 0) hint('pick', 'Pick a dish', [spots[0][0], spots[0][1] - 96])
    let idle = 0
    let left = offers.length
    let gone = false
    leaveNow = () => (gone = true)
    for (const { id, o } of offers) {
      o.onpointerenter = () => (idle = 0)
      o.onclick = async () => {
        if (o.disabled || gone) return
        idle = 0
        unhint('pick')
        const slot = freeSlot()
        if (slot === null) return say(lady, 'Table’s full!', 1800)
        if (!g.spend(PRICE, 'dim-sum')) {
          say(lady, 'Next time!', 1800)
          gone = true
          return
        }
        coinsEl.textContent = String(save.coins)
        g.sfx.coin()
        o.disabled = true
        left--
        takenThisVisit.add(id)
        say(lady, TAKEN[(stamps + n) % TAKEN.length], 1600)
        const r = o.getBoundingClientRect()
        const box = stage.root.getBoundingClientRect()
        const sc = stage.scale
        const from: Pt = [(r.left - box.left) / sc + r.width / sc / 2, (r.top - box.top) / sc + (r.height / sc) * DISHES[id].foot]
        o.remove()
        void serve(id, slot, from, (r.width / sc) / DISHES[id].w)
        await stampCard()
        if (stamps === 1) line('Every dish gets a stamp on your card. The card is your bill.', 'card')
      }
    }
    while (!gone && left > 0 && idle < 11 && !closed && !checking) {
      await wait(250)
      if (!offers.some(({ o }) => o.matches(':hover'))) idle += 0.25
    }
    leaveNow = null
    unhint('pick')
    if (closed) return
    if (left > 0 && !checking) say(lady, left === offers.length ? 'Okay! Later.' : 'Enjoy!', 1500)
    for (const { o } of offers) if (!o.disabled) o.classList.add('gone')
    puff(NEAR.x - 40, 228, 3, 80)
    await wait(checking ? 100 : 700)
    for (const { o } of offers) o.remove()
    // she turns the cart round and heads back up the aisle
    lady.classList.add('away')
    snd.rumble(true)
    await tween(checking ? 600 : 2800, (k) => {
      const e = ease(k)
      placeCart(lerp(NEAR.x, FAR.x, e), lerp(NEAR.y, FAR.y, e), lerp(NEAR.s, FAR.s, e), true, calm ? 0 : Math.sin(k * 40) * 1.2 * e)
      cart.style.opacity = lady.style.opacity = String(Math.min(1, (1 - k) * 4))
    })
    snd.rumble(false)
    cart.remove()
    lady.remove()
    if (cartLady === lady) cartLady = null
  }
  const offerSpots = (n: number): Pt[] => {
    const xs = n === 1 ? [455] : n === 2 ? [400, 512] : n === 3 ? [348, 455, 562] : [330, 418, 506, 594]
    return xs.map((x, i) => [x, 288 + (n === 3 && i === 1 ? -8 : 0)])
  }
  /** a dish lands on the lazy Susan */
  const serve = async (id: DishId, slot: number, from: Pt, s0: number) => {
    const pp = await prepDish(id)
    if (closed) return
    const { e, layers, rest, ax, ay } = dishEl(id, pp)
    root.append(e)
    const d: Dish = { el: e, slot, r: DISH_R, ax, ay, x: 0, y: 0, s: 1, id, left: layers.length || 3, layers, rest, prepped: pp, held: true }
    e.style.transformOrigin = `${ax}px ${ay}px`
    dishes.push(d)
    place(d, from[0], from[1], s0, 0, 950)
    snd.whoosh()
    await tween(560, (k) => {
      const [tx, ty] = slotPos(slot, DISH_R)
      const q = ease(k)
      place(d, lerp(from[0], tx, q), lerp(from[1], ty, q) - Math.sin(Math.PI * q) * 70, lerp(s0, depth(ty), q), 0, 950)
    })
    d.held = false
    seat(d)
    snd.clack(1)
    e.classList.add('landed')
    e.addEventListener('pointerdown', (ev) => startDrag(ev, () => void eat(d)))
    if (dishes.length === 1) hint('eat', 'Click to eat', [d.x, d.y - d.s * 100])
    if (dishes.length >= 2) hint('spin', 'Drag to spin', [GLASS.x + 40, GLASS.y - 30])
  }

  // ---------- eating ----------
  let eating = false
  const triedNow = new Set<DishId>()
  const eat = async (d: Dish) => {
    if (eating || d.held || d.left <= 0 || checking) return
    eating = true
    unhint('eat')
    const def = DISHES[d.id]
    const i = (d.layers.length || 3) - d.left
    const piece = d.layers[i]
    // where the piece is on the stage
    const pp = d.prepped
    const W = pp?.W ?? 420
    const H = pp?.H ?? 420
    const part = pp?.pieces[i]
    const w = def.w
    const h = (w * H) / W
    const px = part ? ((part.x + part.w / 2) / W) * w : w / 2
    const py = part ? ((part.y + part.h / 2) / H) * h : h * 0.45
    const at: Pt = [d.x + (px - d.ax) * d.s, d.y + (py - d.ay) * d.s]
    const sticks = el('div', 'ds-sticks', STICKS)
    root.append(sticks)
    const setSticks = (x: number, y: number, open: number) => {
      sticks.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(-36deg)`
      sticks.style.setProperty('--open', `${open.toFixed(2)}deg`)
    }
    setSticks(at[0] + 170, at[1] + 230, 5)
    await tween(240, (k) => {
      const e = easeOut(k)
      setSticks(lerp(at[0] + 170, at[0], e), lerp(at[1] + 230, at[1], e), 5)
    })
    snd.tick()
    await tween(110, (k) => setSticks(at[0], at[1], 5 * (1 - k)))
    // the piece comes up with the chopsticks, toward you
    let fly: HTMLElement | null = null
    if (piece && part) {
      const c = copyCanvas(part.c)
      fly = el('div', 'ds-bite')
      fly.append(c)
      const fw = (part.w / W) * w * d.s
      const fh = (part.h / H) * h * d.s
      fly.style.cssText = `left:${(at[0] - fw / 2).toFixed(1)}px;top:${(at[1] - fh / 2).toFixed(1)}px;width:${fw.toFixed(1)}px;height:${fh.toFixed(1)}px`
      root.append(fly)
      piece.style.visibility = 'hidden'
    } else {
      d.el.style.opacity = String(0.35 + (0.65 * (d.left - 1)) / 3)
    }
    const end: Pt = [at[0] + 40, 640]
    await tween(460, (k) => {
      const e = ease(k)
      const x = lerp(at[0], end[0], e)
      const y = lerp(at[1], end[1], e) - Math.sin(Math.PI * e) * 60
      setSticks(x, y, 0)
      if (fly) {
        fly.style.transform = `translate(${(x - at[0]).toFixed(1)}px, ${(y - at[1]).toFixed(1)}px) scale(${(1 + e * 1.1).toFixed(3)})`
        fly.style.opacity = String(k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3)
      }
    })
    fly?.remove()
    sticks.remove()
    snd.nom()
    d.left--
    // first bites: the stamps, and what you just ate
    g.stamp('yum-cha')
    if (!(save.stats[`dimsum:${d.id}`] > 0)) bump(`dimsum:${d.id}`)
    if (ALL.every((id) => save.stats[`dimsum:${id}`] > 0)) g.stamp('dim-sum-all')
    if (d.id === 'chicken-feet') g.stamp('phoenix-claws')
    if (!triedNow.has(d.id)) {
      triedNow.add(d.id)
      line(def.line, d.id)
    }
    eating = false
    if (d.left <= 0) {
      if (d.rest) d.rest.style.visibility = 'hidden'
      await wait(350)
      void stackUp(d)
    }
  }

  // ---------- the stack of empties ----------
  let stackH = 0
  let stacked = 0
  const stackUp = async (d: Dish) => {
    d.held = true
    const def = DISHES[d.id]
    const s1 = 0.62
    const jitter = ((stacked * 13) % 9) - 4
    const tx = STACK[0] + jitter
    const ty = STACK[1] - stackH
    stackH += def.steamer ? 23 : 9
    stacked++
    const [x0, y0, s0] = [d.x, d.y, d.s]
    snd.whoosh()
    await tween(520, (k) => {
      const e = ease(k)
      place(d, lerp(x0, tx, e), lerp(y0, ty, e) - Math.sin(Math.PI * e) * 50, lerp(s0, s1, e), 0, 950)
    })
    place(d, tx, ty, s1, 0, 560 + stacked)
    snd.clack(0.6)
    const at = dishes.indexOf(d)
    if (at >= 0) dishes.splice(at, 1)
    d.el.classList.add('stacked')
    d.el.style.pointerEvents = 'none'
    if (stacked === 1) line('Empties stack up on the table. A tall stack is a good sign.', 'stack')
  }

  // ---------- the visit ----------
  const run = async () => {
    await wait(800)
    // the waiter pours your first cup
    const w = await waiterIn()
    await wait(300)
    say(w, 'Tea!', 2200)
    while (!potReady && !closed) await wait(150)
    await pour('waiter')
    tapWaiting = true
    hint('tap', 'Tap two fingers', [690, 430])
    await Promise.race([new Promise<void>((r) => (onTapped = r)), wait(7500)])
    onTapped = null
    tapWaiting = false
    unhint('tap')
    await wait(900)
    if (waiter === w) await waiterOut()
    line('In Cantonese, going for dim sum is yum cha: “drink tea.”', 'yumcha')
    await wait(1200)
    // the carts come round
    for (let n = 0; !closed && !checking; n++) {
      const menu = n < CARTS.length ? CARTS[n] : nextMenu()
      await cartVisit(menu)
      if (n === 1) hint('pour', 'Pour more tea', [pot.x + 30, pot.y - 120 * pot.s])
      await wait(2600 + Math.random() * 2400)
    }
  }
  const nextMenu = (): DishId[] => {
    const fresh = shuffle(ALL.filter((id) => !takenThisVisit.has(id)))
    const pickFrom = fresh.length ? fresh : shuffle(ALL)
    return pickFrom.slice(0, 3)
  }
  void run()

  // ---------- Check, Please ----------
  const checkout = async () => {
    if (checking) return finish()
    checking = true
    checkBtn.disabled = true
    leaveNow?.()
    for (const k of [...hints.keys()]) unhint(k)
    snd.clink(1)
    card.classList.add('solid')
    cloth.hidden = false
    const bill = rectQuad(500, 252, 170, 204, -3)
    await tween(720, (k) => (card.style.transform = quad(CARD_W, CARD_H, lerpQuad(CARD, bill, ease(k)))))
    lines.length = 0
    said.delete('bill')
    line(stamps ? `${stamps} ${stamps === 1 ? 'dish' : 'dishes'}. The card goes to the cashier.` : 'Yum cha, exactly as named: just tea.', 'bill')
    g.sfx.register()
    await wait(1900)
    const away = rectQuad(1080, -90, 90, 108, 18)
    await tween(620, (k) => {
      card.style.transform = quad(CARD_W, CARD_H, lerpQuad(bill, away, ease(k)))
      card.style.opacity = String(1 - k * 0.6)
    })
    await wait(250)
    finish()
  }
  checkBtn.onclick = () => void checkout()
  const keys = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    void checkout()
  }
  window.addEventListener('keydown', keys, true)

  const finish = () => {
    if (closed) return
    closed = true
    cancelAnimationFrame(raf)
    for (const t of timers) clearTimeout(t)
    timers.clear()
    tweens.clear()
    snd.stop()
    window.removeEventListener('keydown', keys, true)
    window.removeEventListener('pointermove', onDrag)
    window.removeEventListener('pointerup', endDrag)
    root.classList.add('out')
    setTimeout(() => {
      root.remove()
      release()
    }, 600)
  }
}

/** the card's corners pushed out a little (the tablecloth patch under the card when it's picked up) */
function rectQuadAround(q: [Pt, Pt, Pt, Pt], by: number): [Pt, Pt, Pt, Pt] {
  const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4
  const cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4
  return q.map(([x, y]) => {
    const dx = x - cx
    const dy = y - cy
    const l = Math.hypot(dx, dy)
    return [x + (dx / l) * by, y + (dy / l) * by + 1.5]
  }) as [Pt, Pt, Pt, Pt]
}

// ---------- sound ----------
function sounds() {
  let bed: { stop: () => void } | null = null
  let clinkTimer = 0
  let rumbleNode: { g: GainNode; src: AudioBufferSourceNode } | null = null
  let pourNode: { g: GainNode; src: AudioBufferSourceNode } | null = null
  let creakAt = 0
  const noiseBuf = (ctx: AudioContext, secs: number, brown = false) => {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * secs), ctx.sampleRate)
    const d = b.getChannelData(0)
    let last = 0
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1
      d[i] = brown ? (last = (last + 0.02 * w) / 1.02) * 3.4 : w
    }
    return b
  }
  const tone = (freq: number, dur: number, vol: number, type: OscillatorType = 'sine', slide?: number, delay = 0) => {
    const ctx = audioCtx()
    if (!ctx) return
    const t = ctx.currentTime + delay
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(ctx.destination)
    o.start(t)
    o.stop(t + dur + 0.05)
  }
  const burst = (dur: number, vol: number, freq: number, q = 1, delay = 0) => {
    const ctx = audioCtx()
    if (!ctx) return
    const t = ctx.currentTime + delay
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf(ctx, dur)
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(vol, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(ctx.destination)
    src.start(t)
  }
  const fadeOut = (n: { g: GainNode; src: AudioBufferSourceNode }, secs: number) => {
    const t = n.g.context.currentTime
    n.g.gain.cancelScheduledValues(t)
    n.g.gain.setValueAtTime(n.g.gain.value, t)
    n.g.gain.linearRampToValueAtTime(0, t + secs)
    setTimeout(() => n.src.stop(), secs * 1000 + 100)
  }
  const loop = (ctx: AudioContext, buf: AudioBuffer, type: BiquadFilterType, freq: number, q = 0.7) => {
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const f = ctx.createBiquadFilter()
    f.type = type
    f.frequency.value = freq
    f.Q.value = q
    const g = ctx.createGain()
    g.gain.value = 0
    src.connect(f).connect(g).connect(ctx.destination)
    src.start()
    return { src, g }
  }
  return {
    start() {
      const ctx = audioCtx()
      if (!ctx || bed) return
      // a big room full of people talking: a low murmur that swells and falls
      const m = loop(ctx, noiseBuf(ctx, 4, true), 'bandpass', 420, 0.6)
      m.g.gain.linearRampToValueAtTime(0.32, ctx.currentTime + 1.6)
      const lfo = ctx.createOscillator()
      const lg = ctx.createGain()
      lfo.frequency.value = 0.13
      lg.gain.value = 0.08
      lfo.connect(lg).connect(m.g.gain)
      lfo.start()
      // porcelain somewhere across the hall
      const clink = () => {
        if (!audioCtx()) return
        const f = 2300 + Math.random() * 1400
        tone(f, 0.12, 0.018 + Math.random() * 0.015)
        if (Math.random() < 0.4) tone(f * 1.12, 0.1, 0.012, 'sine', undefined, 0.09)
        clinkTimer = window.setTimeout(clink, 900 + Math.random() * 2600)
      }
      clinkTimer = window.setTimeout(clink, 1200)
      bed = {
        stop: () => {
          const t = ctx.currentTime
          m.g.gain.cancelScheduledValues(t)
          m.g.gain.setValueAtTime(m.g.gain.value, t)
          m.g.gain.linearRampToValueAtTime(0, t + 0.5)
          setTimeout(() => (m.src.stop(), lfo.stop()), 600)
        },
      }
    },
    stop() {
      clearTimeout(clinkTimer)
      bed?.stop()
      bed = null
      this.rumble(false)
      this.pour(false)
    },
    rumble(on: boolean) {
      const ctx = audioCtx()
      if (on && ctx && !rumbleNode) {
        // the cart's wheels on the carpet
        rumbleNode = loop(ctx, noiseBuf(ctx, 2, true), 'lowpass', 180)
        rumbleNode.g.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.4)
      } else if (!on && rumbleNode) {
        fadeOut(rumbleNode, 0.4)
        rumbleNode = null
      }
    },
    pour(on: boolean) {
      const ctx = audioCtx()
      if (on && ctx && !pourNode) {
        pourNode = loop(ctx, noiseBuf(ctx, 2), 'bandpass', 2100, 1.4)
        pourNode.g.gain.linearRampToValueAtTime(0.16, ctx.currentTime + 0.15)
      } else if (!on && pourNode) {
        fadeOut(pourNode, 0.2)
        pourNode = null
      }
    },
    /** porcelain on glass */
    clack: (v = 1) => (tone(1650, 0.09, 0.07 * v, 'triangle'), burst(0.05, 0.12 * v, 3200, 2)),
    clink: (v = 1) => tone(2600 * v, 0.14, 0.05),
    thunk: () => (tone(140, 0.12, 0.25, 'sine', 70), burst(0.05, 0.2, 900, 1)),
    tick: () => (burst(0.03, 0.18, 2600, 4), burst(0.03, 0.14, 2900, 4, 0.05)),
    knock: () => burst(0.06, 0.4, 420, 2.5),
    nom: () => (tone(300, 0.1, 0.12, 'sine', 180), tone(260, 0.1, 0.1, 'sine', 150, 0.14)),
    sip: () => burst(0.35, 0.05, 1600, 0.8),
    drip: () => tone(1400, 0.08, 0.06, 'sine', 700),
    lid: () => (burst(0.6, 0.05, 900, 0.5), tone(1900, 0.12, 0.035)),
    whoosh: () => burst(0.28, 0.04, 700, 0.6),
    creak(amount: number) {
      const now = performance.now()
      if (amount < 0.002 || now - creakAt < 110) return
      creakAt = now
      burst(0.05, Math.min(0.05, amount * 2), 1200, 6)
    },
  }
}
