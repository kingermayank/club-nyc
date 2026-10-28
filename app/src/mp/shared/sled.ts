/**
 * The High Line Citi Bike Dash: the course and the rules, shared by every browser and the server.
 *
 * Internally this is still the "sled" game (the game id, the stamps and every saved result and leaderboard keep that
 * name): it started as a Club Penguin Sled Racing homage on Pilgrim Hill and moved to the High Line when there was no
 * snow to race on. Seen from above, 2-4 riders on Citi Bikes ride the old elevated freight line from Gansevoort St to
 * 34th St, steer across the path and hop over the small stuff. Crashes cost time, never the race. Like Club Penguin's
 * runs, a course is built from a small library of segments (a tour group, planters with a gap, old rail tracks, a
 * runaway gelato cart…), picked by a seed, so every browser builds the same ride from one number. A few stretches are
 * always where they really are: the Sundeck, the Chelsea Market Passage, 10th Ave Square, the Spur at 30th St.
 * Units: `w` is distance along the High Line (north), `v` is across it (positive = the up-right side of the screen,
 * the Hudson side).
 */
import { seeded, between, pickOf } from './rng'

export const SLED = {
  halfW: 180,
  length: 15200,
  /** cruising speed (units/s) and how quickly you get there */
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
  /** a wipeout: how long you spin, and how slow it leaves you */
  crashS: 1.0,
  crashMult: 0.3,
  /** an iced coffee: how long the boost lasts and how big it is */
  cocoaS: 1.7,
  cocoaMult: 1.4,
  /** fresh pavement */
  iceMult: 1.2,
  /** the old rail tracks */
  bumpMult: 0.72,
  /** riding into someone's selfie */
  snowmanMult: 0.6,
  /** off the path (the planting beds) or between the café tables in the Chelsea Market Passage */
  deepSnowMult: 0.7,
  /** slipstream: right behind someone (30-150 units back, within 34 across) you go a little faster */
  draftMult: 1.08,
  /** catch-up: more than this far behind the leader, a small push (a tailwind off the Hudson) */
  catchupGap: 360,
  catchupMult: 1.05,
  radius: 20,
  capMs: 100_000,
  /** once someone's at 34th St, the rest have this long (generous: newcomers crash a lot) */
  graceMs: 20_000,
  countdownMs: 3500,
}

/** the server's ceiling: nobody can be further along than this at race time t (ms) */
export const sledMaxDistance = (tMs: number) => 450 * (tMs / 1000) + 320

/** the High Line runs from Gansevoort St (about 13th St) to 34th St: the cross street at distance w */
export const STREET0 = 13
export const STREET1 = 34
export const streetAt = (w: number) => STREET0 + ((STREET1 - STREET0) * w) / SLED.length
export const streetW = (street: number) => ((street - STREET0) / (STREET1 - STREET0)) * SLED.length

export type SledKind =
  | 'pigeon' // small: hop it
  | 'tourist' // stopped for a photo: steer round
  | 'ranger' // the park ranger (bikes aren't allowed up here): steer round
  | 'lounger' // the Sundeck's rolling loungers: steer round
  | 'birch' // a birch tree in a planting bed: steer round
  | 'planter' // a row of planters across the path with a gap
  | 'rails' // a bit of old freight track: hop it or lose speed
  | 'selfie' // someone taking a selfie: hop past or lose speed
  | 'cart' // the runaway gelato cart
  | 'coffee' // iced coffee: a boost
  | 'fresh' // fresh pavement: free speed
  | 'ramp'
  | 'bank' // the Chelsea Market Passage: café tables at the sides
  | 'water' // the Sundeck's water feature (just a splash)
  | 'cone' // the course markers
