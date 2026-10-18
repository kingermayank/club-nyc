import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { deleteCookie } from 'hono/cookie'
import { z } from 'zod'
import { q, tx, publicUser, type UserRow } from './db.ts'
import { requireUser, currentUser, linkedProviders, SESSION_COOKIE, type Env } from './auth.ts'
import { config } from './config.ts'
import { cleanChat } from './game/filter.ts'
import { GAMES, TEAMS, validLook, nameProblem, weekId } from './game/rules.ts'
import { presenceOf, onlineCount, roomCounts, friendshipChanged, blockChanged, profileChanged, notifyUser, cityPulse, partiesFor, partyOf, stats, walletChanged, kickUser, setLiveMute } from './game/realtime.ts'
import { ensureWallet, claim, debit, buyItem, buyHome, grantItem, grantCreatorItems, ownedLook, withWallet, payJob, daysThisWeek, daysVisited } from './economy.ts'
import { banOf, autoModAfterReport } from './moderation.ts'
import { inviterByName, recordReferral, referralStats } from './referrals.ts'
import { POLICY_VERSION, MIN_AGE, oldEnough } from '../../app/src/data/policy.ts'

export const api = new Hono<Env>()

const meOf = (u: UserRow) => ({
  ...publicUser(u),
  profileDone: !!u.profile_done,
  /** the Terms / Privacy / Rules version this player agreed to (the game asks again when it's out of date) */
  consentVersion: u.consent_version ?? null,
  isGuest: !!u.is_guest,
  providers: linkedProviders(u.id),
  nameReset: !!u.name_reset,
  invites: q.get<{ n: number }>('SELECT COUNT(*) AS n FROM referrals WHERE inviter = ?', u.id)!.n,
  week: daysThisWeek(u.id),
  days: daysVisited(u.id),
})

// ---------- who am I ----------
api.get('/me', (c) => {
  // signed out is a normal state (the front door), so it's a 200 with no user rather than a 401
  const u = currentUser(c)
  if (!u) return c.json({ user: null })
  const ban = banOf(u)
  if (ban) return c.json({ user: null, banned: { ...ban, contact: config.contactEmail } })
  return c.json({ user: meOf(u) })
})

/** Remove an account and everything attached to it from the live database. */
function deleteAccount(id: string) {
  tx(() => {
    q.run('DELETE FROM blocks WHERE a = ? OR b = ?', id, id)
    q.run('DELETE FROM reports WHERE reporter = ?', id)
    q.run('DELETE FROM team_points WHERE user_id = ?', id)
    q.run('DELETE FROM game_runs WHERE user_id = ?', id)
    q.run('DELETE FROM chat_log WHERE user_id = ?', id)
    q.run('DELETE FROM client_errors WHERE user_id = ?', id)
    q.run('DELETE FROM events WHERE user_id = ?', id)
    q.run('UPDATE users SET invited_by = NULL WHERE invited_by = ?', id)
    // cascades: identities, sessions, friends, guestbook, likes, scores, ledger, referrals
    q.run('DELETE FROM users WHERE id = ?', id)
  })
}

/** Leave for good: the account and everything attached to it is removed from the live database. */
api.delete('/me', requireUser, (c) => {
  const me = c.get('user')
  deleteAccount(me.id)
  kickUser(me.id, 'Your account has been deleted. Take care, New Yorker. 🗽', 4004, 'deleted')
  deleteCookie(c, SESSION_COOKIE, { path: '/' })
  return c.json({ ok: true })
})

// ---------- invites: /join/<name> ----------
/** Public: who invited you and whether they're in the city right now — never which room (that's for friends). */
api.get('/invite/:name', (c) => {
  const u = inviterByName(c.req.param('name'))
  if (!u) return c.json({ error: 'not-found' }, 404)
  return c.json({ user: publicUser(u), online: presenceOf(u.id).online })
})
api.get('/referrals', requireUser, (c) => c.json(referralStats(c.get('user').id)))

