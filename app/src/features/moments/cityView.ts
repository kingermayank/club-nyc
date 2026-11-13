import './cityView.css'
import { audioCtx, onMute } from '../../audio'
import { el, stage, toStage, W, H } from '../../engine/stage'
import { hold } from '../../engine/ui'
import type { Pt } from '../../geometry'
import { persist, save } from '../../state'
import type { Game } from '../../types'

/**
 * At the observatory glass: the whole city out the window, a big painted panorama you drag around and zoom into.
 * Names come out on the landmarks as you get closer (the big ones first, then the bridges, the plaza, a water tower),
 * and clicking one gives a single true line about it, with Go There for the places you can visit in Club NYC.
 *
 * Two windows: the Empire State's 86th floor looking north up Midtown to Central Park, and One World Observatory
 * looking south over the harbor. Both are alive but calm, drawn over the painting: taxis creep up and down the
 * avenues (Fifth runs downtown, toward you, like the real one), the blimp drifts, boats cross the water trailing
 * small wakes. No timer, no score: found names turn yellow, and finding every one in a view is a stamp.
 *
 * Everything in the view lives in the painting's own pixels (3840 × 1648) and is drawn onto one canvas through the
 * camera; the names are DOM over the top so they stay the same readable size at any zoom.
 */

// ---------- the painting and the camera ----------
const IW = 3840
const IH = 1648
/** stage units per painting pixel at 1×: the painting fits the stage's height */
const S0 = H / IH
const ZMAX = 3

type Box = [number, number, number, number]
type BoatKind = 'ferry' | 'water' | 'tour' | 'tug' | 'motor'

interface Place {
  id: string
  name: string
  /** where it is in the painting (painting pixels) */
  at: Pt
  /** the zoom its name comes out at */
  z: number
  line: string
  /** a room in the game: shows Go There */
  room?: string
  /** a stretch of the city (a river, a neighborhood): the name alone, like a map label */
  area?: boolean
  /** which side of the pin the name sits on (above by default) */
  side?: 'right' | 'down'
}

interface View {
  key: string
  src: string
  title: string
  sub: string
  stamp: string
  /** the painting's horizon line: things shrink toward it */
  horizon: number
  places: Place[]
  /** avenues, near end first: the taxis on them, which way they run (1 = uptown, away from you) */
  avenues: { lane: Pt[]; half: number; dir: 1 | -1; n: number; speed: number }[]
  boats: { kind: BoatKind; lane: Pt[]; size: number; speed: number; phase: number }[]
  sails: { at: Pt; size: number }[]
  /** the painted blimp's box: it gets lifted off the sky and drifts nose first */
  blimp?: Box
  ambience: 'horns' | 'foghorn'
  /** seen through the deck's coin-op binoculars: two round lenses, dark all round (the other view is at the glass) */
  lens?: boolean
}

/** the outline of the two lenses, in stage units (also in cityView.css, for the names) */
const LENS = 'M500 72.7A270 270 0 1 0 500 492.3A270 270 0 1 0 500 72.7Z'
const lensSvg = `<svg class="cv-scope" viewBox="0 0 1000 565" preserveAspectRatio="none" aria-hidden="true">
  <defs>
    <clipPath id="cv-lens-clip"><path d="${LENS}"/></clipPath>
    <filter id="cv-lens-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="24"/></filter>
    <filter id="cv-lens-fringe" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="2.2"/></filter>
    <filter id="cv-lens-glare" x="-30%" y="-60%" width="160%" height="220%"><feGaussianBlur stdDeviation="14"/></filter>
  </defs>
  <g clip-path="url(#cv-lens-clip)">
    <path d="${LENS}" fill="none" stroke="#03040a" stroke-width="96" filter="url(#cv-lens-soft)" opacity="0.85"/>
    <path d="${LENS}" fill="none" stroke="#03040a" stroke-width="22" filter="url(#cv-lens-fringe)" opacity="0.75"/>
    <g style="mix-blend-mode:screen" fill="none" stroke-width="7" filter="url(#cv-lens-fringe)">
      <path d="${LENS}" stroke="#ff6a4a" opacity="0.5" transform="translate(-26 0) scale(1.052 1)"/>
      <path d="${LENS}" stroke="#46c8ff" opacity="0.5" transform="translate(-21 -11.300) scale(1.042 1.040)"/>
    </g>
    <g fill="#fff" filter="url(#cv-lens-glare)">
      <ellipse cx="228" cy="150" rx="150" ry="34" opacity="0.13" transform="rotate(-32 228 150)"/>
      <ellipse cx="598" cy="132" rx="130" ry="26" opacity="0.1" transform="rotate(-32 598 132)"/>
      <ellipse cx="770" cy="440" rx="120" ry="18" opacity="0.06" transform="rotate(-32 770 440)"/>
      <ellipse cx="420" cy="452" rx="100" ry="14" opacity="0.05" transform="rotate(-32 420 452)"/>
    </g>
  </g>
  <path d="M0 0H1000V565H0Z${LENS}" fill-rule="evenodd" fill="#05060d"/>
  <path d="${LENS}" fill="none" stroke="#000" stroke-width="9"/>
  <path d="${LENS}" fill="none" stroke="#3a3f5c" stroke-width="1.5" opacity="0.7"/>
</svg>`

// the blimp's spot moves; its name follows it
const blimpAt: Pt = [2668, 122]

