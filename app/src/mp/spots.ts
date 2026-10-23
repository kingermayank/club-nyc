/**
 * The games live somewhere in the city: a signpost to Pilgrim Hill at the east edge of Central Park, a chalkboard
 * for Rush Hour Run on the Times Square platform, and the Carb-Jitsu board by the window table at the 99¢ Slice.
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

/** a wooden signpost with an arrow plank, a snowy sled leaning on it */
const SLED_SIGN = `<svg width="104" height="132" viewBox="0 0 104 132">
  <ellipse cx="52" cy="128" rx="40" ry="5" fill="rgba(29,33,64,.22)"/>
  <rect x="46" y="30" width="12" height="98" rx="3" fill="#9a6435" stroke="${INK}" stroke-width="3.5"/>
  <path d="M3 18 H88 L101 32 L88 46 H3 Z" fill="#c98a4b" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>
  <path d="M7 21 H86" stroke="#e0a868" stroke-width="3" stroke-linecap="round"/>
  ${T(47, 37.5, 12.5, 'PILGRIM HILL', '#3b2210', 'textLength="78" lengthAdjust="spacingAndGlyphs"')}
  <path d="M2 18 Q 28 9 58 15 Q 80 11 90 18" fill="#fff" stroke="${INK}" stroke-width="2.5"/>
  <rect x="14" y="54" width="76" height="26" rx="6" fill="#e5483b" stroke="${INK}" stroke-width="3.5"/>
  ${T(52, 72.5, 13, 'SLED RACE', '#fff', 'textLength="62" lengthAdjust="spacingAndGlyphs"')}
  <g transform="translate(8 92) rotate(-24)">
    <rect x="0" y="10" width="44" height="11" rx="5" fill="#e5483b" stroke="${INK}" stroke-width="3"/>
    <path d="M2 24 H40 Q 48 24 47 16" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <path d="M-3 12 Q -9 8 -4 2" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
  </g>
  <path d="M60 124 q 10 -9 22 0 q 9 -6 16 2 z" fill="#fff" stroke="${INK}" stroke-width="2.5"/>
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
  { room: 'central-park', game: 'sled', at: [352, 478], walk: [392, 486], svg: SLED_SIGN, w: 104, h: 132 },
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
