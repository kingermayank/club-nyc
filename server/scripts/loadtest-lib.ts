/**
 * Load-test toolkit shared by scripts/loadtest.ts (quick CLI) and scripts/loadtest-scenarios.ts (launch suite).
 *
 * A bot is a simulated player. It signs up as a guest over REST, opens the game WebSocket, joins a room and
 * then walks / chats / dances / hops rooms like the real client — including the client's reconnect backoff
 * with jitter (app/src/net/socket.ts) and the REST calls it makes on every (re)connect
 * (app/src/net/multiplayer.ts: GET /api/friends + /api/blocks).
 *
 * Bots run in several child processes so the load generator is never the bottleneck: the parent (Cluster)
 * drives them over IPC and merges their stats. Each worker also reports its own event-loop delay so you can
 * tell a slow server from a slow bot.
 */
import { fork, type ChildProcess } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import WebSocket from 'ws'
import { POLICY_VERSION } from '../../app/src/data/policy.ts'

// ---------- shared constants ----------
/** The 8 busy rooms the original load test used (keeps numbers comparable with docs/multiplayer.md). */
export const BUSY_ROOMS = ['times-square', 'soho', 'central-park', 'rockefeller', 'brooklyn-bridge', 'chinatown', 'the-met', 'high-line']
/** Every public room with geometry (room hopping). */
export const ALL_ROOMS = [
  ...BUSY_ROOMS,
  'battery-park', 'broadway', 'chelsea-market', 'coffee', 'empire-deck', 'fifth-ave', 'grand-central', 'iloveny',
  'liberty-island', 'maison-malle', 'parade', 'pizza', 'sneaker-vault', 'subway', 'thread', 'toy-palace',
]
const LINES = ['hi!', 'anyone want pizza?', 'flash mob in 5', 'love this place', 'brb', 'nice outfit', 'lol', 'who is going to the parade?']
/** Lines the chat filter has to clean before anyone else sees them. */
const BAD_LINES = ['visit www.free-coins.com now', 'call me 555-123-4567', 'mail me at bot@example.com', 'fuck this queue', 'you are a b1tch', 'sh1t happens', 'go to http://evil.example/x']
/** What must never reach another player after filtering. */
const LEAK = /(https?:|www\.|\.com\b|@[\w-]+\.|\d{3}[-\s.]\d{3}[-\s.]\d{4}|fuck|bitch|b1tch|shit|sh1t)/i
const TEAMS = ['downtown', 'midtown', 'uptown', 'harbor']
const HAIRS = ['short', 'bob', 'long', 'curly', 'bun', 'ponytail', 'spiky', 'buzz', 'braids']

export type Behavior = 'mixed' | 'chat' | 'hop' | 'idle' | 'soak' | 'none'
export type RestCall = 'leaderboard' | 'leaderboard-all' | 'leaderboard-friends' | 'city' | 'friends' | 'save' | 'online'

// ---------- stats ----------
export interface RestStat {
  lat: number[]
  codes: Record<string, number>
  errs: Record<string, number>
}
export interface Stats {
  workers: number
  bots: number
  inRoom: number
  sent: Record<string, number>
  recvMsgs: number
  recvEvents: number
  recvBytes: number
  /** ping → pong round trip (ms) */
  ping: number[]
  /** own walk intent → own 'm' event back in a room batch (what everyone else sees), ms */
  echoMove: number[]
  echoChat: number[]
  /** 'j' sent → 'w' (welcome) received, ms */
  joinWelcome: number[]
  /** sign-up flow start → in a room ('w'), ms (join burst) */
  timeToRoom: number[]
  chatSeen: number
  chatLeaks: number
  chatLeakSamples: string[]
  chatFiltered: number
  /** own chat lines that came back (= accepted by the server): normal bots / flooders */
  ownChats: number
  floodChats: number
  floodSent: number
  sys: number
  /** every 'sys' notice by its first 40 characters (rate limits, refusals…) */
  sysTexts: Record<string, number>
  /** 'sys' notices about being muted (rejected while muted) / 30-second mutes handed out */
  mutes: number
  muteStarts: number
  kicks: number
  closes: Record<string, number>
  wsErrors: Record<string, number>
  connectFails: number
  reconnects: number
  signup: { ok: number; fail: number; lat: number[]; errs: Record<string, number> }
  rest: Record<string, RestStat>
  /** storm: ms from the storm mark to being back in a room (wall clock) */
  back: number[]
  /** load generator health: worst worker event-loop delay p99 / max in the window, ms */
  eldP99: number
  eldMax: number
}

