import './selfie.css'
import { audioCtx, onMute, sfx } from '../../audio'
import { avatarMarkup } from '../../avatar/render'
import { ITEM, ink } from '../../avatar/items'
import { SKINS, sigColor, type Look } from '../../avatar/look'
import { el, stage } from '../../engine/stage'
import { hold } from '../../engine/ui'
import { world } from '../../engine/world'
import { mp } from '../../net/multiplayer'
import { bump, save } from '../../state'
import type { Game } from '../../types'
import { SELFIE_SPOTS, type SelfieSpot } from '../../data/selfieSpots'

/**
 * A selfie with Lady Liberty. The screen is your phone in selfie mode: the island's own painting behind you, cropped
 * so she stands over your shoulder, your New Yorker big in the front with an arm out holding the phone. Pick a pose
 * (Torch Up copies hers, with the foam torch if you own one; Foam Crown if you own the crown; Peace Sign; Palm Trick,
 * the forced-perspective one where she stands on your open hand). Anyone standing near you squeezes in, like the
 * photo booth (your friends and the city's locals; strangers stay out). Snap: a flash, the shutter, and a Polaroid
 * slides out and develops. Save it like a photo-booth strip.
 *
 * True details: her torch arm is 42 feet long; 151 feet from the top of the pedestal to the torch; the crown's 25
 * windows and seven rays; a gift from the people of France, dedicated in 1886.
 */

/** the viewfinder, in its own pixels (it sits at 64, 16 on the stage) */
const VW = 802
const VH = 533
/** Lady Liberty in the painting's pixels (2000 × 1131): her middle, where her feet meet the pedestal */
const LADY = { x: 1430, feet: 297 }
const ART_W = 2000
const ART_H = 1131

type PoseId = 'torch' | 'crown' | 'peace' | 'palm' | 'fist'
interface Frame {
  /** the painting: scale (of its 2000 px width) and offset, in viewfinder px */
  bg: { s: number; x: number; y: number }
  me: { x: number; feet: number; S: number }
  crowd: { x: number; feet: number; S: number; tilt: number }[]
  mood: 'smile' | 'grin' | 'o'
  zoom: string
}
const portrait = (): Omit<Frame, 'mood'> => ({
  bg: { s: 1.25, x: Math.round(668 - LADY.x * 1.25), y: 0 },
  me: { x: 322, feet: 610, S: 3.1 },
  crowd: [
    { x: 128, feet: 598, S: 2.6, tilt: -5 },
    { x: 522, feet: 640, S: 2.4, tilt: 6 },
    { x: 618, feet: 646, S: 2.0, tilt: 4 },
  ],
  zoom: '1×',
})
const FRAMES: Record<PoseId, Frame> = {
  fist: { ...portrait(), mood: 'grin' },
  torch: { ...portrait(), mood: 'smile' },
  crown: { ...portrait(), mood: 'grin' },
  peace: { ...portrait(), mood: 'grin' },
  // the wide lens: she gets small enough to stand on your hand
  palm: {
    bg: { s: 0.5, x: Math.round(612 - LADY.x * 0.5), y: 60 },
    me: { x: 210, feet: 600, S: 2.9 },
    crowd: [
      { x: 58, feet: 590, S: 2.4, tilt: -4 },
      { x: 392, feet: 628, S: 2.2, tilt: 5 },
      { x: 486, feet: 650, S: 2.0, tilt: 4 },
    ],
    mood: 'grin',
    zoom: '0.5×',
  },
}
/** anywhere but Liberty Island: the painting framed so the landmark stands over your shoulder */
function landmarkFrame(spot: SelfieSpot, mood: Frame['mood']): Frame {
  const [x, y, w, h] = spot.box.map((v) => v * 2)
  const s = Math.max(VH / ART_H, Math.min(2, (VH * 0.78) / h))
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  return {
    ...portrait(),
    bg: { s, x: Math.round(clamp(VW * 0.72 - (x + w / 2) * s, VW - ART_W * s, 0)), y: Math.round(clamp(VH * 0.42 - (y + h / 2) * s, VH - ART_H * s, 0)) },
    mood,
  }
}
const LABEL: Record<PoseId, string> = { torch: 'Torch Up', crown: 'Foam Crown', peace: 'Peace Sign', palm: 'Palm Trick', fist: 'Fist Pump' }

