// The Instagram publisher: posts what tools/instagram/schedule.json says is due, to @IG_USERNAME.
//   node tools/instagram/publish.mjs              dry run: checks every post (files, captions, limits, the account) and
//                                                 says what would go out now. Posts nothing.
//   node tools/instagram/publish.mjs --live       posts every APPROVED entry whose time has come and that isn't posted yet
//   ... --only=<key>    just that entry          ... --now     ignore the times (still only approved ones)
//   ... --remote        read the schedule and the record from the bucket (what the Railway cron runs)
// Media: with the bucket set up (SOCIAL_S3_* in .env, filled by tools/instagram/sync.mjs) Instagram fetches every file
// from a temporary bucket link. Without it, reels upload straight from disk (Meta's resumable upload, open to
// Facebook-login apps) and images need a public address, SOCIAL_MEDIA_BASE (<base>/<post>/<nn>.jpg).
// What went out is recorded in published.json (in the bucket with --remote), so nothing posts twice.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
// on Railway the settings are service variables; on a Mac they're in the repo-root .env
if (existsSync(join(ROOT, '.env'))) process.loadEnvFile(join(ROOT, '.env'))
const s3 = await import('./s3.mjs')
const V = 'v23.0'
const GRAPH = `https://graph.facebook.com/${V}`
const { META_PAGE_TOKEN: token, IG_USER_ID: ig, IG_USERNAME: username, SOCIAL_MEDIA_BASE: mediaBase } = process.env
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}`))?.split('=')[1] ?? (process.argv.includes(`--${k}`) ? true : undefined)
const LIVE = !!arg('live')
const NOW = !!arg('now')
const ONLY = arg('only')
const REMOTE = !!arg('remote')
const BUCKET = s3.configured()

const schedule = REMOTE ? JSON.parse((await s3.getText('schedule.json')) ?? 'null') : JSON.parse(readFileSync(join(HERE, 'schedule.json'), 'utf8'))
if (!schedule) throw new Error('no schedule.json in the bucket yet: run node tools/instagram/sync.mjs on the Mac')
const LOG = join(HERE, 'published.json')
const published = REMOTE ? JSON.parse((await s3.getText('published.json')) ?? '{}') : existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) : {}
const saveLog = async () => {
  const text = JSON.stringify(published, null, 1) + '\n'
  if (REMOTE) await s3.put('published.json', text, 'application/json')
  else writeFileSync(LOG, text)
}

// ---------------------------------------------------------------- Graph calls (errors come back readable, never with the token)
async function graph(method, path, params = {}) {
  const url = new URL(GRAPH + path)
  const body = new URLSearchParams()
  for (const [k, v] of Object.entries({ ...params, access_token: token })) (method === 'GET' ? url.searchParams : body).set(k, typeof v === 'string' ? v : JSON.stringify(v))
  const res = await fetch(url, method === 'GET' ? {} : { method, body })
  const json = await res.json()
  if (json.error) throw new Error(`${path}: ${json.error.error_user_msg || json.error.message} (code ${json.error.code}${json.error.error_subcode ? '/' + json.error.error_subcode : ''})`)
  return json
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** wait for Instagram to finish processing a container (Meta: check about once a minute, give up after ~5) */
async function ready(id, label) {
  for (let i = 0; i < 30; i++) {
    const { status_code: s, status } = await graph('GET', `/${id}`, { fields: 'status_code,status' })
    if (s === 'FINISHED') return
    if (s === 'ERROR' || s === 'EXPIRED') throw new Error(`${label}: Instagram could not process it (${status || s})`)
    await sleep(i < 6 ? 5000 : 15000)
  }
  throw new Error(`${label}: still processing after ~6 minutes`)
}

const common = (p) => ({ caption: p.caption, ...(schedule.aiLabel ? { is_ai_generated: 'true' } : {}) })

async function postReel(p) {
  const file = join(ROOT, p.files[0])
  const c = await graph('POST', `/${ig}/media`, {
    media_type: 'REELS', upload_type: 'resumable', share_to_feed: 'true', thumb_offset: '1000', ...common(p),
    ...(p.trial ? { trial_params: { graduation_strategy: 'SS_PERFORMANCE' } } : {}),
  })
  // from the bucket, Meta fetches the file itself (file_url); otherwise we send it from disk
  const up = BUCKET
    ? await fetch(`https://rupload.facebook.com/ig-api-upload/${V}/${c.id}`, { method: 'POST', headers: { Authorization: `OAuth ${token}`, file_url: s3.presign(`media/${p.files[0]}`) } })
    : await (async () => {
        const bytes = readFileSync(file)
        return fetch(`https://rupload.facebook.com/ig-api-upload/${V}/${c.id}`, { method: 'POST', headers: { Authorization: `OAuth ${token}`, offset: '0', file_size: String(bytes.length) }, body: bytes })
      })()
  const upj = await up.json().catch(() => ({}))
  if (!up.ok || upj.success === false) throw new Error(`upload: ${upj.debug_info?.message ?? up.status}`)
  await ready(c.id, 'reel')
  return c.id
}

