import './turnstile.css'
import { arrival as fx, subway as rail } from '../foley'
import { save } from '../state'
import { el, stage, toStage } from '../engine/stage'
import { hold } from '../engine/ui'
import { SKINS } from '../avatar/look'
import type { Pt } from '../geometry'
import { quadMatrix } from './downtown'

/**
 * Swiping in: the turnstile between the street and the trains, up close. Your Club NYC MetroCard waits in your hand.
 * Drag it through the reader on top of the cabinet (not too fast, not too slow, like the real one), then put your
 * hand on the bar and push it round, and step through. Resolves true once you're through, false if you back out.
 *
 * The art (rooms/turnstile.jpg) is only the cabinet and its chrome hub; the three-armed bar is drawn here in 3D so it
 * really turns. Like a real tripod turnstile its arms sit on a cone round a tilted axis: one arm is level across the
 * walkway, and pushing it away swings it down and brings the next one up level behind you.
 */

// ---------- the picture's landmarks, in stage units (the art fills the 1000 × 565 stage) ----------
/** the reader's groove, from where the card goes in to where it comes out */
const SLOT_A: Pt = [460, 292]
const SLOT_B: Pt = [648, 376]
const SLOT_LEN = Math.hypot(SLOT_B[0] - SLOT_A[0], SLOT_B[1] - SLOT_A[1])
const SLOT_DEG = (Math.atan2(SLOT_B[1] - SLOT_A[1], SLOT_B[0] - SLOT_A[0]) * 180) / Math.PI
/** the card, standing on its edge in the groove */
const CARD_W = 112
const CARD_H = 70
/** the bar's hub on the cabinet's side, and how the three directions of the walkway look on screen */
const HUB: Pt = [360, 400]
const ARM = 205
const OUT: Pt = [-0.96, -0.06]
const UP: Pt = [0, -1]
const NEAR: Pt = [0.5, 0.39]
/** where the card rests in your hand */
const HAND: Pt = [770, 440]

/** the arms' cone: axis out and down at 45°, arms 45° off it, so the arm at φ = 0 is level */
function armDir(phi: number): [number, number, number] {
  const c = Math.cos(phi) * Math.SQRT1_2
  const s = Math.sin(phi) * Math.SQRT1_2
  // a = (out 1, up -1)/√2, e1 = (out 1, up 1)/√2, e2 = toward you; d = (a + cos φ·e1 + sin φ·e2)/√2
  return [0.5 + c * Math.SQRT1_2, -0.5 + c * Math.SQRT1_2, s]
}
function onScreen([o, u, n]: [number, number, number], len: number): Pt {
  return [HUB[0] + len * (o * OUT[0] + u * UP[0] + n * NEAR[0]), HUB[1] + len * (o * OUT[1] + u * UP[1] + n * NEAR[1])]
}
const TURN = (Math.PI * 2) / 3
/** the way your hand moves to push the bar (forward, toward the platforms), and how far takes it all the way round */
const PUSH: Pt = [-0.36, -0.93]
const PUSH_LEN = 150
/** the reader's little screen as painted (its four corners), and the LED panel (160 × 68) mapped onto them */
const SCREEN_MATRIX = quadMatrix(160, 68, [[397, 221], [475, 219], [398, 256], [482, 250]])
/** where the tap reader stands on the cabinet's front corner (the point its base sits on) */
const TAP: Pt = [748, 352]

let lastIn = 0
/** swiped in (or just stepped off a train) a few minutes ago: going back down to catch a train doesn't cost another
 *  swipe. You swipe when you enter the subway, never when you're boarding or transferring. */
export const swipedRecently = () => Date.now() - lastIn < 5 * 60_000
/** you're in the system: stepping off a train counts, so heading back down for the next one is a free transfer */
export const markInSystem = () => void (lastIn = Date.now())

