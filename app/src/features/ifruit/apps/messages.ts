/** Messages: DMs and group chats with friends (filtered like room chat), plus city locals and Rosa. */
import { el } from '../../../engine/stage'
import { world } from '../../../engine/world'
import { ROOMS } from '../../../data/rooms'
import { placePhrase } from '../../../data/placePhrase'
import { isHomeRoom } from '../../../data/homes'
import { HttpError } from '../../../net/server'
import { face, screenEl, act, shimmer, empty, sheet, people, esc } from '../kit'
import { on, ago, isOnline, allPhotos, addPhoto } from '../store'
import { threads, messages, send, markRead, threadWith, newGroup, setViewing, type UThread, type UMsg } from '../net'
import { renderRecipe } from '../photo'
import { thenCity, roomName, type Ctx, type Screen } from '../phone'
import { tone } from '../sound'
import type { PhotoRecipe } from '../wire'

export function open(ctx: Ctx, arg?: string): Screen {
  const s = screenEl(ctx, 'Messages', { back: false, big: true, right: act('✎', () => ctx.push(compose(ctx)), 'ghost') })
  s.head.querySelector('.ifr-act')?.setAttribute('aria-label', 'New message')
  const list = el('div', 'ifm-threads', shimmer(5))
  s.body.append(list)
  const render = async () => {
    const { list: ts, error } = await threads()
    list.innerHTML = error ? '<div class="ifr-err">Can’t reach the city right now.</div>' : ''
    if (!ts.length) {
      list.append(empty('/art/ifruit/app/messages.png', 'No Messages Yet', 'Text a friend to meet up.', act('New Message', () => ctx.push(compose(ctx)), 'blue')))
      return
    }
    for (const t of ts) list.append(threadRow(ctx, t))
  }
  const off = on('threads', () => void render())
  void render()
  if (arg?.startsWith('to:')) void openWith(ctx, arg.slice(3))
  else if (arg) void threads().then(({ list: ts }) => {
    const t = ts.find((x) => x.id === arg)
    if (t) ctx.push(thread(ctx, t))
  })
  return { el: s.el, onShow: () => void render(), dispose: off }
}

async function openWith(ctx: Ctx, personId: string) {
  try {
    const id = await threadWith(personId)
    const { list } = await threads()
    const t = list.find((x) => x.id === id)
    if (t) return ctx.push(thread(ctx, t))
    // a brand-new local thread has no messages yet: make its shell
    const p = (await people()).friends.find((f) => f.id === personId)
    ctx.push(thread(ctx, { id, kind: 'local', name: p?.name ?? 'Friend', people: p ? [{ ...p, local: true }] : [], last: null, unread: 0, at: Date.now() }))
  } catch (e) {
    ctx.banner(e instanceof HttpError && e.status === 403 ? 'You can only text friends.' : 'Can’t open that chat right now.')
  }
}

function groupFace(t: UThread) {
  if (t.people.length <= 1) return face(t.people[0]?.look ?? null, t.kind !== 'group' && !!t.people[0]?.online && !t.people[0]?.local)
  return `<span class="ifm-stack">${t.people.slice(0, 2).map((p) => face(p.look)).join('')}</span>`
}
function threadRow(ctx: Ctx, t: UThread) {
  const row = el('button', 'ifr-row ifm-row' + (t.unread ? ' unread' : ''), `${groupFace(t)}<span class="ifr-txt"><b>${esc(t.name)}${t.kind === 'local' && t.id !== 'local:rosa' ? ' <span class="ifr-tag">City local</span>' : t.id === 'local:rosa' ? ' <span class="ifr-tag">Super</span>' : ''}</b><small>${t.last ? `${t.last.from === 'me' ? 'You: ' : ''}${esc(t.last.text)}` : 'Say hi!'}</small></span><em>${t.last ? ago(t.last.at) : ''}</em>${t.unread ? '<i class="ifm-unread"></i>' : ''}`)
  row.type = 'button'
  row.onclick = () => ctx.push(thread(ctx, t))
  return row
}

