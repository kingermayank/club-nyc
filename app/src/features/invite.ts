import { sfx } from '../audio'
import { save, bump } from '../state'
import { el } from '../engine/stage'
import { openOverlay, closeButton, toast } from '../engine/ui'
import { link } from '../net/link'
import { rest } from '../net/server'
import { inviteLink } from '../net/invite'
import { account } from '../net/session'
import { REFERRAL } from '../data/economy'

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
    p.insertAdjacentHTML('afterbegin', `<div class="panel-art">💌</div><h2>Invite friends</h2><p>Invites work when you’re playing online. Sign in from the front door and come back here for your link.</p>`)
    return openOverlay(p)
  }
  const url = inviteLink(save.name)
  const no = account.me?.memberNo ?? 0
  const pitch = `Come hang out with me in Club NYC, a cozy online New York. Make a New Yorker in 30 seconds and you’ll land right next to me 🗽`
  p.insertAdjacentHTML(
    'afterbegin',
    `<div class="inv-head"><div class="panel-art">💌</div><div><h2>Bring your friends to the city</h2>
      <p class="inv-sub">Anyone who opens your link lands right next to you, and you’re friends instantly.</p></div></div>
    <div class="inv-link"><input readonly value="${esc(url)}" aria-label="Your invite link"><button class="btn go inv-copy">Copy link</button></div>
    <div class="inv-share"></div>
    <div class="inv-perks">
      <div><b>+${REFERRAL.welcome}</b><small>coins for your friend when they arrive</small></div>
      <div><b>+${REFERRAL.reward}</b><small>coins for you once they’ve played ${REFERRAL.activationMs / 60000} minutes</small></div>
      <div><b>💌 👯 🏙️</b><small>stamps at 1, 3 and 10 friends</small></div>
    </div>
    <div class="inv-stats"><span class="inv-loading">Counting your crew…</span></div>
    ${no ? `<p class="inv-member">You’re New Yorker <b>No. ${String(no).padStart(4, '0')}</b></p>` : ''}
    <small class="inv-fine">Up to ${REFERRAL.dailyCap} paid invites a day. Invites are for real friends: farming accounts gets them removed.</small>`,
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
    setTimeout(() => (copy.textContent = 'Copy link'), 1800)
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
        box.innerHTML = '<span>No one yet. Your first friend gets you the <b>Bring a Friend</b> stamp.</span>'
        return
      }
      box.innerHTML = `<b>${s.count}</b> ${s.count === 1 ? 'friend has' : 'friends have'} joined through you${s.earned ? ` · <b>${s.earned}</b> coins earned` : ''}
        <ul>${s.recent.slice(0, 6).map((r) => `<li>${esc(r.name)}<small>${r.active ? '✓ playing' : 'just arrived'}</small></li>`).join('')}</ul>`
    })
    .catch(() => (p.querySelector<HTMLElement>('.inv-stats')!.textContent = ''))
}
