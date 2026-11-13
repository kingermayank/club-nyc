import './parkWalk.css'
import { audioCtx, onMute } from '../../audio'
import { el, stage, toStage } from '../../engine/stage'
import { hold } from '../../engine/ui'
import type { Game } from '../../types'

/**
 * Central Park in three spots you stand at and look from (never a faked walk: the paintings aren't 3D, so nothing
 * zooms): the Mall under the elms with leaves coming down, Bethesda Terrace with the fountain running, and the edge of
 * the Lake, sitting low on a rock. Arrows take you on to the next spot or back. At the Lake:
 * mallards paddle in slow loops, bob, leave ripples and quack now and then. Click a duck and it quacks and turns. The
 * bag of duck food is free: click the water and a handful of pellets lands with little splashes, and the nearest ducks
 * paddle over and gobble them up.
 *
 * True details only: the Mall is lined with one of the largest remaining stands of American elms in North America;
 * the Angel of the Waters (1873) is by Emma Stebbins, the first woman commissioned for a major public artwork in New
 * York City; the twin towers across the Lake are the San Remo, finished in 1930.
 *
 * Stamps (the lead adds them): 'park-walk' on reaching the Lake, 'duck-lunch' once every duck has eaten.
 */

type P = [number, number]
/** a camera on a picture: its zoom, and the picture point at the middle of the screen (stage units) */
type Cam = { s: number; x: number; y: number }

const ART = { mall: '/art/places/park-mall.jpg', beth: '/art/places/park-bethesda.jpg', lake: '/art/places/park-lake.jpg' }
const SPRITE = '/art/places/sprites/'

const HOME: Cam = { s: 1, x: 500, y: 282.5 }
const VP: P = [540, 308] // where the Mall's promenade meets the sky


const LINES = {
  elms: 'The Mall is lined with one of the largest remaining stands of American elms in North America.',
  hurry: 'The only place in Manhattan where nobody is in a hurry.',
  angel: 'The Angel of the Waters (1873) is by Emma Stebbins, the first woman commissioned for a major public artwork in New York City.',
  sax: 'Somewhere under the arcade, a saxophone. There is always a saxophone.',
  remo: 'The twin towers across the Lake are the San Remo, finished in 1930.',
  rent: 'The ducks live here rent-free. Nobody else does.',
}

// ---------- the Lake, traced off park-lake.jpg (stage units at rest) ----------
/** where the ducks paddle: open water, kept off the rock in the corner */
const ZONE: P[] = [[60, 292], [975, 286], [975, 420], [858, 468], [810, 548], [610, 548], [540, 532], [462, 516], [392, 500], [348, 478], [312, 450], [286, 426], [226, 404], [140, 388], [86, 352]]
/** the rock (and the plants on it) you sit on: no water there */
const ROCK: P[] = [[0, 316], [56, 334], [108, 390], [180, 405], [242, 423], [268, 452], [298, 482], [345, 505], [410, 520], [492, 540], [536, 565], [0, 565]]
const WATER_TOP = 258
const BAG: P = [906, 476] // where the toss starts: the top of the bag in your hand

// ---------- the fountain, traced off park-bethesda.jpg ----------
/** each fall: its top edge [x0, x1, y] and bottom edge [x0, x1, y] */
const FALLS: [number, number, number, number, number, number][] = [
  [437, 457, 166, 420, 441, 266], // the upper basin's curtains
  [519, 537, 166, 538, 560, 266],
  [378, 394, 284, 377, 394, 352], // the lower basin's four falls
  [441, 458, 284, 442, 458, 358],
  [521, 537, 284, 522, 538, 358],
  [583, 600, 284, 583, 600, 353],
]
const POOL = { x: 497, y: 354, rx: 282, ry: 17 }

const clamp01 = (v: number) => Math.max(0, Math.min(1, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const inside = (p: P, poly: P[]) => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
/** the nearest point of the duck zone (a little inside it) */
const intoZone = (p: P): P => {
  if (inside(p, ZONE)) return p
  let best: P = p
  let bd = Infinity
  for (let i = 0; i < ZONE.length; i++) {
    const a = ZONE[i]
    const b = ZONE[(i + 1) % ZONE.length]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const t = clamp01(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))
    const q: P = [a[0] + dx * t, a[1] + dy * t]
    const d = Math.hypot(q[0] - p[0], q[1] - p[1])
    if (d < bd) {
      bd = d
      best = q
    }
  }
  // nudge inward, toward the middle of the water
  return [best[0] + (560 - best[0]) * 0.04, best[1] + (430 - best[1]) * 0.08]
}
/** how big things are on the water at height y: the Lake is seen from low down, so the far side is small */
const depth = (y: number) => clamp01((y - 262) / 286)
const duckW = (y: number) => 34 + 88 * depth(y) ** 1.05
/** circles on the water look like flat ellipses from this low */
const squash = (y: number) => 0.15 + 0.15 * depth(y)
/** ground distance (y is foreshortened about by half) */
const gdist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, (by - ay) * 2)


const LEAF_COLORS = ['#f59e2b', '#e8562a', '#ffc93c', '#d9772b', '#f2b134']

/** The Lake on its own (click a duck, or the bridge): the same water, ducks and bag of food, without the walk. */
export const feedTheDucks = (g: Game) => walkThePark(g, true)

