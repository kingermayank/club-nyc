#!/usr/bin/env bash
# Run the whole launch load-test suite against a FROZEN COPY of the code, so edits (and the dev server's
# restarts) can't change the code under test mid-run. Never touches port 8787 or server/data/club-nyc.db.
#
#   bash server/scripts/loadtest-all.sh                 # everything (~40 min)
#   bash server/scripts/loadtest-all.sh --quick         # smoke run of the harness (~8 min)
#   bash server/scripts/loadtest-all.sh steady storm    # only some scenarios (see loadtest-scenarios.ts)
#   PORT=8899 OUT=/tmp/lt bash server/scripts/loadtest-all.sh
#
# 1. copies server/ and app/ (no node_modules, data, dist or .env) to a temp folder and symlinks node_modules
# 2. builds the client there (so the browser scenario gets a production build from the same server)
# 3. runs scripts/loadtest-scenarios.ts from the copy on $PORT with a throwaway database
# 4. leaves results.json / summary.md / server.log / probe.jsonl in $OUT and deletes the copy
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PORT="${PORT:-8899}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="${OUT:-${TMPDIR:-/tmp}/club-nyc-loadtest-$STAMP}"
COPY="$(mktemp -d "${TMPDIR:-/tmp}/club-nyc-frozen-XXXXXX")"

if [[ "$PORT" == "8787" ]]; then echo "refusing to use 8787 (the dev server port)"; exit 1; fi
for d in server app; do
  [[ -d "$ROOT/$d/node_modules" ]] || { echo "missing $d/node_modules — run: npm --prefix $d install"; exit 1; }
done
if lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then echo "port $PORT is busy — set PORT=…"; exit 1; fi

cleanup() {
  # stop anything the suite left listening on our port, then drop the frozen copy
  local pids
  pids="$(lsof -nP -t -iTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  [[ -n "$pids" ]] && kill $pids 2>/dev/null || true
  rm -rf "$COPY"
}
trap cleanup EXIT

echo "frozen copy: $COPY"
mkdir -p "$COPY/tools" "$OUT"
rsync -a --exclude node_modules --exclude data --exclude .env "$ROOT/server" "$COPY/"
rsync -a --exclude node_modules --exclude dist --exclude .env "$ROOT/app" "$COPY/"
cp "$ROOT/tools/mp_perf.py" "$COPY/tools/"
ln -s "$ROOT/server/node_modules" "$COPY/server/node_modules"
ln -s "$ROOT/app/node_modules" "$COPY/app/node_modules"

echo "building the client…"
# --configLoader runner: don't write Vite's temp config into the (shared, symlinked) node_modules
npm --prefix "$COPY/app" run build -- --configLoader runner >"$OUT/build.log" 2>&1 || { echo "client build failed, see $OUT/build.log"; exit 1; }

PY="$ROOT/.venv/bin/python"
ulimit -n 65536 2>/dev/null || ulimit -n 10240 2>/dev/null || true
cd "$COPY/server"
status=0
node --import tsx scripts/loadtest-scenarios.ts "$@" --port "$PORT" --out "$OUT" --db "$COPY/load.db" --python "$PY" --tools "$COPY/tools" || status=$?
[[ -d "$COPY/tools/out" ]] && cp -R "$COPY/tools/out" "$OUT/screenshots"
echo "results: $OUT/summary.md"
exit $status
