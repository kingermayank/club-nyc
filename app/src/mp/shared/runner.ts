/**
 * Rush Hour Run: the course and the rules, shared by every browser and the server.
 *
 * Three lanes down an endless Times Square platform at rush hour, heading downtown on the 1 line (a station sign
 * every 100 m, last stop South Ferry). Everyone gets the same seeded course; speed is a function of the race clock,
 * so nobody is faster by default: you lose ground by stumbling and gain it with Express diamonds. Distances are
 * metres. Original game: no tracks, no trains to dodge, no inspector chasing you; the platform is the obstacle course.
 */
import { seeded, between, pickOf } from './rng'

export const RUN = {
  lanes: 3,
  /** metres between lane centres */
  laneW: 1.3,
  /** speed (m/s) at the start, its top, and how fast it climbs (m/s per second of race clock) */
  v0: 10,
  vMax: 20,
  accel: 0.2,
  /** Times Sq to South Ferry */
  length: 1300,
  /** the race clock never runs past this */
  capMs: 105_000,
  /** once someone reaches South Ferry, the rest have this long */
  graceMs: 15_000,
  countdownMs: 3500,
  /** jumps and slides last this long (s); a lane change this long */
  jumpS: 0.62,
  slideS: 0.62,
  laneS: 0.14,
  jumpH: 1.35,
  /** a second bump this soon after a stumble ends the run */
  stumbleWindowS: 6,
  stumbleS: 0.9,
  stumbleMult: 0.55,
  expressS: 3,
  expressMult: 1.45,
  catS: 7,
  /** someone who's out can send this many Showtime dancers, one every few seconds */
  drops: 2,
  dropCooldownS: 4,
  /** running right behind someone (same lane, 3-14 m back) */
  draftMult: 1.06,
}

export const STATIONS = ['Times Sq–42 St', '34 St–Penn Station', '28 St', '23 St', '18 St', '14 St', 'Christopher St', 'Houston St', 'Canal St', 'Franklin St', 'Chambers St', 'WTC Cortlandt', 'Rector St', 'South Ferry']
/** distance of the n-th station sign (South Ferry is the finish) */
export const stationAt = (i: number) => (i * RUN.length) / (STATIONS.length - 1)

/** base speed at race time t (s): everyone's the same, stumbles and diamonds change yours */
export const runSpeed = (t: number) => Math.min(RUN.vMax, RUN.v0 + RUN.accel * Math.max(0, t))
/** distance covered at base speed after t seconds */
export function runDistance(t: number): number {
  t = Math.max(0, t)
  const tTop = (RUN.vMax - RUN.v0) / RUN.accel
  if (t <= tTop) return RUN.v0 * t + (RUN.accel * t * t) / 2
  return RUN.v0 * tTop + (RUN.accel * tTop * tTop) / 2 + RUN.vMax * (t - tTop)
}
/** the server's ceiling: nobody can be further than this at race time t (ms), diamonds included */
export const runMaxDistance = (tMs: number) => runDistance(tMs / 1000) * 1.2 + 25

// ---------- the course ----------
export type RunKind = 'turnstile' | 'sign' | 'wetfloor' | 'bucket' | 'bench' | 'rat' | 'trash' | 'commuter' | 'mattress' | 'column'
export type RunAct = 'jump' | 'slide' | 'dodge'
export const RUN_KIND: Record<RunKind, { act: RunAct; label: string }> = {
  turnstile: { act: 'jump', label: 'Turnstiles' },
  sign: { act: 'slide', label: 'Low sign' },
  wetfloor: { act: 'jump', label: 'Wet floor' },
  bucket: { act: 'jump', label: 'Mop bucket' },
  bench: { act: 'jump', label: 'Bench' },
  rat: { act: 'jump', label: 'Pizza Rat' },
  trash: { act: 'dodge', label: 'Trash can' },
  commuter: { act: 'dodge', label: 'Someone on their phone' },
  mattress: { act: 'slide', label: 'Mattress delivery' },
  column: { act: 'dodge', label: 'Column' },
}
export interface RunObstacle {
  d: number
  lane: number
  kind: RunKind
  /** a variant number (which commuter look, which way the rat faces) */
  v: number
}
export type RunPickupKind = 'card' | 'express' | 'cat'
export interface RunPickup {
  d: number
  lane: number
  kind: RunPickupKind
  /** height above the floor (cards arc over jumps) */
  h: number
}
export interface RunRow {
  d: number
  /** per lane: 'run' (clear), the action that clears it, or 'block' (dodge-only) */
  lanes: ('run' | 'jump' | 'slide' | 'block')[]
}
export interface RunCourse {
  obstacles: RunObstacle[]
  pickups: RunPickup[]
  rows: RunRow[]
}