const EMPIRE: View = {
  key: 'empire',
  src: '/art/places/view-empire.jpg',
  title: 'Empire State Building',
  sub: '86th Floor, Looking North',
  stamp: 'city-spotter',
  horizon: 330,
  places: [
    { id: 'chrysler', name: 'Chrysler Building', at: [3040, 560], z: 1, line: 'Its spire was built in secret inside the crown, then raised in about 90 minutes to beat a rival downtown.' },
    { id: 'park', name: 'Central Park', at: [2060, 530], z: 1, room: 'central-park', line: '843 acres. Monaco is smaller.' },
    { id: 'midtown', name: 'Midtown', at: [1250, 900], z: 1, area: true, line: 'The biggest business district in the country. Mostly elevators.' },
    { id: 'hudson', name: 'Hudson River', at: [560, 612], z: 1, area: true, line: 'The Hudson is tidal all the way up to Troy, about 150 miles north. It flows both ways.' },
    { id: 'east', name: 'East River', at: [3700, 765], z: 1, area: true, line: 'Not actually a river. It’s a tidal strait between the harbor and Long Island Sound.' },
    { id: 'blimp', name: 'The Blimp', at: blimpAt, z: 1, line: 'The spire over your head was built as a mooring mast for airships. The wind had other plans.' },
    { id: 'fifth', name: 'Fifth Avenue', at: [2700, 1180], z: 1.3, area: true, room: 'fifth-ave', line: 'Fifth Avenue splits the East Side from the West Side. This building is number 350.' },
    { id: 'queensboro', name: 'Queensboro Bridge', at: [3555, 622], z: 1.4, line: 'Opened in 1909. Most New Yorkers call it the 59th Street Bridge.' },
    { id: 'rock', name: 'Rockefeller Center', at: [1515, 1290], z: 1.6, room: 'rockefeller', side: 'down', line: 'The gold figure is Prometheus, there since 1934. The rink at his feet opened in 1936.' },
    { id: 'reservoir', name: 'The Reservoir', at: [2200, 446], z: 1.7, line: 'The running path around it is 1.58 miles. Joggers know that number by heart.' },
    { id: 'museum', name: 'Museum Mile', at: [2470, 470], z: 1.8, area: true, room: 'the-met', line: 'Fifth Avenue along the park, from 82nd Street up. The Met is the first stop.' },
    { id: 'tank', name: 'Water Tower', at: [1882, 1282], z: 2.1, line: 'City pressure only pushes water up about six floors, so taller buildings keep a tank on the roof. Most are still wood.' },
  ],
  avenues: [
    // the avenue that runs straight up the middle to the park, uptown
    { lane: [[2117, 1660], [2137, 1300], [2154, 925], [2168, 700]], half: 40, dir: 1, n: 4, speed: 62 },
    // the one past Rockefeller Center, downtown
    { lane: [[1580, 1645], [1717, 1240], [1794, 990]], half: 34, dir: -1, n: 3, speed: 56 },
    // Fifth Avenue, along the park's east side, downtown (it's one-way, toward you). Buildings hide a stretch of it,
    // so it's two runs: the taxis slip behind the corner and come out lower down
    { lane: [[2492, 612], [2535, 740], [2565, 822]], half: 26, dir: -1, n: 2, speed: 58 },
    { lane: [[2668, 1068], [2700, 1125], [2742, 1260], [2782, 1400], [2800, 1500], [2815, 1600]], half: 30, dir: -1, n: 3, speed: 58 },
  ],
  boats: [
    { kind: 'tour', lane: [[320, 640], [500, 590], [760, 500], [1000, 405]], size: 330, speed: 34, phase: 0.15 },
    { kind: 'water', lane: [[1000, 405], [760, 500], [500, 590], [320, 640]], size: 240, speed: 40, phase: 0.55 },
    { kind: 'water', lane: [[3790, 805], [3690, 780], [3600, 758]], size: 170, speed: 26, phase: 0.3 },
  ],
  sails: [],
  blimp: [2550, 66, 232, 114],
  ambience: 'horns',
  lens: true,
}

const HARBOR: View = {
  key: 'harbor',
  src: '/art/places/view-harbor.jpg',
  title: 'One World Observatory',
  sub: '100th Floor, Looking South',
  stamp: 'harbor-spotter',
  horizon: 265,
  places: [
    { id: 'liberty', name: 'Statue of Liberty', at: [2058, 468], z: 1, room: 'liberty-island', side: 'right', line: 'She was copper-brown when she arrived in 1886. The green came later, all on its own.' },
    { id: 'ferry', name: 'Staten Island Ferry', at: [790, 836], z: 1, line: 'Free, every day, all night. About 25 minutes to Staten Island.' },
    { id: 'bb', name: 'Brooklyn Bridge', at: [850, 492], z: 1, room: 'brooklyn-bridge', line: 'Opened in 1883. For twenty years it was the longest suspension bridge in the world.' },
    { id: 'battery', name: 'Battery Park', at: [1650, 1470], z: 1, room: 'battery-park', line: 'Named for the cannons that once guarded the harbor. The ferries to Lady Liberty leave from here.' },
    { id: 'jc', name: 'Jersey City', at: [3380, 430], z: 1, area: true, line: 'New Jersey’s tallest building is in that skyline. Yes, that’s another state.' },
    { id: 'ellis', name: 'Ellis Island', at: [2410, 448], z: 1.3, line: 'About 12 million immigrants came through here between 1892 and 1954.' },
    { id: 'governors', name: 'Governors Island', at: [2680, 600], z: 1.3, line: 'A military base for about 200 years. Now it’s a park, with hammocks.' },
    { id: 'fidi', name: 'Financial District', at: [2050, 1062], z: 1.3, area: true, room: 'wall-street', line: 'Wall Street is named for a wall the Dutch built in 1653 to keep the English out. It didn’t.' },
    { id: 'brooklyn', name: 'Brooklyn', at: [450, 330], z: 1.3, area: true, line: 'On its own, Brooklyn would be the fourth-biggest city in the country.' },
    { id: 'mb', name: 'Manhattan Bridge', at: [1120, 440], z: 1.6, line: 'Opened in 1909. The B, D, N and Q trains rattle across it in the open air.' },
    { id: 'tug', name: 'Tugboat', at: [382, 1092], z: 1.8, line: 'Tugboats push ships many times their size around the harbor. Small, loud, in charge.' },
  ],
  avenues: [],
  boats: [
    // far out past Ellis Island, small: a Staten Island Ferry crossing the bay
    { kind: 'ferry', lane: [[2980, 380], [2650, 386], [2350, 393]], size: 800, speed: 26, phase: 0.2 },
    // a water taxi under the big ferry, heading for Brooklyn
    { kind: 'water', lane: [[1290, 958], [900, 966], [500, 975], [40, 985]], size: 250, speed: 42, phase: 0.05 },
    { kind: 'tour', lane: [[3050, 865], [2800, 858], [2550, 850]], size: 330, speed: 30, phase: 0.6 },
    { kind: 'tug', lane: [[3880, 1440], [3600, 1400], [3330, 1370]], size: 210, speed: 24, phase: 0.35 },
    { kind: 'motor', lane: [[60, 1560], [400, 1520], [760, 1480]], size: 150, speed: 46, phase: 0.7 },
  ],
  sails: [
    { at: [1560, 770], size: 150 },
    { at: [3500, 1250], size: 150 },
    { at: [230, 1240], size: 150 },
    { at: [2880, 330], size: 150 },
  ],
  ambience: 'foghorn',
}

export function viewFromEmpire(g: Game) {
  openView(g, EMPIRE)
}

export function viewFromOneWorld(g: Game) {
  openView(g, HARBOR)
}

// ---------- small helpers ----------
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const INK = '#1d2140'

/** a polyline you can walk along by fraction of its length */
function path(pts: Pt[]) {
  const segs = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]))
  const len = segs.reduce((a, b) => a + b, 0)
  return {
    len,
    /** [x, y, unit dx, unit dy] at fraction s */
    at(s: number): [number, number, number, number] {
      let d = clamp(s, 0, 1) * len
      for (let i = 0; i < segs.length; i++) {
        if (d <= segs[i] || i === segs.length - 1) {
          const k = segs[i] ? d / segs[i] : 0
          const [a, b] = [pts[i], pts[i + 1]]
          return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, (b[0] - a[0]) / segs[i], (b[1] - a[1]) / segs[i]]
        }
        d -= segs[i]
      }
      return [pts[0][0], pts[0][1], 1, 0]
    },
  }
}

