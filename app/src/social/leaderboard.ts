import { save, persist } from '../state'
import { rng, weekId, weekday } from './rng'
import { RESIDENTS, RESIDENT, type Resident } from './residents'

/** Typical "great" score per game (calibrated from each game's scoring). */
export const BOARD_GAMES: { id: string; title: string; unit: string; scale: number; emoji: string }[] = [
  { id: 'slice-factory', title: 'Slice Factory', unit: 'pizzas', scale: 24, emoji: '🍕' },
  { id: 'halal-rush', title: 'Halal Rush', unit: 'served', scale: 16, emoji: '🥙' },
  { id: 'ferry-captain', title: 'Ferry Captain', unit: 'coins', scale: 55, emoji: '⛴️' },
  { id: 'bagel-counters', title: 'Bagel Counters', unit: 'delivered', scale: 70, emoji: '🥯' },
  { id: 'showtime', title: 'Showtime!', unit: 'points', scale: 38000, emoji: '🕺' },
]
export const BOARD = Object.fromEntries(BOARD_GAMES.map((g) => [g.id, g]))

export interface Row {
  id: string
  name: string
  score: number
  you?: boolean
  resident?: Resident
}

const myKey = (game: string, w = weekId()) => `wk:${w}:${game}`
const overrideKey = (game: string, res: string, w = weekId()) => `wkres:${w}:${game}:${res}`

export const myWeekly = (game: string) => save.stats[myKey(game)] ?? 0

/** Record a finished round. Returns your rank before and after. */
export function submit(game: string, score: number): { before: number; after: number; best: boolean } {
  const before = rankOf(game)
  const k = myKey(game)
  const best = score > (save.stats[k] ?? 0)
  if (best) {
    save.stats[k] = score
    persist()
  }
  return { before, after: rankOf(game), best }
}

function residentScore(r: Resident, game: string, w = weekId()): number {
  const g = BOARD[game]
  if (!g) return 0
  const o = save.stats[overrideKey(game, r.id, w)]
  const rr = rng(`${w}:${game}:${r.id}`)
  // not everyone plays every game every week; people join as the week goes on
  const startDay = Math.floor(rr() * 9) - 2
  if (startDay > weekday() && o === undefined) return 0
  const progress = 0.72 + 0.28 * Math.min(1, (weekday() + 1 - Math.max(0, startDay)) / 6)
  const base = g.scale * (0.22 + 0.78 * r.skill) * (0.8 + rr() * 0.35) * progress
  const s = g.scale >= 1000 ? Math.round(base / 50) * 50 : Math.round(base)
  return Math.max(o ?? 0, s)
}

export function board(game: string, friendsOnly = false): Row[] {
  const rows: Row[] = []
  for (const r of RESIDENTS) {
    if (friendsOnly && !save.friends.includes(r.id)) continue
    const s = residentScore(r, game)
    if (s > 0) rows.push({ id: r.id, name: r.name, score: s, resident: r })
  }
  const mine = myWeekly(game)
  if (mine > 0) rows.push({ id: 'you', name: save.name || 'You', score: mine, you: true })
  rows.sort((a, b) => b.score - a.score || (a.you ? -1 : 1))
  return rows
}

export function rankOf(game: string): number {
  const b = board(game)
  const i = b.findIndex((r) => r.you)
  return i < 0 ? 0 : i + 1
}

/** the person just above you (who to beat next) */
export function nextUp(game: string): Row | null {
  const b = board(game)
  const i = b.findIndex((r) => r.you)
  if (i <= 0) return i === 0 ? null : b[b.length - 1] ?? null
  return b[i - 1]
}

export const fmt = (game: string, n: number) => (BOARD[game]?.scale >= 1000 ? n.toLocaleString('en-US') : String(n))

// ---------- async challenges: "beat my score" ----------
export function challenge(resId: string, game: string) {
  const target = myWeekly(game)
  if (!target) return false
  save.challenges = save.challenges.filter((c) => !(c.id === resId && c.game === game && !c.done))
  save.challenges.push({ id: resId, game, target, due: Date.now() + (40 + Math.random() * 70) * 1000 })
  persist()
  return true
}

export interface ChallengeResult {
  resident: Resident
  game: string
  target: number
  theirs: number
  theyWon: boolean
}

/** Resolve challenges whose time has come (call periodically). */
export function resolveChallenges(now = Date.now()): ChallengeResult[] {
  const out: ChallengeResult[] = []
  for (const c of save.challenges) {
    if (c.done || c.due > now) continue
    const r = RESIDENT[c.id]
    const g = BOARD[c.game]
    if (!r || !g) {
      c.done = true
      continue
    }
    // better residents are likelier to beat you, but it's never hopeless either way
    const roll = Math.random()
    const theyWon = roll < 0.25 + r.skill * 0.45
    const theirs = theyWon ? Math.ceil(c.target * (1.02 + Math.random() * 0.18)) : Math.max(1, Math.floor(c.target * (0.7 + Math.random() * 0.25)))
    const rounded = g.scale >= 1000 ? Math.round(theirs / 50) * 50 : theirs
    c.done = true
    c.theirs = rounded
    const k = overrideKey(c.game, r.id)
    save.stats[k] = Math.max(save.stats[k] ?? 0, rounded)
    out.push({ resident: r, game: c.game, target: c.target, theirs: rounded, theyWon })
  }
  if (out.length) persist()
  return out
}

/** After you play: did you just beat someone who out-scored your challenge? */
export function rematchWins(game: string, score: number): Resident[] {
  const wins: Resident[] = []
  for (const c of save.challenges) {
    if (!c.done || c.game !== game || !c.theirs || c.theirs <= c.target) continue
    if (score > c.theirs) {
      const r = RESIDENT[c.id]
      if (r) wins.push(r)
      c.theirs = 0
    }
  }
  if (wins.length) persist()
  return wins
}
