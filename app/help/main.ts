/**
 * The Help Center's page behaviour: search (/, Ctrl K or ⌘ K), the phone menu, the sidebar's folding groups,
 * "On This Page" following your scroll, copyable links on headings, answers that open when linked to, and
 * screenshots that open bigger. The pages work without any of it (they're plain HTML).
 */
import { Searcher, type IndexData, type Results } from './search'

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)]
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const store = {
  get(key: string): string[] {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '[]')
    } catch {
      return []
    }
  },
  set(key: string, v: string[]) {
    try {
      localStorage.setItem(key, JSON.stringify(v))
    } catch {
      /* private window: fine */
    }
  },
}

// ---------------------------------------------------------------- keyboard hint: ⌘ K on a Mac, Ctrl K elsewhere
if (isMac) for (const k of $$('.k-mod')) k.textContent = '⌘'

// ---------------------------------------------------------------- the phone menu (sidebar drawer)
const burger = $<HTMLButtonElement>('.burger')
const scrim = $('.sidebar-scrim')
const setMenu = (open: boolean) => {
  document.body.classList.toggle('menu-open', open)
  burger?.setAttribute('aria-expanded', String(open))
  if (scrim) scrim.hidden = !open
  if (open) $<HTMLElement>('.sidebar .here, .sidebar a')?.focus({ preventScroll: true })
  else if (document.activeElement?.closest('.sidebar')) burger?.focus()
}
burger?.addEventListener('click', () => setMenu(!document.body.classList.contains('menu-open')))
scrim?.addEventListener('click', () => setMenu(false))
$('.sidebar-close')?.addEventListener('click', () => setMenu(false))

// the current page in view in the sidebar
$('.sidebar .here')?.scrollIntoView({ block: 'center' })

// ---------------------------------------------------------------- folding groups in the sidebar
for (const t of $$<HTMLButtonElement>('.nav-toggle')) {
  t.addEventListener('click', () => {
    const open = t.getAttribute('aria-expanded') !== 'true'
    t.setAttribute('aria-expanded', String(open))
    t.closest('.nav-item')?.classList.toggle('open', open)
    const kids = t.nextElementSibling as HTMLElement | null
    if (kids) kids.hidden = !open
  })
}

// ---------------------------------------------------------------- "On This Page" follows the reading position
const tocLinks = $$<HTMLAnchorElement>('.toc a')
if (tocLinks.length && 'IntersectionObserver' in window) {
  const heads = tocLinks.map((a) => document.getElementById(decodeURIComponent(a.hash.slice(1)))).filter((h): h is HTMLElement => !!h)
  const pick = () => {
    // the last heading above the upper third of the screen
    let cur = heads[0]
    for (const h of heads) if (h.getBoundingClientRect().top < innerHeight * 0.3) cur = h
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = heads[heads.length - 1]
    for (const a of tocLinks) a.classList.toggle('on', a.hash === `#${cur?.id}`)
  }
  let raf = 0
  addEventListener('scroll', () => {
    cancelAnimationFrame(raf)
    raf = requestAnimationFrame(pick)
  }, { passive: true })
  pick()
}

// ---------------------------------------------------------------- headings: click the link mark to copy a link to that spot
const toast = (() => {
  let el: HTMLDivElement | null = null
  let timer = 0
  return (text: string) => {
    el ??= document.body.appendChild(Object.assign(document.createElement('div'), { className: 'toast', role: 'status' }))
    el.textContent = text
    el.classList.add('show')
    clearTimeout(timer)
    timer = window.setTimeout(() => el?.classList.remove('show'), 1800)
  }
})()
for (const a of $$<HTMLAnchorElement>('.prose .anchor')) {
  a.addEventListener('click', (e) => {
    e.preventDefault()
    history.replaceState(null, '', a.hash)
    flash(a.hash.slice(1))
    const url = location.href
    navigator.clipboard?.writeText(url).then(() => toast('Link copied.'), () => undefined)
  })
}

// ---------------------------------------------------------------- deep links: open the answer, flash the heading
function flash(id: string) {
  const t = id ? document.getElementById(decodeURIComponent(id)) : null
  if (!t) return
  const det = t.closest('details') ?? (t.tagName === 'DETAILS' ? (t as HTMLDetailsElement) : null)
  if (det && !det.open) det.open = true
  t.classList.remove('flash')
  void t.offsetWidth
  t.classList.add('flash')
}
const arrive = () => {
  if (!location.hash) return
  flash(location.hash.slice(1))
  const t = document.getElementById(decodeURIComponent(location.hash.slice(1)))
  // an answer that was closed has just opened: bring it into view
  if (t?.tagName === 'DETAILS') t.scrollIntoView({ block: 'start' })
}
addEventListener('hashchange', arrive)
arrive()
// an answer opened by hand gets its own address, so it can be shared
for (const d of $$<HTMLDetailsElement>('details.qa')) {
  d.addEventListener('toggle', () => {
    if (d.open && d.id && location.hash !== `#${d.id}`) history.replaceState(null, '', `#${d.id}`)
  })
}

