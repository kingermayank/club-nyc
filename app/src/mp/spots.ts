/**
 * The games live somewhere in the city: a High Line signpost with a Citi Bike parked against it for the Citi Bike
 * Dash (the game was a Central Park sled race until there was no snow) and the Carb-Jitsu board by the window table at
 * 99¢ Slice. Rush Hour Run has no sign: the Pizza Rat on the Times Sq platform challenges you (features/subwayLife.ts).
 * Each is drawn by this module when its room is built (world.onRoom, so rooms.ts stays untouched): click it to walk
 * over and open the game's card. While you're in the room it shows who's waiting.
 */
import { onRoom, walkTo, world } from '../engine/world'
import { el } from '../engine/stage'
import { ui } from '../engine/ui'
import { sfx } from '../audio'
import { link } from '../net/link'
import type { Pt } from '../geometry'
import { MP_GAMES, type MpGameId } from './shared/games'

interface Spot {
  room: string
  game: MpGameId
  /** where the sign stands (its base) and where you walk to use it */
  at: Pt
  walk: Pt
  svg: string
  w: number
  h: number
}

const INK = '#1d2140'
const T = (x: number, y: number, size: number, text: string, fill: string, extra = '') =>
  `<text x="${x}" y="${y}" font-family="'Burbank Display', 'Lilita One', sans-serif" font-size="${size}" fill="${fill}" text-anchor="middle" ${extra}>${text}</text>`

/** a High Line signpost (dark steel, like the park's own signs) with a Citi Bike parked against it; the blue panel
 * nods to Citi Bike (a parody "city bike" wordmark with the red arc) with a little red DASH tag */
const BIKE_SIGN = `<svg width="118" height="136" viewBox="0 0 118 136">
  <ellipse cx="58" cy="132" rx="48" ry="5" fill="rgba(29,33,64,.22)"/>
  <rect x="26" y="26" width="10" height="106" rx="2.5" fill="#4a505c" stroke="${INK}" stroke-width="3.5"/>
  <rect x="4" y="7" width="94" height="25" rx="4" fill="#2f3440" stroke="${INK}" stroke-width="3.5"/>
  ${T(51, 24.5, 11.5, 'THE HIGH LINE', '#fff', 'textLength="76" lengthAdjust="spacingAndGlyphs"')}
  <rect x="2" y="38" width="98" height="30" rx="6" fill="#0b4ea2" stroke="${INK}" stroke-width="3.5"/>
  <path d="M10.5 50 Q 21 39.5 31.5 50" fill="none" stroke="#e3262b" stroke-width="3" stroke-linecap="round"/>
  <text x="8" y="62" font-family="Helvetica, Arial, sans-serif" font-weight="700" font-size="15" fill="#fff" textLength="56" lengthAdjust="spacingAndGlyphs">city bike</text>
  <rect x="67" y="45" width="29" height="17" rx="4" fill="#e3262b" stroke="${INK}" stroke-width="2"/>
  ${T(81.5, 58, 11, 'DASH', '#fff', 'textLength="21" lengthAdjust="spacingAndGlyphs"')}
  <image href="/art/mp/bike-citibike.png" x="54" y="68" width="60" height="68"/>
</svg>`

/** a chalkboard menu stand by the window table */
const CARBS_SIGN = `<svg width="86" height="114" viewBox="0 0 86 114">
  <ellipse cx="43" cy="110" rx="34" ry="5" fill="rgba(29,33,64,.22)"/>
  <path d="M14 108 L24 8 H62 L72 108" fill="none" stroke="#2f6b3a" stroke-width="5" stroke-linecap="round"/>
  <rect x="8" y="10" width="70" height="82" rx="6" fill="#2b3a35" stroke="#2f6b3a" stroke-width="5"/>
  <rect x="8" y="10" width="70" height="82" rx="6" fill="none" stroke="${INK}" stroke-width="2.5"/>
  ${T(43, 29, 13, 'CARB-JITSU', '#ffd166', 'textLength="60" lengthAdjust="spacingAndGlyphs"')}
  ${T(43, 41, 8, 'TONIGHT AT THE TABLE', '#fff8e0', 'opacity=".9" textLength="60" lengthAdjust="spacingAndGlyphs"')}
  <image href="/art/mp/card-pizza.png" x="13" y="48" width="18" height="21"/>
  <image href="/art/mp/card-pretzel.png" x="34" y="50" width="20" height="18"/>
  <image href="/art/mp/card-bagel.png" x="56" y="50" width="20" height="18"/>
  <path d="M30 59 l4 0 M52 59 l4 0" stroke="#fff8e0" stroke-width="2" stroke-linecap="round"/>
  <path d="M31 56 l3 3 l-3 3 M53 56 l3 3 l-3 3" fill="none" stroke="#fff8e0" stroke-width="2" stroke-linecap="round"/>
  ${T(43, 86, 8, 'WINNER STAYS', '#fff8e0', 'opacity=".85" textLength="60" lengthAdjust="spacingAndGlyphs"')}
</svg>`

const SPOTS: Spot[] = [
  { room: 'high-line', game: 'sled', at: [292, 352], walk: [336, 382], svg: BIKE_SIGN, w: 118, h: 136 },
  { room: 'pizza', game: 'carbs', at: [306, 348], walk: [300, 372], svg: CARBS_SIGN, w: 86, h: 114 },
]

let poll = 0
for (const s of SPOTS) {
  onRoom(s.room, ({ scene }) => {
    const def = MP_GAMES[s.game]
    const b = el('button', 'mp-spot', s.svg) as HTMLButtonElement
    b.setAttribute('aria-label', def.title)
    b.style.left = `${s.at[0]}px`
    b.style.top = `${s.at[1]}px`
    b.style.zIndex = String(Math.round(s.at[1] * 10))
    const tip = el('span', 'mp-spot-live')
    tip.hidden = true
    b.append(tip)
    b.onmouseenter = () => {
      if (!tip.dataset.live) {
        tip.hidden = false
        tip.innerHTML = `${def.short}`
      }
    }
    b.onmouseleave = () => {
      if (!tip.dataset.live) tip.hidden = true
    }
    b.onclick = (e) => {
      e.stopPropagation()
      if (ui.busy) return
      sfx.click()
      walkTo(world.nav ? world.nav.nearest(s.walk) : s.walk, () => {
        if (world.room.id !== s.room) return
        void import('./hub').then((m) => m.openGameCard(s.game))
      })
    }
    scene.append(b)
    // who's waiting (only while you're here, and only online)
    const refresh = async () => {
      if (!b.isConnected || !link.account) return
      const { fetchHub } = await import('./hub')
      const hub = await fetchHub(8000)
      const h = hub?.games[s.game]
      if (!b.isConnected) return
      const live = h ? (h.waiting ? `${h.waiting} waiting` : h.playing ? `${h.playing} playing` : '') : ''
      tip.dataset.live = live
      tip.hidden = !live
      tip.innerHTML = live ? `<i></i>${live}` : ''
    }
    void refresh()
    clearInterval(poll)
    poll = window.setInterval(() => void refresh(), 10_000)
    return () => {
      clearInterval(poll)
      b.remove()
    }
  })
}
