import { Hono } from 'hono'
import { z } from 'zod'
import { q, tx, publicUser, type UserRow } from './db.ts'
import { requireUser, currentUser, type Env } from './auth.ts'
import { cleanChat } from './game/filter.ts'

/**
 * Love locks on the Brooklyn Bridge railing, the same railing for everyone. Locks and spare keys are bought at the
 * souvenir stand with the normal coin spend (ledger reasons 'lovelock' and 'lockkey'), so what you have in your
 * pocket is worked out from the ledger and the locks you've hung, never trusted from the browser:
 *   locks in pocket = bought - hung + unlocked by you
 *   keys            = spare keys bought + keys you kept when hanging - locks you've unlocked
 * Each New Yorker keeps their 8 newest locks on the railing; hanging a 9th sends the city's bolt cutters for the oldest.
 */
export const locks = new Hono<Env>()

const KEEP = 8
const SHAPES = ['classic', 'heart', 'round'] as const
/** a painted face is a small image (the lock's spray paint layer), kept small so the railing loads fast */
const PAINT = /^data:image\/(png|webp);base64,[A-Za-z0-9+/=]+$/
const MAX_PAINT = 14_000

interface LockRow { id: number; user_id: string; x: number; y: number; body: number; shape: string; initials: string; paint: string | null; kept_key: number; removed: string | null; created_at: number }

const n = (sql: string, ...args: (string | number)[]) => q.get<{ n: number }>(sql, ...args)!.n
function pocket(userId: string) {
  const bought = n(`SELECT COUNT(*) AS n FROM ledger WHERE user_id = ? AND reason = 'lovelock' AND delta < 0`, userId)
  const spare = n(`SELECT COUNT(*) AS n FROM ledger WHERE user_id = ? AND reason = 'lockkey' AND delta < 0`, userId)
  const hung = n('SELECT COUNT(*) AS n FROM love_locks WHERE user_id = ?', userId)
  const unlocked = n(`SELECT COUNT(*) AS n FROM love_locks WHERE user_id = ? AND removed = 'owner'`, userId)
  const kept = n('SELECT COUNT(*) AS n FROM love_locks WHERE user_id = ? AND kept_key = 1', userId)
  return { locks: Math.max(0, bought - hung + unlocked), keys: Math.max(0, spare + kept - unlocked), hung }
}

const view = (r: LockRow & UserRow, me: string | null) => ({
  id: r.id, x: r.x, y: r.y, body: r.body, shape: r.shape, initials: r.initials, paint: r.paint, at: r.created_at,
  by: publicUser(r).name, mine: r.user_id === me,
})

/** the railing: the newest locks (yours always included), and what's in your pocket */
locks.get('/', (c) => {
  const me = currentUser(c)
  const rows = q.all<LockRow & UserRow>(
    `SELECT u.*, l.* FROM love_locks l JOIN users u ON u.id = l.user_id
     WHERE l.removed IS NULL AND (l.id IN (SELECT id FROM love_locks WHERE removed IS NULL ORDER BY created_at DESC LIMIT 160) OR l.user_id = ?)
     ORDER BY l.created_at ASC`,
    me?.id ?? '',
  )
  const total = n('SELECT COUNT(*) AS n FROM love_locks WHERE removed IS NULL')
  const history = me ? q.all<LockRow>('SELECT * FROM love_locks WHERE user_id = ? ORDER BY created_at DESC LIMIT 30', me.id).map((r) => ({ id: r.id, body: r.body, shape: r.shape, initials: r.initials, paint: r.paint, at: r.created_at, removed: r.removed, kept: !!r.kept_key })) : []
  return c.json({ locks: rows.map((r) => view(r, me?.id ?? null)), total, pocket: me ? pocket(me.id) : null, history })
})

const Hang = z.object({
  x: z.number().min(0).max(1000),
  y: z.number().min(0).max(565),
  body: z.number().int().min(0).max(11),
  shape: z.enum(SHAPES),
  initials: z.string().max(8),
  paint: z.string().max(MAX_PAINT).regex(PAINT).nullable(),
  keepKey: z.boolean(),
})
locks.post('/', requireUser, async (c) => {
  const me = c.get('user')
  const b = Hang.safeParse(await c.req.json().catch(() => null))
  if (!b.success) return c.json({ error: 'bad-request' }, 400)
  if (pocket(me.id).locks < 1) return c.json({ error: 'no-lock' }, 409)
  // one lock a minute keeps the railing from being carpeted in a burst
  if (q.get('SELECT 1 FROM love_locks WHERE user_id = ? AND created_at > ?', me.id, Date.now() - 60_000)) return c.json({ error: 'too-soon' }, 429)
  const initials = cleanChat(b.data.initials).replace(/★/g, '').slice(0, 4)
  const id = tx(() => {
    const r = q.run('INSERT INTO love_locks (user_id, x, y, body, shape, initials, paint, kept_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      me.id, b.data.x, b.data.y, b.data.body, b.data.shape, initials, b.data.paint, b.data.keepKey ? 1 : 0, Date.now())
    // the bolt cutters: only your newest KEEP locks stay up
    q.run(`UPDATE love_locks SET removed = 'city', removed_at = ? WHERE user_id = ? AND removed IS NULL AND id NOT IN
      (SELECT id FROM love_locks WHERE user_id = ? AND removed IS NULL ORDER BY created_at DESC LIMIT ${KEEP})`, Date.now(), me.id, me.id)
    return Number(r.lastInsertRowid)
  })
  return c.json({ ok: true, id, initials, pocket: pocket(me.id) })
})

/** open one of your own locks with a key: it comes off the railing and back into your pocket */
locks.post('/:id/unlock', requireUser, (c) => {
  const me = c.get('user')
  const lock = q.get<LockRow>('SELECT * FROM love_locks WHERE id = ? AND user_id = ? AND removed IS NULL', Number(c.req.param('id')), me.id)
  if (!lock) return c.json({ error: 'not-found' }, 404)
  if (pocket(me.id).keys < 1) return c.json({ error: 'no-key' }, 409)
  q.run(`UPDATE love_locks SET removed = 'owner', removed_at = ? WHERE id = ?`, Date.now(), lock.id)
  return c.json({ ok: true, pocket: pocket(me.id) })
})
