import './newspaper.css'
import { save, persist } from '../state'
import { el } from '../engine/stage'
import { openOverlay, closeOverlay, closeButton } from '../engine/ui'
import { api } from '../game'
import { editionFor, todayNyc, shiftDay, shortDate, daysBetween, FIRST_DAY, PRICE, type Edition, type Story, type Moment } from '../data/news'
import { BOARD_GAMES, BOARD, board, fmt } from '../social/leaderboard'
import { standings, localsPoints, TEAMS, type TeamId } from '../social/teams'
import { ROOMS } from '../data/rooms'
import { isHomeRoom } from '../data/homes'
import { link } from '../net/link'
import { rest } from '../net/server'
import { paper } from '../foley'

/**
 * The Club NYC Times. It opens on today's paper (New York's date); Previous Edition / Next Edition move one day back
 * or forward through the archive (never past today, never before No. 1). Each edition is the whole paper for that day,
 * one long sheet: front page, NYC Moments, Metro & Style, Sports, Opinion and the Classifieds.
 *
 * Stories come from data/news.ts (the same paper for everyone on a given day). Today's paper also prints live city
 * numbers: Neighborhood Wars standings, this week's top job scores, who's in the city, and places that just opened.
 * Those numbers are kept as a small "press run" in this browser, so a back issue shows the standings as they were.
 */

const esc = (t: string) => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
const num = (n: number) => n.toLocaleString('en-US')

// ---------- live data ----------
interface Standing {
  team: TeamId
  points: number
}
interface Leader {
  game: string
  name: string
  score: number
  /** your rank this week (0 = not played) */
  rank: number
  you?: boolean
}
interface Press {
  standings: Standing[]
  leaders: Leader[]
  /** online only */
  city?: { online: number; newYorkers: number; newcomers: string[] }
}

/** a few weeks of "as printed" numbers, so back issues show what the city looked like that day */
const PRESS_KEY = 'club-nyc:news-press'
function pressRun(): Record<string, Press> {
  try {
    return JSON.parse(localStorage.getItem(PRESS_KEY) ?? '{}') as Record<string, Press>
  } catch {
    return {}
  }
}
function keepPress(day: string, p: Press) {
  try {
    const all = pressRun()
    all[day] = { standings: p.standings, leaders: p.leaders }
    const keep = Object.keys(all).sort().slice(-45)
    localStorage.setItem(PRESS_KEY, JSON.stringify(Object.fromEntries(keep.map((d) => [d, all[d]]))))
  } catch {
    /* private window or full storage: back issues just won't have numbers */
  }
}

/** the city as of right now: the server's real numbers when signed in, the local city otherwise */
async function livePress(): Promise<Press> {
  const offline = (): Press => ({
    standings: standings().map((s) => ({ team: s.team.id, points: s.points })),
    leaders: BOARD_GAMES.map((g) => {
      const b = board(g.id)
      const you = b.findIndex((r) => r.you)
      return { game: g.id, name: b[0] ? (b[0].you ? save.name || 'You' : b[0].name) : '', score: b[0]?.score ?? 0, rank: you + 1, you: !!b[0]?.you }
    }),
  })
  if (!link.account) return offline()
  type Teams = { teams: { team: string; points: number }[]; npcBaseline: boolean }
  type Highlights = { newcomers: { name: string }[]; leaders: { game: string; name: string; score: number }[] }
  type Stats = { newYorkers: number; online: number }
  type Board = { rows: { name: string; score: number; you?: boolean }[]; me: { rank: number } }
  const [teams, highlights, stats, ...boards] = await Promise.allSettled([
    rest<Teams>('/teams', { timeout: 5000 }),
    rest<Highlights>('/highlights', { timeout: 5000 }),
    rest<Stats>('/stats', { timeout: 5000 }),
    ...BOARD_GAMES.map((g) => rest<Board>(`/leaderboard/${g.id}`, { timeout: 5000 })),
  ])
  if (teams.status !== 'fulfilled') return offline()
  const t = teams.value
  const press: Press = {
    standings: t.teams
      .filter((x) => TEAMS[x.team as TeamId])
      .map((x) => ({ team: x.team as TeamId, points: x.points + (t.npcBaseline ? localsPoints(x.team as TeamId) : 0) }))
      .sort((a, b) => b.points - a.points),
    leaders: BOARD_GAMES.map((g, i) => {
      const b = boards[i]
      const top = b.status === 'fulfilled' ? b.value.rows[0] : undefined
      const hl = highlights.status === 'fulfilled' ? highlights.value.leaders.find((l) => l.game === g.id) : undefined
      return {
        game: g.id,
        name: top?.name ?? hl?.name ?? '',
        score: top?.score ?? hl?.score ?? 0,
        rank: b.status === 'fulfilled' ? b.value.me.rank : 0,
        you: !!top?.you,
      }
    }),
  }
  if (stats.status === 'fulfilled')
    press.city = {
      online: stats.value.online,
      newYorkers: stats.value.newYorkers,
      newcomers: highlights.status === 'fulfilled' ? highlights.value.newcomers.slice(0, 4).map((n) => n.name) : [],
    }
  return press
}

