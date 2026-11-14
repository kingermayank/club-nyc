import './bookshop.css'
import { sfx } from '../../audio'
import { el, toStage } from '../../engine/stage'
import { mk } from '../../sound/market'
import { bump, save } from '../../state'
import type { Game } from '../../types'
import { openMoment } from './kit'

/**
 * Postman Books, the independent bookshop in Chelsea Market, first person over its painting
 * (art/places/cm-books.jpg). Six staff picks lean on the six wooden stands of the display table. Pick one up and it
 * comes to your hands; open it and page through (click a page, drag a page across, or the arrow keys): every book is
 * a cover, four spreads and The End. Buy it (5 coins) or put it back.
 *
 * The books are printed matter, so they are set in print fonts (system serif / sans stacks), not the game's UI font.
 * Each cover is one 220 × 320 SVG, drawn once and scaled: 0.3 on its stand, full size in your hands.
 */

const ART = '/art/places/cm-books.jpg'
const PRICE = 5
const ITEM = 'book'
/** a page / a cover, in stage px */
const PW = 220
const PH = 320
/** the six stands, measured from the painting (stage units): where the ledge is, and how far each board leans */
const STANDS: { x: number; skew: number }[] = [
  { x: 207, skew: -10.4 },
  { x: 325.5, skew: -10 },
  { x: 440.5, skew: -8.3 },
  { x: 577.5, skew: 7.8 },
  { x: 698.5, skew: 11.6 },
  { x: 820.5, skew: 14.1 },
]
const LEDGE_Y = 445
const MINI = 0.3
/** where the book is held: the spread is 440 wide around x = 500 */
const HELD = { left: 280, top: 90 }

interface Page {
  /** inline SVG, 184 wide; `ah` is its height (default: the book's) */
  art?: string
  ah?: number
  /** a heading (chapter, year, species) and a line under it */
  h?: string
  sub?: string
  t?: string
  cls?: string
}
interface Book {
  id: string
  title: string
  cover: string
  pages: Page[]
  artH: number
  /** the back cover: a blurb, who said it, the imprint, its colours */
  blurb: string
  by: string
  imprint: string
  bg: string
  fg: string
  /** what you say walking out with it */
  line: string
}

// ---------- drawing helpers ----------
const svg = (w: number, h: number, body: string, cls = '') => `<svg class="${cls}" viewBox="0 0 ${w} ${h}" aria-hidden="true">${body}</svg>`
const tx = (x: number, y: number, s: string, a = '') => `<text x="${x}" y="${y}" ${a}>${s}</text>`
const rnd = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646

/** a city pigeon, feet at (x, y), facing right */
const pigeon = (x: number, y: number, s = 1, flip = false, extra = '') => `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})">
<path d="M-27 -24 L-46 -13 L-26 -12Z" fill="#5d6a80" stroke="#2b3142" stroke-width="1.4" stroke-linejoin="round"/>
<ellipse cx="-6" cy="-22" rx="24" ry="15" fill="#a3aec2" stroke="#2b3142" stroke-width="1.6"/>
<path d="M-25 -25 Q-6 -35 11 -22 Q-6 -11 -25 -17Z" fill="#7f8ba2"/>
<path d="M-15 -28 l9 12 M-6 -30 l9 12" stroke="#3b4458" stroke-width="2.6" stroke-linecap="round"/>
<path d="M8 -29 Q11 -48 21 -52 Q31 -48 27 -36 Q23 -23 12 -19Z" fill="#5f9486" stroke="#2b3142" stroke-width="1.6"/>
<path d="M12 -29 Q17 -35 26 -36" stroke="#a487c9" stroke-width="2.6" fill="none" stroke-linecap="round"/>
<circle cx="24" cy="-51" r="8.5" fill="#96a2b8" stroke="#2b3142" stroke-width="1.6"/>
<path d="M31.5 -53.5 l9.5 3.5 l-9.5 2.5Z" fill="#3b4458"/><circle cx="32" cy="-54" r="1.5" fill="#fff"/>
<circle cx="26" cy="-53" r="2.7" fill="#f28c28"/><circle cx="26.5" cy="-53" r="1.2" fill="#111"/>
<path d="M-5 -8 V0 h5 M4 -8 V0 h5" stroke="#d9687a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
${extra}</g>`

// ---------- 1. Goodnight, Radiator (a bedtime picture book) ----------
const N1 = { wall: '#2a3570', deep: '#1d2552', floor: '#4a3566', cream: '#f1e2b8', moon: '#ffe08a', ink: '#141a3c', glass: '#3d52a8' }
const room1 = (s: string) => `<rect width="184" height="150" fill="${N1.wall}"/><rect y="120" width="184" height="30" fill="${N1.floor}"/>${s}`
const rad1 = (x: number, y: number, n = 6, w = 11, h = 42) =>
  Array.from({ length: n }, (_, i) => `<rect x="${x + i * (w + 2)}" y="${y}" width="${w}" height="${h}" rx="${w / 2.4}" fill="#e8dcc0" stroke="${N1.ink}" stroke-width="1.6"/>`).join('') +
  `<path d="M${x + 4} ${y + h} v5 M${x + n * (w + 2) - 6} ${y + h} v5" stroke="${N1.ink}" stroke-width="3.4" stroke-linecap="round"/>` +
  `<path d="M${x + n * (w + 2) - 2} ${y + h - 9} h9 v14" stroke="#b9ad90" stroke-width="3" fill="none"/><circle cx="${x + n * (w + 2) + 7}" cy="${y + h - 9}" r="3.6" fill="#d2553f" stroke="${N1.ink}" stroke-width="1.2"/>`
