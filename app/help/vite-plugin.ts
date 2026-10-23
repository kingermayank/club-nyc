/**
 * The Help Center at /help: static pages written in Markdown (app/help/content), one per address.
 *
 *  - Development: /help, /help/<page> and /help/search-index.json are rendered on each request from the Markdown,
 *    so an edited page shows up on refresh (open help pages reload by themselves when content changes).
 *  - Build: app/help/index.html is one of the site's entries (vite.config.ts), so Vite bundles its script and styles;
 *    this plugin then writes every page as dist/help/<page>/index.html around that same frame, plus
 *    dist/help/search-index.json and dist/help/404.html. The production server serves them as plain files.
 *
 * The page builder (lib/site.ts) is loaded when it's needed rather than imported here, so editing it or the content
 * never restarts anyone's dev server: only a change to this file or vite.config.ts does.
 */
import type { Plugin, ViteDevServer } from 'vite'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

type SiteModule = typeof import('./lib/site.ts')

export function helpCenter(): Plugin {
  let root = ''
  let publicDir = ''
  const contentDir = () => resolve(root, 'help/content')
  return {
    name: 'club-nyc-help-center',
    enforce: 'post',
    configResolved(config) {
      root = config.root
      publicDir = config.publicDir || resolve(root, 'public')
    },
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const path = (req.url ?? '').split('?')[0]
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        if (!/^\/help(\/|$)/.test(path)) return next()
        const isIndex = path === '/help/search-index.json'
        // files (the script, the styles, pictures in public/help) are Vite's to serve
        if (!isIndex && /\.[a-z0-9]+$/i.test(path) && !path.endsWith('/index.html')) return next()
        try {
          const lib = (await server.ssrLoadModule('/help/lib/site.ts')) as SiteModule
          const site = lib.buildSite(contentDir(), publicDir)
          for (const p of site.problems) server.config.logger.warn(`[help] ${p}`, { timestamp: true })
          if (isIndex) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.setHeader('Cache-Control', 'no-cache')
            return res.end(JSON.stringify(site.index))
          }
          const page = site.byUrl.get(lib.normalizeUrl(path))
          const frame = readFileSync(resolve(root, 'help/index.html'), 'utf8')
          const html = await server.transformIndexHtml('/help/index.html', page ? lib.renderPage(frame, site, page) : lib.renderPage(frame, site, lib.missingPage(), { missing: true }))
          res.statusCode = page ? 200 : 404
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          res.setHeader('Cache-Control', 'no-cache')
          res.end(html)
        } catch (e) {
          server.config.logger.error(`[help] ${(e as Error).stack ?? e}`)
          res.statusCode = 500
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end(`The Help Center couldn't build this page:\n\n${(e as Error).message}`)
        }
      })
      // an edited help page (or a new screenshot) reloads the help pages that are open, and only those: a custom event
      // that help/main.ts listens for (a plain full-reload would also reload everyone's game tabs)
      server.watcher.on('all', (_event, file) => {
        if (file.startsWith(contentDir()) || file.startsWith(resolve(root, 'help/lib')) || file.startsWith(resolve(publicDir, 'help'))) server.ws.send({ type: 'custom', event: 'help:reload' })
      })
    },
    generateBundle: {
      order: 'post',
      async handler(_options, bundle) {
        const frame = bundle['help/index.html']
        // a build without the help entry (tools, tests) has nothing to do here
        if (!frame || frame.type !== 'asset') return
        const lib = (await import(pathToFileURL(resolve(root, 'help/lib/site.ts')).href)) as SiteModule
        const site = lib.buildSite(contentDir(), publicDir)
        // a broken help link shouldn't block a deploy: say so loudly instead (tools/help_check.py fails on them)
        for (const p of site.problems) this.warn(`[help] ${p}`)
        const template = String(frame.source)
        for (const page of site.pages) {
          const html = lib.renderPage(template, site, page)
          if (page.url === lib.BASE) frame.source = html
          else this.emitFile({ type: 'asset', fileName: `${page.url.slice(1)}/index.html`, source: html })
        }
        this.emitFile({ type: 'asset', fileName: 'help/404.html', source: lib.renderPage(template, site, lib.missingPage(), { missing: true }) })
        this.emitFile({ type: 'asset', fileName: 'help/search-index.json', source: JSON.stringify(site.index) })
      },
    },
  }
}

export default helpCenter
