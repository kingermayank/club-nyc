/**
 * The Dance Jam runs on a city-wide clock: every client (and the server, which pays the tips) agrees on
 * when the show is on without talking to each other.
 */
export const JAM_PERIOD = 8 * 60_000
export const JAM_LEN = 3 * 60_000
/** the show's song (music.ts): Empire State of Mind, from the top of every show, so everyone hears the same bar */
export const JAM_TRACK = 'empire-state-of-mine'

export function jamState(now = Date.now()) {
  const phase = now % JAM_PERIOD
  const start = now - phase
  const n = Math.floor(start / JAM_PERIOD)
  return { on: phase < JAM_LEN, start, end: start + JAM_LEN, next: start + JAM_PERIOD, n, track: JAM_TRACK, since: start }
}
