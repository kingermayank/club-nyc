import './lifeRing.css'
import { sfx } from '../../audio'
import { bump } from '../../state'
import { el } from '../../engine/stage'
import { world } from '../../engine/world'
import type { Game } from '../../types'
import type { Pt } from '../../geometry'
import { closeX, cutoutImg, hint, openMoment, pick, pointer, shout, sparks } from './kit'

/**
 * The Life Ring, Battery Park: a slingshot. Grab the ring off the railing, pull it back and let go: it sails out over
 * the harbor on its rope. Things are adrift out there (a buoy, a rubber duck, a beach ball) and they keep drifting,
 * so lead them. Land the ring over one and you haul it in. Five rings a round.
 * Pull straight back as far as it goes, dead on the statue, and the ring keeps going. Keys: arrows aim, hold Space.
 */

const NEAR = 214 // the water's nearest and farthest rows a ring can land in (stage y)
const FAR = 158
const ROUND = 5
const FLOATS = [
  // a channel buoy, a rubber duck, a beach ball
  `<svg viewBox="0 0 40 46"><path d="M12 34 L16 10 L24 10 L28 34 Z" fill="#f2792b" stroke="#1d2140" stroke-width="3" stroke-linejoin="round"/><path d="M14.5 22 L25.5 22 L26.8 29 L13.2 29 Z" fill="#fff"/><circle cx="20" cy="7" r="4" fill="#ffd166" stroke="#1d2140" stroke-width="2.5"/><ellipse cx="20" cy="36" rx="13" ry="5" fill="#d8402f" stroke="#1d2140" stroke-width="3"/></svg>`,
  `<svg viewBox="0 0 40 46"><ellipse cx="19" cy="31" rx="14" ry="9" fill="#ffd23f" stroke="#1d2140" stroke-width="3"/><circle cx="26" cy="18" r="8.5" fill="#ffd23f" stroke="#1d2140" stroke-width="3"/><path d="M33 17 L39 19 L33 22 Z" fill="#f2792b" stroke="#1d2140" stroke-width="2" stroke-linejoin="round"/><circle cx="28" cy="16" r="1.8" fill="#1d2140"/></svg>`,
  `<svg viewBox="0 0 40 46"><circle cx="20" cy="26" r="14" fill="#fff" stroke="#1d2140" stroke-width="3"/><path d="M20 12 A14 14 0 0 1 32 19 L20 26 Z" fill="#e5483b"/><path d="M8 19 A14 14 0 0 1 20 12 L20 26 Z" fill="#2a7bd5"/><path d="M20 26 L32 33 A14 14 0 0 1 20 40 Z" fill="#ffd166"/><circle cx="20" cy="26" r="14" fill="none" stroke="#1d2140" stroke-width="3"/></svg>`,
]
const RING = `<svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="15" fill="none" stroke="#1d2140" stroke-width="13"/><circle cx="22" cy="22" r="15" fill="none" stroke="#fff" stroke-width="8"/><circle cx="22" cy="22" r="15" fill="none" stroke="#e5483b" stroke-width="8" stroke-dasharray="11.78 11.78" transform="rotate(22 22 22)"/></svg>`

interface Float { n: HTMLElement; x: number; d: number; vx: number; ph: number; gone: boolean }

