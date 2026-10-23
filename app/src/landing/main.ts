import './landing.css'
import { heroVideos, trailerDialog } from './media'
import { cityStats } from './stats'
import { waitlistForms, waitlistCount, focusWaitlist } from './waitlist'
import { jamState } from '../data/jam'

/**
 * The landing page's extras. Everything on it works without this script; it adds:
 *  - the header's solid look once you scroll,
 *  - before launch (LAUNCH_MODE=waitlist, <html data-launch="waitlist">): the waitlist forms, the "Join the Waitlist"
 *    sheet, the honest count of people in line, and notes for the links in our emails (confirmed, unsubscribed),
 *  - after launch: "Welcome back" and a Continue button for people who've played before (their save is in this browser),
 *  - the live player count (only once the city is busy, and only real numbers), and the departures board (stats.ts),
 *  - phones: Club NYC plays on a computer, so Play offers to send the link there instead of a dead end,
 *  - pre-launch placeholders (no Discord invite or contact email yet) answer with a note instead of a broken link,
 *  - the hero's silent gameplay loop, and "Watch the Trailer" (media.ts),
 *  - the tiles' gameplay loops (loaded as you scroll near them) and the Dance Jam countdown, on the game's own clock,
 *  - anonymous funnel events (landing → Play → creator → city) for the moderator dashboard. The game picks up
 *    this page's session id, so a visit and the New Yorker it turns into count as one journey.
 */

// ---------- funnel events (POST /api/events, the same endpoint the game uses) ----------
type LandingEvent = 'landing_view' | 'landing_play' | 'landing_discord' | 'landing_send' | 'landing_trailer'
const SESSION_KEY = 'club-nyc:session'
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
const session = (() => {
  try {
    const s = sessionStorage.getItem(SESSION_KEY) ?? newId()
    sessionStorage.setItem(SESSION_KEY, s)
    return s
  } catch {
    return newId()
  }
})()
let queue: { name: LandingEvent; detail?: string }[] = []
let timer = 0
function flush(keepalive = false) {
  clearTimeout(timer)
  if (!queue.length) return
  const events = queue.slice(0, 20)
  queue = queue.slice(20)
  void fetch('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session, events }), keepalive }).catch(() => {})
}
function track(name: LandingEvent, detail?: string) {
  queue.push({ name, ...(detail ? { detail: detail.slice(0, 40) } : {}) })
  clearTimeout(timer)
  timer = window.setTimeout(() => flush(), 1500)
}
addEventListener('pagehide', () => flush(true))

// ---------- who's here ----------
/** the game's own phone check (features/desktopOnly.ts): a touch screen with no mouse, phone-sized */
const isPhone = () => matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches && Math.min(screen.width, screen.height) < 820
/** the New Yorker saved in this browser, if you've made one */
function savedName(): string | null {
  try {
    const s = JSON.parse(localStorage.getItem('club-nyc:v2') ?? 'null') as { created?: boolean; name?: unknown } | null
    return s?.created && typeof s.name === 'string' && s.name ? s.name : null
  } catch {
    return null
  }
}
const phone = isPhone()
const returning = savedName()
/** before launch: the server marked the page (LAUNCH_MODE=waitlist) */
const soon = document.documentElement.dataset.launch === 'waitlist'
const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)
const $$ = <T extends Element = HTMLElement>(sel: string) => [...document.querySelectorAll<T>(sel)]

// ---------- header ----------
const header = $('.site-header')!
const onScroll = () => header.classList.toggle('scrolled', scrollY > 24)
addEventListener('scroll', onScroll, { passive: true })
onScroll()

// ---------- a little note (for links that aren't ready yet, "Copied!", the links in our emails…) ----------
let toastEl: HTMLElement | null = null
function note(text: string, ms = 3200) {
  toastEl?.remove()
  const t = document.createElement('div')
  t.className = 'l-toast'
  t.setAttribute('role', 'status')
  t.textContent = text
  document.body.append(t)
  toastEl = t
  setTimeout(() => t.remove(), ms)
}

