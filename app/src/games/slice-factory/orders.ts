// Orders for Slice Factory: what goes on each pie, what it's called, and what went wrong.

export type Sauce = 'red' | 'white'
export type ToppingId = 'pepperoni' | 'mushroom' | 'pepper' | 'sausage' | 'olive' | 'basil'

export interface ToppingDef {
  id: ToppingId
  /** tape label on the bin */
  label: string
  /** used in "3 too many ___" */
  plural: string
  /** dessert-pizza versions (same sprites, candy colors) */
  candyLabel: string
  candyPlural: string
  meat: boolean
}

/** Left-to-right, the order of the six bins in the illustration. */
export const TOPPINGS: ToppingDef[] = [
  { id: 'pepperoni', label: 'PEPPERONI', plural: 'pepperoni', candyLabel: 'CHERRIES', candyPlural: 'cherries', meat: true },
  { id: 'mushroom', label: 'MUSHROOMS', plural: 'mushrooms', candyLabel: 'MALLOWS', candyPlural: 'marshmallows', meat: false },
  { id: 'pepper', label: 'PEPPERS', plural: 'peppers', candyLabel: 'GUMMIES', candyPlural: 'gummy rings', meat: false },
  { id: 'sausage', label: 'SAUSAGE', plural: 'sausage', candyLabel: 'BROWNIE', candyPlural: 'brownie bits', meat: true },
  { id: 'olive', label: 'OLIVES', plural: 'olives', candyLabel: 'DONUTS', candyPlural: 'donuts', meat: false },
  { id: 'basil', label: 'BASIL', plural: 'basil leaves', candyLabel: 'MINT', candyPlural: 'mint leaves', meat: false },
]

export interface Order {
  /** 1-based order number in the shift */
  n: number
  name: string
  sauce: Sauce
  /** exact counts; kinds not listed must not be on the pie */
  toppings: Partial<Record<ToppingId, number>>
  dessert: boolean
}

/** What the player has built so far (a Pizza satisfies this structurally). */
export interface BuildState {
  sauceDone: boolean
  rightSplats: number
  wrongSplats: number
  cheese: boolean
  have: Record<ToppingId, number>
}

type Rand = () => number

const pick = <T>(a: readonly T[], r: Rand): T => a[Math.floor(r() * a.length)]

function shuffle<T>(a: T[], r: Rand): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// how likely each count 1..5 is
const COUNT_WEIGHT = [0, 14, 26, 27, 19, 14]
function count(r: Rand, lo: number, hi: number): number {
  let total = 0
  for (let c = lo; c <= hi; c++) total += COUNT_WEIGHT[c]
  let x = r() * total
  for (let c = lo; c <= hi; c++) {
    x -= COUNT_WEIGHT[c]
    if (x <= 0) return c
  }
  return hi
}

const BOROUGH = [
  'Brooklyn Special',
  'Bronx Bomber',
  'Queens Combo',
  'Staten Island Pie',
  'Harlem Heat',
  'Bodega Special',
  'Subway Special',
  'Uptown Deluxe',
  'Midtown Mix',
  'Big Apple Pie',
  'Corner Slice Combo',
  'Coney Island Pie',
]

function nameFor(o: Omit<Order, 'name'>, r: Rand): string {
  const ids = Object.keys(o.toppings) as ToppingId[]
  if (o.dessert) return pick(['Dessert Pizza!', 'Candy Pie!', 'Sweet Slice!'], r)
  if (!ids.length) return o.sauce === 'white' ? 'White Pie' : 'Plain Slice'
  if (o.sauce === 'white') return ids.length >= 3 ? 'White Pie Deluxe' : 'White Pie Special'
  if (ids.length === 1) {
    return {
      pepperoni: 'Pepperoni Pie',
      mushroom: 'Mushroom Pie',
      pepper: 'Pepper Pie',
      sausage: 'Sausage Pie',
      olive: 'Olive Pie',
      basil: 'Margherita',
    }[ids[0]]
  }
  if (ids.length >= 4) return 'The Works'
  const meat = ids.filter((id) => TOPPINGS.find((t) => t.id === id)!.meat).length
  if (meat === ids.length) return 'Meat Lovers'
  if (meat === 0) return 'Garden Pie'
  return BOROUGH[(o.n * 7 + Math.floor(r() * 3)) % BOROUGH.length]
}

