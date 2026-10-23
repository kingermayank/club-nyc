/**
 * The Pilgrim Hill Sled Race, in the browser.
 *
 * A Club Penguin Sled Racing homage seen from above: the hill runs diagonally down to the bottom right, 2-4 New
 * Yorkers on inner tubes, ↑ / ↓ (or → / ←) to steer across the slope, Space to hop over the small stuff. Your own
 * sled is simulated here with the shared rules (shared/sled.ts) and reported ~10 times a second; everyone else is
 * drawn from the server's ghosts, smoothed. Crashes cost time, never the race.
 */
import { el } from '../../engine/stage'
import { headPortrait } from '../../avatar/render'
import { randomLook } from '../../avatar/random'
import type { Look } from '../../avatar/look'
import { sfx } from '../../audio'
import { SLED, sledCourse, sledHits, cartV, inDeepSnow, SEGMENT_NAMES, type SledCourse, type SledObj, type SledDecor } from '../shared/sled'
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
/** where the camera's point on the hill sits on screen */
const AX = 320
const AY = 290
export const SLOT_COLORS = ['#e5483b', '#2a7bd5', '#3cb371', '#f2c12e', '#8a5bd6', '#f08a24', '#ff6fb5', '#18b5b5', '#7a4a22']

const ART = '/art/mp/'
const IMG = {
  pine: ART + 'sled-pine.png',
  pine2: ART + 'sled-pine2.png',
  rock: ART + 'sled-rock.png',
  boulder: ART + 'sled-boulder.png',
  snowman: ART + 'sled-snowman.png',
  cart: ART + 'sled-cart.png',
  cocoa: ART + 'sled-cocoa-cup.png',
  lamp: ART + 'sled-lamp.png',
  bench: ART + 'sled-bench.png',
}
type ImgKey = keyof typeof IMG

