import { save, persist } from '../state'
import { rng, weekId, prevWeekId, weekday } from './rng'

export type TeamId = 'downtown' | 'midtown' | 'uptown' | 'harbor'

export interface Team {
  id: TeamId
  name: string
  emoji: string
  color: string
  dark: string
  pitch: string
  turf: string[]
  scarf: string
}

/** Neighborhood Wars: four friendly rivals. Every coin you earn at a job counts for your team this week. */
export const TEAMS: Record<TeamId, Team> = {
  downtown: {
    id: 'downtown', name: 'Downtown Slices', emoji: '🍕', color: '#e5483b', dark: '#9e2a20',
    pitch: 'SoHo, Chinatown & the Village. Cobblestones, dumplings, dollar slices.',
    turf: ['soho', 'thread', 'sneaker-vault', 'coffee', 'chinatown', 'pizza', 'parade', 'brooklyn-bridge'],
    scarf: 'team-scarf-downtown',
  },
  midtown: {
    id: 'midtown', name: 'Midtown Lights', emoji: '✨', color: '#f2b632', dark: '#a87610',
    pitch: 'Times Square, Broadway & Fifth. Big lights, bigger dreams.',
    turf: ['times-square', 'broadway', 'iloveny', 'rockefeller', 'fifth-ave', 'toy-palace', 'maison-malle', 'grand-central', 'empire-deck', 'subway'],
    scarf: 'team-scarf-midtown',
  },
  uptown: {
    id: 'uptown', name: 'Uptown Acorns', emoji: '🌳', color: '#3cb371', dark: '#23784a',
    pitch: 'Central Park & Museum Mile. Squirrels, steps, and serious culture.',
    turf: ['central-park', 'the-met'],
    scarf: 'team-scarf-uptown',
  },
  harbor: {
    id: 'harbor', name: 'Harbor Gulls', emoji: '⚓', color: '#2a7bd5', dark: '#164f94',
    pitch: 'Battery Park, Lady Liberty & the West Side. Ferries, sunsets, seagulls.',
    turf: ['battery-park', 'liberty-island', 'high-line', 'chelsea-market'],
    scarf: 'team-scarf-harbor',
  },
}
export const TEAM_IDS = Object.keys(TEAMS) as TeamId[]

/** the text colour that reads on a team's colour: ink on the light ones (Midtown gold, Uptown green), white on the rest */
export function teamText(t: Team) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(t.color.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? 'var(--ink)' : '#fff'
}

export const teamOfRoom = (room: string): TeamId => TEAM_IDS.find((t) => TEAMS[t].turf.includes(room)) ?? 'midtown'
export const myTeam = (): Team | null => (save.team ? TEAMS[save.team as TeamId] : null)

const contribKey = (w: string) => `team:${w}`

/** the player's contribution this week */
export const myContribution = (w = weekId()) => save.stats[contribKey(w)] ?? 0

/** Called when the player earns coins at a job. */
export function contribute(points: number) {
  if (!save.team || points <= 0) return
  const k = contribKey(weekId())
  save.stats[k] = (save.stats[k] ?? 0) + points
  save.stats['team:lifetime'] = (save.stats['team:lifetime'] ?? 0) + points
  persist()
}

/** Everyone else's points — deterministic per week, growing through the week so the race moves. */
function baseline(team: TeamId, week: string, dayFrac: number) {
  const r = rng(`${week}:${team}`)
  const strength = 0.75 + r() * 0.5
  const full = Math.round(2600 * strength + r() * 400)
  return Math.round(full * dayFrac)
}

const weekFrac = (now = new Date()) => Math.min(1, (weekday(now) + (now.getHours() * 60 + now.getMinutes()) / 1440 + 0.3) / 7)

/** The city locals' share of this week's points (online, real players' points are added on top). */
export const localsPoints = (team: TeamId) => baseline(team, weekId(), weekFrac())

export function standings(week = weekId(), atDayFrac?: number) {
  const frac = atDayFrac ?? weekFrac()
  return TEAM_IDS.map((id) => {
    const mine = save.team === id ? myContribution(week) : 0
    return { team: TEAMS[id], points: baseline(id, week, frac) + mine, mine }
  }).sort((a, b) => b.points - a.points)
}

/** Last week's final result (once per week we pay out the winners). */
export function checkWeeklyResult(): { winner: Team; yourTeamWon: boolean } | null {
  const last = prevWeekId()
  if (save.stats[`team-paid:${last}`] || !save.team) return null
  save.stats[`team-paid:${last}`] = 1
  persist()
  // you only share in results for weeks you were around for
  if (weekId(new Date(save.memberSince + 'T12:00:00')) !== last && new Date(save.memberSince) > new Date(Date.now() - 7 * 86400000)) return null
  const s = standings(last, 1)
  return { winner: s[0].team, yourTeamWon: s[0].team.id === save.team }
}
