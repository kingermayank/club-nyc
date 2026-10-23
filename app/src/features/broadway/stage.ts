/**
 * A night at the Broadway Theater, seen from the orchestra seats.
 *
 * The view is the theater's own art zoomed onto the stage (art/shows/proscenium.png: the room picture with its
 * painted curtain cut out), so the arch, the swags, the pillars and the footlights are the real ones. Behind
 * them sit the show's painted set and our velvet curtains; in front, the cast: New Yorkers drawn by the same
 * avatar renderer as everyone in the city, wearing wardrobe items as costumes.
 *
 * One clock drives everything: the song, the choreography, the lights, the surtitles. Skip jumps that clock to
 * the curtain call; Leave (or Escape) ends the night at once. Both are always on screen.
 *
 * With a video for the show (features/theater.ts finds /video/broadway/<show>.mp4), the screen drops in
 * front of the set and the video is the show instead.
 */
import './broadway.css'
import { el } from '../../engine/stage'
import { closeButton } from '../../engine/ui'
import { AvatarView, type Pose } from '../../avatar/render'
import { isMuted, onMute } from '../../audio'
import { subway, theater } from '../../foley'
import { songPlayer, eighth, songBars, type SongPlayer } from './music'
import type { ShowDef, CastMember } from './shows'

export interface ShowVideo {
  src: string
  poster?: string
}
export interface ShowHandlers {
  /** the curtain call is done: show the end card's buttons */
  onFinish(): void
  /** the player left (Leave, Escape) or the view was closed */
  onLeave(): void
}

// ---------- the stage, in view coordinates (1000 x 565) ----------
/** where the set image sits (behind the arch; the swags and pillars hide its edges) */
const SET = { x: 60, y: 40, w: 785 }
const SET_H = (SET.w * 1131) / 2000
/** a point in the set image (2000 x 1131 px) → view coordinates */
const setPt = (x: number, y: number): [number, number] => [SET.x + (x / 2000) * SET.w, SET.y + (y / 1131) * SET_H]
const FRONT = 484
const BACK = 458
/** the two spotlights painted on the arch */
const CANS: [number, number][] = [
  [129, 103],
  [781, 103],
]
const depth = (y: number) => 0.6 + 0.4 * Math.max(0, Math.min(1, (y - 280) / (FRONT - 280)))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

class Performer {
  readonly who: CastMember
  readonly wrap: HTMLDivElement
  readonly view: AvatarView
  x: number
  y: number
  private tw: { fx: number; fy: number; tx: number; ty: number; t0: number; t1: number; after: Pose } | null = null
  constructor(who: CastMember, x: number, y: number, layer: HTMLElement) {
    this.who = who
    this.x = x
    this.y = y
    this.view = new AvatarView(who.look, 0.84)
    this.wrap = el('div', 'bw-actor')
    this.wrap.append(el('div', 'bw-shadow'), this.view.el)
    layer.append(this.wrap)
    this.place()
  }
  walk(now: number, x: number, y: number, dur: number, after: Pose = 'idle') {
    this.tw = { fx: this.x, fy: this.y, tx: x, ty: y, t0: now, t1: now + dur, after }
    if (Math.abs(x - this.x) > 2) this.view.face(x > this.x ? 1 : -1, false)
    this.view.setPose('walk')
  }
  /** jump straight to a spot (Skip, appearing on the set) */
  put(x: number, y: number) {
    this.tw = null
    this.x = x
    this.y = y
    this.place()
  }
  pose(p: Pose) {
    if (p === 'jump') this.view.pose = 'idle' // re-trigger a jump that's still running
    this.view.setPose(p)
  }
  face(d: 1 | -1) {
    this.view.face(d, false)
  }
  bow() {
    this.view.setPose('idle')
    this.wrap.classList.remove('bow')
    void this.wrap.offsetWidth
    this.wrap.classList.add('bow')
  }
  update(now: number, dt: number) {
    const tw = this.tw
    if (tw) {
      const k = Math.min(1, (now - tw.t0) / Math.max(0.01, tw.t1 - tw.t0))
      this.x = lerp(tw.fx, tw.tx, k)
      this.y = lerp(tw.fy, tw.ty, k)
      if (k >= 1) {
        this.tw = null
        this.view.setPose(tw.after)
        this.view.face(this.x < 450 ? 1 : -1, false)
      }
      this.place()
    }
    this.view.update(dt)
  }
  private place() {
    this.wrap.style.transform = `translate(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px) scale(${depth(this.y).toFixed(3)})`
    this.wrap.style.zIndex = String(Math.round(this.y))
  }
}