api.get('/name-available', (c) => {
  const name = (c.req.query('name') ?? '').trim()
  const problem = nameProblem(name) ?? (cleanChat(name) !== name ? 'Please pick a different name.' : null)
  if (problem) return c.json({ ok: false, reason: problem })
  const taken = q.get('SELECT 1 FROM users WHERE name = ?', name)
  return c.json({ ok: !taken, reason: taken ? 'That name is taken.' : null })
})

const ProfileBody = z.object({
  name: z.string(),
  look: z.unknown(),
  team: z.string(),
  /** a new New Yorker: birth month and year (checked against MIN_AGE, never stored) */
  birth: z.object({ m: z.number().int(), y: z.number().int() }).optional(),
  /** a new New Yorker: the policy version they ticked "I agree" to */
  consent: z.string().max(20).optional(),
  /** the name in the /join/<name> link this player arrived through */
  invitedBy: z.string().max(20).optional(),
  /** progress made offline before this account existed (coins are capped on the way in) */
  local: z.object({ coins: z.unknown(), owned: z.unknown(), homes: z.unknown() }).partial().optional(),
})
api.post('/profile', requireUser, async (c) => {
  const u = c.get('user')
  const body = ProfileBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'bad-request' }, 400)
  const first = !u.profile_done
  if (first) {
    const b = body.data.birth
    if (!b) return c.json({ error: 'age', reason: 'Please tell us your birth month and year.' }, 400)
    if (!oldEnough(b.m, b.y)) {
      // under 13: nothing from this visit is kept (the guest account made for it goes too)
      deleteAccount(u.id)
      deleteCookie(c, SESSION_COOKIE, { path: '/' })
      return c.json({ error: 'age', reason: `Club NYC is for New Yorkers ${MIN_AGE} and older.` }, 403)
    }
    if (body.data.consent !== POLICY_VERSION) return c.json({ error: 'consent', reason: 'Please agree to the Terms, Privacy Policy and Community Rules to play.' }, 400)
  }
  const name = body.data.name.trim()
  const problem = nameProblem(name) ?? (cleanChat(name) !== name ? 'Please pick a different name.' : null)
  if (problem) return c.json({ error: 'name', reason: problem }, 400)
  const valid = validLook(body.data.look)
  if (!valid) return c.json({ error: 'look' }, 400)
  const team = TEAMS.includes(body.data.team) ? body.data.team : ''
  const taken = q.get<{ id: string }>('SELECT id FROM users WHERE name = ?', name)
  if (taken && taken.id !== u.id) return c.json({ error: 'name', reason: 'That name is taken.' }, 409)
  let wallet = ensureWallet(u, first ? body.data.local ?? {} : undefined)
  // the creator's freebies (starter outfit + one welcome gift) go straight into the wardrobe
  if (first) wallet = grantCreatorItems(u.id, Object.values(valid.items)) ?? wallet
  const look = ownedLook(valid, wallet, team)
  tx(() => {
    q.run('UPDATE users SET name = ?, look = ?, team = ?, profile_done = 1, name_reset = 0 WHERE id = ?', name, JSON.stringify(look), team, u.id)
    if (first) q.run('UPDATE users SET age_ok = 1, consent_version = ?, consent_at = ? WHERE id = ?', POLICY_VERSION, Date.now(), u.id)
    // member numbers: 1, 2, 3… in the order New Yorkers arrive
    if (first) q.run('UPDATE users SET member_no = (SELECT COALESCE(MAX(member_no), 0) + 1 FROM users) WHERE id = ? AND member_no IS NULL', u.id)
  })
  let fresh = q.get<UserRow>('SELECT * FROM users WHERE id = ?', u.id)!
  let invite: { by: string; friends: 'accepted' | 'pending'; welcome: number } | null = null
  if (first && body.data.invitedBy) {
    const inviter = inviterByName(body.data.invitedBy)
    const r = inviter && inviter.id !== u.id ? recordReferral(fresh, inviter) : null
    if (inviter && r) {
      invite = { by: inviter.name ?? '', ...r }
      friendshipChanged(u.id, inviter.id, r.friends === 'accepted' ? 'accepted' : 'request', name)
      notifyUser(inviter.id, { t: 'n', k: 'ref', i: u.id, n: name })
      fresh = q.get<UserRow>('SELECT * FROM users WHERE id = ?', u.id)!
    }
  }
  profileChanged(fresh)
  return c.json({ user: meOf(fresh), wallet: ensureWallet(fresh), invite })
})

