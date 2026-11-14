import type { Game, ObjDef, RoomDef } from '../types'
import { bump, save } from '../state'
import { WELCOME_GIFTS } from './economy'

// ---------- little helpers for room actions ----------
/** Buy (or re-equip) a hand-held treat and hold it right away. */
const vend = (item: string, _price: number, line: string, stamp?: string) => async (g: Game) => {
  bump('snacks')
  if (g.owns(item)) {
    g.wear(item)
    g.say(line)
    tasted(g, item)
    return
  }
  // the price comes from the item catalog (and, online, the server checks it)
  if (!(await g.buy(item))) return
  g.sfx.register()
  g.wear(item)
  g.say(line)
  tasted(g, item)
  if (stamp) g.stamp(stamp)
}
/** treats that count as a meal for "Belly Full" */
const FOOD = new Set(['hotdog', 'pretzel', 'pretzel-cinnamon', 'pretzel-everything', 'pretzel-mustard', 'cocoa', 'coffee', 'latte', 'bagel', 'dumplings', 'boba', 'pizza-slice', 'gelato', 'gelato-pistachio', 'gelato-strawberry', 'gelato-chocolate', 'gelato-stracciatella', 'gelato-lemon', 'gelato-mango', 'donut', 'ralphs-coffee', 'cold-brew', 'cookie', 'black-white', 'croissant'])
/** "Belly Full": every food spot you've eaten at (a spot is a place plus what you had there) */
function tasted(g: Game, item: string) {
  if (!FOOD.has(item)) return
  const k = `ate:${g.room.id}:${item}`
  if (!save.stats[k]) bump(k)
  if (Object.keys(save.stats).filter((s) => s.startsWith('ate:')).length >= 10) g.stamp('belly-10')
}
/** what the Starducks Coffee barista writes on your cup: your name, nearly. ("Mayonnaise" is a classic.) */
function baristaName(name: string): string {
  const word = name.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])/)?.[0] ?? ''
  const n = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  if (n.length < 2) return 'Mystery Person'
  if (/^ma/i.test(n)) return 'Mayonnaise'
  const LAST_VOWEL: Record<string, string> = { a: 'e', e: 'i', i: 'y', o: 'u', u: 'oo', y: 'ie' }
  const tries = [
    (s: string) => s.replace(/^([BCDFGJKLMNPRSTVWZ])(?!h)/, '$1h'),
    (s: string) => s.replace(/[aeiouy](?=[^aeiouy]*$)/, (v) => LAST_VOWEL[v] ?? v),
    (s: string) => s.replace(/([bcdfgklmnprstvz])$/, '$1$1e'),
    (s: string) => `${s}ford`,
  ]
  const start = (n.length + new Date().getDate()) % tries.length
  for (let i = 0; i < tries.length; i++) {
    const out = tries[(start + i) % tries.length](n)
    if (out.toLowerCase() !== n.toLowerCase()) return out
  }
  return `${n}ish`
}
/** Sal's cart in Times Square: new New Yorkers pick a free welcome gift here (once), everyone else gets a hot dog */
const hotdogCart = async (g: Game) => {
  if (!WELCOME_GIFTS.some((id) => g.owns(id))) {
    // a picture of you in each gift (features/welcomeGift.ts); hot dogs come after, once the gift is picked
    const v = await import('../features/welcomeGift').then((m) => m.pickWelcomeGift())
    if (v) {
      g.give(v)
      g.wear(v)
      g.say(`Thanks, Sal! Wearing it right now. 🎁`)
    }
    return
  }
  return mo('hotdog', 'hotDogCart')(g)
}
type Act = (g: Game) => void
const shop = (id: string, section?: string): Act => (g) => g.catalog(id, section)
const exit = (label: string, room: string): ObjDef => ({ label, go: room })
const look = (label: string, act: Act): ObjDef => ({ label, act, instant: true })
/** the Empire State's elevator: the ride plays, and the room changes behind its closed doors (features/elevator.ts) */
const elevator = (label: string, room: string, up: boolean): ObjDef => ({
  label, go: room,
  // going up takes a ticket (features/tickets.ts); the way down is free
  ride: (arrive) => void (async () => {
    if (up && !(await (await import('../features/tickets')).admit('empire'))) return
    ;(await import('../features/elevator')).rideElevator(up, arrive)
  })(),
})
type Venue = import('../features/tickets').Venue
/** something you need today's ticket for (the elevator up), or a coin for (a look through a viewer) */
const ticketed = (v: Venue, how: 'admit' | 'look', act: Act): Act => (g) => void import('../features/tickets').then(async (m) => (await m[how](v)) && act(g))
const coo: Act = (g) => {
  g.sfx.coo()
  g.say('Coo coo! 🐦')
  g.flags.coo = (g.flags.coo ?? 0) + 1
  if (g.flags.coo >= 3) g.stamp('flock')
}
const wish: Act = async (g) => {
  const v = await g.choose('⛲ Make a Wish?', 'Toss a coin, make a wish. Fountain rules.', [
    { label: 'Toss a Coin (1)', value: 'yes' },
    { label: 'Keep My Coin', value: 'no' },
  ])
  if (v !== 'yes' || !g.spend(1, 'wish')) return
  g.sfx.coin()
  const fortunes = ['…a rent-stabilized apartment', '…a seat on the L train at rush hour', '…the perfect bagel', '…a Broadway debut', '…no tourists on Fifth Avenue', '…a rooftop with a view']
  g.say(`I wish for ${fortunes[Math.floor(Math.random() * fortunes.length)]} ✨`)
  g.confetti(24)
  g.stamp('wish')
}
const taxi: Act = (g) => {
  g.sfx.honk()
  g.say('TAXI! 🚕')
  // the back seat, the partition screen, the ride (features/moments/taxi.ts)
  setTimeout(() => void import('../features/moments/taxi').then((m) => m.taxiRide(g)), 650)
}
const binoc = (cx: number, cy: number, labels: [number, number, string][]): Act => (g) =>
  g.binoculars({ cx, cy, zoom: 3, labels: labels.map(([x, y, text]) => ({ at: [x, y], text })) })

// ---------- picture cards: the thing, a short real history, one funny line, something to do ----------
type Fun = typeof import('../features/roomfun')
type Down = typeof import('../features/downtown')
type Souv = typeof import('../features/souvenirs')
const fun = (f: (m: Fun) => unknown) => void import('../features/roomfun').then(f)
const down = (f: (m: Down) => unknown) => void import('../features/downtown').then(f)
const souv = (f: (m: Souv) => unknown) => void import('../features/souvenirs').then(f)
/** a home's own lights and hearth (features/apartment.ts) */
const home = (f: (m: typeof import('../features/apartment')) => unknown) => void import('../features/apartment').then(f)
// landmark moments (features/moments): things you do WITH a landmark, in the room. No card, no caption.
const MOMENTS = import.meta.glob('../features/moments/*.ts') as Record<string, () => Promise<Record<string, (g: Game) => void>>>
/** mo('rowboat', 'rowTheLake'): open the moment exported as `fn` from features/moments/<file>.ts */
const mo = (file: string, fn: string): Act => (g) => void MOMENTS[`../features/moments/${file}.ts`]?.().then((m) => m[fn]?.(g))
// dev: playMoment('rowboat', 'rowTheLake') in the console (QA scripts use it before a moment is wired to an object)
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).playMoment = (file: string, fn: string) => mo(file, fn)((window as unknown as { clubNyc: { api: Game } }).clubNyc.api)
const bullMoment: Act = (g) => void import('../features/moments/bull').then((m) => m.rubTheBull(g))
const tossMoment: Act = (g) => void import('../features/moments/coinToss').then((m) => m.coinToss(g))
const flagsMoment: Act = (g) => void import('../features/moments/flags').then((m) => m.flagRollCall(g))


