# Club NYC Launch Campaign

> **Update (17 Oct 2026):** the founder dropped the "Founding New Yorker" concept (the first-1,000 ribbon, stamp and countdown). Ignore the founding-number ideas below; plain member numbers remain on the MetroCard.

Pre-launch, launch week and the four weeks after. Written October 16, 2026. Days are counted from launch day **L** = [LAUNCH DATE]. Labels match the [growth playbook](growth-playbook.md): **LIVE** / **PLANNED FOR LAUNCH** / **PROPOSED**. Feature numbers (#1, #4…) refer to the playbook's list. Press materials are in [press-kit.md](press-kit.md).

---

## The plan on one page

- **Networks first, press second.** A press spike that lands on empty rooms convinces people the game is dead, and they rarely come back for a second look. So we seed friend groups and hosts in a two-week invite-only preview, then open to everyone on L with a scheduled crowd waiting.
- **No waitlist.** The game works today and Play now needs no form. A waitlist would add friction and, if it isn't really needed, it's fake scarcity. The scarcity is something true: the first 1,000 founding numbers.
- **The launch is a night out, not an announcement.** The Opening Night Dance Jam at 8:00 PM ET on L, then a hosted Prime Time Jam every night.
- **Every link lands you next to someone.** Creator links, community links, the founder's link: all `/join/<name>`.
- **Two audiences, two stories.** NYC press gets "the city's in-jokes, playable." Gaming and internet press get "the Club Penguin generation grew up" and "how to keep an online world from feeling empty."
- **Launch gates are real.** Moderation dashboard, rules, the age gate, Google/X keys, a production load test and a backup restore drill all happen before the first pitch goes out.

**When.** Pick a Tuesday; Product Hunt is strongest Tuesday through Thursday. Avoid the week of November 2–6, because the U.S. midterm elections fall on Tuesday, November 3, 2026, and they'll own the news. A mid-November Tuesday puts the four weeks after across Thanksgiving week (students and workers home with laptops; friends in different cities) and the start of the holiday season, which hands the city seasonal moments. Keep two backup dates.

---

## Positioning

**The one-liner (for talking):** "Club Penguin, but it's Manhattan."

**The one-liner (for print):** Club NYC is a free, Club Penguin–style hangout set in a cartoon New York City, played in your browser. *(Always pair with: not affiliated with Disney or Club Penguin.)*

**The plain version:** Make a cartoon New Yorker. Meet your friends in Times Square. Work a lunch rush at the halal cart. Find an apartment on StreetCheesy and throw a party in it.

**Three message pillars, each with live proof**

| Pillar | Proof (LIVE unless marked) |
|---|---|
| **A place to hang out with your actual friends** | Live chat, friends, "who's in the city," apartment visits, guestbooks, house parties where everyone hears the same song. Invite links that drop a friend next to you (PLANNED FOR LAUNCH). |
| **The city's in-jokes, playable** | 24 illustrated places; Slice Factory, Halal Rush, Bagel Counters, Ferry Captain and Showtime!; StreetCheesy; the Club NYC Times; parody brands like Starducks and NYKE; party music like "Empire State of Mine." |
| **Always something happening** | A Dance Jam every 8 minutes, flash mobs, snowball fights, weekly Neighborhood Wars, and 57 clearly labeled city locals so rooms never feel dead. |

**Use:** hang out, New Yorker, the city, your friends, free, in your browser, 13+.
**Avoid:** metaverse, revolutionary, AI-powered, "for kids," "official," anything that hints at Disney involvement, and "hand-drawn" (the README says the art was generated with an image model; see Risks).

---

## Launch gates (go / no-go)

| Gate | Status | Why it gates the launch |
|---|---|---|
| Invite links (`/join/<name>`) land friends next to the inviter | PLANNED | Every channel points here (#1) |
| Founding numbers #1–1,000 | PLANNED | The scarcity story and launch-day hook (#2) |
| Camera button; strips with the join link | PLANNED | The main share loop (#3) |
| Phone page with calendar file and send-to-myself | Page PLANNED, capture PROPOSED | Creator traffic is phones (#5) |
| Moderation dashboard; community rules, privacy and terms pages | PLANNED | Free-text chat plus a traffic spike |
| 13+ age gate | PLANNED | Club Penguin nostalgia will reach kids |
| Google and X sign-in keys live | Founder action (keys pending) | Otherwise guests who clear cookies lose their founding numbers |
| Server-side coin wallet | PLANNED | A fair economy before rewards and press |
| Railway deployment, database backups, one real restore | PLANNED | One process, one database |
| Load test against the production deployment | PROPOSED | The 500-player figure came from a laptop with simulated players |
| Brand review: "I ♥ NY," "MetroCard," subway route bullets | PROPOSED | Real marks used as in-game branding (see Risks) |
| AI-art disclosure decided | PROPOSED | The first question many games writers will ask |
| Fresh screenshots without the switched-off Halloween badge | PROPOSED | Most current in-game shots still show it ([press-kit.md](press-kit.md#screenshots)) |
| Event logging (playbook §D) | PROPOSED | Otherwise the launch teaches us nothing |
| Statement templates and who answers what | PROPOSED | The first hour of any incident |

If a gate slips, move the date, or run L as a quieter community launch and save the press push for when the gates pass. The launch skill's test: ship when it's Simple, Lovable and Complete, not when it's perfect.

---

## Pre-launch (L-28 to L-1)

### Waitlist or not?
**Recommendation: no public waitlist. Run a two-week invite-only Founders' Preview, then open fully on L.**

- **Why invite-only first:** it seeds density in clusters (friend groups, a Discord, a dorm floor) instead of first-come-first-served singles. Every preview player arrives knowing someone inside.
- **Why not a waitlist:** the game is playable and Play now has no form. A waitlist adds a step before the fun. Holding people back when the server has room is fake scarcity, and the founder's own rules rule that out.
- **Founding numbers** go out in the order people finish their New Yorker, starting with the preview. Keep the preview small enough that most of the 1,000 are still available on L; that's what makes launch day feel urgent. Show the true count everywhere.
- **People who can't play right now** (on a phone, at work) get "remind me" options: a calendar file for Opening Night, send-to-myself, and a one-time reminder email if email is ready.

### L-28 to L-21: Foundations
- Finish the launch gates. Test the invite flow end to end with two browsers, the way `tools/mp_test.py` already tests multiplayer.
- Brand review and the AI-art disclosure decision (see Risks).
- Owned channels: a Discord server for Founding New Yorkers (#photo-strips, #parties, #bugs, #lost-and-found), X, TikTok and Instagram handles, and a press page.
- Start warming up the Product Hunt maker account: three weeks of genuine activity (comment on launches you like).
- Build the media list: 20–40 journalists, each with their last five articles read (see Channels).
- Recruit 10–20 **founding hosts**: friends who'll throw parties, host Jams and bring their groups. They're the hard side.

### L-21 to L-15: Seed the first networks
- The founder personally invites 10–15 friend groups of 3–5 people and books each group's first visit for the same Prime Time Jam. One group online together is one atomic network.
- Watch those first sessions. Did every new player have a real person react to them within 10 minutes? How often did someone land in a room of only locals? Fix that before widening.
- Value-first outreach, no links yet:
  - r/ClubPenguin: read the rules and message the moderators.
  - Club Penguin fan Discords: ask the admins whether a community night would be welcome.
  - NYU, Columbia and CUNY: talk to club leaders (game dev, film, social clubs) about a campus night.

### L-14 to L-8: Widen the preview
- Each preview player gets five invite links, so the game spreads along real friend graphs.
- **Creators:** shortlist 15–25 NYC micro and nano creators with adult audiences (food carts and dollar slices, subway life, apartment hunting, 2000s nostalgia, cozy games). Give them early access, a founding number and a night to host. No scripts.
- **Communities:** one Club Penguin community night if invited; one campus night.
- **Press:** brief 3–5 top-tier journalists under embargo 5–7 days ahead, with preview access. At most two exclusives: one NYC outlet, one gaming outlet. Only offer embargoes to journalists you trust to keep them.

### L-7 to L-1: Dress rehearsal
- Load test the Railway deployment, not a laptop, with `server/scripts/loadtest.ts`. Watch tick time, memory and how fast the art loads through a CDN.
- Restore the database from a backup once, for real.
- Moderation rota for launch week: who's on, when, with which powers. Train 3–5 volunteer moderators from the founding members.
- Assets: a 60–90 second video (Play now → the Times Square Jam → a Halal Rush shift → an apartment party → a photo strip), GIFs, the Product Hunt gallery, the Show HN post, creator briefs, holding statements.
- Final go/no-go against the gates.

---

## Launch week

### L (Tuesday): Opening Night

| Time (ET) | What happens |
|---|---|
| 3:01 AM | Product Hunt goes live (12:01 AM PT). The maker comment tells the story: why you built it, what to try first ("be in Times Square at :00, :08, :16…"), what isn't done yet. Ask for feedback, not upvotes. |
| 6:00 AM | Press embargo lifts. |
| 8–9 AM | Founder thread on X with a 30-second clip. A note to preview players on Discord: "Bring one person tonight." |
| Morning | r/ClubPenguin post, only if the moderators agreed. Creators post across the day with their own `/join/` links. |
| All day | Jams run on schedule; founding hosts take turns in Times Square so no newcomer arrives to an empty plaza. Moderation rota on. Reply to every Product Hunt comment. |
| 7:30 PM | City tab and LED wall: "OPENING NIGHT JAM AT 8." |
| 8:00 PM | **Opening Night Dance Jam**, hosted by the founder (PROPOSED: the host's own avatar takes the DJ booth). The LED wall shows the real crowd. Everyone on the floor gets an "Opening Night" stamp: a souvenir of a real one-time event, and nothing is locked behind it. |
| 8:30 PM | Founders' photos: strips from the red steps, shared to Discord and socials. |
| 9:00 PM | **Party crawl:** 3–5 founding hosts open public parties (penthouse, loft, walk-up), listed in the City tab. |
| 11:00 PM | Wrap-up note to the community with whatever is true (the record crowd, parties thrown). A fix list for tomorrow. |

### L+1 to L+6

| Day | In the game | Outside the game |
|---|---|---|
| **L+1 Wed** | **Snowball Showdown** in Central Park: Uptown Acorns vs Downtown Slices. Prime Time Jam. | **Show HN** in the morning: the technical write-up. Follow up with press who asked for interviews. |
| **L+2 Thu** | **Flash Mob Thursday:** creators start flash mobs at set times, going for a takeover (6+ dancers). | Creators' night; creators post their strips. Pitch Time Out and Secret NYC for weekend lists. |
| **L+3 Fri** | **Friday Night Block Party:** scheduled public parties; the first Party of the Night. | "Come to the block party" posts from NYC creators, each with a join link and a calendar file. |
| **L+4 Sat** | **Campus Night** pilots (NYU, Columbia, CUNY hosts) or a Showtime! high-score night. | Student papers and club channels. |
| **L+5 Sun** | **The Sunday Paper:** a launch-week edition of the Club NYC Times with real numbers (record crowd, most-visited place, parties thrown). | Publish the edition on the web; keep the numbers for the week-2 data story. |
| **L+6 Mon** | **Neighborhood Wars, Week 1 results** at Prime Time; leaderboards reset. | A "what we fixed this week" post: real bugs, real fixes. |

---

## The four weeks after (L+7 to L+34)

**The weekly rhythm from week 2 on**
- **Monday:** a new Club NYC Times edition (in the game and on the web) and Neighborhood Wars results at Prime Time.
- **Wednesday:** a community or campus night.
- **Friday:** the Friday Night Block Party and Party of the Night.
- **Every night:** the Prime Time Jam at 8.
- **Every week:** one small shipped improvement, announced in the game and on Discord. The launch skill's rule: launch again and again.

| Week | Theme | In the game | Outside the game |
|---|---|---|---|
| **2** (L+7–13) | **Founders Week** | The founding-number countdown (true counts only). The Founders' Wall goes up in Grand Central if the referral ladder ships (#6). Moment cards (#10). | The first **data story** for Gothamist, Time Out and amNY: "What New York's first 1,000 virtual New Yorkers did," built only from real numbers. A second round with the best creators; a creator's second post usually beats their first. |
| **3** (L+14–20) | **Friendsgiving in the city** (Thanksgiving week if L is mid-November) | Themed house parties for friends in different cities. One seasonal change that reuses existing places. | The Verge and Polygon: friends in different cities meeting at the same Times Square. Students are home with laptops. |
| **4** (L+21–27) | **Holiday city** | Seasonal decor; skating at Rockefeller Center. If the Snacks Fifth Avenue art gets wired in, its holiday windows are a ready-made photo spot. | Time Out and Secret NYC: "the holiday city without the crowds." Finals-week "study break Jams" for the campuses. |
| **5** (L+28–34) | **One month in the city** | "Your Month in the City" recap cards (#15); the month's Neighborhood Wars champion. | A build-in-public post with honest numbers and lessons (Hacker News, Indie Hackers). Plan the next launch moment. |

Halloween content stays switched off, and the New Year countdown was already rejected, so neither appears here.

---

## Channel playbooks

### NYC press
Lead with the city, not the tech.

| Outlet | Angle | Lead asset | Ask and timing |
|---|---|---|---|
| **Gothamist** | "A free browser game turned the city's in-jokes into a place to hang out": the halal-cart lunch rush, Bagel Counters, Showtime! on the subway, StreetCheesy listings with no broker fee, Pizza Rat in the paper. | A Halal Rush or Showtime! GIF; the Times Square Jam. | Exclusive first look under embargo if they want it, otherwise launch morning. The data story in week 2. |
| **Time Out New York** | Things to do: a free night out in a cartoon Times Square; the 8 PM Prime Time Jam; Friday Night Block Party. Listicle-ready: "11 NYC in-jokes hidden in Club NYC." | The Jam; the Brooklyn Bridge or Liberty Island room. | Pitch Monday or Tuesday for the weekend round-ups. |
| **Secret NYC** | Short, visual, shareable: "This free online game lets you explore a cartoon New York with your friends." | Best three images and a 15-second clip. | Launch day. |
| **amNY** | Local and community: Neighborhood Wars (uptown vs downtown), CUNY campus nights, free to play. | Neighborhood Wars standings; the team scarves. | Launch week, then a campus follow-up. |
| **NY Post (Page Six-style)** | Light and gossipy: "The only Billionaires' Row penthouse you can afford," the society page, who made the Times Square jumbotron, the line to get in (only if it really happens). | The penthouse; a StreetCheesy listing. | Weeks 1–2, once there are real party and society-page stories to tell. |

**Pitch rules** (from the PR skill):
- Pitch the story, not the product.
- Keep it under 150 words, with a subject line that predicts the headline.
- No attachments; link the press page.
- Follow up on day 3 and day 7, and only with something new. Never write "just bumping this."

### Gaming and internet-culture press

| Outlet | Angle | What they'll ask |
|---|---|---|
| **Polygon** | Design and nostalgia: how do you keep an online world from feeling empty on day one? (Labeled locals who step aside, the 8-minute Jam clock, rooms that put you with your friends.) | The Club Penguin comparison; the AI art |
| **Kotaku** | Culture: the Club Penguin generation grew up and the hangout came back, now with rent jokes | AI art; moderation; kids |
| **The Verge** | "The internet lost its hangouts": feeds replaced places. Friends in different cities. A whole MMO in a browser tab. | Business model; safety |
| **Rock Paper Shotgun** | A free browser MMO of New York that's oddly charming | Generative AI. This readership is skeptical, so disclose up front. |
| **PC Gamer** | Free-to-play news: what you can do, and no pay-to-win | Monetization |
| **Engadget** | Tech and culture: one Node process handled 500 simulated players at about 3.2 ms per tick in a load test | Scale; data |

Before pitching, read each journalist's last five pieces and score the fit, weighting beat match highest. Pitch the top 20 personally.

### Nostalgia communities
- **r/ClubPenguin.** Read the rules, message the moderators before posting, and bring something for the community (a community night with a commemorative stamp) rather than an ad. Post as a person: "I grew up on Club Penguin and built a New York version. It's free, in the browser, 13+." Post once, then stay and answer every comment.
- **Club Penguin private-server communities.** Engage the people, not the servers. Private servers have been shut down over Disney's copyrights more than once. Don't partner with any server that uses Disney's assets, and don't trash them either. The honest pitch to this crowd: Club NYC is original, so it can't be taken down for using someone else's penguins. Offer Throwback Nights hosted by community members.
- **Discord.** Your own server is the owned channel: a Founding New Yorker role, #photo-strips, #parties, #bugs, and a weekly events post. In other servers, show up only where you're invited.

### TikTok and Instagram NYC creators
- **Who:** micro (10k–50k) and nano (1k–10k) NYC creators with adult audiences. Several small, well-matched creators usually beat one big name.
- **Formats that fit:**
  - "I finally afforded a Manhattan apartment (it's a cartoon)."
  - "I worked a lunch rush at the halal cart."
  - "Come to the 8 PM Dance Jam with me."
  - "Rating the NYC in-jokes in Club NYC."
  - "My friend in LA and I met at Times Square."
- **Brief, don't script.** Give them the why (one sentence), 2–3 true talking points, the call to action (their own `/join/` link, "save this for your laptop tonight"), and guardrails (nothing beyond the fact sheet).
- **Disclosure.** If a creator gets anything of value (money, or in-game items other players can't get), they must disclose it clearly (#ad or the platform's paid-partnership label). Put it in the brief and check that it happened.
- **Phones.** This traffic is mobile, so creator links must open the phone page with the calendar file and send-to-myself (#5).

### Colleges (NYU, Columbia, CUNY)
- One student host per campus runs a weekly Campus Night (a Jam or a party). Perks: a founding number, a host title, a shot at Party of the Night.
- Posters with QR codes where laptops are open (libraries, lounges), pointing to the host's join link.
- Student papers (NYU's Washington Square News, the Columbia Spectator, CUNY campus papers) once two nights have run: "students are throwing weekly parties in a cartoon Manhattan."
- Finals season: "study break Jams" at fixed times.

### Product Hunt and Hacker News
- **Product Hunt (L, 12:01 AM PT).**
  - Tagline: "A free multiplayer hangout set in a cartoon New York." Keep "Club Penguin" out of the listing title and tagline and tell the inspiration story in the maker comment instead.
  - Gallery images at 1270×760 and the 60–90 second video.
  - Answer every comment all day. Ask for feedback, never for upvotes.
- **Show HN (L+1).** Title: "Show HN: Club NYC – a multiplayer cartoon Manhattan in the browser." The post:
  - What it is, in two lines.
  - The architecture. Clients send intents, not positions. Room events are batched 15 times a second and encoded once per room. SQLite runs in WAL mode. Scores need a server run token, so leaderboards can't be faked.
  - The measured numbers and how they were measured (a laptop, simulated players).
  - An honest list of what isn't done.

  Hacker News rewards candor. Bring up the AI art yourself before someone else does.

### Owned channels
Discord, the weekly letter (#12), the Club NYC Times web edition (#13) and the game itself (the paper, the LED wall, the City tab). Everything rented, meaning press, Product Hunt and TikTok, should push people into one of these.

---

## Story angles

1. **"Club Penguin for grown-ups, set in NYC."** The fastest hook. Fits Polygon, Kotaku, Secret NYC and the Post. Always with the non-affiliation line. "Grown-ups" here means 13+ and the people who grew up with it, nothing racier.
2. **"The Club Penguin generation grew up."** They're roughly 22–35 now, many of them in New York or wishing they were. The founding story: why [FOUNDER NAME] built them a place to hang out again. Fits The Verge and Polygon.
3. **"The city's in-jokes as a game."** Halal Rush, Bagel Counters, Showtime! on the subway, StreetCheesy's no-broker-fee listings, a Bodega Rave party vibe, "Pizza Rat: A Legend Turns 11" in the paper, "partly pigeony" weather. Fits Gothamist, Time Out, amNY and the Post.
4. **"The internet lost its hangouts."** The enemy is a broken system, not a competitor: feeds replaced places, and Club NYC is a place. Fits The Verge and Kotaku.
5. **"Meet me at Times Square."** Friends in different cities meeting in the same cartoon New York. Strongest in Thanksgiving week. Fits Time Out and The Verge.
6. **"How to keep an online world from feeling empty."** Labeled locals who step aside, the 8-minute Jam clock, friend-aware rooms, one Node process. Fits Polygon, Engadget and Hacker News.
7. **The data story (week 2 on).** "What New York's first 1,000 virtual New Yorkers did": the most-visited place, the record Jam, the most popular job. Real numbers only.

---

## Sample pitches

**To an NYC culture reporter**
Subject: You can now work a lunch rush at a halal cart (a cartoon one)

> Hi [Name], I enjoyed your piece on [recent article].
>
> Club NYC opens [LAUNCH DATE]. It's a free game in your browser: you make a cartoon New Yorker and hang out with friends in an illustrated Manhattan. The jobs are Halal Rush, Bagel Counters, Slice Factory, Ferry Captain and Showtime!, a subway dance game. Apartments come from StreetCheesy. The in-game paper is still not over Pizza Rat. Every eight minutes, Times Square throws a Dance Jam.
>
> Happy to give you an early look before launch, or a walkthrough with me inside the game. Press kit and screenshots: [PRESS PAGE URL]
>
> [FOUNDER NAME], [CONTACT EMAIL]

**To a games reporter**
Subject: How do you stop a new online world from feeling empty?

> Hi [Name], [one line on their recent article].
>
> Club NYC is a free, Club Penguin–style hangout set in a cartoon New York (not affiliated with Disney). The hard part was day one, because an online world with few people feels dead. Our answers: computer-run "city locals" that are clearly labeled and step aside when real players arrive; a Dance Jam that fills Times Square every eight minutes on a city-wide clock; rooms that put you where your friends are; and invite links that drop a friend right next to you.
>
> It opens [LAUNCH DATE]. I'd love to show you how it works, inside the game. Press kit: [PRESS PAGE URL]
>
> [FOUNDER NAME], [CONTACT EMAIL]

---

## Risks and mitigations

| Risk | Why it's real for Club NYC | Mitigation | Watch |
|---|---|---|---|
| **Moderation load on a spike** | Room chat is free text. The server filter strips links, emails and phone numbers, masks swears and times out floods, but reports have no admin screen yet. Press brings trolls. | Ship the moderation dashboard (PLANNED) with mute, kick and ban by account and IP. Publish community rules. Put 3–5 trained volunteer moderators on a launch-week rota. Auto-hide a player's chat after several reports from distinct, established accounts, pending review. Keep a ready switch that limits the whole city to quick-chat phrases in an emergency. Tighten guest-account limits if they're abused (today: 6 new guests per minute per IP). | Reports per 1,000 chat lines; time from report to action; repeat offenders |
| **Server capacity** | One process and one SQLite database. The 500-player number is from a laptop with simulated players (about 3.2 ms of a 66 ms tick). Production hardware and real networks are untested. | Load test the Railway deployment. Put a CDN in front of `/art`. Use the velvet rope (#11) as the safety valve. Stagger traffic: Product Hunt overnight, press at 6 AM, creators across the day, Hacker News on L+1. Post status updates on Discord and X. | Tick time p95, memory, reconnects, line length |
| **Kids showing up** | Club Penguin was a kids' game, and nostalgia coverage plus TikTok will reach kids. Club NYC is 13+ with free-text chat. | A 13+ age gate (PLANNED) that doesn't hint at the "right" answer or allow instant retries. Never market it as "for kids." Choose creators with adult audiences. Add a "may be under 13" report reason; remove under-13 accounts and their data (COPPA). Ship the privacy page (PLANNED). If you expect EU or UK players, check their age rules for data (13–16 depending on the country). | Underage reports; parent emails |
| **Brand and parody** | Parody names (Starducks, NYKE, StreetCheesy, Belly) are jokes with no real logos, and that's the right approach. But a few **real marks** are used as in-game branding: "I ♥ NY" (owned and actively licensed by New York State) on the souvenir shop and a photo-booth theme, "MetroCard" (an MTA trademark) on the player ID, and subway route bullets on the map that resemble MTA's. The newspaper masthead's style evokes a famous paper, and the paper names real people. | Get a quick legal read before press, or rename to parodies; the founder's own rule is "parody names, never real trademarks." Keep real people's names and likenesses out of all marketing (New York's right-of-publicity law covers names used for advertising). Put "Not affiliated with Disney or Club Penguin. All brands in the game are parodies." on the press page and in the site footer. Never use "Club Penguin" in the product name, domain, ads or store keywords. Run a basic trademark search on "Club NYC" itself. | Any letter from a rights holder: reply within 24 hours, comply, rename (keep spare parody names ready) |
| **AI-art backlash** | The project README says the room art was generated with an image model using Club Penguin screenshots as style references. Games writers (Rock Paper Shotgun readers especially) and Club Penguin fans care a lot about this. | Decide the disclosure before pitching, then say it plainly, early, in your own words ([press-kit.md](press-kit.md#founder-qa)). Never call the art hand-drawn. Never deny it. | Sentiment on Product Hunt, Hacker News, Reddit |
| **Big-bang emptiness** | If press traffic lands on a quiet city, people decide it's dead. | Preview clusters first; Prime Time scheduling; founding hosts on shift; newcomers routed to the busiest copy of Times Square (the server already does this). | Zero rate, magic-moment rate |
| **The phone wall** | The game is desktop-only at launch, and social traffic is mobile. | The phone page with a calendar file, send-to-myself and, if ready, name reservation (#5). | Phone capture rate; phone → desktop within 72 hours |
| **Lost guest accounts** | A guest account lives on a 30-day cookie. Clear it and you lose your New Yorker and founding number, unless Google or X is linked. | Google/X keys live before L; prompt founding members to link. | Support messages about lost accounts |
| **Cheating** | Coins are client-side until the server wallet ships. | Ship the wallet (PLANNED) before press. Keep referral rewards cosmetic. The leaderboards are already server-validated. | Coin anomalies; rejected scores |
| **Photo privacy** | Strips print the names of everyone nearby. | Names only for the taker and their friends; a "keep me out of photos" setting. | Complaints |
| **News collisions** | A big news day buries a launch. | Avoid November 2–6. Check for major game releases and tech events that week. Keep two backup dates. | — |
| **Founder bandwidth** | Product Hunt, press, creators, moderation and hosting all land on L. | Assign roles (below), write a runbook, sleep the night before. | — |

**Crisis basics** (from the PR skill). In the first 60 minutes:
1. Confirm the facts.
2. Pick one spokesperson.
3. Post a short holding statement: "We know X is happening. Here's what we're doing. Next update at [time]."
4. Keep to that update time.

If a minor, personal data or the law is involved, get advice before saying more.

---

## Metrics to watch

Definitions are in [growth-playbook.md §D](growth-playbook.md#d-measuring-it). City locals never count toward any of them.

| Metric | What it is | Launch-week cadence | Watch for |
|---|---|---|---|
| **Peak concurrent** | The most real players online at once | Hourly | Headroom before the velvet rope |
| **Prime Time crowd** | Real players on the Jam floor | Nightly | Growth night over night |
| **Magic-moment rate** | New players with a real interaction in their first session | Daily | A drop means rooms are too thin |
| **Zero rate** | First sessions with 5 minutes alone | Daily | A rise means players are spread too thin |
| **Invites sent → accepted** | Invites created → opened → became players → landed next to the inviter | Daily | Which step leaks |
| **K-factor** | Invites per new player in their first 7 days × invite conversion | Weekly | Read it alongside cycle time |
| **Share rate** | Shares per daily player; share of daily players who shared anything | Daily | Strip vs card vs MetroCard |
| **D1 / D7 (then D30)** | Return on day 1 and day 7 by signup cohort | Daily / weekly | Invited vs alone; founding vs later |
| **Phone capture** | Phone visits → calendar, send or reserve → plays on a computer within 72 hours | Daily during creator pushes | |
| **Safety** | Reports per 1,000 chat lines; time to action | Hourly on L | Spikes after press hits |
| **Server health** | Tick p95, memory, reconnects, line length | Live on L | |
| **Press** | Placements; visits per placement; Product Hunt comments | Daily | Which angle converts |

Don't report total signups on their own, registered (instead of active) players, or impressions without visits.

---

## Roles on launch day

Even if it's the founder and four friends:
- **Host:** in the game for every Prime Time and big moment; DJ at Opening Night.
- **Community:** Product Hunt comments, Reddit, Discord and X replies within 30 minutes.
- **Press:** inbound requests within an hour, interviews, the press page.
- **Safety:** the moderation queue, bans, the quick-chat switch.
- **Ops:** server dashboards, the velvet rope, hotfixes, the status channel.
