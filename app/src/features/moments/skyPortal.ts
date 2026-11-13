import './skyPortal.css'
import { audioCtx, sfx } from '../../audio'
import { avatarMarkup, VIEWBOX } from '../../avatar/render'
import { el, stage } from '../../engine/stage'
import { world } from '../../engine/world'
import { save } from '../../state'
import type { Game } from '../../types'
import type { Pt } from '../../geometry'
import { clickAwayCloses, closeX, cutoutImg, hint, openMoment, pointer } from './kit'

/**
 * The Sky Portal, Sky Deck 102: the real observatory has a 14-foot disc in the floor showing live video of the
 * street 1,250 feet below. Here the camera walks up to the disc: click it and you jump on it (the glass thuds, the
 * floor holds), or lie down and the view turns straight down, you face-first on the glass, traffic crawling far
 * below (a clip made from our own painting, only the cars move). What it is, is engraved on the rim.
 */
const RIM = [
  ['SKY PORTAL', 0],
  ['LIVE VIDEO FROM 1,250 FEET UP', 180],
] as const

/** a dull thud through thick glass */
function thud() {
  const ac = audioCtx()
  if (!ac) return
  const o = ac.createOscillator()
  const g = ac.createGain()
  const t = ac.currentTime
  o.type = 'sine'
  o.frequency.setValueAtTime(120, t)
  o.frequency.exponentialRampToValueAtTime(46, t + 0.22)
  g.gain.setValueAtTime(0.5, t)
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
  o.connect(g).connect(ac.destination)
  o.start(t)
  o.stop(t + 0.32)
}

