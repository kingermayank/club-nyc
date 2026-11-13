import './tagWall.css'
import { audioCtx, sfx } from '../../audio'
import { el, stage } from '../../engine/stage'
import { world } from '../../engine/world'
import { bump, persist, save } from '../../state'
import type { Game } from '../../types'
import type { Pt } from '../../geometry'
import { closeX, hint, openMoment, pointer, shout, sparks } from './kit'

/**
 * Street Art, SoHo: the wall comes up close and you spray your own tag on it. Three cans (click one to pick it up),
 * hold the mouse and paint; hold still and it drips. Each can runs dry. Leave (x, Escape, click the street) and the
 * tag shrinks back onto the real wall, where it stays: the picture is kept small in localStorage for the next visit.
 * showSohoTag() can be called when the room loads to put it back up.
 */

const CANS = [
  { c: '#ffffff', d: '#c9cfdd' },
  { c: '#ff4fa3', d: '#b8246b' },
  { c: '#ffd166', d: '#c98a12' },
]
const W = 286
const H = 385
const PAINT = 4.2 // seconds of spray in a can
/** the bird's crown on the mural, in wall px: touch it up in yellow for the secret */
const CROWN = [20, 78, 112, 172]
const key = () => `club-nyc:soho-tag:${save.name}`

function stored(): string | null {
  try {
    return localStorage.getItem(key())
  } catch {
    return null
  }
}

