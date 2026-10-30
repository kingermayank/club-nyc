# The story we tell (Oct 30, 2026)

The full report, with every number sourced, is the **Club NYC Story Report** doc: https://claude.ai/artifact/JPBEKcsDcMtXNBX2MjzVL5.
This file is the short version for whoever builds the next post.

## The story

"The penguin game grew up" is the first beat, not the whole story. Tell it in three:

1. **Then:** after school, everyone was online in one safe, silly place.
2. **Now:** we grew up. Rent got weird, friends moved to other cities, the group chat says "we should hang out".
3. **Here:** that place grew up and moved to New York. The apartment is free, the job is folding pizza, the crew is one link away.

The line: **Same crew. Bigger city.** Also: "Move to New York. Bring everyone." · "Only one of them has free rent." ·
"The city keeps changing. The good parts stay."

Who it's for: 21 to 32. The grown-up penguin, the almost-New Yorker (priced out, newly arrived, or gone and missing it), and
the long-distance crew. Celebrate, don't mourn. Never scold staying in. Rent jokes aim at the city, never at newcomers or natives.

## What's built (all in tools/instagram/plan.mjs, series STORY, REAL, MONEY, APT, MEME)

| Piece | Source | Out |
| --- | --- | --- |
| Story film, 19 s | `move-to-ny` in video/src/reels.ts (photo shots in grey, then the game) | Nov 1, 12:00 |
| Real New York vs Club NYC | `real-vs-club` carousel (posts.ts) and reel (reels.ts) | Nov 2 · Nov 9 |
| New York, then. Club NYC, now | `then-and-now` reel and carousel | Nov 13 · Dec 9 |
| StreetCheesy listings | `streetcheesy` carousel (prices and fine print from app/src/data/homes.ts) | Nov 15 |
| Money diary | `money-diary` carousel (shop prices; shift pay under server/src/game/rules.ts caps) | Nov 29 |
| Memes | `meme-40x`, `meme-pizza-principle` | Nov 13 · Dec 21 |

New layouts: posts.ts `split` (cover), `real` (photo over game), `listing`, `diary`; reels.ts `mode: 'real'` (photo over a
game clip) and `mode: 'photo'` (a photo alone, `mono` for grey). Check crops before a full render:
`node video/scripts/reel-frames.mjs <reel-id>` writes one frame per shot to video/out/frames/<id>.jpg.

## Rules for real photos

- Public domain or CC0 only, checked file by file (Wikimedia Commons `LicenseShortName`). Library of Congress "no known
  restrictions" is not enough by itself: ours are US government work, Carol M. Highsmith's public-domain gift, pre-1900 prints or CC0.
- Every photo lives in video/public/posts/real with its entry in credits.json, and the credit is drawn on the image.
- No identifiable people, no store names or logos (old signs too: crop them), no I ♥ NY, no MTA bullets or signs, no
  sculptures (the Charging Bull), no Twin Towers, nothing near the 9/11 memorial. The Empire State Building is skyline or the
  view from it, never the hero.
- Best next step: shoot our own photos at the game's camera angles (the "same corner, two cities" wipe needs it).

## Every Club NYC line must be true in the game

Check app/src/data/rooms.ts, homes.ts, economy.ts and server/src/game/rules.ts before writing a claim. Example: the ferry ride
from Battery Park costs 2 coins (app/src/features/extras.ts), so "the ferry is free in Club NYC" was wrong and is gone.
Real-world numbers carry their source in the caption (StreetEasy's Manhattan median asking rent was $4,995 in Sept 2026;
the 40x rule at the $4,150 citywide median is $166,000 a year; a median slice is $3.81 against a $3 fare).

Kept out of posts: the mayor, the rent freeze, free buses, delivery workers' pay.
