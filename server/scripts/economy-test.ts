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
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'club-nyc-economy-'))
process.env.DB_PATH = join(dir, 'economy.db')
const { q, db } = await import('../src/db.ts')
const { claim, payJob, payout, walletOf, daysThisWeek, daysVisited } = await import('../src/economy.ts')
const { DAILY_CAPS, EARN, WEEKLY_VISITS, nycDay, prevDay, weekStart, visitReward } = await import('../../app/src/data/economy.ts')
const { growthNow } = await import('../src/growth.ts')
const { checkSave, FURNITURE_PRICE } = await import('../src/save.ts')
const { cleanChat } = await import('../src/game/filter.ts')
const { nameProblem, RESIDENT_NAMES } = await import('../src/game/rules.ts')
const { STAMPS } = await import('../../app/src/data/stamps.ts')
const { PAINTINGS } = await import('../../app/src/data/souvenirs.ts')
const { MIGRATION_COIN_CAP } = await import('../../app/src/data/economy.ts')
type UserRow = import('../src/db.ts').UserRow

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

  // ---------- QA fixes: stamp bonuses, what a cloud save may hold, the chat and name filter, reserved names ----------
  console.log('\nstamps, saves, filter, names')
  const rowOf = (id: string) => q.get<UserRow>('SELECT * FROM users WHERE id = ?', id)!
  const store = (id: string, save: unknown) => q.run('UPDATE users SET save = ?, save_updated = ? WHERE id = ?', JSON.stringify(save), Date.now(), id)
  const someStamps = Object.keys(STAMPS)

  check('stamp bonus: nothing for stamps the server has never seen', () => {
    const u = user()
    for (const n of [5, 10, 50, 140]) assert.equal(claim(u, 'stamp-bonus', n).ok, false, `bonus for ${n}`)
    assert.equal(claim(u, 'stamp-bonus', 5).error, 'not-earned')
    assert.equal(claim(u, 'stamp-bonus', 7).error, 'bad-ref')
  })

  check('stamp bonus: pays once for stamps in the cloud save or reported as earned', () => {
    const u = user()
    store(u, { stamps: someStamps.slice(0, 3).concat(['made-up', 'made-up-2']) })
    assert.equal(claim(u, 'stamp-bonus', 5).error, 'not-earned') // 3 real stamps: made-up ones don't count
    for (const id of someStamps.slice(3, 5)) q.run(`INSERT INTO xp_log (user_id, amount, reason, ref, day, at) VALUES (?, 25, 'stamp', ?, ?, ?)`, u, id, nycDay(), Date.now())
    assert.equal(claim(u, 'stamp-bonus', 5).ok, true) // 3 in the save + 2 reported
    assert.equal(claim(u, 'stamp-bonus', 5).error, 'already')
    assert.equal(claim(u, 'stamp-bonus', 10).error, 'not-earned')
  })

  check('a save must be an object; fields of the wrong type are dropped', () => {
    const u = rowOf(user())
    for (const junk of [[], null, 'save', 7, undefined]) assert.equal(checkSave(junk, u), null)
    const s = checkSave({ look: null, team: 7, stamps: 'all', stats: [], room: 'soho', somethingNew: { a: 1 } }, u)!
    assert.deepEqual(s, { room: 'soho', somethingNew: { a: 1 } })
  })

  check('a save keeps only stamps that exist, a real title, and the team you already picked', () => {
    const id = user()
    q.run(`UPDATE users SET team = 'uptown' WHERE id = ?`, id)
    const s = checkSave({ stamps: [someStamps[0], someStamps[0], 'made-up', 5], title: '<b>Admin</b>', team: 'harbor' }, rowOf(id))!
    assert.deepEqual(s.stamps, [someStamps[0]])
    assert.equal(s.title, '')
    assert.equal(s.team, 'uptown')
    assert.equal(checkSave({ title: someStamps[1], team: 'nowhere' }, rowOf(user()))!.title, someStamps[1])
  })

  check('furniture: what you had stays, new pieces need a purchase, made-up pieces go', () => {
    const id = user()
    store(id, { furniture: [{ id: 'sofa', x: 1, y: 2 }], storage: ['lamp'] }) // from before purchases were checked
    const piece = (pid: string) => ({ id: pid, x: 100, y: 300 })
    const want = { furniture: [piece('sofa'), piece('jukebox'), piece('jukebox'), piece('gold-throne')], storage: ['lamp', 'arcade', 'bagel-bag'], homeFurniture: { loft: [piece('arcade')] } }
    let s = checkSave(want, rowOf(id))!
    assert.deepEqual((s.furniture as { id: string }[]).map((f) => f.id), ['sofa'])
    assert.deepEqual(s.storage, ['lamp', 'bagel-bag']) // the bean bag is the game's own gift (one)
    assert.deepEqual(s.homeFurniture, { loft: [] })
    // one jukebox bought at its real price, and a 1-coin "arcade" that doesn't count
    q.run(`INSERT INTO ledger (user_id, delta, reason, ref, day, balance, at) VALUES (?, ?, 'furniture:jukebox', NULL, ?, 0, ?)`, id, -FURNITURE_PRICE.jukebox, nycDay(), Date.now())
    q.run(`INSERT INTO ledger (user_id, delta, reason, ref, day, balance, at) VALUES (?, -1, 'furniture:arcade', NULL, ?, 0, ?)`, id, nycDay(), Date.now())
    s = checkSave(want, rowOf(id))!
    assert.deepEqual((s.furniture as { id: string }[]).map((f) => f.id), ['sofa', 'jukebox'])
    assert.deepEqual(s.homeFurniture, { loft: [] })
  })

  check('furniture: a first save can carry a little from before the account, not a warehouse', () => {
    const u = rowOf(user())
    const s = checkSave({ storage: Array.from({ length: 30 }, () => 'arcade') }, u)!
    assert.equal((s.storage as string[]).length, Math.floor(MIGRATION_COIN_CAP / FURNITURE_PRICE.arcade))
  })

  check('the server’s furniture and locals lists match the game’s', () => {
    const src = (f: string) => readFileSync(new URL(`../../app/src/${f}`, import.meta.url), 'utf8')
    const apt = src('features/apartment.ts')
    const block = apt.slice(apt.indexOf('export const FURNITURE'), apt.indexOf('const FDEF'))
    const game = Object.fromEntries([...block.matchAll(/\{ id: '([\w-]+)', name: (?:'[^']*'|"[^"]*"), price: (\d+)/g)].map((m) => [m[1], Number(m[2])]))
    assert.ok(Object.keys(game).length >= 20, 'could not read FURNITURE from app/src/features/apartment.ts')
    for (const p of PAINTINGS) game[p.id] = p.price
    assert.deepEqual(FURNITURE_PRICE, game, 'update FURNITURE_PRICE in server/src/save.ts')
    const res = src('social/residents.ts')
    const names = [...res.slice(res.indexOf('const NAMES = ['), res.indexOf(']', res.indexOf('const NAMES = ['))).matchAll(/'([^']+)'/g)].map((m) => m[1])
    assert.deepEqual(RESIDENT_NAMES, names, 'update RESIDENT_NAMES in server/src/game/rules.ts')
  })

  check('filter: ordinary words, NYC places, years and coin counts pass untouched', () => {
    for (const ok of ['skyscraper', 'spicy', 'grape', 'assassin', 'class', 'Scunthorpe', 'Essex', 'cockpit', "Hell's Kitchen", 'Dyckman', 'cocktail', 'therapist', 'Niger',
      'i have 1000000 coins', 'born in 1999', '1999 - 2024', '1999 2000', 'kkkkk lol', 'Harshit and Ishita', 'meet at 5 pm, 42nd st', '2010-05-12', 'a 100 200 300 run'])
      assert.equal(cleanChat(ok), ok, ok)
  })

  check('filter: slurs, hate terms and profanity are masked, however they are dressed up', () => {
    for (const bad of ['Hitler', 'kkk', 'f u c k', 'f.u.c.k', 'fuuuuck', 'sh!t', 'shit!', 'n1gger', 'you dick', 'ShitHead', 'xXfuckXx', 'k k k', 'h1tl3r', 'a$$hole', 'kill yourself', 'nazis', 'fück'])
      assert.ok(cleanChat(bad).includes('★'), bad)
    assert.equal(cleanChat('f u c k you'), '★★★★ you')
  })

  check('filter: phone numbers, emails and links are still removed', () => {
    for (const pii of ['212-555-1234', '2125551234', '+1 (212) 555 1234', '555-1234', 'me@mail.com', 'evil.com/x'])
      assert.ok(/removed\]/.test(cleanChat(`call ${pii}`)), pii)
  })

  check('names: hate terms and profanity are refused, ordinary names are fine', () => {
    for (const bad of ['Hitler', 'kkk', 'KKK_fan', 'H1tler', 'hit1er', 'f_u_c_k', 'xXfuckXx', 'N4zi_88', 'nazilover', 'BigDick', 'shithead']) assert.ok(nameProblem(bad), bad)
    for (const ok of ['Grape', 'Sheila', 'Harshit', 'Dickens', 'Player1999', 'Essex_Girl', 'SkyScraper', 'Scunthorpe', 'Nazir', 'BagelFan42', 'Spicy_Tuna', 'Assassin']) assert.equal(nameProblem(ok), null, ok)
  })

  check('names: staff, brand and city locals can’t be claimed', () => {
    for (const taken of ['Admin', 'admin_1', 'TheAdmin', 'Moderator', 'xModeratorx', 'ClubNYC', 'Club_NYC', 'clubnyc_help', 'Rosa', 'R0sa', 'rosa_', 'Rosa2', 'Mayank', 'Staff', 'Mod', 'KnishKing', 'knish_king', 'Kn1shK1ng', 'SubwaySam', 'subwaysam7', 'BullMarketBrad', 'Liberty_Lu', 'Halal4Life', 'Official_Joe', 'Support'])
      assert.equal(nameProblem(taken), 'That name is taken.', taken)
    for (const free of ['Rosalind', 'Badminton', 'Modesto', 'Samantha', 'KnishFan', 'Bradley', 'Supporter', 'Staffordshire']) assert.equal(nameProblem(free), null, free)
  })

  console.log(`\n${passed} passed`)
} finally {
  db.close()
  rmSync(dir, { recursive: true, force: true })
}
