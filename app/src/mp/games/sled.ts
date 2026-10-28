/**
 * The High Line Citi Bike Dash, in the browser (internally still the "sled" game: it was the Pilgrim Hill Sled Race
 * until there was no snow in the city).
 *
 * Seen from above, the High Line runs diagonally down to the bottom right, from Gansevoort St to 34th St. 2-4 New
 * Yorkers on Citi Bikes, ↑ / ↓ (or → / ←) to steer across the path, Space to hop over the small stuff. Your own bike
 * is simulated here with the shared rules (shared/sled.ts) and reported ~10 times a second; everyone else is drawn
 * from the server's ghosts, smoothed. Crashes cost time, never the race. Bikes aren't allowed on the High Line.
 * Nobody told these racers.
 */
import { el } from '../../engine/stage'
import { headPortrait } from '../../avatar/render'
import { randomLook } from '../../avatar/random'
import type { Look } from '../../avatar/look'
import { SLED, sledCourse, sledHits, cartV, inDeepSnow, inWater, streetW, SEGMENT_NAMES, STREET0, STREET1, type SledCourse, type SledObj, type SledDecor } from '../shared/sled'
import { GF, type GhostWire, type MpS2C, type ResultsWire, type RaceEvent } from '../shared/protocol'
import { MP_TEAMS, ordinal, fmtTime } from '../shared/games'
import { seeded } from '../shared/rng'
import { avatarPic, loadAll, drawAvatar, sharpCanvas, type AvatarPic } from '../sprites'
import { msfx, slideLoop } from '../sound'
import { esc } from '../store'
import type { GameCtx, RunningGame } from '../controller'
import './sled.css'

const TH = (28 * Math.PI) / 180
const CA = Math.cos(TH)
const SA = Math.sin(TH)
/** where the camera's point on the path sits on screen */
const AX = 320
const AY = 290
export const SLOT_COLORS = ['#e5483b', '#2a7bd5', '#3cb371', '#f2c12e', '#8a5bd6', '#f08a24', '#ff6fb5', '#18b5b5', '#7a4a22']
/** the deck: planting beds out to the railing, the avenue below beyond it */
const RAIL = SLED.halfW + 125
const AVE = 165
/** where the High Line ends at Gansevoort St, and how far past 34th St the deck runs */
const DECK0 = -460
const DECK1 = SLED.length + 1300
const INK = '#1d2140'
const FONT = "'Burbank Display', 'Lilita One', sans-serif"

const ART = '/art/mp/'
const IMG = {
  bike: ART + 'bike-citibike.png',
  ranger: ART + 'bike-ranger.png',
  cart: ART + 'bike-gelato-cart.png',
  coffee: ART + 'bike-coffee.png',
  lounger: ART + 'bike-lounger.png',
  bench: ART + 'bike-bench.png',
  dock: ART + 'bike-dock.png',
  nobikes: ART + 'bike-no-bikes.png',
  birch: ART + 'bike-birch.png',
  birch2: ART + 'bike-birch2.png',
  flowers: ART + 'bike-flowers.png',
  grass: ART + 'bike-grass.png',
  shrub: ART + 'bike-shrub.png',
  vessel: ART + 'bike-vessel.png',
  rails: ART + 'bike-rails.png',
  cone: ART + 'bike-cone.png',
  pigeon: '/art/sprites/pigeon.png',
}
type ImgKey = keyof typeof IMG

/** the part of the bike that's in front of the rider (handlebars, basket, front wheel), in the sprite's 0-1 space */
const BIKE_FRONT: [number, number][] = [
  [0.35, -0.02], [1.02, -0.02], [1.02, 1.02], [0.5, 1.02], [0.5, 0.79], [0.54, 0.6], [0.58, 0.43], [0.57, 0.25], [0.35, 0.15],
]
/** the bike on screen: its height, where its wheels meet the ground (0-1), where the saddle is (0-1) */
const BIKE_H = 60
const BIKE_GROUND: [number, number] = [0.52, 0.9]
const BIKE_SADDLE: [number, number] = [0.3, 0.17]
const RIDER_SCALE = 0.36

const SEG_TIPS: Record<string, string> = {
  scatter: 'Hop the pigeons, steer round the tourists',
  logs: 'Aim for the gap in the planters',
  slalom: 'Weave between the loungers',
  moguls: 'Hop the old rails or weave between them',
  ice: 'Fresh pavement is free speed',
  cart: 'The gelato cart got loose. Time it.',
  ramp: 'Ramp ahead: enjoy the air',
  pines: 'Go around the birch trees',
  snowmen: 'Find the gap in the selfie line',
  narrows: 'Café tables on both sides: stay in the middle',
}

interface Snap {
  tm: number
  d: number
  x: number
  v: number
  f: number
}
interface Racer {
  i: number
  id: string
  name: string
  look: Look
  bot: boolean
  team?: 'up' | 'down'
  color: string
  pics: { sit?: AvatarPic; grin?: AvatarPic; oops?: AvatarPic; cheer?: AvatarPic }
  snaps: Snap[]
  /** what's drawn */
  w: number
  v: number
  air: number
  flags: number
  done: boolean
  out: boolean
  place: number
  spin: number
  /** lean into a turn (smoothed lateral speed) */
  lean: number
  lastV: number
  react: { html: string; until: number } | null
}
interface Particle {
  w: number
  v: number
  h: number
  vw: number
  vv: number
  vh: number
  life: number
  max: number
  r: number
  c: string
}

