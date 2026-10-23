/**
 * Carb-Jitsu, in the browser: the table in the back of the 99¢ Slice, the bodega cat presiding. Pick a card (click or
 * 1-5) before the clock runs out; both cards flip at once; the server says who won the round and why. Spectators see
 * both trays and every reveal. Everything is decided on the server (server/src/game/mp/duel.ts).
 */
import { el } from '../../engine/stage'
import { headPortrait } from '../../avatar/render'
import type { Look } from '../../avatar/look'
import { FOODS, BOROUGHS, FX, CJ, beats } from '../shared/carbs'
import type { CardWire, DuelWire, MpS2C, ResultsWire } from '../shared/protocol'
import { msfx } from '../sound'
import { esc } from '../store'
import type { GameCtx, RunningGame } from '../controller'
import './carbs.css'

const FOOD_IMG = ['/art/mp/card-pizza.png', '/art/mp/card-pretzel.png', '/art/mp/card-bagel.png']

export function cardHtml(c: CardWire, cls = ''): string {
  const b = BOROUGHS[c.c] ?? BOROUGHS[0]
  return `<span class="cj-card ${cls}${c.fx ? ' fx' : ''}" style="--bc:${b.hex};--bd:${b.dark}" title="${FOODS[c.e].name} ${c.p} · ${b.name}${c.fx ? ` · ${FX[c.fx].name}: ${FX[c.fx].text}` : ''}">
    <span class="cj-num">${c.p}</span><img src="${FOOD_IMG[c.e]}" alt="${FOODS[c.e].name}"><span class="cj-boro">${b.short}</span>${c.fx ? `<span class="cj-fx">${FX[c.fx].name}</span>` : ''}</span>`
}
const chip = (c: CardWire, hot = false) => {
  const b = BOROUGHS[c.c] ?? BOROUGHS[0]
  return `<span class="cj-chip${hot ? ' hot' : ''}" style="--bc:${b.hex}" title="${FOODS[c.e].name} · ${b.name}"><img src="${FOOD_IMG[c.e]}" alt=""></span>`
}