/**
 * Everyone close enough to squeeze in, the photo booth's rule (features/photobooth.ts): your friends and the city's
 * locals, never strangers, at most three.
 */
function crowd(): Look[] {
  const me = world.player
  if (!me) return []
  return world.npcs
    .filter((a) => !a.leaving && (!a.remote || mp.friends.has(a.remote.id)) && Math.hypot(a.pos[0] - me.pos[0], (a.pos[1] - me.pos[1]) * 1.6) < 210)
    .sort((a, b) => Math.hypot(a.pos[0] - me.pos[0], a.pos[1] - me.pos[1]) - Math.hypot(b.pos[0] - me.pos[0], b.pos[1] - me.pos[1]))
    .slice(0, 3)
    .map((a) => a.look)
}

/** a tapered limb from a to b in avatar units: skin, with a sleeve over the first part of it */
function limb(a: number[], b: number[], skin: string, sleeve: { color: string; upTo: number } | null, w0 = 9.6, w1 = 9.6): string {
  const band = (p: number[], q: number[], r0: number, r1: number, fill: string) => {
    const dx = q[0] - p[0]
    const dy = q[1] - p[1]
    const l = Math.hypot(dx, dy) || 1
    const nx = -dy / l
    const ny = dx / l
    const f = (n: number) => n.toFixed(2)
    return `<path d="M ${f(p[0] + nx * r0)} ${f(p[1] + ny * r0)} L ${f(q[0] + nx * r1)} ${f(q[1] + ny * r1)} A ${f(r1)} ${f(r1)} 0 0 1 ${f(q[0] - nx * r1)} ${f(q[1] - ny * r1)} L ${f(p[0] - nx * r0)} ${f(p[1] - ny * r0)} A ${f(r0)} ${f(r0)} 0 0 1 ${f(p[0] + nx * r0)} ${f(p[1] + ny * r0)} Z" fill="${fill}" stroke="${ink(fill)}" stroke-width="2.8" stroke-linejoin="round"/>`
  }
  let s = band(a, b, w0 / 2, w1 / 2, skin)
  if (sleeve && sleeve.upTo > 0) {
    const t = Math.min(1, sleeve.upTo)
    const m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    s += band(a, m, w0 / 2 + 1.1, (w0 + (w1 - w0) * t) / 2 + 1.1, sleeve.color)
  }
  return s
}
const fist = (p: number[], skin: string, r = 6.8) => `<circle cx="${p[0].toFixed(2)}" cy="${p[1].toFixed(2)}" r="${r}" fill="${skin}" stroke="${ink(skin)}" stroke-width="2.8"/>`

/** the island's foam torch, upright in a raised fist (avatar units, fist at 0, 0) */
const FOAM_TORCH = `<g>
  <path d="M -3.6 -4 L 3.6 -4 L 3 16 L -3 16 Z" fill="#5fbf8f" stroke="#1d4a36" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M -9 -13 L 9 -13 L 5 -4 L -5 -4 Z" fill="#7fd3a6" stroke="#1d4a36" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M -10.5 -15.5 L 10.5 -15.5 L 9.5 -12.5 L -9.5 -12.5 Z" fill="#6cc596" stroke="#1d4a36" stroke-width="2" stroke-linejoin="round"/>
  <path d="M 0 -42 C -10 -32 -9 -21 -1 -16 C 9 -19 10 -30 0 -42 Z" fill="#ffb11f" stroke="#a5560b" stroke-width="2.4" stroke-linejoin="round"/>
  <path d="M 0 -32 C -4 -27 -3 -21 0 -19 C 4 -21 4 -27 0 -32 Z" fill="#ffe27a"/>
</g>`