// ---------- one conversation ----------
function thread(ctx: Ctx, t: UThread): Screen {
  const info = t.kind === 'group' ? act('i', () => ctx.push(groupInfo(ctx, t)), 'ghost') : null
  const s = screenEl(ctx, t.name, { right: info, cls: 'ifm-thread' })
  if (t.kind !== 'group' && t.people[0]) {
    const who = el('button', 'ifm-who', face(t.people[0].look, t.people[0].online && !t.people[0].local))
    who.type = 'button'
    who.onclick = () => (t.people[0].local && t.id === 'local:rosa' ? null : ctx.open('contacts', t.people[0].id))
    s.head.insertBefore(who, s.title)
  }
  const log = el('div', 'ifm-log', shimmer(3))
  s.body.replaceWith(log)
  const bar = el('div', 'ifm-bar')
  const chips = el('div', 'ifm-chips')
  const input = document.createElement('input')
  input.className = 'ifm-input'
  input.placeholder = 'Message'
  input.maxLength = 240
  input.setAttribute('aria-label', 'Message')
  input.setAttribute('enterkeyhint', 'send')
  const sendBtn = el('button', 'ifm-send', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19 V6 M6 11 L12 5 L18 11" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>') as HTMLButtonElement
  sendBtn.setAttribute('aria-label', 'Send')
  sendBtn.disabled = true
  const plus = el('button', 'ifm-plus', '+') as HTMLButtonElement
  plus.setAttribute('aria-label', 'Photo or place')
  bar.append(plus, input, sendBtn)
  s.el.append(chips, bar)

  for (const [label, f] of [
    ['📍 Meet me here', () => void sendPlace()],
    ['On my way', () => void sendText('On my way! 🚕')],
    ['👋 Hi!', () => void sendText('Hi! 👋')],
  ] as [string, () => void][]) {
    const c = el('button', 'ifm-chip', label)
    c.type = 'button'
    c.onclick = () => (tone('tap'), f())
    chips.append(c)
  }

  let msgs: UMsg[] = []
  const draw = (animateLast = false) => {
    log.innerHTML = ''
    if (!msgs.length) log.append(el('div', 'ifm-hello', `${groupFace(t)}<b>${esc(t.name)}</b><span>Say hi to start.</span>`))
    let lastDay = ''
    let prevFrom = ''
    msgs.forEach((m, i) => {
      const day = new Date(m.at).toDateString()
      if (day !== lastDay) {
        log.append(el('div', 'ifm-day', ago(m.at) === 'now' || Date.now() - m.at < 86400000 ? 'Today' : new Date(m.at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })))
        lastDay = day
        prevFrom = ''
      }
      const node = bubble(ctx, t, m, m.from !== prevFrom)
      prevFrom = m.from
      if (animateLast && i === msgs.length - 1) node.classList.add('pop')
      log.append(node)
    })
    log.scrollTop = log.scrollHeight
  }
  const load = async () => {
    try {
      msgs = await messages(t.id)
      draw()
      void markRead(t.id)
    } catch {
      log.innerHTML = '<div class="ifr-err">Can’t load this chat. Try again in a moment.</div>'
    }
  }
  const push = (m: UMsg) => {
    msgs.push(m)
    draw(true)
  }
  const sendWith = async (kind: 'text' | 'photo' | 'place', text: string, meta?: unknown) => {
    const temp: UMsg = { id: `tmp-${Date.now()}`, from: 'me', kind, text, meta: meta as UMsg['meta'], at: Date.now(), pending: true }
    push(temp)
    tone('send')
    try {
      const real = await send(t.id, kind, text, meta)
      Object.assign(temp, real, { pending: false })
      draw()
    } catch (e) {
      temp.pending = false
      temp.failed = true
      draw()
      const code = e instanceof HttpError ? (e.body as { error?: string })?.error : ''
      ctx.banner(code === 'muted' ? 'You can’t send messages right now.' : code === 'slow-down' ? 'Slow down a little.' : code === 'not-friends' ? 'You’re not friends anymore.' : 'Didn’t send. Tap it to retry.')
      tone('error')
    }
  }
  const sendText = (text: string) => sendWith('text', text)
  const sendPlace = () => {
    const room = world.room
    const name = world.plate?.name ?? room.name
    return sendWith('place', '', { room: isHomeRoom(room.id) ? room.id : room.id, name })
  }
  const submit = () => {
    const v = input.value.replace(/\s+/g, ' ').trim()
    if (!v) return
    input.value = ''
    sendBtn.disabled = true
    void sendText(v)
  }
  input.oninput = () => (sendBtn.disabled = !input.value.trim())
  input.onkeydown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }
  sendBtn.onclick = submit
  plus.onclick = () => {
    tone('tap')
    const sh = sheet(ctx, '<div class="ifr-sec">Send</div>')
    const row = el('div', 'ifr-actions')
    const b = (icon: string, label: string, f: () => void) => {
      const x = el('button', '', `<img src="${icon}" alt="">${label}`)
      x.onclick = () => (sh.close(), f())
      row.append(x)
    }
    b('/art/ifruit/app/photos.png', 'Photo', () => void pickPhoto(ctx, (r, caption) => void sendWith('photo', caption, r)))
    b('/art/ifruit/app/map.png', 'Here', () => void sendPlace())
    b('/art/ifruit/app/camera.png', 'Camera', () => ctx.open('camera'))
    sh.el.append(row)
  }
  const off = on('threads', (a) => {
    const ev = a as { th?: string; m?: UMsg } | undefined
    if (ev?.th !== t.id) return
    if (ev.m) {
      if (ev.m.from === 'me' && msgs.some((x) => x.id === ev.m!.id || x.pending)) return
      push(ev.m)
    } else void load()
  })
  setViewing(t.id)
  void load()
  return {
    el: s.el,
    onShow: () => setViewing(t.id),
    dispose: () => {
      off()
      setViewing('')
    },
  }
}

