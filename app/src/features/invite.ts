import { sfx } from '../audio'
import { save, bump } from '../state'
import { el } from '../engine/stage'
import { openOverlay, closeButton, toast } from '../engine/ui'
import { link } from '../net/link'
import { rest } from '../net/server'
import { inviteLink } from '../net/invite'
import { account } from '../net/session'
import { REFERRAL } from '../data/economy'
import { coinIcon } from '../game'

/** the X logo (the 𝕏 character comes from a fallback font that sits off the label's line) */
const X_LOGO = `<svg class="inv-x" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18.24 2.25h3.31l-7.23 8.26 8.5 11.24h-6.66l-5.21-6.82-5.97 6.82H1.67l7.73-8.84L1.25 2.25h6.83l4.71 6.23 5.45-6.23zm-1.16 17.52h1.83L7.08 4.13H5.12l11.96 15.64z"/></svg>`

/**
 * "Bring your friends to the city." Your link is /join/<your name>: whoever opens it lands next to you,
 * you're friends right away, they get welcome coins and you get paid once they've really played.
 */
interface Stats {
  count: number
  earned: number
  recent: { name: string; at: number; active: boolean }[]
}
const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export function openInvite() {
  sfx.whoosh()
  const p = el('div', 'panel wide invite-panel')
  p.append(closeButton())
  if (!link.account || !save.owner) {
    // a small centred card, not the wide invite layout
    p.className = 'panel'
    p.insertAdjacentHTML('afterbegin', `<div class="panel-art">💌</div><h2>Invite Friends</h2><p>Sign in to get your link.</p>`)
    const go = el('button', 'btn go', 'Sign In')
    // the front door: this page without the offline / test-save switches
    go.onclick = () => (location.href = location.pathname)
    p.append(go)
    return openOverlay(p)
  }
  const url = inviteLink(save.name)
  const no = account.me?.memberNo ?? 0
  const pitch = `Come hang out with me in Club NYC, a cozy online New York. No rent, no subway delays. Make a New Yorker in 30 seconds and you’ll land right next to me 🗽`
  p.insertAdjacentHTML(
    'afterbegin',
    `<div class="inv-head"><span class="inv-art" aria-hidden="true">💌</span><h2>Bring Friends to the City</h2>${no ? `<span class="inv-no" title="Your New Yorker number">No. ${String(no).padStart(4, '0')}</span>` : ''}</div>
    <p class="inv-sub">They land right next to you.</p>
    <div class="inv-link"><input readonly value="${esc(url)}" aria-label="Your invite link"><button class="btn go inv-copy">Copy Link</button></div>
    <div class="inv-share"></div>
    <div class="inv-perks">
      <div><b>${coinIcon}+${REFERRAL.welcome}</b><small>For them</small></div>
      <div><b>${coinIcon}+${REFERRAL.reward}</b><small>For you</small></div>
      <div><b class="inv-stamps">💌👯🏙️</b><small>Stamps</small></div>
    </div>
    <div class="inv-stats"><span class="inv-crew"><i></i><i></i><i></i></span><span class="inv-loading">Your crew</span></div>
    <small class="inv-fine">Up to ${REFERRAL.dailyCap} paid invites a day. Real friends only.</small>`,
  )
  const input = p.querySelector<HTMLInputElement>('.inv-link input')!
  const copy = p.querySelector<HTMLButtonElement>('.inv-copy')!
  copy.onclick = async () => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      input.select()
      document.execCommand('copy')
    }
    sfx.pop()
    bump('shares')
    copy.textContent = 'Copied! ✓'
    setTimeout(() => (copy.textContent = 'Copy Link'), 1800)
    toast('Link copied! Send it to someone who needs more New York in their life 🗽', '💌')
  }
  input.onclick = () => input.select()
  const share = p.querySelector<HTMLElement>('.inv-share')!
  const enc = encodeURIComponent
  const targets: [string, string, string][] = [
    ['💬', 'Text', `sms:?&body=${enc(`${pitch} ${url}`)}`],
    ['🟢', 'WhatsApp', `https://wa.me/?text=${enc(`${pitch} ${url}`)}`],
    [X_LOGO, 'Post on X', `https://x.com/intent/tweet?text=${enc(pitch)}&url=${enc(url)}`],
    ['✉️', 'Email', `mailto:?subject=${enc('Come hang out in Club NYC')}&body=${enc(`${pitch}\n\n${url}`)}`],
  ]
  if (navigator.share) {
    const b = el('button', 'btn small ghost', '↗️ Share…')
    b.onclick = () => {
      bump('shares')
      void navigator.share({ title: 'Club NYC', text: pitch, url }).catch(() => {})
    }
    share.append(b)
  }
  for (const [icon, label, href] of targets) {
    const a = el('a', 'btn small ghost', `${icon} ${label}`) as HTMLAnchorElement
    a.href = href
    a.target = '_blank'
    a.rel = 'noopener'
    a.onclick = () => bump('shares')
    share.append(a)
  }
  openOverlay(p)
  void rest<Stats>('/referrals')
    .then((s) => {
      const box = p.querySelector<HTMLElement>('.inv-stats')!
      if (!s.count) {
        box.innerHTML = '<span class="inv-crew"><i></i><i></i><i></i></span><span>No one yet</span>'
        return
      }
      box.innerHTML = `<span class="inv-crew">${s.recent.slice(0, 6).map((r) => `<i class="on${r.active ? ' active' : ''}" title="${esc(r.name)}">${esc(r.name.slice(0, 1).toUpperCase())}</i>`).join('')}</span>
        <span><b>${s.count}</b> joined${s.earned ? `, <b translate="no">${coinIcon}${s.earned}</b> earned` : ''}</span>`
    })
    .catch(() => (p.querySelector<HTMLElement>('.inv-stats')!.textContent = ''))
}
