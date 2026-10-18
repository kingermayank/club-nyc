import { AvatarView, itemIcon } from '../avatar/render'
import { randomLook } from '../avatar/random'
import { ITEMS } from '../avatar/items'
import type { Pose } from '../avatar/render'

/** ?dev=avatar — visual check of the avatar system. */
export function avatarLab(root: HTMLElement) {
  root.innerHTML = `<div style="padding:16px;background:#cfe8ff;min-height:100vh;overflow:auto;height:100vh">
    <div id="row" style="display:flex;flex-wrap:wrap;gap:8px"></div>
    <div id="icons" style="display:grid;grid-template-columns:repeat(12,72px);gap:6px;margin-top:20px"></div></div>`
  document.body.style.overflow = 'auto'
  const row = root.querySelector('#row')!
  const poses: Pose[] = ['idle', 'walk', 'dance', 'wave', 'cheer', 'sit', 'skate', 'idle']
  const views: AvatarView[] = []
  for (let i = 0; i < 16; i++) {
    const cell = document.createElement('div')
    cell.style.cssText = 'position:relative;width:110px;height:150px;background:#fff8;border-radius:12px'
    const v = new AvatarView(randomLook(0.9), 0.72)
    v.el.style.cssText = 'position:absolute;left:55px;top:140px'
    v.setPose(poses[i % poses.length])
    if (i % 3 === 1) v.face(-1, false)
    if (i === 7) v.face(1, true)
    cell.append(v.el)
    const lab = document.createElement('div')
    lab.textContent = v.pose
    lab.style.cssText = 'position:absolute;bottom:2px;left:6px;font:12px sans-serif'
    cell.append(lab)
    row.append(cell)
    views.push(v)
  }
  const icons = root.querySelector('#icons')!
  for (const it of ITEMS) {
    const c = document.createElement('div')
    c.style.cssText = 'background:#fff;border-radius:10px;padding:4px;text-align:center;font:9px sans-serif'
    c.innerHTML = `<div style="width:56px;height:56px;margin:auto">${itemIcon(it.id)}</div>${it.name}`
    icons.append(c)
  }
  let last = performance.now()
  const loop = (now: number) => {
    const dt = (now - last) / 1000
    last = now
    views.forEach((v) => v.update(dt))
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}
