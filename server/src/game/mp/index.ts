/**
 * Multiplayer mini-games: lobbies, matches and everything around them, on the city's one WebSocket.
 *
 * - A LOBBY is a table for one game, opened from a place in the city (the sled hill, a subway platform, the pizza
 *   place) and joinable from anywhere by its 4-letter code or link. Quick Match drops you into an open public lobby
 *   (friends' first), or opens one. Lobbies have seats (2-9 depending on the game), spectators, a host (it passes on
 *   when the host leaves), ready-up, and settings (Free-for-All or Uptown vs Downtown, city locals on/off, public or
 *   invite-only).
 * - A Quick Match lobby starts on its own once people are in (with locals filling empty seats); a private one when
 *   the host presses Start or everyone's ready. Anyone can leave at any time, mid-match too.
 * - After a match everyone who played sits out ("away") until they press Play Again, so nobody gets pulled into a
 *   race while reading their results. Late arrivals watch and get a seat for the next round.
 * - The server runs every match (race.ts, duel.ts), decides places and pays out (results.ts).
 */
import { randomInt, randomUUID } from 'node:crypto'
import { q, type UserRow } from '../../db.ts'
import { notifyUser, presenceOf } from '../realtime.ts'
import { knownRoom } from '../geo.ts'
import { MP_GAMES, MP_GAME_IDS, CODE_CHARS, CODE_LEN, validCode, REACTIONS, PHRASES, type MpGameId, type MpTeam } from '../../../../app/src/mp/shared/games.ts'
import type { LobbyWire, MpC2S, MpS2C, ResultRow, ResultsWire, SeatWire } from '../../../../app/src/mp/shared/protocol.ts'
import { NPC_NAMES, randomLook } from '../../../../app/src/avatar/random.ts'
import { seeded } from '../../../../app/src/mp/shared/rng.ts'
import type { LookWire } from '../../../../app/src/net/protocol.ts'
import { RaceMatch, type Entrant } from './race.ts'
import { DuelMatch } from './duel.ts'
import { recordMatch } from './results.ts'
import type { Lobby, Match, MatchEnd, MatchHost, Seat } from './types.ts'

// ---------- per-player rate limits ----------
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
interface Limits {
  op: Bucket
  play: Bucket
  social: Bucket
  inv: Bucket
  invited: Map<string, number>
}
const limits = new Map<string, Limits>()
function limitsOf(userId: string): Limits {
  let l = limits.get(userId)
  if (!l) limits.set(userId, (l = { op: new Bucket(3, 10), play: new Bucket(16, 30), social: new Bucket(1, 4), inv: new Bucket(0.5, 4), invited: new Map() }))
  return l
}

// ---------- state ----------
const lobbies = new Map<string, Lobby>()
/** which lobby each player is in (seated or watching) */
const where = new Map<string, string>()
/** the lobby someone was last in (Play Again after being moved out) */
const lastLobby = new Map<string, { code: string; game: MpGameId }>()

/** seats: how many locals a race fills up to (when locals are on) */
const FILL: Record<MpGameId, number> = { sled: 4, runner: 6, carbs: 2 }
const OFFLINE_SEAT_MS = 25_000
const AWAY_SEAT_MS = 75_000
const OFFLINE_SPEC_MS = 20_000
const IDLE_LOBBY_MS = 30 * 60_000
/** Quick Match lobbies start on their own: soon when there's company, a little later when you're alone */
const AUTO_TOGETHER_MS = 15_000
const AUTO_ALONE_MS = 25_000
const KICK_MS = 10 * 60_000

/** when each player's connection last dropped (spectators who don't come back are let go) */
const offAt = new Map<string, number>()

const send = (userId: string, evt: MpS2C) => notifyUser(userId, evt)
const err = (userId: string, m: string) => send(userId, { t: 'mp', k: 'err', m })

interface Profile {
  id: string
  name: string
  look: LookWire
}
function profileOf(userId: string): Profile | null {
  const u = q.get<UserRow>('SELECT * FROM users WHERE id = ? AND profile_done = 1', userId)
  if (!u) return null
  let look: LookWire = { skin: 1, hair: 'short', hairColor: 1, items: {} }
  try {
    if (u.look) look = JSON.parse(u.look)
  } catch {
    /* keep the default */
  }
  return { id: u.id, name: u.name ?? 'New Yorker', look }
}
const blockedBetween = (a: string, b: string) => !!q.get('SELECT 1 FROM blocks WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', a, b, b, a)
const friendsOf = (userId: string) =>
  new Set(q.all<{ o: string }>(`SELECT CASE WHEN a = ? THEN b ELSE a END AS o FROM friends WHERE (a = ? OR b = ?) AND status = 'accepted'`, userId, userId, userId).map((r) => r.o))