const win1 = (x: number, y: number, w: number, h: number, inner = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${N1.glass}"/>${inner}<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${N1.cream}" stroke-width="4"/>` +
  `<path d="M${x + w / 2} ${y}v${h}M${x} ${y + h / 2}h${w}" stroke="${N1.cream}" stroke-width="2.5"/><rect x="${x - 5}" y="${y + h - 1}" width="${w + 10}" height="5" rx="1.5" fill="${N1.cream}"/>`
const moon1 = (x: number, y: number, r = 9, bg = N1.glass) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${N1.moon}"/><circle cx="${x + r * 0.5}" cy="${y - r * 0.3}" r="${r * 0.85}" fill="${bg}"/>`
const skyline1 = () => {
  const r = rnd(7)
  let s = `<rect width="184" height="150" fill="${N1.deep}"/>${moon1(150, 26, 12, N1.deep)}`
  for (let i = 0; i < 14; i++) s += `<circle cx="${(r() * 130).toFixed(0)}" cy="${(r() * 50 + 6).toFixed(0)}" r="${r() > 0.6 ? 1.3 : 0.8}" fill="#fff3c9"/>`
  let x = 0
  while (x < 184) {
    const w = 16 + Math.floor(r() * 14)
    const h = 40 + Math.floor(r() * 62)
    s += `<rect x="${x}" y="${150 - h}" width="${w}" height="${h}" fill="${N1.ink}"/>`
    for (let wy = 150 - h + 6; wy < 144; wy += 9) for (let wx = x + 4; wx < x + w - 4; wx += 7) if (r() > 0.45) s += `<rect x="${wx}" y="${wy}" width="3.4" height="4.6" fill="${N1.moon}"/>`
    x += w + 2
  }
  return s
}
const B1: Book = {
  id: 'radiator',
  title: 'Goodnight, Radiator',
  artH: 150,
  bg: '#1c2658',
  fg: '#fff3c9',
  blurb: '“I fell asleep. Then the radiator did not.”',
  by: 'A reader in 4B',
  imprint: 'Stoop Kids Press',
  line: 'A bedtime story. The radiator will read along.',
  cover: svg(
    220,
    320,
    `<rect width="220" height="320" fill="#1c2658"/>
<g fill="#fff3c9"><circle cx="22" cy="118" r="1.5"/><circle cx="40" cy="170" r="1"/><circle cx="196" cy="112" r="1.4"/><circle cx="182" cy="176" r="1"/><circle cx="30" cy="222" r="1.2"/><circle cx="198" cy="232" r="1.3"/></g>
${tx(110, 46, 'Goodnight,', 'text-anchor="middle" class="bk-f-geo" font-style="italic" font-size="27" fill="#ffd76a"')}
${tx(110, 86, 'Radiator', 'text-anchor="middle" class="bk-f-geo" font-weight="700" font-size="41" fill="#fff3c9"')}
<rect x="68" y="106" width="84" height="88" fill="#3d52a8"/>
${moon1(128, 130, 13)}
<path d="M68 194 v-22 h12 v-12 h10 v18 h12 v-26 h9 v20 h14 v-10 h12 v16 h5 v16z" fill="#141a3c"/>
<g fill="#ffe08a"><rect x="83" y="166" width="3" height="4"/><rect x="105" y="160" width="3" height="4"/><rect x="105" y="172" width="3" height="4"/><rect x="128" y="176" width="3" height="4"/><rect x="72" y="180" width="3" height="4"/></g>
<rect x="68" y="106" width="84" height="88" fill="none" stroke="#f1e2b8" stroke-width="5"/><path d="M110 106v88M68 150h84" stroke="#f1e2b8" stroke-width="3"/>
<rect x="60" y="192" width="100" height="7" rx="2" fill="#f1e2b8"/>
<rect y="262" width="220" height="58" fill="#3b2a55"/>
<g transform="translate(60 212)">${Array.from({ length: 7 }, (_, i) => `<rect x="${i * 14}" y="0" width="12" height="50" rx="5" fill="#e8dcc0" stroke="#141a3c" stroke-width="1.8"/>`).join('')}<path d="M4 50v6M92 50v6" stroke="#141a3c" stroke-width="4" stroke-linecap="round"/><path d="M98 40h10v18" stroke="#b9ad90" stroke-width="3.4" fill="none"/><circle cx="108" cy="40" r="4.4" fill="#d2553f" stroke="#141a3c" stroke-width="1.4"/></g>
<path d="M48 214 l-8 -7 M44 228 h-10 M50 202 l-4 -10" stroke="#ffd76a" stroke-width="2.4" stroke-linecap="round"/>
${tx(110, 292, 'DEE LANCEY', 'text-anchor="middle" class="bk-f-geo" font-size="11.5" letter-spacing="3" fill="#f1e2b8"')}
<path d="M101 302 h6 v-3 h6 v-3 h6 v9 h-18z" fill="#ffd76a"/>${tx(110, 314, 'STOOP KIDS PRESS', 'text-anchor="middle" class="bk-f-geo" font-size="5.6" letter-spacing="1.6" fill="#f1e2b8"')}`,
    'bk-cover',
  ),
  pages: [
    { art: room1(win1(62, 16, 60, 54, moon1(105, 33)) + rad1(51, 80)), t: 'In the small apartment there was a radiator.' },
    {
      art: room1(rad1(34, 52, 8, 12, 62) + `<path d="M26 50 l-9 -8 M22 66 h-11 M160 48 l9 -8 M164 66 h10" stroke="${N1.moon}" stroke-width="2.6" stroke-linecap="round"/>` + tx(92, 34, 'clank. clank.', `text-anchor="middle" class="bk-f-geo" font-style="italic" font-weight="700" font-size="17" fill="${N1.moon}"`)),
      t: 'Goodnight, radiator, clanking.',
    },
    {
      art: `<rect width="184" height="150" fill="${N1.wall}"/><rect width="184" height="44" fill="${N1.deep}"/><path d="M0 44h184" stroke="${N1.cream}" stroke-width="3"/>
<rect x="70" y="8" width="44" height="36" rx="3" fill="#0e1230" stroke="${N1.cream}" stroke-width="1.6"/><circle cx="92" cy="30" r="9" fill="${N1.wall}" stroke="${N1.cream}" stroke-width="1.6"/><circle cx="92" cy="30" r="3" fill="${N1.cream}"/><circle cx="92" cy="14" r="2.6" fill="${N1.cream}"/>
<g fill="none" stroke="${N1.moon}" stroke-width="2.6" stroke-linecap="round"><path d="M66 56 Q92 70 118 56"/><path d="M52 68 Q92 90 132 68" opacity=".7"/><path d="M40 82 Q92 110 144 82" opacity=".4"/></g>
<g transform="rotate(9 150 44)"><path d="M150 44v26" stroke="${N1.cream}" stroke-width="1.6"/><path d="M138 82 q12 -20 24 0z" fill="${N1.moon}" stroke="${N1.ink}" stroke-width="1.4"/></g>
<rect y="124" width="184" height="26" fill="${N1.floor}"/><rect x="18" y="104" width="86" height="22" rx="5" fill="${N1.cream}" stroke="${N1.ink}" stroke-width="1.6"/><ellipse cx="38" cy="103" rx="17" ry="8" fill="#fff" stroke="${N1.ink}" stroke-width="1.6"/><path d="M52 106 Q76 86 104 108v10H52z" fill="#d2553f" stroke="${N1.ink}" stroke-width="1.6"/>`,
      t: 'Goodnight, upstairs neighbor’s bass.',
    },
    {
      art: room1(
        win1(44, 14, 96, 84, moon1(64, 34, 8)) +
          `<rect x="62" y="64" width="60" height="34" rx="3" fill="#cfd3d8" stroke="${N1.ink}" stroke-width="1.8"/><path d="M68 72h36M68 78h36M68 84h36M68 90h36" stroke="#8d949e" stroke-width="1.6"/><circle cx="113" cy="74" r="2.6" fill="#8d949e"/>` +
          pigeon(92, 64, 0.62) +
          `<path d="M70 104v5M70 113v4" stroke="#8fd0ff" stroke-width="2.2" stroke-linecap="round"/>`,
      ),
      t: 'Goodnight, pigeon on the air conditioner.',
    },
    {
      art: room1(
        win1(62, 16, 60, 58, `<rect x="62" y="16" width="30" height="58" fill="#e23b3b" opacity=".75"/><rect x="92" y="16" width="30" height="58" fill="#3b8be2" opacity=".75"/>`) +
          `<polygon points="62,80 92,80 74,150 4,150" fill="#e23b3b" opacity=".38"/><polygon points="92,80 122,80 180,150 110,150" fill="#3b8be2" opacity=".38"/>`,
      ),
      t: 'Goodnight, sirens.',
    },
    {
      art: `<rect width="184" height="150" fill="${N1.deep}"/><rect x="0" y="20" width="60" height="96" fill="${N1.ink}"/><rect x="124" y="34" width="60" height="82" fill="${N1.ink}"/><g fill="${N1.moon}"><rect x="10" y="32" width="8" height="10"/><rect x="36" y="56" width="8" height="10"/><rect x="140" y="48" width="8" height="10"/></g>
<rect y="116" width="184" height="34" fill="#2b2f4a"/><path d="M0 134h20M34 134h20M68 134h20M102 134h20M136 134h20M170 134h14" stroke="${N1.cream}" stroke-width="2" opacity=".5"/>
<path d="M38 116 v-14 q0 -6 8 -7 l14 -2 l13 -17 h38 l13 17 l14 2 q8 1 8 7 v14z" fill="#d2553f" stroke="${N1.ink}" stroke-width="2"/><path d="M66 92 l9 -12 h15 v12z M96 80 h14 l9 12 h-23z" fill="#9fc4ff" stroke="${N1.ink}" stroke-width="1.6"/>
<circle cx="64" cy="116" r="10" fill="${N1.ink}"/><circle cx="64" cy="116" r="4" fill="#8d949e"/><circle cx="122" cy="116" r="10" fill="${N1.ink}"/><circle cx="122" cy="116" r="4" fill="#8d949e"/>
<circle cx="42" cy="102" r="3.4" fill="${N1.moon}"/><circle cx="142" cy="102" r="3.4" fill="${N1.moon}"/>
<g fill="none" stroke="${N1.moon}" stroke-width="2.6" stroke-linecap="round"><path d="M76 62 Q92 52 108 62"/><path d="M66 50 Q92 34 118 50" opacity=".7"/><path d="M56 38 Q92 16 128 38" opacity=".4"/><path d="M30 96l-10 -4M30 104h-11M154 96l10 -4M154 104h11"/></g>`,
      t: 'Goodnight, car alarm nobody owns.',
    },
    {
      art: room1(
        `<rect x="26" y="62" width="132" height="40" rx="10" fill="#7a5aa0" stroke="${N1.ink}" stroke-width="1.8"/><rect x="18" y="80" width="18" height="38" rx="7" fill="#8d6bb5" stroke="${N1.ink}" stroke-width="1.8"/><rect x="148" y="80" width="18" height="38" rx="7" fill="#8d6bb5" stroke="${N1.ink}" stroke-width="1.8"/>
<rect x="34" y="96" width="116" height="20" rx="4" fill="${N1.cream}" stroke="${N1.ink}" stroke-width="1.8"/><ellipse cx="128" cy="94" rx="16" ry="8" fill="#fff" stroke="${N1.ink}" stroke-width="1.6"/><path d="M40 98 Q78 66 116 98 v14 H40z" fill="#d2553f" stroke="${N1.ink}" stroke-width="1.8"/>
<path d="M30 118v8M154 118v8" stroke="${N1.ink}" stroke-width="4" stroke-linecap="round"/>` +
          tx(124, 62, 'z', `class="bk-f-geo" font-style="italic" font-weight="700" font-size="13" fill="${N1.moon}"`) +
          tx(136, 46, 'z', `class="bk-f-geo" font-style="italic" font-weight="700" font-size="17" fill="${N1.moon}"`) +
          tx(150, 28, 'z', `class="bk-f-geo" font-style="italic" font-weight="700" font-size="22" fill="${N1.moon}"`),
      ),
      t: 'Goodnight, bed that is also the couch.',
    },
    { art: skyline1(), t: 'Goodnight, city that never does.' },
  ],
}

// ---------- 2. How to Fold a Slice (an illustrated manual) ----------
const INK2 = '#1c4e9a'
const OR2 = '#e4572e'
const g2 = (s: string) => `<g fill="none" stroke="${INK2}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round">${s}</g>`
const lab2 = (x: number, y: number, s: string, anchor = 'start', fill = INK2) => tx(x, y, s, `class="bk-f-cour" font-size="8" font-weight="700" letter-spacing=".6" text-anchor="${anchor}" fill="${fill}"`)
const slice2 = (extra = '') =>
  `<path d="M44 34 L140 34 L96 128 Q92 134 88 128Z" fill="#fff3cf"/><path d="M40 30 Q92 14 144 30 L140 42 Q92 28 44 42Z" fill="#f0c987"/>${extra}<circle cx="80" cy="60" r="3" fill="${OR2}" stroke="none" opacity=".55"/><circle cx="102" cy="76" r="2.4" fill="${OR2}" stroke="none" opacity=".55"/><circle cx="90" cy="98" r="2" fill="${OR2}" stroke="none" opacity=".55"/>`
const plate2 = (cx: number, cy: number, rx = 62, ry = 20) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff"/><ellipse cx="${cx}" cy="${cy - 1.5}" rx="${rx * 0.7}" ry="${ry * 0.62}"/>` +
  Array.from({ length: 14 }, (_, i) => {
    const a = (i / 14) * Math.PI * 2
    return `<path d="M${(cx + Math.cos(a) * rx * 0.76).toFixed(1)} ${(cy + Math.sin(a) * ry * 0.7).toFixed(1)} L${(cx + Math.cos(a) * rx * 0.95).toFixed(1)} ${(cy + Math.sin(a) * ry * 0.93).toFixed(1)}" stroke-width="1"/>`
  }).join('')
const B2: Book = {
  id: 'slice',
  title: 'How to Fold a Slice',
  artH: 150,
  bg: '#e4572e',
  fg: '#fff8ea',
  blurb: '“Clear, practical, slightly greasy.”',
  by: 'The Corner Review',
  imprint: 'Corner Press',
  line: 'Finally, a manual I will use.',
  cover: svg(
    220,
    320,
    `<rect width="220" height="320" fill="#f3ecd9"/>
<path d="${Array.from({ length: 19 }, (_, i) => `M${(i + 1) * 11} 34V320`).join('')}${Array.from({ length: 25 }, (_, i) => `M0 ${45 + i * 11}H220`).join('')}" stroke="${INK2}" stroke-width=".6" opacity=".16"/>
<rect width="220" height="34" fill="${OR2}"/>
${tx(16, 21.5, 'TECHNICAL MANUAL', 'class="bk-f-fut" font-size="9.5" font-weight="700" letter-spacing="2.4" fill="#fff8ea"')}
${tx(204, 21.5, 'No. 99', 'class="bk-f-fut" font-size="9.5" font-weight="700" letter-spacing="1" text-anchor="end" fill="#fff8ea"')}
${tx(15, 64, 'HOW TO', 'class="bk-f-fut" font-size="17" font-weight="700" letter-spacing="3" fill="#1b1b1b"')}
${tx(13, 108, 'FOLD', 'class="bk-f-fut" font-size="50" font-weight="700" letter-spacing="1" fill="#1b1b1b"')}
${tx(14, 144, 'A SLICE', 'class="bk-f-fut" font-size="33" font-weight="700" letter-spacing="1" fill="${OR2}"')}
<g transform="translate(18 148)" fill="none" stroke="${INK2}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">
<path d="M44 34 L140 34 L96 128 Q92 134 88 128Z" fill="#fff3cf"/><path d="M40 30 Q92 14 144 30 L140 42 Q92 28 44 42Z" fill="#f0c987"/>
<path d="M92 16V140" stroke="${OR2}" stroke-dasharray="5 4"/>
<path d="M30 78 Q44 60 58 74" /><path d="M58 74 l-8 -1 M58 74 l-2 -8"/><path d="M154 78 Q140 60 126 74"/><path d="M126 74 l8 -1 M126 74 l2 -8"/>
<path d="M40 8H144M40 4v8M144 4v8" stroke-width="1.2"/></g>
${lab2(160, 300, 'FIG. 1')}
${tx(16, 307, 'G. VANNUCCI, P.E.', 'class="bk-f-fut" font-size="9.5" font-weight="700" letter-spacing="1.6" fill="#1b1b1b"')}
<rect x="170" y="268" width="34" height="20" fill="none" stroke="#1b1b1b" stroke-width="1.2"/>${tx(187, 276.5, 'CORNER', 'class="bk-f-fut" font-size="5.2" font-weight="700" letter-spacing=".8" text-anchor="middle" fill="#1b1b1b"')}${tx(187, 284, 'PRESS', 'class="bk-f-fut" font-size="5.2" font-weight="700" letter-spacing=".8" text-anchor="middle" fill="#1b1b1b"')}`,
    'bk-cover',
  ),
  pages: [
    {
      art: g2(slice2() + `<path d="M140 22h10M100 126 h28" stroke-width="1"/><path d="M70 122 Q62 134 74 140" stroke="${OR2}"/><path d="M74 140l-7 -1M74 140l-2 -7" stroke="${OR2}"/>`) + lab2(153, 25, 'CRUST', 'start') + lab2(130, 129, 'TIP') + lab2(34, 142, 'DROOP', 'start', OR2),
      h: 'Fig. 1',
      t: 'The plain slice. Note the droop.',
    },
    {
      art: g2(plate2(92, 92, 70, 24) + `<path d="M58 60 L124 54 L150 112 Q150 118 144 116Z" fill="#fff3cf"/><path d="M54 62 Q88 46 126 50 L124 60 Q90 56 58 70Z" fill="#f0c987"/>`) + lab2(92, 16, 'RATED: 1 SLICE', 'middle'),
      h: 'Fig. 2',
      t: 'The paper plate. It is doing its best.',
    },
    {
      art:
        g2(
          `<g transform="translate(-22 0)">${slice2(`<path d="M92 18V140" stroke="${OR2}" stroke-dasharray="5 4"/>`)}<path d="M34 80 Q46 64 58 76"/><path d="M58 76l-8 -1M58 76l-2 -8"/><path d="M150 80 Q138 64 126 76"/><path d="M126 76l8 -1M126 76l2 -8"/></g>
<path d="M136 58 Q156 112 176 58" stroke-width="5" stroke="#f0c987"/><path d="M136 58 Q156 112 176 58"/><path d="M132 50v-10M180 50v-10M132 44h48" stroke-width="1"/>`,
        ) + lab2(156, 124, 'SECTION A', 'middle'),
      h: 'Fig. 3',
      t: 'The fold. Pinch the crust. The tip stands up.',
    },
    {
      art:
        g2(
          `<path d="M20 52H170" stroke-dasharray="4 4" stroke-width="1"/><g transform="rotate(15 30 52)"><path d="M30 44 L150 50 Q156 52 150 54 L30 60Z" fill="#fff3cf"/><path d="M24 40 h10 v24 h-10z" fill="#f0c987"/></g>
<path d="M152 92v4M154 102v5M151 113v3" stroke="${OR2}" stroke-width="2.6"/>${plate2(138, 132, 40, 11)}`,
        ) + lab2(128, 46, '15°', 'start', OR2),
      h: 'Fig. 4',
      t: 'The grease tilt. Fifteen degrees. Away from the shirt.',
    },
    {
      art:
        g2(
          `<path d="M8 136 L70 20 M176 136 L114 20" stroke-width="1"/><path d="M30 96H154M48 62H136M60 40H124" stroke-width=".8" opacity=".5"/>
${[
  [70, 128, -12],
  [102, 108, 12],
  [78, 86, -10],
  [100, 68, 10],
  [84, 52, -8],
  [98, 38, 8],
]
  .map(([x, y, r], i) => `<ellipse cx="${x}" cy="${y}" rx="${7 - i * 0.7}" ry="${12 - i * 1.2}" transform="rotate(${r} ${x} ${y})" fill="${INK2}" opacity="${0.9 - i * 0.1}"/>`)
  .join('')}
<path d="M150 112 V60" stroke="${OR2}" stroke-width="2.4"/><path d="M150 58 l-6 9 M150 58 l6 9" stroke="${OR2}" stroke-width="2.4"/>`,
        ) + lab2(92, 14, 'DO NOT STOP', 'middle', OR2),
      h: 'Fig. 5',
      t: 'The walk and eat. People are behind you.',
    },
    {
      art:
        g2(`<g transform="rotate(-6 92 76)"><rect x="50" y="34" width="84" height="84" fill="#fff"/><rect x="56" y="40" width="72" height="72" stroke-dasharray="2 4" stroke-width="1"/></g>
<g stroke="none" fill="${OR2}"><circle cx="80" cy="66" r="13" opacity=".3"/><circle cx="104" cy="88" r="17" opacity=".25"/><circle cx="76" cy="96" r="8" opacity=".3"/><circle cx="110" cy="58" r="6" opacity=".3"/></g>`) + lab2(92, 140, '1 PLY', 'middle'),
      h: 'Fig. 6',
      t: 'One napkin. It will not be enough. Take one anyway.',
    },
    {
      art: g2(
        `<path d="M68 30v26q0 8 6 9v54M62 30v20M74 30v20M80 30v26q0 8 -6 9" stroke-width="3"/><path d="M112 119V30q14 12 12 40h-12" stroke-width="3" fill="#dfe8f6"/>
<circle cx="92" cy="75" r="60" stroke="${OR2}" stroke-width="7"/><path d="M50 33L134 117" stroke="${OR2}" stroke-width="7"/>`,
      ),
      h: 'Fig. 7',
      t: 'Never.',
    },
    {
      art:
        g2(`${plate2(92, 66, 66, 24)}<ellipse cx="88" cy="64" rx="24" ry="8" stroke="${OR2}" stroke-dasharray="3 3" opacity=".8"/><g stroke="none" fill="#c98f3a"><circle cx="70" cy="60" r="1.6"/><circle cx="106" cy="70" r="1.8"/><circle cx="96" cy="58" r="1.3"/><circle cx="80" cy="72" r="1.4"/></g>
<path d="M22 122H162M22 116v12M162 116v12M57 119v6M92 119v6M127 119v6" stroke-width="1.2"/>`) + lab2(92, 142, '4 BLOCKS', 'middle'),
      h: 'Fig. 8',
      t: 'Done. Elapsed distance: four blocks.',
    },
  ],
}

// ---------- 3. Stand Clear of the Closing Doors (a literary memoir) ----------
const INK3 = '#22201c'
const OR3 = '#f08a24'
const car3 = (extra = '') =>
  `<rect x="20" y="24" width="140" height="38" rx="7" fill="#c9ced6" stroke="${INK3}" stroke-width="1.8"/><path d="M20 50h140" stroke="${INK3}" stroke-width="1.2"/>${[29, 60, 96, 127].map((x) => `<rect x="${x}" y="30" width="24" height="15" rx="3" fill="#ffe9a8" stroke="${INK3}" stroke-width="1.4"/>`).join('')}<circle cx="46" cy="64" r="4.5" fill="${INK3}"/><circle cx="134" cy="64" r="4.5" fill="${INK3}"/>${extra}`
const B3: Book = {
  id: 'doors',
  title: 'Stand Clear of the Closing Doors',
  artH: 76,
  bg: '#2a2f38',
  fg: '#f1ebdd',
  blurb: '“Devastating. I missed my stop.”',
  by: 'A commuter',
  imprint: 'Local Stop Editions',
  line: 'Something to read while the train is 11 minutes away.',
  cover: svg(
    220,
    320,
    `<rect width="220" height="320" fill="#f1ebdd"/>
${tx(110, 30, 'A MEMOIR', 'text-anchor="middle" class="bk-f-fut" font-size="8" letter-spacing="4.5" fill="#8a7f6a"')}
${tx(110, 70, 'Stand Clear', 'text-anchor="middle" class="bk-f-didot" font-size="33" fill="#1d1b18"')}
${tx(110, 93, 'of the', 'text-anchor="middle" class="bk-f-didot" font-style="italic" font-size="16" fill="#1d1b18"')}
${tx(110, 126, 'Closing Doors', 'text-anchor="middle" class="bk-f-didot" font-size="31" fill="#1d1b18"')}
<path d="M96 141h28" stroke="${OR3}" stroke-width="2"/>
${tx(110, 161, 'DELIA CANAL', 'text-anchor="middle" class="bk-f-fut" font-size="9.5" letter-spacing="4" fill="#1d1b18"')}
<rect y="178" width="220" height="142" fill="#15161c"/>
<rect x="100" y="178" width="20" height="130" fill="${OR3}"/><rect x="106" y="178" width="8" height="130" fill="#ffd9a0"/>
<rect x="0" y="178" width="101" height="130" fill="#8791a0"/><rect x="119" y="178" width="101" height="130" fill="#8791a0"/>
<rect x="97" y="178" width="5" height="130" fill="#15161c"/><rect x="118" y="178" width="5" height="130" fill="#15161c"/>
<rect x="26" y="194" width="52" height="64" rx="9" fill="#262d39" stroke="#5c6675" stroke-width="3"/><rect x="142" y="194" width="52" height="64" rx="9" fill="#262d39" stroke="#5c6675" stroke-width="3"/>
<path d="M34 250 L62 202 M152 250 L180 202" stroke="#3a4352" stroke-width="5" stroke-linecap="round"/>
<path d="M0 280h97M123 280h97" stroke="#6f7988" stroke-width="1.4"/>
<rect y="306" width="220" height="14" fill="#f2c230"/><g fill="#c99a12">${Array.from({ length: 18 }, (_, i) => `<circle cx="${8 + i * 12}" cy="313" r="2.2"/>`).join('')}</g>`,
    'bk-cover',
  ),
  pages: [
    { h: 'Chapter 1', t: 'I ran.', art: `<path d="M36 34h46M26 46h62M40 58h40" stroke="${INK3}" stroke-width="2.4" stroke-linecap="round"/><path d="M100 60 q0 -20 14 -22 l10 10 q16 2 22 8 q4 4 2 8 h-46 q-3 0 -2 -4z" fill="${INK3}"/><path d="M100 60h48" stroke="#f6f1e4" stroke-width="2"/><path d="M116 44l6 -5M122 49l6 -5" stroke="#f6f1e4" stroke-width="1.6"/>` },
    {
      h: 'Chapter 2',
      t: 'The doors closed.',
      art: `<rect x="58" y="8" width="33" height="62" fill="#8791a0" stroke="${INK3}" stroke-width="1.8"/><rect x="93" y="8" width="33" height="62" fill="#8791a0" stroke="${INK3}" stroke-width="1.8"/><rect x="65" y="16" width="19" height="26" rx="5" fill="#262d39"/><rect x="100" y="16" width="19" height="26" rx="5" fill="#262d39"/><path d="M44 30l8 9l-8 9M140 30l-8 9l8 9" fill="none" stroke="${OR3}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`,
    },
    {
      h: 'Chapter 3',
      t: 'The next train was in 11 minutes.',
      art: `<path d="M60 0v14M124 0v14" stroke="${INK3}" stroke-width="2"/><rect x="34" y="14" width="116" height="42" rx="5" fill="#15161c"/>${tx(92, 43, '11 min', `text-anchor="middle" class="bk-f-cour" font-weight="700" font-size="22" fill="${OR3}"`)}`,
    },
    {
      h: 'Chapter 4',
      t: 'It was Showtime. I looked at my shoes.',
      art: `<path d="M92 0V76" stroke="#8791a0" stroke-width="5"/><path d="M92 0V76" stroke="#d5dae2" stroke-width="1.6"/><g fill="none" stroke="${OR3}" stroke-width="2.4" stroke-linecap="round"><path d="M62 18 Q92 2 122 18"/><path d="M122 18l-9 -1M122 18l-3 -8"/><path d="M122 44 Q92 60 62 44"/><path d="M62 44l9 1M62 44l3 8"/></g><path d="M22 58 h36 q-2 14 -18 14 q-16 0 -18 -14z" fill="${INK3}"/><path d="M16 58h48" stroke="${INK3}" stroke-width="3" stroke-linecap="round"/><circle cx="40" cy="50" r="5" fill="#f2c230" stroke="${INK3}" stroke-width="1.4"/>`,
    },
    { h: 'Chapter 5', t: 'One car was empty. On a hot day.', art: car3(`<circle cx="170" cy="9" r="7.5" fill="${OR3}"/><path d="M156 9h-6M160 19l-4 4M170 22v5" stroke="${OR3}" stroke-width="2.2" stroke-linecap="round"/>`) },
    {
      h: 'Chapter 6',
      t: 'Never get in the empty car.',
      art: car3(`<g fill="none" stroke="#7d8f3c" stroke-width="2.4" stroke-linecap="round"><path d="M50 18 q-5 -5 0 -9 q5 -4 0 -9"/><path d="M92 18 q-5 -5 0 -9 q5 -4 0 -9"/><path d="M134 18 q-5 -5 0 -9 q5 -4 0 -9"/></g>`),
    },
    {
      h: 'Chapter 7',
      t: 'The express went local. The announcement was a sound.',
      art: `<path d="M16 50H168" stroke="${INK3}" stroke-width="3" stroke-linecap="round"/>${[16, 46, 76, 106, 136, 166].map((x) => `<circle cx="${x}" cy="50" r="5" fill="#f6f1e4" stroke="${INK3}" stroke-width="2.2"/>`).join('')}<path d="M16 42 q15 -26 30 0 q15 -26 30 0 q15 -26 30 0 q15 -26 30 0 q15 -26 30 0" fill="none" stroke="${OR3}" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="1 5"/><circle cx="16" cy="50" r="2.4" fill="${OR3}"/>`,
    },
    {
      h: 'Chapter 8',
      t: 'I got a seat. It was my stop.',
      art: `<path d="M66 12 q-4 0 -4 5 v34 q0 6 6 6 h48 q6 0 6 -6 v-6 q0 -5 -5 -5 h-30 q-5 0 -5 -5 v-18 q0 -5 -4 -5z" fill="${OR3}" stroke="${INK3}" stroke-width="1.8" stroke-linejoin="round"/><path d="M70 57v12M114 57v12" stroke="${INK3}" stroke-width="3" stroke-linecap="round"/><path d="M134 18v12M128 24h12M146 40v8M142 44h8" stroke="${INK3}" stroke-width="1.8" stroke-linecap="round"/>`,
    },
  ],
}

// ---------- 4. Pigeons of Manhattan: A Field Guide ----------
const INK4 = '#2b3142'
const plate4 = (s: string) => `<rect width="184" height="208" fill="#fbf6e6"/>${s}`
const B4: Book = {
  id: 'pigeons',
  title: 'Pigeons of Manhattan',
  artH: 208,
  bg: '#1f4a3a',
  fg: '#f1e7c6',
  blurb: '“At last, a bird book with one bird.”',
  by: 'Stoop Quarterly',
  imprint: 'Sidewalk Naturalist Library',
  line: 'Now I can name the one on my air conditioner.',
  cover: svg(
    220,
    320,
    `<rect width="220" height="320" fill="#1f4a3a"/><rect x="8" y="8" width="204" height="304" fill="none" stroke="#e9dfbf" stroke-width="1.2"/><rect x="11.5" y="11.5" width="197" height="297" fill="none" stroke="#c9a94e" stroke-width=".7"/>
${tx(111.5, 56, 'PIGEONS', 'text-anchor="middle" class="bk-f-gill" font-weight="700" font-size="35" letter-spacing="3" fill="#f1e7c6"')}
${tx(112, 77, 'OF MANHATTAN', 'text-anchor="middle" class="bk-f-gill" font-size="12.5" letter-spacing="4.4" fill="#f1e7c6"')}
<rect x="36" y="90" width="148" height="152" fill="#f1e7c6"/>
<g><path d="M40 206 v-40 h14 v-16 h12 v26 h10 v-40 h12 v40 h44 v-28 h14 v16 h12 v-22 h10 v64z" fill="#d8cca4"/><rect x="40" y="206" width="140" height="36" fill="#a9825a"/><path d="M40 206h140" stroke="#2b3142" stroke-width="1.8"/><path d="M60 206v36M96 206v36M132 206v36M168 206v36M40 222h140" stroke="#7a5a3a" stroke-width="1"/>${pigeon(108, 206, 1.45)}</g>
<path fill-rule="evenodd" d="M30 84h160v164h-160z M40 166a70 74 0 1 0 140 0a70 74 0 1 0 -140 0z" fill="#1f4a3a"/><ellipse cx="110" cy="166" rx="70" ry="74" fill="none" stroke="#c9a94e" stroke-width="3"/>
${tx(110, 266, 'A Field Guide', 'text-anchor="middle" class="bk-f-bask" font-style="italic" font-size="17" fill="#f1e7c6"')}
${tx(111.5, 286, 'R. T. STOOP', 'text-anchor="middle" class="bk-f-gill" font-size="9.5" letter-spacing="3.4" fill="#f1e7c6"')}
${tx(111, 302, 'SIDEWALK NATURALIST LIBRARY', 'text-anchor="middle" class="bk-f-gill" font-size="5.4" letter-spacing="1.8" fill="#c9a94e"')}`,
    'bk-cover',
  ),
  pages: [
    {
      cls: 'plate',
      art: plate4(
        `<rect y="150" width="184" height="58" fill="#5a606e"/>${[8, 46, 84, 122, 160].map((x) => `<polygon points="${x},208 ${x + 22},208 ${x + 16},150 ${x + 4},150" fill="#fbf6e6"/>`).join('')}<path d="M0 150h184" stroke="${INK4}" stroke-width="1.8"/>
<path d="M18 96h34M10 112h30M22 128h26" stroke="${INK4}" stroke-width="2.2" stroke-linecap="round" opacity=".55"/>` +
          pigeon(104, 172, 1.5, false, `<path d="M15 -31 l5 4 l-3 13 l-6 -11z" fill="#c8483a" stroke="${INK4}" stroke-width="1"/><rect x="-26" y="-13" width="17" height="12" rx="2" fill="#7a5230" stroke="${INK4}" stroke-width="1.3"/><path d="M-21 -13 v-3 h7 v3" fill="none" stroke="${INK4}" stroke-width="1.3"/>`),
      ),
      h: 'Plate I',
    },
    { cls: 'entry', h: 'The Commuter', sub: 'Columba festinans', t: 'Walks. Never flies. Always late. Habitat: the crosswalk, against the light.' },
    {
      cls: 'plate',
      art: plate4(
        `<rect x="92" y="18" width="70" height="112" fill="#5a3b1e" stroke="${INK4}" stroke-width="1.8"/><rect x="102" y="28" width="50" height="40" rx="2" fill="#7a5230"/><rect x="102" y="76" width="50" height="46" rx="2" fill="#7a5230"/><circle cx="150" cy="80" r="3" fill="#c9a94e"/>
${[0, 1, 2].map((i) => `<rect x="${20 + i * 22}" y="${130 + i * 24}" width="${164 - i * 22 - 20}" height="24" fill="${['#b9825a', '#c08a62', '#c9946b'][i]}" stroke="${INK4}" stroke-width="1.8"/>`).join('')}<rect x="0" y="202" width="184" height="6" fill="#8d949e"/>
<path d="M26 130V78M26 78 L78 78" stroke="${INK4}" stroke-width="3" stroke-linecap="round" fill="none"/>` + pigeon(96, 154, 1.2),
      ),
      h: 'Plate II',
    },
    { cls: 'entry', h: 'The Regular', sub: 'Columba cotidiana', t: 'Same stoop, daily. Knows your schedule. Has opinions about it.' },
    {
      cls: 'plate',
      art: plate4(
        `<rect x="0" y="146" width="184" height="12" fill="#3f6b4a" stroke="${INK4}" stroke-width="1.6"/><rect x="0" y="162" width="184" height="12" fill="#3f6b4a" stroke="${INK4}" stroke-width="1.6"/><path d="M24 174v34M160 174v34" stroke="${INK4}" stroke-width="5"/>
<circle cx="44" cy="126" r="21" fill="#d9a25a" stroke="${INK4}" stroke-width="1.8"/><circle cx="44" cy="126" r="6.5" fill="#fbf6e6" stroke="${INK4}" stroke-width="1.6"/><g fill="#fff6df" stroke="${INK4}" stroke-width=".6"><ellipse cx="34" cy="114" rx="2" ry="1.1"/><ellipse cx="54" cy="116" rx="2" ry="1.1"/><ellipse cx="30" cy="130" rx="2" ry="1.1"/><ellipse cx="57" cy="132" rx="2" ry="1.1"/><ellipse cx="42" cy="141" rx="2" ry="1.1"/><ellipse cx="46" cy="110" rx="2" ry="1.1"/></g>
<path d="M72 112 L88 92" stroke="#c8483a" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round"/>` + pigeon(130, 146, 1.35, true),
      ),
      h: 'Plate III',
    },
    { cls: 'entry', h: 'The Critic', sub: 'Columba iudicans', t: 'Stares at your bagel. Says nothing. You feel judged anyway.' },
    {
      cls: 'plate',
      art: plate4(
        `<rect width="184" height="208" fill="#b9825a"/><path d="${Array.from({ length: 11 }, (_, i) => `M0 ${i * 20}H184`).join('')}${Array.from({ length: 11 }, (_, r) => Array.from({ length: 5 }, (_, c) => `M${c * 40 + (r % 2 ? 20 : 0)} ${r * 20}v20`).join('')).join('')}" stroke="#8a5d3c" stroke-width="1.4"/>
<rect x="34" y="20" width="116" height="110" fill="#33415c" stroke="#f1e7c6" stroke-width="5"/><rect x="26" y="128" width="132" height="8" fill="#f1e7c6" stroke="${INK4}" stroke-width="1.4"/>
<rect x="52" y="96" width="80" height="48" rx="3" fill="#cfd3d8" stroke="${INK4}" stroke-width="1.8"/><path d="M60 108h48M60 116h48M60 124h48M60 132h48" stroke="#8d949e" stroke-width="1.8"/><circle cx="120" cy="110" r="3.4" fill="#8d949e"/>
<path d="M62 150v6M62 162v5M62 174v4" stroke="#8fd0ff" stroke-width="2.6" stroke-linecap="round"/>` +
          pigeon(90, 96, 1.2, false, `<circle cx="42" cy="-42" r="4.5" fill="none" stroke="#e6c35a" stroke-width="1.6"/><path d="M42 -37 v10 h3 M42 -31 h3" fill="none" stroke="#e6c35a" stroke-width="1.6"/>`),
      ),
      h: 'Plate IV',
    },
    { cls: 'entry', h: 'The Landlord', sub: 'Columba dominus', t: 'Owns the air conditioner. Will not fix it. Will not leave.' },
  ],
}

// ---------- 5. The Biscuit Factory (local history, sepia) ----------
const INK5 = '#4a2f17'
const windows5 = (x: number, y: number, cols: number, rows: number, dx = 14, dy = 16, w = 7, h = 10) =>
  Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => `<rect x="${x + c * dx}" y="${y + r * dy}" width="${w}" height="${h}" fill="${INK5}"/>`).join('')).join('')