const photoCache = new Map<string, Promise<string>>()
function bubble(ctx: Ctx, t: UThread, m: UMsg, first: boolean) {
  const mine = m.from === 'me'
  if (m.kind === 'sys') return el('div', 'ifm-sys', esc(m.text))
  const who = !mine && t.kind === 'group' && first ? `<i class="ifm-name">${esc(t.people.find((p) => p.id === m.from)?.name ?? '')}</i>` : ''
  const b = el('div', `ifm-b ${mine ? 'me' : 'them'}${first ? ' first' : ''}${m.pending ? ' pending' : ''}${m.failed ? ' failed' : ''} k-${m.kind}`)
  const time = `<time>${new Date(m.at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })}${mine && !m.pending && !m.failed ? ' ✓' : ''}</time>`
  if (m.kind === 'text') b.innerHTML = `${who}<span>${esc(m.text)}</span>${time}`
  else if (m.kind === 'place') {
    const room = m.meta?.room ?? ''
    const known = !!ROOMS[room]
    b.innerHTML = `${who}<span class="ifm-place" style="${known ? `background-image:url(/art/rooms/${ROOMS[room].bg}.jpg)` : ''}"><b>📍 ${esc(m.meta?.name ?? roomName(room))}</b></span>${time}`
    if (known && !mine) {
      const go = act(isHomeRoom(room) ? 'Visit' : 'Go', () => thenCity(() => (isHomeRoom(room) && m.from ? void import('../../apartment').then((x) => x.visitPlayerApartment(m.from)) : void import('../../../engine/world').then((w) => w.goto(room)))), 'blue')
      b.querySelector('.ifm-place')!.append(go)
    }
  } else if (m.kind === 'photo') {
    const r = m.meta as unknown as PhotoRecipe
    b.innerHTML = `${who}<span class="ifm-photo"><i class="ifr-shimmer"></i></span>${m.text ? `<span>${esc(m.text)}</span>` : ''}${time}`
    if (r?.crop) {
      const key = `${m.id}`
      let p = photoCache.get(key)
      if (!p) photoCache.set(key, (p = renderRecipe(r, 480)))
      void p.then((url) => {
        const ph = b.querySelector('.ifm-photo')!
        ph.innerHTML = `<img src="${url}" alt="Photo at ${esc(r.title)}">`
        ph.addEventListener('click', () => viewPhoto(ctx, url, r, !mine))
      })
    }
  } else if (m.kind === 'pay') {
    b.innerHTML = `${who}<span class="ifm-money"><b>$${m.meta?.amount ?? ''}</b><small>${mine ? 'Sent' : 'Received'}${m.text ? `: ${esc(m.text)}` : ''}</small></span>${time}`
  } else if (m.kind === 'request') {
    const money = el('span', 'ifm-money req', `<b>$${m.meta?.amount ?? ''}</b><small>${mine ? 'You asked' : 'Asked you'}${m.text ? `: ${esc(m.text)}` : ''}</small>`)
    if (!mine && m.meta?.transfer) money.append(act('Open', () => ctx.open('bank', `req:${m.meta!.transfer}`), 'green'))
    b.innerHTML = who
    b.append(money)
    b.insertAdjacentHTML('beforeend', time)
  } else if (m.kind === 'call') {
    b.className = 'ifm-sys'
    b.textContent = m.meta?.missed ? `📞 Missed call` : `📞 Call, ${Math.max(1, Math.round((m.meta?.secs ?? 0) / 60))} min`
  }
  if (m.failed) b.title = 'Didn’t send'
  // report a message (right click, or long press on touch)
  if (!mine && !t.id.startsWith('local:') && m.kind !== 'call') {
    const report = (e: Event) => {
      e.preventDefault()
      const sh = sheet(ctx, `<div class="ifr-sec">Message from ${esc(t.people.find((p) => p.id === m.from)?.name ?? 'a friend')}</div>`)
      sh.el.append(
        act('Report This Message', async () => {
          const who = t.people.find((p) => p.id === m.from)
          if (who) {
            const mp = await import('../../../net/multiplayer')
            await mp.report(who.id, who.name, `Phone message: ${m.text.slice(0, 160)}`)
          }
          sh.close()
          ctx.banner('Thanks. A moderator will look at it.')
        }, 'red'),
      )
    }
    b.addEventListener('contextmenu', report)
    let press = 0
    b.addEventListener('pointerdown', (e) => e.pointerType === 'touch' && (press = window.setTimeout(() => report(e), 600)))
    b.addEventListener('pointerup', () => clearTimeout(press))
  }
  return b
}

