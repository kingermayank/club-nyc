/**
 * Instagram feed posts (4:5, 1080 x 1350): carousels you swipe through, and single images. Drawn by Post.tsx with the
 * brand book's parts (Burbank, paper and ink, Taxi Yellow, chunky outlines, hard ink shadows) over the game's own art
 * (copied into public/posts). Rendered by scripts/render-posts.mjs into out/posts/<id>/<nn>.jpg.
 * Copy rules: about 30% funny, the joke after the useful part, no em dashes, no prices we can't stand behind.
 */

export type Slide =
  | { kind: 'cover'; bg: string; title: string; kicker?: string; art: string; faces?: boolean }
  | { kind: 'word'; word: string; type: string; def: string; example: string; art: string }
  | { kind: 'place'; title: string; body: string; art: string; tag: string }
  | { kind: 'compare'; title: string; nyc: string; club: string; art: string; note?: string }
  | { kind: 'colours'; pairs: [string, string, string][] }
  | { kind: 'step'; n: number; title: string; body: string; art: string }
  | { kind: 'news'; headline: string; deck: string; art: string }
  | { kind: 'quote'; line: string; who: string; art: string }
  | { kind: 'poster'; bg: string; title: string; sub?: string; art: string; cta?: string; round?: boolean }
  | { kind: 'grid'; title: string; sub: string }
  | { kind: 'end'; title: string; line: string }
  // memes: our own art and the game's icons, never someone else's template or photo
  /** text on top (the last line is the punchline), the picture under it */
  | { kind: 'caption'; lines: string[]; art: string; pos?: string }
  /** two pictures side by side: what you pictured, what you got */
  | { kind: 'versus'; title?: string; left: [string, string, string]; right: [string, string, string]; note?: string }
  /** six things that make a type of person */
  | { kind: 'starter'; title: string; items: [string, string, string][] }
  /** rows from S down: [tier, colour, [icon, label][]] */
  | { kind: 'tier'; title: string; rows: [string, string, [string, string][]][] }
  // real New York next to ours: public-domain or CC0 photos only (public/posts/real, credits.json), no faces, no brands
  /** a cover: the real photo and the Club NYC art side by side */
  | { kind: 'split'; bg: string; title: string; kicker?: string; real: string; club: string; realPos?: string; clubPos?: string; realLabel?: string }
  /** the real photo over its Club NYC version, the tell above them. `label` replaces "Real New York" (a year, say) */
  | { kind: 'real'; place: string; tell: string; real: string; club: string; credit: string; realPos?: string; clubPos?: string; label?: string; clubLabel?: string }
  /** a StreetCheesy listing (the game's own listings app, app/src/data/homes.ts): the home, its price in coins, the perks
   *  and the fine print, plus `earn`: what that costs in shifts */
  | { kind: 'listing'; name: string; hood: string; price: string; earn?: string; art: string; perks: string[]; fine: string }
  /** a money-diary day: what came in and went out, in coins (real game prices and shift pay inside the server caps) */
  | { kind: 'diary'; day: string; title: string; rows: [string, string][]; note?: string; art: string; pos?: string }

export interface PostDef {
  id: string
  title: string
  /** carousel = swipe; single = one image */
  type: 'carousel' | 'single'
  slides: Slide[]
}

/** the 14 signature colours (app/src/avatar/look.ts SIG_COLORS), with a personality each */
export const COLOURS: [string, string, string][] = [
  ['Taxi Yellow', '#ffc634', 'Always five minutes away. Has been for an hour.'],
  ['Hydrant Red', '#e2453c', 'Main character. Knows it.'],
  ['Pizza Orange', '#ff8a2a', 'Folds first, asks later.'],
  ['Lox Pink', '#ff8fae', 'Brunch is a personality.'],
  ['Broadway Purple', '#8a5cd6', 'Will sing at the slightest provocation.'],
  ['Bodega Blue', '#3d72d9', 'Knows the bodega cat by name.'],
  ['Liberty Teal', '#36b5a6', 'Gives directions nobody asked for. They are right.'],
  ['Subway Green', '#2f9e55', 'Stands clear of the closing doors. Usually.'],
  ['Mint Chip', '#9fe0b8', 'Has a plant on every windowsill.'],
  ['Brooklyn Brick', '#b9533a', 'Lived here before it was cool. Will mention it.'],
  ['Pretzel Brown', '#8f5d36', 'Street cart regular. Mustard, no question.'],
  ['Pigeon Grey', '#8c93a6', 'Has seen things. Stays calm.'],
  ['Midnight', '#2d3352', 'Out until 4, up at 7, somehow fine.'],
  ['Snow White', '#f3f3f6', 'Wears white on the subway. Fearless.'],
]

const END = (title: string, line = 'Link in bio'): Slide => ({ kind: 'end', title, line })

