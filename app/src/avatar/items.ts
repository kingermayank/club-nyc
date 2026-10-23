import { OUTLINE as O, shade, tint, type Slot } from './look'

/** Everything a drawing function needs to know about the avatar being drawn. */
export interface Ctx {
  /** 1 = facing right, -1 = facing left (front view only shifts the face). */
  d: 1 | -1
  /** horizontal face offset for the 3/4 feel */
  fx: number
  back: boolean
  /** unique id prefix for gradients/clips */
  u: string
  skin: string
  hair: string
  /** the wearer's signature colour (Look.color) */
  sig: string
}

// ---------- tiny SVG helpers ----------
const SW = 3
/**
 * Colour-matched outline: each region is outlined in a deep shade of its own fill, pulled toward the ink navy,
 * instead of one navy line on everything. Small parts stop turning into dark clutter at in-world size.
 */
const inkCache = new Map<string, string>()
export function ink(fill: string): string {
  if (!/^#[0-9a-f]{6}$/i.test(fill)) return O
  let v = inkCache.get(fill)
  if (!v) {
    const n = parseInt(fill.slice(1), 16)
    const o = parseInt(O.slice(1), 16)
    const ch = (sh: number) => Math.round(((n >> sh) & 255) * 0.36 * 0.5 + ((o >> sh) & 255) * 0.5)
    v = '#' + ((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')
    inkCache.set(fill, v)
  }
  return v
}
export const P = (d: string, fill: string, extra = '') =>
  `<path d="${d}" fill="${fill}" stroke="${ink(fill)}"${extra.includes('stroke-width') ? '' : ` stroke-width="${SW}"`} stroke-linejoin="round" stroke-linecap="round" ${extra}/>`
export const Pn = (d: string, fill: string, extra = '') => `<path d="${d}" fill="${fill}" ${extra}/>`
export const C = (cx: number, cy: number, r: number, fill: string, sw = SW) =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${ink(fill)}" stroke-width="${sw}"/>`
export const E = (cx: number, cy: number, rx: number, ry: number, fill: string, sw = SW, extra = '') =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${ink(fill)}" stroke-width="${sw}" ${extra}/>`
export const R = (x: number, y: number, w: number, h: number, rx: number, fill: string, sw = SW) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${ink(fill)}" stroke-width="${sw}"/>`
export const L = (x1: number, y1: number, x2: number, y2: number, color = O, w = 2.4) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`
export const T = (x: number, y: number, s: number, text: string, fill = O, extra = '') =>
  `<text x="${x}" y="${y}" font-size="${s}" text-anchor="middle" font-family="'Burbank Display', 'Lilita One', sans-serif" fill="${fill}" ${extra}>${text}</text>`
/** outlined capsule (limbs, straps) */
export const cap = (x1: number, y1: number, x2: number, y2: number, w: number, fill: string) =>
  L(x1, y1, x2, y2, ink(fill), w + SW * 2) + L(x1, y1, x2, y2, fill, w)
/** merged blob of circles with a single outline (curly hair, clouds, chef hats) */
export const blob = (circles: [number, number, number][], fill: string) =>
  circles.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + SW}" fill="${ink(fill)}"/>`).join('') +
  circles.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`).join('')
const heart = (x: number, y: number, s: number, fill: string, sw = 1.6) =>
  `<path transform="translate(${x} ${y}) scale(${s})" d="M0 3 C -6 -2 -4 -7 0 -4 C 4 -7 6 -2 0 3Z" fill="${fill}" stroke="${O}" stroke-width="${sw / s}" stroke-linejoin="round"/>`

// ---------- item model ----------
export interface TopStyle {
  color: string
  sleeves: 'short' | 'long' | 'none'
  sleeveColor?: string
  length?: 'normal' | 'long' | 'dress'
  /** details on the front of the torso (front view only) */
  front?: (c: Ctx) => string
  /** drawn behind the head (hoods, high collars) */
  collar?: (c: Ctx) => string
  /** takes the wearer's signature colour instead of `color` (front/collar get it via ctx.sig) */
  signature?: boolean
}
export interface BottomStyle {
  color: string
  kind: 'pants' | 'shorts' | 'skirt'
  detail?: (side: -1 | 1) => string
  skirt?: string
}
export interface ItemDef {
  id: string
  name: string
  slot: Slot
  price: number
  shop?: string
  /** unlocked by playing something instead of buying */
  reward?: string
  /** also sold in these shops */
  alsoAt?: string[]
  top?: TopStyle
  bottom?: BottomStyle
  /** feet: one shoe at a given foot center */
  shoe?: (x: number, side: -1 | 1) => string
  /** head / face / neck / hand drawing */
  draw?: (c: Ctx) => string
  /** hats drawn behind the head (e.g. the back of a brim) */
  drawBack?: (c: Ctx) => string
  /** hats that flatten tall hair (bun, curly) */
  flattensHair?: boolean
}

// ---------- tops ----------
const vneck = (inner: string) => P('M -7 -73 L 0 -62 L 7 -73 Z', inner)
const lapels = (col: string) =>
  P('M -9 -73 L -3 -56 L -11 -50 L -16 -66 Z', shade(col, 0.12)) + P('M 9 -73 L 3 -56 L 11 -50 L 16 -66 Z', shade(col, 0.12))
const buttons = (x: number, ys: number[], col = '#f4d35e') => ys.map((y) => `<circle cx="${x}" cy="${y}" r="1.7" fill="${col}" stroke="${O}" stroke-width="1"/>`).join('')
const hood = (col: string) => () => P('M -17 -70 C -20 -82 -10 -86 0 -86 C 10 -86 20 -82 17 -70 Z', shade(col, 0.1))

const tee = (id: string, name: string, color: string, price: number, shop?: string, front?: (c: Ctx) => string): ItemDef => ({
  id, name, slot: 'body', price, shop, top: { color, sleeves: 'short', front },
})

const TOPS: ItemDef[] = [
  tee('tee-red', 'Red Tee', '#e8483f', 0),
  tee('tee-blue', 'Blue Tee', '#3f7fe8', 0),
  tee('tee-green', 'Green Tee', '#3fbf6b', 0),
  tee('tee-yellow', 'Yellow Tee', '#f5c542', 0),
  tee('iloveny-tee', 'I ♥ NY Tee', '#ffffff', 15, 'iloveny', (c) =>
    c.back ? '' : T(-4, -56, 9, 'I', O, 'font-weight="900"') + heart(5, -59, 1.05, '#e8323a') + T(0, -45, 10, 'NY', O, 'font-weight="900"')),
  tee('tiedye-tee', 'Tie-Dye Tee', '#ff7ac8', 20, 'thread', (c) =>
    `<g opacity=".85">${blobDots(c.u, ['#ffd23f', '#3fd0ff', '#8cff6a', '#b06bff'])}</g>`),
  {
    id: 'breton', name: 'Breton Stripes', slot: 'body', price: 22, shop: 'thread',
    top: { color: '#f7f4ec', sleeves: 'long', front: () => [-66, -59, -52, -45, -38].map((y) => Pn(`M -19 ${y} L 19 ${y} L 19 ${y + 3} L -19 ${y + 3} Z`, '#24366b')).join('') },
  },
  {
    // everyone's first top: a free hoodie in your signature colour, so your colour is the biggest thing about you
    id: 'sig-hoodie', name: 'Signature Hoodie', slot: 'body', price: 0,
    top: {
      color: '#3d72d9', sleeves: 'long', signature: true,
      collar: (c) => P('M -17 -70 C -20 -82 -10 -86 0 -86 C 10 -86 20 -82 17 -70 Z', shade(c.sig, 0.12)),
      front: (c) => (c.back ? '' : P('M -11 -46 L 11 -46 L 10 -37 L -10 -37 Z', shade(c.sig, 0.1), 'stroke-width="2.2"') + L(-3.5, -72, -4, -62, '#fff', 2) + L(3.5, -72, 4, -62, '#fff', 2)),
    },
  },
  {
    id: 'sig-tee', name: 'Color Tee', slot: 'body', price: 14, shop: 'thread',
    top: { color: '#3d72d9', sleeves: 'short', signature: true, front: (c) => (c.back ? '' : `<path d="M ${-4 + c.fx * 0.4} -58 l 2.4 -5 l 2.4 5 l 5.4 0.6 l -4 3.6 l 1.2 5.3 l -5 -2.8 l -5 2.8 l 1.2 -5.3 l -4 -3.6 z" fill="#fff" stroke="${ink(c.sig)}" stroke-width="1.4" stroke-linejoin="round"/>`) },
  },
  {
    id: 'sig-puffer', name: 'Color Puffer', slot: 'body', price: 42, shop: 'thread',
    top: { color: '#3d72d9', sleeves: 'long', signature: true, collar: (c) => P('M -12 -70 C -12 -80 12 -80 12 -70 Z', shade(c.sig, 0.12)), front: (c) => [-62, -53, -44].map((y) => `<path d="M -18 ${y} Q 0 ${y + 3} 18 ${y}" fill="none" stroke="${ink(c.sig)}" stroke-width="1.8"/>`).join('') + L(0, -73, 0, -36, tint(c.sig, 0.5), 1.6) },
  },
  {
    id: 'nyc-hoodie', name: 'NYC Hoodie', slot: 'body', price: 28, shop: 'iloveny',
    top: { color: '#8f96a3', sleeves: 'long', collar: hood('#8f96a3'), front: (c) => (c.back ? '' : T(0, -50, 11, 'NYC', '#fff', `stroke="${O}" stroke-width="1" font-weight="900"`) + P('M -9 -44 L 9 -44 L 8 -37 L -8 -37 Z', shade('#8f96a3', 0.08)) + L(-3, -72, -3, -64) + L(3, -72, 3, -64)) },
  },
  {
    id: 'taxi-hoodie', name: 'Taxi Hoodie', slot: 'body', price: 30, shop: 'iloveny',
    top: { color: '#ffcf1f', sleeves: 'long', collar: hood('#ffcf1f'), front: (c) => (c.back ? '' : [-14, -6, 2, 10].map((x) => `<rect x="${x}" y="-56" width="4" height="4" fill="${O}"/><rect x="${x + 4}" y="-52" width="4" height="4" fill="${O}"/>`).join('') + L(-3, -72, -3, -64) + L(3, -72, 3, -64)) },
  },
  {
    id: 'puffer', name: 'Puffer Jacket', slot: 'body', price: 45, shop: 'thread',
    top: { color: '#2f3a5f', sleeves: 'long', collar: () => P('M -12 -70 C -12 -80 12 -80 12 -70 Z', '#2f3a5f'), front: () => [-62, -53, -44].map((y) => `<path d="M -18 ${y} Q 0 ${y + 3} 18 ${y}" fill="none" stroke="${O}" stroke-width="1.8"/>`).join('') + L(0, -73, 0, -36, '#c9cfe0', 1.6) },
  },
  {
    id: 'denim-jacket', name: 'Denim Jacket', slot: 'body', price: 40, shop: 'thread',
    top: { color: '#4f7cc4', sleeves: 'long', front: () => vneck('#fff') + lapels('#4f7cc4') + R(-15, -56, 8, 6, 1.5, shade('#4f7cc4', 0.1), 1.6) + R(7, -56, 8, 6, 1.5, shade('#4f7cc4', 0.1), 1.6) + buttons(0, [-52, -45, -38], '#d9dde8') },
  },
  {
    id: 'leather-jacket', name: 'Leather Jacket', slot: 'body', price: 60, shop: 'thread',
    top: { color: '#24262d', sleeves: 'long', front: () => vneck('#e8e8e8') + lapels('#24262d') + L(4, -60, -6, -36, '#c9ccd6', 1.6) },
  },
  {
    id: 'varsity', name: 'Varsity Jacket', slot: 'body', price: 48, shop: 'thread',
    top: { color: '#1f6b46', sleeves: 'long', sleeveColor: '#f3efe3', front: (c) => (c.back ? '' : T(-9, -48, 13, 'N', '#f3efe3', `stroke="${O}" stroke-width="1.2" font-weight="900"`)) + buttons(3, [-62, -54, -46, -38], '#f3efe3') },
  },
  {
    id: 'pinstripe', name: 'Bronx 27 Jersey', slot: 'body', price: 35, shop: 'iloveny',
    top: { color: '#f8f8fb', sleeves: 'short', front: (c) => [-14, -9, -4, 1, 6, 11, 16].map((x) => L(x, -72, x * 0.95, -36, '#2b3a75', 1)).join('') + (c.back ? '' : T(0, -48, 13, '27', '#2b3a75', 'font-weight="900"')) },
  },
  {
    id: 'turtleneck', name: 'Black Turtleneck', slot: 'body', price: 30, shop: 'thread',
    top: { color: '#23232b', sleeves: 'long', collar: () => R(-9, -80, 18, 10, 4, '#2c2c36') },
  },
  {
    id: 'trench', name: 'Trench Coat', slot: 'body', price: 70, shop: 'thread',
    top: { color: '#c8a46a', sleeves: 'long', length: 'long', front: () => vneck('#f2f2f2') + lapels('#c8a46a') + R(-21, -42, 42, 5, 2, shade('#c8a46a', 0.22), 1.6) + buttons(-6, [-56, -32, -26], '#6b4e2a') + buttons(6, [-56, -32, -26], '#6b4e2a') },
  },
  {
    id: 'camel-coat', name: 'Camel Coat', slot: 'body', price: 260, shop: 'maison',
    top: { color: '#b98c5a', sleeves: 'long', length: 'long', front: () => vneck('#1f1f26') + lapels('#b98c5a') + buttons(0, [-50, -40, -30], '#2a1d10') },
  },
  {
    id: 'suit', name: 'Sharp Suit', slot: 'body', price: 120, shop: 'maison',
    top: { color: '#273152', sleeves: 'long', front: () => vneck('#ffffff') + P('M -2 -66 L 2 -66 L 3 -50 L 0 -46 L -3 -50 Z', '#d6303a') + lapels('#273152') + buttons(0, [-42, -37], '#c9cbd6') },
  },
  {
    id: 'floral-dress', name: 'Floral Dress', slot: 'body', price: 45, shop: 'thread',
    top: { color: '#ff8eb4', sleeves: 'short', length: 'dress', front: () => [[-10, -60], [8, -52], [-4, -40], [12, -30], [-14, -26], [2, -24], [10, -64]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6" fill="#fff6a8"/><circle cx="${x}" cy="${y}" r="1.1" fill="#ff5a5f"/>`).join('') },
  },
  {
    id: 'sequin-jacket', name: 'Sequin Showstopper', slot: 'body', price: 55, shop: 'broadway',
    top: { color: '#f2b632', sleeves: 'long', front: () => vneck('#1d1d24') + lapels('#f2b632') + [[-12, -60], [-8, -44], [12, -58], [9, -42], [-15, -50], [15, -48], [0, -40]].map(([x, y]) => `<path d="M${x} ${y - 3} L${x + 1} ${y - 1} L${x + 3} ${y} L${x + 1} ${y + 1} L${x} ${y + 3} L${x - 1} ${y + 1} L${x - 3} ${y} L${x - 1} ${y - 1}Z" fill="#fff"/>`).join('') },
  },
  {
    id: 'chef-coat', name: 'Chef Whites', slot: 'body', price: 0, reward: 'slice-factory',
    top: { color: '#fbfbfd', sleeves: 'long', front: () => P('M -10 -72 L 10 -72 L 12 -66 L -12 -66 Z', '#eef0f6') + buttons(-5, [-60, -52, -44], '#3a3f5a') + buttons(5, [-60, -52, -44], '#3a3f5a') },
  },
  {
    id: 'halal-apron', name: 'Halal Bros Apron', slot: 'body', price: 0, reward: 'halal-rush',
    top: { color: '#e64b3c', sleeves: 'short', front: (c) => P('M -12 -64 L 12 -64 L 14 -36 L -14 -36 Z', '#fffdf5') + L(-12, -64, -8, -73, O, 1.6) + L(12, -64, 8, -73, O, 1.6) + (c.back ? '' : T(0, -48, 6.5, 'HALAL', '#e64b3c', 'font-weight="900"') + T(0, -41, 6.5, 'BROS', '#e64b3c', 'font-weight="900"')) },
  },
  {
    id: 'barista-apron', name: 'Barista Apron', slot: 'body', price: 0, reward: 'bagel-counters',
    top: { color: '#f2ede2', sleeves: 'long', front: () => P('M -12 -64 L 12 -64 L 14 -36 L -14 -36 Z', '#2f7d4f') + L(-12, -64, -8, -73, O, 1.6) + L(12, -64, 8, -73, O, 1.6) + C(0, -50, 4, '#f2ede2', 1.4) },
  },
]

