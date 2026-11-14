/** Bank: your coins, where they came from and went (the server's ledger), and coins between friends. */
import { el } from '../../../engine/stage'
import { save } from '../../../state'
import { rest, HttpError } from '../../../net/server'
import { link } from '../../../net/link'
import { screenEl, act, shimmer, empty, sheet, face, people, esc, type Person } from '../kit'
import { ifr, on, setBadge, isOnline, readNotes } from '../store'
import { lineFor } from '../ledger'
import { BANK_RULES } from '../wire'
import type { Ctx, Screen } from '../phone'
import { island } from '../phone'
import { tone } from '../sound'

interface LedgerLine { delta: number; reason: string; at: number; balance: number; who?: string; note?: string }
interface Req { id: number; from: string; fromName: string; to: string; toName: string; amount: number; note: string; status: string; at: number }
interface BankData { coins: number; ledger: LedgerLine[]; requests: Req[]; limits?: { sendLeft: number; receiveLeft: number } }

let shown = -1
function odometer(node: HTMLElement, to: number) {
  const from = shown < 0 ? to : shown
  shown = to
  if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) return void (node.textContent = to.toLocaleString('en-US'))
  const t0 = performance.now()
  const step = (t: number) => {
    const k = Math.min(1, (t - t0) / 700)
    const e = 1 - Math.pow(1 - k, 3)
    node.textContent = Math.round(from + (to - from) * e).toLocaleString('en-US')
    if (k < 1 && node.isConnected) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}

async function load(): Promise<BankData> {
  if (!isOnline()) return { coins: save.coins, ledger: ifr().ledger, requests: [] }
  return rest<BankData>('/phone/bank')
}

const ERR: Record<string, string> = {
  'not-friends': 'You can only send coins to friends.',
  'bad-amount': `Between $1 and $${BANK_RULES.maxPerTransfer}.`,
  'too-new': 'New accounts can send coins after their first day.',
  'send-limit': `That’s the most you can send today ($${BANK_RULES.sendPerDay}).`,
  'their-limit': 'They’ve had enough gifts for today.',
  poor: 'Not enough money.',
  self: 'That’s you.',
  'already-asked': 'You already asked them.',
  'slow-down': 'Slow down a little.',
}

