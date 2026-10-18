// The world outside the subway car: platforms at both ends, the tunnel in between, seen through the windows
// and the doorway. Also draws the sliding door panels (cropped from the background art) when they open.
// All coordinates are the stage's logical 1000 × 565 space.

interface Rect {
  x: number
  y: number
  w: number
  h: number
  r: number
}

// measured on the background (tools/grid.py subway-car)
const WIN_L: Rect = { x: 43, y: 170, w: 291, h: 133.5, r: 13 }
const WIN_R: Rect = { x: 666.5, y: 170, w: 290, h: 133.5, r: 13 }
const DOORWAY = { x: 400, y: 167, w: 200, h: 268 }
/** door panels and the window in each, relative to the panel's left/top */
const PANEL_L = { x: 400, y: 167, w: 100, h: 268, hole: { x: 17.7, y: 18.3, w: 63.6, h: 108.3, r: 11 } }
const PANEL_R = { x: 500, y: 167, w: 100, h: 268, hole: { x: 19.4, y: 18.3, w: 63.6, h: 108.3, r: 11 } }

/** platform art spans this many logical px, starting at local x = PLAT_X0 (local x == screen x when stopped) */
const PLAT_X0 = -260
const PLAT_W = 1520
const PLAT_Y0 = 150
const PLAT_H = 300
const PLAT_K = 1.5

function rr(g: CanvasRenderingContext2D | Path2D, x: number, y: number, w: number, h: number, r: number) {
  g.moveTo(x + r, y)
  g.lineTo(x + w - r, y)
  g.quadraticCurveTo(x + w, y, x + w, y + r)
  g.lineTo(x + w, y + h - r)
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  g.lineTo(x + r, y + h)
  g.quadraticCurveTo(x, y + h, x, y + h - r)
  g.lineTo(x, y + r)
  g.quadraticCurveTo(x, y, x + r, y)
  g.closePath()
}

/** cheap deterministic hash → [0, 1) */
const hash = (i: number) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453
  return s - Math.floor(s)
}
const mod = (a: number, n: number) => ((a % n) + n) % n

interface StationStyle {
  name: string
  sub: string
  band: string
  bandDark: string
  trim: string
}

export const STATIONS: Record<'start' | 'end', StationStyle> = {
  start: { name: '34 ST', sub: 'HUDSON YARDS', band: '#2f7d4f', bandDark: '#1d5234', trim: '#e9c46a' },
  end: { name: '42 ST', sub: 'TIMES SQ', band: '#a2342b', bandDark: '#6e1f1a', trim: '#f2c14e' },
}

