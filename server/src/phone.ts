import { randomBytes, randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import { q, tx, publicUser, type UserRow } from './db.ts'
import { requireUser, type Env } from './auth.ts'
import { cleanChat } from './game/filter.ts'
import { validLook } from './game/rules.ts'
import { muteOf } from './moderation.ts'
import { presenceOf, notifyUser, walletChanged } from './game/realtime.ts'
import { ensureWallet, walletOf, recentLedger } from './economy.ts'
import { nycDay } from '../../app/src/data/economy.ts'
import { IPOS } from '../../app/src/data/ipos.ts'
import { market, ipoBySym, priceAt, tickOf, tradeValue, STOCK_RULES } from '../../app/src/data/stocks.ts'
import { BANK_RULES, type DmMessage, type DmThread } from '../../app/src/features/ifruit/wire.ts'

/**
 * The iFruit phone's server side (docs/ifruit/SPEC.md): Messages (DMs and group chats between friends, filtered like
 * room chat), Bank (the ledger, and coins between friends with daily limits) and Stocks (the city's companies, priced
 * from a secret seed, settled through the wallet). Everything is friends-only and respects blocks and mutes.
 */
export const phone = new Hono<Env>()
phone.use('*', requireUser)

const userRow = (id: string) => q.get<UserRow>('SELECT * FROM users WHERE id = ?', id)
const areFriends = (a: string, b: string) =>
  !!q.get(`SELECT 1 FROM friends WHERE status = 'accepted' AND ((a = ? AND b = ?) OR (a = ? AND b = ?))`, a, b, b, a)
const blockedEither = (a: string, b: string) => !!q.get('SELECT 1 FROM blocks WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', a, b, b, a)

// ---------- rate limits (in memory, per user) ----------
const hits = new Map<string, number[]>()
function tooFast(key: string, perMinute: number, minGapMs: number) {
  const now = Date.now()
  const list = (hits.get(key) ?? []).filter((t) => t > now - 60_000)
  if (list.length >= perMinute || (list.length && now - list[list.length - 1] < minGapMs)) return true
  list.push(now)
  hits.set(key, list)
  if (hits.size > 20_000) hits.clear()
  return false
}

// ---------- Messages ----------
const dmId = (a: string, b: string) => (a < b ? `dm:${a}:${b}` : `dm:${b}:${a}`)
const members = (thread: string) => q.all<{ user_id: string; read_at: number; left_at: number | null }>('SELECT user_id, read_at, left_at FROM dm_members WHERE thread_id = ?', thread)
const isMember = (thread: string, user: string) => !!q.get('SELECT 1 FROM dm_members WHERE thread_id = ? AND user_id = ? AND left_at IS NULL', thread, user)

interface MsgRow { id: number; thread_id: string; user_id: string | null; kind: string; body: string; meta: string | null; at: number }
const wireMsg = (r: MsgRow): DmMessage => ({ id: r.id, th: r.thread_id, from: r.user_id ?? '', kind: r.kind as DmMessage['kind'], text: r.body, meta: r.meta ? JSON.parse(r.meta) : undefined, at: r.at })

function ensureDm(a: string, b: string): string {
  const id = dmId(a, b)
  if (!q.get('SELECT 1 FROM dm_threads WHERE id = ?', id)) {
    const now = Date.now()
    tx(() => {
      q.run('INSERT OR IGNORE INTO dm_threads (id, kind, name, created_by, created_at, last_at) VALUES (?, ?, NULL, ?, ?, ?)', id, 'dm', a, now, now)
      q.run('INSERT OR IGNORE INTO dm_members (thread_id, user_id, joined_at) VALUES (?, ?, ?), (?, ?, ?)', id, a, now, id, b, now)
    })
  }
  return id
}

/** store a message and push it to every member who's online (the sender's other tabs too) */
export function postMessage(thread: string, from: string | null, kind: DmMessage['kind'], body: string, meta?: unknown): DmMessage {
  const at = Date.now()
  const id = tx(() => {
    const r = q.run('INSERT INTO dm_messages (thread_id, user_id, kind, body, meta, at) VALUES (?, ?, ?, ?, ?, ?)', thread, from, kind, body, meta === undefined ? null : JSON.stringify(meta), at)
    q.run('UPDATE dm_threads SET last_at = ? WHERE id = ?', at, thread)
    if (from) q.run('UPDATE dm_members SET read_at = ? WHERE thread_id = ? AND user_id = ?', at, thread, from)
    return Number(r.lastInsertRowid)
  })
  const m: DmMessage = { id, th: thread, from: from ?? '', kind, text: body, meta: meta as DmMessage['meta'], at }
  const sender = from ? userRow(from) : null
  for (const mem of members(thread)) {
    if (mem.left_at) continue
    if (from && mem.user_id !== from && blockedEither(from, mem.user_id)) continue
    notifyUser(mem.user_id, { t: 'dm', m, n: sender?.name ?? '' })
  }
  return m
}

function threadOut(me: string, t: { id: string; kind: string; name: string | null; last_at: number; created_by: string | null }): DmThread {
  const mems = members(t.id)
  const mine = mems.find((m) => m.user_id === me)
  const people = mems
    .filter((m) => m.user_id !== me && !m.left_at)
    .map((m) => userRow(m.user_id))
    .filter((u): u is UserRow => !!u)
    .map((u) => ({ ...publicUser(u), ...presenceOf(u.id) }))
  const last = q.get<MsgRow>('SELECT * FROM dm_messages WHERE thread_id = ? ORDER BY id DESC LIMIT 1', t.id)
  const unread = q.get<{ n: number }>('SELECT COUNT(*) AS n FROM dm_messages WHERE thread_id = ? AND at > ? AND (user_id IS NULL OR user_id != ?)', t.id, mine?.read_at ?? 0, me)!.n
  return { id: t.id, kind: t.kind as DmThread['kind'], name: t.name ?? '', people, last: last ? wireMsg(last) : null, unread, at: t.last_at, mine: t.created_by === me }
}

phone.get('/threads', (c) => {
  const me = c.get('user').id
  const rows = q.all<{ id: string; kind: string; name: string | null; last_at: number; created_by: string | null }>(
    `SELECT t.* FROM dm_threads t JOIN dm_members m ON m.thread_id = t.id WHERE m.user_id = ? AND m.left_at IS NULL ORDER BY t.last_at DESC LIMIT 60`,
    me,
  )
  return c.json({ threads: rows.map((t) => threadOut(me, t)).filter((t) => t.kind === 'group' || t.people.length) })
})

const NewThread = z.object({ members: z.array(z.string().max(64)).min(1).max(7), name: z.string().max(24).optional() })
phone.post('/threads', async (c) => {
  const me = c.get('user')
  const body = NewThread.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'bad-request' }, 400)
  const ids = [...new Set(body.data.members)].filter((id) => id !== me.id)
  if (!ids.length) return c.json({ error: 'bad-request' }, 400)
  for (const id of ids) if (!areFriends(me.id, id) || blockedEither(me.id, id)) return c.json({ error: 'not-friends' }, 403)
  let id: string
  if (ids.length === 1) id = ensureDm(me.id, ids[0])
  else {
    id = `g:${randomUUID()}`
    const now = Date.now()
    const name = cleanChat(body.data.name ?? '').slice(0, 24)
    tx(() => {
      q.run('INSERT INTO dm_threads (id, kind, name, created_by, created_at, last_at) VALUES (?, ?, ?, ?, ?, ?)', id, 'group', name || null, me.id, now, now)
      for (const u of [me.id, ...ids]) q.run('INSERT INTO dm_members (thread_id, user_id, joined_at) VALUES (?, ?, ?)', id, u, now)
    })
    postMessage(id, null, 'sys', `${me.name} started the group`)
  }
  const t = q.get<{ id: string; kind: string; name: string | null; last_at: number; created_by: string | null }>('SELECT * FROM dm_threads WHERE id = ?', id)!
  return c.json({ thread: threadOut(me.id, t) })
})

