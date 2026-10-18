#!/usr/bin/env bash
# A private QA copy of the game for previews and manual checks: its own game server with a fresh throwaway
# database, and its own Vite. Never touches your dev servers (5173/5174/8787) or server/data/club-nyc.db.
#   bash tools/qa_stack.sh            → http://localhost:5197
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GAME_PORT="${GAME_PORT:-8797}"
WEB_PORT="${WEB_PORT:-5197}"
DB="${TMPDIR:-/tmp}/club-nyc-qa.db"
rm -f "$DB" "$DB-wal" "$DB-shm"
trap 'kill 0' EXIT
(cd "$ROOT/server" && PORT="$GAME_PORT" DB_PATH="$DB" PUBLIC_URL="http://localhost:$WEB_PORT" BACKUP_EVERY_HOURS=0 npx tsx src/index.ts) &
cd "$ROOT/app" && GAME_SERVER="http://localhost:$GAME_PORT" npx vite --port "$WEB_PORT" --strictPort
