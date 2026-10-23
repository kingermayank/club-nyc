/**
 * Pictures for the canvas games: the art in /art/mp, and everyone's own New Yorker rasterized from the city's SVG
 * avatar (app/src/avatar/render.ts) in any pose, so racers look exactly like they do in the city.
 */
import { AvatarView, type Pose } from '../avatar/render'
import type { Look } from '../avatar/look'

const images = new Map<string, Promise<HTMLImageElement>>()
/** one shared Image per URL (resolves once it can be drawn; a broken image resolves too, just empty) */
export function loadImage(src: string): Promise<HTMLImageElement> {
  let p = images.get(src)
  if (!p) {
    p = new Promise((ok) => {
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => ok(img)
      img.onerror = () => ok(img)
      img.src = src
    })
    images.set(src, p)
  }
  return p
}
export const loadAll = (srcs: string[]) => Promise.all(srcs.map(loadImage))

/** the box an avatar is rasterized in (avatar units; feet at 0,0), roomier than the city's so raised arms fit */
export const AV_BOX = { x: -80, y: -218, w: 160, h: 232 }
const ser = typeof XMLSerializer !== 'undefined' ? new XMLSerializer() : null

export interface AvatarPic {
  img: HTMLImageElement
  /** pixels per avatar unit in the image */
  k: number
  /** where the feet are in the image */
  fx: number
  fy: number
}

const avatars = new Map<string, Promise<AvatarPic>>()
/**
 * A New Yorker as a picture. `t` advances the pose's animation (a walk cycle's phase, how far into a jump).
 * `k` is the resolution (2 = twice the city's size, sharp at any scale the games draw them).
 */
export function avatarPic(look: Look, o: { pose?: Pose; back?: boolean; d?: 1 | -1; mood?: 'smile' | 'grin' | 'o'; t?: number; k?: number } = {}): Promise<AvatarPic> {
  const key = JSON.stringify([look, o])
  let p = avatars.get(key)
  if (p) return p
  p = new Promise<AvatarPic>((ok) => {
    const k = o.k ?? 2
    const v = new AvatarView(look, 1)
    v.face(o.d ?? 1, !!o.back)
    if (o.mood) v.setMood(o.mood)
    if (o.pose) v.setPose(o.pose)
    v.update(o.t ?? 0.001)
    const svg = v.el.querySelector('svg')
    const img = new Image()
    const done = () => ok({ img, k, fx: -AV_BOX.x * k, fy: -AV_BOX.y * k })
    if (!svg || !ser) return done()
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
    svg.setAttribute('viewBox', `${AV_BOX.x} ${AV_BOX.y} ${AV_BOX.w} ${AV_BOX.h}`)
    svg.setAttribute('width', String(AV_BOX.w * k))
    svg.setAttribute('height', String(AV_BOX.h * k))
    svg.removeAttribute('style')
    img.onload = done
    img.onerror = done
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(ser.serializeToString(svg))
  })
  avatars.set(key, p)
  // keep the cache from growing without bound over a long session
  if (avatars.size > 400) avatars.delete(avatars.keys().next().value!)
  return p
}

/** a walk (or run) cycle: `n` frames evenly through one stride */
export async function walkCycle(look: Look, o: { back?: boolean; d?: 1 | -1; n?: number; k?: number } = {}): Promise<AvatarPic[]> {
  const n = o.n ?? 6
  // the walk swings with sin(t * 11): one stride is 2π / 11 seconds
  const stride = (Math.PI * 2) / 11
  return Promise.all(Array.from({ length: n }, (_, i) => avatarPic(look, { pose: 'walk', back: o.back, d: o.d, k: o.k, t: 10 + (stride * i) / n })))
}

/** draw an avatar picture with its feet at (x, y), `h` pixels per avatar unit (1 unit ≈ the city's 1 px at full size) */
export function drawAvatar(ctx: CanvasRenderingContext2D, pic: AvatarPic, x: number, y: number, scale: number, o: { alpha?: number; rot?: number; flip?: boolean } = {}) {
  if (!pic.img.naturalWidth) return
  const w = (pic.img.naturalWidth / pic.k) * scale
  const h = (pic.img.naturalHeight / pic.k) * scale
  ctx.save()
  if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha
  ctx.translate(x, y)
  if (o.rot) ctx.rotate(o.rot)
  if (o.flip) ctx.scale(-1, 1)
  ctx.drawImage(pic.img, (-pic.fx / pic.k) * scale, (-pic.fy / pic.k) * scale, w, h)
  ctx.restore()
}

/** a canvas that stays sharp: its pixels follow the stage's on-screen size and the display's density */
export function sharpCanvas(cls: string, w = 1000, h = 565): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; fit: () => number } {
  const canvas = document.createElement('canvas')
  canvas.className = cls
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  const ctx = canvas.getContext('2d')!
  const fit = () => {
    const r = canvas.getBoundingClientRect()
    const k = Math.min(3, Math.max(1, ((r.width || w) / w) * (window.devicePixelRatio || 1)))
    const pw = Math.round(w * k)
    const ph = Math.round(h * k)
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw
      canvas.height = ph
    }
    ctx.setTransform(k, 0, 0, k, 0, 0)
    return k
  }
  return { canvas, ctx, fit }
}
