# Club NYC — launch checklist

Everything the game needs to go public, in order. **Bold items need you** (they involve your accounts, money, legal names or judgment); everything else is built and tested.

Related docs: [deploy-railway.md](../deploy-railway.md) (step-by-step hosting) · [runbook.md](../runbook.md) (when something breaks) · [growth-playbook.md](growth-playbook.md) · [launch-campaign.md](launch-campaign.md) · [press-kit.md](press-kit.md) · [load-test-report.md](load-test-report.md) · [../multiplayer.md](../multiplayer.md) (how it all works).

---

## 1. Decisions to make first

| Decision | Why it matters | Recommendation |
|---|---|---|
| **Trademarks inside the game** | "I ♥ NY" is a New York State trademark (souvenir shop, room name, photo-booth theme); "MetroCard" is an MTA name (the player ID card, "Daily MetroCard refill"); the subway map uses MTA-style route bullets. Everything else in the game is a parody. | Get a quick read from a lawyer before press. If needed, renaming the text is an hour of work (e.g. "City Pass" for the card); the I ♥ NY storefront is painted into the Times Square art, so that one would need new art. |
| **Burbank font licence** | The game and the policy pages use Burbank Small (commercial). | Confirm a web licence, or switch to Lilita One (already the fallback). |
| **AI-art disclosure** | Journalists will ask how the art was made. | Answer plainly; draft answer is in press-kit.md. |
| **Launch date** | November 3 is US Election Day. | A mid-November Tuesday (see launch-campaign.md). |
| **Who moderates launch week** | Reports pile up fastest on day 1. | Someone on `/admin.html` in shifts for the first 72 hours (see runbook). |

## 2. Accounts and keys (only you can create these)

1. **Railway** — create the project from this folder (see deploy-railway.md): one service, a **volume at `/data`**, one replica.
2. **Domain** — add your domain in Railway → Networking, then set `PUBLIC_URL=https://<your domain>`.
3. **Railway variables** — `NODE_ENV=production`, `PUBLIC_URL`, `TRUST_PROXY=true`, `DB_PATH=/data/club-nyc.db`, `BACKUP_DIR=/data/backups`, `ADMIN_TOKEN` (make one with `openssl rand -hex 32` and keep it in a password manager), `CONTACT_EMAIL`, `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=10`.
4. **Google sign-in** — Google Cloud Console → APIs & Services → OAuth consent screen (External; app name, support email, your domain, links to `/privacy.html` and `/terms.html`; scopes: `openid`, `email`, `profile`) → Credentials → OAuth client ID → Web application → authorized redirect URI `https://<your domain>/api/auth/google/callback` → put `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` in Railway → **Publish the app** (while it's in "Testing", only test users you list can sign in).
5. **X sign-in** — developer.x.com → your app → User authentication settings → OAuth 2.0, type **Web App** → callback `https://<your domain>/api/auth/x/callback`, website URL your domain → `X_CLIENT_ID` / `X_CLIENT_SECRET`. (Scopes used: `users.read tweet.read` — read-only, nothing is ever posted.)
6. **Discord sign-in** — discord.com/developers → New Application → OAuth2 → add redirect `https://<your domain>/api/auth/discord/callback` → `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`. (Scope: `identify` — just the username.)
7. **Policy placeholders** — find-and-replace in `app/public/rules.html`, `privacy.html`, `terms.html`: `[COMPANY NAME]`, `[CONTACT EMAIL]`, `[MAILING ADDRESS]`, `[GOVERNING STATE]`. Use the same email as `CONTACT_EMAIL` (banned players see it for appeals).
8. *(Optional, recommended)* **Off-site backups** — a Cloudflare R2 (or S3/Backblaze) bucket with a **lifecycle rule that deletes objects after 7–30 days** (the privacy policy promises backups roll off), then the `BACKUP_S3_*` variables (deploy-railway.md). Also turn on Railway's own volume backups.
9. **Uptime monitor** — a free monitor (UptimeRobot, Better Stack…) on `https://<your domain>/api/health` that texts you.

Each sign-in button only appears once its keys are set — you can launch with guests only and add Google / X / Discord any time.

## 3. Before you open the doors

- [ ] **Start production with a fresh database.** Member numbers are handed out in order (No. 0001, 0002…), so test accounts on the production database would take the first numbers. Test on a separate Railway environment (or wipe `/data/club-nyc.db` before launch day).
- [ ] Deploy, then check: `https://<domain>/api/health` is green; the front door loads; **Play now** → make a New Yorker → you're **No. 0001**.
- [ ] Sign in with Google, X and Discord on the real domain (each in a fresh private window).
- [ ] Paste `https://<domain>/join/<your name>` into iMessage / WhatsApp / X — it should unfurl as "<name> invited you to Club NYC" with the invite image.
- [ ] Open `/admin.html`, sign in with `ADMIN_TOKEN`, take a backup, download it.
- [ ] Open the site on a phone: you should get the "Best on a computer" page.
- [ ] Re-shoot the press screenshots (several still show the switched-off Halloween badge) — `press-kit.md` lists which.
- [ ] Run the test suites one last time (below).

## 4. Tests you can run any time

```bash
.venv/bin/python tools/launch_test.py
```
Builds the game and runs 49 launch checks against a throwaway production server: link previews, security and caching headers (and no Content-Security-Policy violations in any browser), the phone page, the 13+ gate, founding numbers, the coin wallet's protections, the invite loop (friends, placement, the inviter's payout), auto-moderation, admin bans and the ban screen, announcements, maintenance mode, crash reports, account deletion, backups and a graceful restart.

```bash
bash tools/qa_stack.sh
```
A private copy of the game at http://localhost:5197 with a fresh throwaway database — for poking around or showing someone, without touching your dev servers or data. Leave it running for the next one:

