import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { config } from './config.ts'

/**
 * Transactional email: waitlist confirmations, sign-in links and the "we're open" email, sent through Resend's HTTP API
 * (https://resend.com/docs/api-reference/emails/send-email) with plain fetch, no SDK.
 *
 *   RESEND_API_KEY   a Resend API key with "Sending access"
 *   EMAIL_FROM       who it's from, on a domain verified in Resend: `Club NYC <hello@mail.yourdomain.com>`
 *   EMAIL_REPLY_TO   optional: where replies go (defaults to CONTACT_EMAIL)
 *
 * Without them, development prints every email to the server log instead (one `[email] {...}` JSON line with its
 * links), so the waitlist and sign-in flows can be tested end to end. Production without them has no email at all:
 * the waitlist still takes addresses (no confirmation email) and "Continue with Email" is hidden.
 * See docs/sign-in-setup.md.
 */
const KEY = process.env.RESEND_API_KEY?.trim() ?? ''
const FROM = process.env.EMAIL_FROM?.trim() ?? ''
const REPLY_TO = (process.env.EMAIL_REPLY_TO ?? '').trim() || config.contactEmail
const API = 'https://api.resend.com'

/** Real email is set up (Resend) */
export const emailConfigured = !!(KEY && FROM)
/** Emails reach people, or (development) the server log */
export const canSendEmail = () => emailConfigured || config.dev

if (!config.dev && !emailConfigured)
  console.log('[email] RESEND_API_KEY / EMAIL_FROM are not set: no emails go out (waitlist confirmations, sign-in links). See docs/sign-in-setup.md.')
else if (config.dev && !emailConfigured) console.log('[email] development: emails are printed to this log, not sent (set RESEND_API_KEY and EMAIL_FROM to send real ones)')

// ---------- addresses ----------
/**
 * A tidy, lowercased address, or null. Deliberately plain: one @, a dotted domain with a real-looking ending, no spaces,
 * nothing a browser's own type="email" check would refuse. (Lowercase is how the waitlist and sign-in dedupe.)
 */
export function normalEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  if (email.length < 6 || email.length > 254) return null
  const at = email.lastIndexOf('@')
  if (at < 1 || at !== email.indexOf('@')) return null
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (local.length > 64 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null
  const labels = domain.split('.')
  if (labels.length < 2 || labels.some((l) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l))) return null
  // the ending is letters (com, nyc, co.uk) or an internationalised one (xn--…)
  const tld = labels[labels.length - 1]
  if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/.test(tld)) return null
  return email
}

// ---------- signed links (unsubscribe) ----------
/**
 * A secret for links that must keep working for months (the unsubscribe link in every waitlist email), without a column
 * to store a token in. EMAIL_LINK_SECRET if set, otherwise made once and kept next to the database (on Railway that's
 * the /data volume, so it survives deploys).
 */
const secret: Buffer = (() => {
  const fromEnv = process.env.EMAIL_LINK_SECRET?.trim()
  if (fromEnv) return Buffer.from(fromEnv)
  const file = `${config.dbPath}.secret`
  const read = () => {
    try {
      const hex = readFileSync(file, 'utf8').trim()
      return /^[0-9a-f]{64}$/.test(hex) ? Buffer.from(hex, 'hex') : null
    } catch {
      return null
    }
  }
  const have = read()
  if (have) return have
  const made = randomBytes(32)
  try {
    writeFileSync(file, made.toString('hex'), { mode: 0o600, flag: 'wx' })
    return made
  } catch {
    // someone else wrote it first (a second process starting), or the folder is read-only
    const again = read()
    if (again) return again
    console.error(`[email] WARNING: couldn't save the link secret next to the database (${file}): unsubscribe links will stop working after a restart. Set EMAIL_LINK_SECRET.`)
    return made
  }
})()

/** an HMAC of `what`, short and URL-safe */
export const signLink = (what: string) => createHmac('sha256', secret).update(what).digest('base64url').slice(0, 24)
export function checkLink(what: string, sig: string): boolean {
  const want = signLink(what)
  return sig.length === want.length && timingSafeEqual(Buffer.from(sig), Buffer.from(want))
}
/** a keyed fingerprint of an address: lets an unsubscribed address be recognised without keeping it */
export const fingerprint = (email: string) => createHmac('sha256', secret).update(`email:${email}`).digest('base64url')

