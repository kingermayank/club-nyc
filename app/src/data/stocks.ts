/**
 * iFruit Stocks: the city's own companies (the Exchange's IPO list, data/ipos.ts) trading in coins.
 *
 * Every price is a pure function of (seed, company, 15-minute tick), so everybody sees the same market and nothing
 * needs storing. It wanders around the company's offer price and always comes back (a moving average of noise: no
 * crash to zero, no rocket to the moon). Online the server holds the seed (secret, so tomorrow can't be computed
 * from this file); offline the game uses a local one.
 *
 * Shared by the game (offline, and drawing) and the server (online, the only price a trade settles at).
 */
import { IPOS, ipoFor, type Ipo } from './ipos'

export const TICK_MS = 15 * 60_000
/** trading rules (server-enforced online) */
export const STOCK_RULES = { fee: 1, tradesPerDay: 30, maxInvested: 600, maxShares: 500 } as const

export const tickOf = (t = Date.now()) => Math.floor(t / TICK_MS)
const DAY_TICKS = 96

/** a stable 32-bit hash */
function h32(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 12
  return h >>> 0
}
/** a standard normal from (seed, sym, kind, k) */
function noise(seed: string, sym: string, kind: string, k: number): number {
  const a = (h32(`${seed}|${sym}|${kind}|${k}`) + 1) / 4294967297
  const b = (h32(`${k}|${kind}|${sym}|${seed}`) + 1) / 4294967297
  return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b)
}

const W_TICK = Array.from({ length: 64 }, (_, k) => 0.016 * 0.95 ** k)
const W_DAY = Array.from({ length: 10 }, (_, k) => 0.03 * 0.85 ** k)
/** how lively a company is: small caps (cheap shares) swing more */
const vol = (ipo: Ipo) => (ipo.price < 5 ? 1.5 : ipo.price < 20 ? 1.15 : ipo.price > 60 ? 0.75 : 1)

/** the company ringing the bell on the NYC day that holds this tick */
const listedOn = (tick: number) => ipoFor(0, new Date(tick * TICK_MS))

/** price at a tick, in coins (2 decimals) */
export function priceAt(seed: string, ipo: Ipo, tick: number): number {
  let x = 0
  for (let k = 0; k < W_TICK.length; k++) x += W_TICK[k] * noise(seed, ipo.sym, 't', tick - k)
  const day = Math.floor(tick / DAY_TICKS)
  let y = 0
  for (let k = 0; k < W_DAY.length; k++) y += W_DAY[k] * noise(seed, ipo.sym, 'd', day - k)
  let p = ipo.price * Math.exp((x + y) * vol(ipo))
  // the day it rings the bell, it pops (its day-one pop from the IPO list)
  if (listedOn(tick).sym === ipo.sym) p *= 1 + ipo.pop / 100
  return Math.max(0.05, Math.round(p * 100) / 100)
}

export interface Quote {
  sym: string
  price: number
  /** price 24 h ago */
  prev: number
  /** last 24 h, one point per hour (25 points, oldest first) */
  day: number[]
  /** last 7 days, one point every 4 hours (43 points) */
  week: number[]
  listed: boolean
}

export function quoteOf(seed: string, ipo: Ipo, now = Date.now()): Quote {
  const t = tickOf(now)
  const day = Array.from({ length: 25 }, (_, i) => priceAt(seed, ipo, t - (24 - i) * 4))
  const week = Array.from({ length: 43 }, (_, i) => priceAt(seed, ipo, t - (42 - i) * 16))
  return { sym: ipo.sym, price: day[24], prev: day[0], day, week, listed: listedOn(t).sym === ipo.sym }
}

export const market = (seed: string, now = Date.now()): Quote[] => IPOS.map((i) => quoteOf(seed, i, now))
export const ipoBySym = (sym: string) => IPOS.find((i) => i.sym === sym)

/** what a trade costs (buy) or pays (sell), in whole coins, before the fee */
export const tradeValue = (price: number, shares: number) => Math.max(1, Math.round(price * shares))