/** lift the painted blimp off the sky: the sprite (blimp only) and a patch of the sky behind it */
function liftBlimp(img: HTMLImageElement, [bx, by, bw, bh]: Box) {
  const c = document.createElement('canvas')
  c.width = bw
  c.height = bh
  const x = c.getContext('2d', { willReadFrequently: true })!
  x.drawImage(img, bx, by, bw, bh, 0, 0, bw, bh)
  const d = x.getImageData(0, 0, bw, bh).data
  const idx = (i: number, j: number) => (j * bw + i) * 4
  // a cloud tucks in behind the tail: light and grey, unlike the sunset sky (and the blimp's own highlight sits
  // inside its outline, where the flood below can't reach)
  const cloudy = (k: number) => Math.min(d[k], d[k + 1], d[k + 2]) > 196
  // the sky behind: the painting's sunset runs in horizontal bands, so each row blends from its left edge to its
  // right edge (a row whose right edge is cloud just keeps the left edge's color)
  const side = (i0: number, j: number) => {
    const out = [0, 0, 0]
    let n = 0
    for (let jj = Math.max(0, j - 2); jj <= Math.min(bh - 1, j + 2); jj++) {
      for (let i = i0; i < i0 + 3; i++) {
        const k = idx(i, jj)
        if (cloudy(k)) continue
        out[0] += d[k]
        out[1] += d[k + 1]
        out[2] += d[k + 2]
        n++
      }
    }
    return n ? out.map((v) => v / n) : null
  }
  const sky = x.createImageData(bw, bh)
  const s = sky.data
  let lastL = [0, 0, 0]
  for (let j = 0; j < bh; j++) {
    const L = side(0, j) ?? lastL
    lastL = L
    const R = side(bw - 3, j) ?? L
    for (let i = 0; i < bw; i++) {
      const u = i / (bw - 1)
      const k = idx(i, j)
      for (let ch = 0; ch < 3; ch++) s[k + ch] = L[ch] + (R[ch] - L[ch]) * u
      s[k + 3] = 255
    }
  }
  // what isn't sky: flood the sky (and the cloud) in from the edges; whatever it can't reach is the blimp
  const diff = (k: number) => Math.max(Math.abs(d[k] - s[k]), Math.abs(d[k + 1] - s[k + 1]), Math.abs(d[k + 2] - s[k + 2]))
  const skyish = new Uint8Array(bw * bh)
  const queue: number[] = []
  const seed = (i: number, j: number) => {
    const p = j * bw + i
    if (!skyish[p] && (diff(p * 4) < 34 || cloudy(p * 4))) {
      skyish[p] = 1
      queue.push(p)
    }
  }
  for (let i = 0; i < bw; i++) (seed(i, 0), seed(i, bh - 1))
  for (let j = 0; j < bh; j++) (seed(0, j), seed(bw - 1, j))
  while (queue.length) {
    const p = queue.pop()!
    const i = p % bw
    const j = (p - i) / bw
    if (i > 0) seed(i - 1, j)
    if (i < bw - 1) seed(i + 1, j)
    if (j > 0) seed(i, j - 1)
    if (j < bh - 1) seed(i, j + 1)
  }
  const sprite = x.createImageData(bw, bh)
  const o = sprite.data
  for (let j = 0; j < bh; j++) {
    for (let i = 0; i < bw; i++) {
      const p = j * bw + i
      const k = p * 4
      o[k] = d[k]
      o[k + 1] = d[k + 1]
      o[k + 2] = d[k + 2]
      if (!skyish[p]) o[k + 3] = 255
      else {
        // the soft rim: sky pixels touching the blimp keep a little of its outline
        const near = (i > 0 && !skyish[p - 1]) || (i < bw - 1 && !skyish[p + 1]) || (j > 0 && !skyish[p - bw]) || (j < bh - 1 && !skyish[p + bw])
        o[k + 3] = near && !cloudy(k) ? clamp((diff(k) - 6) * 7, 0, 200) : 0
      }
    }
  }
  // the cloud's tip stays where it was, in front of the patch
  for (let j = 0; j < bh; j++) {
    for (let i = Math.floor(bw * 0.7); i < bw; i++) {
      const k = idx(i, j)
      if (skyish[j * bw + i] && cloudy(k)) {
        s[k] = d[k]
        s[k + 1] = d[k + 1]
        s[k + 2] = d[k + 2]
      }
    }
  }
  const patch = document.createElement('canvas')
  patch.width = bw
  patch.height = bh
  patch.getContext('2d')!.putImageData(sky, 0, 0)
  const blimp = document.createElement('canvas')
  blimp.width = bw
  blimp.height = bh
  blimp.getContext('2d')!.putImageData(sprite, 0, 0)
  return { patch, blimp }
}

// ---------- drawing the city's moving bits (all in painting pixels) ----------
function drawTaxi(c: CanvasRenderingContext2D, x: number, y: number, dx: number, dy: number, f: number, a: number) {
  const L = 39 * f
  const w = 18 * f
  c.save()
  c.globalAlpha = a
  c.translate(x, y)
  c.rotate(Math.atan2(dy, dx))
  c.beginPath()
  c.roundRect(-L / 2, -w / 2, L, w, w * 0.32)
  c.fillStyle = '#ffc928'
  c.fill()
  c.lineWidth = Math.max(1.2, 3 * f)
  c.strokeStyle = INK
  c.stroke()
  c.fillStyle = '#3b4a7a'
  c.fillRect(L * 0.1, -w * 0.34, L * 0.15, w * 0.68)
  c.fillRect(-L * 0.32, -w * 0.32, L * 0.1, w * 0.64)
  c.fillStyle = '#fff6cf'
  c.fillRect(-L * 0.08, -w * 0.15, L * 0.1, w * 0.3)
  c.restore()
}

/** the painting's boats are seen from high up and a little to the side: a hull side, a deck you look down on,
 *  cabins with their roofs showing, a soft reflection. Ours copy that, small. */
const BOATS: Record<BoatKind, { hull: string; deck: string; trim?: string }> = {
  // the Staten Island Ferry: orange all over, double-ended, a pilot house at each end
  ferry: { hull: '#ee7a1f', deck: '#f6a24e' },
  // a New York Water Taxi: yellow, with the checkered band
  water: { hull: '#ffd23f', deck: '#fff0b0' },
  tour: { hull: '#fbfaf6', deck: '#e6ebf3', trim: '#3f74c4' },
  tug: { hull: '#d9473a', deck: '#a93a30' },
  motor: { hull: '#fbfaf6', deck: '#e9edf3', trim: '#2b3f6e' },
}