/** two fingers up (avatar units, fist at p) */
const peace = (p: number[], skin: string) => {
  const f = (dx: number, tip: number[]) => `<path d="M ${p[0] + dx} ${p[1] - 3} L ${p[0] + tip[0]} ${p[1] + tip[1]}" stroke="${ink(skin)}" stroke-width="7.4" stroke-linecap="round"/><path d="M ${p[0] + dx} ${p[1] - 3} L ${p[0] + tip[0]} ${p[1] + tip[1]}" stroke="${skin}" stroke-width="4.4" stroke-linecap="round"/>`
  return f(-2, [-7, -19]) + f(2.2, [6, -19.5]) + fist(p, skin)
}

/** an open hand, palm up, fingers pointing away (avatar units, the middle of the palm's top at p) */
const openHand = (p: number[], skin: string) => {
  const k = ink(skin)
  const [x, y] = p
  const fingers = [0, 1, 2, 3]
    .map((i) => {
      const y0 = y + 3.2 - i * 0.9
      const len = [15, 17, 16, 12][i]
      return `<path d="M ${x + 4} ${y0} L ${x + 4 + len} ${y0 - 0.6 - i * 0.4}" stroke="${k}" stroke-width="6.6" stroke-linecap="round"/><path d="M ${x + 4} ${y0} L ${x + 4 + len} ${y0 - 0.6 - i * 0.4}" stroke="${skin}" stroke-width="3.8" stroke-linecap="round"/>`
    })
    .reverse()
    .join('')
  const palm = `<path d="M ${x - 12} ${y + 1} C ${x - 12} ${y - 1.5}, ${x + 8} ${y - 1.2}, ${x + 9} ${y + 1} C ${x + 9} ${y + 6}, ${x - 2} ${y + 9}, ${x - 12} ${y + 7} Z" fill="${skin}" stroke="${k}" stroke-width="2.8" stroke-linejoin="round"/>`
  const thumb = `<path d="M ${x - 9} ${y + 1} L ${x - 13} ${y - 8}" stroke="${k}" stroke-width="7" stroke-linecap="round"/><path d="M ${x - 9} ${y + 1} L ${x - 13} ${y - 8}" stroke="${skin}" stroke-width="4.2" stroke-linecap="round"/>`
  return fingers + palm + thumb
}

/** where the sleeves are and what colour, from the top you're wearing */
function sleeveOf(look: Look): { color: string; kind: 'short' | 'long' | 'none' } {
  const top = (look.items.body && ITEM[look.items.body]?.top) || { color: '#7aa0d8', sleeves: 'short' as const }
  const color = top.signature ? sigColor(look) : (top.sleeveColor ?? top.color)
  return { color, kind: top.sleeves }
}

export const libertySelfie = (g: Game) => landmarkSelfie(g, 'liberty-island')

/** the selfie spot for a room, if it has one */
export const selfieSpot = (room: string): SelfieSpot | undefined => SELFIE_SPOTS[room]

