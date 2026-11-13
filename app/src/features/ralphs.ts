import './ralphs.css'
import { sfx } from '../audio'
import { ITEM } from '../avatar/items'
import { itemIcon } from '../avatar/render'
import { el } from '../engine/stage'
import { closeButton, closeOverlay, openOverlay } from '../engine/ui'

/**
 * Starducks Coffee's counter: the green menu board over the barista, the way you order in the real café. Pick what
 * you want (coffee in the green cup, a cookie, a croissant) and it's yours; the caller (data/rooms.ts) rings it up
 * and hands it over, so prices and "Belly Full" stay in one place. Resolves with the item id, 'work' for the
 * delivery job, or null.
 */
const MENU: { title: string; ids: string[] }[] = [
  { title: 'Coffee', ids: ['ralphs-coffee', 'latte', 'cold-brew', 'coffee'] },
  { title: 'Bakery', ids: ['cookie', 'black-white', 'croissant', 'bagel'] },
]
/** what the board says under each name (2 to 4 words) */
const NOTE: Record<string, string> = {
  'ralphs-coffee': 'The green cup',
  latte: 'Your name, nearly',
  'cold-brew': 'Steeped all night',
  coffee: 'The blue deli cup',
  cookie: 'Big as your hand',
  'black-white': 'Half and half',
  croissant: 'Flaky, warm',
  bagel: 'Untoasted, please',
}

interface Board { cls?: string; title: string; sub: string; menu: { title: string; ids: string[] }[]; note: Record<string, string>; extra?: { label: string; value: string } }

/** A menu board over a counter. Resolves with the item id, the extra button's value, or null. */
function menuBoard(b: Board): Promise<string | null> {
  return new Promise((resolve) => {
    let done = false
    const finish = (v: string | null) => {
      if (done) return
      done = true
      closeOverlay()
      resolve(v)
    }
    const box = el('div', 'panel ralphs' + (b.cls ? ' ' + b.cls : ''))
    box.innerHTML = `<div class="rc-head"><b>${b.title}</b><span>${b.sub}</span></div>
      ${b.menu.map((sec) => `<div class="rc-sec"><h3>${sec.title}</h3><div class="rc-items">${sec.ids
        .filter((id) => ITEM[id])
        .map((id) => `<button class="rc-item" type="button" data-id="${id}"><span class="rc-icon">${itemIcon(id)}</span><b>${ITEM[id].name}</b><small>${b.note[id] ?? ''}</small><i>${ITEM[id].price}</i></button>`)
        .join('')}</div></div>`).join('')}
      ${b.extra ? `<button class="btn tiny ghost rc-work" type="button">${b.extra.label}</button>` : ''}`
    box.querySelectorAll<HTMLButtonElement>('.rc-item').forEach((btn) => {
      btn.onclick = () => {
        sfx.click()
        finish(btn.dataset.id!)
      }
    })
    const extra = box.querySelector<HTMLButtonElement>('.rc-work')
    if (extra) extra.onclick = () => finish(b.extra!.value)
    box.append(closeButton(() => finish(null)))
    openOverlay(box, { onClose: () => finish(null) })
  })
}

export const ralphsMenu = () => menuBoard({ title: 'Starducks Coffee', sub: 'Order at the counter', menu: MENU, note: NOTE, extra: { label: 'Help with the Delivery', value: 'work' } })

/**
 * Cloud Nine Café, Sky Deck 102: the same kind of board, in the deck's dusk colors. Three cups and three things to
 * eat with them; 'sit' takes a stool at the counter.
 */
export const cloudNineMenu = () =>
  menuBoard({
    cls: 'cloud9',
    title: 'Cloud Nine Café',
    sub: '1,250 feet up',
    menu: [
      { title: 'Hot Cups', ids: ['cocoa', 'coffee', 'latte'] },
      { title: 'With a View', ids: ['cookie', 'croissant', 'pretzel'] },
    ],
    note: { cocoa: 'Above the clouds', coffee: 'Highest cup in town', latte: 'Foam like cumulus', cookie: 'Big as your hand', croissant: 'Flaky, warm', pretzel: 'Salted at altitude' },
    extra: { label: 'Sit at the Counter', value: 'sit' },
  })

/** The Boathouse Café's board, Central Park: something warm for the lake. */
export const boathouseMenu = () =>
  menuBoard({
    cls: 'boathouse',
    title: 'Boathouse Café',
    sub: 'On the lake since 1954',
    menu: [{ title: 'To Go', ids: ['cocoa', 'coffee', 'pretzel'] }],
    note: { cocoa: 'By the lake', coffee: 'The blue deli cup', pretzel: 'Warm, with mustard' },
  })

/** The coffee and pretzel cart on One World Trade's plaza: its menu, under the striped umbrella. */
export const plazaCartMenu = () =>
  menuBoard({
    cls: 'cart',
    title: 'Coffee & Pretzels',
    sub: 'One World Trade Plaza',
    menu: [{ title: 'From the Cart', ids: ['coffee', 'pretzel'] }],
    note: { coffee: 'The blue deli cup', pretzel: 'Warm, with mustard' },
    extra: { label: 'Sit with It', value: 'sit' },
  })

/** The pretzel cart in Central Park: its own board under the striped awning, every twist the cart does. */
export const pretzelCartMenu = () =>
  menuBoard({
    cls: 'pretzel-cart',
    title: 'Pretzel Cart',
    sub: 'Twisted by hand',
    menu: [
      { title: 'Pretzels', ids: ['pretzel', 'pretzel-mustard', 'pretzel-cinnamon', 'pretzel-everything'] },
      { title: 'Warm Up', ids: ['cocoa', 'coffee'] },
    ],
    note: { pretzel: 'Salt, nothing else', 'pretzel-mustard': 'The New York way', 'pretzel-cinnamon': 'Sweet and warm', 'pretzel-everything': 'Like the bagel', cocoa: 'For cold hands', coffee: 'The blue deli cup' },
  })
