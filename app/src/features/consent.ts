import { sfx } from '../audio'
import { el, stage } from '../engine/stage'
import { openOverlay, closeOverlay } from '../engine/ui'
import { MIN_AGE, oldEnough } from '../data/policy'

/**
 * Who can play, and agreeing to the city's rules.
 *  - A new New Yorker gives a birth month and year (a neutral age question: every year is on the list, nothing is
 *    pre-picked) and ticks "I agree to the Terms, Privacy Policy and Community Rules". The server records which
 *    version they agreed to and when; the birthday is only checked, never stored.
 *  - Under 13: a friendly goodbye, nothing from the visit is kept, and this browser can't simply go back and try
 *    another year for a day.
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
    row.append(month, year, el('small', 'cr-dob-note', 'To check your age. We don’t keep it.'))
    box.append(row)
  }
  const agree = el('label', 'cr-age', `<input type="checkbox" ${o.agreed ? 'checked' : ''}><span>I agree to ${LINKS}.</span>`)
  box.append(agree)
  const tick = agree.querySelector('input')!
  const birth = (): Birth | null => (month && year && month.value && year.value ? { m: Number(month.value), y: Number(year.value) } : null)
  return {
    box,
    birth,
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
const BLOCK_KEY = 'club-nyc:too-young'
const BLOCK_MS = 24 * 3600_000
/** this browser said "under 13" in the last day (no going back to pick another year) */
export function tooYoungRecently(): boolean {
  try {
    const t = Number(localStorage.getItem(BLOCK_KEY))
    return t > 0 && Date.now() - t < BLOCK_MS
  } catch {
    return false
  }
}
export const isOldEnough = (b: Birth) => oldEnough(b.m, b.y)

/** A friendly goodbye for someone under 13. (Online, the caller also deletes the guest account made for the visit.) */
export function tooYoungScreen() {
  try {
    localStorage.setItem(BLOCK_KEY, String(Date.now()))
  } catch {
    /* private mode */
  }
  stage.root.querySelectorAll('.creator').forEach((n) => n.remove())
  closeOverlay()
  const screen = el(
    'div',
    'creator signin too-young',
    `<div class="creator-bg"></div><img class="creator-logo" src="/art/ui/logo.png" alt="Club NYC">
    <div class="signin-card"><div class="panel-art">🗽</div><h2>Sorry, not yet!</h2>
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
        ? '<div class="panel-art">🗽</div><h2>One quick thing</h2><p>Your New Yorker is coming online. Tell us your birthday and agree to the rules of the city.</p>'
        : '<div class="panel-art">📜</div><h2>Before you head back in</h2><p>Club NYC’s Terms, Privacy Policy and Community Rules have been updated. Please take a look and agree to keep playing.</p>',
    )
    const f = consentFields({ birthday: kind === 'new' })
    const err = el('div', 'cr-err')
    const ok = el('button', 'btn go', kind === 'new' ? 'Agree and continue' : 'Agree and play')
    let settled = false
    ok.onclick = () => {
      const problem = f.problem()
      if (problem) {
        err.textContent = problem.msg
        return shake(problem.target)
      }
      sfx.click()
      const birth = f.birth()
      settled = true
      closeOverlay()
      if (kind === 'new' && birth && !isOldEnough(birth)) return resolve('too-young')
      resolve({ birth })
    }
    p.append(f.box, err, ok)
    // there's no way around it: closed without an answer (Escape), the panel comes straight back
    const show = () => openOverlay(p, { backdrop: false, onClose: () => void (settled || setTimeout(show, 0)) })
    show()
  })
}
