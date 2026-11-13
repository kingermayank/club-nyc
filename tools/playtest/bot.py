"""
Autonomous playtest bot for Club NYC.

This bot simulates a realistic first-time and returning player session, capturing:
- Time to first fun moment
- Dead time or confusing steps
- Undiscoverable places/features
- Broken or stuck states
- Console errors
- NYC jokes/references surfaced
- Reasons to return (rewards, streaks, goals)
"""

import asyncio
import json
import time
import os
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
from playwright.async_api import async_playwright, Page, Browser

HERE = Path(__file__).parent
OUT = HERE / 'out'
SHOTS = OUT / 'screenshots'


@dataclass
class Metric:
    """Individual metric tracked during playtest"""
    name: str
    value: Any
    timestamp: float
    notes: str = ""


@dataclass
class PlaytestReport:
    """Complete playtest report"""
    session_type: str  # 'first_time', 'returning', or 'coverage'
    start_time: float
    end_time: float
    duration_seconds: float
    
    # Key metrics
    time_to_first_fun: Optional[float] = None
    time_to_first_click: Optional[float] = None
    time_to_enter_game: Optional[float] = None
    
    # Discovery metrics
    places_discovered: List[str] = None
    features_discovered: List[str] = None
    mini_games_attempted: List[str] = None
    
    # NYC culture metrics
    nyc_jokes_seen: List[Dict] = None  # Now list of dicts with {joke, location, screenshot, timestamp}
    nyc_references_seen: List[str] = None
    
    # Problems
    console_errors: List[str] = None
    stuck_states: List[Dict] = None
    confusing_moments: List[Dict] = None
    
    # Retention signals
    rewards_earned: List[str] = None
    unfinished_goals: List[str] = None
    social_connections: int = 0
    
    # Timeline
    timeline: List[Metric] = None
    
    # Dead time tracking
    dead_time_seconds: float = 0.0
    loading_time_seconds: float = 0.0
    
    def __post_init__(self):
        if self.places_discovered is None:
            self.places_discovered = []
        if self.features_discovered is None:
            self.features_discovered = []
        if self.mini_games_attempted is None:
            self.mini_games_attempted = []
        if self.nyc_jokes_seen is None:
            self.nyc_jokes_seen = []
        if self.nyc_references_seen is None:
            self.nyc_references_seen = []
        if self.console_errors is None:
            self.console_errors = []
        if self.stuck_states is None:
            self.stuck_states = []
        if self.confusing_moments is None:
            self.confusing_moments = []
        if self.rewards_earned is None:
            self.rewards_earned = []
        if self.unfinished_goals is None:
            self.unfinished_goals = []
        if self.timeline is None:
            self.timeline = []


