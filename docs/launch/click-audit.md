# Click audit

Generated 2026-10-17 11:12:53 by `tools/click_audit.py` in 8 min 21 s on a frozen copy of the code taken 2026-10-17 11:04:32 (newest source change 2026-10-17 11:03:17).
Re-run: `.venv/bin/python tools/click_audit.py` (add `--rooms soho,pizza` or `--only rooms,hud` to narrow it). Raw results: `tools/out/click-audit.json`; screenshots of problems: `tools/out/click-audit/`.

## Summary

- **944** interactions checked, **5** problems (dead, broken or unreachable), **28** dead-ish (coming soon, sound only, disabled without a reason, places you can't go).
- 5 DEAD/unreachable/wrong and 0 ERROR items are listed below with how to reproduce them and the suspected code (line numbers are from the snapshot).
- Note: Rosa’s tour showed 13 cards; tour.ts defines 13 (steps whose target isn’t on screen are dropped silently).

## DEAD and ERROR items

| # | Where | What | Result | What happened | How to reproduce | Suspected code |
|---|---|---|---|---|---|---|
| 11 | onboarding | welcome gift | BLOCKED | a player can’t click it: Locator.click: Timeout 8000ms exceeded. Call log: - waiting for locator(".le-row").last.locator(".le-opt").first ; local-speech: BigAppleAbby: Have you tried the halal cart on 57th? | creator |  |
| 806 | room:parade | Manhole | UNREACHABLE | covered; covered by .toolbar (273) | goto('parade') → click “Manhole” | app/src/data/rooms.ts:537 |
| 812 | room:parade | 6 Av & W 10 St | UNREACHABLE | covered; covered by .quests (139) | goto('parade') → click “6 Av & W 10 St” | app/src/data/rooms.ts:536 |
| 434 | room:subway | ??? | UNREACHABLE | hover shows '???' instead of '???' at [801, 478] | goto('subway') → click “???” | app/src/data/rooms.ts:277 |
| 124 | room:times-square | Sit | UNREACHABLE (people-in-the-way) | covered by people on all 10 tries over ~10 s (person:BigAppleAbby) | goto('times-square') → click “Sit” |  |

## Dead-ish

| # | Where | What | Why it counts | Evidence | Code |
|---|---|---|---|---|---|
| 943 | rooms | room “liberty-island” | missing | no exit, map pin, subway stop or button the audit clicked leads here (only reachable some other way, or not at all) | app/src/data/rooms.ts:465 |
| 944 | rooms | room “parade” | missing | no exit, map pin, subway stop or button the audit clicked leads here (only reachable some other way, or not at all) | app/src/data/rooms.ts:517 |
| 185 | social | player card: Message | missing | no way to message a player from their card (buttons: ['👋 Wave', '➕ Add Friend', '🏠 Visit their place', '🔇 Mute', '🚫 Block', '🚩 Report']) | app/src/features/playerCard.ts:221 |
| 763 | room:brooklyn-bridge | Brooklyn · DUMBO | coming soon / under construction | toast: 🚧 Brooklyn · DUMBO — under construction. Very New York of it.; sfx: click | app/src/data/rooms.ts:445 |
| 150 | room:coffee | Book Nook (upstairs) | coming soon / under construction | toast: 🚧 Book Nook (upstairs) — under construction. Very New York of it.; sfx: click | app/src/data/rooms.ts:368 |
| 722 | room:grand-central | Ticket Windows · Metro-North | coming soon / under construction | toast: 🚧 Ticket Windows · Metro-North — under construction. Very New York of it.; sfx: click | app/src/data/rooms.ts:242 |
| 679 | room:the-met | Harlem | coming soon / under construction | toast: 🚧 Harlem — under construction. Very New York of it.; sfx: click | app/src/data/rooms.ts:217 |
| 681 | room:the-met | Galleries | coming soon / under construction | toast: 🚧 Galleries — under construction. Very New York of it.; sfx: click | app/src/data/rooms.ts:210 |
| 779 | room:liberty-island | Seagulls | only plays a sound | sfx: click; sfx: squawk | app/src/data/rooms.ts:483 |
| 257 | room:battery-park | Sit | mostly hidden (only a sliver is clickable) | only 1% of it can be clicked; the rest is under hotspot:Bench [sit]; sit: bench-1-1 |  |
| 261 | room:battery-park | Sit | mostly hidden (only a sliver is clickable) | only 4% of it can be clicked; the rest is under hotspot:Bench [sit]; sit: bench-1-2 |  |
| 703 | room:broadway | Sit | mostly hidden (only a sliver is clickable) | only 4% of it can be clicked; the rest is under hotspot:Take a seat [sit]; sit: seat-1 |  |
| 705 | room:broadway | Sit | mostly hidden (only a sliver is clickable) | only 2% of it can be clicked; the rest is under hotspot:Take a seat [sit], person:SubwaySam; sit: seat-4 |  |
| 131 | room:central-park | Sit | mostly hidden (only a sliver is clickable) | only 4% of it can be clicked; the rest is under hotspot:Park Bench [sit]; sit: bench-2 |  |
| 134 | room:central-park | Sit | mostly hidden (only a sliver is clickable) | only 9% of it can be clicked; the rest is under person:DeliDanny, hotspot:Park Bench [sit]; sit: bench-1 |  |
| 211 | room:coffee | Sit | mostly hidden (only a sliver is clickable) | only 15% of it can be clicked; the rest is under hotspot:Armchair [sit], person:KnishKing; sit: armchair |  |
| 215 | room:coffee | Sit | mostly hidden (only a sliver is clickable) | only 3% of it can be clicked; the rest is under hotspot:Table [sit]; sit: table-3-a |  |
| 808 | room:high-line | Sit | mostly hidden (only a sliver is clickable) | only 4% of it can be clicked; the rest is under hotspot:Rolling Loungers [sit], .quests; sit: loungers-3 |  |
| 813 | room:high-line | Sit | mostly hidden (only a sliver is clickable) | only 4% of it can be clicked; the rest is under hotspot:Bench [sit]; sit: bench-2 |  |
| 762 | room:liberty-island | Bench | mostly hidden (only a sliver is clickable) | only 14% of it can be clicked; the rest is under .toolbar, person:GalleryGus; stamp: 🗽 Stamp earned! Lady Liberty | app/src/data/rooms.ts:481 |
| 227 | room:pizza | Sit | mostly hidden (only a sliver is clickable) | only 9% of it can be clicked; the rest is under hotspot:Table [sit]; sit: table-3-b |  |
| 229 | room:pizza | Sit | mostly hidden (only a sliver is clickable) | only 4% of it can be clicked; the rest is under hotspot:Table [sit]; sit: table-4-b |  |
| 724 | room:the-met | Sit | mostly hidden (only a sliver is clickable) | only 3% of it can be clicked; the rest is under hotspot:The Met Steps [sit]; sit: step-5 |  |
| 107 | room:central-park | Duck | mostly hidden (only a sliver is clickable) | only 9% of it can be clicked; the rest is under actor.is-player; speech: AudW1_3dc91: This duck has seen things. | app/src/data/rooms.ts:196 |
| 371 | room:fifth-ave | Steaming Manhole | mostly hidden (only a sliver is clickable) | only 12% of it can be clicked; the rest is under .toolbar, actor.is-player; speech: AudW1_3dc91: Nobody knows where the steam comes from. Nobody asks. | app/src/data/rooms.ts:150 |
| 632 | map | map: Brooklyn · coming soon 🚧 | coming soon / under construction | toast: 🚧 Brooklyn is still under construction. Very New York of it. 🚧; local-speech: CoffeeCarla: Let’s gooo |  |
| 634 | map | map: One World Trade · coming soon 🚧 | coming soon / under construction | toast: 🚧 One World Trade is still under construction. Very New York of it. 🚧; sfx: click |  |
| 713 | room:grand-central | Departures | coming soon / under construction | toast: 🤫 …hello…; speech: AudW2_3dc91: Metro-North to the suburbs is still being built. Very on-brand. | app/src/data/rooms.ts:241 |

## Social edge cases

| Case | Outcome | Detail |
|---|---|---|
| Visit a non-friend’s apartment from their card (open house off) | button shown | card buttons: ['👋 Wave', '➕ Add Friend', '🏠 Visit their place', '🔇 Mute', '🚫 Block', '🚩 Report'] |
| Visit a non-friend’s apartment, door closed (API path) | toast | toast: 🚪 AudB_3dc91’s door is closed — add them as a friend, or wait for an open house. |
| Visit a non-friend’s apartment from their card (open house on) | room | plate: AudB_3dc91’s Apartment Open house 🎉 |
| Friend request (card → notice → Accept) | works | B accept → toast |
| Friend’s card | ok | buttons: ['👋 Wave', '🏠 Visit their place', '🔇 Mute', '🚫 Block', '🚩 Report', 'Unfriend'] |
| “Go” to a friend who is online | room | toast: 🚕 Heading to Chinatown & Little Italy to find AudB_3dc91…; room: chinatown; closed: Community |
| “Find” a friend in the same room | toast | toast: 📍 AudB_3dc91 is right here! 👋; closed: Community |
| Visit a friend’s apartment while they’re home | room — B is there | plate: AudB_3dc91’s Apartment Visiting a friend |
| “Go” to a friend who is at home | room | plate: AudB_3dc91’s Apartment Visiting a friend |
| Join a friend’s house party (invite notice → Go) | room — party is on | speech: AudA_3dc91: Who picked this song?! 🎶; stamp: 🥂 Stamp earned! Plus One |
| Visit a friend’s apartment while they’re out | room | plate: AudB_3dc91’s Apartment Visiting a friend |
| “Go” to a friend who is offline | disabled button with “💤 Offline” in the row | row: AudB_3dc91 Harbor Gulls 💤 Offline Go 🏠; tooltip: None |
| Visit a friend’s apartment while they’re offline | room | plate: AudB_3dc91’s Apartment Visiting a friend |
| Friend comes online → notice → Go | room | toast: 🚕 Heading to Times Square to find AudB_3dc91…; room: times-square |
| Block a player | toast — they disappear | toast: 🚫 Blocked AudB_3dc91 . You won’t see them or their messages.; closed: Block AudB_3dc91? |
| Follow an invite link for an existing name | landed in soho, friends with ['AudB_3dc91'] | toasts: ['💌 You and AudB_3dc91 are friends now! Here’s 50 welcome coins.', '🚕 Heading to SoHo to find AudB_3dc91…'] |
| Follow an invite link for a non-existent name | told on the sign-in screen | sign-in box: 'We couldn’t find “Ghost_3dc91”. The invite link may be mistyped — jump in anyway and look for them in the city.'; ['404 GET /api/invite/Ghost_3dc91']; messages after sign-up: ['🪩 🪩 DANCE JAM! Get to the middle of the plaza and dance (D)', '🎶 CoffeeCarla is dancing — press D to join in! |
| Open /join/(empty) | loads the front door | address bar stays /join/ |
| Open /join/!!! | loads the front door | address bar stays /join/!!! |
| Open /join/x | loads the front door | address bar stays /join/x |
| Open /join/ThisNameIsWayTooLong_123 | loads the front door | address bar stays /join/ThisNameIsWayTooLong_123 |
| Open /join/%F0%9F%8D%95 | loads the front door | address bar stays /join/%F0%9F%8D%95 |
| Open /join/a%20b | loads the front door | address bar stays /join/a%20b |
| Open /join/<script> | loads the front door | address bar stays /join/%3Cscript%3E |
| Open /join/Bob/extra | loads the front door | address bar stays /join/Bob/extra |
| Open /join/..%2F..%2Fapi%2Fme | loads the front door | address bar stays /join/..%2F..%2Fapi%2Fme |
| An existing player opens a friend’s invite link | told | messages: ['💌 You opened AudB_3dc91 ’s invite link. They’re in the city right now! Add friend ✕'] |

## Everything that worked (counts per area)

| Area | Results |
|---|---|
| community | panel-update 12, room 3, noop-expected 1, present 1, closed 1, panel 1, game 1 |
| furniture-catalog | panel-update 31, closed 1 |
| home | sit 7, panel 6, noop-expected 5, toast 3, fx 3, room 1, mode 1, closed 1, toggle 1, speech 1 |
| hotkeys | panel 7, emote 5, tour 1, toast 1, room 1, input 1 |
| house-party | panel-update 10, closed 2, panel 2, fx 1, toast 1 |
| hud | speech 30, panel 14, emote 6, noop-expected 3, tour 2, room 2, toggle 2, toast 1, mode 1, panel-update 1 |
| invite | noop-expected 1, panel-update 1, closed 1 |
| invite-link | present 12 |
| lobby | panel-update 15, game 10, closed 7, panel 1 |
| map | room 14, panel 5, toast 4 |
| newspaper | panel 2, present 1, closed 1 |
| npc-card | room 6, emote 1, toast 1 |
| onboarding | panel-update 16, panel 1, noop-expected 1, download 1, look 1 |
| photo-booth | panel 1, toast 1, closed 1 |
| player-card | panel-update 48, present 3, toggle 1, panel 1, closed 1 |
| quests | tour 18, closed 13, room 5 |
| room | speech 111, panel 76, room 69, sit 45, present 27, fx 21, choice 16, game 7, closed 6, ride 4, toast 3 |
| rooms |  |
| shop:broadway | panel-update 4, closed 1 |
| shop:iloveny | panel-update 16, closed 1 |
| shop:liberty | panel-update 2, closed 1 |
| shop:maison | panel-update 12, closed 1 |
| shop:rink | panel-update 1, closed 1 |
| shop:sneakers | panel-update 9, closed 1 |
| shop:thread | panel-update 13, closed 1 |
| shop:toys | panel-update 12, closed 1 |
| social | room 8, toast 4, panel 3, panel-update 3, choice 2, closed 2, speech 1, fx 1, present 1 |
| stamp-book | panel-update 3, closed 1 |
| streetcheesy | room 12, choice 2, panel 1 |
| subway | ride 11, toast 1 |
| tour | tour 31, closed 2, stamp 1 |

Result classes: `panel` opened a panel, `panel-update` changed the open panel, `choice` a choice menu, `toast`/`notice` a message, `speech` the player spoke, `local-speech` a city local spoke, `room` changed room, `game` a mini-game or its lobby, `ride` subway/ferry/carriage scene, `sit`/`emote`/`look` the avatar reacted, `fx` an effect, `toggle` a control changed state, `tour` a tour card, `download`, `popup`, `closed` a close button closed its panel, `noop-expected` (focusing a text box). Problems: `DEAD` nothing visible, `ERROR` page/console error or HTTP 4xx/5xx, `BLOCKED` covered so a player can’t click it, `UNREACHABLE` hotspot nobody can hover/click, `WRONG` went somewhere else, `MISSING-TARGET` a tour/“Show me” spotlight with nothing to point at, `FAILED` the audit couldn’t complete the step.

Excluded on purpose: Delete account, Sign out, real Google/X/Discord sign-in, external share links (recorded, not opened). Workers were given coins through the private server’s moderator API so every purchase could be tried.
