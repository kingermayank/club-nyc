import { EYE_COLORS, HAIR_COLORS, OUTLINE as O, SKINS, shade, sigColor, tint, type HairStyle, type Look, type Slot } from './look'
import { ITEM, P, Pn, C, E, L, cap, blob, ink, type Ctx, type ItemDef } from './items'

let uidCounter = 0

// Layout (local units, feet at 0,0, y up is negative)
const HIP = { l: [-8.5, -38], r: [8.5, -38] }
const SHOULDER = { l: [-17, -67], r: [17, -67] }
const HAND = { l: [-24.5, -40], r: [24.5, -40] }

const TORSO = {
  normal: 'M -19 -66 C -19 -72 -14 -74 -9 -74 L 9 -74 C 14 -74 19 -72 19 -66 L 20 -42 C 20 -37 16 -34 11 -34 L -11 -34 C -16 -34 -20 -37 -20 -42 Z',
  long: 'M -19 -66 C -19 -71 -14 -73 -9 -73 L 9 -73 C 14 -73 19 -71 19 -66 L 22 -22 C 22 -19 19 -18 16 -18 L -16 -18 C -19 -18 -22 -19 -22 -22 Z',
  dress: 'M -19 -66 C -19 -71 -14 -73 -9 -73 L 9 -73 C 14 -73 19 -71 19 -66 L 17 -47 L 26 -23 C 27 -20 25 -19 22 -19 L -22 -19 C -25 -19 -27 -20 -26 -23 L -17 -47 Z',
}
const TORSO_SHADE = {
  normal: 'M 9 -74 C 14 -74 19 -72 19 -66 L 20 -42 C 20 -37 16 -34 11 -34 L 8 -34 C 11 -46 12 -62 9 -74 Z',
  long: 'M 9 -73 C 14 -73 19 -71 19 -66 L 22 -22 C 22 -19 19 -18 16 -18 L 10 -18 C 13 -36 13 -60 9 -73 Z',
  dress: 'M 9 -73 C 14 -73 19 -71 19 -66 L 17 -47 L 26 -23 C 27 -20 25 -19 22 -19 L 13 -19 C 16 -30 12 -50 9 -73 Z',
}
const HEAD_SCALE = 'translate(0 -74) scale(1.14) translate(0 74)'
const HEAD_SHADE = 'M 15 -126 A 30 30 0 0 1 -6 -70.6 C 14 -76 22 -98 15 -126 Z'
const SHADOW = 'rgba(25,20,70,.14)'
/** skin shades warm (a cool grey shadow turns deep skin tones ashy) */
const SKIN_SHADOW = 'rgba(122,46,26,.17)'

// ---------- hair ----------
const SLICK = 'M -31 -97 C -33 -126 -15 -137 2 -136 C 20 -135 34 -123 31 -97 C 27 -111 17 -118 5 -118 C -10 -118 -24 -111 -31 -97 Z'
const NAPE = 'M -31 -97 C -34 -123 -18 -136 2 -135 C 22 -134 35 -121 31 -97 C 31 -86 25 -78 18 -77 L -18 -77 C -25 -78 -31 -86 -31 -97 Z'

function curlyBack(flat: boolean): [number, number, number][] {
  if (flat) return [[-30, -96, 10], [30, -96, 10], [-27, -84, 9], [27, -84, 9]]
  const ring: [number, number, number][] = []
  for (let a = 180; a >= 0; a -= 30) {
    const r = (a * Math.PI) / 180
    ring.push([Math.cos(r) * 33, -106 - Math.sin(r) * 33, 12])
  }
  return [...ring, [-34, -86, 11], [34, -86, 11], [0, -110, 30]]
}

