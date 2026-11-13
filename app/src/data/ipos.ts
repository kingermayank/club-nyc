/**
 * The Exchange's IPO calendar: one New York company goes public every day (the same one for everybody, turning over
 * at midnight New York time). Invented companies, never real ones: these are the city's own businesses finally
 * ringing the bell. Prices are in Club NYC coins, like the Big Board outside.
 */
export interface Ipo {
  sym: string
  name: string
  /** an emblem from art/icons/e and the coin it sits on */
  icon: string
  /** or the company's own app-icon logo (art/logos/<sym>.png): the city's tech class */
  logo?: string
  color: string
  /** the offer price */
  price: number
  /** how much it pops on day one, percent */
  pop: number
  /** what you say once it's trading */
  line: string
  /** real listings (from the server): the price now, today's prices, and a few true numbers about the deal */
  live?: { now: number; series: number[]; facts: string[] }
}

export const IPOS: Ipo[] = [
  { sym: 'MEOW', name: 'Bodega Cat Holdings', icon: 'cat', color: '#f2a541', price: 24, pop: 41, line: 'The cat is not for sale. Everything else in the bodega is.' },
  { sym: 'SAUCE', name: 'Halal Cart Ventures', icon: 'gyro', color: '#e5483b', price: 31, pop: 27, line: 'White sauce, red sauce, public offering.' },
  { sym: 'COO', name: 'Pigeon Logistics', icon: 'pigeon', color: '#7d8ba6', price: 12, pop: 66, line: 'Last-mile delivery. Mostly crumbs.' },
  { sym: 'SCHMR', name: 'Everything Bagel Co.', icon: 'bagel', color: '#d9a35b', price: 28, pop: 19, line: 'Toasted is a valuation, not a preference.' },
  { sym: 'SLICE', name: 'Dollar Slice Capital', icon: 'pizza', color: '#e0703a', price: 1.5, pop: 88, line: 'It used to be a dollar. So is everything.' },
  { sym: 'HAIL', name: 'Yellow Cab Futures', icon: 'taxi', color: '#f2c200', price: 36, pop: 12, line: 'The off-duty light is on. Permanently.' },
  { sym: 'STOOP', name: 'Stoop Sale Partners', icon: 'box', color: '#b5835a', price: 9, pop: 54, line: 'Free couch. Slightly haunted. Strong buy.' },
  { sym: 'DING', name: 'Bike Lane Robotics', icon: 'bicycle', color: '#2fa98c', price: 22, pop: 33, line: 'Your dumplings, at 31 miles an hour, on the sidewalk.' },
  { sym: 'SHOW', name: 'Subway Showtime', icon: 'dancer', color: '#e0559a', price: 18, pop: 47, line: 'What time is it? Showtime. Hold the pole.' },
  { sym: 'RUSH', name: 'Broadway Rush Tickets', icon: 'theater-masks', color: '#c0392b', price: 40, pop: 22, line: 'Standing room only. The investors are standing too.' },
  { sym: 'KNOT', name: 'Pretzel Partners', icon: 'pretzel', color: '#a0622d', price: 14, pop: 38, line: 'Twisted fundamentals. Salty margins.' },
  { sym: 'SQFT', name: 'Studio Apartment Holdings', icon: 'key', color: '#5b6cd9', price: 45, pop: 15, line: 'Now with 40% more closet. The closet is the kitchen.' },
  { sym: 'DUMP', name: 'Chinatown Dumpling Group', icon: 'dumpling', color: '#d94f3b', price: 16, pop: 52, line: 'Eight for five dollars. The stock is the expensive part.' },
  { sym: 'BOBA', name: 'Tapioca Industries', icon: 'boba', color: '#8e5bd9', price: 11, pop: 61, line: 'Fifty percent sugar. One hundred percent public.' },
  { sym: 'FERRY', name: 'Staten Island Ferry Co.', icon: 'ferry', color: '#f28c28', price: 0.5, pop: 120, line: 'The ride is still free. The stock is not.' },
  { sym: 'CROSS', name: 'Cronut Labs', icon: 'croissant', color: '#d9a03b', price: 33, pop: 29, line: 'Half croissant, half donut, fully oversubscribed.' },
  // the city's tech class: original companies with their own app-icon logos (art/logos), never real ones
  { sym: 'PGN', name: 'Pigeon AI', icon: '', logo: '/art/logos/pgn.png', color: '#3c4a7a', price: 44, pop: 58, line: 'A large language model trained entirely on crumbs.' },
  { sym: 'BDGA', name: 'Bodega Labs', icon: '', logo: '/art/logos/bdga.png', color: '#f28c28', price: 27, pop: 41, line: 'The cat is the CEO. The cat does not take meetings.' },
  { sym: 'RING', name: 'OpenBagel', icon: '', logo: '/art/logos/ring.png', color: '#1d2140', price: 38, pop: 33, line: 'Open source. Everything seasoning. Schmear sold separately.' },
  { sym: 'SCHM', name: 'Schmear', icon: '', logo: '/art/logos/schm.png', color: '#2bb3d9', price: 19, pop: 47, line: 'Spreads to every device. Mostly sideways.' },
  { sym: 'STOP', name: 'Stoop', icon: '', logo: '/art/logos/stop.png', color: '#c0452f', price: 12, pop: 64, line: 'The social network that is just sitting outside.' },
  { sym: 'HDSN', name: 'Hudson Compute', icon: '', logo: '/art/logos/hdsn.png', color: '#1f3a6e', price: 72, pop: 18, line: 'Water-cooled by the actual Hudson. Do not ask.' },
  { sym: 'RATS', name: 'Rat Race Robotics', icon: '', logo: '/art/logos/rats.png', color: '#7a3fd0', price: 23, pop: 52, line: 'Robots that commute so you don’t have to. They’re also late.' },
  { sym: 'CRNT', name: 'Cronut Cloud', icon: '', logo: '/art/logos/crnt.png', color: '#e0559a', price: 31, pop: 29, line: 'Half cloud, half pastry, a line around the block.' },
  { sym: 'HLAL', name: 'Halal Data', icon: '', logo: '/art/logos/hlal.png', color: '#1e9a5a', price: 26, pop: 36, line: 'Every chart comes with white sauce. Extra if you ask nicely.' },
  { sym: 'FIND', name: 'Skyline Search', icon: '', logo: '/art/logos/find.png', color: '#2f6fe0', price: 55, pop: 21, line: 'Finds you an apartment. Not one you can afford.' },
  { sym: 'YCAB', name: 'Yellowcab Autonomous', icon: '', logo: '/art/logos/ycab.png', color: '#f2c200', price: 34, pop: -12, line: 'Self-driving. Still honks.' },
  { sym: 'BORO', name: 'Five Boroughs', icon: '', logo: '/art/logos/boro.png', color: '#5b6cd9', price: 20, pop: 44, line: 'One app for all five. Staten Island loads last.' },
  { sym: 'BRWN', name: 'Brownstone Bank', icon: '', logo: '/art/logos/brwn.png', color: '#8a5a3b', price: 48, pop: 9, line: 'Your savings, behind a very nice stoop.' },
  { sym: 'GRID', name: 'Gridlock', icon: '', logo: '/art/logos/grid.png', color: '#232c3a', price: 17, pop: -8, line: 'Real-time traffic. It is always red.' },
  { sym: 'LOX', name: 'Lox Labs', icon: '', logo: '/art/logos/lox.png', color: '#f08a6c', price: 29, pop: 38, line: 'Smoked data, sliced thin, on a bagel.' },
  { sym: 'PZRT', name: 'Pizza Rat Ventures', icon: '', logo: '/art/logos/pzrt.png', color: '#e5483b', price: 8, pop: 91, line: 'Carried a whole slice down the subway stairs. A whole one.' },
  { sym: 'MTRO', name: 'Metro Mind', icon: '', logo: '/art/logos/mtro.png', color: '#2c3550', price: 41, pop: 26, line: 'An AI that knows when the train is coming. It’s guessing too.' },
  { sym: 'LBTY', name: 'Liberty Models', icon: '', logo: '/art/logos/lbty.png', color: '#2f9e8f', price: 63, pop: 31, line: 'Give us your tired, your poor, your GPU credits.' },
  { sym: 'EMPR', name: 'Empire Tensor', icon: '', logo: '/art/logos/empr.png', color: '#d8a02f', price: 102, pop: 24, line: '102 layers. The view from the top is incredible.' },
  { sym: 'FOLD', name: 'Fold', icon: '', logo: '/art/logos/fold.png', color: '#e8792b', price: 14, pop: 57, line: 'The only correct way to eat it, now on the Exchange.' },
  { sym: 'VENT', name: 'Steam Vent Energy', icon: '', logo: '/art/logos/vent.png', color: '#8d96a6', price: 21, pop: 15, line: 'Free heat from the sidewalk. Nobody knows where it comes from.' },
  { sym: 'CHOP', name: 'Chopped Cheese Capital', icon: '', logo: '/art/logos/chop.png', color: '#e0a520', price: 5, pop: 73, line: 'Uptown’s favourite sandwich goes public. Still five dollars.' },
  { sym: 'BRDG', name: 'Bridge Protocol', icon: '', logo: '/art/logos/brdg.png', color: '#4a6aa8', price: 37, pop: 22, line: 'Connects two networks. One of them is Brooklyn.' },
  { sym: 'JAVA', name: 'Deli Coffee AI', icon: '', logo: '/art/logos/java.png', color: '#37b38a', price: 3, pop: 66, line: 'Light and sweet, served in 300 milliseconds.' },
]

