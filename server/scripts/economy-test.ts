/**
 * Self-test for the coin wallet's ceilings in src/economy.ts, on a throwaway database in the OS temp dir
 * (the real data/club-nyc.db is never opened). Checks the per-reason caps, the per-day ceilings for things
 * that repeat all day (coins on the ground, Dance Jam tips), the ceiling over all of a day's claims, and
 * the ceiling on shift pay — and that yesterday's earnings and server payouts (referrals) don't count —
 * plus the weekly visits (the daily refill grows with the days you drop by in a Monday–Sunday week; never a
 * punishing streak), counted from the ledger — and the dashboard's growth numbers (who came back, and when).
 *   npx tsx scripts/economy-test.ts        (from server/)
 */
import { strict as assert } from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'club-nyc-economy-'))
process.env.DB_PATH = join(dir, 'economy.db')
const { q, db } = await import('../src/db.ts')
const { claim, payJob, payout, walletOf, daysThisWeek, daysVisited } = await import('../src/economy.ts')
const { DAILY_CAPS, EARN, WEEKLY_VISITS, nycDay, prevDay, weekStart, visitReward } = await import('../../app/src/data/economy.ts')
const { growthNow } = await import('../src/growth.ts')

let n = 0
const user = () => {
  const id = `test-${++n}`
  q.run('INSERT INTO users (id, name, created_at, is_guest, profile_done) VALUES (?, ?, ?, 0, 1)', id, `Tester${n}`, Date.now())
  walletOf(id)
  return id
}
/** pretend earnings: `count` ledger rows, `ago` ms in the past, on `day` */
const fake = (id: string, reason: string, delta: number, count = 1, ago = 2 * 3600_000, day = nycDay()) => {
  for (let i = 0; i < count; i++) q.run('INSERT INTO ledger (user_id, delta, reason, ref, day, balance, at) VALUES (?, ?, ?, NULL, ?, 0, ?)', id, delta, reason, day, Date.now() - ago)
}
const yesterday = nycDay(Date.now() - 86400_000)
let passed = 0
const check = (name: string, fn: () => void) => {
  fn()
  passed++
  console.log(`  ✓ ${name}`)
}

