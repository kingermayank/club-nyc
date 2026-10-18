import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { WebSocketServer, WebSocket } from 'ws'
import { config } from '../config.ts'
import { q, type UserRow } from '../db.ts'
import { parseCookie, SESSION_COOKIE, userForToken } from '../auth.ts'
import { cleanChat } from './filter.ts'
import { walkTarget, knownRoom, validSeat, spawnOf } from './geo.ts'
import { validLook, TEAMS } from './rules.ts'
import { ensureWallet, ownedLook, type Wallet } from '../economy.ts'
import { banOf, muteOf, logChat } from '../moderation.ts'
import { settleReferrals } from '../referrals.ts'
import { EMOTES, POSES, PARTY_THEMES, HOME_ROOM_IDS, type C2S, type S2C, type LookWire, type PlayerWire, type PartyWire } from '../../../app/src/net/protocol.ts'

/**
 * The live world.
 *
 * - Every room (Times Square, SoHo, …) is split into INSTANCES of at most ROOM_CAP players
 *   ("Times Square", "Times Square 2"…). New arrivals join the instance with the most of their
 *   friends, else the busiest one that still has space — rooms feel full, never overloaded.
 * - Clients send intents; the server validates, rate-limits and queues events per instance.
 *   Every TICK_MS the queue is serialised ONCE and the same string goes to everyone in it.
 * - Slow consumers (huge send buffers) are dropped rather than slowing the room down.
 * - One connection per account: a second tab replaces the first.
 *
 * For more than one server process, Presence + the per-instance queues move to Redis
 * (pub/sub channel per instance, hash per user). See docs/multiplayer.md.
 */

// ---------- token buckets ----------
class Bucket {
  private tokens: number
  private last = Date.now()
  private readonly rate: number
  private readonly burst: number
  constructor(rate: number, burst: number) {
    this.rate = rate
    this.burst = burst
    this.tokens = burst
  }
  take(): boolean {
    const now = Date.now()
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate)
    this.last = now
    if (this.tokens < 1) return false
    this.tokens -= 1
    return true
  }
}

interface Client {
  id: string
  name: string
  look: LookWire
  team: string
  title: string
  ws: WebSocket
  inst: Instance | null
  x: number
  y: number
  pose: string
  seat: string | null
  friends: Set<string>
  blocked: Set<string>
  b: { move: Bucket; say: Bucket; act: Bucket; snow: Bucket; msg: Bucket; hop: Bucket }
  mutedUntil: number
  strikes: number
  alive: boolean
  /** what this player owns (looks are checked against it) */
  wallet: Wallet
  /** a moderator's (or the auto-moderator's) chat mute */
  modMute: number
  modMuteReason: string
  /** play time not yet written to the database */
  since: number
}

interface Instance {
  key: string // "times-square" or "apartment@<owner>"
  room: string // geo room id
  n: number // 1, 2, 3…
  clients: Map<string, Client>
  queue: S2C[]
}

const instances = new Map<string, Instance[]>()
const HOME_ROOMS = new Set<string>(HOME_ROOM_IDS)
/** house parties by host id (the party lives in the host's own home instance) */
const parties = new Map<string, PartyWire & { key: string; room: string; until: number }>()
const PARTY_MAX_MS = 60 * 60 * 1000
const THEME_SET = new Set<string>(PARTY_THEMES)
const clients = new Map<string, Client>()
const offlineTimers = new Map<string, NodeJS.Timeout>()

export const stats = { msgsIn: 0, msgsOut: 0, bytesOut: 0, flushes: 0, flushMs: 0, dropped: 0 }

const wire = (c: Client): PlayerWire => ({ i: c.id, n: c.name, l: c.look, t: c.team, ti: c.title, x: c.x, y: c.y, p: c.pose, s: c.seat })

