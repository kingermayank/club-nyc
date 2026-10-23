import { sfx } from '../audio'
import { save, persist } from '../state'
import { el } from '../engine/stage'
import { openOverlay, closeOverlay, closeButton, toast, notify, noticesWaiting } from '../engine/ui'
import { world, goto, ensureResident, refreshTag } from '../engine/world'
import { headPortrait } from '../avatar/render'
import { ROOMS } from '../data/rooms'
import { RESIDENT, RESIDENTS, locationOf, type Resident } from './residents'
import { friends, isFriend, requestFriend, ACCEPT_LINES, LATER_LINES, unfriend } from './friends'
import { BOARD_GAMES, BOARD, board, fmt, challenge, resolveChallenges, myWeekly } from './leaderboard'
import { TEAMS, TEAM_IDS, standings, myContribution, myTeam, checkWeeklyResult, localsPoints, type TeamId } from './teams'
import { msToReset, prevWeekId } from './rng'
import { api } from '../game'
import { link } from '../net/link'
import { rest, type PublicUser } from '../net/server'
import { inviteLink } from '../net/invite'
import type { Look } from '../avatar/look'

type Tab = 'friends' | 'boards' | 'teams' | 'city' | 'games'
let lastTab: Tab = 'friends'
let lastGame = BOARD_GAMES[0].id
let friendsOnly = false
let allTime = false

const roomName = (id: string | null) => (id ? ROOMS[id]?.name ?? id : '')
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]

function resetIn() {
  const ms = msToReset()
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  return d ? `${d}d ${h}h` : `${h}h`
}

/** Go find a friend: travel to wherever they are and they'll come say hi. */
export function findFriend(r: Resident) {
  const loc = locationOf(r)
  if (!loc) return toast(`${r.name} is offline right now. Leave them a guestbook note!`, '💤')
  closeOverlay()
  if (world.room.id === loc) {
    const a = ensureResident(r.id)
    a?.say(`Hey ${save.name}! 👋`)
    return
  }
  toast(`Heading to ${roomName(loc)} to find ${r.name}…`, '🚕')
  goto(loc)
  setTimeout(() => {
    const a = ensureResident(r.id)
    if (!a) return
    a.emote('wave', 2)
    a.say(pick([`${save.name}! You found me 😄`, 'Hey!! Over here!', `Oh hi ${save.name}!`]))
  }, 1400)
}

export function addFriendFlow(r: Resident, onDone?: () => void) {
  const actor = world.npcs.find((a) => a.resident?.id === r.id)
  const res = requestFriend(r)
  if (res === 'accepted') {
    sfx.stamp()
    actor?.emote('cheer', 2)
    actor?.say(pick(ACCEPT_LINES))
    toast(`<b>${r.name}</b> is now your friend!`, '🤝')
    api.stamp('new-friend')
    if (save.friends.length >= 5) api.stamp('social-butterfly')
    if (actor) refreshTag(actor)
  } else if (res === 'later') {
    actor?.say(pick(LATER_LINES))
    toast(`${r.name} wants to hang out a bit first. Wave or dance with them!`, '😄')
  }
  onDone?.()
}

// ---------- the panel ----------
/** The leaderboards tab, opened on one game (the job lobby's "Full leaderboard"). */
export function openBoards(game: string) {
  if (BOARD[game]) lastGame = game
  openCommunity('boards')
}

