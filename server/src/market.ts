import { Hono } from 'hono'

/**
 * Real market data for the Exchange floor (app/src/features/exchange.ts): the IPO calendar (Nasdaq's public calendar)
 * and delayed quotes (Yahoo's chart endpoint). Neither needs a key. Everything is cached here so players never hit
 * those services directly, and a failure just means the game falls back to its own made-up listings.
 *
 * GET /api/market/exchange -> { listing, next, tape, asOf }
 */
export const market = new Hono()

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; ClubNYC/1.0)', Accept: 'application/json' }
const NYC_PEOPLE = 8_300_000
const SLICE = 3.5

interface Quote { sym: string; name: string; price: number; prev: number; series: number[] }
interface Listing {
  sym: string
  name: string
  exchange: string
  offer: number
  date: string
  shares: number
  raised: number
  quote: Quote | null
  facts: string[]
}

const cache = new Map<string, { at: number; v: unknown }>()
async function cached<T>(key: string, ms: number, f: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < ms) return hit.v as T
  try {
    const v = await f()
    cache.set(key, { at: Date.now(), v })
    return v
  } catch (e) {
    // serve the last good answer rather than nothing
    if (hit) return hit.v as T
    throw e
  }
}

async function getJson(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(6000) })
  if (!r.ok) throw new Error(`${r.status} ${url}`)
  return r.json()
}

const num = (s: unknown) => Number(String(s ?? '').replace(/[$,]/g, '')) || 0
const nyDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
/** "11/02/2026" -> "2026-11-02" */
const iso = (mdy: string) => {
  const [m, d, y] = mdy.split('/')
  return `${y}-${m}-${d}`
}
/** company names come in shouting ("ANTHROPIC, PBC"): calm them down */
const tidy = (n: string) =>
  n !== n.toUpperCase() ? n : n.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase()).replace(/\b(Pbc|Llc|Plc|Ai|Usa)\b/g, (w) => w.toUpperCase())

interface CalRow { proposedTickerSymbol?: string; companyName?: string; proposedExchange?: string; proposedSharePrice?: string; sharesOffered?: string; pricedDate?: string; expectedPriceDate?: string; dollarValueOfSharesOffered?: string }
interface Cal { data?: { priced?: { rows?: CalRow[] | null }; upcoming?: { upcomingTable?: { rows?: CalRow[] | null } } } }

/** this month's and last month's calendar: priced deals and what's coming */
async function calendar() {
  return cached('cal', 60 * 60_000, async () => {
    const now = new Date()
    const months = [0, 1].map((k) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 15))
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
    })
    const cals = await Promise.all(months.map((m) => getJson(`https://api.nasdaq.com/api/ipo/calendar?date=${m}`) as Promise<Cal>))
    const priced = cals.flatMap((c) => c.data?.priced?.rows ?? []).filter((r) => r.proposedTickerSymbol && r.pricedDate)
    const upcoming = cals[0].data?.upcoming?.upcomingTable?.rows ?? []
    return { priced, upcoming }
  })
}

