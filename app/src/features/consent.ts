import { sfx } from '../audio'
import { el, stage } from '../engine/stage'
import { openOverlay, closeOverlay } from '../engine/ui'
import { MIN_AGE, oldEnough } from '../data/policy'

/**
 * Who can play, and agreeing to the city's rules.
 *  - A new New Yorker gives a birth month and year (a neutral age question: every year is on the list, nothing is
 *    pre-picked) and ticks "I agree to the Terms, Privacy Policy and Community Rules". The server records which
 *    version they agreed to and when; the birthday is only checked, never stored.
 *  - A birthday that works out under 13 gets one look first ("Is that your birthday?"), so a slip in the 100-year
 *    list can be fixed. It never says why it's asking, and it's offered once per visit.
 *  - Under 13: a friendly goodbye, and nothing from the visit is kept. "Back to the home page" is the way out, and
 *    Play now there starts over (no lock: the owner's call, see docs/launch/legal-callouts.md).
 *  - Players from before (or after a policy update) agree once more, in a panel, before heading back in.
 */
export interface Birth {
  m: number
  y: number
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const LINKS =
  'the <a href="/terms.html" target="_blank" rel="noopener">Terms</a>, <a href="/privacy.html" target="_blank" rel="noopener">Privacy Policy</a> and <a href="/rules.html" target="_blank" rel="noopener">Community Rules</a>'

/** The birthday and "I agree" fields: the creator's name screen and the consent panel both use them. */
export function consentFields(o: { birthday?: boolean; birth?: Birth | null; agreed?: boolean } = {}) {
  const box = el('div', 'cr-consent')
  let month: HTMLSelectElement | null = null
  let year: HTMLSelectElement | null = null
  if (o.birthday !== false) {
    const row = el('div', 'cr-dob', '<span class="cr-dob-label">Birthday</span>')
    month = document.createElement('select')
    month.className = 'cr-month'
    month.setAttribute('aria-label', 'Birth month')
    month.innerHTML = '<option value="">Month</option>' + MONTHS.map((m, i) => `<option value="${i + 1}">${m}</option>`).join('')
    year = document.createElement('select')
    year.className = 'cr-year'
    year.setAttribute('aria-label', 'Birth year')
    const now = new Date().getFullYear()
    year.innerHTML = '<option value="">Year</option>' + Array.from({ length: 100 }, (_, i) => now - i).map((y) => `<option value="${y}">${y}</option>`).join('')
    if (o.birth) {
      month.value = String(o.birth.m)
      year.value = String(o.birth.y)
    }
    // (the game's keys shouldn't fire while you pick)
    for (const s of [month, year]) s.addEventListener('keydown', (e) => e.stopPropagation())
    row.append(month, year)
    box.append(row)
  }
  const agree = el('label', 'cr-age', `<input type="checkbox" ${o.agreed ? 'checked' : ''}><span>I agree to ${LINKS}.</span>`)
  box.append(agree)
  const tick = agree.querySelector('input')!
  const birth = (): Birth | null => (month && year && month.value && year.value ? { m: Number(month.value), y: Number(year.value) } : null)
  return {
    box,
    birth,
    /** back to the year (after "Let me fix it") */
    fixBirthday: () => year?.focus(),
    agreed: () => tick.checked,
    /** what's missing, as the sentence to show and the field to shake (null = good to go) */
    problem(): { target: HTMLElement; msg: string } | null {
      if (month && year && !birth()) return { target: box.querySelector<HTMLElement>('.cr-dob')!, msg: 'Pick your birth month and year.' }
      if (!tick.checked) return { target: agree, msg: 'Tick the box to agree to the Terms, Privacy Policy and Community Rules.' }
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

// ---------- under 13 ----------
export const isOldEnough = (b: Birth) => oldEnough(b.m, b.y)

/**
 * One look before the goodbye: "Is that your birthday? You picked June 2016." Neutral on purpose (it never mentions
 * the age limit, so it doesn't hint at a "right" answer); it just catches a slip in a long list. Resolves true when
 * they say it's right, false when they want to fix it (closing it counts as fixing it).
 */
export function confirmBirthday(b: Birth): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const done = (sure: boolean) => {
      if (settled) return
      settled = true
      resolve(sure)
    }
    const p = el('div', 'panel birthday-check', `<div class="panel-art">📅</div><h2>Is That Your Birthday?</h2><p>You picked <b>${MONTHS[b.m - 1]} ${b.y}</b>.</p>`)
    const row = el('div', 'choices two')
    const fix = el('button', 'btn ghost', 'Let Me Fix It')
    const yes = el('button', 'btn go', 'Yes, That’s Right')
    fix.onclick = () => {
      sfx.click()
      done(false)
      closeOverlay()
    }
    yes.onclick = () => {
      sfx.click()
      done(true)
      closeOverlay()
    }
    row.append(fix, yes)
    p.append(row)
    // (above the New Yorker creator too, which sits over the usual overlay layer)
    openOverlay(p, { backdrop: false, onClose: () => done(false), cls: 'over-creator' })
  })
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
 * first time also gives a birthday. 'update': a returning player agrees to the current version. Resolves with the
 * birthday ('new'), null ('update'), or 'too-young'.
 */
export function consentPanel(kind: 'new' | 'update'): Promise<{ birth: Birth | null } | 'too-young'> {
  return new Promise((resolve) => {
    const p = el(
      'div',
      'panel consent-panel',
      kind === 'new'
        ? '<div class="panel-art">🗽</div><h2>One Quick Thing</h2><p>Your New Yorker is coming online. Tell us your birthday and agree to the rules of the city.</p>'
        : '<div class="panel-art">📜</div><h2>Before You Head Back In</h2><p>Club NYC’s Terms, Privacy Policy and Community Rules have been updated. Please take a look and agree to keep playing.</p>',
    )
    const f = consentFields({ birthday: kind === 'new' })
    const err = el('div', 'cr-err')
    const ok = el('button', 'btn go', kind === 'new' ? 'Agree and Continue' : 'Agree and Play')
    // never a dead end: not agreeing is fine, it just means not playing right now (back to the home page)
    const later = el('button', 'btn ghost', 'Not Now')
    later.onclick = () => {
      sfx.click()
      location.href = '/'
    }
    let settled = false
    // the birthday check is open on top: closing this panel for it isn't "closed without an answer"
    let checking = false
    // one "Let me fix it" per visit
    let checked = false
    ok.onclick = () => {
      const problem = f.problem()
      if (problem) {
        err.textContent = problem.msg
        return shake(problem.target)
      }
      sfx.click()
      const birth = f.birth()
      if (kind === 'new' && birth && !isOldEnough(birth)) {
        if (checked) {
          settled = true
          closeOverlay()
          return resolve('too-young')
        }
        checked = true
        checking = true
        void confirmBirthday(birth).then((sure) => {
          checking = false
          if (sure) {
            settled = true
            return resolve('too-young')
          }
          show()
          f.fixBirthday()
        })
        return
      }
      settled = true
      closeOverlay()
      resolve({ birth })
    }
    const btns = el('div', 'consent-btns')
    btns.append(later, ok)
    p.append(f.box, err, btns)
    // there's no way around it: closed without an answer (Escape), the panel comes straight back
    const show = () => openOverlay(p, { backdrop: false, onClose: () => void (settled || checking || setTimeout(show, 0)) })
    show()
  })
}
