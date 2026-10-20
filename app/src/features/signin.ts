import { sfx } from '../audio'
import { el, stage } from '../engine/stage'
import { rest, type PublicUser } from '../net/server'
import { avatarPortrait } from '../avatar/render'
import { pendingInvite } from '../net/invite'

const GOOGLE_G = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`
const X_LOGO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64z"/></svg>`
const DISCORD_LOGO = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.32 4.37A19.8 19.8 0 0 0 15.4 2.84a.07.07 0 0 0-.08.04c-.21.38-.45.87-.61 1.25a18.27 18.27 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.88 1.53.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.22-2a.08.08 0 0 0-.04-.1 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1 0-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08 0l.37.3a.08.08 0 0 1 0 .13c-.6.35-1.22.65-1.87.9a.08.08 0 0 0-.04.1c.36.7.77 1.37 1.22 2a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.15-1.09-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42z"/></svg>`
const PROVIDERS = ['google', 'x', 'discord'] as const
type Provider = (typeof PROVIDERS)[number]
const LABEL: Record<Provider, string> = { google: 'Google', x: 'X', discord: 'Discord' }
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/**
 * The front door. "Play now" makes a guest account instantly — the fastest way in.
 * Google / X / Discord keep your New Yorker on every device (guests can link one later).
 * Arriving through a friend's /join/<name> link shows who invited you and where they are.
 */
export function signInScreen(error?: string): Promise<'guest' | 'offline'> {
  return new Promise((resolve) => {
    const screen = el('div', 'creator signin')
    screen.innerHTML = `<div class="creator-bg"></div>
      <img class="creator-logo" src="/art/ui/logo.png" alt="Club NYC">
      <div class="signin-card">
        <div class="si-invite" hidden></div>
        <h2>Welcome to the city!</h2>
        <p class="si-sub">A pocket-sized Manhattan to explore with real people. Work silly jobs, decorate a tiny apartment, dance in Times Square.</p>
        <div class="si-live"><i></i><span>Checking who’s around…</span></div>
        ${error ? `<div class="cr-err">${error}</div>` : ''}
        <button class="btn go si-play">Play now</button>
        <small class="si-note">No sign-up. You’ll make your New Yorker next.</small>
        <div class="si-or"><span>or keep your New Yorker on every device</span></div>
        <div class="si-providers">
          <button class="si-btn google" data-p="google" aria-label="Continue with Google">${GOOGLE_G}<span>Google</span></button>
          <button class="si-btn x" data-p="x" aria-label="Continue with X">${X_LOGO}<span>X</span></button>
          <button class="si-btn discord" data-p="discord" aria-label="Continue with Discord">${DISCORD_LOGO}<span>Discord</span></button>
        </div>
        <small class="si-fine">Playing as a guest? Link an account any time from your player card, and you keep everything.</small>
        <button class="si-offline">Play offline instead</button>
        <nav class="si-legal"><a href="/rules.html" target="_blank" rel="noopener">Community rules</a> · <a href="/privacy.html" target="_blank" rel="noopener">Privacy</a> · <a href="/terms.html" target="_blank" rel="noopener">Terms</a> · <span>13+</span></nav>
      </div>`
    stage.root.append(screen)
    stage.root.querySelector('.boot-splash')?.remove()
    let done = false
    const close = (v: 'guest' | 'offline') => {
      if (done) return
      done = true
      screen.classList.add('out')
      setTimeout(() => screen.remove(), 550)
      resolve(v)
    }
    const play = screen.querySelector<HTMLButtonElement>('.si-play')!
    play.onclick = () => {
      sfx.pop()
      play.disabled = true
      play.textContent = 'Opening the city…'
      close('guest')
    }
    screen.querySelector<HTMLButtonElement>('.si-offline')!.onclick = () => {
      sfx.click()
      close('offline')
    }
    const buttons = [...screen.querySelectorAll<HTMLButtonElement>('.si-btn')]
    for (const b of buttons) {
      b.onclick = () => {
        sfx.click()
        b.classList.add('busy')
        // full-page redirect to the provider; the server sends us back signed in
        location.href = `/api/auth/${b.dataset.p}`
      }
    }
    void rest<Record<Provider, boolean>>('/auth/providers')
      .then((p) => {
        const off = buttons.filter((b) => !p[b.dataset.p as Provider])
        if (!off.length) return
        if (!import.meta.env.DEV) {
          // a deployment without OAuth keys just doesn't offer those buttons
          off.forEach((b) => b.remove())
          if (off.length === buttons.length) screen.querySelectorAll('.si-or, .si-providers, .si-fine').forEach((n) => n.remove())
          return
        }
        for (const b of off) {
          b.disabled = true
          b.title = 'Not set up on this server yet'
        }
        screen.querySelector('.si-providers')!.append(el('small', 'si-dev', `Dev note: ${off.map((b) => LABEL[b.dataset.p as Provider]).join(', ')} sign-in turns on once OAuth keys are in <code>server/.env</code> (see .env.example).`))
      })
      .catch(() => {})
    const live = screen.querySelector<HTMLElement>('.si-live span')!
    void rest<{ count: number }>('/online')
      .then((r) => {
        live.textContent = r.count ? `${r.count} ${r.count === 1 ? 'New Yorker is' : 'New Yorkers are'} in the city right now` : 'Just the pigeons so far. Be the first one in!'
        screen.querySelector('.si-live')!.classList.add(r.count ? 'busy' : 'quiet')
      })
      .catch(() => (live.textContent = 'The city is open'))
    // came through a friend's invite link?
    const inviter = pendingInvite()
    if (inviter)
      void rest<{ user: PublicUser; online: boolean }>(`/invite/${encodeURIComponent(inviter)}`)
        .then(({ user, online }) => {
          const box = screen.querySelector<HTMLElement>('.si-invite')!
          box.innerHTML = `<div class="si-inv-face">${user.look ? avatarPortrait(user.look) : ''}</div>
            <div><b>${esc(user.name)}</b> invited you to Club NYC!<small>${online ? 'They’re in the city right now. Make your New Yorker and you’ll land right next to them.' : 'Make your New Yorker and you’ll be friends right away.'}</small></div>`
          box.hidden = false
          play.textContent = `Join ${user.name}`
        })
        .catch(() => {
          // no New Yorker by that name (a typo, or the account is gone): say so and forget the link
          const box = screen.querySelector<HTMLElement>('.si-invite')!
          box.innerHTML = `<div><b>We couldn’t find “${esc(inviter)}”.</b><small>The invite link may be mistyped. Jump in anyway and look for them in the city.</small></div>`
          box.hidden = false
          void import('../net/invite').then((m) => m.clearInvite())
        })
    // Enter plays (a key handler rather than focusing the button, so no focus ring sits on it before anyone types)
    const onKey = (e: KeyboardEvent) => {
      if (done || !screen.isConnected) return document.removeEventListener('keydown', onKey)
      if (e.key === 'Enter' && (document.activeElement === document.body || document.activeElement === play)) {
        e.preventDefault()
        play.click()
      }
    }
    document.addEventListener('keydown', onKey)
  })
}
