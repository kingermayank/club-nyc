/**
 * Self-test for friends of friends (src/api.ts) on a throwaway database in the OS temp dir: who sees someone's friend
 * list (them and their friends), what everyone else sees (the count and the friends you share), where you stand with
 * each person on it, People You May Know, declining and cancelling requests, and blocks hiding people both ways.
 *   npx tsx scripts/friends-test.ts        (from server/)
 */
import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'club-nyc-friends-'))
process.env.DB_PATH = join(dir, 'friends.db')
const { Hono } = await import('hono')
const { q } = await import('../src/db.ts')
const { api } = await import('../src/api.ts')
const app = new Hono()
app.route('/api', api)

let n = 0
function player() {
  const id = `fr-${++n}`
  q.run('INSERT INTO users (id, name, created_at, is_guest, profile_done, look) VALUES (?, ?, ?, 0, 1, ?)', id, `Friendly${n}`, Date.now(), JSON.stringify({ skin: 1 }))
  const token = `token-${id}-${'x'.repeat(20)}`
  q.run('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', createHash('sha256').update(token).digest('hex'), id, Date.now(), Date.now() + 86400_000)
  return { id, cookie: `club_sid=${token}` }
}
type P = ReturnType<typeof player>
async function call(who: P | null, method: string, path: string) {
  const res = await app.request('/api' + path, { method, headers: who ? { cookie: who.cookie, 'content-type': 'application/json' } : {}, body: method === 'POST' ? '{}' : undefined })
  return { status: res.status, json: (await res.json()) as Record<string, any> }
}
const ok = (msg: string) => console.log(`  ✓ ${msg}`)
const befriend = async (x: P, y: P) => {
  await call(x, 'POST', `/friends/${y.id}`)
  assert.equal((await call(y, 'POST', `/friends/${x.id}/accept`)).status, 200)
}

try {
  const [a, b, c, d, e] = [player(), player(), player(), player(), player()]
  await befriend(a, b)
  await befriend(b, c)
  await befriend(b, d)

  console.log('Who sees a friend list')
  {
    let r = (await call(a, 'GET', `/users/${b.id}/friends`)).json
    assert.ok(r.visible)
    assert.equal(r.count, 3)
    assert.equal(r.friends[0].rel, 'me')
    assert.equal(r.friends.filter((f: any) => f.rel === 'none').length, 2)
    assert.ok(r.friends.every((f: any) => f.rel === 'friends' || f.room === null))
    ok('a friend sees the whole list, themselves first, strangers’ rooms private')
    r = (await call(c, 'GET', `/users/${a.id}/friends`)).json
    assert.equal(r.visible, false)
    assert.equal(r.friends.length, 0)
    assert.equal(r.count, 1)
    assert.equal(r.mutualCount, 1)
    assert.equal(r.mutual[0].id, b.id)
    ok('not friends: the count and the friends you share, no list')
    r = (await call(e, 'GET', `/users/${b.id}/friends`)).json
    assert.equal(r.visible, false)
    assert.equal(r.mutualCount, 0)
    assert.equal((await call(b, 'GET', `/users/${b.id}/friends`)).json.count, 3)
    assert.equal((await call(null, 'GET', `/users/${b.id}/friends`)).status, 401)
    assert.equal((await call(a, 'GET', '/users/nope/friends')).status, 404)
    ok('a stranger, yourself, signed out, someone who isn’t there')
  }

  console.log('People You May Know')
  {
    const r = (await call(a, 'GET', '/friends/suggested')).json
    assert.deepEqual(r.people.map((p: any) => p.id).sort(), [c.id, d.id].sort())
    assert.ok(r.people.every((p: any) => p.mutualCount === 1))
    ok('friends of your friends, with how many you share')
  }

  console.log('Requests: decline and cancel')
  {
    await call(a, 'POST', `/friends/${c.id}`)
    assert.ok((await call(c, 'GET', '/friends')).json.incoming.some((p: any) => p.id === a.id))
    assert.equal((await call(a, 'GET', `/users/${b.id}/friends`)).json.friends.find((f: any) => f.id === c.id).rel, 'requested')
    assert.ok(!(await call(a, 'GET', '/friends/suggested')).json.people.some((p: any) => p.id === c.id))
    await call(c, 'DELETE', `/friends/${a.id}`)
    assert.ok(!(await call(a, 'GET', '/friends')).json.outgoing.some((p: any) => p.id === c.id))
    ok('a declined request goes away for both')
    await call(a, 'POST', `/friends/${d.id}`)
    await call(a, 'DELETE', `/friends/${d.id}`)
    assert.ok(!(await call(d, 'GET', '/friends')).json.incoming.some((p: any) => p.id === a.id))
    ok('a cancelled request goes away for both')
  }

  console.log('Blocks')
  {
    await call(d, 'POST', `/blocks/${a.id}`)
    const r = (await call(a, 'GET', `/users/${b.id}/friends`)).json
    assert.equal(r.count, 2)
    assert.ok(!r.friends.some((f: any) => f.id === d.id))
    assert.equal((await call(a, 'GET', `/users/${d.id}/friends`)).status, 404)
    assert.ok(!(await call(a, 'GET', '/friends/suggested')).json.people.some((p: any) => p.id === d.id))
    assert.equal((await call(b, 'GET', `/users/${b.id}/friends`)).json.count, 3)
    ok('blocked people are left out of lists and suggestions, both ways')
  }
  console.log('friends: all good')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
process.exit(0)
