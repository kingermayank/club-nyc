import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { Google, Twitter, Discord, generateCodeVerifier, generateState, decodeIdToken } from 'arctic'
import { config } from './config.ts'
import { q, tx, type UserRow } from './db.ts'
import { banOf } from './moderation.ts'
import { canSendEmail, normalEmail, makeMail, sendEmail, newToken, type EmailContent } from './email.ts'

/**
 * Accounts, low friction first:
 *  1. "Play now" creates a guest account instantly (cookie session, no forms).
 *  2. "Sign in with Google / X / Discord" either logs into an existing account, or — when you're already
 *     playing as a guest — attaches that identity to your guest so you keep everything.
 *  3. "Continue with Email" does the same with a one-time link sent to your inbox (identities provider 'email').
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

auth.get('/providers', (c) => c.json({ google: !!google, x: !!twitter, discord: !!discord, email: canSendEmail(), guest: config.allowGuests }))

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
  if (known && playing && playing.id !== known.user_id) {
    // this sign-in already belongs to another New Yorker: ask first, since switching leaves the one you're playing
    // behind (a guest has no other way back to theirs)
    const token = randomBytes(24).toString('base64url')
    for (const [k, v] of switches) if (Date.now() - v.at > SWITCH_MS) switches.delete(k)
    switches.set(sha(token), { to: known.user_id, from: playing.id, provider, at: Date.now() })
    setCookie(c, 'switch_to', token, tmpCookie)
    return c.redirect(`${config.publicUrl}/play?login=switch`)
  }
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

// ---------- "that sign-in is someone else's": switch to them, or stay ----------
// The pending switch lives here (keyed by the SHA-256 of a short-lived cookie) for 10 minutes; it only works for the
// session that started it, and either answer clears it.
const SWITCH_MS = 10 * 60 * 1000
const switches = new Map<string, { to: string; from: string; provider: Provider; at: number }>()
function pendingSwitch(c: Context) {
  const token = getCookie(c, 'switch_to')
  const s = token ? switches.get(sha(token)) : undefined
  const me = currentUser(c)
  if (!token || !s || !me || s.from !== me.id || Date.now() - s.at > SWITCH_MS) return null
  return { key: sha(token), s, me }
}
auth.get('/switch', (c) => {
  const p = pendingSwitch(c)
  const to = p && q.get<UserRow>('SELECT * FROM users WHERE id = ?', p.s.to)
  if (!p || !to) return c.json({ error: 'no-switch' }, 404)
  return c.json({ provider: p.s.provider, to: { name: to.name, look: to.look ? JSON.parse(to.look) : null }, from: { name: p.me.name, look: p.me.look ? JSON.parse(p.me.look) : null, guest: !!p.me.is_guest } })
})
auth.post('/switch', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { go?: unknown } | null
  const p = pendingSwitch(c)
  deleteCookie(c, 'switch_to', { path: '/' })
  if (!p) return c.json({ error: 'no-switch' }, 404)
  switches.delete(p.key)
  if (body?.go === true) createSession(c, p.s.to)
  return c.json({ ok: true, switched: body?.go === true })
})

// ---------- email sign-in: a one-time link instead of a password ----------
// The link's token is random; only its SHA-256 is stored (email_logins), it works once, for 15 minutes. If you're signed
// in when you ask (a guest linking their email from the player card), the email is attached to that account when the
// link is used, wherever it's opened, just like Google / X keep a guest's New Yorker.
const LINK_MINUTES = 15
interface EmailLogin {
  token_hash: string
  email: string
  guest_id: string | null
  expires_at: number
  used_at: number | null
  created_at: number
}
const emailOwner = (email: string) =>
  q.get<UserRow>(`SELECT u.* FROM identities i JOIN users u ON u.id = i.user_id WHERE i.provider = 'email' AND i.subject = ?`, email) ?? null

function signInContent(url: string, existing: UserRow | null, linking: UserRow | null): EmailContent {
  const name = (u: UserRow | null) => (u?.profile_done && u.name ? u.name : null)
  const after = ['The link works once and expires in 15 minutes. Didn’t ask for it? You can ignore this email: nobody gets in without clicking the link.']
  if (linking && !existing)
    return {
      subject: 'Link Your Email to Club NYC',
      preheader: 'One click and you can sign in with this email on any computer.',
      title: 'Link Your Email',
      paragraphs: [`Click the button to link this email to ${name(linking) ? `your New Yorker, ${name(linking)}` : 'your New Yorker'}. Then you can sign in with it on any computer.`],
      button: { label: 'Link My Email', url },
      after,
    }
  const who = name(existing)
  if (who && linking && existing && existing.id !== linking.id)
    return {
      subject: 'Your Club NYC Sign-In Link',
      preheader: `This email already belongs to ${who}.`,
      title: `This Email Belongs to ${who}`,
      paragraphs: [`This email is already linked to the New Yorker ${who}. Click the button to sign in as ${who}.`],
      button: { label: `Sign In as ${who}`, url },
      after,
    }
  return who
    ? {
        subject: 'Your Club NYC Sign-In Link',
        preheader: 'It works once and expires in 15 minutes.',
        title: `Welcome Back, ${who}!`,
        paragraphs: [`Click the button to sign in to Club NYC as ${who}. The pigeons kept your spot warm.`],
        button: { label: 'Sign In to Club NYC', url },
        after,
      }
    : {
        subject: 'Your Club NYC Sign-In Link',
        preheader: 'It works once and expires in 15 minutes.',
        title: 'Here’s Your Sign-In Link',
        paragraphs: ['Click the button to sign in to Club NYC. Then make your New Yorker and head into the city.'],
        button: { label: 'Sign In to Club NYC', url },
        after,
      }
}

auth.post('/email', async (c) => {
  if (!canSendEmail()) return c.json({ error: 'email-off' }, 501)
  const body = (await c.req.json().catch(() => null)) as { email?: unknown } | null
  const email = normalEmail(body?.email)
  if (!email) return c.json({ error: 'bad-email' }, 400)
  const now = Date.now()
  // per address, so nobody can fill someone else's inbox: 3 links per 15 minutes, 10 a day
  const since = (ms: number) => q.get<{ n: number }>('SELECT COUNT(*) AS n FROM email_logins WHERE email = ? AND created_at > ?', email, now - ms)!.n
  if (since(LINK_MINUTES * 60_000) >= 3 || since(86400_000) >= 10) return c.json({ error: 'slow-down' }, 429)
  const playing = currentUser(c)
  const token = newToken()
  q.run('INSERT INTO email_logins (token_hash, email, guest_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?)', sha(token), email, playing?.id ?? null, now + LINK_MINUTES * 60_000, now)
  const url = `${config.publicUrl}/api/auth/email/verify?token=${token}`
  const sent = await sendEmail(makeMail(email, signInContent(url, emailOwner(email), playing), 'sign-in'))
  if (!sent.ok) return c.json({ error: 'not-sent' }, 502)
  // the same answer whether or not the address has an account (nobody can use this to find out who plays)
  return c.json({ ok: true, minutes: LINK_MINUTES })
})

/** A signed-in player clicked an old link: they're still in, so a small page says so instead of a sign-in screen. */
const usedLinkPage = (name: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>That Link Has Expired · Club NYC</title><link rel="icon" type="image/png" href="/art/icons/taxi.png">
<style>
@font-face { font-family: 'Burbank Display'; src: url('/fonts/BurbankSmall-Bold.otf') format('opentype'); ascent-override: 85%; descent-override: 15%; }
@font-face { font-family: 'Burbank'; src: url('/fonts/BurbankSmall-Medium.otf') format('opentype'); ascent-override: 85%; descent-override: 15%; }
body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; box-sizing: border-box; background: #78bdf2; color: #1d2140; font: 18px/1.5 'Burbank', system-ui, sans-serif; }
main { max-width: 440px; padding: 32px 30px 30px; border: 5px solid #1d2140; border-radius: 28px; background: #fffdf6; box-shadow: 0 7px 0 #1d2140; text-align: center; }
img { width: 140px; height: auto; }
h1 { margin: 12px 0 6px; font: 30px/1.2 'Burbank Display', system-ui, sans-serif; }
p { margin: 0 0 22px; }
a { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 26px; border: 3px solid #1d2140; border-radius: 16px; background: linear-gradient(#8be28b, #2fa54a); color: #fff; font: 20px/1.15 'Burbank Display', system-ui, sans-serif; text-decoration: none; text-shadow: 0 2px 0 #1b6b2e; box-shadow: 0 5px 0 #1d2140; }
</style></head>
<body><main><img src="/art/ui/logo.png" alt="Club NYC" width="900" height="507">
<h1>That Link Has Expired</h1>
<p>Sign-in links work once, for ${LINK_MINUTES} minutes. You’re still signed in${name ? ` as <b>${name.replace(/[^A-Za-z0-9_]/g, '')}</b>` : ''}, so nothing is lost. To link your email, open your player card and press Link Email again.</p>
<a href="/play">Back to the City</a></main></body></html>`

auth.get('/email/verify', (c) => {
  const token = c.req.query('token') ?? ''
  const now = Date.now()
  const playing = currentUser(c)
  const row = token.length >= 32 ? q.get<EmailLogin>('SELECT * FROM email_logins WHERE token_hash = ?', sha(token)) : undefined
  // one use only: claiming it is a single UPDATE, so two quick clicks can't both sign in
  const fresh = !!row && !row.used_at && row.expires_at > now && q.run('UPDATE email_logins SET used_at = ? WHERE token_hash = ? AND used_at IS NULL', now, row.token_hash).changes === 1
  if (!row || !fresh) return playing ? c.html(usedLinkPage(playing.name ?? '')) : c.redirect(`${config.publicUrl}/play?email=expired`)
  const known = emailOwner(row.email)
  let userId: string
  if (known) userId = known.id
  else {
    // the account that asked for the link (a guest linking their email), else whoever is signed in on this browser
    const asked = row.guest_id ? q.get<UserRow>('SELECT * FROM users WHERE id = ?', row.guest_id) : undefined
    const target = asked ?? playing
    userId = target ? target.id : newUser(false)
    tx(() => {
      q.run('INSERT INTO identities (provider, subject, user_id, email, display, created_at) VALUES (?, ?, ?, ?, ?, ?)', 'email', row.email, userId, row.email, null, now)
      q.run('UPDATE users SET is_guest = 0 WHERE id = ?', userId)
    })
  }
  if (!playing || playing.id !== userId) createSession(c, userId)
  return c.redirect(`${config.publicUrl}/play?login=ok`)
})

// links are short-lived; the rows are kept a day for the per-address limits above, then removed
const purgeEmailLogins = () => q.run('DELETE FROM email_logins WHERE created_at < ?', Date.now() - 86400_000)
purgeEmailLogins()
setInterval(purgeEmailLogins, 3600_000).unref()

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
