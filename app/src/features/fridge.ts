import './fridge.css'
import { sfx } from '../audio'
import { ITEM } from '../avatar/items'
import { el } from '../engine/stage'
import { save, persist } from '../state'
import { MAGNETS, magnetSrc } from '../data/souvenirs'
import SCENE from '../data/fridge.json'
import type { Game } from '../types'
import { DOOR_PAD, magnetSpot } from './fridgeSpots'
import { closeX, openMoment } from './moments/kit'

/**
 * Your fridge, up close. It is a real little scene (modelled and rendered for the game: art/fridge/f00..f21 are the
 * door swinging open, shot by a camera that steps back as it goes), so the door opens like a door.
 *
 * - Shut: every magnet you own is on the door. Drag them wherever you like; they stay there (save.magnetAt) and the
 *   fridge in your apartment shows the same arrangement (features/souvenirs.ts).
 * - Pull the handle: the door swings, taking the magnets with it, and the shelves hold the food you actually own, in
 *   front of what every New York fridge has anyway. Click something to take it out.
 *
 * data/fridge.json comes out of the same scene: where the door's face, the shelves and the handle are in each frame,
 * in stage pixels, so everything laid over the picture sits exactly on it.
 */
const FOOD = ['pizza-slice', 'hotdog', 'pretzel', 'bagel', 'donut', 'cookie', 'black-white', 'croissant', 'dumplings', 'gelato', 'gelato-pistachio', 'gelato-strawberry', 'gelato-chocolate', 'gelato-stracciatella', 'gelato-lemon', 'gelato-mango', 'cocoa', 'coffee', 'latte', 'ralphs-coffee', 'cold-brew', 'boba']
type P = [number, number]
interface Shelf { l: P; r: P; ppm: number }
interface Frame { door: P[]; inner: P[]; shelves: Shelf[]; mouth: P[] }
const FRAMES = SCENE.frames as unknown as Frame[]
const N = FRAMES.length
const src = (i: number) => `/art/fridge/f${String(i).padStart(2, '0')}.webp`
/** the door's face when shut, in stage pixels: the magnets' sheet is this size and is bent onto the door each frame */
const D0 = FRAMES[0].door
const DW = D0[1][0] - D0[0][0]
const DH = D0[2][1] - D0[0][1]
/** a food sprite is this many metres across, and its shelf line is this far up from its bottom edge */
const SPRITE_M = 0.26
const PER_SHELF = 6

/** the CSS matrix that lays a w x h sheet onto four corners (top-left, top-right, bottom-right, bottom-left) */
function onto(w: number, h: number, q: P[]): string {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q
  const dx1 = x1 - x2, dx2 = x3 - x2, dx3 = x0 - x1 + x2 - x3
  const dy1 = y1 - y2, dy2 = y3 - y2, dy3 = y0 - y1 + y2 - y3
  const den = dx1 * dy2 - dx2 * dy1
  const g = (dx3 * dy2 - dx2 * dy3) / den
  const k = (dx1 * dy3 - dx3 * dy1) / den
  const a = x1 - x0 + g * x1, b = x3 - x0 + k * x3
  const d = y1 - y0 + g * y1, e = y3 - y0 + k * y3
  return `matrix3d(${a / w},${d / w},0,${g / w},${b / h},${e / h},0,${k / h},0,0,1,0,${x0},${y0},0,1)`
}

