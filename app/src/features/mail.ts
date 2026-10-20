import { sfx } from '../audio'
import { save, persist } from '../state'
import { el } from '../engine/stage'
import { openOverlay, closeOverlay, closeButton } from '../engine/ui'
import { goto, world } from '../engine/world'
import { jamState } from '../data/jam'

/**
 * Penguin mail, Club NYC style: a postcard inbox for the city's own messages (welcome, first paycheck,
 * Dance Jam invites). Calmer than a toast: it waits on your desk until you look, and invites carry a
 * "Go there!" button. Saved with the rest of your progress; the newest 30 are kept.
 */
export interface Postcard {
  id: string
  from: string
  title: string
  text: string
  /** an emoji shown big on the front (turned into an illustrated icon) */
  art: string
  at: number
  read?: boolean
  go?: { label: string; room: string }
}

const button = el('button', 'mail-btn', '<span class="mail-env">✉️</span><b class="mail-count"></b>')
button.setAttribute('aria-label', 'Postcards')
button.title = 'Postcards'
button.onclick = (e) => {
  e.stopPropagation()
  sfx.click()
  openMail()
}

const inbox = (): Postcard[] => (save.mail ??= [])

function badge() {
  const n = inbox().filter((p) => !p.read).length
  const c = button.querySelector<HTMLElement>('.mail-count')!
  c.textContent = n ? String(n) : ''
  button.classList.toggle('unread', n > 0)
}

/** the envelope for the top-left HUD corner */
export function mailButton(): HTMLElement {
  badge()
  return button
}

/** drop a postcard in the inbox (once per id); the envelope wiggles */
export function sendPostcard(p: Omit<Postcard, 'at' | 'read'>) {
  if (inbox().some((x) => x.id === p.id)) return
  inbox().unshift({ ...p, at: Date.now() })
  save.mail = inbox().slice(0, 30)
  persist()
  badge()
  button.classList.remove('wiggle')
  void button.offsetWidth
  button.classList.add('wiggle')
  sfx.pop()
}

export function openMail(start = 0) {
  const list = inbox()
  let i = Math.min(start, Math.max(0, list.length - 1))
  const desk = el('div', 'mail-desk')
  const draw = () => {
    const p = list[i]
    desk.innerHTML = ''
    if (!p) {
      desk.append(el('div', 'postcard-mail empty', '<div class="pm-art">📭</div><b>No postcards yet</b><p>The city writes when something’s happening: invites, paychecks, news from your building (mostly about the elevator).</p>'))
    } else {
      p.read = true
      const card = el('div', 'postcard-mail', `<div class="pm-front"><div class="pm-art">${p.art}</div><div class="pm-stamp">NYC</div></div>
        <div class="pm-back"><small>From ${p.from} · ${new Date(p.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</small><b>${p.title}</b><p>${p.text}</p></div>`)
      if (p.go) {
        const go = el('button', 'btn go pm-go', `${p.go.label} →`)
        go.onclick = () => {
          sfx.click()
          closeOverlay()
          if (world.room.id !== p.go!.room) void goto(p.go!.room)
        }
        card.querySelector('.pm-back')!.append(go)
      }
      desk.append(card)
    }
    const nav = el('div', 'pm-nav')
    const prev = el('button', 'pm-arrow', '◀') as HTMLButtonElement
    const next = el('button', 'pm-arrow', '▶') as HTMLButtonElement
    prev.disabled = i <= 0
    next.disabled = i >= list.length - 1
    prev.onclick = () => (sfx.tick(), i--, draw())
    next.onclick = () => (sfx.tick(), i++, draw())
    const count = el('span', 'pm-count', list.length ? `Postcard ${i + 1} of ${list.length}` : '')
    nav.append(prev, count, next)
    if (p) {
      const bin = el('button', 'pm-recycle', '♻️ Recycle')
      bin.onclick = () => {
        sfx.click()
        list.splice(i, 1)
        i = Math.max(0, Math.min(i, list.length - 1))
        persist()
        draw()
      }
      nav.append(bin)
    }
    desk.append(nav, closeButton())
    persist()
    badge()
  }
  draw()
  openOverlay(desk)
}

/** the city's standing invitations: a Dance Jam postcard once a day when the next jam is close */
export function startMail() {
  badge()
  const check = () => {
    const j = jamState()
    const soon = !j.on && j.next - Date.now() < 10 * 60_000
    if (soon) {
      const day = new Date().toISOString().slice(0, 10)
      sendPostcard({ id: `jam-${day}`, from: 'DJ Cadenza, Times Square', art: '🪩', title: 'Dance Jam soon!', text: 'The big screens go dance-floor in a few minutes. Come early, bring friends, and hit D when the beat drops.', go: { label: 'Go to Times Square', room: 'times-square' } })
    }
  }
  check()
  setInterval(check, 60_000)
}
