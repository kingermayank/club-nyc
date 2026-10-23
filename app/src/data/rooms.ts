import type { Game, ObjDef, RoomDef } from '../types'
import type { CardAction, Pic, PicCardOpts } from '../features/infocard'
import { bump, save } from '../state'
import { ITEM } from '../avatar/items'
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
const FOOD = new Set(['hotdog', 'pretzel', 'cocoa', 'coffee', 'latte', 'bagel', 'dumplings', 'boba', 'pizza-slice', 'gelato', 'donut'])
/** "Belly Full": every food spot you've eaten at (a spot is a place plus what you had there) */
function tasted(g: Game, item: string) {
  if (!FOOD.has(item)) return
  const k = `ate:${g.room.id}:${item}`
  if (!save.stats[k]) bump(k)
  if (Object.keys(save.stats).filter((s) => s.startsWith('ate:')).length >= 10) g.stamp('belly-10')
}
/** what the Bean There barista writes on your cup: your name, nearly. ("Mayonnaise" is a classic.) */
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
    const v = await g.choose('🌭 SAL’S CART', '“New in town? Welcome to New York! First one’s on the house: pick a welcome gift.”', [
      ...WELCOME_GIFTS.map((id) => ({ label: ITEM[id]?.name ?? id, value: id, note: 'free · welcome gift' })),
      { label: 'Just a Hot Dog (2)', value: 'dog' },
    ])
    if (v && v !== 'dog') {
      g.give(v)
      g.wear(v)
      g.say(`Thanks, Sal! Wearing it right now. 🎁`)
      return
    }
    if (v !== 'dog') return
  }
  return vend('hotdog', 2, 'A classic dirty-water dog. Mustard only.')(g)
}
type Act = (g: Game) => void
const shop = (id: string, section?: string): Act => (g) => g.catalog(id, section)
const say = (line: string | string[]): Act => (g) => g.say(Array.isArray(line) ? line[Math.floor(Math.random() * line.length)] : line)
const exit = (label: string, room: string): ObjDef => ({ label, go: room })
const look = (label: string, act: Act): ObjDef => ({ label, act, instant: true })
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
/** a place that isn't open yet: "Harlem (Coming Soon)", with a reason to come back */
const soon = (name: string, text: string, joke?: string, p?: Pic): ObjDef => ({
  label: `${name} (Coming Soon)`,
  act: () => fun((m) => m.comingSoon({ name, text, joke, pic: p })),
})
const snap = (line: string) => (g: Game) => fun((m) => m.snap(g, line))
const sitDown = (line?: string, near?: [number, number]) => (g: Game) => fun((m) => m.sitNearest(g, line, near))
const photoBooth = (where: string) => () => void import('../features/photobooth').then((m) => m.openPhotoBooth(where))

/** Brooklyn isn't in the game yet: say so plainly and kindly, wherever it comes up */
const brooklyn: Act = (g) =>
  fun((m) =>
    m.comingSoon({
      name: 'Brooklyn',
      kicker: 'Across the East River',
      pic: view('brooklyn-bridge-v2', [700, 66, 300, 124]),
      text: 'Club NYC is Manhattan only for now. Brooklyn is next on the list: brownstones, stoops, pizza debates and the best view of the skyline. The bridge is open. The borough is still unpacking.',
      joke: 'Half of Manhattan moves to Brooklyn eventually. You’re just early.',
      actions: [
        { label: 'Back to the Bridge', act: () => {} },
        { label: 'Take the Subway Instead', act: () => g.openSubway() },
      ],
    }),
  )

// shared cards
const boxSeats = card({
  title: 'Box Seats', kicker: 'Broadway Theater', pic: pic('broadway', 'box-left'),
  text: 'Theater boxes were built for being seen, not for seeing: from up there you get half the stage and all of the audience. Broadway has 41 big theaters, most of them built between 1903 and 1928.',
  joke: 'Sold out. To a very rich pigeon.',
  actions: (g) => [{ label: 'Wave at the Box', act: () => (g.emote('wave', 2), g.say('The very rich pigeon waves back. Sort of.')) }],
})
const flagsCard = card({
  title: 'The Flags', kicker: 'Rockefeller Plaza', pic: view('rockefeller', [160, 62, 240, 160]),
  text: 'About 200 flagpoles ring the plaza. Most days they fly the flags of the United Nations’ member countries, and on holidays they all switch to something special.',
  joke: 'I counted them all. (I did not count them all.)',
  actions: (g) => [{ label: 'Salute the Flags', act: () => (g.emote('wave', 2), g.say('Saluting all of them at once. Very diplomatic.')) }],
})
const ownSkates = (g: Game): CardAction =>
  g.owns('skates')
    ? { label: 'Wear Your Skates', act: () => (g.wear('skates'), g.say('Laced up. Mostly.')) }
    : { label: 'Rent Skates', note: '15 coins', act: () => g.catalog('rink') }
