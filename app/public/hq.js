// Launch HQ (hq.html): one control panel for the launch and the city. The go-to-market pages read /api/admin/hq/*
// (server/src/hq.ts); the moderator tools (live numbers, waitlist, reports, players, chat, crashes, controls) read
// /api/admin/* (server/src/admin.ts). Kept out of the HTML so the site's Content-Security-Policy can forbid inline scripts.
const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const fmt = (n) => (n == null ? '–' : Number(n).toLocaleString())
const ago = (t) => { if (!t) return 'never'; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago` }
const when = (t) => (t ? new Date(t).toLocaleString() : 'never')
const nyDate = (t) => new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
const dayName = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const shortDay = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const nyToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
const nyDay = (days) => new Date(Date.now() + days * 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
function toast(m) { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.display = 'none'), 2600) }
async function call(base, path, body) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' })
  if (res.status === 401) { showLogin(); throw new Error('signed out') }
  return res.json()
}
const hq = (path, body) => call('/api/admin/hq', path, body)
const admin = (path, body) => call('/api/admin', path, body)
const media = (f) => '/api/admin/hq/media?f=' + encodeURIComponent(f)
const store = { get: (k) => { try { return localStorage.getItem(k) } catch { return null } }, set: (k, v) => { try { localStorage.setItem(k, v) } catch {} } }

// dropdowns hug their words: the box is as wide as the chosen option, so the chevron sits right after it
const measure = document.createElement('canvas').getContext('2d')
function fitSelect(sel) {
  const cs = getComputedStyle(sel)
  measure.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
  sel.style.width = Math.ceil(measure.measureText(sel.selectedOptions[0]?.text ?? '').width + 12 + 30 + 4 + 2) + 'px'
}
function fitSelects(root = document) { $$('select', root).forEach((s) => { fitSelect(s); if (!s.dataset.fit) { s.dataset.fit = '1'; s.addEventListener('change', () => fitSelect(s)) } }) }

// ---------- sign in, the side nav ----------
function showLogin() { $('#app').hidden = true; $('#hdr').hidden = true; $('#login').hidden = false; setTimeout(() => $('#token').focus(), 0) }
async function boot() {
  const s = await fetch('/api/admin/session').then((r) => r.json()).catch(() => ({ ok: false, enabled: false }))
  if (!s.enabled) { $('#login').hidden = false; $('#login').innerHTML = '<h2>Launch HQ is off</h2><p class="muted">Set ADMIN_TOKEN on the server to turn it on.</p>'; return }
  if (!s.ok) return showLogin()
  $('#login').hidden = true; $('#app').hidden = false; $('#hdr').hidden = false
  hq('/summary').then((x) => { setMode(x.launch); badge('b-today', x.needs.filter((n) => n.owner === 'you').length) }).catch(() => {})
  pulse()
  setInterval(() => !document.hidden && pulse(), 30000)
  setInterval(() => { if (!document.hidden && current === 'controls') controls() }, 15000)
  go(location.hash.slice(1) || 'today')
}
$('#go').onclick = async () => {
  const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: $('#token').value }), credentials: 'same-origin' })
  if (r.ok) boot(); else $('#login-err').textContent = r.status === 429 ? 'Too many tries. Wait a minute.' : 'That password didn’t work.'
}
// braces matter: an on* handler that returns false cancels the key, so nothing could be typed
$('#token').onkeydown = (e) => { if (e.key === 'Enter') $('#go').click() }
$('#logout').onclick = async () => { await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }); location.reload() }

const panels = { today, launch, content, emails, people, safety, controls }
// old addresses (the moderator dashboard's tabs, earlier sections) still land in the right place
const ALIAS = { overview: ['controls'], live: ['controls'], city: ['controls'], waitlist: ['people'], activity: ['today'], reports: ['safety', 'reports'], players: ['safety', 'players'], chat: ['safety', 'chat'], errors: ['safety', 'errors'], library: ['content', 'library'], video: ['content', 'films'] }
function go(where) {
  const [t, sub] = ALIAS[where] ?? [where]
  if (t === 'safety' && sub) safetySub = sub
  if (t === 'content' && sub) contentView = sub
  tab(panels[t] ? t : 'today')
}
let current = ''
function tab(name) {
  current = name
  $$('.side button[data-tab]').forEach((b) => (b.dataset.tab === name ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')))
  $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== name))
  history.replaceState(null, '', '#' + name)
  window.scrollTo(0, 0)
  panels[name]?.()
}
$$('.side button[data-tab]').forEach((b) => (b.onclick = () => tab(b.dataset.tab)))
document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]')
  if (g) { e.preventDefault(); return go(g.dataset.go) }
  const pl = e.target.closest('[data-player]')
  if (pl) { e.preventDefault(); go('players'); showPlayer(pl.dataset.player) }
})
function badge(id, n) { const b = $('#' + id); if (!b) return; b.textContent = n; b.hidden = !n }

// the header strip and the side-nav badges, every half minute
async function pulse() {
  const p = await hq('/pulse').catch(() => null)
  if (!p) return
  const on = $('#pulse-online')
  on.classList.toggle('off', p.maintenance)
  on.lastElementChild.textContent = p.maintenance ? 'Maintenance on' : `${fmt(p.online)} online`
  const wl = $('#pulse-wl'); wl.hidden = !p.waitlist24h; wl.textContent = `+${fmt(p.waitlist24h)} on the waitlist today`
  badge('b-safety', p.reports)
  $('#n-reports').textContent = p.reports || ''; $('#n-errors').textContent = p.errors24h || ''
}
const countdown = (at) => { const d = Math.ceil((at - Date.now()) / 86400000); return d > 1 ? `${d} days` : d === 1 ? '1 day' : d === 0 ? 'Today' : 'Open' }
function setMode(l) { const m = $('#mode'); m.textContent = l.mode === 'open' ? 'Open' : l.set ? `Waitlist · opens ${nyDate(l.at)} ET` : 'Waitlist'; m.classList.toggle('open', l.mode === 'open') }

// ---------- posts: pictures, statuses, the viewer ----------
let contentData = null
const status = (p) => (contentData?.published[p.key] ? 'posted' : p.manual?.startsWith('to make') ? 'make' : p.manual ? 'manual' : p.approved ? 'approved' : 'ready')
const STATUS_LABEL = { posted: 'Posted', approved: 'Approved', ready: 'Ready', make: 'To make', manual: 'Manual' }
const kindLabel = (it) => (it.kind === 'reel' ? 'Reel' : it.kind === 'carousel' ? `${it.files.length} slides` : it.kind === 'image' ? 'Single' : '')
// a still for any post: its poster frame or first slide, or the video itself paused at one second
function still(it) {
  if (it.thumb) return `<img src="${media(it.thumb)}" alt="" loading="lazy">`
  if (it.files?.[0]?.endsWith('.mp4')) return `<video src="${media(it.files[0])}#t=1" muted playsinline preload="metadata"></video>`
  return ''
}
function thumb(p, attrs) {
  if (!p.files?.length) return `<button class="thumb none" ${attrs} aria-label="Open ${esc(p.title)}">To<br>make</button>`
  return `<button class="thumb ${p.kind === 'reel' ? 'reel' : ''}" ${attrs} aria-label="Preview ${esc(p.title)}">${still(p)}${p.kind === 'carousel' ? `<span class="k">${p.files.length}</span>` : ''}</button>`
}
async function loadContent(force) { if (!contentData || force) contentData = await hq('/content'); return contentData }
async function setApproved(keys, approved) {
  const r = await hq('/content/approve', { keys, approved })
  for (const p of contentData.posts) if (keys.includes(p.key) && !p.manual && !contentData.published[p.key]) p.approved = approved
  return r
}

let view = null // { items, i, slide }
const viewer = $('#viewer')
function openViewer(items, i) { view = { items, i, slide: 0 }; drawViewer(); if (!viewer.open) viewer.showModal() }
viewer.addEventListener('close', () => { $('#v-stage').innerHTML = ''; view = null })
viewer.addEventListener('click', (e) => { if (e.target === viewer) viewer.close() })
function drawViewer() {
  const it = view.items[view.i]
  const isPost = !!it.key
  const st = isPost ? status(it) : null
  const stage = $('#v-stage')
  if (!it.files?.length) stage.innerHTML = `<div class="empty-stage"><div><b>Not made yet</b>${esc(it.manual?.replace(/^to make: /, '') ?? '')}</div></div>`
  else if (it.kind === 'reel') stage.innerHTML = `<div class="phone"><video src="${media(it.files[0])}" ${it.thumb ? `poster="${media(it.thumb)}"` : ''} controls autoplay playsinline></video></div>`
  else {
    const n = it.files.length
    stage.innerHTML = `<div class="phone square"><div class="slides">${it.files.map((f, k) => `<img src="${media(f)}" alt="Slide ${k + 1}" draggable="false">`).join('')}</div>
      ${n > 1 ? `<span class="count-badge">${view.slide + 1}/${n}</span><button class="nav-btn prev" aria-label="Previous slide"></button><button class="nav-btn next" aria-label="Next slide"></button><div class="dots">${it.files.map(() => '<i></i>').join('')}</div>` : ''}</div>`
    slideTo(view.slide)
    $('.prev', stage)?.addEventListener('click', () => slideTo(view.slide - 1))
    $('.next', stage)?.addEventListener('click', () => slideTo(view.slide + 1))
    swipe($('.slides', stage))
  }
  const uses = isPost ? [] : (it.uses ?? []).map((k) => contentData?.posts.find((p) => p.key === k)).filter(Boolean)
  const cap = isPost ? it.caption : uses[0]?.caption
  const act = !isPost ? '' : st === 'ready' ? '<button class="btn" data-v-approve>Approve</button>' : st === 'approved' ? '<button class="btn ghost" data-v-hold>Hold</button>' : st === 'posted' ? `<a class="btn ghost" href="${esc(contentData.published[it.key].permalink)}" target="_blank" rel="noopener">View on Instagram</a>` : ''
  $('#v-info').innerHTML = `
    <div class="top"><h2>${esc(isPost ? it.title : it.name)}</h2><button class="x" aria-label="Close" data-v-close></button></div>
    <div class="row">${isPost ? `<span class="chip ${st}">${STATUS_LABEL[st]}</span><span class="chip">${esc(it.format)}</span>` : ''}${it.files?.length && kindLabel(it) !== it.format ? `<span class="chip">${kindLabel(it)}</span>` : ''}${isPost && it.trial ? '<span class="chip warn">Trial reel</span>' : ''}</div>
    <dl>${isPost ? `<dt>Goes out</dt><dd>${dayName(it.date)}, ${esc(it.time)} ET</dd><dt>Series</dt><dd>${esc(it.seriesName)}</dd><dt>Hook</dt><dd>“${esc(it.hook)}”</dd><dt>Phase</dt><dd>${esc(it.phase.replace(/^./, (c) => c.toUpperCase()))}</dd>` : `<dt>On the calendar</dt><dd>${uses.length ? uses.map((p) => `${shortDay(p.date)} ${esc(p.time)} (${STATUS_LABEL[status(p)].toLowerCase()})`).join(', ') : 'Not scheduled yet'}</dd>`}${it.files?.length ? `<dt>File</dt><dd><code>${esc(it.files[0].split('/').slice(-2).join('/'))}</code>${it.files.length > 1 ? ` + ${it.files.length - 1}` : ''}</dd>` : ''}</dl>
    ${cap ? `<div><b style="font:700 14px Burbank,system-ui">Caption</b><div class="caption" style="margin-top:6px">${esc(cap)}</div></div>` : ''}
    <div class="bottom"><button class="btn small ghost" data-v-step="-1" ${view.i ? '' : 'disabled'}>Previous</button><button class="btn small ghost" data-v-step="1" ${view.i < view.items.length - 1 ? '' : 'disabled'}>Next</button><span class="muted" style="font-size:12.5px">${view.i + 1} of ${view.items.length} · ← → ${it.kind === 'carousel' ? 'slides' : 'posts'} · Esc closes</span><span class="sp"></span>${act}</div>`
}
function slideTo(k) {
  const it = view.items[view.i], n = it.files.length
  view.slide = Math.max(0, Math.min(n - 1, k))
  const st = $('#v-stage')
  $('.slides', st).style.transform = `translateX(-${view.slide * 100}%)`
  $$('.dots i', st).forEach((d, j) => d.classList.toggle('on', j === view.slide))
  const c = $('.count-badge', st); if (c) c.textContent = `${view.slide + 1}/${n}`
  const p = $('.prev', st), nx = $('.next', st); if (p) p.hidden = view.slide === 0; if (nx) nx.hidden = view.slide === n - 1
}
function swipe(el) {
  let x0 = null
  el.addEventListener('pointerdown', (e) => { x0 = e.clientX; el.setPointerCapture(e.pointerId) })
  el.addEventListener('pointerup', (e) => { if (x0 == null) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 40) slideTo(view.slide + (dx < 0 ? 1 : -1)) })
}
function step(d) { const j = view.i + d; if (j < 0 || j >= view.items.length) return; view.i = j; view.slide = 0; drawViewer() }
$('#v-info').addEventListener('click', async (e) => {
  if (e.target.closest('[data-v-close]')) return viewer.close()
  const s = e.target.closest('[data-v-step]'); if (s) return step(Number(s.dataset.vStep))
  const a = e.target.closest('[data-v-approve],[data-v-hold]'); if (!a) return
  const it = view.items[view.i], approved = 'vApprove' in a.dataset
  a.disabled = true
  await setApproved([it.key], approved)
  toast(approved ? 'Approved: it goes out at its time' : 'Held: it won’t go out')
  drawViewer(); refreshContentViews()
})
// on the document: redrawing the viewer drops focus to the page, so the dialog itself stops hearing keys
document.addEventListener('keydown', (e) => {
  if (!view || !viewer.open || e.target.closest?.('input, textarea')) return
  const it = view.items[view.i]
  if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault()
    const d = e.key === 'ArrowRight' ? 1 : -1
    if (it.kind === 'carousel' && view.slide + d >= 0 && view.slide + d < it.files.length) slideTo(view.slide + d); else step(d)
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); step(e.key === 'ArrowDown' ? 1 : -1) }
})
function refreshContentViews() { if (current === 'content') drawContent(); if (current === 'today') today() }

// ---------- today ----------
let allEvents = false
async function today() {
  const [s, c, a] = await Promise.all([hq('/summary'), loadContent(true).catch(() => null), hq('/activity').catch(() => ({ events: [] }))])
  setMode(s.launch)
  const you = s.needs.filter((n) => n.owner === 'you'), mine = s.needs.filter((n) => n.owner === 'claude')
  badge('b-today', you.length)
  const need = (n) => `<div class="need ${n.level}"><span class="chip ${n.owner}">${n.owner === 'you' ? 'You' : 'Claude'}</span><div><b>${esc(n.title)}</b><span>${esc(n.detail)}</span></div><a class="btn small ghost" href="#" data-go="${n.tab}">Open</a></div>`
  const upcoming = (c?.posts ?? []).filter((p) => p.date >= nyToday() && !c.published[p.key]).slice(0, 5)
  today.upcoming = upcoming
  contentBadge()
  const open = s.launch.mode === 'open'
  $('[data-panel=today]').innerHTML = `
    <div class="stack">
      <div class="card hero"><div class="count">${open ? 'Open' : s.launch.set ? countdown(s.launch.at) : 'Soon'}</div><div><h2>${open ? 'The city is open' : s.launch.set ? 'Until the city opens' : 'The city is on the waitlist'}</h2><p>${open ? 'Every visitor can play.' : `${s.launch.set ? `${nyDate(s.launch.at)} ET` : 'No opening time set yet'} · ${s.checks.ok} of ${s.checks.total} launch checks green`}</p></div><span style="flex:1"></span><a class="btn ghost" href="#" data-go="launch">${open ? 'Launch' : 'Open the city'}</a></div>
      <div class="grid g4">
        <div class="card tile"><span class="lab">New Yorkers</span><span class="num">${fmt(s.players.total)}</span><div class="sub">${fmt(s.players.new24h)} new today · ${fmt(s.players.active24h)} active</div></div>
        <div class="card tile"><span class="lab">On the waitlist</span><span class="num">${fmt(s.waitlist.waiting)}</span><div class="sub">${fmt(s.waitlist.confirmed)} confirmed · ${fmt(s.waitlist.new7d)} this week</div></div>
        <div class="card tile"><span class="lab">Names saved</span><span class="num">${fmt(s.waitlist.named)}</span><div class="sub">${fmt(s.waitlist.claimed)} claimed in the city</div></div>
        <div class="card tile"><span class="lab">Instagram (60 days)</span><span class="num">${fmt(s.content.posted)}<small class="muted" style="font-size:18px"> / ${fmt(s.content.total)}</small></span><div class="sub">${fmt(s.content.approved)} approved · ${fmt(s.content.ready)} made · ${fmt(s.content.toMake)} to make</div></div>
      </div>
      <div class="grid g2">
        <div class="card"><h3>Needs you (${you.length})</h3><p class="muted">Decisions and things only you can do: accounts, DNS, approvals.</p><div class="needs">${you.map(need).join('') || '<p class="muted">Nothing. Nice.</p>'}</div></div>
        <div class="card"><h3>On my list (${mine.length})</h3><p class="muted">What I’ll do next, once you say go.</p><div class="needs">${mine.map(need).join('') || '<p class="muted">Nothing queued.</p>'}</div></div>
      </div>
      <div class="grid g2">
        <div class="card"><div class="row"><h3>Up next on Instagram</h3><span style="flex:1"></span><a class="btn small ghost" href="#" data-go="content">Calendar</a></div>
          <div style="margin-top:12px">${upcoming.map((p, i) => `<div class="post ph-${esc(p.phase)}">${thumb(p, `data-up="${i}"`)}<div class="when"><b>${shortDay(p.date)}</b>${esc(p.time)} ET</div><div class="t" data-up="${i}"><b>${esc(p.title)}</b><span>${esc(p.format)} · ${esc(p.seriesName)}</span></div><div class="acts"><span class="chip ${status(p)}">${STATUS_LABEL[status(p)]}</span></div></div>`).join('') || `<p class="muted">${c ? 'Nothing scheduled.' : 'Can’t read the schedule.'}</p>`}</div></div>
        <div class="card"><div class="row"><h3>Latest in the city</h3><span style="flex:1"></span>${a.events.length > 7 ? `<button class="btn small ghost" id="ev-all">${allEvents ? 'Show fewer' : `Show all ${a.events.length}`}</button>` : ''}</div><div style="margin-top:8px">${a.events.slice(0, allEvents ? 60 : 7).map(evRow).join('') || '<p class="muted">Quiet so far.</p>'}</div></div>
      </div>
    </div>`
  $$('[data-up]', $('[data-panel=today]')).forEach((el) => (el.onclick = () => openViewer(today.upcoming, Number(el.dataset.up))))
  const all = $('#ev-all'); if (all) all.onclick = () => { allEvents = !allEvents; today() }
  wireEvents($('[data-panel=today]'))
}
// the side-nav badge on Content: posts going out in the next 3 days that nobody has approved
function contentBadge() { badge('b-content', (contentData?.posts ?? []).filter((p) => p.date >= nyToday() && p.date <= nyDay(3) && status(p) === 'ready').length) }

// ---------- launch: the switch, the email, the checklist ----------
let launchPoll = 0
async function launch() {
  clearTimeout(launchPoll)
  const l = await hq('/launch')
  setMode(l)
  const st = l.state, open = st.mode === 'open'
  const now = new Date().toISOString().slice(0, 10)
  const cur = l.timeline.filter((t) => t.at <= now).pop()
  const areas = [...new Set(l.checks.map((c) => c.area))]
  const job = st.job
  const plan = st.opensAt && !open ? `Opens by itself ${nyDate(st.opensAt)} ET${st.by === 'env' ? ' (LAUNCH_AT)' : ''}.` : !open ? 'No opening time set: open it now, or pick a time.' : st.openedAt ? `Open since ${nyDate(st.openedAt)} ET.` : 'Open.'
  const emailLine = !st.email.canSend ? 'Email is off on this server (RESEND_API_KEY), so nobody would get it' : `<b>${fmt(st.eligible)}</b> confirmed ${st.eligible === 1 ? 'person' : 'people'} on the waitlist get “The city is open”, with a button that signs them in with their saved name${st.eligible > 90 ? '. Resend’s free plan sends 100 a day: upgrade first' : ''}`
  const localTime = (t) => { const d = new Date(t - new Date(t).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16) }
  $('[data-panel=launch]').innerHTML = `
    <div class="head"><div><h2>Launch</h2><p class="muted">The switch from waitlist to open, the launch email, and what still needs doing.</p></div></div>
    <div class="stack">
      <div class="card switch ${open ? 'open' : ''}">
        <div>
          <span class="chip ${open ? 'green' : 'amber'}">${open ? 'Live' : 'Waitlist mode'}</span>
          <div class="state" style="margin-top:12px">${open ? 'The city is open' : 'The city is on the waitlist'}</div>
          <p class="when muted">${plan}</p>
          <h3 style="font-size:16px;margin-bottom:8px">${open ? 'What opening did' : 'What happens when it opens'}</h3>
          <ol>
            <li><b>The landing page</b> says Play Now instead of asking for an email.</li>
            <li><b>/play lets everyone in</b>: no Coming Soon page, no preview code.</li>
            <li>${open ? `<b>The launch email</b>: ${fmt(st.notified)} sent so far${st.eligible ? `, ${fmt(st.eligible)} not yet` : ''}.` : `<b>The launch email</b>${st.emailOnOpen ? ' goes out by itself' : ' waits for you to press Send'}: ${emailLine}.`}</li>
            <li><b>Founder badge</b>: ${open ? `${fmt(st.founders)} New Yorkers have it` : `the ${fmt(st.earlyPlayers)} New Yorker${st.earlyPlayers === 1 ? '' : 's'} already in (preview testers) get it`}, and every waitlister gets it when they come in.</li>
          </ol>
        </div>
        <div class="acts">
          ${open ? `
            <div id="job"></div>
            <div class="row"><button class="btn green" id="send-rest" ${!st.eligible || job?.running || !st.email.canSend ? 'disabled' : ''}>Email ${st.eligible ? `the ${fmt(st.eligible)} not yet emailed` : 'new sign-ups'}</button></div>
            <div class="or">or</div>
            <button class="btn ghost" id="back-wait">Back to the waitlist</button>
            <p class="note" style="margin:0">Only for emergencies: the landing page and /play go back to Coming Soon. Players already in the city stay connected.</p>`
          : `
            <label class="tick"><input type="checkbox" id="email-on" ${st.emailOnOpen ? 'checked' : ''}> Email the waitlist the moment it opens</label>
            <button class="btn big green" id="open-now">Open the city now</button>
            <div class="or">or at a set time</div>
            <div class="row"><input class="field" type="datetime-local" id="open-at" value="${localTime(st.opensAt && st.opensAt > Date.now() ? st.opensAt : Date.parse('2026-11-17T10:00:00-05:00'))}" aria-label="Opening time"><button class="btn ghost" id="schedule">${st.opensAt && st.by === 'hq' ? 'Change time' : 'Schedule'}</button></div>
            ${st.opensAt && st.by === 'hq' ? '<button class="btn small ghost" id="unschedule">Clear the opening time</button>' : ''}
            <p class="note" style="margin:0">Times are in this computer’s time zone. The city opens on the server’s clock: nobody needs to be awake.</p>`}
          <div class="row" style="padding-top:10px;border-top:2px solid var(--line)"><a class="btn small ghost" href="/api/admin/waitlist/launch-email/preview" target="_blank" rel="noopener">Preview the email</a><input class="field" id="wl-test-to" type="email" placeholder="you@example.com" style="flex:1;min-width:150px;height:30px"><button class="btn small ghost" id="wl-test">Send me a test</button></div>
        </div>
      </div>
      <div class="grid g2">
        <div class="card"><h3>Ready to open?</h3><p class="muted">Checked live against the server, its settings and DNS.</p>
          ${areas.map((a) => `<h3 style="margin-top:14px;font-size:16px">${esc(a)}</h3>${l.checks.filter((c) => c.area === a).map((c) => `<div class="check"><span class="chip ${c.state}">${c.state === 'ok' ? 'Ready' : c.state === 'warn' ? 'Check' : 'To do'}</span><div><b>${esc(c.label)}</b><small>${esc(c.detail)}</small></div><span class="chip ${c.owner}">${c.owner === 'you' ? 'You' : 'Claude'}</span></div>`).join('')}`).join('')}
        </div>
        <div class="stack">
          ${l.tasks?.length ? `<div class="card"><h3>Launch tasks</h3><p class="muted">From testing and go-to-market research, in the order they’re due.</p>${l.tasks.map((t) => `<div class="task"><span class="when">${esc(t.when)}</span><div><b>${esc(t.what)}</b><small>${esc(t.why)}</small></div><span class="chip ${t.owner}">${t.owner === 'you' ? 'You' : 'Claude'}</span></div>`).join('')}</div>` : ''}
          <div class="card"><h3>Opening day runbook</h3><table style="margin-top:10px"><tbody>${l.runbook.map((r) => `<tr><td style="white-space:nowrap"><b>${esc(r.at)}</b></td><td>${esc(r.step)}</td></tr>`).join('')}</tbody></table></div>
        </div>
      </div>
      <div class="card"><h3>The road to opening day</h3><div class="timeline" style="margin-top:14px">${l.timeline.map((t) => `<div class="phase ${t === cur ? 'now' : t.at < now ? 'past' : ''}"><div class="when">${esc(t.label)} · ${dayName(t.at)}</div><h3>${esc(t.title)}</h3><ul>${t.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul></div>`).join('')}</div></div>
    </div>`
  if (job) $('#job') && ($('#job').innerHTML = `<div class="progress"><i style="width:${job.total ? Math.round(((job.sent + job.failed) / job.total) * 100) : 100}%"></i></div><p class="muted" style="margin:6px 0 0;font-size:13px">${job.running ? 'Sending the launch email…' : 'Launch email finished'} · ${fmt(job.sent)} sent${job.failed ? ` · ${fmt(job.failed)} failed` : ''} of ${fmt(job.total)}${job.stopped ? ` · <b>${esc(job.stopped)}</b>` : ''}</p>`)
  if (job?.running) launchPoll = setTimeout(() => current === 'launch' && launch(), 2000)
  const flip = async (body, sure) => { if (sure && !confirm(sure)) return; const r = await hq('/switch', body); if (!r.ok) return toast(r.error ?? 'That didn’t work'); toast(r.state.mode === 'open' ? 'The city is open' : body.action === 'schedule' ? `Opens ${nyDate(r.state.opensAt)} ET` : 'Back on the waitlist'); setMode({ mode: r.state.mode, at: r.state.opensAt, set: r.state.opensAt !== null }); pulse(); launch() }
  const email = () => $('#email-on')?.checked ?? true
  $('#open-now') && ($('#open-now').onclick = () => flip({ action: 'open', email: email() }, `Open the city now?\n\nThe landing page and /play open to everyone${email() && st.email.canSend && st.eligible ? `, and ${st.eligible} ${st.eligible === 1 ? 'person' : 'people'} on the waitlist get the launch email` : ''}.`))
  $('#schedule') && ($('#schedule').onclick = () => { const t = new Date($('#open-at').value).getTime(); if (!t) return toast('Pick a date and time'); flip({ action: 'schedule', at: t, email: email() }) })
  $('#unschedule') && ($('#unschedule').onclick = () => flip({ action: 'waitlist', email: email() }))
  $('#back-wait') && ($('#back-wait').onclick = () => flip({ action: 'waitlist', email: st.emailOnOpen }, 'Put the city back on the waitlist? New visitors see Coming Soon again.'))
  $('#send-rest') && ($('#send-rest').onclick = async () => { if (!confirm(`Email ${fmt(st.eligible)} ${st.eligible === 1 ? 'person' : 'people'} that Club NYC is open?`)) return; const r = await admin('/waitlist/launch-email', { force: false }); toast(r.ok ? `Sending to ${fmt(r.total)}…` : `Didn’t start: ${r.error}`); launch() })
  $('#wl-test').onclick = async () => {
    const to = $('#wl-test-to').value.trim()
    if (!to) return $('#wl-test-to').focus()
    const r = await admin('/waitlist/launch-email/test', { to })
    toast(r.ok ? (r.logged ? 'Printed to the server log (development)' : `Test sent to ${to}`) : `Not sent: ${r.error}`)
  }
}

// ---------- content: the calendar, the grid, everything rendered, the films and the playbook ----------
let shown = []
const VIEWS = { list: 'Calendar', feed: 'Feed', library: 'Library', films: 'Films', playbook: 'Playbook' }
let contentView = VIEWS[store.get('hq.contentView')] ? store.get('hq.contentView') : 'list'
async function content() {
  const d = await loadContent(true)
  const panel = $('[data-panel=content]')
  const series = [...new Set(d.posts.map((p) => p.seriesName))].sort()
  panel.innerHTML = `
    <div class="head"><div><h2>Content</h2><p class="muted">Instagram, two a day: 12:00 for reach (mostly reels), 19:00 for community (carousels, memes, event reels). Click any post to watch it or swipe through it. Nothing goes out until it’s approved.</p></div></div>
    ${d.posts.length ? '' : `<div class="card" style="margin-bottom:16px"><h3>No schedule here</h3><p class="muted" style="margin:4px 0 0">${esc(d.error ?? 'Launch HQ can’t see the Instagram schedule: set SOCIAL_S3_* on this service (see the Launch checks).')}</p></div>`}
    <div class="card">
      <div class="filters" style="margin:0">
        <div class="seg" role="group" aria-label="View">${Object.entries(VIEWS).map(([k, v]) => `<button data-view-mode="${k}" aria-pressed="${contentView === k}">${v}</button>`).join('')}</div>
        <span class="post-filters row">
          <select id="f-status" aria-label="Status"><option value="">Any status</option>${Object.entries(STATUS_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <select id="f-series" aria-label="Series"><option value="">Every series</option>${series.map((s) => `<option>${esc(s)}</option>`).join('')}</select>
          <select id="f-format" aria-label="Format"><option value="">Every format</option>${['Reel', 'Carousel', 'Single', 'Trial'].map((s) => `<option>${s}</option>`).join('')}</select>
          <input id="f-q" placeholder="Search titles" aria-label="Search titles">
        </span>
        <span style="flex:1"></span>
        <button class="btn small" id="approve-week">Approve everything ready this week</button>
      </div>
      <div id="c-counts" class="muted" style="font-size:13px;margin-top:10px"></div>
    </div>
    <div id="c-list" style="margin-top:18px"></div>`
  fitSelects(panel)
  for (const id of ['f-status', 'f-series', 'f-format', 'f-q']) $('#' + id).oninput = drawPosts
  $$('[data-view-mode]', panel).forEach((b) => (b.onclick = () => { contentView = b.dataset.viewMode; store.set('hq.contentView', contentView); $$('[data-view-mode]', panel).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); drawContent() }))
  $('#approve-week').onclick = async () => {
    const keys = d.posts.filter((p) => p.date >= nyToday() && p.date <= nyDay(7) && status(p) === 'ready').map((p) => p.key)
    if (!keys.length) return toast('Nothing ready to approve in the next 7 days')
    const r = await setApproved(keys, true)
    toast(`${r.changed} approved`); drawContent()
  }
  const counts = {}
  for (const p of d.posts) counts[status(p)] = (counts[status(p)] ?? 0) + 1
  $('#c-counts').textContent = Object.entries(STATUS_LABEL).map(([k, v]) => `${counts[k] ?? 0} ${v.toLowerCase()}`).join(' · ')
  drawContent()
}
function drawContent() {
  const posty = contentView === 'list' || contentView === 'feed'
  $('.post-filters').hidden = !posty; $('#approve-week').hidden = !posty
  contentBadge()
  if (posty) return drawPosts()
  ;({ library: drawLibrary, films: drawFilms, playbook: drawPlaybook })[contentView]()
}
function drawPosts() {
  const d = contentData
  const f = { status: $('#f-status').value, series: $('#f-series').value, format: $('#f-format').value, q: $('#f-q').value.toLowerCase() }
  shown = d.posts.filter((p) => (!f.status || status(p) === f.status) && (!f.series || p.seriesName === f.series) && (!f.format || p.format === f.format) && (!f.q || (p.title + p.hook).toLowerCase().includes(f.q)))
  const list = $('#c-list')
  if (!shown.length) { list.innerHTML = '<p class="muted">Nothing matches.</p>'; return }
  if (contentView === 'feed') {
    // the profile grid as it will look with what's made so far: newest top left
    const order = shown.map((p, i) => i).filter((i) => shown[i].files.length).reverse()
    const toMake = shown.filter((p) => status(p) === 'make').length
    list.innerHTML = `<p class="muted" style="margin:0 0 10px">The profile grid with everything that’s made, newest top left. Click a post to see it full size.${toMake ? ` ${toMake} post${toMake === 1 ? '' : 's'} still to make ${toMake === 1 ? 'isn’t' : 'aren’t'} shown.` : ''}</p><div class="feed">${order.map((i) => { const p = shown[i]; const st = status(p); return `<button class="tile-post" data-open="${i}" aria-label="${esc(p.title)}"><span class="pic ${p.kind === 'reel' ? 'reel' : ''}">${still(p)}</span><span class="cap"><b class="${st === 'approved' || st === 'posted' ? 'ok' : ''}">${shortDay(p.date)} · ${esc(p.time)}</b><span>${kindLabel(p)}</span></span></button>` }).join('') || '<p class="muted">Nothing made in this selection yet.</p>'}</div>`
  } else {
    const weeks = new Map()
    shown.forEach((p, i) => { const w = `Week ${Math.floor((p.day - 1) / 7) + 1}`; if (!weeks.has(w)) weeks.set(w, []); weeks.get(w).push([p, i]) })
    list.innerHTML = [...weeks].map(([w, ps]) => `<div class="week"><h3>${w} · ${dayName(ps[0][0].date)} to ${dayName(ps[ps.length - 1][0].date)}</h3>${ps.map(([p, i]) => {
      const st = status(p), pub = d.published[p.key], stats = d.stats[p.key]
      const act = st === 'ready' ? `<button class="btn small" data-approve="${esc(p.key)}">Approve</button>` : st === 'approved' ? `<button class="btn small ghost" data-hold="${esc(p.key)}">Hold</button>` : st === 'posted' ? `<a class="btn small ghost" href="${esc(pub.permalink)}" target="_blank" rel="noopener">View</a>${stats ? `<span class="muted" style="font-size:12.5px">${fmt(stats.likes)} likes · ${fmt(stats.comments)} comments</span>` : ''}` : ''
      return `<div class="post ph-${esc(p.phase)}">${thumb(p, `data-open="${i}"`)}<div class="when"><b>${dayName(p.date)}</b>${esc(p.time)} ET</div><div class="t" data-open="${i}"><b>${esc(p.title)}</b><span>${esc(p.format)} · ${esc(p.seriesName)} · “${esc(p.hook)}”${p.manual?.startsWith('to make') ? ` · <i>${esc(p.manual.slice(9))}</i>` : ''}</span></div><div class="acts"><span class="chip ${st}">${STATUS_LABEL[st]}</span>${act}</div></div>`
    }).join('')}</div>`).join('')
  }
  $$('[data-open]', list).forEach((el) => (el.onclick = () => openViewer(shown, Number(el.dataset.open))))
}
document.addEventListener('click', async (e) => {
  const a = e.target.closest('[data-approve],[data-hold]'); if (!a) return
  const key = a.dataset.approve ?? a.dataset.hold, approved = !!a.dataset.approve
  a.disabled = true
  await setApproved([key], approved)
  toast(approved ? 'Approved: it goes out at its time' : 'Held: it won’t go out'); drawContent()
})

// everything rendered, scheduled or not
let libItems = null
async function drawLibrary() {
  if (!libItems) {
    const l = await hq('/library')
    // named after the post that uses it, else after its file
    libItems = l.items.map((it) => ({ ...it, name: contentData?.posts.find((p) => p.key === it.uses[0])?.title ?? it.id.replace(/[-_]/g, ' ').replace(/^./, (c) => c.toUpperCase()) }))
  }
  if (contentView !== 'library') return
  const used = libItems.filter((i) => i.uses.length), spare = libItems.filter((i) => !i.uses.length)
  const card = (it) => { const i = libItems.indexOf(it); const ps = it.uses.map((k) => contentData?.posts.find((p) => p.key === k)).filter(Boolean); return `<button class="asset" data-lib="${i}"><div class="pic ${it.kind === 'reel' ? 'reel' : ''}">${still(it)}</div><div class="txt"><b>${esc(it.name)}</b><span>${kindLabel(it)} · ${ps.length ? `goes out ${ps.map((p) => shortDay(p.date)).join(', ')}` : 'not on the calendar'}</span></div></button>` }
  const list = $('#c-list')
  list.innerHTML = `
    <p class="muted" style="margin:0 0 14px">Every reel, carousel, single and meme that’s rendered: ${libItems.filter((i) => i.kind === 'reel').length} reels, ${libItems.filter((i) => i.kind === 'carousel').length} carousels, ${libItems.filter((i) => i.kind === 'image').length} singles.</p>
    <h3 style="margin-bottom:12px">On the calendar (${used.length})</h3><div class="lib">${used.map(card).join('') || '<p class="muted">Nothing yet.</p>'}</div>
    ${spare.length ? `<h3 style="margin:26px 0 12px">Rendered, not scheduled (${spare.length})</h3><div class="lib">${spare.map(card).join('')}</div>` : ''}`
  $$('[data-lib]', list).forEach((el) => (el.onclick = () => openViewer(libItems, Number(el.dataset.lib))))
}

// ---------- emails ----------
async function emails() {
  const { journeys } = await hq('/emails')
  const all = journeys.flatMap((j) => j.emails)
  $('[data-panel=emails]').innerHTML = `
    <div class="split">
      <div>
        <div class="card" style="margin-bottom:16px"><h2>Email journeys</h2><p class="muted" style="margin:4px 0 8px">${all.length} emails in ${journeys.length} journeys: ${all.filter((e) => e.status === 'live').length} live, ${all.filter((e) => e.status === 'built').length} written and ready to wire, ${all.filter((e) => e.status === 'planned').length} waiting on a feature. Click one to see it.</p>
          <ul class="rules">
            <li><b>Transactional always sends</b> (sign-in, confirmations, account changes). Everything else needs consent and has one-click unsubscribe per topic.</li>
            <li><b>At most one non-transactional email every 3 days</b>, two a week, 11:00 to 19:00 ET. A sequence stops the moment its goal happens.</li>
            <li><b>The waitlist was promised</b> the confirmation, the launch email and one reminder. More only for people who ask for updates.</li>
            <li><b>Our server sends</b> the personal ones (it knows names and stats); <b>Resend broadcasts</b> send the newsletter and event invites to opted-in topics.</li>
          </ul>
        </div>
        ${journeys.map((j) => `<div class="journey"><h3>${esc(j.name)}</h3><p class="muted">${esc(j.why)}</p>${j.emails.map((e) => `
          <div class="email" data-email="${esc(e.id)}"><div><b>${esc(e.name)}</b><div class="muted" style="font-size:13px">“${esc(e.subject)}”</div>
            <dl class="meta"><dt>When</dt><dd>${esc(e.trigger)} · ${esc(e.timing)}</dd><dt>Who</dt><dd>${esc(e.audience)}</dd><dt>For</dt><dd>${esc(e.goal)}${e.stop ? ` · stops when: ${esc(e.stop)}` : ''}</dd><dt>Sent by</dt><dd>${e.sender === 'server' ? 'Our server' : 'Resend broadcast'}</dd></dl></div>
            <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end"><span class="chip ${e.status}">${e.status === 'live' ? 'Live' : e.status === 'built' ? 'Written' : 'Planned'}</span><span class="chip">${esc(e.kind)}</span></div></div>`).join('')}</div>`).join('')}
      </div>
      <div class="card preview"><iframe id="email-frame" title="Email preview"></iframe></div>
    </div>`
  const show = (id) => { $$('.email').forEach((x) => x.classList.toggle('on', x.dataset.email === id)); $('#email-frame').src = '/api/admin/hq/emails/' + encodeURIComponent(id) }
  $$('.email').forEach((x) => (x.onclick = () => show(x.dataset.email)))
  show(all[0].id)
}

// ---------- films and the playbook (Content views) ----------
async function drawFilms() {
  const { storyboards } = await hq('/video')
  if (contentView !== 'films') return
  $('#c-list').innerHTML = `<p class="muted" style="margin:0 0 14px">Storyboards for the teaser, the launch film and the bumper.</p>` + storyboards.map((b) => `
    <div class="card board"><h2>${esc(b.name)}</h2>
      <p class="row" style="margin:8px 0 0"><span class="chip">${esc(b.length)}</span><span class="chip">${esc(b.formats)}</span>${b.when ? `<span class="chip you">${esc(b.when)}</span>` : ''}</p>
      <p style="margin:10px 0 4px">${esc(b.idea)}</p><p class="muted" style="margin:0">Sound: ${esc(b.music)}</p>
      <div class="shots">${b.shots.map((s) => `<div class="shot"><div class="img ${s.art.includes('/ui/logo') ? 'logo' : ''}" style="${s.art.includes('/ui/logo') ? '' : `background-image:url('${esc(s.art)}')`}">${s.art.includes('/ui/logo') ? `<img src="${esc(s.art)}" alt="">` : ''}${s.text ? `<em>${esc(s.text)}</em>` : ''}</div><div class="txt"><b>${esc(s.t)} s</b>${esc(s.shot)}</div></div>`).join('')}</div>
    </div>`).join('')
}
async function drawPlaybook() {
  const pb = await hq('/playbook')
  if (contentView !== 'playbook') return
  $('#c-list').innerHTML = `<div class="stack playbook">
    <div class="card"><h3>Five phases, five asks</h3><div class="timeline" style="margin-top:12px">${pb.phases.map((p) => `<div class="phase"><div class="when">${esc(p.when)}</div><h3>${esc(p.name)}</h3><p style="margin:6px 0 0;font-size:13px">${esc(p.ask)}</p></div>`).join('')}</div></div>
    <div class="grid g2">
      <div class="card"><h3>How the account grows</h3><p class="muted">Reach brings people in; sends multiply them. Every post is built to be sent to someone.</p>${pb.levers.map(([h, p, how], i) => `<div class="lever"><span class="k">${String(i + 1).padStart(2, '0')}</span><b>${esc(h)}</b><div style="font-size:13.5px">${esc(p)}</div><span>${esc(how)}</span></div>`).join('')}</div>
      <div class="card"><h3>Every week</h3><table style="margin-top:10px"><tbody>${pb.loop.map(([d, t]) => `<tr><td style="white-space:nowrap"><b>${esc(d)}</b></td><td>${esc(t)}</td></tr>`).join('')}</tbody></table></div>
    </div>
  </div>`
}

// ---------- controls: the city right now ----------
const stat = (n, label) => `<div class="stat"><b>${fmt(n ?? 0)}</b><small>${label}</small></div>`
const pct = (n, label, note) => `<div class="stat"><b>${n == null ? 'n/a' : `${n}%`}</b><small>${label}${note ? `<br><i>${note}</i>` : ''}</small></div>`
async function controls() {
  const o = await admin('/overview')
  $('#live-now').innerHTML = `
    <div class="grid g2">
      <div class="card"><div class="row"><h3>Right now</h3><span style="flex:1"></span><span class="chip ${o.live.maintenance ? 'red' : 'green'}">${o.live.maintenance ? 'Maintenance on' : 'Open to players'}</span></div><div class="stats">${stat(o.live.online, 'New Yorkers online')}${stat(o.live.parties, 'house parties')}${stat(o.accounts.active24h, 'active in 24h')}${stat(o.safety.openReports, 'open reports')}${stat(o.errors24h, 'crash reports in 24h')}</div><p class="note">Refreshes every 15 seconds.</p></div>
      <div class="card"><h3>Server</h3><div class="stats">${stat(Math.round(o.server.uptimeSec / 60), 'minutes up')}${stat(o.server.rssMB, 'MB of memory')}${stat(o.live.msgsIn, 'messages in')}${stat(o.live.dropped, 'slow clients dropped')}</div><p class="note">Busiest rooms: ${o.live.rooms.slice(0, 5).map((r) => `${esc(r.room)} (${r.players})`).join(', ') || 'nobody online'}</p></div>
    </div>`
  city()
}

// ---------- activity (on Today) ----------
const EV = { waitlist: ['clipboard', 'Waitlist'], confirm: ['envelope', 'Waitlist'], player: ['home', 'Players'], report: ['flag', 'Safety'], mod: ['gavel', 'Safety'], crash: ['construction', 'Crashes'], posted: ['camera', 'Posts'] }
const evRow = (e) => `<div class="ev go" data-ev-tab="${esc(e.tab)}" data-ev-kind="${esc(e.kind)}" data-ev-ref="${esc(e.ref ?? '')}"><img class="ico" src="/art/icons/e/${EV[e.kind]?.[0] ?? 'bell'}.png" alt=""><div>${esc(e.text)}</div><time title="${esc(when(e.at))}">${ago(e.at)}</time></div>`
function wireEvents(root) {
  $$('[data-ev-tab]', root).forEach((el) => (el.onclick = () => {
    const { evTab, evKind, evRef } = el.dataset
    if (evKind === 'posted' && evRef) return window.open(evRef, '_blank', 'noopener')
    go(evTab)
    if (evRef && (evKind === 'player' || evKind === 'mod' || evKind === 'report')) { go('players'); showPlayer(evRef) }
  }))
}

// ---------- people: how many, and where the emails come from ----------
async function people() {
  const p = await hq('/people')
  const w = p.waitlist, pl = p.players
  const max = Math.max(1, ...p.days.map((d) => d.n))
  const conv = w.visits7d ? `${Math.min(100, Math.round((w.landing7d / w.visits7d) * 1000) / 10)}%` : 'n/a'
  $('#people-top').innerHTML = `
    <div class="grid g4">
      <div class="card tile"><span class="lab">New Yorkers</span><span class="num">${fmt(pl.total)}</span><div class="sub">${fmt(pl.online)} online now · ${fmt(pl.active24h)} active today</div></div>
      <div class="card tile"><span class="lab">New this week</span><span class="num">${fmt(pl.new7d)}</span><div class="sub">${fmt(pl.new24h)} today</div></div>
      <div class="card tile"><span class="lab">Founders</span><span class="num">${fmt(pl.founders)}</span><div class="sub">In before opening, or on the waitlist</div></div>
      <div class="card tile"><span class="lab">On the waitlist</span><span class="num">${fmt(w.waiting)}</span><div class="sub">${fmt(w.confirmed)} confirmed · ${fmt(w.named)} saved a name</div></div>
    </div>
    <div class="grid g2">
      <div class="card"><h3>How we collect emails</h3><p class="muted">Only with a form someone fills in themselves. Each address confirms by email first (double opt-in), every email has a one-click unsubscribe, and an unsubscribed address is replaced by a scrambled fingerprint.</p>
        <table class="collect"><tr><th>Where</th><th>How it works</th><th>Emails</th></tr>${p.collect.map((x) => `<tr><td><b>${esc(x.label)}</b></td><td class="muted">${esc(x.how)}</td><td><b>${fmt(x.n)}</b></td></tr>`).join('')}</table>
        <p class="note">Inside the game, players can save their New Yorker with an email (${fmt(p.inGame.email)}), Google (${fmt(p.inGame.google)}), Discord (${fmt(p.inGame.discord)}) or X (${fmt(p.inGame.x)}). That’s sign-in only: those addresses aren’t on the waitlist and get no marketing email.</p>
      </div>
      <div class="card"><h3>Waitlist sign-ups, last 30 days</h3>
        <div class="bars">${p.days.map((d) => `<i class="${d.n ? '' : 'zero'}" style="height:${Math.max(2, Math.round((d.n / max) * 100))}%" title="${esc(shortDay(d.day))}: ${d.n}"></i>`).join('')}</div>
        <div class="bars-axis"><span>${esc(shortDay(p.days[0].day))}</span><span>busiest day: ${p.days.some((d) => d.n) ? max : 0}</span><span>${esc(shortDay(p.days[p.days.length - 1].day))}</span></div>
        <div class="stats">${stat(w.new24h, 'joined in 24h')}${stat(w.new7d, 'joined in 7 days')}<div class="stat"><b>${conv}</b><small>of landing visits joined (7 days)</small></div>${stat(w.pending, 'waiting to confirm')}${stat(w.unsubscribed, 'unsubscribed')}${stat(w.notified, 'got the launch email')}</div>
      </div>
    </div>`
  wlRows($('#wl-q').value)
}
$('#more-numbers').addEventListener('toggle', async (e) => {
  if (!e.target.open) return
  const o = await admin('/overview')
  $('#more-body').innerHTML = `
    <h3 style="margin-top:16px;font-size:16px">Do they come back?</h3><div class="stats">${stat(o.growth.playedToday, 'played today (NY time)')}${stat(o.growth.playedWeek, 'played in the last 7 days')}${pct(o.growth.nextDayPct, 'came back the next day', 'joined 2–8 days ago')}${pct(o.growth.weekLaterPct, 'still playing a week later', 'joined 8–21 days ago')}${pct(o.growth.viaInvitePct, 'of new players came via an invite', 'last 7 days')}${stat(o.growth.newPlayMin, 'avg minutes played, new players')}</div>
    ${o.landing ? `<h3 style="margin-top:16px;font-size:16px">Landing page · last 7 days</h3><div class="stats">${stat(o.landing.visits, 'visits')}${stat(o.landing.play, 'pressed Play now')}${stat(o.landing.created, 'made a New Yorker')}${stat(o.landing.trailer ?? 0, 'watched the trailer')}${stat(o.landing.phones, 'on a phone')}${stat(o.landing.discord, 'opened the Discord')}</div>` : ''}
    <h3 style="margin-top:16px;font-size:16px">New Yorker creator · last 7 days</h3><div class="stats">${stat(o.creator.opened, 'opened the creator')}${stat(o.creator.done, 'finished')}${pct(o.creator.opened ? Math.round((o.creator.done / o.creator.opened) * 100) : null, 'finish rate')}${stat(o.creator.medianSec ?? 0, 'median seconds to finish')}</div>
    <h3 style="margin-top:16px;font-size:16px">Economy</h3><div class="stats">${stat(o.economy.coins, 'coins in wallets')}${stat(o.economy.earned24h, 'coins earned · 24h')}${stat(o.economy.spent24h, 'coins spent · 24h')}</div>`
})
async function wlRows(qs) {
  const { rows } = await admin(`/waitlist/rows?q=${encodeURIComponent(qs ?? '')}`)
  const pill = (st) => `<span class="chip ${st === 'confirmed' || st === 'emailed' ? 'green' : st === 'unsubscribed' ? 'red' : st === 'waiting to confirm' ? 'amber' : ''}">${esc(st)}</span>`
  $('#wl-rows').innerHTML = `<table><tr><th>Email</th><th>Name</th><th>Status</th><th>Where</th><th>Invited by</th><th>Joined</th><th></th></tr>${rows.map((r) => `<tr><td>${esc(r.email)}</td><td>${esc(r.name ?? '')}</td><td>${pill(r.status)}</td><td>${esc(r.source ?? '')}</td><td>${esc(r.referrer ?? '')}</td><td title="${esc(when(r.createdAt))}">${ago(r.createdAt)}</td><td><button class="btn small ghost" data-wl-delete="${r.id}" data-wl-email="${esc(r.email)}">Delete</button></td></tr>`).join('') || '<tr><td colspan=7 class="muted">Nobody here yet.</td></tr>'}</table>`
}
let wlTimer = 0
$('#wl-q').oninput = (e) => { clearTimeout(wlTimer); wlTimer = setTimeout(() => wlRows(e.target.value), 250) }
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-wl-delete]'); if (!b) return
  if (!confirm(`Delete ${b.dataset.wlEmail} from the waitlist for good?`)) return
  const r = await admin(`/waitlist/${b.dataset.wlDelete}/delete`, {})
  toast(r.ok ? 'Deleted' : 'Already gone')
  people()
})

// ---------- safety: reports, players, chat, crashes ----------
let safetySub = 'reports'
function safety() {
  $$('[data-sub]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sub === safetySub)))
  $$('[data-subpanel]').forEach((p) => (p.hidden = p.dataset.subpanel !== safetySub))
  ;({ reports, players: () => searchPlayers($('#player-q').value), chat: searchChat, errors })[safetySub]()
}
$$('[data-sub]').forEach((b) => (b.onclick = () => { safetySub = b.dataset.sub; safety() }))

// ---------- reports ----------
const ACTIONS = [['warn', 'Warn', ''], ['mute', 'Mute 1h', 60], ['mute', 'Mute 24h', 1440], ['ban', 'Suspend 1d', 1440], ['ban', 'Suspend 7d', 10080], ['ban', 'Ban', 0], ['rename', 'Reset name', '']]
function actionButtons(kind, id) {
  return `<div class="row" style="margin-top:10px"><input class="field reason" placeholder="Reason (the player sees this)" style="flex:1;min-width:220px">${ACTIONS.map(([a, label, m]) => `<button class="btn small ${a === 'ban' ? 'red' : 'ghost'}" data-act="${a}" data-min="${m}" data-kind="${kind}" data-id="${id}">${label}</button>`).join('')}${kind === 'report' ? `<button class="btn small ghost" data-dismiss="${id}">Dismiss</button>` : ''}</div>`
}
async function doAction(btn) {
  const box = btn.closest('.report, .card')
  const reason = box.querySelector('.reason')?.value ?? ''
  const minutes = btn.dataset.min ? Number(btn.dataset.min) : undefined
  if (btn.dataset.act === 'ban' && !minutes && !confirm('Permanently ban this player?')) return
  const path = btn.dataset.kind === 'report' ? `/reports/${btn.dataset.id}/action` : `/users/${btn.dataset.id}/action`
  const r = await admin(path, { action: btn.dataset.act, reason, minutes })
  toast(r.ok ? 'Done' : `Failed: ${r.error}`)
  if (btn.dataset.kind === 'report') reports(); else showPlayer(btn.dataset.id)
  pulse()
}
document.addEventListener('click', async (e) => {
  const act = e.target.closest('[data-act]'); if (act) return doAction(act)
  const dis = e.target.closest('[data-dismiss]')
  if (dis) { await admin(`/reports/${dis.dataset.dismiss}/dismiss`, { note: '' }); toast('Dismissed'); reports(); pulse() }
})
async function reports() {
  fitSelects($('[data-subpanel=reports]'))
  const { reports } = await admin(`/reports?status=${$('#report-status').value}`)
  $('#reports').innerHTML = reports.map((r) => `<div class="report">
      <div class="row"><span class="who" data-player="${esc(r.target)}">${esc(r.targetName)}</span><span class="chip amber">${esc(r.reason)}</span>
      <span class="muted">reported by <span class="who" data-player="${esc(r.reporter)}">${esc(r.reporterName)}</span> · ${ago(r.created_at)}</span>
      <span class="chip">${r.targetReports} report${r.targetReports === 1 ? '' : 's'} total</span>${r.targetActions ? `<span class="chip red">${r.targetActions} past action${r.targetActions === 1 ? '' : 's'}</span>` : ''}
      ${r.targetMuted ? '<span class="chip amber">muted</span>' : ''}${r.targetBanned ? '<span class="chip red">banned</span>' : ''}</div>
      ${r.context ? `<div class="ctx">${esc(r.context)}</div>` : ''}
      ${r.status === 'open' ? actionButtons('report', r.id) : `<p class="muted">${esc(r.status)} · ${esc(r.resolution ?? '')}</p>`}
    </div>`).join('') || '<div class="card"><p class="muted" style="margin:0">Nothing here.</p></div>'
}
$('#report-status').onchange = reports

// ---------- players ----------
let searchTimer = 0
$('#player-q').oninput = (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => searchPlayers(e.target.value), 250) }
async function searchPlayers(qs) {
  const { users } = await admin(`/users?q=${encodeURIComponent(qs ?? '')}`)
  $('#player-list').innerHTML = users.map((u) => `<div class="list-item" data-player="${esc(u.id)}"><b>${esc(u.name)}</b> <span class="muted">No. ${u.memberNo}</span> ${u.online ? '<span class="chip green">online</span>' : ''}${u.banned ? '<span class="chip red">banned</span>' : ''}${u.muted ? '<span class="chip amber">muted</span>' : ''}<br><small class="muted">seen ${ago(u.lastSeen)}</small></div>`).join('') || '<p class="muted">No one found.</p>'
}
async function showPlayer(id) {
  const d = await admin(`/users/${encodeURIComponent(id)}`)
  if (d.error) return ($('#player-detail').innerHTML = '<p class="muted">Not found (maybe deleted).</p>')
  const u = d.user
  $('#player-detail').innerHTML = `
    <h2>${esc(u.name)} <span class="muted" style="font-size:18px">No. ${u.memberNo}</span> ${d.presence.online ? `<span class="chip green">online · ${esc(d.presence.room ?? '')}</span>` : ''}</h2>
    <p class="muted">Joined ${when(u.createdAt)} · last seen ${ago(u.lastSeen)} · played ${u.playMinutes} min · ${u.consent ? `agreed to the ${esc(u.consent.version)} terms ${ago(u.consent.at)}` : 'no consent on record'} · ${u.guest ? 'guest' : 'linked: ' + esc(u.providers.filter((p) => p !== 'guest').join(', '))} · team ${esc(u.team || 'none')} ${u.invitedBy ? `· invited by ${esc(u.invitedBy)}` : ''} · id <code>${esc(u.id)}</code></p>
    <div class="row">${d.banned ? `<span class="chip red">banned until ${d.banned.until > 7e12 ? 'forever' : when(d.banned.until)}: ${esc(d.banned.reason)}</span><button class="btn small ghost" data-act="unban" data-kind="user" data-id="${esc(u.id)}">Unban</button>` : ''}${d.muted ? `<span class="chip amber">muted until ${when(d.muted.until)}</span><button class="btn small ghost" data-act="unmute" data-kind="user" data-id="${esc(u.id)}">Unmute</button>` : ''}</div>
    <h3 style="margin-top:16px">Actions</h3>${actionButtons('user', esc(u.id))}
    <h3 style="margin-top:18px">Wallet · ${fmt(d.wallet.coins)} coins · ${d.wallet.owned.length} items · homes: ${esc(d.wallet.homes.join(', '))}</h3>
    <div class="row" style="margin-top:8px"><input class="field" id="coin-amt" type="number" placeholder="+/- coins" style="width:120px"><input class="field" id="coin-why" placeholder="Why (e.g. bug refund)" style="flex:1"><button class="btn small" id="coin-go">Adjust</button></div>
    <table style="margin-top:8px"><tr><th>When</th><th>Change</th><th>Reason</th><th>Balance</th></tr>${d.ledger.map((l) => `<tr><td>${ago(l.at)}</td><td>${l.delta > 0 ? '+' : ''}${l.delta}</td><td>${esc(l.reason)}${l.ref ? ` <span class="muted">${esc(l.ref)}</span>` : ''}</td><td>${l.balance}</td></tr>`).join('')}</table>
    <h3 style="margin-top:18px">Invites · ${d.referrals.count} joined · ${d.referrals.earned} coins earned</h3>
    <h3 style="margin-top:18px">Reports against (${d.reportsAgainst.length}) · filed ${d.reportsFiled}</h3>${d.reportsAgainst.map((r) => `<div class="line"><time>${ago(r.created_at)}</time><b>${esc(r.reason)}</b> by ${esc(r.reporterName)} <span class="chip">${esc(r.status)}</span>${r.context ? `<pre>${esc(r.context)}</pre>` : ''}</div>`).join('') || '<p class="muted">None.</p>'}
    <h3 style="margin-top:18px">Moderation history</h3>${d.actions.map((a) => `<div class="line"><time>${ago(a.at)}</time><b>${esc(a.action)}</b> ${a.minutes ? `${a.minutes} min` : ''}: ${esc(a.reason ?? '')} <span class="muted">by ${esc(a.by)}</span></div>`).join('') || '<p class="muted">Clean record.</p>'}
    <h3 style="margin-top:18px">Chat · last 72 hours</h3>${d.chat.map((c) => `<div class="line"><time>${ago(c.at)}</time><span class="muted">${esc(c.room)}</span> ${esc(c.text)}</div>`).join('') || '<p class="muted">No chat.</p>'}`
  $('#coin-go').onclick = async () => {
    const amount = Number($('#coin-amt').value)
    if (!amount) return
    const r = await admin(`/users/${encodeURIComponent(id)}/coins`, { amount, reason: $('#coin-why').value || 'moderator adjustment' })
    toast(r.ok ? `Balance now ${fmt(r.coins)}` : `Failed: ${r.error}`); showPlayer(id)
  }
}

// ---------- chat, crashes ----------
async function searchChat() {
  const { chat } = await admin(`/chat?q=${encodeURIComponent($('#chat-q').value)}&room=${encodeURIComponent($('#chat-room').value)}`)
  $('#chat').innerHTML = chat.map((c) => `<div class="line"><time>${ago(c.at)}</time><span class="muted">${esc(c.room)}</span> <span class="who" data-player="${esc(c.user_id)}">${esc(c.name)}</span>: ${esc(c.text)}</div>`).join('') || '<p class="muted">Nothing.</p>'
}
$('#chat-go').onclick = searchChat
$('#chat-q').onkeydown = $('#chat-room').onkeydown = (e) => { if (e.key === 'Enter') searchChat() }
async function errors() {
  const { errors } = await admin('/errors')
  $('#errors').innerHTML = errors.map((e) => `<div class="report"><div class="row"><b>${esc(e.message)}</b><span class="chip">${e.n}×</span><span class="muted">last ${ago(e.last)} · ${esc(e.url ?? '')}</span></div>${e.stack ? `<pre>${esc(e.stack.slice(0, 900))}</pre>` : ''}<small class="muted">${esc(e.ua ?? '')}</small></div>`).join('') || '<div class="card"><p class="muted" style="margin:0">No crashes reported.</p></div>'
}

// ---------- controls ----------
async function city() {
  const m = await admin('/maintenance')
  const st = $('#maint-state'); st.textContent = m.on ? 'On' : 'Off'; st.className = 'chip ' + (m.on ? 'red' : 'green')
  const b = await admin('/backups').catch(() => null)
  $('#backups').innerHTML = !b || b.error ? 'Backups aren’t set up on this server.' : `<div class="row" style="margin-bottom:10px"><button class="btn small blue" id="snap">Back up now</button><span class="muted">${b.backups.length} snapshot${b.backups.length === 1 ? '' : 's'} kept${b.dir ? ' in ' + esc(b.dir) : ''}</span></div>
    <table><tr><th>Snapshot</th><th>Size</th><th>When</th><th></th></tr>${b.backups.map((x) => `<tr><td><code>${esc(x.name)}</code></td><td>${(x.bytes / 1048576).toFixed(1)} MB</td><td>${ago(x.at)}</td><td><a class="btn small ghost" href="/api/admin/backups/${encodeURIComponent(x.name)}">Download</a></td></tr>`).join('')}</table>`
  const snap = $('#snap')
  if (snap) snap.onclick = async () => { snap.disabled = true; const r = await admin('/backups', {}); toast(r.ok ? 'Backup saved' : 'Backup failed'); city() }
}
$('#ann-go').onclick = async () => { const text = $('#ann').value.trim(); if (!text) return; const r = await admin('/announce', { text }); toast(r.ok ? 'Sent to everyone online' : 'Failed'); $('#ann').value = '' }
$('#maint-on').onclick = async () => { if (!confirm('Close the city for maintenance? Everyone online will be disconnected.')) return; await admin('/maintenance', { on: true, message: $('#maint-msg').value || undefined }); city(); pulse() }
$('#maint-off').onclick = async () => { await admin('/maintenance', { on: false }); city(); pulse() }

boot()
