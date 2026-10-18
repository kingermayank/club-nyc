import type { Pt } from '../geometry'
import { el, W, H } from '../engine/stage'
import { openOverlay, closeButton } from '../engine/ui'
import { world } from '../engine/world'
import { sfx } from '../audio'

export interface BinocularView {
  cx: number
  cy: number
  zoom: number
  labels: { at: Pt; text: string }[]
}

/** Coin-op tower viewer: a zoomed, pannable look at the room's own background. */
export function binoculars(v: BinocularView) {
  sfx.coin()
  const wrap = el('div', 'bino')
  const view = el('div', 'bino-view')
  const inner = el('div', 'bino-inner')
  inner.style.cssText = `width:${W * v.zoom}px;height:${H * v.zoom}px;background-image:url(/art/rooms/${world.room.bg}.jpg)`
  v.labels.forEach((l, i) => {
    const t = el('div', 'bino-label', l.text)
    t.style.cssText = `left:${l.at[0] * v.zoom}px;top:${l.at[1] * v.zoom}px;animation-delay:${0.3 + i * 0.15}s`
    inner.append(t)
  })
  view.append(inner)
  const R = 210
  let ox = 0
  let oy = 0
  const set = () => {
    const x = Math.max(-(W * v.zoom - 2 * R), Math.min(0, R - v.cx * v.zoom - ox))
    const y = Math.max(-(H * v.zoom - 2 * R), Math.min(0, R - v.cy * v.zoom - oy))
    inner.style.transform = `translate(${x}px, ${y}px)`
  }
  view.onpointermove = (e) => {
    const r = view.getBoundingClientRect()
    ox = ((e.clientX - r.left) / r.width - 0.5) * 380
    oy = ((e.clientY - r.top) / r.height - 0.5) * 180
    set()
  }
  set()
  wrap.append(view, el('div', 'bino-hint', 'Move your mouse to look around'), closeButton())
  openOverlay(wrap, { cls: 'dark' })
}
