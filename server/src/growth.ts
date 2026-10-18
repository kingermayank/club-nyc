import { q } from './db.ts'
import { nycDay } from '../../app/src/data/economy.ts'

const DAY = 86400_000

/**
 * Is it spreading, and do people come back? (the moderator dashboard's growth card)
 * Read from the ledger: every wallet starts with a 'start' row on the New York day you joined, and every day
 * you play adds one 'daily' row (the refill). Percentages are null until there's history to measure.
 */
export interface Growth {
  /** players who opened the city today / in the last 7 days (New York days) */
  playedToday: number
  playedWeek: number
  /** joined 2–8 days ago and played again the day after joining (%) */
  nextDayPct: number | null
  /** joined 8–21 days ago and played again 7 or more days after joining (%) */
  weekLaterPct: number | null
  /** new players in the last 7 days who arrived through a friend's invite (%) */
  viaInvitePct: number | null
  /** invited friends (older than a day) who played the 10 minutes that pay their inviter (%) */
  invitesStuckPct: number | null
  /** average minutes played by players who joined in the last 7 days */
  newPlayMin: number
}

export function growthNow(today = nycDay(), now = Date.now()): Growth {
  const ago = (n: number) => q.get<{ d: string }>('SELECT date(?, ?) AS d', today, `-${n} day`)!.d
  const n = (sql: string, ...a: (string | number)[]) => q.get<{ n: number | null }>(sql, ...a)!.n ?? 0
  const pct = (part: number, total: number) => (total ? Math.round((part / total) * 100) : null)
  const returned = (from: number, to: number, after: number, exact: boolean) => {
    const r = q.get<{ total: number; back: number | null }>(
      `SELECT COUNT(*) AS total, SUM(EXISTS (SELECT 1 FROM ledger d WHERE d.reason = 'daily' AND d.user_id = s.user_id AND d.day ${exact ? '=' : '>='} date(s.day, ?))) AS back
       FROM ledger s WHERE s.reason = 'start' AND s.day BETWEEN ? AND ?`,
      `+${after} day`, ago(from), ago(to),
    )!
    return pct(r.back ?? 0, r.total)
  }
  const invitedOld = n('SELECT COUNT(*) AS n FROM referrals WHERE at < ?', now - DAY)
  return {
    playedToday: n(`SELECT COUNT(DISTINCT user_id) AS n FROM ledger WHERE reason = 'daily' AND day = ?`, today),
    playedWeek: n(`SELECT COUNT(DISTINCT user_id) AS n FROM ledger WHERE reason = 'daily' AND day >= ?`, ago(6)),
    nextDayPct: returned(8, 2, 1, true),
    weekLaterPct: returned(21, 8, 7, false),
    viaInvitePct: pct(n('SELECT COUNT(*) AS n FROM referrals WHERE at > ?', now - 7 * DAY), n(`SELECT COUNT(*) AS n FROM ledger WHERE reason = 'start' AND day >= ?`, ago(6))),
    invitesStuckPct: pct(n('SELECT COUNT(*) AS n FROM referrals WHERE at < ? AND paid_at IS NOT NULL', now - DAY), invitedOld),
    newPlayMin: Math.round(n('SELECT AVG(play_ms) AS n FROM users WHERE profile_done = 1 AND created_at > ?', now - 7 * DAY) / 60000),
  }
}

let cached: { at: number; v: Growth } | null = null
/** growthNow(), recomputed at most once a minute (the dashboard refreshes every 15 s) */
export function growth(): Growth {
  if (!cached || Date.now() - cached.at > 60_000) cached = { at: Date.now(), v: growthNow() }
  return cached.v
}