phone.get('/threads/:id', (c) => {
  const me = c.get('user').id
  const id = c.req.param('id')
  if (!isMember(id, me)) return c.json({ error: 'not-found' }, 404)
  const before = Number(c.req.query('before')) || Number.MAX_SAFE_INTEGER
  const rows = q.all<MsgRow>('SELECT * FROM dm_messages WHERE thread_id = ? AND id < ? ORDER BY id DESC LIMIT 60', id, before)
  // messages from people you've blocked since stay out of view
  const blocked = new Set(q.all<{ b: string }>('SELECT b FROM blocks WHERE a = ?', me).map((r) => r.b))
  return c.json({ messages: rows.reverse().filter((r) => !r.user_id || !blocked.has(r.user_id)).map(wireMsg) })
})

/** a photo is a recipe the game draws (room, crop, people), never pixels: only the city's own art can be sent */
const Person = z.object({ look: z.unknown(), x: z.number(), y: z.number(), s: z.number().min(0.1).max(4), d: z.number().optional(), blur: z.boolean().optional() })
const Recipe = z.object({
  room: z.string().regex(/^[a-z0-9-]{2,40}$/),
  bg: z.string().regex(/^[a-z0-9-]{2,60}$/),
  crop: z.object({ x: z.number(), y: z.number(), w: z.number().min(50).max(1000), h: z.number().min(28).max(565) }),
  people: z.array(Person).max(14),
  title: z.string().max(40),
  at: z.number(),
  fx: z.enum(['none', 'sepia', 'mono', 'vivid', 'noir', 'fade']).optional(),
})
const Send = z.object({ kind: z.enum(['text', 'photo', 'place', 'call']), text: z.string().max(240).optional(), meta: z.unknown().optional() })
phone.post('/threads/:id', async (c) => {
  const me = c.get('user')
  const id = c.req.param('id')
  if (!isMember(id, me.id)) return c.json({ error: 'not-found' }, 404)
  const mute = muteOf(me)
  if (mute) return c.json({ error: 'muted', until: mute.until }, 403)
  if (tooFast(`dm:${me.id}`, 40, 700)) return c.json({ error: 'slow-down' }, 429)
  const body = Send.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'bad-request' }, 400)
  // a 1:1 thread only works while you're still friends
  const others = members(id).filter((m) => m.user_id !== me.id && !m.left_at)
  if (id.startsWith('dm:') && others.some((o) => !areFriends(me.id, o.user_id) || blockedEither(me.id, o.user_id))) return c.json({ error: 'not-friends' }, 403)
  const { kind } = body.data
  if (kind === 'text') {
    const text = cleanChat(body.data.text ?? '')
    if (!text) return c.json({ error: 'empty' }, 400)
    return c.json({ message: postMessage(id, me.id, 'text', text) })
  }
  if (kind === 'call') {
    // a call that rang out, written by the caller's phone
    const missed = z.object({ missed: z.literal(true) }).safeParse(body.data.meta)
    if (!missed.success) return c.json({ error: 'bad-request' }, 400)
    return c.json({ message: postMessage(id, me.id, 'call', '', { missed: true }) })
  }
  if (kind === 'place') {
    const room = z.object({ room: z.string().regex(/^[a-z0-9-]{2,40}$/), name: z.string().max(40) }).safeParse(body.data.meta)
    if (!room.success) return c.json({ error: 'bad-request' }, 400)
    return c.json({ message: postMessage(id, me.id, 'place', '', room.data) })
  }
  const raw = JSON.stringify(body.data.meta ?? null)
  const r = Recipe.safeParse(body.data.meta)
  if (!r.success || raw.length > 12_000) return c.json({ error: 'bad-photo' }, 400)
  const people = r.data.people.map((p) => ({ ...p, look: validLook(p.look) }))
  if (people.some((p) => !p.look)) return c.json({ error: 'bad-photo' }, 400)
  const caption = cleanChat(body.data.text ?? '').slice(0, 120)
  return c.json({ message: postMessage(id, me.id, 'photo', caption, { ...r.data, title: cleanChat(r.data.title), people }) })
})

