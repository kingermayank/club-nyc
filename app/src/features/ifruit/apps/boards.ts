/**
 * Leaderboards inside iFruit: job boards + multiplayer personal bests.
 * Replaces the old Friends & Leaderboards toolbar entry (Friends live in Contacts).
 */
import { el } from '../../../engine/stage'
import { BOARD_GAMES, board, fmt, myWeekly } from '../../../social/leaderboard'
import { standings, myTeam } from '../../../social/teams'
import { MP_GAMES, MP_GAME_IDS, fmtBest } from '../../../mp/shared/games'
import { link } from '../../../net/link'
import { screenEl, act, empty, shimmer, esc } from '../kit'
import { thenCity, type Ctx, type Screen } from '../phone'
import { tone } from '../sound'
import { isOnline } from '../store'

export function open(ctx: Ctx, arg?: string): Screen {
  const s = screenEl(ctx, 'Leaderboards', { back: false, big: true, cls: 'ifboards' })
  const tabs = el(
    'div',
    'ifp-tabs',
    '<button class="on" data-t="jobs" type="button">Jobs</button><button data-t="games" type="button">Games</button><button data-t="teams" type="button">Hoods</button>',
  )
  const body = el('div', 'ifboards-body', shimmer(5))
  s.body.append(tabs, body)
  let tab = (arg === 'games' || arg === 'teams' ? arg : 'jobs') as 'jobs' | 'games' | 'teams'

  const setTab = (t: typeof tab) => {
    tab = t
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.t === t))
    void render()
  }
  tabs.querySelectorAll<HTMLButtonElement>('button').forEach((b) => {
    b.onclick = () => {
      tone('tap')
      setTab((b.dataset.t as typeof tab) || 'jobs')
    }
  })

  const render = async () => {
    body.innerHTML = shimmer(5)
    if (tab === 'jobs') renderJobs(body)
    else if (tab === 'teams') renderTeams(body)
    else await renderGames(ctx, body)
  }
  tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.t === tab))
  void render()
  return { el: s.el, onShow: () => void render() }
}

function renderJobs(body: HTMLElement) {
  body.innerHTML = ''
  for (const g of BOARD_GAMES) {
    const rows = board(g.id).slice(0, 5)
    const mine = myWeekly(g.id)
    const box = el('div', 'ifboards-game')
    box.innerHTML = `<div class="ifboards-gtitle"><b>${esc(g.title)}</b><small>You: ${mine ? fmt(g.id, mine) : '—'}</small></div>`
    const list = el('div', 'ifboards-rows')
    rows.forEach((r, i) => {
      list.append(
        el(
          'div',
          'ifr-row' + (r.you ? ' you' : ''),
          `<span class="ifboards-rank">${i + 1}</span><span class="ifr-txt"><b translate="no">${esc(r.name)}</b></span><em>${fmt(g.id, r.score)}</em>`,
        ),
      )
    })
    box.append(list)
    body.append(box)
  }
}

function renderTeams(body: HTMLElement) {
  body.innerHTML = ''
  const mine = myTeam()
  const rows = standings()
  if (!rows.length) {
    body.append(empty('/art/ifruit/app/boards.png', 'No Standings Yet', 'Play jobs to earn points for your neighborhood.'))
    return
  }
  for (const r of rows) {
    const t = r.team
    body.append(
      el(
        'div',
        'ifr-row' + (mine?.id === t.id ? ' you' : ''),
        `<span class="ifboards-swatch" style="background:${t.color}"></span><span class="ifr-txt"><b>${esc(t.name)}</b><small>${Math.round(r.points)} pts</small></span>${mine?.id === t.id ? '<em>You</em>' : ''}`,
      ),
    )
  }
}

async function renderGames(ctx: Ctx, body: HTMLElement) {
  body.innerHTML = ''
  if (!isOnline() || !link.account) {
    body.append(empty('/art/ifruit/app/boards.png', 'Online Only', 'Sign in to see multiplayer boards.'))
    return
  }
  const { fetchHub } = await import('../../../mp/hub')
  const hub = await fetchHub(0)
  for (const id of MP_GAME_IDS) {
    const def = MP_GAMES[id]
    const st = hub?.stats[id]
    const box = el('div', 'ifboards-game')
    box.innerHTML = `<div class="ifboards-gtitle"><b>${esc(def.short)}</b><small>${st?.best != null ? fmtBest(id, st.best) : 'No best yet'}</small></div>`
    const bar = el('div', 'ifr-actions')
    bar.append(
      act('Full Board', () => {
        tone('tap')
        thenCity(() => void import('../../../mp/board').then((m) => m.openBoard(id)))
      }, 'blue'),
      act('Play', () => {
        tone('tap')
        const app = id === 'sled' ? 'bike' : id === 'runner' ? 'rush' : 'carbs'
        ctx.open(app as 'bike' | 'rush' | 'carbs')
      }),
    )
    box.append(bar)
    body.append(box)
  }
}