/** Put the saved tag back on the room's wall (safe to call any time you are in SoHo). */
export function showSohoTag() {
  const c = world.geo?.cutouts.mural
  const src = stored()
  if (!c || !src || world.room.id !== 'soho') return
  stage.scene.querySelector('.mtg-onwall')?.remove()
  const [x, y, w, h] = c.rect
  const img = el('img', 'mtg-onwall') as HTMLImageElement
  img.src = src
  img.alt = ''
  img.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px`
  stage.scene.append(img)
}

export function tagTheWall(g: Game) {
  const c = world.geo?.cutouts.mural
  if (!c) return
  const [mx, my, mw, mh] = c.rect
  const m = openMoment('mo-tag')
  // the room steps back while you paint (under the HUD, so the corners stay readable)
  const dim = el('div', 'mtg-dim')
  stage.fx.append(dim)
  stage.scene.querySelector('.mtg-onwall')?.remove()

  const left = 478
  const top = 72
  const wall = el('div', 'mtg-wall')
  wall.style.cssText = `left:${left}px;top:${top}px;--fx:${mx - left}px;--fy:${my - top}px;--fs:${mw / W}`
  const art = el('img', 'mtg-art') as HTMLImageElement
  art.src = '/art/cutouts/soho/mural.png'
  art.alt = ''
  art.draggable = false
  const cv = el('canvas', 'mtg-cv') as HTMLCanvasElement
  cv.width = W
  cv.height = H
  const ctx = cv.getContext('2d')!
  wall.append(art, cv)
  const x = closeX(m)
  x.classList.add('mtg-x')
  wall.append(x)

  const rack = el('div', 'mtg-rack')
  rack.style.cssText = `left:${left - 150}px;top:${top + 232}px`
  const level = [1, 1, 1]
  const cans = CANS.map((k, i) => {
    const b = el('button', 'mtg-can', '<i class="mtg-cap"></i><i class="mtg-body"><b></b></i>')
    b.style.setProperty('--c', k.c)
    b.style.setProperty('--d', k.d)
    b.setAttribute('aria-label', `Can ${i + 1}`)
    b.onpointerdown = (e) => {
      e.stopPropagation()
      choose(i)
      sfx.tick()
    }
    rack.append(b)
    return b
  })
  // the can in your hand
  const hand = el('i', 'mtg-hand', '<i></i>')
  m.root.append(wall, rack, hand)
  const tip = hint(m, 'Spray your tag!', [left + W / 2, top + 150])

  // last visit's tag is still up until you start a new one
  const old = stored()
  let showingOld = false
  if (old) {
    const im = new Image()
    im.onload = () => {
      if (m.alive && !dabs) {
        ctx.drawImage(im, 0, 0, W, H)
        showingOld = true
      }
    }
    im.src = old
  }

  let cur = 0
  let down = false
  let at: Pt = [left + W / 2, top + H / 2]
  let last: Pt | null = null
  let still = 0
  let dabs = 0
  let crown = 0
  let done = false
  const used = new Set<number>()
  const drips: { x: number; y: number; left: number; col: string; r: number }[] = []

  function choose(i: number) {
    cur = i
    cans.forEach((b, k) => b.classList.toggle('on', k === i))
    hand.style.setProperty('--c', CANS[i].c)
    hand.style.setProperty('--d', CANS[i].d)
  }
  choose(0)

  // the hiss: one loop of noise, faded up while you spray
  let hiss: GainNode | null = null
  let src: AudioBufferSourceNode | null = null
  function hissTo(v: number) {
    const a = audioCtx()
    if (!a) return
    if (!hiss) {
      const buf = a.createBuffer(1, a.sampleRate, a.sampleRate)
      const d = buf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
      src = a.createBufferSource()
      src.buffer = buf
      src.loop = true
      const f = a.createBiquadFilter()
      f.type = 'highpass'
      f.frequency.value = 3200
      hiss = a.createGain()
      hiss.gain.value = 0
      src.connect(f).connect(hiss).connect(a.destination)
      src.start()
    }
    hiss.gain.setTargetAtTime(v, a.currentTime, 0.03)
  }

  function dab(px: number, py: number, r: number) {
    const k = CANS[cur]
    const grad = ctx.createRadialGradient(px, py, 0, px, py, r)
    grad.addColorStop(0, k.c)
    grad.addColorStop(0.55, k.c)
    grad.addColorStop(1, k.c + '00')
    ctx.fillStyle = grad
    ctx.globalAlpha = 0.5
    ctx.beginPath()
    ctx.arc(px, py, r, 0, 7)
    ctx.fill()
    // the speckle round the edge
    ctx.globalAlpha = 0.7
    ctx.fillStyle = k.c
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * 7
      const d = r * (0.7 + Math.random() * 0.7)
      ctx.fillRect(px + Math.cos(a) * d, py + Math.sin(a) * d, 1.6, 1.6)
    }
    ctx.globalAlpha = 1
    dabs++
    if (cur === 2 && px > CROWN[0] && px < CROWN[2] && py > CROWN[1] && py < CROWN[3]) crown++
  }

  function spray(dt: number) {
    if (!down || done) return hissTo(0)
    const px = at[0] - left
    const py = at[1] - top
    const on = px > -10 && px < W + 10 && py > -10 && py < H + 10
    if (!on || level[cur] <= 0) return hissTo(0)
    if (showingOld || !dabs) {
      // a fresh wall for a fresh tag
      if (showingOld) ctx.clearRect(0, 0, W, H)
      showingOld = false
      tip.remove()
    }
    hissTo(0.07)
    used.add(cur)
    level[cur] = Math.max(0, level[cur] - dt / PAINT)
    cans[cur].style.setProperty('--lv', String(level[cur]))
    const from = last ?? [px, py]
    const dist = Math.hypot(px - from[0], py - from[1])
    const n = Math.max(1, Math.ceil(dist / 4))
    for (let i = 1; i <= n; i++) dab(from[0] + ((px - from[0]) * i) / n, from[1] + ((py - from[1]) * i) / n, 11)
    last = [px, py]
    // hold still and it runs
    still = dist < 1.5 ? still + dt : 0
    if (still > 0.55) {
      still = 0.2
      drips.push({ x: px + (Math.random() - 0.5) * 8, y: py + 6, left: 30 + Math.random() * 50, col: CANS[cur].c, r: 2.6 })
      if (drips.length === 3) g.stamp('soho-drip')
    }
    if (level[cur] <= 0) {
      sfx.pop()
      cans[cur].classList.add('empty')
      const next = level.findIndex((l) => l > 0)
      if (next < 0) return m.later(finish, 350)
      choose(next)
    }
  }

  m.frame((dt) => {
    hand.style.transform = `translate(${at[0]}px, ${at[1]}px)`
    hand.classList.toggle('on', down && level[cur] > 0)
    spray(dt)
    for (const d of drips) {
      if (d.left <= 0) continue
      const step = Math.min(d.left, dt * 38)
      d.left -= step
      d.y += step
      ctx.fillStyle = d.col
      ctx.globalAlpha = 0.9
      ctx.beginPath()
      ctx.arc(d.x, d.y, d.r, 0, 7)
      ctx.fill()
      ctx.globalAlpha = 1
    }
  })

  m.root.addEventListener('pointermove', (e) => {
    at = pointer(e)
  })
  m.root.addEventListener('pointerdown', (e) => {
    at = pointer(e)
    const px = at[0] - left
    const py = at[1] - top
    if (done) return m.close()
    // the street, not the wall: you're finished
    if (px < -24 || px > W + 24 || py < -24 || py > H + 24) return dabs && !showingOld ? finish() : m.close()
    down = true
    last = null
    still = 0
    m.root.setPointerCapture(e.pointerId)
  })
  const up = () => {
    down = false
    last = null
  }
  m.root.addEventListener('pointerup', up)
  m.root.addEventListener('pointercancel', up)
  m.onKey((e) => {
    const n = '123'.indexOf(e.key)
    if (n < 0 || e.key.length !== 1) return
    if (level[n] > 0) choose(n)
    return true
  })

  function keep() {
    if (!dabs || showingOld) return
    // half size is plenty for a wall 143 px wide
    const small = document.createElement('canvas')
    small.width = W / 2
    small.height = Math.round(H / 2)
    small.getContext('2d')!.drawImage(cv, 0, 0, small.width, small.height)
    try {
      let url = small.toDataURL('image/webp', 0.8)
      if (!url.startsWith('data:image/webp')) url = small.toDataURL('image/png')
      localStorage.setItem(key(), url)
    } catch {
      /* a full or blocked store: the tag just doesn't outlive the visit */
    }
  }

  let kept = false
  function commit() {
    if (kept || !dabs || showingOld) return
    kept = true
    keep()
    bump('tag:made')
    persist()
    g.stamp('soho-tag')
    if (used.size === 3) g.stamp('wild-style')
    if (crown > 25) g.stamp('crown-touch-up')
  }

  function finish() {
    if (done) return
    done = true
    down = false
    hissTo(0)
    commit()
    hand.remove()
    rack.classList.add('away')
    wall.classList.add('back')
    sfx.whoosh()
    m.later(() => {
      showSohoTag()
      sparks(m, [mx + mw / 2, my + mh / 2], 12, '#fff')
      shout(m, 'TAGGED!', [Math.min(880, mx + mw / 2), my + mh + 34], 'gold')
      sfx.stamp()
      g.emote('cheer', 2)
      g.say(crown > 25 ? 'The crown needed work. Everyone knew.' : 'Gone by Tuesday. Art is like that.')
      m.later(() => m.close(), 2200)
    }, 620)
  }

  m.onClose(() => {
    dim.remove()
    try {
      src?.stop()
    } catch {
      /* never started */
    }
    // left by Escape or the x mid-tag: it still counts, and it still goes up
    if (!done) {
      commit()
      showSohoTag()
    }
  })
}