function viewPhoto(ctx: Ctx, url: string, r: PhotoRecipe, canSave: boolean) {
  const sh = sheet(ctx, `<div class="ifr-sec">${esc(r.title)}</div><img class="ifm-big" src="${url}" alt="">`)
  if (canSave)
    sh.el.append(
      act('Save to Photos', async () => {
        await addPhoto({ room: r.room, title: r.title, jpeg: url, recipe: r, kind: 'received' })
        sh.close()
        ctx.banner('Saved to Photos')
      }, 'blue'),
    )
}

/** pick a photo from the library (and an optional caption) */
async function pickPhoto(ctx: Ctx, then: (r: PhotoRecipe, caption: string) => void) {
  const sh = sheet(ctx, '<div class="ifr-sec">Pick a Photo</div>')
  const grid = el('div', 'ifm-pick', shimmer(2))
  sh.el.append(grid)
  const all = (await allPhotos()).filter((p) => p.recipe)
  grid.innerHTML = ''
  if (!all.length) {
    grid.append(empty('', 'No Photos Yet', 'Take one with the Camera.', act('Open Camera', () => (sh.close(), ctx.open('camera')), 'blue')))
    return
  }
  for (const p of all.slice(0, 30)) {
    const b = el('button', 'ifm-pick-tile', `<img src="${p.jpeg}" alt="">`)
    b.onclick = () => {
      sh.close()
      then(p.recipe!, '')
    }
    grid.append(b)
  }
}

