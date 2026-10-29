import { createHmac, timingSafeEqual } from 'node:crypto'
import { Hono, type MiddlewareHandler } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { z } from 'zod'
import { config } from './config.ts'
import { q, publicUser, type UserRow } from './db.ts'
import { linkedProviders } from './auth.ts'
import { applyModAction, dismissReport, banOf, muteOf, type ModActionKind } from './moderation.ts'
import { payout, ensureWallet, recentLedger } from './economy.ts'
import { referralStats } from './referrals.ts'
import { kickUser, setLiveMute, warnUser, announce, setMaintenance, maintenanceState, liveSnapshot, profileChanged, walletChanged, presenceOf } from './game/realtime.ts'
import { listBackups, snapshotNow, backupFile } from './ops.ts'
import { growth } from './growth.ts'
import { hq } from './hq.ts'
import { waitlistOverview, waitlistRows, waitlistCsv, deleteSignup, startLaunchEmail, sendLaunchTest, launchEmailPreview, launchModeNow } from './waitlist.ts'
import { createReadStream, statSync } from 'node:fs'
import { basename } from 'node:path'
import { Readable } from 'node:stream'

/**
 * Launch HQ's API (the page is app/public/hq.html; /admin.html just points there): the go-to-market pages under
 * /hq and the moderator tools below. One shared key (ADMIN_TOKEN) unlocks it; a signed, httpOnly cookie keeps you in for 30 days.
 */
// development: an easy key so Launch HQ just opens (production always needs ADMIN_TOKEN)
export const adminToken = config.adminToken || (config.dev ? 'clubnyc123' : '')
if (!config.adminToken && config.dev) console.log(`[club-nyc] Launch HQ (dev): /hq.html, key ${adminToken}`)
else if (!adminToken) console.warn('[club-nyc] ADMIN_TOKEN is not set, so the moderator dashboard is switched off')

const COOKIE = 'club_admin'
// stay signed in on this computer for 30 days (the cookie is httpOnly and signed)
const HOURS = 24 * 30
const sign = (exp: number) => createHmac('sha256', adminToken).update(`admin:${exp}`).digest('base64url')
const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))
// the key is typed by a person: "Club NYC 123" and "clubnyc123" are the same key
const typed = (t: string) => t.toLowerCase().replace(/\s+/g, '')
function sessionOk(v: string | undefined): boolean {
  if (!v || !adminToken) return false
  const [exp, sig] = v.split('.')
  return !!exp && !!sig && Number(exp) > Date.now() && same(sign(Number(exp)), sig)
}
const requireAdmin: MiddlewareHandler = async (c, next) => {
  if (!sessionOk(getCookie(c, COOKIE))) return c.json({ error: 'admin-only' }, 401)
  await next()
}

export const admin = new Hono()

admin.post('/login', async (c) => {
  if (!adminToken) return c.json({ error: 'disabled' }, 404)
  const body = (await c.req.json().catch(() => null)) as { token?: unknown } | null
  if (!same(typed(String(body?.token ?? '')), typed(adminToken))) return c.json({ error: 'bad-token' }, 401)
  const exp = Date.now() + HOURS * 3600_000
  setCookie(c, COOKIE, `${exp}.${sign(exp)}`, { httpOnly: true, sameSite: 'Strict', secure: config.secureCookies, path: '/api/admin', maxAge: HOURS * 3600 })
  return c.json({ ok: true })
})
admin.post('/logout', (c) => {
  deleteCookie(c, COOKIE, { path: '/api/admin' })
  return c.json({ ok: true })
})
admin.get('/session', (c) => c.json({ ok: sessionOk(getCookie(c, COOKIE)), enabled: !!adminToken }))

admin.use('*', requireAdmin)

// Launch HQ (hq.html): the go-to-market page, same login
admin.route('/hq', hq)