export function openCommunity(tab: Tab = lastTab) {
  lastTab = tab
  const p = el('div', 'community')
  const head = el('div', 'cm-head', `<h2>Community</h2>`)
  const tabs = el('div', 'cm-tabs')
  const body = el('div', 'cm-body')
  const mk = (id: Tab, label: string) => {
    const b = el('button', 'cm-tab' + (lastTab === id ? ' on' : ''), label)
    b.onclick = () => {
      sfx.click()
      lastTab = id
      tabs.querySelectorAll('.cm-tab').forEach((x) => x.classList.remove('on'))
      b.classList.add('on')
      render()
    }
    tabs.append(b)
  }
  if (!link.account && lastTab === 'city') lastTab = 'friends'
  if (link.account) mk('city', '<b class="cm-live-dot"></b> City')
  mk('friends', 'Friends <i class="cm-fcount"></i>')
  // multiplayer mini-games (app/src/mp/hub.ts): Quick Match, Create Lobby, join with a code
  mk('games', 'Games')
  mk('boards', 'Leaderboards')
  mk('teams', 'Neighborhoods')
  const bell = el('button', 'cm-bell' + (save.notifyOff ? ' off' : ''), save.notifyOff ? '🔕' : '🔔')
  bell.title = 'City updates on/off'
  bell.onclick = () => {
    save.notifyOff = !save.notifyOff
    persist()
    bell.textContent = save.notifyOff ? '🔕' : '🔔'
    bell.classList.toggle('off', save.notifyOff)
    toast(save.notifyOff ? 'City updates muted' : 'City updates on', save.notifyOff ? '🔕' : '🔔')
  }
  head.append(tabs, bell)
  p.append(head, body, closeButton())
  let gen = 0
  const render = () => {
    const my = ++gen
    // async renderers bail out if you've switched tabs meanwhile
    const live = () => my === gen && p.isConnected
    body.innerHTML = ''
    if (lastTab === 'city') void renderCity(body, live)
    if (lastTab === 'friends') link.account ? void renderFriendsOnline(body, render, live) : renderFriends(body, render)
    if (lastTab === 'boards') link.account ? void renderBoardsOnline(body, render, live) : renderBoards(body, render)
    if (lastTab === 'teams') link.account ? void renderTeamsOnline(body, render, live) : renderTeams(body, render)
    if (lastTab === 'games')
      void import('../mp/hub').then((m) => {
        if (live()) void m.renderGamesTab(body, live)
      })
  }
  const count = () => {
    const c = tabs.querySelector('.cm-fcount')
    if (!c) return
    if (!link.account) return void (c.textContent = String(save.friends.length))
    void import('../net/multiplayer').then(({ mp }) => {
      c.textContent = String(mp.friends.size)
      c.classList.toggle('alert', mp.incoming.size > 0)
      if (mp.incoming.size) c.textContent = `${mp.friends.size} · ${mp.incoming.size} new`
    })
  }
  count()
  render()
  openOverlay(p)
  // live updates while the panel is open (friend requests, people arriving)
  if (link.account)
    void import('../net/multiplayer').then(({ onPeopleChange }) => {
      let t = 0
      const off = onPeopleChange(() => {
        clearTimeout(t)
        t = window.setTimeout(() => {
          if (!p.isConnected) return off()
          count()
          if (lastTab === 'friends') render()
        }, 250)
      })
    })
}

// ---------- online (real players) ----------
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const faceOf = (look: Look | null) => (look ? headPortrait(look) : '')
const teamLine = (team: string, extra = '') => {
  const t = TEAMS[team as TeamId]
  return t ? `<i style="background:${t.color}"></i>${t.name}${extra}` : extra.replace(/^ · /, '')
}

async function renderCity(body: HTMLElement, live: () => boolean) {
  body.append(el('div', 'cm-loading', 'Looking around the city…'))
  let r: { count: number; rooms: Record<string, { n: number; faces: { n: string; l: Look }[] }> }
  try {
    r = await rest('/city')
  } catch {
    if (live()) body.innerHTML = '<div class="cm-empty"><p>Can’t reach the city right now.</p></div>'
    return
  }
  if (!live()) return
  const { mp, goToFriend } = await import('../net/multiplayer')
  body.innerHTML = ''
  body.append(el('div', 'cm-city-head', `<b>${r.count}</b><span>${r.count === 1 ? 'New Yorker' : 'New Yorkers'} in the city right now</span>`))
  const online = [...mp.friends.values()].filter((f) => f.online)
  if (online.length) {
    body.append(el('h4', 'cm-sub', 'Friends Out and About'))
    for (const f of online) {
      const row = el('div', 'cm-row', `<span class="cm-face">${faceOf(f.look)}</span><span class="cm-who"><b>${esc(f.name)}</b><small>${teamLine(f.team)}</small></span><span class="cm-where on">📍 ${roomName(f.room) || 'Somewhere'}</span>`)
      const go = el('button', 'btn small', f.room === world.room.id ? 'Find' : 'Go')
      go.onclick = () => goToFriend(f.id)
      row.append(go)
      body.append(row)
    }
  }
  const rooms = Object.entries(r.rooms).sort((a, b) => b[1].n - a[1].n)
  body.append(el('h4', 'cm-sub', 'Where People Are Hanging Out'))
  if (!rooms.length || (rooms.length === 1 && r.count <= 1)) {
    const empty = el('div', 'cm-empty', `<div class="cm-empty-art">🌆</div><b>It’s just you (and the city locals) right now</b><p>Bring a friend! Send them the link and you’ll appear in the same Times Square.</p>`)
    const copy = el('button', 'btn go', '🔗 Copy Invite Link')
    copy.onclick = async () => {
      // your own /join link, so whoever uses it lands next to you (and counts as your invite)
      const url = save.name ? inviteLink(save.name) : location.origin
      try {
        await navigator.clipboard.writeText(url)
        toast('Invite link copied! Paste it to a friend.', '🔗')
      } catch {
        toast(url, '🔗')
      }
    }
    empty.append(copy)
    body.append(empty)
  }
  for (const [room, info] of rooms) {
    const def = ROOMS[room]
    if (!def) continue
    const here = room === world.room.id
    const row = el('div', 'cm-row cm-room' + (here ? ' here' : ''), `<span class="cm-faces">${info.faces.map((f) => `<span class="cm-face" title="${esc(f.n)}">${headPortrait(f.l)}</span>`).join('')}</span>
      <span class="cm-who"><b>${def.name}</b><small>${def.area}</small></span><span class="cm-count">${info.n} ${info.n === 1 ? 'person' : 'people'}</span>`)
    const go = el('button', 'btn small ' + (here ? 'ghost' : 'go'), here ? 'You’re here' : 'Go')
    go.disabled = here
    go.onclick = () => {
      closeOverlay()
      goto(room)
    }
    row.append(go)
    body.append(row)
  }
}