export function openFridge(g: Game, refresh?: () => void) {
  const m = openMoment('fr')
  const have = MAGNETS.filter((x) => (save.magnets ?? []).includes(x.id))
  const at = (save.magnetAt ??= {})

  // ---- the picture ----
  const pic = el('canvas', 'fr-pic') as HTMLCanvasElement
  pic.width = 1440
  pic.height = 814
  const ctx = pic.getContext('2d')!
  const imgs: HTMLImageElement[] = []
  let loaded = 0
  let frame = 0
  const draw = () => imgs[frame]?.complete && imgs[frame].naturalWidth && ctx.drawImage(imgs[frame], 0, 0, pic.width, pic.height)
  for (let i = 0; i < N; i++) {
    const im = new Image()
    im.onload = () => {
      loaded++
      if (i === frame) draw()
    }
    im.src = src(i)
    imgs.push(im)
  }

  const sheet = el('div', 'fr-sheet') // the door's face: magnets live on it
  sheet.style.cssText = `width:${DW}px;height:${DH}px`
  const food = el('div', 'fr-food-layer')
  const mist = el('div', 'fr-mist', '<i></i><i></i><i></i>')
  const handle = el('button', 'fr-handle') as HTMLButtonElement
  handle.type = 'button'
  handle.setAttribute('aria-label', 'Open the fridge')
  const [h0, h1] = SCENE.handle as unknown as P[]
  // hug the bar itself: it is 22px wide around the middle of the handle's box in the scene data
  const hx = (h0[0] + h1[0]) / 2
  handle.style.cssText = `left:${hx - 11}px;top:${h0[1] + 1}px;width:22px;height:${h1[1] - h0[1] - 2}px`
  const shut = el('button', 'fr-shut') as HTMLButtonElement // the open door: push it to close
  shut.type = 'button'
  shut.setAttribute('aria-label', 'Close the fridge')
  const last = FRAMES[N - 1]
  shut.style.clipPath = `polygon(${last.inner.map(([x, y]) => `${x / 10}% ${(y / 565) * 100}%`).join(',')})`
  const count = el('div', 'fr-count', `<img src="${magnetSrc('pizza')}" alt=""><b>${have.length}</b>/${MAGNETS.length}`)
  count.title = 'Magnets'
  const x = closeX(m)
  x.classList.add('cu-x')
  m.root.append(pic, food, mist, sheet, handle, shut, count, x)

  // ---- lay everything onto frame i ----
  const foods: { b: HTMLElement; shelf: number; t: number }[] = []
  const show = (i: number) => {
    frame = i
    draw()
    const f = FRAMES[i]
    const q = f.door
    // the door's face is towards us while its corners still run clockwise
    const facing = (q[1][0] - q[0][0]) * (q[3][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[3][0] - q[0][0]) > 0
    sheet.style.transform = onto(DW, DH, q)
    sheet.style.visibility = facing ? '' : 'hidden'
    // food stands on its shelf, and shows only where the door has already swung clear of it
    for (const { b, shelf, t } of foods) {
      const s = f.shelves[shelf]
      const size = SPRITE_M * s.ppm
      // the button is only the food itself (the sprite around it is mostly air and shadow)
      const bw = size * 0.4, bh = size * 0.6
      b.style.width = `${bw}px`
      b.style.height = `${bh}px`
      b.style.left = `${s.l[0] + (s.r[0] - s.l[0]) * t - bw / 2}px`
      b.style.top = `${s.l[1] - bh}px`
      b.style.setProperty('--s', `${size}px`)
    }
    const edge = facing ? Math.min(q[0][0], q[3][0]) : 1000
    food.style.clipPath = `inset(0 ${Math.max(0, 1000 - Math.min(edge, f.mouth[1][0]))}px 0 ${f.mouth[0][0]}px)`
    m.root.classList.toggle('ajar', i > 0)
  }

  // ---- the magnets ----
  have.forEach((mag, i) => {
    const img = el('img', 'fr-magnet') as HTMLImageElement
    img.src = magnetSrc(mag.id)
    img.alt = mag.name
    img.draggable = false
    let [fx, fy] = magnetSpot(mag.id, MAGNETS.indexOf(mag))
    const put = () => {
      img.style.left = `${fx * 100}%`
      img.style.top = `${fy * 100}%`
    }
    put()
    img.style.setProperty('--r', `${((i * 37) % 17) - 8}deg`)
    img.onpointerdown = (e0) => {
      if (frame > 0) return
      e0.preventDefault()
      e0.stopPropagation()
      const r = sheet.getBoundingClientRect()
      const b = img.getBoundingClientRect()
      // keep hold of it where you took it
      const off = [e0.clientX - (b.left + b.width / 2), e0.clientY - (b.top + b.height / 2)]
      img.classList.add('held')
      sheet.append(img)
      sfx.pop()
      const move = (e: PointerEvent) => {
        fx = Math.min(DOOR_PAD.r, Math.max(DOOR_PAD.l, (e.clientX - off[0] - r.left) / r.width))
        fy = Math.min(DOOR_PAD.b, Math.max(DOOR_PAD.t, (e.clientY - off[1] - r.top) / r.height))
        put()
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.removeEventListener('pointercancel', up)
        img.classList.remove('held')
        img.classList.add('snap')
        m.later(() => img.classList.remove('snap'), 220)
        at[mag.id] = [Math.round(fx * 1000) / 1000, Math.round(fy * 1000) / 1000]
        persist()
        sfx.tick()
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
      window.addEventListener('pointercancel', up)
    }
    sheet.append(img)
  })

  // ---- your food, in the front row ----
  const mine = FOOD.filter((id) => ITEM[id] && g.owns(id))
  mine.forEach((id, i) => {
    const shelf = Math.min(2, Math.floor(i / PER_SHELF))
    const onShelf = Math.min(PER_SHELF, mine.length - shelf * PER_SHELF)
    const k = i - shelf * PER_SHELF
    const b = el('button', 'fr-food') as HTMLButtonElement
    b.type = 'button'
    b.setAttribute('aria-label', ITEM[id].name)
    b.title = ITEM[id].name
    const pic = el('i')
    pic.style.backgroundImage = `url(/art/fridge/food/${id}.webp)`
    b.append(pic)
    b.style.zIndex = String(10 + shelf)
    b.onclick = () => {
      if (frame < N - 1) return
      sfx.pop()
      m.close()
      g.wear(id)
      g.say(`${ITEM[id].name}. Still good. Probably.`)
    }
    food.append(b)
    foods.push({ b, shelf, t: onShelf === 1 ? 0.5 : 0.08 + (0.84 * k) / (onShelf - 1) })
  })

  // ---- the door ----
  let target = 0
  let pos = 0
  const swing = (open: boolean) => {
    if (loaded < N) return // still fetching the swing: a beat later it works
    target = open ? N - 1 : 0
    if (open) sfx.thunk()
    m.root.classList.toggle('open', open)
    if (open) {
      mist.classList.remove('go')
      void mist.offsetWidth
      mist.classList.add('go')
    }
  }
  m.frame((dt) => {
    if (pos === target) return
    // 22 frames in about two thirds of a second; closing is a little quicker and lands with a thump
    const step = dt * (target > pos ? 32 : 44)
    pos = target > pos ? Math.min(target, pos + step) : Math.max(target, pos - step)
    const i = Math.round(pos)
    if (i !== frame) show(i)
    if (pos === target && target === 0) sfx.thunk()
  })
  handle.onclick = (e) => (e.stopPropagation(), swing(true))
  shut.onclick = (e) => (e.stopPropagation(), swing(false))
  m.onKey((e) => (e.key === 'Backspace' && target > 0 ? (swing(false), true) : false))
  m.onClose(() => refresh?.())
  show(0)
  sfx.whoosh()
}
