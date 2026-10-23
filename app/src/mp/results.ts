/**
 * After every match: where everyone placed (Add Friend on the people you just played), what it was worth to you
 * (XP toward your level, prize coins, a new best, your rank this week), this week's top 5, and clear next steps:
 * Play Again, Invite a Friend, Leaderboard, Back to the City.
 */
import { el } from '../engine/stage'
import { headPortrait } from '../avatar/render'
import { confetti } from '../engine/ui'
import { link } from '../net/link'
import { save } from '../state'
import { levelOf } from '../data/levels'
import type { Look } from '../avatar/look'
import { MP_GAMES, MP_TEAMS, fmtBest, fmtTime, ordinal } from './shared/games'
import type { ResultsWire } from './shared/protocol'
import { esc } from './store'
import { friendButton } from './social'
import { miniBoard, rankCell } from './board'
import { msfx } from './sound'

export interface ResultsActions {
  again(): void
  invite(): void
  board(): void
  back(): void
  brag(text: string): void
}

const scoreText = (g: ResultsWire['g'], score: number, dnf?: boolean | 1) => {
  if (g === 'sled') return dnf || !score ? '<small>Didn’t finish</small>' : fmtTime(score)
  if (g === 'runner') return `${score.toLocaleString('en-US')} <small>m</small>`
  return score ? `${score} <small>${score === 1 ? 'win in a row' : 'in a row'}</small>` : ''
}