const cookie5 = (x: number, y: number, w = 44) => `<rect x="${x}" y="${y}" width="${w}" height="5" rx="2" fill="#3a2413"/><rect x="${x + 2}" y="${y + 5}" width="${w - 4}" height="3.4" fill="#fff6df"/><rect x="${x}" y="${y + 8.4}" width="${w}" height="5" rx="2" fill="#3a2413"/>`
const oven5 = (lit: boolean) =>
  `<rect x="26" y="14" width="132" height="96" fill="#b98d5a" stroke="${INK5}" stroke-width="1.8"/><path d="${Array.from({ length: 6 }, (_, i) => `M26 ${30 + i * 16}H158`).join('')}" stroke="#8a6238" stroke-width="1"/>
<path d="M54 110 V62 Q92 22 130 62 V110Z" fill="${lit ? '#3a2413' : '#241408'}" stroke="${INK5}" stroke-width="2.4"/>` +
  (lit
    ? `<path d="M60 110 V78 Q92 52 124 78 V110Z" fill="#e8a24a" opacity=".55"/><path d="M60 84H124M60 98H124" stroke="${INK5}" stroke-width="1.6"/>${[66, 80, 94, 108].map((x) => `<circle cx="${x + 4}" cy="80" r="4" fill="#f1dca8" stroke="${INK5}" stroke-width="1"/><circle cx="${x + 4}" cy="94" r="4" fill="#f1dca8" stroke="${INK5}" stroke-width="1"/>`).join('')}<path d="M70 10 q-4 -4 0 -8 M92 10 q-4 -4 0 -8 M114 10 q-4 -4 0 -8" fill="none" stroke="${INK5}" stroke-width="1.6" stroke-linecap="round"/>`
    : `<path d="M54 62 L84 84 M54 80 L70 62 M54 96 L92 58 M62 54 Q74 74 54 88 M72 46 Q92 78 54 104" fill="none" stroke="#d8c7a0" stroke-width="1"/><path d="M110 46v30" stroke="#d8c7a0" stroke-width="1"/><circle cx="110" cy="79" r="3" fill="#d8c7a0"/>`)
