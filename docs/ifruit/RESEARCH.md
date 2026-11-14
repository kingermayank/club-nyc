# iFruit: Research (Phase 1)

What Club NYC is today, read from the code on 2026-11-13, so the phone is designed into the game that exists rather than a generic one. Paths are relative to the repo root.

## 1. Tech stack and rendering

| Layer | What it is | Where |
| --- | --- | --- |
| Client | TypeScript + Vite 8, **no framework**. Plain DOM built with a tiny `el(tag, cls, html)` helper, CSS files imported next to each feature. | `app/src`, `app/vite.config.ts` |
| Stage | A fixed **1000 × 565** logical stage, scaled to fit its box with a CSS transform (`engine/stage.ts`). Layers: `room-bg` img, `scene` (actors), `overhead-layer` (name tags, bubbles), `fx`, `hud`, `toolbar`, `notices`, `overlay` (modal panels), `toasts`, `fade`. Everything new must live inside `stage.root` and use stage px. | `app/src/engine/stage.ts` |
| Rooms | A room is a painted background (`/art/rooms/<bg>.jpg`, webp twin) plus SAM-traced cutout sprites per object (`/art/cutouts/<room>/<obj>.png`) and a geo JSON (walk mask, seats, zones). Defined in `app/src/data/rooms.ts`. | `engine/world.ts`, `data/rooms.ts`, `data/geo/` |
| Avatars | Pure **SVG**, generated from a `Look` (skin, hair, face fields, 7 item slots). `avatarMarkup`, `avatarPortrait`, `headPortrait`, `posePictogram` return SVG strings; `AvatarView` animates poses. | `app/src/avatar/render.ts`, `look.ts`, `items.ts` |
| Canvas | Only where needed: mini-games (`games/*`), the photo booth / selfie export (SVG people drawn onto a canvas over the room art, then `toDataURL`). | `features/photobooth.ts`, `features/moments/selfie.ts` |
| Server | Node + Hono REST (`/api/*`) + `ws` realtime, SQLite via `node:sqlite` with numbered migrations (`server/src/db.ts`, currently **v16**). | `server/src` |
| Realtime | Intents, not positions: join room, walk to, say, emote, pose, sit, preset text. The server batches per room instance at ~15 Hz. | `app/src/net/protocol.ts`, `server/src/game/realtime.ts` |
| i18n | English is written in the DOM; a translation layer swaps strings for 4 other languages. New English needs extract, translate, merge. | `app/src/i18n` |
| Debug handle | `window.clubNyc` (`api`, `world`, `save`, `arrival()`, `endGame()`…). QA scripts in `tools/*.py` drive it headless. | `app/src/game.ts` |
| Dev | `.claude/launch.json`: `club-nyc` (Vite 5173), `club-nyc-server` (8787), `club-nyc-qa` (private stack on 5197 with a throwaway DB). `?profile=<name>` gives a separate, always-offline save slot. | |

Implication for iFruit: build it as a DOM component inside the stage (like the selfie phone in `moments/selfie.ts`), render people with `avatarMarkup`, and compose photos as SVG + room art exactly like the selfie does.

## 2. Visual style

