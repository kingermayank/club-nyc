import type { LookWire } from '../../../../app/src/net/protocol.ts'
import type { MpGameId, MpMode, MpTeam } from '../../../../app/src/mp/shared/games.ts'
import type { MatchWire, MpC2S, MpS2C, ResultRow } from '../../../../app/src/mp/shared/protocol.ts'

/** Someone with a seat at a lobby (city locals are only added when a match starts). */
export interface Seat {
  id: string
  name: string
  look: LookWire
  ready: boolean
  /** still on the results screen: sits out the next round until they press Play Again */
  away: boolean
  online: boolean
  offAt: number
  /** when they went away (results screen), so a seat nobody comes back to is given up */
  awayAt: number
  team: MpTeam
  joinedAt: number
}

export interface Lobby {
  code: string
  game: MpGameId
  room: string
  host: string
  priv: boolean
  /** made by Quick Match: starts on its own once people are in */
  quick: boolean
  mode: MpMode
  bots: boolean
  seats: Seat[]
  /** watching, and whether they want a seat for the next round */
  spectators: Map<string, { name: string; wants: boolean }>
  state: 'open' | 'playing'
  match: Match | null
  createdAt: number
  activeAt: number
  /** when the next round starts on its own (0: not counting down) */
  autoAt: number
  kicked: Map<string, number>
  /** Carb-Jitsu: who holds the table, and their streak */
  champ: { id: string; n: number } | null
}

/** One player's line in a finished match. */
export interface Standing {
  id: string
  name: string
  look: LookWire
  bot: boolean
  place: number
  score: number
  team?: MpTeam
  won: boolean
  /** raced but didn't finish in time (still counts, still pays a little) */
  dnf: boolean
  /** left before the end (no row, no prize) */
  left: boolean
  /** the server didn't believe their numbers (no row, no prize) */
  void: boolean
  stat?: string
}

export interface MatchEnd {
  standings: Standing[]
  teams?: { up: number; down: number; win: MpTeam }
  data: Record<string, unknown>
}

/** A running match: a race or a Carb-Jitsu duel. The lobby manager drives it; it reports back through `end`. */
export interface Match {
  id: string
  game: MpGameId
  mode: MpMode
  startedAt: number
  /** user ids of the humans playing (not spectators) */
  humans: string[]
  ended: boolean
  /** the "start" message for someone (a player, a spectator, or a player coming back) */
  wire(userId: string): MatchWire
  /** a player's input */
  input(userId: string, msg: MpC2S): void
  /** ~10 times a second */
  tick(now: number): void
  /** a player left the lobby mid-match (or was gone too long) */
  leave(userId: string): void
  /** a player's connection dropped or came back */
  online(userId: string, on: boolean): void
  /** everything the match sends after the start (Carb-Jitsu resends its state to someone coming back) */
  resync?(userId: string): void
}

export interface MatchHost {
  /** everyone who should see the match: players and spectators */
  audience(): string[]
  send(userId: string, evt: MpS2C): void
  broadcast(evt: MpS2C): void
  end(result: MatchEnd): void
}

export type { ResultRow }
