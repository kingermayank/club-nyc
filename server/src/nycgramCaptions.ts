/**
 * Auto-generated NYCgram captions: wholesome Club Penguin warmth + friendly NYC satire.
 * Never mean, never naming a real social brand. Templates only — no free text, no AI.
 */

const HOUR_LINES = [
  (place: string) => `${place} at 3 AM, no regrets`,
  (place: string) => `${place} before the tourists wake up`,
  (place: string) => `Golden hour at ${place}. Or close enough.`,
  (place: string) => `${place}, and my battery is at 4%`,
]

/** room id → place label + optional room-specific lines */
const ROOM: Record<string, { place: string; lines?: string[] }> = {
  'times-square': {
    place: 'Times Square',
    lines: [
      'Times Square at 3 AM, no regrets',
      'The billboards blinked first',
      'Standing still in Times Square is a sport',
      'Neon, pigeons, and me',
    ],
  },
  broadway: {
    place: 'Broadway',
    lines: ['Curtain call energy', 'Break a leg (softly)', 'Theater kid mode: ON'],
  },
  iloveny: {
    place: 'the souvenir shop',
    lines: ['Foam crown season', 'I ♥ this photo', 'Tourist mode, proudly'],
  },
  rockefeller: {
    place: 'Rockefeller Center',
    lines: ['Rink-side and chill', 'Looking up at Rockefeller', 'Midtown glow-up'],
  },
  'fifth-ave': {
    place: 'Fifth Avenue',
    lines: ['$9 coffee, worth it', 'Window shopping counts as cardio', 'Fifth Ave, casually'],
  },
  'toy-palace': { place: 'Snacks Fifth Avenue', lines: ['Snack break, elevated', 'Perfume counter selfie'] },
  'saks-2': { place: 'Snacks Fifth Avenue', lines: ['Designer floor vibes', 'Velvet bench approved'] },
  'maison-malle': { place: 'Louis Vuittown', lines: ['Window shopping only', 'Trunk show energy'] },
  'central-park': {
    place: 'Central Park',
    lines: ['Park day, city soft', 'Pretzel in the park', 'Nature, but make it Manhattan'],
  },
  'the-met': {
    place: 'The Met',
    lines: ['Art? Me on these steps.', 'Culture check ✓', 'Museum mile smile'],
  },
  'empire-street': { place: 'the Empire State', lines: ['Looking up', '34th & Fifth mood'] },
  'empire-lobby': { place: 'the Empire State', lines: ['Lobby glow', 'Elevator pending'] },
  'empire-deck': {
    place: 'the Empire State deck',
    lines: ['86 floors later', 'Tiny cars, big feelings', 'Observatory approved'],
  },
  'grand-central': {
    place: 'Grand Central',
    lines: ['Whispering Gallery secrets', 'Main concourse moment', 'Caught the right clock'],
  },
  'wall-street': {
    place: 'the Bull',
    lines: ['Bull-ish about today', 'Wall Street tourist, no notes', 'Charging ahead'],
  },
  'brooklyn-bridge': {
    place: 'the Brooklyn Bridge',
    lines: ['Walked for the view', 'Boards and skyline', 'Halfway to Brooklyn feelings'],
  },
  'liberty-island': {
    place: 'Liberty Island',
    lines: ['Me and Lady Liberty', 'Ferry hair, don’t care', 'Torch goals'],
  },
  'one-world-trade': {
    place: 'One World Trade',
    lines: ['Sky Deck energy', 'Looking out over everything', 'Tall city, soft smile'],
  },
  chinatown: {
    place: 'Chinatown',
    lines: ['Lantern light', 'Dumpling run after this', 'Chinatown stroll'],
  },
  soho: { place: 'SoHo', lines: ['Cobblestones and good light', 'SoHo stroll'] },
  starducks: {
    place: 'Starducks',
    lines: ['$9 coffee, worth it', 'Name on the cup: almost right', 'Latte art who?'],
  },
  'pizza-99': {
    place: '99¢ Slice',
    lines: ['Folded correctly', 'Dollar slice diplomacy', 'Cheese pull incoming'],
  },
  subway: { place: 'the subway', lines: ['Next stop: anywhere', 'Underground glow-up', 'Hold the pole, hold the pose'] },
  apartment: { place: 'home', lines: ['Open house energy', 'Home soft launch', 'My place, my light'] },
  'battery-park': { place: 'Battery Park', lines: ['Harbor breeze', 'Statue watching'] },
  'high-line': { place: 'the High Line', lines: ['Elevated stroll', 'Park in the sky'] },
  'chelsea-market': { place: 'Chelsea Market', lines: ['Snack tour continues', 'Indoor market vibes'] },
  halloween: { place: 'the Halloween Parade', lines: ['Costume check', 'Candy corn chronicles'] },
}

const GENERIC = [
  'Posted from the city that never sleeps (nap pending)',
  'New York state of soft',
  'Caught between pigeons and destiny',
  'This is my Main Character commute',
  'City kids forever',
  'Out here living the postcard',
  'Smile so hard the skyline noticed',
  'Wholesome chaos, Manhattan edition',
]

function placeOf(room: string): string {
  return ROOM[room]?.place ?? room.replace(/-/g, ' ')
}

/** Pick a funny caption from room/context. Deterministic-ish from seed so tests can pin one. */
export function nycgramCaption(room: string, kind: string, seed = Date.now()): string {
  const info = ROOM[room]
  const pool = [
    ...(info?.lines ?? []),
    ...HOUR_LINES.map((f) => f(placeOf(room))),
    ...GENERIC,
  ]
  if (kind === 'booth') {
    pool.push('Photo booth strip, celebrity edition', 'Four poses, zero chill', 'Squeeze-in championship')
  }
  const i = Math.abs(seed) % pool.length
  return pool[i]!.slice(0, 120)
}
