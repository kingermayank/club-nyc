/**
 * The Pilgrim Hill Sled Race: the course and the rules, shared by every browser and the server.
 *
 * A Club Penguin Sled Racing homage: a diagonal hill seen from above, 2-4 sledders, steer across the slope, hop
 * over the small stuff. Crashes cost time, never the race. Like Club Penguin's runs, a course is built from a
 * small library of segments (rocks, logs with a gap, moguls, ice, ramps, a runaway hot dog cart…), picked by a
 * seed, so every browser builds the same hill from one number. Units: `w` is distance down the hill, `v` is across
 * it (positive = the up-right side of the screen).
 */
import { seeded, between, pickOf } from './rng'

export const SLED = {
  halfW: 180,
  length: 15200,
  /** speed on the snow (units/s) and how quickly you get there */
  vCruise: 300,
  accel: 210,
  /** steering: lateral speed and how quickly it responds */
  steer: 260,
  steerAccel: 1700,
  /** hop (Space): air time, cooldown after landing, height */
  hopS: 0.48,
  hopCooldownS: 0.6,
  hopH: 30,
  /** ramps: air time and height */
  rampS: 1.0,
  rampH: 70,
  /** a crash: how long you spin, and how slow it leaves you */
  crashS: 1.0,
  crashMult: 0.3,
  cocoaS: 1.7,
  cocoaMult: 1.4,
  iceMult: 1.2,
  bumpMult: 0.72,
  snowmanMult: 0.6,
  deepSnowMult: 0.7,
  /** slipstream: right behind someone (30-150 units back, within 34 across) you go a little faster */
  draftMult: 1.08,
  /** catch-up: more than this far behind the leader, a small push (shown as "Tailwind") */
  catchupGap: 360,
  catchupMult: 1.05,
  radius: 20,
  capMs: 100_000,
  /** once someone's down the hill, the rest have this long (generous: newcomers crash a lot) */
  graceMs: 20_000,
  countdownMs: 3500,
}

/** the server's ceiling: nobody can be further down the hill than this at race time t (ms) */
export const sledMaxDistance = (tMs: number) => 450 * (tMs / 1000) + 320

export type SledKind = 'rock' | 'boulder' | 'log' | 'bump' | 'ice' | 'cocoa' | 'ramp' | 'pine' | 'snowman' | 'cart' | 'bank' | 'flag'
export interface SledObj {
  id: number
  k: SledKind
  w: number
  v: number
  /** radius (or half length along the hill for banks and ice) */
  r: number
  /** logs: the gap across (v from g0 to g1) */
  g0?: number
  g1?: number
  /** banks: deep snow from |v| = this outward, for `len` units down the hill */
  len?: number
  side?: -1 | 1
  /** the cart: swings across between v0 and v1, one round trip every `per` seconds */
  v0?: number
  v1?: number
  per?: number
  ph?: number
  /** a variant for the art (which rock, which pine) */
  var: number
}
export interface SledDecor {
  k: 'pine' | 'lamp' | 'bench' | 'rock' | 'statue' | 'arch' | 'crowd' | 'stand' | 'sign' | 'fence'
  w: number
  v: number
  var: number
}
export interface SledCourse {
  objs: SledObj[]
  decor: SledDecor[]
  segs: { k: string; w0: number; w1: number }[]
}

export const SEGMENT_NAMES: Record<string, string> = {
  warmup: 'The Top', scatter: 'Rock Garden', logs: 'Log Jam', slalom: 'Slalom', moguls: 'Moguls', ice: 'The Ice Rink',
  cart: 'Runaway Cart', ramp: 'Big Air', pines: 'Pine Grove', snowmen: 'Snowman Row', narrows: 'The Narrows', finish: 'The Bottom',
}

