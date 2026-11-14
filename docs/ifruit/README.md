# iFruit

The phone every New Yorker carries. Read in this order:

1. [RESEARCH.md](RESEARCH.md): what the game had before the phone (stack, style, places, systems).
2. [SPEC.md](SPEC.md): the 8 apps, the unboxing, the shell, cross-app links, data model and API.
3. [VISUAL.md](VISUAL.md): hardware, software, icon rules, the cherry-pair mark (and the two rejected directions).
4. [ICON_PROMPTS.md](ICON_PROMPTS.md): the shared style prefix and every Higgsfield prompt.

## What shipped (Nov 13, 2026)

| Part | Where |
| --- | --- |
| Shell: device, lock screen, home (widget, grid, dock), status bar + island, banners, badges, open/close springs, keys (Q, Escape, arrows), touch swipes, reduced motion | `app/src/features/ifruit/phone.ts`, `phone.css` |
| State: save field (optional, defaults filled on load), notifications, IndexedDB photos, offline ledger | `store.ts` |
| Apps | `apps/contacts.ts`, `messages.ts`, `calls.ts`, `camera.ts`, `photos.ts`, `bank.ts`, `stocks.ts`, `map.ts`, `settings.ts`, styles in `apps.css` |
| Photos as recipes (room + crop + people), rendering, polaroid export | `photo.ts` |
| Client network: threads, local threads with city locals and Rosa, realtime handlers | `net.ts` |
| Unboxing | `unboxing.ts`, `unboxing.css` |
| Shared types and bank rules | `wire.ts` |
| Stock prices (seeded walk, shared by game and server) | `app/src/data/stocks.ts` |
| Server: Messages, Bank, Stocks routes | `server/src/phone.ts` (mounted at `/api/phone`), DB migration v17 in `server/src/db.ts` |
| Realtime: `dm`, `payreq`, `call` | `app/src/net/protocol.ts`, `server/src/game/realtime.ts`, `app/src/net/multiplayer.ts` |
| Art | `app/public/art/ifruit/` (generated icons in `app/`, hand-drawn SVG fallbacks in `icons/`, the marks, wallpapers, unboxing frames); originals in `raw/ifruit/` |
| Icon generator (SVG set) | `tools/ifruit_icons.mjs` |

Hooks into the rest of the game: the toolbar phone button and keys (`hud.ts`: Q phone, T Messages, K Camera), offline ledger lines from `api.earn/spend/buy` (`game.ts`), the unboxing replacing Rosa's welcome postcard and showing once for existing players (`game.ts`), landmark selfies saved to Photos (`moments/selfie.ts`), the Exchange bell offering Trade (`exchange.ts`), `onRoomChange` now returns an unsubscribe (`engine/world.ts`).

## Round 2 (Nov 13, user feedback)

- Smaller phone (222 × 428) that sits between the top HUD and the toolbar; a smaller type scale inside it.
- Every screen has a labelled Back (or Home on an app's first screen); empty states sit in the middle.
- Map: place names only when you hover a dot. Bank, Messages and Stocks show money as $.
- Stocks: no "You own" row until you own some; Sell only then. Prices calmer (about 6% a day). The Exchange floor's tape and big screen read the same prices as the app (`features/ifruit/quotes.ts`).
- Camera: the landmark camera pins open the iFruit Camera framed on the landmark; Central Park is a photo spot (Bow Bridge); the landmark selfie wears the iFruit shell.
- Calls are real voice now (WebRTC, peer to peer; the server only relays ring/answer/connection details between friends). Only friends who are online; no city locals. Mute, End, Report, Go to Them. Public STUN only, so a few strict networks may fail to connect ("Couldn't connect the call"); a TURN server would fix that.
- The unboxing is in the arrival, right after the subway card ("One More Thing"), then the turnstile. The after-tour slot is now only a fallback for anyone who skipped the intro.

## Round 3

- Android-style nav bar along the bottom with words under each button: Back (curved arrow: a sheet, then the screen before, then home), Home, Recent (the apps you used, newest first). It replaced the iPhone-style home bar.
- Photos ↔ Camera turns as one motion: the screen goes dark, the app changes underneath, the phone rotates from where it was into its new shape (a FLIP), then lights up. The shell owns orientation now; the Camera app no longer rotates itself.

## Round 4: friends of friends and notifications (Nov 14)

- Friend lists are visible to that person and their friends. Everyone else sees how many friends someone has and the friends you share. Where a friend of a friend is in the city stays private (just online or offline). Blocked people are left out both ways. Server: `GET /api/users/:id/friends` and `GET /api/friends/suggested` in `server/src/api.ts`, self-test `server/scripts/friends-test.ts` (part of `npm --prefix server test`).
- Contacts: Friend Requests with Accept and Decline, People You May Know (friends of friends, by mutual count), Sent with Cancel, a Friends section on each friend's page, and a profile for anyone else (Add, Cancel Request, Accept / Decline, mutual friends). Contacts' icon shows the number of waiting requests, which also counts on the toolbar button.
- Notification panel: a bell with a count in the status bar (or drag down from the top). New and Earlier, a friend request can be answered right there, Clear empties it, closing it marks everything read. Back and Escape close it first.
- The player card in the city: Decline next to Accept, and a chip with their friend count and the friends you share that opens their page on the phone.
- Declines, cancels and unfriends quietly refresh the other person's lists (`fx` realtime event, no message). City locals' requests use the same notifications and can be declined too.

## Camera fix and filters (Nov 14)

- The shutter was pushed off the right edge in landscape (the viewfinder was a fixed 480 px). The viewfinder now takes the room left between the two side columns, so the white shutter always shows.
- Filters along the bottom of the viewfinder: Original, Sepia, B&W, Vivid, Noir, Fade (`PHOTO_FX` in `wire.ts`). The viewfinder previews with CSS filters; the photo is drawn with the same math pixel by pixel (`photo.ts`), and the filter travels in the recipe (`fx`, allowed by the server), so a friend sees it too. The last filter you used stays picked.

## Try it

- `clubNyc.phone()` toggles it, `clubNyc.phone('stocks', 'MEOW')` opens an app at a place, `clubNyc.unbox()` replays the unboxing.
- Offline (`?profile=x`): everything works on local data; city locals answer texts and pick up calls.
- Online, two players: friends can DM, send photos and places, call, send and request coins, and see each other on the Map.

## Verified

- Server: 30+ API checks on a throwaway server (filtering, friends-only, strangers locked out, photo recipes validated, rate limits, transfer limits and account age, request pay/decline/twice, stock buy/sell/oversell/caps, ledger lines).
- Two live browsers: DM with badge, place card, incoming call with Answer, call lines on both phones, coin request paid with both ledgers updated.
- `npm --prefix server test` passes; app and server typecheck.

## Not done yet

- Translations (rounds 1 to 4): the new English needs `node app/scripts/i18n-extract.mjs`, translating, then `i18n-merge.mjs`.
- Help Center page and What's New entry for the phone.
- pixel_audit pass over the phone screens.
- Pitch deck labels (Figma) for the phone.
