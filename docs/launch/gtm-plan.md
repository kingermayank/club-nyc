# Club NYC go-to-market plan

Written Oct 29, 2026 for a **Tuesday, Nov 17, 10:00 ET** opening. Launch HQ (`/hq.html`, the **Launch HQ** link in the landing page's footer) is the one control panel: Today, Launch (the open switch, the launch email, the checklist), Content (calendar, feed, library, films, playbook), Emails, People, Safety and Controls. It shows all of this live: what needs you, the countdown and readiness checks, the content calendar with approvals, every email with a preview, and the film storyboards. This builds on `launch-campaign.md` (press, creators, channels) and `growth-playbook.md` (why people share); it doesn't repeat them.

## 1. The shape of it

| When | Phase | What the world sees | The ask |
|---|---|---|---|
| Oct 29 to Nov 9 | Teaser | Two posts a day; landing page asks people to **claim a name** | Follow, claim your name |
| Nov 10 to 16 | Founders’ Preview | Real players on screen; the trailer; creators start | Get an invite |
| Nov 17 to 23 | Launch week | The city opens at 10:00 ET by itself; a reel a day around that night’s event | Come tonight, bring friends |
| Nov 24 to Dec 6 | First weeks | Job of the Week, leaderboards, week-one numbers | Come back for this week’s thing |
| Dec 7 to 27 | Winter in the city | The rink, apartment parties, holiday-home friends | Bring the people you’re home with |

## 2. Waitlist to open: how the switch works

- **Before:** `LAUNCH_MODE=waitlist`. The landing page takes a name and an email; `/play` shows Coming Soon; testers get in with `PREVIEW_CODE`.
- **The switch:** Launch HQ → Launch: **Open the city now**, or schedule a time (Nov 17, 10:00 ET). At that second every request sees the city as open: the landing page says Play Now, `/play` lets everyone in. No redeploy, nobody needs to be awake (`launchModeNow()` / `setOpening()` in `server/src/waitlist.ts`; the switch is stored in the database and wins over `LAUNCH_MODE` / `LAUNCH_AT`).
- **At that moment, by itself:** the launch email starts (batches of 100, safe to re-run; each carries the reader’s name and a one-click **Claim** link), and everyone already in the city (Preview testers) gets the **Founder** badge. Waitlisters get it when they come in, by the Claim link or any sign-in with the same email.
- **Undo:** **Back to the waitlist** on the same page; maintenance mode from Launch HQ → Controls; backups to restore.

**Server prep.** The load test (`load-test-report.md`) held 1,000 players at 5 ms a tick on one server, so capacity isn’t the risk. What is:
1. **Email limits:** Resend’s free plan sends 100 a day. If the confirmed list passes about 90 by L-3, upgrade to Pro for launch week.
2. **Backups:** they currently sit on the same volume as the database. Point `BACKUP_S3_*` at a Railway bucket before launch (I can set it up).
3. **A fresh production database** (member numbers start at 0001), rehearsed once on a staging environment.
4. **Freeze features at L-3.** Only fixes after that.

The full opening-day runbook is in Launch HQ → Launch.

## 3. Email journeys

18 emails in 6 journeys, all written in the live emails’ design (`server/src/journeys.ts`), previewable in Launch HQ → Emails. Three are live today; the rest are written and ready to wire. Nothing is in Resend yet, by design.

1. **Waitlist:** Your name is saved (live) → You’re in line + bring a friend (on confirm) → First look: the trailer (opt-in) → Founders’ Preview invite (opt-in, in waves) → The city is open: claim your name (live) → Your name is still waiting (L+3, once).
2. **New New Yorker:** Welcome, with three things to do (10 min after making a New Yorker, if they have an email) → “Your building misses you” (day 3, only if they haven’t come back) → Your first week (day 7, only if they came back).
3. **Friends:** Your friend moved in (someone joined from your link) → a friend request is waiting (planned).
4. **Win back:** New in the city (day 14 away) → last one from us (day 30, then silence).
5. **Newsletter & events** (opt-in topics, Resend broadcasts): the Club NYC Times every other Thursday; event invites two days before.
6. **Account & safety** (always): sign-in link (live), a new sign-in was linked, account deleted.

**Rules:** transactional always sends; everything else needs consent, has per-topic unsubscribe, goes out 11:00 to 19:00 ET, at most one every 3 days and two a week, and stops the moment its goal happens. The waitlist was promised the confirmation, the launch email and one reminder: anything more is opt-in. Marketing emails need a postal address (`MAILING_ADDRESS`, US CAN-SPAM).

**How it gets built:** our server sends the personal emails (it knows names, stats and who came back), with a small `email_jobs` table for the delayed ones. Resend gets the **Club NYC Times** and **Events** topics, a segment of opted-in players, and broadcasts. Templates are written once in our design and exported to Resend for the broadcasts.

## 4. Content: two posts a day for 60 days

`tools/instagram/plan.mjs` has all 120 posts, and Launch HQ → Content lets you approve them. There are no AI or real people in it yet; the Bea host reels are parked.

- **Two slots:** **12:00 ET** for reach (mostly reels that find new people), **19:00 ET** for community (carousels, singles, and event reels an hour before the evening’s event).
- **The story behind them** (Oct 30 research, `docs/marketing/story-research.md`): then a safe place with friends, now a scattered crew in an expensive city, here the same crew in a bigger city. **Same crew. Bigger city.**
- **18 recurring series**, so a new post is a data entry rather than a new edit:
  - Same crew. Bigger city. (the story film)
  - Real New York vs Club NYC, and New York then and now (public-domain and CC0 photos next to the game)
  - Money diary
  - The penguin game grew up
  - Manhattan in ten seconds
  - POV: a day in Manhattan
  - This or that
  - The Trailer (mock-epic, one per job)
  - Job of the Week + Leaderboard
  - Apartment tours
  - Flash mobs and Dance Jams
  - How to speak New Yorker
  - City guides
  - This week in the city
  - Quizzes
  - Locals say
  - Behind the city
  - You built this (player clips, after launch, with permission)
- **Mix over 60 days:** about 55% reels, 30% carousels, 15% singles. Every reel is full-screen portrait or a stacked “this or that”, except the window-versus-portrait trial.
- **What’s ready:** 45 posts are rendered (30 of them before launch). 74 are “to make”, each with a production note; that’s about 9 a week.
- **The weekly batch:** Monday, review last week. Anything at twice the median sends gets two new versions; anything under the median twice is retired. Tuesday, I render the week (reels from `reels.ts`, carousels from `posts.ts`). Wednesday, you approve in Launch HQ.
- **New footage needed:** tall clips of Battery Park, One World Trade and the rink at night; the three multiplayer games (bike dash, Rush Hour Run, Carb-Jitsu); and after launch, real players’ clips (with permission).
- **Kept out:** real store names, the I ♥ NY sign, sponsor names (the bike game is “the Bike Dash” in posts), a named real parade, fake scarcity, rounded-up numbers and em dashes.

**Founder posts** (Launch HQ → Content → Founder posts, from `server/src/founder.ts`): five LinkedIn posts and five X threads in Mayank's voice, posted by hand from his own accounts. Waitlist (Oct 30), how it's built (Nov 3), the launch control room (Nov 6), the load test (Nov 12), and opening day (Nov 17). Each one lists what to attach and what to check before posting. The story film goes with the waitlist posts and the trailer with opening day.

## 5. The films

Storyboards are in Launch HQ → Films.

- **Teaser, “Someone’s moving in”** (15 s, both shapes, L-10): empty rooms at dawn, one New Yorker walks in, the animated logo builds itself; it ends on “Claim your name.”
- **Launch film, “One link. Everyone’s there.”** (60 s, plus 30 s and 15 s cuts): a group chat sends a link, you land next to your friend, then the core loop on the beat (work, live, fall over, dance), with the drop on the 8 PM Times Square Dance Jam. Gameplay starts in the first second.
- **Bumper, “Lunch. Is. Coming.”** (6 s): from the Halal Rush trailer, for people who never knew the penguin game.

**Research notes:**
- Show gameplay in the first seconds, with no logo intro.
- Show the core loop early.
- Keep it under 60 to 90 seconds.
- End on one clear action.

Most trailer advice comes from action games, so the pacing here is deliberately a little gentler; that part is my judgement, not a finding. Sources: bugnet.io (“what makes a game trailer convert”), wnhub.io (gameplay-first mistakes), Unity’s trailer guide.

## 6. What needs you (also on Launch HQ → Today)

- DNS: the four Resend records at name.com.
- `MAILING_ADDRESS`, `COMPANY_NAME`, `CONTACT_EMAIL`, `DISCORD_INVITE_URL`, `PREVIEW_CODE` (by Nov 10).
- Resend Pro, if the list passes about 90 by Nov 14.
- The OK to push the Instagram publisher and create its Railway cron job, and to point Launch HQ at the social bucket.
- Approving posts (three days ahead at least) and the new emails’ copy.

## 7. Launch readiness research (Oct 29)

The dated task list is in Launch HQ → Launch (`TASKS` in `server/src/hq.ts`). Where it comes from:

- Railway health checks stop once a deploy is live, and a rollback doesn't roll back the database: [healthchecks](https://docs.railway.com/reference/healthchecks), [roll back](https://docs.railway.com/guides/roll-back-bad-deploy).
- US desktop browsers (Chrome 60%, Firefox 14%, Edge 12%, Safari 9%): [StatCounter](https://gs.statcounter.com/browser-market-share/desktop/united-states-of-america). Hidden tabs throttle timers: [Chromium](https://blog.chromium.org/2020/11/tab-throttling-and-more-performance.html).
- Email: [Resend warm-up](https://resend.com/docs/knowledge-base/warming-up), [subdomains](https://resend.com/docs/knowledge-base/is-it-better-to-send-emails-from-a-subdomain-or-the-root-domain), [Gmail sender rules](https://support.google.com/a/answer/81126), [CAN-SPAM](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business).
- Teen safety: [COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions), [REPORT Act](https://wsgr.com/en/insights/new-minor-safety-obligations-for-online-services-report-act-expands-child-sexual-exploitation-reporting-requirements.html). The FAQ suggests a cookie that stops age-gate retries; that lock was removed on purpose on Oct 19 (see legal-callouts.md), so it isn't on the list.
- Instagram: [ranking signals](https://www.socialmediatoday.com/news/instagram-shares-algorithm-insights-2025/738034/), [Trial Reels](https://www.engadget.com/social-media/instagram-will-let-video-creators-make-trial-reels-for-non-followers-160016725.html), [Collab posts](https://www.adobe.com/express/learn/blog/instagram-collab-posts), [original content](https://www.engadget.com/instagrams-algorithm-overhaul-will-reward-original-content-and-penalize-aggregators-130018977.html), [best times](https://sproutsocial.com/insights/best-times-to-post-on-instagram/), [influencer disclosure](https://www.ftc.gov/business-guidance/resources/disclosures-101-social-media-influencers).
- Positioning: [a crypto-optional penguin browser game launched in March 2026](https://nftnewstoday.com/2026/03/12/pudgy-penguins-launches-pudgy-world-browser-game-with-crypto-optional-design); [Disney's 2020 takedown of a Club Penguin private server](https://kotaku.com/disney-shuts-down-club-penguin-private-servers-due-to-h-1843522923).
- Launch channels: [Show HN rules](https://news.ycombinator.com/showhn.html), [Product Hunt](https://www.producthunt.com/launch/preparing-for-launch). The subreddit rules came from secondary write-ups (Reddit blocked the research tools): read each sidebar before posting.

**Memes** are now a series (Content → Memes, 19:00, about twice a week): 10 made in our own art and the game's icons (`meme-*` in `video/src/posts.ts`): nobody/punchline, expectation vs reality, starter pack, tier list. Formats still to try: alignment chart, "rate my apartment", spot-the-bodega-cat.
