/**
 * Ferry Captain — art helpers.
 *
 * Loads the harbor sprites and turns the single panorama (`game-harbor.jpg`) into scrollable layers:
 *  - a sky strip (clouds + skyline) mirrored at FOLD so the baked-in Statue never scrolls into view,
 *  - water bands that slide at different speeds for depth (cuts sit on rows of flat colour, so no seams),
 *  - Lady Liberty keyed out of the backdrop, so she can grow on the horizon as you get close.
 * Also draws the Liberty Island pier and the seagull's pizza slice with plain canvas shapes.
 */

export const W = 1000
export const H = 565
export const INK = '#1d2140'
export const FONT = '"Burbank Display", "Lilita One", "Arial Rounded MT Bold", sans-serif'

const BG_W = 2000
const BG_H = 857
/** Screen px per backdrop px — the panorama is fit to the stage height. */
export const K = H / BG_H
/** Screen y of the horizon line. */
export const HORIZON = 391 * K
/** Backdrop rows owned by the sky layer (keeps the shoreline's bottom edge). */
const SKY_ROWS = 400
/** The sky strip mirrors here: the baked-in Statue starts at x ≈ 1586. */
const FOLD = 1580
/** Water band cut rows. Each cut sits on a row of flat colour, so neighbouring bands can slide independently. */
const CUTS = [400, 453, 490, 524, 562, 636, 708, 766, BG_H]
/** Gulls painted into the sky — they'd look frozen next to the animated ones. */
const SKY_GULLS = [
  [497, 117, 574, 160],
  [604, 204, 673, 239],
  [1481, 98, 1567, 146],
]
/** Lady Liberty's crop in the backdrop, a gull to drop from it, and her anchor (island centre on the waterline). */
const LIBERTY = { x0: 1578, y0: 60, x1: 2000, y1: 414, gull: [1638, 192, 1724, 258], ax: 214, ay: 340 }

export const SPRITES = ['ferry', 'tugboat', 'sailboat', 'kayak', 'jetski', 'barge', 'log', 'buoy-green', 'buoy-red', 'lifering', 'gull', 'coin'] as const
export type SpriteName = (typeof SPRITES)[number]

export interface Art {
  img: Record<SpriteName, HTMLImageElement>
  sky: HTMLCanvasElement
  water: HTMLCanvasElement
  liberty: HTMLCanvasElement
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = () => reject(new Error(`Couldn't load ${src}`))
    im.src = src
  })
}

export async function loadArt(): Promise<Art> {
  const [bg, ...sprites] = await Promise.all([
    loadImage('/art/rooms/game-harbor.jpg'),
    ...SPRITES.map((n) => loadImage(`/art/games/harbor/${n}.png`)),
  ])
  const img = {} as Record<SpriteName, HTMLImageElement>
  SPRITES.forEach((n, i) => (img[n] = sprites[i]))
  return { img, sky: buildSky(bg), water: buildWater(bg), liberty: keyLiberty(bg) }
}

/** Paint over small boxes of plain sky by blending, row by row, between the pixels just outside them. */
function eraseBoxes(g: CanvasRenderingContext2D, boxes: number[][]) {
  for (const [x0, y0, x1, y1] of boxes) {
    const bx = x0 - 3, by = y0 - 3, bw = x1 - x0 + 7, bh = y1 - y0 + 7
    const id = g.getImageData(bx, by, bw, bh)
    const d = id.data
    for (let y = 0; y < bh; y++) {
      const l = y * bw * 4
      const r = (y * bw + bw - 1) * 4
      for (let x = 1; x < bw - 1; x++) {
        const t = x / (bw - 1)
        const i = (y * bw + x) * 4
        for (let k = 0; k < 3; k++) d[i + k] = d[l + k] + (d[r + k] - d[l + k]) * t
      }
    }
    g.putImageData(id, bx, by)
  }
}

/** Sky strip: [0 … FOLD) then the same mirrored. Mirroring keeps the seam invisible. */
function buildSky(bg: HTMLImageElement) {
  const half = canvas(FOLD, SKY_ROWS)
  const hg = half.getContext('2d', { willReadFrequently: true })!
  hg.drawImage(bg, 0, 0, FOLD, SKY_ROWS, 0, 0, FOLD, SKY_ROWS)
  eraseBoxes(hg, SKY_GULLS)
  const c = canvas(FOLD * 2, SKY_ROWS)
  const g = c.getContext('2d')!
  g.drawImage(half, 0, 0)
  g.translate(FOLD * 2, 0)
  g.scale(-1, 1)
  g.drawImage(half, 0, 0)
  return c
}

