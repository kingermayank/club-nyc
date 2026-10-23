/**
 * A small Markdown renderer for the Help Center (no dependencies). It covers what the help pages use:
 *
 *   ## Heading {#custom-id}         headings get ids (deep links) and feed "On This Page"
 *   paragraphs, **bold**, *italic*, `code`, [links](other-page.md#section), ![inline](src)
 *   - lists / 1. numbered lists      nested by indenting two spaces
 *   | tables | with | a header |     GitHub style, with :--: alignment
 *   ![alt](src "Caption")            alone on a line: a figure with a caption
 *   > [!TIP] Optional Title          callouts: NOTE, TIP, WARNING, IMPORTANT, NYC (a little local color)
 *   :::cards / :::steps / :::details Summary {#id}  ...  :::
 *   [[Esc]]  keyboard keys      {icon:pizza}  an illustrated emoji      {tb:map}  a toolbar button icon
 *
 * Besides the HTML it returns the page's headings (for the table of contents) and its text split into sections
 * (for search), so every result can deep-link to the right heading.
 */

export interface Heading {
  level: 2 | 3
  id: string
  text: string
}
/** One searchable chunk of a page: the text under a heading (or an expandable answer), plain. */
export interface Section {
  id: string
  heading: string
  text: string
}
export interface RenderOptions {
  /** rewrites a link target (e.g. "jobs/halal-rush.md#pay" → "/help/jobs/halal-rush#pay"); return null to keep it */
  link?: (href: string) => string | null
  /** the pixel size of a picture, so figures reserve their space before they load */
  imageSize?: (src: string) => [number, number] | null
}
export interface RenderResult {
  html: string
  headings: Heading[]
  sections: Section[]
}

const CALLOUTS: Record<string, { cls: string; title: string; icon: string }> = {
  NOTE: { cls: 'note', title: 'Good to Know', icon: 'idea' },
  TIP: { cls: 'tip', title: 'Tip', icon: 'sparkles' },
  WARNING: { cls: 'warn', title: 'Heads Up', icon: 'megaphone' },
  IMPORTANT: { cls: 'danger', title: 'Important', icon: 'lock' },
  NYC: { cls: 'nyc', title: 'Local Knowledge', icon: 'pigeon' },
}

export const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const escapeAttr = escapeHtml

/** "Where’s My Coffee? (Bean There)" → "wheres-my-coffee-bean-there" */
export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/['’‘`]/g, '')
      .replace(/&[a-z]+;/g, ' ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section'
  )
}

/** HTML → the words a reader sees (for search and the table of contents) */
export function plainText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<img[^>]*\balt="([^"]*)"[^>]*>/gi, ' $1 ')
    // inline tags join their words ("<b>bold</b>," stays "bold,"); block tags separate them
    .replace(/<\/?(a|b|strong|i|em|code|kbd|span|small|sup|sub|mark|abbr|s|u|time|wbr)\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/\s+/g, ' ')
    .trim()
}

