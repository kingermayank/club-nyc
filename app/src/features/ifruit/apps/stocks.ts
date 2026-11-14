/** Stocks: the city's own companies (the Exchange's IPO list) trading in coins. Prices move every 15 minutes. */
import { el } from '../../../engine/stage'
import { save, persist } from '../../../state'
import { rest } from '../../../net/server'
import { IPOS, type Ipo } from '../../../data/ipos'
import { market, ipoBySym, tradeValue, STOCK_RULES, type Quote } from '../../../data/stocks'
import { nycDay } from '../../../data/economy'
import { screenEl, act, shimmer, empty, sheet, esc } from '../kit'
import { ifr, store, isOnline, recordLocal, emit } from '../store'
import type { Ctx, Screen } from '../phone'
import { setQuotes } from '../quotes'
import { tone } from '../sound'

interface Holding { sym: string; shares: number; cost: number }
interface Data { quotes: Quote[]; holdings: Holding[]; trades: number; coins: number }

async function load(): Promise<Data> {
  if (isOnline()) {
    const d = await rest<Data>('/phone/stocks')
    setQuotes(d.quotes)
    return d
  }
  const s = ifr()
  return {
    quotes: market(s.seed),
    holdings: Object.entries(s.holdings).filter(([, h]) => h.shares > 0).map(([sym, h]) => ({ sym, ...h })),
    trades: s.trades.day === String(nycDay()) ? s.trades.n : 0,
    coins: save.coins,
  }
}

export const logoOf = (i: Ipo) => (i.logo ? `<img class="ifs-logo" src="${i.logo}" alt="">` : `<span class="ifs-logo em" style="background:${i.color}"><img src="/art/icons/e/${i.icon}.png" alt=""></span>`)
const pct = (q: Quote) => ((q.price - q.prev) / q.prev) * 100
const fmt = (n: number) => `$${n < 10 ? n.toFixed(2) : n.toFixed(1)}`
function spark(series: number[], w = 54, h = 22, up = true) {
  const lo = Math.min(...series)
  const hi = Math.max(...series)
  const pts = series.map((v, i) => `${((i / (series.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4)).toFixed(1)}`).join(' ')
  return `<svg class="ifs-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="${up ? '#1e9a5a' : '#e5483b'}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`
}

export function open(ctx: Ctx, arg?: string): Screen {
  const s = screenEl(ctx, 'Stocks', { back: false, big: true })
  const sum = el('div', 'ifs-sum', shimmer(1))
  const tabs = el('div', 'ifp-tabs', '<button class="on" data-t="all">Market</button><button data-t="mine">My Shares</button>')
  const list = el('div', 'ifs-list', shimmer(6))
  s.body.append(sum, tabs, list)
  let tab = 'all'
  let data: Data | null = null
  let prev: Record<string, number> = {}

  const render = () => {
    if (!data) return
    const held = new Map(data.holdings.map((h) => [h.sym, h]))
    const qs = new Map(data.quotes.map((q) => [q.sym, q]))
    const value = data.holdings.reduce((a, h) => a + Math.round((qs.get(h.sym)?.price ?? 0) * h.shares), 0)
    const cost = data.holdings.reduce((a, h) => a + h.cost, 0)
    const gain = value - cost
    sum.innerHTML = `<small>Your shares</small><b><i class="money-d">$</i>${value.toLocaleString('en-US')}</b>${data.holdings.length ? `<span class="${gain >= 0 ? 'up' : 'down'}">${gain >= 0 ? '▲' : '▼'} $${Math.abs(gain)} since you bought</span>` : ''}`
    list.innerHTML = ''
    const listed = data.quotes.find((q) => q.listed)
    const rows = tab === 'mine' ? data.holdings.map((h) => qs.get(h.sym)!).filter(Boolean) : [...(listed ? [listed] : []), ...data.quotes.filter((q) => q !== listed)]
    if (!rows.length) return list.append(empty('/art/ifruit/app/stocks.png', 'No Shares Yet', 'Pick a company in Market.'))
    for (const q of rows) {
      const ipo = ipoBySym(q.sym)!
      const p = pct(q)
      const h = held.get(q.sym)
      const row = el('button', 'ifr-row ifs-row', `${logoOf(ipo)}<span class="ifr-txt"><b>${q.sym}</b><small>${h ? `${h.shares} shares` : esc(ipo.name)}</small>${q.listed ? '<span class="ifr-tag">Listed Today</span>' : ''}</span>${spark(q.day, 40, 22, p >= 0)}<span class="ifs-px"><b>${fmt(q.price)}</b><i class="${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '+' : ''}${p.toFixed(1)}%</i></span>`)
      row.type = 'button'
      if (prev[q.sym] !== undefined && prev[q.sym] !== q.price) row.querySelector('.ifs-px i')!.classList.add('flash')
      row.onclick = () => ctx.push(company(ctx, q.sym, () => data, refresh))
      list.append(row)
    }
    prev = Object.fromEntries(data.quotes.map((q) => [q.sym, q.price]))
  }
  const refresh = async () => {
    try {
      data = await load()
      render()
    } catch {
      list.innerHTML = '<div class="ifr-err">The market feed is down. Try again in a moment.</div>'
    }
    return data
  }
  for (const b of tabs.querySelectorAll<HTMLButtonElement>('button'))
    b.onclick = () => {
      tone('tap')
      tab = b.dataset.t!
      tabs.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b))
      render()
    }
  const timer = window.setInterval(() => void refresh(), 60_000)
  void refresh().then(() => {
    if (arg && ipoBySym(arg)) ctx.push(company(ctx, arg, () => data, refresh))
  })
  return { el: s.el, onShow: () => void refresh(), dispose: () => clearInterval(timer) }
}