export interface SledObj {
  id: number
  k: SledKind
  w: number
  v: number
  /** radius (or half length along the path for fresh pavement) */
  r: number
  /** planters: the gap across (v from g0 to g1) */
  g0?: number
  g1?: number
  /** banks and the water feature: from |v| = this outward (or, for water, from v to v1), for `len` units along */
  len?: number
  side?: -1 | 1
  /** the cart: swings across between v0 and v1, one round trip every `per` seconds */
  v0?: number
  v1?: number
  per?: number
  ph?: number
  /** a variant for the art (which pigeon, which tourist) */
  var: number
}
export interface SledDecor {
  k: 'birch' | 'flowers' | 'grass' | 'shrub' | 'bench' | 'track' | 'lounger' | 'street' | 'dock' | 'nobikes' | 'ranger' | 'hlsign' | 'arch' | 'crowd' | 'vessel'
  w: number
  v: number
  /** a variant; for a street sign, the street number (13 = Gansevoort St) */
  var: number
}
/** a stretch of the High Line with a building or a view drawn by the game (Chelsea Market, 10th Ave Square) */
export interface SledZone {
  k: 'market' | 'square' | 'sundeck'
  w0: number
  w1: number
}
export interface SledCourse {
  objs: SledObj[]
  decor: SledDecor[]
  segs: { k: string; w0: number; w1: number }[]
  zones: SledZone[]
}

/** what each stretch is called (shown as it comes up) */
export const SEGMENT_NAMES: Record<string, string> = {
  warmup: 'Gansevoort St',
  scatter: 'Tour Group',
  logs: 'The Planters',
  slalom: 'The Sundeck',
  moguls: 'Old Rail Tracks',
  ice: 'Fresh Pavement',
  cart: 'Runaway Gelato Cart',
  ramp: 'The Spur',
  pines: 'Birch Grove',
  snowmen: '10th Ave Square',
  narrows: 'Chelsea Market Passage',
  finish: 'Hudson Yards',
}

/** obstacles you can't hop: steer round them */
const BIG = new Set<SledKind>(['tourist', 'ranger', 'lounger', 'birch'])

