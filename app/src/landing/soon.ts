import './landing.css'
import './soon.css'
import { heroVideos, trailerDialog } from './media'
import { waitlistForms, waitlistCount } from './waitlist'

/**
 * The Coming Soon page (app/soon.html): what /play and /join/<name> show while the city is in waitlist mode.
 *  - The waitlist form (waitlist.ts). From a friend's invite link, it says who invited you and the signup remembers
 *    them (the waitlist's `referrer`).
 *  - The gameplay loop behind the card (paused for less motion, with a pause button), and the trailer.
 *  - /play?preview=<wrong code> comes back here with ?code=wrong: say so.
 */
const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)

const params = new URLSearchParams(location.search)
if (params.get('code') === 'wrong') {
  $('.soon-code')!.hidden = false
  history.replaceState(null, '', location.pathname)
}

// came through a friend's invite link (/join/<name>)?
const inviter = /^\/join\/([A-Za-z0-9_]{1,14})\/?$/.exec(location.pathname)?.[1]
waitlistForms({ ref: inviter })
if (inviter) {
  for (const f of document.querySelectorAll<HTMLFormElement>('form.wl-form')) f.dataset.source = 'join'
  fetch(`/api/invite/${encodeURIComponent(inviter)}`)
    .then((r) => (r.ok ? (r.json() as Promise<{ user?: { name?: string } }>) : null))
    .then((r) => {
      const name = r?.user?.name
      if (!name) return
      const box = $('.soon-invite')!
      const b = document.createElement('b')
      b.textContent = name
      const img = document.createElement('img')
      Object.assign(img, { src: '/art/icons/e/love-letter.png', alt: '', width: 40, height: 30 })
      const words = document.createElement('p')
      words.append(b, ' invited you to Club NYC!')
      box.replaceChildren(img, words)
      box.hidden = false
    })
    .catch(() => {})
}

waitlistCount((n) => {
  const line = $('.soon-count')!
  line.querySelector('span')!.textContent = `${n.toLocaleString('en-US')} New Yorkers are already in line`
  line.hidden = false
})

heroVideos()
trailerDialog()
