/**
 * The games live somewhere in the city: a High Line signpost with a Citi Bike parked against it for the Citi Bike
 * Dash (the game was a Central Park sled race until there was no snow), a chalkboard for Rush Hour Run on the Times
 * Square platform, and the Carb-Jitsu board by the window table at Joe’s Pizza.
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

/** a High Line signpost (dark steel, like the park's own signs) with a Citi Bike parked against it */
const BIKE_SIGN = `<svg width="118" height="136" viewBox="0 0 118 136">
  <ellipse cx="58" cy="132" rx="48" ry="5" fill="rgba(29,33,64,.22)"/>
  <rect x="26" y="26" width="10" height="106" rx="2.5" fill="#4a505c" stroke="${INK}" stroke-width="3.5"/>
  <rect x="4" y="7" width="94" height="25" rx="4" fill="#2f3440" stroke="${INK}" stroke-width="3.5"/>
  ${T(51, 24.5, 11.5, 'THE HIGH LINE', '#fff', 'textLength="76" lengthAdjust="spacingAndGlyphs"')}
  <rect x="2" y="38" width="98" height="30" rx="6" fill="#1f6fd1" stroke="${INK}" stroke-width="3.5"/>
  <path d="M7 42 H95" stroke="#5aa0f0" stroke-width="3" stroke-linecap="round"/>
  ${T(51, 59, 13.5, 'CITI BIKE DASH', '#fff', 'textLength="82" lengthAdjust="spacingAndGlyphs"')}
  <image href="/art/mp/bike-citibike.png" x="54" y="68" width="60" height="68"/>
</svg>`

/** a chalkboard A-frame on the platform */
const RUN_SIGN = `<svg width="86" height="112" viewBox="0 0 86 112">
  <ellipse cx="43" cy="108" rx="34" ry="5" fill="rgba(29,33,64,.22)"/>
  <path d="M14 106 L24 8 H62 L72 106" fill="none" stroke="#7a4a22" stroke-width="5" stroke-linecap="round"/>
  <rect x="9" y="12" width="68" height="78" rx="6" fill="#2b3a35" stroke="#8a5428" stroke-width="5"/>
  <rect x="9" y="12" width="68" height="78" rx="6" fill="none" stroke="${INK}" stroke-width="2.5"/>
  ${T(43, 32, 12.5, 'RUSH HOUR', '#fff8e0', 'textLength="58" lengthAdjust="spacingAndGlyphs"')}
  ${T(43, 46, 15, 'RUN!', '#ffd166')}
  <g fill="none" stroke="#fff8e0" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="30" cy="56" r="3.4"/>
    <path d="M30 60 L28 70 L22 76 M28 70 L34 78 M29 63 L23 66 M29 63 L36 61"/>
    <path d="M42 70 h22 M46 64 h16 M50 76 h12" stroke="#9fd3ff" stroke-width="2"/>
  </g>
  ${T(43, 86, 8.5, '2 TO 9 PLAYERS', '#fff8e0', 'opacity=".85" textLength="56" lengthAdjust="spacingAndGlyphs"')}
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
  ${T(43, 86, 8, '1V1 · WINNER STAYS', '#fff8e0', 'opacity=".85" textLength="60" lengthAdjust="spacingAndGlyphs"')}
</svg>`

const SPOTS: Spot[] = [
  { room: 'high-line', game: 'sled', at: [292, 352], walk: [336, 382], svg: BIKE_SIGN, w: 118, h: 136 },
  { room: 'subway', game: 'runner', at: [612, 410], walk: [590, 430], svg: RUN_SIGN, w: 86, h: 112 },
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