export function start(ctx: GameCtx): RunningGame {
  const m = ctx.match
  const meIdx = m.you
  const players = m.players
  // you sit at the bottom; watching, the first player does
  const bottom = meIdx >= 0 ? meIdx : 0
  const top = 1 - bottom

  const root = ctx.root
  root.classList.add('cj')
  const art = el('div', 'cj-art')
  const panel = (k: number, cls: string) =>
    el('div', `cj-player ${cls}`, `<span class="mp-face">${headPortrait(players[k].l as Look)}</span><span class="cj-pwho"><b>${esc(players[k].n)}${k === meIdx ? ' (you)' : ''}</b><small>${players[k].bot ? 'City local' : '&nbsp;'}</small></span><span class="cj-status"></span><span class="cj-tray"></span>`)
  const pTop = panel(top, 'top')
  const pBot = panel(bottom, 'bottom')
  const rules = el('div', 'cj-rules', `${FOODS.map((f, i) => `<img src="${FOOD_IMG[i]}" alt="${f.name}" title="${f.name} beats ${f.beats}. ${f.why}">`).join('<b>beats</b>')}<b>beats</b><img src="${FOOD_IMG[0]}" alt="Pizza">`)
  const center = el('div', 'cj-center')
  const round = el('div', 'cj-round', '<svg viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="19"/><circle class="fg" cx="22" cy="22" r="19"/></svg><b>1</b>')
  const slots = el('div', 'cj-slots', `<span class="cj-slot them"></span><span class="cj-vs">VS</span><span class="cj-slot mine"></span>`)
  const caption = el('div', 'cj-caption', '')
  const effects = el('div', 'cj-effects')
  center.append(round, slots, caption, effects)
  const hand = el('div', 'cj-hand')
  const help = el('div', 'mp-hint cj-hint', meIdx >= 0 ? '<span>Pick a card: click it or press <kbd>1</kbd>–<kbd>5</kbd></span>' : '<span>Watching. You’re in line for the table.</span>')
  const banner = el('div', 'cj-banner')
  banner.hidden = true
  root.append(art, pTop, pBot, rules, center, hand, help, banner)

  let state: DuelWire | null = null
  let lastKey = ''
  let receivedAt = performance.now()
  const RING = 2 * Math.PI * 19

  // the intro: who's playing who
  banner.hidden = false
  banner.innerHTML = `<b>${esc(players[0].n)}</b><span>vs</span><b>${esc(players[1].n)}</b><small>Carb-Jitsu · first to three of a kind or one of each</small>`
  msfx.join()
  setTimeout(() => {
    if (!state) return
    banner.hidden = true
  }, Math.max(1200, m.startIn))

  const trayHtml = (cards: CardWire[], hot: number[] = []) => {
    // grouped by food, so you can see a set coming together
    return [0, 1, 2]
      .map((e) => {
        const list = cards.map((c, i) => ({ c, i })).filter((x) => x.c.e === e)
        return `<span class="cj-col">${list.map((x) => chip(x.c, hot.includes(x.i))).join('')}</span>`
      })
      .join('')
  }

  function render(s: DuelWire) {
    const key = `${s.r}:${s.ph}`
    const fresh = key !== lastKey
    lastKey = key
    receivedAt = performance.now()
    state = s
    banner.hidden = !(s.ph === 'over')
    round.querySelector('b')!.textContent = String(s.r)
    // the players: who's picked, their trays
    const status = (k: number) => (s.ph === 'pick' ? (s.picked[k] ? '<span class="mp-pill ready">Picked</span>' : '<span class="mp-pill">Thinking…</span>') : '')
    pTop.querySelector('.cj-status')!.innerHTML = status(top)
    pBot.querySelector('.cj-status')!.innerHTML = status(bottom)
    const hotTop = s.winner === top ? s.set ?? [] : []
    const hotBot = s.winner === bottom ? s.set ?? [] : []
    pTop.querySelector('.cj-tray')!.innerHTML = trayHtml(s.trays[top], hotTop)
    pBot.querySelector('.cj-tray')!.innerHTML = trayHtml(s.trays[bottom], hotBot)
    // rules bent this round
    const fx: string[] = []
    if (s.fx?.low) fx.push(`<span><b>${FX.low.name}</b>: this round the lower number wins</span>`)
    if (s.fx?.hike) {
      const who = s.fx.hike[bottom] ? (bottom === meIdx ? 'your' : `${esc(players[bottom].n)}’s`) : s.fx.hike[top] ? `${esc(players[top].n)}’s` : ''
      if (who) fx.push(`<span><b>${FX.hike.name}</b>: ${who} card is worth 3 less</span>`)
    }
    effects.innerHTML = fx.join('')
    // the two cards in the middle
    const sTop = slots.querySelector<HTMLElement>('.cj-slot.them')!
    const sBot = slots.querySelector<HTMLElement>('.cj-slot.mine')!
    if (s.ph === 'pick') {
      sTop.innerHTML = s.picked[top] ? '<span class="cj-card back"></span>' : ''
      sBot.innerHTML = s.picked[bottom] ? (meIdx >= 0 && s.mine !== undefined && s.hand ? cardHtml(s.hand[s.mine], 'faceup') : '<span class="cj-card back"></span>') : ''
      caption.innerHTML = s.r === 1 && fresh ? 'Pick a card. Both flip at the same time.' : ''
      caption.className = 'cj-caption'
    } else if (s.rev) {
      sTop.innerHTML = cardHtml(s.rev[top], fresh ? 'flip' : '') + ''
      sBot.innerHTML = cardHtml(s.rev[bottom], fresh ? 'flip' : '')
      const w = s.win ?? -1
      sTop.classList.toggle('won', w === top)
      sBot.classList.toggle('won', w === bottom)
      sTop.classList.toggle('lost', w === bottom)
      sBot.classList.toggle('lost', w === top)
      caption.innerHTML = explain(s, w)
      caption.className = 'cj-caption show' + (w === -1 ? ' tie' : w === bottom ? ' good' : ' bad')
      if (fresh) {
        msfx.flip()
        setTimeout(() => (w === -1 ? msfx.tie() : (meIdx < 0 ? w === bottom : w === meIdx) ? msfx.roundWin() : msfx.roundLose()), 380)
      }
    }
    if (s.ph !== 'reveal' && s.ph !== 'over') {
      sTop.classList.remove('won', 'lost')
      sBot.classList.remove('won', 'lost')
    }
    // the winner
    if (s.ph === 'over' && s.winner !== undefined) {
      const wName = s.winner === meIdx ? 'You win the table!' : `${esc(players[s.winner].n)} wins the table!`
      const why = s.why === 'left' ? 'The other player left.' : s.why === 'forfeit' ? 'The other player stepped away from the table.' : 'Three of a kind, or one of each, from three boroughs.'
      banner.innerHTML = `<b>${wName}</b><small>${why}</small>`
      if (fresh) s.winner === meIdx ? msfx.win() : meIdx >= 0 ? msfx.lose() : msfx.finish()
    }
    // my hand
    if (meIdx >= 0 && s.hand) {
      const picked = s.mine !== undefined || s.ph !== 'pick'
      if (fresh || hand.dataset.r !== key + (s.mine ?? '')) {
        hand.dataset.r = key + (s.mine ?? '')
        hand.innerHTML = ''
        s.hand.forEach((c, i) => {
          const b = el('button', 'cj-pick' + (s.mine === i ? ' chosen' : '') + (picked && s.mine !== i ? ' dim' : '')) as HTMLButtonElement
          b.innerHTML = cardHtml(c) + `<kbd>${i + 1}</kbd>`
          b.disabled = picked
          b.setAttribute('aria-label', `${FOODS[c.e].name} ${c.p}, ${BOROUGHS[c.c].name}${c.fx ? `, ${FX[c.fx].name}` : ''}`)
          b.onclick = () => pick(i)
          hand.append(b)
        })
      }
    } else hand.innerHTML = ''
  }

  function explain(s: DuelWire, w: number): string {
    if (!s.rev) return ''
    const [a, b] = [s.rev[top], s.rev[bottom]]
    const name = (k: number) => (k === meIdx ? 'You' : esc(players[k].n))
    if (w === -1) return `A tie! ${FOODS[a.e].name} ${a.p} and ${FOODS[b.e].name} ${b.p}. Nobody keeps a card.`
    const wc = w === top ? a : b
    const lc = w === top ? b : a
    if (wc.e !== lc.e && beats(wc.e, lc.e)) return `<b>${name(w)}</b> ${w === meIdx ? 'win' : 'wins'} the round: ${FOODS[wc.e].name} beats ${FOODS[lc.e].name}. ${FOODS[wc.e].why}`
    return `<b>${name(w)}</b> ${w === meIdx ? 'win' : 'wins'} the round: same food, ${s.fx?.low ? 'and the lower number wins this round' : `${wc.p} beats ${lc.p}`}.${wc.fx ? ` ${FX[wc.fx].name}!` : ''}`
  }

  function pick(i: number) {
    if (!state || state.ph !== 'pick' || state.mine !== undefined || meIdx < 0) return
    msfx.card()
    ctx.send({ k: 'pick', c: i })
    // show it straight away (the server confirms a moment later)
    state = { ...state, mine: i, picked: state.picked.map((p, k) => (k === meIdx ? true : p)) as [boolean, boolean] }
    render(state)
  }

  const keydown = (e: KeyboardEvent) => {
    if (e.key >= '1' && e.key <= '5') {
      e.preventDefault()
      pick(Number(e.key) - 1)
    }
  }
  window.addEventListener('keydown', keydown, true)

  // the clock ring
  let raf = 0
  let lastTick = -1
  const tick = () => {
    raf = requestAnimationFrame(tick)
    if (!state) return
    const left = Math.max(0, state.left - (performance.now() - receivedAt))
    const total = state.ph === 'pick' ? CJ.pickMs : state.ph === 'reveal' ? CJ.revealMs : CJ.overMs
    const fg = round.querySelector<SVGCircleElement>('.fg')!
    fg.style.strokeDasharray = `${RING}`
    fg.style.strokeDashoffset = `${RING * (1 - left / total)}`
    round.classList.toggle('hurry', state.ph === 'pick' && left < 4000 && state.mine === undefined && meIdx >= 0)
    const s = Math.ceil(left / 1000)
    if (state.ph === 'pick' && meIdx >= 0 && state.mine === undefined && s <= 3 && s !== lastTick && s > 0) msfx.tick()
    lastTick = s
  }
  raf = requestAnimationFrame(tick)

  return {
    id: m.id,
    event(e: MpS2C) {
      if (e.k === 'cj') render(e.s)
    },
    react(id, html) {
      const k = players.findIndex((p) => p.i === id)
      const box = k === top ? pTop : k === bottom ? pBot : null
      if (!box) return
      box.querySelector('.mp-react-at')?.remove()
      const r = el('span', 'mp-react-at', html)
      box.append(r)
      setTimeout(() => r.remove(), 2400)
    },
    finish(r: ResultsWire) {
      void r
      return 400
    },
    destroy() {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', keydown, true)
    },
  }
}
