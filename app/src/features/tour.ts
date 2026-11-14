import { sfx } from '../audio'
import { save, persist } from '../state'
import { stage, el } from '../engine/stage'
import { world, depthScale } from '../engine/world'
import { ui } from '../engine/ui'
import type { Pt } from '../geometry'
import { avatarPortrait } from '../avatar/render'
import type { Look } from '../avatar/look'

/**
 * The first-day tour. Rosa, the super in your building, walks a new New Yorker through the city one thing at a
 * time: a spotlight on the part of the screen she's talking about, a speech card, Back / Next / Skip.
 * New players get it right after making their New Yorker; anyone can replay it with the ? button.
 * `pointAt` reuses the spotlight for one-off "Show me" hints (the first-day checklist uses it).
 */
export const GUIDE = {
  name: 'Rosa',
  role: 'your building’s super',
  look: { skin: 3, hair: 'curly', hairColor: 1, items: { body: 'denim-jacket', legs: 'black-jeans', feet: 'boots', neck: 'lanyard', hand: 'coffee' } } as Look,
}

/** a stage rectangle [x1, y1, x2, y2] (for invisible click zones) */
type Rect4 = [number, number, number, number]
export type Target = () => Element | Rect4 | null | undefined
interface Step {
  /** what to spotlight; nothing (or not on screen) = a centred card */
  target?: Target
  title: string
  text: string
  /** the player can act during this step (clicks pass through); resolves when they've done it */
  doIt?: () => boolean
  /** a "Show me" pointer: a click on the lit-up thing reaches it (and puts the pointer away); the dimmed city around
   * it still takes no clicks (one there just puts the pointer away) */
  through?: boolean
  /** button labels for the first and last cards */
  next?: string
  skip?: string
  /** a glowing spot on the ground to click (the walking step): lit together with the target, so the spotlight
   * never says "click yourself" */
  spot?: () => Pt | null
  /** an extra action button (e.g. "Take Me to Times Square") that closes the card and does something */
  action?: { label: string; act: () => void }
}

export const toolbarButton = (label: string): Target => () => stage.toolbar.querySelector(`[aria-label="${label}"]`)
const tb = toolbarButton
const q = (sel: string): Target => () => stage.root.querySelector(sel)

/** an interactive prop in the current room, optionally one whose label matches (e.g. /hot dog|slice/i) */
export function hotspot(match?: RegExp): Target {
  return () => {
    const hits = world.hits.filter((h) => h.kind !== 'seat' && h.def?.label && !h.def.decor && (!match || match.test(h.def.label)))
    // prefer things near the middle of the screen
    hits.sort((a, b) => Math.abs((a.rect[0] + a.rect[2]) / 2 - 500) - Math.abs((b.rect[0] + b.rect[2]) / 2 - 500))
    const h = hits[0]
    if (!h) return null
    return h.kind === 'cutout' && h.img ? h.img : h.rect
  }
}

/** you: your drawing plus the name tag under your feet (the actor's wrappers have no size; the drawing does) */
const you: Target = () => {
  const svg = world.player?.view.el.querySelector('svg')
  if (!svg || !visible(svg)) return null
  const a = boxOf(svg)
  const t = visible(world.player.tag) ? boxOf(world.player.tag) : a
  return [Math.min(a.x, t.x), Math.min(a.y, t.y), Math.max(a.x + a.w, t.x + t.w), Math.max(a.y + a.h, t.y + t.h)]
}

/** a clear bit of pavement a few steps from you (towards the middle of the room, away from other people):
 * where the walking step points */
function groundSpot(): Pt | null {
  const nav = world.nav, p = world.player?.pos
  if (!nav || !p) return null
  const toward = p[0] < 500 ? 1 : -1
  const tries: Pt[] = []
  for (const dx of [170, 120, 220, 80]) for (const dy of [12, 40, -20]) for (const side of [toward, -toward]) tries.push([p[0] + dx * side, p[1] + dy])
  // away from other people if possible (a crowd, like a Dance Jam, may not leave room: clicks there still walk)
  for (const clearOfPeople of [true, false])
    for (const t of tries) {
      const q = nav.nearest([t[0], Math.min(t[1], 466)])
      // somewhere the click reaches the pavement: not under the toolbar, the quest list or the notices corner
      if (q[1] > 474 || (q[0] < 280 && q[1] < 190) || (q[0] > 640 && q[1] > 400)) continue
      if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 70) continue
      if (clearOfPeople && world.npcs.some((a) => Math.hypot(a.pos[0] - q[0], a.pos[1] - q[1]) < 70)) continue
      return q
    }
  return null
}

