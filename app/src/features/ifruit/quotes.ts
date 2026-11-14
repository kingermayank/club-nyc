/**
 * One price list for the whole city: the Stocks app and the Exchange floor (its tape, its big screen) read the same
 * quotes, so a company costs the same on the wall as on your phone. Online the server's (its seed is secret),
 * offline your phone's own market.
 */
import { rest } from '../../net/server'
import { market, type Quote } from '../../data/stocks'
import { ifr, isOnline } from './store'

let cache: { at: number; quotes: Quote[] } | null = null
let pending: Promise<Quote[]> | null = null

export function loadQuotes(maxAgeMs = 60_000): Promise<Quote[]> {
  if (cache && Date.now() - cache.at < maxAgeMs) return Promise.resolve(cache.quotes)
  pending ??= (isOnline() ? rest<{ quotes: Quote[] }>('/phone/stocks').then((r) => r.quotes) : Promise.resolve(market(ifr().seed)))
    .then((quotes) => {
      cache = { at: Date.now(), quotes }
      return quotes
    })
    .catch(() => cache?.quotes ?? market(ifr().seed))
    .finally(() => (pending = null))
  return pending
}
/** what the Stocks app just fetched (so the floor never shows an older price than the phone) */
export const setQuotes = (quotes: Quote[]) => (cache = { at: Date.now(), quotes })
export const quotesNow = () => cache?.quotes ?? null
export const quoteNow = (sym: string) => cache?.quotes.find((q) => q.sym === sym) ?? null
