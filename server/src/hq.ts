/**
 * Launch HQ (app/public/hq.html): one page for the go-to-market. What needs a decision, the launch countdown and
 * readiness checks, every email journey with previews, the 60-day Instagram calendar with approvals, and the
 * teaser / launch film storyboards. Behind the moderator login (mounted under /api/admin/hq).
 *
 * Instagram: the schedule and the record of what's posted live in the Railway bucket the publisher uses
 * (SOCIAL_S3_ENDPOINT / _BUCKET / _REGION / _ACCESS_KEY_ID / _SECRET_ACCESS_KEY, set as references to the bucket);
 * in development, tools/instagram/schedule.json. Likes and comments come from the Graph API when META_PAGE_TOKEN and
 * IG_USER_ID are set. The plan behind it all: docs/launch/gtm-plan.md.
 */
import { promises as dns } from 'node:dns'
import { createReadStream, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { Readable } from 'node:stream'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash, createHmac } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import { config } from './config.ts'
import { q } from './db.ts'
import { emailConfigured, renderEmail } from './email.ts'
import { JOURNEYS, journeyEmail } from './journeys.ts'
import { launchModeNow, launchState, opensAt, setOpening, waitlistOverview } from './waitlist.ts'
import { signV4 } from './ops.ts'
import { liveSnapshot } from './game/realtime.ts'
import { FOUNDER } from './founder.ts'

export const hq = new Hono()
const env = process.env
const DAY = 86400_000
/** the plan's launch moment, until LAUNCH_AT says otherwise */
const PLANNED = Date.parse('2026-11-17T10:00:00-05:00')
const launchTime = () => opensAt() ?? PLANNED
const n = (sql: string, ...a: (string | number)[]) => q.get<{ n: number | null }>(sql, ...a)!.n ?? 0

// ---------- the Instagram schedule (bucket in production, the local file in development) ----------
type Post = { key: string; day: number; date: string; time: string; slot: string; phase: string; series: string; seriesName: string; format: string; title: string; hook: string; asset: string; kind: string | null; files: string[]; caption: string; trial: boolean; manual: string | null; approved: boolean }
type Schedule = { note?: string; timezone: string; aiLabel: boolean; posts: Post[] }
type Published = Record<string, { id: string; permalink: string; at: string }>
const LOCAL = resolve(dirname(fileURLToPath(import.meta.url)), '../../tools/instagram')
const bucket = () => (env.SOCIAL_S3_ENDPOINT && env.SOCIAL_S3_BUCKET && env.SOCIAL_S3_ACCESS_KEY_ID && env.SOCIAL_S3_SECRET_ACCESS_KEY ? { host: `${env.SOCIAL_S3_BUCKET}.${new URL(env.SOCIAL_S3_ENDPOINT).host}`, region: env.SOCIAL_S3_REGION || 'auto', id: env.SOCIAL_S3_ACCESS_KEY_ID, secret: env.SOCIAL_S3_SECRET_ACCESS_KEY } : null)
const contentSource = () => (bucket() ? 'bucket' : existsSync(join(LOCAL, 'schedule.json')) ? 'local' : 'none')

async function s3(method: 'GET' | 'PUT', key: string, body?: string): Promise<string | null> {
  const b = bucket()!
  const payloadHash = createHash('sha256').update(body ?? '').digest('hex')
  const signed = signV4({ method, host: b.host, path: `/${key}`, headers: { 'x-amz-content-sha256': payloadHash, ...(body ? { 'content-type': 'application/json' } : {}) }, payloadHash, region: b.region, service: 's3', accessKeyId: b.id, secretAccessKey: b.secret, date: new Date() })
  const { host, ...headers } = signed.headers
  void host
  const res = await fetch(`https://${b.host}${signed.path}`, { method, body, headers: { ...headers, authorization: signed.authorization } })
  if (method === 'GET' && res.status === 404) return null
  if (!res.ok) throw new Error(`bucket ${method} ${key}: HTTP ${res.status}`)
  return method === 'GET' ? res.text() : ''
}
async function readSchedule(): Promise<{ schedule: Schedule | null; published: Published }> {
  const src = contentSource()
  if (src === 'bucket') {
    const [s, p] = await Promise.all([s3('GET', 'schedule.json'), s3('GET', 'published.json')])
    return { schedule: s ? JSON.parse(s) : null, published: p ? JSON.parse(p) : {} }
  }
  if (src === 'local') {
    const pub = join(LOCAL, 'published.json')
    return { schedule: JSON.parse(readFileSync(join(LOCAL, 'schedule.json'), 'utf8')), published: existsSync(pub) ? JSON.parse(readFileSync(pub, 'utf8')) : {} }
  }
  return { schedule: null, published: {} }
}
async function writeSchedule(s: Schedule) {
  const text = JSON.stringify(s, null, 1) + '\n'
  if (contentSource() === 'bucket') await s3('PUT', 'schedule.json', text)
  else writeFileSync(join(LOCAL, 'schedule.json'), text)
}