// ---------- new message / group ----------
function compose(ctx: Ctx): Screen {
  const s = screenEl(ctx, 'New Message')
  const picked = new Set<string>()
  const nameIn = document.createElement('input')
  nameIn.className = 'ifr-search ifm-gname'
  nameIn.placeholder = 'Group name'
  nameIn.maxLength = 24
  nameIn.hidden = true
  const go = act('Start', () => void start(), 'blue')
  go.disabled = true
  s.head.append(go)
  const list = el('div', '', shimmer(4))
  s.body.append(nameIn, list)
  let names: Record<string, string> = {}
  const start = async () => {
    const ids = [...picked]
    go.disabled = true
    try {
      if (ids.length === 1) return void (ctx.pop(), openWith(ctx, ids[0]))
      const id = await newGroup(ids, nameIn.value.trim())
      ctx.pop()
      const { list: ts } = await threads()
      const t = ts.find((x) => x.id === id)
      if (t) ctx.push(thread(ctx, t))
    } catch {
      ctx.banner('Couldn’t start that chat.')
      go.disabled = false
    }
  }
  void people().then(({ friends }) => {
    list.innerHTML = ''
    if (!friends.length) return list.append(empty('/art/ifruit/app/contacts.png', 'No Friends Yet', 'Add friends in the city first.'))
    list.append(el('div', 'ifr-sec', isOnline() ? 'Pick one, or a few for a group' : 'Pick a friend'))
    names = Object.fromEntries(friends.map((f) => [f.id, f.name]))
    for (const f of friends) {
      const row = el('button', 'ifr-row ifm-pickrow', `${face(f.look, f.online)}<span class="ifr-txt"><b>${esc(f.name)}</b><small>${f.local ? 'City local' : f.online ? 'Online' : 'Offline'}</small></span><i class="ifm-check"></i>`)
      row.type = 'button'
      row.onclick = () => {
        tone('tap')
        // city locals only do 1:1
        if (f.local) {
          picked.clear()
          picked.add(f.id)
          return void start()
        }
        if (picked.has(f.id)) picked.delete(f.id)
        else if (picked.size < 7) picked.add(f.id)
        row.classList.toggle('on', picked.has(f.id))
        go.disabled = !picked.size
        nameIn.hidden = picked.size < 2
        go.textContent = picked.size > 1 ? 'Start Group' : 'Start'
      }
      list.append(row)
    }
  })
  void names
  return { el: s.el }
}

function groupInfo(ctx: Ctx, t: UThread): Screen {
  const s = screenEl(ctx, 'Group')
  s.body.innerHTML = `<div class="ifr-sec">${t.people.length + 1} people</div>`
  for (const p of t.people) {
    const row = el('button', 'ifr-row', `${face(p.look, p.online)}<span class="ifr-txt"><b>${esc(p.name)}</b><small>${p.online ? (p.room ? esc(placePhrase(p.room, true)) : 'Online') : 'Offline'}</small></span>`)
    row.onclick = () => ctx.open('contacts', p.id)
    s.body.append(row)
  }
  const rename = document.createElement('input')
  rename.className = 'ifr-search ifm-gname'
  rename.placeholder = 'Rename group'
  rename.maxLength = 24
  rename.onkeydown = async (e) => {
    if (e.key !== 'Enter' || !rename.value.trim()) return
    const { rest } = await import('../../../net/server')
    await rest(`/phone/threads/${encodeURIComponent(t.id)}/rename`, { json: { name: rename.value.trim() } }).catch(() => ctx.banner('Couldn’t rename it.'))
    rename.value = ''
    ctx.banner('Renamed')
  }
  s.body.append(el('div', 'ifr-sec', 'Name'), rename)
  const leave = act('Leave Group', async () => {
    if (leave.dataset.sure !== '1') {
      leave.dataset.sure = '1'
      leave.textContent = 'Leave? Click again'
      return
    }
    const { rest } = await import('../../../net/server')
    await rest(`/phone/threads/${encodeURIComponent(t.id)}/leave`, { method: 'POST' }).catch(() => {})
    ctx.pop()
    ctx.pop()
  }, 'red ifm-leave')
  s.body.append(leave)
  return { el: s.el }
}