// ---------- the city at a glance ----------
const DAY = 86400_000
admin.get('/overview', (c) => {
  const now = Date.now()
  const n = (sql: string, ...a: (string | number)[]) => q.get<{ n: number | null }>(sql, ...a)!.n ?? 0
  const mem = process.memoryUsage()
  return c.json({
    live: liveSnapshot(),
    accounts: {
      total: n('SELECT COUNT(*) AS n FROM users WHERE profile_done = 1'),
      new24h: n('SELECT COUNT(*) AS n FROM users WHERE profile_done = 1 AND created_at > ?', now - DAY),
      new7d: n('SELECT COUNT(*) AS n FROM users WHERE profile_done = 1 AND created_at > ?', now - 7 * DAY),
      active24h: n('SELECT COUNT(*) AS n FROM users WHERE profile_done = 1 AND last_seen > ?', now - DAY),
      linked: n(`SELECT COUNT(DISTINCT user_id) AS n FROM identities WHERE provider != 'guest'`),
      invited: n('SELECT COUNT(*) AS n FROM referrals'),
      invited24h: n('SELECT COUNT(*) AS n FROM referrals WHERE at > ?', now - DAY),
    },
    safety: {
      openReports: n(`SELECT COUNT(*) AS n FROM reports WHERE status = 'open'`),
      reports24h: n('SELECT COUNT(*) AS n FROM reports WHERE created_at > ?', now - DAY),
      banned: n('SELECT COUNT(*) AS n FROM users WHERE banned_until > ?', now),
      muted: n('SELECT COUNT(*) AS n FROM users WHERE muted_until > ?', now),
      actions24h: n('SELECT COUNT(*) AS n FROM mod_actions WHERE at > ?', now - DAY),
      chat24h: n('SELECT COUNT(*) AS n FROM chat_log WHERE at > ?', now - DAY),
    },
    economy: {
      coins: n('SELECT SUM(coins) AS n FROM users WHERE coins IS NOT NULL'),
      earned24h: n('SELECT SUM(delta) AS n FROM ledger WHERE delta > 0 AND at > ?', now - DAY),
      spent24h: -n('SELECT SUM(delta) AS n FROM ledger WHERE delta < 0 AND at > ?', now - DAY),
    },
    growth: growth(),
    creator: creatorFunnel(now),
    landing: landingFunnel(now),
    errors24h: n('SELECT COUNT(*) AS n FROM client_errors WHERE at > ?', now - DAY),
    server: { uptimeSec: Math.round(process.uptime()), rssMB: Math.round(mem.rss / 1048576), heapMB: Math.round(mem.heapUsed / 1048576), node: process.version },
  })
})

/** last 7 days on the landing page: visits, Play clicks, and how many of those visits made a New Yorker (same session) */
function landingFunnel(now: number) {
  const since = now - 7 * DAY
  const reached = (name: string, detail?: string) =>
    q.get<{ n: number }>(`SELECT COUNT(DISTINCT session) AS n FROM events WHERE name = ? AND at > ?${detail ? ' AND detail LIKE ?' : ''}`, ...(detail ? [name, since, detail] : [name, since]))!.n
  const fromLanding = (name: string) =>
    q.get<{ n: number }>(`SELECT COUNT(DISTINCT e.session) AS n FROM events e WHERE e.name = ? AND e.at > ? AND EXISTS (SELECT 1 FROM events l WHERE l.session = e.session AND l.name = 'landing_view')`, name, since)!.n
  return {
    visits: reached('landing_view'),
    phones: reached('landing_view', 'phone%'),
    play: reached('landing_play'),
    created: fromLanding('creator_done'),
    spawned: fromLanding('spawned'),
    sent: reached('landing_send'),
    discord: reached('landing_discord'),
    trailer: reached('landing_trailer'),
  }
}

/** last 7 days: how many page-load sessions reached each creator step, and the median seconds to finish */
function creatorFunnel(now: number) {
  const since = now - 7 * DAY
  const reached = (name: string) => q.get<{ n: number }>('SELECT COUNT(DISTINCT session) AS n FROM events WHERE name = ? AND at > ?', name, since)!.n
  const times = q.all<{ ms: number }>(`SELECT ms FROM events WHERE name = 'creator_done' AND ms IS NOT NULL AND at > ? ORDER BY ms`, since).map((r) => r.ms)
  return {
    opened: reached('creator_open'),
    presets: reached('look_preset'),
    shuffled: reached('look_shuffle'),
    tweaked: reached('look_tweak'),
    nameScreen: reached('name_screen'),
    wheels: reached('name_wheel'),
    typed: reached('name_typed'),
    done: reached('creator_done'),
    spawned: reached('spawned'),
    medianSec: times.length ? Math.round(times[Math.floor(times.length / 2)] / 1000) : null,
  }
}

// ---------- reports ----------
const nameOf = (id: string) => q.get<{ name: string | null }>('SELECT name FROM users WHERE id = ?', id)?.name ?? '(deleted)'
admin.get('/reports', (c) => {
  const status = ['open', 'actioned', 'dismissed'].includes(c.req.query('status') ?? '') ? c.req.query('status')! : 'open'
  const rows = q.all<{ id: number; reporter: string; target: string; reason: string; context: string; created_at: number; status: string; resolution: string | null }>(
    `SELECT * FROM reports WHERE status = ? ORDER BY created_at ${status === 'open' ? 'ASC' : 'DESC'} LIMIT 100`,
    status,
  )
  return c.json({
    reports: rows.map((r) => {
      const t = q.get<UserRow>('SELECT * FROM users WHERE id = ?', r.target)
      return {
        ...r,
        reporterName: nameOf(r.reporter),
        targetName: t?.name ?? '(deleted)',
        targetReports: q.get<{ n: number }>('SELECT COUNT(*) AS n FROM reports WHERE target = ?', r.target)!.n,
        targetActions: q.get<{ n: number }>('SELECT COUNT(*) AS n FROM mod_actions WHERE target = ?', r.target)!.n,
        targetMuted: t ? muteOf(t) : null,
        targetBanned: t ? banOf(t) : null,
      }
    }),
  })
})
admin.post('/reports/:id/dismiss', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { note?: string }
  dismissReport(Number(c.req.param('id')), 'moderator', String(body.note ?? '').slice(0, 200))
  return c.json({ ok: true })
})