/** Water: the bottom of the panorama (it tiles) plus enough of its start repeated that any offset is one drawImage. */
function buildWater(bg: HTMLImageElement) {
  const rows = BG_H - SKY_ROWS
  const extra = Math.ceil(W / K) + 4
  const c = canvas(BG_W + extra, rows)
  const g = c.getContext('2d')!
  g.drawImage(bg, 0, SKY_ROWS, BG_W, rows, 0, 0, BG_W, rows)
  // Liberty Island's rocky base pokes into the first water rows near the right edge: patch with open water.
  g.drawImage(bg, 1000, SKY_ROWS, 422, 10, 1578, 0, 422, 10)
  g.drawImage(bg, 0, SKY_ROWS, extra, rows, BG_W, 0, extra, rows)
  return c
}

/**
 * Key the Statue + island out of the sky: flood-fill the background from the crop's border through anything
 * that isn't a dark outline (the art is fully outlined, so the fill can't leak inside), then drop enclosed pockets
 * of sky/cloud and keep only outline pixels that hug what's left.
 */
function keyLiberty(bg: HTMLImageElement) {
  const { x0, y0, x1, y1, gull } = LIBERTY
  const w = x1 - x0, h = y1 - y0, n = w * h
  const c = canvas(w, h)
  const g = c.getContext('2d', { willReadFrequently: true })!
  g.drawImage(bg, x0, y0, w, h, 0, 0, w, h)
  const id = g.getImageData(0, 0, w, h)
  const d = id.data
  const wall = new Uint8Array(n)
  for (let i = 0; i < n; i++) wall[i] = Math.max(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) < 120 ? 1 : 0
  const bgMask = new Uint8Array(n)
  const stack: number[] = []
  const push = (i: number) => {
    if (!bgMask[i] && !wall[i]) {
      bgMask[i] = 1
      stack.push(i)
    }
  }
  // the gull flying past her is background too
  for (let y = gull[1] - y0; y < gull[3] - y0; y++)
    for (let x = gull[0] - x0; x < gull[2] - x0; x++) {
      wall[y * w + x] = 0
      push(y * w + x)
    }
  for (let x = 0; x < w; x++) push(x), push((h - 1) * w + x)
  for (let y = 0; y < h; y++) push(y * w), push(y * w + w - 1)
  while (stack.length) {
    const i = stack.pop()!
    const x = i % w, y = (i / w) | 0
    if (x > 0) push(i - 1)
    if (x < w - 1) push(i + 1)
    if (y > 0) push(i - w)
    if (y < h - 1) push(i + w)
  }
  // enclosed pockets that are mostly sky or cloud
  const seen = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (bgMask[i] || wall[i] || seen[i]) continue
    const region: number[] = []
    const st = [i]
    seen[i] = 1
    while (st.length) {
      const j = st.pop()!
      region.push(j)
      const x = j % w, y = (j / w) | 0
      for (const k of [x > 0 ? j - 1 : -1, x < w - 1 ? j + 1 : -1, y > 0 ? j - w : -1, y < h - 1 ? j + w : -1])
        if (k >= 0 && !seen[k] && !bgMask[k] && !wall[k]) {
          seen[k] = 1
          st.push(k)
        }
    }
    let sky = 0
    for (const j of region) {
      const r = d[j * 4], gg = d[j * 4 + 1], b = d[j * 4 + 2]
      if ((b > 200 && b - r > 60 && gg < b) || (r > 190 && b > 235 && b - r > 12)) sky++
    }
    if (sky / region.length > 0.8) for (const j of region) bgMask[j] = 1
  }
  // outline pixels survive only next to the kept interior (drops stray bits of the horizon line)
  const inner = new Uint8Array(n)
  for (let i = 0; i < n; i++) inner[i] = !bgMask[i] && !wall[i] ? 1 : 0
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (inner[i]) continue
      let keep = false
      if (wall[i])
        for (let dy = -3; dy <= 3 && !keep; dy++)
          for (let dx = -3; dx <= 3; dx++) {
            const xx = x + dx, yy = y + dy
            if (xx >= 0 && yy >= 0 && xx < w && yy < h && inner[yy * w + xx]) {
              keep = true
              break
            }
          }
      if (!keep) d[i * 4 + 3] = 0
    }
  g.putImageData(id, 0, 0)
  return c
}