// ---------- lobbies ----------
function newCode(): string {
  for (let k = 0; k < 50; k++) {
    let c = ''
    for (let i = 0; i < CODE_LEN; i++) c += CODE_CHARS[randomInt(CODE_CHARS.length)]
    if (!lobbies.has(c)) return c
  }
  return randomUUID().slice(0, CODE_LEN).toUpperCase()
}

const audience = (l: Lobby) => [...l.seats.map((s) => s.id), ...l.spectators.keys()]
const humansIn = (l: Lobby) => l.seats.length + l.spectators.size

function wireOf(l: Lobby): LobbyWire {
  const now = Date.now()
  return {
    code: l.code,
    g: l.game,
    room: l.room,
    host: l.host,
    st: l.state,
    mode: l.mode,
    bots: l.bots,
    priv: l.priv,
    seats: l.seats.map(
      (s): SeatWire => ({ i: s.id, n: s.name, l: s.look, ...(s.ready ? { r: 1 as const } : {}), ...(s.away ? { a: 1 as const } : {}), ...(!s.online ? { o: 1 as const } : {}), ...(l.mode === 'teams' ? { tm: s.team } : {}) }),
    ),
    spec: [...l.spectators].map(([i, s]) => ({ i, n: s.name })),
    max: MP_GAMES[l.game].seats,
    auto: l.autoAt ? Math.max(0, l.autoAt - now) : 0,
    ...(l.champ ? { champ: { i: l.champ.id, n: l.seats.find((s) => s.id === l.champ!.id)?.name ?? '', s: l.champ.n } } : {}),
    ...(l.game === 'carbs' ? { next: queueOf(l).map((s) => s.id) } : {}),
  }
}
function pushLobby(l: Lobby) {
  const w = wireOf(l)
  for (const u of audience(l)) send(u, { t: 'mp', k: 'lobby', l: w })
}

/** Carb-Jitsu: the table's queue (the champion first, then in order of arrival; the last loser goes to the back) */
function queueOf(l: Lobby): Seat[] {
  return l.seats.filter((s) => s.online && !s.away).sort((a, b) => (l.champ?.id === a.id ? -1 : l.champ?.id === b.id ? 1 : a.joinedAt - b.joinedAt))
}

function smallerTeam(l: Lobby): MpTeam {
  const up = l.seats.filter((s) => s.team === 'up').length
  const down = l.seats.length - up
  return up <= down ? 'up' : 'down'
}

function seat(l: Lobby, p: Profile, ready: boolean) {
  l.spectators.delete(p.id)
  l.seats.push({ id: p.id, name: p.name, look: p.look, ready, away: false, online: true, offAt: 0, awayAt: 0, team: smallerTeam(l), joinedAt: Date.now() })
  where.set(p.id, l.code)
  lastLobby.set(p.id, { code: l.code, game: l.game })
}
function watch(l: Lobby, p: Profile, wants: boolean) {
  l.spectators.set(p.id, { name: p.name, wants })
  where.set(p.id, l.code)
  lastLobby.set(p.id, { code: l.code, game: l.game })
}

function makeLobby(host: Profile, game: MpGameId, o: { priv: boolean; quick: boolean }): Lobby {
  const room = presenceOf(host.id).room
  const l: Lobby = {
    code: newCode(),
    game,
    room: room && knownRoom(room) ? room : MP_GAMES[game].room,
    host: host.id,
    priv: o.priv,
    quick: o.quick,
    mode: 'ffa',
    bots: true,
    seats: [],
    spectators: new Map(),
    state: 'open',
    match: null,
    createdAt: Date.now(),
    activeAt: Date.now(),
    autoAt: 0,
    kicked: new Map(),
    champ: null,
  }
  lobbies.set(l.code, l)
  return l
}