const deck5 = (y: number) => `<rect x="0" y="${y}" width="184" height="7" fill="#6b4a2b" stroke="${INK5}" stroke-width="1.4"/>${[14, 38, 146, 170].map((x) => `<path d="M${x} ${y + 7}V110" stroke="${INK5}" stroke-width="3.4"/>`).join('')}`
const B5: Book = {
  id: 'biscuit',
  title: 'The Biscuit Factory',
  artH: 114,
  bg: '#5a3b1e',
  fg: '#ead9b5',
  blurb: '“The brick is original. So is the smell, some days.”',
  by: 'A neighbor',
  imprint: 'Tenth Avenue Historical',
  line: 'I am holding a book about the building I am in.',
  cover: svg(
    220,
    320,
    `<rect width="220" height="320" fill="#e4cfa3"/><rect x="7" y="7" width="206" height="306" fill="none" stroke="${INK5}" stroke-width="2"/><rect x="12" y="12" width="196" height="296" fill="none" stroke="${INK5}" stroke-width=".8"/>
${tx(112.5, 42, 'THE', `text-anchor="middle" class="bk-f-bask" font-size="12" letter-spacing="5" fill="${INK5}"`)}
${tx(111, 77, 'BISCUIT', `text-anchor="middle" class="bk-f-bask" font-weight="700" font-size="33" letter-spacing="2" fill="${INK5}"`)}
${tx(111, 110, 'FACTORY', `text-anchor="middle" class="bk-f-bask" font-weight="700" font-size="33" letter-spacing="2" fill="${INK5}"`)}
<path d="M60 124h36M124 124h36" stroke="${INK5}" stroke-width="1"/><path d="M110 119l5 5l-5 5l-5 -5z" fill="${INK5}"/>
<rect x="22" y="136" width="176" height="108" fill="#efdfbb" stroke="${INK5}" stroke-width="1.2"/>
<circle cx="170" cy="150" r="7" fill="#d8c090"/><circle cx="180" cy="144" r="9" fill="#d8c090"/><circle cx="160" cy="158" r="5" fill="#d8c090"/>
<rect x="152" y="160" width="12" height="34" fill="#9a6f42" stroke="${INK5}" stroke-width="1.4"/><rect x="150" y="158" width="16" height="5" fill="${INK5}"/>
<rect x="40" y="178" width="140" height="62" fill="#b98d5a" stroke="${INK5}" stroke-width="1.6"/><rect x="36" y="174" width="148" height="6" fill="#6b4a2b" stroke="${INK5}" stroke-width="1.2"/>
${windows5(48, 186, 9, 3, 14.6, 16, 7, 10)}<rect x="100" y="218" width="20" height="22" fill="#3a2413"/>
<rect x="22" y="204" width="20" height="5" fill="#6b4a2b" stroke="${INK5}" stroke-width="1"/><path d="M28 209v31" stroke="${INK5}" stroke-width="2.4"/><rect x="24" y="194" width="16" height="10" rx="1.5" fill="#3a2413"/>
<path d="M22 240h176" stroke="${INK5}" stroke-width="1.6"/>
${tx(110, 264, 'The building you are standing in', `text-anchor="middle" class="bk-f-bask" font-style="italic" font-size="12" fill="${INK5}"`)}
${tx(111.5, 286, 'ADA BRICKNER', `text-anchor="middle" class="bk-f-bask" font-size="10.5" letter-spacing="3.4" fill="${INK5}"`)}
${tx(111, 301, 'TENTH AVENUE HISTORICAL', `text-anchor="middle" class="bk-f-bask" font-size="5.6" letter-spacing="1.8" fill="${INK5}"`)}`,
    'bk-cover',
  ),
  pages: [
    {
      h: '1890s',
      art: `<circle cx="150" cy="16" r="7" fill="#d8c090"/><circle cx="162" cy="10" r="9" fill="#d8c090"/><rect x="134" y="24" width="12" height="30" fill="#9a6f42" stroke="${INK5}" stroke-width="1.4"/><rect x="14" y="46" width="156" height="62" fill="#b98d5a" stroke="${INK5}" stroke-width="1.8"/><rect x="10" y="42" width="164" height="6" fill="#6b4a2b" stroke="${INK5}" stroke-width="1.2"/>${windows5(22, 56, 10, 3, 14.8, 16)}<rect x="82" y="88" width="20" height="20" fill="#3a2413"/><path d="M0 109h184" stroke="${INK5}" stroke-width="2"/>`,
      t: 'A biscuit company builds its bakeries here. Block by block.',
    },
    { art: oven5(true), t: 'Ovens the size of rooms. The whole neighborhood smells like baking.' },
    {
      h: '1912',
      art: `<circle cx="58" cy="58" r="40" fill="#3a2413" stroke="${INK5}" stroke-width="2"/><circle cx="58" cy="58" r="31" fill="none" stroke="#6b4a2b" stroke-width="1.6" stroke-dasharray="2 4"/><circle cx="58" cy="58" r="20" fill="none" stroke="#6b4a2b" stroke-width="1.6"/><path d="M58 46v24M46 58h24M50 50l16 16M66 50l-16 16" stroke="#6b4a2b" stroke-width="1.6"/>
<g transform="translate(112 44) scale(1.5)">${cookie5(0, 0, 40)}</g><path d="M142 26v-12M160 30l8 -9M124 30l-8 -9" stroke="${INK5}" stroke-width="2" stroke-linecap="round"/>`,
      t: 'A sandwich cookie is made here for the first time.',
    },
    {
      art: `${Array.from({ length: 9 }, (_, i) => cookie5(70, 100 - i * 13.4)).join('')}<path d="M0 113h184" stroke="${INK5}" stroke-width="2"/><path d="M130 113V34M146 113V34M130 100h16M130 84h16M130 68h16M130 52h16" stroke="${INK5}" stroke-width="2" fill="none"/>`,
      t: 'It did fine.',
    },
    {
      h: '1930s',
      art: `<rect x="62" y="10" width="92" height="100" fill="#b98d5a" stroke="${INK5}" stroke-width="1.8"/>${windows5(70, 18, 6, 2, 14, 16)}${windows5(70, 76, 6, 2, 14, 16)}${deck5(62)}<rect x="62" y="42" width="92" height="20" fill="#241408"/>
<rect x="6" y="44" width="34" height="16" rx="2" fill="#3a2413" stroke="${INK5}" stroke-width="1.2"/><rect x="42" y="42" width="24" height="18" rx="2" fill="#6b4a2b" stroke="${INK5}" stroke-width="1.2"/><rect x="56" y="34" width="6" height="8" fill="#3a2413"/><circle cx="60" cy="28" r="4" fill="#d8c090"/><circle cx="54" cy="20" r="5.5" fill="#d8c090"/>
<g fill="${INK5}"><circle cx="14" cy="61" r="2.6"/><circle cx="32" cy="61" r="2.6"/><circle cx="48" cy="61" r="2.6"/></g><path d="M0 111h184" stroke="${INK5}" stroke-width="2"/>`,
      t: 'Freight trains run right through the building, one floor up.',
    },
    {
      art: `${deck5(62)}<path d="M0 111h184" stroke="${INK5}" stroke-width="2"/><g fill="none" stroke="#6f7d3a" stroke-width="2" stroke-linecap="round"><path d="M12 62 q-3 -10 -7 -12M12 62 q1 -12 5 -14M12 62 q4 -8 9 -9"/><path d="M92 62 q-3 -10 -7 -12M92 62 q1 -12 5 -14M92 62 q4 -8 9 -9"/><path d="M166 62 q-3 -10 -7 -12M166 62 q1 -12 5 -14M166 62 q4 -8 9 -9"/></g>
${[44, 66, 126].map((x, i) => `<circle cx="${x}" cy="${34 + (i % 2) * 2}" r="5" fill="${INK5}"/><path d="M${x} ${39 + (i % 2) * 2}v13M${x} 52l-4 10M${x} 52l4 10M${x - 5} 45h10" stroke="${INK5}" stroke-width="2.4" stroke-linecap="round" fill="none"/>`).join('')}
<rect x="136" y="52" width="20" height="4" fill="#6b4a2b"/><path d="M139 56v6M153 56v6" stroke="${INK5}" stroke-width="2"/>`,
      t: 'Those tracks are the High Line now. People walk where flour rode.',
    },
    { h: '1950s', art: oven5(false), t: 'The bakers move away. The ovens go quiet.' },
    {
      h: '1997',
      art: `<rect width="184" height="114" fill="#b98d5a"/><path d="M34 114 V44 Q92 -8 150 44 V114Z" fill="#efdfbb" stroke="${INK5}" stroke-width="2.4"/><path d="M62 114 V62 Q92 34 122 62 V114Z" fill="#d8c090" stroke="${INK5}" stroke-width="1.4"/>
<path d="M44 46 Q92 74 140 46" fill="none" stroke="${INK5}" stroke-width="1"/>${[52, 66, 80, 92, 104, 118, 132].map((x, i) => `<circle cx="${x}" cy="${51 + [0, 5, 8, 9, 8, 5, 0][i]}" r="2.6" fill="#f2c230" stroke="${INK5}" stroke-width=".8"/>`).join('')}
<path d="M34 80 h22 l-4 10 h-18z M150 80 h-22 l4 10 h18z" fill="#b5432c" stroke="${INK5}" stroke-width="1.2"/>
<path d="M92 104 q-11 -14 -11 -21 a11 11 0 0 1 22 0 q0 7 -11 21z" fill="#b5432c" stroke="${INK5}" stroke-width="1.6"/><circle cx="92" cy="83" r="4" fill="#efdfbb"/>`,
      t: 'It reopens as a market. You are standing in it.',
    },
  ],
}

