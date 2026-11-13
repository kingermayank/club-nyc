import './chandelier.css'
import { sfx } from '../../audio'
import { el } from '../../engine/stage'
import { world } from '../../engine/world'
import { persist, save } from '../../state'
import type { Game } from '../../types'
import type { Pt } from '../../geometry'
import { closeX, cutoutImg, hint, openMoment, pointer, shout, sparks } from './kit'

/**
 * The Chandelier, Broadway: it shivers and shakes its crystals loose, and you run a top hat along the aisle to
 * catch them (mouse, or the arrow keys). They come quicker and wider as the hat fills. Three on the carpet and
 * the act is over; the number on the hat band is your score. Now and then the gold star off the arch comes down too.
 */

const FLOOR = 468 // where a crystal smashes
const RIM = 428 // the hat's brim
const HALF = 44 // half the hat's mouth

interface Drop { n: HTMLElement; sh: HTMLElement; x: number; y: number; vx: number; vy: number; star: boolean; spin: number }

export function catchTheCrystals(g: Game) {
  const c = world.geo?.cutouts.chandelier
  if (!c) return
  const [cx0, , cw, ch] = c.rect
  const lamp = cutoutImg('chandelier')
  const mid = cx0 + cw / 2

  const m = openMoment('mo-chandelier')
  const hat = el('div', 'mch-hat', '<i class="mch-brim"></i><i class="mch-crown"><b>0</b></i>')
  const count = hat.querySelector('b')!
  const x = closeX(m)
  x.classList.add('mch-x')
  x.style.cssText = `left:${cx0 + cw + 26}px;top:14px`
  m.root.append(hat, x)
  let tip: HTMLElement | null = hint(m, 'Catch the crystals!', [mid, 122])
  lamp?.classList.add('mch-shiver')
  m.onClose(() => lamp?.classList.remove('mch-shiver', 'mch-dark'))

  let hx = mid
  let tx = mid
  let caught = 0
  let missed = 0
  let next = 1.1
  let over = false
  let starDue = 6 + Math.floor(Math.random() * 8)
  const drops: Drop[] = []
  const shards: HTMLElement[] = []

  function drop() {
    const star = caught >= starDue
    if (star) starDue = 1e9
    const from: Pt = star ? [mid + 32, 52] : [mid + (Math.random() - 0.5) * (cw - 40), ch - 6]
    // where it comes down: wider as the hat fills, never under the seats
    const reach = Math.min(300, 130 + caught * 9)
    const to = Math.min(800, Math.max(200, (caught < 3 ? hx : mid) + (Math.random() - 0.5) * 2 * reach))
    const grav = 520 + Math.min(520, caught * 26)
    const vy = -120 - Math.random() * 90
    // time to the brim under that gravity
    const tt = (-vy + Math.sqrt(vy * vy + 2 * grav * (RIM - from[1]))) / grav
    const n = el('i', star ? 'mch-drop star' : 'mch-drop')
    const sh = el('i', 'mch-shadow')
    sh.style.left = `${to}px`
    m.root.append(sh, n)
    drops.push({ n, sh, x: from[0], y: from[1], vx: (to - from[0]) / tt, vy, star, spin: (Math.random() - 0.5) * 500 })
    ;(n as HTMLElement).dataset.g = String(grav)
    sfx.tick()
  }

  function smash(d: Drop) {
    missed++
    sfx.clapper()
    sfx.ding()
    const s = el('i', 'mch-shards')
    s.style.cssText = `left:${d.x}px;top:${FLOOR}px`
    m.root.append(s)
    shards.push(s)
    sparks(m, [d.x, FLOOR - 6], 7, '#dff3ff')
    if (missed >= 3) end()
  }

  function end() {
    over = true
    lamp?.classList.remove('mch-shiver')
    lamp?.classList.add('mch-dark')
    for (const d of drops) {
      d.n.remove()
      d.sh.remove()
    }
    drops.length = 0
    hat.classList.add('bow')
    const best = save.stats['chandelier:best'] ?? 0
    const record = caught > best
    if (record) {
      save.stats['chandelier:best'] = caught
      persist()
    }
    shout(m, String(caught), [hx, RIM - 70], record && caught >= 5 ? 'gold' : '')
    if (caught >= 10) g.confetti(caught >= 30 ? 44 : 20)
    g.say(caught >= 30 ? 'Standing ovation. From the ushers.' : caught >= 10 ? 'It’s part of the show now.' : 'The carpet caught most of them.')
  }

  function again() {
    over = false
    caught = 0
    missed = 0
    next = 0.8
    starDue = 6 + Math.floor(Math.random() * 8)
    count.textContent = '0'
    hat.classList.remove('bow')
    for (const s of shards) s.remove()
    shards.length = 0
    lamp?.classList.remove('mch-dark')
    lamp?.classList.add('mch-shiver')
  }

  m.frame((dt) => {
    // the hat chases the pointer and leans into the run
    const before = hx
    hx += (tx - hx) * Math.min(1, dt * 16)
    const lean = Math.max(-14, Math.min(14, (hx - before) / Math.max(dt, 0.001) / 40))
    hat.style.transform = `translate(${hx}px, ${RIM}px) rotate(${lean}deg)`
    if (over) return
    next -= dt
    if (next <= 0) {
      drop()
      next = Math.max(0.42, 1.15 - caught * 0.028) * (0.8 + Math.random() * 0.4)
    }
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i]
      const grav = Number(d.n.dataset.g)
      const py = d.y
      d.vy += grav * dt
      d.x += d.vx * dt
      d.y += d.vy * dt
      d.n.style.transform = `translate(${d.x}px, ${d.y}px) rotate(${d.spin * (d.y / 400)}deg)`
      d.sh.style.opacity = String(Math.min(0.5, Math.max(0, (d.y - 80) / 700)))
      d.sh.style.transform = `scale(${0.4 + Math.min(1, d.y / RIM) * 0.6})`
      const inHat = d.vy > 0 && py <= RIM && d.y >= RIM - 6 && Math.abs(d.x - hx) < HALF
      if (inHat) {
        caught++
        count.textContent = String(caught)
        hat.classList.remove('gulp')
        void hat.offsetWidth
        hat.classList.add('gulp')
        if (d.star) {
          sfx.chime()
          sparks(m, [d.x, RIM], 14, '#ffd166')
          shout(m, '★', [d.x, RIM - 60], 'gold')
          g.stamp('falling-star')
        } else {
          sfx.piano(84 + (caught % 5) * 2)
          sparks(m, [d.x, RIM], 3, '#dff3ff')
        }
        if (caught === 10) g.stamp('crystal-catcher')
        if (caught === 30) g.stamp('full-house')
      } else if (d.y < FLOOR) continue
      else if (!d.star) smash(d)
      d.n.remove()
      d.sh.remove()
      drops.splice(i, 1)
      if (over) return
    }
  })

  const clampX = (v: number) => Math.min(830, Math.max(170, v))
  m.root.addEventListener('pointermove', (e) => {
    tx = clampX(pointer(e)[0])
    if (tip && !over) {
      tip.remove()
      tip = null
    }
  })
  m.root.addEventListener('pointerdown', (e) => {
    tx = clampX(pointer(e)[0])
    if (over) again()
  })
  m.onKey((e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      tx = clampX(tx + (e.key === 'ArrowLeft' ? -70 : 70))
      tip?.remove()
      tip = null
      return true
    }
    if (e.key === ' ' || e.key === 'Enter') {
      if (over) again()
      return true
    }
  })
}
