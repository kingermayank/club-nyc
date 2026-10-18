# Club NYC Growth Playbook

> **Update (17 Oct 2026):** the founder dropped the "Founding New Yorker" concept (the first-1,000 ribbon, stamp and countdown). Ignore the founding-number ideas below; plain member numbers remain on the MetroCard.

How Club NYC spreads, why people come back, and what to build first. Written October 16, 2026, during the launch sprint.

- **Labels:** **LIVE** = playable today. **PLANNED FOR LAUNCH** = being built this sprint. **PROPOSED** = recommended here, not built.
- **Shipped since this was written (now LIVE):** the server-side wallet and ledger (coins can't be edited), invite links that land a friend next to you with rewards for both, Founding New Yorker numbers, the camera button's photo strips printed with your invite link, "Today in the City" daily quests, a daily refill that grows with the days you drop by each week (no punishing streak), a "Tell your friends" brag button for top-3 weekly finishes, invite-with-a-link from a house party, Times Square billboard shout-outs for new members and weekly #1s, the 13+ gate, rules/privacy/terms pages, and the moderator dashboard. The labels below are as of writing.
- **Effort:** **S** = 1–2 days, **M** = 3–7 days, **L** = 2+ weeks, for one developer who knows the codebase.
- **Impact** ratings are judgment calls, not forecasts. Every feature names the number that will prove it right or wrong. No metric in this doc was measured unless it says so.

**North Star** (from the founder's social-design doc): players should think *"I'm going to see who's in the city."* The same doc sets the house rules this playbook follows: no punishing streaks, no manipulative FOMO, no fake scarcity, no notification spam, extend what already exists before building new systems, and everything must still work when only two people are online.

Companion docs: [launch-campaign.md](launch-campaign.md) · [press-kit.md](press-kit.md) · [skills-reviewed.md](skills-reviewed.md)

---

## What makes a social game spread

Social games spread when a friend says "come here, I'm in Times Square" and ten seconds later you're standing next to them. Five mechanics do most of the work. Club NYC already has raw material for all five. What's missing is the wiring between them.

1. **Invite links that land your friend next to you.** The friend is the content. Someone who arrives next to a person they know hits the magic moment in the first minute. Someone who arrives alone, in a room of city locals, is one quiet session away from "I tried it, it was dead."
2. **Shareable things with a link printed on them.** Photo strips, MetroCards and moment cards are how Club NYC gets out of the browser and into group chats and Instagram stories. Without a link they're souvenirs. With a link they're doors.
3. **Status that's real and scarce: founding numbers.** "Founding New Yorker #0213" is a small, true, permanent brag. There will only ever be 1,000 of them, and that's a sentence a journalist can print.
4. **Appointments that make crowds.** With a small population you make crowds in time, not in space. The Dance Jam already pulls everyone into Times Square every 8 minutes. A nightly Prime Time Jam does the same for return visits.
5. **Public moments people screenshot.** A Times Square takeover, your avatar on the jumbotron, a packed penthouse party. These are the stories people retell, and the screenshot carries the game's name inside it.

Order matters. Invites and links come first, because they turn every other moment into a way in.

---

## A. The frameworks, distilled

### STEPPS: why people share
*Jonah Berger, Contagious (wondelai/contagious)*

People pass things on for six reasons. **Social Currency:** it makes me look good (remarkable, in the know, accomplished). **Triggers:** something everyday reminds me of it, and frequent cues beat big rare ones. **Emotion:** high-arousal feelings (amusement, awe, excitement) spread; contentment doesn't. **Public:** if others can see it being used, they copy it. **Practical Value:** it helps someone I know. **Stories:** the brand rides inside a story people retell; if they can retell it without your name, it failed. Two or three drivers done deliberately beat six done weakly. Most word of mouth happens offline, in conversation.

**For Club NYC:** New York supplies the triggers. Every dollar slice, halal cart, bodega cat, packed subway car and "no broker fee" listing is a daily cue the game has already turned into a joke. Emotion is strong (amusement, nostalgia). The weak spots are **Public** (nothing leaves the game) and **Social Currency** (status is mostly private).

### The Hook Model: how habits form
*Nir Eyal, Hooked (wondelai/hooked-ux)*

Trigger → Action → Variable Reward → Investment, repeated until external triggers (a message, a reminder) give way to internal ones (boredom, loneliness, "what's going on?"). Keep the action dead simple. Vary rewards across tribe (social), hunt (finding things) and self (mastery). Ask for investment after the reward, and make it load the next trigger. Ethics gate: build something the maker would use and that leaves people better off, and don't aim hooks at vulnerable users, including kids.

**For Club NYC:** the internal trigger to aim for is "I'm bored / I miss my friends / I miss New York." The action is already excellent (Play now, no form). Rewards vary well. The trigger is the gap: once the tab closes, nothing reaches the player.

### The Cold Start Problem: networks start empty
*Andrew Chen (wondelai/cold-start-problem)*

An empty network is worse than no network. Build one **atomic network** at a time: the smallest group that keeps itself alive. Write down the **magic moment** ("when X does Y, Z responds within T") and the **zero state** (the empty room), and measure both. Solve the **hard side** first: the few people who create most of the value. **Flintstone** the empty side honestly, with real work behind the scenes and never fake people. Invite-only mechanics import real friend graphs. Avoid the **big-bang launch**: press should harvest networks that already work, not try to create them.

**For Club NYC:** the atomic network is 3–5 friends online at the same time. The hard side is hosts: people who throw parties, start flash mobs and drag friends to the Jam. The 57 labeled city locals are honest flintstoning. They keep rooms alive and step aside for real players, and they must never be counted as players.

### Referral program design
*Corey Haines (coreyhaines31/referrals, formerly referral-program); omer-metin/viral-marketing and growth-loops*

The loop is trigger moment → share → friend converts → reward. In-product sharing and personal links beat emails and codes. Ask at a moment of delight, never at signup. Make rewards two-sided and give the friend the better gift. Reward activation, not signups. Show a preview before anything is sent, never auto-send, and build fraud checks on day one. **K = invites per user × conversion rate**, and cycle time (how fast a new player sends their first invite) matters as much as K. Incentives amplify sharing that already happens; they can't create it.

**For Club NYC:** the game sits at the "natural" end of the viral spectrum (it's a place you talk in, and it makes pictures), so build virality into the product (invite links, strips) and keep rewards small, cosmetic and paid only once the friend actually plays.

### Gamification loops: rewards that don't backfire
*omer-metin/gamification-loops; Daniel Pink, Drive (wondelai/drive-motivation)*

Run loops at four speeds: session, daily, weekly, long-term. A loop is healthy when the activity is fun without the reward, players can stop without penalty, streaks forgive, and competition runs on teams, cohorts or personal bests (one global top-10 demotivates the other 90%). Prefer "now-that" rewards (a surprise after the fact) and plain feedback over "if-then" bribes, which crowd out the fun. Expect players to game whatever you count.

**For Club NYC:** the current design is already healthy: weekly resets, a friends filter, team totals in Neighborhood Wars, and takeovers that rain coins as a surprise. Keep daily quests streak-free and make wins visible.

### Stickiness: messages people remember
*Chip & Dan Heath, Made to Stick (wondelai/made-to-stick)*

SUCCESs: Simple (one core sentence), Unexpected (break a pattern), Concrete (a detail you can picture), Credible (let people test it), Emotional (one person, not a statistic), Stories.

**For Club NYC:** "Club Penguin, but it's Manhattan" passes the one-sentence test. Credibility is instant play: no download, no form. The stickiest material is concrete: a halal-cart lunch rush, a subway "Showtime!" dance game, a taxi bed, "Partly pigeony" in the weather report, a penthouse listing with no broker fee.

### Ethical persuasion
*Robert Cialdini, Influence (wondelai/influence-psychology)*

Reciprocity, commitment, social proof, authority, liking, scarcity, unity. Layer them, keep them true, and run the test: would it still work if the player knew exactly what you were doing?

**For Club NYC:** unity (New Yorker, your neighborhood team, founding New Yorker) and honest social proof (the live "N New Yorkers are in the city right now") are the strongest levers. Use scarcity only where it's real: 1,000 founding numbers, and a line at the door only when the server is actually full.

---

## B. Honest audit: Club NYC's loops today

The goal is five verbs: people **come**, **interact**, **play**, **invite**, and the game gets **press**.

| Verb | What's working | Biggest gap | Fixed by |
|---|---|---|---|
| Come | Play now with no form; an honest live player count on the front door | Phones will hit a wall; no reason to show up at a particular time | #4, #5 |
| Interact | Chat, waves, friends, the Jam, flash mobs, parties, snowballs | The magic moment isn't defined or measured; quiet hours look empty | #1, #4, #9 |
| Play | 5 jobs, validated leaderboards, Neighborhood Wars, 45 stamps, 100+ outfit pieces | Wins are invisible; coins are client-side until the wallet ships | #7, #8, #10 |
| Invite | Nothing | No invite path, and nothing shareable carries a link | #1, #3, #6 |
| Press | A one-line pitch, a unique newspaper, labeled locals, measured server numbers | No founder story told yet; no hook beyond "it exists" | #2, #13, [launch-campaign.md](launch-campaign.md) |

### Loop by loop

| Loop | LIVE today | What breaks it | Verdict |
|---|---|---|---|
| **Arrival** | Play now (guest, no form) → 6-step creator with a free welcome gift → MetroCard reveal → Times Square → "New in Town" quests | A friend's referral and a stranger's visit look identical. | Strong start, no social entry |
| **Presence** | Live count on the front door, the City tab ("who's in the city"), city-pulse notices with Go buttons, a buddy list with live locations | When nobody's on, the front door honestly says "Quiet morning — be the first one in the city!" That's the zero state, and nothing outside the game says when it's busy. | The North Star is literally built; it needs triggers |
| **Crowds** | Dance Jam every 8 minutes (3-minute show, tips for dancing); flash mobs (4+ dancers: billboards dance; 6+: a takeover with confetti and coins); snowball fights | No fixed prime time. The countdown only shows inside Times Square. Record crowds aren't tracked or celebrated. | The best cold-start asset in the game |
| **Home** | Apartments, decorating with 25+ furniture pieces, StreetCheesy homes (walk-up, loft, penthouse), guestbooks, likes, Open House, house parties with synced music, public parties in the City tab | No party link to send. Hosts get almost no public credit. | Deep investment; hosts underpowered |
| **Competition** | 5 jobs; weekly and all-time leaderboards, server-validated, with a friends filter; "beat my score" challenges; Neighborhood Wars | Wins live inside the Community panel. Nothing to show off. | Healthy design, invisible wins |
| **Collection** | 100+ outfit pieces, 45 stamps, titles, a daily coin bonus | Coins live in the cloud save, so a determined player can edit them (server wallet PLANNED). | Good hunt; fix fairness before rewards |
| **News** | The Club NYC Times covers real New York moments | No fixed cadence, no public web edition, nothing to share. | Unique and under-used |
| **Share** | MetroCard PNG download at the end of onboarding; photo-booth strips (built, but only reachable from the developer console) | The MetroCard has a random six-digit number and no link, and it's offered once. The strip is unreachable. Neither leads back in. | The loop doesn't close |
| **Invite** | None (`/join/<name>` PLANNED) | A friend has to sign up, find you and add you before friend-aware placement helps. | Missing; top priority |
| **Return** | Daily bonus, weekly resets, Monday Wars results, all inside the game | No email, calendar or notification reaches anyone who isn't already playing. Guests are anonymous by design. | Missing |
| **Safety** | Server chat filter (strips links, emails and phone numbers; masks swears; flood timeouts), mute/block/report, locals labeled | Reports are stored but there's no admin screen (moderation dashboard PLANNED). No age gate yet (PLANNED). | A launch gate, not a growth feature |

### Scorecards
*Each skill's own rubric; our assessment from reading the code, not measured data.*

| Framework | Score | Why |
|---|---|---|
| **STEPPS** | 6 of 12 raw, about 6–7/10 | Emotion 2 (amusement, nostalgia). Social Currency 1 (stamps and titles are private; the MetroCard number means nothing). Triggers 1 (NYC cues in content, nothing outside). Public 1 (great in-game moments, none leave the game). Practical Value 0. Stories 1 (the paper; the founder's story isn't told). |
| **Hook Model** | about 6/10 | Action 2 of 2 (Play now). Variable reward 2 of 2 (tribe, hunt and self are all there). Investment 1 of 2 (apartments, wardrobe and friends are real stored value, but they don't load a trigger that reaches you while you're away). Trigger 0 of 2 (nothing outside the tab; the internal trigger is unproven). |
| **Cold Start** | about 5/10 | Density is designed in: friend-aware placement, 60-player rooms, the city-wide Jam clock, labeled locals. Missing: a named atomic network, a magic-moment or zero-rate metric, invite mechanics, and a launch sequenced network by network. |
| **Referral readiness** | Not started | Natural viral fit. Planned invite links and founding numbers cover the core; rewards need activation gating and fraud checks. |
| **Gamification health** | about 8/10 | Weekly resets, friends filters, team competition, surprise rewards. Missing: shareable milestones. Keep daily quests streak-free. |
| **Made to Stick** | Strong | "Club Penguin, but it's Manhattan" works. Needs the founder's own story and two or three concrete details in every pitch. |

### The six gaps that matter most

1. **Nothing leaves the game with a way back in.** The MetroCard ID is offered once, at the end of onboarding, as a PNG with a random six-digit number and no link (`app/src/features/creator.ts`). The photo-booth strip is built (`app/src/features/photobooth.ts`) but only reachable from the developer console. Every share today is a dead end.
2. **You can't bring a specific friend to you.** Room placement already favors friends (each copy of a room is scored friends × 1000 + headcount in `server/src/game/realtime.ts`), but that only helps once two players are already friends. A new player sent by a friend lands like a stranger.
3. **No trigger reaches a player outside the game.** No email, no calendar, no notifications. Daily bonuses, weekly resets and Monday results only work on people who already remembered to come back.
4. **The magic moment isn't defined or measured.** Nobody knows how many new players meet a real person in their first session, or how many land among only locals. "Quiet morning — be the first one in the city!" is the right copy, and it's also the zero state.
5. **Status is private.** Stamps, titles and ranks live inside panels. Even the Times Square billboard cam ("● LIVE · SMILE, NAME!") only shows you to yourself.
6. **Phones are a dead end.** The planned desktop-only page will greet most TikTok and Instagram traffic. If all it says is "open this on your computer," the most expensive attention of the launch leaks away.

### What's already working (protect it)

- **Play now, no form.** The best possible first action.
- **Friend-aware rooms.** Rooms cap at 60 and a second copy puts you with your friends.
- **A city-wide Jam clock.** Every player agrees when the show is on without asking the server (`app/src/data/jam.ts`).
- **Crowds that pay off.** Flash mobs scale with participation; at 6+ dancers Times Square is taken over.
- **Honest locals.** Labeled, and they step aside for people. That's a press-worthy design choice.
- **Fair boards.** Scores are checked against server run tokens, so leaderboards can be trusted.

---

## C. The feature list, in priority order

### Tier 1: ship before the press push

#### 1. "Meet me here" invite links
**Status:** PLANNED FOR LAUNCH (`/join/<name>` and referral rewards). **Effort:** M.

**What it is.** Every player gets a link: `[URL]/join/<name>`. Opening it shows the inviter's avatar and where they are right now ("Maya is at the Dance Jam in Times Square · 6 New Yorkers dancing"), plus one button: **Play now and land next to Maya.** The friend makes a quick New Yorker (the inviter's team pre-selected but changeable), then appears in the inviter's copy of the room, beside them, with a friend request waiting. If the inviter is offline, the friend lands in Times Square and the inviter finds a guestbook note next visit: "Sam arrived through your link." Offer the invite, with a pre-written message the player can edit, in three places: the player card, the City tab when it's quiet ("It's quiet. Bring someone"), and right after a high point (first takeover, first party, first top-10 score).

**Framework.** Cold Start (invites import real friend graphs; the atomic network is a few friends online together). Referral design (in-product personal link, asked at a high point, two-sided). Influence (liking and unity: the invite comes from a friend, not from us).

**Why it works for Club NYC.** The placement code already wants friends together. This shrinks "my friend sent me a link" to "I'm standing next to my friend" in one click, which is the magic moment. It's also the ritual the Club Penguin generation remembers: "meet me at the Coffee Shop" becomes "meet me at Times Square."

**Expected impact.** Highest on the list. It's the main acquisition loop and the only one that also fixes the empty room for the new player.

**Builds on.** Placement scoring in `server/src/game/realtime.ts`, friend requests in `server/src/api.ts`, the creator in `app/src/features/creator.ts`.

**Measure it.**
- Invites created per weekly active player.
- Invite opens, split phone vs desktop.
- **Landed-next-to rate:** invitee and inviter in the same copy of a room within 10 minutes of the invitee finishing their New Yorker.
- **K** = invites sent per new player in their first 7 days × the share of invites that become a player who plays 10+ minutes.
- **Cycle time:** days from a player's signup to their first invitee's signup.
- D7 retention of invited players vs players who arrived alone.

**Guardrails.** No contact-book import, no auto-posting, nothing sent without a preview. Rate-limit link creation. Rewards are cosmetic, capped and paid only after the friend plays (#6).

#### 2. Founding New Yorker numbers (#0001–#1000)
**Status:** PLANNED FOR LAUNCH. **Effort:** S.

**What it is.** The first 1,000 players get a permanent, sequential number when they finish their New Yorker. It replaces the random "No." on the MetroCard and shows on the player card, the name tag and photo strips: "Founding New Yorker #0213." The front door shows a true, live counter ("412 founding cards left"). After #1000 the badge stops and numbers keep counting without it.

**Framework.** STEPPS Social Currency (exclusivity, a visible marker). Influence: scarcity (real) and unity (a founders' tribe). Made to Stick: concrete.

**Why it works for Club NYC.** The MetroCard already prints a number; it just doesn't mean anything yet. The Club Penguin crowd still talks about the Beta Hat. New York loves a "Since 19XX" sign. It's nearly free to build and gives launch-day press a countdown.

**Expected impact.** High during launch (urgency, a press hook); medium after.

**Builds on.** The card reveal and `downloadCard()` in `app/src/features/creator.ts`; the profile claim (`POST /api/profile`).

**Measure it.** Time to #1000. Founding members' D7 and D30 vs later players. Share rate of founding MetroCards. Share → new player conversion.

**Guardrails.** Never sell, extend or quietly reopen founding numbers. Clear out test and bot accounts before launch so they don't eat numbers (`npm --prefix server run clean-test-users`). Prompt founding members to protect their number by linking Google or X, which also stops guests losing accounts when cookies clear (the keys need to be live by launch).

#### 3. Photo strips and MetroCards that carry your link
**Status:** camera/photo-booth button PLANNED FOR LAUNCH; MetroCard re-share and links PROPOSED. **Effort:** S–M.

**What it is.** A camera button on the toolbar opens the existing four-pose photo booth, which pulls in whoever is standing near you, real players included. Each strip prints the place, the date, your founding number and your short join link. Offer three sizes: the classic strip, a 9:16 story and a square. Share uses the phone or computer's share sheet where available (already coded); otherwise it saves the image and copies the link. The MetroCard gets the same treatment and can be reopened from the player card any time, with a small QR code so people who see it on a phone can find the join page.

**Framework.** STEPPS Public (visible residue) and Social Currency (identity). The referral skill's watermark and exposure loop: every share advertises the game and carries a personal way in. The viral-generator "screenshot test": the image has to work with no explanation.

**Why it works for Club NYC.** The art is cute and the backdrops are famous. Four friends squeezed in front of the Brooklyn Bridge is a natural Instagram story, and everyone in the strip gets tagged. Club Penguin nostalgia posts already circulate; this gives them something new to post.

**Expected impact.** High. It's the main exposure loop outside the game.

**Builds on.** `app/src/features/photobooth.ts` (strip render, download, share sheet); `downloadCard()` in `creator.ts`.

**Measure it.** Strips per daily active player. Save/share rate. Join-page visits tagged `src=strip` or `src=card`. Strip → new player conversion.

**Guardrails.** Strips currently print the name of everyone in the shot. Print names only for the taker and their friends; show everyone else as an avatar. Add a "keep me out of photos" setting.

#### 4. Prime Time Jam: appointments that make crowds
**Status:** Dance Jam LIVE (every 8 minutes, 3-minute show); additions PROPOSED. **Effort:** S.

**What it is.**
- Show "Next Dance Jam in 3:12" everywhere: the front door, join pages, the City tab, the phone page. Today it only shows inside Times Square.
- A **Prime Time Jam** every night at a fixed hour (for example 8:00 PM ET) with a host: the founder, a creator, a community DJ. Premiere a new track there now and then.
- The LED wall shows the real crowd ("REAL NEW YORKERS ON THE FLOOR: 23") and the record ("RECORD: 41"). Locals never count.
- "Add to calendar" (an .ics file, no email needed) for Prime Time and special Jams.

**Framework.** Cold Start (an event concentrates a small population in one place and time). Hook (a scheduled external trigger that becomes "it's almost 8, who's at the Jam?"). STEPPS Triggers and Public. Influence: commitment (it's in your calendar).

**Why it works for Club NYC.** With a small population, spreading players across 24 places and 24 hours guarantees empty rooms. The Jam clock already synchronizes the whole city; Prime Time does the same for return visits. The flash-mob thresholds (billboards at 4+, takeover at 6+) already reward the crowd once it's there.

**Expected impact.** High on the zero rate and the magic-moment rate.

**Builds on.** `app/src/data/jam.ts`, `app/src/features/dancejam.ts`, `app/src/social/flashmob.ts`, `/api/online`.

**Measure it.** Real players on the floor per show (median and peak). Prime Time attendance night over night. Share of new players who attend a Jam in their first session. Calendar adds → attendance. The record crowd over time.

#### 5. Phone visitors: "Save my spot"
**Status:** desktop-only page PLANNED FOR LAUNCH; the capture PROPOSED. **Effort:** S for calendar and share-to-self, M with email or name reservation.

**What it is.** The "open this on your computer" page becomes a conversion page. It plays a short loop of the Dance Jam and, for invite links, says who's waiting ("Maya is in Times Square. You'll land next to her when you open this on a computer."). It offers three ways back: **Add tonight's Prime Time Jam to my calendar**, **Send this link to myself** (share sheet or copy), and, once email or Google/X sign-in is ready, **Reserve my name and founding number** so the desktop session picks up where the phone left off.

**Framework.** Hook (an external trigger that bridges devices). The launch skill's ORB model (turn rented attention into an owned relationship). Referral design (optimize the referred person's landing).

**Why it works for Club NYC.** TikTok and Instagram are where NYC creators and nostalgia posts live, and that traffic is almost all phones. The game is desktop-only at launch. Without this page, every creator push sends people into a wall.

**Expected impact.** High during creator and social pushes; low otherwise.

**Measure it.** Phone visits. Capture rate (calendar adds, link sends, reservations). Share of captured phone visitors who play on a computer within 72 hours.

#### 6. Referral ladder and the Founders' Wall
**Status:** referral rewards PLANNED FOR LAUNCH; the ladder and the wall PROPOSED. **Effort:** M.

**What it is.** Rewards for friends who actually play (finish their New Yorker and spend 15 minutes in the city). All cosmetic, all visible:
- 1 friend: a "Plus One" pin on your outfit.
- 3 friends: a "Stoop Crew" bench for your apartment.
- 5 friends: your name on the **Founders' Wall** in Grand Central, an in-game plaque anyone can read.
- The invited friend always gets a gift too, and theirs is better: their pick of a starter item.

**Framework.** Referral design (tiered, two-sided, rewards activation, Morning Brew-style ladder). STEPPS Social Currency (status other people can see). Drive (recognition, not a bribe).

**Why it works for Club NYC.** Coin rewards would get farmed while coins are client-side, and would cheapen the shops. Visible cosmetics are what this audience actually brags about, and a plaque in Grand Central is a reason to take a screenshot.

**Expected impact.** Medium–high. It amplifies #1; it can't replace it.

**Measure it.** Share of players with at least one activated invite. The invite distribution (who are the top 1%?). Fraud flags (same IP or device). D30 of referred players.

**Guardrails.** Same-device and same-IP checks, per-player caps, rewards held until the friend activates. No coins.

### Tier 2: launch week and week 2

#### 7. Jumbotron shout-outs
**Status:** billboards LIVE (the big screen sometimes shows you to yourself); shared shout-outs PROPOSED. **Effort:** S–M.

**What it is.** Make some billboard slots shared and earned, so everyone in Times Square sees the same rotation: this week's #1 on each job board, the newest founding numbers ("WELCOME, #0613"), last night's Party of the Night host, the team leading Neighborhood Wars, the record Jam crowd. Pick the rotation from a shared clock, the way the Jam does, so it adds no server traffic.

**Framework.** STEPPS Public and Social Currency. Gamification (social recognition instead of more points).

**Why it works for Club NYC.** "My avatar was on a Times Square billboard" may be the most screenshot-able sentence the game can produce, and it's a cartoon of a real New York ritual.

**Expected impact.** Medium–high for screenshots and leaderboard play.

**Builds on.** The `bb-cam` slide in `app/src/features/billboards.ts`; the leaderboard API.

**Measure it.** Leaderboard participation week over week. Strips taken in Times Square while a shout-out is up.

#### 8. Daily quests with one social slot, no punishing streaks
**Status:** PLANNED FOR LAUNCH. **Effort:** M.

**What it is.** Three small tasks a day, reset at midnight New York time (`app/src/data/economy.ts` already defines three daily quests plus a completion bonus). At least one is social: dance at a Jam, wave at three real New Yorkers, sign a friend's guestbook, work a shift for a team that's behind. Players can swap one quest a day. Show "5 of 7 days this week" progress with a surprise cosmetic at the end. No resetting streak counter and no "you'll lose your streak" messages.

**Framework.** Hook (variable reward, small investment). Drive (choice; now-that rewards). Gamification health (finite daily goals, natural stopping points). The founder's rule: no punishing streaks.

**Why it works for Club NYC.** It gives daily players a reason to come and steers them into shared moments (the Jam, a friend's apartment) instead of solo grinding, which makes crowds for everyone else.

**Expected impact.** Medium on D1 and D7.

**Measure it.** D1/D7 of quest completers vs non-completers. Completion rate of the social quest. Quest → Jam attendance.

#### 9. Hosts are the hard side: party links, Party of the Night, the society page
**Status:** house parties LIVE (synced music, public or friends-only, listed in the City tab, online friends invited automatically); additions PROPOSED. **Effort:** M.

**What it is.**
- A party link (`[URL]/party/<name>`) that drops guests straight into the party.
- Scheduled parties ("Fri 9 PM · Bodega Rave at Maya's") listed in the City tab ahead of time.
- **Party of the Night:** the party with the most real guests gets the jumbotron, a line in the next Club NYC Times and a host title for the week.
- A **society page** in the Times ("Spotted at the Billionaires' Row penthouse: 14 New Yorkers and one bodega cat"), only for hosts who opt in.
- The host gets an automatic photo strip of the party.

**Framework.** Cold Start (hosts are the hard side; they want status and tools). STEPPS Public and Stories. Influence: commitment (scheduling). Drive (autonomy and mastery for hosts).

**Why it works for Club NYC.** A party is a self-organizing atomic network: the host brings friends, and strangers get somewhere to go. The StreetCheesy homes (walk-up, cast-iron loft, Billionaires' Row penthouse) give hosts something to work toward and show off.

**Expected impact.** High on D7, D30 and organic crowds.

**Builds on.** `app/src/features/houseparty.ts`, `partiesFor()` in `server/src/game/realtime.ts`, the newspaper.

**Measure it.** Parties per day. Median real guests per party. Share of new players who attend a party in their first week. Host return rate. Party-link visits → new players.

#### 10. Moment cards: "now-that" rewards you can share
**Status:** PROPOSED. **Effort:** M.

**What it is.** When something remarkable happens, offer a one-tap card (reusing the photo-booth renderer) with your avatar, the moment, the date, your founding number and your link. Moments: a Times Square takeover, #1 on a weekly board, your team winning the week, your 45th stamp, a party with 10 real guests. Offered, never posted for you.

**Framework.** STEPPS Social Currency (game mechanics made visible). Drive (now-that rewards). Referral timing (ask at the high point, not at signup).

**Why it works for Club NYC.** These are moments players already feel proud of. Today the pride stays in a panel.

**Expected impact.** Medium.

**Measure it.** Offer → save/share rate by moment type. Join visits per card type.

#### 11. The velvet rope: an honest line when the city is full
**Status:** PROPOSED. **Effort:** S–M.

**What it is.** If the number of players online nears what the server can safely handle, new arrivals wait in a "line outside the club": real position, an estimated wait, the next Jam countdown and the friends already inside. People arriving through a friend's invite get in first, so friend groups stay together.

**Framework.** Cold Start (admit clusters, protect the experience). Influence: real scarcity. STEPPS remarkability ("there's a line to get into a browser game").

**Why it works for Club NYC.** It's one process and one world, and a press spike is the moment you can least afford a laggy city. A line protects everyone inside, and it's a story in itself, as long as it's real.

**Expected impact.** Protective, with possible press value.

**Measure it.** Line length, wait time, abandonment, server tick time (p95) at peak.

**Guardrails.** Show the line only when capacity is real. Never stage one.

#### 12. Opt-in reminders: a calendar file and a weekly letter
**Status:** PROPOSED. **Effort:** M.

**What it is.** Two triggers we own, both opt-in. (a) Calendar files for Prime Time and special Jams (no infrastructure needed). (b) When a player links Google, one checkbox: "Send me the weekly City Letter and tell me when friends throw a party." At most one letter a week, plus capped party alerts. The letter carries the newspaper headline, the player's team standing and upcoming parties.

**Framework.** Hook (external triggers until internal ones form). The launch skill's owned channels. Gamification health (no notification spam).

**Why it works for Club NYC.** Guest-first is right for the first session, but today the game can't tell anyone who isn't playing that their friends are throwing a party on Friday.

**Expected impact.** Medium–high on D7 and D30.

**Measure it.** Opt-in rate, opens and clicks, letter → session, unsubscribes. Calendar adds → attendance.

### Tier 3: weeks 2–5, compounding

#### 13. The Club NYC Times, every Monday, on the open web
**Status:** newspaper LIVE; weekly cadence and public web edition PROPOSED. **Effort:** M for the weekly content work; S for the web page.

**What it is.** A new edition every Monday, in the game and as a public web page with a Play button and join links. Each edition: one real New York moment, reacted to within a day or two; the Neighborhood Wars result; the Jam record; Party of the Week; the society page.

**Framework.** STEPPS Triggers (real NYC news) and Stories. The PR skill's newsjacking and "public trail." Hook (variable reward). Community (celebrate member wins in public).

**Why it works for Club NYC.** It's a built-in media engine, the clearest proof of "the city's in-jokes as a game," and a fresh hook for journalists every week. ("Pizza Rat: A Legend Turns 11" is already in the paper.)

**Expected impact.** Medium on retention and press.

**Measure it.** Edition opens per weekly active player. Web-edition visits → plays. Press pickups that cite the paper.

**Guardrails.** Keep real people's names and likenesses out of anything that markets the game (New York's right-of-publicity law). Skip tragedies and politics during launch weeks.

#### 14. Neighborhood Wars Mondays
**Status:** Neighborhood Wars LIVE; the ceremony and team cards PROPOSED. **Effort:** S.

**What it is.** The week's winner is announced at Monday's Prime Time Jam (the LED wall in the winning team's color), with a shareable team card ("Downtown Slices won Week 3. I added 410 points.") and the odd rivalry week (Uptown Acorns vs Downtown Slices).

**Framework.** Influence: unity (place-based identity). Gamification health (team competition motivates more people than a top-10). STEPPS Triggers (every Monday).

**Why it works for Club NYC.** New Yorkers already argue uptown vs downtown. Teams give every player, not just high scorers, a reason to play and to share.

**Expected impact.** Medium.

**Measure it.** Share of weekly players who add team points. Team-card shares. Monday sessions.

#### 15. "Your Month in the City" recap
**Status:** PROPOSED. **Effort:** M.

**What it is.** A Wrapped-style card at the end of the first month (then monthly or seasonal): shifts worked, best score, friends made, parties attended, favorite place, your team's record.

**Framework.** STEPPS Social Currency (the Spotify Wrapped effect: personal, comparative, says something about you, arrives on a known date).

**Why it works for Club NYC.** It's a ready-made share moment that lines up with the "one month in the city" press beat.

**Expected impact.** Medium, concentrated in one week.

**Measure it.** Open rate, share rate, return sessions that week.

#### 16. Crew and campus tags, Campus Nights
**Status:** PROPOSED. **Effort:** S for the events, M for tags.

**What it is.** An optional crew tag on the player card (your friend group, your Discord, your campus) and a weekly Campus Night (a Jam or party run by a student host) for NYU, Columbia and CUNY. Later, verify campus tags with a school email.

**Framework.** Cold Start (campuses are the classic dense first network). Influence: unity.

**Measure it.** Campus cohort size and D7. Invites within a campus.

#### 17. Streamer and creator mode
**Status:** PROPOSED. **Effort:** S–M.

**What it is.** A toggle that hides other players' names and chat bubbles on screen (safety while streaming or recording), plus creator links that drop viewers into the creator's room (overflowing into Room 2 as usual).

**Framework.** Influencer marketing (equip creators; give each one a trackable link).

**Measure it.** Creator-link joins and the D7 of those players.

---

## D. Measuring it

Log a small set of events on the server from day one: an `events` table in the existing SQLite database, read by a private page in the planned moderation dashboard. No third-party trackers needed. `/api/online` and the dev-only `/api/metrics` are starting points.

| Event | Logged when | Key fields |
|---|---|---|
| `visit` | front door, join page, party page, phone page | source (`src`), device, inviter |
| `profile_created` | the creator finishes | inviter, founding number, device |
| `invite_created`, `invite_opened` | | inviter, channel, device |
| `landed_with_inviter` | invitee and inviter in the same copy of a room within 10 minutes | |
| `real_interaction` | first chat reply, wave back, friend request, or a Jam with 3+ real players | seconds since first arrival |
| `zero_session` | first 5 minutes with no other real player in the room | room |
| `jam_attended` | on the floor during a show | real crowd size |
| `share` | strip, card or MetroCard saved or shared | type |
| `party_hosted`, `party_attended` | | real guests |
| `quest_done` | | quest id |
| `report` | | reason |

**Definitions**
- **Magic-moment rate:** share of new players with a `real_interaction` in their first session.
- **Zero rate:** share of first sessions with a `zero_session`.
- **K, cycle time, landed-next-to rate:** see #1.
- **D1 / D7 / D30:** share of a day's new players (New York time) who play again on day 1, 7 or 30. Cut by: arrived with a friend vs alone; founding vs later; source.
- **Share rate:** shares per daily active player, and the share of daily players who shared anything.
- **Peak concurrent:** the most real players online at once (never locals), plus real players per active room.

**Starting bars.** These are borrowed from The Cold Start Problem's examples and are not predictions. Recalibrate after week one.
- Magic-moment rate above 40% of new players.
- Zero rate under 10% of first sessions.
- Half of new players arriving through invites or word of mouth by the time the city feels self-sustaining.

---

## E. Don't build these

- **Invite-to-unlock.** Never gate anything behind inviting friends. Forced shares are hostile shares.
- **Contact-book import or auto-posting.** Spam sticks to the brand, not to the player.
- **Coins for referrals.** They'd be farmed in a day while coins are client-side. Cosmetics only.
- **Punishing streaks.** House rule. Use weekly progress instead.
- **Counting locals as people,** anywhere: the front door, the press, the jumbotron.
- **Fake scarcity.** No resetting countdowns, no "only 3 left" that isn't true, no staged lines.
- **A global top-10 as the only board.** Keep weekly resets, friends filters and teams.
- **Loot boxes, pay-to-win, or ads that interrupt play.** None of them fit "never pay-to-win" or a 13+ audience.