const LOW: RunKind[] = ['wetfloor', 'bucket', 'bench', 'rat']
const TALL: RunKind[] = ['trash', 'commuter', 'column', 'trash', 'commuter']

/** The whole course for a seed. Every row leaves a way through, and rows are far enough apart to react at speed. */
export function runnerCourse(seed: number): RunCourse {
  const r = seeded(seed ^ 0x52554e)
  const obstacles: RunObstacle[] = []
  const pickups: RunPickup[] = []
  const rows: RunRow[] = []
  let d = 46
  let lastFree = 1
  let nextExpress = between(r, 170, 260)
  let nextCat = between(r, 300, 380)
  while (d < RUN.length - 30) {
    const diff = Math.min(1, d / RUN.length)
    const v = runSpeed(timeAtBase(d))
    const lanes: RunRow['lanes'] = ['run', 'run', 'run']
    const put = (lane: number, kind: RunKind) => {
      obstacles.push({ d, lane, kind, v: Math.floor(r() * 8) })
      lanes[lane] = RUN_KIND[kind].act === 'dodge' ? 'block' : RUN_KIND[kind].act
    }
    const roll = r()
    if (roll < 0.26 - diff * 0.1) {
      // one thing in one lane
      put(Math.floor(r() * 3), r() < 0.5 ? pickOf(r, LOW) : pickOf(r, TALL))
    } else if (roll < 0.56) {
      // two lanes blocked, the third is the way (never the lane you had to be in last row AND the far side, too mean)
      let free = Math.floor(r() * 3)
      if (Math.abs(free - lastFree) === 2 && r() < 0.6) free = 1
      for (let l = 0; l < 3; l++) if (l !== free) put(l, r() < 0.35 + diff * 0.25 ? pickOf(r, TALL) : pickOf(r, LOW))
    } else if (roll < 0.7) {
      // a bank of turnstiles across the platform: jump
      for (let l = 0; l < 3; l++) put(l, 'turnstile')
    } else if (roll < 0.82) {
      // a low sign across the platform: slide
      for (let l = 0; l < 3; l++) put(l, 'sign')
    } else {
      // mixed: one lane closed, the other two need a jump or a slide
      const closed = Math.floor(r() * 3)
      const act: RunKind = r() < 0.5 ? 'turnstile' : r() < 0.5 ? 'sign' : 'mattress'
      for (let l = 0; l < 3; l++) put(l, l === closed ? pickOf(r, TALL) : act)
    }
    rows.push({ d, lanes })
    const free = lanes.findIndex((x) => x === 'run')
    lastFree = free >= 0 ? free : 1
    // the gap to the next row, in seconds at the speed you'll have there (tighter later on)
    const gapS = between(r, 1.05, 1.6) - diff * 0.38
    const gap = Math.max(15, v * gapS)
    // MetroCards in the gap: a line in a clear lane, or an arc over a jump
    const mid = d + gap / 2
    const pr = r()
    if (pr < 0.45) {
      const lane = Math.floor(r() * 3)
      const n = 4 + Math.floor(r() * 4)
      for (let k = 0; k < n; k++) pickups.push({ d: mid - (n * 2.4) / 2 + k * 2.4, lane, kind: 'card', h: 0.55 })
    } else if (pr < 0.65) {
      const jl = lanes.findIndex((x) => x === 'jump')
      if (jl >= 0) for (let k = -2; k <= 2; k++) pickups.push({ d: d + k * 2.2, lane: jl, kind: 'card', h: 0.55 + RUN.jumpH * Math.cos((k / 2.6) * (Math.PI / 2)) })
    }
    // the specials sit in the middle of a gap, in a lane that's clear on both sides
    const special = (kind: RunPickupKind) => pickups.push({ d: mid, lane: Math.floor(r() * 3), kind, h: 0.75 })
    if (mid > nextExpress) {
      special('express')
      nextExpress = mid + between(r, 220, 320)
    } else if (mid > nextCat) {
      special('cat')
      nextCat = mid + between(r, 280, 380)
    }
    d += gap
  }
  return { obstacles, pickups, rows }
}

