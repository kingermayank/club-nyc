// The moderator dashboard (admin.html). Kept out of the page so the site's Content-Security-Policy can forbid inline scripts.
const $ = (s, r = document) => r.querySelector(s)
const $$ = (s, r = document) => [...r.querySelectorAll(s)]
const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const ago = (t) => { if (!t) return 'never'; const s = Math.round((Date.now() - t) / 1000); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : s < 86400 ? `${Math.round(s / 3600)}h ago` : `${Math.round(s / 86400)}d ago` }
const when = (t) => t ? new Date(t).toLocaleString() : 'never'
function toast(m) { const t = $('#toast'); t.textContent = m; t.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => (t.style.display = 'none'), 2600) }
async function api(path, opts = {}) {
  const res = await fetch('/api/admin' + path, { method: opts.body ? 'POST' : (opts.method || 'GET'), headers: opts.body ? { 'content-type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: 'same-origin' })
  if (res.status === 401) { showLogin(); throw new Error('signed out') }
  return res.json()
}
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#logout').hidden = true }
async function boot() {
  const s = await fetch('/api/admin/session').then((r) => r.json()).catch(() => ({ ok: false, enabled: false }))
  if (!s.enabled) { $('#login').hidden = false; $('#login').innerHTML = '<h2>Dashboard is off</h2><p class="muted">Set the <code>ADMIN_TOKEN</code> variable on the server to turn it on.</p>'; return }
  if (!s.ok) return showLogin()
  $('#login').hidden = true; $('#app').hidden = false; $('#logout').hidden = false
  tab('overview')
  setInterval(() => { if (!document.hidden && current === 'overview') overview() }, 15000)
}
$('#go').onclick = async () => {
  const r = await fetch('/api/admin/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: $('#token').value }), credentials: 'same-origin' })
  if (r.ok) boot(); else $('#login-err').textContent = r.status === 429 ? 'Too many tries. Wait a minute.' : 'That token didn’t work.'
}
$('#token').onkeydown = (e) => e.key === 'Enter' && $('#go').click()
$('#logout').onclick = async () => { await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' }); location.reload() }

let current = 'overview'
function tab(name) {
  current = name
  $$('nav button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name))
  $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== name))
  ;({ overview, reports, players: () => searchPlayers(''), chat: searchChat, errors, city })[name]?.()
}
$$('nav button').forEach((b) => (b.onclick = () => tab(b.dataset.tab)))

// ---------- overview ----------
async function overview() {
  const o = await api('/overview')
  $('#hdr-live').textContent = `${o.live.online} online · ${o.live.maintenance ? 'MAINTENANCE' : 'open'}`
  const badge = $('#badge-reports'); badge.hidden = !o.safety.openReports; badge.textContent = o.safety.openReports
  const s = (n, label, cls = '') => `<div class="stat ${cls}"><b>${Number(n ?? 0).toLocaleString()}</b><small>${label}</small></div>`
  const pct = (n, label, note) => `<div class="stat"><b>${n === null || n === undefined ? 'n/a' : `${n}%`}</b><small>${label}${note ? `<br><i>${note}</i>` : ''}</small></div>`
  $('[data-panel=overview]').innerHTML = `
    <div class="card"><h2>Right now</h2><div class="grid">${s(o.live.online, 'New Yorkers online')}${s(o.live.parties, 'house parties')}${s(o.accounts.active24h, 'active in 24h')}${s(o.safety.openReports, 'open reports')}${s(o.errors24h, 'crash reports in 24h')}</div></div>
    <div class="card"><h2>Growth</h2><div class="grid">${s(o.accounts.total, 'New Yorkers (all time)')}${s(o.accounts.new24h, 'new in 24h')}${s(o.accounts.new7d, 'new in 7 days')}${s(o.accounts.linked, 'linked Google/X/Discord')}${s(o.accounts.invited, 'joined via invite')}${s(o.accounts.invited24h, 'invites accepted · 24h')}</div></div>
    <div class="card"><h2>Is it spreading? Do they come back?</h2><div class="grid">${s(o.growth.playedToday, 'played today (NY time)')}${s(o.growth.playedWeek, 'played in the last 7 days')}${pct(o.growth.nextDayPct, 'came back the next day', 'of players who joined 2–8 days ago')}${pct(o.growth.weekLaterPct, 'still playing a week later', 'of players who joined 8–21 days ago')}${pct(o.growth.viaInvitePct, 'of new players came via an invite', 'last 7 days')}${pct(o.growth.invitesStuckPct, 'of invited friends played 10+ min', 'invites older than a day')}${s(o.growth.newPlayMin, 'avg minutes played by players who joined in the last 7 days')}</div><p class="muted">“Played” = opened the city that day (the daily refill is the marker). Percentages show “n/a” until there’s enough history.</p></div>
    ${o.landing ? `<div class="card"><h2>Landing page · last 7 days</h2><div class="grid">${s(o.landing.visits, 'visits')}${s(o.landing.play, 'pressed Play now')}${pct(o.landing.visits ? Math.round((o.landing.play / o.landing.visits) * 100) : null, 'click-through', 'Play ÷ visits')}${s(o.landing.created, 'made a New Yorker')}${s(o.landing.spawned, 'walked into the city')}${s(o.landing.trailer ?? 0, 'watched the trailer')}${s(o.landing.phones, 'on a phone')}${s(o.landing.sent, 'sent themselves the link')}${s(o.landing.discord, 'opened the Discord')}</div><p class="muted">One visit = one browser tab. "Made a New Yorker" counts visits that went on to finish the creator in that tab.</p></div>` : ''}
    <div class="card"><h2>New Yorker creator · last 7 days</h2><div class="grid">${s(o.creator.opened, 'opened the creator')}${s(o.creator.presets, 'picked a ready-made look')}${s(o.creator.shuffled, 'hit Surprise me')}${s(o.creator.tweaked, 'tweaked skin / hair / color')}${s(o.creator.nameScreen, 'reached the name screen')}${s(o.creator.wheels, 'spun the name wheels')}${s(o.creator.typed, 'typed their own name')}${s(o.creator.done, 'finished')}${pct(o.creator.opened ? Math.round((o.creator.done / o.creator.opened) * 100) : null, 'finish rate', 'finished ÷ opened')}${s(o.creator.medianSec ?? 0, 'median seconds to finish')}</div><p class="muted">Counted per page-load session, so a refresh mid-creator counts twice.</p></div>
    <div class="card"><h2>Safety</h2><div class="grid">${s(o.safety.reports24h, 'reports · 24h')}${s(o.safety.actions24h, 'mod actions · 24h')}${s(o.safety.muted, 'muted now')}${s(o.safety.banned, 'banned / suspended')}${s(o.safety.chat24h, 'chat lines · 24h')}</div></div>
    <div class="card"><h2>Economy</h2><div class="grid">${s(o.economy.coins, 'coins in wallets')}${s(o.economy.earned24h, 'coins earned · 24h')}${s(o.economy.spent24h, 'coins spent · 24h')}</div></div>
    <div class="card"><h2>Busiest rooms</h2><table><tr><th>Room</th><th>Copy</th><th>Players</th></tr>${o.live.rooms.slice(0, 15).map((r) => `<tr><td>${esc(r.room)}</td><td>${r.inst}</td><td>${r.players}</td></tr>`).join('') || '<tr><td colspan=3 class="muted">Nobody online.</td></tr>'}</table></div>
    <div class="card"><h2>Server</h2><p class="muted">Up ${Math.round(o.server.uptimeSec / 60)} min · ${o.server.rssMB} MB RAM · Node ${esc(o.server.node)} · ${o.live.msgsIn.toLocaleString()} messages in / ${o.live.msgsOut.toLocaleString()} out · ${o.live.dropped} slow clients dropped</p></div>`
}

// ---------- reports ----------
const ACTIONS = [['warn', 'Warn', ''], ['mute', 'Mute 1h', 60], ['mute', 'Mute 24h', 1440], ['ban', 'Suspend 1d', 1440], ['ban', 'Suspend 7d', 10080], ['ban', 'Ban', 0], ['rename', 'Reset name', '']]
function actionButtons(kind, id) {
  return `<div class="row"><input class="reason" placeholder="Reason (the player sees this)" style="flex:1;min-width:220px">${ACTIONS.map(([a, label, m]) => `<button class="b ${a === 'ban' ? 'red' : ''}" data-act="${a}" data-min="${m}" data-kind="${kind}" data-id="${id}">${label}</button>`).join('')}${kind === 'report' ? `<button class="b" data-dismiss="${id}">Dismiss</button>` : ''}</div>`
}
async function doAction(btn) {
  const box = btn.closest('.report, .card')
  const reason = box.querySelector('.reason')?.value ?? ''
  const minutes = btn.dataset.min ? Number(btn.dataset.min) : undefined
  if (btn.dataset.act === 'ban' && !minutes && !confirm('Permanently ban this player?')) return
  const path = btn.dataset.kind === 'report' ? `/reports/${btn.dataset.id}/action` : `/users/${btn.dataset.id}/action`
  const r = await api(path, { body: { action: btn.dataset.act, reason, minutes } })
  toast(r.ok ? 'Done ✓' : `Failed: ${r.error}`)
  if (btn.dataset.kind === 'report') reports(); else showPlayer(btn.dataset.id)
}
document.addEventListener('click', async (e) => {
  const t = e.target
  if (t.dataset?.act) return doAction(t)
  if (t.dataset?.dismiss) { await api(`/reports/${t.dataset.dismiss}/dismiss`, { body: { note: '' } }); toast('Dismissed'); return reports() }
  if (t.dataset?.player) { tab('players'); return showPlayer(t.dataset.player) }
})
async function reports() {
  const { reports } = await api(`/reports?status=${$('#report-status').value}`)
  $('#reports').innerHTML = reports.map((r) => `<div class="report">
      <div class="row"><span class="who" data-player="${esc(r.target)}">${esc(r.targetName)}</span><span class="pill amber">${esc(r.reason)}</span>
      <span class="muted">reported by <span class="who" data-player="${esc(r.reporter)}">${esc(r.reporterName)}</span> · ${ago(r.created_at)}</span>
      <span class="pill">${r.targetReports} report${r.targetReports === 1 ? '' : 's'} total</span>${r.targetActions ? `<span class="pill red">${r.targetActions} past action${r.targetActions === 1 ? '' : 's'}</span>` : ''}
      ${r.targetMuted ? '<span class="pill amber">muted</span>' : ''}${r.targetBanned ? '<span class="pill red">banned</span>' : ''}</div>
      ${r.context ? `<div class="ctx">${esc(r.context)}</div>` : ''}
      ${r.status === 'open' ? actionButtons('report', r.id) : `<p class="muted">${esc(r.status)} · ${esc(r.resolution ?? '')}</p>`}
    </div>`).join('') || '<p class="muted">Nothing here. 🎉</p>'
}
$('#report-status').onchange = reports

// ---------- players ----------
let searchTimer = 0
$('#player-q').oninput = (e) => { clearTimeout(searchTimer); searchTimer = setTimeout(() => searchPlayers(e.target.value), 250) }
async function searchPlayers(q) {
  const { users } = await api(`/users?q=${encodeURIComponent(q)}`)
  $('#player-list').innerHTML = users.map((u) => `<div class="list-item" data-player="${esc(u.id)}"><b data-player="${esc(u.id)}">${esc(u.name)}</b> <span class="muted">#${u.memberNo}</span> ${u.online ? '<span class="pill green">online</span>' : ''}${u.banned ? '<span class="pill red">banned</span>' : ''}${u.muted ? '<span class="pill amber">muted</span>' : ''}<br><small class="muted">seen ${ago(u.lastSeen)}</small></div>`).join('') || '<p class="muted">No one found.</p>'
}
async function showPlayer(id) {
  const d = await api(`/users/${encodeURIComponent(id)}`)
  if (d.error) return ($('#player-detail').innerHTML = '<p class="muted">Not found (maybe deleted).</p>')
  const u = d.user
  $('#player-detail').innerHTML = `
    <h2>${esc(u.name)} <span class="muted">No. ${u.memberNo}</span> ${d.presence.online ? `<span class="pill green">online · ${esc(d.presence.room ?? '')}</span>` : ''}</h2>
    <p class="muted">Joined ${when(u.createdAt)} · last seen ${ago(u.lastSeen)} · played ${u.playMinutes} min · ${u.consent ? `agreed to the ${esc(u.consent.version)} terms ${ago(u.consent.at)}` : 'no consent on record'} · ${u.guest ? 'guest' : 'linked: ' + esc(u.providers.filter((p) => p !== 'guest').join(', '))} · team ${esc(u.team || 'none')} ${u.invitedBy ? `· invited by ${esc(u.invitedBy)}` : ''} · id <code>${esc(u.id)}</code></p>
    <div class="row">${d.banned ? `<span class="pill red">banned until ${d.banned.until > 7e12 ? 'forever' : when(d.banned.until)}: ${esc(d.banned.reason)}</span><button class="b" data-act="unban" data-kind="user" data-id="${esc(u.id)}">Unban</button>` : ''}${d.muted ? `<span class="pill amber">muted until ${when(d.muted.until)}</span><button class="b" data-act="unmute" data-kind="user" data-id="${esc(u.id)}">Unmute</button>` : ''}</div>
    <h3>Actions</h3>${actionButtons('user', esc(u.id))}
    <h3>Wallet · ${d.wallet.coins.toLocaleString()} coins · ${d.wallet.owned.length} items · homes: ${esc(d.wallet.homes.join(', '))}</h3>
    <div class="row"><input id="coin-amt" type="number" placeholder="+/- coins" style="width:110px"><input id="coin-why" placeholder="Why (e.g. bug refund)" style="flex:1"><button class="b" id="coin-go">Adjust</button></div>
    <table style="margin-top:6px"><tr><th>When</th><th>Change</th><th>Reason</th><th>Balance</th></tr>${d.ledger.map((l) => `<tr><td>${ago(l.at)}</td><td>${l.delta > 0 ? '+' : ''}${l.delta}</td><td>${esc(l.reason)}${l.ref ? ` <span class="muted">${esc(l.ref)}</span>` : ''}</td><td>${l.balance}</td></tr>`).join('')}</table>
    <h3>Invites · ${d.referrals.count} joined · ${d.referrals.earned} coins earned</h3>
    <h3>Reports against (${d.reportsAgainst.length}) · filed ${d.reportsFiled}</h3>${d.reportsAgainst.map((r) => `<div class="chat-line"><time>${ago(r.created_at)}</time><b>${esc(r.reason)}</b> by ${esc(r.reporterName)} <span class="pill">${esc(r.status)}</span>${r.context ? `<pre>${esc(r.context)}</pre>` : ''}</div>`).join('') || '<p class="muted">None.</p>'}
    <h3>Moderation history</h3>${d.actions.map((a) => `<div class="chat-line"><time>${ago(a.at)}</time><b>${esc(a.action)}</b> ${a.minutes ? `${a.minutes} min` : ''}: ${esc(a.reason ?? '')} <span class="muted">by ${esc(a.by)}</span></div>`).join('') || '<p class="muted">Clean record.</p>'}
    <h3>Chat · last 72 hours</h3>${d.chat.map((c) => `<div class="chat-line"><time>${ago(c.at)}</time><span class="muted">${esc(c.room)}</span> ${esc(c.text)}</div>`).join('') || '<p class="muted">No chat.</p>'}`
  $('#coin-go').onclick = async () => {
    const amount = Number($('#coin-amt').value)
    if (!amount) return
    const r = await api(`/users/${encodeURIComponent(id)}/coins`, { body: { amount, reason: $('#coin-why').value || 'moderator adjustment' } })
    toast(r.ok ? `Balance now ${r.coins}` : `Failed: ${r.error}`); showPlayer(id)
  }
}

// ---------- chat, errors ----------
async function searchChat() {
  const { chat } = await api(`/chat?q=${encodeURIComponent($('#chat-q').value)}&room=${encodeURIComponent($('#chat-room').value)}`)
  $('#chat').innerHTML = chat.map((c) => `<div class="chat-line"><time>${ago(c.at)}</time><span class="muted">${esc(c.room)}</span> <span class="who" data-player="${esc(c.user_id)}">${esc(c.name)}</span>: ${esc(c.text)}</div>`).join('') || '<p class="muted">Nothing.</p>'
}
$('#chat-go').onclick = searchChat
async function errors() {
  const { errors } = await api('/errors')
  $('#errors').innerHTML = errors.map((e) => `<div class="report"><div class="row"><b>${esc(e.message)}</b><span class="pill">${e.n}×</span><span class="muted">last ${ago(e.last)} · ${esc(e.url ?? '')}</span></div>${e.stack ? `<pre>${esc(e.stack.slice(0, 900))}</pre>` : ''}<small class="muted">${esc(e.ua ?? '')}</small></div>`).join('') || '<p class="muted">No crashes reported. 🎉</p>'
}

// ---------- the city ----------
async function city() {
  const m = await api('/maintenance')
  $('#maint-state').textContent = m.on ? 'ON' : 'off'; $('#maint-state').className = 'pill ' + (m.on ? 'red' : 'green')
  const b = await api('/backups').catch(() => null)
  $('#backups').innerHTML = !b || b.error ? 'Backups aren’t set up on this server.' : `<div class="row" style="margin-bottom:8px"><button class="b blue" id="snap">Back up now</button><span class="muted">${b.backups.length} snapshot${b.backups.length === 1 ? '' : 's'} kept${b.dir ? ' in ' + esc(b.dir) : ''}</span></div>
    <table><tr><th>Snapshot</th><th>Size</th><th>When</th><th></th></tr>${b.backups.map((x) => `<tr><td><code>${esc(x.name)}</code></td><td>${(x.bytes / 1048576).toFixed(1)} MB</td><td>${ago(x.at)}</td><td><a class="b" href="/api/admin/backups/${encodeURIComponent(x.name)}">Download</a></td></tr>`).join('')}</table>`
  const snap = $('#snap')
  if (snap) snap.onclick = async () => { snap.disabled = true; const r = await api('/backups', { body: {} }); toast(r.ok ? 'Backup saved ✓' : 'Backup failed'); city() }
}
$('#ann-go').onclick = async () => { const text = $('#ann').value.trim(); if (!text) return; const r = await api('/announce', { body: { text } }); toast(r.ok ? 'Sent to everyone online 📣' : 'Failed'); $('#ann').value = '' }
$('#maint-on').onclick = async () => { if (!confirm('Close the city for maintenance? Everyone online will be disconnected.')) return; await api('/maintenance', { body: { on: true, message: $('#maint-msg').value || undefined } }); city() }
$('#maint-off').onclick = async () => { await api('/maintenance', { body: { on: false } }); city() }
boot()
