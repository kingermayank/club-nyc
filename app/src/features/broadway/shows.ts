/**
 * Tonight at the Broadway Theater: the three parody musicals, each a short live number performed by a cast of
 * New Yorkers (our own avatars) in front of a painted set, with an original song and surtitles.
 *
 * Every song has the same shape (18 bars): overture 0–1, entrance 2, verse 3–6, chorus 7–10, the show's big
 * moment 11–12, the finale 13–16, the button 17. Lyrics are pinned to bars. The cast's looks use real wardrobe
 * items, so the costumes match what players can wear.
 */
import type { Look } from '../../avatar/look'
import type { Song } from './music'

export type ShowId = 'phantom' | 'pizza-king' | 'bagels'

export interface CastMember {
  /** stage name, for the curtain call */
  name: string
  part: string
  role: 'lead' | 'second' | 'chorus'
  look: Look
}

export interface ShowDef {
  id: ShowId
  title: string
  tagline: string
  /** the poster (lobby, ticket) */
  poster: string
  /** the painted set behind the cast */
  set: string
  /** light colours: beams, the wash over the set */
  beam: string
  wash: string
  song: Song
  lyrics: [bar: number, text: string][]
  cast: CastMember[]
  /** what happens in bars 11–12 */
  moment: 'train' | 'rock' | 'kickline'
}

const L = (skin: number, hair: Look['hair'], hairColor: number, items: Look['items'], color = 5): Look => ({ skin, hair, hairColor, color, items })