- **Look**: Club Penguin for Manhattan. Painted, saturated rooms with thick dark outlines; UI is chunky and friendly. Every panel is cream paper (`--paper #fffdf6`) with a 3 to 4 px navy (`--ink #1d2140`) border, big radius (18 to 24 px) and a hard offset shadow.
- **Palette tokens** (`app/src/style.css :root`): ink `#1d2140`, blue `#2a7bd5` / dark `#134a96` / light `#6fb6ff`, sun `#ffd166`, paper `#fffdf6`, red `#e5483b`, green `#3cb371`. The toolbar is a deep blue bar with a lighter rim.
- **Type**: Burbank only. `--display` (Burbank Display Bold) for titles, names, buttons, numbers; `--body` (Burbank Small Medium) for sentences. Inputs use the `--field` faces (taller descent). Sizes come from the `--fs-*` scale (10 to 36), spacing from `--sp-1..5` (4/8/12/16/24). Buttons: 44 (`.btn`), 36 (`.small`), 30 (`.tiny`).
- **Icons**: illustrated PNGs, not emoji. Toolbar icons in `app/public/art/icons/*.png` (a pink phone, a map, a MetroCard…), and a large emoji-replacement set in `art/icons/e/` (`engine/iconize.ts` swaps emoji for these everywhere). They are soft 3D-ish, lit from the top left, outlined in navy, with a glossy highlight.
- **Lighting**: warm daylight from the upper left in rooms; UI art has a white top-left gloss and a darker bottom-right shade band.
- **Formats/folders**: rooms `.jpg` + `.webp` (`art/rooms`), cutouts `.png` + `.webp`, icons `.png` + `.webp` (`tools/webp.py` makes the twins), company logos `art/logos/*.png` (app-icon squircles for the Exchange's tech IPOs), UI art `art/ui`, sounds `public/sfx` built from `tools/sfx_manifest.json`.
- **House rules** (from the team's notes): no em dashes in anything players read; 2 to 4 word hints instead of explainer lines; no middle-dot footers; pictures over text lists; calm notifications (one toast at a time, queued notices); icons never stretched; menus pop right above their toolbar button; ~30% deadpan NYC humour, never in instructions, status or safety text; brand names are parody (THREAD, Starducks, Louis Vuittown…), never real logos.

## 3. Onboarding, avatar, HUD

**Onboarding** (`game.ts startGame`):
1. Boot splash, `signIn()` (online guest-first or offline).
2. Consent (13+ and policy) when online.
3. **Creator** (`features/creator.ts`): three doors (Use a Photo with on-device matching, Surprise Me, Build My Own), name, team.
4. **Arrival** (`features/arrival.ts`): MetroCard booth photo, turnstile swipe, subway ride, up the stairs into Times Square.
5. A hop and hello, then **Rosa's tour** (`features/tour.ts`, 5 cards), `welcome` stamp, Rosa's welcome postcard, daily refill.
Returning players: title card, daily refill, quests; players from before the tour get it offered once.
The house rule is onboarding of 5 steps or fewer, so the phone must slot in without adding a step: it fits as the payoff at the end of the arrival (Rosa hands it over), or as its own one-time moment for existing players.

**Avatar**: `Look` = skin, hair style + colour, signature colour, face fields (shape, eyes, brows, nose, beard, specs, freckles, lashes), and items by slot (`head, face, neck, body, legs, feet, hand`). Wardrobe from shops; the server checks ownership online.

**HUD** (`hud.ts`): top left place plate + `?` (replay tour) + postcard mail button; top right level ring + coin plate (and the online pill); bottom toolbar: Moves, chat bar, Map (M), Subway (U), Newspaper (N), **Phone** (pink phone icon, opens a pop menu: Selfie at landmarks (K), Invite Friends (I), Text a Friend (T), How to Play, Help Center, Discord), then Friends & Leaderboards (F), Player Card (P), Stamp Book, Apartment (H), Sound. The phone button already exists; iFruit replaces its pop menu.

## 4. Places built so far

| Room id | Name | What happens there |
| --- | --- | --- |
| `times-square` | Times Square | Hub. Broadway marquee, I ♥ NY shop, Dance Jam, hot dog cart, subway stairs, taxi. Selfie spot. |
| `broadway` | Broadway theater | Live-cast shows for a 5-coin ticket (`features/broadway`, `theater.ts`). |
| `iloveny` | I ♥ NY Souvenirs | Souvenirs, foam crown/torch, toys. |
| `rockefeller` | Rockefeller Center | Rink (walkable), flags, Top of the Rock tickets. Selfie spot. |
| `fifth-ave`, `toy-palace`, `saks-2`, `maison-malle` | Fifth Avenue, Snacks Fifth Avenue (2 floors), Louis Vuittown | Luxury shopping, St. Patrick's (selfie spot). |
| `central-park` | Central Park | Rowboats (3 coins), carriage ride, squirrel, park walk. |
| `the-met` | The Met | Sit on the steps (stamp), galleries. Selfie spot. |
| `empire-street`, `empire-lobby`, `empire-deck` | Empire State | Lobby, elevator ride, observation deck with ticket menu and coin viewers. |
| `grand-central` | Grand Central | Departures board, opal clock, whispering gallery. Selfie spot. |
| `subway` | Subway station | Living platform with real moving trains, buskers (tip 1 coin), Showtime. |
| `soho`, `thread`, `sneaker-vault`, `coffee` | SoHo, THREAD, Sneaker Vault (daily drop), Starducks Coffee | Clothes, sneakers, drinks (barista misspells your name). |
| `chinatown`, `pizza` | Chinatown & Little Italy, 99¢ Slice | Dim sum, dumplings, Bagel Counters job, slices. Selfie spot. |
| `brooklyn-bridge` | Brooklyn Bridge | Bridge walk, love locks (shared, server-backed), souvenir magnets. Selfie spot. |
| `battery-park`, `liberty-island` | Battery Park, Liberty Island | Ferry (2 coins), Ferry Captain job, Lady Liberty full selfie set, crown climb. |
| `high-line`, `hudson-yards`, `chelsea-market` | The High Line, Hudson Yards / Vessel, Chelsea Market | Citi Bike Dash (multiplayer), Vessel climb, tacos, oysters, doughnuts, bookshop. |
| `wall-street`, `exchange-floor` | Wall Street, the Exchange | The Bull (selfie spot), the Big Board, **a daily IPO bell** with 40 invented companies priced in coins (`data/ipos.ts`), real IPO calendar + delayed quotes for the floor's tape (`server/src/market.ts`). |
| `one-world-trade`, `sky-deck` | One World Trade, Sky Deck 102 | The 9/11 Memorial (quiet place, no toasts), sky pod, ticketed deck, photo booth. Selfie spot. |
| `apartment`, `loft`, `brownstone`, `sky-residence`, `penthouse` | Homes | Furniture, fridge with magnets, guestbook, house parties, open house. |
| `parade` | Halloween parade | Switched off (`PARTY.enabled = false`). |

Jobs (`games/`): Slice Factory, Halal Rush, Bagel Counters, Ferry Captain, Showtime. Multiplayer mini-games (`mp/`): Citi Bike Dash, Rush Hour Run, Carb-Jitsu.
Map (`features/map.ts`): painted Manhattan (`/art/rooms/map.jpg`, 1000 × 664) with traced landmark cutouts and pins; `MAP_SPOTS` lists the spots and rooms. Taxi rides (`moments/taxi.ts`) and the subway are the "travel" layer.

## 5. Systems: what exists and what is missing

| System | Exists | Missing for iFruit |
| --- | --- | --- |
| **Friends** | Server table `friends` (pending/accepted), REST `/friends` returns friends with presence (`online`, `room`, `inst`); realtime `f` events when a friend comes online or moves; add/accept/remove/block/mute/report in `net/multiplayer.ts`; `goToFriend(id)`. Offline: befriend **city residents** (NPCs with stable looks, homes, haunts, lines; `social/residents.ts`, `save.friends`). Friends tab in `social/community.ts`. | A personal, phone-sized contacts list with favourites, last seen, "where are they" and quick actions. |
| **Chat** | Room chat is free text, filtered on the server (`game/filter.ts`: links, emails, phones removed, slurs masked), logged in `chat_log` for reports, mute rules. Phone "Text a Friend" sends **presets only** (`meet`, `hi`, `game`, `home`, `party`) relayed live to online friends with a Go button; nothing is stored. | Real DMs and group chats: persistent threads, offline delivery, unread counts, history. Must reuse the filter, mute, block and report rules. |
| **Calls** | None. | A call UI. Voice audio between minors-possible accounts is a moderation risk, so a stylized call (ringing, answered, quick "call lines", Meet Me Here) fits the house rule of presets. |
| **Currency** | Coins. Online the server owns the wallet (`server/src/economy.ts`): `claim` (capped reasons in `data/economy.ts`), `payJob`, `debit`, `buyItem`, `buyHome`, an **append-only `ledger`** (delta, reason, ref, balance, day, time) and `recentLedger()` (unused by the client). Offline: `save.coins` only. Spend reasons are strings like `cm-tacos`, `theater-ticket`, `furniture:lamp`. Paid places use a ticket menu (`features/tickets.ts`). | A way to **see** the ledger (no client endpoint), an offline local ledger, and **person-to-person transfers** (none exist; must be friends-only and capped so alts cannot farm). |
| **Stocks** | The Exchange rings a bell for one invented company a day (`data/ipos.ts`, 40 companies, emblem or app-icon logos, offer price + day-one pop). Ringing it is a moment, but nothing can be bought. | Holdings, deterministic price movement everyone sees the same, buy/sell through the server wallet, a portfolio. |
| **Inventory** | `save.owned` (wardrobe), furniture storage, magnets, love locks, homes. | Not needed by the 8 apps (Bank can show purchases). |
| **Photos** | Photo booth strips (`photobooth.ts`) and the **landmark selfie phone** (`moments/selfie.ts`, 10 `SELFIE_SPOTS`): both compose SVG avatars over the room art to a canvas, and **download** a PNG. Stats `photos`, `selfie:<room>`; stamps `first-selfie`, `say-cheese`, `liberty-selfie`. | No in-game gallery: photos are downloaded and forgotten. No camera outside the 10 spots. No way to send a photo to a friend. |
| **Notifications** | Toasts (one at a time, queued), notices with buttons (bottom right, one at a time), postcards (mail button, `save.mail`, Rosa's letters), level-up toasts, realtime `n` events (guestbook, likes, referrals). | A phone notification centre that collects messages, payments, calls and friend events, with a badge on the phone button. |
| **Social posting** | Shared photo strips carry the invite link as a footer; the newspaper prints city news; Launch HQ has a social content bucket. | Out of scope for the 8 apps; Photos can "Save to Device" (download) which keeps the existing sharing path. |
| **Levels/XP** | Server `awardXp`, `XP_RULES`, client `social/levels.ts`. | New phone activities can award small XP through existing reasons (no new farming paths). |

## 6. Constraints the phone must respect

1. **Safety first**: chats go through `cleanChat`, only between accepted friends, never to blocked users, muted accounts cannot send, every message reportable. No voice audio.
2. **Money is server-owned online**: every coin movement goes through the wallet + ledger; transfers need caps.
3. **Migration-safe**: new tables in a new DB migration (v17); new save fields optional with defaults.
4. **One thing at a time**: phone notifications feed the same calm queue; no new pop-up storms.
5. **Inside the stage, in stage px**, Burbank, `--fs-*` tokens, no em dashes, parody brands only. iFruit itself must not echo Apple's logo, wordmark or product silhouettes.