function blobDots(u: string, cols: string[]) {
  return cols.map((col, i) => `<circle cx="${[-10, 8, -4, 10][i]}" cy="${[-62, -56, -46, -42][i]}" r="${[7, 6, 8, 5][i]}" fill="${col}" opacity=".9" data-u="${u}"/>`).join('')
}

// ---------- bottoms ----------
const pocket = (side: -1 | 1) => L(side * 12, -38, side * 10, -30, O, 1.4)
const BOTTOMS: ItemDef[] = [
  { id: 'jeans', name: 'Blue Jeans', slot: 'legs', price: 0, bottom: { color: '#3e64a8', kind: 'pants', detail: pocket } },
  { id: 'black-jeans', name: 'Black Jeans', slot: 'legs', price: 20, shop: 'thread', bottom: { color: '#2b2f3a', kind: 'pants', detail: pocket } },
  { id: 'khakis', name: 'Khakis', slot: 'legs', price: 18, shop: 'thread', bottom: { color: '#c9ab78', kind: 'pants' } },
  { id: 'cargo', name: 'Cargo Pants', slot: 'legs', price: 25, shop: 'thread', bottom: { color: '#7c7a48', kind: 'pants', detail: (s) => R(s === -1 ? -16 : 3, -28, 13, 9, 2, shade('#7c7a48', 0.15), 1.4) } },
  { id: 'sweats', name: 'Sweatpants', slot: 'legs', price: 16, shop: 'iloveny', bottom: { color: '#a1a7b3', kind: 'pants', detail: (s) => R(s === -1 ? -15 : 2, -12, 13, 5, 2, shade('#a1a7b3', 0.15), 1.4) } },
  { id: 'track', name: 'Track Pants', slot: 'legs', price: 22, shop: 'thread', bottom: { color: '#24336a', kind: 'pants', detail: (s) => L(s === -1 ? -14 : 14, -40, s === -1 ? -14 : 14, -8, '#fff', 2) } },
  { id: 'shorts', name: 'Khaki Shorts', slot: 'legs', price: 14, shop: 'thread', bottom: { color: '#d3b47e', kind: 'shorts' } },
  { id: 'denim-shorts', name: 'Denim Shorts', slot: 'legs', price: 16, shop: 'thread', bottom: { color: '#6c95d6', kind: 'shorts' } },
  { id: 'plaid-skirt', name: 'Plaid Skirt', slot: 'legs', price: 25, shop: 'thread', bottom: { color: '#2b2f3a', kind: 'skirt', skirt: '#c8323c' } },
  { id: 'tutu', name: 'Pink Tutu', slot: 'legs', price: 18, shop: 'toys', bottom: { color: '#f2f2f6', kind: 'skirt', skirt: '#ffb3d6' } },
]

