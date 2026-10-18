/**
 * The landing page (app/index.html) and the policy pages carry a few placeholders until launch. The server fills them
 * from its settings so nobody has to edit HTML: CONTACT_EMAIL, COMPANY_NAME, GOVERNING_STATE, MAILING_ADDRESS and
 * DISCORD_INVITE_URL (see config.ts and server/.env.example).
 * It also turns the landing page's "What's new" list into the RSS feed at /updates.xml (one list to keep up to date).
 * The Vite dev server uses the same helpers (app/vite.config.ts), so /discord and /updates.xml work in development too.
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

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    .trim()

/** RSS 2.0 for the landing page's "What's new" list (newest first: each <li class="update" id="…">). */
export function updatesFeed(landingHtml: string, publicUrl: string): string {
  const start = landingHtml.indexOf('<ol class="updates">')
  const end = landingHtml.indexOf('</ol>', start)
  const list = start >= 0 && end > start ? landingHtml.slice(start, end) : ''
  const items = list
    .split('<li class="update"')
    .slice(1)
    .map((chunk) => {
      const id = /id="([^"]+)"/.exec(chunk)?.[1] ?? ''
      const date = /datetime="(\d{4}-\d{2}-\d{2})"/.exec(chunk)?.[1] ?? ''
      const title = text(/<h3[^>]*>([\s\S]*?)<\/h3>/.exec(chunk)?.[1] ?? '')
      const points = [...chunk.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => {
        const tag = /<b class="tag[^"]*">([^<]+)<\/b>/.exec(m[1])?.[1]
        const body = text(m[1].replace(/<b class="tag[^"]*">[^<]+<\/b>/, ''))
        return `<li>${tag ? `<b>${esc(tag)}:</b> ` : ''}${esc(body)}</li>`
      })
      if (!id || !date || !title) return ''
      const link = `${publicUrl}/#${id}`
      return `    <item>
      <title>${esc(title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="true">${esc(link)}</guid>
      <pubDate>${new Date(`${date}T16:00:00Z`).toUTCString()}</pubDate>
      <description>${esc(`<ul>${points.join('')}</ul>`)}</description>
    </item>`
    })
    .filter(Boolean)
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Club NYC: what’s new</title>
    <link>${esc(publicUrl)}/</link>
    <description>New places, features and fixes in Club NYC, a cozy online New York.</description>
    <language>en</language>
    <atom:link href="${esc(publicUrl)}/updates.xml" rel="self" type="application/rss+xml" />
${items.join('\n')}
  </channel>
</rss>
`
}
