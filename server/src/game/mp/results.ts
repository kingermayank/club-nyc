/**
 * What a finished multiplayer match leaves behind: a row in mp_matches, a row per real player in mp_results (the
 * weekly and all-time boards are read from those), XP (awardXp 'mp-game', once per match) and prize coins (payMatch,
 * once per match, within today's ceiling). City locals race but never get rows. Players who left early, matches that
 * were impossibly quick and runs the server didn't believe count for nothing (no row, no prize) and say so.
 */
import { q, tx, publicUser, type UserRow } from '../../db.ts'
import { weekId } from '../rules.ts'
import { awardXp } from '../../xp.ts'
import { payMatch, walletOf } from '../../economy.ts'
import { walletChanged } from '../realtime.ts'
import { nycDay } from '../../../../app/src/data/economy.ts'
import { mpXp } from '../../../../app/src/data/levels.ts'
import { MP_GAMES, mpCoins, type MpGameId, type MpMode, type MpTeam } from '../../../../app/src/mp/shared/games.ts'
import type { ResultsWire } from '../../../../app/src/mp/shared/protocol.ts'
import type { Standing } from './types.ts'

type You = NonNullable<ResultsWire['you']>

const lowerBetter = (g: MpGameId) => !!MP_GAMES[g].best.lower
/** the SQL for "best" in a game (sled: fastest finished time; others: the biggest number) */
const BEST = (g: MpGameId) => (lowerBetter(g) ? 'MIN(CASE WHEN r.score > 0 THEN r.score END)' : 'MAX(r.score)')

function bestOf(userId: string, game: MpGameId, week: string | null): number | null {
  const row = q.get<{ b: number | null }>(`SELECT ${BEST(game)} AS b FROM mp_results r WHERE r.user_id = ? AND r.game = ?${week ? ' AND r.week = ?' : ''}`, ...(week ? [userId, game, week] : [userId, game]))
  return row?.b ?? null
}
const better = (g: MpGameId, a: number, b: number | null) => a > 0 && (b === null || b <= 0 || (lowerBetter(g) ? a < b : a > b))

/** this week's wins and rank (by wins, then best) for one player */
export function weekStanding(userId: string, game: MpGameId, week = weekId()): { wins: number; rank: number; total: number; best: number | null } {
  const mine = q.get<{ w: number; b: number | null }>(`SELECT SUM(r.won) AS w, ${BEST(game)} AS b FROM mp_results r WHERE r.user_id = ? AND r.game = ? AND r.week = ?`, userId, game, week)
  const total = q.get<{ n: number }>('SELECT COUNT(DISTINCT user_id) AS n FROM mp_results WHERE game = ? AND week = ?', game, week)!.n
  if (!mine || mine.w === null) return { wins: 0, rank: 0, total, best: null }
  const w = mine.w ?? 0
  const b = mine.b ?? null
  const cmp = lowerBetter(game) ? '(COALESCE(x.b, 1e15) < COALESCE(?, 1e15))' : '(COALESCE(x.b, -1) > COALESCE(?, -1))'
  const rank = q.get<{ n: number }>(
    `SELECT COUNT(*) + 1 AS n FROM (SELECT r.user_id, SUM(r.won) AS w, ${BEST(game)} AS b FROM mp_results r WHERE r.game = ? AND r.week = ? GROUP BY r.user_id) x
     WHERE x.w > ? OR (x.w = ? AND ${cmp})`,
    game, week, w, w, b,
  )!.n
  return { wins: w, rank, total, best: b }
}

export interface RecordIn {
  id: string
  game: MpGameId
  room: string
  mode: MpMode
  startedAt: number
  endedAt: number
  standings: Standing[]
  teams?: { up: number; down: number; win: MpTeam }
  data: Record<string, unknown>
}

