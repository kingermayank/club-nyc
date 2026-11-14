import { createHash } from 'node:crypto'
import { Hono, type Context } from 'hono'
import { z } from 'zod'
import { q, tx, type UserRow } from './db.ts'
import { currentUser, linkedProviders } from './auth.ts'
import { banOf, muteOf, recordAction } from './moderation.ts'
import { cleanChat } from './game/filter.ts'
import { clientIp } from './limits.ts'

/**
 * The community board at /community (the page is app/community.html + app/src/community/): players post bugs, ideas
 * and feedback, reply, and upvote what they want built next.
 *  - Anyone can read. Posting, replying, voting and reporting need a real account (Google, X, Discord or email, not
 *    a guest) with a New Yorker made (their name and look go next to what they write), not banned or muted.
 *  - Everything written goes through the chat filter (links, emails and phone numbers removed, slurs starred).
 *  - Per-account limits live in the database, so they hold across restarts and for everyone behind one address.
 *  - Reports land in Launch HQ's report queue too; three different people reporting one post or reply hides it
 *    until a moderator looks. Moderators hide, show and delete from the page (routes in `communityAdmin`).
 */
export const CATEGORIES = ['bugs', 'ideas', 'feedback'] as const
export type Category = (typeof CATEGORIES)[number]

export const LIMITS = {
  title: { min: 4, max: 90 },
  body: { min: 10, max: 4000 },
  reply: { min: 2, max: 2000 },
  /** posts: 3 in 10 minutes, 10 a day; replies: 8 in 10 minutes, 60 a day; votes: 30 a minute */
  posts: { short: 3, long: 10 },
  replies: { short: 8, long: 60 },
  votesPerMinute: 30,
  pageSize: 20,
  reportsToHide: 3,
}
const MIN = 60_000
const DAY = 86_400_000

// ---------- text ----------
/**
 * The chat filter, for longer text. It reads one chat line (120 characters, one line) at a time, so each line here is
 * cut into pieces at spaces, filtered, and put back together. Blank lines between paragraphs are kept (at most one).
 */
const PIECE = 110
function cleanLine(line: string): string {
  const out: string[] = []
  let rest = line.replace(/\s+/g, ' ').trim()
  while (rest.length > PIECE) {
    let cut = rest.lastIndexOf(' ', PIECE)
    if (cut < 40) cut = PIECE
    out.push(cleanChat(rest.slice(0, cut)))
    rest = rest.slice(cut).trim()
  }
  if (rest) out.push(cleanChat(rest))
  return out.join(' ')
}
export function cleanText(raw: string, max: number, multiline = true): string {
  const lines = String(raw).replace(/\r\n?/g, '\n').slice(0, max * 2).split('\n').map(cleanLine)
  const text = multiline ? lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() : lines.join(' ').trim()
  return text.slice(0, max).trim()
}

// ---------- who's asking ----------
type Gate = { ok: true; user: UserRow } | { ok: false; why: 'signed-out' | 'guest' | 'no-name' | 'banned' | 'muted'; user: UserRow | null }
export function gate(c: Context): Gate {
  const u = currentUser(c)
  if (!u) return { ok: false, why: 'signed-out', user: null }
  if (banOf(u)) return { ok: false, why: 'banned', user: u }
  if (u.is_guest) return { ok: false, why: 'guest', user: u }
  if (!u.name || !u.profile_done) return { ok: false, why: 'no-name', user: u }
  if (muteOf(u)) return { ok: false, why: 'muted', user: u }
  return { ok: true, user: u }
}
const refuse = (c: Context, g: Gate & { ok: false }) => c.json({ error: g.why }, g.why === 'signed-out' || g.why === 'guest' ? 401 : 403)

/** a visitor, for counting views once a day: the account, or a hash of the address (the address itself is never kept) */
const viewerOf = (c: Context, u: UserRow | null) => (u ? `u:${u.id}` : `ip:${createHash('sha256').update(`community:${clientIp(c)}`).digest('base64url').slice(0, 16)}`)
const today = () => Math.floor(Date.now() / DAY)

