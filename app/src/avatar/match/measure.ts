/**
 * Photo → measurements. Everything here runs in the browser: the photo is drawn to a canvas, two small models
 * (Google's MediaPipe face landmarks + selfie segmentation, served from our own /vision folder) read it, and the
 * numbers below come out. The photo is never uploaded and never stored. pick.ts turns the numbers into a Look.
 */
import type { FaceLandmarker, ImageSegmenter } from '@mediapipe/tasks-vision'

export interface Lab { L: number; a: number; b: number }
export interface Reading {
  /** how much of the frame the face fills (0..1 of the shorter side) */
  faceSize: number
  /** head turned left/right: 0 is straight on, 1 is a full profile */
  yaw: number
  skin: Lab
  /** brightness of the whites of the eyes (null when the eyes are too small to read) */
  white: number | null
  /** brightness (Lab L) of the brightest 3% of the whole picture: a dim room reads low */
  frame: number
  /** the face's brightness, 0..255 */
  faceLum: number
  /** hair colour, or null when there's too little hair to tell */
  hair: Lab | null
  /** hair area ÷ face box area */
  hairArea: number
  /** hair height above the top of the forehead ÷ face height */
  hairTop: number
  /** how far the hair hangs past the chin ÷ face height (negative: it stops above the chin) */
  hairDrop: number
  /** the widest the hair gets ÷ face width */
  hairWidth: number
  /** hair beside the ears ÷ face width (short back and sides is near 0) */
  hairSides: number
  /** how busy the hair's texture is (curls and coils are busier than straight hair) */
  hairTexture: number
  /** how bumpy the hair's outline is (curls and coils make a scalloped edge) */
  hairEdge: number
  /** 0..1 each: how much darker than the cheeks, and how much the model called "hair" */
  chin: { dark: number; hair: number }
  lip: { dark: number; hair: number }
  jaw: { dark: number; hair: number }
  /** glasses clues: a dark bar across the bridge of the nose, frames under the eyes, "accessory" pixels by the eyes */
  bridge: number
  rims: number
  eyeGear: number
  /** face height ÷ width, jaw width ÷ cheek width, chin width ÷ jaw width */
  faceRatio: number
  jawRatio: number
  chinRatio: number
  /** iris colour, or null when the eyes are too small or too dark to read */
  iris: Lab | null
  /** how arched and how heavy the brows are */
  browArch: number
  browDark: number
  /** nose width ÷ face width */
  noseWidth: number
}

export type MeasureError = 'no-face' | 'too-small' | 'turned' | 'load'

let tools: Promise<{ face: FaceLandmarker; seg: ImageSegmenter }> | null = null
/** Loads the two models once (about 30 MB the first time, then cached by the browser). */
export function loadTools() {
  tools ??= (async () => {
    const { FilesetResolver, FaceLandmarker, ImageSegmenter } = await import('@mediapipe/tasks-vision')
    const files = await FilesetResolver.forVisionTasks('/vision')
    const [face, seg] = await Promise.all([
      FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: '/vision/face_landmarker.task', delegate: 'CPU' }, runningMode: 'IMAGE', numFaces: 4 }),
      ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: '/vision/selfie_multiclass.tflite', delegate: 'CPU' }, runningMode: 'IMAGE', outputCategoryMask: true, outputConfidenceMasks: false }),
    ])
    return { face, seg }
  })()
  tools.catch(() => (tools = null))
  return tools
}