export function renderResults(box: HTMLElement, r: ResultsWire, act: ResultsActions) {
  const def = MP_GAMES[r.g]
  const meId = link.me
  const mine = r.rows.find((x) => x.i === meId)
  const you = r.you
  box.innerHTML = ''
  const view = el('div', 'mp-results')
  const art = el('div', 'mp-art')
  art.style.backgroundImage = `url(${def.art})`
  box.append(art, view)

  // ---------- the headline ----------
  let title = 'Results'
  let line = `${def.title} · ${r.humans} ${r.humans === 1 ? 'New Yorker' : 'New Yorkers'}${r.rows.length > r.humans ? ` and ${r.rows.length - r.humans} city ${r.rows.length - r.humans === 1 ? 'local' : 'locals'}` : ''}`
  let medal = ''
  const won = !!mine?.won
  if (r.teams) {
    const t = MP_TEAMS[r.teams.win]
    title = mine?.tm ? (mine.tm === r.teams.win ? `${t.name} Wins!` : `${t.name} Takes It`) : `${t.name} Wins!`
    medal = mine?.tm === r.teams.win ? 'trophy' : ''
  } else if (mine) {
    if (r.g === 'carbs') title = won ? 'You Win the Table!' : 'So Close'
    else if (mine.dnf && r.g === 'sled') title = 'Out of Time'
    else title = mine.place === 1 ? '1st Place!' : `${ordinal(mine.place)} Place`
    medal = mine.place <= 3 && !mine.dnf ? ['medal-gold', 'medal-silver', 'medal-bronze'][mine.place - 1] : ''
  } else title = `${r.rows[0]?.n ?? 'Someone'} Wins`
  const head = el('div', 'mp-card mp-res-head', `${medal ? `<img class="mp-medal" src="/art/icons/e/${medal}.png" alt="">` : ''}<div><h2>${esc(title)}</h2><p>${esc(line)} · ${fmtTime(r.dur)}</p></div>`)
  if (r.teams) {
    head.append(
      el(
        'div',
        'mp-team-score',
        `<span class="mp-pill up" style="font-size:var(--fs-md);min-height:28px">${MP_TEAMS.up.name} ${r.teams.up}</span><span class="mp-pill down" style="font-size:var(--fs-md);min-height:28px">${MP_TEAMS.down.name} ${r.teams.down}</span>`,
      ),
    )
  }
  view.append(head)

  // ---------- standings ----------
  const list = el('div', 'mp-card mp-standings')
  const rerender = () => renderResults(box, r, act)
  r.rows.forEach((row) => {
    const me = row.i === meId
    const line = el('div', 'mp-srow' + (me ? ' you' : ''))
    const team = row.tm ? `<span class="mp-pill ${row.tm}">${MP_TEAMS[row.tm].name}</span>` : ''
    line.innerHTML = `<span class="rk">${row.dnf && r.g === 'sled' ? '–' : rankCell(row.place - 1)}</span><span class="mp-face">${headPortrait(row.l as Look)}</span><span class="mp-who"><b>${esc(row.n)}${me ? ' (you)' : ''}</b><small>${row.bot ? '<span class="mp-pill local">City local</span>' : ''}${team}${row.stat ? `<span>${esc(row.stat)}</span>` : ''}</small></span><span class="sc">${scoreText(r.g, row.score, row.dnf)}</span>`
    if (!row.bot) {
      const fb = friendButton(row.i, row.n, rerender)
      if (fb) line.append(fb)
    }
    list.append(line)
  })
  view.append(list)

  // ---------- your rewards, this week ----------
  const side = el('div', 'mp-res-side')
  const rew = el('div', 'mp-card mp-rewards')
  if (you && !you.void) {
    const lvl = levelOf(save.xp ?? 0)
    rew.innerHTML = `<div class="mp-gain"><div class="xp"><b>+${you.xp}</b><small>XP</small></div><div class="coins"><b><img src="/art/icons/coin.png" alt="">${you.coins}</b><small>coins</small></div></div>
      <div class="mp-lvl"><span><b>Level ${lvl.level}</b> · ${esc(lvl.title)}</span><span class="bar"><i style="width:0%"></i></span><span>${Math.max(0, lvl.next - lvl.xp)} XP to ${esc(lvl.nextTitle)}</span></div>
      ${you.best ? `<span class="mp-note best">${you.best === 'all' ? 'New personal best!' : 'Best this week!'} ${fmtBest(r.g, mine?.score ?? 0)}</span>` : ''}
      <div class="mp-note">${you.weekRank ? `<b>#${you.weekRank}</b> this week in ${esc(def.short)} · ${you.weekWins} ${you.weekWins === 1 ? 'win' : 'wins'}` : ''}${r.humans < 2 ? '<br>Wins count on the board when you beat a real New Yorker.' : ''}${you.capped ? '<br>That’s all the game prizes for today. Your score still counts.' : ''}</div>`
    requestAnimationFrame(() => {
      const bar = rew.querySelector<HTMLElement>('.mp-lvl .bar i')
      if (bar) bar.style.width = `${Math.round(lvl.progress * 100)}%`
    })
  } else if (you?.void) {
    rew.innerHTML = `<div class="mp-note">${mine?.dnf && !r.rows.some((x) => x.i === meId && !x.dnf) ? 'You left before the end, so this one doesn’t count. No harm done.' : 'This one was too quick to count. Next round pays.'}</div>`
  } else rew.innerHTML = '<div class="mp-note">You watched this one. Grab a seat for the next round!</div>'
  side.append(rew)
  const mini = el('div', 'mp-card mp-mini')
  side.append(mini)
  void miniBoard(r.g, mini)
  view.append(side)

  // ---------- what next ----------
  const btns = el('div', 'mp-res-btns')
  const back = el('button', 'btn ghost back', 'Back to the City<kbd>Esc</kbd>')
  back.onclick = () => act.back()
  const brag = el('button', 'btn small ghost', '📣 Copy Result')
  brag.onclick = () => {
    const what = r.g === 'sled' ? (mine && !mine.dnf ? `${fmtTime(mine.score)}` : '') : r.g === 'runner' ? `${mine?.score ?? 0} m` : ''
    act.brag(mine ? `I came ${ordinal(mine.place)} in ${def.title}${what ? ` (${what})` : ''} in Club NYC.` : `Watching ${def.title} in Club NYC.`)
  }
  const inv = el('button', 'btn small ghost', '💌 Invite a Friend')
  inv.onclick = () => act.invite()
  const lb = el('button', 'btn small ghost', '🏆 Leaderboard')
  lb.onclick = () => act.board()
  const again = el('button', 'btn go', 'Play Again<kbd>Enter</kbd>')
  again.onclick = () => act.again()
  btns.append(back, brag, inv, lb, again)
  view.append(btns)

  if (mine && !you?.void) {
    if (won || mine.place === 1) {
      msfx.win()
      confetti(70)
    } else msfx.finish()
  }
}
