/**
 * Carb-Jitsu: the rules, shared by the game and the server (which runs every match).
 *
 * Both players pick a card at the same time. Pizza beats Pretzel (it's a whole meal), Pretzel beats Bagel (knots
 * beat holes), Bagel beats Pizza (breakfast comes first). Same food: the higher number wins. Won cards go on your
 * tray; the first to show three of one food, or one of each food, from three different boroughs wins the match.
 * Specials only count when their card wins: Rent Control (next round the lower number wins), Rent Hike (their next
 * card is worth 3 less) and Tow Truck (tows one of their tray cards from the same borough).
 */
import type { CardWire, Element } from './protocol'
import { seeded } from './rng'

export const FOODS = [
  { name: 'Pizza', icon: '🍕', beats: 'Pretzel', why: 'It’s a whole meal.' },
  { name: 'Pretzel', icon: '🥨', beats: 'Bagel', why: 'Knots beat holes.' },
  { name: 'Bagel', icon: '🥯', beats: 'Pizza', why: 'Breakfast comes first.' },
] as const
/** card colours are the five boroughs */
export const BOROUGHS = [
  { name: 'Manhattan', short: 'MN', hex: '#e5483b', dark: '#9e2219' },
  { name: 'Brooklyn', short: 'BK', hex: '#2a7bd5', dark: '#134a96' },
  { name: 'Queens', short: 'QN', hex: '#8a5bd6', dark: '#563296' },
  { name: 'The Bronx', short: 'BX', hex: '#3cb371', dark: '#1d7a43' },
  { name: 'Staten Island', short: 'SI', hex: '#f08a24', dark: '#a8520c' },
] as const
export const FX = {
  low: { name: 'Rent Control', text: 'If this wins, next round the lower number wins.' },
  hike: { name: 'Rent Hike', text: 'If this wins, their next card is worth 3 less.' },
  tow: { name: 'Tow Truck', text: 'If this wins, it tows one of their tray cards from the same borough.' },
} as const

export const CJ = {
  hand: 5,
  pickMs: 15_000,
  revealMs: 2600,
  overMs: 3400,
  /** a match never runs longer than this many rounds (then the bigger tray wins) */
  maxRounds: 24,
  /** an offline player has this long before forfeiting */
  forfeitMs: 30_000,
  /** three rounds in a row without picking (the clock picked for you) and you're asked to step away */
  idleRounds: 4,
}

export const beats = (a: Element, b: Element) => (a === 0 && b === 1) || (a === 1 && b === 2) || (a === 2 && b === 0)

/** A deck for one player: foods even, mostly middling numbers, a few specials. */
export function makeDeck(seed: number, n = 45): CardWire[] {
  const r = seeded(seed)
  const out: CardWire[] = []
  for (let i = 0; i < n; i++) {
    const e = (i % 3) as Element
    const p = Math.min(12, Math.max(2, Math.round(2 + r() * 8 + (r() < 0.15 ? 2 + r() * 2 : 0))))
    const c = Math.floor(r() * BOROUGHS.length)
    const card: CardWire = { e, p, c }
    const s = r()
    if (s < 0.06) card.fx = 'low'
    else if (s < 0.12) card.fx = 'hike'
    else if (s < 0.17) card.fx = 'tow'
    out.push(card)
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** The round: 0 if a wins, 1 if b wins, -1 a tie. `hike` lowers each side's number; `low` flips who the number favours. */
export function resolveRound(a: CardWire, b: CardWire, fx: { low?: unknown; hike?: [number, number] } = {}): -1 | 0 | 1 {
  if (a.e !== b.e) return beats(a.e, b.e) ? 0 : 1
  const pa = a.p - (fx.hike?.[0] ?? 0)
  const pb = b.p - (fx.hike?.[1] ?? 0)
  if (pa === pb) return -1
  return (fx.low ? pa < pb : pa > pb) ? 0 : 1
}

/** A winning set on a tray (indices), or null: three of one food from three boroughs, or one of each food from three boroughs. */
export function winningSet(tray: CardWire[]): number[] | null {
  for (let e = 0; e < 3; e++) {
    const seen = new Map<number, number>()
    tray.forEach((c, i) => {
      if (c.e === e && !seen.has(c.c)) seen.set(c.c, i)
    })
    if (seen.size >= 3) return [...seen.values()].slice(0, 3)
  }
  const by: number[][] = [[], [], []]
  tray.forEach((c, i) => by[c.e].push(i))
  for (const i of by[0]) for (const j of by[1]) for (const k of by[2]) if (new Set([tray[i].c, tray[j].c, tray[k].c]).size === 3) return [i, j, k]
  return null
}

/** Would winning this card complete a set? */
export const completes = (tray: CardWire[], card: CardWire) => !winningSet(tray) && !!winningSet([...tray, card])
/** Is a tray one card away from winning (some card would complete it)? */
export const oneAway = (tray: CardWire[]) => ([0, 1, 2] as Element[]).some((e) => BOROUGHS.some((_, c) => completes(tray, { e, p: 5, c })))

/** A city local's pick: the card that completes a set, else block a win, else something strong, with a little chaos. */
export function botPick(hand: CardWire[], mine: CardWire[], theirs: CardWire[], skill: number, r: () => number): number {
  if (r() > skill) return Math.floor(r() * hand.length)
  const finish = hand.findIndex((c) => completes(mine, c))
  if (finish >= 0) return finish
  // if one more card of some food would win it for them, play what beats that food
  const danger = ([0, 1, 2] as Element[]).find((e) => BOROUGHS.some((_, c) => completes(theirs, { e, p: 5, c })))
  if (danger !== undefined) {
    const beater = ((danger + 2) % 3) as Element
    const i = hand.findIndex((c) => c.e === beater)
    if (i >= 0) return i
  }
  let best = 0
  hand.forEach((c, i) => {
    if (c.p + (c.fx ? 2 : 0) > hand[best].p + (hand[best].fx ? 2 : 0)) best = i
  })
  return best
}