export function start(ctx: GameCtx): RunningGame {
  const m = ctx.match
  const course: SledCourse = sledCourse(m.seed)
  const meIdx = m.you
  const racers: Racer[] = m.players.map((p, i) => ({
    i,
    id: p.i,
    name: p.n,
    look: p.l as Look,
    bot: !!p.bot,
    team: p.tm,
    color: m.mode === 'teams' && p.tm ? MP_TEAMS[p.tm].color : SLOT_COLORS[i % SLOT_COLORS.length],
    pics: {},
    snaps: [],
    w: 0,
    v: startV(i, m.players.length),
    air: 0,
    flags: 0,
    done: false,
    out: false,
    place: 0,
    spin: 0,
    lean: 0,
    lastV: startV(i, m.players.length),
    react: null,
  }))
  for (const r of racers) {
    void avatarPic(r.look, { pose: 'sit', mood: 'smile' }).then((p) => (r.pics.sit = p))
    void avatarPic(r.look, { pose: 'sit', mood: 'grin' }).then((p) => (r.pics.grin = p))
    void avatarPic(r.look, { pose: 'sit', mood: 'o' }).then((p) => (r.pics.oops = p))
    void avatarPic(r.look, { pose: 'cheer', mood: 'grin' }).then((p) => (r.pics.cheer = p))
  }
  const imgs: Partial<Record<ImgKey, HTMLImageElement>> = {}
  void loadAll(Object.values(IMG)).then((list) => (Object.keys(IMG) as ImgKey[]).forEach((k, i) => (imgs[k] = list[i])))
  // the people on the High Line: the crowd at 34th St, the tour group, the selfie line (city looks, seeded by the race)
  const cr = seeded(m.seed ^ 0xc40d)
  const crowd: AvatarPic[] = []
  for (let k = 0; k < 6; k++) void avatarPic(randomLook(0.7, cr), { pose: k % 2 ? 'cheer' : 'wave', t: 0.2 + k * 0.13, k: 1.5 }).then((p) => (crowd[k] = p))
  const tourists: AvatarPic[] = []
  const selfies: AvatarPic[] = []
  for (let k = 0; k < 4; k++) {
    const t = randomLook(0.4, cr)
    t.items = { ...t.items, neck: 'camera', head: ['bucket-hat', 'nyc-cap', 'foam-crown', 'bucket-hat'][k] }
    delete t.items.hand
    if (k % 2) t.items.legs = 'shorts'
    void avatarPic(t, { pose: 'idle', mood: k % 2 ? 'o' : 'smile', k: 1.5 }).then((p) => (tourists[k] = p))
    const s = randomLook(0.6, cr)
    delete s.items.hand
    void avatarPic(s, { pose: 'wave', mood: 'grin', t: 0.001, k: 1.5 }).then((p) => (selfies[k] = p))
  }

  // ---------- DOM ----------
  const root = ctx.root
  root.classList.add('sl')
  const { canvas, ctx: g, fit } = sharpCanvas('sl-canvas')
  const hud = el('div', 'mp-hud')
  const place = el('div', 'mp-hud-place', '<b>–</b><span></span><small>0.0s</small>')
  const prog = el('div', 'sl-prog', '<span class="sl-prog-line"></span><span class="sl-prog-flag"></span>')
  const dots = racers.map((r) => {
    const d = el('span', 'sl-dot' + (r.i === meIdx ? ' you' : ''), headPortrait(r.look))
    d.style.borderColor = r.color
    d.title = r.name
    prog.append(d)
    return d
  })
  const hint = el('div', 'mp-hint', `<span><kbd>↑</kbd><kbd>↓</kbd> steer</span><span><kbd>Space</kbd> hop</span><span class="sl-hint-sub"><img class="ji" src="${IMG.coffee}" alt=""> Iced coffee = speed</span>`)
  const big = el('div', 'mp-big')
  const watchBar = el('div', 'mp-watch')
  watchBar.hidden = true
  hud.append(place, prog, hint, big, watchBar)
  root.append(canvas, hud)
  if (meIdx < 0) hint.hidden = true
  setTimeout(() => hint.classList.add('dim'), 9000)

  const bigText = (text: string, small = false) => {
    big.className = 'mp-big' + (small ? ' small' : '')
    big.textContent = text
    void big.offsetWidth
    big.classList.add('pop')
  }
  let lastLine = 0
  const line = (html: string) => {
    const now = performance.now()
    if (now - lastLine < 700) return
    lastLine = now
    hud.querySelector('.mp-toastline')?.remove()
    const t = el('div', 'mp-toastline', html)
    hud.append(t)
    setTimeout(() => t.remove(), 2300)
  }

  // ---------- time ----------
  /** performance.now() when the race clock reads 0 */
  let t0 = performance.now() + m.startIn
  const raceT = () => (performance.now() - t0) / 1000
  /** server race-time minus ours, smoothed (ghosts are drawn a little in the past, between two snapshots) */
  let offset = 0
  let offsetSet = false

  // ---------- me ----------
  const me = meIdx >= 0 ? racers[meIdx] : null
  const S = {
    w: 0,
    v: me ? me.v : 0,
    speed: 0,
    vLat: 0,
    air: 0,
    airStart: 0,
    airUntil: 0,
    airH: 0,
    crashUntil: 0,
    boostUntil: 0,
    hopReady: 0,
    idx: 0,
    used: new Set<number>(),
    cocoa: 0,
    crashes: 0,
    jumps: 0,
    finished: false,
    finishT: 0,
    seg: '',
    sendAcc: 0,
    rang: new Set<number>(),
    wet: false,
    tailwind: false,
    draft: false,
  }
  const keys = { up: false, down: false }
  let hopQueued = false
  let watch = meIdx >= 0 ? meIdx : 0
  let watchPicked = false
  let resumed = false
  // a race already under way when we got here (a reload, a late arrival): racers resume from the ghosts
  if (m.startIn < -1500 && me) resumed = true
  /** the ranger at Gansevoort St has opinions about bikes (shown for a few seconds after GO) */
  let rangerUntil = 0
  /** obstacles that reacted to a crash (a pigeon flapping off, a tourist dropping the pose) */
  const shook = new Map<number, number>()

  // ---------- input ----------
  const down = (e: KeyboardEvent) => {
    const k = e.key
    if (k === 'ArrowUp' || k === 'ArrowRight' || k === 'w' || k === 'W' || k === 'd' || k === 'D') keys.up = true
    else if (k === 'ArrowDown' || k === 'ArrowLeft' || k === 's' || k === 'S' || k === 'a' || k === 'A') keys.down = true
    else if (k === ' ' || k === 'Spacebar') hopQueued = true
    else return
    e.preventDefault()
    // watching: ← / → switch who you follow
    if ((!me || S.finished) && (k === 'ArrowLeft' || k === 'ArrowRight')) {
      const live = racers.filter((r) => !r.done || r.i === watch)
      const at = live.findIndex((r) => r.i === watch)
      const next = live[(at + (k === 'ArrowRight' ? 1 : live.length - 1)) % live.length]
      if (next) {
        watch = next.i
        watchPicked = true
      }
    }
  }
  const up = (e: KeyboardEvent) => {
    const k = e.key
    if (k === 'ArrowUp' || k === 'ArrowRight' || k === 'w' || k === 'W' || k === 'd' || k === 'D') keys.up = false
    else if (k === 'ArrowDown' || k === 'ArrowLeft' || k === 's' || k === 'S' || k === 'a' || k === 'A') keys.down = false
  }
  const blur = () => {
    keys.up = keys.down = false
  }
  window.addEventListener('keydown', down, true)
  window.addEventListener('keyup', up, true)
  window.addEventListener('blur', blur)

  // ---------- particles ----------
  const parts: Particle[] = []
  const puff = (w: number, v: number, n: number, spread = 60, c = '#ece6d8') => {
    for (let k = 0; k < n; k++)
      parts.push({ w, v, h: 2, vw: (Math.random() - 0.5) * spread, vv: (Math.random() - 0.5) * spread, vh: 30 + Math.random() * 60, life: 0, max: 0.4 + Math.random() * 0.4, r: 2 + Math.random() * 3, c })
  }

  // ---------- sound ----------
  const loop = slideLoop()
  let shake = 0

  // ---------- the countdown ----------
  let lastCount = 99
  const countdown = (t: number) => {
    const n = Math.ceil(-t)
    if (t < 0 && n !== lastCount && n <= 3) {
      lastCount = n
      bigText(String(n))
      msfx.count()
    }
    if (t >= 0 && lastCount !== 0) {
      lastCount = 0
      bigText('GO!')
      msfx.go()
      // the ranger at the start notices
      if (t < 2) {
        rangerUntil = performance.now() + 3600
        setTimeout(() => msfx.whistle(), 450)
      }
    }
  }

  // ---------- simulation (mine) ----------
  const ghostsNear = () => racers.filter((r) => r !== me && !r.out)
  function step(dt: number, t: number) {
    if (!me || S.finished) return
    if (resumed) {
      // pick up where the server last saw us
      const s = me.snaps[me.snaps.length - 1]
      if (s) {
        S.w = s.d
        S.v = s.x
        S.speed = s.v
      }
      resumed = false
    }
    if (import.meta.env.DEV && (window as unknown as { clubNycMp?: { autopilot?: boolean } }).clubNycMp?.autopilot) autopilot(t)
    const crashed = t < S.crashUntil
    // speed: the pedals keep you at cruising speed; coffee, fresh pavement, slipstream and a tailwind push past it
    let target = SLED.vCruise
    if (t < S.boostUntil) target *= SLED.cocoaMult
    const onFresh = course.objs.some((o) => o.k === 'fresh' && Math.abs(o.w - S.w) < o.r && Math.abs(o.v - S.v) < 46)
    if (onFresh && S.air < 1) target *= SLED.iceMult
    // slipstream: right behind someone
    S.draft = ghostsNear().some((r) => r.w - S.w > 30 && r.w - S.w < 150 && Math.abs(r.v - S.v) < 34)
    if (S.draft) target *= SLED.draftMult
    const lead = Math.max(...racers.map((r) => (r === me ? S.w : r.w)))
    S.tailwind = lead - S.w > SLED.catchupGap
    if (S.tailwind) target *= SLED.catchupMult
    if (inDeepSnow(course, S.w, S.v) && S.air < 1) target *= SLED.deepSnowMult
    if (crashed) target *= SLED.crashMult
    S.speed += Math.sign(target - S.speed) * Math.min(Math.abs(target - S.speed), (crashed ? 900 : SLED.accel) * dt)
    // steering
    const dir = (keys.up ? 1 : 0) - (keys.down ? 1 : 0)
    const want = crashed ? 0 : dir * SLED.steer * (S.air > 1 ? 0.55 : 1)
    S.vLat += Math.sign(want - S.vLat) * Math.min(Math.abs(want - S.vLat), SLED.steerAccel * dt)
    // hop
    if (hopQueued) {
      hopQueued = false
      if (!crashed && S.air < 1 && t >= S.hopReady) {
        S.airStart = t
        S.airUntil = t + SLED.hopS
        S.airH = SLED.hopH
        S.hopReady = S.airUntil + SLED.hopCooldownS
        msfx.hop()
      }
    }
    const w0 = S.w
    S.w += S.speed * dt
    S.v = Math.max(-SLED.halfW - 60, Math.min(SLED.halfW + 60, S.v + S.vLat * dt))
    const wasAir = S.air > 1
    S.air = t < S.airUntil ? Math.sin(((t - S.airStart) / (S.airUntil - S.airStart)) * Math.PI) * S.airH : 0
    if (wasAir && S.air <= 1) {
      msfx.land()
      puff(S.w, S.v, 8)
    }
    // what did we run into?
    const { hits, next } = sledHits(course, w0, S.w, S.v, S.air, t, S.idx)
    S.idx = next
    for (const h of hits) {
      if (S.used.has(h.o.id)) continue
      if (h.what === 'ice') continue
      S.used.add(h.o.id)
      switch (h.what) {
        case 'ramp':
          S.airStart = t
          S.airUntil = t + SLED.rampS
          S.airH = SLED.rampH
          S.jumps++
          msfx.whoosh()
          line('Big air!')
          break
        case 'cocoa':
          S.boostUntil = t + SLED.cocoaS
          S.cocoa++
          msfx.boost()
          line(`<img class="ji" src="${IMG.coffee}" alt=""> Iced coffee boost!`)
          break
        case 'bump':
          S.speed *= SLED.bumpMult
          msfx.bump()
          puff(S.w, S.v, 6)
          shake = 0.12
          break
        case 'snowman':
          S.speed *= SLED.snowmanMult
          msfx.poof()
          shook.set(h.o.id, performance.now())
          puff(h.o.w, h.o.v, 10, 120, '#fff6c9')
          line('Sorry! You’re in their photo now.')
          break
        case 'crash':
          if (t < S.crashUntil) break
          S.crashUntil = t + SLED.crashS
          S.crashes++
          S.vLat = 0
          msfx.crash()
          puff(S.w, S.v, 18, 140)
          shake = 0.3
          shook.set(h.o.id, performance.now())
          if (h.o.k === 'ranger') setTimeout(() => msfx.whistle(), 250)
          if (h.o.k === 'birch') puff(h.o.w, h.o.v, 12, 120, '#8ccf4f')
          if (h.o.k === 'pigeon') puff(h.o.w, h.o.v, 10, 150, '#aab3c6')
          line(CRASH_LINE[h.o.k] ?? 'Wipeout!')
          break
      }
    }
    // the gelato cart rings its bell when it's close
    for (const o of course.objs) {
      if (o.k !== 'cart' || S.rang.has(o.id)) continue
      if (o.w - S.w < 420 && o.w > S.w) {
        S.rang.add(o.id)
        msfx.bell()
      }
    }
    // the Sundeck's water feature: a splash on the way through
    const wet = S.air < 1 && inWater(course, S.w, S.v)
    if (wet && !S.wet) msfx.splash()
    if (wet && Math.random() < 0.6) puff(S.w, S.v, 2, 70, '#9fd8ff')
    S.wet = wet
    // a new stretch of the High Line: say what it is
    const seg = course.segs.find((s) => S.w >= s.w0 - 220 && S.w < s.w1 - 220)
    if (seg && seg.k !== S.seg) {
      S.seg = seg.k
      if (SEG_TIPS[seg.k]) line(`<b>${SEGMENT_NAMES[seg.k]}</b> · ${SEG_TIPS[seg.k]}`)
    }
    // grit off the tires when you carve
    if (S.air < 1 && S.speed > 120 && Math.random() < Math.abs(S.vLat) / 300) puff(S.w, S.v - Math.sign(S.vLat) * 18, 1, 40)
    me.w = S.w
    me.v = S.v
    me.air = S.air
    me.flags = (S.air > 1 ? GF.air : 0) | (t < S.crashUntil ? GF.crash : 0) | (t < S.boostUntil ? GF.boost : 0) | (S.draft ? GF.draft : 0)
    // tell the server ~10 times a second
    S.sendAcc += dt
    if (S.sendAcc >= 0.1) {
      S.sendAcc = 0
      ctx.send({ k: 'pr', d: Math.round(S.w * 10) / 10, x: Math.round(S.v * 10) / 10, v: Math.round(S.speed), f: me.flags, tm: Math.round(t * 1000), c: S.cocoa })
    }
    if (S.w >= SLED.length) {
      S.finished = true
      S.finishT = t
      ctx.send({ k: 'pr', d: SLED.length, x: Math.round(S.v * 10) / 10, v: Math.round(S.speed), f: me.flags, tm: Math.round(t * 1000), c: S.cocoa })
      ctx.send({ k: 'fin', tm: Math.round(t * 1000) })
      msfx.finish()
      bigText('FINISH!')
      setTimeout(() => {
        if (!watchPicked) watch = meIdx
      }, 10)
    }
  }
  /** after the line you coast to a stop at 34th St */
  function coast(dt: number) {
    if (!me || !S.finished) return
    S.speed = Math.max(0, S.speed - 260 * dt)
    S.w += S.speed * dt
    S.vLat *= 0.9
    S.v += S.vLat * dt
    me.w = S.w
    me.v = S.v
    me.air = 0
    me.flags = 0
  }
  // dev only: tools/mpgames_test.py sets window.clubNycMp.autopilot so its players can ride like the city locals do
  function autopilot(t: number) {
    let best = S.v
    let bestCost = Infinity
    for (let cand = -SLED.halfW + 30; cand <= SLED.halfW - 30; cand += 30) {
      let cost = Math.abs(cand - S.v) * 0.02
      for (const o of course.objs) {
        if (o.w < S.w) continue
        if (o.w > S.w + 420) break
        if (o.k === 'planter' && !(cand > (o.g0 ?? 0) + 14 && cand < (o.g1 ?? 0) - 14)) cost += 50
        else if ((o.k === 'tourist' || o.k === 'ranger' || o.k === 'lounger' || o.k === 'birch' || o.k === 'selfie' || o.k === 'pigeon' || o.k === 'rails') && Math.abs(o.v - cand) < o.r + 26) cost += o.k === 'rails' ? 6 : 30
        else if (o.k === 'cart' && Math.abs(cartV(o, t + (o.w - S.w) / Math.max(120, S.speed)) - cand) < o.r + 30) cost += 30
        else if (o.k === 'coffee' && o.var !== 9 && Math.abs(o.v - cand) < 30) cost -= 4
        else if (o.k === 'bank' && Math.sign(cand) === o.side && Math.abs(cand) > o.v) cost += 8
      }
      if (cost < bestCost) {
        bestCost = cost
        best = cand
      }
    }
    keys.up = best - S.v > 12
    keys.down = best - S.v < -12
  }

  // ---------- the others (ghosts, a moment in the past, smoothed) ----------
  function ghosts(t: number) {
    const rt = t * 1000 + offset - 140
    for (const r of racers) {
      if (r === me && !r.out) continue
      const sn = r.snaps
      if (!sn.length) continue
      let a = sn[0]
      let b = sn[sn.length - 1]
      for (let k = sn.length - 1; k > 0; k--) {
        if (sn[k - 1].tm <= rt) {
          a = sn[k - 1]
          b = sn[k]
          break
        }
      }
      let d: number
      let x: number
      if (rt <= a.tm) {
        d = a.d
        x = a.x
      } else if (rt >= b.tm || b.tm === a.tm) {
        // a little extrapolation (not too far) past the newest snapshot
        const ahead = Math.min(0.3, (rt - b.tm) / 1000)
        d = b.d + (b.f & (GF.done | GF.out) ? 0 : b.v * Math.max(0, ahead))
        x = b.x
      } else {
        const k = (rt - a.tm) / (b.tm - a.tm)
        d = a.d + (b.d - a.d) * k
        x = a.x + (b.x - a.x) * k
      }
      // ease toward it so corrections never snap
      r.w += (d - r.w) * Math.min(1, 0.35)
      r.v += (x - r.v) * Math.min(1, 0.35)
      r.flags = b.f
      r.air = b.f & GF.air ? 26 : 0
      if (b.f & GF.done) r.done = true
    }
  }

  // ---------- drawing ----------
  const cam = { w: 0 }
  const P = (w: number, v: number): [number, number] => {
    const dw = w - cam.w
    return [AX + dw * CA + v * SA, AY + dw * SA - v * CA]
  }
  const onScreen = (x: number, y: number, m2 = 160) => x > -m2 && x < 1000 + m2 && y > -m2 && y < 565 + m2 * 1.6
  const hash = (a: number, b: number) => {
    let h = (a * 374761393 + b * 668265263) | 0
    h = (h ^ (h >>> 13)) * 1274126177
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296
  }

  function drawImg(key: ImgKey, x: number, y: number, h: number, o: { flip?: boolean; alpha?: number; rot?: number } = {}) {
    const img = imgs[key]
    if (!img?.naturalWidth) return
    const w = (img.naturalWidth / img.naturalHeight) * h
    g.save()
    if (o.alpha !== undefined) g.globalAlpha = o.alpha
    g.translate(x, y)
    if (o.rot) g.rotate(o.rot)
    if (o.flip) g.scale(-1, 1)
    g.drawImage(img, -w / 2, -h, w, h)
    g.restore()
  }
  function poly(pts: [number, number][], fill: string, stroke?: string, lw = 3) {
    g.beginPath()
    pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.closePath()
    g.fillStyle = fill
    g.fill()
    if (stroke) {
      g.strokeStyle = stroke
      g.lineWidth = lw
      g.lineJoin = 'round'
      g.stroke()
    }
  }
  const band = (wa: number, wb: number, va: number, vb: number, fill: string, stroke?: string, lw = 3) => poly([P(wa, va), P(wb, va), P(wb, vb), P(wa, vb)], fill, stroke, lw)
  const segLine = (wa: number, va: number, wb: number, vb: number) => {
    const [ax, ay] = P(wa, va)
    const [bx, by] = P(wb, vb)
    g.moveTo(ax, ay)
    g.lineTo(bx, by)
  }

  /** a yellow cab (or now and then another car) on the avenue below, pointing along the High Line */
  function cab(x: number, y: number, dir: number, color: string) {
    g.save()
    g.translate(x, y)
    g.rotate(TH)
    if (dir < 0) g.scale(-1, 1)
    g.fillStyle = 'rgba(0,0,0,0.25)'
    g.beginPath()
    g.roundRect(-17, -6, 36, 16, 5)
    g.fill()
    g.fillStyle = color
    g.strokeStyle = INK
    g.lineWidth = 2
    g.beginPath()
    g.roundRect(-18, -9, 36, 16, 5)
    g.fill()
    g.stroke()
    g.fillStyle = '#9fc8e8'
    g.fillRect(2, -6, 7, 10)
    g.fillRect(-12, -6, 5, 10)
    g.fillStyle = '#fff6cf'
    g.fillRect(16, -7, 2, 4)
    g.fillRect(16, 1, 2, 4)
    g.restore()
  }

  function ground(t: number) {
    const W = SLED.halfW
    const w0 = Math.max(cam.w - 700, DECK0 - 400)
    const w1 = cam.w + 1400
    // the street level far below: the avenues on both sides, the cross streets, the rooftops on the Hudson side
    g.fillStyle = '#4a4e5b'
    g.fillRect(0, 0, 1000, 565)
    for (const s of [-1, 1]) {
      const a = s * (RAIL + 14)
      const b = s * (RAIL + 14 + AVE)
      g.strokeStyle = 'rgba(255, 238, 170, 0.55)'
      g.lineWidth = 2
      g.setLineDash([16, 18])
      g.beginPath()
      segLine(w0, (a + b) / 2, w1, (a + b) / 2)
      g.stroke()
      g.setLineDash([])
      // sidewalks either side of the avenue
      band(w0, w1, b, b + s * 22, '#8d8f99')
      band(w0, w1, a - s * 2, a, '#8d8f99')
    }
    // rooftops beyond 11th Ave (the up-right side), block by block between the cross streets
    for (let st = STREET0 - 2; st <= STREET1 + 2; st++) {
      const wa = streetW(st) + 34
      const wb = streetW(st + 1) - 34
      if (wb < w0 || wa > w1) continue
      const va = RAIL + 14 + AVE + 22
      const roof = hash(st, 7) < 0.5 ? '#b0654a' : hash(st, 8) < 0.5 ? '#8c6a5a' : '#a7a29a'
      band(wa, wb, va, va + 420, roof, INK, 3)
      band(wa + 20, wb - 20, va + 20, va + 400, 'rgba(0,0,0,0.08)')
      if (hash(st, 9) < 0.6) {
        // a wooden water tower on the roof
        const [x, y] = P((wa + wb) / 2 + (hash(st, 3) - 0.5) * 200, va + 120 + hash(st, 4) * 150)
        g.fillStyle = '#7a4f30'
        g.strokeStyle = INK
        g.lineWidth = 2.5
        g.fillRect(x - 3, y - 14, 3, 14)
        g.fillRect(x + 10, y - 14, 3, 14)
        g.beginPath()
        g.roundRect(x - 8, y - 42, 26, 28, 4)
        g.fill()
        g.stroke()
        poly([[x - 10, y - 42], [x + 20, y - 42], [x + 5, y - 54]], '#5d3a22', INK, 2.5)
      }
    }
    // crosswalks where the cross streets meet the avenues
    for (let st = STREET0; st <= STREET1; st++) {
      const cw = streetW(st)
      if (cw < w0 || cw > w1) continue
      for (const s of [-1, 1]) {
        for (let k = 0; k < 6; k++) {
          const v = s * (RAIL + 22 + k * ((AVE - 16) / 6))
          band(cw - 16, cw + 16, v, v + s * 12, 'rgba(255,255,255,0.7)')
        }
      }
    }
    // traffic: 10th Ave runs north (the near side), 11th Ave south (the far side)
    for (const s of [-1, 1]) {
      const dir = s < 0 ? 1 : -1
      const speed = s < 0 ? 170 : 210
      const spacing = 230
      const shift = dir * speed * Math.max(0, t + 5)
      for (let n = Math.floor((w0 - shift) / spacing) - 1; n <= Math.ceil((w1 - shift) / spacing); n++) {
        const h = hash(n, s)
        if (h < 0.3) continue
        const cw = n * spacing + shift + h * 90
        const lane = s * (RAIL + 14 + (h < 0.65 ? AVE * 0.3 : AVE * 0.72))
        const [x, y] = P(cw, lane)
        if (!onScreen(x, y, 40)) continue
        cab(x, y, dir, h > 0.92 ? '#e8ecf2' : h > 0.86 ? '#d9483b' : '#f6c431')
      }
    }
    // the deck itself: the planting beds out to the railings, with the path down the middle
    const d0 = Math.max(w0, DECK0)
    const d1 = Math.min(w1, DECK1)
    if (d1 > d0) {
      // the deck's shadow on the street (it's up in the air)
      band(d0 + 26, d1 + 26, -RAIL - 30, RAIL - 8, 'rgba(20, 22, 36, 0.35)')
      band(d0, d1, -RAIL, RAIL, '#5f8a3a', INK, 3)
      // the beds: soil, leaves and flowers, fixed to the deck
      const cw0 = Math.floor((cam.w - 520) / 46)
      const cw1 = Math.ceil((cam.w + 1100) / 46)
      for (let cw = cw0; cw <= cw1; cw++) {
        for (let cv = -7; cv <= 7; cv++) {
          if (cv > -1 && cv < 1) continue
          const v = Math.sign(cv) * (W + 6 + (Math.abs(cv) - 1) * 18 + hash(cv, cw) * 14)
          if (Math.abs(v) > RAIL - 6) continue
          const w = cw * 46 + hash(cw, cv) * 40
          if (w < DECK0 || w > DECK1) continue
          const [x, y] = P(w, v)
          if (!onScreen(x, y, 20)) continue
          const h = hash(cw + 11, cv * 3)
          g.fillStyle = h < 0.45 ? '#77a84a' : h < 0.75 ? '#4f7b2f' : h < 0.86 ? '#a4c95a' : h < 0.93 ? '#9a7fe0' : '#f2c84b'
          g.beginPath()
          g.ellipse(x, y, h < 0.86 ? 9 : 4, h < 0.86 ? 5 : 4, 0, 0, Math.PI * 2)
          g.fill()
        }
      }
      // the path: long pale concrete planks
      band(d0, d1, -W - 6, W + 6, '#dcd6c8')
      g.strokeStyle = 'rgba(120, 108, 88, 0.28)'
      g.lineWidth = 1.5
      g.beginPath()
      for (let k = 1; k < 12; k++) segLine(d0, -W + k * 30, d1, -W + k * 30)
      g.stroke()
      g.beginPath()
      for (let k = 0; k < 12; k++) {
        const va = -W + k * 30
        const off = hash(k, 99) * 240
        for (let jw = Math.floor((d0 - off) / 240) * 240 + off; jw < d1; jw += 240) segLine(jw, va, jw, va + 30)
      }
      g.stroke()
      // the curbs between path and beds
      g.strokeStyle = '#8f8a7c'
      g.lineWidth = 3
      g.beginPath()
      segLine(d0, -W - 6, d1, -W - 6)
      segLine(d0, W + 6, d1, W + 6)
      g.stroke()
      // the ends of the deck (Gansevoort St, past 34th St)
      for (const e of [DECK0, DECK1]) {
        if (e < w0 || e > w1) continue
        g.strokeStyle = INK
        g.lineWidth = 4
        g.beginPath()
        segLine(e, -RAIL, e, RAIL)
        g.stroke()
      }
    }
    // the stretches with something special: the Sundeck's water, 10th Ave Square's steps, Chelsea Market overhead
    for (const z of course.zones) {
      if (z.w1 < w0 || z.w0 > w1) continue
      if (z.k === 'square') {
        // the amphitheater steps down toward the big window over 10th Ave (the near side)
        for (let k = 0; k < 4; k++) {
          const va = -W - 8 - k * 26
          band(z.w0 + k * 18, z.w1 - k * 18, va, va - 26, k % 2 ? '#a8743f' : '#c18a4e', INK, 2)
        }
      } else if (z.k === 'market') {
        // the old biscuit factory overhead: shade on the path, a low brick base on the near side
        band(z.w0, z.w1, -RAIL, RAIL, 'rgba(36, 30, 48, 0.26)')
        band(z.w0, z.w1, -W - 30, -W - 52, '#9c4a36', INK, 2.5)
      }
    }
    for (const o of course.objs) {
      if (o.k !== 'water' || o.w > w1 || o.w + (o.len ?? 0) < w0) continue
      const va = o.v
      const vb = o.v1 ?? o.v
      band(o.w, o.w + (o.len ?? 0), va, vb, 'rgba(140, 205, 245, 0.55)', 'rgba(70, 140, 200, 0.55)', 2)
      g.strokeStyle = 'rgba(255,255,255,0.8)'
      g.lineWidth = 2
      g.lineCap = 'round'
      g.beginPath()
      for (let k = 0; k < 10; k++) {
        const ww = o.w + ((k + 0.5) * (o.len ?? 0)) / 10 + Math.sin(t * 2 + k) * 12
        const vv = va + ((k * 37) % 50) + 8
        segLine(ww - 14, vv, ww + 14, vv)
      }
      g.stroke()
    }
    // the railings: dark steel, a mesh panel, posts (the window over 10th Ave is glass)
    for (const s of d1 > d0 ? [-1, 1] : []) {
      const [ax, ay] = P(d0, s * RAIL)
      const [bx, by] = P(d1, s * RAIL)
      poly([[ax, ay], [bx, by], [bx, by - 20], [ax, ay - 20]], 'rgba(40, 44, 60, 0.3)')
      g.strokeStyle = INK
      g.lineWidth = 4
      g.beginPath()
      g.moveTo(ax, ay - 20)
      g.lineTo(bx, by - 20)
      g.stroke()
      g.lineWidth = 3
      g.beginPath()
      for (let pw = Math.ceil(d0 / 60) * 60; pw < d1; pw += 60) {
        const [x, y] = P(pw, s * RAIL)
        if (x < -20 || x > 1020) continue
        g.moveTo(x, y)
        g.lineTo(x, y - 20)
      }
      g.stroke()
    }
    for (const z of course.zones) {
      if (z.k !== 'square' || z.w1 < w0 || z.w0 > w1) continue
      const [ax, ay] = P(z.w0 + 60, -RAIL)
      const [bx, by] = P(z.w1 - 60, -RAIL)
      poly([[ax, ay + 4], [bx, by + 4], [bx, by - 30], [ax, ay - 30]], 'rgba(170, 220, 250, 0.55)', INK, 4)
      g.strokeStyle = 'rgba(255,255,255,0.75)'
      g.lineWidth = 3
      g.beginPath()
      for (let k = 1; k < 5; k++) {
        const x = ax + ((bx - ax) * k) / 5
        const y = ay + ((by - ay) * k) / 5
        g.moveTo(x, y + 4)
        g.lineTo(x, y - 30)
      }
      g.stroke()
    }
    // café tables in the Chelsea Market Passage
    for (const o of course.objs) {
      if (o.k !== 'bank' || o.w > w1 || o.w + (o.len ?? 0) < w0) continue
      const s = o.side ?? 1
      band(o.w, o.w + (o.len ?? 0), s * o.v, s * (W + 6), 'rgba(178, 140, 96, 0.3)')
      g.strokeStyle = 'rgba(110, 76, 40, 0.6)'
      g.lineWidth = 2
      g.setLineDash([8, 7])
      g.beginPath()
      segLine(o.w, s * o.v, o.w + (o.len ?? 0), s * o.v)
      g.stroke()
      g.setLineDash([])
      for (let k = 0; k < 9; k++) {
        const [x, y] = P(o.w + ((k + 0.5) * (o.len ?? 0)) / 9, s * (o.v + 28 + (k % 2) * 36))
        // two green bistro chairs and a little round table on one leg
        for (const [cx, cy] of [[-16, 3], [16, -3]]) {
          g.fillStyle = '#2f7d4f'
          g.strokeStyle = INK
          g.lineWidth = 1.8
          g.beginPath()
          g.roundRect(x + cx - 6, y + cy - 18, 12, 9, 2)
          g.fill()
          g.stroke()
          g.beginPath()
          g.moveTo(x + cx - 5, y + cy - 9)
          g.lineTo(x + cx - 5, y + cy)
          g.moveTo(x + cx + 5, y + cy - 9)
          g.lineTo(x + cx + 5, y + cy)
          g.stroke()
        }
        g.strokeStyle = INK
        g.lineWidth = 2.5
        g.beginPath()
        g.moveTo(x, y - 12)
        g.lineTo(x, y)
        g.stroke()
        g.fillStyle = '#c99358'
        g.beginPath()
        g.ellipse(x, y - 14, 12, 6, 0, 0, Math.PI * 2)
        g.fill()
        g.stroke()
        g.fillStyle = '#ffffff'
        g.fillRect(x + 1, y - 19, 4, 5)
      }
    }
    // the start and finish lines
    for (const lw of [0, SLED.length]) {
      if (lw < w0 || lw > w1) continue
      const n = 12
      for (let k = 0; k < n; k++) {
        const va = -W + (2 * W * k) / n
        const vb = -W + (2 * W * (k + 1)) / n
        poly([P(lw - 8, va), P(lw - 8, vb), P(lw + 8, vb), P(lw + 8, va)], k % 2 ? INK : lw ? '#ffffff' : '#1f6fd1')
      }
    }
    // fresh pavement: smooth new blacktop
    for (const o of course.objs) {
      if (o.k !== 'fresh' || o.w < w0 - 200 || o.w > w1) continue
      const [x, y] = P(o.w, o.v)
      g.save()
      g.translate(x, y)
      g.rotate(TH)
      g.fillStyle = '#69707f'
      g.strokeStyle = INK
      g.lineWidth = 3
      g.beginPath()
      g.roundRect(-o.r, -40, o.r * 2, 80, 30)
      g.fill()
      g.stroke()
      // a glossy edge and a few sparkles: smooth, new, fast
      g.fillStyle = 'rgba(255,255,255,0.16)'
      g.beginPath()
      g.roundRect(-o.r + 10, -33, o.r * 2 - 20, 22, 11)
      g.fill()
      g.fillStyle = 'rgba(255,255,255,0.85)'
      for (const [a, b, sz] of [[-0.62, -20, 6], [-0.18, 12, 4.5], [0.3, -14, 5.5], [0.7, 14, 4]]) {
        const sx = o.r * a
        g.beginPath()
        g.moveTo(sx, b - sz)
        g.lineTo(sx + sz * 0.3, b - sz * 0.3)
        g.lineTo(sx + sz, b)
        g.lineTo(sx + sz * 0.3, b + sz * 0.3)
        g.lineTo(sx, b + sz)
        g.lineTo(sx - sz * 0.3, b + sz * 0.3)
        g.lineTo(sx - sz, b)
        g.lineTo(sx - sz * 0.3, b - sz * 0.3)
        g.closePath()
        g.fill()
      }
      g.restore()
    }
    // chevrons painted before each ramp
    for (const o of course.objs) {
      if (o.k !== 'ramp' || o.w < w0 || o.w > w1) continue
      for (let k = 1; k <= 3; k++) {
        for (const vv of [-90, 0, 90]) {
          const [x, y] = P(o.w - 40 - k * 46, vv)
          g.save()
          g.translate(x, y)
          g.rotate(TH)
          g.strokeStyle = 'rgba(242, 193, 46, 0.9)'
          g.lineWidth = 5
          g.lineCap = 'round'
          g.beginPath()
          g.moveTo(-8, -14)
          g.lineTo(6, 0)
          g.lineTo(-8, 14)
          g.stroke()
          g.restore()
        }
      }
    }
    // shadows
    for (const r of racers) {
      if (r.out) continue
      const [x, y] = P(r.w, r.v)
      g.fillStyle = 'rgba(29, 33, 64, 0.22)'
      g.beginPath()
      g.ellipse(x - 2, y + 2, 34 - Math.min(14, r.air * 0.2), 11 - Math.min(5, r.air * 0.08), TH * 0.6, 0, Math.PI * 2)
      g.fill()
    }
  }

  type Item = { y: number; draw: () => void }
  /** a row of concrete planters across the path, with one gap */
  function planterPieces(o: SledObj, items: Item[]) {
    const W = SLED.halfW + 26
    const spans: [number, number][] = [
      [-W, o.g0 ?? 0],
      [o.g1 ?? 0, W],
    ]
    for (const [va, vb] of spans) {
      if (vb - va < 4) continue
      const n = Math.max(1, Math.ceil((vb - va) / 34))
      for (let k = 0; k < n; k++) {
        const a = va + ((vb - va) * k) / n
        const b = va + ((vb - va) * (k + 1)) / n
        const [x0, y0] = P(o.w, a)
        const [x1, y1] = P(o.w, b)
        // the planter's depth along the path (its top is a parallelogram)
        const [dx, dy] = [CA * 22, SA * 22]
        items.push({
          y: (y0 + y1) / 2 + 8,
          draw: () => {
            const H = 22
            // the top: soil and leaves, then the front face
            poly([[x0 - dx, y0 - dy - H], [x1 - dx, y1 - dy - H], [x1 + dx, y1 + dy - H], [x0 + dx, y0 + dy - H]], '#5f8a3a', INK, 2.5)
            poly([[x0 + dx, y0 + dy - H], [x1 + dx, y1 + dy - H], [x1 + dx, y1 + dy], [x0 + dx, y0 + dy]], '#b8b4aa', INK, 2.5)
            g.strokeStyle = 'rgba(70, 66, 60, 0.35)'
            g.lineWidth = 1.5
            g.beginPath()
            g.moveTo(x0 + dx, y0 + dy - H / 2)
            g.lineTo(x1 + dx, y1 + dy - H / 2)
            g.stroke()
            // leaves and flowers poking up
            const seed = Math.round(a * 7 + o.w)
            for (let j = 0; j < 4; j++) {
              const f = (j + 0.5) / 4
              const lx = x0 + (x1 - x0) * f + (hash(seed, j) - 0.5) * 10
              const ly = y0 + (y1 - y0) * f - H - 2 - hash(j, seed) * 6
              g.fillStyle = '#7fb84a'
              g.strokeStyle = INK
              g.lineWidth = 1.5
              g.beginPath()
              g.ellipse(lx, ly, 6, 5, 0, 0, Math.PI * 2)
              g.fill()
              g.stroke()
              if (hash(seed + 3, j) < 0.8) {
                g.fillStyle = hash(seed, j + 9) < 0.5 ? '#9a7fe0' : '#f2c84b'
                g.strokeStyle = INK
                g.lineWidth = 1
                g.beginPath()
                g.arc(lx + 2, ly - 4, 3.2, 0, Math.PI * 2)
                g.fill()
                g.stroke()
              }
            }
          },
        })
      }
    }
  }
  /** a plywood ramp someone left on the Spur */
  function rampPieces(o: SledObj, items: Item[]) {
    const W = SLED.halfW + 16
    const n = 10
    for (let k = 0; k < n; k++) {
      const a = -W + ((2 * W) * k) / n
      const b = -W + ((2 * W) * (k + 1)) / n
      const [lx0, ly0] = P(o.w, a)
      const [lx1, ly1] = P(o.w, b)
      const [bx0, by0] = P(o.w - 40, a)
      const [bx1, by1] = P(o.w - 40, b)
      items.push({
        y: (ly0 + ly1) / 2,
        draw: () => {
          const H = 18
          // the slope up (plywood), the lip, and a hazard-striped face
          poly([[bx0, by0], [bx1, by1], [lx1, ly1 - H], [lx0, ly0 - H]], '#e2b977')
          poly([[lx0, ly0 - H], [lx1, ly1 - H], [lx1, ly1], [lx0, ly0]], k % 2 ? INK : '#f2c12e')
          g.strokeStyle = INK
          g.lineWidth = 3
          g.beginPath()
          g.moveTo(lx0, ly0 - H)
          g.lineTo(lx1, ly1 - H)
          g.moveTo(lx0, ly0)
          g.lineTo(lx1, ly1)
          g.stroke()
          g.strokeStyle = 'rgba(140, 96, 40, 0.45)'
          g.lineWidth = 1.5
          g.beginPath()
          g.moveTo((bx0 + lx0) / 2, (by0 + ly0 - H) / 2)
          g.lineTo((bx1 + lx1) / 2, (by1 + ly1 - H) / 2)
          g.stroke()
        },
      })
    }
  }

  /** the bike, its rider, a pennant in the racer's colour */
  function racerItem(r: Racer, t: number): Item | null {
    if (r.out && r !== me) return null
    const [x, y0] = P(r.w, r.v)
    if (!onScreen(x, y0)) return null
    const y = y0 - r.air * 0.9
    return {
      y: y0,
      draw: () => {
        const crashed = !!(r.flags & GF.crash)
        if (crashed) r.spin += 0.35
        else r.spin *= 0.8
        const img = imgs.bike
        g.save()
        g.translate(x, y)
        g.rotate((r.spin ? Math.sin(r.spin) * 0.55 : 0) + r.lean)
        const bh = BIKE_H
        const bw = img?.naturalWidth ? (img.naturalWidth / img.naturalHeight) * bh : bh * 0.88
        const bx = -bw * BIKE_GROUND[0]
        const by = -bh * BIKE_GROUND[1]
        // the pennant on a pole off the back of the bike (your colour, or your team's)
        const px = bx + bw * 0.1
        const py = by + bh * 0.3
        const wave = Math.sin(t * 9 + r.i) * 3
        g.strokeStyle = INK
        g.lineWidth = 2
        g.beginPath()
        g.moveTo(px, py)
        g.lineTo(px - 6, py - 66)
        g.stroke()
        poly([[px - 6, py - 66], [px - 30, py - 60 + wave], [px - 6, py - 52]], r.color, INK, 2)
        // the bike, the rider on the saddle, then the front of the bike over the rider's legs
        if (img?.naturalWidth) g.drawImage(img, bx, by, bw, bh)
        const pic = r.done && r.pics.cheer && r !== me ? r.pics.cheer : crashed ? r.pics.oops : r.flags & (GF.boost | GF.air) ? r.pics.grin : r.pics.sit
        const pedal = !crashed && !r.done && r.air < 1 ? Math.sin(t * 12 + r.i) * 0.8 : 0
        if (pic) drawAvatar(g, pic, bx + bw * BIKE_SADDLE[0], by + bh * BIKE_SADDLE[1] + 14 + pedal, RIDER_SCALE)
        if (img?.naturalWidth) {
          g.save()
          g.beginPath()
          BIKE_FRONT.forEach(([fx, fy], k) => (k ? g.lineTo(bx + fx * bw, by + fy * bh) : g.moveTo(bx + fx * bw, by + fy * bh)))
          g.closePath()
          g.clip()
          g.drawImage(img, bx, by, bw, bh)
          g.restore()
        }
        if (crashed) {
          // stars
          for (let k = 0; k < 3; k++) {
            const a = t * 6 + (k * Math.PI * 2) / 3
            g.fillStyle = '#ffd166'
            g.strokeStyle = INK
            g.lineWidth = 1.5
            star(Math.cos(a) * 22, -104 + Math.sin(a) * 6, 6)
          }
        }
        if (r.flags & GF.boost) {
          g.strokeStyle = 'rgba(255, 190, 70, 0.85)'
          g.lineWidth = 3
          g.lineCap = 'round'
          for (let k = 0; k < 3; k++) {
            const o = (k - 1) * 10
            g.beginPath()
            g.moveTo(-CA * 40 + SA * o, -SA * 40 - CA * o - 20)
            g.lineTo(-CA * 72 + SA * o, -SA * 72 - CA * o - 20)
            g.stroke()
          }
        }
        g.restore()
      },
    }
  }
  function star(x: number, y: number, r: number) {
    g.beginPath()
    for (let k = 0; k < 10; k++) {
      const a = (k * Math.PI) / 5 - Math.PI / 2
      const rr = k % 2 ? r * 0.45 : r
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr)
    }
    g.closePath()
    g.fill()
    g.stroke()
  }
  function bubble(x: number, y: number, text: string) {
    g.font = `14px ${FONT}`
    g.textAlign = 'center'
    const tw = g.measureText(text).width + 20
    g.fillStyle = '#ffffff'
    g.strokeStyle = INK
    g.lineWidth = 2.5
    g.beginPath()
    g.roundRect(x - tw / 2, y - 26, tw, 26, 11)
    g.fill()
    g.stroke()
    poly([[x - 6, y - 1.5], [x + 6, y - 1.5], [x, y + 8]], '#ffffff')
    g.beginPath()
    g.moveTo(x - 6, y)
    g.lineTo(x, y + 8)
    g.lineTo(x + 6, y)
    g.stroke()
    g.fillStyle = INK
    g.fillText(text, x, y - 8)
  }

  function decorItem(d: SledDecor): Item | null {
    const [x, y] = P(d.w, d.v)
    if (!onScreen(x, y, 260)) return null
    const s = 0.84 + (d.var % 4) * 0.08
    return {
      y,
      draw: () => {
        switch (d.k) {
          case 'birch':
            drawImg(d.var % 2 ? 'birch2' : 'birch', x, y + 3, 118 * s, { flip: d.var > 1 })
            break
          case 'flowers':
            drawImg('flowers', x, y + 4, 40 * s, { flip: d.var % 2 === 1 })
            break
          case 'grass':
            drawImg('grass', x, y + 4, 50 * s, { flip: d.var % 2 === 1 })
            break
          case 'shrub':
            drawImg('shrub', x, y + 4, 32 * s, { flip: d.var % 2 === 1 })
            break
          case 'bench':
            drawImg('bench', x, y + 6, 38, { flip: true })
            break
          case 'track':
            drawImg('rails', x, y + 8, 40, { flip: true })
            break
          case 'lounger':
            drawImg('lounger', x, y + 6, 52, { flip: true })
            break
          case 'dock':
            drawImg('dock', x, y + 6, 74, { flip: d.var === 1 })
            break
          case 'nobikes':
            drawImg('nobikes', x, y + 2, 66)
            break
          case 'ranger':
            drawImg('ranger', x, y + 2, 76)
            if (performance.now() < rangerUntil) bubble(x, y - 82, 'Hey! No bikes up here!')
            break
          case 'vessel':
            drawImg('vessel', x, y + 10, 250)
            break
          case 'crowd': {
            const pic = crowd[d.var]
            if (pic) drawAvatar(g, pic, x, y, 0.4 + Math.sin(performance.now() / 300 + d.var) * 0.004)
            break
          }
          case 'street':
            streetSign(x, y, d.var)
            break
          case 'hlsign':
            highLineSign(x, y)
            break
        }
      },
    }
  }
  /** a green New York street sign on its post */
  function streetSign(x: number, y: number, st: number) {
    const label = st <= STREET0 ? 'Gansevoort St' : `W ${st} St`
    g.fillStyle = '#7d8290'
    g.strokeStyle = INK
    g.lineWidth = 2.5
    g.fillRect(x - 2.5, y - 56, 5, 56)
    g.strokeRect(x - 2.5, y - 56, 5, 56)
    g.font = `13px ${FONT}`
    g.textAlign = 'center'
    const tw = g.measureText(label).width + 16
    g.fillStyle = '#1f7a45'
    g.beginPath()
    g.roundRect(x - tw / 2, y - 74, tw, 21, 4)
    g.fill()
    g.stroke()
    g.strokeStyle = 'rgba(255,255,255,0.8)'
    g.lineWidth = 1.2
    g.beginPath()
    g.roundRect(x - tw / 2 + 3, y - 71, tw - 6, 15, 2)
    g.stroke()
    g.fillStyle = '#ffffff'
    g.fillText(label, x, y - 58.5)
  }
  /** the High Line's own sign at the Gansevoort St end */
  function highLineSign(x: number, y: number) {
    g.fillStyle = '#4a505c'
    g.strokeStyle = INK
    g.lineWidth = 3
    g.fillRect(x - 36, y - 50, 6, 50)
    g.strokeRect(x - 36, y - 50, 6, 50)
    g.fillRect(x + 30, y - 50, 6, 50)
    g.strokeRect(x + 30, y - 50, 6, 50)
    g.fillStyle = '#2f3440'
    g.beginPath()
    g.roundRect(x - 66, y - 96, 132, 50, 5)
    g.fill()
    g.stroke()
    g.fillStyle = '#ffffff'
    g.textAlign = 'center'
    g.font = `17px ${FONT}`
    g.fillText('THE HIGH LINE', x, y - 74)
    g.font = `12px ${FONT}`
    g.fillStyle = '#c9d3e0'
    g.fillText('Gansevoort St', x, y - 57)
  }
  function finishArch(items: Item[]) {
    const L = SLED.length
    const W = SLED.halfW + 30
    const [ax, ay] = P(L, -W)
    const [bx, by] = P(L, W)
    if (!onScreen(ax, ay, 300) && !onScreen(bx, by, 300)) return
    const H = 132
    items.push({
      y: Math.max(ay, by) + 4,
      draw: () => {
        g.lineWidth = 5
        g.strokeStyle = INK
        g.lineCap = 'round'
        for (const [x, y] of [[ax, ay], [bx, by]]) {
          g.beginPath()
          g.moveTo(x, y)
          g.lineTo(x, y - H)
          g.stroke()
          g.strokeStyle = '#e8e8f0'
          g.lineWidth = 3
          g.beginPath()
          g.moveTo(x, y)
          g.lineTo(x, y - H)
          g.stroke()
          g.lineWidth = 5
          g.strokeStyle = INK
        }
        poly([[ax, ay - H], [bx, by - H], [bx, by - H + 34], [ax, ay - H + 34]], '#1f6fd1', INK, 4)
        g.save()
        g.translate((ax + bx) / 2, (ay + by) / 2 - H + 23)
        g.rotate(Math.atan2(by - ay, bx - ax))
        g.fillStyle = '#ffffff'
        g.font = `22px ${FONT}`
        g.textAlign = 'center'
        g.fillText('FINISH · 34TH ST', 0, 0)
        g.restore()
      },
    })
  }
  /** Chelsea Market's wall along the far side of the passage (behind everyone) */
  function marketWall(items: Item[]) {
    for (const z of course.zones) {
      if (z.k !== 'market') continue
      const v = RAIL - 12
      const [ax, ay] = P(z.w0, v)
      const [bx, by] = P(z.w1, v)
      if (!onScreen(ax, ay, 400) && !onScreen(bx, by, 400)) continue
      const H = 92
      items.push({
        y: Math.min(ay, by) - 400,
        draw: () => {
          poly([[ax, ay], [bx, by], [bx, by - H], [ax, ay - H]], '#a9523c', INK, 4)
          // windows and the big sign
          for (let k = 1; k < 9; k++) {
            const f = k / 9
            const x = ax + (bx - ax) * f
            const y = ay + (by - ay) * f
            poly([[x - 9, y - 66], [x + 9, y - 66 + 18 * Math.tan(TH) * 0.5], [x + 9, y - 40 + 18 * Math.tan(TH) * 0.5], [x - 9, y - 40]], '#3b4a63', INK, 2)
          }
          poly([[ax, ay - H], [bx, by - H], [bx, by - H - 10], [ax, ay - H - 10]], '#7b3a2a', INK, 3)
        },
      })
      // the way in: brick piers and a lintel with the market's name, over the path
      const W2 = SLED.halfW + 40
      const [px, py] = P(z.w0, -W2)
      const [qx, qy] = P(z.w0, W2)
      if (!onScreen(px, py, 300) && !onScreen(qx, qy, 300)) continue
      const BH = 118
      items.push({
        y: Math.max(py, qy) + 4,
        draw: () => {
          for (const [x, y] of [[px, py], [qx, qy]]) {
            g.fillStyle = '#a9523c'
            g.strokeStyle = INK
            g.lineWidth = 3.5
            g.fillRect(x - 9, y - BH, 18, BH)
            g.strokeRect(x - 9, y - BH, 18, BH)
          }
          poly([[px - 10, py - BH], [qx + 10, qy - BH], [qx + 10, qy - BH + 32], [px - 10, py - BH + 32]], '#8a3f2e', INK, 4)
          g.save()
          g.translate((px + qx) / 2, (py + qy) / 2 - BH + 22)
          g.rotate(Math.atan2(qy - py, qx - px))
          g.fillStyle = '#f4e9c8'
          g.font = `19px ${FONT}`
          g.textAlign = 'center'
          g.fillText('CHELSEA MARKET', 0, 0)
          g.restore()
        },
      })
    }
  }

  function sprites(t: number) {
    const items: Item[] = []
    const w0 = cam.w - 520
    const w1 = cam.w + 1150
    const now = performance.now()
    for (const o of course.objs) {
      if (o.w < w0 - 40 || o.w > w1) continue
      if (o.k === 'fresh' || o.k === 'bank' || o.k === 'water') continue
      if (o.k === 'planter') {
        planterPieces(o, items)
        continue
      }
      if (o.k === 'ramp') {
        rampPieces(o, items)
        continue
      }
      const v = o.k === 'cart' ? cartV(o, t) : o.v
      const [x, y] = P(o.w, v)
      if (!onScreen(x, y)) continue
      if (o.k === 'coffee' && me && S.used.has(o.id)) continue
      const hit = shook.get(o.id)
      const since = hit ? (now - hit) / 1000 : 99
      items.push({
        y,
        draw: () => {
          switch (o.k) {
            case 'pigeon':
              // hit one and it's off (pigeons always come back, just not to this spot)
              if (since < 1.2) drawImg('pigeon', x + since * 60, y - since * 120, 30, { flip: o.var % 2 === 1, alpha: Math.max(0, 1 - since) })
              else if (since > 1.2 && hit) break
              else drawImg('pigeon', x, y + 3, 30 + Math.sin(t * 3 + o.id) * 0.6, { flip: o.var % 2 === 1 })
              break
            case 'tourist': {
              const pic = tourists[o.var % 4]
              if (pic) drawAvatar(g, pic, x, y + 2, 0.4, { rot: since < 0.5 ? Math.sin(since * 30) * 0.08 : 0 })
              // the phone held up for the photo
              g.fillStyle = INK
              g.beginPath()
              g.roundRect(x + 9, y - 70, 9, 13, 2)
              g.fill()
              break
            }
            case 'ranger':
              drawImg('ranger', x, y + 3, 78, { rot: since < 0.6 ? Math.sin(since * 30) * 0.06 : 0 })
              if (since < 1.6) bubble(x, y - 84, 'No bikes!')
              break
            case 'lounger':
              drawImg('lounger', x, y + 8, 58, { flip: true })
              break
            case 'birch':
              drawImg(o.var % 2 ? 'birch2' : 'birch', x, y + 4, 124, { flip: o.var > 1, rot: since < 0.6 ? Math.sin(since * 26) * 0.04 : 0 })
              break
            case 'rails':
              drawImg('rails', x, y + 10, 34)
              break
            case 'selfie': {
              const pic = selfies[o.var % 4]
              const sc = 0.4
              if (pic) drawAvatar(g, pic, x, y + 2, sc, { rot: since < 0.5 ? Math.sin(since * 30) * 0.08 : 0 })
              // the selfie stick, phone at the top
              const hx = x + 31 * sc
              const hy = y - 91 * sc
              g.strokeStyle = INK
              g.lineWidth = 2.5
              g.lineCap = 'round'
              g.beginPath()
              g.moveTo(hx, hy)
              g.lineTo(hx + 9, hy - 30)
              g.stroke()
              g.fillStyle = INK
              g.beginPath()
              g.roundRect(hx + 4, hy - 42, 11, 15, 2.5)
              g.fill()
              if (since < 0.4) {
                // flash
                g.fillStyle = `rgba(255, 250, 210, ${1 - since / 0.4})`
                g.beginPath()
                g.arc(hx + 9, hy - 35, 16, 0, Math.PI * 2)
                g.fill()
              }
              break
            }
            case 'cart':
              drawImg('cart', x, y + 6, 92, { flip: Math.cos(((t / (o.per ?? 4)) + (o.ph ?? 0)) * Math.PI * 2) < 0 })
              break
            case 'coffee': {
              const lift = o.var === 9 ? 46 : 0
              const bob = Math.sin(t * 4 + o.id) * 3
              g.fillStyle = 'rgba(255, 214, 102, 0.4)'
              g.beginPath()
              g.ellipse(x, y - lift - 18 + bob, 21, 21, 0, 0, Math.PI * 2)
              g.fill()
              drawImg('coffee', x, y - lift + bob, 40)
              break
            }
            case 'cone':
              drawImg('cone', x, y + 3, 24)
              break
          }
        },
      })
    }
    for (const d of course.decor) {
      if (d.w < w0 - 300 || d.w > w1 + 300) continue
      const it = decorItem(d)
      if (it) items.push(it)
    }
    for (const r of racers) {
      const it = racerItem(r, t)
      if (it) items.push(it)
    }
    finishArch(items)
    marketWall(items)
    items.sort((a, b) => a.y - b.y)
    for (const it of items) it.draw()
  }

  function particles(dt: number) {
    for (let k = parts.length - 1; k >= 0; k--) {
      const p = parts[k]
      p.life += dt
      if (p.life > p.max) {
        parts.splice(k, 1)
        continue
      }
      p.w += p.vw * dt
      p.v += p.vv * dt
      p.vh -= 260 * dt
      p.h = Math.max(0, p.h + p.vh * dt)
      const [x, y] = P(p.w, p.v)
      g.globalAlpha = 1 - p.life / p.max
      g.fillStyle = p.c
      g.strokeStyle = 'rgba(29,33,64,0.45)'
      g.lineWidth = 1
      g.beginPath()
      g.arc(x, y - p.h, p.r, 0, Math.PI * 2)
      g.fill()
      g.stroke()
    }
    g.globalAlpha = 1
  }

  function tags() {
    g.font = `12px ${FONT}`
    g.textAlign = 'center'
    const list: { r: Racer; x: number; y: number; tw: number; label: string }[] = []
    for (const r of racers) {
      if (r.out && r !== me) continue
      const [x, y0] = P(r.w, r.v)
      if (!onScreen(x, y0, 40)) continue
      const label = r === me ? 'You' : r.name
      list.push({ r, x: x - 6, y: y0 - r.air * 0.9 - 112, tw: g.measureText(label).width + 26, label })
    }
    // riders bunch up: a tag that would cover another one moves up above it (yours stays put, order is kept)
    list.sort((a, b) => (a.r === me ? -1 : b.r === me ? 1 : Math.round(b.y / 14) - Math.round(a.y / 14) || a.r.i - b.r.i))
    const placed: typeof list = []
    for (const t of list) {
      for (let i = 0; i < 8; i++) {
        const hit = placed.find((p) => Math.abs(p.x - t.x) < (p.tw + t.tw) / 2 + 3 && Math.abs(p.y - t.y) < 21)
        if (!hit) break
        t.y = hit.y - 22
      }
      placed.push(t)
    }
    for (const { r, x, y, tw, label } of placed) {
      g.fillStyle = r === me ? '#ffd166' : 'rgba(255,255,255,0.94)'
      g.strokeStyle = INK
      g.lineWidth = r === me ? 2.5 : 1.5
      g.beginPath()
      g.roundRect(x - tw / 2, y - 10, tw, 19, 8)
      g.fill()
      g.stroke()
      g.fillStyle = r.color
      g.beginPath()
      g.arc(x - tw / 2 + 10, y - 0.5, 6, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      g.fillStyle = INK
      g.fillText(label, x + 6, y + 4)
      if (r.react && r.react.until > performance.now()) {
        g.font = `15px ${FONT}`
        const txt = r.react.html
        const rw = g.measureText(txt).width + 18
        g.fillStyle = '#ffffff'
        g.beginPath()
        g.roundRect(x - rw / 2, y - 38, rw, 24, 10)
        g.fill()
        g.stroke()
        g.fillStyle = INK
        g.fillText(txt, x, y - 21)
        g.font = `12px ${FONT}`
      }
    }
  }

  // ---------- HUD ----------
  let lastPlace = ''
  function hud2(t: number) {
    const live = racers.filter((r) => !r.out)
    const order = [...live].sort((a, b) => Number(b.done) - Number(a.done) || (a.done && b.done ? a.place - b.place : b.w - a.w))
    const focus = racers[watch]
    if (me) {
      const myPlace = me.place || order.indexOf(me) + 1
      const txt = `${ordinal(myPlace)}|of ${racers.length}`
      if (txt !== lastPlace) {
        lastPlace = txt
        const [a, b] = txt.split('|')
        place.querySelector('b')!.textContent = a
        place.querySelector('span')!.textContent = b
      }
    } else if (focus) {
      place.querySelector('b')!.textContent = ordinal(order.indexOf(focus) + 1)
      place.querySelector('span')!.textContent = esc(focus.name)
    }
    place.querySelector('small')!.textContent = t < 0 ? 'Get ready' : fmtTime((me && S.finished ? S.finishT : t) * 1000)
    racers.forEach((r, k) => {
      const f = Math.max(0, Math.min(1, r.w / SLED.length))
      dots[k].style.transform = `translateX(${Math.round(f * 330)}px)`
      dots[k].classList.toggle('out', r.out)
    })
    const watching = !me || S.finished
    watchBar.hidden = !watching || racers.every((r) => r.done || r.out)
    if (!watchBar.hidden && focus) {
      const html = `Watching <b>${esc(focus.name)}</b> <span class="mp-hint-k"><kbd>←</kbd><kbd>→</kbd> switch</span>`
      if (watchBar.dataset.html !== html) {
        watchBar.dataset.html = html
        watchBar.innerHTML = html
      }
    }
  }

  // ---------- the loop ----------
  let raf = 0
  let last = performance.now()
  let lastLeaderCheck = 0
  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const t = raceT()
    countdown(t)
    if (t >= 0) step(dt, t)
    coast(dt)
    ghosts(t)
    // lean into turns
    for (const r of racers) {
      const lat = dt > 0 ? (r.v - r.lastV) / dt : 0
      r.lastV = r.v
      r.lean += (Math.max(-0.16, Math.min(0.16, -lat / 1500)) - r.lean) * Math.min(1, dt * 8)
    }
    // who the camera follows when you're watching: the leader of whoever's still riding
    if ((!me || S.finished) && !watchPicked && now - lastLeaderCheck > 900) {
      lastLeaderCheck = now
      const racing = racers.filter((r) => !r.done && !r.out)
      if (S.finished && me && now - t0 - S.finishT * 1000 < 1800) watch = me.i
      else if (racing.length) watch = racing.sort((a, b) => b.w - a.w)[0].i
    }
    const focus = me && !S.finished ? me : racers[watch] ?? me
    if (focus) cam.w += ((focus === me ? S.w : focus.w) - cam.w) * (focus === me ? 1 : Math.min(1, dt * 6))
    loop.set(me && !S.finished && t >= 0 && S.air < 1 ? Math.min(1, S.speed / 420) : 0)
    fit()
    g.save()
    if (shake > 0) {
      shake -= dt
      g.translate((Math.random() - 0.5) * 10 * shake * 3, (Math.random() - 0.5) * 10 * shake * 3)
    }
    ground(t)
    sprites(t)
    particles(dt)
    tags()
    g.restore()
    hud2(t)
  }
  raf = requestAnimationFrame(frame)

  // ---------- server events ----------
  function onGhosts(e: Extract<MpS2C, { k: 'gh' }>) {
    const t = raceT() * 1000
    const off = e.tm - t
    offset = offsetSet ? offset + (off - offset) * 0.1 : off
    offsetSet = true
    for (const [i, d, x, v, f] of e.p as GhostWire[]) {
      const r = racers[i]
      if (!r) continue
      r.snaps.push({ tm: e.tm, d, x, v, f })
      if (r.snaps.length > 8) r.snaps.shift()
      if (f & GF.out) r.out = true
      if (r !== me && !r.snaps[1]) {
        r.w = d
        r.v = x
      }
    }
  }
  function onEvent(ev: RaceEvent) {
    const r = 'i' in ev ? racers[ev.i] : null
    switch (ev.k) {
      case 'fin':
        if (!r) return
        r.done = true
        r.place = ev.place
        if (r !== me) line(`<b>${esc(r.name)}</b> finished ${ordinal(ev.place)}!`)
        else if (me) {
          me.place = ev.place
          bigText(`${ordinal(ev.place)}!`)
        }
        return
      case 'left':
        if (r && r !== me) {
          r.out = true
          line(`${esc(r.name)} left the race`)
        }
        return
      case 'back':
        if (r && r !== me) r.out = false
        return
      case 'end':
        if (!me || !S.finished) line(`${Math.round(ev.ms / 1000)} seconds left to cross the line!`)
        return
    }
  }

  return {
    id: m.id,
    event(e) {
      if (e.k === 'gh') onGhosts(e)
      else if (e.k === 'ev') onEvent(e.e)
      else if (e.k === 'start') {
        // the same race again (after a reconnect): keep our clock honest
        t0 = performance.now() + e.m.startIn
      }
    },
    react(id, html) {
      const r = racers.find((x) => x.id === id)
      if (r) r.react = { html: html.replace(/<[^>]+>/g, '').trim() || '👏', until: performance.now() + 2200 }
    },
    finish(r: ResultsWire) {
      void r
      // a beat to see the finish at 34th St (longer if you just crossed the line)
      return me && S.finished && performance.now() - t0 - S.finishT * 1000 < 2500 ? 2200 : 1200
    },
    destroy() {
      cancelAnimationFrame(raf)
      loop.stop()
      window.removeEventListener('keydown', down, true)
      window.removeEventListener('keyup', up, true)
      window.removeEventListener('blur', blur)
    },
  }
}

const CRASH_LINE: Partial<Record<SledObj['k'], string>> = {
  cart: 'Gelato cart! Wipeout!',
  planter: 'Planter! Wipeout!',
  ranger: 'The park ranger blew the whistle. Wipeout!',
  pigeon: 'Pigeon! Wipeout!',
  tourist: 'Tourist! Wipeout!',
  lounger: 'Lounger! Wipeout!',
  birch: 'Birch tree! Wipeout!',
}

/** where rider i of n lines up (the server's race.ts uses the same spread) */
function startV(i: number, n: number): number {
  if (n <= 1) return 0
  const span = Math.min(SLED.halfW * 1.5, 90 * (n - 1))
  return -span / 2 + (span * i) / (n - 1)
}
