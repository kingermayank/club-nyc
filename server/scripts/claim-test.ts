/**
 * "Claim your name" end to end, on a throwaway database: the waitlist holds a username for an email, nobody else can
 * take it (on the waitlist or in the city), and the launch email's Claim link signs that person in with the name on
 * their account, once.
 *   npx tsx server/scripts/claim-test.ts
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'club-claim-')), 'test.sqlite')
process.env.EMAIL_LINK_SECRET = 'claim-test-secret'
process.env.PUBLIC_URL = 'http://localhost:5173'
const { Hono } = await import('hono')
const { waitlist, previewContent } = await import('../src/waitlist.ts')
const { auth } = await import('../src/auth.ts')
const { api } = await import('../src/api.ts')
const { signLink, renderEmail } = await import('../src/email.ts')
const { q } = await import('../src/db.ts')

const app = new Hono()
app.route('/api/waitlist', waitlist)
app.route('/api/auth', auth)
app.route('/api', api)

let failed = 0
const check = (what: string, ok: boolean, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗'} ${what}${detail ? ` (${detail})` : ''}`)
  if (!ok) failed++
}
const json = async (path: string, init?: RequestInit) => (await app.request(path, init)).json() as Promise<Record<string, unknown>>
const post = (path: string, body: unknown) => json(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

console.log('waitlist names')
check('a fresh name is available', (await json('/api/waitlist/name?name=Sleepy_Bagel')).ok === true)
check('bad names are refused with a reason', (await json('/api/waitlist/name?name=a')).ok === false)
const joined = await post('/api/waitlist', { name: 'Sleepy_Bagel', email: 'bea@example.com', source: 'test' })
check('joining with a name keeps it', joined.ok === true && joined.name === 'Sleepy_Bagel', JSON.stringify(joined))
check('then it is taken on the waitlist', (await json('/api/waitlist/name?name=sleepy_bagel')).ok === false)
const other = await app.request('/api/waitlist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Sleepy_Bagel', email: 'someone@example.com' }) })
check('someone else can’t claim it', other.status === 409)
check('and it is taken in the city too', (await json('/api/name-available?name=Sleepy_Bagel')).ok === false)
const again = await post('/api/waitlist', { name: 'Sleepy_Bagel', email: 'bea@example.com' })
check('the same person joining again is fine', again.ok === true && again.status === 'already')

console.log('emails')
const row = q.get<{ id: number }>('SELECT id FROM waitlist WHERE email = ?', 'bea@example.com')!
const confirm = previewContent.confirm(row.id, 'token', 'Sleepy_Bagel')
const launch = previewContent.launch(row.id, 'Sleepy_Bagel')
check('confirmation greets by name', confirm.title === 'Hi Sleepy_Bagel, your name is saved!', confirm.title)
check('launch greets by name', launch.title === 'Hi Sleepy_Bagel, the city is open!', launch.title)
check('launch button claims the name', launch.button?.label === 'Claim Sleepy_Bagel' && launch.button.url.includes('/api/auth/claim?u='), launch.button?.url)
const html = renderEmail(launch).html
check('no copy-this-link fallback in the email', !html.includes('Button not working'))
check('no real store names or browser line', !/Joe’s Pizza|web browser/.test(html))

console.log('claim')
const link = `/api/auth/claim?u=${row.id}.${signLink(`waitlist-claim:${row.id}`)}`
const res = await app.request(link)
const cookie = res.headers.get('set-cookie') ?? ''
check('the claim link signs them in', res.status === 302 && cookie.includes('club_sid='), `${res.status} → ${res.headers.get('location')}`)
const me = await json('/api/me', { headers: { cookie: cookie.split(';')[0] } })
const user = me.user as { name?: string; profileDone?: boolean } | null
check('their account has the name, creator still to do', user?.name === 'Sleepy_Bagel' && user.profileDone === false, JSON.stringify(user))
check('the name stays theirs in the creator', (await json('/api/name-available?name=Sleepy_Bagel', { headers: { cookie: cookie.split(';')[0] } })).ok === true)
check('but taken for everyone else', (await json('/api/name-available?name=Sleepy_Bagel')).ok === false)
const twice = await app.request(link)
check('the link works once', twice.status === 302 && (twice.headers.get('location') ?? '').includes('email=expired'), twice.headers.get('location') ?? '')
check('a forged link does nothing', (await app.request(`/api/auth/claim?u=${row.id}.xxxxxxxxxxxxxxxxxxxxxxxx`)).headers.get('location')?.includes('email=expired') === true)

console.log(failed ? `\n${failed} FAILED` : '\nall claim tests passed')
process.exit(failed ? 1 : 0)
