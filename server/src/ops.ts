import { createHash, createHmac } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, unlinkSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { request as httpRequest, type Server } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { DatabaseSync, StatementSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

/**
 * Running the city in production: graceful shutdown, database snapshots (with an optional off-site copy)
 * and the health report. Node built-ins only. How it is deployed: docs/deploy-railway.md; what to do when
 * something breaks: docs/runbook.md.
 */

const here = dirname(fileURLToPath(import.meta.url))
const serverDir = resolve(here, '..')
const env = process.env

/** set once SIGTERM/SIGINT arrives: health turns red and no new snapshots start */
let shuttingDown = false

const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms).unref())
const size = (bytes: number) => (bytes < 1048576 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`)
const num = (v: string | undefined, fallback: number) => (v != null && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback)

// ---------- health ----------
const VERSION = env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) || packageVersion()
function packageVersion(): string {
  try {
    return (JSON.parse(readFileSync(join(serverDir, 'package.json'), 'utf8')) as { version?: string }).version ?? 'dev'
  } catch {
    return 'dev'
  }
}

const pings = new WeakMap<DatabaseSync, StatementSync>()
/** For GET /api/health. `ok` is false while shutting down, so a draining server never looks ready. */
export function healthReport(db: DatabaseSync): { ok: boolean; uptimeSec: number; db: boolean; version: string; node: string } {
  let dbOk = false
  try {
    let st = pings.get(db)
    if (!st) pings.set(db, (st = db.prepare('SELECT 1 AS one')))
    dbOk = (st.get() as { one?: number } | undefined)?.one === 1
  } catch {
    dbOk = false
  }
  return { ok: dbOk && !shuttingDown, uptimeSec: Math.floor(process.uptime()), db: dbOk, version: VERSION, node: process.version }
}

// ---------- graceful shutdown ----------
let installed = false
const TIMED_OUT = Symbol('timed-out')

/**
 * SIGTERM (Railway stopping this deployment) or SIGINT (Ctrl-C):
 *   1. onShutdown()  — tell players the city is restarting and close their sockets
 *   2. stop accepting connections; give in-flight requests a moment to finish
 *   3. PRAGMA wal_checkpoint(TRUNCATE), close the database, exit 0
 * Anything still running after `timeoutMs` (default 8 s) is cut off with exit 1. Railway waits
 * RAILWAY_DEPLOYMENT_DRAINING_SECONDS (default 0!) between SIGTERM and SIGKILL, so set that to 10.
 * Also: unhandled promise rejections are logged; an uncaught exception is logged and exits 1, so the
 * restart policy brings up a fresh process instead of leaving a half-broken one running.
 */
export function installGracefulShutdown(opts: { server: Server; db: DatabaseSync; onShutdown: () => Promise<void> | void; timeoutMs?: number }): void {
  if (installed) {
    console.warn('[ops] installGracefulShutdown() was called twice; keeping the first one')
    return
  }
  installed = true
  const timeoutMs = opts.timeoutMs ?? 8000

  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      if (signal === 'SIGINT') {
        console.error('[ops] second Ctrl-C: exiting now')
        process.exit(1)
      }
      return
    }
    shuttingDown = true
    const t0 = Date.now()
    const left = () => timeoutMs - (Date.now() - t0)
    console.log(`[ops] ${signal}: shutting down (cut-off ${timeoutMs} ms)`)
    // deliberately not unref'd: if something below hangs, this is what ends the process
    setTimeout(() => {
      console.error(`[ops] shutdown still running after ${timeoutMs} ms: forcing exit`)
      process.exit(1)
    }, timeoutMs)

    try {
      const r = await Promise.race([Promise.resolve().then(() => opts.onShutdown()), sleep(Math.max(0, left() - 2500)).then(() => TIMED_OUT)])
      if (r === TIMED_OUT) console.warn('[ops] onShutdown() is taking too long; closing the database anyway')
    } catch (e) {
      console.error('[ops] onShutdown() failed:', e)
    }

    // no new connections; let goodbye frames and in-flight requests drain briefly, then cut the rest
    const closed = new Promise<void>((done) => opts.server.close(() => done()))
    const reap = setInterval(() => opts.server.closeIdleConnections(), 50) // keep-alive sockets go as soon as their request is done
    await Promise.race([closed, sleep(Math.min(1500, Math.max(0, left() - 1000)))])
    clearInterval(reap)
    opts.server.closeAllConnections()

    try {
      opts.db.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } catch (e) {
      console.error('[ops] WAL checkpoint failed:', e)
    }
    try {
      opts.db.close()
    } catch (e) {
      console.error('[ops] closing the database failed:', e)
    }
    console.log(`[ops] shutdown complete in ${Date.now() - t0} ms`)
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('unhandledRejection', (reason) => console.error('[ops] unhandled promise rejection:', reason))
  process.on('uncaughtException', (err, origin) => {
    console.error(`[ops] fatal ${origin}, exiting so Railway restarts the server:`, err)
    process.exit(1)
  })
}

// ---------- backups ----------
/**
 * Snapshots are made with `VACUUM INTO`: a consistent, compacted copy of the live database that is safe
 * to take while the game keeps writing (WAL mode). It is synchronous, so the event loop pauses while it
 * runs. Measured on a laptop SSD (Node 24): about 1 ms per MB, e.g. 2.5 MB in 3 ms, 100 MB in ~0.1 s,
 * 400 MB in ~0.4 s. Expect a few times slower on a cloud volume. Today's database is a few MB, so a
 * snapshot is a pause of milliseconds every 6 hours. If it ever reaches hundreds of MB, move the
 * scheduled snapshot onto a worker_threads connection of its own; WAL lets it read while the game writes.
 * Everything else here (rotation, hashing, the upload) is cheap or async.
 */
export interface BackupInfo {
  name: string
  bytes: number
  /** when the snapshot was taken (ms since epoch, from the file name) */
  at: number
}

/** `club-nyc-2026-10-16T12-00-00Z.db`. Only names like this are listed, served or rotated away. */
const NAME = /^club-nyc-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.db$/
const STALE_TMP = /^club-nyc-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.db\.tmp$/
const nameFor = (d: Date) => `club-nyc-${d.toISOString().slice(0, 19).replace(/:/g, '-')}Z.db`
function atOf(name: string): number {
  const m = NAME.exec(name)
  return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}Z`) : NaN
}