/** race time (s) at which base speed reaches distance d */
export function timeAtBase(d: number): number {
  const tTop = (RUN.vMax - RUN.v0) / RUN.accel
  const dTop = runDistance(tTop)
  if (d >= dTop) return tTop + (d - dTop) / RUN.vMax
  // v0 t + a t^2 / 2 = d
  return (-RUN.v0 + Math.sqrt(RUN.v0 * RUN.v0 + 2 * RUN.accel * d)) / RUN.accel
}

// ---------- the city locals who race too (run by the server) ----------
export interface RunBot {
  skill: number
  d: number
  x: number
  lane: number
  out: boolean
  done: boolean
  doneMs: number
  /** race time (s) of the last stumble, and until when the stumble slows them */
  stumbleAt: number
  slowUntil: number
  airUntil: number
  slideUntil: number
  row: number
  cards: number
  roll: () => number
}

export function makeRunBot(seed: number, slot: number, skill: number): RunBot {
  return { skill, d: 0, x: 1, lane: 1, out: false, done: false, doneMs: 0, stumbleAt: -99, slowUntil: 0, airUntil: 0, slideUntil: 0, row: 0, cards: 0, roll: seeded(seed * 31 + slot * 7919 + 17) }
}

/** advance a local by dt seconds at race time t (seconds) */
export function stepRunBot(b: RunBot, course: RunCourse, t: number, dt: number) {
  if (b.out || b.done) return
  let mult = 1
  if (t < b.slowUntil) mult *= RUN.stumbleMult
  // a little personality: better locals hold their speed a hair better
  const v = runSpeed(t) * mult * (0.97 + b.skill * 0.03)
  b.d += v * dt
  // steer for the next row
  const next = course.rows[b.row]
  if (next) {
    const opts = next.lanes.map((x, l) => ({ l, x, cost: Math.abs(l - b.lane) + (x === 'run' ? 0 : x === 'block' ? 99 : 0.6) }))
    opts.sort((p, q) => p.cost - q.cost)
    const want = opts[0].l
    if (next.d - b.d < v * 0.9) b.lane = want
    if (b.d >= next.d) {
      const need = next.lanes[b.lane]
      const fail = b.roll() < 0.012 + (1 - b.skill) * 0.07
      if (need === 'jump') b.airUntil = t + 0.3
      if (need === 'slide') b.slideUntil = t + 0.3
      if (need === 'block' || fail) {
        if (t - b.stumbleAt < RUN.stumbleWindowS) b.out = true
        else {
          b.stumbleAt = t
          b.slowUntil = t + RUN.stumbleS
        }
      }
      b.row++
    }
  }
  b.x += Math.sign(b.lane - b.x) * Math.min(Math.abs(b.lane - b.x), dt / RUN.laneS)
  if (b.roll() < dt * 0.35) b.cards++
  if (b.d >= RUN.length) {
    b.d = RUN.length
    b.done = true
    b.doneMs = Math.round(t * 1000)
  }
}
