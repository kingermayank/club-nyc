/** iFruit types and rules shared by the game and the server (server/src/phone.ts). No DOM imports here. */
import type { LookWire } from '../../net/protocol'

/** coins between friends (server-enforced) */
export const BANK_RULES = {
  maxPerTransfer: 100,
  sendPerDay: 150,
  receivePerDay: 200,
  requestDays: 3,
  /** an account has to be a day old before it can send coins (no funnelling starting coins out of throwaways) */
  minAccountAgeMs: 24 * 3600_000,
} as const

/** a photo, as the game draws it: the room's painting, a crop of it, and the people in it (stage units) */
export interface PhotoRecipe {
  room: string
  bg: string
  crop: { x: number; y: number; w: number; h: number }
  people: { look: LookWire; x: number; y: number; s: number; d?: number; blur?: boolean }[]
  title: string
  at: number
  /** a camera filter (drawn into the photo wherever it's shown, so a friend sees it too) */
  fx?: PhotoFx
}

/**
 * Camera filters, made of the same five steps as CSS filters (so the live viewfinder, which uses CSS, and the saved
 * photo, which is drawn pixel by pixel, look the same).
 */
export type PhotoFx = 'none' | 'sepia' | 'mono' | 'vivid' | 'noir' | 'fade'
export type FxStep = ['grayscale' | 'sepia' | 'saturate' | 'contrast' | 'brightness', number]
export const PHOTO_FX: { id: PhotoFx; name: string; steps: FxStep[] }[] = [
  { id: 'none', name: 'Original', steps: [] },
  { id: 'sepia', name: 'Sepia', steps: [['sepia', 0.85], ['contrast', 1.05]] },
  { id: 'mono', name: 'B&W', steps: [['grayscale', 1]] },
  { id: 'vivid', name: 'Vivid', steps: [['saturate', 1.55], ['contrast', 1.08]] },
  { id: 'noir', name: 'Noir', steps: [['grayscale', 1], ['contrast', 1.45], ['brightness', 0.92]] },
  { id: 'fade', name: 'Fade', steps: [['saturate', 0.65], ['contrast', 0.82], ['brightness', 1.08]] },
]
export const fxCss = (fx?: PhotoFx) => PHOTO_FX.find((f) => f.id === fx)?.steps.map(([k, v]) => `${k}(${v})`).join(' ') || 'none'

export type DmKind = 'text' | 'photo' | 'place' | 'pay' | 'request' | 'call' | 'sys'
export interface DmMessage {
  id: number
  th: string
  /** user id, '' for system lines */
  from: string
  kind: DmKind
  text: string
  meta?: { amount?: number; transfer?: number; status?: string; room?: string; name?: string; missed?: boolean; secs?: number } & Partial<PhotoRecipe>
  at: number
}
export interface DmPerson {
  id: string
  name: string
  look: LookWire | null
  title?: string
  team?: string
  xp?: number
  online: boolean
  room: string | null
}
export interface DmThread {
  id: string
  kind: 'dm' | 'group'
  name: string
  people: DmPerson[]
  last: DmMessage | null
  unread: number
  at: number
  mine?: boolean
}

/** voice calls: ring, answer, decline, end, busy, and 'sig' (the WebRTC offer / answer / network candidates) */
export type CallKind = 'ring' | 'answer' | 'decline' | 'end' | 'busy' | 'sig'