// votes: a small bucket per account in memory (a vote can be undone, so there's no row to count)
const voteBuckets = new Map<string, { tokens: number; at: number }>()
function voteAllowed(userId: string): boolean {
  const now = Date.now()
  const per = LIMITS.votesPerMinute
  const b = voteBuckets.get(userId) ?? { tokens: per, at: now }
  b.tokens = Math.min(per, b.tokens + ((now - b.at) * per) / MIN)
  b.at = now
  voteBuckets.set(userId, b)
  if (b.tokens < 1) return false
  b.tokens -= 1
  return true
}
const countSince = (table: 'community_posts' | 'community_replies', userId: string, ms: number) =>
  q.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ? AND created_at > ?`, userId, Date.now() - ms)!.n
function tooFast(table: 'community_posts' | 'community_replies', userId: string): boolean {
  const lim = table === 'community_posts' ? LIMITS.posts : LIMITS.replies
  return countSince(table, userId, 10 * MIN) >= lim.short || countSince(table, userId, DAY) >= lim.long
}

// ---------- shaping rows ----------
interface PostRow {
  id: number
  user_id: string
  category: string
  title: string
  body: string
  votes: number
  replies: number
  views: number
  hidden: number
  created_at: number
  last_at: number
  name: string | null
  look: string | null
  founder_at: number | null
}
interface ReplyRow {
  id: number
  post_id: number
  user_id: string
  body: string
  hidden: number
  created_at: number
  name: string | null
  look: string | null
  founder_at: number | null
}
const author = (r: { user_id: string; name: string | null; look: string | null; founder_at: number | null }) => ({
  id: r.user_id,
  name: r.name ?? 'Former New Yorker',
  look: r.look ? (JSON.parse(r.look) as unknown) : null,
  founder: !!r.founder_at,
})
const excerpt = (s: string) => {
  const flat = s.replace(/\s+/g, ' ').trim()
  return flat.length > 180 ? `${flat.slice(0, 177).trimEnd()}…` : flat
}
const POST_COLS = `p.*, u.name, u.look, u.founder_at`
const postSummary = (p: PostRow, voted: Set<number>, meId: string | null) => ({
  id: p.id,
  category: p.category,
  title: p.title,
  excerpt: excerpt(p.body),
  author: author(p),
  createdAt: p.created_at,
  lastAt: p.last_at,
  votes: p.votes,
  replies: p.replies,
  views: p.views,
  voted: voted.has(p.id),
  mine: p.user_id === meId,
  hidden: !!p.hidden,
})
const votedSet = (userId: string | undefined, ids: number[]) => {
  if (!userId || !ids.length) return new Set<number>()
  const rows = q.all<{ post_id: number }>(`SELECT post_id FROM community_votes WHERE user_id = ? AND post_id IN (${ids.map(() => '?').join(',')})`, userId, ...ids)
  return new Set(rows.map((r) => r.post_id))
}

// ---------- the public API: /api/community ----------
export const community = new Hono()

/** who's reading, and whether they can write (and if not, why: the page shows the right way in) */
community.get('/me', (c) => {
  const g = gate(c)
  const u = g.user
  return c.json({
    canPost: g.ok,
    why: g.ok ? null : g.why,
    user: u && u.name ? { id: u.id, name: u.name, look: u.look ? JSON.parse(u.look) : null } : null,
    linked: u ? linkedProviders(u.id).filter((p) => p !== 'guest') : [],
  })
})

const ListQuery = z.object({
  cat: z.enum(CATEGORIES).optional(),
  sort: z.enum(['top', 'new']).default('top'),
  page: z.coerce.number().int().min(0).max(500).default(0),
})
community.get('/posts', (c) => {
  const p = ListQuery.safeParse(c.req.query())
  if (!p.success) return c.json({ error: 'bad-request' }, 400)
  const { cat, sort, page } = p.data
  const where = cat ? 'p.hidden = 0 AND p.category = ?' : 'p.hidden = 0'
  const args = cat ? [cat] : []
  const order = sort === 'new' ? 'p.created_at DESC' : 'p.votes DESC, p.replies DESC, p.created_at DESC'
  const rows = q.all<PostRow>(`SELECT ${POST_COLS} FROM community_posts p LEFT JOIN users u ON u.id = p.user_id WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, ...args, LIMITS.pageSize + 1, page * LIMITS.pageSize)
  const more = rows.length > LIMITS.pageSize
  const shown = rows.slice(0, LIMITS.pageSize)
  const me = currentUser(c)
  const voted = votedSet(me?.id, shown.map((r) => r.id))
  const counts = Object.fromEntries(CATEGORIES.map((k) => [k, 0])) as Record<Category, number>
  for (const r of q.all<{ category: Category; n: number }>('SELECT category, COUNT(*) AS n FROM community_posts WHERE hidden = 0 GROUP BY category')) if (r.category in counts) counts[r.category] = r.n
  return c.json({ posts: shown.map((r) => postSummary(r, voted, me?.id ?? null)), more, counts })
})

