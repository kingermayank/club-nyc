/**
 * Photos as recipes: a room's painting, a crop of it and the people in it. The Camera captures one from the room
 * you're in, Messages sends it (a few hundred bytes, only the city's own art, so nothing outside the game can be
 * sent), and anyone's phone draws it back into a picture.
 */
import { save } from '../../state'
import { world } from '../../engine/world'
import type { Actor } from '../../engine/actor'
import { avatarMarkup } from '../../avatar/render'
import type { Look } from '../../avatar/look'
import type { LookWire } from '../../net/protocol'
import { PHOTO_FX, type PhotoRecipe, type PhotoFx } from './wire'

const UNIT = 0.72

/** everyone in the room right now, as the photo will show them. Strangers (real players who aren't your friends)
 * become soft silhouettes: nobody ends up in someone else's photo unasked. */
export async function peopleNow(): Promise<PhotoRecipe['people']> {
  const { mp } = await import('../../net/multiplayer')
  const actors: Actor[] = [world.player, ...world.npcs.filter((a) => !a.leaving && a.wrap?.isConnected)]
  return actors
    .filter((a) => a.look && a.pos && Number.isFinite(a.pos[0]) && Number.isFinite(a.pos[1]))
    .map((a) => {
      const s = (a as unknown as { drawn?: { s: number } }).drawn?.s ?? 1
      const d = ((a as unknown as { facing?: 1 | -1 }).facing ?? 1) as 1 | -1
      const stranger = !!a.remote && !mp.friends.has(a.remote.id)
      const yOff = a.seat ? 34 * UNIT * s * 0.6 : 0
      return { look: a.look as unknown as LookWire, x: Math.round(a.pos[0] * 10) / 10, y: Math.round((a.pos[1] + yOff) * 10) / 10, s: Math.round(s * UNIT * 1000) / 1000, d, blur: stranger || undefined }
    })
    .sort((a, b) => a.y - b.y)
}

export function recipeNow(crop: PhotoRecipe['crop'], people: PhotoRecipe['people'], title?: string): PhotoRecipe {
  return { room: world.room.id, bg: world.room.bg, crop, people, title: title ?? world.plate?.name ?? world.room.name, at: Date.now() }
}

/** the people layer as SVG in room units (1000 × 565), cropped by the viewBox */
export function peopleSvg(r: Pick<PhotoRecipe, 'people' | 'crop'>, w: number, h: number) {
  const { x, y, w: cw, h: ch } = r.crop
  const figs = r.people
    .map((p) => {
      let body = ''
      try {
        body = avatarMarkup(p.look as unknown as Look, { d: (p.d ?? 1) as 1 | -1, mood: p.blur ? 'smile' : 'grin' })
      } catch {
        return ''
      }
      return p.blur
        ? `<g transform="translate(${p.x} ${p.y}) scale(${p.s})" opacity=".55" filter="url(#ifr-blur)"><g style="filter:grayscale(1) brightness(.6)">${body}</g></g>`
        : `<g transform="translate(${p.x} ${p.y}) scale(${p.s})"><ellipse cx="0" cy="0" rx="24" ry="6" fill="rgba(29,33,64,.22)"/>${body}</g>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${cw} ${ch}"><defs><filter id="ifr-blur"><feGaussianBlur stdDeviation="6"/></filter></defs>${figs}</svg>`
}

const imgCache = new Map<string, Promise<HTMLImageElement>>()
function loadImg(src: string): Promise<HTMLImageElement> {
  let p = imgCache.get(src)
  if (!p) {
    p = new Promise((ok, no) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = no
      i.src = src
    })
    imgCache.set(src, p)
  }
  return p
}

/** draw a recipe into a JPEG data URL, w px wide */
/** a filter, pixel by pixel, with the same math as the CSS filter functions the viewfinder uses */
function applyFx(x: CanvasRenderingContext2D, w: number, h: number, fx: PhotoFx) {
  const steps = PHOTO_FX.find((f) => f.id === fx)?.steps ?? []
  if (!steps.length) return
  const img = x.getImageData(0, 0, w, h)
  const d = img.data
  // each step is a colour matrix (or a per-channel line), applied in order and clamped in between, like CSS
  const mats = steps.map(([k, a]): number[] => {
    const i = 1 - a
    if (k === 'grayscale') return [0.2126 + 0.7874 * i, 0.7152 - 0.7152 * i, 0.0722 - 0.0722 * i, 0.2126 - 0.2126 * i, 0.7152 + 0.2848 * i, 0.0722 - 0.0722 * i, 0.2126 - 0.2126 * i, 0.7152 - 0.7152 * i, 0.0722 + 0.9278 * i, 0, 0]
    if (k === 'sepia') return [0.393 + 0.607 * i, 0.769 - 0.769 * i, 0.189 - 0.189 * i, 0.349 - 0.349 * i, 0.686 + 0.314 * i, 0.168 - 0.168 * i, 0.272 - 0.272 * i, 0.534 - 0.534 * i, 0.131 + 0.869 * i, 0, 0]
    if (k === 'saturate') return [0.213 + 0.787 * a, 0.715 - 0.715 * a, 0.072 - 0.072 * a, 0.213 - 0.213 * a, 0.715 + 0.285 * a, 0.072 - 0.072 * a, 0.213 - 0.213 * a, 0.715 - 0.715 * a, 0.072 + 0.928 * a, 0, 0]
    // contrast and brightness: v * slope + offset on each channel
    if (k === 'contrast') return [a, 0, 0, 0, a, 0, 0, 0, a, 1, (0.5 - 0.5 * a) * 255]
    return [a, 0, 0, 0, a, 0, 0, 0, a, 1, 0]
  })
  const c = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)
  for (let p = 0; p < d.length; p += 4) {
    let r = d[p], g = d[p + 1], b = d[p + 2]
    for (const m of mats) {
      const o = m[10]
      const nr = c(m[0] * r + m[1] * g + m[2] * b + o)
      const ng = c(m[3] * r + m[4] * g + m[5] * b + o)
      const nb = c(m[6] * r + m[7] * g + m[8] * b + o)
      r = nr; g = ng; b = nb
    }
    d[p] = r; d[p + 1] = g; d[p + 2] = b
  }
  x.putImageData(img, 0, 0)
}