/** Build the hill for a seed. Every segment leaves a way through for a careful sledder. */
export function sledCourse(seed: number): SledCourse {
  const r = seeded(seed ^ 0x534c4544)
  const objs: SledObj[] = []
  const decor: SledDecor[] = []
  const segs: SledCourse['segs'] = []
  let id = 0
  const add = (o: Omit<SledObj, 'id' | 'var'> & { var?: number }) => objs.push({ var: Math.floor(r() * 4), ...o, id: id++ })
  const W = SLED.halfW
  const lane = () => between(r, -W + 40, W - 40)

  const SEGS: Record<string, (w0: number) => number> = {
    warmup(w0) {
      add({ k: 'cocoa', w: w0 + 520, v: between(r, -60, 60), r: 18 })
      add({ k: 'rock', w: w0 + 760, v: between(r, -120, 120), r: 16 })
      return 900
    },
    scatter(w0) {
      const placed: [number, number][] = []
      for (let i = 0; i < 9; i++) {
        let w = 0, v = 0, tries = 0
        do {
          w = w0 + between(r, 80, 900)
          v = lane()
          tries++
        } while (tries < 20 && placed.some(([pw, pv]) => Math.abs(pw - w) < 120 && Math.abs(pv - v) < 90))
        placed.push([w, v])
        add({ k: i < 2 ? 'boulder' : 'rock', w, v, r: i < 2 ? 30 : 16 })
      }
      add({ k: 'cocoa', w: w0 + between(r, 300, 700), v: lane(), r: 18 })
      return 1000
    },
    logs(w0) {
      for (const at of [260, 760]) {
        const gapC = pickOf(r, [-W + 75, 0, W - 75]) + between(r, -20, 20)
        add({ k: 'log', w: w0 + at, v: 0, r: 14, g0: gapC - 62, g1: gapC + 62 })
        add({ k: 'cocoa', w: w0 + at + 160, v: gapC, r: 18 })
      }
      return 1050
    },
    slalom(w0) {
      let side = r() < 0.5 ? -1 : 1
      for (let i = 0; i < 5; i++) {
        add({ k: 'boulder', w: w0 + 180 + i * 190, v: side * between(r, 50, 120), r: 30 })
        side = -side
      }
      add({ k: 'ice', w: w0 + 600, v: 0, r: 120 })
      return 1150
    },
    moguls(w0) {
      for (let row = 0; row < 3; row++) {
        const skip = Math.floor(r() * 5)
        for (let k = 0; k < 5; k++) if (k !== skip) add({ k: 'bump', w: w0 + 200 + row * 260 + between(r, -30, 30), v: -W + 36 + k * ((2 * W - 72) / 4), r: 24 })
      }
      add({ k: 'cocoa', w: w0 + 860, v: lane(), r: 18 })
      return 1000
    },
    ice(w0) {
      add({ k: 'ice', w: w0 + 300, v: between(r, -90, 90), r: 150 })
      add({ k: 'ice', w: w0 + 720, v: between(r, -90, 90), r: 130 })
      for (let i = 0; i < 3; i++) add({ k: 'rock', w: w0 + 200 + i * 260, v: lane(), r: 16 })
      return 950
    },
    cart(w0) {
      // Sal's hot dog cart got away from him at the top. It's still going.
      add({ k: 'cart', w: w0 + 480, v: 0, r: 34, v0: -W + 30, v1: W - 30, per: between(r, 3.2, 4.2), ph: r() })
      add({ k: 'cocoa', w: w0 + 300, v: lane(), r: 18 })
      add({ k: 'cocoa', w: w0 + 700, v: lane(), r: 18 })
      return 950
    },
    ramp(w0) {
      add({ k: 'ramp', w: w0 + 260, v: 0, r: 22 })
      // treats you can only reach in the air
      add({ k: 'cocoa', w: w0 + 420, v: between(r, -80, 80), r: 20, var: 9 })
      add({ k: 'rock', w: w0 + 760, v: lane(), r: 16 })
      return 950
    },
    pines(w0) {
      const mid = between(r, -60, 60)
      add({ k: 'pine', w: w0 + 300, v: mid, r: 34 })
      add({ k: 'pine', w: w0 + 360, v: mid + between(r, -40, 40), r: 34 })
      add({ k: 'pine', w: w0 + 700, v: r() < 0.5 ? -W + 50 : W - 50, r: 34 })
      add({ k: 'cocoa', w: w0 + 520, v: mid > 0 ? -110 : 110, r: 18 })
      return 950
    },
    snowmen(w0) {
      const gap = Math.floor(r() * 5)
      for (let k = 0; k < 5; k++) if (k !== gap) add({ k: 'snowman', w: w0 + 420, v: -W + 36 + k * ((2 * W - 72) / 4), r: 22 })
      add({ k: 'rock', w: w0 + 180, v: lane(), r: 16 })
      return 800
    },
    narrows(w0) {
      add({ k: 'bank', w: w0 + 150, v: W * 0.45, r: 0, len: 650, side: 1 })
      add({ k: 'bank', w: w0 + 150, v: W * 0.45, r: 0, len: 650, side: -1 })
      add({ k: 'cocoa', w: w0 + 450, v: 0, r: 18 })
      add({ k: 'bump', w: w0 + 300, v: between(r, -40, 40), r: 22 })
      return 900
    },
  }
  const pool = ['scatter', 'logs', 'slalom', 'moguls', 'ice', 'cart', 'ramp', 'pines', 'snowmen', 'narrows']
  let w = 0
  w += SEGS.warmup(w)
  segs.push({ k: 'warmup', w0: 0, w1: w })
  let last = ''
  const used = new Set<string>()
  while (w < SLED.length - 1000) {
    // every segment once before any repeats, never twice in a row
    const fresh = pool.filter((k) => !used.has(k) && k !== last)
    const k = pickOf(r, fresh.length ? fresh : pool.filter((x) => x !== last))
    used.add(k)
    if (used.size === pool.length) used.clear()
    const w0 = w
    w += SEGS[k](w0)
    segs.push({ k, w0, w1: w })
    last = k
  }
  segs.push({ k: 'finish', w0: w, w1: SLED.length + 900 })
  // course flags: red on the left edge, blue on the right, every 300 units
  for (let fw = 300; fw < SLED.length; fw += 300) {
    add({ k: 'flag', w: fw, v: -W - 14, r: 0, var: 0 })
    add({ k: 'flag', w: fw, v: W + 14, r: 0, var: 1 })
  }
  // the park beyond the course: pines, lamps and benches on both sides; the Pilgrim at the top; the crowd at the bottom
  decor.push({ k: 'statue', w: -170, v: -40, var: 0 }, { k: 'sign', w: 60, v: -W - 90, var: 0 })
  for (let dw = -400; dw < SLED.length + 900; dw += between(r, 70, 150)) {
    for (const side of [-1, 1]) {
      if (r() < 0.25) continue
      const off = W + between(r, 70, 330)
      const roll = r()
      const k: SledDecor['k'] = roll < 0.8 ? 'pine' : roll < 0.88 ? 'lamp' : roll < 0.94 ? 'bench' : 'rock'
      decor.push({ k, w: dw + between(r, -20, 20), v: side * off, var: Math.floor(r() * 4) })
    }
  }
  decor.push({ k: 'arch', w: SLED.length, v: 0, var: 0 })
  for (let i = 0; i < 6; i++) decor.push({ k: 'crowd', w: SLED.length + 160 + i * 60, v: (i % 2 ? 1 : -1) * (W + 60 + (i % 3) * 30), var: i })
  decor.push({ k: 'stand', w: SLED.length + 380, v: -W - 140, var: 0 })
  objs.sort((a, b) => a.w - b.w)
  decor.sort((a, b) => a.w - b.w)
  return { objs, decor, segs }
}