community.get('/posts/:id{[0-9]+}', (c) => {
  const id = Number(c.req.param('id'))
  const me = currentUser(c)
  const post = q.get<PostRow>(`SELECT ${POST_COLS} FROM community_posts p LEFT JOIN users u ON u.id = p.user_id WHERE p.id = ? AND p.hidden = 0`, id)
  if (!post) return c.json({ error: 'not-found' }, 404)
  // a view: once per visitor a day (reloading, voting and replying don't count again)
  if (q.run('INSERT OR IGNORE INTO community_views (post_id, viewer, day) VALUES (?, ?, ?)', id, viewerOf(c, me), today()).changes) {
    q.run('UPDATE community_posts SET views = views + 1 WHERE id = ?', id)
    post.views++
  }
  const replies = q.all<ReplyRow>(`SELECT r.*, u.name, u.look, u.founder_at FROM community_replies r LEFT JOIN users u ON u.id = r.user_id WHERE r.post_id = ? AND r.hidden = 0 ORDER BY r.id`, id)
  return c.json({
    post: { ...postSummary(post, votedSet(me?.id, [id]), me?.id ?? null), body: post.body },
    replies: replies.map((r) => ({ id: r.id, body: r.body, author: author(r), createdAt: r.created_at, mine: r.user_id === me?.id })),
  })
})

const NewPost = z.object({ category: z.enum(CATEGORIES), title: z.string().max(400), body: z.string().max(12000) })
community.post('/posts', async (c) => {
  const g = gate(c)
  if (!g.ok) return refuse(c, g)
  const b = NewPost.safeParse(await c.req.json().catch(() => null))
  if (!b.success) return c.json({ error: 'bad-request' }, 400)
  const title = cleanText(b.data.title, LIMITS.title.max, false)
  const body = cleanText(b.data.body, LIMITS.body.max)
  if (title.length < LIMITS.title.min) return c.json({ error: 'title-short' }, 400)
  if (body.length < LIMITS.body.min) return c.json({ error: 'body-short' }, 400)
  if (tooFast('community_posts', g.user.id)) return c.json({ error: 'slow-down' }, 429)
  // the same post twice (a double click, a resend) is the first one
  const dup = q.get<{ id: number }>('SELECT id FROM community_posts WHERE user_id = ? AND title = ? AND created_at > ?', g.user.id, title, Date.now() - DAY)
  if (dup) return c.json({ ok: true, id: dup.id, duplicate: true })
  const now = Date.now()
  const id = Number(q.run('INSERT INTO community_posts (user_id, category, title, body, created_at, last_at) VALUES (?, ?, ?, ?, ?, ?)', g.user.id, b.data.category, title, body, now, now).lastInsertRowid)
  return c.json({ ok: true, id })
})

