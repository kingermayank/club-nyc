import { sfx } from '../../audio'
import { el } from '../../engine/stage'
import { world } from '../../engine/world'
import type { Game } from '../../types'
import type { Pt } from '../../geometry'
import { closeX, cutoutImg, hint, openMoment, pick, shout, sparks } from './kit'

/**
 * Prometheus, Rockefeller Center: toss a coin into his fountain, for real. A marker swings along a power bar; click
 * (or Space) to throw. Too soft and it lands on the ice, too hard and it bonks 8 tons of gilded bronze, the green
 * zone splashes down in the basin and your wish is made. The thin gold line in the middle sends it clean through
 * his ring. A coin a throw.
 */

const WISHES = ['a rent-stabilized apartment', 'a seat on the L train at rush hour', 'the perfect bagel', 'a Broadway debut', 'no tourists on Fifth Avenue', 'a rooftop with a view', 'a bodega cat that likes me', 'one quiet Sunday']
const SHORT = ['Short. It’s on the ice. A skater just pocketed it.', 'Not even close. The rink says thanks for the tip.', 'That one landed in someone’s skate. It’s theirs now.']
const LONG = ['Bonk. He’s been hit by worse since 1934.', 'Off the statue! Eight tons of bronze did not flinch.', 'Too hard. It bounced off Prometheus and into legend.']

/** power bar zones, 0..1 */
const BASIN: [number, number] = [0.46, 0.74]
const RING: [number, number] = [0.585, 0.615]

export function coinToss(g: Game) {
  const c = world.geo?.cutouts.statue
  if (!c) return
  const [sx, sy, sw, sh] = c.rect
  const basin: Pt = [sx + sw * 0.47, sy + sh * 0.93]
  const ringAt: Pt = [sx + sw * 0.5, sy + sh * 0.46]
  const statue = cutoutImg('statue')

  const m = openMoment('mo-toss')
  const bar = el('div', 'ct-bar', `<div class="ct-track"><i class="ct-zone"></i><i class="ct-gold"></i><i class="ct-mark"></i></div>`)
  bar.style.cssText = `left:${sx + sw / 2}px;top:${sy + sh + 14}px`
  bar.querySelector<HTMLElement>('.ct-zone')!.style.cssText = `left:${BASIN[0] * 100}%;width:${(BASIN[1] - BASIN[0]) * 100}%`
  bar.querySelector<HTMLElement>('.ct-gold')!.style.cssText = `left:${RING[0] * 100}%;width:${(RING[1] - RING[0]) * 100}%`
  const mark = bar.querySelector<HTMLElement>('.ct-mark')!
  bar.append(closeX(m))
  const score = el('div', 'ct-score', '')
  score.style.cssText = `left:${sx + sw / 2}px;top:${sy + sh + 56}px`
  const target = el('i', 'ct-target')
  target.style.cssText = `left:${basin[0]}px;top:${basin[1]}px`
  m.root.append(target, bar, score)
  const tip = hint(m, 'Click to toss!', [world.player.pos[0], Math.max(60, world.player.pos[1] - 128)])

  let v = 0 // where the marker is, 0..1
  let flying = false
  let wishes = 0
  let speed = 0.85 // sweeps per second
  m.frame((dt, t) => {
    if (flying) return
    // a triangle wave: left to right and back
    const ph = (t * speed) % 2
    v = ph < 1 ? ph : 2 - ph
    mark.style.left = `${v * 100}%`
    void dt
  })

  const toss = () => {
    if (flying) return
    if (!g.spend(1, 'wish')) return m.close()
    flying = true
    tip.remove()
    sfx.whoosh()
    g.emote('wave', 1)
    const power = v
    const from: Pt = [world.player.pos[0], world.player.pos[1] - 70]
    const inBasin = power >= BASIN[0] && power <= BASIN[1]
    const inRing = power >= RING[0] && power <= RING[1]
    let to: Pt
    if (inBasin) to = [basin[0] + (power - (BASIN[0] + BASIN[1]) / 2) * 120, basin[1]]
    else if (power < BASIN[0]) to = [basin[0] + (Math.random() - 0.5) * 160, sy + sh + 40 + (BASIN[0] - power) * 150]
    else to = [ringAt[0] + (Math.random() - 0.5) * 50, ringAt[1] - 10]
    const via = inRing ? ringAt : null
    fly(from, to, via, () => land(inRing ? 'ring' : inBasin ? 'basin' : power < BASIN[0] ? 'short' : 'long', to))
  }

  /** the coin's flight: an arc from your hand to where it lands (through the ring on a perfect throw) */
  function fly(from: Pt, to: Pt, via: Pt | null, then: () => void) {
    const coin = el('i', 'ct-coin')
    m.root.append(coin)
    const dur = 0.85
    const peak = Math.min(from[1], to[1]) - (via ? 150 : 110)
    let t = 0
    m.frame((dt) => {
      if (!coin.isConnected) return
      t += dt / dur
      const k = Math.min(1, t)
      const x = from[0] + (to[0] - from[0]) * k
      // a parabola through the peak
      const y = from[1] + (to[1] - from[1]) * k - 4 * (((from[1] + to[1]) / 2 - peak)) * k * (1 - k)
      coin.style.transform = `translate(${x}px, ${y}px) rotateX(${k * 1440}deg) scale(${1 - k * 0.45})`
      if (via && k > 0.55 && !coin.dataset.rung) {
        coin.dataset.rung = '1'
        sparks(m, via, 10, '#fff2a8')
        sfx.chime()
      }
      if (k >= 1) {
        coin.remove()
        then()
      }
    })
  }

  function land(where: 'ring' | 'basin' | 'short' | 'long', at: Pt) {
    if (where === 'ring' || where === 'basin') {
      wishes++
      sfx.coin()
      splash(at)
      const wish = pick(WISHES)
      if (where === 'ring') {
        shout(m, 'THROUGH THE RING!', [at[0], at[1] - 60], 'gold')
        g.confetti(40)
        g.stamp('ring-shot')
        g.say(`Clean through his ring! I wish for ${wish}. ✨`)
      } else {
        shout(m, 'SPLASH!', [at[0], at[1] - 46])
        g.confetti(14)
        g.say(`I wish for ${wish}. ✨`)
      }
      g.stamp('wish')
      // it gets a little quicker every wish
      speed = Math.min(1.7, speed + 0.12)
    } else if (where === 'short') {
      sfx.tick()
      shout(m, 'PLINK', [at[0], at[1] - 26], 'bad')
      g.say(pick(SHORT))
      wishes = 0
      speed = 0.85
    } else {
      sfx.ding()
      shout(m, 'BONK', [at[0], at[1] - 30], 'bad')
      if (statue) {
        statue.classList.remove('ct-bonk')
        void statue.offsetWidth
        statue.classList.add('ct-bonk')
      }
      g.say(pick(LONG))
      wishes = 0
      speed = 0.85
    }
    score.textContent = wishes > 1 ? `${wishes} wishes in a row` : ''
    m.later(() => {
      flying = false
    }, 900)
  }

  function splash(at: Pt) {
    for (let i = 0; i < 9; i++) {
      const d = el('i', 'ct-drop')
      d.style.cssText = `left:${at[0]}px;top:${at[1]}px;--dx:${(i - 4) * 9 + (Math.random() - 0.5) * 8}px;--dy:${-26 - Math.random() * 34}px`
      m.root.append(d)
      setTimeout(() => d.remove(), 700)
    }
  }

  m.onClose(() => statue?.classList.remove('ct-bonk'))
  m.root.addEventListener('pointerdown', toss)
  m.onKey((e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return
    toss()
    return true
  })
}