phone.post('/threads/:id/read', (c) => {
  const me = c.get('user').id
  q.run('UPDATE dm_members SET read_at = ? WHERE thread_id = ? AND user_id = ?', Date.now(), c.req.param('id'), me)
  return c.json({ ok: true })
})
phone.post('/threads/:id/leave', (c) => {
  const me = c.get('user')
  const id = c.req.param('id')
  if (!id.startsWith('g:') || !isMember(id, me.id)) return c.json({ error: 'not-found' }, 404)
  q.run('UPDATE dm_members SET left_at = ? WHERE thread_id = ? AND user_id = ?', Date.now(), id, me.id)
  postMessage(id, null, 'sys', `${me.name} left`)
  return c.json({ ok: true })
})
phone.post('/threads/:id/rename', async (c) => {
  const me = c.get('user')
  const id = c.req.param('id')
  const name = cleanChat(String((await c.req.json().catch(() => ({})))?.name ?? '')).slice(0, 24)
  if (!id.startsWith('g:') || !isMember(id, me.id) || !name) return c.json({ error: 'bad-request' }, 400)
  q.run('UPDATE dm_threads SET name = ? WHERE id = ?', name, id)
  postMessage(id, null, 'sys', `${me.name} named the group ${name}`)
  return c.json({ ok: true })
})

