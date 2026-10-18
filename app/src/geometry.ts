export type Pt = [number, number]
export type Rect = [number, number, number, number] // x1, y1, x2, y2

export function inPoly([x, y]: Pt, poly: Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

function closestOnSegment(p: Pt, a: Pt, b: Pt): Pt {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len = dx * dx + dy * dy
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0
  return [a[0] + t * dx, a[1] + t * dy]
}

/** Returns p if it's inside the polygon, else the nearest point on its edge (nudged inward). */
export function clampToPoly(p: Pt, poly: Pt[]): Pt {
  if (inPoly(p, poly)) return p
  let best: Pt = poly[0]
  let bestD = Infinity
  for (let i = 0; i < poly.length; i++) {
    const c = closestOnSegment(p, poly[i], poly[(i + 1) % poly.length])
    const d = (c[0] - p[0]) ** 2 + (c[1] - p[1]) ** 2
    if (d < bestD) {
      bestD = d
      best = c
    }
  }
  const cx = poly.reduce((s, q) => s + q[0], 0) / poly.length
  const cy = poly.reduce((s, q) => s + q[1], 0) / poly.length
  const k = 4 / Math.max(1, Math.hypot(cx - best[0], cy - best[1]))
  return [best[0] + (cx - best[0]) * k, best[1] + (cy - best[1]) * k]
}

export const inRect = ([x, y]: Pt, [x1, y1, x2, y2]: Rect) => x >= x1 && x <= x2 && y >= y1 && y <= y2

export const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

// ---------------------------------------------------------------------------
// Navigation grid + A* so people walk around carts, tables and benches.
// ---------------------------------------------------------------------------
const CELL = 7

export class NavGrid {
  readonly w: number
  readonly h: number
  private open: Uint8Array

  constructor(walk: Pt[], holes: Pt[][] = [], width = 1000, height = 565) {
    this.w = Math.ceil(width / CELL)
    this.h = Math.ceil(height / CELL)
    this.open = new Uint8Array(this.w * this.h)
    for (let gy = 0; gy < this.h; gy++)
      for (let gx = 0; gx < this.w; gx++) {
        const p: Pt = [(gx + 0.5) * CELL, (gy + 0.5) * CELL]
        if (inPoly(p, walk) && !holes.some((h) => inPoly(p, h))) this.open[gy * this.w + gx] = 1
      }
  }

  walkable(p: Pt): boolean {
    const gx = Math.floor(p[0] / CELL)
    const gy = Math.floor(p[1] / CELL)
    return gx >= 0 && gy >= 0 && gx < this.w && gy < this.h && this.open[gy * this.w + gx] === 1
  }

  /** nearest walkable point to p (spiral search on the grid) */
  nearest(p: Pt): Pt {
    if (this.walkable(p)) return p
    const gx0 = Math.floor(p[0] / CELL)
    const gy0 = Math.floor(p[1] / CELL)
    for (let r = 1; r < Math.max(this.w, this.h); r++) {
      let best: Pt | null = null
      let bestD = Infinity
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue
          const gx = gx0 + dx
          const gy = gy0 + dy
          if (gx < 0 || gy < 0 || gx >= this.w || gy >= this.h || !this.open[gy * this.w + gx]) continue
          const c: Pt = [(gx + 0.5) * CELL, (gy + 0.5) * CELL]
          const d = dist(c, p)
          if (d < bestD) {
            bestD = d
            best = c
          }
        }
      if (best) return best
    }
    return p
  }

  private lineOfSight(a: Pt, b: Pt): boolean {
    const n = Math.ceil(dist(a, b) / (CELL * 0.5))
    for (let i = 1; i < n; i++) {
      const t = i / n
      if (!this.walkable([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) return false
    }
    return true
  }

  /** Path from a to b as a list of waypoints (excluding a). */
  path(a: Pt, b: Pt): Pt[] {
    const start = this.nearest(a)
    const goal = this.nearest(b)
    if (this.lineOfSight(start, goal)) return [goal]
    const W = this.w
    const sx = Math.floor(start[0] / CELL), sy = Math.floor(start[1] / CELL)
    const tx = Math.floor(goal[0] / CELL), ty = Math.floor(goal[1] / CELL)
    const N = W * this.h
    const g = new Float32Array(N).fill(Infinity)
    const came = new Int32Array(N).fill(-1)
    const closed = new Uint8Array(N)
    // tiny binary heap
    const heap: number[] = []
    const f = new Float32Array(N).fill(Infinity)
    const push = (i: number) => {
      heap.push(i)
      let c = heap.length - 1
      while (c > 0) {
        const p = (c - 1) >> 1
        if (f[heap[p]] <= f[heap[c]]) break
        ;[heap[p], heap[c]] = [heap[c], heap[p]]
        c = p
      }
    }
    const pop = () => {
      const top = heap[0]
      const last = heap.pop()!
      if (heap.length) {
        heap[0] = last
        let c = 0
        for (;;) {
          const l = c * 2 + 1, r = l + 1
          let m = c
          if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l
          if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r
          if (m === c) break
          ;[heap[m], heap[c]] = [heap[c], heap[m]]
          c = m
        }
      }
      return top
    }
    const hfn = (x: number, y: number) => {
      const dx = Math.abs(x - tx), dy = Math.abs(y - ty)
      return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy)
    }
    const s = sy * W + sx
    g[s] = 0
    f[s] = hfn(sx, sy)
    push(s)
    const goalI = ty * W + tx
    let found = false
    let iter = 0
    while (heap.length && iter++ < 20000) {
      const cur = pop()
      if (cur === goalI) {
        found = true
        break
      }
      if (closed[cur]) continue
      closed[cur] = 1
      const cx = cur % W, cy = (cur / W) | 0
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue
          const nx = cx + dx, ny = cy + dy
          if (nx < 0 || ny < 0 || nx >= W || ny >= this.h) continue
          const ni = ny * W + nx
          if (!this.open[ni] || closed[ni]) continue
          if (dx && dy && (!this.open[cy * W + nx] || !this.open[ny * W + cx])) continue // no corner cutting
          const ng = g[cur] + (dx && dy ? Math.SQRT2 : 1)
          if (ng < g[ni]) {
            g[ni] = ng
            f[ni] = ng + hfn(nx, ny)
            came[ni] = cur
            push(ni)
          }
        }
    }
    if (!found) return [goal]
    const cells: Pt[] = []
    for (let c = goalI; c !== -1 && c !== s; c = came[c]) cells.push([((c % W) + 0.5) * CELL, (((c / W) | 0) + 0.5) * CELL])
    cells.reverse()
    cells[cells.length - 1] = goal
    // string-pull: keep only the waypoints we need
    const out: Pt[] = []
    let anchor = start
    let i = 0
    while (i < cells.length) {
      let j = cells.length - 1
      while (j > i && !this.lineOfSight(anchor, cells[j])) j--
      out.push(cells[j])
      anchor = cells[j]
      i = j + 1
    }
    return out
  }

  randomPoint(): Pt {
    for (let k = 0; k < 400; k++) {
      const gx = Math.floor(Math.random() * this.w)
      const gy = Math.floor(Math.random() * this.h)
      if (this.open[gy * this.w + gx]) return [(gx + 0.5) * CELL, (gy + 0.5) * CELL]
    }
    return [500, 450]
  }
}