// ---------- sending ----------
const MAX_BUFFER = 1 << 20
/** `msg` may be a pre-encoded UTF-8 Buffer (room batches are encoded once, not once per player). */
function sendRaw(c: Client, msg: string | Buffer) {
  const ws = c.ws
  if (ws.readyState !== WebSocket.OPEN) return
  if (ws.bufferedAmount > MAX_BUFFER) {
    stats.dropped++
    ws.terminate()
    return
  }
  ws.send(msg, { binary: false })
  stats.msgsOut++
  stats.bytesOut += msg.length
}
const direct = (c: Client, ...evts: S2C[]) => sendRaw(c, JSON.stringify(evts))
const emit = (inst: Instance | null, evt: S2C) => inst?.queue.push(evt)

let headcountSent = 0
let headcountAt = 0
function flush() {
  const t0 = performance.now()
  // the city's headcount rides along with the next batch whenever it changes (≤ every 2 s)
  if (clients.size !== headcountSent && t0 - headcountAt > 2000) {
    headcountSent = clients.size
    headcountAt = t0
    for (const list of instances.values()) for (const inst of list) if (inst.clients.size) inst.queue.push({ t: 'o', n: clients.size })
  }
  for (const list of instances.values()) {
    for (const inst of list) {
      if (!inst.queue.length) continue
      const msg = Buffer.from(JSON.stringify(inst.queue))
      inst.queue.length = 0
      for (const c of inst.clients.values()) sendRaw(c, msg)
    }
  }
  stats.flushes++
  stats.flushMs += performance.now() - t0
}

// ---------- presence & friends ----------
export function presenceOf(userId: string): { online: boolean; room: string | null; inst: number } {
  const c = clients.get(userId)
  return c ? { online: true, room: c.inst?.room ?? null, inst: c.inst?.n ?? 0 } : { online: false, room: null, inst: 0 }
}
export const onlineCount = () => clients.size
export function roomCounts(): Record<string, number> {
  const out: Record<string, number> = {}
  for (const c of clients.values()) if (c.inst && !c.inst.key.includes('@')) out[c.inst.room] = (out[c.inst.room] ?? 0) + 1
  return out
}

function loadFriends(userId: string): Set<string> {
  const rows = q.all<{ other: string }>(
    `SELECT CASE WHEN a = ? THEN b ELSE a END AS other FROM friends WHERE (a = ? OR b = ?) AND status = 'accepted'`,
    userId, userId, userId,
  )
  return new Set(rows.map((r) => r.other))
}
const loadBlocked = (userId: string) => new Set(q.all<{ b: string }>('SELECT b FROM blocks WHERE a = ?', userId).map((r) => r.b))

function tellFriends(c: Client, on: boolean) {
  const evt: S2C = { t: 'f', i: c.id, n: c.name, on, r: on ? c.inst?.room ?? null : null }
  for (const fid of c.friends) {
    const f = clients.get(fid)
    if (f) direct(f, evt)
  }
}

/** Called by the REST API when friendships change, so live sessions stay in sync. */
export function friendshipChanged(a: string, b: string, kind: 'request' | 'accepted' | 'removed', name: string) {
  const ca = clients.get(a)
  const cb = clients.get(b)
  if (kind === 'request' && cb) direct(cb, { t: 'fr', i: a, n: name })
  if (kind === 'accepted') {
    ca?.friends.add(b)
    cb?.friends.add(a)
    if (ca) direct(ca, { t: 'fa', i: b, n: cb?.name ?? '' })
    if (ca && cb) direct(cb, { t: 'f', i: a, n: ca.name, on: true, r: ca.inst?.room ?? null })
  }
  if (kind === 'removed') {
    ca?.friends.delete(b)
    cb?.friends.delete(a)
  }
}
/** Push an async social notification (guestbook note, like) to someone if they're online. */
export function notifyUser(userId: string, evt: S2C) {
  const c = clients.get(userId)
  if (c) direct(c, evt)
}