interface S3Target {
  endpoint: URL
  /** path in front of /<bucket>/<key>, normally empty */
  basePath: string
  bucket: string
  region: string
  prefix: string
  accessKeyId: string
  secretAccessKey: string
}

interface Backups {
  db: DatabaseSync
  dir: string
  keep: number
  s3: S3Target | null
  timer: NodeJS.Timeout | null
}
let backups: Backups | null = null

function listIn(dir: string): BackupInfo[] {
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const out: BackupInfo[] = []
  for (const name of names) {
    const at = atOf(name)
    if (Number.isNaN(at)) continue
    try {
      const st = statSync(join(dir, name))
      if (st.isFile()) out.push({ name, bytes: st.size, at })
    } catch {
      // deleted while we looked
    }
  }
  return out.sort((a, b) => b.at - a.at || (a.name < b.name ? 1 : -1))
}

function rotate(b: Backups) {
  for (const old of listIn(b.dir).slice(b.keep)) {
    try {
      unlinkSync(join(b.dir, old.name))
      console.log(`[ops] removed old backup ${old.name}`)
    } catch (e) {
      console.error(`[ops] could not remove old backup ${old.name}:`, e)
    }
  }
}

const mainFileOf = (db: DatabaseSync) => (db.prepare('PRAGMA database_list').all() as { name: string; file: string }[]).find((r) => r.name === 'main')?.file ?? ''
const real = (p: string) => {
  try {
    return realpathSync(p)
  } catch {
    return resolve(p)
  }
}
/** is `p` at or under `dir` (symlinks resolved; SQLite reports real paths) */
const inside = (dir: string, p: string) => {
  const r = relative(real(dir), real(p))
  return r === '' || (!r.startsWith('..') && !isAbsolute(r))
}

/**
 * Snapshot the database every BACKUP_EVERY_HOURS (default 6; 0 turns the schedule off) into BACKUP_DIR
 * (default: a backups/ folder next to the database file), keeping the newest BACKUP_KEEP (default 28,
 * about 7 days at 6 h). Options override the variables. At startup a snapshot is taken after a short
 * delay if the newest one is older than the interval, otherwise the existing cadence just continues, so
 * a crash loop or ten deploys in a day can't rotate a week of history away.
 * With BACKUP_S3_* set, every snapshot is also uploaded off-site (see offsite()).
 */