try {
  console.log('economy ceilings')

  check('daily refill pays once a day', () => {
    const u = user()
    assert.equal(claim(u, 'daily').ok, true)
    assert.equal(claim(u, 'daily').error, 'cap')
  })

  check('coins on the ground: 60 an hour', () => {
    const u = user()
    for (let i = 0; i < 60; i++) assert.equal(claim(u, 'coin').ok, true, `coin ${i + 1}`)
    assert.equal(claim(u, 'coin').error, 'cap')
  })

  check(`coins on the ground: ${EARN.coin.perDay} a day, even spread over hours`, () => {
    const u = user()
    fake(u, 'coin', 1, EARN.coin.perDay - 1)
    assert.equal(claim(u, 'coin').ok, true)
    assert.equal(claim(u, 'coin').error, 'cap')
  })

  check(`all claims together: ${DAILY_CAPS.claims} a day`, () => {
    const u = user()
    fake(u, 'challenge', 10, (DAILY_CAPS.claims - 10) / 10) // all but the last 10 coins
    assert.equal(claim(u, 'daily').ok, true) // 600
    assert.equal(claim(u, 'golden-gumball').error, 'daily-cap')
  })

  check('yesterday’s claims and server payouts don’t count toward today', () => {
    const u = user()
    fake(u, 'challenge', DAILY_CAPS.claims, 1, 30 * 3600_000, yesterday)
    payout(u, 1000, 'referral', 'friend-1')
    assert.equal(claim(u, 'daily').ok, true)
  })

  check(`shift pay: ${DAILY_CAPS.jobs} a day, the last run paid partly`, () => {
    const u = user()
    const before = walletOf(u)!.coins
    assert.equal(payJob(u, 1000, 'run-1').paid, 1000)
    const r = payJob(u, 1000, 'run-2')
    assert.equal(r.paid, DAILY_CAPS.jobs - 1000)
    const capped = payJob(u, 10, 'run-3')
    assert.equal(capped.paid, 0)
    assert.equal(capped.error, 'daily-cap')
    assert.equal(walletOf(u)!.coins, before + DAILY_CAPS.jobs)
  })

  check('shift pay: each run pays once', () => {
    const u = user()
    assert.equal(payJob(u, 40, 'run-a').paid, 40)
    assert.equal(payJob(u, 40, 'run-a').error, 'already')
  })

  check('shift pay: yesterday’s shifts don’t count toward today', () => {
    const u = user()
    fake(u, 'job', DAILY_CAPS.jobs, 1, 30 * 3600_000, yesterday)
    assert.equal(payJob(u, 200, 'run-b').paid, 200)
  })

  const dailyOn = (id: string, ...days: string[]) => days.forEach((d) => fake(id, 'daily', 10, 1, 30 * 3600_000, d))

  check('weeks start on Monday, New York time (daylight-saving safe)', () => {
    assert.equal(weekStart('2026-10-17'), '2026-10-12') // Saturday
    assert.equal(weekStart('2026-10-18'), '2026-10-12') // Sunday is the last day of the week
    assert.equal(weekStart('2026-10-12'), '2026-10-12') // Monday
    assert.equal(weekStart('2026-11-03'), '2026-11-02') // the day after the clocks change
    assert.equal(weekStart('2027-01-01'), '2026-12-28') // across a new year
    assert.equal(prevDay('2027-03-15'), '2027-03-14')
  })

  check('the refill grows 10 → 40 over the days you drop by in a week', () => {
    assert.deepEqual([1, 2, 3, 7, 9].map(visitReward), [10, 15, 20, 40, 40])
    assert.equal(visitReward(1), WEEKLY_VISITS.base)
  })

  check('days this week: a missed day takes nothing away, and next week starts fresh', () => {
    const u = user()
    dailyOn(u, '2026-10-12', '2026-10-14') // Monday, Wednesday (skipped Tuesday)
    assert.equal(daysThisWeek(u, '2026-10-13'), 1)
    assert.equal(daysThisWeek(u, '2026-10-16'), 2) // Friday: still 2, nothing lost for skipping
    assert.equal(daysThisWeek(u, '2026-10-19'), 0) // next Monday
    assert.equal(daysVisited(u), 2)
  })

  check('today’s refill pays for the days already dropped by this week', () => {
    const u = user()
    // the days of this week before today (none on a Monday)
    const earlier: string[] = []
    for (let d = prevDay(nycDay()); d >= weekStart(nycDay()); d = prevDay(d)) earlier.push(d)
    dailyOn(u, ...earlier.filter((_, i) => i % 2 === 0)) // every other day
    dailyOn(u, prevDay(weekStart(nycDay()))) // last week doesn't count
    const already = earlier.filter((_, i) => i % 2 === 0).length
    const r = claim(u, 'daily')
    assert.equal(r.week, already + 1)
    assert.equal(r.paid, visitReward(already + 1))
    assert.equal(r.days, already + 2)
  })

  check('dashboard growth: next-day and week-later return rates, plays today', () => {
    const daysAgo = (k: number) => {
      let d = nycDay()
      for (let i = 0; i < k; i++) d = prevDay(d)
      return d
    }
    const before = growthNow()
    // joined 3 days ago: one came back the next day, one didn't
    const a = user(), b = user()
    q.run(`UPDATE ledger SET day = ? WHERE user_id IN (?, ?) AND reason = 'start'`, daysAgo(3), a, b)
    dailyOn(a, daysAgo(3), daysAgo(2))
    dailyOn(b, daysAgo(3))
    // joined 10 days ago: one still playing a week later (today), one gone
    const c2 = user(), d2 = user()
    q.run(`UPDATE ledger SET day = ? WHERE user_id IN (?, ?) AND reason = 'start'`, daysAgo(10), c2, d2)
    dailyOn(c2, daysAgo(10))
    dailyOn(d2, daysAgo(10))
    assert.equal(claim(c2, 'daily').ok, true)
    const g = growthNow()
    assert.equal(g.nextDayPct, 50)
    assert.equal(g.weekLaterPct, 50)
    assert.equal(g.playedToday, before.playedToday + 1)
    assert.equal(before.viaInvitePct, 0) // new players this week, none invited
  })

  check('unknown reasons are refused', () => {
    const u = user()
    assert.equal(claim(u, 'free-money').error, 'unknown-reason')
  })

  console.log(`\n${passed} passed`)
} finally {
  db.close()
  rmSync(dir, { recursive: true, force: true })
}