export const POSTS: PostDef[] = [
  {
    id: 'speak-new-yorker',
    title: 'How to speak New Yorker',
    type: 'carousel',
    slides: [
      { kind: 'cover', bg: '#ffc634', title: 'How to speak New Yorker', kicker: 'A glossary for your first week', art: 'high-line.jpg' },
      { kind: 'word', word: 'Bodega', type: 'noun', def: 'A corner store with a cat, a sandwich and everything you forgot.', example: 'Meet me at the bodega.', art: 'cat-mayor.jpg' },
      { kind: 'word', word: 'Schmear', type: 'noun', def: 'Cream cheese, said with confidence.', example: 'Everything bagel, scallion schmear.', art: 'show-bagels.jpg' },
      { kind: 'word', word: 'Showtime', type: 'noun', def: 'The next stop will feature acrobatics. Hold your coffee.', example: 'What time is it? Showtime!', art: 'subway.jpg' },
      { kind: 'word', word: 'Stoop', type: 'noun', def: 'Front steps. Also a living room, an office and a stage.', example: 'The Met has the biggest one.', art: 'the-met.jpg' },
      { kind: 'word', word: 'The line', type: 'noun', def: 'Proof the food is good. Never a reason to leave.', example: 'Extra white sauce. It was worth it.', art: 'halal-line.jpg' },
      { kind: 'word', word: 'Pizza rat', type: 'proper noun', def: 'A local legend. Do not make eye contact.', example: 'He took the whole slice.', art: 'pizzarat.jpg' },
      END('Now say it in the city'),
    ],
  },
  {
    id: 'first-day',
    title: 'Your first day in Manhattan',
    type: 'carousel',
    slides: [
      { kind: 'cover', bg: '#3d72d9', title: 'Your first day in Manhattan', kicker: 'A six-stop guide. Swipe', art: 'brooklyn-bridge-v2.jpg' },
      { kind: 'place', tag: 'Stop 1 · Liberty Island', title: 'Wave at the lady', body: 'She has been holding that torch since 1886. Wave back.', art: 'liberty-island-v2.jpg' },
      { kind: 'place', tag: 'Stop 2 · The ferry', title: 'Ride it, or drive it', body: 'There is a job for that. Ferry Captain pays in coins and seagull respect.', art: 'captain.jpg' },
      { kind: 'place', tag: 'Stop 3 · Grand Central', title: 'Look up', body: 'The ceiling is full of constellations, painted backwards. Nobody agrees why.', art: 'grand-central.jpg' },
      { kind: 'place', tag: 'Stop 4 · Central Park', title: 'Get a little lost', body: '843 acres in real life. You will still find the pretzel cart.', art: 'central-park.jpg' },
      { kind: 'place', tag: 'Stop 5 · The Met', title: 'Sit on the steps', body: 'Everyone does. It is the most famous stoop in the city.', art: 'the-met.jpg' },
      { kind: 'place', tag: 'Stop 6 · Empire State', title: 'Point at things', body: '86th floor. Bring a friend, so you have someone to point at things with.', art: 'empire-deck.jpg' },
      END('Every stop is a room you can walk into'),
    ],
  },
  {
    id: 'free-in-club',
    title: 'Free in Club NYC',
    type: 'carousel',
    slides: [
      { kind: 'cover', bg: '#2f9e55', title: 'Things that are free in Club NYC', kicker: 'And very not free in New York', art: 'penthouse.jpg' },
      { kind: 'compare', title: 'Rent', nyc: 'Please sit down', club: '0 coins', art: 'apartment.jpg', note: 'You still get a radiator that clanks.' },
      { kind: 'compare', title: 'The observation deck', nyc: 'A ticket', club: 'Walk right in', art: 'empire-deck.jpg' },
      { kind: 'compare', title: 'Times Square at night', nyc: 'Bring a wallet', club: 'It pays you', art: 'ts-left.jpg', note: 'Dance at the Dance Jam: 20 coins, every 8 minutes.' },
      { kind: 'compare', title: 'Skating at the rink', nyc: 'A rink fee', club: 'Free in sneakers', art: 'rink.jpg', note: 'Skate rental is 15 coins. Sneakers are a bold choice.' },
      { kind: 'compare', title: 'The Statue’s crown', nyc: 'Book months ahead', club: 'Climb right up', art: 'liberty-island-v2.jpg', note: 'Real crown tickets sell out months ahead. Ours never do.' },
      END('Come see the rest'),
    ],
  },
  {
    id: 'which-new-yorker',
    title: 'Which New Yorker are you?',
    type: 'carousel',
    slides: [
      { kind: 'cover', bg: '#ff8fae', title: 'Which New Yorker are you?', kicker: 'Pick your colour. Swipe', art: 'face-3.png', faces: true },
      { kind: 'colours', pairs: COLOURS.slice(0, 2) },
      { kind: 'colours', pairs: COLOURS.slice(2, 4) },
      { kind: 'colours', pairs: COLOURS.slice(4, 6) },
      { kind: 'colours', pairs: COLOURS.slice(6, 8) },
      { kind: 'colours', pairs: COLOURS.slice(8, 10) },
      { kind: 'colours', pairs: COLOURS.slice(10, 12) },
      { kind: 'colours', pairs: COLOURS.slice(12, 14) },
      END('Comment your colour', 'Then wear it in the city · Link in bio'),
    ],
  },
  {
    id: 'fold-a-slice',
    title: 'How to eat a slice',
    type: 'carousel',
    slides: [
      { kind: 'cover', bg: '#e2453c', title: 'How to eat a slice like a New Yorker', kicker: 'Four steps. No forks', art: 'game-slice.jpg' },
      { kind: 'step', n: 1, title: 'Wait 30 seconds', body: 'The roof of your mouth will thank you.', art: 'game-slice.jpg' },
      { kind: 'step', n: 2, title: 'Fold it lengthwise', body: 'Always fold it. This is not up for debate.', art: 'hiring.jpg' },
      { kind: 'step', n: 3, title: 'Tip down, lean in', body: 'Let the grease go where it wants. It was never yours.', art: 'pizzarat.jpg' },
      { kind: 'step', n: 4, title: 'Eat it walking', body: 'Sitting down is allowed. We just will not mention it.', art: 'central-park.jpg' },
      END('Or fold them for coins at Slice Factory'),
    ],
  },
  // headlines straight from the game's paper (app/src/data/news.ts), which prints a new edition every day
  {
    id: 'city-news',
    title: 'This week in the city',
    type: 'carousel',
    slides: [
      { kind: 'cover', bg: '#fffdf6', title: 'This week in the city', kicker: 'The Club NYC Times, in five headlines', art: 'cityhall.jpg' },
      { kind: 'news', headline: 'Train Arrives Exactly When the Sign Said It Would', deck: 'Commuters remain suspicious.', art: 'subway.jpg' },
      { kind: 'news', headline: 'Listing Calls Studio “Cozy”; Tenant Can Reach the Fridge From Bed', deck: 'The broker prefers “efficient.”', art: 'apartment.jpg' },
      { kind: 'news', headline: 'Central Park Ducks Claim Rowboat; Parks Officials Decline to Get Involved', deck: 'The ducks could not be reached for comment.', art: 'central-park.jpg' },
      { kind: 'news', headline: 'Blimp Circles the Empire State Building; Visitors Wave, Blimp Does Not', deck: 'It has never once waved back.', art: 'empire-deck.jpg' },
      { kind: 'news', headline: 'Pizza Rat Spotted Again at Times Sq–42 St; Three Witnesses, Zero Photos', deck: 'He took the whole slice.', art: 'rat.jpg' },
      END('A new paper every day, in the game', 'Opens Nov 17 · Link in bio'),
    ],
  },
  // ---------------------------------------------------------------- singles
  { id: 'fold-it', title: 'Fold it.', type: 'single', slides: [{ kind: 'quote', line: 'Fold it. Always fold it.', who: 'Every New Yorker, at you', art: 'game-slice.jpg' }] },
  { id: 'elevator', title: 'The elevator', type: 'single', slides: [{ kind: 'quote', line: 'The elevator is out. Again.', who: 'Your super, every Monday', art: 'apartment.jpg' }] },
  { id: 'tag-the-line', title: 'Tag the friend', type: 'single', slides: [{ kind: 'poster', bg: '#ffc634', title: 'Tag the friend who would wait in this line', sub: 'And bring you back extra white sauce', art: 'halal-line.jpg', cta: 'Tag them' }] },
  { id: 'pigeon', title: 'Local resident', type: 'single', slides: [{ kind: 'poster', bg: '#8c93a6', title: 'Local resident. Has opinions.', sub: 'Lives in every room. Pays no rent. Respect him.', art: 'pigeon.png', round: true }] },
  { id: 'colour-grid', title: 'Pick your colour', type: 'single', slides: [{ kind: 'grid', title: 'Pick your colour', sub: 'Your New Yorker wears it, so friends spot you across Times Square' }] },
  { id: 'open-date', title: 'We open Nov 17', type: 'single', slides: [{ kind: 'poster', bg: '#3d72d9', title: 'The city opens Nov 17', sub: 'Bring the group chat.', art: 'grand-central.jpg', cta: 'Link in bio' }] },
  { id: 'where-live', title: 'Where would you live?', type: 'single', slides: [{ kind: 'poster', bg: '#fffdf6', title: 'Where would you live?', sub: 'Comment your neighbourhood. Wrong answers welcome.', art: 'map-v3.jpg', cta: 'Comment it' }] },
  { id: 'now-hiring', title: 'Now hiring', type: 'single', slides: [{ kind: 'poster', bg: '#e2453c', title: 'Now hiring: five jobs, no interview', sub: 'Pizza, bagels, halal, Showtime, the ferry. Pays in coins.', art: 'hiring.jpg', cta: 'Pick one' }] },
  // ---------------------------------------------------------------- memes (singles; the 19:00 slot, about twice a week)
  { id: 'meme-pizza-rat', title: 'Nobody: pizza rat', type: 'single', slides: [{ kind: 'caption', lines: ['Nobody:', 'Absolutely nobody:', 'Pizza rat at rush hour, carrying the whole slice up the stairs:'], art: 'pizzarat.jpg' }] },
  { id: 'meme-pictured', title: 'What I pictured vs what I got', type: 'single', slides: [{ kind: 'versus', title: 'Moving to New York', left: ['What I pictured', 'penthouse.jpg', '#3d72d9'], right: ['What I got', 'apartment.jpg', '#e2453c'], note: 'The radiator has more opinions than my roommate.' }] },
  { id: 'meme-starter', title: 'New New Yorker starter pack', type: 'single', slides: [{ kind: 'starter', title: 'The new New Yorker starter pack', items: [['bagel', 'An everything bagel, daily', '#ffc634'], ['pizza', 'Strong opinions about folding', '#e2453c'], ['subway', '“The train is right there”', '#2f9e55'], ['pigeon', 'A pigeon who knows your name', '#8c93a6'], ['coffee', 'Iced coffee in January', '#ff8fae'], ['sneaker', 'Walks 4 mph, minimum', '#3d72d9']] }] },
  { id: 'meme-train', title: 'Arriving now', type: 'single', slides: [{ kind: 'caption', lines: ['The sign: “Arriving now.”', 'The train, four minutes later:'], art: 'subway.jpg' }] },
  { id: 'meme-tier', title: 'Lines, ranked', type: 'single', slides: [{ kind: 'tier', title: 'New York lines, ranked by worth it', rows: [['S', '#ffc634', [['gyro', 'The halal cart'], ['bagel', 'Bagels on a Sunday']]], ['A', '#9fe0b8', [['ferry', 'The free ferry'], ['pizza', 'The slice place']]], ['B', '#8fb6ff', [['pretzel', 'A pretzel cart'], ['hot-dog', 'A hot dog, 1 a.m.']]], ['C', '#ff8fae', [['sneaker', 'A sneaker drop'], ['taxi', 'A cab in the rain']]]] }] },
  { id: 'meme-bodega-cat', title: 'The bodega cat', type: 'single', slides: [{ kind: 'caption', lines: ['The bodega cat when you walk in and don’t buy anything:'], art: 'cat-mayor.jpg', pos: '50% 30%' }] },
  { id: 'meme-walk', title: 'Tell me you’re a New Yorker', type: 'single', slides: [{ kind: 'caption', lines: ['Tell me you’re a New Yorker without telling me.', '“It’s only 30 blocks. We can walk.”'], art: 'high-line.jpg' }] },
  { id: 'meme-weekend', title: 'Weekend plans', type: 'single', slides: [{ kind: 'versus', title: 'My weekend', left: ['The plan', 'the-met.jpg', '#8a5cd6'], right: ['What happened', 'halal-line.jpg', '#ffc634'], note: 'Got in a line. Ate. Went home. Perfect weekend.' }] },
  { id: 'meme-group-chat', title: 'The group chat', type: 'single', slides: [{ kind: 'caption', lines: ['The group chat: “we should all hang out more”', 'The group chat, for the next six months:'], art: 'empire-deck.jpg' }] },
  { id: 'meme-radiator', title: 'The radiator', type: 'single', slides: [{ kind: 'caption', lines: ['Me: “Is the heat coming on soon?”', 'The radiator, in October:'], art: 'apartment.jpg', pos: '30% 60%' }] },
  // ---------------------------------------------------------------- the story pass (docs/marketing/story-research.md)
  // real New York next to ours: every Club NYC side is something you can really do in the game (rooms.ts, homes.ts)
  {
    id: 'real-vs-club',
    title: 'Real New York vs Club NYC',
    type: 'carousel',
    slides: [
      { kind: 'split', bg: '#ffc634', title: 'Real New York vs Club NYC', kicker: 'How to tell which one you’re standing in. Swipe', real: 'real/grand-central-wide.jpg', realPos: '50% 50%', club: 'grand-central.jpg', clubPos: '50% 50%' },
      { kind: 'real', place: 'Bow Bridge · Central Park', tell: 'Only one lets you propose to the bridge. It says yes.', real: 'real/bow-bridge.jpg', realPos: '50% 62%', club: 'central-park.jpg', clubPos: '50% 14%', credit: 'Photo: Pierre Blaché · CC0' },
      { kind: 'real', place: 'Grand Central · Main Concourse', tell: '“Meet me at the clock.” Ours has a button for it.', real: 'real/grand-central-wide.jpg', realPos: '50% 58%', club: 'grand-central.jpg', clubPos: '50% 62%', credit: 'Photo: D. Benjamin Miller · CC0' },
      { kind: 'real', place: 'Brooklyn Bridge · Promenade', tell: 'Real: walk to Brooklyn. Ours: Brooklyn is “coming soon.”', real: 'real/brooklyn-bridge.jpg', realPos: '50% 62%', club: 'bb-crop.jpg', clubPos: '50% 40%', credit: 'Photo: Matthew Henry · CC0' },
      { kind: 'real', place: 'Liberty Island', tell: 'Real crown tickets sell out months ahead. Ours is a button.', real: 'real/liberty.jpg', realPos: '50% 55%', club: 'liberty-island-v2.jpg', clubPos: '50% 35%', credit: 'Photo: Carol M. Highsmith · Library of Congress' },
      { kind: 'real', place: 'The ferry', tell: 'Real: the Staten Island Ferry is free. Ours: you captain it.', real: 'real/ferry.jpg', realPos: '50% 55%', club: 'captain.jpg', credit: 'Photo: Carol M. Highsmith · Library of Congress' },
      { kind: 'real', place: 'A walk-up · Manhattan', tell: 'Real: $4,995 a month. Ours: free, with a pigeon roommate.', real: 'real/fire-escapes.jpg', realPos: '50% 40%', club: 'apartment.jpg', clubPos: '50% 30%', credit: 'Photo: Carol M. Highsmith · Library of Congress' },
      { kind: 'real', place: 'The 86th floor', tell: 'Same view. Only ours has a blimp that won’t wave back.', real: 'real/esb-night.jpg', realPos: '50% 45%', club: 'empire-deck.jpg', clubPos: '50% 30%', credit: 'Photo: Doorknob747 · CC0' },
      END('Only one of them has free rent', 'Opens Nov 17 · Link in bio'),
    ],
  },
  // public-domain New York (Library of Congress, National Archives) next to the same place in the game
  {
    id: 'then-and-now',
    title: 'New York, then. Club NYC, now.',
    type: 'carousel',
    slides: [
      { kind: 'split', bg: '#2d3352', title: 'New York, then. Club NYC, now.', kicker: 'Same city, about a century apart. Swipe', real: 'real/grand-central-1941-crop.jpg', realPos: '45% 40%', realLabel: '1941', club: 'grand-central.jpg', clubPos: '42% 50%' },
      { kind: 'real', place: 'Grand Central', label: '1941', clubLabel: 'Club NYC, 2026', tell: '85 years later, it’s still where New York meets up.', real: 'real/grand-central-1941-crop.jpg', realPos: '50% 42%', club: 'grand-central.jpg', clubPos: '50% 62%', credit: 'Photo: John Collier Jr., 1941 · Library of Congress' },
      { kind: 'real', place: 'Bow Bridge · Central Park', label: '1800s', clubLabel: 'Club NYC, 2026', tell: 'Finished in 1862. Still the best curve in the park.', real: 'real/bow-bridge-1870-crop.jpg', realPos: '50% 50%', club: 'central-park.jpg', clubPos: '50% 14%', credit: 'Photo: W. M. Chase · public domain' },
      { kind: 'real', place: 'The ferry', label: '1973', clubLabel: 'Club NYC, 2026', tell: 'It had a fare in 1973. Free since 1997. Ours, you drive.', real: 'real/ferry-1973.jpg', realPos: '50% 62%', club: 'captain.jpg', credit: 'Photo: Wil Blanche, 1973 · National Archives' },
      { kind: 'real', place: 'Pigeons', label: '1943', clubLabel: 'Club NYC, 2026', tell: 'Pigeons, 1943. Pretty sure a few still work here.', real: 'real/pigeons-1943-crop.jpg', realPos: '50% 66%', club: 'ts-left.jpg', clubPos: '50% 78%', credit: 'Photo: John Vachon, 1943 · Library of Congress' },
      END('The city keeps changing. The good parts stay.'),
    ],
  },
  // StreetCheesy, the game's listings app: prices, perks and fine print exactly as homes.ts has them
  {
    id: 'streetcheesy',
    title: 'Apartment hunting in Club NYC',
    type: 'carousel',
    slides: [
      { kind: 'cover', bg: '#3d72d9', title: 'Apartment hunting in Club NYC', kicker: 'No broker. No guarantor. No 40x rule. Swipe', art: 'loft.jpg' },
      { kind: 'listing', name: '5th-Floor Walk-Up', hood: 'East Village', price: 'Free', earn: 'Yours on day one', art: 'apartment.jpg', perks: ['Bodega downstairs', 'Fire-escape “balcony”', 'Steps = free gym'], fine: 'No elevator. No dishwasher. No regrets.' },
      { kind: 'listing', name: 'Cast-Iron Loft', hood: 'SoHo · Greene St', price: '1,500 coins, once', earn: 'About 10 perfect pizza shifts', art: 'loft.jpg', perks: ['14-ft ceilings', 'Cobblestone views', 'Room for a LOT of furniture'], fine: 'Freight elevator operated by a man named Sal. Be nice to Sal.' },
      { kind: 'listing', name: 'Billionaires’ Row Penthouse', hood: '57th Street · 90-something floors up', price: '4,000 coins, once', earn: '25 perfect pizza shifts', art: 'penthouse.jpg', perks: ['Party terrace', 'Whole-park views', 'Your own DJ booth'], fine: 'Ears pop in the elevator. Neighbors are mostly in Monaco.' },
      END('No monthly rent. Anywhere.', 'Opens Nov 17 · Link in bio'),
    ],
  },
  // a money diary: real shop prices, shift pay under the server's caps (server/src/game/rules.ts), 50 starting coins
  {
    id: 'money-diary',
    title: 'A week in Club NYC on a pizza folder’s salary',
    type: 'carousel',
    slides: [
      { kind: 'cover', bg: '#2f9e55', title: 'Money diary: a week in Club NYC', kicker: 'On a pizza folder’s salary. Rent: 0. Swipe', art: 'game-slice.jpg' },
      { kind: 'diary', day: 'Monday', title: 'First shift', rows: [['Slice Factory, one good shift', '+138'], ['Soft pretzel on the Met steps', '−2'], ['Rent', '0']], note: 'Balance: 186', art: 'game-slice.jpg' },
      { kind: 'diary', day: 'Tuesday', title: 'The lunch rush', rows: [['Halal Rush, the lunch shift', '+104'], ['A halal plate, after', '−6'], ['Tipped the subway busker', '−1']], note: 'Balance: 283', art: 'halal-line.jpg' },
      { kind: 'diary', day: 'Wednesday', title: 'Self-care', rows: [['A rowboat on The Lake', '−3'], ['Hot cocoa at the boathouse', '−3'], ['Proposed to Bow Bridge', '0']], note: 'It said yes. Balance: 277', art: 'central-park.jpg', pos: '50% 20%' },
      { kind: 'diary', day: 'Thursday', title: 'Before 9 AM', rows: [['Bagel Counters, the early shift', '+196'], ['A Big Apple Beanie', '−10'], ['A coin in the fountain', '−1']], note: 'Balance: 462', art: 'show-bagels.jpg' },
      { kind: 'diary', day: 'Friday', title: 'Big night out', rows: [['Captained the ferry', '+150'], ['Danced at the Times Square Dance Jam', '+20'], ['Tacos at Chelsea Market', '−3']], note: 'Balance: 629', art: 'captain.jpg' },
      END('Saved 579 coins. The loft is 1,500.', 'Two more weeks · Link in bio'),
    ],
  },
  // ---------------------------------------------------------------- the image push, Nov 5 to 9 (no reels): every Club NYC
  // line is true in the game (rooms.ts, stamps.ts, homes.ts, economy.ts, server/src/game/rules.ts)
  {
    id: 'pick-job',
    title: 'Pick your first job',
    type: 'carousel',
    slides: [
      { kind: 'cover', bg: '#e2453c', title: 'Pick your first job', kicker: 'Five jobs. No interview. Zero rent. Swipe', art: 'hiring.jpg' },
      { kind: 'place', tag: 'Slice Factory', title: 'For the calm', body: 'Make pizzas before the oven wins. Up to 160 coins a shift.', art: 'game-slice.jpg' },
      { kind: 'place', tag: 'Halal Rush', title: 'For the fast', body: 'Run the lunch line. Up to 120 coins, plus the smell of white sauce.', art: 'halal-line.jpg' },
      { kind: 'place', tag: 'Bagel Counters', title: 'For the early', body: 'Deliver the orders. The best-paid shift in town: up to 220 coins.', art: 'show-bagels.jpg' },
      { kind: 'place', tag: 'Ferry Captain', title: 'For the brave', body: 'Steer to Liberty Island. Avoid kayaks. Up to 160 coins.', art: 'captain.jpg' },
      { kind: 'place', tag: 'Showtime', title: 'For the shameless', body: 'Dance on the subway for tips. Up to 60 coins and no dignity.', art: 'subway.jpg' },
      END('Which one are you?', 'Comment it · Opens Nov 17'),
    ],
  },
  {
    id: 'first-hour',
    title: 'Your first hour in Club NYC',
    type: 'carousel',
    slides: [
      { kind: 'cover', bg: '#3d72d9', title: 'Your first hour in Club NYC', kicker: 'Five steps. No broker. Swipe', art: 'high-line.jpg' },
      { kind: 'step', n: 1, title: 'Make your New Yorker', body: 'About 30 seconds. Pick a name and a colour.', art: 'face-3.png' },
      { kind: 'step', n: 2, title: 'Get a job', body: 'Five to pick from. They all pay in coins.', art: 'hiring.jpg' },
      { kind: 'step', n: 3, title: 'Move into your walk-up', body: 'Free from day one. The stairs come with it.', art: 'apartment.jpg' },
      { kind: 'step', n: 4, title: 'Dance in Times Square', body: 'A Dance Jam every 8 minutes. It pays.', art: 'ts-left.jpg' },
      { kind: 'step', n: 5, title: 'Send your link', body: 'Your friends land right next to you. No excuses.', art: 'central-park.jpg' },
      END('Same crew. Bigger city.', 'Opens Nov 17 · Link in bio'),
    ],
  },
  {
    id: 'subway-rules',
    title: 'How to ride the subway',
    type: 'carousel',
    slides: [
      { kind: 'cover', bg: '#2f9e55', title: 'How to ride the subway', kicker: 'Five rules nobody tells you. Swipe', art: 'subway.jpg' },
      { kind: 'step', n: 1, title: 'Have your fare ready', body: 'The turnstile is not the place to find your wallet.', art: 'subway.jpg' },
      { kind: 'step', n: 2, title: 'Let people off first', body: 'The doors stay open. Your dignity might not.', art: 'grand-central.jpg' },
      { kind: 'step', n: 3, title: 'Move to the middle', body: 'There is room. There is always room.', art: 'ts-left.jpg' },
      { kind: 'step', n: 4, title: 'Bag off the seat', body: 'Your tote did not pay a fare.', art: 'cat-mayor.jpg' },
      { kind: 'step', n: 5, title: 'Don’t stop on stairs', body: 'Step to the side. Check your phone there.', art: 'high-line.jpg' },
      END('Which rule did we miss?', 'Comment it · Link in bio'),
    ],
  },
  {
    id: 'speak-2',
    title: 'How to speak New Yorker, part 2',
    type: 'carousel',
    slides: [
      { kind: 'cover', bg: '#ffc634', title: 'How to speak New Yorker, part 2', kicker: 'Five more words for your first week. Swipe', art: 'the-met.jpg' },
      { kind: 'word', word: 'Schlep', type: 'verb', def: 'To carry something heavy, far, usually up five flights.', example: 'It’s a schlep, but I love it.', art: 'high-line.jpg' },
      { kind: 'word', word: 'BEC', type: 'noun', def: 'Bacon, egg and cheese on a roll. Breakfast, and a love language.', example: 'BEC, salt, pepper, ketchup.', art: 'cat-mayor.jpg' },
      { kind: 'word', word: 'Regular', type: 'adjective', def: 'Coffee with milk and sugar. Nobody else on Earth means this.', example: 'Small coffee, regular.', art: 'ts-left.jpg' },
      { kind: 'word', word: 'On line', type: 'phrase', def: 'Where New Yorkers wait. Never “in line.”', example: 'I’ve been on line since 6.', art: 'halal-line.jpg' },
      { kind: 'word', word: 'Walk-up', type: 'noun', def: 'A building with stairs where the elevator would be. Rent includes cardio.', example: 'It’s a fifth-floor walk-up.', art: 'apartment.jpg' },
      END('Now say it in the city', 'Opens Nov 17 · Link in bio'),
    ],
  },
  {
    id: 'best-views',
    title: 'Best views in Club NYC',
    type: 'carousel',
    slides: [
      { kind: 'cover', bg: '#2d3352', title: 'The best views in Club NYC, ranked', kicker: 'Argue with us in the comments. Swipe', art: 'sky-deck.jpg' },
      { kind: 'place', tag: 'No. 5 · Battery Park', title: 'The harbor', body: 'Lady Liberty, the ferry and a bench. Free, and it never closes.', art: 'battery-park.jpg' },
      { kind: 'place', tag: 'No. 4 · Brooklyn Bridge', title: 'The promenade', body: 'The whole skyline behind you. Brooklyn is “coming soon.”', art: 'bb-crop.jpg' },
      { kind: 'place', tag: 'No. 3 · Billionaires’ Row', title: 'The penthouse', body: 'Whole-park views for 4,000 coins, once. Neighbors mostly in Monaco.', art: 'penthouse.jpg' },
      { kind: 'place', tag: 'No. 2 · Empire State', title: 'The 86th floor', body: 'Wave at the blimp. It has never waved back.', art: 'empire-deck.jpg' },
      { kind: 'place', tag: 'No. 1 · Sky Deck 102', title: 'The glass floor', body: 'Jump on it, 102 floors up. It holds. Then get a cocoa.', art: 'sky-deck.jpg' },
      END('Which one is your No. 1?', 'Comment it · Opens Nov 17'),
    ],
  },
  {
    id: 'city-news-2',
    title: 'This week in the city, part 2',
    type: 'carousel',
    slides: [
      { kind: 'cover', bg: '#8c93a6', title: 'More news from the city', kicker: 'The Club NYC Times, late edition. Swipe', art: 'cityhall.jpg' },
      { kind: 'news', headline: 'Pigeon Named Leader of the Times Square Flock; Promises More Crumbs', deck: 'Opposition remains on the ledge.', art: 'ts-left.jpg' },
      { kind: 'news', headline: 'Ferry Captain Dodges 14 Kayaks, a Jet Ski and One Very Confident Seagull', deck: 'The seagull did not move.', art: 'captain.jpg' },
      { kind: 'news', headline: 'Chelsea Market Waterfall Collects Wishes, Pennies and One Retainer', deck: 'The owner has not come forward.', art: 'chelsea-market.jpg' },
      { kind: 'news', headline: 'Foam Liberty Crowns Outsell Real Crowns 1,000 to Nothing', deck: 'The real one is not for sale. We asked.', art: 'liberty-island-v2.jpg' },
      { kind: 'news', headline: 'Man Sits on the Met Steps for Six Hours, Calls It the Best Seat in the City', deck: 'He is correct.', art: 'the-met.jpg' },
      END('A new paper every day, in the game', 'Opens Nov 17 · Link in bio'),
    ],
  },
  {
    id: 'gc-secrets',
    title: 'Grand Central’s secrets',
    type: 'carousel',
    slides: [
      { kind: 'cover', bg: '#2d3352', title: 'Three secrets of Grand Central', kicker: 'All true. All in the game. Swipe', art: 'grand-central.jpg' },
      { kind: 'place', tag: 'Look up', title: 'The sky is backwards', body: 'The constellations are painted as if seen from outside the sky. Official story: a god’s-eye view.', art: 'gc-ceiling.jpg' },
      { kind: 'place', tag: 'The clock', title: 'It’s made of opal', body: 'All four faces, valued at 10 to 20 million dollars. New York meets under it anyway.', art: 'gc-clock.jpg' },
      { kind: 'place', tag: 'Downstairs', title: 'The walls whisper', body: 'Stand in one corner of the Whispering Gallery. A friend in the far corner hears you.', art: 'gc-whisper.jpg' },
      END('Now go find them', 'Opens Nov 17 · Link in bio'),
    ],
  },
  {
    id: 'free-real',
    title: 'Free things in real New York',
    type: 'carousel',
    slides: [
      { kind: 'cover', bg: '#36b5a6', title: 'Five free things in real New York', kicker: 'Save it for your trip. We built them all too. Swipe', art: 'high-line.jpg' },
      { kind: 'place', tag: '1 · The Staten Island Ferry', title: 'A free harbor cruise', body: 'Free since 1997, with the Statue on the way. In our city, you can captain it.', art: 'captain.jpg' },
      { kind: 'place', tag: '2 · Brooklyn Bridge', title: 'Walk across', body: 'Free, with the best skyline in town. Stay out of the bike lane.', art: 'bb-crop.jpg' },
      { kind: 'place', tag: '3 · The High Line', title: 'A park in the air', body: 'A free walk on an old elevated railway, high above Chelsea.', art: 'high-line.jpg' },
      { kind: 'place', tag: '4 · Grand Central', title: 'Look up', body: 'Walking in is free. The backwards sky on the ceiling is, too.', art: 'grand-central.jpg' },
      { kind: 'place', tag: '5 · Central Park', title: 'Get a little lost', body: '843 acres, and Bow Bridge is free to stand on. Propose to it in our version.', art: 'central-park.jpg' },
      END('Can’t get to New York?', 'Ours opens Nov 17 · Link in bio'),
    ],
  },
  {
    id: 'stamps',
    title: 'Stamps you have to go find',
    type: 'carousel',
    slides: [
      { kind: 'cover', bg: '#8a5cd6', title: 'Stamps you have to go find', kicker: 'Every 5 stamps pays 25 coins. Swipe', art: 'the-met.jpg' },
      { kind: 'place', tag: 'Stamp · Pssst…', title: 'Find the secret', body: 'It’s in the Whispering Gallery at Grand Central. That’s all we’ll say.', art: 'gc-whisper.jpg' },
      { kind: 'place', tag: 'Stamp · Legend Spotted', title: 'See Pizza Rat', body: 'With your own eyes. Do not make eye contact.', art: 'pizzarat.jpg' },
      { kind: 'place', tag: 'Stamp · Crown Jewel', title: 'Climb 354 steps', body: 'All the way up to Lady Liberty’s crown. There is no elevator for this one.', art: 'liberty-island-v2.jpg' },
      { kind: 'place', tag: 'Stamp · Meet Me on the Steps', title: 'Sit down', body: 'On the steps of the Met. The easiest stamp in the city.', art: 'the-met.jpg' },
      { kind: 'place', tag: 'Stamp · Clip-Clop', title: 'Take a carriage', body: 'A ride through Central Park. Hold on to your hat.', art: 'central-park.jpg' },
      END('Which one first?', 'Comment it · Opens Nov 17'),
    ],
  },
  { id: 'meme-cozy', title: 'Cozy', type: 'single', slides: [{ kind: 'caption', lines: ['The listing: “Cozy studio.”', 'Me, reaching the fridge from bed:'], art: 'apartment.jpg', pos: '70% 55%' }] },
  { id: 'quote-train', title: 'The train is right there', type: 'single', slides: [{ kind: 'quote', line: 'The train is right there.', who: 'Every New Yorker, already running', art: 'subway-right.jpg' }] },
  { id: 'pick-carb', title: 'Slice or bagel', type: 'single', slides: [{ kind: 'versus', title: 'You can only keep one', left: ['The slice', 'pizzarat.jpg', '#e2453c'], right: ['The bagel', 'show-bagels.jpg', '#ffc634'], note: 'Comment your pick. We will judge you.' }] },
  { id: 'pick-home', title: 'Loft or penthouse', type: 'single', slides: [{ kind: 'versus', title: 'Where are you moving?', left: ['The loft', 'loft.jpg', '#3d72d9'], right: ['The penthouse', 'penthouse.jpg', '#8a5cd6'], note: 'No monthly rent on either. One has a man named Sal.' }] },
  { id: 'meme-40x', title: 'The 40x rule', type: 'single', slides: [{ kind: 'caption', lines: ['Landlords in New York: “You need to earn 40 times the rent.”', 'Landlords in Club NYC: “It’s free. The stairs are the gym.”'], art: 'apartment.jpg', pos: '50% 55%' }] },
  { id: 'meme-pizza-principle', title: 'The Pizza Principle', type: 'single', slides: [{ kind: 'caption', lines: ['The Pizza Principle: a slice costs what the subway costs.', 'Now: the slice is $3.81. The subway is $3.', 'Club NYC: they pay you to fold them.'], art: 'game-slice.jpg' }] },
]