export function startBackups(db: DatabaseSync, opts: { dir?: string; everyHours?: number; keep?: number; firstDelayMs?: number } = {}): { stop: () => void } {
  if (backups?.timer) clearTimeout(backups.timer)
  backups = null
  const dbFile = mainFileOf(db)
  const dirOpt = opts.dir ?? env.BACKUP_DIR
  if (!dirOpt && !dbFile) {
    console.error('[ops] backups are OFF: in-memory database and no BACKUP_DIR')
    return { stop: () => {} }
  }
  const dir = resolve(serverDir, dirOpt || join(dirname(dbFile), 'backups'))
  const everyHours = opts.everyHours ?? num(env.BACKUP_EVERY_HOURS, 6)
  const keep = Math.max(1, Math.floor(opts.keep ?? num(env.BACKUP_KEEP, 28)))
  try {
    mkdirSync(dir, { recursive: true })
    for (const f of readdirSync(dir)) if (STALE_TMP.test(f)) rmSync(join(dir, f), { force: true }) // from a snapshot cut off mid-way
  } catch (e) {
    console.error(`[ops] backups are OFF: cannot use ${dir}:`, e)
    return { stop: () => {} }
  }

  // On Railway the container's own disk is wiped on every deploy; only the volume survives.
  if (env.RAILWAY_ENVIRONMENT_ID) {
    const vol = env.RAILWAY_VOLUME_MOUNT_PATH
    if (!vol || !inside(vol, dbFile)) {
      console.error(`[ops] WARNING: the database ${dbFile} is not on a Railway volume and will be WIPED on the next deploy. Attach a volume at /data and set DB_PATH=/data/club-nyc.db (docs/deploy-railway.md).`)
    } else if (!inside(vol, dir)) {
      console.error(`[ops] WARNING: backups in ${dir} are not on the volume (${vol}) and will not survive a deploy. Set BACKUP_DIR=/data/backups.`)
    }
  }

  const b: Backups = { db, dir, keep, s3: s3FromEnv(), timer: null }
  backups = b
  const where = b.s3 ? ` · off-site copy to ${b.s3.endpoint.host}/${b.s3.bucket}/${b.s3.prefix}` : ''
  if (everyHours > 0) {
    const interval = everyHours * 3600_000
    const newest = listIn(dir)[0]?.at ?? 0
    const first = Math.min(interval, Math.max(opts.firstDelayMs ?? 60_000, newest + interval - Date.now()))
    const tick = () => {
      if (shuttingDown || backups !== b) return
      try {
        snapshotNow()
      } catch (e) {
        console.error('[ops] scheduled backup failed:', e)
      }
      b.timer = setTimeout(tick, Math.min(interval, 2 ** 31 - 1)).unref()
    }
    b.timer = setTimeout(tick, Math.min(first, 2 ** 31 - 1)).unref()
    const next = first < 2 * 3600_000 ? `${Math.round(first / 60_000)} min` : `${(first / 3600_000).toFixed(1)} h`
    console.log(`[ops] backups every ${everyHours} h into ${dir}, keeping ${keep}; next in ${next}${where}`)
  } else {
    console.log(`[ops] scheduled backups are off (BACKUP_EVERY_HOURS=0); snapshotNow() still works, into ${dir}${where}`)
  }
  return {
    stop: () => {
      if (b.timer) clearTimeout(b.timer)
      b.timer = null
      if (backups === b) backups = null
    },
  }
}