// ---------- shoes ----------
const sole = (x: number, col: string) => P(`M ${x - 10} -4 L ${x + 10} -4 L ${x + 10} -1 Q ${x + 10} 1 ${x + 8} 1 L ${x - 8} 1 Q ${x - 10} 1 ${x - 10} -1 Z`, col)
const sneaker = (upper: string, solecol: string, accent?: string) => (x: number, side: -1 | 1) =>
  P(`M ${x - 10} -3 Q ${x - 10} -12 ${x - 2} -12 L ${x + 2} -12 Q ${x + 10} -11 ${x + 11} -4 L ${x + 11} -3 Z`, upper) +
  (accent ? `<path d="M ${x - 5 + side} -9 Q ${x + 1} -5 ${x + 7} -8" fill="none" stroke="${accent}" stroke-width="2.4" stroke-linecap="round"/>` : '') +
  sole(x, solecol)
const SHOES: ItemDef[] = [
  { id: 'sneakers', name: 'White Sneakers', slot: 'feet', price: 0, shoe: sneaker('#f7f7fb', '#d8dbe6', '#9aa3c0') },
  { id: 'hightops', name: 'Red High-Tops', slot: 'feet', price: 35, shop: 'sneakers', shoe: (x) => P(`M ${x - 9} -3 L ${x - 9} -18 Q ${x - 9} -21 ${x - 6} -21 L ${x + 2} -21 Q ${x + 4} -21 ${x + 4} -18 L ${x + 4} -12 Q ${x + 11} -11 ${x + 11} -4 L ${x + 11} -3 Z`, '#e8333a') + C(x - 3, -15, 2.3, '#fff', 1.2) + sole(x, '#f4f4f8') },
  { id: 'runners', name: 'Retro Runners', slot: 'feet', price: 30, shop: 'sneakers', shoe: sneaker('#5aa7ff', '#ff9f43', '#ffffff') },
  { id: 'rainbow-kicks', name: 'Rainbow Kicks', slot: 'feet', price: 55, shop: 'sneakers', shoe: (x, s) => sneaker('#ffffff', '#b06bff')(x, s) + `<path d="M ${x - 6} -9 L ${x + 6} -9" stroke="#ff5a5f" stroke-width="2"/><path d="M ${x - 6} -6.5 L ${x + 7} -6.5" stroke="#3fd0ff" stroke-width="2"/>` },
  { id: 'boots', name: 'Work Boots', slot: 'feet', price: 40, shop: 'sneakers', shoe: (x) => P(`M ${x - 9} -3 L ${x - 9} -17 Q ${x - 9} -20 ${x - 6} -20 L ${x + 3} -20 Q ${x + 5} -20 ${x + 5} -17 L ${x + 5} -12 Q ${x + 11} -11 ${x + 11} -4 L ${x + 11} -3 Z`, '#a8692f') + L(x - 4, -16, x + 1, -16, '#f3d9a4', 1.4) + sole(x, '#5a3a1e') },
  { id: 'loafers', name: 'Penny Loafers', slot: 'feet', price: 150, shop: 'maison', shoe: (x) => P(`M ${x - 10} -2 Q ${x - 10} -9 ${x - 3} -9 L ${x + 3} -9 Q ${x + 10} -9 ${x + 11} -3 L ${x + 11} -2 Z`, '#4a2a1e') + L(x - 3, -7, x + 4, -7, '#e2b04a', 1.6) + sole(x, '#2a1810') },
  { id: 'slides', name: 'Slides & Socks', slot: 'feet', price: 12, shop: 'sneakers', shoe: (x) => R(x - 7, -14, 14, 11, 4, '#ffffff', 2) + P(`M ${x - 10} -6 L ${x + 10} -6 L ${x + 10} -3 L ${x - 10} -3 Z`, '#2b2f3a') + sole(x, '#2b2f3a') },
  { id: 'skates', name: 'Ice Skates', slot: 'feet', price: 15, shop: 'rink', shoe: (x) => P(`M ${x - 9} -6 L ${x - 9} -18 Q ${x - 9} -20 ${x - 6} -20 L ${x + 3} -20 Q ${x + 5} -20 ${x + 5} -17 L ${x + 5} -12 Q ${x + 11} -11 ${x + 11} -6 Z`, '#ffffff') + L(x - 10, -1, x + 11, -1, '#bfc6d6', 2.4) + L(x - 6, -5, x - 6, -1, O, 1.6) + L(x + 6, -5, x + 6, -1, O, 1.6) },
]

// ---------- head ----------
/** hats sit up on the forehead, so the eyes (and a little hair) always show */
const lift = (dy: number, svg: string) => `<g transform="translate(0 ${-dy})">${svg}</g>`
const capDome = (col: string) => P('M -30 -114 C -30 -138 -16 -147 0 -147 C 16 -147 30 -138 30 -114 C 20 -118 -20 -118 -30 -114 Z', col)
const capBrim = (fx: number, col: string) =>
  P(`M ${-27 + fx} -114 Q ${fx} -107 ${27 + fx} -114 Q ${32 + fx} -110 ${23 + fx} -108.5 Q ${fx} -103 ${-23 + fx} -108.5 Q ${-32 + fx} -110 ${-27 + fx} -114 Z`, col)
