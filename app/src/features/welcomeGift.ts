import './welcomeGift.css'
import { sfx } from '../audio'
import { el } from '../engine/stage'
import { closeButton, closeOverlay, confetti, openOverlay } from '../engine/ui'
import { avatarPortrait } from '../avatar/render'
import { ITEM } from '../avatar/items'
import { save } from '../state'
import { WELCOME_GIFTS } from '../data/economy'

/**
 * Sal's welcome gift (Times Square, once per New Yorker): a picture of you wearing each gift, so you can see what
 * you're picking. Resolves with the item id, or null if closed without picking.
 */
export function pickWelcomeGift(): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false
    const done = (v: string | null) => {
      if (settled) return
      settled = true
      resolve(v)
    }
    const p = el('div', 'panel wide welcome-gift', `<h2>🌭 Sal’s Cart</h2><p>New in town? Welcome to New York! First one’s on the house. Pick a welcome gift.</p>`)
    const grid = el('div', 'wg-grid')
    for (const id of WELCOME_GIFTS) {
      const item = ITEM[id]
      if (!item) continue
      // you, wearing it (everything else you have on stays the same)
      const look = { ...save.look, items: { ...save.look.items, [item.slot]: id } }
      const card = el('button', 'wg-card', `<span class="wg-pic">${avatarPortrait(look)}</span><span class="wg-name">${item.name}</span>`)
      card.setAttribute('aria-label', `Pick the ${item.name}`)
      card.onclick = () => {
        sfx.click()
        done(id)
        closeOverlay()
        confetti()
      }
      grid.append(card)
    }
    p.append(grid, closeButton())
    openOverlay(p, { onClose: () => done(null) })
  })
}
