/** Ledger reason codes (server/src/economy.ts, the game's api.spend reasons) in people words, with where it happened. */
import { ITEM } from '../../avatar/items'
import { HOME } from '../../data/homes'
import { ipoBySym } from '../../data/stocks'

export interface Line {
  what: string
  where?: string
  icon: string
}
const R: Record<string, Line> = {
  start: { what: 'Starting coins', icon: '🗽' },
  daily: { what: 'Subway card refill', icon: '🎫' },
  quest: { what: 'New in Town', icon: '🗽' },
  'daily-quest': { what: 'City challenge', icon: '⭐' },
  'daily-quests-done': { what: 'All challenges done', icon: '⭐' },
  'stamp-bonus': { what: 'Stamp bonus', icon: '🏅' },
  'dance-jam': { what: 'Dance Jam tips', where: 'Times Square', icon: '🕺' },
  'party-host': { what: 'Threw a party', where: 'Home', icon: '🎉' },
  coin: { what: 'Found a coin', icon: '🪙' },
  challenge: { what: 'Won a challenge', icon: '🏆' },
  'team-week': { what: 'Team prize', icon: '🏆' },
  'golden-gumball': { what: 'Golden gumball', icon: '🍬' },
  'candy-hunt': { what: 'Candy hunt', icon: '🍬' },
  job: { what: 'Shift pay', icon: '💼' },
  'mp-game': { what: 'Game prize', icon: '🎮' },
  'level-up': { what: 'Level up bonus', icon: '⭐' },
  referral: { what: 'A friend joined', icon: '💌' },
  'referral-welcome': { what: 'Welcome gift', icon: '💌' },
  'theater-ticket': { what: 'Broadway ticket', where: 'Times Square', icon: '🎭' },
  'busker-tip': { what: 'Tipped a busker', where: 'Subway', icon: '🎷' },
  rowboat: { what: 'Rowboat', where: 'Central Park', icon: '🚣' },
  'carriage-ride': { what: 'Carriage ride', where: 'Central Park', icon: '🐴' },
  'ferry-ticket': { what: 'Ferry ticket', where: 'Battery Park', icon: '⛴️' },
  'cm-tacos': { what: 'Tacos', where: 'Chelsea Market', icon: '🌮' },
  'cm-doughnuts': { what: 'Doughnuts', where: 'Chelsea Market', icon: '🍩' },
  'cm-book': { what: 'A book', where: 'Chelsea Market', icon: '📖' },
  'cm-oysters': { what: 'Oysters', where: 'Chelsea Market', icon: '🦪' },
  'cm-lobster-roll': { what: 'Lobster roll', where: 'Chelsea Market', icon: '🦞' },
  'jumbo-dog': { what: 'Jumbo hot dog', where: 'Hot dog cart', icon: '🌭' },
  'hotdog-cart': { what: 'Hot dog', where: 'Hot dog cart', icon: '🌭' },
  'pretzel-cart': { what: 'Pretzel', where: 'Pretzel cart', icon: '🥨' },
  slice: { what: 'Pizza slice', where: '99¢ Slice', icon: '🍕' },
  'dim-sum': { what: 'Dim sum', where: 'Chinatown', icon: '🥟' },
  wish: { what: 'Made a wish', icon: '⛲' },
  lovelock: { what: 'Love lock', where: 'Brooklyn Bridge', icon: '🔒' },
  'gift-in': { what: 'From a friend', icon: '🤝' },
  'gift-out': { what: 'To a friend', icon: '🤝' },
}

export function lineFor(reason: string): Line {
  if (R[reason]) return R[reason]
  const [kind, id] = reason.split(':')
  if (kind === 'item') return { what: ITEM[id]?.name ?? 'Clothes', where: 'Shopping', icon: '🛍️' }
  if (kind === 'home') return { what: HOME[id]?.name ?? 'A new home', where: 'StreetCheesy', icon: '🔑' }
  if (kind === 'furniture') return { what: id.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), where: 'Furniture', icon: '🛋️' }
  if (kind === 'magnet') return { what: 'Fridge magnet', where: 'Brooklyn Bridge', icon: '🧲' }
  if (kind === 'ticket') return { what: `Tickets: ${id}`, icon: '🎟️' }
  if (kind === 'stock-buy') return { what: `Bought ${id}`, where: ipoBySym(id)?.name, icon: '📈' }
  if (kind === 'stock-sell') return { what: `Sold ${id}`, where: ipoBySym(id)?.name, icon: '📈' }
  if (kind === 'buy') return { what: ITEM[id]?.name ?? 'A purchase', icon: '🛍️' }
  return { what: reason.replace(/[-_:]/g, ' ').replace(/^\w/, (c) => c.toUpperCase()), icon: '🪙' }
}