function steps(replay = false): Step[] {
  const from = world.player ? [...world.player.pos] : [0, 0]
  // Five cards, no more: a welcome, then four things to know. Everything else the city teaches as you go (the
  // first-day list, "Show me", hover labels).
  const list: Step[] = [
    {
      title: `Welcome to New York, ${save.name || 'neighbor'}!`,
      text: `I’m ${GUIDE.name}, ${GUIDE.role}. Four quick things, then I’ve got a boiler to fix.`,
      next: 'Show me around',
      skip: 'I’ll Explore on My Own',
    },
    {
      target: you,
      spot: groundSpot,
      title: 'Walk Around',
      text: 'Click anywhere on the ground to walk there. Try the glowing spot!',
      // moved by more than a step (works on a replay too, when walks are no longer counted)
      doIt: () => !!world.player && Math.hypot(world.player.pos[0] - from[0], world.player.pos[1] - from[1]) > 40,
    },
    {
      target: () => hotspot(/hot dog|cart|slice|souvenir|pretzel|coffee/i)() ?? hotspot()(),
      title: 'Things That Glow Are Clickable',
      text: 'Carts, shops and doors light up when you hover. Click them for snacks, clothes and jobs that pay coins.',
    },
    {
      target: q('.chat-input'),
      title: 'Say Hi and Make Friends',
      text: 'Type here and press Enter to talk to the room. Click any New Yorker to add them as a friend.',
    },
    {
      target: tb('Map'),
      title: 'Go Anywhere',
      text: 'The map and the subway take you all over the city. Your first-day list (top left) shows what to try next.',
      next: 'Let’s Go!',
    },
  ]
  // a replay (the ? button, Phone > How to Play) is a refresher: no day-one welcome, straight to the four things
  if (replay) list.shift()
  // skip spots that aren't on screen (e.g. a room with nothing to click)
  return list.filter((s) => !s.target || visible(s.target()))
}

function visible(e: Element | Rect4 | null | undefined): boolean {
  if (Array.isArray(e)) return e[2] > e[0] && e[3] > e[1]
  if (!(e instanceof HTMLElement || e instanceof SVGElement)) return false
  const r = e.getBoundingClientRect()
  return r.width > 0 && r.height > 0
}

/** a target's box in stage coordinates (the stage is scaled to fit the window) */
function boxOf(e: Element | Rect4): { x: number; y: number; w: number; h: number } {
  if (Array.isArray(e)) return { x: e[0], y: e[1], w: e[2] - e[0], h: e[3] - e[1] }
  const r = e.getBoundingClientRect()
  const root = stage.root.getBoundingClientRect()
  const k = stage.scale || 1
  return { x: (r.left - root.left) / k, y: (r.top - root.top) / k, w: r.width / k, h: r.height / k }
}

/** Where the card goes: below the spotlight, else above, else beside it, so it never covers what it's pointing
 * at. Only if nothing fits does it overlap, as little as it can. */