// ---------- 6. Rent: A Horror Story (a pulp paperback) ----------
const K6 = '#151112'
const R6 = '#c8201c'
const lbl6 = (x: number, y: number, s: string, size: number, fill = K6, a = '') => tx(x, y, s, `text-anchor="middle" class="bk-f-fut" font-weight="700" font-size="${size}" fill="${fill}" ${a}`)
const B6: Book = {
  id: 'rent',
  title: 'Rent: A Horror Story',
  artH: 150,
  bg: '#120a0c',
  fg: '#ffd21f',
  blurb: '“I screamed. Then I signed.”',
  by: 'A tenant in 5F',
  imprint: 'Midnight Walk-Up Books',
  line: 'Scariest thing I own. After my lease.',
  cover: svg(
    220,
    320,
    `<defs><radialGradient id="bk-glow" cx="50%" cy="62%" r="60%"><stop offset="0" stop-color="#b3161c"/><stop offset="1" stop-color="#120a0c"/></radialGradient></defs>
<rect width="220" height="320" fill="url(#bk-glow)"/>
${tx(111.5, 24, 'IT ONLY GOES UP', 'text-anchor="middle" class="bk-f-fut" font-weight="700" font-size="9" letter-spacing="3.6" fill="#ffd21f"')}
<g transform="translate(110 106) scale(1 1.34)">${tx(0, 0, 'RENT', 'text-anchor="middle" class="bk-f-fut" font-weight="700" font-size="66" letter-spacing="1" textLength="192" lengthAdjust="spacingAndGlyphs" fill="#ffd21f" stroke="#120a0c" stroke-width="1.2"')}</g>
<g fill="#ffd21f"><path d="M30 104 v14 a4 4 0 0 0 8 0 v-14z"/><path d="M84 104 v24 a3.5 3.5 0 0 0 7 0 v-24z"/><path d="M128 104 v10 a3 3 0 0 0 6 0 v-10z"/><path d="M176 104 v19 a4 4 0 0 0 8 0 v-19z"/><circle cx="87.5" cy="140" r="3"/></g>
<circle cx="164" cy="190" r="30" fill="#ead9a0" opacity=".92"/>
<path d="M58 320 V178 h-6 v-8 h116 v8 h-6 V320Z" fill="#0b0607" stroke="#3a0d10" stroke-width="1.4"/>
<g fill="#2a0b0d">${[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3].map((c) => (r === 1 && c === 2 ? '' : `<rect x="${68 + c * 23}" y="${188 + r * 27}" width="14" height="18"/>`)).join('')).join('')}</g>
<rect x="114" y="215" width="14" height="18" fill="#ffd21f"/><path d="M119 233 v-9 a2.6 2.6 0 1 1 4 0 v9z" fill="#120a0c"/>
<path d="M64 212h44M64 239h44M64 266h44M66 212l40 27M106 239l-40 27M66 266l40 27" stroke="#3a0d10" stroke-width="1.6" fill="none"/>
<g transform="rotate(-5 110 150)"><rect x="-6" y="138" width="232" height="24" fill="${R6}" stroke="#120a0c" stroke-width="1.4"/>${tx(111.5, 155, 'A HORROR STORY', 'text-anchor="middle" class="bk-f-fut" font-weight="700" font-size="13.5" letter-spacing="3.4" fill="#fff6d8"')}</g>
<g transform="translate(30 204) rotate(-12)"><path d="${Array.from({ length: 20 }, (_, i) => `${i ? 'L' : 'M'}${(Math.cos((i / 20) * Math.PI * 2) * (i % 2 ? 17 : 24)).toFixed(1)} ${(Math.sin((i / 20) * Math.PI * 2) * (i % 2 ? 17 : 24)).toFixed(1)}`).join('')}Z" fill="#ffd21f" stroke="#120a0c" stroke-width="1.2"/>${tx(0, -1, 'NO', `text-anchor="middle" class="bk-f-fut" font-weight="700" font-size="10" fill="${R6}"`)}${tx(0, 9, 'FEE', `text-anchor="middle" class="bk-f-fut" font-weight="700" font-size="10" fill="${R6}"`)}</g>
${tx(111.5, 311, 'MORGAN LEASE', 'text-anchor="middle" class="bk-f-fut" font-weight="700" font-size="10.5" letter-spacing="3.4" fill="#ffd21f" stroke="#0b0607" stroke-width="3" paint-order="stroke"')}`,
    'bk-cover',
  ),
  pages: [
    {
      art: `<rect x="84" y="0" width="16" height="150" fill="#6b6257" stroke="${K6}" stroke-width="1.8"/><g transform="rotate(-5 92 70)"><rect x="46" y="16" width="92" height="104" fill="#fffaf0" stroke="${K6}" stroke-width="2"/>${lbl6(92, 44, 'FOR RENT', 14)}${lbl6(92, 76, 'COZY', 27, R6)}<path d="M56 86h72" stroke="${K6}" stroke-width="1.4"/><path d="${Array.from({ length: 7 }, (_, i) => `M${57.5 + i * 11.5} 98v22`).join('')}" stroke="${K6}" stroke-width="1.2"/><path d="M46 98h92" stroke="${K6}" stroke-width="1.2" stroke-dasharray="3 3"/></g><rect x="86" y="10" width="12" height="8" fill="#b7ad9c" opacity=".9" transform="rotate(-5 92 70)"/>`,
      t: 'The listing said cozy.',
    },
    {
      art: `<rect x="40" y="14" width="104" height="104" fill="#fffaf0" stroke="${K6}" stroke-width="5"/><rect x="46" y="54" width="92" height="58" rx="3" fill="#e6dcc0" stroke="${K6}" stroke-width="1.8"/><rect x="52" y="60" width="26" height="46" rx="5" fill="#fff" stroke="${K6}" stroke-width="1.6"/><path d="M84 54v58" stroke="${K6}" stroke-width="1.2"/>
<path d="M112 14 A30 30 0 0 1 132 44" fill="none" stroke="${K6}" stroke-width="1.4" stroke-dasharray="3 3"/><path d="M112 17v30" stroke="${K6}" stroke-width="2.4"/><path d="M106 38l12 12M118 38l-12 12" stroke="${R6}" stroke-width="3" stroke-linecap="round"/>
<path d="M40 132h104M40 126v12M144 126v12" stroke="${R6}" stroke-width="1.8"/>${lbl6(92, 147, '7 FT', 10, R6)}`,
      t: 'Cozy means small.',
    },
    {
      art: `<circle cx="92" cy="72" r="46" fill="${R6}"/><circle cx="92" cy="72" r="32" fill="#f2a01f"/><g stroke="${R6}" stroke-width="4" stroke-linecap="round">${Array.from({ length: 12 }, (_, i) => {
        const a = (i / 12) * Math.PI * 2
        return `<path d="M${(92 + Math.cos(a) * 54).toFixed(1)} ${(72 + Math.sin(a) * 54).toFixed(1)}L${(92 + Math.cos(a) * 74).toFixed(1)} ${(72 + Math.sin(a) * 74).toFixed(1)}"/>`
      }).join('')}</g><rect x="38" y="14" width="108" height="116" fill="none" stroke="${K6}" stroke-width="6"/><path d="M92 14v116M38 72h108" stroke="${K6}" stroke-width="3.4"/><rect x="30" y="128" width="124" height="8" fill="${K6}"/>`,
      t: 'The listing said sun-drenched.',
    },
    {
      art: `<g fill="${R6}" opacity=".85"><polygon points="0,0 26,0 110,150 70,150"/><polygon points="44,0 62,0 160,150 132,150"/><polygon points="82,0 94,0 184,118 184,150 176,150"/></g>
<rect x="20" y="98" width="118" height="26" rx="4" fill="#fffaf0" stroke="${K6}" stroke-width="2"/><ellipse cx="42" cy="96" rx="17" ry="8" fill="#fff" stroke="${K6}" stroke-width="1.8"/><path d="M54 100 Q84 72 132 102 v14 H54z" fill="#e6dcc0" stroke="${K6}" stroke-width="2"/><path d="M24 124v12M134 124v12" stroke="${K6}" stroke-width="4" stroke-linecap="round"/>
<rect x="142" y="92" width="36" height="24" rx="4" fill="${K6}"/>${tx(160, 109, '5:00', `text-anchor="middle" class="bk-f-cour" font-weight="700" font-size="12" fill="#ffd21f"`)}<path d="M146 116v20M174 116v20" stroke="${K6}" stroke-width="3"/>`,
      t: 'No curtain will help. It is 5 a.m.',
    },
    {
      art: `<rect x="44" y="4" width="118" height="142" fill="#fffaf0" stroke="${K6}" stroke-width="2.4"/><path d="M58 142 L148 116 L58 90 L148 64 L58 38 L148 14" fill="none" stroke="${K6}" stroke-width="3.4" stroke-linejoin="round"/>
${[1, 2, 3, 4, 5].map((n) => lbl6(30, 146 - (n - 1) * 26.5 - 6, String(n), 12, n === 5 ? R6 : K6)).join('')}
<rect x="140" y="2" width="18" height="12" fill="${R6}"/>${lbl6(149, 11.5, '5F', 8, '#fffaf0')}
<circle cx="70" cy="122" r="5" fill="${K6}"/><path d="M70 127v10M70 137l-4 7M70 137l4 7M62 131h16" stroke="${K6}" stroke-width="2.4" stroke-linecap="round"/><rect x="56" y="131" width="7" height="9" fill="#b98d5a" stroke="${K6}" stroke-width="1.2"/><rect x="77" y="131" width="7" height="9" fill="#b98d5a" stroke="${K6}" stroke-width="1.2"/>`,
      t: 'Fifth floor. Walk-up. The groceries knew.',
    },
    {
      art: `<rect x="16" y="6" width="74" height="140" fill="${K6}"/><path d="M90 6 L62 18 V146 L90 146Z" fill="#6b4a2b" stroke="${K6}" stroke-width="2"/><circle cx="68" cy="82" r="3.4" fill="#ffd21f"/>
<path d="M30 70 q26 -10 54 6 l14 4 v16 l-16 2 q-30 10 -52 -4z" fill="#5d7a4a" stroke="${K6}" stroke-width="2"/><path d="M84 76 l10 -9 M88 84 l12 -5 M88 92 l12 2" stroke="${K6}" stroke-width="2.4" stroke-linecap="round"/>
<g transform="rotate(8 132 76)"><rect x="100" y="38" width="64" height="80" fill="#fffaf0" stroke="${K6}" stroke-width="2"/>${lbl6(132, 60, 'FEE', 16)}${lbl6(132, 92, '15%', 24, R6)}<path d="M110 102h44M110 109h30" stroke="${K6}" stroke-width="1.4"/></g>`,
      t: 'Then came the broker fee. For opening a door.',
    },
    {
      art: `<rect width="184" height="150" fill="#3a2a22"/><rect x="34" y="0" width="116" height="112" fill="#6b4a2b" stroke="${K6}" stroke-width="2.4"/><rect x="48" y="10" width="88" height="88" fill="none" stroke="#4a3018" stroke-width="3"/>
<rect x="0" y="118" width="184" height="32" fill="#8a6f52"/><polygon points="34,116 150,116 176,150 8,150" fill="${R6}" opacity=".55"/><rect x="34" y="112" width="116" height="5" fill="${K6}"/>
<g transform="rotate(-7 92 126)"><rect x="62" y="110" width="60" height="32" fill="#fffaf0" stroke="${K6}" stroke-width="2"/><path d="M62 110 L92 130 L122 110" fill="none" stroke="${K6}" stroke-width="1.6"/><circle cx="92" cy="130" r="5" fill="${R6}" stroke="${K6}" stroke-width="1.2"/></g>`,
      t: 'A year passed. Something slid under the door.',
    },
    {
      art: `<path d="M14 30 l12 16 l-8 2 l12 18 M170 30 l-12 16 l8 2 l-12 18" fill="none" stroke="${R6}" stroke-width="3.4" stroke-linejoin="round" stroke-linecap="round"/>
<g transform="rotate(-3 92 76)"><rect x="46" y="8" width="92" height="134" fill="#fffaf0" stroke="${K6}" stroke-width="2.4"/>${lbl6(92, 32, 'RENEWAL', 14)}<path d="M58 40h68" stroke="${K6}" stroke-width="1.4"/><path d="M92 122 V70" stroke="${R6}" stroke-width="13"/><path d="M68 78 L92 48 L116 78Z" fill="${R6}"/><path d="M58 130h40M58 136h26" stroke="${K6}" stroke-width="1.4"/></g>`,
      t: 'The lease renewal.',
      cls: 'scream',
    },
  ],
}

