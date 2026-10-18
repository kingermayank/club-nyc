// Orders, builds and grading for Halal Rush.

export type Base = 'platter' | 'pita'
export type Protein = 'chicken' | 'lamb' | 'falafel'
export type ProteinChoice = Protein | 'combo'
/** normal | "extra extra white sauce" | construction worker (2 platters) | tourist (wants ketchup) */
export type Kind = 'normal' | 'extra' | 'worker' | 'tourist'

export interface Order {
  base: Base
  protein: ProteinChoice
  salad: boolean
  /** squirts of white sauce, 0–3 */
  white: number
  /** squirts of hot sauce, 0–2 */
  red: number
}

/** what the player has assembled on the counter */
export interface Build {
  base: Base
  rice: boolean
  proteins: Protein[]
  salad: boolean
  white: number
  red: number
}

export const proteinsOf = (p: ProteinChoice): Protein[] => (p === 'combo' ? ['chicken', 'lamb'] : [p])

function pick<T>(entries: [T, number][]): T {
  let r = Math.random() * entries.reduce((s, e) => s + e[1], 0)
  for (const [v, w] of entries) {
    r -= w
    if (r <= 0) return v
  }
  return entries[entries.length - 1][0]
}

/** progress 0..1 through the lunch rush — later orders get saucier and comboier */
export function makeOrder(progress: number, kind: Kind): Order {
  const early = progress < 0.2
  const base: Base = kind === 'worker' || kind === 'tourist' ? 'platter' : Math.random() < 0.68 ? 'platter' : 'pita'
  const protein = pick<ProteinChoice>([
    ['chicken', 0.36],
    ['lamb', 0.24],
    ['falafel', 0.16],
    ['combo', early ? 0.08 : 0.26],
  ])
  const salad = Math.random() < 0.6
  let white = pick<number>(early ? [[0, 0.1], [1, 0.5], [2, 0.4]] : [[0, 0.12], [1, 0.36], [2, 0.36], [3, 0.16]])
  const red = pick<number>(early ? [[0, 0.55], [1, 0.45]] : [[0, 0.36], [1, 0.42], [2, 0.22]])
  if (kind === 'extra') white = 3
  return { base, protein, salad, white, red }
}

export const priceOf = (o: Order) => (o.base === 'platter' ? 8 : 6) + (o.protein === 'combo' ? 1 : 0)

export interface Grade {
  result: 'perfect' | 'meh' | 'wrong'
  /** what the customer says about it */
  note: string
}

export function grade(o: Order, b: Build): Grade {
  const major: string[] = []
  const minor: string[] = []
  if (o.base !== b.base) major.push(o.base === 'pita' ? 'I wanted a pita!' : 'I wanted a platter!')
  else if (o.base === 'platter' && !b.rice) major.push("Where's the rice?!")
  else if (o.base === 'pita' && b.rice) minor.push('Rice... in a pita?')

  const want = proteinsOf(o.protein)
  const same = want.length === b.proteins.length && want.every((p) => b.proteins.includes(p))
  if (!same) {
    if (!b.proteins.length) major.push(o.protein === 'falafel' ? "Where's my falafel?!" : "Where's the meat?!")
    else major.push(`I said ${o.protein.toUpperCase()}!`)
  }
  if (o.salad !== b.salad) minor.push(o.salad ? 'No salad?' : 'I said no salad!')
  if (b.white !== o.white) {
    minor.push(b.white < o.white ? (o.white === 3 ? 'EXTRA white sauce!!' : 'More white sauce!') : 'Too much white sauce!')
  }
  if (b.red !== o.red) minor.push(b.red < o.red ? "Where's the hot sauce?" : 'TOO SPICY!!')

  if (major.length) return { result: 'wrong', note: major[0] }
  if (minor.length >= 2) return { result: 'wrong', note: 'This is all wrong!' }
  if (minor.length === 1) return { result: 'meh', note: minor[0] }
  return { result: 'perfect', note: '' }
}

/** the next thing to do for an order — drives the first-order tutorial arrow */
export function nextStep(o: Order, b: Build | null): string {
  if (!b) return o.base === 'platter' ? 'container' : 'pita'
  if (b.base !== o.base) return 'trash'
  if (o.base === 'platter' && !b.rice) return 'rice'
  const want = proteinsOf(o.protein)
  if (b.proteins.some((p) => !want.includes(p))) return 'trash'
  for (const p of want) if (!b.proteins.includes(p)) return p
  if (o.salad && !b.salad) return 'salad'
  if (b.white > o.white || b.red > o.red || (!o.salad && b.salad)) return 'trash'
  if (b.white < o.white) return 'white'
  if (b.red < o.red) return 'red'
  return 'serve'
}