export function open(ctx: Ctx, arg?: string): Screen {
  const s = screenEl(ctx, 'Bank', { back: false, big: true })
  const card = el('div', 'ifb-card', `<span class="ifb-brand"><img src="/art/ifruit/logo-cherry.svg" alt="">iFruit Bank</span><small>Balance</small><b class="ifb-bal"><i class="money-d">$</i><span>${save.coins}</span></b><span class="ifb-name">${esc(save.name || 'New Yorker')}</span><i class="ifb-chip"></i>`)
  const week = el('div', 'ifb-week')
  const btns = el('div', 'ifb-btns')
  const reqs = el('div', 'ifb-reqs')
  const list = el('div', 'ifb-list', shimmer(4))
  s.body.append(card, btns, week, reqs, list)
  const online = isOnline()
  const send = act('Send', () => ctx.push(transfer(ctx, 'send')), 'blue')
  const ask = act('Request', () => ctx.push(transfer(ctx, 'request')), 'ghost')
  send.disabled = ask.disabled = !online
  btns.append(send, ask)
  if (!online) btns.append(el('small', 'ifb-off', 'Online only'))

  const render = async () => {
    let d: BankData
    try {
      d = await load()
    } catch {
      list.innerHTML = '<div class="ifr-err">Can’t reach the bank. Your coins are safe.</div>'
      return
    }
    odometer(card.querySelector('.ifb-bal span')!, d.coins)
    // this week: what came in and what went out
    const since = Date.now() - 7 * 86400000
    const wk = d.ledger.filter((l) => l.at > since)
    const inn = wk.filter((l) => l.delta > 0).reduce((a, l) => a + l.delta, 0)
    const out = -wk.filter((l) => l.delta < 0).reduce((a, l) => a + l.delta, 0)
    const max = Math.max(1, inn, out)
    week.innerHTML = `<div><small>In this week</small><b class="up">+$${inn}</b><i style="--w:${(inn / max) * 100}%" class="up"></i></div><div><small>Out this week</small><b class="down">−$${out}</b><i style="--w:${(out / max) * 100}%" class="down"></i></div>`
    // requests waiting on you (and yours waiting on them)
    reqs.innerHTML = ''
    const mine = d.requests.filter((r) => r.from !== r.to)
    const toPay = mine.filter((r) => r.toName && r.fromName && r.from === myIdOf(d, r))
    setBadge('bank', toPay.length)
    for (const r of mine) {
      const payer = r.from === myIdOf(d, r)
      const row = el('div', 'ifb-req', `<img src="/art/icons/coin.png" alt=""><span class="ifr-txt"><b>${payer ? `${esc(r.toName)} asks $${r.amount}` : `You asked ${esc(r.fromName)} for $${r.amount}`}</b><small>${esc(r.note || 'No note')}</small></span>`)
      if (payer) {
        row.append(
          act('Pay', async () => answer(r.id, 'pay'), 'green'),
          act('No', async () => answer(r.id, 'decline'), 'ghost'),
        )
        if (arg === `req:${r.id}`) row.classList.add('hl')
      } else row.append(act('Cancel', async () => answer(r.id, 'cancel'), 'ghost'))
      reqs.append(row)
    }
    // activity, by day
    list.innerHTML = ''
    if (!d.ledger.length) return list.append(empty('/art/ifruit/app/bank.png', 'No Activity Yet', 'Earn coins with a job around town.'))
    let day = ''
    for (const l of d.ledger.slice(0, 60)) {
      const dl = new Date(l.at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })
      if (dl !== day) {
        list.append(el('div', 'ifr-sec', dl))
        day = dl
      }
      const ln = lineFor(l.reason)
      const what = l.who ? `${l.delta > 0 ? 'From' : 'To'} ${l.who}` : ln.what
      const row = el('button', 'ifr-row ifb-row', `<span class="ifb-ico">${ln.icon}</span><span class="ifr-txt"><b>${esc(what)}</b><small>${esc(l.note || ln.where || new Date(l.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }))}</small></span><b class="ifb-amt ${l.delta > 0 ? 'up' : ''}">${l.delta > 0 ? '+' : '−'}$${Math.abs(l.delta)}</b>`)
      row.type = 'button'
      row.onclick = () => {
        sheet(ctx, `<div class="ifb-detail"><span class="ifb-ico big">${ln.icon}</span><b class="ifb-amt ${l.delta > 0 ? 'up' : ''}">${l.delta > 0 ? '+' : '−'}$${Math.abs(l.delta)}</b><span>${esc(what)}</span>${ln.where ? `<small>${esc(ln.where)}</small>` : ''}${l.note ? `<small>“${esc(l.note)}”</small>` : ''}<small>${new Date(l.at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/New_York' })}</small><small>Balance after: $${l.balance}</small></div>`)
      }
      list.append(row)
    }
  }
  const answer = async (id: number, actName: 'pay' | 'decline' | 'cancel') => {
    try {
      const r = await rest<{ ok?: boolean; error?: string; coins?: number }>(`/phone/bank/requests/${id}/${actName}`, { method: 'POST' })
      if (r.error) return void (ctx.banner(ERR[r.error] ?? 'That didn’t go through.'), tone('error'))
      if (actName === 'pay') {
        tone('coin')
        ctx.banner('Paid')
      }
      void render()
    } catch {
      ctx.banner('That didn’t go through.')
    }
  }
  readNotes('bank')
  const off = on('bank', () => void render())
  void render()
  if (arg?.startsWith('pay:')) setTimeout(() => ctx.push(transfer(ctx, 'send', arg.slice(4))), 50)
  return { el: s.el, onShow: () => void render(), dispose: off }
}

/** the payer of a request is its `from` */
const myIdOf = (_d: BankData, _r: Req) => link.me

