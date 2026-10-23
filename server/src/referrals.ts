import { q, tx, type UserRow } from './db.ts'
import { payout } from './economy.ts'
import { banOf } from './moderation.ts'
import { REFERRAL } from '../../app/src/data/economy.ts'
import { awardXp } from './xp.ts'

/** tests can shorten the 'has really played' wait (REFERRAL_ACTIVATION_MS) */
const ACTIVATION_MS = Number(process.env.REFERRAL_ACTIVATION_MS) || REFERRAL.activationMs

/**
 * Bring-a-friend. An invite link is just `/join/<your name>`. When a friend signs up through it:
 *  - you become friends right away (above a cap it's a friend request instead — big creators share links),
 *  - they get a welcome bonus,
 *  - you get paid once they've really played (REFERRAL.activationMs), within daily and lifetime caps.
 */
export function inviterByName(name: string): UserRow | null {
  const u = q.get<UserRow>('SELECT * FROM users WHERE name = ? AND profile_done = 1', name.trim())
  return u && !banOf(u) ? u : null
}

export function recordReferral(invitee: UserRow, inviter: UserRow): { friends: 'accepted' | 'pending'; welcome: number } | null {
  if (invitee.id === inviter.id || invitee.invited_by) return null
  let friends: 'accepted' | 'pending' = 'pending'
  tx(() => {
    q.run('INSERT OR IGNORE INTO referrals (invitee, inviter, at) VALUES (?, ?, ?)', invitee.id, inviter.id, Date.now())
    q.run('UPDATE users SET invited_by = ? WHERE id = ?', inviter.id, invitee.id)
    const count = q.get<{ n: number }>('SELECT COUNT(*) AS n FROM referrals WHERE inviter = ?', inviter.id)!.n
    const existing = q.get('SELECT 1 FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', inviter.id, invitee.id, invitee.id, inviter.id)
    if (!existing) {
      friends = count <= REFERRAL.autoFriendCap ? 'accepted' : 'pending'
      q.run('INSERT INTO friends (a, b, status, created_at) VALUES (?, ?, ?, ?)', invitee.id, inviter.id, friends, Date.now())
    }
  })
  const w = payout(invitee.id, REFERRAL.welcome, 'referral-welcome', inviter.id)
  return { friends, welcome: w.ok ? REFERRAL.welcome : 0 }
}

export interface ReferralPayout {
  inviter: string
  invitee: string
  inviteeName: string
  coins: number
  balance: number
}

/** Pay inviters whose friends have now played long enough. Cheap: only unpaid, active referrals are read. */
export function settleReferrals(): ReferralPayout[] {
  const due = q.all<{ invitee: string; inviter: string; name: string }>(
    `SELECT r.invitee, r.inviter, u.name FROM referrals r JOIN users u ON u.id = r.invitee WHERE r.paid_at IS NULL AND u.play_ms >= ?`,
    ACTIVATION_MS,
  )
  const out: ReferralPayout[] = []
  for (const r of due) {
    const today = q.get<{ n: number }>('SELECT COUNT(*) AS n FROM referrals WHERE inviter = ? AND paid_at > ?', r.inviter, Date.now() - 86400_000)!.n
    const ever = q.get<{ n: number }>('SELECT COUNT(*) AS n FROM ledger WHERE user_id = ? AND reason = ?', r.inviter, 'referral')!.n
    let coins = 0
    let balance = 0
    if (today < REFERRAL.dailyCap && ever < REFERRAL.totalCap) {
      const p = payout(r.inviter, REFERRAL.reward, 'referral', r.invitee)
      if (p.ok) {
        coins = REFERRAL.reward
        balance = p.coins
      }
    }
    q.run('UPDATE referrals SET paid_at = ? WHERE invitee = ?', Date.now(), r.invitee)
    // bringing someone into the city who sticks around is worth XP too (once per friend)
    awardXp(r.inviter, 'invite', { ref: r.invitee })
    out.push({ inviter: r.inviter, invitee: r.invitee, inviteeName: r.name ?? '', coins, balance })
  }
  return out
}

export function referralStats(inviter: string) {
  const rows = q.all<{ name: string; at: number; paid_at: number | null; play_ms: number }>(
    `SELECT u.name, r.at, r.paid_at, u.play_ms FROM referrals r JOIN users u ON u.id = r.invitee WHERE r.inviter = ? ORDER BY r.at DESC LIMIT 50`,
    inviter,
  )
  const earned = q.get<{ n: number | null }>(`SELECT SUM(delta) AS n FROM ledger WHERE user_id = ? AND reason = 'referral'`, inviter)!.n ?? 0
  return {
    count: q.get<{ n: number }>('SELECT COUNT(*) AS n FROM referrals WHERE inviter = ?', inviter)!.n,
    earned,
    recent: rows.map((r) => ({ name: r.name ?? '', at: r.at, active: !!r.paid_at })),
  }
}
