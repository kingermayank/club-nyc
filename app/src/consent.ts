/**
 * Cookie consent: what this browser said about optional analytics.
 *
 * Club NYC only uses what it needs to work (the sign-in cookie, the game's save in this browser, "you've joined
 * the waitlist"), and that needs no permission. The one optional thing is analytics: anonymous funnel events
 * (POST /api/events) and the visit id in sessionStorage that ties a landing-page visit to the New Yorker it turns
 * into. Those wait for "Allow Analytics" in the landing page's banner (landing/cookieBanner.ts).
 *
 * The choice lives in localStorage under KEY as {"v":1,"analytics":true|false,"at":<ms>} and is asked again after
 * a year. The Cookie Policy page writes the same record (app/public/legal.js): keep the two in step.
 * A browser sending Global Privacy Control counts as "Necessary Only" until it says otherwise.
 */
const KEY = 'club-nyc:consent'
const VERSION = 1
const YEAR = 365 * 86400_000

type Stored = { v: number; analytics: boolean; at: number }
const listeners = new Set<(analytics: boolean) => void>()

/** the saved choice, or null when this browser hasn't chosen (or chose over a year ago) */
export function consentChoice(): Stored | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null
    if (!s || s.v !== VERSION || typeof s.analytics !== 'boolean' || !(Date.now() - s.at < YEAR)) return null
    return s
  } catch {
    return null
  }
}

/** Global Privacy Control: the browser asks sites not to share or track */
export const gpc = () => (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true

/** may this page send analytics? Only after "Allow Analytics" */
export const analyticsAllowed = () => consentChoice()?.analytics === true

/** has this browser been asked? (GPC answers for it) */
export const consentDecided = () => consentChoice() !== null || gpc()

export function setConsent(analytics: boolean) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: VERSION, analytics, at: Date.now() } satisfies Stored))
    // "no" also forgets this tab's visit number
    if (!analytics) sessionStorage.removeItem('club-nyc:session')
  } catch {
    /* storage blocked: nothing is saved, so analytics stay off and the banner asks again next visit */
  }
  for (const fn of listeners) fn(analytics)
}

/** run when this page's choice changes (send what was waiting, or drop it) */
export function onConsentChange(fn: (analytics: boolean) => void) {
  listeners.add(fn)
}