/** put someone into a lobby: a seat if there's one (and no round running), else watching */
function enter(l: Lobby, p: Profile, ready: boolean) {
  const leaveFirst = where.get(p.id)
  if (leaveFirst && leaveFirst !== l.code) leave(p.id, 'left', true)
  if (l.seats.some((s) => s.id === p.id)) return sync(p.id)
  const room = l.seats.length < MP_GAMES[l.game].seats
  if (l.state === 'open' && room) seat(l, p, ready)
  else watch(l, p, room || l.state === 'playing')
  l.activeAt = Date.now()
  pushLobby(l)
  if (l.state === 'playing' && l.match) send(p.id, { t: 'mp', k: 'start', m: l.match.wire(p.id) })
  if (l.state === 'playing' && l.match?.resync) l.match.resync(p.id)
  evaluate(l)
}

function quick(userId: string, game: MpGameId) {
  const p = profileOf(userId)
  if (!p) return
  const cur = lobbyOf(userId)
  if (cur && cur.game === game) return sync(userId)
  const friends = friendsOf(userId)
  let best: Lobby | null = null
  let bestScore = -1
  for (const l of lobbies.values()) {
    if (l.game !== game || l.priv || l.seats.length >= MP_GAMES[game].seats) continue
    if ((l.kicked.get(userId) ?? 0) > Date.now()) continue
    if (audience(l).some((u) => blockedBetween(u, userId))) continue
    const f = audience(l).filter((u) => friends.has(u)).length
    const score = f * 1000 + l.seats.filter((s) => s.online && !s.away).length * 10 + (l.state === 'open' ? 5 : 0)
    if (score > bestScore) {
      bestScore = score
      best = l
    }
  }
  if (best) return enter(best, p, true)
  if (cur) leave(userId, 'left', true)
  const l = makeLobby(p, game, { priv: false, quick: true })
  seat(l, p, true)
  pushLobby(l)
  evaluate(l)
}

function create(userId: string, game: MpGameId, priv: boolean) {
  const p = profileOf(userId)
  if (!p) return
  if (where.has(userId)) leave(userId, 'left', true)
  const l = makeLobby(p, game, { priv, quick: false })
  seat(l, p, true)
  pushLobby(l)
}

function joinCode(userId: string, raw: string) {
  const code = raw.trim().toUpperCase()
  const p = profileOf(userId)
  if (!p) return
  const l = validCode(code) ? lobbies.get(code) : undefined
  if (!l) return err(userId, 'That game has ended or the code is wrong. Check the code, or start your own.')
  if ((l.kicked.get(userId) ?? 0) > Date.now()) return err(userId, 'The host removed you from that game for now.')
  if (audience(l).some((u) => u !== userId && blockedBetween(u, userId))) return err(userId, 'You can’t join that game.')
  enter(l, p, l.quick)
}

function lobbyOf(userId: string): Lobby | null {
  const code = where.get(userId)
  return code ? lobbies.get(code) ?? null : null
}

/** someone leaves (or is moved out of) a lobby. `quiet`: they're heading straight into another one */
function leave(userId: string, why: 'left' | 'kicked' | 'closed', quiet = false) {
  const l = lobbyOf(userId)
  where.delete(userId)
  if (!l) {
    if (!quiet) send(userId, { t: 'mp', k: 'left', why })
    return
  }
  if (l.match && l.match.humans.includes(userId)) l.match.leave(userId)
  l.seats = l.seats.filter((s) => s.id !== userId)
  l.spectators.delete(userId)
  if (l.champ?.id === userId) l.champ = null
  if (!quiet) send(userId, { t: 'mp', k: 'left', why })
  if (!humansIn(l)) return close(l)
  if (l.host === userId || !audience(l).includes(l.host)) {
    // the host role passes to whoever has been seated longest (or anyone watching)
    l.host = [...l.seats].sort((a, b) => a.joinedAt - b.joinedAt)[0]?.id ?? [...l.spectators.keys()][0]
  }
  l.activeAt = Date.now()
  pushLobby(l)
  evaluate(l)
}

function close(l: Lobby) {
  for (const u of audience(l)) {
    where.delete(u)
    send(u, { t: 'mp', k: 'left', why: 'closed' })
  }
  if (l.match) l.match.ended = true
  lobbies.delete(l.code)
}

function setReady(userId: string, on: boolean) {
  const l = lobbyOf(userId)
  const s = l?.seats.find((x) => x.id === userId)
  if (!l || !s) return
  s.ready = on
  if (on) s.away = false
  l.activeAt = Date.now()
  pushLobby(l)
  evaluate(l)
}

