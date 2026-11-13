# Club NYC agent playtest: what 24 strangers did with it

11 November 2026. Agent players, each role-playing a specific person, opened Club NYC cold in a private copy of the city, played as long as that person would, said why they left, and wrote an exit interview. Three designer agents then went through every clickable thing in the game and proposed how to turn static moments into something you do.

## The short version

- **The first three minutes work.** Times Square's art (23 of 24 named it), "Please swipe again at this turnstile" (20) and the MetroCard photo booth (20) are the hook. Marcus, a former Astoria resident: "That was the moment I thought the people who made this have lived there."
- **Then the city goes quiet.** Sessions lasted a median of about 40 actions (roughly 7 minutes; range 18 to 78). 16 of 24 said the people around them don't respond, 10 said clicks return a fact card or one line and some coins, and 13 said nothing pulled them onward. Tyler, a hardcore gamer, left at action 25: "Click-to-walk, no WASD, every object is a text popup. Nothing to get good at."
- **Doing things keeps people.** The 7 who started a mini-game stayed a median of 64 actions, against 39 for everyone else. Every place that gave players something to do (Grand Central, the newspaper, the apartment, Carb-Jitsu) delighted nearly everyone who reached it. The problem is reach: 16 of 30 rooms were never visited.
- **New Yorkers can't find their New York.** 13 wanted a place from their own life and 10 noticed a missing borough. Natives scored lowest (NYC feel 6.2, recommend 4.6); people dreaming of New York from abroad scored highest (7.8 and 7).
- **Coming back depends on people.** 22 of 24 said "maybe" to tomorrow; 7 tied it to someone they know being on. The one real conversation ("anyone from queens?") became the round's only friendship.
- **Scores:** fun 6.7, NYC feel 7.1, ease 6.9, would recommend 6.0 (means, out of 10).

## How it was run

1. **Round 1 (primed, kept as side evidence).** Five deeply researched personas (an OG Bronx New Yorker, a São Paulo tourist, an NYC-averse Hoosier, a licensed guide, a grown-up Club Penguin kid) played with a mission list and meetup schedule. Their chat read as performed and they couldn't leave, so the method was rebuilt. Files: `round1-primed/`.
2. **Round 2 (blind, the evidence).** 24 people across eight groups (natives, transplants and students, international dreamers, other Americans, NYC experts, gamers, parents and teachers, older users), each given only a short card: their life, what they know about New York, their screens and patience, and how the link reached them. No game knowledge, no missions, no meetups. They saw only what a person sees (no list of clickable things, unnamed icons until hovered, no console), could `leave` with a reason at any moment, and shared the city with whoever was online. Files: `round2/panel.md`, `round2/BRIEF.md`, `round2/journals/`, `round2/reports/`, and the coded analysis in `round2/analysis.md` and `analysis.json`.
3. **Design audit.** Three designer agents covered Midtown and travel, parks and downtown, and neighborhoods, home and the systems that run everywhere: 119 ideas in `round2/design/` (merged in `backlog.json`), ranked against the round 2 evidence in `round2/ranked.json`.

The harness is reusable: `tools/sim/` (README there). A frozen private stack, one headless browser per player, a controller that describes the screen and takes clicks, and a step mode that freezes real-time jobs between moves.

## Where people left

| How it ended | People | Who |
|---|---|---|
| Got what they came for | 9 | gabi, tunde, angie, sam, nora, chloe, billie, ron, ellen |
| Bored | 8 | millie, marcus, tyler, maya, darnell, lukas, wei, kayla |
| Blocked or confused | 3 | jiwoo (Carb-Jitsu tally), priya (Showtime, a test artifact), aiko (too much English) |
| Safety check done | 3 | linda, frank, kevin |
| Time's up | 1 | diego (dinner, after a Carb-Jitsu match he loved) |

The most common moments of leaving: nothing pulled them onward (13), right after reaching what they came for (9), during or right after their first mini-game (7), seeing their own part of the city missing (7), and after a chat line nobody answered (6).

