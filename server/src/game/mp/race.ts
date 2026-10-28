/**
 * A race (the High Line Citi Bike Dash, internally still "sled", or Rush Hour Run), run by the server.
 *
 * Everyone gets the same seed, so every browser builds the same course. Each browser simulates its own racer and
 * reports progress ~10 times a second; the server never takes those numbers on trust: a racer can't be further
 * along than the fastest possible run at that moment (sledMaxDistance / runMaxDistance), can't go backwards and
 * can't leave the course. City locals are simulated here with the same course. Ten times a second everyone gets
 * everyone's latest position ("ghosts"). The server decides the order: who finished, when (the racer's own clock,
 * clamped to what the server saw), and how far everyone else got.
 */
import type { LookWire } from '../../../../app/src/net/protocol.ts'
import { GF, type GhostWire, type MatchWire, type MpC2S, type RacerWire } from '../../../../app/src/mp/shared/protocol.ts'
import { teamPoints, type MpGameId, type MpMode, type MpTeam } from '../../../../app/src/mp/shared/games.ts'
import { SLED, sledCourse, sledMaxDistance, makeSledBot, stepSledBot, type SledBot, type SledCourse } from '../../../../app/src/mp/shared/sled.ts'
import { RUN, runnerCourse, runMaxDistance, runStartGrid, makeRunBot, stepRunBot, runSpeed, type RunBot, type RunCourse, type RunNear } from '../../../../app/src/mp/shared/runner.ts'
import type { Match, MatchHost, Standing } from './types.ts'

export interface Entrant {
  id: string
  name: string
  look: LookWire
  team?: MpTeam
  bot?: { skill: number }
}

interface Racer {
  i: number
  id: string
  name: string
  look: LookWire
  team?: MpTeam
  sled: SledBot | null
  run: RunBot | null
  bot: boolean
  d: number
  x: number
  v: number
  f: number
  c: number
  lastAt: number
  status: 'racing' | 'done' | 'out' | 'left'
  doneMs: number
  susp: number
  online: boolean
  offAt: number
  /** Rush Hour Run: Showtime dancers left to send once you're out, and when the last one went */
  drops: number
  dropAt: number
  /** Rush Hour Run: dancers coming for this local (distance, lane) */
  incoming: { d: number; lane: number }[]
}

const OFFLINE_DNF_MS = 12_000

export class RaceMatch implements Match {
  readonly id: string
  readonly game: MpGameId
  readonly mode: MpMode
  readonly startedAt: number
  readonly humans: string[]
  ended = false
  private readonly seed: number
  private readonly host: MatchHost
  private readonly racers: Racer[]
  /** server time when the race clock reads 0 (after the 3-2-1) */
  private readonly t0: number
  private lastTick: number
  private endAt = 0
  private readonly length: number
  private readonly capMs: number
  private readonly graceMs: number
  private readonly sledCourse: SledCourse | null
  private readonly runCourse: RunCourse | null
  private fastForward = 0

  constructor(host: MatchHost, o: { id: string; game: 'sled' | 'runner'; mode: MpMode; seed: number; entrants: Entrant[]; now: number }) {
    this.host = host
    this.id = o.id
    this.game = o.game
    this.mode = o.mode
    this.seed = o.seed
    const countdown = o.game === 'sled' ? SLED.countdownMs : RUN.countdownMs
    this.startedAt = o.now
    this.t0 = o.now + countdown
    this.lastTick = o.now
    this.length = o.game === 'sled' ? SLED.length : RUN.length
    this.capMs = o.game === 'sled' ? SLED.capMs : RUN.capMs
    this.graceMs = o.game === 'sled' ? SLED.graceMs : RUN.graceMs
    this.sledCourse = o.game === 'sled' ? sledCourse(o.seed) : null
    this.runCourse = o.game === 'runner' ? runnerCourse(o.seed) : null
    const n = o.entrants.length
    // runners line up across the three lanes (real players level at the line, the locals around and behind them)
    const grid = o.game === 'runner' ? runStartGrid(o.entrants.map((e) => !!e.bot)) : null
    this.racers = o.entrants.map((e, i) => {
      // riders line up across the start line at Gansevoort St
      const startX = grid ? grid[i].lane : startLateral(i, n)
      const startD = grid ? grid[i].d : 0
      return {
        i,
        id: e.id,
        name: e.name,
        look: e.look,
        team: e.team,
        bot: !!e.bot,
        sled: e.bot && o.game === 'sled' ? makeSledBot(o.seed, i, e.bot.skill, startX) : null,
        run: e.bot && o.game === 'runner' ? makeRunBot(o.seed, i, e.bot.skill, startX, startD) : null,
        d: startD,
        x: startX,
        v: 0,
        f: 0,
        c: 0,
        lastAt: o.now,
        status: 'racing',
        doneMs: 0,
        susp: 0,
        online: true,
        offAt: 0,
        drops: 2,
        dropAt: 0,
        incoming: [],
      }
    })
    this.humans = this.racers.filter((r) => !r.bot).map((r) => r.id)
  }

