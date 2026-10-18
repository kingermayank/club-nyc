import { existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const envFile = resolve(here, '../.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)
const env = process.env

const publicUrl = (env.PUBLIC_URL ?? 'http://localhost:5173').replace(/\/$/, '')
const dbPath = resolve(here, '..', env.DB_PATH ?? 'data/club-nyc.db')
mkdirSync(dirname(dbPath), { recursive: true })

export const config = {
  port: Number(env.PORT ?? 8787),
  publicUrl,
  dbPath,
  google: env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET ? { id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET } : null,
  x: env.X_CLIENT_ID ? { id: env.X_CLIENT_ID, secret: env.X_CLIENT_SECRET || null } : null,
  discord: env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET ? { id: env.DISCORD_CLIENT_ID, secret: env.DISCORD_CLIENT_SECRET } : null,
  /** the moderator dashboard (/admin.html) is locked behind this; unset = dashboard off (dev prints a temporary one) */
  adminToken: env.ADMIN_TOKEN ?? '',
  /** shown to banned players for appeals, and on the policy pages */
  contactEmail: env.CONTACT_EMAIL ?? '',
  /** who runs Club NYC (the landing page footer, the policy pages) */
  companyName: env.COMPANY_NAME ?? '',
  /** the terms: whose laws govern them and the courts for disputes (a US state), and a postal address for notices */
  governingState: env.GOVERNING_STATE ?? '',
  mailingAddress: env.MAILING_ADDRESS ?? '',
  /** where /discord sends people: a never-expiring invite to the Club NYC Discord server */
  discordInvite: env.DISCORD_INVITE_URL ?? '',
  roomCap: Number(env.ROOM_CAP ?? 60),
  tickMs: Number(env.TICK_MS ?? 66),
  allowGuests: env.ALLOW_GUESTS !== 'false',
  npcBaseline: env.NPC_BASELINE !== 'false',
  secureCookies: publicUrl.startsWith('https://'),
  /** production: the server can also serve the built client */
  staticDir: resolve(here, '../../app/dist'),
  geoDir: resolve(here, '../../app/src/data/geo'),
  dev: env.NODE_ENV !== 'production',
}
