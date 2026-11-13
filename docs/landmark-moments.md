# Landmark moments: replacing the one info card

2026-11-11. The user's brief: clicking the Bull, Prometheus or the flags all open the same card (picture left, text
right, a pigeon's line). It reads as bland. Reference: "I Played 100% Of Club Penguin Games" (Sno, 76 min), studied
from its captions and a frame every 30 seconds.

## What the Club Penguin video shows

1. **The object is the game.** An arcade cabinet in the lounge is Astro Barrier. A hole in the ice is Ice Fishing.
   The pizza oven is Pizzatron. Nothing opens a shared "about this thing" panel.
2. **Every activity has its own stage and look.** A dojo with a sensei, a mine cart tunnel, a fishing hole. No two
   share a frame.
3. **Depth comes from stamps in tiers.** Each game has 5 to 27 stamps, colour-coded easy to brutal: finish it, finish
   it clean, finish it fast, find the secret (wait 30 seconds on a loading screen and a hidden ship appears; a squid
   with a 5% chance of showing up; let your pet win).
4. **Rooms have things to do together.** Dance with 30 penguins in a hard hat, serve 50 coffees, fill every
   instrument in the band, hit the clock target 10 times in a row. The narrator's best moments were all with people.
5. **The end card is always "3 of 20 stamps" and coins,** so you know there is more.

## The rule for Club NYC

A landmark opens a **moment**: something you do with your hands on the thing itself, in the room. No card, no
caption strip, no button row (the user cut the brass plaque on 2026-11-11: "ingrain it in the experience"). You leave
by clicking away, Escape, or a small x. Each moment should have:

- a verb you perform (rub, toss, guess, ring, row, whisper), not a button that performs it for you
- a different result each time (skill, luck, or a daily roll)
- an easy stamp, a hard stamp, and where it fits, a secret
- its own look. Never reuse another landmark's frame.

Code: `app/src/features/moments/` (`kit.ts` is shared plumbing; one file per landmark).

## Built (first three)

| Landmark | Moment | Stamps |
|---|---|---|
| The Bull, Wall Street | Drag back and forth on his nose. The bronze shines, the luck meter fills, he snorts, the ticker prints today's luck (one per New York day). | Bull Market, Regular at the Bull (3 days), Wrong End (secret) |
| Prometheus, Rockefeller | A marker swings on a power bar. Click to toss a coin: ice, fountain, or bonk the statue. The thin gold line goes through his ring. Speeds up each wish. | Make a Wish, Through the Ring |
| The Flags, Rockefeller | Flag Roll Call. A flag runs up the pole, name it before the rope burns out. Five a round, 32 to collect. | Roll Call, Honorary Diplomat (5 of 5), Every Flag Flying (all 32) |

## Next, in the order I'd build them

| Landmark | Moment | Why it's different |
|---|---|---|
| Whispering Gallery, Grand Central | Two-player: stand in opposite corners, one types, only the other hears it. Solo: a local whispers a secret. | The first social landmark |
| Love Locks, Brooklyn Bridge | Engrave a lock with a friend's name and hang it. Everyone sees the locks build up. | Leaves a mark in the world |
| Bow Bridge rowboats, Central Park | Actually row: alternate left and right, steer under the bridge, dodge the ducks. | Replaces a 3-second text card |
| Washington, Federal Hall | Repeat the oath: the words light up, you click them in order, faster each round. | Memory game, 30 seconds |
| Opal Clock, Grand Central | "Meet Me at the Clock": drop a meeting pin friends can see on the map. | Social hook |
| Tower viewers (Empire, Liberty, Sky Deck) | Spot-the-landmark through the viewer against a timer. | Reuses the binoculars |
| Fire hydrant, Fifth Avenue | Open it with a wrench (hold and turn), everyone nearby gets sprayed and can dance in it. | Shared room event |
| The Big Board, Wall Street | Already a call-the-market toy. Add a daily streak stamp. | Small |
| Statue of Liberty crown | The 354 steps as a rhythm climb (tap in time), not a counter. | Same content, played |
| 9/11 Memorial, Survivor Tree | Stay quiet. Keep the calm card. | Not everything should be a game |

Shops, benches, carts and exits keep what they have: they already do something.