async function renderFriendsOnline(body: HTMLElement, rerender: () => void, live: () => boolean) {
  const { mp, acceptFriend, removeFriend, goToFriend, addFriend } = await import('../net/multiplayer')
  if (!live()) return
  // requests waiting for you
  if (mp.incoming.size) {
    body.append(el('h4', 'cm-sub', 'Friend Requests'))
    for (const u of mp.incoming.values()) {
      const row = el('div', 'cm-row request', `<span class="cm-face">${faceOf(u.look)}</span><span class="cm-who"><b>${esc(u.name)}</b><small>wants to be friends</small></span>`)
      const acts = el('span', 'cm-acts')
      const yes = el('button', 'btn small go', 'Accept')
      yes.onclick = () => void acceptFriend(u.id).then(rerender)
      const no = el('button', 'btn small ghost', 'Ignore')
      no.onclick = () => void removeFriend(u.id).then(rerender)
      acts.append(yes, no)
      row.append(acts)
      body.append(row)
    }
  }
  const list = [...mp.friends.values()].sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name))
  body.append(el('h4', 'cm-sub', `Friends · ${list.filter((f) => f.online).length} Online`))
  if (!list.length)
    body.append(el('div', 'cm-empty', `<div class="cm-empty-art">🤝</div><b>No Friends Yet</b><p>Click anyone in the city and hit <b>Add Friend</b>. When they accept, you’ll see where they are and can jump straight to them. Or bring someone you already know: they’ll land right next to you.</p>`))
  // the friends list is where people think about friends: the invite link lives here too
  const invite = el('button', 'btn small cm-invite', list.length ? '💌 Invite Someone from Outside the City' : '💌 Invite a Friend')
  invite.onclick = () => void import('../features/invite').then((m) => m.openInvite())
  if (!list.length) body.append(invite)
  for (const f of list) {
    const row = el('div', 'cm-row' + (f.online ? '' : ' off'), `<span class="cm-face">${faceOf(f.look)}</span><span class="cm-who"><b>${esc(f.name)}</b><small>${teamLine(f.team)}</small></span>
      <span class="cm-where ${f.online ? 'on' : ''}">${f.online ? `📍 ${roomName(f.room) || 'In the city'}` : '💤 Offline'}</span>`)
    const acts = el('span', 'cm-acts')
    const go = el('button', 'btn small', f.online && f.room === world.room.id ? 'Find' : 'Go')
    go.classList.toggle('ghost', !f.online)
    // offline: say so (and point at their place) instead of a dead, greyed-out button
    go.onclick = () => (f.online ? goToFriend(f.id) : toast(`<b>${esc(f.name)}</b> is offline right now. Their place is open to friends: visit with 🏠, or say hi when they’re back.`, '💤'))
    const home = el('button', 'btn small ghost', '🏠')
    home.title = `Visit ${f.name}’s apartment`
    home.onclick = () => {
      closeOverlay()
      void import('../features/apartment').then((m) => m.visitPlayerApartment(f.id))
    }
    acts.append(go, home)
    row.append(acts)
    body.append(row)
  }
  if (list.length) body.append(invite)
  // people you've blocked (with a way back)
  if (mp.blocked.size) {
    const blockedBox = el('div', 'cm-blocked')
    const head = el('button', 'cm-sub cm-blocked-head', `Blocked · ${mp.blocked.size} <i>▾</i>`)
    head.onclick = async () => {
      sfx.click()
      if (blockedBox.querySelector('.cm-row')) return blockedBox.querySelectorAll('.cm-row').forEach((r) => r.remove())
      const { users } = await rest<{ users: { id: string; name: string }[] }>('/blocks').catch(() => ({ users: [] as { id: string; name: string }[] }))
      for (const u of users) {
        const row = el('div', 'cm-row off', `<span class="cm-who"><b>${esc(u.name)}</b><small>You don’t see them or their chat</small></span>`)
        const un = el('button', 'btn small ghost', 'Unblock')
        un.onclick = async () => {
          const { unblock } = await import('../net/multiplayer')
          await unblock(u.id, u.name)
          row.remove()
        }
        row.append(un)
        blockedBox.append(row)
      }
    }
    blockedBox.append(head)
    body.append(blockedBox)
  }
  // real people in this room you could add
  const here = [...mp.players.values()].filter((a) => a.remote && !mp.friends.has(a.remote.id))
  if (here.length) {
    body.append(el('h4', 'cm-sub', `People Here Now · ${world.room.name}`))
    for (const a of here) {
      const id = a.remote!.id
      const row = el('div', 'cm-row', `<span class="cm-face">${headPortrait(a.look)}</span><span class="cm-who"><b>${esc(a.name)}</b><small>${teamLine(a.remote!.team)}</small></span>`)
      const add = el('button', 'btn small ' + (mp.outgoing.has(id) ? 'ghost' : 'go'), mp.outgoing.has(id) ? 'Requested' : '+ Add Friend')
      add.disabled = mp.outgoing.has(id)
      add.onclick = () => void addFriend(id, a.name).then(rerender)
      row.append(add)
      body.append(row)
    }
  }
  // the computer-run locals you've befriended still hang around
  const locals = friends()
  if (locals.length) {
    body.append(el('h4', 'cm-sub', 'City Locals You Know'))
    for (const r of locals.slice(0, 8)) {
      const row = el('div', 'cm-row local', personRow(r))
      const go = el('button', 'btn small ghost', 'Find')
      go.disabled = !locationOf(r)
      go.onclick = () => findFriend(r)
      row.append(go)
      body.append(row)
    }
  }
}

