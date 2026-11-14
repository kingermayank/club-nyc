/** Map: the painted island in your pocket, with your friends' faces where they are and one click to go. */
import { el } from '../../../engine/stage'
import { world, goto } from '../../../engine/world'
import { save } from '../../../state'
import { headPortrait } from '../../../avatar/render'
import { GEO } from '../../../data/geo'
import { ROOMS } from '../../../data/rooms'
import { isHomeRoom } from '../../../data/homes'
import { SELFIE_SPOTS } from '../../../data/selfieSpots'
import { MAP_SPOTS } from '../../map'
import { screenEl, act, sheet, people, face, esc, type Person } from '../kit'
import { thenCity, type Ctx, type Screen } from '../phone'
import { tone } from '../sound'

const MW = 1000
const MH = 664
type Spot = (typeof MAP_SPOTS)[number]

/** where a room sits on the map (inner rooms use their building's spot) */
function spotOf(room: string | null): Spot | undefined {
  if (!room) return undefined
  const r = ROOMS[room]
  return MAP_SPOTS.find((s) => s.room === room) ?? MAP_SPOTS.find((s) => s.id === r?.mapSpot || (r?.mapSpot && s.room === r.mapSpot))
}
const centre = (s: Spot): [number, number] | null => {
  const c = GEO.map?.cutouts?.[s.id]
  if (!c) return null
  const [x, y, w, h] = c.rect
  return [x + w / 2, y + h / 2]
}

export function open(ctx: Ctx, arg?: string): Screen {
  const s = screenEl(ctx, 'Map', { back: false, big: true, right: act('◎', () => locate(true), 'ghost') })
  s.head.querySelector('.ifr-act')?.setAttribute('aria-label', 'Find me')
  const vp = el('div', 'ifmap')
  const art = el('div', 'ifmap-art', '<img src="/art/rooms/map.jpg" alt="Map of Manhattan" draggable="false">')
  const zoomBar = el('div', 'ifmap-zoom')
  const zin = act('+', () => setZoom(zoom * 1.35), 'ghost')
  const zout = act('−', () => setZoom(zoom / 1.35), 'ghost')
  zoomBar.append(zin, zout)
  vp.append(art, zoomBar)
  s.body.replaceWith(vp)
  let zoom = 0.62
  let ox = 0
  let oy = 0
  const apply = (smooth = false) => {
    const r = vp.getBoundingClientRect()
    const k = r.width / vp.offsetWidth || 1
    const vw = r.width / k
    const vh = r.height / k
    ox = Math.min(0, Math.max(vw - MW * zoom, ox))
    oy = Math.min(0, Math.max(vh - MH * zoom, oy))
    art.style.transition = smooth ? 'transform 0.45s cubic-bezier(0.2, 1, 0.3, 1)' : 'none'
    art.style.transform = `translate(${ox}px, ${oy}px) scale(${zoom})`
    // pins stay the same size whatever the zoom
    art.style.setProperty('--pin', String(1 / zoom))
  }
  const centreOn = (x: number, y: number, smooth = true) => {
    const vw = vp.offsetWidth
    const vh = vp.offsetHeight
    ox = vw / 2 - x * zoom
    oy = vh / 2 - y * zoom
    apply(smooth)
  }
  const setZoom = (z: number) => {
    const vw = vp.offsetWidth
    const vh = vp.offsetHeight
    const cx = (vw / 2 - ox) / zoom
    const cy = (vh / 2 - oy) / zoom
    zoom = Math.max(0.3, Math.min(1.4, z))
    centreOn(cx, cy, true)
  }

  // ---------- places ----------
  const cut = GEO.map?.cutouts ?? {}
  const here = spotOf(world.room.id)
  for (const spot of MAP_SPOTS) {
    if (!cut[spot.id] || (spot.room && !ROOMS[spot.room]) || spot.note === 'snack') continue
    const c = centre(spot)!
    const b = el('button', `ifmap-place${spot.note ? ' note' : ''}`, `<i></i><span>${esc(spot.note === 'subway' ? '' : spot.label)}</span>`)
    b.type = 'button'
    b.style.left = `${c[0]}px`
    b.style.top = `${c[1]}px`
    b.setAttribute('aria-label', spot.label)
    b.onclick = (e) => {
      e.stopPropagation()
      tone('tap')
      placeCard(ctx, spot, friendsAt(spot))
    }
    art.append(b)
  }
  // you
  const homeNow = isHomeRoom(world.room.id)
  const mePos = here ? centre(here) : null
  if (mePos && !homeNow) {
    const me = el('div', 'ifmap-me', `<span>${headPortrait(save.look, 'grin')}</span><i></i>`)
    me.style.left = `${mePos[0]}px`
    me.style.top = `${mePos[1]}px`
    art.append(me)
  }
  // friends
  let friends: Person[] = []
  const friendsAt = (spot: Spot) => friends.filter((f) => f.online && spotOf(f.room) === spot)
  void people().then((r) => {
    friends = r.friends
    const byspot = new Map<Spot, Person[]>()
    for (const f of friends) {
      const sp = f.online ? spotOf(f.room) : undefined
      if (!sp) continue
      byspot.set(sp, [...(byspot.get(sp) ?? []), f])
    }
    let n = 0
    for (const [sp, fs] of byspot) {
      const c = centre(sp)
      if (!c) continue
      fs.slice(0, 3).forEach((f, i) => {
        const pin = el('button', 'ifmap-friend', `${face(f.look)}${f.local ? '' : '<i class="ifr-dot"></i>'}`)
        pin.type = 'button'
        pin.title = f.name
        pin.style.left = `${c[0] + 26 + i * 18}px`
        pin.style.top = `${c[1] - 20 - i * 4}px`
        pin.style.animationDelay = `${n++ * 70}ms`
        pin.onclick = (e) => {
          e.stopPropagation()
          tone('tap')
          placeCard(ctx, sp, fs)
        }
        art.append(pin)
      })
    }
    if (arg?.startsWith('friend:')) {
      const f = friends.find((x) => x.id === arg.slice(7))
      const sp = f && spotOf(f.room)
      const c = sp && centre(sp)
      if (c) {
        zoom = 0.9
        centreOn(c[0], c[1])
        setTimeout(() => placeCard(ctx, sp!, friendsAt(sp!)), 450)
      } else if (f) ctx.banner(f.online && isHomeRoom(f.room ?? '') ? `${esc(f.name)} is at home` : `${esc(f.name)} isn’t out right now`)
    }
  })

  const locate = (smooth: boolean) => {
    if (mePos) centreOn(mePos[0], mePos[1], smooth)
    else centreOn(560, 380, smooth)
  }

  // ---------- drag to pan, wheel to zoom ----------
  let drag: { x: number; y: number; ox: number; oy: number; moved: boolean } | null = null
  vp.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('button')) return
    const k = vp.getBoundingClientRect().width / vp.offsetWidth
    drag = { x: e.clientX / k, y: e.clientY / k, ox, oy, moved: false }
    vp.setPointerCapture(e.pointerId)
  })
  vp.addEventListener('pointermove', (e) => {
    if (!drag) return
    const k = vp.getBoundingClientRect().width / vp.offsetWidth
    ox = drag.ox + (e.clientX / k - drag.x)
    oy = drag.oy + (e.clientY / k - drag.y)
    drag.moved = true
    apply()
  })
  vp.addEventListener('pointerup', () => (drag = null))
  vp.addEventListener('wheel', (e) => (e.preventDefault(), setZoom(zoom * (e.deltaY < 0 ? 1.15 : 0.87))), { passive: false })
  setTimeout(() => locate(false), 30)
  return { el: s.el }
}

