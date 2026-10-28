/**
 * The Club NYC Times: one complete paper for every New York day, the same paper for everyone.
 *
 * An edition is put together from the date alone (no server): the front page, NYC Moments (with "On This Day" when
 * something real happened on that date), Metro & Style, Sports, Opinion (Ask the Bodega Cat) and the Classifieds come
 * out of the pools below. Each pool is shuffled once, and edition N takes the next slice of it, so back-to-back papers
 * never repeat a story. Live city numbers (standings, this week's top scores, new places) are added on top by
 * features/newspaper.ts. Pictures live in /art/news, /art/rooms and /art/shows.
 *
 * Copy rules: deadpan, about a third jokes, grounded in real New York; parody names only; no em dashes.
 * Headlines are Title Case, everything else is sentences.
 */
import { rng, hash } from '../social/rng'
import { nycDay } from './economy'

export interface Story {
  kicker: string
  headline: string
  deck?: string
  body: string[]
  img?: string
  caption?: string
}
/** a story New Yorkers still bring up at brunch; `md` (MM-DD) makes it "On This Day" on that date */
export interface Moment extends Story {
  when: string
  md?: string
}
export interface Letter {
  q: string
  a: string
}
export interface Overheard {
  q: string
  where: string
}

export interface Edition {
  /** YYYY-MM-DD, New York time */
  day: string
  no: number
  volume: string
  /** "Tuesday, October 20, 2026" */
  date: string
  /** "Oct 20" */
  short: string
  /** the box in the masthead's right ear */
  ear: string
  weather: { short: string; long: string }
  lead: Story
  /** the short story in the front-page rail */
  rail: Story
  overheard: Overheard
  moments: Moment[]
  /** the first moment happened on this very date */
  onThisDay: boolean
  metro: Story[]
  sports: Story
  advice: Letter[]
  secrets: string[]
  classifieds: [string, string][]
}

/** Vol. I, No. 1. (The paper you remember from October 14, 2026 was No. 43, and still is.) */
export const FIRST_DAY = '2026-09-02'
export const PRICE = '25¢'

