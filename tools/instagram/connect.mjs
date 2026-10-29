// Connects the Club NYC Meta app to the Instagram account, once. Posts nothing.
//   node tools/instagram/connect.mjs
// Reads META_APP_ID, META_APP_SECRET, META_USER_TOKEN from the repo-root .env (a short-lived token from the Graph API
// Explorer), then:
//   1. checks the token and its permissions,
//   2. swaps it for a long-lived user token, and that for the Page's token (which doesn't expire),
//   3. finds the Instagram professional account linked to the Page, and its posting allowance,
//   4. writes META_PAGE_ID, META_PAGE_TOKEN, IG_USER_ID, IG_USERNAME back into .env for the publisher.
// Secrets are never printed: only names, ids, permissions and dates.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const ENV = join(ROOT, '.env')
process.loadEnvFile(ENV)
export const GRAPH = 'https://graph.facebook.com/v23.0'
const { META_APP_ID: appId, META_APP_SECRET: secret, META_USER_TOKEN: userToken } = process.env
if (!appId || !secret || !userToken) throw new Error('.env needs META_APP_ID, META_APP_SECRET and META_USER_TOKEN')

/** GET a Graph endpoint; Meta's error message comes back readable, without the token in it */
async function get(path, params) {
  const url = new URL(GRAPH + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url)
  const body = await res.json()
  if (body.error) throw new Error(`${path}: ${body.error.message} (code ${body.error.code}${body.error.error_subcode ? '/' + body.error.error_subcode : ''})`)
  return body
}
const when = (s) => (s ? new Date(s * 1000).toISOString().slice(0, 10) : 'never')

// 1. the token: valid, for this app, with which permissions
const dbg = (await get('/debug_token', { input_token: userToken, access_token: `${appId}|${secret}` })).data
console.log('token:', dbg.is_valid ? 'valid' : 'NOT valid', '· app:', dbg.application, '· expires:', when(dbg.expires_at))
console.log('permissions:', (dbg.scopes ?? []).join(', '))
const need = ['instagram_basic', 'instagram_content_publish', 'pages_show_list', 'pages_read_engagement']
const missing = need.filter((p) => !(dbg.scopes ?? []).includes(p))
if (!dbg.is_valid) throw new Error('the token is not valid: generate a new one in the Graph API Explorer')
if (missing.length) throw new Error('missing permissions: ' + missing.join(', ') + ' (add them in the Graph API Explorer and generate again)')

// 2. long-lived user token, then the Pages it manages (each with a Page token that doesn't expire)
const long = await get('/oauth/access_token', { grant_type: 'fb_exchange_token', client_id: appId, client_secret: secret, fb_exchange_token: userToken })
const pages = (await get('/me/accounts', { access_token: long.access_token, fields: 'id,name,access_token,instagram_business_account{id,username,name}' })).data
console.log('pages:', pages.map((p) => `${p.name} (${p.id})${p.instagram_business_account ? ' → @' + p.instagram_business_account.username : ' · no Instagram linked'}`).join(' · ') || 'none')
const page = pages.find((p) => p.instagram_business_account)
if (!page) throw new Error('none of these Pages has an Instagram professional account linked (Page settings → Linked accounts → Instagram)')
const ig = page.instagram_business_account

// 3. how many posts it may still publish today
const quota = (await get(`/${ig.id}/content_publishing_limit`, { fields: 'config,quota_usage', access_token: page.access_token })).data?.[0]
console.log(`instagram: @${ig.username} (${ig.id}) · posts used in the last 24 h: ${quota?.quota_usage ?? '?'} of ${quota?.config?.quota_total ?? '?'}`)
const pageDbg = (await get('/debug_token', { input_token: page.access_token, access_token: `${appId}|${secret}` })).data
console.log('page token expires:', when(pageDbg.expires_at))

// 4. save what the publisher needs (replacing earlier values), without echoing them
let env = readFileSync(ENV, 'utf8')
const set = (k, v) => {
  const line = `${k}=${v}`
  env = new RegExp(`^${k}=.*$`, 'm').test(env) ? env.replace(new RegExp(`^${k}=.*$`, 'm'), line) : env.trimEnd() + '\n' + line + '\n'
}
if (!/^# Filled in by tools\/instagram\/connect\.mjs/m.test(env)) env = env.trimEnd() + '\n\n# Filled in by tools/instagram/connect.mjs (the Page token does not expire; re-run the script if it stops working)\n'
set('META_PAGE_ID', page.id)
set('META_PAGE_TOKEN', page.access_token)
set('IG_USER_ID', ig.id)
set('IG_USERNAME', ig.username)
writeFileSync(ENV, env)
console.log('saved META_PAGE_ID, META_PAGE_TOKEN, IG_USER_ID, IG_USERNAME to .env')
