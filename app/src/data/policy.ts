/**
 * The Terms of Service, Privacy Policy and Community Rules players agree to, and who can play.
 * Shared by the game and the server (server/src/api.ts records which version each player agreed to, and when).
 *
 * Bump POLICY_VERSION (the date of the change) whenever the terms, privacy policy or rules change in a way players
 * should agree to again: everyone is asked once more, the next time they play.
 */
export const POLICY_VERSION = '2026-10-20'

/** Club NYC is for ages 13 and up. */
export const MIN_AGE = 13

/**
 * Is someone born in this month (1-12) and year old enough to play today? Only the month and year are asked, so the
 * birthday counts as the last day of that month: nobody gets in a day early. The birth date itself is never stored.
 */
export function oldEnough(month: number, year: number, now = new Date()): boolean {
  if (!Number.isInteger(month) || !Number.isInteger(year) || month < 1 || month > 12) return false
  if (year > now.getFullYear() || year < now.getFullYear() - 120) return false
  // new Date(y, m, 0) is the last day of month m (1-based)
  return now.getTime() >= new Date(year + MIN_AGE, month, 0).getTime()
}
