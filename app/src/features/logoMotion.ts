/**
 * The Club NYC logo, alive. The flat logo is cut into layers by tools/logo_layers.py (public/art/ui/logo): the navy
 * sticker, seven letters, the Empire State Building behind them, the taxi in front, three sparkles. Stacked at rest
 * they are the logo exactly; this module moves them.
 *
 *   intro    the logo builds itself: sticker pops, CLUB drops in, NYC bounces up, the tower grows from behind,
 *            the taxi drives in and brakes, the sparkles twinkle on (about 1.5 s)
 *   idle     now and then one sparkle twinkles; every so often the taxi's engine jiggles
 *   hover    the letters do a wave, a shine sweeps across
 *   click    taxi: honk and hop · tower: a sway · letter: a jelly squash · sparkle: a spin
 *
 * Plain DOM + the Web Animations API, so the landing page, the game and the lab can all use it.
 * prefers-reduced-motion: no intro or idle motion, the logo just fades in; clicks still give a small, quiet response.
 */

type Box = { id: string; x: number; y: number; w: number; h: number }
type Meta = { width: number; height: number; layers: Box[]; pivots: { tower: [number, number]; taxi: [number, number] } }

export interface LogoOptions {
  /** play the build-up when it appears (default true) */
  intro?: boolean
  /** the occasional twinkle and engine jiggle (default true) */
  idle?: boolean
  /** hover wave and click reactions (default true) */
  interactive?: boolean
  /** sounds on click: the taxi's honk. Never on load (default false) */
  sound?: boolean
  /** ms to wait before the intro starts (default 0) */
  delay?: number
}

export interface LogoHandle {
  el: HTMLElement
  ready: Promise<void>
  intro(): Promise<void>
  wave(): void
  honk(): void
  sway(): void
  twinkle(which?: string): void
  destroy(): void
}

const BASE = '/art/ui/logo/'
const OUT = 'cubic-bezier(.16, 1, .3, 1)'
const CLUB = ['c1', 'l', 'u', 'b']
const NYC = ['n', 'y', 'c2']
const LETTERS = [...CLUB, ...NYC]
const STARS = ['star-top', 'star-right', 'star-left']

let metaP: Promise<Meta> | null = null
const loadMeta = () => (metaP ??= fetch(BASE + 'layers.json').then((r) => r.json() as Promise<Meta>))

