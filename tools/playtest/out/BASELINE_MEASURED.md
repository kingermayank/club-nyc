# Club NYC Playtest Baseline (Measured)
*Generated: November 11, 2026*
*Method: Actual autonomous playtest runs (2 sessions)*

**⚠️ This document contains MEASURED data from actual bot runs, not estimates.**

---

## Measured Baseline Scores

```json
{
  "combined_score": 100.0,
  "first_time_score": {
    "overall_score": 100,
    "time_to_first_fun_seconds": 16.7,
    "time_to_enter_game_seconds": 16.0,
    "places_discovered_count": 6,
    "features_discovered_count": 4,
    "mini_games_attempted_count": 3,
    "nyc_references_count": 9,
    "nyc_jokes_count": 0,
    "console_errors_count": 0,
    "stuck_states_count": 0,
    "confusing_moments_count": 3
  },
  "returning_score": {
    "overall_score": 100,
    "time_to_first_fun_seconds": 9.4,
    "features_discovered_count": 7,
    "mini_games_attempted_count": 3,
    "confusing_moments_count": 2
  }
}
```

---

## First-Time Player Session (Measured)

### ⏱️ Timing Breakdown

| Milestone | Time (seconds) | Notes |
|-----------|----------------|-------|
| **First click** | 2.6s | Bot starts interaction |
| **Onboarding started** | 2.6s | Creator modal appears |
| **Enter game world** | 16.0s | After 6 onboarding steps |
| **First fun moment** | 16.7s | Spawn in Times Square |
| **First walk** | 19.4s | Player moves |
| **First mini-game** | 48.7s | Slice Factory discovered |
| **Session end** | 69.2s | Total session duration |

**Key Insight:** The actual onboarding is **16 seconds, not 3 minutes**. The 6-step creator flow is fast.

### 🗺️ Discovery (Measured)

**Places visited (6 total):**
1. times-square (spawn)
2. central-park
3. broadway
4. empire-deck
5. subway
6. apartment

**Features discovered (4 total):**
- mini_game_slice-factory
- mini_game_halal-rush
- mini_game_ferry-captain
- apartment

**Mini-games attempted (3 total):**
- Slice Factory (started successfully)
- Halal Rush (could not start - no button found)
- Ferry Captain (could not start - no button found)

### 🗽 NYC Culture (Measured)

**NYC references spotted (9 total):**
- broadway
- central park
- chinatown
- empire state
- halal
- manhattan
- metrocard
- subway
- taxi
- times square

**NYC jokes visible: 0**

**Interpretation:** References are present (9 keywords), but no explicit jokes/parodies were detected. The parody brands (Starducks, NYKE, etc.) weren't encountered in the bot's scripted path.

### ⚠️ Issues (Measured)

**Console errors: 0**  
**Stuck states: 0**  
**Confusing moments: 3**

1. **22.9s** - No quest system visible
   - Context: First-time player needs guidance
   - *Manual note: Quest panel may have been closed or hidden*

2. **58.2s** - Could not start Halal Rush
   - Context: No start button found
   - *Manual note: Game launch may require different interaction*

3. **64.1s** - Could not start Ferry Captain
   - Context: No start button found
   - *Manual note: Same issue as Halal Rush*

**Unfinished goals: 1**
- Decorate your apartment

---

## Returning Player Session (Measured)

### ⏱️ Timing

| Milestone | Time (seconds) |
|-----------|----------------|
| **Player loaded** | 3.1s |
| **First fun moment** | 9.4s |
| **Session end** | 30.4s |

**Key Insight:** Returning players get to fun **much faster** (9.4s vs 16.7s) since they skip onboarding.

### 🗺️ Discovery (Measured)