// ---------- dates (plain calendar math on YYYY-MM-DD, so daylight saving can't skip a day) ----------
const noon = (day: string) => Date.parse(`${day}T12:00:00Z`)
export const todayNyc = () => nycDay()
export const shiftDay = (day: string, n: number) => new Date(noon(day) + n * 86400_000).toISOString().slice(0, 10)
export const daysBetween = (a: string, b: string) => Math.round((noon(b) - noon(a)) / 86400_000)
export const editionNo = (day: string) => daysBetween(FIRST_DAY, day) + 1
const fmtDate = (day: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...o }).format(noon(day))
export const longDate = (day: string) => fmtDate(day, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
export const shortDate = (day: string) => fmtDate(day, { month: 'short', day: 'numeric' })
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

// ---------- the front page ----------
const LEADS: Story[] = [
  {
    kicker: 'TRANSIT',
    headline: 'Train Arrives Exactly When the Sign Said It Would',
    deck: 'Riders at Times Sq–42 St describe a calm, orderly boarding. Several are still shaken.',
    img: '/art/rooms/subway.jpg',
    caption: 'The platform, moments after the incident. Note the total lack of sprinting.',
    body: [
      'NEW YORK: The countdown clock at Times Sq–42 St said “Arriving,” and then, in a development transit historians are calling unprecedented, a train arrived.',
      '“I had my sprint all planned,” said one commuter, still holding a full coffee. “I didn’t even get to do the little hop over the gap.” A man who has ridden the line since 1994 asked whether this was a different train. It was not.',
      'Officials asked riders not to get used to it. The Club NYC Subway runs uptown and downtown all night from the map by the turnstiles. If the car is empty, the dancers will want a word.',
    ],
  },
  {
    kicker: 'REAL ESTATE',
    headline: 'Listing Calls Studio “Cozy”; Tenant Can Reach the Fridge From Bed',
    deck: 'Exposed brick, a clanky radiator and a view of a water tower. Also, technically, a view of the neighbor.',
    img: '/art/rooms/apartment.jpg',
    caption: 'A typical fifth-floor walk-up. The stairs are the gym.',
    body: [
      'NEW YORK: A new listing describes a fifth-floor walk-up as “cozy, efficient and full of character.” Translated from broker, that means you can cook, sleep and answer the door without standing up.',
      '“I love it,” said the tenant, who asked us not to print the rent because their mother reads this paper. “The radiator clanks all night. It’s like living with a drummer who knows one song.”',
      'Readers ready to move up can tap Listings at home to browse StreetCheesy: a cast-iron loft in SoHo and a Billionaires’ Row penthouse with a terrace built for parties are both on the market. The water tower view stays free.',
    ],
  },
  {
    kicker: 'TIMES SQUARE',
    headline: 'Pigeon Named Leader of the Times Square Flock; Promises More Crumbs',
    deck: 'The new leader ran on a platform of pretzel crumbs and won by a show of wings.',
    img: '/art/rooms/times-square-v2.jpg',
    caption: 'Flock headquarters. The red steps are for humans, the flock insists, mostly.',
    body: [
      'TIMES SQUARE: After a tense morning of cooing, the pigeons of Times Square have chosen a new leader: a gray, slightly limping bird known to locals as Gus. His first act in office was to stand in the middle of the sidewalk and refuse to move.',
      '“He gets it,” said Sal, whose hot dog cart has fed the flock for years, mostly by accident. “He understands the assignment.” Rivals from Duffy Square accused Gus of eating a competitor’s pretzel. He did not deny it.',
      'Visitors can meet the flock any time. Say hello to three of them and they may even let you in. Bring your own crumbs.',
    ],
  },
  {
    kicker: 'FOOD',
    headline: 'Adel’s Famous Halal Food Serves 300 Platters in an Hour; Line Reaches the Next Avenue',
    deck: 'Chicken over rice, lamb over rice, and one brave man who asked for “light sauce.” He has not been seen since.',
    img: '/art/news/halal-line.jpg',
    caption: 'Lunch on Fifth Avenue. Everyone said “extra white sauce.” Everyone.',
    body: [
      'FIFTH AVENUE: The Adel’s Famous Halal Food cart set a new lunch-rush record this week, serving 300 platters in a single hour while the line curled past two pretzel carts and a man selling umbrellas to people who did not need umbrellas.',
      '“Red sauce is a commitment,” warned the grill cook, who has seen grown adults weep. “White sauce is a lifestyle.”',
      'Adel’s is famous for its cart at Sixth Avenue and 49th Street, where the line runs well past midnight. This one is on Fifth Avenue at 57th, and the line seems to have followed it.',
      'The cart is hiring for the lunch rush, and the pay is real coins. Find it on Fifth Avenue and ask about Halal Rush. Every coin you earn there counts for your neighborhood this week.',
    ],
  },
  {
    kicker: 'TRANSIT',
    headline: 'Pizza Rat Spotted Again at Times Sq–42 St; Three Witnesses, Zero Photos',
    deck: 'The rat, the slice and the stairs were all described as “bigger in person.”',
    img: '/art/news/rat.jpg',
    caption: 'Sketch based on witness accounts. The slice was described as “a full slice, not a sad one.”',
    body: [
      'TIMES SQ–42 ST: A rat dragging an entire slice of pizza was spotted in the station this week, according to three commuters who all swear they saw it and none of whom had a phone out in time.',
      '“It looked me right in the eye,” said one witness. “Then it took the stairs. It didn’t even use the railing.” The legend began in 2015 on the stairs at First Avenue. The rat has never given an interview, and its lawyer says it never will.',
      'Readers who want to see for themselves should look closely around the station. Do not offer it a fork.',
    ],
  },
  {
    kicker: 'NOW HIRING',
    headline: 'Slice Factory Needs Pizza Makers; Oven Says It “Won’t Wait Forever”',
    deck: 'Sauce, cheese, toppings, oven. Repeat until the lunch rush gives up.',
    img: '/art/news/hiring.jpg',
    caption: 'The belt waits for no one. Neither does the oven.',
    body: [
      'LITTLE ITALY: Joe’s Pizza is hiring for its Slice Factory line, where a conveyor belt delivers fresh dough at a pace the owner calls “brisk” and new hires call “a lot.”',
      '“Read the ticket, sauce it, cheese it, top it, oven,” explained a veteran slicer, with flour in places flour should not be. “Don’t burn it. If you burn it, everybody knows.”',
      'Shifts pay coins, and the fastest slicers make the weekly leaderboard. Apply at the counter in Little Italy. Aprons provided. Forks, absolutely not.',
    ],
  },
  {
    kicker: 'HARBOR',
    headline: 'Ferry Captain Dodges 14 Kayaks, a Jet Ski and One Very Confident Seagull',
    deck: 'Passengers to Liberty Island called the crossing “smooth,” “exciting” and “why is that seagull so big.”',
    img: '/art/news/captain.jpg',
    caption: 'The view from the wheelhouse. The seagull is just out of frame, judging.',
    body: [
      'BATTERY PARK: A ferry captain on the Liberty Island run completed a perfect crossing this week, steering around 14 kayaks, one jet ski and a seagull that refused to yield the right of way.',
      '“The seagull had the light,” the captain admitted. “I respect that.” Passengers reported that the Statue of Liberty was “bigger than expected” and “greener than in pictures.” (She arrived copper-colored. The green took about 30 years.)',
      'The ferry is hiring captains at the Battery Park dock. Grab the coins floating in the harbor, mind the tugboats, and wave at the lady with the torch on your way in.',
    ],
  },
  {
    kicker: 'ON THE ICE',
    headline: 'Rockefeller Rink’s First Skater of the Day Falls With Real Style',
    deck: 'Judges awarded a 9.5 for the fall and a 10 for getting back up.',
    img: '/art/news/rink.jpg',
    caption: 'The rink under the golden statue. Graceful skaters not pictured. They were busy.',
    body: [
      'ROCKEFELLER CENTER: The first skater onto the ice this morning made it nearly four feet before sitting down hard in front of a tour group, which applauded.',
      '“That was on purpose,” the skater said, from the ice. Rentals are at the booth beside the rink, and the golden Prometheus above it, there since 1934, has seen worse.',
      'Wave at the TV studio window on your way out. You might end up on air.',
    ],
  },
  {
    kicker: 'STYLE',
    headline: 'Nike Drop Draws Line Around the Block; Line Develops Its Own Economy',
    deck: 'By hour three, people were trading folding chairs, phone chargers and theories.',
    img: '/art/news/sneaker-line.jpg',
    caption: 'Greene Street at dawn. Several of these people have been here since yesterday.',
    body: [
      'SOHO: The newest drop at Nike drew a line that wrapped around the block twice, past the street vendor, the bike rack and a man who was in line for something else entirely and decided to stay.',
      '“I don’t even know what size I am,” admitted one fan. “I just know I need them.” The store’s foot measurer says 9½, wide.',
      'The grails in the back vault are still not for sale. Not even for you.',
    ],
  },
  {
    kicker: 'BROADWAY',
    headline: '“Phantom of the Subway” Plays Its 1,000th Show; Chandelier Still Holding On',
    deck: 'The musical about a masked commuter and the music of the night shift hits a milestone.',
    img: '/art/shows/phantom.jpg',
    caption: 'The famous station scene. The train in the back has been “arriving” since opening night.',
    body: [
      'THEATER DISTRICT: The Broadway Theater celebrated the 1,000th performance of “Phantom of the Subway” with cake, a standing ovation and a brief delay on the downtown local, which the cast insists was part of the show.',
      'The cast performs live on stage, with spotlights, a full song and a bow, and ushers report that nobody has left before the chandelier number. The house rotates between three shows, so check the poster before you buy.',
      'Orchestra seats are 5 coins. First-timers get a free Playbill to carry around afterward, so everyone knows.',
    ],
  },
  {
    kicker: 'MIDTOWN',
    headline: 'Grand Central Clock Still Correct, Confirms Everyone Who Ever Met Anyone There',
    deck: 'The four-faced clock above the information booth has been the city’s favorite meeting spot for a century.',
    img: '/art/rooms/grand-central.jpg',
    caption: 'The Main Concourse. Somewhere in this picture, someone is saying “I’m by the clock.”',
    body: [
      'MIDTOWN: The clock above Grand Central’s information booth was checked this week and found to be, once again, correct. All four faces are made of opal, and experts have valued it at $10 to 20 million.',
      '“Meet me at the clock,” said a commuter to a friend standing right next to her. Overhead, the constellations on the ceiling are still painted backwards. The official explanation: it’s the view from outside the sky.',
      'Visitors can test the Whispering Gallery by the ramps. Say something into the arches and listen. The walls talk back.',
    ],
  },
  {
    kicker: 'UPTOWN',
    headline: 'Central Park Ducks Claim Rowboat; Parks Officials Decline to Get Involved',
    deck: 'The ducks have offered no comment beyond “quack,” which lawyers say is not a comment.',
    img: '/art/rooms/central-park.jpg',
    caption: 'The Lake, with Bow Bridge behind it. The rowboat is off to one side, occupied.',
    body: [
      'CENTRAL PARK: A rowboat on The Lake has been taken over by a group of mallards, who float in it all day and quack at anyone who comes near.',
      '“They’ve earned it,” said a carriage driver who has watched the situation develop for weeks. Nearby, Bow Bridge (cast iron, 1862) remains the most popular place in the city to propose, and the squirrels remain fearless.',
      'Hot cocoa is served at the Boathouse Café. The ducks would like you to know they are not sharing the boat.',
    ],
  },
  {
    kicker: 'MUSEUM MILE',
    headline: 'Man Sits on the Met Steps for Six Hours, Calls It the Best Seat in the City',
    deck: 'He saw a wedding party, three school trips, a juggler and one very lost tour bus.',
    img: '/art/rooms/the-met.jpg',
    caption: 'The steps of the Met on Fifth Avenue. Free seating, excellent views.',
    body: [
      'UPPER EAST SIDE: A man who sat down on the steps of the Met “for a second” one morning this week got back up six hours later, having watched what he described as “the whole city walk by.”',
      '“I had a pretzel. Then another pretzel. I made a wish in the fountain,” he said. “I never went inside. I’ll go inside next time.” The sign on the doors says the galleries are opening soon.',
      'The fountains out front take one coin per wish. Results not guaranteed.',
    ],
  },
  {
    kicker: 'SKYLINE',
    headline: 'Blimp Circles the Empire State Building; Visitors Wave, Blimp Does Not',
    deck: 'Guests on the 86th floor report the blimp “seemed to be following” them.',
    img: '/art/rooms/empire-deck.jpg',
    caption: 'The 86th-floor deck, 1,050 feet up. Your ears will pop.',
    body: [
      'MIDTOWN: Visitors to the Empire State Building’s 86th-floor observatory spent the afternoon watching a blimp drift past the spire, and the blimp, by most accounts, watched them back.',
      '“It’s following me,” said one tourist. “It is not,” said a guard. The mast on top was built so airships could dock there. It was tried once, in 1931, and it did not go well.',
      'The tower viewers on the deck are free. Look for the water towers, Central Park and, on a clear day, the blimp.',
    ],
  },
  {
    kicker: 'WEST SIDE',
    headline: 'High Line Walker Finishes the Whole Thing Without Stopping for a Photo',
    deck: 'Friends describe the achievement as “impressive” and “honestly a little worrying.”',
    img: '/art/rooms/high-line.jpg',
    caption: 'The High Line, a park built on an old freight railroad. Most people stop for the photo.',
    body: [
      'CHELSEA: A woman walked the High Line from end to end this week without once stopping to photograph the Hudson, a water tower or her own gelato, a feat park regulars believe has never been done.',
      '“I had somewhere to be,” she said, which only raised more questions. The park was built on an old freight rail line, and most visitors take about twice as long as they planned.',
      'The rolling loungers are first come, first served. The gelato cart says pistachio and strawberry are allowed together. We agree.',
    ],
  },
  {
    kicker: 'DOWNTOWN',
    headline: 'Soup Dumpling Claims Its First Tongue of the Day by 11:04 AM',
    deck: 'Experts remind the public: nibble, sip, then eat. In that order. Every time.',
    img: '/art/rooms/chinatown.jpg',
    caption: 'Mott Street at lunchtime. The lanterns stay up all year.',
    body: [
      'CHINATOWN: The day’s first soup-dumpling incident was reported at 11:04 AM, when a visitor bit into a fresh one whole and discovered, as everyone eventually does, that the soup is hot.',
      '“Nobody warned me,” he said, though several people had. Down the block, the boba line moved briskly, and the fruit stand sold a dragon fruit for one coin to a man who did not know what a dragon fruit was.',
      'Joe’s Shanghai, which made the soup dumpling famous in New York, teaches the method to anyone who asks: nibble, sip, then eat. Then walk over to Little Italy for a slice. Folded, never forked.',
    ],
  },
  {
    kicker: 'THE BRIDGE',
    headline: 'Brooklyn Bridge Walkers and Bikers Reach Peace Agreement; Nobody Believes It',
    deck: 'The treaty, a white line painted down the promenade, has been in effect for 11 minutes.',
    img: '/art/rooms/brooklyn-bridge-v2.jpg',
    caption: 'The promenade at golden hour. The line down the middle is the treaty.',
    body: [
      'BROOKLYN BRIDGE: Walkers and cyclists on the promenade have agreed, again, to stay on their own sides of the line, a historic peace that lasted until a tour group stopped to take a photo.',
      'The bridge opened in 1883, the first steel-wire suspension bridge. A year later P.T. Barnum marched 21 elephants across it to prove it was safe. The elephants stayed in their lane.',
      'A painter on the promenade sells skyline paintings for your apartment, 8 coins each. The Brooklyn side is still being built: Brooklyn (Coming Soon).',
    ],
  },
  {
    kicker: 'SOHO',
    headline: 'SoHo Sunglasses Declared “Totally Real” by the Man Selling Them',
    deck: 'The designer shades are ten coins. For you, five.',
    img: '/art/rooms/soho.jpg',
    caption: 'Greene Street’s cast-iron buildings. The vendor is just out of frame, being honest.',
    body: [
      'SOHO: A street vendor on Greene Street has confirmed that his designer sunglasses are “totally real,” “definitely real” and “the realest ones on the block,” in that order.',
      '“Ten coins,” he told a customer. “For you, five.” Asked whether the brand name was spelled correctly, he said “close enough,” which in SoHo counts as a warranty.',
      'The cobblestones are beautiful and the heels are a mistake. Ralph’s Coffee has coffee, and Supreme and Nike are there if you’re dressing to be seen.',
    ],
  },
  {
    kicker: 'FIFTH AVENUE',
    headline: 'Saks Fifth Avenue Shoe Floor Has Its Own Zip Code; Mail Carrier Asks for a Map',
    deck: '10022-SHOE is a real zip code. It is also, according to one shopper, a lifestyle.',
    img: '/art/rooms/toy-palace.jpg',
    caption: 'Saks Fifth Avenue. The shoes have their own floor, and the floor has its own zip code.',
    body: [
      'FIFTH AVENUE: The shoe floor at Saks Fifth Avenue is so big that the Postal Service gave it its own zip code in 2007: 10022-SHOE. Shoppers say it is the only zip code in Manhattan where nobody complains about the rent.',
      'Saks opened on Fifth Avenue in 1924, across from St. Patrick’s Cathedral. Every holiday season the whole facade lights up in a light show, and the sidewalk fills with people who came for one photo and stayed for twelve.',
      'Looking for the toy taxis, robots and balloons? They moved to I ♥ NY Souvenirs in Times Square.',
    ],
  },
  {
    kicker: 'BROADWAY',
    headline: 'Kick Line in “Bagels!” Sets a Record for Synchronized Schmear',
    deck: 'A row of top hats, one giant everything bagel and a staircase lit by hundreds of bulbs.',
    img: '/art/shows/bagels.jpg',
    caption: 'The finale of “Bagels!” at the Broadway Theater. Toasting is still not allowed.',
    body: [
      'THEATER DISTRICT: The cast of “Bagels!” set a record this week for the most perfectly synchronized kick line in Club NYC history, a number the ushers counted twice to be sure.',
      '“Everything, with a schmear,” the lead sang, and the audience sang it back. One critic called the show “dense, chewy and exactly what this city needed.” Another asked whether bagels should be toasted and was asked to leave.',
      'Orchestra seats are 5 coins. The theater rotates between three shows, so the one you see depends on the night.',
    ],
  },
]

/** Days with their own front page. */
const SPECIAL: Record<string, { ear: string; lead: Story }> = {
  [FIRST_DAY]: {
    ear: 'FIRST EDITION',
    lead: {
      kicker: 'FIRST EDITION',
      headline: 'Hello, New York: The Club NYC Times Rolls Off the Press',
      deck: 'A brand-new paper for a very old city. Twenty-five cents. Pigeons read free.',
      img: '/art/rooms/times-square-v2.jpg',
      caption: 'Times Square on the morning of our first edition. Nobody noticed. That’s New York.',
      body: [
        'NEW YORK: Welcome to the very first edition of the Club NYC Times, a daily paper for everyone who lives in, works in, or just wandered into this little Manhattan.',
        'Every day we’ll bring you the news that matters: who’s hiring, who’s dancing in Times Square, which rat has which slice, and whether the train is coming. (It is not. Then it is.)',
        'Read it on the stoop, on the subway or folded in one hand on the way to work, like a real New Yorker. Tomorrow there will be another one. That’s how newspapers work.',
      ],
    },
  },
  // the commemorative paper from the city's first weeks, kept as it was
  '2026-10-14': {
    ear: 'COMMEMORATIVE',
    lead: {
      kicker: 'CHAMPIONS',
      headline: 'The Knicks Win It All',
      deck: 'First title since 1973. Brunson drops 45 in Game 5, the Garden loses its mind, and the city may never be quiet again.',
      img: '/art/news/knicks.jpg',
      caption: 'Ticker tape over Broadway: the Knicks’ first-ever championship parade, June 18, 2026.',
      body: [
        'NEW YORK: It finally happened. The Knicks beat the San Antonio Spurs 94–90 in Game 5 on June 13, 2026, taking the Finals four games to one and bringing a championship back to Madison Square Garden for the first time since 1973.',
        'Jalen Brunson scored 45 in the clincher (including 13 straight for New York in the fourth quarter) and was named Finals MVP. Two nights earlier, in Game 4, the Knicks erased a 29-point third-quarter hole and won on an OG Anunoby tip-in with 1.2 seconds left.',
        'Five days later the team rode up the Canyon of Heroes in the franchise’s first-ever ticker-tape parade. Fans filled the viewing pens along Broadway hours before it began, and Mayor Zohran Mamdani handed the team the keys to the city at City Hall.',
        'Four months on, bodega owners report record sales of anything orange and blue. A Times Square pigeon has been spotted wearing a tiny crown. Nobody has asked it to take it off.',
      ],
    },
  },
}

// ---------- Metro & Style (and the front-page rail) ----------
const BRIEFS: Story[] = [
  {
    kicker: 'TONIGHT',
    headline: 'Dance Jam Fires Up in Times Square',
    body: ['A few times an hour the big screen lights up, a DJ takes the decks and the plaza fills. Dance on the floor in front of the stage (press D) and the crowd tips. Nobody is judging. Everybody is watching.'],
  },
  {
    kicker: 'FIFTH AVENUE',
    headline: 'Snacks Fifth Avenue Unveils Its Holiday Windows (in October, as Tradition Demands)',
    body: ['This year’s theme: a gold-leaf pretzel the size of a taxi. Tourists stopped dead on the sidewalk within seconds. New Yorkers walked around them, as is also tradition.'],
  },
  {
    kicker: 'STYLE',
    headline: 'Louis Vuitton’s Velvet Rope Now Has Its Own Velvet Rope',
    img: '/art/rooms/maison-malle.jpg',
    body: ['Shoppers outside the trunk-stacked boutique on Fifth Avenue report a waitlist for the waitlist. The upstairs salon remains by appointment only. The chandelier, staff confirm, costs more than your rent.'],
  },
  {
    kicker: 'COFFEE',
    headline: 'Ralph’s Coffee Barista Spells a Name Right; Investigation Underway',
    body: ['The green cups are as green as ever, and so are the creative spellings. One customer named Kate received a cup reading “KHAITE.” She has framed it.'],
  },
  {
    kicker: 'NOW HIRING',
    headline: 'Ralph’s Coffee Needs Delivery Help; Pigeons Need Nothing, Take Everything',
    img: '/art/rooms/coffee.jpg',
    body: ['The SoHo coffee shop is short-handed on deliveries. Catch the coffee sacks off the truck, stack them high and keep the pigeons away from the bagels. Ask at the counter about Bagel Counters.'],
  },
  {
    kicker: 'FOOD',
    headline: 'White Sauce Shortage Feared; Adel’s Says “Never”',
    img: '/art/news/halal-line.jpg',
    body: ['Rumors of a citywide white sauce shortage swept Fifth Avenue this week until the cart’s grill cook held up a squeeze bottle the size of a fire extinguisher. Order resumed. The line did not shrink.'],
  },
  {
    kicker: 'HARBOR',
    headline: 'Tugboat Toots at Brooklyn Bridge Walkers; Walkers Toot Back',
    body: ['A tugboat passing under the bridge gave three long toots this week, and a crowd on the promenade answered with three long “toots” of their own. The tugboat has not responded.'],
  },
  {
    kicker: 'TIMES SQUARE',
    headline: 'The Red Steps Are Full Again',
    img: '/art/rooms/times-square-v2.jpg',
    body: ['On a warm night every seat on the red steps is taken by someone eating a hot dog from Sal’s cart. Press S near a free spot to sit. New New Yorkers: Sal hands out a free welcome gift.'],
  },
  {
    kicker: 'SOUVENIRS',
    headline: 'Foam Liberty Crowns Outsell Real Crowns 1,000 to Nothing',
    img: '/art/rooms/iloveny.jpg',
    body: ['I ♥ NY Souvenirs in Times Square reports record sales of foam crowns and torches. The logo was sketched in 1977 by Milton Glaser in the back of a taxi, for free. The crowns are not free.'],
  },
  {
    kicker: 'CHELSEA',
    headline: 'Chelsea Market Waterfall Collects Wishes, Pennies and One Retainer',
    img: '/art/rooms/chelsea-market.jpg',
    body: ['The indoor waterfall in the old factory (a very famous cookie was invented in this building) takes one coin per wish. The retainer has been returned to its owner, who wished for it back.'],
  },
  {
    kicker: 'UNDERGROUND',
    headline: 'Busker at Times Sq–42 St Plays One Song for One Coin, and It’s a Good One',
    body: ['Drop a coin in the guitar case on the platform and he plays you a little tune. Regulars say it’s the best deal in Midtown, narrowly beating the dollar slice.'],
  },
  {
    kicker: 'TRANSIT',
    headline: 'Man Swipes MetroCard Once; It Works',
    body: ['Witnesses say the turnstile beeped happily on the first swipe. The man walked through slowly, as if in a dream, then turned around to tell a stranger, who said “good for you” and meant it.'],
  },
  {
    kicker: 'SCIENCE',
    headline: 'Manhole Steam Reaches New Heights; Scientists Shrug',
    body: ['The steam rising from the manholes on Fifth Avenue and in SoHo was measured this week at “a lot.” Nobody knows exactly where it comes from. Nobody asks. It’s part of the look.'],
  },
  {
    kicker: 'AT HOME',
    headline: 'Open House Season: Friends Drop By While You’re Home',
    body: ['Flip on Open House in your apartment and anyone can stop by while you’re there. Leave a note in each other’s guestbooks. It’s the polite thing, and the radiator likes the company.'],
  },
  {
    kicker: 'PARTIES',
    headline: 'House Party on the Fifth Floor; Neighbors Invited, Radiator Also Coming',
    body: ['Hit Party at home to pick the music, and your friends get an invite. A record player or a jukebox helps. Snacks are on you.'],
  },
  {
    kicker: 'LIBERTY ISLAND',
    headline: 'Lady Liberty Wears a Size 879 Sandal, Ranger Confirms',
    img: '/art/rooms/liberty-island-v2.jpg',
    body: ['She stands 151 feet from heel to torch, and her copper skin is only 2.4 millimeters thick. The ferry from Battery Park drops you at her feet. The seagulls will be there too.'],
  },
  {
    kicker: 'ROCKEFELLER CENTER',
    headline: 'The Tree Goes Up in November, Locals Remind Everyone Who Asks in October',
    body: ['Until then, the rink is open, the golden statue is shining and almost 200 flags are flying around the plaza. One reporter tried to count them. He has asked to be reassigned.'],
  },
  {
    kicker: 'CENTRAL PARK',
    headline: 'Squirrel Takes Pretzel in Broad Daylight; Pretzel Was “Asking for It”',
    body: ['The suspect was last seen running up a tree near Bow Bridge with most of a soft pretzel. Central Park squirrels fear nothing, and this one fears it least of all.'],
  },
  {
    kicker: 'ROOFTOPS',
    headline: 'Wooden Water Towers Still Built by Hand, Mostly by the Same Few Families',
    img: '/art/rooms/high-line.jpg',
    body: ['Most buildings over six stories need a rooftop water tank, and many are still made of wood, the old way. They are the most New York thing on the skyline. You can see a few from the High Line.'],
  },
  {
    kicker: 'GEOGRAPHY',
    headline: 'Fifth Avenue Still Politely Dividing the City Into East and West',
    body: ['Every street address in Manhattan is East or West of Fifth Avenue. Ask a New Yorker for directions and they will tell you which side you’re on before they tell you anything else.'],
  },
  {
    kicker: 'LANDMARKS',
    headline: 'St. Patrick’s Spires Still About 330 Feet Tall, Still Gorgeous',
    body: ['The neo-Gothic cathedral on Fifth Avenue was finished in 1878, and its twin spires still stop people on the sidewalk. Please stop on the side of the sidewalk.'],
  },
  {
    kicker: 'COFFEE',
    headline: 'Deli Coffee Cup Says It Is “Happy to Serve You”; Studies Confirm It Means It',
    body: ['The blue paper cup with the Greek key pattern has been promising happiness to New Yorkers for decades. Ralph’s Coffee in SoHo pours the classic for 3 coins, even though its own cups are green. Light and sweet, obviously.'],
  },
  {
    kicker: 'BAGELS',
    headline: 'Toasting a Fresh Bagel Ruled “Bold” by Ralph’s Coffee Staff',
    body: ['Asked about the practice, a staffer said only “bold,” then walked away. An everything bagel is 2 coins. What you do with it is between you and your conscience.'],
  },
  {
    kicker: 'TAXIS',
    headline: 'Taxi Honks at Empty Street, Out of Habit',
    body: ['A cab on Fifth Avenue honked twice at 4 AM at a street with no one on it. “You never know,” the driver explained. Hail one outside the Met when you need a ride across town.'],
  },
  {
    kicker: 'SHOWTIME',
    headline: 'Subway Dance Crew Clears the Car in Record Time; No Commuters Kicked',
    body: ['“Showtime, showtime!” rang out on the downtown train this week, followed by flips, spins and a very polite pole routine. Board at Times Sq–42 St to join the crew and dance for tips.'],
  },
  {
    kicker: 'COLLECTORS',
    headline: 'Playbill Collectors Form Orderly Line, Then a Less Orderly One',
    img: '/art/shows/pizza-king.jpg',
    body: ['Every first-time theatergoer at the Broadway Theater goes home with a Playbill to carry. Tonight’s show depends on the night: “Phantom of the Subway,” “The Pizza King” or “Bagels!”'],
  },
  {
    kicker: 'NEIGHBORHOOD WARS',
    headline: 'Uptown Acorns Accuse Midtown Lights of “Being Shiny”',
    body: ['Midtown responded by being shinier. Downtown Slices and Harbor Gulls declined to comment and went back to work. Every coin earned at a job counts for your team, and the standings reset Monday.'],
  },
  {
    kicker: 'STAMPS',
    headline: 'Stamp Collector Fills Another Page; Asks Not to Be Called a Collector',
    body: ['Every place in the city hides a few stamps, and every five in your stamp book pays 25 coins. “I just like stamps,” said the collector, who owns two binders and a magnifying glass.'],
  },
  {
    kicker: 'LITTLE ITALY',
    headline: 'Man Orders Slice With Fork and Knife; Pizzeria Falls Silent',
    img: '/art/rooms/pizza.jpg',
    body: ['A gasp rippled through Joe’s Pizza at lunchtime when a customer asked for a fork. Staff have agreed to pretend it never happened. Plain slices are one coin. Fold it.'],
  },
  {
    kicker: 'THE HARBOR',
    headline: 'Seagull at Battery Park Accused of Running a Pretzel Protection Racket',
    img: '/art/rooms/battery-park.jpg',
    body: ['Visitors waiting for the Liberty Island ferry report a large gull that stares at their snacks until they “voluntarily” hand them over. Park officials advise eating quickly and avoiding eye contact.'],
  },
  {
    kicker: 'THE LAKE',
    headline: 'Carriage Horse Named Most Patient New Yorker for Third Year Running',
    body: ['He has heard every proposal on Bow Bridge and every argument about which way the zoo is. He has never once honked. A carriage ride around the park starts by the lake.'],
  },
  {
    kicker: 'SNEAKERS',
    headline: 'Size 9½ Wide Declared the Most Common Foot in SoHo',
    body: ['That is according to the foot measurer at Nike, which says 9½ wide to almost everyone. Customers find it comforting. The turntable in the corner helps.'],
  },
]

// ---------- NYC Moments: things that really happened (dated ones come back as "On This Day") ----------
const MOMENTS: Moment[] = [
  {
    when: 'June 13, 2026',
    md: '06-13',
    kicker: 'CHAMPIONS',
    headline: 'The Knicks Win It All',
    deck: 'Their first title since 1973, and the city’s first ticker-tape parade for the team.',
    img: '/art/news/knicks.jpg',
    caption: 'The parade up the Canyon of Heroes, June 18, 2026.',
    body: ['The Knicks beat the Spurs 94–90 in Game 5 to win the Finals four games to one. Jalen Brunson scored 45 and was named Finals MVP. Five days later the team rode up Broadway through a blizzard of ticker tape.'],
  },
  {
    when: 'January 1, 2026',
    md: '01-01',
    kicker: 'CITY HALL',
    headline: 'Mayor Mamdani Sworn In Underground',
    deck: 'The new mayor took the oath just after midnight on New Year’s Day, in the old City Hall subway station.',
    img: '/art/news/cityhall.jpg',
    caption: 'The 1904 City Hall station: tile vaults, skylights, and no regular trains since 1945.',
    body: [
      'Zohran Mamdani won the November 2025 election and became mayor of New York City on January 1, 2026: the first Muslim and the first South Asian mayor in the city’s history, and at 34 its youngest in a century.',
      'He took the oath just after midnight in the decommissioned City Hall station, one of the most beautiful (and least visited) stops in the system. Subway buffs: still not over it.',
    ],
  },
  {
    when: 'August 26, 2025',
    md: '08-26',
    kicker: 'ROMANCE',
    headline: 'Swift & Kelce Are Engaged, and the Ring Is Pure New York',
    deck: 'The pop star and the tight end announced it with a joint post. The internet briefly stopped working.',
    img: '/art/news/engaged.jpg',
    caption: 'Artist’s impression. Our photographer was not invited to the garden.',
    body: [
      'Taylor Swift and Travis Kelce announced their engagement on August 26, 2025, sharing photos of a garden proposal and one very large diamond.',
      'The New York angle: the old-mine-cut ring was made by New York jewelry designer Kindred Lubeck. Friendship-bracelet sales in the five boroughs: up. Cornelia Street: emotionally ready.',
    ],
  },
  {
    when: 'September 21, 2015',
    md: '09-21',
    kicker: 'TRANSIT',
    headline: 'Pizza Rat: A Legend Is Born',
    deck: 'One rat. One slice. One flight of stairs at First Avenue.',
    img: '/art/news/pizzarat.jpg',
    caption: 'Re-enactment. The original rat has never granted an interview.',
    body: [
      'It was a Monday in September 2015 when comedian Matt Little posted a short video from the First Avenue L station: a rat dragging an entire slice of pizza down the subway stairs. Within days, #PizzaRat was the most New York thing on the internet.',
      'A sequel rat was filmed at Union Square that October, but purists recognize only the original. Club NYC commuters still report sightings at Times Sq–42 St. Look closely.',
    ],
  },
  {
    when: 'October 27, 1904',
    md: '10-27',
    kicker: 'TRANSIT',
    headline: 'The Subway Opens',
    deck: 'Twenty-eight stations from City Hall to 145th Street, for a nickel.',
    body: [
      'New York’s first subway line opened on October 27, 1904: about nine miles of track under Manhattan, from City Hall up to 145th Street, and a five-cent fare. Huge crowds lined up to try it that first evening.',
      'More than a century later the system runs all night, every night, and riders still argue about which car stops closest to the exit.',
    ],
  },
  {
    when: 'October 28, 1886',
    md: '10-28',
    kicker: 'THE HARBOR',
    headline: 'Lady Liberty Is Dedicated',
    deck: 'A gift from France, and the excuse for the city’s first ticker-tape parade.',
    img: '/art/rooms/liberty-island-v2.jpg',
    caption: 'Liberty Island today. The green came later.',
    body: [
      'President Grover Cleveland dedicated the Statue of Liberty on October 28, 1886. That morning, office workers on Wall Street threw ticker tape out the windows as the parade passed: the first ticker-tape parade.',
      'She was copper-colored when she arrived. The green patina took about 30 years, and nobody has asked her to change it back.',
    ],
  },
  {
    when: 'May 24, 1883',
    md: '05-24',
    kicker: 'THE BRIDGE',
    headline: 'The Brooklyn Bridge Opens',
    deck: 'The longest suspension bridge in the world on the day it opened.',
    img: '/art/rooms/brooklyn-bridge-v2.jpg',
    caption: 'The promenade today. Bikes on one side, please.',
    body: [
      'The Brooklyn Bridge opened on May 24, 1883, after 14 years of work. Emily Warren Roebling, who had helped run the project while her husband was ill, rode across first.',
      'It was the longest suspension bridge in the world at the time, and people still walk it just to look back at the skyline.',
    ],
  },
  {
    when: 'May 17, 1884',
    md: '05-17',
    kicker: 'THE BRIDGE',
    headline: 'Twenty-One Elephants Cross the Brooklyn Bridge',
    deck: 'P.T. Barnum’s way of proving the new bridge was safe.',
    body: [
      'A year after it opened, some New Yorkers still didn’t trust the Brooklyn Bridge. So on May 17, 1884, P.T. Barnum led 21 elephants across it, the famous Jumbo among them.',
      'The bridge held. The elephants were unimpressed. Walkers have been stopping in the middle for photos ever since.',
    ],
  },
  {
    when: 'May 1, 1931',
    md: '05-01',
    kicker: 'SKYLINE',
    headline: 'The Empire State Building Opens',
    deck: 'Built in just over a year, it lit up with the press of a button in Washington.',
    img: '/art/rooms/empire-deck.jpg',
    caption: 'The 86th-floor observatory today. The blimp is new.',
    body: [
      'The Empire State Building opened on May 1, 1931, after barely more than a year of construction. President Herbert Hoover pressed a button in Washington to switch on its lights.',
      'It was the tallest building in the world for nearly 40 years, and the observatory on the 86th floor is still one of the best views in the city.',
    ],
  },
  {
    when: 'February 2, 1913',
    md: '02-02',
    kicker: 'MIDTOWN',
    headline: 'Grand Central Terminal Opens',
    deck: 'The trains moved underground and the city got a cathedral for commuters.',
    img: '/art/rooms/grand-central.jpg',
    caption: 'The Main Concourse today. Look up.',
    body: [
      'Grand Central Terminal opened on February 2, 1913, with its tracks tucked underground and a Main Concourse built to make arriving feel like an occasion.',
      'Look up: the constellations on the ceiling run backwards. Look over: the clock above the information booth is where half the city has said “meet me.”',
    ],
  },
  {
    when: 'December 31, 1907',
    md: '12-31',
    kicker: 'TIMES SQUARE',
    headline: 'The First Ball Drops in Times Square',
    deck: 'An iron-and-wood ball, a hundred light bulbs, and a new tradition.',
    body: [
      'On the last night of 1907, a ball of iron and wood covered in light bulbs was lowered from the flagpole above Times Square to ring in 1908. The city has been counting down from ten ever since.',
      'Locals will tell you they’ve never been to the ball drop. Locals will also tell you exactly where to stand.',
    ],
  },
  {
    when: 'April 8, 1904',
    md: '04-08',
    kicker: 'TIMES SQUARE',
    headline: 'Longacre Square Gets a New Name',
    deck: 'A newspaper built a tower, and the square took its name.',
    img: '/art/rooms/times-square-v2.jpg',
    caption: 'The crossroads of the world today.',
    body: [
      'Until April 1904 the crossroads of Broadway and Seventh Avenue was Longacre Square, a center of the city’s horse-carriage trade. Then a newspaper moved into a new tower there, and the city renamed the square after it.',
      'We would like it noted that the Club NYC Times is also a newspaper. We are open to offers.',
    ],
  },
  {
    when: 'April 13, 1870',
    md: '04-13',
    kicker: 'MUSEUM MILE',
    headline: 'The Met Is Founded',
    deck: 'A museum with no building, no collection and very big plans.',
    img: '/art/rooms/the-met.jpg',
    caption: 'The steps on Fifth Avenue today. Best seats in the city.',
    body: [
      'The Metropolitan Museum of Art was founded on April 13, 1870, by a group of New Yorkers who wanted the city to have a museum worthy of it. At first it had no building and very little art.',
      'It moved to Central Park’s edge on Fifth Avenue in 1880, and the front steps have been the city’s favorite place to sit ever since.',
    ],
  },
  {
    when: 'April 30, 1789',
    md: '04-30',
    kicker: 'WALL STREET',
    headline: 'George Washington Takes the Oath on Wall Street',
    deck: 'Before Washington, D.C., there was New York.',
    body: [
      'New York was the first capital of the United States, and on April 30, 1789, George Washington was sworn in as the first president on the balcony of Federal Hall, on Wall Street.',
      'The capital moved away the next year. New Yorkers have never let it go.',
    ],
  },
  {
    when: 'January 15, 2009',
    md: '01-15',
    kicker: 'THE HUDSON',
    headline: 'The Miracle on the Hudson',
    deck: 'A plane lands on the river, and every one of the 155 people aboard survives.',
    body: [
      'On January 15, 2009, both engines of Flight 1549 failed minutes after takeoff. Captain Chesley “Sully” Sullenberger glided the plane onto the Hudson River beside Midtown.',
      'Ferries and rescue boats reached it within minutes, and all 155 people on board survived. Ferry crews are still a little proud about it.',
    ],
  },
  {
    when: 'March 12, 1888',
    md: '03-12',
    kicker: 'WEATHER',
    headline: 'The Great Blizzard of 1888',
    deck: 'The storm that convinced the city to go underground.',
    body: [
      'The Blizzard of 1888 buried New York under about 21 inches of snow, with drifts piled far higher, and froze the elevated trains in place for days.',
      'The storm helped persuade the city to move its trains and its wires underground. Every subway ride you take owes it a small thank you.',
    ],
  },
  {
    when: 'June 9, 2009',
    md: '06-09',
    kicker: 'WEST SIDE',
    headline: 'The High Line Opens',
    deck: 'An abandoned freight railroad becomes a park in the sky.',
    img: '/art/rooms/high-line.jpg',
    caption: 'The High Line today. Most people stop for the photo.',
    body: [
      'The first section of the High Line opened to the public on June 9, 2009, on an elevated freight line that had been abandoned for decades and gone wild with plants.',
      'Neighbors had fought to save it instead of tearing it down. Now it is one of the most-walked parks in the city, gelato included.',
    ],
  },
  {
    when: 'August 14, 2003',
    md: '08-14',
    kicker: 'CITY LIFE',
    headline: 'The Night the Lights Went Out',
    deck: 'The great blackout, and the city that stayed calm.',
    body: [
      'Just after 4 PM on August 14, 2003, the power went out across the Northeast, New York included. Trains stopped, elevators stopped and the city walked home over the bridges.',
      'Strangers directed traffic, neighbors shared what was in their freezers, and plenty of New Yorkers spent the warm night out on the stoop.',
    ],
  },
  {
    when: 'September 13, 1970',
    md: '09-13',
    kicker: 'SPORTS',
    headline: 'The First New York City Marathon',
    deck: 'One dollar to enter, laps of Central Park, 55 finishers.',
    img: '/art/rooms/central-park.jpg',
    caption: 'Central Park, where it all began.',
    body: [
      'The first New York City Marathon, on September 13, 1970, was a few laps of Central Park. It cost $1 to enter, 127 runners started, and 55 finished.',
      'Today it runs through all five boroughs and finishes in the park, and the crowds cheering on the sidewalks are half the fun.',
    ],
  },
  {
    when: 'December 21, 1913',
    md: '12-21',
    kicker: 'PUZZLES',
    headline: 'The First Crossword Puzzle',
    deck: 'Printed in a New York newspaper, and called a “word-cross.”',
    body: [
      'On December 21, 1913, the New York World printed a diamond-shaped “word-cross” puzzle by Arthur Wynne. It is widely considered the first crossword.',
      'Within a decade the whole country was hooked. The Club NYC Times does not have a crossword yet. Our pencils are ready.',
    ],
  },
  {
    when: 'December 15, 1989',
    md: '12-15',
    kicker: 'WALL STREET',
    headline: 'The Bull Arrives Overnight',
    deck: 'A surprise gift nobody asked for, and nobody wanted to give back.',
    body: [
      'On December 15, 1989, sculptor Arturo Di Modica trucked a bronze bull weighing more than three tons to Wall Street in the middle of the night and left it there as a gift.',
      'The police took it away, the public wanted it back, and The Bull soon found a home at Bowling Green, where it has been patiently posing for photos ever since.',
    ],
  },
  {
    when: 'January 1, 2017',
    md: '01-01',
    kicker: 'TRANSIT',
    headline: 'The Second Avenue Subway Finally Opens',
    deck: 'Planned since the 1920s. Opened for New Year’s.',
    body: [
      'After nearly a century of plans, false starts and digging, the first piece of the Second Avenue Subway opened on New Year’s Day 2017, with new stations at 72nd, 86th and 96th Streets.',
      'Riders called the bright new stations “suspiciously clean.” They have since been broken in.',
    ],
  },
  {
    when: 'June 26, 1927',
    md: '06-26',
    kicker: 'CONEY ISLAND',
    headline: 'The Cyclone Rolls for the First Time',
    deck: 'A wooden roller coaster by the sea, still screaming.',
    body: [
      'The Cyclone opened at Coney Island on June 26, 1927, and its wooden track has been rattling riders by the boardwalk ever since.',
      'Coney Island is in Brooklyn, which in Club NYC is still under construction: Brooklyn (Coming Soon). Save us a seat in the front car.',
    ],
  },
  {
    when: 'May 23, 1911',
    md: '05-23',
    kicker: 'LIBRARIES',
    headline: 'The Library With the Lions Opens on Fifth Avenue',
    deck: 'The marble main branch of the public library, and two very patient cats.',
    body: [
      'The New York Public Library’s main building on Fifth Avenue was dedicated on May 23, 1911. The two marble lions out front were later named Patience and Fortitude by Mayor Fiorello La Guardia.',
      'They have been watching the city walk by for over a century, like the most dignified bodega cats ever made.',
    ],
  },
]

// ---------- Sports ----------
const SPORTS: Story[] = [
  {
    kicker: 'CRUMB DERBY',
    headline: 'Pigeons Edge Rats 3–2 in Times Square Crumb Derby',
    body: ['The Pigeons took an early lead on a dropped pretzel, but the Rats rallied late with a full slice. A controversial call on a hot dog bun was upheld after review. The Rats have filed a complaint with the subway.'],
  },
  {
    kicker: 'UNDERGROUND',
    headline: 'Showtime Crew Sweeps the Uptown Series Without Kicking a Single Commuter',
    body: ['Judges praised the crew’s flips, spins and situational awareness. One commuter slept through the entire routine and is now considered part of the act.'],
  },
  {
    kicker: 'ON THE ICE',
    headline: 'Rockefeller Rink Hosts Annual “Who Can Stand Up the Longest” Classic',
    body: ['This year’s winner stayed upright for four minutes and eleven seconds, mostly by holding the wall. Runners-up were honored for “creative falling.” Skate rentals remain available at the booth.'],
  },
  {
    kicker: 'CENTRAL PARK',
    headline: 'Squirrels Win the Nut Hoarding Title Again; Ducks Protest the Format',
    body: ['The squirrels buried an estimated 4,000 acorns and remember where about 60 of them are. The ducks argued that floating should count. It does not.'],
  },
  {
    kicker: 'DELIVERIES',
    headline: 'Bagel Counters Crew Posts Personal Best; Pigeon Ejected for Interference',
    body: ['The Ralph’s Coffee delivery team stacked coffee sacks a record height before a pigeon swooped in for the bagels. Officials ruled the play dead. The pigeon has been banned from SoHo for one afternoon.'],
  },
  {
    kicker: 'HARBOR',
    headline: 'Ferry Captain Sets Course Record to Liberty Island, Waves to Statue Twice',
    body: ['The run included a clean line between two kayaks and a tugboat. The statue did not wave back, but witnesses say she looked proud.'],
  },
  {
    kicker: 'LUNCH RUSH',
    headline: 'Halal Rush Grill Cook Plates a Platter in Four Seconds Flat',
    body: ['Rice, chicken, white sauce, red sauce, lid. The judges asked for a replay and the cook did it again, faster. The line applauded and then immediately got back in line.'],
  },
  {
    kicker: 'MARATHON SEASON',
    headline: 'Runners Lap Central Park in Training; Ducks Unimpressed',
    body: ['The marathon runs through all five boroughs on the first Sunday in November and finishes in the park. Training season means the loop is full of runners, and the ducks have opinions about all of them.'],
  },
  {
    kicker: 'SIDEWALKS',
    headline: 'Speed-Walking Finals Held on Fifth Avenue; Tourist Disqualified for Stopping',
    body: ['Competitors weaved through window shoppers at a blistering pace. The lone tourist in the field stopped to look up at a building and was quietly walked off the course by officials.'],
  },
  {
    kicker: 'PIZZA',
    headline: 'Fastest Fold in the City Clocked at 0.4 Seconds',
    body: ['A Slice Factory veteran folded a slice, took a bite and kept walking in less than half a second. Purists called it “beautiful.” A visitor with a fork called it “aggressive.” The visitor was asked to leave.'],
  },
  {
    kicker: 'STREET GAMES',
    headline: 'Stickball on Mott Street Resumes After Ball Rescued From Fire Escape',
    body: ['Play stopped for 20 minutes while a neighbor on the third floor returned the ball with a speech about windows. The home team won, the away team claims the fire escape was in play, and everyone got a dumpling after.'],
  },
  {
    kicker: 'HANDBALL',
    headline: 'Handball Courts Packed; Players Agree Nobody Is Getting Older',
    body: ['The city’s handball courts were full from sunrise, and every player over 50 insisted they were “just warming up.” The wall, as always, was undefeated.'],
  },
]

// ---------- Opinion ----------
const LETTERS: Letter[] = [
  {
    q: 'Dear Bodega Cat, how do I make money in this city? Signed, Broke in Brooklyn',
    a: 'Work, kid. The pizzeria, the halal cart, the coffee shop, the ferry and the subway (Showtime!) all pay coins. Crowds tip flash mobs, every 5 stamps pays a bonus, and beating a friend’s challenge pays too. Spend it on clothes, furniture and snacks. I would, but I don’t have pockets.',
  },
  {
    q: 'Dear Bodega Cat, my apartment is empty and sad. Signed, Bare in SoHo',
    a: 'Tap the little brownstone on your toolbar. Once you’re home, hit Decorate, and check Listings for a bigger place: there’s a penthouse on Billionaires’ Row with a terrace made for parties. A bean bag changes lives either way.',
  },
  { q: 'Dear Bodega Cat, is it ever OK to eat pizza with a fork? Signed, Curious in Chelsea', a: 'No.' },
  {
    q: 'Dear Bodega Cat, I keep getting lost. Signed, Turned Around in Times Square',
    a: 'Press M for the map or U for the subway. The map shows the whole city, and the train goes uptown and downtown all night. I get around by sitting in one spot until the city comes to me. Results vary.',
  },
  {
    q: 'Dear Bodega Cat, how do I make friends here? Signed, New in Town',
    a: 'Click any New Yorker and say hi. Wave (W), dance (D) or sit nearby first: people warm up to familiar faces. Then hit Add Friend. I made my friends by sitting on their newspapers. Also works.',
  },
  {
    q: 'Dear Bodega Cat, where’s the best seat in the city? Signed, Tired Feet in Midtown',
    a: 'The Met steps, the red steps in Times Square, a rolling lounger on the High Line. Press S near any of them. My personal favorite is a warm stack of bread. Not open to the public.',
  },
  {
    q: 'Dear Bodega Cat, my friend says bagels should be toasted. Signed, Torn on Twenty-Third',
    a: 'A fresh bagel is never toasted. A day-old bagel is a different conversation, and we don’t have it in front of the children. Get yours at Ralph’s Coffee in SoHo or Bagel Bros in Chelsea Market.',
  },
  {
    q: 'Dear Bodega Cat, how do I get on TV? Signed, Ready for My Close-Up',
    a: 'Rockefeller Center has a TV studio with a window. Stand there and wave. That’s how it worked for me, and now I have a column.',
  },
  {
    q: 'Dear Bodega Cat, which neighborhood should I root for in the Neighborhood Wars? Signed, Undecided Uptown',
    a: 'Whichever one you’ll actually work for. Every coin you earn at a job counts for your team, and the standings reset every Monday. I’m Downtown. The slices are closer.',
  },
  {
    q: 'Dear Bodega Cat, is the ferry worth it? Signed, Landlocked on Lex',
    a: 'Yes. Battery Park to Liberty Island, and the captain job pays. Wave at the statue. Guard your pretzel from the seagulls. They are organized.',
  },
  {
    q: 'Dear Bodega Cat, I bought sunglasses from a man in SoHo. Are they real? Signed, Squinting on Spring Street',
    a: 'They are as real as you need them to be. Five coins is five coins.',
  },
  {
    q: 'Dear Bodega Cat, my radiator clanks all night. What do I do? Signed, Sleepless on the Fifth Floor',
    a: 'Nothing. That’s the building talking. Some nights it says “heat.” Some nights it says “no.” You learn to listen.',
  },
  {
    q: 'Dear Bodega Cat, why does everyone walk so fast? Signed, Strolling in Midtown',
    a: 'Because the light is about to change, the train is about to come and the bagel place closes at three. Walk on the right, stop on the side, and never stand at the top of the subway stairs.',
  },
  {
    q: 'Dear Bodega Cat, where should I take a date? Signed, Nervous in Nolita',
    a: 'A carriage ride in Central Park, a slice in Little Italy, then the Broadway Theater (5 coins a seat). If it goes well, Bow Bridge. If it goes badly, also Bow Bridge. It’s very forgiving.',
  },
  {
    q: 'Dear Bodega Cat, how do I get a Playbill? Signed, Stagestruck in the Theater District',
    a: 'Buy a ticket at the Broadway Theater and stay for the bow. First-timers get one to carry. Clapping is encouraged. Throwing roses is between you and the usher.',
  },
  {
    q: 'Dear Bodega Cat, when do I stop being a tourist? Signed, Still Looking Up',
    a: 'One day someone will stop dead at the top of the subway stairs in front of you, and you will sigh without meaning to. That’s the day. Keep looking up anyway. The buildings are worth it.',
  },
  {
    q: 'Dear Bodega Cat, what’s with all the stamps? Signed, Collecting in Chinatown',
    a: 'Every place has its secrets, and every secret has a stamp. Every five stamps pays 25 coins. I have one stamp. It says “Employee of the Month.” I gave it to myself.',
  },
]

/** Tips that are true in the game today (keep them that way when features change). */
const SECRETS = [
  'Press D to dance anywhere. In Times Square a crowd may join you, and crowds tip.',
  'Click any New Yorker, then “Visit their place” to see their apartment. Sign the guestbook!',
  'Turn on Open House in your apartment and visitors can drop by while you’re home.',
  'Stand under the arches by the Whispering Gallery in Grand Central and say something. The walls talk back.',
  'Grand Central’s famous ceiling hides a mistake. Click it to find out.',
  'The Met steps are the best seat in the city. Sit and watch.',
  'Say hello to three pigeons in Times Square and the flock will remember you.',
  'Host a party at home: pick the music and your friends get an invite.',
  'Wave at the TV studio window at Rockefeller Center. You might end up on air.',
  'Seagulls at Battery Park are not to be trusted with snacks.',
  'The toy taxis, robots and balloons are at I ♥ NY Souvenirs in Times Square.',
  'Toss a coin in the fountains outside the Met, or the waterfall in Chelsea Market, and make a wish.',
  'Tip the busker’s guitar case at Times Sq–42 St and he’ll play you a tune.',
  'Rent skates at the booth in Rockefeller Center, then walk onto the ice.',
  'There’s a rat at Times Sq–42 St with a slice of pizza. He has always had a slice.',
  'The tower viewers on the Empire State Building’s 86th floor are free. Look for the blimp.',
  'Every five stamps in your stamp book pays 25 coins.',
  'Sal’s cart in Times Square has a free welcome gift for every new New Yorker.',
  'Press S near a bench, a step or a lounger to sit. Anywhere else, you sit on the ground like a real New Yorker.',
  'Buy a ticket at the Broadway Theater and stay for the bow: first-timers get a Playbill.',
]

const CLASSIFIEDS: [string, string][] = [
  ['FOR RENT', '5th-floor walk-up. Cozy (tiny). Exposed brick, clanky radiator, view of water towers. No broker fee (thanks, FARE Act).'],
  ['FOR SALE', 'Billionaires’ Row penthouse, 57th St. Wraparound terrace, views of the whole park, built for parties. See StreetCheesy.'],
  ['LOST', 'One MetroCard, 2014 design, $0.25 balance. Sentimental value only.'],
  ['WANTED', 'Dancers for subway performances. Must be able to say “Showtime!” with feeling.'],
  ['FOR SALE', '“Designer” sunglasses. SoHo, corner of Greene St. Totally real. Ask for Vinny.'],
  ['SERVICES', 'Skyline portraits painted while you wait. Brooklyn Bridge promenade. Very cheap, very good.'],
  ['LOST', 'One glove. Left. Last seen on the downtown local. The right one misses it terribly.'],
  ['FOUND', 'A MetroCard with exactly one ride left. Will return to whoever can describe the swipe.'],
  ['FOR SALE', 'Folding chair, used once, outside Supreme. Has seen things.'],
  ['ROOMMATE WANTED', '1BR (the bedroom is also the living room). Must love radiators and cats who sit on newspapers.'],
  ['SERVICES', 'Parallel parking coach. 30 years’ experience. Has never actually found a spot.'],
  ['FREE', 'Couch on the curb, corner of Mott and Grand. Comfortable. Free. Probably fine.'],
  ['MISSED CONNECTION', 'You: held the subway doors for me. Me: too shy to say thank you. The doors: closing. Thank you.'],
  ['MISSED CONNECTION', 'We both reached for the last everything bagel at Ralph’s Coffee. You let me have it. I think about it daily.'],
  ['FOR RENT', 'Closet with a window. Or a window with a closet. Prime SoHo location. Bring your own hanger.'],
  ['HELP WANTED', 'Ferry captains, Battery Park. Must love seagulls, or at least tolerate them.'],
  ['HELP WANTED', 'Pizza makers, Joe’s Pizza, Little Italy. Fast hands, steady sauce, no forks.'],
  ['HELP WANTED', 'Lunch-rush crew, Adel’s Famous Halal Food, Fifth Avenue. White sauce experience a plus.'],
  ['HELP WANTED', 'Delivery help, Ralph’s Coffee, SoHo. Catch the coffee, dodge the pigeons.'],
  ['LESSONS', 'Learn to fold a slice like a local. One lesson. It’s just folding. 1 coin.'],
  ['FOR SALE', 'Snow globe of the Empire State Building. Shake gently. It has feelings.'],
  ['LOST', 'Tourist, last seen asking which way is uptown. Answers to “excuse me.”'],
  ['SERVICES', 'Professional line-stander. Will hold your spot at Supreme or the Adel’s cart. Bring snacks.'],
  ['NOTICE', 'The radiator in 5C will begin clanking at 6 AM sharp. This is not a request.'],
  ['ADOPT', 'Bodega cats seeking corner stores. Must have a sunny window and a stack of bread.'],
  ['FOR SALE', 'Foam Liberty crown, gently used, emotionally significant. I ♥ NY Souvenirs has new ones.'],
  ['WANTED', 'Audience members for “Phantom of the Subway.” Must clap at the chandelier.'],
  ['TRADE', 'One window seat on the N train for one aisle seat at the Broadway Theater.'],
  ['NOTICE', 'To whoever keeps taking my newspaper from the stoop: please return the crossword. Keep the rest.'],
  ['FOR RENT', 'Fifth-floor walk-up, no elevator, incredible calves included.'],
  ['LOST', 'My patience, somewhere on Fifth Avenue between 57th Street and a tour group.'],
  ['FOR SALE', 'Rowboat, Central Park. Currently occupied by ducks. Ducks not included. Ducks will not leave.'],
]

const OVERHEARD: Overheard[] = [
  { q: '“I’m not lost. I’m walking with purpose in the wrong direction.”', where: 'Times Square' },
  { q: '“It’s not a big apartment, but the radiator is very passionate.”', where: 'A fifth-floor stairwell' },
  { q: '“The train isn’t late. We’re just early for the next one.”', where: 'Times Sq–42 St' },
  { q: '“Is this the line?” “No.” “It is now.”', where: 'Greene Street, SoHo' },
  { q: '“I came for the bagel and stayed for the bagel.”', where: 'Ralph’s Coffee' },
  { q: '“Fold it! Why are you holding it like a sandwich?”', where: 'Little Italy' },
  { q: '“The pigeon took my pretzel, and honestly, I respect him.”', where: 'The Met steps' },
  { q: '“Every time I look up I trip, and every time I look down I miss something.”', where: 'Grand Central' },
  { q: '“I’ll be there in five minutes,” said someone forty minutes away.', where: 'Everywhere' },
  { q: '“That squirrel has a better apartment than me.”', where: 'Central Park' },
  { q: '“It’s a twenty-minute walk,” said a New Yorker, about a fifty-minute walk.', where: 'Fifth Avenue' },
  { q: '“Showtime? At 9 AM?” “Showtime is a state of mind.”', where: 'The downtown local' },
  { q: '“It’s so cold the hot dog guy is wearing two hats.”', where: 'Times Square' },
  { q: '“Excuse me, where’s Times Square?” “You’re standing in it.”', where: 'Times Square' },
  { q: '“Extra white sauce. No, more. No, more.”', where: 'Fifth Avenue' },
  { q: '“Are they real?” “Is anything real?”', where: 'A sunglasses stand in SoHo' },
  { q: '“Me and that seagull have history.”', where: 'Battery Park' },
  { q: '“I don’t need a bigger apartment. I need a smaller couch.”', where: 'StreetCheesy open house' },
  { q: '“The chandelier didn’t fall. That’s how you know it’s a matinee.”', where: 'The Broadway Theater' },
  { q: '“We’re not running late, we’re running New York.”', where: 'The red steps' },
]

// ---------- weather ----------
/** typical New York highs and lows (°F) by month */
const NORMALS: [number, number][] = [[39, 27], [42, 29], [50, 35], [62, 45], [72, 54], [80, 64], [85, 70], [84, 69], [76, 61], [64, 50], [54, 42], [44, 32]]
const SKIES = ['Sunny', 'Mostly sunny', 'Partly cloudy', 'Partly pigeony', 'Clouds and sun', 'Breezy', 'Clear skies', 'Overcast']
const SKIES_WET = ['Light rain', 'Showers, on and off', 'Drizzle']
const SKIES_BY_SEASON: Record<string, string[]> = {
  winter: ['Flurries', 'Bitter wind off the river', 'Crisp and gray'],
  spring: ['Mild', 'Blossoms everywhere'],
  summer: ['Hot and sticky', 'Humid', 'Thunderstorms later'],
  fall: ['Crisp', 'Sweater weather'],
}
const WEATHER_JOKES = [
  'Chance of steam from manholes: 100%.',
  'Subway platforms: somehow ten degrees warmer.',
  'Wind tunnel advisory for Sixth Avenue.',
  'Tourist density: high. Sidewalk speed: low.',
  'Pigeon activity: moderate to bold.',
  'Perfect bodega-cat napping weather.',
  'Rooftop water towers: full.',
  'Ideal conditions for eating a slice outside.',
  'Good day to sit on the Met steps.',
  'Visibility from the 86th floor: excellent, blimp included.',
  'Sidewalk grates: walk around them anyway.',
  'Seagull advisory remains in effect at Battery Park.',
]

function weatherFor(day: string) {
  const r = rng(`weather:${day}`)
  const month = Number(day.slice(5, 7)) - 1
  const [hiN, loN] = NORMALS[month]
  const swing = Math.round((r() - 0.5) * 12)
  const hi = hiN + swing
  const lo = loN + swing + Math.round((r() - 0.5) * 4)
  const season = month < 2 || month === 11 ? 'winter' : month < 5 ? 'spring' : month < 8 ? 'summer' : 'fall'
  const wet = r() < 0.22
  const pool = wet ? (season === 'winter' && lo < 34 ? ['Snow showers', 'Light snow'] : SKIES_WET) : [...SKIES, ...SKIES_BY_SEASON[season]]
  const sky = pool[Math.floor(r() * pool.length)]
  const joke = wet && season !== 'winter' ? 'Umbrella vendors appear within 30 seconds of the first drop.' : WEATHER_JOKES[Math.floor(r() * WEATHER_JOKES.length)]
  return { short: `${sky}, ${hi}°F`, long: `${sky}. High ${hi}°F, low ${lo}°F. ${joke}` }
}

// ---------- putting an edition together ----------
const perms = new Map<string, number[]>()
/** a fixed shuffle of 0..n-1 for one pool (the same for everyone, forever) */
function perm(name: string, n: number): number[] {
  const key = `${name}:${n}`
  let p = perms.get(key)
  if (!p) {
    const r = rng(`news-pool:${name}`)
    p = [...Array(n).keys()]
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[p[i], p[j]] = [p[j], p[i]]
    }
    perms.set(key, p)
  }
  return p
}
/** edition `e` takes the e-th slice of `k` items from a pool, so neighbouring papers never share a story */
function slice<T>(name: string, pool: T[], e: number, k: number, skip: (t: T) => boolean = () => false): T[] {
  const p = perm(name, pool.length)
  const out: T[] = []
  for (let i = 0; out.length < k && i < pool.length; i++) {
    const t = pool[p[(e * k + i) % pool.length]]
    if (!skip(t) && !out.includes(t)) out.push(t)
  }
  return out
}

