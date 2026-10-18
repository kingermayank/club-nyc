/**
 * Crash reports: unexpected errors in a player's browser are sent to the server (the moderator
 * dashboard groups them), so we hear about bugs before players have to tell us.
 */
const sent = new Set<string>()
const MAX = 8

function report(message: string, stack?: string) {
  const msg = String(message || 'Unknown error').slice(0, 500)
  if (sent.size >= MAX || sent.has(msg)) return
  // noise from browser extensions and cancelled loads isn't ours to fix
  if (/^Script error\.?$|ResizeObserver loop|chrome-extension:|moz-extension:|AbortError/.test(msg + (stack ?? ''))) return
  sent.add(msg)
  try {
    void fetch('/api/client-errors', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: msg, stack: stack?.slice(0, 4000), url: location.pathname + location.search }),
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {})
  } catch {
    /* reporting must never break the game */
  }
}

export function installErrorReporting() {
  window.addEventListener('error', (e) => report(e.message, e.error instanceof Error ? e.error.stack : undefined))
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason
    report(r instanceof Error ? r.message : String(r), r instanceof Error ? r.stack : undefined)
  })
}
