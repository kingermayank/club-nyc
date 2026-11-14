/**
 * Club NYC realtime protocol — shared by the browser client and the game server.
 *
 * Design (Club Penguin–style): clients send *intents* ("walk to x,y", "say hi"), never per-frame
 * positions. Every client animates walks locally with the same nav grid, so a room of 60 people
 * costs a few events per second instead of a constant position stream.
 * The server batches outgoing events per room instance every tick (~15 Hz) and sends ONE JSON
 * string to everyone in that instance.
 */
// multiplayer mini-games ({ t: 'mp', k: … }): their own messages, see app/src/mp/shared/protocol.ts
import type { MpC2S, MpS2C } from '../mp/shared/protocol'
import type { DmMessage, CallKind } from '../features/ifruit/wire'

export interface LookWire {
  skin: number
  hair: string
  hairColor: number
  color?: number
  shape?: number
  eyes?: number
  brows?: number
  nose?: number
  beard?: number
  specs?: number
  freckles?: number
  lashes?: number
  items: Record<string, string>
}

/** A player as other players see them. */
export interface PlayerWire {
  i: string // user id
  n: string // name
  l: LookWire
  t: string // team id
  ti: string // title (stamp id)
  x: number
  y: number
  p: string // pose
  s: string | null // seat id
}

/** A house party: whose, what's playing (and since when, so everyone hears the same bar), the decor. */
export interface PartyWire {
  h: string // host id
  n: string // host name
  track: string
  theme: string
  since: number
  pub: boolean
}
export const PARTY_THEMES = ['glow', 'disco', 'spooky', 'bodega'] as const
export const HOME_ROOM_IDS = ['apartment', 'loft', 'penthouse', 'brownstone', 'sky-residence'] as const

// ---------- client -> server ----------
export type C2S =
  | { t: 'j'; r: string; x: number; y: number; o?: string } // join room (o = apartment owner)
  | { t: 'm'; x: number; y: number } // walk to
  | { t: 's'; m: string } // say (chat)
  | { t: 'e'; e: string } // emote bubble
  | { t: 'p'; p: string } // pose (dance, wave, …)
  | { t: 'st'; s: string | null } // sit / stand
  | { t: 'l'; l: LookWire } // outfit changed
  | { t: 'sb'; x: number; y: number } // snowball
  | { t: 'tag'; ti: string; tm: string } // title / team changed
  | { t: 'party'; on: boolean; track?: string; theme?: string; pub?: boolean } // host a party at home (or change the music)
  | { t: 'ping'; c: number }
  | { t: 'txt'; i: string; k: TextKind } // a preset text to a friend from your phone ("Meet me here!")
  | { t: 'call'; k: CallKind; i: string; c: string; d?: string } // iFruit Phone: ring / answer / decline / end a voice call, or 'sig' (WebRTC details in d)
  | MpC2S // multiplayer mini-games: lobbies, races, Carb-Jitsu

// ---------- server -> client ----------
export type S2C =
  | { t: 'w'; me: string; r: string; k: string; inst: number; players: PlayerWire[]; online: number; party?: PartyWire } // welcome to a room
  | { t: '+'; p: PlayerWire }
  | { t: '-'; i: string }
  | { t: 'm'; i: string; x: number; y: number }
  | { t: 's'; i: string; m: string }
  | { t: 'e'; i: string; e: string }
  | { t: 'p'; i: string; p: string }
  | { t: 'st'; i: string; s: string | null }
  | { t: 'l'; i: string; l: LookWire }
  | { t: 'sb'; i: string; x: number; y: number }
  | { t: 'tag'; i: string; ti: string; tm: string }
  | { t: 'f'; i: string; n: string; on: boolean; r: string | null } // a friend came online / moved / left
  | { t: 'fr'; i: string; n: string } // friend request received
  | { t: 'fa'; i: string; n: string } // friend request accepted
  | { t: 'fx'; i: string } // a friendship or request with this person ended (declined, cancelled, unfriended)
  | { t: 'n'; k: 'gb' | 'like' | 'ref' | 'refpaid' | 'nyc'; i: string; n: string; m?: string; c?: number } // guestbook / apartment like / invite / invite paid / NYCgram pizza-like
  | { t: '$'; c: number; why?: string; owned?: string[]; homes?: string[] } // your wallet changed on the server
  | { t: 'xp'; x: number; g: number; why?: string; lv: number; up?: boolean; b?: number } // you earned XP (x: new total, g: gained, lv: level, up: a new level, b: its coin bonus)
  | { t: 'ann'; m: string } // an announcement from the Club NYC team
  | { t: 'mod'; k: 'warn' | 'mute' | 'unmute'; m: string; until?: number } // a moderator (or the auto-moderator) acted on your account
  | { t: 'party'; p: PartyWire | null } // the party in this room started, changed or ended
  | { t: 'inv'; i: string; n: string; r: string; pub: boolean } // a friend is throwing a party
  | { t: 'o'; n: number } // how many people are in the city (sent when it changes, at most every 2 s)
  | { t: 'pong'; c: number }
  | { t: 'sys'; m: string } // system message (warnings, mute notices)
  | { t: 'txtr'; i: string; k: TextKind; ok: boolean; why?: 'offline' | 'too-soon' | 'not-friends' } // what became of the text you just sent
  | { t: 'txt'; i: string; n: string; k: TextKind; r: string | null } // a friend texted you (r: the room they're in)
  | { t: 'kick'; m: string; k?: 'replaced' | 'banned' | 'deleted' | 'maintenance' }
  | { t: 'dm'; m: DmMessage; n: string } // iFruit Messages: a new message in one of your threads (n: the sender's name)
  | { t: 'payreq'; id: number; i: string; n: string; a: number; note: string } // a friend asked you for coins
  | { t: 'call'; k: CallKind; i: string; n: string; c: string; d?: string; r?: string | null; look?: LookWire } // a voice call from / to a friend
  | MpS2C // multiplayer mini-games: lobbies, races, Carb-Jitsu

/** what your phone can text a friend: presets only (no free text to moderate) */
export const TEXT_KINDS = ['meet', 'hi', 'game', 'home', 'party'] as const
export type TextKind = (typeof TEXT_KINDS)[number]

export const POSES = ['idle', 'dance', 'wave', 'cheer', 'jump', 'sit', 'skate'] as const
export const EMOTES = ['😀', '😂', '😍', '😎', '😮', '😢', '😡', '🍕', '🗽', '❤️', '🚕', '☕', '🎉', '👍', '💡', '👋', '🕺', '🎃', '❄️', '🐦']
export const CHAT_MAX = 120
export const ROOM_W = 1000
export const ROOM_H = 565
