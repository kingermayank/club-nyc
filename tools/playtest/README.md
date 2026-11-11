# Club NYC Playtest Harness

Autonomous playtest system that simulates realistic player sessions and generates actionable reports.

## Overview

This harness drives scripted bot players through Club NYC to measure:

- **Time to first fun moment** - How quickly new players find something engaging
- **Dead time** - Periods where nothing is happening (>5s gaps)
- **Discovery** - Which places, features, and mini-games players find
- **NYC culture** - How many NYC jokes and references surface in the first 10 minutes
- **Friction points** - Confusing moments, stuck states, console errors
- **Retention signals** - Unfinished goals, rewards, streaks, reasons to return

The bot runs two session types:

1. **First-time player** - Complete onboarding, explore the world, try features
2. **Returning player** - Check daily quests, play mini-games, check retention hooks

## Quick Start

### Prerequisites

- Python 3.8+ with pip
- Node.js 18+
- The Club NYC dev server running at `http://localhost:5173`

### Installation

```bash
# Install Python dependencies
pip install playwright asyncio

# Install Playwright browsers
playwright install chromium
```

### Running the Harness

```bash
# From the project root
npm run playtest

# Or run directly
python tools/playtest/bot.py
```

The harness will:
1. Launch headless browser sessions
2. Simulate first-time and returning player sessions
3. Capture screenshots at key moments
4. Generate JSON reports and a markdown summary

## Output

All output goes to `tools/playtest/out/`:

- `report-playtest-new-player.json` - First-time player data
- `report-playtest-returning.json` - Returning player data
- `PLAYTEST_REPORT.md` - Human-readable summary with scores
- `screenshots/` - Screenshots from each session

## How to Read the Report

The markdown report includes:

### Key Timings
- Time to first click/interaction
- Time to enter the game world
- Time to first fun moment
- Dead time (long gaps between actions)

### Discovery Metrics
- Places discovered (rooms visited)
- Features discovered (systems encountered)
- Mini-games tried

### NYC Culture Score
- Number of NYC references spotted (subway, metrocard, times square, etc.)
- Parody brand sightings (Starducks, NYKE, etc.)

### Issues
- Console errors
- Stuck states (can't progress)
- Confusing moments (unclear what to do)

### Retention Signals
- Rewards earned
- Unfinished goals
- Social connections

### Grading

Each report includes letter grades (A-D) for:
- **Onboarding** - Speed to fun
- **Discovery** - How much players find
- **NYC Culture** - Visibility of NYC humor
- **Stability** - Absence of errors
- **Retention** - Reasons to return

## Adding New Checks

The bot is designed to be extensible. To add new checks:

### 1. Add a new exploration method

```python
async def _check_new_feature(self):
    """Check for new feature"""
    self.log_metric('checking', 'new_feature')
    
    # Look for UI element
    has_feature = await self.wait_for_element('.feature-selector')
    
    if has_feature:
        self.report.features_discovered.append('new_feature')
        await self.screenshot('new-feature')
    else:
        self.report.confusing_moments.append({
            'timestamp': self.elapsed(),
            'issue': 'New feature not visible',
            'context': 'Expected to find it in X'
        })
```

### 2. Call it from the session flow

```python
async def run_first_time_session(self):
    # ... existing steps ...
    await self._check_new_feature()
```

### 3. Update the report generator

Add new metrics to `report_generator.py` to include them in the summary.

## Configuration

Edit `bot.py` to customize:

- `self.nyc_keywords` - NYC references to scan for
- Session flows (which rooms to visit, which games to try)
- Screenshot timing
- Dead time threshold (currently 5s)

## Integration with CI

To run the harness as part of your CI pipeline:

```bash
# In your CI config
- name: Run playtest
  run: |
    npm run dev &
    sleep 5  # Wait for server
    npm run playtest
    
    # Check for critical failures
    if grep -q "stuck_states.*[1-9]" tools/playtest/out/PLAYTEST_REPORT.md; then
      echo "Critical: Bot got stuck!"
      exit 1
    fi
```

## Comparing Runs

To track improvements over time:

1. Save each run's JSON reports with timestamps:
   ```bash
   cp tools/playtest/out/report-*.json tools/playtest/history/$(date +%Y%m%d-%H%M%S)/
   ```

2. Compare key metrics:
   - `time_to_first_fun` - should decrease
   - `places_discovered` - should increase
   - `nyc_references_seen` - should increase
   - `console_errors` - should decrease to zero
   - `confusing_moments` - should decrease to zero

3. Diff the reports:
   ```bash
   diff tools/playtest/history/run1/report-playtest-new-player.json \
        tools/playtest/history/run2/report-playtest-new-player.json
   ```

## Troubleshooting

### Bot gets stuck

Check the screenshots in `tools/playtest/out/screenshots/` to see where it stopped.

Common issues:
- Selector changed (update selectors in bot.py)
- Timing issue (increase wait times)
- Game state changed (update state checks)

### Missing NYC references

The bot scans visible text content. If references are in images or not rendered, they won't be detected.

To improve detection:
- Add keywords to `self.nyc_keywords`
- Add specific checks for image-based content
- Check element attributes (like alt text)

### Console errors

Real errors vs. expected errors:
- 404s are ignored by default
- Add filters in `_on_console()` for expected errors

## Future Enhancements

Ideas for extending the harness:

- **Exploratory mode** - Random walks instead of scripted paths
- **Multiplayer testing** - Multiple bots interacting
- **Performance metrics** - Frame rate, load times, memory usage
- **Accessibility checks** - Keyboard navigation, screen reader support
- **Visual regression** - Screenshot diffing against baselines
- **A/B testing** - Compare metrics across branches

## Credits

Built with:
- [Playwright](https://playwright.dev/) - Browser automation
- Python asyncio - Async orchestration

Inspired by Club Penguin's polish and Club NYC's NYC parody spirit.
