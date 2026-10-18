# Club NYC runbook

What to do when something goes wrong in production. Each playbook is a short checklist: work top to bottom, and stop when it's fixed. Setup is covered in [deploy-railway.md](deploy-railway.md).

**Keep this handy:**

| What | Where |
|---|---|
| Is it up? | `https://<domain>/api/health` → `{"ok":true,"uptimeSec":…,"db":true,"version":"<commit>","node":"…"}`. It returns status 503 when the database is unreachable or the server is shutting down. |
| Railway dashboard | your project → the **club-nyc** service → tabs **Deployments**, **Variables**, **Metrics**, **Settings**, **Backups** |
| Railway platform status | [status.railway.com](https://status.railway.com) |
| Moderator dashboard | `https://<domain>/admin.html` (password: `ADMIN_TOKEN`). Overview, reports, players (warn / mute / ban / rename), chat log, errors, announcements, maintenance mode, database backups. |
| Logs | Service → Deployments → **View logs**, the **Observability** tab, or `railway logs` |
| Log lines worth searching | `[ops]` (shutdowns, backups, crashes) · `[ops] fatal` (what killed the server) · `WARNING` · `FAILED` · `[auth]` (sign-in errors) |

The Railway CLI (`brew install railway`, then `railway login` and `railway link` once in the project folder) is needed for the restore in § 4B and is handy elsewhere.

---

## 1. Site down / crash-looping

Symptoms: an uptime alert, players can't load the game, or Railway shows the deployment as **Crashed** or **Failed**.

- [ ] Check [status.railway.com](https://status.railway.com). If Railway itself has an incident, there's nothing to fix on our side; post a note for players and wait.
- [ ] Service → **Deployments**: what state is the newest deployment in?
  - **Building / Deploying** for a long time: a deploy is in progress or stuck. With a volume, the old version stops before the new one starts, so the site is down meanwhile. If it's stuck past ~10 minutes, roll back (§ 3).
  - **Failed**: the build broke or `/api/health` never answered. Open its logs, then roll back (§ 3).
  - **Crashed**: the server keeps exiting. Railway restarts it up to 10 times, then gives up.
  - **Active** but the site doesn't load: check the domain (Settings → Networking) and `/api/health`.
- [ ] Open **Deploy Logs** for that deployment and find the last `[ops] fatal …` line or error stack. Common causes:
  - It started right after a deploy → **roll back first** (§ 3), investigate after.
  - `ENOSPC` or `SQLITE_FULL`: the volume is full. Open the volume → **Live Resize** to grow it (no downtime). Old snapshots in `/data/backups` are deleted automatically, beyond `BACKUP_KEEP`.
  - `database disk image is malformed` or other `SQLITE_CORRUPT` errors → restore (§ 4).
  - `WARNING … will be WIPED`: the volume isn't mounted at `/data`, or `DB_PATH` is wrong. Fix it before players make progress that would be lost.
  - `[config] WARNING …` right after start-up: a missing or wrong setting (`PUBLIC_URL` not your https address, `TRUST_PROXY` not `true`, no `CONTACT_EMAIL`). Sign-in, invite links or sign-up limits misbehave until it's fixed. Correct the variable → **Deploy**.
  - The log just stops, and Metrics → Memory sits at the limit: out of memory. Restart it, and see § 2.
- [ ] Once the cause is fixed, click **Restart** on a crashed deployment, or **Redeploy**.
- [ ] Confirm `/api/health` shows `"ok":true` and play for a minute.
- [ ] Write down what happened and when.

## 2. Slow or overloaded

Symptoms: lag, rubber-banding, slow page loads, Railway Metrics high.

- [ ] Service → **Metrics**: is it CPU, memory or network? When did it start?
- [ ] `/admin.html` → Overview: how many players are online, and in which rooms? Is it a real crowd or a flood of new guest accounts (§ 5)?
- [ ] Logs: a burst of errors, or one thing repeating?
- [ ] If it's a real crowd, there are quick knobs (Variables → change → **Deploy**, which briefly restarts the city):
  - `ROOM_CAP` lower, e.g. `40` (default 60). Smaller room instances mean far fewer messages per player.
  - `TICK_MS` higher, e.g. `100` (default 66, about 15 updates a second). That sends fewer, larger updates.
- [ ] Network-heavy? Turn on the CDN ([deploy guide § 12](deploy-railway.md#12-optional-cheaper-and-faster-railways-cdn)) so images stop going through the server.
- [ ] Memory climbing steadily over hours: restart the deployment to buy time, and note it for a developer (a likely leak).
- [ ] The game runs as one process on purpose (the live world is in memory), so adding replicas is not an option. Longer-term scaling is in [multiplayer.md](multiplayer.md).

## 3. A bad deploy

Symptoms: errors or broken features right after a deploy.

- [ ] Confirm the timing: Service → **Deployments** shows when the latest version went live.
- [ ] **Roll back first, debug second:** the **⋯** menu on the last good deployment → **Rollback** → confirm. That restores the old built image and its variables, with no rebuild. There's the usual few-second restart and players reconnect by themselves.
  - Hobby keeps old images for 72 hours (Pro 120). For an older version, use **Redeploy** on it, which rebuilds the same code.
- [ ] Check `/api/health` and the logs of the rolled-back version.
- [ ] **A rollback does not undo database changes.** If the bad version wrote bad data, or changed the database structure and the old version now errors, restore the database from the snapshot taken before the deploy (§ 4).
- [ ] Find the cause in the failed deployment's Build or Deploy logs (they stay available), fix it, and push. The fix deploys normally.
- [ ] Next time, before a risky deploy (anything touching the database), take a backup first: `/admin.html` → **Database backups** → **Back up now**, or the service's **Backups** tab → manual backup.

## 4. Restore the database from a backup

There are two kinds of backup:

- **Railway volume backups** (Backups tab): daily, weekly and monthly copies of the whole `/data` volume. Restore takes a few clicks.
- **The server's own snapshots**: one every 6 hours, the last 7 days kept in `/data/backups`, plus copies in R2 if you set that up. Each is a complete database file named `club-nyc-YYYY-MM-DDTHH-MM-SSZ.db` (UTC time).

Restoring always loses whatever happened after the backup was taken (coins, friends, new players). Pick the newest backup from before the problem.

**Before either option:**

- [ ] Decide the time to go back to. Write down what players will lose.
- [ ] Close the city: `/admin.html` → **Maintenance mode** on. Also add the variable `MAINTENANCE=true` and **Deploy**, so it stays closed through the restarts below (the dashboard switch resets on restart).
- [ ] Take a backup of the current state, so the restore itself can be undone: service → **Backups** → manual backup.

### 4A. From a Railway volume backup (whole volume)

1. Service → **Backups** tab → find the backup by date → **Restore**.
2. Click **Details** at the top of the canvas to review. Railway will mount a **new** volume, named after the backup's date, at `/data`. The current volume stays in the project, unmounted, untouched.
3. Click **Deploy**. The service restarts on the restored volume.
4. Turn the backup **schedules** on again for the new volume (they don't carry over).
5. To undo: a service can have only one volume, so detach the restored volume, attach the previous one (still in the project) at `/data`, and deploy. With the CLI that's `railway volume detach` then `railway volume attach --volume <old volume name>`.

### 4B. From one of the server's own snapshots

Nothing is overwritten here: you put the snapshot on the volume under a new name and point `DB_PATH` at it. Going back is just changing `DB_PATH` back.

1. **Get the snapshot file onto your Mac.** Use one of these:
   - `/admin.html` → **Database backups** → **Download** next to the one you want.
   - CLI: `railway volume files list /backups`, then
     `railway volume files download /backups/club-nyc-2026-10-16T12-00-00Z.db ./restore.db`
     (paths in these commands are inside the volume, so the server's `/data/backups` is `/backups` here).
   - From R2: download the object from the bucket in the Cloudflare dashboard (if the volume itself is gone).
2. **Check it** (macOS ships `sqlite3`):

   ```bash
   sqlite3 restore.db "PRAGMA integrity_check; SELECT COUNT(*) FROM users;"
   ```

   You want `ok` and a sensible number of players.
3. **Upload it under a new name** (the service must be running):

   ```bash
   railway volume files upload ./restore.db /club-nyc-restored-20261016.db
   ```

4. Variables → `DB_PATH=/data/club-nyc-restored-20261016.db` → **Deploy**.
5. Keep the old `/data/club-nyc.db` until you're sure. To undo, set `DB_PATH` back to `/data/club-nyc.db` and deploy.

If the whole volume was lost: create a new volume at `/data` (deploy guide § 3), deploy once so the service is running, then do steps 1–4 with a copy from R2.

**After either option:**

- [ ] `/api/health` shows `"ok":true` and `"db":true`; the logs have no errors.
- [ ] In `/admin.html`, the player count looks right; spot-check a player you know.
- [ ] Open the city: switch **Maintenance mode** off, delete the `MAINTENANCE` variable, and **Deploy**.
- [ ] Tell players what happened, with an announcement in `/admin.html` and on your social channels.

## 5. A raid or abuse wave

Symptoms: spam, slurs, griefing or harassment from a group, often new accounts arriving at once.

- [ ] `/admin.html` → **Reports**, **Chat log** and **Overview**: who is it, which rooms, since when?
- [ ] Act on the ringleaders first (player page → **mute** or **ban**, with a duration and a reason). A ban disconnects them immediately; a mute takes effect live.
- [ ] Post a calm **announcement** to everyone ("We're on it — use Report on anyone bothering you").
- [ ] If a stream of fresh guest accounts keeps coming: set `ALLOW_GUESTS=false` → **Deploy**. Only signed-in players (Google / X / Discord) can then create accounts. Everyone reconnects after the short restart. Remove the variable when it's over.
- [ ] If it's a bot or traffic flood (Metrics spiking, the site slowing for everyone): service → **Settings** → **Edge** → **Under Attack Mode** → **Activate**, for 1, 3, 12 or 24 hours. Every new visitor gets a browser check and scripts are blocked. Players who were already in the game may have to reload the page once.
- [ ] Last resort: **Maintenance mode** closes the city for everyone until you reopen it.
- [ ] Afterwards: write down names, times and actions. Review bans made in a hurry. Remove `ALLOW_GUESTS=false` and switch off Under Attack Mode. Report illegal content to the authorities if the law requires it.

## 6. Rotating a leaked secret

For any secret, the pattern is: **make a new one → put it in Railway → Deploy → revoke the old one.** Then check the logs and sign in once to confirm.

- [ ] **`ADMIN_TOKEN`:** run `openssl rand -hex 32` → Variables → **Deploy**. Everyone logged in to `/admin.html` is logged out immediately (their session is signed with the old token).
- [ ] **Google:** Cloud console → Credentials → your OAuth client → add a new client secret → update `GOOGLE_CLIENT_SECRET` → **Deploy** → delete the old secret.
- [ ] **X:** developer portal → your app → **Keys and tokens** → regenerate the OAuth 2.0 client secret → update `X_CLIENT_SECRET` → **Deploy**.
- [ ] **Discord:** developer portal → your app → **OAuth2** → **Reset Secret** → update `DISCORD_CLIENT_SECRET` → **Deploy**.
- [ ] **R2 / S3 backup keys:** create a new API token for the bucket → update `BACKUP_S3_ACCESS_KEY_ID` and `BACKUP_S3_SECRET_ACCESS_KEY` → **Deploy** → delete the old token → confirm the next `[ops] off-site copy … uploaded` log line.
- [ ] **Railway or GitHub account:** change the password, turn on two-factor authentication, and check the members and tokens in the Railway and GitHub settings for anything unfamiliar.
- [ ] Players' sign-ins are not affected by any of the above.
- [ ] If the **database itself** leaked (a backup file, or the R2 bucket made public): treat it as a data breach. Rotate everything above, close the hole, and check what your privacy policy and the law require you to tell players. Signing every player out is possible but destroys guest accounts (a guest *is* their sign-in cookie), so get a developer to do it only if session tokens are part of the leak.

## 7. Planned maintenance

Ordinary deploys don't need any of this: players get "The city is restarting" and reconnect by themselves. Use this for anything that needs the city closed for a while (restores, big database changes, moving hosts).

- [ ] Pick a quiet time.
- [ ] Announce it ahead: a day before on your social channels, then in-game announcements from `/admin.html` an hour and 10 minutes before.
- [ ] Take a manual backup (service → **Backups**) and note the time.
- [ ] Close the city: **Maintenance mode** on in `/admin.html`, plus `MAINTENANCE=true` if the work involves deploys or restarts.
- [ ] Do the work. Check `/api/health` and the logs, and play for a minute.
- [ ] Reopen: Maintenance mode off, delete `MAINTENANCE`, **Deploy**.
- [ ] Announce that you're back.

## 8. Monitoring setup (do this once)

Railway only checks `/api/health` during a deploy, not afterwards. Nothing tells you the site is down unless you set this up.

- [ ] **Uptime monitor:** use any external service (for example UptimeRobot, Better Stack, or a self-hosted Uptime Kuma). Check `https://<domain>/api/health` every 1–5 minutes. Alert when the status isn't 200, or with a keyword check, when the page doesn't contain `"ok":true`. Send alerts to your phone.
- [ ] **Deploy and crash alerts:** project → **Settings** → **Webhooks** → paste a Slack or Discord channel webhook URL → save. Railway formats messages for Slack and Discord automatically. Trigger a deploy to test it. You'll hear about failed deploys, crashes and a volume getting full.
- [ ] **Spending alert:** Workspace → **Usage** → **Set Usage Limits** → a custom email alert at an amount you care about. A hard limit is optional and takes the game offline when reached.
- [ ] **Pro plan only:** the **Observability** tab → add CPU, memory and disk widgets → **Add monitor** on each (for example memory above 80% of the limit), so you hear about trouble before it's an outage.
- [ ] **Weekly two-minute check** (put it in your calendar):
  - `/api/health` → is `uptimeSec` as long as you expect? A small number means unexpected restarts.
  - `/admin.html` → **Database backups**: is the newest snapshot under 6 hours old?
  - The R2 bucket has fresh files (if set up).
  - The service's **Backups** tab shows recent Railway backups.
  - Metrics and volume usage look normal; search the logs for `FAILED` and `WARNING`.

## Handy commands

```bash
railway login && railway link                 # once, in the project folder
railway logs                                  # live logs of the current deployment
railway ssh                                   # a shell inside the running server, e.g. ls -la /data /data/backups
railway volume files list /backups            # the server's snapshots (volume paths: /data on the server = / here)
railway volume files download /backups/<name>.db ./<name>.db
railway restart --yes                         # restart the current deployment, no rebuild
railway redeploy --yes                        # rebuild and redeploy the latest deployment
curl -s https://<domain>/api/health
```

Sources: Railway docs on [rollbacks](https://docs.railway.com/guides/roll-back-bad-deploy), [deployment actions](https://docs.railway.com/deployments/deployment-actions), [volume backups](https://docs.railway.com/volumes/backups), [`railway volume`](https://docs.railway.com/cli/volume), [`railway ssh`](https://docs.railway.com/cli/ssh), [WAF / Under Attack Mode](https://docs.railway.com/networking/waf), [alerts and webhooks](https://docs.railway.com/guides/alerts-crashes-failed-deploys), [cost control](https://docs.railway.com/pricing/cost-control), [healthchecks](https://docs.railway.com/deployments/healthchecks), checked 16 October 2026. The `railway volume files` commands work only while the service has a running deployment (per Railway staff on the Station forum).
