import { createHash, timingSafeEqual } from 'node:crypto'
import { Hono, type Context, type MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { z } from 'zod'
import { config } from './config.ts'
import { q, tx } from './db.ts'
import { canSendEmail, emailConfigured, normalEmail, signLink, checkLink, fingerprint, makeMail, renderEmail, sendEmail, sendBatch, newToken, siteUrl, type EmailContent, type Mail } from './email.ts'
import type { LaunchMode } from './landing.ts'

/**
 * The launch: before the city opens, the landing page takes emails ("Join the Waitlist") and the game's pages show a
 * Coming Soon page. Testers get in with a preview code. On launch day, switch LAUNCH_MODE to open and send the
 * "we're open" email from the moderator dashboard.
 *
 *   LAUNCH_MODE          waitlist | open. Production defaults to waitlist, development to open.
 *   PREVIEW_CODE         testers open /play?preview=<code> once: a cookie lets that browser into the city (90 days).
 *                        /play?preview=off forgets it. Changing the code locks out every old cookie.
 *   WAITLIST_CONFIRM     false = no confirmation email (single opt-in). Default: confirm whenever email can be sent.
 *   WAITLIST_PUBLIC_MIN  the landing page shows how many people are waiting only from this many (default 100).
 *
 * The waitlist table (db.ts v9): one row per address, lowercased. Only a hash of the confirmation token is stored.
 * Unsubscribing replaces the address with a keyed fingerprint, so it's never emailed again but isn't kept either.
 */

// ---------- launch mode ----------
const asked = (process.env.LAUNCH_MODE ?? '').trim().toLowerCase()
export const launchMode: LaunchMode = asked === 'open' || asked === 'waitlist' ? asked : config.dev ? 'open' : 'waitlist'
const PREVIEW = (process.env.PREVIEW_CODE ?? '').trim()
const PREVIEW_COOKIE = 'club_preview'
const PREVIEW_DAYS = 90
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
/** constant-time comparison (both sides hashed first, so their lengths always match) */
const same = (a: string, b: string) => timingSafeEqual(Buffer.from(sha(a)), Buffer.from(sha(b)))
/** what the preview cookie holds: derived from the code, so a new code retires every old cookie */
const previewMark = PREVIEW ? sha(`club-nyc-preview:${PREVIEW}`).slice(0, 32) : ''

if (asked && asked !== launchMode) console.error(`[launch] WARNING: LAUNCH_MODE="${asked}" isn't "waitlist" or "open", so it's ${launchMode}.`)
if (launchMode === 'waitlist')
  console.log(
    `[launch] waitlist mode: / takes emails and /play shows Coming Soon. ${PREVIEW ? 'Testers get in with /play?preview=<PREVIEW_CODE>.' : 'PREVIEW_CODE is not set, so nobody can open the game (set it to test).'} Set LAUNCH_MODE=open on launch day.`,
  )
else if (!config.dev) console.log('[launch] open: the city is open to everyone (LAUNCH_MODE=open)')

/** a tester's browser (the preview code was entered here) */
export function previewOk(c: Context): boolean {
  if (!previewMark) return false
  const v = getCookie(c, PREVIEW_COOKIE) ?? ''
  return v.length === previewMark.length && timingSafeEqual(Buffer.from(v), Buffer.from(previewMark))
}
/** waitlist mode, and not a tester: this visitor sees Coming Soon instead of the game */
export const gated = (c: Context) => launchMode === 'waitlist' && !previewOk(c)

/** where a preview code may send you back to (one of the game's pages, nothing else) */
const backTo = (path: string) => (/^\/(?:play\/?|play\.html|join\/[A-Za-z0-9_]{1,14}\/?)$/.test(path) ? path : '/play')

export interface GateDecision {
  /** a preview code in the address: go and check it (the code never stays in the address bar) */
  redirect?: string
  /** show the Coming Soon page instead of the game */
  soon: boolean
}
function decide(c: Context, path: string, code: string | null): GateDecision {
  if (launchMode !== 'waitlist') return { soon: false }
  if (code) return { redirect: `/api/launch/preview?code=${encodeURIComponent(code.slice(0, 200))}&to=${encodeURIComponent(backTo(path))}`, soon: false }
  return { soon: !previewOk(c) }
}
/** production: what the server does for /play, /play.html and /join/<name> (index.ts) */
export const playGate = (c: Context) => decide(c, c.req.path, c.req.query('preview') ?? null)

/** Waitlist mode: new guests, sign-ins and accounts are for testers only (everyone else is on the Coming Soon page). */
export const launchGate: MiddlewareHandler = async (c, next) => {
  if (!gated(c)) return next()
  const p = c.req.path
  if (p !== '/api/auth/guest' && p !== '/api/auth/email' && !/^\/api\/auth\/(?:google|x|discord)$/.test(p)) return next()
  // a sign-in button is a full-page visit: land on the Coming Soon page rather than a bare error
  if (c.req.method === 'GET') return c.redirect('/play')
  return c.json({ error: 'coming-soon' }, 403)
}

export const launch = new Hono()
// the mode, for the landing page and the dev server (app/vite.config.ts asks this for every game page)
launch.get('/', (c) => c.json({ mode: launchMode, preview: previewOk(c), soon: gated(c), email: canSendEmail() }))
launch.get('/gate', (c) => {
  let u: URL
  try {
    u = new URL(c.req.query('url') ?? '/play', 'http://x')
  } catch {
    u = new URL('/play', 'http://x')
  }
  return c.json(decide(c, u.pathname, u.searchParams.get('preview')))
})
launch.get('/preview', (c) => {
  const code = (c.req.query('code') ?? '').trim()
  const to = backTo(c.req.query('to') ?? '/play')
  if (code === 'off') {
    deleteCookie(c, PREVIEW_COOKIE, { path: '/' })
    return c.redirect(to)
  }
  if (PREVIEW && code && same(code, PREVIEW)) {
    setCookie(c, PREVIEW_COOKIE, previewMark, { httpOnly: true, sameSite: 'Lax', secure: config.secureCookies, path: '/', maxAge: PREVIEW_DAYS * 86400 })
    return c.redirect(to)
  }
  return c.redirect(`${to}?code=wrong`)
})

// ---------- the waitlist ----------
interface Row {
  id: number
  email: string
  source: string | null
  referrer: string | null
  confirm_hash: string | null
  confirmed_at: number | null
  notified_at: number | null
  unsubscribed_at: number | null
  created_at: number
}
/** still in line (not unsubscribed) */
const ACTIVE = 'unsubscribed_at IS NULL'
/** counted in public and emailed at launch: confirmed, or joined when no confirmation was asked for */
const COUNTED = `${ACTIVE} AND (confirmed_at IS NOT NULL OR confirm_hash IS NULL)`
/** who the launch email goes to (re-running it only reaches people it hasn't reached yet) */
const ELIGIBLE = `${COUNTED} AND notified_at IS NULL`
const DAY = 86400_000

/** double opt-in whenever an email can go out (WAITLIST_CONFIRM=false turns it off) */
const confirmFirst = () => canSendEmail() && process.env.WAITLIST_CONFIRM !== 'false'
/** how many people must be waiting before the landing page says how many */
export const PUBLIC_MIN = Math.max(1, Math.floor(Number(process.env.WAITLIST_PUBLIC_MIN)) || 100)

const cleanSource = (s?: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9:-]/g, '').slice(0, 24) || null
const cleanRef = (s?: string) => (s ?? '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 14) || null
const unsubUrl = (id: number) => siteUrl(`/api/waitlist/unsubscribe?u=${id}.${signLink(`waitlist-unsub:${id}`)}`)

function confirmContent(id: number, token: string): EmailContent {
  return {
    subject: 'Confirm Your Spot on the Club NYC Waitlist',
    preheader: 'One click and you’re in line. No velvet rope, we promise.',
    title: 'One Click and You’re in Line',
    paragraphs: ['Thanks for joining the Club NYC waitlist! Confirm this is your email and we’ll let you know the day the city opens.'],
    button: { label: 'Confirm My Spot', url: siteUrl(`/api/waitlist/confirm?token=${token}`) },
    after: ['Didn’t sign up? Ignore this email and you won’t hear from us again.'],
    unsubscribeUrl: unsubUrl(id),
    reason: 'You’re getting this because this address was entered on the Club NYC waitlist.',
  }
}
function launchContent(id: number): EmailContent {
  return {
    subject: 'Club NYC Is Open!',
    preheader: 'You were on the waitlist. Now you’re on the guest list.',
    title: 'The City Is Open!',
    paragraphs: [
      'You joined the Club NYC waitlist, and the wait is over. Make your New Yorker in 30 seconds, then come say hi in Times Square.',
      'Rent is free, slices are one coin and the pigeons are friendly. Mostly.',
    ],
    button: { label: 'Play Now', url: siteUrl('/play?start=guest') },
    after: ['Club NYC plays in your web browser on a computer. Reading this on your phone? Open it on your laptop later.'],
    unsubscribeUrl: unsubUrl(id),
    reason: 'You’re getting this because you joined the Club NYC waitlist. This is the one email we promised.',
  }
}
const confirmMail = (id: number, email: string, token: string) => makeMail(email, confirmContent(id, token), 'waitlist-confirm')
const launchMail = (id: number, email: string): Mail => makeMail(email, launchContent(id), 'waitlist-launch')

/** the public count, re-counted at most once a minute (and right after anything changes it) */
const counted = { at: 0, n: 0 }
const activeCount = () => q.get<{ n: number }>(`SELECT COUNT(*) AS n FROM waitlist WHERE ${COUNTED}`)!.n
/** a fresh confirmation email at most every 10 minutes per address */
const resentAt = new Map<string, number>()
setInterval(() => {
  const cutoff = Date.now() - 10 * 60_000
  for (const [k, t] of resentAt) if (t < cutoff) resentAt.delete(k)
}, 10 * 60_000).unref()

const Body = z.object({
  email: z.string().max(320),
  source: z.string().max(60).optional(),
  ref: z.string().max(60).optional(),
  // the honeypot: a field people never see (it's off screen and skipped by Tab); only bots fill it in
  website: z.string().max(500).optional(),
})

export const waitlist = new Hono()

waitlist.post('/', async (c) => {
  const parsed = Body.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return c.json({ error: 'bad-email' }, 400)
  const { email: raw, source, ref, website } = parsed.data
  // a bot: say thanks and keep nothing
  if (website?.trim()) return c.json({ ok: true, status: 'added', confirm: confirmFirst() })
  const email = normalEmail(raw)
  if (!email) return c.json({ error: 'bad-email' }, 400)
  const now = Date.now()
  const known = q.get<Row>('SELECT * FROM waitlist WHERE email = ?', email)
  if (known) return c.json(await already(known, now))
  // joined once before and unsubscribed (only a fingerprint was kept): joining again starts fresh
  q.run('DELETE FROM waitlist WHERE email = ?', `unsub:${fingerprint(email)}`)
  const token = confirmFirst() ? newToken() : null
  const ins = q.run('INSERT INTO waitlist (email, source, referrer, confirm_hash, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(email) DO NOTHING', email, cleanSource(source), cleanRef(ref), token ? sha(token) : null, now)
  if (!ins.changes) {
    // the same address twice at once (a double click)
    const row = q.get<Row>('SELECT * FROM waitlist WHERE email = ?', email)
    return c.json(row ? await already(row, now) : { ok: true, status: 'already', pending: false, resent: false })
  }
  counted.at = 0
  const id = Number(ins.lastInsertRowid)
  let confirm = false
  if (token) {
    resentAt.set(email, now)
    confirm = (await sendEmail(confirmMail(id, email, token))).ok
    // the confirmation couldn't go out (an email outage): keep them in line anyway, without the confirm step
    if (!confirm) q.run('UPDATE waitlist SET confirm_hash = NULL WHERE id = ?', id)
  }
  return c.json({ ok: true, status: 'added', confirm })
})

/** already in line; if they never confirmed, send the confirmation again (at most every 10 minutes) */
async function already(row: Row, now: number) {
  const pending = !!row.confirm_hash && !row.confirmed_at
  let resent = false
  if (pending && confirmFirst() && now - (resentAt.get(row.email) ?? 0) > 10 * 60_000) {
    const token = newToken()
    q.run('UPDATE waitlist SET confirm_hash = ? WHERE id = ?', sha(token), row.id)
    resentAt.set(row.email, now)
    resent = (await sendEmail(confirmMail(row.id, row.email, token))).ok
  }
  return { ok: true, status: 'already', pending, resent }
}

// the button in the confirmation email
waitlist.get('/confirm', (c) => {
  const token = c.req.query('token') ?? ''
  const row = token.length >= 20 ? q.get<Row>('SELECT * FROM waitlist WHERE confirm_hash = ?', sha(token)) : undefined
  if (!row || row.unsubscribed_at) return c.redirect('/?waitlist=bad-link')
  if (!row.confirmed_at) {
    q.run('UPDATE waitlist SET confirmed_at = ? WHERE id = ?', Date.now(), row.id)
    counted.at = 0
  }
  return c.redirect('/?waitlist=confirmed')
})

/** one click, no questions: off the list, and the address itself is replaced by a fingerprint */
function unsubscribe(u: string): boolean {
  const m = /^(\d{1,12})\.([\w-]{24})$/.exec(u)
  if (!m || !checkLink(`waitlist-unsub:${m[1]}`, m[2])) return false
  const row = q.get<Row>('SELECT * FROM waitlist WHERE id = ?', Number(m[1]))
  // already gone (deleted on request) or already off the list: nothing to do, and that's fine
  if (row && !row.unsubscribed_at) {
    q.run('UPDATE waitlist SET unsubscribed_at = ?, email = ?, confirm_hash = NULL WHERE id = ?', Date.now(), `unsub:${fingerprint(row.email)}`, row.id)
    counted.at = 0
  }
  return true
}
// the link in every waitlist email
waitlist.get('/unsubscribe', (c) => c.redirect(unsubscribe(c.req.query('u') ?? '') ? '/?waitlist=unsubscribed' : '/?waitlist=bad-link'))
// mail apps' own Unsubscribe button (RFC 8058 one-click: List-Unsubscribe-Post)
waitlist.post('/unsubscribe', (c) => (unsubscribe(c.req.query('u') ?? '') ? c.text('Unsubscribed.') : c.text('That link didn’t work.', 400)))

// the honest count on the landing page: nothing below PUBLIC_MIN (a tiny number reads as "nobody's here")
waitlist.get('/count', (c) => {
  if (Date.now() - counted.at > 60_000) {
    counted.n = activeCount()
    counted.at = Date.now()
  }
  return c.json({ count: counted.n >= PUBLIC_MIN ? counted.n : null })
})

// ---------- the moderator dashboard (admin.ts) ----------
const nyDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
const n = (sql: string, ...a: (string | number)[]) => q.get<{ n: number | null }>(sql, ...a)!.n ?? 0

export function waitlistOverview() {
  const now = Date.now()
  // signups per New York day for the last 30 days (zeros included, oldest first)
  const perDay = new Map<string, number>()
  for (const r of q.all<{ created_at: number }>('SELECT created_at FROM waitlist WHERE created_at > ?', now - 31 * DAY)) {
    const d = nyDay.format(r.created_at)
    perDay.set(d, (perDay.get(d) ?? 0) + 1)
  }
  const days: { day: string; n: number }[] = []
  for (let i = 29; i >= 0; i--) {
    const d = nyDay.format(now - i * DAY)
    if (!days.some((x) => x.day === d)) days.push({ day: d, n: perDay.get(d) ?? 0 })
  }
  return {
    mode: launchMode,
    preview: !!PREVIEW,
    email: { configured: emailConfigured, canSend: canSendEmail(), confirmFirst: confirmFirst() },
    publicMin: PUBLIC_MIN,
    counts: {
      waiting: n(`SELECT COUNT(*) AS n FROM waitlist WHERE ${ACTIVE}`),
      counted: n(`SELECT COUNT(*) AS n FROM waitlist WHERE ${COUNTED}`),
      confirmed: n(`SELECT COUNT(*) AS n FROM waitlist WHERE ${ACTIVE} AND confirmed_at IS NOT NULL`),
      pending: n(`SELECT COUNT(*) AS n FROM waitlist WHERE ${ACTIVE} AND confirm_hash IS NOT NULL AND confirmed_at IS NULL`),
      unsubscribed: n('SELECT COUNT(*) AS n FROM waitlist WHERE unsubscribed_at IS NOT NULL'),
      notified: n('SELECT COUNT(*) AS n FROM waitlist WHERE notified_at IS NOT NULL'),
      eligible: n(`SELECT COUNT(*) AS n FROM waitlist WHERE ${ELIGIBLE}`),
      new24h: n('SELECT COUNT(*) AS n FROM waitlist WHERE created_at > ?', now - DAY),
      new7d: n('SELECT COUNT(*) AS n FROM waitlist WHERE created_at > ?', now - 7 * DAY),
      // joined on the landing page itself (not the Coming Soon page at /play or an invite link), for the conversion rate
      landing7d: n(`SELECT COUNT(*) AS n FROM waitlist WHERE created_at > ? AND COALESCE(source, '') NOT IN ('soon', 'join')`, now - 7 * DAY),
      visits7d: n(`SELECT COUNT(DISTINCT session) AS n FROM events WHERE name = 'landing_view' AND at > ?`, now - 7 * DAY),
    },
    days,
    sources: q.all<{ source: string | null; n: number }>(`SELECT source, COUNT(*) AS n FROM waitlist WHERE ${ACTIVE} GROUP BY source ORDER BY n DESC LIMIT 12`),
    referrers: q.all<{ referrer: string; n: number }>(`SELECT referrer, COUNT(*) AS n FROM waitlist WHERE ${ACTIVE} AND referrer IS NOT NULL GROUP BY referrer ORDER BY n DESC LIMIT 10`),
    job: job ? { ...job } : null,
  }
}

const statusOf = (r: Row) =>
  r.unsubscribed_at ? 'unsubscribed' : r.notified_at ? 'emailed' : r.confirmed_at ? 'confirmed' : r.confirm_hash ? 'waiting to confirm' : 'on the list'
const publicRow = (r: Row) => ({
  id: r.id,
  email: r.unsubscribed_at ? '(unsubscribed)' : r.email,
  source: r.source,
  referrer: r.referrer,
  status: statusOf(r),
  createdAt: r.created_at,
  confirmedAt: r.confirmed_at,
  notifiedAt: r.notified_at,
})
/** the latest signups, or the ones whose address starts with `search` */
export function waitlistRows(search = '', limit = 50) {
  const s = search.trim().toLowerCase().replace(/[%_\\]/g, '')
  const rows = s
    ? q.all<Row>(`SELECT * FROM waitlist WHERE email LIKE ? ORDER BY created_at DESC LIMIT ?`, `${s}%`, limit)
    : q.all<Row>('SELECT * FROM waitlist ORDER BY created_at DESC LIMIT ?', limit)
  return rows.map(publicRow)
}
/** a deletion request: the row goes for good */
export function deleteSignup(id: number): boolean {
  const r = q.run('DELETE FROM waitlist WHERE id = ?', id)
  counted.at = 0
  return r.changes > 0
}

/** everyone still in line, for a spreadsheet (cells that look like formulas are defused) */
export function waitlistCsv(): string {
  const cell = (v: string | number | null) => {
    let s = v === null ? '' : String(v)
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const iso = (t: number | null) => (t ? new Date(t).toISOString() : '')
  const lines = ['email,status,source,invited_by,joined,confirmed,emailed_launch']
  for (const r of q.all<Row>(`SELECT * FROM waitlist WHERE ${ACTIVE} ORDER BY created_at`))
    lines.push([r.email, statusOf(r), r.source, r.referrer, iso(r.created_at), iso(r.confirmed_at), iso(r.notified_at)].map(cell).join(','))
  return lines.join('\r\n') + '\r\n'
}

// ---------- "Email the Waitlist That We're Open" ----------
interface Job {
  running: boolean
  startedAt: number
  finishedAt: number | null
  total: number
  sent: number
  failed: number
  stopped: string | null
  lastError: string | null
}
let job: Job | null = null
const BATCH = 100

/** the launch email as it'll look (the dashboard's Preview button) */
export const launchEmailPreview = () => renderEmail(launchContent(0)).html

/** one copy to an address of the moderator's choosing (not added to the list) */
export async function sendLaunchTest(to: unknown) {
  const email = normalEmail(to)
  if (!email) return { ok: false, error: 'bad-email' }
  if (!canSendEmail()) return { ok: false, error: 'email-off' }
  const r = await sendEmail(launchMail(0, email))
  return { ok: r.ok, error: r.error, logged: r.logged }
}

/**
 * Send the launch email to everyone eligible, 100 per call. Each row is marked notified_at once its batch is accepted,
 * unsubscribed and already-emailed people are skipped, and every batch carries an idempotency key, so running it again
 * (after a crash, a quota hiccup, or new signups) only reaches people it hasn't reached yet.
 */
export function startLaunchEmail(): { ok: boolean; error?: string; total?: number } {
  if (job?.running) return { ok: false, error: 'already-running' }
  if (!canSendEmail()) return { ok: false, error: 'email-off' }
  const total = n(`SELECT COUNT(*) AS n FROM waitlist WHERE ${ELIGIBLE}`)
  if (!total) return { ok: false, error: 'nobody-left' }
  job = { running: true, startedAt: Date.now(), finishedAt: null, total, sent: 0, failed: 0, stopped: null, lastError: null }
  console.log(`[waitlist] launch email: sending to ${total} ${total === 1 ? 'person' : 'people'}`)
  void runLaunchEmail(job)
  return { ok: true, total }
}

async function runLaunchEmail(j: Job) {
  let lastId = 0
  let failures = 0
  const markSent = (ids: number[]) => {
    const now = Date.now()
    tx(() => {
      for (const id of ids) q.run('UPDATE waitlist SET notified_at = ? WHERE id = ? AND notified_at IS NULL', now, id)
    })
    j.sent += ids.length
  }
  try {
    for (;;) {
      const rows = q.all<{ id: number; email: string }>(`SELECT id, email FROM waitlist WHERE id > ? AND ${ELIGIBLE} ORDER BY id LIMIT ?`, lastId, BATCH)
      if (!rows.length) break
      lastId = rows[rows.length - 1].id
      const key = `club-nyc-launch-${sha(rows.map((r) => r.id).join(',')).slice(0, 40)}`
      const r = await sendBatch(rows.map((x) => launchMail(x.id, x.email)), key)
      if (r.ok) {
        markSent(rows.map((x) => x.id))
        failures = 0
      } else if (r.invalid) {
        // Resend refused the batch: maybe one address it won't take. Send these one at a time so the rest still go.
        for (const x of rows) {
          const one = await sendEmail(launchMail(x.id, x.email))
          if (one.ok) markSent([x.id])
          else {
            j.failed++
            j.lastError = one.error ?? 'failed'
            if (one.fatal) break
          }
          await new Promise((ok) => setTimeout(ok, 150))
        }
      } else {
        j.failed += rows.length
        j.lastError = r.error ?? 'failed'
        // a bad key or no quota left: stop now (run it again once that's fixed)
        if (r.fatal || ++failures >= 3) {
          j.stopped = r.fatal ? `Stopped: ${r.error}` : 'Stopped after 3 failed batches in a row'
          break
        }
      }
      // Resend allows 10 requests a second per team: stay well under it
      await new Promise((ok) => setTimeout(ok, 300))
    }
  } catch (e) {
    j.stopped = `Stopped: ${String((e as Error)?.message ?? e)}`
  } finally {
    j.running = false
    j.finishedAt = Date.now()
    counted.at = 0
    console.log(`[waitlist] launch email: ${j.sent} sent, ${j.failed} failed${j.stopped ? ` (${j.stopped})` : ''}`)
  }
}