/** Straight quotes → curly ones, the way the game writes them (it’s, “Showtime!”). Text only, never markup. */
function smartQuotes(s: string): string {
  return s
    .replace(/(^|[\s([{\u2014-])"(?=\S)/g, '$1“')
    .replace(/"/g, '”')
    .replace(/(^|[\s([{-])'(?=[A-Za-z0-9])/g, (m, pre: string, offset: number, all: string) => {
      // a leading apostrophe on a known contraction stays an apostrophe ('90s, 'cause)
      const rest = all.slice(offset + m.length, offset + m.length + 6)
      return pre + (/^(\d0s|cause|em\b|til\b|n\b)/i.test(rest) ? '’' : '‘')
    })
    .replace(/'/g, '’')
}

const INLINE_TAGS = 'kbd|br|b|i|em|strong|span|small|sup|sub|mark|abbr|wbr|s|u|time'

/** Inline Markdown → HTML. */
function inline(src: string, opts: RenderOptions): string {
  const keep: string[] = []
  const hold = (html: string) => `\u0000${keep.push(html) - 1}\u0000`
  let s = src
  // code spans first: nothing inside them is markup
  s = s.replace(/`([^`]+)`/g, (_, code: string) => hold(`<code>${escapeHtml(code)}</code>`))
  // keys: [[Ctrl]] + [[K]]
  s = s.replace(/\[\[([^\]]{1,24})\]\]/g, (_, k: string) => hold(`<kbd${/^[^A-Za-z0-9]$/.test(k) ? ' class="sym"' : ''}>${escapeHtml(k)}</kbd>`))
  // illustrated emoji and toolbar icons
  s = s.replace(/\{icon:([a-z0-9-]+)\}/g, (_, n: string) => hold(`<img class="ji" src="/art/icons/e/${n}.png" alt="" width="20" height="20" loading="lazy" decoding="async">`))
  s = s.replace(/\{tb:([a-z0-9-]+)\}/g, (_, n: string) => hold(`<img class="tbi" src="/art/icons/${n}.png" alt="" width="28" height="28" loading="lazy" decoding="async">`))
  // inline pictures, then links (a picture can sit inside a link)
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt: string, src: string) => hold(`<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" loading="lazy" decoding="async">`))
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text: string, href: string) => {
    const to = opts.link?.(href) ?? href
    const external = /^https?:\/\//.test(to)
    return hold(`<a href="${escapeAttr(to)}"${external ? ' target="_blank" rel="noopener"' : ''}>`) + text + hold('</a>')
  })
  // a few inline HTML tags are allowed as they are (<kbd>, <br>, <span class="…">…)
  s = s.replace(new RegExp(`</?(?:${INLINE_TAGS})(?:\\s[^<>]*)?/?>`, 'gi'), (tag) => hold(tag))
  // entities stay entities
  s = s.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (e) => hold(e))
  // text: escape what HTML needs (quotes stay quotes, so they can curl)
  s = s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)
  s = smartQuotes(s)
  // emphasis
  s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^\w*])\*(?=\S)([^*]*?\S)\*(?!\w)/g, '$1<em>$2</em>')
  s = s.replace(/(^|[^\w])_(?=\S)([^_]*?\S)_(?!\w)/g, '$1<em>$2</em>')
  // hard line breaks: a trailing backslash
  s = s.replace(/\\\n/g, '<br>').replace(/\n/g, ' ')
  // put the held pieces back (they can nest: a link around an image)
  for (let i = 0; i < 4 && s.includes('\u0000'); i++) s = s.replace(/\u0000(\d+)\u0000/g, (_, n: string) => keep[+n])
  return s
}

/** Parse "{#id .class width=600}" attribute suffixes. */
function attrs(spec: string | undefined): { id?: string; cls: string[]; kv: Record<string, string> } {
  const out = { id: undefined as string | undefined, cls: [] as string[], kv: {} as Record<string, string> }
  if (!spec) return out
  for (const part of spec.replace(/^\{|\}$/g, '').trim().split(/\s+/)) {
    if (part.startsWith('#')) out.id = part.slice(1)
    else if (part.startsWith('.')) out.cls.push(part.slice(1))
    else if (part.includes('=')) {
      const [k, v] = part.split('=')
      out.kv[k] = v.replace(/^"|"$/g, '')
    }
  }
  return out
}

const indentOf = (line: string) => line.match(/^ */)![0].length
const isBlank = (line: string) => !line.trim()
const LIST_RE = /^( *)([-*+]|\d{1,3}[.)])\s+(.*)$/
const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
const HTML_BLOCK_RE = /^<\/?(div|details|summary|figure|figcaption|table|thead|tbody|tr|td|th|section|aside|p|ul|ol|li|dl|dt|dd|nav|picture|video|iframe|h[1-6]|hr|blockquote|pre|img|a)\b/i

class Renderer {
  headings: Heading[] = []
  sections: Section[] = []
  private ids = new Set<string>()
  /** the sections being written to (an expandable answer is its own section, inside its heading's) */
  private stack: Section[] = []
  private opts: RenderOptions
  constructor(opts: RenderOptions) {
    this.opts = opts
    this.open({ id: '', heading: '', text: '' })
  }

  uniqueId(base: string): string {
    let id = base
    for (let n = 2; this.ids.has(id); n++) id = `${base}-${n}`
    this.ids.add(id)
    return id
  }
  private open(s: Section) {
    this.sections.push(s)
    this.stack.push(s)
  }
  /** text a reader sees, for search */
  private note(html: string) {
    const t = plainText(html)
    if (!t) return
    const cur = this.stack[this.stack.length - 1]
    cur.text += (cur.text ? ' ' : '') + t
  }