export const emptyStats = (): Stats => ({
  workers: 0, bots: 0, inRoom: 0, sent: {}, recvMsgs: 0, recvEvents: 0, recvBytes: 0,
  ping: [], echoMove: [], echoChat: [], joinWelcome: [], timeToRoom: [],
  chatSeen: 0, chatLeaks: 0, chatLeakSamples: [], chatFiltered: 0, ownChats: 0, floodChats: 0, floodSent: 0,
  sys: 0, sysTexts: {}, mutes: 0, muteStarts: 0, kicks: 0, closes: {}, wsErrors: {}, connectFails: 0, reconnects: 0,
  signup: { ok: 0, fail: 0, lat: [], errs: {} }, rest: {}, back: [], eldP99: 0, eldMax: 0,
})

const MAX_KEYS = new Set(['eldP99', 'eldMax'])
/** numbers add up, arrays concatenate, objects merge (except the eld* maxima) */
function mergeInto(a: Record<string, unknown>, b: Record<string, unknown>) {
  for (const [k, v] of Object.entries(b)) {
    const cur = a[k]
    if (typeof v === 'number') a[k] = MAX_KEYS.has(k) ? Math.max(Number(cur ?? 0), v) : Number(cur ?? 0) + v
    else if (Array.isArray(v)) {
      const arr = (Array.isArray(cur) ? cur : (a[k] = [])) as unknown[]
      for (const x of v) arr.push(x)
    } else if (v && typeof v === 'object') {
      if (!cur || typeof cur !== 'object') a[k] = {}
      mergeInto(a[k] as Record<string, unknown>, v as Record<string, unknown>)
    }
  }
}
export function mergeStats(list: Stats[]): Stats {
  const out = emptyStats()
  for (const s of list) mergeInto(out as unknown as Record<string, unknown>, s as unknown as Record<string, unknown>)
  out.chatLeakSamples = out.chatLeakSamples.slice(0, 5)
  return out
}

/** n, avg, p50, p95, p99, max of a sample (ms, 0.1 precision) */
export function dist(xs: number[]) {
  if (!xs.length) return { n: 0, avg: null, p50: null, p95: null, p99: null, max: null }
  const s = Float64Array.from(xs).sort()
  const q = (p: number) => r1(s[Math.min(s.length - 1, Math.floor(p * s.length))])
  let sum = 0
  for (const x of s) sum += x
  return { n: s.length, avg: r1(sum / s.length), p50: q(0.5), p95: q(0.95), p99: q(0.99), max: r1(s[s.length - 1]) }
}
export const r1 = (x: number) => Math.round(x * 10) / 10
export const r2 = (x: number) => Math.round(x * 100) / 100
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

// ---------- a realistic cloud save (~20 KB, the shape of app/src/state.ts SaveState) ----------
const ITEMS = ['tee-red', 'tee-blue', 'jeans', 'sneakers', 'hoodie-gray', 'cap-ny', 'boots', 'skirt-plaid', 'jacket-denim', 'scarf-red', 'beanie', 'shades', 'tote', 'chain', 'loafers', 'puffer']
export function makeSave(seed: number, targetKB = 20) {
  const rnd = (n: number) => Math.floor(Math.random() * n)
  const look = { skin: seed % 6, hair: HAIRS[seed % HAIRS.length], hairColor: seed % 10, items: { body: 'tee-red', legs: 'jeans', feet: 'sneakers' } }
  const save: Record<string, unknown> = {
    created: true, name: `bot${seed}`, look, coins: 1200 + rnd(5000), room: 'times-square', muted: false,
    owned: Array.from({ length: 60 }, (_, i) => `${ITEMS[i % ITEMS.length]}-${i}`),
    stamps: Array.from({ length: 30 }, (_, i) => `stamp-${i}-visited-somewhere`),
    visited: ALL_ROOMS.slice(),
    furniture: [] as unknown[],
    storage: Array.from({ length: 20 }, (_, i) => `furn-lamp-${i}`),
    stats: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`stat-${i}`, rnd(999)])),
    lastDaily: '2026-10-16', seenNews: 12, team: TEAMS[seed % 4], title: 'stamp-3-visited-somewhere',
    friends: [], affinity: {} as Record<string, number>, guestbook: [] as unknown[], likes: rnd(50), openHouse: seed % 3 === 0,
    lastHome: Date.now(), signed: {}, liked: {}, challenges: [], notifyOff: false, quests: {}, memberSince: '2026-10-01',
    homes: ['walkup'], home: 'walkup', homeFurniture: {},
  }
  const furniture = save.furniture as unknown[]
  const affinity = save.affinity as Record<string, number>
  const guestbook = save.guestbook as unknown[]
  // grow the lists people actually fill up until we hit the target size
  let size = JSON.stringify(save).length
  for (let i = 0; size < targetKB * 1024; i++) {
    const f = { id: `furn-${ITEMS[i % ITEMS.length]}-${i}`, x: 100 + rnd(800), y: 380 + rnd(150), flip: i % 2 === 0 }
    furniture.push(f)
    affinity[`resident-${i}`] = rnd(100)
    size += JSON.stringify(f).length + `"resident-${i}":99,`.length + 1
    if (i % 3 === 0) {
      const g = { from: `Neighbor_${i}`, text: 'Love the vibe in here! See you at the parade.', at: Date.now() - i * 60000, read: true }
      guestbook.push(g)
      size += JSON.stringify(g).length + 1
    }
  }
  return save
}