/** The city at a glance: how many people are in each public room, with a few faces. */
export function cityPulse(): Record<string, { n: number; faces: { n: string; l: LookWire }[] }> {
  const out: Record<string, { n: number; faces: { n: string; l: LookWire }[] }> = {}
  for (const c of clients.values()) {
    if (!c.inst || c.inst.key.includes('@')) continue
    const r = (out[c.inst.room] ??= { n: 0, faces: [] })
    r.n++
    if (r.faces.length < 3) r.faces.push({ n: c.name, l: c.look })
  }
  return out
}

export function blockChanged(a: string) {
  const c = clients.get(a)
  if (c) c.blocked = loadBlocked(a)
}

/** Profile changes made over REST (title/team/look/name) are pushed to the room. */
export function profileChanged(u: UserRow) {
  const c = clients.get(u.id)
  if (!c) return
  if (u.name) c.name = u.name
  if (u.look) c.look = JSON.parse(u.look)
  c.team = u.team ?? ''
  c.title = u.title ?? ''
  emit(c.inst, { t: 'l', i: c.id, l: c.look })
  emit(c.inst, { t: 'tag', i: c.id, ti: c.title, tm: c.team })
}

// ---------- house parties ----------
const wireParty = (p: PartyWire): PartyWire => ({ h: p.h, n: p.n, track: p.track, theme: p.theme, since: p.since, pub: p.pub })
function partyIn(key: string): PartyWire | undefined {
  for (const p of parties.values()) if (p.key === key) return wireParty(p)
  return undefined
}
function endParty(host: string) {
  const p = parties.get(host)
  if (!p) return
  parties.delete(host)
  const list = instances.get(p.key)
  for (const inst of list ?? []) emit(inst, { t: 'party', p: null })
}
/** Parties anyone can join, plus your friends' private ones (for the City tab). */
export function partiesFor(userId: string) {
  const out: (PartyWire & { room: string; guests: number; friend: boolean })[] = []
  const me = clients.get(userId)
  const friends = me?.friends ?? new Set<string>()
  for (const p of parties.values()) {
    if (p.until < Date.now()) {
      endParty(p.h)
      continue
    }
    const friend = friends.has(p.h)
    if (!p.pub && !friend && p.h !== userId) continue
    const guests = (instances.get(p.key) ?? []).reduce((n, i) => n + i.clients.size, 0)
    out.push({ ...wireParty(p), room: p.room, guests, friend })
  }
  return out.sort((a, b) => b.guests - a.guests)
}
export const partyOf = (host: string) => {
  const p = parties.get(host)
  return p ? { pub: p.pub, track: p.track, theme: p.theme } : null
}

// ---------- rooms ----------
function leaveInstance(c: Client) {
  const inst = c.inst
  if (!inst) return
  if (inst.key === `${inst.room}@${c.id}`) endParty(c.id)
  inst.clients.delete(c.id)
  emit(inst, { t: '-', i: c.id })
  c.inst = null
  c.seat = null
  const list = instances.get(inst.key)
  // an empty overflow room, or an empty apartment (one per player, so they must not pile up), is retired
  if (list && !inst.clients.size && (inst.n > 1 || inst.key.includes('@'))) {
    // flush its last events first
    setTimeout(() => {
      if (inst.clients.size) return
      const rest = (instances.get(inst.key) ?? []).filter((i) => i !== inst)
      if (rest.length) instances.set(inst.key, rest)
      else instances.delete(inst.key)
    }, config.tickMs * 2)
  }
}

/** Apartments belong to real players: visiting a made-up one would just mint empty rooms. */
const realUser = (id: string) => !!q.get('SELECT 1 FROM users WHERE id = ?', id)