// ---------- players ----------
admin.get('/users', (c) => {
  const s = (c.req.query('q') ?? '').trim()
  const rows = s
    ? q.all<UserRow>(`SELECT * FROM users WHERE profile_done = 1 AND (name LIKE ? OR id = ?) ORDER BY last_seen DESC LIMIT 25`, `${s.replace(/[%_]/g, '')}%`, s)
    : q.all<UserRow>('SELECT * FROM users WHERE profile_done = 1 ORDER BY last_seen DESC LIMIT 25')
  return c.json({ users: rows.map((u) => ({ ...publicUser(u), lastSeen: u.last_seen, online: presenceOf(u.id).online, banned: banOf(u), muted: muteOf(u) })) })
})

admin.get('/users/:id', (c) => {
  const u = q.get<UserRow>('SELECT * FROM users WHERE id = ?', c.req.param('id'))
  if (!u) return c.json({ error: 'not-found' }, 404)
  return c.json({
    user: { ...publicUser(u), createdAt: u.created_at, lastSeen: u.last_seen, playMinutes: Math.round(u.play_ms / 60000), guest: !!u.is_guest, ageOk: !!u.age_ok, consent: u.consent_version ? { version: u.consent_version, at: u.consent_at } : null, providers: linkedProviders(u.id), invitedBy: u.invited_by ? nameOf(u.invited_by) : null },
    presence: presenceOf(u.id),
    banned: banOf(u),
    muted: muteOf(u),
    wallet: ensureWallet(u),
    ledger: recentLedger(u.id, 20),
    referrals: referralStats(u.id),
    chat: q.all('SELECT room, text, at FROM chat_log WHERE user_id = ? ORDER BY at DESC LIMIT 100', u.id),
    reportsAgainst: q.all('SELECT id, reporter, reason, context, created_at, status FROM reports WHERE target = ? ORDER BY created_at DESC LIMIT 20', u.id).map((r) => ({ ...(r as object), reporterName: nameOf((r as { reporter: string }).reporter) })),
    reportsFiled: q.get<{ n: number }>('SELECT COUNT(*) AS n FROM reports WHERE reporter = ?', u.id)!.n,
    actions: q.all('SELECT action, reason, minutes, by, at FROM mod_actions WHERE target = ? ORDER BY at DESC LIMIT 20', u.id),
  })
})

const ActionBody = z.object({
  action: z.enum(['warn', 'mute', 'unmute', 'ban', 'unban', 'rename']),
  reason: z.string().max(300).optional(),
  minutes: z.number().int().min(0).max(60 * 24 * 365).optional(),
  reportId: z.number().int().optional(),
})
/** Apply a decision and make it felt immediately for anyone online. */
function act(target: string, a: z.infer<typeof ActionBody>) {
  const r = applyModAction(target, { ...a, action: a.action as ModActionKind, by: 'moderator' })
  if (!r.ok || !r.user) return r
  const reason = a.reason ?? ''
  switch (a.action) {
    case 'warn':
      warnUser(target, reason || 'Please keep it friendly. See the community rules.')
      break
    case 'mute':
      setLiveMute(target, r.user.muted_until ?? 0, reason)
      break
    case 'unmute':
      setLiveMute(target, 0, '')
      break
    case 'ban':
      kickUser(target, `Your account has been ${a.minutes ? 'suspended' : 'banned'}${reason ? `: ${reason}` : ''}.`)
      break
    case 'rename':
      profileChanged(r.user)
      warnUser(target, 'A moderator reset your name. You’ll pick a new one next time you visit.')
      break
  }
  return { ok: true }
}
admin.post('/users/:id/action', async (c) => {
  const body = ActionBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'bad-request' }, 400)
  return c.json(act(c.req.param('id'), body.data))
})
admin.post('/reports/:id/action', async (c) => {
  const body = ActionBody.safeParse(await c.req.json().catch(() => null))
  const report = q.get<{ target: string }>('SELECT target FROM reports WHERE id = ?', Number(c.req.param('id')))
  if (!body.success || !report) return c.json({ error: 'bad-request' }, 400)
  return c.json(act(report.target, { ...body.data, reportId: Number(c.req.param('id')) }))
})

