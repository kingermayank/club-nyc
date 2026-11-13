import './stampToast.css'
import { sfx } from '../audio'
import { el, stage } from '../engine/stage'
import { showToast } from '../engine/ui'
import { hasIcon, iconUrl } from '../engine/iconize'

/**
 * "Stamp earned", as an enamel pin. A gold-rimmed pin flips in and clicks into place, catches the light, and its name
 * sits on a small tag underneath. The enamel is the tier's colour (navy, green, gold) and the stars on the tag count
 * the tier. Then the pin swoops along a curve down into the Stamp Book button, shrinking as it goes and leaving a few
 * sparkles behind; the button catches it with a bump, so you learn where stamps live without being told.
 * (Chosen by the user from docs/design/stamp-options.html, Nov 12 2026.)
 */

const SHOW_MS = 3000
const PIN = '/art/icons/stamp-pin.png'
const FLIGHT_MS = 720

export function stampToast(s: { name: string; icon: string; tier: number }) {
  const tier = Math.min(3, Math.max(1, s.tier || 1))
  const art = hasIcon(s.icon) ? `<img class="sp-art" src="${iconUrl(s.icon)}" alt="" draggable="false">` : `<span class="sp-art sp-emoji" data-raw>${s.icon}</span>`
  const node = el(
    'div',
    `stamp-toast t${tier}`,
    `<div class="sp-pin" aria-hidden="true"><div class="sp-flip">
        <img class="sp-badge" src="${PIN}" alt="" draggable="false"><i class="sp-tint"></i>${art}<i class="sp-gloss"></i>
      </div></div>
    <div class="sp-tag"><b>${s.name}</b><span class="sp-stars">${'<i></i>'.repeat(tier)}</span></div>`,
  )
  node.setAttribute('role', 'status')
  node.setAttribute('aria-label', `Stamp earned: ${s.name}`)
  node.dataset.key = `stamp:${s.name}`

  // the click of the pin landing, when it actually lands (not when it's queued)
  let started = false
  node.addEventListener('animationstart', (e) => {
    if (started || !(e.target as Element).classList?.contains('sp-flip')) return
    started = true
    setTimeout(() => sfx.stamp(), 520)
  })

  // leaving: a copy of the pin flies to the Stamp Book (the toast itself is removed on the toast queue's schedule)
  new MutationObserver((_, obs) => {
    if (!node.classList.contains('out')) return
    obs.disconnect()
    flyToBook(node)
  }).observe(node, { attributes: true, attributeFilter: ['class'] })

  showToast(node, SHOW_MS)
}

/** a point in stage px from a screen rect's centre */
const centre = (r: DOMRect): [number, number] => {
  const sr = stage.root.getBoundingClientRect()
  const k = stage.scale || 1
  return [(r.left + r.width / 2 - sr.left) / k, (r.top + r.height / 2 - sr.top) / k]
}

function flyToBook(node: HTMLElement) {
  const pin = node.querySelector<HTMLElement>('.sp-pin')!
  const tag = node.querySelector<HTMLElement>('.sp-tag')!
  const btn = stage.toolbar.querySelector<HTMLElement>('[aria-label="Stamp Book"]')
  const to = btn?.getBoundingClientRect()
  const visible = !!to && to.width > 0 && document.elementFromPoint(to.left + to.width / 2, to.top + to.height / 2)?.closest('[aria-label="Stamp Book"]') === btn
  // the tag tucks away first, either way
  tag.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-8px) scale(0.9)' }], { duration: 160, easing: 'ease-in', fill: 'forwards' })
  if (!btn || !to || !visible) {
    pin.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-14px) scale(0.9)' }], { duration: 260, easing: 'ease-in', fill: 'forwards' })
    return
  }

  // the flyer: the same pin, lifted out of the toast into the stage so it can travel the whole screen
  const from = pin.getBoundingClientRect()
  const k = stage.scale || 1
  const size = from.width / k
  const [x0, y0] = centre(from)
  const [x1, y1] = centre(to)
  const fly = pin.cloneNode(true) as HTMLElement
  fly.classList.add('sp-flyer')
  fly.style.cssText = `left:${x0 - size / 2}px;top:${y0 - size / 2}px;width:${size}px;height:${size}px`
  fly.className = `sp-pin sp-flyer t${node.className.match(/t(\d)/)?.[1] ?? 1}`
  stage.root.append(fly)
  pin.style.visibility = 'hidden'

  // a smooth swoop: out to the side and a little up first, then down into the button (a quadratic curve), eased
  // in and out, shrinking and turning a quarter as it goes
  const cx = x0 + (x1 - x0) * 0.85
  const cy = Math.min(y0, y1) - 40
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)
  const frames: Keyframe[] = []
  const N = 24
  for (let i = 0; i <= N; i++) {
    const t = ease(i / N)
    const u = 1 - t
    const x = u * u * x0 + 2 * u * t * cx + t * t * x1
    const y = u * u * y0 + 2 * u * t * cy + t * t * y1
    const scale = 1 - 0.72 * t + 0.08 * Math.sin(Math.PI * Math.min(1, t * 1.6))
    frames.push({ transform: `translate(${(x - x0).toFixed(1)}px, ${(y - y0).toFixed(1)}px) rotate(${(-28 * t).toFixed(1)}deg) scale(${scale.toFixed(3)})`, opacity: i === N ? 0.6 : 1, offset: i / N })
  }
  const anim = fly.animate(frames, { duration: FLIGHT_MS, easing: 'linear', fill: 'forwards', delay: 60 })

  // a few sparkles left along the way
  for (const t of [0.25, 0.45, 0.65]) {
    setTimeout(() => {
      const r = fly.getBoundingClientRect()
      if (!r.width) return
      const [sx, sy] = centre(r)
      const s = el('i', 'sp-spark')
      s.style.cssText = `left:${sx}px;top:${sy}px`
      stage.root.append(s)
      setTimeout(() => s.remove(), 650)
    }, 60 + FLIGHT_MS * t)
  }

  anim.onfinish = () => {
    fly.remove()
    // the book catches it: a bump, a ring of light, a soft pop
    btn.classList.remove('st-bump')
    void btn.offsetWidth
    btn.classList.add('st-bump')
    const ring = el('i', 'sp-catch')
    ring.style.cssText = `left:${x1}px;top:${y1}px`
    stage.root.append(ring)
    setTimeout(() => ring.remove(), 600)
    sfx.pop()
    setTimeout(() => btn.classList.remove('st-bump'), 600)
  }
}
