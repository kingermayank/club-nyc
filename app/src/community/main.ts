/**
 * The community board (community.html; API in server/src/community.ts). One page, three views picked from the address:
 *   /community              the list: category tabs, Top / New, posts with votes, replies and views
 *   /community/post/<id>    a post with its replies and a reply box
 *   /community/new          the new-post form
 * Anyone can read. Writing needs a Club NYC account (not a guest) with a New Yorker: anyone else who presses a
 * write button gets the sign-in card, and comes back here afterwards (the server's `next` return path).
 * Moderators signed in to Launch HQ see Hide and Delete on everything, and a Hidden tab.
 */
// the Help Center's styles first (faces, colours, top bar, footer), then the board's own on top
import '../../help/help.css'
import './community.css'
import { headPortrait } from '../avatar/render'
import type { Look } from '../avatar/look'

type Category = 'bugs' | 'ideas' | 'feedback'
type Sort = 'top' | 'new'
interface Author {
  id: string
  name: string
  look: Look | null
  founder: boolean
}
interface Post {
  id: number
  category: Category
  title: string
  excerpt: string
  body?: string
  author: Author
  createdAt: number
  votes: number
  replies: number
  views: number
  voted: boolean
  mine: boolean
  hidden?: boolean
  reports?: number
}
interface Reply {
  id: number
  body: string
  author: Author
  createdAt: number
  mine: boolean
}
type Why = 'signed-out' | 'guest' | 'no-name' | 'banned' | 'muted'
interface Me {
  canPost: boolean
  why: Why | null
  user: { id: string; name: string; look: Look | null } | null
}
interface Providers {
  google: boolean
  x: boolean
  discord: boolean
  email: boolean
}

const CATS: { id: Category; label: string; icon: string; hint: string }[] = [
  { id: 'bugs', label: 'Bugs & Issues', icon: 'rat', hint: 'Something broke' },
  { id: 'ideas', label: 'Ideas & Requests', icon: 'idea', hint: 'Build this next' },
  { id: 'feedback', label: 'General Feedback', icon: 'megaphone', hint: 'Anything else' },
]
const catOf = (id: string) => CATS.find((c) => c.id === id) ?? CATS[2]
const LIMITS = { title: 90, body: 4000, reply: 2000 }

const root = document.getElementById('board') as HTMLElement
let me: Me = { canPost: false, why: 'signed-out', user: null }
let isMod = false
let providers: Providers | null = null

// ---------- little helpers ----------
type Attrs = Record<string, string | number | boolean | ((e: Event) => void) | undefined>
type Child = Node | string | null | undefined | false
function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...kids: Child[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue
    if (typeof v === 'function') e.addEventListener(k.replace(/^on/, ''), v)
    else if (k === 'class') e.className = String(v)
    else if (k === 'html') e.innerHTML = String(v)
    else e.setAttribute(k, v === true ? '' : String(v))
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) e.append(c)
  return e
}
const icon = (name: string, cls = 'cm-ji') => h('img', { class: cls, src: `/art/icons/e/${name}.png`, alt: '', width: 40, height: 40 })
const svg = (markup: string, cls: string) => {
  const s = document.createElement('span')
  s.className = cls
  s.innerHTML = markup
  return s
}
const ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 4 13h5v7h6v-7h5z" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>'
const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
const FLAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 21V4m0 1h11l-2 4 2 4H6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'

function head(a: { name: string; look: Look | null }, size = 'sm') {
  const box = h('span', { class: `cm-head cm-head-${size}`, 'aria-hidden': 'true' })
  try {
    if (a.look && typeof a.look === 'object' && 'skin' in a.look) {
      box.innerHTML = headPortrait(a.look)
      return box
    }
  } catch {
    /* an old or odd look: the initial instead */
  }
  box.classList.add('cm-head-letter')
  box.textContent = (a.name[0] ?? '?').toUpperCase()
  return box
}