// ---------- Bank ----------
const sumDay = (sql: string, ...args: (string | number)[]) => q.get<{ n: number | null }>(sql, ...args)!.n ?? 0
function limits(me: string) {
  const day = nycDay()
  const since = Date.now() - 36 * 3600_000
  const sent = sumDay(`SELECT SUM(-delta) AS n FROM ledger WHERE user_id = ? AND reason = 'gift-out' AND day = ?`, me, day)
  const got = sumDay(`SELECT SUM(delta) AS n FROM ledger WHERE user_id = ? AND reason = 'gift-in' AND day = ? AND at > ?`, me, day, since)
  return { sent, got, sendLeft: Math.max(0, BANK_RULES.sendPerDay - sent), receiveLeft: Math.max(0, BANK_RULES.receivePerDay - got) }
}
const receivedToday = (id: string) => sumDay(`SELECT SUM(delta) AS n FROM ledger WHERE user_id = ? AND reason = 'gift-in' AND day = ?`, id, nycDay())

interface TransferRow { id: number; from_id: string; to_id: string; amount: number; note: string; kind: string; status: string; created_at: number }
const transferOut = (t: TransferRow) => {
  const from = userRow(t.from_id)
  const to = userRow(t.to_id)
  return { id: t.id, from: t.from_id, fromName: from?.name ?? '', to: t.to_id, toName: to?.name ?? '', amount: t.amount, note: t.note, kind: t.kind, status: t.status, at: t.created_at }
}

phone.get('/bank', (c) => {
  const me = c.get('user')
  const w = ensureWallet(me)
  // requests older than three days lapse
  q.run(`UPDATE transfers SET status = 'expired', settled_at = ? WHERE kind = 'request' AND status = 'pending' AND created_at < ?`, Date.now(), Date.now() - BANK_RULES.requestDays * 86_400_000)
  const pending = q.all<TransferRow>(`SELECT * FROM transfers WHERE kind = 'request' AND status = 'pending' AND (to_id = ? OR from_id = ?) ORDER BY id DESC LIMIT 20`, me.id, me.id)
  // gift refs name the other person so Activity can say who
  const ledger = recentLedger(me.id, 80).map((l) => {
    if ((l.reason === 'gift-in' || l.reason === 'gift-out') && l.ref) {
      const t = q.get<TransferRow>('SELECT * FROM transfers WHERE id = ?', Number(l.ref.split(':')[0]))
      const other = t ? userRow(l.reason === 'gift-in' ? t.from_id : t.to_id) : null
      return { ...l, who: other?.name ?? '', note: t?.note ?? '' }
    }
    return l
  })
  return c.json({ coins: w.coins, ledger, requests: pending.map(transferOut), limits: limits(me.id) })
})