// ---------- new places in the city ----------
/** the places that were there when the paper started printing; anything else is news */
const ORIGINAL = new Set(['times-square', 'broadway', 'iloveny', 'rockefeller', 'fifth-ave', 'toy-palace', 'maison-malle', 'central-park', 'the-met', 'empire-deck', 'grand-central', 'subway', 'soho', 'thread', 'sneaker-vault', 'coffee', 'chinatown', 'pizza', 'brooklyn-bridge', 'battery-park', 'liberty-island', 'high-line', 'chelsea-market', 'parade'])
const SEEN_KEY = 'club-nyc:news-places'
/** when this browser first saw each new place (that's the day it "opened" in your paper) */
function openings(today: string): { id: string; day: string }[] {
  let seen: Record<string, string> = {}
  try {
    seen = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as Record<string, string>
  } catch {
    /* storage unavailable: treat everything new as opening today */
  }
  let changed = false
  const out: { id: string; day: string }[] = []
  for (const id of Object.keys(ROOMS)) {
    if (ORIGINAL.has(id) || isHomeRoom(id)) continue
    if (!seen[id]) {
      seen[id] = today
      changed = true
    }
    out.push({ id, day: seen[id] })
  }
  if (changed)
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(seen))
    } catch {
      /* fine */
    }
  return out
}

// ---------- the paper ----------
const fig = (s: Story, cls = '') =>
  s.img ? `<figure class="np-fig ${cls}"><img src="${s.img}" alt="" draggable="false">${s.caption ? `<figcaption>${s.caption}</figcaption>` : ''}</figure>` : ''

const article = (s: Story, cls = '') =>
  `<article class="np-story ${cls}"><div class="np-kicker">${s.kicker}</div><h3>${s.headline}</h3>${s.deck ? `<p class="np-deck">${s.deck}</p>` : ''}${fig(s)}${s.body.map((p) => `<p>${p}</p>`).join('')}</article>`

function momentStory(m: Moment, onThisDay: boolean) {
  const kicker = onThisDay ? `On This Day · ${m.when.slice(-4)}` : `${m.kicker} · ${m.when}`
  return `<article class="np-story${onThisDay ? ' otd' : ''}"><div class="np-kicker">${kicker}</div><h3>${m.headline}</h3>${m.deck ? `<p class="np-deck">${m.deck}</p>` : ''}${fig(m)}${m.body.map((p) => `<p>${p}</p>`).join('')}</article>`
}

