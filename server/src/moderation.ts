import { randomInt } from 'node:crypto'
import { q, tx, type UserRow } from './db.ts'

/**
 * Moderation: what the community rules (app/public/rules.html) promise, enforced.
 *   warn → mute (minutes) → suspend (days) → permanent ban, plus name resets.
 * Chat is kept 72 hours so reports can be checked against what was actually said, then deleted.
 */
export const CHAT_KEEP_MS = 72 * 3600_000
const ERRORS_KEEP_MS = 30 * 86400_000
/** funnel events: Launch HQ looks back 7 days; 90 leaves room to compare months */
const EVENTS_KEEP_MS = 90 * 86400_000
const REPORTS_TO_PAUSE = 3
const PAUSE_MINUTES = 30
/** far future = permanent */
export const FOREVER = 8_000_000_000_000

export interface Restriction {
  until: number
  reason: string
}
export const banOf = (u: Pick<UserRow, 'banned_until' | 'ban_reason'>): Restriction | null =>
  u.banned_until && u.banned_until > Date.now() ? { until: u.banned_until, reason: u.ban_reason ?? '' } : null
export const muteOf = (u: Pick<UserRow, 'muted_until' | 'mute_reason'>): Restriction | null =>
  u.muted_until && u.muted_until > Date.now() ? { until: u.muted_until, reason: u.mute_reason ?? '' } : null

export function logChat(userId: string, room: string, text: string) {
  q.run('INSERT INTO chat_log (user_id, room, text, at) VALUES (?, ?, ?, ?)', userId, room, text, Date.now())
}

export function recordAction(target: string, action: string, o: { reason?: string; minutes?: number; by: string; reportId?: number }) {
  q.run('INSERT INTO mod_actions (target, action, reason, minutes, by, report_id, at) VALUES (?, ?, ?, ?, ?, ?, ?)', target, action, o.reason ?? null, o.minutes ?? null, o.by, o.reportId ?? null, Date.now())
}

/** Several different people reporting the same player within an hour pauses their chat until a moderator looks. */
export function autoModAfterReport(target: string): Restriction | null {
  const u = q.get<UserRow>('SELECT * FROM users WHERE id = ?', target)
  if (!u || muteOf(u) || banOf(u)) return null
  const n = q.get<{ n: number }>(`SELECT COUNT(DISTINCT reporter) AS n FROM reports WHERE target = ? AND status = 'open' AND created_at > ?`, target, Date.now() - 3600_000)!.n
  if (n < REPORTS_TO_PAUSE) return null
  const until = Date.now() + PAUSE_MINUTES * 60_000
  const reason = 'Chat paused after several reports. A moderator will take a look.'
  q.run('UPDATE users SET muted_until = ?, mute_reason = ? WHERE id = ?', until, reason, target)
  recordAction(target, 'auto-mute', { reason: `${n} players reported them within an hour`, minutes: PAUSE_MINUTES, by: 'auto' })
  return { until, reason }
}

export type ModActionKind = 'warn' | 'mute' | 'unmute' | 'ban' | 'unban' | 'rename'
export interface ModActionInput {
  action: ModActionKind
  reason?: string
  /** mute / ban length; a ban without minutes is permanent */
  minutes?: number
  by: string
  reportId?: number
}

function freshName(): string {
  for (let i = 0; i < 50; i++) {
    const name = `NewYorker${randomInt(1000, 99999)}`
    if (!q.get('SELECT 1 FROM users WHERE name = ?', name)) return name
  }
  return `NewYorker${Date.now() % 10_000_000}`
}

/** Apply a moderator decision. Live effects (kicks, mute notices) are the caller's job — see admin.ts. */
export function applyModAction(target: string, a: ModActionInput): { ok: boolean; error?: string; user?: UserRow } {
  const u = q.get<UserRow>('SELECT * FROM users WHERE id = ?', target)
  if (!u) return { ok: false, error: 'not-found' }
  const reason = (a.reason ?? '').slice(0, 300)
  const minutes = a.minutes && a.minutes > 0 ? Math.min(Math.floor(a.minutes), 60 * 24 * 365) : 0
  tx(() => {
    switch (a.action) {
      case 'warn':
        break
      case 'mute':
        q.run('UPDATE users SET muted_until = ?, mute_reason = ? WHERE id = ?', Date.now() + (minutes || 60) * 60_000, reason, target)
        break
      case 'unmute':
        q.run('UPDATE users SET muted_until = NULL, mute_reason = NULL WHERE id = ?', target)
        break
      case 'ban':
        q.run('UPDATE users SET banned_until = ?, ban_reason = ? WHERE id = ?', minutes ? Date.now() + minutes * 60_000 : FOREVER, reason, target)
        break
      case 'unban':
        q.run('UPDATE users SET banned_until = NULL, ban_reason = NULL WHERE id = ?', target)
        break
      case 'rename':
        q.run('UPDATE users SET name = ?, name_reset = 1 WHERE id = ?', freshName(), target)
        break
    }
    recordAction(target, a.action, { reason, minutes: minutes || undefined, by: a.by, reportId: a.reportId })
    if (a.reportId) q.run(`UPDATE reports SET status = 'actioned', resolved_at = ?, resolution = ? WHERE id = ?`, Date.now(), `${a.action}${reason ? ': ' + reason : ''}`, a.reportId)
  })
  return { ok: true, user: q.get<UserRow>('SELECT * FROM users WHERE id = ?', target) }
}

export function dismissReport(id: number, by: string, note = '') {
  q.run(`UPDATE reports SET status = 'dismissed', resolved_at = ?, resolution = ? WHERE id = ?`, Date.now(), `dismissed by ${by}${note ? ': ' + note : ''}`, id)
}

/** Retention: chat after 72 hours, crash reports after 30 days, funnel events after 90 days. */
export function purgeOld() {
  q.run('DELETE FROM chat_log WHERE at < ?', Date.now() - CHAT_KEEP_MS)
  q.run('DELETE FROM client_errors WHERE at < ?', Date.now() - ERRORS_KEEP_MS)
  q.run('DELETE FROM events WHERE at < ?', Date.now() - EVENTS_KEEP_MS)
}
