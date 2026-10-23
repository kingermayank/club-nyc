/**
 * Finding a game: the Games tab in the Community panel (every game with what's on right now, Quick Match, Create
 * Lobby, Leaderboard, join with a code, friends' tables) and the game card the signs in the city open (the art, how
 * to play, a little true story about the place, and the same buttons).
 */
import { el } from '../engine/stage'
import { openOverlay, closeOverlay, closeButton, toast } from '../engine/ui'
import { sfx } from '../audio'
import { link } from '../net/link'
import { rest } from '../net/server'
import { MP_GAMES, MP_GAME_IDS, fmtBest, validCode, CODE_LEN, type MpGameId } from './shared/games'
import { esc, connected } from './store'
import { quickMatch, createLobby, joinCode } from './controller'
import { openBoard } from './board'

export interface Hub {
  games: Record<MpGameId, { waiting: number; playing: number; open: number; friends: { name: string; code: string; st: string }[] }>
  mine: string | null
  stats: Record<MpGameId, { played: number; wins: number; best: number | null; weekRank: number }>
}
let cache: { at: number; hub: Hub } | null = null
export async function fetchHub(maxAge = 4000): Promise<Hub | null> {
  if (cache && Date.now() - cache.at < maxAge) return cache.hub
  try {
    const hub = await rest<Hub>('/mp/hub')
    cache = { at: Date.now(), hub }
    return hub
  } catch {
    return null
  }
}

const liveLine = (h: Hub['games'][MpGameId] | undefined) => {
  if (!h) return ''
  const bits: string[] = []
  if (h.waiting) bits.push(`<span class="on">● ${h.waiting} waiting</span>`)
  if (h.playing) bits.push(`<span>${h.playing} playing now</span>`)
  return bits.length ? bits.join('') : '<span>Nobody’s playing right now. Start one and invite friends.</span>'
}
const recordLine = (g: MpGameId, s: Hub['stats'][MpGameId] | undefined) =>
  s && s.played ? `<span>You: ${s.wins} ${s.wins === 1 ? 'win' : 'wins'} · best ${s.best ? fmtBest(g, s.best) : '–'}${s.weekRank ? ` · #${s.weekRank} this week` : ''}</span>` : ''

/** can we play online right now? (say why not instead of failing quietly) */
function canPlay(): boolean {
  if (!link.account) {
    toast('Multiplayer games need you signed in. Pick Play Now on the front door and you’re in.', '🎮')
    return false
  }
  if (!connected()) {
    toast('Reconnecting to the city. Try again in a second.', '📡')
    return false
  }
  return true
}

function actions(g: MpGameId, after?: () => void): HTMLElement {
  const acts = el('div', 'acts')
  const quick = el('button', 'btn small go', 'Quick Match')
  quick.onclick = () => {
    if (!canPlay()) return
    sfx.pop()
    after?.()
    quickMatch(g)
  }
  const create = el('button', 'btn small', 'Create Lobby')
  create.onclick = () => {
    if (!canPlay()) return
    sfx.click()
    after?.()
    createLobby(g)
  }
  const board = el('button', 'btn small ghost', 'Leaderboard')
  board.onclick = () => {
    sfx.click()
    openBoard(g)
  }
  acts.append(quick, create, board)
  return acts
}

/** the Community panel's Games tab */
export async function renderGamesTab(body: HTMLElement, live: () => boolean) {
  const box = el('div', 'mp-hub')
  const top = el('div', 'mp-hub-top')
  top.append(el('p', 'mp-hub-intro', 'Play with friends, with whoever’s around, or with the city locals. Every win is saved on the game’s leaderboard.'))
  box.append(top)
  const cards = new Map<MpGameId, HTMLElement>()
  for (const g of MP_GAME_IDS) {
    const def = MP_GAMES[g]
    const c = el('div', 'mp-gcard')
    c.innerHTML = `<span class="thumb" style="background-image:url(${def.art})"></span><div><h3>${def.icon} ${esc(def.title)}</h3><p>${esc(def.blurb)}</p><div class="live">Checking who’s playing…</div></div>`
    c.append(actions(g, () => closeOverlay()))
    cards.set(g, c)
    box.append(c)
  }
  // join a friend's game by its code (they read it out on voice chat), up top next to the intro
  const join = el('div', 'mp-join-code', '<span>Got a code?</span>')
  const input = document.createElement('input')
  input.maxLength = CODE_LEN
  input.placeholder = 'CODE'
  input.setAttribute('aria-label', 'Game code')
  input.oninput = () => (input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
  const go = el('button', 'btn small go', 'Join')
  const submit = () => {
    const code = input.value.trim().toUpperCase()
    if (!validCode(code)) return toast(`Codes are ${CODE_LEN} letters and numbers, like K7QX.`, '🎮')
    if (!canPlay()) return
    closeOverlay()
    joinCode(code)
  }
  go.onclick = submit
  input.onkeydown = (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') submit()
  }
  join.append(input, go)
  top.append(join)
  const friendsBox = el('div', 'mp-hub')
  box.append(friendsBox)
  body.append(box)
  const hub = await fetchHub(0)
  if (!live()) return
  for (const g of MP_GAME_IDS) {
    const lv = cards.get(g)!.querySelector('.live')!
    lv.innerHTML = hub ? liveLine(hub.games[g]) + recordLine(g, hub.stats[g]) : '<span>Can’t see who’s playing right now.</span>'
  }
  const fl = hub ? MP_GAME_IDS.flatMap((g) => hub.games[g].friends.map((f) => ({ ...f, g }))) : []
  if (fl.length) {
    friendsBox.append(el('h4', 'cm-sub', 'Your Friends Are Playing'))
    for (const f of fl) {
      const row = el('div', 'mp-friend-lobby', `<span><b>${esc(f.name)}</b> · ${esc(MP_GAMES[f.g].short)}${f.st === 'playing' ? ' (a round is on)' : ''}</span>`)
      const b = el('button', 'btn tiny go', 'Join')
      b.onclick = () => {
        if (!canPlay()) return
        closeOverlay()
        joinCode(f.code)
      }
      row.append(b)
      friendsBox.append(row)
    }
  }
}

/** a game's card (the signs in the city open this) */
export async function openGameCard(g: MpGameId) {
  const def = MP_GAMES[g]
  const p = el('div', 'panel mp-gamecard')
  p.innerHTML = `<div class="hero" style="background-image:url(${def.art})"><span class="place">📍 ${esc(def.place)}</span></div>
    <div class="in"><h2>${esc(def.title)}</h2><p class="blurb">${esc(def.blurb)}</p>
    <ul class="how">${def.how.map((h) => `<li>${h}</li>`).join('')}<li>${def.players} · city locals fill in</li></ul>
    <p class="story"><b>${esc(def.story.title)}.</b> ${esc(def.story.text)}</p>
    <div class="live">Checking who’s playing…</div></div>`
  const btns = el('div', 'btns')
  const a = actions(g, () => closeOverlay())
  btns.append(...a.childNodes)
  p.querySelector('.in')!.append(btns)
  p.append(closeButton())
  openOverlay(p)
  const hub = await fetchHub()
  const lv = p.querySelector('.live')
  if (lv && p.isConnected) lv.innerHTML = hub ? liveLine(hub.games[g]) + ' ' + recordLine(g, hub.stats[g]) : ''
}
