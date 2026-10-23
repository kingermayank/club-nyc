/**
 * The multiplayer mini-games' client state and wire: what lobby you're in, the match on screen, the last results,
 * and a tiny event bus over the city's one WebSocket (net/socket.ts). Views and games subscribe with `onMp`.
 */
import { sock } from '../net/socket'
import { link } from '../net/link'
import type { LobbyWire, MatchWire, MpC2S, MpS2C, ResultsWire } from './shared/protocol'

type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never
export type MpMsg = DistOmit<MpC2S, 't'>

export const mpStore = {
  lobby: null as LobbyWire | null,
  match: null as MatchWire | null,
  results: null as ResultsWire | null,
}

export function send(m: MpMsg) {
  sock.send({ t: 'mp', ...m } as MpC2S)
}
export const connected = () => sock.connected && link.online

const subs = new Set<(e: MpS2C) => void>()
/** every `{ t: 'mp' }` message from the server; returns an unsubscribe */
export function onMp(f: (e: MpS2C) => void): () => void {
  subs.add(f)
  return () => subs.delete(f)
}
sock.on((e) => {
  if (e.t !== 'mp') return
  for (const f of [...subs]) {
    try {
      f(e)
    } catch (err) {
      console.error('[mp] handler', e.k, err)
    }
  }
})

export const me = () => link.me
export const inLobby = () => !!mpStore.lobby
/** am I seated (not just watching) in the current lobby */
export const seated = () => !!mpStore.lobby?.seats.some((s) => s.i === link.me)
export const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
