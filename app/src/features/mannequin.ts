import './mannequin.css'
import { sfx } from '../audio'
import { ITEM } from '../avatar/items'
import { avatarPortrait } from '../avatar/render'
import { el } from '../engine/stage'
import { save } from '../state'
import type { Game } from '../types'
import { closeUp } from './moments/closeup'
import { sparks } from './moments/kit'

/**
 * A boutique mannequin, up close (art/closeups/<id>.jpg). Every piece it wears is for sale: point at the hat, the
 * shades, the coat, the bag, and it glows along its own outline with a price tag; your New Yorker tries it on in the
 * mirror in the corner; click it to buy (or, if it's yours already, to put it on).
 */
type Pt = [number, number]
interface Piece { item: string; pts: Pt[] }
interface Look { art: string; pieces: Piece[] }

/** pieces later in the list sit on top (the shades over the hat, the bag over the coat) */
const LOOKS: Record<string, Look> = {
  'maison-1': {
    art: 'maison-mannequin-1',
    pieces: [
      { item: 'midnight-gown', pts: [[392, 168], [438, 150], [522, 150], [568, 172], [598, 318], [622, 515], [365, 515], [378, 330]] },
      { item: 'wide-brim', pts: [[342, 92], [380, 62], [420, 14], [500, 2], [560, 22], [600, 62], [620, 92], [560, 110], [430, 112]] },
      { item: 'cat-eye', pts: [[428, 78], [532, 74], [528, 102], [432, 104]] },
      { item: 'diamond-choker', pts: [[452, 144], [508, 144], [506, 166], [454, 166]] },
      { item: 'gold-clutch', pts: [[560, 308], [624, 314], [622, 354], [556, 346]] },
    ],
  },
  'maison-2': {
    art: 'maison-mannequin-2',
    pieces: [
      { item: 'camel-coat', pts: [[396, 136], [448, 124], [530, 124], [586, 146], [612, 330], [585, 490], [370, 490], [350, 330]] },
      { item: 'fedora', pts: [[392, 52], [420, 8], [470, 0], [530, 6], [556, 46], [568, 60], [480, 78], [394, 64]] },
      { item: 'aviators', pts: [[430, 66], [534, 66], [530, 100], [432, 100]] },
      { item: 'silk-scarf', pts: [[452, 122], [526, 122], [522, 152], [510, 246], [490, 246], [470, 160]] },
      { item: 'monogram-tote', pts: [[540, 270], [590, 262], [612, 330], [646, 470], [540, 470]] },
    ],
  },
  'maison-3': {
    art: 'maison-mannequin-3',
    pieces: [
      { item: 'tweed-jacket', pts: [[395, 142], [452, 130], [520, 130], [575, 148], [612, 290], [598, 316], [362, 316], [355, 290]] },
      { item: 'pillbox', pts: [[430, 18], [462, 4], [500, 4], [528, 20], [524, 58], [432, 58]] },
      { item: 'pearls', pts: [[448, 128], [526, 128], [522, 160], [452, 160]] },
      { item: 'mini-trunk', pts: [[560, 340], [602, 332], [652, 360], [648, 438], [562, 438]] },
    ],
  },
  thread: {
    art: 'thread-mannequin',
    pieces: [
      { item: 'windbreaker', pts: [[380, 120], [450, 108], [530, 108], [600, 128], [640, 330], [610, 362], [360, 362], [334, 330]] },
      { item: 'bucket-hat', pts: [[414, 92], [436, 20], [470, 2], [520, 2], [548, 22], [562, 92], [490, 100]] },
      { item: 'sport-shades', pts: [[440, 60], [538, 60], [534, 88], [444, 88]] },
      { item: 'silver-chain', pts: [[450, 128], [526, 128], [520, 168], [456, 168]] },
      { item: 'sling-bag', pts: [[512, 296], [586, 296], [594, 372], [510, 372]] },
    ],
  },
}

const centroid = (pts: Pt[]): Pt => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length]

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
  const showTag = (p: Piece) => {
    const def = ITEM[p.item]
    const [cx] = centroid(p.pts)
    const top = Math.min(...p.pts.map((q) => q[1]))
    const right = cx > 500
    const state = wearing(p.item) ? '<em class="on">Wearing</em>' : owned(p.item) ? '<em class="have">Yours</em>' : `<em><img src="/art/icons/coin.png" alt="">${def.price}</em>`
    tag.innerHTML = `<b>${def.name}</b>${state}`
    // beside the piece, on the side with room
    const x = right ? Math.max(...p.pts.map((q) => q[0])) + 14 : Math.min(...p.pts.map((q) => q[0])) - 14
    tag.style.cssText = `left:${x}px;top:${Math.max(16, top + 4)}px`
    tag.classList.toggle('left', !right)
    tag.hidden = false
  }

  for (const p of look.pieces) {
    if (!ITEM[p.item]) continue
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
    poly.setAttribute('points', p.pts.map((q) => q.join(',')).join(' '))
    poly.classList.add('mq-piece')
    poly.dataset.item = p.item
    svg.append(poly)
    poly.onpointerenter = () => {
      sfx.tick()
      showTag(p)
      tryOn(p.item)
    }
    poly.onpointerleave = () => {
      tag.hidden = true
      tryOn()
    }
    poly.onclick = async () => {
      const item = p.item
      if (!owned(item)) {
        if (!(await g.buy(item))) return
        sfx.register()
        sparks(c.m, centroid(p.pts), 10, '#ffe08a')
        poly.classList.add('bought')
      } else sfx.pop()
      g.wear(item)
      showTag(p)
      tryOn()
      mirror.classList.remove('pop')
      void mirror.offsetWidth
      mirror.classList.add('pop')
    }
  }
}
