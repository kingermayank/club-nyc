import './souvenirs.css'
import { sfx } from '../audio'
import { save, persist, bump } from '../state'
import { el } from '../engine/stage'
import { onRoom, world } from '../engine/world'
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
    kicker: 'Brooklyn Bridge · Street Artist',
    text: 'Painters have set their easels up on the bridge promenade for generations. Pick a painting: it’s delivered to your apartment, ready to hang when you decorate.',
    joke: PAINTER_LINE,
    extra: grid,
    cls: 'gallery',
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
    kicker: 'Brooklyn Bridge · Souvenir Stand',
    text: 'The souvenir that survives any suitcase. Every magnet you buy goes straight onto your apartment fridge.',
    joke: MAGNET_LINE,
    extra: grid,
    cls: 'gallery',
    actions: [
      { label: 'See My Fridge', act: () => openFridge(g) },
      { label: 'Shirts & Hats', note: 'souvenir catalog', act: () => g.catalog('iloveny') },
    ],
  })
  bubbleFor(card, MAGNET_LINE, grid)
}
const MAGNET_LINE = 'Collect all nine. Your fridge has room. Your apartment doesn’t.'

// ---------- the fridge at home ----------
/** spots on the walk-up's fridge doors (logical room coords, magnet centres), clear of the Decorate button and the
 * apartment's side buttons that sit over the fridge's right edge */
const SLOTS: [number, number][] = [[906, 104], [934, 116], [914, 172], [906, 205], [934, 222], [910, 250], [936, 268], [912, 296], [938, 314]]

export function openFridge(g: Game) {
  const have = myMagnets()
  const grid = el('div', 'ic-gallery magnets fridge')
  for (const m of MAGNETS) {
    const owned = have.includes(m.id)
    const tile = el('div', 'ic-tile' + (owned ? ' owned' : ' missing'))
    tile.title = owned ? m.blurb : 'Find it at the Brooklyn Bridge souvenir stand'
    tile.innerHTML = `<div class="ic-tile-pic"><img src="${magnetSrc(m.id)}" alt="" draggable="false"></div><b>${owned ? m.name : '???'}</b><small>${owned ? 'On the fridge' : 'Not yet'}</small>`
    grid.append(tile)
  }
  const home = world.room.id === 'apartment'
  picCard({
    title: 'Your Fridge',
    kicker: `Magnets: ${have.length} of ${MAGNETS.length}`,
    cls: 'gallery',
    text: have.length
      ? 'Every magnet from the Brooklyn Bridge souvenir stand ends up here. The fridge came with the apartment, like the radiator and the mystery stain.'
      : 'A New York fridge isn’t done until it’s covered in magnets. The souvenir stand on the Brooklyn Bridge sells nine.',
    joke: 'Inside: half a halal platter and forty hot sauce packets.',
    extra: grid,
    actions: [
      { label: 'Open the Fridge', act: () => g.say(pick(['Half a halal platter and forty hot sauce packets. Dinner is served.', 'One egg. No idea how old. I’m scared of it.', 'Leftover dumplings! Past me is a hero.'])) },
      ...(home ? [{ label: 'Get More Magnets', note: 'Brooklyn Bridge', act: () => g.goto('brooklyn-bridge') }] : []),
    ],
  })
}

/** Your magnets on the walk-up's fridge (your own place only: a visit shows their fridge, not yours). */
onRoom('apartment', ({ scene }) => {
  if (apartmentHost() !== undefined) return
  const have = myMagnets()
  MAGNETS.filter((m) => have.includes(m.id)).forEach((m, i) => {
    const [x, y] = SLOTS[i % SLOTS.length]
    const img = el('img', 'fridge-magnet') as HTMLImageElement
    img.src = magnetSrc(m.id)
    img.alt = ''
    img.draggable = false
    img.style.cssText = `left:${x}px;top:${y}px;--r:${((i * 37) % 17) - 8}deg`
    scene.append(img)
  })
})