// ---------- consent: players agree to the current Terms / Privacy Policy / Community Rules ----------
api.post('/consent', requireUser, async (c) => {
  const body = z.object({ version: z.string().max(20) }).safeParse(await c.req.json().catch(() => null))
  if (!body.success || body.data.version !== POLICY_VERSION) return c.json({ error: 'version', reason: 'Please reload the page and try again.' }, 400)
  const u = c.get('user')
  q.run('UPDATE users SET consent_version = ?, consent_at = ? WHERE id = ?', POLICY_VERSION, Date.now(), u.id)
  return c.json({ user: meOf(q.get<UserRow>('SELECT * FROM users WHERE id = ?', u.id)!) })
})

// ---------- the wallet: coins, wardrobe and homes live on the server ----------
api.get('/wallet', requireUser, (c) => c.json(ensureWallet(c.get('user'))))

const EarnBody = z.object({ reason: z.string().max(32), ref: z.union([z.string().max(64), z.number()]).optional() })
api.post('/wallet/earn', requireUser, async (c) => {
  const me = c.get('user')
  const body = EarnBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'bad-request' }, 400)
  // Dance Jam tips are only for people actually on the plaza
  if (body.data.reason === 'dance-jam' && presenceOf(me.id).room !== 'times-square') return c.json({ ok: false, coins: ensureWallet(me).coins, error: 'not-here' })
  return c.json(claim(me.id, body.data.reason, body.data.ref))
})

const SpendBody = z.object({ amount: z.number().int().min(1).max(10_000), reason: z.string().max(48) })
api.post('/wallet/spend', requireUser, async (c) => {
  const body = SpendBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'bad-request' }, 400)
  return c.json(debit(c.get('user').id, body.data.amount, body.data.reason))
})

const BuyBody = z.object({ kind: z.enum(['item', 'home']), id: z.string().max(48) })
api.post('/wallet/buy', requireUser, async (c) => {
  const me = c.get('user')
  const body = BuyBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'bad-request' }, 400)
  const r = body.data.kind === 'home' ? buyHome(me.id, body.data.id) : buyItem(me.id, body.data.id)
  if (r.ok && r.wallet) walletChanged(me.id, r.wallet)
  return c.json(r)
})

const GrantBody = z.object({ item: z.string().max(48) })
api.post('/wallet/grant', requireUser, async (c) => {
  const me = c.get('user')
  const body = GrantBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'bad-request' }, 400)
  const r = grantItem(me.id, body.data.item)
  if (r.ok && r.wallet) walletChanged(me.id, r.wallet)
  return c.json(r)
})

// ---------- crash reports from the game (so we hear about bugs before players tell us) ----------
const ErrorBody = z.object({ message: z.string().max(500), stack: z.string().max(4000).optional(), url: z.string().max(300).optional() })
api.post('/client-errors', async (c) => {
  const body = ErrorBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ ok: false }, 400)
  const u = currentUser(c)
  q.run('INSERT INTO client_errors (user_id, message, stack, url, ua, at) VALUES (?, ?, ?, ?, ?, ?)', u?.id ?? null, body.data.message, body.data.stack ?? null, body.data.url ?? null, (c.req.header('user-agent') ?? '').slice(0, 200), Date.now())
  return c.json({ ok: true })
})