```bash
.venv/bin/python tools/tour_test.py
```
Rosa's tour card by card (every spotlight must be on screen), "Show me" and "Take me there", the job lobby's three leaderboards, the online counter's position, and replaying the tour (19 checks, against the QA copy).

```bash
.venv/bin/python tools/click_audit.py
```
Clicks every button, place, menu item, shop, home and social action in a private frozen copy of the game (about 10 minutes) and lists anything that does nothing, breaks, or fails without telling the player — [click-audit.md](click-audit.md). Add `--rooms soho,pizza` or `--only rooms,hud` to narrow it.

```bash
npm --prefix server test
```
Server self-tests on throwaway databases: the wallet's ceilings, the daily refill and the dashboard's growth numbers, then backups — snapshots, rotation, restore, the off-site upload and its signature (about 6 s).

```bash
.venv/bin/python tools/mp_test.py
```
Two real browsers, 26 multiplayer checks. It starts its own private game server and Vite on free ports with a throwaway database, so it never touches your dev servers or anyone playing on them. (Pass a URL, e.g. `http://localhost:5173`, to run it against a stack that's already running.)

```bash
bash server/scripts/loadtest-all.sh --quick
```
The load test (100–3,000 simulated players, rushes, chat floods, crashes and restarts, a 15-minute soak) runs on a frozen copy of the code with a throwaway database; drop `--quick` for the full ~40-minute run. Results and what it found are in [load-test-report.md](load-test-report.md): one server handled 1,000 players at ~5 ms per update with no errors.

## 5. What's built for launch (this sprint)

| Area | What players / you get |
|---|---|
| **Coins (anti-cheat)** | The server owns every wallet, wardrobe and home. Each way to earn has a cap (daily refill once a day, coins on the ground 60/hour and 200/day, Dance Jam tips once per show and only on the plaza…), plus ceilings per player per day: 600 coins from all claims together, 1,500 from shift pay (players are told politely when they hit one). Shift pay comes from validated runs; prices are checked; a doctored save can't change anything. Every coin is in a ledger the dashboard shows. |
| **Invites** | `/join/<name>` links: a personal link preview, "<name> invited you" on the front door, friends instantly, you land next to them, +50 welcome coins, +100 for the inviter once the friend has played 10 minutes (5 a day, 50 total), stamps at 1 / 3 / 10 friends. Phone → Invite friends (copy, text, WhatsApp, X, email). |
| **Member numbers** | Every New Yorker gets a number in arrival order, printed on their MetroCard. (The "Founding New Yorker" ribbon, stamp and countdown were removed.) |
| **First-day tour** | Rosa, the super in your building, walks every new player through the city one spotlight at a time: walking (try it), things that glow, the map and subway, chat, dancing, friends & leaderboards, who's online, coins and jobs, your apartment, the phone, the first-day list. Skippable; replay any time with the **?** button (or Phone → How to play). Each first-day task has a **Show me** button that points at the thing to do, with "Take me there" when it's in another place. |
| **Illustrated icons** | Every emoji in the game — panels, toasts, speech bubbles, the emote picker, stamps, photo-strip stickers, the subway map — is drawn as one of 149 illustrated icons in the city's art style (generated with Higgsfield; `app/public/art/icons/e/`, mapped in `app/src/data/emojiIcons.ts`). Emoji players type in chat show as the same icons. |
| **Job lobby & leaderboards** | Every job opens a lobby first: how it works, then the leaderboard — This week / All time / Friends — with your rank and who to beat, Start, and a link to the full leaderboard. |
| **Sharing** | Phone → Group photo (or **B**): photo strips with your friends, printed with your invite link. The MetroCard keepsake carries the link too. Strangers are kept out of other people's photos. |
| **Coming back** | "Today in the City": three challenges a day (the same three for everyone), +15 each and +25 for all three, reset at midnight New York time. The daily MetroCard refill grows with each day you drop by this week (10 → 40 coins, 📅 3/7 on the quest box) — deliberately not a streak: missing a day takes nothing away, and everyone starts fresh on Monday (your design doc's "no punishing streaks" rule). Stamps for all 7 days of a week and for 30 days in all. A Dance Jam countdown everywhere in the city. Times Square billboards welcome new members by number and name this week's #1s. |
| **Safety** | 13+ confirmation, community rules / privacy / terms pages, chat kept 72 h for reports, auto-pause after 3 reports in an hour, warnings / mutes / suspensions / bans / name resets with immediate effect, ban screen with reason and appeal email, account deletion. |
| **Moderator dashboard** (`/admin.html`) | Live city stats; growth and retention (played today / this week, % who came back the next day and a week later, % of new players who came through an invite, % of invited friends who stuck around, minutes played by new players); reports queue with one-click actions, player lookup (chat, coin ledger, history), chat search, crash reports from players' browsers, announcements to everyone online, maintenance mode, database backups. |
| **Phones** | A friendly "Best on a computer" page: copy / email / share the link, a calendar reminder for tonight, keeps any invite. |
| **Running it** | Railway setup guide, health checks, graceful restarts (players are told and reconnect in ~1 s), backups every 6 h (+ optional off-site copy), crash protection, per-player rate limits (a dorm behind one IP doesn't share a budget). |
| **Security & speed** | Hardened against malformed input — bad cookies, oversized or garbled messages, huge uploads, made-up apartments (the load test found these; the launch test re-checks them every run). A strict Content-Security-Policy (only the game's own scripts can run, so even a slipped-through bit of chat markup couldn't run code), no framing, no MIME sniffing, HTTPS-only once deployed. Game code is pre-compressed (brotli/gzip) and cached for good; the art is cached for an hour and then answered with cheap "not modified" replies, so returning players don't re-download the city. |
