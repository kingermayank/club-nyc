/**
 * Levels and XP, shared by the game and the server.
 *
 * Everything you do in the city earns XP: shifts at the jobs, multiplayer games, stamps, the day's challenges,
 * new places, new friends. XP only ever goes up; it sets your level, and your level sets your title (titles used to
 * be picked from a list of stamps, which meant anyone could call themselves anything). Coins are for spending, XP is
 * for showing how far you've come.
 *
 * Online the server owns your XP (server/src/xp.ts), so a modified client can't level itself up. Offline
 * single-player keeps its own count with the same rules.
 */

export interface Level {
  /** total XP needed to reach this level */
  at: number
  title: string
}

/** The ladder: early levels come quickly (a first evening gets you to Commuter), later ones take a few weeks. */
export const LEVELS: Level[] = [
  { at: 0, title: 'Tourist' },
  { at: 60, title: 'Day-Tripper' },
  { at: 150, title: 'Commuter' },
  { at: 280, title: 'Bodega Regular' },
  { at: 450, title: 'Local' },
  { at: 650, title: 'Stoop Sitter' },
  { at: 900, title: 'Subway Pro' },
  { at: 1200, title: 'Halal Cart Regular' },
  { at: 1550, title: 'Block Captain' },
  { at: 1950, title: 'True New Yorker' },
  { at: 2400, title: 'Pigeon Whisperer' },
  { at: 2900, title: 'Brunch Critic' },
  { at: 3450, title: 'Express Train' },
  { at: 4050, title: 'Bagel Authority' },
  { at: 4700, title: 'Rent-Stabilized' },
  { at: 5400, title: 'Times Square Survivor' },
  { at: 6150, title: 'Skyline Regular' },
  { at: 6950, title: 'Neighborhood Legend' },
  { at: 7800, title: 'Borough President' },
  { at: 8700, title: 'Mayor of the Block' },
  { at: 9700, title: 'Keys to the City' },
  { at: 10800, title: 'Five-Borough Famous' },
  { at: 12000, title: 'Living Landmark' },
  { at: 13300, title: 'Big Apple Royalty' },
  { at: 14700, title: 'Club NYC Legend' },
]
/** past the top of the ladder, every this-many XP is one more level (the title stays Club NYC Legend) */
export const XP_PER_LEVEL_AFTER = 1500

export interface LevelInfo {
  level: number
  title: string
  xp: number
  /** XP where this level started, and where the next one starts */
  floor: number
  next: number
  nextTitle: string
  /** 0..1 through this level */
  progress: number
}

export function levelOf(xp: number): LevelInfo {
  xp = Math.max(0, Math.floor(xp || 0))
  const top = LEVELS[LEVELS.length - 1]
  if (xp >= top.at) {
    const extra = Math.floor((xp - top.at) / XP_PER_LEVEL_AFTER)
    const floor = top.at + extra * XP_PER_LEVEL_AFTER
    const next = floor + XP_PER_LEVEL_AFTER
    return { level: LEVELS.length + extra, title: top.title, xp, floor, next, nextTitle: top.title, progress: (xp - floor) / (next - floor) }
  }
  let i = 0
  while (i + 1 < LEVELS.length && LEVELS[i + 1].at <= xp) i++
  const floor = LEVELS[i].at
  const next = LEVELS[i + 1].at
  return { level: i + 1, title: LEVELS[i].title, xp, floor, next, nextTitle: LEVELS[i + 1].title, progress: (xp - floor) / (next - floor) }
}

export interface XpRule {
  /** XP per award (jobs and multiplayer games compute theirs: see jobXp and mpXp) */
  amount: number
  /** 'once': once per ref, forever · 'day': up to `max` times per New York day · 'run': once per ref (a validated run) */
  per: 'once' | 'day' | 'run'
  max?: number
  /** what the "+25 XP" toast says */
  label: string
}

/** Every way to earn XP. The server refuses anything not listed here. */
export const XP_RULES = {
  job: { amount: 0, per: 'run', label: 'Shift done' },
  'mp-game': { amount: 0, per: 'run', label: 'Game played' },
  stamp: { amount: 25, per: 'once', label: 'New stamp' },
  quest: { amount: 20, per: 'once', label: 'New in Town' },
  'daily-quest': { amount: 15, per: 'day', max: 3, label: 'Daily challenge' },
  'daily-quests-done': { amount: 30, per: 'day', max: 1, label: 'All of today’s challenges' },
  visit: { amount: 10, per: 'once', label: 'New place' },
  friend: { amount: 15, per: 'once', label: 'New friend' },
  invite: { amount: 50, per: 'once', label: 'A friend joined' },
  daily: { amount: 10, per: 'day', max: 1, label: 'Back in the city' },
  'dance-jam': { amount: 10, per: 'day', max: 8, label: 'Dance Jam' },
  'party-host': { amount: 20, per: 'day', max: 2, label: 'Party host' },
} satisfies Record<string, XpRule>
export type XpReason = keyof typeof XP_RULES
export const XP_REASONS = Object.keys(XP_RULES) as XpReason[]

/** All XP in one New York day, together: far above a keen player, far below what a script could farm. */
export const XP_DAILY_CAP = 2000

/** Reaching a new level pays coins (once per level), so XP feeds back into the shops: 40 at Level 2, up to 200. */
export const levelReward = (level: number) => Math.min(20 * level, 200)

/** A job shift: a little for showing up, more for doing well (by the coins it paid). */
export const jobXp = (coins: number) => 15 + Math.min(45, Math.round(Math.max(0, coins) / 2))

/** A multiplayer game: everyone who plays it through gets XP, the podium gets more. */
export const mpXp = (place: number, players: number) => 20 + (place === 1 && players > 1 ? 30 : place === 2 && players > 2 ? 15 : place === 3 && players > 3 ? 5 : 0)

/** Coin claims (data/economy.ts EARN) that also earn XP, and the XP reason they map to. */
export const XP_FOR_CLAIM: Partial<Record<string, XpReason>> = {
  quest: 'quest',
  'daily-quest': 'daily-quest',
  'daily-quests-done': 'daily-quests-done',
  daily: 'daily',
  'dance-jam': 'dance-jam',
  'party-host': 'party-host',
}
