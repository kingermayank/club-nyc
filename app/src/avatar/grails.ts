import { nycDay } from '../data/economy'

/**
 * The grails: one-of-a-kind sneakers from the Vault at Sneaker Vault SoHo (features/moments/vault.ts). Each is drawn in
 * the avatar's own foot space, so the same drawing goes on a pedestal, in the mirror and on your feet in the city, and
 * each has a glossy render for the vault (art/vault/<id>.png).
 *
 * The first three are the vault's archive: try them on, never for sale. The rest take turns as the Drop: one a New
 * York day, the same for the whole city, buyable that day only and priced like the real thing. The server checks the
 * day too (server/src/economy.ts), so "today only" is true.
 */
const INK = '#1d2140'
const HIGH = (x: number) => `M ${x - 9} -3 L ${x - 9} -18 Q ${x - 9} -21 ${x - 6} -21 L ${x + 2} -21 Q ${x + 4} -21 ${x + 4} -18 L ${x + 4} -12 Q ${x + 11} -11 ${x + 11} -4 L ${x + 11} -3 Z`
const LOW = (x: number) => `M ${x - 10} -3 L ${x - 10} -10 Q ${x - 10} -13 ${x - 6} -13 L ${x} -13 Q ${x + 3} -13 ${x + 3} -10 L ${x + 3} -11 Q ${x + 10} -10 ${x + 11} -4 L ${x + 11} -3 Z`
const sole = (x: number, col: string) => `<path d="M ${x - 10} -4 L ${x + 10} -4 L ${x + 10} -1 Q ${x + 10} 1 ${x + 8} 1 L ${x - 8} 1 Q ${x - 10} 1 ${x - 10} -1 Z" fill="${col}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`
const rect = (x: number, y: number, w: number, h: number, fill: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`
const dot = (x: number, y: number, r: number, fill: string) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`
const line = (d: string, col: string, w: number) => `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`
let clipN = 0
/** a shoe: the upper's silhouette filled, the pattern clipped to it, the ink line on top, then the sole (and ears, spikes) */
const shoe = (shape: (x: number) => string, fill: string, soleCol: string, pattern: (x: number) => string, above: (x: number) => string = () => '') => (x: number) => {
  const id = `vt-clip-${++clipN}`
  const d = shape(x)
  return `${above(x)}<clipPath id="${id}"><path d="${d}"/></clipPath><path d="${d}" fill="${fill}"/><g clip-path="url(#${id})">${pattern(x)}</g><path d="${d}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>${sole(x, soleCol)}`
}
const tri = (x: number, y: number, w: number, h: number, fill: string) => `<path d="M ${x} ${y} L ${x + w / 2} ${y - h} L ${x + w} ${y} Z" fill="${fill}" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>`

export interface Grail {
  id: string
  /** the model, and the colourway's nickname (Sky High 1 "Yellow Cab") */
  line: string
  nick: string
  /** a parody collab label, for the headline pair */
  collab?: string
  /** coins on drop day; 0 = archive, try-on only */
  price: number
  name: string
  glow: string
  draw: (x: number) => string
}
export const GRAILS: Grail[] = [
  {
    id: 'taxi', line: 'Sky High 1', nick: 'Yellow Cab', price: 0, name: 'Taxi Highs', glow: '#ffd23f',
    draw: shoe(HIGH, '#ffc91f', '#16171c', (x) => {
      let s = rect(x - 10, -22, 16, 5.6, '#16171c')
      for (let r = 0; r < 2; r++) for (let i = 0; i < 9; i++) if ((i + r) % 2 === 0) s += rect(x - 9 + i * 2.3, -9.6 + r * 2.6, 2.3, 2.6, '#16171c')
      return s
    }),
  },
  {
    id: 'gold', line: 'Slam Low', nick: 'Solid Gold', price: 0, name: 'Solid Golds', glow: '#ffe27a',
    draw: shoe(LOW, '#f2b41f', '#fff3c4', (x) =>
      `<path d="M ${x + 3} -11 Q ${x + 10} -10 ${x + 11} -3 L ${x + 3} -3 Z" fill="#ffd75a"/>` + rect(x - 10, -9, 4.4, 6, '#d08f0c') +
      line(`M ${x - 7} -10.6 L ${x + 1} -10.6`, '#fff6c9', 1.5) + `<path d="M ${x + 6.4} -9.2 L ${x + 7.1} -7.4 L ${x + 8.9} -6.7 L ${x + 7.1} -6 L ${x + 6.4} -4.2 L ${x + 5.7} -6 L ${x + 3.9} -6.7 L ${x + 5.7} -7.4 Z" fill="#fff"/>`),
  },
  {
    id: 'liberty', line: 'Sky High 11', nick: 'Lady Liberty', price: 0, name: 'Lady Liberties', glow: '#8ff0c8',
    draw: shoe(HIGH, '#7fd3b0', '#eafff6', (x) =>
      rect(x - 10, -22, 16, 5.2, '#55b592') + `<path d="M ${x + 3} -12 Q ${x + 11} -11 ${x + 11} -3 L ${x + 3} -3 Z" fill="#55b592"/>` + rect(x - 10, -10, 4.6, 7, '#55b592') + dot(x - 2.6, -13.4, 1.5, '#ffd166'),
    (x) => [-7.6, -4.6, -1.6, 1.2].map((dx, i) => tri(x + dx, -20.4, 2.6, i === 1 || i === 2 ? 5 : 3.6, '#7fd3b0')).join('')),
  },
  {
    id: 'tiles', line: 'Stoop One', nick: 'Subway Tile', price: 1500, name: 'Subway Tiles', glow: '#bfe6ff',
    draw: shoe(LOW, '#ffffff', '#2b2f3a', (x) => {
      let s = ''
      for (let i = 0; i < 8; i++) s += line(`M ${x - 8 + i * 2.6} -14 L ${x - 8 + i * 2.6} -3`, '#b3bfd6', 0.55)
      for (const y of [-11.2, -8.9]) s += line(`M ${x - 11} ${y} L ${x + 12} ${y}`, '#b3bfd6', 0.55)
      return s + rect(x - 11, -7.4, 23, 2.8, '#1f9d48') + dot(x - 3, -6, 0.8, '#fff') + dot(x, -6, 0.8, '#fff') + dot(x + 3, -6, 0.8, '#fff')
    }),
  },
  {
    id: 'slices', line: 'Slam Low', nick: 'Dollar Slice', price: 1800, name: 'Dollar Slices', glow: '#ffb86b',
    draw: shoe(LOW, '#ffcf4a', '#d83a2e', (x) =>
      rect(x - 10, -14, 3.8, 12, '#d9903a') + [[-3.6, -9.6], [1, -7], [-1.6, -5], [5.6, -6.2], [8, -4.6]].map(([dx, y]) => dot(x + dx, y, 1.5, '#d83a2e')).join('') + line(`M ${x - 5} -6.4 L ${x - 4} -4.6`, '#fff3b0', 0.9)),
  },
  {
    id: 'cookie', line: 'Slam Low', nick: 'Black &amp; White', price: 2000, name: 'Black &amp; Whites', glow: '#ffffff',
    draw: shoe(LOW, '#ffffff', '#f1f2f7', (x) => rect(x - 11, -14, 11.5, 12, '#16171c') + line(`M ${x + 4} -8 L ${x + 8} -6.6`, '#d9dce6', 1)),
  },
  {
    id: 'cats', line: 'Sky High 1', nick: 'Bodega Cat', price: 2400, name: 'Bodega Cats', glow: '#ffc58a',
    draw: shoe(HIGH, '#f29a3c', '#fff3dc', (x) =>
      [-7, -3.4, 0.2].map((dx) => line(`M ${x + dx} -15 L ${x + dx + 2.4} -11.4`, '#b9641c', 1.5)).join('') + [5.4, 8].map((dx) => line(`M ${x + dx} -9.4 L ${x + dx + 1.4} -6.4`, '#b9641c', 1.4)).join('') +
      rect(x - 10, -22, 16, 3.6, '#fff3dc') + `<path d="M ${x + 7} -3 Q ${x + 8} -7 ${x + 12} -6 L ${x + 12} -3 Z" fill="#fff3dc"/>`,
    (x) => tri(x - 8, -20.4, 4, 4.6, '#f29a3c') + tri(x - 1.4, -20.4, 4, 4.6, '#f29a3c')),
  },
  {
    id: 'pigeon', line: 'Slam Low', nick: 'Pigeon', price: 3000, name: 'Pigeon Greys', glow: '#c9b6ff',
    draw: shoe(LOW, '#9aa3b8', '#ff8a3c', (x) =>
      rect(x - 11, -14, 15, 2.2, '#3cb37a') + rect(x - 11, -11.8, 15, 1.8, '#8e6bd8') + line(`M ${x - 5} -8.4 L ${x - 2.6} -5.4`, '#4d556b', 1.7) + line(`M ${x - 1.4} -8.4 L ${x + 1} -5.4`, '#4d556b', 1.7) +
      `<path d="M ${x + 5} -11 Q ${x + 10} -10 ${x + 11} -3 L ${x + 5} -3 Z" fill="#c7cddb"/>`),
  },
  {
    // the collab: deconstructed, quoted, zip-tied (a parody of the most hyped sneaker of the last decade)
    id: 'late', line: 'Sky High 1', nick: 'Late Train', collab: 'OFF-SCHEDULE', price: 5000, name: 'Late Trains', glow: '#ff8a3c',
    draw: shoe(HIGH, '#ffffff', '#e6eef8', (x) =>
      rect(x - 10, -22, 16, 5.4, '#d81f26') + rect(x - 10, -14, 4.4, 11, '#16171c') + `<path d="M ${x + 3} -12 Q ${x + 11} -11 ${x + 11} -3 L ${x + 3} -3 Z" fill="#d81f26"/>` +
      line(`M ${x - 5} -11.6 L ${x + 2} -11.6`, '#c9ced9', 0.7) + line(`M ${x - 5} -6.4 L ${x + 9} -6.4`, '#c9ced9', 0.7) + dot(x + 0.5, -15.4, 1.4, '#ff7a1a') + line(`M ${x + 0.5} -14 L ${x + 2.6} -10.8`, '#ff7a1a', 1)),
  },
]

/** the archive: always in the vault, never for sale */
export const ARCHIVE = 3
/** today's drop (YYYY-MM-DD, New York) */
export function dropOf(day: string = nycDay()): Grail {
  let h = 2166136261
  for (const ch of `drop:${day}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const pool = GRAILS.slice(ARCHIVE)
  return pool[(h >>> 0) % pool.length]
}
export const grailItemId = (g: Grail) => `grail-${g.id}`
/** the glossy render on the pedestals */
export const grailArt = (g: Grail) => `/art/vault/${g.id}.png`
