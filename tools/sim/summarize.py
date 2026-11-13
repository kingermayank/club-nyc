"""Sum up a City Sim run: what each persona did, where they spent their time, what the server recorded.

    .venv/bin/python tools/sim/summarize.py [tools/out/sim/<run>]     (default: the latest run)

Reads <run>/<agent>/actions.jsonl (every command an agent sent), docs/research/agent-playtest/journals/<agent>.md
and <run>/city.db (a VACUUM INTO copy of the private city's database: chat, ledger, XP, jobs, matches, friends,
client errors). Writes <run>/summary.json and prints a short digest.
"""
import collections, json, os, re, sqlite3, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
JOURNALS = os.path.join(ROOT, 'docs', 'research', 'agent-playtest', 'round2', 'journals')
TAGS = re.compile(r'\[([A-Z][A-Z-]+)\]')


def run_dir():
    if len(sys.argv) > 1:
        return sys.argv[1]
    cur = json.load(open(os.path.join(ROOT, 'tools', 'out', 'sim', 'current.json')))
    return os.path.join(ROOT, cur['out'])


def agent_stats(path):
    rows = [json.loads(l) for l in open(path) if l.strip()]
    if not rows:
        return None
    t0 = rows[0]['t']
    cmds = collections.Counter(r['did'].split(' ')[0] for r in rows)
    timeline, per_room, coins = [], collections.Counter(), []
    prev = None
    for i, r in enumerate(rows):
        room = r.get('room') or ('(page ' + (r.get('path') or '?').split('?')[0] + ')')
        if room != prev:
            timeline.append({'min': r['min'], 'room': room})
            prev = room
        if i + 1 < len(rows):
            per_room[room] += (rows[i + 1]['t'] - r['t']) / 60000
        if r.get('coins') is not None:
            coins.append((r['min'], r['coins']))
    first_game = next((r['min'] for r in rows if r.get('room')), None)
    # blind runs: where and why the player closed the tab, and how many things they actually did
    passive = ('look', 'text', 'shot')
    active = [r for r in rows if r['did'].split(' ')[0] not in passive and not r.get('left')]
    left = next((r for r in rows if r.get('left')), None)
    order = []
    for t in timeline:
        if not t['room'].startswith('(') and t['room'] not in order:
            order.append(t['room'])
    errs = os.path.join(os.path.dirname(path), 'errors.log')
    return {
        'active_actions': len(active),
        'left': {'reason': left['did'][6:], 'room': left.get('room'), 'after_active': len(active)} if left else None,
        'room_order': order,
        'console_errors': sum(1 for _ in open(errs)) if os.path.exists(errs) else 0,
        'actions': len(rows),
        'screenshots': sum(1 for r in rows if r.get('shot')),
        'span_min': round((rows[-1]['t'] - t0) / 60000, 1),
        'first_in_city_min': first_game,
        'commands': dict(cmds.most_common()),
        'rooms_visited': sorted({t['room'] for t in timeline if not t['room'].startswith('(')}),
        'minutes_per_room': {k: round(v, 1) for k, v in per_room.most_common()},
        'timeline': timeline,
        'coins': {'start': coins[0][1] if coins else None, 'end': coins[-1][1] if coins else None, 'max': max((c for _, c in coins), default=None)},
    }


def journal_stats(agent):
    p = os.path.join(JOURNALS, f'{agent}.md')
    if not os.path.exists(p):
        return None
    lines = [l for l in open(p) if l.startswith('- **')]
    tags = collections.Counter(t for l in lines for t in TAGS.findall(l))
    return {'notes': len(lines), 'tags': dict(tags.most_common())}