function frontPage(ed: Edition, isToday: boolean) {
  const lead = ed.lead
  const banner = ed.ear === 'COMMEMORATIVE' || ed.ear === 'FIRST EDITION'
  const inside: [string, string, string][] = [
    ['moments', 'A2', ed.onThisDay ? `On This Day: ${ed.moments[0].headline}` : `NYC Moments: ${ed.moments[0].headline}`],
    ['metro', 'B1', `Metro &amp; Style: ${ed.metro[0].headline}`],
    ['sports', 'C1', isToday ? 'Sports: the Neighborhood Wars standings' : `Sports: ${ed.sports.headline}`],
    ['opinion', 'D1', 'Opinion: Ask the Bodega Cat'],
    ['classifieds', 'D2', 'Classifieds'],
  ]
  return `
    <header class="np-head">
      <div class="np-ears">
        ${isToday ? '<div class="np-ear">“All the News<br>That’s Fit to Fold”</div>' : `<div class="np-ear np-stamp">Back Issue<small>${ed.short}</small></div>`}
        <div class="np-ear right"><b>${ed.ear}</b><small>${ed.weather.short}</small></div>
      </div>
      <div class="np-mast">The Club NYC Times</div>
      <div class="np-dateline"><span>${ed.volume} · No. ${ed.no}</span><span class="np-date">${ed.date}</span><span>${PRICE}</span></div>
    </header>
    <div class="np-front">
      <article class="np-lead">
        <div class="np-kicker">${lead.kicker}</div>
        <h2 class="${banner ? 'np-banner' : ''}">${lead.headline}</h2>
        ${lead.deck ? `<p class="np-deck">${lead.deck}</p>` : ''}
        ${fig(lead, 'lead')}
        <div class="np-cols">${lead.body.map((p, i) => `<p${i === 0 ? ' class="dropcap"' : ''}>${p}</p>`).join('')}</div>
        <nav class="np-inside" aria-label="Inside this edition"><b>Inside</b><div>${inside
          .map(([id, page, text]) => `<button class="np-jump" data-jump="${id}"><i>${page}</i><span>${text}</span></button>`)
          .join('')}</div></nav>
      </article>
      <aside class="np-rail">
        ${isToday ? '<div class="np-live" data-live="city"></div>' : ''}
        ${article(ed.rail, 'small')}
        <div class="np-box"><b>Weather</b><p>${ed.weather.long}</p></div>
        <div class="np-box np-overheard"><b>Overheard</b><p>${ed.overheard.q}</p><small>${ed.overheard.where}</small></div>
      </aside>
    </div>`
}

function moments(ed: Edition) {
  return `
    <section class="np-sec" data-sec="moments">
      <div class="np-section">NYC Moments · The stories New Yorkers still bring up at brunch</div>
      <div class="np-grid3 moments">${ed.moments.map((m, i) => momentStory(m, i === 0 && ed.onThisDay)).join('')}</div>
    </section>`
}

function metro(ed: Edition, opened: { id: string; day: string }[]) {
  // pictures first in each row, so the rows line up
  const s = [...ed.metro].sort((a, b) => (b.img ? 1 : 0) - (a.img ? 1 : 0))
  const fresh = opened.filter((o) => daysBetween(o.day, ed.day) >= 0 && daysBetween(o.day, ed.day) < 14 && ROOMS[o.id])
  const nowOpen = fresh.length
    ? `<div class="np-box np-open"><b>Now Open</b>${fresh
        .map((o) => `<p><span><b>${esc(ROOMS[o.id].name)}</b> · ${esc(ROOMS[o.id].area)}</span><button class="btn tiny go" data-go="${o.id}">Take Me There</button></p>`)
        .join('')}</div>`
    : ''
  return `
    <section class="np-sec" data-sec="metro">
      <div class="np-section">Metro &amp; Style</div>
      ${nowOpen}
      <div class="np-grid3">${s.slice(0, 3).map((x) => article(x)).join('')}</div>
      <div class="np-grid2">${s.slice(3, 5).map((x) => article(x)).join('')}</div>
    </section>`
}

function sports(ed: Edition, isToday: boolean, archived: Press | undefined) {
  const story = ed.sports
  // the day's sports story runs across the page under the numbers
  const wide = `<article class="np-story np-wide"><div class="np-kicker">${story.kicker}</div><h3>${story.headline}</h3><div class="np-cols">${story.body.map((p) => `<p>${p}</p>`).join('')}</div></article>`
  if (!isToday && !archived)
    return `
    <section class="np-sec" data-sec="sports">
      <div class="np-section">Sports · Neighborhood Wars</div>
      <div class="np-grid2 wide-left">
        ${article(story)}
        <div class="np-box np-archive"><b>Standings</b><p>The Neighborhood Wars standings and this week’s box scores print in today’s paper.</p><button class="btn tiny go" data-today>Read Today’s Paper</button></div>
      </div>
    </section>`
  return `
    <section class="np-sec" data-sec="sports">
      <div class="np-section">Sports · Neighborhood Wars</div>
      <div class="np-grid2 wide-left">
        <div class="np-live" data-live="standings"></div>
        <div class="np-live" data-live="scores"></div>
      </div>
      ${wide}
    </section>`
}

