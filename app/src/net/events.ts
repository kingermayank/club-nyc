import { rest } from './server'
import { analyticsAllowed } from '../consent'

/**
 * Onboarding funnel events → POST /api/events (server/src/api.ts keeps the allowed names).
 * Anonymous per page load, batched, sent with keepalive when the page hides; silent when there's no server.
 * Only sent when this browser allowed analytics (the landing page's cookie banner, ../consent.ts); otherwise dropped.
 */
export type EventName = 'creator_open' | 'look_preset' | 'look_shuffle' | 'look_tweak' | 'look_colour' | 'name_screen' | 'name_wheel' | 'name_typed' | 'creator_done' | 'spawned'
// (the landing page sends landing_view / landing_play / landing_discord / landing_send itself: src/landing/main.ts)

const params = new URLSearchParams(location.search)
const off = params.has('offline') || params.has('profile')
// the landing page's session id when you came from it (same tab), so a visit and the New Yorker it turns into are one journey
const session = (() => {
  try {
    const s = sessionStorage.getItem('club-nyc:session')
    if (s) return s
  } catch {
    /* private mode */
  }
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
})()
let queue: { name: EventName; ms?: number; detail?: string }[] = []
let timer = 0
/** names already sent this page load (the "once" events) */
const sent = new Set<string>()

function flush(keepalive = false) {
  clearTimeout(timer)
  if (!queue.length) return
  const events = queue.slice(0, 20)
  queue = queue.slice(20)
  void rest('/events', { json: { session, events }, keepalive, timeout: 5000 }).catch(() => {})
  if (queue.length) flush(keepalive)
}

/** record one event; `once` drops repeats in this page load (e.g. "tweaked the look at least once") */
export function track(name: EventName, o: { ms?: number; detail?: string; once?: boolean } = {}) {
  if (off || !analyticsAllowed()) return
  const key = o.once ? name + ':' + (o.detail ?? '') : ''
  if (key && sent.has(key)) return
  if (key) sent.add(key)
  queue.push({ name, ...(o.ms !== undefined ? { ms: Math.round(o.ms) } : {}), ...(o.detail ? { detail: o.detail.slice(0, 40) } : {}) })
  clearTimeout(timer)
  timer = window.setTimeout(() => flush(), 2500)
}

addEventListener('pagehide', () => flush(true))
