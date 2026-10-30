import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { config } from './config.ts'

/**
 * Persistence. SQLite (built into Node) for a zero-setup single server; the SQL is plain enough to
 * move to Postgres when the game outgrows one machine (see docs/multiplayer.md).
 */
export const db = new DatabaseSync(config.dbPath)
db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;`)

const MIGRATIONS = [
  `CREATE TABLE users (
     id TEXT PRIMARY KEY,
     name TEXT UNIQUE COLLATE NOCASE,
     created_at INTEGER NOT NULL,
     last_seen INTEGER,
     is_guest INTEGER NOT NULL DEFAULT 1,
     profile_done INTEGER NOT NULL DEFAULT 0,
     look TEXT,
     team TEXT,
     title TEXT,
     save TEXT,
     save_updated INTEGER
   );
   CREATE TABLE identities (
     provider TEXT NOT NULL,
     subject TEXT NOT NULL,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     email TEXT,
     display TEXT,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (provider, subject)
   );
   CREATE INDEX identities_user ON identities(user_id);
   CREATE TABLE sessions (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL,
     expires_at INTEGER NOT NULL
   );
   CREATE INDEX sessions_user ON sessions(user_id);
   CREATE TABLE friends (
     a TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     b TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     status TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (a, b)
   );
   CREATE INDEX friends_b ON friends(b);
   CREATE TABLE blocks (a TEXT NOT NULL, b TEXT NOT NULL, PRIMARY KEY (a, b));
   CREATE TABLE scores (
     game TEXT NOT NULL,
     week TEXT NOT NULL,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     best INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     PRIMARY KEY (game, week, user_id)
   );
   CREATE INDEX scores_rank ON scores(game, week, best DESC);
   CREATE TABLE team_points (
     week TEXT NOT NULL,
     team TEXT NOT NULL,
     user_id TEXT NOT NULL,
     points INTEGER NOT NULL,
     PRIMARY KEY (week, team, user_id)
   );
   CREATE TABLE game_runs (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL,
     game TEXT NOT NULL,
     started_at INTEGER NOT NULL,
     finished_at INTEGER
   );
   CREATE INDEX game_runs_user ON game_runs(user_id, started_at);
   CREATE TABLE reports (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     reporter TEXT NOT NULL,
     target TEXT NOT NULL,
     reason TEXT NOT NULL,
     context TEXT,
     created_at INTEGER NOT NULL
   );`,
  // v2: apartments are social — guestbooks and likes between real players
  `CREATE TABLE guestbook (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     author TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     text TEXT NOT NULL,
     created_at INTEGER NOT NULL,
     read INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX guestbook_owner ON guestbook(owner, created_at DESC);
   CREATE TABLE likes (
     owner TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     liker TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at INTEGER NOT NULL,
     PRIMARY KEY (owner, liker)
   );`,
  // v3: all-time bests live alongside the weekly boards as week 'all'
  `INSERT OR IGNORE INTO scores (game, week, user_id, best, updated_at)
     SELECT game, 'all', user_id, MAX(best), MAX(updated_at) FROM scores WHERE week != 'all' GROUP BY game, user_id;`,
  // v4: launch — a server-side wallet, moderation, invites, member numbers
  `ALTER TABLE users ADD COLUMN coins INTEGER;
   ALTER TABLE users ADD COLUMN owned TEXT;
   ALTER TABLE users ADD COLUMN homes TEXT;
   ALTER TABLE users ADD COLUMN member_no INTEGER;
   ALTER TABLE users ADD COLUMN age_ok INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE users ADD COLUMN invited_by TEXT;
   ALTER TABLE users ADD COLUMN play_ms INTEGER NOT NULL DEFAULT 0;
   ALTER TABLE users ADD COLUMN banned_until INTEGER;
   ALTER TABLE users ADD COLUMN ban_reason TEXT;
   ALTER TABLE users ADD COLUMN muted_until INTEGER;
   ALTER TABLE users ADD COLUMN mute_reason TEXT;
   ALTER TABLE users ADD COLUMN name_reset INTEGER NOT NULL DEFAULT 0;
   CREATE UNIQUE INDEX users_member_no ON users(member_no);
   CREATE INDEX users_invited_by ON users(invited_by);
   CREATE TABLE ledger (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     delta INTEGER NOT NULL,
     reason TEXT NOT NULL,
     ref TEXT,
     day TEXT NOT NULL,
     balance INTEGER NOT NULL,
     at INTEGER NOT NULL
   );
   CREATE INDEX ledger_user ON ledger(user_id, at);
   CREATE INDEX ledger_day ON ledger(user_id, reason, day);
   CREATE UNIQUE INDEX ledger_once ON ledger(user_id, reason, ref) WHERE ref IS NOT NULL;
   CREATE TABLE referrals (
     invitee TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
     inviter TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     at INTEGER NOT NULL,
     paid_at INTEGER
   );
   CREATE INDEX referrals_inviter ON referrals(inviter, paid_at);
   CREATE TABLE chat_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id TEXT NOT NULL,
     room TEXT NOT NULL,
     text TEXT NOT NULL,
     at INTEGER NOT NULL
   );
   CREATE INDEX chat_log_user ON chat_log(user_id, at);
   CREATE INDEX chat_log_at ON chat_log(at);
   ALTER TABLE reports ADD COLUMN status TEXT NOT NULL DEFAULT 'open';
   ALTER TABLE reports ADD COLUMN resolved_at INTEGER;
   ALTER TABLE reports ADD COLUMN resolution TEXT;
   CREATE INDEX reports_status ON reports(status, created_at);
   CREATE INDEX reports_target ON reports(target, created_at);
   CREATE TABLE mod_actions (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     target TEXT NOT NULL,
     action TEXT NOT NULL,
     reason TEXT,
     minutes INTEGER,
     by TEXT NOT NULL,
     report_id INTEGER,
     at INTEGER NOT NULL
   );
   CREATE INDEX mod_actions_target ON mod_actions(target, at);
   CREATE TABLE client_errors (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id TEXT,
     message TEXT NOT NULL,
     stack TEXT,
     url TEXT,
     ua TEXT,
     at INTEGER NOT NULL
   );
   CREATE INDEX client_errors_at ON client_errors(at);
   UPDATE users SET member_no = (
     SELECT COUNT(*) FROM users u2 WHERE u2.profile_done = 1 AND (u2.created_at < users.created_at OR (u2.created_at = users.created_at AND u2.id <= users.id))
   ) WHERE profile_done = 1;`,
  // v5: growth numbers on the dashboard (who joined which day, who came back) read the ledger by reason and day
  `CREATE INDEX ledger_reason_day ON ledger(reason, day, user_id);`,
  // v6: onboarding funnel (which creator steps people reach, how long it takes): a fixed list of event names
  `CREATE TABLE events (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     session TEXT NOT NULL,
     user_id TEXT,
     ms INTEGER,
     detail TEXT,
     at INTEGER NOT NULL
   );
   CREATE INDEX events_name_at ON events(name, at);`,
  // v7: consent: which version of the Terms / Privacy Policy / Community Rules each player agreed to, and when
  // (a player's age is checked at sign-up from their birth month and year, which are never stored)
  `ALTER TABLE users ADD COLUMN consent_version TEXT;
   ALTER TABLE users ADD COLUMN consent_at INTEGER;`,
  // v8: each accepted shift's score (Slice Factory: pizzas made), so the landing page can count the whole city's pizzas
  `ALTER TABLE game_runs ADD COLUMN score INTEGER;`,
  // v9: the launch waitlist (landing page "coming soon" mode): one row per email, lowercased
  `CREATE TABLE waitlist (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     email TEXT NOT NULL UNIQUE,
     source TEXT,
     referrer TEXT,
     confirm_hash TEXT,
     confirmed_at INTEGER,
     notified_at INTEGER,
     unsubscribed_at INTEGER,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX waitlist_created ON waitlist(created_at);`,
  // v10: levels: XP only goes up (users.xp is the running total; xp_log says where every point came from)
  `ALTER TABLE users ADD COLUMN xp INTEGER NOT NULL DEFAULT 0;
   CREATE TABLE xp_log (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user_id TEXT NOT NULL,
     amount INTEGER NOT NULL,
     reason TEXT NOT NULL,
     ref TEXT,
     day TEXT NOT NULL,
     at INTEGER NOT NULL
   );
   CREATE INDEX xp_log_user_day ON xp_log(user_id, day, reason);
   CREATE UNIQUE INDEX xp_log_once ON xp_log(user_id, reason, ref) WHERE ref IS NOT NULL;`,
  // v11: multiplayer mini-games: one row per match, one per player in it (weekly boards, history, XP)
  `CREATE TABLE mp_matches (
     id TEXT PRIMARY KEY,
     game TEXT NOT NULL,
     room TEXT NOT NULL,
     mode TEXT,
     players INTEGER NOT NULL,
     started_at INTEGER NOT NULL,
     ended_at INTEGER,
     data TEXT
   );
   CREATE INDEX mp_matches_game ON mp_matches(game, ended_at);
   CREATE TABLE mp_results (
     match_id TEXT NOT NULL,
     user_id TEXT NOT NULL,
     game TEXT NOT NULL,
     place INTEGER NOT NULL,
     score INTEGER NOT NULL,
     team TEXT,
     won INTEGER NOT NULL DEFAULT 0,
     day TEXT NOT NULL,
     week TEXT NOT NULL,
     at INTEGER NOT NULL,
     PRIMARY KEY (match_id, user_id)
   );
   CREATE INDEX mp_results_board ON mp_results(game, week, user_id);
   CREATE INDEX mp_results_user ON mp_results(user_id, at);`,
  // v12: email sign-in: one-time links (only a hash of the token is stored); an email identity lives in identities
  `CREATE TABLE email_logins (
     token_hash TEXT PRIMARY KEY,
     email TEXT NOT NULL,
     guest_id TEXT,
     expires_at INTEGER NOT NULL,
     used_at INTEGER,
     created_at INTEGER NOT NULL
   );
   CREATE INDEX email_logins_email ON email_logins(email, created_at);`,
  // v13: the waitlist claims a username ("Claim your name"): held for that email until launch, then given to the
  // account the launch email's "Claim" button signs into. Unique among waitlist rows (any case).
  `ALTER TABLE waitlist ADD COLUMN name TEXT;
   ALTER TABLE waitlist ADD COLUMN claimed_at INTEGER;
   CREATE UNIQUE INDEX waitlist_name ON waitlist(name COLLATE NOCASE) WHERE name IS NOT NULL;`,
  // v14: Launch HQ's switch (when the city opens, set from the page; what was done at the opening) and the Founder
  // badge (players who were in before the city opened, and waitlisters who come in afterwards)
  `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, at INTEGER NOT NULL);
   ALTER TABLE users ADD COLUMN founder_at INTEGER;`,
  // v15: keep only what's needed. Funnel events are counted per visit, so they no longer name the account; crash
  // reports keep the page's path but not what followed the ? (it can hold a preview code or a sign-in token)
  `UPDATE events SET user_id = NULL;
   UPDATE client_errors SET url = substr(url, 1, instr(url, '?') - 1) WHERE instr(url, '?') > 0;`,
]

function migrate() {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  let v = row.user_version
  while (v < MIGRATIONS.length) {
    db.exec('BEGIN')
    try {
      db.exec(MIGRATIONS[v])
      v++
      db.exec(`PRAGMA user_version = ${v}`)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  }
}
migrate()

// ---------- tiny query helpers with statement caching ----------
const cache = new Map<string, ReturnType<DatabaseSync['prepare']>>()
const st = (sql: string) => {
  let s = cache.get(sql)
  if (!s) {
    s = db.prepare(sql)
    cache.set(sql, s)
  }
  return s
}
export const q = {
  get: <T>(sql: string, ...args: SQLInputValue[]) => st(sql).get(...args) as T | undefined,
  all: <T>(sql: string, ...args: SQLInputValue[]) => st(sql).all(...args) as T[],
  run: (sql: string, ...args: SQLInputValue[]) => st(sql).run(...args),
}

/** A transaction; nested calls become savepoints, so an inner failure only undoes its own writes. */
let depth = 0
export function tx<T>(fn: () => T): T {
  const sp = `sp${depth}`
  db.exec(depth === 0 ? 'BEGIN' : `SAVEPOINT ${sp}`)
  depth++
  try {
    const r = fn()
    depth--
    db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${sp}`)
    return r
  } catch (e) {
    depth--
    db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`)
    throw e
  }
}

// ---------- row types ----------
export interface UserRow {
  id: string
  name: string | null
  created_at: number
  last_seen: number | null
  is_guest: number
  profile_done: number
  look: string | null
  team: string | null
  title: string | null
  save: string | null
  save_updated: number | null
  coins: number | null
  owned: string | null
  homes: string | null
  member_no: number | null
  age_ok: number
  /** the policy version (app/src/data/policy.ts) this player agreed to, and when */
  consent_version: string | null
  consent_at: number | null
  invited_by: string | null
  play_ms: number
  banned_until: number | null
  ban_reason: string | null
  muted_until: number | null
  mute_reason: string | null
  name_reset: number
  /** total XP (app/src/data/levels.ts turns it into a level and a title) */
  xp: number
  /** when they got the Founder badge (in before the city opened, or on the waitlist); null for everyone else */
  founder_at: number | null
}

export const publicUser = (u: UserRow) => ({
  id: u.id,
  name: u.name ?? '',
  look: u.look ? JSON.parse(u.look) : null,
  team: u.team ?? '',
  title: u.title ?? '',
  memberSince: new Date(u.created_at).toISOString().slice(0, 10),
  memberNo: u.member_no ?? 0,
  xp: u.xp ?? 0,
  founder: !!u.founder_at,
})
