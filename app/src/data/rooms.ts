import type { Game, ObjDef, RoomDef } from '../types'
import type { CardAction, Pic, PicCardOpts } from '../features/infocard'
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
const FOOD = new Set(['hotdog', 'pretzel', 'cocoa', 'coffee', 'latte', 'bagel', 'dumplings', 'boba', 'pizza-slice', 'gelato', 'donut', 'ralphs-coffee', 'cold-brew', 'cookie', 'black-white', 'croissant'])
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
const say = (line: string | string[]): Act => (g) => g.say(Array.isArray(line) ? line[Math.floor(Math.random() * line.length)] : line)
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
  setTimeout(() => g.openMap(), 650)
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
// landmark moments (features/moments): things you do WITH a landmark, in the room. No card, no caption.
const MOMENTS = import.meta.glob('../features/moments/*.ts') as Record<string, () => Promise<Record<string, (g: Game) => void>>>
/** mo('rowboat', 'rowTheLake'): open the moment exported as `fn` from features/moments/<file>.ts */
const mo = (file: string, fn: string): Act => (g) => void MOMENTS[`../features/moments/${file}.ts`]?.().then((m) => m[fn]?.(g))
// dev: playMoment('rowboat', 'rowTheLake') in the console (QA scripts use it before a moment is wired to an object)
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).playMoment = (file: string, fn: string) => mo(file, fn)((window as unknown as { clubNyc: { api: Game } }).clubNyc.api)
const bullMoment: Act = (g) => void import('../features/moments/bull').then((m) => m.rubTheBull(g))
const tossMoment: Act = (g) => void import('../features/moments/coinToss').then((m) => m.coinToss(g))
const flagsMoment: Act = (g) => void import('../features/moments/flags').then((m) => m.flagRollCall(g))

/** a traced object's own picture: /art/cutouts/<room>/<obj>.png */
const pic = (room: string, obj: string, backdrop?: string): Pic => ({ cut: room, obj, backdrop })
/** a crop of a room's art ([x, y, w, h] in the room's 1000 × 565 space; `bg` is the room's background file) */
const view = (bg: string, rect: [number, number, number, number]): Pic => ({ room: bg, rect })

type CardDef = Omit<PicCardOpts, 'actions'> & { actions?: (g: Game) => CardAction[]; stamp?: string }
const card = (o: CardDef): Act => (g) =>
  void import('../features/infocard').then((m) => {
    const { actions, stamp, ...rest } = o
    m.picCard({ ...rest, actions: actions?.(g) })
    if (stamp) g.stamp(stamp)
  })
const snap = (line: string) => (g: Game) => fun((m) => m.snap(g, line))
const sitDown = (line?: string, near?: [number, number]) => (g: Game) => fun((m) => m.sitNearest(g, line, near))
const photoBooth = (where: string) => () => void import('../features/photobooth').then((m) => m.openPhotoBooth(where))

