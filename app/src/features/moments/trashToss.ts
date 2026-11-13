import './trashToss.css'
import { sfx } from '../../audio'
import { el, stage } from '../../engine/stage'
import { world } from '../../engine/world'
import type { Game } from '../../types'
import { cutoutImg, pick } from './kit'

/**
 * The platform trash can: ball up a wrapper and take the shot, from wherever you're standing. Close up it almost
 * always drops in; from across the platform it's a real shot. It counts your streak, the can jumps when you sink one,
 * and a miss rolls off toward the tracks.
 */
const IN = ['Nothing but can.', 'Count it.', 'From downtown.', 'The crowd goes mild.']
const OUT = ['Off the rim.', 'Airball. The rat saw that.', 'So close. The pigeons are unimpressed.']
let streak = 0
let busy = false

export function trashToss(g: Game) {
  const c = world.geo?.cutouts.trash
  if (!c || busy) return
  busy = true
  const [x, y, w] = c.rect
  const mouth = [x + w * 0.5, y + 14]
  const from = [world.player.pos[0], world.player.pos[1] - 78]
  const dist = Math.hypot(mouth[0] - from[0], mouth[1] - from[1])
  // a layup from next to it, a long shot from the turnstiles
  const makes = Math.random() < Math.max(0.35, Math.min(0.92, 1.05 - dist / 520))
  g.emote('wave', 1)
  const ball = el('div', 'tt-ball')
  stage.fx.append(ball)
  const end = makes ? mouth : [mouth[0] + pick([-1, 1]) * (22 + Math.random() * 16), mouth[1] + 6]
  const peak = Math.min(from[1], end[1]) - 70 - dist * 0.18
  const ms = 520 + dist * 1.1
  const t0 = performance.now()
  const fly = (now: number) => {
    const p = Math.min(1, (now - t0) / ms)
    const bx = from[0] + (end[0] - from[0]) * p
    // up to the top of the arc and down again
    const by = (1 - p) * (1 - p) * from[1] + 2 * (1 - p) * p * peak + p * p * end[1]
    ball.style.transform = `translate(${bx}px, ${by}px) rotate(${p * 540}deg)`
    if (p < 1) return void requestAnimationFrame(fly)
    if (makes) {
      streak++
      ball.remove()
      sfx.pop()
      const can = cutoutImg('trash')
      can?.animate([{ transform: 'none' }, { transform: 'translateY(-5px) scale(1.04, 0.96)' }, { transform: 'none' }], { duration: 260, easing: 'ease-out' })
      g.say(streak > 1 ? `${pick(IN)} That’s ${streak} in a row.` : pick(IN))
      if (streak === 3) g.confetti(24)
    } else {
      streak = 0
      sfx.click()
      // it drops to the floor and rolls off toward the tracks
      ball.animate([{ transform: ball.style.transform }, { transform: `translate(${end[0] + 46}px, ${y + c.rect[3] - 4}px) rotate(900deg)` }, { transform: `translate(${end[0] + 120}px, ${y + c.rect[3] + 6}px) rotate(1400deg)`, opacity: 0 }], { duration: 900, easing: 'ease-out', fill: 'forwards' }).onfinish = () => ball.remove()
      g.say(pick(OUT))
    }
    busy = false
  }
  requestAnimationFrame(fly)
}