## What felt static

Grouped by kind of failure (distinct people):

- **People don't respond (16).** Locals loop one line, other players stand still, chat goes unanswered, and a city local takes the Carb-Jitsu seat.
- **The tutorial layer reads as chores (12).** Rosa's card interrupts the first moves; the New in Town checklist feels like homework.
- **A click returns a fact card, or one line and some coins (10).** The Big Board, the Exchange door, Joe's Shanghai, Ten Ren, the soda fridge, the pretzel cart, ordering a slice.
- **Getting around is a teleport or a cutscene (9).** The map is "just a teleport menu" (sam); the subway ride is "a title card plus a station name" (linda).
- **Clicked and nothing visible happened (8).** The taxi, the bridge's right arrow, the Met doors, the Dance Jam button, "Their Style" items.

What they hoped for instead: a person who answers (16), to do or see the real thing (12: ride the cab, eat the slice, trade the stocks, walk into the Met, pick a train home), a game or goal instead of a chore (5), the story behind the place (3), less text and more picture (2).

## Static to alive: what to build

### Fix first (small, high evidence)

1. **Make the people answer.** Locals reply in context, real players wear a badge, and chat shows who heard you. (16 found people canned; 6 left after an unanswered line.)
2. **Say where things are.** Map names without hovering, labelled toolbar icons, "things to do near you" in Rosa's tour. (13 hit unlabelled icons; 7 asked for things that already exist.)
3. **Shorten the first walk.** A bigger Skip Intro, skip on replay, a wider swipe window, an OMNY tap beside the swipe. (14 found the swipe finicky; 10 said the intro ran long; 5 caught MetroCard vs OMNY.) In flight in `turnstile.ts`.
4. **Confirm what already works.** "You joined" for the Dance Jam, a toast for level-up coins, Take a Walk counting any walk, a running Carb-Jitsu tally.
5. **Wire the moments already built.** Rowboat, squirrel, love locks, life ring, opening bell and Washington's pose have no object that opens them, and their 18 stamps aren't registered. Give the Met doors and the dead arrows something to do.
6. **Close the safety gaps parents named.** Filter real-name and school questions, move "Use a Photo" after the other options and say where the photo goes, and plan a parent or class chat mode.
7. **Keep the memorial quiet.** No stamp chime or "+25 XP" at the 9/11 pools, and move the two jokes away.
8. **Fix the facts the experts caught.** Times Sq-42 St lines, the intro ride's line and car strip, the Bull's location, the Whispering Gallery's level, the 7 on the map, Rockefeller Center's lines, the ferry "is free" line, "$.99" slices, the opal clock as "reputedly".

### The ranked backlog (top 25)

