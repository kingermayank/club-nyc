/** A tiny seeded PRNG (mulberry32), the same in every browser and on the server: one seed, one course. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** a stable 32-bit hash of a string (sub-seeds: "course", "bot:2"…) */
export function hash32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  h = Math.imul(h ^ (h >>> 15), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}

export const pickOf = <T>(r: () => number, a: readonly T[]): T => a[Math.floor(r() * a.length)]
export const between = (r: () => number, lo: number, hi: number) => lo + r() * (hi - lo)
