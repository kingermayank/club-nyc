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

let showing = ''

export function openListings() {
  const p = el('div', 'streetcheesy')
  if (!HOME[showing]) showing = save.home
  const draw = () => {
    p.innerHTML = `<div class="sc-head"><span class="sc-logo">🧀</span><div><b>StreetCheesy</b><small>Buy it once, it’s yours. No rent, no broker fee.</small></div><span class="sc-wallet">${coin}${save.coins.toLocaleString('en-US')}</span></div>
      <div class="sc-body"><div class="sc-rail"></div><div class="sc-tour"></div></div>`
    const rail = p.querySelector('.sc-rail')!
    for (const h of [...HOMES].sort((x, y) => x.price - y.price)) {
      const owned = save.homes.includes(h.id)
      const b = el('button', 'sc-pick' + (h.id === showing ? ' on' : ''), `<span class="sc-thumb"><img src="${h.img}" alt="">${save.home === h.id ? '<em>Home</em>' : owned ? '<em class="own">Yours</em>' : ''}</span><b>${h.name}</b><small>${owned ? h.hood : `${coin}${h.price.toLocaleString('en-US')}`}</small>`) as HTMLButtonElement
      b.type = 'button'
      b.onclick = () => {
        sfx.click()
        showing = h.id
        draw()
      }
      rail.append(b)
    }
    p.querySelector('.sc-tour')!.append(tour(HOME[showing]))
    rail.querySelector('.sc-pick.on')?.scrollIntoView({ block: 'nearest' })
    p.append(closeButton())
  }
  draw()
  openOverlay(p)
}

/** One listing, big: the photo, where it is, what's special, and the one thing you can do about it. */
function tour(h: HomeDef) {
  const owned = save.homes.includes(h.id)
  const current = save.home === h.id
  const c = el('div', 'sc-card')
  c.innerHTML = `<div class="sc-photo"><img src="${h.img}" alt="">${current ? '<em>Home</em>' : owned ? '<em class="own">Yours</em>' : ''}<span class="sc-hood">📍 ${h.hood}</span></div>
    <div class="sc-info"><div class="sc-top"><b class="sc-name">${h.name}</b><span class="sc-price">${owned ? '' : h.price ? `${coin}${h.price.toLocaleString('en-US')}` : 'Free'}</span></div>
    <p>${h.blurb}</p>
    <div class="sc-perks">${h.perks.map((x) => `<span>${x}</span>`).join('')}</div><small class="sc-fine">${h.fine}</small><div class="sc-act"></div></div>`
  const act = c.querySelector('.sc-act')!
  const btn = el('button', 'btn ' + (current ? 'ghost' : 'go'))
  // statuses are labels, not buttons that do nothing
  if (current) {
    act.append(el('span', 'pc-status', '🔑 You live here'))
    return c
  } else if (owned) {
    btn.textContent = 'Move in 🚚'
    btn.onclick = () => {
      closeOverlay()
      moveIn(h.id)
    }
  } else {
    const short = h.price - save.coins
    btn.innerHTML = `Buy for ${coin}${h.price.toLocaleString('en-US')}`
    if (short > 0) act.append(el('small', 'sc-short', `${short.toLocaleString('en-US')} coins to go`))
    btn.onclick = async () => {
      if (save.coins < h.price) {
        sfx.squawk()
        return toast(`You need ${(h.price - save.coins).toLocaleString('en-US')} more coins.`, '🪙')
      }
      const ok = await api.choose(`Buy the ${h.name}?`, `${h.price.toLocaleString('en-US')} coins, once. It’s yours for good. Closing costs: zero. Board interview: just vibes.`, [
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
  act.prepend(btn)
  return c
}

/** Pack up this home's furniture, unpack the next one's, and go. */
export function moveIn(id: string) {
  const h = HOME[id]
  if (!h || !save.homes.includes(id)) return
  if (save.home !== id) {
    save.homeFurniture[save.home] = save.furniture
    save.furniture = save.homeFurniture[id] ?? []
    delete save.homeFurniture[id]
    save.home = id
    persist()
  }
  const release = hold()
  toast(id === 'penthouse' || id === 'sky-residence' ? 'Two guys and a van are carrying your bean bag up 90 floors… 🚚' : 'Two guys and a van are on it… 🚚', '🚚')
  setTimeout(() => {
    release()
    void import('./apartment').then((m) => m.goHome())
    api.stamp('new-digs')
    if (id === 'penthouse') setTimeout(() => api.stamp('billionaires-row'), 1200)
  }, 900)
}
