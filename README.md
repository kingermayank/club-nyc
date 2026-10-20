# Club NYC

Club Penguin, but it's Manhattan, and now multiplayer. Sign in with one click (or Google / X), see everyone in the room, chat, make friends, visit their apartments and climb leaderboards that are stored on the server. Computer-run "city locals" keep quiet rooms alive and step aside as real players arrive.

```bash
npm --prefix server install && npm --prefix server run dev   # game server  :8787
npm --prefix app install    && npm --prefix app run dev      # the site     :5173
```

The landing page is at `http://localhost:5173/` and the game at **`/play`** (invite links, `/join/<name>`, open the game
directly). Deploying: **[docs/deploy-railway.md](docs/deploy-railway.md)**. Before inviting the public: **[docs/launch/legal-callouts.md](docs/launch/legal-callouts.md)**.
The landing page itself: **[docs/marketing/landing-page.md](docs/marketing/landing-page.md)**. The launch trailer and
the landing page's gameplay loop are made with Remotion in `video/` from real captured gameplay:
**[docs/marketing/launch-video.md](docs/marketing/launch-video.md)**.

Without the server the game runs single-player, as before (`?offline=1` forces it). How the multiplayer works, how to turn on Google/X sign-in, measured performance and the scaling plan: **[docs/multiplayer.md](docs/multiplayer.md)**.

`?profile=<name>` keeps a separate offline save slot. `?game=<id>` runs a single mini-game on its own; `?dev=avatar` opens the avatar lab.

## What's in it

| | |
|---|---|
| **Onboarding** | Two quick screens: your look (ready-made looks, skin, hairstyles, hair and signature colors) → your name (name wheels or your own), birth month and year (a neutral age check, never stored) and "I agree" to the Terms, Privacy Policy and Community Rules. Then Rosa's 5-card welcome tour, a 5-step **New in Town** list with coin rewards, and your **MetroCard**. |
| **26 places** | Times Square (live billboards), Broadway Theater (3 shows), I ♥ NY Souvenirs, Rockefeller Center (skate on the rink), Fifth Avenue, Toy Palace (walk-on floor piano), Maison Malle, Central Park, The Met, Empire State observatory, Grand Central (Whispering Gallery), the subway, SoHo, THREAD, Sneaker Vault, Bean There café, Chinatown & Little Italy, 99¢ Slice, Brooklyn Bridge, Battery Park, Liberty Island, the High Line, Chelsea Market, your apartment, and the **Halloween Parade** party room. |
| **Traced objects** | Every clickable object was traced from the art with SAM 2, so the hover glow follows its real silhouette (the map too). People walk around carts and benches (A* pathfinding), sit on seats, and pass behind objects. |
| **Avatars** | Human chibi avatars drawn in SVG with ~100 items across 7 slots. Shops are split into sections, and each shelf opens its own (the snow globes are 6 different globes, the toy taxis are 5 different toys). |
| **5 jobs** | Slice Factory (pizza), Halal Rush, Ferry Captain, Bagel Counters, and Showtime! (a subway dance rhythm game). Each pays coins and has unlockable outfits, stamps, and a weekly leaderboard. |
| **Social** | ~57 persistent residents with homes, routines and teams. Buddy list with live locations ("Go" takes you to them). Add friends, wave, throw snowballs. **Flash mobs**: press D and people join in; at 4+ in Times Square the billboards dance, at 6+ it's a takeover with confetti and coins raining down. Visit residents' apartments, sign guestbooks, like their places. Open House sends friends to your place. Occasional, skippable "city pulse" notices. |
| **Competition** | Weekly leaderboards for every job (filter to friends), async **challenges** ("beat my score", with rematches), and **Neighborhood Wars**, where every coin you earn counts for your team. The Club NYC Times sports page shows the live standings. |
| **Apartment** | On-screen Decorate, Catalog, Guestbook and Open House buttons. 25 furniture pieces including NYC ones (taxi bed, pizza rug, jukebox, arcade cabinet, bodega cat bed). Furniture you can sit on, and furniture that does things: music, lights, TV, the cat, the arcade. |
| **Halloween party** | Free costumes, decorations across the city, an 8-room candy-corn hunt (prize: Golden Pumpkin Crown), and the parade room. |
| **Multiplayer** | Real players in shared rooms (auto-overflow into "Room 2" at 60, placed with your friends). Free-text chat with bubbles and a log, filtered on the server. Live friend requests, a buddy list with live locations, a "who's in the city" tab, real apartment visits with guestbooks and likes, weekly and all-time leaderboards with validated scores, and mute / block / report. |
| **Also** | A real-geography subway map, the Club NYC Times newspaper, the map postcard, 50 stamps, titles, daily bonus, seats, snowballs, emotes, quick chat, sound. |

Keys: `Enter` chat · `M` map · `U` subway · `N` newspaper · `F` friends & leaderboards · `P` player card · `H` home · `D` dance · `W` wave · `C` cheer · `J` jump · `S` sit · `T` snowball · `` ` `` debug.

## How it's built

- **Art**: Higgsfield (GPT Image 2.5) using the Club Penguin screenshots as style references. Rooms, sprite sheets, furniture, show scenes, newspaper art and the logo. Prompts and the template are in `docs/art-pipeline.md`.
- **Geometry**: `tools/cutouts.py` traces objects with SAM 2 from a per-room spec (`tools/rooms/*.json`, method in `tools/MEASURING.md`) and writes `app/src/data/geo/*.json` plus cutout PNGs. `tools/grid.py`, `tools/shot.py` (headless screenshots) and `tools/sweep.py` (visit every room and flag problems) are the QA helpers.
- **Engine**: Vite + TypeScript with plain DOM, on a 1000×565 stage. `src/engine/` (world, actors, UI), `src/data/` (rooms, stamps, news), `src/features/` (map, subway, catalog, apartment…), `src/social/` (residents, friends, flash mob, leaderboards, teams, quests), `src/games/` (each mini-game in its own folder).
- **Multiplayer**: `server/` (Node 24, Hono, `ws`, SQLite, Arctic for OAuth) and `app/src/net/` (protocol, socket, session, multiplayer glue). Remote players are ordinary Actors driven by network intents. See [docs/multiplayer.md](docs/multiplayer.md).
- **Design flow**: all 71 screens in order, in Figma: https://www.figma.com/design/TTJsmih8cCg8e5FhhkpNwD (captured with `tools/flow.py`; images in `docs/flow/`).
