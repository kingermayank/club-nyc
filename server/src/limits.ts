import type { Context, MiddlewareHandler } from 'hono'
import { getConnInfo } from '@hono/node-server/conninfo'
import { createHash } from 'node:crypto'
import { getCookie } from 'hono/cookie'
import { config } from './config.ts'

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/**
 * Per-IP token buckets for the REST API (the realtime socket has its own per-player buckets).
 * In-memory is right for one process; with several, move these counters to Redis (INCR + EXPIRE).
 */
interface Bucket {
  tokens: number
  at: number
}
const buckets = new Map<string, Bucket>()

const TRUST_PROXY = process.env.TRUST_PROXY === 'true'
export function clientIp(c: Context): string {
  if (TRUST_PROXY) {
    // Railway's edge sets X-Real-IP to the caller; X-Forwarded-For is the fallback for other proxies
    const real = c.req.header('x-real-ip')?.trim()
    if (real) return real
    const fwd = c.req.header('x-forwarded-for')
    if (fwd) return fwd.split(',')[0].trim()
  }
  try {
    return getConnInfo(c).remote.address ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

/** Who a limit applies to: the signed-in player (so a dorm or café behind one IP doesn't share a budget), else the IP. */
export const byPlayer = (c: Context) => {
  const sid = getCookie(c, 'club_sid')
  return sid ? `p:${createHash('sha256').update(sid).digest('base64url').slice(0, 22)}` : `ip:${clientIp(c)}`
}
export const byIp = (c: Context) => `ip:${clientIp(c)}`

/** `perMinute` sustained, bursts up to `burst`, per IP (or per `keyOf`). */
export function rateLimit(name: string, perMinute: number, burst = perMinute, keyOf: (c: Context) => string = byIp): MiddlewareHandler {
  const rate = perMinute / 60000
  return async (c, next) => {
    const ip = clientIp(c)
    // local development (the Vite proxy, load tests) is all loopback traffic
    if (config.dev && LOOPBACK.has(ip)) return next()
    const key = `${name}:${keyOf(c)}`
    const now = Date.now()
    const b = buckets.get(key) ?? { tokens: burst, at: now }
    b.tokens = Math.min(burst, b.tokens + (now - b.at) * rate)
    b.at = now
    if (b.tokens < 1) {
      buckets.set(key, b)
      c.header('Retry-After', String(Math.ceil((1 - b.tokens) / rate / 1000)))
      return c.json({ error: 'slow-down' }, 429)
    }
    b.tokens -= 1
    buckets.set(key, b)
    await next()
  }
}

// forget idle buckets
setInterval(() => {
  const cutoff = Date.now() - 10 * 60000
  for (const [k, b] of buckets) if (b.at < cutoff) buckets.delete(k)
}, 60000).unref()
