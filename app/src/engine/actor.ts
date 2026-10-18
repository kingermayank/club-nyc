import { AvatarView, type Pose } from '../avatar/render'
import type { Look } from '../avatar/look'
import { el } from './stage'
import type { Pt } from '../geometry'
import type { Resident } from '../social/resident-type'
import { link, sendLook } from '../net/link'

/** Another real player (multiplayer). */
export interface RemoteInfo {
  id: string
  team: string
  /** stamp id shown under the name */
  title: string
}

export interface Seat {
  id: string
  sit: Pt
  stand: Pt
  /** draw order while seated: just in front of the furniture being sat on */
  z?: number
}

/** A person in a room: the player or an NPC. Positioned by its feet. */
export class Actor {
  readonly wrap: HTMLDivElement
  /**
   * The name tag and speech bubble. They follow the body but live in the stage's overhead layer, above every person
   * and prop in the room — inside the body they'd be hidden by whoever stands in front (or a pigeon).
   */
  readonly overhead: HTMLDivElement
  readonly view: AvatarView
  readonly bubble: HTMLDivElement
  readonly tag: HTMLDivElement
  /** the bubble's unscaled width while it's up (measured once per line; 0 = measure again) */
  bubbleW = 0
  /** how far the tag is nudged down to clear a neighbour's (eased; see placeOverheads in world.ts) */
  tagNudge = 0
  /** the tag's unscaled size, measured once per name */
  tagSize: [number, number] | null = null
  /** where the body was last drawn: feet (stage px) and depth scale */
  readonly drawn = { x: 0, y: 0, s: 1 }
  pos: Pt
  path: Pt[] = []
  onArrive: (() => void) | null = null
  seat: Seat | null = null
  /** a pose to hold until the actor moves (dance, wave…) */
  held: Pose | null = null
  skating = false
  name: string
  look: Look
  /** the resident this NPC is (undefined for the player) */
  resident?: Resident
  /** set for other real players */
  remote?: RemoteInfo
  /** walking off to leave the room */
  leaving = false
  /** taken over by a group activity (flash mob, open house) */
  mob = false
  /** decision timer for NPC behaviour */
  next = 1 + Math.random() * 3
  private bubbleTimer = 0
  private facing: 1 | -1 = 1
  private back = false
  private lastPos: Pt

  readonly isPlayer: boolean
  constructor(look: Look, name: string, pos: Pt, isPlayer = false) {
    this.isPlayer = isPlayer
    this.look = look
    this.name = name
    this.pos = pos
    this.lastPos = pos
    this.view = new AvatarView(look)
    this.wrap = el('div', 'actor' + (isPlayer ? ' is-player' : ''))
    this.overhead = el('div', 'overhead' + (isPlayer ? ' is-player' : ''))
    this.bubble = el('div', 'bubble')
    this.tag = el('div', 'name-tag', name)
    this.wrap.append(this.view.el)
    this.overhead.append(this.tag, this.bubble)
  }

  setLook(look: Look) {
    this.look = look
    this.view.setLook(look)
    if (this.isPlayer) sendLook(look)
  }

  setName(name: string) {
    this.name = name
    this.tag.textContent = name
    this.tagSize = null
  }

  /** the name tag is just the name (titles, jobs and team live on the player card) */
  setTag(name: string) {
    this.name = name
    const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
    this.tag.innerHTML = `<b>${esc(name)}</b>`
    this.tagSize = null
  }

  /** what the speech bubble last said */
  said = ''
  say(text: string, ms = Math.max(3000, Math.min(7000, 2400 + 60 * text.length))) {
    this.said = text
    this.bubble.textContent = text
    this.bubbleW = 0
    this.bubble.classList.toggle('emote', /^\p{Extended_Pictographic}(️)?$/u.test(text.trim()))
    this.bubble.classList.remove('show')
    void this.bubble.offsetWidth
    this.bubble.classList.add('show')
    clearTimeout(this.bubbleTimer)
    this.bubbleTimer = window.setTimeout(() => this.bubble.classList.remove('show'), ms)
  }

  /** stop talking (the bubble fades out) */
  hush() {
    clearTimeout(this.bubbleTimer)
    this.bubble.classList.remove('show')
  }

  emote(pose: Pose, seconds = 0) {
    this.held = pose
    this.view.setPose(pose)
    if (this.isPlayer && pose !== 'walk') link.send({ t: 'p', p: pose })
    if (pose === 'jump') {
      setTimeout(() => {
        if (this.held === 'jump') this.held = null
      }, 560)
    } else if (seconds) {
      setTimeout(() => {
        if (this.held === pose) this.held = null
      }, seconds * 1000)
    }
  }

  sitOn(seat: Seat) {
    this.seat = seat
    this.path = []
    this.held = null
    this.pos = [...seat.sit] as Pt
    this.view.face(this.facing, false)
  }

  standUp() {
    if (!this.seat) return
    this.pos = [...this.seat.stand] as Pt
    this.seat = null
  }

  get moving() {
    return this.path.length > 0
  }

  /** advance movement + animation. scale = depth scale at feet. */
  update(dt: number, speedPx: number, scale: number) {
    if (this.path.length) {
      this.held = null
      const [tx, ty] = this.path[0]
      const dx = tx - this.pos[0]
      const dy = ty - this.pos[1]
      const d = Math.hypot(dx, dy)
      const step = speedPx * dt
      if (d <= step) {
        this.pos = [tx, ty]
        this.path.shift()
        if (!this.path.length) {
          const cb = this.onArrive
          this.onArrive = null
          cb?.()
        }
      } else {
        this.pos = [this.pos[0] + (dx / d) * step, this.pos[1] + (dy / d) * step]
      }
      const mx = this.pos[0] - this.lastPos[0]
      const my = this.pos[1] - this.lastPos[1]
      // (arriving at a seat hops you from the stand point up onto the seat: that's sitting down, not walking away)
      if (!this.seat && Math.abs(mx) + Math.abs(my) > 0.01) {
        if (Math.abs(mx) > 0.05) this.facing = mx < 0 ? -1 : 1
        this.back = my < -Math.abs(mx) * 0.9
        this.view.face(this.facing, this.back)
      }
    }
    // standing still or sitting: face the room, so everyone can see your face
    if (this.back && (this.seat || !this.path.length)) {
      this.back = false
      this.view.face(this.facing, false)
    }
    this.lastPos = this.pos
    const pose: Pose = this.seat ? 'sit' : this.path.length ? (this.skating ? 'skate' : 'walk') : this.held ?? (this.skating ? 'skate' : 'idle')
    this.view.setPose(pose)
    this.view.update(dt)
    // sitting: hips sit on the seat point; the body's local hip line is ~34 units above the feet
    const k = this.view.unit
    const yOff = this.seat ? 34 * k * scale : 0
    this.drawn.x = this.pos[0]
    this.drawn.y = this.pos[1] + yOff
    this.drawn.s = scale
    const t = `translate(${this.pos[0]}px, ${this.pos[1] + yOff}px) scale(${scale})`
    this.wrap.style.transform = t
    this.overhead.style.transform = t
    // the overhead shows the body's state: another player's white tag, fading in or while they reconnect
    for (const c of ['remote', 'stale', 'arrive']) this.overhead.classList.toggle(c, this.wrap.classList.contains(c))
  }

  /** the y used for depth sorting */
  get depthY() {
    return this.seat ? this.seat.stand[1] - 1 : this.pos[1]
  }
}
