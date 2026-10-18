import { q, tx, type UserRow } from './db.ts'
import { GAMES, weekId } from './game/rules.ts'
import { ITEM, STARTER_ITEMS } from '../../app/src/avatar/items.ts'
import { HOME } from '../../app/src/data/homes.ts'
import { STAMPS } from '../../app/src/data/stamps.ts'
import { partyOn } from '../../app/src/data/party.ts'
import { jamState } from '../../app/src/data/jam.ts'
import { EARN_RULES as EARN, QUEST_REWARDS, STARTING_COINS, MIGRATION_COIN_CAP, CREATOR_OUTFIT, WELCOME_GIFTS, DAILY_CAPS, nycDay, weekStart, visitReward } from '../../app/src/data/economy.ts'
import type { LookWire } from '../../app/src/net/protocol.ts'

/**
 * The server-side wallet. Online, the server owns three things the client used to keep in its save:
 * coins, the wardrobe (items you own) and your homes. Every coin that comes in goes through `claim`
 * (a known reason with a cap) or a server-side payout (validated job runs, referrals, moderators),
 * and every change is written to an append-only ledger.
 */
export interface Wallet {
  coins: number
  owned: string[]
  homes: string[]
}
export interface WalletResult {
  ok: boolean
  coins: number
  paid?: number
  error?: string
  wallet?: Wallet
  /** daily refills: days you've dropped by this week (today included) and in all */
  week?: number
  days?: number
}