/** check a transfer can happen; returns an error code or null */
function transferProblem(me: UserRow, toId: string, amount: number): string | null {
  if (toId === me.id) return 'self'
  if (!areFriends(me.id, toId) || blockedEither(me.id, toId)) return 'not-friends'
  if (!Number.isInteger(amount) || amount < 1 || amount > BANK_RULES.maxPerTransfer) return 'bad-amount'
  // a brand-new account can't move coins yet (so throwaway accounts can't funnel their starting coins)
  if (Date.now() - me.created_at < BANK_RULES.minAccountAgeMs) return 'too-new'
  if (limits(me.id).sendLeft < amount) return 'send-limit'
  if (receivedToday(toId) + amount > BANK_RULES.receivePerDay) return 'their-limit'
  return null
}

/** move coins between two friends in one transaction: two ledger lines, one transfer row */
function settle(fromId: string, toId: string, amount: number, note: string, transferId?: number) {
  const day = nycDay()
  const now = Date.now()
  return tx(() => {
    const from = userRow(fromId)!
    if ((from.coins ?? 0) < amount) return { ok: false as const, error: 'poor' }
    let id = transferId
    if (id) q.run(`UPDATE transfers SET status = 'paid', settled_at = ? WHERE id = ?`, now, id)
    else id = Number(q.run(`INSERT INTO transfers (from_id, to_id, amount, note, kind, status, created_at, settled_at) VALUES (?, ?, ?, ?, 'send', 'paid', ?, ?)`, fromId, toId, amount, note, now, now).lastInsertRowid)
    q.run('UPDATE users SET coins = coins - ? WHERE id = ?', amount, fromId)
    const fb = userRow(fromId)!.coins!
    q.run('INSERT INTO ledger (user_id, delta, reason, ref, day, balance, at) VALUES (?, ?, ?, ?, ?, ?, ?)', fromId, -amount, 'gift-out', `${id}:out`, day, fb, now)
    q.run('UPDATE users SET coins = coins + ? WHERE id = ?', amount, toId)
    const tb = userRow(toId)!.coins!
    q.run('INSERT INTO ledger (user_id, delta, reason, ref, day, balance, at) VALUES (?, ?, ?, ?, ?, ?, ?)', toId, amount, 'gift-in', `${id}:in`, day, tb, now)
    return { ok: true as const, id, fromBalance: fb }
  })
}

const Money = z.object({ to: z.string().max(64), amount: z.number().int(), note: z.string().max(40).optional() })
phone.post('/bank/send', async (c) => {
  const me = c.get('user')
  ensureWallet(me)
  if (tooFast(`pay:${me.id}`, 10, 1500)) return c.json({ error: 'slow-down' }, 429)
  const body = Money.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'bad-request' }, 400)
  const { to, amount } = body.data
  const note = cleanChat(body.data.note ?? '').slice(0, 40)
  const problem = transferProblem(me, to, amount)
  if (problem) return c.json({ error: problem })
  const other = userRow(to)!
  ensureWallet(other)
  const r = settle(me.id, to, amount, note)
  if (!r.ok) return c.json({ error: r.error })
  const mw = walletOf(me.id)!
  const tw = walletOf(to)!
  walletChanged(me.id, mw)
  walletChanged(to, tw, `${me.name} sent you $${amount}`)
  postMessage(ensureDm(me.id, to), me.id, 'pay', note, { amount, transfer: r.id })
  return c.json({ ok: true, coins: mw.coins })
})

