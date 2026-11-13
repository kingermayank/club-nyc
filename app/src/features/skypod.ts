import './skypod.css'
import { audioCtx, sfx } from '../audio'
import { avatarMarkup, VIEWBOX } from '../avatar/render'
import { el, stage } from '../engine/stage'
import { hold } from '../engine/ui'
import { play } from '../sound/library'
import { save } from '../state'
import { quadMatrix } from './downtown'

/**
 * One World Trade's elevator, after the real one (the SkyPod): the steel doors close on the plaza, and the cab's
 * walls are screens. As you climb 102 floors the island outside grows up with you, from the forest of 1500 to
 * today's skyline, while the floor and the year count up. At the top the front screen lifts away on the real view
 * (the real ride ends in a theater whose screen rises on the skyline) and you walk out onto Sky Deck 102.
 * Going down is the short way: today's city sinks past the walls and the doors open on the plaza.
 *
 * The cab is one painting (art/downtown/skypod-cab.jpg, 1000 x 565 stage units) with its screens painted black; the
 * time-lapse is a clip made between our own four paintings of the island (art/video/skypod-timelapse.mp4), and the
 * same four stills crossfade underneath it, so the walls are never blank if the clip is slow to arrive.
 */
/** the front screen in the cab painting, and the two side walls as quads [top-left, top-right, bottom-left, bottom-right] */
const FRONT = { x: 284, y: 84, w: 432, h: 276 }
const LEFT: Parameters<typeof quadMatrix>[2] = [[0, -75], [265, 84], [0, 455], [265, 360]]
const RIGHT: Parameters<typeof quadMatrix>[2] = [[735, 84], [1000, -75], [735, 360], [1000, 455]]
const SIDE = { w: 240, h: 300 }
const TOP = 102
/** the clip's three legs (5 s each) and the years they cover */
const YEARS = [1500, 1660, 1931, new Date().getFullYear()]
const ERAS = ['1500', '1660', '1931', 'today']
const CLIP_S = 14.8

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2)