const HATS: ItemDef[] = [
  {
    id: 'nyc-cap', name: 'NYC Cap', slot: 'head', price: 12, shop: 'iloveny',
    draw: (c) => capDome('#1f2d5c') + (c.back ? '' : capBrim(c.fx, '#18234a') + T(c.fx, -124, 10, 'NYC', '#fff', 'font-weight="900"')) + C(0, -147, 2.6, '#1f2d5c', 1.6),
  },
  {
    id: 'sig-cap', name: 'Color Cap', slot: 'head', price: 14, shop: 'iloveny',
    draw: (c) => capDome(c.sig) + (c.back ? '' : capBrim(c.fx, shade(c.sig, 0.18)) + `<circle cx="${c.fx}" cy="-126" r="4.5" fill="#fff" stroke="${ink(c.sig)}" stroke-width="1.6"/>`) + C(0, -147, 2.6, c.sig, 1.6),
  },
  {
    id: 'sig-beanie', name: 'Color Beanie', slot: 'head', price: 12, shop: 'iloveny', flattensHair: true,
    draw: (c) => lift(5, P('M -32 -102 C -33 -134 -16 -144 0 -144 C 16 -144 33 -134 32 -102 Z', c.sig) + R(-33, -110, 66, 11, 5, shade(c.sig, 0.16)) + blob([[0, -147, 6]], '#ffffff')),
  },
  {
    id: 'nyc-beanie', name: 'Big Apple Beanie', slot: 'head', price: 10, shop: 'iloveny', flattensHair: true,
    draw: () => lift(5, P('M -32 -102 C -33 -134 -16 -144 0 -144 C 16 -144 33 -134 32 -102 Z', '#e8483f') + R(-33, -110, 66, 11, 5, '#c7362f') + blob([[0, -147, 6]], '#ffffff')),
  },
  {
    id: 'foam-crown', name: 'Foam Liberty Crown', slot: 'head', price: 12, shop: 'liberty', alsoAt: ['iloveny'],
    draw: () => {
      const spikes = [-62, -40, -20, 0, 20, 40, 62].map((a) => {
        const r = (a * Math.PI) / 180
        const bx = Math.sin(r) * 27, by = -114 - Math.cos(r) * 6
        const tx = Math.sin(r) * 44, ty = -116 - Math.cos(r) * 34
        const px = Math.cos(r) * 5, py = Math.sin(r) * 5
        return P(`M ${bx - px} ${by + py * 0.3} L ${tx} ${ty} L ${bx + px} ${by - py * 0.3} Z`, '#7fd3a6')
      }).join('')
      return spikes + P('M -30 -118 Q 0 -126 30 -118 L 31 -106 Q 0 -114 -31 -106 Z', '#6cc596') + [-16, -5, 6, 17].map((x) => `<rect x="${x - 2.5}" y="-118" width="5" height="5" rx="1" fill="#bff0d6" stroke="${O}" stroke-width="1"/>`).join('')
    },
  },
  {
    id: 'top-hat', name: 'Broadway Top Hat', slot: 'head', price: 40, shop: 'broadway', flattensHair: true,
    draw: () => E(0, -122, 32, 7, '#1d1d26') + P('M -19 -124 L -18 -160 Q 0 -165 18 -160 L 19 -124 Q 0 -120 -19 -124 Z', '#23232e') + Pn('M -18.5 -134 L 18.5 -134 L 18.7 -128 L -18.7 -128 Z', '#d6303a'),
  },
  {
    id: 'beret', name: 'SoHo Beret', slot: 'head', price: 20, shop: 'thread',
    draw: () => P('M -32 -114 C -34 -134 6 -146 30 -130 C 36 -125 32 -116 22 -115 C 6 -117 -14 -113 -32 -114 Z', '#2b2f3a') + C(6, -141, 2.5, '#2b2f3a', 1.6),
  },
  {
    id: 'bucket-hat', name: 'Bucket Hat', slot: 'head', price: 18, shop: 'thread', flattensHair: true,
    draw: () => lift(5, P('M -38 -108 Q -36 -116 -26 -118 L -22 -136 Q 0 -144 22 -136 L 26 -118 Q 36 -116 38 -108 Q 0 -100 -38 -108 Z', '#f0d58c') + Pn('M -23 -122 Q 0 -126 23 -122 L 24 -118 Q 0 -122 -24 -118 Z', '#c9a24a')),
  },
  {
    id: 'propeller', name: 'Propeller Beanie', slot: 'head', price: 15, shop: 'toys',
    draw: () => P('M -31 -106 C -32 -132 -16 -140 0 -140 C 16 -140 32 -132 31 -106 Q 0 -112 -31 -106 Z', '#ffcf1f') + Pn('M 0 -140 C -8 -136 -12 -120 -12 -108 L 0 -110 Z', '#e8483f') + Pn('M 0 -140 C 8 -136 12 -120 12 -108 L 0 -110 Z', '#3f7fe8') + L(0, -140, 0, -148) + `<g class="av-prop"><ellipse cx="0" cy="-149" rx="16" ry="3.6" fill="#ff5a8a" stroke="${O}" stroke-width="2"/></g>`,
  },
  {
    id: 'cat-ears', name: 'Bodega Cat Ears', slot: 'head', price: 12, shop: 'toys',
    draw: () => `<path d="M -26 -118 Q 0 -138 26 -118" fill="none" stroke="${O}" stroke-width="6" stroke-linecap="round"/><path d="M -26 -118 Q 0 -138 26 -118" fill="none" stroke="#ff9f43" stroke-width="3" stroke-linecap="round"/>` + P('M -24 -122 L -30 -144 L -12 -130 Z', '#ff9f43') + P('M 24 -122 L 30 -144 L 12 -130 Z', '#ff9f43') + Pn('M -23 -127 L -26 -138 L -17 -131 Z', '#ffd0dc') + Pn('M 23 -127 L 26 -138 L 17 -131 Z', '#ffd0dc'),
  },
  {
    id: 'headphones', name: 'Big Headphones', slot: 'head', price: 35, shop: 'sneakers',
    draw: () => `<path d="M -32 -100 C -34 -142 34 -142 32 -100" fill="none" stroke="${O}" stroke-width="9" stroke-linecap="round"/><path d="M -32 -100 C -34 -142 34 -142 32 -100" fill="none" stroke="#e8483f" stroke-width="4" stroke-linecap="round"/>` + R(-38, -108, 11, 20, 5, '#2b2f3a') + R(27, -108, 11, 20, 5, '#2b2f3a'),
  },
  {
    id: 'chef-hat', name: 'Chef Hat', slot: 'head', price: 0, reward: 'slice-factory', flattensHair: true,
    draw: () => blob([[-14, -140, 12], [0, -146, 14], [14, -140, 12], [0, -134, 12]], '#ffffff') + R(-22, -128, 44, 16, 4, '#f4f5fa'),
  },
  {
    id: 'captain-hat', name: 'Ferry Captain Hat', slot: 'head', price: 0, reward: 'ferry-captain', flattensHair: true,
    draw: (c) => lift(4, P('M -33 -124 Q -30 -140 0 -142 Q 30 -140 33 -124 Q 0 -118 -33 -124 Z', '#ffffff') + R(-28, -126, 56, 12, 3, '#1f2d5c') + (c.back ? '' : P(`M ${-26 + c.fx} -114 Q ${c.fx} -106 ${26 + c.fx} -114 Q ${c.fx} -100 ${-26 + c.fx} -114 Z`, '#14193a') + C(c.fx, -121, 4, '#f2c14e', 1.4))),
  },
  {
    id: 'party-hat', name: 'Paper Party Hat', slot: 'head', price: 0, reward: 'stamps-5',
    draw: () => P('M -14 -124 L 0 -162 L 14 -124 Z', '#b06bff') + Pn('M -9 -136 L 9 -136 L 7 -131 L -7 -131 Z', '#ffd23f') + C(0, -163, 4, '#ffd23f', 1.6),
  },
]

// ---------- face ----------
const FACE: ItemDef[] = [
  {
    id: 'shades', name: 'City Shades', slot: 'face', price: 14, shop: 'iloveny',
    draw: (c) => (c.back ? '' : R(-19 + c.fx, -106, 15, 11, 4, '#1f2433', 2.4) + R(4 + c.fx, -106, 15, 11, 4, '#1f2433', 2.4) + L(-4 + c.fx, -102, 4 + c.fx, -102, O, 2.4) + L(-15 + c.fx, -103, -11 + c.fx, -103, '#8fa6d8', 1.6) + L(8 + c.fx, -103, 12 + c.fx, -103, '#8fa6d8', 1.6)),
  },
  {
    // the SoHo street vendor's "designer" pair: sold only at his table, so no shop lists it
    id: 'designer-shades', name: '“Designer” Shades', slot: 'face', price: 5, shop: 'street',
    draw: (c) => (c.back ? '' : R(-20 + c.fx, -107, 16, 12, 5, '#3a2618', 2.4) + R(4 + c.fx, -107, 16, 12, 5, '#3a2618', 2.4) + L(-4 + c.fx, -102, 4 + c.fx, -102, '#e2b04a', 2.4) + C(-17 + c.fx, -104, 1.3, '#e2b04a', 0) + C(17 + c.fx, -104, 1.3, '#e2b04a', 0)),
  },
  {
    id: 'round-glasses', name: 'Round Specs', slot: 'face', price: 15, shop: 'thread',
    draw: (c) => (c.back ? '' : `<circle cx="${-11 + c.fx}" cy="-99" r="8" fill="rgba(255,255,255,.18)" stroke="${O}" stroke-width="2.2"/><circle cx="${11 + c.fx}" cy="-99" r="8" fill="rgba(255,255,255,.18)" stroke="${O}" stroke-width="2.2"/>` + L(-3 + c.fx, -100, 3 + c.fx, -100, O, 2.2)),
  },
  {
    id: 'heart-glasses', name: 'Heart Glasses', slot: 'face', price: 12, shop: 'iloveny',
    draw: (c) => (c.back ? '' : heart(-11 + c.fx, -101, 2, '#ff4f8b', 2.2) + heart(11 + c.fx, -101, 2, '#ff4f8b', 2.2) + L(-3 + c.fx, -101, 3 + c.fx, -101, O, 2.2)),
  },
  {
    id: 'gold-shades', name: 'Gold Shades', slot: 'face', price: 90, shop: 'maison',
    draw: (c) => (c.back ? '' : P(`M ${-22 + c.fx} -106 L ${22 + c.fx} -106 L ${20 + c.fx} -97 Q ${12 + c.fx} -92 ${4 + c.fx} -98 L ${0 + c.fx} -101 L ${-4 + c.fx} -98 Q ${-12 + c.fx} -92 ${-20 + c.fx} -97 Z`, '#2a2016') + L(-21 + c.fx, -106, 21 + c.fx, -106, '#e2b04a', 2.6)),
  },
  {
    id: 'star-glasses', name: 'Star Glasses', slot: 'face', price: 16, shop: 'broadway',
    draw: (c) => (c.back ? '' : [-11, 11].map((x) => `<path transform="translate(${x + c.fx} -100)" d="M0 -10 L3 -3 L10 -3 L4.5 1.5 L6.5 9 L0 4.5 L-6.5 9 L-4.5 1.5 L-10 -3 L-3 -3Z" fill="#ffd23f" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>`).join('')),
  },
]

