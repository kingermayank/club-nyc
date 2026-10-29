import type { Look } from '../avatar/look'

/** REST calls to the game server (same origin; Vite proxies /api in dev). */
export interface PublicUser {
  id: string
  name: string
  look: Look | null
  team: string
  title: string
  memberSince: string
  /** member number (1, 2, 3… in the order New Yorkers arrived) */
  memberNo?: number
  /** total XP (data/levels.ts turns it into a level and title) */
  xp?: number
  /** in before the city opened, or on the waitlist: the Founder badge on the player card */
  founder?: boolean
}
export interface Me extends PublicUser {
  profileDone: boolean
  /** the Terms / Privacy / Rules version this player agreed to (app/src/data/policy.ts) */
  consentVersion?: string | null
  isGuest: boolean
  providers: string[]
  /** a moderator reset your name: pick a new one */
  nameReset?: boolean
  /** friends who joined through your invite link */
  invites?: number
  /** days you've dropped by this week (Monday to Sunday, New York time) and in all, from the server's ledger */
  week?: number
  days?: number
}
export interface Presence {
  online: boolean
  room: string | null
  inst: number
}

export class HttpError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown) {
    super(`HTTP ${status}`)
    this.status = status
    this.body = body
  }
  get reason(): string {
    const b = this.body as { reason?: string; error?: string } | null
    return b?.reason ?? b?.error ?? this.message
  }
}

export async function rest<T>(path: string, init: { method?: string; json?: unknown; timeout?: number; keepalive?: boolean } = {}): Promise<T> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), init.timeout ?? 8000)
  try {
    const res = await fetch('/api' + path, {
      method: init.method ?? (init.json !== undefined ? 'POST' : 'GET'),
      headers: init.json !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
      credentials: 'same-origin',
      keepalive: init.keepalive,
      signal: ctl.signal,
    })
    const isJson = (res.headers.get('content-type') ?? '').includes('json')
    const body = isJson ? await res.json() : await res.text()
    if (!res.ok || !isJson) throw new HttpError(res.status, body)
    return body as T
  } finally {
    clearTimeout(timer)
  }
}