interface BoardRow extends PublicUser {
  score: number
  you: boolean
}
interface MyRank {
  best: number
  rank: number
  total: number
  next: { name: string; score: number } | null
}

async function renderBoardsOnline(body: HTMLElement, rerender: () => void, live: () => boolean) {
  const chips = el('div', 'cm-chips')
  for (const g of BOARD_GAMES) {
    const b = el('button', 'cm-chip' + (g.id === lastGame ? ' on' : ''), `${g.emoji} ${g.title}`)
    b.onclick = () => {
      sfx.click()
      lastGame = g.id
      rerender()
    }
    chips.append(b)
  }
  const g = BOARD[lastGame]
  const meta = el('div', 'cm-meta', `<span>${allTime ? 'All-time bests · real players' : `This week · real players · resets in ${resetIn()}`}</span>`)
  const toggles = el('span', 'cm-toggles')
  const period = el('button', 'cm-filter', allTime ? '🏛️ All Time' : '📅 This Week')
  period.title = 'Switch between this week and all time'
  period.onclick = () => {
    allTime = !allTime
    rerender()
  }
  const filter = el('button', 'cm-filter', friendsOnly ? '★ Friends' : '🌎 Everyone')
  filter.onclick = () => {
    friendsOnly = !friendsOnly
    rerender()
  }
  toggles.append(period, filter)
  meta.append(toggles)
  const table = el('div', 'cm-board', '<div class="cm-loading">Loading scores…</div>')
  const foot = el('div', 'cm-foot')
  body.append(chips, meta, table, foot)
  let r: { rows: BoardRow[]; me: MyRank }
  try {
    const qs = new URLSearchParams({ ...(friendsOnly ? { scope: 'friends' } : {}), ...(allTime ? { period: 'all' } : {}) }).toString()
    r = await rest(`/leaderboard/${lastGame}${qs ? '?' + qs : ''}`)
  } catch {
    if (live()) table.innerHTML = '<div class="cm-empty"><p>Couldn’t load the leaderboard.</p></div>'
    return
  }
  if (!live()) return
  table.innerHTML = ''
  const rows = r.rows.map((row, i) => ({ ...row, rank: i + 1 }))
  if (r.me.rank && !rows.some((x) => x.you))
    rows.push({ id: 'me', name: save.name, look: save.look, team: save.team, title: '', memberSince: '', score: r.me.best, you: true, rank: r.me.rank })
  for (const row of rows) {
    const medal = row.rank === 1 ? '🥇' : row.rank === 2 ? '🥈' : row.rank === 3 ? '🥉' : `#${row.rank}`
    const friend = link.friends.has(row.id)
    const line = el('div', 'cm-brow' + (row.you ? ' you' : '') + (friend ? ' friend' : ''))
    line.innerHTML = `<span class="cm-rank">${medal}</span><span class="cm-face">${faceOf(row.you ? save.look : row.look)}</span><span class="cm-who"><b>${esc(row.name)}${row.you ? ' (you)' : ''}${friend ? ' <em>★</em>' : ''}</b><small>${teamLine(row.team)}</small></span><span class="cm-score">${fmt(lastGame, row.score)} <small>${g.unit}</small></span>`
    table.append(line)
  }
  if (!rows.length) table.append(el('div', 'cm-empty', `<p>${friendsOnly ? 'None of your friends have played' : 'Nobody has played'} ${g.title} this week. First place is wide open!</p>`))
  foot.innerHTML = r.me.rank
    ? `<span>${allTime ? 'All time: ' : ''}You’re <b>#${r.me.rank}</b> of ${r.me.total}${r.me.next ? ` · beat <b>${esc(r.me.next.name)}</b>’s ${fmt(lastGame, r.me.next.score)} to climb` : ' · 👑 top of the board!'}</span>`
    : `<span>You haven’t played ${g.title} ${allTime ? 'yet' : 'this week'}.</span>`
  const play = el('button', 'btn go', `Play ${g.title}`)
  play.onclick = () => {
    closeOverlay()
    api.playGame(lastGame)
  }
  foot.append(play)
}

