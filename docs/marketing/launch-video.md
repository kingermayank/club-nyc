# The Club NYC launch trailer

Made with [Remotion](https://www.remotion.dev) in `video/` (React code that renders to MP4). Everything in it is the
real game: footage recorded from the game itself and the game's own art and fonts, set to an original bouncy theme.

| | |
|---|---|
| **Trailer** | 43 s, 1920×1080, 30 fps, with sound. Web copy (18 MB): `app/public/video/club-nyc-trailer.mp4`. Best-quality master (43 MB, for YouTube, X, TikTok and so on): `video/out/club-nyc-trailer.mp4` |
| **Hero loop** | 14.4 s, silent, loops seamlessly, filmed at 2560×1446 from the original art: `app/public/video/hero-loop-1440.webm`/`.mp4` for high-density and wide screens (5.8 / 6.4 MB), `hero-loop-1080.*` for other big screens (4.0 / 4.9 MB), `hero-loop.*` at 720p for the rest (2.3 / 3.1 MB), poster `hero-loop.webp`. Landmarks only: Liberty Island, Times Square (framed below the shop signs), Brooklyn Bridge, Central Park, Grand Central, the Empire State Building, Rockefeller Center |
| **Tile clips** | 15 short seamless loops for the landing page's tiles (places, the creator, stamps, a job, a party, a flash mob, the Dance Jam): `app/public/video/clips/`, made by `npm --prefix video run clips` |
| **Share cards** | `app/public/og/club-nyc.jpg` (Liberty Island) and `invite.jpg` (the Empire State Building at sunset), 1200×630, made by `npm --prefix video run render -- --only=cards`. Neither shows "I ♥ NY" (see the ground rules) |
| **Music** | "Sidewalk Shuffle", an original theme in the spirit of Club Penguin's music (bouncy cartoon pop; none of its melodies, which are Disney's). A soft, plucky lead doubled by a marimba, a bass hopping between octaves, chord stabs on the offbeats, claps, shuffled hi-hats, a tick-tock woodblock and a slide whistle into the drops, all synthesized in `video/capture/music-entry.ts` (no samples). 100 BPM, so every beat is exactly 18 frames and every cut lands on a beat. -14 LUFS, peaks under -1 dB, with the quiet intro kept quiet. (It replaced an acoustic version the user found annoying, 19 October 2026.) |
| **Sound effects** | The game's own (`app/src/audio.ts`), tuned to the song's key: chat pops, coins, stamps, furniture landing, plus a cab's horn |
| **Fonts** | Burbank Small Bold and Medium, same as the game |

## The idea