/** a beam of light from one of the arch's spotlights onto a spot on stage */
class Beam {
  readonly cone: HTMLDivElement
  readonly pool: HTMLDivElement
  private readonly from: [number, number]
  target: (() => [number, number]) | null = null
  constructor(from: [number, number], layer: HTMLElement) {
    this.from = from
    this.cone = el('div', 'bw-beam')
    this.pool = el('div', 'bw-pool')
    layer.append(this.cone, this.pool)
  }
  set(color: string, on: boolean) {
    this.cone.style.setProperty('--c', color)
    this.pool.style.setProperty('--c', color)
    this.cone.classList.toggle('on', on)
    this.pool.classList.toggle('on', on)
  }
  update() {
    if (!this.target) return
    const [tx, ty] = this.target()
    const [sx, sy] = this.from
    const dx = tx - sx
    const dy = ty - sy
    const len = Math.hypot(dx, dy)
    const ang = (-Math.atan2(dx, dy) * 180) / Math.PI
    this.cone.style.height = `${len.toFixed(1)}px`
    this.cone.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) rotate(${ang.toFixed(2)}deg)`
    this.pool.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`
  }
}

type Cue = { at: number; run: () => void; done?: boolean }

/** the sound toggle reaches the video that's playing (one listener for the module) */
let videoMute: ((m: boolean) => void) | null = null
onMute((m) => videoMute?.(m))

export class ShowNight {
  readonly root: HTMLDivElement
  private readonly cast: Performer[] = []
  private readonly beams: Beam[] = []
  private readonly song: SongPlayer | null
  private readonly cues: Cue[] = []
  private readonly lyric: HTMLDivElement
  private readonly card: HTMLDivElement
  private readonly skipBtn: HTMLButtonElement
  private raf = 0
  private t = 0
  private last = 0
  private ended = false
  private stopApplause: (() => void) | null = null
  private readonly bar: number
  private readonly songEnd: number
  private readonly callAt: number
  private video: HTMLVideoElement | null = null
  private soloOn: Performer | null = null
  private readonly dim: HTMLDivElement

  readonly show: ShowDef
  private readonly handlers: ShowHandlers

  constructor(show: ShowDef, handlers: ShowHandlers, videoSrc: ShowVideo | null = null) {
    this.show = show
    this.handlers = handlers
    const root = (this.root = el('div', `bw-show bw-${show.id} lights-house`))
    root.innerHTML = `
      <div class="bw-back"></div>
      <div class="bw-set-wrap"><img class="bw-set" src="${show.set}" alt="" draggable="false"><div class="bw-setfx"></div></div>
      <div class="bw-curtain l"></div><div class="bw-curtain r"></div>
      <img class="bw-frame" src="/art/shows/proscenium.png" alt="" draggable="false">
      <div class="bw-glow"></div>
      <div class="bw-cast"></div>
      <div class="bw-fog"></div>
      <div class="bw-dim"></div>
      <div class="bw-lights"></div>
      <div class="bw-fx"></div>
      <div class="bw-title"><small>Tonight at the Broadway Theater</small><b>${show.title}</b><i>“${show.tagline}”</i></div>
      <div class="bw-lyric" aria-live="polite"></div>`
    const setWrap = root.querySelector<HTMLElement>('.bw-set-wrap')!
    setWrap.style.cssText = `left:${SET.x}px;top:${SET.y}px;width:${SET.w}px;height:${SET_H.toFixed(1)}px`
    this.lyric = root.querySelector('.bw-lyric')!
    this.dim = root.querySelector('.bw-dim')!
    const lights = root.querySelector<HTMLElement>('.bw-lights')!
    for (const c of CANS) this.beams.push(new Beam(c, lights))

    // always on screen: Skip (to the curtain call) and Leave
    const controls = el('div', 'bw-controls')
    this.skipBtn = el('button', 'btn small ghost', 'Skip<kbd>S</kbd>')
    this.skipBtn.title = 'Skip to the curtain call'
    this.skipBtn.onclick = () => this.skip()
    const leave = el('button', 'btn small', 'Leave<kbd>Esc</kbd>')
    leave.title = 'Leave the show'
    leave.onclick = () => this.leave()
    controls.append(this.skipBtn, leave)
    this.card = el('div', 'panel bw-card')
    root.append(controls, this.card)

    this.bar = 8 * eighth(show.song)
    this.songEnd = songBars(show.song) * this.bar
    if (videoSrc) {
      this.song = null
      this.songEnd = 0
      this.callAt = 0
      this.buildVideo(videoSrc)
    } else {
      this.song = songPlayer(show.song)
      this.callAt = this.songEnd + 1.1
      this.buildCast()
      this.buildCues()
    }
    if (this.video) {
      const v = this.video
      videoMute = (m) => (v.muted = m)
    }
  }

