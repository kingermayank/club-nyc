/**
 * The multiplayer mini-game messages, shared by the game and the server. They ride the city's one WebSocket as
 * `{ t: 'mp', k: … }` (app/src/net/protocol.ts adds them to C2S / S2C; server/src/game/realtime.ts hands them to
 * server/src/game/mp).
 *
 * Races (sled, runner) are latency tolerant: everyone gets the same seeded course, each browser simulates its own
 * racer and sends compact progress ~10 times a second; the server checks it against what's physically possible,
 * rebroadcasts everyone as "ghosts" and decides the finish order. Carb-Jitsu is turn based and fully run by the server.
 */
import type { LookWire } from '../../net/protocol'
import type { MpGameId, MpMode, MpTeam } from './games'

// ---------- lobbies ----------
export interface SeatWire {
  i: string
  n: string
  l: LookWire
  /** ready for the next round */
  r?: 1
  /** away: still on the results screen (sits out the next round until Play Again) */
  a?: 1
  /** offline for a moment (reconnecting) */
  o?: 1
  tm?: MpTeam
}
export interface LobbyWire {
  code: string
  g: MpGameId
  /** the room it was opened from ("Pilgrim Hill, Central Park"), for invites */
  room: string
  host: string
  st: 'open' | 'playing'
  mode: MpMode
  /** fill empty seats with city locals */
  bots: boolean
  /** invite only (not offered to Quick Match) */
  priv: boolean
  seats: SeatWire[]
  spec: { i: string; n: string }[]
  /** seats at this table */
  max: number
  /** ms until the round starts on its own (0: not counting down) */
  auto: number
  /** Carb-Jitsu: who holds the table and their streak, and who's up next */
  champ?: { i: string; n: string; s: number }
  next?: string[]
}

// ---------- matches ----------
export interface RacerWire {
  i: string
  n: string
  l: LookWire
  /** a computer-run city local */
  bot?: 1
  tm?: MpTeam
}
export interface MatchWire {
  id: string
  g: MpGameId
  seed: number
  mode: MpMode
  /** ms until the race clock starts (the 3-2-1); negative when joining a race already under way */
  startIn: number
  players: RacerWire[]
  /** your slot, or -1 when watching */
  you: number
}
/** a racer as everyone else sees them: [slot, distance, lateral, speed, flags] */
export type GhostWire = [number, number, number, number, number]
/** ghost flags */
export const GF = { air: 1, crash: 2, boost: 4, slide: 8, out: 16, done: 32, draft: 64, magnet: 128 } as const

export type RaceEvent =
  | { k: 'fin'; i: number; place: number; tm: number }
  | { k: 'out'; i: number; d: number }
  | { k: 'left'; i: number }
  | { k: 'back'; i: number }
  /** Rush Hour Run: someone who's out sends a Showtime dancer into a lane ahead of `to` (it's always dodgeable) */
  | { k: 'drop'; from: number; to: number; lane: number; d: number }
  /** the race ends in `ms` (someone finished; the rest have a moment to get down the hill) */
  | { k: 'end'; ms: number }

// ---------- Carb-Jitsu ----------
/** 0 pizza · 1 pretzel · 2 bagel; pizza beats pretzel beats bagel beats pizza */
export type Element = 0 | 1 | 2
export interface CardWire {
  e: Element
  /** power, 2..12 */
  p: number
  /** borough 0..4 (the card's colour) */
  c: number
  /** a special card (only counts if it wins): 'low' next round the lower number wins · 'hike' the other player's
   * next card is worth 3 less · 'tow' tows one of their tray cards from this card's borough */
  fx?: 'low' | 'hike' | 'tow'
}
export interface DuelWire {
  r: number
  ph: 'pick' | 'reveal' | 'over'
  /** ms left in this phase */
  left: number
  /** your hand (players only) */
  hand?: CardWire[]
  /** who has picked this round */
  picked: [boolean, boolean]
  /** which of your cards you picked */
  mine?: number
  /** both cards, face up (reveal and over) */
  rev?: [CardWire, CardWire]
  /** the round's winner (-1 a tie) */
  win?: -1 | 0 | 1
  trays: [CardWire[], CardWire[]]
  /** rules in force this round */
  fx?: { low?: 1; hike?: [number, number] }
  /** match over: who won, and the winning set (indices in their tray) */
  winner?: 0 | 1
  set?: number[]
  /** why the match ended early */
  why?: 'forfeit' | 'left'
}

// ---------- results ----------
export interface ResultRow {
  i: string
  n: string
  l: LookWire
  bot?: 1
  place: number
  /** the game's score: sled ms (0 = didn't finish), runner metres, Carb-Jitsu streak */
  score: number
  tm?: MpTeam
  won?: 1
  dnf?: 1
  /** a stat line ("12 MetroCards", "2 jumps") */
  stat?: string
}
export interface ResultsWire {
  id: string
  g: MpGameId
  mode: MpMode
  rows: ResultRow[]
  humans: number
  /** ms the match took */
  dur: number
  teams?: { up: number; down: number; win: MpTeam }
  /** just for you */
  you?: {
    place: number
    xp: number
    coins: number
    /** a new personal best this week / ever */
    best?: 'week' | 'all'
    weekRank: number
    weekWins: number
    /** today's prize ceiling reached */
    capped?: 1
    level?: number
    up?: 1
    /** didn't count (left early, or the run didn't add up) */
    void?: 1
  }
}

// ---------- the wire ----------
export type MpC2S =
  | { t: 'mp'; k: 'quick'; g: MpGameId }
  | { t: 'mp'; k: 'create'; g: MpGameId; priv?: boolean }
  | { t: 'mp'; k: 'join'; code: string }
  | { t: 'mp'; k: 'leave' }
  | { t: 'mp'; k: 'ready'; on: boolean }
  | { t: 'mp'; k: 'start' }
  | { t: 'mp'; k: 'set'; mode?: MpMode; bots?: boolean; priv?: boolean }
  | { t: 'mp'; k: 'team'; tm: MpTeam }
  | { t: 'mp'; k: 'kick'; i: string }
  | { t: 'mp'; k: 'inv'; i: string }
  | { t: 'mp'; k: 're'; e: number }
  | { t: 'mp'; k: 'say'; p: number }
  | { t: 'mp'; k: 'again' }
  | { t: 'mp'; k: 'sync' }
  | { t: 'mp'; k: 'pr'; d: number; x: number; v: number; f: number; tm: number; c?: number }
  | { t: 'mp'; k: 'fin'; tm: number }
  | { t: 'mp'; k: 'out'; d: number; tm: number }
  | { t: 'mp'; k: 'drop'; lane: number; to: number }
  | { t: 'mp'; k: 'pick'; c: number }

export type MpS2C =
  | { t: 'mp'; k: 'lobby'; l: LobbyWire }
  | { t: 'mp'; k: 'left'; why: 'left' | 'kicked' | 'closed' }
  | { t: 'mp'; k: 'start'; m: MatchWire }
  | { t: 'mp'; k: 'gh'; tm: number; p: GhostWire[] }
  | { t: 'mp'; k: 'ev'; e: RaceEvent }
  | { t: 'mp'; k: 'cj'; s: DuelWire }
  | { t: 'mp'; k: 'res'; r: ResultsWire }
  | { t: 'mp'; k: 'inv'; code: string; g: MpGameId; from: string; fi: string; room: string }
  | { t: 'mp'; k: 're'; i: string; e: number }
  | { t: 'mp'; k: 'say'; i: string; p: number }
  | { t: 'mp'; k: 'err'; m: string }