// ---------- onboarding funnel events (anonymous per page-load session; a fixed list of names) ----------
export const EVENT_NAMES = ['landing_view', 'landing_play', 'landing_discord', 'landing_send', 'creator_open', 'look_preset', 'look_shuffle', 'look_tweak', 'look_colour', 'name_screen', 'name_wheel', 'name_typed', 'creator_done', 'spawned'] as const
const EventsBody = z.object({
  session: z.string().min(6).max(40),
  events: z.array(z.object({ name: z.enum(EVENT_NAMES), ms: z.number().int().min(0).max(36e5).optional(), detail: z.string().max(40).optional() })).max(20),
})
api.post('/events', async (c) => {
  const body = EventsBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ ok: false }, 400)
  const u = currentUser(c)
  const now = Date.now()
  tx(() => {
    for (const e of body.data.events) q.run('INSERT INTO events (name, session, user_id, ms, detail, at) VALUES (?, ?, ?, ?, ?, ?)', e.name, body.data.session, u?.id ?? null, e.ms ?? null, e.detail ?? null, now)
  })
  return c.json({ ok: true })
})

// ---------- cloud save (progress, wardrobe, apartment) ----------
api.get('/save', requireUser, (c) => {
  const u = c.get('user')
  // the wallet (coins, wardrobe, homes) comes from the server, whatever the stored save says
  return c.json({ save: u.save ? withWallet(JSON.parse(u.save), ensureWallet(u)) : null, updated: u.save_updated })
})

api.put('/save', requireUser, async (c) => {
  const u = c.get('user')
  const raw = await c.req.text()
  if (raw.length > 200_000) return c.json({ error: 'too-big' }, 413)
  let body: { save?: Record<string, unknown> }
  try {
    body = JSON.parse(raw)
  } catch {
    return c.json({ error: 'bad-json' }, 400)
  }
  if (!body.save || typeof body.save !== 'object') return c.json({ error: 'bad-request' }, 400)
  // coins, wardrobe and homes are the server's — a save can't change them
  const wallet = ensureWallet(u)
  const s = withWallet(body.save, wallet)
  // keep the public profile in sync with what the player is wearing
  const team = TEAMS.includes(String(s.team)) ? String(s.team) : u.team ?? ''
  const valid = validLook(s.look)
  const look = valid ? ownedLook(valid, wallet, team) : null
  const title = typeof s.title === 'string' ? s.title.slice(0, 40) : u.title
  q.run('UPDATE users SET save = ?, save_updated = ?, look = COALESCE(?, look), team = ?, title = ? WHERE id = ?', JSON.stringify(s), Date.now(), look ? JSON.stringify(look) : null, team, title, u.id)
  return c.json({ ok: true, coins: wallet.coins })
})

// ---------- public profiles (player cards, apartment visits) ----------
api.get('/users/:id', requireUser, (c) => {
  const me = c.get('user')
  const u = q.get<UserRow>('SELECT * FROM users WHERE id = ? AND profile_done = 1', c.req.param('id'))
  if (!u) return c.json({ error: 'not-found' }, 404)
  const save = u.save ? JSON.parse(u.save) : {}
  const rel = q.get<{ a: string; status: string }>('SELECT a, status FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', me.id, u.id, u.id, me.id)
  const likes = q.get<{ n: number }>('SELECT COUNT(*) AS n FROM likes WHERE owner = ?', u.id)!.n
  return c.json({
    user: publicUser(u),
    stamps: Array.isArray(save.stamps) ? save.stamps.length : 0,
    furniture: Array.isArray(save.furniture) ? save.furniture.slice(0, 40) : [],
    openHouse: !!save.openHouse,
    home: save.home === 'loft' ? 'loft' : save.home === 'penthouse' ? 'penthouse' : 'apartment',
    party: partyOf(u.id),
    likes,
    liked: !!q.get('SELECT 1 FROM likes WHERE owner = ? AND liker = ?', u.id, me.id),
    friend: rel ? (rel.status === 'accepted' ? 'friends' : rel.a === me.id ? 'requested' : 'incoming') : 'none',
    blocked: !!q.get('SELECT 1 FROM blocks WHERE a = ? AND b = ?', me.id, u.id),
    presence: presenceOf(u.id),
  })
})

