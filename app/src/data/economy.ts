/**
 * The coin economy, shared by the game and the server.
 *
 * Coins are free and earned by playing. Online, the server owns your balance and your wardrobe:
 * every way to EARN coins is listed here with a cap, so a modified client can't print money.
 * Spending can't be abused (it only lowers your own balance), and anything you buy is checked
 * against its real price. Offline single-player keeps working exactly as before.
 */
export interface EarnRule {
  /** coins per claim (quests use QUEST_REWARDS) */
  amount: number
  /** the window `max` applies to — 'once' means once per ref, forever */
  per: 'day' | 'hour' | 'once'
  max: number
  /** claims carry a ref (quest id, jam number, stamp count…) and each ref pays once */
  ref?: boolean
  /** a second ceiling per New York day (for things that repeat all day long) */
  perDay?: number
}

export const EARN = {
  daily: { amount: 10, per: 'day', max: 1 },
  quest: { amount: 0, per: 'once', max: 1, ref: true },
  'daily-quest': { amount: 15, per: 'day', max: 3, ref: true },
  'daily-quests-done': { amount: 25, per: 'day', max: 1 },
  'stamp-bonus': { amount: 25, per: 'once', max: 1, ref: true },
  'dance-jam': { amount: 20, per: 'once', max: 1, ref: true, perDay: 8 },
  'party-host': { amount: 30, per: 'day', max: 2 },
  coin: { amount: 1, per: 'hour', max: 60, perDay: 200 },
  challenge: { amount: 10, per: 'day', max: 10 },
  'team-week': { amount: 50, per: 'once', max: 1, ref: true },
  'golden-gumball': { amount: 10, per: 'day', max: 2 },
  'candy-hunt': { amount: 50, per: 'once', max: 1 },
} satisfies Record<string, EarnRule>
export const EARN_RULES: Record<string, EarnRule> = EARN

/** New-in-Town quest rewards (social/quests.ts shows them; the server pays them). Five first-day steps (it was
 * ten; onboarding stays at 4-5 steps), paying the same 110 coins in all. */
export const QUEST_REWARDS: Record<string, number> = { walk: 10, gift: 15, friend: 30, job: 35, subway: 20 }

/** Bring-a-friend rewards. The inviter is paid once the friend has really played (not just signed up). */
export const REFERRAL = {
  /** paid to the inviter per friend who sticks around */
  reward: 100,
  /** paid to the friend when they arrive */
  welcome: 50,
  /** the friend must play this long before the inviter is paid */
  activationMs: 10 * 60_000,
  /** paid referrals per inviter per day / ever (anti-farming) */
  dailyCap: 5,
  totalCap: 50,
  /** above this many referrals, new arrivals send a friend request instead of becoming friends instantly */
  autoFriendCap: 50,
}

/** What the New Yorker creator lets you pick for free: a starter outfit plus one welcome gift. */
export const CREATOR_OUTFIT = {
  body: ['sig-hoodie', 'tee-blue', 'tee-red', 'tee-green', 'tee-yellow', 'iloveny-tee'],
  legs: ['jeans', 'shorts', 'plaid-skirt', 'sweats'],
  feet: ['sneakers', 'runners', 'boots'],
}
export const WELCOME_GIFTS = ['nyc-cap', 'nyc-beanie', 'shades', 'foam-crown', 'lanyard']

/** Ceilings per player per New York day — far above what a keen human earns, far below what a script could farm. */
export const DAILY_CAPS = {
  /** everything claimed through /wallet/earn, together */
  claims: 600,
  /** shift pay from validated job runs */
  jobs: 1500,
}

export const STARTING_COINS = 50
/** progress made offline (before an account existed) brings at most this many coins online */
export const MIGRATION_COIN_CAP = 1000

/** The game's "day" (daily rewards, daily quests) follows New York time. */
export function nycDay(now = Date.now()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
/** The calendar day before a YYYY-MM-DD day (plain date math, so daylight-saving changes can't skip one). */
export function prevDay(day: string): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) - 86400_000).toISOString().slice(0, 10)
}

/** Monday of the New York week a YYYY-MM-DD day falls in. */
export function weekStart(day: string): string {
  const t = Date.parse(`${day}T12:00:00Z`)
  return new Date(t - ((new Date(t).getUTCDay() + 6) % 7) * 86400_000).toISOString().slice(0, 10)
}

/**
 * The daily refill grows with the days you've dropped by this week (Monday to Sunday, New York time).
 * Deliberately not a streak: missing a day never takes anything away (the count just doesn't go up),
 * and the week starts fresh for everyone on Monday. (House rule: no punishing streaks, no FOMO.)
 */
export const WEEKLY_VISITS = { base: 10, step: 5 }
export const visitReward = (daysThisWeek: number) => WEEKLY_VISITS.base + WEEKLY_VISITS.step * (Math.min(Math.max(1, daysThisWeek), 7) - 1)
