# Mini-games — how to build one

Each game lives in `src/games/<id>/index.ts` (default-export a `MiniGame`, see `types.ts`) plus an optional
`src/games/<id>/style.css` imported from index.ts. **Prefix every CSS class with `<id>-`.** Only touch files in
your own folder. The registry (`registry.ts`) already points at your folder.

## Contract
- Render everything inside `ctx.root` — a 1000 × 565 box in logical px (the stage scales it for the screen).
  Use `ctx.toLocal(event)` to turn pointer events into root coordinates.
- Run your loop with `requestAnimationFrame`. Register cleanup with `ctx.onExit(() => …)` (cancel RAF, remove
  window listeners, stop audio nodes).
- Flow: **intro card** (title, 1–3 line how-to, big Start button) → play (≈1.5–3 min) → **game over** →
  `ctx.end({ coins, score, lines, flags })`. The host shows the payout card and returns the player to the world.
  Payout: ~10–60 coins for a decent round, scaled by score (great players can earn more).

## Look & feel (Club Penguin style — make it feel hand-crafted, not generic)
- Backgrounds and sprites were illustrated for you (paths in your brief). Draw any extra UI as chunky shapes with a
  thick dark outline `#1d2140` (3px), rounded corners, flat colors with one shadow tone.
- Font: `font-family: var(--display)` (Burbank Small Bold — the original Club Penguin font).
- Buttons: copy the look of `.btn` in `src/style.css` (blue gradient, dark outline, bottom shadow) — or reuse the
  `btn` class directly.
- Juice: pop-in tweens, little bounces, floating "+3" numbers, sparkles, light screen shake on mistakes, combo text.
- Sounds: `ctx.sfx.click/pop/coin/register/honk/coo/quack/purr/chime/train/whoosh/ding/stamp/toot/squawk/tick/
  clapper()` and `ctx.sfx.piano(midi)`. You may add your own WebAudio inside your module.

## People
`ctx.avatar(look?, unit?)` returns an `AvatarView`:
- `.el` is a zero-size div whose origin is the avatar's **feet**. Put it in an absolutely-positioned wrapper at the
  feet point. Default `unit` 0.72 ≈ 108 px tall; scale by changing `unit` or a CSS transform on your wrapper.
- `.setPose('idle'|'walk'|'dance'|'wave'|'cheer'|'sit'|'jump'|'skate')`, `.face(1|-1, back?)`,
  `.setMood('smile'|'grin'|'o')`, and call `.update(dt)` every frame.
- `ctx.look` is the player's outfit; `ctx.randomLook()` gives random New Yorkers.

## Testing
The dev server is already running at http://localhost:5173. Open **http://localhost:5173/?game=<id>** in your OWN
browser tab (create one with `mcp__Claude_Browser__tabs_create`, then always pass that `tabId`; never touch other
tabs; close yours when done). Play it for real: screenshots, clicks, keys. Typecheck with
`cd app && npx tsc --noEmit` and fix errors in your files.
