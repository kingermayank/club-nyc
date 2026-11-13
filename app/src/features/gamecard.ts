import './gamecard.css'
import { sfx } from '../audio'
import { el } from '../engine/stage'
import { closeButton } from '../engine/ui'
import { save } from '../state'
import { posePictogram } from '../avatar/render'

/**
 * The card a game opens with: shown, not explained. Its title art with the name on it, then a strip of little tiles
 * where your own New Yorker acts out each move next to the key that does it, then the one or two ways to play as big
 * buttons. Anything else (the leaderboard) is an icon in the corner. Used by the multiplayer games (mp/hub.ts) and
 * Showtime (features/subwayLife.ts).
 */
export interface GameButton {
  label: string
  /** a short line under the label, sentence case */
  sub: string
  /** an illustrated icon in /art/icons/e/ */
  icon: string
  act: () => void
}
export interface GameCardOpts {
  art: string
  place: string
  title: string
  /** one short line on the art */
  tagline: string
  /** "2–9" and the like, shown as a chip on the art */
  players?: string
  tiles: string[]
  primary: GameButton
  secondary?: GameButton
  board?: () => void
}

/** a chunky keycap */
export const key = (k: string, wide = false) => `<kbd class="gc-key${wide ? ' wide' : ''}">${k}</kbd>`
/** your New Yorker, mid-move */
export const me = (pose: Parameters<typeof posePictogram>[1] = 'idle', at = 0.3) => posePictogram(save.look, pose, at)
/** one how-to tile: a little looping scene, the keys, and two or three words */
export const tile = (scene: string, label: string, keys = '', cls = '') =>
  `<div class="gc-tile"><div class="gc-scene ${cls}">${scene}</div><div class="gc-keys">${keys}</div><b>${label}</b></div>`
export const icon = (name: string, cls = '', style = '') => `<img class="${cls}" src="/art/icons/e/${name}.png" alt="" draggable="false"${style ? ` style="${style}"` : ''}>`
export const sprite = (src: string, cls = '', style = '') => `<img class="${cls}" src="${src}" alt="" draggable="false"${style ? ` style="${style}"` : ''}>`

export function gameCard(o: GameCardOpts): { el: HTMLElement; live: (html: string) => void } {
  const p = el('div', 'panel gc')
  p.innerHTML = `<div class="gc-hero" style="background-image:url(${o.art})">
      <span class="gc-place">${icon('pin')}${o.place}</span>
      <div class="gc-name"><h2>${o.title}</h2><p>${o.tagline}</p></div>
      <div class="gc-chips">${o.players ? `<span class="gc-chip">${icon('friends')}${o.players}</span>` : ''}<span class="gc-chip gc-live" hidden></span></div>
    </div>
    <div class="gc-how">${o.tiles.join('')}</div>
    <div class="gc-go"></div>`
  const go = p.querySelector<HTMLElement>('.gc-go')!
  for (const [b, cls] of [[o.primary, 'primary'], [o.secondary, 'secondary']] as const) {
    if (!b) continue
    const btn = el('button', `btn gc-btn ${cls}`, `${icon(b.icon)}<span><b>${b.label}</b><small>${b.sub}</small></span>`) as HTMLButtonElement
    btn.onclick = () => b.act()
    go.append(btn)
  }
  if (o.board) {
    const b = el('button', 'gc-board', icon('trophy')) as HTMLButtonElement
    b.title = 'Leaderboard'
    b.setAttribute('aria-label', 'Leaderboard')
    b.onclick = () => {
      sfx.click()
      o.board!()
    }
    p.querySelector('.gc-hero')!.append(b)
  }
  p.append(closeButton())
  const liveChip = p.querySelector<HTMLElement>('.gc-live')!
  return {
    el: p,
    live: (html) => {
      liveChip.innerHTML = html
      liveChip.hidden = !html
    },
  }
}
