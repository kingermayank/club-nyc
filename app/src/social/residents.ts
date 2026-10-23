import type { Look } from '../avatar/look'
import { randomLook } from '../avatar/random'
import { rng, hash, pickWith } from './rng'
import { teamOfRoom, TEAMS, type TeamId } from './teams'
import { partyOn, PARTY } from '../data/party'

/**
 * The people of Club NYC. Until multiplayer exists these residents stand in for other players:
 * each has a stable look, a home neighborhood (and team), favourite haunts, a daily rhythm, an
 * apartment you can visit and scores on the weekly leaderboards. Swap them for real players later.
 */
export interface Resident {
  id: string
  name: string
  look: Look
  team: TeamId
  home: string
  haunts: string[]
  bio: string
  title: string
  /** 0..1 — how good they are at the mini-games */
  skill: number
  /** chance to be offline in any time slot */
  offline: number
  lines: string[]
}

const NAMES = [
  'BagelQueen', 'SubwaySam', 'PizzaRatFan', 'BrooklynBree', 'TaxiTony', 'Halal4Life', 'SohoSofia', 'MetMuseMo',
  'DollarSliceDev', 'BodegaBobby', 'ParkSlopePat', 'Liberty_Lu', 'HarlemHank', 'NolitaNat', 'FerryFrankie',
  'CoffeeCarla', 'BroadwayBen', 'ChinatownChen', 'HighLineHaz', 'GothamGabi', 'UWS_Uma', 'ConeyKai',
  'ExpressTrainEd', 'RooftopRiya', 'MetroCardMika', 'BigAppleAbby', 'StoopSitterSal', 'LoxAndLatte', 'CannoliCam',
  'DumplingDee', 'SkylineSkye', 'WaterTowerWes', 'FireEscapeFi', 'YellowCabYuki', 'NightOwlNico', 'KnishKing',
  'EggCreamEmma', 'SteamVentSteve', 'PretzelPriya', 'GelatoGio', 'SneakerheadZo', 'ThreadCountTess', 'RinkRatRory',
  'OperaOlive', 'JazzCatJules', 'BikeLaneBo', 'PigeonPete', 'ShowtimeShay', 'TimesSqTina', 'CabCallerCal',
  'HudsonHarper', 'DeliDanny', 'MuseumMaya', 'GalleryGus', 'ParadeParker', 'SliceSlinger', 'EspressoElla',
]

/** where people tend to live/hang out — weighted toward busy hubs so those feel alive */
const HOME_WEIGHTS: [string, number][] = [
  ['times-square', 6], ['soho', 5], ['central-park', 5], ['the-met', 3], ['rockefeller', 3], ['chinatown', 3],
  ['brooklyn-bridge', 3], ['battery-park', 3], ['high-line', 3], ['fifth-ave', 2], ['grand-central', 2],
  ['coffee', 2], ['pizza', 2], ['chelsea-market', 2], ['liberty-island', 1], ['broadway', 1], ['subway', 1],
  ['sneaker-vault', 1], ['thread', 1], ['iloveny', 1], ['toy-palace', 1], ['empire-deck', 1], ['maison-malle', 1],
]
const HUBS = ['times-square', 'soho', 'central-park', 'rockefeller', 'brooklyn-bridge', 'the-met', 'chinatown']
/** people between places pass through the transit hubs */
const TRANSIT = ['subway', 'grand-central', 'times-square', 'subway', 'grand-central']
export const OUTDOOR = ['times-square', 'fifth-ave', 'rockefeller', 'central-park', 'the-met', 'soho', 'chinatown', 'brooklyn-bridge', 'battery-park', 'high-line']
/** homes near Wall Street and One World Trade (their locals hang out there too) */
const DOWNTOWN = ['battery-park', 'brooklyn-bridge', 'chinatown', 'liberty-island']

