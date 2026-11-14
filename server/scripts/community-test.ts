/**
 * Self-test for the community board (src/community.ts) on a throwaway database in the OS temp dir (the real
 * data/club-nyc.db is never opened): who may write, posting and the chat filter, per-account limits, replies,
 * one upvote per account (and taking it back), views once per visitor a day, sorting and the category filter,
 * reports (three hide it), the moderator tools behind Launch HQ's key, and the sign-in return path.
 *   npx tsx scripts/community-test.ts        (from server/)
 */
import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'club-nyc-community-'))
process.env.DB_PATH = join(dir, 'community.db')
const { Hono } = await import('hono')
const { q } = await import('../src/db.ts')
const { community, LIMITS, cleanText } = await import('../src/community.ts')
const { admin, adminToken } = await import('../src/admin.ts')
const { safeNext } = await import('../src/auth.ts')

const app = new Hono()
app.route('/api/community', community)
app.route('/api/admin', admin)

const ok = (msg: string) => console.log(`  ✓ ${msg}`)
let n = 0
/** a player and a session cookie for them */
function player(o: { guest?: boolean; named?: boolean; muted?: boolean; banned?: boolean } = {}) {
  const id = `cm-${++n}`
  const named = o.named ?? true
  q.run(
    'INSERT INTO users (id, name, created_at, is_guest, profile_done, look, muted_until, banned_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    id,
    named ? `Tester${n}` : null,
    Date.now(),
    o.guest ? 1 : 0,
    named ? 1 : 0,
    JSON.stringify({ skin: 1 }),
    o.muted ? Date.now() + 3600_000 : null,
    o.banned ? Date.now() + 3600_000 : null,
  )
  const token = `token-${id}-${'x'.repeat(20)}`
  q.run('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', createHash('sha256').update(token).digest('hex'), id, Date.now(), Date.now() + 86400_000)
  return { id, cookie: `club_sid=${token}` }
}
type Who = { cookie: string } | null
async function call(who: Who, method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { ...extra }
  if (who) headers.cookie = who.cookie
  if (body !== undefined) headers['content-type'] = 'application/json'
  const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  return { status: res.status, json: (await res.json()) as Record<string, any> }
}
const post = (who: Who, data: { category?: string; title?: string; body?: string }) =>
  call(who, 'POST', '/api/community/posts', { category: 'ideas', title: 'A ferry to Staten Island', body: 'It would be great to ride the ferry and see the statue.', ...data })

