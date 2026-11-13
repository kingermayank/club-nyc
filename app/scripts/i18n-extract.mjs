// Collects every English line the game can put on the page, for translating (see src/i18n/index.ts).
//   node scripts/i18n-extract.mjs            -> src/i18n/strings/en.json  (list of lines; "{0}" marks a filled-in part)
// Reads the TypeScript in src/ (not the landing page, the dev tools or i18n itself): string literals, templates and
// "a" + b + "c" chains. HTML in a string is cut at its tags, because each piece of text between tags is its own
// piece on the page.
import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC = path.join(ROOT, 'src')
const SKIP_DIRS = new Set(['landing', 'dev', 'i18n'])
const files = []
;(function walk(d) {
  for (const f of fs.readdirSync(d, { withFileTypes: true })) {
    if (f.isDirectory()) {
      if (!(d === SRC && SKIP_DIRS.has(f.name))) walk(path.join(d, f.name))
    } else if (f.name.endsWith('.ts') && !f.name.endsWith('.d.ts')) files.push(path.join(d, f.name))
  }
})(SRC)

const PH = (n) => `\u0001${n}\u0002`
const NOT_TEXT_CALLS = new Set(['querySelector', 'querySelectorAll', 'closest', 'matches', 'add', 'remove', 'toggle', 'contains', 'getElementById', 'createElement', 'createElementNS', 'addEventListener', 'removeEventListener', 'dispatchEvent', 'getItem', 'setItem', 'removeItem', 'getAttribute', 'hasAttribute', 'removeAttribute', 'startsWith', 'endsWith', 'includes', 'indexOf', 'split', 'join', 'replace', 'replaceAll', 'match', 'test', 'has', 'get', 'delete', 'getPropertyValue', 'setProperty', 'animate', 'getContext', 'fetch', 'import', 'require', 'padStart', 'padEnd', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'Event', 'CustomEvent', 'RegExp', 'URL', 'log', 'warn', 'error', 'debug', 'info', 'Error', 'assert'])
const NOT_TEXT_PROPS = new Set(['className', 'id', 'src', 'href', 'type', 'cssText', 'rel', 'target', 'name', 'htmlFor', 'autocomplete', 'inputMode', 'role', 'key', 'kind', 'font', 'fillStyle', 'strokeStyle', 'textAlign', 'textBaseline', 'lineCap', 'lineJoin', 'filter', 'transform', 'transition', 'animation', 'background', 'display', 'position', 'cursor', 'mode', 'crossOrigin', 'loading', 'decoding'])

const out = new Map() // line -> Set(files)
const emit = (line, file) => {
  if (!out.has(line)) out.set(line, new Set())
  out.get(line).add(path.relative(SRC, file))
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', middot: '·', times: '×', rarr: '→', larr: '←' }
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e] ?? m)))

