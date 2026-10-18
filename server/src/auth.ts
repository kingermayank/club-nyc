import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { Google, Twitter, Discord, generateCodeVerifier, generateState, decodeIdToken } from 'arctic'
import { config } from './config.ts'
import { q, tx, type UserRow } from './db.ts'
import { banOf } from './moderation.ts'

/**
 * Accounts, low friction first:
 *  1. "Play now" creates a guest account instantly (cookie session, no forms).
 *  2. "Sign in with Google / X" either logs into an existing account, or — when you're already
 *     playing as a guest — attaches that identity to your guest so you keep everything.
 * Sessions are random tokens in an httpOnly cookie; only their SHA-256 is stored.
 */
export const SESSION_COOKIE = 'club_sid'
const SESSION_DAYS = 30
const DAY = 86400000

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

export type Env = { Variables: { user: UserRow } }

export function createSession(c: Context, userId: string) {
  const token = randomBytes(32).toString('base64url')
  const now = Date.now()
  q.run('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', sha(token), userId, now, now + SESSION_DAYS * DAY)
  setCookie(c, SESSION_COOKIE, token, { httpOnly: true, sameSite: 'Lax', secure: config.secureCookies, path: '/', maxAge: SESSION_DAYS * 86400 })
}

/** Look up the user for a raw session token (also used by the WebSocket upgrade). Slides expiry. */
export function userForToken(token: string | undefined): UserRow | null {
  if (!token) return null
  const id = sha(token)
  const s = q.get<{ user_id: string; expires_at: number }>('SELECT user_id, expires_at FROM sessions WHERE id = ?', id)
  if (!s) return null
  const now = Date.now()
  if (s.expires_at < now) {
    q.run('DELETE FROM sessions WHERE id = ?', id)
    return null
  }
  if (s.expires_at - now < (SESSION_DAYS / 2) * DAY) q.run('UPDATE sessions SET expires_at = ? WHERE id = ?', now + SESSION_DAYS * DAY, id)
  return q.get<UserRow>('SELECT * FROM users WHERE id = ?', s.user_id) ?? null
}

export function parseCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k !== name) continue
    try {
      return decodeURIComponent(v.join('='))
    } catch {
      return undefined // a malformed cookie (e.g. a stray "%") is just no session — never an exception
    }
  }
  return undefined
}

export const currentUser = (c: Context) => userForToken(getCookie(c, SESSION_COOKIE))

export const requireUser: MiddlewareHandler<Env> = async (c, next) => {
  const u = currentUser(c)
  if (!u) return c.json({ error: 'not-signed-in' }, 401)
  const ban = banOf(u)
  if (ban) return c.json({ error: 'banned', reason: ban.reason, until: ban.until }, 403)
  c.set('user', u)
  await next()
}

/** Basic CSRF defence for cookie-authenticated writes: same-origin requests only. */
export const sameOrigin: MiddlewareHandler = async (c, next) => {
  if (c.req.method !== 'GET' && c.req.method !== 'HEAD') {
    const origin = c.req.header('origin')
    if (origin) {
      // "null" (sandboxed frames, some privacy modes) and other unparsable origins are refused, not a 500
      let host = ''
      try {
        host = new URL(origin).host
      } catch {
        /* host stays '' */
      }
      if (!host || (host !== new URL(config.publicUrl).host && host !== c.req.header('host'))) return c.json({ error: 'bad-origin' }, 403)
    }
  }
  await next()
}

function newUser(isGuest: boolean): string {
  const id = randomUUID()
  q.run('INSERT INTO users (id, created_at, last_seen, is_guest) VALUES (?, ?, ?, ?)', id, Date.now(), Date.now(), isGuest ? 1 : 0)
  return id
}

// ---------- OAuth providers ----------
const redirect = (p: string) => `${config.publicUrl}/api/auth/${p}/callback`
const google = config.google ? new Google(config.google.id, config.google.secret, redirect('google')) : null
const twitter = config.x ? new Twitter(config.x.id, config.x.secret, redirect('x')) : null
const discord = config.discord ? new Discord(config.discord.id, config.discord.secret, redirect('discord')) : null
type Provider = 'google' | 'x' | 'discord'

interface Profile {
  subject: string
  email: string | null
  display: string | null
}