def db_stats(path, t0):
    if not os.path.exists(path):
        return None
    db = sqlite3.connect(path)
    db.row_factory = sqlite3.Row
    q = lambda sql, *a: [dict(r) for r in db.execute(sql, a)]
    m = lambda at: round((at / 1000 - t0) / 60, 1) if at else None
    users = q('SELECT id, name, created_at, coins, team, member_no, play_ms, look FROM users WHERE name IS NOT NULL ORDER BY created_at')
    names = {u['id']: u['name'] for u in users}
    out = {'users': [{**{k: u[k] for k in ('name', 'coins', 'team', 'member_no')}, 'joined_min': m(u['created_at']), 'play_min': round((u['play_ms'] or 0) / 60000, 1)} for u in users]}
    out['chat'] = [{'min': m(r['at']), 'room': r['room'], 'who': names.get(r['user_id'], r['user_id'][:6]), 'text': r['text']} for r in q('SELECT * FROM chat_log ORDER BY at')]
    out['friends'] = [{'a': names.get(r['a'], '?'), 'b': names.get(r['b'], '?'), 'status': r['status']} for r in q('SELECT * FROM friends')]
    out['jobs'] = [{'who': names.get(r['user_id'], '?'), 'game': r['game'], 'min': m(r['started_at']), 'secs': round((r['finished_at'] - r['started_at']) / 1000) if r['finished_at'] else None, 'score': r.get('score')} for r in q('SELECT * FROM game_runs ORDER BY started_at')]
    out['mp'] = [{'game': r['game'], 'room': r['room'], 'players': r['players'], 'min': m(r['started_at']), 'secs': round((r['ended_at'] - r['started_at']) / 1000) if r['ended_at'] else None, 'results': [{'who': names.get(x['user_id'], '?'), 'place': x['place'], 'won': x['won'], 'score': x['score']} for x in q('SELECT * FROM mp_results WHERE match_id = ?', r['id'])]} for r in q('SELECT * FROM mp_matches ORDER BY started_at')]
    ledger = collections.defaultdict(lambda: collections.Counter())
    for r in q('SELECT user_id, reason, SUM(delta) AS d FROM ledger GROUP BY user_id, reason'):
        ledger[names.get(r['user_id'], '?')][r['reason']] = r['d']
    out['ledger'] = {k: dict(v) for k, v in ledger.items()}
    xp = collections.defaultdict(lambda: collections.Counter())
    for r in q('SELECT user_id, reason, SUM(amount) AS a FROM xp_log GROUP BY user_id, reason'):
        xp[names.get(r['user_id'], '?')][r['reason']] = r['a']
    out['xp'] = {k: dict(v) for k, v in xp.items()}
    out['client_errors'] = [{'who': names.get(r['user_id'], None), 'min': m(r['at']), 'message': r['message'][:300], 'url': r['url']} for r in q('SELECT * FROM client_errors ORDER BY at')]
    out['reports'] = q('SELECT reporter, target, reason, context, created_at FROM reports')
    out['events'] = dict(collections.Counter(r['name'] for r in q('SELECT name FROM events')))
    return out


def main():
    rd = run_dir()
    started = None
    try:
        started = json.load(open(os.path.join(ROOT, 'tools', 'out', 'sim', 'current.json')))['started']
    except Exception:
        pass
    agents = {}
    t_first = None
    for a in sorted(os.listdir(rd)):
        p = os.path.join(rd, a, 'actions.jsonl')
        if os.path.isfile(p):
            first = json.loads(open(p).readline())
            t_first = min(t_first or first['t'], first['t'])
            agents[a] = {'actions': agent_stats(p), 'journal': journal_stats(a)}
    t0 = (started or (t_first or 0) / 1000)
    summary = {'run': os.path.basename(rd), 'agents': agents, 'server': db_stats(os.path.join(rd, 'city.db'), t0)}
    rooms = collections.Counter(r for a in agents.values() if a['actions'] for r in a['actions']['rooms_visited'])
    summary['room_coverage'] = dict(rooms.most_common())
    json.dump(summary, open(os.path.join(rd, 'summary.json'), 'w'), indent=1)
    for a, s in agents.items():
        x = s['actions'] or {}
        j = s['journal'] or {}
        lf = x.get('left') or {}
        print(f"{a:8} active {x.get('active_actions')} · rooms {len(x.get('rooms_visited', []))} {'>'.join(x.get('room_order', []))[:90]} · notes {j.get('notes')} · left: {(lf.get('reason') or 'no')[:60]}")
    srv = summary['server'] or {}
    print(f"chat lines {len(srv.get('chat', []))} · friendships {len(srv.get('friends', []))} · job runs {len(srv.get('jobs', []))} · mp matches {len(srv.get('mp', []))} · client errors {len(srv.get('client_errors', []))}")
    print('rooms covered:', len(rooms), dict(rooms.most_common()))
    print('wrote', os.path.join(rd, 'summary.json'))


if __name__ == '__main__':
    main()