function prose(bare) {
  // bare: the line with its filled-in parts removed
  const s = bare.trim()
  if (s.length < 2 || !/\p{L}{2}/u.test(s)) return false
  if (/[{}\\]|;\s*[a-z-]+\s*:|:\s*[^;]+;\s*$|=>|\$\(|^\s*[.#@[]|rgba?\(|var\(--|\bpx\b|\d(px|ms|em|rem|vh|vw|deg|%)\b|#[0-9a-f]{6}\b|^https?:|^data:|^\/|\.(png|webp|jpg|svg|mp3|ogg|wav|json|ts|css|html)\b|^[a-z]+:[a-z]/i.test(s)) return false
  if (/^[MmLlCcZzHhVvQqAaSs0-9 .,\-]+$/.test(s)) return false // svg paths
  const toks = s.split(/\s+/)
  if (/="|\w\(|^sans-serif$|^[\w-]+-$|\s[\w-]+-(\s|$)/.test(s)) return false // attributes, css functions, half class names
  if (toks.length === 1) return /^\p{Lu}\p{Ll}+[!?.…:]*$/u.test(s) || /^\p{Lu}{2,}[!?.…]*$/u.test(s) || /^[“"‘(]?\p{Lu}\p{Ll}*[’'-]\p{L}+[!?.…”"’)]*$/u.test(s) || /^[“"‘(]?\p{Ll}+[’']\p{L}+[!?.…”"’)]*$/u.test(s)
  if (toks.every((t) => /^[a-z0-9]+([-_][a-z0-9]+)*$/.test(t)) && toks.some((t) => /[-_\d]/.test(t))) return false
  if (toks.every((t) => /^[a-z]+[A-Z]\w*$|^[a-z0-9_]+$/.test(t)) && toks.some((t) => /[A-Z_]/.test(t))) return false
  if (/^[\w-]+(\s*,\s*[\w-]+)+$/.test(s) && s === s.toLowerCase()) return false // lists of keys
  if (/^[a-z-]+(\s[\d.]+m?s)/.test(s) || /\b(ease|linear|cubic-bezier|infinite|forwards)\b/.test(s)) return false // css animations
  return true
}

function finish(raw, file) {
  // raw: text with \u0001n\u0002 marks. Cut at tags, tidy, renumber.
  const tagged = /<\/?[a-zA-Z!][^>]*>/.test(raw)
  const pieces = tagged ? raw.split(/<\/?[a-zA-Z!][^<>]*>/) : [raw]
  // words a tag carries for screen readers and tooltips
  if (tagged) for (const m of raw.matchAll(/\s(?:title|aria-label|placeholder|alt)="([^"<>]+)"/g)) pieces.push(m[1])
  for (let p of pieces) {
    if (/<[a-zA-Z/]/.test(p) || />\s*$/.test(p) && /=["']/.test(p)) continue // a tag cut in half by a filled-in part
    p = decode(p).replace(/\s+/g, ' ').trim()
    // filled-in parts and stray symbols at the ends are not part of the words
    p = p.replace(/^(?:\u0001\d+\u0002\s*)+(?=$)/, '')
    if (!p) continue
    const bare = p.replace(/\u0001\d+\u0002/g, ' ')
    if (!prose(bare)) continue
    let n = 0
    const line = p.replace(/\u0001\d+\u0002/g, () => `{${n++}}`)
    if (n > 6) continue
    emit(line, file)
  }
}

const isStr = (n) => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)
const unwrap = (n) => {
  while (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n)) n = n.expression
  return n
}
const hasStr = (n) => {
  n = unwrap(n)
  if (isStr(n) || ts.isTemplateExpression(n)) return true
  return ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken && (hasStr(n.left) || hasStr(n.right))
}

function notText(node) {
  const p = node.parent
  if (!p) return false
  if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isLiteralTypeNode(p) || ts.isExternalModuleReference(p)) return true
  if ((ts.isPropertyAssignment(p) || ts.isPropertySignature(p) || ts.isEnumMember(p)) && p.name === node) return true
  if (ts.isPropertyAssignment(p) && p.initializer === node && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name)) && p.name.text !== 'name' && NOT_TEXT_PROPS.has(p.name.text)) return true
  if (ts.isElementAccessExpression(p) && p.argumentExpression === node) return true
  if (ts.isCaseClause(p)) return true
  if (ts.isBinaryExpression(p)) {
    const k = p.operatorToken.kind
    if (k === ts.SyntaxKind.EqualsEqualsEqualsToken || k === ts.SyntaxKind.ExclamationEqualsEqualsToken || k === ts.SyntaxKind.EqualsEqualsToken || k === ts.SyntaxKind.ExclamationEqualsToken || k === ts.SyntaxKind.InKeyword) return true
    if (k === ts.SyntaxKind.EqualsToken && p.right === node && ts.isPropertyAccessExpression(p.left) && (NOT_TEXT_PROPS.has(p.left.name.text) || (ts.isPropertyAccessExpression(p.left.expression) && ['style', 'dataset'].includes(p.left.expression.name.text)))) return true
  }
  if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
    const c = p.expression
    const name = ts.isPropertyAccessExpression(c) ? c.name.text : ts.isIdentifier(c) ? c.text : c.kind === ts.SyntaxKind.ImportKeyword ? 'import' : ''
    if (NOT_TEXT_CALLS.has(name)) return true
    const at = (p.arguments ?? []).indexOf(node)
    if (name === 'el' && at < 2) return true
    if (name === 'setAttribute' && at === 0) return true
    if (name === 'setAttribute' && at === 1 && p.arguments[0] && isStr(p.arguments[0]) && !['title', 'aria-label', 'placeholder'].includes(p.arguments[0].text)) return true
  }
  return false
}

function parts(n, file, sub) {
  // the text of a string-ish expression, with marks where something is filled in; `sub` collects those to visit
  n = unwrap(n)
  if (isStr(n)) return n.text
  if (ts.isTemplateExpression(n)) {
    let s = n.head.text
    for (const span of n.templateSpans) {
      sub.push(span.expression)
      s += PH(0) + span.literal.text
    }
    return s
  }
  if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken && hasStr(n)) return parts(n.left, file, sub) + parts(n.right, file, sub)
  sub.push(n)
  return PH(0)
}

function visit(node, file) {
  if (ts.isTypeNode(node) && !ts.isExpressionWithTypeArguments(node)) return
  if (ts.isTaggedTemplateExpression(node)) return
  const n = node
  if (isStr(n) || ts.isTemplateExpression(n) || (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken && hasStr(n))) {
    const sub = []
    const raw = parts(n, file, sub)
    if (!notText(n)) finish(raw, file)
    for (const s of sub) visit(s, file)
    return
  }
  ts.forEachChild(node, (c) => visit(c, file))
}

for (const f of files) {
  const sf = ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true)
  visit(sf, f)
}

// the page around the game is plain HTML
{
  const f = path.join(ROOT, 'play.html')
  const html = fs.readFileSync(f, 'utf8').replace(/<(script|style|title)[\s\S]*?<\/\1>/g, '').replace(/<!--[\s\S]*?-->/g, '')
  const body = html.slice(html.indexOf('<body'))
  for (const m of body.matchAll(/\b(?:title|aria-label|placeholder)="([^"]+)"/g)) finish(m[1], path.join(SRC, 'play.html'))
  finish(body, path.join(SRC, 'play.html'))
}

const lines = [...out.keys()].sort((a, b) => {
  const fa = [...out.get(a)][0], fb = [...out.get(b)][0]
  return fa === fb ? 0 : fa < fb ? -1 : 1
})
const dest = process.argv[2] ?? path.join(SRC, 'i18n/strings/en.json')
fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.writeFileSync(dest, JSON.stringify(lines, null, 0).replace(/","/g, '",\n"') + '\n')
const byFile = {}
for (const l of lines) for (const f of out.get(l)) byFile[f] = (byFile[f] ?? 0) + 1
if (process.argv.includes('--stats')) console.log(Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 40).map(([f, n]) => `${n}\t${f}`).join('\n'))
console.log(`${lines.length} lines, ${lines.join('').length} characters -> ${path.relative(ROOT, dest)}`)
