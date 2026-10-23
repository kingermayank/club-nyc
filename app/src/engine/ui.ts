import { sfx } from '../audio'
import { stage, el, W } from './stage'
import type { Choice } from '../types'

// ---------- busy / modal state ----------
let modalOpen = false
let busyCount = 0
export const ui = {
  get busy() {
    return modalOpen || busyCount > 0
  },
  get modal() {
    return modalOpen
  },
}
/** Block world input while something (a ride, a cutscene) is playing. Returns a release function. */
export function hold(): () => void {
  busyCount++
  let done = false
  return () => {
    if (!done) {
      done = true
      busyCount = Math.max(0, busyCount - 1)
    }
  }
}

// ---------- toasts ----------
// Small confirmations and good news, at most two on screen: a burst (a stamp, coins, a refill) plays as a short calm
// sequence instead of a pile. The same line twice shows once, and at most two wait their turn: the oldest small news
// gives way, but news about people (a friend accepting) is kept and always gets its turn.
const MAX_TOASTS = 2
const toastQueue: { node: HTMLElement; ms: number }[] = []
const showing = () => [...stage.toasts.children].filter((n) => !n.classList.contains('out'))
let pumpLater = 0
function pumpToasts() {
  // while Rosa is talking (the tour, a "Show me"), good news waits its turn: one voice at a time
  if (stage.root.querySelector('.tour')) {
    if (toastQueue.length && !pumpLater) pumpLater = window.setTimeout(() => ((pumpLater = 0), pumpToasts()), 700)
    return
  }
  while (toastQueue.length && showing().length < MAX_TOASTS) {
    const { node, ms } = toastQueue.shift()!
    stage.toasts.append(node)
    setTimeout(() => node.classList.add('out'), ms)
    setTimeout(() => {
      node.remove()
      pumpToasts()
    }, ms + 300)
  }
}
/** Queue a toast-like element (stamp cards use this too). `keep`: never dropped from a busy queue. */
export function showToast(node: HTMLElement, ms = 2600, keep = false) {
  node.dataset.key ??= node.textContent ?? ''
  const key = node.dataset.key
  if (showing().some((n) => (n as HTMLElement).dataset.key === key) || toastQueue.some((q) => q.node.dataset.key === key)) return
  if (keep) node.dataset.keep = '1'
  toastQueue.push({ node, ms })
  while (toastQueue.length > 2) {
    const i = toastQueue.findIndex((q) => !q.node.dataset.keep)
    if (i < 0) break
    toastQueue.splice(i, 1)
  }
  pumpToasts()
}
export function toast(text: string, icon = '', opts: { keep?: boolean } = {}) {
  showToast(el('div', 'toast', `${icon ? `<span class="toast-icon">${icon}</span>` : ''}<span>${text}</span>`), 2600, opts.keep)
}

// ---------- overlay panels ----------
let onClose: (() => void) | null = null
export function closeOverlay() {
  stage.overlay.classList.remove('open')
  stage.overlay.innerHTML = ''
  stage.overlay.className = 'overlay'
  modalOpen = false
  const f = onClose
  onClose = null
  f?.()
}
export function openOverlay(node: HTMLElement, opts: { backdrop?: boolean; onClose?: () => void; cls?: string } = {}) {
  if (modalOpen) {
    const prev = onClose
    onClose = null
    prev?.()
  }
  stage.overlay.innerHTML = ''
  stage.overlay.className = 'overlay open' + (opts.cls ? ' ' + opts.cls : '')
  stage.overlay.append(node)
  modalOpen = true
  onClose = opts.onClose ?? null
  stage.overlay.onclick = (e) => {
    if (e.target === stage.overlay && opts.backdrop !== false) {
      sfx.click()
      closeOverlay()
    }
  }
}
export function closeButton(fn = closeOverlay) {
  const b = el('button', 'x-btn', '<svg viewBox="0 0 20 20"><path d="M5 5 L15 15 M15 5 L5 15" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/></svg>')
  b.setAttribute('aria-label', 'Close')
  b.onclick = (e) => {
    e.stopPropagation()
    sfx.click()
    fn()
  }
  return b
}

export function panel(title: string, body: string | HTMLElement, opts: { wide?: boolean; cls?: string } = {}) {
  const p = el('div', 'panel' + (opts.wide ? ' wide' : '') + (opts.cls ? ' ' + opts.cls : ''))
  p.append(el('h2', '', title))
  if (typeof body === 'string') p.insertAdjacentHTML('beforeend', body)
  else p.append(body)
  p.append(closeButton())
  return p
}