function hair(style: HairStyle, col: string, flat: boolean): { back: string; front: string; rear: string } {
  const s = shade(col, 0.18)
  switch (style) {
    case 'bald':
      return { back: '', front: '', rear: '' }
    case 'short':
      return {
        back: '',
        front: P('M -31 -97 C -34 -123 -18 -136 2 -135 C 22 -134 35 -121 31 -97 C 28 -105 24 -110 18 -112 C 14 -106 6 -105 -1 -110 C -7 -104 -17 -105 -23 -111 C -27 -107 -30 -102 -31 -97 Z', col),
        rear: P(NAPE, col),
      }
    case 'bob': {
      const back = P('M -35 -102 C -37 -129 -20 -139 0 -139 C 20 -139 37 -129 35 -102 L 36 -78 C 36 -73 32 -71 28 -73 L 0 -74 L -28 -73 C -32 -71 -36 -73 -36 -78 Z', s)
      return {
        back,
        front: P('M -32 -96 C -34 -126 -17 -138 0 -138 C 17 -138 34 -126 32 -96 L 31 -108 C 20 -113 10 -114 0 -114 C -10 -114 -20 -113 -31 -108 Z', col) +
          P('M -31 -108 L -34 -80 C -31 -77 -27 -78 -26 -82 L -26 -106 Z', col) + P('M 31 -108 L 34 -80 C 31 -77 27 -78 26 -82 L 26 -106 Z', col),
        rear: back.replace(s, col),
      }
    }
    case 'long': {
      const back = P('M -34 -102 C -36 -131 -18 -140 0 -140 C 18 -140 36 -131 34 -102 L 37 -62 C 37 -56 32 -54 27 -56 L 0 -57 L -27 -56 C -32 -54 -37 -56 -37 -62 Z', s)
      return {
        back,
        front: P('M -31 -96 C -34 -127 -16 -139 2 -138 C 24 -137 35 -123 31 -96 C 27 -109 16 -117 2 -117 C -12 -117 -24 -110 -31 -96 Z', col) +
          P('M -31 -104 C -34 -92 -34 -80 -31 -70 C -28 -71 -26 -78 -26 -90 Z', col) + P('M 31 -104 C 34 -92 34 -80 31 -70 C 28 -71 26 -78 26 -90 Z', col),
        rear: back.replace(s, col),
      }
    }
    case 'curly': {
      const back = blob(curlyBack(flat), s)
      const fringe: [number, number, number][] = flat
        ? [[-24, -114, 7], [24, -114, 7]]
        : [[-26, -111, 7], [-20, -121, 8], [-8, -126, 9], [5, -126, 9], [18, -121, 8], [26, -111, 7]]
      return { back, front: blob(fringe, col), rear: blob(curlyBack(flat), col) }
    }
    case 'bun': {
      const bun = flat ? '' : C(2, -140, 12, s) + Pn('M -6 -140 Q 2 -146 10 -140', 'none', `stroke="${O}" stroke-width="1.5"`)
      return { back: bun, front: P(SLICK, col), rear: bun + P(NAPE, col) }
    }
    case 'ponytail': {
      const tail = P('M 20 -126 C 42 -124 46 -98 40 -76 C 38 -69 31 -69 31 -76 C 35 -96 31 -110 16 -118 Z', s) + `<rect x="18" y="-127" width="6" height="7" rx="2" fill="#ff5a8a" stroke="${O}" stroke-width="1.6" transform="rotate(20 21 -123)"/>`
      return { back: tail, front: P(SLICK, col), rear: P(NAPE, col) + P('M -8 -112 C -10 -96 -8 -80 0 -68 C 8 -80 10 -96 8 -112 Z', col) }
    }
    case 'spiky':
      return {
        back: '',
        front: P('M -31 -96 L -36 -116 L -25 -115 L -24 -135 L -11 -126 L -1 -143 L 8 -128 L 22 -137 L 23 -120 L 35 -119 L 31 -96 C 26 -108 13 -112 0 -112 C -13 -112 -26 -108 -31 -96 Z', col),
        rear: P('M -31 -96 L -36 -116 L -25 -115 L -24 -135 L -11 -126 L -1 -143 L 8 -128 L 22 -137 L 23 -120 L 35 -119 L 31 -96 C 31 -86 25 -78 18 -77 L -18 -77 C -25 -78 -31 -86 -31 -96 Z', col),
      }
    case 'buzz':
      return {
        back: '',
        front: P('M -30 -101 C -31 -124 -16 -133 0 -133 C 16 -133 31 -124 30 -101 C 27 -113 15 -120 0 -120 C -15 -120 -27 -113 -30 -101 Z', col),
        rear: P('M -30 -100 C -31 -124 -16 -133 0 -133 C 16 -133 31 -124 30 -100 C 30 -88 24 -80 16 -80 L -16 -80 C -24 -80 -30 -88 -30 -100 Z', col),
      }
    case 'afro': {
      const ring: [number, number, number][] = []
      for (let a = 0; a < 360; a += 30) ring.push([Math.cos((a * Math.PI) / 180) * 38, -110 + Math.sin((a * Math.PI) / 180) * 36, 10])
      const puff: [number, number, number][] = flat ? [[-31, -94, 11], [31, -94, 11], [-29, -82, 10], [29, -82, 10]] : [...ring, [0, -110, 38]]
      const fringe: [number, number, number][] = flat ? [[-25, -112, 7], [25, -112, 7]] : [[-25, -113, 8], [-14, -121, 9], [0, -124, 9], [14, -121, 9], [25, -113, 8]]
      return { back: blob(puff, s), front: blob(fringe, col), rear: blob(puff, col) }
    }
    case 'puffs': {
      const puff = (x: number): [number, number, number][] => [[x, -130, 13], [x + Math.sign(x) * 8, -124, 9], [x - Math.sign(x) * 4, -140, 9]]
      const back = flat ? '' : blob([...puff(-30), ...puff(30)], s)
      return { back, front: P(SLICK, col), rear: (flat ? '' : blob([...puff(-30), ...puff(30)], col)) + P(NAPE, col) }
    }
    case 'locs': {
      const strand = (x: number, len: number, c: string) => cap(x, -108, x + Math.sign(x) * 2, -108 + len, 6.5, c) + `<circle cx="${x + Math.sign(x) * 2}" cy="${-108 + len}" r="2.6" fill="#e9c46a" stroke="${O}" stroke-width="1.2"/>`
      const back = [-35, -28, 28, 35].map((x) => strand(x, 46, s)).join('')
      return {
        back,
        front: P(SLICK, col) + strand(-31, 38, col) + strand(31, 38, col),
        rear: [-30, -20, -10, 0, 10, 20, 30].map((x) => strand(x || 0.01, 48, col)).join('') + P(NAPE, col),
      }
    }
    case 'twists': {
      const ring: [number, number, number][] = []
      for (let a = 168; a >= 12; a -= 17) ring.push([Math.cos((a * Math.PI) / 180) * 30, -106 - Math.sin((a * Math.PI) / 180) * 28, 7])
      const cap0: [number, number, number][] = flat ? [[-27, -100, 7], [27, -100, 7], [-28, -90, 6], [28, -90, 6]] : [...ring, [0, -122, 17]]
      return { back: '', front: blob(cap0, col), rear: blob([...cap0, [-26, -88, 8], [26, -88, 8], [0, -96, 26]], col) }
    }
    case 'fade': {
      if (flat) return hair('buzz', col, true)
      // a rounded high-top with tight-curl texture, faded short at the sides
      const top = 'M -28 -104 C -30 -113 -27 -119 -23 -123 C -23 -133 -18 -139 -9 -140 L 9 -140 C 18 -139 23 -133 23 -123 C 27 -119 30 -113 28 -104 C 22 -110 12 -113 0 -113 C -12 -113 -22 -110 -28 -104 Z'
      const curls = [[-14, -133], [-5, -135], [5, -135], [14, -133], [-17, -125], [-8, -127], [1, -128], [10, -127], [18, -124]]
        .map(([x, y]) => `<path d="M ${x - 2.5} ${y + 1} q 2.5 -3 5 0" fill="none" stroke="${shade(col, 0.32)}" stroke-width="1.5" stroke-linecap="round"/>`).join('')
      return {
        back: '',
        front: P(top, col) + curls + Pn('M -28 -104 C -29 -110 -27 -115 -24 -118 L -23 -112 C -25 -110 -27 -107 -28 -104 Z', shade(col, -0.25)) + Pn('M 28 -104 C 29 -110 27 -115 24 -118 L 23 -112 C 25 -110 27 -107 28 -104 Z', shade(col, -0.25)),
        rear: P(top, col) + P('M -29 -104 C -30 -92 -25 -82 -16 -80 L 16 -80 C 25 -82 30 -92 29 -104 Z', col),
      }
    }
    case 'sidepart': {
      // parted on one side, swept across the forehead
      const part = `<path d="M -20 -122 C -16 -130 -10 -134 -3 -136" fill="none" stroke="${shade(col, 0.3)}" stroke-width="1.6" stroke-linecap="round"/>`
      return {
        back: '',
        front: P('M -31 -96 C -34 -122 -20 -138 2 -138 C 24 -138 36 -122 31 -96 C 29 -106 25 -112 19 -116 C 6 -110 -10 -112 -20 -122 C -25 -114 -29 -106 -31 -96 Z', col) + (flat ? '' : part),
        rear: P(NAPE, col),
      }
    }
    case 'quiff': {
      // short sides, the front brushed up and back
      const sweep = `<path d="M -13 -127 C -5 -137 8 -138 18 -131 M -4 -122 C 4 -128 13 -128 21 -123" fill="none" stroke="${shade(col, 0.3)}" stroke-width="1.6" stroke-linecap="round"/>`
      return {
        back: '',
        front: flat ? P(SLICK, col) : P('M -31 -97 C -33 -118 -27 -128 -19 -131 C -17 -143 -2 -148 12 -144 C 27 -140 35 -126 31 -97 C 29 -105 26 -110 21 -113 C 12 -117 2 -118 -8 -115 C -18 -113 -27 -107 -31 -97 Z', col) + sweep,
        rear: P(NAPE, col),
      }
    }
    case 'crop':
      // a short textured crop with a choppy fringe
      return {
        back: '',
        front: P('M -31 -98 C -33 -124 -17 -136 1 -136 C 20 -136 34 -123 31 -98 L 27 -108 L 22 -113 L 17 -108.5 L 11 -114 L 5 -109 L -1 -114 L -7 -109 L -13 -114 L -19 -108.5 L -24 -113 L -28 -107 Z', col),
        rear: P(NAPE, col),
      }
    case 'wavy': {
      // shoulder-length waves, swept to one side
      const back = P('M -35 -102 C -38 -130 -19 -141 0 -141 C 19 -141 38 -130 35 -102 C 40 -92 34 -84 38 -74 C 41 -64 34 -58 27 -61 L 0 -62 L -27 -61 C -34 -58 -41 -64 -38 -74 C -34 -84 -40 -92 -35 -102 Z', s)
      return {
        back,
        front: P('M -32 -96 C -35 -126 -17 -139 1 -139 C 22 -139 36 -124 32 -96 C 29 -108 24 -114 16 -117 C 4 -112 -12 -113 -21 -121 C -27 -113 -31 -105 -32 -96 Z', col) +
          P('M -32 -104 C -37 -94 -33 -86 -36 -76 C -32 -73 -27 -78 -27 -90 Z', col) + P('M 32 -104 C 37 -94 33 -86 36 -76 C 32 -73 27 -78 27 -90 Z', col),
        rear: back.replace(s, col),
      }
    }
    case 'braids': {
      const braid = (x: number) => [-90, -82, -74, -66].map((y) => E(x, y, 6, 5, s, 2.4)).join('') + `<rect x="${x - 4}" y="-62" width="8" height="4" rx="2" fill="#ffd23f" stroke="${O}" stroke-width="1.4"/>`
      return {
        back: braid(-32) + braid(32),
        front: P('M -31 -97 C -33 -126 -15 -137 -1 -137 L -1 -118 C -14 -117 -25 -110 -31 -97 Z', col) + P('M 31 -97 C 33 -126 15 -137 1 -137 L 1 -118 C 14 -117 25 -110 31 -97 Z', col),
        rear: braid(-32) + braid(32) + P(NAPE, col),
      }
    }
  }
}