export interface SwipeOpts {
  /** the station you're walking into: its name and line bullets (HTML), on the sign hanging over the turnstiles */
  station?: { name: string; bullets: string }
  /**
   * The arrival story's swipe: the first try always gets "please swipe again" (every New Yorker hears it on day one),
   * the third always goes, the card is a MetroCard you swipe (the tap reader says so), and the way out is Skip Intro.
   */
  intro?: boolean
  /** told about every swipe the reader judges (the arrival counts them) */
  onSwipe?: (attempt: number, verdict: Verdict) => void
}
type Verdict = 'go' | 'again' | 'fast' | 'slow'

/** contactless waves, for the tap reader */
const WAVES = `<svg viewBox="0 0 40 40" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"><path d="M12 13a10 10 0 0 1 0 14"/><path d="M18 9a16 16 0 0 1 0 22"/><path d="M24 5a22 22 0 0 1 0 30"/></g></svg>`
/**
 * Your hand, first person, holding the card: a painting (art/hand/metrocard-hand-<skin>.png, one per skin tone) of a
 * hand gripping a card, with the card itself cut out. It sits OVER the real card, so the card's face shows through the
 * window while the thumb lies on top of it and the fingers stay behind. It lives inside the card, so the two tilt and
 * move together, and it's hidden once the card goes into the reader.
 * The numbers place the window on the card: the window's top-left corner and width in the painting's pixels (360 wide),
 * and how far the painted card is turned.
 */
const HAND_FIT = { w: 360, tl: [90.6, 28.5] as const, width: 225.2, angle: -6.69 }
const handImg = (skin: number) => {
  const k = 112 / HAND_FIT.width
  return `<img class="ts-hand-img" src="/art/hand/metrocard-hand-${Math.max(0, Math.min(7, skin | 0))}.png" alt="" draggable="false" style="width:${HAND_FIT.w}px;transform:translate(-3px, -3px) rotate(${-HAND_FIT.angle}deg) scale(${k.toFixed(4)}) translate(${-HAND_FIT.tl[0]}px, ${-HAND_FIT.tl[1]}px)">`
}