function opinion(ed: Edition) {
  return `
    <section class="np-sec" data-sec="opinion">
      <div class="np-section">Opinion · Classifieds</div>
      <div class="np-grid2 wide-left">
        <div class="np-advice">
          <h3>Ask the Bodega Cat</h3>
          <div class="np-byline">The city’s most respected (and only) feline columnist</div>
          ${ed.advice.map((l) => `<p class="q">${l.q}</p><p class="a">${l.a}</p>`).join('')}
        </div>
        <div>
          <div class="np-secrets"><h3>Secrets of the City</h3><ol>${ed.secrets.map((s) => `<li>${s}</li>`).join('')}</ol></div>
          <div class="np-classifieds" data-sec="classifieds"><h3>Classifieds</h3>${ed.classifieds.map(([k, v]) => `<p><b>${k}</b> ${v}</p>`).join('')}</div>
        </div>
      </div>
    </section>
    <div class="np-folio">${ed.volume} · No. ${ed.no} · The Club NYC Times · ${ed.ear === 'LATE CITY EDITION' ? 'Late City Edition' : ed.ear === 'FIRST EDITION' ? 'First Edition' : 'Commemorative Edition'}</div>`
}

function standingsHtml(p: Press, isToday: boolean) {
  const s = p.standings
  if (!s.length) return ''
  const lead = TEAMS[s[0].team]
  const second = s[1] ? TEAMS[s[1].team] : null
  const gap = s[1] ? s[0].points - s[1].points : 0
  const mine = save.team as TeamId
  return `<article class="np-story"><div class="np-kicker">${isToday ? 'This Week' : 'At Press Time'}</div>
    <h3>${lead.emoji} ${lead.name} Lead the Neighborhood Wars</h3>
    <p>With ${num(s[0].points)} points, ${lead.name} are out in front${second ? `. ${second.name} trail by ${num(gap)}` : ''}. Every coin earned at a job counts for your neighborhood, and the standings reset Monday.</p>
    <table class="np-table"><thead><tr><th>Team</th><th>Points</th></tr></thead><tbody>${s
      .map((r) => `<tr${r.team === mine ? ' class="you"' : ''}><td>${TEAMS[r.team].emoji} ${TEAMS[r.team].name}${r.team === mine ? ' <i>(yours)</i>' : ''}</td><td>${num(r.points)}</td></tr>`)
      .join('')}</tbody></table></article>`
}

function scoresHtml(p: Press) {
  const rows = p.leaders
    .filter((l) => BOARD[l.game])
    .map((l) => {
      const g = BOARD[l.game]
      const who = l.name ? (l.you ? 'YOU!' : esc(l.name)) : '<i>Wide open</i>'
      return `<tr><td>${g.emoji} ${g.title}</td><td><b>${who}</b></td><td>${l.name ? fmt(l.game, l.score) : ''}</td><td>${l.rank ? `#${l.rank}` : '<i>Not yet</i>'}</td></tr>`
    })
    .join('')
  return `<article class="np-story"><div class="np-kicker">Box Scores</div><h3>Top of the Week</h3>
    <table class="np-table"><thead><tr><th>Job</th><th>Leader</th><th>Score</th><th>You</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="np-small">Challenge a friend from Friends &amp; Leaderboards to climb the ranks.</p></article>`
}

function cityHtml(p: Press) {
  const c = p.city
  if (!c) return ''
  const names = c.newcomers.map((n) => `<b>${esc(n)}</b>`)
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]
  return `<div class="np-box np-city"><b>The City Today</b>
    <p><span class="np-big">${num(c.online)}</span> New ${c.online === 1 ? 'Yorker' : 'Yorkers'} out in the city right now, ${num(c.newYorkers)} in all.</p>
    ${list ? `<p>Newest neighbors: ${list}. Say hi.</p>` : ''}</div>`
}