// =====================================================================================================
// Worker side: a process that owns a slice of the bots
// =====================================================================================================
let BASE = ''
let WS_URL = ''
let TAG = ''
let XFF = false
let REAL_IP = ''
let S = emptyStats()
const eld = monitorEventLoopDelay({ resolution: 5 })
const bots: Bot[] = []
let stormMark = 0

/** bot names use letters/digits that can't spell anything the profanity filter masks (j m q v x 2 6 9) */
const SAFE = 'jmqvx269'
const enc = (n: number, len = 1) => {
  let s = ''
  do {
    s = SAFE[n % 8] + s
    n = Math.floor(n / 8)
  } while (n > 0)
  return s.padStart(len, SAFE[0])
}
const short = (m: string) => m.replace(/\d+\.\d+\.\d+\.\d+:\d+/g, 'addr').slice(0, 80)
const bump = (rec: Record<string, number>, k: string) => (rec[k] = (rec[k] ?? 0) + 1)
const pick = <T>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)]

function restStat(key: string): RestStat {
  return (S.rest[key] ??= { lat: [], codes: {}, errs: {} })
}

interface Res {
  ok: boolean
  status: number
  headers: Headers
  text: string
}
async function rest(b: Bot | null, method: string, path: string, key: string, body?: string): Promise<Res | null> {
  const t0 = performance.now()
  const headers: Record<string, string> = {}
  if (b?.cookie) headers.cookie = b.cookie
  if (b && XFF) headers['x-forwarded-for'] = b.ip
  if (REAL_IP) headers['x-real-ip'] = REAL_IP
  if (body !== undefined) headers['content-type'] = 'application/json'
  try {
    const r = await fetch(BASE + path, { method, headers, body, signal: AbortSignal.timeout(20000) })
    const text = await r.text()
    const st = restStat(key)
    st.lat.push(performance.now() - t0)
    bump(st.codes, String(r.status))
    return { ok: r.ok, status: r.status, headers: r.headers, text }
  } catch (e) {
    const err = e as Error & { code?: string; cause?: Error & { code?: string } }
    bump(restStat(key).errs, short(err.cause?.code ?? err.code ?? (String(err.cause ?? '') || err.message || err.name)))
    return null
  }
}

class Bot {
  name: string
  ip: string
  cookie = ''
  uid = ''
  ws: WebSocket | null = null
  room = 'times-square'
  inRoom = false
  joinAt = 0
  attempts = 0
  closing = false
  reconnect = false
  flood = false
  badRatio = 0
  welcomed: (() => void) | null = null
  lostAt = 0
  backAt = 0
  pendMove: number[] = []
  pendChat: number[] = []
  saveBody = ''
  private timers = new Map<string, NodeJS.Timeout>()

  constructor(readonly gi: number) {
    this.name = `bot_${TAG}${enc(gi)}`.slice(0, 14)
    this.ip = `10.${(gi >> 16) & 255}.${(gi >> 8) & 255}.${gi & 255}`
  }

