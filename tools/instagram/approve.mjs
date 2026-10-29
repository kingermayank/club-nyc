// Approve (or hold back) posts by plan day, then send the schedule to the bucket so the Railway job sees it.
//   node tools/instagram/approve.mjs 1-7          approve days 1 to 7 (every post on those days)
//   node tools/instagram/approve.mjs 2 5 9        approve days 2, 5 and 9
//   node tools/instagram/approve.mjs --hold 5     take day 5 back out (if it hasn't gone out yet)
//   node tools/instagram/approve.mjs --list       show what's approved
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const FILE = join(HERE, 'schedule.json')
const schedule = JSON.parse(readFileSync(FILE, 'utf8'))
const args = process.argv.slice(2)
const hold = args.includes('--hold')
const days = new Set(args.filter((a) => !a.startsWith('--')).flatMap((a) => {
  const [from, to] = a.split('-').map(Number)
  return Array.from({ length: (to || from) - from + 1 }, (_, i) => from + i)
}))

if (days.size) {
  for (const p of schedule.posts) if (days.has(p.day) && !p.manual) p.approved = !hold
  writeFileSync(FILE, JSON.stringify(schedule, null, 1) + '\n')
}
for (const p of schedule.posts.filter((p) => p.approved)) console.log(`  approved  day ${String(p.day).padStart(2)} ${p.date} ${p.time} ${p.format.padEnd(8)} ${p.title}`)
if (!schedule.posts.some((p) => p.approved)) console.log('  nothing approved yet')
// send it up, so the scheduled job uses the change
if (days.size) execFileSync(process.execPath, [join(HERE, 'sync.mjs')], { stdio: 'inherit' })