// ---------- send / request ----------
function transfer(ctx: Ctx, kind: 'send' | 'request', preset?: string): Screen {
  const s = screenEl(ctx, kind === 'send' ? 'Send Money' : 'Request Money')
  let who: Person | null = null
  let amount = ''
  let note = ''
  const pick = el('div', 'ifb-pick', shimmer(2))
  const amt = el('div', 'ifb-amount', `<i class="money-d">$</i><b>0</b>`)
  const pad = el('div', 'ifb-pad')
  const chips = el('div', 'ifb-chips')
  const go = act(kind === 'send' ? 'Send' : 'Request', () => void submit(), 'blue ifb-go')
  go.disabled = true
  s.body.append(pick, amt, chips, pad, go)
  const upd = () => {
    amt.querySelector('b')!.textContent = amount || '0'
    go.disabled = !who || !Number(amount)
    go.textContent = who && Number(amount) ? `${kind === 'send' ? 'Send' : 'Request'} $${amount} ${kind === 'send' ? 'to' : 'from'} ${who.name}` : kind === 'send' ? 'Send' : 'Request'
  }
  for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']) {
    const b = el('button', 'ifb-key', k)
    b.type = 'button'
    if (!k) b.style.visibility = 'hidden'
    b.onclick = () => {
      tone('tap')
      if (k === '⌫') amount = amount.slice(0, -1)
      else if (amount.length < 3) amount = String(Math.min(BANK_RULES.maxPerTransfer, Number(amount + k)))
      if (amount === '0') amount = ''
      amt.animate([{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 160 })
      upd()
    }
    pad.append(b)
  }
  for (const n of ['🍕 Pizza', '🎟️ Tickets', '🔑 Rent', '🙏 Thanks']) {
    const c = el('button', 'ifm-chip', n)
    c.type = 'button'
    c.onclick = () => {
      note = note === n ? '' : n
      chips.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.textContent === note))
    }
    chips.append(c)
  }
  void people().then(({ friends }) => {
    const real = friends.filter((f) => !f.local)
    pick.innerHTML = ''
    if (!real.length) return pick.append(empty('', 'No Friends Yet', 'Money goes to friends only.'))
    const row = el('div', 'ifb-people')
    for (const f of real) {
      const b = el('button', 'ifb-person' + (f.id === preset ? ' on' : ''), `${face(f.look, f.online)}<span>${esc(f.name)}</span>`)
      b.type = 'button'
      b.onclick = () => {
        tone('tap')
        who = f
        row.querySelectorAll('.ifb-person').forEach((x) => x.classList.toggle('on', x === b))
        upd()
      }
      if (f.id === preset) who = f
      row.append(b)
    }
    pick.append(row)
    upd()
  })
  const submit = async () => {
    if (!who || !Number(amount)) return
    go.disabled = true
    try {
      const r = await rest<{ ok?: boolean; error?: string }>(`/phone/bank/${kind}`, { json: { to: who.id, amount: Number(amount), note } })
      if (r.error) {
        tone('error')
        ctx.banner(ERR[r.error] ?? 'That didn’t go through.')
        go.disabled = false
        return
      }
      if (kind === 'send') {
        tone('coin')
        island(`−$${amount} to ${esc(who.name)}`, 2400, 'coin')
        // a coin flies off to their face
        const target = pick.querySelector('.ifb-person.on .ifr-face')
        if (target && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
          const coin = el('img', 'ifb-fly') as HTMLImageElement
          coin.src = '/art/icons/coin.png'
          s.el.append(coin)
          const a = amt.getBoundingClientRect()
          const b = target.getBoundingClientRect()
          const base = s.el.getBoundingClientRect()
          const k = base.width / s.el.offsetWidth
          coin.style.left = `${(a.left - base.left) / k + 10}px`
          coin.style.top = `${(a.top - base.top) / k}px`
          await coin.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${(b.left - a.left) / k}px, ${(b.top - a.top) / k - 30}px) scale(1.3)`, offset: 0.6 }, { transform: `translate(${(b.left - a.left) / k}px, ${(b.top - a.top) / k}px) scale(0.4)`, opacity: 0 }], { duration: 700, easing: 'cubic-bezier(0.3, 0, 0.3, 1)' }).finished
          coin.remove()
        }
      } else ctx.banner(`Asked ${esc(who.name)} for $${amount}`)
      ctx.pop()
    } catch (e) {
      ctx.banner(e instanceof HttpError ? 'That didn’t go through.' : 'Can’t reach the bank.')
      go.disabled = false
    }
  }
  return { el: s.el }
}