phone.post('/bank/request', async (c) => {
  const me = c.get('user')
  if (tooFast(`req:${me.id}`, 6, 2000)) return c.json({ error: 'slow-down' }, 429)
  const body = Money.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'bad-request' }, 400)
  const { to, amount } = body.data
  if (to === me.id || !areFriends(me.id, to) || blockedEither(me.id, to)) return c.json({ error: 'not-friends' })
  if (amount < 1 || amount > BANK_RULES.maxPerTransfer) return c.json({ error: 'bad-amount' })
  const open = q.get<{ n: number }>(`SELECT COUNT(*) AS n FROM transfers WHERE from_id = ? AND to_id = ? AND kind = 'request' AND status = 'pending'`, to, me.id)!.n
  if (open >= 2) return c.json({ error: 'already-asked' })
  const note = cleanChat(body.data.note ?? '').slice(0, 40)
  // a request is a transfer the OTHER person would send (from: them, to: me), waiting for their yes
  const id = Number(q.run(`INSERT INTO transfers (from_id, to_id, amount, note, kind, status, created_at) VALUES (?, ?, ?, ?, 'request', 'pending', ?)`, to, me.id, amount, note, Date.now()).lastInsertRowid)
  postMessage(ensureDm(me.id, to), me.id, 'request', note, { amount, transfer: id, status: 'pending' })
  notifyUser(to, { t: 'payreq', id, i: me.id, n: me.name ?? '', a: amount, note })
  return c.json({ ok: true, id })
})

phone.post('/bank/requests/:id/:act', (c) => {
  const me = c.get('user')
  const id = Number(c.req.param('id'))
  const act = c.req.param('act')
  const t = q.get<TransferRow>(`SELECT * FROM transfers WHERE id = ? AND kind = 'request' AND status = 'pending'`, id)
  if (!t) return c.json({ error: 'gone' })
  // the payer answers; the asker can cancel
  if (act === 'cancel' && t.to_id === me.id) {
    q.run(`UPDATE transfers SET status = 'cancelled', settled_at = ? WHERE id = ?`, Date.now(), id)
    return c.json({ ok: true })
  }
  if (t.from_id !== me.id) return c.json({ error: 'not-yours' }, 403)
  if (act === 'decline') {
    q.run(`UPDATE transfers SET status = 'declined', settled_at = ? WHERE id = ?`, Date.now(), id)
    postMessage(ensureDm(me.id, t.to_id), null, 'sys', `${me.name} declined a request for ${t.amount}`)
    return c.json({ ok: true })
  }
  if (act !== 'pay') return c.json({ error: 'bad-request' }, 400)
  ensureWallet(me)
  const problem = transferProblem(me, t.to_id, t.amount)
  if (problem) return c.json({ error: problem })
  ensureWallet(userRow(t.to_id)!)
  const r = settle(me.id, t.to_id, t.amount, t.note, id)
  if (!r.ok) return c.json({ error: r.error })
  const mw = walletOf(me.id)!
  walletChanged(me.id, mw)
  walletChanged(t.to_id, walletOf(t.to_id)!, `${me.name} paid your request`)
  postMessage(ensureDm(me.id, t.to_id), me.id, 'pay', t.note, { amount: t.amount, transfer: id })
  return c.json({ ok: true, coins: mw.coins })
})