/** the motor and the air in the shaft: the recording if it's there, and under it a rush of air that rises and falls with the speed */
function rideSound(seconds: number): () => void {
  const stops: (() => void)[] = []
  const rec = play('skypod.ride', { seconds })
  if (rec) stops.push(rec)
  const ac = audioCtx()
  if (ac) {
    const len = ac.sampleRate * 2
    const buf = ac.createBuffer(1, len, ac.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    const src = ac.createBufferSource()
    src.buffer = buf
    src.loop = true
    const band = ac.createBiquadFilter()
    band.type = 'bandpass'
    band.Q.value = 0.9
    const g = ac.createGain()
    const t = ac.currentTime
    // fast in the middle of the shaft, slow at both ends
    band.frequency.setValueAtTime(180, t)
    band.frequency.linearRampToValueAtTime(900, t + seconds * 0.45)
    band.frequency.linearRampToValueAtTime(220, t + seconds)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(rec ? 0.05 : 0.09, t + seconds * 0.4)
    g.gain.linearRampToValueAtTime(0.012, t + seconds)
    src.connect(band).connect(g).connect(ac.destination)
    src.start()
    stops.push(() => {
      const now = ac.currentTime
      g.gain.cancelScheduledValues(now)
      g.gain.setTargetAtTime(0, now, 0.15)
      src.stop(now + 0.8)
    })
  }
  return () => stops.forEach((f) => f())
}
const once = (key: string, fallback: () => void) => void (play(key) ?? fallback())

let riding = false

/** Ride between the plaza (floor 1) and Sky Deck 102. `arrive` changes the room; it runs while the doors are shut. */
export async function rideSkyPod(up: boolean, arrive: () => Promise<unknown> | void) {
  if (riding) return
  riding = true
  const release = hold()
  const quick = matchMedia('(prefers-reduced-motion: reduce)').matches
  const { x, y, w, h } = VIEWBOX
  const root = el('div', 'skp' + (up ? ' up' : ' down'))
  root.innerHTML = `<div class="skp-cam">
      <div class="skp-wall l"><canvas width="${SIDE.w}" height="${SIDE.h}"></canvas></div>
      <div class="skp-wall r"><canvas width="${SIDE.w}" height="${SIDE.h}"></canvas></div>
      <div class="skp-front">
        <div class="skp-real"></div>
        <div class="skp-lift">
          <div class="skp-feed">${ERAS.map((e) => `<img src="/art/downtown/era-${e}.jpg" alt="" draggable="false">`).join('')}
            ${up ? '<video src="/art/video/skypod-timelapse.mp4" muted playsinline preload="auto" disablepictureinpicture></video>' : ''}
          </div>
          <b class="skp-year" translate="no"></b>
        </div>
      </div>
      <div class="skp-cab"></div>
      <i class="skp-streak l"></i><i class="skp-streak r"></i>
      <div class="skp-floor" translate="no"><small>FLOOR</small><b></b></div>
      <svg class="skp-rider" viewBox="${x} ${y} ${w} ${h}" aria-hidden="true">${avatarMarkup(save.look, { back: true })}</svg>
    </div>
    <div class="skp-doors"><i class="l"></i><i class="r"></i></div>
    <button class="skp-skip" type="button" aria-label="Skip the ride"><svg viewBox="0 0 24 20" aria-hidden="true"><path d="M4 4 L11 10 L4 16 M13 4 L20 10 L13 16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></button>`
  const q = <T extends Element>(sel: string) => root.querySelector<T>(sel)!
  const front = q<HTMLElement>('.skp-front')
  front.style.cssText = `left:${FRONT.x}px;top:${FRONT.y}px;width:${FRONT.w}px;height:${FRONT.h}px`
  const walls = [q<HTMLElement>('.skp-wall.l'), q<HTMLElement>('.skp-wall.r')]
  walls[0].style.transform = quadMatrix(SIDE.w, SIDE.h, LEFT)
  walls[1].style.transform = quadMatrix(SIDE.w, SIDE.h, RIGHT)
  const sides = walls.map((wl) => wl.querySelector('canvas')!.getContext('2d')!)
  const feed = q<HTMLElement>('.skp-feed')
  const stills = [...feed.querySelectorAll('img')]
  const video = feed.querySelector('video')
  const yearEl = q<HTMLElement>('.skp-year')
  const floorEl = q<HTMLElement>('.skp-floor b')
  const cam = q<HTMLElement>('.skp-cam')
  stage.root.append(root)

  let hurry = false
  q<HTMLButtonElement>('.skp-skip').onclick = (e) => {
    e.stopPropagation()
    sfx.click()
    hurry = true
  }
  const keys = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return
    e.preventDefault()
    e.stopPropagation()
    hurry = true
  }
  window.addEventListener('keydown', keys, true)

  /** p: 0 at the plaza's floor, 1 at the top */
  const show = (p: number) => {
    floorEl.textContent = String(Math.max(1, Math.round(1 + (TOP - 1) * p)))
    // which painting the wall is on, and how far into the next one
    const at = up ? Math.min(2.999, p * 3) : 3
    const i = Math.floor(at)
    stills.forEach((s, k) => (s.style.opacity = up ? String(k <= i ? 1 : k === i + 1 ? at - i : 0) : k === 3 ? '1' : '0'))
    yearEl.textContent = String(Math.round(YEARS[i] + (YEARS[Math.min(3, i + 1)] - YEARS[i]) * (at - i)))
    // the camera climbs: the island drops away below you
    feed.style.transform = `translateY(${((p - 0.5) * 9).toFixed(2)}%) scale(${(1.1 + p * 0.1).toFixed(3)})`
    // the side walls carry the edges of the same picture
    const src: CanvasImageSource = video && video.readyState >= 2 && !video.paused ? video : stills[Math.min(3, Math.round(at))]
    const sw = (src as HTMLVideoElement).videoWidth || (src as HTMLImageElement).naturalWidth
    const sh = (src as HTMLVideoElement).videoHeight || (src as HTMLImageElement).naturalHeight
    if (sw) {
      sides[0].drawImage(src, 0, 0, sw * 0.3, sh, 0, 0, SIDE.w, SIDE.h)
      sides[1].drawImage(src, sw * 0.7, 0, sw * 0.3, sh, 0, 0, SIDE.w, SIDE.h)
    }
  }
  show(up ? 0 : 1)

  // ---------- the doors close on where you were ----------
  await wait(quick ? 30 : 120)
  root.classList.add('shut')
  once('skypod.close', () => sfx.pop())
  await wait(quick ? 120 : 1000)
  root.classList.add('inside')
  await wait(quick ? 60 : 450)

  // ---------- the ride ----------
  const seconds = quick ? 0.5 : up ? 10 : 4.6
  const stopSound = quick ? () => {} : rideSound(seconds)
  root.classList.add('moving')
  cam.style.transform = 'scale(1.42)'
  if (video && !quick) {
    video.playbackRate = CLIP_S / seconds
    video.addEventListener('playing', () => video.classList.add('on'), { once: true })
    void video.play().catch(() => {})
  }
  const t0 = performance.now()
  let eased = false
  // the room changes near the top of the ride, so what it has to say (a stamp, a hello) lands as you arrive
  let there: Promise<unknown> | null = null
  await new Promise<void>((done) => {
    const tick = (now: number) => {
      const p = hurry ? 1 : Math.min(1, (now - t0) / (seconds * 1000))
      show(up ? ease(p) : 1 - ease(p))
      root.style.setProperty('--speed', String(Math.sin(Math.PI * p)))
      // easing back out of the screens as the cab slows
      if (p > 0.82 && !eased) {
        eased = true
        there = Promise.resolve(arrive())
        cam.style.transform = 'scale(1.12)'
      }
      if (p < 1) requestAnimationFrame(tick)
      else done()
    }
    requestAnimationFrame(tick)
  })
  await (there ?? arrive())
  stopSound()
  video?.pause()
  root.classList.remove('moving')
  show(up ? 1 : 0)
  cam.style.transform = 'scale(1.12)'
  once('skypod.ding', () => sfx.ding())
  await wait(quick ? 80 : 650)

  // ---------- arriving: up top the screen lifts on the real view; at the bottom the doors simply open ----------
  once('skypod.open', () => sfx.whoosh())
  root.classList.add('reveal')
  await wait(quick ? 100 : up ? 1250 : 500)
  root.classList.add('leaving')
  await wait(quick ? 150 : 950)
  window.removeEventListener('keydown', keys, true)
  root.remove()
  release()
  riding = false
}
