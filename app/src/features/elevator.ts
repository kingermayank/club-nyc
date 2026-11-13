import './elevator.css'
import { audioCtx, sfx } from '../audio'
import { el, stage } from '../engine/stage'
import { hold } from '../engine/ui'

/**
 * The Empire State Building's elevator (lobby <-> the 86th floor deck): you step in, the brass doors close, the
 * needle on the dial sweeps up the floors, a ding, and the doors open on where you were going. About six seconds;
 * a click hurries it along. The room changes behind the closed doors (`arrive`), so the doors open onto it.
 *
 * The cab is one painting (art/rooms/empire-elevator.jpg, 1000 x 565 stage units): the doorway is cut out of it and
 * the two door leaves are the same painting, so they slide apart exactly where they were drawn.
 */
const DOOR = { x: 351, y: 132, w: 298, h: 371 }
/** the dial in the arch over the doors: the needle's pivot, how far it reaches, and the circle the numbers sit on */
const HUB = { x: 500, y: 95, needle: 39, ticks: 45, marks: 60 }
const TOP = 86
/** how far the needle swings either side of straight up: floor 1 and floor 86 sit level with each other */
const SWING = 76
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** needle angle (degrees from straight up) for a floor */
const angle = (floor: number) => -SWING + (2 * SWING * (floor - 1)) / (TOP - 1)
/** the point at `r` from the pivot, toward a floor */
const on = (floor: number, r: number): [number, number] => {
  const a = ((angle(floor) - 90) * Math.PI) / 180
  return [HUB.x + Math.cos(a) * r, HUB.y + Math.sin(a) * r]
}
const xy = (p: [number, number]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`

function dial(): string {
  // one true arc: the track, a tick every ten floors, and the numbers all the same distance from the pivot.
  // (80 gets a tick but no number: it would sit on top of 86.)
  const track = `M${xy(on(1, HUB.ticks))}A${HUB.ticks} ${HUB.ticks} 0 0 1 ${xy(on(TOP, HUB.ticks))}`
  const ticks = [1, 10, 20, 30, 40, 50, 60, 70, 80, TOP].map((f) => `M${xy(on(f, HUB.ticks))}L${xy(on(f, HUB.ticks + (f % 20 && f !== 1 && f !== TOP ? 3 : 5)))}`).join('')
  const marks = [1, 20, 40, 60, TOP].map((f) => {
    const [x, y] = on(f, HUB.marks)
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}">${f}</text>`
  }).join('')
  return `<svg class="elv-dial" viewBox="0 0 1000 565" aria-hidden="true"><path class="elv-track" d="${track}${ticks}"/>${marks}
    <g class="elv-needle"><path d="M${HUB.x - 3.5} ${HUB.y}L${HUB.x} ${HUB.y - HUB.needle}L${HUB.x + 3.5} ${HUB.y}Z"/></g>
    <circle cx="${HUB.x}" cy="${HUB.y}" r="6"/></svg>`
}

/** the motor: a low hum that rises (or falls) with the cab; returns a stop function */
function hum(up: boolean, seconds: number): () => void {
  const ac = audioCtx()
  if (!ac) return () => {}
  const o = ac.createOscillator()
  const f = ac.createBiquadFilter()
  const g = ac.createGain()
  o.type = 'sawtooth'
  f.type = 'lowpass'
  f.frequency.value = 220
  const t = ac.currentTime
  const [a, b] = up ? [52, 84] : [84, 52]
  o.frequency.setValueAtTime(a, t)
  o.frequency.linearRampToValueAtTime(b, t + seconds * 0.5)
  o.frequency.linearRampToValueAtTime(a + (b - a) * 0.35, t + seconds)
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(0.045, t + 0.5)
  o.connect(f).connect(g).connect(ac.destination)
  o.start()
  return () => {
    const now = ac.currentTime
    g.gain.cancelScheduledValues(now)
    g.gain.setTargetAtTime(0, now, 0.12)
    o.stop(now + 0.6)
  }
}

let riding = false

/** Ride between the lobby (floor 1) and the deck (floor 86). `arrive` changes the room; it runs behind closed doors. */
export async function rideElevator(up: boolean, arrive: () => Promise<unknown> | void) {
  if (riding) return
  riding = true
  const release = hold()
  const quick = reduced()
  const root = el('div', 'elv open')
  root.innerHTML = `<div class="elv-way"><i class="elv-door l"></i><i class="elv-door r"></i><i class="elv-seam"></i><i class="elv-depth"></i></div>
    <div class="elv-cab"></div>${dial()}<b class="elv-floor" translate="no"></b>`
  root.style.setProperty('--dx', `${DOOR.x}px`)
  root.style.setProperty('--dy', `${DOOR.y}px`)
  root.style.setProperty('--dw', `${DOOR.w}px`)
  root.style.setProperty('--dh', `${DOOR.h}px`)
  stage.root.append(root)
  const needle = root.querySelector<SVGGElement>('.elv-needle')!
  const floorEl = root.querySelector<HTMLElement>('.elv-floor')!
  const from = up ? 1 : TOP
  const to = up ? TOP : 1
  const show = (f: number) => {
    needle.style.transform = `rotate(${angle(f)}deg)`
    floorEl.textContent = String(Math.round(f))
  }
  show(from)
  let hurry = false
  root.addEventListener('pointerdown', () => (hurry = true))

  // step in: the doors close on the room you're leaving
  await wait(quick ? 50 : 700)
  root.classList.remove('open')
  sfx.pop()
  await wait(quick ? 100 : 1000)
  root.classList.add('shut')

  // behind closed doors the building changes floors (no white wipe: the doors are the wipe)
  stage.fade.style.visibility = 'hidden'
  const there = Promise.resolve(arrive())
  const seconds = quick ? 0.6 : 4.6
  const stopHum = hum(up, seconds)
  root.classList.add('moving', up ? 'up' : 'down')
  const t0 = performance.now()
  await new Promise<void>((done) => {
    const tick = (now: number) => {
      const p = hurry ? 1 : Math.min(1, (now - t0) / (seconds * 1000))
      // ease in and out, like a cab leaving and landing
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
      show(from + (to - from) * e)
      if (p < 1) requestAnimationFrame(tick)
      else done()
    }
    requestAnimationFrame(tick)
  })
  await there
  // the floor you're arriving on has to be painted before the doors part
  for (let i = 0; i < 40 && !(stage.bg.complete && stage.bg.naturalWidth); i++) await wait(100)
  await wait(quick ? 0 : 320)
  stage.fade.style.visibility = ''
  stopHum()
  root.classList.remove('moving')
  show(to)
  // the cab settles, a ding, a beat, then the doors part
  root.classList.add('landed')
  sfx.ding()
  await wait(quick ? 80 : 620)

  // the doors open on where you were going, and you walk out through them
  root.classList.remove('shut')
  root.classList.add('open', 'arrived')
  await wait(quick ? 150 : 1500)
  root.classList.add('leaving')
  await wait(quick ? 100 : 900)
  root.remove()
  release()
  riding = false
}