const BIOS = [
  'Has ridden every subway line. Twice.', 'Will not eat pizza with a fork. Ever.', 'Knows every bodega cat by name.',
  'Moved here for a week in 2019. Still here.', 'Thinks the best bagel is the one in your hand.', 'Collects MetroCards like trading cards.',
  'Has opinions about cheesecake.', 'Can hail a cab in the rain. A legend.', 'Never misses a free museum night.',
  'Brunch is a personality.', 'Walks everywhere. Faster than the train.', 'Dances on the subway (with permission).',
  'Owns more tote bags than shirts.', 'Ferry commuter, sunset enjoyer.', 'Skates at Rockefeller every winter.',
  'Halal cart regular. Extra white sauce.', 'Grew up on the Upper West Side.', 'Saw a Broadway show 47 times.',
]
const TITLES = [
  'Straphanger', 'Pizza Pro', 'Rink Rat', 'Halal Hero', 'Captain!', 'Bagel Boss', 'Fashionista', 'Newshound',
  'Night Owl', 'Local Legend', 'Brunch Expert', 'Bodega Regular', 'Showstopper', 'Flash Mobber', 'Sneakerhead',
]
const LINES = [
  'Have you tried the halal cart on 57th?', 'The ferry at sunset is unreal.', 'Who’s up for a flash mob? 🕺',
  'I’m saving up for a jukebox for my place.', 'My apartment is open. Come visit!', 'Did you read the Club NYC Times today?',
  'I almost beat the Slice Factory record!', 'The subway smells like… adventure.', 'Coffee number three. Don’t judge.',
  'Race you to the pizza place? 🍕', 'This city never sleeps and neither do I.', 'Rainbow Kicks or High-Tops?',
]

function build(): Resident[] {
  const total = HOME_WEIGHTS.reduce((a, [, w]) => a + w, 0)
  return NAMES.map((name, i) => {
    const r = rng('resident:' + name)
    let x = r() * total
    let home = HOME_WEIGHTS[0][0]
    for (const [room, w] of HOME_WEIGHTS) {
      if ((x -= w) <= 0) {
        home = room
        break
      }
    }
    const team = teamOfRoom(home)
    const haunts = [pickWith(r, HUBS), pickWith(r, HOME_WEIGHTS.map((h) => h[0])), pickWith(r, OUTDOOR)].filter((h, k, a) => h !== home && a.indexOf(h) === k)
    // downtown locals also drop by the newer downtown places (added after the seeded picks, so nobody else's
    // home, team or haunts change)
    if (DOWNTOWN.includes(home)) haunts.push(hash(name) % 2 ? 'wall-street' : 'one-world-trade')
    const look = randomLook(0.75, r)
    // some residents wear their team scarf
    if (r() < 0.25 && !look.items.neck) look.items.neck = TEAMS[team].scarf
    const t = TEAMS[team]
    return {
      id: name.toLowerCase().replace(/[^a-z0-9]/g, ''),
      name,
      look,
      team,
      home,
      haunts: haunts.length ? haunts : [pickWith(r, HUBS)],
      bio: pickWith(r, BIOS),
      title: r() < 0.7 ? pickWith(r, TITLES) : '',
      skill: Math.min(0.97, 0.2 + r() * 0.8 * (0.7 + 0.3 * ((i * 7) % 5) / 4)),
      offline: 0.12 + r() * 0.22,
      lines: [pickWith(r, LINES), pickWith(r, LINES), `Go ${t.name}! ${t.emoji}`],
    }
  })
}

export const RESIDENTS: Resident[] = build()
export const RESIDENT: Record<string, Resident> = Object.fromEntries(RESIDENTS.map((r) => [r.id, r]))

// ---------- the city's rhythm: who is where, right now ----------
export const SLOT_MS = 4 * 60 * 1000

/** Where a resident is right now (null = offline). Changes every few minutes. */
export function locationOf(r: Resident, now = Date.now()): string | null {
  const slot = Math.floor((now + (hash(r.id) % SLOT_MS)) / SLOT_MS)
  const g = rng(`${r.id}:${slot}`)
  if (g() < r.offline) return g() < 0.4 ? pickWith(g, TRANSIT) : null
  if (partyOn() && g() < 0.22) return PARTY.room
  const x = g()
  if (x < 0.5) return r.home
  if (x < 0.88) return pickWith(g, r.haunts)
  return pickWith(g, OUTDOOR)
}

/** Residents currently in a room, friends first, capped. */
export function residentsIn(room: string, cap: number, friends: string[] = [], now = Date.now()): Resident[] {
  const here = RESIDENTS.filter((r) => locationOf(r, now) === room)
  here.sort((a, b) => (friends.includes(b.id) ? 1 : 0) - (friends.includes(a.id) ? 1 : 0) || hash(a.id + room) - hash(b.id + room))
  return here.slice(0, cap)
}

/** How many people are in each room right now (for the map's "busy" markers). */
export function population(now = Date.now()): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of RESIDENTS) {
    const l = locationOf(r, now)
    if (l) out[l] = (out[l] ?? 0) + 1
  }
  return out
}