const BOOKS: Book[] = [B1, B2, B3, B4, B5, B6]

const barcode = (fg: string) => {
  const r = rnd(41)
  let x = 0
  let s = ''
  while (x < 56) {
    const w = 0.8 + Math.floor(r() * 3) * 0.8
    s += `<rect x="${x.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="22" fill="${fg}"/>`
    x += w + 0.8 + Math.floor(r() * 2) * 0.9
  }
  return s
}

function pageHtml(b: Book, p: Page, n: number): string {
  return `<div class="bk-pg bk-pg-${b.id} ${p.cls ?? ''}">${p.h && p.cls !== 'plate' ? `<h4>${p.h}</h4>` : ''}${p.art ? svg(184, p.ah ?? b.artH, p.art, 'bk-art') : ''}${p.h && p.cls === 'plate' ? `<h4>${p.h}</h4>` : ''}${p.sub ? `<em>${p.sub}</em>` : ''}${p.t ? `<p>${p.t}</p>` : ''}<i class="bk-no">${n}</i></div>`
}
const endHtml = (b: Book) => `<div class="bk-pg bk-pg-${b.id} bk-end"><b>The End</b><s></s></div>`
const backHtml = (b: Book) =>
  `<div class="bk-backc bk-pg-${b.id}" style="background:${b.bg};color:${b.fg}"><q>${b.blurb}</q><cite>${b.by}</cite><span class="bk-imp">${b.imprint}</span>${svg(60, 22, `<rect x="-4" y="-3" width="68" height="28" fill="#fffaf0"/>${barcode('#151112')}`, 'bk-barcode')}</div>`

