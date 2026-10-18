import { HAIR_COLORS, OUTLINE as O, SKINS, shade, sigColor, type HairStyle, type Look, type Slot } from './look'
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
      for (let a = 165; a >= 15; a -= 18) ring.push([Math.cos((a * Math.PI) / 180) * 30, -103 - Math.sin((a * Math.PI) / 180) * 30, 7])
      const cap0: [number, number, number][] = flat ? [[-27, -100, 7], [27, -100, 7], [-28, -90, 6], [28, -90, 6]] : [...ring, [0, -114, 22]]
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

// ---------- face ----------
function face(c: Ctx, mood: 'smile' | 'grin' | 'o'): string {
  const { fx, d } = c
  const eye = (x: number) =>
    E(x, -99, 5.4, 7.2, '#ffffff', 2.4) +
    E(x + 1.4 * d, -98, 3.5, 4.8, O, 0) +
    `<circle cx="${x + 1.4 * d - 1.3}" cy="-100" r="1.5" fill="#fff"/>`
  const brows = `<path d="M ${-15 + fx} -110 Q ${-11 + fx} -113 ${-7 + fx} -111 M ${7 + fx} -111 Q ${11 + fx} -113 ${15 + fx} -110" fill="none" stroke="${O}" stroke-width="2.3" stroke-linecap="round"/>`
  const mouth =
    mood === 'grin'
      ? P(`M ${-7 + fx} -86 Q ${fx} -86 ${7 + fx} -86 Q ${6 + fx} -77 ${fx} -77 Q ${-6 + fx} -77 ${-7 + fx} -86 Z`, '#8a2b3a', 'stroke-width="2.2"') + Pn(`M ${-3 + fx} -79.5 Q ${fx} -82 ${3 + fx} -79.5 Q ${fx} -77.6 ${-3 + fx} -79.5 Z`, '#ff7b8f')
      : mood === 'o'
        ? E(fx, -82, 3.4, 4.2, '#8a2b3a', 2.2)
        : `<path d="M ${-6 + fx} -85 Q ${fx} -79 ${6 + fx} -85" fill="none" stroke="${O}" stroke-width="2.5" stroke-linecap="round"/>`
  const blush = `<ellipse cx="${-18 + fx * 0.6}" cy="-88" rx="4.6" ry="2.6" fill="#ff7b9c" opacity=".45"/><ellipse cx="${18 + fx * 0.6}" cy="-88" rx="4.6" ry="2.6" fill="#ff7b9c" opacity=".45"/>`
  return `<g class="av-eyes">${eye(-11 + fx)}${eye(11 + fx)}</g>${brows}${blush}${mouth}`
}

// ---------- assembly ----------
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
  const hairParts = only ? { back: '', front: '', rear: '' } : hair(look.hair, hairCol, !!hat?.flattensHair)

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
    if (side === 1 && !back && (show('hand'))) {
      const h = item(look, 'hand')
      if (h?.draw) s += `<g transform="translate(${hx} ${hy})">${h.draw(c)}</g>`
    }
    if (!only) s += C(hx, hy, 6.8, skin, 2.8)
    return `<g class="av-arm${side === -1 ? 'L' : 'R'}">${s}</g>`
  }

  const parts: string[] = []
  // the head (and everything on it) is drawn 14% bigger, pivoting at the neck: chunkier, cuter, readable when small
  const backHead = (!only ? hairParts.back : '') + (hat?.drawBack && show('head') ? hat.drawBack(c) : '')
  if (backHead) parts.push(`<g transform="${HEAD_SCALE}">${backHead}</g>`)
  const neckDef = item(look, 'neck')
  if (neckDef?.drawBack && show('neck')) parts.push(neckDef.drawBack(c))
  if (show('body') && top.collar) parts.push(top.collar(c))
  parts.push(leg(-1), leg(1))
  parts.push(skirt)
  // torso
  if (!only) parts.push(R0(-6, -79, 12, 9, skin))
  if (show('body')) {
    parts.push(P(TORSO[len], top.color), Pn(TORSO_SHADE[len], SHADOW))
    if (top.front) parts.push(`<g>${top.front(c)}</g>`)
  }
  parts.push(arm(-1))
  const neck = item(look, 'neck')
  if (neck?.draw && show('neck')) parts.push(neck.draw(c))
  // head
  const headParts: string[] = []
  if (!only) {
    headParts.push(C(-29.5, -98, 6, skin, 2.6), C(29.5, -98, 6, skin, 2.6))
    headParts.push(C(0, -100, 30, skin), Pn(HEAD_SHADE, SKIN_SHADOW))
    if (back) headParts.push(hairParts.rear)
    else headParts.push(face(c, o.mood ?? 'smile'))
  }
  const faceItem = item(look, 'face')
  if (faceItem?.draw && show('face') && !back) headParts.push(faceItem.draw(c))
  if (!only && !back) headParts.push(hairParts.front)
  if (hat?.draw && show('head')) headParts.push(hat.draw(c))
  parts.push(`<g class="av-head"><g transform="${HEAD_SCALE}">${headParts.join('')}</g></g>`)
  parts.push(arm(1))

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
      this.g.eyes?.setAttribute('transform', `translate(0 -99) scale(1 ${s}) translate(0 99)`)
      if (b > 0.14) this.blinkAt = t + 2.5 + Math.random() * 3.5
    }
    if (this.g.prop) this.g.prop.setAttribute('transform', `translate(0 -149) scale(${Math.cos(t * 18)} 1) translate(0 149)`)
  }
}

// ---------- icons for the wardrobe / catalogs ----------
const iconCache = new Map<string, string>()
const MANNEQUIN: Look = { skin: 0, hair: 'buzz', hairColor: 0, items: {} }

/** an item's icon; `color` (a signature-colour index) tints items that wear your colour */
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
    const b = (svg.firstElementChild as SVGGElement).getBBox()
    if (b.width > 0) bb = { x: b.x, y: b.y, width: b.width, height: b.height }
  } catch {
    /* jsdom etc. */
  }
  svg.remove()
  const pad = 4
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