/** Play Again: back in for the next round (re-seated if you'd been moved out meanwhile) */
function again(userId: string) {
  const l = lobbyOf(userId)
  if (l) {
    const s = l.seats.find((x) => x.id === userId)
    if (s) {
      s.away = false
      s.ready = true
    } else {
      const sp = l.spectators.get(userId)
      if (sp) sp.wants = true
      if (sp && l.state === 'open' && l.seats.length < MP_GAMES[l.game].seats) {
        const p = profileOf(userId)
        if (p) seat(l, p, true)
      }
    }
    l.activeAt = Date.now()
    pushLobby(l)
    if (l.state === 'playing' && l.match) send(userId, { t: 'mp', k: 'start', m: l.match.wire(userId) })
    return evaluate(l)
  }
  const last = lastLobby.get(userId)
  const back = last && lobbies.get(last.code)
  const p = profileOf(userId)
  if (back && p && (back.kicked.get(userId) ?? 0) < Date.now()) return enter(back, p, true)
  if (last) return quick(userId, last.game)
}

function settings(userId: string, msg: Extract<MpC2S, { k: 'set' }>) {
  const l = lobbyOf(userId)
  if (!l || l.host !== userId || l.state !== 'open') return
  if (msg.mode === 'teams' && MP_GAMES[l.game].teams && l.mode !== 'teams') {
    l.mode = 'teams'
    // deal everyone into two even teams, in seat order
    l.seats.forEach((s, i) => (s.team = i % 2 ? 'down' : 'up'))
  } else if (msg.mode === 'ffa') l.mode = 'ffa'
  if (typeof msg.bots === 'boolean') l.bots = msg.bots
  if (typeof msg.priv === 'boolean') {
    l.priv = msg.priv
    // an invite-only lobby doesn't start on its own
    if (msg.priv) {
      l.quick = false
      l.autoAt = 0
    }
  }
  l.activeAt = Date.now()
  pushLobby(l)
  evaluate(l)
}

function pickTeam(userId: string, tm: MpTeam) {
  const l = lobbyOf(userId)
  const s = l?.seats.find((x) => x.id === userId)
  if (!l || !s || l.mode !== 'teams' || l.state !== 'open' || (tm !== 'up' && tm !== 'down')) return
  s.team = tm
  pushLobby(l)
}

function kick(userId: string, target: string) {
  const l = lobbyOf(userId)
  if (!l || l.host !== userId || target === userId || !audience(l).includes(target)) return
  l.kicked.set(target, Date.now() + KICK_MS)
  leave(target, 'kicked')
}

function invite(userId: string, target: string) {
  const l = lobbyOf(userId)
  if (!l) return err(userId, 'Open a game first, then invite your friends to it.')
  if (!friendsOf(userId).has(target)) return err(userId, 'You can invite friends. Everyone else can join with the link.')
  if (audience(l).includes(target)) return
  if (!presenceOf(target).online) return err(userId, 'They’re offline right now. Send them the link instead.')
  if (blockedBetween(userId, target)) return
  const lim = limitsOf(userId)
  const at = lim.invited.get(target) ?? 0
  if (Date.now() - at < 30_000) return
  lim.invited.set(target, Date.now())
  const me = l.seats.find((s) => s.id === userId)?.name ?? l.spectators.get(userId)?.name ?? 'A friend'
  send(target, { t: 'mp', k: 'inv', code: l.code, g: l.game, from: me, fi: userId, room: l.room })
}

function social(userId: string, msg: Extract<MpC2S, { k: 're' | 'say' }>) {
  const l = lobbyOf(userId)
  if (!l) return
  if (msg.k === 're') {
    const e = Number(msg.e)
    if (!Number.isInteger(e) || e < 0 || e >= REACTIONS.length) return
    for (const u of audience(l)) send(u, { t: 'mp', k: 're', i: userId, e })
  } else {
    const p = Number(msg.p)
    if (!Number.isInteger(p) || p < 0 || p >= PHRASES.length) return
    for (const u of audience(l)) send(u, { t: 'mp', k: 'say', i: userId, p })
  }
}

/** everything someone needs to (re)draw their screen: the lobby, and the match if one is running */
function sync(userId: string) {
  const l = lobbyOf(userId)
  if (!l) return send(userId, { t: 'mp', k: 'left', why: 'left' })
  send(userId, { t: 'mp', k: 'lobby', l: wireOf(l) })
  if (l.state === 'playing' && l.match) {
    send(userId, { t: 'mp', k: 'start', m: l.match.wire(userId) })
    l.match.resync?.(userId)
  }
}