/** Build the ride for a seed. Every segment leaves a way through for a careful rider. */
export function sledCourse(seed: number): SledCourse {
  const r = seeded(seed ^ 0x534c4544)
  const objs: SledObj[] = []
  const decor: SledDecor[] = []
  const segs: SledCourse['segs'] = []
  const zones: SledZone[] = []
  let id = 0
  const add = (o: Omit<SledObj, 'id' | 'var'> & { var?: number }) => objs.push({ var: Math.floor(r() * 4), ...o, id: id++ })
  const W = SLED.halfW
  const lane = () => between(r, -W + 40, W - 40)

  const SEGS: Record<string, (w0: number) => number> = {
    warmup(w0) {
      add({ k: 'coffee', w: w0 + 520, v: between(r, -60, 60), r: 18 })
      add({ k: 'pigeon', w: w0 + 760, v: between(r, -120, 120), r: 16 })
      return 900
    },
    // a tour group stopped dead for a photo, pigeons everywhere, and the ranger who's seen it all
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
        add({ k: i === 0 ? 'ranger' : i < 3 ? 'tourist' : 'pigeon', w, v, r: i < 3 ? 30 : 16 })
      }
      add({ k: 'coffee', w: w0 + between(r, 300, 700), v: lane(), r: 18 })
      return 1000
    },
    logs(w0) {
      for (const at of [260, 760]) {
        const gapC = pickOf(r, [-W + 75, 0, W - 75]) + between(r, -20, 20)
        add({ k: 'planter', w: w0 + at, v: 0, r: 14, g0: gapC - 62, g1: gapC + 62 })
        add({ k: 'coffee', w: w0 + at + 160, v: gapC, r: 18 })
      }
      return 1050
    },
    // the Sundeck (14th-15th St): weave between the rolling loungers; the thin sheet of water is just for your feet
    slalom(w0) {
      let side = r() < 0.5 ? -1 : 1
      for (let i = 0; i < 5; i++) {
        add({ k: 'lounger', w: w0 + 180 + i * 190, v: side * between(r, 50, 120), r: 30 })
        side = -side
      }
      add({ k: 'water', w: w0 + 300, v: 132, v1: W - 8, r: 0, len: 440 })
      add({ k: 'fresh', w: w0 + 600, v: between(r, -60, 0), r: 110 })
      zones.push({ k: 'sundeck', w0, w1: w0 + 1150 })
      return 1150
    },
    moguls(w0) {
      for (let row = 0; row < 3; row++) {
        const skip = Math.floor(r() * 5)
        for (let k = 0; k < 5; k++) if (k !== skip) add({ k: 'rails', w: w0 + 200 + row * 260 + between(r, -30, 30), v: -W + 36 + k * ((2 * W - 72) / 4), r: 24 })
      }
      add({ k: 'coffee', w: w0 + 860, v: lane(), r: 18 })
      return 1000
    },
    ice(w0) {
      add({ k: 'fresh', w: w0 + 300, v: between(r, -90, 90), r: 150 })
      add({ k: 'fresh', w: w0 + 720, v: between(r, -90, 90), r: 130 })
      for (let i = 0; i < 3; i++) add({ k: 'pigeon', w: w0 + 200 + i * 260, v: lane(), r: 16 })
      return 950
    },
    cart(w0) {
      // the gelato cart from the 14th St entrance got away from its owner. It's still going, bell and all.
      add({ k: 'cart', w: w0 + 480, v: 0, r: 34, v0: -W + 30, v1: W - 30, per: between(r, 3.2, 4.2), ph: r() })
      add({ k: 'coffee', w: w0 + 300, v: lane(), r: 18 })
      add({ k: 'coffee', w: w0 + 700, v: lane(), r: 18 })
      return 950
    },
    // the Spur (30th St): somebody left a ramp
    ramp(w0) {
      add({ k: 'ramp', w: w0 + 260, v: 0, r: 22 })
      // treats you can only reach in the air
      add({ k: 'coffee', w: w0 + 420, v: between(r, -80, 80), r: 20, var: 9 })
      add({ k: 'pigeon', w: w0 + 760, v: lane(), r: 16 })
      return 950
    },
    pines(w0) {
      const mid = between(r, -60, 60)
      add({ k: 'birch', w: w0 + 300, v: mid, r: 34 })
      add({ k: 'birch', w: w0 + 360, v: mid + between(r, -40, 40), r: 34 })
      add({ k: 'birch', w: w0 + 700, v: r() < 0.5 ? -W + 50 : W - 50, r: 34 })
      add({ k: 'coffee', w: w0 + 520, v: mid > 0 ? -110 : 110, r: 18 })
      return 950
    },
    // 10th Ave Square (17th St): a line of people taking selfies with the traffic below
    snowmen(w0) {
      const gap = Math.floor(r() * 5)
      for (let k = 0; k < 5; k++) if (k !== gap) add({ k: 'selfie', w: w0 + 420, v: -W + 36 + k * ((2 * W - 72) / 4), r: 22 })
      add({ k: 'pigeon', w: w0 + 180, v: lane(), r: 16 })
      zones.push({ k: 'square', w0: w0 + 60, w1: w0 + 760 })
      return 800
    },
    // the Chelsea Market Passage (15th-16th St): through the old biscuit factory, café tables down both sides
    narrows(w0) {
      add({ k: 'bank', w: w0 + 150, v: W * 0.45, r: 0, len: 650, side: 1 })
      add({ k: 'bank', w: w0 + 150, v: W * 0.45, r: 0, len: 650, side: -1 })
      add({ k: 'coffee', w: w0 + 450, v: 0, r: 18 })
      add({ k: 'rails', w: w0 + 300, v: between(r, -40, 40), r: 22 })
      zones.push({ k: 'market', w0: w0 + 90, w1: w0 + 860 })
      return 900
    },
  }
  const pool = ['scatter', 'logs', 'moguls', 'ice', 'cart', 'pines']
  let w = 0
  let last = ''
  const used = new Set<string>()
  const seg = (k: string) => {
    const w0 = w
    w += SEGS[k](w0)
    segs.push({ k, w0, w1: w })
    last = k
  }
  const random = () => {
    // every segment once before any repeats, never twice in a row
    const fresh = pool.filter((k) => !used.has(k) && k !== last)
    const k = pickOf(r, fresh.length ? fresh : pool.filter((x) => x !== last))
    used.add(k)
    if (used.size === pool.length) used.clear()
    seg(k)
  }
  // south to north, the landmarks where they really are
  seg('warmup') // Gansevoort St
  seg('slalom') // the Sundeck, 14th-15th St
  seg('narrows') // the Chelsea Market Passage, 15th-16th St
  seg('snowmen') // 10th Ave Square, 17th St
  while (w < streetW(30) - 700) random()
  seg('ramp') // the Spur, 30th St
  while (w < SLED.length - 1000) random()
  segs.push({ k: 'finish', w0: w, w1: SLED.length + 900 })
  // cones mark the course: down both edges, every 400 units
  for (let fw = 400; fw < SLED.length; fw += 400) {
    add({ k: 'cone', w: fw, v: -W - 12, r: 0, var: 0 })
    add({ k: 'cone', w: fw, v: W + 12, r: 0, var: 1 })
  }
  // Gansevoort St: the Citi Bike dock the racers took their bikes from, the sign they ignored, and the ranger
  decor.push(
    { k: 'dock', w: -230, v: -W - 70, var: 0 },
    { k: 'hlsign', w: -40, v: -W - 60, var: 0 },
    { k: 'nobikes', w: 70, v: -W - 34, var: 0 },
    { k: 'ranger', w: 330, v: W + 32, var: 0 },
  )
  // the street signs, block by block
  for (let s = STREET0 + 1; s < STREET1; s++) decor.push({ k: 'street', w: streetW(s), v: -W - 30, var: s })
  // the planting beds: birches, wildflowers and grasses down both sides, the old rails here and there
  // (none on the near side where something else stands: the signs at Gansevoort St and on every block, 10th Ave
  // Square's steps, the Chelsea Market wall)
  const clear = (w: number) =>
    (w > -330 && w < 170) || zones.some((z) => z.k !== 'sundeck' && w > z.w0 - 30 && w < z.w1 + 30) || Math.abs(streetW(Math.round(streetAt(w))) - w) < 90
  for (let dw = -400; dw < SLED.length + 900; dw += between(r, 60, 120)) {
    for (const side of [-1, 1]) {
      if (r() < 0.22) continue
      if (side < 0 && clear(dw)) continue
      const roll = r()
      const k: SledDecor['k'] = roll < 0.3 ? 'birch' : roll < 0.58 ? 'flowers' : roll < 0.78 ? 'grass' : roll < 0.92 ? 'shrub' : 'bench'
      const off = W + (k === 'bench' ? between(r, 30, 45) : k === 'birch' ? between(r, 60, 105) : between(r, 34, 100))
      decor.push({ k, w: dw + between(r, -20, 20), v: side * off, var: Math.floor(r() * 4) })
    }
    if (r() < 0.07) decor.push({ k: 'track', w: dw, v: W + 70, var: 0 })
  }
  // a few loungers parked on the Sundeck's far side
  for (const z of zones) if (z.k === 'sundeck') for (let k = 0; k < 3; k++) decor.push({ k: 'lounger', w: z.w0 + 260 + k * 300, v: W + 62, var: k })
  // Hudson Yards: the finish banner, the crowd, the dock where everyone returns their bikes, and the Vessel
  decor.push({ k: 'arch', w: SLED.length, v: 0, var: 0 })
  for (let i = 0; i < 6; i++) decor.push({ k: 'crowd', w: SLED.length + 160 + i * 60, v: (i % 2 ? 1 : -1) * (W + 50 + (i % 3) * 22), var: i })
  decor.push({ k: 'dock', w: SLED.length + 300, v: -W - 80, var: 1 }, { k: 'vessel', w: SLED.length + 560, v: 60, var: 0 })
  objs.sort((a, b) => a.w - b.w)
  decor.sort((a, b) => a.w - b.w)
  return { objs, decor, segs, zones }
}

