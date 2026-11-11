# Club NYC Playtest Report
*Generated: 2026-11-11 20:19:55*

## Executive Summary

This report captures autonomous playtest sessions simulating first-time and returning players.


### Session 1: First Time

#### ⏱️ Key Timings

- **Total duration**: 20.0s
- **Time to first interaction**: 2.0s
- **Dead time** (gaps > 5s): 15.0s

#### 🗺️ Discovery

- **Places discovered**: 0 (none)
- **Features discovered**: 0 (none)
- **Mini-games tried**: 0 (none)

#### 🗽 NYC Culture & Humor

- **NYC references spotted**: 0
- **NYC jokes/parodies seen**: 0

#### ⚠️ Issues & Friction

- **Console errors**: 2
  - `Failed to load resource: the server responded with a status of 500 (Internal Server Error)`
  - `Failed to fetch dynamically imported module: http://localhost:5173/src/game.ts?t=1794428346848`
- **Stuck states**: 1
  - At **initial_load** (20.0s): Game failed to load within timeout
- **Confusing moments**: 0

#### 🔄 Retention Signals

- **Rewards earned**: 0
- **Unfinished goals**: 0
- **Social connections**: 0

### Session 2: Returning

#### ⏱️ Key Timings

- **Total duration**: 11.6s

#### 🗺️ Discovery

- **Places discovered**: 0 (none)
- **Features discovered**: 0 (none)
- **Mini-games tried**: 0 (none)

#### 🗽 NYC Culture & Humor

- **NYC references spotted**: 0
- **NYC jokes/parodies seen**: 0

#### ⚠️ Issues & Friction

- **Console errors**: 4
  - `Failed to load resource: the server responded with a status of 500 (Internal Server Error)`
  - `Failed to fetch dynamically imported module: http://localhost:5173/src/game.ts?t=1794428346848`
  - `Failed to load resource: the server responded with a status of 500 (Internal Server Error)`
  - ...and 1 more
- **Stuck states**: 0
- **Confusing moments**: 0

#### 🔄 Retention Signals

- **Rewards earned**: 0
- **Unfinished goals**: 0
- **Social connections**: 0

### Session 3: Returning

#### ⏱️ Key Timings

- **Total duration**: 11.0s
- **Dead time** (gaps > 5s): 10.6s

#### 🗺️ Discovery

- **Places discovered**: 0 (none)
- **Features discovered**: 0 (none)
- **Mini-games tried**: 0 (none)

#### 🗽 NYC Culture & Humor

- **NYC references spotted**: 0
- **NYC jokes/parodies seen**: 0

#### ⚠️ Issues & Friction

- **Console errors**: 2
  - `Failed to load resource: the server responded with a status of 500 (Internal Server Error)`
  - `Failed to fetch dynamically imported module: http://localhost:5173/src/game.ts?t=1794428346848`
- **Stuck states**: 0
- **Confusing moments**: 0

#### 🔄 Retention Signals

- **Rewards earned**: 0
- **Unfinished goals**: 0
- **Social connections**: 0

## 📊 Overall Scores

| Metric | Grade | Assessment |
|--------|-------|------------|
| **Discovery** | **D** | Needs improvement |
| **Nyc_Culture** | **D** | Needs improvement |
| **Stability** | **D** | Needs improvement |
| **Retention** | **D** | Needs improvement |

## 🎯 Key Recommendations

### NYC Humor Opportunities

The game currently surfaces relatively few NYC references in the first 10 minutes. Consider:

- Adding more visible parody signs (Starducks, NYKE, etc.)
- More NYC-specific dialogue from NPCs
- Prominent NYC landmarks in the starting area
- Tutorial quest that highlights NYC jokes


## 📸 Screenshots

Screenshots are saved in `tools/playtest/out/screenshots/`


## 📅 Detailed Timeline

<details>
<summary>Click to expand full timeline</summary>


### Session 1: first_time

| Time | Event | Details |
|------|-------|----------|
| 0.4s | console_error | Failed to load resource: the server responded with  |
| 0.4s | page_error | Failed to fetch dynamically imported module: http:  |
| 2.0s | screenshot | 01-loading  |
| 5.0s | onboarding_started | False Skipped or already complete |
| 20.0s | game_load_failed | True  |

### Session 2: returning

| Time | Event | Details |
|------|-------|----------|
| 0.4s | console_error | Failed to load resource: the server responded with  |
| 0.4s | page_error | Failed to fetch dynamically imported module: http:  |
| 1.0s | console_error | Failed to load resource: the server responded with  |
| 1.0s | page_error | Failed to fetch dynamically imported module: http:  |

### Session 3: returning

| Time | Event | Details |
|------|-------|----------|
| 0.4s | console_error | Failed to load resource: the server responded with  |
| 0.4s | page_error | Failed to fetch dynamically imported module: http:  |
| 11.0s | coverage_failed | Game did not load  |

</details>


---

*This report was generated automatically by the Club NYC playtest harness.*
*Run: `npm run playtest` or `python tools/playtest/bot.py`*