// sRGB → CIE Lab (D65): distances in Lab match how different two colours look
export function rgbToLab(r: number, g: number, b: number): Lab {
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
  const R = lin(r), G = lin(g), B = lin(b)
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  const x = f((R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047)
  const y = f(R * 0.2126 + G * 0.7152 + B * 0.0722)
  const z = f((R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883)
  return { L: 116 * y - 16, a: 500 * (x - y), b: 200 * (y - z) }
}
export const hexToLab = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return rgbToLab(n >> 16, (n >> 8) & 255, n & 255)
}

const HAIR = 1, FACE_SKIN = 3, OTHERS = 5
const SIDE = 512

/** Draws any picture (a camera frame, an uploaded file) onto a canvas no bigger than 512 on its long side. */
export function toCanvas(src: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const k = Math.min(1, SIDE / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.round(w * k)
  c.height = Math.round(h * k)
  c.getContext('2d', { willReadFrequently: true })!.drawImage(src, 0, 0, c.width, c.height)
  return c
}

/** Dev only (lab/match.html): the same picture in a darker room. */
export function dim(canvas: HTMLCanvasElement, k: number) {
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  const d = g.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < d.data.length; i += 4) for (let j = 0; j < 3; j++) d.data[i + j] = 255 * (d.data[i + j] / 255) ** (1 / k) * k
  g.putImageData(d, 0, 0)
}

export async function measure(canvas: HTMLCanvasElement): Promise<Reading | MeasureError> {
  let t: Awaited<ReturnType<typeof loadTools>>
  try {
    t = await loadTools()
  } catch {
    return 'load'
  }
  const W = canvas.width, H = canvas.height
  const found = t.face.detect(canvas).faceLandmarks
  if (!found.length) return 'no-face'
  // with a few people in the shot, the biggest face is the one
  const span = (f: { x: number; y: number }[]) => Math.hypot((f[234].x - f[454].x) * W, (f[234].y - f[454].y) * H)
  const lm = found.reduce((a, b) => (span(b) > span(a) ? b : a))
  const p = (i: number) => ({ x: lm[i].x * W, y: lm[i].y * H })
  const dist = (i: number, j: number) => Math.hypot(p(i).x - p(j).x, p(i).y - p(j).y)
  const fw = dist(234, 454), fh = dist(10, 152)
  if (fw < 56) return 'too-small'
  const cx = (p(234).x + p(454).x) / 2
  const yaw = Math.abs(p(1).x - cx) / (fw / 2)
  if (yaw > 0.42) return 'turned'

  const segResult = t.seg.segment(canvas)
  const cm = segResult.categoryMask!
  const mw = cm.width, mh = cm.height
  const mask = cm.getAsUint8Array().slice()
  segResult.close()
  const cls = (x: number, y: number) => {
    const mx = Math.min(mw - 1, Math.max(0, Math.round((x / W) * mw))), my = Math.min(mh - 1, Math.max(0, Math.round((y / H) * mh)))
    return mask[my * mw + mx]
  }
  const px = canvas.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, W, H).data
  const lum = (x: number, y: number) => {
    const i = (Math.min(H - 1, Math.max(0, Math.round(y))) * W + Math.min(W - 1, Math.max(0, Math.round(x)))) * 4
    return 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]
  }
  /** every pixel in a disc, as [r, g, b, class] */
  const disc = (c: { x: number; y: number }, r: number) => {
    const out: [number, number, number, number][] = []
    for (let y = Math.max(0, Math.floor(c.y - r)); y <= Math.min(H - 1, c.y + r); y++)
      for (let x = Math.max(0, Math.floor(c.x - r)); x <= Math.min(W - 1, c.x + r); x++) {
        if ((x - c.x) ** 2 + (y - c.y) ** 2 > r * r) continue
        const i = (y * W + x) * 4
        out.push([px[i], px[i + 1], px[i + 2], cls(x, y)])
      }
    return out
  }
  /** the typical colour of some pixels: sorted by brightness, the middle band (shadows and shine left out) */
  const typical = (pts: [number, number, number, number?][], lo = 0.35, hi = 0.85): Lab | null => {
    if (pts.length < 12) return null
    const s = pts.map((q) => [q[0], q[1], q[2], 0.2126 * q[0] + 0.7152 * q[1] + 0.0722 * q[2]]).sort((a, b) => a[3] - b[3])
    const band = s.slice(Math.floor(s.length * lo), Math.max(Math.floor(s.length * lo) + 1, Math.floor(s.length * hi)))
    const m = [0, 1, 2].map((k) => band.reduce((n, q) => n + q[k], 0) / band.length)
    return rgbToLab(m[0], m[1], m[2])
  }
  const mid = (i: number, j: number, k = 0.5) => ({ x: p(i).x + (p(j).x - p(i).x) * k, y: p(i).y + (p(j).y - p(i).y) * k })

  // ---- skin: every skin pixel of the face (cheekbones alone catch the light and read too pale)
  const facePts: [number, number, number, number][] = []
  for (let y = Math.max(0, Math.floor(p(10).y)); y <= Math.min(H - 1, p(152).y); y += 2)
    for (let x = Math.max(0, Math.floor(Math.min(p(234).x, p(454).x))); x <= Math.min(W - 1, Math.max(p(234).x, p(454).x)); x += 2) {
      if (cls(x, y) !== FACE_SKIN) continue
      const i = (y * W + x) * 4
      facePts.push([px[i], px[i + 1], px[i + 2], FACE_SKIN])
    }
  const skinPts = facePts.length >= 40 ? facePts : [50, 280, 205, 425].flatMap((i) => disc(p(i), fw * 0.07))
  const skin = typical(skinPts, 0.3, 0.7) ?? { L: 60, a: 15, b: 20 }
  const skinLum = (() => {
    const s = skinPts.map((q) => 0.2126 * q[0] + 0.7152 * q[1] + 0.0722 * q[2]).sort((a, b) => a - b)
    return s[Math.floor(s.length * 0.5)] || 128
  })()

  // ---- hair: the hair pixels around this head (not someone else's in the background)
  const top = p(10), chin = p(152)
  const x0 = Math.max(0, Math.floor(cx - fw * 1.7)), x1 = Math.min(W - 1, Math.ceil(cx + fw * 1.7))
  const y0 = Math.max(0, Math.floor(top.y - fh * 1.3)), y1 = Math.min(H - 1, Math.ceil(chin.y + fh * 1.6))
  const jawL = Math.min(p(172).x, p(397).x), jawR = Math.max(p(172).x, p(397).x)
  const faceL = Math.min(p(234).x, p(454).x), faceR = Math.max(p(234).x, p(454).x)
  let n = 0, minX = W, maxX = 0, minYc = H, maxY = 0, sides = 0, tex = 0, texN = 0, edge = 0
  const hairPts: [number, number, number][] = []
  const earTop = Math.min(p(33).y, p(263).y), earBot = p(2).y
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      if (cls(x, y) !== HAIR) continue
      // a beard is "hair" to the model too: anything inside the jaw below the nose isn't the hairstyle
      const inFace = x > jawL && x < jawR && y > p(2).y && y < chin.y + fh * 0.12
      if (inFace) continue
      n++
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (Math.abs(x - cx) < fw * 0.3 && y < minYc) minYc = y
      if ((x < jawL - fw * 0.02 || x > jawR + fw * 0.02 || y > chin.y + fh * 0.12) && y > maxY) maxY = y
      if (y > earTop && y < earBot && (x < faceL || x > faceR)) sides++
      if (y < chin.y && (x + y) % 2 === 0) {
        const i = (y * W + x) * 4
        hairPts.push([px[i], px[i + 1], px[i + 2]])
      }
      if (x > x0 && x < x1 && y > y0 && y < y1) {
        if (x % 2 === 0 && y % 2 === 0) {
          tex += Math.abs(4 * lum(x, y) - lum(x - 2, y) - lum(x + 2, y) - lum(x, y - 2) - lum(x, y + 2))
          texN++
        }
        if (cls(x - 1, y) !== HAIR || cls(x + 1, y) !== HAIR || cls(x, y - 1) !== HAIR || cls(x, y + 1) !== HAIR) edge++
      }
    }
  const hair = n > fw * fh * 0.03 ? typical(hairPts, 0.25, 0.75) : null
  const hairLum = hairPts.length ? hairPts.reduce((s, q) => s + 0.2126 * q[0] + 0.7152 * q[1] + 0.0722 * q[2], 0) / hairPts.length : 0

  // ---- facial hair: how dark (against the cheeks) and how "hair" each patch is
  const patch = (pts: { x: number; y: number }[], r: number) => {
    const d = pts.flatMap((c) => disc(c, r))
    if (!d.length) return { dark: 0, hair: 0 }
    const l = d.map((q) => 0.2126 * q[0] + 0.7152 * q[1] + 0.0722 * q[2]).sort((a, b) => a - b)[Math.floor(d.length / 2)]
    return { dark: Math.max(0, (skinLum - l) / Math.max(40, skinLum)), hair: d.filter((q) => q[3] === HAIR).length / d.length }
  }
  const chinP = patch([mid(17, 152, 0.55)], fw * 0.06)
  const lipP = patch([mid(2, 0, 0.55), mid(2, 0, 0.55)].map((c, i) => ({ x: c.x + (i ? 1 : -1) * fw * 0.07, y: c.y })), fw * 0.035)
  const jawP = patch([mid(61, 172, 0.62), mid(291, 397, 0.62)], fw * 0.05)

  // ---- glasses
  // the bridge: a frame crosses the nose between the eyes as a dark (or bright) bar on smooth skin
  const br = p(168)
  let lo = 255, hi = 0
  const prof: number[] = []
  for (let dy = -fh * 0.09; dy <= fh * 0.09; dy++) prof.push((lum(br.x - 1, br.y + dy) + lum(br.x, br.y + dy) + lum(br.x + 1, br.y + dy)) / 3)
  const med = [...prof].sort((a, b) => a - b)[Math.floor(prof.length / 2)] || 1
  for (const v of prof) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  const bridge = (med - lo) / Math.max(40, med)
  // the rims: walking down from under each eye onto the cheek, a frame is a dark line; bare skin has none
  const rim = (eyeBottom: number, cheek: number) => {
    const a = p(eyeBottom), b = p(cheek)
    const vals: number[] = []
    for (let k = 0.25; k <= 1.0; k += 0.03) vals.push(lum(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k))
    const m = [...vals].sort((x, y) => x - y)[Math.floor(vals.length / 2)] || 1
    return (m - Math.min(...vals)) / Math.max(40, m)
  }
  const rims = (rim(145, 50) + rim(374, 280)) / 2
  let gear = 0, gearN = 0
  for (const [a, b, c2, d2] of [[33, 133, 159, 145], [362, 263, 386, 374]]) {
    const ex0 = Math.min(p(a).x, p(b).x) - fw * 0.05, ex1 = Math.max(p(a).x, p(b).x) + fw * 0.05
    const ey0 = p(c2).y - fh * 0.07, ey1 = p(d2).y + fh * 0.1
    for (let y = ey0; y <= ey1; y += 2) for (let x = ex0; x <= ex1; x += 2) {
      gearN++
      if (cls(x, y) === OTHERS) gear++
    }
  }

  // ---- eyes: the ring of the iris (not the pupil, not the white)
  const irisPts: [number, number, number][] = []
  for (const [c, edgeI] of [[468, 469], [473, 474]]) {
    const r = dist(c, edgeI)
    if (r < 3.2) continue
    const o = p(c)
    for (let y = Math.floor(o.y - r); y <= o.y + r; y++) for (let x = Math.floor(o.x - r); x <= o.x + r; x++) {
      const d = Math.hypot(x - o.x, y - o.y) / r
      // the lower half of the ring: the top is under the eyelid and its lashes
      if (d < 0.45 || d > 0.9 || y < o.y - r * 0.15) continue
      const i = (Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4
      irisPts.push([px[i], px[i + 1], px[i + 2]])
    }
  }
  const iris = typical(irisPts, 0.3, 0.8)
  // the whites of the eyes: about the same white on everyone, so they say how bright the photo's light is
  const whitePts: [number, number, number][] = []
  for (const ids of [[33, 160, 158, 133, 153, 144], [362, 385, 387, 263, 373, 380]]) {
    const xs = ids.map((i) => p(i).x), ys = ids.map((i) => p(i).y)
    for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++) for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x++) {
      const i = (Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))) * 4
      whitePts.push([px[i], px[i + 1], px[i + 2]])
    }
  }
  const white = typical(whitePts, 0.82, 0.97)
  // the brightest things in the whole picture (a wall, a shirt, a lamp): how much light the camera had to work with
  const hist = new Uint32Array(256)
  let histN = 0
  for (let i = 0; i < px.length; i += 12) {
    hist[Math.round(0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2])]++
    histN++
  }
  let acc = 0, bright = 255
  for (let v = 255; v >= 0; v--) {
    acc += hist[v]
    if (acc >= histN * 0.03) {
      bright = v
      break
    }
  }
  const frame = rgbToLab(bright, bright, bright).L
  // the face's own brightness (for the "find more light" hint)
  const faceLum = skinLum

  // ---- brows
  const archOf = (ids: number[]) => {
    const ys = ids.map((i) => p(i).y)
    return (Math.max(ys[0], ys[ys.length - 1]) - Math.min(...ys)) / fh
  }
  const browArch = (archOf([70, 63, 105, 66, 107]) + archOf([300, 293, 334, 296, 336])) / 2
  const browP = patch([p(105), p(334), p(63), p(293)], fw * 0.022)

  return {
    faceSize: fw / Math.min(W, H),
    yaw,
    skin,
    white: white?.L ?? null,
    frame,
    faceLum,
    hair,
    hairArea: n / (fw * fh),
    hairTop: n ? Math.max(0, (top.y - minYc) / fh) : 0,
    hairDrop: n ? (maxY - chin.y) / fh : -1,
    hairWidth: n ? (maxX - minX) / fw : 0,
    hairSides: sides / (fw * (earBot - earTop) || 1),
    hairTexture: texN ? tex / texN / (hairLum + 30) : 0,
    hairEdge: n ? edge / Math.sqrt(n) : 0,
    chin: chinP,
    lip: lipP,
    jaw: jawP,
    bridge,
    rims,
    eyeGear: gearN ? gear / gearN : 0,
    faceRatio: fh / fw,
    jawRatio: dist(172, 397) / fw,
    chinRatio: dist(150, 379) / dist(172, 397),
    iris,
    browArch,
    browDark: browP.dark,
    noseWidth: dist(129, 358) / fw,
  }
}
