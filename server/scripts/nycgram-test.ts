/**
 * NYCgram self-test on a throwaway database: gallery caps, owner-only posts, auto captions,
 * friends feed, blocks, and pizza likes.
 *   npx tsx scripts/nycgram-test.ts
 */
import { createHash } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'club-nycgram-')), 'test.sqlite')
process.env.PUBLIC_URL = 'http://localhost:5173'
process.env.ALLOW_GUESTS = 'true'

const { Hono } = await import('hono')
const { auth, SESSION_COOKIE } = await import('../src/auth.ts')
const { nycgram } = await import('../src/nycgram.ts')
const { nycgramCaption } = await import('../src/nycgramCaptions.ts')
const { q } = await import('../src/db.ts')

const app = new Hono()
app.route('/api/auth', auth)
app.route('/api/nycgram', nycgram)

let failed = 0
const check = (what: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${what}${detail ? ` (${detail})` : ''}`)
  if (!ok) failed++
}

/** tiny valid JPEG data URL (1×1) */
const TINY =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGcP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z'

const sha = (s: string) => createHash('sha256').update(s).digest('hex')

const cookieOf = async () => {
  const res = await app.request('/api/auth/guest', { method: 'POST' })
  const set = res.headers.get('set-cookie') ?? ''
  const m = set.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))
  if (!m) throw new Error('no session cookie')
  return `${SESSION_COOKIE}=${m[1]}`
}

const finish = (id: string, name: string) => {
  q.run(
    'UPDATE users SET name = ?, profile_done = 1, look = ? WHERE id = ?',
    name,
    '{"skin":1,"hair":"short","hairColor":1,"items":{}}',
    id,
  )
}

const userIdFromCookie = (cookie: string) => {
  const token = cookie.slice(SESSION_COOKIE.length + 1)
  return q.get<{ user_id: string }>('SELECT user_id FROM sessions WHERE id = ?', sha(token))!.user_id
}

const json = async (path: string, cookie: string, init?: RequestInit) => {
  const headers: Record<string, string> = { cookie, ...(init?.headers as Record<string, string> | undefined) }
  if (init?.body) headers['content-type'] = 'application/json'
  const res = await app.request(path, { ...init, headers })
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, body }
}

console.log('captions')
check('times square caption is funny NYC', /Times Square|billboards|Neon/i.test(nycgramCaption('times-square', 'selfie', 0)))
check('starducks coffee joke', /coffee|cup|Latte/i.test(nycgramCaption('starducks', 'selfie', 0)))
check('booth gets strip lines', /booth|poses|Squeeze/i.test(nycgramCaption('times-square', 'booth', 16)))
check('caption capped at 120', nycgramCaption('times-square', 'selfie', 99).length <= 120)

console.log('auth + gallery')
const aCookie = await cookieOf()
const bCookie = await cookieOf()
const aId = userIdFromCookie(aCookie)
const bId = userIdFromCookie(bCookie)
finish(aId, 'BagelBot')
finish(bId, 'PizzaPal')

const g1 = await json('/api/nycgram/gallery', aCookie, {
  method: 'POST',
  body: JSON.stringify({ image: TINY, room: 'times-square', kind: 'selfie' }),
})
check('save to gallery', g1.status === 200 && g1.body.ok === true, JSON.stringify(g1.body))
const galleryId = g1.body.id as number

const tooSoon = await json('/api/nycgram/gallery', aCookie, {
  method: 'POST',
  body: JSON.stringify({ image: TINY, room: 'times-square', kind: 'selfie' }),
})
check('gallery rate limit', tooSoon.status === 429)

const steal = await json('/api/nycgram/posts', bCookie, {
  method: 'POST',
  body: JSON.stringify({ galleryId }),
})
check('friend cannot post your gallery photo', steal.status === 404)

q.run('UPDATE nycgram_gallery SET created_at = ? WHERE id = ?', Date.now() - 60_000, galleryId)

const post = await json('/api/nycgram/posts', aCookie, {
  method: 'POST',
  body: JSON.stringify({ galleryId }),
})
check('owner posts from gallery', post.status === 200 && typeof post.body.caption === 'string', JSON.stringify(post.body))
const postId = post.body.id as number
check('caption is server-generated not empty', !!(post.body.caption as string)?.length)

q.run('UPDATE nycgram_posts SET created_at = ? WHERE id = ?', Date.now() - 60_000, postId)
const post2 = await json('/api/nycgram/posts', aCookie, {
  method: 'POST',
  body: JSON.stringify({ image: TINY, room: 'central-park', kind: 'selfie', caption: 'hacked caption' }),
})
check('second post with image works after cooldown', post2.status === 200, JSON.stringify(post2.body))
check(
  'no free-text caption accepted (server chooses)',
  typeof post2.body.caption === 'string' && !(post2.body.caption as string).includes('hacked'),
)

console.log('feed + friends + blocks')
const feedAlone = await json('/api/nycgram/feed', bCookie)
const alonePosts = (feedAlone.body.posts as unknown[]) ?? []
check('non-friend does not see your posts', alonePosts.length === 0, `n=${alonePosts.length}`)

q.run(`INSERT INTO friends (a, b, status, created_at) VALUES (?, ?, 'accepted', ?)`, aId, bId, Date.now())
const feedFriend = await json('/api/nycgram/feed', bCookie)
const friendPosts = (feedFriend.body.posts as { id: number; by: { name: string } }[]) ?? []
check('friend sees your posts', friendPosts.some((p) => p.id === postId), `n=${friendPosts.length}`)

const like = await json(`/api/nycgram/posts/${postId}/like`, bCookie, { method: 'POST', body: '{}' })
check('friend can pizza-like', like.status === 200 && like.body.liked === true && (like.body.likes as number) >= 1, JSON.stringify(like.body))

const likeSelf = await json(`/api/nycgram/posts/${postId}/like`, aCookie, { method: 'POST', body: '{}' })
check('cannot like own post', likeSelf.status === 400)

q.run('INSERT OR IGNORE INTO blocks (a, b) VALUES (?, ?)', aId, bId)
const feedBlocked = await json('/api/nycgram/feed', bCookie)
const blockedPosts = (feedBlocked.body.posts as { id: number }[]) ?? []
check('blocked player does not see posts', !blockedPosts.some((p) => p.id === postId), `n=${blockedPosts.length}`)

const likeBlocked = await json(`/api/nycgram/posts/${postId}/like`, bCookie, { method: 'POST', body: '{}' })
check('blocked cannot like', likeBlocked.status === 403)

console.log('caps')
q.run('DELETE FROM blocks WHERE a = ? AND b = ?', aId, bId)
for (let i = 0; i < 30; i++) {
  q.run(
    'INSERT INTO nycgram_gallery (user_id, image, room, kind, created_at) VALUES (?, ?, ?, ?, ?)',
    aId,
    TINY,
    'times-square',
    'selfie',
    Date.now() - i * 1000,
  )
}
q.run('UPDATE nycgram_gallery SET created_at = created_at - 10000 WHERE user_id = ?', aId)
const gTrim = await json('/api/nycgram/gallery', aCookie, {
  method: 'POST',
  body: JSON.stringify({ image: TINY, room: 'times-square', kind: 'selfie' }),
})
check('gallery save after fill still ok', gTrim.status === 200 || gTrim.status === 429)
const gal = await json('/api/nycgram/gallery', aCookie)
const photos = (gal.body.photos as unknown[]) ?? []
check('gallery capped at 24', photos.length <= 24, `n=${photos.length}`)

for (let i = 0; i < 20; i++) {
  q.run(
    'INSERT INTO nycgram_posts (user_id, image, room, caption, created_at, removed) VALUES (?, ?, ?, ?, ?, 0)',
    aId,
    TINY,
    'times-square',
    'cap test',
    Date.now() - i * 1000,
  )
}
q.run('UPDATE nycgram_posts SET created_at = created_at - 60000 WHERE user_id = ?', aId)
const pTrim = await json('/api/nycgram/posts', aCookie, {
  method: 'POST',
  body: JSON.stringify({ image: TINY, room: 'times-square', kind: 'selfie' }),
})
check('post after fill ok', pTrim.status === 200 || pTrim.status === 429, JSON.stringify(pTrim.body))
const live = q.get<{ n: number }>('SELECT COUNT(*) AS n FROM nycgram_posts WHERE user_id = ? AND removed = 0', aId)!.n
check('posts kept per player ≤ 12', live <= 12, `n=${live}`)

const cCookie = await cookieOf()
finish(userIdFromCookie(cCookie), 'PngNope')
const badImg2 = await json('/api/nycgram/gallery', cCookie, {
  method: 'POST',
  body: JSON.stringify({ image: 'data:image/png;base64,aaaa', room: 'times-square' }),
})
check('rejects non-jpeg data URLs', badImg2.status === 400)

console.log(failed ? `\n${failed} FAILED` : '\nall nycgram tests passed')
process.exit(failed ? 1 : 0)
