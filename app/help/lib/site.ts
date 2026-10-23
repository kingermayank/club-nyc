/**
 * The Help Center as a set of static pages, built from app/help/content:
 *
 *   sidebar.md     the sidebar (like GitBook's SUMMARY.md): "## Group" headings and nested "* [Title](file.md)" lists
 *   *.md           one file per page (front matter: title, description, icon, updated, layout)
 *
 * README.md is a folder's own page: content/places/README.md is /help/places, content/README.md is /help.
 * Links between pages are written to the .md file, from the content folder ("jobs/halal-rush.md#pay"), and are
 * checked when the site builds: a missing page or a missing #section is reported (and fails the production build).
 *
 * Used by the Vite plugin (app/help/vite-plugin.ts) to serve pages in development and write them into dist/help.
 */
import { readFileSync, existsSync, openSync, readSync, closeSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { renderMarkdown, frontMatter, escapeHtml, type Heading, type Section } from './markdown.ts'

export const BASE = '/help'
const SITE_NAME = 'Club NYC Help Center'

export interface NavItem {
  title: string
  url: string
  file: string
  icon: string
  children: NavItem[]
}
export interface NavGroup {
  title: string
  items: NavItem[]
}
export interface PageLink {
  title: string
  url: string
}
export interface Page {
  url: string
  file: string
  title: string
  /** the shorter name the sidebar uses */
  navTitle: string
  description: string
  icon: string
  /** the sidebar group it sits in (shown above the title) */
  group: string
  parent: PageLink | null
  layout: string
  updated: string
  html: string
  headings: Heading[]
  sections: Section[]
  prev: PageLink | null
  next: PageLink | null
}
/** What the search box downloads: per page, its sections as [id, heading, text]. */
export interface SearchIndex {
  v: 1
  pages: { u: string; t: string; g: string; d: string; i: string; s: [string, string, string][] }[]
}
export interface Site {
  groups: NavGroup[]
  pages: Page[]
  byUrl: Map<string, Page>
  index: SearchIndex
  /** changes whenever any page does (cache-busts the search index) */
  version: string
  /** broken links and other content mistakes */
  problems: string[]
}

/** "places/times-square.md" → "/help/places/times-square", "places/README.md" → "/help/places" */
export const urlOf = (file: string) => {
  const p = file.replace(/\.md$/, '').replace(/(^|\/)README$/, '')
  return p ? `${BASE}/${p.replace(/\/$/, '')}` : BASE
}

/** /help/places/ and /help/places/index.html are /help/places */
export const normalizeUrl = (path: string) => {
  let p = decodeURI(path.split(/[?#]/)[0]).replace(/\/index\.html$/, '').replace(/\/+$/, '')
  if (p === '') p = '/'
  return p
}

/** width × height of a PNG, JPEG or WebP, read from its header (so figures don't jump when they load) */
export function imageSize(file: string): [number, number] | null {
  if (!existsSync(file)) return null
  const fd = openSync(file, 'r')
  try {
    const b = Buffer.alloc(64 * 1024)
    const n = readSync(fd, b, 0, b.length, 0)
    if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)]
    if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
      const kind = b.toString('ascii', 12, 16)
      if (kind === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)]
      if (kind === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff]
      if (kind === 'VP8L') {
        const bits = b.readUInt32LE(21)
        return [1 + (bits & 0x3fff), 1 + ((bits >> 14) & 0x3fff)]
      }
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      let o = 2
      while (o + 9 < n) {
        if (b[o] !== 0xff) return null
        const marker = b[o + 1]
        const len = b.readUInt16BE(o + 2)
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return [b.readUInt16BE(o + 7), b.readUInt16BE(o + 5)]
        o += 2 + len
      }
    }
    return null
  } finally {
    closeSync(fd)
  }
}

function parseSummary(src: string): NavGroup[] {
  const groups: NavGroup[] = [{ title: '', items: [] }]
  const stack: { indent: number; item: NavItem }[] = []
  for (const line of src.replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
    const g = /^##\s+(.+?)\s*$/.exec(line)
    if (g) {
      groups.push({ title: g[1], items: [] })
      stack.length = 0
      continue
    }
    const m = /^(\s*)[*-]\s+\[([^\]]+)\]\(([^)]+)\)/.exec(line)
    if (!m) continue
    const indent = m[1].length
    const item: NavItem = { title: m[2], url: urlOf(m[3]), file: m[3], icon: '', children: [] }
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop()
    if (stack.length) stack[stack.length - 1].item.children.push(item)
    else groups[groups.length - 1].items.push(item)
    stack.push({ indent, item })
  }
  return groups.filter((x) => x.items.length)
}