// ---------- starting and ending rounds ----------
/** should this lobby's round start (now, or on a timer)? */
function evaluate(l: Lobby) {
  if (l.state !== 'open') return
  const present = l.seats.filter((s) => s.online && !s.away)
  const away = l.seats.filter((s) => s.away)
  if (!present.length) {
    l.autoAt = 0
    return
  }
  const allReady = present.every((s) => s.ready)
  // everyone here is ready, nobody is still reading their results, and there's company: go
  if (allReady && !away.length && present.length >= 2 && (l.game !== 'carbs' || present.length >= 2)) return startRound(l)
  if (l.quick && present.some((s) => s.ready)) {
    const want = Date.now() + (present.length + away.length >= 2 ? AUTO_TOGETHER_MS : AUTO_ALONE_MS)
    if (!l.autoAt) l.autoAt = want
    else if (present.length + away.length >= 2) l.autoAt = Math.min(l.autoAt, want)
  } else l.autoAt = 0
}

function startByHost(userId: string) {
  const l = lobbyOf(userId)
  if (!l) return
  if (l.host !== userId) return err(userId, 'Only the host can start. Press Ready and you’re in.')
  if (l.state !== 'open') return
  const me = l.seats.find((s) => s.id === userId)
  if (me) {
    me.ready = true
    me.away = false
  }
  startRound(l)
}

const SKILLS = [0.45, 0.6, 0.72, 0.85, 0.55, 0.68, 0.78, 0.5]
function locals(n: number, taken: Set<string>, seed: number): Entrant[] {
  const r = seeded(seed ^ 0x10ca1)
  const out: Entrant[] = []
  for (let k = 0; k < n; k++) {
    let name = NPC_NAMES[Math.floor(r() * NPC_NAMES.length)]
    for (let tries = 0; taken.has(name) && tries < 20; tries++) name = NPC_NAMES[Math.floor(r() * NPC_NAMES.length)]
    taken.add(name)
    out.push({ id: `local:${k}`, name, look: randomLook(0.65, r), bot: { skill: SKILLS[(k + Math.floor(r() * 8)) % SKILLS.length] } })
  }
  return out
}

function startRound(l: Lobby) {
  if (l.state !== 'open') return
  const present = l.seats.filter((s) => s.online && !s.away)
  if (!present.length) return
  const now = Date.now()
  const seed = randomInt(1, 2 ** 31 - 1)
  const id = randomUUID()
  const host: MatchHost = {
    audience: () => audience(l),
    send: (u, evt) => send(u, evt),
    broadcast: (evt) => {
      for (const u of audience(l)) send(u, evt)
    },
    end: (res) => roundOver(l, match, res),
  }
  let match: Match
  const asEntrant = (s: Seat): Entrant => ({ id: s.id, name: s.name, look: s.look, ...(l.mode === 'teams' ? { team: s.team } : {}) })
  if (l.game === 'carbs') {
    const queue = queueOf(l)
    const a = asEntrant(queue[0])
    const b = queue[1] ? asEntrant(queue[1]) : locals(1, new Set(queue.map((s) => s.name)), seed)[0]
    match = new DuelMatch(host, { id, seed, a, b, now })
  } else {
    const entrants = present.slice(0, MP_GAMES[l.game].max).map(asEntrant)
    if (l.bots && entrants.length < FILL[l.game]) {
      const extra = locals(FILL[l.game] - entrants.length, new Set(entrants.map((e) => e.name)), seed)
      if (l.mode === 'teams') {
        // locals even out the teams first
        for (const e of extra) {
          const up = entrants.filter((x) => x.team === 'up').length
          e.team = up <= entrants.length - up ? 'up' : 'down'
          entrants.push(e)
        }
      } else entrants.push(...extra)
    }
    // shuffle the starting grid a little, so the host isn't always on the inside line
    const r = seeded(seed)
    for (let i = entrants.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[entrants[i], entrants[j]] = [entrants[j], entrants[i]]
    }
    match = new RaceMatch(host, { id, game: l.game, mode: l.mode, seed, entrants, now })
  }
  l.state = 'playing'
  l.match = match
  l.autoAt = 0
  l.activeAt = now
  // the people playing ready up again after; anyone waiting their turn (Carb-Jitsu's queue) stays ready
  for (const s of l.seats) if (match.humans.includes(s.id)) s.ready = false
  for (const u of audience(l)) send(u, { t: 'mp', k: 'start', m: match.wire(u) })
  pushLobby(l)
}

