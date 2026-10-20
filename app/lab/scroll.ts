// Landing option E, "Cinematic scroll" (app/lab/scroll.html, dev only).
//
// How it moves:
//  - Every [data-scene] is a tall section with a sticky stage. Its progress through the viewport (0 → 1) is eased
//    toward the real scroll position each frame (smooth, but the page still scrolls natively) and written to --s.
//  - Inside a scene, an element with data-range="a b" gets its own --t: 0 → 1 while the scene goes from a to b,
//    shaped by data-ease. The CSS turns --t into movement (scroll.css).
//  - One video sits behind the whole page (.sx-video). Each scene says what it looks like (LOOK below: full screen,
//    a game window, a blurred backdrop…) and which clip plays (data-clip); scenes blend into each other.
// People who prefer less motion get the same page, laid out still (scroll.css, .sx-still).
import './scroll.css'
import { trailerDialog } from '../src/landing/media'
import { jamState } from '../src/data/jam'

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const EASE: Record<string, (t: number) => number> = {
  linear: (t) => t,
  in: (t) => t * t * t,
  out: (t) => 1 - (1 - t) ** 3,
  inout: (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  // overshoots a little, then settles (things that pop in)
  back: (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2,
}
const still = matchMedia('(prefers-reduced-motion: reduce)').matches
const small = () => innerWidth <= 760
if (still) document.body.classList.add('sx-still')

// ---------------------------------------------------------------- scenes
type Part = { el: HTMLElement; a: number; b: number; ease: (t: number) => number }
type Scene = { el: HTMLElement; name: string; clip: string; parts: Part[]; t: number; target: number }
const scenes: Scene[] = [...document.querySelectorAll<HTMLElement>('[data-scene]')].map((el) => ({
  el,
  name: el.dataset.scene!,
  clip: el.dataset.clip ?? '',
  parts: [...el.querySelectorAll<HTMLElement>('[data-range]')].map((p) => {
    const [a, b] = p.dataset.range!.split(' ').map(Number)
    return { el: p, a, b, ease: EASE[p.dataset.ease ?? 'inout'] ?? EASE.inout }
  }),
  t: 0,
  target: 0,
}))

// ---------------------------------------------------------------- the video behind everything
type Look = { top: number; side: number; radius: number; blur: number; bright: number; frame: number; tilt: number; scale: number }
const FULL: Look = { top: 0, side: 0, radius: 0, blur: 0, bright: 1, frame: 0, tilt: 0, scale: 1 }
const LOOK: Record<string, (t: number) => Look> = {
  // full screen and dim under the headline, then it shrinks into a game window (with a little tilt on the way)
  open: (t) => {
    const k = EASE.inout(clamp(t / 0.6))
    return { top: (small() ? 17 : 14) * k, side: (small() ? 4 : 17) * k, radius: 34 * k, blur: 0, bright: lerp(0.48, 1, k), frame: k, tilt: 8 * Math.sin(Math.PI * k), scale: lerp(1.08, 1, k) }
  },
  places: () => ({ ...FULL, blur: 18, bright: 0.3 }),
  mask: () => ({ ...FULL }),
  stack: () => ({ ...FULL, blur: 24, bright: 0.32 }),
  jam: (t) => ({ ...FULL, bright: lerp(0.4, 0.78, EASE.out(clamp(t / 0.35))), scale: lerp(1.1, 1, EASE.out(clamp(t / 0.6))) }),
  more: () => ({ ...FULL, blur: 12, bright: 0.38 }),
  safe: () => ({ ...FULL, blur: 26, bright: 0.28 }),
  final: (t) => ({ ...FULL, bright: lerp(0.38, 0.72, EASE.out(clamp(t / 0.45))) }),
}
const KEYS = Object.keys(FULL) as (keyof Look)[]
const mix = (a: Look, b: Look, k: number) => Object.fromEntries(KEYS.map((key) => [key, lerp(a[key], b[key], k)])) as Look

const box = document.querySelector<HTMLElement>('.sx-video')!
const players = [...box.querySelectorAll<HTMLVideoElement>('.sx-v')]
let front = players[0]
let playing = ''
const kind = front.canPlayType('video/mp4') ? 'mp4' : 'webm'
const TIMES_SQUARE = new Set(['crowd', 'crowd-arrive', 'jam'])
/** crossfade the background to another clip */
function clip(name: string) {
  if (!name || name === playing) return
  playing = name
  const back = players[0] === front ? players[1] : players[0]
  back.poster = `/lab/clips/${name}.webp`
  back.preload = 'auto'
  back.src = `/lab/clips/${name}.${kind}`
  // Times Square clips are framed on the crowd (and below the shop signs across the top)
  back.classList.toggle('crowd', TIMES_SQUARE.has(name))
  back.load()
  const swap = () => {
    if (playing !== name) return
    if (!still) void back.play().catch(() => {})
    back.classList.add('on')
    front.classList.remove('on')
    const old = front
    front = back
    setTimeout(() => old !== front && old.pause(), 700)
  }
  if (still) swap()
  else back.addEventListener('loadeddata', swap, { once: true })
}
let shown = ''
function look(l: Look) {
  const key = KEYS.map((k) => l[k].toFixed(2)).join()
  if (key === shown) return
  shown = key
  box.style.setProperty('--top', `${l.top}vh`)
  box.style.setProperty('--side', `${l.side}vw`)
  box.style.setProperty('--radius', `${l.radius}px`)
  // blur is the expensive part: phones only dim
  box.style.setProperty('--blur', `${small() ? 0 : l.blur}px`)
  box.style.setProperty('--bright', l.bright.toFixed(3))
  box.style.setProperty('--frame', l.frame.toFixed(3))
  box.style.setProperty('--tilt', `${l.tilt}deg`)
  box.style.setProperty('--scale', l.scale.toFixed(4))
}

// ---------------------------------------------------------------- pieces that need measuring
const track = document.querySelector<HTMLElement>('.sx-track')
const cards = [...document.querySelectorAll<HTMLElement>('.sx-card')]
const features = [...document.querySelectorAll<HTMLElement>('.sx-feature')]
const cover = document.querySelector<SVGSVGElement>('.sx-cover')
const maskText = cover?.querySelector<SVGPathElement>('.sx-mask-text')
const coverPart = scenes.flatMap((s) => s.parts).find((p) => p.el === (cover as unknown as HTMLElement))
// the HANG OUT path: 1592 units wide, caps 248 tall, drawn from its baseline; the zoom aims where the H's crossbar
// meets its left stem (solid however big it gets)
const WORD = { width: 1592.2, cap: 247.5, aimX: 45, aimY: -120 }
const mask = { w: 1600, h: 900, ox: 0, oy: 0 }
function placeWord(k: number) {
  if (!maskText) return
  // the aim point glides to the middle of the screen while the word grows
  const m = EASE.inout(clamp(k * 2.2))
  const x = lerp(mask.ox, mask.w / 2, m)
  const y = lerp(mask.oy, mask.h / 2, m)
  maskText.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${(1 + k * 140).toFixed(3)}) translate(${-WORD.aimX} ${-WORD.aimY})`)
}
function measureOnce() {
  // how far the place strip has to travel
  if (track) track.style.setProperty('--max', small() ? '0px' : `${Math.max(0, track.scrollWidth - innerWidth + 64)}px`)
  // HANG OUT: the sheet is 1600 units wide whatever the screen, so the word always fits across it, centred
  if (cover && maskText) {
    mask.h = Math.round((mask.w * innerHeight) / innerWidth)
    cover.setAttribute('viewBox', `0 0 ${mask.w} ${mask.h}`)
    mask.ox = mask.w / 2 - WORD.width / 2 + WORD.aimX
    mask.oy = mask.h / 2 + WORD.cap / 2 + WORD.aimY
    placeWord(0)
  }
}
addEventListener('resize', measureOnce)
document.fonts.ready.then(measureOnce)
measureOnce()

// ---------------------------------------------------------------- every frame
const bar = document.querySelector<HTMLElement>('.sx-progress')!
const header = document.querySelector<HTMLElement>('.sx-header')!
let last = performance.now()
let active: Scene | null = null
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  const smooth = still ? 1 : 1 - Math.pow(0.0006, dt)
  const mid = innerHeight / 2
  for (const s of scenes) {
    const r = s.el.getBoundingClientRect()
    s.target = clamp(-r.top / Math.max(1, s.el.offsetHeight - innerHeight))
    s.t += (s.target - s.t) * smooth
    if (Math.abs(s.target - s.t) < 1e-4) s.t = s.target
    s.el.style.setProperty('--s', s.t.toFixed(4))
    for (const p of s.parts) p.el.style.setProperty('--t', p.ease(clamp((s.t - p.a) / (p.b - p.a))).toFixed(4))
    if (r.top <= mid && r.bottom > mid) active = s
  }
  // the video: this scene's look, blended in from the last one's over the first stretch of the scene
  // (less motion: it stays put, dimmed, and only the picture changes)
  if (active && still) clip(active.clip)
  else if (active) {
    const i = scenes.indexOf(active)
    const cur = LOOK[active.name]?.(active.t) ?? FULL
    const prev = i > 0 ? LOOK[scenes[i - 1].name]?.(1) : null
    look(prev && active.t < 0.18 ? mix(prev, cur, EASE.inout(active.t / 0.18)) : cur)
    clip(active.clip)
  }
  // falling through the letters
  if (coverPart) placeWord(Number(coverPart.el.style.getPropertyValue('--t')) || 0)
  // place cards lean and their pictures drift as they cross the screen
  for (const c of cards) {
    const r = c.getBoundingClientRect()
    if (r.right < -200 || r.left > innerWidth + 200) continue
    const x = clamp((r.left + r.width / 2) / innerWidth, -0.5, 1.5)
    c.style.setProperty('--c', x.toFixed(3))
  }
  // a feature card dims and shrinks a little as the next one slides over it
  for (let i = 0; i < features.length - 1; i++) {
    const a = features[i].getBoundingClientRect()
    const b = features[i + 1].getBoundingClientRect()
    features[i].style.setProperty('--cover', clamp((a.bottom - b.top) / a.height).toFixed(3))
  }
  const doc = document.documentElement
  bar.style.setProperty('--page', clamp(scrollY / Math.max(1, doc.scrollHeight - innerHeight)).toFixed(4))
  header.classList.toggle('scrolled', scrollY > 24)
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)

// ---------------------------------------------------------------- clips in cards play only while you can see them
const lazy = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      const v = e.target as HTMLVideoElement
      if (e.isIntersecting && !still) {
        v.preload = 'auto'
        void v.play().catch(() => {})
      } else v.pause()
    }
  },
  { rootMargin: '200px' },
)
document.querySelectorAll<HTMLVideoElement>('video[data-lazy]').forEach((v) => lazy.observe(v))

// ---------------------------------------------------------------- confetti for the Dance Jam: each piece its own color, spot and speed
const COLORS = ['#ffd166', '#ff7b6e', '#6fb6ff', '#8be28b', '#c79bff', '#fff']
document.querySelectorAll<HTMLElement>('.sx-confetti i').forEach((c, i) => {
  c.style.setProperty('--x', `${(i * 37) % 100}vw`)
  c.style.setProperty('--d', String(20 + ((i * 53) % 60)))
  c.style.setProperty('--r', String(((i * 71) % 2 ? 1 : -1) * (200 + ((i * 29) % 400))))
  c.style.setProperty('--c', COLORS[i % COLORS.length])
})

// ---------------------------------------------------------------- the Dance Jam, on the game's own clock
const count = document.querySelector<HTMLElement>('.jam-count')
const tickJam = () => {
  if (!count) return
  const j = jamState()
  const left = Math.max(0, Math.ceil(((j.on ? j.end : j.next) - Date.now()) / 1000))
  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
  count.textContent = j.on ? `A Dance Jam is on right now: ${mmss} left` : `Next Dance Jam in ${mmss}`
}
tickJam()
setInterval(tickJam, 1000)

// ---------------------------------------------------------------- the last Play button leans toward the cursor
const magnet = document.querySelector<HTMLElement>('.sx-magnet')
if (magnet && !still && matchMedia('(pointer: fine)').matches)
  addEventListener('pointermove', (e) => {
    const r = magnet.getBoundingClientRect()
    const dx = e.clientX - (r.left + r.width / 2)
    const dy = e.clientY - (r.top + r.height / 2)
    const near = Math.hypot(dx, dy) < 220
    magnet.style.translate = near ? `${dx * 0.18}px ${dy * 0.25}px` : '0 0'
  })

trailerDialog()
if (still) look({ ...FULL, bright: 0.42 })
clip(scenes[0]?.clip ?? '')
