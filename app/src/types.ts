import type { Pt } from './geometry'
import type { BinocularView } from './features/binoculars'
import type { EARN } from './data/economy'

/** Every way to earn coins. 'job' is paid by the server when a shift is validated; the rest are claims with caps. */
export type EarnReason = keyof typeof EARN | 'job'

export interface Choice<T = string> {
  label: string
  value: T
  note?: string
}

/** What clicking a thing in a room does. Keyed by the object/zone id from the room's geo file. */
export interface ObjDef {
  label: string
  /** walk to a room. `room` id; you arrive next to whatever links back. */
  go?: string
  act?: (g: Game) => void
  /** fire without walking over first (things you look at from afar) */
  instant?: boolean
  /** under construction */
  soon?: boolean
  /** clicking it sits you on the nearest seat */
  sit?: boolean
  /** not interactive, just occludes/decor */
  decor?: boolean
}

export interface RoomDef {
  id: string
  name: string
  area: string
  /** background image in /art/rooms/<bg>.jpg */
  bg: string
  /** geo file id in src/data/geo (defaults to id) */
  geo?: string
  objects: Record<string, ObjDef>
  zones?: Record<string, ObjDef>
  /** ambient NPCs */
  npcs?: number
  /** neighborhood used by the map's "you are here" pin */
  mapSpot?: string
  indoor?: boolean
  onEnter?: (g: Game) => void
  /** steam vents etc. */
  steam?: Pt[]
  /** object id whose center vents steam (manholes) */
  steamFrom?: string
  /** extra lines NPCs say here */
  chatter?: string[]
}

export interface Game {
  goto(room: string, from?: string): void
  say(text: string, ms?: number): void
  toast(text: string, icon?: string): void
  /** `reason` is how the server knows what this payment is for (see data/economy.ts); `ref` dedupes it */
  earn(n: number, why: string | undefined, reason: EarnReason, ref?: string | number): void
  /** a small purchase you don't keep (a soda, a ticket, furniture) */
  spend(n: number, reason: string): boolean
  /** buy clothing or a treat you hold — online, the server checks the price and adds it to your wardrobe */
  buy(item: string): Promise<boolean>
  stamp(id: string): void
  give(item: string): void
  owns(item: string): boolean
  wear(item: string): void
  choose<T>(title: string, body: string, options: Choice<T>[], art?: string): Promise<T | null>
  info(title: string, body: string, art?: string): void
  openMap(): void
  openSubway(): void
  newspaper(): void
  catalog(shop: string, section?: string): void
  playGame(id: string): void
  binoculars(view: BinocularView): void
  confetti(n?: number): void
  emote(pose: 'dance' | 'wave' | 'cheer' | 'jump', seconds?: number): void
  watchShow(): void
  ferry(): void
  furniture(): void
  sfx: typeof import('./audio').sfx
  /** short-lived per-session memory */
  flags: Record<string, number>
  room: RoomDef
}