// ---------------------------------------------------------------------------
// Homography: map a rectangle onto a quad with CSS matrix3d (billboards, stage).
// ---------------------------------------------------------------------------
function adj(m: number[]) {
  return [
    m[4] * m[8] - m[5] * m[7], m[2] * m[7] - m[1] * m[8], m[1] * m[5] - m[2] * m[4],
    m[5] * m[6] - m[3] * m[8], m[0] * m[8] - m[2] * m[6], m[2] * m[3] - m[0] * m[5],
    m[3] * m[7] - m[4] * m[6], m[1] * m[6] - m[0] * m[7], m[0] * m[4] - m[1] * m[3],
  ]
}
function multmm(a: number[], b: number[]) {
  const c = Array(9).fill(0)
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) c[3 * i + j] += a[3 * i + k] * b[3 * k + j]
  return c
}
function multmv(m: number[], v: number[]) {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]
}
function basisToPoints(p: Pt[]) {
  const m = [p[0][0], p[1][0], p[2][0], p[0][1], p[1][1], p[2][1], 1, 1, 1]
  const v = multmv(adj(m), [p[3][0], p[3][1], 1])
  return multmm(m, [v[0], 0, 0, 0, v[1], 0, 0, 0, v[2]])
}
/** CSS matrix3d that maps a w×h element (origin top-left) onto quad [tl, tr, br, bl]. */
export function quadTransform(w: number, h: number, quad: Pt[]): string {
  const [tl, tr, br, bl] = quad
  const s = basisToPoints([[0, 0], [w, 0], [0, h], [w, h]])
  const d = basisToPoints([tl, tr, bl, br])
  const t = multmm(d, adj(s))
  const n = t.map((x) => x / t[8])
  return `matrix3d(${n[0]},${n[3]},0,${n[6]},${n[1]},${n[4]},0,${n[7]},0,0,1,0,${n[2]},${n[5]},0,1)`
}