/** where the runaway cart is at race time t (s) */
export function cartV(o: SledObj, t: number): number {
  const mid = ((o.v0 ?? 0) + (o.v1 ?? 0)) / 2
  const amp = ((o.v1 ?? 0) - (o.v0 ?? 0)) / 2
  return mid + amp * Math.sin(((t / (o.per ?? 4)) + (o.ph ?? 0)) * Math.PI * 2)
}

/** deep snow at this spot (outside the course, or a bank in the narrows) */
export function inDeepSnow(course: SledCourse, w: number, v: number): boolean {
  if (Math.abs(v) > SLED.halfW) return true
  for (const o of course.objs) {
    if (o.w > w) break
    if (o.k === 'bank' && w < o.w + (o.len ?? 0) && Math.sign(v) === o.side && Math.abs(v) > o.v) return true
  }
  return false
}

export type SledHit = { o: SledObj; what: 'crash' | 'bump' | 'snowman' | 'cocoa' | 'ice' | 'ramp' }

/**
 * What a sledder at lateral `v` runs into while sliding from w0 to w1 at race time t (s). `air` is how high they
 * are: hopping clears rocks, bumps and snowmen; nothing clears a log, a pine, a boulder or the cart except the gap
 * or going around. Cocoa up in the air needs air to reach.
 */