// ---------- the waitlist (before launch) ----------
const joinSheet = $<HTMLDialogElement>('#join-sheet')!
if (soon) {
  waitlistForms()
  // "Join 1,240 New Yorkers in line": a real count, and only once it's big enough to mean something
  waitlistCount((n) => {
    const line = $('.wl-count')
    if (!line) return
    line.querySelector('span')!.textContent = `${n.toLocaleString('en-US')} New Yorkers are already in line`
    line.hidden = false
  })
  // the header, mid-page and footer buttons: the hero's form if it's right there, otherwise the sheet
  const heroForm = $<HTMLFormElement>('.hero-join .wl-form')
  const sheetForm = joinSheet.querySelector<HTMLFormElement>('.wl-form')!
  const inView = (el: Element | null) => {
    const r = el?.getBoundingClientRect()
    return !!r && r.height > 0 && r.top >= 64 && r.bottom <= innerHeight
  }
  for (const a of $$<HTMLAnchorElement>('[data-join]'))
    a.addEventListener('click', (e) => {
      e.preventDefault()
      if (inView(heroForm?.querySelector('.wl-body:not([hidden]) .wl-input') ?? heroForm?.querySelector('.wl-done') ?? null)) {
        heroForm!.classList.remove('wl-flash')
        void heroForm!.offsetWidth
        heroForm!.classList.add('wl-flash')
        focusWaitlist(heroForm)
        return
      }
      sheetForm.dataset.source = `sheet-${a.dataset.join ?? 'button'}`
      joinSheet.showModal()
      focusWaitlist(sheetForm)
    })
  // a click on the dimmed page around the sheet closes it
  joinSheet.addEventListener('click', (e) => {
    if (e.target === joinSheet) joinSheet.close()
  })
  // phones: you can join from here, and play on a computer when the doors open
  if (phone) {
    const heroNote = $('.hero-note')
    if (heroNote) {
      heroNote.textContent = 'Club NYC plays on a computer. Join the list here, then play on your laptop when we open.'
      heroNote.hidden = false
    }
  }
  // testers (the preview code was entered in this browser) get a way into the city
  fetch('/api/launch')
    .then((r) => (r.ok ? (r.json() as Promise<{ preview?: boolean }>) : null))
    .then((r) => {
      if (!r?.preview) return
      const a = document.createElement('a')
      a.className = 'preview-link'
      a.href = '/play'
      a.textContent = 'Preview Unlocked: Open the City'
      $('.hero-copy')?.append(a)
    })
    .catch(() => {})
}

// the links in our emails come back here: say what happened
{
  const status = new URLSearchParams(location.search).get('waitlist')
  const say: Record<string, string> = {
    confirmed: 'You’re confirmed! We’ll email you the day the city opens.',
    unsubscribed: 'You’re off the list. No more emails from us. Changed your mind? Join again any time.',
    'bad-link': 'That link didn’t work. It may be old or already used. You can join the waitlist again any time.',
  }
  if (status && say[status]) {
    history.replaceState(null, '', location.pathname + location.hash)
    try {
      if (status === 'confirmed') localStorage.setItem('club-nyc:waitlist', '1')
      if (status === 'unsubscribed') localStorage.removeItem('club-nyc:waitlist')
    } catch {
      /* private mode */
    }
    setTimeout(() => note(say[status], 7000), 300)
  }
}

// ---------- returning players: straight back in ----------
/** relabel every Play button: the big ones keep their arrow, the header one stays short */
function playLabels(big: string, short: string) {
  for (const a of $$<HTMLAnchorElement>('a[data-play]')) {
    const label = a.querySelector('.play-label')
    if (label) label.textContent = big
    else a.textContent = a.dataset.play === 'header' ? short : big
  }
}
if (returning && !phone && !soon) {
  const hello = $('.welcome-back')!
  hello.textContent = `Welcome back, ${returning}!`
  hello.hidden = false
  for (const a of $$<HTMLAnchorElement>('a[data-play]')) a.href = '/play'
  playLabels('Continue Playing', 'Continue')
}

// ---------- phones: send the link to a computer ----------
const sheet = $<HTMLDialogElement>('#phone-sheet')!
const home = `${location.origin}/`
if (phone && !soon) {
  playLabels('Send to My Computer', 'Get the Link')
  const heroNote = $('.hero-note')
  if (heroNote) {
    heroNote.textContent = 'Club NYC plays on a computer. We’ll get you the link.'
    heroNote.hidden = false
  }
  const mail = $<HTMLAnchorElement>('#sheet-email')!
  mail.href = `mailto:?subject=${encodeURIComponent('Club NYC: play on my computer')}&body=${encodeURIComponent(`Club NYC, a cozy online New York you can hang out in. Open this on a computer and press Play Now: ${home}`)}`
  mail.addEventListener('click', () => track('landing_send', 'email'))
  // the phone's own share sheet (AirDrop, Messages, email to yourself) is the quickest way to a computer
  const share = $<HTMLButtonElement>('#sheet-share')!
  const copy = $<HTMLButtonElement>('#sheet-copy')!
  if (navigator.share) {
    share.hidden = false
    share.addEventListener('click', () => {
      track('landing_send', 'share')
      void navigator.share({ title: 'Club NYC', text: 'A cozy online New York. Open this on a computer:', url: home }).catch(() => {})
    })
  } else copy.classList.replace('btn-ghost', 'btn-play')
  copy.addEventListener('click', async () => {
    track('landing_send', 'copy')
    try {
      await navigator.clipboard.writeText(home)
      copy.textContent = 'Copied!'
      setTimeout(() => (copy.textContent = 'Copy the Link'), 2000)
    } catch {
      note(`Here’s the link: ${home}`)
    }
  })
}

