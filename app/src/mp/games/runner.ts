/**
 * Rush Hour Run, in the browser: three lanes down an endless Times Square platform at rush hour, heading downtown
 * on the 1 (a station every 100 m, last stop South Ferry). ← → switch lanes, ↑ jump, ↓ slide. Everyone runs the same
 * seeded course at the same pace; you lose ground by stumbling and gain it with Express diamonds or by running right
 * behind someone. One bump is a stumble, two close together and you're out. Last one standing wins.
 * When you're out, you watch, and you get two Showtime dancers to send at whoever you're watching. They can always
 * be dodged (switch lanes or slide under the swinging legs).
 */
import { el } from '../../engine/stage'
import { headPortrait } from '../../avatar/render'
import { randomLook } from '../../avatar/random'
import type { Look } from '../../avatar/look'
import { RUN, STATIONS, stationAt, runnerCourse, runSpeed, runDistance, runStartGrid, RUN_KIND, type RunObstacle, type RunPickup } from '../shared/runner'
import { GF, type GhostWire, type MpS2C, type RaceEvent, type ResultsWire } from '../shared/protocol'
import { MP_TEAMS, ordinal } from '../shared/games'
import { seeded } from '../shared/rng'
import { avatarPic, walkCycle, loadAll, drawAvatar, sharpCanvas, type AvatarPic } from '../sprites'
import { msfx, slideLoop } from '../sound'
import { esc } from '../store'
import type { GameCtx, RunningGame } from '../controller'
import { SLOT_COLORS } from './sled'
import './runner.css'

// ---------- the camera ----------
const F = 430
const HY = 160
const CX = 500
const CAM_H = 2.6
const CAM_BACK = 5.6
/** avatar units to metres (a New Yorker is about 150 units, 1.6 m) */
const AV_M = 1.6 / 150
const WALL_X = -3.3
const EDGE_X = 2.5
const STRIP_X = 1.95
const TRAIN_X = 3.2
const CEIL = 3.9
const laneX = (l: number) => (l - 1) * RUN.laneW

const ART = '/art/mp/'
const IMG = {
  turnstile: ART + 'run-turnstile.png',
  wetfloor: ART + 'run-wetfloor.png',
  bucket: ART + 'run-bucket.png',
  trash: ART + 'run-trash.png',
  bench: ART + 'run-bench.png',
  column: ART + 'run-column.png',
  mattress: ART + 'run-mattress.png',
  card: ART + 'run-card.png',
  express: ART + 'run-express.png',
  cat: ART + 'cat.png',
  rat: ART + 'rat.png',
  boxes: ART + 'run-boxes.png',
}
type ImgKey = keyof typeof IMG

interface Snap {
  tm: number
  d: number
  /** how far ahead of (or behind) the base pace they were at tm: everyone runs the same pace, so this is what moves */
  g: number
  x: number
  v: number
  f: number
}
interface Runner {
  i: number
  id: string
  name: string
  look: Look
  team?: 'up' | 'down'
  color: string
  run: AvatarPic[]
  jump?: AvatarPic
  slide?: AvatarPic
  snaps: Snap[]
  d: number
  x: number
  /** the gap to the base pace as drawn (smoothed), where the jump we're showing started, and the lean of a lane change */
  gs: number
  airAt: number
  wasAir: boolean
  lean: number
  flags: number
  done: boolean
  out: boolean
  outD: number
  react: { text: string; until: number } | null
}
interface Dancer {
  d: number
  lane: number
  /** the runner it was sent at (only they bump into it) */
  to: number
  from: string
  pic?: AvatarPic
}

