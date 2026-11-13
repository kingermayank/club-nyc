/**
 * Each place's background: Times Square's crowd, birds and far-off traffic in the park, gulls and rigging at the
 * water, a café's murmur, wind up top. Quiet on purpose (it sits under the music and the city's own sounds), and
 * only plays for places that have a recording (sound/library.ts).
 */
import { onRoomChange } from '../engine/world'
import { setAmbience } from './library'

/** Times Square never sounds the same twice: four recordings, one picked when you arrive, then a new one every minute or two */
const TIMES_SQUARE = ['times-square', 'times-square-2', 'times-square-3', 'times-square-4']

const ROOM_AMBIENCE: Record<string, string | string[]> = {
  'times-square': TIMES_SQUARE,
  broadway: TIMES_SQUARE,
  iloveny: 'street',
  rockefeller: 'street',
  'fifth-ave': 'street',
  soho: 'street',
  chinatown: 'street',
  'wall-street': 'street',
  'exchange-floor': 'exchange',
  parade: 'street',
  'central-park': 'park',
  'high-line': 'park',
  'brooklyn-bridge': 'harbor',
  'battery-park': 'harbor',
  'liberty-island': 'harbor',
  'empire-street': 'street',
  'empire-lobby': 'concourse',
  'empire-deck': 'rooftop',
  'sky-deck': 'rooftop',
  'one-world-trade': 'rooftop',
  subway: 'subway',
  'grand-central': 'concourse',
  'the-met': 'museum',
  coffee: 'cafe',
  pizza: 'cafe',
  'chelsea-market': 'cafe',
  'toy-palace': 'shop',
  'maison-malle': 'shop',
  thread: 'shop',
  'sneaker-vault': 'shop',
  // home: just the city through the window
  apartment: 'window',
  loft: 'window',
  penthouse: 'window',
}

let last = ''
let swap = 0
/** one of the place's recordings, never the one that just played */
const pick = (list: string[]) => {
  const pool = list.filter((n) => n !== last)
  last = pool[Math.floor(Math.random() * pool.length)] ?? list[0]
  return last
}
onRoomChange((r) => {
  clearTimeout(swap)
  const amb = ROOM_AMBIENCE[r.id] ?? null
  if (!Array.isArray(amb)) return setAmbience(amb)
  const next = () => {
    setAmbience(pick(amb))
    swap = window.setTimeout(next, 70_000 + Math.random() * 50_000)
  }
  next()
})