function cardSpot(b: { x: number; y: number; w: number; h: number }, pad: number, cardH: number): [number, number] {
  const cw = 380, gap = 14, W = 1000, H = 565, m = 8
  const hx1 = b.x - pad, hy1 = b.y - pad, hx2 = b.x + b.w + pad, hy2 = b.y + b.h + pad
  const clampX = (x: number) => Math.max(m + 2, Math.min(W - cw - m - 2, x))
  const clampY = (y: number) => Math.max(m, Math.min(H - cardH - m, y))
  const midX = clampX(b.x + b.w / 2 - cw / 2), midY = clampY(b.y + b.h / 2 - cardH / 2)
  const options: [number, number][] = [
    [midX, hy2 + gap], // below
    [midX, hy1 - gap - cardH], // above
    [hx2 + gap, midY], // right
    [hx1 - gap - cw, midY], // left
  ]
  const fits = ([x, y]: [number, number]) => x >= m && y >= m && x + cw <= W - m && y + cardH <= H - m
  const overlap = ([x, y]: [number, number]) => Math.max(0, Math.min(x + cw, hx2) - Math.max(x, hx1)) * Math.max(0, Math.min(y + cardH, hy2) - Math.max(y, hy1))
  const clear = options.find((o) => fits(o) && overlap(o) === 0)
  if (clear) return clear
  const inside = options.map(([x, y]) => [clampX(x), clampY(y)] as [number, number])
  return inside.sort((p, q) => overlap(p) - overlap(q))[0]
}

/** A point on screen (client px) that's surely on a target: for a prop, a solid bit of its drawing near the middle
 * with nobody standing in front of it; for anything else, its middle. */
function aimAt(t: Element | Rect4): [number, number] {
  const root = stage.root.getBoundingClientRect()
  const k = stage.scale || 1
  const client = (x: number, y: number): [number, number] => [root.left + x * k, root.top + y * k]
  const b = boxOf(t)
  const mid: Pt = [b.x + b.w / 2, b.y + b.h / 2]
  const hit = world.hits.find((h) => (Array.isArray(t) ? h.rect === t : h.img === t))
  if (!hit) return client(mid[0], mid[1])
  // someone standing in front takes the click (people come first in the city's hit test)
  const behindSomeone = (p: Pt) =>
    world.npcs.some((a) => {
      const sc = depthScale(a.pos[1])
      return !a.leaving && Math.abs(p[0] - a.pos[0]) < 24 * sc && p[1] > a.pos[1] - 114 * sc && p[1] < a.pos[1] + 26 * sc
    })
  const [x1, y1, x2, y2] = hit.rect
  const al = hit.kind === 'cutout' ? hit.alpha : undefined
  const solid = (ax: number, ay: number) => !al || (ax >= 0 && ay >= 0 && ax < al.w && ay < al.h && al.data[(ay * al.w + ax) * 4 + 3] > 60)
  const cols = al?.w ?? 24, rows = al?.h ?? 24
  let best: Pt | null = null, bestD = Infinity
  for (let ay = 2; ay < rows - 2; ay += 2)
    for (let ax = 2; ax < cols - 2; ax += 2) {
      // solid here and a couple of pixels either side (not a hairline edge)
      if (!solid(ax, ay) || !solid(ax - 2, ay) || !solid(ax + 2, ay) || !solid(ax, ay - 2) || !solid(ax, ay + 2)) continue
      const p: Pt = [x1 + ((ax + 0.5) / cols) * (x2 - x1), y1 + ((ay + 0.5) / rows) * (y2 - y1)]
      const d = Math.hypot(p[0] - mid[0], p[1] - mid[1])
      if (d >= bestD || behindSomeone(p)) continue
      best = p
      bestD = d
    }
  const p = best ?? mid
  return client(p[0], p[1])
}

let active: { close: () => void } | null = null
export const tourOpen = () => !!active

