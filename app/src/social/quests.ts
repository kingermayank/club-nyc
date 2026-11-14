import { sfx } from '../audio'
import { save, persist } from '../state'
import { stage, el } from '../engine/stage'
import { confetti, ui } from '../engine/ui'
import { onRoomChange, world, guideTo } from '../engine/world'
import { api } from '../game'
import { link } from '../net/link'
import { EARN, QUEST_REWARDS, nycDay, WELCOME_GIFTS } from '../data/economy'

/**
 * "New in Town": five first steps (a walk, the welcome gift, a friend, a job, the subway); "Show Me" points at the next one.
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
  { id: 'walk', text: 'Take a Walk', hint: 'Click anywhere on the ground.', done: () => (save.stats.walks ?? 0) > 0 },
  { id: 'gift', text: 'Pick Up Your Welcome Gift', hint: 'Click Sal’s glowing hot dog cart in Times Square.', done: () => WELCOME_GIFTS.some((id) => save.owned.includes(id)) },
  { id: 'friend', text: 'Make a Friend', hint: 'Click any New Yorker, then Add Friend.', done: () => save.friends.length + link.friends.size > 0 },
  { id: 'job', text: 'Work a Shift', hint: 'The pizzeria, the halal cart or the ferry.', done: () => shiftsWorked() > 0 },
  { id: 'subway', text: 'Ride the Subway', hint: 'Open the Map and pick a subway stop.', done: () => save.stamps.includes('straphanger') },
]
const reward = (q: Quest) => QUEST_REWARDS[q.id] ?? 0
/** shifts worked to the end (games/host.ts counts `played:<job>` when a run finishes; leaving early doesn't count) */
function shiftsWorked(): number {
  return Object.entries(save.stats).reduce((n, [k, v]) => (k.startsWith('played:') ? n + v : n), 0)
}

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
  { id: 'shifts', text: 'Work 2 Shifts', hint: 'Any job counts: pizza, halal, bagels, the ferry, the subway show.', metric: 'shifts', target: 2 },
  { id: 'earn', text: 'Earn 100 Coins', hint: 'Jobs, quests, Dance Jam tips: it all adds up.', metric: 'earned', target: 100 },
  { id: 'places', text: 'Visit 4 Different Places', hint: 'Hop on the subway or click a taxi.', metric: 'places', target: 4 },
  { id: 'chat', text: 'Say Hi in Chat 3 Times', hint: 'Press Enter, type, Enter. Be a good neighbor!', metric: 'chats', target: 3 },
  { id: 'jam', text: 'Dance at the Dance Jam', hint: 'Times Square, every 8 minutes. Get on the floor and press D.', metric: 'jams', target: 1 },
  { id: 'snacks', text: 'Grab 2 NYC Snacks', hint: 'Hot dogs, pretzels, slices, boba. A balanced diet.', metric: 'snacks', target: 2 },
  { id: 'photo', text: 'Take a Group Photo', hint: 'Find a photo booth (the I ♥ NY shop in Times Square has one). Everyone nearby squeezes in.', metric: 'photos', target: 1 },
  { id: 'shop', text: 'Buy Something New to Wear', hint: 'THREAD in SoHo, I ♥ NY in Times Square, or Fifth Avenue if you’re feeling fancy.', metric: 'buys', target: 1 },
  { id: 'sign', text: 'Sign a Guestbook', hint: 'Visit someone’s apartment and leave a note. Compliment the square footage.', metric: 'signs', target: 1 },
  { id: 'share', text: 'Share Your Invite Link', hint: 'Phone → Invite friends. They land right next to you.', metric: 'shares', target: 1 },
  { id: 'rides', text: 'Ride the Subway Twice', hint: 'Open the Map and pick a subway stop.', metric: 'rides', target: 2 },
  { id: 'mob', text: 'Start or Join a Flash Mob', hint: 'Press D near other New Yorkers.', metric: 'mobs', target: 1 },
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
  if (m === 'shifts') return shiftsWorked()
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


// ---------- the HUD box ----------
// Tucked away by default: a small pill with one pip per step and the count. Clicking it opens the short list;
// clicking it again, or anywhere else, puts it away (the old always-open card covered a corner of every place).
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

const pips = (done: boolean[]) => `<span class="q-pips">${done.map((d) => `<i${d ? ' class="on"' : ''}></i>`).join('')}</span>`
/** the bar: closed it's the whole pill (pips and a count), open it's the card's title */
const head = (title: string, done: boolean[]) => {
  const count = `${done.filter(Boolean).length}/${done.length}`
  return open
    ? `<button class="q-head" aria-expanded="true" aria-label="${title}: ${count}"><b>${title}</b>${pips(done)}</button>`
    : `<button class="q-head" aria-expanded="false" aria-label="${title}: ${count}" title="${title}">${pips(done)}<span>${count}</span></button>`
}

function renderStarter(q: Quest) {
  box.className = 'quests' + (open ? ' open' : '')
  box.innerHTML =
    head('New in Town', QUESTS.map((x) => !!save.quests[x.id])) +
    (open
      ? `<ul class="q-list">${QUESTS.map((x) => (x === q ? `<li class="q-now"><i></i><b>${x.text}</b><em>+${reward(x)}</em></li>` : `<li${save.quests[x.id] ? ' class="done"' : ''}><i></i><b>${x.text}</b></li>`)).join('')}</ul>
    <button class="q-show">Show Me</button>`
      : '')
  bindHead()
  const show = box.querySelector<HTMLButtonElement>('.q-show')
  if (show)
    show.onclick = (e) => {
      e.stopPropagation()
      sfx.click()
      setOpen(false)
      void showMe(q.id)
    }
}

