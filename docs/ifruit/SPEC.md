# iFruit: Design Spec (Phase 2)

Function before visuals. Every app is defined by what it does with systems that already exist (see RESEARCH.md), and where it touches the city.

## 0. Principles

- **One device, one place.** The phone replaces the toolbar's phone pop menu. Everything it held (selfie, invite, text a friend, how to play, help, Discord) moves into apps.
- **Real data or a labelled stand-in.** Online, every number comes from the server (wallet, ledger, friends, presence). Offline, apps run on a local copy and say "Offline" in the status bar. City residents (NPC friends) are tagged "City local" wherever they appear.
- **Safety rules carry over.** Messages are filtered by the same `cleanChat`, only between accepted friends, never to or from blocked users, not while muted, and every message can be reported. Calls are stylized (no microphone, no audio stream).
- **Calm.** Phone notifications feed the existing one-at-a-time toast/notice queues; when the phone is closed the toolbar button carries an unread badge instead of extra pop-ups.
- **Small words.** 2 to 4 word labels, no explainer lines, no em dashes.

## 1. The device

| | |
| --- | --- |
| Open | Toolbar phone button, hotkey **Q**, `T` opens straight to Messages, `K` to Camera, swipe up from the stage's bottom-right corner on touch. |
| Close | Phone button again, **Escape** (from an app's root), click the world, or drag the phone down on touch. Escape inside an app goes back one screen first. |
| Placement | Portrait, 264 × 540 stage px, right side of the stage, above the toolbar, so the room stays visible and you can keep watching friends walk around. Camera turns it landscape. |
| Motion | Slides up from below the toolbar on a spring (overshoot 4%, 420 ms), tilts 2° as it lands. Closing drops it with ease-in (220 ms). Reduced motion: 160 ms fade, no tilt, no springs anywhere. |
| World input | While open the world still renders, but clicks on the room close the phone (no walking by accident). Typing in the phone never triggers hotkeys. |

### Lock screen
Shown on the first open of a session, or after 2 minutes closed. NYC time (big, Burbank Display), date, your wallpaper, and stacked notifications (newest first, max 4, "+3 more"). Click a notification to unlock straight into it. Unlock: click, Space, Enter, or swipe up on the home bar. Micro: the clock's colon blinks once per second; the padlock icon springs open on unlock.

### Status bar
Left: NYC time. Centre: the "island" pill (camera cutout) that expands for live activity (an ongoing call shows its timer; a payment shows "+5"). Right: signal bars (full online, hollow + "Offline" when not), "NYC 5G", battery (always cheerful).

### Home screen
- **Widget** (top, full width): "Here" card with the current place's name, a tiny painting crop of the room, and friends here as small heads. Click opens Map at your location.
- **Grid** (4 columns): Contacts, Photos, Bank, Stocks, then Settings (system, smaller footprint).
- **Dock** (glass shelf, 4): Phone, Messages, Camera, Map.
- Badges: red unread count on Messages, Phone (missed calls), Bank (pending requests).
- Interaction: press scales an icon to 0.9, release springs it to 1.0, then the app zooms out of the icon's rect (transform origin = icon). Back to home zooms back into the icon. Keyboard: arrow keys move a focus ring across icons, Enter opens.

### Notifications
`phoneNotify({ app, title, text, icon, open })` is the single entry point. Phone open: a banner drops in at the top of the screen (3.5 s, swipe/click). Phone closed: the unread badge on the toolbar button; incoming calls and payment requests also use the existing `notify()` notice with one action (Answer / Open). Everything lands in the lock-screen list until opened. `save.notifyOff` silences sounds but keeps badges.

## 2. The 8 apps

### 2.1 Contacts (Friends)
- **Purpose**: who you know, whether they're around, and one click to reach them.
- **Screens**: List (search field, Favourites row of heads, sections Online / Everyone / City locals, pending requests at top) and Detail (big portrait, name, level title, team, status "In Chelsea Market" / "Offline", actions).
- **Key interactions**: Message, Call, Pay, Find on Map, Go There (`goToFriend`), Visit Apartment, star as favourite, Accept / Decline a request, Invite Friends (opens the existing invite panel).
- **Micro**: the online dot pulses once when a friend comes online while the list is open; star pops with a little burst; rows press in.
- **Data**: reads `/api/friends` (presence included) and live `f` events (`mp.friends`, `onPeopleChange`); offline reads `save.friends` + residents. Writes `save.ifruit.favorites`.
- **Connects to**: Map (location), Messages, Phone, Bank, apartments (`visitPlayerApartment`), the city (`goToFriend` joins their room instance).

### 2.2 Messages
- **Purpose**: DMs and group chats with other players that persist and arrive while you're away.
- **Screens**: Threads (avatar or stacked group heads, name, last line, time, unread dot), Thread (bubbles, day separators, typing-free), Composer (text field, photo button, place button, quick replies), New (pick friends: 1 = DM, 2 to 7 = group, optional name), Thread info (members, rename, leave, report).
- **Message kinds**: `text`, `photo` (a photo recipe, rendered on arrival), `place` (a room card with Go), `pay` / `request` (from Bank, with Pay / Decline inside the bubble), `call` (missed / ended call lines), `sys` (joined, left, renamed).
- **Key interactions**: send with Enter, photo picker from Photos, "Meet Me Here" place button, tap a place bubble to go there, tap a photo to view it big, long press (or right click) a bubble to Report.
- **Micro**: your bubble scales in from the composer (spring), theirs slides in from the left, a delivery tick appears when the server stores it; the send button is disabled-grey until there is text; failed sends show a red retry dot.
- **Data**: new tables `dm_threads`, `dm_members`, `dm_messages` (v17). REST `/api/phone/threads*`. Realtime `{ t: 'dm' }` to members who are online. Filtered with `cleanChat`, rate-limited (1 message / 700 ms, 40 / minute), blocked and muted users can't send. Offline / City locals: local threads in `save.ifruit.local`, residents answer from their own lines after a short pause ("City local" tag).
- **Replaces**: Text a Friend's presets become quick replies ("Meet me here", "Say hi", "Play a game?") inside a thread; the live `txt` relay still works for players on older clients.
- **Onboarding tie**: Rosa's welcome postcard becomes the first message in Messages.

### 2.3 Phone (Calls)
- **Purpose**: ring a friend to get together now.
- **Screens**: Recents (in/out/missed, time), Favourites, Keypad-free Contacts list, Calling (big portrait, "Calling…", pulsing rings, End), Incoming (Answer / Decline, slides the phone up by itself), In call (both heads side by side, timer in the island, call lines, Meet Me Here, Go to Them, End).
- **Call lines** (presets, both sides see them as speech bubbles over the heads): "Where are you?", "Come over!", "On my way", "Haha", "Gotta go". Meet Me Here sends your place; Go to Them uses `goToFriend`.
- **Micro**: ringing wobble on the avatar, the island grows into a green pill with the timer, end call collapses it with a tiny bounce, dial tone and ring are synthesized (Web Audio, mute-aware).
- **Data**: realtime only. C2S `{ t: 'call', k: 'ring' | 'answer' | 'decline' | 'end' | 'line', i: friendId, c: callId, l?: line }`, relayed by the server to online friends who haven't blocked you. A call that rings out writes a `call` message (missed) to the DM thread so it shows as missed later. Recents in `save.ifruit.calls`. City locals pick up with one of their lines.
- **Connects to**: Contacts, Messages (missed calls), Map/goToFriend.

### 2.4 Camera
- **Purpose**: take in-game photos of your New Yorker, friends and places, anywhere.
- **Screens**: Viewfinder (landscape: the phone rotates 90°), mode strip (Photo, Selfie at landmarks), zoom (1×, 2×), shutter, last-photo thumbnail.
- **Photo mode**: the viewfinder shows the room you're in, live: the painting plus everyone in it, redrawn as SVG 6 times a second. Drag to pan, scroll or 1×/2× to zoom. Faces get yellow focus boxes. Shutter: flash, click sound, the frame shrinks into the thumbnail.
- **Selfie mode**: only at the 10 landmark spots (`SELFIE_SPOTS`); opens the existing landmark selfie with its poses. Its shot is saved to Photos too.
- **Strangers stay out**: like the photo booth, real players who aren't your friends are drawn as blurred silhouettes (privacy), city locals and friends are drawn normally.
- **Data**: writes a photo to Photos (IndexedDB) with a **recipe** (room, crop, people as looks + positions, time). Bumps `stats.photos`, counts toward `first-selfie` / `say-cheese` via the selfie path, and a new stamp-free XP-free path (no new farming).
- **Connects to**: Photos, Messages (send from viewfinder thumbnail), landmarks (selfie spots, the Exchange floor, the Vessel…).

### 2.5 Photos
- **Purpose**: the gallery of everything the Camera took.
- **Screens**: Grid (3 columns, newest first, sections by place: "Times Square, today"), Viewer (full width, caption with place and date, left/right arrows and swipe), Empty state ("No Photos Yet" with an Open Camera button), Loading (shimmer tiles).
- **Key interactions**: Send (opens a thread picker, then Messages), Set as Wallpaper, Save to Device (PNG download, keeps the invite footer path), Delete (two-step: the button turns red "Delete?").
- **Micro**: tiles fade in staggered, the viewer opens from the tile's rect (shared-element zoom), delete crumples the tile.
- **Data**: IndexedDB `club-nyc-ifruit` store `photos` `{ id, at, room, title, jpeg, recipe }`, up to 120 photos; received photos are rendered from their recipe and can be saved.

### 2.6 Bank
- **Purpose**: your coins, where they came from and where they went, and money between friends.
- **Screens**: Home (a MetroCard-style card with balance that counts up, This Week in/out bar, Send, Request), Activity (grouped by day: icon, what, where, +/−, running balance), Detail sheet, Send/Request (pick friend, keypad amount, note chips: "Pizza", "Rent", "Tickets", "Thanks"), Requests (incoming with Pay / Decline).
- **Ledger labels**: reason codes become people words and places: `cm-tacos` → Tacos, Chelsea Market; `theater-ticket` → Broadway ticket, Times Square; `job` → Shift pay; `daily` → MetroCard refill; `furniture:*` → furniture name; `stock-buy:MEOW` → Bought MEOW; `gift-in`/`gift-out` → From / To a friend.
- **Rules (server)**: friends only, 1 to 100 coins per transfer, at most 150 sent per NYC day, at most 200 received per day, not to yourself, sender must be 24 h old with at least one day visited (alts can't farm); requests expire after 3 days. Every transfer is two ledger lines in one transaction.
- **Micro**: the balance rolls like an odometer, sending flies a coin from the button to the friend's head with the coin sound, a received payment shows "+N" in the island.
- **Data**: `GET /api/phone/bank` (balance, ledger 80 lines, requests), `POST /api/phone/bank/send`, `POST /api/phone/bank/request`, `POST /api/phone/bank/requests/:id/(pay|decline)`. Table `transfers` (v17). Offline: `save.ifruit.ledger` filled by hooking `api.earn` / `api.spend` / `api.buy`.
- **Connects to**: every venue (the ledger names places), Messages (pay/request bubbles), notifications (incoming request).

### 2.7 Stocks
- **Purpose**: put coins into the city's own companies (the Exchange's IPO list) and watch them move.
- **Screens**: Market (watchlist rows: logo/emblem, ticker, name, sparkline, price, change pill), Company (big chart with 1D / 1W, price, your position, Buy / Sell, the company's one-liner), Trade sheet (shares stepper, cost, fee, confirm), Portfolio (value, gain/loss, holdings).
- **Prices**: every company moves on a shared, server-seeded walk (hourly steps, mean-reverting around its offer price, so nothing goes to zero or to the moon). Everybody sees the same price. The company ringing the Exchange's bell today is "Listed Today" and gets its day-one pop (`data/ipos.ts` `pop`).
- **Rules (server)**: whole shares, 1 coin fee per trade, at most 30 trades per NYC day, at most 600 coins invested at cost. Prices are computed on the server from a secret seed (the client can't predict tomorrow); offline uses a local seed and local holdings.
- **Micro**: change pills flash green/red when a price ticks, the chart draws in left to right, Buy confirms with a little bell ding (the Exchange's bell).
- **Data**: table `holdings (user_id, sym, shares, cost)` (v17), ledger lines `stock-buy:SYM` / `stock-sell:SYM`. `GET /api/phone/stocks`, `POST /api/phone/stocks/trade`.
- **Connects to**: the Exchange floor (ringing the bell opens Stocks on that company), Bank (trades in Activity).

### 2.8 Map (the 8th app)
- **Why Map**: the city is the game. The big map (`features/map.ts`) already knows every place, but it only travels; nothing shows where your friends are, and the "where are they?" question is the core social loop ("I'm going to see who's in the city"). A phone Map answers it in one glance and closes the loop with one click (Go). It also ties every other app to places: Contacts' Find on Map, Messages' place bubbles, Camera's landmarks, Bank's merchants. It reuses existing art (the painted island and its traced landmarks), so it's cheap and native.
- **Screens**: Map (the painted island, pinch/scroll zoom, drag to pan, "You" pin, friends' heads as pins, place dots), Place card (name, area, friends there, "Selfie spot" chip, Go, Open Big Map), Friends list sheet.
- **Key interactions**: click a friend's head → card with Go to Them; click a place → Go (same as the big map's travel); "Locate me" centres on your pin.
- **Micro**: pins drop in with a stagger, your pin breathes, a friend moving rooms slides their head to the new place.
- **Data**: `MAP_SPOTS` + traced rects from `data/geo` (map), friends' presence (`mp.friends`), `ROOMS`.

### System app: Settings
Wallpaper (3 originals + any photo), Sounds on/off (`save.muted`), Notification sounds (`save.notifyOff`), How to Play (Rosa's tour), Help Center, Join the Discord, Lock Phone. Holds what the old pop menu had.

## 3. The unboxing (onboarding)

Onboarding stays at 5 steps: the phone **replaces** Rosa's welcome postcard beat rather than adding one.
1. After Rosa's tour, a delivery box slides onto the stage ("From Rosa"). One click: the tape tears, flaps open on springs, the phone rises out of tissue paper with a soft glow and turns to face you.
2. The screen wakes: the iFruit mark grows in, "Hello" types in the five game languages.
3. One choice: pick a wallpaper (3 thumbnails). Done.
4. The phone shrinks and flies into the toolbar's phone button, which glows once; a first message from Rosa arrives in Messages (the old welcome postcard text), so the badge shows right away.
Existing players see the same moment once on their next visit (after the title card). Skip (top right) and Escape always work. Reduced motion: the box opens with fades.
Saved as `save.ifruit.unboxed` (time).

## 4. Cross-app links

| From | To | How |
| --- | --- | --- |
| Photos viewer | Messages | Send → thread picker → photo bubble (recipe) |
| Camera thumbnail | Photos | opens the viewer on the newest photo |
| Contacts / Messages / Phone | Map | Find on Map centres the friend's head pin |
| Map friend card | City | Go to Them (`goToFriend`) |
| Messages place bubble | City | Go (`goto(room)`) |
| Bank request | Notifications → Bank | notice "X requested 5" with Open; bubble in their thread |
| Bank payment | Island + Messages | "+5" in the island, `pay` bubble in the thread |
| Exchange bell | Stocks | "Trade" after the bell rings opens the company |
| Unboxing | Messages | Rosa's first message |
| Photos | Settings | Set as Wallpaper |

## 5. Data model and API

### Client save (optional field, defaults on load: migration-safe)
```ts
save.ifruit?: {
  unboxed: number            // 0 = not yet
  wallpaper: string          // 'skyline' | 'subway' | 'park' | 'photo:<id>'
  favorites: string[]        // friend or resident ids
  calls: { id, who, name, dir: 'in'|'out', missed, at, secs }[]   // recents, last 40
  ledger: { delta, reason, at, balance }[]                         // offline only, last 120
  holdings: Record<string, { shares: number; cost: number }>       // offline only
  local: Record<string, { at, from, kind, text, meta? }[]>         // offline / city-local threads
  read: Record<string, number>                                      // offline read marks
  notes: { id, app, title, text, at, read }[]                       // lock screen list, last 30
}
```
Photos live in IndexedDB (`club-nyc-ifruit` / `photos`) because they're too big for localStorage.

### Server migration v17 (additive only)
```sql
CREATE TABLE dm_threads (id TEXT PRIMARY KEY, kind TEXT NOT NULL, name TEXT, created_by TEXT, created_at INTEGER NOT NULL, last_at INTEGER NOT NULL);
CREATE TABLE dm_members (thread_id TEXT REFERENCES dm_threads(id) ON DELETE CASCADE, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, joined_at INTEGER NOT NULL, read_at INTEGER NOT NULL DEFAULT 0, left_at INTEGER, PRIMARY KEY (thread_id, user_id));
CREATE TABLE dm_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT REFERENCES dm_threads(id) ON DELETE CASCADE, user_id TEXT, kind TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', meta TEXT, at INTEGER NOT NULL);
CREATE TABLE transfers (id INTEGER PRIMARY KEY AUTOINCREMENT, from_id TEXT REFERENCES users(id) ON DELETE CASCADE, to_id TEXT REFERENCES users(id) ON DELETE CASCADE, amount INTEGER NOT NULL, note TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, settled_at INTEGER);
CREATE TABLE holdings (user_id TEXT REFERENCES users(id) ON DELETE CASCADE, sym TEXT NOT NULL, shares INTEGER NOT NULL, cost INTEGER NOT NULL, PRIMARY KEY (user_id, sym));
```
A 1:1 thread id is `dm:<smaller id>:<larger id>` so both sides find the same thread; groups get a random id. Deleting an account cascades through all five.

### REST (all `requireUser`)
| Method | Path | Does |
| --- | --- | --- |
| GET | `/api/phone/threads` | threads with members (public user + presence), last message, unread |
| POST | `/api/phone/threads` | `{ members[], name? }` → DM or group (all members must be friends) |
| GET | `/api/phone/threads/:id` | messages (last 60, `?before=` pages) |
| POST | `/api/phone/threads/:id` | send `{ kind: 'text'|'photo'|'place', text?, meta? }` (filtered, rate-limited) |
| POST | `/api/phone/threads/:id/read` · `/leave` · `/rename` | |
| GET | `/api/phone/bank` | balance, ledger, pending requests, today's limits |
| POST | `/api/phone/bank/send` · `/request` | `{ to, amount, note }` |
| POST | `/api/phone/bank/requests/:id/pay` · `/decline` | |
| GET | `/api/phone/stocks` | prices (now + 24 h series + 7 d series), today's listing, holdings |
| POST | `/api/phone/stocks/trade` | `{ sym, side, shares }` |

### Realtime additions
- S2C `{ t: 'dm', th, m }` new message for a thread you're in; `{ t: 'call', k, i, n, c, l?, r? }` call signalling.
- C2S `{ t: 'call', k, i, c, l? }`.
Unknown events are ignored by older clients, so the additions are backward-compatible.