  start() {
    this.last = performance.now()
    const loop = (now: number) => {
      const real = (now - this.last) / 1000
      this.last = now
      // the show keeps real time even on a slow frame (the song is scheduled from this clock); only a long gap,
      // like a hidden tab, is cut short
      if (!this.video) this.t += Math.min(real, 0.5)
      this.frame(Math.min(real, 0.05))
      if (!this.ended) this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
    // the curtain's title card, then the overture
    if (this.video) this.videoStart()
  }

  // ---------- the avatar show ----------
  private buildCast() {
    const layer = this.root.querySelector<HTMLElement>('.bw-cast')!
    this.show.cast.forEach((c, i) => {
      // everyone waits in the wings, left and right
      const left = i % 2 === 0
      this.cast.push(new Performer(c, left ? -70 : 1070, BACK + (i % 3) * 8, layer))
    })
  }

  private get lead() {
    return this.cast.find((p) => p.who.role === 'lead')!
  }
  private get second() {
    return this.cast.find((p) => p.who.role === 'second') ?? null
  }
  private get chorus() {
    return this.cast.filter((p) => p.who.role === 'chorus')
  }

  /** evenly spread across the stage */
  private line(n: number, y: number, x0 = 160, x1 = 740) {
    return Array.from({ length: n }, (_, i): [number, number] => [n === 1 ? (x0 + x1) / 2 : lerp(x0, x1, i / (n - 1)), y])
  }
  /** a back line that leaves the middle open for the lead (with an odd count, the right end gives up its spot) */
  private backLine(n: number, y: number): [number, number][] {
    const half = Math.ceil(n / 2)
    const step = half > 1 ? 220 / (half - 1) : 0
    const left = Array.from({ length: half }, (_, i) => 140 + i * step)
    const right = left.map((x) => 900 - x).reverse()
    return [...left, ...right].slice(0, n).map((x): [number, number] => [x, y])
  }

  private cue(at: number, run: () => void) {
    this.cues.push({ at, run })
  }

  private buildCues() {
    const B = (n: number) => n * this.bar
    const s = this.show
    const lead = this.lead
    const second = this.second
    const chorus = this.chorus
    const all = this.cast
    // overture: the house is dark, a spotlight finds the title on the curtain
    this.cue(0.15, () => {
      theater.spotlight()
      this.aim(0, () => [450, 300], s.beam)
    })
    this.cue(B(1) + this.bar * 0.45, () => {
      this.root.classList.add('title-off')
      this.lights('full')
      this.curtain(true)
    })
    // entrance: the chorus from the wings to the back line, the lead last, to the front
    this.cue(B(2), () => {
      const back = this.backLine(chorus.length + (second ? 1 : 0), BACK)
      ;[...chorus, ...(second ? [second] : [])].forEach((p, i) => p.walk(this.t, back[i][0], back[i][1], this.bar * 0.85 + i * 0.05))
      lead.walk(this.t, 450, FRONT, this.bar * 0.95, 'wave')
    })
    // verse: the lead alone in the light
    this.cue(B(3), () => {
      this.solo(lead)
      this.aim(0, () => [lead.x, lead.y], s.beam)
      this.aim(1, () => [lead.x, lead.y], s.beam)
      chorus.forEach((p) => p.pose('idle'))
    })
    this.cue(B(4), () => lead.pose('idle'))
    this.cue(B(5), () => {
      if (second) {
        // the duet: the second steps down beside the lead and they face each other
        second.walk(this.t, 600, FRONT - 4, this.bar * 0.5, 'wave')
        lead.walk(this.t, 360, FRONT, this.bar * 0.5, 'idle')
        this.aim(1, () => [second.x, second.y], s.beam)
        this.solo(null)
        this.lights('duet')
        this.cue(B(5.6), () => {
          lead.face(1)
          second.face(-1)
        })
      } else lead.pose('cheer')
    })
    this.cue(B(6), () => (second ? second.pose('idle') : lead.pose('idle')))
    // chorus: lights up, everybody dances
    this.cue(B(7), () => {
      this.solo(null)
      this.lights('chorus')
      theater.crash()
      all.forEach((p) => p.pose('dance'))
      this.aim(0, () => [chorus[0]?.x ?? 300, chorus[0]?.y ?? BACK], s.beam)
      this.aim(1, () => [lead.x, lead.y], s.beam)
    })
    this.cue(B(8), () => this.aim(0, () => [chorus[chorus.length - 1].x, chorus[chorus.length - 1].y], s.beam))
    // halfway: the lines swap, front to back
    this.cue(B(9), () => {
      const front = this.line(chorus.length, FRONT - 2, 130, 770)
      chorus.forEach((p, i) => p.walk(this.t, front[i][0], front[i][1], this.bar * 0.45, 'dance'))
      lead.walk(this.t, 450, BACK, this.bar * 0.45, 'dance')
      if (second) second.walk(this.t, 560, BACK - 2, this.bar * 0.45, 'dance')
    })
    this.cue(B(10), () => this.aim(0, () => [chorus[1]?.x ?? 400, chorus[1]?.y ?? FRONT], s.beam))
    // the show's big moment
    if (s.moment === 'train') this.momentTrain(B)
    if (s.moment === 'rock') this.momentRock(B)
    if (s.moment === 'kickline') this.momentKickline(B)
    // finale
    this.cue(B(13), () => {
      this.lights('chorus')
      this.solo(null)
      const front = this.line(all.length, FRONT - 1, 120, 780)
      const order = [...chorus.slice(0, Math.ceil(chorus.length / 2)), ...(second ? [second] : []), lead, ...chorus.slice(Math.ceil(chorus.length / 2))]
      order.forEach((p, i) => p.walk(this.t, front[i][0], front[i][1], this.bar * 0.4, 'dance'))
      this.aim(0, () => [lead.x, lead.y], s.beam)
      this.aim(1, () => [lead.x, lead.y], s.beam)
    })
    this.cue(B(14), () => this.sweep(true))
    for (const half of [0, 0.5]) this.cue(B(15 + half), () => all.forEach((p, i) => setTimeout(() => !this.ended && p.pose('jump'), i * 90)))
    this.cue(B(16), () => {
      all.forEach((p) => p.pose('cheer'))
      theater.drumroll(this.bar * 0.9)
    })
    this.cue(B(17), () => {
      theater.crash()
      this.sweep(false)
      this.aim(0, () => [lead.x, lead.y], s.beam)
      this.aim(1, () => [lead.x, lead.y], s.beam)
      this.burst(60)
    })
    // the button, a blackout, then the curtain call in front of the closed curtain
    this.cue(this.songEnd, () => this.lights('blackout'))
    this.cue(this.songEnd + 0.5, () => this.curtainCall(false))
    this.cue(this.callAt + 0.5, () => chorus.forEach((p) => p.bow()))
    if (second) this.cue(this.callAt + 1.6, () => second.bow())
    this.cue(this.callAt + 2.5, () => {
      lead.walk(this.t, lead.x, FRONT + 3, 0.35, 'idle')
      this.aim(0, () => [lead.x, lead.y], s.beam)
      this.aim(1, () => [lead.x, lead.y], s.beam)
    })
    this.cue(this.callAt + 3.0, () => {
      lead.bow()
      this.petals(26)
    })
    this.cue(this.callAt + 4.2, () => all.forEach((p) => p.pose('wave')))
    this.cue(this.callAt + 5.4, () => all.forEach((p) => p.bow()))
    this.cue(this.callAt + 6.6, () => this.finish())
  }

  private momentTrain(B: (n: number) => number) {
    const s = this.show
    const [hx, hy] = setPt(1832, 690)
    this.cue(B(11), () => {
      this.lights('moment')
      this.root.classList.add('train')
      const fx = this.root.querySelector<HTMLElement>('.bw-setfx')!
      fx.innerHTML = `<i class="bw-headlight" style="left:${hx - SET.x}px;top:${hy - SET.y}px"></i>`
      subway.arrive()
      this.cast.forEach((p) => {
        p.pose('idle')
        p.face(1)
      })
      this.aim(0, () => [hx, hy + 40], 'rgba(255, 244, 200, 0.55)')
      this.aim(1, () => [this.lead.x, this.lead.y], s.beam)
    })
    this.cue(B(12), () => subway.chime())
    this.cue(B(12) + this.bar * 0.55, () => {
      subway.doorsClose()
      this.cast.forEach((p, i) => setTimeout(() => !this.ended && p.pose('jump'), i * 60))
    })
    this.cue(B(13) - 0.1, () => this.root.classList.remove('train'))
  }

  private momentRock(B: (n: number) => number) {
    const lead = this.lead
    const [rx, ry] = setPt(1000, 655)
    this.cue(B(10) + this.bar * 0.45, () => lead.walk(this.t, 1080, BACK, this.bar * 0.5, 'idle'))
    this.cue(B(11), () => {
      // the King appears on the rock and holds up the pie
      lead.put(rx, ry)
      lead.wrap.classList.add('appear')
      lead.face(1)
      lead.pose('cheer')
      this.lights('moment')
      this.root.classList.add('sunrise')
      theater.spotlight()
      this.aim(0, () => [rx, ry], 'rgba(255, 226, 140, 0.6)')
      this.aim(1, () => [rx, ry], 'rgba(255, 226, 140, 0.6)')
      this.sparkle(rx, ry - 70)
      this.chorus.forEach((p) => {
        p.pose('idle')
        p.face(p.x < rx ? 1 : -1)
      })
    })
    this.cue(B(11) + this.bar * 0.5, () => this.chorus.forEach((p) => p.bow()))
    this.cue(B(12), () => this.chorus.forEach((p) => p.pose('cheer')))
    this.cue(B(13) - 0.15, () => {
      lead.wrap.classList.remove('appear')
      this.root.classList.remove('sunrise')
      lead.put(450, FRONT)
    })
  }

  private momentKickline(B: (n: number) => number) {
    this.cue(B(11), () => {
      this.lights('moment')
      this.root.classList.add('marquee')
      const row = this.line(this.cast.length, FRONT - 2, 110, 790)
      this.cast.forEach((p, i) => p.walk(this.t, row[i][0], row[i][1], this.bar * 0.3, 'idle'))
      this.sweep(true)
    })
    for (const k of [0.35, 0.65, 1.0, 1.3, 1.6])
      this.cue(B(11) + this.bar * k, () => this.cast.forEach((p, i) => setTimeout(() => !this.ended && p.pose('jump'), i * 70)))
    this.cue(B(12) + this.bar * 0.9, () => {
      this.sweep(false)
      this.burst(30)
    })
    this.cue(B(13) - 0.1, () => this.root.classList.remove('marquee'))
  }

  // ---------- lights ----------
  private lights(state: 'house' | 'full' | 'duet' | 'chorus' | 'moment' | 'blackout' | 'bow') {
    this.root.classList.remove('lights-house', 'lights-full', 'lights-duet', 'lights-chorus', 'lights-moment', 'lights-blackout', 'lights-bow')
    this.root.classList.add(`lights-${state}`)
    if (state === 'blackout') this.beams.forEach((b) => b.set(this.show.beam, false))
  }
  private aim(i: number, target: () => [number, number], color: string) {
    const b = this.beams[i]
    b.target = target
    b.set(color, true)
    b.update()
  }
  /** a pool of light on one performer, the rest of the stage dimmed */
  private solo(p: Performer | null) {
    this.soloOn = p
    this.root.classList.toggle('solo', !!p)
  }
  /** beams swing back and forth across the stage */
  private sweeping = false
  private sweep(on: boolean) {
    this.sweeping = on
  }
  private curtain(open: boolean) {
    theater.curtain()
    this.root.classList.toggle('open', open)
  }

  // ---------- effects ----------
  private burst(n: number) {
    const fx = this.root.querySelector<HTMLElement>('.bw-fx')!
    const colors = ['#ffd166', '#ff595e', '#8ac926', '#1982c4', '#ff7eb6', '#ffffff']
    for (let i = 0; i < n; i++) {
      const c = el('i', 'bw-confetti')
      c.style.cssText = `left:${120 + Math.random() * 660}px;background:${colors[i % colors.length]};--dx:${((Math.random() - 0.5) * 140).toFixed(0)}px;--r:${(Math.random() * 720).toFixed(0)}deg;animation-delay:${(Math.random() * 0.5).toFixed(2)}s;animation-duration:${(1.8 + Math.random()).toFixed(2)}s`
      fx.append(c)
      setTimeout(() => c.remove(), 3600)
    }
  }
  private petals(n: number) {
    const fx = this.root.querySelector<HTMLElement>('.bw-fx')!
    for (let i = 0; i < n; i++) {
      const c = el('i', 'bw-petal')
      c.style.cssText = `left:${200 + Math.random() * 500}px;--dx:${((Math.random() - 0.5) * 120).toFixed(0)}px;--r:${(Math.random() * 540).toFixed(0)}deg;animation-delay:${(Math.random() * 0.8).toFixed(2)}s`
      fx.append(c)
      setTimeout(() => c.remove(), 4200)
    }
  }
  private sparkle(x: number, y: number) {
    const fx = this.root.querySelector<HTMLElement>('.bw-fx')!
    for (let i = 0; i < 10; i++) {
      const s = el('i', 'bw-sparkle')
      const a = (i / 10) * Math.PI * 2
      s.style.cssText = `left:${x}px;top:${y}px;--dx:${(Math.cos(a) * 60).toFixed(0)}px;--dy:${(Math.sin(a) * 40).toFixed(0)}px;animation-delay:${(i * 0.04).toFixed(2)}s`
      fx.append(s)
      setTimeout(() => s.remove(), 1800)
    }
  }

  // ---------- the clock ----------
  private frame(dt: number) {
    const t = this.t
    for (const c of this.cues) {
      if (!c.done && t >= c.at) {
        c.done = true
        c.run()
      }
    }
    this.song?.tick(t)
    for (const p of this.cast) p.update(t, dt)
    if (this.sweeping) {
      const w = Math.sin(t * 1.6)
      this.beams[0].target = () => [450 + w * 280, FRONT]
      this.beams[1].target = () => [450 - w * 280, FRONT]
    }
    for (const b of this.beams) b.update()
    const s = this.soloOn
    if (s) this.dim.style.setProperty('--x', `${s.x.toFixed(0)}px`), this.dim.style.setProperty('--y', `${(s.y - 60).toFixed(0)}px`)
    // surtitles follow the song
    if (this.song && t < this.songEnd) {
      const bar = t / this.bar
      const line = [...this.show.lyrics].reverse().find(([b]) => bar >= b)
      const next = line ? this.show.lyrics.find(([b]) => b > line[0]) : null
      const text = line && bar < (next ? next[0] : line[0] + 2) ? line[1] : ''
      if (this.lyric.dataset.text !== text) {
        this.lyric.dataset.text = text
        this.lyric.innerHTML = text ? `<span>♪ ${text.replace('\n', '<br>')} ♪</span>` : ''
        this.lyric.classList.toggle('on', !!text)
      }
    } else if (this.lyric.dataset.text) {
      this.lyric.dataset.text = ''
      this.lyric.innerHTML = ''
      this.lyric.classList.remove('on')
    }
  }

  /** the curtain closes and the cast lines up in front of it to bow (also where Skip lands) */
  private curtainCall(instant: boolean) {
    this.curtain(false)
    this.lights('bow')
    this.root.classList.remove('train', 'sunrise', 'marquee', 'solo', 'title-off')
    this.root.classList.add('title-off')
    this.soloOn = null
    this.sweeping = false
    this.skipBtn.disabled = true
    this.stopApplause?.()
    this.stopApplause = theater.applause(this.video ? 5 : 7.4, 1)
    if (!this.cast.length) {
      this.aim(0, () => [450, FRONT - 20], 'rgba(255, 240, 210, 0.42)')
      this.aim(1, () => [450, FRONT - 20], 'rgba(255, 240, 210, 0.42)')
      return
    }
    const order = [...this.chorus.slice(0, Math.ceil(this.chorus.length / 2)), ...(this.second ? [this.second] : []), this.lead, ...this.chorus.slice(Math.ceil(this.chorus.length / 2))]
    const row = this.line(order.length, FRONT - 3, 130, 770)
    order.forEach((p, i) => {
      p.wrap.classList.remove('appear')
      if (instant) {
        p.put(row[i][0], row[i][1])
        p.pose('idle')
      } else p.walk(this.t, row[i][0], row[i][1], 0.6, 'idle')
      p.face(1)
    })
    this.aim(0, () => [this.lead.x, this.lead.y], 'rgba(255, 240, 210, 0.42)')
    this.aim(1, () => [this.lead.x, this.lead.y], 'rgba(255, 240, 210, 0.42)')
  }

  skip() {
    if (this.ended || this.skipBtn.disabled) return
    if (this.video) return this.videoEnd()
    if (this.t >= this.songEnd) return
    // jump the clock to the curtain call: nothing in between happens
    this.song?.stop(0.3)
    this.t = this.songEnd + 0.5
    for (const c of this.cues) if (c.at <= this.t) c.done = true
    this.curtainCall(true)
  }

  private finish() {
    this.handlers.onFinish()
  }

  /** the end card (built by the theater: the reward, Watch Again, Back to the Theater) */
  showCard(html: string, buttons: HTMLElement[]) {
    this.card.innerHTML = html
    const row = el('div', 'bw-card-actions')
    row.append(...buttons)
    // the card's close button is the same as Leave
    this.card.append(row, closeButton(() => this.leave()))
    this.card.classList.add('on')
    this.root.classList.add('carded')
    // the main button takes the keyboard (Enter), Escape still leaves
    buttons[buttons.length - 1]?.focus({ preventScroll: true })
  }

  leave() {
    if (this.ended) return
    this.handlers.onLeave()
  }

  /** stop everything (called by the theater when the view closes) */
  dispose() {
    if (this.ended) return
    this.ended = true
    cancelAnimationFrame(this.raf)
    this.song?.stop(0.4)
    this.stopApplause?.()
    if (this.video) {
      videoMute = null
      this.video.pause()
      this.video.removeAttribute('src')
      this.video.load()
    }
  }

  // ---------- a provided video as the show ----------
  private buildVideo(src: ShowVideo) {
    const v = document.createElement('video')
    v.className = 'bw-video'
    v.src = src.src
    v.poster = src.poster ?? this.show.set
    v.playsInline = true
    v.preload = 'auto'
    v.muted = isMuted()
    v.volume = 0.85
    v.onended = () => this.videoEnd()
    // a file this browser can't play: go straight to the bow rather than sit on a black screen
    v.onerror = () => this.videoEnd()
    const screen = el('div', 'bw-screen')
    screen.append(v)
    this.root.querySelector('.bw-dim')!.before(screen)
    this.video = v
  }
  private videoStart() {
    const v = this.video!
    this.root.classList.add('video')
    setTimeout(() => {
      if (this.ended) return
      this.root.classList.add('title-off')
      this.lights('full')
      this.curtain(true)
    }, 1600)
    setTimeout(() => {
      if (this.ended) return
      this.root.classList.add('screen-down')
      void v.play().catch(() => {
        // autoplay with sound refused: play muted rather than not at all
        v.muted = true
        void v.play().catch(() => this.videoEnd())
      })
    }, 2700)
  }
  private videoEnd() {
    if (this.ended || this.root.classList.contains('video-done')) return
    this.root.classList.add('video-done')
    this.video?.pause()
    this.root.classList.remove('screen-down')
    setTimeout(() => {
      if (this.ended) return
      this.curtainCall(true)
      setTimeout(() => !this.ended && this.finish(), 4200)
    }, 700)
  }
}
