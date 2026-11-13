import './platform.css'
import { onRoom } from '../engine/world'
import { el } from '../engine/stage'

/**
 * The subway platform is one room ('subway') that becomes whichever station you went down into: the mosaic on the
 * wall and the map poster's title spell that station, and its lines are on the poster. features/subway.ts decides the
 * station (setPlatform); this module only remembers it and paints it, so the room can draw it without loading the map.
 */
export interface PlatformStation { room: string; name: string; place: string; mosaic: string; bullets: string }
const b = (l: string, bg: string, fg = '#fff') => `<span class="bullet" style="background:${bg};color:${fg};width:12px;height:12px;font-size:7.4px">${l}</span>`
/** until you ride somewhere, the platform is Times Sq–42 St */
let current: PlatformStation | null = { room: 'subway', name: 'Times Sq–42 St', place: 'Times Square', mosaic: 'TIMES SQ', bullets: [['1', '#EE352E'], ['2', '#EE352E'], ['3', '#EE352E'], ['7', '#B933AD'], ['N', '#FCCC0A', '#1d2140'], ['Q', '#FCCC0A', '#1d2140'], ['R', '#FCCC0A', '#1d2140'], ['W', '#FCCC0A', '#1d2140'], ['S', '#808183']].map(([l, bg, fg]) => b(l, bg, fg)).join('') }
export const setPlatformSign = (s: PlatformStation) => void (current = s)

/** the mosaic's inner panel and the poster's title block, in stage units over subway-empty.jpg */
const MOSAIC = { x: 374, y: 40, w: 237, h: 35 }
const POSTER = { x: 328, y: 104, w: 132, h: 62 }

onRoom('subway', ({ scene }) => {
  const s = current
  if (!s) return
  const mosaic = el('div', 'pf-mosaic', `<b>${s.mosaic}</b>`)
  mosaic.style.cssText = `left:${MOSAIC.x}px;top:${MOSAIC.y}px;width:${MOSAIC.w}px;height:${MOSAIC.h}px`
  // the longer the name, the smaller the tiles
  const len = s.mosaic.length
  mosaic.style.setProperty('--fs', `${Math.min(25, Math.round(235 / Math.max(6, len) * 1.25))}px`)
  const poster = el('div', 'pf-poster', `<b>${s.place}</b><span>${s.name}</span><div class="pf-bullets">${s.bullets}</div>`)
  poster.style.cssText = `left:${POSTER.x}px;top:${POSTER.y}px;width:${POSTER.w}px;height:${POSTER.h}px`
  scene.append(mosaic, poster)
  // the map poster is a clickable cutout drawn by depth: sit just above it (and above the mosaic band's art)
  const cut = [...scene.querySelectorAll<HTMLImageElement>('img.cutout')].find((i) => (i.getAttribute('src') ?? '').includes('/map-poster.png'))
  const z = Number(cut?.style.zIndex || 0)
  if (z) poster.style.zIndex = String(z + 1)
  return () => (mosaic.remove(), poster.remove())
})