/** a temporary link to a file in the bucket (AWS Signature V4, query style), for previews in this page */
function presign(key: string, seconds = 3600): string {
  const b = bucket()!
  const amz = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '')
  const day = amz.slice(0, 8)
  const scope = `${day}/${b.region}/s3/aws4_request`
  const enc = (v: string) => encodeURIComponent(v).replace(/[!'()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
  const qp: Record<string, string> = { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${b.id}/${scope}`, 'X-Amz-Date': amz, 'X-Amz-Expires': String(seconds), 'X-Amz-SignedHeaders': 'host' }
  const query = Object.keys(qp).sort().map((k) => `${enc(k)}=${enc(qp[k])}`).join('&')
  const path = '/' + key.split('/').map(enc).join('/')
  const canonical = ['GET', path, query, `host:${b.host}`, '', 'host', 'UNSIGNED-PAYLOAD'].join('\n')
  const hmac = (k: string | Buffer, d: string) => createHmac('sha256', k).update(d).digest()
  let k = hmac(`AWS4${b.secret}`, day)
  for (const part of [b.region, 's3', 'aws4_request']) k = hmac(k, part)
  const sig = createHmac('sha256', k).update(['AWS4-HMAC-SHA256', amz, scope, createHash('sha256').update(canonical).digest('hex')].join('\n')).digest('hex')
  return `https://${b.host}${path}?${query}&X-Amz-Signature=${sig}`
}
/** only the rendered posts and reels can be previewed: never anything else on disk or in the bucket */
const MEDIA = /^video\/out\/(?:reels\/(?:posters\/)?[\w.-]+\.(?:mp4|jpg)|posts\/[\w-]+\/\d{2}\.jpg|club-nyc-trailer\.mp4)$/
const REPO = resolve(LOCAL, '../..')
const TYPES: Record<string, string> = { mp4: 'video/mp4', jpg: 'image/jpeg' }

/** the still that stands for a post: a reel's poster frame (rendered next to it), a carousel's first slide */
function thumbOf(files: string[]): string | null {
  const f = files[0]
  if (!f) return null
  if (!f.endsWith('.mp4')) return f
  const poster = f.replace('/reels/', '/reels/posters/').replace(/\.mp4$/, '.jpg')
  return poster !== f && MEDIA.test(poster) && (bucket() || existsSync(join(REPO, poster))) ? poster : null
}
/** every rendered file: in development the render folder itself, in production the index sync.mjs leaves in the bucket */
async function rendered(): Promise<string[]> {
  if (bucket()) {
    const idx = await s3('GET', 'media/library.json').catch(() => null)
    return idx ? (JSON.parse(idx) as { files: string[] }).files.filter((f) => MEDIA.test(f)) : []
  }
  const out = join(REPO, 'video/out')
  const reels = join(out, 'reels'), stills = join(out, 'posts')
  const files: string[] = []
  if (existsSync(reels)) for (const f of readdirSync(reels)) if (f.endsWith('.mp4')) files.push(`video/out/reels/${f}`)
  if (existsSync(stills)) for (const d of readdirSync(stills)) if (statSync(join(stills, d)).isDirectory())
    for (const f of readdirSync(join(stills, d))) if (/^\d{2}\.jpg$/.test(f)) files.push(`video/out/posts/${d}/${f}`)
  return files
}
/** every rendered post, scheduled or not: the schedule's assets, plus every draft that isn't on the calendar */
async function library(posts: Post[]) {
  const items = new Map<string, { id: string; kind: string; files: string[]; thumb: string | null; uses: string[] }>()
  for (const p of posts) {
    if (!p.files.length || !p.kind) continue
    const it = items.get(p.asset) ?? { id: p.asset, kind: p.kind, files: p.files, thumb: thumbOf(p.files), uses: [] }
    it.uses.push(p.key)
    items.set(p.asset, it)
  }
  const used = new Set([...items.values()].flatMap((i) => i.files))
  const all = (await rendered()).sort()
  for (const rel of all.filter((f) => /^video\/out\/reels\/[\w.-]+\.mp4$/.test(f))) {
    const f = rel.slice('video/out/reels/'.length)
    if (/-(no-music|hits-only)\.mp4$/.test(f) || used.has(rel)) continue
    items.set(f, { id: f.replace(/^club-nyc-(reel-)?|\.mp4$/g, ''), kind: 'reel', files: [rel], thumb: thumbOf([rel]), uses: [] })
  }
  const dirs = new Map<string, string[]>()
  for (const rel of all) { const m = /^video\/out\/posts\/([\w-]+)\//.exec(rel); if (m) dirs.set(m[1], [...(dirs.get(m[1]) ?? []), rel]) }
  for (const [d, files] of dirs) {
    if (files.every((f) => used.has(f))) continue
    items.set(`posts:${d}`, { id: d, kind: files.length > 1 ? 'carousel' : 'image', files, thumb: files[0], uses: [] })
  }
  return [...items.values()]
}
/** hide most of an address in the activity feed: a glance shouldn't show anyone's email */
const maskEmail = (e: string) => e.replace(/^(.)([^@]*)(@.*)$/, (_m, a: string, b: string, d: string) => `${a}${'•'.repeat(Math.min(6, Math.max(2, b.length)))}${d}`)

/** likes and comments for what's been posted (Graph API, cached 10 minutes); empty without a token */
let statsCache: { at: number; data: Record<string, { likes: number; comments: number }> } = { at: 0, data: {} }
async function igStats(published: Published) {
  if (!env.META_PAGE_TOKEN || Date.now() - statsCache.at < 10 * 60_000) return statsCache.data
  const data: Record<string, { likes: number; comments: number }> = {}
  await Promise.all(
    Object.entries(published).map(async ([key, p]) => {
      const r = await fetch(`https://graph.facebook.com/v23.0/${p.id}?fields=like_count,comments_count&access_token=${env.META_PAGE_TOKEN}`).then((x) => x.json() as Promise<{ error?: unknown; like_count?: number; comments_count?: number }>).catch(() => null)
      if (r && !r.error) data[key] = { likes: r.like_count ?? 0, comments: r.comments_count ?? 0 }
    }),
  )
  statsCache = { at: Date.now(), data }
  return data
}

// ---------- launch readiness ----------
type Check = { id: string; area: string; label: string; state: 'ok' | 'warn' | 'todo'; detail: string; owner: 'you' | 'claude' }
const txt = (name: string) => Promise.race([dns.resolveTxt(name).then((r) => r.map((x) => x.join('')), () => [] as string[]), new Promise<string[]>((ok) => setTimeout(() => ok([]), 3000))])
const fromDomain = () => /@([^>\s]+)>?\s*$/.exec(env.EMAIL_FROM ?? '')?.[1]?.toLowerCase() ?? ''

async function checks(): Promise<Check[]> {
  const wl = waitlistOverview()
  const domain = fromDomain()
  const [dkim, spf] = domain ? await Promise.all([txt(`resend._domainkey.${domain}`), txt(`send.${domain}`)]) : [[], []]
  const now = Date.now()
  const at = launchTime()
  const out: Check[] = [
    { id: 'email-key', area: 'Email', label: 'Resend connected (key and sender)', state: emailConfigured ? 'ok' : 'todo', detail: emailConfigured ? `Sending as ${env.EMAIL_FROM}` : 'RESEND_API_KEY and EMAIL_FROM go live with the next deploy', owner: 'claude' },
    { id: 'email-dkim', area: 'Email', label: `DNS: signing record for ${domain || 'the sending domain'}`, state: dkim.some((v) => v.startsWith('p=')) ? 'ok' : 'todo', detail: dkim.length ? 'Found' : 'Add the DKIM TXT record at name.com (resend._domainkey.mail)', owner: 'you' },
    { id: 'email-spf', area: 'Email', label: 'DNS: sender record (SPF)', state: spf.some((v) => v.includes('amazonses')) ? 'ok' : 'todo', detail: spf.length ? 'Found' : 'Add the SPF TXT and MX records at name.com (send.mail)', owner: 'you' },
    { id: 'email-address', area: 'Email', label: 'A mailing address in every marketing email', state: config.mailingAddress ? 'ok' : 'todo', detail: config.mailingAddress ? 'Set' : 'US law (CAN-SPAM) needs a postal address in marketing email: set MAILING_ADDRESS (a PO box works)', owner: 'you' },
    { id: 'email-plan', area: 'Email', label: 'Resend plan fits the launch email', state: wl.counts.eligible > 90 ? 'warn' : 'ok', detail: wl.counts.eligible > 90 ? `${wl.counts.eligible} people to email; the free plan sends 100 a day. Upgrade to Pro before launch.` : `${wl.counts.eligible} to email at launch: the free plan's 100 a day covers it today. Re-check at L-3.`, owner: 'you' },
    { id: 'launch-at', area: 'Launch', label: 'Opening time set', state: launchModeNow() === 'open' ? 'ok' : (opensAt() ?? 0) > now ? 'ok' : 'todo', detail: launchModeNow() === 'open' ? 'The city is open' : opensAt() ? `Opens ${new Date(opensAt()!).toUTCString()}` : 'Planned Tue Nov 17, 10:00 ET: set it with the switch on this page', owner: 'you' },
    { id: 'preview', area: 'Launch', label: 'Founders’ Preview code', state: env.PREVIEW_CODE ? 'ok' : at - now < 8 * DAY ? 'todo' : 'warn', detail: env.PREVIEW_CODE ? 'Set: testers open /play?preview=<code>' : 'Set PREVIEW_CODE by L-7 (Nov 10) to let the preview in', owner: 'you' },
    { id: 'url', area: 'Launch', label: 'Public address is https', state: config.publicUrl.startsWith('https://') ? 'ok' : 'todo', detail: config.publicUrl, owner: 'claude' },
    { id: 'company', area: 'Launch', label: 'Company name and contact email on the site', state: config.companyName && config.contactEmail ? 'ok' : 'todo', detail: config.companyName && config.contactEmail ? 'Set' : 'COMPANY_NAME and CONTACT_EMAIL fill the policies and the footer', owner: 'you' },
    { id: 'discord', area: 'Launch', label: 'Discord invite', state: config.discordInvite ? 'ok' : 'warn', detail: config.discordInvite ? 'Set' : 'The Discord buttons say “opens soon” until DISCORD_INVITE_URL is set', owner: 'you' },
    { id: 'signin', area: 'Launch', label: 'Sign in with Google / X / Discord', state: config.google && config.x && config.discord ? 'ok' : 'warn', detail: [config.google ? null : 'Google', config.x ? null : 'X', config.discord ? null : 'Discord'].filter(Boolean).join(', ') ? `Missing: ${[config.google ? null : 'Google', config.x ? null : 'X', config.discord ? null : 'Discord'].filter(Boolean).join(', ')}` : 'All three', owner: 'you' },
    { id: 'backups', area: 'Operations', label: 'Database backups, off-site', state: env.BACKUP_S3_BUCKET ? 'ok' : 'todo', detail: env.BACKUP_S3_BUCKET ? 'Copies leave the server' : 'Backups stay on the same volume as the database: point BACKUP_S3_* at a Railway bucket', owner: 'claude' },
    { id: 'errors', area: 'Operations', label: 'Crash reports in the last day', state: n('SELECT COUNT(*) AS n FROM client_errors WHERE at > ?', now - DAY) > 20 ? 'warn' : 'ok', detail: `${n('SELECT COUNT(*) AS n FROM client_errors WHERE at > ?', now - DAY)} in 24 h`, owner: 'claude' },
    { id: 'social-store', area: 'Social', label: 'Launch HQ can see the Instagram schedule', state: contentSource() === 'bucket' ? 'ok' : contentSource() === 'local' ? 'warn' : 'todo', detail: contentSource() === 'bucket' ? 'Reading the publisher’s bucket' : contentSource() === 'local' ? 'Reading the local file (development)' : 'Set SOCIAL_S3_* on this service as references to the club-nyc-social bucket', owner: 'claude' },
    { id: 'social-job', area: 'Social', label: 'Scheduled publisher running on Railway', state: 'todo', detail: 'Waiting on your OK to push tools/instagram to a branch and create the cron service', owner: 'you' },
  ]
  return out
}

/** the go-to-market, phase by phase (dates for a Tuesday Nov 17 opening; docs/launch/gtm-plan.md) */
const TIMELINE = [
  { at: '2026-10-29', label: 'L-19', title: 'Teaser starts', items: ['Two posts a day begin (the 60-day plan)', 'Landing page asks people to claim a name', 'Bio, profile picture, link in bio'] },
  { at: '2026-11-03', label: 'L-14', title: 'Email goes live', items: ['DNS verified, Resend connected, test emails to you', 'Wire the confirmed / reminder emails', 'Seed the first creators (no scripts, #ad)'] },
  { at: '2026-11-07', label: 'L-10', title: 'Trailer day', items: ['Teaser film on Instagram, TikTok, YouTube Shorts', '“First look” email to opted-in waitlisters', 'Press list from launch-campaign.md gets the trailer'] },
  { at: '2026-11-10', label: 'L-7', title: 'Founders’ Preview', items: ['PREVIEW_CODE on; invites in waves (earliest, then inviters)', 'Collect the first real player clips (with permission)', 'Watch the crash reports and the creator funnel'] },
  { at: '2026-11-14', label: 'L-3', title: 'Dress rehearsal', items: ['Load test against Railway; freeze features', 'Resend Pro if the list is past 90 people', 'Instagram Live walkthrough'] },
  { at: '2026-11-16', label: 'L-1', title: 'Set the clock', items: ['LAUNCH_AT=2026-11-17T10:00:00-05:00', 'Approve launch-week posts', 'Final backup, download it'] },
  { at: '2026-11-17', label: 'L', title: 'Opening day', items: ['10:00 ET the city opens by itself', '10:05 start the launch email (claim your name)', '12:00 launch reel + creator co-posts · 20:00 Opening Night Dance Jam'] },
  { at: '2026-11-20', label: 'L+3', title: 'One reminder', items: ['“Your name is still waiting” to those who haven’t claimed', 'Player clips reel, Job of the Week begins'] },
  { at: '2026-11-24', label: 'L+7', title: 'Week one, honestly', items: ['Real numbers post', 'First Club NYC Times to subscribers', 'Unclaimed names released'] },
  { at: '2026-12-17', label: 'L+30', title: 'One month', items: ['Retro: what to double down on', 'Plan the next 60 days from what worked'] },
]
const RUNBOOK = [
  { at: 'L-1, evening', step: 'Set LAUNCH_AT on Railway; check this page shows the countdown and every check is green' },
  { at: 'L, 09:30 ET', step: 'Take a backup and download it; open this page, the moderator dashboard and Railway logs side by side' },
  { at: 'L, 10:00 ET', step: 'The city opens by itself. Open playclubnyc.com in a private window: the landing page says Play Now' },
  { at: 'L, 10:05 ET', step: 'Start the launch email from the Waitlist tab (batches of 100, safe to re-run). Watch for bounces' },
  { at: 'L, 12:00 ET', step: 'Launch reel goes out (approved in Content); creators co-post in the same hour' },
  { at: 'L, all day', step: 'Watch: players online, sign-ups, crash reports, open reports. Moderators on chat' },
  { at: 'L, 20:00 ET', step: 'Opening Night Dance Jam in Times Square: be in the room' },
  { at: 'If it goes wrong', step: 'Set LAUNCH_MODE=waitlist and remove LAUNCH_AT to close the doors again; maintenance mode from the dashboard; restore a backup if data is wrong' },
]

// ---------- the films ----------
const STORYBOARDS = [
  {
    id: 'teaser', name: 'Teaser: “Someone’s moving in”', length: '15 s', formats: '9:16 and 16:9', when: 'L-10 (Nov 7), pinned until launch',
    idea: 'The city before anyone’s in it. Empty rooms at dawn, one New Yorker walks in, the logo builds itself. Ends on the one action: claim your name.',
    music: 'Sidewalk Shuffle’s intro, slowed, marimba alone; the logo’s taxi honk as the only hit',
    shots: [
      { t: '0.0–2.0', art: '/art/rooms/grand-central.jpg', shot: 'Grand Central, empty, slow push in. Only the clock ticks.', text: '' },
      { t: '2.0–4.0', art: '/art/rooms/central-park.jpg', shot: 'Central Park lawn at dawn, a pigeon lands. Still empty.', text: 'Manhattan.' },
      { t: '4.0–6.5', art: '/art/rooms/liberty-island-v2.jpg', shot: 'Liberty Island: one New Yorker walks into frame (tall crop, they cross the middle third).', text: 'Someone’s moving in.' },
      { t: '6.5–9.0', art: '/art/rooms/apartment.jpg', shot: 'An apartment door swings open. Empty room, one radiator. A rug drops in.', text: '' },
      { t: '9.0–11.0', art: '/art/rooms/broadway.jpg', shot: 'Quick cuts on the beat: a MetroCard flips, a name tag pops: “Taxi_Tina”.', text: 'Your name’s waiting.' },
      { t: '11.0–14.0', art: '/art/ui/logo.png', shot: 'The animated logo builds itself (Launch HQ’s logoMotion intro): sticker, CLUB, NYC, tower, taxi, sparkles. Honk.', text: '' },
      { t: '14.0–15.0', art: '/art/ui/logo.png', shot: 'End card on Club Blue.', text: 'Claim your name · Link in bio' },
    ],
  },
  {
    id: 'launch', name: 'Launch film: “One link. Everyone’s there.”', length: '60 s (+ 30 s and 15 s cuts)', formats: '16:9 for YouTube and the landing page; 9:16 cut for Reels',
    idea: 'The real promise of Club NYC: your group chat, in one place. A friend sends a link, you land right next to them, and the city is the thing you do together. Gameplay in the first second, the core loop by second 15, one clear action at the end.',
    music: 'Sidewalk Shuffle, full band; cuts on every 2 beats in the montage, every beat on the drop; the drop lands on the Times Square Dance Jam',
    shots: [
      { t: '0–4', art: '/art/rooms/times-square-v2.jpg', shot: 'Phone screen, group chat: “where is everyone” · “times square” · “wait what”. A link is sent.', text: '' },
      { t: '4–8', art: '/art/rooms/times-square-v2.jpg', shot: 'Tap. You land in Times Square right next to your friend; they wave (cropped left: no I ♥ NY sign).', text: 'One link.' },
      { t: '8–15', art: '/art/rooms/central-park.jpg', shot: 'Make your New Yorker in 3 cuts (look, colour, name), then the subway doors open on Central Park.', text: 'Everyone’s there.' },
      { t: '15–30', art: '/art/rooms/game-slice.jpg', shot: 'Montage on the beat: fold pizza, halal rush, ferry, bagel counter. Coins pop.', text: 'Work.' },
      { t: '30–40', art: '/art/rooms/loft.jpg', shot: 'Apartment party: furniture drops in, friends arrive through the door, someone hits the jukebox.', text: 'Live.' },
      { t: '40–50', art: '/art/rooms/rockefeller.jpg', shot: 'Skating at the rink, someone falls; the paper’s headline; a stamp lands in the book.', text: 'Fall over.' },
      { t: '50–56', art: '/art/rooms/times-square-v2.jpg', shot: 'The drop: 8 PM Dance Jam, the whole city in Times Square, camera pulls up. Chat: “same time tomorrow?”', text: 'Dance.' },
      { t: '56–60', art: '/art/ui/logo.png', shot: 'The logo builds itself, taxi honks.', text: 'Club NYC · Open now · Link in bio' },
    ],
  },
  {
    id: 'bumper', name: 'Bumper: “Lunch. Is. Coming.”', length: '6 s', formats: '9:16', when: 'Launch week, as a Trial Reel and for any paid test',
    idea: 'The funniest 6 seconds of the Halal Rush trailer, ending on the logo. For audiences who never saw the penguin game.',
    music: 'Boom, braam, dead air, honk',
    shots: [
      { t: '0–4', art: '/art/rooms/game-halal.jpg', shot: 'LUNCH. IS. COMING. slammed over the cart in slow motion', text: 'LUNCH. IS. COMING.' },
      { t: '4–6', art: '/art/ui/logo.png', shot: 'Logo, honk', text: 'A Club NYC job' },
    ],
  },
]

// what still needs doing before and around the opening, from testing and go-to-market research (Oct 29, 2026; sources in
// docs/launch/gtm-plan.md). `when` is the day it's due; done ones come off this list in code.
const TASKS: { when: string; what: string; why: string; owner: 'you' | 'claude' }[] = [
  { when: 'Now', what: 'Add the Resend DNS records, then warm the domain up', why: 'New domains start at about 150 emails a day; send the launch email in waves, keep spam complaints under 0.08%', owner: 'you' },
  { when: 'Now', what: 'Say “free, no ads, no crypto” everywhere', why: 'A crypto penguin browser game launched in March; we need to be the obvious other one', owner: 'claude' },
  { when: 'Now', what: 'Warm up a founder Reddit account with real comments', why: 'Moderators read your history; about 10% self-promotion is the norm', owner: 'you' },
  { when: 'Now', what: 'Post every reel to TikTok too, from the clean render', why: 'Instagram ranks watermarked reposts lower, TikTok demotes reposts: both get their own upload', owner: 'you' },
  { when: 'Nov 3', what: 'Reconnect test: redeploy with 1,000 bots in the city', why: 'Everyone reconnecting at once is the one thing the load test didn’t cover', owner: 'claude' },
  { when: 'Nov 3', what: 'Outside uptime checks that text you, and a status page off Railway', why: 'Railway stops health-checking once a deploy is live', owner: 'you' },
  { when: 'Nov 3', what: 'Invite 40 small creators (cozy games, 2000s internet, NYC) to the Preview', why: 'Collab posts land on both grids; a free perk needs an “ad” label', owner: 'you' },
  { when: 'Nov 3', what: 'Press kit to NYC outlets (Time Out, Gothamist, Secret NYC, Untapped) and games press, embargoed to Nov 17', why: 'The New York angle is the rarer story', owner: 'claude' },
  { when: 'Nov 3', what: '“I saved @name” share card and a bring-three-friends invite on the waitlist', why: 'Turns the name step into a referral loop', owner: 'claude' },
  { when: 'Nov 5', what: 'Rollback drill: a backup before every deploy, a timed restore', why: 'Rolling back the app doesn’t roll back the database', owner: 'claude' },
  { when: 'Nov 5', what: 'Idle tab, laptop sleep and Wi-Fi switch tests; rate limits on sign-in emails and chat', why: 'Background tabs slow timers to once a minute; floods of sign-in emails earn spam complaints', owner: 'claude' },
  { when: 'Nov 5', what: 'Line up 10 to 15 small streamers for launch night', why: 'For indie games, streamers did more than press', owner: 'you' },
  { when: 'Nov 7', what: 'Browser check: Chrome, Firefox, Edge, Safari, Brave with an ad blocker; Mac, Windows, Chromebook, a 1366 × 768 laptop', why: 'US desktop: Chrome 60%, Firefox 14%, Edge 12%, Safari 9%', owner: 'claude' },
  { when: 'Nov 7', what: 'Play from far away: 250 ms of delay and 2% packet loss', why: 'Mini-games have to stay fair for players far from the US East server', owner: 'claude' },
  { when: 'Nov 7', what: 'Sign-in email check in Gmail, Outlook, Yahoo, iCloud and a school account', why: 'A sign-in link in spam is a lost player', owner: 'you' },
  { when: 'Nov 7', what: 'Legal: postal address in emails, a DMCA agent, retention in the privacy policy', why: 'CAN-SPAM needs the address; the DMCA agent registration renews every 3 years', owner: 'you' },
  { when: 'Nov 7', what: 'Register with the NCMEC CyberTipline and write the escalation steps', why: 'A teen-heavy chat game needs a reporting path before it needs one', owner: 'you' },
  { when: 'Nov 7', what: 'Kill switches: pause sign-ups, chat or a mini-game from Launch HQ', why: 'Slow down instead of falling over', owner: 'claude' },
  { when: 'Nov 10', what: 'Moderators 3 to 11 PM ET for launch week: you plus 3 to 5 Preview volunteers', why: 'Teens are online after school; answer reports in under 15 minutes', owner: 'you' },
  { when: 'Nov 10', what: 'Discord event for Opening Night (8 PM ET) with testers as greeters, and one event every night that week', why: 'A time to show up beats “come whenever”', owner: 'you' },
  { when: 'Nov 10', what: 'Support inbox with an autoreply and saved answers (sign-in, names, bans, parents)', why: 'Support mail spikes on launch day', owner: 'you' },
  { when: 'Nov 14', what: 'Feature freeze and the war-room plan: when we roll back, who decides', why: 'Decide it before the day, not during', owner: 'claude' },
  { when: 'Nov 17', what: '10:00 the city opens and the email goes; about 1 PM the hero reel; 8 PM Opening Night', why: 'Tuesday afternoon is Instagram’s strongest window; teens are in school at 10', owner: 'you' },
  { when: 'Nov 17', what: 'r/WebGames with a direct link; the making-of in r/IndieGaming, r/indiegames, r/IndieDev, one a day', why: 'r/WebGames trades plays for free, no-download games', owner: 'you' },
  { when: 'Nov 18', what: 'Show HN and Product Hunt (the day starts 12:01 AM PT)', why: 'Show HN wants it playable without signing up: guests can', owner: 'you' },
  { when: 'Nov 20', what: '“The first 72 hours, honestly” post and a press follow-up; tease the Thanksgiving-week event', why: 'A second news hook, and a reason to come back in week two', owner: 'claude' },
]

// the Instagram playbook (was docs/marketing/instagram-30-day-plan.html): how the calendar is meant to grow the account
const PLAYBOOK = {
  phases: [
    { name: 'Teaser', when: 'Oct 29 to Nov 9', ask: 'Follow, and claim your name on the waitlist' },
    { name: 'Founders’ Preview', when: 'Nov 10 to 16', ask: 'Get an invite; see real players' },
    { name: 'Launch week', when: 'Nov 17 to 23', ask: 'Come tonight, bring your friends' },
    { name: 'First weeks', when: 'Nov 24 to Dec 6', ask: 'Come back for this week’s thing' },
    { name: 'Winter in the city', when: 'Dec 7 to 27', ask: 'Bring the people you’re home with' },
  ],
  levers: [
    ['Write for one person', 'Hooks name who it’s for: the friend who moved away, the group chat, the coworker who only eats halal. People send what describes someone they know.', 'Every hook passes the test: who would you send this to?'],
    ['Memes are sends', 'A meme in our own art (“nobody: / New Yorkers:”, starter packs, expectation vs reality) gets sent to a friend more than anything polished. Sends are what Instagram rewards most.', 'Two a week, 19:00 slot'],
    ['Trial Reels first', 'Instagram can show a reel to non-followers only. Test two hooks per idea there and post only the winner to the grid.', '2 trials a week in the teaser'],
    ['Collab posts', 'A reel co-posted with a creator lands on both grids and both audiences. NYC micro creators (10K to 50K) get early access and their own join link.', '1 collab a week, 3 on launch day'],
    ['Comment for a key', 'Comment CITY and we DM the waitlist or invite link. Comments lift the reel, the DM opens a thread.', 'Instagram auto-reply on a keyword'],
    ['Series, not one-offs', 'Named, recurring formats (Job of the Week, The Trailer, Locals Say, Memes) give people a reason to follow instead of just watch.', 'Same title card, same day each week'],
    ['Hand people the tools', 'Every reel has a no-music cut, and Photo Booth snaps are 9:16 with the invite link. Players make the next reel.', 'Add Yours sticker every weekend'],
    ['Post when it’s live', 'Event reels go up at 19:00 ET, an hour before the night’s Jam, so a send turns into “come now”.', 'Tue to Thu, 11:00 to 18:00 otherwise'],
  ],
  // the story every post tells (docs/marketing/story-research.md; the full report is the Story Report doc)
  story: {
    line: 'Same crew. Bigger city.',
    beats: [
      ['Then', 'After school, everyone was online in one safe, silly place.'],
      ['Now', 'We grew up. Rent got weird, friends moved to other cities, the group chat says “we should hang out”.'],
      ['Here', 'That place grew up and moved to New York. The apartment is free, the job is folding pizza, the crew is one link away.'],
    ],
    who: 'For 21 to 32: the grown-up penguin, the almost-New Yorker, the long-distance crew. Celebrate, don’t mourn. Rent jokes aim at the city, never at newcomers or natives.',
    report: 'https://claude.ai/artifact/JPBEKcsDcMtXNBX2MjzVL5',
  },
  // the growth loop: each turn brings new people
  engine: ['A reel goes up', 'Someone sends it', 'Their friend lands next to them', 'They play a job', 'Photo Booth snap, posted'],
  watch: [
    ['Still watching at 3 s', 'Did the hook stop the scroll?', '60%+'],
    ['Sends per 1,000 views', 'The spread. Our main number', 'Beat our median'],
    ['Average % watched', 'Loops count, so short wins', '70%+'],
    ['Follows per 1,000 reached', 'Did non-followers want more?', 'Beat our median'],
    ['Join clicks, then sign-ups', 'Each reel’s own link', 'Weekly'],
    ['Friends per new player', 'Invites accepted, in game', 'Above 1 by week 4'],
  ],
  rules: [
    'Any reel at twice our median sends gets two new versions that week: a new hook, then a new place or job in the same format.',
    'Every new hook runs first as a Trial Reel (non-followers only). The winner goes to the grid.',
    'Under the median twice in a row: retired.',
    'The best comment of the week becomes next week’s reel, and we reply to it with the video.',
    'We never round up, and never post a player count we can’t show.',
  ],
  making: [
    ['Look', 'Burbank only: Bold for hooks and plates, Medium for small print. Hooks in white with an ink outline, one word in Taxi Yellow, seven words or fewer. Hook in the top third; the bottom fifth and right edge belong to Instagram’s buttons. End card: the logo on Club Blue, the line on a Taxi Yellow button.'],
    ['Sound and timing', '100 BPM: a beat is 0.6 s (18 frames), a reel is 16 or 32 beats. The master track is our own tune, so it’s always safe; each reel also has a no-music cut for trending sounds added in the app. Licensed songs never go in our files.'],
    ['Real photos', 'Only in Real New York vs Club NYC and then-and-now: public domain or CC0, credited on the image. No identifiable people, store names, I ♥ NY, subway signs or Twin Towers.'],
    ['Lines we don’t cross', 'No “Club Penguin” on screen or in the account name; in a caption only, with “not affiliated with Disney or Club Penguin”. Real gameplay only, and every Club NYC claim true in the game. No real store names, no fake scarcity, no countdowns to nothing, no em dashes. Creators tag #ad.'],
  ],
  loop: [
    ['Monday', 'Read last week: anything at twice the median sends gets two new versions; anything under the median twice is retired.'],
    ['Tuesday', 'Claude renders the week: reels, carousels, singles and memes.'],
    ['Wednesday', 'You approve them here. Nothing posts unapproved.'],
    ['Every day', 'The publisher posts approved posts at 12:00 and 19:00 ET.'],
  ],
}

// ---------- routes ----------
hq.get('/summary', async (c) => {
  const now = Date.now()
  const wl = waitlistOverview()
  const { schedule, published } = await readSchedule().catch(() => ({ schedule: null, published: {} as Published }))
  const posts = schedule?.posts ?? []
  const today = new Date(now).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const soon = (days: number) => new Date(now + days * DAY).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const next3 = posts.filter((p) => p.date >= today && p.date <= soon(3) && !published[p.key])
  const makeWeek = posts.filter((p) => p.date >= today && p.date <= soon(7) && p.manual?.startsWith('to make'))
  const list = await checks()
  const needs: { title: string; detail: string; owner: 'you' | 'claude'; tab: string; level: 'now' | 'soon' }[] = []
  for (const ch of list.filter((x) => x.state !== 'ok')) needs.push({ title: ch.label, detail: ch.detail, owner: ch.owner, tab: 'launch', level: ch.state === 'todo' ? 'now' : 'soon' })
  const unapproved = next3.filter((p) => !p.manual && !p.approved)
  if (unapproved.length) needs.unshift({ title: `Approve ${unapproved.length} post${unapproved.length > 1 ? 's' : ''} for the next 3 days`, detail: unapproved.slice(0, 3).map((p) => `${p.date.slice(5)} ${p.time} · ${p.title}`).join(' · '), owner: 'you', tab: 'content', level: 'now' })
  if (makeWeek.length) needs.push({ title: `${makeWeek.length} posts to make for the next 7 days`, detail: makeWeek.slice(0, 4).map((p) => p.title).join(' · '), owner: 'claude', tab: 'content', level: 'soon' })
  const builtEmails = JOURNEYS.flatMap((j) => j.emails).filter((e) => e.status === 'built')
  if (builtEmails.length) needs.push({ title: `Review ${builtEmails.length} new emails before they’re wired`, detail: 'Copy, timing and who gets them, in Emails', owner: 'you', tab: 'emails', level: 'soon' })
  const reports = n(`SELECT COUNT(*) AS n FROM reports WHERE status = 'open'`)
  if (reports) needs.unshift({ title: `${reports} open player report${reports > 1 ? 's' : ''}`, detail: 'Warn, mute, suspend or dismiss, in Reports', owner: 'you', tab: 'reports', level: 'now' })
  return c.json({
    now,
    launch: { mode: launchModeNow(), at: launchTime(), set: opensAt() !== null },
    needs,
    waitlist: wl.counts,
    days: wl.days,
    sources: wl.sources,
    players: {
      total: n('SELECT COUNT(*) AS n FROM users WHERE profile_done = 1'),
      new24h: n('SELECT COUNT(*) AS n FROM users WHERE profile_done = 1 AND created_at > ?', now - DAY),
      active24h: n('SELECT COUNT(*) AS n FROM users WHERE profile_done = 1 AND last_seen > ?', now - DAY),
    },
    content: { total: posts.length, posted: Object.keys(published).length, approved: posts.filter((p) => p.approved).length, ready: posts.filter((p) => !p.manual).length, toMake: posts.filter((p) => p.manual?.startsWith('to make')).length, source: contentSource() },
    emails: { journeys: JOURNEYS.length, total: JOURNEYS.reduce((a, j) => a + j.emails.length, 0), live: JOURNEYS.flatMap((j) => j.emails).filter((e) => e.status === 'live').length },
    checks: { ok: list.filter((x) => x.state === 'ok').length, total: list.length },
  })
})

hq.get('/launch', async (c) => c.json({ mode: launchModeNow(), at: launchTime(), set: opensAt() !== null, checks: await checks(), timeline: TIMELINE, runbook: RUNBOOK, tasks: TASKS, state: launchState() }))

// the switch: open the city now, at a time, or put it back on the waitlist (landing page, /play and the launch email follow)
const Switch = z.object({ action: z.enum(['open', 'schedule', 'waitlist']), at: z.number().int().optional(), email: z.boolean().default(true) })
hq.get('/switch', (c) => c.json(launchState()))
hq.post('/switch', async (c) => {
  const body = Switch.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ ok: false, error: 'bad-request' }, 400)
  const { action, at, email } = body.data
  if (action === 'schedule' && (!at || at < Date.now() + 60_000)) return c.json({ ok: false, error: 'pick a time at least a minute from now' }, 400)
  const state = setOpening(action === 'open' ? Date.now() : action === 'schedule' ? at! : 'off', email)
  console.log(`[launch] Launch HQ: ${action}${action === 'schedule' ? ` at ${new Date(at!).toISOString()}` : ''} (email on open: ${email ? 'yes' : 'no'})`)
  return c.json({ ok: true, state })
})

hq.get('/emails', (c) =>
  c.json({ journeys: JOURNEYS.map((j) => ({ ...j, emails: j.emails.map(({ content, ...e }) => ({ ...e, subject: content().subject, preheader: content().preheader })) })) }),
)
hq.get('/emails/:id', (c) => {
  const e = journeyEmail(c.req.param('id'))
  return e ? c.html(renderEmail(e.content()).html) : c.text('No such email', 404)
})

hq.get('/content', async (c) => {
  try {
    const { schedule, published } = await readSchedule()
    return c.json({ source: contentSource(), posts: (schedule?.posts ?? []).map((p) => ({ ...p, thumb: thumbOf(p.files) })), published, stats: await igStats(published) })
  } catch (e) {
    return c.json({ source: contentSource(), posts: [], published: {}, stats: {}, error: (e as Error).message })
  }
})
const Approve = z.object({ keys: z.array(z.string().max(80)).min(1).max(200), approved: z.boolean() })
hq.post('/content/approve', async (c) => {
  const body = Approve.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json({ ok: false, error: 'bad-request' }, 400)
  const { schedule, published } = await readSchedule()
  if (!schedule) return c.json({ ok: false, error: 'no-schedule' }, 404)
  let changed = 0
  for (const p of schedule.posts)
    if (body.data.keys.includes(p.key) && !p.manual && !published[p.key] && p.approved !== body.data.approved) {
      p.approved = body.data.approved
      changed++
    }
  if (changed) await writeSchedule(schedule)
  return c.json({ ok: true, changed })
})

hq.get('/video', (c) => c.json({ storyboards: STORYBOARDS }))
hq.get('/playbook', (c) => c.json(PLAYBOOK))
// Mayank's own LinkedIn and X posts, with each attachment's poster frame for the preview
hq.get('/founder', (c) => c.json({ ...FOUNDER, posts: FOUNDER.posts.map((p) => ({ ...p, media: p.media.map((m) => ({ ...m, thumb: thumbOf([m.file]) })) })) }))

// People: how many New Yorkers, and every place an email address comes in (no deep analytics: counts only)
const COLLECT = [
  { key: 'hero', label: 'Landing page, top form', how: 'The first thing on playclubnyc.com: a name and an email, before launch' },
  { key: 'sheet', label: 'Join the Waitlist pop-up', how: 'The header and footer buttons on the landing page open it' },
  { key: 'final', label: 'Landing page, bottom form', how: 'The last section of the landing page' },
  { key: 'soon', label: 'Coming Soon page', how: 'Anyone who opens /play before launch' },
  { key: 'join', label: 'Friend’s invite link', how: '/join/<name>: someone shared their link' },
]
hq.get('/people', (c) => {
  const now = Date.now()
  const wl = waitlistOverview()
  const bySource = new Map(wl.sources.map((r) => [r.source ?? '', r.n]))
  const known = new Set(COLLECT.map((x) => x.key))
  const other = wl.sources.filter((r) => !known.has(r.source ?? '')).reduce((a, r) => a + r.n, 0)
  return c.json({
    players: {
      total: n('SELECT COUNT(*) AS n FROM users WHERE profile_done = 1'),
      new24h: n('SELECT COUNT(*) AS n FROM users WHERE profile_done = 1 AND created_at > ?', now - DAY),
      new7d: n('SELECT COUNT(*) AS n FROM users WHERE profile_done = 1 AND created_at > ?', now - 7 * DAY),
      active24h: n('SELECT COUNT(*) AS n FROM users WHERE profile_done = 1 AND last_seen > ?', now - DAY),
      online: liveSnapshot().online,
      founders: n('SELECT COUNT(*) AS n FROM users WHERE founder_at IS NOT NULL AND profile_done = 1'),
      guests: n('SELECT COUNT(*) AS n FROM users WHERE profile_done = 1 AND is_guest = 1'),
      withEmail: n(`SELECT COUNT(DISTINCT i.user_id) AS n FROM identities i JOIN users u ON u.id = i.user_id WHERE u.profile_done = 1 AND (i.provider = 'email' OR i.email IS NOT NULL)`),
    },
    waitlist: wl.counts,
    days: wl.days,
    collect: [
      ...COLLECT.map((x) => ({ ...x, n: bySource.get(x.key) ?? 0 })),
      ...(other ? [{ key: 'other', label: 'Older forms or unknown', how: 'Sign-ups from before sources were recorded', n: other }] : []),
    ],
    // inside the game: players can save their New Yorker with an email (or Google / X / Discord); that's sign-in, not marketing
    inGame: {
      email: n(`SELECT COUNT(*) AS n FROM identities WHERE provider = 'email'`),
      google: n(`SELECT COUNT(*) AS n FROM identities WHERE provider = 'google'`),
      discord: n(`SELECT COUNT(*) AS n FROM identities WHERE provider = 'discord'`),
      x: n(`SELECT COUNT(*) AS n FROM identities WHERE provider = 'x'`),
    },
    email: wl.email,
  })
})

hq.get('/library', async (c) => {
  const { schedule, published } = await readSchedule().catch(() => ({ schedule: null, published: {} as Published }))
  const posts = schedule?.posts ?? []
  return c.json({ source: contentSource(), items: await library(posts), posts: posts.map(({ key, date, time, title, approved, manual }) => ({ key, date, time, title, approved, manual, posted: !!published[key] })) })
})

// the header's live strip, refreshed every half minute: cheap counts only
hq.get('/pulse', (c) => {
  const now = Date.now()
  const live = liveSnapshot()
  return c.json({
    online: live.online,
    maintenance: live.maintenance,
    reports: n(`SELECT COUNT(*) AS n FROM reports WHERE status = 'open'`),
    errors24h: n('SELECT COUNT(*) AS n FROM client_errors WHERE at > ?', now - DAY),
    waitlist24h: n('SELECT COUNT(*) AS n FROM waitlist WHERE created_at > ? AND unsubscribed_at IS NULL', now - DAY),
    mode: launchModeNow(),
  })
})

// what just happened, newest first: sign-ups, new New Yorkers, reports, moderator actions, crashes and posts
hq.get('/activity', async (c) => {
  const since = Date.now() - 14 * DAY
  type Ev = { at: number; kind: string; text: string; tab: string; ref?: string }
  const ev: Ev[] = []
  for (const r of q.all<{ email: string; name: string | null; source: string | null; created_at: number; confirmed_at: number | null }>('SELECT email, name, source, created_at, confirmed_at FROM waitlist WHERE created_at > ? AND unsubscribed_at IS NULL ORDER BY created_at DESC LIMIT 40', since)) {
    ev.push({ at: r.created_at, kind: 'waitlist', text: `${maskEmail(r.email)} joined the waitlist${r.name ? ` and saved the name ${r.name}` : ''}${r.source ? ` (${r.source})` : ''}`, tab: 'waitlist' })
    if (r.confirmed_at) ev.push({ at: r.confirmed_at, kind: 'confirm', text: `${maskEmail(r.email)} confirmed their email`, tab: 'waitlist' })
  }
  for (const u of q.all<{ id: string; name: string; created_at: number; invited_by: string | null }>('SELECT id, name, created_at, invited_by FROM users WHERE profile_done = 1 AND created_at > ? ORDER BY created_at DESC LIMIT 40', since))
    ev.push({ at: u.created_at, kind: 'player', text: `${u.name} moved in${u.invited_by ? ' from a friend’s link' : ''}`, tab: 'players', ref: u.id })
  for (const r of q.all<{ id: number; reason: string; created_at: number; name: string | null; target: string }>('SELECT r.id, r.reason, r.created_at, r.target, u.name FROM reports r LEFT JOIN users u ON u.id = r.target WHERE r.created_at > ? ORDER BY r.created_at DESC LIMIT 30', since))
    ev.push({ at: r.created_at, kind: 'report', text: `${r.name ?? 'Someone'} was reported: ${r.reason}`, tab: 'reports', ref: r.target })
  for (const a of q.all<{ action: string; reason: string | null; at: number; by: string; name: string | null; target: string }>('SELECT a.action, a.reason, a.at, a.by, a.target, u.name FROM mod_actions a LEFT JOIN users u ON u.id = a.target WHERE a.at > ? ORDER BY a.at DESC LIMIT 30', since))
    ev.push({ at: a.at, kind: 'mod', text: `${a.action} · ${a.name ?? a.target}${a.reason ? `: ${a.reason}` : ''}`, tab: 'players', ref: a.target })
  for (const e of q.all<{ message: string; at: number; n: number }>('SELECT message, MAX(at) AS at, COUNT(*) AS n FROM client_errors WHERE at > ? GROUP BY message ORDER BY at DESC LIMIT 15', since))
    ev.push({ at: e.at, kind: 'crash', text: `Crash report${e.n > 1 ? ` (${e.n}×)` : ''}: ${e.message.slice(0, 120)}`, tab: 'errors' })
  const { schedule, published } = await readSchedule().catch(() => ({ schedule: null, published: {} as Published }))
  const titles = new Map((schedule?.posts ?? []).map((p) => [p.key, p.title]))
  for (const [key, p] of Object.entries(published)) {
    const at = Date.parse(p.at)
    if (at > since) ev.push({ at, kind: 'posted', text: `Posted to Instagram: ${titles.get(key) ?? key}`, tab: 'content', ref: p.permalink })
  }
  ev.sort((a, b) => b.at - a.at)
  return c.json({ events: ev.slice(0, 60) })
})

// a post's picture or video, to look at before approving it: from the bucket (a temporary link) or, in development,
// straight from the render folder (with byte ranges, so videos can seek)
hq.get('/media', (c) => {
  const f = c.req.query('f') ?? ''
  if (!MEDIA.test(f)) return c.text('Not a post file', 400)
  if (bucket()) return c.redirect(presign(`media/${f}`), 302)
  const file = join(REPO, f)
  if (!existsSync(file)) return c.text('Not rendered yet', 404)
  const size = statSync(file).size
  const type = TYPES[f.split('.').pop()!] ?? 'application/octet-stream'
  const range = /bytes=(\d*)-(\d*)/.exec(c.req.header('range') ?? '')
  const start = range?.[1] ? Number(range[1]) : 0
  const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1
  const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream
  const headers = { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': String(end - start + 1), 'cache-control': 'private, max-age=300', ...(range ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}) }
  return new Response(body, { status: range ? 206 : 200, headers })
})