function renderPlatform(st: StationStyle, pigeon: HTMLImageElement | null): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = Math.round(PLAT_W * PLAT_K)
  c.height = Math.round(PLAT_H * PLAT_K)
  const g = c.getContext('2d')!
  g.scale(PLAT_K, PLAT_K)
  g.translate(-PLAT_X0, -PLAT_Y0)
  const X0 = PLAT_X0
  const X1 = PLAT_X0 + PLAT_W
  // wall: cream subway tile with a soft top light
  const wall = g.createLinearGradient(0, 150, 0, 405)
  wall.addColorStop(0, '#fbf6e9')
  wall.addColorStop(1, '#e4dcc8')
  g.fillStyle = wall
  g.fillRect(X0, 150, PLAT_W, 255)
  g.strokeStyle = 'rgba(150,138,112,.45)'
  g.lineWidth = 1
  for (let y = 186, row = 0; y < 405; y += 12, row++) {
    g.beginPath()
    g.moveTo(X0, y)
    g.lineTo(X1, y)
    g.stroke()
    for (let x = X0 + (row % 2 ? 12 : 0); x < X1; x += 24) {
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x, Math.min(405, y + 12))
      g.stroke()
    }
  }
  // mosaic frieze along the top
  g.fillStyle = st.bandDark
  g.fillRect(X0, 158, PLAT_W, 28)
  g.fillStyle = st.band
  g.fillRect(X0, 162, PLAT_W, 20)
  for (let x = X0, i = 0; x < X1; x += 8, i++) {
    g.fillStyle = i % 2 ? st.trim : '#f6efdc'
    g.fillRect(x + 1, i % 2 ? 165 : 173, 6, 6)
  }
  g.fillStyle = 'rgba(0,0,0,.18)'
  g.fillRect(X0, 186, PLAT_W, 3)
  // name tablets, one per window/doorway when the train is stopped
  for (const cx of [-150, 188, 500, 811, 1130]) {
    const w = 168
    const h = 64
    const x = cx - w / 2
    const y = 204
    g.fillStyle = st.bandDark
    g.fillRect(x - 6, y - 6, w + 12, h + 12)
    for (let i = 0; i < (w + 12) / 6; i++) {
      g.fillStyle = i % 2 ? st.trim : st.band
      g.fillRect(x - 6 + i * 6 + 1, y - 5, 4, 4)
      g.fillRect(x - 6 + i * 6 + 1, y + h + 1, 4, 4)
    }
    g.fillStyle = '#fbf8ee'
    g.fillRect(x, y, w, h)
    g.strokeStyle = 'rgba(29,33,64,.5)'
    g.lineWidth = 2
    g.strokeRect(x, y, w, h)
    g.fillStyle = '#1b1b1f'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.font = 'bold 34px "Helvetica Neue", Helvetica, Arial, sans-serif'
    g.fillText(st.name, cx, y + 26)
    g.font = 'bold 12px "Helvetica Neue", Helvetica, Arial, sans-serif'
    g.fillText(st.sub, cx, y + 52)
  }
  // steel columns (hidden behind the car wall when stopped, they whip past while moving)
  for (const cx of [-200, 362, 638, 1180]) {
    g.fillStyle = '#2d4f80'
    g.fillRect(cx - 13, 150, 26, 258)
    g.fillStyle = '#1e3760'
    g.fillRect(cx + 5, 150, 8, 258)
    g.fillStyle = '#4f75ad'
    g.fillRect(cx - 13, 150, 5, 258)
    g.strokeStyle = '#1d2140'
    g.lineWidth = 2.5
    g.strokeRect(cx - 13, 150, 26, 258)
    g.fillStyle = '#9db6dc'
    for (let y = 196; y < 400; y += 52) g.fillRect(cx - 2, y, 4, 4)
  }
  // platform floor + the yellow tactile edge
  g.fillStyle = '#9ba0ab'
  g.fillRect(X0, 405, PLAT_W, 45)
  g.fillStyle = 'rgba(0,0,0,.12)'
  g.fillRect(X0, 405, PLAT_W, 4)
  g.fillStyle = '#f2c230'
  g.fillRect(X0, 421, PLAT_W, 16)
  g.fillStyle = 'rgba(150,105,0,.45)'
  for (let x = X0 + 3; x < X1; x += 7) for (const y of [425, 432]) g.fillRect(x + (y === 432 ? 3 : 0), y, 2.5, 2.5)
  g.fillStyle = '#5d6170'
  g.fillRect(X0, 437, PLAT_W, 13)
  // a pigeon waiting for the train (of course)
  if (pigeon && pigeon.complete && pigeon.naturalWidth) g.drawImage(pigeon, 548, 384, 44, 42)
  // tunnel mouths at both ends
  const fade = (x: number, dir: 1 | -1) => {
    const gr = g.createLinearGradient(x, 0, x + dir * 120, 0)
    gr.addColorStop(0, 'rgba(8,14,32,1)')
    gr.addColorStop(1, 'rgba(8,14,32,0)')
    g.fillStyle = gr
    g.fillRect(dir === 1 ? x : x - 120, 150, 120, 300)
  }
  fade(X0, 1)
  fade(X1, -1)
  return c
}

export interface WorldFrame {
  /** camera position along the line (logical px) */
  camX: number
  /** px / s */
  speed: number
  /** world x where the end platform lines up (only meaningful once braking started) */
  endX: number | null
  /** 0 closed → 1 open */
  door: number
}

export class World {
  readonly canvas: HTMLCanvasElement
  private g: CanvasRenderingContext2D
  private k = 1
  private bg: HTMLImageElement
  private plat: { start: HTMLCanvasElement; end: HTMLCanvasElement }
  private tunnelGrad: CanvasGradient
  private streaks: { y: number; len: number; a: number; w: number }[] = []

