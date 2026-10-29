// Sends the schedule and its media to the Railway bucket, where the scheduled publisher reads them. Run it after
// approving posts or re-rendering anything:
//   node tools/instagram/sync.mjs
// Uploads every file the schedule uses that isn't in the bucket yet (or changed), then schedule.json itself, and
// brings back published.json (what the publisher has posted) so this checkout shows it. Posts nothing.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
process.loadEnvFile(join(ROOT, '.env'))
const s3 = await import('./s3.mjs')

const schedule = JSON.parse(readFileSync(join(HERE, 'schedule.json'), 'utf8'))
const used = schedule.posts.filter((p) => !p.manual).flatMap((p) => p.files)
// each reel's poster frame too (video/out/reels/posters/), so Launch HQ shows a picture before you press play
const posters = used.filter((f) => f.startsWith('video/out/reels/')).map((f) => f.replace('/reels/', '/reels/posters/').replace(/\.mp4$/, '.jpg')).filter((f) => existsSync(join(ROOT, f)))
const files = [...new Set([...used, ...posters])]
let sent = 0, same = 0, missing = 0, bytes = 0
for (const f of files) {
  const local = join(ROOT, f)
  if (!existsSync(local)) { console.log('  missing locally:', f); missing++; continue }
  const body = readFileSync(local)
  const md5 = createHash('md5').update(body).digest('hex')
  const there = await s3.head(`media/${f}`)
  if (there && there.etag === md5) { same++; continue }
  await s3.put(`media/${f}`, body, f.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg')
  sent++
  bytes += body.length
  console.log(`  up ${f} (${(body.length / 1048576).toFixed(1)} MB)`)
  await new Promise((done) => setTimeout(done, 250)) // gently: the store rate-limits bursts
}
await s3.put('schedule.json', JSON.stringify(schedule, null, 1), 'application/json')
const log = await s3.getText('published.json')
if (log) writeFileSync(join(HERE, 'published.json'), log)
const approved = schedule.posts.filter((p) => p.approved && !p.manual).length
console.log(`media: ${sent} uploaded (${(bytes / 1048576).toFixed(0)} MB), ${same} already there${missing ? `, ${missing} missing` : ''} · schedule sent (${approved} approved) · ${log ? Object.keys(JSON.parse(log)).length : 0} posted so far`)
