import './mannequin.css'
import { sfx } from '../audio'
import { ITEM } from '../avatar/items'
import { avatarPortrait } from '../avatar/render'
import { el } from '../engine/stage'
import { save } from '../state'
import TRACED from '../data/mannequins.json'
import type { Game } from '../types'
import { closeUp } from './moments/closeup'
import { sparks } from './moments/kit'

/**
 * A boutique mannequin, up close (art/closeups/<id>.jpg). Every piece it wears is for sale: point at the hat, the
 * shades, the coat, the bag, and it glows along its own outline with a price tag; your New Yorker tries it on in the
 * mirror in the corner; click it to pick it, and its tag grows a Buy button (or Wear, if it's yours already).
 */
type Pt = [number, number]
/** `d` is the piece's own outline, traced from the painting (tools/mannequin_trace.py); `box` is its bounds */
interface Piece { item: string; d: string; box: [number, number, number, number] }
interface Look { art: string; pieces: Piece[] }

/** pieces later in the list sit on top (the shades over the hat, the bag over the coat) */
const LOOKS = TRACED as unknown as Record<string, Look>

const centre = (p: Piece): Pt => [(p.box[0] + p.box[2]) / 2, (p.box[1] + p.box[3]) / 2]

export function mannequin(g: Game, id: string) {
  const look = LOOKS[id]
  if (!look) return
  const c = closeUp('cu-mannequin', `/art/closeups/${look.art}.jpg`)
  const layer = c.layer
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 1000 565.5')
  svg.classList.add('mq-shapes')
  layer.append(svg)
  const tag = el('div', 'mq-tag')
  tag.hidden = true
  const mirror = el('div', 'mq-mirror', `<div class="mq-you"></div><span>Try it on</span>`)
  layer.append(tag, mirror)
  const you = mirror.querySelector<HTMLElement>('.mq-you')!

  /** your New Yorker in the mirror, wearing whatever you point at */
  const tryOn = (item?: string) => {
    const l = { ...save.look, items: { ...save.look.items } }
    if (item) l.items[ITEM[item].slot] = item
    you.innerHTML = avatarPortrait(l, item ? 'grin' : 'smile')
  }
  tryOn()

  const owned = (item: string) => save.owned.includes(item)
  const wearing = (item: string) => save.look.items[ITEM[item].slot] === item
  /** the piece you clicked: its tag stays up with a Buy (or Wear) button. Buying is its own click, never the first one. */
  let picked: Piece | null = null
  const polys = new Map<Piece, SVGPathElement>()
  const showTag = (p: Piece) => {
    const def = ITEM[p.item]
    const [cx] = centre(p)
    const top = p.box[1]
    const right = cx > 500
    const state = wearing(p.item) ? '<em class="on">Wearing</em>' : owned(p.item) ? '<em class="have">Yours</em>' : `<em><img src="/art/icons/coin.png" alt="">${def.price}</em>`
    // (picked and not yours yet: the price is on the Buy button)
    tag.innerHTML = `<b>${def.name}</b>${p === picked && !owned(p.item) ? '' : state}`
    // beside the piece, on the side with room
    const x = right ? p.box[2] + 14 : p.box[0] - 14
    tag.style.cssText = `left:${x}px;top:${Math.max(16, top + 4)}px`
    tag.classList.toggle('left', !right)
    tag.classList.toggle('pick', p === picked)
    tag.hidden = false
    if (p !== picked || wearing(p.item)) return
    const btn = el('button', 'btn small go mq-buy', owned(p.item) ? 'Wear' : `Buy <img src="/art/icons/coin.png" alt=""> ${def.price}`) as HTMLButtonElement
    btn.type = 'button'
    btn.onclick = (e) => {
      e.stopPropagation()
      void take(p, btn)
    }
    tag.append(btn)
  }
  const take = async (p: Piece, btn: HTMLButtonElement) => {
    const item = p.item
    const def = ITEM[item]
    if (!owned(item)) {
      if (save.coins < def.price) return g.toast('Not enough coins. Try a job around town!', '🪙')
      btn.disabled = true
      if (!(await g.buy(item))) return void (btn.disabled = false)
      sfx.register()
      sparks(c.m, centre(p), 10, '#ffe08a')
      polys.get(p)?.classList.add('bought')
      g.toast(`Bought ${def.name}!`, '🛍️')
    } else {
      sfx.pop()
      g.toast(`Wearing ${def.name}`, '✨')
    }
    g.wear(item)
    showTag(p)
    tryOn()
    mirror.classList.remove('pop')
    void mirror.offsetWidth
    mirror.classList.add('pop')
  }
  const pick = (p: Piece | null) => {
    picked = p
    for (const [q, poly] of polys) poly.classList.toggle('picked', q === p)
    if (p) {
      showTag(p)
      tryOn(p.item)
    } else {
      tag.hidden = true
      tryOn()
    }
  }
  // a click on the picture (not on a piece or its tag) puts the piece back
  layer.addEventListener('click', (e) => {
    if (picked && !(e.target as Element).closest('.mq-piece, .mq-tag')) pick(null)
  })

  for (const p of look.pieces) {
    if (!ITEM[p.item]) continue
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    poly.setAttribute('d', p.d)
    poly.setAttribute('fill-rule', 'evenodd')
    poly.classList.add('mq-piece')
    poly.dataset.item = p.item
    svg.append(poly)
    polys.set(p, poly)
    poly.onpointerenter = () => {
      if (p === picked) return
      sfx.tick()
      showTag(p)
      tryOn(p.item)
    }
    poly.onpointerleave = () => {
      if (p === picked) return
      // back to the piece you picked, if there is one
      if (picked) {
        showTag(picked)
        tryOn(picked.item)
      } else {
        tag.hidden = true
        tryOn()
      }
    }
    poly.onclick = () => {
      sfx.click()
      pick(p)
    }
  }
}
