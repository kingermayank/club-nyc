/**
 * Finding a game: the Games tab in the Community panel (every game with what's on right now, Quick Match, Create
 * Lobby, Leaderboard, join with a code, friends' tables) and the game card the signs in the city open (the art, how
 * to play, a little true story about the place, and the same buttons).
 */
import { el } from '../engine/stage'
import { openOverlay, closeOverlay, toast } from '../engine/ui'
import { sfx } from '../audio'
import { link } from '../net/link'
import { rest } from '../net/server'
import { MP_GAMES, MP_GAME_IDS, validCode, CODE_LEN, type MpGameId } from './shared/games'
import { esc, connected } from './store'
import { quickMatch, createLobby, joinCode } from './controller'
import { openBoard } from './board'
import { gameCard, icon } from '../features/gamecard'
import { HOW } from './howto'

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


/** the Community panel's Games tab */
export async function renderGamesTab(body: HTMLElement, live: () => boolean) {
  const box = el('div', 'mp-hub')
  // the games as big picture tiles: pick one and its card shows how to play and the ways in
  const grid = el('div', 'mp-tiles')
  const cards = new Map<MpGameId, HTMLElement>()
  for (const g of MP_GAME_IDS) {
    const def = MP_GAMES[g]
    const c = el('button', 'mp-tile') as HTMLButtonElement
    c.style.backgroundImage = `url(${def.art})`
    c.innerHTML = `<span class="mp-tile-chips"><span class="gc-chip">${icon('friends')}${players(def.players)}</span><span class="gc-chip gc-live live" hidden></span></span>
      <span class="mp-tile-name"><b>${esc(def.short)}</b><small>${HOW[g].tagline}</small></span><span class="mp-tile-go">Play</span>`
    c.onclick = () => {
      sfx.click()
      void openGameCard(g)
    }
    cards.set(g, c)
    grid.append(c)
  }
  const top = el('div', 'mp-hub-top')
  box.append(grid, top)
  // join a friend's game by its code (they read it out on voice chat), under the tiles at the bottom right
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
    const lv = cards.get(g)!.querySelector<HTMLElement>('.live')!
    const h = hub?.games[g]
    lv.innerHTML = liveChip(h)
    lv.hidden = !lv.innerHTML
  }
  const fl = hub ? MP_GAME_IDS.flatMap((g) => hub.games[g].friends.map((f) => ({ ...f, g }))) : []
  if (fl.length) {
    friendsBox.append(el('h4', 'cm-sub', 'Your Friends Are Playing'))
    for (const f of fl) {
      const row = el('div', 'mp-friend-lobby', `<span><b>${esc(f.name)}</b> ${f.st === 'playing' ? 'is playing' : 'is at'} ${esc(MP_GAMES[f.g].short)}</span>`)
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

/** "2 to 9 players" as a chip reads it: 2–9 */
const players = (p: string) => p.replace(/(\d+) to (\d+) players/, '$1–$2').replace(', up to 6 at a table', '')
/** who's in a game right now, as a chip (nothing when it's quiet) */
const liveChip = (h: Hub['games'][MpGameId] | undefined) => (h?.waiting ? `<i></i>${h.waiting} waiting` : h?.playing ? `<i></i>${h.playing} playing` : '')

/** a game's card (the signs in the city, and the Pizza Rat, open this) */
export async function openGameCard(g: MpGameId) {
  const def = MP_GAMES[g]
  const card = gameCard({
    art: def.art,
    place: esc(def.place),
    title: esc(def.title),
    tagline: HOW[g].tagline,
    players: players(def.players),
    tiles: HOW[g].tiles(),
    primary: {
      label: 'Quick Match',
      sub: 'Play now with whoever’s around',
      icon: 'joystick',
      act: () => {
        if (!canPlay()) return
        sfx.pop()
        closeOverlay()
        quickMatch(g)
      },
    },
    secondary: {
      label: 'Create Lobby',
      sub: 'Get a code for your friends',
      icon: 'friends',
      act: () => {
        if (!canPlay()) return
        sfx.click()
        closeOverlay()
        createLobby(g)
      },
    },
    board: () => openBoard(g),
  })
  openOverlay(card.el)
  const hub = await fetchHub()
  const h = hub?.games[g]
  if (!card.el.isConnected || !h) return
  card.live(liveChip(h))
}