| # | Idea | Where | Why, from the playtest | Effort |
|---|---|---|---|---|
| 1 | Locals with small favors and reactions | Every room | 16 found the people static | M |
| 2 | Wait for the train (countdown, headlights, gust, stand clear, shared clock) | Subway | 5 called the ride a title card (in flight: `subwayLife.ts`) | M to L |
| 3 | The city reacts to your feet (pigeons, gulls, leaves) | Outdoor rooms | Pigeons were the 3rd most-named true detail | S |
| 4 | Order, wait, eat: one verb per food (fold, squiggle, stab, sip) | Every counter | Carts were the 2nd most-named true detail, yet "no slice in my hand" | S to M |
| 5 | Cards become verbs, facts collect in City Notes | All 77 cards | 10 flagged fact cards (in flight: landmark moments) | M |
| 6 | Meet me at the clock | Grand Central | 7 of 7 visitors delighted, the clock is a card | S |
| 7 | Whispering Gallery for two | Grand Central | nora wanted the real trick (planned) | M |
| 8 | Catch the 5:52 | Grand Central | millie wanted to pick a train home | M |
| 9 | Bang on the pipe; Rosa knocks | Apartment | 4 of 4 visitors delighted | S |
| 10 | Bike lane! | Brooklyn Bridge | 5 visited, it felt static | S |
| 11 | Walk into Brooklyn | Brooklyn Bridge | The dead arrow; 4 asked for Brooklyn | M |
| 12 | Tower viewers you play | Four viewers | "just a picture" (planned) | S |
| 13 | The Met opens its doors | The Met | "the big doors do nothing" | S to M |
| 14 | A Big Board you can play | Wall Street | "prices I cannot trade" | M |
| 15 | Carb-Jitsu, finished (tally, real-player matching, rematch) | Joe's Pizza | 4 of 4 loved it; found at action 60 | S to M |
| 16 | Sal's dog | Times Square | Everyone starts beside Sal | M |
| 17 | The living statue | Times Square, Battery | Times Square felt "empty and clean" | M |
| 18 | Shake the snow globe | I ♥ NY | Shops felt like menus | S |
| 19 | The hot sauce dare | Adel's cart | Halal Rush was a highlight | S |
| 20 | The ferry crossing (and the free orange boat) | Battery to Liberty | A 3-second card and a teleport today | M |
| 21 | Photos worth sending | Battery, Liberty, booths | 5 wanted share tools | M |
| 22 | Decorating that feels good | Apartment | Tray, spawn and catalog friction | M |
| 23 | Your Block: Papi's bodega and the stoop | New, art painted | 13 wanted their own New York | M to L |
| 24 | Hail a cab | Times Square, the Met | gabi "hoped to ride it" | L |
| 25 | A living map | Map | "just a teleport menu" | M |

The other 94 ideas, with step-by-step versions, are in `round2/design/*.md`.

### Big bets

- **Beyond Manhattan:** Queens on the 7 first, then Harlem and a Brooklyn block; until then, say so honestly.
- **A game in the first minute,** plus arrow-key walking for people who reach for it.
- **Parent and classroom mode:** friends-only or preset chat, a private class room, a For Parents page.
- **Easier to read:** simpler English, translations, a text-size setting.

## The six lenses

- **Cultural.** The details read as insider New York (the swipe, Rosa and the boiler, the radiator's heat season, carts, pigeons, the pizza rat, "folded, never forked"), but it's the visitor's Manhattan: "A resident would not spend an afternoon in Times Square" (tunde). The MetroCard is now nostalgia: "We tap OMNY" (millie).
- **Philosophical.** A clean, cozy city wasn't read as a lie. angie, who expected to dislike it, called it "nicer than I expected", and the quiet 9/11 Memorial earned her trust. What players missed was a reason to be there: "A one-sentence reason to be here ('what do I do in this game?')" (priya).
- **Economic.** Free and nothing to buy reassured every parent. Rewards for walking felt unearned to 4 people while the nicest furniture felt out of reach to chloe, so the economy is generous early and tight later. The rent and penthouse jokes "sting a little as a renter" (billie).
- **Social.** The biggest gap. The city doesn't answer, players and locals look alike, and in a quiet city a chat line goes nowhere. When a stranger did answer, it worked: "As a lonely person, a stranger answering and then wanting to be friends hit hard" (billie).
- **Geopolitical.** A Manhattan-only map leaves out where most New Yorkers live and the immigrant city in particular (Flushing, Jackson Heights, Harlem, the Bronx). International players saw the New York they dream of and scored it highest; gabi reached the Statue of Liberty in seven minutes and wanted to show her trip group.
- **Technical.** No blockers and no client errors across 24 sessions. The defects are feedback and discoverability: unlabelled icons, hover-only map names, a narrow swipe window, working features that confirm nothing, clicking yourself instead of the person beside you. 40 defects are listed in `round2/analysis.md`.

## What this can't tell you

These are agents, not people: each played a card, so read the direction, not the size. One session each means nothing about retention. Speed, sound and slow hands were simulated (Showtime couldn't score in the test browser). The city held about six players at a time, so emptiness was partly the test, though it is what a quiet evening after launch would look like. A short round with five to ten real people, especially natives, a non-native speaker and a parent, would calibrate everything here.
