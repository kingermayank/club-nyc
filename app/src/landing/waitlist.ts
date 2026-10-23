import './waitlist.css'

/**
 * The launch waitlist's email forms (form.wl-form) on the landing page, its sheet and the Coming Soon page.
 *  - POST /api/waitlist { email, source, ref, website }: `source` is where on the site (data-source), `ref` the friend
 *    whose invite link brought you, `website` the honeypot field people never see.
 *  - Joined: every form on the page turns into "You're on the list!", and this browser remembers it (a flag, never the
 *    address), with "Use a Different Email" to join with another one.
 *  - The honest count (GET /api/waitlist/count) shows only once it's big enough to mean something.
 */
type Reply =
  | { ok: true; status: 'added'; confirm: boolean }
  | { ok: true; status: 'already'; pending: boolean; resent: boolean }
  | { ok?: false; error: string }

const JOINED_KEY = 'club-nyc:waitlist'
const remembered = () => {
  try {
    return localStorage.getItem(JOINED_KEY) === '1'
  } catch {
    return false
  }
}
const remember = (on: boolean) => {
  try {
    if (on) localStorage.setItem(JOINED_KEY, '1')
    else localStorage.removeItem(JOINED_KEY)
  } catch {
    /* private mode: nothing to remember with */
  }
}

/** a quick look before bothering the server (it checks again, properly) */
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)

const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') => {
  const e = document.createElement(tag)
  if (className) e.className = className
  if (text) e.textContent = text
  return e
}

function doneBlock(title: string, line: string): HTMLElement {
  const box = make('div', 'wl-done')
  box.setAttribute('role', 'status')
  // focusable from script (after joining, and from the "Join the Waitlist" buttons) but not a Tab stop
  box.tabIndex = -1
  const img = make('img')
  Object.assign(img, { src: '/art/icons/e/party-popper.png', alt: '', width: 52, height: 52 })
  const words = make('div')
  words.append(make('b', '', title), make('span', '', line))
  box.append(img, words)
  return box
}

interface Options {
  /** the friend whose invite link brought you here (the Coming Soon page at /join/<name>) */
  ref?: string
  /** after a successful join (the landing page counts it) */
  onJoin?: (source: string) => void
}

const forms: HTMLFormElement[] = []
let joinedView: { title: string; line: string } | null = null

/** every form on the page shows the same state: joined (a celebration) or the empty form */
function syncAll() {
  for (const f of forms) {
    f.querySelector('.wl-done')?.remove()
    f.querySelector('.wl-again')?.remove()
    const body = f.querySelector<HTMLElement>('.wl-body')!
    body.hidden = !!joinedView
    if (!joinedView) continue
    const again = make('button', 'wl-again', 'Use a Different Email')
    again.type = 'button'
    again.addEventListener('click', () => {
      joinedView = null
      remember(false)
      syncAll()
      f.querySelector<HTMLInputElement>('.wl-input')?.focus()
    })
    f.append(doneBlock(joinedView.title, joinedView.line), again)
  }
}

function wire(form: HTMLFormElement, opts: Options) {
  const input = form.querySelector<HTMLInputElement>('.wl-input')!
  const button = form.querySelector<HTMLButtonElement>('button[type=submit]')!
  const label = button.querySelector<HTMLElement>('.wl-label') ?? button
  const msg = form.querySelector<HTMLElement>('.wl-msg')!
  const honeypot = form.querySelector<HTMLInputElement>('input[name=website]')
  const idle = label.textContent ?? 'Join the Waitlist'
  const say = (text: string) => {
    msg.textContent = text
    input.setAttribute('aria-invalid', text ? 'true' : 'false')
  }
  input.addEventListener('input', () => msg.textContent && say(''))
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = input.value.trim()
    if (!email) {
      say('Type your email first, then press Join the Waitlist.')
      input.focus()
      return
    }
    if (!looksLikeEmail(email)) {
      say('That email doesn’t look right. Check it and try again.')
      input.focus()
      return
    }
    say('')
    button.disabled = true
    label.textContent = 'Joining…'
    const source = form.dataset.source || 'page'
    let reply: Reply
    let status = 0
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source, ref: opts.ref, website: honeypot?.value ?? '' }),
      })
      status = res.status
      reply = (await res.json().catch(() => ({ error: 'oops' }))) as Reply
    } catch {
      reply = { error: 'offline' }
    }
    button.disabled = false
    label.textContent = idle
    if (!('status' in reply) || !reply.ok) {
      const err = 'error' in reply ? reply.error : ''
      say(
        err === 'bad-email'
          ? 'That email doesn’t look right. Check it and try again.'
          : status === 429 || err === 'slow-down'
            ? 'That’s a lot of tries. Wait a minute, then try again.'
            : 'We couldn’t reach the city. Check your connection and try again.',
      )
      input.focus()
      return
    }
    input.value = ''
    if (reply.status === 'added') {
      joinedView = reply.confirm
        ? { title: 'You’re on the list!', line: 'One more step: check your inbox and confirm your email.' }
        : { title: 'You’re on the list!', line: 'We’ll email you the day the city opens. Until then, practice your New York walk.' }
      opts.onJoin?.(source)
    } else
      joinedView = reply.pending
        ? { title: 'Already on the list', line: reply.resent ? 'We sent your confirmation email again. Check your inbox (and the spam folder).' : 'Check your inbox for our email and confirm your spot.' }
        : { title: 'Already on the list', line: 'That email is already in line. We’ll be in touch the day the city opens.' }
    remember(true)
    syncAll()
    // keyboard and screen-reader users land on the news, not on a vanished button
    form.querySelector<HTMLElement>('.wl-done')?.focus({ preventScroll: true })
  })
}

/** Wire every waitlist form on the page. */
export function waitlistForms(opts: Options = {}) {
  for (const form of document.querySelectorAll<HTMLFormElement>('form.wl-form')) {
    forms.push(form)
    wire(form, opts)
  }
  // back again after joining: say so, rather than asking twice
  if (remembered()) joinedView = { title: 'You’re on the list!', line: 'We’ll email you the day the city opens.' }
  syncAll()
}

/** "Join 1,240 New Yorkers in line": only real numbers, and only once there are enough to mean something */
export function waitlistCount(apply: (count: number) => void) {
  fetch('/api/waitlist/count')
    .then((r) => (r.ok ? (r.json() as Promise<{ count: number | null }>) : null))
    .then((r) => {
      if (r && typeof r.count === 'number' && r.count > 0) apply(r.count)
    })
    .catch(() => {})
}

/** put the cursor in the first visible waitlist field (the "Join the Waitlist" buttons) */
export function focusWaitlist(form: HTMLFormElement | null) {
  const input = form?.querySelector<HTMLInputElement>('.wl-input')
  if (input && !input.closest('[hidden]')) input.focus({ preventScroll: true })
  else form?.querySelector<HTMLElement>('.wl-done')?.focus({ preventScroll: true })
}