// ---------- neck ----------
const NECK: ItemDef[] = [
  {
    id: 'scarf', name: 'Knit Scarf', slot: 'neck', price: 15, shop: 'thread',
    draw: () => R(-16, -77, 32, 10, 5, '#e8483f') + P('M 6 -70 L 14 -70 L 13 -50 L 5 -50 Z', '#e8483f') + L(6, -55, 13, -55, '#fff', 1.6) + L(6, -60, 13, -60, '#fff', 1.6),
  },
  { id: 'bowtie', name: 'Bow Tie', slot: 'neck', price: 10, shop: 'broadway', draw: () => P('M 0 -72 L -9 -77 L -9 -67 Z', '#d6303a') + P('M 0 -72 L 9 -77 L 9 -67 Z', '#d6303a') + C(0, -72, 2.6, '#a82029', 1.4) },
  { id: 'gold-chain', name: 'Gold Chain', slot: 'neck', price: 120, shop: 'maison', draw: () => `<path d="M -11 -73 Q 0 -54 11 -73" fill="none" stroke="${O}" stroke-width="5"/><path d="M -11 -73 Q 0 -54 11 -73" fill="none" stroke="#f2c14e" stroke-width="2.6"/>` + C(0, -61, 3.4, '#f2c14e', 1.6) },
  { id: 'pearls', name: 'Pearl Necklace', slot: 'neck', price: 100, shop: 'maison', draw: () => [-10, -7, -3.5, 0, 3.5, 7, 10].map((x) => C(x, -72 + (10 - Math.abs(x)) * 0.7, 2.1, '#fbf8ef', 1)).join('') },
  { id: 'silk-scarf', name: 'Silk Scarf', slot: 'neck', price: 80, shop: 'maison', draw: () => P('M -12 -75 Q 0 -68 12 -75 L 4 -64 L 0 -58 L -4 -64 Z', '#2f7d6b') + C(0, -66, 2.2, '#f2c14e', 1.2) },
  {
    id: 'camera', name: 'Tourist Camera', slot: 'neck', price: 18, shop: 'iloveny',
    draw: (c) => L(-12, -72, -8, -56, O, 1.8) + L(12, -72, 8, -56, O, 1.8) + (c.back ? '' : R(-11, -60, 22, 14, 3, '#2b2f3a') + C(0, -53, 4.6, '#7fb2ff', 2) + R(-8, -63, 6, 3, 1, '#c9ccd6', 1)),
  },
  ...(['downtown:#e5483b:#fff3e8', 'midtown:#f2b632:#1d2140', 'uptown:#3cb371:#f3fff6', 'harbor:#2a7bd5:#eaf4ff'] as const).map((t) => {
    const [team, col, stripe] = t.split(':')
    return {
      id: `team-scarf-${team}`, name: `${team[0].toUpperCase() + team.slice(1)} Team Scarf`, slot: 'neck' as const, price: 0, reward: 'team',
      draw: () => R(-16, -77, 32, 10, 5, col) + P('M 6 -70 L 14 -70 L 13 -48 L 5 -48 Z', col) + L(6, -53, 13, -53, stripe, 2) + L(6, -58, 13, -58, stripe, 2) + L(-10, -72, -10, -72, stripe, 0),
    }
  }),
  { id: 'lanyard', name: 'MetroCard Lanyard', slot: 'neck', price: 6, shop: 'iloveny', draw: (c) => L(-8, -73, 0, -54, '#3f7fe8', 2) + L(8, -73, 0, -54, '#3f7fe8', 2) + (c.back ? '' : R(-6, -55, 12, 8, 1.5, '#ffcf1f', 1.6) + L(-4, -51, 4, -51, '#1f2d5c', 1.4)) },
]

