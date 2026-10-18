import { statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import type { MiddlewareHandler } from 'hono'
import { config } from './config.ts'

/**
 * Production response headers for the site (the API sets its own).
 *  - Security: a Content-Security-Policy that only runs our own scripts (defence in depth: player names and
 *    chat are escaped everywhere, and even if one slipped through, injected markup couldn't run code),
 *    no framing (clickjacking), no MIME sniffing, a strict referrer, HTTPS-only once deployed.
 *  - Caching: hashed build files forever, the art for an hour (then a cheap 304), HTML always re-checked
 *    so a deploy reaches everyone on their next visit.
 */
const ws = config.publicUrl.replace(/^http/, 'ws')
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // the game sets inline style attributes everywhere; Google Fonts serves the web fonts' CSS
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
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

const HTTPS = config.publicUrl.startsWith('https://')

export const siteHeaders: MiddlewareHandler = async (c, next) => {
  await next()
  if (c.req.path.startsWith('/api/')) return
  const h = c.res.headers
  h.set('X-Content-Type-Options', 'nosniff')
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  h.set('X-Frame-Options', 'DENY')
  h.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()')
  if (HTTPS) h.set('Strict-Transport-Security', 'max-age=15552000')
  // pages: "/", "/join/<name>", "/admin.html"… (a 304 has no content type, so look at the path too)
  const page = (h.get('content-type') ?? '').startsWith('text/html') || /\.html$/.test(c.req.path) || !/\.[a-z0-9]+$/i.test(c.req.path)
  if (page) {
    h.set('Content-Security-Policy', CSP)
    h.set('Cache-Control', 'no-cache')
  } else if (c.res.status === 200 || c.res.status === 304) {
    // Vite's /assets/ files have a content hash in the name: they never change
    h.set('Cache-Control', c.req.path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600')
  }
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
