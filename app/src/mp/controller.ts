/**
 * The multiplayer games' conductor: turns the server's lobby / match / results messages into the right screen,
 * starts and stops the games, and owns the ways in (Quick Match, Create Lobby, a code, an invite) and out (Leave,
 * Escape, Back to the City, Hide).
 */
import { el } from '../engine/stage'
import { notify, toast } from '../engine/ui'
import { sfx } from '../audio'
import { link } from '../net/link'
import { sock } from '../net/socket'
import { headPortrait } from '../avatar/render'
import type { Look } from '../avatar/look'
import { MP_GAMES, REACTIONS, PHRASES, type MpGameId } from './shared/games'
import type { LobbyWire, MatchWire, MpS2C, ResultsWire } from './shared/protocol'
import { mpStore, send, onMp, esc, type MpMsg } from './store'
import { openShell, closeShell, setView, setBar, setKeys, openSub, confirmLeave, hideShell, restore, isHidden, updateChip, hideChip, shellOpen, shellBody, showChip } from './shell'
import { renderLobby, showReaction } from './lobby'
import { renderResults } from './results'
import { openBoard } from './board'
import { friendList } from './social'
import { msfx } from './sound'

// ---------- the games themselves ----------
export interface GameCtx {
  root: HTMLElement
  match: MatchWire
  lobby: LobbyWire | null
  me: string
  send: (m: MpMsg) => void
  /** ask before leaving (Escape does the same) */
  leave: () => void
}
export interface RunningGame {
  id: string
  /** races: gh / ev; Carb-Jitsu: cj; a repeat 'start' for the same match (after a reconnect) */
  event(e: MpS2C): void
  react(id: string, html: string): void
  /** the match is over: how long to keep the game on screen before the results (a finish to savour) */
  finish(r: ResultsWire): number
  destroy(): void
}
const LOADERS: Record<MpGameId, () => Promise<{ start: (ctx: GameCtx) => RunningGame }>> = {
  sled: () => import('./games/sled'),
  runner: () => import('./games/runner'),
  carbs: () => import('./games/carbs'),
}

type View = 'none' | 'loading' | 'lobby' | 'game' | 'results'
const C = {
  view: 'none' as View,
  game: null as RunningGame | null,
  /** the player just asked for a lobby (Quick Match, Create, a code): show it when it arrives */
  want: false,
  lobbyPrimary: null as (() => void) | null,
  resultsTimer: 0,
}
export const mpView = () => C.view

export const lobbyLink = (code: string) => `${location.origin}/play?lobby=${code}`

// ---------- ways in ----------
function loading(g: MpGameId | null, text: string) {
  openShell()
  C.view = 'loading'
  setBar({ game: g ?? 'sled', title: g ? MP_GAMES[g].title : 'Joining a Game', onLeave: () => leaveLobby() })
  const v = el('div', 'mp-lobby')
  const art = el('div', 'mp-art')
  if (g) art.style.backgroundImage = `url(${MP_GAMES[g].art})`
  v.append(el('div', 'mp-card mp-go', `<div class="mp-status">${text}<small>One moment…</small></div>`))
  v.style.gridTemplateColumns = '1fr'
  v.style.placeItems = 'center'
  const box = el('div', '')
  box.append(art, v)
  setView(box)
  setKeys((e) => {
    if (e.key === 'Escape') {
      leaveLobby()
      return true
    }
  })
}
export function quickMatch(g: MpGameId) {
  C.want = true
  loading(g, 'Finding a table…')
  send({ k: 'quick', g })
}
export function createLobby(g: MpGameId, priv = true) {
  C.want = true
  loading(g, 'Setting up your lobby…')
  send({ k: 'create', g, priv })
}
export function joinCode(code: string) {
  C.want = true
  loading(null, `Joining game ${esc(code.toUpperCase())}…`)
  send({ k: 'join', code })
}

// ---------- ways out ----------
export function leaveLobby() {
  send({ k: 'leave' })
  mpStore.lobby = null
  mpStore.match = null
  stopGame()
  C.view = 'none'
  C.want = false
  closeShell()
}
function stopGame() {
  clearTimeout(C.resultsTimer)
  if (C.game) {
    try {
      C.game.destroy()
    } catch (e) {
      console.error(e)
    }
  }
  C.game = null
}
function hideLobby() {
  if (!mpStore.lobby) return
  hideShell(chipHtml(mpStore.lobby), () => reopen())
}
function reopen() {
  restore()
  hideChip()
  if (C.view === 'lobby' && mpStore.lobby) showLobby()
}
function chipHtml(l: LobbyWire): string {
  const def = MP_GAMES[l.g]
  const present = l.seats.filter((s) => !s.o && !s.a).length
  const auto = l.auto ? ` · starts in ${Math.ceil(l.auto / 1000)}s` : ''
  return `${def.icon} ${esc(def.short)} · ${present} of ${l.max}${l.st === 'playing' ? ' · a round is on' : auto} <small>Open</small>`
}

