# Build brief: real New York things to do (Nov 11, 2026)

You're building one feature of Club NYC, a cartoon New York City game (Vite + TypeScript, DOM stage). The founder's
direction: each place does its **real New York thing** (eat it, see it, walk it, buy it), first person, with true
details, not generic mini-game filler. The bar is three things already built: the first-person subway turnstile
(`app/src/features/turnstile.ts`), the 9/11 Memorial parapet (`app/src/features/memorial.ts` + `.css`) and the Brooklyn
Bridge walk (`app/src/features/bridgeWalk.ts` + `.css`). **Read memorial.ts and bridgeWalk.ts first**: copy their
structure (a full-stage scene appended to `stage.root`, `hold()` while open, Escape and a small button to leave,
timers/listeners/audio cleaned up on close, `audioCtx()` + `onMute` for sound, a quiet caption top-left).

## Hard rules

- **Create new files only**, in `app/src/features/moments/` (`<name>.ts` and `<name>.css`). Do NOT edit any existing
  file (rooms.ts, stamps.ts, items.ts, Help pages, other moments, CSS). The lead wires everything afterwards.
- Export one function per entry point, signature `(g: Game) => void` (import `type { Game } from '../../types'`).
- The art is already made; use it from the paths listed in your section (public URLs like `/art/places/x.jpg`). Do not
  generate new art. Small extras (frames, labels, sparkles, buttons) are CSS/SVG.
- Stage is 1000 × 565 logical units (CSS px inside `stage.root`, scaled to fit). Put everything in those units.
  `toStage(e)` from `../../engine/stage` converts a pointer event to stage units.
- Typecheck must pass for your files: `cd app && npx tsc --noEmit -p .` (noUnusedLocals is on). Other helpers are
  writing other files in `features/moments/` at the same time; ignore errors that are only in their files.

## Style

- Fonts: only the game's Burbank via `var(--display)` (bold, titles/buttons) and `var(--body)`; sizes `var(--fs-sm)`,
  `var(--fs-lg)`. Colours: ink navy `#1d2140`, paper `#fbfaf6`, sun `#ffd166`. Buttons: existing classes `btn go`,
  `btn small`, `btn tiny ghost`.
- **No em dashes anywhere in copy.** Title Case on buttons ("Step Back", "Walk On").
- Less text, more picture: hints are 2 to 4 words; no paragraphs, no info cards with button rows, no modals. One true
  line at a time, shown like the memorial's `.mem-line` (fades in, bottom center), at most one every few seconds.
- Humor about 30%, deadpan New York. Never in instructions, status or prices.
- True details only. If you state a fact, be sure it's right; list every fact you used in your report.
- Respect `prefers-reduced-motion`. Mute: `audioCtx()` returns null when muted.
- The game API (`app/src/types.ts`, `Game`): `g.say(text)`, `g.spend(n, reason): boolean` (coins; shows its own
  "not enough coins"), `g.stamp(id)`, `g.toast(text, icon)`, `g.goto(roomId)`, `g.emote(kind, secs)`, `g.sfx.*`
  (see `app/src/audio.ts`: click, coin, pop, quack, squawk, ding, register, whoosh, honk...), `g.owns(itemId)`,
  `g.wear(itemId)`. The player's look: `save.look` from `../../state`. Avatars as SVG:
  `avatarMarkup(look, { mood: 'grin', d: 1 })` inside `<svg viewBox="-60 -185 120 192">` (from `../../avatar/render`),
  random locals: `randomLook()` from `../../avatar/random`.
- Don't award stamps that don't exist yet: put `g.stamp('your-id')` calls in, and list each stamp (id, name, emoji
  that exists in `app/src/data/emojiIcons.ts`, description, tier 1/2/3) in your report; the lead adds them.

## Testing

- A private copy of the game is already running at **http://localhost:5197** (don't start or stop servers).
- Open your feature in dev with `window.playMoment('<file>', '<exportName>')` (it loads `features/moments/<file>.ts`).
- Drive it headlessly with Python Playwright: `.venv/bin/python` (from the repo root). Copy and adapt
  `/private/tmp/claude-501/-Users-mayankkinger--claude-spares-spare-wuA8ub/2c965340-e0e9-45c7-861f-e0bd9875c827/scratchpad/after_check.py`
  (it seeds an offline `?profile=` save, then drives the game; use your own profile slot name). Viewport 1280×723.
- Take screenshots, **look at them**, and iterate until it looks finished and good. Save your best 3 to 5 to
  `docs/research/agent-playtest/round2/shots/<feature>-<n>.png`.
- Vite hot-reloads when anyone saves a file; if a test run gets interrupted, just run it again.

## Report back

Files created; export name(s); how it plays, step by step; stamps to add; the wiring line you suggest; coin prices;
facts used; screenshot paths; anything unfinished or uncertain.
