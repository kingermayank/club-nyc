import './ambient.css'
import data from '../data/ambient.json'
import { sfx } from '../audio'
import { kit } from '../foley'
import { el } from '../engine/stage'
import { world, onRoom } from '../engine/world'
import type { Pt } from '../geometry'

/**
 * The city breathing while you stand still: light on the water wherever there's water, the park's ducks paddling
 * about, pigeons that take off when you walk up and come back when you've gone, and a train going through the
 * station every 90 seconds. (Each place's sound bed is sound/ambience.ts.)
 *
 * The animals are cutouts of things painted into each room's picture, so a small patch of ground colour covers the
 * painted one while its cutout moves. tools/ambient_masks.py finds the water and samples those colours
 * (data/ambient.json, art/fx/water-<room>.png). Room hooks register on import (game.ts).
 */
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches
const GROUND = data.ground as Record<string, Record<string, string>>

/** the room's cutout picture and its click target */
function cutout(scene: HTMLElement, id: string) {
  const img = [...scene.querySelectorAll<HTMLImageElement>('img.cutout')].find((i) => (i.getAttribute('src') ?? '').includes(`/${id}.png`))
  const hit = world.hits.find((h) => h.kind === 'cutout' && h.id === id)
  return img ? { img, hit } : null
}
/** covers the animal painted into the background, so only the cutout shows */
function patch(scene: HTMLElement, rect: number[], color: string) {
  const [x, y, w, h] = rect
  const p = el('div', 'amb-patch')
  p.style.cssText = `left:${x - 3}px;top:${y - 3}px;width:${w + 6}px;height:${h + 6}px;background:${color};box-shadow:0 0 5px 3px ${color}`
  scene.append(p)
  return p
}
/** one loop per room, stopped when you leave */
function every(frame: (t: number, dt: number) => void) {
  let raf = 0
  let last = performance.now()
  const t0 = last
  const loop = (now: number) => {
    frame((now - t0) / 1000, Math.min(0.05, (now - last) / 1000))
    last = now
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)
  return () => cancelAnimationFrame(raf)
}

// ---------- water ----------
for (const room of data.water)
  onRoom(room, ({ scene }) => {
    const w = el('div', 'amb-water', '<i></i><i></i>')
    w.style.setProperty('--mask', `url(/art/fx/water-${room}.png)`)
    scene.append(w)
  })

// ---------- the park's ducks ----------
onRoom('central-park', ({ geo, scene }) => {
  if (calm()) return
  const ducks = ['duck-1', 'duck-2', 'duck-3'].flatMap((id, i) => {
    const c = cutout(scene, id)
    const rect = geo.cutouts[id]?.rect
    if (!c || !rect) return []
    patch(scene, rect, GROUND['central-park']?.[id] ?? '#34abe8')
    const ripple = el('div', 'amb-ripple')
    scene.append(ripple)
    // each paddles its own slow figure of eight; the little ones follow the big one's lead a moment behind
    return [{ ...c, rect, ripple, reach: i === 0 ? 34 : 24, speed: 0.16 + i * 0.03, phase: i * 1.7 }]
  })
  if (!ducks.length) return
  let nextQuack = 8 + Math.random() * 20
  return every((t) => {
    for (const d of ducks) {
      const a = t * d.speed + d.phase
      const dx = Math.sin(a) * d.reach
      const dy = Math.sin(a * 2) * 4 + Math.sin(t * 2.6 + d.phase) * 0.7
      // the painting has them facing left: turn round when paddling right
      d.img.style.translate = `${dx.toFixed(1)}px ${dy.toFixed(1)}px`
      d.img.style.scale = Math.cos(a) > 0 ? '-1 1' : '1 1'
      const [x, y, w, h] = d.rect
      d.ripple.style.cssText = `left:${x + dx + w * 0.1}px;top:${y + dy + h * 0.72}px;width:${w * 0.8}px`
      if (d.hit) d.hit.rect = [x + dx, y + dy, x + dx + w, y + dy + h]
    }
    // a quack now and then, when you're down by the water
    if (t > nextQuack) {
      nextQuack = t + 35 + Math.random() * 40
      if (world.player.pos[1] < 330) sfx.quack()
    }
  })
})

// ---------- pigeons ----------
/** a flurry of wings */
function flutter() {
  const a = kit.ctx()
  if (!a) return
  const t = a.currentTime
  for (let i = 0; i < 7; i++) kit.noise(a, t + i * 0.055, 0.05, 0.035 - i * 0.003, { type: 'bandpass', f: 1500 + i * 130, q: 1.4 })
}
function pigeons(room: string, ids: string[]) {
  onRoom(room, ({ geo, scene }) => {
    if (calm()) return
    const birds = ids.flatMap((id) => {
      const c = cutout(scene, id)
      const rect = geo.cutouts[id]?.rect
      if (!c || !rect) return []
      patch(scene, rect, GROUND[room]?.[id] ?? '#7c7e90')
      c.img.classList.add('amb-bird')
      c.img.style.animationDelay = `${-Math.random() * 6}s`
      const home: Pt = [rect[0] + rect[2] / 2, rect[1] + rect[3]]
      return [{ ...c, rect, home, away: false, busy: false, clearFor: 0, was: c.hit?.rect }]
    })
    if (!birds.length) return
    const NEAR = 64
    const FAR = 135
    return every((_t, dt) => {
      const [px, py] = world.player.pos
      for (const b of birds) {
        const d = Math.hypot(px - b.home[0], py - b.home[1])
        if (b.busy) continue
        if (!b.away && d < NEAR) {
          // up and away from you, wings going
          b.away = b.busy = true
          b.clearFor = 0
          if (b.hit) b.hit.rect = [-9, -9, -9, -9]
          flutter()
          const side = b.home[0] >= px ? 1 : -1
          const dx = side * (150 + Math.random() * 120)
          const dy = -(240 + Math.random() * 90)
          b.img.classList.add('fly')
          b.img.style.scale = `${side > 0 ? 1 : -1} 1`
          b.img.animate([{ translate: '0 0', opacity: 1 }, { translate: `${dx * 0.75}px ${dy * 0.8}px`, opacity: 1, offset: 0.8 }, { translate: `${dx}px ${dy}px`, opacity: 0 }], { duration: 950, easing: 'cubic-bezier(0.3, 0, 0.6, 1)', fill: 'forwards' }).onfinish = () => {
            b.busy = false
            b.img.dataset.dx = String(dx)
            b.img.dataset.dy = String(dy)
          }
        } else if (b.away) {
          // back down once you've been well clear for a few seconds
          b.clearFor = d > FAR ? b.clearFor + dt : 0
          if (b.clearFor < 3.5) continue
          b.busy = true
          const dx = Number(b.img.dataset.dx ?? 0)
          const dy = Number(b.img.dataset.dy ?? -250)
          b.img.style.scale = `${dx > 0 ? -1 : 1} 1`
          b.img.animate([{ translate: `${dx}px ${dy}px`, opacity: 0 }, { translate: `${dx * 0.7}px ${dy * 0.75}px`, opacity: 1, offset: 0.2 }, { translate: '0 0', opacity: 1 }], { duration: 1300, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)', fill: 'forwards' }).onfinish = () => {
            b.img.classList.remove('fly')
            b.img.style.scale = '1 1'
            b.img.getAnimations().forEach((an) => an.cancel())
            if (b.hit && b.was) b.hit.rect = b.was
            b.away = b.busy = false
          }
        }
      }
    })
  })
}
for (const [room, map] of Object.entries(GROUND)) if (room !== 'central-park') pigeons(room, Object.keys(map))