export function sledHits(course: SledCourse, w0: number, w1: number, v: number, air: number, t: number, from = 0): { hits: SledHit[]; next: number } {
  const hits: SledHit[] = []
  const objs = course.objs
  let i = from
  while (i < objs.length && objs[i].w + 200 < w0) i++
  const next = i
  for (; i < objs.length; i++) {
    const o = objs[i]
    if (o.w - 200 > w1) break
    if (o.k === 'flag' || o.k === 'bank') continue
    const R = SLED.radius
    if (o.k === 'log') {
      if (o.w + o.r >= w0 && o.w - o.r <= w1 && !(v > (o.g0 ?? 0) + R * 0.5 && v < (o.g1 ?? 0) - R * 0.5) && air < 40) hits.push({ o, what: 'crash' })
      continue
    }
    if (o.k === 'ramp') {
      if (o.w >= w0 && o.w < w1 && air < 1) hits.push({ o, what: 'ramp' })
      continue
    }
    if (o.k === 'ice') {
      if (Math.abs(o.w - w1) < o.r && Math.abs(o.v - v) < 46 && air < 1) hits.push({ o, what: 'ice' })
      continue
    }
    const ov = o.k === 'cart' ? cartV(o, t) : o.v
    // passing this object between w0 and w1 (swept along the hill, a circle across it)
    const near = o.w + o.r + R >= w0 && o.w - o.r - R <= w1 && Math.abs(ov - v) < o.r + R
    if (!near) continue
    if (o.k === 'cocoa') {
      if (o.var === 9 ? air > 30 : air < 36) hits.push({ o, what: 'cocoa' })
    } else if (o.k === 'rock') {
      if (air < 14) hits.push({ o, what: 'crash' })
    } else if (o.k === 'bump') {
      if (air < 12) hits.push({ o, what: 'bump' })
    } else if (o.k === 'snowman') {
      if (air < 20) hits.push({ o, what: 'snowman' })
    } else if (air < 50) hits.push({ o, what: 'crash' })
  }
  return { hits, next }
}

// ---------- the city locals who race too (run by the server) ----------
export interface SledBot {
  skill: number
  w: number
  v: number
  speed: number
  vLat: number
  crashUntil: number
  boostUntil: number
  air: number
  airUntil: number
  airStart: number
  airH: number
  done: boolean
  doneMs: number
  idx: number
  target: number
  roll: () => number
  used: Set<number>
  crashes: number
}

export function makeSledBot(seed: number, slot: number, skill: number, v: number): SledBot {
  return { skill, w: 0, v, speed: 0, vLat: 0, crashUntil: 0, boostUntil: 0, air: 0, airUntil: 0, airStart: 0, airH: 0, done: false, doneMs: 0, idx: 0, target: v, roll: seeded(seed * 17 + slot * 104729 + 3), used: new Set(), crashes: 0 }
}