/** today in New York as a number (20261112) */
export function nycDay(now = new Date()): number {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  return Number(s.replace(/-/g, ''))
}

/** days since 1 Jan 2026, so the calendar walks through the list without repeating for a while */
const dayIndex = (now = new Date()) => {
  const d = String(nycDay(now))
  return Math.round((Date.UTC(+d.slice(0, 4), +d.slice(4, 6) - 1, +d.slice(6, 8)) - Date.UTC(2026, 0, 1)) / 86_400_000)
}

/** the company ringing the bell on a given day (today by default), and the class of the days before it */
export function ipoFor(daysAgo = 0, now = new Date()): Ipo {
  const n = IPOS.length
  // a fixed shuffle step coprime with the list length: every company once per cycle, never the same order twice in a row
  const i = (((dayIndex(now) - daysAgo) * 7) % n + n) % n
  return IPOS[i]
}

// ---------- the real market (server/src/market.ts): Nasdaq's IPO calendar and delayed quotes ----------
export interface Quote { sym: string; name: string; price: number; prev: number; series: number[] }
export interface LiveMarket {
  listing: { sym: string; name: string; exchange: string; offer: number; date: string; shares: number; raised: number; quote: Quote | null; facts: string[] } | null
  recent?: { sym: string; offer: number; quote: Quote | null }[]
  next?: { sym: string; name: string; date: string | null; range: string } | null
  tape?: Quote[]
}
let live: LiveMarket | null = null
let fetchedAt = 0
let pending: Promise<LiveMarket | null> | null = null
/** fetch the real listing (cached for ten minutes); null offline or when the market feed is down */
export function loadMarket(): Promise<LiveMarket | null> {
  if (live && Date.now() - fetchedAt < 10 * 60_000) return Promise.resolve(live)
  pending ??= fetch('/api/market/exchange', { signal: AbortSignal.timeout(12_000) })
    .then((r) => (r.ok ? (r.json() as Promise<LiveMarket>) : null))
    .then((m) => {
      if (m?.listing) {
        live = m
        fetchedAt = Date.now()
      }
      return live
    })
    .catch(() => live)
    .finally(() => (pending = null))
  return pending
}
export const liveMarket = () => live

/** a steady colour per company, for its badge */
const COLORS = ['#2f6fe0', '#d9774b', '#2fa98c', '#8e5bd9', '#e0559a', '#d8a02f', '#3c4a7a', '#e5483b']
/** who rings the bell: true = the city's own companies (with their logos), false = the real Nasdaq listing of the day */
const CITY_BELL = true
/** today's bell: the real listing when we have it, the city's own invented one when we don't */
export function todaysIpo(): Ipo {
  // the bell is the city's own: one of our companies every day (the real listing rides the floor's tape instead)
  if (CITY_BELL) return ipoFor()
  const l = live?.listing
  if (!l) return ipoFor()
  const now = l.quote?.price ?? l.offer
  let h = 0
  for (const c of l.sym) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return {
    sym: l.sym,
    name: l.name,
    icon: '',
    color: COLORS[h % COLORS.length],
    price: l.offer,
    pop: Math.round(((now - l.offer) / l.offer) * 1000) / 10,
    line: l.facts[0] ?? `${l.name} is trading.`,
    live: { now, series: l.quote?.series ?? [], facts: l.facts },
  }
}

export const fmt = (p: number) => (p >= 1000 ? Math.round(p).toLocaleString('en-US') : p.toFixed(2))