// shared cards
const boxSeats = card({
  title: 'Box Seats', kicker: 'Broadway Theater', pic: pic('broadway', 'box-left'),
  text: 'Theater boxes were built for being seen, not for seeing: from up there you get half the stage and all of the audience. Broadway has 41 big theaters, most of them built between 1903 and 1928.',
  joke: 'Sold out. To a very rich pigeon.',
  actions: (g) => [{ label: 'Wave at the Box', act: () => (g.emote('wave', 2), g.say('The very rich pigeon waves back. Sort of.')) }],
})
const ownSkates = (g: Game): CardAction =>
  g.owns('skates')
    ? { label: 'Wear Your Skates', act: () => (g.wear('skates'), g.say('Laced up. Mostly.')) }
    : { label: 'Rent Skates', note: '15 coins', act: () => g.catalog('rink') }
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
const libertyTorch = card({
  title: 'The Torch', kicker: 'Closed Since 1916', pic: view('liberty-island-v2', [660, 0, 96, 72]),
  text: 'Visitors could once climb up into the torch. It closed in 1916 after an explosion on a nearby pier damaged the arm. The original torch was replaced in 1986 and now stands in the island’s museum; the new flame is covered in 24-karat gold.',
  joke: 'The torch is closed. She does not take visitors on her arm.',
})
const libertyPedestal = card({
  title: 'The Pedestal', kicker: 'Paid For by 120,000 People', pic: view('liberty-island-v2', [664, 130, 130, 105]),
  text: 'France gave the statue; Americans had to pay for the pedestal. In 1885 a New York newspaper printed the name of every donor, and more than 120,000 people chipped in, most of them less than a dollar. A plaque with Emma Lazarus’s poem “The New Colossus” was added in 1903.',
  joke: 'The original crowdfunding campaign. No tote bag for donors, though.',
})

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
      'box-left': look('Box Seats', boxSeats),
      'box-right': look('Box Seats', boxSeats),
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
      neon: look('Photo Booth', card({
        title: 'I ♥ NY', kicker: 'Since 1977', pic: pic('iloveny', 'neon', 'linear-gradient(170deg, #2b1030, #6a1d3a)'),
        text: 'Milton Glaser sketched the logo in 1977, in red crayon on the back of an envelope, during a taxi ride. It was for a state tourism campaign, he did it for free, and it became one of the most copied designs on Earth.',
        joke: 'Half the shirts in this store say it. The other half say it louder.',
        actions: () => [{ label: 'Pose Under the Neon', note: 'friends nearby squeeze in', primary: true, act: photoBooth('I ♥ NY') }],
      })),
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
      'skate-rental': { label: 'Skate Rentals', act: card({
        title: 'Skate Rentals', kicker: 'The Rink', pic: pic('rockefeller', 'skate-rental'),
        text: 'Skating here is a New York tradition: the rink usually opens in October and stays open into spring. Rent skates, then walk onto the ice to glide.',
        joke: 'Falling is free. Getting back up is extra.',
        actions: (g) => [
          { ...ownSkates(g), primary: true },
          { label: 'Skate a Lap', act: () => fun((m) => m.skateLap(g)) },
          { label: 'Do a Spin', act: () => fun((m) => m.skateSpin(g)) },
        ],
      }) },
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
    onEnter: (g) => {
      if (!g.owns('skates')) setTimeout(() => g.toast('Tip: rent skates at the booth, then walk onto the ice', '⛸️'), 900)
    },
  },

  'fifth-ave': {
    id: 'fifth-ave', name: 'Fifth Avenue', area: '5 Av & W 57 St', bg: 'fifth-ave-v2', npcs: 4, mapSpot: 'fifth-ave', steamFrom: 'manhole',
    chatter: ['Window shopping is free!', 'That trunk building is a whole mood.', 'Halal Bros has the best white sauce. Fight me.'],
    objects: {
      'maison-malle': exit('Louis Vuittown', 'maison-malle'),
      'toy-palace': exit('Snacks Fifth Avenue', 'toy-palace'),
      'halal-cart': { label: 'Halal Bros', act: halal },
      cathedral: look('St. Patrick’s Cathedral', mo('bells', 'ringTheBells')),
      'street-sign': look('5 Av & W 57 St', card({
        title: 'Fifth Avenue', kicker: '5 Av & W 57 St', pic: pic('fifth-ave', 'street-sign'),
        text: 'Fifth Avenue splits Manhattan in two: street addresses are “East” on one side and “West” on the other. It’s regularly ranked the most expensive shopping street in the world.',
        joke: 'The most expensive shopping street on Earth. I bought a pretzel.',
        actions: (g) => [{ label: 'Hail a Taxi', primary: true, act: () => taxi(g) }],
      })),
      hydrant: { label: 'Fire Hydrant', act: mo('hydrant', 'openTheHydrant') },
      manhole: look('Steaming Manhole', card({
        title: 'Steaming Manhole', kicker: 'Under Fifth Avenue', pic: pic('fifth-ave', 'manhole'),
        text: 'The steam is real: New York runs the biggest commercial steam system in the country, about 100 miles of pipes under Manhattan carrying steam to heat and cool buildings. Now and then a little escapes.',
        joke: 'Now you know where the steam comes from. Don’t tell anyone.',
        actions: (g) => [{ label: 'Stand in the Steam', act: () => (g.emote('cheer', 2), g.say('Instant facial. Very New York.')) }],
      })),
      'exit-left': exit('To Rockefeller Center', 'rockefeller'),
      'exit-right': exit('To Central Park', 'central-park'),
    },
  },

  'toy-palace': {
    // (the room id stays 'toy-palace' so saves still land here; it's Snacks Fifth Avenue now)
    id: 'toy-palace', name: 'Snacks Fifth Avenue', area: 'Fifth Avenue', bg: 'saks', indoor: true, npcs: 2, mapSpot: 'fifth-ave',
    chatter: ['Just looking. For four hours.', 'Is the shoe floor really its own zip code?', 'I came for the windows and stayed for the escalators.'],
    objects: {
      shoes: look('10022-SHOE', card({
        title: 'The Shoe Floor', kicker: 'Zip Code 10022-SHOE', pic: pic('toy-palace', 'shoes'),
        text: 'Snacks’ shoe floor is so big that when it opened in 2007 it got its own zip code from the Postal Service: 10022-SHOE.',
        joke: 'Mail a letter here and it comes back in a better pair of shoes.',
        actions: (g) => [{ label: 'Browse Shoes', primary: true, act: () => shop('toys', 'shoes')(g) }],
      })),
      bench: { label: 'Velvet Bench', sit: true },
      'escalator-left': look('Escalator', say(['The upper floors are for advanced shoppers. I’m still on level one.', 'Going up! The view from floor 2 is mostly other escalators.'])),
      'escalator-right': look('Escalator', say(['Riding an escalator just to look around. Very New York.', 'Stand right, walk left. Even in Snacks.'])),
      chandelier: look('Chandelier', say('That chandelier costs more than my apartment. Probably the whole building.')),
      counter: look('Perfume Counter', card({
        title: 'Perfume Counter', kicker: 'Snacks Fifth Avenue', pic: pic('toy-palace', 'counter'),
        text: 'Snacks opened on Fifth Avenue in 1924. Every holiday season its whole facade lights up in a light show, and the crowd on the sidewalk outside is part of the tradition.',
        joke: 'One spritz and you smell like a department store. Congratulations.',
        actions: (g) => [
          { label: 'Shop', primary: true, act: () => shop('toys')(g) },
          { label: 'Try a Sample', act: () => g.say('*spritz* Notes of bergamot, cedar and a 45-minute wait.') },
        ],
      })),
      bags: { label: 'Jewelry & Shades', act: shop('toys', 'jewelry') },
      'display-left': { label: 'Shoe Display', decor: true },
      'display-right': { label: 'Handbag Display', decor: true },
      arch: exit('Exit to Fifth Avenue', 'fifth-ave'),
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
      staircase: look('VIP Staircase', card({
        title: 'VIP Staircase', kicker: 'Louis Vuittown', pic: pic('maison-malle', 'staircase'),
        text: 'Fifth Avenue flagships are built to impress: marble, brass and a staircase you’re not allowed to climb. The salon upstairs is by appointment only.',
        joke: 'The next free appointment is in 2029. Bring a snack.',
        actions: (g) => [{ label: 'Ask for an Appointment', act: () => g.say('“We’ll call you.” They will not call me.') }],
      })),
      'velvet-rope': look('Velvet Rope', card({
        title: 'Velvet Rope', kicker: 'Very Exclusive', pic: pic('maison-malle', 'velvet-rope'),
        text: 'Brass posts and velvet ropes started out keeping lines tidy in grand old theaters and hotels. In a boutique they mostly keep the mystery tidy.',
        joke: 'Ooh. A rope. That means it’s exclusive.',
        actions: (g) => [{ label: 'Step Over It', act: () => g.say('A security guard clears his throat. I step right back over.') }],
      })),
      chandelier: look('Chandelier', card({
        title: 'Chandelier', kicker: 'Louis Vuittown', pic: pic('maison-malle', 'chandelier'),
        text: 'Store rents on Fifth Avenue in the 50s are some of the highest in the world, so every square foot has to sparkle. This one sparkles on purpose.',
        joke: 'This chandelier costs more than my rent. Probably. Possibly. Definitely.',
      })),
      'mannequin-1': look('Mannequin', snap('Serving looks. Literally.')), 'mannequin-2': look('Mannequin', snap('Camel coat season. I’m the camel.')), 'mannequin-3': look('Mannequin', snap('Very chic. The mannequin won.')),
    },
    zones: { exit: exit('Exit to Fifth Avenue', 'fifth-ave') },
  },

  'central-park': {
    id: 'central-park', name: 'Central Park', area: 'The Lake', bg: 'central-park', npcs: 4, mapSpot: 'central-park',
    chatter: ['843 acres and I still can’t find the zoo.', 'Squirrels here are fearless.', 'Picnic on the Great Lawn later?'],
    objects: {
      carriage: { label: 'Horse Carriage Ride', act: (g) => import('../features/extras').then((m) => m.carriageRide(g)) },
      boathouse: { label: 'Boathouse Café', act: card({
        title: 'Boathouse Café', kicker: 'Central Park', pic: pic('central-park', 'boathouse'),
        text: 'The park’s boathouse has stood on The Lake since 1954. From spring to fall you can rent a rowboat here and row right under Bow Bridge. In October the cocoa season starts.',
        joke: 'Hot cocoa by the lake: the most cinematic way to spend 3 coins.',
        actions: (g) => [
          { label: 'Hot Cocoa (3)', primary: true, act: () => vend('cocoa', 3, 'Hot cocoa by the lake. Very cozy. ☕')(g) },
          { label: 'Soft Pretzel (2)', act: () => vend('pretzel', 2, 'Warm pretzel, cold air. Perfect. 🥨')(g) },
          { label: 'Take It to a Bench', act: () => sitDown('A bench, a snack and a view. Peak autumn. 🍂')(g) },
          { label: 'Rent a Rowboat (3)', act: () => mo('rowboat', 'rowTheLake')(g) },
        ],
      }) },
      pretzels: { label: 'Pretzel Cart', act: card({
        title: 'Pretzel Cart', kicker: 'Central Park', pic: pic('central-park', 'pretzels'),
        text: 'Soft pretzels came over with German immigrants in the 1800s, and New York’s street carts have sold them ever since. Best warm, with mustard, on a park bench.',
        joke: 'Salty, warm and the size of my face.',
        actions: (g) => [
          { label: 'Buy a Pretzel (2)', primary: true, act: () => vend('pretzel', 2, 'Salty, warm, the size of my face. 🥨')(g) },
          { label: 'Sit with It', act: () => sitDown('Pretzel on a park bench. Living the dream.')(g) },
          { label: 'Share with a Squirrel', act: () => mo('squirrel', 'feedTheSquirrel')(g) },
        ],
      }) },
      rowboat: { label: 'Rowboat', act: mo('rowboat', 'rowTheLake') },
      // the water: a walk down the Mall, past Bethesda, to sit at the Lake with the ducks (features/moments/parkWalk.ts)
      'park-walk': { label: 'Walk to the Lake', act: mo('parkWalk', 'walkThePark') },
      // the ducks: down to the water's edge to watch them (and feed them) up close
      'duck-1': look('Ducks', mo('parkWalk', 'walkThePark')), 'duck-2': look('Ducks', mo('parkWalk', 'walkThePark')), 'duck-3': look('Ducks', mo('parkWalk', 'walkThePark')),
      'squirrel-1': look('Squirrel', mo('squirrel', 'feedTheSquirrel')), 'squirrel-2': look('Squirrel', mo('squirrel', 'feedTheSquirrel')),
      bridge: look('Bow Bridge', card({
        title: 'Bow Bridge', kicker: 'Central Park', pic: view('central-park', [345, 80, 330, 175]),
        text: 'A cast-iron bridge over The Lake, finished in 1862 and designed by Calvert Vaux and Jacob Wrey Mould. It’s named for its shape: a curve like an archer’s bow.',
        joke: 'Probably the most-proposed-on spot in the city. Stand here too long and someone kneels.',
        facts: ['Built 1862', 'Cast iron', 'Seen in a hundred movies'],
        actions: (g) => [
          { label: 'Pop the Question', primary: true, act: () => fun((m) => m.kneel(g, 'Will you be my favorite bridge? …It said yes. 💖', true)) },
          { label: 'Take a Photo', act: () => snap('Me and Bow Bridge. Classic.')(g) },
        ],
      })),
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
      steps: { label: 'The Met Steps', sit: true },
      banners: look('The Banners', card({
        title: 'The Banners', kicker: 'The Met', pic: pic('the-met', 'banners'),
        text: 'The giant banners announce the special exhibitions. The museum was founded in 1870, and this grand Fifth Avenue front opened in 1902.',
        joke: 'This season: “Hot Dogs Through the Ages.” Kidding. Probably.',
        actions: (g) => [{ label: 'Take a Photo', act: () => snap('Me and the banners. Very cultured.')(g) }],
      })),
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
      'eagle-left': look('Stone Eagle', (g) => g.say('He’s been watching this door since 1931. Hasn’t blinked once.')),
      'eagle-right': look('Stone Eagle', (g) => g.say('Two eagles. Zero pigeons on them. Respect.')),
      kiosk: look('Newsstand', (g) => g.say('Papers, gum, lottery tickets. The whole economy in one box.')),
      taxi: { label: 'Hail a Taxi', act: taxi, instant: true },
      cart: look('Souvenir Cart', (g) => g.say('A tiny building with a tiny gorilla. I’ll think about it.')),
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
      mural: look('The Lobby Mural', card({
        title: 'The Lobby Mural', kicker: 'Empire State Building', pic: pic('empire-lobby', 'mural'),
        text: 'The building in metal relief, with beams of light fanning out behind it, has faced the Fifth Avenue doors since opening day in 1931. The whole tower went up in 410 days.',
        joke: 'A building with a portrait of itself in its own lobby. Confidence.',
        facts: ['Opened 1931', 'Built in 410 days'],
      })),
      model: look('Scale Model', card({
        title: 'Scale Model', kicker: 'Fifth Avenue Lobby', pic: pic('empire-lobby', 'model'),
        text: '102 floors, 1,454 feet to the tip, and 73 elevators. It was the tallest building in the world for almost 40 years.',
        joke: 'This one has no elevator line.',
        facts: ['102 floors', '73 elevators'],
      })),
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
      spire: look('The Spire', card({
        title: 'The Spire', kicker: 'Empire State Building', pic: pic('empire-deck', 'spire'),
        text: 'The mast on top was built so airships could dock and let passengers off on the 102nd floor. In 1931 a small blimp held on for about three minutes in the wind, and the idea was quietly dropped.',
        joke: 'Imagine stepping off a blimp, 1,250 feet up, holding your hat.',
        facts: ['1,454 ft to the tip', 'Opened 1931'],
      })),
      chrysler: look('Chrysler Building', card({
        title: 'Chrysler Building', kicker: 'Midtown', pic: pic('empire-deck', 'chrysler'),
        text: 'The art-deco Chrysler Building was the tallest in the world for 11 months. Its builders secretly assembled the spire inside the top and raised it in about 90 minutes to beat a rival tower downtown.',
        joke: 'The gargoyles look like car hood ornaments. Very on-brand for a car company.',
      })),
    },
  },

  'grand-central': {
    id: 'grand-central', name: 'Grand Central Terminal', area: 'Main Concourse', bg: 'grand-central', indoor: true, npcs: 5, mapSpot: 'grand-central',
    chatter: ['Meet me at the clock.', 'Track 29! Where’s track 29?', 'I always look up in here.'],
    objects: {
      clock: look('The Opal Clock', card({
        title: 'The Opal Clock', kicker: 'Main Concourse', pic: pic('grand-central', 'clock'),
        text: 'All four faces of the clock above the information booth are made of opal, and appraisers have valued it at 10 to 20 million dollars. “Meet me at the clock” has been New York’s favorite plan since 1913.',
        joke: 'The most romantic sentence in New York. Also the most confusing: there are four faces.',
        actions: (g) => [{ label: 'Meet Me at the Clock', primary: true, act: () => (g.emote('wave', 2), g.say('Meet me at the clock! (Which side? All of them.)')) }],
      })),
      ceiling: look('The Ceiling', mo('ceiling', 'connectTheStars')),
      departures: look('Departures', card({
        title: 'Departures', kicker: 'Grand Central Terminal', pic: pic('grand-central', 'departures'),
        text: 'Grand Central has 44 platforms, more than any other train station in the world, and around 750,000 people pass through on a busy day.',
        joke: '44 platforms, and you will still run for the wrong one.',
      })),
      whisper: { label: 'Whispering Gallery', act: (g) => import('../features/extras').then((m) => m.whisper(g)) },
      staircase: exit('Down to the Subway', 'subway'),
      flag: look('The Flag', card({
        title: 'The Flag', kicker: 'Main Concourse', pic: pic('grand-central', 'flag'), quiet: true,
        text: 'This huge American flag was hung in the Main Concourse after September 11, 2001, and it has stayed ever since.',
      })),
      windows: look('The Windows', card({
        title: 'The Windows', kicker: 'Main Concourse', pic: pic('grand-central', 'windows'),
        text: 'The great arched windows have walkways between their two layers of glass, so now and then you can spot someone walking inside a window. In the morning, light pours through in famous beams.',
        joke: 'Every photographer’s dream. Every window washer’s cardio.',
        actions: (g) => [{ label: 'Take a Photo', act: () => snap('Beams of light. Nailed it.')(g) }],
      })),
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
      'guitar-case': { label: 'Busker’s Guitar Case', act: mo('riff', 'playTheRiff') },
      rat: look('???', (g) => void import('../features/subwayLife').then((m) => m.pizzaRat(g))),
      trash: look('Trash Can', card({
        title: 'Trash Can', kicker: 'Times Sq–42 St', pic: { src: '/art/fx/subway-trash.jpg', fit: 'cover' },
        text: 'In 2011 the subway tried taking trash cans out of some stations to cut down on trash and rats. People kept dropping trash anyway, and the cans came back.',
        joke: 'It’s full. It’s always full. Take the shot anyway.',
        // a shot from wherever you're standing (features/moments/trashToss.ts)
        actions: (g) => [{ label: 'Take the Shot', primary: true, act: () => void import('../features/moments/trashToss').then((m) => m.trashToss(g)) }],
      })),
      bench: { label: 'Bench', sit: true },
      sign: look('Subway Sign', card({
        title: 'The Subway', kicker: 'Since 1904', pic: pic('subway', 'sign'),
        text: 'The first subway line opened on October 27, 1904. Today there are 472 stations and the trains run 24 hours a day. Each colored circle, or “bullet”, is a line.',
        joke: 'The colored circles are free. So are the delays.',
        facts: ['Opened 1904', '472 stations', 'Open 24/7'],
        actions: (g) => [{ label: 'Open the Subway Map', primary: true, act: () => g.openSubway() }],
      })),
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
      hydrant: look('Hydrant', card({
        title: 'Hydrant', kicker: 'SoHo', pic: pic('soho', 'hydrant'),
        text: 'An open hydrant without a spray cap blasts over 1,000 gallons a minute, enough to drop the water pressure firefighters need for the whole block.',
        joke: 'A SoHo hydrant. Somehow more stylish.',
      })),
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
      mannequins: { label: 'Accessories', act: shop('thread', 'accessories') },
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
      neon: look('Sneaker Vault', say('The neon hums in sneaker.')),
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
      espresso: look('Espresso Machine', (g) => { g.sfx.espresso(); g.say('*hissssss* That’s the sound of productivity.') }),
      // the chalkboard is the menu: click it and you order from it (the same board the counter opens)
      menu: { label: 'Order', act: (g) => ROOMS.coffee.objects?.counter?.act?.(g) },
      sacks: look('Coffee Sacks', (g) => { g.sfx.pop(); g.emote('jump', 1); g.say(['*sniff* Colombia. Definitely Colombia.', 'Smells incredible. I live here now.', '60 kilos of beans. I tried to lift one. No.'][Math.floor(Math.random() * 3)]) }),
      window: look('Window', say(['Cobblestones and people-watching. Perfect.', 'A dog in a raincoat just walked by. Best day ever.', 'Someone outside is carrying a whole couch. On the subway, probably.'])),
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
      arch: look('Little Italy', card({
        title: 'Little Italy', kicker: 'Mulberry Street', pic: pic('chinatown', 'arch'),
        text: 'Mulberry Street was once the heart of a huge Italian neighborhood. Today it’s a few blocks of red-sauce restaurants, and every September the Feast of San Gennaro fills them with music, lights and zeppole.',
        joke: 'Every restaurant has a guy outside who swears his cannoli are the best. They’re all right.',
      })),
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
      oven: { label: 'Work a Shift', act: (g) => g.playGame('slice-factory') },
      menu: look('Menu', card({
        title: 'The Menu', kicker: 'By the Slice', pic: pic('pizza', 'menu'),
        text: 'Cheese, pepperoni, white. New Yorkers fold a slice down the middle so the tip doesn’t flop, and for decades a plain slice has cost about the same as a subway ride.',
        joke: 'That’s the whole menu. Perfection doesn’t need a second page.',
      })),
      'photos-left': look('Wall of Fame', card({
        title: 'Wall of Fame', kicker: '99¢ Slice', pic: pic('pizza', 'photos-left'),
        text: 'Every slice shop in New York has this wall: signed photos of famous customers, all smiling, none of them identifiable.',
        joke: 'I don’t recognize any of them. Someday my headshot goes up there.',
        actions: (g) => [{ label: 'Pose for the Wall', act: () => snap('Signed, framed, hung. In my dreams.')(g) }],
      })),
      'photos-right': look('Wall of Fame', say('Someday my headshot will be up there.')),
      soda: { label: 'Soda Fridge', act: (g) => { if (!g.spend(1, 'soda')) return; g.sfx.register(); g.say('Ice cold. *crack* Fizzzz. 🥤') } },
      window: look('Window', (g) => { g.sfx.honk(); g.say('The taxis never stop honking.') }),
      neon: look('OPEN', say('Open 24/7. Pizza never sleeps.')),
      boxes: look('Pizza Boxes', say('Ready for delivery. Superhero not included.')),
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
      tugboat: look('Tugboat', (g) => { g.sfx.toot(); g.say('TOOOOT') }),
      'gull-1': look('Seagull', (g) => { g.sfx.squawk(); g.say('That seagull is judging me.') }),
      'gull-2': look('Seagull', (g) => { g.sfx.squawk(); g.say('It wants my pretzel. It cannot have my pretzel.') }),
      tower: look('Brooklyn Bridge', (g) =>
        void import('../features/infocard').then((m) =>
          m.picCard({
            title: 'Brooklyn Bridge',
            kicker: 'Opened 1883',
            text: 'Brooklyn is still under construction. Keep exploring Manhattan for now.',
            extra: m.comingSoonSign('Brooklyn'),
            joke: 'Still the best free walk in New York.',
            actions: [
              { label: 'Walk the Bridge', primary: true, act: () => void import('../features/bridgeWalk').then((w) => w.walkToBrooklyn()) },
              { label: 'Hang a Lock', act: () => mo('lovelocks', 'loveLocks')(g) },
            ],
          }),
        )),
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
      statue: look('Statue of Liberty', card({
        title: 'Statue of Liberty', kicker: 'From Battery Park', pic: pic('battery-park', 'statue'),
        text: 'A gift from the people of France, dedicated in 1886. She’s 151 feet from heel to torch and stands on Liberty Island, a short ferry ride from this dock.',
        joke: 'She wears a size 879 sandal. Nobody asks where she shops.',
        actions: (g) => [{ label: 'Take the Ferry', primary: true, act: () => g.ferry() }],
      })),
      lifebuoy: { label: 'Life Ring', act: mo('lifeRing', 'tossTheRing') },
      'bench-1': { label: 'Bench', sit: true }, 'bench-2': { label: 'Bench', sit: true },
      gull: look('Seagull', (g) => import('../features/extras').then((m) => m.seagull(g))),
      lamp: look('Lamp Post', card({
        title: 'Battery Park', kicker: 'The Tip of Manhattan', pic: pic('battery-park', 'lamp'),
        text: 'The park is named for the cannon batteries that guarded the harbor in the 1600s and 1700s. Castle Clinton, the round stone fort nearby, was built for the War of 1812 and later became America’s first immigration station.',
        joke: 'The lamp is decorative. The seagulls use it as a lookout tower.',
      })),
      'exit-left': exit('To One World Trade', 'one-world-trade'),
    },
  },

  'liberty-island': {
    id: 'liberty-island', name: 'Liberty Island', area: 'New York Harbor', bg: 'liberty-island-v2', npcs: 4, mapSpot: 'liberty',
    chatter: ['She’s even bigger up close!', 'Crown tickets sell out months ahead.', 'I came here on the ferry!'],
    onEnter: (g) => g.stamp('liberty'),
    objects: {
      statue: look('Statue of Liberty', card({
        title: 'Statue of Liberty', kicker: 'Liberty Enlightening the World', pic: pic('liberty-island', 'statue'),
        text: 'Her official name is “Liberty Enlightening the World”. Her copper skin is only 2.4 mm thick: she arrived a shiny brown and turned green over about 30 years.',
        joke: 'She’s been holding that torch up since 1886. Her arm is fine. She checked.',
        facts: ['151 ft tall', '25 crown windows', 'Size 879 sandals'],
        actions: (g) => [
          { label: 'Take a Selfie', primary: true, act: () => mo('selfie', 'libertySelfie')(g) },
          { label: 'Climb to the Crown', note: '354 steps', act: () => mo('crownClimb', 'climbTheCrown')(g) },
          { label: 'See the Torch', act: () => libertyTorch(g) },
          { label: 'Read the Pedestal', act: () => libertyPedestal(g) },
        ],
      })),
      fort: look('Fort Wood', card({
        title: 'Fort Wood', kicker: 'Under the Statue', pic: pic('liberty-island', 'fort'),
        text: 'Lady Liberty stands on an 11-pointed star-shaped fort built for the War of 1812. The army kept a post on the island until 1937.',
        joke: 'A fort, under a statue, on an island. New York doesn’t do anything halfway.',
      })),
      kiosk: { label: 'Souvenir Kiosk', act: card({
        title: 'Souvenir Kiosk', kicker: 'Liberty Island', pic: pic('liberty-island', 'kiosk'),
        text: 'Foam crowns are the island’s classic souvenir. The real crown has 25 windows and seven rays, said to stand for the seven seas and seven continents.',
        joke: 'Foam crown: 12 coins. Feeling like a national monument: priceless.',
        actions: (g) => [
          { label: 'Foam Crowns & Torches', primary: true, act: () => g.catalog('liberty') },
          { label: 'Strike the Liberty Pose', act: () => {
            if (g.owns('torch')) g.wear('torch')
            snap(g.owns('torch') ? 'Arm up, chin up, torch up. Very dignified.' : 'Liberty pose, no torch. Holding up an imaginary pretzel.')(g)
          } },
        ],
      }) },
      'viewer-1': { label: 'Tower Viewer', act: binoc(295, 118, [[300, 66, 'One World Trade'], [262, 150, 'Lower Manhattan'], [330, 182, 'Battery Park']]) },
      'viewer-2': { label: 'Tower Viewer', act: binoc(714, 72, [[690, 24, 'The torch'], [735, 44, 'The crown'], [734, 96, 'July IV, MDCCLXXVI'], [715, 152, 'The pedestal']]) },
      ferry: {
        label: 'Ferry Back to Manhattan',
        act: async (g) => {
          const v = await g.choose('⛴️ Back to Battery Park', 'The ferry is boarding.', [{ label: 'All Aboard!', value: 'go' }])
          if (v === 'go') g.goto('battery-park', 'liberty-island')
        },
      },
      bench: { label: 'Bench', sit: true },
      skyline: look('Manhattan Skyline', card({
        title: 'Manhattan Skyline', kicker: 'From Liberty Island', pic: view('liberty-island-v2', [126, 22, 386, 170]),
        text: 'From here you can see the whole tip of Manhattan, where the city began, and One World Trade, the tallest building in the Western Hemisphere at 1,776 feet.',
        joke: 'It looks like a postcard from here. A postcard with rent.',
        actions: (g) => [{ label: 'Wave at Manhattan', act: () => (g.emote('wave', 2), g.say('Hi, Manhattan! 👋 Manhattan did not wave back.')) }],
      })),
      gulls: look('Seagulls', (g) => { g.sfx.squawk(); g.say('Even the seagulls came to see Lady Liberty.') }),
    },
  },

  'high-line': {
    id: 'high-line', name: 'The High Line', area: 'Chelsea', bg: 'high-line', npcs: 4, mapSpot: 'high-line',
    chatter: ['This used to be a freight railroad!', 'Best sunset spot in the city.', 'Gelato on the High Line > everything.'],
    objects: {
      loungers: { label: 'Rolling Loungers', sit: true },
      bench: { label: 'Bench', sit: true },
      gelato: { label: 'Gelato Cart', act: vend('gelato', 3, 'Pistachio and strawberry. Yes, both. 🍨') },
      stairs: exit('Down to Chelsea Market', 'chelsea-market'),
      sailboat: look('Sailboat', card({
        title: 'The Hudson', kicker: 'From the High Line', pic: pic('high-line', 'sailboat'),
        text: 'The Hudson here is a tidal estuary: ocean tides push salt water up the river for about 150 miles, so the water next to Manhattan flows both ways.',
        joke: 'Sailing on the Hudson. Living the dream. The dream is a little damp.',
      })),
      'river-view': { label: 'Hudson River View', act: binoc(840, 120, [[860, 100, 'Hudson River'], [900, 140, 'New Jersey'], [810, 180, 'Chelsea Piers']]) },
      'water-tower': look('Water Tower', card({
        title: 'Water Towers', kicker: 'Rooftops Everywhere', pic: pic('high-line', 'water-tower'),
        text: 'City water pressure only pushes water up about six floors, so taller buildings keep a tank on the roof. Many are still made of wood, by the same few family companies, the way they were 100 years ago.',
        joke: 'A wooden barrel of water on your roof. Somehow the most reliable thing in the building.',
      })),
      'exit-left': exit('To SoHo', 'soho'),
    },
  },

  'chelsea-market': {
    id: 'chelsea-market', name: 'Chelsea Market', area: 'Old Biscuit Factory', bg: 'chelsea-market', indoor: true, npcs: 4, mapSpot: 'high-line',
    chatter: ['A famous cookie was invented in this building!', 'Lobster roll or tacos? Why not both.'],
    objects: {
      waterfall: { label: 'The Waterfall', act: wish },
      tacos: look('Taco Loco', (g) => { if (!g.spend(3, 'tacos')) return; g.sfx.register(); g.say('Al pastor, extra cilantro. 🌮') }),
      lobster: look('Lobster Pot', (g) => g.say('A lobster roll costs 30 coins. I’ll… just smell it.')),
      donuts: { label: 'Donut Drop', act: vend('donut', 2, 'Sprinkles make everything better. 🍩') },
      bagels: { label: 'Bagel Bros', act: vend('bagel', 2, 'Scallion cream cheese. Elite. 🥯') },
      bench: { label: 'Bench', sit: true },
      stairs: exit('Up to the High Line', 'high-line'),
      'menu-board': look('Menu', card({
        title: 'Chelsea Market', kicker: 'Old Biscuit Factory', pic: pic('chelsea-market', 'menu-board'),
        text: 'This block was a giant biscuit factory, where a famous chocolate sandwich cookie was invented in 1912. The bakery moved out in 1958, and the food hall opened in 1997.',
        joke: 'So many choices. So little stomach.',
      })),
    },
  },

  parade: {
    id: 'parade', name: 'Halloween Parade', area: 'Sixth Ave & W 10 St', bg: 'parade', npcs: 7, mapSpot: 'soho',
    chatter: ['Trick or treat!', 'Have you found all the candy corn?', 'That skeleton waved at me.', 'Best costume wins… nothing! But still.', '🎃', '👻', 'Happy Halloween!'],
    onEnter: (g) => g.stamp('party-animal'),
    objects: {
      'candy-stand': { label: 'Free Costumes!', act: () => void import('../features/party').then((m) => m.openCostumeStand()) },
      float: look('Pumpkin Float', (g) => { g.sfx.toot(); g.say('The parade rolls at 7 PM sharp! 🎃') }),
      skeleton: look('Giant Skeleton', (g) => { g.sfx.squawk(); g.say('It’s 30 feet tall and waves at everyone. Iconic. 💀') }),
      'photo-booth': { label: 'Spooky Photo Booth', act: photoBooth('Halloween') },
      cauldron: look('Bubbling Cauldron', say(['Bubble bubble… it smells like cider.', 'Is that… green apple soda?'])),
      tombstones: look('Tombstones', say(['“Here lies my diet. 1999–2026.”', '“RIP my MetroCard balance.”'])),
      signs: look('6 Av & W 10 St', card({
        title: 'The Village Halloween Parade', kicker: '6 Av & W 10 St', pic: pic('parade', 'signs'),
        text: 'Since 1974 New Yorkers have marched up Sixth Avenue in homemade costumes and giant puppets. It’s the biggest Halloween parade in the country.',
        joke: 'Best costume wins nothing. Still the most competitive night of the year.',
      })),
      manhole: look('Manhole', say('Even the steam is spooky tonight.')),
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
      'federal-hall': look('Federal Hall', card({
        title: 'Federal Hall', kicker: 'Wall Street', pic: pic('wall-street', 'federal-hall'),
        text: 'The first U.S. Congress met here in 1789 and wrote the Bill of Rights. The original building was torn down in 1812; this temple-style one opened in 1842 as the Custom House and is now a national memorial.',
        joke: 'America’s first capitol. The rent was probably more reasonable.',
        actions: (g) => [{ label: 'Sit on the Steps', act: () => sitDown('Sitting where the Founders sat. Roughly. Ish.', [250, 330])(g) }],
      })),
      church: look('Trinity Church', card({
        title: 'Trinity Church', kicker: 'Broadway at Wall Street', pic: pic('wall-street', 'church'),
        text: 'Trinity Church’s 281-foot spire was the tallest point in New York until 1890. Alexander Hamilton is buried in its churchyard, a few steps from Wall Street.',
        joke: 'Hamilton is buried here. Yes, that Hamilton. No, you can’t get tickets.',
      })),
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
      tower: look('One World Trade Center', card({
        title: 'One World Trade Center', kicker: 'Lower Manhattan', pic: pic('one-world-trade', 'tower'),
        text: 'At 1,776 feet, a nod to the year of the Declaration of Independence, it’s the tallest building in the Western Hemisphere. Its base is a 200-foot square, about the footprint of each of the original Twin Towers, and its sides taper into eight tall triangles.',
        joke: 'The elevator takes under a minute. The line for it takes longer.',
        facts: ['1,776 feet', '104 floors', 'Opened 2014'],
        actions: (g) => [{ label: 'Ride to the Top', note: 'Sky Deck 102', primary: true, act: () => ticketed('oneworld', 'admit', (g2) => down((m) => m.elevatorUp(g2)))(g) }],
      })),
      doors: { label: 'Sky Deck Elevators', act: ticketed('oneworld', 'admit', (g) => down((m) => m.elevatorUp(g))) },
      // up close at the parapet: the water, the names, a white rose (features/memorial.ts); quiet, never a game
      pool: { label: '9/11 Memorial', act: () => void import('../features/memorial').then((m) => m.visitMemorial()) },
      tree: { label: 'The Survivor Tree', act: card({
        title: 'The Survivor Tree', kicker: 'Callery Pear', pic: pic('one-world-trade', 'tree'), quiet: true,
        text: 'This pear tree was found in the rubble in October 2001, burned, with one living branch. It was nursed back to health in the Bronx and replanted here. It blooms white every spring, and its seedlings go to communities around the world that have lived through hard times.',
        actions: (g) => [{ label: 'Sit a While', act: () => sitDown()(g) }],
      }) },
      subway: { label: 'Subway', act: card({
        title: 'WTC Cortlandt', kicker: 'The Oculus', pic: pic('one-world-trade', 'subway'),
        text: 'Behind the stairs is the Oculus, the transit hall designed by Santiago Calatrava and opened in 2016. Its white ribs are meant to look like a bird being set free. Underneath, it links 11 subway lines and the PATH train to New Jersey.',
        joke: 'Ten minutes in the Oculus and you’ll find every train except yours.',
        actions: (g) => [
          { label: 'Ride the Subway', primary: true, act: () => g.openSubway() },
          { label: 'Walk Through to Wall Street', act: () => g.goto('wall-street', 'one-world-trade') },
        ],
      }) },
      cart: { label: 'Coffee & Pretzel Cart', act: card({
        title: 'Coffee & Pretzel Cart', kicker: 'One World Trade Plaza', pic: pic('one-world-trade', 'cart'),
        text: 'Carts like this have fed downtown office workers for generations. The best time to buy: before the 9 a.m. rush, or after the tourists find the elevator.',
        joke: 'The vendor has pointed ten thousand people to the elevator without looking up.',
        actions: (g) => [
          { label: 'Deli Coffee (3)', primary: true, act: () => vend('coffee', 3, 'Coffee with a view of the tallest building around. ☕', 'regular')(g) },
          { label: 'Soft Pretzel (2)', act: () => vend('pretzel', 2, 'Downtown pretzel. Same salt, taller buildings. 🥨')(g) },
          { label: 'Sit with It', act: () => sitDown('A bench in the shade of the tallest building around.')(g) },
        ],
      }) },
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
      'view-liberty': look('Statue of Liberty', card({
        title: 'Statue of Liberty', kicker: 'From 1,250 Feet', pic: view('sky-deck', [60, 82, 160, 100]),
        text: 'From up here Lady Liberty looks pocket-sized, but she stands 305 feet from the ground to the tip of her torch, pedestal included.',
        joke: 'She didn’t wave back. She’s been holding that torch since 1886. Her arm is busy.',
        actions: (g) => [{ label: 'Wave at Her', act: () => (g.emote('wave', 2), g.say('Hi, Lady Liberty! 👋')) }],
      })),
      'view-empire': look('Empire State Building', card({
        title: 'Empire State Building', kicker: 'Midtown', pic: view('sky-deck', [400, 18, 130, 165]),
        text: 'Built in just 410 days and opened in 1931, it was the tallest building in the world for almost 40 years.',
        joke: 'From up here it looks like a souvenir of itself.',
        actions: (g) => [{ label: 'Visit the Empire State', act: () => g.goto('empire-street') }],
      })),
      'view-bridge': look('Brooklyn Bridge', card({
        title: 'Brooklyn Bridge', kicker: 'Over the East River', pic: view('sky-deck', [598, 120, 210, 115]),
        text: 'You can see the whole bridge from here: 1,595 feet between its two stone towers. On the far side is Brooklyn.',
        joke: 'From up here the traffic on it looks peaceful. It is not.',
        actions: (g) => [{ label: 'Go to the Bridge', act: () => g.goto('brooklyn-bridge') }],
      })),
    },
  },

  apartment: {
    id: 'apartment', name: 'My Apartment', area: 'A 5th-floor walk-up', bg: 'apartment', indoor: true, npcs: 0, mapSpot: 'apartment',
    objects: {
      door: { label: 'Leave', act: (g) => g.openMap(), instant: true },
      window: look('Window', card({
        title: 'Your Window', kicker: 'A 5th-Floor Walk-Up', pic: pic('apartment', 'window'),
        text: 'Water towers, fire escapes and a slice of the Empire State. Walk-ups like this one have no elevator: just stairs, character and very strong calves.',
        joke: 'Worth the five flights. Mostly.',
        actions: (g) => [{ label: 'Open the Window', act: () => (g.sfx.coo(), g.say('A pigeon lands on the sill immediately. We’re roommates now. 🐦')) }],
      })),
      radiator: look('Radiator', card({
        title: 'Radiator', kicker: 'Heat Season', pic: pic('apartment', 'radiator'),
        text: 'From October 1 to May 31, New York landlords must keep apartments at least 68°F during the day whenever it’s below 55°F outside. This radiator takes the job very seriously.',
        joke: '*CLANK* *CLANK* The radiator is alive.',
        actions: (g) => [{ label: 'Bang on the Pipe', act: () => (g.sfx.tick(), g.say('*CLANK* My neighbor bangs back. We’re basically friends now.')) }],
      })),
      fridge: { label: 'Fridge', act: (g) => souv((m) => m.openFridge(g)) },
      stove: look('Stove', card({
        title: 'Stove', kicker: 'The Kitchen', pic: pic('apartment', 'stove'),
        text: 'Tiny New York kitchens are famous for creative storage. Some people really do keep sweaters in the oven.',
        joke: 'I use it for storing sweaters. Very New York.',
        actions: (g) => [{ label: 'Cook Something', act: () => g.say('I made toast. In a pan. I’m basically a chef now.') }],
      })),
      kitchen: look('Kitchen', say('Tiny but mighty.')),
      // under the first-day list in the corner, so it's scenery rather than a hotspot nobody can reach
      hooks: { label: 'Coat Hooks', decor: true },
    },
  },

  // the bigger homes from StreetCheesy (decorated like the walk-up; your furniture is kept per home)
  loft: {
    id: 'loft', name: 'My Loft', area: 'SoHo', bg: 'loft', indoor: true, npcs: 0, mapSpot: 'apartment',
    objects: {
      door: { label: 'Leave', act: (g) => g.openMap(), instant: true },
      stairs: look('Spiral Stairs', say('They lead up to a storage closet. A very glamorous storage closet.')),
      window: look('Arched Windows', say(['Cobblestones, cast iron and a taxi that hasn’t moved in ten minutes.', 'Artists lived here once. Now: me.'])),
      easel: look('Easel', say('A half-finished painting of a blue square. It’s “a statement”.')),
      island: look('Kitchen Island', say('Butcher block, three stools, zero cooking. It’s for vibes.')),
      kitchen: look('Kitchen', (g) => souv((m) => m.openFridge(g))),
    },
  },

  penthouse: {
    id: 'penthouse', name: 'My Penthouse', area: 'Billionaires’ Row', bg: 'penthouse', indoor: true, npcs: 0, mapSpot: 'apartment',
    objects: {
      door: { label: 'Leave', act: (g) => g.openMap(), instant: true },
      telescope: look('Telescope', say('I can see my old walk-up from here. Tiny! Adorable!')),
      'dj-nook': look('DJ Nook', (g) => {
        g.say('Your own DJ booth. Throw a house party and the music plays right here!')
        void import('../features/houseparty').then((m) => m.openPartyPanel())
      }),
      'olive-tree': look('Olive Tree', say('Imported from Italy. It has better papers than I do.')),
      'olive-tree-2': look('Olive Tree', say('Its twin. Equally fancy.')),
      bar: look('Built-In Bar', say(['Seltzer, seltzer, and a very fancy seltzer.', 'The bar is stocked. With snacks. I’m 13+, relax.'])),
      view: look('The View', say(['All of Central Park. The building sways a little. That’s normal. Probably.', 'You can see the whole city from up here.'])),
    },
  },
}
