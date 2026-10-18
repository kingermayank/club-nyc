/**
 * Invite links are `/join/<name>`. We remember who invited you (in localStorage, so it survives a
 * Google / X / Discord round-trip and the New Yorker creator) until your account is made.
 */
const KEY = 'club-nyc:invite'
const WEEK = 7 * 86400_000

export function captureInvite() {
  const m = location.pathname.match(/^\/join\/([A-Za-z0-9_]{2,14})\/?$/)
  if (!m) return
  try {
    localStorage.setItem(KEY, JSON.stringify({ name: m[1], at: Date.now() }))
  } catch {
    /* private mode: the invite just won't be remembered */
  }
  history.replaceState(null, '', '/play' + location.search)
}

export function pendingInvite(): string | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { name?: string; at?: number } | null
    if (v?.name && v.at && Date.now() - v.at < WEEK) return v.name
  } catch {
    /* ignore */
  }
  return null
}

export function clearInvite() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export const inviteLink = (name: string) => `${location.origin}/join/${encodeURIComponent(name)}`
