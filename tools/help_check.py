"""Help Center link checker: crawls /help on a running site and checks that everything it points at is really there.

usage: .venv/bin/python tools/help_check.py [base_url]        (default http://localhost:5173)

For every page reachable from /help it checks:
  - links, pictures, scripts and stylesheets on the same site answer 200 (pages outside /help too: /play, /rules.html…)
  - every #section link lands on an element with that id (on help pages and on the policy pages)
  - the search index loads, and every page it lists is one of the crawled pages
Links to other websites are listed but not fetched. Exit code 0 = nothing broken.
"""
import json, sys, urllib.request, urllib.error
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, urlunsplit

BASE = (sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5173').rstrip('/')
ORIGIN = urlsplit(BASE).netloc


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.refs: list[tuple[str, str]] = []
        self.ids: set[str] = set()
        self.index = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if a.get('id'):
            self.ids.add(a['id'])
        if tag == 'a' and a.get('href'):
            self.refs.append(('link', a['href']))
        elif tag in ('img', 'script', 'source') and a.get('src'):
            self.refs.append((tag, a['src']))
        elif tag == 'link' and a.get('href') and a.get('rel') in ('stylesheet', 'preload', 'icon'):
            self.refs.append(('asset', a['href']))
        elif tag == 'meta' and a.get('name') == 'help-index':
            self.index = a.get('content')


cache: dict[str, tuple[int, str]] = {}
kinds: dict[str, str] = {}


def fetch(url: str) -> tuple[int, str]:
    """status and (for HTML/JSON) the body; one request per address"""
    key = url.split('#')[0]
    if key in cache:
        return cache[key]
    try:
        with urllib.request.urlopen(urllib.request.Request(key, headers={'User-Agent': 'club-nyc-help-check'}), timeout=20) as r:
            kind = r.headers.get('content-type', '')
            kinds[key] = kind
            body = r.read().decode('utf-8', 'replace') if ('html' in kind or 'json' in kind) else ''
            cache[key] = (r.status, body)
    except urllib.error.HTTPError as e:
        cache[key] = (e.code, '')
    except Exception as e:  # connection refused, timeout
        cache[key] = (0, str(e))
    return cache[key]


def wrong_kind(kind: str, url: str) -> bool:
    """a picture that comes back as a web page is a missing picture (dev servers answer unknown files with HTML)"""
    got = kinds.get(url.split('#')[0], '')
    if kind == 'img':
        return not got.startswith('image/')
    if kind == 'script':
        return 'javascript' not in got and 'typescript' not in got
    if kind == 'asset':
        return got.startswith('text/html')
    return False


def parse(url: str) -> Page:
    p = Page()
    p.feed(fetch(url)[1])
    return p


def same_site(url: str) -> bool:
    return urlsplit(url).netloc == ORIGIN


problems: list[str] = []
external: set[str] = set()
start = BASE + '/help/'
queue, seen = [start], {urlsplit(start).path.rstrip('/') or '/'}
pages: dict[str, Page] = {}
while queue:
    url = queue.pop(0)
    status, _ = fetch(url)
    if status != 200:
        problems.append(f'{url}: {status or "unreachable"}')
        continue
    page = parse(url)
    pages[urlsplit(url).path.rstrip('/')] = page
    for kind, ref in page.refs:
        if ref.startswith(('mailto:', 'tel:', 'javascript:')):
            continue
        target = urljoin(url, ref)
        if not same_site(target):
            external.add(target)
            continue
        parts = urlsplit(target)
        path = parts.path.rstrip('/') or '/'
        if kind == 'link' and path.startswith('/help') and path not in seen and '.' not in path.rsplit('/', 1)[-1]:
            seen.add(path)
            queue.append(urlunsplit((parts.scheme, parts.netloc, parts.path, '', '')))
        st, _ = fetch(target)
        # /discord redirects to the invite (or back to the landing page): any answer but an error is fine
        if st != 200:
            problems.append(f'{urlsplit(url).path}: {kind} {ref} -> {st or "unreachable"}')
        elif wrong_kind(kind, target):
            problems.append(f'{urlsplit(url).path}: {kind} {ref} -> not a {kind} ({kinds.get(target.split("#")[0], "?")})')

# every #section link lands somewhere
for path, page in list(pages.items()):
    for kind, ref in page.refs:
        if kind != 'link' or '#' not in ref:
            continue
        target = urljoin(BASE + path + '/', ref)
        if not same_site(target):
            continue
        parts = urlsplit(target)
        frag = parts.fragment
        if not frag:
            continue
        tpath = parts.path.rstrip('/') or '/'
        tpage = pages.get(tpath)
        if tpage is None:
            st, body = fetch(urlunsplit((parts.scheme, parts.netloc, parts.path, '', '')))
            if st != 200 or not body:
                continue
            tpage = parse(urlunsplit((parts.scheme, parts.netloc, parts.path, '', '')))
            pages[tpath] = tpage
        if frag not in tpage.ids:
            problems.append(f'{path}: {ref} -> no element with id "{frag}" on {tpath}')

# the search index
home = pages.get('/help')
if home is None or not home.index:
    problems.append('/help: no search index address (meta name="help-index")')
else:
    st, body = fetch(urljoin(BASE + '/help/', home.index))
    if st != 200:
        problems.append(f'search index {home.index}: {st}')
    else:
        index = json.loads(body)
        listed = {p['u'].rstrip('/') for p in index['pages']}
        crawled = {p for p in pages if p.startswith('/help')}
        for u in sorted(listed - crawled):
            problems.append(f'search index lists {u}, which no page links to (or it failed to load)')
        sections = sum(len(p['s']) for p in index['pages'])
        print(f'search index: {len(index["pages"])} pages, {sections} sections, {len(body) // 1024} KB')

help_pages = sorted(p for p in pages if p.startswith('/help'))
print(f'crawled {len(help_pages)} help pages, checked {len(cache)} addresses, {len(external)} external links not fetched')
for p in problems:
    print('PROBLEM', p)
print('OK: nothing broken' if not problems else f'{len(problems)} problem(s)')
sys.exit(1 if problems else 0)
