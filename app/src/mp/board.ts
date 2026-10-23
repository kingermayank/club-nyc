/**
 * Each game's leaderboard, saved on the server (/api/mp/board/:game): this week or all time, by wins or by best
 * score, everyone or just you and your friends. Shown inside the game (lobby and results) and from the Games tab.
 */
import { el } from '../engine/stage'
import { openOverlay, closeButton } from '../engine/ui'
import { headPortrait } from '../avatar/render'
import { sfx } from '../audio'
import { rest } from '../net/server'
import { msToReset } from '../social/rng'
import type { Look } from '../avatar/look'
import { MP_GAMES, fmtBest, type MpGameId } from './shared/games'
import { openSub, shellOpen } from './shell'
import { esc } from './store'
import { isFriend } from './social'

export interface BoardRow {
  id: string
  name: string
  look: Look | null
  team: string
  wins: number
  played: number
  best: number | null
  you: boolean
}
export interface BoardRes {
  week: string
  rows: BoardRow[]
  me: { rank: number; wins: number; best: number | null; played: number } | null
}
type Period = 'week' | 'all'
type By = 'wins' | 'best'

export const fetchBoard = (game: MpGameId, period: Period, by: By, friends: boolean) =>
  rest<BoardRes>(`/mp/board/${game}?period=${period}&by=${by}${friends ? '&scope=friends' : ''}`)

const MEDAL = ['medal-gold', 'medal-silver', 'medal-bronze']
export const rankCell = (i: number) => (i < 3 ? `<img src="/art/icons/e/${MEDAL[i]}.png" alt="#${i + 1}">` : `#${i + 1}`)
export const face = (look: Look | null) => (look ? headPortrait(look) : '')

function resetIn() {
  const ms = msToReset()
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  return d ? `${d}d ${h}h` : `${h}h`
}

/** the full board, as a panel (inside the game's shell, or on top of the city) */
export function openBoard(game: MpGameId, o: { period?: Period; by?: By; friends?: boolean } = {}) {
  const def = MP_GAMES[game]
  let period: Period = o.period ?? 'week'
  let by: By = o.by ?? 'wins'
  let friends = !!o.friends
  const card = el('div', 'mp-board')
  card.innerHTML = `<h2>${esc(def.short)} Leaderboard</h2><p>Saved for good: wins against real New Yorkers and your ${def.best.label.toLowerCase()}.</p>`
  const head = el('div', 'mp-board-head')
  const seg = (opts: [string, string][], get: () => string, set: (v: string) => void) => {
    const s = el('div', 'mp-seg')
    for (const [v, label] of opts) {
      const b = el('button', get() === v ? 'on' : '', label)
      b.onclick = () => {
        sfx.click()
        set(v)
        s.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b))
        void load()
      }
      s.append(b)
    }
    return s
  }
  head.append(
    seg([['week', 'This Week'], ['all', 'All Time']], () => period, (v) => (period = v as Period)),
    seg([['wins', 'Wins'], ['best', def.best.label]], () => by, (v) => (by = v as By)),
    seg([['all', 'Everyone'], ['friends', 'Friends']], () => (friends ? 'friends' : 'all'), (v) => (friends = v === 'friends')),
  )
  const rows = el('div', 'mp-board-rows', '<div class="mp-empty">Loading…</div>')
  const foot = el('div', 'mp-board-foot')
  card.append(head, rows, foot)
  let gen = 0
  const load = async () => {
    const my = ++gen
    rows.innerHTML = '<div class="mp-empty">Loading…</div>'
    let r: BoardRes
    try {
      r = await fetchBoard(game, period, by, friends)
    } catch {
      if (my === gen) rows.innerHTML = '<div class="mp-empty">Couldn’t load the leaderboard. Try again in a moment.</div>'
      return
    }
    if (my !== gen) return
    rows.innerHTML = ''
    if (!r.rows.length) {
      rows.innerHTML = `<div class="mp-empty">${friends ? 'None of your friends have played yet' : 'Nobody has played yet'}${period === 'week' ? ' this week' : ''}. First place is wide open.</div>`
    } else {
      rows.append(el('div', 'mp-brow headrow', `<span></span><span></span><span>Name</span><span class="num">Wins</span><span class="num">${esc(def.best.label)}</span>`))
      r.rows.slice(0, 25).forEach((row, i) => {
        const fr = !row.you && isFriend(row.id)
        rows.append(
          el(
            'div',
            'mp-brow' + (row.you ? ' you' : '') + (fr ? ' friend' : ''),
            `<span class="rk">${rankCell(i)}</span><span class="mp-face">${face(row.look)}</span><b>${esc(row.name)}${row.you ? ' (you)' : fr ? ' ★' : ''}</b><span class="num">${row.wins}</span><span class="num">${row.best !== null && row.best > 0 ? fmtBest(game, row.best) : '–'}</span>`,
          ),
        )
      })
    }
    foot.innerHTML = `<span>${r.me && r.me.rank ? `You’re <b>#${r.me.rank}</b> · ${r.me.wins} ${r.me.wins === 1 ? 'win' : 'wins'} · ${r.me.played} played` : `You haven’t played ${def.short} ${period === 'week' ? 'this week' : 'yet'}.`}${period === 'week' ? ` · resets in ${resetIn()}` : ''}</span>`
  }
  void load()
  if (shellOpen()) return openSub(card)
  card.classList.add('panel', 'mp-sub-card')
  card.append(closeButton())
  openOverlay(card)
}

/** the top few this week, for the results screen */
export async function miniBoard(game: MpGameId, box: HTMLElement) {
  const def = MP_GAMES[game]
  box.innerHTML = `<h4>This Week</h4><ol><li>Loading…</li></ol>`
  const btn = el('button', 'btn tiny ghost', 'Full Leaderboard')
  btn.onclick = () => openBoard(game)
  box.querySelector('h4')!.append(btn)
  try {
    const r = await fetchBoard(game, 'week', 'wins', false)
    const list = box.querySelector('ol')!
    const top = r.rows.slice(0, 5)
    list.innerHTML = top.length
      ? top.map((row, i) => `<li class="${row.you ? 'you' : ''}"><span>${i + 1}</span><b>${esc(row.name)}${row.you ? ' (you)' : ''}</b><span>${row.wins} ${row.wins === 1 ? 'win' : 'wins'}</span></li>`).join('')
      : `<li>No wins yet this week. ${esc(def.short)} is wide open.</li>`
    if (r.me?.rank && !top.some((x) => x.you)) list.insertAdjacentHTML('beforeend', `<li class="you"><span>${r.me.rank}</span><b>You</b><span>${r.me.wins} ${r.me.wins === 1 ? 'win' : 'wins'}</span></li>`)
  } catch {
    box.querySelector('ol')!.innerHTML = '<li>Couldn’t load this week’s board.</li>'
  }
}