async function renderTeamsOnline(body: HTMLElement, rerender: () => void, live: () => boolean) {
  const mine = myTeam()
  if (!mine) {
    body.append(el('p', 'cm-intro', 'Pick a neighborhood. Every coin you earn at a job adds to your team’s weekly score.'))
    body.append(teamPicker(() => rerender()))
    return
  }
  body.append(el('div', 'cm-loading', 'Counting points…'))
  let r: { teams: { team: string; points: number; players: number }[]; mine: number; npcBaseline: boolean }
  try {
    r = await rest('/teams')
  } catch {
    if (live()) body.innerHTML = '<div class="cm-empty"><p>Couldn’t load the standings.</p></div>'
    return
  }
  if (!live()) return
  body.innerHTML = ''
  const rows = r.teams
    .filter((t) => TEAMS[t.team as TeamId])
    .map((t) => ({ team: TEAMS[t.team as TeamId], players: t.players, points: t.points + (r.npcBaseline ? localsPoints(t.team as TeamId) : 0) }))
    .sort((a, b) => b.points - a.points)
  const max = Math.max(1, ...rows.map((x) => x.points))
  body.append(el('div', 'cm-meta', `<span>Neighborhood Wars · this week · resets in ${resetIn()}</span>`))
  const bars = el('div', 'cm-teams')
  rows.forEach((row, i) => {
    const t = row.team
    bars.append(el('div', 'cm-team' + (t.id === mine.id ? ' you' : ''), `<span class="cm-trank">${i + 1}</span><span class="cm-temoji" style="background:${t.color}">${t.emoji}</span><span class="cm-tname"><b>${t.name}</b><small>${row.players} ${row.players === 1 ? 'player' : 'players'} this week${r.npcBaseline ? ' + city locals' : ''}</small><span class="cm-bar"><i style="width:${(row.points / max) * 100}%;background:${t.color}"></i></span></span><span class="cm-tpts">${row.points.toLocaleString('en-US')}</span>`))
  })
  body.append(bars)
  body.append(el('div', 'cm-mine', `<b>You’ve added ${r.mine.toLocaleString('en-US')} points</b> for ${mine.emoji} ${mine.name} this week. Every coin you earn at a job counts!`))
}