  render(src: string): string {
    return this.blocks(src.replace(/\r\n?/g, '\n').split('\n'))
  }

  blocks(lines: string[]): string {
    const out: string[] = []
    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      if (isBlank(line)) {
        i++
        continue
      }
      // ::: containers
      const box = /^:::\s*([a-z]+)\s*(.*)$/.exec(line.trim())
      if (box) {
        let depth = 1
        let j = i + 1
        for (; j < lines.length; j++) {
          const t = lines[j].trim()
          if (/^:::\s*[a-z]/.test(t)) depth++
          else if (t === ':::' && --depth === 0) break
        }
        out.push(this.container(box[1], box[2], lines.slice(i + 1, j)))
        i = j + 1
        continue
      }
      // fenced code
      if (/^```/.test(line.trim())) {
        let j = i + 1
        while (j < lines.length && !/^```/.test(lines[j].trim())) j++
        const html = `<pre><code>${escapeHtml(lines.slice(i + 1, j).join('\n'))}</code></pre>`
        this.note(html)
        out.push(html)
        i = j + 1
        continue
      }
      // headings
      const h = /^(#{1,4})\s+(.*?)\s*(\{[^}]*\})?\s*$/.exec(line)
      if (h) {
        out.push(this.heading(h[1].length, h[2], h[3]))
        i++
        continue
      }
      // rule
      if (/^(-{3,}|\*{3,})\s*$/.test(line.trim())) {
        out.push('<hr>')
        i++
        continue
      }
      // callouts and quotes
      if (/^\s*>/.test(line)) {
        const body: string[] = []
        while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*> ?/, ''))
        out.push(this.quote(body))
        continue
      }
      // tables
      if (line.includes('|') && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
        const rows: string[] = []
        while (i < lines.length && lines[i].includes('|') && !isBlank(lines[i])) rows.push(lines[i++])
        out.push(this.table(rows))
        continue
      }
      // lists
      if (LIST_RE.test(line)) {
        const [html, next] = this.list(lines, i)
        out.push(html)
        i = next
        continue
      }
      // a picture on its own line: a figure
      const fig = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*(\{[^}]*\})?\s*$/.exec(line.trim())
      if (fig) {
        out.push(this.figure(fig[1], fig[2], fig[3], fig[4]))
        i++
        continue
      }
      // raw HTML blocks pass through to the next blank line
      if (HTML_BLOCK_RE.test(line.trim())) {
        const body: string[] = []
        while (i < lines.length && !isBlank(lines[i])) body.push(lines[i++])
        const html = body.join('\n')
        this.note(html)
        out.push(html)
        continue
      }
      // a paragraph runs until a blank line or another block starts
      const para: string[] = []
      while (
        i < lines.length &&
        !isBlank(lines[i]) &&
        !(para.length && (/^(#{1,4})\s/.test(lines[i]) || /^\s*>/.test(lines[i]) || LIST_RE.test(lines[i]) || /^:::/.test(lines[i].trim())))
      )
        para.push(lines[i++].trim())
      const html = `<p>${inline(para.join('\n'), this.opts)}</p>`
      this.note(html)
      out.push(html)
    }
    return out.join('\n')
  }

  heading(level: number, raw: string, spec?: string): string {
    const a = attrs(spec)
    const html = inline(raw, this.opts)
    const text = plainText(html)
    const lv = Math.min(Math.max(level, 2), 4)
    const id = this.uniqueId(a.id ?? slugify(text))
    if (lv <= 3) {
      this.headings.push({ level: lv as 2 | 3, id, text })
      // a new heading starts a new search section (closing any open ones at this depth)
      this.stack.length = 1
      this.open({ id, heading: text, text: '' })
    }
    const cls = a.cls.length ? ` class="${a.cls.join(' ')}"` : ''
    return `<h${lv} id="${id}"${cls}><a class="anchor" href="#${id}" aria-label="Link to this section"></a>${html}</h${lv}>`
  }

  quote(body: string[]): string {
    const first = /^\[!([A-Z]+)\]\s*(.*)$/.exec(body[0]?.trim() ?? '')
    if (first && CALLOUTS[first[1]]) {
      const c = CALLOUTS[first[1]]
      const title = first[2] ? inline(first[2], this.opts) : c.title
      this.note(title)
      const inner = this.blocks(body.slice(1))
      return `<aside class="callout ${c.cls}"><p class="callout-title"><img class="ji" src="/art/icons/e/${c.icon}.png" alt="" width="20" height="20">${title}</p>${inner}</aside>`
    }
    return `<blockquote>${this.blocks(body)}</blockquote>`
  }

  table(rows: string[]): string {
    const cells = (row: string) => {
      const t = row.trim().replace(/^\||\|$/g, '')
      // split on pipes that aren't escaped or inside `code`
      const out: string[] = []
      let cur = ''
      let code = false
      for (let k = 0; k < t.length; k++) {
        const ch = t[k]
        if (ch === '`') code = !code
        if (ch === '\\' && t[k + 1] === '|') {
          cur += '|'
          k++
          continue
        }
        if (ch === '|' && !code) {
          out.push(cur.trim())
          cur = ''
        } else cur += ch
      }
      out.push(cur.trim())
      return out
    }
    const head = cells(rows[0])
    const align = cells(rows[1]).map((c) => (c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : ''))
    const al = (k: number) => (align[k] ? ` style="text-align:${align[k]}"` : '')
    const th = head.map((c, k) => `<th scope="col"${al(k)}>${inline(c, this.opts)}</th>`).join('')
    const body = rows
      .slice(2)
      .map((r) => `<tr>${cells(r).map((c, k) => `<td${al(k)}>${inline(c, this.opts)}</td>`).join('')}</tr>`)
      .join('\n')
    const html = `<div class="table-wrap"><table><thead><tr>${th}</tr></thead><tbody>\n${body}\n</tbody></table></div>`
    // for search, each row reads as one phrase ("Pizza Pro · Make 15 pizzas in one shift.") rather than a run of cells
    this.note(
      rows
        .slice(2)
        .map((r) => cells(r).map((c) => plainText(inline(c, this.opts))).filter(Boolean).join(' · '))
        .map((t) => (/[.!?…]$/.test(t) ? t : t + '.'))
        .join(' '),
    )
    return html
  }

  /** a list starting at line i, with everything nested under it; returns [html, next line] */
  list(lines: string[], i: number): [string, number] {
    const first = LIST_RE.exec(lines[i])!
    const base = first[1].length
    const ordered = /\d/.test(first[2])
    const items: string[][] = []
    let j = i
    while (j < lines.length) {
      const line = lines[j]
      const m = LIST_RE.exec(line)
      if (m && m[1].length === base && /\d/.test(m[2]) === ordered) {
        items.push([m[3]])
        j++
        continue
      }
      if (isBlank(line)) {
        // a blank line continues the list only if more of it (indented, or the next item) follows
        let k = j + 1
        while (k < lines.length && isBlank(lines[k])) k++
        const nxt = lines[k]
        const nm = nxt !== undefined ? LIST_RE.exec(nxt) : null
        if (nxt !== undefined && (indentOf(nxt) > base || (nm && nm[1].length === base && /\d/.test(nm[2]) === ordered))) {
          items[items.length - 1].push('')
          j++
          continue
        }
        break
      }
      if (indentOf(line) > base) {
        items[items.length - 1].push(line.slice(Math.min(indentOf(line), base + 2)))
        j++
        continue
      }
      // a lazy continuation of the item's text
      if (!LIST_RE.test(line) && !/^(#{1,4})\s/.test(line) && !/^\s*>/.test(line) && !/^:::/.test(line.trim())) {
        items[items.length - 1][items[items.length - 1].length - 1] += '\n' + line.trim()
        j++
        continue
      }
      break
    }
    const start = ordered ? parseInt(first[2], 10) : 1
    const lis = items.map((body) => {
      const nested = body.slice(1).some((l) => LIST_RE.test(l) || isBlank(l))
      if (!nested) {
        const html = inline(body.join('\n'), this.opts)
        this.note(html)
        return `<li>${html}</li>`
      }
      // the item's first paragraph stays inline when it's a tight list; nested blocks render as blocks
      const firstPara: string[] = [body[0]]
      let k = 1
      while (k < body.length && !isBlank(body[k]) && !LIST_RE.test(body[k])) firstPara.push(body[k++].trim())
      const head = inline(firstPara.join('\n'), this.opts)
      this.note(head)
      return `<li>${head}${this.blocks(body.slice(k))}</li>`
    })
    const tag = ordered ? 'ol' : 'ul'
    return [`<${tag}${ordered && start !== 1 ? ` start="${start}"` : ''}>\n${lis.join('\n')}\n</${tag}>`, j]
  }

  figure(alt: string, src: string, caption: string | undefined, spec: string | undefined): string {
    const a = attrs(spec)
    const size = this.opts.imageSize?.(src)
    const wh = size ? ` width="${size[0]}" height="${size[1]}"` : ''
    const cls = ['shot', ...a.cls].join(' ')
    const max = a.kv.width ? ` style="max-width:${parseInt(a.kv.width, 10)}px"` : ''
    const cap = caption ? `<figcaption>${inline(caption, this.opts)}</figcaption>` : ''
    if (caption) this.note(cap)
    return `<figure class="${cls}"${max}${a.id ? ` id="${a.id}"` : ''}><img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}"${wh} loading="lazy" decoding="async">${cap}</figure>`
  }

  container(kind: string, args: string, body: string[]): string {
    if (kind === 'details') {
      const m = /^(.*?)\s*(\{[^}]*\})?$/.exec(args)!
      const a = attrs(m[2])
      const summary = inline(m[1], this.opts)
      const text = plainText(summary)
      const id = this.uniqueId(a.id ?? slugify(text))
      // an answer is its own search result (it opens when someone lands on it)
      const parent = this.stack.length
      this.open({ id, heading: text, text: '' })
      const inner = this.blocks(body)
      this.stack.length = parent
      return `<details class="qa" id="${id}"><summary>${summary}</summary><div class="qa-body">${inner}</div></details>`
    }
    if (kind === 'cards') {
      const cards = body
        .filter((l) => LIST_RE.test(l))
        .map((l) => {
          const m = /^\s*[-*+]\s+\[([^\]]+)\]\(([^)\s]+)\)\s*(\{(?:icon|img):[^}]+\})?\s*(.*)$/.exec(l)
          if (!m) return ''
          const href = this.opts.link?.(m[2]) ?? m[2]
          const media = m[3] ?? ''
          const icon = /^\{icon:([a-z0-9-]+)\}$/.exec(media)
          const img = /^\{img:([^}]+)\}$/.exec(media)
          const size = img ? this.opts.imageSize?.(img[1]) : null
          const art = icon
            ? `<img class="card-icon" src="/art/icons/e/${icon[1]}.png" alt="" width="40" height="40" loading="lazy" decoding="async">`
            : img
              ? `<img class="card-img" src="${escapeAttr(img[1])}" alt=""${size ? ` width="${size[0]}" height="${size[1]}"` : ''} loading="lazy" decoding="async">`
              : ''
          const title = inline(m[1], this.opts)
          const text = m[4] ? `<span class="card-text">${inline(m[4], this.opts)}</span>` : ''
          this.note(`${title} ${text}`)
          return `<a class="card${img ? ' has-img' : ''}" href="${escapeAttr(href)}">${art}<span class="card-body"><span class="card-title">${title}</span>${text}</span></a>`
        })
      return `<div class="cards">${cards.join('')}</div>`
    }
    // steps, columns and any other box: a styled wrapper around ordinary blocks
    const a = attrs(/\{[^}]*\}/.exec(args)?.[0])
    return `<div class="${[kind, ...a.cls].join(' ')}">${this.blocks(body)}</div>`
  }
}

export function renderMarkdown(src: string, opts: RenderOptions = {}): RenderResult {
  const r = new Renderer(opts)
  const html = r.render(src)
  return { html, headings: r.headings, sections: r.sections.filter((s) => s.text || s.heading) }
}

/** "---\ntitle: X\n---\nbody" → [{ title: 'X' }, 'body'] (one level of plain key: value pairs) */
export function frontMatter(src: string): [Record<string, string>, string] {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(src.replace(/\r\n?/g, '\n'))
  if (!m) return [{}, src]
  const data: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line)
    if (kv) data[kv[1]] = kv[2].trim().replace(/^"(.*)"$/, '$1')
  }
  return [data, src.slice(m[0].length)]
}
