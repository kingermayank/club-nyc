import './subwayTrain.css'
import { kit, subway as rail } from '../foley'
import { el, stage } from '../engine/stage'
import { world, onRoom } from '../engine/world'
import type { Game } from '../types'
import seg from '../data/subway-train.json'

/**
 * The train at Times Sq–42 St really comes and goes. It runs on a timetable everyone shares (the clock, so every
 * player on the platform sees the same train): it pulls in from the tunnel, the doors slide open, it waits, the chime
 * sounds, the doors close and it pulls out. The board over the platform counts down to the next one, and you can only
 * board while the doors are open.
 *
 * How it moves: the platform's picture has no train in it (art/rooms/subway-empty.jpg). Over the train side of the room
 * lies one clip, always there and never swapped for a picture: the train arriving, its doors opening, closing, and the
 * train leaving (art/video/subway-train.mp4). The timetable says which moment of the clip is on screen: it plays through
 * the arrival, holds on the open doors while you board, plays the doors closing and the departure, then holds on its
 * last frame, the empty track, until the next train. tools/subway_train.py builds the clip from animations of our own
 * painting and pins every pixel the train never covers to the room's picture, so the clip's empty-track frame IS the
 * room and nothing can be seen starting or stopping.
 */

/** the strip: stage x from here to the right edge (the clip is cut to it) */
const STRIP_X = 690

// ---------- the timetable (seconds into a cycle) ----------
const CYCLE = 80
const len = (k: 'arrive' | 'open' | 'close' | 'depart') => seg[k][1] - seg[k][0]
/** when each thing starts: the arrival, the doors, boarding, the chime, the doors closing, pulling out, the empty track */
const T = (() => {
  const open = len('arrive')
  const board = open + len('open')
  const close = 32
  const shutting = close + 0.9
  const leave = shutting + len('close')
  return { open, board, close, shutting, leave, gone: leave + len('depart') }
})()
type Phase = 'arriving' | 'opening' | 'boarding' | 'closing' | 'leaving' | 'away'
/** dev builds: `clubNycTrainSkew = 20` in the console moves the timetable 20 s on, to look at any moment of the cycle */
const skew = () => (import.meta.env.DEV ? Number((window as unknown as { clubNycTrainSkew?: number }).clubNycTrainSkew ?? 0) : 0)
export function trainNow(now = Date.now()): { phase: Phase; t: number; next: number; closesIn: number } {
  const t = (((now / 1000 + skew()) % CYCLE) + CYCLE) % CYCLE
  const phase: Phase = t < T.open ? 'arriving' : t < T.board ? 'opening' : t < T.close ? 'boarding' : t < T.leave ? 'closing' : t < T.gone ? 'leaving' : 'away'
  return { phase, t, next: Math.ceil(CYCLE - t), closesIn: Math.ceil(T.close - t) }
}
/**
 * What the clip should be doing at cycle time t.
 *  - `run`: playing, and `at` is where it should be (it is only moved if it has drifted).
 *  - not running: stopped. At the doors it simply stops where it is and later carries on from the same frame, so there
 *    is nothing to see. `at` is only used to put a clip that isn't there yet in the right place (you walked in mid-wait).
 *  - `hide`: with no train the clip's picture is the room's picture, so the clip is dissolved away, slowly, and brought
 *    back the same way shortly before the next train. While it is away it is wound back to its start. That is the one
 *    jump in the whole cycle, and it happens unseen.
 */
function clipAt(t: number): { at: number | null; run: boolean; hide: boolean } {
  if (t < T.board) return { at: t, run: true, hide: false }
  if (t < T.shutting) return { at: seg.holdOpen, run: false, hide: false }
  if (t < T.gone) return { at: seg.close[0] + (t - T.shutting), run: true, hide: false }
  const since = t - T.gone
  const left = CYCLE - t
  return { at: since < 1.8 ? null : 0, run: false, hide: since > 0.15 && left > 2.8 }
}

// ---------- sounds ----------
function pullOut() {
  const a = kit.ctx()
  if (!a) return
  const t = a.currentTime
  const sec = 7
  const g = kit.swell(a, [[t, 0], [t + 1.2, 0.16], [t + sec * 0.6, 0.2], [t + sec, 0]])
  kit.bed(a, t, sec, g, { type: 'lowpass', f: 110, to: 320 })
  // wheels over the joints, closer together as it picks up speed (the gap never shrinks to nothing: an earlier
  // version's did, and the loop never ended)
  for (let s = 1.4, gap = 0.7, n = 0; s < sec * 0.85 && n < 24; s += gap, gap = Math.max(0.16, gap * 0.84), n++) {
    kit.noise(a, t + s, 0.05, 0.055, { type: 'lowpass', f: 420 })
    kit.noise(a, t + s + 0.09, 0.05, 0.045, { type: 'lowpass', f: 380 })
  }
}
/** quiet while a card, a game or a ride has the screen */
const busy = () => !!stage.root.querySelector('.overlay.open, .game-shell, .ride-car, .ts, .arrival')

