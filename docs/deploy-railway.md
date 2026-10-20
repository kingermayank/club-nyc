# Putting Club NYC online with Railway

This guide takes Club NYC from your Mac to a public web address on [Railway](https://railway.com), step by step. No server experience needed. Plan on about an hour the first time, most of it waiting for builds and DNS.

When something goes wrong later, use [runbook.md](runbook.md).

> **Status (18 October 2026):** step 1 is done. The code is on GitHub as the private repository
> [kingermayank/club-nyc](https://github.com/kingermayank/club-nyc). Start at [step 2A](#2a-from-github-recommended).
> Before you invite players, read [launch/legal-callouts.md](launch/legal-callouts.md).

**What players see:** the landing page at `/`, the game at `/play`. Invite links (`/join/<name>`) open the game
directly. `/discord` sends people to your Discord invite.

Railway's docs were checked on 16 October 2026 for this guide. Links are in [Sources](#sources) at the end.

---

## What you are building

```
players ──https──▶ Railway edge ──▶ one "club-nyc" service (built from the Dockerfile)
                                      ├─ the game (app/dist), the API (/api), the live world (/ws)
                                      └─ a volume mounted at /data
                                           ├─ club-nyc.db      ← the database
                                           └─ backups/         ← snapshots every 6 hours
```

- **One service, one copy.** The live world (rooms, who's online, parties) lives in the server's memory, so there must be exactly one copy (Railway calls copies "replicas") running. Railway also doesn't allow replicas on a service with a volume.
- **The database lives on a volume.** A Railway container's own disk is wiped on every deploy. Only the volume survives, so the database and its backups go there.
- **Deploys cause a short restart.** Only one container can use the volume at a time, so Railway stops the old version before starting the new one. Players see "The city is restarting. You'll be back in a few seconds." and their game reconnects by itself. Details are in [How deploys work](#how-deploys-work-with-a-volume).

## Before you start

- A **Railway account** on the **Hobby plan** ($5/month, which includes $5 of usage). The Free plan's limits (0.5 GB memory and volume, $1/month of usage) are too small to keep a game online all month.
- A **GitHub account** (recommended: Railway then redeploys every time you push). Or the Railway command-line tool (see [2B](#2b-with-the-railway-cli)).
- **Access to your domain's DNS** if you want your own address (for example `play.clubnyc.com`). You can launch on a free `….up.railway.app` address first.
- **Access to the Google / X / Discord developer consoles** if you want those sign-in buttons. Guests can play without them.

---

## 1. Put the code on GitHub (done)

Done on 18 October 2026: the code is in the private repository
[kingermayank/club-nyc](https://github.com/kingermayank/club-nyc), branch `main`.

**What `.gitignore` keeps out of it:**

- **Must never be uploaded:** `server/data/` (your local database, which may hold real player data), any `.env` file
  (passwords and keys), and `scratch/` (two AI model files of 154 MB and 428 MB; GitHub rejects anything over
  100 MB).
- **Generated, or too big for git:** `tools/out/` and `docs/flow/` (test screenshots; the tools make them again),
  and `app/public/art/raw/` and `app/public/art/preview/` (art-pipeline originals the game never loads). These
  exist only on this Mac, so keep them in your normal backups (for example Time Machine).

**Shipping a change later:**

```bash
git add -A
git commit -m "What changed"
git push
```

Once Railway is connected (step 2A), every push to `main` deploys. A big push can stop with "unexpected
disconnect while reading sideband packet". If that happens, push again with a bigger buffer:

```bash
git -c http.postBuffer=524288000 push
```

---

## 2. Create the Railway project

Pick **one** of these.

### 2A. From GitHub (recommended)

1. On [railway.com](https://railway.com), sign in. Choose "Sign in with GitHub" so Railway can see your repositories.
2. **New Project** → **GitHub repo** → pick `club-nyc`. If Railway asks, give it access to that repository.
3. Choose **Deploy Now**.

Railway finds the `Dockerfile` and starts building. The build log shows `Using detected Dockerfile!`, then the game being built. This first deploy is just a warm-up: it runs without a volume or settings, and you'll replace it in a few minutes. You'll see a `WARNING … will be WIPED` line in its logs, which is expected for now.

From now on, **every push to `main` deploys automatically**.

### 2B. With the Railway CLI

The CLI uploads the folder on your Mac directly, with no GitHub involved.

1. Install and sign in:

   ```bash
   brew install railway        # or: npm i -g @railway/cli
   railway login
   ```

2. Tell the CLI what not to upload. It skips whatever `.gitignore` lists (do step 1.1 first) and also reads a `.railwayignore` file. Without one it would upload about 1 GB of docs, tools and art originals.

   Already done: the project folder has a `.railwayignore` listing `docs/`, `tools/`, `scratch/`, `.venv/`, the art originals, `server/data/` and database files.

3. Create the project and deploy:

   ```bash
   railway init      # creates an empty project (give it a name)
   railway up        # uploads this folder, builds the Dockerfile and deploys; if asked, create a service called club-nyc
   ```

With the CLI you deploy by running `railway up` again whenever you want to ship. The rest of this guide uses the dashboard. Open it with `railway open`.

---

## 3. Give the database a home: add a volume at `/data`

1. Open the project canvas, right-click on an empty spot (or press **⌘K**) → **Volume**.
2. Connect it to the **club-nyc** service.
3. Set the **mount path** to exactly `/data`.

CLI alternative: `railway volume add --mount-path /data`.

The Hobby plan allows volumes up to 5 GB, which is plenty. Today's database is a few MB, and 28 backups of it are well under 1 GB. Volumes can be grown later without downtime ("Live Resize" in the volume's settings).

---

## 4. Get a web address

Service → **Settings** → **Networking** → **Public Networking** → **Generate Domain**.

You'll get something like `https://club-nyc-production.up.railway.app`. Copy it: it's your `PUBLIC_URL` for now. Your own domain comes in [step 8](#8-use-your-own-domain).

---

## 5. Set the variables

Service → **Variables**. The **Raw Editor** lets you paste many lines at once. Start with this, filling in your own values:

```bash
NODE_ENV=production
PUBLIC_URL=https://club-nyc-production.up.railway.app
TRUST_PROXY=true
DB_PATH=/data/club-nyc.db
BACKUP_DIR=/data/backups
ADMIN_TOKEN=<paste the output of: openssl rand -hex 32>
CONTACT_EMAIL=you@example.com
COMPANY_NAME=<who runs Club NYC: your name or your company's legal name>
GOVERNING_STATE=<the US state whose law governs the terms, e.g. New York>
MAILING_ADDRESS=<a postal address for legal notices>
DISCORD_INVITE_URL=<a never-expiring https://discord.gg/… invite, once your server is ready>
RAILWAY_DEPLOYMENT_DRAINING_SECONDS=10
RAILWAY_HEALTHCHECK_TIMEOUT_SEC=120
```

To make the `ADMIN_TOKEN`, run this in Terminal and paste the 64-character result:

```bash
openssl rand -hex 32
```

Save it in your password manager too. It's the password for the moderator dashboard.

| Variable | Set it to | What it does |
|---|---|---|
| `NODE_ENV` | `production` | Production mode: rate limits apply to everyone and developer-only endpoints are off. The Dockerfile already sets it; listing it here keeps it visible. |
| `PUBLIC_URL` | `https://<your domain>` (no `/` at the end) | The address players use. Sign-in redirects are built from it, and an `https://` address turns on secure cookies. Change it when your own domain is live. |
| `TRUST_PROXY` | `true` | Railway's edge passes each visitor's real IP to the server. Without this every visitor looks like the same proxy, and rate limits would treat the whole world as one person. |
| `DB_PATH` | `/data/club-nyc.db` | The database file, on the volume. |
| `BACKUP_DIR` | `/data/backups` | Where the server keeps its own snapshots, also on the volume. |
| `ADMIN_TOKEN` | a long random secret | Unlocks the moderator dashboard at `/admin.html`. If unset, the dashboard is off. |
| `CONTACT_EMAIL` | an inbox you read | Shown to banned players for appeals, and filled in wherever the landing page and the privacy policy, terms and rules say `[CONTACT EMAIL]`. |
| `COMPANY_NAME` | your name or your company's legal name | Fills `[COMPANY NAME]` in the terms, privacy policy and the landing page footer. The legal pages show the placeholder until it's set. |
| `GOVERNING_STATE`, `MAILING_ADDRESS` | e.g. `New York`; a postal address | Fill `[GOVERNING STATE]` (the terms' governing law and courts) and `[MAILING ADDRESS]` (where legal notices go). Decide these with a lawyer. |
| `DISCORD_INVITE_URL` | a never-expiring `https://discord.gg/…` invite | Where the landing page's Discord buttons go (through `/discord`, so you can change it here without touching the site). Until it's set, those buttons say the Discord opens soon. In Discord: server menu → Invite People → Edit invite link → Expire after: **Never**. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | from Google Cloud ([step 9](#9-point-google--x--discord-sign-in-at-the-new-address)) | "Sign in with Google". Optional. |
| `X_CLIENT_ID`, `X_CLIENT_SECRET` | from the X developer portal | "Sign in with X". Optional. |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | from the Discord developer portal | "Sign in with Discord". Optional. |
| `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | `10` | A Railway setting: how long the old server gets to finish after Railway asks it to stop, before it is killed. Railway's default is **0**. The server needs a moment to say goodbye to players and close the database cleanly, which usually takes well under a second. |
| `RAILWAY_HEALTHCHECK_TIMEOUT_SEC` | `120` | A Railway setting: how long a new version may take to answer `/api/health` before the deploy counts as failed. Railway's default is 300. |
| `BACKUP_EVERY_HOURS` | `6` (default) | How often the server snapshots the database. `0` turns the schedule off. |
| `BACKUP_KEEP` | `28` (default) | How many snapshots to keep (28 × 6 h ≈ 7 days). Older ones are deleted automatically. |
| `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`, optional `BACKUP_S3_REGION` (default `auto`) and `BACKUP_S3_PREFIX` | see [step 11](#11-recommended-off-site-backups-to-cloudflare-r2) | Uploads every snapshot to off-site storage too. |
| `MAINTENANCE` | `true` | Keeps the city closed, even across restarts. Leave it unset normally; the [runbook](runbook.md) explains when to use it. |

Don't set `PORT`: Railway sets it, and the server uses it. You can also leave the gameplay knobs in `server/.env.example` (`ROOM_CAP`, `TICK_MS`, `ALLOW_GUESTS`, `NPC_BASELINE`) unset to keep their defaults.

---

## 6. Service settings

Service → **Settings** → **Deploy** section:

| Setting | Value | Why |
|---|---|---|
| **Healthcheck Path** | `/api/health` | **Required.** Railway only switches players to a new version once it answers this with "OK". |
| **Restart Policy** | On Failure, 10 retries | This is Railway's default, so just check it. If the server crashes, Railway starts it again. |
| **Replicas** | 1 | The default. Leave it at 1. |
| **Serverless** | off | The default. If turned on, Railway would put the city to sleep whenever it's quiet. |

There's nothing to set under Build: Railway builds the `Dockerfile` automatically.

> **About `railway.json`.** The repository includes a `railway.json` with these same settings (healthcheck, restart policy, one replica, 10 s draining). Railway has deprecated that file format: according to its docs, services created now **cannot use it**, and Railway stops reading it for older services on 1 December 2026. So set the values above by hand. The file stays in the repo as a record of the intended settings. Railway's replacement, "Infrastructure as Code" (a `.railway/railway.ts` file applied with `railway config apply`), can manage all of this, including the volume and variables. It's optional, and the [docs](https://docs.railway.com/infrastructure-as-code) explain it.

---

## 7. Deploy and check that it works

1. Variable and setting changes show up as **staged changes**. Click **Deploy** at the top of the canvas to apply them.
2. Watch **Deployments → View logs**. A healthy start looks like this:

   ```
   [club-nyc] server on http://localhost:<port Railway chose>  (public https://club-nyc-production.up.railway.app)
   [ops] backups every 6 h into /data/backups, keeping 28; next in 1 min
   ```

   There should be **no** `[ops] WARNING` lines. If you see `…is not on a Railway volume and will be WIPED…`, the volume isn't mounted at `/data` or `DB_PATH` is wrong (steps 3 and 5).
3. Open `https://<your domain>/api/health`. You should see something like:

   ```json
   {"ok":true,"uptimeSec":42,"db":true,"version":"3f9c2ab","node":"v24.11.1"}
   ```

   `version` is the Git commit that's running (or the package version for CLI deploys).
4. Open the site. The landing page loads at `/`. Press **Play now**: you go straight to making a New Yorker. Give a birth month and year, tick "I agree", and walk around as a guest.
   Also check: `/robots.txt` and `/sitemap.xml` show your `https://` address, and `/discord` goes to your invite (or back to the landing page with an "opens soon" note).
5. About a minute after the start, the logs should show the first snapshot: `[ops] backup club-nyc-2026-10-16T12-00-00Z.db (…) in … ms`. Snapshot names use UTC time.
6. Open `https://<your domain>/admin.html` and log in with your `ADMIN_TOKEN`.

---

## 8. Use your own domain

1. Service → **Settings** → **Public Networking** → **+ Custom Domain** → type e.g. `play.clubnyc.com`. A subdomain like `play.` is easiest. A bare `clubnyc.com` needs a DNS provider that supports "CNAME flattening" or "ALIAS" records (Cloudflare does).
2. Railway shows **two records**, a `CNAME` and a `TXT`. Add **both** at your DNS provider exactly as shown. Without the TXT record the domain won't verify, and visitors get a 404. On Cloudflare, set the record to **DNS only** (grey cloud) so Railway can issue the certificate and players' IPs reach the server unchanged.
3. Wait for the green check next to the domain. It usually takes minutes; Railway allows up to 72 hours for DNS. The HTTPS certificate is automatic.
4. Change `PUBLIC_URL` to `https://play.clubnyc.com` → **Deploy**.
5. Update the sign-in redirect addresses ([step 9](#9-point-google--x--discord-sign-in-at-the-new-address)).
6. From now on, share only this address. Sign-in started on the old `….up.railway.app` address would fail, because sign-in always comes back to `PUBLIC_URL`.

The Hobby plan allows 2 custom domains per service.

---

## 9. Point Google / X / Discord sign-in at the new address

Each provider only sends players back to addresses you've approved. Use your real domain (the one in `PUBLIC_URL`). Keep the `http://localhost:5173/...` entries too, for development.

| Provider | Where | Add this redirect / callback URL |
|---|---|---|
| Google | [Google Cloud console](https://console.cloud.google.com) → APIs & Services → Credentials → your OAuth client (type "Web application") → **Authorized redirect URIs** | `https://<domain>/api/auth/google/callback` |
| X | [developer.x.com](https://developer.x.com) → Projects & Apps → your app → **User authentication settings** → Edit (OAuth 2.0, "Web App") → **Callback URI / Redirect URL**, and set **Website URL** to your domain | `https://<domain>/api/auth/x/callback` |
| Discord | [Discord developer portal](https://discord.com/developers/applications) → your application → **OAuth2** → **Redirects** | `https://<domain>/api/auth/discord/callback` |

Then copy each client ID and secret into the Railway variables and **Deploy**.

- **Google:** while the app's publishing status is "Testing", only the test users you've listed can sign in. Switch it to **In production** (Google Auth Platform → Audience) before launch.
- **Test each button** on the live site, ideally in a private window.
- If you change the domain again, update all three.

---

## 10. Turn on Railway's own volume backups

Railway can snapshot the whole volume on a schedule. That's a second, independent safety net on top of the server's own 6-hourly snapshots.

1. Open the **club-nyc** service → **Backups** tab.
2. Turn on the **Daily** and **Weekly** schedules (Monthly too if you like). Railway keeps daily backups for 6 days, weekly for 27 days and monthly for 89 days.
3. Optionally click to create a **manual backup** now, and before any risky change in future.

Good to know:

- You pay only for the data that changed between backups, at volume storage prices.
- A restore creates a new volume from the backup and mounts it at `/data`. The old volume stays in the project, unmounted, so a restore can be undone. Steps are in the [runbook](runbook.md#4-restore-the-database-from-a-backup).
- Restores only work within the same project and environment, and **wiping or deleting the volume deletes its Railway backups too**. That's why [step 11](#11-recommended-off-site-backups-to-cloudflare-r2) is worth doing.
- Railway's docs say this feature is still under development.

---

## 11. (Recommended) Off-site backups to Cloudflare R2

With four extra variables, every snapshot the server takes is also uploaded somewhere outside Railway. If the Railway project or volume were ever lost, the game could be rebuilt from these copies. R2's free tier (10 GB of storage) covers this, and downloads from R2 are free. AWS S3 and Backblaze B2 work the same way.

1. In the [Cloudflare dashboard](https://dash.cloudflare.com) → **R2 object storage** → **Create bucket**, e.g. `club-nyc-backups`. Keep it private, which is the default.
2. R2 overview → **Account Details** → **API Tokens** → **Manage** → create a token with permission **Object Read & Write**, limited to that one bucket. Copy the **Access Key ID** and **Secret Access Key**: the secret is shown only once. The page also shows your S3 endpoint, `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`.
3. Add these Railway variables, then **Deploy**:

   ```bash
   BACKUP_S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
   BACKUP_S3_BUCKET=club-nyc-backups
   BACKUP_S3_ACCESS_KEY_ID=<access key id>
   BACKUP_S3_SECRET_ACCESS_KEY=<secret access key>
   BACKUP_S3_PREFIX=prod
   ```

   `BACKUP_S3_REGION` can stay unset: R2 uses `auto`. For AWS (`https://s3.<region>.amazonaws.com`) or Backblaze B2 (`https://s3.<region>.backblazeb2.com`), the region is read from the address. Set `BACKUP_S3_REGION` only if you use some other address.
4. Check the logs after the next snapshot, or take one right away with `/admin.html` → **Database backups** → **Back up now**:

   ```
   [ops] off-site copy prod/club-nyc-2026-10-16T18-00-00Z.db uploaded to <account>.r2.cloudflarestorage.com/club-nyc-backups
   ```

   A failure looks like `[ops] off-site copy of … FAILED after 3 attempt(s): HTTP 403 …`. That usually means a wrong key, token permission or bucket name.
5. The server never deletes files in the bucket. In the bucket's settings, add an **object lifecycle rule** that deletes objects older than e.g. 30 days, so storage stays small.

The database contains player accounts. Keep the bucket private and the keys secret.

---

## 12. (Optional) Cheaper and faster: Railway's CDN

The game's art is most of what the server sends: about 30 MB as WebP (the server sends WebP to browsers that
accept it, which is every current one), or 80 MB as the original JPEG and PNG files. Railway's CDN can serve those
files from its edge instead. It's free, and files served from the edge cost no network egress.

**Leave it off at launch** unless egress costs grow. Here's why:

- The server sends each art address (for example `/art/rooms/soho.jpg`) as WebP or as the original, depending on
  the browser, and marks the reply `Vary: Accept`.
- Railway's docs say its cache key is the method, host, path, query string and compression. They don't say
  whether it keeps a separate WebP copy and original copy of the same address.
- If it doesn't, everyone gets whichever version the edge saw first. That still works in every current desktop
  browser, but a very old browser without WebP support would show missing art.

To turn it on: Service → **Settings** → **Edge** → **Enable CDN Caching**. Then set **Purge Cache on Deploy** to
**purge everything on each successful deploy**. The art files keep the same names when they change, so this stops
the CDN from serving stale art after a deploy. Afterwards, check that images still load in Chrome, Safari and
Firefox.

What gets cached: images, fonts, JavaScript and CSS. The API (JSON), the live connection and the HTML pages are not
cached, because the server sends no caching headers for them.

---

## Day-to-day

### How deploys work with a volume

1. You push to `main` (or run `railway up`). Railway **builds** the new version while the old one keeps running, so players aren't affected. This takes a few minutes.
2. Railway asks the old server to stop (`SIGTERM`). The server tells everyone "The city is restarting. You'll be back in a few seconds.", closes their connections, lets in-flight requests finish, writes the database to disk cleanly and exits. That usually takes well under a second. `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=10` is the hard limit.
3. Railway starts the new version with the volume and waits until `/api/health` says OK, then sends players to it. Their games reconnect on their own.
4. The gap is usually several seconds and should stay under a minute. To keep it rare, batch changes and deploy at quiet times.

If the new version never passes the health check, the deploy is marked **Failed**. With a volume, the old version has usually already been stopped by then, so roll back right away ([runbook](runbook.md#3-a-bad-deploy)). Railway also occasionally restarts services itself for host maintenance; the same steps apply.

### Rolling back a bad deploy

Service → **Deployments** → the **⋯** menu on the last good deployment → **Rollback** → confirm.

A rollback restores that version's built image **and its variables** without rebuilding, so it takes seconds plus the usual restart gap. On Hobby you can roll back to deployments removed within the last 72 hours (120 hours on Pro). For anything older, use **Redeploy** on it, which rebuilds the same code.

Rolling back code does **not** roll back the database; see the [runbook](runbook.md#3-a-bad-deploy).

### Viewing logs

- **One deployment:** Service → **Deployments** → click a deployment → **Deploy Logs** (the running server) or **Build Logs** (the image build).
- **Everything, searchable:** the **Observability** tab → Log Explorer, with date ranges.
- **From Terminal:** `railway logs` (run `railway link` once in the project folder first).
- Useful things to search for: `[ops]` (shutdowns, backups, crashes), `WARNING`, `FAILED`, `fatal`, `[auth]` (sign-in problems).
- Logs are kept for 7 days on Hobby and 30 days on Pro.

### What it costs

Railway charges a plan fee that includes some usage, then by the minute for what the server actually uses ([pricing](https://railway.com/pricing)):

| | Price |
|---|---|
| Hobby plan | $5/month, includes $5 of usage |
| Pro plan | $20/month, includes $20 of usage |
| Memory | $10 per GB per month |
| CPU | $20 per vCPU per month |
| Network egress (data sent to players) | $0.05 per GB |
| Volume storage | $0.15 per GB per month |
| Builds | free |

A rough estimate for Club NYC. These are assumptions, not measurements from production:

- **Memory:** the server uses about 100–150 MB when quiet, more with many players online. That's about $1–3/month.
- **CPU:** close to idle when quiet, busier at peak times. Expect under $1–3/month at small scale.
- **Volume:** a few MB of database plus snapshots costs pennies.
- **Egress** is the one to watch. A new player downloads about 1.5 MB to reach Times Square for the first time
  (WebP art, measured on 18 October 2026), and up to roughly 30 MB if they explore every place. Browsers cache it
  afterwards. The live world adds a few KB per second per player. So 1,000 new players cost under $2, and 20,000 new
  players in a month roughly $2–30.

So a small launch should cost roughly **$5–10 a month** on Hobby. Set a spending alert before launch: **Workspace → Usage → Set Usage Limits**. Add a "custom email alert" at an amount you'd want to hear about. A "hard limit" also exists, but it takes the game offline when reached (the minimum is $10).

---

## Pre-launch checklist

- [x] `.gitignore` covers `scratch/`, `server/data/`, `.env` and `*.db*`, and the GitHub repository is **private** (done 18 October 2026)
- [ ] Volume mounted at `/data`; `DB_PATH=/data/club-nyc.db`; `BACKUP_DIR=/data/backups`
- [ ] Deploy logs show `[ops] backups every 6 h into /data/backups` and **no** `[ops] WARNING`
- [ ] `https://<domain>/api/health` shows `"ok":true` and `"db":true`
- [ ] **Healthcheck Path** = `/api/health` (Settings → Deploy)
- [ ] `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=10`, `NODE_ENV=production`, `TRUST_PROXY=true`
- [ ] `PUBLIC_URL` is exactly the `https://` address players will use
- [ ] `ADMIN_TOKEN` is long and random, saved in a password manager, and `/admin.html` login works
- [ ] `CONTACT_EMAIL`, `COMPANY_NAME`, `GOVERNING_STATE` and `MAILING_ADDRESS` are set; `/privacy.html`, `/terms.html`, `/rules.html` and the landing page show no `[…]` placeholders
- [ ] `DISCORD_INVITE_URL` is a never-expiring invite, and `/discord` lands in your server (or you're fine with "opens soon" for now)
- [ ] You've read [launch/legal-callouts.md](launch/legal-callouts.md) and decided on each open item
- [ ] New art since the last deploy? Run `.venv/bin/python tools/webp.py` and commit the `.webp` copies (the server sends them instead of the originals)
- [ ] Every sign-in button works on the live domain; Google's app is "In production"
- [ ] Railway volume backups: Daily and Weekly schedules on
- [ ] Off-site backups: at least one `off-site copy … uploaded` log line, or a conscious decision to skip them
- [ ] You've practised a restore: downloaded a snapshot and opened it ([runbook § 4](runbook.md#4-restore-the-database-from-a-backup))
- [ ] Usage email alert set
- [ ] Monitoring: an uptime check on `/api/health` and deploy alerts to Slack, Discord or email ([runbook § 8](runbook.md#8-monitoring-setup-do-this-once))
- [ ] You've watched one deploy while playing: the "city is restarting" message appeared and the game came back by itself

---

## Sources

Checked 16 October 2026.

- Railway: [Config as Code (deprecation notice)](https://docs.railway.com/config-as-code), [Config as Code reference](https://docs.railway.com/config-as-code/reference), [JSON schema](https://railway.com/railway.schema.json), [Infrastructure as Code](https://docs.railway.com/infrastructure-as-code)
- Railway: [Dockerfiles](https://docs.railway.com/builds/dockerfiles), [Quick start (GitHub and CLI)](https://docs.railway.com/quick-start), [CLI](https://docs.railway.com/cli), [`railway up`](https://docs.railway.com/cli/up), [Deploying with the CLI](https://docs.railway.com/cli/deploying), [`railway volume`](https://docs.railway.com/cli/volume)
- Railway: [Using volumes](https://docs.railway.com/volumes), [Volumes reference (limits, replicas)](https://docs.railway.com/volumes/reference), [Volume backups](https://docs.railway.com/volumes/backups)
- Railway: [Healthchecks](https://docs.railway.com/deployments/healthchecks), [Restart policy](https://docs.railway.com/deployments/restart-policy), [Deployment teardown (draining)](https://docs.railway.com/deployments/deployment-teardown), [Deployments reference (SIGTERM, default 0 s)](https://docs.railway.com/deployments/reference), [Node.js SIGTERM handling](https://docs.railway.com/deployments/troubleshooting/nodejs-sigterm-handling), [Variables reference](https://docs.railway.com/variables/reference)
- Railway: [Deployment actions](https://docs.railway.com/deployments/deployment-actions), [Roll back a bad deploy](https://docs.railway.com/guides/roll-back-bad-deploy), [Logs](https://docs.railway.com/observability/logs)
- Railway: [Working with domains](https://docs.railway.com/networking/domains/working-with-domains), [Public networking specs and limits (WebSockets)](https://docs.railway.com/networking/public-networking/specs-and-limits), [CDN](https://docs.railway.com/networking/cdn)
- Railway: [Pricing](https://railway.com/pricing), [Plans](https://docs.railway.com/pricing/plans), [Cost control](https://docs.railway.com/pricing/cost-control)
- Cloudflare R2: [S3 API (endpoint and region)](https://developers.cloudflare.com/r2/api/s3/api/), [API tokens](https://developers.cloudflare.com/r2/api/tokens/), [Pricing](https://developers.cloudflare.com/r2/pricing/)
- Backup upload signing (checked by `server/scripts/backup-test.ts`): [AWS Signature V4 test suite](https://github.com/awslabs/aws-c-auth/tree/main/tests/aws-signing-test-suite/v4) and the "PUT Object" example in the [Amazon S3 API reference](https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html)