// ---------- Stocks ----------
let seed = q.get<{ value: string }>(`SELECT value FROM settings WHERE key = 'stock-seed'`)?.value
if (!seed) {
  seed = randomBytes(16).toString('hex')
  q.run(`INSERT OR IGNORE INTO settings (key, value, at) VALUES ('stock-seed', ?, ?)`, seed, Date.now())
  seed = q.get<{ value: string }>(`SELECT value FROM settings WHERE key = 'stock-seed'`)!.value
}
const SEED = seed
let cachedMarket: { tick: number; v: ReturnType<typeof market> } | null = null
const marketNow = () => {
  const t = tickOf()
  if (cachedMarket?.tick !== t) cachedMarket = { tick: t, v: market(SEED) }
  return cachedMarket.v
}
const holdingsOf = (id: string) => q.all<{ sym: string; shares: number; cost: number }>('SELECT sym, shares, cost FROM holdings WHERE user_id = ? AND shares > 0', id)
const tradesToday = (id: string) => q.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ledger WHERE user_id = ? AND day = ? AND (reason LIKE 'stock-buy:%' OR reason LIKE 'stock-sell:%')`, id, nycDay())!.n

phone.get('/stocks', (c) => {
  const me = c.get('user')
  return c.json({ quotes: marketNow(), holdings: holdingsOf(me.id), trades: tradesToday(me.id), coins: ensureWallet(me).coins, count: IPOS.length })
})

const Trade = z.object({ sym: z.string().max(8), side: z.enum(['buy', 'sell']), shares: z.number().int().min(1).max(STOCK_RULES.maxShares) })
phone.post('/stocks/trade', async (c) => {
  const me = c.get('user')
  ensureWallet(me)
  if (tooFast(`trade:${me.id}`, 12, 800)) return c.json({ error: 'slow-down' }, 429)
  const body = Trade.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ error: 'bad-request' }, 400)
  const ipo = ipoBySym(body.data.sym)
  if (!ipo) return c.json({ error: 'no-company' })
  if (tradesToday(me.id) >= STOCK_RULES.tradesPerDay) return c.json({ error: 'trade-limit' })
  const { side, shares } = body.data
  const price = priceAt(SEED, ipo, tickOf())
  const value = tradeValue(price, shares)
  const day = nycDay()
  const now = Date.now()
  const r = tx(() => {
    const u = userRow(me.id)!
    const h = q.get<{ shares: number; cost: number }>('SELECT shares, cost FROM holdings WHERE user_id = ? AND sym = ?', me.id, ipo.sym) ?? { shares: 0, cost: 0 }
    let delta: number
    if (side === 'buy') {
      const invested = q.get<{ n: number | null }>('SELECT SUM(cost) AS n FROM holdings WHERE user_id = ?', me.id)!.n ?? 0
      if (invested + value > STOCK_RULES.maxInvested) return { error: 'invest-limit' }
      if (h.shares + shares > STOCK_RULES.maxShares) return { error: 'share-limit' }
      delta = -(value + STOCK_RULES.fee)
      if ((u.coins ?? 0) < -delta) return { error: 'poor' }
      q.run('INSERT INTO holdings (user_id, sym, shares, cost) VALUES (?, ?, ?, ?) ON CONFLICT(user_id, sym) DO UPDATE SET shares = shares + excluded.shares, cost = cost + excluded.cost', me.id, ipo.sym, shares, value)
    } else {
      if (h.shares < shares) return { error: 'not-enough-shares' }
      delta = value - STOCK_RULES.fee
      const costOut = Math.round((h.cost * shares) / h.shares)
      q.run('UPDATE holdings SET shares = shares - ?, cost = cost - ? WHERE user_id = ? AND sym = ?', shares, costOut, me.id, ipo.sym)
      q.run('DELETE FROM holdings WHERE user_id = ? AND shares <= 0', me.id)
    }
    q.run('UPDATE users SET coins = coins + ? WHERE id = ?', delta, me.id)
    const bal = userRow(me.id)!.coins!
    q.run('INSERT INTO ledger (user_id, delta, reason, ref, day, balance, at) VALUES (?, ?, ?, NULL, ?, ?, ?)', me.id, delta, `stock-${side}:${ipo.sym}`, day, bal, now)
    return { ok: true, delta, coins: bal }
  })
  if ('error' in r) return c.json({ error: r.error })
  walletChanged(me.id, walletOf(me.id)!)
  return c.json({ ...r, price, holdings: holdingsOf(me.id), trades: tradesToday(me.id) })
})