// ---------- the room ----------
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
onRoom('subway', ({ scene }) => {
  // the traced cutout of the painted train is retired (it still takes the click for "Board the Train")
  const old = [...scene.querySelectorAll<HTMLImageElement>('img.cutout')].find((i) => (i.getAttribute('src') ?? '').includes('/train.png'))
  if (old) old.style.display = 'none'
  const strip = el('div', 'st-strip')
  strip.style.cssText = `left:${STRIP_X}px;width:${1000 - STRIP_X}px`
  // one clip, always there. Until it has loaded nothing is drawn (the room's empty track shows), except while a
  // train should be standing with its doors open: then a still of exactly that frame stands in.
  strip.innerHTML = `<img class="st-wait" src="/art/fx/subway-train-open.jpg" alt="" draggable="false"><video class="st-clip" src="/art/video/subway-train.mp4" muted playsinline preload="auto" disablepictureinpicture></video>`
  const board = el('div', 'st-board', '<span class="st-bullet">1</span><b></b><em></em>')
  scene.append(strip, board)
  const v = strip.querySelector('video')!
  const wait = strip.querySelector<HTMLImageElement>('.st-wait')!
  const what = board.querySelector('b')!
  const when = board.querySelector('em')!
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches

  let last: Phase | '' = ''
  let held = -1
  let ready = false
  let raf = 0
  const frame = () => {
    raf = requestAnimationFrame(frame)
    const now = trainNow()
    let want = clipAt(now.t)
    // reduced motion: no movement, the train is simply there (doors open) or not
    if (calm) {
      const here = now.phase === 'opening' || now.phase === 'boarding' || now.phase === 'closing'
      want = { at: here ? seg.holdOpen : 0, run: false, hide: !here }
    }
    // once it has a frame it stays for good: a clip reports "not ready" for an instant every time it is moved, and
    // hiding it then would blink the train off
    if (!ready && v.readyState >= 2) {
      ready = true
      v.classList.toggle('away', want.hide)
      v.classList.add('on')
      wait.classList.remove('on')
    }
    if (!ready) wait.classList.toggle('on', now.phase === 'boarding' || now.phase === 'opening')
    if (ready) {
      v.classList.toggle('away', want.hide)
      if (want.run && want.at !== null) {
        held = -1
        // it runs on its own clock; it is only moved if it has drifted (you walked in mid-way, or the tab was asleep)
        if (Math.abs(v.currentTime - want.at) > 0.25) v.currentTime = want.at
        if (v.paused && want.at < seg.length - 0.05) void v.play().catch(() => {})
      } else {
        if (!v.paused) v.pause()
        // stop where it is; only a clip that is somewhere else entirely is moved, once
        if (want.at !== null && held !== want.at) {
          held = want.at
          if (Math.abs(v.currentTime - want.at) > 0.12) v.currentTime = want.at
        }
      }
    }
    // the board over the platform
    const [w1, w2] =
      now.phase === 'arriving' ? ['Train arriving', '']
      : now.phase === 'opening' || now.phase === 'boarding' ? ['Boarding', `Doors close ${clock(Math.max(0, now.closesIn))}`]
      : now.phase === 'closing' ? ['Stand clear', 'Doors closing']
      : ['Next train', clock(now.next)]
    if (what.textContent !== w1) what.textContent = w1
    if (when.textContent !== w2) when.textContent = w2
    if (now.phase === last) return
    // ---- a new phase
    const first = last === ''
    last = now.phase
    board.classList.toggle('go', now.phase === 'boarding' || now.phase === 'opening')
    if (first || busy()) return
    if (now.phase === 'arriving') rail.arrive()
    else if (now.phase === 'opening') rail.doorsOpen()
    else if (now.phase === 'closing') {
      rail.chime()
      setTimeout(() => !busy() && world.room.id === 'subway' && rail.doorsClose(), 1000)
    } else if (now.phase === 'leaving') pullOut()
  }
  raf = requestAnimationFrame(frame)
  return () => {
    cancelAnimationFrame(raf)
    v.pause()
  }
})

/** "Board the Train": only while it's standing there with its doors open */
export function board(g: Game) {
  const now = trainNow()
  if (now.phase === 'boarding' || now.phase === 'opening') return g.openSubway()
  if (now.phase === 'arriving') return g.say('Here it comes.')
  if (now.phase === 'closing' || now.phase === 'leaving') return g.say(`Just missed it. The next train is in ${clock(now.next)}.`)
  g.say(`No train yet. The next one is in ${clock(now.next)}.`)
}