const NewReply = z.object({ body: z.string().max(8000) })
community.post('/posts/:id{[0-9]+}/replies', async (c) => {
  const g = gate(c)
  if (!g.ok) return refuse(c, g)
  const id = Number(c.req.param('id'))
  if (!q.get('SELECT 1 FROM community_posts WHERE id = ? AND hidden = 0', id)) return c.json({ error: 'not-found' }, 404)
  const b = NewReply.safeParse(await c.req.json().catch(() => null))
  if (!b.success) return c.json({ error: 'bad-request' }, 400)
  const body = cleanText(b.data.body, LIMITS.reply.max)
  if (body.length < LIMITS.reply.min) return c.json({ error: 'body-short' }, 400)
  if (tooFast('community_replies', g.user.id)) return c.json({ error: 'slow-down' }, 429)
  const now = Date.now()
  const rid = tx(() => {
    const r = Number(q.run('INSERT INTO community_replies (post_id, user_id, body, created_at) VALUES (?, ?, ?, ?)', id, g.user.id, body, now).lastInsertRowid)
    q.run('UPDATE community_posts SET replies = replies + 1, last_at = ? WHERE id = ?', now, id)
    return r
  })
  return c.json({ ok: true, id: rid })
})

/** one upvote per account; sending it again takes it back */
const VoteBody = z.object({ up: z.boolean() })
community.post('/posts/:id{[0-9]+}/vote', async (c) => {
  const g = gate(c)
  if (!g.ok) return refuse(c, g)
  const id = Number(c.req.param('id'))
  if (!q.get('SELECT 1 FROM community_posts WHERE id = ? AND hidden = 0', id)) return c.json({ error: 'not-found' }, 404)
  const b = VoteBody.safeParse(await c.req.json().catch(() => null))
  if (!b.success) return c.json({ error: 'bad-request' }, 400)
  if (!voteAllowed(g.user.id)) return c.json({ error: 'slow-down' }, 429)
  tx(() => {
    const changed = b.data.up
      ? q.run('INSERT OR IGNORE INTO community_votes (post_id, user_id, created_at) VALUES (?, ?, ?)', id, g.user.id, Date.now()).changes
      : q.run('DELETE FROM community_votes WHERE post_id = ? AND user_id = ?', id, g.user.id).changes
    if (changed) q.run(`UPDATE community_posts SET votes = votes ${b.data.up ? '+' : '-'} 1 WHERE id = ?`, id)
  })
  const votes = q.get<{ votes: number }>('SELECT votes FROM community_posts WHERE id = ?', id)!.votes
  return c.json({ ok: true, voted: b.data.up, votes })
})

const ReportBody = z.object({ post: z.number().int().positive(), reply: z.number().int().positive().optional(), reason: z.enum(['spam', 'mean', 'unsafe', 'other']) })
community.post('/report', async (c) => {
  const g = gate(c)
  // muted players can still report (a report is how they flag what's wrong)
  if (!g.ok && g.why !== 'muted') return refuse(c, g)
  const me = g.user!
  const b = ReportBody.safeParse(await c.req.json().catch(() => null))
  if (!b.success) return c.json({ error: 'bad-request' }, 400)
  const { post, reply, reason } = b.data
  const target = reply
    ? q.get<{ user_id: string; body: string; title: string }>('SELECT r.user_id, r.body, p.title FROM community_replies r JOIN community_posts p ON p.id = r.post_id WHERE r.id = ? AND r.post_id = ?', reply, post)
    : q.get<{ user_id: string; body: string; title: string }>('SELECT user_id, body, title FROM community_posts WHERE id = ?', post)
  if (!target) return c.json({ error: 'not-found' }, 404)
  if (target.user_id === me.id) return c.json({ error: 'bad-request' }, 400)
  const fresh = q.run('INSERT OR IGNORE INTO community_reports (post_id, reply_id, reporter, reason, created_at) VALUES (?, ?, ?, ?, ?)', post, reply ?? null, me.id, reason, Date.now()).changes
  if (!fresh) return c.json({ ok: true, duplicate: true })
  // Launch HQ's report queue: who, why, and what they wrote
  const what = reply ? `Community reply on #${post} "${target.title}"` : `Community post #${post} "${target.title}"`
  q.run('INSERT INTO reports (reporter, target, reason, context, created_at) VALUES (?, ?, ?, ?, ?)', me.id, target.user_id, `community: ${reason}`, `${what}: ${target.body}`.slice(0, 500), Date.now())
  // several different people: hidden until a moderator looks
  const n = q.get<{ n: number }>('SELECT COUNT(*) AS n FROM community_reports WHERE post_id = ? AND IFNULL(reply_id, 0) = ?', post, reply ?? 0)!.n
  if (n >= LIMITS.reportsToHide) {
    hide(post, reply, true)
    recordAction(target.user_id, 'community-auto-hide', { reason: `${n} reports on ${reply ? `reply ${reply}` : `post ${post}`}`, by: 'auto' })
  }
  return c.json({ ok: true })
})

