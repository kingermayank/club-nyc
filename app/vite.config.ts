import { defineConfig, type Plugin } from 'vite'
import { mkdirSync, writeFileSync, rmSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve, basename, join } from 'node:path'
import { brotliCompressSync, gzipSync, constants as zlib } from 'node:zlib'
import { discordTarget, updatesFeed } from '../server/src/landing.ts'

/** Dev-only: lets the browser save renders (avatar sheets, etc.) into scratch/exports for the art pipeline. */
function exportEndpoint(): Plugin {
  return {
    name: 'club-nyc-export',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__export', (req, res) => {
        if (req.method !== 'POST') return res.end('POST only')
        const name = basename(new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'export.bin')
        const chunks: Buffer[] = []
        req.on('data', (c) => chunks.push(c))
        req.on('end', () => {
          const dir = resolve(import.meta.dirname, '..', 'scratch', 'exports')
          mkdirSync(dir, { recursive: true })
          const body = Buffer.concat(chunks)
          const isDataUrl = body.subarray(0, 5).toString() === 'data:'
          writeFileSync(resolve(dir, name), isDataUrl ? Buffer.from(body.toString().split(',')[1], 'base64') : body)
          res.end('ok')
        })
      })
    },
  }
}

/** public/art/raw and /preview are art-pipeline sources (tools/cutouts.py) — the game never loads them. */
function pruneSourceArt(): Plugin {
  return {
    name: 'club-nyc-prune-source-art',
    apply: 'build',
    closeBundle() {
      for (const d of ['art/raw', 'art/preview']) rmSync(resolve(import.meta.dirname, 'dist', d), { recursive: true, force: true })
    },
  }
}

/** Brotli + gzip copies of the text files (JS, CSS, HTML, SVG, JSON) and the fonts, which the server sends to browsers
 * that accept them (fonts shrink by more than half). */
function precompress(): Plugin {
  const TEXT = /\.(js|css|html|svg|json|txt|xml|webmanifest|otf|ttf)$/
  const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
  return {
    name: 'club-nyc-precompress',
    apply: 'build',
    closeBundle() {
      for (const f of walk(resolve(import.meta.dirname, 'dist'))) {
        if (!TEXT.test(f) || statSync(f).size < 1024) continue
        const body = readFileSync(f)
        writeFileSync(`${f}.br`, brotliCompressSync(body, { params: { [zlib.BROTLI_PARAM_QUALITY]: 11, [zlib.BROTLI_PARAM_SIZE_HINT]: body.length } }))
        writeFileSync(`${f}.gz`, gzipSync(body, { level: 9 }))
      }
    },
  }
}

/**
 * The site has two pages: the landing page at / (index.html) and the game at /play (play.html). Invite links
 * (/join/<name>) open the game directly. The production server routes the same way (server/src/index.ts).
 */
function gameRoutes(): Plugin {
  // the Discord invite, from server/.env (the production server reads the same setting)
  const discord = () => {
    if (process.env.DISCORD_INVITE_URL) return process.env.DISCORD_INVITE_URL
    try {
      return /^DISCORD_INVITE_URL=(.*)$/m.exec(readFileSync(resolve(import.meta.dirname, '../server/.env'), 'utf8'))?.[1]?.trim() ?? ''
    } catch {
      return ''
    }
  }
  type Req = { url?: string; headers: Record<string, string | string[] | undefined> }
  type Res = { statusCode: number; setHeader: (k: string, v: string) => void; end: (body?: string) => void }
  const toGame = (req: Req, res: Res, next: () => void) => {
    const [path, query] = (req.url ?? '').split('?')
    if (path === '/discord') {
      res.statusCode = 302
      res.setHeader('Location', discordTarget(discord()))
      return res.end()
    }
    if (path === '/updates.xml') {
      res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
      return res.end(updatesFeed(readFileSync(resolve(import.meta.dirname, 'index.html'), 'utf8'), `http://${req.headers.host}`))
    }
    if (path === '/play' || path === '/play/' || /^\/join\/[^/]+\/?$/.test(path)) req.url = '/play.html' + (query ? '?' + query : '')
    next()
  }
  return {
    name: 'club-nyc-game-routes',
    configureServer: (server) => void server.middlewares.use(toGame),
    configurePreviewServer: (server) => void server.middlewares.use(toGame),
  }
}

// the game server (cd server && npm run dev) — same origin for cookies, via the dev proxy
const GAME_SERVER = process.env.GAME_SERVER ?? 'http://localhost:8787'
const proxy = {
  '/api': { target: GAME_SERVER },
  '/ws': { target: GAME_SERVER.replace(/^http/, 'ws'), ws: true },
}

export default defineConfig({
  plugins: [gameRoutes(), exportEndpoint(), pruneSourceArt(), precompress()],
  server: { proxy },
  preview: { proxy },
  build: {
    rollupOptions: {
      input: { index: resolve(import.meta.dirname, 'index.html'), play: resolve(import.meta.dirname, 'play.html') },
    },
  },
})