  private slotOf(userId: string) {
    return this.racers.find((r) => r.id === userId && !r.bot)
  }

  wire(userId: string): MatchWire {
    const me = this.slotOf(userId)
    return {
      id: this.id,
      g: this.game,
      seed: this.seed,
      mode: this.mode,
      startIn: this.t0 - Date.now(),
      players: this.racers.map((r): RacerWire => ({ i: r.id, n: r.name, l: r.look, ...(r.bot ? { bot: 1 as const } : {}), ...(r.team ? { tm: r.team } : {}) })),
      you: me && me.status !== 'left' ? me.i : -1,
    }
  }

  private elapsed(now = Date.now()) {
    return now - this.t0
  }

  input(userId: string, msg: MpC2S) {
    const r = this.slotOf(userId)
    if (!r || this.ended) return
    const now = Date.now()
    const t = this.elapsed(now)
    switch (msg.k) {
      case 'pr': {
        if (r.status !== 'racing' || t < -500) return
        const max = this.maxD(t)
        let d = Number(msg.d)
        if (!Number.isFinite(d)) return
        if (d > max) {
          // faster than anyone could go: clamp it, and remember
          r.susp++
          d = max
        }
        r.d = Math.max(r.d - 2, Math.min(d, this.length))
        r.x = this.clampX(Number(msg.x))
        r.v = Math.max(0, Math.min(2000, Number(msg.v) || 0))
        r.f = (Number(msg.f) | 0) & 0xff & ~(GF.out | GF.done)
        if (Number.isFinite(msg.c)) r.c = Math.max(0, Math.min(999, Math.floor(Number(msg.c))))
        r.lastAt = now
        return
      }
      case 'fin': {
        if (r.status !== 'racing') return
        // the finish line has to be within reach of what we last heard (and of what's possible at all)
        const reach = r.d + (now - r.lastAt) * 0.6 + 60
        if (reach < this.length || this.maxD(t) < this.length) {
          r.susp++
          return
        }
        r.d = this.length
        r.status = 'done'
        // the racer's own clock (their start message arrived a little after ours), within what we saw
        const claimed = Number(msg.tm)
        r.doneMs = Math.round(Number.isFinite(claimed) ? Math.max(t - 1500, Math.min(t, claimed)) : t)
        this.finished(r, now)
        return
      }
      case 'out': {
        if (this.game !== 'runner' || r.status !== 'racing') return
        const d = Number(msg.d)
        if (Number.isFinite(d)) r.d = Math.max(0, Math.min(r.d + 30, d, this.maxD(t)))
        r.status = 'out'
        r.doneMs = t
        this.host.broadcast({ t: 'mp', k: 'ev', e: { k: 'out', i: r.i, d: Math.round(r.d) } })
        return
      }
      case 'drop': {
        // a runner who's out sends a Showtime dancer into a lane ahead of someone still running
        if (this.game !== 'runner' || r.status === 'racing' || r.status === 'left' || r.drops <= 0 || now - r.dropAt < 4000) return
        const target = this.racers[Number(msg.to)]
        const lane = Number(msg.lane)
        if (!target || target.status !== 'racing' || !(lane === 0 || lane === 1 || lane === 2)) return
        r.drops--
        r.dropAt = now
        const d = Math.round(target.d + Math.max(34, runSpeed(t / 1000) * 2.4))
        if (target.run) target.incoming.push({ d, lane })
        this.host.broadcast({ t: 'mp', k: 'ev', e: { k: 'drop', from: r.i, to: target.i, lane, d } })
        return
      }
    }
  }