/** Resolves true once you're through, false if you back out, 'skip' if you skip the arrival story. */
export function swipeIn(o: SwipeOpts = {}): Promise<boolean | 'skip'> {
  return new Promise((resolve) => {
    const release = hold()
    const root = el('div', 'ts' + (o.intro ? ' intro' : ''))
    root.style.setProperty('--skin', SKINS[save.look?.skin ?? 2] ?? SKINS[2])
    root.innerHTML = `<div class="ts-world"><img class="ts-bg" src="/art/rooms/turnstile.jpg" alt="" draggable="false">
        ${o.station ? `<div class="ts-sign"><span class="ts-sign-name">${o.station.name}</span><span class="ts-lines">${o.station.bullets}</span></div>` : ''}
        <button class="ts-tap" type="button" style="left:${TAP[0]}px;top:${TAP[1]}px" aria-label="Tap reader: tap a card or phone">${WAVES}<span>TAP</span></button>
        <div class="ts-screen" style="transform:${SCREEN_MATRIX}"><div class="ts-dots"><span class="ts-led">SWIPE CARD</span><small class="ts-led-sub"></small></div></div>
        <svg class="ts-bar" viewBox="0 0 1000 565" aria-hidden="true">
          <defs><linearGradient id="ts-steel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f4f7fb"/><stop offset=".45" stop-color="#c3ccd8"/><stop offset="1" stop-color="#7d8898"/></linearGradient></defs>
          <g class="ts-arms"></g>
          <circle cx="${HUB[0]}" cy="${HUB[1]}" r="17" fill="url(#ts-steel)" stroke="#1d2140" stroke-width="4"/>
          <circle cx="${HUB[0] - 4}" cy="${HUB[1] - 5}" r="5" fill="#fff" opacity=".8"/>
        </svg>
        <i class="ts-glow" style="--len:${SLOT_LEN}px;transform:translate(${SLOT_A[0]}px, ${SLOT_A[1] - 5}px) rotate(${SLOT_DEG}deg)"></i>
        <div class="ts-push" hidden><span>Push</span></div>
      </div>
      <div class="ts-card" role="button" tabindex="0" aria-label="Your subway card: click it to swipe, or press Space">
        <div class="ts-mc-face"><i class="ts-mc-gloss"></i></div>
        ${handImg(save.look.skin)}
      </div>
      <div class="ts-hint"><b>Swipe In</b><span>${o.intro ? 'Click your card to swipe it.' : 'Click your card to swipe it, or tap the reader.'}</span></div>
      <button class="btn tiny ghost ts-back" type="button">${o.intro ? 'Skip Intro' : 'Back to the Street'}</button>`
    stage.root.append(root)
    const world = root.querySelector<HTMLElement>('.ts-world')!
    const card = root.querySelector<HTMLElement>('.ts-card')!
    const led = root.querySelector<HTMLElement>('.ts-led')!
    const ledSub = root.querySelector<HTMLElement>('.ts-led-sub')!
    const screen = root.querySelector<HTMLElement>('.ts-screen')!
    const arms = root.querySelector<SVGGElement>('.ts-arms')!
    const push = root.querySelector<HTMLElement>('.ts-push')!
    const hint = root.querySelector<HTMLElement>('.ts-hint span')!
    const title = root.querySelector<HTMLElement>('.ts-hint b')!

    let stepNow: 'swipe' | 'push' | 'done' = 'swipe'
    let finished = false
    const finish = (r: boolean | 'skip') => {
      if (finished) return
      finished = true
      window.removeEventListener('keydown', keys, true)
      if (r === true) lastIn = Date.now()
      root.classList.add('out')
      setTimeout(() => {
        root.remove()
        release()
        resolve(r)
      }, r === true ? 260 : 220)
    }
    root.querySelector<HTMLElement>('.ts-back')!.onclick = () => finish(o.intro ? 'skip' : false)

    const say = (main: string, sub = '', kind: '' | 'bad' | 'go' = '') => {
      led.textContent = main
      led.classList.toggle('long', main.length > 10)
      ledSub.textContent = sub
      screen.className = 'ts-screen' + (kind ? ' ' + kind : '')
    }

    // ---------- the card ----------
    /** in your hand, tilting toward the pointer as it comes near */
    const inHand = (tilt: Pt = [0, 0]) => {
      card.classList.remove('in-slot')
      card.style.transform = `translate(${HAND[0]}px, ${HAND[1] - CARD_H}px) rotate(-7deg) perspective(500px) rotateX(${tilt[1]}deg) rotateY(${tilt[0]}deg)`
    }
    /** standing on its edge in the groove, `s` stage px along it (its front edge) */
    const inSlot = (s: number) => {
      const t = s / SLOT_LEN
      const x = SLOT_A[0] + (SLOT_B[0] - SLOT_A[0]) * t
      const y = SLOT_A[1] + (SLOT_B[1] - SLOT_A[1]) * t
      card.classList.add('in-slot')
      // an upright card along a slanted groove: its top and bottom edges follow the groove, its sides stay vertical
      card.style.transform = `translate(${x}px, ${y + 3 - CARD_H}px) skewY(${SLOT_DEG}deg)`
    }
    inHand()
    card.onpointerleave = () => !dragging && stepNow === 'swipe' && inHand()

    // ---------- swiping ----------
    const START = -CARD_W * 0.25
    const END = SLOT_LEN - CARD_W * 0.55
    let dragging = false
    let grab = 0
    let s = START
    let t0 = 0
    let attempts = 0
    let fluked = false
    const along = (p: Pt) => ((p[0] - SLOT_A[0]) * (SLOT_B[0] - SLOT_A[0]) + (p[1] - SLOT_A[1]) * (SLOT_B[1] - SLOT_A[1])) / SLOT_LEN

    const judge = (ms: number) => {
      attempts++
      // the reader is fussy, like the real one: too fast, too slow, and now and then just "swipe again". The window is
      // wide on purpose (a trackpad drag is slow and jerky); round 2's playtesters failed the old, narrow one.
      let verdict: Verdict
      if (o.intro) verdict = attempts === 1 ? 'again' : attempts >= 3 ? 'go' : ms < 90 ? 'fast' : ms > 2600 ? 'slow' : 'go'
      else {
        const fluke = !fluked && attempts === 1 && Math.random() < 0.15
        if (fluke) fluked = true
        verdict = attempts >= 4 ? 'go' : fluke ? 'again' : ms < 100 ? 'fast' : ms > 2200 ? 'slow' : 'go'
      }
      o.onSwipe?.(attempts, verdict)
      if (verdict !== 'go') {
        fx.buzz()
        if (verdict === 'again') {
          say('SWIPE AGAIN', 'AT THIS TURNSTILE', 'bad')
          hint.textContent = o.intro ? 'Every New Yorker hears that on day one. Go again.' : 'It does that. Every New Yorker knows. Go again.'
        } else if (verdict === 'fast') {
          say('PLEASE SWIPE', 'AGAIN', 'bad')
          hint.textContent = 'A little slower. It’s a card, not a getaway.'
        } else {
          say('PLEASE SWIPE', 'AGAIN', 'bad')
          hint.textContent = 'A little quicker. The train won’t wait.'
        }
        screen.classList.add('shake')
        setTimeout(() => {
          card.classList.add('snap')
          inHand()
          setTimeout(() => card.classList.remove('snap'), 280)
        }, 220)
        setTimeout(() => stepNow === 'swipe' && say('SWIPE CARD'), 1500)
        return
      }
      letIn('swipe')
    }

    /** the reader says GO and the bar unlocks: grab it and push */
    const letIn = (via: 'swipe' | 'tap') => {
      fx.beep()
      say('GO', via === 'tap' ? '1 RIDE' : 'UNLIMITED', 'go')
      stepNow = 'push'
      title.textContent = 'Push Through'
      hint.textContent = 'Click the bar to push through.'
      setTimeout(() => {
        card.classList.add('snap', 'away')
        inHand()
      }, via === 'tap' ? 120 : 350)
      setTimeout(() => {
        push.hidden = false
        rail.ratchet()
      }, 700)
    }

    // ---------- the tap reader: hold the card (or your phone) to it and you're in ----------
    const tap = root.querySelector<HTMLButtonElement>('.ts-tap')!
    const tapIn = () => {
      if (stepNow !== 'swipe' || dragging || auto) return
      // the card hops to the reader and back
      card.classList.add('snap')
      card.style.transform = `translate(${TAP[0] - CARD_W / 2}px, ${TAP[1] - 70}px) rotate(-12deg) scale(0.62)`
      if (o.intro) {
        setTimeout(() => {
          fx.buzz()
          say('SWIPE IT', 'IT’S A METROCARD', 'bad')
          screen.classList.add('shake')
          hint.textContent = 'That card only swipes. Tap is for tomorrow.'
          inHand()
          setTimeout(() => card.classList.remove('snap'), 280)
          setTimeout(() => stepNow === 'swipe' && say('SWIPE CARD'), 1600)
        }, 260)
        return
      }
      setTimeout(() => {
        tap.classList.add('tapped')
        letIn('tap')
      }, 260)
    }
    tap.onclick = (e) => {
      e.stopPropagation()
      tapIn()
    }
    tap.onpointerdown = (e) => e.stopPropagation()

    /** carried in your hand (its bottom-left corner at `at`), on the way to the reader */
    const carried = (at: Pt) => {
      card.classList.remove('in-slot')
      card.style.transform = `translate(${at[0]}px, ${at[1] - CARD_H}px) rotate(${SLOT_DEG * 0.5}deg) scale(0.92)`
    }
    // you pick the card up and carry it to the reader (it glows to show where); near the mouth of the groove it drops
    // in, and from there it slides along the groove with your hand
    let held: 'no' | 'carry' | 'slot' = 'no'
    let downAt: Pt = [0, 0]
    let moved = false
    let offset: Pt = [0, 0]
    const DOCK = 60
    card.onpointerdown = (e) => {
      if (stepNow !== 'swipe' || held !== 'no' || auto) return
      e.preventDefault()
      const p = toStage(e)
      held = 'carry'
      dragging = true
      card.setPointerCapture(e.pointerId)
      root.classList.add('holding')
      offset = [p[0] - HAND[0], p[1] - HAND[1]]
      downAt = p
      moved = false
      carried([p[0] - offset[0], p[1] - offset[1]])
      t0 = 0
    }
    card.onpointermove = (e) => {
      if (held === 'no') {
        // in your hand: it tilts toward the pointer
        if (stepNow !== 'swipe' || auto) return
        const r = card.getBoundingClientRect()
        return inHand([((e.clientX - r.left) / r.width - 0.5) * 18, -((e.clientY - r.top) / r.height - 0.5) * 18])
      }
      const p = toStage(e)
      if (Math.hypot(p[0] - downAt[0], p[1] - downAt[1]) > 8) moved = true
      if (held === 'carry') {
        const at: Pt = [p[0] - offset[0], p[1] - offset[1]]
        carried(at)
        if (Math.hypot(at[0] - SLOT_A[0], at[1] - SLOT_A[1]) > DOCK) return
        // in it goes
        held = 'slot'
        root.classList.remove('holding')
        card.classList.add('snap')
        s = START
        inSlot(s)
        grab = along(p) - s
        rail.ratchet()
        setTimeout(() => card.classList.remove('snap'), 140)
        return
      }
      // backwards is fine (you can wiggle it), but the card only reads going forward
      s = Math.max(START, Math.min(END, along(p) - grab))
      inSlot(s)
      if (!t0 && s > START + 12) {
        t0 = performance.now()
        fx.swipe()
        say('READING', '· · ·')
      }
      if (s >= END) {
        held = 'no'
        dragging = false
        judge(performance.now() - t0)
      }
    }
    card.onpointerup = card.onpointercancel = (e) => {
      if (held === 'no') return
      // a plain click on the card (no drag): it swipes itself, steady and just right
      if (held === 'carry' && !moved && e.type === 'pointerup') {
        held = 'no'
        dragging = false
        root.classList.remove('holding')
        return autoSwipe()
      }
      if (held === 'slot') {
        say('SWIPE CARD')
        hint.textContent = 'All the way through the reader, in one go.'
      }
      held = 'no'
      dragging = false
      root.classList.remove('holding')
      card.classList.add('snap')
      inHand()
      setTimeout(() => card.classList.remove('snap'), 280)
    }
    /** Space: a steady swipe, played for you */
    let auto = false
    const autoSwipe = () => {
      if (auto || dragging) return
      auto = true
      card.classList.add('snap')
      inSlot(START)
      setTimeout(() => {
        card.classList.remove('snap')
        fx.swipe()
        say('READING', '· · ·')
        const from = performance.now()
        const step = (t: number) => {
          s = START + ((t - from) / 520) * (END - START)
          inSlot(Math.min(END, s))
          if (s < END) return void requestAnimationFrame(step)
          auto = false
          judge(520)
        }
        requestAnimationFrame(step)
      }, 200)
    }

    // ---------- the bar ----------
    let phi = 0
    const draw = () => {
      const list = [0, 1, 2].map((i) => {
        const d = armDir(phi + i * TURN)
        return { d, root: onScreen(d, 22), tip: onScreen(d, ARM) }
      })
      // back to front, and the near ones a little thicker
      list.sort((a, b) => a.d[2] - b.d[2])
      arms.innerHTML = list
        .map(({ d, root: r, tip }) => {
          const w = 17 * (1 + d[2] * 0.25)
          const line = `M${r[0].toFixed(1)} ${r[1].toFixed(1)}L${tip[0].toFixed(1)} ${tip[1].toFixed(1)}`
          return `<path d="${line}" stroke="#1d2140" stroke-width="${(w + 7).toFixed(1)}" stroke-linecap="round"/>
            <path d="${line}" stroke="url(#ts-steel)" stroke-width="${w.toFixed(1)}" stroke-linecap="round"/>
            <path d="${line}" stroke="#fff" stroke-opacity=".55" stroke-width="${(w * 0.22).toFixed(1)}" stroke-linecap="round" transform="translate(0 ${(-w * 0.22).toFixed(1)})"/>`
        })
        .join('')
      const tip = onScreen(armDir(phi), ARM)
      push.style.transform = `translate(${tip[0]}px, ${tip[1]}px)`
    }
    draw()

    let pushing = false
    let from: Pt = [0, 0]
    let lastTick = 0
    /** turn the bar by dφ (negative is away from you), with a ratchet click every 20° */
    const turn = (to: number) => {
      phi = Math.max(-TURN, Math.min(0.06, to))
      const tick = Math.floor(-phi / (Math.PI / 9))
      if (tick > lastTick) rail.ratchet()
      lastTick = Math.max(0, tick)
      draw()
    }
    const through = () => {
      stepNow = 'done'
      push.hidden = true
      const from = phi
      const t0 = performance.now()
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / 220)
        turn(from + (-TURN - from) * (1 - (1 - k) * (1 - k)))
        if (k < 1) return void requestAnimationFrame(step)
        fx.clack()
        say('', '')
        hint.textContent = 'You’re in.'
        // and you walk on through, toward the platforms
        world.classList.add('walk')
        setTimeout(() => finish(true), 700)
      }
      requestAnimationFrame(step)
    }
    const springBack = () => {
      const from = phi
      const t0 = performance.now()
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / 300)
        phi = from * (1 - k) * (1 - k) * Math.cos(k * 6)
        lastTick = 0
        draw()
        if (k < 1) requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    }
    const near = (p: Pt) => {
      // anywhere on the level arm (or the bar's hand-hold) counts as grabbing it
      const a = onScreen(armDir(phi), 22)
      const b = onScreen(armDir(phi), ARM)
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)))
      return Math.hypot(p[0] - (a[0] + (b[0] - a[0]) * t), p[1] - (a[1] + (b[1] - a[1]) * t)) < 34
    }
    world.onpointerdown = (e) => {
      if (stepNow !== 'push') return
      const p = toStage(e)
      if (!near(p)) return
      pushing = true
      from = p
      push.hidden = true
      world.setPointerCapture(e.pointerId)
      world.classList.add('grab')
    }
    world.onpointermove = (e) => {
      if (stepNow === 'push' && !pushing) world.classList.toggle('can-grab', near(toStage(e)))
      if (!pushing) return
      const p = toStage(e)
      // pushing is moving your hand forward, up the screen toward the platforms: the further, the further it turns
      const pushed = (p[0] - from[0]) * PUSH[0] + (p[1] - from[1]) * PUSH[1]
      turn(-(pushed / PUSH_LEN) * TURN)
      if (phi <= -TURN * 0.5) {
        pushing = false
        world.classList.remove('grab')
        through()
      }
    }
    world.onpointerup = world.onpointercancel = () => {
      if (!pushing) return
      pushing = false
      world.classList.remove('grab')
      // a click on the bar (no push) walks you through; so does pushing it a third of the way
      if (phi > -0.04 || phi < -TURN * 0.33) return through()
      springBack()
      push.hidden = false
    }

    // ---------- keys ----------
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        return o.intro ? undefined : finish(false)
      }
      if ((e.key === 't' || e.key === 'T') && stepNow === 'swipe') {
        e.preventDefault()
        e.stopPropagation()
        return tapIn()
      }
      if (e.key !== ' ' && e.key !== 'Enter') return
      e.preventDefault()
      e.stopPropagation()
      if (stepNow === 'swipe') autoSwipe()
      else if (stepNow === 'push' && !pushing) through()
    }
    window.addEventListener('keydown', keys, true)
    card.focus({ preventScroll: true })
  })
}
