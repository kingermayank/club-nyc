/**
 * Renders the waitlist emails to HTML files, exactly as the server sends them, without sending anything.
 *   npx --prefix server tsx server/scripts/email-preview.ts [out-dir]      (default: scratch/email-previews)
 * Images point at PUBLIC_URL (default http://localhost:5173, so run the app's dev server to see them).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

process.env.EMAIL_LINK_SECRET ||= 'preview-only-not-a-real-secret'
const { renderEmail } = await import('../src/email.ts')
const { previewContent } = await import('../src/waitlist.ts')

const out = resolve(process.argv[2] ?? join(import.meta.dirname, '../../scratch/email-previews'))
mkdirSync(out, { recursive: true })
const emails = {
  'waitlist-confirm': previewContent.confirm(1, 'preview-token', 'Taxi_Tina'),
  'waitlist-launch': previewContent.launch(1, 'Taxi_Tina'),
}
for (const [name, content] of Object.entries(emails)) {
  const { html, text } = renderEmail(content)
  writeFileSync(join(out, `${name}.html`), html)
  writeFileSync(join(out, `${name}.txt`), `Subject: ${content.subject}\n\n${text}`)
  console.log(`${name}: "${content.subject}" → ${join(out, name)}.html`)
}
process.exit(0)