function personRow(r: Resident, extra = '') {
  const loc = locationOf(r)
  const t = TEAMS[r.team]
  return `<span class="cm-face">${headPortrait(r.look)}</span>
    <span class="cm-who"><b>${r.name}</b><small><i style="background:${t.color}"></i>${t.name}${r.title ? ` · ${r.title}` : ''}</small></span>
    <span class="cm-where ${loc ? 'on' : ''}">${loc ? `📍 ${roomName(loc)}` : '💤 Offline'}</span>${extra}`
}

function renderFriends(body: HTMLElement, rerender: () => void) {
  const list = friends()
  // online first, then by name
  list.sort((a, b) => (locationOf(b) ? 1 : 0) - (locationOf(a) ? 1 : 0) || a.name.localeCompare(b.name))
  if (!list.length) {
    body.append(el('div', 'cm-empty', `<div class="cm-empty-art">🤝</div><b>No Friends Yet</b><p>Click any New Yorker in the city and hit <b>Add Friend</b>. Tip: wave or dance with them first. People warm up to familiar faces.</p>`))
  }
  for (const r of list) {
    const row = el('div', 'cm-row', personRow(r))
    const acts = el('span', 'cm-acts')
    const loc = locationOf(r)
    const go = el('button', 'btn small', loc && loc !== world.room.id ? 'Go' : 'Here')
    go.disabled = !loc
    go.title = loc ? `Go to ${roomName(loc)}` : 'Offline'
    go.onclick = () => findFriend(r)
    const home = el('button', 'btn small ghost', '🏠')
    home.title = `Visit ${r.name}’s apartment`
    home.onclick = () => {
      closeOverlay()
      import('../features/apartment').then((m) => m.visitApartment(r.id))
    }
    const vs = el('button', 'btn small ghost', '⚔️')
    vs.title = 'Challenge to beat your score'
    vs.onclick = () => challengeMenu(r)
    acts.append(go, home, vs)
    row.append(acts)
    body.append(row)
  }
  // people around you right now
  const nearby = world.npcs.map((a) => a.resident).filter((r): r is Resident => !!r && !isFriend(r.id))
  if (nearby.length) {
    body.append(el('h4', 'cm-sub', `People Here Now · ${world.room.name}`))
    for (const r of nearby) {
      const row = el('div', 'cm-row', personRow(r))
      const add = el('button', 'btn small go', '+ Add Friend')
      add.onclick = () => addFriendFlow(r, rerender)
      row.append(add)
      body.append(row)
    }
  }
}

function challengeMenu(r: Resident) {
  const games = BOARD_GAMES.filter((g) => myWeekly(g.id) > 0)
  if (!games.length) return toast('Play a job first so you have a score to beat!', '⚔️')
  const p = el('div', 'panel', `<h2>⚔️ Challenge ${r.name}</h2><p>They’ll try to beat your best score this week.</p>`)
  const list = el('div', 'choices')
  for (const g of games) {
    const b = el('button', 'btn', `${g.emoji} ${g.title}<small>your best: ${fmt(g.id, myWeekly(g.id))} ${g.unit}</small>`)
    b.onclick = () => {
      challenge(r.id, g.id)
      closeOverlay()
      toast(`Challenge sent! ${r.name} will take their shot soon…`, '⚔️')
    }
    list.append(b)
  }
  p.append(list, closeButton())
  openOverlay(p)
}