const CoinsBody = z.object({ amount: z.number().int().min(-100_000).max(100_000), reason: z.string().max(120) })
admin.post('/users/:id/coins', async (c) => {
  const body = CoinsBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'bad-request' }, 400)
  const id = c.req.param('id')
  const r = payout(id, body.data.amount, body.data.amount < 0 ? 'admin-remove' : 'admin', `admin:${Date.now()}`)
  q.run('INSERT INTO mod_actions (target, action, reason, minutes, by, at) VALUES (?, ?, ?, NULL, ?, ?)', id, 'coins', `${body.data.amount}: ${body.data.reason}`, 'moderator', Date.now())
  const w = ensureWallet(q.get<UserRow>('SELECT * FROM users WHERE id = ?', id)!)
  walletChanged(id, w, body.data.amount > 0 ? body.data.reason : undefined)
  return c.json(r)
})

// ---------- chat search (raids, spam waves) ----------
admin.get('/chat', (c) => {
  const room = c.req.query('room') ?? ''
  const text = (c.req.query('q') ?? '').trim()
  const rows = q.all<{ user_id: string; room: string; text: string; at: number }>(
    `SELECT user_id, room, text, at FROM chat_log WHERE (? = '' OR room = ?) AND (? = '' OR text LIKE ?) ORDER BY at DESC LIMIT 200`,
    room, room, text, `%${text.replace(/[%_]/g, '')}%`,
  )
  return c.json({ chat: rows.map((r) => ({ ...r, name: nameOf(r.user_id) })) })
})

// ---------- crash reports from players' browsers ----------
admin.get('/errors', (c) => {
  const rows = q.all<{ message: string; n: number; last: number; url: string | null; stack: string | null; ua: string | null }>(
    `SELECT message, COUNT(*) AS n, MAX(at) AS last, MAX(url) AS url, MAX(stack) AS stack, MAX(ua) AS ua FROM client_errors WHERE at > ? GROUP BY message ORDER BY n DESC LIMIT 50`,
    Date.now() - 7 * DAY,
  )
  return c.json({ errors: rows })
})

// ---------- talking to the whole city ----------
admin.post('/announce', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { text?: string }
  const text = String(body.text ?? '').trim().slice(0, 200)
  if (!text) return c.json({ error: 'empty' }, 400)
  announce(text)
  return c.json({ ok: true })
})
admin.get('/maintenance', (c) => c.json(maintenanceState()))
admin.post('/maintenance', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { on?: boolean; message?: string }
  setMaintenance(!!body.on, body.message ? String(body.message).slice(0, 200) : undefined)
  return c.json(maintenanceState())
})

// ---------- database backups (see ops.ts and docs/runbook.md) ----------
admin.get('/backups', (c) => c.json({ backups: listBackups() }))
admin.post('/backups', (c) => {
  try {
    return c.json({ ok: true, file: basename(snapshotNow()) })
  } catch (e) {
    return c.json({ ok: false, error: String(e) }, 500)
  }
})
admin.get('/backups/:name', (c) => {
  const file = backupFile(c.req.param('name'))
  if (!file) return c.json({ error: 'not-found' }, 404)
  const body = Readable.toWeb(createReadStream(file)) as ReadableStream
  return new Response(body, {
    headers: {
      'content-type': 'application/vnd.sqlite3',
      'content-length': String(statSync(file).size),
      'content-disposition': `attachment; filename="${basename(file)}"`,
      // a database copy must never sit in a browser or proxy cache
      'cache-control': 'no-store',
    },
  })
})

// ---------- the launch waitlist (waitlist.ts) ----------
admin.get('/waitlist', (c) => c.json(waitlistOverview()))
admin.get('/waitlist/rows', (c) => c.json({ rows: waitlistRows(c.req.query('q') ?? '') }))
// a deletion request ("please forget my email"): gone for good
admin.post('/waitlist/:id/delete', (c) => c.json({ ok: deleteSignup(Number(c.req.param('id'))) }))
admin.get('/waitlist.csv', (c) =>
  c.body(waitlistCsv(), 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="club-nyc-waitlist-${new Date().toISOString().slice(0, 10)}.csv"`,
    // a list of email addresses: never cached anywhere
    'cache-control': 'no-store',
  }),
)
// "Email the Waitlist That We're Open": runs in the background; the dashboard polls GET /waitlist for progress.
// While the city is still in waitlist mode the email would send people to the Coming Soon page, so that needs `force`.
admin.post('/waitlist/launch-email', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { force?: unknown }
  if (launchModeNow() === 'waitlist' && body.force !== true) return c.json({ ok: false, error: 'still-waitlist' })
  return c.json(startLaunchEmail())
})
admin.post('/waitlist/launch-email/test', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { to?: unknown }
  return c.json(await sendLaunchTest(body.to))
})
admin.get('/waitlist/launch-email/preview', (c) => c.html(launchEmailPreview()))