const ago = (t: number) => {
  const s = Math.max(0, (Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d ago`
  const d = new Date(t)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(d.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) })
}
const when = (t: number) => h('time', { datetime: new Date(t).toISOString(), title: new Date(t).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) }, ago(t))
const count = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n))

/** paragraphs of plain text (never HTML) */
function prose(text: string) {
  const box = h('div', { class: 'cm-prose' })
  for (const para of text.split(/\n{2,}/)) {
    const p = h('p')
    para.split('\n').forEach((line, i) => {
      if (i) p.append(h('br'))
      p.append(line)
    })
    box.append(p)
  }
  return box
}

async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const o: RequestInit = { credentials: 'same-origin', ...init }
  if (init?.json !== undefined) {
    o.method = o.method ?? 'POST'
    o.headers = { 'content-type': 'application/json' }
    o.body = JSON.stringify(init.json)
  }
  try {
    const res = await fetch(path, o)
    const data = (await res.json().catch(() => ({}))) as T & { error?: string }
    return { ok: res.ok, status: res.status, data }
  } catch {
    return { ok: false, status: 0, data: { error: 'offline' } as T & { error?: string } }
  }
}

let toastTimer = 0
function toast(text: string) {
  let t = document.querySelector<HTMLElement>('.toast')
  if (!t) {
    t = h('div', { class: 'toast', role: 'status' })
    document.body.append(t)
  }
  t.textContent = text
  t.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => t!.classList.remove('show'), 2600)
}
const ERRORS: Record<string, string> = {
  'slow-down': 'Easy there. Try again in a few minutes.',
  'title-short': 'Give it a longer title.',
  'body-short': 'Add a little more detail.',
  'not-found': 'That post is gone.',
  offline: 'Can’t reach Club NYC. Check your connection.',
  muted: 'Your account is muted for now.',
  banned: 'Your account is suspended.',
}
const errorText = (e?: string) => ERRORS[e ?? ''] ?? 'Something went wrong. Try again.'

// ---------- addresses ----------
type Route = { view: 'list'; cat: Category | null; sort: Sort; hidden: boolean } | { view: 'post'; id: number } | { view: 'new'; cat: Category | null }
function route(): Route {
  const path = location.pathname.replace(/\/+$/, '')
  const qs = new URLSearchParams(location.search)
  const cat = CATS.some((c) => c.id === qs.get('cat')) ? (qs.get('cat') as Category) : null
  const post = /^\/community\/post\/(\d+)$/.exec(path)
  if (post) return { view: 'post', id: Number(post[1]) }
  if (path === '/community/new') return { view: 'new', cat }
  return { view: 'list', cat, sort: qs.get('sort') === 'new' ? 'new' : 'top', hidden: isMod && qs.get('show') === 'hidden' }
}
function go(url: string, replace = false) {
  if (replace) history.replaceState(null, '', url)
  else history.pushState(null, '', url)
  void render()
  if (!replace) window.scrollTo({ top: 0 })
}
const link = (href: string, cls: string, ...kids: Child[]) =>
  h(
    'a',
    {
      class: cls,
      href,
      onclick: (e: Event) => {
        const m = e as MouseEvent
        if (m.metaKey || m.ctrlKey || m.shiftKey || m.button !== 0) return
        e.preventDefault()
        go(href)
      },
    },
    ...kids,
  )
const listUrl = (cat: Category | null, sort: Sort, hidden = false) => {
  const qs = new URLSearchParams()
  if (cat) qs.set('cat', cat)
  if (sort === 'new') qs.set('sort', 'new')
  if (hidden) qs.set('show', 'hidden')
  const s = qs.toString()
  return `/community${s ? `?${s}` : ''}`
}
window.addEventListener('popstate', () => void render())

// ---------- signing in ----------
let dialog: HTMLDialogElement | null = null
/** what someone who can't write yet sees when they try: the way in for their case */
async function askToJoin(action: string) {
  if (me.canPost) return
  dialog?.remove()
  const why = me.why ?? 'signed-out'
  const next = location.pathname.replace(/\/+$/, '') || '/community'
  const close = () => dialog?.close()
  const body = h('div', { class: 'cm-join-body' })
  const card = h(
    'div',
    { class: 'cm-join' },
    h('button', { class: 'cm-x', type: 'button', 'aria-label': 'Close', onclick: close, html: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>' }),
    icon(why === 'no-name' ? 'sparkles' : why === 'banned' || why === 'muted' ? 'shush' : 'key', 'cm-join-icon'),
    body,
  )
  dialog = h('dialog', { class: 'cm-dialog', 'aria-label': 'Sign in' }, card) as HTMLDialogElement
  dialog.addEventListener('click', (e) => e.target === dialog && close())
  dialog.addEventListener('close', () => dialog?.remove())
  document.body.append(dialog)

  if (why === 'no-name') {
    body.append(h('h2', {}, 'Make your New Yorker first'), h('p', {}, `Your name and look go next to everything you ${action}.`), h('a', { class: 'cm-btn cm-btn-go', href: '/play' }, 'Make My New Yorker'))
  } else if (why === 'banned' || why === 'muted') {
    body.append(h('h2', {}, why === 'banned' ? 'Your account is suspended' : 'Your account is muted'), h('p', {}, 'You can still read the board.'), h('a', { class: 'cm-link', href: '/rules.html' }, 'Community Rules'))
  } else {
    body.append(h('h2', {}, why === 'guest' ? 'Save your account to post' : 'Sign in to join in'), h('p', {}, `A Club NYC account lets you ${action}.`))
    providers ??= (await api<Providers>('/api/auth/providers')).data
    const ways = h('div', { class: 'cm-ways' })
    const p = providers ?? { google: false, x: false, discord: false, email: false }
    // Google and X are always offered, like the game's front door: a server without their keys greys them out in
    // development (with a note) and leaves them off in production. Discord only when it's set up.
    const missing: string[] = []
    const way = (id: 'google' | 'x' | 'discord', label: string, mark: string) => {
      const kids = [svg(mark, 'cm-way-mark'), h('span', {}, label)]
      if (p[id]) return h('a', { class: `cm-way cm-way-${id}`, href: `/api/auth/${id}?next=${encodeURIComponent(next)}` }, ...kids)
      if (!import.meta.env.DEV || id === 'discord') return null
      missing.push(id === 'x' ? 'X' : 'Google')
      return h('button', { class: `cm-way cm-way-${id}`, type: 'button', disabled: true, title: 'Not set up on this server yet' }, ...kids)
    }
    const add = (n: HTMLElement | null) => n && ways.append(n)
    add(way('google', 'Continue with Google', '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.6 12.2c0-.8-.1-1.4-.2-2H12v3.9h6c-.1 1-.8 2.5-2.3 3.5v2.8h3.6c2.1-2 3.3-4.9 3.3-8.2z"/><path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.9C3.9 20.6 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.8 14.1c-.2-.7-.4-1.4-.4-2.1s.1-1.4.4-2.1V7H2.1C1.4 8.5 1 10.2 1 12s.4 3.5 1.1 5l3.7-2.9z"/><path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.6l3.2-3.1C17.5 2.1 15 1 12 1 7.7 1 3.9 3.4 2.1 7l3.7 2.9C6.7 7.3 9.1 5.4 12 5.4z"/></svg>'))
    add(way('x', 'Continue with X', '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17.8 2.5h3.3l-7.2 8.2 8.5 10.8h-6.6l-5.2-6.6-6 6.6H1.3l7.7-8.8L.9 2.5h6.8l4.7 6 5.4-6zm-1.2 17h1.8L7.4 4.4H5.5l11.1 15.1z"/></svg>'))
    add(way('discord', 'Continue with Discord', '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#5865F2" d="M20.3 4.4A19.8 19.8 0 0 0 15.4 2.8l-.7 1.3a18.3 18.3 0 0 0-5.5 0l-.6-1.3a19.7 19.7 0 0 0-4.9 1.6C.5 9-.3 13.6.1 18.1a19.9 19.9 0 0 0 6 3l1.2-2a13 13 0 0 1-1.9-.9l.4-.3c3.9 1.8 8.2 1.8 12 0l.4.3c-.6.4-1.2.7-1.9.9l1.2 2a19.8 19.8 0 0 0 6-3c.5-5.2-.8-9.7-3.5-13.7zM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.5 8 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4z"/></svg>'))
    body.append(ways)
    if (missing.length) body.append(h('small', { class: 'cm-dev' }, `Dev note: ${missing.join(' and ')} ${missing.length === 1 ? 'needs' : 'need'} keys in server/.env.`))
    if (p.email) {
      const input = h('input', { type: 'email', name: 'email', autocomplete: 'email', placeholder: 'you@example.com', required: true, 'aria-label': 'Your email' })
      const send = h('button', { class: 'cm-btn cm-btn-go', type: 'submit' }, 'Email Me a Link')
      const form = h('form', { class: 'cm-email' }, input, send)
      form.addEventListener('submit', async (e) => {
        e.preventDefault()
        send.disabled = true
        const r = await api<{ ok?: boolean; minutes?: number }>('/api/auth/email', { json: { email: input.value, next } })
        send.disabled = false
        if (r.ok) form.replaceWith(h('p', { class: 'cm-sent' }, icon('envelope'), `Check your inbox. The link works for ${r.data.minutes ?? 15} minutes.`))
        else toast(r.data.error === 'bad-email' ? 'That email doesn’t look right.' : errorText(r.data.error))
      })
      if (ways.childElementCount) body.append(h('p', { class: 'cm-or' }, h('span', {}, 'or')))
      body.append(form)
    }
    if (!ways.childElementCount && !p.email) body.append(h('a', { class: 'cm-btn cm-btn-go', href: '/play' }, 'Sign In in the Game'))
  }
  dialog.showModal()
}
/** run `fn` if they can write; otherwise show the way in */
const needsAccount = (action: string, fn: () => void) => () => (me.canPost ? fn() : void askToJoin(action))

// ---------- the vote button ----------
function voteButton(p: Post, big = false) {
  const b = h('button', { class: `cm-vote${big ? ' cm-vote-big' : ''}`, type: 'button' })
  const paint = () => {
    b.classList.toggle('on', p.voted)
    b.setAttribute('aria-pressed', String(p.voted))
    b.setAttribute('aria-label', `${p.voted ? 'Remove your upvote' : 'Upvote'} (${p.votes})`)
    b.replaceChildren(svg(ARROW, 'cm-vote-arrow'), h('span', { class: 'cm-vote-n' }, count(p.votes)))
  }
  paint()
  b.addEventListener(
    'click',
    needsAccount('upvote posts', async () => {
      const up = !p.voted
      // shown right away; put back if the server says no
      p.voted = up
      p.votes += up ? 1 : -1
      paint()
      b.classList.remove('pop')
      void b.offsetWidth
      if (up) b.classList.add('pop')
      const r = await api<{ votes: number; voted: boolean }>(`/api/community/posts/${p.id}/vote`, { json: { up } })
      if (r.ok) {
        p.votes = r.data.votes
        p.voted = r.data.voted
      } else {
        p.voted = !up
        p.votes += up ? -1 : 1
        toast(errorText(r.data.error))
      }
      paint()
    }),
  )
  return b
}

function catChip(id: Category) {
  const c = catOf(id)
  return h('span', { class: `cm-chip cm-chip-${c.id}` }, icon(c.icon), c.label)
}
const stat = (name: string, n: number, label: string) => h('span', { class: 'cm-stat', title: `${n} ${label}` }, icon(name), h('span', {}, count(n)), h('span', { class: 'sr-only' }, ` ${label}`))

function byline(a: Author, t: number, size = 'sm') {
  return h('span', { class: 'cm-by' }, head(a, size), h('span', { class: 'cm-by-name' }, a.name), a.founder ? h('span', { class: 'cm-founder', title: 'Founder' }, icon('crown')) : null, h('span', { class: 'cm-by-time' }, when(t)))
}

function modTools(post: number, reply?: number, hidden = false) {
  if (!isMod) return null
  const act = async (path: string, body: Record<string, unknown>, done: string) => {
    const r = await api(`/api/admin/community/${path}`, { json: { post, ...(reply ? { reply } : {}), ...body } })
    toast(r.ok ? done : errorText(r.data.error))
    if (r.ok) void render()
  }
  return h(
    'span',
    { class: 'cm-mod' },
    h('button', { type: 'button', class: 'cm-mini', onclick: () => void act('hide', { hidden: !hidden }, hidden ? 'Shown again' : 'Hidden') }, hidden ? 'Show' : 'Hide'),
    h('button', { type: 'button', class: 'cm-mini cm-mini-red', onclick: () => confirm('Delete for good? This can’t be undone.') && void act('delete', {}, 'Deleted') }, 'Delete'),
  )
}

function reportButton(post: number, reply?: number) {
  const b = h('button', { type: 'button', class: 'cm-mini cm-report', 'aria-label': reply ? 'Report this reply' : 'Report this post' }, svg(FLAG, 'cm-mini-icon'), 'Report')
  b.addEventListener(
    'click',
    needsAccount('report posts', () => {
      const menu = h('div', { class: 'cm-report-menu', role: 'menu' })
      const reasons: [string, string][] = [
        ['spam', 'Spam or ads'],
        ['mean', 'Mean or rude'],
        ['unsafe', 'Unsafe or personal info'],
        ['other', 'Something else'],
      ]
      for (const [id, label] of reasons)
        menu.append(
          h(
            'button',
            {
              type: 'button',
              role: 'menuitem',
              onclick: async () => {
                menu.remove()
                const r = await api('/api/community/report', { json: { post, ...(reply ? { reply } : {}), reason: id } })
                toast(r.ok ? 'Thanks. A moderator will take a look.' : errorText(r.data.error))
                if (r.ok) b.disabled = true
              },
            },
            label,
          ),
        )
      document.querySelector('.cm-report-menu')?.remove()
      b.after(menu)
      const away = (e: Event) => {
        if (!menu.contains(e.target as Node) && e.target !== b) {
          menu.remove()
          document.removeEventListener('click', away, true)
        }
      }
      setTimeout(() => document.addEventListener('click', away, true))
    }),
  )
  return b
}

// ---------- the list ----------
let listState: { key: string; posts: Post[]; page: number; more: boolean; counts: Record<Category, number> } | null = null

async function renderList(r: Extract<Route, { view: 'list' }>) {
  const key = `${r.cat}|${r.sort}|${r.hidden}`
  const top = h(
    'div',
    { class: 'cm-hero' },
    h('div', { class: 'cm-hero-copy' }, h('h1', {}, 'Community Board'), h('p', { class: 'cm-lead' }, 'Tell us what to build next.')),
    h('button', { class: 'cm-btn cm-btn-go cm-new', type: 'button', onclick: needsAccount('post', () => go(r.cat ? `/community/new?cat=${r.cat}` : '/community/new')) }, icon('write'), 'New Post'),
  )
  const tabs = h('nav', { class: 'cm-tabs', 'aria-label': 'Categories' })
  const sorts = h('div', { class: 'cm-sort', role: 'group', 'aria-label': 'Sort' })
  const list = h('ol', { class: 'cm-list' })
  const moreBtn = h('button', { class: 'cm-btn cm-more', type: 'button' }, 'Show More')
  root.replaceChildren(top, h('div', { class: 'cm-bar' }, tabs, sorts), list)

  const paintTabs = () => {
    const counts = listState?.counts
    const total = counts ? counts.bugs + counts.ideas + counts.feedback : null
    tabs.replaceChildren(
      link(listUrl(null, r.sort), `cm-tab${!r.cat && !r.hidden ? ' on' : ''}`, icon('skyline'), 'All', total !== null ? h('span', { class: 'cm-tab-n' }, count(total)) : null),
      ...CATS.map((c) => link(listUrl(c.id, r.sort), `cm-tab${r.cat === c.id ? ' on' : ''}`, icon(c.icon), c.label, counts ? h('span', { class: 'cm-tab-n' }, count(counts[c.id])) : null)),
    )
    for (const t of tabs.querySelectorAll('a.on')) t.setAttribute('aria-current', 'page')
    sorts.replaceChildren(
      ...(['top', 'new'] as Sort[]).map((s) =>
        link(listUrl(r.cat, s, r.hidden), `cm-sort-btn${r.sort === s ? ' on' : ''}`, s === 'top' ? icon('fire') : icon('sparkles'), s === 'top' ? 'Top' : 'New'),
      ),
    )
    for (const t of sorts.querySelectorAll('a.on')) t.setAttribute('aria-pressed', 'true')
  }
  const paintPosts = () => {
    const s = listState!
    if (!s.posts.length) {
      list.replaceChildren(
        h(
          'li',
          { class: 'cm-empty' },
          icon('pigeon', 'cm-empty-icon'),
          h('p', {}, r.hidden ? 'Nothing hidden.' : 'Quieter than a subway car at 4 a.m.'),
          r.hidden ? null : h('button', { class: 'cm-btn cm-btn-go', type: 'button', onclick: needsAccount('post', () => go('/community/new')) }, 'Write the First Post'),
        ),
      )
    } else list.replaceChildren(...s.posts.map(postRow))
    if (s.more) list.after(moreBtn)
    else moreBtn.remove()
  }

  paintTabs()
  if (!listState || listState.key !== key) {
    list.append(...Array.from({ length: 4 }, () => h('li', { class: 'cm-row cm-skel' })))
    const page = await loadPage(r, 0)
    if (!page) return
    listState = { key, ...page, page: 0 }
  }
  paintTabs()
  paintPosts()
  moreBtn.onclick = async () => {
    moreBtn.disabled = true
    const s = listState!
    const next = await loadPage(r, s.page + 1)
    moreBtn.disabled = false
    if (!next || listState !== s) return
    const seen = new Set(s.posts.map((p) => p.id))
    s.posts.push(...next.posts.filter((p) => !seen.has(p.id)))
    s.more = next.more
    s.page++
    paintPosts()
  }
}

async function loadPage(r: Extract<Route, { view: 'list' }>, page: number) {
  if (r.hidden) {
    const res = await api<{ posts: Post[]; replies: (Reply & { post: number; title: string; reports: number })[] }>('/api/admin/community/hidden')
    if (!res.ok) return null
    // hidden replies show as rows too, under their post's title
    const replies: Post[] = res.data.replies.map((x) => ({ id: x.post, category: 'feedback', title: `Reply on “${x.title}”`, excerpt: x.body, author: x.author, createdAt: x.createdAt, votes: 0, replies: 0, views: 0, voted: false, mine: false, hidden: true, reports: x.reports, replyId: x.id }) as Post)
    return { posts: [...res.data.posts, ...replies], more: false, counts: listState?.counts ?? { bugs: 0, ideas: 0, feedback: 0 } }
  }
  const qs = new URLSearchParams({ sort: r.sort, page: String(page) })
  if (r.cat) qs.set('cat', r.cat)
  const res = await api<{ posts: Post[]; more: boolean; counts: Record<Category, number> }>(`/api/community/posts?${qs}`)
  if (!res.ok) {
    root.querySelector('.cm-list')?.replaceChildren(h('li', { class: 'cm-empty' }, h('p', {}, errorText(res.data.error))))
    return null
  }
  return res.data
}

function postRow(p: Post & { replyId?: number }) {
  const href = `/community/post/${p.id}`
  const row = h(
    'li',
    { class: `cm-row${p.hidden ? ' is-hidden' : ''}` },
    p.hidden ? h('span', { class: 'cm-vote cm-vote-off' }, icon('blocked'), h('span', { class: 'cm-vote-n' }, String(p.reports ?? 0))) : voteButton(p),
    h(
      'div',
      { class: 'cm-row-main' },
      h('div', { class: 'cm-row-top' }, catChip(p.category), p.hidden ? h('span', { class: 'cm-tag' }, p.reports ? `${p.reports} ${p.reports === 1 ? 'report' : 'reports'}` : 'Hidden') : null),
      p.hidden ? h('h2', { class: 'cm-row-title' }, p.title) : h('h2', { class: 'cm-row-title' }, link(href, 'cm-row-link', p.title)),
      h('p', { class: 'cm-row-text' }, p.excerpt),
      h('div', { class: 'cm-row-meta' }, byline(p.author, p.createdAt), p.hidden ? modTools(p.id, p.replyId, true) : null),
    ),
    p.hidden ? null : h('div', { class: 'cm-row-stats' }, stat('chat', p.replies, 'replies'), stat('eyes', p.views, 'views')),
  )
  return row
}

// ---------- one post ----------
async function renderPost(id: number) {
  root.replaceChildren(h('div', { class: 'cm-post cm-skel cm-skel-tall' }))
  const res = await api<{ post: Post; replies: Reply[] }>(`/api/community/posts/${id}`)
  if (!res.ok) {
    root.replaceChildren(backLink(), h('div', { class: 'cm-empty' }, icon('pigeon', 'cm-empty-icon'), h('p', {}, res.status === 404 ? 'This post isn’t here anymore.' : errorText(res.data.error))))
    return
  }
  const { post: p, replies } = res.data
  document.title = `${p.title} · Club NYC Community`
  // the list shows the new numbers when they go back
  const inList = listState?.posts.find((x) => x.id === p.id)
  if (inList) Object.assign(inList, { votes: p.votes, voted: p.voted, replies: p.replies, views: p.views })

  const replyList = h('ol', { class: 'cm-replies' }, ...replies.map((r) => replyItem(p.id, r)))
  const repliesHead = h('h2', { class: 'cm-replies-head' }, icon('chat'), replies.length ? `${replies.length} ${replies.length === 1 ? 'Reply' : 'Replies'}` : 'Replies')
  const article = h(
    'article',
    { class: 'cm-post' },
    voteButton(p, true),
    h(
      'div',
      { class: 'cm-post-main' },
      h('div', { class: 'cm-row-top' }, catChip(p.category)),
      h('h1', { class: 'cm-post-title' }, p.title),
      h('div', { class: 'cm-post-meta' }, byline(p.author, p.createdAt, 'md'), h('span', { class: 'cm-row-stats' }, stat('chat', p.replies, 'replies'), stat('eyes', p.views, 'views'))),
      prose(p.body ?? ''),
      h('div', { class: 'cm-post-foot' }, p.mine ? null : reportButton(p.id), modTools(p.id)),
    ),
  )
  root.replaceChildren(backLink(), article, h('section', { class: 'cm-thread', 'aria-label': 'Replies' }, repliesHead, replyList, composer(p, replyList, repliesHead)))
}
const backLink = () => link(listState ? listUrlFromKey() : '/community', 'cm-back', svg(BACK, 'cm-back-icon'), 'All Posts')
function listUrlFromKey() {
  const [cat, sort, hidden] = (listState?.key ?? '').split('|')
  return listUrl(cat === 'null' ? null : (cat as Category), sort === 'new' ? 'new' : 'top', hidden === 'true')
}

function replyItem(postId: number, r: Reply) {
  return h(
    'li',
    { class: `cm-reply${r.mine ? ' mine' : ''}`, id: `reply-${r.id}` },
    h('div', { class: 'cm-reply-head' }, byline(r.author, r.createdAt)),
    prose(r.body),
    h('div', { class: 'cm-post-foot' }, r.mine ? null : reportButton(postId, r.id), modTools(postId, r.id)),
  )
}

function composer(p: Post, list: HTMLOListElement, headEl: HTMLElement) {
  if (!me.canPost) {
    return h(
      'div',
      { class: 'cm-compose cm-compose-locked' },
      me.user ? head(me.user, 'md') : icon('chat', 'cm-compose-icon'),
      h('p', {}, me.why === 'no-name' ? 'Make your New Yorker to reply.' : me.why === 'banned' || me.why === 'muted' ? 'Replies are off for your account.' : 'Sign in to reply.'),
      me.why === 'banned' || me.why === 'muted' ? null : h('button', { class: 'cm-btn cm-btn-go', type: 'button', onclick: () => void askToJoin('reply') }, me.why === 'no-name' ? 'Make My New Yorker' : 'Sign In'),
    )
  }
  const ta = h('textarea', { name: 'reply', rows: 3, maxlength: LIMITS.reply, placeholder: 'Write a reply', 'aria-label': 'Your reply', required: true }) as HTMLTextAreaElement
  const left = h('span', { class: 'cm-count' })
  const send = h('button', { class: 'cm-btn cm-btn-go', type: 'submit', disabled: true }, 'Reply')
  const sync = () => {
    const n = ta.value.trim().length
    send.disabled = n < 2
    left.textContent = n > LIMITS.reply - 200 ? String(LIMITS.reply - ta.value.length) : ''
  }
  ta.addEventListener('input', sync)
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) form.requestSubmit()
  })
  const form = h('form', { class: 'cm-compose' }, head(me.user!, 'md'), h('div', { class: 'cm-compose-box' }, ta, h('div', { class: 'cm-compose-row' }, left, send)))
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    send.disabled = true
    const r = await api<{ id: number }>(`/api/community/posts/${p.id}/replies`, { json: { body: ta.value } })
    if (!r.ok) {
      toast(errorText(r.data.error))
      sync()
      return
    }
    // the server's copy (filtered) replaces what was typed
    const fresh = await api<{ post: Post; replies: Reply[] }>(`/api/community/posts/${p.id}`)
    ta.value = ''
    sync()
    if (fresh.ok) {
      list.replaceChildren(...fresh.data.replies.map((x) => replyItem(p.id, x)))
      const n = fresh.data.replies.length
      headEl.replaceChildren(icon('chat'), `${n} ${n === 1 ? 'Reply' : 'Replies'}`)
      root.querySelector('.cm-post .cm-stat span')!.textContent = count(fresh.data.post.replies)
      const inList = listState?.posts.find((x) => x.id === p.id)
      if (inList) inList.replies = fresh.data.post.replies
      document.getElementById(`reply-${r.data.id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  })
  return form
}

// ---------- a new post ----------
function renderNew(r: Extract<Route, { view: 'new' }>) {
  if (!me.canPost) {
    go('/community', true)
    void askToJoin('post')
    return
  }
  let cat: Category | null = r.cat
  const picks = h('div', { class: 'cm-picks', role: 'radiogroup', 'aria-label': 'Category' })
  const paintPicks = () =>
    picks.replaceChildren(
      ...CATS.map((c) =>
        h(
          'button',
          {
            type: 'button',
            role: 'radio',
            'aria-checked': String(cat === c.id),
            class: `cm-pick cm-pick-${c.id}${cat === c.id ? ' on' : ''}`,
            onclick: () => {
              cat = c.id
              paintPicks()
              sync()
              title.focus()
            },
          },
          icon(c.icon, 'cm-pick-icon'),
          h('span', { class: 'cm-pick-label' }, c.label),
          h('span', { class: 'cm-pick-hint' }, c.hint),
        ),
      ),
    )
  const title = h('input', { type: 'text', name: 'title', maxlength: LIMITS.title, placeholder: 'Title', 'aria-label': 'Title', autocomplete: 'off', required: true }) as HTMLInputElement
  const body = h('textarea', { name: 'body', rows: 8, maxlength: LIMITS.body, placeholder: 'What happened, or what should we build?', 'aria-label': 'Details', required: true }) as HTMLTextAreaElement
  const left = h('span', { class: 'cm-count' })
  const send = h('button', { class: 'cm-btn cm-btn-go', type: 'submit', disabled: true }, 'Post')
  const sync = () => {
    send.disabled = !cat || title.value.trim().length < 4 || body.value.trim().length < 10
    left.textContent = body.value.length > LIMITS.body - 300 ? String(LIMITS.body - body.value.length) : ''
  }
  title.addEventListener('input', sync)
  body.addEventListener('input', sync)
  const form = h(
    'form',
    { class: 'cm-form' },
    h('h1', {}, 'New Post'),
    picks,
    h('label', { class: 'cm-field' }, title),
    h('label', { class: 'cm-field' }, body),
    h('div', { class: 'cm-form-row' }, h('span', { class: 'cm-as' }, head(me.user!, 'sm'), me.user!.name), left, link('/community', 'cm-btn cm-btn-plain', 'Cancel'), send),
  )
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    if (send.disabled) return
    send.disabled = true
    const res = await api<{ id: number }>('/api/community/posts', { json: { category: cat, title: title.value, body: body.value } })
    if (!res.ok) {
      toast(errorText(res.data.error))
      sync()
      return
    }
    listState = null
    go(`/community/post/${res.data.id}`, true)
  })
  paintPicks()
  root.replaceChildren(backLink(), form)
  ;(cat ? title : (picks.firstElementChild as HTMLElement))?.focus()
}

// ---------- start ----------
async function render() {
  const r = route()
  document.title = 'Community Board · Club NYC'
  document.querySelector('.cm-report-menu')?.remove()
  if (r.view === 'post') await renderPost(r.id)
  else if (r.view === 'new') renderNew(r)
  else await renderList(r)
}

async function start() {
  const [who, mod] = await Promise.all([api<Me>('/api/community/me'), api<{ ok: boolean }>('/api/admin/session')])
  if (who.ok) me = who.data
  isMod = !!mod.ok && !!mod.data.ok
  await render()
}
void start()