// ---------- apartments: guestbooks & likes ----------
api.get('/guestbook', requireUser, (c) => {
  const me = c.get('user')
  const rows = q.all<UserRow & { gid: number; text: string; at: number; read: number }>(
    `SELECT u.*, g.id AS gid, g.text, g.created_at AS at, g.read FROM guestbook g JOIN users u ON u.id = g.author
     WHERE g.owner = ? ORDER BY g.created_at DESC LIMIT 40`,
    me.id,
  )
  const likes = q.get<{ n: number }>('SELECT COUNT(*) AS n FROM likes WHERE owner = ?', me.id)!.n
  return c.json({ entries: rows.map((r) => ({ id: r.gid, from: publicUser(r), text: r.text, at: r.at, read: !!r.read })), likes })
})

api.post('/guestbook/read', requireUser, (c) => {
  q.run('UPDATE guestbook SET read = 1 WHERE owner = ?', c.get('user').id)
  return c.json({ ok: true })
})

const NoteBody = z.object({ text: z.string().min(1).max(120) })
api.post('/users/:id/guestbook', requireUser, async (c) => {
  const me = c.get('user')
  const owner = q.get<UserRow>('SELECT * FROM users WHERE id = ? AND profile_done = 1', c.req.param('id'))
  const body = NoteBody.safeParse(await c.req.json().catch(() => null))
  if (!owner || owner.id === me.id || !body.success) return c.json({ error: 'bad-request' }, 400)
  if (q.get('SELECT 1 FROM blocks WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', me.id, owner.id, owner.id, me.id)) return c.json({ error: 'blocked' }, 403)
  // one note per visitor per apartment per hour keeps guestbooks meaningful (and spam-free)
  if (q.get('SELECT 1 FROM guestbook WHERE owner = ? AND author = ? AND created_at > ?', owner.id, me.id, Date.now() - 3600_000)) return c.json({ error: 'too-soon' }, 429)
  const text = cleanChat(body.data.text)
  if (!text) return c.json({ error: 'empty' }, 400)
  q.run('INSERT INTO guestbook (owner, author, text, created_at) VALUES (?, ?, ?, ?)', owner.id, me.id, text, Date.now())
  notifyUser(owner.id, { t: 'n', k: 'gb', i: me.id, n: me.name ?? '', m: text })
  return c.json({ ok: true, text })
})

api.post('/users/:id/like', requireUser, (c) => {
  const me = c.get('user')
  const owner = q.get<UserRow>('SELECT * FROM users WHERE id = ? AND profile_done = 1', c.req.param('id'))
  if (!owner || owner.id === me.id) return c.json({ error: 'bad-request' }, 400)
  const r = q.run('INSERT OR IGNORE INTO likes (owner, liker, created_at) VALUES (?, ?, ?)', owner.id, me.id, Date.now())
  if (r.changes) notifyUser(owner.id, { t: 'n', k: 'like', i: me.id, n: me.name ?? '' })
  return c.json({ ok: true, likes: q.get<{ n: number }>('SELECT COUNT(*) AS n FROM likes WHERE owner = ?', owner.id)!.n })
})

// ---------- friends ----------
api.get('/friends', requireUser, (c) => {
  const me = c.get('user')
  const rows = q.all<UserRow & { a: string; status: string }>(
    `SELECT u.*, f.a, f.status FROM friends f JOIN users u ON u.id = CASE WHEN f.a = ? THEN f.b ELSE f.a END WHERE f.a = ? OR f.b = ?`,
    me.id, me.id, me.id,
  )
  const pick = (r: UserRow) => ({ ...publicUser(r), ...presenceOf(r.id) })
  return c.json({
    friends: rows.filter((r) => r.status === 'accepted').map(pick),
    incoming: rows.filter((r) => r.status === 'pending' && r.a !== me.id).map(pick),
    outgoing: rows.filter((r) => r.status === 'pending' && r.a === me.id).map(pick),
  })
})