function roundOver(l: Lobby, m: Match, res: MatchEnd) {
  if (l.match !== m) return
  const now = Date.now()
  // Carb-Jitsu: the winner holds the table; the streak is their score
  if (l.game === 'carbs') {
    const w = res.standings.find((s) => s.place === 1)
    if (w && !w.bot) {
      l.champ = l.champ?.id === w.id ? { id: w.id, n: l.champ.n + 1 } : { id: w.id, n: 1 }
      w.score = l.champ.n
    } else l.champ = null
    // the other player goes to the back of the queue
    const loser = res.standings.find((s) => s.place === 2)
    const ls = loser && l.seats.find((s) => s.id === loser.id)
    if (ls) ls.joinedAt = now
  }
  let you = new Map<string, NonNullable<ResultsWire['you']>>()
  try {
    you = recordMatch({ id: m.id, game: l.game, room: l.room, mode: m.mode, startedAt: m.startedAt, endedAt: now, standings: res.standings, teams: res.teams, data: res.data })
  } catch (e) {
    console.error('[mp] could not record match', e)
  }
  const rows: ResultRow[] = res.standings.map((s) => ({
    i: s.id,
    n: s.name,
    l: s.look,
    ...(s.bot ? { bot: 1 as const } : {}),
    place: s.place,
    score: s.score,
    ...(s.team ? { tm: s.team } : {}),
    ...(s.won ? { won: 1 as const } : {}),
    ...(s.dnf || s.left ? { dnf: 1 as const } : {}),
    ...(s.stat ? { stat: s.stat } : {}),
  }))
  const base: ResultsWire = { id: m.id, g: l.game, mode: m.mode, rows, humans: res.standings.filter((s) => !s.bot).length, dur: now - m.startedAt, ...(res.teams ? { teams: res.teams } : {}) }
  for (const u of audience(l)) send(u, { t: 'mp', k: 'res', r: { ...base, ...(you.has(u) ? { you: you.get(u) } : {}) } })
  // back to the lobby: whoever played sits out until they press Play Again; whoever watched and wants in gets a seat
  l.state = 'open'
  l.match = null
  l.activeAt = now
  for (const s of l.seats) {
    if (!m.humans.includes(s.id)) continue
    // Carb-Jitsu's winner keeps the table (Winner Stays On); everyone else steps back until Play Again
    if (l.game === 'carbs' && l.champ?.id === s.id) {
      s.ready = true
      continue
    }
    s.away = true
    s.awayAt = now
    s.ready = false
  }
  for (const [id, sp] of [...l.spectators]) {
    if (!sp.wants || l.seats.length >= MP_GAMES[l.game].seats) continue
    const p = profileOf(id)
    if (p) seat(l, p, true)
  }
  pushLobby(l)
  evaluate(l)
}

// ---------- the clock ----------
function tick() {
  const now = Date.now()
  for (const l of [...lobbies.values()]) {
    try {
      if (l.match && !l.match.ended) l.match.tick(now)
      if (!lobbies.has(l.code)) continue
      // people whose connection dropped (or who wandered off after a match) give their seat back
      for (const s of [...l.seats]) {
        if (l.state === 'open' && !s.online && now - s.offAt > OFFLINE_SEAT_MS) leave(s.id, 'left')
        else if (l.state === 'open' && s.away && now - s.awayAt > AWAY_SEAT_MS) leave(s.id, 'left')
      }
      if (!lobbies.has(l.code)) continue
      for (const id of [...l.spectators.keys()]) if (!presenceOf(id).online && (offAt.get(id) ?? now) < now - OFFLINE_SPEC_MS) leave(id, 'left')
      if (!lobbies.has(l.code)) continue
      if (l.state === 'open' && l.autoAt && now >= l.autoAt) startRound(l)
      if (now - l.activeAt > IDLE_LOBBY_MS && l.state === 'open') close(l)
    } catch (e) {
      console.error('[mp] lobby tick', l.code, e)
    }
  }
}
setInterval(tick, 100).unref()
// forget where offline people last played once that lobby is gone
setInterval(() => {
  for (const [u, v] of lastLobby) if (!lobbies.has(v.code) && !presenceOf(u).online) lastLobby.delete(u)
  for (const u of limits.keys()) if (!where.has(u) && !presenceOf(u).online) limits.delete(u)
}, 60_000).unref()