class PlaytestBot:
    """Autonomous bot that playtests Club NYC"""
    
    def __init__(self, profile_name: str, base_url: str = 'http://localhost:5173'):
        self.profile = profile_name
        self.base_url = base_url
        self.page: Optional[Page] = None
        self.browser: Optional[Browser] = None
        self.report = PlaytestReport(
            session_type='first_time' if 'new' in profile_name else 'returning',
            start_time=time.time(),
            end_time=0,
            duration_seconds=0
        )
        self.session_start = time.time()
        self.last_action_time = time.time()
        
        # NYC references to look for
        self.nyc_keywords = [
            'subway', 'metrocard', 'times square', 'broadway', 'central park',
            'empire state', 'liberty', 'brooklyn', 'manhattan', 'pizza', 'bagel',
            'halal', 'bodega', 'taxi', 'ferry', 'chinatown', 'soho', 'fifth avenue',
            'rockefeller', 'grand central', 'the met', 'chelsea', 'high line',
            'starducks', 'nyke', 'just do ny', 'vuittown', 'snacks fifth avenue'
        ]
        
    async def init(self):
        """Initialize browser and page"""
        p = await async_playwright().start()
        self.browser = await p.chromium.launch(headless=True)
        self.page = await self.browser.new_page(
            viewport={'width': 1000, 'height': 565},
            device_scale_factor=1
        )
        
        # Set up console monitoring
        self.page.on('console', self._on_console)
        self.page.on('pageerror', self._on_page_error)
        
        OUT.mkdir(parents=True, exist_ok=True)
        SHOTS.mkdir(parents=True, exist_ok=True)
        
    def _on_console(self, msg):
        """Monitor console messages"""
        if msg.type == 'error':
            error_text = msg.text
            if '404' not in error_text:  # Ignore 404s
                self.report.console_errors.append(error_text)
                self.log_metric('console_error', error_text)
    
    def _on_page_error(self, error):
        """Monitor page errors"""
        self.report.console_errors.append(str(error))
        self.log_metric('page_error', str(error))
    
    def elapsed(self) -> float:
        """Time since session start"""
        return time.time() - self.session_start
    
    def log_metric(self, name: str, value: Any, notes: str = ""):
        """Log a metric with timestamp"""
        metric = Metric(
            name=name,
            value=value,
            timestamp=self.elapsed(),
            notes=notes
        )
        self.report.timeline.append(metric)
        print(f"[{self.elapsed():.1f}s] {name}: {value}")
        if notes:
            print(f"  └─ {notes}")
    
    async def screenshot(self, name: str, delay_ms: int = 500):
        """Take a screenshot"""
        await self.page.wait_for_timeout(delay_ms)
        path = SHOTS / f"{self.profile}-{name}.png"
        await self.page.screenshot(path=path)
        self.log_metric('screenshot', name)
        return path
    
    async def wait_for_element(self, selector: str, timeout: int = 5000) -> bool:
        """Wait for element, return True if found"""
        try:
            await self.page.wait_for_selector(selector, timeout=timeout)
            return True
        except:
            return False
    
    async def js_eval(self, script: str) -> Any:
        """Evaluate JavaScript"""
        try:
            return await self.page.evaluate(script)
        except Exception as e:
            self.log_metric('js_error', str(e))
            return None
    
    async def scan_for_nyc_content(self, context: str = 'unknown'):
        """Scan visible page content for NYC references and jokes"""
        try:
            result = await self.js_eval("""
                () => {
                    const getText = (el) => {
                        if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') return '';
                        return el.innerText || el.textContent || '';
                    };
                    
                    const text = getText(document.body).toLowerCase();
                    
                    // Also check for visible images/signs with parody brands
                    const visibleElements = Array.from(document.querySelectorAll('*')).filter(el => {
                        const style = window.getComputedStyle(el);
                        return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                    });
                    
                    const allText = visibleElements.map(el => 
                        (el.innerText || el.textContent || el.alt || el.title || '').toLowerCase()
                    ).join(' ');
                    
                    // Get current room
                    const room = window.clubNyc?.world?.room?.id || 'unknown';
                    
                    return {
                        bodyText: text,
                        visibleText: allText,
                        currentRoom: room
                    };
                }
            """)
            
            if result:
                all_text = result.get('visibleText', '') + ' ' + result.get('bodyText', '')
                current_room = result.get('currentRoom', context)
                
                # Check for NYC references
                for keyword in self.nyc_keywords:
                    if keyword in all_text and keyword not in self.report.nyc_references_seen:
                        self.report.nyc_references_seen.append(keyword)
                        self.log_metric('nyc_reference', keyword)
                
                # Check for explicit parody/joke brands (case-insensitive)
                # NOTE: Starducks, NYKE, etc. from brief-nyc-culture.md are NOT implemented yet!
                # These patterns match what's ACTUALLY in the game as of Nov 2026
                joke_patterns = [
                    # Parody brands that DON'T exist yet (from design docs):
                    ('starducks', 'Starducks Coffee (Starbucks parody) [PLANNED]'),
                    ('nyke', 'NYKE "Just Do NY" (Nike parody) [PLANNED]'),
                    ('vuittown', 'Louis Vuittown (Louis Vuitton parody) [PLANNED]'),
                    ('snacks fifth avenue', 'Snacks Fifth Avenue (Saks parody) [PLANNED]'),
                    ('just do ny', 'NYKE slogan [PLANNED]'),
                    ('bodega cat', 'Bodega cat (NYC icon) [PLANNED]'),
                    ('pizza rat', 'Pizza rat (NYC meme) [PLANNED]'),
                    
                    # What actually exists:
                    ("ralph's coffee", "Ralph's Coffee (real Ralph Lauren café, misspelled cup names)"),
                    ('i ♥ ny', 'I ♥ NY Souvenirs (tourist icon)'),
                    ('thread', 'THREAD (Supreme parody)'),
                    ('sneaker vault', 'Sneaker Vault (Nike Store reference)'),
                    ('toy palace', 'Toy Palace (FAO Schwarz reference)'),
                    ('maison malle', 'Maison Malle (Louis Vuitton reference)'),
                    ('halal bros', 'Halal Bros food cart'),
                    ('99¢ slice', '99¢ Slice pizza'),
                ]
                
                # Track jokes already seen (by description only, not location)
                seen_jokes = [j['joke'] for j in self.report.nyc_jokes_seen]
                
                for pattern, description in joke_patterns:
                    if pattern in all_text and description not in seen_jokes:
                        # Take screenshot of the joke
                        screenshot_name = f'joke-{len(self.report.nyc_jokes_seen)+1}-{pattern.replace(" ", "-")}'
                        screenshot_path = await self.screenshot(screenshot_name, delay_ms=200)
                        
                        # Record joke with full context (use the actual filename)
                        joke_entry = {
                            'joke': description,
                            'location': current_room,
                            'screenshot': f'{self.profile}-{screenshot_name}.png',
                            'timestamp': self.elapsed()
                        }
                        self.report.nyc_jokes_seen.append(joke_entry)
                        self.log_metric('nyc_joke', description, f'at {current_room}')
        except Exception as e:
            pass
    
    async def check_game_state(self) -> Dict[str, Any]:
        """Check current game state"""
        state = await self.js_eval("""
            () => {
                const w = window.clubNyc;
                if (!w) return {ready: false};
                
                return {
                    ready: true,
                    room: w.world?.room?.id,
                    playerPos: w.world?.player?.pos,
                    coins: w.save?.coins,
                    questsPanel: !!document.querySelector('.quests'),
                    overlayOpen: !!document.querySelector('.overlay'),
                    chatOpen: !!document.querySelector('.chat-input:focus')
                };
            }
        """)
        return state or {'ready': False}
    
    async def wait_for_game_ready(self, timeout: int = 10000):
        """Wait for game to be ready"""
        start = time.time()
        while time.time() - start < timeout / 1000:
            state = await self.check_game_state()
            if state.get('ready'):
                return True
            await self.page.wait_for_timeout(100)
        return False
    
    async def goto_room(self, room_id: str):
        """Navigate to a specific room"""
        await self.js_eval(f"window.clubNyc.api.goto('{room_id}')")
        await self.page.wait_for_timeout(2000)
        self.report.places_discovered.append(room_id)
        self.log_metric('visited_room', room_id)
        await self.scan_for_nyc_content()
    
    async def run_first_time_session(self):
        """Simulate a first-time player session"""
        print(f"\n{'='*60}")
        print(f"FIRST-TIME PLAYER SESSION: {self.profile}")
        print(f"{'='*60}\n")
        
        # Load game
        await self.page.goto(f'{self.base_url}/play?profile={self.profile}&offline=1', 
                            wait_until='networkidle')
        await self.screenshot('01-loading', 1000)
        
        # Track first click timing
        self.report.time_to_first_click = self.elapsed()
        
        # Check if onboarding appears
        has_onboarding = await self.wait_for_element('.creator', timeout=3000)
        
        if has_onboarding:
            self.log_metric('onboarding_started', True)
            await self.screenshot('02-onboarding-start')
            
            # Complete onboarding
            await self._complete_onboarding()
        else:
            self.log_metric('onboarding_started', False, 'Skipped or already complete')
        
        # Wait for game to be ready
        if await self.wait_for_game_ready(timeout=15000):
            self.report.time_to_enter_game = self.elapsed()
            self.log_metric('entered_game', True)
            await self.screenshot('03-first-spawn')
            
            # This is the "first fun moment" - seeing the world
            if self.report.time_to_first_fun is None:
                self.report.time_to_first_fun = self.elapsed()
                self.log_metric('first_fun_moment', 'spawned in game world')
        else:
            self.log_metric('game_load_failed', True)
            self.report.stuck_states.append({
                'location': 'initial_load',
                'timestamp': self.elapsed(),
                'description': 'Game failed to load within timeout'
            })
            return
        
        # Initial exploration
        await self._explore_starting_area()
        
        # Try the onboarding quest system
        await self._check_quest_system()
        
        # Explore different places
        await self._explore_manhattan()
        
        # Try mini-games
        await self._try_mini_games()
        
        # Check social features
        await self._check_social_features()
        
        # Check apartment
        await self._check_apartment()
        
        # Final scan
        await self.scan_for_nyc_content()
        
    async def _complete_onboarding(self):
        """Complete the onboarding flow"""
        steps = [
            ('welcome', '.creator .btn.go', 'Welcome screen'),
            ('look', '.creator .btn.go', 'Choose look'),
            ('style', '.creator .btn.go', 'Choose style'),
            ('name', '.creator .btn.go', 'Enter name'),
            ('team', '.creator .btn.go', 'Choose team'),
            ('metrocard', '.creator .btn.go', 'Get MetroCard')
        ]
        
        for i, (step_name, selector, description) in enumerate(steps):
            self.log_metric('onboarding_step', step_name, description)
            
            # Random selections for look/style/team
            if step_name == 'look':
                await self.js_eval("document.querySelectorAll('.creator .le-opt')[0]?.click()")
                await self.page.wait_for_timeout(300)
            elif step_name == 'style':
                await self.js_eval("document.querySelectorAll('.creator .le-opt')[2]?.click()")
                await self.page.wait_for_timeout(300)
            elif step_name == 'name':
                await self.js_eval(f"document.querySelector('.creator input').value='Playtester{int(time.time())%1000}'")
                await self.page.wait_for_timeout(300)
            elif step_name == 'team':
                await self.js_eval("document.querySelectorAll('.creator .team-card')[1]?.click()")
                await self.page.wait_for_timeout(300)
            
            # Click next button
            has_button = await self.wait_for_element(selector, timeout=2000)
            if has_button:
                await self.js_eval(f"document.querySelector('{selector}')?.click()")
                await self.page.wait_for_timeout(800)
                await self.screenshot(f'onboarding-{i+1}-{step_name}')
            else:
                self.log_metric('onboarding_stuck', step_name, f'Could not find {selector}')
                break
        
        # Wait for world to load after onboarding
        await self.page.wait_for_timeout(3000)
    
    async def _explore_starting_area(self):
        """Explore the starting area (Times Square)"""
        self.log_metric('exploration_phase', 'starting_area')
        
        # Check current room
        state = await self.check_game_state()
        current_room = state.get('room', 'unknown')
        self.log_metric('spawn_room', current_room)
        
        # Take a walk (test movement)
        await self.js_eval("""
            () => {
                const w = window.clubNyc.world;
                if (w && w.player) {
                    w.player.path = [[500, 400]];
                }
            }
        """)
        await self.page.wait_for_timeout(2000)
        await self.screenshot('04-first-walk')
        self.log_metric('first_walk', True)
        
        # Look for clickable objects
        hotspots = await self.js_eval("""
            () => {
                const w = window.clubNyc.world;
                if (!w || !w.hits) return [];
                return w.hits.map(h => ({id: h.id, label: h.label}));
            }
        """)
        
        if hotspots:
            self.log_metric('hotspots_found', len(hotspots), f'Found {len(hotspots)} interactive objects')
            
            # Try clicking a few hotspots
            for i, hotspot in enumerate(hotspots[:3]):
                self.log_metric('clicked_hotspot', hotspot.get('id'), hotspot.get('label'))
                await self.page.wait_for_timeout(500)
    
    async def _check_quest_system(self):
        """Check the quest/tutorial system"""
        self.log_metric('checking', 'quest_system')
        
        # Look for quest panel
        has_quests = await self.wait_for_element('.quests', timeout=2000)
        if has_quests:
            self.report.features_discovered.append('quest_system')
            self.log_metric('found_feature', 'quest_system')
            
            # Read quests
            quests = await self.js_eval("""
                () => {
                    const panel = document.querySelector('.quests');
                    if (!panel) return [];
                    const items = panel.querySelectorAll('.qitem');
                    return Array.from(items).map(item => ({
                        text: item.textContent.trim(),
                        done: item.classList.contains('done')
                    }));
                }
            """)
            
            if quests:
                for quest in quests:
                    if not quest['done']:
                        self.report.unfinished_goals.append(quest['text'])
                    else:
                        self.report.rewards_earned.append(f"Quest: {quest['text']}")
                
                self.log_metric('quests_found', len(quests), f'{len([q for q in quests if not q["done"]])} incomplete')
        else:
            self.report.confusing_moments.append({
                'timestamp': self.elapsed(),
                'issue': 'No quest system visible',
                'context': 'First-time player needs guidance'
            })
    
    async def _explore_manhattan(self):
        """Explore different Manhattan locations"""
        self.log_metric('exploration_phase', 'manhattan')
        
        # Key places to visit
        places = [
            'times-square',
            'central-park',
            'broadway',
            'empire-deck',
            'subway',
            'soho',
            'brooklyn-bridge',
            'liberty-island'
        ]
        
        for place in places[:5]:  # Visit first 5 to keep session reasonable
            try:
                await self.goto_room(place)
                await self.screenshot(f'place-{place}')
                await self.page.wait_for_timeout(1500)
                
                # Check for stuck state
                state = await self.check_game_state()
                if not state.get('playerPos'):
                    self.report.stuck_states.append({
                        'location': place,
                        'timestamp': self.elapsed(),
                        'description': 'Player position undefined'
                    })
            except Exception as e:
                self.log_metric('navigation_error', place, str(e))
    
    async def _try_mini_games(self, limit=None):
        """Attempt to play mini-games"""
        self.log_metric('exploration_phase', 'mini_games')
        
        games = [
            ('slice-factory', 'Slice Factory'),
            ('halal-rush', 'Halal Rush'),
            ('ferry-captain', 'Ferry Captain'),
            ('bagel-counters', 'Bagel Counters'),
            ('showtime', 'Showtime!')
        ]
        
        games_to_try = games if limit is None else games[:limit]
        
        for game_id, game_name in games_to_try:
            try:
                self.log_metric('attempting_game', game_name)
                
                # Navigate to game page
                await self.page.goto(f'{self.base_url}/play?game={game_id}&profile={self.profile}',
                                    wait_until='networkidle')
                await self.page.wait_for_timeout(2500)
                await self.screenshot(f'game-{game_id}-intro')
                
                # Try to start the game - use game-specific selectors
                game_state_before = await self.js_eval(f"""
                    () => {{
                        // Game-specific button selectors
                        const gameButtons = {{
                            'slice-factory': '.slice-factory-go, button.go',
                            'halal-rush': '.halal-rush-go',
                            'ferry-captain': '.ferry-captain-go',
                            'bagel-counters': '.bagel-counters-start',
                            'showtime': '.showtime-go'
                        }};
                        
                        const gameId = '{game_id}';
                        let btn = null;
                        
                        // Try game-specific selector first
                        if (gameButtons[gameId]) {{
                            btn = document.querySelector(gameButtons[gameId]);
                        }}
                        
                        // Fallback to generic search
                        if (!btn) {{
                            btn = [...document.querySelectorAll('button')]
                                .find(b => /start|play|go|let|cast off/i.test(b.textContent || ''));
                        }}
                        
                        // Check if we're in a game interface
                        const hasGameUI = !!document.querySelector('.game-stage, .game-canvas, canvas, .belt, .customers, .ferry-wheel, .bagel-stage, .showtime-stage');
                        
                        return {{
                            hasButton: !!btn,
                            buttonText: btn ? btn.textContent.trim() : null,
                            buttonSelector: btn ? btn.className : null,
                            hasGameUI: hasGameUI
                        }};
                    }}
                """)
                
                # Click start button if found
                if game_state_before and game_state_before.get('hasButton'):
                    await self.js_eval(f"""
                        () => {{
                            const gameButtons = {{
                                'slice-factory': '.slice-factory-go, button.go',
                                'halal-rush': '.halal-rush-go',
                                'ferry-captain': '.ferry-captain-go',
                                'bagel-counters': '.bagel-counters-start',
                                'showtime': '.showtime-go'
                            }};
                            
                            const gameId = '{game_id}';
                            let btn = null;
                            
                            if (gameButtons[gameId]) {{
                                btn = document.querySelector(gameButtons[gameId]);
                            }}
                            
                            if (!btn) {{
                                btn = [...document.querySelectorAll('button')]
                                    .find(b => /start|play|go|let|cast off/i.test(b.textContent || ''));
                            }}
                            
                            if (btn) btn.click();
                        }}
                    """)
                    await self.page.wait_for_timeout(3000)
                    
                    # Verify game actually started
                    game_state_after = await self.js_eval("""
                        () => {
                            // Check if gameplay elements appeared
                            const hasGameUI = !!document.querySelector('.game-stage, .game-canvas, canvas, .belt, .customers');
                            const hasStartButton = !![...document.querySelectorAll('button')]
                                .find(b => /start|play|go|let/i.test(b.textContent || ''));
                            
                            return {
                                hasGameUI: hasGameUI,
                                hasStartButton: hasStartButton
                            };
                        }
                    """)
                    
                    # Game successfully started if:
                    # - Start button is gone OR
                    # - Game UI elements appeared
                    game_started = (
                        (game_state_after and game_state_after.get('hasGameUI')) or
                        (game_state_after and not game_state_after.get('hasStartButton'))
                    )
                    
                    if game_started:
                        self.log_metric('game_started_successfully', game_name)
                        self.report.mini_games_attempted.append(game_name)
                        self.report.features_discovered.append(f'mini_game_{game_id}')
                        await self.screenshot(f'game-{game_id}-playing')
                        
                        # Mark as fun moment
                        if self.report.time_to_first_fun is None or len(self.report.mini_games_attempted) == 1:
                            self.report.time_to_first_fun = min(
                                self.report.time_to_first_fun or float('inf'),
                                self.elapsed()
                            )
                            self.log_metric('fun_moment', game_name, 'First mini-game started')
                    else:
                        # Button clicked but game didn't start - likely a bug
                        self.log_metric('game_start_failed', game_name, 'Button clicked but game UI did not appear')
                        self.report.confusing_moments.append({
                            'timestamp': self.elapsed(),
                            'issue': f'Could not start {game_name}',
                            'context': 'Start button clicked but game did not launch (possible bug)'
                        })
                else:
                    # No start button found - harness issue or different UI
                    self.log_metric('game_no_start_button', game_name, 'No start button found')
                    self.report.confusing_moments.append({
                        'timestamp': self.elapsed(),
                        'issue': f'Could not find start button for {game_name}',
                        'context': 'Harness may need updated selectors'
                    })
                
                # Return to main game
                await self.page.goto(f'{self.base_url}/play?profile={self.profile}&offline=1',
                                    wait_until='networkidle')
                await self.page.wait_for_timeout(1500)
                
            except Exception as e:
                self.log_metric('game_error', game_name, str(e))
    
    async def _check_social_features(self):
        """Check social features"""
        self.log_metric('exploration_phase', 'social_features')
        
        # Check for friends panel
        has_friends = await self.js_eval("""
            () => {
                if (typeof window.clubNyc?.api?.openCommunity === 'function') {
                    window.clubNyc.api.openCommunity('friends');
                    return true;
                }
                return false;
            }
        """)
        
        if has_friends:
            await self.page.wait_for_timeout(1000)
            await self.screenshot('social-friends-panel')
            self.report.features_discovered.append('friends_system')
            self.log_metric('found_feature', 'friends_system')
            
            # Close panel
            await self.js_eval("document.querySelector('.overlay .x-btn')?.click()")
        
        # Check for NPCs/residents
        npcs = await self.js_eval("""
            () => {
                const w = window.clubNyc?.world;
                if (!w) return 0;
                return w.npcs?.length || 0;
            }
        """)
        
        if npcs:
            self.log_metric('npcs_found', npcs, f'{npcs} city residents visible')
    
    async def _check_apartment(self):
        """Check apartment/home feature"""
        self.log_metric('exploration_phase', 'apartment')
        
        try:
            await self.goto_room('apartment')
            await self.screenshot('apartment-home')
            self.report.features_discovered.append('apartment')
            
            # This is a retention feature
            self.report.unfinished_goals.append('Decorate your apartment')
            
        except Exception as e:
            self.log_metric('apartment_error', str(e))
    
    async def run_coverage_session(self):
        """Comprehensive coverage session: visit ALL rooms and try ALL games"""
        print(f"\n{'='*60}")
        print(f"COVERAGE SESSION: {self.profile}")
        print(f"Goal: Visit every room and try every mini-game")
        print(f"{'='*60}\n")
        
        await self.page.goto(f'{self.base_url}/play?profile={self.profile}&offline=1',
                            wait_until='networkidle')
        
        if await self.wait_for_game_ready():
            self.log_metric('coverage_started', True)
            
            # Get all rooms from the game
            all_rooms = await self.js_eval("""
                () => {
                    // Try to get room list from game
                    if (window.clubNyc?.ROOMS) {
                        return Object.keys(window.clubNyc.ROOMS);
                    }
                    return null;
                }
            """)
            
            if not all_rooms:
                # Fallback to known rooms
                all_rooms = [
                    'times-square', 'broadway', 'iloveny', 'rockefeller', 'fifth-ave',
                    'toy-palace', 'maison-malle', 'central-park', 'the-met', 'empire-deck',
                    'grand-central', 'subway', 'soho', 'thread', 'sneaker-vault', 'coffee',
                    'chinatown', 'pizza', 'brooklyn-bridge', 'battery-park', 'liberty-island',
                    'high-line', 'chelsea-market', 'apartment'
                ]
            
            self.log_metric('rooms_to_visit', len(all_rooms))
            
            # Visit every room
            for room in all_rooms:
                try:
                    await self.goto_room(room)
                    await self.scan_for_nyc_content(room)
                    await self.page.wait_for_timeout(800)
                except Exception as e:
                    self.log_metric('room_visit_failed', room, str(e))
            
            # Try ALL mini-games
            await self._try_mini_games(limit=None)  # No limit, try all 5
            
        else:
            self.log_metric('coverage_failed', 'Game did not load')
    
    async def run_returning_session(self):
        """Simulate a returning player session"""
        print(f"\n{'='*60}")
        print(f"RETURNING PLAYER SESSION: {self.profile}")
        print(f"{'='*60}\n")
        
        # Set up a save with some progress
        save_data = {
            "created": True,
            "name": "ReturningPlayer",
            "team": "midtown",
            "coins": 350,
            "look": {
                "skin": 2,
                "hair": "curly",
                "hairColor": 1,
                "items": {
                    "body": "tee-blue",
                    "legs": "jeans",
                    "feet": "sneakers"
                }
            },
            "stamps": ["welcome", "local"],
            "friends": [],
            "quests": {"walk": 1, "gift": 1},
            "stats": {}
        }
        
        await self.page.goto(f'{self.base_url}/play?profile={self.profile}&offline=1',
                            wait_until='networkidle')
        
        # Set save data
        await self.js_eval(f"""
            localStorage.setItem('club-nyc:v2:{self.profile}', 
                                JSON.stringify({json.dumps(save_data)}))
        """)
        await self.page.reload(wait_until='networkidle')
        
        if await self.wait_for_game_ready():
            self.log_metric('returning_player_loaded', True)
            await self.screenshot('01-returning-spawn')
            
            # Check daily quest
            await self._check_daily_quests()
            
            # Try a job/mini-game
            await self._try_mini_games()
            
            # Check retention hooks
            await self._check_retention_features()
    
    async def _check_daily_quests(self):
        """Check for daily quest system"""
        self.log_metric('checking', 'daily_quests')
        
        # Open quest panel
        has_quests = await self.wait_for_element('.quests', timeout=2000)
        if has_quests:
            await self.screenshot('daily-quests')
            self.report.features_discovered.append('daily_quests')
            self.report.unfinished_goals.append('Complete daily quests')
    
    async def _check_retention_features(self):
        """Check features that encourage return visits"""
        self.log_metric('checking', 'retention_features')
        
        retention_features = []
        
        # Check for daily bonus
        has_daily = await self.js_eval("""
            () => {
                return !!window.clubNyc?.save?.lastDaily;
            }
        """)
        if has_daily:
            retention_features.append('daily_bonus')
        
        # Check for leaderboards
        try:
            # the game has no api hook for this: press F, the real shortcut
            await self.page.keyboard.press('f')
            await self.page.wait_for_timeout(800)
            await self.screenshot('leaderboards')
            retention_features.append('leaderboards')
            await self.js_eval("document.querySelector('.overlay .x-btn')?.click()")
        except:
            pass
        
        # Check for team/neighborhood wars
        team = await self.js_eval("() => window.clubNyc?.save?.team")
        if team:
            retention_features.append('team_system')
        
        self.log_metric('retention_features', retention_features)
        
        for feature in retention_features:
            if feature not in self.report.features_discovered:
                self.report.features_discovered.append(feature)
    
    async def finalize_report(self):
        """Finalize and save the report"""
        self.report.end_time = time.time()
        self.report.duration_seconds = self.report.end_time - self.report.start_time
        
        # Calculate dead time (time between actions where nothing happened)
        # This is a simplified heuristic
        if len(self.report.timeline) > 1:
            gaps = []
            for i in range(1, len(self.report.timeline)):
                gap = self.report.timeline[i].timestamp - self.report.timeline[i-1].timestamp
                if gap > 5:  # More than 5 seconds between actions
                    gaps.append(gap)
            self.report.dead_time_seconds = sum(gaps)
        
        # Save JSON report
        report_dict = asdict(self.report)
        report_path = OUT / f'report-{self.profile}.json'
        with open(report_path, 'w') as f:
            json.dump(report_dict, f, indent=2, default=str)
        
        print(f"\n{'='*60}")
        print(f"Report saved to: {report_path}")
        print(f"{'='*60}\n")
        
        return report_dict
    
    async def close(self):
        """Clean up"""
        if self.browser:
            await self.browser.close()


