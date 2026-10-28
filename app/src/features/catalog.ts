import { sfx } from '../audio'
import { save, bump } from '../state'
import { ITEMS, SHOPS, ITEM, type ItemDef } from '../avatar/items'
import { avatarPortrait, itemIcon } from '../avatar/render'
import { el } from '../engine/stage'
import { openOverlay, closeButton, toast } from '../engine/ui'
import { api } from '../game'

const PER_PAGE = 6
const chevron = (d: string) => `<svg viewBox="0 0 12 12" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const CHEVRON_LEFT = chevron('M8 2 L4 6 L8 10')
const CHEVRON_RIGHT = chevron('M4 2 L8 6 L4 10')

/** Each shop is split into sections, and each shelf in the room opens its own section. */
const SECTIONS: Record<string, { id: string; label: string; has: (i: ItemDef) => boolean }[]> = {
  iloveny: [
    { id: 'tees', label: 'Tees & Hoodies', has: (i) => i.slot === 'body' },
    { id: 'hats', label: 'Hats & Crowns', has: (i) => i.slot === 'head' },
    { id: 'globes', label: 'Snow Globes', has: (i) => i.id.includes('globe') },
    { id: 'toys', label: 'Toy Taxis & Minis', has: (i) => i.id.startsWith('toy-') || i.id === 'teddy' },
    { id: 'balloons', label: 'Balloons', has: (i) => i.id.includes('balloon') },
    { id: 'gifts', label: 'Gifts & Gear', has: (i) => !['body', 'head'].includes(i.slot) && !i.id.includes('globe') && !i.id.startsWith('toy-') && i.id !== 'teddy' && !i.id.includes('balloon') },
  ],
  thread: [
    { id: 'tops', label: 'Tops & Dresses', has: (i) => i.slot === 'body' && !['puffer', 'sig-puffer', 'denim-jacket', 'leather-jacket', 'varsity', 'trench'].includes(i.id) },
    { id: 'jackets', label: 'Jackets & Coats', has: (i) => ['puffer', 'sig-puffer', 'denim-jacket', 'leather-jacket', 'varsity', 'trench'].includes(i.id) },
    { id: 'bottoms', label: 'Denim & Bottoms', has: (i) => i.slot === 'legs' },
    { id: 'accessories', label: 'Accessories', has: (i) => !['body', 'legs'].includes(i.slot) },
  ],
  sneakers: [
    { id: 'kicks', label: 'Sneakers & Shoes', has: (i) => i.slot === 'feet' },
    { id: 'extras', label: 'Extras', has: (i) => i.slot !== 'feet' },
  ],
  maison: [
    { id: 'bags', label: 'Bags', has: (i) => i.slot === 'hand' },
    { id: 'wear', label: 'Ready-to-Wear', has: (i) => i.slot === 'body' || i.slot === 'feet' },
    { id: 'jewelry', label: 'Jewelry & Shades', has: (i) => i.slot === 'neck' || i.slot === 'face' },
  ],
  // Saks Fifth Avenue (shop id 'toys' from its toy-store days): a department store stocked from the other shops' racks
  toys: [
    { id: 'shoes', label: 'The 10022-SHOE Floor', has: (i) => i.slot === 'feet' },
    { id: 'coats', label: 'Coats & Jackets', has: (i) => i.slot === 'body' },
    { id: 'jewelry', label: 'Jewelry & Shades', has: (i) => i.slot === 'neck' || i.slot === 'face' },
  ],
}

/** A Club Penguin–style catalog for a shop: sections, page flips, try-on, buy. */
export function openCatalog(shopId: string, section?: string) {
  const shop = SHOPS[shopId]
  if (!shop) return
  const all = ITEMS.filter((i) => i.shop === shopId || i.alsoAt?.includes(shopId))
  const secs = SECTIONS[shopId]?.filter((s) => all.some(s.has)) ?? []
  let sec = secs.find((s) => s.id === section)?.id ?? 'all'
  let page = 0
  const mag = el('div', `catalog shop-${shopId}`)
  const render = () => {
    const filt = sec === 'all' ? all : all.filter(secs.find((s) => s.id === sec)!.has)
    const pages = Math.max(1, Math.ceil(filt.length / PER_PAGE))
    page = Math.min(page, pages - 1)
    const slice = filt.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)
    const secLabel = secs.find((s) => s.id === sec)?.label
    mag.innerHTML = `
      <div class="cat-cover">
        <div class="cat-masthead">${shop.name}</div>
        <div class="cat-tag">${secLabel ?? shop.tagline}</div>
        <div class="cat-model">${avatarPortrait(save.look)}</div>
        <div class="cat-wallet"><img src="/art/icons/coin.png" alt=""> ${save.coins}</div>
        <div class="cat-trying">Hover an item to try it on</div>
      </div>
      <div class="cat-page">
        ${secs.length > 1 ? '<div class="cat-tabs"></div>' : ''}
        <div class="cat-grid"></div>
        <div class="cat-foot"><button class="btn small ghost cat-flip prev${page === 0 ? ' gone' : ''}" ${page === 0 ? 'disabled aria-hidden="true" tabindex="-1"' : 'aria-label="Previous page"'}>${CHEVRON_LEFT}Back</button><span>Page ${page + 1} of ${pages}</span><button class="btn small ghost cat-flip next${page >= pages - 1 ? ' gone' : ''}" ${page >= pages - 1 ? 'disabled aria-hidden="true" tabindex="-1"' : 'aria-label="Next page"'}>Next${CHEVRON_RIGHT}</button></div>
      </div>`
    const tabs = mag.querySelector('.cat-tabs')
    if (tabs) {
      for (const t of [{ id: 'all', label: 'All' }, ...secs]) {
        const b = el('button', 'cat-tab' + (t.id === sec ? ' on' : ''), t.label)
        b.onclick = () => {
          sfx.click()
          sec = t.id
          page = 0
          render()
        }
        tabs.append(b)
      }
    }
    const grid = mag.querySelector('.cat-grid')!
    for (const it of slice) {
      const owned = save.owned.includes(it.id)
      const card = el('div', 'cat-item' + (owned ? ' owned' : ''))
      card.innerHTML = `<div class="cat-icon">${itemIcon(it.id, save.look.color)}</div><b>${it.name}</b>`
      const btn = el('button', 'btn small', owned ? 'Wear' : `<img src="/art/icons/coin.png" alt=""> ${it.price}`)
      btn.onclick = async () => {
        if (owned) {
          api.wear(it.id)
          sfx.pop()
          toast(`Wearing ${it.name}`, '✨')
          render()
          return
        }
        if (save.coins < it.price) {
          toast('Not enough coins. Try a job around town!', '🪙')
          return
        }
        btn.disabled = true
        const ok = await api.buy(it.id)
        btn.disabled = false
        if (!ok) return
        sfx.register()
        bump('buys')
        api.wear(it.id)
        if (shopId === 'maison') api.stamp('big-spender')
        toast(`Bought ${it.name}!`, '🛍️')
        render()
      }
      card.onmouseenter = () => {
        const m = mag.querySelector('.cat-model')
        if (m) m.innerHTML = avatarPortrait({ ...save.look, items: { ...save.look.items, [it.slot]: it.id } })
        const t = mag.querySelector('.cat-trying')
        if (t) t.innerHTML = `Trying on: <b>${it.name}</b>`
      }
      card.append(btn)
      grid.append(card)
    }
    mag.querySelector<HTMLButtonElement>('.prev')!.onclick = () => {
      sfx.whoosh()
      page = Math.max(0, page - 1)
      render()
    }
    mag.querySelector<HTMLButtonElement>('.next')!.onclick = () => {
      sfx.whoosh()
      page = Math.min(pages - 1, page + 1)
      render()
    }
    mag.append(closeButton())
  }
  render()
  sfx.whoosh()
  openOverlay(mag)
}

export { ITEM }