  private maxD(t: number) {
    return this.game === 'sled' ? sledMaxDistance(t) : runMaxDistance(t)
  }
  private clampX(x: number) {
    if (!Number.isFinite(x)) return 0
    return this.game === 'sled' ? Math.max(-SLED.halfW - 80, Math.min(SLED.halfW + 80, x)) : Math.max(0, Math.min(2, x))
  }

  private finished(r: Racer, now: number) {
    const place = this.racers.filter((x) => x.status === 'done').length
    this.host.broadcast({ t: 'mp', k: 'ev', e: { k: 'fin', i: r.i, place, tm: r.doneMs } })
    if (!this.endAt) {
      this.endAt = now + this.graceMs
      this.host.broadcast({ t: 'mp', k: 'ev', e: { k: 'end', ms: this.graceMs } })
    }
  }

  leave(userId: string) {
    const r = this.slotOf(userId)
    if (!r || r.status === 'left' || this.ended) return
    // someone who already finished (or is out) keeps their result; anyone mid-race forfeits it
    if (r.status === 'racing') {
      r.status = 'left'
      this.host.broadcast({ t: 'mp', k: 'ev', e: { k: 'left', i: r.i } })
    }
  }

  online(userId: string, on: boolean) {
    const r = this.slotOf(userId)
    if (!r) return
    r.online = on
    if (!on) r.offAt = Date.now()
    else if (r.status === 'racing') this.host.broadcast({ t: 'mp', k: 'ev', e: { k: 'back', i: r.i } })
  }

  tick(now: number) {
    if (this.ended) return
    const dt = Math.min(0.25, Math.max(0, (now - this.lastTick) / 1000))
    this.lastTick = now
    const t = this.elapsed(now)
    if (t < 0) return
    // the city locals race too
    for (const r of this.racers) {
      if (!r.bot || r.status !== 'racing') continue
      this.stepBot(r, t / 1000, dt)
    }
    // a racer whose connection dropped for good is out of this one
    for (const r of this.racers) {
      if (r.bot || r.status !== 'racing') continue
      if (!r.online && now - r.offAt > OFFLINE_DNF_MS) {
        r.status = 'left'
        this.host.broadcast({ t: 'mp', k: 'ev', e: { k: 'left', i: r.i } })
      }
    }
    const humansRacing = this.racers.some((r) => !r.bot && r.status === 'racing')
    const anyRacing = this.racers.some((r) => r.status === 'racing')
    // nobody real is still racing: give the locals a moment, then fast-forward them to their own finish
    if (!humansRacing && anyRacing) {
      if (!this.fastForward) this.fastForward = now + 2500
      else if (now > this.fastForward) return this.finishLocals(t)
    }
    this.broadcastGhosts(t)
    if (!anyRacing || t > this.capMs || (this.endAt && now >= this.endAt)) this.finish(t)
  }

  private stepBot(r: Racer, ts: number, dt: number) {
    if (r.sled && this.sledCourse) {
      stepSledBot(r.sled, this.sledCourse, ts, dt)
      const b = r.sled
      r.d = b.w
      r.x = b.v
      r.v = b.speed
      r.f = (b.air > 1 ? GF.air : 0) | (ts < b.crashUntil ? GF.crash : 0) | (ts < b.boostUntil ? GF.boost : 0)
      r.c = b.cocoa
      if (b.done) {
        r.status = 'done'
        r.doneMs = b.doneMs
        this.finished(r, Date.now())
      }
    } else if (r.run && this.runCourse) {
      const b = r.run
      // a Showtime dancer in this local's lane: the good ones see it coming
      for (const inc of r.incoming) {
        if (b.d < inc.d && b.d + runSpeed(ts) * dt >= inc.d) {
          if (Math.round(b.x) === inc.lane && b.roll() > b.skill * 0.85) {
            if (ts - b.stumbleAt < RUN.stumbleWindowS) b.out = true
            else {
              b.stumbleAt = ts
              b.slowUntil = ts + RUN.stumbleS
            }
          }
        }
      }
      r.incoming = r.incoming.filter((inc) => inc.d > b.d)
      const others: RunNear[] = []
      for (const o of this.racers) if (o !== r && o.status === 'racing') others.push({ d: o.d, x: o.x })
      stepRunBot(b, this.runCourse, ts, dt, others)
      r.d = b.d
      r.x = b.x
      r.v = runSpeed(ts)
      r.c = b.cards
      r.f = (ts < b.airUntil ? GF.air : 0) | (ts < b.slideUntil ? GF.slide : 0) | (ts < b.slowUntil ? GF.crash : 0)
      if (b.out) {
        r.status = 'out'
        r.doneMs = Math.round(ts * 1000)
        this.host.broadcast({ t: 'mp', k: 'ev', e: { k: 'out', i: r.i, d: Math.round(r.d) } })
      } else if (b.done) {
        r.status = 'done'
        r.doneMs = b.doneMs
        this.finished(r, Date.now())
      }
    }
  }

