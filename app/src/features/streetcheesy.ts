import './homes.css'
import { sfx } from '../audio'
import { save, persist } from '../state'
import { el } from '../engine/stage'
import { openOverlay, closeOverlay, closeButton, toast, confetti, hold } from '../engine/ui'
import { HOMES, HOME, type HomeDef } from '../data/homes'
import { api } from '../game'
import { walletOnline, buyOnline } from '../net/wallet'

/**
 * StreetCheesy — the city's most honest listings app. Buy a place, move in, and your furniture for each home
 * stays where you left it.
 */
const coin = `<img src="/art/icons/coin.png" alt="">`

export function openListings() {
  const p = el('div', 'streetcheesy')
  const draw = () => {
    p.innerHTML = `<div class="sc-head"><span class="sc-logo">🧀</span><div><b>StreetCheesy</b><small>Cheesy listings. Real views. No broker fee (thanks, FARE Act).</small></div><span class="sc-wallet">${coin}${save.coins.toLocaleString('en-US')}</span></div>
      <div class="sc-list"></div>`
    const list = p.querySelector('.sc-list')!
    for (const h of HOMES) list.append(card(h))
    p.append(closeButton())
  }
  draw()
  openOverlay(p)
}

function card(h: HomeDef) {
  const owned = save.homes.includes(h.id)
  const current = save.home === h.id
  const c = el('div', 'sc-card' + (current ? ' current' : '') + (h.soon ? ' soon' : ''))
  c.innerHTML = `<div class="sc-photo">${h.img ? `<img src="${h.img}" alt="">` : '<span>🌉</span>'}${current ? '<em>Home</em>' : owned ? '<em class="own">Owned</em>' : ''}</div>
    <div class="sc-info"><div class="sc-price">${h.soon ? 'Coming soon' : h.price ? `${coin}${h.price.toLocaleString('en-US')}` : 'Free · yours'}</div>
    <b class="sc-name">${h.name}</b><small class="sc-hood">📍 ${h.hood}</small><p>${h.blurb}</p>
    <div class="sc-perks">${h.perks.map((x) => `<span>${x}</span>`).join('')}</div><small class="sc-fine">${h.fine}</small></div>`
  const btn = el('button', 'btn small ' + (current ? 'ghost' : 'go'))
  // statuses are labels, not buttons that do nothing
  if (h.soon || current) {
    c.querySelector('.sc-info')!.append(el('span', 'pc-status', h.soon ? '🚧 Brooklyn opens soon' : '🔑 You live here'))
    return c
  } else if (owned) {
    btn.textContent = 'Move in 🚚'
    btn.onclick = () => {
      closeOverlay()
      moveIn(h.id)
    }
  } else {
    btn.innerHTML = `Buy for ${coin}${h.price.toLocaleString('en-US')}`
    btn.onclick = async () => {
      if (save.coins < h.price) {
        sfx.squawk()
        return toast(`You need ${(h.price - save.coins).toLocaleString('en-US')} more coins. Time for a few shifts at Papi’s!`, '🪙')
      }
      const ok = await api.choose(`Buy the ${h.name}?`, `${h.price.toLocaleString('en-US')} coins. Closing costs: zero. Board interview: just vibes.`, [
        { label: 'Sign the Papers ✍️', value: true },
        { label: 'Keep Looking', value: false },
      ])
      if (!ok) return openListings()
      if (walletOnline()) {
        // the server checks the price and adds the home to your wallet
        const r = await buyOnline('home', h.id)
        if (!r?.ok) {
          toast(r?.error === 'poor' ? 'Not enough coins yet. Keep working those shifts!' : 'The deal fell through. Try again in a moment.', '🏠')
          return openListings()
        }
      } else {
        if (!api.spend(h.price, `home:${h.id}`)) return openListings()
        save.homes.push(h.id)
        persist()
      }
      sfx.register()
      confetti(60)
      toast(`🔑 The ${h.name} is yours!`, '🏠')
      moveIn(h.id)
    }
  }
  c.querySelector('.sc-info')!.append(btn)
  return c
}

/** Pack up this home's furniture, unpack the next one's, and go. */
export function moveIn(id: string) {
  const h = HOME[id]
  if (!h || !save.homes.includes(id) || h.soon) return
  if (save.home !== id) {
    save.homeFurniture[save.home] = save.furniture
    save.furniture = save.homeFurniture[id] ?? []
    delete save.homeFurniture[id]
    save.home = id
    persist()
  }
  const release = hold()
  toast(id === 'penthouse' ? 'Two guys and a van are carrying your bean bag up 90 floors… 🚚' : 'Two guys and a van are on it… 🚚', '🚚')
  setTimeout(() => {
    release()
    void import('./apartment').then((m) => m.goHome())
    api.stamp('new-digs')
    if (id === 'penthouse') setTimeout(() => api.stamp('billionaires-row'), 1200)
  }, 900)
}