/**
 * The n-th order of the shift. Early orders teach (plain → one topping), later ones pile on
 * more kinds and white-sauce specials.
 */
export function makeOrder(n: number, dessert: boolean, r: Rand = Math.random): Order {
  let kinds: number
  let lo = 2
  let hi = 4
  let cap = 6
  if (dessert) {
    kinds = r() < 0.5 ? 2 : 3
    cap = 7
  } else if (n === 1) kinds = 0
  else if (n === 2) {
    kinds = 1
    hi = 3
  } else if (n === 3) {
    kinds = 1
    lo = 3
  } else if (n <= 6) {
    kinds = r() < 0.55 ? 2 : 1
    cap = 6
  } else if (n <= 10) {
    const q = r()
    kinds = q < 0.15 ? 1 : q < 0.85 ? 2 : 3
    lo = 1
    cap = 7
  } else if (n <= 15) {
    kinds = r() < 0.55 ? 2 : 3
    lo = 1
    cap = 8
  } else if (n <= 21) {
    const q = r()
    kinds = q < 0.3 ? 2 : q < 0.85 ? 3 : 4
    lo = 1
    hi = 5
    cap = 10
  } else {
    kinds = r() < 0.6 ? 3 : 4
    lo = 1
    cap = 11
  }
  const sauce: Sauce = dessert
    ? r() < 0.5
      ? 'red'
      : 'white'
    : n >= 5 && r() < (n < 10 ? 0.25 : 0.34)
      ? 'white'
      : 'red'
  const chosen = shuffle(
    TOPPINGS.map((t) => t.id),
    r,
  ).slice(0, kinds)
  const counts: Partial<Record<ToppingId, number>> = {}
  let total = 0
  for (const id of chosen) {
    const c = count(r, lo, hi)
    counts[id] = c
    total += c
  }
  // trim the biggest piles until the pie fits the cap
  while (total > cap) {
    const big = chosen.reduce((a, b) => (counts[b]! > counts[a]! ? b : a))
    if (counts[big]! <= 1) break
    counts[big]!--
    total--
  }
  // list toppings in bin order so the ticket reads left-to-right like the bins
  const toppings: Partial<Record<ToppingId, number>> = {}
  for (const t of TOPPINGS) if (counts[t.id]) toppings[t.id] = counts[t.id]
  const base = { n, sauce, toppings, dessert }
  return { ...base, name: nameFor(base, r) }
}

/** Toppings or sauce that can't be undone: the pie is already wrong. */
export function isRuined(o: Order, s: BuildState, tolerance: number): boolean {
  if (s.wrongSplats > tolerance) return true
  return TOPPINGS.some((t) => s.have[t.id] > (o.toppings[t.id] ?? 0))
}

/** null when the pie matches the ticket, otherwise a short reason for the mistake. */
export function verdict(o: Order, s: BuildState, tolerance: number): string | null {
  const plural = (t: ToppingDef) => (o.dessert ? t.candyPlural : t.plural)
  if (s.wrongSplats > tolerance) return o.dessert ? 'Wrong drizzle!' : 'Wrong sauce!'
  if (!s.rightSplats) return o.dessert ? 'Forgot the drizzle!' : 'Forgot the sauce!'
  if (!s.sauceDone) return o.dessert ? 'Needs more drizzle!' : 'Needs more sauce!'
  if (!s.cheese) return o.dessert ? 'Forgot the sprinkles!' : 'Forgot the cheese!'
  for (const t of TOPPINGS) {
    const need = o.toppings[t.id] ?? 0
    const have = s.have[t.id]
    if (have > need) return need === 0 ? `No ${plural(t)} on this one!` : `${have - need} too many ${plural(t)}!`
  }
  for (const t of TOPPINGS) {
    const need = o.toppings[t.id] ?? 0
    const have = s.have[t.id]
    if (have < need) return have === 0 ? `Forgot the ${plural(t)}!` : `${need - have} ${plural(t)} short!`
  }
  return null
}
