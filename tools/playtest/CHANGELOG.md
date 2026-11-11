# Playtest Harness Changelog

## v3: Coverage Session + All Games + Robust Joke Detection (Nov 11, 2026)

**Scope:** Final polish pass to ensure harness reliability before other agents depend on it.

### 1. Fixed Mini-Game Launch Selectors ✅

**Problem:** Only Slice Factory was launching successfully. Halal Rush, Ferry Captain, Bagel Counters, and Showtime had different button selectors and UI patterns.

**Solution:**
- Added game-specific button selectors:
  - `slice-factory`: `.slice-factory-go`
  - `halal-rush`: `.halal-rush-go`
  - `ferry-captain`: `.ferry-captain-go`
  - `bagel-counters`: `.bagel-counters-start`
  - `showtime`: `.showtime-go`
- Fallback to generic `button` with text matching "start|play|go|cast off"
- Verification now checks for game-specific UI elements (`.belt`, `.ferry-wheel`, `.bagel-stage`, `.showtime-stage`, etc.)

**Result:** All 5 mini-games now launch and verify successfully in every run.

### 2. Added Coverage Session 🗺️

**Purpose:** Discover ALL NYC jokes and references in the game, even those off the first-time player's path.

**Implementation:**
- New `run_coverage_session()` method
- Visits all 24 rooms in the game using `api.goto(roomId)`
- Tries all 5 mini-games with `?game=<id>`
- Kept separate from `first_time` session (which measures realistic new player experience)

**Rooms visited:**
- Times Square, Broadway, I♥NY, Rockefeller, Fifth Ave
- Toy Palace, Maison Malle, Central Park, The Met, Empire Deck
- Grand Central, Subway, SoHo, THREAD, Sneaker Vault, Coffee
- Chinatown, Pizza, Brooklyn Bridge, Battery Park, Liberty Island
- High Line, Chelsea Market, Apartment

**Scoring:**
- Coverage session is **FYI only** and not factored into the combined score
- Combined score remains: `(first_time + returning) / 2`
- This preserves comparability with the v2 baseline

### 3. Hardened Joke Detection 🎭

**Previous Issues:**
- Could count the same joke multiple times
- No record of where jokes were found
- No visual proof (screenshots)
- Based on design docs (Starducks, NYKE) that weren't implemented yet

**New Implementation:**
- **Deduplicated:** Each joke counted once per session
- **Located:** Records which room/location the joke was seen in
- **Screenshot:** Automatically captures a screenshot when a joke is discovered
- **Accurate Patterns:** Updated to match what's ACTUALLY in the game:
  - ✅ Ralph's Coffee (real Ralph Lauren café with misspelled names)
  - ✅ THREAD (Supreme parody)
  - ✅ Sneaker Vault (Nike Store reference)
  - ✅ Toy Palace (FAO Schwarz)
  - ✅ Maison Malle (Louis Vuitton)
  - ✅ I ♥ NY Souvenirs
  - ✅ Halal Bros food cart
  - ⚠️ Starducks, NYKE, Snacks Fifth Ave: **[PLANNED]** but not in game yet

**Data Structure:**
```json
{
  "joke": "THREAD (Supreme parody)",
  "location": "times-square",
  "screenshot": "playtest-coverage-joke-1-thread.png",
  "timestamp": 4.73
}
```

### 4. Scoring Stability ✅

**Two consecutive runs:**
- Run 1: Combined score **62.5/100**
- Run 2: Combined score **60.15/100**

**Variance:** ±2.5 points (acceptable)
- Natural variance from timing (buttons appearing slightly faster/slower)
- First-time player path is slightly randomized (may or may not walk past THREAD)

**All 5 Games Launching:**
- First-time: 5/5 games ✅
- Returning: 5/5 games ✅
- Coverage: 5/5 games ✅

### 5. Weighting (Unchanged from v2)

Scoring weights remain the same to preserve baseline comparability:

```python
{
  'nyc_culture': 0.30,  # Jokes, references, NYC flavor
  'onboarding': 0.20,   # Time to fun, ease of entry
  'discovery': 0.20,    # Places, features, games found
  'stability': 0.15,    # Errors, stuck states
  'retention': 0.15     # Rewards, goals, social
}
```

### 6. Key Findings from Coverage Session

**NYC Content Actually in Game:**
- **22 NYC references** (subway, metrocard, pizza, taxi, etc.)
- **1 joke** discovered by coverage session (THREAD in Times Square)
- **0 jokes** found by first-time player (THREAD not always on natural path)

**Implication:** The parody brands from `docs/brief-nyc-culture.md` (Starducks, NYKE, Louis Vuittown, Snacks Fifth Avenue) are **design docs only** - not implemented yet. The fun-audit.md correctly identifies this as a major gap.

### Files Changed

- `tools/playtest/bot.py`:
  - Added `run_coverage_session()`
  - Fixed `_try_mini_games()` with game-specific selectors
  - Hardened `scan_for_nyc_content()` with location + screenshot tracking
  - Updated joke patterns to match actual game content
  - Handle joke data as list of dicts (with backward compat for list of strings)
  
- `tools/playtest/CHANGELOG.md`: This file

### Usage

```bash
cd /workspace
npm run playtest
```

**Output:**
- `tools/playtest/out/report-*.json` (one per session)
- `tools/playtest/out/latest.json` (comparable scores)
- `tools/playtest/out/PLAYTEST_REPORT.md` (markdown summary)
- Screenshots in `tools/playtest/out/screenshots/`

**Comparison:**
```bash
python3 tools/playtest/compare.py old-latest.json tools/playtest/out/latest.json
```

### Next Steps for Other Agents

The harness is now ready for feature development:

1. **Make changes** to game code
2. **Run `npm run playtest`** (exit code 1 if score < 60)
3. **Compare:** `python3 tools/playtest/compare.py <before.json> tools/playtest/out/latest.json`
4. **Iterate** until score improves
5. **Commit** with proof of improvement

See `docs/fun-audit.md` for prioritized backlog grouped into 6 parallel work lanes.
