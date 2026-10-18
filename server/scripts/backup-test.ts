/**
 * Self-test for the backups in src/ops.ts. Everything happens in a throwaway folder in the OS temp dir;
 * the real database (data/club-nyc.db) is never opened.
 *   1. AWS Signature V4 against AWS's published test vectors
 *   2. snapshot → rotate → restore on a temporary SQLite database in WAL mode, like the server's
 *   3. the off-site copy against a fake S3 endpoint on 127.0.0.1 (body, hash and signature are checked;
 *      the first upload gets a 503 to exercise the retry, so the test takes ~6 s)
 *   4. healthReport(), and the "database is not on the volume" warning
 *   npx tsx scripts/backup-test.ts        (from server/)
 */
import { strict as assert } from 'node:assert'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { backupFile, healthReport, listBackups, signV4, snapshotNow, startBackups } from '../src/ops.ts'

const sha256 = (b: string | Buffer) => createHash('sha256').update(b).digest('hex')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function waitFor<T>(what: string, ms: number, fn: () => T | undefined | false | null): Promise<T> {
  const until = Date.now() + ms
  for (;;) {
    const v = fn()
    if (v) return v
    if (Date.now() > until) throw new Error(`timed out after ${ms} ms waiting for ${what}`)
    await sleep(50)
  }
}
const ok = (msg: string) => console.log(`  ✓ ${msg}`)

// only this script's settings count
for (const k of Object.keys(process.env)) if (k.startsWith('BACKUP_') || k.startsWith('RAILWAY_')) delete process.env[k]

