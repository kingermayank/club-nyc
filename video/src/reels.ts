/**
 * Short-form reels (9:16, 1080 x 1920) cut on the same 100 BPM grid as the trailer (timeline.ts: 18 frames a beat).
 * Each reel is one phrase of "Sidewalk Shuffle", 4 chorus bars (C Am F G = 16 beats, 9.6 s), so it loops cleanly:
 * the G at the end leads straight back into the C at the start. The picture (Reel.tsx) and the music
 * (capture/music-entry.ts, renderReelAudio) both read this file, so shots and sound effects can't drift apart.
 * The content plan these come from: docs/marketing/reels-plan.md.
 */
import type { SfxKind } from './timeline'

export interface ReelShot {
  /** footage in video/public/footage; leave out for the end card */
  src?: string
  /** where in the clip to start (seconds) */
  at?: number
  beats: number
  /** the caption, word by word; *word* is drawn in Taxi Yellow */
  hook?: string
  /** a slow push-in, and where it aims (crop toward the interesting part of the 16:9 frame) */
  zoom?: [number, number]
  origin?: string
  /** the game-style place plate under the window */
  place?: string
  /** portrait reels only. tall: one full-height crop of the 16:9 clip, centred on `cx` (0 to 1 across the width) and
   *  panning to `pan` if given; stack: two clips, one above the other (`b` is the lower one) */
  /** real: the photo above the game clip; photo: the photo alone, full frame (grey when `mono`), no clip */
  mode?: 'tall' | 'stack' | 'real' | 'photo'
  cx?: number
  pan?: number
  b?: { src: string; at?: number; cx?: number; place?: string }
  /** real: a public-domain or CC0 photo (public/posts/real) above the game clip, `label` on it ("Real New York" unless
   *  set, a year say) and its `credit` in small type; `pos` aims the photo's crop */
  photo?: { src: string; pos?: string; label?: string; credit: string; mono?: boolean }
  /** a small chip under the hook, like a clock time in a day-in-the-life reel */
  chip?: string
}

export interface ReelDef {
  id: string
  /** 'portrait' fills the 9:16 frame with the game itself; the default puts the game in a window over its own blur */
  layout?: 'window' | 'portrait'
  /** 16 (one chorus phrase) unless set; 24 and 32 also land on a phrase */
  beats?: number
  /** 4 chorus bars of the song (16 beats); every reel is one phrase so it loops */
  shots: ReelShot[]
  end: { title?: string; line: string }
  sfx: { beat: number; kind: SfxKind; notes?: [number, number] }[]
}

export const REEL_BEATS = 16