const SEG_TIPS: Record<string, string> = {
  scatter: 'Hop the small rocks, steer round the big ones',
  logs: 'Aim for the gap in the log',
  slalom: 'Weave left and right',
  moguls: 'Hop the bumps or weave between them',
  ice: 'Ice is free speed',
  cart: 'Sal’s cart got loose. Time it.',
  ramp: 'Ramp ahead: enjoy the air',
  pines: 'Go around the pines',
  snowmen: 'Find the gap (or meet a snowman)',
  narrows: 'Deep snow on both sides: stay in the middle',
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
  trail: { w: number; v: number }[]
  lastTrailW: number
  spin: number
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
    trail: [],
    lastTrailW: -999,
    spin: 0,
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
  // the crowd at the bottom of the hill
  const crowd: AvatarPic[] = []
  const cr = seeded(m.seed ^ 0xc40d)
  for (let k = 0; k < 6; k++) void avatarPic(randomLook(0.7, cr), { pose: k % 2 ? 'cheer' : 'wave', t: 0.2 + k * 0.13, k: 1.5 }).then((p) => (crowd[k] = p))

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
  const hint = el('div', 'mp-hint', `<span><kbd>↑</kbd><kbd>↓</kbd> steer</span><span><kbd>Space</kbd> hop</span><span class="sl-hint-sub">Cocoa = speed</span>`)
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
    honked: new Set<number>(),
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
  const puff = (w: number, v: number, n: number, spread = 60, c = '#ffffff') => {
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
    const crashed = t < S.crashUntil
    // speed: the hill pulls you to cruising speed; cocoa, ice, slipstream and a tailwind push past it
    let target = SLED.vCruise
    if (t < S.boostUntil) target *= SLED.cocoaMult
    const onIce = course.objs.some((o) => o.k === 'ice' && Math.abs(o.w - S.w) < o.r && Math.abs(o.v - S.v) < 46)
    if (onIce && S.air < 1) target *= SLED.iceMult
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
          line(`<img class="ji" src="/art/mp/cocoa.png" alt=""> Cocoa boost!`)
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
          puff(h.o.w, h.o.v, 22, 160)
          line('Sorry, snowman!')
          break
        case 'crash':
          if (t < S.crashUntil) break
          S.crashUntil = t + SLED.crashS
          S.crashes++
          S.vLat = 0
          msfx.crash()
          puff(S.w, S.v, 18, 140)
          shake = 0.3
          line(h.o.k === 'cart' ? 'Hot dog cart! Wipeout!' : h.o.k === 'log' ? 'Log! Wipeout!' : 'Wipeout!')
          break
      }
    }
    // the cart honks when it's close
    for (const o of course.objs) {
      if (o.k !== 'cart' || S.honked.has(o.id)) continue
      if (o.w - S.w < 420 && o.w > S.w) {
        S.honked.add(o.id)
        sfx.honk()
      }
    }
    // a new stretch of hill: say what it is
    const seg = course.segs.find((s) => S.w >= s.w0 - 220 && S.w < s.w1 - 220)
    if (seg && seg.k !== S.seg) {
      S.seg = seg.k
      if (SEG_TIPS[seg.k]) line(`<b>${SEGMENT_NAMES[seg.k]}</b> · ${SEG_TIPS[seg.k]}`)
    }
    // snow spray when carving
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
  /** after the line you coast to a stop at the bottom */
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

  function drawImg(key: ImgKey, x: number, y: number, h: number, o: { flip?: boolean; alpha?: number } = {}) {
    const img = imgs[key]
    if (!img?.naturalWidth) return
    const w = (img.naturalWidth / img.naturalHeight) * h
    g.save()
    if (o.alpha !== undefined) g.globalAlpha = o.alpha
    g.translate(x, y)
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

  function ground(t: number) {
    // deep snow everywhere, groomed snow on the course
    g.fillStyle = '#dfe9f7'
    g.fillRect(0, 0, 1000, 565)
    const w0 = cam.w - 700
    const w1 = cam.w + 1400
    const W = SLED.halfW
    poly([P(w0, -W - 8), P(w1, -W - 8), P(w1, W + 8), P(w0, W + 8)], '#f8fbff')
    // the course's soft blue edges
    g.strokeStyle = 'rgba(120, 160, 215, 0.55)'
    g.lineWidth = 6
    for (const s of [-1, 1]) {
      const [ax, ay] = P(w0, s * (W + 8))
      const [bx, by] = P(w1, s * (W + 8))
      g.beginPath()
      g.moveTo(ax, ay)
      g.lineTo(bx, by)
      g.stroke()
    }
    // the narrows: banks of deep snow
    for (const o of course.objs) {
      if (o.k !== 'bank' || o.w > w1 || o.w + (o.len ?? 0) < w0) continue
      const s = o.side ?? 1
      poly([P(o.w, s * o.v), P(o.w + (o.len ?? 0), s * o.v), P(o.w + (o.len ?? 0), s * (W + 12)), P(o.w, s * (W + 12))], '#dde8f6', 'rgba(120,160,215,.6)', 3)
      for (let k = 0; k < 12; k++) {
        const [x, y] = P(o.w + ((k + 0.5) * (o.len ?? 0)) / 12, s * (o.v + 30 + (k % 3) * 22))
        g.fillStyle = '#ffffff'
        g.beginPath()
        g.ellipse(x, y, 16, 7, 0, 0, Math.PI * 2)
        g.fill()
      }
    }
    // texture: sparkles and soft ridges, fixed to the hill
    const cw0 = Math.floor((cam.w - 520) / 90)
    const cw1 = Math.ceil((cam.w + 1100) / 90)
    for (let cw = cw0; cw <= cw1; cw++) {
      for (let cv = -9; cv <= 9; cv++) {
        const h = hash(cw, cv)
        if (h > 0.55) continue
        const w = cw * 90 + hash(cv, cw) * 90
        const v = cv * 70 + hash(cw + 7, cv - 3) * 70
        const [x, y] = P(w, v)
        if (!onScreen(x, y, 20)) continue
        if (h < 0.18) {
          g.fillStyle = 'rgba(255,255,255,0.95)'
          g.beginPath()
          g.arc(x, y, 1.6, 0, Math.PI * 2)
          g.fill()
          g.fillStyle = 'rgba(150,185,230,0.5)'
          g.fillRect(x - 0.8, y + 1.5, 1.6, 1.2)
        } else {
          g.strokeStyle = 'rgba(150, 185, 228, 0.45)'
          g.lineWidth = 2
          g.beginPath()
          g.arc(x, y, 10 + h * 14, Math.PI * 1.15, Math.PI * 1.85)
          g.stroke()
        }
      }
    }
    // the start and finish lines
    for (const lw of [0, SLED.length]) {
      if (lw < w0 || lw > w1) continue
      const n = 12
      for (let k = 0; k < n; k++) {
        const va = -W + (2 * W * k) / n
        const vb = -W + (2 * W * (k + 1)) / n
        poly([P(lw - 8, va), P(lw - 8, vb), P(lw + 8, vb), P(lw + 8, va)], k % 2 ? '#1d2140' : lw ? '#ffffff' : '#e5483b')
      }
    }
    // ice
    for (const o of course.objs) {
      if (o.k !== 'ice' || o.w < w0 || o.w > w1) continue
      const [x, y] = P(o.w, o.v)
      g.save()
      g.translate(x, y)
      g.rotate(TH)
      g.fillStyle = 'rgba(150, 215, 245, 0.85)'
      g.strokeStyle = 'rgba(70, 140, 205, 0.8)'
      g.lineWidth = 3
      g.beginPath()
      g.ellipse(0, 0, o.r, 46, 0, 0, Math.PI * 2)
      g.fill()
      g.stroke()
      g.strokeStyle = 'rgba(255,255,255,0.85)'
      g.lineWidth = 3
      g.lineCap = 'round'
      for (const [a, b] of [[-0.5, -12], [0.1, 6], [0.45, -4]]) {
        g.beginPath()
        g.moveTo(o.r * a - 20, b)
        g.lineTo(o.r * a + 20, b - 4)
        g.stroke()
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
          g.strokeStyle = 'rgba(229, 72, 59, 0.55)'
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
    // sled tracks
    g.lineCap = 'round'
    for (const r of racers) {
      if (r.trail.length < 2) continue
      for (const off of [-8, 8]) {
        g.strokeStyle = 'rgba(140, 175, 225, 0.42)'
        g.lineWidth = 2.5
        g.beginPath()
        r.trail.forEach((p, k) => {
          const [x, y] = P(p.w, p.v + off)
          if (k) g.lineTo(x, y)
          else g.moveTo(x, y)
        })
        const [x, y] = P(r.w, r.v + off)
        g.lineTo(x, y)
        g.stroke()
      }
    }
    // bumps (low, part of the ground)
    for (const o of course.objs) {
      if (o.k !== 'bump' || o.w < w0 || o.w > w1) continue
      const [x, y] = P(o.w, o.v)
      // a mound of snow: a blue shadow on its downhill side, a bright top
      g.fillStyle = 'rgba(110, 150, 210, 0.5)'
      g.beginPath()
      g.ellipse(x + 6, y + 5, o.r * 1.2, o.r * 0.6, TH, 0, Math.PI * 2)
      g.fill()
      const mound = g.createRadialGradient(x - o.r * 0.3, y - o.r * 0.55, 2, x, y - 2, o.r * 1.2)
      mound.addColorStop(0, '#ffffff')
      mound.addColorStop(0.7, '#eef4fc')
      mound.addColorStop(1, '#c9dcf2')
      g.fillStyle = mound
      g.strokeStyle = 'rgba(29,33,64,0.45)'
      g.lineWidth = 2
      g.beginPath()
      g.ellipse(x, y - 4, o.r * 1.05, o.r * 0.62, TH, Math.PI * 0.98, Math.PI * 2.02)
      g.fill()
      g.stroke()
    }
    // shadows
    for (const r of racers) {
      if (r.out) continue
      const [x, y] = P(r.w, r.v)
      g.fillStyle = 'rgba(29, 33, 64, 0.2)'
      g.beginPath()
      g.ellipse(x, y + 2, 30 - Math.min(14, r.air * 0.2), 12 - Math.min(5, r.air * 0.08), 0, 0, Math.PI * 2)
      g.fill()
    }
    void t
  }

  type Item = { y: number; draw: () => void }
  function logPieces(o: SledObj, items: Item[]) {
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
        const cy = (y0 + y1) / 2
        items.push({
          y: cy,
          draw: () => {
            const H = 22
            const ov = 0.6
            const dx = (x1 - x0) * ov * 0.05
            const dy = (y1 - y0) * ov * 0.05
            poly([[x0 - dx, y0 - dy], [x1 + dx, y1 + dy], [x1 + dx, y1 + dy - H], [x0 - dx, y0 - dy - H]], '#8a5a2b')
            g.strokeStyle = '#1d2140'
            g.lineWidth = 3
            g.beginPath()
            g.moveTo(x0, y0)
            g.lineTo(x1, y1)
            g.moveTo(x0, y0 - H)
            g.lineTo(x1, y1 - H)
            g.stroke()
            g.strokeStyle = 'rgba(60, 35, 15, 0.6)'
            g.lineWidth = 2
            g.beginPath()
            g.moveTo(x0 + (x1 - x0) * 0.2, y0 + (y1 - y0) * 0.2 - H * 0.55)
            g.lineTo(x0 + (x1 - x0) * 0.75, y0 + (y1 - y0) * 0.75 - H * 0.45)
            g.stroke()
            // snow along the top
            g.strokeStyle = '#ffffff'
            g.lineWidth = 6
            g.lineCap = 'round'
            g.beginPath()
            g.moveTo(x0, y0 - H + 2)
            g.lineTo(x1, y1 - H + 2)
            g.stroke()
            // a cut end at the gap
            const ends: number[] = []
            if (Math.abs(a - (o.g1 ?? 1e9)) < 0.5) ends.push(0)
            if (Math.abs(b - (o.g0 ?? -1e9)) < 0.5) ends.push(1)
            for (const e of ends) {
              const [ex, ey] = e ? [x1, y1] : [x0, y0]
              g.fillStyle = '#e8c08a'
              g.strokeStyle = '#1d2140'
              g.lineWidth = 3
              g.beginPath()
              g.ellipse(ex, ey - H / 2, 7, H / 2 + 1, 0, 0, Math.PI * 2)
              g.fill()
              g.stroke()
              g.strokeStyle = 'rgba(138, 90, 43, 0.8)'
              g.lineWidth = 1.5
              g.beginPath()
              g.ellipse(ex, ey - H / 2, 3.5, H / 4, 0, 0, Math.PI * 2)
              g.stroke()
            }
          },
        })
      }
    }
  }
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
          // the slope up, the lip, and the drop face
          poly([[bx0, by0], [bx1, by1], [lx1, ly1 - H], [lx0, ly0 - H]], '#ffffff')
          poly([[lx0, ly0 - H], [lx1, ly1 - H], [lx1, ly1], [lx0, ly0]], '#a8743f')
          g.strokeStyle = '#1d2140'
          g.lineWidth = 3
          g.beginPath()
          g.moveTo(lx0, ly0 - H)
          g.lineTo(lx1, ly1 - H)
          g.moveTo(lx0, ly0)
          g.lineTo(lx1, ly1)
          g.stroke()
          g.strokeStyle = 'rgba(70, 40, 15, 0.5)'
          g.lineWidth = 1.5
          g.beginPath()
          g.moveTo(lx0, ly0 - H / 2)
          g.lineTo(lx1, ly1 - H / 2)
          g.stroke()
        },
      })
    }
  }

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
        g.save()
        g.translate(x, y)
        if (r.spin) g.rotate(Math.sin(r.spin) * 0.6)
        // the tube: back half, the rider, front half
        const tube = (front: boolean) => {
          g.beginPath()
          g.ellipse(0, -6, 30, 13, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2)
          g.lineWidth = 11
          g.strokeStyle = '#1d2140'
          g.stroke()
          g.lineWidth = 7
          g.strokeStyle = r.color
          g.stroke()
          if (front) {
            g.lineWidth = 2.5
            g.strokeStyle = 'rgba(255,255,255,0.65)'
            g.beginPath()
            g.ellipse(0, -8, 26, 10, 0, Math.PI * 0.15, Math.PI * 0.55)
            g.stroke()
          }
        }
        tube(false)
        const pic = r.done && r.pics.cheer && r !== me ? r.pics.cheer : crashed ? r.pics.oops : r.flags & (GF.boost | GF.air) ? r.pics.grin : r.pics.sit
        // sitting in the ring: the tube's front half hides the legs
        if (pic) drawAvatar(g, pic, 0, 9, 0.5)
        tube(true)
        if (crashed) {
          // stars
          for (let k = 0; k < 3; k++) {
            const a = t * 6 + (k * Math.PI * 2) / 3
            g.fillStyle = '#ffd166'
            g.strokeStyle = '#1d2140'
            g.lineWidth = 1.5
            star(Math.cos(a) * 22, -78 + Math.sin(a) * 6, 6)
          }
        }
        if (r.flags & GF.boost) {
          g.strokeStyle = 'rgba(255, 190, 70, 0.8)'
          g.lineWidth = 3
          g.lineCap = 'round'
          for (let k = 0; k < 3; k++) {
            const o = (k - 1) * 9
            g.beginPath()
            g.moveTo(-CA * 40 + SA * o, -SA * 40 - CA * o - 8)
            g.lineTo(-CA * 70 + SA * o, -SA * 70 - CA * o - 8)
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

  function decorItem(d: SledDecor): Item | null {
    const [x, y] = P(d.w, d.v)
    if (!onScreen(x, y, 200)) return null
    const s = 0.82 + (d.var % 4) * 0.1
    return {
      y,
      draw: () => {
        if (d.k === 'pine') drawImg(d.var % 2 ? 'pine2' : 'pine', x, y, 118 * s, { flip: d.var > 1 })
        else if (d.k === 'lamp') drawImg('lamp', x, y, 112)
        else if (d.k === 'bench') drawImg('bench', x, y, 58, { flip: d.v > 0 })
        else if (d.k === 'rock') drawImg('rock', x, y, 34 * s)
        else if (d.k === 'crowd') {
          const pic = crowd[d.var]
          if (pic) drawAvatar(g, pic, x, y, 0.42 + Math.sin(performance.now() / 300 + d.var) * 0.004)
        } else if (d.k === 'stand') {
          drawImg('cart', x, y, 92)
        } else if (d.k === 'sign') signPost(x, y)
        else if (d.k === 'statue') statue(x, y)
      },
    }
  }
  function signPost(x: number, y: number) {
    g.fillStyle = '#9a6435'
    g.strokeStyle = '#1d2140'
    g.lineWidth = 3
    g.fillRect(x - 5, y - 70, 10, 70)
    g.strokeRect(x - 5, y - 70, 10, 70)
    g.fillStyle = '#c98a4b'
    g.beginPath()
    g.roundRect(x - 58, y - 92, 116, 30, 6)
    g.fill()
    g.stroke()
    g.fillStyle = '#3b2210'
    g.font = "15px 'Burbank Display', 'Lilita One', sans-serif"
    g.textAlign = 'center'
    g.fillText('PILGRIM HILL', x, y - 71)
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.ellipse(x - 20, y - 92, 36, 6, 0, Math.PI, Math.PI * 2)
    g.fill()
  }
  function statue(x: number, y: number) {
    // the Pilgrim on his pedestal (bronze, tall hat), at the top of the hill since 1885
    poly([[x - 34, y], [x + 34, y], [x + 28, y - 42], [x - 28, y - 42]], '#9aa3b5', '#1d2140', 3)
    poly([[x - 38, y - 42], [x + 38, y - 42], [x + 38, y - 50], [x - 38, y - 50]], '#b8c0cf', '#1d2140', 3)
    poly([[x - 16, y - 50], [x + 16, y - 50], [x + 12, y - 104], [x - 12, y - 104]], '#8a5a2b', '#1d2140', 3)
    g.fillStyle = '#c99a5b'
    g.beginPath()
    g.arc(x, y - 114, 11, 0, Math.PI * 2)
    g.fill()
    g.stroke()
    poly([[x - 9, y - 120], [x + 9, y - 120], [x + 7, y - 142], [x - 7, y - 142]], '#5a3a1c', '#1d2140', 3)
    poly([[x - 16, y - 120], [x + 16, y - 120], [x + 16, y - 124], [x - 16, y - 124]], '#5a3a1c', '#1d2140', 2.5)
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.ellipse(x, y - 50, 40, 6, 0, Math.PI, Math.PI * 2)
    g.fill()
  }
  function finishArch(items: Item[]) {
    const L = SLED.length
    const W = SLED.halfW + 30
    const [ax, ay] = P(L, -W)
    const [bx, by] = P(L, W)
    if (!onScreen(ax, ay, 300) && !onScreen(bx, by, 300)) return
    const H = 120
    items.push({
      y: Math.max(ay, by) + 4,
      draw: () => {
        g.lineWidth = 5
        g.strokeStyle = '#1d2140'
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
          g.strokeStyle = '#1d2140'
        }
        poly([[ax, ay - H], [bx, by - H], [bx, by - H + 34], [ax, ay - H + 34]], '#e5483b', '#1d2140', 4)
        g.save()
        g.translate((ax + bx) / 2, (ay + by) / 2 - H + 23)
        g.rotate(Math.atan2(by - ay, bx - ax))
        g.fillStyle = '#ffffff'
        g.font = "24px 'Burbank Display', 'Lilita One', sans-serif"
        g.textAlign = 'center'
        g.fillText('FINISH', 0, 0)
        g.restore()
      },
    })
  }

  function sprites(t: number) {
    const items: Item[] = []
    const w0 = cam.w - 520
    const w1 = cam.w + 1150
    for (const o of course.objs) {
      if (o.w < w0 - 40 || o.w > w1) continue
      if (o.k === 'bump' || o.k === 'ice' || o.k === 'bank') continue
      if (o.k === 'log') {
        logPieces(o, items)
        continue
      }
      if (o.k === 'ramp') {
        rampPieces(o, items)
        continue
      }
      const v = o.k === 'cart' ? cartV(o, t) : o.v
      const [x, y] = P(o.w, v)
      if (!onScreen(x, y)) continue
      if (o.k === 'cocoa' && me && S.used.has(o.id)) continue
      items.push({
        y,
        draw: () => {
          switch (o.k) {
            case 'rock':
              drawImg('rock', x, y + 4, 36)
              break
            case 'boulder':
              drawImg('boulder', x, y + 6, 70)
              break
            case 'pine':
              drawImg(o.var % 2 ? 'pine2' : 'pine', x, y + 4, 122)
              break
            case 'snowman':
              drawImg('snowman', x, y + 4, 76)
              break
            case 'cart':
              drawImg('cart', x, y + 6, 96, { flip: Math.cos(((t / (o.per ?? 4)) + (o.ph ?? 0)) * Math.PI * 2) < 0 })
              break
            case 'cocoa': {
              const lift = o.var === 9 ? 46 : 0
              const bob = Math.sin(t * 4 + o.id) * 3
              g.fillStyle = 'rgba(255, 214, 102, 0.35)'
              g.beginPath()
              g.ellipse(x, y - lift - 18 + bob, 20, 20, 0, 0, Math.PI * 2)
              g.fill()
              drawImg('cocoa', x, y - lift + bob, 40)
              break
            }
            case 'flag': {
              g.strokeStyle = '#1d2140'
              g.lineWidth = 3
              g.beginPath()
              g.moveTo(x, y)
              g.lineTo(x, y - 44)
              g.stroke()
              poly([[x, y - 44], [x + 20, y - 38], [x, y - 31]], o.var ? '#2a7bd5' : '#e5483b', '#1d2140', 2.5)
              break
            }
          }
        },
      })
    }
    for (const d of course.decor) {
      if (d.w < w0 - 200 || d.w > w1) continue
      const it = decorItem(d)
      if (it) items.push(it)
    }
    for (const r of racers) {
      const it = racerItem(r, t)
      if (it) items.push(it)
    }
    finishArch(items)
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
      g.strokeStyle = 'rgba(120,160,215,0.7)'
      g.lineWidth = 1
      g.beginPath()
      g.arc(x, y - p.h, p.r, 0, Math.PI * 2)
      g.fill()
      g.stroke()
    }
    g.globalAlpha = 1
  }

  function tags() {
    g.font = "12px 'Burbank Display', 'Lilita One', sans-serif"
    g.textAlign = 'center'
    const list: { r: Racer; x: number; y: number; tw: number; label: string }[] = []
    for (const r of racers) {
      if (r.out && r !== me) continue
      const [x, y0] = P(r.w, r.v)
      if (!onScreen(x, y0, 40)) continue
      const label = r === me ? 'You' : r.name
      list.push({ r, x, y: y0 - r.air * 0.9 - 74, tw: g.measureText(label).width + 26, label })
    }
    // sledders bunch up: a tag that would cover another one moves up above it (yours stays put, order is kept)
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
      g.strokeStyle = '#1d2140'
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
      g.fillStyle = '#1d2140'
      g.fillText(label, x + 6, y + 4)
      if (r.react && r.react.until > performance.now()) {
        g.font = "15px 'Burbank Display', 'Lilita One', sans-serif"
        const txt = r.react.html
        const rw = g.measureText(txt).width + 18
        g.fillStyle = '#ffffff'
        g.beginPath()
        g.roundRect(x - rw / 2, y - 38, rw, 24, 10)
        g.fill()
        g.stroke()
        g.fillStyle = '#1d2140'
        g.fillText(txt, x, y - 21)
        g.font = "12px 'Burbank Display', 'Lilita One', sans-serif"
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
  let trailAcc = 0
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
    // who the camera follows when you're watching: the leader of whoever's still sliding
    if ((!me || S.finished) && !watchPicked && now - lastLeaderCheck > 900) {
      lastLeaderCheck = now
      const racing = racers.filter((r) => !r.done && !r.out)
      if (S.finished && me && now - t0 - S.finishT * 1000 < 1800) watch = me.i
      else if (racing.length) watch = racing.sort((a, b) => b.w - a.w)[0].i
    }
    const focus = me && !S.finished ? me : racers[watch] ?? me
    if (focus) cam.w += ((focus === me ? S.w : focus.w) - cam.w) * (focus === me ? 1 : Math.min(1, dt * 6))
    // trails
    trailAcc += dt
    if (trailAcc > 0.05) {
      trailAcc = 0
      for (const r of racers) {
        if (r.air > 1 || r.out) continue
        if (r.w - r.lastTrailW > 14) {
          r.trail.push({ w: r.w, v: r.v })
          r.lastTrailW = r.w
          if (r.trail.length > 130) r.trail.shift()
        }
      }
    }
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
      // a beat to see the bottom of the hill (longer if you just crossed the line)
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

/** where sledder i of n lines up (the server's race.ts uses the same spread) */
function startV(i: number, n: number): number {
  if (n <= 1) return 0
  const span = Math.min(SLED.halfW * 1.5, 90 * (n - 1))
  return -span / 2 + (span * i) / (n - 1)
}
