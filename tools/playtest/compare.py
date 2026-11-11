#!/usr/bin/env python3
"""
Compare two playtest runs and show metric deltas.

Usage:
    python compare.py <old.json> [<new.json>]
    python compare.py --baseline tools/playtest/history/2024-11-11/latest.json
    
If new.json is omitted, uses tools/playtest/out/latest.json
"""

import sys
import json
from pathlib import Path
from typing import Dict, Any


def load_scores(path: str) -> Dict[str, Any]:
    """Load scores from a latest.json file"""
    with open(path) as f:
        return json.load(f)


def format_delta(old_val: float, new_val: float, reverse: bool = False) -> str:
    """Format a metric delta with color and direction"""
    delta = new_val - old_val
    if abs(delta) < 0.01:
        return f"{new_val:.1f} (no change)"
    
    # For metrics where lower is better (reverse=True)
    is_improvement = delta < 0 if reverse else delta > 0
    
    sign = "+" if delta > 0 else ""
    symbol = "📈" if is_improvement else "📉"
    
    return f"{new_val:.1f} ({sign}{delta:.1f}) {symbol}"


def compare_scores(old: Dict[str, Any], new: Dict[str, Any]):
    """Compare two score files and print deltas"""
    
    print("=" * 70)
    print("PLAYTEST COMPARISON")
    print("=" * 70)
    
    print(f"\nOld run: {old.get('generated_at', 'unknown')}")
    print(f"New run: {new.get('generated_at', 'unknown')}")
    
    # Overall scores
    print("\n" + "=" * 70)
    print("OVERALL SCORES")
    print("=" * 70)
    
    old_combined = old.get('combined_score', 0)
    new_combined = new.get('combined_score', 0)
    
    print(f"\nCombined Score: {format_delta(old_combined, new_combined)}")
    
    # First-time session
    print("\n" + "-" * 70)
    print("FIRST-TIME PLAYER SESSION")
    print("-" * 70)
    
    old_ft = old.get('first_time_score', {})
    new_ft = new.get('first_time_score', {})
    
    if old_ft and new_ft:
        print(f"\nOverall Score: {format_delta(old_ft.get('overall_score', 0), new_ft.get('overall_score', 0))}")
        
        print("\n⏱️  Timing (lower is better):")
        print(f"  Time to first fun:  {format_delta(old_ft.get('time_to_first_fun_seconds', 0), new_ft.get('time_to_first_fun_seconds', 0), reverse=True)}")
        print(f"  Time to enter game: {format_delta(old_ft.get('time_to_enter_game_seconds', 0), new_ft.get('time_to_enter_game_seconds', 0), reverse=True)}")
        
        print("\n🗺️  Discovery (higher is better):")
        print(f"  Places discovered:   {format_delta(old_ft.get('places_discovered_count', 0), new_ft.get('places_discovered_count', 0))}")
        print(f"  Features discovered: {format_delta(old_ft.get('features_discovered_count', 0), new_ft.get('features_discovered_count', 0))}")
        print(f"  Mini-games tried:    {format_delta(old_ft.get('mini_games_attempted_count', 0), new_ft.get('mini_games_attempted_count', 0))}")
        
        print("\n🗽 NYC Culture (higher is better):")
        print(f"  NYC references:      {format_delta(old_ft.get('nyc_references_count', 0), new_ft.get('nyc_references_count', 0))}")
        print(f"  NYC jokes visible:   {format_delta(old_ft.get('nyc_jokes_count', 0), new_ft.get('nyc_jokes_count', 0))}")
        
        print("\n⚠️  Issues (lower is better):")
        print(f"  Console errors:      {format_delta(old_ft.get('console_errors_count', 0), new_ft.get('console_errors_count', 0), reverse=True)}")
        print(f"  Stuck states:        {format_delta(old_ft.get('stuck_states_count', 0), new_ft.get('stuck_states_count', 0), reverse=True)}")
        print(f"  Confusing moments:   {format_delta(old_ft.get('confusing_moments_count', 0), new_ft.get('confusing_moments_count', 0), reverse=True)}")
        
        print("\n🔄 Retention (higher is better):")
        print(f"  Unfinished goals:    {format_delta(old_ft.get('unfinished_goals_count', 0), new_ft.get('unfinished_goals_count', 0))}")
    
    # Returning session
    print("\n" + "-" * 70)
    print("RETURNING PLAYER SESSION")
    print("-" * 70)
    
    old_ret = old.get('returning_score', {})
    new_ret = new.get('returning_score', {})
    
    if old_ret and new_ret:
        print(f"\nOverall Score: {format_delta(old_ret.get('overall_score', 0), new_ret.get('overall_score', 0))}")
        
        print("\n⏱️  Timing (lower is better):")
        print(f"  Time to first fun:  {format_delta(old_ret.get('time_to_first_fun_seconds', 0), new_ret.get('time_to_first_fun_seconds', 0), reverse=True)}")
        
        print("\n🗺️  Discovery (higher is better):")
        print(f"  Features discovered: {format_delta(old_ret.get('features_discovered_count', 0), new_ret.get('features_discovered_count', 0))}")
        print(f"  Mini-games tried:    {format_delta(old_ret.get('mini_games_attempted_count', 0), new_ret.get('mini_games_attempted_count', 0))}")
    
    # Summary
    print("\n" + "=" * 70)
    print("SUMMARY")
    print("=" * 70)
    
    delta = new_combined - old_combined
    if abs(delta) < 0.5:
        status = "No significant change"
        symbol = "➡️"
    elif delta > 0:
        status = f"Improvement: +{delta:.1f} points"
        symbol = "✅"
    else:
        status = f"Regression: {delta:.1f} points"
        symbol = "❌"
    
    print(f"\n{symbol} {status}")
    print(f"\n   Old: {old_combined:.1f}/100")
    print(f"   New: {new_combined:.1f}/100")
    
    if new_combined < 60:
        print(f"\n⚠️  Warning: Score is below threshold (60)")
        return 1
    
    return 0


def main():
    if len(sys.argv) < 2 or '--help' in sys.argv:
        print(__doc__)
        return 1
    
    old_path = sys.argv[1]
    
    if len(sys.argv) >= 3:
        new_path = sys.argv[2]
    else:
        # Default to latest
        new_path = str(Path(__file__).parent / 'out' / 'latest.json')
    
    try:
        old_scores = load_scores(old_path)
        new_scores = load_scores(new_path)
    except FileNotFoundError as e:
        print(f"Error: {e}")
        print("\nMake sure both score files exist.")
        print(f"  Old: {old_path}")
        print(f"  New: {new_path}")
        return 1
    
    return compare_scores(old_scores, new_scores)


if __name__ == '__main__':
    sys.exit(main())