let styled = false
function style() {
  if (styled) return
  styled = true
  const s = document.createElement('style')
  s.textContent = `
.club-logo { position: relative; display: block; width: 100%; aspect-ratio: var(--ar); user-select: none; -webkit-user-select: none; -webkit-tap-highlight-color: transparent; }
.club-logo > img, .club-logo > i { position: absolute; display: block; pointer-events: none; will-change: transform; }
.club-logo > img.flat { inset: 0; width: 100%; height: 100%; }
.club-logo.live > img.flat { visibility: hidden; }
.club-logo:not(.live) > img:not(.flat) { visibility: hidden; }
.club-logo.interactive > img[data-hit] { pointer-events: auto; cursor: pointer; }
/* the shine: a soft diagonal band, clipped to the logo's own shape */
.club-logo > i.shine { inset: 0; -webkit-mask: var(--mask) center / 100% 100% no-repeat; mask: var(--mask) center / 100% 100% no-repeat;
  background: linear-gradient(105deg, transparent 35%, rgba(255,255,255,.55) 47%, rgba(255,255,255,.8) 50%, rgba(255,255,255,.55) 53%, transparent 65%) no-repeat;
  background-size: 250% 100%; background-position: 130% 0; mix-blend-mode: soft-light; opacity: 0; }
.club-logo > b.honk { position: absolute; pointer-events: none; font: 700 clamp(10px, 3.2cqw, 26px)/1 Burbank, 'Arial Rounded MT Bold', sans-serif; color: #1d2140;
  background: #fffdf6; border: 2px solid #1d2140; border-radius: 999px; padding: .3em .55em .25em; white-space: nowrap; opacity: 0; }
.club-logo { container-type: inline-size; }
`
  document.head.appendChild(s)
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Build the animated logo. Append `handle.el` wherever the logo goes; it fills its container's width. */
export function createLogo(opts: LogoOptions = {}): LogoHandle {
  const o = { intro: true, idle: true, interactive: true, sound: false, delay: 0, ...opts }
  style()
  const el = document.createElement('div')
  el.className = 'club-logo'
  el.setAttribute('role', 'img')
  el.setAttribute('aria-label', 'Club NYC')
  el.style.setProperty('--ar', '1145 / 772')
  el.style.setProperty('--mask', `url(${BASE}full.webp)`)
  // the flat logo shows straight away (and stays, if the layers never load)
  const flat = document.createElement('img')
  flat.className = 'flat'
  flat.src = BASE + 'full.webp'
  flat.alt = ''
  flat.decoding = 'async'
  el.appendChild(flat)

  const parts: Record<string, HTMLImageElement> = {}
  const timers: number[] = []
  let destroyed = false
  let busy = false

  const ready = loadMeta().then(async (meta) => {
    el.style.setProperty('--ar', `${meta.width} / ${meta.height}`)
    const imgs = meta.layers.map((L) => {
      const img = document.createElement('img')
      img.src = BASE + L.id + '.webp'
      img.alt = ''
      img.draggable = false
      img.dataset.id = L.id
      Object.assign(img.style, { left: L.x + '%', top: L.y + '%', width: L.w + '%', height: L.h + '%' })
      // every part springs from its own middle-bottom, except the two that hinge: the tower on its base, the taxi on its rear wheel
      const [px, py] = L.id === 'tower' ? meta.pivots.tower : L.id === 'taxi' ? meta.pivots.taxi : [L.x + L.w / 2, L.y + L.h * (STARS.includes(L.id) ? 0.5 : 0.9)]
      img.style.transformOrigin = `${((px - L.x) / L.w) * 100}% ${((py - L.y) / L.h) * 100}%`
      if (L.id === 'taxi' || L.id === 'tower' || LETTERS.includes(L.id) || STARS.includes(L.id)) img.dataset.hit = L.id
      parts[L.id] = img
      el.appendChild(img)
      return img.decode().catch(() => undefined)
    })
    const shine = document.createElement('i')
    shine.className = 'shine'
    el.appendChild(shine)
    parts.shine = shine as unknown as HTMLImageElement
    await Promise.all(imgs)
  })

  const anim = (id: string, frames: Keyframe[], opt: KeyframeAnimationOptions) => parts[id]?.animate(frames, { fill: 'none', ...opt })

  async function intro() {
    await ready
    if (destroyed) return
    el.classList.add('live')
    if (reduced()) {
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' })
      return
    }
    busy = true
    const hidden = { fill: 'backwards' as FillMode }
    anim('sticker', [{ transform: 'scale(.55)', opacity: 0 }, { transform: 'scale(1.05)', opacity: 1, offset: 0.6 }, { transform: 'scale(1)' }], { duration: 420, easing: OUT, ...hidden })
    CLUB.forEach((id, i) =>
      anim(id, [
        { transform: 'translateY(-90%) scale(.9, 1.15)', opacity: 0 },
        { transform: 'translateY(4%) scale(1.12, .86)', opacity: 1, offset: 0.62 },
        { transform: 'translateY(-3%) scale(.97, 1.04)', offset: 0.82 },
        { transform: 'none' },
      ], { duration: 460, delay: 140 + i * 60, easing: 'ease-out', ...hidden }),
    )
    NYC.forEach((id, i) =>
      anim(id, [
        { transform: 'translateY(30%) scale(.2)', opacity: 0 },
        { transform: 'translateY(-6%) scale(1.14)', opacity: 1, offset: 0.55 },
        { transform: 'translateY(1%) scale(.96)', offset: 0.8 },
        { transform: 'none' },
      ], { duration: 520, delay: 330 + i * 75 + (id === 'c2' ? 160 : 0), easing: 'ease-out', ...hidden }),
    )
    anim('tower', [
      { transform: 'scaleY(.15) rotate(-8deg)', opacity: 0 },
      { transform: 'scaleY(1.08) rotate(2deg)', opacity: 1, offset: 0.6 },
      { transform: 'scaleY(.98) rotate(-1deg)', offset: 0.82 },
      { transform: 'none' },
    ], { duration: 620, delay: 430, easing: 'ease-out', ...hidden })
    // the taxi drives in from off the right, brakes (nose dips, it rocks back) and settles; the C pops just as it lands
    anim('taxi', [
      { transform: 'translateX(140%) rotate(0deg)', opacity: 0 },
      { transform: 'translateX(60%) rotate(0deg)', opacity: 1, offset: 0.25 },
      { transform: 'translateX(-5%) rotate(5deg)', offset: 0.7 },
      { transform: 'translateX(1%) rotate(-2deg)', offset: 0.86 },
      { transform: 'none' },
    ], { duration: 640, delay: 560, easing: 'cubic-bezier(.3,.7,.4,1)', ...hidden })
    STARS.forEach((id, i) =>
      anim(id, [
        { transform: 'scale(0) rotate(-120deg)', opacity: 0 },
        { transform: 'scale(1.35) rotate(15deg)', opacity: 1, offset: 0.6 },
        { transform: 'none' },
      ], { duration: 420, delay: 980 + i * 110, easing: OUT, ...hidden }),
    )
    await wait(1450)
    shineSweep(900)
    busy = false
  }

  function shineSweep(duration = 800) {
    if (reduced()) return
    parts.shine?.animate(
      [{ backgroundPosition: '130% 0', opacity: 1 }, { backgroundPosition: '-30% 0', opacity: 1 }],
      { duration, easing: 'ease-in-out' },
    )
  }

  function wave() {
    if (busy || reduced()) return
    LETTERS.forEach((id, i) =>
      anim(id, [
        { transform: 'none' },
        { transform: 'translateY(-7%) scale(1.03, .98)', offset: 0.4 },
        { transform: 'translateY(1.5%) scale(1.04, .95)', offset: 0.72 },
        { transform: 'none' },
      ], { duration: 420, delay: i * 55, easing: 'ease-in-out' }),
    )
    shineSweep(750)
    twinkle()
  }

  let honkBubble: HTMLElement | null = null
  function honk() {
    if (o.sound) void import('../audio').then((a) => a.sfx.honk())
    const small = reduced()
    anim('taxi', small
      ? [{ transform: 'none' }, { transform: 'translateY(-3%)' }, { transform: 'none' }]
      : [
          { transform: 'none' },
          { transform: 'translateY(-10%) rotate(-4deg) scale(1.03, .97)', offset: 0.2 },
          { transform: 'translateY(0) scale(1.06, .92)', offset: 0.38 },
          { transform: 'translateY(-6%) rotate(-2deg)', offset: 0.58 },
          { transform: 'translateY(0) scale(1.03, .96)', offset: 0.76 },
          { transform: 'none' },
        ], { duration: small ? 200 : 720, easing: 'ease-out' })
    // a HONK! sticker pops off the taxi's roof
    honkBubble?.remove()
    const t = parts.taxi
    if (!t) return
    const b = document.createElement('b')
    b.className = 'honk'
    b.textContent = 'HONK!'
    b.style.left = `calc(${t.style.left} + ${parseFloat(t.style.width) * 0.45}%)`
    b.style.top = `calc(${t.style.top} - 17%)`
    el.appendChild(b)
    honkBubble = b
    b.animate(
      [
        { opacity: 0, transform: 'translate(-50%, 20%) scale(.4) rotate(-8deg)' },
        { opacity: 1, transform: 'translate(-50%, -20%) scale(1.1) rotate(4deg)', offset: 0.25 },
        { opacity: 1, transform: 'translate(-50%, -40%) scale(1) rotate(-3deg)', offset: 0.75 },
        { opacity: 0, transform: 'translate(-50%, -70%) scale(.9) rotate(0deg)' },
      ],
      { duration: small ? 700 : 1100, easing: 'ease-out', fill: 'forwards' },
    ).finished.then(() => b.remove(), () => b.remove())
  }

  function sway() {
    if (reduced()) return
    anim('tower', [
      { transform: 'none' },
      { transform: 'rotate(-6deg)', offset: 0.25 },
      { transform: 'rotate(4deg)', offset: 0.5 },
      { transform: 'rotate(-2deg)', offset: 0.75 },
      { transform: 'none' },
    ], { duration: 900, easing: 'ease-in-out' })
  }

  function jelly(id: string) {
    if (reduced()) return
    anim(id, [
      { transform: 'none' },
      { transform: 'scale(1.18, .82)', offset: 0.2 },
      { transform: 'scale(.9, 1.12)', offset: 0.45 },
      { transform: 'scale(1.05, .96)', offset: 0.7 },
      { transform: 'none' },
    ], { duration: 560, easing: 'ease-out' })
  }

  function twinkle(which?: string) {
    if (reduced()) return
    const ids = which ? [which] : STARS
    ids.forEach((id, i) =>
      anim(id, [
        { transform: 'none', filter: 'brightness(1)' },
        { transform: 'scale(1.35) rotate(45deg)', filter: 'brightness(1.35)', offset: 0.45 },
        { transform: 'none', filter: 'brightness(1)' },
      ], { duration: which ? 520 : 600, delay: which ? 0 : i * 90, easing: 'ease-in-out' }),
    )
  }

  function spin(id: string) {
    if (reduced()) return
    anim(id, [{ transform: 'none' }, { transform: 'scale(1.5) rotate(200deg)', offset: 0.5 }, { transform: 'rotate(360deg)' }], { duration: 650, easing: 'ease-in-out' })
  }

  // ---- idle: a twinkle every few seconds, an engine jiggle now and then (paused while the tab is hidden)
  function idleLoop() {
    if (destroyed || !o.idle) return
    const next = 2600 + Math.random() * 2600
    timers.push(window.setTimeout(() => {
      if (!document.hidden && !busy && !reduced()) {
        if (Math.random() < 0.25) {
          anim('taxi', [{ transform: 'none' }, { transform: 'translateY(-2%)' }, { transform: 'none' }, { transform: 'translateY(-1.5%)' }, { transform: 'none' }], { duration: 420, easing: 'linear' })
        } else twinkle(STARS[Math.floor(Math.random() * STARS.length)])
      }
      idleLoop()
    }, next))
  }

  // ---- interaction
  if (o.interactive) {
    el.classList.add('interactive')
    const canHover = matchMedia('(hover: hover)').matches
    let lastWave = 0
    if (canHover)
      el.addEventListener('pointerenter', () => {
        if (performance.now() - lastWave < 1600) return
        lastWave = performance.now()
        wave()
      })
    el.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).dataset?.hit
      if (!id) return
      e.preventDefault()
      if (id === 'taxi') honk()
      else if (id === 'tower') sway()
      else if (STARS.includes(id)) spin(id)
      else jelly(id)
    })
  }

  void ready.then(async () => {
    if (o.delay) await wait(o.delay)
    if (o.intro) await intro()
    else el.classList.add('live')
    idleLoop()
  })

  return {
    el,
    ready,
    intro,
    wave,
    honk,
    sway,
    twinkle,
    destroy() {
      destroyed = true
      timers.forEach(clearTimeout)
      el.getAnimations({ subtree: true }).forEach((a) => a.cancel())
      el.remove()
    },
  }
}