export function start(ctx: GameCtx): RunningGame {
  const m = ctx.match
  const course = runnerCourse(m.seed)
  const meIdx = m.you
  // the start line: everyone across the three lanes (the server lines them up the same way)
  const grid = runStartGrid(m.players.map((p) => !!p.bot))
  const runners: Runner[] = m.players.map((p, i) => ({
    i,
    id: p.i,
    name: p.n,
    look: p.l as Look,
    team: p.tm,
    color: m.mode === 'teams' && p.tm ? MP_TEAMS[p.tm].color : SLOT_COLORS[i % SLOT_COLORS.length],
    run: [],
    snaps: [],
    d: grid[i].d,
    x: grid[i].lane,
    gs: grid[i].d,
    airAt: -9,
    wasAir: false,
    lean: 0,
    flags: 0,
    done: false,
    out: false,
    outD: 0,
    react: null,
  }))
  for (const r of runners) {
    void walkCycle(r.look, { back: true, n: 8 }).then((f) => (r.run = f))
    void avatarPic(r.look, { pose: 'jump', back: true, t: 0.22 }).then((p) => (r.jump = p))
    void avatarPic(r.look, { pose: 'sit', back: true }).then((p) => (r.slide = p))
  }
  const imgs: Partial<Record<ImgKey, HTMLImageElement>> = {}
  void loadAll(Object.values(IMG)).then((list) => (Object.keys(IMG) as ImgKey[]).forEach((k, i) => (imgs[k] = list[i])))
  // the commuters on the platform (they face you, on their phones), the movers, the Showtime dancers
  const rr = seeded(m.seed ^ 0x9e0)
  const commuters: AvatarPic[] = []
  const movers: AvatarPic[] = []
  const dancerPics: AvatarPic[] = []
  for (let k = 0; k < 6; k++) void avatarPic(randomLook(0.6, rr), { pose: 'idle', k: 1.5 }).then((p) => (commuters[k] = p))
  for (let k = 0; k < 3; k++) void avatarPic(randomLook(0.4, rr), { pose: 'cheer', t: 0.3, k: 1.5 }).then((p) => (movers[k] = p))
  for (let k = 0; k < 3; k++) void avatarPic(randomLook(0.8, rr), { pose: 'dance', t: 0.4 + k * 0.3, k: 1.5 }).then((p) => (dancerPics[k] = p))

  // ---------- DOM ----------
  const root = ctx.root
  root.classList.add('rn')
  const { canvas, ctx: g, fit } = sharpCanvas('rn-canvas')
  const hud = el('div', 'mp-hud')
  const place = el('div', 'mp-hud-place', '<b>–</b><span></span><small>0 m</small>')
  const strip = el('div', 'rn-line')
  STATIONS.forEach((s, k) => {
    const st = el('span', 'rn-stop' + (k === STATIONS.length - 1 ? ' end' : ''))
    st.style.left = `${(k / (STATIONS.length - 1)) * 100}%`
    st.title = s
    strip.append(st)
  })
  strip.append(el('span', 'rn-line-from', 'Times Sq'), el('span', 'rn-line-to', 'South Ferry'))
  const bullets = runners.map((r) => {
    const b = el('span', 'rn-bullet' + (r.i === meIdx ? ' you' : ''), headPortrait(r.look))
    b.style.borderColor = r.color
    b.title = r.name
    strip.append(b)
    return b
  })
  // who's where, at a glance (the tags only name the nearest few)
  const rank = el('ol', 'rn-rank')
  rank.setAttribute('aria-label', 'Standings')
  const power = el('div', 'rn-power')
  const cardsEl = el('div', 'rn-cards', `<img src="${IMG.card}" alt=""><b>0</b>`)
  const hint = el('div', 'mp-hint', '<span><kbd>←</kbd><kbd>→</kbd> lanes</span><span><kbd>↑</kbd> jump</span><span><kbd>↓</kbd> slide</span>')
  const big = el('div', 'mp-big')
  const watchBar = el('div', 'mp-watch rn-watch')
  watchBar.hidden = true
  hud.append(place, strip, rank, cardsEl, power, hint, big, watchBar)
  root.append(canvas, hud)
  if (meIdx < 0) {
    hint.hidden = true
    cardsEl.hidden = true
  }
  setTimeout(() => hint.classList.add('dim'), 9000)
  const bigText = (text: string, small = false) => {
    big.className = 'mp-big' + (small ? ' small' : '')
    big.textContent = text
    void big.offsetWidth
    big.classList.add('pop')
  }
  let lastLine = 0
  const line = (html: string, force = false) => {
    const now = performance.now()
    if (!force && now - lastLine < 600) return
    lastLine = now
    hud.querySelector('.mp-toastline')?.remove()
    const t = el('div', 'mp-toastline', html)
    hud.append(t)
    setTimeout(() => t.remove(), 2300)
  }

  // ---------- time ----------
  let t0 = performance.now() + m.startIn
  const raceT = () => (performance.now() - t0) / 1000
  let offset = 0
  let offsetSet = false

  // ---------- me ----------
  const me = meIdx >= 0 ? runners[meIdx] : null
  const S = {
    d: 0,
    x: me ? grid[meIdx].lane : 1,
    lane: me ? grid[meIdx].lane : 1,
    jumpAt: -9,
    slideAt: -9,
    stumbleAt: -99,
    slowUntil: 0,
    expressUntil: 0,
    catUntil: 0,
    cards: 0,
    out: false,
    finished: false,
    endT: 0,
    obs: 0,
    pick: 0,
    taken: new Set<number>(),
    station: 0,
    sendAcc: 0,
    draft: false,
    draftK: 0,
    smashed: new Set<number>(),
    drops: RUN.drops,
    dropAt: -99,
  }
  const pickups = course.pickups.map((p, k) => ({ ...p, k }))
  const dancers: Dancer[] = []
  let watch = meIdx >= 0 ? meIdx : 0
  let watchPicked = false
  // came back to a race already under way (a reload): your run can't pick up where it was
  if (me && m.startIn < -1500) {
    setTimeout(() => {
      const s = me.snaps[me.snaps.length - 1]
      S.d = s?.d ?? 0
      S.out = true
      me.out = true
      ctx.send({ k: 'out', d: Math.round(S.d), tm: Math.round(raceT() * 1000) })
      line('You were disconnected, so you’re watching this one.', true)
    }, 600)
  }

  // ---------- input ----------
  const isUp = (k: string) => k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' '
  const isDown = (k: string) => k === 'ArrowDown' || k === 's' || k === 'S'
  const isLeft = (k: string) => k === 'ArrowLeft' || k === 'a' || k === 'A'
  const isRight = (k: string) => k === 'ArrowRight' || k === 'd' || k === 'D'
  const keydown = (e: KeyboardEvent) => {
    const k = e.key
    const t = raceT()
    const watching = !me || S.out || S.finished
    if (watching) {
      if (isLeft(k) || isRight(k)) {
        e.preventDefault()
        const live = runners.filter((r) => !r.out && !r.done && r !== me)
        if (!live.length) return
        const at = live.findIndex((r) => r.i === watch)
        watch = live[(at + (isRight(k) ? 1 : live.length - 1) + live.length) % live.length].i
        watchPicked = true
      } else if (k === '1' || k === '2' || k === '3') {
        e.preventDefault()
        sendDancer(Number(k) - 1)
      }
      return
    }
    if (t < 0 || e.repeat) {
      if (isLeft(k) || isRight(k) || isUp(k) || isDown(k)) e.preventDefault()
      return
    }
    if (isLeft(k)) S.lane = Math.max(0, S.lane - 1)
    else if (isRight(k)) S.lane = Math.min(2, S.lane + 1)
    else if (isUp(k)) {
      if (t - S.jumpAt > RUN.jumpS) {
        S.jumpAt = t
        S.slideAt = -9
        msfx.hop()
      }
    } else if (isDown(k)) {
      // down in the air drops you straight into a slide
      if (t - S.jumpAt < RUN.jumpS) S.jumpAt = -9
      S.slideAt = t
      msfx.whoosh()
    } else return
    e.preventDefault()
  }
  window.addEventListener('keydown', keydown, true)

  function sendDancer(lane: number) {
    if (!me || S.drops <= 0) return
    const target = runners[watch]
    if (!target || target === me || target.out || target.done) return line('Watch someone who’s still running first (← →).', true)
    if (raceT() - S.dropAt < RUN.dropCooldownS) return line('One dancer at a time. Give it a second.', true)
    S.drops--
    S.dropAt = raceT()
    ctx.send({ k: 'drop', lane, to: target.i })
    msfx.horn()
  }

  // ---------- the run (mine) ----------
  const loop = slideLoop()
  let shake = 0
  const airY = (t: number) => {
    const p = (t - S.jumpAt) / RUN.jumpS
    return p >= 0 && p <= 1 ? Math.sin(p * Math.PI) * RUN.jumpH : 0
  }
  const sliding = (t: number) => t - S.slideAt < RUN.slideS
  const othersAhead = () => runners.filter((r) => r !== me && !r.out && !r.done)

  function hit(t: number, what: string) {
    if (t < S.expressUntil) return 'smash'
    if (t - S.stumbleAt < RUN.stumbleWindowS) {
      S.out = true
      S.endT = t
      if (me) {
        me.out = true
        me.outD = S.d
      }
      ctx.send({ k: 'out', d: Math.round(S.d), tm: Math.round(t * 1000) })
      msfx.crash()
      shake = 0.45
      bigText('OUT!')
      setTimeout(() => line(`You made it <b>${Math.round(S.d)} m</b>. Now send some Showtime at the others: press <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>`, true), 1300)
      return 'out'
    }
    S.stumbleAt = t
    S.slowUntil = t + RUN.stumbleS
    msfx.bump()
    shake = 0.25
    line(`Watch it! ${what}. Another bump soon and you’re out.`, true)
    return 'stumble'
  }

  // dev only: tools/mpgames_test.py sets window.clubNycMp.autopilot so its players can run like the city locals do
  function autopilot(t: number) {
    const v = runSpeed(t)
    const row = course.rows.find((r) => r.d > S.d - 0.3)
    if (row) {
      const dist = row.d - S.d
      if (dist < v * 0.9) {
        const opts = row.lanes.map((x, l) => ({ l, cost: Math.abs(l - S.lane) + (x === 'run' ? 0 : x === 'block' ? 99 : 0.6) }))
        opts.sort((p, q) => p.cost - q.cost)
        S.lane = opts[0].l
      }
      const need = row.lanes[S.lane]
      if (need === 'jump' && dist < v * 0.25 && t - S.jumpAt > RUN.jumpS) {
        S.jumpAt = t
        S.slideAt = -9
      } else if (need === 'slide' && dist < v * 0.2 && !sliding(t)) S.slideAt = t
    }
    for (const dn of dancers) {
      if (dn.to === meIdx && dn.lane === Math.round(S.x) && dn.d > S.d && dn.d - S.d < v * 0.2 && !sliding(t)) S.slideAt = t
    }
  }

  function step(dt: number, t: number) {
    if (!me || S.out || S.finished || t < 0) return
    if (import.meta.env.DEV && (window as unknown as { clubNycMp?: { autopilot?: boolean } }).clubNycMp?.autopilot) autopilot(t)
    let mult = 1
    if (t < S.slowUntil) mult *= RUN.stumbleMult
    if (t < S.expressUntil) mult *= RUN.expressMult
    // the slipstream: in at 3-14 m behind someone in your lane, out once you're under 2 m or past 15 m, and it
    // eases in and out (at the edge it used to flip on and off every frame, and the whole platform shook)
    const lo = S.draft ? 2 : 3
    const hi = S.draft ? 15 : 14
    S.draft = othersAhead().some((r) => Math.abs(r.x - S.x) < 0.45 && r.d - S.d > lo && r.d - S.d < hi)
    S.draftK = Math.max(0, Math.min(1, S.draftK + (S.draft ? dt : -dt) / 0.35))
    mult *= 1 + (RUN.draftMult - 1) * S.draftK
    const v = runSpeed(t) * mult
    const d0 = S.d
    S.d += v * dt
    S.x += Math.sign(S.lane - S.x) * Math.min(Math.abs(S.lane - S.x), dt / RUN.laneS)
    const y = airY(t)
    const lane = Math.round(S.x)
    // obstacles we just passed
    const obs = course.obstacles
    while (S.obs < obs.length && obs[S.obs].d < d0 - 2) S.obs++
    for (let k = S.obs; k < obs.length && obs[k].d <= S.d; k++) {
      const o = obs[k]
      if (o.d <= d0 || o.lane !== lane || S.smashed.has(k)) continue
      const act = RUN_KIND[o.kind].act
      const cleared = act === 'jump' ? y > 0.42 : act === 'slide' ? sliding(t) : false
      if (cleared) continue
      const res = hit(t, RUN_KIND[o.kind].label)
      if (res === 'smash') {
        S.smashed.add(k)
        msfx.poof()
        line('Express coming through!')
      }
      if (res === 'out') return
    }
    // dancers sent at me
    for (const dn of dancers) {
      if (dn.to !== meIdx || dn.d <= d0 || dn.d > S.d || dn.lane !== lane) continue
      if (sliding(t)) {
        line('Under the dancer! Smooth.', true)
        continue
      }
      if (hit(t, 'Showtime!') === 'out') return
    }
    // pickups
    while (S.pick < pickups.length && pickups[S.pick].d < d0 - 6) S.pick++
    const magnet = t < S.catUntil
    for (let k = S.pick; k < pickups.length && pickups[k].d <= S.d + (magnet ? 6 : 0); k++) {
      const p = pickups[k]
      if (S.taken.has(p.k)) continue
      const near = magnet && p.kind === 'card' ? Math.abs(p.d - S.d) < 6 : p.d > d0 - 0.5 && p.d <= S.d + 0.5 && p.lane === lane && Math.abs(p.h - (y + 0.55)) < 1.0
      if (!near) continue
      S.taken.add(p.k)
      if (p.kind === 'card') {
        S.cards++
        msfx.swipe()
      } else if (p.kind === 'express') {
        S.expressUntil = t + RUN.expressS
        msfx.boost()
        line('<img class="ji" src="/art/mp/run-express.png" alt=""> Express! Nothing can stop you for 3 seconds.', true)
      } else if (p.kind === 'cat') {
        S.catUntil = t + RUN.catS
        msfx.meow()
        line('<img class="ji" src="/art/mp/cat.png" alt=""> The bodega cat is on your side: MetroCards come to you.', true)
      }
    }
    // a station
    const next = S.station + 1
    if (next < STATIONS.length && S.d >= stationAt(next)) {
      S.station = next
      if (next < STATIONS.length - 1) {
        msfx.station()
        line(`<b>${STATIONS[next]}</b>${next + 1 < STATIONS.length ? ` · next stop ${STATIONS[next + 1]}` : ''}`)
      }
    }
    me.d = S.d
    me.x = S.x
    me.flags = (y > 0.2 ? GF.air : 0) | (sliding(t) ? GF.slide : 0) | (t < S.slowUntil ? GF.crash : 0) | (t < S.expressUntil ? GF.boost : 0) | (S.draft ? GF.draft : 0) | (magnet ? GF.magnet : 0)
    S.sendAcc += dt
    if (S.sendAcc >= 0.1) {
      S.sendAcc = 0
      ctx.send({ k: 'pr', d: Math.round(S.d * 10) / 10, x: Math.round(S.x * 100) / 100, v: Math.round(v * 10) / 10, f: me.flags, tm: Math.round(t * 1000), c: S.cards })
    }
    if (S.d >= RUN.length) {
      S.finished = true
      S.endT = t
      ctx.send({ k: 'pr', d: RUN.length, x: Math.round(S.x * 100) / 100, v: Math.round(v), f: me.flags, tm: Math.round(t * 1000), c: S.cards })
      ctx.send({ k: 'fin', tm: Math.round(t * 1000) })
      msfx.finish()
      bigText('SOUTH FERRY!', true)
    }
  }

  // ---------- the others ----------
  /**
   * Everyone runs the same pace, so what really changes between two runners is the gap to that pace (a stumble, a
   * diamond, a slower local). We keep each runner's gap from the server's updates, play it back a little behind
   * (INTERP_MS, so there's always an update on each side to blend between) and add it to the base pace at *our* race
   * clock. Someone level with you stays level, nobody steps back and forth when an update lands, and a late update
   * only bends the gap a little instead of moving the runner.
   */
  const INTERP_MS = 130
  function ghosts(t: number, dt: number) {
    const rt = t * 1000 + offset - INTERP_MS
    const base = runDistance(t)
    const kD = 1 - Math.exp(-dt * 10)
    const kX = 1 - Math.exp(-dt * 16)
    for (const r of runners) {
      if (r === me) continue
      const sn = r.snaps
      if (!sn.length) continue
      const last = sn[sn.length - 1]
      let gap: number
      let x: number
      let f: number
      if (rt >= last.tm || sn.length === 1) {
        // nothing newer yet: carry the gap along its last slope for a moment
        const prev = sn.length > 1 ? sn[sn.length - 2] : last
        const slope = last.tm > prev.tm ? (last.g - prev.g) / (last.tm - prev.tm) : 0
        gap = last.g + slope * Math.min(250, Math.max(0, rt - last.tm))
        x = last.x
        f = last.f
      } else if (rt <= sn[0].tm) {
        gap = sn[0].g
        x = sn[0].x
        f = sn[0].f
      } else {
        let k = sn.length - 1
        while (k > 1 && sn[k - 1].tm > rt) k--
        const a = sn[k - 1]
        const b = sn[k]
        const u = b.tm > a.tm ? (rt - a.tm) / (b.tm - a.tm) : 1
        gap = a.g + (b.g - a.g) * u
        x = a.x + (b.x - a.x) * u
        f = a.f
      }
      // out or at South Ferry: that's where they stay (the newest word on that wins over the playback)
      const ended = last.f & (GF.out | GF.done)
      if (ended) {
        f = last.f
        gap = last.d - base
        r.gs = gap
      } else if (Math.abs(gap - r.gs) > 6) r.gs = gap
      else r.gs += (gap - r.gs) * kD
      r.d = Math.min(RUN.length, base + r.gs)
      if (ended && last.f & GF.out) r.d = last.d
      const x0 = r.x
      r.x += (x - r.x) * kX
      r.lean += ((dt > 0 ? (r.x - x0) / dt : 0) * 0.05 - r.lean) * kX
      // a jump plays as a whole arc from the moment it shows up, whatever the update rate
      const air = !!(f & GF.air)
      if (air && !r.wasAir && t - r.airAt > RUN.jumpS * 0.8) r.airAt = t
      r.wasAir = air
      r.flags = f
      if (last.f & GF.done) r.done = true
      if (last.f & GF.out && !r.out) {
        r.out = true
        r.outD = last.d
      }
    }
  }
  /** a runner's height off the floor right now (m) */
  const heightOf = (r: Runner, t: number) => {
    if (r === me) return airY(t)
    const p = (t - r.airAt) / RUN.jumpS
    return p >= 0 && p <= 1 ? Math.sin(p * Math.PI) * RUN.jumpH : 0
  }

  // ---------- drawing ----------
  const cam = { d: -CAM_BACK, x: 0 }
  const Z = (d: number) => d - cam.d
  const SX = (X: number, z: number) => CX + (F * (X - cam.x)) / z
  const SY = (Y: number, z: number) => HY + (F * (CAM_H - Y)) / z

  function drawImgAt(key: ImgKey, X: number, z: number, hM: number, o: { Y?: number; alpha?: number; sx?: number } = {}) {
    const img = imgs[key]
    if (!img?.naturalWidth || z < 0.6) return
    const k = F / z
    const h = hM * k
    const w = (img.naturalWidth / img.naturalHeight) * h
    const x = SX(X, z)
    const y = SY(o.Y ?? 0, z)
    g.save()
    if (o.alpha !== undefined) g.globalAlpha = o.alpha
    g.translate(x, y)
    if (o.sx !== undefined) g.scale(o.sx, 1)
    g.drawImage(img, -w / 2, -h, w, h)
    g.restore()
  }
  function quad(pts: [number, number][], fill: string | CanvasGradient, stroke?: string, lw = 2) {
    g.beginPath()
    pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)))
    g.closePath()
    g.fillStyle = fill
    g.fill()
    if (stroke) {
      g.strokeStyle = stroke
      g.lineWidth = lw
      g.stroke()
    }
  }
  /** text on the tiled wall (an affine fit of the wall's perspective over the sign) */
  function wallText(d0: number, d1: number, y0: number, y1: number, text: string) {
    const z0 = Z(d0)
    const z1 = Z(d1)
    if (z0 < 1 || z1 > 140) return
    const p0: [number, number] = [SX(WALL_X, z0), SY(y1, z0)]
    const p1: [number, number] = [SX(WALL_X, z1), SY(y1, z1)]
    const p2: [number, number] = [SX(WALL_X, z0), SY(y0, z0)]
    // the plaque
    quad([p0, p1, [SX(WALL_X, z1), SY(y0, z1)], p2], '#1d3c8a', '#d9a51f', Math.max(1, 4 * (F / z0) * 0.02))
    const W = 200
    const H = 40
    g.save()
    g.transform((p1[0] - p0[0]) / W, (p1[1] - p0[1]) / W, (p2[0] - p0[0]) / H, (p2[1] - p0[1]) / H, p0[0], p0[1])
    g.fillStyle = '#ffffff'
    g.font = "26px 'Burbank Display', 'Lilita One', sans-serif"
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText(text, W / 2, H / 2 + 1, W - 16)
    g.restore()
  }

  function platform() {
    // the ceiling and the far glow
    const sky = g.createLinearGradient(0, 0, 0, HY + 30)
    sky.addColorStop(0, '#1f3a30')
    sky.addColorStop(1, '#2d4a3d')
    g.fillStyle = sky
    g.fillRect(0, 0, 1000, 565)
    const zN = 1.2
    const zF = 150
    const glow = g.createRadialGradient(CX - (F * cam.x) / zF, HY, 2, CX - (F * cam.x) / zF, HY, 150)
    glow.addColorStop(0, 'rgba(255, 236, 170, 1)')
    glow.addColorStop(0.25, 'rgba(255, 214, 120, 0.55)')
    glow.addColorStop(1, 'rgba(255, 214, 120, 0)')
    // the tiled wall on the left
    const wall = g.createLinearGradient(0, SY(CEIL, zN), 0, SY(0, zN))
    wall.addColorStop(0, '#dfe5ea')
    wall.addColorStop(1, '#f6f6f0')
    quad([[SX(WALL_X, zN), SY(0, zN)], [SX(WALL_X, zF), SY(0, zF)], [SX(WALL_X, zF), SY(CEIL, zF)], [SX(WALL_X, zN), SY(CEIL, zN)]], wall)
    // the mosaic band along the wall
    quad([[SX(WALL_X, zN), SY(2.55, zN)], [SX(WALL_X, zF), SY(2.55, zF)], [SX(WALL_X, zF), SY(2.85, zF)], [SX(WALL_X, zN), SY(2.85, zN)]], '#2f5bb5')
    quad([[SX(WALL_X, zN), SY(2.5, zN)], [SX(WALL_X, zF), SY(2.5, zF)], [SX(WALL_X, zF), SY(2.55, zF)], [SX(WALL_X, zN), SY(2.55, zN)]], '#d9a51f')
    quad([[SX(WALL_X, zN), SY(2.85, zN)], [SX(WALL_X, zF), SY(2.85, zF)], [SX(WALL_X, zF), SY(2.9, zF)], [SX(WALL_X, zN), SY(2.9, zN)]], '#d9a51f')
    // tile rows on the wall
    g.strokeStyle = 'rgba(140, 150, 160, 0.35)'
    g.lineWidth = 1
    for (let Y = 0.3; Y < 2.5; Y += 0.3) {
      g.beginPath()
      g.moveTo(SX(WALL_X, zN), SY(Y, zN))
      g.lineTo(SX(WALL_X, zF), SY(Y, zF))
      g.stroke()
    }
    // the track bed and the train on the right
    quad([[SX(EDGE_X, zN), SY(0, zN)], [SX(EDGE_X, zF), SY(0, zF)], [SX(TRAIN_X, zF), SY(-1, zF)], [SX(TRAIN_X, zN), SY(-1, zN)]], '#2b2a30')
    const train = g.createLinearGradient(0, SY(3.1, zN), 0, SY(-0.4, zN))
    train.addColorStop(0, '#c8ccd6')
    train.addColorStop(0.5, '#e4e7ee')
    train.addColorStop(1, '#9aa1ae')
    quad([[SX(TRAIN_X, zN), SY(-0.4, zN)], [SX(TRAIN_X, zF), SY(-0.4, zF)], [SX(TRAIN_X, zF), SY(3.1, zF)], [SX(TRAIN_X, zN), SY(3.1, zN)]], train)
    // the floor
    const floor = g.createLinearGradient(0, HY, 0, 565)
    floor.addColorStop(0, '#9b9da3')
    floor.addColorStop(1, '#c4c5c4')
    quad([[SX(WALL_X, zN), SY(0, zN)], [SX(WALL_X, zF), SY(0, zF)], [SX(EDGE_X, zF), SY(0, zF)], [SX(EDGE_X, zN), SY(0, zN)]], floor)
    // the yellow strip at the edge
    quad([[SX(STRIP_X, zN), SY(0, zN)], [SX(STRIP_X, zF), SY(0, zF)], [SX(EDGE_X, zF), SY(0, zF)], [SX(EDGE_X, zN), SY(0, zN)]], '#f2c12e')
    // floor tiles (rows across, lines along)
    const first = Math.ceil((cam.d + zN) / 1.5) * 1.5
    g.strokeStyle = 'rgba(70, 72, 80, 0.32)'
    g.lineWidth = 1.2
    for (let d = first; d < cam.d + 60; d += 1.5) {
      const z = Z(d)
      g.beginPath()
      g.moveTo(SX(WALL_X, z), SY(0, z))
      g.lineTo(SX(STRIP_X, z), SY(0, z))
      g.stroke()
    }
    for (let X = WALL_X + 0.95; X < STRIP_X; X += 0.95) {
      g.beginPath()
      g.moveTo(SX(X, zN), SY(0, zN))
      g.lineTo(SX(X, zF), SY(0, zF))
      g.stroke()
    }
    // bumps on the yellow strip
    g.fillStyle = 'rgba(160, 120, 10, 0.55)'
    for (let d = Math.ceil((cam.d + 2) / 0.6) * 0.6; d < cam.d + 30; d += 0.6) {
      const z = Z(d)
      const k = F / z
      for (const X of [2.08, 2.22, 2.36]) {
        g.beginPath()
        g.ellipse(SX(X, z), SY(0, z), Math.max(0.6, 0.035 * k), Math.max(0.3, 0.018 * k), 0, 0, Math.PI * 2)
        g.fill()
      }
    }
    // the train's windows and doors (a car every 18 m)
    for (let d = Math.floor((cam.d + 1) / 2.4) * 2.4; d < cam.d + 110; d += 2.4) {
      const z0 = Z(d)
      const z1 = Z(d + 1.5)
      if (z0 < 1.2) continue
      const inCar = ((d % 18) + 18) % 18
      const door = inCar > 7.2 && inCar < 9.6
      quad(
        [[SX(TRAIN_X, z0), SY(door ? 0.1 : 1.25, z0)], [SX(TRAIN_X, z1), SY(door ? 0.1 : 1.25, z1)], [SX(TRAIN_X, z1), SY(2.35, z1)], [SX(TRAIN_X, z0), SY(2.35, z0)]],
        door ? '#7d8592' : '#2a4058',
        '#1d2140',
        Math.max(1, 0.04 * (F / z0)),
      )
      if (!door) {
        g.fillStyle = 'rgba(255, 230, 160, 0.35)'
        g.beginPath()
        g.moveTo(SX(TRAIN_X, z0), SY(2.0, z0))
        g.lineTo(SX(TRAIN_X, z1), SY(2.35, z1))
        g.lineTo(SX(TRAIN_X, z0), SY(2.35, z0))
        g.fill()
      }
      if (inCar < 2.4) {
        g.strokeStyle = '#1d2140'
        g.lineWidth = Math.max(1, 0.06 * (F / z0))
        g.beginPath()
        g.moveTo(SX(TRAIN_X, z0), SY(-0.4, z0))
        g.lineTo(SX(TRAIN_X, z0), SY(3.1, z0))
        g.stroke()
      }
    }
    g.fillStyle = glow
    g.fillRect(0, 0, 1000, 565)
    // station signs on the wall
    for (let k = 0; k < STATIONS.length; k++) {
      const sd = k === 0 ? 6 : stationAt(k) - 4
      if (sd < cam.d + 2 || sd > cam.d + 120) continue
      wallText(sd, sd + 5, 1.35, 2.05, STATIONS[k])
    }
    // ceiling beams
    g.strokeStyle = '#173027'
    for (let d = Math.ceil((cam.d + 2) / 8) * 8; d < cam.d + 120; d += 8) {
      const z = Z(d)
      g.lineWidth = Math.max(1, 0.25 * (F / z))
      g.beginPath()
      g.moveTo(SX(WALL_X, z), SY(CEIL, z))
      g.lineTo(SX(TRAIN_X, z), SY(CEIL, z))
      g.stroke()
    }
  }

  type Item = { z: number; draw: () => void }
  /** dev only: tools that measure smoothness set window.rnTrace = [] and read back [ms, runner, screen x, screen y, depth] */
  let camFocusX = 1
  const devTrace = () => (import.meta.env.DEV ? (window as unknown as { rnTrace?: number[][] }).rnTrace : undefined)
  function runnerDraw(r: Runner, z: number, t: number, fade = 1): Item {
    return {
      z,
      draw: () => {
        const isMe = r === me
        const X = laneX(isMe ? S.x : r.x)
        const air = heightOf(r, t)
        const slide = isMe ? sliding(t) : !!(r.flags & GF.slide)
        const out = isMe ? S.out : r.out
        const k = (F / z) * AV_M
        const x = SX(X, z)
        const yG = SY(0, z)
        const y = SY(air, z)
        // someone right behind whoever the camera follows would hide them: in the same lane they fade out early, in
        // a side lane (beside you, in plain view) only as they reach the lens
        const side = Math.abs((isMe ? S.x : r.x) - camFocusX) > 0.6
        const near = side ? Math.max(0, Math.min(1, (z - 2.5) / 0.8)) : Math.max(0, Math.min(1, (z - 3.1) / 1.5))
        devTrace()?.push([performance.now(), r.i, x, yG, z])
        if (near <= 0.02) return
        // a soft shadow on the floor (smaller and lighter while they're in the air)
        const lift = 1 - Math.min(0.45, air * 0.3)
        g.fillStyle = `rgba(29, 33, 64, ${0.28 * near * lift})`
        g.beginPath()
        g.ellipse(x, yG, 29 * k * lift, 9 * k * lift, 0, 0, Math.PI * 2)
        g.fill()
        const alpha = fade * near
        const d = isMe ? S.d : r.d
        let pic: AvatarPic | undefined
        let rot = 0
        if (out) {
          pic = r.slide
          rot = -1.3
        } else if (slide) pic = r.slide
        else if (air > 0.1) pic = r.jump
        else if (r.run.length) pic = r.run[Math.floor(((d * 1.6) % 1) * r.run.length) % r.run.length]
        const stumble = isMe ? t < S.slowUntil : !!(r.flags & GF.crash)
        if (stumble && !out) rot = Math.sin(t * 30) * 0.12
        // leaning into a lane change
        else if (!out) rot = Math.max(-0.16, Math.min(0.16, isMe ? (S.lane - S.x) * 0.2 : r.lean))
        if (pic) drawAvatar(g, pic, x, y + (slide ? 4 * k : 0), k, { alpha, rot })
        if (isMe ? t < S.expressUntil : r.flags & GF.boost) {
          g.strokeStyle = `rgba(229, 72, 59, ${0.75 * alpha})`
          g.lineWidth = 3
          for (let s = 0; s < 4; s++) {
            const ox = (s - 1.5) * 18 * k
            g.beginPath()
            g.moveTo(x + ox, y - 30 * k)
            g.lineTo(x + ox * 1.4, y + 30 * k)
            g.stroke()
          }
        }
      },
    }
  }

  function obstacleItem(o: RunObstacle, idx: number, z: number, t: number): Item {
    return {
      z,
      draw: () => {
        const X = laneX(o.lane)
        const smashed = me && S.smashed.has(idx)
        if (smashed) return
        switch (o.kind) {
          case 'turnstile':
            drawImgAt('turnstile', X, z, 1.05)
            break
          case 'wetfloor':
            drawImgAt('wetfloor', X, z, 0.8)
            break
          case 'bucket':
            drawImgAt('bucket', X, z, 0.72)
            break
          case 'bench':
            drawImgAt('bench', X, z, 0.62)
            break
          case 'trash':
            drawImgAt('trash', X, z, 1.12)
            break
          case 'column':
            drawImgAt('column', X, z, 2.0)
            break
          case 'rat': {
            const wob = Math.sin(t * 9 + o.d) * 0.08
            drawImgAt('rat', X + wob, z, 0.42, { sx: o.v % 2 ? -1 : 1 })
            break
          }
          case 'commuter': {
            const pic = commuters[o.v % commuters.length]
            if (pic) drawAvatar(g, pic, SX(X, z), SY(0, z), (F / z) * AV_M)
            break
          }
          case 'mattress': {
            const pic = movers[o.v % movers.length]
            if (pic) drawAvatar(g, pic, SX(X + 0.62, z), SY(0, z), (F / z) * AV_M)
            drawImgAt('mattress', X, z, 0.48, { Y: 1.32 })
            break
          }
          case 'sign': {
            // a low station sign hanging over the lane: slide under
            const x0 = SX(X - RUN.laneW / 2, z)
            const x1 = SX(X + RUN.laneW / 2, z)
            const yt = SY(1.62, z)
            const yb = SY(1.12, z)
            g.strokeStyle = '#1d2140'
            g.lineWidth = Math.max(1, 0.03 * (F / z))
            for (const cx of [x0 + (x1 - x0) * 0.2, x0 + (x1 - x0) * 0.8]) {
              g.beginPath()
              g.moveTo(cx, SY(CEIL, z))
              g.lineTo(cx, yt)
              g.stroke()
            }
            quad([[x0, yt], [x1, yt], [x1, yb], [x0, yb]], '#1f1f24', '#1d2140', Math.max(1, 0.05 * (F / z)))
            const fs = Math.max(6, (yb - yt) * 0.5)
            g.fillStyle = '#ffffff'
            g.font = `${fs}px 'Burbank Display', 'Lilita One', sans-serif`
            g.textAlign = 'center'
            g.textBaseline = 'middle'
            g.fillText('DOWNTOWN', (x0 + x1) / 2, (yt + yb) / 2 + 1, x1 - x0 - 6)
            g.textBaseline = 'alphabetic'
            break
          }
        }
      },
    }
  }

  function pickupItem(p: RunPickup & { k: number }, z: number, t: number): Item | null {
    if (me && S.taken.has(p.k)) return null
    return {
      z,
      draw: () => {
        const X = laneX(p.lane)
        if (p.kind === 'card') drawImgAt('card', X, z, 0.26, { Y: p.h - 0.13, sx: Math.max(0.15, Math.abs(Math.cos(t * 3 + p.d))) })
        else if (p.kind === 'express') {
          const k = F / z
          g.fillStyle = 'rgba(229, 72, 59, 0.25)'
          g.beginPath()
          g.arc(SX(X, z), SY(p.h + 0.05, z), 0.42 * k, 0, Math.PI * 2)
          g.fill()
          drawImgAt('express', X, z, 0.5, { Y: p.h - 0.2 + Math.sin(t * 4) * 0.05 })
        } else if (p.kind === 'cat') drawImgAt('cat', X, z, 0.5, { Y: p.h - 0.25 + Math.abs(Math.sin(t * 5)) * 0.08 })
      },
    }
  }

  function scene(t: number) {
    const items: Item[] = []
    const near = cam.d + 1
    const far = cam.d + 95
    // columns along the wall, lamps along the ceiling
    for (let d = Math.ceil(near / 8) * 8; d < far; d += 8) {
      const z = Z(d)
      items.push({ z, draw: () => drawImgAt('column', -2.75, z, 3.9) })
      const zl = Z(d + 4)
      items.push({
        z: zl,
        draw: () => {
          const k = F / zl
          const x = SX(0, zl)
          const y = SY(3.45, zl)
          g.fillStyle = 'rgba(255, 226, 150, 0.25)'
          g.beginPath()
          g.ellipse(x, y + 0.25 * k, 0.9 * k, 0.35 * k, 0, 0, Math.PI * 2)
          g.fill()
          g.fillStyle = '#2f6b4f'
          g.strokeStyle = '#1d2140'
          g.lineWidth = Math.max(1, 0.03 * k)
          g.beginPath()
          g.moveTo(x - 0.28 * k, y + 0.12 * k)
          g.lineTo(x + 0.28 * k, y + 0.12 * k)
          g.lineTo(x + 0.12 * k, y - 0.12 * k)
          g.lineTo(x - 0.12 * k, y - 0.12 * k)
          g.closePath()
          g.fill()
          g.stroke()
          g.fillStyle = '#fff3c4'
          g.beginPath()
          g.ellipse(x, y + 0.13 * k, 0.16 * k, 0.05 * k, 0, 0, Math.PI * 2)
          g.fill()
        },
      })
    }
    course.obstacles.forEach((o, k) => {
      if (o.d < near || o.d > far) return
      items.push(obstacleItem(o, k, Z(o.d), t))
    })
    for (const p of pickups) {
      if (p.d < near || p.d > far) continue
      const it = pickupItem(p, Z(p.d), t)
      if (it) items.push(it)
    }
    const focus = runners[watch]
    for (const dn of dancers) {
      if (dn.d < near || dn.d > far) continue
      // a dancer is only on the platform of the runner it was sent at
      if (focus && dn.to !== focus.i) continue
      const z = Z(dn.d)
      items.push({
        z,
        draw: () => {
          const X = laneX(dn.lane)
          const k = F / z
          g.strokeStyle = '#d9a51f'
          g.lineWidth = Math.max(1.5, 0.06 * k)
          g.beginPath()
          g.moveTo(SX(X - 0.35, z), SY(0, z))
          g.lineTo(SX(X - 0.35, z), SY(CEIL, z))
          g.stroke()
          if (dn.pic) {
            // mid-flip around the pole: legs out at head height (slide under, or switch lanes)
            drawAvatar(g, dn.pic, SX(X - 0.35, z), SY(1.25, z), k * AV_M, { rot: -Math.PI / 2 + Math.sin(t * 6) * 0.2 })
          }
        },
      })
    }
    // the runner the camera follows (you, or whoever you're watching) always reads clearly: someone on its heels is
    // drawn behind it, and someone overlapping it in the same lane goes see-through
    const followed = me && !S.out && !S.finished ? me : runners[watch]
    const focusZ = followed === me ? (me && !S.out ? Z(S.d) : null) : followed && !followed.out ? Z(followed.d) : null
    const focusX = followed === me ? S.x : followed?.x ?? 1
    camFocusX = focusX
    for (const r of runners) {
      if (r === me || r.out) continue
      const z = Z(r.d)
      if (z < 1.2 || z > 95) continue
      const overlap = r !== followed && focusZ !== null && Math.abs(r.x - focusX) < 0.6 && z > focusZ - 3 && z < focusZ + 2.2
      const it = runnerDraw(r, z, t, overlap ? 0.5 : 1)
      if (r !== followed && focusZ !== null && z < focusZ && z > focusZ - 3) it.z = focusZ + 0.05
      items.push(it)
    }
    if (me) {
      const z = Z(S.d)
      if (z > 1.2) items.push(runnerDraw(me, z, t))
    }
    items.sort((a, b) => b.z - a.z)
    for (const it of items) it.draw()
  }

  // ---------- name tags ----------
  type Box = { x0: number; y0: number; x1: number; y1: number }
  const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
  /** name tags for others at once (besides you, or whoever you're watching); the strip on the right lists everyone */
  const MAX_TAGS = 3
  const TAG_FAR = 38
  const tagFont = (fs: number) => `${fs}px 'Burbank Display', 'Lilita One', sans-serif`
  /**
   * Tags sit over heads and get smaller and fainter with distance. Yours (or the one you're watching) goes first and
   * never moves; a tag that would cover it, your runner, or another tag slides sideways or up one step, and if there's
   * still no room it isn't drawn (the nearest few win). Nothing ever stacks into a tower.
   */
  function tags(t: number) {
    const watching = !me || S.out || S.finished
    const followed = !watching ? me : runners[watch]
    const now = performance.now()
    const blocks: Box[] = []
    type Tag = { r: Runner; x: number; y: number; w: number; h: number; fs: number; alpha: number; label: string; hx: number; hy: number; moved: boolean; main: boolean }
    const out: Tag[] = []
    const place = (r: Runner, main: boolean) => {
      const isMe = r === me
      const z = Z(isMe ? S.d : r.d)
      if (z < 3 || z > TAG_FAR) return false
      const X = laneX(isMe ? S.x : r.x)
      const air = heightOf(r, t)
      const k = F / z
      const hx = SX(X, z)
      const low = isMe ? sliding(t) : !!(r.flags & GF.slide)
      const hy = SY(air + (low ? 1.05 : 1.62), z)
      const fs = main ? 13 : Math.round(Math.max(10, Math.min(12.5, 12.5 - (z - 8) * 0.12)))
      const alpha = main ? 1 : Math.max(0, Math.min(1, (TAG_FAR - z) / 14))
      if (alpha < 0.12) return false
      const label = isMe ? 'You' : r.name
      g.font = tagFont(fs)
      const w = Math.ceil(g.measureText(label).width) + fs + 18
      const h = fs + 8
      const cy = hy - 7 - h / 2
      const tries: [number, number][] = main ? [[0, 0]] : [[0, 0], [-w * 0.6, 0], [w * 0.6, 0], [0, -(h + 3)], [-w * 0.6, -(h + 3)], [w * 0.6, -(h + 3)]]
      for (const [ox, oy] of tries) {
        const x = hx + ox
        const y = cy + oy
        const box = { x0: x - w / 2 - 2, y0: y - h / 2 - 2, x1: x + w / 2 + 2, y1: y + h / 2 + 2 }
        if (box.x0 < 4 || box.x1 > 996 || box.y0 < 50) continue
        if (blocks.some((b) => overlaps(b, box))) continue
        blocks.push(box)
        out.push({ r, x, y, w, h, fs, alpha, label, hx, hy, moved: ox !== 0 || oy !== 0, main })
        if (main) {
          // the runner under the main tag stays clear too
          blocks.push({ x0: hx - 0.4 * k, y0: hy, x1: hx + 0.4 * k, y1: SY(0, z) })
        }
        return true
      }
      return false
    }
    if (followed && !followed.out) place(followed, true)
    const others = runners
      .filter((r) => r !== followed && r !== me && !r.out)
      .map((r) => ({ r, z: Z(r.d), react: !!(r.react && r.react.until > now) }))
      .filter((o) => o.z >= 3 && o.z <= TAG_FAR)
      .sort((a, b) => Number(b.react) - Number(a.react) || a.z - b.z)
    let n = 0
    for (const o of others) {
      if (n >= MAX_TAGS) break
      if (place(o.r, false)) n++
    }
    // draw far to near, so the nearest tag is on top if two still touch at the edges
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    for (const tg of out.reverse()) {
      const { r, x, y, w, h, fs, alpha, label } = tg
      const isMe = r === me
      g.globalAlpha = alpha
      g.strokeStyle = '#1d2140'
      if (tg.moved) {
        // a tag that had to step aside keeps a thin line to its runner
        g.lineWidth = 1.5
        g.beginPath()
        g.moveTo(x, y + h / 2)
        g.lineTo(tg.hx, tg.hy - 3)
        g.stroke()
      }
      g.fillStyle = isMe ? '#ffd166' : '#ffffff'
      g.lineWidth = tg.main ? 2.5 : 1.5
      g.beginPath()
      g.roundRect(x - w / 2, y - h / 2, w, h, h / 2)
      g.fill()
      g.stroke()
      if (!tg.moved) {
        // a little pointer down to the head
        g.beginPath()
        g.moveTo(x - 4, y + h / 2 - 0.5)
        g.lineTo(x, y + h / 2 + 4)
        g.lineTo(x + 4, y + h / 2 - 0.5)
        g.fill()
        g.lineWidth = 1.5
        g.stroke()
        g.fillRect(x - 3.5, y + h / 2 - 2.5, 7, 2.5)
      }
      const dotR = fs * 0.42
      g.fillStyle = r.color
      g.lineWidth = 1.5
      g.beginPath()
      g.arc(x - w / 2 + 5 + dotR, y, dotR, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      g.fillStyle = '#1d2140'
      g.font = tagFont(fs)
      g.fillText(label, x + dotR + 1, y + 1)
      if (r.react && r.react.until > now) {
        g.font = tagFont(15)
        const rw = g.measureText(r.react.text).width + 18
        const ry = y - h / 2 - 16
        g.fillStyle = '#ffffff'
        g.lineWidth = isMe ? 2.5 : 1.5
        g.beginPath()
        g.roundRect(x - rw / 2, ry - 12, rw, 24, 10)
        g.fill()
        g.stroke()
        g.fillStyle = '#1d2140'
        g.fillText(r.react.text, x, ry + 1)
      }
      g.globalAlpha = 1
    }
    g.textBaseline = 'alphabetic'
  }

  // ---------- HUD ----------
  let lastPlaceTxt = ''
  let rankAt = 0
  const distOf = (r: Runner) => (r === me ? S.d : r.out ? r.outD : r.d)
  /** the standings list: up to six rows, always including you (or whoever you're watching), gaps in metres */
  function standings(order: Runner[], f: Runner) {
    let rows = order.slice(0, 6)
    if (!rows.includes(f)) rows = [...order.slice(0, 5), f]
    const fd = distOf(f)
    const html = rows
      .map((r) => {
        const out = r === me ? S.out : r.out
        const gap = Math.round(distOf(r) - fd)
        const right = r.done ? 'Finished' : out ? 'Out' : r === f ? `${Math.round(fd)} m` : `${gap > 0 ? '+' : gap < 0 ? '−' : ''}${Math.abs(gap)} m`
        const cls = [r === me ? 'you' : '', r === f ? 'focus' : '', out ? 'out' : ''].filter(Boolean).join(' ')
        return `<li class="${cls}"><b>${order.indexOf(r) + 1}</b><i style="background:${r.color}"></i><span>${r === me ? 'You' : esc(r.name)}</span><small>${right}</small></li>`
      })
      .join('')
    if (rank.dataset.html !== html) {
      rank.dataset.html = html
      rank.innerHTML = html
    }
  }
  function hudTick(t: number) {
    const order = [...runners].sort((a, b) => Number(b.done) - Number(a.done) || (b.out ? b.outD : b.d) - (a.out ? a.outD : a.d))
    const focus = me && !S.out && !S.finished ? me : runners[watch]
    const f = focus ?? me
    if (f) {
      const pl = ordinal(order.indexOf(f) + 1)
      const txt = `${pl}|${f === me ? `of ${runners.length}` : esc(f.name)}|${Math.round(f === me ? S.d : f.d)} m`
      if (txt !== lastPlaceTxt) {
        lastPlaceTxt = txt
        const [a, b, c] = txt.split('|')
        place.querySelector('b')!.textContent = a
        place.querySelector('span')!.textContent = b
        place.querySelector('small')!.textContent = c
      }
    }
    if (f && performance.now() - rankAt > 200) {
      rankAt = performance.now()
      standings(order, f)
    }
    runners.forEach((r, k) => {
      const d = r === me ? S.d : r.out ? r.outD : r.d
      bullets[k].style.left = `${Math.max(0, Math.min(1, d / RUN.length)) * 100}%`
      bullets[k].classList.toggle('out', r === me ? S.out : r.out)
    })
    cardsEl.querySelector('b')!.textContent = String(S.cards)
    // power-ups running out
    const pw: string[] = []
    if (t < S.expressUntil) pw.push(`<span class="rn-pw"><img src="${IMG.express}" alt=""><i style="width:${((S.expressUntil - t) / RUN.expressS) * 100}%"></i></span>`)
    if (t < S.catUntil) pw.push(`<span class="rn-pw"><img src="${IMG.cat}" alt=""><i style="width:${((S.catUntil - t) / RUN.catS) * 100}%"></i></span>`)
    if (S.draft && !S.out) pw.push('<span class="rn-pw text">Slipstream</span>')
    const html = pw.join('')
    if (power.dataset.html !== html) {
      power.dataset.html = html
      power.innerHTML = html
    }
    // watching (out, finished, or never in it): who you follow, and the Showtime dancers you can send
    const watching = !me || S.out || S.finished
    const target = runners[watch]
    const anyRunning = runners.some((r) => r !== me && !r.out && !r.done)
    watchBar.hidden = !watching || !anyRunning
    // the run's controls mean nothing once you're out: the watch bar (← → and the dancers) takes over
    hint.hidden = watching
    if (!watchBar.hidden && target) {
      const canDrop = me && S.drops > 0 && target !== me && !target.out && !target.done
      const html2 = `<span>Watching <b>${esc(target.name)}</b> <span class="mp-hint-k"><kbd>←</kbd><kbd>→</kbd></span></span>${
        canDrop ? `<span class="rn-drop">Send Showtime (${S.drops} left): <button class="btn tiny" data-l="0">Lane 1<kbd>1</kbd></button><button class="btn tiny" data-l="1">Lane 2<kbd>2</kbd></button><button class="btn tiny" data-l="2">Lane 3<kbd>3</kbd></button></span>` : ''
      }`
      if (watchBar.dataset.html !== html2) {
        watchBar.dataset.html = html2
        watchBar.innerHTML = html2
        watchBar.querySelectorAll<HTMLButtonElement>('button[data-l]').forEach((b) => (b.onclick = () => sendDancer(Number(b.dataset.l))))
      }
    }
  }

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
      line(`Next stop: <b>${STATIONS[1]}</b>`)
    }
  }

  // ---------- the loop ----------
  let raf = 0
  let last = performance.now()
  let leaderCheck = 0
  function frame(now: number) {
    raf = requestAnimationFrame(frame)
    // one clock per frame: the frame's own timestamp drives your run, the others' playback and the camera alike
    // (mixing it with a fresh performance.now() made everyone else wobble by a centimetre or two every frame)
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000))
    last = now
    const t = (now - t0) / 1000
    countdown(t)
    step(dt, t)
    ghosts(t, dt)
    // the camera: you while you run; afterwards whoever's leading (or whoever you picked)
    const watching = !me || S.out || S.finished
    if (watching && now - leaderCheck > 900) {
      leaderCheck = now
      const target = runners[watch]
      const running = runners.filter((r) => r !== me && !r.out && !r.done)
      if ((!watchPicked || !target || target.out || target.done || target === me) && running.length) watch = running.sort((a, b) => b.d - a.d)[0].i
    }
    const focusD = !watching && me ? S.d : runners[watch] && runners[watch] !== me ? runners[watch].d : S.d
    const focusX = !watching && me ? S.x : runners[watch] ? runners[watch].x : 1
    const tx = laneX(focusX) * 0.55
    cam.d += (focusD - CAM_BACK - cam.d) * (watching ? Math.min(1, dt * 5) : 1)
    cam.x += (tx - cam.x) * Math.min(1, dt * 6)
    loop.set(me && !S.out && !S.finished && t >= 0 && airY(t) < 0.1 ? 0.45 + Math.min(0.5, runSpeed(t) / 40) : 0)
    fit()
    g.save()
    if (shake > 0) {
      shake -= dt
      g.translate((Math.random() - 0.5) * 22 * shake, (Math.random() - 0.5) * 22 * shake)
    }
    platform()
    scene(t)
    tags(t)
    g.restore()
    hudTick(t)
  }
  raf = requestAnimationFrame(frame)

  // ---------- server events ----------
  function onGhosts(e: Extract<MpS2C, { k: 'gh' }>) {
    const tl = raceT() * 1000
    const off = e.tm - tl
    offset = offsetSet ? offset + (off - offset) * 0.1 : off
    offsetSet = true
    for (const [i, d, x, v, f] of e.p as GhostWire[]) {
      const r = runners[i]
      if (!r) continue
      // (an update that arrives out of order, or twice, is dropped: the playback needs times that only go up)
      const prev = r.snaps[r.snaps.length - 1]
      if (prev && e.tm <= prev.tm) continue
      r.snaps.push({ tm: e.tm, d, g: d - runDistance(Math.max(0, e.tm) / 1000), x, v, f })
      if (r.snaps.length > 16) r.snaps.shift()
      if (r !== me && r.snaps.length === 1) {
        r.d = d
        r.x = x
        r.gs = r.snaps[0].g
      }
    }
  }
  function onEvent(ev: RaceEvent) {
    switch (ev.k) {
      case 'out': {
        const r = runners[ev.i]
        if (!r || r === me) return
        r.out = true
        r.outD = ev.d
        line(`<b>${esc(r.name)}</b> is out at ${ev.d} m`)
        return
      }
      case 'fin': {
        const r = runners[ev.i]
        if (!r) return
        r.done = true
        line(r === me ? `You reached South Ferry, ${ordinal(ev.place)}!` : `<b>${esc(r.name)}</b> made it to South Ferry!`, true)
        return
      }
      case 'left': {
        const r = runners[ev.i]
        if (r && r !== me) {
          r.out = true
          r.outD = r.d
        }
        return
      }
      case 'drop': {
        const to = runners[ev.to]
        const from = runners[ev.from]
        if (!to) return
        // keep it clear of a row of obstacles, so there's always a way through
        let d = ev.d
        for (const o of course.obstacles) if (Math.abs(o.d - d) < 6) d = o.d + 7
        dancers.push({ d, lane: ev.lane, to: ev.to, from: from?.name ?? 'Someone', pic: dancerPics[dancers.length % 3] })
        if (to === me && !S.out) {
          msfx.horn()
          bigText('SHOWTIME!', true)
          line(`<b>${esc(from?.name ?? 'Someone')}</b> sent a Showtime dancer into lane ${ev.lane + 1}: switch lanes or slide under`, true)
        } else line(`<b>${esc(from?.name ?? 'Someone')}</b> sent Showtime at <b>${esc(to.name)}</b>`)
        return
      }
      case 'end':
        line(`${Math.round(ev.ms / 1000)} seconds left on the line!`, true)
        return
    }
  }

  return {
    id: m.id,
    event(e) {
      if (e.k === 'gh') onGhosts(e)
      else if (e.k === 'ev') onEvent(e.e)
      else if (e.k === 'start') t0 = performance.now() + e.m.startIn
    },
    react(id, html) {
      const r = runners.find((x) => x.id === id)
      if (r) r.react = { text: html.replace(/<[^>]+>/g, '').trim() || '👏', until: performance.now() + 2200 }
    },
    finish(r: ResultsWire) {
      void r
      return me && (S.out || S.finished) && raceT() - S.endT < 2 ? 2000 : 1100
    },
    destroy() {
      cancelAnimationFrame(raf)
      loop.stop()
      window.removeEventListener('keydown', keydown, true)
    },
  }
}