export function tossTheRing(g: Game) {
  const c = world.geo?.cutouts.lifebuoy
  if (!c) return
  const origin: Pt = [c.rect[0] + c.rect[2] * 0.36, c.rect[1] + c.rect[3] * 0.42]
  const lady = world.geo?.cutouts.statue?.rect
  const ladyX = lady ? lady[0] + lady[2] * 0.5 : 521
  const ladyImg = cutoutImg('statue')

  const m = openMoment('mo-ring')
  const rope = el('div', 'lr-rope', '<svg width="1000" height="565"><path fill="none" stroke="#1d2140" stroke-width="5" stroke-linecap="round"/><path fill="none" stroke="#e8c36a" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="5 4"/></svg>')
  const ropes = [...rope.querySelectorAll('path')]
  const ring = el('div', 'lr-ring', RING)
  const dots = Array.from({ length: 5 }, () => el('i', 'lr-dot'))
  const pips = el('div', 'lr-pips', Array.from({ length: ROUND }, () => `<i>${RING}</i>`).join(''))
  pips.style.cssText = `left:${origin[0]}px;top:${c.rect[1] + c.rect[3] + 12}px`
  pips.append(closeX(m))
  m.root.append(rope, ...dots, ring, pips)
  const tip = hint(m, 'Pull back, let go!', [origin[0], origin[1] - 40])

  const floats: Float[] = []
  const yOf = (d: number) => NEAR + (FAR - NEAR) * d
  const sOf = (d: number) => 1 - d * 0.5
  function spawn(d: number) {
    const n = el('div', 'lr-float', pick(FLOATS))
    m.root.append(n)
    floats.push({ n, d, x: 130 + Math.random() * 420, vx: (Math.random() < 0.5 ? -1 : 1) * (7 + Math.random() * 12 + d * 6), ph: Math.random() * 6, gone: false })
  }
  ;[0.22, 0.52, 0.82].forEach(spawn)

  let pull: Pt | null = null // where the hand is, while dragging
  let power = 0
  let aim = 0 // keyboard aim, px sideways
  let charging = false
  let flight: { t: number; dur: number; to: Pt; d: number; liberty: boolean } | null = null
  let haul: { t: number; from: Pt; s: number; got: Float | null } | null = null
  let at: Pt = [...origin] as Pt
  let scale = 1
  let thrown = 0
  let ringers = 0
  let hung = false // a ring is on the statue

  /** where a throw would come down, from how the ring is held */
  const landing = (hand: Pt): { to: Pt; d: number } => {
    const back = Math.max(0, hand[1] - origin[1])
    const d = Math.min(1, back / 105)
    return { to: [Math.max(96, Math.min(574, origin[0] + (origin[0] - hand[0]) * 2.7)), yOf(d)], d }
  }
  const arc = (from: Pt, to: Pt, k: number, lift: number): Pt => [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k - 4 * lift * k * (1 - k)]

  function release(hand: Pt) {
    const { to, d } = landing(hand)
    for (const n of dots) n.style.opacity = '0'
    if (d < 0.1 || thrown >= ROUND) {
      at = [...origin] as Pt
      return
    }
    tip.remove()
    thrown++
    pips.children[ROUND - thrown]?.classList.add('used')
    sfx.whoosh()
    g.emote('cheer', 0.8)
    const liberty = !hung && d >= 0.97 && Math.abs(to[0] - ladyX) < 13 && !!lady
    flight = { t: 0, dur: 0.75 + d * 0.45, to: liberty ? [lady![0] + lady![2] * 0.3, lady![1] + 10] : to, d: liberty ? 1.25 : d, liberty }
    at = hand
  }

  function splash(p: Pt, s: number) {
    for (let i = 0; i < 8; i++) {
      const n = el('i', 'lr-drop')
      n.style.cssText = `left:${p[0]}px;top:${p[1]}px;--dx:${((i - 3.5) * 7 + (Math.random() - 0.5) * 6) * s}px;--dy:${(-18 - Math.random() * 22) * s}px`
      m.root.append(n)
      setTimeout(() => n.remove(), 650)
    }
  }

  function land(f: NonNullable<typeof flight>) {
    if (f.liberty) {
      hung = true
      const keep = el('div', 'lr-ring lr-hung', RING)
      keep.style.transform = `translate(${f.to[0]}px, ${f.to[1]}px) scale(0.3)`
      m.root.append(keep)
      ladyImg?.classList.add('lr-wobble')
      sfx.chime()
      sparks(m, f.to, 14, '#fff2a8')
      shout(m, '!!!', [f.to[0], f.to[1] + 50], 'gold')
      g.confetti(40)
      g.stamp('ring-liberty')
      g.say('She’s had worse. She’s fine.')
      at = [...origin] as Pt
      scale = 1
      return next()
    }
    const s = sOf(f.d)
    const got = floats.find((o) => !o.gone && Math.abs(o.d - f.d) < 0.085 && Math.abs(o.x - f.to[0]) < 19 * sOf(o.d) + 3) ?? null
    splash(f.to, s + 0.3)
    if (got) {
      ringers++
      bump('ring-saves')
      sfx.ding()
      sparks(m, [got.x, yOf(got.d) - 12], 10)
      shout(m, String(ringers), [got.x, yOf(got.d) - 40], 'gold')
      g.stamp('ring-toss')
    } else sfx.pop()
    haul = { t: 0, from: f.to, s, got }
  }

  function next() {
    if (thrown < ROUND) return
    // the round is over: the score is the pips, then a fresh five
    if (ringers === ROUND) {
      g.confetti(60)
      g.stamp('harbor-hero')
    }
    g.say(ringers === ROUND ? 'Five for five. Coast Guard, call me.' : ringers ? pick(['The harbor is slightly tidier.', 'Saved a duck. It was rubber.']) : pick(['The harbor is safe from me.', 'Zero. The fish are laughing.']))
    m.later(() => {
      thrown = 0
      ringers = 0
      for (const p of pips.children) p.classList.remove('used')
    }, 2200)
  }

  m.frame((dt, t) => {
    // adrift
    for (const o of floats) {
      if (o.gone) continue
      o.x += o.vx * dt
      if (o.x < 110 || o.x > 566) o.vx = -o.vx
      const bob = Math.sin(t * 2.2 + o.ph)
      o.n.style.transform = `translate(${o.x}px, ${yOf(o.d) + bob * 2.5}px) translate(-50%, -82%) scale(${sOf(o.d)}) rotate(${bob * 7}deg)`
    }
    if (charging) {
      power = Math.min(1, power + dt * 0.8)
      pull = [origin[0] - aim / 2.7, origin[1] + power * 105]
    }
    if (flight) {
      const f = flight
      f.t += dt / f.dur
      const k = Math.min(1, f.t)
      const from: Pt = [origin[0], origin[1] - 6]
      at = arc(from, f.to, k, 70 + f.d * 60)
      scale = 1 - k * (1 - sOf(Math.min(1.12, f.d)))
      if (k >= 1) {
        flight = null
        land(f)
      }
    } else if (haul) {
      const h = haul
      h.t += dt / 0.8
      const k = Math.min(1, h.t)
      const e = k * k
      at = [h.from[0] + (origin[0] - h.from[0]) * e, h.from[1] + (origin[1] - h.from[1]) * e - Math.sin(k * Math.PI) * 8]
      scale = h.s + (1 - h.s) * e
      if (h.got) {
        h.got.gone = true
        h.got.n.style.transform = `translate(${at[0]}px, ${at[1]}px) translate(-50%, -82%) scale(${scale})`
      }
      if (k >= 1) {
        haul = null
        if (h.got) {
          const o = h.got
          sfx.pop()
          sparks(m, origin, 8)
          o.n.remove()
          floats.splice(floats.indexOf(o), 1)
          m.later(() => spawn(o.d < 0.4 ? 0.2 + Math.random() * 0.15 : o.d < 0.7 ? 0.45 + Math.random() * 0.15 : 0.75 + Math.random() * 0.15), 500)
        }
        at = [...origin] as Pt
        next()
      }
    } else if (pull) {
      at = pull
      scale = 1
      const { to, d } = landing(pull)
      dots.forEach((n, i) => {
        const p = arc([origin[0], origin[1] - 6], to, (i + 1) * 0.09, 70 + d * 60)
        n.style.transform = `translate(${p[0]}px, ${p[1]}px) scale(${1 - i * 0.12})`
        n.style.opacity = d < 0.1 ? '0' : '1'
      })
    }
    const idle = !flight && !haul && !pull
    ring.style.opacity = idle ? '0' : '1'
    ring.style.transform = `translate(${at[0]}px, ${at[1]}px) scale(${scale}) rotate(${flight ? flight.t * 500 : 0}deg)`
    // the rope sags from the railing to the ring
    const mid: Pt = [(origin[0] + at[0]) / 2, Math.max(origin[1], at[1]) + (idle ? 0 : 10)]
    const dPath = idle ? '' : `M${origin[0]} ${origin[1]} Q${mid[0]} ${mid[1]} ${at[0]} ${at[1]}`
    for (const p of ropes) p.setAttribute('d', dPath)
  })

  const busy = () => !!flight || !!haul || thrown >= ROUND
  m.root.addEventListener('pointerdown', (e) => {
    const p = pointer(e)
    if (Math.hypot(p[0] - origin[0], p[1] - origin[1]) > 62) {
      if (e.target === m.root) m.close()
      return
    }
    if (busy()) return
    pull = p
    m.root.setPointerCapture(e.pointerId)
    m.root.classList.add('pulling')
  })
  m.root.addEventListener('pointermove', (e) => {
    if (!pull || charging) return
    const p = pointer(e)
    // the rope only stretches so far
    const dx = p[0] - origin[0]
    const dy = Math.max(0, p[1] - origin[1])
    const len = Math.hypot(dx, dy)
    const k = len > 125 ? 125 / len : 1
    pull = [origin[0] + dx * k, origin[1] + Math.min(105, dy * k)]
  })
  const drop = () => {
    if (!pull || charging) return
    const hand = pull
    pull = null
    m.root.classList.remove('pulling')
    release(hand)
  }
  m.root.addEventListener('pointerup', drop)
  m.root.addEventListener('pointercancel', drop)

  m.onKey((e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      aim = Math.max(-200, Math.min(200, aim + (e.key === 'ArrowLeft' ? -12 : 12)))
      if (!charging && !busy()) {
        pull = [origin[0] - aim / 2.7, origin[1] + 40]
        m.later(() => !charging && (pull = null, dots.forEach((n) => (n.style.opacity = '0'))), 900)
      }
      return true
    }
    if (e.key !== ' ' && e.key !== 'Enter') return
    if (!e.repeat && !busy() && !charging) {
      charging = true
      power = 0.1
    }
    return true
  })
  const up = (e: KeyboardEvent) => {
    if ((e.key !== ' ' && e.key !== 'Enter') || !charging || !pull) return
    charging = false
    const hand = pull
    pull = null
    release(hand)
  }
  window.addEventListener('keyup', up, true)
  m.onClose(() => {
    window.removeEventListener('keyup', up, true)
    ladyImg?.classList.remove('lr-wobble')
  })
}