async function quote(sym: string, name = sym): Promise<Quote | null> {
  return cached(`q:${sym}`, 10 * 60_000, async () => {
    const j = (await getJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=1d&interval=15m`)) as {
      chart?: { result?: { meta?: { regularMarketPrice?: number; chartPreviousClose?: number; shortName?: string; longName?: string }; indicators?: { quote?: { close?: (number | null)[] }[] } }[] }
    }
    const r = j.chart?.result?.[0]
    const price = r?.meta?.regularMarketPrice
    if (!r || !price) return null
    const series = (r.indicators?.quote?.[0]?.close ?? []).filter((v): v is number => typeof v === 'number')
    return { sym, name: name || r.meta?.shortName || sym, price, prev: r.meta?.chartPreviousClose ?? price, series }
  }).catch(() => null)
}

/** the floor's tape: big names with a New York connection */
const TAPE: [string, string][] = [
  ['SHAK', 'Shake Shack'], ['NYT', 'New York Times'], ['RL', 'Ralph Lauren'], ['NKE', 'Nike'], ['MSGS', 'MSG Sports'],
  ['KO', 'Coca-Cola'], ['JPM', 'JPMorgan'], ['GS', 'Goldman Sachs'], ['DIS', 'Disney'], ['ETSY', 'Etsy'],
]

/** a few true numbers about a deal, said the way a New Yorker would */
function facts(l: Omit<Listing, 'facts' | 'quote'>, q: Quote | null): string[] {
  const out: string[] = []
  if (l.raised) out.push(`Raised $${(l.raised / 1e6 >= 1000 ? (l.raised / 1e9).toFixed(1) + ' billion' : Math.round(l.raised / 1e6) + ' million')}. That’s ${Math.round(l.raised / SLICE / 1e6).toLocaleString('en-US')} million slices of pizza.`)
  if (l.shares) {
    const per = l.shares / NYC_PEOPLE
    out.push(per >= 1 ? `${l.shares.toLocaleString('en-US')} shares. About ${per.toFixed(per < 10 ? 1 : 0)} for every New Yorker.` : `${l.shares.toLocaleString('en-US')} shares. Not enough for everyone on the 6 train.`)
  }
  if (q && l.offer) {
    const pct = ((q.price - l.offer) / l.offer) * 100
    out.push(pct >= 0 ? `Up ${pct.toFixed(1)}% since it priced at $${l.offer.toFixed(2)}.` : `Down ${Math.abs(pct).toFixed(1)}% since it priced. Welcome to New York.`)
  }
  return out
}

market.get('/exchange', async (c) => {
  try {
    const { priced, upcoming } = await calendar()
    const today = nyDate()
    const rows = priced
      .map((r) => ({ r, date: iso(r.pricedDate!) }))
      .filter((x) => x.date <= today)
      // operating companies only: blank-check SPACs (always $10 units) and deals with no price make dull bells
      .filter((x) => num(x.r.proposedSharePrice) > 0 && !/acquisition/i.test(x.r.companyName ?? ''))
      .sort((a, b) => b.date.localeCompare(a.date))
    if (!rows.length) return c.json({ listing: null })
    // a deal that priced today rings today; otherwise the floor walks through the month's class, a new one every day
    const dayIdx = Math.floor(Date.parse(today) / 86_400_000)
    const pick = rows[0].date === today ? rows[0] : rows[dayIdx % Math.min(rows.length, 30)]
    const r = pick.r
    const base = {
      sym: r.proposedTickerSymbol!,
      name: tidy(r.companyName ?? r.proposedTickerSymbol!),
      exchange: (r.proposedExchange ?? '').replace(/ (Global Select|Global|Capital)$/, ''),
      offer: num(r.proposedSharePrice),
      date: pick.date,
      shares: num(r.sharesOffered),
      raised: num(r.dollarValueOfSharesOffered),
    }
    const [q, tape] = await Promise.all([quote(base.sym, base.name), Promise.all(TAPE.map(([s, n]) => quote(s, n)))])
    const listing: Listing = { ...base, quote: q, facts: facts(base, q) }
    const recent = await Promise.all(rows.filter((x) => x !== pick).slice(0, 5).map(async (x) => ({ sym: x.r.proposedTickerSymbol!, offer: num(x.r.proposedSharePrice), quote: await quote(x.r.proposedTickerSymbol!) })))
    const big = [...upcoming].sort((a, b) => num(b.dollarValueOfSharesOffered) - num(a.dollarValueOfSharesOffered))[0]
    const next = big ? { sym: big.proposedTickerSymbol, name: tidy(big.companyName ?? ''), date: big.expectedPriceDate ? iso(big.expectedPriceDate) : null, range: big.proposedSharePrice ?? '' } : null
    c.header('Cache-Control', 'public, max-age=300')
    return c.json({ listing, recent, next, tape: tape.filter(Boolean), asOf: new Date().toISOString() })
  } catch {
    return c.json({ listing: null })
  }
})
