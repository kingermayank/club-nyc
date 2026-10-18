import { ITEM } from '../../../app/src/avatar/items.ts'
import { HAIR_STYLES, SKINS, HAIR_COLORS, SIG_COLORS } from '../../../app/src/avatar/look.ts'
import type { LookWire } from '../../../app/src/net/protocol.ts'

/**
 * Server-side sanity rules. Scores are submitted by the client, so every game gets a run token,
 * a minimum play time and a plausible ceiling that scales with time played.
 */
export const GAMES: Record<string, { minSeconds: number; maxPerMinute: number; hardMax: number; maxCoins: number }> = {
  'slice-factory': { minSeconds: 25, maxPerMinute: 14, hardMax: 30, maxCoins: 160 },
  'halal-rush': { minSeconds: 30, maxPerMinute: 12, hardMax: 40, maxCoins: 120 },
  'ferry-captain': { minSeconds: 20, maxPerMinute: 60, hardMax: 120, maxCoins: 160 },
  'bagel-counters': { minSeconds: 25, maxPerMinute: 60, hardMax: 140, maxCoins: 220 },
  showtime: { minSeconds: 30, maxPerMinute: 60000, hardMax: 90000, maxCoins: 60 },
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
  return { skin, hair, hairColor, ...sig, items }
}

/** Names: 2–14 chars, letters, numbers and _ . Shown to everyone, so they go through the filter too. */
export function nameProblem(name: string): string | null {
  if (name.length < 2 || name.length > 14) return 'Names are 2–14 characters.'
  if (!/^[A-Za-z0-9_]+$/.test(name)) return 'Letters, numbers and _ only.'
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