  // ----- REST: sign up -----
  async guest(): Promise<boolean> {
    const r = await rest(this, 'POST', '/api/auth/guest', 'POST /api/auth/guest')
    if (!r || !r.ok) return this.fail(`guest ${r?.status ?? 'network'}`)
    this.cookie = (r.headers.get('set-cookie') ?? '').split(';')[0]
    this.uid = (JSON.parse(r.text) as { id: string }).id
    return true
  }
  async profile(): Promise<boolean> {
    const look = { skin: this.gi % 6, hair: HAIRS[this.gi % HAIRS.length], hairColor: this.gi % 10, items: { body: 'tee-red', legs: 'jeans', feet: 'sneakers' } }
    let r = await rest(this, 'POST', '/api/profile', 'POST /api/profile', JSON.stringify({ name: this.name, team: TEAMS[this.gi % 4], look, birth: { m: 1, y: 2000 }, consent: POLICY_VERSION }))
    if (r && (r.status === 409 || r.status === 400)) {
      // name taken by an earlier run against the same database: pick another
      // (every bot confirms 13+, as the creator's checkbox requires for a first profile)
      this.name = `bot_${enc(Math.floor(Math.random() * 8 ** 10), 10)}`
      r = await rest(this, 'POST', '/api/profile', 'POST /api/profile', JSON.stringify({ name: this.name, team: TEAMS[this.gi % 4], look, birth: { m: 1, y: 2000 }, consent: POLICY_VERSION }))
    }
    if (!r || !r.ok) return this.fail(`profile ${r?.status ?? 'network'}`)
    return true
  }
  private fail(why: string) {
    S.signup.fail++
    bump(S.signup.errs, why)
    return false
  }
  /** what "Play now" + the New Yorker creator do, minus the human pauses */
  async signupFast() {
    const t0 = performance.now()
    if ((await this.guest()) && (await this.profile())) {
      S.signup.ok++
      S.signup.lat.push(performance.now() - t0)
      return true
    }
    return false
  }
  /** the full first-visit request sequence of the real client, ending in a room */
  async signupFull(timeoutMs: number) {
    const t0 = performance.now()
    await rest(this, 'GET', '/api/me', 'GET /api/me')
    await Promise.all([rest(this, 'GET', '/api/auth/providers', 'GET /api/auth/providers'), rest(this, 'GET', '/api/online', 'GET /api/online')])
    const s0 = performance.now()
    if (!(await this.guest())) return false
    const guestMs = performance.now() - s0
    await rest(this, 'GET', '/api/me', 'GET /api/me')
    await rest(this, 'GET', `/api/name-available?name=${this.name}`, 'GET /api/name-available')
    const s1 = performance.now()
    if (!(await this.profile())) return false
    S.signup.ok++
    S.signup.lat.push(guestMs + performance.now() - s1)
    void this.putSave(true) // startCloudSync() uploads right away
    try {
      await this.connect(timeoutMs)
      S.timeToRoom.push(performance.now() - t0)
      return true
    } catch {
      return false
    }
  }

  async putSave(small: boolean) {
    if (!this.saveBody) this.saveBody = JSON.stringify({ save: makeSave(this.gi, 20) })
    const body = small ? JSON.stringify({ save: makeSave(this.gi, 2) }) : this.saveBody
    return rest(this, 'PUT', '/api/save', 'PUT /api/save', body)
  }