/** One spotlight + card. Resolves with how the card was left. */
function showCard(step: Step, index: number, count: number): Promise<'next' | 'back' | 'skip'> {
  return new Promise((resolve) => {
    const through = !!step.through && !step.doIt
    const layer = el('div', 'tour' + (step.doIt ? ' tour-try' : through ? ' tour-point' : ''))
    const hole = el('div', 'tour-hole')
    // four dim panels around the spotlight (a giant box-shadow isn't painted reliably everywhere)
    const dims = [0, 1, 2, 3].map(() => el('div', 'tour-dim'))
    const card = el('div', 'tour-card')
    const target = step.target?.()
    const dots = count > 2 ? `<div class="tour-dots">${Array.from({ length: count }, (_, i) => `<i class="${i === index ? 'on' : ''}"></i>`).join('')}</div>` : ''
    card.innerHTML = `<div class="tour-face">${avatarPortrait(GUIDE.look, 'grin')}</div>
      <div class="tour-body"><small>${GUIDE.name}</small><b>${step.title}</b><p>${step.text}</p>${dots}
      <div class="tour-btns">${index > 0 && index < count - 1 ? '<button class="btn tiny ghost tour-back">Back</button>' : ''}<button class="btn tiny ghost tour-skip">${step.skip ?? (index === count - 1 ? '' : 'Skip Tour')}</button>${step.action ? `<button class="btn tiny go tour-act">${step.action.label}</button>` : ''}<button class="btn tiny ${step.action ? 'ghost' : 'go'} tour-next">${step.next ?? 'Next'}</button></div></div>`
    if (!card.querySelector('.tour-skip')!.textContent) card.querySelector('.tour-skip')!.remove()
    layer.append(...dims, hole, card)
    // the walking step's glowing spot (clicks fall through it to the ground underneath)
    const spotAt = step.spot?.() ?? null
    if (spotAt) {
      const spotEl = el('div', 'tour-spot', '<i></i><span>Click here</span>')
      Object.assign(spotEl.style, { left: `${spotAt[0]}px`, top: `${spotAt[1]}px` })
      layer.append(spotEl)
    }
    const shade = (x: number, y: number, w: number, h: number) => {
      const r = [
        [0, 0, 1000, Math.max(0, y)], // above
        [0, y + h, 1000, Math.max(0, 565 - y - h)], // below
        [0, y, Math.max(0, x), h], // left
        [x + w, y, Math.max(0, 1000 - x - w), h], // right
      ]
      dims.forEach((d, i) => Object.assign(d.style, { left: `${r[i][0]}px`, top: `${r[i][1]}px`, width: `${r[i][2]}px`, height: `${r[i][3]}px` }))
    }
    stage.root.append(layer)
    // place the spotlight, and the card beside it where there's room
    const place = () => {
      const t = step.target?.()
      if (!t || !visible(t)) {
        layer.classList.add('tour-center')
        shade(0, 0, 1000, 0)
        return
      }
      let b = boxOf(t)
      if (spotAt) {
        // light the spot too: one spotlight around you and the place to click
        const x1 = Math.min(b.x, spotAt[0] - 34), y1 = Math.min(b.y, spotAt[1] - 30)
        const x2 = Math.max(b.x + b.w, spotAt[0] + 34), y2 = Math.max(b.y + b.h, spotAt[1] + 16)
        b = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
      }
      const pad = 8
      Object.assign(hole.style, { left: `${b.x - pad}px`, top: `${b.y - pad}px`, width: `${b.w + pad * 2}px`, height: `${b.h + pad * 2}px` })
      shade(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2)
      const [left, top] = cardSpot(b, pad, card.offsetHeight || 170)
      Object.assign(card.style, { left: `${left}px`, top: `${top}px` })
    }
    if (!target) layer.classList.add('tour-center')
    requestAnimationFrame(place)
    const follow = setInterval(place, 250) // targets can move (you walking, a panel resizing)
    let done = false
    const finish = (how: 'next' | 'back' | 'skip') => {
      if (done) return
      done = true
      clearInterval(follow)
      clearInterval(watch)
      layer.dispatchEvent(new Event('remove-keys'))
      layer.classList.add('out')
      setTimeout(() => layer.remove(), 200)
      active = null
      resolve(how)
    }
    // "try it" steps move on by themselves once you've done the thing
    const watch = setInterval(() => {
      if (step.doIt?.()) {
        sfx.stamp()
        setTimeout(() => finish('next'), 500)
      }
    }, 300)
    card.querySelector<HTMLButtonElement>('.tour-next')!.onclick = (e) => {
      e.stopPropagation()
      sfx.click()
      finish('next')
    }
    card.querySelector<HTMLButtonElement>('.tour-act')?.addEventListener('click', (e) => {
      e.stopPropagation()
      sfx.click()
      finish('next')
      step.action!.act()
    })
    card.querySelector<HTMLButtonElement>('.tour-back')?.addEventListener('click', (e) => {
      e.stopPropagation()
      sfx.click()
      finish('back')
    })
    card.querySelector<HTMLButtonElement>('.tour-skip')?.addEventListener('click', (e) => {
      e.stopPropagation()
      sfx.click()
      finish('skip')
    })
    // clicks on the dimmed city do nothing during an explain step (in a "try it" step they reach the city)
    for (const ev of ['pointerdown', 'mousedown', 'click']) layer.addEventListener(ev, (e) => e.stopPropagation())
    if (through) {
      // "Show me": the lit-up thing is live (the layer lets the pointer through: see .tour-point in style.css). A
      // click anywhere inside the yellow ring counts as a click on the thing itself, so it's passed on to a spot
      // that's surely on it (a prop's drawing can have see-through parts, like the mouth of the pizza oven, and the
      // ring is a little bigger than the thing), and the pointer puts itself away. A click on the dimmed city just
      // puts the pointer away.
      const onClick = (e: MouseEvent) => {
        if (!e.isTrusted || layer.classList.contains('tour-center') || card.contains(e.target as Node)) return
        const h = hole.getBoundingClientRect()
        if (e.clientX < h.left || e.clientX > h.right || e.clientY < h.top || e.clientY > h.bottom) return
        const t = step.target?.()
        const at = t && visible(t) ? aimAt(t) : null
        finish('next')
        if (!at) return
        e.stopPropagation()
        e.preventDefault()
        document.elementFromPoint(at[0], at[1])?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, clientX: at[0], clientY: at[1] }))
      }
      window.addEventListener('click', onClick, true)
      layer.addEventListener('remove-keys', () => window.removeEventListener('click', onClick, true))
      for (const d of dims) d.addEventListener('click', () => finish('next'))
    }
    // keyboard: → / Enter next, ← back, Esc skip; other game keys wait until the card is closed
    // (while a panel is open the tour steps aside, and the keys belong to the panel)
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || ui.modal) return
      e.stopPropagation()
      e.preventDefault()
      if (e.key === 'Escape') finish('skip')
      else if (e.key === 'Enter' || e.key === 'ArrowRight') finish('next')
      else if (e.key === 'ArrowLeft' && index > 0) finish('back')
    }
    window.addEventListener('keydown', onKey, true)
    layer.addEventListener('remove-keys', () => window.removeEventListener('keydown', onKey, true))
    active = { close: () => finish('skip') }
  })
}

