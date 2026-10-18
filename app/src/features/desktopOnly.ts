import { pendingInvite, inviteLink } from '../net/invite'

/**
 * Club NYC is built for a keyboard and a big screen. Phones get a friendly page instead of a
 * broken game: send yourself the link, or (if you insist) try anyway.
 */
export function isPhone(): boolean {
  const coarse = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches
  return coarse && Math.min(screen.width, screen.height) < 820
}

export function desktopOnly(root: HTMLElement, carryOn: () => void) {
  // keep a friend's invite in the link you send yourself
  const invitedBy = pendingInvite()
  const url = invitedBy ? inviteLink(invitedBy) : location.origin + '/'
  const pitch = 'Club NYC, a cozy online New York. Open this on a computer:'
  const page = document.createElement('div')
  page.className = 'desktop-only'
  page.innerHTML = `<div class="do-card">
      <img src="/art/ui/logo.png" alt="Club NYC" class="do-logo">
      <h1>Best on a computer</h1>
      <p>Club NYC is a whole city in your browser, and it needs a keyboard and a bigger screen. Open this link on your laptop or desktop and you’re in.</p>
      <div class="do-link"><input readonly value="${url}" aria-label="Link to Club NYC"><button class="do-copy">Copy</button></div>
      <div class="do-actions">
        <a class="do-btn" href="mailto:?subject=${encodeURIComponent('Club NYC: open on my computer')}&body=${encodeURIComponent(`${pitch} ${url}`)}">✉️ Email it to myself</a>
        <a class="do-btn do-cal" download="club-nyc-reminder.ics">📅 Remind me tonight</a>
        ${'share' in navigator ? '<button class="do-btn do-share">↗️ Share</button>' : ''}
      </div>
      <img src="/art/rooms/times-square-v2.jpg" alt="Times Square in Club NYC" class="do-art">
      <button class="do-anyway">Try it anyway</button>
      <nav class="do-legal"><a href="/rules.html">Rules</a> · <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a></nav>
    </div>`
  root.append(page)
  page.querySelector<HTMLAnchorElement>('.do-cal')!.href = reminder(url)
  const input = page.querySelector('input')!
  page.querySelector<HTMLButtonElement>('.do-copy')!.onclick = async (e) => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      input.select()
      document.execCommand('copy')
    }
    ;(e.target as HTMLButtonElement).textContent = 'Copied ✓'
  }
  page.querySelector<HTMLButtonElement>('.do-share')?.addEventListener('click', () => void navigator.share({ title: 'Club NYC', text: pitch, url }).catch(() => {}))
  page.querySelector<HTMLButtonElement>('.do-anyway')!.onclick = () => {
    page.remove()
    carryOn()
  }
}

/** A calendar reminder for 8 pm tonight (or tomorrow, if it's already late) to open Club NYC on a computer. */
function reminder(url: string): string {
  const at = new Date()
  if (at.getHours() >= 20) at.setDate(at.getDate() + 1)
  at.setHours(20, 0, 0, 0)
  const end = new Date(at.getTime() + 30 * 60_000)
  const z = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Club NYC//Reminder//EN', 'BEGIN:VEVENT',
    `UID:${Date.now()}@clubnyc`, `DTSTAMP:${z(new Date())}`, `DTSTART:${z(at)}`, `DTEND:${z(end)}`,
    'SUMMARY:Hang out in Club NYC 🗽', `DESCRIPTION:Open this on your computer: ${url}`, `URL:${url}`,
    'BEGIN:VALARM', 'TRIGGER:-PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:Club NYC time!', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
  return 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics)
}
