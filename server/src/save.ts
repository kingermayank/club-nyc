import { q, type UserRow } from './db.ts'
import { TEAMS, validLook } from './game/rules.ts'
import { STAMPS } from '../../app/src/data/stamps.ts'
import { PAINTINGS } from '../../app/src/data/souvenirs.ts'
import { MIGRATION_COIN_CAP } from '../../app/src/data/economy.ts'

/**
 * What a cloud save may hold. The save is written by the game, so it is checked on the way in:
 * the shape (a save with a number where a list belongs would break the game on the next load), stamps (only ones
 * that exist), the title and team, and furniture (only pieces that exist, and no more of each than this player
 * had before or has paid for since). Coins, wardrobe and homes are not here: economy.ts overwrites them.
 */

/**
 * Furniture and its price. Mirrors FURNITURE in app/src/features/apartment.ts, which can't be imported here (it
 * draws things); scripts/economy-test.ts checks the two lists stay the same. The bridge painter's canvases are shared.
 */
export const FURNITURE_PRICE: Record<string, number> = {
  rug: 30, 'pizza-rug': 45, sofa: 90, armchair: 45, beanbag: 25, 'bagel-bag': 60, 'subway-bench': 70, bed: 80, 'taxi-bed': 150,
  'cat-bed': 55, bistro: 40, 'hydrant-table': 35, 'pizza-boxes': 20, bookshelf: 60, 'record-player': 55, jukebox: 120, tv: 50,
  arcade: 140, lamp: 20, 'torch-lamp': 65, 'street-lamp': 50, neon: 65, plant: 20, 'water-tower': 75, painting: 0,
  ...Object.fromEntries(PAINTINGS.map((p) => [p.id, p.price])),
}
/** pieces the game hands out (one each): the Everything Bagel bean bag for finishing the first-day list */
const FREE_FURNITURE: Record<string, number> = { 'bagel-bag': 1 }
/** placed pieces per home, pieces in storage, and homes with furniture in them */
const MAX_PLACED = 200
const MAX_STORED = 400
const MAX_HOMES = 12

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** the type each field of the game's save has (app/src/state.ts); a field of the wrong type is dropped, so the game falls back to its default */
const SHAPE: Record<string, 'string' | 'number' | 'boolean' | 'array' | 'object'> = {
  created: 'boolean', name: 'string', look: 'object', owned: 'array', coins: 'number', stamps: 'array', visited: 'array', room: 'string',
  muted: 'boolean', furniture: 'array', storage: 'array', stats: 'object', lastDaily: 'string', week: 'object', tour: 'string', seenNews: 'number',
  team: 'string', title: 'string', friends: 'array', affinity: 'object', guestbook: 'array', likes: 'number', openHouse: 'boolean', lastHome: 'number',
  signed: 'object', liked: 'object', challenges: 'array', notifyOff: 'boolean', quests: 'object', questsHidden: 'boolean', memberSince: 'string',
  owner: 'string', homes: 'array', home: 'string', homeFurniture: 'object', daily: 'object', mail: 'array', xp: 'number', xpLog: 'object',
  magnets: 'array', magnetAt: 'object', ifruit: 'object', loveLocks: 'object',
}
const typeOk = (v: unknown, t: string) => (t === 'array' ? Array.isArray(v) : t === 'object' ? isObj(v) : t === 'number' ? typeof v === 'number' && Number.isFinite(v) : typeof v === t)

/** stamp ids that exist, each once */
export const realStamps = (list: unknown): string[] => (Array.isArray(list) ? [...new Set(list.filter((id): id is string => typeof id === 'string' && !!STAMPS[id]))] : [])

const parse = (save: string | null): Record<string, unknown> => {
  try {
    const v = JSON.parse(save ?? '{}')
    return isObj(v) ? v : {}
  } catch {
    return {}
  }
}

/**
 * The stamps the server has seen this player earn: the ones in their cloud save plus every stamp the game reported
 * as it was earned (POST /api/xp/stamp, one row each). Stamps are earned in the game, so this is the game's word,
 * but it is a record made at the time, not a number sent along with a request for coins.
 */
export function knownStamps(u: Pick<UserRow, 'id' | 'save'>): Set<string> {
  const out = new Set(realStamps(parse(u.save).stamps))
  for (const r of q.all<{ ref: string }>(`SELECT ref FROM xp_log WHERE user_id = ? AND reason = 'stamp' AND ref IS NOT NULL`, u.id)) if (STAMPS[r.ref]) out.add(r.ref)
  return out
}

