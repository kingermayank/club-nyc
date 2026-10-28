/**
 * REST for the multiplayer mini-games, mounted at /api/mp (server/src/index.ts):
 *   GET /hub                      what's on right now (people waiting, matches running, friends' tables) + your record
 *   GET /board/:game              ?period=week|all &by=wins|best &scope=friends   (the leaderboard inside each game)
 *   GET /lobby/:code              who's hosting a lobby (invite links say "Ana's Citi Bike Dash")
 *   GET /recent                   your last few matches
 * Everything live (joining, playing) happens on the WebSocket; these are reads.
 */
import { Hono } from 'hono'
import { requireUser, type Env } from '../../auth.ts'
import { MP_GAME_IDS, type MpGameId } from '../../../../app/src/mp/shared/games.ts'
import { board, myStats, recentMatches } from './results.ts'
import { hubSummary, lobbyPreview } from './index.ts'

export const mpApi = new Hono<Env>()

mpApi.get('/hub', requireUser, (c) => {
  const me = c.get('user')
  return c.json({ ...hubSummary(me.id), stats: myStats(me.id) })
})

mpApi.get('/board/:game', requireUser, (c) => {
  const game = c.req.param('game') as MpGameId
  if (!MP_GAME_IDS.includes(game)) return c.json({ error: 'unknown-game' }, 404)
  const me = c.get('user')
  const period = c.req.query('period') === 'all' ? 'all' : 'week'
  const by = c.req.query('by') === 'best' ? 'best' : 'wins'
  const friends = c.req.query('scope') === 'friends'
  return c.json({ game, period, by, scope: friends ? 'friends' : 'everyone', ...board(game, { period, by, me: me.id, ...(friends ? { friendsOf: me.id } : {}) }) })
})

mpApi.get('/lobby/:code', requireUser, (c) => {
  const p = lobbyPreview(c.req.param('code'))
  return p ? c.json(p) : c.json({ error: 'not-found' }, 404)
})

mpApi.get('/recent', requireUser, (c) => c.json({ matches: recentMatches(c.get('user').id) }))