/**
 * "Show me": Rosa points at the thing to do. If it's somewhere else, one click takes you there first and then she points
 * at it (a card saying "it's in Times Square" with a second button felt like nothing happened).
 */
async function showMe(id: string) {
  const t = await import('../features/tour')
  const here = (re: RegExp) => (t.hotspot(re)() ? t.hotspot(re) : null)
  /** go to a place and resolve once you're standing in it (and the room has drawn) */
  const arrive = async (room: string) => {
    if (world.room.id === room) return
    api.goto(room)
    for (let i = 0; i < 50 && world.room.id !== room; i++) await new Promise((ok) => setTimeout(ok, 100))
    await new Promise((ok) => setTimeout(ok, 700))
  }
  const nearestPerson = () => {
    const p = world.player.pos
    return [...stage.scene.querySelectorAll<HTMLElement>('.actor:not(.is-player)')].sort((a, b) => dist(a, p) - dist(b, p))[0]
  }
  switch (id) {
    case 'walk':
      return t.pointAtWalk('Take a Walk', 'Click anywhere on the ground and your New Yorker walks there. Try the glowing spot!')
    case 'gift':
      await arrive('times-square')
      guideTo('hotdog')
      return t.pointAt(t.hotspot(/hot dog/i), 'Your Welcome Gift', 'Sal at the hot dog cart has a free gift for every new New Yorker. Click the cart!')
    case 'friend': {
      // nobody around: Times Square is the busiest place in the city
      if (!nearestPerson()) await arrive('times-square')
      const near = nearestPerson()
      if (near) return t.pointAt(() => near.querySelector('svg'), 'Make a Friend', 'Click someone to open their card, then press Add Friend. A wave (W) first never hurts!')
      return t.pointAt(t.toolbarButton('Friends & Leaderboards'), 'Make a Friend', 'Nobody’s out right now. Your Friends list shows who’s around once they are.')
    }
    case 'subway':
      return t.pointAt(t.toolbarButton('Map'), 'Ride the Subway', 'Open the Map and click a subway stop. Pressing U works too.')
    case 'job': {
      // the things that actually start a job (at 99¢ Slice that's the oven; the counter only sells slices)
      const jobs = /^halal bros$|work a shift|order counter|ferry tickets|board the ferry/i
      if (!here(jobs)) await arrive('pizza')
      const h = here(jobs)
      if (h) return t.pointAt(h, 'Work a Shift', world.room.id === 'pizza' ? 'Click the oven.' : 'Click it, then pick the job.')
      return t.pointAt(t.toolbarButton('Map'), 'Work a Shift', 'Jobs: 99¢ Slice in Little Italy, the Halal Bros cart on Fifth Avenue, Starducks Coffee in SoHo, the ferry at Battery Park and Showtime in the subway.')
    }
  }
}
const dist = (e: HTMLElement, p: number[]) => {
  const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(e.style.transform)
  return m ? Math.hypot(Number(m[1]) - p[0], Number(m[2]) - p[1]) : 1e9
}


function renderDaily() {
  rollDay()
  const picks = save.daily.picks.map((id) => DAILY_BY_ID[id]).filter(Boolean)
  const done = save.daily.done.length
  box.className = 'quests daily' + (done === picks.length ? ' all-done' : '') + (open ? ' open' : '')
  box.innerHTML =
    head('Today in the City', picks.map((d) => save.daily.done.includes(d.id))) +
    (open
      ? `<ul class="q-list daily-list">${picks
          .map((d) => {
            const p = progress(d)
            const ok = save.daily.done.includes(d.id)
            return `<li class="${ok ? 'done' : ''}"><span>${d.text}</span><small>${ok ? '✓' : `+${DAILY_REWARD}`}</small><i style="--p:${(p / d.target) * 100}%"></i></li>`
          })
          .join('')}<li class="q-bonus${done === picks.length ? ' done' : ''}"><span>All ${picks.length}</span><small>+${DAILY_BONUS}</small></li></ul>`
      : '')
  bindHead()
}

function setOpen(v: boolean) {
  open = v
  render()
}
function bindHead() {
  box.querySelector<HTMLButtonElement>('.q-head')!.onclick = (e) => {
    e.stopPropagation()
    sfx.click()
    setOpen(!open)
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
  // the first-day story, once (the Local stamp marks it). Not over a game or a panel, though (a first shift often
  // finishes the list, and her card would sit on top of the game and take its keys): she waits until you're free.
  if (!current() && !save.stamps.includes('local') && !ui.busy && !ui.modal) {
    changed = true
    confetti(100)
    void import('../features/tour').then((t) =>
      t.pointAt(undefined, 'You’re Officially a New Yorker!', 'That’s your first-day list done, so you’re allowed to complain about the subway now. Here’s an Everything Bagel bean bag for your place 🥯 From now on there are three new challenges every day, the same for everyone in the city.'),
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
  // a click anywhere else (the ground, a panel, another button) or any key puts the list away
  window.addEventListener('pointerdown', (e) => {
    if (open && !box.contains(e.target as Node)) setOpen(false)
  })
  window.addEventListener('keydown', () => {
    if (open) setOpen(false)
  })
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
