import { EMOJI_ICON } from '../data/emojiIcons'

/**
 * Every emoji the game shows becomes one of our illustrated icons (art/icons/e/*.png, drawn in the same style as
 * the rest of the city). It works on whatever text reaches the page — panels, toasts, speech bubbles, chat, the
 * emote picker — by watching the DOM, so strings in the code can keep their readable emoji. The emoji stays as
 * the image's alt text (screen readers, copy-paste of a single icon). Emoji we don't have art for stay as they are.
 * Opt a subtree out with a `data-raw` attribute. SVG text (photo strips) is handled by the code that draws it.
 */
const KEYS = Object.keys(EMOJI_ICON).sort((a, b) => b.length - a.length) // longest first: ZWJ sequences before their parts
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const SOURCE = `(?:${KEYS.map(escRe).join('|')})\\uFE0F?`
const FIND = new RegExp(SOURCE, 'gu')
const ANY = new RegExp(SOURCE, 'u')
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'OPTION', 'SELECT', 'TITLE', 'NOSCRIPT'])

const nameOf = (emoji: string) => EMOJI_ICON[emoji.replace(/️/g, '')]
export const iconUrl = (emoji: string) => `/art/icons/e/${nameOf(emoji)}.png`
export const hasIcon = (emoji: string) => !!nameOf(emoji)

/** `<img>` markup for one emoji (for code that builds HTML and wants the icon explicitly) */
export const iconHtml = (emoji: string, cls = 'ji') => (hasIcon(emoji) ? `<img class="${cls}" src="${iconUrl(emoji)}" alt="${emoji}" draggable="false">` : emoji)

function iconImg(emoji: string): HTMLImageElement {
  const i = document.createElement('img')
  i.className = 'ji'
  i.src = iconUrl(emoji)
  i.alt = emoji
  i.draggable = false
  return i
}

function iconizeText(t: Text) {
  const s = t.data
  if (!ANY.test(s)) return
  const p = t.parentElement
  if (!p || SKIP.has(p.tagName) || p.closest('svg, [data-raw], [contenteditable="true"]')) return
  const frag = document.createDocumentFragment()
  let last = 0
  for (const m of s.matchAll(FIND)) {
    const at = m.index ?? 0
    if (at > last) frag.append(s.slice(last, at))
    frag.append(iconImg(m[0]))
    last = at + m[0].length
  }
  if (last < s.length) frag.append(s.slice(last))
  // In a flex or grid box every child is laid out as its own item, so "🔗 Copy invite link" would turn into an icon
  // stacked over (or jammed against) its words. Keep the run together, the way the emoji text was laid out.
  if (/flex|grid/.test(getComputedStyle(p).display)) {
    const run = document.createElement('span')
    run.className = 'ji-run'
    run.append(frag)
    t.replaceWith(run)
  } else t.replaceWith(frag)
}

/** Swap the emoji under `node` for icons. */
export function iconize(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) return iconizeText(node as Text)
  if (!(node instanceof Element) || SKIP.has(node.tagName) || node instanceof SVGElement) return
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
  const found: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) if (ANY.test((n as Text).data)) found.push(n as Text)
  found.forEach(iconizeText)
}

/** Keep the whole page emoji-free from now on. */
export function startIconizer(root: HTMLElement = document.body) {
  iconize(root)
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') iconize(r.target)
      else r.addedNodes.forEach((n) => iconize(n))
    }
  }).observe(root, { childList: true, subtree: true, characterData: true })
}

/** An icon as a data: URL, for SVGs that get drawn onto a canvas (they can't load images from a URL). */
const dataUrls = new Map<string, Promise<string>>()
export function iconDataUrl(emoji: string): Promise<string> {
  const name = nameOf(emoji)
  if (!name) return Promise.resolve('')
  let p = dataUrls.get(name)
  if (!p) {
    p = fetch(iconUrl(emoji))
      .then((r) => r.blob())
      .then((b) => new Promise<string>((ok) => {
        const fr = new FileReader()
        fr.onload = () => ok(String(fr.result))
        fr.onerror = () => ok('')
        fr.readAsDataURL(b)
      }))
      .catch(() => '')
    dataUrls.set(name, p)
  }
  return p
}