const STARTER = new Set(STARTER_ITEMS)
const uniq = (a: string[]) => [...new Set(a)]
const list = (s: string | null | undefined): string[] => {
  try {
    const v = JSON.parse(s ?? '[]')
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}
const row = (id: string) => q.get<UserRow>('SELECT * FROM users WHERE id = ?', id)

/** What a brand-new wallet starts from: progress made offline, capped (see MIGRATION_COIN_CAP). */
export interface Seed {
  coins?: unknown
  owned?: unknown
  homes?: unknown
}

/** The wallet, created on first use from the player's earlier (offline or pre-launch) progress. */
export function ensureWallet(u: UserRow, seed?: Seed): Wallet {
  if (u.coins !== null && u.coins !== undefined) return { coins: u.coins, owned: list(u.owned), homes: list(u.homes) }
  let src: Seed = seed ?? {}
  if (!seed && u.save) {
    try {
      src = JSON.parse(u.save)
    } catch {
      src = {}
    }
  }
  const coins = Math.max(0, Math.min(MIGRATION_COIN_CAP, Math.floor(Number(src.coins ?? STARTING_COINS)) || 0))
  const owned = uniq((Array.isArray(src.owned) ? src.owned : []).filter((id): id is string => typeof id === 'string' && !!ITEM[id] && !STARTER.has(id) && ITEM[id].reward !== 'halloween' && ITEM[id].reward !== 'candy-hunt'))
  const homes = uniq(['walkup', ...(Array.isArray(src.homes) ? src.homes : []).filter((h): h is string => typeof h === 'string' && !!HOME[h] && !HOME[h].soon)])
  const w = { coins, owned, homes }
  tx(() => {
    const r = q.run('UPDATE users SET coins = ?, owned = ?, homes = ? WHERE id = ? AND coins IS NULL', coins, JSON.stringify(owned), JSON.stringify(homes), u.id)
    if (r.changes) q.run('INSERT INTO ledger (user_id, delta, reason, ref, day, balance, at) VALUES (?, ?, ?, NULL, ?, ?, ?)', u.id, coins, 'start', nycDay(), coins, Date.now())
  })
  const fresh = row(u.id)
  return fresh?.coins !== null && fresh?.coins !== undefined ? { coins: fresh.coins, owned: list(fresh.owned), homes: list(fresh.homes) } : w
}

export function walletOf(userId: string): Wallet | null {
  const u = row(userId)
  return u ? ensureWallet(u) : null
}

// ---------- coins in ----------
function credit(userId: string, amount: number, reason: string, ref: string | null): WalletResult {
  const day = nycDay()
  try {
    return tx(() => {
      q.run('UPDATE users SET coins = coins + ? WHERE id = ?', amount, userId)
      const coins = row(userId)!.coins!
      // the unique index on (user, reason, ref) makes every ref pay exactly once
      q.run('INSERT INTO ledger (user_id, delta, reason, ref, day, balance, at) VALUES (?, ?, ?, ?, ?, ?, ?)', userId, amount, reason, ref, day, coins, Date.now())
      return { ok: true, coins, paid: amount }
    })
  } catch {
    return { ok: false, coins: walletOf(userId)?.coins ?? 0, error: 'already' }
  }
}

/** Server-side payouts (validated job runs, referrals, moderators). Refs dedupe. */
export function payout(userId: string, amount: number, reason: string, ref: string | null): WalletResult {
  const u = row(userId)
  if (!u) return { ok: false, coins: 0, error: 'no-user' }
  ensureWallet(u)
  if (!Number.isFinite(amount) || amount === 0) return { ok: true, coins: walletOf(userId)!.coins, paid: 0 }
  if (amount < 0) return debit(userId, -amount, reason)
  return credit(userId, Math.floor(amount), reason, ref)
}

const previousWeek = () => weekId(new Date(Date.now() - 7 * 86400_000))

/** Days with a daily refill in the New York week of `day` (Monday up to and including `day`). */
export function daysThisWeek(userId: string, day = nycDay()): number {
  return q.get<{ n: number }>(`SELECT COUNT(DISTINCT day) AS n FROM ledger WHERE user_id = ? AND reason = 'daily' AND day >= ? AND day <= ?`, userId, weekStart(day), day)!.n
}
/** Days you've dropped by the city, ever (each daily refill is one). */
export const daysVisited = (userId: string) => q.get<{ n: number }>(`SELECT COUNT(DISTINCT day) AS n FROM ledger WHERE user_id = ? AND reason = 'daily'`, userId)!.n
const CLAIM_REASONS = Object.keys(EARN).map((r) => `'${r.replace(/'/g, '')}'`).join(', ')

/** Shift pay from a validated run, within today's ceiling for job pay. */
export function payJob(userId: string, coins: number, runId: string): WalletResult {
  const u = row(userId)
  if (!u) return { ok: false, coins: 0, error: 'no-user' }
  ensureWallet(u)
  const today = q.get<{ n: number | null }>(`SELECT SUM(delta) AS n FROM ledger WHERE user_id = ? AND day = ? AND reason = 'job'`, userId, nycDay())!.n ?? 0
  const pay = Math.max(0, Math.min(Math.floor(coins), DAILY_CAPS.jobs - today))
  if (!pay) return { ok: true, coins: walletOf(userId)!.coins, paid: 0, error: 'daily-cap' }
  return credit(userId, pay, 'job', runId)
}

/** A client asks to be paid for something it did. Unknown reasons and anything over a cap are refused. */
export function claim(userId: string, reason: string, rawRef?: unknown): WalletResult {
  const u = row(userId)
  if (!u) return { ok: false, coins: 0, error: 'no-user' }
  const w = ensureWallet(u)
  const rule = EARN[reason]
  const fail = (error: string): WalletResult => ({ ok: false, coins: w.coins, error })
  if (!rule) return fail('unknown-reason')
  let ref: string | null = rule.ref ? String(rawRef ?? '').slice(0, 64) : null
  if (rule.ref && !ref) return fail('missing-ref')
  let amount = rule.amount
  const day = nycDay()
  let week: number | undefined
  switch (reason) {
    case 'daily':
      // the refill grows with the days you've dropped by this week (counted from the ledger, not the client)
      week = daysThisWeek(userId, day) + 1
      amount = visitReward(week)
      break
    case 'quest':
      amount = QUEST_REWARDS[ref!] ?? 0
      if (!amount) return fail('unknown-quest')
      break
    case 'stamp-bonus': {
      const n = Number(ref)
      if (!Number.isInteger(n) || n <= 0 || n % 5 || n > Object.keys(STAMPS).length + 5) return fail('bad-ref')
      break
    }
    case 'dance-jam': {
      const j = jamState()
      if (Number(ref) !== j.n || !(j.on || Date.now() - j.end < 120_000)) return fail('not-now')
      break
    }
    case 'team-week':
      if (ref !== previousWeek()) return fail('bad-ref')
      break
    case 'daily-quest':
      ref = `${day}:${ref}`
      break
    case 'candy-hunt':
      if (!partyOn()) return fail('not-now')
      break
  }
  if (rule.per === 'day') {
    const n = q.get<{ n: number }>('SELECT COUNT(*) AS n FROM ledger WHERE user_id = ? AND reason = ? AND day = ?', userId, reason, day)!.n
    if (n >= rule.max) return fail('cap')
  } else if (rule.per === 'hour') {
    const n = q.get<{ n: number }>('SELECT COUNT(*) AS n FROM ledger WHERE user_id = ? AND reason = ? AND at > ?', userId, reason, Date.now() - 3600_000)!.n
    if (n >= rule.max) return fail('cap')
  }
  if (rule.perDay) {
    const n = q.get<{ n: number }>('SELECT COUNT(*) AS n FROM ledger WHERE user_id = ? AND reason = ? AND day = ?', userId, reason, day)!.n
    if (n >= rule.perDay) return fail('cap')
  }
  // one ceiling over all of today's claims together (scripts, not people, ever reach it)
  const claimed = q.get<{ n: number | null }>(`SELECT SUM(delta) AS n FROM ledger WHERE user_id = ? AND day = ? AND delta > 0 AND reason IN (${CLAIM_REASONS})`, userId, day)!.n ?? 0
  if (claimed + amount > DAILY_CAPS.claims) return fail('daily-cap')
  const r = credit(userId, amount, reason, ref)
  return week && r.ok ? { ...r, week, days: daysVisited(userId) } : r
}

// ---------- coins out ----------
/** Spending only ever lowers your own balance, so any small purchase is fine as long as you can afford it. */
export function debit(userId: string, amount: number, reason: string): WalletResult {
  const u = row(userId)
  if (!u) return { ok: false, coins: 0, error: 'no-user' }
  const w = ensureWallet(u)
  const n = Math.floor(amount)
  if (!Number.isFinite(n) || n <= 0 || n > 10_000) return { ok: false, coins: w.coins, error: 'bad-amount' }
  if (w.coins < n) return { ok: false, coins: w.coins, error: 'poor' }
  return tx(() => {
    q.run('UPDATE users SET coins = coins - ? WHERE id = ?', n, userId)
    const coins = row(userId)!.coins!
    q.run('INSERT INTO ledger (user_id, delta, reason, ref, day, balance, at) VALUES (?, ?, ?, NULL, ?, ?, ?)', userId, -n, String(reason).slice(0, 48), nycDay(), coins, Date.now())
    return { ok: true, coins, paid: -n }
  })
}

function saveLists(userId: string, owned: string[], homes: string[]) {
  q.run('UPDATE users SET owned = ?, homes = ? WHERE id = ?', JSON.stringify(owned), JSON.stringify(homes), userId)
}

/** Buy a piece of clothing (or a treat you hold) at its real price. Buying something you own is a no-op. */
export function buyItem(userId: string, itemId: string): WalletResult {
  const u = row(userId)
  if (!u) return { ok: false, coins: 0, error: 'no-user' }
  const w = ensureWallet(u)
  const def = ITEM[itemId]
  if (!def || def.price <= 0 || def.reward) return { ok: false, coins: w.coins, error: 'not-for-sale', wallet: w }
  if (w.owned.includes(itemId)) return { ok: true, coins: w.coins, paid: 0, wallet: w }
  if (w.coins < def.price) return { ok: false, coins: w.coins, error: 'poor', wallet: w }
  return tx(() => {
    const r = debit(userId, def.price, `item:${itemId}`)
    const owned = [...w.owned, itemId]
    saveLists(userId, owned, w.homes)
    return { ...r, wallet: { coins: r.coins, owned, homes: w.homes } }
  })
}

/** Buy a home on StreetCheesy. */
export function buyHome(userId: string, homeId: string): WalletResult {
  const u = row(userId)
  if (!u) return { ok: false, coins: 0, error: 'no-user' }
  const w = ensureWallet(u)
  const h = HOME[homeId]
  if (!h || h.soon || h.price <= 0) return { ok: false, coins: w.coins, error: 'not-for-sale', wallet: w }
  if (w.homes.includes(homeId)) return { ok: true, coins: w.coins, paid: 0, wallet: w }
  if (w.coins < h.price) return { ok: false, coins: w.coins, error: 'poor', wallet: w }
  return tx(() => {
    const r = debit(userId, h.price, `home:${homeId}`)
    const homes = [...w.homes, homeId]
    saveLists(userId, w.owned, homes)
    return { ...r, wallet: { coins: r.coins, owned: w.owned, homes } }
  })
}

/** Free reward items, each with its own condition (a game played, five stamps, your team…). */
export function grantItem(userId: string, itemId: string): WalletResult {
  const u = row(userId)
  if (!u) return { ok: false, coins: 0, error: 'no-user' }
  const w = ensureWallet(u)
  const def = ITEM[itemId]
  const no = (error: string): WalletResult => ({ ok: false, coins: w.coins, error, wallet: w })
  if (!def) return no('unknown-item')
  if (STARTER.has(itemId) || w.owned.includes(itemId)) return { ok: true, coins: w.coins, wallet: w }
  // the welcome-gift vendor in Times Square: any one welcome gift, free, once (if you don't own one yet)
  if (WELCOME_GIFTS.includes(itemId) && !WELCOME_GIFTS.some((g) => w.owned.includes(g))) {
    const owned = [...w.owned, itemId]
    saveLists(userId, owned, w.homes)
    return { ok: true, coins: w.coins, wallet: { ...w, owned } }
  }
  if (!def.reward) return no('not-free')
  let allowed = false
  if (def.reward === 'team') allowed = itemId === `team-scarf-${u.team}`
  else if (GAMES[def.reward]) allowed = !!q.get('SELECT 1 FROM scores WHERE user_id = ? AND game = ? LIMIT 1', userId, def.reward)
  else if (def.reward === 'stamps-5') {
    let stamps = 0
    try {
      stamps = (JSON.parse(u.save ?? '{}').stamps ?? []).length
    } catch {
      stamps = 0
    }
    allowed = stamps >= 5 || !!q.get(`SELECT 1 FROM ledger WHERE user_id = ? AND reason = 'stamp-bonus' LIMIT 1`, userId)
  } else if (def.reward === 'broadway-show') allowed = true
  else if (def.reward === 'halloween' || def.reward === 'candy-hunt') allowed = partyOn()
  if (!allowed) return no('not-earned')
  const owned = [...w.owned, itemId]
  saveLists(userId, owned, w.homes)
  return { ok: true, coins: w.coins, wallet: { ...w, owned } }
}

/** The New Yorker creator's freebies: the starter outfit you picked and one welcome gift. */
export function grantCreatorItems(userId: string, items: string[]): Wallet | null {
  const w = walletOf(userId)
  if (!w) return null
  const outfit = new Set([...CREATOR_OUTFIT.body, ...CREATOR_OUTFIT.legs, ...CREATOR_OUTFIT.feet])
  const free = items.filter((id) => outfit.has(id) && !STARTER.has(id))
  const gift = items.find((id) => WELCOME_GIFTS.includes(id))
  if (gift) free.push(gift)
  const owned = uniq([...w.owned, ...free])
  if (owned.length === w.owned.length) return w
  saveLists(userId, owned, w.homes)
  return { ...w, owned }
}

// ---------- the wardrobe decides what you can wear ----------
export function canWear(w: Wallet, team: string, itemId: string): boolean {
  const def = ITEM[itemId]
  if (!def) return false
  if (STARTER.has(itemId) || w.owned.includes(itemId)) return true
  return def.reward === 'team' && itemId === `team-scarf-${team}`
}

/** Drop anything from a look that this player doesn't own. */
export function ownedLook(look: LookWire, w: Wallet, team: string): LookWire {
  const items: Record<string, string> = {}
  for (const [slot, id] of Object.entries(look.items)) if (canWear(w, team, id)) items[slot] = id
  return { ...look, items }
}

/** The save blob mirrors the wallet: the server's numbers always win. */
export function withWallet(save: Record<string, unknown>, w: Wallet): Record<string, unknown> {
  return { ...save, coins: w.coins, owned: uniq([...STARTER_ITEMS, ...w.owned]), homes: w.homes, home: w.homes.includes(String(save.home)) ? save.home : 'walkup' }
}

export function recentLedger(userId: string, limit = 30) {
  return q.all<{ delta: number; reason: string; ref: string | null; balance: number; at: number }>('SELECT delta, reason, ref, balance, at FROM ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?', userId, limit)
}
