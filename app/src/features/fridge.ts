import './fridge.css'
import { sfx } from '../audio'
import { ITEM } from '../avatar/items'
import { itemIcon } from '../avatar/render'
import { el } from '../engine/stage'
import { world } from '../engine/world'
import { save, persist } from '../state'
import { MAGNETS, magnetSrc } from '../data/souvenirs'
import type { Game } from '../types'
import { closeX, openMoment } from './moments/kit'

/**
 * Your fridge, up close. The door fills the screen and every magnet you own is stuck on it: drag them wherever you
 * like and they stay there (save.magnetAt). Pull the handle and the door swings open on the inside: the shelves hold
 * the food you actually own (click something to take it out), plus what every New York fridge has anyway.
 *
 * The fridge is drawn here (SVG), not painted: it has to open, and the door has to carry the magnets with it.
 */
const FOOD = ['pizza-slice', 'hotdog', 'pretzel', 'bagel', 'donut', 'cookie', 'black-white', 'croissant', 'dumplings', 'gelato', 'cocoa', 'coffee', 'latte', 'ralphs-coffee', 'cold-brew', 'boba']
/** the door's own box on the stage, and where magnets may sit on it (kept off the handle) */
const DOOR = { x: 270, y: -30, w: 460, h: 640 }
const PAD = { l: 0.2, r: 0.93, t: 0.1, b: 0.9 }
/** where a magnet goes before you've ever moved it: a loose scatter down the door */
const SCATTER: [number, number][] = [[0.34, 0.2], [0.62, 0.17], [0.8, 0.3], [0.45, 0.4], [0.7, 0.5], [0.33, 0.6], [0.58, 0.68], [0.82, 0.74], [0.42, 0.82]]

const DOOR_SVG = `<svg viewBox="0 0 460 640" preserveAspectRatio="none" aria-hidden="true">
  <defs><linearGradient id="fr-enamel" x1="0" x2="1"><stop offset="0" stop-color="#fbf6ea"/><stop offset="0.7" stop-color="#f1e8d6"/><stop offset="1" stop-color="#dccfb6"/></linearGradient></defs>
  <rect x="4" y="4" width="452" height="632" rx="26" fill="url(#fr-enamel)" stroke="#1d2140" stroke-width="7"/>
  <path d="M8 196 H452" stroke="#1d2140" stroke-width="7"/>
  <path d="M8 204 H452" stroke="#c9bb9d" stroke-width="5" opacity="0.7"/>
  <rect x="30" y="20" width="16" height="596" rx="8" fill="#fff" opacity="0.55"/>
  <rect x="356" y="26" width="64" height="16" rx="8" fill="#c9d3dc" stroke="#1d2140" stroke-width="4"/>
  <rect class="fr-h" x="26" y="60" width="22" height="104" rx="11" fill="#dfe6ec" stroke="#1d2140" stroke-width="5"/>
  <rect class="fr-h" x="26" y="236" width="22" height="190" rx="11" fill="#dfe6ec" stroke="#1d2140" stroke-width="5"/>
  <rect x="31" y="246" width="6" height="170" rx="3" fill="#fff" opacity="0.8"/>
</svg>`

const INSIDE_SVG = `<svg viewBox="0 0 460 640" preserveAspectRatio="none" aria-hidden="true">
  <defs><linearGradient id="fr-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fffef4"/><stop offset="0.25" stop-color="#eef6fb"/><stop offset="1" stop-color="#cfe2ee"/></linearGradient></defs>
  <rect x="4" y="4" width="452" height="632" rx="26" fill="#f1e8d6" stroke="#1d2140" stroke-width="7"/>
  <rect x="30" y="30" width="400" height="148" rx="12" fill="#dfeef7" stroke="#1d2140" stroke-width="5"/>
  <path d="M46 150 q22 -34 44 0 t44 0 t44 0 t44 0 t44 0 t44 0 t44 0 t44 0" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity="0.9"/>
  <rect x="30" y="206" width="400" height="404" rx="12" fill="url(#fr-in)" stroke="#1d2140" stroke-width="5"/>
  <ellipse cx="230" cy="216" rx="150" ry="16" fill="#fff8c9" opacity="0.9"/>
  <g stroke="#1d2140" stroke-width="5" stroke-linecap="round"><path d="M34 318 H426"/><path d="M34 418 H426"/><path d="M34 512 H426"/></g>
  <g stroke="#a9c3d3" stroke-width="3" opacity="0.8"><path d="M34 325 H426"/><path d="M34 425 H426"/></g>
  <rect x="42" y="522" width="182" height="78" rx="10" fill="#e3f0f7" stroke="#1d2140" stroke-width="4" opacity="0.95"/>
  <rect x="236" y="522" width="182" height="78" rx="10" fill="#e3f0f7" stroke="#1d2140" stroke-width="4" opacity="0.95"/>
</svg>`