api.post('/friends/:id', requireUser, (c) => {
  const me = c.get('user')
  const other = q.get<UserRow>('SELECT * FROM users WHERE id = ? AND profile_done = 1', c.req.param('id'))
  if (!other || other.id === me.id) return c.json({ error: 'not-found' }, 404)
  if (q.get('SELECT 1 FROM blocks WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', me.id, other.id, other.id, me.id)) return c.json({ error: 'blocked' }, 403)
  const existing = q.get<{ a: string; status: string }>('SELECT a, status FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', me.id, other.id, other.id, me.id)
  if (existing?.status === 'accepted') return c.json({ status: 'friends' })
  if (existing && existing.a === other.id) {
    q.run(`UPDATE friends SET status = 'accepted' WHERE a = ? AND b = ?`, other.id, me.id)
    friendshipChanged(other.id, me.id, 'accepted', me.name ?? '')
    return c.json({ status: 'friends' })
  }
  if (!existing) q.run(`INSERT INTO friends (a, b, status, created_at) VALUES (?, ?, 'pending', ?)`, me.id, other.id, Date.now())
  friendshipChanged(me.id, other.id, 'request', me.name ?? '')
  return c.json({ status: 'requested' })
})

api.post('/friends/:id/accept', requireUser, (c) => {
  const me = c.get('user')
  const id = c.req.param('id')
  const r = q.run(`UPDATE friends SET status = 'accepted' WHERE a = ? AND b = ? AND status = 'pending'`, id, me.id)
  if (!r.changes) return c.json({ error: 'no-request' }, 404)
  friendshipChanged(id, me.id, 'accepted', me.name ?? '')
  return c.json({ status: 'friends' })
})

api.delete('/friends/:id', requireUser, (c) => {
  const me = c.get('user')
  const id = c.req.param('id')
  q.run('DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', me.id, id, id, me.id)
  friendshipChanged(me.id, id, 'removed', me.name ?? '')
  return c.json({ ok: true })
})

// ---------- safety: block & report ----------
api.post('/blocks/:id', requireUser, (c) => {
  const me = c.get('user')
  const id = c.req.param('id')
  tx(() => {
    q.run('INSERT OR IGNORE INTO blocks (a, b) VALUES (?, ?)', me.id, id)
    q.run('DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', me.id, id, id, me.id)
  })
  friendshipChanged(me.id, id, 'removed', '')
  blockChanged(me.id)
  return c.json({ ok: true })
})
api.delete('/blocks/:id', requireUser, (c) => {
  q.run('DELETE FROM blocks WHERE a = ? AND b = ?', c.get('user').id, c.req.param('id'))
  blockChanged(c.get('user').id)
  return c.json({ ok: true })
})
api.get('/blocks', requireUser, (c) => {
  const rows = q.all<{ b: string; name: string | null }>('SELECT blocks.b, users.name FROM blocks LEFT JOIN users ON users.id = blocks.b WHERE blocks.a = ?', c.get('user').id)
  // ids for the live filter; names so the Friends tab can list them with an Unblock button
  return c.json({ blocked: rows.map((r) => r.b), users: rows.map((r) => ({ id: r.b, name: r.name ?? 'a deleted New Yorker' })) })
})

const ReportBody = z.object({ target: z.string().max(64), reason: z.string().max(40), context: z.string().max(500).optional() })
api.post('/reports', requireUser, async (c) => {
  const body = ReportBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'bad-request' }, 400)
  q.run('INSERT INTO reports (reporter, target, reason, context, created_at) VALUES (?, ?, ?, ?, ?)', c.get('user').id, body.data.target, body.data.reason, body.data.context ?? '', Date.now())
  // several different people reporting the same player within an hour pauses their chat until a moderator looks
  const paused = autoModAfterReport(body.data.target)
  if (paused) setLiveMute(body.data.target, paused.until, paused.reason)
  return c.json({ ok: true })
})

