# Club NYC multiplayer

Real players in one shared city: sign in (or just hit **Play now**), see everyone in the room, type to chat, make friends, visit their apartments, and climb leaderboards that are stored on the server.

```bash
npm --prefix server install && npm --prefix server run dev   # game server  :8787
npm --prefix app install    && npm --prefix app run dev      # the game     :5173 (proxies /api and /ws)
```

Open http://localhost:5173/play (the game; `/` is the landing page) in two different browsers (or one normal + one private window) to be two people. If the server isn't running the game still works single-player, exactly as before. `?offline=1` forces that.

**Production** is one process: `npm --prefix app run build`, then `NODE_ENV=production PUBLIC_URL=https://your.domain npm --prefix server start`. It serves the built game, the API and the WebSocket on `PORT`.

## What players get

| | |
|---|---|
| **Getting in** | A front door with **Play Now** (an instant guest account, no form) plus **Google / X / Discord** and **Continue with Email** (a one-time link to your inbox, no password). New accounts go through the normal New Yorker creator, which checks names as you type (unique, 2–14 letters, numbers or `_`). Guests can link Google, X, Discord or their email later from their player card and keep everything. Progress you made offline comes online with you. Before launch (`LAUNCH_MODE=waitlist`) the game's pages show Coming Soon to everyone but testers ([Launch modes](#launch-modes-the-waitlist)). |
| **Seeing each other** | Everyone in the same room shows up, walking, sitting, dancing, waving, throwing snowballs and changing outfits live. A room fills up to 60 people, then a second copy opens ("Room 2"); you're placed in the copy with the most of your friends. |
| **Chat** | A chat box in the toolbar: press **Enter**, type, **Enter**. Bubbles appear over your head for everyone in the room, and there's a scrollback log (the ▲ button). Quick phrases and emotes still work. The server strips links, emails and phone numbers, masks swears (including l33t spellings) and slows down floods. |
| **Friends** | Click anyone, then **Add Friend**. They get a live request with Accept, and once you're friends you see each other's location and can **Go** straight to them, even into the same copy of a busy room. The **City** tab shows how many people are online and where they're hanging out. |
| **Apartments** | Visit friends' apartments (anyone's during an Open House). If they're home you're in there together. Guestbook notes and likes are stored on the server, and the owner gets them live. |
| **Leaderboards** | Every job posts to a **weekly** board (resets Monday) and an **all-time** board, each filterable to friends. Runs are checked against the clock (see Safety). Neighborhood Wars standings are the sum of real players' job earnings. |
| **Safety** | Mute (just for you), block (you stop seeing each other, and it also unfriends) and report (with their recent chat attached). Three different players reporting someone within an hour pauses their chat for 30 minutes until a moderator looks. The computer-run city locals are labelled `local` so nobody mistakes them for people, and they step aside as real players arrive. |
| **Coins & wardrobe** | Owned by the server (see *The wallet* below): every way to earn coins has a cap, prices are checked, and a doctored save can't change anything. |
| **Invites** | `/join/<name>` links unfurl with a personal preview, show "<name> invited you" on the front door, make you friends on arrival, place you next to them, pay the friend 50 welcome coins and the inviter 100 once the friend has played 10 minutes (5 a day, 50 total). |
| **Member numbers** | Every New Yorker gets a number in arrival order, shown on their MetroCard. |
| **Moderators** | `/admin.html`: city stats, the reports queue, player lookup with 72 h of chat and the coin ledger, warn / mute / suspend / ban / reset name (felt immediately), chat search, crash reports, announcements, maintenance mode, backups. |

## Accounts

1. **Play now** → `POST /api/auth/guest` creates a user plus an httpOnly session cookie (30 days, sliding). Only a SHA-256 of the token is stored.
2. **Google / X / Discord** → OAuth 2.0 with PKCE (via `arctic`). If you're already playing as a guest, the identity is *attached to your guest*, so you keep your New Yorker. Otherwise it logs into the existing account, or creates a new one.
   **Email** → `POST /api/auth/email {email}` emails a one-time link (`server/src/email.ts`, Resend; printed to the server log in development). Only a SHA-256 of its token is stored (`email_logins`), it works once for 15 minutes, and each address gets at most 3 links per 15 minutes and 10 a day. `GET /api/auth/email/verify?token=` signs in the account with that email (`identities` provider `email`), or attaches the email to the account that asked for the link (a guest linking it from the player card), or creates a new account; then it sets the session cookie and goes to `/play`. An old or used link goes back to the front door with "That link expired".
