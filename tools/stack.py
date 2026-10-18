"""Private dev stacks for browser tests: a game server + Vite on free ports with a throwaway database.

    from stack import PrivateStack
    stack = PrivateStack()                 # runs app/ and server/ in place (tools/mp_test.py)
    stack = PrivateStack(frozen=True)      # runs a snapshot copy (tools/click_audit.py)
    base = stack.start()                   # e.g. http://localhost:61234 — always call stack.stop() (or use `with`)

frozen=True copies app/ and server/ to a temp folder first, the way server/scripts/loadtest-all.sh does
(no node_modules, data, dist or .env; node_modules are symlinked back), so edits made while a test runs
can't change the code under test. app/node_modules is linked entry by entry, so Vite's caches
(node_modules/.vite, .vite-temp) are written inside the copy and never into the real app/node_modules
that your own dev server is using.

Never touches your dev servers (5173/5174/8787) or server/data/club-nyc.db; every process runs in its own
process group and is killed on stop(), together with the temp folder.
"""
import os, shutil, signal, socket, subprocess, tempfile, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
# your dev servers (Vite 5173/5174, game 8787) and the ports other test scripts pin (launch_test 8896, loadtest 8899)
RESERVED_PORTS = {5173, 5174, 5175, 8787, 8896, 8899}
# never hand a throwaway server real credentials or off-site backup targets from the calling shell
_SCRUB = ('BACKUP_S3_', 'GOOGLE_CLIENT', 'X_CLIENT', 'DISCORD_CLIENT', 'ADMIN_TOKEN', 'MAINTENANCE', 'NODE_ENV')


def free_port():
    while True:
        s = socket.socket()
        s.bind(('127.0.0.1', 0))
        port = s.getsockname()[1]
        s.close()
        if port not in RESERVED_PORTS:
            return port


def wait_http(url, secs=60, proc=None):
    """True once `url` answers 200 (gives up early if `proc` exits)."""
    for _ in range(secs * 2):
        if proc is not None and proc.poll() is not None:
            return False
        try:
            with urllib.request.urlopen(url, timeout=2) as r:
                if r.status == 200:
                    return True
        except Exception:
            pass
        time.sleep(0.5)
    return False


def _link_entries(src, dst):
    """A real node_modules folder whose entries are symlinks into `src` (so caches land in the copy)."""
    os.makedirs(dst, exist_ok=True)
    for name in os.listdir(src):
        if name in ('.vite', '.vite-temp', '.cache'):
            continue
        os.symlink(os.path.join(src, name), os.path.join(dst, name))


class PrivateStack:
    """A dev game server + Vite on free ports with a throwaway database (never your dev servers or data)."""

    def __init__(self, frozen=False, env=None, prefix=None):
        self.frozen = frozen
        self.extra_env = dict(env or {})
        self.tmp = tempfile.mkdtemp(prefix=prefix or ('clubnyc-frozen-' if frozen else 'clubnyc-mp-'))
        self.game, self.web = free_port(), free_port()
        self.procs = []
        self.log = open(os.path.join(self.tmp, 'stack.log'), 'a')
        self.app_dir = os.path.join(ROOT, 'app')
        self.server_dir = os.path.join(ROOT, 'server')
        self.snapshot = None  # frozen: when the copy was taken and what it contained

    # ---------- the frozen copy ----------
    def _freeze(self):
        for d in ('server', 'app'):
            if not os.path.isdir(os.path.join(ROOT, d, 'node_modules')):
                raise SystemExit(f'missing {d}/node_modules — run: npm --prefix {d} install')
        copy = os.path.join(self.tmp, 'copy')
        os.makedirs(copy)
        rsync = ['rsync', '-a', '--exclude', 'node_modules', '--exclude', '.env']
        # like loadtest-all.sh: the server without its database folder, the app without its build. The art
        # pipeline's sources (public/art/raw, /preview) are never loaded by the game and are pruned from builds.
        subprocess.run(rsync + ['--exclude', '/server/data', os.path.join(ROOT, 'server'), copy + '/'], check=True)
        subprocess.run(rsync + ['--exclude', '/app/dist', '--exclude', '/app/public/art/raw', '--exclude', '/app/public/art/preview',
                                os.path.join(ROOT, 'app'), copy + '/'], check=True)
        os.symlink(os.path.join(ROOT, 'server', 'node_modules'), os.path.join(copy, 'server', 'node_modules'))
        _link_entries(os.path.join(ROOT, 'app', 'node_modules'), os.path.join(copy, 'app', 'node_modules'))
        self.app_dir = os.path.join(copy, 'app')
        self.server_dir = os.path.join(copy, 'server')
        newest, files = 0.0, 0
        for base in (os.path.join(self.app_dir, 'src'), os.path.join(self.server_dir, 'src')):
            for dp, _, fs in os.walk(base):
                for f in fs:
                    files += 1
                    newest = max(newest, os.path.getmtime(os.path.join(dp, f)))
        self.snapshot = {'taken': time.strftime('%Y-%m-%d %H:%M:%S'), 'files': files, 'newest_source_change': time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(newest))}

    def start(self):
        if self.frozen:
            self._freeze()
        base = f'http://localhost:{self.web}'
        clean = {k: v for k, v in os.environ.items() if not k.startswith(_SCRUB)}
        env = {**clean, 'PORT': str(self.game), 'DB_PATH': os.path.join(self.tmp, 'test.db'), 'PUBLIC_URL': base, 'BACKUP_EVERY_HOURS': '0', **self.extra_env}
        self.procs.append(subprocess.Popen(['npx', 'tsx', 'src/index.ts'], cwd=self.server_dir, env=env, stdout=self.log, stderr=subprocess.STDOUT, preexec_fn=os.setsid))
        if not wait_http(f'http://localhost:{self.game}/api/health', proc=self.procs[-1]):
            raise SystemExit('private game server did not start — see ' + self.log.name)
        venv = {**clean, 'GAME_SERVER': f'http://localhost:{self.game}'}
        self.procs.append(subprocess.Popen(['npx', 'vite', '--port', str(self.web), '--strictPort'], cwd=self.app_dir, env=venv, stdout=self.log, stderr=subprocess.STDOUT, preexec_fn=os.setsid))
        if not wait_http(base, proc=self.procs[-1]):
            raise SystemExit('private Vite server did not start — see ' + self.log.name)
        return base

    def stop(self, keep_log_to=None):
        for pr in self.procs:
            try:
                os.killpg(pr.pid, signal.SIGTERM)
                pr.wait(timeout=10)
            except Exception:
                try:
                    os.killpg(pr.pid, signal.SIGKILL)
                except Exception:
                    pass
        self.procs = []
        try:
            self.log.close()
            if keep_log_to:
                shutil.copy(self.log.name, keep_log_to)
        except Exception:
            pass
        shutil.rmtree(self.tmp, ignore_errors=True)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.stop()
