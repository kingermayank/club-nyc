"""Drive your persona's browser in the City Sim (tools/sim/citysim.py must be running).

    .venv/bin/python tools/sim/city.py <agent> <command> [args...] [--no-shot] [--wait SECONDS]

Commands
  look                      screenshot + everything on screen (people, things, controls, panel text, chat)
  text                      the same without a screenshot
  click <ref | x y>         ref = h:<thing id> (world object), p:<Name> (a person), c<N> (a button/link/input),
                            m:<place> (a landmark on the open map), s:<N> (a station on the open subway map)
  hover <ref | x y>         move the mouse there and read the hover label (does not click)
  dblclick / rclick         double / right click
  drag x1 y1 x2 y2 [x3 y3 ...] [ms]   press, move through the points, release (swipe a card, scribble sauce)
  say <message>             type into the chat box and press Enter (max 120 chars; keep it friendly)
  type <text>               type into whatever has keyboard focus
  fill <cN> <text>          click a text box, clear it, type
  select <cN> <option>      pick an option in a dropdown
  key <Key> [Key...]        press keys: Escape Enter Space ArrowLeft d m u n f p h ...
  hold <Key> <ms>           hold a key down
  scroll [dy]               scroll the page or panel (default 500, negative = up)
  wait [seconds]            let time pass (max 60), then look
  step on [ms] | step off   pause game time; each action then advances it ms (default 400). For real-time jobs.
  advance [ms]              (step mode) let game time run without input
  open </path>              open a same-site page (e.g. /help/); back = browser back; tabs / tab N / close-tab
  autopilot on|off          let the dev autopilot steer multiplayer races (Citi Bike Dash, Rush Hour Run)
  note <text>               add a line to your field journal (timestamped, with the latest screenshot)
  status                    your name, coins, items, stamps, team, friends and where they are
  schedule                  the group schedule and what's on now
"""
import json, os, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))


def main():
    argv = sys.argv[1:]
    if len(argv) < 2 or argv[0] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0)
    opts = {}
    rest = []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--no-shot':
            opts['shot'] = False
        elif a == '--wait' and i + 1 < len(argv):
            opts['wait'] = float(argv[i + 1])
            i += 1
        else:
            rest.append(a)
        i += 1
    agent, cmd, args = rest[0], rest[1], rest[2:]
    if os.environ.get('CITYSIM_PORT'):
        port = int(os.environ['CITYSIM_PORT'])
    else:
        try:
            port = json.load(open(os.path.join(ROOT, 'tools', 'out', 'sim', 'current.json')))['port']
        except Exception:
            port = 8777
    body = json.dumps({'agent': agent, 'cmd': cmd, 'args': args, 'opts': opts}).encode()
    req = urllib.request.Request(f'http://127.0.0.1:{port}/act', data=body, headers={'content-type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=150) as r:
            res = json.loads(r.read())
    except Exception as e:
        print(f'The city sim is not answering ({e}). Wait a few seconds and try again; if it keeps failing, stop and report it.')
        sys.exit(2)
    print(res.get('text', ''))
    if not res.get('ok'):
        sys.exit(1)


if __name__ == '__main__':
    main()