export function choose<T>(title: string, body: string, options: Choice<T>[], art?: string): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false
    const done = (v: T | null) => {
      if (settled) return
      settled = true
      resolve(v)
    }
    const p = el('div', 'panel', `${art ? `<div class="panel-art">${art}</div>` : ''}<h2>${title}</h2><p>${body}</p>`)
    const list = el('div', 'choices')
    options.forEach((o) => {
      const b = el('button', 'btn', o.label + (o.note ? `<small>${o.note}</small>` : ''))
      b.onclick = () => {
        sfx.click()
        done(o.value)
        closeOverlay()
      }
      list.append(b)
    })
    p.append(list, closeButton())
    openOverlay(p, { onClose: () => done(null) })
  })
}

export function info(title: string, text: string, art?: string) {
  const p = el('div', 'panel', `${art ? `<div class="panel-art">${art}</div>` : ''}<h2>${title}</h2><p>${text}</p>`)
  const ok = el('button', 'btn', 'Cool!')
  ok.onclick = () => {
    sfx.click()
    closeOverlay()
  }
  p.append(ok, closeButton())
  openOverlay(p)
}

// ---------- hover label ----------
export function showLabel(text: string, x: number, y: number) {
  stage.label.textContent = text
  stage.label.style.left = `${Math.max(80, Math.min(W - 80, x))}px`
  stage.label.style.top = `${Math.max(64, y)}px`
  stage.label.classList.add('show')
}
export function hideLabel() {
  stage.label.classList.remove('show')
}

// ---------- effects ----------
export function confetti(n = 60) {
  const colors = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff9f1c']
  for (let i = 0; i < n; i++) {
    const c = el('i', 'confetti')
    c.style.cssText = `left:${Math.random() * W}px;background:${colors[i % colors.length]};--dx:${(Math.random() - 0.5) * 160}px;--r:${Math.random() * 720}deg;animation-delay:${Math.random() * 0.4}s;animation-duration:${1.6 + Math.random()}s`
    stage.root.append(c)
    setTimeout(() => c.remove(), 3400)
  }
}

export function fadeOut(): Promise<void> {
  stage.fade.classList.add('on')
  return new Promise((r) => setTimeout(r, 260))
}
export function fadeIn() {
  stage.fade.classList.remove('on')
}

/** Floating "+3" text at a stage point */
export function floatText(text: string, x: number, y: number, cls = '') {
  const t = el('div', 'float-text ' + cls, text)
  t.style.left = `${x}px`
  t.style.top = `${y}px`
  stage.fx.append(t)
  setTimeout(() => t.remove(), 1200)
}

// ---------- notices ----------
// A notice with buttons ("Go", "Accept"…), bottom right, one at a time: the next waits until this one is answered,
// dismissed or fades. Ambient city news is quiet (no chime); things people do to you (requests, invites) chime.
const noticeQueue: (() => void)[] = []
let noticeUp = false
function nextNotice() {
  if (noticeUp) return
  const show = noticeQueue.shift()
  if (show) show()
}
export const noticesWaiting = () => noticeUp || noticeQueue.length > 0

/** A toast with buttons ("Go", "Rematch"…). Stays a little longer; click a button or ✕ to dismiss. */
export function notify(text: string, icon: string, actions: { label: string; act: () => void }[] = [], ms = 8000, opts: { quiet?: boolean } = {}) {
  noticeQueue.push(() => showNotice(text, icon, actions, ms, opts))
  if (noticeQueue.length > 3) noticeQueue.shift()
  nextNotice()
}
function showNotice(text: string, icon: string, actions: { label: string; act: () => void }[], ms: number, opts: { quiet?: boolean }) {
  noticeUp = true
  const n = el('div', 'notice', `<span class="notice-icon">${icon}</span><span class="notice-text">${text}</span>`)
  const bar = el('span', 'notice-actions')
  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    n.classList.add('out')
    setTimeout(() => {
      n.remove()
      noticeUp = false
      setTimeout(nextNotice, 500)
    }, 350)
  }
  for (const a of actions) {
    const b = el('button', 'notice-btn', a.label)
    b.onclick = (e) => {
      e.stopPropagation()
      sfx.click()
      close()
      a.act()
    }
    bar.append(b)
  }
  const x = el('button', 'notice-x', '✕')
  x.onclick = (e) => {
    e.stopPropagation()
    close()
  }
  n.append(bar, x)
  stage.notices.append(n)
  setTimeout(close, ms)
  if (!opts.quiet) sfx.ding()
}
