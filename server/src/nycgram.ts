import { Hono } from 'hono'
import { z } from 'zod'
import { q, tx, publicUser, type UserRow } from './db.ts'
import { requireUser, type Env } from './auth.ts'
import { notifyUser } from './game/realtime.ts'
import { nycgramCaption } from './nycgramCaptions.ts'

/**
 * NYCgram: private phone gallery + a friends-only photo feed.
 * Images are compressed JPEG data URLs (client-side). Captions are template-generated on the server.
 * Only the owner can post their own photos; blocked players never see each other.
 */
export const nycgram = new Hono<Env>()

const GALLERY_KEEP = 24
const POSTS_KEEP = 12
const MAX_IMAGE = 80_000
const FEED_LIMIT = 24
const IMAGE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/

interface GalleryRow {
  id: number
  user_id: string
  image: string
  room: string
  kind: string
  created_at: number
}

interface PostRow {
  id: number
  user_id: string
  gallery_id: number | null
  image: string
  room: string
  caption: string
  created_at: number
  removed: number
}

const blocked = (a: string, b: string) =>
  !!q.get('SELECT 1 FROM blocks WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', a, b, b, a)

const friendsOf = (me: string) =>
  q
    .all<{ id: string }>(
      `SELECT CASE WHEN f.a = ? THEN f.b ELSE f.a END AS id FROM friends f
       WHERE (f.a = ? OR f.b = ?) AND f.status = 'accepted'`,
      me,
      me,
      me,
    )
    .map((r) => r.id)

const viewPost = (
  r: PostRow & UserRow & { likes: number; liked: number; post_id: number; post_at: number },
  me: string,
) => ({
  id: r.post_id,
  image: r.image,
  room: r.room,
  caption: r.caption,
  at: r.post_at,
  likes: r.likes,
  liked: !!r.liked,
  mine: r.user_id === me,
  // users.id wins over posts.id in the join row — publicUser needs the account id
  by: publicUser(r),
})

// ---------- gallery (private) ----------
nycgram.get('/gallery', requireUser, (c) => {
  const me = c.get('user')
  const rows = q.all<GalleryRow>(
    'SELECT * FROM nycgram_gallery WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    me.id,
    GALLERY_KEEP,
  )
  return c.json({
    photos: rows.map((r) => ({ id: r.id, image: r.image, room: r.room, kind: r.kind, at: r.created_at })),
    keep: GALLERY_KEEP,
  })
})

const GalleryBody = z.object({
  image: z.string().max(MAX_IMAGE).regex(IMAGE),
  room: z.string().min(1).max(64),
  kind: z.enum(['selfie', 'booth']).default('selfie'),
})

nycgram.post('/gallery', requireUser, async (c) => {
  const me = c.get('user')
  const b = GalleryBody.safeParse(await c.req.json().catch(() => null))
  if (!b.success) return c.json({ error: 'bad-request' }, 400)
  if (q.get('SELECT 1 FROM nycgram_gallery WHERE user_id = ? AND created_at > ?', me.id, Date.now() - 5_000)) {
    return c.json({ error: 'too-soon' }, 429)
  }
  const id = tx(() => {
    const r = q.run(
      'INSERT INTO nycgram_gallery (user_id, image, room, kind, created_at) VALUES (?, ?, ?, ?, ?)',
      me.id,
      b.data.image,
      b.data.room,
      b.data.kind,
      Date.now(),
    )
    q.run(
      `DELETE FROM nycgram_gallery WHERE user_id = ? AND id NOT IN
        (SELECT id FROM nycgram_gallery WHERE user_id = ? ORDER BY created_at DESC LIMIT ${GALLERY_KEEP})`,
      me.id,
      me.id,
    )
    return Number(r.lastInsertRowid)
  })
  return c.json({ ok: true, id, room: b.data.room, kind: b.data.kind })
})

nycgram.delete('/gallery/:id', requireUser, (c) => {
  const me = c.get('user')
  const id = Number(c.req.param('id'))
  const r = q.run('DELETE FROM nycgram_gallery WHERE id = ? AND user_id = ?', id, me.id)
  if (!r.changes) return c.json({ error: 'not-found' }, 404)
  return c.json({ ok: true })
})

// ---------- posts ----------
const PostBody = z.object({
  galleryId: z.number().int().positive().optional(),
  image: z.string().max(MAX_IMAGE).regex(IMAGE).optional(),
  room: z.string().min(1).max(64).optional(),
  kind: z.enum(['selfie', 'booth']).default('selfie'),
})

