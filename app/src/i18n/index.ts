/**
 * Languages. The game writes its words in English all over the code, so (like the emoji icons in engine/iconize.ts)
 * translation works on whatever text reaches the page: each piece of text, and each title / aria-label / placeholder,
 * is looked up in the chosen language's table and swapped if it's there. What isn't in the table stays in English.
 * The original is remembered, so switching language (or back to English) needs no reload.
 *
 * The tables are strings/<language>.json: { "English line": "translation" }. A line with "{0}", "{1}"… in it is a
 * pattern: those parts are filled in by the game (a number, a name, a place) and carried over into the translation.
 * `node scripts/i18n-extract.mjs` lists every English line in the code (strings/en.json) and says what each
 * language is still missing.
 *
 * Never translated: what players are called and what they type in the chat log, fields, and anything under a
 * `translate="no"` attribute. Speech bubbles are translated when they say one of the game's own lines.
 */
export const LANGS = [
  { id: 'en', name: 'English' },
  { id: 'es', name: 'Español' },
  { id: 'fr', name: 'Français' },
  { id: 'hi', name: 'हिन्दी' },
  { id: 'zh', name: '中文' },
] as const
export type Lang = (typeof LANGS)[number]['id']

const KEY = 'club-nyc:lang'
const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.id === v)

/** the language picked on this computer (English until someone picks another) */
export function savedLang(): Lang {
  try {
    const v = localStorage.getItem(KEY)
    return isLang(v) ? v : 'en'
  } catch {
    return 'en'
  }
}

let current: Lang = 'en'
/** whole lines: English -> translation */
let table = new Map<string, string>()
/** lines with filled-in parts, most specific first */
let patterns: { re: RegExp; order: number[]; out: string }[] = []
/** pattern answers already worked out (null: no pattern fits) */
let seen = new Map<string, string | null>()
export const lang = () => current

const LOAD: Record<Exclude<Lang, 'en'>, () => Promise<{ default: Record<string, string> }>> = {
  es: () => import('./strings/es.json'),
  fr: () => import('./strings/fr.json'),
  hi: () => import('./strings/hi.json'),
  zh: () => import('./strings/zh.json'),
}

