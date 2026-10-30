import './cookieBanner.css'
import { consentDecided, setConsent } from '../consent'

/**
 * The cookie banner (landing page only: it's where analytics start, see ../consent.ts). It asks once, in the
 * corner, without covering the page; both answers are the same size, so saying no is as easy as saying yes.
 * "Cookie Settings" links ([data-cookie-settings]) open it again. Without JavaScript they lead to the Cookie Policy,
 * which has the same two buttons.
 */
let open: HTMLElement | null = null

export function cookieBanner() {
  for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-cookie-settings]'))
    a.addEventListener('click', (e) => {
      e.preventDefault()
      show(true)
    })
  if (!consentDecided()) show(false)
}

function show(focus: boolean) {
  if (open) {
    if (focus) open.querySelector('button')?.focus()
    return
  }
  const box = document.createElement('section')
  box.className = 'cookie-banner'
  box.setAttribute('aria-labelledby', 'cookie-banner-title')
  box.innerHTML = `
    <div class="cb-copy">
      <p class="cb-title" id="cookie-banner-title">Cookies on Club NYC</p>
      <p class="cb-text">We use cookies to keep you signed in and save your game. With your OK, we’ll also count visits anonymously to improve Club NYC. <a href="/cookies.html">Cookie Policy</a></p>
    </div>
    <div class="cb-actions">
      <button class="btn btn-ghost btn-sm" type="button" data-analytics="no">Necessary Only</button>
      <button class="btn btn-ghost btn-sm" type="button" data-analytics="yes">Allow Analytics</button>
    </div>`
  for (const b of box.querySelectorAll<HTMLButtonElement>('button[data-analytics]'))
    b.addEventListener('click', () => {
      setConsent(b.dataset.analytics === 'yes')
      close()
    })
  document.body.append(box)
  document.documentElement.classList.add('has-cookie-banner')
  // room at the bottom of the page (cookieBanner.css), so nothing ends up stuck under the banner (its height changes with the width)
  new ResizeObserver(() => document.documentElement.style.setProperty('--cookie-banner-h', `${box.offsetHeight + 24}px`)).observe(box)
  open = box
  if (focus) box.querySelector('button')?.focus()
}

function close() {
  open?.remove()
  open = null
  document.documentElement.classList.remove('has-cookie-banner')
}