def calculate_score(report: Dict[str, Any]) -> Dict[str, Any]:
    """Calculate a comparable score from a report"""
    
    # Raw metrics
    time_to_fun = report.get('time_to_first_fun', 999)
    time_to_enter = report.get('time_to_enter_game', 999)
    places = len(report.get('places_discovered', []))
    features = len(report.get('features_discovered', []))
    games = len(report.get('mini_games_attempted', []))
    nyc_refs = len(report.get('nyc_references_seen', []))
    
    # NYC jokes can be list of strings (old format) or list of dicts (new format)
    jokes_data = report.get('nyc_jokes_seen', [])
    if jokes_data and isinstance(jokes_data[0], dict):
        nyc_jokes = len(jokes_data)  # New format: list of dicts
    else:
        nyc_jokes = len(jokes_data)  # Old format: list of strings
    
    errors = len(report.get('console_errors', []))
    stuck = len(report.get('stuck_states', []))
    confusing = len(report.get('confusing_moments', []))
    goals = len(report.get('unfinished_goals', []))
    
    # Calculate category scores (0-100 each)
    
    # 1. Onboarding (based on time to first fun)
    # A: <20s, B: 20-40s, C: 40-80s, D: >80s
    if time_to_fun < 20:
        onboarding_score = 100
    elif time_to_fun < 40:
        onboarding_score = 80 - ((time_to_fun - 20) * 1.5)  # 100->70
    elif time_to_fun < 80:
        onboarding_score = 70 - ((time_to_fun - 40) * 1.0)  # 70->30
    else:
        onboarding_score = max(0, 30 - ((time_to_fun - 80) * 0.5))
    
    # 2. Discovery (places + features + games)
    # A: 15+, B: 10-14, C: 5-9, D: <5
    discovery_total = places + features + games
    if discovery_total >= 15:
        discovery_score = 100
    elif discovery_total >= 10:
        discovery_score = 70 + (discovery_total - 10) * 6  # 70->100
    elif discovery_total >= 5:
        discovery_score = 30 + (discovery_total - 5) * 8  # 30->70
    else:
        discovery_score = discovery_total * 6  # 0->30
    
    # 3. NYC Culture (references + jokes weighted heavily)
    # A: 8+ jokes OR 20+ refs, B: 5+ jokes OR 15+ refs, C: 2+ jokes OR 10+ refs, D: <2 jokes
    culture_from_jokes = nyc_jokes * 12.5  # Each joke worth 12.5 points (8 jokes = 100)
    culture_from_refs = nyc_refs * 5  # Each ref worth 5 points (20 refs = 100)
    nyc_culture_score = min(100, culture_from_jokes + culture_from_refs * 0.3)  # Jokes count 3x more
    
    # 4. Stability (errors and stuck states)
    # A: 0 errors/stuck, B: 1-2 minor issues, C: 3-5, D: 6+
    stability_problems = errors * 2 + stuck * 3 + confusing
    stability_score = max(0, 100 - (stability_problems * 10))
    
    # 5. Retention (unfinished goals and rewards)
    # A: 5+ goals, B: 3-4, C: 1-2, D: 0
    if goals >= 5:
        retention_score = 100
    elif goals >= 3:
        retention_score = 70 + (goals - 3) * 15  # 70->100
    elif goals >= 1:
        retention_score = 30 + (goals - 1) * 20  # 30->70
    else:
        retention_score = 0
    
    # Overall score: weighted average of categories
    # Weights reflect importance for Club NYC
    weights = {
        'onboarding': 0.20,   # Fast entry is important
        'discovery': 0.20,     # Finding content matters
        'nyc_culture': 0.30,   # THIS IS THE HOOK - highest weight
        'stability': 0.15,     # Must work properly
        'retention': 0.15      # Reasons to return
    }
    
    overall_score = (
        onboarding_score * weights['onboarding'] +
        discovery_score * weights['discovery'] +
        nyc_culture_score * weights['nyc_culture'] +
        stability_score * weights['stability'] +
        retention_score * weights['retention']
    )
    
    # Letter grades
    def letter_grade(score):
        if score >= 90: return 'A'
        elif score >= 80: return 'B'
        elif score >= 70: return 'C'
        elif score >= 60: return 'D'
        else: return 'F'
    
    score = {
        'version': 2,  # Updated scoring version
        'timestamp': report['end_time'],
        'session_type': report['session_type'],
        
        # Raw metrics
        'time_to_first_fun_seconds': time_to_fun,
        'time_to_enter_game_seconds': time_to_enter,
        'places_discovered_count': places,
        'features_discovered_count': features,
        'mini_games_attempted_count': games,
        'nyc_references_count': nyc_refs,
        'nyc_jokes_count': nyc_jokes,
        'console_errors_count': errors,
        'stuck_states_count': stuck,
        'confusing_moments_count': confusing,
        'rewards_earned_count': len(report.get('rewards_earned', [])),
        'unfinished_goals_count': goals,
        
        # Category scores
        'onboarding_score': round(onboarding_score, 1),
        'discovery_score': round(discovery_score, 1),
        'nyc_culture_score': round(nyc_culture_score, 1),
        'stability_score': round(stability_score, 1),
        'retention_score': round(retention_score, 1),
        
        # Letter grades
        'onboarding_grade': letter_grade(onboarding_score),
        'discovery_grade': letter_grade(discovery_score),
        'nyc_culture_grade': letter_grade(nyc_culture_score),
        'stability_grade': letter_grade(stability_score),
        'retention_grade': letter_grade(retention_score),
        
        # Overall
        'overall_score': round(overall_score, 1)
    }
    
    return score


