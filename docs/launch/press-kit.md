# Club NYC Press Kit

Draft for [LAUNCH DATE]. Before anything goes out:

- Fill every [BRACKET].
- Lines marked **[CONFIRM SHIPPED]** describe features planned for launch. Delete them if the feature isn't live on the day.
- Don't add any number that wasn't measured. Never count the computer-run city locals as players.
- Settle the brand review and the AI-art disclosure first ([launch-campaign.md](launch-campaign.md#risks-and-mitigations)).

Companion docs: [growth-playbook.md](growth-playbook.md) · [launch-campaign.md](launch-campaign.md)

---

## Boilerplate

Club NYC is a free multiplayer game set in a pocket-sized, illustrated New York City, played in a desktop web browser. Players make a cartoon New Yorker and explore 24 places, from Times Square to Liberty Island. They work shifts at five NYC-themed jobs, decorate apartments, throw house parties where everyone hears the same song, and meet friends at a Dance Jam that lights up Times Square every eight minutes. Every brand in the city is a parody, from Starducks to StreetCheesy. Club NYC is free to play, for ages 13 and up, and made by [FOUNDER NAME] in [CITY]. Play at [URL].

*Club NYC is an independent game. It is not affiliated with, endorsed by or connected to Disney or Club Penguin. All brands that appear in the game are parodies.*

---

## Fact sheet

| | |
|---|---|
| **Name** | Club NYC |
| **What** | A free, Club Penguin–style multiplayer hangout set in a cartoon New York City |
| **Launch** | [LAUNCH DATE] |
| **Where** | [URL]. Desktop web browser, no download. Phones get a page that helps you open it on a computer **[CONFIRM SHIPPED]**. |
| **Price** | Free to play. Future plans: an optional cosmetic membership, seasonal passes and storefronts for local businesses. Never pay-to-win. |
| **Ages** | 13+ **[CONFIRM age gate SHIPPED]** |
| **Made by** | [FOUNDER NAME], [CITY]. [TEAM SIZE]. Started [START DATE]. |
| **Press contact** | [CONTACT EMAIL] · [PHONE] · Press kit and images: [PRESS PAGE URL] |

### In the game today
- **24 illustrated places:** Times Square, Central Park, the Met, Grand Central, the subway, SoHo, Chinatown & Little Italy, the High Line, Brooklyn Bridge, Liberty Island and more.
- **5 jobs:** Slice Factory, Halal Rush, Bagel Counters, Ferry Captain and Showtime!, a subway dance rhythm game. Each has weekly and all-time leaderboards, and the server checks every score.
- **100+ outfit pieces and 25+ furniture pieces.** Homes come from StreetCheesy, a parody listings app.
- **Real-time multiplayer:** live chat with a filter, friends, "who's in the city," apartment visits, guestbooks and likes.
- **House parties** with synced music.
- **A Dance Jam in Times Square every 8 minutes,** plus flash mobs and snowball fights.
- **4 neighborhood teams** competing in a weekly Neighborhood Wars.
- **51 stamps** (achievements).
- **The Club NYC Times,** an in-game newspaper that covers real New York moments.
- **A shareable MetroCard ID image.** [UPDATE IF RENAMED after brand review]
- **57 computer-run "city locals,"** clearly labeled, who keep quiet rooms alive and step aside as real players arrive.
- **Accounts:** play instantly as a guest, then sign in with Google or X to keep your New Yorker **[CONFIRM keys live]**.
- **Safety tools:** mute, block and report.
- **Parody brands only** (Starducks, NYKE, StreetCheesy, Belly…), and original synthesized music with parody titles like "Empire State of Mine."

### New at launch **[CONFIRM SHIPPED, line by line]**
- Invite links that drop a friend right next to you, with rewards for both of you.
- A first-day tour: Rosa, the super in your building, shows every new player around.
- A lobby before every job with this week's and all-time leaderboards.
- A camera button that makes photo-booth strips to share, with your invite link printed on them.
- Daily quests ("Today in the City", the same three for everyone), and a daily refill that grows with each day you drop by that week (no streak to lose).
- Community rules, privacy and terms pages; a 13+ age gate; a moderation dashboard.

### Under the hood
- The game runs in the browser (TypeScript). One Node server handles accounts, chat and rooms (WebSockets, SQLite).
- In a load test, one server process handled **1,000 simulated players** at about **5 ms per update** (each update has a 66 ms budget), and **3,000** at about 12 ms, with no errors. (Measured on a laptop; see `docs/launch/load-test-report.md`.)
- In testing, a browser in a room with **45 other players** ran at about **59 frames per second**.

---

## Headline options

1. **Club NYC Opens: The Club Penguin Generation Gets a New York of Its Own**
   The nostalgia lead. Best for gaming and internet-culture press. Keep the non-affiliation line in the first two paragraphs.
2. **A Free Browser Game Turns New York's In-Jokes Into a Place to Hang Out**
   The city lead. Best for Gothamist, Time Out, amNY and Secret NYC.
3. **Meet Me in Times Square: Club NYC Drops Your Friends Right Next to You in a Cartoon Manhattan**
   The social lead. Only use it if invite links ship **[CONFIRM SHIPPED]**.

---

## Press release (draft)

**FOR IMMEDIATE RELEASE** *(or: EMBARGOED UNTIL [TIME] ET, [LAUNCH DATE])*

### A Free Browser Game Turns New York's In-Jokes Into a Place to Hang Out
**Club NYC opens today: work a lunch rush at a halal cart, throw a party in a Billionaires' Row penthouse, and meet your friends in a cartoon Times Square.**

**NEW YORK, [LAUNCH DATE]** — Club NYC, a free multiplayer game set in a pocket-sized, illustrated New York City, opens to the public today at [URL]. Inspired by the online hangouts a generation grew up on, Club NYC lets players make a cartoon New Yorker, explore 24 places from Times Square to Liberty Island, and spend time with their friends in a city that's in on the joke.

Players can work shifts at five New York jobs: Slice Factory, Halal Rush, Bagel Counters, Ferry Captain and Showtime!, a subway dance rhythm game. Each job has weekly leaderboards, and the server checks every score. Players can dress up from more than 100 outfit pieces, find an apartment on StreetCheesy, the game's parody listings app, and furnish it with pieces like a taxi bed and a pizza rug. Then they can throw a house party where every guest hears the same song at the same moment. Every eight minutes, a Dance Jam lights up Times Square and the whole city is invited.

"[FOUNDER QUOTE: two or three sentences in your own words. A good shape: one specific memory of hanging out online as a kid, why New York, and what you hope people do in Club NYC tonight.]" said [FOUNDER NAME], who created Club NYC.

Club NYC is built for hanging out with people you know. Players can send a friend a link that drops them right next to them in the city **[CONFIRM SHIPPED]**. They can see who's online and where, visit each other's apartments, sign guestbooks, and join one of four neighborhood teams that compete every week in Neighborhood Wars. To keep the city lively at quiet hours, 57 computer-run "city locals" walk the streets. They're clearly labeled, and they step aside as real players arrive.

New players get a short first-day tour from Rosa, the super in their building. A photo booth lets players snap a four-pose strip with whoever is standing nearby and share it **[CONFIRM SHIPPED]**.

Every brand in Club NYC is a parody, including Starducks, NYKE and StreetCheesy. The in-game newspaper, The Club NYC Times, covers real New York moments in its own voice, including "Pizza Rat: A Legend Turns 11." The soundtrack is original synthesized music with titles like "Empire State of Mine."

Club NYC is for players 13 and up **[CONFIRM SHIPPED]**. Chat is filtered on the server, which removes links, email addresses and phone numbers and masks swearing, and players can mute, block or report anyone. [CONFIRM: how reports are reviewed and by whom.]

Club NYC is free to play in a desktop web browser at [URL], with no download. Players can start as a guest in one click and keep their progress by signing in with Google or X **[CONFIRM keys live]**. Future plans include an optional cosmetic membership, seasonal passes and storefronts for local businesses. Club NYC will never sell gameplay advantages.

**About Club NYC**
[Boilerplate paragraph above.]

**Media contact**
[FOUNDER NAME] · [CONTACT EMAIL] · [PHONE]
Press kit and images: [PRESS PAGE URL]

*Club NYC is an independent game and is not affiliated with, endorsed by or connected to Disney or Club Penguin. All brands that appear in Club NYC are parodies.*

---

## Screenshots

All files live in `docs/deck/`. Two things to settle before sending:

1. **Most in-game shots are out of date.** They still show the small "Halloween Party" badge at the top of the screen, and Halloween is switched off. Reshoot them with `tools/deck_shots.py`.
2. **Times Square shots show the "I ♥ NY Souvenirs" storefront.** Settle the brand review first ([launch-campaign.md](launch-campaign.md#risks-and-mitigations)).

### Ready to use

| File | Shows | Suggested caption |
|---|---|---|
| `docs/deck/img/logo.png` | The Club NYC logo | — |
| `docs/deck/shots/jam.png` (also `img/jam.jpg`) | Players dancing at the Dance Jam in Times Square (I ♥ NY review first) | "Every eight minutes, the Dance Jam fills Times Square." |
| `docs/deck/img/ts2.jpg` | Times Square, art only (I ♥ NY review first) | "Times Square, Club NYC style." |
| `docs/deck/shots/signin.png` (also `img/signin.jpg`) | The front door: Play now, or continue with Google or X | "One click to play. No download, no form." *(Reshoot during a busy hour so it shows a live player count.)* |
| `docs/deck/img/f01.jpg`, `f02.jpg`, `f05.jpg` | Making your New Yorker: welcome, your look, your neighborhood team | "Make a New Yorker and pick your neighborhood." |
| `docs/deck/img/f62.jpg`, `f63.jpg` | Slice Factory | "Slice Factory: match the ticket before the pie rides into the oven." |
| `docs/deck/img/f65.jpg` | Halal Rush | "Halal Rush: the lunch line waits for no one." |
| `docs/deck/img/f67.jpg` | Ferry Captain | "Ferry Captain: Battery Park to Liberty Island." |
| `docs/deck/img/f71.jpg` | Showtime! | "Showtime! is a subway dance rhythm game." |
| `docs/deck/img/f69.jpg` | Bagel Counters | "Bagel Counters." *(Check it matches the current game art.)* |
| `docs/deck/img/liberty2.jpg` | Liberty Island, art only | "Liberty Island." |
| `docs/deck/img/loft.jpg`, `penthouse.jpg` | StreetCheesy homes: a cast-iron loft and a Billionaires' Row penthouse | "Find a home on StreetCheesy. No broker fee." |
| `docs/deck/img/pizzarat.jpg` | The Club NYC Times' Pizza Rat illustration | "The Club NYC Times has not forgotten Pizza Rat." |

### Reshoot before sending

| File(s) | Shows | Why reshoot |
|---|---|---|
| `docs/deck/img/f48.jpg` | **Times Square Takeover** (a flash mob) | Halloween badge. This is a hero moment, so reshoot it first. |
| `docs/deck/img/f06.jpg` | The MetroCard ID reveal | Shows a random card number. Reshoot with a real member number ("No. 0001"). |
| `docs/deck/shots/party.png`, `party-panel.png` (also `img/party.jpg`, `partypanel.jpg`) | A house party with synced music; the "Throw a party" panel | Halloween badge, and the panel still lists the hidden "Spooky Season" vibe |
| `docs/deck/shots/mp-chat.png`, `mp-chat-log.png` (also `img/mpchat.jpg`, `mpchatlog.jpg`) | Real players chatting in Times Square ("Who's coming to the Dance Jam?") | Halloween badge |
| `docs/deck/shots/mp-city.png` (also `img/mpcity.jpg`) | The City tab: who's online and where | Halloween badge |
| `docs/deck/img/f49.jpg` | A city-pulse notice ("BagelQueen is hanging out at Rockefeller Center · Go") | Halloween badge |
| `docs/deck/shots/streetcheesy.png` (also `img/streetcheesy.jpg`) | The StreetCheesy listings app | Halloween badge behind the panel |
| `docs/deck/img/f42.jpg`, `f44.jpg` | Your player card and wardrobe; another New Yorker's card (Wave, Add Friend, Visit their place) | Halloween badge |
| `docs/deck/img/f45.jpg`, `f46.jpg`, `f47.jpg` | Friends with live locations; a weekly leaderboard; Neighborhood Wars standings | Halloween badge |
| `docs/deck/img/f50.jpg`–`f54.jpg` | Your apartment, decorating, the furniture catalog, the guestbook, visiting a friend | Halloween badge |
| `docs/deck/img/f07.jpg`, `f08.jpg`, `f12.jpg`–`f32.jpg` | Rooms with players: Times Square, Broadway, Rockefeller Center, Central Park, the Met, the Empire State observatory, Grand Central, the subway, the High Line, Chelsea Market, SoHo, Chinatown & Little Italy, 99¢ Slice | Halloween badge |
| `docs/deck/img/f59.jpg` | The stamp book | Halloween badge; it says 38 stamps (there are 51 now) |
| `docs/deck/img/f09.jpg`, `f11.jpg` | The map; a subway car | The map shows the Halloween Parade; the subway car shows route bullets (brand review) |
| `docs/deck/shots/news-front.png`, `news-moments.png` (also `img/newsfront.jpg`, `newsmoments.jpg`) | The Club NYC Times | The front page is about a real NBA team and the Moments page names real people. Reshoot a launch edition, or crop to the Pizza Rat story. |
| `docs/deck/shots/photobooth.png` (also `img/photobooth.jpg`) | A photo-booth strip | Use only once the camera button ships **[CONFIRM SHIPPED]**, reshot with the join link and founding number printed on it |

### Don't use

| File(s) | Why |
|---|---|
| `docs/deck/img/ts3.jpg` | A rejected Times Square design (the Dance Jam stage version). It isn't in the game. |
| `docs/deck/img/coffee2.jpg` (Starducks), `nyke.jpg` (NYKE), `snacks.jpg` (Snacks Fifth Avenue), `bodega.jpg` and `gamebodega.jpg` (Papi's Deli), `bagel2.jpg`, `brooklyn3.jpg` | Art for places or versions that aren't wired into the game yet. Use them only after they ship. |
| `docs/deck/img/mem-survivor.jpg`, `mem-today.jpg`, `mem-towers.jpg`, `mem-tribute.jpg`, `wtc.jpg` | A memorial exhibit that's still in progress, and a sensitive subject. Keep it out of launch marketing. |
| `docs/deck/img/f36.jpg`, `f61.jpg` | The Halloween Parade, which is switched off |
| `docs/deck/img/engaged.jpg`, `cityhall.jpg`, `knicks.jpg` | Tied to real people or a real team. Fine inside the newspaper; keep them out of marketing. |

### Still to capture (these don't exist yet)
- Rosa's first-day tour (the welcome card and a spotlight step).
- A job lobby with a full leaderboard.
- A photo strip of a real group, with the join link printed on it.
- The invite landing page ("Maya is at the Dance Jam…").
- A real Prime Time Jam crowd, with the real count on the LED wall.
- A packed public party in the penthouse.
- A jumbotron shout-out, if it's built.
- A 60–90 second video: Play now → the Times Square Jam → a Halal Rush shift → an apartment party → a photo strip.

---

## Founder Q&A

Likely questions, with honest answers. Fill in the brackets in your own words, and don't promise anything you haven't committed to.

**What is Club NYC, in one sentence?**
A free online hangout set in a cartoon New York City: you make a New Yorker, meet your friends in Times Square, work silly city jobs, and throw parties in your apartment, all in your browser.

**Is this affiliated with Club Penguin or Disney?**
No. Club NYC is an independent game. Club Penguin is the obvious inspiration: the idea of a cozy online place where you hang out, play mini-games and decorate your igloo. Club NYC's places, characters, music, code and art are its own **[CONFIRM: no Club Penguin assets of any kind are in the game]**. There are no penguins.

**Who is it for?**
The people who grew up on Club Penguin and are now roughly 22 to 35, New Yorkers and anyone who loves the city, and friends in different cities who want somewhere to meet. It's 13+.

**Is it safe for kids?**
It isn't made for young kids, and it's 13+ **[CONFIRM age gate SHIPPED]**. Chat is free text, filtered on the server: links, emails and phone numbers are removed and swears are masked. Anyone can mute, block or report another player. [CONFIRM: who reviews reports, and how fast.] If someone appears to be under 13, we remove the account.

**Is the art AI-generated?**
*Decide this answer before you pitch, then give it plainly and early. Never call the art hand-drawn, and never deny it.* The facts, from the project's own README: the room backgrounds and other art were generated with an AI image model (Higgsfield, GPT Image), using Club Penguin screenshots as style references for the overall look. Every clickable object was then traced (with SAM 2) so its hover outline follows the real shape. [FOUNDER: why you chose this, in your own words, and whether you plan to work with artists as the game grows.]

**Did you use AI to build the game itself?**
[FOUNDER: answer plainly and specifically. If AI coding tools did a lot of the work, say so.]

**Are the people in the game real?**
Most are real players. There are also 57 computer-run "city locals" who live in the city so rooms don't feel empty at 3 AM. Each one is clearly labeled as a local, they step aside as real players arrive, and we never count them as players.

**How many players do you have?**
[As of DATE: NUMBER New Yorkers created; peak NUMBER real players online at once.] If the numbers are small, say it's early and talk about what you're watching (people bringing friends, people coming back). Never count locals, and never round up.

**What happens if a lot of people show up at once?**
In a load test, one server process handled 500 simulated players at about 3.2 milliseconds per update (each update has a 66-millisecond budget). In testing, a browser in a room with 45 other players ran at about 59 frames per second. Those are test numbers [CONFIRM: also tested on the production server]. Each place holds 60 people; when it fills, a second copy opens and puts you with your friends. [IF BUILT: when the whole city is full, there's a line at the door, and people arriving with a friend get in first.]

**How do you make money?**
Right now we don't; it's free. Later: an optional membership for cosmetic items, seasonal passes, and maybe storefronts for real local businesses. We'll never sell anything that helps you win.

**Will real brands show up in the game?**
Today every brand is a parody. Storefronts for local businesses are an idea for later, and if a real business is ever in the city, it'll be clearly labeled.

**Aren't you worried about the brands you're parodying?**
They're affectionate jokes about city life, with no real logos and no lookalike designs. [FOUNDER: mention the legal review if you've done it.] If a company asks us to change something, we will.

**How do you handle harassment?**
Chat is filtered on the server, floods get a timeout, and anyone can mute, block or report. Reports include the recent chat. [CONFIRM SHIPPED: reports are reviewed in a moderation dashboard; NUMBER moderators are on during launch week.] The rules are at [RULES URL].

**What do you do with players' data?**
A guest account is a session cookie; the server stores only a hashed version of the token. Signing in with Google or X links that identity to your New Yorker [CONFIRM: which fields you store]. Reports store recent chat so a person can review it. Details: [PRIVACY URL].

**What's the Dance Jam?**
Every eight minutes, the stage in Times Square comes alive for a three-minute show. Every player sees the same show at the same moment, and dancing on the floor earns tips. It's the easiest way to find a crowd.

**What's The Club NYC Times?**
The in-game paper. It covers real New York moments in its own voice ("Partly pigeony," "Pizza Rat: A Legend Turns 11"), sticking to the stories New Yorkers still bring up at brunch. [CONFIRM: who writes it.]

**Why New York? Do I have to live there?**
[FOUNDER STORY.] You don't have to live here. It's for anyone who loves the city, and for friends in different places who want somewhere to meet.

**Why desktop only?**
The places are wide, detailed scenes full of small things to click, built for a mouse and a big screen. Phones get a page that helps you open it on a computer, or remember to later **[CONFIRM SHIPPED]**. [FOUNDER: mobile plans, only if committed.]

**Who made it, and how long did it take?**
[FOUNDER NAME], [TEAM], started [START DATE]. [FOUNDER: one honest sentence about how it was built.]

**What's next?**
[FOUNDER: only what you're committed to. Don't promise new boroughs or a phone app unless they're scheduled.]

---

## Legal lines for the press page and footer

- Club NYC is an independent game. It is not affiliated with, endorsed by or connected to Disney or Club Penguin.
- All brands that appear in Club NYC are parodies. All trademarks belong to their owners.
- Real New York places appear as places to visit. No endorsement by their owners is implied.