export function editionFor(day: string): Edition {
  const no = editionNo(day)
  const e = Math.max(0, no - 1)
  const special = SPECIAL[day]
  const lead = special?.lead ?? slice('leads', LEADS, e, 1)[0]
  const briefs = slice('briefs', BRIEFS, e, 6, (s) => s.img !== undefined && s.img === lead.img)
  // the front-page rail takes a short one without a picture (the lead has the big picture)
  const rail = briefs.find((s) => !s.img) ?? briefs[0]
  const metro = briefs.filter((s) => s !== rail)
  // NYC Moments: whatever really happened on this date leads (On This Day), then the rotation
  const md = day.slice(5)
  const today = MOMENTS.filter((m) => m.md === md && m.headline !== lead.headline)
  const first = today.length ? today[hash(day) % today.length] : null
  const rest = slice('moments', MOMENTS, e, 3, (m) => m === first || m.headline === lead.headline)
  const moments = (first ? [first, ...rest] : rest).slice(0, 3)
  const year = Math.floor((no - 1) / 365)
  return {
    day,
    no,
    volume: `Vol. ${ROMAN[year] ?? year + 1}`,
    date: longDate(day),
    short: shortDate(day),
    ear: special?.ear ?? 'LATE CITY EDITION',
    weather: weatherFor(day),
    lead,
    rail,
    overheard: slice('overheard', OVERHEARD, e, 1)[0],
    moments,
    onThisDay: !!first,
    metro,
    sports: slice('sports', SPORTS, e, 1)[0],
    advice: slice('letters', LETTERS, e, 3),
    secrets: slice('secrets', SECRETS, e, 4),
    classifieds: slice('classifieds', CLASSIFIEDS, e, 6),
  }
}