export function skyPortal(g: Game) {
  const c = world.geo?.cutouts.portal
  if (!c) return
  const [bx, by, bw, bh] = c.rect
  const mid: Pt = [bx + bw / 2, by + bh / 2]
  const m = openMoment('mo-portal')

  // the camera walks up to the disc
  const K = 1.7
  const FOCUS: Pt = [500, 330]
  const T: Pt = [FOCUS[0] - K * mid[0], FOCUS[1] - K * mid[1]]
  const layers = [stage.bg, stage.scene, stage.fx]
  stage.root.classList.add('bm-zoom')
  for (const l of layers) {
    l.style.transformOrigin = '0 0'
    l.style.transition = 'transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1)'
    l.style.transform = `translate(${T[0]}px, ${T[1]}px) scale(${K})`
  }
  m.onClose(() => {
    for (const l of layers) l.style.transform = ''
    stage.root.classList.remove('bm-zoom')
    setTimeout(() => layers.forEach((l) => l.style.transform || (l.style.transition = '')), 750)
  })

  // the disc itself is the button: click it and you jump on it
  const disc = el('button', 'sp-disc')
  disc.type = 'button'
  disc.setAttribute('aria-label', 'Jump on the Sky Portal')
  disc.style.cssText = `left:${T[0] + K * bx}px;top:${T[1] + K * by}px;width:${K * bw}px;height:${K * bh}px`
  const tip = hint(m, 'Click to jump', [FOCUS[0], FOCUS[1] - 30])
  // step onto the glass if you aren't on it yet
  const at = c.at as Pt | undefined
  if (at && world.nav && Math.hypot(world.player.pos[0] - at[0], (world.player.pos[1] - at[1]) * 2) > bw * 0.42) world.player.path = world.nav.path(world.player.pos, world.nav.nearest(at))
  let jumps = 0
  const jump = () => {
    if (!m.alive) return
    tip.remove()
    world.player.emote('jump', 0.9)
    const art = cutoutImg('portal')
    m.later(() => {
      thud()
      disc.classList.remove('hit')
      void disc.offsetWidth
      disc.classList.add('hit')
      if (art) {
        art.classList.remove('sp-flex')
        void art.offsetWidth
        art.classList.add('sp-flex')
      }
    }, 430)
    if (++jumps === 3) m.later(() => g.say('The floor held. My knees, less so.'), 900)
  }
  disc.onpointerdown = (e) => e.stopPropagation()
  disc.onclick = jump
  m.onClose(() => cutoutImg('portal')?.classList.remove('sp-flex'))

  const lie = el('button', 'sp-lie', `<svg viewBox="0 0 30 18" aria-hidden="true"><circle cx="5.5" cy="9" r="4" fill="currentColor"/><path d="M12 9 H27 M17 9 L21 3 M17 9 L21 15" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg><span>Lie Down</span>`)
  lie.type = 'button'
  lie.style.cssText = `left:${FOCUS[0]}px;top:${T[1] + K * by - 58}px`
  lie.onpointerdown = (e) => e.stopPropagation()
  lie.onclick = () => {
    sfx.click()
    tip.remove()
    lookDown()
  }
  const x = closeX(m)
  x.classList.add('sp-x')
  m.root.append(disc, lie, x)
  clickAwayCloses(m)
  m.onKey((e) => {
    if (e.key === ' ' || e.key === 'Enter') return jump(), true
  })

  // ---------- lying on the glass: the view turns straight down ----------
  function lookDown() {
    if (m.root.querySelector('.sp-pov')) return
    const { x: vx, y: vy, w, h } = VIEWBOX
    const R = 262
    const arcs = RIM.map(([text, deg], i) => {
      // each line sits on its own arc of the rim, centered on its angle, reading from outside the disc
      const flip = deg === 0 ? 1 : 0
      const a0 = ((deg - 90 - (flip ? 60 : -60)) * Math.PI) / 180
      const a1 = ((deg - 90 + (flip ? 60 : -60)) * Math.PI) / 180
      const r = flip ? R - 5 : R + 6
      const p = (a: number) => `${(300 + Math.cos(a) * r).toFixed(1)} ${(300 + Math.sin(a) * r).toFixed(1)}`
      return `<path id="sp-arc${i}" d="M ${p(a0)} A ${r} ${r} 0 0 ${flip} ${p(a1)}" fill="none"/><text><textPath href="#sp-arc${i}" startOffset="50%">${text}</textPath></text>`
    }).join('')
    const bolts = Array.from({ length: 12 }, (_, i) => {
      const a = ((i * 30 + 45) * Math.PI) / 180
      return `<circle cx="${(300 + Math.cos(a) * R).toFixed(1)}" cy="${(300 + Math.sin(a) * R).toFixed(1)}" r="3.4"/>`
    }).join('')
    const pov = el('div', 'sp-pov')
    pov.innerHTML = `<div class="sp-glass"><div class="sp-street"><img src="/art/downtown/portal-down.jpg" alt="" draggable="false"><video src="/art/video/portal-down.mp4" muted loop playsinline preload="auto" disablepictureinpicture></video></div><i class="sp-sheen"></i></div>
      <svg class="sp-rim" viewBox="0 0 600 600" aria-hidden="true"><circle class="sp-ring" cx="300" cy="300" r="${R}"/><circle class="sp-edge" cx="300" cy="300" r="${R - 19}"/><circle class="sp-edge" cx="300" cy="300" r="${R + 19}"/><g class="sp-bolts">${bolts}</g>${arcs}</svg>
      <svg class="sp-you" viewBox="${vx} ${vy} ${w} ${h}" aria-hidden="true">${avatarMarkup(save.look, { back: true })}</svg>
      <button class="mo-x sp-up" type="button" aria-label="Stand up"><svg viewBox="0 0 20 20"><path d="M5 5 L15 15 M15 5 L5 15" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/></svg></button>`
    const street = pov.querySelector<HTMLElement>('.sp-street')!
    const video = pov.querySelector('video')!
    video.addEventListener('playing', () => video.classList.add('on'), { once: true })
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) void video.play().catch(() => {})
    // looking around: the street slides a little against your head
    pov.onpointermove = (e) => {
      const [px, py] = pointer(e)
      street.style.transform = `translate(${((500 - px) / 500) * 16}px, ${((282 - py) / 282) * 12}px) scale(1.1)`
    }
    pov.onpointerdown = (e) => e.stopPropagation()
    const up = () => {
      pov.classList.add('out')
      setTimeout(() => pov.remove(), 320)
    }
    pov.querySelector<HTMLElement>('.sp-up')!.onclick = (e) => {
      e.stopPropagation()
      sfx.click()
      up()
    }
    m.root.append(pov)
  }
}