// ---------- Play Now ----------
for (const a of $$<HTMLAnchorElement>('a[data-play]')) {
  a.addEventListener('click', (e) => {
    track('landing_play', `${a.dataset.play}${phone ? ':phone' : ''}`)
    if (phone) {
      e.preventDefault()
      sheet.showModal()
    } else {
      // the city takes a moment to open: say so right away
      const label = a.querySelector<HTMLElement>('.play-label')
      if (label) {
        label.dataset.was = label.textContent ?? ''
        label.textContent = 'Opening the City…'
      }
    }
    flush(true)
  })
}
// back from the game (the browser restores this page as it was): the buttons say Play Now again, not "Opening…"
addEventListener('pageshow', (e) => {
  if (!e.persisted) return
  for (const label of $$('.play-label[data-was]')) label.textContent = label.dataset.was ?? label.textContent
})

// ---------- pre-launch placeholders: a note, never a broken link ----------
// (/discord comes back here with ?discord=soon until the server has an invite; [CONTACT EMAIL] until it has an email)
if (new URLSearchParams(location.search).get('discord') === 'soon') {
  history.replaceState(null, '', location.pathname + location.hash)
  setTimeout(() => note('Our Discord opens soon. Check back here!'), 300)
}
for (const a of $$<HTMLAnchorElement>('a[href*="[CONTACT"]')) {
  a.addEventListener('click', (e) => {
    e.preventDefault()
    note('Our contact email is on its way.')
  })
}
for (const a of $$<HTMLAnchorElement>('a[data-discord]')) a.addEventListener('click', () => track('landing_discord', a.dataset.discord))

// ---------- the live count: real numbers, and only once there's a crowd ----------
if (!soon)
  fetch('/api/online')
    .then((r) => (r.ok ? (r.json() as Promise<{ count?: number }>) : null))
    .then((r) => {
      const n = r?.count ?? 0
      // a handful of people reads as "empty": the count only shows once the city is busy
      if (n < 20) return
      const live = $('.live-count')!
      live.querySelector('span')!.textContent = `${n.toLocaleString('en-US')} New Yorkers in the city right now`
      live.hidden = false
    })
    .catch(() => {})

// ---------- the departures board: real totals (after launch), or the doors and the line (before) ----------
cityStats(soon)

// ---------- the gameplay loop and the trailer ----------
heroVideos()
trailerDialog((from) => track('landing_trailer', from))

// ---------- the tiles: each one's loop loads as you scroll near it and plays only while you can see it ----------
// (people who prefer less motion, or whose browser asks to save data, get the still)
const lessMotion = matchMedia('(prefers-reduced-motion: reduce)').matches || !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
const playing = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      const v = e.target as HTMLVideoElement
      if (e.isIntersecting) void v.play().catch(() => {})
      else v.pause()
    }
  },
  { threshold: 0.35 },
)
const nearby = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue
      const v = e.target as HTMLVideoElement
      nearby.unobserve(v)
      v.poster = `/video/clips/${v.dataset.clip}.webp`
      if (lessMotion) continue
      v.src = `/video/clips/${v.dataset.clip}.mp4`
      playing.observe(v)
    }
  },
  { rootMargin: '400px 0px' },
)
for (const v of $$<HTMLVideoElement>('video[data-clip]')) nearby.observe(v)

// ---------- the Dance Jam tile counts down on the game's own clock (a show every 8 minutes) ----------
// (before launch there's no show to count down to: the tile just says how often they happen)
const jamCount = soon ? null : $('.jam-count')
const jamWhen = soon ? null : $('.jam-when')
function jamTick() {
  if (!jamCount || !jamWhen) return
  const j = jamState()
  const left = Math.max(0, Math.ceil(((j.on ? j.end : j.next) - Date.now()) / 1000))
  const mmss = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`
  jamCount.textContent = j.on ? 'On now!' : mmss
  jamWhen.textContent = j.on ? `${mmss} left in Times Square` : 'until the next one in Times Square'
}
jamTick()
setInterval(jamTick, 1000)

track('landing_view', `${phone ? 'phone' : 'computer'}${returning ? ':returning' : ''}${soon ? ':soon' : ''}`)