function placeCard(ctx: Ctx, spot: Spot, fs: Person[]) {
  const room = spot.room ? ROOMS[spot.room] : null
  const sh = sheet(
    ctx,
    `<div class="ifmap-card">${room ? `<span class="ifmap-thumb" style="background-image:url(/art/rooms/${room.bg}.jpg)"></span>` : ''}<b>${esc(spot.label)}</b><small>${esc(room?.area.split(' · ')[0] ?? (spot.note === 'subway' ? 'Subway' : spot.note === 'ferry' ? 'Ferry from Battery Park' : ''))}</small>${spot.room && SELFIE_SPOTS[spot.room] ? '<span class="ifr-tag">📸 Selfie spot</span>' : ''}</div>`,
  )
  if (fs.length) {
    const row = el('div', 'ifmap-who')
    for (const f of fs.slice(0, 6)) row.insertAdjacentHTML('beforeend', `<span>${face(f.look, !f.local)}<small>${esc(f.name)}</small></span>`)
    sh.el.append(row)
  }
  const here = spot.room === world.room.id
  const go = act(here ? 'You’re here' : spot.note === 'subway' ? 'Take the Subway' : 'Go', () => {
    sh.close()
    if (spot.note === 'subway') return thenCity(() => void import('../../subway').then((m) => m.openSubway()))
    if (spot.note === 'ferry') return thenCity(() => void goto('battery-park'))
    if (spot.room) thenCity(() => void goto(spot.room!))
  }, 'blue ifb-go')
  go.disabled = here
  sh.el.append(go)
}
