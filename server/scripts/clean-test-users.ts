/**
 * Remove accounts made by the load test and the QA scripts (bot_*, Ana_*, Ben_*, Perf_*) from the
 * local database, with everything that cascades from them. Real players are never matched.
 *   npx tsx scripts/clean-test-users.ts
 */
import { db, q } from '../src/db.ts'

const where = `name GLOB 'bot_*' OR name GLOB 'Ana_*' OR name GLOB 'Ben_*' OR name GLOB 'Perf_*' OR name GLOB 'Cleo_*' OR (is_guest = 1 AND profile_done = 0)`
const ids = q.all<{ id: string }>(`SELECT id FROM users WHERE ${where}`).map((r) => r.id)
db.exec('BEGIN')
for (const id of ids) {
  q.run('DELETE FROM scores WHERE user_id = ?', id)
  q.run('DELETE FROM team_points WHERE user_id = ?', id)
  q.run('DELETE FROM game_runs WHERE user_id = ?', id)
  q.run('DELETE FROM blocks WHERE a = ? OR b = ?', id, id)
  q.run('DELETE FROM reports WHERE reporter = ? OR target = ?', id, id)
  q.run('DELETE FROM users WHERE id = ?', id) // sessions, identities, friends, guestbook, likes cascade
}
db.exec('COMMIT')
console.log(`removed ${ids.length} test accounts; ${q.get<{ n: number }>('SELECT COUNT(*) AS n FROM users')!.n} remain`)
