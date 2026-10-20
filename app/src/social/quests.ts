import { sfx } from '../audio'
import { save, persist } from '../state'
import { stage, el } from '../engine/stage'
import { confetti } from '../engine/ui'
import { onRoomChange, world, guideTo } from '../engine/world'
import { api } from '../game'
import { EARN, QUEST_REWARDS, nycDay, weekStart, WELCOME_GIFTS } from '../data/economy'

/**
 * "New in Town": five first steps (a walk, the welcome gift, a friend, a job, the subway), each with a "Show me".
 * Then "Today in the City": three small challenges a day, the same three for everyone (so there's
 * always something to do together), reset at midnight New York time.
 */
interface Quest {
  id: string
  text: string
  hint: string
  done: () => boolean
}

// rewards come from QUEST_REWARDS (data/economy.ts), the same table the server pays from
const QUESTS: Quest[] = [
  { id: 'walk', text: 'Take a walk', hint: 'Click anywhere on the ground.', done: () => (save.stats.walks ?? 0) > 0 },
  { id: 'gift', text: 'Pick up your welcome gift', hint: 'Click Sal’s glowing hot dog cart in Times Square.', done: () => WELCOME_GIFTS.some((id) => save.owned.includes(id)) },
  { id: 'friend', text: 'Make a friend', hint: 'Click any New Yorker, then Add Friend.', done: () => save.friends.length > 0 },
  { id: 'job', text: 'Work a shift', hint: 'The pizzeria, the halal cart or the ferry.', done: () => Object.keys(save.stats).some((k) => k.startsWith('played:')) },
  { id: 'subway', text: 'Ride the subway', hint: 'Click the MetroCard on your toolbar.', done: () => save.stamps.includes('straphanger') },
]
const reward = (q: Quest) => QUEST_REWARDS[q.id] ?? 0

// ---------- Today in the City ----------
type Metric = 'shifts' | 'earned' | 'places' | 'chats' | 'jams' | 'snacks' | 'photos' | 'buys' | 'signs' | 'shares' | 'rides' | 'mobs'
interface Daily {
  id: string
  text: string
  hint: string
  metric: Metric
  target: number
}
const DAILY: Daily[] = [
  { id: 'shifts', text: 'Work 2 shifts', hint: 'Any job counts: pizza, halal, bagels, the ferry, the subway show.', metric: 'shifts', target: 2 },
  { id: 'earn', text: 'Earn 100 coins', hint: 'Jobs, quests, Dance Jam tips: it all adds up.', metric: 'earned', target: 100 },
  { id: 'places', text: 'Visit 4 different places', hint: 'Hop on the subway or click a taxi.', metric: 'places', target: 4 },
  { id: 'chat', text: 'Say hi in chat 3 times', hint: 'Press Enter, type, Enter. Be a good neighbor!', metric: 'chats', target: 3 },
  { id: 'jam', text: 'Dance at the Dance Jam', hint: 'Times Square, every 8 minutes. Get on the floor and press D.', metric: 'jams', target: 1 },
  { id: 'snacks', text: 'Grab 2 NYC snacks', hint: 'Hot dogs, pretzels, slices, boba. A balanced diet.', metric: 'snacks', target: 2 },
  { id: 'photo', text: 'Take a group photo', hint: 'Open your phone (toolbar) or press B. Everyone nearby squeezes in.', metric: 'photos', target: 1 },
  { id: 'shop', text: 'Buy something new to wear', hint: 'THREAD in SoHo, I ♥ NY in Times Square, or Fifth Avenue if you’re feeling fancy.', metric: 'buys', target: 1 },
  { id: 'sign', text: 'Sign a guestbook', hint: 'Visit someone’s apartment and leave a note. Compliment the square footage.', metric: 'signs', target: 1 },
  { id: 'share', text: 'Share your invite link', hint: 'Phone → Invite friends. They land right next to you.', metric: 'shares', target: 1 },
  { id: 'rides', text: 'Ride the subway twice', hint: 'Click the MetroCard on your toolbar.', metric: 'rides', target: 2 },
  { id: 'mob', text: 'Start or join a flash mob', hint: 'Press D near other New Yorkers.', metric: 'mobs', target: 1 },
]
const DAILY_BY_ID = Object.fromEntries(DAILY.map((d) => [d.id, d]))
const DAILY_REWARD = EARN['daily-quest'].amount
const DAILY_BONUS = EARN['daily-quests-done'].amount