function pickInstance(key: string, room: string, c: Client): Instance {
  let list = instances.get(key)
  if (!list) instances.set(key, (list = []))
  const open = list.filter((i) => i.clients.size < config.roomCap)
  let best: Instance | undefined
  let bestScore = -1
  for (const i of open) {
    let friends = 0
    for (const f of c.friends) if (i.clients.has(f)) friends++
    const score = friends * 1000 + i.clients.size
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }
  if (best) return best
  const used = new Set(list.map((i) => i.n))
  let n = 1
  while (used.has(n)) n++
  const inst: Instance = { key, room, n, clients: new Map(), queue: [] }
  list.push(inst)
  list.sort((a, b) => a.n - b.n)
  return inst
}

function join(c: Client, room: string, x: number, y: number, owner?: string) {
  if (!knownRoom(room)) return direct(c, { t: 'sys', m: 'Unknown place.' })
  const host = owner && /^[\w-]{8,64}$/.test(owner) ? owner : c.id
  // a player's place, or a city local's (npc-<id>); made-up owners are refused (and any empty home is retired, so none pile up)
  if (HOME_ROOMS.has(room) && host !== c.id && !host.startsWith('npc-') && !instances.has(`${room}@${host}`) && !realUser(host)) return direct(c, { t: 'sys', m: 'That apartment doesn’t exist.' })
  const key = HOME_ROOMS.has(room) ? `${room}@${host}` : room
  leaveInstance(c)
  const inst = pickInstance(key, room, c)
  const [tx, ty] = Number.isFinite(x) && Number.isFinite(y) ? walkTarget(room, x, y) : spawnOf(room)
  c.x = tx
  c.y = ty
  c.pose = 'idle'
  c.seat = null
  const others = [...inst.clients.values()].map(wire)
  inst.clients.set(c.id, c)
  c.inst = inst
  const party = partyIn(key)
  direct(c, { t: 'w', me: c.id, r: room, k: key, inst: inst.n, players: others, online: clients.size, ...(party ? { party } : {}) })
  emit(inst, { t: '+', p: wire(c) })
  tellFriends(c, true)
}

// ---------- message handling ----------
const POSE_SET = new Set<string>(POSES)
const EMOTE_SET = new Set(EMOTES)

