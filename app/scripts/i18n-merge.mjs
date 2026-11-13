// Folds translators' work into the tables the game loads (src/i18n/strings/<language>.json).
//   node scripts/i18n-merge.mjs <dir>     <dir>/<language>/*.json hold { "id": "translation" } for the ids of
//                                         <dir>/in/*.json ({ "id": "English line" }); <dir>/glossary-<language>.json
//                                         ({ "English": "translation" }, optional) wins over both.
// A translation is dropped (the line stays English) if it invents a "{n}" the English doesn't have.
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const dir = path.resolve(process.argv[2] ?? '../scratch/i18n')
const read = (f) => JSON.parse(fs.readFileSync(f, 'utf8'))
const en = {}
for (const f of fs.readdirSync(path.join(dir, 'in'))) Object.assign(en, read(path.join(dir, 'in', f)))
const marks = (s) => new Set(s.match(/\{\d\}/g) ?? [])

for (const lang of ['es', 'fr', 'hi', 'zh']) {
  const dest = path.join(ROOT, 'src/i18n/strings', `${lang}.json`)
  const table = fs.existsSync(dest) ? read(dest) : {}
  const from = path.join(dir, 'out', lang)
  let bad = 0, got = 0
  const take = (line, to) => {
    if (typeof to !== 'string' || !to.trim()) return
    const allowed = marks(line)
    if ([...marks(to)].some((m) => !allowed.has(m))) return void bad++
    table[line] = to.replace(/\s*—\s*/g, ', ')
    got++
  }
  if (fs.existsSync(from)) for (const f of fs.readdirSync(from).filter((f) => f.endsWith('.json'))) {
    let rows
    try { rows = read(path.join(from, f)) } catch (e) { console.log(`${lang}/${f}: not valid JSON (${e.message})`); continue }
    for (const [id, to] of Object.entries(rows)) if (en[id] !== undefined) take(en[id], to)
  }
  const g = path.join(dir, `glossary-${lang}.json`)
  if (fs.existsSync(g)) for (const [line, to] of Object.entries(read(g))) take(line, to)
  const sorted = Object.fromEntries(Object.entries(table).filter(([k, v]) => k !== v))
  fs.writeFileSync(dest, JSON.stringify(sorted, null, 0).replace(/","/g, '",\n"') + '\n')
  const all = read(path.join(ROOT, 'src/i18n/strings/en.json'))
  const missing = all.filter((l) => table[l] === undefined)
  console.log(`${lang}: ${Object.keys(sorted).length} lines in the table, ${missing.length} of ${all.length} English lines without one${bad ? `, ${bad} dropped for a made-up {n}` : ''}`)
}
