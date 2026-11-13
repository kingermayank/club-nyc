import { sfx } from '../audio'
import { el, stage } from '../engine/stage'
import { openOverlay, closeOverlay } from '../engine/ui'
import { MIN_AGE } from '../data/policy'

/**
 * Who can play, and agreeing to the city's rules.
 *  - A new New Yorker ticks one box: "I'm 13 or older, and I agree to the Terms, Privacy Policy and Community Rules".
 *    No birthday is asked (the owner's call, 2026-11-11). The server records which policy version they agreed to and
 *    when, and that they confirmed their age.
 *  - Players from before (or after a policy update) agree once more, in a panel, before heading back in.
 */
const LINKS =
  'the <a href="/terms.html" target="_blank" rel="noopener">Terms</a>, <a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a> and <a href="/rules.html" target="_blank" rel="noopener">Community Rules</a>'

/** The "13 or older + I agree" box: the creator's name screen and the consent panel both use it.
 * `age: false` (a returning player agreeing to updated policies) leaves out the age part. */
export function consentFields(o: { age?: boolean; agreed?: boolean } = {}) {
  const box = el('div', 'cr-consent')
  const age = o.age !== false
  const agree = el('label', 'cr-age', `<input type="checkbox" ${o.agreed ? 'checked' : ''}><span>${age ? `I’m ${MIN_AGE} or older, and I agree to ${LINKS}.` : `I agree to ${LINKS}.`}</span>`)
  box.append(agree)
  const tick = agree.querySelector('input')!
  return {
    box,
    agreed: () => tick.checked,
    /** what's missing, as the sentence to show and the field to shake (null = good to go) */
    problem(): { target: HTMLElement; msg: string } | null {
      if (!tick.checked) return { target: agree, msg: age ? `Tick the box to confirm you’re ${MIN_AGE} or older and agree to the rules.` : 'Tick the box to agree to the Terms, Privacy Policy and Community Rules.' }
      return null
    },
  }
}

/** shake a field that needs attention */
export function shake(target: HTMLElement) {
  target.classList.remove('shake')
  void target.offsetWidth
  target.classList.add('shake')
  sfx.squawk()
}

/** A friendly goodbye for someone under 13. (Online, the caller also deletes the guest account made for the visit.) */
export function tooYoungScreen() {
  stage.root.querySelectorAll('.creator').forEach((n) => n.remove())
  closeOverlay()
  const screen = el(
    'div',
    'creator signin too-young',
    `<div class="creator-bg"></div><img class="creator-logo" src="/art/ui/logo.png" alt="Club NYC">
    <div class="signin-card"><div class="panel-art">🗽</div><h2>Sorry, Not Yet!</h2>
    <p class="si-sub">Club NYC is for New Yorkers ${MIN_AGE} and older. We hope to see you when you’re ${MIN_AGE}!</p>
    <a class="btn ghost" href="/">Back to the home page</a></div>`,
  )
  stage.root.append(screen)
  stage.root.querySelector('.boot-splash')?.remove()
}

// ---------- the consent panel ----------
/**
 * Agree to the Terms, Privacy Policy and Community Rules before heading in. 'new': a New Yorker coming online for the
 * first time also confirms they're 13 or older. 'update': a returning player agrees to the current version.
 */
export function consentPanel(kind: 'new' | 'update'): Promise<void> {
  return new Promise((resolve) => {
    const p = el(
      'div',
      'panel consent-panel',
      kind === 'new'
        ? '<div class="panel-art">🗽</div><h2>One Quick Thing</h2><p>Your New Yorker is coming online. Agree to the rules of the city to bring them in.</p>'
        : '<div class="panel-art">📜</div><h2>Before You Head Back In</h2><p>Club NYC’s Terms, Privacy Policy and Community Rules have been updated. Please take a look and agree to keep playing.</p>',
    )
    const f = consentFields({ age: kind === 'new' })
    const err = el('div', 'cr-err')
    const ok = el('button', 'btn go', kind === 'new' ? 'Agree and Continue' : 'Agree and Play')
    // never a dead end: not agreeing is fine, it just means not playing right now (back to the home page)
    const later = el('button', 'btn ghost', 'Not Now')
    later.onclick = () => {
      sfx.click()
      location.href = '/'
    }
    let settled = false
    ok.onclick = () => {
      const problem = f.problem()
      if (problem) {
        err.textContent = problem.msg
        return shake(problem.target)
      }
      sfx.click()
      settled = true
      closeOverlay()
      resolve()
    }
    const btns = el('div', 'consent-btns')
    btns.append(later, ok)
    p.append(f.box, err, btns)
    // there's no way around it: closed without an answer (Escape), the panel comes straight back
    const show = () => openOverlay(p, { backdrop: false, onClose: () => void (settled || setTimeout(show, 0)) })
    show()
  })
}
