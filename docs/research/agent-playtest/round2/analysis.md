# Round 2 playtest analysis: 24 cold opens

Run `20261111-0916` · 24 agent players who had never heard of Club NYC · analysed 11 November 2026

This turns the 24 exit interviews, 24 think-aloud journals and the sim's `summary.json` into counts. Every number is a count of people taken from those files, and every quote is verbatim. The same data, machine-readable, is in `analysis.json`.

## How this was counted

- **Unit:** people, not mentions. Someone who praises the turnstile three times counts once.
- **Sources:** each person's exit interview and journal. "Fun" counts the interview's Fun section plus journal lines tagged [FUN] or [DELIGHT]; "static" counts the Static section plus [MEH] lines; "wanted" counts the Wanted and One change sections plus [WANT] lines; New York counts the New York section plus [NYC-TRUE] and [NYC-FALSE] lines.
- **Numbers from the sim:** active actions are `summary.json` `active_actions` (every command except look, text and leave). The journals' own "after N actions" lines differ by up to 3, and some interviews give rough counts; the summary wins. Chat, friendships, job runs, matches and room visits also come from `summary.json`.
- **Exit type:** the reason the person called decisive in their Leaving section. Other reasons they gave are in `analysis.json` (`exit_also`).
- **Segments:** the table gives one primary lens. frank is filed as a parent (his visit was a safety check) and ron as an older user. The readouts in section 7 use every lens a person sits in.
- **Test artifacts, never counted as game bugs:** Showtime not scoring (the test browser's audio clock), the "unknown agent" cutoffs for ron, diego and ellen, the "[CONTACT EMAIL]" placeholder, and the localhost link in billie's share text. The low population is reported as a real risk, with its cause (section 2).
- **Round 1, primed** (five over-briefed agents following a script) appears only in boxes labelled that way, for things the blind round did not reach, and is never in a count.
- **Code:** the four behaviours already verified are marked "verified in code". I also checked which rooms, exits and map spots exist in `app/src/data/rooms.ts`, `app/src/features/map.ts` and `app/src/data/geo/map.json`; those facts are marked "checked in code".

## Ten findings

1. **The MetroCard intro is the hook and the first hurdle.** 20 of 24 named "Please swipe again at this turnstile" as fun and 20 the photo booth, and 6 of the messages people would send mention it. But 14 found the swipe finicky (9 failed twice or more) and 10 said the intro ran long before they could walk.
2. **The city doesn't answer.** 16 of 24 flagged the people in rooms as canned or unreadable as human. All 6 chat lines typed into a room with no other real player went unanswered; billie's one question asked in company was answered within seconds and became the round's only friendship.
3. **Most objects are read-and-dismiss.** 10 people flagged clicks that return a fact card or one line plus coins, and 12 hoped to do or see the actual thing instead: ride the taxi, eat the slice, trade on the Big Board, go into the Met, see the trains.
4. **Nothing pulls players onward.** 13 said so in their own words at exit. 17 of 24 never started a mini-game; the 7 who did ran longer (median 64 active actions against 39 for the other players) and all 7 left during it or one step after.
5. **Much of what people wanted is already built but wasn't found.** Central Park (maya, gabi), SoHo with Supreme and Nike (kayla, darnell), Adel's halal cart (marcus) and a short quiz (angie, millie) all exist. 16 of 30 rooms went unvisited, including 6 of the 15 places on the island map, and 13 people reported toolbar icons with no labels.
6. **New Yorkers can't find their New York.** 13 wanted a place or route from their own life; 10 noted a missing outer borough (Queens 6, Brooklyn 4, Bronx 2, Staten Island 2). Natives gave the lowest NYC feel (6.2) and recommend (4.6); international dreamers the highest (7.8 and 7).
7. **Accuracy wins the experts, and the fix list is short.** nora and sam both rated NYC feel 8 and Grand Central delighted all 7 visitors. Most-caught errors: MetroCard instead of OMNY (5), Times Sq-42 St lines (3), the 1 train from Times Sq to Times Sq with a 13-line strip (3), the Bull at the NYSE (2), the Whispering Gallery's level (2), the 7 missing from the map (2).
8. **Safety has real protections and three gaps parents won't accept.** Report, block and mute, phone numbers turned into "[removed]" and "nothing to buy" all landed. But all three checkers flagged the self-declared 13+ box and the selfie-first "Use a Photo" (used by 0 of 24), "whats your real name and what school do you go to" passed the filter with billie and diego (15) in the room, and kevin never reached Report. Verdicts: not alone yet (frank), not for class (linda), cautiously yes (kevin).
9. **Working features look broken for want of feedback.** The Dance Jam works but confirms nothing (6), Rosa's welcome card interrupts the first moves (7), Take a Walk doesn't tick on object clicks (4), level-up coins land without a toast (3), and Carb-Jitsu shows no running tally (jiwoo quit on it).
10. **Coming back depends on bringing people.** 22 of 24 said "maybe", 1 yes (diego), 1 no (tyler); 7 tied a return to someone they know being on. The one share that worked as designed was billie's Carb-Jitsu lobby link.

## 1. Panel at a glance

| id | Name, age | Segment | How the link reached them | Active actions | Exit type | Exit reason, in their words | Scores: fun / NYC / ease / rec. | Come back tomorrow | Would share with |
|---|---|---|---|---|---|---|---|---|---|
| millie | Millie Arroyo, 61 | Native | Daughter's text | 48 | bored | "nobody answered me and there was nothing to actually do. Bronx not on the map." | 6 / 6 / 6 / 5 | maybe (leaning no) | Her daughter, only if it had the Bronx |
| jiwoo | Ji-woo Park, 21 | Transplant/student | Instagram reel | 60 | blocked or confused | "the card game dragged on and I couldn't tell the score … go write my essay" | 7 / 7 / 6 / 6 | maybe (if someone she knows is on) | Her roommate Hana |
| gabi | Gabriela "Gabi" Moreira, 26 | International dreamer | Facebook group of Brazilians planning NYC trips | 44 | got what they came for | "reached the Statue of Liberty and got my crown and stamp, that was my dream" | 8 / 8 / 7 / 7 | maybe (for Central Park in snow, on a phone) | Her Facebook trip group (and her mom) |
| marcus | Marcus Lee, 38 | Domestic American | Old Astoria friend in a group chat | 65 | bored | "Manhattan-only: Queens and Brooklyn are just grey labels … that's where I lived" | 7 / 6 / 7 / 6 | maybe (not daily; if his friend is online) | The Astoria group chat |
| tyler | Tyler Brooks, 24 | Gamer | r/WebGames post | 25 | bored | "Click-to-walk, no WASD, every object is a text popup. Nothing to get good at." | 4 / 6 / 6 / 3 | no (only for real competitive mini-games) | Not his gamer friends; maybe his sister |
| maya | Maya Goldstein, 16 | Native | Classmate in the group chat | 30 | bored | "no Central Park/UWS, nobody to talk to, and not sure what to actually do" | 6 / 6 / 7 / 6 | maybe (if her friends were in it) | The class group chat, the classmate who posted it, a Roblox friend |
| darnell | Darnell Price, 17 | Native | TikTok clip | 39 | bored | "nobody real talked back, no brooklyn, took forever to start … nothing to actually play yet" | 5 / 6 / 5 / 3 | maybe (leaning no) | Not as is; if anyone, his cousin Tay |
| tunde | Tunde Adeyemi, 29 | Transplant/student | Classmate in the program WhatsApp group | 33 | got what they came for | "Seen enough: … a tourist's Manhattan with canned bots, no Harlem" | 6 / 6 / 7 / 5 | maybe (probably not tomorrow) | The program WhatsApp group and classmates, not friends in Lagos |
| lukas | Lukas Becker, 34 | International dreamer | Urbanism newsletter | 39 | bored | "I hadn't found a system with depth; the Big Board is fake" | 6 / 7 / 8 / 5 | maybe (if an economy system appears) | A colleague who plays Cities: Skylines |
| angie | Angie Brandt, 53 | Domestic American | Daughter's text | 42 | got what they came for | "That was sweet, nicer than I expected. Going to text my daughter, dinner is waiting." | 7 / 8 / 6 / 7 | maybe (if her daughter is on) | Her sister (and her daughter) |
| sam | Sam Okafor, 28 | NYC expert | A viewer's DM | 38 | got what they came for | "Saw the subway and Grand Central, it is charming and surprisingly accurate." | 7 / 8 / 8 / 7 | maybe (for Rush Hour Run and other stations) | A Mini Metro friend (maybe a video) |
| linda | Linda Alvarez, 44 | Parent/teacher | Colleague's email | 33 | safety check done | "charming but open chat with strangers and little actual history" | 7 / 7 / 7 / 4 | maybe (only with a classroom option) | Her colleague, with a 'not for my class' verdict |
| wei | Wei Chen, 20 | Native | Cousin's Instagram story | 64 | bored | "Halal cart game was fun, rest felt like clicking shops for coins … nobody talks back" | 6 / 6 / 7 / 5 | maybe (probably not tomorrow) | His cousin |
| priya | Priya Raman, 31 | Transplant/student | Instagram ad | 49 | blocked or confused | "I could not get the rhythm game to score anything" | 6 / 7 / 6 / 5 | maybe (leaning no) | A coworker: the Big Board screen, not the game |
| aiko | Aiko Tanaka, 23 | International dreamer | Friend's quote-post on X | 37 | blocked or confused | "Too much English now, I will come back later." | 8 / 8 / 7 / 8 | maybe (leaning yes (this weekend)) | The friend who posted it |
| kayla | Kayla Johnson, 19 | Domestic American | TikTok | 71 | bored | "I ran out of things I care about: only a few outfit pieces, no shop" | 6 / 8 / 8 / 6 | maybe (if there is a fashion update) | Her roommate |
| nora | Nora Castellano, 34 | NYC expert | Former tour client's email | 35 | got what they came for | "Seen what I wanted: the facts held up and the details are charming." | 7 / 8 / 7 / 7 | maybe (once, to check other places) | The client who sent it and a fellow guide (not first-time tourists) |
| chloe | Chloé Martin, 27 | Gamer | Cozy-games Discord server | 54 | got what they came for | "That was a really sweet 10 minutes; I have my apartment sorted" | 8 / 8 / 7 / 8 | maybe (leaning yes, to earn coins) | Her cozy-games Discord |
| frank | Frank Russo, 47 | Parent/teacher | His daughter showed him | 18 | safety check done | "She can play with me sitting next to her, not alone yet." | 6 / 7 / 8 / 4 | maybe (only to check on her) | Probably not other parents until safety is tighter |
| billie | Nabila "Billie" Hossain, 26 | Transplant/student | College friend in Discord | 45 | got what they came for | "going to paste the lobby link in the Discord and see if anyone bites" | 8 / 7 / 7 / 8 | maybe (leaning yes, on Friday with friends) | Her college Discord, with a lobby link |
| diego | Diego Hernández, 15 | International dreamer | Cousin on WhatsApp | 78 | time's up | "ya jugué un buen rato, el juego de cartas estuvo chido. Me toca cenar" | 8 / 8 / 8 / 8 | yes (probably tomorrow, for a rematch) | His cousin and school friends |
| ron | Ron Whitaker, 67 | Older user | Grandson's email | 42 | got what they came for | "That was a nice half hour. Real history, pretty pictures. Lunch is ready" | 8 / 8 / 7 / 8 | maybe (leaning yes, for facts and the next newspaper) | Old teaching colleagues (and his wife) |
| kevin | Kevin O'Brien, 41 | Parent/teacher | Son mentioned it at dinner | 23 | safety check done | "Got what I came for: 13+, filtered chat, report/block, nothing to buy" | 6 / 6 / 7 / 7 | maybe (to check the report flow) | Other parents |
| ellen | Ellen Park, 72 | Older user | Niece's email | 39 | got what they came for | "That was lovely, Grand Central especially. … come back another day to look for Bellevue." | 7 / 8 / 6 / 7 | maybe (leaning yes, if someone else is on) | Her niece |

Notes

- diego's line reads, in English: "I played a good while, the card game was cool. Time for dinner."
- "…" joins two parts of the same exit line; nothing in between is paraphrased.
- **Arrival snapshot.** All 24 declined analytics cookies (Necessary Only). 17 described the game as Club Penguin on arrival and 11 as a kids' game (millie, jiwoo, darnell, lukas, angie, linda, kayla, nora, frank, kevin, ellen). gabi and priya didn't get "Waddle" or the nostalgia line; millie and ron read it as aimed at a younger generation. Nobody, 0 of 24, used "Use a Photo".

## 2. How sessions ended

**Length.** Median 40.5 active actions (mean 43.8), range 18 (frank) to 78 (diego). At the brief's rate of about six actions a minute, that is roughly 7 minutes, from 3 to 13. Without the three safety checks the median is 42.

**Mini-games and length.** Seven people started a mini-game: Carb-Jitsu (jiwoo, kayla, billie, diego), Slice Factory (marcus), Halal Rush (wei) and Showtime (priya). Their median was 64 active actions; the 14 other players' was 39. All seven left during the game or one step after it (marcus quit his shift, opened the subway map, and left). Longer sessions also had more time to stumble on a game, so this runs both ways. The server logged none of the three job runs with a time or score.

**Exit types**

| Exit type | People | Who | Note |
|---|---|---|---|
| got what they came for | 9 | gabi, tunde, angie, sam, nora, chloe, billie, ron, ellen | tunde formed his verdict for the group chat; angie and ron also named dinner or lunch |
| bored | 8 | millie, marcus, tyler, maya, darnell, lukas, wei, kayla |  |
| blocked or confused | 3 | jiwoo, priya, aiko | jiwoo: Carb-Jitsu tally; priya: Showtime never scored (test artifact); aiko: too much English |
| safety check done | 3 | linda, frank, kevin |  |
| time's up | 1 | diego | dinner; "I was not bored" |
| interrupted | 0 | (none) |  |

**The most common moments of leaving** (a person can sit in several)

| Moment | People | Who | In their words |
|---|---|---|---|
| Nothing pulled them onward (no game, goal or next thing) | 13 | millie, jiwoo, tyler, maya, darnell, tunde, lukas, wei, priya, kayla, nora, diego, ron | "nothing pulled me toward the next thing" (ron) |
| Right after reaching the thing they came for | 9 | gabi, tunde, angie, sam, nora, chloe, billie, ron, ellen | "I left because I had seen what I came for (subway and landmarks), not because I was bored or annoyed." (sam) |
| During or one step after their first mini-game | 7 | jiwoo, kayla, billie, diego, wei, priya, marcus | "After the second halal order I realised the loop was the same order again" (wei) |
| On seeing their own part of the city is missing | 7 | millie, jiwoo, marcus, maya, darnell, tunde, wei | "The map prints "QUEENS" and "BROOKLYN" in grey letters and you can't go to either." (marcus) |
| After a chat line nobody answered | 6 | millie, maya, darnell, tunde, wei, ellen | "I asked a real question in chat and got nothing back" (darnell) |

Eight exit lines name an outside obligation (essay, assignment, work, a tour, bed, lunch, dinner: millie, jiwoo, lukas, angie, tunde, nora, ron, diego), but only for diego was it the deciding reason.

**Coming back tomorrow.** Yes: 1 (diego). No: 1 (tyler). Maybe: 22, of whom 5 lean yes (aiko, chloe, billie, ron, ellen), 3 lean no (millie, darnell, priya) and 2 said "probably not tomorrow" (tunde, wei). Seven tie a return to someone they know being on: jiwoo, marcus, maya, angie, billie, ellen, diego.

**Sharing.** 19 would send it to someone, 2 might (lukas, tyler, the latter to his sister and not his gamer friends), 1 only if it had the Bronx (millie), and 2 would not for now (darnell, frank). Of the messages they drafted, 7 call it Club Penguin, 6 mention the turnstile or the swipe, and 5 ask where a place is: "Where's the Bronx?" (millie), "You can't take the N to Astoria yet though." (marcus), "we need central park added tho" (maya), "Where is Harlem though." (tunde), "Where is Bellevue on it?" (ellen).

**Scores out of 10**

| Score | Mean | Median | Spread (score: people) |
|---|---|---|---|
| Fun | 6.7 | 7 | 4: 1, 5: 1, 6: 9, 7: 7, 8: 6 |
| New York feel | 7.1 | 7 | 6: 8, 7: 6, 8: 10 |
| Ease of use | 6.9 | 7 | 5: 1, 6: 6, 7: 12, 8: 5 |
| Would recommend | 6.0 | 6 | 3: 2, 4: 2, 5: 5, 6: 4, 7: 6, 8: 5 |

**Why the rooms were empty, and why that still matters.** The test city held about six players at a time: it peaked at 6 real players online (minute 0.7) and nobody ever had more than 5 others online, spread across 14 rooms. 11 of 24 typed in chat, 11 lines in all. Six lines were typed into a room with no other real player in it (maya on the Empire State deck, millie, tunde and ellen in Grand Central, darnell on the Brooklyn Bridge, wei in Chinatown) and none got a human reply; city locals answered some of them with a canned line. The one place question asked in company, billie's "anyone from queens?" in Times Square with diego and ron present, was answered by diego within seconds, and the two became the round's only friends. The emptiness is mostly a test-city artifact, but it is exactly what a quiet evening after launch would look like.

## 3. What was fun

Ranked by the number of people who named it. "Reach" shows how many of the people who got there named it, for things only some people reached.

| # | Moment | People | Reach | Who | Quote |
|---|---|---|---|---|---|
| 1 | Times Square on arrival (the art) | 23 |  | all but kevin | "This is my Instagram New York." (gabi) |
| 2 | "Please swipe again at this turnstile" | 20 |  | all but tyler, tunde, frank, kevin | "That was the moment I thought the people who made this have lived there." (marcus) |
| 3 | Photo booth and stamping the MetroCard ("No refunds for blinking") | 20 |  | all but millie, tyler, frank, kevin | "the MetroCard stamp with a number (No. 0016) felt like a real keepsake." (kayla) |
| 4 | Quick rewards: level-ups, coins, stamps, confetti | 15 |  | jiwoo, gabi, maya, darnell, tunde, priya, aiko, kayla, chloe, frank, wei, diego, tyler, ron, angie | "The XP, level-up and stamp toasts all feel generous and not spammy." (chloe) |
| 5 | The island map art | 12 |  | tyler, gabi, jiwoo, angie, kayla, aiko, ron, ellen, maya, diego, billie, priya | "The map in particular made me want to go there." (kayla) |
| 6 | Rosa, "your building's super" | 9 |  | millie, jiwoo, marcus, maya, tunde, nora, chloe, kevin, ellen | "My father was the super in our building, so that hit me." (millie) |
| 7 | The avatar creator | 8 |  | jiwoo, maya, aiko, kayla, chloe, gabi, marcus, nora | "Cute, no reading needed." (aiko) |
| 8 | Grand Central: clock, ceiling, Whispering Gallery | 7 | 7 of 7 visitors | millie, tunde, sam, aiko, nora, ron, ellen | "Someone knows the real place." (tunde) |
| 9 | The Club NYC Times (newspaper) | 6 | 6 of 6 who opened it | millie, tunde, lukas, linda, ron, ellen | "A teacher would use this." (ron) |
| 10 | Chinatown block and Joe's details | 4 | 4 of 6 visitors | jiwoo, marcus, billie, wei | "Someone actually knows how you eat them." (wei) |
| 11 | The apartment: radiator, decorating | 4 | 4 of 4 visitors | millie, chloe, diego, ellen | "The Pepperoni Rug and Everything Bagel Bag are exactly my humour." (chloe) |
| 12 | Carb-Jitsu at Joe's Pizza | 4 | 4 of 4 players | jiwoo, kayla, billie, diego | "This is what I came for." (diego) |
| 13 | Free welcome gift at Sal's cart | 4 |  | millie, gabi, angie, diego | "Instant reward, no cost." (angie) |
| 14 | Brooklyn Bridge: art and fact card | 3 | 3 of 5 visitors | darnell, linda, nora | "21 elephants were all correct, with a good dry tag line." (nora) |
| 15 | Wall Street Big Board jokes | 3 | 3 of 4 visitors | tyler, priya, lukas | "As a tech worker these landed." (priya) |
| 16 | Subway station and line diagram | 3 |  | sam, priya, lukas | "Correct, and nobody checks that." (sam) |
| 17 | A real player answering, waving or befriending | 3 |  | billie, diego, aiko | "Felt like real people." (diego) |
| 18 | Dancing in Times Square (press D) | 2 |  | darnell, angie | "That looked exactly like the TikTok." (darnell) |
| 19 | 9/11 Memorial and One WTC plaza | 2 | 2 of 2 visitors | angie, priya | "This is what made me trust the place." (angie) |
| 20 | The Met scene | 2 | 2 of 3 visitors | maya, lukas | "It looks like a real place." (maya) |
| 21 | Chat filter hiding a phone number | 2 |  | kevin, ron | "Typing a phone number and seeing it turn into "[removed]" instantly was the best moment for me." (kevin) |
| 22 | Statue of Liberty in a foam crown | 1 | 1 of 1 visitor | gabi | "I am at the Statue of Liberty in 7 minutes." (gabi) |
| 23 | Halal Rush | 1 | 1 of 1 player | wei | "Overcooked-lite, and white sauce / hot sauce is correct." (wei) |
| 24 | Carb-Jitsu share flow (Copy Result, lobby link) | 1 |  | billie | "Built for Discord people." (billie) |
| 25 | Slice Factory (mixed) | 1 | 1 of 1 player | marcus | "Still: fun in principle." (marcus) |

The arrival is where nearly everyone had fun: the art, the swipe joke and the photo booth each reached 20 or more. Place-specific delights scored at or near 100% of the people who got there (Grand Central 7 of 7, the newspaper 6 of 6, the apartment 4 of 4, Carb-Jitsu 4 of 4), so their low raw counts are a reach problem, not a quality problem. The rewards split opinion: 15 liked them, 4 found them unearned (section 4).

> **Round 1, primed (not counted).** With all five seeded into one city and a scheduled meetup on the Red Steps, the social side worked: they friended each other within minutes, one player gave a chat tour, and angie wrote "Nobody mocked the slow lady from Indiana". Places the blind round never reached also landed: millie on Halal Rush ("Halal Rush is good work."), angie on Flag Roll Call at Rockefeller Center ("Fine little brain game, like Wordle-lite."), and the group photo booth ("Oh, that's darling. Maddie gets this one.", angie).

## 4. What felt static

Every place or object someone flagged as "just a popup", "a picture with text" or "nothing happens", ranked by people. Interface defects that people also listed under Static (the decorate tray, unlabelled icons, the quest not ticking) are in section 8.

| # | Place or object | People | Who | What they hoped would happen instead | Quote |
|---|---|---|---|---|---|
| 1 | People in the rooms (city locals and other players) | 16 | millie, jiwoo, gabi, maya, darnell, tunde, lukas, angie, wei, priya, kayla, nora, chloe, frank, ellen, billie | Someone who answers or reacts; a clear sign of who is a real person | "just stand there or loop a canned line. They don't talk back." (millie) |
| 2 | "New in Town" checklist and quest chips | 9 | millie, tyler, maya, wei, priya, aiko, billie, angie, jiwoo | Goals that are play, not chores; a tick when done; out of the way once moving | "It feels like homework in a world with nothing pulling me in." (maya) |
| 3 | Landing page bits that look live (bubbles, name tags, "Dancing...", city-so-far board) or go unread | 7 | jiwoo, gabi, lukas, linda, priya, aiko, ellen | Proof the city is alive, or just the Play button | "Weak proof that it is a living place." (linda) |
| 4 | Rosa's welcome and tour card (and "How to Play" reopening it) | 6 | jiwoo, tyler, aiko, chloe, diego, ron | Be walked to things; a glowing arrow or picture; the controls explained | "I wanted it to walk me to the things, so I skipped it." (chloe) |
| 5 | "Join the Dance Jam" button and countdown banner (verified in code: works, no confirmation) | 6 | darnell, angie, tunde, lukas, ron, ellen | A clear "you joined" and a visible dance, or a dance battle | "I wanted a clear "you joined" and a visible dance." (angie) |
| 6 | Chat to the room | 6 | millie, maya, darnell, tunde, wei, ellen | A reply, or at least a sign someone saw it | "I asked a question and nothing happened." (maya) |
| 7 | The island map | 5 | marcus, darnell, tunde, sam, tyler | Walk between neighbourhoods; something to read about each place; a real map | "Nothing to learn from it, just a teleport menu." (sam) |
| 8 | The subway ride | 5 | sam, linda, nora, lukas, wei | A fact about the line, the real route, or a skip | "The subway ride is a title card plus a station name." (linda) |
| 9 | The MetroCard intro chain before you can walk. 6 more said elsewhere that it ran long (10 in all) | 4 | tyler, darnell, kayla, diego | Be in the city sooner; skip it on a replay | "Cute once, but I just wanted to move." (darnell) |
| 10 | Confetti, levels and stamps for walking and arriving | 4 | millie, marcus, tunde, lukas | Rewards for real achievements | "It felt like a free confetti machine, so it didn't feel earned." (marcus) |
| 11 | Carb-Jitsu seat filled by a city local (bot) | 3 | jiwoo, kayla, billie | A real person across the table | "Joe's Pizza table said nobody is playing, so it is just me vs a bot." (kayla) |
| 12 | Shops and stalls are menus (I ♥ NY catalog, painter's stall, furniture catalog) | 3 | wei, linda, diego | Walk around and mess with stuff; the bridge's story at the painter's stall | "Painter and furniture catalog are menus: pick, pay, done." (diego) |
| 13 | The Met: doors do nothing, no interior | 2 | lukas, maya | Walk into the museum | "The big doors do nothing and there is no interior." (lukas) |
| 14 | Wall Street Big Board | 2 | tyler, lukas | Buy and sell; a mini stock game | "Big Board: a popup of prices I cannot trade." (tyler) |
| 15 | Exchange door and the Oculus | 2 | tyler, priya | Go inside; the Oculus leading to PATH | "a tap gives a text card. I wanted to go inside or do something." (priya) |
| 16 | Viewers: Statue tower viewer, Empire State binoculars | 2 | gabi, maya | See the city, click a landmark, keep a photo | "instead I only moved the mouse around." (maya) |
| 17 | Safety page | 2 | frank, kevin | Parent-facing answers: who runs it, what is logged, can chat be turned off | "The Safety page reads like a rules poster." (kevin) |
| 18 | "Save My Card" and the booth photo | 2 | chloe, kayla | Know what saving does | "I didn't know what saving does." (chloe) |
| 19 | Grand Central departures board | 1 | millie | See trains and times, pick a train home | "I wanted to see trains and times, or pick a train home." (millie) |
| 20 | The newspaper as a wall of text | 1 | millie | Short headlines to tap | "I wanted short headlines I could tap." (millie) |
| 21 | Opal Clock card | 1 | aiko | One short line plus a picture or sound | "I wanted one short line plus a picture or a sound." (aiko) |
| 22 | Whispering Gallery | 1 | nora | The real trick: two people at opposite corners | "I hoped for the real trick: two people at opposite corners hearing each other." (nora) |
| 23 | Grand Central ceiling | 1 | nora | The backwards-zodiac story (sam did open that card) | "Grand Central ceiling: not clickable." (nora) |
| 24 | Ordering a slice at Joe's | 1 | marcus | See, fold and eat the slice | "No slice in my hand, no fold, no bite." (marcus) |
| 25 | Pretzel cart at the Met | 1 | ron | See the pretzel, a short scene, or a fact | "I wanted to see the pretzel, a short scene, or a fact." (ron) |
| 26 | Taxi in Times Square | 1 | gabi | Ride it, or see a cab drive | "nothing happened, I hoped to ride it or see a yellow cab drive." (gabi) |
| 27 | Brooklyn Bridge right-edge arrow | 1 | darnell | A way into Brooklyn | "looked like a way out, did nothing when I clicked." (darnell) |
| 28 | Joe's Shanghai and Ten Ren storefronts | 1 | wei | Something to do in Chinatown | "click, one line, coins. A picture with text." (wei) |
| 29 | Soda fridge at Joe's | 1 | billie | More than a one-line joke | "Cute but a dead end." (billie) |
| 30 | "Visit their place" on a player card | 1 | billie | Something to do when the door is closed | "Fair, but nothing to do instead." (billie) |
| 31 | "Their Style" items on a local's card | 1 | kayla | "Get this" or "where to buy" | "clicking Cargo Pants (Supreme) or Slides (Nike) does nothing." (kayla) |
| 32 | "Beat It" notice (a leaderboard) | 1 | diego | A game | "I expected a game." (diego) |
| 33 | Walking to a coin | 1 | diego | Something on arrival | "Walking to a coin on the ground took long and nothing much happened." (diego) |
| 34 | Times Square crowd | 1 | marcus | Crowds, costumed characters, someone handing out a CD | "Empty and clean." (marcus) |
| 35 | Showtime (test artifact, verify on a real browser) | 1 | priya | Feedback on hit or miss | "Showtime: score 0 with no feedback" (priya) |

### What it adds up to

Grouping the rows above by kind of failure (distinct people in each):

- **People don't respond: 16.** City locals loop one line, other players stand still, chat goes unanswered, and a bot takes the Carb-Jitsu seat. It is the biggest static complaint, and 6 people named an unanswered chat line as part of why they left.
- **The tutorial layer reads as chores: 12** (Rosa's card: jiwoo, tyler, aiko, chloe, diego, ron; the checklist: millie, tyler, maya, wei, priya, aiko, billie, angie, jiwoo).
- **A click returns a fact card, or one line and some coins: 10** (millie, tyler, lukas, priya, aiko, marcus, ron, wei, billie, nora). tyler: "Every object I clicked gave me a card of text."
- **Getting around is a teleport or a cutscene: 9** (the map: marcus, darnell, tunde, sam, tyler; the subway ride: sam, linda, nora, lukas, wei). Walking routes between scenes exist (checked in code: Times Square's edges lead to Rockefeller Center and Grand Central), but every move between neighbourhoods in round 2 went through the map or a subway ride, except priya's accidental walk through the Oculus.
- **Clicked and nothing visible happened: 8** (gabi's taxi, darnell's bridge arrow and the Dance Jam, kayla's "Their Style" items, lukas at the Met doors, angie at the Dance Jam, nora at the ceiling, maya in chat, priya with other players).

### What they hoped would happen instead

- **A person who answers: 16.** The same 16 as above.
- **To do or see the real thing: 12** (millie, gabi, marcus, tyler, lukas, priya, maya, ron, kayla, wei, darnell, angie): pick a train home, ride the cab, eat the slice, trade the stocks, walk into the Met, see the view, take the outfit, join a visible dance.
- **A game or a goal instead of a chore: 5** (tyler, darnell, diego, priya, maya).
- **The story behind the place: 3** (linda on the bridge and the subway, nora on the zodiac and the gallery, tunde on the map).
- **Less text, more picture: 2** (aiko, millie).

### Already in the game, but not found (checked in code)

- **Central Park** is a full room (carriage ride, rowboat, Boathouse café, Bow Bridge), a spot on the island map, and one walk left from the Met. maya clicked where she thought it was and landed on the Empire State Building; gabi saw no name for it; lukas, maya and ron all stood at the Met next to it.
- **SoHo** has Supreme and Nike shops. kayla wanted exactly that ("obtainable brand pieces (Supreme, Nike)") and darnell wanted sneakers.
- **A taxi:** "Hail a Taxi" in Times Square honks and opens the map. gabi wanted to ride one; her first click met Rosa's card instead.
- **Adel's halal cart** (and Halal Rush) is on Fifth Avenue. marcus: "Halal cart is mentioned in the tutorial, but I didn't find it." wei reached Halal Rush through a notice.
- **A short quiz,** Flag Roll Call, is at Rockefeller Center. angie wanted "a simple puzzle or word game" and millie "a daily puzzle".
- **Coverage:** `rooms.ts` defines 30 rooms; round 2 visited 14. Unvisited: Broadway Theater, Rockefeller Center, Fifth Avenue, Saks, Louis Vuitton, Central Park, SoHo, Supreme, Nike, Ralph's Coffee, the High Line, Chelsea Market and Sky Deck 102, plus the Halloween Parade and the two homes you can buy. Six of the 15 places on the island map went unvisited (Central Park, Rockefeller Center, Fifth Avenue, the High Line, Chelsea Market, SoHo); `map.ts` names places through hover labels.

> **Round 1, primed (not counted).** Some unreached rooms are also thin: angie found Rockefeller's skating "a short automatic glide with a quip ('One lap. My legs say that was ten.'), no skill game", billie found the Red Steps have 3 seats that locals take, and nora called the Whispering Gallery "an echo gag". Coins came easily: millie earned "170 coins in 9 minutes doing nothing but looking at things", and a Halal Rush shift paid her 64 coins while the level-up after it paid 80.

## 5. What people wanted but couldn't do

| # | Wanted | People | Who | Note | Quote |
|---|---|---|---|---|---|
| 1 | A place or route from their own life | 13 | millie, jiwoo, marcus, maya, darnell, tunde, wei, aiko, nora, billie, diego, ellen, priya | Bronx, Brooklyn, Queens and the 7, Staten Island, Harlem, UWS, the Village, Bellevue, PATH (section 6) | "The map said "Map of Manhattan" and stopped." (millie) |
| 2 | Someone real who answers, and a way to tell who is real | 11 | millie, jiwoo, maya, darnell, tunde, wei, priya, kayla, nora, billie, ellen |  | "To chat with a real person and see it was a real person." (priya) |
| 3 | Something to do early: a game, a goal or a system | 11 | tyler, darnell, millie, angie, priya, diego, lukas, ron, nora, jiwoo, wei |  | "A game within the first minutes." (diego) |
| 4 | Skip or shorten the intro | 7 | millie, jiwoo, billie, wei, ellen, darnell, diego |  | "Skip on the intro after the first time" (billie) |
| 5 | Things that already exist but were not found | 7 | maya, gabi, kayla, darnell, marcus, angie, millie | Central Park (maya, gabi), SoHo with Supreme and Nike (kayla, darnell), Adel's halal cart (marcus), a short quiz, Flag Roll Call (angie, millie); checked in code | "No clear sign of where Central Park is on the map (it is there but not named)." (gabi) |
| 6 | An avatar that looks like them, and real clothes | 6 | darnell, kayla, angie, ellen, diego, aiko |  | "Pick a character that looks like me (middle-aged woman)" (angie) |
| 7 | Share or screenshot tools | 5 | gabi, aiko, kayla, billie, linda |  | "A way to show off my crown and stamps to my friends (a share picture)." (gabi) |
| 8 | Do the thing the object shows (ride, eat, trade, go inside) | 4 | gabi, marcus, tyler, lukas |  | "To see and eat the slice" (marcus) |
| 9 | Their language, simpler English, bigger text | 4 | gabi, aiko, ron, ellen |  | "Japanese (or simpler English) option, or a translate button." (aiko) |
| 10 | The story behind places | 4 | nora, linda, ron, tunde |  | "A tour/history mode: a short guided walk with the story behind each place" (nora) |
| 11 | Clearer mini-games: running score, difficulty, rematch, feedback | 4 | jiwoo, marcus, diego, priya |  | "A running score or win tracker in Carb-Jitsu" (jiwoo) |
| 12 | Parent or classroom controls | 3 | frank, kevin, linda |  | "A teacher or class mode: private room, no stranger chat, or chat off." (linda) |
| 13 | Keyboard movement | 2 | tyler, darnell |  | "WASD or arrow movement." (tyler) |
| 14 | The subway as a real system | 2 | sam, lukas |  | "A real route: pick a start and end, see the transfers, ride in the correct car." (sam) |
| 15 | Order real food | 2 | jiwoo, marcus |  | "Korean food / bubble tea to actually order something." (jiwoo) |
| 16 | More from decorating | 1 | chloe |  | "A preview of the room before buying furniture" (chloe) |
| 17 | A phone version | 1 | gabi |  | "A phone version (I am mostly a phone gamer)." (gabi) |

Row 5 overlaps rows 1 and 3: seven of the wants people listed are already in the game, so for them the fix is discovery (map labels, a list of things to do, Rosa pointing the way), not new content.

## 6. New York

### What felt true

| # | What felt true | People | Reach | Who | Quote |
|---|---|---|---|---|---|
| 1 | The turnstile "swipe again" | 20 |  | all but tyler, tunde, frank, kevin | "every New Yorker knows the MetroCard swipe struggle" (nora) |
| 2 | Hot dog, pretzel and halal carts | 19 |  | all but jiwoo, sam, nora, kevin, ellen | "The Met's steps with hot dog and pretzel carts, autumn leaves, yellow cabs." (ron) |
| 3 | Pigeons | 12 |  | jiwoo, gabi, tyler, maya, darnell, tunde, aiko, chloe, billie, diego, frank, marcus | "Pigeons everywhere made me laugh." (aiko) |
| 4 | Times Square: red steps, souvenir shops, lights, bucket-hat tourists | 11 |  | marcus, gabi, tunde, chloe, kayla, nora, darnell, aiko, angie, priya, tyler | "Roughly the real feel of Times Square." (priya) |
| 5 | Rosa the super with a boiler to fix | 8 |  | millie, jiwoo, maya, tunde, marcus, nora, chloe, ellen | "Very true." (tunde) |
| 6 | Yellow cabs | 8 |  | tyler, aiko, frank, kayla, angie, billie, ron, marcus | "a yellow cab at the edge of Times Square" (billie) |
| 7 | Grand Central details | 7 | 7 of 7 visitors | millie, tunde, sam, aiko, nora, ron, ellen | "They got the clock." (ron) |
| 8 | Rats, pizza rat | 7 |  | marcus, angie, sam, priya, nora, wei, diego | "A rat in the corner of the platform. Obviously." (marcus) |
| 9 | Subway bullets and diagram | 6 |  | lukas, sam, linda, darnell, priya, millie | "The line and station logic is surprisingly credible." (lukas) |
| 10 | Subway car and announcements | 6 |  | marcus, sam, nora, chloe, jiwoo, ellen | "Subway tile walls, orange and yellow seats, line strip, "Stand clear of the closing doors, please"." (marcus) |
| 11 | Chinatown block: Joe's Shanghai, Ten Ren, the arch | 6 |  | jiwoo, marcus, billie, wei, kayla, linda | "is Mott St." (billie) |
| 12 | Food lines: soup dumplings, "folded, never forked" | 5 |  | tunde, lukas, linda, ron, wei | ""folded, never forked" all ring true." (linda) |
| 13 | The walk-up: radiator, heat season, fire escape | 4 | 4 of 4 visitors | millie, chloe, diego, ellen | "Heat season facts (68 degrees, Oct 1 to May 31) are right" (millie) |
| 14 | 1904 subway history in the newspaper | 3 |  | millie, ron, ellen | "correct as I taught it." (ron) |
| 15 | The Met steps, carts and leaves | 3 | 3 of 3 visitors | lukas, maya, ron | "this is actually accurate and pretty." (maya) |
| 16 | Brooklyn Bridge facts, locks, keychains | 3 |  | nora, darnell, linda | "love locks on rail (illegal, but real)." (nora) |
| 17 | Map layout: Grand Central east of Times Square, High Line west | 3 |  | marcus, sam, nora | "The map layout: Grand Central east of Times Square, High Line on the west side." (nora) |
| 18 | WTC memorial pool and Oculus | 2 | 2 of 2 visitors | angie, priya | "that is my actual commute." (priya) |
| 19 | Borough tags and rent cards in Carb-Jitsu | 2 |  | billie, diego | "funny and sting a little as a renter." (billie) |

Two splits worth knowing: millie called the Times Sq lines right while marcus, sam and nora called them incomplete, and millie flagged the newspaper's soup-dumpling story as "very tourist-Manhattan" while five others praised the food lines.

### What was wrong

Specific errors, with who caught them:

| # | Error | People | Caught by | What they said |
|---|---|---|---|---|
| 1 | MetroCard, not OMNY tap | 5 | millie, marcus, nora, ron, ellen | "MetroCards. They're gone. We tap OMNY." (millie) |
| 2 | Times Sq-42 St shows too few lines | 3 | marcus, sam, nora | "Times Sq has only 1 2 N on the diagram (really also 3 7 Q R W S A C E)" (sam) |
| 3 | Intro rides the 1 from Times Sq to Times Sq; car strip mixes 13 lines | 3 | marcus, sam, nora | "Nobody rides a car with those lines." (marcus) |
| 4 | Charging Bull in front of the NYSE | 2 | tunde, priya | "the Charging Bull standing in front of the NYSE (it's at Bowling Green)" (tunde) |
| 5 | Whispering Gallery on the main concourse | 2 | sam, nora | "Whispering Gallery sits on the main level; it's on the lower dining concourse near the Oyster Bar." (nora) |
| 6 | The 7 is in the intro and rides but not on the subway map | 2 | wei, sam | "The intro board lists the 7 but the map has no 7." (wei) |
| 7 | Rockefeller Center station shown with the 1 and N | 1 | sam | "the subway diagram puts the 1 and N at Rockefeller Center (that is B/D/F/M)" (sam) |
| 8 | Grand Central departures board on the wrong wall | 1 | sam | "the departures board is placed on the wrong wall" (sam) |
| 9 | A 4 train from Times Square | 1 | linda | "The 4 does not stop at Times Square" (linda) |
| 10 | A 2 train to Chinatown | 1 | wei | "the 2 does not go to Canal St that way" (wei) |
| 11 | The B at Wall St | 1 | lukas | "B doesn't serve Wall St" (lukas) |
| 12 | $.99 slices | 1 | jiwoo | "$.99 slices (not for years)" (jiwoo) |
| 13 | Joe's Pizza placed in Little Italy | 1 | nora | "Joe's Pizza is in Greenwich Village, not Little Italy" (nora) |
| 14 | Opal clock "valued 10 to 20 million dollars" as fact | 1 | nora | "I'd say "reputedly"" (nora) |
| 15 | Barnum's elephants without the stampede; no Emily Roebling | 1 | nora | "no Emily Roebling!" (nora) |
| 16 | Slice shop with tablecloths, pies behind glass, seated diners | 1 | marcus | "Real slice shops don't have tablecloth tables and whole pies behind glass." (marcus) |
| 17 | No PATH; the Oculus leads to Wall Street | 1 | priya | "There is no PATH anywhere, so an entire class of commuters is missing." (priya) |
| 18 | Brooklyn Bridge scene has a "Wall St" sign | 1 | darnell | "Brooklyn Bridge in the game has a "Wall St" sign and tourists" (darnell) |
| 19 | Studio rent of 3,554 coins a month | 1 | lukas | "which is oddly cheap given what I remember." (lukas) |
| 20 | Walk-up too big and sunny | 1 | chloe | "the apartment is a bit big and sunny for an East Village fifth-floor walk-up." (chloe) |

diego listed "Joe's Pizza in Little Italy" as true; nora, the licensed guide, says it is in Greenwich Village.

How the city is drawn, as opposed to a factual slip (most called these fine for a cartoon or a game):

| Critique | People | Who | Quote |
|---|---|---|---|
| Squashed geography (Liberty at the Battery, Central Park tiny) | 8 | jiwoo, gabi, marcus, tunde, lukas, sam, priya, nora | "Fine for a cartoon, but I'd notice it." (marcus) |
| Too clean, cheerful and quiet | 8 | marcus, jiwoo, angie, priya, billie, diego, ron, darnell | "Everyone is in a cartoon world with no one rude, which is not New York." (priya) |
| Tourist Manhattan, not where New Yorkers live | 7 | millie, maya, tunde, marcus, wei, darnell, frank | "It is the visitor's New York." (tunde) |

### What was missing

| Missing | People | Who | Quote |
|---|---|---|---|
| Any outer borough | 10 | millie, marcus, darnell, tunde, wei, nora, billie, diego, frank, lukas | "As a Staten Islander, I noticed nothing about my borough." (frank) |
| Queens | 6 | marcus, wei, nora, billie, diego, lukas | "Queens. Jackson Heights, the 7 train, Ridgewood." (billie) |
| Brooklyn beyond the bridge | 4 | marcus, darnell, tunde, lukas | "Brooklyn. Or any borough that isn't Manhattan." (darnell) |
| The Bronx | 2 | millie, tunde | "The Bronx: the 4 train, Yankee Stadium, Arthur Avenue, the Concourse." (millie) |
| Staten Island (and its ferry) | 2 | nora, frank | "Staten Island and Queens (my home borough)." (nora) |
| The 7 train | 4 | wei, billie, diego, sam | "Queens, the 7 train, Flushing Meadows on the map." (diego) |
| Residential and uptown Manhattan (UWS, Harlem, the Village, Bellevue) | 4 | jiwoo, maya, tunde, ellen | "Harlem, Washington Heights, the Bronx, Brooklyn neighbourhoods beyond the bridge; Columbia." (tunde) |
| Bodegas (and the chopped cheese, egg and cheese) | 3 | millie, marcus, darnell | "Bodegas, a bodega cat, a deli sandwich ("chopped cheese"), an egg-and-cheese." (marcus) |
| Central Park as a place to go (it exists, not found) | 2 | maya, gabi | "Central Park (a place to just hang out)" (maya) |
| PATH | 1 | priya | "Oculus to lead to PATH, which is the thing I actually ride." (priya) |
| Fashion and music (SoHo exists, not found) | 1 | kayla | "Fashion and music, the reasons I want to move there, are not represented yet." (kayla) |
| Crowds and costumed characters in Times Square | 1 | marcus | "No crowd, no costumed characters, no one trying to hand me a CD." (marcus) |
| Thanksgiving parade | 1 | angie | "Would like to see the Thanksgiving parade." (angie) |
| A Sex and the City brownstone or cupcake shop | 1 | aiko | "I did not see a Sex and the City place (a brownstone or cupcake shop?) and wanted one." (aiko) |
| Snow in Central Park | 1 | gabi | "Central Park in snow (my dream)." (gabi) |

Single mentions not in the table: Yankee Stadium, Arthur Avenue and the Grand Concourse (millie); the N to Astoria and the A/C and 2/3/4/5 to Crown Heights (marcus); the 1 at 96th and 86th (maya); Columbia (tunde); K-town, Washington Square, St. Marks and Union Square (jiwoo); Bellevue, First Avenue and the east-side hospitals (ellen); a sneaker store (darnell, and Nike exists in SoHo); Emily Roebling, the old Penn Station and the 1904 line (nora); express and local service, timetables and the 1904 IRT stations (sam).

> **Round 1, primed (not counted).** The primed players fact-checked further: Joe's Pizza placed in Little Italy (millie, nora, billie, gabi), MetroCard sales ending on Dec 31 2025 (millie, nora, billie, gabi), Joe's Shanghai starting in Flushing (billie), Supreme's old Lafayette shop (nora), the 6 listed at Prince St and merged 14 St and Wall St stations (nora), Adel's cart being on Sixth Avenue and a night cart (millie), Saks and St. Patrick's sitting at 49th to 51st, not 57th (angie), Glaser's I ♥ NY sketch date (nora), and "354 steps" to the crown (gabi).

## 7. Segment readouts

### Natives

*millie, darnell, wei, frank, maya. Mean scores: fun 5.8, NYC 6.2, ease 6.6, recommend 4.6; median 39 active actions.*

- Every native noticed their own New York was missing: the Bronx (millie), Brooklyn (darnell), Queens and the 7 (wei), the Upper West Side and Central Park (maya), Staten Island (frank). Four asked the room ("any Bronx people here?", "anyone from bk", "anyone from queens", "is there a central park") from rooms with no other real player, and nobody answered.
- The jokes landed hardest with them (the turnstile for all four players; Rosa and the radiator for millie), and so did the tourist critique: "Times Square is exactly what I avoid" (millie), "Real teens don't go there." (maya), Chinatown as "the tourist postcard version" (wei). They gave the lowest NYC feel and recommend scores of any lens.
- What would turn them is concrete: millie's "one block of the Grand Concourse with a bodega and a super's stoop", wei's Flushing and the 7, maya's Central Park with people in it (it exists; she landed on the Empire State Building). Only wei found a game, and "Halal Rush was the only thing with a loop."

### Transplants and students

*jiwoo, tunde, priya, billie. Mean scores: fun 6.8, NYC 6.8, ease 6.5, recommend 6; median 47 active actions.*

- They arrived on a deadline and left on one (jiwoo's essay, tunde's assignment), and each looked for their own routine without finding it: Washington Square and St. Marks (jiwoo), Harlem and Columbia (tunde), the PATH under the Oculus (priya), Queens and the 7 (billie).
- Two of four stopped at a mini-game they couldn't read: jiwoo's Carb-Jitsu showed no running tally, and priya's Showtime never scored (a test artifact; verify on a real browser).
- billie is the case to copy: diego answered "anyone from queens?" within seconds and sent a friend request, she won a 30-second Carb-Jitsu table, and she left to paste the lobby link into Discord, scoring it 8 / 7 / 7 / 8. (She grew up in Jackson Heights, so her wants match the natives'.)

### International dreamers

*gabi, lukas, aiko, diego. Mean scores: fun 7.5, NYC 7.8, ease 7.5, recommend 7; median 41.5 active actions.*

- The postcard city is the one they came for: gabi stood at the Statue of Liberty in a foam crown ("that was my dream"), aiko found Grand Central "Very Gossip Girl", and diego's cousins' Queens turned up only on a card ("Queens cards, nice").
- English is their wall: gabi listed "Waddle", "super", "boiler", "Day-Tripper", "Lox Pink" and Roman numerals as hard for B1 English, and aiko left with "Too much English now". Both asked for their own language or simpler English; gabi also wants to play on her phone.
- lukas and diego are opposite cases: lukas looked for a system and found the Big Board "explicitly fake and not tradable" and the Met shut; diego looked for a game, found Carb-Jitsu after about 60 actions, and is the panel's only firm yes for tomorrow.

### Domestic Americans

*marcus, angie, kayla, ron. Mean scores: fun 7, NYC 7.5, ease 7, recommend 6.8; median 53.5 active actions.*

- Each judged it against one personal reference: marcus against 11 years in Astoria and Crown Heights (the grey QUEENS and BROOKLYN labels ended his session), angie against her 9/11 memories (the memorial "made me trust the place"), kayla against TikTok fashion (about nine wardrobe items, then nothing), ron against his history classes (the Opal Clock card was his favourite thing).
- The gentle pace worked for angie ("Rewarding fast.") and ron ("a pleasant half hour") and not for marcus, who called the levels "a free confetti machine".
- None was a firm yes. marcus and angie would come back if a friend or a daughter were on, kayla for a fashion update, ron for "the next newspaper".

### NYC experts

*nora, sam. Mean scores: fun 7, NYC 8, ease 7.5, recommend 7; median 36.5 active actions.*

- Both expected little and were won over by accuracy: "the facts held up" (nora), "surprisingly accurate" (sam). sam's checks of the subway bullets and the backwards ceiling passed; nora's Brooklyn Bridge card did too.
- Between them they caught 10 of the 20 specific errors in section 6, from the Whispering Gallery's level to the Rockefeller Center station lines, and nora flagged confident claims that need a hedge (the opal clock's value, Barnum's elephants).
- Both would come back for depth, not the loop: nora for a 20-second "guide's version" of each landmark with a source, sam for a real subway system and Rush Hour Run. Both would pass it to peers (a fellow guide, a Mini Metro friend); nora would not send it to a first-time tourist.

### Gamers

*tyler, chloe, maya, kayla, diego, billie. Mean scores: fun 6.7, NYC 7.2, ease 7.2, recommend 6.5; median 49.5 active actions.*

- They split on whether they found a loop: billie and diego (Carb-Jitsu) and chloe (shop and decorate) rated fun 8; tyler (no mechanic) rated it 4, maya (never found a game) 6 and kayla (fashion ran out) 6.
- Finding the games is the problem: tyler wanted "A visible list of the mini-games", diego took about 60 actions to find Carb-Jitsu, and maya "couldn't tell what I was supposed to do next".
- Stakes matter to them: wins against a city local don't count on the board (billie, kayla), tyler wanted WASD and a skill ceiling, diego a clear rematch button and "More than 3 coins for a whole match", chloe a clearer way to earn the 60 to 90 coins nice furniture costs.

### Parents and teachers

*frank, kevin, linda. Mean scores: fun 6.3, NYC 6.7, ease 7.3, recommend 5; median 23 active actions.*

- They came to check, not to play: all three opened Safety before Play, and frank (18) and kevin (23) had the panel's two shortest sessions.
- All three flagged the self-declared 13+ checkbox and the selfie-first "Use a Photo". The filter results were mixed (kevin's phone number became "[removed]"; frank's "real name and what school" went through), and kevin never saw Report or Block because clicking a player opened his own wardrobe.
- Verdicts and what would flip them: frank "not alone yet" (chat limited to friends or preset phrases for new accounts, with a parent toggle), linda not for her class (a teacher mode with an invite code and chat off), kevin cautiously yes (a Parents page and a visible Report and Block).

### Older users

*ron, ellen, millie, angie. Mean scores: fun 7, NYC 7.5, ease 6.2, recommend 6.8; median 42 active actions.*

- The swipe is their physical barrier: ron's "two slow, careful drags" were rejected, ellen took three tries, millie fell back on Space and angie found it fiddly on a trackpad. ron's and ellen's one change were both about the first minutes (more tolerance, a clear skip, larger text); they gave the lowest ease score of any lens.
- They came for facts and tone and found them: the Opal Clock card and the 1904 subway in the newspaper (ron, ellen, millie), the radiator's heat-season rule (millie), the 9/11 memorial (angie).
- They'd return for people and places from their own lives: angie if her daughter is on, ellen if someone else is on and "to look for Bellevue", millie only with the Bronx.

## 8. Bugs and UX defects

Severity: **blocker** stops the session with no way around it; **major** caused an exit, blocked a task someone came to do, or hurts safety or trust; **minor** is friction with a workaround; **polish** is cosmetic. No blockers were seen in round 2. Status: **verified in code** (already confirmed, or confirmed by my code check), **plausible** (consistent reports, not yet confirmed), **test artifact**.

| # | Issue | Where | People | Who | Severity | Status |
|---|---|---|---|---|---|---|
| 1 | Toolbar icons have no labels until hover; guessed clicks walk the avatar | Bottom bar | 13 | millie, jiwoo, tyler, maya, tunde, angie, priya, kayla, nora, chloe, diego, ron, ellen | major | plausible |
| 2 | Swipe speed window narrow for trackpads and slow hands; unclear guidance. 9 failed twice or more: jiwoo, gabi, darnell, linda, wei, priya, aiko, ellen, ron | MetroCard intro | 14 | millie, jiwoo, gabi, maya, lukas, angie, linda, wei, priya, aiko, kayla, nora, ron, ellen | major | verified in code (first fail is by design); later fails plausible |
| 3 | Rosa's welcome card pops over the first click or the scene; tutorials back to back | Times Square arrival | 7 | tyler, linda, priya, gabi, tunde, kayla, ron | minor | plausible |
| 4 | "Join the Dance Jam" gives no confirmation, so it looks broken. darnell, angie and tunde clicked it; lukas, ron and ellen never understood the banner | Times Square | 6 | darnell, angie, tunde, lukas, ron, ellen | major | verified in code (works, no confirmation) |
| 5 | Real players and city locals look alike until clicked | All rooms | 6 | millie, gabi, priya, chloe, frank, billie | major | plausible |
| 6 | Chat gives no sign of who can hear you (unanswered lines in empty rooms) | Chat | 6 | millie, maya, darnell, tunde, wei, ellen | major | plausible (server: all six lines were typed in rooms with no other real player) |
| 7 | "Use a Photo" selfie is the first option, with no word on where the photo goes | Character creator | 7 | frank, kevin, linda, millie, marcus, lukas, aiko | major | plausible (design); used by 0 of 24 |
| 8 | Age gate is a self-declared checkbox | Name step | 3 | frank, kevin, linda | major | plausible (design) |
| 9 | Filter passed "whats your real name and what school do you go to" | Chat, Times Square | 2 | frank, billie | major | plausible (server chat log shows it unfiltered; billie and diego were in the room) |
| 10 | Clicking a player or door you stand on opens your own card or wardrobe; Escape does not close it | Times Square, the Met | 2 | kevin, lukas | major | plausible (also in round 1, primed) |
| 11 | Carb-Jitsu shows no running tally; the 3-boroughs rule is only in the pre-game text | Joe's Pizza | 1 | jiwoo | major | plausible (server logs her match at 95 s, the others 30 to 50 s) |
| 12 | Map click lands somewhere else (Central Park to the Empire State; One WTC tower to Wall Street); labels only on hover | Island map, One World Trade | 2 | maya, priya | major | checked in code: labels are hover-only; Empire State cut-out overlaps Central Park's edge (plausible); the Oculus is an exit to Wall Street (verified) |
| 13 | "Take a Walk" did not tick | Quest panel | 4 | angie, billie, ron, lukas | minor | verified in code (only empty-ground clicks count) |
| 14 | Coin balance jumps on a small purchase with no toast | Shops, carts | 3 | chloe, diego, wei | polish | verified in code (level-up reward lands at the same moment) |
| 15 | "Show Me" does not clearly point at the target | Quest panel | 2 | marcus, wei | minor | plausible |
| 16 | "Save My Card" purpose unclear (fear it asks for email) | MetroCard intro | 4 | gabi, angie, chloe, marcus | polish | plausible |
| 17 | Surprise Me gives a mismatched look; no clothes in the creator | Character creator | 4 | darnell, angie, ellen, diego | minor | plausible |
| 18 | Skip Intro is small and easy to miss | MetroCard intro | 3 | darnell, ellen, millie | minor | plausible |
| 19 | Hard words for B1/A2 readers ("Waddle", "super", "boiler", "Day-Tripper", Roman numerals) | Throughout | 2 | gabi, aiko | minor | plausible |
| 20 | Small text, no text-size setting, welcome box fades over a moving crowd | Creator, Times Square | 2 | ron, ellen | minor | plausible |
| 21 | No keyboard movement and no hint that it is click-to-walk | Movement | 2 | tyler, darnell | minor | plausible (design) |
| 22 | Decorate tray covers half the room; items spawn at your feet; catalog reopens | Apartment | 2 | chloe, diego | minor | plausible |
| 23 | Subway diagram disagrees with itself (legend, tooltips, the 7) | Subway map | 2 | sam, wei | minor | plausible |
| 24 | Cookie banner covers Play Now on first load | Landing page | 2 | darnell, aiko | polish | plausible |
| 25 | Carb-Jitsu lobby: Ready toggled off, host "Reconnecting...", countdown stopped | Joe's Pizza | 1 | billie | minor | plausible (the host, kayla, closed her tab that minute) |
| 26 | Slice Factory: sauce bar unclear, belt fast, sandwich board looks like the job | Joe's Pizza | 1 | marcus | minor | plausible |
| 27 | Brooklyn Bridge right-edge arrow looks like an exit and does nothing | Brooklyn Bridge | 1 | darnell | minor | verified in code (no right-hand exit) |
| 28 | "How to Play" reopens Rosa, not the controls | Phone menu | 1 | tyler | minor | plausible |
| 29 | Quest card points back to Times Square with no way there | Quest panel | 1 | nora | minor | plausible |
| 30 | Skin choice lost when "That's Me" advanced | Character creator | 1 | ellen | minor | plausible |
| 31 | Landed in the apartment after Rosa's "Let's Go!" with no explanation | Tour | 1 | ellen | minor | plausible |
| 32 | Taxi click shows no response | Times Square | 1 | gabi | polish | checked in code: Hail a Taxi honks, then opens the map; her first click met Rosa's card |
| 33 | Welcome-gift task ticked without visiting the cart | Quest panel | 1 | chloe | polish | plausible |
| 34 | "Their Style" items look clickable and are dead ends | Player card | 1 | kayla | polish | plausible |
| 35 | Face tab thumbnails look identical | Character creator | 1 | kayla | polish | plausible |
| 36 | Souvenir shop exit door sits on the walking path | I ♥ NY Souvenirs | 1 | wei | polish | plausible |
| 37 | Mid-game notification with a Go button you cannot use | Carb-Jitsu | 1 | jiwoo | polish | plausible |
| 38 | Grand Central ceiling hard to hit (sam opened it, nora could not) | Grand Central | 1 | nora | polish | plausible |
| 39 | Mail badge "1" and "2" with no visible reason | HUD | 1 | aiko | polish | plausible |
| 40 | "Snap!" pause with nothing saying wait | Photo booth | 1 | ellen | polish | plausible |

**Test artifacts (not counted as game bugs)**

- Showtime score stays at 0 (priya): test artifact, verify on a real browser.
- "[CONTACT EMAIL]" placeholder on the Safety section (frank): test artifact (unset in the private test city; set in production).
- Share text copies a localhost URL (billie): test artifact (local build); check the production link.
- "unknown agent" cutoffs (ron, diego, ellen): test artifact (tool glitch; all three resumed).
- kevin's session logged 12 console errors; all 12 are landing-page video clips aborted as he navigated (`net::ERR_ABORTED` in his `errors.log`), not gameplay errors. The server logged no client errors.

> **Round 1, primed (not counted).** Issues the blind round did not reach: the game types lines into the player's own speech bubble ("Thanks, Sal! Wearing it right now. 🎁", seen by millie, angie, billie and gabi; millie: "don't put words in my mouth"); shop items and a second click on Sal's cart buy instantly with no confirm (millie, nora, billie, gabi); chat cuts messages at 120 characters with no counter (angie, billie, gabi); accents are silently stripped from names, "pãodequeijo" becoming "podequeijo", and joined emoji break (gabi); friend "Accept" clicks get lost when notices swap (gabi, nora); "Show Me" teleports you mid-conversation (billie); a team is assigned without a choice (gabi); the Dance Jam toast says "1 dancers" (gabi). Clicking a player standing on you opens your own card (millie, angie, billie) is the same defect kevin and lukas hit in round 2.

## 9. Safety and trust

### What the two parents and the teacher found

- **They went to Safety first.** frank, kevin and linda all read the Safety section before pressing Play; kevin also read the FAQ.
- **What reassured them.** Report, Block and Mute are one click on any player (frank). A phone number typed into chat became "[removed]" at once (kevin, and ron saw it too: "That was reassuring."). "Nothing to buy, coins can't be bought or sold" is "the line a parent wants" (kevin). No email is needed, and an account can be deleted (kevin).
- **What worried them.**
  - The 13+ gate is a self-declared checkbox (all three).
  - "Use a Photo" is the first option, with no word on where the selfie goes (all three, plus millie, marcus, lukas and aiko). Nobody in the panel used it.
  - Open chat with strangers (frank, linda), and a Discord link on a page for 13-year-olds (frank, kevin, linda).
  - The filter let frank's test line, "hey whats your real name and what school do you go to", through unchanged; the server chat log shows it as typed. billie and diego (15 on his card) were in Times Square when it posted, and billie noticed: "Alarming for a new player."
  - kevin could not verify Report: clicking the only other real player opened his own wardrobe, and Escape did not close it. The server logged 0 reports in the whole round.
  - Nothing addresses parents: who runs the game, what is logged, whether chat can be limited (frank, kevin), and "[CONTACT EMAIL]" sat on the Safety section (a test artifact here; worth confirming it is filled in on production, since it is the line a worried parent reads).
  - Locals and real players look alike until clicked (frank: "Unclear who I am talking to.").
- **Verdicts.** frank: "She can play with me sitting next to her, not alone yet." (recommend 4). linda: "I would not put a class on it as is." (recommend 4 for classroom use). kevin: "Safety story is decent; I'd let son play but want a parent page." (recommend 7).
- **What would flip them.** frank: "Chat limited to friends or preset phrases for new accounts, with a parent toggle." kevin: "A clear Parents page, and a visible Report/Block button when I click another player." linda: "A classroom or teacher mode (invite code, chat off or restricted to preset phrases, a list of landmarks visited, and facts a student can read)."

### Everyone else

- **Trust earned by tone and honesty.** angie: the 9/11 memorial, "quiet, factual, no jokes", is "what made me trust the place", and "nothing asked for money, email or a photo". marcus liked that locals are labelled "City local · computer-run". The landing line "Coins are earned in the game, never bought" was noticed by jiwoo, tunde, lukas and ron.
- **Privacy caution everywhere.** All 24 declined analytics cookies and nobody used "Use a Photo"; gabi and angie avoided "Save My Card" in case it asked for an email.
- **Can't tell who is real.** 6 people (millie, gabi, priya, chloe, frank, billie) said they couldn't tell players from locals, which matters for safety as much as for fun.

> **Round 1, primed (not counted).** Trust issues the blind round did not reach: the game posting lines in the player's own voice, purchases with no confirm, the silent 120-character chat cut, and a team assigned without asking (see section 8). gabi also noticed her photo strip footer carried a join link with her name on it.

## 10. Quotes

1. "That was the moment I thought the people who made this have lived there." (**marcus**, on the turnstile)
2. "Everything I clicked was a fact popup that I read and dismissed with "Got It"." (**millie**)
3. "Click-to-walk, no WASD, every object is a text popup. Nothing to get good at." (**tyler**, exit line)
4. "nobody real talked back, no brooklyn, took forever to start, feels like a little-kid game with nothing to actually play yet" (**darnell**, exit line)
5. "As a lonely person, a stranger answering and then wanting to be friends hit hard." (**billie**, on diego answering "anyone from queens?")
6. "It is the visitor's New York. A resident would not spend an afternoon in Times Square." (**tunde**)
7. "The 9/11 Memorial: quiet, factual, no jokes, a white rose. This is what made me trust the place." (**angie**)
8. "She can play with me sitting next to her, not alone yet." (**frank**, exit line)
9. "Halal cart game was fun, rest felt like clicking shops for coins and nobody talks back." (**wei**, exit line)
10. "Too much English now, I will come back later." (**aiko**, exit line)
11. "It took me about 60 actions to stumble on Carb-Jitsu, and I only found it because the notice made me look at Joe's Pizza." (**diego**)
12. "It's really cute and pretty, but I ran out of things I care about: only a few outfit pieces, no shop, and I lost to a bot." (**kayla**, exit line)
13. "ok the turnstile part is so us 😭 'please swipe again' i cant. we need central park added tho" (**maya**, the message she would send)
14. "A one-sentence reason to be here ("what do I do in this game?")." (**priya**)
15. "A cartoon NYC game that gets the details right." (**nora**, the message she would send)

## 11. What this round can't tell us

- **These are agents, not people.** Each played a card, so reactions are plausible inferences, not observed behaviour. Most scores sit between 5 and 8, and 22 of 24 said "maybe" to tomorrow: read the direction, not the size.
- **Nothing about retention.** One session each; "come back tomorrow" is stated intent. There is no day-two data, no habit loop tested, and no economy over time.
- **Speed and hands are simulated.** Agents act through screenshots and a controller, the brief assumes about six actions a minute, and fast games ran frozen between moves. The swipe's difficulty for slow hands, Halal Rush's pace and Showtime (which could not score in the test browser) need real people on real machines.
- **No sound.** Agents only read a list of sound effects that fired, so music and audio feedback are untested.
- **A thin, artificial population.** About six players at once, all strangers, all agents, spread across 14 rooms; only one friendship formed. The low population is a real risk, but the round can't say how the game feels with friends who arrive together, which is what 7 people said would bring them back.
- **Discovery is probably understated.** Agents hover deliberately and read every label; a casual player may hover less, so unlabelled icons and hover-only map names likely cost more than they did here.
- **Large parts of the city went untested.** 16 of 30 rooms were never visited, nobody played Rush Hour Run or Citi Bike Dash, only three jobs were started (none logged a score) and all four Carb-Jitsu matches were against a city local.
- **Language and age are role-played.** gabi (B1) and aiko (A2 to B1) read through a model that reads English perfectly, and ron's "large text setting" was never applied in the browser. Their struggles are estimates; test with real non-native and older players.
- **The safety probes were two typed lines.** One miss and one catch is an anecdote, not an evaluation of the filter.
- **Self-reports are loose.** Some interviews contradict themselves (maya and angie give different swipe counts in two sections; marcus estimates about 80 actions where the sim counted 65 active ones), so numbers here come from `summary.json` where possible.
- **Cookie and privacy choices are not opt-in rates.** All 24 chose Necessary Only; real visitors will differ.
- **A designed panel, not a market sample.** The 24 were chosen to cover lenses (five natives, four internationals, three parents and teachers and so on), many with strong New York ties. Counts show what came up and how often in this panel, not how common it is among real players. Desktop only: nobody tried a phone, though gabi asked for one.
