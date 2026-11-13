import './departures.css'
import { sfx } from '../../audio'
import { el } from '../../engine/stage'
import type { Game } from '../../types'
import { closeUp } from './closeup'
import { hash } from './kit'
import { cu } from '../../sound/closeup'

/**
 * Grand Central's departures board, up close and working: the next subway trains out of Grand Central–42 St to
 * places in the city, in New York time, with their track and status. The lines, their colours and the stops are real;
 * the times come from a fixed pattern on the wall clock, so everyone reads the same board. Click a train and its
 * route unrolls on the brass ledge under the board.
 */
interface Service { dest: string; line: '4' | '5' | '6' | '7'; every: number; at: number; stops: string[] }
/** the subway's own line colours (Lexington Avenue green, Flushing purple) */
const COLOR = { '4': '#00933c', '5': '#00933c', '6': '#00933c', '7': '#b933ad' }
/** trains out of Grand Central–42 St to the stations on the subway map its lines reach (the 4, 5, 6 and 7, as the
 *  map draws them), ending at the map's own station name, with the real stops on the way */
const SERVICES: Service[] = [
  { dest: 'The Met', line: '4', every: 8, at: 3, stops: ['59 St', '86 St'] },
  { dest: 'The Met', line: '6', every: 10, at: 7, stops: ['51 St', '59 St', '68 St', '77 St', '86 St'] },
  { dest: 'Wall Street', line: '4', every: 6, at: 1, stops: ['14 St–Union Sq', 'Brooklyn Bridge–City Hall', 'Fulton St', 'Wall St'] },
  { dest: 'Brooklyn Bridge', line: '5', every: 10, at: 4, stops: ['14 St–Union Sq', 'Brooklyn Bridge–City Hall'] },
  { dest: 'SoHo', line: '6', every: 8, at: 2, stops: ['33 St', '28 St', '23 St', '14 St–Union Sq', 'Astor Pl', 'Bleecker St', 'Prince St'] },
  { dest: 'Chinatown', line: '6', every: 10, at: 6, stops: ['33 St', '28 St', '23 St', '14 St–Union Sq', 'Astor Pl', 'Bleecker St', 'Canal St'] },
  { dest: 'Times Square', line: '7', every: 5, at: 0, stops: ['5 Av', 'Times Sq–42 St'] },
  { dest: 'Hudson Yards', line: '7', every: 10, at: 8, stops: ['5 Av', 'Times Sq–42 St', '34 St–Hudson Yards'] },
]
const ROWS = 7

/** the Lexington Av platforms: local 6 on the outside tracks (1 downtown, 4 uptown), the 4/5 express in the middle
 *  (2 downtown, 3 uptown); the 7 has its own platform deep under 42nd St */
const UPTOWN = new Set(['The Met'])
const trackFor = (svc: Service) => (svc.line === '7' ? 7 : svc.line === '6' ? (UPTOWN.has(svc.dest) ? 4 : 1) : UPTOWN.has(svc.dest) ? 3 : 2)
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
      out.push({ svc, min: m, track: trackFor(svc), late: h % 11 === 0 ? 2 + (h >>> 8) % 4 : 0 })
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
    route.innerHTML = `<b class="dp-track"><small>Track</small>${t.track}</b><div class="dp-stops"><i></i>${['Grand Central–42 St', ...t.svc.stops].map((s, i, a) => `<span class="${i === 0 || i === a.length - 1 ? 'end' : ''}"><em></em>${s}</span>`).join('')}</div>`
  }

  const render = (flip: boolean) => {
    const [now] = nyNow()
    shown = now
    if (flip) cu.flap()
    const trains = nextTrains(now)
    board.innerHTML = `<div class="dp-head"><span>Time</span><span>Destination</span><span>Track</span><span>Status</span></div>` + trains.map((t) => {
      const key = t.svc.dest + t.min
      const left = t.min - now
      const status = t.late ? `<i class="late">Late ${t.late} min</i>` : left <= 0 ? '<i class="go">Boarding</i>' : '<i>On time</i>'
      return `<button class="dp-row${key === picked ? ' on' : ''}${flip ? ' flip' : ''}" type="button" data-k="${key}" style="--line:${COLOR[t.svc.line]}"><span>${clock(t.min)}</span><span><em>${t.svc.line}</em>${t.svc.dest}</span><span>${t.track}</span><span>${status}</span></button>`
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