  constructor(bg: HTMLImageElement, pigeon: HTMLImageElement | null) {
    this.bg = bg
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'showtime-world'
    this.g = this.canvas.getContext('2d')!
    this.plat = { start: renderPlatform(STATIONS.start, null), end: renderPlatform(STATIONS.end, pigeon?.complete ? pigeon : null) }
    this.tunnelGrad = this.g.createLinearGradient(0, 160, 0, 440)
    this.tunnelGrad.addColorStop(0, '#0a1530')
    this.tunnelGrad.addColorStop(0.45, '#13244b')
    this.tunnelGrad.addColorStop(0.75, '#0c1834')
    this.tunnelGrad.addColorStop(1, '#060c1b')
    for (let i = 0; i < 64; i++) {
      this.streaks.push({ y: 176 + hash(i + 0.31) * 122, len: 60 + hash(i + 0.77) * 260, a: 0.08 + hash(i + 0.13) * 0.22, w: 1 + hash(i + 0.59) * 1.6 })
    }
    this.resize(1)
  }

  /** re-draw the arrival platform once the pigeon sprite has loaded */
  refreshPlatforms(pigeon: HTMLImageElement) {
    this.plat.end = renderPlatform(STATIONS.end, pigeon)
  }

  /** backing-store scale (logical px → device px) */
  resize(scale: number) {
    const k = Math.max(1, Math.min(2.5, scale))
    if (Math.abs(k - this.k) < 0.05 && this.canvas.width > 0) return
    this.k = k
    this.canvas.width = Math.round(1000 * k)
    this.canvas.height = Math.round(565 * k)
    // gradients are in logical space; they survive the transform reset
  }

  draw(f: WorldFrame) {
    const g = this.g
    const k = this.k
    g.setTransform(k, 0, 0, k, 0, 0)
    g.clearRect(30, 150, 940, 300)

    // ----- the view outside -----
    g.save()
    g.beginPath()
    rr(g, WIN_L.x, WIN_L.y, WIN_L.w, WIN_L.h, WIN_L.r)
    rr(g, WIN_R.x, WIN_R.y, WIN_R.w, WIN_R.h, WIN_R.r)
    if (f.door > 0.001) g.rect(DOORWAY.x, DOORWAY.y, DOORWAY.w, DOORWAY.h)
    else
      for (const p of [PANEL_L, PANEL_R]) rr(g, p.x + p.hole.x, p.y + p.hole.y, p.hole.w, p.hole.h, p.hole.r)
    g.clip()
    g.beginPath()
    this.drawTunnel(f.camX, f.speed)
    this.drawPlatform(this.plat.start, 0 - f.camX)
    if (f.endX !== null) this.drawPlatform(this.plat.end, f.endX - f.camX)
    g.restore()

    // ----- glass on the windows -----
    this.glass(WIN_L)
    this.glass(WIN_R)

    // ----- door panels sliding into their pockets -----
    if (f.door > 0.001 && this.bg.complete && this.bg.naturalWidth) {
      const s = this.bg.naturalWidth / 1000
      const slide = f.door * 98
      for (const [p, dx] of [[PANEL_L, -slide], [PANEL_R, slide]] as const) {
        g.save()
        g.beginPath()
        g.rect(DOORWAY.x, DOORWAY.y - 2, DOORWAY.w, DOORWAY.h + 4)
        g.clip()
        g.translate(p.x + dx, p.y)
        g.beginPath()
        g.rect(0, 0, p.w, p.h)
        rr(g, p.hole.x, p.hole.y, p.hole.w, p.hole.h, p.hole.r)
        g.clip('evenodd')
        g.drawImage(this.bg, p.x * s, p.y * s, p.w * s, p.h * s, 0, 0, p.w, p.h)
        g.restore()
        this.glass({ x: p.x + dx + p.hole.x, y: p.y + p.hole.y, w: p.hole.w, h: p.hole.h, r: p.hole.r }, DOORWAY)
      }
      // the rubber edges meeting in the middle
      g.fillStyle = 'rgba(14,22,45,.85)'
      g.fillRect(500 - slide - 2, DOORWAY.y, 3, DOORWAY.h)
      g.fillRect(500 + slide - 1, DOORWAY.y, 3, DOORWAY.h)
    } else {
      for (const p of [PANEL_L, PANEL_R]) this.glass({ x: p.x + p.hole.x, y: p.y + p.hole.y, w: p.hole.w, h: p.hole.h, r: p.hole.r })
    }
  }

