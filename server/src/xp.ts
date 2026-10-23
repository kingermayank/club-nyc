/**
 * XP and levels, owned by the server (the rules are in app/src/data/levels.ts, shared with the game).
 *
 * awardXp() is the only way XP goes up. It checks the reason's rule (once per ref, a few times a day, once per
 * validated run), the daily ceiling across everything, writes a row to xp_log, bumps users.xp and tells the
 * player (an `xp` message: "+25 XP · New stamp", with a celebration when the level changes).
 *
 * Callers: claims in economy.ts (quests, daily challenges, the daily refill, Dance Jam tips, party hosting),
 * validated job runs and new friends in api.ts, first visits in game/realtime.ts, referrals in referrals.ts,
 * multiplayer matches, and the game itself for stamps (POST /api/xp/stamp, one award per stamp ever).
 */
import { Hono } from 'hono'
import { z } from 'zod'
import { q, tx } from './db.ts'
import { requireUser, type Env } from './auth.ts'
import { XP_RULES, XP_DAILY_CAP, levelOf, levelReward, type XpReason } from '../../app/src/data/levels.ts'
import { payout } from './economy.ts'
import { nycDay } from '../../app/src/data/economy.ts'
import { STAMPS } from '../../app/src/data/stamps.ts'
import type { S2C } from '../../app/src/net/protocol.ts'

export interface XpResult {
  ok: boolean
  /** XP actually added (0 when the rule or the daily ceiling said no) */
  gained: number
  xp: number
  level: number
  leveledUp: boolean
}

/** realtime.ts plugs in how to reach a player who's online (kept as a hook so this file doesn't import the socket layer) */
let push: (userId: string, evt: S2C) => void = () => {}
export function setXpPush(fn: (userId: string, evt: S2C) => void) {
  push = fn
}

const totalOf = (userId: string) => q.get<{ xp: number }>('SELECT xp FROM users WHERE id = ?', userId)?.xp ?? 0

/**
 * Give a player XP for something they did. `amount` overrides the rule's own (jobs and multiplayer games compute
 * theirs); `ref` identifies the thing (a stamp id, a run id, a room…) so it can't pay twice.
 */
export function awardXp(userId: string, reason: XpReason, opts: { amount?: number; ref?: string | number | null; quiet?: boolean } = {}): XpResult {
  const rule = XP_RULES[reason]
  const before = totalOf(userId)
  const none: XpResult = { ok: false, gained: 0, xp: before, level: levelOf(before).level, leveledUp: false }
  if (!rule) return none
  const ref = opts.ref === undefined || opts.ref === null ? null : String(opts.ref).slice(0, 64)
  if ((rule.per === 'once' || rule.per === 'run') && !ref) return none
  let amount = Math.max(0, Math.round(opts.amount ?? rule.amount))
  if (!amount) return none
  const day = nycDay()
  const res = tx(() => {
    if (ref && q.get('SELECT 1 FROM xp_log WHERE user_id = ? AND reason = ? AND ref = ?', userId, reason, ref)) return null
    if (rule.per === 'day') {
      const n = q.get<{ n: number }>('SELECT COUNT(*) AS n FROM xp_log WHERE user_id = ? AND reason = ? AND day = ?', userId, reason, day)!.n
      if (n >= ('max' in rule ? rule.max : 1)) return null
    }
    const today = q.get<{ n: number | null }>('SELECT SUM(amount) AS n FROM xp_log WHERE user_id = ? AND day = ?', userId, day)!.n ?? 0
    amount = Math.min(amount, XP_DAILY_CAP - today)
    if (amount <= 0) return null
    q.run('INSERT INTO xp_log (user_id, amount, reason, ref, day, at) VALUES (?, ?, ?, ?, ?, ?)', userId, amount, reason, ref, day, Date.now())
    q.run('UPDATE users SET xp = xp + ? WHERE id = ?', amount, userId)
    return totalOf(userId)
  })
  if (res === null) return none
  const was = levelOf(before)
  const now = levelOf(res)
  const leveledUp = now.level > was.level
  // every new level pays a coin bonus, once per level (several at once if one award jumps more than a level)
  let bonus = 0
  let coins: number | undefined
  for (let lv = was.level + 1; leveledUp && lv <= now.level; lv++) {
    if (q.get("SELECT 1 FROM ledger WHERE user_id = ? AND reason = 'level-up' AND ref = ?", userId, String(lv))) continue
    const r = payout(userId, levelReward(lv), 'level-up', String(lv))
    if (r.ok) {
      bonus += levelReward(lv)
      coins = r.coins
    }
  }
  if (coins !== undefined) push(userId, { t: '$', c: coins })
  if (!opts.quiet || leveledUp) push(userId, { t: 'xp', x: res, g: amount, why: rule.label, lv: now.level, up: leveledUp || undefined, b: bonus || undefined })
  return { ok: true, gained: amount, xp: res, level: now.level, leveledUp }
}

/** the last few awards, for the player card's "recently" list */
export const recentXp = (userId: string, limit = 8) =>
  q.all<{ amount: number; reason: string; at: number }>('SELECT amount, reason, at FROM xp_log WHERE user_id = ? ORDER BY id DESC LIMIT ?', userId, limit)

// ---------- REST: /api/xp ----------
export const xpApi = new Hono<Env>()

xpApi.get('/', requireUser, (c) => {
  const me = c.get('user')
  const xp = totalOf(me.id)
  return c.json({ ...levelOf(xp), recent: recentXp(me.id).map((r) => ({ ...r, label: XP_RULES[r.reason as XpReason]?.label ?? r.reason })) })
})

/** stamps are earned in the game (they live in the save), so the game reports each one; each stamp pays XP once */
const StampBody = z.object({ id: z.string().max(48) })
xpApi.post('/stamp', requireUser, async (c) => {
  const body = StampBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success || !STAMPS[body.data.id]) return c.json({ error: 'bad-request' }, 400)
  return c.json(awardXp(c.get('user').id, 'stamp', { ref: body.data.id }))
})