// ---------- screens ----------
function showLobby() {
  const l = mpStore.lobby
  if (!l) return
  openShell()
  // someone joined or got ready: redraw the lobby, but leave the Invite or Leaderboard panel you have open alone
  const redraw = C.view === 'lobby'
  C.view = 'lobby'
  setBar({ game: l.g, code: l.code, onCopy: () => copyLink(l), onHide: () => hideLobby(), onLeave: () => leaveLobby() })
  const box = el('div', '')
  setView(box, '', redraw)
  const r = renderLobby(box, l, { invite: () => openInvite(), board: () => openBoard(l.g), leave: () => leaveLobby() })
  C.lobbyPrimary = r.primary
  setKeys((e) => {
    if (e.key === 'Escape') {
      leaveLobby()
      return true
    }
    if (e.key === 'Enter') {
      C.lobbyPrimary?.()
      return true
    }
  })
}

async function startGame(m: MatchWire) {
  if (C.game?.id === m.id) return C.game.event({ t: 'mp', k: 'start', m })
  stopGame()
  openShell()
  C.view = 'game'
  const box = el('div', 'mp-game')
  setView(box, 'playing')
  const leaveText = m.g === 'carbs' ? ['Leave the Table?', 'You’ll forfeit this match. No hard feelings.'] : ['Leave the Race?', 'This round won’t count for you. You can always come back.']
  const askLeave = () => (m.you < 0 ? leaveLobby() : confirmLeave(leaveText[0], leaveText[1], () => leaveLobby()))
  setBar({ game: m.g, slim: true, onLeave: askLeave })
  setKeys((e) => {
    if (e.key === 'Escape') {
      askLeave()
      return true
    }
  })
  let mod
  try {
    mod = await LOADERS[m.g]()
  } catch (e) {
    console.error(e)
    toast('That game didn’t load. Check your connection and try again.', '🚧')
    return leaveLobby()
  }
  // the screen moved on while the game was loading
  if (C.view !== 'game' || mpStore.match?.id !== m.id) return
  C.game = mod.start({ root: box, match: m, lobby: mpStore.lobby, me: link.me, send, leave: askLeave })
}

function showResults(r: ResultsWire) {
  stopGame()
  openShell()
  C.view = 'results'
  const l = mpStore.lobby
  setBar({ game: r.g, title: 'Results', code: l?.code, onCopy: l ? () => copyLink(l) : undefined, onLeave: () => leaveLobby(), leaveLabel: 'Back to the City' })
  const box = el('div', '')
  setView(box)
  renderResults(box, r, {
    again: () => playAgain(),
    invite: () => openInvite(),
    board: () => openBoard(r.g),
    back: () => leaveLobby(),
    brag: (text) => copy(`${text} ${mpStore.lobby ? `Come play: ${lobbyLink(mpStore.lobby.code)}` : ''}`.trim(), 'Copied! Paste it in the group chat.'),
  })
  setKeys((e) => {
    if (e.key === 'Escape') {
      leaveLobby()
      return true
    }
    if (e.key === 'Enter') {
      playAgain()
      return true
    }
  })
}

function playAgain() {
  sfx.click()
  send({ k: 'again' })
  C.view = 'lobby'
  C.want = true
  if (mpStore.lobby) showLobby()
  else loading(mpStore.results?.g ?? null, 'Back to the table…')
}

// ---------- invites ----------
async function copy(text: string, ok: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast(ok, '📋')
  } catch {
    toast(esc(text), '🔗')
  }
}
function copyLink(l: LobbyWire) {
  const def = MP_GAMES[l.g]
  void copy(`Join my ${def.short} in Club NYC: ${lobbyLink(l.code)} (code ${l.code})`, 'Link copied. Paste it in your Discord or group chat.')
}

