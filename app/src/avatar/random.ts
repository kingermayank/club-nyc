import { HAIR_STYLES, SKINS, HAIR_COLORS, SIG_COLORS, type Look, type Slot } from './look'
import { ITEMS } from './items'

const pick = <T,>(a: T[], r: () => number) => a[Math.floor(r() * a.length)]

/** A random, plausible New Yorker (for NPCs and the "shuffle" button). Pass a seeded rng for stable looks. */
export function randomLook(fancy = 0.6, r: () => number = Math.random): Look {
  const by = (slot: Slot) => ITEMS.filter((i) => i.slot === slot && !i.reward && i.id !== 'skates')
  const items: Look['items'] = {
    body: pick(by('body'), r).id,
    legs: pick(by('legs'), r).id,
    feet: pick(by('feet'), r).id,
  }
  if (r() < fancy * 0.6) items.head = pick(by('head'), r).id
  if (r() < fancy * 0.35) items.face = pick(by('face'), r).id
  if (r() < fancy * 0.35) items.neck = pick(by('neck'), r).id
  if (r() < fancy * 0.45) items.hand = pick(by('hand'), r).id
  return {
    skin: Math.floor(r() * SKINS.length),
    hair: pick(HAIR_STYLES, r),
    hairColor: r() < 0.85 ? Math.floor(r() * 6) : Math.floor(r() * HAIR_COLORS.length),
    color: Math.floor(r() * SIG_COLORS.length),
    items,
  }
}

export const NPC_NAMES = [
  'BagelQueen', 'SubwaySam', 'PizzaRatFan', 'BrooklynBree', 'TaxiTony', 'Halal4Life', 'SohoSofia', 'MetMuseMo',
  'DollarSliceDev', 'BodegaBobby', 'ParkSlopePat', 'Liberty_Lu', 'HarlemHank', 'NolitaNat', 'FerryFrankie',
  'CoffeeCarla', 'BroadwayBen', 'ChinatownChen', 'HighLineHaz', 'GothamGabi', 'UWS_Uma', 'ConeyKai',
]
