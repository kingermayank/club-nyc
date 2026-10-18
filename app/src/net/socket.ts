import type { C2S, S2C } from './protocol'

/**
 * One WebSocket to the game server, with automatic reconnects (exponential backoff + jitter).
 * The server sends JSON arrays of events (one batch per tick).
 */
type Why = 'lost' | 'failed' | 'replaced'
const listeners: ((e: S2C) => void)[] = []
const openers: (() => void)[] = []
const closers: ((why: Why) => void)[] = []
let ws: WebSocket | null = null
let stopped = true
let attempts = 0
let retry = 0
let pinger = 0

export const sock = {
  rtt: 0,
  get connected() {
    return ws?.readyState === WebSocket.OPEN
  },
  get failures() {
    return attempts
  },
  start() {
    if (!stopped) return
    stopped = false
    attempts = 0
    connect()
  },
  stop() {
    stopped = true
    clearTimeout(retry)
    clearInterval(pinger)
    const s = ws
    ws = null
    s?.close()
  },
  send(m: C2S) {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m))
  },
  on: (f: (e: S2C) => void) => void listeners.push(f),
  onOpen: (f: () => void) => void openers.push(f),
  onClose: (f: (why: Why) => void) => void closers.push(f),
}

function connect() {
  if (stopped) return
  const s = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`)
  ws = s
  let opened = false
  s.onopen = () => {
    opened = true
    attempts = 0
    clearInterval(pinger)
    pinger = window.setInterval(() => sock.send({ t: 'ping', c: performance.now() }), 15000)
    sock.send({ t: 'ping', c: performance.now() })
    openers.forEach((f) => f())
  }
  s.onmessage = (ev) => {
    let evts: S2C[]
    try {
      evts = JSON.parse(String(ev.data))
    } catch {
      return
    }
    for (const e of evts) {
      if (e.t === 'pong') sock.rtt = Math.round(performance.now() - e.c)
      for (const f of listeners) {
        try {
          f(e)
        } catch (err) {
          console.error('[net] handler', e.t, err)
        }
      }
    }
  }
  s.onclose = (ev) => {
    if (ws !== s) return
    ws = null
    clearInterval(pinger)
    const why: Why = ev.code === 4001 ? 'replaced' : opened ? 'lost' : 'failed'
    closers.forEach((f) => f(why))
    if (stopped || why === 'replaced') return
    attempts++
    const delay = Math.min(10000, 400 * 2 ** Math.min(attempts, 5)) * (0.7 + Math.random() * 0.6)
    retry = window.setTimeout(connect, delay)
  }
}