async function openInvite() {
  const l = mpStore.lobby
  if (!l) return
  const card = el('div', 'mp-invite')
  card.innerHTML = `<h2>Invite Friends</h2><p>Friends who are online get a notice with a Join button. Anyone else can join with the link or the code.</p>
    <div class="mp-inv-code"><span>Code</span><b>${l.code}</b><span>Read it out on voice chat.</span></div>`
  const linkRow = el('div', 'mp-inv-link')
  const input = document.createElement('input')
  input.readOnly = true
  input.value = lobbyLink(l.code)
  input.setAttribute('aria-label', 'Link to this game')
  input.onclick = () => input.select()
  const cp = el('button', 'btn small go', 'Copy Link')
  cp.onclick = () => copyLink(l)
  linkRow.append(input, cp)
  card.append(linkRow)
  const list = el('div', 'mp-inv-list', '<div class="mp-empty">Loading your friends…</div>')
  card.append(el('h4', 'cm-sub', 'Friends'), list)
  openSub(card)
  const friends = await friendList().catch(() => [])
  if (!list.isConnected) return
  list.innerHTML = ''
  const inLobby = new Set([...(mpStore.lobby?.seats.map((s) => s.i) ?? []), ...(mpStore.lobby?.spec.map((s) => s.i) ?? [])])
  if (!friends.length) list.innerHTML = `<div class="mp-empty">No friends yet. Add people you play with (there’s a button on everyone in the lobby and on the results), or send the link.</div>`
  for (const f of friends) {
    const row = el('div', 'cm-row' + (f.online ? '' : ' off'), `<span class="cm-face">${f.look ? headPortrait(f.look as Look) : ''}</span><span class="cm-who"><b>${esc(f.name)}</b><small>${f.online ? 'Online' : 'Offline'}</small></span>`)
    if (inLobby.has(f.id)) row.append(el('span', 'mp-pill ready', 'In this game'))
    else if (f.online) {
      const b = el('button', 'btn small go', 'Invite')
      b.onclick = () => {
        send({ k: 'inv', i: f.id })
        b.textContent = 'Invited ✓'
        ;(b as HTMLButtonElement).disabled = true
        msfx.pop()
      }
      row.append(b)
    } else row.append(el('span', 'mp-pill', 'Send the link'))
    list.append(row)
  }
}

// ---------- the server's messages ----------
function onEvent(e: MpS2C) {
  switch (e.k) {
    case 'lobby': {
      const first = !mpStore.lobby
      mpStore.lobby = e.l
      if (first) msfx.join()
      if (isHidden()) return updateChip(chipHtml(e.l))
      if (C.view === 'game' || C.view === 'results') return
      if (C.view === 'lobby' || C.view === 'loading' || C.want || first) {
        C.want = false
        showLobby()
      }
      return
    }
    case 'left': {
      const had = mpStore.lobby
      mpStore.lobby = null
      if (e.why === 'kicked') toast('The host removed you from that game.', '🎮')
      else if (e.why === 'closed' && had) toast('That game closed.', '🎮')
      if (C.view === 'results') return
      if (C.view !== 'none') {
        stopGame()
        C.view = 'none'
        closeShell()
      }
      hideChip()
      return
    }
    case 'start': {
      mpStore.match = e.m
      // still reading your results: don't yank you into the next round (the lobby says a round is on)
      if (C.view === 'results' && e.m.you < 0) return
      if (isHidden()) {
        if (e.m.you < 0) return mpStore.lobby ? updateChip(chipHtml(mpStore.lobby)) : undefined
        restore()
      }
      void startGame(e.m)
      return
    }
    case 'gh':
    case 'ev':
    case 'cj':
      C.game?.event(e)
      return
    case 'res': {
      mpStore.results = e.r
      if (isHidden()) {
        showChip(`${MP_GAMES[e.r.g].icon} Results are in <small>See Results</small>`, () => {
          restore()
          showResults(e.r)
        })
        return
      }
      const wait = C.game ? C.game.finish(e.r) : 0
      clearTimeout(C.resultsTimer)
      C.resultsTimer = window.setTimeout(() => showResults(e.r), wait)
      return
    }
    case 'inv': {
      const def = MP_GAMES[e.g]
      notify(`<b>${esc(e.from)}</b> invited you to ${def.short === 'Carb-Jitsu' ? 'a game of Carb-Jitsu' : `a ${esc(def.short)}`}`, def.icon, [
        { label: 'Join', act: () => joinCode(e.code) },
        { label: 'Not Now', act: () => {} },
      ], 20000)
      return
    }
    case 're':
    case 'say': {
      const html = e.k === 're' ? REACTIONS[e.e] ?? '' : esc(PHRASES[e.p] ?? '')
      if (!html) return
      if (C.view === 'lobby' && shellBody()) showReaction(shellBody()!, e.i, html)
      C.game?.react(e.i, html)
      return
    }
    case 'err':
      if (C.view === 'loading') {
        const v = shellBody()?.querySelector('.mp-status')
        if (v) {
          v.innerHTML = `${esc(e.m)}<small>Press Leave (or Escape) to head back.</small>`
          return
        }
      }
      toast(esc(e.m), '🎮')
      return
  }
}

let started = false
export function startController() {
  if (started) return
  started = true
  onMp(onEvent)
  // back online after a blip or a reload: ask where we stand (the server also tells us on its own)
  sock.onOpen(() => {
    if (mpStore.lobby || C.view !== 'none') send({ k: 'sync' })
  })
}

export const isPlaying = () => C.view === 'game'
export const anyMpScreen = () => shellOpen() || C.view !== 'none'