/** a close-up painting of the thing (features/moments/places.ts); `acts` are what its buttons do, by label */
const place = (id: string, acts?: (g: Game) => Record<string, () => void>): Act => (g) => void import('../features/moments/places').then((m) => m.openPlace(g, id, acts?.(g)))
const snap = (line: string) => (g: Game) => fun((m) => m.snap(g, line))
const sitDown = (line?: string, near?: [number, number]) => (g: Game) => fun((m) => m.sitNearest(g, line, near))
const photoBooth = (where: string) => () => void import('../features/photobooth').then((m) => m.openPhotoBooth(where))

// shared cards
const halal = async (g: Game) => {
  const v = await g.choose('🥙 Halal Bros', '“Chicken over rice, my friend? Or… you want to work the lunch rush?”', [
    { label: 'Chicken Over Rice (6)', value: 'buy', note: 'extra white sauce' },
    { label: 'Work the Lunch Rush', value: 'work', note: 'earn coins' },
  ])
  if (v === 'buy') {
    if (!g.spend(6, 'halal-plate')) return
    bump('snacks')
    g.sfx.register()
    g.say('Extra white sauce. The line was worth it. 🥙')
  }
  if (v === 'work') g.playGame('halal-rush')
}

// ---------- rooms ----------
export const ROOMS: Record<string, RoomDef> = {
  'times-square': {
    id: 'times-square', name: 'Times Square', area: 'Crossroads of the World', bg: 'times-square-v2', npcs: 5, mapSpot: 'times-square',
    objects: {
      broadway: exit('Broadway Theater', 'broadway'),
      souvenirs: exit('I ♥ NY Souvenirs', 'iloveny'),
      'red-steps': { label: 'The Red Steps', sit: true },
      hotdog: { label: 'Hot Dog Cart', act: hotdogCart },
      taxi: { label: 'Hail a Taxi', act: taxi, instant: true },
      subway: exit('Subway', 'subway'),
      'exit-left': exit('To Rockefeller Center', 'rockefeller'),
      'exit-right': exit('42nd St → Grand Central', 'grand-central'),
      'pigeon-1': look('Pigeon', coo), 'pigeon-2': look('Pigeon', coo), 'pigeon-3': look('Pigeon', coo),
    },
  },

  broadway: {
    id: 'broadway', name: 'Broadway Theater', area: 'Theater District', bg: 'broadway', indoor: true, npcs: 3, mapSpot: 'times-square',
    objects: {
      stage: { label: 'Watch Tonight’s Show', act: (g) => g.watchShow() },
      curtain: { label: 'Watch Tonight’s Show', act: (g) => g.watchShow() },
      'seats-left': { label: 'Take a Seat', sit: true },
      'seats-right': { label: 'Take a Seat', sit: true },
      'box-left': { label: 'Box Seats', decor: true },
      'box-right': { label: 'Box Seats', decor: true },
      chandelier: look('The Chandelier', mo('chandelier', 'catchTheCrystals')),
      exit: exit('Exit to Times Square', 'times-square'),
    },
  },

  iloveny: {
    id: 'iloveny', name: 'I ♥ NY Souvenirs', area: 'Times Square', bg: 'iloveny', indoor: true, npcs: 2, mapSpot: 'times-square',
    objects: {
      tees: { label: 'Tees & Hoodies', act: shop('iloveny', 'tees') },
      caps: { label: 'Caps & Beanies', act: shop('iloveny', 'hats') },
      crowns: { label: 'Foam Crowns & Torches', act: shop('iloveny', 'hats') },
      globes: { label: 'Snow Globes', act: shop('iloveny', 'globes') },
      postcards: { label: 'Postcards & Gifts', act: shop('iloveny', 'gifts') },
      taxis: { label: 'Toy Taxis & Minis', act: shop('iloveny', 'toys') },
      counter: { label: 'Checkout', act: shop('iloveny') },
      mirror: { label: 'Try Things On', act: () => import('../features/playerCard').then((m) => m.openWardrobe()) },
      booth: { label: 'Changing Room', act: () => import('../features/playerCard').then((m) => m.openWardrobe()) },
      neon: { label: 'Photo Booth', act: photoBooth('I ♥ NY') },
      door: exit('Exit to Times Square', 'times-square'),
    },
  },

  rockefeller: {
    id: 'rockefeller', name: 'Rockefeller Center', area: 'Midtown', bg: 'rockefeller', npcs: 4, mapSpot: 'rockefeller',
    chatter: ['Do I look graceful? I feel graceful.', 'Who’s doing a triple axel?', 'The tree goes up in November!'],
    objects: {
      // the ice is part of the plaza: click it and you walk out and glide (no card, nothing stops you)
      rink: { label: 'The Rink', decor: true },
      statue: look('Prometheus', tossMoment),
      'skate-rental': { label: 'Skate Rentals', act: (g) => (g.owns('skates') ? (g.wear('skates'), g.say('Laced up. Mostly.')) : g.catalog('rink')) },
      'tv-studio': { label: 'Wave on Air!', act: (g) => import('../features/extras').then((m) => m.onAir(g)) },
      flags: look('The Flags', flagsMoment),
      'flags-2': look('The Flags', flagsMoment),
      // the two front benches sit almost entirely under the toolbar: scenery (press S near them to sit)
      'bench-1': { label: 'Bench', decor: true }, 'bench-2': { label: 'Bench', decor: true }, 'bench-3': { label: 'Bench', sit: true },
    },
    zones: {
      'exit-left': exit('To Times Square', 'times-square'),
      'exit-right': exit('To Fifth Avenue', 'fifth-ave'),
    },
  },

  'fifth-ave': {
    id: 'fifth-ave', name: 'Fifth Avenue', area: '5 Av & W 57 St', bg: 'fifth-ave-v2', npcs: 4, mapSpot: 'fifth-ave', steamFrom: 'manhole',
    chatter: ['Window shopping is free!', 'That trunk building is a whole mood.', 'Halal Bros has the best white sauce. Fight me.'],
    objects: {
      'maison-malle': exit('Louis Vuittown', 'maison-malle'),
      'toy-palace': exit('Snacks Fifth Avenue', 'toy-palace'),
      'halal-cart': { label: 'Halal Bros', act: halal },
      // scenery: not hoverable, not clickable (the bell-ringing pop-up was removed 2026-11-13)
      cathedral: { label: 'St. Patrick’s Cathedral', decor: true },
      'street-sign': { label: 'Hail a Taxi', act: taxi, instant: true },
      hydrant: { label: 'Fire Hydrant', act: mo('hydrant', 'openTheHydrant') },
      // under the toolbar, so it can't be clicked: scenery (it still steams)
      manhole: { label: 'Steaming Manhole', decor: true },
      'exit-left': exit('To Rockefeller Center', 'rockefeller'),
      'exit-right': exit('To Central Park', 'central-park'),
    },
  },

  'toy-palace': {
    // (the room id stays 'toy-palace' so saves still land here; it's Snacks Fifth Avenue now)
    id: 'toy-palace', name: 'Snacks Fifth Avenue', area: 'Fifth Avenue', bg: 'saks', indoor: true, npcs: 2, mapSpot: 'fifth-ave',
    chatter: ['Just looking. For four hours.', 'Is the shoe floor really its own zip code?', 'I came for the windows and stayed for the escalators.'],
    objects: {
      shoes: { label: 'The Shoe Floor', act: shop('toys', 'shoes') },
      bench: { label: 'Velvet Bench', sit: true },
      'escalator-left': exit('Up to the Designer Floor', 'saks-2'),
      'escalator-right': exit('Up to the Designer Floor', 'saks-2'),
      chandelier: { label: 'Chandelier', decor: true },
      counter: { label: 'Perfume Counter', act: shop('toys', 'perfume') },
      bags: { label: 'Jewelry & Shades', act: shop('toys', 'jewelry') },
      'display-left': { label: 'Shoe Display', decor: true },
      'display-right': { label: 'Handbag Display', decor: true },
      arch: exit('Exit to Fifth Avenue', 'fifth-ave'),
    },
  },

  // upstairs at Snacks: the designer floor (racks open their own rails of features/catalog.ts)
  'saks-2': {
    id: 'saks-2', name: 'Snacks Fifth Avenue', area: 'The Designer Floor', bg: 'saks-2', indoor: true, npcs: 2, mapSpot: 'fifth-ave',
    chatter: ['I’m only trying it on. For the third time.', 'The fitting room lighting is very forgiving.', 'Is tweed a personality? Asking for me.'],
    objects: {
      gowns: { label: 'Gowns & Jackets', act: shop('toys', 'gowns') },
      suits: { label: 'Tailoring', act: shop('toys', 'tailoring') },
      mannequins: { label: 'This Season', act: shop('toys', 'designer') },
      fitting: { label: 'Fitting Rooms', decor: true },
      mirror: { label: 'Mirror', decor: true },
      escalator: exit('Down to the Ground Floor', 'toy-palace'),
      sofa: { label: 'Velvet Sofa', sit: true },
      chandelier: { label: 'Chandelier', decor: true },
    },
  },

  'maison-malle': {
    id: 'maison-malle', name: 'Louis Vuittown', area: 'Fifth Avenue', bg: 'maison-malle', indoor: true, npcs: 2, mapSpot: 'fifth-ave',
    chatter: ['Is this… real gold?', 'I’m just looking. Expensively.'],
    objects: {
      handbags: { label: 'Handbags', act: shop('maison', 'bags') },
      trunks: { label: 'Ready-to-Wear', act: shop('maison', 'wear') },
      sunglasses: { label: 'Jewelry & Shades', act: shop('maison', 'jewelry') },
      'cash-desk': { label: 'Boutique Desk', act: shop('maison') },
      sofa: { label: 'Velvet Sofa', sit: true },
      staircase: { label: 'VIP Staircase', decor: true },
      'velvet-rope': { label: 'Velvet Rope', decor: true },
      chandelier: { label: 'Chandelier', decor: true },
      // up close: every piece on a mannequin is for sale (features/mannequin.ts)
      'mannequin-1': look('Mannequin', (g) => void import('../features/mannequin').then((m) => m.mannequin(g, 'maison-1'))),
      'mannequin-2': look('Mannequin', (g) => void import('../features/mannequin').then((m) => m.mannequin(g, 'maison-2'))),
      'mannequin-3': look('Mannequin', (g) => void import('../features/mannequin').then((m) => m.mannequin(g, 'maison-3'))),
    },
    zones: { exit: exit('Exit to Fifth Avenue', 'fifth-ave') },
  },

  'central-park': {
    id: 'central-park', name: 'Central Park', area: 'The Lake', bg: 'central-park', npcs: 4, mapSpot: 'central-park',
    chatter: ['843 acres and I still can’t find the zoo.', 'Squirrels here are fearless.', 'Picnic on the Great Lawn later?'],
    objects: {
      // the ride itself, from the seat (features/carriage.ts)
      carriage: { label: 'Horse Carriage Ride', act: (g) => void import('../features/carriage').then((m) => m.carriageRide(g)) },
      boathouse: { label: 'Boathouse Café', act: async (g) => {
        // the café's chalkboard (features/ralphs.ts); ringing it up stays here
        const v = await import('../features/ralphs').then((m) => m.boathouseMenu())
        if (v === 'cocoa') vend('cocoa', 3, 'Hot cocoa by the lake. Very cozy. ☕')(g)
        if (v === 'coffee') vend('coffee', 3, 'Deli coffee, lake view. ☕')(g)
        if (v === 'pretzel') vend('pretzel', 2, 'Warm pretzel, cold air. Perfect. 🥨')(g)
      } },
      // the cart's own board (features/ralphs.ts); ringing it up stays here
      pretzels: { label: 'Pretzel Cart', act: async (g) => {
        const v = await import('../features/ralphs').then((m) => m.pretzelCartMenu())
        if (v === 'pretzel') vend('pretzel', 2, 'Salty, warm, the size of my face. 🥨')(g)
        if (v === 'pretzel-mustard') vend('pretzel-mustard', 3, 'Mustard, obviously. 🥨')(g)
        if (v === 'pretzel-cinnamon') vend('pretzel-cinnamon', 3, 'Cinnamon sugar. My fingers are glitter now. 🥨')(g)
        if (v === 'pretzel-everything') vend('pretzel-everything', 3, 'An everything bagel in pretzel form. Genius. 🥨')(g)
        if (v === 'cocoa') vend('cocoa', 3, 'Cocoa in the park. My hands thank me. ☕')(g)
        if (v === 'coffee') vend('coffee', 3, 'Park bench coffee. The best kind. ☕', 'regular')(g)
      } },
      // the water: three spots to stand at, the Mall, Bethesda Terrace and the Lake with the ducks (features/moments/parkWalk.ts)
      'park-walk': { label: 'Walk to the Lake', act: mo('parkWalk', 'walkThePark') },
      // the ducks: down to the water's edge to watch them (and feed them) up close
      'duck-1': look('Feed the Ducks', mo('parkWalk', 'feedTheDucks')), 'duck-2': look('Feed the Ducks', mo('parkWalk', 'feedTheDucks')), 'duck-3': look('Feed the Ducks', mo('parkWalk', 'feedTheDucks')),
      'squirrel-1': look('Squirrel', mo('squirrel', 'feedTheSquirrel')), 'squirrel-2': look('Squirrel', mo('squirrel', 'feedTheSquirrel')),
      // the bridge and the ducks are the same spot: down at the water's edge, looking up at Bow Bridge
      bridge: look('Bow Bridge', mo('parkWalk', 'feedTheDucks')),
      'bench-1': { label: 'Park Bench', sit: true }, 'bench-2': { label: 'Park Bench', sit: true },
      'exit-left': exit('To Fifth Avenue', 'fifth-ave'),
      'exit-right': exit('To The Met', 'the-met'),
    },
  },

  'the-met': {
    id: 'the-met', name: 'The Met', area: 'Museum Mile', bg: 'the-met', npcs: 5, mapSpot: 'the-met',
    chatter: ['Meet me on the steps!', 'I could spend a week in there.', 'Is it gala night? I feel underdressed.'],
    objects: {
      // up the steps and in through the center doors: the Great Hall, the galleries (features/moments/met.ts)
      doors: { label: 'Go Inside the Met', act: mo('met', 'enterTheMet') },
      // scenery: S still sits you on them (the seats are their own spots)
      steps: { label: 'The Met Steps', decor: true },
      banners: { label: 'The Banners', decor: true },
      'fountain-left': { label: 'Fountain', act: wish }, 'fountain-right': { label: 'Fountain', act: wish },
      hotdog: { label: 'Hot Dog Cart', act: mo('hotdog', 'hotDogCart') },
      pretzel: { label: 'Pretzel Cart', act: vend('pretzel', 2, 'A pretzel on the Met steps. Iconic. 🥨') },
      taxi: { label: 'Hail a Taxi', act: taxi, instant: true },
      'exit-left': exit('To Central Park', 'central-park'),
    },
  },

  // the Empire State Building from the bottom: 34th Street, the lobby, then the elevator up to the deck
  'empire-street': {
    id: 'empire-street', name: 'Empire State Building', area: '34th Street & Fifth Avenue', bg: 'empire-street', npcs: 4, mapSpot: 'empire-state',
    chatter: ['Is the line long today?', 'You can’t see the top from down here.', 'I’ve lived here ten years. Never been up.', 'Meet me under the eagles.'],
    objects: {
      entrance: exit('Go Inside', 'empire-lobby'),
      'eagle-left': { label: 'Stone Eagle', decor: true },
      'eagle-right': { label: 'Stone Eagle', decor: true },
      kiosk: { label: 'Newsstand', decor: true },
      taxi: { label: 'Hail a Taxi', act: taxi, instant: true },
      cart: { label: 'Souvenir Cart', decor: true },
      subway: exit('Down to the Subway', 'subway'),
      'exit-left': exit('Up Fifth Avenue', 'fifth-ave'),
    },
  },

  'empire-lobby': {
    id: 'empire-lobby', name: 'Empire State Building', area: 'Fifth Avenue Lobby', bg: 'empire-lobby', indoor: true, npcs: 4, mapSpot: 'empire-state',
    chatter: ['Eighty-six floors in under a minute.', 'Look at that ceiling.', 'Is this the line for the top?', 'My ears always pop around fifty.'],
    objects: {
      elevator: elevator('Elevator to the 86th Floor', 'empire-deck', true),
      exit: exit('To 34th Street', 'empire-street'),
      mural: look('The Lobby Mural', place('lobby-mural')),
      model: look('Scale Model', place('scale-model')),
      desk: look('Ticket Desk', () => void import('../features/tickets').then((m) => m.desk('empire'))),
    },
  },

  'empire-deck': {
    id: 'empire-deck', name: 'Empire State Building', area: '86th Floor Observatory', bg: 'empire-deck', indoor: true, npcs: 3, mapSpot: 'empire-state',
    chatter: ['I can see my apartment from here!', 'My ears just popped.', '1,050 feet up!'],
    onEnter: (g) => g.stamp('top-of-world'),
    objects: {
      // look out over Midtown: drag, zoom, find the names (features/moments/cityView.ts)
      'viewer-left': { label: 'Look Out Over the City', act: ticketed('empire', 'look', mo('cityView', 'viewFromEmpire')) },
      'viewer-right': { label: 'Look Out Over the City', act: ticketed('empire', 'look', mo('cityView', 'viewFromEmpire')) },
      elevator: elevator('Elevator Down to the Lobby', 'empire-lobby', false),
      blimp: look('The Blimp', mo('blimp', 'airMail')),
      spire: { label: 'The Spire', decor: true },
      chrysler: look('Chrysler Building', place('chrysler')),
    },
  },

  'grand-central': {
    id: 'grand-central', name: 'Grand Central Terminal', area: 'Main Concourse', bg: 'grand-central', indoor: true, npcs: 5, mapSpot: 'grand-central',
    chatter: ['Meet me at the clock.', 'Track 29! Where’s track 29?', 'I always look up in here.'],
    objects: {
      clock: look('The Opal Clock', mo('opalClock', 'opalClock')),
      ceiling: look('The Ceiling', mo('ceiling', 'connectTheStars')),
      departures: look('Departures', mo('departures', 'departuresBoard')),
      whisper: { label: 'Whispering Gallery', act: (g) => import('../features/extras').then((m) => m.whisper(g)) },
      staircase: exit('Down to the Subway', 'subway'),
      flag: { label: 'The Flag', decor: true },
      windows: { label: 'The Windows', decor: true },
    },
    zones: { exit: exit('42nd St → Times Square', 'times-square') },
  },

  subway: {
    id: 'subway', name: 'Subway Station', area: 'Times Sq–42 St', bg: 'subway-empty', geo: 'subway', indoor: true, npcs: 3, mapSpot: 'times-square',
    chatter: ['Showtime! Showtime!', 'Is the express running?', 'Stand clear of the closing doors, please.'],
    objects: {
      // the train comes and goes on a timetable (features/subwayTrain.ts): you board while its doors are open
      train: { label: 'Board the Train', act: (g) => void import('../features/subwayTrain').then((m) => m.board(g)) },
      turnstiles: exit('Exit to Times Square', 'times-square'),
      'map-poster': { label: 'Subway Map', act: (g) => g.openSubway(), instant: true },
      'guitar-case': { label: 'Busker’s Guitar Case', act: (g) => void import('../features/subwayLife').then((m) => m.busker(g)) },
      rat: look('???', (g) => void import('../features/subwayLife').then((m) => m.pizzaRat(g))),
      trash: look('Trash Can', (g) => void import('../features/moments/trashToss').then((m) => m.trashToss(g))),
      bench: { label: 'Bench', sit: true },
      // behind the place name; the map on the wall opens the same thing
      sign: { label: 'Subway Map', decor: true },
    },
  },

  soho: {
    id: 'soho', name: 'SoHo', area: 'Greene St', bg: 'soho', npcs: 5, mapSpot: 'soho', steamFrom: 'manhole',
    chatter: ['Did you see the new drop at THREAD?', 'Cobblestones + heels = bad idea.', 'I come here for the cast iron. And the coffee.'],
    onEnter: mo('tagWall', 'showSohoTag'),
    objects: {
      thread: exit('THREAD', 'thread'),
      'sneaker-vault': exit('Sneaker Vault', 'sneaker-vault'),
      'bean-there': exit('Starducks Coffee', 'coffee'),
      mural: { label: 'Street Art', act: mo('tagWall', 'tagTheWall') },
      vendor: {
        label: 'Street Vendor',
        act: async (g) => {
          const v = await g.choose('🕶️ Street Vendor', '“Designer sunglasses! Totally real! Ten coins. For you, five.”', [
            { label: '“Designer” Shades (5)', value: 'shades' },
            { label: 'Tote Bag (5)', value: 'bag' },
          ])
          if (v === 'shades') vend('designer-shades', 5, 'Definitely real. Definitely. 😎')(g)
          if (v === 'bag') vend('shopping-bag', 5, 'Every New Yorker needs a tote.')(g)
        },
      },
      bikes: { label: 'Bike Rack', act: mo('bikeBells', 'ringTheBells') },
      hydrant: { label: 'Hydrant', decor: true },
      bistro: { label: 'Café Table', sit: true },
      // sits under the toolbar: scenery (it still steams)
      manhole: { label: 'Manhole', decor: true },
      'exit-left': exit('To the High Line', 'high-line'),
      'exit-right': exit('To Chinatown & Little Italy', 'chinatown'),
    },
  },

  thread: {
    id: 'thread', name: 'THREAD', area: 'SoHo', bg: 'thread', indoor: true, npcs: 2, mapSpot: 'soho',
    objects: {
      'rack-left': { label: 'Tops & Dresses', act: shop('thread', 'tops') },
      'rack-right': { label: 'Jackets & Coats', act: shop('thread', 'jackets') },
      table: { label: 'Denim & Bottoms', act: shop('thread', 'bottoms') },
      mannequins: { label: 'Mannequins', act: (g) => void import('../features/mannequin').then((m) => m.mannequin(g, 'thread')) },
      catalog: { label: 'This Week’s Drop', act: shop('thread', 'drops') },
      counter: { label: 'Checkout', act: shop('thread') },
      mirror: { label: 'Try Things On', act: () => import('../features/playerCard').then((m) => m.openWardrobe()) },
      fitting: { label: 'Fitting Room', act: () => import('../features/playerCard').then((m) => m.openWardrobe()) },
      // the red box logo sign: straight to this week's drop (the box logo hoodie, the MetroCard, the brick)
      neon: { label: 'This Week’s Drop', act: shop('thread', 'drops') },
      // tucked under the toolbar: scenery (press S near it to sit)
      bench: { label: 'Bench', decor: true },
      // the stairwell (bottom left) is the way back down to Greene St
      stairs: exit('Exit to SoHo', 'soho'),
    },
  },

  'sneaker-vault': {
    id: 'sneaker-vault', name: 'Sneaker Vault', area: 'SoHo', bg: 'sneaker-vault', indoor: true, npcs: 3, mapSpot: 'soho',
    chatter: ['I camped out for these.', 'Deadstock or nothing.', 'Size 10? Anyone?'],
    objects: {
      wall: { label: 'The Wall', act: shop('sneakers', 'jordans') },
      boxes: { label: 'Extras', act: shop('sneakers', 'extras') },
      counter: { label: 'Checkout', act: shop('sneakers') },
      // crack the dial, walk into the grail room (features/moments/vault.ts)
      vault: { label: 'The Vault', act: mo('vault', 'crackTheVault') },
      bench: { label: 'Try-On Bench', sit: true },
      turntable: { label: 'Turntable', act: (g) => { g.sfx.ding(); g.emote('dance', 4); g.say('This beat goes hard 🎧') } },
      neon: { label: 'Sneaker Vault', decor: true },
      measurer: look('Foot Measurer', (g) => {
        const size = 6 + Math.floor(Math.random() * 7)
        g.say(`Size ${size}${Math.random() < 0.5 ? '½' : ''}. ${['Wide.', 'Narrow.', 'Perfectly average.', 'Sneakerhead certified.'][Math.floor(Math.random() * 4)]} Cool.`)
      }),
    },
    zones: { exit: exit('Exit to SoHo', 'soho') },
  },

  coffee: {
    id: 'coffee', name: 'Starducks Coffee', area: 'SoHo', bg: 'coffee', indoor: true, npcs: 3, mapSpot: 'soho',
    chatter: ['Oat milk, obviously.', 'This is my office now.', 'Best bagels below 14th Street.'],
    objects: {
      counter: {
        label: 'Order Counter',
        act: async (g) => {
          // the green menu board over the counter (features/ralphs.ts); ringing it up stays here
          const v = await import('../features/ralphs').then((m) => m.ralphsMenu())
          const who = baristaName(save.name)
          if (v === 'coffee') vend('coffee', 3, '“We Are Happy To Serve You” ☕', 'regular')(g)
          if (v === 'bagel') vend('bagel', 2, 'Toasted? In New York? Bold. 🥯')(g)
          if (v === 'ralphs-coffee') vend('ralphs-coffee', 4, `“Coffee for ${who}?” Close enough. ☕`)(g)
          if (v === 'cold-brew') vend('cold-brew', 5, 'Cold brew in November. Committed.')(g)
          if (v === 'cookie') vend('cookie', 3, 'The cookie is the size of my face. No notes.')(g)
          if (v === 'black-white') vend('black-white', 3, 'Black and white cookie. Chocolate side first, obviously.')(g)
          if (v === 'croissant') vend('croissant', 3, 'Flaky. I’m wearing half of it now. 🥐')(g)
          if (v === 'latte') {
            await vend('latte', 4, `“Oat latte for… ${who}?” Close enough. ☕`)(g)
            if (g.owns('latte')) g.stamp('misspelled')
          }
          if (v === 'work') g.playGame('bagel-counters')
        },
      },
      espresso: { label: 'Espresso Machine', decor: true },
      // the chalkboard is the menu: click it and you order from it (the same board the counter opens)
      menu: { label: 'Order', act: (g) => ROOMS.coffee.objects?.counter?.act?.(g) },
      sacks: { label: 'Coffee Sacks', decor: true },
      window: { label: 'Window', decor: true },
      armchair: { label: 'Armchair', sit: true },
      'table-1': { label: 'Table', sit: true }, 'table-2': { label: 'Table', sit: true }, 'table-3': { label: 'Table', sit: true },
    },
    zones: { exit: exit('Exit to SoHo', 'soho') },
  },

  chinatown: {
    id: 'chinatown', name: 'Chinatown & Little Italy', area: 'Mott St', bg: 'chinatown', npcs: 5, mapSpot: 'chinatown',
    chatter: ['Soup dumplings or regular? Both.', 'Boba run?', 'Mulberry Street for cannoli after!'],
    objects: {
      // upstairs for dim sum: carts, a stamped card, chopsticks, tea (features/moments/dimSum.ts)
      dumpling: { label: 'Dim Sum Upstairs', act: mo('dimSum', 'dimSum') },
      boba: { label: 'Boba Bay', act: vend('boba', 4, 'Brown sugar boba. Extra pearls. 🧋') },
      pizza: exit('99¢ Slice', 'pizza'),
      arch: look('Little Italy', place('little-italy')),
      fruit: look('Fruit Stand', (g) => { if (!g.spend(1, 'fruit')) return; g.sfx.register(); g.say('A dragon fruit for one coin! Amazing. 🐉') }),
      lanterns: look('Lanterns', mo('lanterns', 'lightTheLanterns')),
      'exit-left': exit('To SoHo', 'soho'),
      'exit-right': exit('To the Brooklyn Bridge', 'brooklyn-bridge'),
    },
  },

  pizza: {
    id: 'pizza', name: '99¢ Slice', area: 'Little Italy', bg: 'pizza', indoor: true, npcs: 2, mapSpot: 'chinatown',
    chatter: ['Fold it. Always fold it.', 'Best slice in the city, no contest.'],
    objects: {
      // first person at the counter: pick a pie, it reheats, shake, fold, eat (features/moments/pizzaSlice.ts)
      counter: { label: 'Order a Slice', act: mo('pizzaSlice', 'orderASlice') },
      oven: { label: 'Work a Shift', act: (g) => g.playGame('slice-factory'), box: true },
      menu: { label: 'Order a Slice', act: mo('pizzaSlice', 'orderASlice') },
      'photos-left': look('Wall of Fame', place('wall-of-fame', (g) => ({ 'Pose for the Wall': () => snap('Signed, framed, hung. In my dreams.')(g) }))),
      'photos-right': { label: 'Wall of Fame', decor: true },
      soda: { label: 'Soda Fridge', act: (g) => { if (!g.spend(1, 'soda')) return; g.sfx.register(); g.say('Ice cold. *crack* Fizzzz. 🥤') } },
      window: { label: 'Window', decor: true },
      // under the coin counter: scenery
      neon: { label: 'OPEN', decor: true },
      boxes: { label: 'Pizza Boxes', decor: true },
      'table-1': { label: 'Table', sit: true }, 'table-2': { label: 'Table', sit: true }, 'table-3': { label: 'Table', sit: true }, 'table-4': { label: 'Table', sit: true },
      door: exit('Exit to Little Italy', 'chinatown'),
    },
  },

  'brooklyn-bridge': {
    id: 'brooklyn-bridge', name: 'Brooklyn Bridge', area: 'Pedestrian Promenade', bg: 'brooklyn-bridge-v2', npcs: 4, mapSpot: 'brooklyn-bridge',
    chatter: ['Golden hour on the bridge 😍', 'You can walk all the way to Brooklyn from here.', 'Please don’t stop for a selfie in the middle.'],
    onEnter: mo('lovelocks', 'paintLocks'),
    objects: {
      easel: { label: 'Skyline Painter', act: (g) => souv((m) => m.openGallery(g)) },
      souvenirs: { label: 'Souvenir Stand', act: (g) => souv((m) => m.openMagnetStand(g)) },
      tugboat: { label: 'Tugboat', decor: true },
      // behind the place name: scenery
      'gull-1': { label: 'Seagull', decor: true },
      'gull-2': { label: 'Seagull', decor: true },
      tower: look('Brooklyn Bridge', place('bridge-tower', (g) => ({ 'Walk the Bridge': () => void import('../features/bridgeWalk').then((w) => w.walkToBrooklyn()), 'Hang a Lock': () => mo('lovelocks', 'loveLocks')(g) }))),
      locks: { label: 'Love Locks', act: mo('lovelocks', 'loveLocks') },
      'exit-left': exit('To Chinatown', 'chinatown'),
      // the far end of the promenade: walk the bridge (features/bridgeWalk.ts). Brooklyn itself isn't built yet.
      'exit-right': { label: 'Walk to Brooklyn', act: () => void import('../features/bridgeWalk').then((m) => m.walkToBrooklyn()) },
    },
    // the little sign by the left railing: back down to the Financial District
    zones: { 'to-wall-street': exit('To Wall Street', 'wall-street') },
  },

  'battery-park': {
    id: 'battery-park', name: 'Battery Park', area: 'Ferry Dock', bg: 'battery-park', npcs: 4, mapSpot: 'battery-park',
    chatter: ['The ferry is free, you know.', 'Look, Lady Liberty!', 'Seagulls, guard your snacks.'],
    objects: {
      tickets: { label: 'Ferry Tickets', act: (g) => g.ferry() },
      ferry: { label: 'Board the Ferry', act: (g) => g.ferry() },
      gangway: { label: 'Board the Ferry', act: (g) => g.ferry() },
      statue: { label: 'Statue of Liberty', decor: true },
      lifebuoy: { label: 'Life Ring', act: mo('lifeRing', 'tossTheRing') },
      'bench-1': { label: 'Bench', sit: true }, 'bench-2': { label: 'Bench', sit: true },
      gull: look('Seagull', (g) => import('../features/extras').then((m) => m.seagull(g))),
      lamp: { label: 'Lamp Post', decor: true },
      'exit-left': exit('To One World Trade', 'one-world-trade'),
    },
  },

  'liberty-island': {
    id: 'liberty-island', name: 'Liberty Island', area: 'New York Harbor', bg: 'liberty-island-v2', npcs: 4, mapSpot: 'liberty',
    chatter: ['She’s even bigger up close!', 'Crown tickets sell out months ahead.', 'I came here on the ferry!'],
    onEnter: (g) => g.stamp('liberty'),
    objects: {
      statue: look('Statue of Liberty', mo('liberty', 'ladyLiberty')),
      fort: { label: 'Fort Wood', decor: true },
      kiosk: { label: 'Souvenir Kiosk', act: shop('liberty') },
      'viewer-1': { label: 'Tower Viewer', act: binoc(295, 118, [[300, 66, 'One World Trade'], [262, 150, 'Lower Manhattan'], [330, 182, 'Battery Park']]) },
      'viewer-2': { label: 'Tower Viewer', act: binoc(714, 72, [[690, 24, 'The torch'], [735, 44, 'The crown'], [734, 96, 'July IV, MDCCLXXVI'], [715, 152, 'The pedestal']]) },
      ferry: {
        label: 'Ferry Back to Manhattan',
        act: async (g) => {
          const v = await g.choose('⛴️ Back to Battery Park', 'The ferry is boarding.', [{ label: 'All Aboard!', value: 'go' }])
          if (v === 'go') g.goto('battery-park', 'liberty-island')
        },
      },
      // almost all of it is under the toolbar: scenery (press S near it to sit)
      bench: { label: 'Bench', decor: true },
      skyline: { label: 'Manhattan Skyline', decor: true },
      gulls: { label: 'Seagulls', decor: true },
    },
  },

  'high-line': {
    id: 'high-line', name: 'The High Line', area: 'Chelsea', bg: 'high-line', npcs: 4, mapSpot: 'high-line',
    chatter: ['This used to be a freight railroad!', 'Best sunset spot in the city.', 'Gelato on the High Line > everything.'],
    objects: {
      loungers: { label: 'Rolling Loungers', sit: true },
      bench: { label: 'Bench', sit: true },
      // the cart's own board (features/ralphs.ts); ringing it up stays here
      gelato: { label: 'Gelato Cart', act: async (g) => {
        const v = await import('../features/ralphs').then((m) => m.gelatoCartMenu())
        const line: Record<string, string> = {
          'gelato-pistachio': 'Pistachio. The color of the High Line in June. 🍨',
          'gelato-strawberry': 'Strawberry. It’s dripping. Worth it. 🍨',
          'gelato-chocolate': 'Chocolate. I regret nothing. 🍨',
          'gelato-stracciatella': 'Stracciatella. Fun to eat, hard to spell. 🍨',
          'gelato-lemon': 'Lemon sorbet. My whole face just woke up. 🍨',
          'gelato-mango': 'Mango sorbet, matching the sunset. 🍨',
          gelato: 'Pistachio and strawberry. Yes, both. 🍨',
        }
        if (v && line[v]) vend(v, 3, line[v])(g)
      } },
      stairs: exit('Down to Chelsea Market', 'chelsea-market'),
      sailboat: { label: 'Sailboat', decor: true },
      'river-view': { label: 'Hudson River View', act: binoc(840, 120, [[860, 100, 'Hudson River'], [900, 140, 'New Jersey'], [810, 180, 'Chelsea Piers']]) },
      'water-tower': { label: 'Water Tower', decor: true },
      'exit-left': exit('To SoHo', 'soho'),
    },
    zones: { 'exit-north': { ...exit('North to Hudson Yards', 'hudson-yards'), sign: 'up' } },
  },

  'hudson-yards': {
    id: 'hudson-yards', name: 'Hudson Yards', area: 'West Side', bg: 'hudson-yards', npcs: 4, mapSpot: 'hudson-yards',
    chatter: ['2,500 steps. I counted. Then I lost count.', 'It’s a staircase to more staircase.', 'The 7 train ends right here.', 'Sunset from the top is the move.'],
    objects: {
      // a ticket, then a landing to look out from: the Hudson side, the Midtown side, up the middle (features/moments/vessel.ts)
      vessel: { label: 'Visit the Vessel', act: ticketed('vessel', 'admit', mo('vessel', 'climbTheVessel')) },
      subway: { label: 'Subway', act: (g) => g.openSubway(), instant: true },
      'bench-left': { label: 'Bench', sit: true },
      'bench-right': { label: 'Bench', sit: true },
      stairs: exit('Down to the High Line', 'high-line'),
    },
  },

  'chelsea-market': {
    id: 'chelsea-market', name: 'Chelsea Market', area: 'Old Biscuit Factory', bg: 'chelsea-market-v2', indoor: true, npcs: 5, mapSpot: 'high-line',
    chatter: ['A famous cookie was invented in this building!', 'Freight trains used to run right through here.', 'The taco line moves fast. Have your order ready.', 'Half dozen oysters, then doughnuts. That’s lunch.', 'I came in for one book.'],
    objects: {
      waterfall: { label: 'The Waterfall', act: wish },
      // each shop is its own first-person scene over its own painting (features/moments)
      tacos: { label: 'Dos Tacos No. 2', act: mo('tacos', 'tacoStand') },
      lobster: { label: 'The Lobster Spot', act: mo('oysterBar', 'oysterBar') },
      books: { label: 'Postman Books', act: mo('bookshop', 'bookshop') },
      donuts: { label: 'Doughnut Dept.', act: mo('doughnuts', 'doughnutDept') },
      bench: { label: 'Bench', sit: true },
      stairs: exit('Up to the High Line', 'high-line'),
      clock: { label: 'Factory Clock', decor: true },
    },
  },

  parade: {
    id: 'parade', name: 'Halloween Parade', area: 'Sixth Ave & W 10 St', bg: 'parade', npcs: 7, mapSpot: 'soho',
    chatter: ['Trick or treat!', 'Have you found all the candy corn?', 'That skeleton waved at me.', 'Best costume wins… nothing! But still.', '🎃', '👻', 'Happy Halloween!'],
    onEnter: (g) => g.stamp('party-animal'),
    objects: {
      'candy-stand': { label: 'Free Costumes!', act: () => void import('../features/party').then((m) => m.openCostumeStand()) },
      float: { label: 'Pumpkin Float', decor: true },
      skeleton: { label: 'Giant Skeleton', decor: true },
      'photo-booth': { label: 'Spooky Photo Booth', act: photoBooth('Halloween') },
      cauldron: { label: 'Bubbling Cauldron', decor: true },
      tombstones: { label: 'Tombstones', decor: true },
      signs: { label: '6 Av & W 10 St', decor: true },
      manhole: { label: 'Manhole', decor: true },
      'exit-left': exit('To SoHo', 'soho'),
      'exit-right': exit('To Times Square', 'times-square'),
    },
  },

  // ---------- Lower Manhattan ----------
  'wall-street': {
    id: 'wall-street', name: 'Wall Street', area: 'Financial District', bg: 'wall-street', npcs: 3, mapSpot: 'wall-street',
    chatter: ['Did you rub The Bull yet? 🐂', 'SLICE is up again on the big board.', 'Washington took the oath right up there.', 'Hot dog for lunch. Power move.'],
    objects: {
      'exit-left': exit('To One World Trade', 'one-world-trade'),
      'exit-right': exit('To the Brooklyn Bridge', 'brooklyn-bridge'),
      bull: { label: 'The Bull', act: bullMoment },
      ticker: look('The Big Board', () => down((m) => m.bigBoard())),
      // step inside: the trading floor, today's IPO and the opening bell (features/exchange.ts)
      // one way in: the doors. The facade around them is scenery (it used to be a second "The Exchange" hotspot)
      exchange: { label: 'The Exchange', decor: true },
      door: exit('The Exchange', 'exchange-floor'),
      'federal-hall': look('Federal Hall', sitDown('Sitting where the Founders sat. Roughly. Ish.', [250, 330])),
      church: look('Trinity Church', place('trinity')),
      cart: { label: 'Hot Dog Cart', act: mo('hotdog', 'hotDogCart') },
      subway: { label: 'Subway', act: (g) => g.openSubway() },
      'pigeon-1': look('Pigeon', coo), 'pigeon-2': look('Pigeon', coo),
    },
    zones: { steps: { label: 'Federal Hall Steps', sit: true } },
  },

  // the trading floor inside the Exchange: a new company goes public every day and somebody rings the bell
  'exchange-floor': {
    id: 'exchange-floor', name: 'The Exchange', area: 'Wall Street', bg: 'exchange-floor', indoor: true, npcs: 4, mapSpot: 'wall-street',
    chatter: ['Who’s ringing the bell today?', 'I’m long pretzels.', 'Buy the rumor, sell the bagel.', 'My broker is a pigeon. Up 12%.'],
    objects: {
      bell: { label: 'The Opening Bell', act: (g) => void import('../features/exchange').then((m) => m.ringOpeningBell(g)) },
      screen: look('Today’s IPO', (g) => void import('../features/exchange').then((m) => m.readScreen(g))),
      'post-left': { label: 'Trading Post', act: () => down((m) => m.bigBoard()) },
      'post-right': { label: 'Trading Post', act: () => down((m) => m.bigBoard()) },
      exit: exit('To Wall Street', 'wall-street'),
    },
  },

  'one-world-trade': {
    id: 'one-world-trade', name: 'One World Trade', area: 'Lower Manhattan', bg: 'one-world-trade', npcs: 3, mapSpot: 'wtc',
    chatter: ['The elevator only takes a minute!', 'Have you seen the view from the top?', 'Pretzel after this?', 'The Oculus looks like wings.'],
    objects: {
      'exit-left': exit('To Battery Park', 'battery-park'),
      oculus: exit('To Wall Street', 'wall-street'),
      tower: look('One World Trade Center', place('owt-tower', (g) => ({ 'Ride to the Top': () => ticketed('oneworld', 'admit', (g2) => down((m) => m.elevatorUp(g2)))(g) }))),
      doors: { label: 'Sky Deck Elevators', act: ticketed('oneworld', 'admit', (g) => down((m) => m.elevatorUp(g))) },
      // up close at the parapet: the water, the names, a white rose (features/memorial.ts); quiet, never a game
      pool: { label: '9/11 Memorial', act: () => void import('../features/memorial').then((m) => m.visitMemorial()) },
      tree: look('The Survivor Tree', place('survivor-tree', (g) => ({ 'Sit a While': () => sitDown()(g) }))),
      subway: look('Subway', place('oculus', (g) => ({ 'Ride the Subway': () => g.openSubway(), 'Walk to Wall Street': () => g.goto('wall-street', 'one-world-trade') }))),
      cart: { label: 'Coffee & Pretzel Cart', act: async (g) => {
        // the cart's own menu (features/ralphs.ts); ringing it up stays here
        const v = await import('../features/ralphs').then((m) => m.plazaCartMenu())
        if (v === 'coffee') vend('coffee', 3, 'Coffee with a view of the tallest building around. ☕', 'regular')(g)
        if (v === 'pretzel') vend('pretzel', 2, 'Downtown pretzel. Same salt, taller buildings. 🥨')(g)
        if (v === 'sit') sitDown('A bench in the shade of the tallest building around.')(g)
      } },
      'bench-1': { label: 'Bench', sit: true }, 'bench-2': { label: 'Bench', sit: true },
    },
  },

  'sky-deck': {
    id: 'sky-deck', name: 'Sky Deck 102', area: '102nd Floor', bg: 'sky-deck', indoor: true, npcs: 3, mapSpot: 'wtc',
    chatter: ['My ears just popped.', 'That elevator was faster than my commute.', 'I can see Lady Liberty!', 'Don’t look down. I looked down.'],
    onEnter: (g) => g.stamp('sky-deck'),
    objects: {
      elevator: { label: 'Elevator Down to the Plaza', act: (g) => down((m) => m.elevatorDown(g)) },
      // the harbor from the top of One World Trade (features/moments/cityView.ts)
      'viewer-1': { label: 'Look Out Over the Harbor', act: ticketed('oneworld', 'look', mo('cityView', 'viewFromOneWorld')) },
      'viewer-2': { label: 'Look Out Over the Harbor', act: ticketed('oneworld', 'look', mo('cityView', 'viewFromOneWorld')) },
      // the disc in the floor: jump on it, or lie down and look straight down (features/moments/skyPortal.ts)
      portal: { label: 'The Sky Portal', act: mo('skyPortal', 'skyPortal') },
      // the café's menu board (features/ralphs.ts); ringing it up stays here
      cafe: {
        label: 'Cloud Nine Café',
        act: async (g) => {
          const v = await import('../features/ralphs').then((m) => m.cloudNineMenu())
          if (v === 'sit') return sitDown('Best seat in the city. Literally the highest.')(g)
          if (v === 'cocoa') vend('cocoa', 3, 'Cocoa above the clouds. Fancy. ☕')(g)
          if (v === 'coffee') vend('coffee', 3, 'The highest coffee in the hemisphere. ☕', 'regular')(g)
          if (v === 'latte') vend('latte', 4, 'Foam on top, clouds below. ☕')(g)
          if (v === 'cookie') vend('cookie', 3, 'A cookie with a view. The view is winning.')(g)
          if (v === 'croissant') vend('croissant', 3, 'Flaky at 1,250 feet. 🥐')(g)
          if (v === 'pretzel') vend('pretzel', 2, 'Salted at altitude. 🥨')(g)
        },
      },
      booth: { label: 'Sky Deck Photo Booth', act: photoBooth('Sky Deck') },
      'view-liberty': { label: 'Statue of Liberty', decor: true },
      'view-empire': { label: 'Empire State Building', decor: true },
      'view-bridge': { label: 'Brooklyn Bridge', decor: true },
    },
  },

  apartment: {
    id: 'apartment', name: 'My Apartment', area: 'A 5th-floor walk-up', bg: 'apartment', indoor: true, npcs: 0, mapSpot: 'apartment',
    objects: {
      door: { label: 'Leave', act: (g) => g.openMap(), instant: true },
      window: { label: 'Window', decor: true },
      // the blind rolled up over the glass: pull it down over the view and back up (features/apartment.ts pullBlind)
      blind: look('Blinds', () => home((m) => m.pullBlind())),
      radiator: { label: 'Radiator', decor: true },
      fridge: { label: 'Fridge', act: (g) => souv((m) => m.openFridge(g)) },
      stove: { label: 'Stove', decor: true },
      kitchen: { label: 'Kitchen', decor: true },
      // under the first-day list in the corner, so it's scenery rather than a hotspot nobody can reach
      hooks: { label: 'Coat Hooks', decor: true },
    },
  },

  // the bigger homes from StreetCheesy (decorated like the walk-up; your furniture is kept per home)
  loft: {
    id: 'loft', name: 'My Loft', area: 'SoHo', bg: 'loft', indoor: true, npcs: 0, mapSpot: 'apartment',
    objects: {
      door: { label: 'Leave', act: (g) => g.openMap(), instant: true },
      stairs: { label: 'Spiral Stairs', decor: true },
      window: { label: 'Arched Windows', decor: true },
      easel: { label: 'Easel', decor: true },
      pendants: look('Pendant Lights', () => home((m) => m.switchFixture('pendants'))),
      island: { label: 'Kitchen Island', decor: true },
      kitchen: look('Kitchen', (g) => souv((m) => m.openFridge(g))),
    },
  },

  brownstone: {
    id: 'brownstone', name: 'My Brownstone', area: 'West Village', bg: 'brownstone', indoor: true, npcs: 0, mapSpot: 'apartment',
    objects: {
      door: { label: 'Leave', act: (g) => g.openMap(), instant: true },
      fireplace: look('Fireplace', () => home((m) => m.lightFire())),
      chandelier: look('Chandelier', () => home((m) => m.switchFixture('chandelier'))),
      window: { label: 'Bay Window', decor: true },
      bookshelf: { label: 'Built-In Shelves', decor: true },
      kitchen: look('Kitchen', (g) => souv((m) => m.openFridge(g))),
    },
  },

  'sky-residence': {
    id: 'sky-residence', name: 'My Sky Residence', area: 'Hudson Yards', bg: 'sky-residence', indoor: true, npcs: 0, mapSpot: 'apartment',
    objects: {
      door: { label: 'Leave', act: (g) => g.openMap(), instant: true },
      pendants: look('Pendant Lights', () => home((m) => m.switchFixture('pendants'))),
      stairs: { label: 'Floating Stairs', decor: true },
      view: { label: 'The View', decor: true },
      kitchen: look('Kitchen', (g) => souv((m) => m.openFridge(g))),
    },
  },

  penthouse: {
    id: 'penthouse', name: 'My Penthouse', area: 'Billionaires’ Row', bg: 'penthouse', indoor: true, npcs: 0, mapSpot: 'apartment',
    objects: {
      door: { label: 'Leave', act: (g) => g.openMap(), instant: true },
      telescope: { label: 'Telescope', decor: true },
      'dj-nook': look('DJ Nook', (g) => {
        g.say('Your own DJ booth. Throw a house party and the music plays right here!')
        void import('../features/houseparty').then((m) => m.openPartyPanel())
      }),
      'olive-tree': { label: 'Olive Tree', decor: true },
      'olive-tree-2': { label: 'Olive Tree', decor: true },
      bar: { label: 'Built-In Bar', decor: true },
      view: { label: 'The View', decor: true },
    },
  },
}