export function openNewspaper() {
  const today = todayNyc()
  let day = today
  const opened = openings(today)
  const box = el('div', 'newspaper')
  const sheet = el('div', 'np-sheet')
  const scroll = el('div', 'np-scroll')
  sheet.append(scroll)
  const nav = el('div', 'np-nav')
  const prev = el('button', 'btn small np-prev', '‹ Previous Edition')
  const now = el('button', 'btn small np-today', 'Today’s Paper')
  const next = el('button', 'btn small np-next', 'Next Edition ›')
  nav.append(prev, now, next)
  let live: Press | null = null
  let gen = 0

  /** the bottom of the page fades out only while there's more to read below */
  const fade = () => scroll.classList.toggle('more', scroll.scrollTop + scroll.clientHeight < scroll.scrollHeight - 4)
  scroll.addEventListener('scroll', fade, { passive: true })

  const fill = (isToday: boolean, p: Press | undefined) => {
    for (const slot of scroll.querySelectorAll<HTMLElement>('[data-live]')) {
      const kind = slot.dataset.live
      slot.innerHTML = !p ? '' : kind === 'standings' ? standingsHtml(p, isToday) : kind === 'scores' ? scoresHtml(p) : kind === 'city' ? cityHtml(p) : ''
    }
    fade()
  }

  const render = (dir = 0) => {
    const my = ++gen
    const ed = editionFor(day)
    const isToday = day === today
    const archived = isToday ? undefined : pressRun()[day]
    scroll.innerHTML = frontPage(ed, isToday) + moments(ed) + metro(ed, opened) + sports(ed, isToday, archived) + opinion(ed)
    scroll.scrollTop = 0
    sheet.classList.remove('turn-l', 'turn-r')
    if (dir) {
      void sheet.offsetWidth
      sheet.classList.add(dir > 0 ? 'turn-r' : 'turn-l')
    }
    // the controls: never past today, never before No. 1
    prev.disabled = day <= FIRST_DAY
    next.disabled = day >= today
    prev.title = prev.disabled ? 'This is the very first edition' : `The ${shortDate(shiftDay(day, -1))} paper (←)`
    next.title = next.disabled ? 'Tomorrow’s paper isn’t printed yet' : `The ${shortDate(shiftDay(day, 1))} paper (→)`
    now.classList.toggle('on', isToday)
    now.classList.toggle('go', !isToday)
    now.disabled = isToday
    now.title = isToday ? 'You’re reading today’s paper' : 'Back to today’s paper (T)'
    if (isToday) now.setAttribute('aria-current', 'date')
    else now.removeAttribute('aria-current')
    box.dataset.day = day
    if (isToday) {
      if (live) fill(true, live)
      else
        void livePress().then((p) => {
          live = p
          keepPress(today, p)
          if (my === gen) fill(true, p)
        })
    } else fill(false, archived)
    // pictures change the page height as they arrive
    for (const img of scroll.querySelectorAll('img')) img.addEventListener('load', fade, { once: true })
    requestAnimationFrame(fade)
  }

  const go = (to: string, dir: number) => {
    const target = to > today ? today : to < FIRST_DAY ? FIRST_DAY : to
    if (target === day) return
    day = target
    paper.flip()
    render(dir)
  }
  prev.onclick = () => go(shiftDay(day, -1), -1)
  next.onclick = () => go(shiftDay(day, 1), 1)
  now.onclick = () => go(today, 1)

  scroll.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    const jump = t.closest<HTMLElement>('[data-jump]')
    if (jump) {
      const sec = scroll.querySelector<HTMLElement>(`[data-sec="${jump.dataset.jump}"]`)
      if (sec) scroll.scrollTo({ top: sec.offsetTop - 10, behavior: 'smooth' })
      return
    }
    const where = t.closest<HTMLElement>('[data-go]')?.dataset.go
    if (where && ROOMS[where]) {
      closeOverlay()
      api.goto(where)
      return
    }
    if (t.closest('[data-today]')) go(today, 1)
  })

  const keys = (e: KeyboardEvent) => {
    if (!box.isConnected) return window.removeEventListener('keydown', keys, true)
    if (e.key === 'ArrowLeft' && !prev.disabled) prev.click()
    else if (e.key === 'ArrowRight' && !next.disabled) next.click()
    else if ((e.key === 't' || e.key === 'T') && !now.disabled) now.click()
    else return
    e.preventDefault()
    e.stopPropagation()
  }
  window.addEventListener('keydown', keys, true)

  render()
  box.append(sheet, nav, closeButton())
  paper.open()
  openOverlay(box, { cls: 'dark', onClose: () => window.removeEventListener('keydown', keys, true) })
  requestAnimationFrame(fade)
  if (!save.seenNews) {
    save.seenNews = 1
    persist()
  }
  api.stamp('newshound')
}
