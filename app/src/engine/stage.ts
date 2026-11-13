import type { Pt } from '../geometry'

export const W = 1000
export const H = 565

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  return e
}

/** The fixed 1000×565 stage, scaled to fit the window, with its layers. */
export const stage = {
  viewport: el('div', 'viewport'),
  root: el('div', 'stage'),
  bg: el('img', 'room-bg') as HTMLImageElement,
  scene: el('div', 'scene'),
  /** name tags + speech bubbles, above everyone in the room */
  overhead: el('div', 'overhead-layer'),
  fx: el('div', 'fx-layer'),
  hud: el('div', 'hud'),
  toolbar: el('div', 'toolbar'),
  overlay: el('div', 'overlay'),
  toasts: el('div', 'toasts'),
  notices: el('div', 'notices'),
  fade: el('div', 'fade'),
  label: el('div', 'hover-label'),
  scale: 1,
}

export function mountStage(host: HTMLElement) {
  host.innerHTML = ''
  stage.bg.alt = ''
  stage.bg.draggable = false
  stage.root.append(stage.bg, stage.scene, stage.overhead, stage.fx, stage.label, stage.hud, stage.toolbar, stage.notices, stage.overlay, stage.toasts, stage.fade)
  stage.viewport.append(stage.root)
  host.append(stage.viewport)
  // The stage fills its viewport box, which is the framed page by default and the whole window in full screen
  // (shell.ts), so it follows the box rather than the window.
  const fit = () => {
    const r = stage.viewport.getBoundingClientRect()
    const scale = Math.min((r.width || window.innerWidth) / W, (r.height || window.innerHeight) / H)
    if (scale === stage.scale && stage.root.style.transform) return
    stage.scale = scale
    stage.root.style.transform = `translate(-50%, -50%) scale(${scale})`
    // canvases that size themselves from the stage (the city view, the mini-games) listen for the window's resize;
    // going in and out of full screen changes the stage without one
    window.dispatchEvent(new Event('resize'))
  }
  new ResizeObserver(fit).observe(stage.viewport)
  fit()
  // the stage clips (overflow: hidden) but can still be scrolled by focus/scrollIntoView — keep it pinned
  for (const node of [stage.root, stage.viewport]) node.addEventListener('scroll', () => node.scrollTop || node.scrollLeft ? node.scrollTo(0, 0) : undefined)
}

export function toStage(e: { clientX: number; clientY: number }): Pt {
  const r = stage.root.getBoundingClientRect()
  return [(e.clientX - r.left) / stage.scale, (e.clientY - r.top) / stage.scale]
}