function handle(c: Client, msg: C2S) {
  stats.msgsIn++
  switch (msg.t) {
    case 'j':
      // people change rooms every few seconds at most; a script hopping 25 times a second would flash in and out on everyone's screen
      if (!c.b.hop.take()) return direct(c, { t: 'sys', m: 'Whoa, slow down! One place at a time.' })
      if (typeof msg.r === 'string') join(c, msg.r, Number(msg.x), Number(msg.y), typeof msg.o === 'string' ? msg.o : undefined)
      return
    case 'ping':
      return direct(c, { t: 'pong', c: Number(msg.c) || 0 })
  }
  const inst = c.inst
  if (!inst) return
  switch (msg.t) {
    case 'm': {
      if (!c.b.move.take()) return
      const [x, y] = walkTarget(inst.room, Number(msg.x), Number(msg.y))
      c.x = x
      c.y = y
      c.seat = null
      c.pose = 'idle'
      return emit(inst, { t: 'm', i: c.id, x, y })
    }
    case 's': {
      if (typeof msg.m !== 'string') return
      if (c.modMute > Date.now()) {
        const t = new Date(c.modMute).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
        return direct(c, { t: 'sys', m: `You can’t chat right now${c.modMuteReason ? ` (${c.modMuteReason})` : ''}. Back at ${t} ET.` })
      }
      if (c.mutedUntil > Date.now()) return direct(c, { t: 'sys', m: 'You’re muted for a moment. Slow down 🙂' })
      if (!c.b.say.take()) {
        if (++c.strikes >= 4) {
          c.mutedUntil = Date.now() + 30000
          c.strikes = 0
          direct(c, { t: 'sys', m: 'Whoa, that’s a lot of messages. Chat muted for 30 seconds.' })
        }
        return
      }
      const text = cleanChat(msg.m)
      if (!text) return
      logChat(c.id, inst.room, text)
      return emit(inst, { t: 's', i: c.id, m: text })
    }
    case 'e':
      if (!c.b.act.take() || !EMOTE_SET.has(msg.e)) return
      return emit(inst, { t: 'e', i: c.id, e: msg.e })
    case 'p':
      if (!c.b.act.take() || !POSE_SET.has(msg.p)) return
      c.pose = msg.p
      return emit(inst, { t: 'p', i: c.id, p: msg.p })
    case 'st': {
      if (!c.b.act.take()) return
      const s = msg.s === null ? null : String(msg.s).slice(0, 48)
      if (s && !validSeat(inst.room, s)) return
      c.seat = s
      return emit(inst, { t: 'st', i: c.id, s })
    }
    case 'l': {
      if (!c.b.act.take()) return
      const valid = validLook(msg.l)
      if (!valid) return
      // you can only wear what you own
      const look = ownedLook(valid, c.wallet, c.team)
      c.look = look
      q.run('UPDATE users SET look = ? WHERE id = ?', JSON.stringify(look), c.id)
      return emit(inst, { t: 'l', i: c.id, l: look })
    }
    case 'tag': {
      if (!c.b.act.take()) return
      c.title = String(msg.ti ?? '').slice(0, 40)
      if (TEAMS.includes(msg.tm)) c.team = msg.tm
      q.run('UPDATE users SET title = ?, team = ? WHERE id = ?', c.title, c.team, c.id)
      return emit(inst, { t: 'tag', i: c.id, ti: c.title, tm: c.team })
    }
    case 'party': {
      if (!c.b.act.take()) return
      // only in your own home
      if (inst.key !== `${inst.room}@${c.id}`) return direct(c, { t: 'sys', m: 'You can only throw a party at your own place.' })
      if (!msg.on) return endParty(c.id)
      const prev = parties.get(c.id)
      const track = typeof msg.track === 'string' && /^[\w-]{1,40}$/.test(msg.track) ? msg.track : prev?.track ?? 'empire-state-of-mine'
      const theme = typeof msg.theme === 'string' && THEME_SET.has(msg.theme) ? msg.theme : prev?.theme ?? 'glow'
      const p = {
        h: c.id, n: c.name, track, theme,
        since: !prev || prev.track !== track ? Date.now() : prev.since,
        pub: typeof msg.pub === 'boolean' ? msg.pub : prev?.pub ?? false,
        key: inst.key, room: inst.room, until: Date.now() + PARTY_MAX_MS,
      }
      parties.set(c.id, p)
      emit(inst, { t: 'party', p: wireParty(p) })
      // a new party: invite the host's friends who are online
      if (!prev) for (const fid of c.friends) {
        const f = clients.get(fid)
        if (f && f.inst?.key !== inst.key) direct(f, { t: 'inv', i: c.id, n: c.name, r: inst.room, pub: p.pub })
      }
      return
    }
    case 'sb': {
      if (!c.b.snow.take()) return
      const x = Math.max(0, Math.min(1000, Number(msg.x) || 0))
      const y = Math.max(0, Math.min(565, Number(msg.y) || 0))
      return emit(inst, { t: 'sb', i: c.id, x, y })
    }
  }
}

// ---------- connection lifecycle ----------
function originOk(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true // non-browser clients (load tests)
  try {
    const o = new URL(origin)
    return o.host === new URL(config.publicUrl).host || o.host === host || o.hostname === 'localhost' || o.hostname === '127.0.0.1'
  } catch {
    return false
  }
}

