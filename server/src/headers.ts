import { statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import type { MiddlewareHandler } from 'hono'
import { config } from './config.ts'

/**
 * Production response headers for the site (the API's are apiHeaders, below).
 *  - Security: a Content-Security-Policy that only runs our own scripts (defence in depth: player names and
 *    chat are escaped everywhere, and even if one slipped through, injected markup couldn't run code),
 *    no framing (clickjacking), no MIME sniffing, a strict referrer, HTTPS-only once deployed.
 *  - Caching: hashed build files forever, the art for an hour (then a cheap 304), HTML and plain-named
 *    scripts always re-checked so a deploy reaches everyone on their next visit.
 */
const ws = config.publicUrl.replace(/^http/, 'ws')
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // the game sets inline style attributes everywhere; every font is served from our own site
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  // avatars and photo strips are drawn to data:/blob: images
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  `connect-src 'self' ${ws}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')
// Launch HQ previews posts straight from the private social bucket (a short-lived signed link per file), so that
// page alone may load pictures and videos from the bucket's own address
const bucketHost = (() => {
  const e = process.env
  try {
    return e.SOCIAL_S3_ENDPOINT && e.SOCIAL_S3_BUCKET ? `https://${e.SOCIAL_S3_BUCKET}.${new URL(e.SOCIAL_S3_ENDPOINT).host}` : ''
  } catch {
    return ''
  }
})()
const HQ_CSP = bucketHost ? CSP.replace("img-src 'self'", `img-src 'self' ${bucketHost}`).replace("media-src 'self'", `media-src 'self' ${bucketHost}`) : CSP

const HTTPS = config.publicUrl.startsWith('https://')

export const siteHeaders: MiddlewareHandler = async (c, next) => {
  await next()
  if (c.req.path.startsWith('/api/')) return
  const h = c.res.headers
  h.set('X-Content-Type-Options', 'nosniff')
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  h.set('X-Frame-Options', 'DENY')
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  // pages we open in new tabs (the Help Center, a posted reel) can't reach back into this one, and other sites' windows can't either
  h.set('Cross-Origin-Opener-Policy', 'same-origin')
  // a year, subdomains included (www and the mail. sending domain are HTTPS-only or not web at all)
  if (HTTPS) h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
  // pages: "/", "/join/<name>", "/admin.html"… (a 304 has no content type, so look at the path too)
  const page = (h.get('content-type') ?? '').startsWith('text/html') || /\.html$/.test(c.req.path) || !/\.[a-z0-9]+$/i.test(c.req.path)
  if (page) {
    h.set('Content-Security-Policy', c.req.path === '/hq.html' ? HQ_CSP : CSP)
    h.set('Cache-Control', 'no-cache')
  } else if (c.res.status === 200 || c.res.status === 304) {
    // Vite's /assets/ files have a content hash in the name: they never change. Scripts and styles with a plain
    // name (/hq.js, /legal.js) change with every deploy, so they're re-checked each time (a cheap 304) like pages
    h.set('Cache-Control', c.req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : /\.(?:js|css)$/.test(c.req.path) ? 'no-cache' : 'public, max-age=3600')
  }
}

/**
 * The API's answers: JSON about a player is never stored by a browser or proxy (a shared computer, a cache in between),
 * and is never read as anything but its own type. A route that picks its own caching (Launch HQ's videos) keeps it.
 * Only reads get "no-store": browsers never cache a POST's answer anyway, and Chrome holds a no-store answer open
 * until the page reads it, so a fire-and-forget POST (the landing page's /api/events) would never finish.
 */
export const apiHeaders: MiddlewareHandler = async (c, next) => {
  await next()
  const h = c.res.headers
  h.set('X-Content-Type-Options', 'nosniff')
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  if ((c.req.method === 'GET' || c.req.method === 'HEAD') && !h.has('Cache-Control')) h.set('Cache-Control', 'no-store')
}

/** The modification time of a file under `root`, or null (missing, a directory, or a path that tries to escape). */
export function staticMtime(root: string, urlPath: string): number | null {
  let path: string
  try {
    path = decodeURI(urlPath)
  } catch {
    return null
  }
  if (/(?:^|[\/\\])\.{1,2}(?:$|[\/\\])|[\/\\]{2,}|\\/.test(path)) return null
  const base = resolve(root)
  const file = resolve(join(base, path))
  if (file !== base && !file.startsWith(base + sep)) return null
  try {
    const s = statSync(file)
    return s.isFile() ? s.mtimeMs : null
  } catch {
    return null
  }
}
