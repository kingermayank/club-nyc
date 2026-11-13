import './lanterns.css'
import { sfx } from '../../audio'
import { el, stage } from '../../engine/stage'
import { bump, persist, save } from '../../state'
import type { Game } from '../../types'
import type { Pt } from '../../geometry'
import { closeX, hint, openMoment, pointer, shout, sparks } from './kit'

/**
 * Lanterns, Mott Street: dusk drops over the block and you carry a lit taper along the string. Hold the flame on a
 * lantern until it catches, then on to the next. Every few seconds a gust comes down the street and puffs some
 * out. All seven glowing at once before the taper burns down to your fingers and the whole street lights up.
 * Arrow keys walk the flame from lantern to lantern.
 */

/** the seven lanterns on the string, in stage px (painted into the room picture) */
const SPOTS: Pt[] = [[417, 18], [484, 50], [574, 44], [625, 26], [663, 42], [721, 58], [774, 58]]
const BURN = 26 // seconds of taper
const CATCH = 0.3 // seconds of flame before a lantern takes

export function lightTheLanterns(g: Game) {
  const m = openMoment('mo-lanterns')
  // dusk sits under the HUD, over the street and everyone on it
  const dusk = el('div', 'mln-dusk')
  stage.fx.append(dusk)
  m.onClose(() => dusk.remove())

  const lamps = SPOTS.map((p) => {
    const n = el('i', 'mln-lamp', '<b></b>')
    n.style.cssText = `left:${p[0]}px;top:${p[1]}px`
    m.root.append(n)
    return { p, n, heat: 0, lit: false }
  })
  const taper = el('div', 'mln-taper', '<i class="mln-stick"></i><i class="mln-flame"></i>')
  const x = closeX(m)
  x.classList.add('mln-x')
  x.style.cssText = 'left:806px;top:92px'
  m.root.append(taper, x)
  let tip: HTMLElement | null = hint(m, 'Light them all!', [596, 132])

  let at: Pt = [596, 150]
  let left = BURN
  let state: 'play' | 'won' | 'out' = 'play'
  let nextGust = 4.2
  let started = false
  let lastLit = -9
  let chain = 0
  let keyAt = -1
  const gusts: { x: number; dir: number; n: HTMLElement; hit: Set<number>; quota: number }[] = []

  function reset() {
    left = BURN
    state = 'play'
    nextGust = 3.6
    started = false
    chain = 0
    for (const l of lamps) {
      l.lit = false
      l.heat = 0
      l.n.className = 'mln-lamp'
    }
    taper.classList.remove('dead')
    dusk.classList.remove('warm')
  }

  function light(i: number, t: number) {
    const l = lamps[i]
    l.lit = true
    l.n.classList.add('lit')
    // a quick run of lanterns climbs the scale
    chain = t - lastLit < 1.1 ? chain + 1 : 0
    lastLit = t
    sfx.piano(72 + [0, 2, 4, 7, 9, 12, 14][Math.min(6, chain)])
    sparks(m, l.p, 5, '#ffd27a')
    if (lamps.every((k) => k.lit)) win()
  }

  function win() {
    state = 'won'
    dusk.classList.add('warm')
    for (const l of lamps) l.n.classList.add('party')
    const spare = left / BURN
    sfx.chime()
    g.confetti(spare > 0.5 ? 44 : 24)
    g.emote('cheer', 2.5)
    shout(m, 'LUCKY!', [596, 150], 'gold')
    bump('lanterns:lit')
    g.stamp('lantern-lighter')
    if (spare > 0.5) g.stamp('before-the-wind')
    const best = save.stats['lanterns:best'] ?? 0
    const secs = Math.round((BURN - left) * 10)
    if (!best || secs < best) {
      save.stats['lanterns:best'] = secs
      persist()
    }
    g.say('Seven for seven. Mott Street approves.')
    m.later(() => m.close(), 5200)
  }

  function burntOut() {
    state = 'out'
    taper.classList.add('dead')
    sfx.whoosh()
    const lit = lamps.filter((l) => l.lit).length
    shout(m, `${lit}/7`, [at[0], Math.max(120, at[1] - 40)], 'bad')
    g.say('Wind wins. It usually does.')
  }

  function gust() {
    const dir = Math.random() < 0.5 ? 1 : -1
    const n = el('i', 'mln-gust' + (dir < 0 ? ' rev' : ''))
    m.root.append(n)
    const lit = lamps.filter((l) => l.lit).length
    // it never takes all of them, and takes more as you get close
    gusts.push({ x: dir > 0 ? 250 : 950, dir, n, hit: new Set(), quota: lit <= 1 ? lit : Math.min(lit - 1, lit >= 5 ? 3 : 2) })
    sfx.whoosh()
  }

  m.frame((dt, t) => {
    taper.style.transform = `translate(${at[0]}px, ${at[1]}px)`
    // gusts cross the string whatever happens: the lanterns swing
    for (const w of gusts) {
      w.x += w.dir * 520 * dt
      w.n.style.transform = `translate(${w.x}px, 0)${w.dir < 0 ? ' scaleX(-1)' : ''}`
      lamps.forEach((l, i) => {
        if (w.hit.has(i) || (w.dir > 0 ? w.x < l.p[0] : w.x > l.p[0])) return
        w.hit.add(i)
        l.n.classList.remove('sway')
        void l.n.offsetWidth
        l.n.classList.add('sway')
        const remaining = lamps.filter((k, j) => k.lit && !w.hit.has(j)).length
        if (state === 'play' && l.lit && w.quota > 0 && (Math.random() < 0.55 || remaining < w.quota)) {
          w.quota--
          l.lit = false
          l.heat = 0
          l.n.classList.remove('lit')
          l.n.classList.add('puff')
          m.later(() => l.n.classList.remove('puff'), 500)
        }
      })
      if (w.x < 150 || w.x > 1050) w.n.remove()
    }
    while (gusts.length && !gusts[0].n.isConnected) gusts.shift()
    if (state !== 'play') return

    // the flame is the top of the taper
    lamps.forEach((l, i) => {
      if (l.lit) return
      const near = Math.hypot(at[0] - l.p[0], at[1] - 6 - l.p[1]) < 26
      l.heat = near ? l.heat + dt : Math.max(0, l.heat - dt * 2)
      l.n.style.setProperty('--h', String(Math.min(1, l.heat / CATCH)))
      if (near && !started) {
        started = true
        tip?.remove()
        tip = null
      }
      if (l.heat >= CATCH) light(i, t)
    })
    if (!started) return
    left -= dt
    taper.style.setProperty('--len', String(Math.max(0, left / BURN)))
    nextGust -= dt
    if (nextGust <= 0) {
      nextGust = 3.2 + Math.random() * 1.8
      gust()
    }
    if (left <= 0) burntOut()
  })

  m.root.addEventListener('pointermove', (e) => {
    at = pointer(e)
    keyAt = -1
  })
  m.root.addEventListener('pointerdown', (e) => {
    at = pointer(e)
    // burnt out: a click strikes a new taper
    if (state === 'out') reset()
  })
  m.onKey((e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      if (state === 'out') reset()
      return true
    }
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    keyAt = keyAt < 0 ? (d > 0 ? 0 : SPOTS.length - 1) : (keyAt + d + SPOTS.length) % SPOTS.length
    at = [SPOTS[keyAt][0], SPOTS[keyAt][1] + 6]
    return true
  })
}