// ---------- hair, seen from behind ----------
/**
 * The back of the head. Every style covers the skull from crown to nape (so nobody reads as bald walking away from
 * the camera, hat or no hat), then adds its own silhouette: long hair hangs, curls are big, buns and tails show.
 * `flat` is the same style pressed down under a hat; it still covers the whole back of the head.
 */
function hairRear(style: HairStyle, col: string, flat: boolean): string {
  if (style === 'bald') return ''
  const n = parseInt(col.slice(1), 16)
  const dark = ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 < 80
  // strands and partings: a darker line on light hair, a lighter one on dark hair
  const line = dark ? tint(col, 0.22) : shade(col, 0.22)
  const st = (d: string, w = 1.7) => `<path d="${d}" fill="none" stroke="${line}" stroke-width="${w}" stroke-linecap="round" opacity=".85"/>`
  const mirror = (svg: string) => `<g transform="scale(-1 1)">${svg}</g>`
  const crown = st('M -1 -129 C -9 -123 -13 -112 -13 -99') + st('M 4 -129 C 12 -123 15 -112 14 -100') + st('M -22 -113 C -25 -105 -25 -96 -22 -89') + st('M 23 -112 C 25 -104 25 -96 22 -89')
  const curls = (pts: number[][]) => pts.map(([x, y]) => st(`M ${x - 4} ${y + 1.5} q 4 -5 8 0`, 1.6)).join('')
  switch (style) {
    case 'short':
    case 'sidepart':
      return P(NAPE, col) + crown
    case 'crop':
      return P('M -31 -97 C -34 -123 -18 -136 2 -135 C 22 -134 35 -121 31 -97 C 31 -90 29 -84 25 -80 L 20 -76 L 15 -80 L 10 -75.5 L 5 -80 L 0 -75.5 L -5 -80 L -10 -75.5 L -15 -80 L -20 -76 L -25 -80 C -29 -84 -31 -90 -31 -97 Z', col) + crown
    case 'quiff':
      if (flat) return P(NAPE, col) + crown
      return mirror(P('M -31 -97 C -33 -118 -27 -128 -19 -131 C -17 -143 -2 -148 12 -144 C 27 -140 35 -126 31 -97 C 31 -86 25 -78 18 -77 L -18 -77 C -25 -78 -31 -86 -31 -97 Z', col)) + crown
    case 'buzz':
      return P('M -30 -100 C -31 -124 -16 -133 0 -133 C 16 -133 31 -124 30 -100 C 30 -88 24 -80 16 -80 L -16 -80 C -24 -80 -30 -88 -30 -100 Z', col) + st('M -14 -84 Q 0 -81 14 -84', 1.4)
    case 'fade': {
      if (flat) return hairRear('buzz', col, true)
      // the high-top over sides clipped so short the skin shows through
      const sides = `<path d="M -29 -106 C -30 -92 -25 -82 -16 -80 L 16 -80 C 25 -82 30 -92 29 -106 Z" fill="${col}" fill-opacity=".5" stroke="${ink(col)}" stroke-opacity=".55" stroke-width="2.2" stroke-linejoin="round"/>`
      const top = 'M -29 -103 C -30 -113 -27 -119 -23 -123 C -23 -133 -18 -139 -9 -140 L 9 -140 C 18 -139 23 -133 23 -123 C 27 -119 30 -113 29 -103 C 20 -97 -20 -97 -29 -103 Z'
      return sides + P(top, col) + curls([[-14, -131], [-4, -133], [6, -133], [15, -130], [-18, -121], [-8, -123], [2, -124], [12, -122], [-12, -111], [0, -112], [12, -111]])
    }
    case 'bob':
      return P('M -35 -102 C -37 -129 -20 -139 0 -139 C 20 -139 37 -129 35 -102 L 36 -78 C 36 -73 32 -71 28 -73 L 0 -74 L -28 -73 C -32 -71 -36 -73 -36 -78 Z', col) +
        st('M 0 -136 L 0 -112') + st('M -19 -112 C -21 -100 -21 -90 -20 -79') + st('M -7 -104 L -7 -80') + st('M 7 -104 L 7 -80') + st('M 19 -112 C 21 -100 21 -90 20 -79')
    case 'long':
      return P('M -34 -102 C -36 -131 -18 -140 0 -140 C 18 -140 36 -131 34 -102 L 37 -62 C 37 -56 32 -54 27 -56 L 0 -57 L -27 -56 C -32 -54 -37 -56 -37 -62 Z', col) +
        st('M 0 -137 L 0 -110') + st('M -21 -112 C -23 -96 -24 -78 -24 -63') + st('M -8 -102 L -9 -63') + st('M 8 -102 L 9 -63') + st('M 21 -112 C 23 -96 24 -78 24 -63')
    case 'wavy':
      return P('M -35 -102 C -38 -130 -19 -141 0 -141 C 19 -141 38 -130 35 -102 C 40 -92 34 -84 38 -74 C 41 -64 34 -58 27 -61 L 0 -62 L -27 -61 C -34 -58 -41 -64 -38 -74 C -34 -84 -40 -92 -35 -102 Z', col) +
        st('M -2 -138 C -6 -128 2 -120 -2 -110') + [-22, -8, 8, 22].map((x) => st(`M ${x} -108 q -5 9 0 18 q 5 9 0 20`)).join('')
    case 'curly': {
      const body: [number, number, number][] = flat
        ? [[0, -100, 29], [-30, -96, 10], [30, -96, 10], [-28, -84, 10], [28, -84, 10], [-14, -80, 10], [0, -79, 10], [14, -80, 10]]
        : [...curlyBack(false), [-22, -80, 11], [0, -78, 11], [22, -80, 11], [0, -96, 26]]
      return blob(body, col) + curls(flat ? [[-18, -96], [0, -98], [18, -96], [-9, -86], [9, -86]] : [[-18, -124], [0, -130], [18, -124], [-26, -108], [-9, -112], [9, -112], [26, -108], [-18, -96], [0, -98], [18, -96], [-9, -84], [9, -84]])
    }
    case 'afro': {
      const ring: [number, number, number][] = []
      for (let a = 0; a < 360; a += 30) ring.push([Math.cos((a * Math.PI) / 180) * 38, -110 + Math.sin((a * Math.PI) / 180) * 36, 10])
      const body: [number, number, number][] = flat ? [[0, -100, 30], [-31, -94, 11], [31, -94, 11], [-29, -82, 10], [29, -82, 10], [-13, -79, 10], [0, -78, 10], [13, -79, 10]] : [...ring, [0, -110, 38]]
      return blob(body, col) + curls(flat ? [[-18, -96], [0, -98], [18, -96], [-9, -86], [9, -86]] : [[-20, -130], [0, -136], [20, -130], [-30, -114], [-10, -118], [10, -118], [30, -114], [-20, -102], [0, -104], [20, -102], [-28, -90], [-9, -90], [9, -90], [28, -90], [0, -80]])
    }
    case 'twists': {
      const ring: [number, number, number][] = []
      for (let a = 200; a >= -20; a -= 20) ring.push([Math.cos((a * Math.PI) / 180) * 30, -104 - Math.sin((a * Math.PI) / 180) * 29, 7])
      const hem: [number, number, number][] = [[-24, -84, 7], [-12, -80, 7], [0, -79, 7], [12, -80, 7], [24, -84, 7]]
      const body: [number, number, number][] = flat ? [[0, -100, 28], [-28, -98, 7], [28, -98, 7], ...hem] : [...ring, [0, -104, 27], ...hem]
      const dots = [[-16, -122], [0, -126], [16, -122], [-22, -108], [-8, -112], [8, -112], [22, -108], [-15, -96], [0, -98], [15, -96], [-8, -86], [8, -86]]
      return blob(body, col) + dots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.2" fill="none" stroke="${line}" stroke-width="1.5" opacity=".8"/>`).join('')
    }
    case 'bun': {
      const bun = flat ? '' : C(0, -139, 12, col) + st('M -8 -139 Q 0 -146 8 -139') + st('M -6 -133 Q 0 -138 6 -133')
      return bun + P(NAPE, col) + st('M -22 -108 C -14 -122 -6 -128 0 -129') + st('M 22 -108 C 14 -122 6 -128 0 -129') + st('M -24 -94 C -14 -108 -5 -116 0 -118') + st('M 24 -94 C 14 -108 5 -116 0 -118')
    }
    case 'ponytail': {
      // tied at the back of the head: from behind the tail hangs straight down the middle
      const y0 = flat ? -106 : -116
      const tail = P(`M -9 ${y0} C -14 ${y0 + 18} -11 -76 0 -60 C 11 -76 14 ${y0 + 18} 9 ${y0} Z`, shade(col, 0.08)) + st(`M 0 ${y0 + 8} L 0 -68`)
      const tie = `<rect x="-8" y="${y0 - 4}" width="16" height="7" rx="3" fill="#ff5a8a" stroke="${O}" stroke-width="1.6"/>`
      return P(NAPE, col) + st(`M -24 -100 C -16 -110 -9 ${y0} -6 ${y0}`) + st(`M 24 -100 C 16 -110 9 ${y0} 6 ${y0}`) + st(`M -14 -128 C -9 -124 -5 -120 -3 ${y0}`) + st(`M 14 -128 C 9 -124 5 -120 3 ${y0}`) + tail + tie
    }
    case 'spiky':
      return P('M -31 -96 L -36 -116 L -25 -115 L -24 -135 L -11 -126 L -1 -143 L 8 -128 L 22 -137 L 23 -120 L 35 -119 L 31 -96 C 31 -86 25 -78 18 -77 L -18 -77 C -25 -78 -31 -86 -31 -96 Z', col) +
        st('M -12 -112 L -15 -122') + st('M 0 -114 L -1 -127') + st('M 12 -112 L 15 -123') + st('M -20 -96 L -24 -104') + st('M 20 -96 L 24 -104')
    case 'puffs': {
      const puff = (x: number): [number, number, number][] => [[x, -130, 13], [x + Math.sign(x) * 8, -124, 9], [x - Math.sign(x) * 4, -140, 9]]
      return (flat ? '' : blob([...puff(-30), ...puff(30)], col) + curls([[-31, -129], [31, -129]])) + P(NAPE, col) + st('M 0 -134 L 0 -80') + st('M -6 -118 C -14 -122 -20 -122 -24 -118') + st('M 6 -118 C 14 -122 20 -122 24 -118')
    }
    case 'locs': {
      const strand = (x: number, len: number) => cap(x, -108, x + Math.sign(x) * 2, -108 + len, 6.5, col) + `<circle cx="${x + Math.sign(x) * 2}" cy="${-108 + len}" r="2.6" fill="#e9c46a" stroke="${O}" stroke-width="1.2"/>`
      return [-30, -20, -10, 0, 10, 20, 30].map((x, i) => strand(x || 0.01, i % 2 ? 44 : 49)).join('') + P('M -31 -97 C -34 -123 -18 -136 2 -135 C 22 -134 35 -121 31 -97 C 31 -92 30 -89 28 -87 L -28 -87 C -30 -89 -31 -92 -31 -97 Z', col) +
        [-20, -10, 0, 10, 20].map((x) => st(`M ${x * 0.7} -130 Q ${x * 1.1} -112 ${x} -90`)).join('')
    }
    case 'braids': {
      const braid = (x: number) => [-90, -82, -74, -66].map((y) => E(x, y, 6, 5, col, 2.4)).join('') + `<rect x="${x - 4}" y="-62" width="8" height="4" rx="2" fill="#ffd23f" stroke="${O}" stroke-width="1.4"/>`
      return braid(-32) + braid(32) + P(NAPE, col) + st('M 0 -134 L 0 -79') + st('M -4 -120 C -14 -116 -24 -108 -29 -96') + st('M 4 -120 C 14 -116 24 -108 29 -96') + st('M -4 -104 C -12 -100 -20 -94 -25 -86') + st('M 4 -104 C 12 -100 20 -94 25 -86')
    }
  }
}

