import { sfx } from '../audio'
import { stage, el, toStage } from '../engine/stage'
import { ui, toast } from '../engine/ui'
import { world, depthScale } from '../engine/world'
import type { Actor } from '../engine/actor'
import type { Pt } from '../geometry'
import { link } from '../net/link'

let aiming = false

/** Club Penguin's classic: press T, click somewhere, and lob a snowball. */
export function armSnowball() {
  if (ui.busy || aiming) return
  aiming = true
  stage.root.classList.add('aiming')
  toast('Click where you want to throw ❄️', '❄️')
  const onClick = (e: MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    cancel()
    const target = toStage(e)
    throwFrom(world.player, target)
    link.send({ t: 'sb', x: Math.round(target[0]), y: Math.round(target[1]) })
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') cancel()
  }
  const cancel = () => {
    aiming = false
    stage.root.classList.remove('aiming')
    stage.root.removeEventListener('click', onClick, true)
    window.removeEventListener('keydown', onKey)
  }
  // capture phase so the click doesn't also make the player walk
  setTimeout(() => stage.root.addEventListener('click', onClick, true), 0)
  window.addEventListener('keydown', onKey)
}

/** Someone (you, a local, or another player) lobs a snowball at a point. */
export function throwFrom(a: Actor, target: Pt) {
  const s = depthScale(a.pos[1])
  const from: Pt = [a.pos[0] + 18 * s, a.pos[1] - 70 * s]
  a.emote('wave', 0.4)
  sfx.whoosh()
  const ball = el('div', 'snowball')
  stage.fx.append(ball)
  const shadow = el('div', 'snowball-shadow')
  stage.fx.append(shadow)
  const dist = Math.hypot(target[0] - from[0], target[1] - from[1])
  const dur = Math.min(0.9, 0.35 + dist / 900)
  const peak = Math.min(140, 40 + dist * 0.35)
  const t0 = performance.now()
  const step = (now: number) => {
    const k = Math.min(1, (now - t0) / (dur * 1000))
    const x = from[0] + (target[0] - from[0]) * k
    const yLine = from[1] + (target[1] - from[1]) * k
    const y = yLine - Math.sin(Math.PI * k) * peak
    const sc = depthScale(yLine + 70) * 0.9
    ball.style.transform = `translate(${x}px, ${y}px) scale(${sc})`
    shadow.style.transform = `translate(${x}px, ${from[1] + 70 * s + (target[1] - from[1] - 70 * s) * k}px) scale(${sc})`
    if (k < 1) requestAnimationFrame(step)
    else {
      ball.remove()
      shadow.remove()
      splat(target)
      const hit = world.npcs.find((n) => {
        if (n === a) return false
        const ns = depthScale(n.pos[1])
        return Math.abs(n.pos[0] - target[0]) < 24 * ns && target[1] < n.pos[1] + 6 && target[1] > n.pos[1] - 110 * ns
      })
      // real players react for themselves; city locals shout back (and sometimes return fire)
      if (hit && a === world.player) import('../game').then((m) => m.api.stamp('snowball-fight'))
      if (hit && a === world.player && !hit.remote) {
        if (hit.resident) import('../social/friends').then((m) => m.bond(hit.resident!.id, 0.5))
        hit.say(['Hey!! ❄️', 'Oh it’s ON.', 'Ha! Nice shot!', 'My coffee!!'][Math.floor(Math.random() * 4)])
        if (Math.random() < 0.55) setTimeout(() => {
          const p = world.player
          const ps = depthScale(p.pos[1])
          throwFrom(hit, [p.pos[0] + (Math.random() - 0.5) * 30 * ps, p.pos[1] - 50 * ps])
        }, 700)
      }
      if (a !== world.player) {
        const p = world.player
        const ps = depthScale(p.pos[1])
        if (Math.abs(p.pos[0] - target[0]) < 26 * ps) p.say('Ack! 😆')
      }
    }
  }
  requestAnimationFrame(step)
}

function splat([x, y]: Pt) {
  sfx.pop()
  const s = el('div', 'snow-splat', '<i></i><i></i><i></i><i></i><i></i><i></i>')
  s.style.transform = `translate(${x}px, ${y}px) scale(${depthScale(y + 60)})`
  stage.fx.append(s)
  setTimeout(() => s.remove(), 900)
}
