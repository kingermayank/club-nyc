/** Small deterministic helpers so the "city" is the same for everyone on a given day/week. */

export function hash(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  h = Math.imul(h ^ (h >>> 15), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}

/** mulberry32 PRNG seeded from a string */
export function rng(seed: string): () => number {
  let a = hash(seed)
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const pickWith = <T>(r: () => number, a: T[]): T => a[Math.floor(r() * a.length)]

/** ISO-ish week id, e.g. "2026-W42". Leaderboards and team standings reset weekly. */
export function weekId(d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  const w = Math.ceil(((t.getTime() - y0.getTime()) / 86400000 + 1) / 7)
  return `${t.getUTCFullYear()}-W${String(w).padStart(2, '0')}`
}

export function prevWeekId(d = new Date()): string {
  return weekId(new Date(d.getTime() - 7 * 86400000))
}

/** 0 (Monday) … 6 (Sunday) */
export const weekday = (d = new Date()) => ((d.getDay() + 6) % 7)

/** milliseconds until the weekly reset (Monday 00:00 local) */
export function msToReset(d = new Date()): number {
  const next = new Date(d)
  next.setHours(0, 0, 0, 0)
  next.setDate(next.getDate() + (7 - weekday(d)))
  return next.getTime() - d.getTime()
}
