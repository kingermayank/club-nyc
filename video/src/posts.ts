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
      { kind: 'compare', title: 'A Broadway show', nyc: 'A ticket', club: 'Front row', art: 'broadway.jpg' },
      { kind: 'compare', title: 'Skating at the rink', nyc: 'A rink fee', club: 'Free skate', art: 'rink.jpg' },
      { kind: 'compare', title: 'The Staten Island Ferry', nyc: 'Free', club: 'Free', art: 'captain.jpg', note: 'New York got this one right.' },
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
  {
    id: 'city-news',
    title: 'This week in the city',
    type: 'carousel',
    slides: [
      { kind: 'cover', bg: '#fffdf6', title: 'This week in the city', kicker: 'The Club NYC paper, in five headlines', art: 'cityhall.jpg' },
      { kind: 'news', headline: 'Bodega cat elected mayor', deck: 'Promises more naps, fewer mice. Wins by a landslide.', art: 'cat-mayor.jpg' },
      { kind: 'news', headline: 'Pizza rat seen on the stairs again', deck: 'Witnesses say he took the whole slice. Nobody stopped him.', art: 'rat.jpg' },
      { kind: 'news', headline: 'Halal line now visible from the sky deck', deck: 'Regulars say the white sauce is worth the wait.', art: 'halal-line.jpg' },
      { kind: 'news', headline: 'Sneaker drop line reaches the next block', deck: 'Some have been waiting since Tuesday. Morale is high.', art: 'sneaker-line.jpg' },
      { kind: 'news', headline: 'Someone proposed in Central Park', deck: 'They said yes. The pigeons were very supportive.', art: 'engaged.jpg' },
      END('A new paper every week, in the game'),
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
]