  // ----- the socket -----
  connect(timeoutMs = 15000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.welcomed = null
        reject(new Error('welcome timeout'))
      }, timeoutMs)
      this.welcomed = () => {
        clearTimeout(timer)
        resolve()
      }
      this.open(() => {
        clearTimeout(timer)
        this.welcomed = null
        reject(new Error('closed before welcome'))
      })
    })
  }

  private open(onEarlyClose?: () => void) {
    this.closing = false
    const headers: Record<string, string> = { cookie: this.cookie }
    if (XFF) headers['x-forwarded-for'] = this.ip
    if (REAL_IP) headers['x-real-ip'] = REAL_IP
    const ws = new WebSocket(WS_URL, { headers, handshakeTimeout: 10000, perMessageDeflate: false })
    this.ws = ws
    let opened = false
    ws.on('open', () => {
      opened = true
      this.attempts = 0
      this.ping()
      this.join(this.room)
      // multiplayer.ts onOpen(): join + refresh friends + blocks
      void rest(this, 'GET', '/api/friends', 'GET /api/friends')
      void rest(this, 'GET', '/api/blocks', 'GET /api/blocks')
    })
    ws.on('message', (d: WebSocket.RawData) => this.onMessage(d as Buffer))
    // connection refused to "localhost" is an AggregateError with an empty message (it tries ::1 and 127.0.0.1)
    ws.on('error', (e: Error & { code?: string }) => bump(S.wsErrors, short(e.message || e.code || e.name)))
    ws.on('close', (code: number) => {
      if (this.ws !== ws) return
      this.ws = null
      this.inRoom = false
      if (this.closing) return
      bump(S.closes, String(code))
      if (!opened) S.connectFails++
      if (!this.lostAt || this.lostAt < stormMark) this.lostAt = Date.now()
      if (this.welcomed && onEarlyClose && !this.reconnect) onEarlyClose()
      if (!this.reconnect || code === 4001) return
      // app/src/net/socket.ts: exponential backoff with ±30% jitter, capped at 10 s
      this.attempts++
      const delay = Math.min(10000, 400 * 2 ** Math.min(this.attempts, 5)) * (0.7 + Math.random() * 0.6)
      // multiplayer.ts: after 3 failures it checks the session is still valid
      if (this.attempts === 3) void rest(this, 'GET', '/api/me', 'GET /api/me')
      this.timers.set('reconnect', setTimeout(() => {
        S.reconnects++
        this.open()
      }, delay))
    })
  }

  private onMessage(d: Buffer) {
    const now = performance.now()
    S.recvMsgs++
    S.recvBytes += d.length
    let evts: { t: string; [k: string]: unknown }[]
    try {
      evts = JSON.parse(String(d))
    } catch {
      return
    }
    for (const e of evts) {
      S.recvEvents++
      switch (e.t) {
        case 'w':
          this.uid = String(e.me)
          this.inRoom = true
          if (this.joinAt) S.joinWelcome.push(now - this.joinAt)
          this.joinAt = 0
          if (stormMark && this.lostAt >= stormMark && !this.backAt) {
            this.backAt = Date.now()
            S.back.push(this.backAt - stormMark)
          }
          this.welcomed?.()
          this.welcomed = null
          break
        case 'pong':
          if (typeof e.c === 'number' && e.c > 0) S.ping.push(now - e.c)
          break
        case 'm':
          if (e.i === this.uid) {
            const t = this.pendMove.shift()
            if (t) S.echoMove.push(now - t)
          }
          break
        case 's': {
          const m = String(e.m)
          if (e.i === this.uid) {
            if (this.flood) S.floodChats++
            else {
              // only lines sent since the last stats reset count (the FIFO is cleared on reset)
              const t = this.pendChat.shift()
              if (t) {
                S.ownChats++
                S.echoChat.push(now - t)
              }
            }
          } else {
            S.chatSeen++
            if (/removed|★/.test(m)) S.chatFiltered++
            if (LEAK.test(m)) {
              S.chatLeaks++
              if (S.chatLeakSamples.length < 5) S.chatLeakSamples.push(m)
            }
          }
          break
        }
        case 'sys':
          S.sys++
          bump(S.sysTexts, String(e.m).slice(0, 40))
          if (/muted for 30/i.test(String(e.m))) S.muteStarts++
          else if (/muted/i.test(String(e.m))) S.mutes++
          break
        case 'kick':
          S.kicks++
          break
      }
    }
  }

  send(m: { t: string; [k: string]: unknown }) {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    ws.send(JSON.stringify(m))
    bump(S.sent, m.t)
    return true
  }
  ping() {
    this.send({ t: 'ping', c: performance.now() })
  }
  join(room: string, owner?: string) {
    this.room = room
    this.inRoom = false
    this.joinAt = performance.now()
    this.send({ t: 'j', r: room, x: 400 + Math.random() * 200, y: 450, ...(owner ? { o: owner } : {}) })
  }
  move() {
    const now = performance.now()
    // a lost echo (rate-limited / room change) must not skew the next sample
    while (this.pendMove.length && now - this.pendMove[0] > 3000) this.pendMove.shift()
    if (this.send({ t: 'm', x: 100 + Math.random() * 800, y: 380 + Math.random() * 150 })) this.pendMove.push(now)
  }
  say(text: string) {
    const now = performance.now()
    while (this.pendChat.length && now - this.pendChat[0] > 3000) this.pendChat.shift()
    if (this.send({ t: 's', m: text })) {
      if (this.flood) S.floodSent++
      else this.pendChat.push(now)
    }
  }
  /** the original load test's mix: several times busier than a real player */
  mixed() {
    if (!this.inRoom) return
    const r = Math.random()
    if (r < 0.55) this.move()
    else if (r < 0.7) this.say(pick(LINES))
    else if (r < 0.8) this.send({ t: 'p', p: 'dance' })
    else if (r < 0.9) this.send({ t: 'e', e: '🍕' })
    else this.ping()
  }
  hop() {
    if (!this.ws) return
    const r = Math.random()
    if (r < 0.1) this.join('apartment') // home
    else if (r < 0.15) {
      const other = pick(bots)
      this.join('apartment', other.uid || undefined) // visiting a neighbour
    } else {
      let room = pick(ALL_ROOMS)
      if (room === this.room) room = pick(ALL_ROOMS)
      this.join(room)
    }
  }

  private every(name: string, first: number, next: () => number, fn: () => void) {
    const run = () => {
      this.timers.set(name, setTimeout(run, next()))
      fn()
    }
    this.timers.set(name, setTimeout(run, first))
  }
  stopBehavior() {
    for (const [k, t] of this.timers) if (k !== 'reconnect') clearTimeout(t)
    const rc = this.timers.get('reconnect')
    this.timers.clear()
    if (rc) this.timers.set('reconnect', rc)
  }
  behave(kind: Behavior) {
    this.stopBehavior()
    const r = Math.random
    const act = () => 1500 + r() * 2500
    switch (kind) {
      case 'mixed':
        this.every('act', r() * 2500, act, () => this.mixed())
        break
      case 'chat':
        // max sustainable rate is 0.7/s: chat every 1.45–1.65 s; flooders go ~3.3/s
        if (this.flood) this.every('chat', r() * 1000, () => 280 + r() * 60, () => this.inRoom && this.say(pick(LINES)))
        else this.every('chat', r() * 1500, () => 1450 + r() * 200, () => this.inRoom && this.say(r() < this.badRatio ? pick(BAD_LINES) : pick(LINES)))
        this.every('ping', r() * 15000, () => 15000, () => this.ping())
        break
      case 'hop':
        this.every('act', r() * 2500, act, () => this.mixed())
        this.every('hop', 3000 + r() * 3000, () => 3000 + r() * 3000, () => this.hop())
        break
      case 'idle':
        this.every('ping', r() * 15000, () => 15000, () => this.ping())
        break
      case 'soak':
        this.every('act', r() * 2500, act, () => (r() < 0.03 ? this.hop() : this.mixed()))
        this.every('ping', r() * 15000, () => 15000, () => this.ping())
        this.every('save', r() * 60000, () => 50000 + r() * 20000, () => void this.putSave(false))
        this.every('online', r() * 60000, () => 60000, () => void rest(this, 'GET', '/api/online', 'GET /api/online'))
        break
      case 'none':
        break
    }
  }
  close() {
    this.stopBehavior()
    const rc = this.timers.get('reconnect')
    if (rc) clearTimeout(rc)
    this.timers.clear()
    this.closing = true
    this.ws?.close()
  }
}

