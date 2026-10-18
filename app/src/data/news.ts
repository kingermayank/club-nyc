/** Club NYC Times — edition content. Images live in /art/news/. */
export interface Story {
  kicker: string
  headline: string
  deck?: string
  body: string[]
  img?: string
  caption?: string
}

export const EDITION = {
  volume: 'Vol. I',
  number: 'No. 43',
  date: 'Wednesday, October 14, 2026',
  price: '25¢',
  weather: 'Partly pigeony. High 62°F, low 51°F. Chance of steam from manholes: 100%.',
}

/** Page one. The city still isn't over it. */
export const FRONT: Story = {
  kicker: 'CHAMPIONS',
  headline: 'THE KNICKS WIN IT ALL',
  deck: 'First title since 1973. Brunson drops 45 in Game 5, the Garden loses its mind, and the city may never be quiet again.',
  img: '/art/news/knicks.jpg',
  caption: 'Ticker tape over Broadway: the Knicks’ first-ever championship parade, June 18, 2026.',
  body: [
    'NEW YORK: It finally happened. The Knicks beat the San Antonio Spurs 94–90 in Game 5 on June 13, 2026, taking the Finals four games to one and bringing a championship back to Madison Square Garden for the first time since 1973.',
    'Jalen Brunson scored 45 in the clincher (including 13 straight for New York in the fourth quarter) and was named Finals MVP. Two nights earlier, in Game 4, the Knicks erased a 29-point third-quarter hole and won on an OG Anunoby tip-in with 1.2 seconds left.',
    'Five days later the team rode up the Canyon of Heroes in the franchise’s first-ever ticker-tape parade. Fans filled the viewing pens along Broadway hours before it began, and Mayor Zohran Mamdani handed the team the keys to the city at City Hall.',
    'Four months on, bodega owners report record sales of anything orange and blue. A Times Square pigeon has been spotted wearing a tiny crown. Nobody has asked it to take it off.',
  ],
}

/** "NYC Moments" — the stories New Yorkers still bring up at brunch. */
export const MOMENTS: (Story & { when: string })[] = [
  {
    when: 'January 1, 2026',
    kicker: 'CITY HALL',
    headline: 'Mayor Mamdani Sworn In Underground',
    deck: 'The new mayor took the oath just after midnight on New Year’s Day, in the old City Hall subway station.',
    img: '/art/news/cityhall.jpg',
    caption: 'The 1904 City Hall station: tile vaults, skylights, and no regular trains since 1945.',
    body: [
      'Zohran Mamdani won the November 2025 election and became mayor of New York City on January 1, 2026: the first Muslim and the first South Asian mayor in the city’s history, and at 34, its youngest in a century.',
      'He took the oath just after midnight in the decommissioned City Hall station beneath City Hall, one of the most beautiful (and least visited) stops in the system, then rode back for a public ceremony later that day. Subway buffs: still not over it.',
    ],
  },
  {
    when: 'August 26, 2025',
    kicker: 'ROMANCE',
    headline: 'Swift & Kelce Are Engaged, and the Ring Is Pure New York',
    deck: 'The pop star and the tight end announced it with a joint Instagram post. The internet briefly stopped working.',
    img: '/art/news/engaged.jpg',
    caption: 'Artist’s impression. Our photographer was not invited to the garden.',
    body: [
      'Taylor Swift and Travis Kelce announced their engagement on August 26, 2025, sharing photos of a garden proposal and one very large diamond.',
      'The New York angle: Swift’s publicist confirmed the old-mine-cut ring was made by New York jewelry designer Kindred Lubeck. Friendship-bracelet sales in the five boroughs: up. Cornelia Street: emotionally ready.',
    ],
  },
  {
    when: 'September 21, 2015',
    kicker: 'TRANSIT',
    headline: 'Pizza Rat: A Legend Turns 11',
    deck: 'One rat. One slice. One flight of stairs at First Avenue.',
    img: '/art/news/pizzarat.jpg',
    caption: 'Re-enactment. The original rat has never granted an interview.',
    body: [
      'It was a Monday in September 2015 when comedian Matt Little posted a short video from the First Avenue L station: a rat dragging an entire slice of pizza down the subway stairs. Within days, #PizzaRat was the most New York thing on the internet.',
      'A sequel rat was filmed at Union Square that October, but purists recognize only the original. Club NYC commuters still report sightings near Times Sq–42 St. Look closely.',
    ],
  },
]

