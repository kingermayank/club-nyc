/**
 * Camera: the phone turns sideways and the viewfinder shows the room you're in, live (the painting plus everyone in
 * it, redrawn a few times a second). Drag to frame, 1× / 2× to zoom, pick a filter along the bottom, the white shutter
 * takes it. At the city's landmarks a Selfie mode opens the landmark selfie (its shots land in Photos too).
 */
import { el, stage } from '../../../engine/stage'
import { world, onRoomChange } from '../../../engine/world'
import { bump } from '../../../state'
import { SELFIE_SPOTS } from '../../../data/selfieSpots'
import { act } from '../kit'
import { addPhoto } from '../store'
import { peopleNow, peopleSvg, recipeNow, renderRecipe } from '../photo'
import { thenCity, type Ctx, type Screen } from '../phone'
import { tone } from '../sound'
import { PHOTO_FX, fxCss, type PhotoRecipe, type PhotoFx } from '../wire'

const VW = 480
/** the filter you last used stays picked next time */
let lastFx: PhotoFx = 'none'

export function open(ctx: Ctx, arg?: string): Screen {
  const s = el('div', 'ifk')
  const spot = SELFIE_SPOTS[world.room.id]
  s.innerHTML = `<div class="ifk-side l"><button class="ifk-done" type="button">Done</button><div class="ifk-zoom" role="radiogroup" aria-label="Zoom"><button data-z="1" class="on" type="button">1×</button><button data-z="2" type="button">2×</button></div></div>
    <div class="ifk-view" tabindex="0" aria-label="Viewfinder, drag to frame"><div class="ifk-lens"><img class="ifk-bg" alt="" draggable="false"><div class="ifk-people"></div></div><div class="ifk-grid"><i></i><i></i><i></i><i></i></div><i class="ifk-focus"></i><span class="ifk-where"></span><div class="ifk-fx" role="radiogroup" aria-label="Filter"></div><div class="ifk-flash"></div></div>
    <div class="ifk-side r"><div class="ifk-modes">${spot ? `<button class="on" data-m="photo" type="button">Photo</button><button data-m="selfie" type="button" class="${arg === 'spot' ? 'hot' : ''}">Selfie</button>` : '<span class="on">Photo</span>'}</div><button class="ifk-shutter" type="button" aria-label="Take photo"><i></i></button><button class="ifk-thumb" type="button" aria-label="Last photo"><img alt="" hidden></button></div>`
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => s.querySelector(sel) as T
  const view = q('.ifk-view')
  const bg = q<HTMLImageElement>('.ifk-bg')
  const layer = q('.ifk-people')
  const focus = q('.ifk-focus')
  const flash = q('.ifk-flash')
  const thumb = q<HTMLImageElement>('.ifk-thumb img')
  let zoom = 1
  let cx = 500
  let cy = 282.5
  let people: PhotoRecipe['people'] = []
  let lastId = ''
  let alive = true
  let fx: PhotoFx = lastFx
  const lens = q('.ifk-lens')
  const fxBar = q('.ifk-fx')
  // the filters: just their names (the viewfinder itself shows the look)
  const setFx = (f: PhotoFx, sound = true) => {
    fx = lastFx = f
    lens.style.filter = fxCss(f)
    fxBar.querySelectorAll<HTMLElement>('button').forEach((b) => {
      b.classList.toggle('on', b.dataset.fx === f)
      b.setAttribute('aria-checked', String(b.dataset.fx === f))
    })
    if (sound) tone('tap')
  }
  for (const f of PHOTO_FX) {
    const b = el('button', '', f.name) as HTMLButtonElement
    b.type = 'button'
    b.dataset.fx = f.id
    b.setAttribute('role', 'radio')
    b.onclick = (e) => (e.stopPropagation(), setFx(f.id))
    fxBar.append(b)
  }
  // a tap on the filters never starts a drag of the frame
  fxBar.addEventListener('pointerdown', (e) => e.stopPropagation())
  setFx(fx, false)

  const crop = () => {
    const w = 1000 / zoom
    const h = 565 / zoom
    cx = Math.max(w / 2, Math.min(1000 - w / 2, cx))
    cy = Math.max(h / 2, Math.min(565 - h / 2, cy))
    return { x: Math.round(cx - w / 2), y: Math.round(cy - h / 2), w: Math.round(w), h: Math.round(h) }
  }
  const draw = () => {
    const c = crop()
    // the viewfinder is as wide as the screen allows (so the shutter always fits beside it)
    const vw = view.clientWidth || VW
    const vh = Math.round((vw * 565) / 1000)
    const k = vw / c.w
    bg.style.width = `${1000 * k}px`
    bg.style.height = `${565 * k}px`
    bg.style.transform = `translate(${-c.x * k}px, ${-c.y * k}px)`
    layer.innerHTML = peopleSvg({ people, crop: c }, vw, vh)
    // the yellow focus box finds your face
    const me = people.find((p) => !p.blur && Math.abs(p.x - world.player.pos[0]) < 1 && Math.abs(p.y - world.player.pos[1]) < 40)
    if (me) {
      const size = 58 * me.s * k
      focus.style.cssText = `left:${(me.x - c.x) * k - size / 2}px;top:${(me.y - 128 * me.s - c.y) * k - size / 2}px;width:${size}px;height:${size}px`
      focus.hidden = me.x < c.x || me.x > c.x + c.w
    } else focus.hidden = true
  }
  const refresh = async () => {
    if (!alive) return
    // the room first, so the viewfinder is never an empty blue screen, whoever is or isn't in it
    if (bg.dataset.room !== world.room.id) {
      bg.dataset.room = world.room.id
      bg.src = stage.bg.currentSrc || stage.bg.src || `/art/rooms/${world.room.bg}.jpg`
      q('.ifk-where').textContent = world.plate?.name || world.room.name
    }
    try {
      people = await peopleNow()
    } catch {
      people = []
    }
    try {
      draw()
    } catch {
      layer.innerHTML = ''
    }
  }
  const timer = window.setInterval(() => void refresh(), 220)
  const offRoom = onRoomChange(() => void refresh())

  // ---------- framing ----------
  let drag: { x: number; y: number; cx: number; cy: number } | null = null
  view.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, cx, cy }
    view.setPointerCapture(e.pointerId)
  })
  view.addEventListener('pointermove', (e) => {
    if (!drag) return
    const r = view.getBoundingClientRect()
    const per = crop().w / r.width
    cx = drag.cx - (e.clientX - drag.x) * per
    cy = drag.cy - (e.clientY - drag.y) * per
    draw()
  })
  view.addEventListener('pointerup', () => (drag = null))
  view.addEventListener('wheel', (e) => {
    e.preventDefault()
    setZoom(e.deltaY < 0 ? 2 : 1)
  }, { passive: false })
  view.addEventListener('keydown', (e) => {
    const step = 40 / zoom
    if (e.key === 'ArrowLeft') cx -= step
    else if (e.key === 'ArrowRight') cx += step
    else if (e.key === 'ArrowUp') cy -= step
    else if (e.key === 'ArrowDown') cy += step
    else if (e.key === ' ' || e.key === 'Enter') return void (e.preventDefault(), snap())
    else return
    e.preventDefault()
    draw()
  })
  const setZoom = (z: number) => {
    if (z === zoom) return
    zoom = z
    tone('tap')
    // zoom in on you
    if (z === 2) [cx, cy] = [world.player.pos[0], world.player.pos[1] - 60]
    s.querySelectorAll<HTMLElement>('.ifk-zoom button').forEach((b) => b.classList.toggle('on', Number(b.dataset.z) === z))
    layer.animate([{ transform: `scale(${z === 2 ? 0.7 : 1.4})`, opacity: 0.6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(0.2, 1, 0.3, 1)' })
    draw()
  }
  s.querySelectorAll<HTMLButtonElement>('.ifk-zoom button').forEach((b) => (b.onclick = () => setZoom(Number(b.dataset.z))))

  // ---------- modes ----------
  s.querySelectorAll<HTMLButtonElement>('.ifk-modes button').forEach(
    (b) =>
      (b.onclick = () => {
        if (b.dataset.m !== 'selfie') return
        tone('tap')
        const g = world.room.id
        thenCity(() => void Promise.all([import('../../moments/selfie'), import('../../../game')]).then(([m, gm]) => m.landmarkSelfie(gm.api, g)))
      }),
  )

  // ---------- the shot ----------
  let busy = false
  const snap = async () => {
    if (busy) return
    busy = true
    tone('shutter')
    flash.classList.remove('go')
    void flash.offsetWidth
    flash.classList.add('go')
    view.animate([{ transform: 'scale(0.985)' }, { transform: 'scale(1)' }], { duration: 200 })
    const r: PhotoRecipe = { ...recipeNow(crop(), await peopleNow()), fx }
    const url = await renderRecipe(r, 960)
    const p = await addPhoto({ room: r.room, title: r.title, jpeg: url, recipe: r, kind: 'camera' })
    lastId = p.id
    bump('photos')
    thumb.src = url
    thumb.hidden = false
    thumb.animate([{ transform: 'scale(2.4) translate(-60%, -40%)', opacity: 0.4 }, { transform: 'scale(1)', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(0.2, 1.2, 0.4, 1)' })
    busy = false
  }
  q('.ifk-shutter').onclick = () => void snap()
  q('.ifk-thumb').onclick = () => lastId && ctx.open('photos', lastId)
  q('.ifk-done').onclick = () => (tone('tap'), ctx.home())

  // opened from a landmark's camera pin: framed on the landmark
  if (spot && arg === 'spot') {
    const [x, y, w, h] = spot.box
    zoom = w < 470 && h < 270 ? 2 : 1
    cx = x + w / 2
    cy = y + h / 2 + 40
    s.querySelectorAll<HTMLElement>('.ifk-zoom button').forEach((b) => b.classList.toggle('on', Number(b.dataset.z) === zoom))
  }
  setTimeout(() => {
    void refresh()
    view.focus({ preventScroll: true })
  }, 0)
  void act
  return {
    el: s,
    dispose: () => {
      alive = false
      clearInterval(timer)
      offRoom?.()
    },
  }
}