A day in the city, told by three friends' group chat ("the crew"). Each message is a cut: someone needs a new outfit,
someone takes the scenic route, someone has to make rent, someone spots the Dance Jam. Inspired by launch films on
[recent.design](https://recent.design/launch-videos): Poke and Orchid tell the story through a chat, Pond sets words on
the beat, and Fomo uses one recurring device to move between scenes. Here that device is a yellow cab that honks and
drives across two cuts, leaving the next scene behind it on a strip of taxi checker.

## Script

One bar is 4 beats = 2.4 s. Messages and words appear on the beat.

| Time | Music | Picture | On screen |
|---|---|---|---|
| 0:00–0:05 | Marimba and a tick-tock woodblock, then a slide whistle up | Times Square, out of focus, under the group chat | "who's around today?" · "me!!" · "meet in Times Square? 🍕" · "omw! 🚕" |
| 0:05–0:07 | The drop: the whole band, the tune on the lead and marimba | The crowd comes into focus as the logo lands | **Club NYC** · **Waddle on over to New York.** |
| 0:07–0:10 | | The New Yorker creator, a new look on every beat | "wait, new fit first" · **Make your New Yorker** |
| 0:10–0:14 | A honk | The cab drives across; the map, then a landmark per beat: Central Park, Brooklyn Bridge, Liberty Island, the Empire State Building, Grand Central, Rockefeller Center | "taking the scenic route" · **Explore 20+ places**, with each place's sign |
| 0:14–0:17 | | Friends in the middle of Times Square | **Meet your friends** · **Make new ones** |
| 0:17–0:19 | | Showtime, Ferry Captain, Halal Rush, Bagel Counters; coins pop | "brb, gotta make rent" · **Work silly jobs** |
| 0:19–0:22 | | The Dance Jam starting | "DANCE JAM IN 1 MIN!!!" · **Dance Jams every 8 minutes** |
| 0:22–0:24 | | A flash mob taking over the lawn in Central Park | "too late, started my own" · **Start a flash mob anywhere** |
| 0:24–0:29 | The breakdown: bass, marimba and claps, then a snare roll and the slide whistle again | A walk-up apartment, furniture landing on the beat, then a house party | "afterparty at mine?" · **Decorate your place** · **Throw a house party** |
| 0:29–0:34 | The last chorus, in harmony, plus tambourine; a honk | The cab again, then one more thing per beat: stamps, the photo booth, Neighborhood Wars, Today in the City, shopping in SoHo, the Met steps, Slice Factory | each name, then **and so much more** |
| 0:34–0:38 | The tune's last line, ending on G | Everyone in Times Square | "same time tomorrow?" · **The Big Apple is waiting.** |
| 0:38–0:43 | Ta-da on C, and a little marimba sparkle | End card | Logo · Play now · No download · Ages 13+ · Early access |

## Ground rules

- **Real gameplay only.** No mocked-up screens, no invented player counts, no reviews.
- **Things that make sense in the city.** No snowball fights on a summer lawn: the game still has snowballs (press T),
  but the marketing shows flash mobs instead.
- **"Early access" on the end card**, matching the landing page.
- **No em dashes** in on-screen text.
- **The web address is a prop.** Once the domain is live: `npm --prefix video run render -- --url=clubnyc.com`.
- **The music is original.** It borrows Club Penguin's mood (bouncy, cheerful, cartoony), never its melodies. The
  real "Empire State of Mind" (Jay-Z and Alicia Keys), or any other commercial song, would need a sync licence. A
  licensed track can replace `video/public/audio/trailer.wav`; the cuts are on a 100 BPM grid, so a song at another
  tempo would need the beats in `video/src/timeline.ts` changed to match.
- **Kept out on purpose:** the subway map and the subway car's line strip (MTA-style route bullets; Showtime is framed
  below it) and the newspaper's front page (real public figures). See
  [../launch/legal-callouts.md](../launch/legal-callouts.md). Times Square's "I ♥ NY" shop sign does appear in the
  trailer's Times Square shots; the hero loop is framed below it and the share cards use other places.

## Make it again

Re-capture after visual changes (a new avatar, new places) and everything picks them up. The footage, soundtrack
and copied game files are generated, so they're git-ignored.

```bash
bash tools/qa_stack.sh                               # in its own terminal: a private copy of the game on :5197
.venv/bin/python video/capture/capture.py            # footage -> video/public/footage/ (about 6 minutes)
.venv/bin/python video/capture/music.py              # soundtrack -> video/public/audio/trailer.wav (10 seconds)
npm --prefix video run studio                        # preview and tweak in Remotion Studio
npm --prefix video run render                        # trailer, hero loop and share cards -> app/public/ (+ masters in video/out/)
npm --prefix video run clips                         # the landing page's tile clips -> app/public/video/clips/
```

- `capture.py` takes scene names to redo just some: `crowd creator map places jam jobs party stamps extras flashmob hero`.
  `creator` also cuts the friends' faces for the group chat (`face-N.png`); `flashmob` and `hero` film at 2560 px from
  the original art (`app/public/art/raw/`), so close-ups and the hero stay sharp.
- `render` takes `--only=trailer`, `--only=hero` or `--only=cards`; `clips` takes clip names (`-- flashmob jam`).
- The beat grid, the scenes' timing and the sound effects live in `video/src/timeline.ts`; the scenes are in
  `video/src/scenes.tsx`, the chat, the cab and the other pieces in `video/src/ui.tsx`.
- **Checking the music without listening:** `music-entry.ts` can leave parts out (`renderTrailerAudio(['lead', …])`),
  so each instrument can be rendered alone and measured (ffmpeg `ebur128` for loudness, a spectrum for balance).
- **Mac gotcha:** macOS won't let Chrome's helper processes read files under `~/Desktop`, so Remotion's headless
  Chrome lives in `~/Library/Caches/club-nyc-remotion/` (see `video/remotion.config.ts`). If renders fail with
  "Target closed" and "icudtl.dat not found", move `video/node_modules/.remotion/chrome-headless-shell/mac-arm64/chrome-headless-shell-mac-arm64` there.

Remotion is free for individuals and companies of up to 3 people; bigger companies need a
[company licence](https://www.remotion.pro/license).