function company(ctx: Ctx, sym: string, get: () => Data | null, refresh: () => Promise<Data | null>): Screen {
  const ipo = ipoBySym(sym)!
  const s = screenEl(ctx, sym)
  const top = el('div', 'ifs-top')
  const chart = el('div', 'ifs-chart')
  const range = el('div', 'ifp-tabs sm', '<button class="on" data-r="day">1D</button><button data-r="week">1W</button>')
  const pos = el('div', 'ifs-pos')
  const btns = el('div', 'ifb-btns')
  const line = el('p', 'ifs-line', esc(ipo.line))
  s.body.append(top, chart, range, pos, btns, line)
  let r: 'day' | 'week' = 'day'
  const draw = () => {
    const d = get()
    const q = d?.quotes.find((x) => x.sym === sym)
    if (!d || !q) return
    const p = pct(q)
    top.innerHTML = `${logoOf(ipo)}<span><b>${esc(ipo.name)}</b><span class="ifs-big">${fmt(q.price)}</span><i class="${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(1)}% today</i></span>`
    const series = q[r]
    const W = 220
    const H = 110
    const lo = Math.min(...series)
    const hi = Math.max(...series)
    const pts = series.map((v, i) => [(i / (series.length - 1)) * W, H - 8 - ((v - lo) / (hi - lo || 1)) * (H - 20)])
    const path = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
    const up = series[series.length - 1] >= series[0]
    const col = up ? '#1e9a5a' : '#e5483b'
    chart.innerHTML = `<svg viewBox="0 0 ${W} ${H}" aria-label="${sym} price chart"><defs><linearGradient id="ifs-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".28"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs><path d="M0 ${H} ${path.slice(1).replace(/^/, 'L')} L${W} ${H} Z" fill="url(#ifs-g)"/><path class="ifs-line-path" d="${path}" fill="none" stroke="${col}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" pathLength="1"/><circle cx="${pts[pts.length - 1][0]}" cy="${pts[pts.length - 1][1]}" r="4" fill="${col}" stroke="#fff" stroke-width="2"/></svg><span class="ifs-hi">${fmt(hi)}</span><span class="ifs-lo">${fmt(lo)}</span>`
    const h = d.holdings.find((x) => x.sym === sym)
    const val = h ? Math.round(h.shares * q.price) : 0
    // your row only when you own some
    pos.innerHTML = h ? `<div><small>You own</small><b>${h.shares} shares</b></div><div><small>Worth</small><b>$${val}</b></div><div><small>Gain</small><b class="${val - h.cost >= 0 ? 'up' : 'down'}">${val - h.cost >= 0 ? '+' : '−'}$${Math.abs(val - h.cost)}</b></div>` : ''
    btns.innerHTML = ''
    btns.append(act('Buy', () => trade(ctx, 'buy', sym, get, async () => (await refresh(), draw())), 'green'))
    if (h) btns.append(act('Sell', () => trade(ctx, 'sell', sym, get, async () => (await refresh(), draw())), 'red'))
  }
  for (const b of range.querySelectorAll<HTMLButtonElement>('button'))
    b.onclick = () => {
      tone('tap')
      r = b.dataset.r as 'day' | 'week'
      range.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b))
      draw()
    }
  draw()
  return { el: s.el }
}

