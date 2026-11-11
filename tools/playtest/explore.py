"""
Quick exploration script to gather data for the fun audit.
This takes screenshots and captures the current state of NYC references.
"""

import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

HERE = Path(__file__).parent
OUT = HERE / 'out' / 'exploration'


async def explore_game():
    """Explore the game and gather data"""
    
    OUT.mkdir(parents=True, exist_ok=True)
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={'width': 1000, 'height': 565})
        
        print("Loading game...")
        await page.goto('http://localhost:5173/play?profile=explore&offline=1', 
                       wait_until='networkidle')
        await page.wait_for_timeout(3000)
        
        # Take initial screenshot
        await page.screenshot(path=OUT / '01-initial.png')
        print("✓ Initial screenshot")
        
        # Check if we need to go through onboarding
        has_creator = await page.query_selector('.creator')
        if has_creator:
            print("Completing onboarding...")
            # Quick onboarding
            for i in range(6):
                btn = await page.query_selector('.creator .btn.go')
                if btn:
                    await btn.click()
                    await page.wait_for_timeout(500)
            await page.wait_for_timeout(3000)
        
        # Wait for game
        await page.wait_for_timeout(2000)
        await page.screenshot(path=OUT / '02-spawned.png')
        print("✓ Spawned in game")
        
        # Get current room and game state
        game_state = await page.evaluate("""
            () => {
                const w = window.clubNyc;
                if (!w) return null;
                
                return {
                    room: w.world?.room?.id,
                    roomTitle: w.world?.room?.title,
                    coins: w.save?.coins,
                    name: w.save?.name,
                    team: w.save?.team,
                    hotspots: w.world?.hits?.map(h => ({
                        id: h.id,
                        label: h.label
                    })) || []
                };
            }
        """)
        
        if game_state:
            print(f"\\nCurrent state:")
            print(f"  Room: {game_state.get('room')} - {game_state.get('roomTitle')}")
            print(f"  Player: {game_state.get('name')} ({game_state.get('team')})")
            print(f"  Coins: {game_state.get('coins')}")
            print(f"  Hotspots: {len(game_state.get('hotspots', []))}")
        
        # Visit a few key locations
        rooms = [
            'times-square',
            'broadway',
            'central-park',
            'iloveny',
            'subway',
            'pizza',
            'apartment'
        ]
        
        for room in rooms:
            print(f"\\nVisiting {room}...")
            await page.evaluate(f"window.clubNyc.api.goto('{room}')")
            await page.wait_for_timeout(2000)
            
            await page.screenshot(path=OUT / f'room-{room}.png')
            
            # Get room info
            room_info = await page.evaluate("""
                () => {
                    const w = window.clubNyc.world;
                    if (!w) return null;
                    
                    return {
                        room: w.room?.id,
                        title: w.room?.title,
                        hotspots: w.hits?.map(h => ({
                            id: h.id,
                            label: h.label
                        })) || [],
                        npcs: w.npcs?.length || 0
                    };
                }
            """)
            
            if room_info:
                print(f"  ✓ {room_info['title']}")
                print(f"    Hotspots: {len(room_info['hotspots'])}")
                print(f"    NPCs: {room_info['npcs']}")
                
                # Save room data
                with open(OUT / f'room-{room}.json', 'w') as f:
                    json.dump(room_info, f, indent=2)
        
        # Try opening various features
        features = [
            ('map', "window.clubNyc.api.openMap()"),
            ('subway-map', "window.clubNyc.api.openSubway()"),
            ('newspaper', "window.clubNyc.api.newspaper()"),
        ]
        
        for name, js in features:
            try:
                print(f"\\nOpening {name}...")
                await page.goto('http://localhost:5173/play?profile=explore&offline=1', 
                               wait_until='networkidle')
                await page.wait_for_timeout(2000)
                
                await page.evaluate(js)
                await page.wait_for_timeout(1000)
                await page.screenshot(path=OUT / f'feature-{name}.png')
                print(f"  ✓ Captured {name}")
                
                # Close overlay
                await page.evaluate("document.querySelector('.overlay .x-btn')?.click()")
                await page.wait_for_timeout(500)
            except Exception as e:
                print(f"  ✗ Error: {e}")
        
        # Try a mini-game
        print("\\nTrying mini-game...")
        await page.goto('http://localhost:5173/play?game=slice-factory&profile=explore',
                       wait_until='networkidle')
        await page.wait_for_timeout(2000)
        await page.screenshot(path=OUT / 'minigame-slice-factory.png')
        print("  ✓ Captured Slice Factory")
        
        await browser.close()
        
        print(f"\\n✅ Exploration complete! Check {OUT}")


if __name__ == '__main__':
    asyncio.run(explore_game())