try {
  console.log('Who can write')
  {
    const anon = await call(null, 'GET', '/api/community/me')
    assert.equal(anon.json.canPost, false)
    assert.equal(anon.json.why, 'signed-out')
    assert.equal((await post(null, {})).status, 401)
    assert.equal((await post(player({ guest: true }), {})).json.error, 'guest')
    assert.equal((await post(player({ named: false }), {})).json.error, 'no-name')
    assert.equal((await post(player({ muted: true }), {})).json.error, 'muted')
    assert.equal((await post(player({ banned: true }), {})).status, 403)
    const me = await call(player(), 'GET', '/api/community/me')
    assert.equal(me.json.canPost, true)
    assert.match(me.json.user.name, /^Tester/)
    ok('signed out, guests, no New Yorker, muted and banned players are turned away; members are in')
  }

  console.log('Posting and the filter')
  const alice = player()
  const bob = player()
  const carol = player()
  let first: number
  {
    const r = await post(alice, { category: 'bugs', title: 'Taxi gets stuck at www.spam.com', body: 'Call me at 212-555-1234 or mail me@test.com\n\n\n\nThe cab freezes on 5th Ave.' })
    assert.equal(r.status, 200)
    first = r.json.id
    const view = await call(null, 'GET', `/api/community/posts/${first}`)
    assert.equal(view.json.post.title.includes('spam.com'), false)
    assert.ok(view.json.post.body.includes('[removed]'))
    assert.ok(view.json.post.body.includes('\n\nThe cab'), 'paragraphs are kept, extra blank lines are not')
    assert.equal(view.json.post.body.includes('\n\n\n'), false)
    assert.equal(view.json.post.author.id, alice.id)
    ok('links, emails and phone numbers are removed; paragraphs survive')
    assert.equal((await post(alice, { title: 'hi' })).json.error, 'title-short')
    assert.equal((await post(alice, { body: 'short' })).json.error, 'body-short')
    assert.equal((await post(alice, { category: 'memes' })).status, 400)
    const again = await post(alice, { category: 'bugs', title: 'Taxi gets stuck at www.spam.com', body: 'Same thing again, sent twice by a double click.' })
    assert.equal(again.json.id, first)
    ok('too short, unknown categories and double sends are handled')
    const long = cleanText('word '.repeat(2000), LIMITS.body.max)
    assert.ok(long.length <= LIMITS.body.max && long.length > 3000)
    ok('long text is filtered piece by piece and capped')
  }

  console.log('Per-account limits')
  {
    await post(alice, { title: 'Second idea', category: 'ideas' })
    await post(alice, { title: 'Third idea', category: 'feedback' })
    const fourth = await post(alice, { title: 'Fourth idea in ten minutes' })
    assert.equal(fourth.status, 429)
    // everyone else still has their own budget
    assert.equal((await post(bob, { title: 'Bob has his own budget', category: 'ideas' })).status, 200)
    ok('three posts in ten minutes, then "slow down" for that account only')
  }

  console.log('Replies, votes, views')
  {
    const r1 = await call(bob, 'POST', `/api/community/posts/${first}/replies`, { body: 'Same here, on Broadway too.' })
    assert.equal(r1.status, 200)
    assert.equal((await call(null, 'POST', `/api/community/posts/${first}/replies`, { body: 'anon' })).status, 401)
    assert.equal((await call(bob, 'POST', `/api/community/posts/${first}/replies`, { body: 'x' })).json.error, 'body-short')
    assert.equal((await call(bob, 'POST', '/api/community/posts/9999/replies', { body: 'Nobody home' })).status, 404)

    const up = (who: Who, on = true) => call(who, 'POST', `/api/community/posts/${first}/vote`, { up: on })
    assert.equal((await up(bob)).json.votes, 1)
    assert.equal((await up(bob)).json.votes, 1, 'a second vote from the same account counts once')
    assert.equal((await up(carol)).json.votes, 2)
    assert.equal((await up(carol, false)).json.votes, 1, 'taking it back')
    assert.equal((await up(carol, false)).json.votes, 1, 'taking it back twice changes nothing')
    assert.equal((await up(null)).status, 401)
    ok('one upvote per account, undo works, signed-out visitors are asked to sign in')

    const v1 = await call(bob, 'GET', `/api/community/posts/${first}`)
    assert.equal(v1.json.post.voted, true)
    assert.equal(v1.json.post.replies, 1)
    assert.equal(v1.json.replies[0].body, 'Same here, on Broadway too.')
    const views = v1.json.post.views
    assert.equal((await call(bob, 'GET', `/api/community/posts/${first}`)).json.post.views, views, 'reloading is not a new view')
    assert.equal((await call(carol, 'GET', `/api/community/posts/${first}`)).json.post.views, views + 1)
    ok('views count once per visitor a day')
  }

  console.log('Sorting and filtering')
  {
    const top = await call(null, 'GET', '/api/community/posts?sort=top')
    assert.equal(top.json.posts[0].id, first, 'the upvoted post is on top')
    const fresh = await call(null, 'GET', '/api/community/posts?sort=new')
    assert.ok(fresh.json.posts[0].createdAt >= fresh.json.posts.at(-1).createdAt)
    assert.notEqual(fresh.json.posts[0].id, first)
    const bugs = await call(null, 'GET', '/api/community/posts?cat=bugs')
    assert.ok(bugs.json.posts.every((p: { category: string }) => p.category === 'bugs'))
    assert.equal(bugs.json.counts.bugs, 1)
    assert.equal(bugs.json.counts.ideas, 2)
    assert.equal((await call(null, 'GET', '/api/community/posts?cat=memes')).status, 400)
    const mine = await call(bob, 'GET', '/api/community/posts?sort=top')
    assert.equal(mine.json.posts[0].voted, true)
    ok('Top and New sort, the category filter and its counts, and your own votes show')
  }

  console.log('Reports and moderators')
  {
    const target = (await post(carol, { title: 'Totally normal post', category: 'feedback' })).json.id as number
    assert.equal((await call(carol, 'POST', '/api/community/report', { post: target, reason: 'spam' })).status, 400, 'not your own')
    for (const who of [alice, bob]) assert.equal((await call(who, 'POST', '/api/community/report', { post: target, reason: 'spam' })).status, 200)
    assert.equal((await call(alice, 'POST', '/api/community/report', { post: target, reason: 'spam' })).json.duplicate, true)
    assert.equal((await call(null, 'GET', `/api/community/posts/${target}`)).status, 200, 'two reports: still up')
    assert.equal(q.get<{ n: number }>("SELECT COUNT(*) AS n FROM reports WHERE reason LIKE 'community:%'")!.n, 2, 'reports reach Launch HQ')
    await call(player(), 'POST', '/api/community/report', { post: target, reason: 'mean' })
    assert.equal((await call(null, 'GET', `/api/community/posts/${target}`)).status, 404, 'three reports: hidden')
    ok('reports go to the queue; three different people hide a post')

    assert.equal((await call(null, 'POST', '/api/admin/community/hide', { post: target, hidden: false })).status, 401, 'moderators only')
    const login = await app.request('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: adminToken }) })
    assert.equal(login.status, 200)
    const mod = { cookie: (login.headers.get('set-cookie') ?? '').split(';')[0] }
    const hidden = await call(mod, 'GET', '/api/admin/community/hidden')
    assert.equal(hidden.json.posts[0].id, target)
    assert.equal(hidden.json.posts[0].reports, 3)
    assert.equal((await call(mod, 'POST', '/api/admin/community/hide', { post: target, hidden: false })).status, 200)
    assert.equal((await call(null, 'GET', `/api/community/posts/${target}`)).status, 200, 'shown again')

    const reply = (await call(alice, 'POST', `/api/community/posts/${target}/replies`, { body: 'A reply to hide' })).json.id as number
    await call(mod, 'POST', '/api/admin/community/hide', { post: target, reply, hidden: true })
    let view = await call(null, 'GET', `/api/community/posts/${target}`)
    assert.equal(view.json.replies.length, 0)
    assert.equal(view.json.post.replies, 0, 'a hidden reply is not counted')
    await call(mod, 'POST', '/api/admin/community/hide', { post: target, reply, hidden: false })
    view = await call(null, 'GET', `/api/community/posts/${target}`)
    assert.equal(view.json.post.replies, 1)
    await call(mod, 'POST', '/api/admin/community/delete', { post: target, reply })
    view = await call(null, 'GET', `/api/community/posts/${target}`)
    assert.equal(view.json.post.replies, 0)
    assert.equal((await call(mod, 'POST', '/api/admin/community/delete', { post: target })).status, 200)
    assert.equal((await call(null, 'GET', `/api/community/posts/${target}`)).status, 404)
    ok('moderators list, hide, show and delete posts and replies; reply counts stay right')
  }

  console.log('Back to the board after signing in')
  {
    assert.equal(safeNext('/community'), '/community')
    assert.equal(safeNext('/community/post/12'), '/community/post/12')
    assert.equal(safeNext('/community/new'), '/community/new')
    for (const bad of ['//evil.com', 'https://evil.com/community', '/community/../play', '/communityx', '/community?x=1', 42, null]) assert.equal(safeNext(bad), null, String(bad))
    ok('only community addresses are accepted as a return path')
  }
  console.log('\nCommunity board: all good')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
process.exit(0)
