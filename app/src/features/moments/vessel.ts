import './vessel.css'
import { sfx } from '../../audio'
import { el } from '../../engine/stage'
import type { Game } from '../../types'
import { closeX, openMoment } from './kit'
import { cu } from '../../sound/closeup'

/**
 * The Vessel, Hudson Yards: a place you look FROM, not a mountain. You start on a landing with the honeycomb all
 * around you. Spots in the picture take you somewhere (the Hudson side, the Midtown side, the middle to look up);
 * at each spot the things worth seeing are rings you click for one true line. Leave with the x or Escape, any time.
 *
 * Every spot is one painting you stand at (no faked walking: changing spots is a short dissolve that leans the way
 * you went). Stamp 'vessel-top' once you've seen both sides.
 *
 * True details: 154 flights, almost 2,500 steps, 80 landings, 16 stories; Heatherwick Studio; opened 2019.
 * The quilted building next to it is The Shed (2019). The rail yard under Hudson Yards still stores LIRR trains.
 */
const ART = '/art/closeups/'

type Spot = 'landing' | 'west' | 'east' | 'up'
type P = [number, number]

interface Go { to: Spot; at: P; name: string; dir: 'l' | 'r' | 'u' | 'd' }
interface Sight { at: P; name: string; line: string }

const SPOTS: Record<Spot, { art: string; where: string; go: Go[]; see: Sight[] }> = {
  landing: {
    art: 'vessel-mid.jpg',
    where: 'A Landing',
    go: [
      { to: 'west', at: [70, 300], name: 'Hudson Side', dir: 'l' },
      { to: 'east', at: [930, 300], name: 'Midtown Side', dir: 'r' },
      { to: 'up', at: [500, 70], name: 'Look Up', dir: 'u' },
    ],
    see: [
      { at: [535, 160], name: 'Sunset', line: '154 flights, 80 landings, one sunset.' },
      { at: [165, 190], name: 'The Shed', line: 'The Shed: its whole outer shell rolls out on wheels.' },
    ],
  },
  west: {
    art: 'vessel-west.jpg',
    where: 'Hudson Side',
    go: [
      { to: 'landing', at: [80, 470], name: 'Back Inside', dir: 'd' },
      { to: 'east', at: [930, 470], name: 'Midtown Side', dir: 'r' },
    ],
    see: [
      { at: [680, 270], name: 'The Hudson', line: 'That’s New Jersey across the water. It’s fine.' },
      { at: [235, 345], name: 'Rail Yard', line: 'Hudson Yards is built on a deck over a working rail yard.' },
      { at: [470, 330], name: 'The High Line', line: 'The High Line ends right here, at 34th Street.' },
      { at: [790, 220], name: 'Ferry', line: 'A ferry heading downtown. No traffic out there.' },
    ],
  },
  east: {
    art: 'vessel-east.jpg',
    where: 'Midtown Side',
    go: [
      { to: 'west', at: [70, 470], name: 'Hudson Side', dir: 'l' },
      { to: 'landing', at: [920, 470], name: 'Back Inside', dir: 'd' },
    ],
    see: [
      { at: [530, 110], name: 'Empire State', line: 'The Empire State, dead ahead. You can see it from everywhere. That’s the point.' },
      { at: [560, 235], name: 'Water Towers', line: 'Wooden water towers. Thousands still on the roofs.' },
      { at: [95, 235], name: 'The Shed', line: 'The Shed: its whole outer shell rolls out on wheels.' },
    ],
  },
  up: {
    art: 'vessel-up.jpg',
    where: 'Looking Up',
    go: [{ to: 'landing', at: [500, 490], name: 'Back Down', dir: 'd' }],
    see: [{ at: [500, 240], name: 'Sixteen Stories', line: 'Almost 2,500 steps. The elevator is right there.' }],
  },
}

const ARROW: Record<Go['dir'], string> = { l: 'M14 5 L7 12 L14 19', r: 'M10 5 L17 12 L10 19', u: 'M5 14 L12 7 L19 14', d: 'M5 10 L12 17 L19 10' }

/** feet on a metal stair, a few steps */
function steps() {
  for (let i = 0; i < 4; i++) setTimeout(() => sfx.tick(), i * 170)
}

export function climbTheVessel(g: Game) {
  const m = openMoment('cu vsl')
  const x = closeX(m)
  x.classList.add('cu-x')
  const where = el('div', 'vsl-where', '<b>The Vessel</b><span></span>')
  const line = el('p', 'vsl-line')
  line.setAttribute('aria-live', 'polite')
  m.root.append(where, line, x)
  const seen = new Set<Spot>()
  let layer: HTMLElement | null = null
  let busy = false

  const show = (s: Spot, dir?: Go['dir']) => {
    const def = SPOTS[s]
    const next = el('div', 'cu-layer vsl-spot' + (dir ? ` in-${dir}` : ''), `<img class="cu-art" src="${ART + def.art}" alt="" draggable="false">`)
    for (const go of def.go) {
      const b = el('button', `vsl-go ${go.dir}`, `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ARROW[go.dir]}" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span>${go.name}</span>`) as HTMLButtonElement
      b.type = 'button'
      b.style.left = `${go.at[0]}px`
      b.style.top = `${go.at[1]}px`
      b.onclick = () => move(go)
      next.append(b)
    }
    for (const sight of def.see) {
      const b = el('button', 'cu-pin vsl-see', `<i></i><span>${sight.name}</span>`) as HTMLButtonElement
      b.type = 'button'
      b.style.left = `${sight.at[0]}px`
      b.style.top = `${sight.at[1]}px`
      b.onclick = () => {
        sfx.click()
        b.classList.add('seen')
        line.textContent = sight.line
        line.classList.remove('on')
        void line.offsetWidth
        line.classList.add('on')
      }
      next.append(b)
    }
    m.root.insertBefore(next, where)
    const old = layer
    if (old && dir) {
      old.classList.add(`out-${dir}`)
      m.later(() => old.remove(), 700)
    }
    layer = next
    where.querySelector('span')!.textContent = def.where
    line.classList.remove('on')
    seen.add(s)
    if (s === 'west' || s === 'east') m.later(() => cu.wind(), 400)
    if (seen.has('west') && seen.has('east')) g.stamp('vessel-top')
  }

  const move = (go: Go) => {
    if (busy) return
    busy = true
    sfx.click()
    steps()
    show(go.to, go.dir)
    m.later(() => (busy = false), 650)
  }

  show('landing')
}