3. **Profile** → `POST /api/profile` claims the name and saves the look and team. It requires the 13+ confirmation, assigns the member number, grants the creator's free outfit and welcome gift, and records an invite (`invitedBy`). Until a profile exists, the WebSocket refuses the connection.
4. **Cloud save** → the save (apartment layout, stamps, quests, settings…) is uploaded 3 s after any change, and immediately when the tab hides or closes. Coins, the wardrobe and homes in it are always overwritten with the server's wallet.
5. **Leaving** → `DELETE /api/me` removes the account and everything attached to it (reports filed *about* the player and moderation records are kept for safety).
6. **Bans** → a banned account gets 403 from the API, can't open the socket, and sees why (and how to appeal) on the front door.

### The wallet

`server/src/economy.ts` with the shared rules in `app/src/data/economy.ts`:

- **Coins in** — `POST /api/wallet/earn {reason, ref}`. Every reason has an amount and a cap (`EARN`): daily refill once a day (New York time; 10 coins, +5 for each other day you've dropped by that Monday–Sunday week, up to 40 — counted from the ledger, never a streak you can lose), quests once each, daily challenges 3 a day + a bonus, stamp bonuses once per 5 stamps, Dance Jam tips once per show and only while on the Times Square plaza, coins on the ground 60/hour and 200/day… On top, per player per New York day: 600 coins from all claims together and 1,500 from shift pay (`DAILY_CAPS`). Unknown reasons are refused. Shift pay is credited by the server itself when a run is validated (`/games/:game/finish`), referrals when the friend has played long enough.
- **Coins out** — `POST /api/wallet/spend` for small things (a soda, a ticket, furniture: spending can only lower your own balance), `POST /api/wallet/buy` for clothes and homes (real price, added to the wardrobe), `POST /api/wallet/grant` for free reward items with their own conditions (a job's uniform after a validated run of that job, the party hat after 5 stamps…).
- **Wearing** — looks sent over the socket or in a save are filtered to what you own.
- Every change is a row in `ledger` (the dashboard shows it). The client applies changes instantly and settles with the server a moment later; `{ t: '$' }` pushes server-side changes (payouts, moderator adjustments) to the player.
- Furniture placement is still cosmetic and lives in the save.

### Levels and XP

`server/src/xp.ts` with the shared rules in `app/src/data/levels.ts`:

- **The ladder**: 25 levels with NYC titles (Tourist, Day-Tripper, Commuter, Bodega Regular, Local … Club NYC Legend),
  then one more level every 1,500 XP. Titles come from your level; they used to be picked from your stamps.
- **Earning**: `awardXp(userId, reason, { amount?, ref? })` is the only way XP goes up. Every reason has a rule in
  `XP_RULES` (once per ref, a few times a day, or once per validated run) and all XP together stops at 2,000 a day.
  The server awards it where it already knows something happened: claims (`economy.ts claim`: New in Town steps,
  daily challenges, the daily refill, Dance Jam tips, hosting a party), validated job runs (`jobXp(coins)`), first
  visits to each place (`realtime.ts join`), new friends (both sides, once per pair), referrals that stick, and
  multiplayer matches (`mpXp(place, players)`). Stamps live in the save, so the game reports each one
  (`POST /api/xp/stamp`, once per stamp).
- **Showing it**: every award is pushed as `{ t: 'xp', x, g, why, lv, up }`. The game shows a level chip next to the
  coins (a ring that fills with XP), Level/XP on the player card (and other players' levels on theirs), and a
  celebration on a new level. `users.xp` is the total; `xp_log` says where each point came from. `GET /api/xp` returns
  your level and the last few awards.
- **Offline** single-player counts XP in the save with the same rules (`app/src/social/levels.ts`).

### Turning on Google, X, Discord and email sign-in

The buttons stay greyed out (development) or hidden (production) until the server has keys. You create these yourself, because they're tied to your accounts. **Everything to create and copy, step by step, is in [sign-in-setup.md](sign-in-setup.md).** In short:

- **Google**: a Google Cloud OAuth client (*Web application*), redirect URI `http://localhost:5173/api/auth/google/callback` → `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- **X**: an X developer app with OAuth 2.0 (*Web App*), callback URI `http://localhost:5173/api/auth/x/callback` → `X_CLIENT_ID` / `X_CLIENT_SECRET`. X bills per use, so the developer account needs credits.
- **Discord**: a Discord application, redirect `http://localhost:5173/api/auth/discord/callback` → `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`.
- **Email**: a [Resend](https://resend.com) API key and a verified sending domain → `RESEND_API_KEY` / `EMAIL_FROM`. Development works without them: every email (and its link) is printed to the server log as a `[email] {…}` line.

Copy `server/.env.example` to `server/.env` and restart the server. In production, swap `localhost:5173` for your domain in the consoles and in `PUBLIC_URL`. An `https://` URL turns on Secure cookies.

### Launch modes (the waitlist)

`LAUNCH_MODE` (`server/src/waitlist.ts`) is `waitlist` in production unless set, `open` in development.

- **Waitlist:** the landing page's calls to action become **Join the Waitlist** (`POST /api/waitlist`: honeypot field,
  per-IP limit, lowercase dedupe, a confirmation email when email is set up, a one-click unsubscribe link in every
  email). `/play`, `/play.html` and `/join/<name>` show the Coming Soon page (`app/soon.html`) instead of the game,
  and new guests and sign-ins are refused (`launchGate`). Testers open `/play?preview=<PREVIEW_CODE>` once: an
  httpOnly cookie (90 days) lets that browser in. The dev server asks the game server the same question
  (`/api/launch/gate`), so development behaves like production; add `?launch=waitlist` to the landing page's address
  to preview its waitlist version.
- **Open:** everything as normal. The moderator dashboard's **Waitlist** tab then sends **Email the Waitlist That
  We're Open** (batches of 100, safe to re-run) and exports the list as CSV.
- `GET /api/waitlist/count` is the honest public count: `null` until `WAITLIST_PUBLIC_MIN` (100) confirmed people
  are in line.

## Architecture

```
 browser ──HTTP /api──►┐            ┌──────────────── one Node process ─────────────────┐
 (Vite dev proxy or    │            │ Hono REST: auth, profile, save, friends, scores…   │
  same origin in prod) ├──────────► │ ws realtime: rooms → instances → 15 Hz batches     │──► SQLite (WAL)
 browser ──WS /ws─────►┘            │ static: app/dist (production)                      │    server/data/club-nyc.db
                                    └────────────────────────────────────────────────────┘
```

| Piece | Where | Notes |
|---|---|---|
| Protocol | `app/src/net/protocol.ts` | Shared by client and server. Clients send **intents** ("walk to x,y", "say hi"), never per-frame positions. Each client animates walks with the same nav grid, so a busy room costs a few events per second rather than a position stream. |
| Rooms and instances | `server/src/game/realtime.ts` | `room → [instance 1, instance 2…]`, `ROOM_CAP` per instance. Placement score = friends there × 1000 + headcount, so rooms feel full but never overflow. Apartments are their own instances (`apartment@<owner>`). |
| Broadcast | same | Events are queued per instance. Every `TICK_MS` (66 ms) each queue is serialised and UTF-8 encoded **once**, and the same buffer goes to everyone in it. Slow consumers (over 1 MB buffered) are dropped rather than slowing the room down. |
| Validation | same + `game/geo.ts`, `game/rules.ts` | Walk targets are clamped to the room's walkable floor (the client's own geometry files), seats checked, looks checked against the item catalog, poses and emotes against allow-lists, and titles and teams sanity-checked. 4 KB max message. |
| Rate limits | sockets: per-player token buckets · REST: `server/src/limits.ts` per IP | move 6/s, chat 0.7/s (burst 3, flooding means a 30 s mute), actions 4/s, snowballs 1.5/s, 30 msgs/s overall. New guest accounts are limited to 6/min per IP. |
| One session per account | `connect()` | A second tab takes over ("Playing somewhere else?" → *Play here instead*). If a connection drops, friends see you as offline only after 8 s, so reloads and room hops don't flicker. |
| Client | `app/src/net/*` | `socket.ts` (reconnects with backoff and jitter), `multiplayer.ts` (events → Actors, friends, presence pill), `session.ts` (sign-in, cloud save), `link.ts` (the no-dependency seam the world reports through; a no-op offline). |
| Scores | `POST /api/games/:id/start` → run token, `…/finish` | The server knows when the run started. A score is accepted only if the run is yours, unfinished, at least half the game's minimum length, and under a per-minute cap for that game. Weekly and all-time bests are upserted; job coins go to your team. |

## Measured

Bots act every 1.5–4 s: walking, chatting, dancing, emotes, pings. That's several times busier than a real player. Run on a laptop (Apple Silicon, Node 24), server and bots on the same machine.

| Load | Server time per tick (of 66 ms) | Delivered | Ping p95 | Memory |
|---|---|---|---|---|
| 60 players, 1 room | 0.45 ms | 1,380 events/s | 1 ms | 119 MB |
| 300 players, 8 rooms | 1.35 ms | 4,290 events/s | 1 ms | 123 MB |
| 500 players, 8 rooms (each spills into a 2nd copy) | 3.2 ms | 11,000 events/s · 750 KB/s | 2 ms | 144 MB |

A real browser in Times Square with **45 other players** walking, chatting and dancing around it ran at **59 fps** (p95 frame 16.8 ms, headless Chromium with software rendering; `tools/mp_perf.py`). The art in the production build went from 339 MB to 77 MB by leaving the art pipeline's raw generations out.

Back of the envelope: one process has room for roughly **2–3 thousand concurrent real players** before the broadcast tick gets busy.

## Scaling plan

1. **Now: one process, one world.** Vertical scaling plus a CDN in front of `/art`. Converting rooms and cutouts to WebP or AVIF would roughly halve download size.
2. **More cores, still one world.** Move SQLite → Postgres (the SQL is plain, so it's mostly a driver swap) and rate-limit buckets → Redis. Then run N realtime processes, each owning a slice of room instances (consistent hash of the instance key). A thin gateway or the client's room-join step routes to the owner. Presence (`user → node, room`), friend notifications and the headcount move to Redis hashes plus pub/sub. Room traffic never crosses nodes, so this scales close to linearly, and everyone is still in the same world.
3. **Regions.** Separate deployments per region with shared accounts, or Club Penguin–style named worlds if latency demands it.

## Running it in production

Railway, one service, one replica, a volume at `/data` — see [deploy-railway.md](deploy-railway.md) and, when something breaks, [runbook.md](runbook.md). `server/src/ops.ts` adds the health check (`/api/health` is 503 while the database is unreachable or the server is stopping), graceful shutdown (players are told the city is restarting, sockets close with "service restart", clients reconnect on their own in about a second, the database is checkpointed and closed) and backups (`VACUUM INTO` every 6 h, 28 kept, optional off-site copy to any S3-compatible bucket). Crash reports from players' browsers go to `/api/client-errors`; REST writes are rate-limited per player (not per IP, so people behind one shared IP don't share a budget).

## Not done yet

- **Phones**: deliberately not supported — they get a "Best on a computer" page.
- **More sign-ins**: Apple isn't built (it needs a paid Apple developer account). Guests, Google, X, Discord and email links work.
- **Furniture inventory** is still trusted from the save (cosmetic only).
- **More than one server process**: see the scaling plan above.
- If the audience includes children under 13: they aren't allowed today (13+ gate); allowing them would need parental consent and an allow-list chat mode (Club Penguin's "Safe Chat").

## Testing

- `.venv/bin/python tools/mp_test.py`: on its own private game server + Vite (free ports, throwaway database), two separate browsers sign up through the real UI and run 26 checks. They see each other, chat (and it gets filtered), walk and dance in sync, friend each other live, score on the shared leaderboard (an instant 999 is rejected), leave rooms, visit an apartment and sign a guestbook, and come back after a reload. Screenshots go to `tools/out/mp-*.png`.
- `npx tsx server/scripts/loadtest.ts <bots> <seconds> <room|random>`: the numbers above.
- `.venv/bin/python tools/mp_perf.py`: client frame times in a crowded room (start a load test first).
- `.venv/bin/python tools/launch_test.py`: the launch checks (41) against the production build on a throwaway server — wallet protections, invites, moderation, admin, maintenance, backups, a graceful restart.
- `npm --prefix server run clean-test-users`: removes the bot/QA accounts those scripts create.
