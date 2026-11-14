import { ITEM } from '../../../app/src/avatar/items.ts'
import { HAIR_STYLES, SKINS, HAIR_COLORS, SIG_COLORS, FACE_FIELDS, type FaceField } from '../../../app/src/avatar/look.ts'
import type { LookWire } from '../../../app/src/net/protocol.ts'
import { cleanName } from './filter.ts'

/**
 * Server-side sanity rules. Scores are submitted by the client, so every game gets a run token,
 * a minimum play time and a plausible ceiling that scales with time played.
 */
export const GAMES: Record<string, { minSeconds: number; maxPerMinute: number; hardMax: number; maxCoins: number }> = {
  'slice-factory': { minSeconds: 25, maxPerMinute: 14, hardMax: 30, maxCoins: 160 },
  'halal-rush': { minSeconds: 30, maxPerMinute: 12, hardMax: 40, maxCoins: 120 },
  'ferry-captain': { minSeconds: 20, maxPerMinute: 60, hardMax: 120, maxCoins: 160 },
  'bagel-counters': { minSeconds: 25, maxPerMinute: 60, hardMax: 140, maxCoins: 220 },
  // Hard is 250 notes in an 83-second song: a perfect run with the full ×4 combo is 91,800 (from buildChart)
  showtime: { minSeconds: 30, maxPerMinute: 70000, hardMax: 92000, maxCoins: 60 },
}

export const TEAMS = ['downtown', 'midtown', 'uptown', 'harbor']

export function validLook(l: unknown): LookWire | null {
  if (!l || typeof l !== 'object') return null
  const o = l as Record<string, unknown>
  const skin = Number(o.skin)
  const hairColor = Number(o.hairColor)
  const hair = String(o.hair)
  if (!Number.isInteger(skin) || skin < 0 || skin >= SKINS.length) return null
  if (!Number.isInteger(hairColor) || hairColor < 0 || hairColor >= HAIR_COLORS.length) return null
  if (!(HAIR_STYLES as readonly string[]).includes(hair)) return null
  const items: Record<string, string> = {}
  const raw = (o.items ?? {}) as Record<string, unknown>
  for (const [slot, id] of Object.entries(raw)) {
    if (typeof id !== 'string') continue
    const def = ITEM[id]
    if (def && def.slot === slot) items[slot] = id
  }
  const color = Number(o.color)
  const sig = Number.isInteger(color) && color >= 0 && color < SIG_COLORS.length ? { color } : {}
  // the face: each field is an index into its list; anything else is dropped (the classic face is drawn)
  const face: Partial<Record<FaceField, number>> = {}
  for (const [k, n] of Object.entries(FACE_FIELDS) as [FaceField, number][]) {
    const v = Number(o[k])
    if (o[k] != null && Number.isInteger(v) && v >= 0 && v < n) face[k] = v
  }
  return { skin, hair, hairColor, ...sig, ...face, items }
}

/**
 * Names nobody can claim: the team and anything that reads as staff, and the city's own locals.
 * RESIDENT_NAMES mirrors NAMES in app/src/social/residents.ts (scripts/economy-test.ts checks the two stay the same).
 */
export const RESIDENT_NAMES = [
  'BagelQueen', 'SubwaySam', 'PizzaRatFan', 'BrooklynBree', 'TaxiTony', 'Halal4Life', 'SohoSofia', 'MetMuseMo',
  'DollarSliceDev', 'BodegaBobby', 'ParkSlopePat', 'Liberty_Lu', 'HarlemHank', 'NolitaNat', 'FerryFrankie',
  'CoffeeCarla', 'BroadwayBen', 'ChinatownChen', 'HighLineHaz', 'GothamGabi', 'UWS_Uma', 'ConeyKai',
  'ExpressTrainEd', 'RooftopRiya', 'MetroCardMika', 'BigAppleAbby', 'StoopSitterSal', 'LoxAndLatte', 'CannoliCam',
  'DumplingDee', 'SkylineSkye', 'WaterTowerWes', 'FireEscapeFi', 'YellowCabYuki', 'NightOwlNico', 'KnishKing',
  'EggCreamEmma', 'SteamVentSteve', 'PretzelPriya', 'GelatoGio', 'SneakerheadZo', 'ThreadCountTess', 'RinkRatRory',
  'OperaOlive', 'JazzCatJules', 'BikeLaneBo', 'PigeonPete', 'ShowtimeShay', 'TimesSqTina', 'CabCallerCal',
  'HudsonHarper', 'DeliDanny', 'MuseumMaya', 'GalleryGus', 'ParadeParker', 'SliceSlinger', 'EspressoElla',
]
/** read a name the way a person would: no case, no _, digits as the letters they stand in for, no number on the end */
const plain = (name: string) =>
  name
    .toLowerCase()
    .replace(/\d+$/, '')
    .replace(/[013457]/g, (d) => ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't' })[d] ?? d)
    .replace(/[^a-z]/g, '')
/** taken as a whole name ("Rosa", "R0sa_", "Rosa2"; "Rosalind" is fine) */
const RESERVED = new Set(
  [...RESIDENT_NAMES, 'BullMarketBrad', 'Rosa', 'LouTheBusker', 'Mayank', 'MayankKinger', 'Guest', 'System', 'Server', 'Owner', 'Founder', 'Developer', 'Dev', 'Bot'].map(plain),
)
/** taken anywhere in a name ("ClubNYC_Help", "xModeratorx") */
const RESERVED_ANYWHERE = /clubnyc|clubnewyork|moderator|administrator|helpdesk/
/** taken as a word of a name ("Admin_Joe", "TheAdmin", "STAFF"; "Badminton" and "Modesto" are fine) */
const RESERVED_WORDS = new Set(['admin', 'admins', 'staff', 'mod', 'mods', 'official', 'support'])
export function reservedName(name: string): boolean {
  const p = plain(name)
  if (RESERVED.has(p) || RESERVED_ANYWHERE.test(p)) return true
  return name.split(/[_\d]+|(?<=[a-z])(?=[A-Z])/).some((w) => RESERVED_WORDS.has(plain(w)))
}

/** Names: 2–14 chars, letters, numbers and _ . Shown to everyone, so they go through the filter too, and can't pass for staff or a city local. */
export function nameProblem(name: string): string | null {
  if (name.length < 2 || name.length > 14) return 'Names are 2–14 characters.'
  if (!/^[A-Za-z0-9_]+$/.test(name)) return 'Letters, numbers and _ only.'
  if (!cleanName(name)) return 'Please pick a different name.'
  if (reservedName(name)) return 'That name is taken.'
  return null
}

/** ISO-ish week id ("2026-W42") — must match the client's social/rng.ts weekId. */
export function weekId(d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const w = Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(w).padStart(2, '0')}`
}