  private glass(r: Rect, clipTo?: { x: number; y: number; w: number; h: number }) {
    const g = this.g
    g.save()
    if (clipTo) {
      g.beginPath()
      g.rect(clipTo.x, clipTo.y, clipTo.w, clipTo.h)
      g.clip()
    }
    g.beginPath()
    rr(g, r.x, r.y, r.w, r.h, r.r)
    g.clip()
    g.fillStyle = 'rgba(40,80,150,.16)'
    g.fillRect(r.x, r.y, r.w, r.h)
    // two diagonal reflections, like in the art
    g.fillStyle = 'rgba(255,255,255,.07)'
    for (const off of [0.18, 0.62]) {
      const x = r.x + r.w * off
      g.beginPath()
      g.moveTo(x, r.y + r.h)
      g.lineTo(x + r.h * 0.55, r.y)
      g.lineTo(x + r.h * 0.55 + 22, r.y)
      g.lineTo(x + 22, r.y + r.h)
      g.closePath()
      g.fill()
    }
    g.restore()
  }

  private drawPlatform(c: HTMLCanvasElement, offset: number) {
    const x = PLAT_X0 + offset
    if (x > 1000 || x + PLAT_W < 0) return
    this.g.drawImage(c, x, PLAT_Y0, PLAT_W, PLAT_H)
  }

  private drawTunnel(camX: number, speed: number) {
    const g = this.g
    g.fillStyle = this.tunnelGrad
    g.fillRect(30, 150, 940, 300)
    // cable runs (static: they're continuous)
    g.fillStyle = 'rgba(80,104,150,.32)'
    g.fillRect(30, 194, 940, 2)
    g.fillRect(30, 199, 940, 1.5)
    g.fillStyle = 'rgba(0,0,0,.35)'
    g.fillRect(30, 288, 940, 4)
    const blur = Math.min(110, 6 + speed * 0.07)
    // tunnel columns, one every 150 px
    for (let x = -mod(camX, 150) + 30; x < 980; x += 150) {
      g.fillStyle = '#040915'
      g.fillRect(x, 150, 16 + blur * 0.12, 300)
      g.fillStyle = 'rgba(70,96,150,.38)'
      g.fillRect(x + 16 + blur * 0.12, 150, 2, 300)
    }
    // warm work lights streaking past
    g.save()
    g.globalCompositeOperation = 'lighter'
    for (let x = -mod(camX - 140, 540) - 40; x < 1080; x += 540) {
      const glow = g.createRadialGradient(x, 233, 2, x, 233, 46)
      glow.addColorStop(0, 'rgba(255,214,120,.45)')
      glow.addColorStop(1, 'rgba(255,214,120,0)')
      g.fillStyle = glow
      g.fillRect(x - 50 - blur, 185, 100 + blur, 96)
      g.fillStyle = '#ffe7a3'
      g.beginPath()
      rr(g, x - blur, 229.5, blur + 26, 7, 3.5)
      g.fill()
    }
    // red / green signal lamps
    for (let x = -mod(camX - 900, 1700) - 20; x < 1100; x += 1700) {
      const red = Math.floor((camX + x) / 1700) % 2 === 0
      g.fillStyle = red ? 'rgba(255,70,60,.9)' : 'rgba(70,255,140,.9)'
      g.beginPath()
      g.arc(x, 266, 3.2, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = red ? 'rgba(255,70,60,.25)' : 'rgba(70,255,140,.25)'
      g.beginPath()
      g.arc(x, 266, 10, 0, Math.PI * 2)
      g.fill()
    }
    // near-field light streaks (parallax ×1.6) — only once we're moving
    const v = Math.min(1, speed / 700)
    if (v > 0.05) {
      const near = camX * 1.6
      const first = Math.floor(near / 120) - 3
      for (let i = first; i < first + 12; i++) {
        const s = this.streaks[mod(i, this.streaks.length)]
        if (hash(i * 0.37) < 0.45) continue
        const x = i * 120 - near
        g.fillStyle = `rgba(190,215,255,${(s.a * v).toFixed(3)})`
        g.fillRect(x, s.y, s.len * (0.4 + v), s.w)
      }
    }
    g.restore()
  }
}
