import './souvenirs.css'
import { sfx } from '../audio'
import { save, persist, bump } from '../state'
import { el } from '../engine/stage'
import { onRoom } from '../engine/world'
import { magnetSpot } from './fridgeSpots'
import type { Game } from '../types'
import { PAINTINGS, MAGNETS, magnetSrc } from '../data/souvenirs'
import { picCard } from './infocard'
import { giveFurniture, apartmentHost } from './apartment'

/**
 * Buying things that live at home: the Brooklyn Bridge painter's gallery (paintings on easels for your apartment),
 * the souvenir stand's fridge magnets, and the fridge they end up on.
 */

const coin = '<img src="/art/icons/coin.png" alt="">'
const pick = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)]

/** furniture you own anywhere: in storage, placed in this home, or placed in another home */
function ownsFurniture(id: string) {
  return save.storage.includes(id) || save.furniture.some((f) => f.id === id) || Object.values(save.homeFurniture ?? {}).some((l) => l.some((f) => f.id === id))
}
const myMagnets = () => (save.magnets ??= [])

const PAINTER_LINE = '“All originals. Some more original than others.” (Point at a painting to hear about it.)'
/** the speech bubble on a gallery card: says something about whatever you point at */
let tell = (_t: string) => {}
function bubbleFor(card: HTMLElement, rest: string, grid: HTMLElement) {
  const span = card.querySelector<HTMLElement>('.ic-joke span')
  tell = (t) => span && (span.textContent = t)
  grid.onmouseleave = () => tell(rest)
}

// ---------- the street artist's gallery ----------
export function openGallery(g: Game) {
  const grid = el('div', 'ic-gallery paintings')
  const render = () => {
    grid.innerHTML = ''
    for (const p of PAINTINGS) {
      const owned = ownsFurniture(p.id)
      const tile = el('div', 'ic-tile' + (owned ? ' owned' : ''))
      tile.onmouseenter = () => tell(`“${p.name}”: ${p.blurb}`)
      tile.innerHTML = `<div class="ic-tile-pic"><img src="/art/furniture/${p.id}.png" alt="" draggable="false"></div><b>${p.name}</b>`
      const b = el('button', 'btn tiny' + (owned ? ' ghost' : ' go'), owned ? 'In Your Home' : `${coin} ${p.price}`) as HTMLButtonElement
      b.setAttribute('aria-label', owned ? `${p.name}: in your home` : `Buy ${p.name} for ${p.price} coins`)
      b.disabled = owned
      b.onclick = () => {
        if (!g.spend(p.price, `furniture:${p.id}`)) return
        sfx.register()
        bump('buys')
        giveFurniture(p.id)
        g.stamp('art-collector')
        g.say(pick([`“${p.name}”. It’s going right above my couch.`, `Bought “${p.name}”. My apartment is now a gallery. A small one.`]))
        render()
      }
      tile.append(b)
      grid.append(tile)
    }
  }
  render()
  const card = picCard({
    title: 'Skyline Painter',
    kicker: 'Street Artist',
    text: 'Pick a painting. It’s delivered to your apartment.',
    joke: PAINTER_LINE,
    extra: grid,
    cls: 'gallery easel',
    actions: [
      { label: 'Go Home and Decorate', note: 'place your paintings', act: () => void import('./apartment').then((m) => m.goHome()) },
      { label: 'Just Browsing', act: () => g.say('“Browsing is free. Like the view.”') },
    ],
  })
  bubbleFor(card, PAINTER_LINE, grid)
}

// ---------- the souvenir stand: fridge magnets ----------
export function openMagnetStand(g: Game) {
  const grid = el('div', 'ic-gallery magnets')
  const render = () => {
    grid.innerHTML = ''
    for (const m of MAGNETS) {
      const owned = myMagnets().includes(m.id)
      const tile = el('div', 'ic-tile' + (owned ? ' owned' : ''))
      tile.onmouseenter = () => tell(`${m.name}: ${m.blurb}`)
      tile.innerHTML = `<div class="ic-tile-pic"><img src="${magnetSrc(m.id)}" alt="" draggable="false"></div><b>${m.name}</b>`
      const b = el('button', 'btn tiny' + (owned ? ' ghost' : ' go'), owned ? 'On Your Fridge' : `${coin} ${m.price}`) as HTMLButtonElement
      b.setAttribute('aria-label', owned ? `${m.name}: on your fridge` : `Buy the ${m.name} magnet for ${m.price} coins`)
      b.disabled = owned
      b.onclick = () => {
        if (!g.spend(m.price, `magnet:${m.id}`)) return
        sfx.register()
        bump('buys')
        myMagnets().push(m.id)
        persist()
        g.say(`${m.name} magnet. ${m.blurb}`)
        if (MAGNETS.every((x) => myMagnets().includes(x.id))) g.stamp('fridge-full')
        render()
      }
      tile.append(b)
      grid.append(tile)
    }
  }
  render()
  const card = picCard({
    title: 'Fridge Magnets',
    kicker: 'Souvenir Stand',
    text: 'Every magnet goes on your fridge.',
    joke: MAGNET_LINE,
    extra: grid,
    cls: 'gallery stand',
    actions: [
      { label: 'Love Locks', note: 'a lock and its key', primary: true, act: () => void import('./moments/lovelocks').then((m) => m.loveLocks(g, 'stand')) },
      { label: 'See My Fridge', act: () => openFridge(g) },
      { label: 'Shirts & Hats', note: 'souvenir catalog', act: () => g.catalog('iloveny') },
    ],
  })
  bubbleFor(card, MAGNET_LINE, grid)
}
const MAGNET_LINE = 'Collect all nine. Your fridge has room. Your apartment doesn’t.'

// ---------- the fridge at home ----------
/** the lower door of the fridge in the walk-up's painting, corner by corner (logical room coords: top-left,
 * top-right, bottom-right, bottom-left). Magnets sit on it where you put them in the close-up. */
const ROOM_DOOR: [number, number][] = [[885, 187], [965, 203], [965, 357], [885, 328]]
/** The fridge at home: the door up close with your magnets on it, and the inside (features/fridge.ts). */
export const openFridge = (g: Game) => void import('./fridge').then((m) => m.openFridge(g, stickMagnets))

/** Your magnets on the walk-up's fridge (your own place only: a visit shows their fridge, not yours), arranged the
 * way you left them in the close-up. */
let fridgeScene: HTMLElement | null = null
function stickMagnets() {
  const scene = fridgeScene
  if (!scene?.isConnected) return
  scene.querySelectorAll('.fridge-magnet').forEach((n) => n.remove())
  const have = myMagnets()
  const [tl, tr, br, bl] = ROOM_DOOR
  MAGNETS.forEach((m, i) => {
    if (!have.includes(m.id)) return
    const [fx, fy] = magnetSpot(m.id, i)
    const top = [tl[0] + (tr[0] - tl[0]) * fx, tl[1] + (tr[1] - tl[1]) * fx]
    const bot = [bl[0] + (br[0] - bl[0]) * fx, bl[1] + (br[1] - bl[1]) * fx]
    const img = el('img', 'fridge-magnet') as HTMLImageElement
    img.src = magnetSrc(m.id)
    img.alt = ''
    img.draggable = false
    img.style.cssText = `left:${top[0] + (bot[0] - top[0]) * fy}px;top:${top[1] + (bot[1] - top[1]) * fy}px;--r:${((have.indexOf(m.id) * 37) % 17) - 8}deg`
    scene.append(img)
  })
}
onRoom('apartment', ({ scene }) => {
  fridgeScene = apartmentHost() !== undefined ? null : scene
  stickMagnets()
})
