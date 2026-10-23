import './accountEmail.css'
import { sfx } from '../audio'
import { el } from '../engine/stage'
import { rest, HttpError } from '../net/server'

/**
 * "Link Email" on the player card's Account tab (playerCard.ts accountRow): a guest types their email and gets a
 * one-time link (POST /api/auth/email, server/src/auth.ts). Opening it, on any computer, links that email to this
 * New Yorker, so they can sign in with it anywhere. The link works once, for 15 minutes.
 */
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const masked = (email: string) => {
  const [local, domain] = email.split('@')
  return `${local.slice(0, 1)}•••@${domain ?? ''}`
}

export function openLinkEmail(box: HTMLElement, after: HTMLElement, name: string) {
  box.querySelector('.pc-email')?.remove()
  const wrap = el('div', 'pc-email')
  after.after(wrap)
  const form = () => {
    wrap.innerHTML = `<form class="pc-email-form" novalidate>
        <input class="pc-email-input" type="email" name="email" autocomplete="email" inputmode="email" maxlength="254" placeholder="you@email.com" aria-label="Your email">
        <button class="btn tiny go" type="submit">Email Me a Link</button>
        <button class="btn tiny ghost pc-email-cancel" type="button">Cancel</button>
      </form>
      <p class="pc-email-msg" aria-live="polite">We’ll email you a link. Open it to link your email to ${esc(name || 'your New Yorker')}.</p>`
    const input = wrap.querySelector<HTMLInputElement>('.pc-email-input')!
    const send = wrap.querySelector<HTMLButtonElement>('button[type=submit]')!
    const msg = wrap.querySelector<HTMLElement>('.pc-email-msg')!
    const say = (text: string, bad = false) => {
      msg.textContent = text
      msg.classList.toggle('bad', bad)
      input.setAttribute('aria-invalid', bad ? 'true' : 'false')
    }
    // the city's hotkeys (B, I, M…) stay out of the way while typing
    input.addEventListener('keydown', (e) => e.stopPropagation())
    wrap.querySelector<HTMLButtonElement>('.pc-email-cancel')!.onclick = () => {
      sfx.click()
      wrap.remove()
    }
    wrap.querySelector<HTMLFormElement>('form')!.onsubmit = async (e) => {
      e.preventDefault()
      const email = input.value.trim()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        say(email ? 'That email doesn’t look right. Check it and try again.' : 'Type your email first.', true)
        input.focus()
        return
      }
      sfx.click()
      send.disabled = true
      send.textContent = 'Sending…'
      try {
        await rest('/auth/email', { json: { email } })
        wrap.innerHTML = `<div class="pc-email-sent" role="status"><img src="/art/icons/e/envelope.png" alt="" width="128" height="95"><span><b>Check your inbox!</b> We sent a link to ${esc(masked(email))}. Open it to link your email. It works once, for 15 minutes.</span></div>`
        const again = el('button', 'btn tiny ghost', 'Use a Different Email')
        again.onclick = () => {
          sfx.click()
          form()
        }
        wrap.append(again)
      } catch (err) {
        send.disabled = false
        send.textContent = 'Email Me a Link'
        const status = err instanceof HttpError ? err.status : 0
        const reason = err instanceof HttpError ? err.reason : ''
        say(
          reason === 'bad-email'
            ? 'That email doesn’t look right. Check it and try again.'
            : status === 429
              ? 'We just sent a few links there. Check your inbox (and spam), or try again in a few minutes.'
              : 'Can’t reach the city right now. Try again in a moment.',
          true,
        )
        input.focus()
      }
    }
    setTimeout(() => input.focus({ preventScroll: true }), 50)
  }
  form()
}
