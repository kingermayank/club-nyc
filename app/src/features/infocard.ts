import './infocard.css'
import { sfx } from '../audio'
import { el, stage } from '../engine/stage'
import { openOverlay, closeOverlay, closeButton } from '../engine/ui'

/**
 * Picture info cards: what clicking a landmark, a cart or a statue in a room shows. A picture of the thing itself
 * (its traced cutout, or a crop of the room art), a short real history, one funny line, and (most of the time)
 * something to DO: buy it, sit with it, take a photo, make a tiny choice. Never just a bare label.
 *
 *   picCard({ title: 'Bow Bridge', kicker: 'Central Park · 1862', pic: cut('central-park', 'bridge'),
 *             text: 'A cast-iron bridge…', joke: 'The most-proposed-on spot…', actions: [{ label: 'Pop the Question', act }] })
 */
export type Pic =
  /** a traced cutout: /art/cutouts/<room>/<obj>.png, drawn on a soft backdrop */
  | { cut: string; obj: string; backdrop?: string }
  /** a crop of a room background, in the room's logical 1000 × 565 coordinates: [x, y, w, h] */
  | { room: string; rect: [number, number, number, number] }
  /** any picture */
  | { src: string; fit?: 'cover' | 'contain'; backdrop?: string }

export const cut = (room: string, obj: string, backdrop?: string): Pic => ({ cut: room, obj, backdrop })
export const crop = (room: string, rect: [number, number, number, number]): Pic => ({ room, rect })

export interface CardAction {
  /** Title Case ("Buy a Pretzel (2)") */
  label: string
  /** a short sentence-case note under the label */
  note?: string
  /** the green "do this" button */
  primary?: boolean
  /** keep the card open after the action runs (default: close it first) */
  stay?: boolean
  act: () => void | Promise<void>
}

export interface PicCardOpts {
  title: string
  /** small line above the title: where / when ("Central Park · Since 1862") */
  kicker?: string
  pic?: Pic
  /** a little label stuck under the picture */
  caption?: string
  /** the real history, a sentence or three (may contain <b>) */
  text: string
  /** one funny line, shown as a speech bubble */
  joke?: string
  /** tiny fact chips ("1,776 feet", "Opened 2014") */
  facts?: string[]
  actions?: CardAction[]
  /** a calm, joke-free card (the 9/11 Memorial) */
  quiet?: boolean
  /** extra class on the card */
  cls?: string
  /** something living under the text (a gallery, a ticker): appended after the joke */
  extra?: HTMLElement
}

const ROOM_W = 1000
const ROOM_H = 565

function picHtml(p: Pic): string {
  if ('cut' in p) {
    const bg = p.backdrop ?? 'linear-gradient(170deg, #bfe6ff, #fff4d6)'
    return `<div class="ic-pic is-cut" style="background:${bg}"><img src="/art/cutouts/${p.cut}/${p.obj}.png" alt="" draggable="false"></div>`
  }
  if ('room' in p) {
    const [x, y, w, h] = p.rect
    // background-size scales the whole room so the crop fills the frame; position picks the crop
    const sx = (ROOM_W / w) * 100
    const px = w >= ROOM_W ? 0 : (x / (ROOM_W - w)) * 100
    const py = h >= ROOM_H ? 0 : (y / (ROOM_H - h)) * 100
    return `<div class="ic-pic is-crop" style="aspect-ratio:${(w / h).toFixed(3)};background-image:url('/art/rooms/${p.room}.jpg');background-size:${sx.toFixed(2)}% auto;background-position:${px.toFixed(2)}% ${py.toFixed(2)}%"></div>`
  }
  const bg = p.backdrop ?? 'linear-gradient(170deg, #bfe6ff, #fff4d6)'
  return `<div class="ic-pic is-src${p.fit === 'cover' ? ' cover' : ''}" style="background:${bg}"><img src="${p.src}" alt="" draggable="false"></div>`
}

/** Open a picture card. Returns the card element (so a caller can update it live). */
export function picCard(o: PicCardOpts): HTMLElement {
  const card = el('div', 'panel ic-card' + (o.quiet ? ' quiet' : '') + (o.pic ? '' : ' no-pic') + (o.cls ? ' ' + o.cls : ''))
  const left = o.pic
    ? `<figure class="ic-frame">${picHtml(o.pic)}${o.caption ? `<figcaption>${o.caption}</figcaption>` : ''}</figure>`
    : ''
  card.innerHTML = `${left}<div class="ic-body">
      ${o.kicker ? `<div class="ic-kicker">${o.kicker}</div>` : ''}
      <h2>${o.title}</h2>
      <p class="ic-text">${o.text}</p>
      ${o.facts?.length ? `<div class="ic-facts">${o.facts.map((f) => `<span>${f}</span>`).join('')}</div>` : ''}
      ${o.joke && !o.quiet ? `<div class="ic-joke"><img class="ic-joke-who" src="/art/icons/e/pigeon.png" alt="" draggable="false"><span>${o.joke}</span></div>` : ''}
      <div class="ic-actions"></div>
    </div>`
  const body = card.querySelector<HTMLElement>('.ic-body')!
  if (o.extra) body.insertBefore(o.extra, body.querySelector('.ic-actions'))
  const bar = card.querySelector<HTMLElement>('.ic-actions')!
  const actions = o.actions ?? []
  for (const a of actions) {
    const b = el('button', 'btn small' + (a.primary ? ' go' : actions.length > 1 ? ' ghost' : ''), a.label + (a.note ? `<small>${a.note}</small>` : ''))
    if (a.note) b.classList.add('has-note')
    b.onclick = async () => {
      sfx.click()
      if (!a.stay) closeOverlay()
      await a.act()
    }
    bar.append(b)
  }
  if (!actions.length) {
    const ok = el('button', 'btn small ghost', o.quiet ? 'Close' : 'Got It')
    ok.onclick = () => {
      sfx.click()
      closeOverlay()
    }
    bar.append(ok)
  }
  card.append(closeButton())
  openOverlay(card)
  return card
}

/** A quick camera flash over the whole stage (for "Take a Photo" actions). */
export function flash() {
  const f = el('div', 'ic-flash')
  stage.root.append(f)
  setTimeout(() => f.remove(), 700)
}