/** a boat side-on, bow to the right (the caller flips it), sitting on the waterline at (0, 0) */
function boatShape(c: CanvasRenderingContext2D, kind: BoatKind, L: number, lw: number) {
  const k = BOATS[kind]
  const h = L * 0.1
  const dep = L * 0.07
  const blunt = kind === 'ferry' || kind === 'tug'
  const hullPath = () => {
    c.beginPath()
    c.moveTo(-L / 2, -h)
    c.lineTo(L / 2, -h * (blunt ? 1 : 1.15))
    c.lineTo(L / 2 - h * (blunt ? 0.6 : 1.2), 0)
    c.lineTo(-L / 2 + h * (kind === 'ferry' ? 0.6 : 0.4), 0)
    c.closePath()
  }
  // the reflection, then the hull's own shadow line on the water
  c.save()
  c.scale(1, -0.55)
  c.globalAlpha *= 0.2
  hullPath()
  c.fillStyle = k.hull
  c.fill()
  c.restore()
  c.lineWidth = lw
  c.strokeStyle = INK
  c.lineJoin = 'round'
  // the deck, seen from above
  c.beginPath()
  c.moveTo(-L / 2, -h)
  c.lineTo(-L / 2 + dep * 0.6, -h - dep)
  c.lineTo(L / 2 - dep * (blunt ? 0.6 : 1.6), -h * (blunt ? 1 : 1.15) - dep)
  c.lineTo(L / 2, -h * (blunt ? 1 : 1.15))
  c.closePath()
  c.fillStyle = k.deck
  c.fill()
  c.stroke()
  hullPath()
  c.fillStyle = k.hull
  c.fill()
  c.stroke()
  /** a cabin: its side, with a row of windows, and its roof showing above */
  const cabin = (x0: number, w: number, y0: number, hh: number, side: string, roof: string, win: string, n: number) => {
    c.beginPath()
    c.moveTo(x0, y0 - hh)
    c.lineTo(x0 + dep * 0.4, y0 - hh - dep * 0.7)
    c.lineTo(x0 + w - dep * 0.2, y0 - hh - dep * 0.7)
    c.lineTo(x0 + w, y0 - hh)
    c.closePath()
    c.fillStyle = roof
    c.fill()
    c.stroke()
    c.beginPath()
    c.rect(x0, y0 - hh, w, hh)
    c.fillStyle = side
    c.fill()
    c.stroke()
    if (n) {
      c.fillStyle = win
      const gap = w / n
      for (let i = 0; i < n; i++) c.fillRect(x0 + i * gap + gap * 0.22, y0 - hh * 0.72, gap * 0.56, hh * 0.42)
    }
  }
  const top = -h - dep * 0.4
  if (kind === 'ferry') {
    c.fillStyle = '#b5520f'
    c.fillRect(-L / 2 + h * 0.5, -h * 0.55, L - h, h * 0.16)
    cabin(-L * 0.42, L * 0.84, top, h * 1.05, '#f7963a', '#ffc27a', '#a8480f', 12)
    cabin(-L * 0.3, L * 0.6, top - h * 1.05 - dep * 0.5, h * 0.85, '#f7963a', '#ffc27a', '#a8480f', 8)
    cabin(-L * 0.4, L * 0.1, top - h * 1.05 - dep * 0.5, h * 0.6, '#fbfaf6', '#ffffff', '#2b3f6e', 1)
    cabin(L * 0.3, L * 0.1, top - h * 1.05 - dep * 0.5, h * 0.6, '#fbfaf6', '#ffffff', '#2b3f6e', 1)
  } else if (kind === 'water') {
    c.save()
    hullPath()
    c.clip()
    const sq = h * 0.28
    for (let i = 0; i * sq < L; i++) {
      for (let r = 0; r < 2; r++) {
        c.fillStyle = (i + r) % 2 ? INK : '#fbfaf6'
        c.fillRect(-L / 2 + i * sq, -h * 0.66 + r * sq * 0.5, sq, sq * 0.5)
      }
    }
    c.restore()
    cabin(-L * 0.3, L * 0.48, top, h * 1.05, '#fbfaf6', '#ffffff', '#2b3f6e', 5)
  } else if (kind === 'tour') {
    c.fillStyle = k.trim!
    c.fillRect(-L / 2 + h * 0.5, -h * 0.58, L - h * 1.7, h * 0.2)
    cabin(-L * 0.4, L * 0.7, top, h * 1.0, '#fbfaf6', '#ffffff', '#3f74c4', 10)
    cabin(-L * 0.3, L * 0.46, top - h - dep * 0.5, h * 0.85, '#fbfaf6', '#ffffff', '#3f74c4', 6)
  } else if (kind === 'tug') {
    c.fillStyle = INK
    c.fillRect(-L / 2, -h * 1.0, L, h * 0.2)
    cabin(-L * 0.18, L * 0.34, top, h * 1.5, '#fbfaf6', '#ffffff', '#2b3f6e', 3)
    cabin(-L * 0.1, L * 0.2, top - h * 1.5 - dep * 0.5, h * 0.9, '#fbfaf6', '#ffffff', '#2b3f6e', 2)
    cabin(-L * 0.34, L * 0.07, top - h * 0.4, h * 1.9, '#d9473a', INK, '#d9473a', 0)
  } else {
    c.fillStyle = k.trim!
    c.fillRect(-L / 2 + h * 0.4, -h * 0.55, L - h * 1.7, h * 0.16)
    cabin(-L * 0.14, L * 0.28, top, h * 0.9, '#fbfaf6', '#cfe3f5', '#2b3f6e', 2)
  }
}

/** a wake trailing behind a boat: broken white streaks that spread, drift back and fade */
function drawWake(c: CanvasRenderingContext2D, x: number, y: number, bx: number, by: number, L: number, t: number) {
  // the V spreads across the water, which we see from above at a slant: flatten it a little
  const nx = -by
  const ny = bx * 0.6
  const fade = (len: number, a: number) => {
    const g = c.createLinearGradient(x, y, x + bx * L * len, y + by * L * len)
    g.addColorStop(0, `rgba(255,255,255,${a})`)
    g.addColorStop(1, 'rgba(255,255,255,0)')
    return g
  }
  c.save()
  c.lineCap = 'round'
  // the two arms of the V, dashed, the dashes sliding back as the boat moves on
  c.setLineDash([L * 0.18, L * 0.07])
  c.lineDashOffset = -t * L * 0.5
  c.lineWidth = L * 0.03
  for (const side of [-1, 1]) {
    c.strokeStyle = fade(1.5, 0.85)
    c.beginPath()
    c.moveTo(x, y)
    c.quadraticCurveTo(x + bx * L * 0.75 + nx * side * L * 0.05, y + by * L * 0.75 + ny * side * L * 0.05, x + bx * L * 1.5 + nx * side * L * 0.22, y + by * L * 1.5 + ny * side * L * 0.22)
    c.stroke()
  }
  // the churned water right behind the stern
  c.setLineDash([])
  c.strokeStyle = fade(0.8, 0.9)
  c.lineWidth = L * 0.06
  c.beginPath()
  c.moveTo(x, y)
  c.lineTo(x + bx * L * 0.8, y + by * L * 0.8)
  c.stroke()
  c.restore()
}