// ---------- connections ----------
/** the socket layer (realtime.ts) tells us when someone connects… */
export function mpOnline(userId: string) {
  offAt.delete(userId)
  const l = lobbyOf(userId)
  if (!l) return
  const s = l.seats.find((x) => x.id === userId)
  if (s) s.online = true
  l.match?.online(userId, true)
  pushLobby(l)
  evaluate(l)
}
/** …and when their connection drops (a reload, a tunnel, a closed laptop) */
export function mpOffline(userId: string) {
  offAt.set(userId, Date.now())
  const l = lobbyOf(userId)
  if (!l) return
  const s = l.seats.find((x) => x.id === userId)
  if (s) {
    s.online = false
    s.offAt = Date.now()
  }
  l.match?.online(userId, false)
  pushLobby(l)
  evaluate(l)
}

/** every `{ t: 'mp' }` message from a player (realtime.ts) */
export function handleMp(userId: string, msg: MpC2S) {
  const lim = limitsOf(userId)
  switch (msg.k) {
    case 'pr':
    case 'fin':
    case 'out':
    case 'pick':
    case 'drop': {
      if (!lim.play.take()) return
      const l = lobbyOf(userId)
      if (l?.match && !l.match.ended) l.match.input(userId, msg)
      return
    }
    case 're':
    case 'say':
      if (!lim.social.take()) return
      return social(userId, msg)
    case 'inv':
      if (!lim.inv.take()) return err(userId, 'One invite at a time, please.')
      return invite(userId, String(msg.i ?? ''))
  }
  if (!lim.op.take()) return err(userId, 'Whoa, slow down a little.')
  const game = (g: unknown): MpGameId | null => (MP_GAME_IDS.includes(g as MpGameId) ? (g as MpGameId) : null)
  switch (msg.k) {
    case 'quick': {
      const g = game(msg.g)
      return g ? quick(userId, g) : undefined
    }
    case 'create': {
      const g = game(msg.g)
      return g ? create(userId, g, msg.priv !== false) : undefined
    }
    case 'join':
      return joinCode(userId, String(msg.code ?? ''))
    case 'leave':
      return leave(userId, 'left')
    case 'ready':
      return setReady(userId, !!msg.on)
    case 'start':
      return startByHost(userId)
    case 'set':
      return settings(userId, msg)
    case 'team':
      return pickTeam(userId, msg.tm)
    case 'kick':
      return kick(userId, String(msg.i ?? ''))
    case 'again':
      return again(userId)
    case 'sync':
      return sync(userId)
  }
}

// ---------- for the REST API (hub counts, invite-link previews) ----------
export function lobbyPreview(code: string) {
  const l = lobbies.get(code.toUpperCase())
  if (!l) return null
  const host = l.seats.find((s) => s.id === l.host)?.name ?? l.spectators.get(l.host)?.name ?? ''
  return { code: l.code, g: l.game, host, players: l.seats.length, max: MP_GAMES[l.game].seats, state: l.state, room: l.room, priv: l.priv }
}

/** per game: people waiting in public lobbies, races running, and lobbies your friends are in */
export function hubSummary(userId: string) {
  const friends = friendsOf(userId)
  const out: Record<string, { waiting: number; playing: number; open: number; friends: { name: string; code: string; st: string }[] }> = {}
  for (const g of MP_GAME_IDS) out[g] = { waiting: 0, playing: 0, open: 0, friends: [] }
  for (const l of lobbies.values()) {
    const o = out[l.game]
    if (l.state === 'playing') o.playing += l.match?.humans.length ?? 0
    else if (!l.priv) {
      o.waiting += l.seats.filter((s) => s.online && !s.away).length
      o.open++
    }
    for (const s of l.seats) if (friends.has(s.id) && !o.friends.some((f) => f.code === l.code)) o.friends.push({ name: s.name, code: l.code, st: l.state })
  }
  return { games: out, mine: where.get(userId) ?? null }
}

export const mpStats = () => ({ lobbies: lobbies.size, playing: [...lobbies.values()].filter((l) => l.state === 'playing').length, players: where.size })