// ---------- face ----------
/**
 * Where the eyes sit. The face sits low on the head (a big forehead reads as young and friendly), the eyes are big
 * with big pupils looking at you (two sparkles each), and the smile is small. Glasses follow the eyes (FACE_DROP).
 */
export const EYE_Y = -94
/** how far the face moved down from where glasses were drawn for */
const FACE_DROP = 5
/** Head outlines by face shape. The top half is the same circle for all of them, so every hairstyle and hat fits. */
const HEADS = [
  'M -30 -100 A 30 30 0 0 1 30 -100 A 30 30 0 0 1 -30 -100 Z',
  'M -30 -100 A 30 30 0 0 1 30 -100 C 30 -83 20 -66 0 -66 C -20 -66 -30 -83 -30 -100 Z',
  'M -30 -100 A 30 30 0 0 1 30 -100 C 30.5 -82 27 -70 14 -69.5 L -14 -69.5 C -27 -70 -30.5 -82 -30 -100 Z',
  'M -30 -100 A 30 30 0 0 1 30 -100 C 31 -86 13 -70 0 -65.5 C -13 -70 -31 -86 -30 -100 Z',
]
const headPath = (look: Look) => HEADS[look.shape ?? 0] ?? HEADS[0]

function face(c: Ctx, mood: 'smile' | 'grin' | 'o', look: Look, focus?: Part): string {
  const { fx, d, skin } = c
  const iris = EYE_COLORS[look.eyes ?? 0] ?? EYE_COLORS[0]
  const eye = (x: number) => {
    const px = x + 0.6 * d
    return (
      E(x, EYE_Y, 5.8, 7, '#ffffff', 2.2) +
      E(px, EYE_Y + 0.8, 4.4, 5.5, iris, 1.1) +
      E(px, EYE_Y + 1, 2.9, 3.8, shade(iris, 0.72), 0) +
      `<circle cx="${px - 1.6}" cy="${EYE_Y - 1.3}" r="1.9" fill="#fff"/><circle cx="${px + 1.7}" cy="${EYE_Y + 2.6}" r="0.9" fill="#fff"/>`
    )
  }
  const lash = (x: number, side: -1 | 1) => `<path d="M ${x + side * 4.6} ${EYE_Y - 4.6} l ${side * 3.4} -2.6 M ${x + side * 5.6} ${EYE_Y - 2} l ${side * 3.6} -1.2" fill="none" stroke="${O}" stroke-width="1.7" stroke-linecap="round"/>`
  const lashes = look.lashes ? lash(-11 + fx, -1) + lash(11 + fx, 1) : ''
  // brows take the hair's colour (a shade darker), so a blonde and a redhead read differently at a glance
  const browCol = shade(c.hair, 0.3)
  const brow = (side: -1 | 1) => {
    const x = (n: number) => side * n + fx
    switch (look.brows ?? 0) {
      case 1: return `<path d="M ${x(16)} -104 Q ${x(11)} -107.5 ${x(6)} -105.5" fill="none" stroke="${browCol}" stroke-width="3.6" stroke-linecap="round"/>`
      case 2: return `<path d="M ${x(16.5)} -103 Q ${x(12)} -109.5 ${x(6)} -105.5" fill="none" stroke="${browCol}" stroke-width="2.4" stroke-linecap="round"/>`
      case 3: return `<path d="M ${x(16)} -105.5 L ${x(6.5)} -105.5" fill="none" stroke="${browCol}" stroke-width="2.8" stroke-linecap="round"/>`
      default: return `<path d="M ${x(15)} -104 Q ${x(11)} -106.5 ${x(7)} -105" fill="none" stroke="${browCol}" stroke-width="2.2" stroke-linecap="round"/>`
    }
  }
  const noseInk = ink(skin)
  const nose =
    look.nose === 2
      ? `<ellipse cx="${fx + 0.6 * d}" cy="-87.6" rx="3.1" ry="2.3" fill="${shade(skin, 0.09)}" stroke="${noseInk}" stroke-width="1.5"/>`
      : look.nose === 1
        ? `<path d="M ${fx - 2.6} -88.8 q 2.6 3.4 5.2 0" fill="none" stroke="${noseInk}" stroke-width="1.9" stroke-linecap="round"/>`
        : `<path d="M ${fx - 1.5} -87.9 q 1.5 1.5 3 0" fill="none" stroke="${noseInk}" stroke-width="1.6" stroke-linecap="round" opacity=".75"/>`
  const beard = look.beard ?? 0
  // a moustache needs room: the mouth sits a little lower under one
  const my = beard === 2 || beard === 5 ? 1.6 : 0
  const mouth =
    mood === 'grin'
      ? P(`M ${-6 + fx} ${-83.5 + my} Q ${fx} ${-83.5 + my} ${6 + fx} ${-83.5 + my} Q ${5 + fx} ${-75.5 + my} ${fx} ${-75.5 + my} Q ${-5 + fx} ${-75.5 + my} ${-6 + fx} ${-83.5 + my} Z`, '#8a2b3a', 'stroke-width="2.1"') + Pn(`M ${-2.6 + fx} ${-77.8 + my} Q ${fx} ${-80 + my} ${2.6 + fx} ${-77.8 + my} Q ${fx} ${-76.2 + my} ${-2.6 + fx} ${-77.8 + my} Z`, '#ff7b8f')
      : mood === 'o'
        ? E(fx, -80 + my, 3, 3.6, '#8a2b3a', 2.1)
        : `<path d="M ${-5 + fx} ${-83.5 + my} Q ${fx} ${-78.5 + my} ${5 + fx} ${-83.5 + my}" fill="none" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/>`
  const blush = `<ellipse cx="${-17.5 + fx * 0.6}" cy="-85.5" rx="5" ry="3" fill="#ff7b9c" opacity=".5"/><ellipse cx="${17.5 + fx * 0.6}" cy="-85.5" rx="5" ry="3" fill="#ff7b9c" opacity=".5"/>`
  const dot = (x: number, y: number) => `<circle cx="${x + fx * 0.7}" cy="${y}" r="0.95" fill="${shade(skin, 0.34)}"/>`
  const freckles = look.freckles ? [[-19.5, -88.5], [-16, -86.5], [-13.5, -89], [19.5, -88.5], [16, -86.5], [13.5, -89], [-4.5, -89.6], [4.5, -89.6]].map(([x, y]) => dot(x, y)).join('') : ''
  // facial hair is drawn inside the head's outline (clipped), then the mouth sits on a patch of skin
  const hairInk = ink(c.hair)
  const full = `M -36 -98 C -28 -87 -19 -85.5 ${-10 + fx} -87.2 C ${-6 + fx} -90.6 ${6 + fx} -90.6 ${10 + fx} -87.2 C 19 -85.5 28 -87 36 -98 L 36 -58 L -36 -58 Z`
  const patch = `<ellipse cx="${fx}" cy="-80.6" rx="8.2" ry="5.4" fill="${skin}"/>`
  const clip = `clip-path="url(#${c.u}h)"`
  const tache = `<path d="M ${-9.5 + fx} -83.6 C ${-7 + fx} -88.2 ${-2 + fx} -87.8 ${fx} -86 C ${2 + fx} -87.8 ${7 + fx} -88.2 ${9.5 + fx} -83.6 C ${5 + fx} -84.4 ${2 + fx} -84.6 ${fx} -84.2 C ${-2 + fx} -84.6 ${-5 + fx} -84.4 ${-9.5 + fx} -83.6 Z" fill="${c.hair}" stroke="${hairInk}" stroke-width="1.8" stroke-linejoin="round"/>`
  const tuft = `<g ${clip}><path d="M ${-5.5 + fx} -74.5 Q ${fx} -77 ${5.5 + fx} -74.5 L ${4 + fx} -58 L ${-4 + fx} -58 Z" fill="${c.hair}" stroke="${hairInk}" stroke-width="1.8" stroke-linejoin="round"/></g>`
  const hairOnFace =
    beard === 5
      ? tuft
      : beard === 4
      ? `<g ${clip}><path d="${full}" fill="${c.hair}" stroke="${hairInk}" stroke-width="2.2"/></g>${patch}`
      : beard === 3
        ? `<g ${clip}><path d="M ${-10 + fx} -86 C ${-9 + fx} -90.4 ${9 + fx} -90.4 ${10 + fx} -86 L ${11 + fx} -58 L ${-11 + fx} -58 Z" fill="${c.hair}" stroke="${hairInk}" stroke-width="2.2"/></g>${patch}`
        : beard === 2
          ? ''
          : beard === 1
            ? `<g ${clip}><path d="${full}" fill="${c.hair}" opacity=".2"/></g>`
            : ''
  // your own glasses (a shop's face item replaces them)
  const sp = look.items.face ? 0 : (look.specs ?? 0)
  const lens = 'rgba(255,255,255,.1)'
  const specs =
    sp === 1
      ? `<circle cx="${-11.4 + fx}" cy="${EYE_Y}" r="9.6" fill="${lens}" stroke="${O}" stroke-width="1.9"/><circle cx="${11.4 + fx}" cy="${EYE_Y}" r="9.6" fill="${lens}" stroke="${O}" stroke-width="1.9"/>` + L(-1.9 + fx, EYE_Y - 1.5, 1.9 + fx, EYE_Y - 1.5, O, 1.9)
      : sp === 2
        ? `<rect x="${-21.6 + fx}" y="${EYE_Y - 9}" width="19.6" height="17.4" rx="5" fill="${lens}" stroke="${O}" stroke-width="2"/><rect x="${2 + fx}" y="${EYE_Y - 9}" width="19.6" height="17.4" rx="5" fill="${lens}" stroke="${O}" stroke-width="2"/>` + L(-2 + fx, EYE_Y - 2, 2 + fx, EYE_Y - 2, O, 2)
        : ''
  if (focus) {
    const eyesG = `<g class="av-eyes">${eye(-11 + fx)}${eye(11 + fx)}</g>`
    switch (focus) {
      case 'specs': return specs
      case 'beard': return (beard === 2 ? '' : hairOnFace) + mouth + (beard === 2 || beard === 5 ? tache : '')
      case 'brows': return brow(-1) + brow(1)
      case 'nose': return nose
      case 'freckles': return blush + freckles
      case 'lashes': return eyesG + lashes
      case 'eyes': return eyesG
      default: return ''
    }
  }
  return `${blush}${freckles}${beard === 2 ? '' : hairOnFace}<g class="av-eyes">${eye(-11 + fx)}${eye(11 + fx)}</g>${lashes}${brow(-1)}${brow(1)}${nose}${mouth}${beard === 2 || beard === 5 ? tache : ''}${specs}`
}