function drawSail(c: CanvasRenderingContext2D, x: number, y: number, size: number, tilt: number, lw: number) {
  c.save()
  c.translate(x, y)
  const L = size * 0.55
  const h = size * 0.1
  // its reflection first, wobbling a little less than the boat
  c.save()
  c.scale(1, -0.3)
  c.globalAlpha *= 0.12
  c.fillStyle = '#fbfaf6'
  c.beginPath()
  c.moveTo(-L * 0.05, -size)
  c.lineTo(L * 0.42, -h)
  c.lineTo(-L * 0.46, -h)
  c.closePath()
  c.fill()
  c.restore()
  c.rotate(tilt)
  c.lineWidth = lw
  c.strokeStyle = INK
  c.lineJoin = 'round'
  // hull, with the deck showing
  c.beginPath()
  c.moveTo(-L / 2, -h)
  c.lineTo(-L / 2 + h * 0.5, -h * 1.5)
  c.lineTo(L / 2 - h * 0.8, -h * 1.6)
  c.lineTo(L / 2, -h * 1.15)
  c.closePath()
  c.fillStyle = '#e4e9f1'
  c.fill()
  c.stroke()
  c.beginPath()
  c.moveTo(-L / 2, -h)
  c.lineTo(L / 2, -h * 1.15)
  c.lineTo(L * 0.32, 0)
  c.lineTo(-L * 0.4, 0)
  c.closePath()
  c.fillStyle = '#fbfaf6'
  c.fill()
  c.stroke()
  c.fillStyle = '#d9473a'
  c.fillRect(-L * 0.42, -h * 0.55, L * 0.8, h * 0.18)
  // mainsail (a little full) and jib
  c.beginPath()
  c.moveTo(-L * 0.04, -size)
  c.lineTo(-L * 0.04, -h * 1.6)
  c.lineTo(-L * 0.46, -h * 1.6)
  c.quadraticCurveTo(-L * 0.3, -size * 0.5, -L * 0.04, -size)
  c.closePath()
  c.fillStyle = '#fbfaf6'
  c.fill()
  c.stroke()
  c.beginPath()
  c.moveTo(L * 0.02, -size * 0.92)
  c.quadraticCurveTo(L * 0.3, -size * 0.45, L * 0.42, -h * 1.6)
  c.lineTo(L * 0.02, -h * 1.6)
  c.closePath()
  c.fillStyle = '#eef3fb'
  c.fill()
  c.stroke()
  c.restore()
}