async function profileFromCode(provider: Provider, code: string, verifier: string): Promise<Profile> {
  if (provider === 'discord' && discord) {
    const tokens = await discord.validateAuthorizationCode(code, verifier)
    const res = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${tokens.accessToken()}` } })
    if (!res.ok) throw new Error(`discord users/@me ${res.status}`)
    const body = (await res.json()) as { id: string; username: string; global_name?: string | null }
    return { subject: body.id, email: null, display: body.global_name || body.username }
  }
  if (provider === 'google' && google) {
    const tokens = await google.validateAuthorizationCode(code, verifier)
    const claims = decodeIdToken(tokens.idToken()) as { sub: string; email?: string; name?: string }
    return { subject: claims.sub, email: claims.email ?? null, display: claims.name ?? null }
  }
  if (provider === 'x' && twitter) {
    const tokens = await twitter.validateAuthorizationCode(code, verifier)
    const res = await fetch('https://api.x.com/2/users/me', { headers: { Authorization: `Bearer ${tokens.accessToken()}` } })
    if (!res.ok) throw new Error(`x users/me ${res.status}`)
    const body = (await res.json()) as { data: { id: string; username: string; name: string } }
    return { subject: body.data.id, email: null, display: `@${body.data.username}` }
  }
  throw new Error('provider not configured')
}

const tmpCookie = { httpOnly: true, sameSite: 'Lax' as const, secure: config.secureCookies, path: '/', maxAge: 600 }

export const auth = new Hono<Env>()

auth.get('/providers', (c) => c.json({ google: !!google, x: !!twitter, discord: !!discord, guest: config.allowGuests }))

auth.post('/guest', (c) => {
  if (!config.allowGuests) return c.json({ error: 'guests-disabled' }, 403)
  const existing = currentUser(c)
  if (existing) return c.json({ ok: true, id: existing.id })
  const id = newUser(true)
  q.run('INSERT INTO identities (provider, subject, user_id, created_at) VALUES (?, ?, ?, ?)', 'guest', id, id, Date.now())
  createSession(c, id)
  return c.json({ ok: true, id })
})

auth.get('/:provider{google|x|discord}', (c) => {
  const provider = c.req.param('provider') as Provider
  const state = generateState()
  const verifier = generateCodeVerifier()
  let url: URL
  if (provider === 'google' && google) url = google.createAuthorizationURL(state, verifier, ['openid', 'profile', 'email'])
  else if (provider === 'x' && twitter) url = twitter.createAuthorizationURL(state, verifier, ['users.read', 'tweet.read'])
  else if (provider === 'discord' && discord) url = discord.createAuthorizationURL(state, verifier, ['identify'])
  else return c.text(`${provider} sign-in isn't configured on this server (see server/.env.example)`, 501)
  setCookie(c, 'oauth_state', state, tmpCookie)
  setCookie(c, 'oauth_verifier', verifier, tmpCookie)
  return c.redirect(url.toString())
})

auth.get('/:provider{google|x|discord}/callback', async (c) => {
  const provider = c.req.param('provider') as Provider
  const { code, state } = c.req.query()
  const savedState = getCookie(c, 'oauth_state')
  const verifier = getCookie(c, 'oauth_verifier')
  deleteCookie(c, 'oauth_state', { path: '/' })
  deleteCookie(c, 'oauth_verifier', { path: '/' })
  if (!code || !state || !savedState || state !== savedState || !verifier) return c.redirect(`${config.publicUrl}/play?login=failed`)
  let prof: Profile
  try {
    prof = await profileFromCode(provider, code, verifier)
  } catch (e) {
    console.error('[auth]', provider, e)
    return c.redirect(`${config.publicUrl}/play?login=failed`)
  }
  const known = q.get<{ user_id: string }>('SELECT user_id FROM identities WHERE provider = ? AND subject = ?', provider, prof.subject)
  const playing = currentUser(c)
  let userId: string
  if (known) userId = known.user_id
  else if (playing) {
    // a guest (or someone adding a second sign-in) keeps their progress
    userId = playing.id
    tx(() => {
      q.run('INSERT INTO identities (provider, subject, user_id, email, display, created_at) VALUES (?, ?, ?, ?, ?, ?)', provider, prof.subject, userId, prof.email, prof.display, Date.now())
      q.run('UPDATE users SET is_guest = 0 WHERE id = ?', userId)
    })
  } else {
    userId = newUser(false)
    q.run('INSERT INTO identities (provider, subject, user_id, email, display, created_at) VALUES (?, ?, ?, ?, ?, ?)', provider, prof.subject, userId, prof.email, prof.display, Date.now())
  }
  if (!playing || playing.id !== userId) createSession(c, userId)
  return c.redirect(`${config.publicUrl}/play?login=ok`)
})

auth.post('/logout', (c) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) q.run('DELETE FROM sessions WHERE id = ?', sha(token))
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

/** which sign-ins are attached to an account */
export function linkedProviders(userId: string): string[] {
  return q.all<{ provider: string }>('SELECT provider FROM identities WHERE user_id = ?', userId).map((r) => r.provider)
}