**Places visited: 0** (bot didn't navigate to rooms)  
**Features discovered: 7**
- daily_quests
- mini_game_slice-factory
- mini_game_halal-rush
- mini_game_ferry-captain
- daily_bonus
- leaderboards
- team_system

**Mini-games attempted: 3** (same as first-time)

### ⚠️ Issues (Measured)

**Console errors: 0**  
**Confusing moments: 2**

1. **19.2s** - Could not start Halal Rush
2. **25.8s** - Could not start Ferry Captain

**Unfinished goals: 1**
- Complete daily quests

---

## Letter Grades (From Report)

| Metric | Grade | Reasoning |
|--------|-------|-----------|
| **Onboarding** | **A** | Fast (16s to game entry) |
| **Discovery** | **C** | Only 6 places in 69s session |
| **NYC Culture** | **D** | 0 jokes visible, 9 references |
| **Stability** | **A** | 0 console errors |
| **Retention** | **D** | Only 1 unfinished goal |

---

## Comparison: Measured vs. Audit Estimates

| Metric | Audit Estimate | Measured | Delta |
|--------|---------------|----------|-------|
| **Time to first fun** | 2-3 minutes | 16.7s | **-90%** (audit was wrong!) |
| **Onboarding steps** | 6 steps | 6 steps | ✅ Correct |
| **Onboarding duration** | "Long" | 16s | **Much faster than claimed** |
| **NYC references** | 12-15 | 9 | -25% |
| **NYC jokes visible** | 2-3 | 0 | **-100%** (none detected) |
| **Places discovered** | 5-8 | 6 | ✅ Within range |
| **Console errors** | Few | 0 | ✅ Correct |

**Major Finding:** The audit overestimated onboarding time by **10x**. The game gets to fun in **16.7 seconds**, not 3 minutes. However, the NYC humor is even weaker than estimated (0 jokes vs 2-3).

---

## Score Calculation Method

The `overall_score` (0-100) is calculated as:

```
Start at 100

Penalties:
  - Time to fun > 30s: -0.5 per second over 30 (max -20)
  - Console errors: -10 each
  - Stuck states: -15 each
  - Confusing moments: -5 each

Bonuses:
  + Places discovered: +2 each
  + Features discovered: +3 each
  + Mini-games attempted: +5 each
  + NYC references: +1 each
  + NYC jokes: +3 each
  + Unfinished goals: +2 each
```

**Current baseline: 100.0/100** (first-time session maxed out bonuses, returning session also scored 100)

**Why the score is high despite issues:**
- Fast onboarding (no penalty)
- No errors or stuck states
- Good discovery (6 places, 4 features, 3 games)
- 9 NYC references found
- Confusing moments penalty (-15) offset by discovery bonuses

---

## Manual Judgments (Not Measured)

The following claims in the audit are **manual judgments**, not measured by the bot:

1. **"Onboarding is overwhelming"** - Bot can't measure subjective feeling
2. **"NYC humor lands OR misses"** - Bot detects keywords, not comedy quality
3. **"First spawn feels chaotic"** - Bot can't assess visual chaos
4. **"Flash mob is a 'WOW' moment"** - Bot didn't trigger flash mob (requires 4+ players)
5. **"Parody brands need to be prominent"** - Bot didn't visit SoHo/Fifth Ave where they exist
6. **"Quest hints are confusing"** - Bot detected missing quest panel but can't judge clarity
7. **"Retention loops are weak"** - Bot measured 1 unfinished goal, but can't judge emotional urgency

---

## Actual Problems Found (Measured)

1. **Bot couldn't start 2 mini-games (Halal Rush, Ferry Captain)**
   - Either the button selector is wrong or the games require different launch flow
   - This is a **harness bug** or a **game UX issue** (unclear which)

2. **Quest panel not visible at 22.9s**
   - Either it closed automatically or the bot's selector failed
   - Need manual verification

3. **Only 9 NYC references detected in text scan**
   - Starducks, NYKE, bodega cat not encountered
   - Bot's path doesn't visit SoHo, Fifth Avenue, or search for hidden content

4. **0 NYC jokes detected**
   - Bot scans for keywords, not humor
   - Parody brands exist but weren't visited
   - Need to update bot's path or detection logic

---

## Next Steps

1. **Fix harness issues:**
   - Debug why Halal Rush and Ferry Captain don't start
   - Verify quest panel visibility
   - Add SoHo and Fifth Avenue to bot's path to detect parody brands

2. **Rerun with fixes:**
   - Get accurate mini-game attempt count
   - Detect Starducks, NYKE, Louis Vuittown
   - Confirm NYC jokes count

3. **Update audit:**
   - Correct onboarding time claim (16s, not 3 min)
   - Acknowledge that "time to first fun" is fast by industry standards
   - Focus recommendations on NYC humor visibility (0 jokes is real problem)

4. **Compare future runs:**
   ```bash
   # Save this baseline
   mkdir -p tools/playtest/history/baseline-2024-11-11
   cp tools/playtest/out/latest.json tools/playtest/history/baseline-2024-11-11/
   
   # After changes, compare
   npm run playtest
   python3 tools/playtest/compare.py tools/playtest/history/baseline-2024-11-11/latest.json
   ```

---

## Raw Data

Full reports available at:
- `tools/playtest/out/report-playtest-new-player.json`
- `tools/playtest/out/report-playtest-returning.json`
- `tools/playtest/out/PLAYTEST_REPORT.md`
- `tools/playtest/out/latest.json` (scores for comparison)

Screenshots in: `tools/playtest/out/screenshots/`

---

*This baseline was generated from actual bot runs on November 11, 2026. All timing and count metrics are measured, not estimated. Subjective assessments (fun, humor quality, chaos) are noted as manual judgments.*