export function drawSky(g: CanvasRenderingContext2D, art: Art, pan: number) {
  g.drawImage(art.sky, pan / K, 0, W / K, SKY_ROWS, 0, 0, W, SKY_ROWS * K)
}

/** Each band scrolls at `flow(its middle)` × scroll — nearer water slides faster. */
export function drawWater(g: CanvasRenderingContext2D, art: Art, scroll: number, flow: (y: number) => number) {
  const need = W / K
  for (let i = 0; i < CUTS.length - 1; i++) {
    const r0 = CUTS[i]
    const last = i === CUTS.length - 2
    const rows = CUTS[i + 1] - r0 + (last ? 0 : 1.5) // overlap the next band a hair to hide AA seams
    const y0 = r0 * K
    const off = (scroll * flow(y0 + ((CUTS[i + 1] - r0) * K) / 2)) / K
    const sx = ((off % BG_W) + BG_W) % BG_W
    g.drawImage(art.water, sx, r0 - SKY_ROWS, need, rows, 0, y0, W, rows * K)
  }
}

/** Lady Liberty with her island; (x, y) is the island's centre on the waterline. scale 1 = as painted in the backdrop. */
export function drawLiberty(g: CanvasRenderingContext2D, art: Art, x: number, y: number, scale: number) {
  const s = K * scale
  const c = art.liberty
  g.drawImage(c, x - LIBERTY.ax * s, y - LIBERTY.ay * s, c.width * s, c.height * s)
}

/** Half-width of the island on screen at a given scale (for visibility checks). */
export const libertyHalfWidth = (scale: number) => 210 * K * scale

/** A small cut-out of Lady Liberty for the HUD. */
export function libertyIcon(art: Art, h: number) {
  const top = 20, bottom = 344, left = 120, right = 320 // the statue + pedestal, roughly
  const s = h / (bottom - top)
  const c = canvas(Math.ceil((right - left) * s), h)
  const g = c.getContext('2d')!
  g.drawImage(art.liberty, left, top, right - left, bottom - top, 0, 0, (right - left) * s, h)
  return c
}

// ---------- canvas-drawn props ----------

/** Rounded rect, filled and outlined. */
function box(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) {
  g.beginPath()
  g.roundRect(x, y, w, h, r)
  g.fillStyle = fill
  g.fill()
  g.stroke()
}

/**
 * Liberty Island's pier, side view. (x, y) = its left end at the waterline, s = depth scale.
 * It runs off the right edge of the stage. `t` animates the flag and lamps.
 */