// ---------- assembly ----------
/** one part of a look, for picker tiles that show just that part */
export type Part = 'hair' | 'shape' | 'specs' | 'beard' | 'brows' | 'nose' | 'freckles' | 'lashes' | 'eyes'
const PART_BOX: Record<Part, string> = {
  hair: '-54 -160 108 108',
  shape: '-41 -143 82 82',
  specs: '-29 -129 64 64',
  beard: '-33 -121 70 70',
  brows: '-21 -135 50 50',
  nose: '-8.4 -101.5 24 24',
  freckles: '-29 -123 64 64',
  lashes: '-22.5 -122 52 52',
  eyes: '-22.5 -122 52 52',
}
/**
 * A picker tile: just one part of `look`, big, on a plain head where it needs one to make sense (a hairstyle, a beard,
 * a face shape). Glasses, brows and a nose are drawn on their own.
 */
export function partThumb(look: Look, part: Part): string {
  const u = 'pt' + ++uidCounter
  const skin = SKINS[look.skin] ?? SKINS[0]
  const hairCol = HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[0]
  const c: Ctx = { d: 1, fx: 3, back: false, u, skin, hair: hairCol, sig: sigColor(look) }
  const hp = headPath(look)
  // hair and face shapes sit on a plain, pale head: the picture is about the outline, not who's wearing it
  const plain = part === 'hair' ? '#f1f3f9' : skin
  const needsHead = part === 'hair' || part === 'shape' || part === 'beard' || part === 'freckles'
  const head = needsHead ? `<clipPath id="${u}h"><path d="${hp}"/></clipPath>` + (part === 'hair' ? `<path d="${hp}" fill="${plain}" stroke="#b9c0d4" stroke-width="2.4"/>` : C(-29.5, -98, 6, skin, 2.6) + C(29.5, -98, 6, skin, 2.6) + P(hp, skin)) : ''
  const h = part === 'hair' ? hair(look.hair, hairCol, false) : { back: '', front: '' }
  const inner = h.back + head + (part === 'hair' || part === 'shape' ? '' : face(c, 'smile', look, part)) + h.front
  return `<svg viewBox="${PART_BOX[part]}" class="part-thumb"><g transform="${HEAD_SCALE}">${inner}</g></svg>`
}