// ---------- moderators: /api/admin/community (behind Launch HQ's key, see admin.ts) ----------
function hide(post: number, reply: number | undefined, on: boolean): boolean {
  if (!reply) return q.run('UPDATE community_posts SET hidden = ? WHERE id = ?', on ? 1 : 0, post).changes > 0
  return tx(() => {
    const was = q.get<{ hidden: number }>('SELECT hidden FROM community_replies WHERE id = ? AND post_id = ?', reply, post)
    if (!was) return false
    if (!!was.hidden === on) return true
    q.run('UPDATE community_replies SET hidden = ? WHERE id = ?', on ? 1 : 0, reply)
    q.run(`UPDATE community_posts SET replies = replies ${on ? '-' : '+'} 1 WHERE id = ?`, post)
    return true
  })
}
function remove(post: number, reply: number | undefined): boolean {
  if (!reply) return q.run('DELETE FROM community_posts WHERE id = ?', post).changes > 0
  return tx(() => {
    const r = q.get<{ hidden: number }>('SELECT hidden FROM community_replies WHERE id = ? AND post_id = ?', reply, post)
    if (!r) return false
    q.run('DELETE FROM community_replies WHERE id = ?', reply)
    if (!r.hidden) q.run('UPDATE community_posts SET replies = replies - 1 WHERE id = ?', post)
    return true
  })
}

export const communityAdmin = new Hono()
const ModBody = z.object({ post: z.number().int().positive(), reply: z.number().int().positive().optional() })
communityAdmin.post('/hide', async (c) => {
  const b = ModBody.extend({ hidden: z.boolean() }).safeParse(await c.req.json().catch(() => null))
  if (!b.success) return c.json({ error: 'bad-request' }, 400)
  return hide(b.data.post, b.data.reply, b.data.hidden) ? c.json({ ok: true }) : c.json({ error: 'not-found' }, 404)
})
communityAdmin.post('/delete', async (c) => {
  const b = ModBody.safeParse(await c.req.json().catch(() => null))
  if (!b.success) return c.json({ error: 'bad-request' }, 400)
  return remove(b.data.post, b.data.reply) ? c.json({ ok: true }) : c.json({ error: 'not-found' }, 404)
})
/** what's hidden (by a moderator or by reports), newest first, with how many reports each has */
communityAdmin.get('/hidden', (c) => {
  const posts = q.all<PostRow>(`SELECT ${POST_COLS} FROM community_posts p LEFT JOIN users u ON u.id = p.user_id WHERE p.hidden = 1 ORDER BY p.created_at DESC LIMIT 100`)
  const replies = q.all<ReplyRow & { title: string }>(
    `SELECT r.*, u.name, u.look, u.founder_at, p.title FROM community_replies r JOIN community_posts p ON p.id = r.post_id LEFT JOIN users u ON u.id = r.user_id WHERE r.hidden = 1 ORDER BY r.created_at DESC LIMIT 100`,
  )
  const reportsOf = (post: number, reply = 0) => q.get<{ n: number }>('SELECT COUNT(*) AS n FROM community_reports WHERE post_id = ? AND IFNULL(reply_id, 0) = ?', post, reply)!.n
  return c.json({
    posts: posts.map((p) => ({ ...postSummary(p, new Set(), null), body: p.body, reports: reportsOf(p.id) })),
    replies: replies.map((r) => ({ id: r.id, post: r.post_id, title: r.title, body: r.body, author: author(r), createdAt: r.created_at, reports: reportsOf(r.post_id, r.id) })),
  })
})

// views older than yesterday aren't needed to tell a repeat visit from a new one
const purgeViews = () => q.run('DELETE FROM community_views WHERE day < ?', today() - 1)
purgeViews()
setInterval(purgeViews, 3600_000).unref()
