import './blimp.css'
import { sfx } from '../../audio'
import { el } from '../../engine/stage'
import { save } from '../../state'
import { world } from '../../engine/world'
import type { Game } from '../../types'
import type { Pt } from '../../geometry'
import { closeX, cutoutImg, hint, openMoment, pick, pointer, shout, sparks } from './kit'

/**
 * The Blimp, Empire State deck: air mail. Pull back anywhere like a slingshot and let go: a paper plane leaves your
 * hand for the blimp. The windsock on the rail shows the gust for this throw (it changes every time) and two pigeons
 * patrol the sky in between. Land one and the blimp toots and drops a banner; three in a row makes an ace. The
 * Chrysler's needle is up there too, for anyone with terrible aim or a great one.
 */

const G = 560 // gravity, stage px / s^2
const K = 5.6 // launch speed per px of pull
const MAX_PULL = 130
const PLANE = `<svg viewBox="0 0 44 30"><path d="M2 13 L42 2 L26 28 L20 18 Z" fill="#fff" stroke="#1d2140" stroke-width="3" stroke-linejoin="round"/><path d="M42 2 L20 18 L18 27 L26 28" fill="#dfe6f3" stroke="#1d2140" stroke-width="3" stroke-linejoin="round"/></svg>`
const BIRD = `<svg viewBox="0 0 40 34"><path d="M8 20 C8 10 16 6 24 8 C26 3 34 3 34 10 L39 12 L34 14 C34 24 26 29 18 28 L3 31 Z" fill="#b4bccb" stroke="#1d2140" stroke-width="3" stroke-linejoin="round"/><path class="bl-wing" d="M11 17 C15 2 24 2 26 17 C22 22 15 22 11 17 Z" fill="#7d889e" stroke="#1d2140" stroke-width="2.5" stroke-linejoin="round"/><circle cx="30" cy="9" r="2" fill="#1d2140"/></svg>`