/** the same three for everyone today */
function picksFor(day: string): string[] {
  let h = 2166136261
  for (const ch of day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  const pool = [...DAILY]
  const out: string[] = []
  while (out.length < 3 && pool.length) {
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    out.push(pool.splice((h >>> 0) % pool.length, 1)[0].id)
  }
  return out
}

function metricNow(m: Metric): number {
  if (m === 'places') return save.daily.places.length
  if (m === 'shifts') return Object.entries(save.stats).reduce((n, [k, v]) => (k.startsWith('played:') ? n + v : n), 0)
  return save.stats[m] ?? 0
}

/** a new day: new challenges, fresh baselines */
function rollDay() {
  const day = nycDay()
  if (save.daily.day === day) return
  const base: Record<string, number> = {}
  for (const d of DAILY) if (d.metric !== 'places') base[d.metric] = metricNow(d.metric)
  save.daily = { day, picks: picksFor(day), base, places: [world.room.id], done: [], bonus: false }
  persist()
}

const progress = (d: Daily) => Math.max(0, Math.min(d.target, metricNow(d.metric) - (d.metric === 'places' ? 0 : save.daily.base[d.metric] ?? 0)))

function msToMidnightNyc(): number {
  const now = new Date()
  const nyc = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }))
  const next = new Date(nyc)
  next.setHours(24, 0, 0, 0)
  return next.getTime() - nyc.getTime()
}

// ---------- the HUD box ----------
const box = el('div', 'quests')
let open = false

function current() {
  return QUESTS.find((q) => !save.quests[q.id])
}

function render() {
  const q = current()
  if (q) return renderStarter(q)
  renderDaily()
}

function renderStarter(q: Quest) {
  const doneCount = QUESTS.filter((x) => save.quests[x.id]).length
  box.className = 'quests'
  box.innerHTML = `<button class="q-head"><b>New in Town</b><span>${doneCount}/${QUESTS.length}</span><i>${open ? '▴' : '▾'}</i></button>
    <div class="q-now"><span class="q-dot"></span><div class="q-text"><b>${q.text}</b><small>${q.hint}</small><button class="q-show">Show me</button></div><em>+${reward(q)}</em></div>
    ${open ? `<ul class="q-list">${QUESTS.map((x) => `<li class="${save.quests[x.id] ? 'done' : x === q ? 'now' : ''}">${save.quests[x.id] ? '✓' : '○'} ${x.text}</li>`).join('')}</ul>` : ''}`
  bindHead()
  box.querySelector<HTMLButtonElement>('.q-show')!.onclick = (e) => {
    e.stopPropagation()
    sfx.click()
    void showMe(q.id)
  }
}

/** "Show me": Rosa points at the thing to do (or offers to take you where it is). */
async function showMe(id: string) {
  const t = await import('../features/tour')
  const map = t.toolbarButton('Map')
  const take = (room: string, label: string) => ({ label, act: () => api.goto(room) })
  const here = (re: RegExp) => (t.hotspot(re)() ? t.hotspot(re) : null)
  switch (id) {
    case 'walk':
      return t.pointAtWalk('Take a walk', 'Click anywhere on the ground and your New Yorker walks there. Try the glowing spot!')
    case 'gift':
      if (world.room.id === 'times-square') {
        guideTo('hotdog')
        return t.pointAt(t.hotspot(/hot dog/i), 'Your welcome gift', 'Sal at the hot dog cart has a free gift for every new New Yorker. Click the cart!')
      }
      return t.pointAt(map, 'Your welcome gift', 'Sal’s hot dog cart is in Times Square.', { label: 'Take me there', act: () => {
        api.goto('times-square')
        setTimeout(() => guideTo('hotdog'), 1100)
      } })
    case 'friend': {
      const p = world.player.pos
      const people = [...stage.scene.querySelectorAll<HTMLElement>('.actor:not(.is-player)')]
      const near = people.sort((a, b) => dist(a, p) - dist(b, p))[0]
      if (near) return t.pointAt(() => near.querySelector('svg'), 'Make a friend', 'Click someone to open their card, then press Add Friend. A wave (W) first never hurts!')
      return t.pointAt(t.toolbarButton('Friends & leaderboards'), 'Make a friend', 'Nobody’s here right now. Times Square is the busiest place in the city.', take('times-square', 'Take me to Times Square'))
    }
    case 'subway':
      return t.pointAt(t.toolbarButton('Subway'), 'Ride the subway', 'Click your MetroCard and pick any stop.')
    case 'job': {
      const h = here(/halal bros|order a slice|order counter|board the train|ferry tickets|board the ferry/i)
      if (h) return t.pointAt(h, 'Work a shift', 'Click it and choose “Work a shift”. Every job has a weekly leaderboard.')
      return t.pointAt(map, 'Work a shift', 'Jobs: 99¢ Slice in Little Italy, the Halal Bros cart on Fifth Avenue, Bean There café in SoHo, the ferry at Battery Park and Showtime in the subway.', take('pizza', 'Take me to 99¢ Slice'))
    }
  }
}
const dist = (e: HTMLElement, p: number[]) => {
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(e.style.transform)
  return m ? Math.hypot(Number(m[1]) - p[0], Number(m[2]) - p[1]) : 1e9
}

