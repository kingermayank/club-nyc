// Sends the schedule and every rendered post to the Railway bucket, where the scheduled publisher and Launch HQ
// (Content) read them. Run it after approving posts or rendering anything:
//   node tools/instagram/sync.mjs
// Uploads every reel, poster and post image in video/out that isn't in the bucket yet (or changed), drafts that
// aren't on the calendar too, then media/library.json (the list Launch HQ's Library shows) and schedule.json, and
// brings back published.json (what the publisher has posted) so this checkout shows it. Posts nothing.
// Approvals made in Launch HQ are kept: a post approved (or held) there stays that way here.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
process.loadEnvFile(join(ROOT, '.env'))
const s3 = await import('./s3.mjs')

const schedule = JSON.parse(readFileSync(join(HERE, 'schedule.json'), 'utf8'))
const remote = await s3.getText('schedule.json')
if (remote) {
  const there = new Map(JSON.parse(remote).posts.map((p) => [p.key, p]))
  let kept = 0
  for (const p of schedule.posts) {
    const r = there.get(p.key)
    if (r && r.approved !== p.approved) { p.approved = r.approved; kept++ }
  }
  if (kept) {
    writeFileSync(join(HERE, 'schedule.json'), JSON.stringify(schedule, null, 1) + '\n')
    console.log(`  kept ${kept} approval change${kept > 1 ? 's' : ''} made in Launch HQ`)
  }
}

// everything rendered: reels (and their no-music cuts), the trailer, every post folder
const OUT = join(ROOT, 'video/out')
const reels = existsSync(join(OUT, 'reels')) ? readdirSync(join(OUT, 'reels')).filter((f) => f.endsWith('.mp4')).map((f) => `video/out/reels/${f}`) : []
const stills = existsSync(join(OUT, 'posts')) ? readdirSync(join(OUT, 'posts')).filter((d) => statSync(join(OUT, 'posts', d)).isDirectory())
  .flatMap((d) => readdirSync(join(OUT, 'posts', d)).filter((f) => /^\d{2}\.jpg$/.test(f)).map((f) => `video/out/posts/${d}/${f}`)) : []
const used = schedule.posts.filter((p) => !p.manual).flatMap((p) => p.files)
// each reel's poster frame (video/out/reels/posters/), so Launch HQ shows a picture before you press play;
// one is cut from the reel when it's missing
mkdirSync(join(OUT, 'reels/posters'), { recursive: true })
const posters = reels.filter((f) => !/-(no-music|hits-only)\.mp4$/.test(f)).map((f) => {
  const poster = f.replace('/reels/', '/reels/posters/').replace(/\.mp4$/, '.jpg')
  if (!existsSync(join(ROOT, poster))) {
    try {
      execFileSync('ffmpeg', ['-loglevel', 'error', '-ss', '1.2', '-i', join(ROOT, f), '-frames:v', '1', '-vf', 'scale=540:-2', '-q:v', '3', '-y', join(ROOT, poster)])
      console.log(`  poster made for ${f}`)
    } catch { console.log(`  no poster for ${f} (is ffmpeg installed?)`) }
  }
  return poster
}).filter((f) => existsSync(join(ROOT, f)))
const trailer = ['video/out/club-nyc-trailer.mp4'].filter((f) => existsSync(join(ROOT, f)))
const files = [...new Set([...used, ...reels, ...trailer, ...posters, ...stills])]
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
await s3.put('media/library.json', JSON.stringify({ at: new Date().toISOString(), files: files.filter((f) => existsSync(join(ROOT, f))) }), 'application/json')
await s3.put('schedule.json', JSON.stringify(schedule, null, 1), 'application/json')
const log = await s3.getText('published.json')
if (log) writeFileSync(join(HERE, 'published.json'), log)
const approved = schedule.posts.filter((p) => p.approved && !p.manual).length
console.log(`media: ${sent} uploaded (${(bytes / 1048576).toFixed(0)} MB), ${same} already there${missing ? `, ${missing} missing` : ''} · library: ${files.length} files · schedule sent (${approved} approved) · ${log ? Object.keys(JSON.parse(log)).length : 0} posted so far`)
