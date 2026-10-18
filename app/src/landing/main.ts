import './landing.css'

/**
 * The landing page's extras. Everything on it works without this script; it adds:
 *  - the header's solid look once you scroll,
 *  - "Welcome back" and a Continue button for people who've played before (their save is in this browser),
 *  - the live player count (only once the city is busy, and only real numbers),
 *  - phones: Club NYC plays on a computer, so Play offers to send the link there instead of a dead end,
 *  - pre-launch placeholders (no Discord invite or contact email yet) answer with a note instead of a broken link,
 *  - anonymous funnel events (landing → Play → creator → city) for the moderator dashboard. The game picks up
 *    this page's session id, so a visit and the New Yorker it turns into count as one journey.
 */

// ---------- funnel events (POST /api/events, the same endpoint the game uses) ----------
type LandingEvent = 'landing_view' | 'landing_play' | 'landing_discord' | 'landing_send'
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
const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)
const $$ = <T extends Element = HTMLElement>(sel: string) => [...document.querySelectorAll<T>(sel)]

// ---------- header ----------
const header = $('.site-header')!
const onScroll = () => header.classList.toggle('scrolled', scrollY > 24)
addEventListener('scroll', onScroll, { passive: true })
onScroll()

// ---------- a little note (for links that aren't ready yet, "Copied!", …) ----------
let toastEl: HTMLElement | null = null
function note(text: string) {
  toastEl?.remove()
  const t = document.createElement('div')
  t.className = 'l-toast'
  t.setAttribute('role', 'status')
  t.textContent = text
  document.body.append(t)
  toastEl = t
  setTimeout(() => t.remove(), 3200)
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
if (returning && !phone) {
  const hello = $('.welcome-back')!
  hello.textContent = `Welcome back, ${returning}!`
  hello.hidden = false
  for (const a of $$<HTMLAnchorElement>('a[data-play]')) a.href = '/play'
  playLabels('Continue playing', 'Continue')
}

// ---------- phones: send the link to a computer ----------
const sheet = $<HTMLDialogElement>('#phone-sheet')!
const home = `${location.origin}/`
if (phone) {
  playLabels('Send to my computer', 'Get the link')
  const heroNote = $('.hero-note')
  if (heroNote) heroNote.textContent = 'Club NYC plays on a computer. We’ll get you the link.'
  const mail = $<HTMLAnchorElement>('#sheet-email')!
  mail.href = `mailto:?subject=${encodeURIComponent('Club NYC: play on my computer')}&body=${encodeURIComponent(`Club NYC, a cozy online New York you can hang out in. Open this on a computer and press Play now: ${home}`)}`
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
      setTimeout(() => (copy.textContent = 'Copy the link'), 2000)
    } catch {
      note(`Here’s the link: ${home}`)
    }
  })
}

// ---------- Play now ----------
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
        label.textContent = 'Opening the city…'
      }
    }
    flush(true)
  })
}
// back from the game (the browser restores this page as it was): the buttons say Play again, not "Opening…"
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

track('landing_view', `${phone ? 'phone' : 'computer'}${returning ? ':returning' : ''}`)