// ---------- furniture ----------
interface Placed {
  id: string
  x: number
  y: number
  [more: string]: unknown
}
const placedList = (v: unknown, max: number): Placed[] => {
  if (!Array.isArray(v)) return []
  const out: Placed[] = []
  for (const p of v) {
    if (!isObj(p) || typeof p.id !== 'string' || !(p.id in FURNITURE_PRICE)) continue
    const x = Number(p.x)
    const y = Number(p.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    out.push({ ...p, id: p.id, x: Math.max(-200, Math.min(1200, x)), y: Math.max(-200, Math.min(800, y)) })
    if (out.length >= max) break
  }
  return out
}
const storedList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((id): id is string => typeof id === 'string' && id in FURNITURE_PRICE).slice(0, MAX_STORED) : [])
const otherHomes = (v: unknown): Record<string, Placed[]> => {
  const out: Record<string, Placed[]> = {}
  if (isObj(v)) for (const [home, list] of Object.entries(v).slice(0, MAX_HOMES)) if (/^[\w-]{1,40}$/.test(home)) out[home] = placedList(list, MAX_PLACED)
  return out
}
function countFurniture(s: Record<string, unknown>): Record<string, number> {
  const n: Record<string, number> = {}
  const add = (id: string) => (n[id] = (n[id] ?? 0) + 1)
  placedList(s.furniture, MAX_PLACED).forEach((p) => add(p.id))
  storedList(s.storage).forEach(add)
  for (const l of Object.values(otherHomes(s.homeFurniture))) l.forEach((p) => add(p.id))
  return n
}
/**
 * How many of each piece this player has paid full price for (small spends are in the ledger as "furniture:<id>"):
 * ever, and since `since` (their last stored save, less a few seconds for a save and a purchase that crossed).
 */
function boughtFurniture(userId: string, since: number): { ever: Record<string, number>; lately: Record<string, number> } {
  const ever: Record<string, number> = {}
  const lately: Record<string, number> = {}
  for (const r of q.all<{ reason: string; delta: number; at: number }>(`SELECT reason, delta, at FROM ledger WHERE user_id = ? AND reason LIKE 'furniture:%'`, userId)) {
    const id = r.reason.slice('furniture:'.length)
    if (!(id in FURNITURE_PRICE) || -r.delta < FURNITURE_PRICE[id]) continue
    ever[id] = (ever[id] ?? 0) + 1
    if (r.at >= since - 5000) lately[id] = (lately[id] ?? 0) + 1
  }
  return { ever, lately }
}

/**
 * Check a save the game uploaded. Returns the save to store, or null when it isn't a save at all.
 * Nothing honest is lost: whatever was in the last stored save stays allowed, and anything new needs to exist
 * (stamps) or to have been paid for (furniture).
 */
export function checkSave(raw: unknown, u: UserRow): Record<string, unknown> | null {
  if (!isObj(raw)) return null
  const s: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(raw)) if (!(k in SHAPE) || typeOk(v, SHAPE[k])) s[k] = v
  const prev = parse(u.save)

  if ('stamps' in s) s.stamps = realStamps(s.stamps)
  // a title is a stamp's id (older saves) or nothing: these days your level names you
  if ('title' in s) s.title = STAMPS[String(s.title)] ? s.title : ''
  // you pick a neighborhood once
  if (u.team) s.team = u.team
  else if ('team' in s) s.team = TEAMS.includes(String(s.team)) ? s.team : ''
  if ('look' in s) {
    const look = validLook(s.look)
    if (look) s.look = look
    else delete s.look
  }

  // furniture: only real pieces, and no more of each than before plus what has been bought (or handed out) since
  const had = countFurniture(prev)
  const bought = boughtFurniture(u.id, u.save_updated ?? 0)
  // a first save can bring furniture from before the account existed, up to what the starting coins could ever have bought
  let carry = u.save ? 0 : MIGRATION_COIN_CAP
  const left: Record<string, number> = {}
  const allow = (id: string): boolean => {
    // what the last save had plus what's been bought since, or everything ever bought (plus the game's gifts), whichever is more
    left[id] ??= Math.max((had[id] ?? 0) + (bought.lately[id] ?? 0), (bought.ever[id] ?? 0) + (FREE_FURNITURE[id] ?? 0))
    if (left[id] > 0) return left[id]-- > 0
    if (carry >= FURNITURE_PRICE[id] && FURNITURE_PRICE[id] > 0) {
      carry -= FURNITURE_PRICE[id]
      return true
    }
    return false
  }
  // what's placed in the home you're in counts first, then your other homes, then storage
  if ('furniture' in s) s.furniture = placedList(s.furniture, MAX_PLACED).filter((p) => allow(p.id))
  if ('homeFurniture' in s) s.homeFurniture = Object.fromEntries(Object.entries(otherHomes(s.homeFurniture)).map(([home, l]) => [home, l.filter((p) => allow(p.id))]))
  if ('storage' in s) s.storage = storedList(s.storage).filter(allow)
  return s
}
