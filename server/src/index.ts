import { existsSync, readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { Hono, type Context } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { bodyLimit } from 'hono/body-limit'
import { compress } from 'hono/compress'
import { config } from './config.ts'
import { auth, sameOrigin } from './auth.ts'
import { api } from './api.ts'
import { xpApi } from './xp.ts'
import { mpApi } from './game/mp/api.ts'
import { lobbyPreview } from './game/mp/index.ts'
import { MP_GAMES } from '../../app/src/mp/shared/games.ts'
import { admin } from './admin.ts'
import { attachRealtime, shutdownAll } from './game/realtime.ts'
import { q, db } from './db.ts'
import { installGracefulShutdown, startBackups, healthReport } from './ops.ts'
import { rateLimit, byPlayer } from './limits.ts'
import { purgeOld } from './moderation.ts'
import { siteHeaders, staticMtime } from './headers.ts'
import { fillPlaceholders, discordTarget, discordInvite, landingForMode } from './landing.ts'
import { waitlist, launch, launchGate, launchModeNow, playGate } from './waitlist.ts'

const app = new Hono()
// no request body the game sends comes near this (a cloud save is ~20 KB); bigger ones are refused before
// they're read into memory, so a few huge uploads can't balloon the server's RAM
app.use('/api/*', bodyLimit({ maxSize: 512 * 1024, onError: (c) => c.json({ error: 'too-big' }, 413) }))
app.use('/api/*', sameOrigin)
// generous for people, tight for scripts: new accounts are the scarce resource
// (per IP: a launch-night crowd in one dorm or bar can all sign up; a script can't mint thousands)
app.use('/api/auth/guest', rateLimit('guest', 12, 30))
app.use('/api/auth/:p{google|x|discord}', rateLimit('oauth', 20))
app.use('/api/admin/login', rateLimit('admin-login', 5, 5))
app.use('/api/client-errors', rateLimit('errors', 20, 10))
app.use('/api/events', rateLimit('events', 30, 20))
app.use('/api/invite/*', rateLimit('invite', 60, 30))
// the launch waitlist and email sign-in links (each address also has its own limit), and preview-code guesses
app.use('/api/waitlist', rateLimit('waitlist', 10, 5))
app.use('/api/auth/email', rateLimit('email-login', 6, 3))
app.use('/api/launch/preview', rateLimit('preview', 10, 5))
// waitlist mode (LAUNCH_MODE): only testers with the preview code can start a new guest or sign-in
app.use('/api/auth/*', launchGate)
app.use('/api/*', async (c, next) => (c.req.method === 'GET' ? next() : writes(c, next)))
// writes are counted per signed-in player, so everyone behind one shared IP gets their own budget
const writes = rateLimit('writes', 240, 120, byPlayer)
app.route('/api/auth', auth)
app.route('/api/xp', xpApi)
app.route('/api/mp', mpApi)
app.route('/api/waitlist', waitlist)
app.route('/api/launch', launch)
app.route('/api/admin', admin)
app.route('/api', api)
// Railway's health check (and any uptime monitor): 503 while the database is unreachable or we're shutting down
app.get('/api/health', (c) => {
  const h = healthReport(db)
  return c.json(h, h.ok ? 200 : 503)
})

// Production: one process serves the built game, the API and the realtime socket.
if (existsSync(config.staticDir)) {
  const root = config.staticDir
  // security + caching headers on everything below (registered first so it wraps every page and file)
  app.use('*', siteHeaders)
  // pages, the feed and API JSON go out gzipped (built files and fonts already have brotli copies, art is already compressed)
  app.use('*', compress())
  // The landing page is / (index.html); the game is /play (play.html), and invite links open the game directly.
  // Invite links unfurl as "<name> invited you to Club NYC" in chats and social posts.
  const page = readFileSync(join(root, existsSync(join(root, 'play.html')) ? 'play.html' : 'index.html'), 'utf8')
  const abs = (p: string) => `${config.publicUrl}${p}`
  // link previews and search engines need absolute addresses: the canonical URL and the preview images
  const absolute = (html: string, url: string) =>
    html
      .replace('</head>', `  <link rel="canonical" href="${url}" />\n  </head>`)
      .replace(/(property="og:image" content=")\/(?!\/)/, `$1${config.publicUrl}/`)
      .replace(/(name="twitter:image" content=")\/(?!\/)/, `$1${config.publicUrl}/`)
      // structured data: every site link absolute ("url", "image")
      .replace(/("(?:url|image)": ")\//g, `$1${config.publicUrl}/`)
      .replace('<meta property="og:type"', `<meta property="og:url" content="${url}" />\n    <meta property="og:type"`)
  const fill = (html: string, legal = false) =>
    fillPlaceholders(html, { contactEmail: config.contactEmail, companyName: config.companyName, governingState: config.governingState, mailingAddress: config.mailingAddress, legal })
  // waitlist mode (LAUNCH_MODE): the landing page's calls to action become "Join the Waitlist" (landing.ts)
  // both versions are made once; each visit gets the one for the mode right now (LAUNCH_AT can flip it while running)
  const landingHtml = readFileSync(join(root, 'index.html'), 'utf8')
  const landings = { waitlist: fill(absolute(landingForMode(landingHtml, 'waitlist'), abs('/'))), open: fill(absolute(landingForMode(landingHtml, 'open'), abs('/'))) }
  // the policy pages: same fill-in (the company name only once it's really set: they need the legal name)
  for (const name of ['rules', 'privacy', 'terms']) {
    const file = join(root, `${name}.html`)
    if (!existsSync(file)) continue
    const html = fill(readFileSync(file, 'utf8'), true)
    app.get(`/${name}.html`, (c) => c.html(html))
  }
  // "Join the Discord": one address to change (DISCORD_INVITE_URL); until it's set, the page says it opens soon
  app.get('/discord', (c) => c.redirect(discordTarget(config.discordInvite)))
  const withMeta = (title: string, description: string, image: string, url: string, base = page) =>
    base
      .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
      .replace(/(property="og:title" content=")[^"]*/, `$1${title}`)
      .replace(/(name="twitter:title" content=")[^"]*/, `$1${title}`)
      .replace(/(property="og:description" content=")[^"]*/, `$1${description}`)
      .replace(/(name="twitter:description" content=")[^"]*/, `$1${description}`)
      .replace(/(property="og:image" content=")[^"]*/, `$1${abs(image)}`)
      .replace(/(name="twitter:image" content=")[^"]*/, `$1${abs(image)}`)
      .replace('<meta property="og:type"', `<meta property="og:url" content="${url}" />\n    <meta property="og:type"`)
  const game = withMeta('Club NYC: waddle on over to New York', 'A cozy online New York. Make a New Yorker in 30 seconds, work silly jobs, decorate your apartment and meet your friends in Times Square.', '/og/club-nyc.jpg', abs('/play'))
  // Waitlist mode: the Coming Soon page (soon.html: the teaser and the waitlist form) stands in for the game, except
  // for testers who've entered the preview code (PREVIEW_CODE, see waitlist.ts)
  const soonFile = join(root, 'soon.html')
  const soonBase = existsSync(soonFile) ? fill(readFileSync(soonFile, 'utf8')) : null
  const soon = soonBase ? withMeta('Club NYC (Coming Soon)', 'A cozy online New York opens soon. Join the waitlist and we’ll email you the day the doors open.', '/og/club-nyc.jpg', abs('/play'), soonBase) : landings.waitlist
  const gamePage = (c: Context, html: string, soonHtml: string) => {
    const g = playGate(c)
    if (g.redirect) return c.redirect(g.redirect)
    return c.html(g.soon ? soonHtml : html)
  }
  app.get('/join/:name', (c) => {
    const name = c.req.param('name').replace(/[^A-Za-z0-9_]/g, '').slice(0, 14)
    if (!name) return gamePage(c, game, soon)
    return gamePage(
      c,
      withMeta(`${name} invited you to Club NYC`, `${name} is hanging out in a cozy online New York. Make a New Yorker in 30 seconds and you’ll land right next to them.`, '/og/invite.jpg', abs(`/join/${name}`)),
      soonBase ? withMeta(`${name} invited you to Club NYC`, `${name} saved you a spot in a cozy online New York. It opens soon: join the waitlist and we’ll email you the day the doors open.`, '/og/invite.jpg', abs(`/join/${name}`), soonBase) : soon,
    )
  })
  // search engines: the landing page and the policy pages (the game at /play says noindex, so it stays crawlable)
  app.get('/robots.txt', (c) => c.text(`User-agent: *\nDisallow: /api/\nDisallow: /admin.html\nDisallow: /hq.html\n\nSitemap: ${abs('/sitemap.xml')}\n`))
  // the Help Center's pages come from its built search index (one entry per page)
  const helpUrls = (() => {
    try {
      const index = JSON.parse(readFileSync(join(root, 'help/search-index.json'), 'utf8')) as { pages: { u: string }[] }
      return index.pages.map((p) => p.u)
    } catch {
      return []
    }
  })()
  app.get('/sitemap.xml', (c) => {
    const urls = ['/', '/rules.html', '/privacy.html', '/terms.html', ...helpUrls]
      .map((p) => {
        const mtime = staticMtime(root, p === '/' ? '/index.html' : p.startsWith('/help') ? `${p}/index.html` : p)
        return `  <url><loc>${abs(p)}</loc>${mtime ? `<lastmod>${new Date(mtime).toISOString().slice(0, 10)}</lastmod>` : ''}</url>`
      })
      .join('\n')
    return c.body(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`, 200, { 'Content-Type': 'application/xml; charset=utf-8' })
  })
  app.get('/', (c) => c.html(landings[launchModeNow()]))
  // a game's link pasted in Discord (/play?lobby=K7QX) unfurls as that game: who's hosting, how many seats are taken
  app.get('/play', (c) => {
    const p = lobbyPreview(String(c.req.query('lobby') ?? '').slice(0, 8))
    if (!p) return gamePage(c, game, soon)
    const def = MP_GAMES[p.g]
    const host = p.host.replace(/[^A-Za-z0-9_]/g, '')
    return gamePage(c, withMeta(`${host || 'A friend'} invited you to ${def.title}`, `${p.players} of ${p.max} seats taken at ${def.place}. Make a New Yorker in 30 seconds and you’re in the game.`, def.art, abs(`/play?lobby=${p.code}`)), soon)
  })
  app.get('/play/', (c) => gamePage(c, game, soon))
  app.get('/play.html', (c) => gamePage(c, game, soon))
  // Art goes out as WebP to browsers that take it (every current one), about a third of the bytes. tools/webp.py
  // writes "<file>.webp" next to each picture, and the game keeps asking for the .jpg / .png, so nothing else
  // changes. The copies (~30 MB in all) are kept in memory after the first request.
  const webpCache = new Map<string, { mtime: number; body: ArrayBuffer }>()
  app.use('/art/*', async (c, next) => {
    if (!/\.(jpe?g|png)$/i.test(c.req.path) || (c.req.method !== 'GET' && c.req.method !== 'HEAD')) return next()
    const webp = c.req.path + '.webp'
    const mtime = (c.req.header('accept') ?? '').includes('image/webp') ? staticMtime(root, webp) : null
    if (mtime === null) {
      await next()
      c.res.headers.append('Vary', 'Accept')
      return
    }
    const since = Date.parse(c.req.header('if-modified-since') ?? '')
    const headers = { 'Content-Type': 'image/webp', 'Last-Modified': new Date(Math.floor(mtime / 1000) * 1000).toUTCString(), Vary: 'Accept' }
    if (since && Math.floor(mtime / 1000) * 1000 <= since) return c.body(null, 304, headers)
    let hit = webpCache.get(webp)
    if (!hit || hit.mtime !== mtime) {
      const buf = await readFile(join(root, decodeURI(webp)))
      hit = { mtime, body: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer }
      webpCache.set(webp, hit)
    }
    return c.body(hit.body, 200, headers)
  })
  // a browser that already has a file gets "304 Not Modified" (serveStatic sends Last-Modified but never answers it)
  app.use('/*', async (c, next) => {
    const since = Date.parse(c.req.header('if-modified-since') ?? '')
    if (since && (c.req.method === 'GET' || c.req.method === 'HEAD')) {
      const mtime = staticMtime(root, c.req.path)
      if (mtime !== null && Math.floor(mtime / 1000) * 1000 <= since) return c.body(null, 304)
    }
    await next()
  })
  app.use('/*', serveStatic({ root, precompressed: true }))
  // the sled race moved to the High Line (no snow): its old Help Center page sends you to the new one
  for (const old of ['/help/multiplayer-games/sled-race', '/help/multiplayer-games/sled-race/']) app.get(old, (c) => c.redirect('/help/multiplayer-games/citi-bike-dash', 301))
  // an unknown Help Center address gets the Help Center's own "page not found" (with its search box)
  const help404 = existsSync(join(root, 'help/404.html')) ? readFileSync(join(root, 'help/404.html'), 'utf8') : null
  if (help404) app.get('/help/*', (c) => c.html(help404, 404))
  // anything else: the landing page (a 404, so search engines don't index stray addresses)
  app.get('*', (c) => c.html(landings[launchModeNow()], 404))
}

// a production deploy with a missing setting should say so loudly in the logs (search them for WARNING)
if (!config.dev) {
  const warn = (m: string) => console.error(`[config] WARNING: ${m}`)
  if (!process.env.PUBLIC_URL || !config.publicUrl.startsWith('https://'))
    warn(`PUBLIC_URL is "${config.publicUrl}". Set it to your https:// address, or sign-in, secure cookies, invite links and link previews will be wrong.`)
  if (process.env.RAILWAY_ENVIRONMENT && process.env.TRUST_PROXY !== 'true') warn('TRUST_PROXY is not "true": behind Railway every player looks like one address, and sign-up limits will turn people away.')
  if (!config.contactEmail) warn('CONTACT_EMAIL is not set: banned players won’t see where to appeal, and the landing / policy pages show [CONTACT EMAIL].')
  if (!config.companyName) warn('COMPANY_NAME is not set: the privacy policy and terms show [COMPANY NAME].')
  if (!config.governingState || !config.mailingAddress) warn('GOVERNING_STATE / MAILING_ADDRESS are not set: the terms show [GOVERNING STATE] / [MAILING ADDRESS].')
  if (!discordInvite(config.discordInvite)) console.log('[config] DISCORD_INVITE_URL is not set (or not a discord.gg / discord.com/invite link): the Discord buttons say "opens soon".')
  if (!config.adminToken) console.log('[config] ADMIN_TOKEN is not set, so Launch HQ (/hq.html) is off.')
  if (!config.google && !config.x && !config.discord) console.log('[config] No Google / X / Discord keys yet: players can only play as guests.')
}

const server = serve({ fetch: app.fetch, port: config.port }) as Server
attachRealtime(server)
// deploys and restarts: players are told and reconnect on their own; the database is checkpointed and closed cleanly
installGracefulShutdown({ server, db, onShutdown: () => shutdownAll() })
// backups: every 6 h in production (docs/deploy-railway.md); in development only when a moderator asks
startBackups(db, config.dev && !process.env.BACKUP_EVERY_HOURS ? { everyHours: 0 } : {})

// housekeeping: expired sessions, and guests who never finished making a New Yorker
const housekeeping = () => {
  q.run('DELETE FROM sessions WHERE expires_at < ?', Date.now())
  q.run('DELETE FROM users WHERE is_guest = 1 AND profile_done = 0 AND created_at < ?', Date.now() - 86400_000)
  q.run('DELETE FROM game_runs WHERE started_at < ?', Date.now() - 7 * 86400_000)
  // retention promised in the privacy policy: chat 72 h, crash reports 30 days
  purgeOld()
}
housekeeping()
setInterval(housekeeping, 3600_000)

console.log(`[club-nyc] server on http://localhost:${config.port}  (public ${config.publicUrl})`)
console.log(`[club-nyc] sign-in: guest ${config.allowGuests ? 'on' : 'off'} · google ${config.google ? 'on' : 'off'} · x ${config.x ? 'on' : 'off'}`)
