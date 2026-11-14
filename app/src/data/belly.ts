/**
 * Belly: every place in the city where you can make, order, or eat food.
 * Funny blurbs + fake-but-consistent ratings. No delivery — you go there.
 */
export interface BellySpot {
  id: string
  name: string
  room: string
  /** walk target in the room, when known */
  at?: [number, number]
  kind: string
  blurb: string
  /** 1–5, one decimal */
  rating: number
  /** what you'll likely eat */
  eats: string
}

export const BELLY_SPOTS: BellySpot[] = [
  {
    id: 'ts-dog',
    name: 'Times Square Hot Dog Cart',
    room: 'times-square',
    at: [420, 380],
    kind: 'Cart',
    blurb: 'Neon, pigeons, and a dog that somehow tastes like victory at 1 a.m.',
    rating: 4.2,
    eats: 'Hot dog',
  },
  {
    id: 'fifth-halal',
    name: 'Halal Bros',
    room: 'fifth-ave',
    kind: 'Cart',
    blurb: 'White sauce diplomacy. The line is the real appetizer.',
    rating: 4.7,
    eats: 'Chicken over rice',
  },
  {
    id: 'park-pretzel',
    name: 'Central Park Pretzel Cart',
    room: 'central-park',
    kind: 'Cart',
    blurb: 'Warm salt, cold air, squirrels negotiating in bad faith.',
    rating: 4.4,
    eats: 'Pretzel',
  },
  {
    id: 'park-boathouse',
    name: 'Boathouse Snacks',
    room: 'central-park',
    kind: 'Café',
    blurb: 'Cocoa with a lake view. Your fingers will thank you.',
    rating: 4.1,
    eats: 'Cocoa & coffee',
  },
  {
    id: 'met-pretzel',
    name: 'Met Steps Pretzel',
    room: 'the-met',
    kind: 'Cart',
    blurb: 'Art upstairs, mustard downstairs. Peak culture.',
    rating: 4.0,
    eats: 'Pretzel',
  },
  {
    id: 'met-dog',
    name: 'Museum Mile Hot Dog',
    room: 'the-met',
    kind: 'Cart',
    blurb: 'Eat it on the steps. Everyone will think you’re in a movie.',
    rating: 3.9,
    eats: 'Hot dog',
  },
  {
    id: 'starducks',
    name: 'Starducks Coffee',
    room: 'coffee',
    kind: 'Café',
    blurb: 'They will misspell your name. That’s the experience.',
    rating: 3.8,
    eats: 'Latte, bagel, cookie',
  },
  {
    id: 'dim-sum',
    name: 'Chinatown Dim Sum',
    room: 'chinatown',
    kind: 'Table',
    blurb: 'Steam carts, chopsticks chaos, phoenix claws if you’re brave.',
    rating: 4.8,
    eats: 'Dim sum',
  },
  {
    id: 'boba-bay',
    name: 'Boba Bay',
    room: 'chinatown',
    kind: 'Counter',
    blurb: 'Brown sugar pearls. Extra chew, zero regrets.',
    rating: 4.3,
    eats: 'Boba',
  },
  {
    id: 'slice',
    name: '99¢ Slice',
    room: 'pizza',
    kind: 'Counter',
    blurb: 'Fold it. Walk with it. Argue about it. That’s the meal.',
    rating: 4.6,
    eats: 'Pizza slice',
  },
  {
    id: 'gelato',
    name: 'High Line Gelato',
    room: 'high-line',
    kind: 'Cart',
    blurb: 'Elevated dessert, literally. Watch for runaway carts.',
    rating: 4.5,
    eats: 'Gelato',
  },
  {
    id: 'dos-tacos',
    name: 'Dos Tacos No. 2',
    room: 'chelsea-market',
    kind: 'Counter',
    blurb: 'Trompo drama and a pineapple that might fly at you.',
    rating: 4.7,
    eats: 'Tacos',
  },
  {
    id: 'lobster',
    name: 'The Lobster Spot',
    room: 'chelsea-market',
    kind: 'Counter',
    blurb: 'Shuck first, ask market-price later.',
    rating: 4.4,
    eats: 'Oysters & lobster roll',
  },
  {
    id: 'donuts',
    name: 'Doughnut Dept.',
    room: 'chelsea-market',
    kind: 'Counter',
    blurb: 'Mini doughnuts, four sugars, zero self-control.',
    rating: 4.5,
    eats: 'Mini doughnuts',
  },
  {
    id: 'wall-dog',
    name: 'Wall Street Cart',
    room: 'wall-street',
    kind: 'Cart',
    blurb: 'Bulls, bears, and mustard. Diversify your toppings.',
    rating: 3.7,
    eats: 'Hot dog',
  },
  {
    id: 'owt-cart',
    name: 'One World Coffee Cart',
    room: 'one-world-trade',
    kind: 'Cart',
    blurb: 'Coffee with the tallest buildings eavesdropping.',
    rating: 4.0,
    eats: 'Coffee & pretzel',
  },
  {
    id: 'empire-cafe',
    name: 'Empire Deck Café',
    room: 'empire-deck',
    kind: 'Café',
    blurb: 'The highest cookie in the hemisphere. The view is winning.',
    rating: 4.2,
    eats: 'Coffee, cocoa, snacks',
  },
]

export const bellyStars = (n: number) => {
  const full = Math.floor(n)
  const half = n - full >= 0.3
  return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(Math.max(0, 5 - full - (half ? 1 : 0)))
}
