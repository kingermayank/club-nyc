import type { Game, ObjDef, RoomDef } from '../types'
import { bump } from '../state'
import { ITEM } from '../avatar/items'
import { WELCOME_GIFTS } from './economy'

// ---------- little helpers for room actions ----------
/** Buy (or re-equip) a hand-held treat and hold it right away. */
const vend = (item: string, _price: number, line: string, stamp?: string) => async (g: Game) => {
  bump('snacks')
  if (g.owns(item)) {
    g.wear(item)
    g.say(line)
    return
  }
  // the price comes from the item catalog (and, online, the server checks it)
  if (!(await g.buy(item))) return
  g.sfx.register()
  g.wear(item)
  g.say(line)
  if (stamp) g.stamp(stamp)
}
/** Sal's cart in Times Square: new New Yorkers pick a free welcome gift here (once), everyone else gets a hot dog */
const hotdogCart = async (g: Game) => {
  if (!WELCOME_GIFTS.some((id) => g.owns(id))) {
    const v = await g.choose('🌭 SAL’S CART', '“New in town? Welcome to New York! First one’s on the house: pick a welcome gift.”', [
      ...WELCOME_GIFTS.map((id) => ({ label: ITEM[id]?.name ?? id, value: id, note: 'free · welcome gift' })),
      { label: 'Just a hot dog (2)', value: 'dog' },
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
const shop = (id: string, section?: string): ObjDef['act'] => (g) => g.catalog(id, section)
const say = (line: string | string[]): ObjDef['act'] => (g) => g.say(Array.isArray(line) ? line[Math.floor(Math.random() * line.length)] : line)
const fact = (title: string, text: string, stamp?: string): ObjDef['act'] => (g) => {
  g.info(title, text)
  if (stamp) g.stamp(stamp)
}
const exit = (label: string, room: string): ObjDef => ({ label, go: room })
const soon = (label: string): ObjDef => ({ label, soon: true })
const look = (label: string, act: ObjDef['act']): ObjDef => ({ label, act, instant: true })
const coo: ObjDef['act'] = (g) => {
  g.sfx.coo()
  g.say('Coo coo! 🐦')
  g.flags.coo = (g.flags.coo ?? 0) + 1
  if (g.flags.coo >= 3) g.stamp('flock')
}
const wish: ObjDef['act'] = async (g) => {
  const v = await g.choose('⛲ Make a wish?', 'Toss a coin, make a wish. Fountain rules.', [
    { label: 'Toss a coin (1)', value: 'yes' },
    { label: 'Keep my coin', value: 'no' },
  ])
  if (v !== 'yes' || !g.spend(1, 'wish')) return
  g.sfx.coin()
  const fortunes = ['…a rent-stabilized apartment', '…a seat on the L train at rush hour', '…the perfect bagel', '…a Broadway debut', '…no tourists on Fifth Avenue', '…a rooftop with a view']
  g.say(`I wish for ${fortunes[Math.floor(Math.random() * fortunes.length)]} ✨`)
  g.confetti(24)
  g.stamp('wish')
}
const taxi: ObjDef['act'] = (g) => {
  g.sfx.honk()
  g.say('TAXI! 🚕')
  setTimeout(() => g.openMap(), 650)
}
const binoc = (cx: number, cy: number, labels: [number, number, string][]): ObjDef['act'] => (g) =>
  g.binoculars({ cx, cy, zoom: 3, labels: labels.map(([x, y, text]) => ({ at: [x, y], text })) })

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
      stage: { label: 'Watch tonight’s show', act: (g) => g.watchShow() },
      curtain: { label: 'Watch tonight’s show', act: (g) => g.watchShow() },
      'seats-left': { label: 'Take a seat', sit: true },
      'seats-right': { label: 'Take a seat', sit: true },
      'box-left': look('Box Seats', say('Sold out. To a very rich pigeon.')),
      'box-right': look('Box Seats', say('The box seats are reserved for the critics. Shh.')),
      chandelier: look('Chandelier', say('If this falls during the show, it’s part of the show.')),
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
      mirror: { label: 'Mirror · try things on', act: () => import('../features/playerCard').then((m) => m.openWardrobe()) },
      booth: { label: 'Changing Room', act: () => import('../features/playerCard').then((m) => m.openWardrobe()) },
      neon: look('I ♥ NY', fact('I ♥ NY', 'The logo was sketched in 1977 by Milton Glaser in the back of a taxi to promote tourism. He did it for free.')),
      door: exit('Exit to Times Square', 'times-square'),
    },
  },

  rockefeller: {
    id: 'rockefeller', name: 'Rockefeller Center', area: 'Midtown · The Rink', bg: 'rockefeller', npcs: 4, mapSpot: 'rockefeller',
    chatter: ['Do I look graceful? I feel graceful.', 'Who’s doing a triple axel?', 'The tree goes up in November!'],
    objects: {
      rink: look('The Rink', say('Walk onto the ice to skate! ⛸️')),
      statue: look('The Golden Statue', fact('Prometheus', 'The gilded bronze statue over the rink has been bringing fire to humanity (and photo ops to tourists) since 1934.')),
      'skate-rental': { label: 'Skate Rentals', act: shop('rink') },
      'tv-studio': { label: 'TV Studio · wave on air!', act: (g) => import('../features/extras').then((m) => m.onAir(g)) },
      flags: look('Flags', say('Almost 200 flags fly around the plaza. I counted. (I didn’t.)')),
      'flags-2': look('Flags', say('Every member of the UN gets a flag here on special days.')),
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
    chatter: ['Window shopping is free!', 'That trunk building is a whole mood.', 'Halal Bros has the best white sauce.'],
    objects: {
      'maison-malle': exit('Maison Malle', 'maison-malle'),
      'toy-palace': exit('Toy Palace', 'toy-palace'),
      'halal-cart': {
        label: 'Halal Bros Cart',
        act: async (g) => {
          const v = await g.choose('🥙 HALAL BROS', '“Chicken over rice, my friend? Or… you want to work the lunch rush?”', [
            { label: 'Chicken over rice (6)', value: 'buy', note: 'extra white sauce' },
            { label: 'Work the lunch rush', value: 'work', note: 'mini-game · earn coins' },
          ])
          if (v === 'buy') {
            if (!g.spend(6, 'halal-plate')) return
            bump('snacks')
            g.sfx.register()
            g.say('Extra white sauce. The line was worth it. 🥙')
          }
          if (v === 'work') g.playGame('halal-rush')
        },
      },
      cathedral: look('St. Patrick’s Cathedral', fact('St. Patrick’s Cathedral', 'Neo-Gothic spires on Fifth Avenue, finished in 1878. Those steeples are about 330 feet tall.')),
      'street-sign': look('5 Av & W 57 St', fact('Fifth Avenue', 'The dividing line of Manhattan: addresses are “East” on one side and “West” on the other.')),
      hydrant: look('Fire Hydrant', say('In July this becomes a sprinkler party. Today it’s just a hydrant.')),
      manhole: look('Steaming Manhole', say('Nobody knows where the steam comes from. Nobody asks.')),
      'exit-left': exit('To Rockefeller Center', 'rockefeller'),
      'exit-right': exit('To Central Park', 'central-park'),
    },
  },

  'toy-palace': {
    id: 'toy-palace', name: 'Toy Palace', area: 'Fifth Avenue', bg: 'toy-palace', indoor: true, npcs: 2, mapSpot: 'fifth-ave',
    objects: {
      'piano-obj': look('Giant Floor Piano', say('Walk across the keys to play! 🎹')),
      teddy: look('Giant Teddy', say('He’s 15 feet tall and he’s not for sale. I asked.')),
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
      staircase: look('VIP Staircase', say('“The upstairs salon is by appointment only.” Fancy.')),
      'velvet-rope': look('Velvet Rope', say('Ooh. A rope. That means it’s exclusive.')),
      chandelier: look('Chandelier', say('This chandelier costs more than my rent. Probably.')),
      'mannequin-1': look('Mannequin', say('Serving looks. Literally.')), 'mannequin-2': look('Mannequin', say('Camel coat season.')), 'mannequin-3': look('Mannequin', say('Very chic.')),
    },
    zones: { exit: exit('Exit to Fifth Avenue', 'fifth-ave') },
  },

  'central-park': {
    id: 'central-park', name: 'Central Park', area: 'The Lake · Bow Bridge', bg: 'central-park', npcs: 4, mapSpot: 'central-park',
    chatter: ['843 acres and I still can’t find the zoo.', 'Squirrels here are fearless.', 'Picnic on the Great Lawn later?'],
    objects: {
      carriage: { label: 'Horse Carriage Ride', act: (g) => import('../features/extras').then((m) => m.carriageRide(g)) },
      boathouse: { label: 'Boathouse Café', act: vend('cocoa', 3, 'Hot cocoa by the lake. Very cozy. ☕') },
      pretzels: { label: 'Pretzel Cart', act: vend('pretzel', 2, 'Salty, warm, the size of my face. 🥨') },
      rowboat: look('Rowboat', (g) => { g.sfx.quack(); g.say('The ducks have claimed this boat. 🦆') }),
      'duck-1': look('Duck', (g) => { g.sfx.quack(); g.say('Quack yourself.') }), 'duck-2': look('Duck', (g) => { g.sfx.quack(); g.say('This duck has seen things.') }), 'duck-3': look('Duck', (g) => { g.sfx.quack(); g.say('A duck in Central Park. Truly the most New York duck.') }),
      'squirrel-1': look('Squirrel', say('That squirrel is eyeing my snack…')), 'squirrel-2': look('Squirrel', say('Central Park squirrels fear nothing.')),
      bridge: look('Bow Bridge', fact('Bow Bridge', 'A cast-iron bridge over The Lake from 1862, and probably the most-proposed-on spot in the whole city.')),
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
      doors: soon('Galleries'),
      banners: look('Banners', say('This season: “Hot Dogs Through the Ages.” Kidding. Probably.')),
      'fountain-left': { label: 'Fountain', act: wish }, 'fountain-right': { label: 'Fountain', act: wish },
      hotdog: { label: 'Hot Dog Cart', act: vend('hotdog', 2, 'Museum-grade hot dog. 🌭') },
      pretzel: { label: 'Pretzel Cart', act: vend('pretzel', 2, 'A pretzel on the Met steps. Iconic. 🥨') },
      taxi: { label: 'Hail a Taxi', act: taxi, instant: true },
      'exit-left': exit('To Central Park', 'central-park'),
      'exit-right': soon('Harlem'),
    },
  },

  'empire-deck': {
    id: 'empire-deck', name: 'Empire State Building', area: '86th Floor Observatory', bg: 'empire-deck', indoor: true, npcs: 3, mapSpot: 'empire-state',
    chatter: ['I can see my apartment from here!', 'My ears just popped.', '1,050 feet up!'],
    onEnter: (g) => g.stamp('top-of-world'),
    objects: {
      'viewer-left': { label: 'Tower Viewer', act: binoc(470, 140, [[405, 118, 'Chrysler Building'], [540, 138, 'Central Park'], [690, 140, 'Water towers'], [260, 165, 'Midtown rooftops']]) },
      'viewer-right': { label: 'Tower Viewer', act: binoc(650, 70, [[655, 42, 'A blimp!'], [770, 86, 'Sunset over New Jersey'], [590, 86, 'Uptown']]) },
      elevator: exit('Elevator ↓ to Fifth Avenue', 'fifth-ave'),
      blimp: look('Blimp', say('Is that blimp… following me?')),
      spire: look('The Spire', fact('The Spire', 'The mast was built so airships could dock at the top. It was tried once, in 1931. It did not go well.')),
      chrysler: look('Chrysler Building', fact('Chrysler Building', 'The art-deco crown is made of stainless steel and has hubcap-shaped details. It was built for a car company.')),
    },
  },

  'grand-central': {
    id: 'grand-central', name: 'Grand Central Terminal', area: 'Main Concourse · 42nd St', bg: 'grand-central', indoor: true, npcs: 5, mapSpot: 'grand-central',
    chatter: ['Meet me at the clock.', 'Track 29! Where’s track 29?', 'I always look up in here.'],
    objects: {
      clock: look('The Opal Clock', fact('The Clock', 'All four faces of the clock above the information booth are made of opal. Experts have valued it at $10–20 million.')),
      ceiling: look('The Ceiling', fact('Look Up!', 'The constellations on the ceiling are painted BACKWARDS, as if seen from outside the sky. The official story: it’s God’s-eye view.', 'backwards-sky')),
      departures: look('Departures', say('Metro-North to the suburbs is still being built. Very on-brand.')),
      tickets: soon('Ticket Windows · Metro-North'),
      whisper: { label: 'Whispering Gallery', act: (g) => import('../features/extras').then((m) => m.whisper(g)) },
      staircase: exit('Down to the subway', 'subway'),
      flag: look('Flag', say('The big flag has hung here since 2001.')),
      windows: look('Windows', say('Those beams of light! Every photographer’s dream.')),
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
            { label: 'Ride the subway', value: 'ride', note: 'pick a stop' },
            { label: 'SHOWTIME!', value: 'show', note: 'dance for tips · mini-game' },
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
      trash: look('Trash Can', say('No. Absolutely not.')),
      bench: { label: 'Bench', sit: true },
      sign: look('Subway Sign', fact('The Subway', '472 stations, 24/7, since 1904. The colored circles are “bullets”: each color is a trunk line.')),
    },
  },

  soho: {
    id: 'soho', name: 'SoHo', area: 'Greene St · Cast-Iron District', bg: 'soho', npcs: 5, mapSpot: 'soho', steamFrom: 'manhole',
    chatter: ['Have you seen the new drop at Sneaker Vault?', 'Cobblestones + heels = bad idea.', 'I come here for the cast iron. And the coffee.'],
    objects: {
      thread: exit('THREAD · Fashion', 'thread'),
      'sneaker-vault': exit('Sneaker Vault', 'sneaker-vault'),
      'bean-there': exit('Bean There Coffee', 'coffee'),
      mural: look('Street Art', say('This wall changes every few months. Today: a very familiar-looking penguin. 👀')),
      vendor: {
        label: 'Street Vendor',
        act: async (g) => {
          const v = await g.choose('🕶️ Street Vendor', '“Designer sunglasses! Totally real! Ten coins. For you, five.”', [
            { label: '“Designer” shades (5)', value: 'shades' },
            { label: 'Tote bag (5)', value: 'bag' },
          ])
          if (v === 'shades') vend('shades', 5, 'Definitely real. Definitely. 😎')(g)
          if (v === 'bag') vend('shopping-bag', 5, 'Every New Yorker needs a tote.')(g)
        },
      },
      bikes: look('Bike Rack', say('Biking down Broadway? Brave.')),
      hydrant: look('Hydrant', say('A SoHo hydrant. Somehow more stylish.')),
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
      mirror: { label: 'Mirror · try things on', act: () => import('../features/playerCard').then((m) => m.openWardrobe()) },
      fitting: { label: 'Fitting Room', act: () => import('../features/playerCard').then((m) => m.openWardrobe()) },
      neon: look('thread', say('Minimalism, but make it neon.')),
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
      wall: { label: 'The Wall · sneakers', act: shop('sneakers', 'kicks') },
      boxes: { label: 'Extras', act: shop('sneakers', 'extras') },
      counter: { label: 'Checkout', act: shop('sneakers') },
      vault: look('The Vault', say('The vault holds the grails. Not for sale. Not even for you.')),
      bench: { label: 'Try-on Bench', sit: true },
      turntable: { label: 'Turntable', act: (g) => { g.sfx.ding(); g.emote('dance', 4); g.say('This beat goes hard 🎧') } },
      neon: look('Sneaker Vault', say('The neon hums in sneaker.')),
      measurer: look('Foot Measurer', say('Size 9½. Wide. Cool.')),
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
            { label: 'Deli coffee (3)', value: 'coffee', note: 'the blue cup' },
            { label: 'Everything bagel (2)', value: 'bagel' },
            { label: 'Help with the delivery', value: 'work', note: 'Bagel Counters · earn coins' },
          ])
          if (v === 'coffee') vend('coffee', 3, '“We Are Happy To Serve You” ☕', 'regular')(g)
          if (v === 'bagel') vend('bagel', 2, 'Toasted? In New York? Bold. 🥯')(g)
          if (v === 'work') g.playGame('bagel-counters')
        },
      },
      espresso: look('Espresso Machine', (g) => { g.sfx.whoosh(); g.say('*hissssss* That’s the sound of productivity.') }),
      menu: look('Menu', say('“Cold brew, pour over, the usual.” I’ll have the usual.')),
      sacks: look('Coffee Sacks', say('Freshly roasted. Smells incredible.')),
      stairs: soon('Book Nook (upstairs)'),
      window: look('Window', say('Cobblestones and people-watching. Perfect.')),
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
      arch: look('Little Italy', fact('Little Italy', 'Mulberry Street once held a huge Italian community; today it’s a few blocks of red-sauce restaurants, plus the Feast of San Gennaro every September.')),
      fruit: look('Fruit Stand', (g) => { if (!g.spend(1, 'fruit')) return; g.sfx.register(); g.say('A dragon fruit for one coin! Amazing. 🐉') }),
      lanterns: look('Lanterns', say('So festive. 🏮')),
      'exit-left': exit('To SoHo', 'soho'),
      'exit-right': exit('To the Brooklyn Bridge', 'brooklyn-bridge'),
    },
  },

  pizza: {
    id: 'pizza', name: '99¢ Slice', area: 'Little Italy', bg: 'pizza', indoor: true, npcs: 2, mapSpot: 'chinatown',
    chatter: ['Fold it. Always fold it.', 'Best slice in the city, no contest.'],
    objects: {
      counter: {
        label: 'Order a slice',
        act: async (g) => {
          const v = await g.choose('🍕 99¢ SLICE', 'Everything is 1 coin. Or grab an apron: we’re short-staffed.', [
            { label: 'Plain slice (1)', value: 'slice', note: 'fold it like a local' },
            { label: 'Work a shift', value: 'work', note: 'Slice Factory · earn coins' },
            { label: 'With a fork and knife', value: 'fork' },
          ])
          if (v === 'slice') vend('pizza-slice', 1, 'Folded. Dripping. Perfect. 🍕', 'slice-of-life')(g)
          if (v === 'work') g.playGame('slice-factory')
          if (v === 'fork') g.say('A gasp ripples through the shop. Let’s pretend that didn’t happen.')
        },
      },
      oven: look('Pizza Oven', say('800 degrees of pure joy. 🔥')),
      menu: look('Menu', say('Cheese. Pepperoni. White. That’s the menu. Perfection.')),
      'photos-left': look('Wall of Fame', say('Signed headshots. I don’t recognize any of them.')),
      'photos-right': look('Wall of Fame', say('Someday my headshot will be up there.')),
      soda: { label: 'Soda Fridge', act: (g) => { if (!g.spend(1, 'soda')) return; g.sfx.register(); g.say('Ice cold. *crack* Fizzzz. 🥤') } },
      window: look('Window', (g) => { g.sfx.honk(); g.say('The taxis never stop honking.') }),
      neon: look('OPEN', say('Open 24/7. Pizza never sleeps.')),
      boxes: look('Pizza Boxes', say('Ready for delivery. Spider-Man not included.')),
      'table-1': { label: 'Table', sit: true }, 'table-2': { label: 'Table', sit: true }, 'table-3': { label: 'Table', sit: true }, 'table-4': { label: 'Table', sit: true },
      door: exit('Exit to Little Italy', 'chinatown'),
    },
  },

  'brooklyn-bridge': {
    id: 'brooklyn-bridge', name: 'Brooklyn Bridge', area: 'Pedestrian Promenade', bg: 'brooklyn-bridge-v2', npcs: 4, mapSpot: 'brooklyn-bridge',
    chatter: ['Golden hour on the bridge 😍', 'Bikes on the other side, please!', 'Brooklyn’s right there!'],
    objects: {
      easel: {
        label: 'Street Artist',
        act: async (g) => {
          const v = await g.choose('🎨 Skyline Painter', '“A painting of the skyline for your apartment? 8 coins, very cheap, very good.”', [
            { label: 'Buy the painting (8)', value: 'yes', note: 'furniture for your place' },
            { label: 'No thanks', value: 'no' },
          ])
          if (v !== 'yes' || !g.spend(8, 'furniture:painting')) return
          g.sfx.register()
          import('../features/apartment').then((m) => m.giveFurniture('painting'))
          g.say('It’s going right above my couch.')
        },
      },
      souvenirs: { label: 'Souvenir Stand', act: shop('iloveny') },
      tugboat: look('Tugboat', (g) => { g.sfx.toot(); g.say('TOOOOT') }),
      'gull-1': look('Seagull', (g) => { g.sfx.squawk(); g.say('That seagull is judging me.') }),
      'gull-2': look('Seagull', (g) => { g.sfx.squawk(); g.say('It wants my pretzel. It cannot have my pretzel.') }),
      tower: look('Bridge Tower', fact('Brooklyn Bridge, 1883', 'The first steel-wire suspension bridge. P.T. Barnum marched 21 elephants across in 1884 to prove it was safe.')),
      locks: look('Love Locks', say('Love locks are banned on the bridge now. Romance finds a way. 🔒')),
      'exit-left': exit('To Chinatown', 'chinatown'),
      'exit-right': soon('Brooklyn · DUMBO'),
    },
  },

  'battery-park': {
    id: 'battery-park', name: 'Battery Park', area: 'Ferry Dock · Lower Manhattan', bg: 'battery-park', npcs: 4, mapSpot: 'battery-park',
    chatter: ['The ferry is free, you know.', 'Look, Lady Liberty!', 'Seagulls, guard your snacks.'],
    objects: {
      tickets: { label: 'Ferry Tickets', act: (g) => g.ferry() },
      ferry: { label: 'Board the Ferry', act: (g) => g.ferry() },
      gangway: { label: 'Board the Ferry', act: (g) => g.ferry() },
      statue: look('Statue of Liberty', fact('Lady Liberty', 'A gift from France in 1886. 151 feet from heel to torch, and she wears a size 879 sandal.')),
      lifebuoy: look('Life Ring', say('Safety first. Then pretzels.')),
      'bench-1': { label: 'Bench', sit: true }, 'bench-2': { label: 'Bench', sit: true },
      gull: look('Seagull', (g) => import('../features/extras').then((m) => m.seagull(g))),
      lamp: look('Lamp Post', say('Very old-timey.')),
      'exit-left': exit('To the Brooklyn Bridge', 'brooklyn-bridge'),
    },
  },

  'liberty-island': {
    id: 'liberty-island', name: 'Liberty Island', area: 'New York Harbor', bg: 'liberty-island-v2', npcs: 4, mapSpot: 'liberty',
    chatter: ['She’s even bigger up close!', 'Crown tickets sell out months ahead.', 'I came here on the ferry!'],
    onEnter: (g) => g.stamp('liberty'),
    objects: {
      statue: look('Statue of Liberty', fact('Liberty Enlightening the World', 'Her copper skin is only 2.4 mm thick. She was brown when she arrived. The green patina took about 30 years.')),
      kiosk: { label: 'Souvenir Kiosk', act: shop('liberty') },
      'viewer-1': { label: 'Viewer', act: binoc(295, 118, [[300, 66, 'One World Trade'], [262, 150, 'Lower Manhattan'], [330, 182, 'Battery Park']]) },
      'viewer-2': { label: 'Viewer', act: binoc(714, 72, [[690, 24, 'The torch'], [735, 44, 'Crown · 25 windows'], [734, 96, 'July IV, MDCCLXXVI'], [715, 152, 'The pedestal']]) },
      ferry: {
        label: 'Ferry back to Manhattan',
        act: async (g) => {
          const v = await g.choose('⛴️ Back to Battery Park', 'The ferry is boarding.', [{ label: 'All aboard!', value: 'go' }])
          if (v === 'go') g.goto('battery-park', 'liberty-island')
        },
      },
      bench: { label: 'Bench', sit: true },
      skyline: look('Manhattan Skyline', say('It looks like a postcard from here.')),
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
      sailboat: look('Sailboat', say('Sailing on the Hudson. Living the dream.')),
      'river-view': { label: 'Hudson River View', act: binoc(840, 120, [[860, 100, 'Hudson River'], [900, 140, 'New Jersey'], [810, 180, 'Chelsea Piers']]) },
      'water-tower': look('Water Tower', fact('Water Towers', 'Most NYC buildings over six stories need rooftop water tanks, many still made of wood, by the same few family companies.')),
      'exit-left': exit('To SoHo', 'soho'),
    },
  },

  'chelsea-market': {
    id: 'chelsea-market', name: 'Chelsea Market', area: 'Old Nabisco Factory', bg: 'chelsea-market', indoor: true, npcs: 4, mapSpot: 'high-line',
    chatter: ['The Oreo was invented in this building!', 'Lobster roll or tacos? Why not both.'],
    objects: {
      waterfall: { label: 'The Waterfall', act: wish },
      tacos: look('Taco Loco', (g) => { if (!g.spend(3, 'tacos')) return; g.sfx.register(); g.say('Al pastor, extra cilantro. 🌮') }),
      lobster: look('Lobster Pot', (g) => g.say('A lobster roll costs 30 coins. I’ll… just smell it.')),
      donuts: { label: 'Donut Drop', act: vend('donut', 2, 'Sprinkles make everything better. 🍩') },
      bagels: { label: 'Bagel Bros', act: vend('bagel', 2, 'Scallion cream cheese. Elite. 🥯') },
      bench: { label: 'Bench', sit: true },
      stairs: exit('Up to the High Line', 'high-line'),
      'menu-board': look('Menu', say('So many choices. So little stomach.')),
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
      'photo-booth': {
        label: 'Spooky Photo Booth',
        act: (g) => {
          g.emote('cheer', 2)
          g.sfx.clapper()
          g.confetti(30)
          g.say('📸 *flash* Framed and on the fridge.')
        },
      },
      cauldron: look('Bubbling Cauldron', say(['Bubble bubble… it smells like cider.', 'Is that… green apple soda?'])),
      tombstones: look('Tombstones', say(['“Here lies my diet. 1999–2026.”', '“RIP my MetroCard balance.”'])),
      signs: look('6 Av & W 10 St', fact('The Village Halloween Parade', 'Since 1974 New Yorkers have marched up Sixth Avenue in homemade costumes and giant puppets. It’s the biggest Halloween parade in the country.')),
      manhole: look('Manhole', say('Even the steam is spooky tonight.')),
      'exit-left': exit('To SoHo', 'soho'),
      'exit-right': exit('To Times Square', 'times-square'),
    },
  },

  apartment: {
    id: 'apartment', name: 'My Apartment', area: 'A 5th-floor walk-up', bg: 'apartment', indoor: true, npcs: 0, mapSpot: 'apartment',
    objects: {
      door: { label: 'Leave', act: (g) => g.openMap(), instant: true },
      window: look('Window', say('Water towers, fire escapes, the Empire State. Worth the 5 flights.')),
      radiator: look('Radiator', (g) => { g.sfx.tick(); g.say('*CLANK* *CLANK* The radiator is alive.') }),
      fridge: look('Fridge', say('Half a halal platter and a lot of hot sauce packets.')),
      stove: look('Stove', say('I use it for storing sweaters. Very New York.')),
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
      kitchen: look('Kitchen', say('A six-burner stove for exactly one omelette a year.')),
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
      bar: look('Built-in Bar', say(['Seltzer, seltzer, and a very fancy seltzer.', 'The bar is stocked. With snacks. I’m 13+, relax.'])),
      view: look('The View', say(['All of Central Park. The building sways a little. That’s normal. Probably.', 'You can see the whole city from up here.'])),
    },
  },
}
