/**
 * "The City So Far": real totals from the server (GET /api/stats, re-counted once a minute), shown on a departures
 * board whose digits flip into place when you scroll to it.
 *  - New Yorkers who've moved in (everyone who's made one), and the number you'd be.
 *  - Pizzas made at Slice Factory, and this week's top slicer.
 *  - Who's out right now, only once the city is busy (a handful of people reads as "empty").
 * Before launch (LAUNCH_MODE=waitlist) the same board says "Next Stop: Club NYC": the doors open SOON, how many people
 * are in line (GET /api/waitlist/count, only once that's a real crowd) and how many places are waiting.
 * Nothing is made up: small numbers get honest copy ("NEW", "HIRING", "Could be you"), and if the numbers can't be fetched
 * the section stays hidden.
 */
interface Slicer {
  name: string
  best: number
}
interface CityStats {
  newYorkers: number
  pizzas: number
  topSlicer: Slicer | null
  slicerRecord: Slicer | null
  online: number
  places: number
}
interface Card {
  icon: [name: string, w: number, h: number]
  /** what the flaps spell out: a number (with commas) or a short word */
  value: string
  label: string
  /** the small print: a lead-in, and a tail that never breaks across lines */
  sub: [lead: string, tail?: string]
}

/** fewer than this many people online and the "right now" card sits out */
const BUSY = 10

const fmt = (n: number) => n.toLocaleString('en-US')

function cards(s: CityStats): Card[] {
  const out: Card[] = []
  const n = s.newYorkers
  out.push(
    n > 0
      ? { icon: ['liberty', 103, 128], value: fmt(n), label: n === 1 ? 'New Yorker has moved in' : 'New Yorkers have moved in', sub: ['You’d be ', `#${fmt(n + 1)}`] }
      : { icon: ['liberty', 103, 128], value: 'NEW', label: 'The city just opened its doors', sub: ['Be the very first ', 'New Yorker'] },
  )
  const top = s.topSlicer ?? s.slicerRecord
  const who: Card['sub'] = top ? [`${s.topSlicer ? 'Top slicer this week' : 'The record'}: `, `${top.name}, ${fmt(top.best)} in one shift`] : ['This week’s top spot is ', 'up for grabs']
  out.push(
    s.pizzas > 0
      ? { icon: ['pizza', 111, 128], value: fmt(s.pizzas), label: s.pizzas === 1 ? 'pizza made at Slice Factory' : 'pizzas made at Slice Factory', sub: who }
      : { icon: ['pizza', 111, 128], value: 'HIRING', label: 'Slice Factory', sub: ['Nobody’s on the board yet. ', 'Could be you.'] },
  )
  if (s.online >= BUSY)
    out.push({
      icon: ['friends', 128, 90],
      value: fmt(s.online),
      label: 'New Yorkers out right now',
      sub: s.places > 1 ? ['spread across ', `${s.places} places`] : ['all in ', 'the same place'],
    })
  return out
}

/** one column of the board; built with text nodes, since the top slicer's name is a player's own */
function card(c: Card): HTMLElement {
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
    const e = document.createElement(tag)
    if (className) e.className = className
    if (text) e.textContent = text
    return e
  }
  const [icon, w, h] = c.icon
  const img = make('img')
  Object.assign(img, { src: `/art/icons/e/${icon}.png`, alt: '', width: w, height: h, loading: 'lazy' })
  // the flaps are for the eyes; screen readers get the plain number
  const row = make('span', 'flap-row')
  row.setAttribute('aria-hidden', 'true')
  for (const ch of c.value) {
    // commas and the plus in "20+" sit between the flaps instead of flipping
    if (ch === ',' || ch === '+') row.append(make('i', '', ch))
    else {
      const flap = make('b', '', ch)
      flap.dataset.to = ch
      row.append(flap)
    }
  }
  const flaps = make('p', c.value.length > 6 ? 'flaps long' : 'flaps')
  flaps.append(make('span', 'sr', c.value), row)
  const el = make('article', 'stat')
  const sub = make('p', 'stat-sub', c.sub[0])
  if (c.sub[1]) sub.append(make('span', 'keep', c.sub[1]))
  el.append(img, flaps, make('p', 'stat-label', c.label), sub)
  return el
}

/** each flap spins through a few characters, then lands, left to right */
function flip(board: HTMLElement) {
  const flaps = [...board.querySelectorAll<HTMLElement>('.flap-row b')]
  const DIGITS = '0123456789'
  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  flaps.forEach((f, i) => {
    const to = f.dataset.to!
    const pool = /\d/.test(to) ? DIGITS : LETTERS
    let left = 7 + (i % 6) * 2
    const tick = () => {
      f.textContent = left > 0 ? pool[Math.floor(Math.random() * pool.length)] : to
      f.classList.remove('tick')
      void f.offsetWidth // restart the flip animation
      f.classList.add('tick')
      if (left-- > 0) setTimeout(tick, 75)
    }
    tick()
  })
}

/**
 * Before launch: when the doors open, how many people are in line (only once the server says it's a real crowd; it
 * sends null below that) and the places waiting for them. The first and last are facts, not live numbers.
 */
function soonCards(inLine: number | null): Card[] {
  const out: Card[] = [{ icon: ['door', 110, 128], value: 'SOON', label: 'The doors open', sub: ['Everyone on the waitlist ', 'hears first'] }]
  if (inLine) out.push({ icon: ['friends', 128, 90], value: fmt(inLine), label: inLine === 1 ? 'New Yorker in line' : 'New Yorkers in line', sub: ['You’d be ', `#${fmt(inLine + 1)}`] })
  out.push({ icon: ['map', 128, 113], value: '20+', label: 'Places to explore', sub: ['From Liberty Island to ', 'Central Park'] })
  return out
}

export function cityStats(soon = false) {
  const section = document.querySelector<HTMLElement>('.so-far')
  const board = section?.querySelector<HTMLElement>('.board')
  if (!section || !board) return
  const load: Promise<Card[] | null> = soon
    ? fetch('/api/waitlist/count')
        .then((r) => (r.ok ? (r.json() as Promise<{ count: number | null }>) : null))
        .then((r) => (r ? soonCards(typeof r.count === 'number' && r.count > 0 ? r.count : null) : null))
    : fetch('/api/stats')
        .then((r) => (r.ok ? (r.json() as Promise<CityStats>) : null))
        .then((s) => (s && typeof s.newYorkers === 'number' ? cards(s) : null))
  load
    .then((list) => {
      if (!list) return
      board.classList.toggle('two', list.length === 2)
      board.replaceChildren(...list.map(card))
      section.hidden = false
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
      // the flaps start blank and flip in the first time the board comes into view
      for (const f of board.querySelectorAll<HTMLElement>('.flap-row b')) f.textContent = ''
      const seen = new IntersectionObserver(
        (entries) => {
          if (!entries.some((e) => e.isIntersecting)) return
          seen.disconnect()
          flip(board)
        },
        { threshold: 0.4 },
      )
      seen.observe(board)
    })
    .catch(() => {})
}
