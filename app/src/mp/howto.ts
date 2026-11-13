import { tile, key, me, icon, sprite } from '../features/gamecard'
import type { MpGameId } from './shared/games'

const MP = '/art/mp/'
/** the Citi Bike with its shadow on the deck (the shadow stays put when the bike hops) */
const bike = () => `<span class="gc-bike-wrap"><i class="gc-shadow"></i>${sprite(MP + 'bike-citibike.png', 'gc-bike')}</span>`

/**
 * How each multiplayer game is played, shown rather than told: a line for its art, and its moves acted out in little
 * tiles (features/gamecard.ts). The game's card and its lobby both use these.
 */
export const HOW: Record<MpGameId, { tagline: string; tiles: () => string[] }> = {
  runner: {
    tagline: 'Last one standing gets a seat on the train.',
    tiles: () => [
      tile(`${me('walk')}`, 'Switch Lanes', key('←') + key('→'), 'gc-lanes gc-platform'),
      tile(`${sprite(MP + 'run-wetfloor.png', 'gc-obstacle')}${me('jump', 0.25)}`, 'Jump', key('↑'), 'gc-hop gc-platform'),
      tile(`${sprite(MP + 'run-sign.png', 'gc-overhead')}${me('walk')}`, 'Slide', key('↓'), 'gc-duck gc-platform'),
      tile(`${sprite(MP + 'run-card.png', 'gc-pickup')}${icon('sparkles', 'gc-spark')}`, 'Grab MetroCards', '', 'gc-grab gc-platform'),
    ],
  },
  sled: {
    tagline: 'Race up the High Line. Mind the tour groups.',
    // each tile is a moment on the real deck: planks rolling by under the bike, its shadow on the ground
    tiles: () => [
      tile(`${sprite(MP + 'bike-planter.png', 'gc-roll', 'animation-delay:-0.2s')}${sprite(MP + 'bike-planter.png', 'gc-roll low', 'animation-delay:-1.3s')}${bike()}`, 'Steer', key('←') + key('→'), 'gc-steer gc-deck'),
      tile(`${sprite(MP + 'bike-rails.png', 'gc-obstacle')}${bike()}`, 'Hop', key('Space', true), 'gc-bunny gc-deck'),
      tile(`${sprite(MP + 'bike-coffee.png', 'gc-pickup')}${icon('sparkles', 'gc-spark')}${bike()}`, 'Iced Coffee Boost', '', 'gc-boost gc-deck'),
    ],
  },
  carbs: {
    tagline: 'Settle it at the table.',
    tiles: () => [
      tile(
        `<svg viewBox="0 0 120 92" aria-hidden="true"><g fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" marker-end="url(#gc-tip)"><path d="M46 22 Q60 12 74 22"/><path d="M88 46 Q92 62 78 74"/><path d="M42 74 Q28 62 32 46"/></g><defs><marker id="gc-tip" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 z" fill="#fff"/></marker></defs></svg>` +
          `${icon('pizza', 'gc-food', 'left:20px;top:12px')}${icon('pretzel', 'gc-food', 'right:20px;top:12px')}${icon('bagel', 'gc-food', 'left:calc(50% - 15px);bottom:6px')}`,
        'Pizza › Pretzel › Bagel › Pizza',
        '',
        'gc-cycle gc-table',
      ),
      tile(`<span class="gc-card" style="left:14%"><i>3</i>${icon('pizza')}</span><span class="gc-vs">vs</span><span class="gc-card win" style="right:14%"><i>7</i>${icon('pizza')}</span>`, 'Same Food? Higher Wins', '', 'gc-tie gc-table'),
      tile(`<span class="gc-card" style="left:10%"><i>2</i>${icon('pizza')}</span><span class="gc-card" style="left:calc(50% - 20px)"><i>5</i>${icon('pretzel')}</span><span class="gc-card" style="right:10%"><i>4</i>${icon('bagel')}</span>`, 'Three to Win', '', 'gc-set gc-table'),
    ],
  },
}