const flatten = (items: NavItem[], parent: NavItem | null, group: string, out: { item: NavItem; parent: NavItem | null; group: string }[] = []) => {
  for (const item of items) {
    out.push({ item, parent, group })
    flatten(item.children, item, group, out)
  }
  return out
}

/** a short, stable hash (FNV-1a) */
const hash = (s: string) => {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193)
  return (h >>> 0).toString(36)
}

/**
 * Read and render every page. `publicDir` is app/public (figure sizes come from the pictures themselves).
 */
export function buildSite(contentDir: string, publicDir: string): Site {
  const problems: string[] = []
  const groups = parseSummary(readFileSync(join(contentDir, 'sidebar.md'), 'utf8'))
  const flat = groups.flatMap((g) => flatten(g.items, null, g.title))
  const files = new Set(flat.map((f) => f.item.file))

  // first pass: front matter and headings, so links to #sections on other pages can be checked
  const raw = new Map<string, { fm: Record<string, string>; body: string }>()
  for (const { item } of flat) {
    const path = join(contentDir, item.file)
    if (!existsSync(path)) {
      problems.push(`sidebar.md lists ${item.file}, which doesn't exist`)
      raw.set(item.file, { fm: {}, body: `This page is missing.` })
      continue
    }
    const [fm, body] = frontMatter(readFileSync(path, 'utf8'))
    raw.set(item.file, { fm, body })
    item.icon = fm.icon ?? ''
  }

  const pages: Page[] = []
  const pendingAnchors: { from: string; file: string; id: string }[] = []
  for (const { item, parent, group } of flat) {
    const { fm, body } = raw.get(item.file)!
    if (/\u2014/.test(body) || /\u2014/.test(fm.title ?? '') || /\u2014/.test(fm.description ?? '')) problems.push(`${item.file}: has an em dash (use a comma, colon or period)`)
    const link = (href: string): string | null => {
      if (/^(https?:|mailto:|\/|#)/.test(href)) return null
      const [file, anchor] = href.split('#')
      if (!file.endsWith('.md')) return null
      if (!files.has(file)) problems.push(`${item.file}: links to ${file}, which isn't in sidebar.md`)
      if (anchor) pendingAnchors.push({ from: item.file, file, id: anchor })
      return urlOf(file) + (anchor ? `#${anchor}` : '')
    }
    const size = (src: string) => (src.startsWith('/') ? imageSize(resolve(publicDir, '.' + decodeURI(src))) : null)
    const r = renderMarkdown(body, { link, imageSize: size })
    // pictures that aren't there yet
    for (const m of r.html.matchAll(/<img[^>]+src="(\/(?:help|art)\/[^"]+)"/g)) if (!existsSync(resolve(publicDir, '.' + decodeURI(m[1])))) problems.push(`${item.file}: picture ${m[1]} is missing`)
    pages.push({
      url: item.url,
      file: item.file,
      title: fm.title ?? item.title,
      navTitle: item.title,
      description: fm.description ?? '',
      icon: fm.icon ?? '',
      group: group || '',
      parent: parent ? { title: parent.title, url: parent.url } : null,
      layout: fm.layout ?? 'page',
      updated: fm.updated ?? '',
      html: r.html,
      headings: r.headings,
      sections: r.sections,
      prev: null,
      next: null,
    })
  }
  const byUrl = new Map(pages.map((p) => [p.url, p]))
  const byFile = new Map(pages.map((p) => [p.file, p]))
  for (const a of pendingAnchors) {
    const target = byFile.get(a.file)
    if (target && !target.sections.some((s) => s.id === a.id) && !target.headings.some((h) => h.id === a.id) && !target.html.includes(` id="${a.id}"`))
      problems.push(`${a.from}: links to ${a.file}#${a.id}, but that page has no "${a.id}" section`)
  }
  pages.forEach((p, i) => {
    p.prev = i > 0 ? { title: pages[i - 1].navTitle, url: pages[i - 1].url } : null
    p.next = i < pages.length - 1 ? { title: pages[i + 1].navTitle, url: pages[i + 1].url } : null
  })

  const index: SearchIndex = {
    v: 1,
    pages: pages.map((p) => ({
      u: p.url,
      t: p.title,
      g: p.parent ? `${p.group ? p.group + ' › ' : ''}${p.parent.title === p.group ? '' : p.parent.title}`.replace(/ › $/, '') : p.group,
      d: p.description,
      i: p.icon,
      s: p.sections.map((s) => [s.id, s.heading, s.text] as [string, string, string]),
    })),
  }
  return { groups, pages, byUrl, index, version: hash(JSON.stringify(index)), problems }
}

// ---------------------------------------------------------------- page markup

const icon = (name: string, cls: string, size: number) =>
  name ? `<img class="${cls}" src="/art/icons/e/${name}.png" alt="" width="${size}" height="${size}" decoding="async">` : ''

const chevron = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`

function navTree(items: NavItem[], current: string, depth = 0): string {
  return items
    .map((it) => {
      const here = it.url === current
      const open = here || contains(it, current)
      const kids = it.children.length
        ? `<button class="nav-toggle" type="button" aria-expanded="${open}" aria-label="Show the pages in ${escapeHtml(it.title)}">${chevron}</button><ul class="nav-kids"${open ? '' : ' hidden'}>${navTree(it.children, current, depth + 1)}</ul>`
        : ''
      return `<li class="nav-item${it.children.length ? ' has-kids' : ''}${open ? ' open' : ''}"><a class="nav-link${here ? ' here' : ''}" href="${it.url}"${here ? ' aria-current="page"' : ''}>${icon(it.icon, 'nav-icon', 22)}<span>${escapeHtml(it.title)}</span></a>${kids}</li>`
    })
    .join('')
}
const contains = (it: NavItem, url: string): boolean => it.children.some((c) => c.url === url || contains(c, url))

function sidebar(site: Site, current: string): string {
  return site.groups
    .map((g) => `<div class="nav-group">${g.title ? `<p class="nav-group-title">${escapeHtml(g.title)}</p>` : ''}<ul class="nav-list">${navTree(g.items, current)}</ul></div>`)
    .join('')
}

function toc(headings: Heading[], cls: string): string {
  if (headings.length < 2) return ''
  const items = headings.map((h) => `<li class="toc-l${h.level}"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`).join('')
  if (cls === 'inline') return `<details class="toc-inline"><summary>On This Page</summary><ol>${items}</ol></details>`
  return `<nav class="toc" aria-labelledby="toc-title"><p class="toc-title" id="toc-title">On This Page</p><ol>${items}</ol></nav>`
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const prettyDate = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}, ${m[1]}` : iso
}

const SEARCH_ICON = `<svg class="i-search" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="3"/><path d="M15.5 15.5l5 5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`
const BURGER = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>`

export interface RenderPageOptions {
  /** a page that doesn't exist (404) */
  missing?: boolean
}

/** One page of the Help Center: the template (app/help/index.html, or Vite's built copy of it) filled in. */
export function renderPage(template: string, site: Site, page: Page, o: RenderPageOptions = {}): string {
  const home = page.url === BASE
  const title = home ? SITE_NAME : `${page.title} | ${SITE_NAME}`
  // above the title: the page it belongs to (or its sidebar group, unless that's this page's own name)
  const crumb = page.parent
    ? `<a href="${page.parent.url}">${escapeHtml(page.parent.title)}</a>`
    : page.group && page.group !== page.title && page.group !== page.navTitle
      ? `<span>${escapeHtml(page.group)}</span>`
      : ''
  const pager =
    page.prev || page.next
      ? `<nav class="pager" aria-label="Previous and next pages">${page.prev ? `<a class="pager-prev" href="${page.prev.url}" rel="prev"><small>Previous</small><span>${escapeHtml(page.prev.title)}</span></a>` : '<span></span>'}${page.next ? `<a class="pager-next" href="${page.next.url}" rel="next"><small>Next</small><span>${escapeHtml(page.next.title)}</span></a>` : ''}</nav>`
      : ''
  const hero = home
    ? `<section class="hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <p class="hero-kicker">${icon('map', 'ji', 22)}Club NYC Help Center</p>
          <h1 id="hero-title">${escapeHtml(page.title)}</h1>
          <p class="hero-lead">${escapeHtml(page.description)}</p>
          <button class="hero-search" type="button" data-search-open>${SEARCH_ICON}<span>Search for coins, jobs, the subway…</span><span class="kbd-hint" aria-hidden="true"><kbd class="k-mod">Ctrl</kbd><kbd>K</kbd></span></button>
          <p class="hero-chips">Popular: <a href="/help/coins-and-shopping">Coins</a> <a href="/help/jobs">Jobs</a> <a href="/help/apartment">Your Apartment</a> <a href="/help/events/dance-jam">Dance Jam</a> <a href="/help/faq">FAQ</a></p>
        </div>
        <img class="hero-art" src="/help/img/hero.webp" alt="" width="1040" height="585" fetchpriority="high">
      </section>`
    : ''
  const head = home
    ? ''
    : `<header class="page-head">
        ${crumb ? `<p class="crumb">${crumb}</p>` : ''}
        <div class="page-title">${icon(page.icon, 'title-icon', 44)}<h1>${escapeHtml(page.title)}</h1></div>
        ${page.description ? `<p class="lead">${escapeHtml(page.description)}</p>` : ''}
        ${toc(page.headings, 'inline')}
      </header>`
  const updated = page.updated ? `<p class="updated">Last updated <time datetime="${page.updated}">${prettyDate(page.updated)}</time></p>` : ''
  const body = `
<a class="skip-link" href="#content">Skip to Content</a>
<header class="topbar">
  <div class="topbar-in">
    <button class="burger" type="button" aria-label="Open the Menu" aria-expanded="false" aria-controls="sidebar">${BURGER}</button>
    <a class="brand" href="${BASE}" aria-label="Club NYC Help Center home"><span class="brand-logo"><img src="/art/ui/logo.png" alt="" width="900" height="507"></span><span class="brand-tag">Help Center</span></a>
    <button class="search-btn" type="button" data-search-open aria-label="Search the Help Center">${SEARCH_ICON}<span class="search-ph">Search the Help Center</span><span class="kbd-hint" aria-hidden="true"><kbd class="k-mod">Ctrl</kbd><kbd>K</kbd></span></button>
    <nav class="top-links" aria-label="Club NYC">
      <a class="top-link" href="/">Home</a>
      <a class="top-link" href="/discord" rel="noopener">Discord</a>
      <a class="play-btn" href="/play">Play Now</a>
    </nav>
  </div>
</header>
<div class="shell${home ? ' is-home' : ''}">
  <aside class="sidebar" id="sidebar" aria-label="Help Center pages">
    <div class="sidebar-head"><span>Help Center</span><button class="sidebar-close" type="button" aria-label="Close the Menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></button></div>
    <nav class="sidebar-nav" aria-label="Help Center">${sidebar(site, o.missing ? '' : page.url)}</nav>
    <a class="sidebar-play" href="/play">${icon('taxi', 'ji', 22)}<span>Back to the City</span></a>
  </aside>
  <div class="sidebar-scrim" hidden></div>
  <main class="main" id="content" tabindex="-1">
    <article class="article${home ? ' home' : ''}" data-layout="${page.layout}">
      ${hero}
      ${head}
      <div class="prose">${page.html}</div>
      ${pager}
      <footer class="page-foot">
        ${updated}
        <p class="still-stuck">${icon('idea', 'ji', 20)}Still stuck? Read <a href="/help/troubleshooting">Troubleshooting</a>, ask in the <a href="/discord" rel="noopener">Discord</a>, or see <a href="/help/feedback">how to report a bug</a>.</p>
      </footer>
    </article>
    ${home ? '' : toc(page.headings, 'side')}
  </main>
</div>
<footer class="site-foot">
  <div class="site-foot-in">
    <nav aria-label="Footer">
      <a href="/">Club NYC Home</a>
      <a href="/play">Play Now</a>
      <a href="/rules.html">Community Rules</a>
      <a href="/privacy.html">Privacy Policy</a>
      <a href="/terms.html">Terms of Service</a>
      <a href="/discord" rel="noopener">Discord</a>
    </nav>
    <p>Club NYC is an independent game, not affiliated with or endorsed by the City of New York, the MTA or any brand parodied in it.</p>
  </div>
</footer>`
  // (replacer functions: a "$&" or "$'" in the text must stay text)
  const desc = escapeHtml(page.description || 'How to play Club NYC: getting started, places, jobs, coins, your apartment, friends, safety and your account.')
  return template
    .replace(/\{\{title\}\}/g, () => escapeHtml(title))
    .replace(/\{\{description\}\}/g, () => desc)
    .replace('{{index}}', () => `${BASE}/search-index.json?v=${site.version}`)
    .replace('{{body}}', () => body)
}

/** The page for an address that doesn't exist. */
export function missingPage(): Page {
  return {
    url: `${BASE}/404`,
    file: '',
    title: 'Page Not Found',
    navTitle: 'Page Not Found',
    description: 'We looked everywhere, even under the subway platform. That page isn’t here.',
    icon: 'map',
    group: '',
    parent: null,
    layout: 'page',
    updated: '',
    html: `<p>The link may be old, or the page moved. Try searching, or start from one of these:</p>
<div class="cards"><a class="card" href="${BASE}"><img class="card-icon" src="/art/icons/e/liberty.png" alt="" width="40" height="40"><span class="card-body"><span class="card-title">Help Center Home</span><span class="card-text">Every topic, one click away.</span></span></a><a class="card" href="${BASE}/getting-started"><img class="card-icon" src="/art/icons/e/sparkles.png" alt="" width="40" height="40"><span class="card-body"><span class="card-title">Getting Started</span><span class="card-text">Your first day in the city.</span></span></a><a class="card" href="${BASE}/faq"><img class="card-icon" src="/art/icons/e/idea.png" alt="" width="40" height="40"><span class="card-body"><span class="card-title">FAQ</span><span class="card-text">Quick answers to common questions.</span></span></a></div>
<p><button class="btn-search-inline" type="button" data-search-open>Search the Help Center</button></p>`,
    headings: [],
    sections: [],
    prev: null,
    next: null,
  }
}