export function attachRealtime(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096, perMessageDeflate: false })

  // nothing a client sends may crash the city: socket errors are handled, and the upgrade itself is guarded
  wss.on('error', (e) => console.error('[ws] server error', e))
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    socket.on('error', () => socket.destroy())
    // only /ws upgrades: anything else is answered and closed, never left hanging open
    if (!req.url?.startsWith('/ws')) {
      socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n')
      return
    }
    const refuse = (status: string) => {
      socket.write(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`)
      socket.destroy()
    }
    try {
      if (closing || maintenance.on) return refuse('503 Service Unavailable')
      const user = userForToken(parseCookie(req.headers.cookie, SESSION_COOKIE))
      if (!user || !user.profile_done || !originOk(req.headers.origin, req.headers.host)) return refuse('401 Unauthorized')
      if (banOf(user)) return refuse('403 Forbidden')
      wss.handleUpgrade(req, socket, head, (ws) => connect(ws, user))
    } catch (e) {
      console.error('[ws] upgrade error', e)
      refuse('400 Bad Request')
    }
  })
  // play time is what makes an invite "count" (and a handy engagement number)
  setInterval(accruePlayTime, Number(process.env.PLAYTIME_TICK_MS) || 60_000).unref()

  // keepalive: drop dead connections
  setInterval(() => {
    for (const c of clients.values()) {
      if (!c.alive) {
        c.ws.terminate()
        continue
      }
      c.alive = false
      c.ws.ping()
    }
  }, 25000)
  setInterval(flush, config.tickMs)
  return wss
}

function connect(ws: WebSocket, user: UserRow) {
  const prev = clients.get(user.id)
  if (prev) {
    direct(prev, { t: 'kick', m: 'You signed in somewhere else.', k: 'replaced' })
    leaveInstance(prev)
    prev.ws.close(4001, 'replaced')
  }
  const pending = offlineTimers.get(user.id)
  if (pending) {
    clearTimeout(pending)
    offlineTimers.delete(user.id)
  }
  const wallet = ensureWallet(user)
  const mute = muteOf(user)
  const baseLook: LookWire = user.look ? JSON.parse(user.look) : { skin: 1, hair: 'short', hairColor: 1, items: { body: 'tee-blue', legs: 'jeans', feet: 'sneakers' } }
  const c: Client = {
    id: user.id,
    name: user.name ?? 'Guest',
    look: ownedLook(baseLook, wallet, user.team ?? ''),
    team: user.team ?? '',
    title: user.title ?? '',
    ws,
    inst: null,
    x: 500,
    y: 460,
    pose: 'idle',
    seat: null,
    friends: loadFriends(user.id),
    blocked: loadBlocked(user.id),
    b: { move: new Bucket(6, 10), say: new Bucket(0.7, 3), act: new Bucket(4, 8), snow: new Bucket(1.5, 3), msg: new Bucket(30, 60), hop: new Bucket(1, 4) },
    mutedUntil: 0,
    strikes: 0,
    alive: true,
    wallet,
    modMute: mute?.until ?? 0,
    modMuteReason: mute?.reason ?? '',
    since: Date.now(),
  }
  clients.set(user.id, c)
  q.run('UPDATE users SET last_seen = ? WHERE id = ?', Date.now(), user.id)

  ws.on('pong', () => (c.alive = true))
  // an oversized message (> maxPayload) or invalid UTF-8: ws closes the connection (1009 / 1007); without this
  // listener the 'error' event would be thrown and take the whole server down
  ws.on('error', () => ws.terminate())
  ws.on('message', (data, isBinary) => {
    c.alive = true
    if (isBinary || !c.b.msg.take()) return
    let msg: C2S
    try {
      msg = JSON.parse(String(data))
    } catch {
      return
    }
    if (msg && typeof msg === 'object' && typeof (msg as { t?: unknown }).t === 'string') {
      try {
        handle(c, msg)
      } catch (e) {
        console.error('[ws] handler error', e)
      }
    }
  })
  ws.on('close', () => {
    if (clients.get(user.id) !== c) return // replaced by a newer connection
    leaveInstance(c)
    clients.delete(user.id)
    const now = Date.now()
    q.run('UPDATE users SET last_seen = ?, play_ms = play_ms + ? WHERE id = ?', now, Math.max(0, now - c.since), user.id)
    c.since = now
    // a short grace period so reloads and room hops don't flicker "offline" to friends
    offlineTimers.set(
      user.id,
      setTimeout(() => {
        offlineTimers.delete(user.id)
        if (!clients.has(user.id)) tellFriends(c, false)
      }, 8000),
    )
  })
}

// ---------- play time & invites ----------
function accruePlayTime() {
  const now = Date.now()
  for (const c of clients.values()) {
    q.run('UPDATE users SET play_ms = play_ms + ? WHERE id = ?', Math.max(0, now - c.since), c.id)
    c.since = now
  }
  // friends who joined through someone's invite and have now really played: pay the inviter
  for (const p of settleReferrals()) {
    const inviter = clients.get(p.inviter)
    if (!inviter) continue
    if (p.coins) direct(inviter, { t: '$', c: p.balance, why: `${p.inviteeName} is a real New Yorker now. Thanks for the invite!` })
    direct(inviter, { t: 'n', k: 'refpaid', i: p.invitee, n: p.inviteeName, c: p.coins })
  }
}

// ---------- controls for moderators, deploys and the wallet ----------
let closing = false
const maintenance = { on: process.env.MAINTENANCE === 'true', message: 'The city is closed for a little maintenance. Back soon!' }

/** Push a server-side wallet change (purchase, payout, refund) to the player, and keep wardrobe checks current. */
export function walletChanged(userId: string, w: Wallet, why?: string) {
  const c = clients.get(userId)
  if (!c) return
  c.wallet = w
  direct(c, { t: '$', c: w.coins, why, owned: w.owned, homes: w.homes })
}

/** Close someone's connection with a message (bans, account deletion). */
export function kickUser(userId: string, m: string, code = 4003, k: 'banned' | 'deleted' | 'maintenance' = 'banned') {
  const c = clients.get(userId)
  if (!c) return
  direct(c, { t: 'kick', m, k })
  setTimeout(() => c.ws.close(code, 'kicked'), 50)
}

export function setLiveMute(userId: string, until: number, reason: string) {
  const c = clients.get(userId)
  if (!c) return
  c.modMute = until
  c.modMuteReason = reason
  direct(c, until > Date.now() ? { t: 'mod', k: 'mute', m: reason, until } : { t: 'mod', k: 'unmute', m: '' })
}

export function warnUser(userId: string, m: string) {
  const c = clients.get(userId)
  if (c) direct(c, { t: 'mod', k: 'warn', m })
}

/** A message from the team to everyone online (events, incidents, "back in 5"). */
export function announce(m: string) {
  for (const c of clients.values()) direct(c, { t: 'ann', m })
}

export function maintenanceState() {
  return { ...maintenance }
}
/** Maintenance mode: nobody new can join, and everyone online is told and sent to the "closed" screen. */
export function setMaintenance(on: boolean, message?: string) {
  maintenance.on = on
  if (message) maintenance.message = message
  if (on) for (const c of [...clients.values()]) kickUser(c.id, maintenance.message, 4503, 'maintenance')
}

/** Deploys and restarts: tell everyone, close sockets with "service restart" so clients reconnect on their own. */
export function shutdownAll(m = 'The city is restarting. You’ll be back in a few seconds.') {
  closing = true
  accruePlayTime()
  for (const c of clients.values()) {
    direct(c, { t: 'sys', m })
    c.ws.close(1012, 'restart')
  }
}

export function liveSnapshot() {
  const rooms: { room: string; inst: number; players: number }[] = []
  for (const list of instances.values()) for (const i of list) if (i.clients.size) rooms.push({ room: i.key, inst: i.n, players: i.clients.size })
  rooms.sort((a, b) => b.players - a.players)
  return { online: clients.size, rooms, parties: parties.size, maintenance: maintenance.on, ...stats }
}
