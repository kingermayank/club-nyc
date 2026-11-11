# Club NYC Playtest Report
*Generated: 2026-11-11 20:04:01*

## Executive Summary

This report captures autonomous playtest sessions simulating first-time and returning players.


### Session 1: First Time

#### ⏱️ Key Timings

- **Total duration**: 1m 36s
- **Time to first interaction**: 3.0s
- **Time to enter game world**: 16.6s
- **Time to first fun moment**: 17.3s

#### 🗺️ Discovery

- **Places discovered**: 6 (times-square, central-park, broadway, empire-deck, subway...)
- **Features discovered**: 6 (mini_game_slice-factory, mini_game_halal-rush, mini_game_ferry-captain, mini_game_bagel-counters, mini_game_showtime, apartment)
- **Mini-games tried**: 5 (Slice Factory, Halal Rush, Ferry Captain, Bagel Counters, Showtime!)

#### 🗽 NYC Culture & Humor

- **NYC references spotted**: 9
  - broadway, central park, chinatown, empire state, halal, manhattan, pizza, subway, times square
- **NYC jokes/parodies seen**: 0

#### ⚠️ Issues & Friction

- **Console errors**: 0
- **Stuck states**: 0
- **Confusing moments**: 1
  - 23.4s: No quest system visible
    - Context: First-time player needs guidance

#### 🔄 Retention Signals

- **Rewards earned**: 0
- **Unfinished goals**: 1
  - Decorate your apartment
- **Social connections**: 0

### Session 2: Returning

#### ⏱️ Key Timings

- **Total duration**: 56.2s
- **Time to first fun moment**: 12.8s

#### 🗺️ Discovery

- **Places discovered**: 0 (none)
- **Features discovered**: 9 (daily_quests, mini_game_slice-factory, mini_game_halal-rush, mini_game_ferry-captain, mini_game_bagel-counters, mini_game_showtime, daily_bonus, leaderboards, team_system)
- **Mini-games tried**: 5 (Slice Factory, Halal Rush, Ferry Captain, Bagel Counters, Showtime!)

#### 🗽 NYC Culture & Humor

- **NYC references spotted**: 0
- **NYC jokes/parodies seen**: 0

#### ⚠️ Issues & Friction

- **Console errors**: 0
- **Stuck states**: 0
- **Confusing moments**: 0

#### 🔄 Retention Signals

- **Rewards earned**: 0
- **Unfinished goals**: 1
  - Complete daily quests
- **Social connections**: 0

### Session 3: Returning

#### ⏱️ Key Timings

- **Total duration**: 2m 4s
- **Time to first fun moment**: 1m 23s

#### 🗺️ Discovery

- **Places discovered**: 24 (times-square, broadway, iloveny, rockefeller, fifth-ave...)
- **Features discovered**: 5 (mini_game_slice-factory, mini_game_halal-rush, mini_game_ferry-captain, mini_game_bagel-counters, mini_game_showtime)
- **Mini-games tried**: 5 (Slice Factory, Halal Rush, Ferry Captain, Bagel Counters, Showtime!)

#### 🗽 NYC Culture & Humor

- **NYC references spotted**: 22
  - bagel, bodega, broadway, brooklyn, central park, chelsea, chinatown, empire state, ferry, fifth avenue
  - ...and 12 more
- **NYC jokes/parodies seen**: 1
  - {'joke': 'THREAD (Supreme parody)', 'location': 'the-met', 'screenshot': 'playtest-coverage-joke-1-thread.png', 'timestamp': 28.78575325012207}

#### ⚠️ Issues & Friction

- **Console errors**: 0
- **Stuck states**: 0
- **Confusing moments**: 0

#### 🔄 Retention Signals

- **Rewards earned**: 0
- **Unfinished goals**: 0
- **Social connections**: 0

## 📊 Overall Scores

| Metric | Grade | Assessment |
|--------|-------|------------|
| **Onboarding** | **A** | Excellent |
| **Discovery** | **A** | Excellent |
| **Nyc_Culture** | **B** | Good |
| **Stability** | **A** | Excellent |
| **Retention** | **D** | Needs improvement |

## 🎯 Key Recommendations

### High Priority Fixes

1. **No quest system visible**
   - First-time player needs guidance


## 📸 Screenshots

Screenshots are saved in `tools/playtest/out/screenshots/`


## 📅 Detailed Timeline

<details>
<summary>Click to expand full timeline</summary>


### Session 1: first_time

