/**
 * Full-text search over the Help Center, in the browser. The index (built with the site: one entry per page, its
 * text split by heading) is a few dozen KB; every keystroke searches all of it.
 *
 *  - every word you type must appear (in the page title, the heading or the text under it); the last word can be
 *    half-typed ("danc" finds Dance Jam)
 *  - plurals and -ing forms count ("coins" finds "coin", "decorating" finds "decorate")
 *  - Club Penguin words and everyday ones find the game's own ("igloo" → apartment, "money" → coins)
 *  - a word that matches nothing is tried with one typo fixed ("apartmnet")
 * Results are grouped by page, best first, each with the sections that matched and a snippet with the words marked.
 */

export interface IndexData {
  v: 1
  pages: { u: string; t: string; g: string; d: string; i: string; s: [string, string, string][] }[]
}

interface Norm {
  /** lowercase, accents and apostrophes gone, everything else between words a single space */
  s: string
  /** for each character of s, where it came from in the original (to mark matches in the real text) */
  map: number[]
}

function normalize(text: string): Norm {
  let s = ''
  const map: number[] = []
  let space = true
  for (let i = 0; i < text.length; i++) {
    let c = text[i]
    if (c === '’' || c === "'" || c === '‘') continue
    c = c.toLowerCase().normalize('NFKD')[0] ?? ''
    if ((c >= 'a' && c <= 'z') || (c >= '0' && c <= '9')) {
      s += c
      map.push(i)
      space = false
    } else if (!space) {
      s += ' '
      map.push(i)
      space = true
    }
  }
  return { s, map }
}

/** the words people type that mean something else here */
const SYNONYMS: Record<string, string[]> = {
  igloo: ['apartment', 'home'],
  house: ['apartment', 'home'],
  room: ['place', 'apartment'],
  money: ['coins', 'coin'],
  cash: ['coins', 'coin'],
  dollars: ['coins'],
  coin: ['coins'],
  pay: ['coins', 'pay'],
  earn: ['coins', 'earn'],
  rank: ['level'],
  achievement: ['stamp'],
  achievements: ['stamps'],
  badge: ['stamp'],
  badges: ['stamps'],
  pins: ['stamps'],
  minigame: ['job', 'game'],
  minigames: ['jobs', 'games'],
  game: ['job', 'game'],
  games: ['jobs', 'games'],
  work: ['job', 'shift', 'work'],
  train: ['subway', 'train'],
  metro: ['subway'],
  cab: ['taxi'],
  emoji: ['emote'],
  emojis: ['emotes'],
  clothes: ['wardrobe', 'clothes', 'outfit'],
  outfit: ['wardrobe', 'outfit'],
  costume: ['outfit', 'costume'],
  login: ['sign'],
  logout: ['sign'],
  password: ['sign', 'password'],
  ban: ['ban', 'rules'],
  banned: ['ban', 'rules'],
  lag: ['lag', 'slow', 'troubleshooting'],
  bug: ['bug', 'troubleshooting'],
  mobile: ['phone', 'mobile'],
  ipad: ['tablet', 'phone'],
  iphone: ['phone'],
  friend: ['friends', 'friend'],
  party: ['party', 'parties'],
  dance: ['dance', 'jam'],
  mute: ['mute'],
  block: ['block'],
  report: ['report'],
  xp: ['xp', 'level'],
  experience: ['xp'],
}

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'to', 'of', 'in', 'on', 'at', 'for', 'is', 'it', 'i', 'do', 'how', 'can', 'my', 'me', 'what', 'where', 'why', 'does', 'with', 'be', 'you', 'your'])

