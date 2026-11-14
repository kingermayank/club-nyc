/** Settings: wallpaper, sounds, and what the old phone menu held (How to Play, Help Center, the Discord). */
import { el } from '../../../engine/stage'
import { save, persist } from '../../../state'
import { setMuted } from '../../../audio'
import { screenEl, act, esc } from '../kit'
import { ifr, store, emit } from '../store'
import { thenCity, lockPhone, type Ctx, type Screen } from '../phone'
import { tone } from '../sound'

const WALLS = [
  { id: 'skyline', name: 'Skyline' },
  { id: 'subway', name: 'Subway' },
  { id: 'park', name: 'Park' },
]

function toggle(label: string, on: boolean, f: (v: boolean) => void) {
  const row = el('label', 'ifr-row ifset-row', `<span class="ifr-txt"><b>${esc(label)}</b></span>`)
  const sw = el('button', 'ifset-sw' + (on ? ' on' : ''), '<i></i>')
  sw.setAttribute('role', 'switch')
  sw.setAttribute('aria-checked', String(on))
  sw.setAttribute('aria-label', label)
  sw.onclick = (e) => {
    e.preventDefault()
    on = !on
    sw.classList.toggle('on', on)
    sw.setAttribute('aria-checked', String(on))
    tone('tap')
    f(on)
  }
  row.append(sw)
  return row
}

export function open(ctx: Ctx): Screen {
  const s = screenEl(ctx, 'Settings', { back: false, big: true })
  s.body.append(el('div', 'ifr-sec', 'Wallpaper'))
  const walls = el('div', 'ifset-walls')
  const draw = () => {
    walls.innerHTML = ''
    for (const w of WALLS) {
      const b = el('button', 'ifset-wall' + (ifr().wallpaper === w.id ? ' on' : ''), `<img src="/art/ifruit/wall-${w.id}.jpg" alt=""><span>${w.name}</span>`)
      b.type = 'button'
      b.onclick = () => {
        tone('tap')
        ifr().wallpaper = w.id
        store()
        emit('wallpaper')
        draw()
      }
      walls.append(b)
    }
  }
  draw()
  s.body.append(walls, el('div', 'ifr-sec', 'Sound'))
  s.body.append(
    toggle('Game sound', !save.muted, (v) => {
      save.muted = !v
      setMuted(save.muted)
      document.querySelector('.tb-btn[aria-label="Sound On/Off"]')?.classList.toggle('off', save.muted)
      persist()
    }),
    toggle('Notification sounds', !save.notifyOff, (v) => {
      save.notifyOff = !v
      persist()
    }),
  )
  s.body.append(el('div', 'ifr-sec', 'Help'))
  const link = (label: string, f: () => void) => {
    const r = el('button', 'ifr-row', `<span class="ifr-txt"><b>${label}</b></span><em>›</em>`)
    r.type = 'button'
    r.onclick = () => (tone('tap'), f())
    s.body.append(r)
  }
  link('How to Play', () => thenCity(() => void import('../../tour').then((m) => m.startTour())))
  link('Help Center', () => void window.open('/help/', '_blank', 'noopener'))
  link('Join the Discord', () => void window.open('/discord', '_blank', 'noopener'))
  link('Invite Friends', () => thenCity(() => void import('../../invite').then((m) => m.openInvite())))
  s.body.append(el('div', 'ifset-about', `<img src="/art/ifruit/logo-cherry.svg" alt=""><b>iFruit</b><small>Made in New York</small>`))
  s.body.append(act('Lock Phone', () => lockPhone(), 'ghost ifset-lock'))
  return { el: s.el }
}