export function walkThePark(g: Game, straightToLake = false) {
  if (document.querySelector('.pw')) return
  const release = hold()
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches
  const root = el('div', 'pw')
  root.innerHTML = `<div class="pw-view">
      <div class="pw-pic pw-mall" style="background-image:url(${ART.mall})"></div>
      <div class="pw-pic pw-beth" style="background-image:url(${ART.beth})"><canvas class="pw-fountain"></canvas></div>
      <div class="pw-pic pw-lake" style="background-image:url(${ART.lake})"><canvas class="pw-water"></canvas></div>
      <canvas class="pw-fx"></canvas>
      <div class="pw-hit" hidden></div>
    </div>
    <div class="pw-caption"><b>Central Park</b><span class="pw-where">The Mall</span></div>
    <p class="pw-line" aria-live="polite"></p>
    <button class="pw-ic pw-turn" type="button" aria-label="Leave the walk"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <button class="pw-ic pw-prev" type="button" aria-label="Back a spot" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5 L7 12 L14 19" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <button class="pw-ic go pw-walk" type="button" aria-label="On to the next spot" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5 L17 12 L10 19" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
    <div class="pw-dots" aria-hidden="true"><i></i><i></i><i></i></div>
    <svg class="pw-aim" viewBox="0 0 1000 565" aria-hidden="true"><path class="pw-arc"/><ellipse class="pw-ring"/></svg>
    <button class="pw-bag" type="button" aria-label="Toss some duck food" hidden>
      <svg viewBox="0 0 74 88" aria-hidden="true">
        <path d="M14 26 L60 26 L66 84 L8 84 Z" fill="#c99a5e" stroke="#1d2140" stroke-width="3" stroke-linejoin="round"/>
        <path d="M14 26 L18 10 L28 17 L37 8 L46 17 L56 10 L60 26 Z" fill="#dcb47a" stroke="#1d2140" stroke-width="3" stroke-linejoin="round"/>
        <path d="M17 33 L57 33" stroke="#a87c45" stroke-width="2" stroke-linecap="round"/>
        <circle cx="37" cy="57" r="15" fill="#fbfaf6" stroke="#1d2140" stroke-width="2.5"/>
        <path d="M27 60 Q28 52 35 52 Q37 46 42 48 Q46 50 43 54 L48 55 Q46 58 42 57 Q44 64 36 65 Q28 66 27 60 Z" fill="#ffd166" stroke="#1d2140" stroke-width="2" stroke-linejoin="round"/>
        <circle cx="41" cy="50.5" r="1.2" fill="#1d2140"/>
        <circle cx="22" cy="21" r="2.2" fill="#8a5a2b"/><circle cx="50" cy="20" r="2.2" fill="#8a5a2b"/><circle cx="37" cy="19" r="2" fill="#8a5a2b"/>
      </svg>
    </button>
    <p class="pw-hint" hidden>Aim at the water</p>`
  stage.root.append(root)
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector(s) as T
  const pics = { mall: $('.pw-mall'), beth: $('.pw-beth'), lake: $('.pw-lake') }
  const hit = $('.pw-hit')
  const where = $('.pw-where')
  const line = $('.pw-line')
  const walkBtn = $<HTMLButtonElement>('.pw-walk')
  const prevBtn = $<HTMLButtonElement>('.pw-prev')
  const dots = [...root.querySelectorAll<HTMLElement>('.pw-dots i')]
  const aimArc = $<SVGPathElement>('.pw-arc')
  const aimRing = $<SVGEllipseElement>('.pw-ring')
  const bag = $<HTMLButtonElement>('.pw-bag')
  const hintEl = $('.pw-hint')

  let alive = true
  const timers: number[] = []
  const later = (f: () => void, ms: number) => void timers.push(window.setTimeout(() => alive && f(), ms))

  // ---------- one quiet line at a time ----------
  let lineTok = 0
  const said = new Set<string>()
  const say = (key: keyof typeof LINES) => {
    if (said.has(key)) return
    said.add(key)
    const tok = ++lineTok
    line.classList.remove('on')
    later(() => {
      line.textContent = LINES[key]
      line.classList.add('on')
    }, 300)
    later(() => tok === lineTok && line.classList.remove('on'), 8500)
  }

  // ---------- canvases ----------
  const dpr = Math.min(2, window.devicePixelRatio || 1) * stage.scale
  const canvas = (c: HTMLCanvasElement, extra = 1) => {
    c.width = Math.round(1000 * dpr * extra)
    c.height = Math.round(565 * dpr * extra)
    const x = c.getContext('2d')!
    x.scale(dpr * extra, dpr * extra)
    return x
  }
  const fx = canvas($('.pw-fx'))
  const fount = canvas($('.pw-fountain'), 1.25)
  const waterEl = $<HTMLCanvasElement>('.pw-water')
  const lake = canvas(waterEl)

  /** a picture through a camera, with the walker's bob and sway (overscanned so the edges never show) */
  const place = (pic: HTMLElement, cam: Cam, bob = 0, sway = 0) => {
    const s = Math.max(1, cam.s)
    const hw = 500 / s
    const hh = 282.5 / s
    const x = Math.min(1000 - hw, Math.max(hw, cam.x))
    const y = Math.min(565 - hh, Math.max(hh, cam.y))
    const s2 = s * (1 + (Math.abs(bob) + Math.abs(sway)) / 260)
    pic.style.transform = `translate(${(500 - x * s2 + sway).toFixed(2)}px, ${(282.5 - y * s2 + bob).toFixed(2)}px) scale(${s2.toFixed(4)})`
  }

  // ---------- sound: breeze, footsteps, birds, the fountain, water at the edge ----------
  type Mood = 'mall' | 'beth' | 'lake'
  let mood: Mood = 'mall'
  let snd: { mood(m: Mood, secs?: number): void; step(): void; plop(): void; gulp(): void; stop(): void } | null = null
  const startSound = () => {
    const ctx = audioCtx()
    if (!ctx || snd) return
    const noise = (secs: number, brown: boolean) => {
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * secs), ctx.sampleRate)
      const d = buf.getChannelData(0)
      let last = 0
      for (let i = 0; i < d.length; i++) {
        const w = Math.random() * 2 - 1
        d[i] = brown ? (last = (last + 0.02 * w) / 1.02) * 3.4 : w
      }
      return buf
    }
    const bed = (buf: AudioBuffer, type: BiquadFilterType, freq: number) => {
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const f = ctx.createBiquadFilter()
      f.type = type
      f.frequency.value = freq
      f.Q.value = 0.6
      const gain = ctx.createGain()
      gain.gain.value = 0
      src.connect(f).connect(gain).connect(ctx.destination)
      src.start()
      return { src, gain }
    }
    const breeze = bed(noise(3, true), 'lowpass', 480)
    const spray = bed(noise(2, false), 'bandpass', 2300)
    const lap = bed(noise(4, true), 'lowpass', 280)
    // the water at your feet comes and goes
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.21
    const swell = ctx.createGain()
    swell.gain.value = 0
    lfo.connect(swell).connect(lap.gain.gain)
    lfo.start()
    const LEVEL: Record<Mood, number[]> = { mall: [0.2, 0, 0, 0], beth: [0.1, 0.05, 0, 0], lake: [0.12, 0, 0.2, 0.09] }
    const tick = noise(0.07, false)
    let foot = 0
    const chirp = (at: number) => {
      const o = ctx.createOscillator()
      const gn = ctx.createGain()
      const f0 = rnd(2600, 4000)
      o.frequency.setValueAtTime(f0, at)
      o.frequency.exponentialRampToValueAtTime(f0 * 1.35, at + 0.045)
      o.frequency.exponentialRampToValueAtTime(f0 * 0.92, at + 0.09)
      gn.gain.setValueAtTime(0.0001, at)
      gn.gain.exponentialRampToValueAtTime(0.022, at + 0.012)
      gn.gain.exponentialRampToValueAtTime(0.0001, at + 0.1)
      o.connect(gn).connect(ctx.destination)
      o.start(at)
      o.stop(at + 0.12)
    }
    const birds = window.setInterval(() => {
      if (Math.random() < 0.45) return
      const n = 2 + Math.floor(Math.random() * 3)
      for (let i = 0; i < n; i++) chirp(ctx.currentTime + i * rnd(0.11, 0.16))
    }, 2300)
    const blip = (f0: number, f1: number, dur: number, vol: number, delay = 0) => {
      const at = ctx.currentTime + delay
      const o = ctx.createOscillator()
      const gn = ctx.createGain()
      o.frequency.setValueAtTime(f0, at)
      o.frequency.exponentialRampToValueAtTime(f1, at + dur)
      gn.gain.setValueAtTime(0.0001, at)
      gn.gain.exponentialRampToValueAtTime(vol, at + 0.01)
      gn.gain.exponentialRampToValueAtTime(0.0001, at + dur)
      o.connect(gn).connect(ctx.destination)
      o.start(at)
      o.stop(at + dur + 0.02)
    }
    snd = {
      mood(m, secs = 1.5) {
        const [a, b, c, d] = LEVEL[m]
        const k = secs / 3
        breeze.gain.gain.setTargetAtTime(a, ctx.currentTime, k)
        spray.gain.gain.setTargetAtTime(b, ctx.currentTime, k)
        lap.gain.gain.setTargetAtTime(c, ctx.currentTime, k)
        swell.gain.setTargetAtTime(d, ctx.currentTime, k)
      },
      step() {
        // a soft scuff on the paving, alternating feet
        const src = ctx.createBufferSource()
        src.buffer = tick
        const band = ctx.createBiquadFilter()
        band.type = 'bandpass'
        band.frequency.value = foot++ % 2 ? 1250 : 1500
        band.Q.value = 1.1
        const gn = ctx.createGain()
        gn.gain.setValueAtTime(0.16, ctx.currentTime)
        gn.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08)
        src.connect(band).connect(gn).connect(ctx.destination)
        src.start()
      },
      plop: () => blip(rnd(800, 1000), 260, 0.11, 0.045, rnd(0, 0.05)),
      gulp() {
        blip(380, 700, 0.06, 0.04)
        blip(420, 760, 0.06, 0.035, 0.09)
      },
      stop() {
        clearInterval(birds)
        for (const b of [breeze, spray, lap]) {
          b.gain.gain.cancelScheduledValues(ctx.currentTime)
          b.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.12)
        }
        setTimeout(() => {
          for (const b of [breeze, spray, lap]) b.src.stop()
          lfo.stop()
        }, 600)
        snd = null
      },
    }
    snd.mood(mood, 1.5)
  }
  const setMood = (m: Mood, secs?: number) => {
    mood = m
    snd?.mood(m, secs)
  }
  startSound()
  onMute((m) => (m ? snd?.stop() : alive && startSound()))

  // ---------- leaves coming down (screen space, over every stop) ----------
  const leafArt = LEAF_COLORS.map((col) => {
    const c = document.createElement('canvas')
    c.width = c.height = 40
    const x = c.getContext('2d')!
    x.translate(20, 21)
    x.beginPath()
    // a five-lobed maple leaf
    for (let i = 0; i <= 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5
      const r = i % 2 ? 7 : i === 0 ? 17 : i === 4 || i === 6 ? 12 : 15
      x.lineTo(Math.cos(a) * r, Math.sin(a) * r)
    }
    x.closePath()
    x.fillStyle = col
    x.fill()
    x.lineWidth = 2.4
    x.strokeStyle = '#3a2412'
    x.lineJoin = 'round'
    x.stroke()
    x.beginPath()
    x.moveTo(0, 6)
    x.lineTo(0, 17)
    x.stroke()
    return c
  })
  interface Leaf { x: number; y: number; vy: number; amp: number; f: number; ph: number; r: number; vr: number; size: number; art: number }
  const newLeaf = (top: boolean): Leaf => ({
    x: rnd(-20, 1020), y: top ? rnd(-60, -10) : rnd(-20, 520), vy: rnd(16, 30), amp: rnd(10, 26), f: rnd(0.5, 1.2), ph: rnd(0, 7),
    r: rnd(0, 7), vr: rnd(-1.6, 1.6), size: rnd(13, 21), art: Math.floor(rnd(0, leafArt.length)),
  })
  const leaves: Leaf[] = Array.from({ length: calm ? 6 : 18 }, () => newLeaf(false))
  let leafCap = leaves.length
  const drawLeaves = (t: number, dt: number, zoom: number, focus: P) => {
    fx.clearRect(0, 0, 1000, 565)
    for (let i = leaves.length - 1; i >= 0; i--) {
      const l = leaves[i]
      l.y += l.vy * dt * (calm ? 0.6 : 1)
      l.r += l.vr * dt
      // walking forward: leaves slide out past you, from the point you walk toward
      l.x += (l.x - focus[0]) * zoom * dt
      l.y += (l.y - focus[1]) * zoom * dt
      l.size *= 1 + zoom * dt * 0.6
      const x = l.x + Math.sin(t * l.f + l.ph) * l.amp
      if (l.y > 590 || x < -60 || x > 1060) {
        if (leaves.length > leafCap) leaves.splice(i, 1)
        else leaves[i] = newLeaf(true)
        continue
      }
      fx.save()
      fx.translate(x, l.y)
      fx.rotate(l.r + Math.sin(t * l.f * 1.3 + l.ph) * 0.5)
      // tumbling: the leaf turns edge-on and back
      const fl = Math.cos(t * l.f * 1.7 + l.ph)
      fx.scale(Math.abs(fl) < 0.18 ? (fl < 0 ? -0.18 : 0.18) : fl, 1)
      fx.drawImage(leafArt[l.art], -l.size / 2, -l.size / 2, l.size, l.size)
      fx.restore()
    }
  }

  // ---------- Bethesda Fountain: falling water, splashes, rings, sparkles ----------
  interface Drop { x: number; y: number; vx: number; vy: number; life: number; max: number }
  interface Ring { x: number; y: number; r: number; grow: number; life: number; max: number; sq: number; a: number }
  interface Glint { x: number; y: number; life: number; max: number; r: number }
  const fDrops: Drop[] = []
  const fRings: Ring[] = []
  const fGlints: Glint[] = []
  const threads = FALLS.flatMap((f, i) => {
    const n = Math.round((f[1] - f[0]) / 2.6) + 1
    return Array.from({ length: n }, (_, k) => ({ f: i, u: k / (n - 1), ph: Math.random(), ph2: Math.random(), sp: rnd(0.75, 1.05) }))
  })
  const bases = FALLS.map((f): P => [(f[3] + f[4]) / 2, f[5]])
  const poolSpot = (): P => {
    for (;;) {
      const a = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random())
      const p: P = [POOL.x + Math.cos(a) * POOL.rx * r, POOL.y + Math.sin(a) * POOL.ry * r]
      if (!(Math.abs(p[0] - 490) < 112 && p[1] < 361)) return p
    }
  }
  const glint = (x2: CanvasRenderingContext2D, gl: Glint) => {
    const k = Math.sin((gl.life / gl.max) * Math.PI)
    const r = gl.r * (0.6 + k * 0.6)
    x2.strokeStyle = `rgba(255,255,255,${(k * 0.95).toFixed(3)})`
    x2.lineWidth = 1.3
    x2.beginPath()
    x2.moveTo(gl.x - r, gl.y)
    x2.lineTo(gl.x + r, gl.y)
    x2.moveTo(gl.x, gl.y - r * 0.75)
    x2.lineTo(gl.x, gl.y + r * 0.75)
    x2.stroke()
    x2.fillStyle = `rgba(255,255,255,${k.toFixed(3)})`
    x2.fillRect(gl.x - 1, gl.y - 1, 2, 2)
  }
  const rings = (x2: CanvasRenderingContext2D, list: Ring[], dt: number) => {
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i]
      r.life += dt
      if (r.life > r.max) {
        list.splice(i, 1)
        continue
      }
      const k = r.life / r.max
      const rad = r.r + r.grow * Math.sqrt(k)
      x2.strokeStyle = `rgba(255,255,255,${(r.a * (1 - k)).toFixed(3)})`
      x2.lineWidth = 1.4
      x2.beginPath()
      x2.ellipse(r.x, r.y, rad, rad * r.sq, 0, 0, Math.PI * 2)
      x2.stroke()
    }
  }
  const drops = (x2: CanvasRenderingContext2D, list: Drop[], dt: number, color: string) => {
    x2.fillStyle = color
    for (let i = list.length - 1; i >= 0; i--) {
      const d = list[i]
      d.life += dt
      d.vy += 230 * dt
      d.x += d.vx * dt
      d.y += d.vy * dt
      if (d.life > d.max) {
        list.splice(i, 1)
        continue
      }
      x2.globalAlpha = 1 - d.life / d.max
      x2.beginPath()
      x2.arc(d.x, d.y, 1.6, 0, Math.PI * 2)
      x2.fill()
    }
    x2.globalAlpha = 1
  }
  let fSpray = 0
  let fRing = 0
  const drawFountain = (t: number, dt: number) => {
    const c = fount
    c.clearRect(0, 0, 1000, 565)
    // a soft mist where the water lands
    for (const [x, y] of bases) {
      const m = c.createRadialGradient(x, y - 4, 0, x, y - 4, 22)
      m.addColorStop(0, `rgba(245,252,255,${(0.32 + Math.sin(t * 2 + x) * 0.06).toFixed(3)})`)
      m.addColorStop(1, 'rgba(245,252,255,0)')
      c.fillStyle = m
      c.fillRect(x - 24, y - 28, 48, 34)
    }
    // white water churning where each fall lands
    bases.forEach(([x, y], i) => {
      const w = (FALLS[i][4] - FALLS[i][3]) / 2
      for (let k = 0; k < 2; k++) {
        const p = Math.sin(t * (5 + k * 2.3) + i * 1.7 + k)
        c.fillStyle = `rgba(255,255,255,${(0.45 + p * 0.15).toFixed(3)})`
        c.beginPath()
        c.ellipse(x + (k ? 2 : -2), y - 1 - k, w * (0.75 + p * 0.15) + 2, 2.2 + p * 0.5, 0, 0, Math.PI * 2)
        c.fill()
      }
    })
    // the falls: threads of water running down, quicker toward the bottom
    c.lineCap = 'round'
    for (const th of threads) {
      const [ax0, ax1, ay, bx0, bx1, by] = FALLS[th.f]
      for (const ph of [th.ph, th.ph2]) {
        const f = (ph + t * 0.9 * th.sp) % 1
        const k = f ** 1.35
        const x = lerp(lerp(ax0, ax1, th.u), lerp(bx0, bx1, th.u), k)
        const y = lerp(ay, by, k)
        const len = 5 + k * 9
        c.strokeStyle = `rgba(240,250,255,${(Math.sin(f * Math.PI) * 0.7).toFixed(3)})`
        c.lineWidth = 1.2
        c.beginPath()
        c.moveTo(x, y - len)
        c.lineTo(x, y)
        c.stroke()
      }
    }
    // splashes and rings where each fall lands
    fSpray += dt * (calm ? 16 : 55)
    while (fSpray > 1) {
      fSpray--
      const i = Math.floor(Math.random() * bases.length)
      const [x, y] = bases[i]
      const w = (FALLS[i][4] - FALLS[i][3]) / 2
      fDrops.push({ x: x + rnd(-w, w), y: y - 1, vx: rnd(-18, 18), vy: -rnd(22, 52), life: 0, max: rnd(0.3, 0.55) })
    }
    fRing += dt
    if (fRing > 0.35) {
      fRing = 0
      const [x, y] = bases[2 + Math.floor(Math.random() * 4)]
      fRings.push({ x, y: y + 2, r: 6, grow: rnd(26, 40), life: 0, max: rnd(1.4, 2), sq: 0.2, a: 0.55 })
    }
    rings(c, fRings, dt)
    drops(c, fDrops, dt, '#ffffff')
    // sparkles on the pool and on the Lake behind
    if (fGlints.length < 11 && Math.random() < dt * 9) {
      const lakeSide = Math.random() < 0.4
      const [x, y] = lakeSide ? [rnd(612, 950), rnd(238, 282)] : poolSpot()
      fGlints.push({ x, y, life: 0, max: rnd(0.8, 1.5), r: rnd(2.5, 4.5) })
    }
    for (let i = fGlints.length - 1; i >= 0; i--) {
      const gl = fGlints[i]
      gl.life += dt
      if (gl.life > gl.max) fGlints.splice(i, 1)
      else glint(c, gl)
    }
  }

  // ---------- the Lake: ducks, ripples, a far rowboat, food ----------
  const img = (n: number) => {
    const i = new Image()
    i.src = `${SPRITE}duck-${n}.png`
    return i
  }
  // drakes: duck-1 (beak shut) and duck-3 (beak open), both facing right; hens: duck-4 and duck-6, both facing left
  const ART_D = { shut: img(1), open: img(3), faces: 1 }
  const ART_H = { shut: img(4), open: img(6), faces: -1 }
  interface Duck {
    art: typeof ART_D; x: number; y: number; a: number; sp: number; face: 1 | -1; sx: number
    cx: number; cy: number; rx: number; th: number; dir: number; ph: number; next: number; pause: number
    beak: number; gob: number; lines: number; hop: number; ring: number; chase: boolean; fed: boolean; ate: number; full: number
  }
  const spawn: [boolean, number, number][] = [[true, 430, 448], [false, 600, 502], [true, 735, 380], [false, 852, 470], [true, 300, 340]]
  const ducks: Duck[] = spawn.map(([drake, x, y]) => {
    const a = Math.random() < 0.5 ? 0 : Math.PI
    return {
      art: drake ? ART_D : ART_H, x, y, a, sp: 1, face: Math.cos(a) > 0 ? 1 : -1, sx: Math.cos(a) > 0 ? 1 : -1,
      cx: x, cy: y, rx: rnd(45, 85), th: rnd(0, 7), dir: Math.random() < 0.5 ? 1 : -1, ph: rnd(0, 7), next: rnd(6, 16), pause: 0,
      beak: 0, gob: 0, lines: 0, hop: 0, ring: rnd(0, 1), chase: false, fed: false, ate: 0, full: 0,
    }
  })
  interface Pellet { x: number; y: number; sx: number; sy: number; tx: number; ty: number; t: number; dur: number; arc: number; state: 'fly' | 'float' | 'gone'; life: number; ph: number; vx: number }
  const pellets: Pellet[] = []
  const lRings: Ring[] = []
  const lDrops: Drop[] = []
  const lGlints: Glint[] = []
  const floaters = Array.from({ length: 4 }, () => ({ x: rnd(120, 960), y: rnd(300, 540), vx: rnd(-2.5, 2.5), r: rnd(0, 6), art: Math.floor(rnd(0, leafArt.length)) })).filter((l) => !inside([l.x, l.y], ROCK))
  const boat = { x: rnd(700, 900), dir: -1 }

  const quack = (d: Duck, sound = true) => {
    d.beak = 0.42
    d.lines = 0.6
    if (sound) g.sfx.quack()
  }
  let fedAll = false
  const eat = (d: Duck, p: Pellet) => {
    p.state = 'gone'
    d.gob = 0.5
    d.beak = 0.3
    d.face = p.x >= d.x ? 1 : -1
    lRings.push({ x: p.x, y: p.y, r: 2, grow: duckW(p.y) * 0.35, life: 0, max: 0.9, sq: squash(p.y), a: 0.7 })
    snd?.gulp()
    // three pellets and a duck has had enough for now: the next ones go to somebody else
    if (++d.ate % 3 === 0) {
      d.full = 20
      d.chase = false
    }
    if (!d.fed) {
      d.fed = true
      if (!fedAll && ducks.every((k) => k.fed)) {
        fedAll = true
        g.stamp('duck-lunch')
      }
    }
  }
  const newLoop = (d: Duck, near: P = [d.x, d.y], spread = 150) => {
    const c = intoZone([near[0] + rnd(-spread, spread), near[1] + rnd(-spread, spread) * 0.4])
    d.cx = c[0]
    d.cy = c[1]
    d.rx = rnd(40, 85)
    d.th = Math.atan2((d.y - d.cy) * 2, d.x - d.cx)
    d.dir = Math.random() < 0.5 ? 1 : -1
    d.next = rnd(8, 18)
  }
  const floating = () => pellets.filter((p) => p.state === 'float')
  let ambient = rnd(3, 6)

  const moveDucks = (dt: number) => {
    const food = floating()
    for (const d of ducks) {
      const w = duckW(d.y)
      const base = w * 0.11
      let tx: number
      let ty: number
      let want: number
      if (d.chase && food.length) {
        let best = food[0]
        for (const p of food) if (gdist(d.x, d.y, p.x, p.y) < gdist(d.x, d.y, best.x, best.y)) best = p
        ;[tx, ty] = intoZone([best.x, best.y])
        want = 2.6
        if (gdist(d.x, d.y, best.x, best.y) < w * 0.5 && d.gob <= 0) eat(d, best)
      } else {
        if (d.chase) {
          d.chase = false
          newLoop(d, [d.x, d.y], 40)
        }
        d.next -= dt
        if (d.next < 0) {
          newLoop(d)
          if (Math.random() < 0.35) d.pause = rnd(2, 4.5)
        }
        d.pause -= dt
        const k = duckW(d.cy) / 80
        d.th += (dt * d.dir * base * 0.7) / (d.rx * k)
        ;[tx, ty] = intoZone([d.cx + Math.cos(d.th) * d.rx * k, d.cy + Math.sin(d.th) * d.rx * k * 0.5])
        want = d.pause > 0 ? 0.12 : 1
      }
      // steer: turn toward the target at a duck's pace
      const goal = Math.atan2((ty - d.y) * 2, tx - d.x)
      let da = goal - d.a
      while (da > Math.PI) da -= Math.PI * 2
      while (da < -Math.PI) da += Math.PI * 2
      d.a += Math.max(-1, Math.min(1, da)) * dt * (d.chase ? 3.2 : 1.3)
      d.sp += (want - d.sp) * Math.min(1, dt * 1.5)
      if (gdist(d.x, d.y, tx, ty) < 3) d.sp *= 0.9
      const v = base * d.sp
      const nx = d.x + Math.cos(d.a) * v * dt
      const ny = d.y + Math.sin(d.a) * v * 0.5 * dt
      if (inside([nx, ny], ZONE)) {
        d.x = nx
        d.y = ny
      } else d.a += dt * 2
      if (d.gob <= 0 && d.hop <= 0) {
        const c = Math.cos(d.a)
        if (c > 0.25) d.face = 1
        else if (c < -0.25) d.face = -1
      }
      d.sx += (d.face - d.sx) * Math.min(1, dt * 7)
      d.beak -= dt
      d.gob -= dt
      d.full -= dt
      d.lines -= dt
      d.hop -= dt
      // a ring now and then: more often when paddling hard
      d.ring -= dt * (0.4 + d.sp * 0.7)
      if (d.ring < 0) {
        d.ring = rnd(0.9, 1.3)
        lRings.push({ x: d.x - d.face * w * 0.18 * Math.min(1, d.sp), y: d.y + 1, r: w * 0.3, grow: w * 0.55, life: 0, max: rnd(1.6, 2.2), sq: squash(d.y), a: 0.55 })
      }
    }
    // keep a little room between ducks
    for (let i = 0; i < ducks.length; i++)
      for (let j = i + 1; j < ducks.length; j++) {
        const a = ducks[i]
        const b = ducks[j]
        const min = (duckW(a.y) + duckW(b.y)) * 0.42
        const dx = b.x - a.x
        const dy = (b.y - a.y) * 2
        const d = Math.hypot(dx, dy) || 1
        if (d < min) {
          const push = ((min - d) / d) * dt * 2.2
          const ax: P = [a.x - dx * push, a.y - (dy * push) / 2]
          const bx: P = [b.x + dx * push, b.y + (dy * push) / 2]
          if (inside(ax, ZONE)) [a.x, a.y] = ax
          if (inside(bx, ZONE)) [b.x, b.y] = bx
        }
      }
    // now and then somebody has something to say
    if (phase === 'lake') {
      ambient -= dt
      if (ambient < 0) {
        ambient = rnd(6, 12)
        quack(ducks[Math.floor(Math.random() * ducks.length)], true)
      }
    }
  }

  const drawDuck = (d: Duck, t: number, reflect: boolean) => {
    const art = d.beak > 0 ? d.art.open : d.art.shut
    if (!art.complete || !art.naturalWidth) return
    const w = duckW(d.y)
    const h = (w * art.naturalHeight) / art.naturalWidth
    const bob = calm ? 0 : Math.sin(t * 1.7 + d.ph) * w * 0.018 + (d.hop > 0 ? -Math.sin((d.hop / 0.35) * Math.PI) * w * 0.08 : 0)
    const tilt = calm ? 0 : Math.sin(t * 1.3 + d.ph) * 0.035 + (d.gob > 0 ? Math.sin((d.gob / 0.5) * Math.PI) * 0.22 * d.face : 0) + d.sp * 0.03 * d.face
    const dip = d.gob > 0 ? Math.sin((d.gob / 0.5) * Math.PI) * w * 0.05 : 0
    const sx = d.sx * d.art.faces
    const sxs = Math.sign(sx) * Math.max(0.12, Math.abs(sx))
    const sink = 0.8 // how much of the sprite rides above the water
    const c = lake
    if (reflect) {
      c.save()
      c.beginPath()
      c.rect(d.x - w, d.y, w * 2, h)
      c.clip()
      c.globalAlpha = 0.2
      c.translate(d.x, d.y + Math.sin(t * 3 + d.ph) * 0.6)
      c.scale(sxs, -0.5)
      c.drawImage(art, -w / 2, -h * sink + bob, w, h)
      c.restore()
      return
    }
    // a darker patch of water under the body
    c.fillStyle = 'rgba(8, 64, 88, 0.16)'
    c.beginPath()
    c.ellipse(d.x, d.y + 1, w * 0.5, w * 0.075, 0, 0, Math.PI * 2)
    c.fill()
    c.save()
    c.beginPath()
    c.rect(d.x - w, d.y - h * 1.6, w * 2, h * 1.6)
    c.clip()
    c.translate(d.x, d.y + bob + dip)
    c.rotate(tilt)
    c.scale(sxs, 1)
    c.drawImage(art, -w / 2, -h * sink, w, h)
    c.restore()
    // the waterline
    c.strokeStyle = 'rgba(255, 255, 255, 0.6)'
    c.lineWidth = 1.3
    c.beginPath()
    c.ellipse(d.x, d.y, w * 0.44, w * 0.055, 0, 0.15, Math.PI - 0.15)
    c.stroke()
    // quack lines off the bill
    if (d.lines > 0) {
      const k = d.lines / 0.6
      const bx = d.x + d.sx * w * 0.52
      const by = d.y - h * 0.5 + bob
      c.strokeStyle = `rgba(29, 33, 64, ${Math.min(1, k * 1.6).toFixed(3)})`
      c.lineWidth = 2
      c.lineCap = 'round'
      for (const ang of [-0.55, 0, 0.55]) {
        const ca = Math.cos(ang) * d.face
        const sa = Math.sin(ang)
        const r0 = w * 0.07 + (1 - k) * w * 0.05
        const r1 = r0 + w * 0.11
        c.beginPath()
        c.moveTo(bx + ca * r0, by + sa * r0)
        c.lineTo(bx + ca * r1, by + sa * r1)
        c.stroke()
      }
    }
  }

  const drawBoat = (dt: number, t: number) => {
    // a rowboat far off, crossing in front of the bridge at a rowboat's pace
    boat.x += boat.dir * 3.2 * dt
    if (boat.x < 40) boat.x = 980
    const x = boat.x
    const y = 266
    const c = lake
    const stroke = Math.sin(t * 2.4)
    c.save()
    c.translate(x, y)
    c.strokeStyle = '#1d2140'
    c.lineWidth = 1.3
    c.lineCap = 'round'
    // oars
    c.beginPath()
    c.moveTo(-2, -3)
    c.lineTo(-2 + stroke * 7, 2)
    c.moveTo(2, -3)
    c.lineTo(2 + stroke * 7, 2.5)
    c.stroke()
    // hull
    c.fillStyle = '#c8402f'
    c.beginPath()
    c.moveTo(-12, -3)
    c.lineTo(12, -3)
    c.quadraticCurveTo(10, 2, 6, 2)
    c.lineTo(-8, 2)
    c.quadraticCurveTo(-11, 1, -12, -3)
    c.fill()
    c.stroke()
    // the rower
    c.fillStyle = '#f4f1e6'
    c.fillRect(-2.5, -9, 5, 6)
    c.strokeRect(-2.5, -9, 5, 6)
    c.fillStyle = '#e0a370'
    c.beginPath()
    c.arc(0, -11, 2.2, 0, Math.PI * 2)
    c.fill()
    c.stroke()
    c.restore()
    c.globalAlpha = 0.18
    c.fillStyle = '#c8402f'
    c.fillRect(x - 9, y + 3, 17, 2)
    c.globalAlpha = 1
    if (Math.abs(stroke) > 0.98 && Math.random() < 0.08) lRings.push({ x: x + 6, y: y + 2, r: 2, grow: 7, life: 0, max: 1.1, sq: 0.18, a: 0.5 })
  }

  const drawLake = (t: number, dt: number) => {
    const c = lake
    c.clearRect(0, 0, 1000, 565)
    moveDucks(dt)
    // glints on the open water
    if (lGlints.length < 9 && Math.random() < dt * 8) {
      const p: P = [rnd(20, 990), rnd(262, 555)]
      if (!inside(p, ROCK)) lGlints.push({ x: p[0], y: p[1], life: 0, max: rnd(0.8, 1.6), r: 2 + depth(p[1]) * 4 })
    }
    for (let i = lGlints.length - 1; i >= 0; i--) {
      const gl = lGlints[i]
      gl.life += dt
      if (gl.life > gl.max) lGlints.splice(i, 1)
      else glint(c, gl)
    }
    drawBoat(dt, t)
    // a few leaves riding the water
    for (const l of floaters) {
      l.x += l.vx * dt
      if (l.x < 10 || l.x > 990) l.vx *= -1
      const s = 6 + depth(l.y) * 10
      c.save()
      c.translate(l.x, l.y + Math.sin(t * 1.4 + l.r) * 0.8)
      c.scale(1, 0.45)
      c.rotate(l.r + t * 0.05)
      c.drawImage(leafArt[l.art], -s / 2, -s / 2, s, s)
      c.restore()
    }
    rings(c, lRings, dt)
    // pellets bobbing on the water
    for (const p of pellets) {
      if (p.state !== 'float') continue
      p.life += dt
      p.x += p.vx * dt
      const s = 1.5 + depth(p.y) * 2.4
      const sink = p.life > 15 ? (p.life - 15) / 1.2 : 0
      if (sink >= 1) {
        p.state = 'gone'
        continue
      }
      c.globalAlpha = 1 - sink
      c.fillStyle = '#8a5a2b'
      c.strokeStyle = '#3a2412'
      c.lineWidth = 0.8
      c.beginPath()
      c.ellipse(p.x, p.y + Math.sin(t * 2.2 + p.ph) * 0.5, s, s * 0.6, 0, 0, Math.PI * 2)
      c.fill()
      c.stroke()
      c.globalAlpha = 1
    }
    // ducks, far ones first: all the reflections, then the ducks
    const order = [...ducks].sort((a, b) => a.y - b.y)
    for (const d of order) drawDuck(d, t, true)
    for (const d of order) drawDuck(d, t, false)
    // pellets in the air
    for (const p of pellets) {
      if (p.state !== 'fly') continue
      p.t += dt
      const k = Math.min(1, p.t / p.dur)
      p.x = lerp(p.sx, p.tx, k)
      p.y = lerp(p.sy, p.ty, k) - Math.sin(k * Math.PI) * p.arc
      const s = lerp(4, 1.5 + depth(p.ty) * 2.4, k)
      c.fillStyle = '#8a5a2b'
      c.strokeStyle = '#3a2412'
      c.lineWidth = 1
      c.beginPath()
      c.arc(p.x, p.y, s, 0, Math.PI * 2)
      c.fill()
      c.stroke()
      if (k >= 1) land(p)
    }
    drops(c, lDrops, dt, '#f2fbff')
    for (let i = pellets.length - 1; i >= 0; i--) if (pellets[i].state === 'gone') pellets.splice(i, 1)
  }

  // ---------- feeding ----------
  let lastToss = 0
  let tossed = false
  let landed = 0
  const land = (p: Pellet) => {
    p.state = 'float'
    p.x = p.tx
    p.y = p.ty
    const w = duckW(p.y)
    lRings.push({ x: p.x, y: p.y, r: 1, grow: w * 0.3, life: 0, max: 1.2, sq: squash(p.y), a: 0.75 })
    for (let i = 0; i < 3; i++) lDrops.push({ x: p.x, y: p.y, vx: rnd(-14, 14) * (0.4 + depth(p.y)), vy: -rnd(25, 50) * (0.5 + depth(p.y)), life: 0, max: rnd(0.25, 0.4) })
    snd?.plop()
    // the nearest ducks notice (the ones who haven't eaten yet notice a little sooner)
    if (++landed % 5 !== 1) return
    const keen = (d: Duck) => gdist(d.x, d.y, p.x, p.y) * (d.fed ? 2.2 : 1)
    const rank = ducks.filter((d) => d.full <= 0).sort((a, b) => keen(a) - keen(b))
    rank.forEach((d, i) => {
      if (i < 2 || gdist(d.x, d.y, p.x, p.y) < 160) {
        if (!d.chase && i === 0) later(() => quack(d), 250)
        d.chase = true
        d.pause = 0
      }
    })
  }
  const toss = (at: P) => {
    const now = performance.now()
    if (now - lastToss < 550) return
    lastToss = now
    if (!tossed) {
      tossed = true
      hintEl.classList.remove('on')
      later(() => (hintEl.hidden = true), 400)
    }
    bag.classList.remove('shake')
    void bag.offsetWidth
    bag.classList.add('shake')
    const tgt = intoZone(at)
    const k = 0.4 + depth(tgt[1]) * 0.6
    const dist = Math.hypot(tgt[0] - BAG[0], tgt[1] - BAG[1])
    for (let i = 0; i < 5; i++) {
      const tx = tgt[0] + rnd(-20, 20) * k
      const ty = tgt[1] + rnd(-7, 7) * k
      pellets.push({ x: BAG[0], y: BAG[1], sx: BAG[0] + rnd(-6, 6), sy: BAG[1], tx, ty, t: -i * 0.05, dur: 0.5 + dist / 1500, arc: 40 + dist * 0.18, state: 'fly', life: 0, ph: rnd(0, 7), vx: rnd(-1.2, 1.2) })
    }
    g.sfx.click()
  }
  const duckAt = (p: P): Duck | null => {
    let best: Duck | null = null
    for (const d of ducks) {
      const w = duckW(d.y)
      const h = w * 0.72
      if (p[0] > d.x - w * 0.45 && p[0] < d.x + w * 0.45 && p[1] > d.y - h * 0.82 && p[1] < d.y + 3 && (!best || d.y > best.y)) best = d
    }
    return best
  }
  const isWater = (p: P) => p[1] > WATER_TOP && !inside(p, ROCK)
  hit.onpointerdown = (e) => {
    if (phase !== 'lake') return
    const p = toStage(e)
    const d = duckAt(p)
    if (d) {
      // a poke: a quack, and the duck turns around and paddles off the other way
      quack(d)
      d.beak = 0.65
      d.face = d.face === 1 ? -1 : 1
      d.a = d.face === 1 ? rnd(-0.4, 0.4) : Math.PI + rnd(-0.4, 0.4)
      d.hop = 0.35
      d.pause = 0
      d.chase = false
      newLoop(d, [d.x + d.face * 120, d.y], 30)
      d.sp = 1.6
      lRings.push({ x: d.x, y: d.y + 1, r: duckW(d.y) * 0.3, grow: duckW(d.y) * 0.6, life: 0, max: 1.2, sq: squash(d.y), a: 0.7 })
      return
    }
    if (isWater(p)) toss(p)
  }
  /** the throw you're lining up: an arc from the bag to where the handful will land */
  const aim = (p: P | null) => {
    if (!p || phase !== 'lake' || !isWater(p) || duckAt(p)) return void root.classList.remove('aiming')
    const tgt = intoZone(p)
    const dist = Math.hypot(tgt[0] - BAG[0], tgt[1] - BAG[1])
    const lift = 40 + dist * 0.18
    aimArc.setAttribute('d', `M ${BAG[0]} ${BAG[1]} Q ${(BAG[0] + tgt[0]) / 2} ${(BAG[1] + tgt[1]) / 2 - lift * 2} ${tgt[0]} ${tgt[1]}`)
    const w = duckW(tgt[1]) * 0.36
    aimRing.setAttribute('cx', String(tgt[0]))
    aimRing.setAttribute('cy', String(tgt[1]))
    aimRing.setAttribute('rx', String(w))
    aimRing.setAttribute('ry', String(w * squash(tgt[1]) * 1.6))
    root.classList.add('aiming')
  }
  hit.onpointermove = (e) => {
    const p = toStage(e)
    hit.style.cursor = phase === 'lake' && duckAt(p) ? 'pointer' : phase === 'lake' && isWater(p) ? 'crosshair' : 'default'
    aim(p)
  }
  hit.onpointerleave = () => aim(null)
  // the bag is in your hand: it doesn't throw for you, it only reminds you where to aim
  bag.onclick = () => {
    bag.classList.remove('shake')
    void bag.offsetWidth
    bag.classList.add('shake')
    hintEl.hidden = false
    requestAnimationFrame(() => hintEl.classList.add('on'))
  }

  // ---------- three spots: stand at each one and look; the arrows take you on (or back) ----------
  type Phase = 'mall' | 'beth' | 'lake' | 'gone'
  const STOPS = ['mall', 'beth', 'lake'] as const
  const NAMES = { mall: 'The Mall', beth: 'Bethesda Terrace', lake: 'The Lake' }
  let phase: Phase = 'mall'
  let at = 0
  let last = performance.now()
  let raf = 0

  const show = (btn: HTMLElement) => {
    btn.hidden = false
    requestAnimationFrame(() => btn.classList.add('on'))
  }
  const hide = (btn: HTMLElement) => {
    btn.classList.remove('on')
    btn.hidden = true
  }
  const frame = (now: number) => {
    if (!alive) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    const T = now / 1000
    drawLeaves(T, dt, 0, VP)
    if (phase === 'beth') drawFountain(T, dt)
    if (phase === 'lake') drawLake(T, dt)
    raf = requestAnimationFrame(frame)
  }
  for (const pic of Object.values(pics)) place(pic, HOME)
  raf = requestAnimationFrame(frame)

  let hinted = false
  const go = (i: number, walked = true) => {
    at = Math.max(0, Math.min(STOPS.length - 1, i))
    const stop = STOPS[at]
    phase = stop
    for (const k of STOPS) pics[k].style.opacity = k === stop ? '1' : '0'
    waterEl.style.opacity = stop === 'lake' ? '1' : '0'
    where.textContent = NAMES[stop]
    dots.forEach((d, k) => d.classList.toggle('on', k === at))
    leafCap = calm ? 3 : stop === 'mall' ? 18 : 7
    setMood(stop, 1.2)
    line.classList.remove('on')
    lineTok++
    root.classList.remove('aiming')
    hit.hidden = stop !== 'lake'
    if (stop === 'lake') show(bag)
    else hide(bag)
    if (at > 0) show(prevBtn)
    else hide(prevBtn)
    if (at < STOPS.length - 1) show(walkBtn)
    else hide(walkBtn)
    if (stop === 'mall') later(() => phase === 'mall' && say('elms'), 900)
    if (stop === 'beth') later(() => phase === 'beth' && say('angel'), 900)
    if (stop === 'lake') {
      if (walked) g.stamp('park-walk')
      later(() => phase === 'lake' && say('remo'), 900)
      later(() => {
        if (tossed || hinted || phase !== 'lake') return
        hinted = true
        hintEl.hidden = false
        requestAnimationFrame(() => hintEl.classList.add('on'))
      }, 2600)
    }
  }
  go(straightToLake ? 2 : 0, false)
  walkBtn.onclick = () => (g.sfx.click(), go(at + 1))
  prevBtn.onclick = () => (g.sfx.click(), go(at - 1, false))

  // ---------- leaving ----------
  const leave = () => {
    if (!alive) return
    alive = false
    phase = 'gone'
    g.sfx.click()
    cancelAnimationFrame(raf)
    for (const id of timers) clearTimeout(id)
    snd?.stop()
    window.removeEventListener('keydown', keys, true)
    root.classList.add('out')
    setTimeout(() => {
      root.remove()
      release()
    }, 500)
  }
  const keys = (e: KeyboardEvent) => {
    const tg = e.target as HTMLElement | null
    if (tg && (tg.tagName === 'INPUT' || tg.tagName === 'TEXTAREA')) return
    if (e.key === 'ArrowRight' && at < STOPS.length - 1) go(at + 1)
    else if (e.key === 'ArrowLeft' && at > 0) go(at - 1, false)
    else if (e.key === 'Escape') leave()
    else return
    e.preventDefault()
    e.stopPropagation()
  }
  window.addEventListener('keydown', keys, true)
  $('.pw-turn').onclick = leave
}