// ---------- the view ----------
function openView(g: Game, v: View) {
  const release = hold()
  const still = reduced()
  const root = el('div', v.lens ? 'cv cv-lens' : 'cv')
  root.innerHTML = `<canvas class="cv-canvas" aria-hidden="true"></canvas>
    <div class="cv-glass" aria-hidden="true"></div>
    <div class="cv-pins"></div>
    ${v.lens ? lensSvg : ''}
    <div class="cv-caption cv-ui"><b>${v.title}</b><span>${v.sub}</span></div>
    <div class="cv-actions cv-ui"><button class="btn tiny ghost cv-leave" type="button">Step Back</button></div>
    <div class="cv-zoom cv-ui"><button class="btn small ghost cv-in" type="button" aria-label="Zoom In">+</button><button class="btn small ghost cv-out" type="button" aria-label="Zoom Out">&minus;</button></div>
    <p class="cv-hint" aria-live="polite"></p>
    <div class="cv-line cv-ui" aria-live="polite"><p></p><button class="btn small go cv-go" type="button">Go There</button></div>`
  stage.root.append(root)
  // whatever had the keyboard (the chat bar, a button in the room) lets go of it
  ;(document.activeElement as HTMLElement | null)?.blur?.()
  const canvas = root.querySelector<HTMLCanvasElement>('.cv-canvas')!
  const ctx = canvas.getContext('2d')!
  const pinLayer = root.querySelector<HTMLElement>('.cv-pins')!
  const hint = root.querySelector<HTMLElement>('.cv-hint')!
  const lineBox = root.querySelector<HTMLElement>('.cv-line')!
  const lineText = lineBox.querySelector('p')!
  const goBtn = root.querySelector<HTMLButtonElement>('.cv-go')!
  const zoomInBtn = root.querySelector<HTMLButtonElement>('.cv-in')!
  const zoomOutBtn = root.querySelector<HTMLButtonElement>('.cv-out')!

  // ---------- canvas resolution: stage units times the stage's scale times the screen's density ----------
  let k = 1
  const fit = () => {
    k = Math.min(2, window.devicePixelRatio || 1) * stage.scale
    canvas.width = Math.round(W * k)
    canvas.height = Math.round(H * k)
  }
  fit()
  window.addEventListener('resize', fit)

  // ---------- the camera: a zoom and the painting point at the middle of the stage ----------
  let z = still ? 1 : 1.12
  let cx = IW / 2
  let cy = IH / 2
  const sc = () => S0 * z
  const clampCam = () => {
    const s = sc()
    const hw = W / 2 / s
    const hh = H / 2 / s
    cx = hw >= IW / 2 ? IW / 2 : clamp(cx, hw, IW - hw)
    cy = hh >= IH / 2 ? IH / 2 : clamp(cy, hh, IH - hh)
  }
  const toImg = (p: Pt): Pt => [cx + (p[0] - W / 2) / sc(), cy + (p[1] - H / 2) / sc()]
  const toScr = (p: Pt): Pt => [(p[0] - cx) * sc() + W / 2, (p[1] - cy) * sc() + H / 2]
  /** zoom with the painting point under `a` (stage units) staying under it */
  const zoomAt = (nz: number, a: Pt) => {
    const p = toImg(a)
    z = clamp(nz, 1, ZMAX)
    cx = p[0] - (a[0] - W / 2) / sc()
    cy = p[1] - (a[1] - H / 2) / sc()
    clampCam()
  }
  clampCam()

  // where the camera is headed: a smooth zoom toward a point, a glide to a place, a fling after a drag
  let zoomTo: { z: number; a: Pt } | null = null
  let glide: { t: number; from: [number, number, number]; to: [number, number, number] } | null = null
  let vx = 0
  let vy = 0
  const keys = new Set<string>()
  const stopMotion = () => {
    glide = null
    vx = vy = 0
  }
  const zoomBy = (factor: number, a: Pt) => {
    glide = null
    const target = clamp((zoomTo?.z ?? z) * factor, 1, ZMAX)
    if (still) zoomAt(target, a)
    else zoomTo = { z: target, a }
    used('zoom')
  }

  // ---------- the painting ----------
  const img = new Image()
  img.src = v.src
  let ready = false
  let lifted: { patch: HTMLCanvasElement; blimp: HTMLCanvasElement } | null = null
  img
    .decode()
    .then(() => {
      if (!root.isConnected) return
      if (v.blimp) {
        try {
          lifted = liftBlimp(img, v.blimp)
        } catch {
          lifted = null
        }
      }
      ready = true
      root.classList.add('ready')
      // stepping up to the glass: the view settles back to fit
      if (!still && !glide && z > 1) zoomTo = { z: 1, a: [W / 2, H / 2] }
    })
    .catch(() => {
      ready = img.complete && img.naturalWidth > 0
    })

  // ---------- the moving city ----------
  const persp = (y: number) => clamp((y - v.horizon) / (IH - v.horizon), 0.04, 1)
  const taxis = v.avenues.flatMap((a) => {
    const p = path(a.lane)
    return Array.from({ length: a.n }, (_, i) => ({ a, p, lane: i % 2 ? 1 : -1, s: (i + Math.random() * 0.6) / a.n }))
  })
  const boats = v.boats.map((b) => ({ b, p: path(b.lane), s: b.phase }))
  const blimp = v.blimp ? { x: v.blimp[0], y: v.blimp[1] } : null

  let t = 0
  const draw = () => {
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    if (!ready) {
      ctx.fillStyle = '#1d2140'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      return
    }
    const s = sc()
    ctx.setTransform(k * s, 0, 0, k * s, k * (W / 2 - cx * s), k * (H / 2 - cy * s))
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0)
    // taxis, creeping along their avenues (two lanes each), smaller and slower toward the park
    for (const c of taxis) {
      const [x, y, dx, dy] = c.p.at(c.s)
      const f = persp(y)
      const off = c.lane * c.a.half * 0.45 * f
      const a = Math.min(1, c.s / 0.06, (1 - c.s) / 0.06)
      drawTaxi(ctx, x - dy * off, y + dx * off, dx * c.a.dir, dy * c.a.dir, f, a)
    }
    // boats, with their wakes
    for (const o of boats) {
      const [x, y0, dx, dy] = o.p.at(o.s)
      const f = persp(y0)
      const L = o.b.size * f
      const y = y0 + Math.sin(t * 1.6 + o.b.phase * 9) * L * 0.012
      const a = Math.min(1, o.s / 0.08, (1 - o.s) / 0.08)
      ctx.save()
      ctx.globalAlpha = a
      // the wake leaves the stern of the (side-on) hull and trails back along the water, mostly level
      const face = dx < 0 ? -1 : 1
      const wy = -dy * 0.35
      const wn = Math.hypot(1, wy)
      drawWake(ctx, x - face * L * 0.46, y - L * 0.01, -face / wn, wy / wn, L, t)
      ctx.translate(x, y)
      ctx.scale(face, 1)
      boatShape(ctx, o.b.kind, L, clamp(L * 0.022, 1.2, 3.5))
      ctx.restore()
    }
    for (const [i, sl] of v.sails.entries()) {
      const f = persp(sl.at[1])
      const size = sl.size * f
      const x = sl.at[0] + Math.sin(t * 0.05 + i * 2) * 40 * f
      drawSail(ctx, x, sl.at[1] + Math.sin(t * 1.3 + i) * size * 0.015, size, Math.sin(t * 0.9 + i * 1.7) * 0.045, clamp(size * 0.022, 1.2, 3))
    }
    // the blimp, lifted off its painted spot and drifting nose first (it points west)
    if (blimp && lifted && v.blimp) {
      ctx.drawImage(lifted.patch, v.blimp[0], v.blimp[1])
      ctx.drawImage(lifted.blimp, blimp.x, blimp.y)
    }
  }

  const step = (dt: number) => {
    t += dt
    for (const c of taxis) {
      const [, y] = c.p.at(c.s)
      const speed = c.a.speed * (c.lane > 0 ? 0.86 : 1) * persp(y)
      c.s = (((c.s + (c.a.dir * speed * dt) / c.p.len) % 1) + 1) % 1
    }
    for (const o of boats) {
      const [, y] = o.p.at(o.s)
      o.s = (o.s + (o.b.speed * persp(y) * dt) / o.p.len) % 1
    }
    if (blimp && v.blimp) {
      const w = v.blimp[2]
      blimp.x -= 6 * dt
      if (blimp.x + w < -60) blimp.x = IW + 60
      blimp.y = v.blimp[1] + Math.sin(t * 0.5) * 3
      blimpAt[0] = blimp.x + w * 0.48
      blimpAt[1] = blimp.y + 52
    }
  }

  // ---------- the names ----------
  const statKey = `cityview-${v.key}`
  const all = (1 << v.places.length) - 1
  let found = save.stats[statKey] ?? 0
  const pins = v.places.map((pl, i) => {
    const b = el('button', `cv-pin${pl.area ? ' area' : ''}${pl.side ? ' ' + pl.side : ''}${found & (1 << i) ? ' found' : ''}`)
    b.type = 'button'
    b.innerHTML = `<i class="cv-dot"></i><i class="cv-stem"></i><span class="cv-name">${pl.name}</span>`
    b.setAttribute('aria-label', pl.name)
    b.style.setProperty('--i', String(i))
    b.tabIndex = -1
    pinLayer.append(b)
    const name = b.querySelector<HTMLElement>('.cv-name')!
    b.onclick = (e) => {
      // a drag that ends over a name isn't a click (a key press on a focused name always is)
      if (dragged && e.detail) return
      pick(i)
    }
    return { pl, b, name, w: 0, on: false, below: false, flip: false, dx: 0 }
  })
  const layout = () => {
    for (const p of pins) {
      const [x, y] = toScr(p.pl.at)
      // a name only shows while the thing it names is in view (never pinned to the edge over something else)
      const on = z >= p.pl.z - 0.001 && x > 6 && x < W - 6 && y > 6 && y < H - 6
      if (on !== p.on) {
        p.on = on
        p.b.classList.toggle('on', on)
        p.b.tabIndex = on ? 0 : -1
      }
      p.b.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
      if (!on) continue
      // a pin near the top puts its name underneath (some always do); names never run off the sides
      const below = !p.pl.area && (p.pl.side === 'down' || (!p.pl.side && y < 66))
      if (below !== p.below) p.b.classList.toggle('below', (p.below = below))
      if (!p.w) p.w = p.name.offsetWidth
      if (p.pl.side === 'right') {
        // a name beside its pin moves to the other side near the right edge
        const flip = x + 14 + p.w > W - 10
        if (flip !== p.flip) p.b.classList.toggle('flip', (p.flip = flip))
      } else {
        const left = x - p.w / 2
        const dx = Math.round(clamp(left, 10, W - 10 - p.w) - left)
        if (dx !== p.dx) p.name.style.setProperty('--dx', `${(p.dx = dx)}px`)
      }
    }
  }

  // ---------- one true line at a time ----------
  let lineTimer = 0
  let shown = -1
  const showLine = (i: number) => {
    const pl = v.places[i]
    const swap = lineBox.classList.contains('on')
    lineBox.classList.remove('on')
    clearTimeout(lineTimer)
    lineTimer = window.setTimeout(
      () => {
        shown = i
        lineText.innerHTML = `<b>${pl.name}</b> ${pl.line}`
        goBtn.hidden = !pl.room
        lineBox.classList.add('on')
        lineTimer = window.setTimeout(hideLine, 9000)
      },
      swap ? 260 : 0,
    )
  }
  const hideLine = () => {
    if (lineBox.matches(':hover') || lineBox.contains(document.activeElement)) {
      lineTimer = window.setTimeout(hideLine, 2500)
      return
    }
    lineBox.classList.remove('on')
    shown = -1
  }
  goBtn.onclick = () => {
    const room = v.places[shown]?.room
    if (!room) return
    g.sfx.click()
    leave(() => g.goto(room))
  }

  const pick = (i: number) => {
    const pl = v.places[i]
    g.sfx.pop()
    used('click')
    showLine(i)
    if (!(found & (1 << i))) {
      found |= 1 << i
      pins[i].b.classList.add('found')
      save.stats[statKey] = found
      persist()
      if (found === all) {
        g.stamp(v.stamp)
        // every name found: they all give a little hop, one after another
        root.classList.add('cheer')
        window.setTimeout(() => root.classList.remove('cheer'), 2600)
      }
    }
    // lean in a little toward it
    const tz = Math.max(z, Math.min(ZMAX, pl.z + 0.35))
    const sz = z
    const [sx, sy] = [cx, cy]
    z = tz
    cx = pl.at[0]
    cy = pl.at[1]
    clampCam()
    const to: [number, number, number] = [cx, cy, z]
    z = sz
    cx = sx
    cy = sy
    zoomTo = null
    vx = vy = 0
    if (still) [cx, cy, z] = to
    else glide = { t: 0, from: [cx, cy, z], to }
  }

  // ---------- hints: 2 to 4 words, gone once you've done the thing ----------
  const done = new Set<string>()
  const HINTS: [string, string][] = [
    ['drag', 'Drag to look around'],
    ['zoom', 'Scroll to zoom in'],
    ['click', 'Click a name'],
  ]
  let hintNow = ''
  const showHint = () => {
    const next = HINTS.find(([k2]) => !done.has(k2))
    const text = next ? next[1] : ''
    if (text === hintNow) return
    hintNow = text
    hint.classList.remove('on')
    window.setTimeout(() => {
      if (!root.isConnected) return
      hint.textContent = text
      hint.classList.toggle('on', !!text)
    }, 300)
  }
  function used(what: string) {
    if (done.has(what)) return
    done.add(what)
    showHint()
  }
  const hintStart = window.setTimeout(showHint, 1200)

  // ---------- dragging (with a little fling), pinching, the wheel ----------
  const pointers = new Map<number, Pt>()
  let press: { start: Pt; last: Pt; hist: { p: Pt; t: number }[] } | null = null
  let pinch: { d0: number; z0: number; img: Pt } | null = null
  let dragged = false
  const mid = (): Pt => {
    const ps = [...pointers.values()]
    return [(ps[0][0] + ps[1][0]) / 2, (ps[0][1] + ps[1][1]) / 2]
  }
  const dist = () => {
    const ps = [...pointers.values()]
    return Math.hypot(ps[0][0] - ps[1][0], ps[0][1] - ps[1][1])
  }
  const down = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('.cv-ui')) return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const p = toStage(e)
    pointers.set(e.pointerId, p)
    stopMotion()
    zoomTo = null
    if (pointers.size === 1) {
      dragged = false
      press = { start: p, last: p, hist: [{ p, t: performance.now() }] }
    } else if (pointers.size === 2) {
      press = null
      dragged = true
      pinch = { d0: Math.max(10, dist()), z0: z, img: toImg(mid()) }
    }
  }
  const move = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return
    const p = toStage(e)
    pointers.set(e.pointerId, p)
    if (pinch && pointers.size >= 2) {
      const m = mid()
      z = clamp((pinch.z0 * dist()) / pinch.d0, 1, ZMAX)
      cx = pinch.img[0] - (m[0] - W / 2) / sc()
      cy = pinch.img[1] - (m[1] - H / 2) / sc()
      clampCam()
      used('zoom')
      return
    }
    if (!press) return
    if (!dragged && Math.hypot(p[0] - press.start[0], p[1] - press.start[1]) > 5) {
      dragged = true
      root.classList.add('dragging')
    }
    if (dragged) {
      cx -= (p[0] - press.last[0]) / sc()
      cy -= (p[1] - press.last[1]) / sc()
      clampCam()
      used('drag')
    }
    press.last = p
    const now = performance.now()
    press.hist.push({ p, t: now })
    while (press.hist.length > 2 && now - press.hist[0].t > 90) press.hist.shift()
  }
  const up = (e: PointerEvent) => {
    if (!pointers.has(e.pointerId)) return
    pointers.delete(e.pointerId)
    root.classList.remove('dragging')
    if (pinch) {
      if (pointers.size < 2) pinch = null
      if (pointers.size === 1) {
        const p = [...pointers.values()][0]
        press = { start: p, last: p, hist: [{ p, t: performance.now() }] }
      }
      return
    }
    if (press && dragged && !still) {
      // a fling: keep going the way you were dragging, then settle
      const now = performance.now()
      const h0 = press.hist[0]
      const dtm = now - h0.t
      if (dtm > 0 && dtm < 160) {
        vx = (-(press.last[0] - h0.p[0]) / sc() / dtm) * 1000
        vy = (-(press.last[1] - h0.p[1]) / sc() / dtm) * 1000
      }
    }
    press = null
  }
  root.addEventListener('pointerdown', down)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
  const wheel = (e: WheelEvent) => {
    e.preventDefault()
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
    const dy = e.deltaY * unit
    const dx = e.deltaX * unit
    if (!e.ctrlKey && Math.abs(dx) > Math.abs(dy)) {
      // a sideways swipe on a trackpad pans
      stopMotion()
      cx += dx / sc()
      clampCam()
      used('drag')
      return
    }
    // ctrl + wheel is a trackpad pinch: finer steps, so the same speed feels right
    zoomBy(Math.exp(-dy * (e.ctrlKey ? 0.012 : 0.0022)), toStage(e))
  }
  root.addEventListener('wheel', wheel, { passive: false })
  zoomInBtn.onclick = () => (g.sfx.click(), zoomBy(1.5, [W / 2, H / 2]))
  zoomOutBtn.onclick = () => (g.sfx.click(), zoomBy(1 / 1.5, [W / 2, H / 2]))

  // ---------- keys: arrows look around, + and - zoom, Escape steps back ----------
  const PAN_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']
  // the view covers the whole stage, so Tab stays inside it (never off into the chat bar hidden underneath)
  const focusables = () => [...root.querySelectorAll<HTMLElement>('.cv-pin.on, .cv-leave, .cv-zoom .btn:not(:disabled), .cv-line.on .cv-go:not([hidden])')]
  const keydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      return leave()
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      const f = focusables()
      const i = f.indexOf(document.activeElement as HTMLElement)
      f[e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i + 1) % f.length]?.focus()
      return
    }
    const tg = e.target as HTMLElement | null
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return
    if (PAN_KEYS.includes(e.key)) {
      e.preventDefault()
      e.stopPropagation()
      keys.add(e.key)
      stopMotion()
      used('drag')
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault()
      e.stopPropagation()
      zoomBy(1.5, [W / 2, H / 2])
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault()
      e.stopPropagation()
      zoomBy(1 / 1.5, [W / 2, H / 2])
    }
  }
  const keyup = (e: KeyboardEvent) => void keys.delete(e.key)
  window.addEventListener('keydown', keydown, true)
  window.addEventListener('keyup', keyup, true)
  const blur = () => keys.clear()
  window.addEventListener('blur', blur)

  // ---------- every frame ----------
  let raf = 0
  let last = performance.now()
  const frame = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (glide) {
      glide.t = Math.min(1, glide.t + dt / 0.9)
      const k2 = ease(glide.t)
      const [fx, fy, fz] = glide.from
      const [tx, ty, tz] = glide.to
      z = Math.exp(Math.log(fz) + (Math.log(tz) - Math.log(fz)) * k2)
      cx = fx + (tx - fx) * k2
      cy = fy + (ty - fy) * k2
      clampCam()
      if (glide.t >= 1) glide = null
    } else if (zoomTo) {
      const nz = z + (zoomTo.z - z) * (1 - Math.exp(-dt * 14))
      zoomAt(Math.abs(zoomTo.z - nz) < 0.002 ? zoomTo.z : nz, zoomTo.a)
      if (z === zoomTo.z) zoomTo = null
    }
    if (keys.size) {
      const sp = 460 / sc()
      if (keys.has('ArrowLeft')) cx -= sp * dt
      if (keys.has('ArrowRight')) cx += sp * dt
      if (keys.has('ArrowUp')) cy -= sp * dt
      if (keys.has('ArrowDown')) cy += sp * dt
      clampCam()
    }
    if (vx || vy) {
      const [ox, oy] = [cx, cy]
      cx += vx * dt
      cy += vy * dt
      clampCam()
      // stop at the painting's edge instead of sliding along it forever
      if (cx !== ox + vx * dt) vx = 0
      if (cy !== oy + vy * dt) vy = 0
      const decay = Math.exp(-dt * 4.2)
      vx *= decay
      vy *= decay
      if (Math.hypot(vx, vy) * sc() < 4) vx = vy = 0
    }
    if (!still) step(dt)
    draw()
    layout()
    zoomInBtn.disabled = z >= ZMAX - 0.01
    zoomOutBtn.disabled = z <= 1.01
    raf = requestAnimationFrame(frame)
  }
  if (still) step(0)
  // dev: cityViewSkip(60) runs the city a minute ahead (QA looks at where the blimp was)
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).cityViewSkip = (secs: number) => step(secs)
  raf = requestAnimationFrame(frame)

  // ---------- the sound up here: wind, and the city far below ----------
  let stopSound = () => {}
  const startSound = () => {
    const ac = audioCtx()
    if (!ac) return
    const len = ac.sampleRate * 4
    const buf = ac.createBuffer(1, len, ac.sampleRate)
    const d = buf.getChannelData(0)
    let lastS = 0
    for (let i = 0; i < len; i++) d[i] = (lastS = (lastS + 0.02 * (Math.random() * 2 - 1)) / 1.02) * 3.4
    const wind = ac.createBufferSource()
    wind.buffer = buf
    wind.loop = true
    const low = ac.createBiquadFilter()
    low.type = 'lowpass'
    low.frequency.value = 420
    const bed = ac.createGain()
    bed.gain.value = 0
    bed.gain.linearRampToValueAtTime(0.24, ac.currentTime + 2)
    // the wind rises and falls, slowly
    const lfo = ac.createOscillator()
    lfo.frequency.value = 0.07
    const depth = ac.createGain()
    depth.gain.value = 0.07
    lfo.connect(depth).connect(bed.gain)
    wind.connect(low).connect(bed).connect(ac.destination)
    wind.start()
    lfo.start()
    let next = 0
    const far = () => {
      const now = ac.currentTime
      const out = ac.createGain()
      const lp = ac.createBiquadFilter()
      lp.type = 'lowpass'
      out.connect(ac.destination)
      lp.connect(out)
      if (v.ambience === 'horns') {
        // a taxi a long way down leans on the horn, twice
        lp.frequency.value = 900
        out.gain.value = 0
        for (const [at, dur] of [[0, 0.13], [0.2, 0.22]]) {
          const o = ac.createOscillator()
          o.type = 'square'
          o.frequency.value = 400 + Math.random() * 40
          const env = ac.createGain()
          env.gain.setValueAtTime(0, now + at)
          env.gain.linearRampToValueAtTime(0.014, now + at + 0.02)
          env.gain.setValueAtTime(0.014, now + at + dur - 0.03)
          env.gain.linearRampToValueAtTime(0, now + at + dur)
          o.connect(env).connect(lp)
          o.start(now + at)
          o.stop(now + at + dur + 0.05)
        }
        out.gain.value = 1
        next = window.setTimeout(far, 9000 + Math.random() * 14000)
      } else {
        // a ship's horn out in the harbor: low, long, soft
        lp.frequency.value = 380
        out.gain.setValueAtTime(0, now)
        out.gain.linearRampToValueAtTime(0.05, now + 0.35)
        out.gain.setValueAtTime(0.05, now + 1.5)
        out.gain.linearRampToValueAtTime(0, now + 2.4)
        for (const f of [98, 147]) {
          const o = ac.createOscillator()
          o.type = 'sawtooth'
          o.frequency.value = f
          o.connect(lp)
          o.start(now)
          o.stop(now + 2.5)
        }
        next = window.setTimeout(far, 20000 + Math.random() * 16000)
      }
    }
    next = window.setTimeout(far, 4000 + Math.random() * 5000)
    stopSound = () => {
      clearTimeout(next)
      bed.gain.cancelScheduledValues(ac.currentTime)
      bed.gain.setValueAtTime(bed.gain.value, ac.currentTime)
      bed.gain.linearRampToValueAtTime(0, ac.currentTime + 0.5)
      setTimeout(() => (wind.stop(), lfo.stop()), 600)
      stopSound = () => {}
    }
  }
  startSound()
  onMute((m) => (m ? stopSound() : root.isConnected && !closed && startSound()))

  // ---------- stepping back ----------
  let closed = false
  function leave(after?: () => void) {
    if (closed) return
    closed = true
    cancelAnimationFrame(raf)
    clearTimeout(lineTimer)
    clearTimeout(hintStart)
    stopSound()
    window.removeEventListener('resize', fit)
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    window.removeEventListener('keydown', keydown, true)
    window.removeEventListener('keyup', keyup, true)
    window.removeEventListener('blur', blur)
    if (import.meta.env.DEV) delete (window as unknown as Record<string, unknown>).cityViewSkip
    root.classList.add('out')
    setTimeout(() => {
      root.remove()
      release()
      after?.()
    }, 500)
  }
  root.querySelector<HTMLElement>('.cv-leave')!.onclick = () => (g.sfx.click(), leave())
}
