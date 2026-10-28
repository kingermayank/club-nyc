import type { MiniGame } from './types'

/** Lazy-loaded mini-games. Each lives in src/games/<id>/index.ts and default-exports a MiniGame. */
export const GAMES: Record<string, { title: string; blurb: string; load: () => Promise<{ default: MiniGame }> }> = {
  'slice-factory': { title: 'Slice Factory', blurb: 'Make pizzas to order before they hit the oven.', load: () => import('./slice-factory/index') },
  'halal-rush': { title: 'Halal Rush', blurb: 'Serve the lunch line at the Adel’s Famous Halal Food cart.', load: () => import('./halal-rush/index') },
  'ferry-captain': { title: 'Ferry Captain', blurb: 'Steer the ferry to Liberty Island. Mind the kayaks.', load: () => import('./ferry-captain/index') },
  'bagel-counters': { title: 'Bagel Counters', blurb: 'Catch the coffee delivery. Dodge the pigeons.', load: () => import('./bagel-counters/index') },
  showtime: { title: 'Showtime!', blurb: 'Dance for tips on the subway. Try not to kick a commuter.', load: () => import('./showtime/index') },
}