/** The full tour. Resolves when it's finished or skipped. */
export async function startTour(): Promise<void> {
  if (active) return
  world.player?.hush() // Rosa's talking now (your hello would peek out from under her card)
  // 'offered' only means the invitation was shown: Rosa hasn't walked them round yet
  const list = steps(save.tour === 'done' || save.tour === 'skipped')
  let i = 0
  while (i < list.length) {
    const how = await showCard(list[i], i, list.length)
    if (how === 'skip') {
      if (save.tour !== 'done') save.tour = 'skipped'
      break
    }
    i = how === 'back' ? Math.max(0, i - 1) : i + 1
    if (i === list.length) save.tour = 'done'
  }
  persist()
}

/** A one-off spotlight ("Show me" on a checklist item). Falls back to a centred card when the thing isn't on screen. */
export async function pointAt(target: Target | undefined, title: string, text: string, action?: Step['action'], extra: Partial<Step> = {}): Promise<void> {
  active?.close()
  await showCard({ target, title, text, next: 'Got It', action, through: true, ...extra }, 0, 1)
}

/** "Show me" for walking: you and a glowing spot on the ground to click (never "click yourself") */
export function pointAtWalk(title: string, text: string): Promise<void> {
  const from = world.player ? [...world.player.pos] : [0, 0]
  return pointAt(you, title, text, undefined, {
    spot: groundSpot,
    doIt: () => !!world.player && Math.hypot(world.player.pos[0] - from[0], world.player.pos[1] - from[1]) > 40,
  })
}

/** Close any open card (e.g. when a game starts). */
export const closeTour = () => active?.close()