nycgram.post('/posts', requireUser, async (c) => {
  const me = c.get('user')
  const b = PostBody.safeParse(await c.req.json().catch(() => null))
  if (!b.success) return c.json({ error: 'bad-request' }, 400)
  if (q.get('SELECT 1 FROM nycgram_posts WHERE user_id = ? AND created_at > ? AND removed = 0', me.id, Date.now() - 30_000)) {
    return c.json({ error: 'too-soon' }, 429)
  }

  let image = b.data.image
  let room = b.data.room
  let galleryId: number | null = null
  let kind = b.data.kind

  if (b.data.galleryId) {
    const g = q.get<GalleryRow>('SELECT * FROM nycgram_gallery WHERE id = ? AND user_id = ?', b.data.galleryId, me.id)
    if (!g) return c.json({ error: 'not-found' }, 404)
    image = g.image
    room = g.room
    kind = (g.kind === 'booth' ? 'booth' : 'selfie') as 'selfie' | 'booth'
    galleryId = g.id
  }
  if (!image || !room) return c.json({ error: 'bad-request' }, 400)
  if (!IMAGE.test(image) || image.length > MAX_IMAGE) return c.json({ error: 'bad-request' }, 400)

  const caption = nycgramCaption(room, kind)
  const id = tx(() => {
    const r = q.run(
      'INSERT INTO nycgram_posts (user_id, gallery_id, image, room, caption, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      me.id,
      galleryId,
      image,
      room,
      caption,
      Date.now(),
    )
    q.run(
      `UPDATE nycgram_posts SET removed = 1 WHERE user_id = ? AND removed = 0 AND id NOT IN
        (SELECT id FROM nycgram_posts WHERE user_id = ? AND removed = 0 ORDER BY created_at DESC LIMIT ${POSTS_KEEP})`,
      me.id,
      me.id,
    )
    return Number(r.lastInsertRowid)
  })
  return c.json({ ok: true, id, caption, room })
})

nycgram.delete('/posts/:id', requireUser, (c) => {
  const me = c.get('user')
  const id = Number(c.req.param('id'))
  const r = q.run('UPDATE nycgram_posts SET removed = 1 WHERE id = ? AND user_id = ? AND removed = 0', id, me.id)
  if (!r.changes) return c.json({ error: 'not-found' }, 404)
  return c.json({ ok: true })
})

// ---------- feed: you + accepted friends, never blocked either way ----------
nycgram.get('/feed', requireUser, (c) => {
  const me = c.get('user')
  const ids = [me.id, ...friendsOf(me.id)]
  if (!ids.length) return c.json({ posts: [], end: true })

  const placeholders = ids.map(() => '?').join(',')
  // alias post id/time so they don't collide with users.id / users.created_at (SQLite keeps one of each name)
  const rows = q.all<PostRow & UserRow & { likes: number; liked: number; post_id: number; post_at: number }>(
    `SELECT u.*, p.user_id, p.gallery_id, p.image, p.room, p.caption, p.removed,
        p.id AS post_id, p.created_at AS post_at,
        (SELECT COUNT(*) FROM nycgram_likes l WHERE l.post_id = p.id) AS likes,
        (SELECT COUNT(*) FROM nycgram_likes l WHERE l.post_id = p.id AND l.liker = ?) AS liked
      FROM nycgram_posts p
      JOIN users u ON u.id = p.user_id
      WHERE p.removed = 0 AND p.user_id IN (${placeholders})
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.a = ? AND b.b = p.user_id) OR (b.a = p.user_id AND b.b = ?)
        )
      ORDER BY p.created_at DESC
      LIMIT ?`,
    me.id,
    ...ids,
    me.id,
    me.id,
    FEED_LIMIT,
  )
  return c.json({ posts: rows.map((r) => viewPost(r, me.id)), end: rows.length <= 8, keep: POSTS_KEEP })
})

nycgram.post('/posts/:id/like', requireUser, (c) => {
  const me = c.get('user')
  const id = Number(c.req.param('id'))
  const post = q.get<PostRow>('SELECT * FROM nycgram_posts WHERE id = ? AND removed = 0', id)
  if (!post) return c.json({ error: 'not-found' }, 404)
  if (post.user_id === me.id) return c.json({ error: 'own-post' }, 400)
  if (blocked(me.id, post.user_id)) return c.json({ error: 'blocked' }, 403)
  // only friends (or you already filtered) can like — still require friendship for likes on friends' posts
  const friend = friendsOf(me.id).includes(post.user_id)
  if (!friend) return c.json({ error: 'not-friends' }, 403)

  const r = q.run('INSERT OR IGNORE INTO nycgram_likes (post_id, liker, created_at) VALUES (?, ?, ?)', id, me.id, Date.now())
  const likes = q.get<{ n: number }>('SELECT COUNT(*) AS n FROM nycgram_likes WHERE post_id = ?', id)!.n
  if (r.changes) notifyUser(post.user_id, { t: 'n', k: 'nyc', i: me.id, n: me.name ?? '' })
  return c.json({ ok: true, likes, liked: true })
})

nycgram.delete('/posts/:id/like', requireUser, (c) => {
  const me = c.get('user')
  const id = Number(c.req.param('id'))
  q.run('DELETE FROM nycgram_likes WHERE post_id = ? AND liker = ?', id, me.id)
  const likes = q.get<{ n: number }>('SELECT COUNT(*) AS n FROM nycgram_likes WHERE post_id = ?', id)?.n ?? 0
  return c.json({ ok: true, likes, liked: false })
})