/** Save a finished match and pay everyone who played it through. Returns each real player's "you" block. */
export function recordMatch(m: RecordIn): Map<string, You> {
  const out = new Map<string, You>()
  const def = MP_GAMES[m.game]
  const humans = m.standings.filter((s) => !s.bot)
  const counted = humans.filter((s) => !s.left && !s.void)
  const dur = m.endedAt - m.startedAt
  const tooShort = dur < def.minSeconds * 1000
  const day = nycDay(m.endedAt)
  const week = weekId(new Date(m.endedAt))
  // a win only counts against another real person (the city locals are practice)
  const rivals = counted.length
  const prev = new Map<string, { week: number | null; all: number | null }>()
  for (const s of counted) prev.set(s.id, { week: bestOf(s.id, m.game, week), all: bestOf(s.id, m.game, null) })
  tx(() => {
    q.run(
      'INSERT INTO mp_matches (id, game, room, mode, players, started_at, ended_at, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      m.id, m.game, m.room, m.mode, m.standings.length, m.startedAt, m.endedAt,
      JSON.stringify({ ...m.data, humans: humans.length, counted: counted.length, bots: m.standings.length - humans.length, teams: m.teams ?? null, tooShort }),
    )
    if (tooShort) return
    for (const s of counted) {
      const won = s.won && rivals >= 2 ? 1 : 0
      const score = Math.max(0, Math.round(s.dnf && m.game === 'sled' ? 0 : s.score))
      q.run(
        `INSERT OR IGNORE INTO mp_results (match_id, user_id, game, place, score, team, won, day, week, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        m.id, s.id, m.game, s.place, score, s.team ?? null, won, day, week, m.endedAt,
      )
    }
  })
  for (const s of humans) {
    if (s.left || s.void || tooShort) {
      out.set(s.id, { place: s.place, xp: 0, coins: 0, weekRank: 0, weekWins: 0, void: 1 })
      continue
    }
    const teamWon = m.teams ? s.team === m.teams.win : undefined
    // XP: the podium gets more (and against locals everyone gets the base); a team's winners count as 1st
    const xpPlace = m.mode === 'teams' ? (teamWon && rivals >= 2 ? 1 : 2) : s.place
    const xp = awardXp(s.id, 'mp-game', { amount: mpXp(xpPlace, rivals), ref: m.id })
    const want = mpCoins({ game: m.game, place: s.place, humans: rivals, mode: m.mode, teamWon, dnf: false })
    const pay = payMatch(s.id, want, m.id)
    const w = walletOf(s.id)
    if (w && (pay.paid ?? 0) > 0) walletChanged(s.id, w)
    const p = prev.get(s.id)!
    const score = Math.round(s.dnf && m.game === 'sled' ? 0 : s.score)
    const best: You['best'] = better(m.game, score, p.all) ? 'all' : better(m.game, score, p.week) ? 'week' : undefined
    const ws = weekStanding(s.id, m.game, week)
    out.set(s.id, {
      place: s.place,
      xp: xp.gained,
      coins: pay.paid ?? 0,
      ...(best ? { best } : {}),
      weekRank: ws.rank,
      weekWins: ws.wins,
      ...(pay.error === 'daily-cap' || (pay.paid ?? 0) < want ? { capped: 1 as const } : {}),
      level: xp.level,
      ...(xp.leveledUp ? { up: 1 as const } : {}),
    })
  }
  return out
}

// ---------- leaderboards ----------
export interface BoardRow {
  id: string
  name: string
  look: unknown
  team: string
  wins: number
  played: number
  best: number | null
  you: boolean
}

/** A game's board: this week or all time, by wins or by best score, everyone or just you and your friends. */
export function board(game: MpGameId, o: { period: 'week' | 'all'; by: 'wins' | 'best'; friendsOf?: string; me: string }) {
  const week = weekId()
  const args: (string | number)[] = [game]
  let where = 'r.game = ?'
  if (o.period === 'week') {
    where += ' AND r.week = ?'
    args.push(week)
  }
  if (o.friendsOf) {
    where += ` AND (r.user_id = ? OR r.user_id IN (SELECT CASE WHEN a = ? THEN b ELSE a END FROM friends WHERE (a = ? OR b = ?) AND status = 'accepted'))`
    args.push(o.friendsOf, o.friendsOf, o.friendsOf, o.friendsOf)
  }
  where += ' AND (u.banned_until IS NULL OR u.banned_until < ?)'
  args.push(Date.now())
  const low = lowerBetter(game)
  const bestOrder = low ? 'COALESCE(best, 1e15) ASC' : 'COALESCE(best, -1) DESC'
  const order = o.by === 'wins' ? `wins DESC, ${bestOrder}, played DESC` : `${bestOrder}, wins DESC`
  const having = o.by === 'wins' ? 'HAVING played > 0' : 'HAVING best IS NOT NULL AND best > 0'
  const rows = q.all<UserRow & { wins: number; played: number; best: number | null }>(
    `SELECT u.*, SUM(r.won) AS wins, COUNT(*) AS played, ${BEST(game)} AS best
     FROM mp_results r JOIN users u ON u.id = r.user_id WHERE ${where}
     GROUP BY r.user_id ${having} ORDER BY ${order} LIMIT 50`,
    ...args,
  )
  const list: BoardRow[] = rows.map((r) => {
    const pu = publicUser(r)
    return { id: pu.id, name: pu.name, look: pu.look, team: pu.team, wins: r.wins ?? 0, played: r.played, best: r.best, you: r.id === o.me }
  })
  // where you stand (even if you're below the top 50)
  const mine = q.get<{ w: number | null; b: number | null; n: number }>(
    `SELECT SUM(r.won) AS w, ${BEST(game)} AS b, COUNT(*) AS n FROM mp_results r WHERE r.user_id = ? AND r.game = ?${o.period === 'week' ? ' AND r.week = ?' : ''}`,
    ...(o.period === 'week' ? [o.me, game, week] : [o.me, game]),
  )
  let me: { rank: number; wins: number; best: number | null; played: number } | null = null
  if (mine && mine.n > 0) {
    const idx = list.findIndex((r) => r.you)
    me = { rank: idx >= 0 ? idx + 1 : 0, wins: mine.w ?? 0, best: mine.b, played: mine.n }
    if (idx < 0 && !o.friendsOf) {
      // outside the top 50: count who's ahead
      // (same column names as the board itself: the HAVING clause refers to them)
      const ahead = q.all<{ wins: number; best: number | null }>(
        `SELECT SUM(r.won) AS wins, COUNT(*) AS played, ${BEST(game)} AS best FROM mp_results r JOIN users u ON u.id = r.user_id WHERE ${where} GROUP BY r.user_id ${having}`,
        ...args,
      ).filter((x) => {
        if (o.by === 'wins') return x.wins > me!.wins || (x.wins === me!.wins && better(game, x.best ?? 0, me!.best))
        return better(game, x.best ?? 0, me!.best)
      }).length
      me.rank = ahead + 1
    }
  }
  return { week, rows: list, me }
}

/** Your record in each game (the game cards and the hub). */
export function myStats(userId: string) {
  const out: Record<string, { played: number; wins: number; best: number | null; weekRank: number }> = {}
  for (const g of Object.keys(MP_GAMES) as MpGameId[]) {
    const r = q.get<{ n: number; w: number | null; b: number | null }>(`SELECT COUNT(*) AS n, SUM(r.won) AS w, ${BEST(g)} AS b FROM mp_results r WHERE r.user_id = ? AND r.game = ?`, userId, g)
    out[g] = { played: r?.n ?? 0, wins: r?.w ?? 0, best: r?.b ?? null, weekRank: r?.n ? weekStanding(userId, g).rank : 0 }
  }
  return out
}

/** The last few matches you played (newest first), with who won. */
export function recentMatches(userId: string, limit = 8) {
  return q.all<{ match_id: string; game: string; place: number; score: number; won: number; at: number; players: number }>(
    `SELECT r.match_id, r.game, r.place, r.score, r.won, r.at, m.players FROM mp_results r JOIN mp_matches m ON m.id = r.match_id WHERE r.user_id = ? ORDER BY r.at DESC LIMIT ?`,
    userId, limit,
  )
}

