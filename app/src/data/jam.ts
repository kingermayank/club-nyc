/**
 * The Dance Jam runs on a city-wide clock: every client (and the server, which pays the tips) agrees on
 * when the show is on without talking to each other.
 */
export const JAM_PERIOD = 8 * 60_000
export const JAM_LEN = 3 * 60_000
const SEG = 60_000
const SET = ['empire-state-of-mine', 'disco-54', 'uptown-bounce']

export function jamState(now = Date.now()) {
  const phase = now % JAM_PERIOD
  const start = now - phase
  const n = Math.floor(start / JAM_PERIOD)
  const seg = Math.floor(Math.min(phase, JAM_LEN - 1) / SEG)
  return { on: phase < JAM_LEN, start, end: start + JAM_LEN, next: start + JAM_PERIOD, n, track: SET[(n + seg) % SET.length], since: start + seg * SEG }
}