// ---------- jobs: run tokens → validated scores → leaderboards + team points ----------
api.post('/games/:game/start', requireUser, (c) => {
  const game = c.req.param('game')
  if (!GAMES[game]) return c.json({ error: 'unknown-game' }, 404)
  const id = randomUUID()
  q.run('INSERT INTO game_runs (id, user_id, game, started_at) VALUES (?, ?, ?, ?)', id, c.get('user').id, game, Date.now())
  return c.json({ run: id })
})

const FinishBody = z.object({ run: z.string(), score: z.number().int().min(0), coins: z.number().int().min(0) })
api.post('/games/:game/finish', requireUser, async (c) => {
  const me = c.get('user')
  const game = c.req.param('game')
  const rules = GAMES[game]
  const body = FinishBody.safeParse(await c.req.json().catch(() => null))
  if (!rules || !body.success) return c.json({ error: 'bad-request' }, 400)
  const run = q.get<{ user_id: string; game: string; started_at: number; finished_at: number | null }>('SELECT * FROM game_runs WHERE id = ?', body.data.run)
  if (!run || run.user_id !== me.id || run.game !== game || run.finished_at) return c.json({ error: 'bad-run' }, 400)
  const now = Date.now()
  q.run('UPDATE game_runs SET finished_at = ? WHERE id = ?', now, body.data.run)
  const minutes = (now - run.started_at) / 60000
  const cap = Math.min(rules.hardMax, Math.ceil(Math.max(minutes, 0.25) * rules.maxPerMinute) + 2)
  const suspicious = minutes * 60 < rules.minSeconds * 0.5 || body.data.score > cap
  const score = Math.min(body.data.score, cap)
  const coins = Math.min(body.data.coins, rules.maxCoins)
  const week = weekId()
  let balance: number | undefined
  let paidOut = 0
  if (!suspicious) {
    // shift pay goes straight into the server wallet (once per run, within today's ceiling)
    const pay = payJob(me.id, coins, body.data.run)
    balance = pay.coins
    paidOut = pay.paid ?? 0
    tx(() => {
      // this week's board, plus the all-time board (stored as week 'all') that never resets
      for (const w of [week, 'all'])
        q.run(
          `INSERT INTO scores (game, week, user_id, best, updated_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (game, week, user_id) DO UPDATE SET best = MAX(best, excluded.best), updated_at = excluded.updated_at`,
          game, w, me.id, score, now,
        )
      if (me.team && coins > 0)
        q.run(
          `INSERT INTO team_points (week, team, user_id, points) VALUES (?, ?, ?, ?)
           ON CONFLICT (week, team, user_id) DO UPDATE SET points = points + excluded.points`,
          week, me.team, me.id, coins,
        )
    })
  }
  return c.json({ accepted: !suspicious, paid: paidOut, coins: balance ?? ensureWallet(me).coins, ...rankFor(game, week, me.id) })
})

function rankFor(game: string, week: string, userId: string) {
  const mine = q.get<{ best: number }>('SELECT best FROM scores WHERE game = ? AND week = ? AND user_id = ?', game, week, userId)
  const total = q.get<{ n: number }>('SELECT COUNT(*) AS n FROM scores WHERE game = ? AND week = ?', game, week)!.n
  if (!mine) return { best: 0, rank: 0, total, next: null }
  const rank = q.get<{ n: number }>('SELECT COUNT(*) + 1 AS n FROM scores WHERE game = ? AND week = ? AND best > ?', game, week, mine.best)!.n
  const next = q.get<{ name: string; best: number }>(
    `SELECT u.name, s.best FROM scores s JOIN users u ON u.id = s.user_id WHERE s.game = ? AND s.week = ? AND s.best > ? ORDER BY s.best ASC LIMIT 1`,
    game, week, mine.best,
  )
  return { best: mine.best, rank, total, next: next ? { name: next.name, score: next.best } : null }
}