// ---------- 1. Signature V4 ----------
console.log('Signature V4 (AWS test vectors)')
{
  // AWS SigV4 test suite, as published by AWS in https://github.com/awslabs/aws-c-auth/tree/main/tests/aws-signing-test-suite/v4
  const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  assert.equal(sha256(''), EMPTY)
  const suite = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY', region: 'us-east-1', service: 'service', date: new Date('2015-08-30T12:36:00Z'), host: 'example.amazonaws.com', payloadHash: EMPTY }

  const vanilla = signV4({ ...suite, method: 'GET', path: '/' })
  assert.equal(vanilla.canonicalRequest, ['GET', '/', '', 'host:example.amazonaws.com', 'x-amz-date:20150830T123600Z', '', 'host;x-amz-date', EMPTY].join('\n'))
  assert.equal(vanilla.stringToSign, ['AWS4-HMAC-SHA256', '20150830T123600Z', '20150830/us-east-1/service/aws4_request', 'bb579772317eb040ac9ed261061d46c1f17a8133879d6129b6e1c25292927e63'].join('\n'))
  assert.equal(vanilla.signature, '5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31')
  assert.equal(vanilla.authorization, 'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31')
  ok('get-vanilla: canonical request, string to sign, signature, Authorization header')

  const space = signV4({ ...suite, method: 'GET', path: '/example space/' })
  assert.equal(space.path, '/example%20space/')
  assert.equal(space.stringToSign.split('\n')[3], '63ee75631ed7234ae61b5f736dfc7754cdccfedbff4b5128a915706ee9390d86')
  assert.equal(space.signature, '652487583200325589f1fba4c7e578f72c47cb61beeca81406b39ddec1366741')
  ok('get-space-unnormalized: path encoding as S3 does it (once, no normalisation)')

  const utf8 = signV4({ ...suite, method: 'GET', path: '/ሴ' })
  assert.equal(utf8.path, '/%E1%88%B4')
  assert.equal(utf8.stringToSign.split('\n')[3], '2a0a97d02205e45ce2e994789806b19270cfbbb0921b278ccf58f5249ac42102')
  assert.equal(utf8.signature, '8318018e0b0f223aa2bbf98705b62bb787dc9c0e678f255a891fd03141be5d85')
  ok('get-utf8: UTF-8 path')

  // Amazon S3 API Reference, "Signature Calculations for the Authorization Header: Transferring Payload in a
  // Single Chunk", Example: PUT Object — https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html
  const payloadHash = sha256('Welcome to Amazon S3.')
  assert.equal(payloadHash, '44ce7dd67c959e0d3524ffac1771dfbba87d2b6b4b4e99e42034a8b803f8b072')
  const put = signV4({
    method: 'PUT',
    host: 'examplebucket.s3.amazonaws.com',
    path: '/test$file.text',
    headers: { Date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY', 'x-amz-content-sha256': payloadHash },
    payloadHash,
    region: 'us-east-1',
    service: 's3',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    date: new Date('2013-05-24T00:00:00Z'),
  })
  assert.equal(
    put.canonicalRequest,
    [
      'PUT',
      '/test%24file.text',
      '',
      'date:Fri, 24 May 2013 00:00:00 GMT',
      'host:examplebucket.s3.amazonaws.com',
      `x-amz-content-sha256:${payloadHash}`,
      'x-amz-date:20130524T000000Z',
      'x-amz-storage-class:REDUCED_REDUNDANCY',
      '',
      'date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class',
      payloadHash,
    ].join('\n'),
  )
  assert.equal(put.stringToSign, ['AWS4-HMAC-SHA256', '20130524T000000Z', '20130524/us-east-1/s3/aws4_request', '9e0e90d9c76de8fa5b200d8c849cd5b8dc7a3be3951ddb7f6a76b4158342019d'].join('\n'))
  assert.equal(put.signature, '98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd')
  ok('S3 docs "PUT Object" example: payload hash, $ in the key, signature')
}

const tmp = mkdtempSync(join(tmpdir(), 'club-nyc-backup-test-'))
const s3 = createServer()
try {
  // ---------- 2. snapshot → rotate → restore ----------
  console.log(`Snapshots (in ${tmp})`)
  const dir = join(tmp, 'backups')
  mkdirSync(dir)
  // older history (all more than 6 h old) that rotation should trim, and files it must never touch
  const history = ['club-nyc-2026-01-01T00-00-00Z.db', 'club-nyc-2026-01-02T00-00-00Z.db', 'club-nyc-2026-01-03T06-00-00Z.db', 'club-nyc-2026-01-04T12-00-00Z.db']
  for (const n of history) writeFileSync(join(dir, n), 'an older snapshot')
  const bystanders = ['club-nyc.db', 'notes.txt', 'club-nyc-latest.db']
  for (const n of bystanders) writeFileSync(join(dir, n), 'not a snapshot')
  writeFileSync(join(dir, 'club-nyc-2026-01-05T00-00-00Z.db.tmp'), 'cut off half-way')

  const livePath = join(tmp, 'club-nyc.db')
  const db = new DatabaseSync(livePath)
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;')
  db.exec('CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, coins INTEGER NOT NULL); PRAGMA user_version = 7;')
  db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  db.prepare('INSERT INTO users VALUES (?, ?, ?)').run('u1', 'Ana', 120)
  assert.ok(statSync(`${livePath}-wal`).size > 0, 'the new row should still be in the WAL only')

  // fake S3: records PUTs; the very first request gets a 503 so the retry is exercised
  interface Put {
    method: string
    path: string
    headers: IncomingHttpHeaders
    body: Buffer
  }
  const puts: Put[] = []
  let failFirst = true
  s3.on('request', (req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => {
      if (failFirst) {
        failFirst = false
        res.writeHead(503, { 'content-type': 'application/xml' }).end('<Error><Code>SlowDown</Code></Error>')
        return
      }
      puts.push({ method: req.method ?? '', path: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks) })
      res.writeHead(200, { etag: '"ok"' }).end()
    })
  })
  await new Promise<void>((r) => s3.listen(0, '127.0.0.1', () => r()))
  process.env.BACKUP_S3_ENDPOINT = `http://127.0.0.1:${(s3.address() as AddressInfo).port}`
  process.env.BACKUP_S3_BUCKET = 'city-backups'
  process.env.BACKUP_S3_ACCESS_KEY_ID = 'AKIDTEST'
  process.env.BACKUP_S3_SECRET_ACCESS_KEY = 'test-secret'
  process.env.BACKUP_S3_PREFIX = 'prod'

  const handle = startBackups(db, { dir, keep: 3, everyHours: 6, firstDelayMs: 100 })
  assert.ok(!existsSync(join(dir, 'club-nyc-2026-01-05T00-00-00Z.db.tmp')), 'a stale .tmp from a cut-off snapshot is cleaned up')
  // the newest snapshot is from January, so one is due right after the short start-up delay
  const scheduled = await waitFor('the start-up snapshot', 5000, () => listBackups().find((b) => b.at > Date.now() - 60_000))
  ok(`start-up snapshot taken by the schedule: ${scheduled.name}`)

  await sleep(1100) // snapshot names have 1-second resolution
  db.prepare('INSERT INTO users VALUES (?, ?, ?)').run('u2', 'Ben', 75)
  db.prepare('UPDATE users SET coins = coins + 1 WHERE id = ?').run('u1')
  const manual = snapshotNow()
  assert.ok(manual.startsWith(dir) && existsSync(manual))
  ok(`snapshotNow() → ${basename(manual)}`)

  const kept = listBackups()
  assert.deepEqual(
    kept.map((b) => b.name),
    [basename(manual), scheduled.name, 'club-nyc-2026-01-04T12-00-00Z.db'],
  )
  for (const n of history.slice(0, 3)) assert.ok(!existsSync(join(dir, n)), `${n} should have been rotated away`)
  for (const n of bystanders) assert.ok(existsSync(join(dir, n)), `${n} must never be touched`)
  assert.ok(kept[0].bytes > 0 && kept[0].bytes === statSync(manual).size)
  assert.equal(kept[2].at, Date.parse('2026-01-04T12:00:00Z'))
  ok('rotation keeps the newest 3, newest first, and leaves other files alone')

  assert.equal(backupFile(basename(manual)), manual)
  for (const bad of [
    '../club-nyc.db',
    'club-nyc.db',
    '..',
    '/etc/passwd',
    `${scheduled.name}/../../club-nyc.db`,
    '..%2Fclub-nyc.db',
    'club-nyc-2026-13-01T00-00-00Z.db',
    'club-nyc-2026-01-01T00-00-00Z.db', // rotated away
    'CLUB-NYC-2026-01-04T12-00-00Z.DB',
    `${scheduled.name}\u0000`,
    '',
  ]) {
    assert.equal(backupFile(bad), null, `backupFile(${JSON.stringify(bad)}) must be null`)
  }
  ok('backupFile() returns real snapshots only (no traversal, no other files)')

  // restore: a snapshot is a complete database; copy it out and open it the way the server does
  const restoredPath = join(tmp, 'club-nyc-restored.db')
  copyFileSync(manual, restoredPath)
  const restored = new DatabaseSync(restoredPath)
  restored.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
  assert.equal((restored.prepare('PRAGMA integrity_check').get() as { integrity_check: string }).integrity_check, 'ok')
  assert.equal((restored.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 7)
  const rows = (restored.prepare('SELECT name, coins FROM users ORDER BY name').all() as { name: string; coins: number }[]).map((r) => ({ name: r.name, coins: r.coins }))
  assert.deepEqual(rows, [
    { name: 'Ana', coins: 121 },
    { name: 'Ben', coins: 75 },
  ])
  restored.prepare('INSERT INTO users VALUES (?, ?, ?)').run('u3', 'Cleo', 5) // and it's writable
  restored.close()
  const earlier = new DatabaseSync(join(dir, scheduled.name), { readOnly: true })
  const earlyRows = (earlier.prepare('SELECT name, coins FROM users').all() as { name: string; coins: number }[]).map((r) => ({ name: r.name, coins: r.coins }))
  assert.deepEqual(earlyRows, [{ name: 'Ana', coins: 120 }])
  earlier.close()
  ok('restore: integrity ok, user_version kept, rows (incl. ones only in the WAL) present; the earlier snapshot is the earlier state')

  // ---------- 3. off-site copies ----------
  console.log('Off-site copies (fake S3)')
  await waitFor('two uploads (one after a retry)', 15_000, () => puts.length >= 2)
  assert.equal(failFirst, false)
  assert.deepEqual(puts.map((p) => basename(p.path)).sort(), [scheduled.name, basename(manual)].sort())
  for (const p of puts) {
    const name = basename(p.path)
    assert.equal(p.method, 'PUT')
    assert.equal(p.path, `/city-backups/prod/${name}`)
    const file = backupFile(name)
    assert.ok(file)
    assert.ok(p.body.equals(readFileSync(file)), 'uploaded bytes = snapshot bytes')
    assert.equal(p.headers['x-amz-content-sha256'], sha256(p.body))
    assert.equal(Number(p.headers['content-length']), p.body.length)
    assert.equal(p.headers['content-type'], 'application/vnd.sqlite3')
    // re-sign exactly what arrived: proves the client signed the host, path and headers it actually sent
    const m = /^AWS4-HMAC-SHA256 Credential=AKIDTEST\/(\d{8})\/auto\/s3\/aws4_request, SignedHeaders=([a-z0-9;-]+), Signature=([0-9a-f]{64})$/.exec(String(p.headers.authorization))
    assert.ok(m, `unexpected Authorization header: ${p.headers.authorization}`)
    const amz = String(p.headers['x-amz-date'])
    const date = new Date(`${amz.slice(0, 4)}-${amz.slice(4, 6)}-${amz.slice(6, 8)}T${amz.slice(9, 11)}:${amz.slice(11, 13)}:${amz.slice(13, 15)}Z`)
    const signedNames = m[2].split(';')
    assert.deepEqual(signedNames, ['content-type', 'host', 'x-amz-content-sha256', 'x-amz-date'])
    const again = signV4({
      method: p.method,
      host: String(p.headers.host),
      path: decodeURIComponent(p.path),
      headers: { 'content-type': String(p.headers['content-type']), 'x-amz-content-sha256': String(p.headers['x-amz-content-sha256']) },
      payloadHash: sha256(p.body),
      region: 'auto',
      service: 's3',
      accessKeyId: 'AKIDTEST',
      secretAccessKey: 'test-secret',
      date,
    })
    assert.equal(again.path, p.path)
    assert.equal(again.signature, m[3])
  }
  ok('both snapshots uploaded to /<bucket>/<prefix>/<name>; bytes, SHA-256, length and signature match; a 503 was retried')

  // ---------- 4. health ----------
  console.log('Health')
  const h = healthReport(db)
  assert.equal(h.ok, true)
  assert.equal(h.db, true)
  assert.equal(h.node, process.version)
  assert.ok(h.version.length > 0 && Number.isInteger(h.uptimeSec))
  ok(`healthReport → ${JSON.stringify(h)}`)

  handle.stop()
  assert.throws(() => snapshotNow(), /startBackups/)
  assert.deepEqual(listBackups(), [])
  ok('after stop(): snapshotNow() refuses, listBackups() is empty')

  // the Railway guard: a database outside the volume is shouted about at start-up
  const errors: string[] = []
  const realError = console.error
  console.error = (...a: unknown[]) => void errors.push(a.map(String).join(' '))
  try {
    process.env.RAILWAY_ENVIRONMENT_ID = 'test'
    process.env.RAILWAY_VOLUME_MOUNT_PATH = join(tmp, 'volume')
    startBackups(db, { dir: join(tmp, 'volume', 'backups'), everyHours: 0 }).stop()
    assert.ok(errors.some((e) => e.includes('WIPED')), 'expected the not-on-a-volume warning')
    errors.length = 0
    mkdirSync(join(tmp, 'volume'), { recursive: true })
    const onVolume = new DatabaseSync(join(tmp, 'volume', 'club-nyc.db'))
    startBackups(onVolume, { everyHours: 0 }).stop()
    onVolume.close()
    assert.deepEqual(errors, [])
  } finally {
    console.error = realError
    delete process.env.RAILWAY_ENVIRONMENT_ID
    delete process.env.RAILWAY_VOLUME_MOUNT_PATH
  }
  ok('warns when the database is not on the Railway volume, quiet when it is')

  db.close()
  const down = healthReport(db)
  assert.equal(down.ok, false)
  assert.equal(down.db, false)
  ok('healthReport after the database is closed → ok: false, db: false')

  console.log('\nall backup tests passed')
} finally {
  s3.close()
  rmSync(tmp, { recursive: true, force: true })
}
