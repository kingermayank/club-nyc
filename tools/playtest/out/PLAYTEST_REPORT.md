# Club NYC Playtest Report
*Generated: 2026-11-11 19:38:36*

## Executive Summary

This report captures autonomous playtest sessions simulating first-time and returning players.


### Session 1: First Time

#### ⏱️ Key Timings

- **Total duration**: 1m 10s
- **Time to first interaction**: 3.5s
- **Time to enter game world**: 17.1s
- **Time to first fun moment**: 17.8s

#### 🗺️ Discovery

- **Places discovered**: 6 (times-square, central-park, broadway, empire-deck, subway...)
- **Features discovered**: 2 (mini_game_slice-factory, apartment)
- **Mini-games tried**: 1 (Slice Factory)

#### 🗽 NYC Culture & Humor

- **NYC references spotted**: 9
  - broadway, central park, empire state, halal, liberty, manhattan, pizza, subway, times square
- **NYC jokes/parodies seen**: 0

#### ⚠️ Issues & Friction

- **Console errors**: 0
- **Stuck states**: 0
- **Confusing moments**: 3
  - 23.9s: No quest system visible
    - Context: First-time player needs guidance
  - 59.3s: Could not find start button for Halal Rush
    - Context: Harness may need updated selectors
  - 1m 5s: Could not find start button for Ferry Captain
    - Context: Harness may need updated selectors

#### 🔄 Retention Signals

- **Rewards earned**: 0
- **Unfinished goals**: 1
  - Decorate your apartment
- **Social connections**: 0

### Session 2: Returning

#### ⏱️ Key Timings

- **Total duration**: 30.7s
- **Time to first fun moment**: 12.6s

#### 🗺️ Discovery

- **Places discovered**: 0 (none)
- **Features discovered**: 5 (daily_quests, mini_game_slice-factory, daily_bonus, leaderboards, team_system)
- **Mini-games tried**: 1 (Slice Factory)

#### 🗽 NYC Culture & Humor

- **NYC references spotted**: 0
- **NYC jokes/parodies seen**: 0

#### ⚠️ Issues & Friction

- **Console errors**: 0
- **Stuck states**: 0
- **Confusing moments**: 2
  - 18.5s: Could not find start button for Halal Rush
    - Context: Harness may need updated selectors
  - 25.8s: Could not find start button for Ferry Captain
    - Context: Harness may need updated selectors

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

2. **Could not find start button for Halal Rush**
   - Harness may need updated selectors

3. **Could not find start button for Ferry Captain**
   - Harness may need updated selectors

4. **Could not find start button for Halal Rush**
   - Harness may need updated selectors

5. **Could not find start button for Ferry Captain**
   - Harness may need updated selectors

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
| 3.5s | screenshot | 01-loading  |
| 3.6s | onboarding_started | True  |
| 4.2s | screenshot | 02-onboarding-start  |
| 4.2s | onboarding_step | welcome Welcome screen |
| 5.7s | screenshot | onboarding-1-welcome  |
| 5.7s | onboarding_step | look Choose look |
| 7.4s | screenshot | onboarding-2-look  |
| 7.4s | onboarding_step | style Choose style |
| 9.2s | screenshot | onboarding-3-style  |
| 9.2s | onboarding_step | name Enter name |
| 10.9s | screenshot | onboarding-4-name  |
| 10.9s | onboarding_step | team Choose team |
| 12.7s | screenshot | onboarding-5-team  |
| 12.7s | onboarding_step | metrocard Get MetroCard |
| 14.1s | screenshot | onboarding-6-metrocard  |
| 17.1s | entered_game | True  |
| 17.8s | screenshot | 03-first-spawn  |
| 17.8s | first_fun_moment | spawned in game world  |
| 17.8s | exploration_phase | starting_area  |
| 17.8s | spawn_room | times-square  |
| 20.4s | screenshot | 04-first-walk  |
| 20.4s | first_walk | True  |
| 20.4s | hotspots_found | 14 Found 14 interactive objects |
| 20.4s | clicked_hotspot | subway  |
| 20.9s | clicked_hotspot | pigeon-3  |
| 21.4s | clicked_hotspot | pigeon-2  |
| 21.9s | checking | quest_system  |
| 23.9s | exploration_phase | manhattan  |
| 26.2s | visited_room | times-square  |
| 26.2s | nyc_reference | subway  |
| ... | *34 more events* | ... |

### Session 2: returning

| Time | Event | Details |
|------|-------|----------|
| 3.9s | returning_player_loaded | True  |
| 4.5s | screenshot | 01-returning-spawn  |
| 4.5s | checking | daily_quests  |
| 5.2s | screenshot | daily-quests  |
| 5.2s | exploration_phase | mini_games  |
| 5.2s | attempting_game | Slice Factory  |
| 8.9s | screenshot | game-slice-factory-intro  |
| 12.0s | game_started_successfully | Slice Factory  |
| 12.6s | screenshot | game-slice-factory-playing  |
| 12.6s | fun_moment | Slice Factory First mini-game started |
| 14.8s | attempting_game | Halal Rush  |
| 18.5s | screenshot | game-halal-rush-intro  |
| 18.5s | game_no_start_button | Halal Rush No start button found |
| 22.1s | attempting_game | Ferry Captain  |
| 25.8s | screenshot | game-ferry-captain-intro  |
| 25.8s | game_no_start_button | Ferry Captain No start button found |
| 29.6s | checking | retention_features  |
| 29.6s | js_error | Page.evaluate: TypeError: window.clubNyc?.api?.ope  |
| 30.7s | screenshot | leaderboards  |
| 30.7s | retention_features | ['daily_bonus', 'leaderboards', 'team_system']  |

</details>


---

*This report was generated automatically by the Club NYC playtest harness.*
*Run: `npm run playtest` or `python tools/playtest/bot.py`*