const rinkCard = card({
  title: 'The Rink', kicker: 'Rockefeller Center · Since 1936', pic: view('rockefeller', [112, 290, 776, 220]),
  text: 'The rink opened on Christmas Day 1936 and holds about 150 skaters at a time: you can lap it in under a minute. Walk onto the ice to skate. In November the giant Christmas tree goes up right behind Prometheus.',
  joke: 'Coming soon: the tree. Coming every day: someone doing the splits by accident.',
  facts: ['Opened 1936', 'About 150 skaters', 'Tree arrives in November'],
  actions: (g) => [
    { label: 'Skate a Lap', primary: true, act: () => fun((m) => m.skateLap(g)) },
    ownSkates(g),
    { label: 'Do a Spin', act: () => (g.emote('dance', 2), g.say('A spin! Or a very slow fall. Same thing.')) },
  ],
})
const halal = async (g: Game) => {
  const v = await g.choose('🥙 HALAL BROS', '“Chicken over rice, my friend? Or… you want to work the lunch rush?”', [
    { label: 'Chicken Over Rice (6)', value: 'buy', note: 'extra white sauce' },
    { label: 'Work the Lunch Rush', value: 'work', note: 'mini-game · earn coins' },
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
      subway: exit('Subway · Times Sq–42 St', 'subway'),
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
      chandelier: look('The Chandelier', card({
        title: 'The Chandelier', kicker: 'Theater District', pic: pic('broadway', 'chandelier'),
        text: 'Most Broadway houses date from the 1900s to the 1920s, when a grand lobby and a giant chandelier were part of the show. The longest-running musical in Broadway history ran for 35 years, and a falling chandelier was its big moment.',
        joke: 'If this one falls during the show, it’s part of the show.',
      })),
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
      mirror: { label: 'Mirror · Try Things On', act: () => import('../features/playerCard').then((m) => m.openWardrobe()) },
      booth: { label: 'Changing Room', act: () => import('../features/playerCard').then((m) => m.openWardrobe()) },
      neon: look('I ♥ NY · Photo Booth', card({
        title: 'I ♥ NY', kicker: 'Since 1977', pic: pic('iloveny', 'neon', 'linear-gradient(170deg, #2b1030, #6a1d3a)'),
        text: 'Milton Glaser sketched the logo in 1977, in red crayon on the back of an envelope, during a taxi ride. It was for a state tourism campaign, he did it for free, and it became one of the most copied designs on Earth.',
        joke: 'Half the shirts in this store say it. The other half say it louder.',
        actions: () => [{ label: 'Pose Under the Neon', note: 'photo booth · friends nearby squeeze in', primary: true, act: photoBooth('I ♥ NY') }],
      })),
      door: exit('Exit to Times Square', 'times-square'),
    },
  },

  rockefeller: {
    id: 'rockefeller', name: 'Rockefeller Center', area: 'Midtown · The Rink', bg: 'rockefeller', npcs: 4, mapSpot: 'rockefeller',
    chatter: ['Do I look graceful? I feel graceful.', 'Who’s doing a triple axel?', 'The tree goes up in November!'],
    objects: {
      rink: look('The Rink', rinkCard),
      statue: look('Prometheus', card({
        title: 'Prometheus', kicker: 'Rockefeller Center · 1934', pic: pic('rockefeller', 'statue'),
        text: 'Paul Manship’s gilded bronze Prometheus has flown over the rink since 1934: 18 feet tall, 8 tons, bringing fire to humanity like in the Greek myth. The ring around him shows the 12 signs of the zodiac, and a fountain splashes underneath.',
        joke: 'He’s been mid-leap for over 90 years. Respect the commitment.',
        facts: ['Since 1934', '18 feet', '8 tons'],
        actions: (g) => [
          { label: 'Strike His Pose', primary: true, act: () => snap('Nailed it. Prometheus is shook.')(g) },
          { label: 'Toss a Coin (1)', note: 'into his fountain', act: () => wish(g) },
        ],
      })),
      'skate-rental': { label: 'Skate Rentals', act: card({
        title: 'Skate Rentals', kicker: 'The Rink', pic: pic('rockefeller', 'skate-rental'),
        text: 'Skating here is a New York tradition: the rink usually opens in October and stays open into spring. Rent skates, then walk onto the ice to glide.',
        joke: 'Falling is free. Getting back up is extra.',
        actions: (g) => [{ ...ownSkates(g), primary: true }, { label: 'Skate a Lap', act: () => fun((m) => m.skateLap(g)) }],
      }) },
      'tv-studio': { label: 'TV Studio · Wave on Air!', act: (g) => import('../features/extras').then((m) => m.onAir(g)) },
      flags: look('The Flags', flagsCard),
      'flags-2': look('The Flags', flagsCard),
      // the two front benches sit almost entirely under the toolbar: scenery (press S near them to sit)
      'bench-1': { label: 'Bench', decor: true }, 'bench-2': { label: 'Bench', decor: true }, 'bench-3': { label: 'Bench', sit: true },
    },
    zones: {
      'exit-left': exit('To Times Square', 'times-square'),
      'exit-right': exit('To Fifth Avenue', 'fifth-ave'),
      'rink-gate': { label: 'Rink Gate · Skate a Lap', act: (g) => fun((m) => m.skateLap(g)) },
    },
    onEnter: (g) => {
      if (!g.owns('skates')) setTimeout(() => g.toast('Tip: rent skates at the booth, then walk onto the ice', '⛸️'), 900)
    },
  },

  'fifth-ave': {
    id: 'fifth-ave', name: 'Fifth Avenue', area: '5 Av & W 57 St', bg: 'fifth-ave-v2', npcs: 4, mapSpot: 'fifth-ave', steamFrom: 'manhole',
    chatter: ['Window shopping is free!', 'That trunk building is a whole mood.', 'Halal Bros has the best white sauce.'],
    objects: {
      'maison-malle': exit('Maison Malle', 'maison-malle'),
      'toy-palace': exit('Toy Palace', 'toy-palace'),
      'halal-cart': { label: 'Halal Bros Cart', act: halal },
      cathedral: look('St. Patrick’s Cathedral', card({
        title: 'St. Patrick’s Cathedral', kicker: 'Fifth Avenue · 1879', pic: pic('fifth-ave', 'cathedral'),
        text: 'Building started in 1858, paused for the Civil War, and the cathedral opened in 1879. Its twin neo-Gothic spires, about 330 feet tall, were finished in 1888.',
        joke: 'It took 21 years to build. Still faster than the Second Avenue Subway.',
        actions: (g) => [{ label: 'Take a Photo', act: () => snap('Got both spires in. Barely.')(g) }],
      })),
      'street-sign': look('5 Av & W 57 St', card({
        title: 'Fifth Avenue', kicker: '5 Av & W 57 St', pic: pic('fifth-ave', 'street-sign'),
        text: 'Fifth Avenue splits Manhattan in two: street addresses are “East” on one side and “West” on the other. It’s regularly ranked the most expensive shopping street in the world.',
        joke: 'The most expensive shopping street on Earth. I bought a pretzel.',
        actions: (g) => [{ label: 'Hail a Taxi', primary: true, act: () => taxi(g) }],
      })),
      hydrant: look('Fire Hydrant', card({
        title: 'Fire Hydrant', kicker: 'One of About 109,000', pic: pic('fifth-ave', 'hydrant'),
        text: 'New York has about 109,000 fire hydrants. In summer the city hands out free spray caps, so a hydrant can turn into a legal sprinkler for the block.',
        joke: 'In July this is a water park. Today it’s a hydrant with dreams.',
        actions: (g) => [{ label: 'Ask for a Spray Cap', act: () => g.say('Request filed. See you in July. ☀️') }],
      })),
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
    id: 'toy-palace', name: 'Toy Palace', area: 'Fifth Avenue', bg: 'toy-palace', indoor: true, npcs: 2, mapSpot: 'fifth-ave',
    objects: {
      'piano-obj': look('Giant Floor Piano', card({
        title: 'Giant Floor Piano', kicker: 'Toy Palace', pic: pic('toy-palace', 'piano-obj'),
        text: 'Walk-on pianos became famous after a 1988 movie where two grown-ups played a duet with their feet in a Fifth Avenue toy store. Every key here plays a note: walk across to play.',
        joke: 'Lessons not included. Neither is talent.',
        actions: (g) => [{ label: 'Play a Tune', primary: true, act: () => fun((m) => m.playPiano(g)) }],
      })),
      teddy: look('Giant Teddy', card({
        title: 'Giant Teddy', kicker: 'Not for Sale', pic: pic('toy-palace', 'teddy'),
        text: 'The teddy bear is named after President Theodore “Teddy” Roosevelt, a New Yorker, who refused to shoot a captured bear on a 1902 hunting trip. A Brooklyn shop owner sewed a “Teddy’s bear” soon after.',
        joke: 'He’s 15 feet tall and not for sale. I asked twice.',
        actions: (g) => [{ label: 'Give Him a Hug', primary: true, act: () => (g.emote('cheer', 2), g.say('He hugs back. Emotionally. 🧸')) }],
      })),
      slide: { label: 'Candy Cane Slide', act: (g) => { g.emote('jump'); g.sfx.whoosh(); g.say('WHEEEE! 🍭') } },
      gumball: { label: 'Gumball Machine', act: (g) => { if (!g.spend(1, 'gumball')) return; g.sfx.coin(); const c = ['red', 'blue', 'yellow', 'green', 'golden ✨'][Math.floor(Math.random() * 5)]; g.say(`A ${c} gumball!`); if (c.startsWith('golden')) g.earn(10, 'Golden gumball!', 'golden-gumball') } },
      train: look('Toy Train', (g) => { g.sfx.toot(); g.say('All aboard the Toy Palace Express! 🚂') }),
      robots: { label: 'Robots & Rockets', act: shop('toys', 'toys') },
      counter: { label: 'Toy Counter', act: shop('toys') },
      balloons: { label: 'Balloons', act: shop('toys', 'balloons') },
      arch: exit('Exit to Fifth Avenue', 'fifth-ave'),
    },
  },

  'maison-malle': {
    id: 'maison-malle', name: 'Maison Malle', area: 'Fifth Avenue', bg: 'maison-malle', indoor: true, npcs: 2, mapSpot: 'fifth-ave',
    chatter: ['Is this… real gold?', 'I’m just looking. Expensively.'],
    objects: {
      handbags: { label: 'Handbags', act: shop('maison', 'bags') },
      trunks: { label: 'Ready-to-Wear', act: shop('maison', 'wear') },
      sunglasses: { label: 'Jewelry & Shades', act: shop('maison', 'jewelry') },
      'cash-desk': { label: 'Boutique Desk', act: shop('maison') },
      sofa: { label: 'Velvet Sofa', sit: true },
      staircase: look('VIP Staircase', card({
        title: 'VIP Staircase', kicker: 'Maison Malle', pic: pic('maison-malle', 'staircase'),
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
        title: 'Chandelier', kicker: 'Maison Malle', pic: pic('maison-malle', 'chandelier'),
        text: 'Store rents on Fifth Avenue in the 50s are some of the highest in the world, so every square foot has to sparkle. This one sparkles on purpose.',
        joke: 'This chandelier costs more than my rent. Probably. Possibly. Definitely.',
      })),
      'mannequin-1': look('Mannequin', snap('Serving looks. Literally.')), 'mannequin-2': look('Mannequin', snap('Camel coat season. I’m the camel.')), 'mannequin-3': look('Mannequin', snap('Very chic. The mannequin won.')),
    },
    zones: { exit: exit('Exit to Fifth Avenue', 'fifth-ave') },
  },

  'central-park': {
    id: 'central-park', name: 'Central Park', area: 'The Lake · Bow Bridge', bg: 'central-park', npcs: 4, mapSpot: 'central-park',
    chatter: ['843 acres and I still can’t find the zoo.', 'Squirrels here are fearless.', 'Picnic on the Great Lawn later?'],
    objects: {
      carriage: { label: 'Horse Carriage Ride', act: (g) => import('../features/extras').then((m) => m.carriageRide(g)) },
      boathouse: { label: 'Boathouse Café', act: card({
        title: 'Boathouse Café', kicker: 'Central Park · The Lake', pic: pic('central-park', 'boathouse'),
        text: 'The park’s boathouse has stood on The Lake since 1954. From spring to fall you can rent a rowboat here and row right under Bow Bridge. In October the cocoa season starts.',
        joke: 'Hot cocoa by the lake: the most cinematic way to spend 3 coins.',
        actions: (g) => [
          { label: 'Hot Cocoa (3)', primary: true, act: () => vend('cocoa', 3, 'Hot cocoa by the lake. Very cozy. ☕')(g) },
          { label: 'Soft Pretzel (2)', act: () => vend('pretzel', 2, 'Warm pretzel, cold air. Perfect. 🥨')(g) },
          { label: 'Take It to a Bench', act: () => sitDown('A bench, a snack and a view. Peak autumn. 🍂')(g) },
          { label: 'Rent a Rowboat (3)', act: () => fun((m) => m.rowboat(g)) },
        ],
      }) },
      pretzels: { label: 'Pretzel Cart', act: card({
        title: 'Pretzel Cart', kicker: 'Central Park', pic: pic('central-park', 'pretzels'),
        text: 'Soft pretzels came over with German immigrants in the 1800s, and New York’s street carts have sold them ever since. Best warm, with mustard, on a park bench.',
        joke: 'Salty, warm and the size of my face.',
        actions: (g) => [
          { label: 'Buy a Pretzel (2)', primary: true, act: () => vend('pretzel', 2, 'Salty, warm, the size of my face. 🥨')(g) },
          { label: 'Sit with It', act: () => sitDown('Pretzel on a park bench. Living the dream.')(g) },
          { label: 'Share with a Squirrel', act: () => fun((m) => m.squirrel(g)) },
        ],
      }) },
      rowboat: look('Rowboat', card({
        title: 'Rowboats', kicker: 'The Lake', pic: pic('central-park', 'rowboat'),
        text: 'The Lake covers about 20 acres, and rowboats have been floating on it since the 1860s. You can row under Bow Bridge and past the willows from spring to fall.',
        joke: 'The ducks have claimed this boat. Negotiations are ongoing.',
        actions: (g) => [{ label: 'Row Around the Lake (3)', primary: true, act: () => fun((m) => m.rowboat(g)) }],
      })),
      'duck-1': look('Duck', (g) => { g.sfx.quack(); g.say('Quack yourself.') }), 'duck-2': look('Duck', (g) => { g.sfx.quack(); g.say('This duck has seen things.') }), 'duck-3': look('Duck', (g) => { g.sfx.quack(); g.say('A duck in Central Park. Truly the most New York duck.') }),
      'squirrel-1': look('Squirrel', (g) => fun((m) => m.squirrel(g))), 'squirrel-2': look('Squirrel', (g) => fun((m) => m.squirrel(g))),
      bridge: look('Bow Bridge', card({
        title: 'Bow Bridge', kicker: 'Central Park · 1862', pic: view('central-park', [345, 80, 330, 175]),
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
    id: 'the-met', name: 'The Met', area: 'Museum Mile · Fifth Avenue', bg: 'the-met', npcs: 5, mapSpot: 'the-met',
    chatter: ['Meet me on the steps!', 'I could spend a week in there.', 'Is it gala night? I feel underdressed.'],
    objects: {
      steps: { label: 'The Met Steps', sit: true },
      doors: soon('The Galleries', 'The Met holds about 1.5 million works from 5,000 years of art. Our galleries are still being hung: come back soon.', 'The curators are still arguing about where the hot dog painting goes.', pic('the-met', 'doors')),
      banners: look('The Banners', card({
        title: 'The Banners', kicker: 'The Met · Fifth Avenue', pic: pic('the-met', 'banners'),
        text: 'The giant banners announce the special exhibitions. The museum was founded in 1870, and this grand Fifth Avenue front opened in 1902.',
        joke: 'This season: “Hot Dogs Through the Ages.” Kidding. Probably.',
        actions: (g) => [{ label: 'Take a Photo', act: () => snap('Me and the banners. Very cultured.')(g) }],
      })),
      'fountain-left': { label: 'Fountain', act: wish }, 'fountain-right': { label: 'Fountain', act: wish },
      hotdog: { label: 'Hot Dog Cart', act: vend('hotdog', 2, 'Museum-grade hot dog. 🌭') },
      pretzel: { label: 'Pretzel Cart', act: vend('pretzel', 2, 'A pretzel on the Met steps. Iconic. 🥨') },
      taxi: { label: 'Hail a Taxi', act: taxi, instant: true },
      'exit-left': exit('To Central Park', 'central-park'),
      'exit-right': soon('Harlem', 'Club NYC is still growing uptown. Harlem is on the list: brownstones, jazz history and some of the best soul food in the city.', 'Take the A train. Eventually.'),
    },
  },

  'empire-deck': {
    id: 'empire-deck', name: 'Empire State Building', area: '86th Floor Observatory', bg: 'empire-deck', indoor: true, npcs: 3, mapSpot: 'empire-state',
    chatter: ['I can see my apartment from here!', 'My ears just popped.', '1,050 feet up!'],
    onEnter: (g) => g.stamp('top-of-world'),
    objects: {
      'viewer-left': { label: 'Tower Viewer', act: binoc(470, 140, [[405, 118, 'Chrysler Building'], [540, 138, 'Central Park'], [690, 140, 'Water towers'], [260, 165, 'Midtown rooftops']]) },
      'viewer-right': { label: 'Tower Viewer', act: binoc(650, 70, [[655, 42, 'A blimp!'], [770, 86, 'Sunset over New Jersey'], [590, 86, 'Uptown']]) },
      elevator: exit('Elevator Down to Fifth Avenue', 'fifth-ave'),
      blimp: look('The Blimp', card({
        title: 'The Blimp', kicker: 'Over Midtown', pic: pic('empire-deck', 'blimp'),
        text: 'Advertising blimps have floated over New York’s big games and parades since the 1920s. Up here you’re almost at their altitude.',
        joke: 'Is that blimp… following me?',
        actions: (g) => [{ label: 'Wave at the Blimp', primary: true, act: () => (g.emote('wave', 2), g.say('It didn’t wave back. Blimps are like that.')) }],
      })),
      spire: look('The Spire', card({
        title: 'The Spire', kicker: 'Empire State Building · 1931', pic: pic('empire-deck', 'spire'),
        text: 'The mast on top was built so airships could dock and let passengers off on the 102nd floor. In 1931 a small blimp held on for about three minutes in the wind, and the idea was quietly dropped.',
        joke: 'Imagine stepping off a blimp, 1,250 feet up, holding your hat.',
        facts: ['1,454 ft to the tip', 'Opened 1931'],
      })),
      chrysler: look('Chrysler Building', card({
        title: 'Chrysler Building', kicker: 'Midtown · 1930', pic: pic('empire-deck', 'chrysler'),
        text: 'The art-deco Chrysler Building was the tallest in the world for 11 months. Its builders secretly assembled the spire inside the top and raised it in about 90 minutes to beat a rival tower downtown.',
        joke: 'The gargoyles look like car hood ornaments. Very on-brand for a car company.',
      })),
    },
  },

  'grand-central': {
    id: 'grand-central', name: 'Grand Central Terminal', area: 'Main Concourse · 42nd St', bg: 'grand-central', indoor: true, npcs: 5, mapSpot: 'grand-central',
    chatter: ['Meet me at the clock.', 'Track 29! Where’s track 29?', 'I always look up in here.'],
    objects: {
      clock: look('The Opal Clock', card({
        title: 'The Opal Clock', kicker: 'Main Concourse · 1913', pic: pic('grand-central', 'clock'),
        text: 'All four faces of the clock above the information booth are made of opal, and appraisers have valued it at 10 to 20 million dollars. “Meet me at the clock” has been New York’s favorite plan since 1913.',
        joke: 'The most romantic sentence in New York. Also the most confusing: there are four faces.',
        actions: (g) => [{ label: 'Meet Me at the Clock', primary: true, act: () => (g.emote('wave', 2), g.say('Meet me at the clock! (Which side? All of them.)')) }],
      })),
      ceiling: look('The Ceiling', card({
        title: 'Look Up!', kicker: 'The Celestial Ceiling', pic: view('grand-central', [280, 0, 340, 215]), stamp: 'backwards-sky',
        text: 'The constellations on the ceiling are painted backwards, as if seen from outside the sky. The official story: it’s a god’s-eye view. One dark patch was left uncleaned in the 1990s restoration to show how much grime came off.',
        joke: 'Painted backwards. Like my first MetroCard swipe.',
      })),
      departures: look('Departures', card({
        title: 'Departures', kicker: 'Grand Central Terminal', pic: pic('grand-central', 'departures'),
        text: 'Grand Central has 44 platforms, more than any other train station in the world, and around 750,000 people pass through on a busy day.',
        joke: 'Metro-North to the suburbs is still being built here. Very on-brand.',
      })),
      tickets: soon('Metro-North', 'In real life the trains to the suburbs leave from here. In Club NYC they’re still in the yard: Manhattan first.', 'Next train: soon. Very soon. Stand clear of the closing doors.'),
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
    id: 'subway', name: 'Subway Station', area: 'Times Sq–42 St', bg: 'subway', indoor: true, npcs: 3, mapSpot: 'times-square',
    chatter: ['Showtime! Showtime!', 'Is the express running?', 'Stand clear of the closing doors, please.'],
    objects: {
      train: {
        label: 'Board the Train',
        act: async (g) => {
          const v = await g.choose('🚇 Uptown & Downtown', 'Where to? Or… it’s pretty empty in here. Showtime?', [
            { label: 'Ride the Subway', value: 'ride', note: 'pick a stop' },
            { label: 'Showtime!', value: 'show', note: 'dance for tips · mini-game' },
          ])
          if (v === 'ride') g.openSubway()
          if (v === 'show') g.playGame('showtime')
        },
      },
      turnstiles: exit('Exit to Times Square', 'times-square'),
      'map-poster': { label: 'Subway Map', act: (g) => g.openSubway(), instant: true },
      'guitar-case': {
        label: 'Busker’s Guitar Case',
        act: (g) => {
          if (!g.spend(1, 'busker-tip')) return
          g.sfx.coin()
          ;[60, 64, 67, 72, 67, 64, 60].forEach((n, i) => setTimeout(() => g.sfx.piano(n), 200 + i * 180))
          g.say('A coin for the music. 🎸')
        },
      },
      rat: look('???', (g) => { g.sfx.squawk(); g.say('PIZZA RAT. A legend. Bigger in person.'); g.stamp('pizza-rat') }),
      trash: look('Trash Can', card({
        title: 'Trash Can', kicker: 'Times Sq–42 St', pic: pic('subway', 'trash'),
        text: 'In 2011 the subway tried taking trash cans out of some stations to cut down on trash and rats. People kept dropping trash anyway, and the cans came back.',
        joke: 'No. Absolutely not. I’m not looking in there.',
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
    id: 'soho', name: 'SoHo', area: 'Greene St · Cast-Iron District', bg: 'soho', npcs: 5, mapSpot: 'soho', steamFrom: 'manhole',
    chatter: ['Have you seen the new drop at Sneaker Vault?', 'Cobblestones + heels = bad idea.', 'I come here for the cast iron. And the coffee.'],
    objects: {
      thread: exit('THREAD · Fashion', 'thread'),
      'sneaker-vault': exit('Sneaker Vault', 'sneaker-vault'),
      'bean-there': exit('Bean There Coffee', 'coffee'),
      mural: look('Street Art', card({
        title: 'Street Art', kicker: 'SoHo', pic: pic('soho', 'mural'),
        text: 'Artists moved into SoHo’s empty cast-iron lofts in the 1960s and 70s, and the walls have been covered in murals ever since. This one changes every few months.',
        joke: 'Today: a very familiar-looking penguin. 👀',
        actions: (g) => [{ label: 'Take a Photo', act: () => snap('Me and the mural. I’m the art now.')(g) }],
      })),
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
      bikes: look('Bike Rack', card({
        title: 'Bike Rack', kicker: 'Greene Street', pic: pic('soho', 'bikes'),
        text: 'New York has more than 1,500 miles of bike lanes. Cobblestone blocks like this one are not the comfy miles.',
        joke: 'Biking down Broadway? Brave.',
        actions: (g) => [{ label: 'Ring a Bell', act: () => (g.sfx.ding(), g.say('Ding ding! Nobody moved.')) }],
      })),
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
      catalog: { label: 'SoHo Style Catalog', act: shop('thread') },
      counter: { label: 'Checkout', act: shop('thread') },
      mirror: { label: 'Mirror · Try Things On', act: () => import('../features/playerCard').then((m) => m.openWardrobe()) },
      fitting: { label: 'Fitting Room', act: () => import('../features/playerCard').then((m) => m.openWardrobe()) },
      neon: look('THREAD', card({
        title: 'THREAD', kicker: 'SoHo · Cast-Iron District', pic: pic('thread', 'neon', 'linear-gradient(170deg, #1d2140, #3d4a7a)'),
        text: 'SoHo has the biggest collection of cast-iron buildings in the world. Their fronts were made in foundries, in pieces, then bolted together like a giant kit. Today they hold some of the city’s best shops.',
        joke: 'Minimalism, but make it neon.',
      })),
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
      wall: { label: 'The Wall · Sneakers', act: shop('sneakers', 'kicks') },
      boxes: { label: 'Extras', act: shop('sneakers', 'extras') },
      counter: { label: 'Checkout', act: shop('sneakers') },
      vault: look('The Vault', card({
        title: 'The Vault', kicker: 'Sneaker Vault', pic: pic('sneaker-vault', 'vault'),
        text: 'Limited sneaker “drops” took off in the 1980s and 90s, and New York shops still get lines around the block for the rare ones. Some people camp out overnight.',
        joke: 'The grails. Not for sale. Not even for you.',
      })),
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
    id: 'coffee', name: 'Bean There', area: 'SoHo · Coffee', bg: 'coffee', indoor: true, npcs: 3, mapSpot: 'soho',
    chatter: ['Oat milk, obviously.', 'This is my office now.', 'Best bagels below 14th Street.'],
    objects: {
      counter: {
        label: 'Order Counter',
        act: async (g) => {
          const v = await g.choose('☕ Bean There', '“Morning! What’ll it be?”', [
            { label: 'Deli Coffee (3)', value: 'coffee', note: 'the blue cup' },
            { label: 'Oat Latte (4)', value: 'latte', note: 'they write your name on the cup' },
            { label: 'Everything Bagel (2)', value: 'bagel' },
            { label: 'Help with the Delivery', value: 'work', note: 'Bagel Counters · earn coins' },
          ])
          if (v === 'coffee') vend('coffee', 3, '“We Are Happy To Serve You” ☕', 'regular')(g)
          if (v === 'bagel') vend('bagel', 2, 'Toasted? In New York? Bold. 🥯')(g)
          if (v === 'latte') {
            await vend('latte', 4, `“Oat latte for… ${baristaName(save.name)}?” Close enough. ☕`)(g)
            if (g.owns('latte')) g.stamp('misspelled')
          }
          if (v === 'work') g.playGame('bagel-counters')
        },
      },
      espresso: look('Espresso Machine', (g) => { g.sfx.espresso(); g.say('*hissssss* That’s the sound of productivity.') }),
      menu: look('Menu', card({
        title: 'The Menu', kicker: 'Bean There', pic: pic('coffee', 'menu'),
        text: 'New York’s classic paper coffee cup, blue and white with Greek columns and “We Are Happy To Serve You”, was designed in 1963 by Leslie Buck. Hundreds of millions were sold.',
        joke: '“Cold brew, pour over, the usual.” I’ll have the usual.',
      })),
      sacks: look('Coffee Sacks', card({
        title: 'Coffee Sacks', kicker: 'Freshly Roasted', pic: pic('coffee', 'sacks'),
        text: 'Green coffee beans travel in 60-kilo burlap sacks from places like Brazil, Colombia and Ethiopia, then get roasted close to where they’re brewed.',
        joke: 'Smells incredible. I live here now.',
      })),
      stairs: soon('Book Nook', 'Upstairs there will be a reading room with big chairs and quiet rules. The shelves are still arriving.', 'The books are being sorted alphabetically. By color. It’s complicated.'),
      window: look('Window', say(['Cobblestones and people-watching. Perfect.', 'A dog in a raincoat just walked by. Best day ever.', 'Someone outside is carrying a whole couch. On the subway, probably.'])),
      armchair: { label: 'Armchair', sit: true },
      'table-1': { label: 'Table', sit: true }, 'table-2': { label: 'Table', sit: true }, 'table-3': { label: 'Table', sit: true },
    },
    zones: { exit: exit('Exit to SoHo', 'soho') },
  },

  chinatown: {
    id: 'chinatown', name: 'Chinatown & Little Italy', area: 'Mott St · Mulberry St', bg: 'chinatown', npcs: 5, mapSpot: 'chinatown',
    chatter: ['Soup dumplings or regular? Both.', 'Boba run?', 'Mulberry Street for cannoli after!'],
    objects: {
      dumpling: { label: 'Golden Dumpling', act: vend('dumplings', 3, 'Pork & chive, pan-fried. Perfect. 🥟') },
      boba: { label: 'Boba Bay', act: vend('boba', 4, 'Brown sugar boba. Extra pearls. 🧋') },
      pizza: exit('99¢ Slice', 'pizza'),
      arch: look('Little Italy', card({
        title: 'Little Italy', kicker: 'Mulberry Street', pic: pic('chinatown', 'arch'),
        text: 'Mulberry Street was once the heart of a huge Italian neighborhood. Today it’s a few blocks of red-sauce restaurants, and every September the Feast of San Gennaro fills them with music, lights and zeppole.',
        joke: 'Every restaurant has a guy outside who swears his cannoli are the best. They’re all right.',
      })),
      fruit: look('Fruit Stand', (g) => { if (!g.spend(1, 'fruit')) return; g.sfx.register(); g.say('A dragon fruit for one coin! Amazing. 🐉') }),
      lanterns: look('Lanterns', card({
        title: 'Lanterns', kicker: 'Mott Street', pic: view('chinatown', [520, 0, 260, 150]),
        text: 'Red lanterns stand for good luck and celebration. Chinatown hangs them all year and goes all out for the Lunar New Year parade in late winter.',
        joke: 'So festive. My apartment has one bulb and it flickers.',
      })),
      'exit-left': exit('To SoHo', 'soho'),
      'exit-right': exit('To the Brooklyn Bridge', 'brooklyn-bridge'),
    },
  },

  pizza: {
    id: 'pizza', name: '99¢ Slice', area: 'Little Italy', bg: 'pizza', indoor: true, npcs: 2, mapSpot: 'chinatown',
    chatter: ['Fold it. Always fold it.', 'Best slice in the city, no contest.'],
    objects: {
      counter: {
        label: 'Order a Slice',
        act: async (g) => {
          const v = await g.choose('🍕 99¢ SLICE', 'Everything is 1 coin. Or grab an apron: we’re short-staffed.', [
            { label: 'Plain Slice (1)', value: 'slice', note: 'fold it like a local' },
            { label: 'Work a Shift', value: 'work', note: 'Slice Factory · earn coins' },
            { label: 'With a Fork and Knife', value: 'fork' },
          ])
          if (v === 'slice') vend('pizza-slice', 1, 'Folded. Dripping. Perfect. 🍕', 'slice-of-life')(g)
          if (v === 'work') g.playGame('slice-factory')
          if (v === 'fork') g.say('A gasp ripples through the shop. Let’s pretend that didn’t happen.')
        },
      },
      oven: look('Pizza Oven', card({
        title: 'Pizza Oven', kicker: '99¢ Slice', pic: view('pizza', [495, 0, 230, 180]),
        text: 'New York’s first licensed pizzeria opened on Spring Street in 1905. The classic slice still comes out of deck ovens like this one, at around 550 degrees.',
        joke: 'The hottest spot in the city that isn’t the subway in August.',
      })),
      menu: look('Menu', card({
        title: 'The Menu', kicker: 'Cheese · Pepperoni · White', pic: pic('pizza', 'menu'),
        text: 'Cheese, pepperoni, white. New Yorkers fold a slice down the middle so the tip doesn’t flop, and for decades a plain slice has cost about the same as a subway ride.',
        joke: 'That’s the whole menu. Perfection doesn’t need a second page.',
      })),
      'photos-left': look('Wall of Fame', card({
        title: 'Wall of Fame', kicker: '99¢ Slice', pic: pic('pizza', 'photos-left'),
        text: 'Pizzerias all over the city hang signed photos of famous customers. Some of the signatures are even real.',
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
    chatter: ['Golden hour on the bridge 😍', 'Bikes on the other side, please!', 'Brooklyn’s right there!'],
    objects: {
      easel: { label: 'Skyline Painter · Gallery', act: (g) => souv((m) => m.openGallery(g)) },
      souvenirs: { label: 'Souvenir Stand · Magnets', act: (g) => souv((m) => m.openMagnetStand(g)) },
      tugboat: look('Tugboat', (g) => { g.sfx.toot(); g.say('TOOOOT') }),
      'gull-1': look('Seagull', (g) => { g.sfx.squawk(); g.say('That seagull is judging me.') }),
      'gull-2': look('Seagull', (g) => { g.sfx.squawk(); g.say('It wants my pretzel. It cannot have my pretzel.') }),
      tower: look('Brooklyn Bridge', card({
        title: 'Brooklyn Bridge', kicker: 'Opened 1883', pic: pic('brooklyn-bridge', 'tower'),
        text: 'When it opened on May 24, 1883, it was the longest suspension bridge in the world and the first to use steel wire. A year later P.T. Barnum marched 21 elephants across to prove it was safe. On the other side: Brooklyn (Coming Soon).',
        joke: 'Still the best free walk in New York.',
        facts: ['1883', '1,595 ft main span', '21 elephants'],
        actions: (g) => [{ label: 'Walk to Brooklyn', act: () => brooklyn(g) }],
      })),
      locks: look('Love Locks', card({
        title: 'Love Locks', kicker: 'Brooklyn Bridge', pic: pic('brooklyn-bridge', 'locks'),
        text: 'Couples clip padlocks to the bridge and throw the key in the river. The city cuts them off: thousands of locks are heavy enough to damage the bridge, and they’re banned.',
        joke: 'Romance finds a way. The city finds bolt cutters.',
      })),
      'exit-left': exit('To Chinatown', 'chinatown'),
      'exit-right': { label: 'Brooklyn (Coming Soon)', act: brooklyn },
    },
    // the little sign by the left railing: back down to the Financial District
    zones: { 'to-wall-street': exit('To Wall Street', 'wall-street') },
  },

  'battery-park': {
    id: 'battery-park', name: 'Battery Park', area: 'Ferry Dock · Lower Manhattan', bg: 'battery-park', npcs: 4, mapSpot: 'battery-park',
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
      lifebuoy: look('Life Ring', card({
        title: 'Life Ring', kicker: 'New York Harbor', pic: pic('battery-park', 'lifebuoy'),
        text: 'New York Harbor is one of the busiest in the country: ferries cross it all day long, so every dock keeps a life ring ready.',
        joke: 'Safety first. Then pretzels.',
        actions: (g) => [{ label: 'Practice a Toss', act: () => fun((m) => m.ringToss(g)) }],
      })),
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
        title: 'Statue of Liberty', kicker: 'Liberty Enlightening the World · 1886', pic: pic('liberty-island', 'statue'),
        text: 'Her official name is “Liberty Enlightening the World”. Her copper skin is only 2.4 mm thick: she arrived a shiny brown and turned green over about 30 years.',
        joke: 'She’s been holding that torch up since 1886. Her arm is fine. She checked.',
        facts: ['151 ft tall', '25 crown windows', 'Size 879 sandals'],
        actions: (g) => [
          { label: 'Climb to the Crown', note: '354 steps', primary: true, act: () => fun((m) => m.climbCrown(g)) },
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
      'viewer-2': { label: 'Tower Viewer', act: binoc(714, 72, [[690, 24, 'The torch'], [735, 44, 'Crown · 25 windows'], [734, 96, 'July IV, MDCCLXXVI'], [715, 152, 'The pedestal']]) },
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
    id: 'high-line', name: 'The High Line', area: 'Chelsea · West Side', bg: 'high-line', npcs: 4, mapSpot: 'high-line',
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
    id: 'parade', name: 'Halloween Parade', area: 'Sixth Ave & W 10 St · Party!', bg: 'parade', npcs: 7, mapSpot: 'soho',
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
      bull: { label: 'The Bull · Rub for Luck', act: card({
        title: 'The Bull', kicker: 'Wall Street', pic: pic('wall-street', 'bull'),
        text: 'In December 1989 an artist dropped off a 7,000-pound bronze bull near the stock exchange overnight, as a surprise gift to the city. It was towed the next day, New Yorkers wanted it back, and it found a home two blocks south. This friendly cousin moved in on Wall Street.',
        joke: 'Rubbing a bull’s nose for luck is a tradition. So is the line to do it.',
        actions: (g) => [
          { label: 'Rub for Luck', primary: true, act: () => down((m) => m.rubBull(g)) },
          { label: 'Take a Selfie', act: () => snap('Me and The Bull. Strong buy. 🐂')(g) },
        ],
      }) },
      ticker: look('The Pizza Index', () => down((m) => m.pizzaIndex())),
      exchange: look('The Exchange', card({
        title: 'The Exchange', kicker: 'Wall Street · 1903', pic: pic('wall-street', 'exchange'),
        text: 'In 1792, 24 brokers signed an agreement under a buttonwood tree on Wall Street. That handshake grew into the biggest stock exchange in the world, which moved into this six-columned building in 1903.',
        joke: 'Inside, people shout numbers at each other. For fun. And money.',
        actions: (g) => [{ label: 'Peek Inside', act: () => exchangeSoon(g) }],
      })),
      door: { label: 'The Exchange (Coming Soon)', act: (g) => exchangeSoon(g) },
      washington: { label: 'George Washington', act: card({
        title: 'George Washington', kicker: 'Federal Hall · April 30, 1789', pic: pic('wall-street', 'washington'),
        text: 'On this spot, on the balcony of the old Federal Hall, Washington took the oath of office as the first President of the United States. New York was the nation’s first capital. The statue has stood on the steps since 1883.',
        joke: 'He’s been reaching for the check since 1883.',
        actions: (g) => [{ label: 'Take the Oath', primary: true, act: () => (g.emote('wave', 3), g.say('I do solemnly swear to always fold my pizza. 🍕')) }],
      }) },
      'federal-hall': look('Federal Hall', card({
        title: 'Federal Hall', kicker: 'Wall Street · Since 1842', pic: pic('wall-street', 'federal-hall'),
        text: 'The first U.S. Congress met here in 1789 and wrote the Bill of Rights. The original building was torn down in 1812; this temple-style one opened in 1842 as the Custom House and is now a national memorial.',
        joke: 'America’s first capitol. The rent was probably more reasonable.',
        actions: (g) => [{ label: 'Sit on the Steps', act: () => sitDown('Sitting where the Founders sat. Roughly. Ish.', [250, 330])(g) }],
      })),
      church: look('Trinity Church', card({
        title: 'Trinity Church', kicker: 'Broadway at Wall Street', pic: pic('wall-street', 'church'),
        text: 'Trinity Church’s 281-foot spire was the tallest point in New York until 1890. Alexander Hamilton is buried in its churchyard, a few steps from Wall Street.',
        joke: 'Hamilton is buried here. Yes, that Hamilton. No, you can’t get tickets.',
      })),
      cart: { label: 'Hot Dog Cart', act: card({
        title: 'Hot Dog Cart', kicker: 'The Wall Street Power Lunch', pic: pic('wall-street', 'cart'),
        text: 'Street carts have sold hot dogs in New York since the 1800s. Down here lunch is eaten standing up, in about four bites, while checking the market.',
        joke: '“Ketchup?” The vendor stares at you for a long, long time.',
        actions: (g) => [
          { label: 'Buy a Hot Dog (2)', primary: true, act: () => vend('hotdog', 2, 'A power lunch. Four bites. Market’s up. 🌭')(g) },
          { label: 'Ask for Ketchup', act: () => g.say('The vendor stares at me in silence. I take mustard.') },
        ],
      }) },
      subway: { label: 'Subway · Wall St', act: (g) => g.openSubway() },
      'pigeon-1': look('Pigeon', coo), 'pigeon-2': look('Pigeon', coo),
    },
    zones: { steps: { label: 'Federal Hall Steps', sit: true } },
  },

  'one-world-trade': {
    id: 'one-world-trade', name: 'One World Trade', area: 'World Trade Center · Lower Manhattan', bg: 'one-world-trade', npcs: 3, mapSpot: 'wtc',
    chatter: ['The elevator only takes a minute!', 'Have you seen the view from the top?', 'Pretzel after this?', 'The Oculus looks like wings.'],
    objects: {
      'exit-left': exit('To Battery Park', 'battery-park'),
      oculus: exit('The Oculus · To Wall Street', 'wall-street'),
      tower: look('One World Trade Center', card({
        title: 'One World Trade Center', kicker: 'Lower Manhattan · Opened 2014', pic: pic('one-world-trade', 'tower'),
        text: 'At 1,776 feet, a nod to the year of the Declaration of Independence, it’s the tallest building in the Western Hemisphere. Its base is a 200-foot square, about the footprint of each of the original Twin Towers, and its sides taper into eight tall triangles.',
        joke: 'The elevator takes under a minute. The line for it takes longer.',
        facts: ['1,776 feet', '104 floors', 'Opened 2014'],
        actions: (g) => [{ label: 'Ride to the Top', note: 'Sky Deck 102', primary: true, act: () => down((m) => m.elevatorUp(g)) }],
      })),
      doors: { label: 'Sky Deck Elevators', act: (g) => down((m) => m.elevatorUp(g)) },
      pool: { label: '9/11 Memorial', act: card({
        title: '9/11 Memorial', kicker: 'National September 11 Memorial', pic: { src: '/art/memorial/today.jpg', fit: 'cover' }, quiet: true, stamp: 'remember',
        text: 'Two reflecting pools sit in the footprints of the Twin Towers, each nearly an acre, with the largest man-made waterfalls in North America. The names of the 2,983 people killed in the attacks of September 11, 2001, and February 26, 1993, are inscribed in bronze around the pools.',
        actions: (g) => [
          { label: 'Place a White Rose', note: 'a memorial tradition', act: () => down((m) => m.placeRose(g)) },
          { label: 'Visit the Memorial Exhibit', act: () => down((m) => m.memorialExhibit()) },
        ],
      }) },
      tree: { label: 'The Survivor Tree', act: card({
        title: 'The Survivor Tree', kicker: 'Callery Pear · Replanted 2010', pic: pic('one-world-trade', 'tree'), quiet: true,
        text: 'This pear tree was found in the rubble in October 2001, burned, with one living branch. It was nursed back to health in the Bronx and replanted here. It blooms white every spring, and its seedlings go to communities around the world that have lived through hard times.',
        actions: (g) => [{ label: 'Sit a While', act: () => sitDown()(g) }],
      }) },
      subway: { label: 'Subway · WTC Cortlandt', act: card({
        title: 'WTC Cortlandt', kicker: 'The Oculus · Subway', pic: pic('one-world-trade', 'subway'),
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
    id: 'sky-deck', name: 'Sky Deck 102', area: 'One World Trade · 102nd Floor', bg: 'sky-deck', indoor: true, npcs: 3, mapSpot: 'wtc',
    chatter: ['My ears just popped.', 'That elevator was faster than my commute.', 'I can see Lady Liberty!', 'Don’t look down. I looked down.'],
    onEnter: (g) => g.stamp('sky-deck'),
    objects: {
      elevator: { label: 'Elevator Down to the Plaza', act: (g) => down((m) => m.elevatorDown(g)) },
      'viewer-1': { label: 'Tower Viewer', act: binoc(150, 130, [[118, 108, 'Statue of Liberty'], [60, 82, 'New Jersey'], [230, 160, 'New York Harbor'], [190, 250, 'Battery Park City']]) },
      'viewer-2': { label: 'Tower Viewer', act: binoc(500, 120, [[452, 62, 'Empire State Building'], [560, 96, 'Midtown'], [470, 178, 'Downtown rooftops'], [380, 120, 'The West Side']]) },
      portal: { label: 'The Sky Portal', act: card({
        title: 'The Sky Portal', kicker: '102nd Floor', pic: pic('sky-deck', 'portal'),
        text: 'The real observatory has a 14-foot disc in the floor that shows a live view of the streets about 1,250 feet below. It’s a video screen, not a hole. Your knees will not believe you.',
        joke: 'Those taxis look like yellow sprinkles.',
        actions: (g) => [
          { label: 'Jump on It', primary: true, act: () => down((m) => m.skyPortalJump(g)) },
          { label: 'Lie Down and Look', act: () => fun((m) => m.kneel(g, 'Clouds below me. Weird. Good weird.')) },
        ],
      }) },
      cafe: { label: 'Cloud Nine Café', act: card({
        title: 'Cloud Nine Café', kicker: 'Sky Deck 102', pic: pic('sky-deck', 'cafe'),
        text: 'Snacks with the highest view in town. At about 1,250 feet, water boils near 209.7°F instead of 212°F. Your cocoa won’t notice.',
        joke: 'The prices are also on the 102nd floor.',
        actions: (g) => [
          { label: 'Hot Cocoa (3)', primary: true, act: () => vend('cocoa', 3, 'Cocoa above the clouds. Fancy. ☕')(g) },
          { label: 'Deli Coffee (3)', act: () => vend('coffee', 3, 'The highest coffee in the hemisphere. ☕', 'regular')(g) },
          { label: 'Sit at the Counter', act: () => sitDown('Best seat in the city. Literally the highest.')(g) },
        ],
      }) },
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
        actions: (g) => [{ label: 'Visit the Empire State', act: () => g.goto('empire-deck') }],
      })),
      'view-bridge': look('Brooklyn Bridge', card({
        title: 'Brooklyn Bridge', kicker: 'Over the East River', pic: view('sky-deck', [598, 120, 210, 115]),
        text: 'You can see the whole bridge from here: 1,595 feet between its two stone towers. On the far side is Brooklyn (Coming Soon): Club NYC is Manhattan only for now.',
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
      fridge: { label: 'Fridge · Magnets', act: (g) => souv((m) => m.openFridge(g)) },
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
    id: 'loft', name: 'My Loft', area: 'SoHo · a cast-iron loft', bg: 'loft', indoor: true, npcs: 0, mapSpot: 'apartment',
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
    id: 'penthouse', name: 'My Penthouse', area: 'Billionaires’ Row · 57th St', bg: 'penthouse', indoor: true, npcs: 0, mapSpot: 'apartment',
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

/** The Exchange's front door: closed for now, like the real trading floor. */
function exchangeSoon(_g: Game) {
  fun((m) =>
    m.comingSoon({
      name: 'The Exchange',
      kicker: 'Wall Street',
      pic: { cut: 'wall-street', obj: 'door' },
      text: 'The trading floor is closed to visitors in real life, and ours is still being built. When the opening bell rings in here, you’ll be the first to know.',
      joke: 'Today’s forecast: pizza up, rent up, patience down.',
    }),
  )
}