// ---------- in hand (drawn around the right hand at 0,0) ----------
const HAND: ItemDef[] = [
  { id: 'coffee', name: 'Deli Coffee', slot: 'hand', price: 3, shop: 'coffee', draw: () => P('M -6 -4 L 6 -4 L 5 12 L -5 12 Z', '#2d6fd1') + Pn('M -5.6 1 L 5.6 1 L 5.4 4 L -5.4 4 Z', '#fff') + R(-7, -7, 14, 4, 2, '#f4f4f8', 1.6) },
  // Bean There's latte: a white cup, a cardboard sleeve, and a name scribbled on it (never quite yours)
  { id: 'latte', name: 'Oat Latte', slot: 'hand', price: 4, shop: 'coffee', draw: () => P('M -6 -4 L 6 -4 L 5 12 L -5 12 Z', '#ffffff') + Pn('M -5.7 2 L 5.7 2 L 5.4 7 L -5.4 7 Z', '#b9875a') + R(-7, -7, 14, 4, 2, '#3a3f4b', 1.6) + `<path d="M -3.5 -1 q 1.2 -1.6 2.4 0 t 2.4 0 t 2.4 0" fill="none" stroke="${O}" stroke-width="1"/>` },
  { id: 'pizza-slice', name: 'Dollar Slice', slot: 'hand', price: 1, shop: 'pizza', draw: () => P('M -3 2 L 18 -10 Q 20 -2 16 6 Z', '#ffd36b') + P('M 16 6 Q 20 -2 18 -10 L 21 -11 Q 24 -1 19 8 Z', '#d99a45') + C(10, -2, 1.8, '#d6303a', 1) + C(14, 2, 1.6, '#d6303a', 1) },
  { id: 'bagel', name: 'Everything Bagel', slot: 'hand', price: 2, shop: 'coffee', draw: () => E(6, 0, 10, 8, '#d69a52') + E(6, 0, 3, 2.2, '#fffaf0', 1.6) + [[1, -4], [10, -4], [12, 2], [2, 3]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".9" fill="${O}"/>`).join('') },
  { id: 'hotdog', name: 'Hot Dog', slot: 'hand', price: 2, shop: 'street', draw: () => R(-4, -4, 24, 9, 4.5, '#f0c27b') + R(-6, -2, 28, 5, 2.5, '#c8553d', 2) + `<path d="M -3 -0.5 Q 0 -3 3 -0.5 T 9 -0.5 T 15 -0.5 T 20 -0.5" fill="none" stroke="#ffd23f" stroke-width="1.6"/>` },
  { id: 'pretzel', name: 'Soft Pretzel', slot: 'hand', price: 2, shop: 'street', draw: () => `<path d="M 0 6 C -10 -6 2 -14 8 -4 C 14 -14 26 -6 16 6 C 12 10 4 10 0 6 Z M 8 -4 L 4 6 M 8 -4 L 12 6" fill="none" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M 0 6 C -10 -6 2 -14 8 -4 C 14 -14 26 -6 16 6 C 12 10 4 10 0 6 Z M 8 -4 L 4 6 M 8 -4 L 12 6" fill="none" stroke="#b9732f" stroke-width="3.5" stroke-linejoin="round"/>` },
  { id: 'boba', name: 'Boba Tea', slot: 'hand', price: 4, shop: 'chinatown', draw: () => L(2, -18, 0, -6, O, 4) + L(2, -18, 0, -6, '#ff5a8a', 2) + P('M -6 -6 L 6 -6 L 5 12 L -5 12 Z', '#f5d7b5') + [[-2, 8], [2, 9], [0, 5], [3, 5]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.6" fill="#3a2418"/>`).join('') + R(-7, -8, 14, 3, 1.5, '#ffffff', 1.4) },
  { id: 'shopping-bag', name: 'Shopping Bag', slot: 'hand', price: 5, shop: 'thread', draw: () => `<path d="M -3 2 Q 3 -10 9 2" fill="none" stroke="${O}" stroke-width="2"/>` + P('M -8 2 L 14 2 L 16 26 L -10 26 Z', '#ffffff') + T(3, 17, 6.5, 'THREAD', O, 'font-weight="900"') },
  { id: 'trunk-bag', name: 'Monogram Bag', slot: 'hand', price: 220, shop: 'maison', draw: () => `<path d="M -2 2 Q 5 -10 12 2" fill="none" stroke="${O}" stroke-width="2.4"/>` + R(-8, 2, 26, 18, 4, '#7a4b2a') + [[-3, 7], [5, 7], [13, 7], [1, 14], [9, 14]].map(([x, y]) => `<path transform="translate(${x} ${y})" d="M0 -2 L.6 -.6 L2 0 L.6 .6 L0 2 L-.6 .6 L-2 0 L-.6 -.6Z" fill="#e2b04a"/>`).join('') + R(2, 8, 6, 4, 1, '#e2b04a', 1) },
  { id: 'foam-finger', name: 'Foam Finger', slot: 'hand', price: 8, shop: 'iloveny', draw: () => P('M -7 -2 L 9 -2 L 9 10 L -7 10 Z', '#3f7fe8') + P('M -2 -2 L -2 -24 Q 1 -28 4 -24 L 4 -2 Z', '#3f7fe8') + T(1, 8, 7, '#1', '#fff', 'font-weight="900"') },
  { id: 'snow-globe', name: 'Skyline Snow Globe', slot: 'hand', price: 6, shop: 'iloveny', draw: () => R(-8, 4, 20, 7, 2.5, '#8a5a35') + C(2, -6, 11, 'rgba(205,236,255,.92)') + R(-5, -6, 4, 9, 0.5, '#8fa0c9', 1) + R(-1, -12, 4, 15, 0.5, '#c9ccd6', 1) + R(3, -8, 4, 11, 0.5, '#7d8db8', 1) + R(7, -4, 3, 7, 0.5, '#a9b6d6', 1) + `<circle cx="-4" cy="-11" r="1" fill="#fff"/><circle cx="8" cy="-10" r="1" fill="#fff"/><circle cx="2" cy="-15" r=".9" fill="#fff"/>` },
  { id: 'balloon', name: 'Big Apple Balloon', slot: 'hand', price: 8, shop: 'toys', draw: () => `<path d="M 2 0 Q -4 -30 6 -58" fill="none" stroke="${O}" stroke-width="1.2"/>` + P('M 6 -58 C -10 -58 -12 -84 2 -86 C 4 -84 8 -84 10 -86 C 24 -84 22 -58 6 -58 Z', '#e8323a') + P('M 6 -86 Q 5 -92 9 -95', 'none') + P('M 7 -90 Q 13 -95 17 -90 Q 12 -86 7 -90 Z', '#4fc27e', 'stroke-width="1.6"') },
  { id: 'teddy', name: 'Toy Palace Teddy', slot: 'hand', price: 20, shop: 'toys', draw: () => C(-1, -10, 4, '#b07a4a', 2) + C(13, -10, 4, '#b07a4a', 2) + E(6, 6, 9, 10, '#c48a55') + C(6, -6, 8, '#c48a55') + E(6, -3, 3.5, 2.6, '#f0d2a8', 1.2) + `<circle cx="3" cy="-8" r="1.2" fill="${O}"/><circle cx="9" cy="-8" r="1.2" fill="${O}"/>` },
  { id: 'torch', name: 'Liberty Torch', slot: 'hand', price: 10, shop: 'liberty', alsoAt: ['iloveny'], draw: () => P('M -1 -8 L 5 -8 L 4 14 L 0 14 Z', '#6cc596') + P('M -4 -14 L 8 -14 L 6 -8 L -2 -8 Z', '#7fd3a6') + P('M 2 -32 C -6 -24 -4 -16 2 -15 C 8 -16 10 -24 2 -32 Z', '#ffb11f') + Pn('M 2 -25 C -1 -21 0 -17 2 -17 C 4 -17 5 -21 2 -25 Z', '#ffe27a') },
  { id: 'playbill', name: 'Playbill', slot: 'hand', price: 0, reward: 'broadway-show', draw: () => R(-4, -12, 16, 22, 1.5, '#ffd23f') + R(-4, -12, 16, 6, 1.5, '#1d1d24', 1.4) + T(4, -7.5, 4, 'PLAYBILL', '#ffd23f', 'font-weight="900"') },
  { id: 'flowers', name: 'Bodega Flowers', slot: 'hand', price: 5, shop: 'chelsea', draw: () => L(0, 10, 4, -8, '#3f9b55', 2) + L(4, 10, 6, -8, '#3f9b55', 2) + C(1, -12, 5, '#ff5a8a', 1.8) + C(9, -10, 4.5, '#ffd23f', 1.8) + C(5, -18, 4.5, '#b06bff', 1.8) + P('M -4 2 L 10 2 L 7 12 L -1 12 Z', '#f4efe2', 'stroke-width="1.8"') },
  { id: 'newspaper', name: 'Club NYC Times', slot: 'hand', price: 1, shop: 'street', draw: () => P('M -6 -10 L 14 -12 L 15 10 L -5 12 Z', '#f4f0e4') + L(-3, -6, 11, -7.5, O, 1.6) + L(-3, -2, 11, -3, '#8a8a8a', 1.2) + L(-3, 1, 11, 0, '#8a8a8a', 1.2) + L(-3, 4, 11, 3, '#8a8a8a', 1.2) },
  { id: 'gelato', name: 'Gelato Cone', slot: 'hand', price: 3, shop: 'street', draw: () => P('M -4 0 L 8 0 L 2 16 Z', '#e8b56b') + L(-1, 4, 5, 4, '#c98f45', 1.2) + C(2, -4, 6.5, '#9be3c3') + C(-1, -9, 4.5, '#ffb3d6') },
  { id: 'donut', name: 'Sprinkle Donut', slot: 'hand', price: 2, shop: 'street', draw: () => E(6, 0, 10, 8, '#e3a35c') + P('M -3 -2 C -2 -8 14 -8 15 -2 C 14 2 -2 2 -3 -2 Z', '#ff8fc7', 'stroke-width="1.6"') + E(6, -1, 3, 2.2, '#fff7ea', 1.6) + [[0, -4, '#3fd0ff'], [10, -5, '#ffd23f'], [12, -2, '#8cff6a'], [2, -1, '#b06bff']].map(([x, y, c]) => `<rect x="${x}" y="${y}" width="2.4" height="1" fill="${c}" transform="rotate(30 ${x} ${y})"/>`).join('') },
  { id: 'dumplings', name: 'Dumpling Box', slot: 'hand', price: 3, shop: 'chinatown', draw: () => P('M -6 -2 L 16 -2 L 13 14 L -3 14 Z', '#ffffff') + P('M -2 -2 L 2 -10 L 12 -10 L 16 -2', 'none', 'stroke-width="2"') + Pn('M 0 6 L 12 6', 'none', `stroke="#d6303a" stroke-width="2"`) },
  { id: 'cocoa', name: 'Hot Cocoa', slot: 'hand', price: 3, shop: 'street', draw: () => P('M -6 -4 L 6 -4 L 5 12 L -5 12 Z', '#c0392b') + R(-7, -7, 14, 4, 2, '#f4f4f8', 1.6) + `<path d="M -2 -10 q 2 -4 0 -7 M 3 -10 q 2 -4 0 -7" fill="none" stroke="#fff" stroke-width="1.6" opacity=".8"/>` },
  { id: 'metrocard', name: 'MetroCard', slot: 'hand', price: 3, shop: 'subway', draw: () => R(-2, -6, 18, 11, 2, '#ffcf1f', 2) + R(-2, 1, 18, 3, 0, '#1f2d5c', 0) },
]

// ---------- souvenirs: every shelf in the I ♥ NY shop has its own thing ----------
const globe = (inner: string) => () =>
  R(-8, 4, 20, 7, 2.5, '#8a5a35') + C(2, -6, 11, 'rgba(205,236,255,.92)') + inner +
  `<circle cx="-4" cy="-10" r="1" fill="#fff"/><circle cx="7" cy="-3" r="1.1" fill="#fff"/><circle cx="1" cy="-14" r=".9" fill="#fff"/><circle cx="-5" cy="-2" r=".8" fill="#fff"/>` +
  `<path d="M -5 -13 Q -2 -16 2 -15" stroke="#fff" stroke-width="1.5" fill="none" opacity=".9"/>`
/** a little side-view toy car: cabin, two windows, head- and tail-light, hubcaps (extra = side stripe, roof = sign) */
const toyCar = (body: string, extra: string, roof = '') => () =>
  roof +
  P('M -4 -6 L -1 -12 L 9 -12 L 12 -6 Z', body, 'stroke-width="2"') +
  P('M -9 1 L -9 -4 Q -9 -6 -7 -6 L 15 -6 Q 17 -6 17 -4 L 17 1 Q 17 2 16 2 L -8 2 Q -9 2 -9 1 Z', body, 'stroke-width="2"') +
  Pn('M -2.4 -7 L -0.2 -10.8 L 3.4 -10.8 L 3.4 -7 Z', '#cfe8ff') + Pn('M 5 -7 L 5 -10.8 L 8.2 -10.8 L 10.4 -7 Z', '#cfe8ff') +
  extra +
  R(15.2, -4.6, 2.2, 2, 0.6, '#fff6a8', 0.8) + R(-9.8, -4.6, 1.8, 2, 0.5, '#e8483f', 0.8) +
  C(-3, 2, 3.3, '#2b2f3a', 1.6) + C(-3, 2, 1.2, '#c9ccd6', 0.8) + C(11, 2, 3.3, '#2b2f3a', 1.6) + C(11, 2, 1.2, '#c9ccd6', 0.8)
const checkers = (y: number, from: number, to: number) => {
  let out = ''
  for (let x = from, i = 0; x < to; x += 2, i++) out += `<rect x="${x}" y="${y}" width="2" height="1.6" fill="${i % 2 ? '#fff' : O}"/><rect x="${x}" y="${y + 1.6}" width="2" height="1.6" fill="${i % 2 ? O : '#fff'}"/>`
  return out
}

const SOUVENIRS: ItemDef[] = [
  { id: 'globe-empire', name: 'Empire State Globe', slot: 'hand', price: 8, shop: 'iloveny', draw: globe(P('M 0 3 L 0 -7 L 1 -9 L 1 -13 L 2 -17 L 3 -13 L 3 -9 L 4 -7 L 4 3 Z', '#c9ccd6', 'stroke-width="1"')) },
  { id: 'globe-liberty', name: 'Lady Liberty Globe', slot: 'hand', price: 8, shop: 'iloveny', draw: globe(P('M -1 3 L 0 -6 L 2 -8 L 4 -6 L 5 3 Z', '#6cc596', 'stroke-width="1"') + L(4, -6, 6, -13, '#6cc596', 1.8) + C(6, -14.5, 1.6, '#ffb11f', 0.7)) },
  { id: 'globe-taxi', name: 'Taxi Snow Globe', slot: 'hand', price: 8, shop: 'iloveny', draw: globe(R(-5, -6, 14, 6, 2, '#ffcf1f', 1) + R(-1, -9, 6, 3, 1, '#ffcf1f', 1) + `<rect x="-4" y="-4" width="12" height="1.5" fill="${O}"/>` + C(-2, 0, 1.6, O, 0) + C(6, 0, 1.6, O, 0)) },
  { id: 'globe-bridge', name: 'Brooklyn Bridge Globe', slot: 'hand', price: 10, shop: 'iloveny', draw: globe(R(-5, -12, 3, 14, 0.5, '#b88c5a', 1) + R(5, -12, 3, 14, 0.5, '#b88c5a', 1) + `<path d="M -8 -3 Q -3.5 -14 -3.5 -12 M 6.5 -12 Q 2 -4 -2 -12 M 6.5 -12 Q 12 -4 12 -3" fill="none" stroke="${O}" stroke-width="1"/>` + L(-8, 0, 12, 0, '#b88c5a', 2)) },
  { id: 'globe-pizza', name: 'Pizza Slice Globe', slot: 'hand', price: 6, shop: 'iloveny', draw: globe(P('M -4 2 L 2 -14 L 8 2 Z', '#ffd36b', 'stroke-width="1"') + P('M -4 2 L 8 2 L 8 4 L -4 4 Z', '#d99a45', 'stroke-width="1"') + C(1, -4, 1.4, '#d6303a', 0.6) + C(4, -1, 1.2, '#d6303a', 0.6)) },
  { id: 'toy-taxi', name: 'Toy Yellow Cab', slot: 'hand', price: 6, shop: 'iloveny', draw: toyCar('#ffcf1f', `<rect x="-8" y="-3.2" width="24" height="1.4" fill="${O}" opacity=".85"/>`, R(1.6, -15.4, 7, 3.6, 1.2, '#ffffff', 1.2) + L(3.2, -13.6, 7, -13.6, '#e8a317', 1)) },
  { id: 'toy-checker', name: 'Vintage Checker Cab', slot: 'hand', price: 9, shop: 'iloveny', draw: toyCar('#f2c14e', checkers(-4.2, -7, 15), R(2.4, -14.6, 5, 2.8, 1, '#f2c14e', 1.1)) },
  { id: 'toy-bus', name: 'Mini City Bus', slot: 'hand', price: 7, shop: 'iloveny', draw: () => R(-9, -13, 26, 14, 3, '#f4f6fb', 2) + `<rect x="-7.6" y="-4.6" width="23.2" height="3" fill="#2a7bd5"/>` + [-6, -1, 4, 9].map((x) => R(x, -11, 4, 4, 0.8, '#7fb2ff', 1)).join('') + R(14.2, -11, 2, 6, 0.6, '#7fb2ff', 0.8) + C(-4, 1.5, 2.8, '#2b2f3a', 1.4) + C(-4, 1.5, 1, '#c9ccd6', 0.6) + C(12, 1.5, 2.8, '#2b2f3a', 1.4) + C(12, 1.5, 1, '#c9ccd6', 0.6) },
  { id: 'toy-subway', name: 'Toy Subway Car', slot: 'hand', price: 9, shop: 'iloveny', draw: () => R(-10, -12, 28, 13, 3, '#c9ced8', 2) + [-8, -2, 4].map((x) => R(x, -10, 4, 5, 0.8, '#3a4a7a', 1)).join('') + L(-10, -3.6, 18, -3.6, '#8d95a8', 1) + C(13, -6.5, 2.9, '#ee352e', 1) + `<text x="13" y="-5" font-size="4.4" text-anchor="middle" fill="#fff" font-weight="900">1</text>` + C(-5, 2, 2.2, '#2b2f3a', 1.2) + C(13, 2, 2.2, '#2b2f3a', 1.2) },
  { id: 'toy-ferry', name: 'Toy Ferry', slot: 'hand', price: 7, shop: 'iloveny', draw: () => P('M -10 -2 L 18 -2 L 15 4 L -7 4 Z', '#ff8a1f', 'stroke-width="2"') + R(-5, -9, 16, 7, 1.5, '#ffffff', 1.6) + [0, 4, 8].map((x) => R(x - 3, -7, 2.4, 2.4, 0.4, '#7fb2ff', 0.8)).join('') + R(3, -13, 3, 4, 0.5, '#ff8a1f', 1.2) },
  { id: 'iloveny-mug', name: 'I ♥ NY Mug', slot: 'hand', price: 5, shop: 'iloveny', draw: () => R(-6, -8, 14, 15, 2.5, '#ffffff') + `<path d="M 8 -5 Q 13 -4 12 0 Q 11 3 8 2" fill="none" stroke="${O}" stroke-width="2.4"/>` + heart(1, -1.5, 1, '#e8323a', 1.2) },
  { id: 'postcard', name: 'Postcard Stack', slot: 'hand', price: 3, shop: 'iloveny', draw: () => P('M -8 -6 L 12 -9 L 14 5 L -6 8 Z', '#ffe9a8', 'stroke-width="2"') + P('M -6 -4 L 4 -5.5 L 5 3 L -5 4.5 Z', '#6fb6ff', 'stroke-width="1.2"') + L(7, -5, 11, -5.5, O, 1) + L(7, -2, 11, -2.5, O, 1) },
  {
    id: 'pizza-tee', name: 'Pizza Tee', slot: 'body', price: 15, shop: 'iloveny',
    top: { color: '#ffffff', sleeves: 'short', front: () => P('M -9 -64 L 9 -64 L 0 -40 Z', '#ffd36b', 'stroke-width="2"') + P('M -9 -64 Q 0 -68 9 -64 L 8 -61 Q 0 -65 -8 -61 Z', '#d99a45', 'stroke-width="2"') + C(-2, -56, 2, '#d6303a', 1) + C(3, -51, 1.8, '#d6303a', 1) },
  },
  {
    id: 'subway-tee', name: 'Subway Lines Tee', slot: 'body', price: 18, shop: 'iloveny',
    top: { color: '#24242c', sleeves: 'short', front: () => [['#EE352E', '1', -10, -60], ['#00933C', '4', 0, -60], ['#0039A6', 'A', 10, -60], ['#FCCC0A', 'N', -5, -50], ['#FF6319', 'F', 5, -50]].map(([c, t, x, y]) => `<circle cx="${x}" cy="${y}" r="4.4" fill="${c}"/><text x="${x}" y="${(y as number) + 2}" font-size="6" text-anchor="middle" font-weight="900" fill="${t === 'N' ? '#1d2140' : '#fff'}">${t}</text>`).join('') },
  },
  {
    id: 'apple-tee', name: 'Big Apple Tee', slot: 'body', price: 15, shop: 'iloveny',
    top: { color: '#e8483f', sleeves: 'short', front: () => C(0, -52, 8, '#ff6b5f', 2) + P('M 0 -60 Q 1 -66 5 -67', 'none', 'stroke-width="2"') + P('M 1 -62 Q 7 -66 9 -61 Q 4 -59 1 -62 Z', '#4fc27e', 'stroke-width="1.4"') },
  },
  {
    id: 'iloveny-cap', name: 'I ♥ NY Cap', slot: 'head', price: 12, shop: 'iloveny',
    draw: (c) => capDome('#ffffff') + (c.back ? '' : capBrim(c.fx, '#e8323a') + heart(c.fx, -127, 1.6, '#e8323a', 1.6)) + C(0, -147, 2.6, '#e8323a', 1.6),
  },
  {
    id: 'taxi-cap', name: 'Taxi Cap', slot: 'head', price: 12, shop: 'iloveny',
    draw: (c) => capDome('#ffcf1f') + [-20, -12, -4, 4, 12].map((x, i) => `<rect x="${x}" y="-125" width="8" height="4" fill="${i % 2 ? '#fff' : O}"/><rect x="${x}" y="-121" width="8" height="4" fill="${i % 2 ? O : '#fff'}"/>`).join('') + (c.back ? '' : capBrim(c.fx, '#e0b20f')) + C(0, -147, 2.6, '#ffcf1f', 1.6),
  },
  // Toy Palace
  { id: 'heart-balloon', name: 'Heart Balloon', slot: 'hand', price: 8, shop: 'toys', draw: () => `<path d="M 2 0 Q -4 -30 6 -58" fill="none" stroke="${O}" stroke-width="1.2"/>` + `<path transform="translate(6 -72) scale(3.2)" d="M0 4 C -7 -2 -4 -8 0 -4.5 C 4 -8 7 -2 0 4Z" fill="#ff5a8a" stroke="${O}" stroke-width="0.7" stroke-linejoin="round"/>` },
  { id: 'star-balloon', name: 'Star Balloon', slot: 'hand', price: 8, shop: 'toys', draw: () => `<path d="M 2 0 Q -4 -30 6 -58" fill="none" stroke="${O}" stroke-width="1.2"/>` + `<path transform="translate(6 -72)" d="M0 -14 L4 -5 L14 -4 L6.5 2.5 L9 12 L0 7 L-9 12 L-6.5 2.5 L-14 -4 L-4 -5Z" fill="#ffd23f" stroke="${O}" stroke-width="2.4" stroke-linejoin="round"/>` },
  { id: 'toy-robot', name: 'Wind-up Robot', slot: 'hand', price: 12, shop: 'toys', draw: () => R(-4, -6, 14, 14, 2, '#9aa6c4') + R(-2, -16, 10, 9, 2, '#b7c2dd') + C(1, -12, 1.4, '#ffd23f', 0.8) + C(5, -12, 1.4, '#ffd23f', 0.8) + L(3, -16, 3, -20) + C(3, -21, 1.6, '#ff5a5f', 1) + R(-2, -2, 10, 4, 1, '#3fd0ff', 1.2) },
  { id: 'toy-rocket', name: 'Toy Rocket', slot: 'hand', price: 12, shop: 'toys', draw: () => P('M 2 -22 Q 9 -12 8 2 L -4 2 Q -5 -12 2 -22 Z', '#f4f6fb') + C(2, -10, 2.6, '#6fb6ff', 1.4) + P('M -4 -2 L -8 4 L -4 3 Z', '#e8483f', 'stroke-width="1.6"') + P('M 8 -2 L 12 4 L 8 3 Z', '#e8483f', 'stroke-width="1.6"') + P('M -1 3 L 2 9 L 5 3 Z', '#ffb11f', 'stroke-width="1.4"') },
]

// ---------- Halloween party (free during the party, CP-style) ----------
const PARTY: ItemDef[] = [
  {
    id: 'witch-hat', name: 'Witch Hat', slot: 'head', price: 0, reward: 'halloween', flattensHair: true,
    draw: () => P('M -38 -112 Q 0 -100 38 -112 Q 40 -104 28 -102 Q 0 -96 -28 -102 Q -40 -104 -38 -112 Z', '#3a2a5c') + P('M -22 -110 L 6 -176 Q 10 -180 14 -172 L 22 -110 Z', '#4a3672') + Pn('M -19 -118 L 20 -118 L 21 -110 L -21 -110 Z', '#ff9f1c') + `<rect x="-4" y="-120" width="8" height="10" rx="1.5" fill="#ffd23f" stroke="${O}" stroke-width="1.6"/>`,
  },
  {
    id: 'pumpkin-hat', name: 'Pumpkin Hat', slot: 'head', price: 0, reward: 'halloween', flattensHair: true,
    draw: () => E(0, -134, 24, 15, '#ff8a1f') + `<path d="M -10 -147 Q -14 -134 -10 -121 M 10 -147 Q 14 -134 10 -121" fill="none" stroke="#d96a0f" stroke-width="2"/>` + P('M -2 -149 Q 0 -158 6 -160', 'none', `stroke-width="4"`) + L(-2, -149, 5, -159, '#4f8a2b', 2.4) + P('M -9 -136 L -5 -141 L -1 -136 Z M 9 -136 L 5 -141 L 1 -136 Z', '#3a1d00', 'stroke-width="1"') + P('M -10 -129 Q 0 -122 10 -129 L 6 -127 L 4 -130 L 0 -126 L -4 -130 L -6 -127 Z', '#3a1d00', 'stroke-width="1"'),
  },
  {
    id: 'golden-pumpkin', name: 'Golden Pumpkin Crown', slot: 'head', price: 0, reward: 'candy-hunt', flattensHair: true,
    draw: () => P('M -26 -116 L -20 -144 L -9 -128 L 0 -150 L 9 -128 L 20 -144 L 26 -116 Q 0 -110 -26 -116 Z', '#f2c14e') + E(0, -122, 9, 7, '#ff9f1c', 2) + C(-20, -146, 3, '#ff5a5f', 1.4) + C(0, -152, 3.4, '#3fd0ff', 1.4) + C(20, -146, 3, '#8cff6a', 1.4),
  },
  {
    id: 'skeleton-hoodie', name: 'Skeleton Hoodie', slot: 'body', price: 0, reward: 'halloween',
    top: { color: '#24242c', sleeves: 'long', collar: hood('#24242c'), front: () => [-62, -55, -48].map((y) => `<path d="M -12 ${y} Q 0 ${y + 3} 12 ${y}" fill="none" stroke="#f4f4f8" stroke-width="2.6" stroke-linecap="round"/>`).join('') + L(0, -68, 0, -40, '#f4f4f8', 2.6) + E(0, -40, 7, 3, '#f4f4f8', 1.2) },
  },
  {
    id: 'vampire-cape', name: 'Vampire Cape', slot: 'neck', price: 0, reward: 'halloween',
    drawBack: () => P('M -18 -76 L -30 -10 Q 0 -4 30 -10 L 18 -76 Z', '#1d1d26') + Pn('M -14 -72 L -24 -14 Q 0 -9 24 -14 L 14 -72 Z', '#a8121f'),
    draw: () => P('M -16 -74 L -24 -92 L -8 -78 Z', '#a8121f') + P('M 16 -74 L 24 -92 L 8 -78 Z', '#a8121f') + C(0, -72, 3, '#f2c14e', 1.4),
  },
  { id: 'candy-bucket', name: 'Trick-or-Treat Bucket', slot: 'hand', price: 0, reward: 'halloween', draw: () => `<path d="M -6 -4 Q 6 -16 18 -4" fill="none" stroke="${O}" stroke-width="2"/>` + P('M -8 -2 L 20 -2 L 18 16 Q 6 20 -6 16 Z', '#ff8a1f') + P('M -1 4 L 2 1 L 4 4 Z M 11 4 L 14 1 L 16 4 Z', '#3a1d00', 'stroke-width="1"') + P('M 0 10 Q 7 14 14 10', 'none', 'stroke-width="1.6"') + C(2, -4, 2.6, '#ff5a8a', 1) + C(8, -6, 2.6, '#ffd23f', 1) + C(14, -4, 2.6, '#3fd0ff', 1) },
]

export const ITEMS: ItemDef[] = [...TOPS, ...BOTTOMS, ...SHOES, ...HATS, ...FACE, ...NECK, ...HAND, ...SOUVENIRS, ...PARTY]
export const ITEM: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]))
export const STARTER_ITEMS = ITEMS.filter((i) => i.price === 0 && !i.reward).map((i) => i.id)

export const SHOPS: Record<string, { name: string; tagline: string }> = {
  iloveny: { name: 'I ♥ NY Souvenirs', tagline: 'Every tourist essential, priced to move' },
  thread: { name: 'THREAD', tagline: 'SoHo Style · Fall Collection' },
  sneakers: { name: 'Sneaker Vault', tagline: 'This week’s drops. Camping out optional.' },
  maison: { name: 'Maison Malle', tagline: 'Fifth Avenue · Since 1854 (allegedly)' },
  toys: { name: 'Toy Palace', tagline: 'Fun for kids of all ages (you)' },
  broadway: { name: 'Broadway Merch', tagline: 'Take the show home' },
  liberty: { name: 'Liberty Island Kiosk', tagline: 'Foam crowns & torches' },
  rink: { name: 'Rink Rentals', tagline: 'Skates for the season. Falling is free.' },
}

// tint is used by some callers for icons
export { tint }
