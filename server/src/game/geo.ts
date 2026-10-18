import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { clampToPoly, inPoly, type Pt } from '../../../app/src/geometry.ts'
import { config } from '../config.ts'
import { ROOM_W, ROOM_H } from '../../../app/src/net/protocol.ts'

/** The same room geometry the client uses — so the server can keep walk targets on the floor. */
interface Geo {
  walk: Pt[]
  holes?: Pt[][]
  spawn?: Pt
  seats?: Record<string, unknown>
}

const GEO = new Map<string, Geo>()
for (const f of readdirSync(config.geoDir)) {
  if (!f.endsWith('.json') || f === 'map.json') continue
  GEO.set(f.slice(0, -5), JSON.parse(readFileSync(join(config.geoDir, f), 'utf8')))
}

export const ROOM_IDS = new Set(GEO.keys())
export const knownRoom = (r: string) => GEO.has(r)

/** Clamp a target into the room's walkable floor (and the stage). */
export function walkTarget(room: string, x: number, y: number): [number, number] {
  const px = Math.max(0, Math.min(ROOM_W, x))
  const py = Math.max(0, Math.min(ROOM_H, y))
  const g = GEO.get(room)
  if (!g) return [px, py]
  const p: Pt = inPoly([px, py], g.walk) ? [px, py] : clampToPoly([px, py], g.walk)
  return [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]
}

export const validSeat = (room: string, seat: string) => !!GEO.get(room)?.seats?.[seat] || seat.startsWith('furn-')
export const spawnOf = (room: string): Pt => GEO.get(room)?.spawn ?? [500, 460]