const EMOJI = /(?:\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}])(?:\uFE0F|\u200D\p{Extended_Pictographic}|[\u{1F3FB}-\u{1F3FF}])*/gu
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Build the lookup for one language's table. */
function build(rows: Record<string, string>) {
  table = new Map()
  patterns = []
  seen = new Map()
  const add = (en: string, to: string) => {
    const k = key(en)
    const out = to.trim()
    if (!k || !out || !/\p{L}/u.test(k)) return
    if (!/\{\d\}/.test(k)) {
      if (!table.has(k)) table.set(k, out)
      return
    }
    if (k.replace(/\{\d\}/g, '').replace(/[^\p{L}]/gu, '').length < 3) return
    const order: number[] = []
    const re = k
      .split(/(\{\d\})/)
      .map((part) => {
        const m = /^\{(\d)\}$/.exec(part)
        if (!m) return escRe(part)
        order.push(+m[1])
        return '(.*?)'
      })
      .join('')
    patterns.push({ re: new RegExp(`^${re}$`, 's'), order, out })
  }
  for (const [en, to] of Object.entries(rows)) {
    add(en, to)
    // the emoji in a line become pictures (engine/iconize.ts), which cuts its text into the pieces between them
    const a = en.split(EMOJI)
    const b = to.split(EMOJI)
    if (a.length > 1 && a.length === b.length) a.forEach((piece, i) => add(piece, b[i]))
    // "{0} Roll Again", where {0} is a picture the code puts in: the words are a piece of their own
    const lead = /^\{(\d)\}\s+(?=\S)/.exec(en)
    if (lead && !/\{\d\}/.test(en.slice(lead[0].length))) add(en.slice(lead[0].length), to.replace(`{${lead[1]}}`, '').trim())
  }
  const weight = (p: { re: RegExp }) => p.re.source.replace(/\(\.\*\?\)/g, '').length
  patterns.sort((x, y) => weight(y) - weight(x))
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION', 'SELECT', 'TITLE', 'NOSCRIPT'])
const OFF = '[translate="no"], .name-tag, .chat-log, svg, [contenteditable="true"]'
const ATTRS = ['title', 'aria-label', 'placeholder'] as const
/** what each piece of text said in English, and what we turned it into */
const texts = new WeakMap<Text, { src: string; out: string }>()
const attrs = new WeakMap<Element, Record<string, { src: string; out: string }>>()

const key = (s: string) => s.trim().replace(/\s+/g, ' ')
/** the translation of one line (already tidied by `key`), or undefined */
function find(k: string): string | undefined {
  const hit = table.get(k)
  if (hit !== undefined) return hit
  if (!patterns.length || !/\p{L}/u.test(k)) return undefined
  let got = seen.get(k)
  if (got === undefined) {
    got = null
    for (const p of patterns) {
      const m = p.re.exec(k)
      if (!m) continue
      const parts: Record<number, string> = {}
      p.order.forEach((n, i) => (parts[n] = m[i + 1]))
      // a filled-in part may itself be one of the game's lines (a place, an item)
      got = p.out.replace(/\{(\d)\}/g, (_, n) => {
        const v = parts[+n] ?? ''
        return table.get(key(v)) ?? v
      })
      break
    }
    if (seen.size > 4000) seen.clear()
    seen.set(k, got)
    if (got === null && import.meta.env.DEV) missed.add(k)
  }
  return got ?? undefined
}
/** (dev) lines that reached the page with no translation: `__i18nMissed` in the console */
const missed = new Set<string>()
if (import.meta.env.DEV) (window as unknown as { __i18nMissed: Set<string> }).__i18nMissed = missed

/** `src` in the current language, keeping the spaces around it ("" + "Map" + " ") */
function render(src: string): string {
  const hit = find(key(src))
  if (hit === undefined) return src
  return /^\s*/.exec(src)![0] + hit + /\s*$/.exec(src)![0]
}

function translateText(t: Text) {
  const now = t.data
  const was = texts.get(t)
  // text the game has rewritten since is a new English line
  const src = was && was.out === now ? was.src : now
  if (!key(src)) return
  const p = t.parentElement
  if (!p || SKIP.has(p.tagName) || p.closest(OFF)) return
  const out = render(src)
  texts.set(t, { src, out })
  if (out !== now) t.data = out
}

function translateAttrs(e: Element) {
  if (e.closest(OFF)) return
  for (const a of ATTRS) {
    const now = e.getAttribute(a)
    if (now === null) continue
    const mine = attrs.get(e) ?? {}
    const was = mine[a]
    const src = was && was.out === now ? was.src : now
    const out = render(src)
    mine[a] = { src, out }
    attrs.set(e, mine)
    if (out !== now) e.setAttribute(a, out)
  }
}

function translate(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) return translateText(node as Text)
  if (!(node instanceof HTMLElement) || SKIP.has(node.tagName)) return
  translateAttrs(node)
  for (const e of node.querySelectorAll('[title], [aria-label], [placeholder]')) translateAttrs(e)
  const walk = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
  const found: Text[] = []
  while (walk.nextNode()) found.push(walk.currentNode as Text)
  found.forEach(translateText)
}

let watching = false
function watch() {
  if (watching) return
  watching = true
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') r.addedNodes.forEach(translate)
      else if (r.type === 'characterData') translate(r.target)
      else if (r.target instanceof Element) translateAttrs(r.target)
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...ATTRS] })
}

/** Switch language: remembered on this computer, applied to everything on the page now and from here on. */
export async function setLang(to: Lang, remember = true) {
  if (remember) {
    try {
      localStorage.setItem(KEY, to)
    } catch {
      /* private mode: the choice lasts for this visit */
    }
  }
  const rows = to === 'en' ? {} : (await LOAD[to]()).default
  build(rows)
  current = to
  document.documentElement.lang = to
  // English with nothing translated yet: nothing to undo, nothing to watch
  if (to === 'en' && !watching) return
  watch()
  translate(document.body)
}
