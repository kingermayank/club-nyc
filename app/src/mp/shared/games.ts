/**
 * Multiplayer mini-games: the catalog and the prize rules, shared by the game and the server.
 *
 * Three games, each a few minutes at most, all playable with whoever is around (or with the city locals when
 * nobody is): the High Line Citi Bike Dash (2-4, internally 'sled'), Rush Hour Run (2-9) and Carb-Jitsu (1v1, Winner Stays On for a
 * table of up to 6). The server runs every match (server/src/game/mp), decides places and pays XP and coins from
 * the tables below; the game only ever shows what the server decided. See docs/multiplayer-games.md.
 */
export type MpGameId = 'sled' | 'runner' | 'carbs'
export type MpMode = 'ffa' | 'teams'
export type MpTeam = 'up' | 'down'
export const MP_GAME_IDS: MpGameId[] = ['sled', 'runner', 'carbs']

export interface MpGameDef {
  id: MpGameId
  /** full name (headings, the sign in the room) */
  title: string
  /** short name for chips and buttons */
  short: string
  /** one line under the title (a little NYC humor is welcome here) */
  blurb: string
  /** how to play: up to three short lines, keys in <kbd> */
  how: string[]
  /** players in one match (with Winner Stays On, Carb-Jitsu seats more people at the table than play at once) */
  min: number
  max: number
  /** how many sit at one table/lobby (spectators come on top) */
  seats: number
  /** how the player count reads on a card */
  players: string
  /** room where the game's sign stands, and how the place is named */
  room: string
  place: string
  /** what "best" means on the leaderboard */
  best: { label: string; lower?: boolean; unit: string }
  /** the shortest match that can pay out (a guard against instant matches) */
  minSeconds: number
  /** title art (lobby and results backdrop) */
  art: string
  /** an emoji that has an illustrated icon (app/src/data/emojiIcons.ts) */
  icon: string
  /** teams mode is offered */
  teams: boolean
  /** the "inner experience" card: a short true story about the place and one deadpan line */
  story: { title: string; text: string }
}

export const MP_GAMES: Record<MpGameId, MpGameDef> = {
  sled: {
    // internally still "sled": the game started as a sled race on Pilgrim Hill, and saved results, leaderboards and
    // stamps keep the id. It moved to the High Line (no snow in the city), on Citi Bikes.
    id: 'sled',
    title: 'High Line Citi Bike Dash',
    short: 'Citi Bike Dash',
    blurb: 'Race your friends up the High Line on Citi Bikes, from Gansevoort St to 34th St. Dodge tour groups, planters and one runaway gelato cart.',
    how: ['<kbd>←</kbd> <kbd>→</kbd> steer', '<kbd>Space</kbd> hop over small stuff', 'Iced coffee gives you a boost'],
    min: 1,
    max: 4,
    seats: 4,
    players: '2 to 4 players',
    room: 'high-line',
    place: 'The High Line, Chelsea',
    best: { label: 'Best Time', lower: true, unit: 's' },
    minSeconds: 25,
    art: '/art/mp/bike-title.jpg',
    icon: '🚲',
    teams: true,
    story: {
      title: 'The High Line',
      text: 'Built in 1934 to lift freight trains off Tenth Avenue (New Yorkers called it Death Avenue), the High Line carried its last train in 1980: three cars of frozen turkeys. It reopened as a park in 2009, with the old rails left in the planting beds. Bikes are not allowed up here. Nobody told these racers.',
    },
  },
  runner: {
    id: 'runner',
    title: 'Rush Hour Run',
    short: 'Rush Hour Run',
    blurb: 'Sprint the platform at rush hour with up to 9 friends. Last one standing gets a seat on the train.',
    how: ['<kbd>←</kbd> <kbd>→</kbd> switch lanes', '<kbd>↑</kbd> jump · <kbd>↓</kbd> slide', 'Swipe MetroCards. Dodge everything else.'],
    min: 1,
    max: 9,
    seats: 9,
    players: '2 to 9 players',
    room: 'subway',
    place: 'Times Sq–42 St Station',
    best: { label: 'Farthest Run', unit: 'm' },
    minSeconds: 15,
    art: '/art/mp/runner-title.jpg',
    icon: '🚇',
    teams: true,
    story: {
      title: 'Rush Hour',
      text: 'More than 3 million rides happen on a typical weekday, and all of them seem to happen at 8:45 a.m. Times Sq–42 St is the busiest station in the system. Some express trains get a diamond instead of a circle, and yes, they are worth running for.',
    },
  },
  carbs: {
    id: 'carbs',
    title: 'Carb-Jitsu',
    short: 'Carb-Jitsu',
    blurb: 'Pizza beats Pretzel. Pretzel beats Bagel. Bagel beats Pizza. Settle it at the table.',
    how: ['Both players pick a card at the same time', 'Same food? The higher number wins.', 'Win 3 of one food, or one of each, from 3 boroughs'],
    min: 1,
    max: 2,
    seats: 6,
    players: '1v1 · up to 6 at a table',
    room: 'pizza',
    place: 'Joe’s Pizza, Little Italy',
    best: { label: 'Best Win Streak', unit: 'wins' },
    minSeconds: 12,
    art: '/art/mp/carbs-title.jpg',
    icon: '🍕',
    teams: false,
    story: {
      title: 'The Table Rules',
      text: 'Pizza beats Pretzel (it’s a whole meal). Pretzel beats Bagel (knots beat holes). Bagel beats Pizza (breakfast comes first). Every pizzeria in the city has one table where these arguments get settled. This is that table.',
    },
  },
}