| Time | Event | Details |
|------|-------|----------|
| 3.0s | screenshot | 01-loading  |
| 3.0s | onboarding_started | True  |
| 3.7s | screenshot | 02-onboarding-start  |
| 3.7s | onboarding_step | welcome Welcome screen |
| 5.1s | screenshot | onboarding-1-welcome  |
| 5.1s | onboarding_step | look Choose look |
| 6.9s | screenshot | onboarding-2-look  |
| 6.9s | onboarding_step | style Choose style |
| 8.7s | screenshot | onboarding-3-style  |
| 8.7s | onboarding_step | name Enter name |
| 10.4s | screenshot | onboarding-4-name  |
| 10.4s | onboarding_step | team Choose team |
| 12.2s | screenshot | onboarding-5-team  |
| 12.2s | onboarding_step | metrocard Get MetroCard |
| 13.6s | screenshot | onboarding-6-metrocard  |
| 16.6s | entered_game | True  |
| 17.3s | screenshot | 03-first-spawn  |
| 17.3s | first_fun_moment | spawned in game world  |
| 17.3s | exploration_phase | starting_area  |
| 17.3s | spawn_room | times-square  |
| 19.9s | screenshot | 04-first-walk  |
| 19.9s | first_walk | True  |
| 19.9s | hotspots_found | 14 Found 14 interactive objects |
| 19.9s | clicked_hotspot | subway  |
| 20.4s | clicked_hotspot | pigeon-3  |
| 20.9s | clicked_hotspot | pigeon-2  |
| 21.4s | checking | quest_system  |
| 23.4s | exploration_phase | manhattan  |
| 25.7s | visited_room | times-square  |
| 25.7s | nyc_reference | subway  |
| ... | *44 more events* | ... |

### Session 2: returning

| Time | Event | Details |
|------|-------|----------|
| 4.0s | returning_player_loaded | True  |
| 4.7s | screenshot | 01-returning-spawn  |
| 4.7s | checking | daily_quests  |
| 5.4s | screenshot | daily-quests  |
| 5.4s | exploration_phase | mini_games  |
| 5.4s | attempting_game | Slice Factory  |
| 9.1s | screenshot | game-slice-factory-intro  |
| 12.1s | game_started_successfully | Slice Factory  |
| 12.8s | screenshot | game-slice-factory-playing  |
| 12.8s | fun_moment | Slice Factory First mini-game started |
| 14.9s | attempting_game | Halal Rush  |
| 18.6s | screenshot | game-halal-rush-intro  |
| 21.6s | game_started_successfully | Halal Rush  |
| 22.3s | screenshot | game-halal-rush-playing  |
| 24.8s | attempting_game | Ferry Captain  |
| 28.5s | screenshot | game-ferry-captain-intro  |
| 31.5s | game_started_successfully | Ferry Captain  |
| 32.1s | screenshot | game-ferry-captain-playing  |
| 34.6s | attempting_game | Bagel Counters  |
| 38.3s | screenshot | game-bagel-counters-intro  |
| 41.3s | game_started_successfully | Bagel Counters  |
| 42.0s | screenshot | game-bagel-counters-playing  |
| 44.2s | attempting_game | Showtime!  |
| 48.0s | screenshot | game-showtime-intro  |
| 51.0s | game_started_successfully | Showtime!  |
| 51.7s | screenshot | game-showtime-playing  |
| 55.1s | checking | retention_features  |
| 55.1s | js_error | Page.evaluate: TypeError: window.clubNyc?.api?.ope  |
| 56.2s | screenshot | leaderboards  |
| 56.2s | retention_features | ['daily_bonus', 'leaderboards', 'team_system']  |

### Session 3: returning

| Time | Event | Details |
|------|-------|----------|
| 1.5s | coverage_started | True  |
| 1.5s | rooms_to_visit | 24  |
| 3.8s | visited_room | times-square  |
| 3.8s | nyc_reference | subway  |
| 3.8s | nyc_reference | times square  |
| 3.8s | nyc_reference | brooklyn  |
| 3.8s | nyc_reference | manhattan  |
| 3.8s | nyc_reference | pizza  |
| 3.8s | nyc_reference | halal  |
| 6.8s | visited_room | broadway  |
| 6.8s | nyc_reference | broadway  |
| 9.9s | visited_room | iloveny  |
| 13.0s | visited_room | rockefeller  |
| 13.0s | nyc_reference | taxi  |
| 13.0s | nyc_reference | rockefeller  |
| 16.1s | visited_room | fifth-ave  |
| 16.1s | nyc_reference | fifth avenue  |
| 19.2s | visited_room | toy-palace  |
| 22.3s | visited_room | maison-malle  |
| 25.3s | visited_room | central-park  |
| 25.3s | nyc_reference | central park  |
| 25.3s | nyc_reference | chinatown  |
| 28.4s | visited_room | the-met  |
| 28.4s | nyc_reference | bagel  |
| 28.4s | nyc_reference | the met  |
| 28.8s | screenshot | joke-1-thread  |
| 28.8s | nyc_joke | THREAD (Supreme parody) at the-met |
| 31.9s | visited_room | empire-deck  |
| 31.9s | nyc_reference | empire state  |
| 35.0s | visited_room | grand-central  |
| ... | *42 more events* | ... |

</details>


---

*This report was generated automatically by the Club NYC playtest harness.*
*Run: `npm run playtest` or `python tools/playtest/bot.py`*