/** where the runaway cart is at race time t (s) */
export function cartV(o: SledObj, t: number): number {
  const mid = ((o.v0 ?? 0) + (o.v1 ?? 0)) / 2
  const amp = ((o.v1 ?? 0) - (o.v0 ?? 0)) / 2
  return mid + amp * Math.sin(((t / (o.per ?? 4)) + (o.ph ?? 0)) * Math.PI * 2)
}

/** slow going at this spot: off the path in the planting beds, or among the café tables in the Chelsea Market Passage */
export function inDeepSnow(course: SledCourse, w: number, v: number): boolean {
  if (Math.abs(v) > SLED.halfW) return true
  for (const o of course.objs) {
    if (o.w > w) break
    if (o.k === 'bank' && w < o.w + (o.len ?? 0) && Math.sign(v) === o.side && Math.abs(v) > o.v) return true
  }
  return false
}

/** on the Sundeck's water feature (a splash, nothing more) */
export function inWater(course: SledCourse, w: number, v: number): boolean {
  for (const o of course.objs) {
    if (o.w > w) break
    if (o.k === 'water' && w < o.w + (o.len ?? 0) && v > o.v && v < (o.v1 ?? o.v)) return true
  }
  return false
}

export type SledHit = { o: SledObj; what: 'crash' | 'bump' | 'snowman' | 'cocoa' | 'ice' | 'ramp' }