// ---------- what an email looks like ----------
export interface EmailContent {
  subject: string
  /** the grey line inboxes show after the subject */
  preheader: string
  title: string
  /** plain text (escaped here) */
  paragraphs: string[]
  button?: { label: string; url: string }
  /** a wide picture across the top of the card (an image in app/public/email/, 1080 x 540) */
  hero?: { src: string; alt: string }
  /** a small "what's waiting" list under the button: a picture (app/public/email/, 400 x 280), a title and a line */
  features?: { heading: string; items: { img: string; title: string; text: string }[] }
  /** small print under the button, plain text */
  after?: string[]
  /** the waitlist emails' one-click unsubscribe link (also sent as List-Unsubscribe headers) */
  unsubscribeUrl?: string
  /** why they're getting it, at the bottom */
  reason?: string
}
export interface Mail {
  to: string
  subject: string
  html: string
  text: string
  headers?: Record<string, string>
  /** a Resend tag, letters and dashes: shows up in Resend's logs */
  tag: string
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const site = (path = '') => `${config.publicUrl}${path}`
const DISPLAY = `'Arial Rounded MT Bold', 'Helvetica Rounded', 'Helvetica Neue', Helvetica, Arial, sans-serif`
const BODY = `'Helvetica Neue', Helvetica, Arial, sans-serif`

/** The Club NYC look in an email: sky-blue page, a paper card with a thick ink border, a city picture across its top,
 * one big green button, and a short list of what's coming. Tables and inline styles only, so Gmail, Apple Mail and
 * Outlook all agree; every picture has alt text for inboxes that block images. */
export function renderEmail(c: EmailContent): { html: string; text: string } {
  const who = [config.companyName, config.mailingAddress].filter(Boolean).join(', ')
  const p = (t: string, extra = '') => `<p style="margin:0 0 14px;font-family:${BODY};font-size:16px;line-height:1.5;color:#1d2140;${extra}">${esc(t)}</p>`
  const button = c.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 22px;"><tr><td align="center" bgcolor="#2fa54a" style="border:3px solid #1d2140;border-radius:16px;background:#2fa54a;">
         <a href="${esc(c.button.url)}" style="display:inline-block;padding:13px 28px;font-family:${DISPLAY};font-size:19px;font-weight:bold;line-height:1.2;color:#ffffff;text-decoration:none;border-radius:13px;">${esc(c.button.label)}</a>
       </td></tr></table>`
    : ''
  const hero = c.hero
    ? `<tr><td style="padding:0;line-height:0;font-size:0;"><img src="${esc(site(c.hero.src))}" width="532" alt="${esc(c.hero.alt)}" style="display:block;width:100%;max-width:532px;height:auto;border:0;border-radius:20px 20px 0 0;"></td></tr>
<tr><td style="height:4px;line-height:4px;font-size:0;background:#1d2140;">&nbsp;</td></tr>`
    : ''
  const features = c.features
    ? `<tr><td style="padding:4px 30px 8px;">
<p style="margin:0 0 12px;font-family:${DISPLAY};font-size:19px;font-weight:bold;line-height:1.3;color:#1d2140;">${esc(c.features.heading)}</p>
${c.features.items
  .map(
    (f) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px;"><tr>
<td width="112" valign="top" style="width:112px;padding:0 14px 0 0;"><img src="${esc(site(f.img))}" width="112" height="78" alt="" style="display:block;width:112px;height:78px;border:3px solid #1d2140;border-radius:12px;"></td>
<td valign="top" style="font-family:${BODY};font-size:15px;line-height:1.45;color:#1d2140;"><b style="display:block;margin:2px 0 2px;font-family:${DISPLAY};font-size:16px;">${esc(f.title)}</b>${esc(f.text)}</td>
</tr></table>`,
  )
  .join('\n')}
</td></tr>`
    : ''
  const footer = [
    `<a href="${esc(site('/'))}" style="color:#1d2140;font-weight:bold;text-decoration:none;">Club NYC</a>, a cozy online New York.`,
    c.reason ? esc(c.reason) : '',
    who ? esc(who) : '',
    c.unsubscribeUrl ? `<a href="${esc(c.unsubscribeUrl)}" style="color:#1d2140;">Unsubscribe</a>` : '',
  ].filter(Boolean)
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${esc(c.subject)}</title>
</head>
<body style="margin:0;padding:0;background:#cde6fe;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#cde6fe;">${esc(c.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#cde6fe" style="background:#cde6fe;">
<tr><td align="center" style="padding:28px 12px 32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:540px;">
<tr><td align="center" style="padding:0 0 16px;"><a href="${esc(site('/'))}"><img src="${esc(site('/email/logo.png'))}" width="150" height="85" alt="Club NYC" style="display:block;width:150px;height:auto;border:0;"></a></td></tr>
<tr><td bgcolor="#fffdf6" style="background:#fffdf6;border:4px solid #1d2140;border-radius:24px;padding:0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${hero}
<tr><td style="padding:${c.hero ? 26 : 30}px 30px 4px;">
<h1 style="margin:0 0 12px;font-family:${DISPLAY};font-size:27px;line-height:1.2;font-weight:bold;color:#1d2140;">${esc(c.title)}</h1>
${c.paragraphs.map((t) => p(t)).join('\n')}
${button}
</td></tr>
${features}
${c.after?.length ? `<tr><td style="padding:4px 30px 14px;border-top:2px dashed #d9dcea;">${c.after.map((t) => p(t, 'margin:12px 0 0;font-size:14px;color:#4b5272;')).join('\n')}</td></tr>` : ''}
</table>
</td></tr>
<tr><td align="center" style="padding:18px 16px 0;font-family:${BODY};font-size:12px;line-height:1.6;color:#1d2140;">${footer.join('<br>')}</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
  const text = [
    c.title,
    '',
    ...c.paragraphs.flatMap((t) => [t, '']),
    ...(c.button ? [`${c.button.label}: ${c.button.url}`, ''] : []),
    ...(c.features ? [c.features.heading, ...c.features.items.map((f) => `- ${f.title}: ${f.text}`), ''] : []),
    ...(c.after ?? []).flatMap((t) => [t, '']),
    '--',
    'Club NYC, a cozy online New York.',
    ...(c.reason ? [c.reason] : []),
    ...(who ? [who] : []),
    ...(c.unsubscribeUrl ? [`Unsubscribe: ${c.unsubscribeUrl}`] : []),
  ].join('\n')
  return { html, text }
}

/** An email ready to send: the content rendered, plus one-click unsubscribe headers when it has an unsubscribe link. */
export function makeMail(to: string, c: EmailContent, tag: string): Mail {
  const { html, text } = renderEmail(c)
  const headers: Record<string, string> = {}
  if (c.unsubscribeUrl) {
    // RFC 8058: mail apps show their own Unsubscribe button, which POSTs to this address (no page, no questions)
    headers['List-Unsubscribe'] = `<${c.unsubscribeUrl}>`
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'
  }
  return { to, subject: c.subject, html, text, headers, tag }
}

// ---------- sending ----------
export interface SendResult {
  ok: boolean
  /** development: printed to the log instead */
  logged?: boolean
  error?: string
  /** a problem retrying won't fix (a bad key, an unverified domain, no quota left): stop sending */
  fatal?: boolean
  /** Resend refused something in the request itself (for a batch: maybe one bad address), so it's worth sending one by one */
  invalid?: boolean
}

const links = (text: string) => [...text.matchAll(/https?:\/\/[^\s<>"]+/g)].map((m) => m[0])
function printMail(m: Mail) {
  console.log(`[email] ${JSON.stringify({ to: m.to, subject: m.subject, tag: m.tag, links: links(m.text), note: 'development: printed here, not sent' })}`)
}

const body = (m: Mail) => ({
  from: FROM,
  to: [m.to],
  subject: m.subject,
  html: m.html,
  text: m.text,
  ...(REPLY_TO ? { reply_to: REPLY_TO } : {}),
  ...(m.headers && Object.keys(m.headers).length ? { headers: m.headers } : {}),
  tags: [{ name: 'kind', value: m.tag }],
})

const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms))

/** POST to Resend, retrying rate limits and server hiccups a couple of times. */
async function resend(path: string, payload: unknown, idempotencyKey?: string): Promise<SendResult & { json?: unknown }> {
  let last = ''
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(API + path, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      })
      const json = (await res.json().catch(() => null)) as { name?: string; message?: string } | null
      if (res.ok) return { ok: true, json }
      const name = json?.name ?? ''
      last = `${res.status} ${name} ${json?.message ?? ''}`.trim()
      // used up the quota, a bad or restricted key, an unverified sending domain, a bad From address: stop
      if (/quota_exceeded/.test(name) || res.status === 401 || res.status === 403 || ['invalid_from_address', 'invalid_access', 'missing_required_field', 'invalid_region'].includes(name))
        return { ok: false, error: last, fatal: true }
      // something about this request (for a batch, perhaps one address Resend won't take): retrying it as is won't help
      if (res.status >= 400 && res.status < 500 && res.status !== 429) return { ok: false, error: last, invalid: res.status === 400 || res.status === 422 }
      const after = Number(res.headers.get('retry-after'))
      await wait(Number.isFinite(after) && after > 0 ? Math.min(after, 10) * 1000 : 1000 * (attempt + 1))
    } catch (e) {
      last = String((e as Error)?.message ?? e)
      await wait(1000 * (attempt + 1))
    }
  }
  return { ok: false, error: last }
}

/** Send one email (or print it, in development). Never throws. */
export async function sendEmail(m: Mail): Promise<SendResult> {
  if (!emailConfigured) {
    if (!config.dev) return { ok: false, error: 'email-off', fatal: true }
    printMail(m)
    return { ok: true, logged: true }
  }
  const r = await resend('/emails', body(m))
  if (!r.ok) console.error(`[email] couldn't send "${m.subject}" (${m.tag}): ${r.error}`)
  return r
}

/**
 * Send up to 100 emails in one call (Resend's batch endpoint). The idempotency key makes a retried or re-run batch safe:
 * Resend sends a batch with the same key only once (keys last 24 hours).
 */
export async function sendBatch(mails: Mail[], idempotencyKey: string): Promise<SendResult> {
  if (!mails.length) return { ok: true }
  if (!emailConfigured) {
    if (!config.dev) return { ok: false, error: 'email-off', fatal: true }
    console.log(`[email] batch of ${mails.length} (development: printed, not sent): ${mails.map((m) => m.to).join(', ')}`)
    printMail(mails[0])
    return { ok: true, logged: true }
  }
  const r = await resend('/emails/batch', mails.map(body), idempotencyKey)
  if (!r.ok) console.error(`[email] batch of ${mails.length} failed: ${r.error}`)
  return r
}

/** a random one-time token for a link (only its hash is ever stored) */
export const newToken = () => randomBytes(32).toString('base64url')
export { site as siteUrl }
