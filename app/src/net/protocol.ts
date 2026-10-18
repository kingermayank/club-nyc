/**
 * Club NYC realtime protocol — shared by the browser client and the game server.
 *
 * Design (Club Penguin–style): clients send *intents* ("walk to x,y", "say hi"), never per-frame
 * positions. Every client animates walks locally with the same nav grid, so a room of 60 people
 * costs a few events per second instead of a constant position stream.
 * The server batches outgoing events per room instance every tick (~15 Hz) and sends ONE JSON
 * string to everyone in that instance.
 */

export interface LookWire {
  skin: number
  hair: string
  hairColor: number
  color?: number
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
export const HOME_ROOM_IDS = ['apartment', 'loft', 'penthouse'] as const

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
  | { t: 'n'; k: 'gb' | 'like' | 'ref' | 'refpaid'; i: string; n: string; m?: string; c?: number } // guestbook note / like / a friend joined through your invite / you were paid for it
  | { t: '$'; c: number; why?: string; owned?: string[]; homes?: string[] } // your wallet changed on the server
  | { t: 'ann'; m: string } // an announcement from the Club NYC team
  | { t: 'mod'; k: 'warn' | 'mute' | 'unmute'; m: string; until?: number } // a moderator (or the auto-moderator) acted on your account
  | { t: 'party'; p: PartyWire | null } // the party in this room started, changed or ended
  | { t: 'inv'; i: string; n: string; r: string; pub: boolean } // a friend is throwing a party
  | { t: 'o'; n: number } // how many people are in the city (sent when it changes, at most every 2 s)
  | { t: 'pong'; c: number }
  | { t: 'sys'; m: string } // system message (warnings, mute notices)
  | { t: 'kick'; m: string; k?: 'replaced' | 'banned' | 'deleted' | 'maintenance' }

export const POSES = ['idle', 'dance', 'wave', 'cheer', 'jump', 'sit', 'skate'] as const
export const EMOTES = ['😀', '😂', '😍', '😎', '😮', '😢', '😡', '🍕', '🗽', '❤️', '🚕', '☕', '🎉', '👍', '💡', '👋', '🕺', '🎃', '❄️', '🐦']
export const CHAT_MAX = 120
export const ROOM_W = 1000
export const ROOM_H = 565
