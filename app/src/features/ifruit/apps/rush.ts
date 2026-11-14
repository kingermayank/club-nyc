/**
 * Rush Hour Run — fitness parody for the city.
 * Personal bests, friends on the board, and buttons to start a run or a bike dash.
 * (Not affiliated with any real fitness brand.)
 */
import { el } from '../../../engine/stage'
import { link } from '../../../net/link'
import { MP_GAMES, fmtBest, type MpGameId } from '../../../mp/shared/games'
import { screenEl, act, empty, shimmer, esc } from '../kit'
import { thenCity, type Ctx, type Screen } from '../phone'
import { tone } from '../sound'

const LINES = [
  'You moved. The city noticed. Barely.',
  'Personal best unlocked. Brag responsibly.',
  'Another block conquered. The pigeons remain unimpressed.',
  'Sweat equity in a city that never cools down.',
]

export function open(ctx: Ctx): Screen {
  const s = screenEl(ctx, 'Rush Hour Run', { back: false, big: true, cls: 'ifrush' })
  const body = el('div', 'ifrush-body', shimmer(4))
  s.body.append(body)

  const render = async () => {
    body.innerHTML = ''
    if (!link.account) {
      body.append(empty('/art/ifruit/app/rush.png', 'Online Only', 'Sign in to track runs and race friends.'))
      return
    }
    const { fetchHub } = await import('../../../mp/hub')
    const { fetchBoard } = await import('../../../mp/board')
    const hub = await fetchHub(0)
    const line = LINES[Math.floor(Math.random() * LINES.length)]
    const head = el('div', 'ifrush-head')
    head.innerHTML = `<img src="/art/ifruit/app/rush.png" alt=""><div><b>Your City Activity</b><span>${esc(line)}</span></div>`
    body.append(head)

    const stats = el('div', 'ifrush-stats')
    const row = (g: MpGameId, label: string) => {
      const st = hub?.stats[g]
      const best = st?.best != null ? fmtBest(g, st.best) : '—'
      const wins = st?.wins ?? 0
      const played = st?.played ?? 0
      const r = el('div', 'ifrush-stat')
      r.innerHTML = `<b>${esc(label)}</b><strong>${esc(best)}</strong><small>${played} played · ${wins} win${wins === 1 ? '' : 's'}</small>`
      return r
    }
    stats.append(
      row('runner', 'Farthest Run'),
      row('sled', 'Best Bike Time'),
      row('carbs', 'Carb Streak'),
    )
    body.append(stats)

    const friends = el('div', 'ifrush-friends')
    friends.append(el('div', 'ifr-sec', 'Friends this week'))
    try {
      const board = await fetchBoard('runner', 'week', 'best', true)
      const top = board.rows.filter((r) => !r.you).slice(0, 5)
      if (!top.length) friends.append(el('div', 'ifrush-empty', 'No friend times yet. Challenge someone to a platform sprint.'))
      else for (const r of top) {
        friends.append(
          el('div', 'ifr-row', `<span class="ifr-txt"><b translate="no">${esc(r.name)}</b><small>${r.best != null ? fmtBest('runner', r.best) : '—'}</small></span>`),
        )
      }
    } catch {
      friends.append(el('div', 'ifrush-empty', 'Couldn’t load friend times. Try again in a moment.'))
    }
    body.append(friends)

    const bar = el('div', 'ifr-actions ifrush-acts')
    bar.append(
      act('Start a Run', () => {
        tone('tap')
        thenCity(() => void import('../../../mp/hub').then((m) => m.openGameCard('runner')))
      }, 'blue'),
      act('City Bike Dash', () => {
        tone('tap')
        ctx.open('bike')
      }),
      act('Carb-Jitsu', () => {
        tone('tap')
        ctx.open('carbs')
      }, 'ghost'),
    )
    body.append(bar)

    const tip = el('p', 'ifrush-tip', `${MP_GAMES.runner.blurb}`)
    body.append(tip)
  }

  void render().then(() => void import('../../../game').then((g) => g.api.stamp('rush-tracker')))
  return { el: s.el, onShow: () => void render() }
}