export interface RenderOpts {
  d?: 1 | -1
  back?: boolean
  mood?: 'smile' | 'grin' | 'o'
  /** draw only one slot (icons) */
  only?: Slot
  mannequin?: boolean
}

function item(look: Look, slot: Slot): ItemDef | undefined {
  const id = look.items[slot]
  return id ? ITEM[id] : undefined
}

export function avatarMarkup(look: Look, o: RenderOpts = {}): string {
  const d = o.d ?? 1
  const back = !!o.back
  const u = 'av' + ++uidCounter
  const skin = o.mannequin ? '#dcd9e6' : SKINS[look.skin] ?? SKINS[0]
  const hairCol = HAIR_COLORS[look.hairColor] ?? HAIR_COLORS[0]
  const c: Ctx = { d, fx: back ? 0 : 3 * d, back, u, skin, hair: hairCol, sig: sigColor(look) }
  const only = o.only
  const show = (slot: Slot | 'base') => !only || only === slot

  const top0 = item(look, 'body')?.top ?? { color: '#7aa0d8', sleeves: 'short' as const }
  const top = 'signature' in top0 && top0.signature ? { ...top0, color: c.sig, sleeveColor: c.sig } : top0
  const bottom = item(look, 'legs')?.bottom ?? { color: '#3e64a8', kind: 'pants' as const }
  const shoe = item(look, 'feet')?.shoe
  const hat = item(look, 'head')
  const len = top.length ?? 'normal'
  const hairRaw = only ? { back: '', front: '', rear: '' } : hair(look.hair, hairCol, !!hat?.flattensHair)
  // a hat that covers the head tucks the hair under it: only what hangs below its band shows, whatever the hairstyle
  const tuck = (svg: string) => (svg && hat?.covers != null ? `<clipPath id="${u}t"><rect x="-90" y="${hat.covers}" width="180" height="140"/></clipPath><g clip-path="url(#${u}t)">${svg}</g>` : svg)
  // from behind, the hair comes out from under the hat's band with rounded corners instead of a flat ruler-cut edge
  const tuckRear = (svg: string) => {
    if (!svg || hat?.covers == null) return svg
    const y = hat.covers
    return `<clipPath id="${u}r"><rect x="-90" y="${y + 12}" width="180" height="140"/><path d="M -66 ${y + 13} L -66 ${y + 12} C -60 ${y + 3} -42 ${y} -28 ${y} L 28 ${y} C 42 ${y} 60 ${y + 3} 66 ${y + 12} L 66 ${y + 13} Z"/></clipPath><g clip-path="url(#${u}r)">${svg}</g>`
  }
  const hairParts = { back: tuck(hairRaw.back), front: tuck(hairRaw.front), rear: back && !only ? tuckRear(hairRear(look.hair, hairCol, !!hat?.flattensHair)) : '' }

  // legs
  const leg = (side: -1 | 1) => {
    const x = side === -1 ? -16 : 1
    let s = ''
    if (show('legs') || show('feet')) {
      if (bottom.kind === 'pants' && show('legs')) s += `<rect x="${x}" y="-44" width="15" height="40" rx="7" fill="${bottom.color}" stroke="${ink(bottom.color)}" stroke-width="3"/>` + (bottom.detail?.(side) ?? '')
      else if (bottom.kind === 'shorts' && show('legs')) s += `<rect x="${x}" y="-44" width="15" height="40" rx="7" fill="${skin}" stroke="${ink(skin)}" stroke-width="3"/>` + `<rect x="${x - 1}" y="-44" width="17" height="18" rx="6" fill="${bottom.color}" stroke="${ink(bottom.color)}" stroke-width="3"/>`
      else if (show('legs') && !only) s += `<rect x="${x}" y="-44" width="15" height="40" rx="7" fill="${bottom.kind === 'skirt' ? skin : bottom.color}" stroke="${ink(bottom.kind === 'skirt' ? skin : bottom.color)}" stroke-width="3"/>`
      else if (only === 'legs') s += `<rect x="${x}" y="-44" width="15" height="40" rx="7" fill="${skin}" stroke="${ink(skin)}" stroke-width="3"/>`
      if (show('feet')) s += shoe ? shoe(side * 9, side) : bareFoot(side * 9)
    }
    return `<g class="av-leg${side === -1 ? 'L' : 'R'}">${s}</g>`
  }
  const skirt = bottom.kind === 'skirt' && show('legs') && len === 'normal'
    ? P('M -18 -42 L 18 -42 L 25 -22 Q 0 -17 -25 -22 Z', bottom.skirt ?? bottom.color) + (bottom.color !== '#f2f2f6' ? [-14, -6, 2, 10, 18].map((x) => L(x - 2, -41, x + 1, -21, shade(bottom.skirt ?? '#000', 0.35), 1.2)).join('') + L(-21, -32, 21, -32, shade(bottom.skirt ?? '#000', 0.35), 1.2) : '')
    : ''

  // arms
  const sleeveCol = top.sleeveColor ?? top.color
  const arm = (side: -1 | 1) => {
    const [sx, sy] = side === -1 ? SHOULDER.l : SHOULDER.r
    const [hx, hy] = side === -1 ? HAND.l : HAND.r
    let s = ''
    if (show('body') || !only) {
      if (!only || only === 'body') {
        if (!only) s += cap(sx, sy, hx, hy + 2, 9.6, skin)
        if (top.sleeves === 'long') s += cap(sx, sy, hx - side * 0.6, hy - 2, 11.2, sleeveCol)
        else if (top.sleeves === 'short') s += cap(sx, sy, sx + side * 3.4, sy + 12, 12, sleeveCol)
      }
    }
    if (side === 1 && show('hand')) {
      const h = item(look, 'hand')
      if (h?.draw) s += `<g transform="translate(${hx} ${hy})">${h.draw(c)}</g>`
    }
    if (!only) s += C(hx, hy, 6.8, skin, 2.8)
    return `<g class="av-arm${side === -1 ? 'L' : 'R'}">${s}</g>`
  }

  const parts: string[] = []
  // the head (and everything on it) is drawn 14% bigger, pivoting at the neck: chunkier, cuter, readable when small
  const backHead = (!only && !back ? hairParts.back : '') + (hat?.drawBack && show('head') ? hat.drawBack(c) : '')
  if (backHead) parts.push(`<g transform="${HEAD_SCALE}">${backHead}</g>`)
  const neckDef = item(look, 'neck')
  if (neckDef?.drawBack && show('neck') && !back) parts.push(neckDef.drawBack(c))
  if (show('body') && top.collar) parts.push(top.collar(c))
  parts.push(leg(-1), leg(1))
  parts.push(skirt)
  // torso
  if (!only) parts.push(R0(-6, -79, 12, 9, skin))
  if (show('body')) {
    parts.push(P(TORSO[len], top.color), Pn(TORSO_SHADE[len], SHADOW))
    // from behind: the top's own back (a hood, apron ties), or its all-over pattern; never the chest print
    const detail = back ? (top.rear ? top.rear(c) : top.wraps && top.front ? top.front(c) : '') : top.front ? top.front(c) : ''
    if (detail) parts.push(`<g>${detail}</g>`)
  }
  const neck = item(look, 'neck')
  // from behind a necklace or a bow tie is out of sight; scarves and capes have a back of their own, under the arms
  if (back && neck?.drawRear && show('neck')) parts.push(neck.drawRear(c))
  parts.push(arm(-1))
  // from behind both arms sit under the head, so long hair hangs over the shoulders rather than behind one sleeve
  if (back) parts.push(arm(1))
  if (!back && neck?.draw && show('neck')) parts.push(neck.draw(c))
  // head
  const headParts: string[] = []
  if (!only) {
    headParts.push(C(-29.5, -98, 6, skin, 2.6), C(29.5, -98, 6, skin, 2.6))
    const hp = headPath(look)
    headParts.push(`<clipPath id="${u}h"><path d="${hp}"/></clipPath>`, P(hp, skin), `<g clip-path="url(#${u}h)">${Pn(HEAD_SHADE, SKIN_SHADOW)}</g>`)
    if (back) headParts.push(hairParts.rear)
    else headParts.push(face(c, o.mood ?? 'smile', look))
  }
  const faceItem = item(look, 'face')
  if (faceItem?.draw && show('face') && !back) headParts.push(`<g transform="translate(0 ${FACE_DROP})">${faceItem.draw(c)}</g>`)
  if (!only && !back) headParts.push(hairParts.front)
  if (hat?.draw && show('head')) headParts.push(hat.draw(c))
  parts.push(`<g class="av-head"><g transform="${HEAD_SCALE}">${headParts.join('')}</g></g>`)
  if (!back) parts.push(arm(1))

  // order matters: left arm behind the torso edge looks odd, so lift both arms above the torso
  return `<g class="av-root"><g class="av-upper">${parts.join('')}</g></g>`
}

