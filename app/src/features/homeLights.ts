import './homeLights.css'
import { el, stage } from '../engine/stage'

/**
 * The light in a home (features/apartment.ts). The rooms are painted with the lights on. When a lamp is switched
 * off the room goes to evening: one sheet of blue shadow multiplied over everything in it (walls, furniture, people;
 * name tags and speech stay bright above it), with a soft hole cut wherever something is still giving light: a lamp
 * that is on, the neon sign, the TV, the window. Each of those also throws its own colour onto the room.
 */
export interface Light {
  /** where the light comes from, in stage units */
  x: number
  y: number
  /** how far it reaches */
  rx: number
  ry?: number
  /** its colour, as "r, g, b" */
  tint: string
  /** how much of the dark it lifts, 0 to 1 */
  power?: number
  /** how strongly it colours what it falls on, 0 to 1 */
  glow?: number
  /** a TV's picture or a fire: the light is never quite steady */
  flicker?: 'tv' | 'fire'
  /** a neon tube catching: stutters once as it comes on */
  strike?: boolean
}

const NS = 'http://www.w3.org/2000/svg'
let root: HTMLElement | null = null
let seq = 0

export function mountLights() {
  root = el('div', 'home-lights')
  stage.root.insertBefore(root, stage.overhead)
  return () => {
    root?.remove()
    root = null
  }
}

/** `dark`: a lamp is off, so the room is only as bright as what is still on. */
export function setLights(dark: boolean, lights: Light[]) {
  if (!root) return
  const id = `hl${++seq}`
  const holes = lights
    .map((l, i) => {
      const p = l.power ?? 1
      return `<radialGradient id="${id}g${i}"><stop offset="0" stop-color="#000" stop-opacity="${p}"/><stop offset="0.45" stop-color="#000" stop-opacity="${p * 0.8}"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`
    })
    .join('')
  const cuts = lights.map((l, i) => `<ellipse class="${l.flicker ? 'hl-' + l.flicker : ''}" cx="${l.x}" cy="${l.y}" rx="${l.rx}" ry="${l.ry ?? l.rx}" fill="url(#${id}g${i})"/>`).join('')
  const glows = lights
    .filter((l) => l.glow)
    .map((l) => {
      const ry = l.ry ?? l.rx
      const cls = 'hl-glow' + (l.flicker ? ' hl-' + l.flicker : '') + (l.strike ? ' hl-strike' : '')
      return `<i class="${cls}" style="left:${l.x - l.rx}px;top:${l.y - ry}px;width:${l.rx * 2}px;height:${ry * 2}px;--tint:${l.tint};--glow:${l.glow}"></i>`
    })
    .join('')
  // the old sheet stays where it is and only its mask changes, so switching a second lamp doesn't blink the room
  let sheet = root.querySelector<SVGSVGElement>('.hl-dark')
  if (!sheet) {
    sheet = document.createElementNS(NS, 'svg')
    sheet.setAttribute('class', 'hl-dark')
    sheet.setAttribute('viewBox', '0 0 1000 565.5')
    sheet.setAttribute('preserveAspectRatio', 'none')
    root.append(sheet)
    root.append(el('div', 'hl-glows'))
  }
  sheet.innerHTML = `<defs>${holes}<mask id="${id}"><rect width="1000" height="566" fill="#fff"/>${cuts}</mask></defs><rect class="hl-shade" width="1000" height="566" mask="url(#${id})"/>`
  root.querySelector('.hl-glows')!.innerHTML = glows
  // next frame, so the first time a room goes dark it fades instead of snapping
  requestAnimationFrame(() => root?.classList.toggle('dark', dark))
}
