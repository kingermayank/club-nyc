import './taxi.css'
import { sfx } from '../../audio'
import { el } from '../../engine/stage'
import { goto, world } from '../../engine/world'
import { GEO } from '../../data/geo'
import { ROOMS } from '../../data/rooms'
import { MAP_SPOTS } from '../map'
import type { Game } from '../../types'
import { closeX, openMoment } from './kit'
import { cu } from '../../sound/closeup'

/**
 * A cab ride. You hail one and you're in the back seat, looking over the partition at the driver and the avenue.
 * The passenger screen on the partition is the map of the island: tap it to lean in, pick where you're going, and
 * the cab pulls out and drives (a real clip of this same picture, so the street moves) until you step out there.
 *
 * The picture and the clip are one thing: art/video/taxi-ride.mp4 held on its first frame while you choose, so
 * nothing swaps when the ride starts (see features/subwayTrain.ts for why).
 */
const ART = '/art/closeups/taxi.jpg'
const CLIP = '/art/video/taxi-ride.mp4'
/** the painted screen (stage px) and the island map's proportions */
const SCREEN = { x: 354, y: 284, w: 292, h: 157 }
const MAP_W = 1000
const MAP_H = 664
const RIDE_S = 3.6

export function taxiRide(g: Game) {
  const m = openMoment('cu taxi')
  const here = world.room.mapSpot ?? world.room.id
  const cam = el('div', 'tx-cam')
  cam.innerHTML = `<img class="tx-art" src="${ART}" alt="" draggable="false"><video class="tx-clip" src="${CLIP}" muted playsinline preload="auto"></video>`
  const clip = cam.querySelector<HTMLVideoElement>('.tx-clip')!
  // the clip takes over from the painting once its first frame is ready (they are the same picture)
  clip.addEventListener('loadeddata', () => clip.classList.add('on'), { once: true })
  const screen = el('div', 'tx-screen')
  screen.style.cssText = `left:${SCREEN.x}px;top:${SCREEN.y}px;width:${SCREEN.w}px;height:${SCREEN.h}px`
  // the island sits in the middle of the screen at full height, with its own sea (the same picture, soft) running
  // out to the edges; a place's name pops up over its dot when you point at it
  const mapW = (SCREEN.h * MAP_W) / MAP_H
  const map = el('div', 'tx-map', `<img src="/art/rooms/map.jpg" alt="" draggable="false">`)
  map.style.width = `${mapW}px`
  const tip = el('div', 'tx-tip')
  const banner = el('div', 'tx-banner')
  map.append(tip)
  screen.append(map, banner)
  const label = (pin: HTMLElement | null, text = '') => {
    tip.classList.toggle('on', !!pin)
    if (!pin) return
    tip.textContent = text
    tip.style.left = pin.style.left
    tip.style.top = pin.style.top
    // near the top edge the name goes under the dot instead of over it
    tip.classList.toggle('under', parseFloat(pin.style.top) < 22)
  }
  cam.append(screen)
  const x = closeX(m)
  x.classList.add('cu-x')
  m.root.append(cam, x)

  const cut = GEO.map?.cutouts ?? {}
  let going = false
  for (const s of MAP_SPOTS) {
    const c = cut[s.id]
    if (!c || !s.room || !ROOMS[s.room]) continue
    const [rx, ry, rw, rh] = c.rect
    const pin = el('button', 'tx-pin' + (s.id === here || s.room === here ? ' here' : '')) as HTMLButtonElement
    pin.type = 'button'
    pin.setAttribute('aria-label', s.label)
    pin.style.cssText = `left:${((rx + rw / 2) / MAP_W) * 100}%;top:${((ry + rh * 0.6) / MAP_H) * 100}%`
    const isHere = s.id === here || s.room === here
    pin.onpointerenter = () => (label(pin, isHere ? 'You’re here' : s.label), sfx.tick())
    pin.onpointerleave = () => label(null)
    pin.onclick = (e) => {
      e.stopPropagation()
      if (going || !leaned) return
      if (isHere) return void sfx.squawk()
      pin.classList.add('picked')
      go(s.room!, s.label)
    }
    map.append(pin)
  }

  // lean in to the screen, and back
  let leaned = false
  const lean = (on: boolean) => {
    leaned = on
    m.root.classList.toggle('leaned', on)
    cam.style.transform = on ? `translate(${500 - (SCREEN.x + SCREEN.w / 2) * 2.7}px, ${290 - (SCREEN.y + SCREEN.h / 2) * 2.7}px) scale(2.7)` : ''
    sfx.whoosh()
  }
  screen.onclick = () => !leaned && !going && lean(true)
  cam.onclick = (e) => leaned && !going && e.target !== screen && !screen.contains(e.target as Node) && lean(false)
  m.onKey((e) => (e.key === 'Backspace' && leaned && !going ? (lean(false), true) : false))

  const go = (room: string, place: string) => {
    going = true
    label(null)
    banner.innerHTML = `<small>Going to</small>${place}`
    banner.classList.add('on')
    sfx.ding()
    m.later(() => lean(false), 500)
    m.later(() => {
      sfx.honk()
      const stop = cu.engine()
      m.onClose(() => typeof stop === 'function' && stop())
      void clip.play().catch(() => {})
    }, 1000)
    m.later(() => {
      // the street changes behind the cab, then the door opens on it
      void goto(room).then(() => {
        m.close()
        sfx.thunk()
        setTimeout(() => g.say('Keep the change.'), 700)
      })
    }, 1000 + RIDE_S * 1000)
  }

  // in you get
  sfx.thunk()
  m.later(() => !leaned && !going && screen.classList.add('nudge'), 1400)
}
