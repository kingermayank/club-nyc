import { ROOMS } from './rooms'
import { isHomeRoom } from './homes'

/**
 * How a place reads in a sentence: "in Times Square", "at the Brooklyn Bridge", "on Liberty Island".
 * One list for every line that says where someone is (texts, the friends list, the phone), so no place gets a
 * blanket "in". `the`: the name takes an article in running text.
 */
type Prep = 'in' | 'at' | 'on'
const HOW: Record<string, [Prep, boolean?]> = {
  'times-square': ['in'],
  broadway: ['at', true],
  iloveny: ['at'],
  rockefeller: ['at'],
  'fifth-ave': ['on'],
  'toy-palace': ['at'],
  'saks-2': ['at'],
  'maison-malle': ['at'],
  'central-park': ['in'],
  'the-met': ['at', true],
  'empire-street': ['at', true],
  'empire-lobby': ['at', true],
  'empire-deck': ['at', true],
  'grand-central': ['at'],
  subway: ['at', true],
  soho: ['in'],
  thread: ['at'],
  'sneaker-vault': ['at', true],
  coffee: ['at'],
  chinatown: ['in'],
  pizza: ['at'],
  'brooklyn-bridge': ['at', true],
  'battery-park': ['in'],
  'liberty-island': ['on'],
  'high-line': ['on', true],
  'hudson-yards': ['at'],
  'chelsea-market': ['at'],
  parade: ['at', true],
  'wall-street': ['on'],
  'exchange-floor': ['at', true],
  'one-world-trade': ['at'],
  'sky-deck': ['on'],
}

/** the place's name as it reads mid-sentence: "the Brooklyn Bridge", "Times Square", "the Met" */
export function placeName(room: string | null | undefined): string {
  if (!room) return ''
  if (isHomeRoom(room)) return 'home'
  const name = ROOMS[room]?.name ?? room
  if (!HOW[room]?.[1]) return name
  return `the ${name.replace(/^The /, '')}`
}

/** "in Times Square", "at the Brooklyn Bridge", "on Liberty Island", "at home" ('' when the room isn't known) */
export function placePhrase(room: string | null | undefined, capital = false): string {
  if (!room) return ''
  const s = `${isHomeRoom(room) ? 'at' : HOW[room]?.[0] ?? 'at'} ${placeName(room)}`
  return capital ? s[0].toUpperCase() + s.slice(1) : s
}