async function pool<T>(items: T[], concurrency: number, fn: (x: T) => Promise<unknown>) {
  let i = 0
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
      while (i < items.length) await fn(items[i++])
    }),
  )
}

const REST_CALLS: Record<RestCall, (b: Bot) => Promise<unknown>> = {
  leaderboard: (b) => rest(b, 'GET', '/api/leaderboard/ferry-captain', 'GET /api/leaderboard/:game'),
  'leaderboard-all': (b) => rest(b, 'GET', '/api/leaderboard/ferry-captain?period=all', 'GET /api/leaderboard/:game?period=all'),
  'leaderboard-friends': (b) => rest(b, 'GET', '/api/leaderboard/ferry-captain?scope=friends', 'GET /api/leaderboard/:game?scope=friends'),
  city: (b) => rest(b, 'GET', '/api/city', 'GET /api/city'),
  friends: (b) => rest(b, 'GET', '/api/friends', 'GET /api/friends'),
  save: (b) => b.putSave(false),
  online: (b) => rest(b, 'GET', '/api/online', 'GET /api/online'),
}

type Cmd = { id: number; cmd: string; [k: string]: unknown }
async function handle(m: Cmd): Promise<unknown> {
  switch (m.cmd) {
    case 'init':
      BASE = String(m.base)
      WS_URL = BASE.replace(/^http/, 'ws') + '/ws'
      TAG = enc(Number(m.tag) % 8 ** 5, 5)
      XFF = !!m.xff
      REAL_IP = String(m.realIp ?? '')
      return true
    case 'signup': {
      // bots get global indexes offset..offset+count-1; with spreadMs, bot g starts at g/total*spread
      const count = Number(m.count)
      const offset = Number(m.offset)
      const fresh = Array.from({ length: count }, (_, k) => new Bot(offset + k))
      for (const b of fresh) b.room = String(m.room ?? 'times-square')
      const ok: Bot[] = []
      if (m.flow === 'full') {
        const t0 = Date.now()
        await Promise.all(
          fresh.map(async (b) => {
            await sleep(t0 + (b.gi / Number(m.total)) * Number(m.spreadMs) - Date.now())
            if (await b.signupFull(Number(m.timeoutMs ?? 30000))) ok.push(b)
          }),
        )
      } else {
        await pool(fresh, Number(m.concurrency ?? 20), async (b) => {
          if (await b.signupFast()) ok.push(b)
        })
      }
      bots.push(...ok)
      return { ok: ok.length, fail: count - ok.length }
    }
    case 'connect': {
      const spread = Number(m.spreadMs ?? 3000)
      const timeout = Number(m.timeoutMs ?? 20000)
      const todo = bots.filter((b) => !b.ws)
      let ok = 0
      await Promise.all(
        todo.map(async (b) => {
          if (m.room !== 'keep') b.room = m.room === 'random' ? BUSY_ROOMS[b.gi % BUSY_ROOMS.length] : String(m.room)
          await sleep(Math.random() * spread)
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              await b.connect(timeout)
              ok++
              return
            } catch {
              b.close()
              await sleep(500 + Math.random() * 1000)
            }
          }
        }),
      )
      return { ok, fail: todo.length - ok }
    }
    case 'behave':
      for (const b of bots) {
        b.flood = Math.random() < Number(m.flooders ?? 0)
        b.badRatio = Number(m.badRatio ?? 0)
        b.behave(m.kind as Behavior)
      }
      return true
    case 'reconnect':
      for (const b of bots) b.reconnect = !!m.on
      return true
    case 'mark':
      stormMark = Number(m.at)
      for (const b of bots) b.backAt = 0
      return true
    case 'status':
      return { bots: bots.length, inRoom: bots.filter((b) => b.inRoom).length, open: bots.filter((b) => b.ws?.readyState === WebSocket.OPEN).length, back: bots.filter((b) => b.backAt).length }
    case 'stats': {
      const out = S
      out.workers = 1
      out.bots = bots.length
      out.inRoom = bots.filter((b) => b.inRoom).length
      out.eldP99 = eld.percentile(99) / 1e6
      out.eldMax = eld.max / 1e6
      if (m.reset) {
        S = emptyStats()
        eld.reset()
        for (const b of bots) {
          b.pendChat.length = 0
          b.pendMove.length = 0
        }
      }
      return out
    }
    case 'befriend': {
      // a ring: each bot asks the next k bots in its worker, they accept → ~2k friends each
      const k = Number(m.k)
      const pairs: [Bot, Bot][] = []
      for (let i = 0; i < bots.length; i++) for (let j = 1; j <= k; j++) pairs.push([bots[i], bots[(i + j) % bots.length]])
      let made = 0
      await pool(pairs, 20, async ([a, b]) => {
        if (a === b) return
        const r1 = await rest(a, 'POST', `/api/friends/${b.uid}`, 'POST /api/friends/:id')
        const r2 = r1?.ok ? await rest(b, 'POST', `/api/friends/${a.uid}/accept`, 'POST /api/friends/:id/accept') : null
        if (r2?.ok) made++
      })
      return { made }
    }
    case 'rest': {
      // closed loop: `concurrency` virtual users, each fires its next request when the last one returns
      const mix = m.mix as [RestCall, number][]
      const total = mix.reduce((a, [, w]) => a + w, 0)
      const end = performance.now() + Number(m.ms)
      const choose = () => {
        let x = Math.random() * total
        for (const [k, w] of mix) if ((x -= w) < 0) return k
        return mix[0][0]
      }
      const think = Number(m.thinkMs ?? 0)
      const own = !!m.ownBot // one virtual user per bot instead of random sessions
      await Promise.all(
        Array.from({ length: own ? bots.length : Number(m.concurrency) }, async (_, i) => {
          while (performance.now() < end) {
            await REST_CALLS[choose()](own ? bots[i] : pick(bots))
            if (think) await sleep(think * (0.8 + Math.random() * 0.4))
          }
        }),
      )
      return true
    }
    case 'leak': {
      // every bot joins an apartment perSec times a second: owners 'fake' = made-up owner ids,
      // 'real' = other bots' apartments (real accounts, mostly nobody home)
      const end = performance.now() + Number(m.ms)
      const real = m.owners === 'real'
      let sent = 0
      await Promise.all(
        bots.slice(0, Number(m.limit ?? bots.length)).map(async (b) => {
          while (performance.now() < end) {
            const owner = real ? pick(bots).uid : `leak-${Math.random().toString(36).slice(2, 14)}`
            if (b.send({ t: 'j', r: 'apartment', x: 500, y: 460, o: owner })) sent++
            await sleep(1000 / Number(m.perSec))
          }
        }),
      )
      return { sent }
    }
    case 'join':
      for (const b of bots) b.join(String(m.room))
      return true
    case 'stop':
      for (const b of bots) b.stopBehavior()
      return true
    case 'close':
      for (const b of bots) b.close()
      setTimeout(() => process.exit(0), 300)
      return true
  }
  throw new Error(`unknown command ${m.cmd}`)
}