const BAG = `<svg viewBox="0 0 90 104" aria-hidden="true"><path d="M10 26 L80 26 L86 102 L4 102Z" fill="#c9a06a" stroke="#1d2140" stroke-width="3" stroke-linejoin="round"/><path d="M10 26 L80 26 L78 38 L12 38Z" fill="#a8824f"/><path d="M30 26 Q30 4 45 4 Q60 4 60 26" fill="none" stroke="#1d2140" stroke-width="3"/><circle cx="45" cy="66" r="15" fill="none" stroke="#7a5a30" stroke-width="2"/><path d="M38 61h14v11h-14z M45 61v11" fill="none" stroke="#7a5a30" stroke-width="2"/></svg>`

const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const LEAVES = 5

export function bookshop(g: Game) {
  // Escape with a book in your hands closes the book and puts it back; only then does Escape leave the shop.
  // (The kit closes on Escape before it asks its key listeners, so this one has to be in line ahead of it.)
  const esc = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !held) return
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
    e.preventDefault()
    e.stopImmediatePropagation()
    putBack()
  }
  window.addEventListener('keydown', esc, true)
  const m = openMoment('mo-books')

  const root = el('div', 'bk')
  root.innerHTML = `
    <div class="bk-shop">
      <img class="bk-bg" src="${ART}" alt="" draggable="false">
      <i class="bk-lamp" style="left:288px;top:62px"></i><i class="bk-lamp" style="left:500px;top:62px"></i><i class="bk-lamp" style="left:733px;top:62px"></i><i class="bk-lamp sm" style="left:836px;top:222px"></i>
      <div class="bk-stands">${BOOKS.map((b, i) => {
        const s = STANDS[i]
        return `<i class="bk-contact" style="left:${s.x}px;top:${LEDGE_Y}px"></i><button class="bk-stand" type="button" data-i="${i}" aria-label="${b.title}" style="left:${s.x - (PW * MINI) / 2}px;top:${LEDGE_Y - PH * MINI}px;--sk:${s.skew}deg"><span class="bk-mini">${b.cover}</span><i class="bk-mark"></i></button><span class="bk-yours" data-i="${i}" style="left:${s.x}px;top:${LEDGE_Y + 3}px" hidden>Yours</span>`
      }).join('')}</div>
    </div>
    <p class="bk-label" hidden></p>
    <div class="bk-held" hidden>
      <div class="bk-book" translate="no">
        <i class="bk-under r"></i><i class="bk-under l"></i>
        <i class="bk-edge l"></i><i class="bk-edge r"></i>
        <div class="bk-back"></div>
        <i class="bk-cast"></i>
        <i class="bk-ring" hidden></i>
      </div>
    </div>
    <div class="bk-btns" hidden><button class="btn small go bk-buy" type="button"><span>Buy</span><img src="/art/icons/coin.png" alt=""><span>${PRICE}</span></button><span class="bk-own" hidden>Yours</span><button class="btn small ghost bk-put" type="button">Put back</button></div>
    <div class="bk-bag" hidden><i class="bk-peek"></i>${BAG}</div>
    <div class="bk-actions"><span class="bk-coins"><img src="/art/icons/coin.png" alt=""><b></b></span><button class="btn tiny ghost bk-leave" type="button">Leave</button></div>
    <p class="bk-hint" hidden><span></span></p>`
  m.root.append(root)
  const q = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as unknown as T
  const heldEl = q('.bk-held')
  const bookEl = q('.bk-book')
  const backEl = q('.bk-back')
  const castEl = q('.bk-cast')
  const ringEl = q('.bk-ring')
  const btns = q('.bk-btns')
  const label = q('.bk-label')
  const hintEl = q('.bk-hint')
  const coinsEl = q('.bk-coins b')
  const bagEl = q('.bk-bag')
  const stands = [...root.querySelectorAll<HTMLButtonElement>('.bk-stand')]
  const yours = [...root.querySelectorAll<HTMLElement>('.bk-yours')]
  coinsEl.textContent = String(save.coins)

  // ---------- state ----------
  let held: { i: number; book: Book } | null = null
  let busy = false
  let lastBought: Book | null = null
  let leaves: HTMLElement[] = []
  const angle: number[] = Array(LEAVES).fill(0)
  const flipped: boolean[] = Array(LEAVES).fill(false)
  const tw: ({ from: number; to: number; t: number; dur: number } | null)[] = Array(LEAVES).fill(null)
  let grab: { i: number; dir: 1 | -1; x0: number; r: number; moved: boolean } | null = null
  const count = () => flipped.filter(Boolean).length

  const hint = (text: string | null, at?: [number, number]) => {
    if (!text || !at) {
      hintEl.classList.add('out')
      return
    }
    hintEl.firstElementChild!.textContent = text
    hintEl.style.left = `${at[0]}px`
    hintEl.style.top = `${at[1]}px`
    hintEl.hidden = false
    hintEl.classList.remove('out')
  }

  const refreshStands = () => {
    BOOKS.forEach((b, i) => {
      stands[i].classList.toggle('read', !!save.stats[`cm:book:${b.id}`])
      yours[i].hidden = !save.stats[`cm:bought:${b.id}`] || held?.i === i
    })
  }
  refreshStands()

  // ---------- the stands ----------
  /** where a stand's cover sits, as a transform of the held book (its closed cover is at 390, HELD.top) */
  const standT = (i: number) => {
    const s = STANDS[i]
    return `translate(${s.x - (PW * MINI) / 2 - 390}px, ${LEDGE_Y - PH * MINI - HELD.top}px) scale(${MINI}) skewX(${s.skew * 0.6}deg)`
  }
  stands.forEach((st, i) => {
    const s = STANDS[i]
    st.onpointerenter = () => {
      if (held) return
      label.textContent = BOOKS[i].title
      label.style.left = `${s.x - Math.tan((s.skew * Math.PI) / 180) * PH * MINI}px`
      label.style.top = `${LEDGE_Y - PH * MINI - 14}px`
      label.hidden = false
    }
    st.onpointerleave = () => (label.hidden = true)
    st.onclick = (e) => {
      e.stopPropagation()
      pickUp(i)
    }
  })

  function buildBook(b: Book) {
    for (const l of leaves) l.remove()
    const faces = [b.cover, ...b.pages.map((p, n) => pageHtml(b, p, n + 1)), endHtml(b)]
    leaves = Array.from({ length: LEAVES }, (_, i) => {
      const leaf = el('div', 'bk-leaf' + (i === 0 ? ' cover' : ''), `<div class="bk-face f">${faces[i * 2]}</div><div class="bk-face b">${faces[i * 2 + 1]}</div>`)
      bookEl.insertBefore(leaf, castEl)
      return leaf
    })
    backEl.innerHTML = backHtml(b)
    for (let i = 0; i < LEAVES; i++) {
      flipped[i] = false
      tw[i] = null
      setAngle(i, 0)
    }
    layout()
  }

  function pickUp(i: number) {
    if (held || busy) return
    const b = BOOKS[i]
    busy = true
    held = { i, book: b }
    label.hidden = true
    hint(null)
    mk.thump()
    buildBook(b)
    stands[i].classList.add('gone')
    root.classList.add('holding')
    heldEl.hidden = false
    const owned = !!save.stats[`cm:bought:${b.id}`]
    q('.bk-buy').hidden = owned
    q('.bk-own').hidden = !owned
    refreshStands()
    const done = () => {
      busy = false
      btns.hidden = false
      if (!save.stats['cm:books'] && !count()) hint('Open it', [500, HELD.top + 8])
    }
    if (calm()) return done()
    heldEl.animate([{ transform: standT(i), offset: 0 }, { transform: 'translate(0, -14px) scale(1.03) rotate(-1.5deg)', offset: 0.78 }, { transform: 'none', offset: 1 }], { duration: 520, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)' }).onfinish = done
  }

  /** shut the book (every leaf back at once), then run `then` */
  function shut(then: () => void) {
    grab = null
    ringEl.hidden = true
    if (!count() && !tw.some(Boolean)) return then()
    for (let i = 0; i < LEAVES; i++) {
      flipped[i] = false
      if (angle[i] > 0) tweenTo(i, 0, 0.32)
    }
    mk.page()
    m.later(then, calm() ? 60 : 360)
  }

  function putBack() {
    if (!held || busy) return
    const h = held
    busy = true
    btns.hidden = true
    hint(null)
    shut(() => {
      const land = () => {
        mk.thump()
        heldEl.hidden = true
        stands[h.i].classList.remove('gone')
        stands[h.i].classList.add('landed')
        m.later(() => stands[h.i].classList.remove('landed'), 400)
        root.classList.remove('holding')
        held = null
        busy = false
        refreshStands()
      }
      if (calm()) return land()
      heldEl.animate([{ transform: 'none' }, { transform: standT(h.i) }], { duration: 380, easing: 'cubic-bezier(0.5, 0, 0.6, 1)' }).onfinish = land
    })
  }

  // ---------- pages ----------
  function setAngle(i: number, a: number) {
    angle[i] = a
    const s = Math.sin((a * Math.PI) / 180)
    leaves[i].style.transform = `rotateY(${-a}deg) skewY(${(-s * 2.2).toFixed(2)}deg)`
    leaves[i].style.setProperty('--sh', (s * 0.34).toFixed(3))
  }
  /** who is on top, how thick each side is, where the book sits and where the turning page throws its shadow */
  function layout() {
    let mover = -1
    for (let i = 0; i < LEAVES; i++) {
      const moving = !!tw[i] || (grab?.moved && grab.i === i)
      if (moving && (mover < 0 || Math.sin((angle[i] * Math.PI) / 180) > Math.sin((angle[mover] * Math.PI) / 180))) mover = i
      leaves[i].style.zIndex = String((angle[i] < 90 ? LEAVES - i : i + 1) + (moving ? 20 : 0))
    }
    const open = angle[0] / 180
    bookEl.style.transform = `translateX(${(-110 * (1 - open)).toFixed(1)}px)`
    const n = angle.filter((a) => a >= 90).length
    bookEl.style.setProperty('--l', `${n ? 1.5 + n * 1.5 : 0}px`)
    bookEl.style.setProperty('--r', `${1.5 + (LEAVES - n) * 1.5}px`)
    bookEl.style.setProperty('--open', Math.max(0, (angle[0] - 90) / 90).toFixed(3))
    if (mover < 0) {
      castEl.style.opacity = '0'
    } else {
      const a = (angle[mover] * Math.PI) / 180
      const c = Math.cos(a)
      const w = Math.abs(c) * PW + 22
      castEl.style.width = `${w}px`
      castEl.style.left = `${c >= 0 ? PW : PW - w}px`
      castEl.style.transform = c >= 0 ? 'none' : 'scaleX(-1)'
      castEl.style.opacity = Math.sin(a).toFixed(3)
    }
  }
  function tweenTo(i: number, to: number, dur: number) {
    if (calm()) {
      tw[i] = null
      setAngle(i, to)
      layout()
      bookEl.classList.remove('fade')
      void bookEl.offsetWidth
      bookEl.classList.add('fade')
      settled(i)
      return
    }
    tw[i] = { from: angle[i], to, t: 0, dur }
  }
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
  m.frame((dt) => {
    if (!held) return
    let any = false
    for (let i = 0; i < LEAVES; i++) {
      const w = tw[i]
      if (!w) continue
      any = true
      w.t = Math.min(1, w.t + dt / w.dur)
      setAngle(i, w.from + (w.to - w.from) * ease(w.t))
      if (w.t >= 1) {
        tw[i] = null
        settled(i)
      }
    }
    if (any) layout()
  })
  function settled(i: number) {
    if (!held) return
    if (i === LEAVES - 1 && flipped[i] && angle[i] >= 180) finished(held.book)
  }
  function turn(i: number, dir: 1 | -1) {
    if (!held || busy) return
    flipped[i] = dir > 0
    mk.page()
    hint(null)
    if (i > 0) {
      ringEl.hidden = true
      if (!save.stats['cm:turned']) bump('cm:turned')
    } else if (dir > 0 && !save.stats['cm:turned']) ringEl.hidden = false
    else ringEl.hidden = true
    tweenTo(i, dir > 0 ? 180 : 0, i === 0 ? 0.58 : 0.5)
    layout()
  }
  const next = () => count() < LEAVES && turn(count(), 1)
  const prev = () => count() > 0 && turn(count() - 1, -1)

  function finished(b: Book) {
    const first = !save.stats[`cm:book:${b.id}`]
    if (first) {
      bump(`cm:book:${b.id}`)
      sfx.ding()
      sparkle()
    }
    g.stamp('staff-pick')
    if (BOOKS.every((k) => save.stats[`cm:book:${k.id}`])) g.stamp('well-read')
    if (!save.stats['cm:books']) bump('cm:books')
    if (['cm:tacos', 'cm:oysters', 'cm:doughnuts', 'cm:books'].every((k) => save.stats[k])) g.stamp('market-crawl')
    refreshStands()
  }
  function sparkle() {
    for (let i = 0; i < 9; i++) {
      const s = el('i', 'bk-spark')
      const a = (i / 9) * Math.PI * 2
      s.style.cssText = `left:390px;top:${HELD.top + 150}px;--dx:${Math.cos(a) * 70}px;--dy:${Math.sin(a) * 60 - 20}px`
      root.append(s)
      setTimeout(() => s.remove(), 700)
    }
  }

  // click a page, or drag it across
  bookEl.addEventListener('pointerdown', (e) => {
    if (!held || busy || grab) return
    const p = toStage(e)
    const spine = 500 - 110 * (1 - angle[0] / 180)
    const n = count()
    if (p[1] < HELD.top || p[1] > HELD.top + PH) return
    let i: number
    let dir: 1 | -1
    if (p[0] >= spine) {
      if (n >= LEAVES || p[0] > spine + PW + 8) return
      i = n
      dir = 1
    } else {
      if (n === 0 || p[0] < spine - PW - 8) return
      i = n - 1
      dir = -1
    }
    grab = { i, dir, x0: p[0], r: Math.max(50, Math.abs(p[0] - spine)), moved: false }
    bookEl.setPointerCapture(e.pointerId)
    e.preventDefault()
  })
  bookEl.addEventListener('pointermove', (e) => {
    if (!grab) return
    const p = toStage(e)
    // the cover opens on a click (the whole book slides as it opens, so it is not dragged)
    if (!grab.moved && grab.i > 0 && Math.abs(p[0] - grab.x0) > 5) {
      grab.moved = true
      tw[grab.i] = null
      root.classList.add('dragging')
    }
    if (!grab.moved) return
    setAngle(grab.i, (Math.acos(Math.max(-1, Math.min(1, (p[0] - 500) / grab.r))) * 180) / Math.PI)
    layout()
  })
  const release = () => {
    if (!grab) return
    const gr = grab
    grab = null
    root.classList.remove('dragging')
    if (!gr.moved) return void turn(gr.i, gr.dir)
    const over = angle[gr.i] > 90
    if (over !== flipped[gr.i]) {
      flipped[gr.i] = over
      mk.page()
      hint(null)
      ringEl.hidden = true
      if (!save.stats['cm:turned']) bump('cm:turned')
    }
    const to = over ? 180 : 0
    if (calm()) {
      setAngle(gr.i, to)
      layout()
      settled(gr.i)
    } else tw[gr.i] = { from: angle[gr.i], to, t: 0, dur: 0.14 + (0.3 * Math.abs(to - angle[gr.i])) / 180 }
    layout()
  }
  bookEl.addEventListener('pointerup', release)
  bookEl.addEventListener('pointercancel', release)
  m.onKey((e) => {
    if (!held || busy) return false
    if (e.key === 'ArrowRight') return next(), true
    if (e.key === 'ArrowLeft') return prev(), true
    return false
  })

  // ---------- buying ----------
  const fly = (from: [number, number], to: [number, number], ms: number) => {
    const f = el('img', 'bk-fly') as HTMLImageElement
    f.src = '/art/icons/coin.png'
    f.style.cssText = `left:${to[0] - 12}px;top:${to[1] - 12}px`
    root.append(f)
    const dx = from[0] - to[0]
    const dy = from[1] - to[1]
    f.animate([{ transform: `translate(${dx}px, ${dy}px) scale(1.1)` }, { transform: `translate(${dx * 0.4}px, ${dy * 0.4 - 50}px) scale(1)`, offset: 0.55 }, { transform: 'translate(0, 0) scale(0.45)', opacity: 0.2 }], { duration: ms, easing: 'cubic-bezier(0.3, 0.6, 0.35, 1)' }).onfinish = () => f.remove()
  }
  async function buy() {
    if (!held || busy) return
    const h = held
    if (save.stats[`cm:bought:${h.book.id}`]) return
    busy = true
    const ok = !g.owns(ITEM) ? await g.buy(ITEM) : g.spend(PRICE, 'cm-book')
    if (!m.alive) return
    if (!ok) {
      busy = false
      const b = q('.bk-buy')
      b.classList.remove('no')
      void b.offsetWidth
      b.classList.add('no')
      return
    }
    bump(`cm:bought:${h.book.id}`)
    lastBought = h.book
    btns.hidden = true
    hint(null)
    mk.till()
    if (!calm()) for (let i = 0; i < PRICE; i++) m.later(() => fly([930, 34], [500, 268], 520), i * 90)
    m.later(() => {
      coinsEl.textContent = String(save.coins)
      sfx.coin()
    }, 420)
    // the book shuts and slips into a paper bag in the corner
    m.later(
      () =>
        shut(() => {
          bagEl.hidden = false
          bagEl.style.setProperty('--c', h.book.bg)
          const land = () => {
            mk.bag()
            heldEl.hidden = true
            bagEl.classList.remove('got')
            void bagEl.offsetWidth
            bagEl.classList.add('got')
            root.classList.remove('holding')
            stands[h.i].classList.remove('gone')
            stands[h.i].classList.add('landed')
            m.later(() => stands[h.i].classList.remove('landed'), 400)
            held = null
            busy = false
            refreshStands()
          }
          if (calm()) return land()
          heldEl.animate([{ transform: 'none', offset: 0 }, { transform: `translate(491px, ${372 - HELD.top}px) scale(0.24) rotate(6deg)`, offset: 0.8 }, { transform: `translate(491px, ${428 - HELD.top}px) scale(0.24) rotate(0deg)`, opacity: 0.6, offset: 1 }], { duration: 560, easing: 'cubic-bezier(0.5, 0, 0.5, 1)' }).onfinish = land
        }),
      calm() ? 0 : 520,
    )
  }
  q('.bk-buy').onclick = (e) => {
    e.stopPropagation()
    void buy()
  }
  q('.bk-put').onclick = (e) => {
    e.stopPropagation()
    putBack()
  }

  // ---------- leaving ----------
  q('.bk-leave').onclick = () => {
    sfx.click()
    m.close()
  }
  m.onClose(() => {
    window.removeEventListener('keydown', esc, true)
    const b = lastBought
    if (b && g.owns(ITEM))
      setTimeout(() => {
        g.wear(ITEM)
        g.say(b.line)
      }, 320)
  })

  // hello
  if (!save.stats['cm:books']) m.later(() => !held && hint('Pick a book', [509, 338]), 700)
}