// ---------------------------------------------------------------- screenshots open bigger
const zoom = document.createElement('dialog')
zoom.className = 'zoom'
zoom.setAttribute('aria-label', 'Screenshot')
zoom.innerHTML = `<button class="zoom-x" type="button" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></button><img alt=""><p></p>`
document.body.append(zoom)
zoom.addEventListener('click', () => zoom.close())
for (const img of $$<HTMLImageElement>('.prose figure.shot img')) {
  img.tabIndex = 0
  img.setAttribute('role', 'button')
  img.setAttribute('aria-label', `${img.alt || 'Screenshot'}: open bigger`)
  const open = () => {
    const z = $<HTMLImageElement>('img', zoom)!
    z.src = img.currentSrc || img.src
    z.alt = img.alt
    $('p', zoom)!.textContent = img.closest('figure')?.querySelector('figcaption')?.textContent ?? ''
    zoom.showModal()
  }
  img.addEventListener('click', open)
  img.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      open()
    }
  })
}

// ---------------------------------------------------------------- search
const indexUrl = $<HTMLMetaElement>('meta[name="help-index"]')?.content ?? '/help/search-index.json'
let searcher: Promise<Searcher | null> | null = null
const loadIndex = () =>
  (searcher ??= fetch(indexUrl)
    .then((r) => (r.ok ? (r.json() as Promise<IndexData>) : Promise.reject(new Error(String(r.status)))))
    .then((d) => new Searcher(d))
    .catch(() => {
      searcher = null
      return null
    }))

const dlg = document.createElement('dialog')
dlg.className = 'search'
dlg.setAttribute('aria-label', 'Search the Help Center')
dlg.innerHTML = `
  <div class="s-bar">
    <svg class="i-search" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="3"/><path d="M15.5 15.5l5 5" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>
    <input class="s-input" type="search" placeholder="Search the Help Center" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go"
      role="combobox" aria-expanded="true" aria-controls="s-results" aria-autocomplete="list" aria-label="Search the Help Center">
    <span class="s-count" aria-live="polite"></span>
    <button class="s-close" type="button" aria-label="Close Search"><span class="s-close-kbd">Esc</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg></button>
  </div>
  <div class="s-results" id="s-results" role="listbox" aria-label="Results"></div>
  <div class="s-foot" aria-hidden="true"><span><kbd class="sym">↑</kbd><kbd class="sym">↓</kbd> Navigate</span><span><kbd class="sym ret"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 3v4a3 3 0 0 1-3 3H4m3-3-3 3 3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></kbd> Open</span><span><kbd>Esc</kbd> Close</span></div>`
document.body.append(dlg)
const input = $<HTMLInputElement>('.s-input', dlg)!
const results = $('.s-results', dlg)!
const count = $('.s-count', dlg)!
let active = -1
let lastQuery = ''

const options = () => $$<HTMLAnchorElement>('.s-opt', results)
function setActive(i: number, scroll = true) {
  const opts = options()
  if (!opts.length) {
    active = -1
    input.removeAttribute('aria-activedescendant')
    return
  }
  active = (i + opts.length) % opts.length
  opts.forEach((o, k) => o.setAttribute('aria-selected', String(k === active)))
  input.setAttribute('aria-activedescendant', opts[active].id)
  if (scroll) opts[active].scrollIntoView({ block: 'nearest' })
}

const POPULAR: [string, string, string][] = [
  ['sparkles', 'Getting Started', '/help/getting-started'],
  ['coin', 'Coins & Shopping', '/help/coins-and-shopping'],
  ['chef-hat', 'Jobs', '/help/jobs'],
  ['couch', 'Your Apartment', '/help/apartment'],
  ['friends', 'Friends & Chat', '/help/community'],
  ['idea', 'FAQ', '/help/faq'],
]

function renderEmpty() {
  const recent = store.get('help-recent')
  count.textContent = ''
  let n = 0
  const opt = (href: string, html: string) => `<a class="s-opt s-row" id="s-o${n++}" role="option" aria-selected="false" href="${esc(href)}">${html}</a>`
  results.innerHTML =
    (recent.length
      ? `<p class="s-label">Recent Searches</p>${recent.map((q) => `<button class="s-opt s-row s-recent" id="s-o${n++}" role="option" aria-selected="false" type="button" data-q="${esc(q)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M12 8v4l3 2" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg><span>${esc(q)}</span></button>`).join('')}`
      : '') +
    `<p class="s-label">Popular Topics</p>` +
    POPULAR.map(([ic, t, u]) => opt(u, `<img class="s-icon" src="/art/icons/e/${ic}.png" alt="" width="24" height="24"><span class="s-title">${esc(t)}</span>`)).join('')
  for (const b of $$<HTMLButtonElement>('.s-recent', results))
    b.addEventListener('click', () => {
      input.value = b.dataset.q ?? ''
      void run()
    })
  setActive(-1)
}

