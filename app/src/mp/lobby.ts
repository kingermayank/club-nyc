/**
 * The lobby: who's in (with Add Friend on everyone you don't know yet), how to play, the host's settings, a clear
 * status line ("Starting in 12…", "Waiting for Ana to start") and one big button that always says what it does.
 * Quick reactions and phrases let people chat without typing (voice chat does the rest).
 */
import { el } from '../engine/stage'
import { headPortrait } from '../avatar/render'
import { sfx } from '../audio'
import { link } from '../net/link'
import { ROOMS } from '../data/rooms'
import type { Look } from '../avatar/look'
import { MP_GAMES, MP_TEAMS, REACTIONS, PHRASES } from './shared/games'
import type { LobbyWire, SeatWire } from './shared/protocol'
import { send, esc } from './store'
import { friendButton } from './social'
import { msfx } from './sound'

export interface LobbyActions {
  invite(): void
  board(): void
  leave(): void
}

const START_LABEL = { sled: 'Start Race', runner: 'Start Run', carbs: 'Deal Cards' } as const
const roomName = (id: string) => ROOMS[id]?.name ?? 'the city'

let receivedAt = 0
let timer = 0
let current: LobbyWire | null = null

/** draw the lobby into `box` (called again on every change) */
export function renderLobby(box: HTMLElement, l: LobbyWire, act: LobbyActions) {
  current = l
  receivedAt = performance.now()
  const def = MP_GAMES[l.g]
  const meId = link.me
  const mine = l.seats.find((s) => s.i === meId)
  const watching = !mine && l.spec.some((s) => s.i === meId)
  const host = l.host === meId
  const present = l.seats.filter((s) => !s.o && !s.a)
  box.innerHTML = ''
  const view = el('div', 'mp-lobby')
  const art = el('div', 'mp-art')
  art.style.backgroundImage = `url(${def.art})`
  box.append(art, view)

  // ---------- players ----------
  const players = el('div', 'mp-card mp-players')
  const head = el('h3', 'mp-h', `Players <small>${l.seats.length} of ${l.max} · ${l.priv ? 'Invite Only' : 'Public'} · from ${esc(roomName(l.room))}</small>`)
  players.append(head)
  const seatEl = (s: SeatWire) => {
    const you = s.i === meId
    const status = s.o ? 'Reconnecting…' : s.a ? 'Reading the results' : s.r ? '' : 'Not ready'
    const team = l.mode === 'teams' && s.tm ? s.tm : null
    const row = el('div', `mp-seat${you ? ' you' : ''}${s.o ? ' off' : ''}${s.a ? ' away' : ''}${team ? ' team-' + team : ''}`)
    row.dataset.id = s.i
    row.innerHTML = `<span class="mp-face">${headPortrait(s.l as Look)}</span><span class="mp-who"><b>${esc(s.n)}${you ? ' (you)' : ''}</b><small>${
      s.i === l.host ? '<span class="mp-pill host">Host</span>' : ''
    }${s.r && !s.a && !s.o ? '<span class="mp-pill ready">Ready</span>' : ''}${team ? `<span class="mp-pill ${team}">${MP_TEAMS[team].name}</span>` : ''}${l.champ?.i === s.i ? `<span class="mp-pill host">Holds the table · ${l.champ.s}</span>` : ''}${status ? `<span>${status}</span>` : ''}</small></span>`
    const acts = el('span', 'mp-seat-acts')
    if (you && team && l.st === 'open') {
      const other = team === 'up' ? 'down' : 'up'
      const sw = el('button', 'btn tiny ghost', `Switch to ${MP_TEAMS[other].name}`)
      sw.onclick = () => send({ k: 'team', tm: other })
      acts.append(sw)
    }
    const fb = friendButton(s.i, s.n, () => renderLobby(box, current ?? l, act))
    if (fb) acts.append(fb)
    if (host && !you) {
      const kick = el('button', 'btn tiny ghost', 'Remove')
      kick.title = `Remove ${s.n} from this lobby`
      kick.onclick = () => send({ k: 'kick', i: s.i })
      acts.append(kick)
    }
    row.append(acts)
    return row
  }
  if (l.g === 'carbs') {
    // Winner Stays On: the two at the table, then the line
    const order = (l.next ?? []).map((id) => l.seats.find((s) => s.i === id)).filter((s): s is SeatWire => !!s)
    const rest = l.seats.filter((s) => !order.includes(s))
    const table = el('div', 'mp-table')
    const a = order[0]
    const b = order[1]
    table.append(a ? seatEl(a) : el('div', 'mp-seat empty', 'Open seat'), el('span', 'vs', 'vs'), b ? seatEl(b) : el('div', 'mp-seat empty', l.st === 'open' ? 'A city local sits in if nobody else does' : 'Open seat'))
    players.append(table)
    if (order.length > 2 || rest.length) {
      players.append(el('h4', 'mp-h', '<small>Next Up (Winner Stays On)</small>'))
      const q = el('div', 'mp-queue')
      for (const s of [...order.slice(2), ...rest]) q.append(seatEl(s))
      players.append(q)
    }
  } else {
    const grid = el('div', `mp-seats ${l.max > 4 ? 'n9' : 'n4'}`)
    for (const s of l.seats) grid.append(seatEl(s))
    for (let k = l.seats.length; k < l.max; k++) {
      const empty = el('div', 'mp-seat empty', k === l.seats.length ? '' : l.bots ? 'A city local races here' : 'Open seat')
      if (k === l.seats.length) {
        const inv = el('button', 'btn tiny go', '+ Invite')
        inv.onclick = () => act.invite()
        empty.append(el('span', '', 'Open seat'), inv)
      }
      grid.append(empty)
    }
    players.append(grid)
  }
  if (l.spec.length) players.append(el('div', 'mp-watchers', `Watching: ${l.spec.map((s) => esc(s.n)).join(', ')}`))
  // reactions and phrases: nothing to type, nothing to moderate
  const reacts = el('div', 'mp-reacts')
  REACTIONS.forEach((e, i) => {
    const b = el('button', 'mp-r', e)
    b.title = 'React'
    b.onclick = () => send({ k: 're', e: i })
    reacts.append(b)
  })
  PHRASES.forEach((p, i) => {
    const b = el('button', 'mp-p', esc(p))
    b.onclick = () => send({ k: 'say', p: i })
    reacts.append(b)
  })
  players.append(reacts)
  view.append(players)

  // ---------- side: how to play, settings, the big button ----------
  const side = el('div', 'mp-side')
  side.append(el('div', 'mp-card mp-how', `<h4>How to Play</h4><ul>${def.how.map((h) => `<li>${h}</li>`).join('')}</ul>`))
  const set = el('div', 'mp-card mp-set')
  set.append(el('h4', '', 'Settings'))
  const seg = (opts: [string, string][], val: string, on: (v: string) => void, enabled: boolean) => {
    const s = el('div', 'mp-seg')
    for (const [v, label] of opts) {
      const b = el('button', v === val ? 'on' : '', label) as HTMLButtonElement
      b.disabled = !enabled
      b.onclick = () => {
        sfx.click()
        on(v)
      }
      s.append(b)
    }
    return s
  }
  const canSet = host && l.st === 'open'
  if (def.teams) set.append(seg([['ffa', 'Free-for-All'], ['teams', 'Uptown vs Downtown']], l.mode, (v) => send({ k: 'set', mode: v as 'ffa' | 'teams' }), canSet))
  if (l.g !== 'carbs') set.append(seg([['on', 'City Locals On'], ['off', 'Locals Off']], l.bots ? 'on' : 'off', (v) => send({ k: 'set', bots: v === 'on' }), canSet))
  set.append(seg([['pub', 'Public'], ['priv', 'Invite Only']], l.priv ? 'priv' : 'pub', (v) => send({ k: 'set', priv: v === 'priv' }), canSet))
  if (!canSet) set.append(el('div', 'mp-setline', host ? 'Settings lock while a round is on.' : `${esc(l.seats.find((s) => s.i === l.host)?.n ?? 'The host')} picks the settings.`))
  side.append(set)

  const go = el('div', 'mp-card mp-go')
  const status = el('div', 'mp-status')
  go.append(status)
  const big = el('button', 'btn go big') as HTMLButtonElement
  const alone = present.length <= 1
  let label = ''
  let fn: (() => void) | null = null
  if (l.st === 'playing') {
    label = mine || watching ? 'Watch This Round' : 'Watch'
    big.classList.remove('go')
    fn = () => send({ k: 'sync' })
  } else if (mine?.a) {
    label = 'Play Again'
    fn = () => send({ k: 'again' })
  } else if (watching) {
    const free = l.seats.length < l.max
    label = free ? 'Take a Seat' : 'Table Full'
    big.disabled = !free
    fn = () => send({ k: 'again' })
  } else if (host) {
    label = alone && (l.bots || l.g === 'carbs') ? (l.g === 'carbs' ? 'Play a Local' : 'Start with Locals') : START_LABEL[l.g]
    fn = () => {
      msfx.go()
      send({ k: 'start' })
    }
  } else if (mine) {
    label = mine.r ? 'Ready ✓' : 'Ready'
    if (mine.r) big.classList.add('ghost')
    fn = () => {
      msfx.ready()
      send({ k: 'ready', on: !mine.r })
    }
  }
  big.innerHTML = `${label}${l.st === 'open' && (host || mine) && !mine?.a ? '<kbd>Enter</kbd>' : ''}`
  big.onclick = () => fn?.()
  big.dataset.act = fn ? 'go' : ''
  go.append(big)
  const row = el('div', 'mp-row')
  const inv = el('button', 'btn small ghost', '💌 Invite')
  inv.onclick = () => act.invite()
  const lb = el('button', 'btn small ghost', '🏆 Leaderboard')
  lb.onclick = () => act.board()
  row.append(inv, lb)
  go.append(row)
  side.append(go)
  view.append(side)

  const paint = () => {
    if (!status.isConnected) return
    const lv = current ?? l
    const autoLeft = lv.auto ? Math.max(0, lv.auto - (performance.now() - receivedAt)) : 0
    const hostName = esc(lv.seats.find((s) => s.i === lv.host)?.n ?? 'The host')
    let main = ''
    let sub = ''
    if (lv.st === 'playing') {
      main = 'A round is on'
      sub = mine || watching ? 'You’re in the next one. Watch this one meanwhile.' : ''
    } else if (autoLeft > 0) {
      main = `Starting in ${Math.ceil(autoLeft / 1000)}…`
      sub = present.length <= 1 ? (lv.g === 'carbs' ? 'A city local will take the other seat.' : 'City locals fill the empty seats.') : 'Press Ready to go now.'
    } else if (host) {
      main = present.length <= 1 ? 'Invite friends, or start now' : 'Start when everyone’s in'
      sub = present.length <= 1 ? 'Share the code or the link in your group chat.' : `${present.filter((s) => s.r).length} of ${present.length} ready`
    } else if (mine && !mine.r) {
      main = 'Press Ready when you’re set'
      sub = `${hostName} starts the round.`
    } else if (mine) {
      main = `Waiting for ${hostName}`
      sub = 'Everyone ready starts it right away.'
    } else {
      main = 'Watching'
      sub = 'You get a seat in the next round.'
    }
    status.innerHTML = `${main}${sub ? `<small>${sub}</small>` : ''}`
  }
  paint()
  clearInterval(timer)
  let lastS = -1
  timer = window.setInterval(() => {
    if (!status.isConnected) return clearInterval(timer)
    const lv = current ?? l
    const left = lv.auto ? Math.ceil(Math.max(0, lv.auto - (performance.now() - receivedAt)) / 1000) : -1
    if (left !== lastS && left >= 0 && left <= 3) msfx.tick()
    lastS = left
    paint()
  }, 250)
  return { primary: () => fn?.() }
}

/** a reaction or phrase pops up over someone's seat */
export function showReaction(box: HTMLElement, id: string, html: string) {
  const seat = box.querySelector<HTMLElement>(`.mp-seat[data-id="${CSS.escape(id)}"]`)
  if (!seat) return
  seat.querySelector('.mp-react-at')?.remove()
  const r = el('span', 'mp-react-at', html)
  seat.append(r)
  setTimeout(() => r.remove(), 2400)
}