export function airMail(g: Game) {
  const c = world.geo?.cutouts.blimp
  if (!c) return
  const [bx, by, bw, bh] = c.rect
  const ch = world.geo?.cutouts.chrysler?.rect
  const needle: Pt | null = ch ? [ch[0] + ch[2] / 2, ch[1] + 4] : null
  const blimp = cutoutImg('blimp')
  const tower = cutoutImg('chrysler')
  const hand = (): Pt => [world.player.pos[0] + 14, world.player.pos[1] - 74]

  const m = openMoment('mo-blimp')
  const x = closeX(m)
  x.classList.add('bl-x')
  const band = el('div', 'bl-band')
  const plane = el('div', 'bl-plane', PLANE)
  const dots = Array.from({ length: 6 }, () => el('i', 'bl-dot'))
  const sock = el('div', 'bl-sock', '<i></i>')
  sock.style.cssText = 'left:497px;top:262px'
  const cone = sock.querySelector<HTMLElement>('i')!
  const lights = el('div', 'bl-lights', '<i></i><i></i><i></i>')
  lights.style.cssText = `left:${bx + bw / 2}px;top:${by + bh + 3}px`
  const birds = [
    { n: el('i', 'bl-bird', BIRD), x: 180, y: 206, v: 105 },
    { n: el('i', 'bl-bird', BIRD), x: 760, y: 136, v: -150 },
  ]
  m.root.append(sock, lights, ...birds.map((b) => b.n), band, ...dots, plane, x)
  let tip: HTMLElement | null = hint(m, 'Pull back, let go!', [hand()[0], hand()[1] - 62])

  let wind = 0
  let start: Pt | null = null
  let pull: Pt = [0, 0]
  let fly: null | { p: Pt; v: Pt; spin: number; down: boolean } = null
  let streak = 0

  const gust = () => {
    wind = (Math.random() < 0.5 ? -1 : 1) * (30 + Math.random() * 130)
    // the sock hangs limp in a breeze and stands straight out in a gust, pointing where the air is going
    const lift = 78 - (Math.abs(wind) / 160) * 70
    cone.style.transform = `scaleX(${wind < 0 ? -1 : 1}) rotate(${lift}deg)`
  }
  gust()

  const place = (p: Pt, rot: number) => {
    const s = 0.42 + 0.58 * Math.max(0, Math.min(1, (p[1] - 40) / (hand()[1] - 40)))
    plane.style.transform = `translate(${p[0]}px, ${p[1]}px) rotate(${rot}rad) scale(${s})`
  }
  const rest = () => {
    const h = hand()
    plane.classList.remove('gone')
    place(h, -0.5)
    band.style.opacity = '0'
    for (const o of dots) o.style.opacity = '0'
  }
  rest()

  const aimAt = (q: Pt) => {
    if (!start) return
    let dx = q[0] - start[0]
    let dy = q[1] - start[1]
    const len = Math.hypot(dx, dy)
    if (len > MAX_PULL) {
      dx *= MAX_PULL / len
      dy *= MAX_PULL / len
    }
    pull = [dx, dy]
    const h = hand()
    const at: Pt = [h[0] + dx * 0.45, h[1] + dy * 0.45]
    const v: Pt = [-dx * K, -dy * K]
    place(at, Math.atan2(v[1], v[0]))
    // the elastic from your hand to the plane
    const bl = Math.hypot(at[0] - h[0], at[1] - h[1])
    band.style.cssText = `opacity:${bl > 4 ? 1 : 0};left:${h[0]}px;top:${h[1]}px;width:${bl}px;transform:rotate(${Math.atan2(at[1] - h[1], at[0] - h[0])}rad)`
    // only the first stretch of the flight is drawn, and it knows nothing about the wind
    dots.forEach((o, i) => {
      const t = 0.07 + i * 0.065
      o.style.opacity = len > 18 ? String(1 - i * 0.09) : '0'
      o.style.transform = `translate(${h[0] + v[0] * t}px, ${h[1] + v[1] * t + 0.5 * G * t * t}px) scale(${1 - i * 0.07})`
    })
  }

  const launch = (v: Pt) => {
    tip?.remove()
    tip = null
    band.style.opacity = '0'
    for (const o of dots) o.style.opacity = '0'
    fly = { p: hand(), v, spin: 0, down: false }
    sfx.whoosh()
    g.emote('wave', 0.8)
  }

  m.root.addEventListener('pointerdown', (e) => {
    if (fly || e.target !== m.root) return
    start = pointer(e)
    tip?.remove()
    tip = null
    m.root.setPointerCapture(e.pointerId)
    aimAt(start)
  })
  m.root.addEventListener('pointermove', (e) => start && !fly && aimAt(pointer(e)))
  const let_go = () => {
    if (!start || fly) return
    start = null
    if (Math.hypot(pull[0], pull[1]) < 18) return rest()
    launch([-pull[0] * K, -pull[1] * K])
  }
  m.root.addEventListener('pointerup', let_go)
  m.root.addEventListener('pointercancel', let_go)
  // no mouse: Space or Enter throws for the blimp
  m.onKey((e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return
    if (fly) return true
    const h = hand()
    const T = 1.05 + Math.random() * 0.2
    // it leans into the wind, but only roughly
    const off = (Math.random() - 0.5) * 90
    launch([(bx + bw / 2 + off - h[0]) / T - 0.5 * wind * T, (by + bh / 2 - h[1]) / T - 0.5 * G * T])
    return true
  })

  const again = (n: HTMLElement | undefined, cls: string) => {
    if (!n) return
    n.classList.remove(cls)
    void n.offsetWidth
    n.classList.add(cls)
  }
  const setLights = () => [...lights.children].forEach((n, i) => n.classList.toggle('on', i < streak))

  function end(missed: boolean) {
    fly = null
    plane.classList.add('gone')
    if (missed) {
      streak = 0
      setLights()
    }
    gust()
    m.later(rest, 420)
  }

  function delivered(at: Pt) {
    streak++
    setLights()
    sfx.toot()
    sfx.coin()
    sparks(m, at, 10)
    again(blimp, 'bl-hit')
    g.stamp('air-mail')
    const flag = el('div', 'bl-banner', `<span>${streak >= 3 ? 'ACE!' : pick([`HI ${save.name.slice(0, 10).toUpperCase()}`, 'AIR MAIL', 'NICE ARM', 'GOT IT'])}</span>`)
    flag.style.cssText = `left:${bx + bw / 2}px;top:${by + bh + 12}px`
    m.root.append(flag)
    setTimeout(() => flag.remove(), 1900)
    if (streak >= 3) {
      g.confetti(40)
      g.emote('cheer', 2)
      g.stamp('air-ace')
      g.say('The FAA would like a word.')
      m.later(() => {
        streak = 0
        setLights()
      }, 1900)
    }
    end(false)
  }

  m.frame((dt) => {
    for (const b of birds) {
      b.x += b.v * dt
      if (b.x > 1050) b.x = -50
      if (b.x < -50) b.x = 1050
      b.n.style.transform = `translate(${b.x}px, ${b.y}px) scaleX(${b.v > 0 ? 1 : -1})`
    }
    if (!fly) return
    const f = fly
    f.v[0] += wind * dt
    f.v[1] += G * dt
    f.p = [f.p[0] + f.v[0] * dt, f.p[1] + f.v[1] * dt]
    if (f.down) f.spin += dt * 14
    place(f.p, f.down ? f.spin : Math.atan2(f.v[1], f.v[0]))
    if (!f.down) {
      if (f.p[0] > bx - 4 && f.p[0] < bx + bw + 4 && f.p[1] > by - 2 && f.p[1] < by + bh + 6) return delivered(f.p)
      if (needle && Math.hypot(f.p[0] - needle[0], f.p[1] - needle[1]) < 12) {
        f.down = true
        f.v = [f.v[0] * 0.2, 40]
        sfx.ding()
        sparks(m, needle, 12, '#fff')
        shout(m, 'DING', [needle[0], needle[1] + 44])
        again(tower, 'bl-wob')
        g.stamp('needle-threader')
      }
      for (const b of birds) {
        if (Math.hypot(f.p[0] - b.x, f.p[1] - b.y) > 24) continue
        f.down = true
        f.v = [b.v * 0.6, 30]
        sfx.coo()
        sparks(m, f.p, 7, '#c9ced9')
        again(b.n, 'hit')
      }
    }
    if (f.p[1] > hand()[1] + 30 || f.p[0] < -40 || f.p[0] > 1040 || (f.down && f.p[1] > 330)) end(true)
  })

  m.onClose(() => {
    blimp?.classList.remove('bl-hit')
    tower?.classList.remove('bl-wob')
  })
}