function trade(ctx: Ctx, side: 'buy' | 'sell', sym: string, get: () => Data | null, done: () => Promise<void>) {
  const d = get()
  const q = d?.quotes.find((x) => x.sym === sym)
  if (!d || !q) return
  const owned = d.holdings.find((h) => h.sym === sym)?.shares ?? 0
  let n = 1
  const sh = sheet(ctx, `<div class="ifr-sec">${side === 'buy' ? 'Buy' : 'Sell'} ${sym}</div>`)
  const box = el('div', 'ifs-trade')
  const step = el('div', 'ifs-step')
  const minus = act('−', () => setN(n - 1), 'ghost')
  const plus = act('+', () => setN(n + 1), 'ghost')
  const count = el('b', '', '1')
  step.append(minus, count, plus)
  const info = el('div', 'ifs-info')
  const go = act('', () => void confirm(), side === 'buy' ? 'green ifb-go' : 'red ifb-go')
  box.append(step, info, go)
  sh.el.append(box)
  const max = side === 'sell' ? owned : Math.max(1, Math.min(STOCK_RULES.maxShares - owned, Math.floor((d.coins - STOCK_RULES.fee) / q.price)))
  const setN = (v: number) => {
    n = Math.max(1, Math.min(max, v))
    count.textContent = String(n)
    const value = tradeValue(q.price, n)
    const total = side === 'buy' ? value + STOCK_RULES.fee : value - STOCK_RULES.fee
    info.innerHTML = `<span>${n} × ${fmt(q.price)}</span><span>Fee $${STOCK_RULES.fee}</span><b>${side === 'buy' ? 'Cost' : 'You get'} $${total}</b>`
    go.textContent = side === 'buy' ? `Buy for $${total}` : `Sell for $${total}`
    go.disabled = (side === 'buy' && total > d.coins) || (side === 'sell' && owned < n)
  }
  setN(1)
  const confirm = async () => {
    go.disabled = true
    const r = isOnline() ? await rest<{ ok?: boolean; error?: string }>('/phone/stocks/trade', { json: { sym, side, shares: n } }).catch(() => ({ error: 'net' })) : offlineTrade(side, sym, n, q.price)
    if (r.error) {
      tone('error')
      const msg: Record<string, string> = { poor: 'Not enough money.', 'trade-limit': `That’s ${STOCK_RULES.tradesPerDay} trades today. The bell rings again tomorrow.`, 'invest-limit': `You can hold up to $${STOCK_RULES.maxInvested} in shares.`, 'not-enough-shares': 'You don’t own that many.', net: 'Can’t reach the Exchange.' }
      ctx.banner(msg[r.error] ?? 'That trade didn’t go through.')
      go.disabled = false
      return
    }
    tone(side === 'buy' ? 'bell' : 'coin')
    sh.close()
    ctx.banner(`${side === 'buy' ? 'Bought' : 'Sold'} ${n} ${sym}`)
    await done()
  }
}

/** offline, trades run on your local market and coins */
function offlineTrade(side: 'buy' | 'sell', sym: string, n: number, price: number): { ok?: boolean; error?: string } {
  const s = ifr()
  const today = String(nycDay())
  if (s.trades.day !== today) s.trades = { day: today, n: 0 }
  if (s.trades.n >= STOCK_RULES.tradesPerDay) return { error: 'trade-limit' }
  const value = tradeValue(price, n)
  const h = (s.holdings[sym] ??= { shares: 0, cost: 0 })
  if (side === 'buy') {
    const invested = Object.values(s.holdings).reduce((a, x) => a + x.cost, 0)
    if (invested + value > STOCK_RULES.maxInvested) return { error: 'invest-limit' }
    if (save.coins < value + STOCK_RULES.fee) return { error: 'poor' }
    save.coins -= value + STOCK_RULES.fee
    h.shares += n
    h.cost += value
    recordLocal(-(value + STOCK_RULES.fee), `stock-buy:${sym}`)
  } else {
    if (h.shares < n) return { error: 'not-enough-shares' }
    const out = Math.round((h.cost * n) / h.shares)
    h.shares -= n
    h.cost -= out
    save.coins += value - STOCK_RULES.fee
    recordLocal(value - STOCK_RULES.fee, `stock-sell:${sym}`)
  }
  if (h.shares <= 0) delete s.holdings[sym]
  s.trades.n++
  store()
  persist()
  void import('../../../hud').then((m) => m.renderCoins())
  emit('bank')
  return { ok: true }
}

export { IPOS }
