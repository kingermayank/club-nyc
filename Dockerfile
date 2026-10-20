# Club NYC: one container serves the game (app/dist), the API (/api) and the realtime socket (/ws).
# Railway finds this file and builds it. Locally:
#   docker build -t club-nyc .
#   docker run -p 8787:8787 -v club-nyc-data:/data -e DB_PATH=/data/club-nyc.db club-nyc
# The database is NOT in the image: it lives on a volume mounted at /data (see docs/deploy-railway.md).

# ---------- 1. build the game client (Vite) ----------
FROM node:24-slim AS client
WORKDIR /src/app
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app/ ./
# vite.config.ts shares the landing-page helpers (/discord) with the server
COPY server/src/landing.ts /src/server/src/landing.ts
RUN npm run build

# ---------- 2. server dependencies ----------
# tsx is a devDependency but it is the runtime here: the server imports TypeScript from app/src that uses
# extensionless imports, which Node's own type stripping can't resolve. So install everything, then drop
# what only type-checking needs (the TypeScript compiler's ~30 MB native binary and @types).
FROM node:24-slim AS server-deps
WORKDIR /src/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --no-audit --no-fund \
 && rm -rf node_modules/typescript node_modules/@typescript node_modules/@types node_modules/.bin/tsc node_modules/.bin/tsserver

# ---------- 3. runtime ----------
FROM node:24-slim
ENV NODE_ENV=production
# Same layout as the repo, because config.ts finds the client at ../../app/dist and the room geometry at
# ../../app/src/data/geo, and the server imports app/src/{net,avatar,geometry} at runtime.
WORKDIR /app/server
COPY --from=server-deps /src/server/node_modules ./node_modules
COPY server/package.json server/tsconfig.json ./
COPY server/src ./src
# app/package.json says "type": "module", so tsx loads app/src/*.ts as ES modules
COPY app/package.json /app/app/package.json
COPY app/src /app/app/src
COPY --from=client /src/app/dist /app/app/dist
# Runs as root on purpose: Railway mounts volumes as root (a non-root user would need RAILWAY_RUN_UID=0).
# Railway sets PORT; 8787 is the local default.
EXPOSE 8787
# Node itself is PID 1 (not npm/npx, which swallow SIGTERM), so a deploy's SIGTERM reaches the graceful
# shutdown in src/ops.ts. `--import tsx` is the same loader `tsx src/index.ts` uses, minus the extra process.
CMD ["node", "--import", "tsx", "src/index.ts"]
