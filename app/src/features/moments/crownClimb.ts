import './crownClimb.css'
import { sfx } from '../../audio'
import { save } from '../../state'
import { el } from '../../engine/stage'
import { world } from '../../engine/world'
import type { Game } from '../../types'
import { SKINS } from '../../avatar/look'
import { closeX, hint, openMoment, sparks } from './kit'

/**
 * Climb to the Crown, Liberty Island: the 354 steps, played. You are inside her, on the spiral stair. A ring closes
 * on the next landing in time with a tick; click (or Space) as it lands and you hop up half a turn, a note higher.
 * Too early and you stumble back a landing. The beat quickens toward the top. At the crown the windows open on the
 * harbor (the same view the old climb ended on). It needs its own stage: the room can't show the inside of a statue.
 */

const LANDINGS = 24
const STEPS = 354
const RISE = 64
const R = 118
const HIT = 0.115
const PERFECT = 0.05
const beatOf = (n: number) => Math.max(0.42, 0.66 - n * 0.011)

export function climbTheCrown(g: Game) {
  if (world.room.id !== 'liberty-island') return
  const m = openMoment('mo-crown')
  const skin = SKINS[save.look.skin] ?? SKINS[2]
  m.root.innerHTML = `<div class="cc-wall"></div><div class="cc-stone"></div>
    <div class="cc-world"><div class="cc-col"></div><div class="cc-top"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="cc-cue"><i></i></div>
      <div class="cc-me"><svg viewBox="0 0 40 60"><ellipse cx="20" cy="44" rx="11" ry="13" fill="#e5483b" stroke="#1d2140" stroke-width="3"/><rect x="12" y="52" width="7" height="7" rx="2" fill="#3b5fa8" stroke="#1d2140" stroke-width="2.5"/><rect x="21" y="52" width="7" height="7" rx="2" fill="#3b5fa8" stroke="#1d2140" stroke-width="2.5"/><circle cx="20" cy="19" r="14" fill="${skin}" stroke="#1d2140" stroke-width="3"/><path d="M6.500 17 A13.500 13.500 0 0 1 33.500 17 Q20 8 6.500 17 Z" fill="#6b3d1e" stroke="#1d2140" stroke-width="2.500" stroke-linejoin="round"/><circle cx="15" cy="21" r="2" fill="#1d2140"/><circle cx="25" cy="21" r="2" fill="#1d2140"/></svg></div>
    </div>
    <div class="cc-meter"><img src="/art/cutouts/liberty-island/statue.png" alt="" draggable="false"><i></i></div>
    <div class="cc-count"><b>0</b></div><div class="cc-flash"></div>`
  const q = <T extends HTMLElement>(s: string) => m.root.querySelector<T>(s)!
  const wall = q('.cc-wall')
  const stone = q('.cc-stone')
  const worldEl = q('.cc-world')
  const me = q('.cc-me')
  const cue = q('.cc-cue')
  const beatRing = q('.cc-cue i')
  const dot = q('.cc-meter i')
  const count = q('.cc-count b')
  q('.cc-count').append(closeX(m))
  q('.cc-top').style.top = `${-LANDINGS * RISE - 250}px`

  // the stair: four treads to a landing, wound round the column
  for (let k = 0; k <= LANDINGS * 4; k++) {
    const phi = -Math.PI / 2 + (k * Math.PI) / 4
    const d = Math.cos(phi)
    const t = el('i', 'cc-tread' + (k % 4 === 0 ? ' land' : d < -0.1 ? ' back' : ''))
    t.style.cssText = `left:${R * Math.sin(phi)}px;top:${(-k * RISE) / 4}px;z-index:${d < -0.1 ? 1 : 3};--w:${k % 4 === 0 ? 62 : 44 + d * 10}px`
    worldEl.append(t)
  }
  const tip = hint(m, 'Step on the beat!', [500, 250])

  const at = (n: number): [number, number, number] => {
    const phi = -Math.PI / 2 + n * Math.PI
    return [R * Math.sin(phi), -n * RISE, Math.cos(phi)]
  }
  let n = 0 // the landing you're on
  let pos = 0 // where you're drawn, in landings (eases to n)
  let cam = 0
  let tb = 1.1 // when the next beat lands
  let started = false
  let stumbles = 0
  let lapses = 0
  let wobble = 0
  let done = false
  let ticked = 0

  function step(now: number) {
    if (done) return
    const dlt = now - tb
    if (!started) {
      started = true
      tip.remove()
    }
    if (Math.abs(dlt) <= HIT) {
      n++
      sfx.piano(52 + Math.round(n * 1.2))
      const [x, y] = at(n)
      if (Math.abs(dlt) <= PERFECT) sparks(m, [500 + x * 1.35, 400 + (y + cam) * 1.35], 6)
      tb += beatOf(n)
      if (n >= LANDINGS) return top()
    } else {
      // off the beat: a stumble, and back down a landing
      stumbles++
      wobble = 0.35
      sfx.squawk()
      if (n > 0) n--
      count.parentElement!.classList.remove('bad')
      void count.offsetWidth
      count.parentElement!.classList.add('bad')
      if (dlt > 0) tb += beatOf(n)
    }
  }

  function top() {
    done = true
    sfx.chime()
    m.root.classList.add('top')
    g.confetti(30)
    m.later(() => {
      m.close()
      g.stamp('crown-climb')
      if (!stumbles && !lapses) g.stamp('crown-perfect')
      if (stumbles >= 8) g.stamp('jelly-legs')
      g.binoculars({ cx: 300, cy: 110, zoom: 3, labels: [
        { at: [300, 66], text: 'One World Trade' },
        { at: [262, 150], text: 'Lower Manhattan' },
        { at: [330, 182], text: 'Battery Park' },
      ] })
    }, 1500)
  }

  let now = 0
  m.frame((dt, t) => {
    now = t
    if (!done && t > tb + HIT) {
      // the beat went by
      if (started) lapses++
      tb += beatOf(n)
    }
    if (!done && t >= tb && ticked !== tb) {
      ticked = tb
      sfx.tick()
    }
    // ease along the stair to your landing
    const e = 1 - Math.exp(-14 * dt)
    pos += (n - pos) * e
    cam += (pos * RISE - cam) * (1 - Math.exp(-7 * dt))
    wobble = Math.max(0, wobble - dt)
    const phi = -Math.PI / 2 + pos * Math.PI
    const frac = Math.abs(pos - Math.round(pos))
    const hop = Math.sin(Math.min(1, frac * 2) * Math.PI * 0.5) * 16
    me.style.transform = `translate(${R * Math.sin(phi)}px, ${-pos * RISE - hop}px) rotate(${wobble ? Math.sin(t * 50) * 14 : 0}deg)`
    me.style.zIndex = String(Math.cos(phi) < -0.15 ? 1 : 5)
    worldEl.style.transform = `translate(500px, ${400 + cam * 1.35}px) scale(1.35)`
    wall.style.backgroundPositionY = `${cam * 0.6}px`
    stone.style.opacity = String(Math.max(0, 1 - pos / 7))
    stone.style.backgroundPositionY = `${cam * 0.6}px`
    // the ring closing on the next landing
    const [cx, cy] = at(Math.min(LANDINGS, n + 1))
    cue.style.transform = `translate(${cx}px, ${cy}px)`
    cue.style.display = done ? 'none' : ''
    const left = tb - t
    const T = beatOf(n)
    beatRing.style.transform = `scale(${1 + Math.max(-0.25, left / T) * 1.9})`
    beatRing.style.opacity = String(left < -HIT ? 0 : Math.min(1, 1.25 - left / T))
    cue.classList.toggle('now', Math.abs(left) <= HIT)
    dot.style.top = `${96 - (pos / LANDINGS) * 68}%`
    count.textContent = String(Math.round((Math.max(0, n) / LANDINGS) * STEPS))
  })

  m.root.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.mo-x')) return
    step(now)
  })
  m.onKey((e) => {
    if (e.key !== ' ' && e.key !== 'Enter' && e.key !== 'ArrowUp') return
    if (!e.repeat) step(now)
    return true
  })
}