export const STORIES: Story[] = [
  {
    kicker: 'TONIGHT',
    headline: 'Dance Jam on the Times Square Stage',
    body: [
      'The DJ booth in Duffy Square fires up several times an hour. Get in front of the stage and dance when the lights come on. The crowd tips, and the billboards dance along.',
    ],
  },
  {
    kicker: 'FIFTH AVENUE',
    headline: 'Snacks Fifth Avenue Unveils Its Holiday Windows (in October, as Tradition Demands)',
    body: [
      'This year’s theme: a gold-leaf pretzel the size of a taxi. Tourists stopped dead on the sidewalk within seconds. New Yorkers walked around them, as is also tradition.',
    ],
  },
  {
    kicker: 'STYLE',
    headline: 'Louis Vuittown Line Now Has Its Own Line',
    body: ['Shoppers outside the stacked-trunk flagship on 57th report a waitlist for the waitlist. “Is it real or Canal Street?” asked one man, to no one.'],
  },
  {
    kicker: 'SOHO',
    headline: 'Starducks Barista Spells a Name Right; Investigation Underway',
    body: ['The Pumpkin Spice Duckaccino is back, and so are the creative spellings. One customer named Kate received a cup reading “KHAITE.” She has framed it.'],
  },
  {
    kicker: 'STYLE',
    headline: 'NYKE Drop Wraps Around the Block',
    img: '/art/news/sneaker-line.jpg',
    body: ['The NYKE Air Bodega sold out in SoHo in nine minutes. One fan camped out since Tuesday: “Just Do NY. Mostly I just did the sidewalk.”'],
  },
  {
    kicker: 'NOW HIRING',
    headline: 'Papi’s Deli & Grocery Needs a Bodega Boss',
    img: '/art/news/cat-mayor.jpg',
    body: ['Chopped cheese, BEC on a roll, salt pepper ketchup: the East Village bodega under your apartment is slammed. Mango the cat, the store’s actual manager, has declined to help.'],
  },
  {
    kicker: 'FOOD',
    headline: 'Halal Bros Sets Lunch-Rush Record',
    img: '/art/news/halal-line.jpg',
    body: ['The Fifth Avenue cart served 300 platters in an hour. “Extra white sauce” remains the most requested phrase in Midtown.'],
  },
  {
    kicker: 'HARBOR',
    headline: 'Wanted: Ferry Captains',
    img: '/art/news/captain.jpg',
    body: ['The Battery Park ferry needs a steady hand to dodge tugboats, kayaks and the occasional rogue jet ski on the way to Liberty Island.'],
  },
]

export const ADVICE = {
  title: 'Ask the Bodega Cat',
  letters: [
    {
      q: 'Dear Bodega Cat, how do I make money in this city? Signed, Broke in Brooklyn',
      a: 'Work, kid. The pizzeria, the halal cart, the coffee shop, the ferry and the subway (Showtime!) all pay coins. Coins fall on sidewalks, crowds tip flash mobs, every 5 stamps pays a bonus, and beating a friend’s challenge pays too. Spend it on clothes, furniture and snacks. I would, but I don’t have pockets.',
    },
    {
      q: 'Dear Bodega Cat, my apartment is empty and sad. Signed, Bare in SoHo',
      a: 'Tap the little brownstone on your toolbar. Once you’re home, hit Decorate, and check StreetCheesy for a bigger place: there’s a penthouse on Billionaires’ Row with a terrace made for parties. A bean bag changes lives either way.',
    },
    {
      q: 'Dear Bodega Cat, is it ever OK to eat pizza with a fork? Signed, Curious in Chelsea',
      a: 'No.',
    },
  ],
}

export const SECRETS = [
  'Press D to dance in Times Square. If enough New Yorkers join, the billboards join too, and the crowd tips.',
  'Click any New Yorker → “Visit their place” to see their apartment. Sign the guestbook!',
  'Turn on Open House in your apartment and friends will drop by while you’re home.',
  'Stand under the arches by the Whispering Gallery in Grand Central and say something. The walls talk back.',
  'Grand Central’s famous ceiling hides a mistake. Click it to find out.',
  'The Met steps are the best seat in the city. Sit and watch.',
  'At Starducks, order anything and check what the barista wrote on your cup.',
  'Pet Mango, the cat at Papi’s Deli & Grocery. She runs the place.',
  'Host a party at home: pick the music and your friends get an invite.',
  'Wave at the TV studio window at Rockefeller Center. You might end up on air.',
  'Seagulls at Battery Park are not to be trusted with snacks.',
]

export const CLASSIFIEDS = [
  ['FOR RENT', '5th-floor walk-up. Cozy (tiny). Exposed brick, clanky radiator, view of water towers. No broker fee (thanks, FARE Act).'],
  ['FOR SALE', 'Billionaires’ Row penthouse, 57th St. Wraparound terrace, views of the whole park, built for parties. See StreetCheesy.'],
  ['LOST', 'One MetroCard, 2014 design, $0.25 balance. Sentimental value only.'],
  ['WANTED', 'Dancers for subway performances. Must be able to say “Showtime!” with feeling.'],
  ['FOR SALE', '“Designer” sunglasses. SoHo, corner of Greene St. Totally real. Ask for Vinny.'],
  ['SERVICES', 'Skyline portraits painted while you wait. Brooklyn Bridge promenade. Very cheap, very good.'],
]
