// The Instagram media bucket (Railway, S3 API), with no SDK: AWS Signature V4 by hand, like server/src/ops.ts.
// Reads SOCIAL_S3_ENDPOINT, SOCIAL_S3_BUCKET, SOCIAL_S3_REGION, SOCIAL_S3_ACCESS_KEY_ID, SOCIAL_S3_SECRET_ACCESS_KEY.
// Virtual-host style (https://<bucket>.<endpoint host>/<key>), which is how Railway's buckets are addressed.
import { createHash, createHmac } from 'node:crypto'

const env = process.env
export const configured = () => !!(env.SOCIAL_S3_ENDPOINT && env.SOCIAL_S3_BUCKET && env.SOCIAL_S3_ACCESS_KEY_ID && env.SOCIAL_S3_SECRET_ACCESS_KEY)
const cfg = () => {
  if (!configured()) throw new Error('the bucket is not set up: .env needs SOCIAL_S3_ENDPOINT, SOCIAL_S3_BUCKET, SOCIAL_S3_ACCESS_KEY_ID, SOCIAL_S3_SECRET_ACCESS_KEY')
  const ep = new URL(env.SOCIAL_S3_ENDPOINT)
  return { host: `${env.SOCIAL_S3_BUCKET}.${ep.host}`, region: env.SOCIAL_S3_REGION || 'auto', id: env.SOCIAL_S3_ACCESS_KEY_ID, secret: env.SOCIAL_S3_SECRET_ACCESS_KEY }
}

const sha256 = (d) => createHash('sha256').update(d).digest('hex')
const hmac = (k, d) => createHmac('sha256', k).update(d, 'utf8').digest()
/** RFC 3986, per path segment (S3 style); `/` kept */
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const encPath = (p) => p.split('/').map(enc).join('/')
const stamp = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/[-:]/g, '')

function signingKey(secret, day, region) {
  let k = hmac(`AWS4${secret}`, day)
  for (const part of [region, 's3', 'aws4_request']) k = hmac(k, part)
  return k
}

/** one signed request, retried with a growing pause when the store says to slow down (503 SlowDown) or hiccups */
async function request(method, key, opts = {}) {
  for (let attempt = 0; ; attempt++) {
    const r = await signed(method, key, opts).catch((e) => (attempt < 5 ? null : Promise.reject(e)))
    if (r && r.status !== 503 && r.status !== 429 && r.status < 500) return r
    if (attempt >= 5) return r
    await new Promise((done) => setTimeout(done, 1000 * 2 ** attempt))
  }
}

/** one signed request (header auth); body is a Buffer or string */
async function signed(method, key, { body, type } = {}) {
  const c = cfg()
  const amz = stamp()
  const day = amz.slice(0, 8)
  const payload = body ? sha256(body) : sha256('')
  const headers = { host: c.host, 'x-amz-content-sha256': payload, 'x-amz-date': amz, ...(type ? { 'content-type': type } : {}) }
  const names = Object.keys(headers).sort()
  const path = '/' + encPath(key)
  const canonical = [method, path, '', ...names.map((n) => `${n}:${headers[n]}`), '', names.join(';'), payload].join('\n')
  const scope = `${day}/${c.region}/s3/aws4_request`
  const sig = createHmac('sha256', signingKey(c.secret, day, c.region)).update(['AWS4-HMAC-SHA256', amz, scope, sha256(canonical)].join('\n')).digest('hex')
  const auth = `AWS4-HMAC-SHA256 Credential=${c.id}/${scope}, SignedHeaders=${names.join(';')}, Signature=${sig}`
  const { host, ...rest } = headers
  return fetch(`https://${host}${path}`, { method, body, headers: { ...rest, authorization: auth } })
}

export async function put(key, body, type = 'application/octet-stream') {
  const r = await request('PUT', key, { body, type })
  if (!r.ok) throw new Error(`upload ${key}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
}
/** the object's text, or null if it isn't there */
export async function getText(key) {
  const r = await request('GET', key)
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`download ${key}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
  return r.text()
}
/** size and ETag (the MD5 for a single-part upload), or null if it isn't there */
export async function head(key) {
  const r = await request('HEAD', key)
  if (r.status === 404) return null
  if (!r.ok) throw new Error(`check ${key}: HTTP ${r.status}`)
  return { size: Number(r.headers.get('content-length')), etag: (r.headers.get('etag') ?? '').replace(/"/g, '') }
}

/** a temporary link anyone can GET (Instagram fetches the media from it); `seconds` up to 7 days */
export function presign(key, seconds = 3600) {
  const c = cfg()
  const amz = stamp()
  const day = amz.slice(0, 8)
  const scope = `${day}/${c.region}/s3/aws4_request`
  const q = { 'X-Amz-Algorithm': 'AWS4-HMAC-SHA256', 'X-Amz-Credential': `${c.id}/${scope}`, 'X-Amz-Date': amz, 'X-Amz-Expires': String(seconds), 'X-Amz-SignedHeaders': 'host' }
  const query = Object.keys(q).sort().map((k) => `${enc(k)}=${enc(q[k])}`).join('&')
  const path = '/' + encPath(key)
  const canonical = ['GET', path, query, `host:${c.host}`, '', 'host', 'UNSIGNED-PAYLOAD'].join('\n')
  const sig = createHmac('sha256', signingKey(c.secret, day, c.region)).update(['AWS4-HMAC-SHA256', amz, scope, sha256(canonical)].join('\n')).digest('hex')
  return `https://${c.host}${path}?${query}&X-Amz-Signature=${sig}`
}
