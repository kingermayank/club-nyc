/** Carb-Jitsu: pizza / pretzel / bagel card battles at 99¢ Slice. */
import { el } from '../../../engine/stage'
import { MP_GAMES } from '../../../mp/shared/games'
import { screenEl, act } from '../kit'
import { thenCity, type Ctx, type Screen } from '../phone'
import { tone } from '../sound'

const def = MP_GAMES.carbs

export function open(ctx: Ctx): Screen {
  const s = screenEl(ctx, 'Carb-Jitsu', { back: false, big: true, cls: 'ifgames' })
  const hero = el('div', 'ifgames-hero')
  hero.innerHTML = `<img src="${def.art}" alt=""><div><b>${def.short}</b><span>${def.place}</span></div>`
  const body = el('div', 'ifgames-body')
  body.innerHTML = `<p>${def.blurb}</p><ul>${def.how.map((h) => `<li>${h}</li>`).join('')}</ul>`
  const play = act('Quick Match', () => {
    tone('tap')
    void import('../../../game').then((g) => g.api.stamp('phone-gamer'))
    thenCity(() => void import('../../../mp/hub').then((m) => m.openGameCard('carbs')))
  }, 'blue')
  const lobby = act('Create Lobby', () => {
    tone('tap')
    thenCity(() => void import('../../../mp/controller').then((m) => m.createLobby('carbs')))
  })
  const board = act('Leaderboard', () => {
    tone('tap')
    thenCity(() => void import('../../../mp/board').then((m) => m.openBoard('carbs')))
  }, 'ghost')
  const bar = el('div', 'ifr-actions')
  bar.append(play, lobby, board)
  s.body.append(hero, body, bar)
  return { el: s.el }
}