export function landmarkSelfie(g: Game, room: string) {
  const spot = SELFIE_SPOTS[room]
  if (!spot) return
  const liberty = room === 'liberty-island'
  const ART = `/art/rooms/${spot.art}.jpg`
  const SKY = spot.sky
  const frames: Record<PoseId, Frame> = liberty ? FRAMES : { ...FRAMES, peace: landmarkFrame(spot, 'grin'), fist: landmarkFrame(spot, 'grin') }
  const release = hold()
  const friends = crowd()
  const ownsTorch = g.owns('torch')
  const ownsCrown = g.owns('foam-crown')
  const poses: PoseId[] = !liberty ? ['peace', 'fist'] : ownsCrown ? ['torch', 'crown', 'peace', 'palm'] : ['torch', 'peace', 'palm']
  let pose: PoseId = poses[0]

  const root = el('div', 'sf')
  root.innerHTML = `<div class="sf-phone">
      <div class="sf-left"><svg class="sf-bolt" viewBox="0 0 20 28" aria-hidden="true"><path d="M12 1 L2 16 L9 16 L7 27 L18 11 L11 11 Z" fill="none" stroke="#fbfaf6" stroke-width="2.2" stroke-linejoin="round"/></svg><i class="sf-island"></i></div>
      <div class="sf-view">
        <img class="sf-bg" src="${ART}" alt="" draggable="false">
        <div class="sf-people"></div>
        <div class="sf-grid" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        <div class="sf-faces" aria-hidden="true"></div>
        <div class="sf-caption"><b>${spot.title}</b><span>Selfie</span></div>
        <button class="btn tiny ghost sf-done" type="button">Done</button>
        <span class="sf-zoom"></span>
        <div class="sf-modes" role="radiogroup" aria-label="Pose">${poses.map((p) => `<button type="button" role="radio" data-p="${p}">${LABEL[p]}</button>`).join('')}</div>
      </div>
      <div class="sf-right">
        <svg class="sf-flip" viewBox="0 0 32 32" aria-hidden="true"><path d="M7 13 A 10 10 0 0 1 25 11 M25 19 A 10 10 0 0 1 7 21" fill="none" stroke="#fbfaf6" stroke-width="2.4" stroke-linecap="round"/><path d="M25 5 L25 11 L19 11 M7 27 L7 21 L13 21" fill="none" stroke="#fbfaf6" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <button class="sf-shutter" type="button" aria-label="Take the photo"><i></i></button>
        <div class="sf-thumb"><img alt="" hidden></div>
      </div>
    </div>
    <div class="sf-flash"></div>
    <div class="sf-print" hidden>
      <div class="sf-card"><div class="sf-photo"><img alt="Your selfie at ${spot.title}"><i class="sf-dev"></i></div><div class="sf-note"><b>${spot.title}</b><span></span></div></div>
      <div class="sf-print-actions"><button class="btn small go sf-save" type="button">Save Photo</button><button class="btn small ghost sf-again" type="button">Another One</button></div>
    </div>`
  stage.root.append(root)
  const q = <T extends HTMLElement = HTMLElement>(s: string) => root.querySelector(s) as T
  const view = q('.sf-view')
  const bg = q<HTMLImageElement>('.sf-bg')
  const people = q('.sf-people')
  const faces = q('.sf-faces')
  const zoom = q('.sf-zoom')
  const flash = q('.sf-flash')
  const print = q('.sf-print')
  const shutter = q<HTMLButtonElement>('.sf-shutter')
  const thumb = q<HTMLImageElement>('.sf-thumb img')
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  q('.sf-note span').textContent = date

  // ---------- plumbing ----------
  let closed = false
  const timers = new Set<number>()
  const later = (f: () => void, ms: number) => {
    const t = window.setTimeout(() => {
      timers.delete(t)
      if (!closed) f()
    }, ms)
    timers.add(t)
  }

  // ---------- the picture: everyone, in viewfinder px ----------
  const skin = SKINS[save.look.skin] ?? SKINS[2]
  /** your look for the photo: the hand is busy with the phone, the crown goes on for Foam Crown */
  const myLook = (p: PoseId): Look => {
    const items = { ...save.look.items }
    delete items.hand
    if (p === 'crown') items.head = 'foam-crown'
    return { ...save.look, items }
  }
  const peopleSvg = (p: PoseId) => {
    const fr = frames[p]
    const { x, feet, S } = fr.me
    const toUnits = (vx: number, vy: number) => [(vx - x) / S, (vy - feet) / S]
    const sl = sleeveOf(save.look)
    const sleeve = (len: number) => (sl.kind === 'long' ? { color: sl.color, upTo: 0.86 } : sl.kind === 'short' ? { color: sl.color, upTo: Math.min(0.5, 13 / len) } : null)
    const shL = [-17, -67]
    const shR = [17, -67]
    let body = avatarMarkup(myLook(p), { mood: fr.mood, d: 1 })
    let front = ''
    const hide = (side: 'L' | 'R') => (body = body.replace(`<g class="av-arm${side}">`, `<g class="av-arm${side}" display="none">`))
    // the phone arm reaches down out of the frame, toward the camera (on the left for the palm trick)
    const phoneSide = p === 'palm' ? -1 : 1
    const corner = toUnits(phoneSide > 0 ? VW * 0.74 : -30, VH + 70)
    const sh = phoneSide > 0 ? shR : shL
    front += limb(sh, corner, skin, sleeve(Math.hypot(corner[0] - sh[0], corner[1] - sh[1])), 10, 22)
    hide(phoneSide > 0 ? 'R' : 'L')
    if (p === 'torch' || p === 'peace' || p === 'fist') {
      // the other arm goes up: her pose (with the foam torch if you have one), or two fingers by your face
      hide('L')
      const hand = p === 'peace' ? [-52, -112] : [-52, -140]
      front += limb(shL, hand, skin, sleeve(Math.hypot(hand[0] - shL[0], hand[1] - shL[1])))
      front += p === 'torch' ? (ownsTorch ? `<g transform="translate(${hand[0]} ${hand[1]})">${FOAM_TORCH}</g>` : '') + fist(hand, skin) : p === 'fist' ? fist(hand, skin) : peace(hand, skin)
    }
    if (p === 'palm') {
      // the forced-perspective trick: her feet on your palm, your hand big because it's close to the lens
      hide('R')
      const lady = [fr.bg.x + LADY.x * fr.bg.s, fr.bg.y + LADY.feet * fr.bg.s]
      const palm = toUnits(lady[0] - 2, lady[1] + 1)
      const k = 1.6
      const wrist = [palm[0] - 11 * k, palm[1] + 5 * k]
      // a relaxed arm: the elbow sags a little below the straight line from shoulder to hand
      const elbow = [(shR[0] + wrist[0]) / 2 + 2, (shR[1] + wrist[1]) / 2 + 11]
      const up = Math.hypot(elbow[0] - shR[0], elbow[1] - shR[1])
      front += limb(shR, elbow, skin, sleeve(up), 10, 11) + limb(elbow, wrist, skin, sl.kind === 'long' ? { color: sl.color, upTo: 0.8 } : null, 11, 14)
      front += `<g transform="translate(${palm[0]} ${palm[1]}) scale(${k}) translate(${-palm[0]} ${-palm[1]})">${openHand(palm, skin)}</g>`
    }
    const tilt = p === 'peace' ? -6 : p === 'palm' ? 3 : 0
    if (tilt) body = body.replace('<g class="av-head">', `<g class="av-head" transform="rotate(${tilt} 0 -74)">`)
    const others = friends
      .map((look, i) => {
        const c = fr.crowd[i]
        return `<g transform="translate(${c.x} ${c.feet}) scale(${c.S}) rotate(${c.tilt} 0 -74)">${avatarMarkup(look, { mood: 'grin', d: c.x < x ? 1 : -1 })}</g>`
      })
      .reverse()
      .join('')
    return `${others}<g transform="translate(${x} ${feet}) scale(${S})">${body}${front}</g>`
  }
  const svg = (p: PoseId, w = VW, h = VH) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${VW} ${VH}">${peopleSvg(p)}</svg>`

  /** yellow boxes on faces, like the phone finding them */
  const findFaces = () => {
    const fr = frames[pose]
    const box = (x: number, y: number, size: number, main: boolean) => `<i class="${main ? 'main' : ''}" style="left:${(x - size / 2).toFixed(0)}px;top:${(y - size / 2).toFixed(0)}px;width:${size.toFixed(0)}px;height:${size.toFixed(0)}px"></i>`
    faces.innerHTML =
      box(fr.me.x + 3 * fr.me.S, fr.me.feet - 92 * fr.me.S, 58 * fr.me.S, true) +
      friends.map((_, i) => box(fr.crowd[i].x + 3 * fr.crowd[i].S, fr.crowd[i].feet - 92 * fr.crowd[i].S, 58 * fr.crowd[i].S, false)).join('')
    faces.classList.remove('on')
    void faces.offsetWidth
    faces.classList.add('on')
  }

  const setPose = (p: PoseId, quiet = false) => {
    pose = p
    const fr = frames[p]
    bg.style.transform = `translate(${fr.bg.x}px, ${fr.bg.y}px) scale(${fr.bg.s})`
    people.innerHTML = svg(p)
    people.classList.remove('swap')
    void people.offsetWidth
    people.classList.add('swap')
    zoom.textContent = fr.zoom
    for (const b of root.querySelectorAll<HTMLElement>('.sf-modes button')) {
      const on = b.dataset.p === p
      b.classList.toggle('on', on)
      b.setAttribute('aria-checked', String(on))
    }
    if (!quiet) sfx.tick()
    findFaces()
  }
  root.querySelectorAll<HTMLButtonElement>('.sf-modes button').forEach((b) => (b.onclick = () => phase === 'aim' && setPose(b.dataset.p as PoseId)))

  // ---------- sound: harbor wind, gulls, the shutter, the print coming out ----------
  let stopWind = () => {}
  const startWind = () => {
    const ctx = audioCtx()
    if (!ctx) return
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < d.length; i++) d[i] = (last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02) * 3.4
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const low = ctx.createBiquadFilter()
    low.type = 'lowpass'
    low.frequency.value = 480
    const gn = ctx.createGain()
    gn.gain.value = 0
    gn.gain.linearRampToValueAtTime(0.26, ctx.currentTime + 1.4)
    src.connect(low).connect(gn).connect(ctx.destination)
    src.start()
    stopWind = () => {
      gn.gain.cancelScheduledValues(ctx.currentTime)
      gn.gain.setValueAtTime(gn.gain.value, ctx.currentTime)
      gn.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4)
      setTimeout(() => src.stop(), 500)
      stopWind = () => {}
    }
  }
  if (spot.harbor) {
    startWind()
    onMute((m) => (m ? stopWind() : root.isConnected && !closed && startWind()))
    const gull = () => {
      if (closed) return
      sfx.squawk()
      later(gull, 7000 + Math.random() * 9000)
    }
    later(gull, 3500)
  }
  const noise = (secs: number, freq: number, vol: number, delay = 0) => {
    const ctx = audioCtx()
    if (!ctx) return
    const t = ctx.currentTime + delay
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * secs), ctx.sampleRate)
    const d = b.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = b
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = freq
    const gn = ctx.createGain()
    gn.gain.setValueAtTime(vol, t)
    gn.gain.exponentialRampToValueAtTime(0.001, t + secs)
    src.connect(f).connect(gn).connect(ctx.destination)
    src.start(t)
  }
  const shutterSound = () => {
    noise(0.035, 3200, 0.5)
    noise(0.05, 1800, 0.4, 0.075)
  }
  /** the little motor pushing the print out */
  const whir = () => {
    const ctx = audioCtx()
    if (!ctx) return
    const t = ctx.currentTime
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    o.frequency.setValueAtTime(110, t)
    o.frequency.linearRampToValueAtTime(96, t + 0.7)
    const low = ctx.createBiquadFilter()
    low.type = 'lowpass'
    low.frequency.value = 700
    const gn = ctx.createGain()
    gn.gain.setValueAtTime(0.0001, t)
    gn.gain.exponentialRampToValueAtTime(0.07, t + 0.05)
    gn.gain.setValueAtTime(0.07, t + 0.62)
    gn.gain.exponentialRampToValueAtTime(0.0001, t + 0.75)
    o.connect(low).connect(gn).connect(ctx.destination)
    o.start(t)
    o.stop(t + 0.8)
  }


  // ---------- the photo ----------
  const loaded = (img: HTMLImageElement) => (img.complete && img.naturalWidth ? Promise.resolve() : new Promise<void>((r) => ((img.onload = () => r()), (img.onerror = () => r()))))
  const svgImage = (markup: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = reject
      i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup)
    })
  /** the shot, w px wide: the painting where the viewfinder had it, then everyone in front */
  const render = async (p: PoseId, w: number) => {
    const h = Math.round((w * VH) / VW)
    const k = w / VW
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const x = c.getContext('2d')!
    x.fillStyle = SKY
    x.fillRect(0, 0, w, h)
    await loaded(bg)
    const fr = frames[p]
    x.drawImage(bg, fr.bg.x * k, fr.bg.y * k, ART_W * fr.bg.s * k, ART_H * fr.bg.s * k)
    try {
      x.drawImage(await svgImage(svg(p, w, h)), 0, 0, w, h)
    } catch {
      // the people layer failed to draw: the photo still has the island
    }
    return c
  }
  const fonts = () => {
    const cs = getComputedStyle(document.documentElement)
    return { display: cs.getPropertyValue('--display').trim() || 'sans-serif', body: cs.getPropertyValue('--body').trim() || 'sans-serif' }
  }
  /** the whole Polaroid, for saving: white frame, the photo, the caption */
  const polaroid = async (photo: HTMLCanvasElement) => {
    const W = 1200
    const m = 48
    const pw = W - m * 2
    const ph = Math.round((pw * VH) / VW)
    const H = m + ph + 176
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const x = c.getContext('2d')!
    x.fillStyle = '#fbfaf6'
    x.fillRect(0, 0, W, H)
    x.drawImage(photo, m, m, pw, ph)
    x.strokeStyle = 'rgba(29, 33, 64, 0.18)'
    x.lineWidth = 2
    x.strokeRect(m, m, pw, ph)
    const f = fonts()
    x.fillStyle = '#1d2140'
    x.font = `400 58px ${f.display}`
    x.textBaseline = 'middle'
    x.fillText(spot.title, m + 6, m + ph + 84)
    x.font = `400 32px ${f.body}`
    x.fillStyle = '#4a4f73'
    x.textAlign = 'right'
    x.fillText(date, W - m - 6, m + ph + 88)
    return c
  }

  type Phase = 'aim' | 'snap' | 'print'
  let phase: Phase = 'aim'
  let lastShot: HTMLCanvasElement | null = null
  let shots = 0
  const snap = async () => {
    if (phase !== 'aim') return
    phase = 'snap'
    shutterSound()
    flash.classList.remove('go')
    void flash.offsetWidth
    flash.classList.add('go')
    view.classList.add('click')
    later(() => view.classList.remove('click'), 220)
    const shot = await render(pose, 1104)
    if (closed) return
    lastShot = shot
    shots++
    const url = shot.toDataURL('image/jpeg', 0.9)
    thumb.src = url
    thumb.hidden = false
    // the print slides out and develops
    const img = q<HTMLImageElement>('.sf-photo img')
    img.src = url
    print.hidden = false
    print.classList.remove('out', 'dev')
    void print.offsetWidth
    print.classList.add('in')
    root.classList.add('printing')
    whir()
    later(() => print.classList.add('dev'), 60)
    phase = 'print'
    bump('photos')
    if (liberty) g.stamp('liberty-selfie')
    // the tourist's set: five different landmarks
    if (!save.stats[`selfie:${room}`]) bump(`selfie:${room}`)
    if (Object.keys(save.stats).filter((k) => k.startsWith('selfie:')).length >= 5) g.stamp('say-cheese')
    g.stamp('first-selfie')
    later(() => q('.sf-save').focus(), 700)
  }
  shutter.onclick = () => void snap()

  const again = () => {
    if (phase !== 'print') return
    print.classList.remove('in')
    print.classList.add('out')
    root.classList.remove('printing')
    later(() => {
      print.hidden = true
      phase = 'aim'
      findFaces()
      shutter.focus()
    }, 380)
    sfx.click()
  }
  q('.sf-again').onclick = again
  q('.sf-save').onclick = async () => {
    if (!lastShot) return
    sfx.click()
    const c = await polaroid(lastShot)
    const a = document.createElement('a')
    a.href = c.toDataURL('image/png')
    a.download = `club-nyc-${room}-selfie-${Date.now()}.png`
    a.click()
  }

  // ---------- leaving ----------
  const leave = () => {
    if (closed) return
    closed = true
    for (const t of timers) clearTimeout(t)
    stopWind()
    window.removeEventListener('keydown', keys, true)
    root.classList.add('out')
    setTimeout(() => {
      root.remove()
      release()
    }, 420)
  }
  const keys = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      sfx.click()
      return leave()
    }
    if (phase === 'aim' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault()
      e.stopPropagation()
      const i = poses.indexOf(pose) + (e.key === 'ArrowRight' ? 1 : -1)
      setPose(poses[(i + poses.length) % poses.length])
    } else if (phase === 'aim' && (e.key === ' ' || (e.key === 'Enter' && !(t instanceof HTMLButtonElement)))) {
      e.preventDefault()
      e.stopPropagation()
      void snap()
    }
  }
  window.addEventListener('keydown', keys, true)
  q('.sf-done').onclick = () => (sfx.click(), leave())
  setPose(poses[0], true)
}
