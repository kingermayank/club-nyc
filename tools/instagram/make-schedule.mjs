// Builds tools/instagram/schedule.json from the 60-day plan (plan.mjs), one entry per
// post: when (New York time), what (files), the caption, and whether it's approved. Re-running keeps every entry's
// `approved` and any `time` you changed, so it is safe after editing the plan.
//   node tools/instagram/make-schedule.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../..')
const OUT = join(HERE, 'schedule.json')
const { POSTS: PLAN } = await import('./plan.mjs')

// what each asset is, and where its files are (relative to the repo root)
const REEL = (f) => ({ kind: 'reel', files: [`video/out/reels/${f}`] })
const ASSETS = {
  'grew-up-tall': REEL('club-nyc-reel-grew-up-tall.mp4'), 'tour-tall': REEL('club-nyc-reel-tour-tall.mp4'),
  'halal-trailer': REEL('club-nyc-reel-halal-rush-trailer.mp4'), 'pov-morning': REEL('club-nyc-reel-pov-morning.mp4'),
  'grew-up': REEL('club-nyc-reel-grew-up.mp4'), 'this-or-that': REEL('club-nyc-reel-this-or-that.mp4'),
  'apartment-tour': REEL('club-nyc-reel-apartment-tour.mp4'), 'make-you': REEL('club-nyc-reel-make-you.mp4'),
  'jobs-stack': REEL('club-nyc-reel-jobs-stack.mp4'), 'flash-mob': REEL('club-nyc-reel-flash-mob.mp4'),
  'dance-jam': REEL('club-nyc-reel-dance-jam.mp4'), 'moved-away': REEL('club-nyc-reel-moved-away.mp4'),
  trailer: { kind: 'reel', files: ['video/out/club-nyc-trailer.mp4'] },
  // the story pass (docs/marketing/story-research.md); the carousels of the same names are in POSTS
  'move-to-ny': REEL('club-nyc-reel-move-to-ny.mp4'), 'real-vs-club-reel': REEL('club-nyc-reel-real-vs-club.mp4'),
  'then-and-now-reel': REEL('club-nyc-reel-then-and-now.mp4'),
}
const POSTS = { 'speak-new-yorker': 8, 'first-day': 8, 'free-in-club': 7, 'which-new-yorker': 9, 'fold-a-slice': 6, 'city-news': 7,
  'real-vs-club': 9, 'then-and-now': 6, streetcheesy: 5, 'money-diary': 7 }
const SINGLES = ['fold-it', 'elevator', 'tag-the-line', 'pigeon', 'colour-grid', 'open-date', 'where-live', 'now-hiring',
  'meme-pizza-rat', 'meme-pictured', 'meme-starter', 'meme-train', 'meme-tier', 'meme-bodega-cat', 'meme-walk', 'meme-weekend', 'meme-group-chat', 'meme-radiator',
  'meme-40x', 'meme-pizza-principle']
function asset(id) {
  if (ASSETS[id]) return ASSETS[id]
  if (POSTS[id]) return { kind: 'carousel', files: Array.from({ length: POSTS[id] }, (_, i) => `video/out/posts/${id}/${String(i + 1).padStart(2, '0')}.jpg`) }
  if (SINGLES.includes(id)) return { kind: 'image', files: [`video/out/posts/${id}/01.jpg`] }
  return null
}

const old = existsSync(OUT) ? Object.fromEntries(JSON.parse(readFileSync(OUT, 'utf8')).posts.map((p) => [p.key, p])) : {}
const posts = PLAN.map((d, i) => {
  const a = d.make || d.manual ? null : asset(d.asset)
  // things the API can't post (Live), and anything not rendered yet, are listed but never posted automatically
  const manual = d.manual ? 'Instagram Live is not in the API' : d.make ? `to make: ${d.note || d.asset}` : !a ? `unknown asset ${d.asset}` : null
  return {
    key: `${d.date}-${d.slot}-${d.asset}`,
    day: Math.floor((Date.parse(d.date) - Date.parse(PLAN[0].date)) / 86400000) + 1,
    date: d.date,
    time: d.time,
    slot: d.slot,
    phase: d.phase,
    series: d.series,
    seriesName: d.seriesName,
    format: d.format,
    title: d.title,
    hook: d.hook,
    asset: d.asset,
    kind: a?.kind ?? null,
    files: a?.files ?? [],
    caption: d.caption,
    trial: d.format === 'Trial',
    manual,
    approved: false,
  }
})
// keep what was already decided
for (const p of posts) if (old[p.key]) Object.assign(p, { approved: old[p.key].approved, time: old[p.key].time, caption: old[p.key].caption })


writeFileSync(OUT, JSON.stringify({
  note: 'Edit freely: set "approved": true to let a post go out, change "time" (New York time) or "caption". `node tools/instagram/publish.mjs` checks everything without posting; add --live to post.',
  timezone: 'America/New_York',
  aiLabel: true,
  posts,
}, null, 1) + '\n')
const auto = posts.filter((p) => !p.manual)
console.log(`${posts.length} entries · ${auto.length} the publisher can post (${auto.filter((p) => p.kind === 'reel').length} reels, ${auto.filter((p) => p.kind === 'carousel').length} carousels, ${auto.filter((p) => p.kind === 'image').length} images) · ${posts.length - auto.length} manual`)
console.log(`to make: ${posts.filter((p) => p.manual?.startsWith('to make')).length} · ${posts.filter((p) => p.date < '2026-11-17' && !p.manual).length} ready before launch`)