async function postImages(p) {
  const url = (f) => (BUCKET ? s3.presign(`media/${f}`) : `${mediaBase.replace(/\/$/, '')}/${f.split('/').slice(-2).join('/')}`)
  if (p.kind === 'image') {
    const c = await graph('POST', `/${ig}/media`, { image_url: url(p.files[0]), ...common(p) })
    await ready(c.id, 'image')
    return c.id
  }
  const children = []
  for (const f of p.files) children.push((await graph('POST', `/${ig}/media`, { image_url: url(f), is_carousel_item: 'true' })).id)
  for (const id of children) await ready(id, 'slide')
  const c = await graph('POST', `/${ig}/media`, { media_type: 'CAROUSEL', children: children.join(','), ...common(p) })
  await ready(c.id, 'carousel')
  return c.id
}

// ---------------------------------------------------------------- checks (the dry run runs all of them)
/** the post's time as a real instant: wall-clock time in New York, whatever the machine's zone */
function due(p) {
  const guess = new Date(`${p.date}T${p.time}:00Z`)
  const ny = new Date(guess.toLocaleString('en-US', { timeZone: schedule.timezone }))
  return new Date(guess.getTime() + (guess.getTime() - ny.getTime()))
}
async function problems(p) {
  const out = []
  if (p.manual) return out
  // on Railway the files live only in the bucket: check they're there (the full checks ran on the Mac)
  if (REMOTE) {
    for (const f of p.files) if (!(await s3.head(`media/${f}`))) out.push(`not in the bucket: ${f} (run sync.mjs)`)
    return out
  }
  for (const f of p.files) if (!existsSync(join(ROOT, f))) out.push(`missing file ${f}`)
  if (p.caption.length > 2200) out.push(`caption is ${p.caption.length} characters (max 2,200)`)
  if ((p.caption.match(/#\w+/g) ?? []).length > 30) out.push('more than 30 hashtags')
  if (/—/.test(p.caption)) out.push('caption has an em dash')
  if (p.kind === 'carousel' && (p.files.length < 2 || p.files.length > 20)) out.push(`carousel has ${p.files.length} slides (2 to 20)`)
  if (p.kind !== 'reel' && p.files.some((f) => !/\.jpe?g$/i.test(f))) out.push('images must be JPEG')
  if (p.kind !== 'reel' && !BUCKET && !mediaBase) out.push('needs the bucket (SOCIAL_S3_*) or SOCIAL_MEDIA_BASE: images must be at a public address')
  if (BUCKET) for (const f of p.files) if (!(await s3.head(`media/${f}`))) out.push(`not in the bucket yet: ${f} (run sync.mjs)`)
  if (p.kind === 'reel' && existsSync(join(ROOT, p.files[0]))) {
    const f = join(ROOT, p.files[0])
    const [w, h, dur] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'csv=p=0:s=,', f]).toString().trim().split(/[,\n]/).map(Number)
    if (dur < 3 || dur > 900) out.push(`video is ${dur.toFixed(1)} s (3 s to 15 min)`)
    if (statSync(f).size > 300 * 1024 * 1024) out.push('video is over 300 MB')
    if (w > h) out.push(`landscape video (${w}x${h}): it will show letterboxed`)
  }
  return out
}

// ---------------------------------------------------------------- run
const me = await graph('GET', `/${ig}`, { fields: 'username' })
const quota = (await graph('GET', `/${ig}/content_publishing_limit`, { fields: 'config,quota_usage' })).data?.[0]
console.log(`${LIVE ? 'LIVE' : 'DRY RUN'}${REMOTE ? ' (bucket schedule)' : ''} · media from ${BUCKET ? 'the bucket' : 'this disk'} · @${me.username}${me.username !== username ? ` (.env says @${username}!)` : ''} · posts used in the last 24 h: ${quota?.quota_usage ?? '?'} of ${quota?.config?.quota_total ?? '?'}`)
const now = new Date()
let failed = 0
for (const p of schedule.posts) {
  if (ONLY && p.key !== ONLY) continue
  const when = due(p)
  const tag = `day ${String(p.day).padStart(2)} ${p.date} ${p.time} ${p.format.padEnd(8)} ${p.title}`
  if (published[p.key]) { console.log(`  posted   ${tag} → ${published[p.key].permalink}`); continue }
  if (p.manual) { console.log(`  manual   ${tag} (${p.manual})`); continue }
  const issues = await problems(p)
  const isDue = NOW || when <= now
  const state = issues.length ? 'PROBLEM' : !p.approved ? 'waiting' : !isDue ? 'queued' : LIVE ? 'POSTING' : 'would post'
  console.log(`  ${state.padEnd(8)} ${tag}${issues.length ? ' · ' + issues.join('; ') : !p.approved ? ' (not approved)' : !isDue ? ` (at ${when.toISOString()})` : ''}`)
  if (issues.length) failed++
  if (!LIVE || issues.length || !p.approved || !isDue) continue
  try {
    const container = p.kind === 'reel' ? await postReel(p) : await postImages(p)
    const { id } = await graph('POST', `/${ig}/media_publish`, { creation_id: container })
    const { permalink } = await graph('GET', `/${id}`, { fields: 'permalink' })
    published[p.key] = { id, permalink, at: new Date().toISOString() }
    await saveLog()
    console.log(`           posted → ${permalink}`)
  } catch (e) {
    failed++
    console.log(`           FAILED: ${e.message}`)
  }
}
process.exitCode = failed ? 1 : 0
