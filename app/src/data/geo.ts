import type { Pt, Rect } from '../geometry'

/** Room geometry written by tools/cutouts.py (walk areas, traced objects, seats, screens…). */
export interface Geo {
  image: string
  walk: Pt[]
  holes?: Pt[][]
  spawn?: Pt
  depth?: [number, number, number, number]
  seats?: Record<string, { sit: Pt; stand?: Pt }>
  zones?: Record<string, Rect | Pt[]>
  screens?: Record<string, Pt[]>
  ice?: Pt[]
  piano?: { corners: Pt[]; whiteKeys: number }
  cutouts: Record<string, { rect: [number, number, number, number]; at?: Pt; fg?: boolean; base?: number }>
}

const files = import.meta.glob<Geo>('./geo/*.json', { eager: true, import: 'default' })
export const GEO: Record<string, Geo> = {}
for (const [path, g] of Object.entries(files)) GEO[path.slice(6, -5)] = g

// Re-tracing a room shouldn't reload the whole game: swap the data in place.
if (import.meta.hot) {
  import.meta.hot.accept((mod) => {
    if (mod) Object.assign(GEO, (mod as unknown as { GEO: Record<string, Geo> }).GEO)
  })
}