function renderBoards(body: HTMLElement, rerender: () => void) {
  const chips = el('div', 'cm-chips')
  for (const g of BOARD_GAMES) {
    const b = el('button', 'cm-chip' + (g.id === lastGame ? ' on' : ''), `${g.emoji} ${g.title}`)
    b.onclick = () => {
      sfx.click()
      lastGame = g.id
      rerender()
    }
    chips.append(b)
  }
  const g = BOARD[lastGame]
  const rows = board(lastGame, friendsOnly)
  const meta = el('div', 'cm-meta', `<span>This week · resets in ${resetIn()}</span>`)
  const filter = el('button', 'cm-filter', friendsOnly ? '★ Friends' : '🌎 Everyone')
  filter.onclick = () => {
    friendsOnly = !friendsOnly
    rerender()
  }
  meta.append(filter)
  body.append(chips, meta)
  const table = el('div', 'cm-board')
  const youIdx = rows.findIndex((r) => r.you)
  const shown = rows.slice(0, 10)
  if (youIdx >= 10) shown.push(rows[youIdx])
  shown.forEach((row) => {
    const rank = rows.indexOf(row) + 1
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`
    const r = row.resident
    const face = row.you ? headPortrait(save.look) : r ? headPortrait(r.look) : ''
    const team = row.you ? myTeam() : r ? TEAMS[r.team] : null
    const line = el('div', 'cm-brow' + (row.you ? ' you' : '') + (r && isFriend(r.id) ? ' friend' : ''))
    line.innerHTML = `<span class="cm-rank">${medal}</span><span class="cm-face">${face}</span><span class="cm-who"><b>${row.you ? `${row.name} (you)` : row.name}${r && isFriend(r.id) ? ' <em>★</em>' : ''}</b><small>${team ? `<i style="background:${team.color}"></i>${team.name}` : ''}</small></span><span class="cm-score">${fmt(lastGame, row.score)} <small>${g.unit}</small></span>`
    if (r && isFriend(r.id) && myWeekly(lastGame)) {
      const vs = el('button', 'btn small ghost', '⚔️')
      vs.title = `Challenge ${r.name}`
      vs.onclick = () => {
        challenge(r.id, lastGame)
        toast(`Challenge sent to ${r.name}!`, '⚔️')
      }
      line.append(vs)
    }
    table.append(line)
  })
  if (!rows.length) table.append(el('div', 'cm-empty', '<p>No scores yet this week. Be the first!</p>'))
  body.append(table)
  const foot = el('div', 'cm-foot', myWeekly(lastGame) ? '' : `<span>You haven’t played ${g.title} this week.</span>`)
  const play = el('button', 'btn go', `Play ${g.title}`)
  play.onclick = () => {
    closeOverlay()
    api.playGame(lastGame)
  }
  foot.append(play)
  body.append(foot)
}

function renderTeams(body: HTMLElement, rerender: () => void) {
  const mine = myTeam()
  if (!mine) {
    body.append(el('p', 'cm-intro', 'Pick a neighborhood. Every coin you earn at a job adds to your team’s weekly score.'))
    body.append(teamPicker(() => rerender()))
    return
  }
  const s = standings()
  const max = Math.max(...s.map((x) => x.points))
  body.append(el('div', 'cm-meta', `<span>Neighborhood Wars · this week · resets in ${resetIn()}</span>`))
  const bars = el('div', 'cm-teams')
  s.forEach((row, i) => {
    const t = row.team
    const you = t.id === mine.id
    bars.append(el('div', 'cm-team' + (you ? ' you' : ''), `<span class="cm-trank">${i + 1}</span><span class="cm-temoji" style="background:${t.color}">${t.emoji}</span><span class="cm-tname"><b>${t.name}</b><small>${t.pitch}</small><span class="cm-bar"><i style="width:${(row.points / max) * 100}%;background:${t.color}"></i></span></span><span class="cm-tpts">${row.points.toLocaleString('en-US')}</span>`))
  })
  body.append(bars)
  body.append(el('div', 'cm-mine', `<b>You’ve added ${myContribution().toLocaleString('en-US')} points</b> for ${mine.emoji} ${mine.name} this week. Every coin you earn at a job counts!`))
}

export function teamPicker(onPick: (t: TeamId) => void): HTMLElement {
  const grid = el('div', 'team-pick')
  for (const id of TEAM_IDS) {
    const t = TEAMS[id]
    const members = RESIDENTS.filter((r) => r.team === id).length
    const b = el('button', 'team-card', `<span class="tc-emoji" style="background:${t.color}">${t.emoji}</span><b>${t.name}</b><small>${t.pitch}</small><em>${members} New Yorkers</em>`)
    b.style.setProperty('--team', t.color)
    b.onclick = () => {
      sfx.stamp()
      joinTeam(id)
      onPick(id)
    }
    grid.append(b)
  }
  return grid
}

export function joinTeam(id: TeamId) {
  save.team = id
  const scarf = TEAMS[id].scarf
  if (!save.owned.includes(scarf)) save.owned.push(scarf)
  persist()
  if (world.player) refreshTag(world.player)
  toast(`Welcome to ${TEAMS[id].name}! You got a team scarf ${TEAMS[id].emoji}`, '🧣')
}

// ---------- the living city: occasional, skippable updates ----------
// Every few minutes at most, silently, and only when nothing else is on screen: the city feels alive without
// tapping you on the shoulder.
async function pulseOnline(): Promise<boolean> {
  try {
    const r = await rest<{ count: number; rooms: Record<string, { n: number }> }>('/city')
    const busy = Object.entries(r.rooms)
      .filter(([room, x]) => room !== world.room.id && x.n >= 2 && ROOMS[room])
      .sort((a, b) => b[1].n - a[1].n)[0]
    if (!busy) return false
    notify(`<b>${busy[1].n} people</b> are hanging out at <b>${ROOMS[busy[0]].name}</b>`, '🟢', [{ label: 'Go', act: () => goto(busy[0]) }], 8000, QUIET)
    return true
  } catch {
    return false
  }
}

const QUIET = { quiet: true }
function pulse() {
  if (save.notifyOff || !save.created || document.hidden || noticesWaiting()) return
  if (document.querySelector('.game-shell, .overlay.open, .ride-car, .creator, .tour, .toast, .stamp-toast, .mc-corner')) return
  if (link.online && Math.random() < 0.6) {
    void pulseOnline().then((shown) => !shown && pulseLocal())
    return
  }
  pulseLocal()
}

function pulseLocal() {
  const fs = friends().filter((r) => locationOf(r) && locationOf(r) !== world.room.id)
  const roll = Math.random()
  if (fs.length && roll < 0.4) {
    const r = pick(fs)
    const loc = locationOf(r)!
    const what = pick(['is hanging out at', 'just showed up at', 'is grabbing a snack at', 'is people-watching at'])
    notify(`<b>${r.name}</b> ${what} <b>${roomName(loc)}</b>`, '📍', [{ label: 'Go', act: () => findFriend(r) }], 8000, QUIET)
  } else if (roll < 0.75) {
    const g = pick(BOARD_GAMES)
    const top = board(g.id)[0]
    if (top && !top.you) notify(`<b>${top.name}</b> leads ${g.title} this week with <b>${fmt(g.id, top.score)}</b> ${g.unit}`, g.emoji, [{ label: 'Beat It', act: () => api.playGame(g.id) }], 8000, QUIET)
  } else {
    const s = standings()
    const mine = myTeam()
    if (mine) notify(`<b>${s[0].team.emoji} ${s[0].team.name}</b> lead the Neighborhood Wars. ${s[0].team.id === mine.id ? 'Keep it up!' : 'Your team needs you!'}`, '🏆', [{ label: 'Standings', act: () => openCommunity('teams') }], 8000, QUIET)
  }
}

function challengeTick() {
  for (const c of resolveChallenges()) {
    const g = BOARD[c.game]
    if (c.theyWon) {
      notify(`<b>${c.resident.name}</b> took your ${g.title} challenge: <b>${fmt(c.game, c.theirs)}</b> vs your ${fmt(c.game, c.target)}. They win!`, '⚔️', [{ label: 'Rematch', act: () => api.playGame(c.game) }], 12000)
    } else {
      notify(`<b>${c.resident.name}</b> tried your ${g.title} challenge: ${fmt(c.game, c.theirs)} vs your <b>${fmt(c.game, c.target)}</b>. You win! +10`, '🏆', [], 9000)
      api.earn(10, undefined, 'challenge')
    }
  }
}

export function startCommunity() {
  setInterval(challengeTick, 5000)
  const loop = () => {
    pulse()
    setTimeout(loop, 240_000 + Math.random() * 180_000)
  }
  setTimeout(loop, 180_000)
  // weekly Neighborhood Wars result
  setTimeout(() => {
    const res = checkWeeklyResult()
    if (!res) return
    if (res.yourTeamWon) {
      api.earn(50, `${res.winner.emoji} ${res.winner.name} won last week!`, 'team-week', prevWeekId())
    } else notify(`Last week’s Neighborhood Wars went to <b>${res.winner.emoji} ${res.winner.name}</b>. New week, new chance!`, '🏆', [{ label: 'Standings', act: () => openCommunity('teams') }])
  }, 5000)
}

export { unfriend, RESIDENT }
