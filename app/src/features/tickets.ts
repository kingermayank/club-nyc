import './tickets.css'
import { sfx } from '../audio'
import { nycDay } from '../data/economy'
import { el } from '../engine/stage'
import { closeButton, closeOverlay, openOverlay } from '../engine/ui'
import { world } from '../engine/world'
import { coinIcon } from '../game'
import { persist, save } from '../state'

/**
 * The box office for the places that charge in real life: the two observatories. You pick a ticket from a short
 * menu (what you get, what it costs) and it's good until midnight in New York, so going up and down all day is one
 * purchase. The binoculars on the decks are coin-operated, like the real ones: a coin a look, unless your ticket
 * (or an all-day pass bought at the viewer) covers them.
 *
 * What you hold is one number in save.stats: the day as 20261112, times ten, plus the tier (1 = the deck,
 * 2 = the deck and the viewers).
 */
export type Venue = 'empire' | 'oneworld'

interface Offer {
  tier: 1 | 2
  name: string
  gets: string
  price: number
}

const VENUES: Record<Venue, { title: string; deck: Offer[]; viewer: string }> = {
  empire: {
    title: 'Empire State Building',
    deck: [
      { tier: 1, name: '86th Floor Deck', gets: 'Elevator up, all day', price: 6 },
      { tier: 2, name: 'Deck and Binoculars', gets: 'Unlimited looks, all day', price: 8 },
    ],
    viewer: 'Binoculars',
  },
  oneworld: {
    title: 'One World Trade',
    deck: [
      { tier: 1, name: 'Sky Deck 102', gets: 'Elevator up, all day', price: 6 },
      { tier: 2, name: 'Sky Deck and Viewers', gets: 'Unlimited looks, all day', price: 8 },
    ],
    viewer: 'Harbor Viewers',
  },
}

const today = () => Number(nycDay().replaceAll('-', ''))
/** the ticket you hold for a place today: 0 none, 1 the deck, 2 the deck and its viewers */
export function ticketTier(v: Venue): 0 | 1 | 2 {
  const n = save.stats[`ticket-${v}`] ?? 0
  return Math.floor(n / 10) === today() ? ((n % 10) as 0 | 1 | 2) : 0
}
function hold(v: Venue, tier: 1 | 2) {
  save.stats[`ticket-${v}`] = today() * 10 + tier
  persist()
}

/** The menu: one row per ticket. Resolves with the row picked and paid for, or null. */
function menu(title: string, kicker: string, rows: Offer[]): Promise<Offer | null> {
  return new Promise((resolve) => {
    let settled = false
    const done = (o: Offer | null) => {
      if (settled) return
      settled = true
      resolve(o)
    }
    const p = el('div', 'panel tix', `<small class="tix-kicker">${kicker}</small><h2>${title}</h2>`)
    const list = el('div', 'tix-list')
    for (const o of rows) {
      const short = save.coins < o.price
      const b = el('button', `tix-row${short ? ' short' : ''}`, `<span class="tix-what"><b>${o.name}</b><small>${o.gets}</small></span>
        <span class="tix-price" translate="no">${coinIcon}${o.price}</span>`)
      b.type = 'button'
      b.onclick = () => {
        // not enough: your New Yorker says so (and where coins come from), the menu stays up
        if (!world.api.spend(o.price, `ticket:${title}`)) {
          b.classList.remove('nope')
          void b.offsetWidth
          b.classList.add('nope')
          return
        }
        sfx.register()
        done(o)
        closeOverlay()
      }
      list.append(b)
    }
    p.append(list, el('p', 'tix-wallet', `<span>You Have</span><b translate="no">${coinIcon}${save.coins}</b>`), closeButton())
    openOverlay(p, { onClose: () => done(null) })
  })
}

/** At the elevator: true if you hold today's ticket, or just bought one. */
export async function admit(v: Venue): Promise<boolean> {
  if (ticketTier(v)) return true
  const def = VENUES[v]
  const got = await menu(def.title, 'Tickets', def.deck)
  if (!got) return false
  hold(v, got.tier)
  world.api.toast('Ticket good all day', '🎟️')
  return true
}

/** At a viewer on the deck: true if your ticket covers it, or you just paid for a look. */
export async function look(v: Venue): Promise<boolean> {
  if (ticketTier(v) === 2) return true
  const got = await menu(VENUES[v].viewer, 'Coin Operated', [
    { tier: 1, name: 'One Look', gets: 'As long as you like', price: 1 },
    { tier: 2, name: 'All-Day Looks', gets: 'Every viewer up here', price: 3 },
  ])
  if (!got) return false
  if (got.tier === 2) hold(v, 2)
  return true
}

/** The ticket desk in the lobby: the same menu, with nowhere to go yet. */
export async function desk(v: Venue) {
  if (ticketTier(v)) return world.api.say('Got my ticket. Elevators are that way.')
  if (await admit(v)) world.api.say('One for the top, please.')
}
