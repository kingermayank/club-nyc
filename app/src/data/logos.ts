/**
 * Logos for the companies ringing the bell. Real listings come from the market feed with no artwork (and we would
 * never draw a real company's logo), so every one gets an original mark: a shape that suits what the company does
 * (gem facets for a mining company, a helix for a biotech, columns for a bank), in a palette and variant that turn
 * over every day. Same company, same day: same logo for everybody.
 *
 * Every mark is drawn in a 100 × 100 box, in a single "ink" colour with one accent, so it reads at 46px on the
 * Exchange screen and still looks designed when it's big.
 */

type Mark = (ink: string, acc: string) => string

// ---------- the marks ----------
const MARKS: Record<string, Mark> = {
  /** a cut gem, facet lines and a highlight */
  facets: (i, a) =>
    `<path d="M30 30 L70 30 L84 46 L50 84 L16 46 Z" fill="${i}"/><path d="M16 46 L84 46 M30 30 L40 46 L50 84 L60 46 L70 30 M40 46 L50 30 L60 46" fill="none" stroke="${a}" stroke-width="3.2" stroke-linejoin="round" opacity=".55"/><path d="M33 34 L42 34 L36 42 Z" fill="#fff" opacity=".7"/>`,
  /** three peaks with snow */
  peaks: (i, a) =>
    `<path d="M10 78 L38 34 L52 56 L64 40 L90 78 Z" fill="${i}"/><path d="M38 34 L46 47 L41 45 L36 50 L31 45 Z M64 40 L71 51 L66 49 L62 53 L58 49 Z" fill="${a}"/>`,
  /** a planet and its ring */
  orbit: (i, a) =>
    `<circle cx="50" cy="50" r="20" fill="${i}"/><ellipse cx="50" cy="52" rx="38" ry="11" fill="none" stroke="${a}" stroke-width="6" transform="rotate(-18 50 52)"/><path d="M30 46 A 20 20 0 0 1 70 46" fill="${i}"/><circle cx="78" cy="26" r="4.5" fill="${a}"/>`,
  /** three bars climbing */
  bars: (i, a) =>
    `<rect x="18" y="56" width="16" height="26" rx="5" fill="${i}" opacity=".75"/><rect x="42" y="40" width="16" height="42" rx="5" fill="${i}" opacity=".88"/><rect x="66" y="22" width="16" height="60" rx="5" fill="${i}"/><path d="M20 44 L44 30 L56 36 L80 14" fill="none" stroke="${a}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  /** a leaf with its vein */
  leaf: (i, a) =>
    `<path d="M22 80 C 20 40 50 18 82 18 C 82 52 60 80 22 80 Z" fill="${i}"/><path d="M26 76 C 42 60 56 44 72 28" fill="none" stroke="${a}" stroke-width="4.5" stroke-linecap="round"/>`,
  /** a double helix */
  helix: (i, a) =>
    `<path d="M40 22 L60 22 M37 36 L63 36 M37 64 L63 64 M40 78 L60 78" stroke="${i}" stroke-width="4.5" stroke-linecap="round" opacity=".55"/><path d="M34 10 C 34 30 66 32 66 50 C 66 68 34 70 34 90" fill="none" stroke="${i}" stroke-width="9" stroke-linecap="round"/><path d="M66 10 C 66 30 34 32 34 50 C 34 68 66 70 66 90" fill="none" stroke="${a}" stroke-width="9" stroke-linecap="round"/>`,
  /** a lightning bolt */
  bolt: (i, a) => `<path d="M56 10 L22 56 L46 56 L38 90 L78 40 L54 40 Z" fill="${i}" stroke="${a}" stroke-width="4" stroke-linejoin="round"/>`,
  /** a sun */
  sun: (i, a) =>
    `<circle cx="50" cy="50" r="18" fill="${i}"/>${Array.from({ length: 8 }, (_, k) => `<rect x="47" y="10" width="6" height="16" rx="3" fill="${a}" transform="rotate(${k * 45} 50 50)"/>`).join('')}`,
  /** an isometric cube, three tones */
  cube: (i, a) =>
    `<path d="M50 14 L82 32 L50 50 L18 32 Z" fill="${a}"/><path d="M18 32 L50 50 L50 88 L18 70 Z" fill="${i}" opacity=".8"/><path d="M82 32 L50 50 L50 88 L82 70 Z" fill="${i}"/>`,
  /** a four-point spark and a little one */
  spark: (i, a) =>
    `<path d="M44 12 C 47 36 52 41 76 44 C 52 47 47 52 44 76 C 41 52 36 47 12 44 C 36 41 41 36 44 12 Z" fill="${i}"/><path d="M76 62 C 77 71 79 73 88 74 C 79 75 77 77 76 86 C 75 77 73 75 64 74 C 73 73 75 71 76 62 Z" fill="${a}"/>`,
  /** a pediment and columns */
  pillars: (i, a) =>
    `<path d="M14 36 L50 14 L86 36 Z" fill="${i}"/><rect x="20" y="40" width="10" height="34" rx="2" fill="${i}"/><rect x="45" y="40" width="10" height="34" rx="2" fill="${i}"/><rect x="70" y="40" width="10" height="34" rx="2" fill="${i}"/><rect x="12" y="78" width="76" height="8" rx="3" fill="${a}"/>`,
  /** stacked chevrons, pointing up */
  chevrons: (i, a) =>
    `<path d="M18 50 L50 26 L82 50" fill="none" stroke="${i}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 76 L50 52 L82 76" fill="none" stroke="${a}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`,
  /** three waves */
  waves: (i, a) =>
    [30, 50, 70].map((y, k) => `<path d="M12 ${y} q 9.5 -12 19 0 t 19 0 t 19 0 t 19 0" fill="none" stroke="${k === 1 ? a : i}" stroke-width="7" stroke-linecap="round"/>`).join(''),
  /** two linked rings */
  rings: (i, a) =>
    `<circle cx="38" cy="50" r="22" fill="none" stroke="${i}" stroke-width="10"/><circle cx="62" cy="50" r="22" fill="none" stroke="${a}" stroke-width="10"/><path d="M50 32 A 22 22 0 0 1 60 46" fill="none" stroke="${i}" stroke-width="10"/>`,
  /** a pinwheel of quarter circles */
  pinwheel: (i, a) =>
    [0, 90, 180, 270].map((r, k) => `<path d="M50 50 L50 16 A 34 34 0 0 1 84 50 Z" fill="${k % 2 ? a : i}" transform="rotate(${r} 50 50) translate(${3} ${-3})"/>`).join(''),
  /** a seed, sprouting */
  sprout: (i, a) =>
    `<path d="M50 86 L50 46" stroke="${i}" stroke-width="7" stroke-linecap="round"/><path d="M50 52 C 30 52 20 38 20 22 C 38 22 50 32 50 52 Z" fill="${i}"/><path d="M50 46 C 66 46 80 36 80 18 C 62 18 50 28 50 46 Z" fill="${a}"/>`,
}