export async function renderRecipe(r: PhotoRecipe, w = 960): Promise<string> {
  const h = Math.round((w * r.crop.h) / r.crop.w)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const x = c.getContext('2d')!
  x.fillStyle = '#6fb6ff'
  x.fillRect(0, 0, w, h)
  const k = w / r.crop.w
  try {
    const bg = await loadImg(`/art/rooms/${r.bg}.jpg`)
    // the painting covers the 1000 × 565 room
    x.drawImage(bg, -r.crop.x * k, -r.crop.y * k, 1000 * k, 565 * k)
  } catch {
    /* no painting: the people on sky blue */
  }
  try {
    const svg = peopleSvg(r, w, h)
    const img = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg))
    x.drawImage(img, 0, 0, w, h)
    imgCache.delete('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg))
  } catch {
    /* the people layer failed: the place still shows */
  }
  if (r.fx && r.fx !== 'none') applyFx(x, w, h, r.fx)
  // a soft vignette, like a phone camera
  const g = x.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, 'rgba(10,14,34,0.18)')
  x.fillStyle = g
  x.fillRect(0, 0, w, h)
  return c.toDataURL('image/jpeg', 0.86)
}

/** a polaroid-style PNG for "Save to Device": the photo, the place and the date (plus your invite link online) */
export async function polaroid(jpeg: string, title: string, at: number, footer: string): Promise<string> {
  const img = await loadImg(jpeg)
  const W = 1200
  const m = 44
  const pw = W - m * 2
  const ph = Math.round((pw * img.height) / img.width)
  const H = m + ph + 170
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const x = c.getContext('2d')!
  x.fillStyle = '#fbfaf6'
  x.fillRect(0, 0, W, H)
  x.drawImage(img, m, m, pw, ph)
  const cs = getComputedStyle(document.documentElement)
  const display = cs.getPropertyValue('--display').trim() || 'sans-serif'
  const body = cs.getPropertyValue('--body').trim() || 'sans-serif'
  x.fillStyle = '#1d2140'
  x.font = `400 56px ${display}`
  x.textBaseline = 'middle'
  x.fillText(title, m + 4, m + ph + 70)
  x.font = `400 30px ${body}`
  x.fillStyle = '#4a4f73'
  x.fillText(footer, m + 4, m + ph + 124)
  x.textAlign = 'right'
  x.fillText(new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }), W - m - 4, m + ph + 70)
  return c.toDataURL('image/png')
}

export const myName = () => save.name
