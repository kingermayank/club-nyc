import { sfx } from '../audio'
import { save, persist } from '../state'
import { el } from '../engine/stage'
import { openOverlay, closeButton } from '../engine/ui'
import { api } from '../game'
import { EDITION, FRONT, MOMENTS, STORIES, ADVICE, SECRETS, CLASSIFIEDS, type Story } from '../data/news'
import { BOARD_GAMES, board, fmt } from '../social/leaderboard'
import { standings } from '../social/teams'

/** The sports page is written fresh from this week's leaderboards. */
function sportsPage() {
  const s = standings()
  const leader = s[0]
  const rows = BOARD_GAMES.map((g) => {
    const b = board(g.id)
    const top = b[0]
    const you = b.findIndex((r) => r.you)
    return `<tr><td>${g.emoji} ${g.title}</td><td><b>${top ? (top.you ? 'YOU!' : top.name) : 'Wide open'}</b></td><td>${top ? fmt(g.id, top.score) : ''}</td><td>${you >= 0 ? `#${you + 1}` : '<i>Not yet</i>'}</td></tr>`
  }).join('')
  return `<div class="np-section">Sports · Neighborhood Wars</div>
    <div class="np-grid2 wide-left">
      <article class="np-story"><div class="np-kicker">THIS WEEK</div><h3>${leader.team.emoji} ${leader.team.name} Lead the Neighborhood Wars</h3>
        <p>With ${leader.points.toLocaleString('en-US')} points, ${leader.team.name} are out in front. ${s[1].team.name} trail by ${(leader.points - s[1].points).toLocaleString('en-US')}. Every coin earned at a job counts for your neighborhood, and the standings reset Monday.</p>
        <table class="np-table"><thead><tr><th>Team</th><th>Points</th></tr></thead><tbody>${s.map((r) => `<tr><td>${r.team.emoji} ${r.team.name}</td><td>${r.points.toLocaleString('en-US')}</td></tr>`).join('')}</tbody></table>
      </article>
      <article class="np-story"><div class="np-kicker">BOX SCORES</div><h3>Top of the Week</h3>
        <table class="np-table"><thead><tr><th>Game</th><th>Leader</th><th>Score</th><th>You</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="np-small">Challenge a friend from the Community board to climb the ranks.</p>
      </article>
    </div>`
}

const fig = (s: Story, cls = '') =>
  s.img ? `<figure class="np-fig ${cls}"><img src="${s.img}" alt=""><figcaption>${s.caption ?? ''}</figcaption></figure>` : ''

const article = (s: Story, cls = '') =>
  `<article class="np-story ${cls}"><div class="np-kicker">${s.kicker}</div><h3>${s.headline}</h3>${s.deck ? `<p class="np-deck">${s.deck}</p>` : ''}${fig(s)}${s.body.map((p) => `<p>${p}</p>`).join('')}</article>`

function pages(): string[] {
  const front = `
    <header class="np-head">
      <div class="np-ears"><div class="np-ear">“All the News<br>That’s Fit to Fold”</div><div class="np-ear right">COMMEMORATIVE<br><small>${EDITION.weather.split('.')[0]}.</small></div></div>
      <div class="np-mast">The Club NYC Times</div>
      <div class="np-dateline"><span>${EDITION.volume} · ${EDITION.number}</span><span>${EDITION.date}</span><span>${EDITION.price}</span></div>
    </header>
    <div class="np-front">
      <article class="np-lead">
        <div class="np-kicker">${FRONT.kicker}</div>
        <h2 class="np-banner">${FRONT.headline}</h2>
        <p class="np-deck">${FRONT.deck}</p>
        ${fig(FRONT, 'lead')}
        <div class="np-cols">${FRONT.body.map((p, i) => `<p${i === 0 ? ' class="dropcap"' : ''}>${p}</p>`).join('')}</div>
      </article>
      <aside class="np-rail">
        ${article(STORIES[0], 'small')}
        <div class="np-box"><b>WEATHER</b><p>${EDITION.weather}</p></div>
        <div class="np-box np-inside"><b>INSIDE · NYC MOMENTS</b>${MOMENTS.map((m) => `<p><i>${m.when}</i><br>${m.headline}</p>`).join('')}<p class="np-small">Turn the page →</p></div>
      </aside>
    </div>`
  const moments = `
    <div class="np-section">NYC Moments · The stories New Yorkers still bring up at brunch</div>
    <div class="np-grid3 moments">${MOMENTS.map(
      (m) => `<article class="np-story"><div class="np-kicker">${m.kicker} · ${m.when.toUpperCase()}</div><h3>${m.headline}</h3>${m.deck ? `<p class="np-deck">${m.deck}</p>` : ''}${fig(m)}${m.body.map((p) => `<p>${p}</p>`).join('')}</article>`,
    ).join('')}</div>`
  const metro = `
    <div class="np-section">Metro &amp; Style</div>
    <div class="np-grid3">${STORIES.slice(1, 4).map((s) => article(s)).join('')}</div>
    <div class="np-grid2">${STORIES.slice(4, 6).map((s) => article(s)).join('')}</div>
    <div class="np-grid2">${STORIES.slice(6, 8).map((s) => article(s)).join('')}</div>`
  const opinion = `
    <div class="np-section">Opinion · Classifieds</div>
    <div class="np-grid2 wide-left">
      <div class="np-advice">
        <h3>${ADVICE.title}</h3>
        <div class="np-byline">The city’s most respected (and only) feline columnist</div>
        ${ADVICE.letters.map((l) => `<p class="q">${l.q}</p><p class="a">${l.a}</p>`).join('')}
      </div>
      <div>
        <div class="np-secrets"><h3>Secrets of the City</h3><ol>${SECRETS.map((s) => `<li>${s}</li>`).join('')}</ol></div>
        <div class="np-classifieds"><h3>Classifieds</h3>${CLASSIFIEDS.map(([k, v]) => `<p><b>${k}</b> ${v}</p>`).join('')}</div>
      </div>
    </div>`
  return [front, moments, metro, sportsPage(), opinion]
}

export function openNewspaper() {
  const all = pages()
  let page = 0
  const paper = el('div', 'newspaper')
  const sheet = el('div', 'np-sheet')
  const nav = el('div', 'np-nav')
  const render = (dir = 0) => {
    sheet.innerHTML = all[page] + `<div class="np-folio">${['A1', 'A2', 'B1', 'C1', 'D1'][page]} · The Club NYC Times</div>`
    sheet.classList.remove('turn-l', 'turn-r')
    if (dir) {
      void sheet.offsetWidth
      sheet.classList.add(dir > 0 ? 'turn-r' : 'turn-l')
    }
    sheet.scrollTop = 0
    nav.innerHTML = ''
    const prev = el('button', 'np-btn', '‹ Prev')
    const next = el('button', 'np-btn', 'Next ›')
    prev.disabled = page === 0
    next.disabled = page === all.length - 1
    prev.onclick = () => {
      sfx.whoosh()
      page--
      render(-1)
    }
    next.onclick = () => {
      sfx.whoosh()
      page++
      render(1)
    }
    nav.append(prev, el('span', '', `Page ${page + 1} of ${all.length}`), next)
  }
  render()
  paper.append(sheet, nav, closeButton())
  sfx.whoosh()
  openOverlay(paper, { cls: 'dark' })
  if (!save.seenNews) {
    save.seenNews = 1
    persist()
  }
  api.stamp('newshound')
}