const R0 = (x: number, y: number, w: number, h: number, fill: string) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}" stroke="${ink(fill)}" stroke-width="3"/>`
const bareFoot = (x: number) => E(x, -5, 9, 5.5, '#ffd9b8', 2.6)

export const VIEWBOX = { x: -60, y: -185, w: 120, h: 192 }

// ---------- live avatar with animation ----------
export type Pose = 'idle' | 'walk' | 'dance' | 'wave' | 'cheer' | 'sit' | 'jump' | 'skate'

export class AvatarView {
  readonly el: HTMLDivElement
  private svg!: SVGSVGElement
  private g: Record<string, SVGGElement | null> = {}
  private look: Look
  private d: 1 | -1 = 1
  private back = false
  private mood: 'smile' | 'grin' | 'o' = 'smile'
  pose: Pose = 'idle'
  private t = Math.random() * 10
  private poseT = 0
  private blinkAt = 2 + Math.random() * 3
  /** visual size in px for a 150-unit tall person */
  readonly unit: number
  constructor(look: Look, unit = 0.72) {
    this.unit = unit
    this.look = look
    this.el = document.createElement('div')
    this.el.className = 'avatar-svg'
    this.build()
  }

  setLook(look: Look) {
    this.look = look
    this.build()
  }

  face(d: 1 | -1, back: boolean) {
    if (d === this.d && back === this.back) return
    this.d = d
    this.back = back
    this.build()
  }

  setMood(m: 'smile' | 'grin' | 'o') {
    if (m === this.mood) return
    this.mood = m
    this.build()
  }

  setPose(p: Pose) {
    if (p === this.pose) return
    // leaving a dance mid-turn: face the camera again
    if (this.danceBack) {
      this.danceBack = false
      this.face(this.d, false)
    }
    this.pose = p
    this.poseT = 0
  }
  /** the dance's back-view beat is showing */
  private danceBack = false

  private build() {
    const { x, y, w, h } = VIEWBOX
    const k = this.unit
    this.el.innerHTML = `<svg viewBox="${x} ${y} ${w} ${h}" width="${w * k}" height="${h * k}" style="left:${x * k}px;top:${y * k}px" overflow="visible">${avatarMarkup(this.look, { d: this.d, back: this.back, mood: this.mood })}</svg>`
    this.svg = this.el.firstElementChild as SVGSVGElement
    for (const n of ['root', 'upper', 'legL', 'legR', 'armL', 'armR', 'head', 'eyes', 'prop']) this.g[n] = this.svg.querySelector('.av-' + n)
  }