  /** everyone real is done: run the locals' races out to their end, instantly */
  private finishLocals(t: number) {
    let ts = t / 1000
    for (let k = 0; k < 4000 && this.racers.some((r) => r.status === 'racing'); k++) {
      ts += 0.1
      for (const r of this.racers) if (r.bot && r.status === 'racing') this.stepBot(r, ts, 0.1)
      if (ts * 1000 > this.capMs) break
    }
    this.finish(Math.round(ts * 1000))
  }

  private broadcastGhosts(t: number) {
    const now = Date.now()
    const p: GhostWire[] = this.racers.map((r) => [
      r.i,
      // a real player's last report is up to a tick old (their reports and this broadcast don't line up): carry it to
      // now at the speed they reported, so the stamp and the distance agree. Display only; the result uses r.d.
      Math.round((r.bot || r.status !== 'racing' ? r.d : Math.min(this.length, r.d + r.v * Math.min(0.25, Math.max(0, now - r.lastAt) / 1000))) * 10) / 10,
      Math.round(r.x * 100) / 100,
      Math.round(r.v),
      r.f | (r.status === 'out' || r.status === 'left' ? GF.out : 0) | (r.status === 'done' ? GF.done : 0),
    ])
    this.host.broadcast({ t: 'mp', k: 'gh', tm: Math.round(t), p })
  }

  /** places, scores and (in teams) the team result */
  private finish(t: number) {
    if (this.ended) return
    this.ended = true
    const rank = (r: Racer) => (r.status === 'done' ? 0 : r.status === 'left' ? 2 : 1)
    const order = [...this.racers].sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? a.doneMs - b.doneMs : b.d - a.d))
    const n = order.length
    const standings: Standing[] = order.map((r, k) => ({
      id: r.id,
      name: r.name,
      look: r.look,
      bot: r.bot,
      place: k + 1,
      score: this.game === 'sled' ? (r.status === 'done' ? r.doneMs : 0) : Math.round(r.d),
      team: r.team,
      won: false,
      dnf: this.game === 'sled' ? r.status !== 'done' && r.status !== 'left' : false,
      left: r.status === 'left',
      // more than a few impossible reports means we don't believe the run
      void: r.susp > 6,
      stat: this.game === 'sled' ? `${r.c} iced ${r.c === 1 ? 'coffee' : 'coffees'}` : `${r.c} MetroCards`,
    }))
    let teams: { up: number; down: number; win: MpTeam } | undefined
    if (this.mode === 'teams') {
      const pts = { up: 0, down: 0 }
      for (const s of standings) if (s.team && !s.left) pts[s.team] += teamPoints(s.place, n)
      const first = standings.find((s) => s.team)
      const win: MpTeam = pts.up > pts.down ? 'up' : pts.down > pts.up ? 'down' : first?.team ?? 'up'
      teams = { up: pts.up, down: pts.down, win }
      for (const s of standings) s.won = s.team === win && !s.left
    } else if (standings[0] && !standings[0].left) standings[0].won = true
    this.host.end({ standings, teams, data: { seed: this.seed, raceMs: Math.max(0, Math.round(t)) } })
  }
}

/** where rider i of n lines up across the start line */
export function startLateral(i: number, n: number): number {
  if (n <= 1) return 0
  const span = Math.min(SLED.halfW * 1.5, 90 * (n - 1))
  return -span / 2 + (span * i) / (n - 1)
}
