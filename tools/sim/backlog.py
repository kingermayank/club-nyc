"""Collect the static-to-alive design tables (round2/design/*.md) into one backlog JSON.

    .venv/bin/python tools/sim/backlog.py   -> docs/research/agent-playtest/round2/design/backlog.json
"""
import json, os, re
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
D = os.path.join(ROOT, 'docs', 'research', 'agent-playtest', 'round2', 'design')
DISTRICT = {'midtown.md': 'Midtown and travel', 'parks-downtown.md': 'Parks and downtown', 'neighborhoods-home-systems.md': 'Neighborhoods, home and systems'}
rows = []
for fn, district in DISTRICT.items():
    heading, header = '', None
    for line in open(os.path.join(D, fn)):
        line = line.rstrip('\n')
        if line.startswith('#'):
            heading, header = line.lstrip('#').strip(), None
            continue
        if not line.startswith('|'):
            header = None if not line.strip() else header
            continue
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if header is None:
            header = [re.sub(r'[^a-z]', '', c.lower()) for c in cells]
            continue
        if all(set(c) <= set('-: ') for c in cells):
            continue
        r = dict(zip(header, cells))
        if not any(k.startswith('alive') for k in r):
            continue
        get = lambda *ks: next((r[k] for k in r if any(k.startswith(x) for x in ks)), '')
        rows.append({'district': district, 'where': heading, 'object': get('object', 'moment'), 'today': get('today'), 'alive': get('alive'),
                     'why': get('why'), 'nyc': get('nyc'), 'social': get('social'), 'effort': get('effort'), 'reuses': get('reuses')})
json.dump(rows, open(os.path.join(D, 'backlog.json'), 'w'), indent=1)
print(len(rows), 'rows')
import collections
print(collections.Counter(r['district'] for r in rows))
print(collections.Counter(re.sub(r'[^SML/ ]', '', r['effort'])[:5] for r in rows))