function renderResults(q: string, r: Results) {
  let n = 0
  if (!r.pages.length) {
    count.textContent = 'No results'
    results.innerHTML = `<div class="s-none"><img src="/art/icons/e/pigeon.png" alt="" width="48" height="48"><p><b>No results for “${esc(q)}”.</b></p><p>Even the pigeons came up empty. Try a different word, or browse the <a href="/help/faq">FAQ</a> and <a href="/help/troubleshooting">Troubleshooting</a>.</p></div>`
    setActive(-1)
    return
  }
  count.textContent = `${r.total} ${r.total === 1 ? 'result' : 'results'}`
  const fixed = r.corrected ? `<p class="s-fixed">Showing results for <b>${esc(r.corrected)}</b></p>` : ''
  results.innerHTML =
    fixed +
    r.pages
      .map((p) => {
        const top = `<a class="s-opt s-page" id="s-o${n++}" role="option" aria-selected="false" href="${esc(p.url)}">${p.icon ? `<img class="s-icon" src="/art/icons/e/${esc(p.icon)}.png" alt="" width="24" height="24">` : '<span class="s-icon"></span>'}<span class="s-text">${p.group ? `<span class="s-crumb">${esc(p.group)}</span>` : ''}<span class="s-title">${p.titleHtml}</span>${p.snippet ? `<span class="s-snip">${p.snippet}</span>` : ''}</span></a>`
        const secs = p.sections
          .map((s) => `<a class="s-opt s-sec" id="s-o${n++}" role="option" aria-selected="false" href="${esc(s.url)}"><span class="s-hash" aria-hidden="true">#</span><span class="s-text"><span class="s-title">${s.headingHtml}</span>${s.snippet ? `<span class="s-snip">${s.snippet}</span>` : ''}</span></a>`)
          .join('')
        return `<div class="s-group">${top}${secs}</div>`
      })
      .join('')
  setActive(0, false)
}

async function run() {
  const q = input.value.trim()
  lastQuery = q
  if (!q) return renderEmpty()
  const s = await loadIndex()
  if (q !== lastQuery) return
  if (!s) {
    count.textContent = ''
    results.innerHTML = `<div class="s-none"><p><b>Search isn’t available right now.</b></p><p>Check your connection and try again, or browse the pages in the menu.</p></div>`
    return
  }
  renderResults(q, s.search(q))
}

function remember(q: string) {
  if (!q) return
  store.set('help-recent', [q, ...store.get('help-recent').filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 5))
}

function openSearch(prefill = '') {
  if (dlg.open) return input.select()
  setMenu(false)
  void loadIndex()
  dlg.showModal()
  input.value = prefill || input.value
  input.select()
  void run()
}
const closeSearch = () => dlg.open && dlg.close()

input.addEventListener('input', () => void run())
input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    setActive(active + 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    setActive(active - 1)
  } else if (e.key === 'Enter') {
    const o = options()[active < 0 ? 0 : active]
    if (o) {
      e.preventDefault()
      o.click()
    }
  } else if (e.key === 'Escape') {
    // a search field clears itself on Escape and keeps the box open; here Escape always closes it
    e.preventDefault()
    closeSearch()
  }
})
results.addEventListener('click', (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a.s-opt')
  if (!a) return
  remember(input.value.trim())
  // a section of this same page: just go there
  const u = new URL(a.href)
  if (u.pathname === location.pathname && u.hash) {
    e.preventDefault()
    closeSearch()
    history.pushState(null, '', u.hash)
    document.getElementById(decodeURIComponent(u.hash.slice(1)))?.scrollIntoView({ block: 'start' })
    flash(u.hash.slice(1))
  } else if (u.pathname === location.pathname) closeSearch()
})
results.addEventListener('mousemove', (e) => {
  const o = (e.target as HTMLElement).closest('.s-opt')
  const i = options().indexOf(o as HTMLAnchorElement)
  if (i >= 0 && i !== active) setActive(i, false)
})
$('.s-close', dlg)!.addEventListener('click', closeSearch)
// a click on the dimmed page around the box closes it
dlg.addEventListener('click', (e) => {
  if (e.target === dlg) closeSearch()
})
dlg.addEventListener('close', () => {
  document.body.classList.remove('searching')
})
dlg.addEventListener('cancel', () => remember(''))

for (const b of $$('[data-search-open]')) b.addEventListener('click', () => openSearch())
addEventListener('keydown', (e) => {
  const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
  if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
    e.preventDefault()
    if (dlg.open) closeSearch()
    else openSearch()
  } else if (e.key === '/' && !typing && !dlg.open) {
    e.preventDefault()
    openSearch()
  } else if (e.key === 'Escape' && document.body.classList.contains('menu-open')) setMenu(false)
})
// the first search should be instant: fetch the index once the page has settled
const idle = (window as unknown as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1500))
idle(() => void loadIndex())
// /help?q=coins opens the search with that query (links from the game can use it)
const q0 = new URLSearchParams(location.search).get('q')
if (q0) openSearch(q0)

// development: the page reloads itself when its Markdown changes (vite-plugin.ts sends this)
if (import.meta.hot) import.meta.hot.on('help:reload', () => location.reload())
