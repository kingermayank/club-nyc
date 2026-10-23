/**
 * The landing page (app/index.html) and the policy pages carry a few placeholders until launch. The server fills them
 * from its settings so nobody has to edit HTML: CONTACT_EMAIL, COMPANY_NAME, GOVERNING_STATE, MAILING_ADDRESS and
 * DISCORD_INVITE_URL (see config.ts and server/.env.example).
 * The Vite dev server uses the same helpers (app/vite.config.ts), so /discord works in development too.
 */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/**
 * Fill [CONTACT EMAIL], [COMPANY NAME], [GOVERNING STATE] and [MAILING ADDRESS]. On the policy pages (legal) each is
 * only filled when it's really set: those pages need the real details, so a placeholder stays visible until then.
 */
export function fillPlaceholders(
  html: string,
  o: { contactEmail: string; companyName: string; governingState?: string; mailingAddress?: string; legal?: boolean },
) {
  let out = html
  const fill = (key: string, value: string | undefined) => {
    if (value) out = out.split(key).join(esc(value))
  }
  fill('[CONTACT EMAIL]', o.contactEmail)
  fill('[COMPANY NAME]', o.companyName || (o.legal ? '' : 'Club NYC'))
  fill('[GOVERNING STATE]', o.governingState)
  fill('[MAILING ADDRESS]', o.mailingAddress)
  return out
}

/** Only real Discord invites (discord.gg/… or discord.com/invite/…), so a typo can't send players somewhere else. */
export function discordInvite(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return null
    if (u.hostname === 'discord.gg' && /^\/[\w-]+\/?$/.test(u.pathname)) return u.toString()
    if ((u.hostname === 'discord.com' || u.hostname === 'www.discord.com') && /^\/invite\/[\w-]+\/?$/.test(u.pathname)) return u.toString()
  } catch {
    /* not a URL */
  }
  return null
}

/** Where /discord sends people: the server invite, or back to the landing page with an "opens soon" note. */
export const discordTarget = (url: string) => discordInvite(url) ?? '/?discord=soon#community'

/**
 * Launch modes (LAUNCH_MODE, see server/src/waitlist.ts): "waitlist" before launch, "open" once the city is open.
 * The landing page carries both versions of its calls to action; `data-launch` on <html> picks one (landing.css), and the
 * title and link-preview text say Coming Soon. The production server applies this once at start-up; the dev server
 * (app/vite.config.ts) asks the game server for the mode on every page load.
 */
export type LaunchMode = 'waitlist' | 'open'

/** the game's pages: in waitlist mode the Coming Soon page (app/soon.html) stands in for them */
export const GAME_PAGE = /^\/(?:play\/?|play\.html|join\/[^/]+\/?)$/

const SOON_META = {
  title: 'Club NYC (Coming Soon): Cozy Multiplayer NYC Game in Your Browser',
  description: 'A cozy online New York is coming soon. Make a New Yorker, explore 20+ places, work silly jobs and hang out with friends. Join the waitlist and we’ll email you the day it opens.',
  social: 'Club NYC (Coming Soon)',
  socialDescription: 'Waddle on over to New York. A cozy online New York opens soon: join the waitlist and we’ll email you the day the doors open.',
}

export function landingForMode(html: string, mode: LaunchMode): string {
  const out = html.replace(/<html lang="en"[^>]*>/, `<html lang="en" data-launch="${mode}">`)
  if (mode !== 'waitlist') return out
  return out
    .replace(/<title>[^<]*<\/title>/, `<title>${SOON_META.title}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${SOON_META.description}`)
    .replace(/(property="og:title" content=")[^"]*/, `$1${SOON_META.social}`)
    .replace(/(name="twitter:title" content=")[^"]*/, `$1${SOON_META.social}`)
    .replace(/(property="og:description" content=")[^"]*/, `$1${SOON_META.socialDescription}`)
    .replace(/(name="twitter:description" content=")[^"]*/, `$1${SOON_META.socialDescription}`)
}