/** advance a local by dt seconds at race time t (seconds) */
export function stepSledBot(b: SledBot, course: SledCourse, t: number, dt: number) {
  if (b.done) return
  const crashed = t < b.crashUntil
  // locals are good, not perfect: a person who steers well beats them, a person who crashes a lot still finishes near them
  let target = SLED.vCruise * (0.86 + 0.08 * b.skill)
  if (t < b.boostUntil) target *= SLED.cocoaMult
  if (crashed) target *= SLED.crashMult
  if (inDeepSnow(course, b.w, b.v)) target *= SLED.deepSnowMult
  b.speed += Math.sign(target - b.speed) * Math.min(Math.abs(target - b.speed), (crashed ? 900 : SLED.accel) * dt)
  // pick a line: look a little ahead and steer for the gap that's clearest (better locals look further)
  const look = 260 + b.skill * 220
  if (b.roll() < dt * 3) {
    let best = b.target
    let bestCost = Infinity
    for (let cand = -SLED.halfW + 30; cand <= SLED.halfW - 30; cand += 30) {
      let cost = Math.abs(cand - b.v) * 0.02
      for (const o of course.objs) {
        if (o.w < b.w) continue
        if (o.w > b.w + look) break
        if (o.k === 'log' && !(cand > (o.g0 ?? 0) + 14 && cand < (o.g1 ?? 0) - 14)) cost += 50
        else if ((o.k === 'rock' || o.k === 'boulder' || o.k === 'pine' || o.k === 'snowman' || o.k === 'bump') && Math.abs(o.v - cand) < o.r + 26) cost += o.k === 'bump' ? 6 : 30
        else if (o.k === 'cart' && Math.abs(cartV(o, t + (o.w - b.w) / Math.max(120, b.speed)) - cand) < o.r + 30) cost += 30
        else if (o.k === 'cocoa' && o.var !== 9 && Math.abs(o.v - cand) < 30) cost -= 4
        else if (o.k === 'ice' && Math.abs(o.v - cand) < 40) cost -= 2
        else if (o.k === 'bank' && b.w + look > o.w && Math.sign(cand) === o.side && Math.abs(cand) > o.v) cost += 8
      }
      cost += b.roll() * 3 * (1 - b.skill)
      if (cost < bestCost) {
        bestCost = cost
        best = cand
      }
    }
    b.target = best
  }
  const want = Math.max(-1, Math.min(1, (b.target - b.v) / 40)) * SLED.steer * (crashed ? 0 : 1)
  b.vLat += Math.sign(want - b.vLat) * Math.min(Math.abs(want - b.vLat), SLED.steerAccel * dt)
  const w0 = b.w
  b.w += b.speed * dt
  b.v = Math.max(-SLED.halfW - 60, Math.min(SLED.halfW + 60, b.v + b.vLat * dt))
  // air
  b.air = t < b.airUntil ? Math.sin(((t - b.airStart) / (b.airUntil - b.airStart)) * Math.PI) * b.airH : 0
  const { hits, next } = sledHits(course, w0, b.w, b.v, b.air, t, b.idx)
  b.idx = next
  for (const h of hits) {
    if (b.used.has(h.o.id)) continue
    b.used.add(h.o.id)
    if (h.what === 'ramp') {
      b.airStart = t
      b.airUntil = t + SLED.rampS
      b.airH = SLED.rampH
    } else if (h.what === 'cocoa') b.boostUntil = t + SLED.cocoaS
    else if (h.what === 'bump') b.speed *= SLED.bumpMult
    else if (h.what === 'snowman') b.speed *= SLED.snowmanMult
    else if (h.what === 'crash' && t >= b.crashUntil) {
      // locals make mistakes too, but the good ones hop more often
      if (b.roll() < b.skill * 0.55 && h.o.k !== 'log' && h.o.k !== 'pine' && h.o.k !== 'boulder') continue
      b.crashUntil = t + SLED.crashS
      b.crashes++
    }
  }
  if (b.w >= SLED.length) {
    b.done = true
    b.doneMs = Math.round(t * 1000)
  }
}