/** 📅 days you've dropped by this week (the daily refill grows with it) */
function weekChip() {
  const w = save.week
  return w?.start === weekStart(nycDay()) && w.days >= 2 ? `<em class="q-week" title="You’ve dropped by ${w.days} of 7 days this week">📅 ${w.days}/7</em>` : ''
}

function renderDaily() {
  rollDay()
  const picks = save.daily.picks.map((id) => DAILY_BY_ID[id]).filter(Boolean)
  const done = save.daily.done.length
  const hrs = Math.max(1, Math.round(msToMidnightNyc() / 3600_000))
  box.className = 'quests daily' + (done === picks.length ? ' all-done' : '')
  const next = picks.find((d) => !save.daily.done.includes(d.id))
  box.innerHTML = `<button class="q-head"><b>Today in the City</b>${weekChip()}<span>${done}/${picks.length}</span><i>${open ? '▴' : '▾'}</i></button>
    ${
      next && !open
        ? `<div class="q-now"><span class="q-dot"></span><div><b>${next.text}</b><small>${progress(next)}/${next.target} · ${next.hint}</small></div><em>+${DAILY_REWARD}</em></div>`
        : ''
    }
    ${
      open || !next
        ? `<ul class="q-list daily-list">${picks
            .map((d) => {
              const p = progress(d)
              const ok = save.daily.done.includes(d.id)
              return `<li class="${ok ? 'done' : ''}"><span>${ok ? '✓' : '○'} ${d.text}</span><i style="--p:${(p / d.target) * 100}%"></i><small>${ok ? `+${DAILY_REWARD}` : `${p}/${d.target}`}</small></li>`
            })
            .join('')}</ul>
          <small class="q-reset">${done === picks.length ? `All done! +${DAILY_BONUS} bonus · ` : `Finish all 3 for +${DAILY_BONUS} bonus · `}new challenges in ~${hrs}h</small>`
        : ''
    }`
  bindHead()
}

function bindHead() {
  box.querySelector<HTMLButtonElement>('.q-head')!.onclick = (e) => {
    e.stopPropagation()
    open = !open
    sfx.click()
    render()
  }
}

function bumpBox() {
  render()
  box.classList.remove('bump')
  void box.offsetWidth
  box.classList.add('bump')
}

function check() {
  if (!save.created) return
  let changed = false
  for (const q of QUESTS) {
    if (save.quests[q.id] || !q.done()) continue
    save.quests[q.id] = Date.now()
    changed = true
    persist()
    sfx.stamp()
    api.earn(reward(q), `✓ ${q.text}`, 'quest', q.id)
  }
  // the list is done (just now, or by someone who'd finished these five before the list was shortened): Rosa closes
  // the first-day story, once (the Local stamp marks it)
  if (!current() && !save.stamps.includes('local')) {
    changed = true
    confetti(100)
    void import('../features/tour').then((t) =>
      t.pointAt(undefined, 'You’re officially a New Yorker!', 'That’s your first-day list done, so you’re allowed to complain about the subway now. Here’s an Everything Bagel bean bag for your place 🥯 From now on there are three new challenges every day, the same for everyone in the city.'),
    )
    save.storage.push('bagel-bag')
    persist()
    api.stamp('local')
    rollDay()
  }
  if (changed) return bumpBox()
  if (current()) return
  // Today in the City
  if (save.daily.day !== nycDay()) {
    rollDay()
    return bumpBox()
  }
  let dailyChanged = false
  for (const id of save.daily.picks) {
    const d = DAILY_BY_ID[id]
    if (!d || save.daily.done.includes(id) || progress(d) < d.target) continue
    save.daily.done.push(id)
    persist()
    dailyChanged = true
    sfx.stamp()
    api.earn(DAILY_REWARD, `✓ ${d.text}`, 'daily-quest', id)
  }
  if (!dailyChanged) return
  if (save.daily.done.length === save.daily.picks.length && !save.daily.bonus) {
    save.daily.bonus = true
    persist()
    confetti(70)
    setTimeout(() => api.earn(DAILY_BONUS, 'All of today’s challenges done. Overachiever.', 'daily-quests-done'), 900)
  }
  bumpBox()
}

export function startQuests() {
  stage.hud.append(box)
  if (!current()) rollDay()
  render()
  setInterval(check, 1500)
  // "visit 4 places" counts distinct rooms today
  onRoomChange(() => {
    if (save.daily.day !== nycDay() || save.daily.places.includes(world.room.id)) return
    save.daily.places.push(world.room.id)
    persist()
  })
}