  /** advance the animation; call every frame */
  update(dt: number) {
    this.t += dt
    this.poseT += dt
    const t = this.t
    let root = ''
    let upper = ''
    let legL = 0, legR = 0, armL = 0, armR = 0
    let legLift = 0
    let head = ''
    switch (this.pose) {
      case 'idle':
        upper = `translate(0 ${Math.sin(t * 2.2) * 0.6})`
        armL = Math.sin(t * 2.2) * 1.5
        armR = -armL
        break
      case 'walk': {
        const w = t * 11
        legL = Math.sin(w) * 22
        legR = -legL
        armL = -Math.sin(w) * 24
        armR = -armL
        // a springy step: the whole body rocks a little from foot to foot and bounces on each stride
        root = `rotate(${Math.sin(w) * 3.5} 0 0)`
        upper = `translate(0 ${-Math.abs(Math.sin(w)) * 4})`
        head = `rotate(${Math.sin(w) * 2.5} 0 -100)`
        break
      }
      case 'skate': {
        const w = t * 3.2
        root = `rotate(${this.d * 7} 0 0)`
        legL = Math.sin(w) * 14
        legR = -legL * 0.6
        armL = 48 + Math.sin(w) * 8
        armR = -48 + Math.sin(w) * 8
        break
      }
      case 'dance': {
        const w = t * 8
        // every 2.6 s the dance turns around for a beat (a show-off spin, like Club Penguin's dance)
        const beat = this.poseT % 2.6
        const turn = beat > 1.7 && beat < 2.15
        if (turn !== this.danceBack) {
          this.danceBack = turn
          this.face(-this.d as 1 | -1, turn) // spin to the back, then round to the front again
        }
        root = `rotate(${Math.sin(w) * 7} 0 0)`
        upper = `translate(0 ${-Math.abs(Math.sin(w)) * 5})`
        armL = 85 + Math.sin(w) * 65
        armR = -85 + Math.sin(w) * 65
        legL = Math.sin(w) * 10
        legR = Math.sin(w) * 10
        head = `rotate(${Math.sin(w * 2) * 5} 0 -100)`
        break
      }
      case 'wave':
        armR = -150 + Math.sin(t * 14) * 18
        armL = 4
        upper = `translate(0 ${Math.sin(t * 2.2) * 0.6})`
        break
      case 'cheer':
        armL = 155 + Math.sin(t * 12) * 8
        armR = -155 - Math.sin(t * 12) * 8
        upper = `translate(0 ${-Math.abs(Math.sin(t * 6)) * 4})`
        break
      case 'jump': {
        const p = Math.min(1, this.poseT / 0.55)
        root = `translate(0 ${-Math.sin(Math.PI * p) * 34})`
        legL = -10 * Math.sin(Math.PI * p)
        legR = 10 * Math.sin(Math.PI * p)
        armL = 60 * Math.sin(Math.PI * p)
        armR = -armL
        if (p >= 1) this.pose = 'idle'
        break
      }
      case 'sit':
        legLift = -13
        armL = -10
        armR = 10
        upper = `translate(0 ${Math.sin(t * 2.2) * 0.4})`
        break
    }
    const set = (n: string, v: string) => this.g[n]?.setAttribute('transform', v)
    set('root', root)
    set('upper', upper)
    set('legL', `translate(0 ${legLift}) rotate(${legL} ${HIP.l[0]} ${HIP.l[1]})`)
    set('legR', `translate(0 ${legLift}) rotate(${legR} ${HIP.r[0]} ${HIP.r[1]})`)
    set('armL', `rotate(${armL} ${SHOULDER.l[0]} ${SHOULDER.l[1]})`)
    set('armR', `rotate(${armR} ${SHOULDER.r[0]} ${SHOULDER.r[1]})`)
    set('head', head)
    // blink
    if (t > this.blinkAt) {
      const b = t - this.blinkAt
      const s = b < 0.12 ? 0.12 : 1
      this.g.eyes?.setAttribute('transform', `translate(0 ${EYE_Y}) scale(1 ${s}) translate(0 ${-EYE_Y})`)
      if (b > 0.14) this.blinkAt = t + 2.5 + Math.random() * 3.5
    }
    if (this.g.prop) this.g.prop.setAttribute('transform', `translate(0 -149) scale(${Math.cos(t * 18)} 1) translate(0 149)`)
  }
}

// ---------- icons for the wardrobe / catalogs ----------
const iconCache = new Map<string, string>()
const MANNEQUIN: Look = { skin: 0, hair: 'buzz', hairColor: 0, items: {} }

/** an item's icon; `color` (a signature-colour index) tints items that wear your colour */
/**
 * The box an icon's ink actually covers. getBBox() leaves strokes out, so outlines (and sleeves and straps drawn as
 * fat round-capped lines) used to get sliced off at the edge of catalog thumbnails. Every shape's own box is grown by
 * half its stroke, mapped into the root group's space (hats and hand items sit inside transforms), and joined up.
 */
function inkBox(root: SVGGraphicsElement): { x: number; y: number; width: number; height: number } | null {
  const toRoot = root.getCTM()?.inverse()
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  for (const n of root.querySelectorAll<SVGGraphicsElement>('path, circle, ellipse, rect, line, polygon, polyline, text')) {
    const b = n.getBBox()
    if (!b.width && !b.height) continue
    const stroke = n.getAttribute('stroke')
    const sw = stroke && stroke !== 'none' ? parseFloat(n.getAttribute('stroke-width') ?? '1') || 1 : 0
    const h = sw / 2
    const m = toRoot && n.getCTM() ? toRoot.multiply(n.getCTM()!) : null
    for (const [px, py] of [[b.x - h, b.y - h], [b.x + b.width + h, b.y - h], [b.x - h, b.y + b.height + h], [b.x + b.width + h, b.y + b.height + h]]) {
      const p = m ? new DOMPoint(px, py).matrixTransform(m) : { x: px, y: py }
      x1 = Math.min(x1, p.x)
      y1 = Math.min(y1, p.y)
      x2 = Math.max(x2, p.x)
      y2 = Math.max(y2, p.y)
    }
  }
  return x2 > x1 ? { x: x1, y: y1, width: x2 - x1, height: y2 - y1 } : null
}

export function itemIcon(id: string, color?: number): string {
  const def = ITEM[id]
  if (!def) return ''
  const sig = def.top?.signature || id.startsWith('sig-') ? color : undefined
  const key = sig === undefined ? id : `${id}:${sig}`
  const cached = iconCache.get(key)
  if (cached) return cached
  const look: Look = { ...MANNEQUIN, color: sig, items: { [def.slot]: id } }
  const inner = avatarMarkup(look, { only: def.slot, mannequin: true })
  // measure in a hidden svg
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('width', '0')
  svg.setAttribute('height', '0')
  svg.style.cssText = 'position:absolute;left:-9999px;top:-9999px'
  svg.innerHTML = inner
  document.body.append(svg)
  let bb = { x: -30, y: -80, width: 60, height: 60 }
  try {
    bb = inkBox(svg.firstElementChild as SVGGraphicsElement) ?? bb
  } catch {
    /* jsdom etc. */
  }
  svg.remove()
  const pad = 3
  const size = Math.max(bb.width, bb.height) + pad * 2
  const cx = bb.x + bb.width / 2
  const cy = bb.y + bb.height / 2
  const out = `<svg viewBox="${cx - size / 2} ${cy - size / 2} ${size} ${size}" class="item-icon">${inner}</svg>`
  iconCache.set(key, out)
  return out
}

/** A still of `look` mid-move (the Moves menu): an AvatarView posed, advanced a moment, then frozen. */
export function posePictogram(look: Look, pose: Pose, at = 0.3): string {
  const v = new AvatarView(look, 1)
  v.setPose(pose)
  v.update(at)
  const { x, y, w, h } = VIEWBOX
  return `<svg viewBox="${x} ${y + 6} ${w} ${h - 6}" class="pose-pic">${v.el.querySelector('svg')!.innerHTML}</svg>`
}

/** A still portrait for menus and the player card. */
export function avatarPortrait(look: Look, mood: 'smile' | 'grin' | 'o' = 'grin'): string {
  const { x, y, w, h } = VIEWBOX
  return `<svg viewBox="${x} ${y + 10} ${w} ${h - 10}" class="avatar-portrait">${avatarMarkup(look, { mood })}</svg>`
}

/** Just the head and shoulders — for buddy lists and leaderboards. */
export function headPortrait(look: Look, mood: 'smile' | 'grin' | 'o' = 'smile'): string {
  return `<svg viewBox="-50 -170 100 104" class="head-portrait">${avatarMarkup(look, { mood })}</svg>`
}
