/**
 * Multiplayer mini-games: boot (imported once by game.ts, alongside the other room features).
 *
 * - the conductor (controller.ts) listens for lobby / match / results messages from the moment the city loads
 * - the signs in Central Park, the subway and the 99¢ Slice (spots.ts) register with the world
 * - a shared link (/play?lobby=K7QX, pasted in a Discord or a group chat) drops you into that lobby as soon as
 *   you're in the city (it survives signing in and making a New Yorker)
 * - stamps for firsts and big moments, from the server's results
 */
import { onMp, mpStore, connected } from './store'
import { startController, joinCode, anyMpScreen } from './controller'
import { validCode } from './shared/games'
import { RUN } from './shared/runner'
import { link } from '../net/link'
import { save } from '../state'
import { toast } from '../engine/ui'
import './spots'

const KEY = 'club-nyc:lobby'

/** /play?lobby=CODE: remember the code (signing in can take a round trip through Google or Discord) */
function captureLobbyLink() {
  const q = new URLSearchParams(location.search)
  const code = (q.get('lobby') ?? '').trim().toUpperCase()
  if (!code) return
  if (validCode(code)) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }))
    } catch {
      /* private mode: we still try below while this page is open */
    }
    pending = code
  }
  q.delete('lobby')
  const rest = q.toString()
  history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : ''))
}
let pending: string | null = null
function pendingLobby(): string | null {
  if (pending) return pending
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { code?: string; at?: number } | null
    // a lobby link is good for a couple of hours
    if (v?.code && v.at && Date.now() - v.at < 2 * 3600_000) return v.code
  } catch {
    /* ignore */
  }
  return null
}
function clearPending() {
  pending = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

/** join the linked lobby once you're actually standing in the city, online */
function watchForCity() {
  let tries = 0
  const id = window.setInterval(() => {
    const code = pendingLobby()
    if (!code) return clearInterval(id)
    if (++tries > 600) return clearInterval(id)
    // in the city: signed in, a New Yorker made, connected, nothing else full-screen in the way
    if (!link.account || !save.created || !connected()) return
    if (document.querySelector('.creator, .game-shell, .signin') || anyMpScreen()) return
    clearInterval(id)
    clearPending()
    toast(`Joining game <b>${code}</b>…`, '🎮')
    joinCode(code)
  }, 500)
}

/** stamps for firsts and big moments (the stamp book shows them; each is worth XP once) */
function stamps() {
  onMp((e) => {
    if (e.k !== 'res') return
    const r = e.r
    const you = r.you
    const mine = r.rows.find((x) => x.i === link.me)
    if (!you || you.void || !mine) return
    const give: string[] = ['mp-first']
    if (r.g === 'sled' && !mine.dnf) give.push('sled-race')
    if (r.g === 'runner') give.push('runner-first')
    if (r.g === 'carbs') give.push('carbs-first')
    if (mine.won && r.humans >= 2) {
      give.push('mp-win')
      if (r.g === 'sled') give.push('sled-win')
    }
    if (r.g === 'runner' && mine.score >= RUN.length) give.push('runner-ferry')
    if (r.g === 'carbs' && mine.score >= 3) give.push('carbs-streak')
    if (r.humans >= 4) give.push('mp-crew')
    void import('../game').then((m) => give.forEach((id, k) => setTimeout(() => m.api.stamp(id), 900 + k * 700)))
  })
}

captureLobbyLink()
startController()
stamps()
watchForCity()
// dev: the QA scripts look at the client's view of the games through this
if (import.meta.env.DEV) Object.assign(window as unknown as Record<string, unknown>, { clubNycMp: mpStore })
