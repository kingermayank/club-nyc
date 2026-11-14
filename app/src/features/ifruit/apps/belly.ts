/** Belly: food guide for the city. Find a spot, walk there, eat. Not delivery. */
import { el } from '../../../engine/stage'
import { goto, walkTo, world } from '../../../engine/world'
import { save } from '../../../state'
import { BELLY_SPOTS, bellyStars, type BellySpot } from '../../../data/belly'
import { ROOMS } from '../../../data/rooms'
import { screenEl, act, esc } from '../kit'
import { thenCity, type Ctx, type Screen } from '../phone'
import { tone } from '../sound'

const ateCount = () => Object.keys(save.stats).filter((k) => k.startsWith('ate:')).length

export function open(ctx: Ctx, arg?: string): Screen {
  const s = screenEl(ctx, 'Belly', { back: false, big: true, cls: 'ifbelly' })
  const head = el('div', 'ifbelly-head')
  head.innerHTML = `<img src="/art/ifruit/app/belly.png" alt=""><div><b>Find food. Walk there. Eat it.</b><span>${ateCount()} spots tasted · ratings by hungry New Yorkers</span></div>`
  const list = el('div', 'ifbelly-list')
  s.body.append(head, list)

  const spots = [...BELLY_SPOTS].sort((a, b) => b.rating - a.rating)
  for (const spot of spots) {
    const eaten = Object.keys(save.stats).some((k) => k.startsWith(`ate:${spot.room}:`))
    const row = el('button', 'ifbelly-row' + (eaten ? ' tasted' : ''))
    row.type = 'button'
    row.innerHTML = `<span class="ifbelly-top"><b>${esc(spot.name)}</b><em>${bellyStars(spot.rating)} ${spot.rating.toFixed(1)}</em></span>
      <small>${esc(spot.kind)} · ${esc(ROOMS[spot.room]?.name ?? spot.room)}${eaten ? ' · tasted' : ''}</small>
      <span class="ifbelly-blurb">${esc(spot.blurb)}</span>
      <span class="ifbelly-eats">${esc(spot.eats)}</span>`
    row.onclick = () => {
      tone('tap')
      ctx.push(detail(ctx, spot))
    }
    if (arg && spot.id === arg) setTimeout(() => ctx.push(detail(ctx, spot)), 0)
    list.append(row)
  }
  return { el: s.el }
}

function detail(ctx: Ctx, spot: BellySpot): Screen {
  const s = screenEl(ctx, spot.name, { cls: 'ifbelly-detail' })
  s.body.append(
    el('div', 'ifbelly-rating', `<b>${spot.rating.toFixed(1)}</b><span>${bellyStars(spot.rating)}</span>`),
    el('p', 'ifbelly-blurb', esc(spot.blurb)),
    el('p', 'ifbelly-eats', `Try: ${esc(spot.eats)}`),
    el('p', 'ifbelly-where', `${esc(ROOMS[spot.room]?.name ?? spot.room)}${ROOMS[spot.room]?.area ? ` · ${esc(ROOMS[spot.room]!.area)}` : ''}`),
  )
  const go = act('Go eat here', () => {
    tone('tap')
    thenCity(() => {
      const arrive = () => {
        if (spot.at) walkTo(spot.at)
        void import('../../../game').then((g) => g.api.stamp('belly-open'))
      }
      if (world.room.id === spot.room) arrive()
      else {
        goto(spot.room)
        setTimeout(arrive, 900)
      }
    })
  }, 'blue')
  s.body.append(go)
  return { el: s.el }
}