async def main():
    """Run first-time, returning, and coverage sessions"""
    
    # First-time player (measures what new players actually see)
    bot1 = PlaytestBot('playtest-new-player', 'http://localhost:5173')
    await bot1.init()
    try:
        await bot1.run_first_time_session()
    finally:
        report1 = await bot1.finalize_report()
        await bot1.close()
    
    # Returning player
    bot2 = PlaytestBot('playtest-returning', 'http://localhost:5173')
    await bot2.init()
    try:
        await bot2.run_returning_session()
    finally:
        report2 = await bot2.finalize_report()
        await bot2.close()
    
    # Coverage session (visits ALL rooms and tries ALL games)
    bot3 = PlaytestBot('playtest-coverage', 'http://localhost:5173')
    await bot3.init()
    try:
        await bot3.run_coverage_session()
    finally:
        report3 = await bot3.finalize_report()
        await bot3.close()
    
    # Generate summary
    from report_generator import generate_summary_report
    summary_path = generate_summary_report([report1, report2, report3])
    
    # Calculate and save scores
    score1 = calculate_score(report1)
    score2 = calculate_score(report2)
    score3 = calculate_score(report3)  # Coverage session
    
    # Combined score uses first-time + returning (not coverage)
    # Coverage is for discovering content, not measuring UX
    combined_score = (score1['overall_score'] + score2['overall_score']) / 2
    
    # Save latest.json for comparison
    latest = {
        'generated_at': time.time(),
        'first_time_score': score1,
        'returning_score': score2,
        'coverage_score': score3,
        'combined_score': combined_score,
        'notes': 'Combined score is average of first_time and returning only. Coverage session is for content discovery.'
    }
    
    latest_path = OUT / 'latest.json'
    with open(latest_path, 'w') as f:
        json.dump(latest, f, indent=2)
    
    print(f"\n📊 Scores saved to: {latest_path}")
    print(f"   First-time score: {score1['overall_score']:.1f}/100")
    print(f"   Returning score: {score2['overall_score']:.1f}/100")
    print(f"   Coverage score: {score3['overall_score']:.1f}/100 (FYI only)")
    print(f"   Combined score: {combined_score:.1f}/100")
    
    print(f"\n🗽 NYC Jokes found:")
    print(f"   First-time: {len(report1.get('nyc_jokes_seen', []))} jokes")
    print(f"   Coverage: {len(report3.get('nyc_jokes_seen', []))} jokes")
    if report3.get('nyc_jokes_seen'):
        for joke in report3['nyc_jokes_seen']:
            print(f"      - {joke['joke']} (at {joke['location']})")
    
    print("\n✅ Playtest complete! Check tools/playtest/out/ for results.")
    
    # Exit with non-zero if scores are low (below 60)
    if combined_score < 60:
        print(f"\n⚠️  Warning: Combined score {combined_score:.1f} is below threshold (60)")
        return 1
    
    return 0


if __name__ == '__main__':
    exit_code = asyncio.run(main())
    import sys
    sys.exit(exit_code)