/** "decorating" → "decorat", "parties" → "party", "coins" → "coin": a stem to prefix-match */
function stem(w: string): string {
  if (w.length < 5) return w.endsWith('s') && w.length === 4 && !w.endsWith('ss') ? w.slice(0, -1) : w
  if (w.endsWith('ies')) return w.slice(0, -3) + 'y'
  if (w.endsWith('ing')) {
    const b = w.slice(0, -3)
    return /([b-df-hj-np-tv-z])\1$/.test(b) ? b.slice(0, -1) : b
  }
  if (w.endsWith('ed')) return w.slice(0, -2)
  if (w.endsWith('es') && /(ss|sh|ch|x|z)es$/.test(w)) return w.slice(0, -2)
  if (w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

function editDistance1or2(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false
  const prev = new Array(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    let rowMin = prev[0]
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
      rowMin = Math.min(rowMin, prev[j])
    }
    if (rowMin > max) return false
  }
  return prev[b.length] <= max
}

interface Doc {
  page: number
  id: string
  heading: string
  text: string
  head: Norm
  body: Norm
}
interface PageInfo {
  url: string
  title: string
  group: string
  icon: string
  desc: string
  titleN: Norm
  descN: Norm
}

export interface SectionHit {
  url: string
  heading: string
  headingHtml: string
  snippet: string
  score: number
}
export interface PageHit {
  url: string
  title: string
  titleHtml: string
  group: string
  icon: string
  score: number
  /** the words found at the top of the page (its introduction), marked */
  snippet: string
  /** the page's headings whose sections matched */
  sections: SectionHit[]
}
export interface Results {
  pages: PageHit[]
  total: number
  /** "Showing results for …" when a word was corrected */
  corrected: string | null
}

/** where a term occurs in normalized text: start positions of words that begin with it, and whether whole */
function occurrences(n: string, term: string, limit = 8): { at: number; whole: boolean }[] {
  const out: { at: number; whole: boolean }[] = []
  let from = 0
  while (out.length < limit) {
    const k = n.indexOf(term, from)
    if (k < 0) break
    if (k === 0 || n[k - 1] === ' ') out.push({ at: k, whole: k + term.length === n.length || n[k + term.length] === ' ' })
    from = k + 1
  }
  return out
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** the original text with the matched words wrapped in <mark> */
function mark(text: string, n: Norm, terms: string[][], from = 0, to = text.length): string {
  const spans: [number, number][] = []
  for (const alts of terms)
    for (const t of alts)
      for (const o of occurrences(n.s, t, 40)) {
        const a = n.map[o.at]
        // extend to the end of the word in the original text
        let endN = o.at + t.length
        while (endN < n.s.length && n.s[endN] !== ' ') endN++
        const b = (n.map[endN - 1] ?? a) + 1
        if (a >= from && b <= to) spans.push([a, b])
      }
  spans.sort((x, y) => x[0] - y[0])
  let out = ''
  let pos = from
  for (const [a, b] of spans) {
    if (a < pos) continue
    out += esc(text.slice(pos, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>'
    pos = b
  }
  return out + esc(text.slice(pos, to))
}

export class Searcher {
  private docs: Doc[] = []
  private pages: PageInfo[] = []
  private vocab = new Map<string, number>()

  constructor(data: IndexData) {
    data.pages.forEach((p, pi) => {
      this.pages.push({ url: p.u, title: p.t, group: p.g, icon: p.i, desc: p.d, titleN: normalize(p.t), descN: normalize(p.d) })
      for (const w of normalize(`${p.t} ${p.d}`).s.split(' ')) this.count(w)
      for (const [id, heading, text] of p.s) {
        const doc: Doc = { page: pi, id, heading, text, head: normalize(heading), body: normalize(text) }
        this.docs.push(doc)
        for (const w of doc.head.s.split(' ')) this.count(w)
        for (const w of doc.body.s.split(' ')) this.count(w)
      }
    })
  }
  private count(w: string) {
    if (w.length > 2) this.vocab.set(w, (this.vocab.get(w) ?? 0) + 1)
  }

  /** the query → for each word, the forms it may match (all words must match) */
  private terms(q: string): { terms: string[][]; corrected: string | null; phrase: string } {
    const words = normalize(q).s.split(' ').filter(Boolean)
    const meaningful = words.filter((w) => !STOP.has(w))
    const use = meaningful.length ? meaningful : words
    let corrected = false
    const fixed: string[] = []
    const terms = use.map((w, k) => {
      const last = k === use.length - 1
      const alts = new Set<string>([w])
      if (w.length >= 4) alts.add(stem(w))
      for (const s of SYNONYMS[w] ?? SYNONYMS[stem(w)] ?? []) alts.add(s)
      // a finished word that's in no page might be a typo: try the closest real words
      const known = [...alts].some((a) => [...this.vocab.keys()].some((v) => v.startsWith(a)))
      if (!known && w.length >= 4) {
        const max = w.length >= 8 ? 2 : 1
        const near = [...this.vocab.entries()].filter(([v]) => editDistance1or2(w, v, max) || (last && v.length > w.length && editDistance1or2(w, v.slice(0, w.length), 1))).sort((a, b) => b[1] - a[1]).slice(0, 3)
        if (near.length) {
          for (const [v] of near) alts.add(v)
          fixed.push(near[0][0])
          corrected = true
        } else fixed.push(w)
      } else fixed.push(w)
      return [...alts].filter((a) => a.length > 1 || /\d/.test(a) || use.length === 1)
    })
    return { terms: terms.filter((t) => t.length), corrected: corrected ? fixed.join(' ') : null, phrase: use.join(' ') }
  }

  search(q: string, maxPages = 12): Results {
    const { terms, corrected, phrase } = this.terms(q)
    if (!terms.length) return { pages: [], total: 0, corrected: null }
    const best = new Map<number, { score: number; snippet: string; sections: SectionHit[] }>()
    for (const doc of this.docs) {
      const page = this.pages[doc.page]
      const intro = doc.id === ''
      let score = 0
      let ok = true
      for (const alts of terms) {
        let s = 0
        let t = 0
        for (const a of alts) {
          // the word as typed counts more than its plural, stem or synonym
          const k = a === alts[0] ? 1 : 0.7
          for (const o of occurrences(page.titleN.s, a, 2)) t = Math.max(t, (o.whole ? 30 : 20) * k)
          for (const o of occurrences(doc.head.s, a, 2)) s = Math.max(s, (o.whole ? 16 : 10) * k)
          s = Math.max(s, occurrences(doc.body.s, a, 3).reduce((n, o) => n + (o.whole ? 4 : 2), 0) * k)
          if (intro) for (const o of occurrences(page.descN.s, a, 1)) s = Math.max(s, (o.whole ? 6 : 4) * k)
        }
        if (!s && !t) {
          ok = false
          break
        }
        // a page whose title matches puts its introduction first, and lifts its other sections a little
        score += s + (intro ? t : t / 3)
      }
      if (!ok) continue
      if (terms.length > 1 && (doc.body.s.includes(phrase) || doc.head.s.includes(phrase))) score += 15
      const hit = best.get(doc.page) ?? { score: 0, snippet: '', sections: [] }
      if (intro) hit.snippet = this.snippet(doc, terms)
      else hit.sections.push({ url: `${page.url}#${doc.id}`, heading: doc.heading, headingHtml: mark(doc.heading, doc.head, terms), snippet: this.snippet(doc, terms), score })
      hit.score = Math.max(hit.score, score)
      best.set(doc.page, hit)
    }
    const pages: PageHit[] = [...best.entries()]
      .map(([pi, h]) => {
        const p = this.pages[pi]
        const sections = h.sections.sort((a, b) => b.score - a.score).slice(0, 3)
        return {
          url: p.url,
          title: p.title,
          titleHtml: mark(p.title, p.titleN, terms),
          group: p.group,
          icon: p.icon,
          // more matching sections on a page: a slightly better page
          score: h.score + Math.min(h.sections.length, 3) * 2,
          snippet: h.snippet,
          sections,
        }
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, maxPages)
    return { pages, total: pages.reduce((n, p) => n + 1 + p.sections.length, 0), corrected }
  }

  private snippet(doc: Doc, terms: string[][]): string {
    const n = doc.body
    if (!n.s) return ''
    let at = -1
    for (const alts of terms)
      for (const a of alts) {
        const o = occurrences(n.s, a, 1)[0]
        if (o && (at < 0 || o.at < at)) at = o.at
      }
    const text = doc.text
    const center = at < 0 ? 0 : n.map[at]
    let from = Math.max(0, center - 50)
    let to = Math.min(text.length, from + 150)
    if (from > 0) {
      const sp = text.indexOf(' ', from)
      from = sp > 0 && sp < center ? sp + 1 : from
    }
    if (to < text.length) {
      const sp = text.lastIndexOf(' ', to)
      to = sp > from + 40 ? sp : to
    }
    return (from > 0 ? '…' : '') + mark(text, n, terms, from, to) + (to < text.length ? '…' : '')
  }
}
