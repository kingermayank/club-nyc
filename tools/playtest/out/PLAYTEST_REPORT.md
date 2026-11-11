# Club NYC Playtest Report
*Generated: 2026-11-11 19:30:06*

## Executive Summary

This report captures autonomous playtest sessions simulating first-time and returning players.


### Session 1: First Time

#### ⏱️ Key Timings

- **Total duration**: 1m 9s
- **Time to first interaction**: 2.4s
- **Time to enter game world**: 16.0s
- **Time to first fun moment**: 16.7s

#### 🗺️ Discovery

- **Places discovered**: 6 (times-square, central-park, broadway, empire-deck, subway...)
- **Features discovered**: 4 (mini_game_slice-factory, mini_game_halal-rush, mini_game_ferry-captain, apartment)
- **Mini-games tried**: 3 (Slice Factory, Halal Rush, Ferry Captain)

#### 🗽 NYC Culture & Humor

- **NYC references spotted**: 9
  - broadway, central park, chinatown, empire state, manhattan, metrocard, pizza, subway, times square
- **NYC jokes/parodies seen**: 0

#### ⚠️ Issues & Friction

- **Console errors**: 0
- **Stuck states**: 0
- **Confusing moments**: 3
  - 22.8s: No quest system visible
    - Context: First-time player needs guidance
  - 58.3s: Could not start Halal Rush
    - Context: No start button found
  - 1m 4s: Could not start Ferry Captain
    - Context: No start button found

#### 🔄 Retention Signals

- **Rewards earned**: 0
- **Unfinished goals**: 1
  - Decorate your apartment
- **Social connections**: 0

### Session 2: Returning

#### ⏱️ Key Timings

- **Total duration**: 29.0s
- **Time to first fun moment**: 9.4s

#### 🗺️ Discovery

- **Places discovered**: 0 (none)
- **Features discovered**: 7 (daily_quests, mini_game_slice-factory, mini_game_halal-rush, mini_game_ferry-captain, daily_bonus, leaderboards, team_system)
- **Mini-games tried**: 3 (Slice Factory, Halal Rush, Ferry Captain)

#### 🗽 NYC Culture & Humor

- **NYC references spotted**: 0
- **NYC jokes/parodies seen**: 0

#### ⚠️ Issues & Friction

- **Console errors**: 0
- **Stuck states**: 0
- **Confusing moments**: 2
  - 19.1s: Could not start Halal Rush
    - Context: No start button found
  - 25.1s: Could not start Ferry Captain
    - Context: No start button found

#### 🔄 Retention Signals

- **Rewards earned**: 0
- **Unfinished goals**: 1
  - Complete daily quests
- **Social connections**: 0

## 📊 Overall Scores

| Metric | Grade | Assessment |
|--------|-------|------------|
| **Onboarding** | **A** | Excellent |
| **Discovery** | **C** | Fair |
| **Nyc_Culture** | **D** | Needs improvement |
| **Stability** | **A** | Excellent |
| **Retention** | **D** | Needs improvement |

## 🎯 Key Recommendations

### High Priority Fixes

1. **No quest system visible**
   - First-time player needs guidance

2. **Could not start Halal Rush**
   - No start button found

3. **Could not start Ferry Captain**
   - No start button found

4. **Could not start Halal Rush**
   - No start button found

5. **Could not start Ferry Captain**
   - No start button found

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
| 2.4s | screenshot | 01-loading  |
| 2.4s | onboarding_started | True  |
| 3.1s | screenshot | 02-onboarding-start  |
| 3.1s | onboarding_step | welcome Welcome screen |
| 4.5s | screenshot | onboarding-1-welcome  |
| 4.5s | onboarding_step | look Choose look |
| 6.3s | screenshot | onboarding-2-look  |
| 6.3s | onboarding_step | style Choose style |
| 8.1s | screenshot | onboarding-3-style  |
| 8.1s | onboarding_step | name Enter name |
| 9.8s | screenshot | onboarding-4-name  |
| 9.8s | onboarding_step | team Choose team |
| 11.6s | screenshot | onboarding-5-team  |
| 11.6s | onboarding_step | metrocard Get MetroCard |
| 13.0s | screenshot | onboarding-6-metrocard  |
| 16.0s | entered_game | True  |
| 16.7s | screenshot | 03-first-spawn  |
| 16.7s | first_fun_moment | spawned in game world  |
| 16.7s | exploration_phase | starting_area  |
| 16.7s | spawn_room | times-square  |
| 19.3s | screenshot | 04-first-walk  |
| 19.3s | first_walk | True  |
| 19.3s | hotspots_found | 14 Found 14 interactive objects |
| 19.3s | clicked_hotspot | subway  |
| 19.8s | clicked_hotspot | pigeon-3  |
| 20.3s | clicked_hotspot | pigeon-2  |
| 20.8s | checking | quest_system  |
| 22.8s | exploration_phase | manhattan  |
| 25.1s | visited_room | times-square  |
| 25.1s | nyc_reference | subway  |
| ... | *32 more events* | ... |

### Session 2: returning

| Time | Event | Details |
|------|-------|----------|
| 4.3s | returning_player_loaded | True  |
| 5.0s | screenshot | 01-returning-spawn  |
| 5.0s | checking | daily_quests  |
| 5.7s | screenshot | daily-quests  |
| 5.7s | exploration_phase | mini_games  |
| 5.7s | trying_game | Slice Factory  |
| 9.4s | screenshot | game-slice-factory-intro  |
| 9.4s | fun_moment | Slice Factory First mini-game discovered |
| 9.4s | game_started | Slice Factory  |
| 13.1s | screenshot | game-slice-factory-playing  |
| 15.4s | trying_game | Halal Rush  |
| 19.1s | screenshot | game-halal-rush-intro  |
| 21.4s | trying_game | Ferry Captain  |
| 25.1s | screenshot | game-ferry-captain-intro  |
| 27.9s | checking | retention_features  |
| 27.9s | js_error | Page.evaluate: TypeError: window.clubNyc?.api?.ope  |
| 29.0s | screenshot | leaderboards  |
| 29.0s | retention_features | ['daily_bonus', 'leaderboards', 'team_system']  |

</details>


---

*This report was generated automatically by the Club NYC playtest harness.*
*Run: `npm run playtest` or `python tools/playtest/bot.py`*