export const REELS: Record<string, ReelDef> = {
  'grew-up': {
    id: 'grew-up',
    shots: [
      { src: 'creator.mp4', at: 0.3, beats: 3, hook: 'POV: the *penguin* game you played after school', zoom: [1.38, 1.44], origin: '8% 55%', place: 'Make your New Yorker' },
      { src: 'hero-liberty-island.mp4', at: 0.4, beats: 3, hook: 'grew up', zoom: [1.04, 1.12], origin: '62% 45%', place: 'Liberty Island' },
      { src: 'hero-empire-deck.mp4', at: 0.4, beats: 3, hook: 'and moved to *Manhattan*', zoom: [1.04, 1.12], origin: '30% 40%', place: 'Empire State Building' },
      { src: 'job-ferry-captain.mp4', at: 2.4, beats: 3, hook: 'now you *captain* the ferry', zoom: [1.08, 1.16], origin: '35% 60%', place: 'Job: Ferry Captain' },
      { src: 'stampbook.mp4', at: 0.05, beats: 2, hook: 'and collect *stamps* again', zoom: [1.12, 1.18], origin: '55% 50%', place: 'Stamp Book' },
      { beats: 2 },
    ],
    end: { line: 'Link in bio' },
    sfx: [
      { beat: 0, kind: 'pop' },
      { beat: 3, kind: 'pop' },
      { beat: 6, kind: 'whoosh' },
      { beat: 9, kind: 'pop' },
      { beat: 10.6, kind: 'coin' },
      { beat: 12, kind: 'stamp' },
      { beat: 14, kind: 'pop' },
    ],
  },
  // the content plan's week 1 list reel: one landmark every 2 beats, the hook carries the whole thing
  tour: {
    id: 'tour',
    shots: [
      { src: 'place-chinatown.mp4', at: 0.3, beats: 2, hook: 'Manhattan in *ten seconds*', zoom: [1.04, 1.1], place: 'Chinatown' },
      { src: 'place-soho.mp4', at: 0.3, beats: 2, zoom: [1.04, 1.1], place: 'SoHo' },
      { src: 'place-the-met.mp4', at: 0.3, beats: 2, zoom: [1.04, 1.1], place: 'The Met' },
      { src: 'place-grand-central.mp4', at: 0.3, beats: 2, zoom: [1.04, 1.1], place: 'Grand Central' },
      { src: 'place-rockefeller.mp4', at: 0.3, beats: 2, zoom: [1.04, 1.1], place: 'Rockefeller Center' },
      { src: 'hero-brooklyn-bridge.mp4', at: 0.3, beats: 2, zoom: [1.04, 1.1], place: 'Brooklyn Bridge' },
      { src: 'place-liberty-island.mp4', at: 0.3, beats: 2, zoom: [1.04, 1.1], place: 'Liberty Island' },
      { beats: 2 },
    ],
    end: { title: 'Every room is walkable', line: 'Link in bio' },
    sfx: [0, 2, 4, 6, 8, 10, 12].map((beat) => ({ beat, kind: 'pop' as const })).concat([{ beat: 14, kind: 'pop' }]),
  },
  // the jobs: five ways to earn coins, the joke lands on the rent
  'first-job': {
    id: 'first-job',
    shots: [
      { src: 'job-slice-factory.mp4', at: 1.0, beats: 3, hook: 'Five jobs in *Manhattan*', zoom: [1.06, 1.14], origin: '45% 55%', place: 'Job: Slice Factory' },
      { src: 'job-bagel-counters.mp4', at: 1.0, beats: 3, hook: 'zero *rent*', zoom: [1.06, 1.14], place: 'Job: Bagel Counter' },
      { src: 'job-halal-rush.mp4', at: 1.5, beats: 2, hook: 'a real *lunch rush*', zoom: [1.06, 1.14], place: 'Job: Halal Rush' },
      { src: 'job-showtime.mp4', at: 1.0, beats: 3, hook: 'subway *showtime*', zoom: [1.06, 1.14], place: 'Job: Showtime' },
      { src: 'job-ferry-captain.mp4', at: 2.0, beats: 3, hook: 'and you drive the *ferry*', zoom: [1.08, 1.16], origin: '35% 60%', place: 'Job: Ferry Captain' },
      { beats: 2 },
    ],
    end: { line: 'Link in bio' },
    sfx: [
      { beat: 0, kind: 'pop' },
      { beat: 3, kind: 'pop' },
      { beat: 4.5, kind: 'coin' },
      { beat: 6, kind: 'pop' },
      { beat: 8, kind: 'whoosh' },
      { beat: 11, kind: 'pop' },
      { beat: 12.5, kind: 'coin' },
      { beat: 14, kind: 'pop' },
    ],
  },
  // the live moment: posted at 7 PM so it lands before the evening's Jam
  'dance-jam': {
    id: 'dance-jam',
    shots: [
      // Times Square art carries an I ♥ NY sign on the right (a trademark question): crop to the left side
      { src: 'jam.mp4', at: 1.0, beats: 3, hook: 'When the *Dance Jam* starts', zoom: [1.6, 1.66], origin: '0% 70%', place: 'Dance Jam' },
      { src: 'flashmob.mp4', at: 2.0, beats: 3, hook: 'the whole city *dances*', zoom: [1.04, 1.1], place: 'Flash mob' },
      { src: 'party.mp4', at: 1.0, beats: 3, hook: 'with your *actual* friends', zoom: [1.06, 1.12] },
      { src: 'crowd.mp4', at: 2.0, beats: 3, hook: 'nobody can dance. *everybody* dances', zoom: [1.6, 1.66], origin: '0% 70%' },
      { src: 'place-rockefeller.mp4', at: 0.3, beats: 2, hook: 'see you *tonight*', zoom: [1.04, 1.1], place: 'Rockefeller Center' },
      { beats: 2 },
    ],
    end: { title: 'Bring your group chat', line: 'Link in bio' },
    sfx: [
      { beat: 0, kind: 'pop' },
      { beat: 3, kind: 'whoosh' },
      { beat: 6, kind: 'pop' },
      { beat: 9, kind: 'pop' },
      { beat: 12, kind: 'whoosh' },
      { beat: 14, kind: 'pop' },
    ],
  },
  // the share reel: made to be sent to one person
  'moved-away': {
    id: 'moved-away',
    shots: [
      { src: 'place-brooklyn-bridge.mp4', at: 0.3, beats: 3, hook: 'For the friend who *moved away*', zoom: [1.04, 1.1], place: 'Brooklyn Bridge' },
      { src: 'place-central-park.mp4', at: 0.3, beats: 3, hook: 'we still meet in *Central Park*', zoom: [1.04, 1.1], place: 'Central Park' },
      { src: 'place-high-line.mp4', at: 0.3, beats: 3, hook: 'walk the *High Line*', zoom: [1.04, 1.1], place: 'The High Line' },
      { src: 'party.mp4', at: 2.5, beats: 3, hook: 'and dance *badly*', zoom: [1.06, 1.12] },
      { src: 'hero-rockefeller.mp4', at: 0.3, beats: 2, hook: 'send this to *them*', zoom: [1.04, 1.1] },
      { beats: 2 },
    ],
    end: { title: 'Same city, any city', line: 'Link in bio' },
    sfx: [
      { beat: 0, kind: 'pop' },
      { beat: 3, kind: 'pop' },
      { beat: 6, kind: 'pop' },
      { beat: 9, kind: 'whoosh' },
      { beat: 12, kind: 'pop' },
      { beat: 14, kind: 'pop' },
    ],
  },
  // ---------------------------------------------------------------- portrait reels: the game fills the frame.
  // Footage: tall-<room>.mp4 (capture.py tall, 2560 x 1446): the New Yorker strolls through the middle third for
  // about 2.6 s, then dances. Every crop is centred where capture.py's TALL list aimed the walk.

  // day in the life, the most native format on the app: clock chips, one honest NYC truth per stop
  'pov-morning': {
    id: 'pov-morning',
    layout: 'portrait',
    beats: 24,
    shots: [
      { mode: 'tall', src: 'tall-apartment.mp4', at: 0.3, beats: 3, cx: 0.45, chip: '7:02 AM', hook: 'POV: a morning in *Manhattan*' },
      { mode: 'tall', src: 'tall-coffee.mp4', at: 0.3, beats: 3, cx: 0.42, chip: '7:30 AM', hook: 'oat milk, *obviously*', place: 'Starducks' },
      { mode: 'tall', src: 'tall-subway.mp4', at: 0.3, beats: 3, cx: 0.5, chip: '7:48 AM', hook: 'the train is *right there*', place: 'Subway' },
      { mode: 'tall', src: 'tall-grand-central.mp4', at: 0.6, beats: 3, cx: 0.5, chip: '8:05 AM', hook: 'it was *not* right there', place: 'Grand Central' },
      { mode: 'tall', src: 'tall-wall-street.mp4', at: 0.3, beats: 3, cx: 0.66, chip: '9:00 AM', hook: 'one meeting. *one*', place: 'Wall Street' },
      { mode: 'tall', src: 'tall-central-park.mp4', at: 0.3, beats: 3, cx: 0.47, chip: '12:30 PM', hook: 'lunch on the *lawn*', place: 'Central Park' },
      { mode: 'tall', src: 'tall-broadway.mp4', at: 2.4, beats: 3, cx: 0.5, chip: '8:00 PM', hook: 'and a *show*', place: 'Broadway' },
      { beats: 3 },
    ],
    end: { title: 'Your day in the city', line: 'Link in bio' },
    sfx: [...[0, 3, 6, 9, 12, 15, 18, 21].map((beat) => ({ beat, kind: 'pop' as SfxKind })), { beat: 9, kind: 'whoosh' }],
  },
  // the realtor joke: a deadpan apartment tour, no broker fee
  'apartment-tour': {
    id: 'apartment-tour',
    layout: 'portrait',
    shots: [
      { mode: 'tall', src: 'tall-apartment.mp4', at: 0.3, beats: 3, cx: 0.45, hook: 'Touring apartments in *Manhattan*. No broker fee' },
      { mode: 'tall', src: 'tall-apartment.mp4', at: 1.6, beats: 2, cx: 0.35, pan: 0.6, hook: 'exposed *brick*', zoom: [1.08, 1.14] },
      { mode: 'tall', src: 'tall-loft.mp4', at: 0.3, beats: 3, cx: 0.3, pan: 0.5, hook: 'the loft: a *spiral staircase*', place: 'The Loft' },
      { mode: 'tall', src: 'tall-penthouse.mp4', at: 0.3, beats: 3, cx: 0.55, hook: 'the penthouse: *the view*', place: 'The Penthouse' },
      { mode: 'tall', src: 'tall-penthouse.mp4', at: 2.6, beats: 3, cx: 0.55, hook: 'you *will* dance in it' },
      { beats: 2 },
    ],
    end: { title: 'Move in, decorate, host', line: 'Link in bio' },
    sfx: [{ beat: 0, kind: 'pop' }, { beat: 3, kind: 'pop' }, { beat: 5, kind: 'whoosh' }, { beat: 8, kind: 'coin' }, { beat: 11, kind: 'pop' }, { beat: 14, kind: 'pop' }],
  },
  // comment bait: two places at once, people pick one in the comments
  'this-or-that': {
    id: 'this-or-that',
    layout: 'portrait',
    shots: [
      { mode: 'stack', src: 'tall-central-park.mp4', at: 0.3, cx: 0.47, place: 'Central Park', b: { src: 'tall-high-line.mp4', at: 0.3, cx: 0.42, place: 'The High Line' }, beats: 3, hook: '*Pick one.* Comment it' },
      { mode: 'stack', src: 'tall-the-met.mp4', at: 0.3, cx: 0.5, place: 'The Met', b: { src: 'tall-broadway.mp4', at: 2.4, cx: 0.5, place: 'Broadway' }, beats: 3 },
      { mode: 'stack', src: 'tall-brooklyn-bridge.mp4', at: 0.3, cx: 0.47, place: 'Brooklyn Bridge', b: { src: 'tall-liberty-island.mp4', at: 0.3, cx: 0.62, place: 'Liberty Island' }, beats: 3 },
      { mode: 'stack', src: 'tall-empire-deck.mp4', at: 0.3, cx: 0.24, place: 'Empire State', b: { src: 'tall-sky-deck.mp4', at: 0.3, cx: 0.5, place: 'Sky Deck' }, beats: 3 },
      { beats: 4 },
    ],
    end: { title: 'Wrong answers only', line: 'Comment yours' },
    sfx: [{ beat: 0, kind: 'pop' }, { beat: 3, kind: 'whoosh' }, { beat: 6, kind: 'whoosh' }, { beat: 9, kind: 'whoosh' }, { beat: 12, kind: 'pop' }],
  },
  // the city list, full bleed
  'tour-tall': {
    id: 'tour-tall',
    layout: 'portrait',
    shots: [
      { mode: 'tall', src: 'tall-grand-central.mp4', at: 0.3, beats: 2, cx: 0.5, hook: 'Manhattan in *ten seconds*', place: 'Grand Central' },
      { mode: 'tall', src: 'tall-the-met.mp4', at: 0.3, beats: 2, cx: 0.5, place: 'The Met' },
      { mode: 'tall', src: 'tall-rockefeller.mp4', at: 0.3, beats: 2, cx: 0.48, place: 'Rockefeller Center' },
      { mode: 'tall', src: 'tall-brooklyn-bridge.mp4', at: 0.3, beats: 2, cx: 0.47, place: 'Brooklyn Bridge' },
      { mode: 'tall', src: 'tall-liberty-island.mp4', at: 0.3, beats: 2, cx: 0.62, place: 'Liberty Island' },
      { mode: 'tall', src: 'tall-empire-deck.mp4', at: 0.3, beats: 2, cx: 0.24, place: 'Empire State' },
      { mode: 'tall', src: 'tall-wall-street.mp4', at: 0.3, beats: 2, cx: 0.66, place: 'Wall Street' },
      { beats: 2 },
    ],
    end: { title: 'Every room is walkable', line: 'Link in bio' },
    sfx: [0, 2, 4, 6, 8, 10, 12, 14].map((beat) => ({ beat, kind: 'pop' as const })),
  },
  // the flash mob, close on the dancers (flashmob.mp4 is 2560 wide too)
  'flash-mob': {
    id: 'flash-mob',
    layout: 'portrait',
    shots: [
      { mode: 'tall', src: 'flashmob.mp4', at: 1.0, beats: 3, cx: 0.5, hook: 'Start dancing in *Central Park*', zoom: [1.05, 1.1] },
      { mode: 'tall', src: 'flashmob.mp4', at: 6.0, beats: 3, cx: 0.35, pan: 0.6, hook: 'the locals *drop everything*' },
      { mode: 'tall', src: 'flashmob.mp4', at: 12.0, beats: 3, cx: 0.55, hook: 'that is a *flash mob*', place: 'Central Park' },
      { mode: 'tall', src: 'tall-penthouse.mp4', at: 2.6, beats: 3, cx: 0.55, hook: 'also works on a *rooftop*', place: 'The Penthouse' },
      { mode: 'tall', src: 'tall-broadway.mp4', at: 2.6, beats: 2, cx: 0.5, hook: 'and *on Broadway*' },
      { beats: 2 },
    ],
    end: { title: 'Press D. Anywhere.', line: 'Link in bio' },
    sfx: [{ beat: 0, kind: 'pop' }, { beat: 3, kind: 'whoosh' }, { beat: 6, kind: 'pop' }, { beat: 9, kind: 'whoosh' }, { beat: 12, kind: 'pop' }, { beat: 14, kind: 'pop' }],
  },
  // the nostalgia hook, full bleed
  // the story pass (docs/marketing/story-research.md): a real photo above the same place in the game. Photos are public
  // domain or CC0 (public/posts/real/credits.json); every Club NYC line is something the game really does
  'real-vs-club': {
    id: 'real-vs-club',
    layout: 'portrait',
    shots: [
      { mode: 'real', src: 'tall-central-park.mp4', at: 0.3, beats: 3, cx: 0.5, hook: 'Real New York vs *Club NYC*', photo: { src: 'real/bow-bridge.jpg', pos: '50% 62%', credit: 'Photo: Pierre Blaché · CC0' } },
      { mode: 'real', src: 'tall-grand-central.mp4', at: 0.3, beats: 3, cx: 0.5, hook: 'Meet me at *the clock*', photo: { src: 'real/grand-central-wide.jpg', pos: '50% 58%', credit: 'Photo: D. Benjamin Miller · CC0' } },
      { mode: 'real', src: 'tall-brooklyn-bridge.mp4', at: 0.3, beats: 3, cx: 0.36, hook: 'Brooklyn? *Coming soon*', photo: { src: 'real/brooklyn-bridge.jpg', pos: '50% 60%', credit: 'Photo: Matthew Henry · CC0' } },
      { mode: 'real', src: 'tall-apartment.mp4', at: 0.3, beats: 3, cx: 0.5, hook: 'Rent: *0 coins*', photo: { src: 'real/fire-escapes.jpg', pos: '50% 40%', credit: 'Photo: Carol M. Highsmith · Library of Congress' } },
      { beats: 4 },
    ],
    end: { title: 'Only one has free rent', line: 'Opens Nov 17' },
    sfx: [{ beat: 0, kind: 'pop' }, { beat: 3, kind: 'whoosh' }, { beat: 6, kind: 'pop' }, { beat: 9, kind: 'coin' }, { beat: 12, kind: 'stamp' }],
  },
  'then-and-now': {
    id: 'then-and-now',
    layout: 'portrait',
    shots: [
      { mode: 'real', src: 'tall-grand-central.mp4', at: 0.3, beats: 3, cx: 0.5, place: 'Club NYC, 2026', hook: 'Same city, *85 years apart*', photo: { src: 'real/grand-central-1941-crop.jpg', pos: '50% 42%', label: 'Grand Central, 1941', credit: 'Photo: John Collier Jr. · Library of Congress' } },
      { mode: 'real', src: 'tall-central-park.mp4', at: 0.3, beats: 3, cx: 0.5, place: 'Club NYC, 2026', hook: 'Still the best *curve* in the park', photo: { src: 'real/bow-bridge-1870-crop.jpg', pos: '50% 50%', label: 'Bow Bridge, 1800s', credit: 'Photo: W. M. Chase · public domain' } },
      { mode: 'real', src: 'job-ferry-captain.mp4', at: 2.4, beats: 3, cx: 0.45, place: 'Club NYC, 2026', hook: 'Free since 1997. *Ours, you drive*', photo: { src: 'real/ferry-1973.jpg', pos: '50% 62%', label: 'The ferry, 1973', credit: 'Photo: Wil Blanche · National Archives' } },
      { mode: 'real', src: 'hero-times-square.mp4', at: 0.3, beats: 3, cx: 0.3, place: 'Club NYC, 2026', hook: 'Some of the *pigeons* still work here', photo: { src: 'real/pigeons-1943-crop.jpg', pos: '50% 66%', label: 'Pigeons, 1943', credit: 'Photo: John Vachon · Library of Congress' } },
      { beats: 4 },
    ],
    end: { title: 'The good parts stay', line: 'Link in bio' },
    sfx: [{ beat: 0, kind: 'pop' }, { beat: 3, kind: 'whoosh' }, { beat: 6, kind: 'pop' }, { beat: 9, kind: 'whoosh' }, { beat: 12, kind: 'stamp' }],
  },
  // the story film: the penguin generation grew up into an expensive, scattered, lonely city (real photos, in grey),
  // then the cut to the game in colour. The rent line is StreetEasy's Manhattan median asking rent, Sept 2026
  'move-to-ny': {
    id: 'move-to-ny',
    layout: 'portrait',
    beats: 32,
    shots: [
      { mode: 'tall', src: 'creator.mp4', at: 0.3, beats: 3, cx: 0.15, hook: 'Remember the *penguin* game?', zoom: [1.02, 1.06] },
      { mode: 'tall', src: 'crowd.mp4', at: 5.6, beats: 3, cx: 0.5, hook: 'After school, *everyone* was there.' },
      { mode: 'photo', beats: 4, hook: 'Then we grew up. Rent got *weird*.', chip: 'Manhattan median: $4,995 a month', photo: { src: 'real/fire-escapes.jpg', pos: '50% 50%', mono: true, credit: 'Photo: Carol M. Highsmith · Library of Congress' } },
      { mode: 'photo', beats: 3, hook: 'Friends moved to *other cities*.', photo: { src: 'real/brooklyn-bridge.jpg', pos: '50% 50%', mono: true, credit: 'Photo: Matthew Henry · CC0' } },
      { mode: 'photo', beats: 3, hook: '8 million neighbors. *No plans*.', photo: { src: 'real/grand-central-1941-crop.jpg', pos: '25% 50%', mono: true, credit: 'Photo: John Collier Jr., 1941 · Library of Congress' } },
      { mode: 'tall', src: 'tall-grand-central.mp4', at: 0.3, beats: 3, cx: 0.5, hook: 'So we built the city *back*.' },
      { mode: 'tall', src: 'tall-apartment.mp4', at: 0.3, beats: 2, cx: 0.5, hook: 'Rent: *0 coins*.' },
      { mode: 'tall', src: 'jam.mp4', at: 5.5, beats: 3, cx: 0.48, hook: 'Your friends: *one link* away.' },
      { mode: 'tall', src: 'party.mp4', at: 1.2, beats: 4, cx: 0.5, hook: 'Move to New York. *Bring everyone*.' },
      { beats: 4 },
    ],
    end: { title: 'Same crew. Bigger city.', line: 'Opens Nov 17 · Link in bio' },
    sfx: [
      { beat: 0, kind: 'pop' },
      { beat: 3, kind: 'pop' },
      { beat: 6, kind: 'thud' },
      { beat: 10, kind: 'thud' },
      { beat: 13, kind: 'thud' },
      { beat: 15, kind: 'riser' },
      { beat: 16, kind: 'crash' },
      { beat: 19, kind: 'coin' },
      { beat: 21, kind: 'pop' },
      { beat: 24, kind: 'whoosh' },
      { beat: 28, kind: 'stamp' },
    ],
  },
  'grew-up-tall': {
    id: 'grew-up-tall',
    layout: 'portrait',
    shots: [
      { mode: 'tall', src: 'creator.mp4', at: 0.3, beats: 3, cx: 0.15, hook: 'POV: the *penguin* game you played after school', zoom: [1.02, 1.06] },
      { mode: 'tall', src: 'tall-liberty-island.mp4', at: 0.3, beats: 3, cx: 0.62, hook: 'grew up', place: 'Liberty Island' },
      { mode: 'tall', src: 'tall-empire-deck.mp4', at: 0.3, beats: 3, cx: 0.24, hook: 'moved to *Manhattan*', place: 'Empire State' },
      { mode: 'tall', src: 'tall-subway.mp4', at: 0.3, beats: 3, cx: 0.5, hook: 'takes the *subway* now', place: 'Subway' },
      { mode: 'tall', src: 'tall-broadway.mp4', at: 2.6, beats: 2, cx: 0.5, hook: 'still *dances* though' },
      { beats: 2 },
    ],
    end: { line: 'Link in bio' },
    sfx: [{ beat: 0, kind: 'pop' }, { beat: 3, kind: 'pop' }, { beat: 6, kind: 'whoosh' }, { beat: 9, kind: 'pop' }, { beat: 12, kind: 'pop' }, { beat: 14, kind: 'pop' }],
  },
  // the jobs, two at a time
  'jobs-stack': {
    id: 'jobs-stack',
    layout: 'portrait',
    shots: [
      { mode: 'stack', src: 'job-slice-factory.mp4', at: 1.0, cx: 0.5, place: 'Slice Factory', b: { src: 'job-bagel-counters.mp4', at: 4.0, cx: 0.45, place: 'Bagel Counter' }, beats: 4, hook: 'Five jobs. *Zero rent*' },
      { mode: 'stack', src: 'job-halal-rush.mp4', at: 1.5, cx: 0.5, place: 'Halal Rush', b: { src: 'job-showtime.mp4', at: 1.0, cx: 0.5, place: 'Showtime' }, beats: 4, hook: 'pays in *coins*' },
      { mode: 'tall', src: 'job-ferry-captain.mp4', at: 2.0, beats: 4, cx: 0.3, pan: 0.42, hook: 'you can drive *the ferry*', place: 'Ferry Captain' },
      { beats: 4 },
    ],
    end: { title: 'Which one are you taking?', line: 'Link in bio' },
    sfx: [{ beat: 0, kind: 'pop' }, { beat: 2, kind: 'coin' }, { beat: 4, kind: 'whoosh' }, { beat: 6, kind: 'coin' }, { beat: 8, kind: 'pop' }, { beat: 12, kind: 'pop' }],
  },
  // the creator in fourteen seconds: the "this could be you" reel
  'make-you': {
    id: 'make-you',
    shots: [
      { src: 'creator.mp4', at: 0.3, beats: 4, hook: 'Make your *New Yorker*', zoom: [1.3, 1.38], origin: '8% 55%', place: 'Make your New Yorker' },
      { src: 'creator.mp4', at: 2.8, beats: 3, hook: 'pick your *colour*', zoom: [1.3, 1.38], origin: '8% 55%' },
      { src: 'map.mp4', at: 0.3, beats: 3, hook: 'pick a *neighbourhood*', zoom: [1.04, 1.1], place: 'The map' },
      { src: 'hero-grand-central.mp4', at: 0.3, beats: 2, hook: 'and *walk in*', zoom: [1.04, 1.1], place: 'Grand Central' },
      { src: 'stampbook.mp4', at: 0.05, beats: 2, hook: 'first *stamp* in a minute', zoom: [1.12, 1.18], place: 'Stamp Book' },
      { beats: 2 },
    ],
    end: { title: 'Under a minute to the city', line: 'Link in bio' },
    sfx: [
      { beat: 0, kind: 'pop' },
      { beat: 4, kind: 'pop' },
      { beat: 7, kind: 'whoosh' },
      { beat: 10, kind: 'pop' },
      { beat: 12, kind: 'stamp' },
      { beat: 14, kind: 'pop' },
    ],
  },
}