export const SHOWS: ShowDef[] = [
  {
    id: 'phantom',
    title: 'Phantom of the Subway',
    tagline: 'The music of the night shift.',
    poster: '/art/shows/phantom.jpg',
    set: '/art/shows/set-phantom.jpg',
    beam: 'rgba(196, 150, 255, 0.5)',
    wash: 'rgba(120, 70, 200, 0.25)',
    moment: 'train',
    song: {
      bpm: 104,
      style: 'organ',
      chords: 'Am E7 Am Am F Dm E7 Am G F E7 Dm E7 F G Am E7 Am',
      melody:
        'A4:2 E5:2 A5:3 G5:1 | G#5:2 F5:2 E5:4 | E4:2 A4:2 C5:2 E5:2 | A4:2 C5:2 E5:3 D5:1 | C5:2 A4:2 F4:4 | D5:2 F5:2 A5:3 G5:1 | F5:2 E5:2 D5:2 B4:2 | ' +
        'E5:3 A5:1 A5:2 G5:2 | G5:2 F5:2 E5:2 D5:2 | C5:2 D5:2 E5:2 F5:2 | E5:6 G#4:2 | F5:3 E5:1 D5:4 | E5:3 D5:1 B4:4 | ' +
        'A4:2 C5:2 F5:3 E5:1 | D5:2 B4:2 G5:4 | A5:3 G5:1 E5:2 C5:2 | B4:2 D5:2 G#5:4 | A5:8',
    },
    lyrics: [
      [3, 'Down where the rats run and the third rail hums,\nI play the old organ with my MetroCard thumbs.'],
      [5, '“Who’s in the tunnel, so mysterious and tall?”\n“Just a man who knows when the express will stall.”'],
      [7, 'Phantom! Phantom! Phantom of the Subway!\nHe’ll get you uptown, but he’ll take the long way!'],
      [9, 'He’ll hold the doors, he’ll find you a seat,\nhe’ll stand way too close, but his cape smells sweet.'],
      [11, 'Stand clear of the closing doors, please.'],
      [13, 'Swipe once, swipe twice, let the turnstile decide,\nthe Phantom of the Subway will hold the doors for your ride!'],
      [15, 'Sing with the Phantom, it’s the music of the night shift:\none fare, two hearts, and the trains running right… -ish!'],
    ],
    cast: [
      { name: 'Gus Delgado', part: 'the Phantom', role: 'lead', look: L(1, 'short', 0, { body: 'suit', neck: 'vampire-cape', head: 'top-hat', legs: 'black-jeans', feet: 'loafers', hand: 'metrocard' }) },
      { name: 'Rosa Santiago', part: 'Christine, a commuter', role: 'second', look: L(3, 'long', 1, { body: 'floral-dress', neck: 'pearls', feet: 'loafers', hand: 'flowers' }) },
      { name: 'Dev Patel-Okafor', part: 'Man With Newspaper', role: 'chorus', look: L(4, 'fade', 0, { body: 'trench', legs: 'khakis', feet: 'loafers', hand: 'newspaper', head: 'bucket-hat' }) },
      { name: 'Mia Chen', part: 'Woman With Coffee', role: 'chorus', look: L(0, 'bob', 0, { body: 'camel-coat', legs: 'black-jeans', feet: 'boots', hand: 'coffee', face: 'round-glasses' }) },
      { name: 'Tony Russo', part: 'Guy Who Missed the Train', role: 'chorus', look: L(2, 'curly', 2, { body: 'puffer', legs: 'jeans', feet: 'sneakers', head: 'nyc-beanie', neck: 'scarf' }) },
      { name: 'Keisha Brown', part: 'Very Tired Commuter', role: 'chorus', look: L(5, 'puffs', 0, { body: 'denim-jacket', legs: 'black-jeans', feet: 'hightops', head: 'headphones' }) },
    ],
  },
  {
    id: 'pizza-king',
    title: 'The Pizza King',
    tagline: 'The circle of slice.',
    poster: '/art/shows/pizza-king.jpg',
    set: '/art/shows/set-pizza-king.jpg',
    beam: 'rgba(255, 214, 120, 0.5)',
    wash: 'rgba(255, 150, 40, 0.22)',
    moment: 'rock',
    song: {
      bpm: 112,
      style: 'safari',
      chords: 'C G C C Am F G C G Am F Dm G F G C/Am F/G C',
      melody:
        'C5:6 G4:2 | B4:2 D5:2 G5:4 | E5:2 G5:2 E5:2 C5:2 | C5:2 C5:1 D5:1 E5:2 G5:2 | A5:2 G5:2 E5:4 | F5:2 F5:1 E5:1 D5:2 C5:2 | D5:4 B4:2 G4:2 | ' +
        'G5:3 G5:1 A5:2 G5:2 | D5:4 G5:4 | E5:2 A5:2 G5:2 E5:2 | F5:4 A5:4 | D5:2 F5:2 A5:2 D6:2 | B5:4 D6:4 | ' +
        'C6:3 A5:1 F5:2 A5:2 | B5:2 G5:2 D5:4 | E5:2 G5:2 A5:2 C6:2 | A5:2 F5:2 G5:2 B5:2 | C6:8',
    },
    lyrics: [
      [3, 'From the first ball of dough to eight hundred degrees,\nfrom the sauce to the cheese, he rules all he sees.'],
      [5, 'I’m the King of the oven, the Prince of the fold,\nmy kingdom costs ninety-nine cents, I am told!'],
      [7, 'It’s the circle of slice! Pepperoni twice!\nNever use a fork, that’s the only advice!'],
      [9, 'From the Bronx to the Battery, hear the whole city cry:\n“Is it ready? It’s ready! Now give me a pie!”'],
      [11, 'Behold! A whole pie!'],
      [13, 'Fold it with pride, let the grease be your guide,\nthe Pizza King’s oven is open all night!'],
      [15, 'It’s the circle, the circle, the circle of slice,\none dollar, no change, and it’s worth twice the price!'],
    ],
    cast: [
      { name: 'Sal Marino Jr.', part: 'the Pizza King', role: 'lead', look: L(2, 'short', 1, { head: 'foam-crown', body: 'chef-coat', neck: 'vampire-cape', legs: 'khakis', feet: 'loafers', hand: 'pizza-slice' }) },
      { name: 'Ana Flores', part: 'Pepperoni', role: 'chorus', look: L(3, 'ponytail', 1, { head: 'chef-hat', body: 'pizza-tee', legs: 'black-jeans', feet: 'hightops', hand: 'pizza-slice' }) },
      { name: 'Jamal Wright', part: 'Mushroom', role: 'chorus', look: L(5, 'afro', 0, { head: 'chef-hat', body: 'chef-coat', legs: 'tutu', feet: 'sneakers' }) },
      { name: 'Lily Park', part: 'Extra Cheese', role: 'chorus', look: L(0, 'bun', 3, { head: 'chef-hat', body: 'pizza-tee', legs: 'black-jeans', feet: 'hightops', hand: 'pizza-slice' }) },
      { name: 'Marco Bianchi', part: 'Garlic Knot', role: 'chorus', look: L(1, 'curly', 1, { head: 'chef-hat', body: 'chef-coat', legs: 'tutu', feet: 'sneakers', face: 'round-glasses' }) },
      { name: 'Nia Adeyemi', part: 'Red Pepper Flakes', role: 'chorus', look: L(6, 'braids', 0, { head: 'chef-hat', body: 'pizza-tee', legs: 'black-jeans', feet: 'hightops' }) },
    ],
  },
  {
    id: 'bagels',
    title: 'Bagels!',
    tagline: 'Everything, with a schmear.',
    poster: '/art/shows/bagels.jpg',
    set: '/art/shows/set-bagels.jpg',
    beam: 'rgba(255, 150, 220, 0.5)',
    wash: 'rgba(255, 90, 200, 0.2)',
    moment: 'kickline',
    song: {
      bpm: 132,
      style: 'swing',
      swing: 0.3,
      chords: 'F C7 F F D7 Gm7 C7 F Bb F C7 Bb C7 F D7 Gm7/C7 F F6',
      melody:
        'C5:2 F5:2 A5:2 C6:2 | Bb5:2 G5:2 E5:4 | F5:4 r:4 | A4:2 C5:2 D5:2 F5:2 | F#5:3 E5:1 D5:4 | G4:2 Bb4:2 D5:2 F5:2 | E5:3 D5:1 C5:4 | ' +
        'C5:2 F5:2 r:1 F5:1 A5:2 | Bb5:2 A5:2 G5:2 F5:2 | C5:2 F5:2 r:1 F5:1 A5:2 | G5:3 F5:1 E5:4 | D5:1 D5:1 F5:2 D5:1 D5:1 F5:2 | E5:1 E5:1 G5:2 Bb5:4 | ' +
        'A5:2 F5:2 C6:4 | A5:2 F#5:2 D5:4 | Bb5:2 G5:2 E5:2 C5:2 | F5:2 A5:2 C6:4 | F5:8',
    },
    lyrics: [
      [3, 'Round in the morning and round in the night,\na hole in the middle that’s cut just right.'],
      [5, 'Boiled in a kettle, then baked till it’s brown,\nthe best thing with a hole in this whole hungry town!'],
      [7, 'Bagels! Bagels! Boiled, then baked!\nBagels! Bagels! Toasting’s a mistake!'],
      [9, 'Lox on the left and a schmear on the right,\nwe’ll stand in this line until Saturday night!'],
      [11, 'Poppy, sesame, onion and salt:\nif you don’t like everything, that’s your fault!'],
      [13, 'Everything, with a schmear! Everything, with a schmear!\nThe best bagel in town is the one that is here!'],
      [15, 'So take a big bite and then take a bow,\nthe line’s out the door, and it’s out the door now!'],
    ],
    cast: [
      { name: 'Bernadette Klein', part: 'the Everything Bagel', role: 'lead', look: L(1, 'long', 3, { head: 'top-hat', body: 'sequin-jacket', neck: 'bowtie', legs: 'black-jeans', feet: 'loafers', hand: 'bagel' }) },
      { name: 'Luis Ortega', part: 'Poppy', role: 'chorus', look: L(4, 'short', 0, { head: 'top-hat', body: 'sequin-jacket', neck: 'bowtie', legs: 'black-jeans', feet: 'loafers' }) },
      { name: 'Hannah Goldberg', part: 'Sesame', role: 'chorus', look: L(0, 'curly', 1, { head: 'top-hat', body: 'sequin-jacket', neck: 'bowtie', legs: 'black-jeans', feet: 'loafers', face: 'gold-shades' }) },
      { name: 'Andre Thomas', part: 'Pumpernickel', role: 'chorus', look: L(5, 'fade', 0, { head: 'top-hat', body: 'sequin-jacket', neck: 'bowtie', legs: 'black-jeans', feet: 'loafers' }) },
      { name: 'Priya Shah', part: 'Onion', role: 'chorus', look: L(6, 'ponytail', 0, { head: 'top-hat', body: 'sequin-jacket', neck: 'bowtie', legs: 'black-jeans', feet: 'loafers' }) },
      { name: 'Kenji Mori', part: 'Salt', role: 'chorus', look: L(2, 'spiky', 0, { head: 'top-hat', body: 'sequin-jacket', neck: 'bowtie', legs: 'black-jeans', feet: 'loafers', face: 'round-glasses' }) },
      { name: 'Grace O’Brien', part: 'Plain (Understudy)', role: 'chorus', look: L(0, 'bob', 4, { head: 'top-hat', body: 'sequin-jacket', neck: 'bowtie', legs: 'black-jeans', feet: 'loafers' }) },
    ],
  },
]

export const SHOW: Record<ShowId, ShowDef> = Object.fromEntries(SHOWS.map((s) => [s.id, s])) as Record<ShowId, ShowDef>