api.get('/leaderboard/:game', requireUser, (c) => {
  const me = c.get('user')
  const game = c.req.param('game')
  if (!GAMES[game]) return c.json({ error: 'unknown-game' }, 404)
  const week = c.req.query('period') === 'all' ? 'all' : weekId()
  const friendsOnly = c.req.query('scope') === 'friends'
  const rows = friendsOnly
    ? q.all<UserRow & { best: number }>(
        `SELECT u.*, s.best FROM scores s JOIN users u ON u.id = s.user_id
         WHERE s.game = ? AND s.week = ? AND (s.user_id = ? OR s.user_id IN (
           SELECT CASE WHEN a = ? THEN b ELSE a END FROM friends WHERE (a = ? OR b = ?) AND status = 'accepted'))
         ORDER BY s.best DESC LIMIT 50`,
        game, week, me.id, me.id, me.id, me.id,
      )
    : q.all<UserRow & { best: number }>(`SELECT u.*, s.best FROM scores s JOIN users u ON u.id = s.user_id WHERE s.game = ? AND s.week = ? ORDER BY s.best DESC LIMIT 25`, game, week)
  return c.json({ week, rows: rows.map((r) => ({ ...publicUser(r), score: r.best, you: r.id === me.id })), me: rankFor(game, week, me.id) })
})

api.get('/teams', requireUser, (c) => {
  const week = weekId()
  const rows = q.all<{ team: string; points: number; players: number }>('SELECT team, SUM(points) AS points, COUNT(*) AS players FROM team_points WHERE week = ? GROUP BY team', week)
  const mine = q.get<{ points: number }>('SELECT SUM(points) AS points FROM team_points WHERE week = ? AND user_id = ?', week, c.get('user').id)
  return c.json({ week, teams: TEAMS.map((t) => rows.find((r) => r.team === t) ?? { team: t, points: 0, players: 0 }), mine: mine?.points ?? 0, npcBaseline: config.npcBaseline })
})

// ---------- city status ----------
api.get('/online', (c) => c.json({ count: onlineCount(), rooms: roomCounts() }))

/** What the Times Square billboards shout about: the newest New Yorkers and this week's #1s. */
let highlights = { at: 0, body: {} as unknown }
api.get('/highlights', (c) => {
  if (Date.now() - highlights.at > 60_000) {
    const week = weekId()
    highlights = {
      at: Date.now(),
      body: {
        newcomers: q.all<{ name: string; member_no: number }>('SELECT name, member_no FROM users WHERE profile_done = 1 AND member_no IS NOT NULL AND banned_until IS NULL ORDER BY member_no DESC LIMIT 8'),
        leaders: Object.keys(GAMES).flatMap((game) => {
          const r = q.get<{ name: string; best: number }>(`SELECT u.name, s.best FROM scores s JOIN users u ON u.id = s.user_id WHERE s.game = ? AND s.week = ? AND u.banned_until IS NULL ORDER BY s.best DESC LIMIT 1`, game, week)
          return r ? [{ game, name: r.name, score: r.best }] : []
        }),
        team: q.get<{ team: string; points: number }>('SELECT team, SUM(points) AS points FROM team_points WHERE week = ? GROUP BY team ORDER BY points DESC LIMIT 1', week) ?? null,
      },
    }
  }
  return c.json(highlights.body)
})
/** "Who's in the city?" — busy rooms with a few faces, for the map and the community panel. */
api.get('/city', requireUser, (c) => c.json({ count: onlineCount(), rooms: cityPulse(), parties: partiesFor(c.get('user').id) }))
api.get('/parties', requireUser, (c) => c.json({ parties: partiesFor(c.get('user').id) }))

api.get('/metrics', (c) => {
  if (!config.dev) return c.json({ error: 'not-found' }, 404)
  const m = process.memoryUsage()
  return c.json({ online: onlineCount(), rooms: roomCounts(), ...stats, avgFlushMs: stats.flushes ? stats.flushMs / stats.flushes : 0, rssMB: Math.round(m.rss / 1048576), heapMB: Math.round(m.heapUsed / 1048576) })
})
