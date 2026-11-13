import './hydrant.css'
import { sfx } from '../../audio'
import { el, stage } from '../../engine/stage'
import { world } from '../../engine/world'
import type { Game } from '../../types'
import type { Pt } from '../../geometry'
import { clickAwayCloses, cutoutImg, hint, openMoment, pick, pointer, shout, sparks } from './kit'

/**
 * The Fire Hydrant, Fifth Avenue: you open it yourself. Grab the wrench and crank it round the cap (lefty loosey;
 * the wrong way tightens it again) while the pressure gauge climbs and the hydrant rattles. When it blows, the jet
 * follows your mouse until the pressure runs out: soak the neighbours (they jump), throw it high for a rainbow,
 * and there is a secret for whoever puts out the steaming manhole.
 */

const TURNS = 2.4 // full circles to open it
const TANK = 12 // seconds of water once it blows
const SVG = 'http://www.w3.org/2000/svg'
const LINES = ['July came early.', 'Con Ed is going to call.', 'Free car wash. You are welcome.', 'Nobody saw that. Walk away.']

export function openTheHydrant(g: Game) {
  const c = world.geo?.cutouts.hydrant
  if (!c) return
  const [hx, hy, hw, hh] = c.rect
  const nut: Pt = [hx + hw * 0.78, hy + hh * 0.6]
  const top: Pt = [hx + hw * 0.5, hy + hh * 0.16]
  const hyd = cutoutImg('hydrant')
  const man = world.geo?.cutouts.manhole
  const manhole: Pt | null = man ? [man.rect[0] + man.rect[2] / 2, man.rect[1] + man.rect[3] * 0.25] : null

  const m = openMoment('mo-hydrant')
  clickAwayCloses(m)

  // the water goes under the tools, so it is added first
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('class', 'hy-water')
  svg.setAttribute('viewBox', '0 0 1000 565')
  svg.innerHTML = '<path class="hy-w1"/><path class="hy-w2"/><path class="hy-w3"/>'
  const paths = [...svg.querySelectorAll('path')]
  const bow = el('div', 'hy-bow', '<i></i><i></i><i></i><i></i><i></i>')
  m.root.append(bow, svg as unknown as HTMLElement)

  const gauge = el('div', 'hy-gauge', '<i class="hy-red"></i><i class="hy-needle"></i><i class="hy-hub"></i>')
  gauge.style.cssText = `left:${hx - 26}px;top:${hy - 14}px`
  const needle = gauge.querySelector<HTMLElement>('.hy-needle')!
  const arrow = el('div', 'hy-arrow', '<svg viewBox="0 0 80 80"><path d="M62 24 A28 28 0 1 0 66 50" fill="none" stroke="#1d2140" stroke-width="11" stroke-linecap="round"/><path d="M62 24 A28 28 0 1 0 66 50" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round"/><path d="M57 46 L67 58 L76 44 Z" fill="#fff" stroke="#1d2140" stroke-width="3.5" stroke-linejoin="round"/></svg>')
  arrow.style.cssText = `left:${nut[0]}px;top:${nut[1]}px`
  const wrench = el('div', 'hy-wrench', '<svg viewBox="0 0 96 30"><path d="M26 9 H84 a6 6 0 0 1 0 12 H26 Z" fill="#c9ced9" stroke="#1d2140" stroke-width="3.5" stroke-linejoin="round"/><path d="M68 10 H86 a5 5 0 0 1 0 10 H68 Z" fill="#e5483b" stroke="#1d2140" stroke-width="3"/><path d="M15 2 a13 13 0 1 0 0 26 a13 13 0 0 0 9 -4 L16 20 H10 V10 H16 L24 6 a13 13 0 0 0 -9 -4 Z" fill="#e9edf5" stroke="#1d2140" stroke-width="3.5" stroke-linejoin="round"/></svg>')
  wrench.style.cssText = `left:${nut[0]}px;top:${nut[1]}px`
  const pad = el('div', 'hy-pad')
  pad.style.cssText = `left:${nut[0]}px;top:${nut[1]}px`
  m.root.append(arrow, gauge, wrench, pad)
  const tip = hint(m, 'Crank it open!', [hx + hw / 2, hy - 46])

  let p = 0 // 0..1 open
  let ang = -1.05 // where the wrench points (radians, 0 = right)
  let grab = false
  let last = 0
  let open = false
  let water = 1
  let over = false
  let aim: Pt = [hx - 210, hy + 70]
  let byHand = false // the mouse has aimed the jet (otherwise it sweeps the street by itself)
  let sinceDrop = 0
  let sinceTick = 0
  let high = 0
  let bowed = false
  let onSteam = 0
  let steamed = false
  const soaked = new Map<object, number>()
  const steam = [...stage.fx.querySelectorAll<HTMLElement>('.steam')]

  const draw = () => {
    wrench.style.transform = `rotate(${ang}rad)`
    needle.style.transform = `rotate(${-118 + (open ? water : p) * 236}deg)`
  }
  draw()

  const turn = (d: number) => {
    if (open) return
    ang += d
    // on screen, a falling angle is counter-clockwise: that is the way that opens it
    if (d < 0) p = Math.min(1, p + -d / (Math.PI * 2 * TURNS))
    else p = Math.max(0, p - d / (Math.PI * 2 * TURNS) * 0.6)
    sinceTick += Math.abs(d)
    if (sinceTick > 0.5) {
      sinceTick = 0
      if (d < 0) sfx.tick()
      else sfx.squawk()
    }
    if (p > 0.12 && tip.isConnected) tip.remove()
    if (p > 0.3) arrow.classList.add('gone')
    draw()
    if (p >= 1) burst()
  }

  const angleTo = (q: Pt) => Math.atan2(q[1] - nut[1], q[0] - nut[0])
  pad.onpointerdown = (e) => {
    if (open) return
    grab = true
    last = angleTo(pointer(e))
    pad.setPointerCapture(e.pointerId)
    pad.classList.add('held')
  }
  pad.onpointerup = pad.onpointercancel = () => {
    grab = false
    pad.classList.remove('held')
  }
  pad.onpointermove = (e) => {
    if (!grab || open) return
    const q = pointer(e)
    if (Math.hypot(q[0] - nut[0], q[1] - nut[1]) < 12) return
    const a = angleTo(q)
    let d = a - last
    if (d > Math.PI) d -= Math.PI * 2
    if (d < -Math.PI) d += Math.PI * 2
    last = a
    turn(d)
  }
  m.root.addEventListener('pointermove', (e) => {
    if (!open || over) return
    aim = pointer(e)
    byHand = true
  })
  // no mouse: Space or Enter cranks a notch, and the jet sweeps the street by itself
  m.onKey((e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return
    turn(-0.85)
    return true
  })

  function burst() {
    open = true
    grab = false
    tip.remove()
    arrow.remove()
    pad.remove()
    wrench.classList.add('fly')
    m.later(() => wrench.remove(), 700)
    sfx.whoosh()
    sfx.pop()
    sparks(m, top, 10, '#cfeeff')
    g.emote('cheer', 1.5)
    g.stamp('hydrant-open')
    m.root.classList.add('jet')
  }

  function drop(at: Pt, spread = 1) {
    const d = el('i', 'hy-drop')
    d.style.cssText = `left:${at[0]}px;top:${at[1]}px;--dx:${(Math.random() - 0.5) * 60 * spread}px;--dy:${-14 - Math.random() * 30 * spread}px`
    m.root.append(d)
    setTimeout(() => d.remove(), 600)
  }

  m.frame((dt, t) => {
    // it rattles harder the closer it is to blowing
    if (hyd) {
      const k = open ? (over ? 0 : 1.2) : p * 2.4
      hyd.style.transform = k ? `translate(${(Math.random() - 0.5) * k}px, ${(Math.random() - 0.5) * k}px)` : ''
    }
    if (!open) {
      // it creeps shut if you let go
      if (!grab && p > 0) {
        p = Math.max(0, p - dt * 0.035)
        draw()
      }
      sinceDrop += dt
      if (p > 0.3 && sinceDrop > 0.42 - p * 0.3) {
        sinceDrop = 0
        drop(top, 0.4)
      }
      return
    }
    if (over) return
    water = Math.max(0, water - dt / TANK)
    draw()
    if (!byHand) aim = [hx - 300 + Math.sin(t * 1.1) * 230, hy + 40 + Math.cos(t * 0.7) * 90]
    // where the jet comes down: it sags back toward the hydrant as the pressure goes
    const reach = Math.min(1, water / 0.14)
    const to: Pt = [
      top[0] + (Math.max(40, Math.min(960, aim[0])) - top[0]) * reach,
      top[1] + (Math.max(84, Math.min(498, aim[1])) - top[1]) * reach + (1 - reach) * 50,
    ]
    const dist = Math.hypot(to[0] - top[0], to[1] - top[1])
    const cx = (top[0] + to[0]) / 2
    const cy = Math.max(-40, Math.min(top[1], to[1]) - 50 - dist * 0.32)
    const d = `M${top[0]} ${top[1]} Q${cx} ${cy} ${to[0]} ${to[1]}`
    for (const pa of paths) pa.setAttribute('d', d)
    sinceDrop += dt
    if (sinceDrop > 0.05) {
      sinceDrop = 0
      drop(to)
    }

    // everyone it lands on jumps
    for (const a of [world.player, ...world.npcs]) {
      if (Math.abs(to[0] - a.pos[0]) > 30 || to[1] < a.pos[1] - 96 || to[1] > a.pos[1] + 14) continue
      if (t - (soaked.get(a) ?? -9) < 2.5) continue
      const first = !soaked.has(a)
      soaked.set(a, t)
      a.emote(a === world.player ? 'dance' : 'jump', 1.4)
      sfx.pop()
      if (first) {
        shout(m, String(soaked.size), [a.pos[0], a.pos[1] - 120], 'hy-num')
        if (soaked.size >= 3) g.stamp('block-party')
      }
    }
    // thrown high into the light: a rainbow
    if (to[1] < 250) high += dt
    if (high > 1.1 && !bowed) {
      bowed = true
      bow.classList.add('on')
      sfx.chime()
      g.stamp('rainbow-maker')
    }
    // the secret: put the manhole out
    if (manhole && !steamed && Math.hypot(to[0] - manhole[0], to[1] - manhole[1]) < 46) {
      onSteam += dt
      if (onSteam > 0.9) {
        steamed = true
        for (const s of steam) s.style.opacity = '0'
        sfx.whoosh()
        shout(m, 'TSSSS', [manhole[0], manhole[1] - 50])
        g.stamp('steam-cleaner')
      }
    }
    if (water <= 0) finish()
  })

  function finish() {
    over = true
    svg.classList.add('dry')
    m.root.classList.remove('jet')
    for (let i = 0; i < 5; i++) m.later(() => drop(top, 0.4), i * 160)
    g.say(pick(LINES))
    m.later(() => m.close(), 1500)
  }

  m.onClose(() => {
    if (hyd) hyd.style.transform = ''
    for (const s of steam) s.style.opacity = ''
  })
}