/** what a company does, from its name, and the marks that suit it */
const THEMES: [RegExp, string[]][] = [
  [/mineral|mining|metal|gold|silver|lithium|copper|resource|ore\b|nickel|uranium/i, ['facets', 'peaks']],
  [/bio|thera|pharm|medic|health|genom|gene|clinic|diagnos|life ?science|oncolog|immun/i, ['helix', 'leaf', 'sprout']],
  [/energy|power|solar|electric|battery|oil|gas|fuel|nuclear|grid/i, ['bolt', 'sun']],
  [/space|aero|orbit|satellite|rocket|launch/i, ['orbit', 'spark']],
  [/marine|ship|ocean|water|port|logistic|freight/i, ['waves', 'chevrons']],
  [/acquisition|capital|financ|bank|holding|trust|partners|invest|insur|credit|fund|asset/i, ['pillars', 'chevrons', 'rings']],
  [/tech|software|data|cloud|ai\b|systems|digital|semi|network|cyber|robot|labs?\b|compute/i, ['cube', 'spark', 'bars']],
  [/food|farm|agri|organic|garden|green|bev|coffee|restaurant/i, ['sprout', 'leaf']],
]

/** background gradient (two stops), the mark's ink and its accent */
const PALETTES: [string, string, string, string][] = [
  ['#1f6fd0', '#4aa3ff', '#ffffff', '#ffd166'],
  ['#0e7a55', '#33c58a', '#ffffff', '#d7ffe9'],
  ['#6a35c9', '#a77bff', '#ffffff', '#ffd2f3'],
  ['#d23f26', '#ff8a5c', '#ffffff', '#ffe2a8'],
  ['#12304f', '#2d5d8f', '#ffd166', '#ffffff'],
  ['#a87406', '#f2c14e', '#ffffff', '#5a3d00'],
  ['#b8124f', '#ff6fa5', '#ffffff', '#ffe0ec'],
  ['#00756a', '#22c3b4', '#ffffff', '#c9fff6'],
  ['#232c3a', '#4d5d74', '#7fe0ff', '#ffffff'],
  ['#d35400', '#ffad42', '#ffffff', '#4a2200'],
]

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

let uid = 0
/**
 * The company's logo for the day, as an SVG that fills its box (a round badge: gradient, a soft top light, the mark).
 * `day` is New York's date as a number (20261112); pass the same day everywhere so everyone sees the same logo.
 */
export function companyLogo(sym: string, name: string, day: number): string {
  const h = hash(`${sym}:${day}`)
  const theme = THEMES.find(([re]) => re.test(name))?.[1]
  const pool = theme ?? Object.keys(MARKS)
  const mark = MARKS[pool[h % pool.length]]
  const [c1, c2, ink, acc] = PALETTES[(h >>> 8) % PALETTES.length]
  const tilt = ((h >>> 16) % 3) - 1 // a whisker of personality: -1, 0 or 1 degrees x 6
  const id = `lg${++uid}`
  return `<svg class="co-logo" viewBox="0 0 100 100" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c2}"/><stop offset="1" stop-color="${c1}"/></linearGradient></defs>
    <circle cx="50" cy="50" r="50" fill="url(#${id})"/>
    <circle cx="50" cy="50" r="48.5" fill="none" stroke="#fff" stroke-width="3" opacity=".12"/>
    <g transform="translate(50 50) scale(0.68) rotate(${tilt * 6}) translate(-50 -50)">${mark(ink, acc)}</g>
  </svg>`
}

/** all the marks, for a contact sheet in dev (window.logoSheet()) */
export const MARK_NAMES = Object.keys(MARKS)