/** Take a snapshot right now (also used by the schedule). Rotates old ones, starts the off-site copy, returns the file path. */
export function snapshotNow(): string {
  const b = backups
  if (!b) throw new Error('[ops] snapshotNow(): backups are not running (call startBackups(db) first)')
  if (shuttingDown) throw new Error('[ops] snapshotNow(): the server is shutting down')
  const file = join(b.dir, nameFor(new Date()))
  if (existsSync(file)) return file // two requests in the same second share one snapshot
  const tmp = `${file}.tmp`
  rmSync(tmp, { force: true })
  const t0 = performance.now()
  try {
    // bound as a parameter, so no quoting issues; written under .tmp and renamed, so a cut-off snapshot is never listed
    b.db.prepare('VACUUM INTO ?').run(tmp)
    renameSync(tmp, file)
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
  console.log(`[ops] backup ${basename(file)} (${size(statSync(file).size)}) in ${Math.round(performance.now() - t0)} ms`)
  rotate(b)
  if (b.s3) void offsite(b.s3, file)
  return file
}

/** Newest first. Empty if backups aren't running. */
export function listBackups(): BackupInfo[] {
  return backups ? listIn(backups.dir) : []
}

/** Absolute path of a snapshot to send to an admin, or null. Only exact snapshot names are accepted (no paths, no `..`). */
export function backupFile(name: string): string | null {
  const b = backups
  if (!b || typeof name !== 'string' || !NAME.test(name) || Number.isNaN(atOf(name))) return null
  const file = join(b.dir, name)
  if (dirname(file) !== b.dir) return null
  try {
    return statSync(file).isFile() ? file : null
  } catch {
    return null
  }
}

// ---------- off-site copies (S3 API: Cloudflare R2, AWS S3, Backblaze B2, MinIO…) ----------
function s3FromEnv(): S3Target | null {
  const ep = env.BACKUP_S3_ENDPOINT?.trim() ?? ''
  const bucket = env.BACKUP_S3_BUCKET?.trim() ?? ''
  const accessKeyId = env.BACKUP_S3_ACCESS_KEY_ID?.trim() ?? ''
  const secretAccessKey = env.BACKUP_S3_SECRET_ACCESS_KEY?.trim() ?? ''
  const given = [ep, bucket, accessKeyId, secretAccessKey].filter(Boolean).length
  if (given === 0) return null
  if (given < 4) {
    console.error('[ops] off-site backups are OFF: set all four of BACKUP_S3_ENDPOINT, BACKUP_S3_BUCKET, BACKUP_S3_ACCESS_KEY_ID, BACKUP_S3_SECRET_ACCESS_KEY')
    return null
  }
  let endpoint: URL
  try {
    endpoint = new URL(/^https?:\/\//i.test(ep) ? ep : `https://${ep}`)
  } catch {
    console.error(`[ops] off-site backups are OFF: BACKUP_S3_ENDPOINT is not a URL`)
    return null
  }
  // Cloudflare shows the "S3 API" URL with the bucket on the end; requests here add the bucket themselves
  let basePath = endpoint.pathname.replace(/\/+$/, '')
  if (basePath === `/${bucket}` || basePath.endsWith(`/${bucket}`)) basePath = basePath.slice(0, -(bucket.length + 1))
  const rawPrefix = (env.BACKUP_S3_PREFIX ?? '').trim().replace(/^\/+/, '')
  return {
    endpoint,
    basePath,
    bucket,
    region: env.BACKUP_S3_REGION?.trim() || regionOf(endpoint.hostname),
    prefix: rawPrefix && !rawPrefix.endsWith('/') ? `${rawPrefix}/` : rawPrefix,
    accessKeyId,
    secretAccessKey,
  }
}

/** s3.<region>.amazonaws.com and s3.<region>.backblazeb2.com name their region; R2 (and most others) take "auto". */
function regionOf(host: string): string {
  const m = /^s3[.-](?:dualstack\.)?([a-z]{2}(?:-gov)?-[a-z]+-\d+)\.(?:amazonaws\.com|backblazeb2\.com)$/.exec(host)
  if (m) return m[1]
  return host === 's3.amazonaws.com' ? 'us-east-1' : 'auto'
}

/** Never rejects: tries three times (now, +5 s, +30 s) and logs the outcome. */
async function offsite(s3: S3Target, file: string): Promise<void> {
  const key = s3.prefix + basename(file)
  for (let attempt = 1; ; attempt++) {
    try {
      await putObject(s3, key, file)
      console.log(`[ops] off-site copy ${key} uploaded to ${s3.endpoint.host}/${s3.bucket}`)
      return
    } catch (e) {
      if (attempt >= 3 || shuttingDown) {
        console.error(`[ops] off-site copy of ${basename(file)} FAILED after ${attempt} attempt(s): ${(e as Error).message}`)
        return
      }
      await sleep(attempt === 1 ? 5_000 : 30_000)
    }
  }
}

async function sha256File(file: string): Promise<string> {
  const h = createHash('sha256')
  for await (const chunk of createReadStream(file)) h.update(chunk as Buffer) // 64 KB at a time, so the loop stays responsive
  return h.digest('hex')
}

/** PUT one object, path-style (https://endpoint/bucket/key), streamed from disk with its SHA-256 in the signature. */
async function putObject(s3: S3Target, key: string, file: string): Promise<void> {
  const { size: bytes } = await stat(file)
  const payloadHash = await sha256File(file)
  const signed = signV4({
    method: 'PUT',
    host: s3.endpoint.host,
    path: `${s3.basePath}/${s3.bucket}/${key}`,
    headers: { 'content-type': 'application/vnd.sqlite3', 'x-amz-content-sha256': payloadHash },
    payloadHash,
    region: s3.region,
    service: 's3',
    accessKeyId: s3.accessKeyId,
    secretAccessKey: s3.secretAccessKey,
    date: new Date(),
  })
  const send = s3.endpoint.protocol === 'http:' ? httpRequest : httpsRequest
  await new Promise<void>((done, fail) => {
    const req = send(
      {
        protocol: s3.endpoint.protocol,
        hostname: s3.endpoint.hostname,
        port: s3.endpoint.port || undefined,
        method: 'PUT',
        path: signed.path,
        headers: { ...signed.headers, authorization: signed.authorization, 'content-length': String(bytes) },
      },
      (res) => {
        let reply = ''
        res.setEncoding('utf8')
        res.on('data', (c: string) => {
          if (reply.length < 4000) reply += c
        })
        res.on('end', () => {
          const code = res.statusCode ?? 0
          if (code >= 200 && code < 300) done()
          else fail(new Error(`HTTP ${code} ${reply.replace(/\s+/g, ' ').trim().slice(0, 300)}`))
        })
        res.on('error', fail)
      },
    )
    req.setTimeout(5 * 60_000, () => req.destroy(new Error('upload timed out')))
    req.on('error', fail)
    const upload = createReadStream(file)
    upload.on('error', (e) => req.destroy(e))
    upload.pipe(req)
  })
}

const sha256hex = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data, 'utf8').digest()
/** RFC 3986 per path segment, once (S3 style); `/` is kept. */
const encodePath = (p: string) => p.split('/').map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)).join('/')