if (process.env.LOADTEST_WORKER === '1') {
  eld.enable()
  process.on('message', (raw: unknown) => {
    const m = raw as Cmd
    handle(m).then(
      (data) => process.send?.({ id: m.id, ok: true, data }),
      (e: Error) => process.send?.({ id: m.id, ok: false, error: e.message }),
    )
  })
  process.on('disconnect', () => process.exit(0))
}

// =====================================================================================================
// Parent side: a cluster of worker processes
// =====================================================================================================
export class Cluster {
  private kids: ChildProcess[] = []
  private seq = 0
  private waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  private constructor(readonly base: string) {}

  /** `workers` defaults to one per 250 bots (at most 24) */
  /** xff: every bot sends its own made-up X-Forwarded-For; realIp: every request carries this X-Real-IP (as Railway's edge sets it) */
  static async start(o: { base: string; bots: number; workers?: number; xff?: boolean; realIp?: string }) {
    const c = new Cluster(o.base)
    const n = o.workers ?? Math.min(24, Math.max(1, Math.ceil(o.bots / 250)))
    const tag = Math.floor(Math.random() * 8 ** 5)
    for (let w = 0; w < n; w++) {
      const kid = fork(fileURLToPath(import.meta.url), [], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: { ...process.env, LOADTEST_WORKER: '1' },
        stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      })
      kid.on('message', (raw: unknown) => {
        const m = raw as { id: number; ok: boolean; data?: unknown; error?: string }
        const p = c.waiting.get(m.id)
        if (!p) return
        c.waiting.delete(m.id)
        if (m.ok) p.resolve(m.data)
        else p.reject(new Error(m.error))
      })
      c.kids.push(kid)
    }
    await c.all({ cmd: 'init', base: o.base, tag, xff: !!o.xff, realIp: o.realIp ?? '' })
    return c
  }
  get size() {
    return this.kids.length
  }
  private ask(kid: ChildProcess, msg: object): Promise<unknown> {
    const id = ++this.seq
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { resolve, reject })
      kid.send({ ...msg, id })
    })
  }
  each<T = unknown>(f: (w: number) => object): Promise<T[]> {
    return Promise.all(this.kids.map((k, w) => this.ask(k, f(w)) as Promise<T>))
  }
  all<T = unknown>(msg: object): Promise<T[]> {
    return this.each<T>(() => msg)
  }
  /** split n bots across the workers: [count, offset] for worker w */
  private split(n: number, w: number): [number, number] {
    const per = Math.floor(n / this.kids.length)
    const extra = n % this.kids.length
    const count = per + (w < extra ? 1 : 0)
    const offset = w * per + Math.min(w, extra)
    return [count, offset]
  }
  async signup(n: number, o: { flow?: 'fast' | 'full'; spreadMs?: number; room?: string; concurrency?: number; timeoutMs?: number } = {}) {
    const per = await this.each<{ ok: number; fail: number }>((w) => {
      const [count, offset] = this.split(n, w)
      return { cmd: 'signup', count, offset, total: n, flow: o.flow ?? 'fast', spreadMs: o.spreadMs ?? 0, room: o.room ?? 'times-square', concurrency: o.concurrency ?? 20, timeoutMs: o.timeoutMs }
    })
    return { ok: per.reduce((a, p) => a + p.ok, 0), fail: per.reduce((a, p) => a + p.fail, 0) }
  }
  async connect(room: string, spreadMs = 3000, timeoutMs = 20000) {
    const per = await this.all<{ ok: number; fail: number }>({ cmd: 'connect', room, spreadMs, timeoutMs })
    return { ok: per.reduce((a, p) => a + p.ok, 0), fail: per.reduce((a, p) => a + p.fail, 0) }
  }
  behave(kind: Behavior, o: { flooders?: number; badRatio?: number } = {}) {
    return this.all({ cmd: 'behave', kind, ...o })
  }
  async stats(reset = false): Promise<Stats> {
    return mergeStats(await this.all<Stats>({ cmd: 'stats', reset }))
  }
  async status() {
    const per = await this.all<{ bots: number; inRoom: number; open: number; back: number }>({ cmd: 'status' })
    return per.reduce((a, p) => ({ bots: a.bots + p.bots, inRoom: a.inRoom + p.inRoom, open: a.open + p.open, back: a.back + p.back }), { bots: 0, inRoom: 0, open: 0, back: 0 })
  }
  async close() {
    await Promise.race([this.all({ cmd: 'close' }).catch(() => {}), sleep(3000)])
    for (const k of this.kids) if (k.exitCode === null) k.kill()
  }
}
