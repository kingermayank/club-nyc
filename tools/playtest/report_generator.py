"""
Generate human-readable markdown reports from playtest data.
"""

import json
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime


def format_time(seconds: float) -> str:
    """Format seconds as human-readable time"""
    if seconds < 60:
        return f"{seconds:.1f}s"
    minutes = int(seconds // 60)
    secs = seconds % 60
    return f"{minutes}m {secs:.0f}s"


def generate_summary_report(reports: List[Dict[str, Any]]):
    """Generate a markdown summary of all playtest reports"""
    
    out_dir = Path(__file__).parent / 'out'
    out_dir.mkdir(exist_ok=True)
    
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    
    md = f"""# Club NYC Playtest Report
*Generated: {timestamp}*

## Executive Summary

This report captures autonomous playtest sessions simulating first-time and returning players.

"""
    
    # Aggregate metrics
    for i, report in enumerate(reports):
        session_type = report['session_type']
        md += f"\n### Session {i+1}: {session_type.replace('_', ' ').title()}\n\n"
        
        # Key timings
        md += "#### ⏱️ Key Timings\n\n"
        md += f"- **Total duration**: {format_time(report['duration_seconds'])}\n"
        
        if report.get('time_to_first_click'):
            md += f"- **Time to first interaction**: {format_time(report['time_to_first_click'])}\n"
        
        if report.get('time_to_enter_game'):
            md += f"- **Time to enter game world**: {format_time(report['time_to_enter_game'])}\n"
        
        if report.get('time_to_first_fun'):
            md += f"- **Time to first fun moment**: {format_time(report['time_to_first_fun'])}\n"
        
        if report.get('dead_time_seconds', 0) > 0:
            md += f"- **Dead time** (gaps > 5s): {format_time(report['dead_time_seconds'])}\n"
        
        # Discovery
        md += "\n#### 🗺️ Discovery\n\n"
        md += f"- **Places discovered**: {len(report['places_discovered'])} "
        if report['places_discovered']:
            md += f"({', '.join(report['places_discovered'][:5])}{'...' if len(report['places_discovered']) > 5 else ''})\n"
        else:
            md += "(none)\n"
        
        md += f"- **Features discovered**: {len(report['features_discovered'])} "
        if report['features_discovered']:
            md += f"({', '.join(report['features_discovered'])})\n"
        else:
            md += "(none)\n"
        
        md += f"- **Mini-games tried**: {len(report['mini_games_attempted'])} "
        if report['mini_games_attempted']:
            md += f"({', '.join(report['mini_games_attempted'])})\n"
        else:
            md += "(none)\n"
        
        # NYC Culture
        md += "\n#### 🗽 NYC Culture & Humor\n\n"
        md += f"- **NYC references spotted**: {len(report['nyc_references_seen'])}\n"
        
        if report['nyc_references_seen']:
            md += "  - " + ", ".join(sorted(set(report['nyc_references_seen']))[:10]) + "\n"
            if len(report['nyc_references_seen']) > 10:
                md += f"  - ...and {len(report['nyc_references_seen']) - 10} more\n"
        
        md += f"- **NYC jokes/parodies seen**: {len(report['nyc_jokes_seen'])}\n"
        if report['nyc_jokes_seen']:
            for joke in report['nyc_jokes_seen']:
                md += f"  - {joke}\n"
        
        # Problems
        md += "\n#### ⚠️ Issues & Friction\n\n"
        md += f"- **Console errors**: {len(report['console_errors'])}\n"
        if report['console_errors'][:3]:
            for error in report['console_errors'][:3]:
                md += f"  - `{error[:100]}{'...' if len(error) > 100 else ''}`\n"
            if len(report['console_errors']) > 3:
                md += f"  - ...and {len(report['console_errors']) - 3} more\n"
        
        md += f"- **Stuck states**: {len(report['stuck_states'])}\n"
        for stuck in report['stuck_states']:
            md += f"  - At **{stuck['location']}** ({format_time(stuck['timestamp'])}): {stuck['description']}\n"
        
        md += f"- **Confusing moments**: {len(report['confusing_moments'])}\n"
        for confusion in report['confusing_moments']:
            md += f"  - {format_time(confusion['timestamp'])}: {confusion['issue']}\n"
            if confusion.get('context'):
                md += f"    - Context: {confusion['context']}\n"
        
        # Retention
        md += "\n#### 🔄 Retention Signals\n\n"
        md += f"- **Rewards earned**: {len(report['rewards_earned'])}\n"
        for reward in report['rewards_earned'][:5]:
            md += f"  - {reward}\n"
        
        md += f"- **Unfinished goals**: {len(report['unfinished_goals'])}\n"
        for goal in report['unfinished_goals'][:5]:
            md += f"  - {goal}\n"
        
        md += f"- **Social connections**: {report.get('social_connections', 0)}\n"
    
    # Overall scores
    md += "\n## 📊 Overall Scores\n\n"
    
    scores = {}
    
    # Onboarding score (lower time to fun = better)
    first_time_report = next((r for r in reports if r['session_type'] == 'first_time'), None)
    if first_time_report and first_time_report.get('time_to_first_fun'):
        fun_time = first_time_report['time_to_first_fun']
        if fun_time < 30:
            scores['onboarding'] = ('A', 'Excellent')
        elif fun_time < 60:
            scores['onboarding'] = ('B', 'Good')
        elif fun_time < 120:
            scores['onboarding'] = ('C', 'Fair')
        else:
            scores['onboarding'] = ('D', 'Needs improvement')
    
    # Discovery score (more places/features = better)
    total_discovered = sum(len(r['places_discovered']) + len(r['features_discovered']) 
                          for r in reports) / len(reports)
    if total_discovered > 15:
        scores['discovery'] = ('A', 'Excellent')
    elif total_discovered > 10:
        scores['discovery'] = ('B', 'Good')
    elif total_discovered > 5:
        scores['discovery'] = ('C', 'Fair')
    else:
        scores['discovery'] = ('D', 'Needs improvement')
    
    # NYC culture score
    total_nyc = sum(len(r['nyc_references_seen']) for r in reports) / len(reports)
    if total_nyc > 15:
        scores['nyc_culture'] = ('A', 'Excellent')
    elif total_nyc > 10:
        scores['nyc_culture'] = ('B', 'Good')
    elif total_nyc > 5:
        scores['nyc_culture'] = ('C', 'Fair')
    else:
        scores['nyc_culture'] = ('D', 'Needs improvement')
    
    # Stability score (fewer errors = better)
    total_errors = sum(len(r['console_errors']) + len(r['stuck_states']) 
                      for r in reports)
    if total_errors == 0:
        scores['stability'] = ('A', 'Excellent')
    elif total_errors < 3:
        scores['stability'] = ('B', 'Good')
    elif total_errors < 7:
        scores['stability'] = ('C', 'Fair')
    else:
        scores['stability'] = ('D', 'Needs improvement')
    
    # Retention score
    total_goals = sum(len(r['unfinished_goals']) for r in reports) / len(reports)
    if total_goals > 5:
        scores['retention'] = ('A', 'Excellent')
    elif total_goals > 3:
        scores['retention'] = ('B', 'Good')
    elif total_goals > 1:
        scores['retention'] = ('C', 'Fair')
    else:
        scores['retention'] = ('D', 'Needs improvement')
    
    md += "| Metric | Grade | Assessment |\n"
    md += "|--------|-------|------------|\n"
    for metric, (grade, assessment) in scores.items():
        md += f"| **{metric.title()}** | **{grade}** | {assessment} |\n"
    
    # Key recommendations
    md += "\n## 🎯 Key Recommendations\n\n"
    
    all_confusions = []
    for report in reports:
        all_confusions.extend(report['confusing_moments'])
    
    if all_confusions:
        md += "### High Priority Fixes\n\n"
        for i, confusion in enumerate(all_confusions[:5], 1):
            md += f"{i}. **{confusion['issue']}**\n"
            if confusion.get('context'):
                md += f"   - {confusion['context']}\n"
            md += "\n"
    
    # NYC humor opportunities
    nyc_refs = set()
    for report in reports:
        nyc_refs.update(report['nyc_references_seen'])
    
    if len(nyc_refs) < 10:
        md += "### NYC Humor Opportunities\n\n"
        md += "The game currently surfaces relatively few NYC references in the first 10 minutes. Consider:\n\n"
        md += "- Adding more visible parody signs (Starducks, NYKE, etc.)\n"
        md += "- More NYC-specific dialogue from NPCs\n"
        md += "- Prominent NYC landmarks in the starting area\n"
        md += "- Tutorial quest that highlights NYC jokes\n\n"
    
    # Screenshots
    md += "\n## 📸 Screenshots\n\n"
    md += "Screenshots are saved in `tools/playtest/out/screenshots/`\n\n"
    
    # Timeline
    md += "\n## 📅 Detailed Timeline\n\n"
    md += "<details>\n<summary>Click to expand full timeline</summary>\n\n"
    
    for i, report in enumerate(reports):
        md += f"\n### Session {i+1}: {report['session_type']}\n\n"
        md += "| Time | Event | Details |\n"
        md += "|------|-------|----------|\n"
        
        for metric in report['timeline'][:30]:  # First 30 events
            time_str = format_time(metric['timestamp'])
            notes = metric['notes'] if metric.get('notes') else ''
            value_str = str(metric['value'])[:50]
            md += f"| {time_str} | {metric['name']} | {value_str} {notes} |\n"
        
        if len(report['timeline']) > 30:
            md += f"| ... | *{len(report['timeline']) - 30} more events* | ... |\n"
    
    md += "\n</details>\n\n"
    
    # Footer
    md += "\n---\n\n"
    md += "*This report was generated automatically by the Club NYC playtest harness.*\n"
    md += "*Run: `npm run playtest` or `python tools/playtest/bot.py`*\n"
    
    # Save report
    report_path = out_dir / 'PLAYTEST_REPORT.md'
    with open(report_path, 'w') as f:
        f.write(md)
    
    print(f"\n📄 Summary report saved to: {report_path}")
    
    # Also print to console
    print("\n" + "="*60)
    print("PLAYTEST SUMMARY")
    print("="*60)
    for metric, (grade, assessment) in scores.items():
        print(f"{metric.title()}: {grade} ({assessment})")
    print("="*60 + "\n")
    
    return report_path


if __name__ == '__main__':
    # Load existing reports and regenerate summary
    import sys
    out_dir = Path(__file__).parent / 'out'
    
    reports = []
    for report_file in sorted(out_dir.glob('report-*.json')):
        with open(report_file) as f:
            reports.append(json.load(f))
    
    if reports:
        generate_summary_report(reports)
    else:
        print("No reports found. Run bot.py first.")
        sys.exit(1)