/**
 * What a rider at lateral `v` runs into while riding from w0 to w1 at race time t (s). `air` is how high they are:
 * hopping clears pigeons, rails and selfie sticks; nothing clears a planter, a birch, a tourist, a lounger, the
 * ranger or the cart except the gap or going around. Iced coffee up in the air needs air to reach.
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
    if (o.k === 'cone' || o.k === 'bank' || o.k === 'water') continue
    const R = SLED.radius
    if (o.k === 'planter') {
      if (o.w + o.r >= w0 && o.w - o.r <= w1 && !(v > (o.g0 ?? 0) + R * 0.5 && v < (o.g1 ?? 0) - R * 0.5) && air < 40) hits.push({ o, what: 'crash' })
      continue
    }
    if (o.k === 'ramp') {
      if (o.w >= w0 && o.w < w1 && air < 1) hits.push({ o, what: 'ramp' })
      continue
    }
    if (o.k === 'fresh') {
      if (Math.abs(o.w - w1) < o.r && Math.abs(o.v - v) < 46 && air < 1) hits.push({ o, what: 'ice' })
      continue
    }
    const ov = o.k === 'cart' ? cartV(o, t) : o.v
    // passing this object between w0 and w1 (swept along the path, a circle across it)
    const near = o.w + o.r + R >= w0 && o.w - o.r - R <= w1 && Math.abs(ov - v) < o.r + R
    if (!near) continue
    if (o.k === 'coffee') {
      if (o.var === 9 ? air > 30 : air < 36) hits.push({ o, what: 'cocoa' })
    } else if (o.k === 'pigeon') {
      if (air < 14) hits.push({ o, what: 'crash' })
    } else if (o.k === 'rails') {
      if (air < 12) hits.push({ o, what: 'bump' })
    } else if (o.k === 'selfie') {
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
  /** iced coffees picked up (the results show it) */
  cocoa: number
}

export function makeSledBot(seed: number, slot: number, skill: number, v: number): SledBot {
  return { skill, w: 0, v, speed: 0, vLat: 0, crashUntil: 0, boostUntil: 0, air: 0, airUntil: 0, airStart: 0, airH: 0, done: false, doneMs: 0, idx: 0, target: v, roll: seeded(seed * 17 + slot * 104729 + 3), used: new Set(), crashes: 0, cocoa: 0 }
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
        if (o.k === 'planter' && !(cand > (o.g0 ?? 0) + 14 && cand < (o.g1 ?? 0) - 14)) cost += 50
        else if ((BIG.has(o.k) || o.k === 'pigeon' || o.k === 'selfie' || o.k === 'rails') && Math.abs(o.v - cand) < o.r + 26) cost += o.k === 'rails' ? 6 : 30
        else if (o.k === 'cart' && Math.abs(cartV(o, t + (o.w - b.w) / Math.max(120, b.speed)) - cand) < o.r + 30) cost += 30
        else if (o.k === 'coffee' && o.var !== 9 && Math.abs(o.v - cand) < 30) cost -= 4
        else if (o.k === 'fresh' && Math.abs(o.v - cand) < 40) cost -= 2
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
    } else if (h.what === 'cocoa') {
      b.boostUntil = t + SLED.cocoaS
      b.cocoa++
    }
    else if (h.what === 'bump') b.speed *= SLED.bumpMult
    else if (h.what === 'snowman') b.speed *= SLED.snowmanMult
    else if (h.what === 'crash' && t >= b.crashUntil) {
      // locals make mistakes too, but the good ones hop more often
      if (b.roll() < b.skill * 0.55 && h.o.k !== 'planter' && !BIG.has(h.o.k)) continue
      b.crashUntil = t + SLED.crashS
      b.crashes++
    }
  }
  if (b.w >= SLED.length) {
    b.done = true
    b.doneMs = Math.round(t * 1000)
  }
}