export function drawPier(g: CanvasRenderingContext2D, x: number, y: number, s: number, t: number) {
  const len = (W + 80 - x) / s
  if (len <= 0) return
  g.save()
  g.translate(x, y)
  g.scale(s, s)
  g.lineJoin = 'round'
  g.lineCap = 'round'
  g.strokeStyle = INK
  g.lineWidth = 3.6
  // pilings + ripples
  for (let px = 16; px < len; px += 56) {
    g.fillStyle = 'rgba(255,255,255,.55)'
    g.beginPath()
    g.ellipse(px + 6, 3, 15 + Math.sin(t * 3 + px) * 2, 4, 0, 0, Math.PI * 2)
    g.fill()
    box(g, px, -18, 12, 22, 3, '#6b3f1d')
  }
  // flag pole at the end of the pier (behind the deck rail)
  const fx = 34
  box(g, fx - 3, -176, 6, 150, 3, '#e6e9f2')
  g.beginPath()
  const fw = 58, fh = 36
  for (let i = 0; i <= 12; i++) {
    const u = i / 12
    g.lineTo(fx + 3 + u * fw, -172 + Math.sin(t * 6 - u * 4) * 5 * u)
  }
  for (let i = 12; i >= 0; i--) {
    const u = i / 12
    g.lineTo(fx + 3 + u * fw, -172 + fh + Math.sin(t * 6 - u * 4) * 5 * u)
  }
  g.closePath()
  g.fillStyle = '#e63946'
  g.fill()
  g.save()
  g.clip()
  g.fillStyle = '#fff6e0'
  for (let k = 1; k < 4; k += 2) g.fillRect(fx, -172 + (k * fh) / 4 - 6, fw + 10, fh / 4 + 2)
  g.restore()
  g.stroke()
  g.beginPath()
  g.arc(fx, -178, 5, 0, Math.PI * 2)
  g.fillStyle = '#ffd166'
  g.fill()
  g.stroke()
  // railing
  for (let px = 10; px < len; px += 56) box(g, px, -64, 7, 32, 2, '#8a5a2b')
  box(g, -2, -68, len + 20, 8, 4, '#c98f52')
  // deck: top surface, front face, plank seams
  box(g, -6, -40, len + 30, 12, 5, '#ecc189')
  box(g, -6, -30, len + 30, 18, 5, '#b97a3e')
  g.save()
  g.strokeStyle = 'rgba(29,33,64,.35)'
  g.lineWidth = 2.4
  for (let px = 26; px < len; px += 26) {
    g.beginPath()
    g.moveTo(px, -27)
    g.lineTo(px, -15)
    g.stroke()
  }
  g.restore()
  // lamp posts
  for (const lx of [150, 800]) {
    if (lx > len) continue
    box(g, lx - 3.5, -128, 7, 92, 3, '#2b2f4a')
    g.fillStyle = `rgba(255,214,102,${0.28 + Math.sin(t * 4 + lx) * 0.06})`
    g.beginPath()
    g.arc(lx, -140, 20, 0, Math.PI * 2)
    g.fill()
    box(g, lx - 9, -152, 18, 22, 4, '#ffd166')
    box(g, lx - 12, -158, 24, 8, 3, '#2b2f4a')
  }
  // the welcome sign
  const sx = 330
  box(g, sx + 14, -108, 8, 72, 2, '#8a5a2b')
  box(g, sx + 108, -108, 8, 72, 2, '#8a5a2b')
  box(g, sx, -132, 130, 50, 10, '#2f7d4a')
  g.fillStyle = '#fff6d8'
  g.font = `20px ${FONT}`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText('LIBERTY', sx + 65, -116)
  g.fillText('ISLAND', sx + 65, -96)
  g.restore()
}

/** The gull's "gift": a New York slice. size ≈ its height in px. */
export function drawSlice(g: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number) {
  g.save()
  g.translate(x, y)
  g.rotate(rot)
  const k = size / 50
  g.scale(k, k)
  g.lineJoin = 'round'
  g.strokeStyle = INK
  g.lineWidth = 3.4
  // cheese
  g.beginPath()
  g.moveTo(-20, -12)
  g.quadraticCurveTo(0, -20, 20, -12)
  g.lineTo(2, 25)
  g.quadraticCurveTo(0, 28, -2, 25)
  g.closePath()
  g.fillStyle = '#ffd25a'
  g.fill()
  g.stroke()
  // drip
  g.beginPath()
  g.moveTo(-9, 6)
  g.quadraticCurveTo(-10, 16, -6, 16)
  g.quadraticCurveTo(-3, 14, -4, 8)
  g.fillStyle = '#ffd25a'
  g.fill()
  g.stroke()
  // crust
  g.beginPath()
  g.moveTo(-23, -12)
  g.quadraticCurveTo(0, -27, 23, -12)
  g.quadraticCurveTo(24, -5, 18, -5)
  g.quadraticCurveTo(0, -13, -18, -5)
  g.quadraticCurveTo(-24, -5, -23, -12)
  g.closePath()
  g.fillStyle = '#d98b3a'
  g.fill()
  g.stroke()
  // pepperoni
  g.lineWidth = 2.4
  for (const [px, py, r] of [
    [-7, -1, 4.6],
    [7, 1, 4.2],
    [0, 12, 3.6],
  ]) {
    g.beginPath()
    g.arc(px, py, r, 0, Math.PI * 2)
    g.fillStyle = '#d6452f'
    g.fill()
    g.stroke()
  }
  g.restore()
}