/**
 * AWS Signature Version 4 for a request without a query string (header auth, single-chunk payload).
 * `path` is the raw, unencoded path (/bucket/key); send the request to the returned `path` with the
 * returned `headers` plus `authorization`. Exported for scripts/backup-test.ts, which checks it against
 * AWS's published test vectors.
 */
export function signV4(r: {
  method: string
  host: string
  path: string
  headers?: Record<string, string>
  payloadHash: string
  region: string
  service: string
  accessKeyId: string
  secretAccessKey: string
  date: Date
}): { path: string; headers: Record<string, string>; canonicalRequest: string; stringToSign: string; signature: string; authorization: string } {
  const amzDate = r.date.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '') // 20150830T123600Z
  const day = amzDate.slice(0, 8)
  const headers: Record<string, string> = {}
  for (const [k, v] of Object.entries(r.headers ?? {})) headers[k.toLowerCase()] = v
  headers.host = r.host
  headers['x-amz-date'] = amzDate
  const names = Object.keys(headers).sort()
  const signedHeaders = names.join(';')
  const path = encodePath(r.path)
  const canonicalRequest = [r.method, path, '', ...names.map((n) => `${n}:${headers[n].trim().replace(/\s+/g, ' ')}`), '', signedHeaders, r.payloadHash].join('\n')
  const scope = `${day}/${r.region}/${r.service}/aws4_request`
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonicalRequest)].join('\n')
  let key = hmac(`AWS4${r.secretAccessKey}`, day)
  for (const part of [r.region, r.service, 'aws4_request']) key = hmac(key, part)
  const signature = createHmac('sha256', key).update(stringToSign, 'utf8').digest('hex')
  return {
    path,
    headers,
    canonicalRequest,
    stringToSign,
    signature,
    authorization: `AWS4-HMAC-SHA256 Credential=${r.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }
}