export const MP_TEAMS: Record<MpTeam, { name: string; color: string; dark: string }> = {
  up: { name: 'Uptown', color: '#2a7bd5', dark: '#134a96' },
  down: { name: 'Downtown', color: '#f08a24', dark: '#a8520c' },
}

/** One lobby code alphabet: no 0/O, 1/I/L, so a code read out over voice chat is never ambiguous. */
export const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
export const CODE_LEN = 4
export const validCode = (s: string) => new RegExp(`^[${CODE_CHARS}]{${CODE_LEN}}$`).test(s)

/** Prize money per player per New York day from multiplayer games, together (jobs and claims have their own). */
export const MP_DAILY_COINS = 300

/**
 * Coins for one finished match, decided by the server. `humans` is how many real people played: a race against
 * the city locals alone pays a little (it's practice), a race against friends pays more. Leaving early pays nothing.
 */
export function mpCoins(o: { game: MpGameId; place: number; humans: number; mode: MpMode; teamWon?: boolean; dnf?: boolean }): number {
  if (o.dnf) return 0
  if (o.game === 'carbs') return o.humans >= 2 ? (o.place === 1 ? 15 : 5) : o.place === 1 ? 6 : 3
  if (o.humans < 2) return o.place === 1 ? 8 : 4
  if (o.mode === 'teams') return o.teamWon ? 15 : 6
  return [20, 12, 8][o.place - 1] ?? 5
}

/** Team points per place (1st of 4 gets 4): the team with more points wins, a tie goes to the team of the winner. */
export const teamPoints = (place: number, racers: number) => Math.max(1, racers - place + 1)

/** Quick reactions anyone in a lobby or match can send (voice chat does the rest). Emoji with illustrated icons. */
export const REACTIONS = ['👋', '🔥', '😂', '👏', '😮', '❤️']
/** Quick phrases (no typing, nothing to moderate). */
export const PHRASES = ['GG!', 'One more?', 'So close!', 'Nice one!', 'Rematch!', 'Wait for me!']

/** "1:02.4" / "58.3s" */
export function fmtTime(ms: number): string {
  const s = Math.max(0, ms) / 1000
  if (s < 60) return `${s.toFixed(1)}s`
  const m = Math.floor(s / 60)
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`
}

/** a game's best score, the way its leaderboard shows it */
export function fmtBest(game: MpGameId, score: number): string {
  if (game === 'sled') return score > 0 ? fmtTime(score) : '–'
  if (game === 'runner') return `${Math.round(score).toLocaleString('en-US')} m`
  return `${score} ${score === 1 ? 'win' : 'wins'}`
}

export const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
