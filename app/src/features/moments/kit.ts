import './moments.css'
import { sfx } from '../../audio'
import { el, stage, toStage } from '../../engine/stage'
import { hold } from '../../engine/ui'
import { world } from '../../engine/world'
import type { Pt } from '../../geometry'

/**
 * Landmark "moments": what clicking a landmark does instead of opening the same picture card everywhere.
 * A moment plays IN the room (or on its own little stage): you rub, toss, guess, with your hands on the thing itself.
 *
 * Each landmark gets its own file (bull.ts, coinToss.ts, flags.ts) and its own look; this kit is only the plumbing
 * they share: a layer over the stage, input that's held while it's open, Escape / Done, timers that clean up,
 * a small x, and click-away-to-leave. No panels, no captions: the thing itself is the interface.
 */
export interface Moment {
  root: HTMLElement
  alive: boolean
  close(): void
  /** keys while the moment is open (Escape always closes). Return true if you used the key. */
  onKey(f: (e: KeyboardEvent) => boolean | void): void
  /** a timeout that dies with the moment */
  later(f: () => void, ms: number): void
  /** every animation frame while open: dt in seconds, t seconds since the moment opened */
  frame(f: (dt: number, t: number) => void): void
  /** run when the moment closes (restore a filter, drop a class) */
  onClose(f: () => void): void
}

let current: Moment | null = null

export function openMoment(cls: string): Moment {
  current?.close()
  const release = hold()
  const room = world.room
  const root = el('div', 'moment ' + cls)
  const timers: number[] = []
  const keyers: ((e: KeyboardEvent) => boolean | void)[] = []
  const frames: ((dt: number, t: number) => void)[] = []
  const closers: (() => void)[] = []
  let raf = 0
  const t0 = performance.now()
  let last = t0

  const m: Moment = {
    root,
    alive: true,
    close() {
      if (!m.alive) return
      m.alive = false
      if (current === m) current = null
      for (const t of timers) clearTimeout(t)
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', key, true)
      for (const f of closers) f()
      root.classList.add('out')
      setTimeout(() => root.remove(), 260)
      release()
    },
    onKey: (f) => void keyers.push(f),
    later(f, ms) {
      timers.push(window.setTimeout(() => m.alive && f(), ms))
    },
    frame: (f) => void frames.push(f),
    onClose: (f) => void closers.push(f),
  }

  function key(e: KeyboardEvent) {
    if (!m.alive) return
    // typing in the chat bar is never ours
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      sfx.click()
      return m.close()
    }
    for (const f of keyers) {
      if (f(e)) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
    }
  }
  window.addEventListener('keydown', key, true)

  const tick = (now: number) => {
    if (!m.alive) return
    // walked (or were carried) out of the room: the moment goes with it
    if (world.room !== room) return m.close()
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    for (const f of frames) f(dt, (now - t0) / 1000)
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)

  // the scrim: the room dims and a soft spotlight stays on whatever the moment put on stage, so the eye goes there
  const scrim = el('div', 'mo-scrim')
  root.append(scrim)
  const aim = () => {
    if (!m.alive || !scrim.isConnected) return
    const sr = stage.root.getBoundingClientRect()
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
    for (const c of root.children) {
      if (c === scrim) continue
      const r = c.getBoundingClientRect()
      const [a, b, w, h] = [(r.left - sr.left) / stage.scale, (r.top - sr.top) / stage.scale, r.width / stage.scale, r.height / stage.scale]
      // skip empty nodes and full-stage layers (pads, backdrops): they say nothing about where the action is
      if (w < 4 || h < 4 || w * h > 1000 * 565 * 0.6) continue
      x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, a + w); y2 = Math.max(y2, b + h)
    }
    if (x2 < x1) return
    scrim.style.setProperty('--fx', `${(x1 + x2) / 2}px`)
    scrim.style.setProperty('--fy', `${(y1 + y2) / 2}px`)
    scrim.style.setProperty('--fr', `${Math.max(150, Math.hypot(x2 - x1, y2 - y1) / 2 + 70)}px`)
    scrim.classList.add('on')
  }
  for (const ms of [120, 500, 1400, 3000]) m.later(aim, ms)

  stage.root.append(root)
  current = m
  return m
}

/** The room's traced picture of a thing (the bull, the statue), so a moment can make it shine or shake. */
export function cutoutImg(obj: string): HTMLImageElement | undefined {
  const room = world.room.geo ?? world.room.id
  return [...stage.scene.querySelectorAll<HTMLImageElement>('.cutout')].find((i) => i.src.endsWith(`/${room}/${obj}.png`))
}

/** A small round close button; the caller places it (never over the coins and level in the corner). */
export function closeX(m: Moment): HTMLButtonElement {
  const b = el('button', 'mo-x', '<svg viewBox="0 0 20 20"><path d="M5 5 L15 15 M15 5 L5 15" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/></svg>')
  b.setAttribute('aria-label', 'Close')
  b.onpointerdown = (e) => e.stopPropagation()
  b.onclick = (e) => {
    e.stopPropagation()
    sfx.click()
    m.close()
  }
  return b
}

/** Clicking the room around the thing ends the moment: no Done button needed. */
export function clickAwayCloses(m: Moment) {
  m.root.addEventListener('pointerdown', (e) => {
    if (e.target === m.root) m.close()
  })
}

/** A speech-bubble hint pinned to a spot on the stage (tail pointing down at it). */
export function hint(m: Moment, text: string, at: Pt): HTMLElement {
  const h = el('div', 'mo-hint', `<span>${text}</span>`)
  h.style.left = `${at[0]}px`
  h.style.top = `${at[1]}px`
  m.root.append(h)
  return h
}

/** A few sparkles flying out of a point. */
export function sparks(m: Moment, at: Pt, n = 6, color = '#ffe08a') {
  for (let i = 0; i < n; i++) {
    const s = el('i', 'mo-spark')
    const a = Math.random() * Math.PI * 2
    const d = 14 + Math.random() * 26
    s.style.cssText = `left:${at[0]}px;top:${at[1]}px;background:${color};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 8}px`
    m.root.append(s)
    setTimeout(() => s.remove(), 620)
  }
}

/** big words that pop over a spot and float away ("SPLASH!", "+1") */
export function shout(m: Moment, text: string, at: Pt, cls = '') {
  const s = el('div', 'mo-shout ' + cls, text)
  s.style.left = `${at[0]}px`
  s.style.top = `${at[1]}px`
  m.root.append(s)
  setTimeout(() => s.remove(), 1300)
}

export const pointer = (e: PointerEvent): Pt => toStage(e)
export const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]

/** today in New York as a number (20261111): luck, streaks and "once a day" things turn over at NYC midnight */
export function nycDay(now = new Date()): number {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  return Number(s.replace(/-/g, ''))
}

/** a small stable hash, for "the same answer all day" */
export function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}
