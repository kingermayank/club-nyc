# Multiplayer mini-games

Club NYC's job games are solo. These three are for playing *with each other*: two to nine New Yorkers, usually friends arriving from the same Discord server, in rounds of one to two minutes, with a rematch one click away.

| Game | Players | Round | Where it lives |
|---|---|---|---|
| **High Line Citi Bike Dash** (game id `sled`) | 2-4 (city locals fill empty bikes) | 45-60 s | a signpost on the High Line |
| **Rush Hour Run** | 2-9 (locals fill to 6) | until the last runner is out, at most about 105 s | a chalkboard on the Times Sq–42 St platform |
| **Carb-Jitsu** | 1v1, up to 6 at a table (Winner Stays On) | 1-2 min | a chalkboard by the window table at Joe's Pizza |

Everything is joinable from anywhere: the **Games** tab in the Community panel (F), a 4-letter code read out on voice chat, a link pasted in Discord (`/play?lobby=K7QX`), or an invite notice from a friend.

---

## 1. Research

Sources were read in October 2026. Club Penguin facts come mostly from the fan-run Club Penguin Wiki, so treat them as community-documented.

### Arena Kingdoms (Captain.tv)
- An auto-battler built as a Discord Activity. You prepared a party alone (a "Gauntlet" against other players' saved teams), then entered **Arenas that started on a fixed clock** (Quick Match every 10 minutes) and watched the fights. Later rounds paired you with players on a similar win count. Each Discord server was a "House" with weekly standings and a bonus for showing up with 3+ members. ([docs](https://captaintv.gitbook.io/arena-kingdoms), [a16z](https://a16z.com/discord-activities-social-gaming/))
- **It shut down in April 2025**: the studio said it had only a few thousand players. Lesson: borrow the social mechanics (server pride, matches that start without a host, daily caps), not the many-currencies progression.

### Club Penguin's multiplayer games
- **Sled Racing**: four runs at the Ski Hill with fixed seats (2, 2, 3 and 4 players). You sat on a run and the race started the moment every seat was full. Arrow keys on a **diagonal hill**: Up or Right steered to the penguin's left, Down or Left to its right. Rocks, logs with a gap, bumps that slow you, ice that speeds you up. **A crash costs time, nobody is eliminated.** Coins 20 / 10 / 5 / 5. Tracks were built from 25 reusable segments. No stamps. ([wiki](https://clubpenguin.fandom.com/wiki/Sled_Racing))
- **Card-Jitsu**: Fire beats Snow beats Water beats Fire; same element, higher number wins; 6 colours; win with three of one element in three colours, or one of each element in three colours. Hidden simultaneous picks with a timer; power cards that bend the next round. 2-seat mats in the Dojo plus Sensei as an instant opponent. ([wiki](https://clubpenguin.fandom.com/wiki/Card-Jitsu))
- **Find Four, Mancala, Treasure Hunt, Ice Hockey**: the lobby is a *physical seat in a social room*, click to spectate, the game starts when the seats fill, an NPC is the fallback opponent.

### Discord Activities
- **Chess in the Park** (open or code-locked tables, unlimited spectators), **Putt Party** (everyone plays at once, extras queue for the next round, vote the next course), **Bobble League** (spectators, private or public matchmaking), **Land-io** (5-minute matches), **Sketch Heads / Gartic Phone** (host picks the mode), **Know What I Meme** (1-9 plus bots; spectators join the next game), **Poker Night** (seats plus spectators, host-set turn timer). ([Discord app FAQs](https://support-apps.discord.com/hc/en-us/articles/26593412574359-How-to-Use-Apps))
- Discord's own [Activities design guide](https://docs.discord.com/developers/activities/design-patterns): make it fun alone and better with friends; expect people to join mid-game (let them watch, then seat them); simple controls, rules as text (not everyone is on voice); show who's present and idle; prompt invites when they're needed; no login wall early on.

### Party games
- **Jackbox**: join with a room code, the first in is the host, late arrivals become an audience; one clear task at a time.
- **Among Us**: "Play Again" returns everyone to the same lobby; the host can kick; dead players keep playing as ghosts.
- **Fall Guys**: short rounds, most people qualify, eliminated players spectate their party.
- **Catch-up**: rubber-banding should add choices for the people behind, not punish the leader automatically ([Game Developer on Runbow](https://www.gamedeveloper.com/design/designing-for-local-hordes-problems-and-solutions-for-9-player-design-in-runbow)).
- **Subway Surfers** (what to steer clear of): running on train tracks, a guard and dog chasing you, the hoverboard, its power-up names and its leader-hitting race items.

### What we took from it
1. A game is a **place and a link**: every lobby has a 4-letter code (no 0/O/1/I/L, so it survives voice chat) and a `/play?lobby=CODE` link.
2. **Works alone, better together**: city locals fill seats, so nobody waits on an empty lobby.
3. **Late arrivals watch, then get a seat**; leaving costs nothing; the host role passes on.
4. **One-click rematch** back into the same lobby; the results screen never yanks you into the next round.
5. **Arrow keys plus one button**, rules on screen next to the action.
6. **Readable with 9 players**: a colour and a face per player, one big place readout, a progress strip.
7. **Catch-up that adds choices**: slipstreams for whoever's behind (sled and runner); people who are out heckle instead of waiting.
8. **Moderatable inputs**: reactions and preset phrases in lobbies instead of free text.
9. **Crashes cost time, not the race** (CP's sled racing) where it's a race; elimination only where "last one standing" is the point.

---

## 2. Brainstorm: NYC games

| Concept | Players | Why it fits New York (and Club NYC) | Verdict |
|---|---|---|---|
| **Pilgrim Hill Sled Race**: CP Sled Racing on Central Park's real sledding hill | 2-4 | New Yorkers really sled Pilgrim Hill (East 72nd St, under the 1885 Pilgrim statue). The CP game the user named. | **Built, then re-themed** as the High Line Citi Bike Dash (no snow in the city); same engine |
| **Rush Hour Run**: a three-lane platform sprint downtown on the 1 | 2-9 | Rush hour is the most universal NYC experience; station signs from Times Sq to South Ferry are the race's progress bar. | **Built** |
| **Carb-Jitsu**: Card-Jitsu with Pizza > Pretzel > Bagel > Pizza, boroughs as colours | 1v1, Winner Stays On | Every New Yorker has an opinion about bagels; a table at Joe's Pizza is the Dojo; the bodega cat is the Sensei. Turn-based, so it's latency-proof. | **Built** |
| **Stand Clear!**: musical chairs on a subway car; when the doors chime, grab a seat | 2-9 | "Seat on the train at rush hour" is the funniest NYC competition there is. Perfect party elimination format. | Next: reuses the room engine (walking, seats) |
| **Great Lawn Snowball Fight**: Uptown vs Downtown teams | 4-8 | The city already has snowballs (off-season now) and neighbourhood teams. | Later: needs fair hit registration for aiming |
| **Taxi Tag / Yellow Cab Rally**: top-down cabs racing for fares on the grid | 2-6 | The grid, the cabs, the honking. | Later: a third race felt like too much racing |
| **Stoop Four**: Find Four on a brownstone stoop | 1v1 | A CP classic in a Brooklyn-stoop costume; trivial to build. | Easy add-on for a quiet table |

---

## 3. The games

### High Line Citi Bike Dash

The CP Sled Racing homage, moved off Pilgrim Hill when there was no snow to race on: the same engine, re-themed. Seen from above, the High Line runs diagonally down to the bottom right; 2-4 New Yorkers on blue Citi Bikes (their own avatar on the saddle, a pennant in their colour on the back) ride it south to north, from the start line at Gansevoort St to the finish at 34th St and Hudson Yards (the Vessel stands past the line). Street signs count off the blocks (`streetW()` in `shared/sled.ts` maps a street to a distance), 10th and 11th Avenues run below the railings with traffic (10th Ave northbound, 11th southbound), rooftops and water towers beyond. The running joke: bikes aren't allowed on the High Line, and a park ranger at Gansevoort St blows a whistle at GO ("Hey! No bikes up here!").

**Ids stay `sled`**: the game id, the stamps (`sled-race`, `sled-win`), the leaderboards and every saved `mp_matches` / `mp_results` row, so best times and wins carry over. Only names, art, the course and the copy changed. The Help Center's old `/help/multiplayer-games/sled-race` redirects to `/help/multiplayer-games/citi-bike-dash` (`server/src/index.ts`).

- **Controls**: ↑ / → steer to the up-right side of the path, ↓ / ← to the down-left side (CP's mapping). **Space** hops over small things (pigeons, old rails, selfie sticks) with a short cooldown.
- **The course** is built from a seed out of segment types, like CP's track pieces. Four are always where they really are, south to north: **The Sundeck** at 14th-15th St (slalom between the rolling loungers; the thin water feature is just a splash), the **Chelsea Market Passage** (the narrows: café tables on both sides slow you; a shade overhead, brick piers and a CHELSEA MARKET lintel), **10th Ave Square** at 17th St (a line of selfie-takers across the path with one gap; the amphitheater steps and the big window over 10th Ave beside it) and **The Spur** at 30th St (somebody left a plywood ramp). The rest are random, each once before any repeats: **Tour Group** (tourists stopped for a photo and the park ranger to steer round, pigeons to hop), **The Planters** (a row of concrete planters with one gap), **Old Rail Tracks** (bits of the freight line to hop or weave), **Fresh Pavement** (free speed), **Runaway Gelato Cart** (swinging across the path, ringing its bell) and **Birch Grove**. Orange cones mark the edges; a banner says what's coming ("The Planters · Aim for the gap in the planters").
- **Segment mapping from the sled days** (internal keys unchanged): scatter → Tour Group, logs → The Planters, slalom → The Sundeck, moguls → Old Rail Tracks, ice → Fresh Pavement, cart → Runaway Gelato Cart, ramp → The Spur, pines → Birch Grove, snowmen → 10th Ave Square, narrows → Chelsea Market Passage, warmup → Gansevoort St, finish → Hudson Yards.
- **Speed**: your bike keeps you at cruising speed. **Iced coffee** boosts you (some hover in the air after the ramp); **fresh pavement** is free speed; the **planting beds** off the path and the café tables slow you; rails and selfie lines slow you; tourists, the ranger, loungers, birches, planters, pigeons and the cart make you **wipe out** (about a second, then you're off again). Never eliminated.
- **Catch-up**: a **slipstream** right behind another rider; a small **tailwind** (off the Hudson) if you fall far behind the leader.
- **Winning**: first to 34th St. Once someone finishes, the rest have 20 s; anyone still riding is "Didn't finish" (places by how far they got).
- **Modes**: Free-for-All, or **Uptown vs Downtown** teams (points by place; pennants in team colours).
- **Best score** on the board: your fastest time.

### Rush Hour Run

An original three-lane runner on the platform, not the tracks: commuters, turnstile banks, wet-floor signs, mop buckets, trash cans, benches, low station signs, a mattress delivery, and Pizza Rat. Station mosaics go by every 100 m on the 1 line downtown; last stop South Ferry.

- **Controls**: ← → switch lanes, ↑ jump, ↓ slide (↓ in the air drops you into a slide).
- **Everyone runs the same course at the same pace** (speed rises with the race clock), so nobody is faster by default. You lose ground by stumbling and gain it with **Express diamonds** (3 s of smashing through anything) or by running in someone's **slipstream** (same lane, just behind). The **bodega cat** pulls MetroCards to you for 7 s.
- **One bump is a stumble; a second within 6 s and you're out.** Last one standing wins (by distance; anyone who reaches South Ferry wins by time).
- **Heckling instead of waiting**: once you're out you watch (← → to pick who), and you get **two Showtime dancers** to send into a lane (1 2 3) ahead of whoever you're watching. A dancer is always dodgeable: switch lanes or slide under the swinging legs. Only the runner it was sent at bumps into it.
- **Modes**: Free-for-All or Uptown vs Downtown.
- **Best score**: your farthest run in metres.

### Carb-Jitsu

The back table of Joe's Pizza, the bodega cat presiding.

- **Pizza beats Pretzel** (it's a whole meal). **Pretzel beats Bagel** (knots beat holes). **Bagel beats Pizza** (breakfast comes first). Same food: the higher number (2-12) wins; equal is a tie.
- Both players pick from a hand of 5 within **15 s** (click, or 1-5); the clock picks for you if you don't. Cards flip together; the winner keeps the card on their tray.
- **Win** with three of one food from three different **boroughs** (the card colours: Manhattan, Brooklyn, Queens, The Bronx, Staten Island), or one of each food from three boroughs.
- **Specials** count only if their card wins: **Rent Control** (next round the lower number wins), **Rent Hike** (their next card is worth 3 less), **Tow Truck** (tows one of their tray cards from the same borough).
- **Winner Stays On**: up to 6 at a table; the winner keeps the seat, the next in line plays them, and the others watch. Alone, a city local sits down.
- Letting the clock play 4 rounds in a row, or staying disconnected for 30 s, forfeits. **Best score**: your longest win streak at one table.

---

## 4. Lobbies, leaving and coming back

- **Quick Match** drops you into an open public lobby for that game (one with your friends first, then the busiest), or opens one. It starts on its own: 15 s once someone else is in, 25 s if you're alone (locals fill in). Everyone ready starts it right away.
- **Create Lobby** opens an invite-only lobby; you're the host: Free-for-All or Uptown vs Downtown, city locals on/off, public or invite only, Start, and Remove for trolls. If the host leaves, the longest-seated player takes over.
- **Ready** shows who's set; the big button always says what it does (Start Race, Ready, Play Again, Take a Seat). **Enter** presses it.
- **Leave** is always on screen; **Escape** leaves a lobby, asks before leaving a race (Escape again leaves, Enter keeps playing), and closes any sub-panel first. **Hide** keeps your seat and shrinks the lobby to a chip at the top of the city so you can keep walking around; it pops back up when your round starts.
- **After a match** everyone who played is "reading the results" and sits out the next round until they press **Play Again**, so nobody gets pulled into a race mid-read. Watchers who wanted in get the free seats. Seats nobody comes back to are given up after 75 s.
- **Late arrivals** (by code, link or Quick Match into a running lobby) watch the round and are seated for the next one.
- **Disconnects**: a dropped connection keeps your seat for 25 s in a lobby; mid-race you have 12 s to come back before you're out of that round; a Citi Bike Dash rider who reloads picks up where the server last saw them; a runner who reloads watches (no save-scumming a crash).
- **Reactions and phrases** (👋 🔥 😂 👏 😮 ❤️, "GG!", "One more?", "So close!"…) pop over a seat or a racer: nothing to type, nothing to moderate.

## 5. Results, leaderboards, XP, coins, stamps

- **The server decides everything**: places, scores, who won. Races are latency tolerant: everyone gets the same seed, each browser simulates its own racer and reports progress ~10 times a second; the server clamps anything faster than physically possible (`sledMaxDistance` / `runMaxDistance`), keeps racers on the course and decides the finish order (each racer's own clock, clamped to what the server saw). A run with more than a few impossible reports doesn't count. Carb-Jitsu runs entirely on the server (each player only ever receives their own hand).
- **mp_matches / mp_results** (schema v11) get a row per match and per real player. Locals race but never get rows. A player who left early, or a match shorter than the game's minimum (25 s Citi Bike Dash, 15 s runner, 12 s Carb-Jitsu), gets no row and no prize, and the results screen says so.
- **Leaderboards** (`GET /api/mp/board/:game?period=week|all&by=wins|best&scope=friends`): wins and best score, this week (resets Monday) or all time, everyone or just friends. Shown inside each game (a Leaderboard button in the lobby, the top 5 this week on the results screen, the full board one click away) and from the Games tab. A win only counts against a real New Yorker; best scores count always.
- **XP**: `awardXp(userId, 'mp-game', { amount: mpXp(place, players), ref: matchId })`, once per match. 20 for playing; the podium gets more when there are rivals (1st +30, 2nd +15, 3rd +5); a winning team counts as 1st. The HUD's level chip updates from the push; the results screen shows the gain and your progress to the next level.
- **Coins**: `payMatch()` in `server/src/economy.ts`, decided by the server, once per match (the ledger's unique ref), within **300 coins a day** from games (`MP_DAILY_COINS`). Against real players: 20 / 12 / 8 / 5…; teams 15 winners / 6 others; Carb-Jitsu 15 win / 5 loss; against only locals 8 / 4 (Carb-Jitsu 6 / 3).
- **Stamps** (worth XP once each): Game On (first game), Bragging Rights (a win against a real New Yorker), Full House (4+ real players), Gansevoort to 34th (finish a Citi Bike Dash; id `sled-race`), Top of the Line (win one against real people; id `sled-win`), Stand Clear (first run), Last Stop (reach South Ferry), Carb Loading (first duel), Table Boss (3 wins in a row at one table).
- **Social**: Add Friend (or Accept) on everyone in a lobby and on the results (friend requests and invites show up even while you sit in a lobby); Invite sends online friends a notice with Join; Copy Link copies "Join my Citi Bike Dash in Club NYC: <link> (code K7QX)"; Copy Result copies a brag with the lobby link. In production a pasted `/play?lobby=CODE` unfurls in Discord as "Ana invited you to High Line Citi Bike Dash · 2 of 4 seats taken" with the game's art (`server/src/index.ts`, `lobbyPreview()`).

## 6. Where things live

| Piece | Files |
|---|---|
| Shared rules (game and server) | `app/src/mp/shared/`: `games.ts` (catalog, prizes, codes), `protocol.ts` (messages), `sled.ts`, `runner.ts`, `carbs.ts` (courses, physics, the locals' brains), `rng.ts` |
| Server | `server/src/game/mp/`: `index.ts` (lobbies, quick match, invites, rate limits, the 10 Hz clock), `race.ts`, `duel.ts`, `results.ts` (rows, XP, coins, boards), `api.ts` (`/api/mp/*`); hooks in `realtime.ts` (3 lines) and `index.ts` (the API route and the `/play?lobby=` link preview); `payMatch` in `economy.ts` |
| Client | `app/src/mp/`: `index.ts` (boot, deep links, stamps), `controller.ts` (screens and events), `shell.ts`, `lobby.ts`, `results.ts`, `board.ts`, `hub.ts` (Games tab, game cards), `spots.ts` (signs), `social.ts`, `sprites.ts`, `sound.ts`, `games/sled.ts`, `games/runner.ts`, `games/carbs.ts` |
| Art | `app/public/art/mp/`: three title scenes and sprite sheets from Higgsfield (`gpt_image_2_5`, references: our High Line, subway and pizzeria rooms and the earlier sprites), food and animal art sliced from the game's own icon sources. The Citi Bike Dash's sprites are `bike-*.png` (cut out of flat-magenta sheets in `art/raw/mp-bike-sprites-*.png`; the ranger from `art/raw/mp-bike-ranger.png`, drawn in the avatars' style), the title card `bike-title.jpg`; the path, beds, railings, avenues, planters, ramp, café tables and street signs are drawn in code. The bike is drawn twice around its rider: whole, then its front (handlebars, basket, front wheel) clipped over the rider's legs (`BIKE_FRONT` in `games/sled.ts`). The old sled art is archived in `art/raw/old-sled/` |
| Tests | `tools/mpgames_test.py` (three browsers, end to end) |

Rate limits per player: lobby actions 3/s (burst 10), race progress and picks 16/s, reactions 1/s, invites one every 2 s and once per friend per 30 s; plus the socket's own 30 messages/s.

## 7. Testing

```bash
.venv/bin/python tools/mpgames_test.py            # its own frozen private stack (immune to edits while it runs)
.venv/bin/python tools/mpgames_test.py http://localhost:5211 [--quick] [--audit]
```
Three players sign up through the real UI and play a Citi Bike Dash (code join, Add Friend in the lobby, locals filling seats), a Rush Hour Run in teams (an invite notice, a `/play?lobby=` link, Showtime heckling) and a Carb-Jitsu duel (Quick Match, Winner Stays On); it checks results, the boards (weekly, all time, friends), XP, coins, stamps, Hide, Leave and Escape. Screenshots: `tools/out/mpgames-*.png`.

- In the run, two players steer like real newcomers would (the Citi Bike Dash; it has the same dev-only autopilot as the runner) and two run on the runner's **dev-only autopilot** (`window.clubNycMp.autopilot = true`, the same lane-picking the city locals use; it does nothing in production builds), while the third goes out early and heckles with a Showtime dancer.
- `--audit` runs `tools/pixel_audit.py`'s measurements on every screen the test visits (the main audit doesn't reach the games' screens) and lists what it finds in the games' own UI. Overlapping faces on the race progress strips are expected: racers who are level share a spot.

## 8. Not done yet / next

- **Stand Clear!** (subway musical chairs) as a fourth, room-based party game.
- **Discord server pride** (Arena Kingdoms' Houses): a weekly board per Discord server needs Discord sign-in data we don't store yet.
- Lobbies live in one server process's memory (like rooms); with several processes they move to Redis with the room instances (see `docs/multiplayer.md`).
- Cosmetic bikes and pennants as rewards for the Citi Bike Dash stamps.