export function openFridge(g: Game) {
  const m = openMoment('fr')
  const have = MAGNETS.filter((x) => (save.magnets ?? []).includes(x.id))
  const at = (save.magnetAt ??= {})
  const room = el('div', 'fr-room')
  room.style.backgroundImage = `url(/art/rooms/${world.room.bg}.jpg)`
  const box = el('div', 'fr-box')
  box.style.cssText = `left:${DOOR.x}px;top:${DOOR.y}px;width:${DOOR.w}px;height:${DOOR.h}px`
  const inside = el('div', 'fr-inside', INSIDE_SVG)
  const door = el('div', 'fr-door', DOOR_SVG)
  box.append(inside, door)
  const x = closeX(m)
  x.classList.add('cu-x')
  m.root.append(room, box, x)

  // ---- the magnets, on the door ----
  const count = el('div', 'fr-count', `<b>${have.length}</b> of ${MAGNETS.length}`)
  door.append(count)
  have.forEach((mag, i) => {
    const [fx, fy] = at[mag.id] ?? SCATTER[i % SCATTER.length]
    const img = el('img', 'fr-magnet') as HTMLImageElement
    img.src = magnetSrc(mag.id)
    img.alt = mag.name
    img.title = mag.name
    img.draggable = false
    const put = (px: number, py: number) => {
      img.style.left = `${px * 100}%`
      img.style.top = `${py * 100}%`
    }
    put(fx, fy)
    img.style.setProperty('--r', `${((i * 37) % 17) - 8}deg`)
    img.onpointerdown = (e0) => {
      if (open) return
      e0.preventDefault()
      e0.stopPropagation()
      const r = door.getBoundingClientRect()
      const b = img.getBoundingClientRect()
      // keep hold of it where you took it
      const off = [e0.clientX - (b.left + b.width / 2), e0.clientY - (b.top + b.height / 2)]
      let last: [number, number] = [fx, fy]
      img.classList.add('held')
      door.append(img)
      sfx.pop()
      const move = (e: PointerEvent) => {
        last = [Math.min(PAD.r, Math.max(PAD.l, (e.clientX - off[0] - r.left) / r.width)), Math.min(PAD.b, Math.max(PAD.t, (e.clientY - off[1] - r.top) / r.height))]
        put(last[0], last[1])
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        img.classList.remove('held')
        at[mag.id] = [Math.round(last[0] * 1000) / 1000, Math.round(last[1] * 1000) / 1000]
        persist()
        sfx.tick()
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }
    door.append(img)
  })

  // ---- inside: what you own, and what every fridge has ----
  const shelves = el('div', 'fr-shelves')
  const mine = FOOD.filter((id) => ITEM[id] && g.owns(id))
  for (const id of mine) {
    const b = el('button', 'fr-food', `<span>${itemIcon(id)}</span>`) as HTMLButtonElement
    b.type = 'button'
    b.title = ITEM[id].name
    b.setAttribute('aria-label', ITEM[id].name)
    b.onclick = () => {
      sfx.pop()
      m.close()
      g.wear(id)
      g.say(`${ITEM[id].name}. Still good. Probably.`)
    }
    shelves.append(b)
  }
  // the staples: one egg of unknown age, hot sauce packets, a takeout box
  const staples = el('div', 'fr-staples', `<i class="fr-egg" title="One egg"></i><i class="fr-box-out" title="Half a halal platter"></i><i class="fr-packets" title="Forty hot sauce packets"></i>`)
  inside.append(shelves, staples)

  // ---- the handle ----
  let open = false
  const handle = el('button', 'fr-handle') as HTMLButtonElement
  handle.type = 'button'
  handle.setAttribute('aria-label', 'Open the fridge')
  handle.title = 'Open the fridge'
  door.append(handle)
  const swing = (on: boolean) => {
    open = on
    m.root.classList.toggle('open', on)
    sfx.thunk()
    if (on) m.later(() => sfx.ding(), 350)
  }
  handle.onclick = (e) => (e.stopPropagation(), swing(true))
  // the open door (a sliver at the left) or the Backspace key closes it again
  door.onclick = () => open && swing(false)
  m.onKey((e) => (e.key === 'Backspace' && open ? (swing(false), true) : false))
  sfx.whoosh()
}
