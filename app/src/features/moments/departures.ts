import './departures.css'
import { sfx } from '../../audio'
import { el } from '../../engine/stage'
import type { Game } from '../../types'
import { closeUp } from './closeup'
import { hash } from './kit'
import { cu } from '../../sound/closeup'

/**
 * Grand Central's departures board, up close and working: the next trains out, in New York time, with their track
 * and status, on the painted board. The lines, their colours and the stops are the real ones that leave from here;
 * the times come from a fixed pattern on the wall clock, so everyone reads the same board. Click a train and its
 * route unrolls on the brass ledge under the board.
 */
interface Service { dest: string; line: 'Hudson' | 'Harlem' | 'New Haven'; every: number; at: number; stops: string[] }
const COLOR = { Hudson: '#009b3a', Harlem: '#0039a6', 'New Haven': '#ee0034' }
const SERVICES: Service[] = [
  { dest: 'Poughkeepsie', line: 'Hudson', every: 60, at: 43, stops: ['Harlem-125 St', 'Yonkers', 'Tarrytown', 'Croton-Harmon', 'Peekskill', 'Cold Spring', 'Beacon', 'Poughkeepsie'] },
  { dest: 'Croton-Harmon', line: 'Hudson', every: 30, at: 20, stops: ['Harlem-125 St', 'Yonkers', 'Dobbs Ferry', 'Tarrytown', 'Ossining', 'Croton-Harmon'] },
  { dest: 'North White Plains', line: 'Harlem', every: 30, at: 7, stops: ['Harlem-125 St', 'Fordham', 'Bronxville', 'Scarsdale', 'White Plains', 'North White Plains'] },
  { dest: 'Southeast', line: 'Harlem', every: 60, at: 48, stops: ['Harlem-125 St', 'White Plains', 'Chappaqua', 'Mount Kisco', 'Katonah', 'Brewster', 'Southeast'] },
  { dest: 'Stamford', line: 'New Haven', every: 30, at: 4, stops: ['Harlem-125 St', 'New Rochelle', 'Larchmont', 'Rye', 'Greenwich', 'Stamford'] },
  { dest: 'New Haven', line: 'New Haven', every: 60, at: 34, stops: ['Harlem-125 St', 'Stamford', 'South Norwalk', 'Bridgeport', 'Milford', 'New Haven'] },
  { dest: 'New Canaan', line: 'New Haven', every: 60, at: 13, stops: ['Harlem-125 St', 'Stamford', 'Springdale', 'Talmadge Hill', 'New Canaan'] },
]
const ROWS = 7

interface Train { svc: Service; min: number; track: number; late: number }

/** minutes since midnight in New York, and the seconds */
function nyNow(): [number, number] {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: false }).formatToParts(new Date())
  const n = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0)
  return [(n('hour') % 24) * 60 + n('minute'), n('second')]
}
const clock = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

function nextTrains(now: number): Train[] {
  const out: Train[] = []
  for (const svc of SERVICES) {
    let m = now - (((now - svc.at) % svc.every) + svc.every) % svc.every
    if (m < now) m += svc.every
    for (let i = 0; i < 3; i++, m += svc.every) {
      const h = hash(svc.dest + (m % 1440))
      // upper level tracks 11 to 42, lower level 101 to 117
      out.push({ svc, min: m, track: h % 5 === 0 ? 101 + (h >>> 4) % 17 : 11 + (h >>> 4) % 32, late: h % 11 === 0 ? 4 + (h >>> 8) % 5 : 0 })
    }
  }
  return out.sort((a, b) => a.min - b.min).slice(0, ROWS)
}

export function departuresBoard(_g: Game) {
  const c = closeUp('cu-departures', '/art/closeups/departures.jpg')
  const board = el('div', 'dp-board')
  const route = el('div', 'dp-route')
  c.layer.append(board, route)
  let picked = ''
  let shown = -1

  const showRoute = (t: Train | null) => {
    if (!t) return (route.innerHTML = '')
    const col = COLOR[t.svc.line]
    route.style.setProperty('--line', col)
    route.innerHTML = `<b class="dp-track"><small>Track</small>${t.track}</b><div class="dp-stops"><i></i>${['Grand Central', ...t.svc.stops].map((s, i, a) => `<span class="${i === 0 || i === a.length - 1 ? 'end' : ''}"><em></em>${s}</span>`).join('')}</div>`
  }

  const render = (flip: boolean) => {
    const [now] = nyNow()
    shown = now
    if (flip) cu.flap()
    const trains = nextTrains(now)
    board.innerHTML = `<div class="dp-head"><span>Time</span><span>Destination</span><span>Track</span><span>Status</span></div>` + trains.map((t) => {
      const key = t.svc.dest + t.min
      const left = t.min - now
      const status = t.late ? `<i class="late">Late ${t.late} min</i>` : left <= 2 ? '<i class="go">Boarding</i>' : '<i>On time</i>'
      return `<button class="dp-row${key === picked ? ' on' : ''}${flip ? ' flip' : ''}" type="button" data-k="${key}" style="--line:${COLOR[t.svc.line]}"><span>${clock(t.min)}</span><span><em></em>${t.svc.dest}</span><span>${t.track}</span><span>${status}</span></button>`
    }).join('')
    board.querySelectorAll<HTMLButtonElement>('.dp-row').forEach((b, i) => {
      b.style.animationDelay = `${i * 45}ms`
      b.onclick = () => {
        sfx.click()
        picked = picked === b.dataset.k ? '' : b.dataset.k!
        board.querySelectorAll('.dp-row').forEach((r) => r.classList.toggle('on', (r as HTMLElement).dataset.k === picked))
        showRoute(picked ? trains[i] : null)
      }
    })
    const still = trains.find((t) => t.svc.dest + t.min === picked)
    if (!still) picked = ''
    showRoute(still ?? null)
  }
  render(true)
  let acc = 0
  c.m.frame((dt) => {
    acc += dt
    if (acc < 1) return
    acc = 0
    if (nyNow()[0] !== shown) render(true)
  })
}
