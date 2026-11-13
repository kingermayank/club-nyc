// Evaluated in a persona's page by tools/sim/citysim.py (page.evaluate). Returns what a person would
// perceive on screen, compactly, plus a click point for everything clickable:
//   game  - the room, you, people here, world hotspots (cutouts, zones, seats) with click points
//   ctrls - visible, unobstructed buttons/links/inputs/clickable divs (tagged data-sim-ref="cN")
//   text  - HUD, open panel, notices, toasts, hover label, or the page text when there is no stage
//   chat  - the last chat-log lines
// Points are screen pixels; citysim.py converts them into the agents 960x540 picture space.
(opts) => {
  opts = opts || {}
  const VW = innerWidth, VH = innerHeight
  const out = { path: location.pathname + location.search, title: document.title }
  const VIS = { checkOpacity: true, checkVisibilityCSS: true, opacityProperty: true, visibilityProperty: true }
  const shown = (el) => {
    if (!el || !el.isConnected) return false
    if (el.checkVisibility && !el.checkVisibility(VIS)) return false
    const r = el.getBoundingClientRect()
    return r.width >= 2 && r.height >= 2 && r.right > 0 && r.bottom > 0 && r.left < VW && r.top < VH
  }
  const BLOCK = /^(block|flex|grid|list-item|table|table-row|flow-root|table-caption)$/
  const SOFT = /^(inline-block|inline-flex|inline-grid|table-cell)$/
  /** block-aware text with <img alt> (the game draws emoji as images) and form state */
  const textOf = (root, max = 1500, viewportOnly = false) => {
    let s = ''
    const walk = (n) => {
      if (s.length > max * 1.5) return
      if (n.nodeType === 3) { s += n.data; return }
      if (n.nodeType !== 1) return
      const tag = n.nodeName
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'svg' || tag === 'TEMPLATE') return
      if (tag === 'IMG') { if (n.alt && shown(n)) s += n.alt; return }
      if (tag === 'BR') { s += '\n'; return }
      if (n.checkVisibility && !n.checkVisibility(VIS)) return
      if (viewportOnly) {
        const r = n.getBoundingClientRect()
        if (r.bottom < 0 || r.top > VH || r.right < 0 || r.left > VW) return
      }
      if (tag === 'INPUT') {
        const t = (n.type || 'text').toLowerCase()
        if (t === 'checkbox' || t === 'radio') s += n.checked ? ' [x] ' : ' [ ] '
        else if (t !== 'hidden') s += ` [${t}: ${n.value || n.placeholder || ''}] `
        return
      }
      if (tag === 'TEXTAREA') { s += ` [text: ${n.value || n.placeholder || ''}] `; return }
      if (tag === 'SELECT') { s += ` [${n.options[n.selectedIndex] ? n.options[n.selectedIndex].text : ''} ▾] `; return }
      const d = getComputedStyle(n).display
      const block = BLOCK.test(d), soft = SOFT.test(d)
      if (block) s += '\n'; else if (soft) s += ' '
      for (const c of n.childNodes) walk(c)
      if (block) s += '\n'; else if (soft) s += ' '
    }
    walk(root)
    return s.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{2,}/g, '\n').trim().slice(0, max)
  }
  const oneLine = (t, max = 70) => (t || '').replace(/\s+/g, ' ').trim().slice(0, max)

  // ---------- the world ----------
  const g = window.clubNyc
  const stageEl = document.querySelector('.stage')
  const inGame = !!(g && g.world && g.world.room && stageEl && shown(stageEl))
  let S = (p) => [Math.round(p[0]), Math.round(p[1])]
  if (inGame) {
    const w = g.world
    const sr = stageEl.getBoundingClientRect()
    const sc = sr.width / 1000
    S = (p) => [Math.round(sr.left + p[0] * sc), Math.round(sr.top + p[1] * sc)]
    const inRect = (p, r) => p[0] >= r[0] && p[0] <= r[2] && p[1] >= r[1] && p[1] <= r[3]
    const inPoly = (p, poly) => {
      let c = false
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i], [xj, yj] = poly[j]
        if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
      }
      return c
    }
    // the same order world.ts hitAt() uses: front-most first
    const firstHit = (p) => {
      for (const h of w.hits) {
        if (!inRect(p, h.rect)) continue
        if (h.kind === 'cutout') {
          const a = h.alpha
          if (!a) continue
          const [x1, y1, x2, y2] = h.rect
          const ax = Math.min(a.w - 1, Math.floor(((p[0] - x1) / (x2 - x1)) * a.w))
          const ay = Math.min(a.h - 1, Math.floor(((p[1] - y1) / (y2 - y1)) * a.h))
          if (a.data[(ay * a.w + ax) * 4 + 3] > 60) return h
        } else if (h.poly) {
          if (inPoly(p, h.poly)) return h
        } else return h
      }
      return null
    }
    // true when something other than the world itself (a panel, a full-screen scene, the HUD) is on top there
    const uiAt = (sx, sy) => {
      const top = document.elementFromPoint(sx, sy)
      if (!top) return true
      if (top.closest('.hud, .toolbar, .notices, .toasts, .mp-spot, .coin, .chat-log')) return true
      return !(top.closest('.scene, .overhead-layer, .fx-layer') || top.matches('.room-bg, .stage, .overlay, .viewport'))
    }
    const clickPoint = (h) => {
      const [x1, y1, x2, y2] = h.rect
      const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2
      const pts = [[cx, cy]]
      const N = 11
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) pts.push([x1 + ((x2 - x1) * (i + 0.5)) / N, y1 + ((y2 - y1) * (j + 0.5)) / N])
      pts.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy))
      for (const p of pts) {
        if (firstHit(p) !== h) continue
        const [sx, sy] = S(p)
        if (sx < 0 || sy < 0 || sx >= VW || sy >= VH || uiAt(sx, sy)) continue
        return [sx, sy]
      }
      return null
    }
    const me = w.player
    const save = g.save || {}
    // is the city itself visible, or is a full-screen scene / big panel over it?
    const probes = [[300, 300], [500, 280], [700, 320], [500, 420]]
    const coveredCount = probes.filter((p) => { const [sx, sy] = S(p); return uiAt(sx, sy) }).length
    const game = {
      room: w.room.id,
      place: (w.plate && w.plate.name) || w.room.name,
      area: (w.plate && w.plate.area) || w.room.area,
      indoor: !!w.room.indoor,
      me: { name: save.name, at: S(me.pos), sitting: !!me.seat, coins: save.coins, stamps: (save.stamps || []).length, team: save.team || null },
    }
    // people: city locals and real players (remote actors live in world.npcs too)
    game.people = []
    for (const a of w.npcs || []) {
      if (a.leaving) continue
      let at = S([a.pos[0], a.pos[1] - 45])
      try {
        const r = (a.wrap || a.el).getBoundingClientRect()
        if (r.width > 4) at = [Math.round(r.left + r.width / 2), Math.round(r.top + r.height * 0.55)]
      } catch (e) {}
      const bubble = a.bubble && a.bubble.classList.contains('show') ? oneLine(textOf(a.bubble, 140), 140) : ''
      const hidden = uiAt(at[0], at[1])
      game.people.push({ name: a.name, kind: a.remote ? 'player' : 'local', at: hidden ? null : at, sitting: !!a.seat, pose: a.view && a.view.pose, says: bubble })
    }
    const myBubble = me.bubble && me.bubble.classList.contains('show') ? oneLine(textOf(me.bubble, 140), 140) : ''
    if (myBubble) game.me.says = myBubble
    // world hotspots
    const things = []
    let seats = 0
    const seatPts = []
    for (const h of w.hits) {
      if (h.kind === 'seat') {
        seats++
        if (seatPts.length < 3) { const p = clickPoint(h); if (p) seatPts.push(p) }
        continue
      }
      const def = h.def || {}
      const label = def.label || h.id
      const p = clickPoint(h)
      things.push({ ref: 'h:' + h.id, label, go: def.go || null, sit: !!def.sit, at: p })
    }
    game.things = opts.blind ? [] : things
    game.seats = opts.blind ? { count: 0, some: [] } : { count: seats, some: seatPts }
    game.covered = coveredCount >= 3
    out.game = game
  }

  // ---------- controls: buttons, links, inputs, clickable divs ----------
  document.querySelectorAll('[data-sim-ref]').forEach((e) => e.removeAttribute('data-sim-ref'))
  const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, summary, label, [role=button], [role=tab], [role=link], [role=option], [role=checkbox], [role=radio], [role=menuitem], [onclick]'
  const cands = new Set()
  document.querySelectorAll(SEL).forEach((e) => cands.add(e))
  // clickable divs: their own cursor says "do something" (a pointer, a grab hand, a custom stamp cursor) and their
  // parent's cursor is different (cursor is inherited)
  const skip = (e) => e.matches('.overhead-layer, svg, img.cutout, script, style')
  const PLAIN = /^(auto|default|text|none|not-allowed|vertical-text|initial|inherit|unset|wait|progress|help|context-menu|cell)$/
  const cursorOf = new Map()
  const scan = (e, parentCur) => {
    for (const c of e.children) {
      if (skip(c)) continue
      const cur = getComputedStyle(c).cursor
      // (or a click/press handler set from script: the MetroCard you stamp hides the cursor with cursor:none)
      const handler = typeof c.onclick === 'function' || typeof c.onpointerdown === 'function' || typeof c.onmousedown === 'function'
      if ((!PLAIN.test(cur) && cur !== parentCur) || handler) { cands.add(c); cursorOf.set(c, cur) }
      scan(c, cur)
    }
  }
  scan(document.body, 'auto')
  const list = []
  for (const e of cands) {
    if (!shown(e)) continue
    if (e.closest('.overhead-layer')) continue
    if (e.matches('img.cutout') || (e.closest('.scene') && !e.matches('button, a, [role=button]'))) continue
    if (e.disabled && e.matches('input[type=checkbox], input[type=radio]')) continue
    const r = e.getBoundingClientRect()
    // tiny or huge (backdrops) things aren't buttons a person would aim at
    if (r.width * r.height > VW * VH * 0.6) continue
    // is any of it actually on top? try the centre, then a few other points
    const pts = [[0.5, 0.5], [0.3, 0.5], [0.7, 0.5], [0.5, 0.3], [0.5, 0.7], [0.15, 0.5], [0.85, 0.5]]
    let at = null
    for (const [fx, fy] of pts) {
      const x = Math.min(VW - 1, Math.max(0, r.left + r.width * fx)), y = Math.min(VH - 1, Math.max(0, r.top + r.height * fy))
      const top = document.elementFromPoint(x, y)
      if (top && (top === e || e.contains(top) || (e.htmlFor && top.id === e.htmlFor) || (e.matches('label') && top.closest('label') === e))) { at = [Math.round(x), Math.round(y)]; break }
    }
    if (!at) continue
    list.push({ e, r, at })
  }
  // drop a candidate nested inside another candidate (an icon inside its button), keep the outer one
  const els = new Set(list.map((c) => c.e))
  const ctrls = []
  let n = 0
  for (const c of list) {
    let p = c.e.parentElement, nested = false
    while (p) { if (els.has(p)) { nested = true; break } p = p.parentElement }
    if (nested && !c.e.matches('input, select, textarea')) continue
    const e = c.e
    const tag = e.nodeName.toLowerCase()
    let kind = tag === 'a' ? 'link' : tag === 'input' ? 'input' : tag === 'select' ? 'select' : tag === 'textarea' ? 'input' : 'button'
    let label = e.getAttribute('aria-label') || ''
    const txt = oneLine(textOf(e, 160), 90)
    if (opts.blind) label = txt || e.getAttribute('placeholder') || ''
    else if (!label) label = txt
    else if (txt && !label.includes(txt) && txt.length < 40) label = `${label} · ${txt}`
    if (!label && !opts.blind) label = e.getAttribute('title') || (e.querySelector('img[alt]') || {}).alt || e.getAttribute('placeholder') || ''
    let extra = ''
    if (tag === 'input') {
      const t = (e.type || 'text').toLowerCase()
      kind = t === 'checkbox' || t === 'radio' ? t : 'input'
      if (t === 'checkbox' || t === 'radio') { extra = e.checked ? 'checked' : 'unchecked'; const lab = e.closest('label'); if (!label && lab) label = oneLine(textOf(lab, 120), 90) }
      else extra = `value="${(e.value || '').slice(0, 40)}"${e.placeholder ? ` placeholder="${e.placeholder.slice(0, 40)}"` : ''}${e.maxLength > 0 ? ` max=${e.maxLength}` : ''}`
    } else if (tag === 'select') {
      const opts = [...e.options].map((o) => o.text)
      extra = `selected="${e.options[e.selectedIndex] ? e.options[e.selectedIndex].text : ''}" options=${opts.length > 14 ? `[${opts.slice(0, 6).join('|')} … ${opts.slice(-3).join('|')}] (${opts.length})` : `[${opts.join('|')}]`}`
    }
    if (!label && opts.blind && !e.matches('input, select, textarea')) label = '(an icon or picture with no text; hover it to find out)'
    if (!label) {
      // an unlabelled option (a colour swatch, a hairstyle): name it after its group heading + its position
      let group = ''
      for (let a = e.parentElement, k = 0; a && k < 4 && !group; a = a.parentElement, k++) {
        for (let sib = a.previousElementSibling, j = 0; sib && j < 2 && !group; sib = sib.previousElementSibling, j++) {
          const t = oneLine(textOf(sib, 60), 40)
          if (t && t.length <= 30 && !sib.querySelector('button')) group = t
        }
      }
      const same = e.parentElement ? [...e.parentElement.children].filter((x) => x.classList[0] === e.classList[0]) : [e]
      label = `${group ? group + ' ' : ''}option ${same.indexOf(e) + 1} of ${same.length}`
    }
    const on = ['on', 'sel', 'selected', 'active', 'picked', 'current', 'chosen', 'is-on', 'is-active'].some((k) => e.classList.contains(k)) || e.getAttribute('aria-pressed') === 'true' || e.getAttribute('aria-checked') === 'true' || e.getAttribute('aria-selected') === 'true'
    if (on && kind === 'button') extra = (extra ? extra + ' ' : '') + '(selected)'
    const cur = cursorOf.get(e) || getComputedStyle(e).cursor
    if (/grab/.test(cur)) extra = (extra ? extra + ' ' : '') + '(draggable: use drag)'
    else if (/url\(/.test(cur)) extra = (extra ? extra + ' ' : '') + '(custom cursor here)'
    if (e.classList.contains('coin') && e.closest('.scene')) label = 'a coin on the ground'
    else if (opts.blind && e.closest('.scene')) label = '(something in the scene you could click: see the picture)'
    const ref = 'c' + (++n)
    e.setAttribute('data-sim-ref', ref)
    const href = tag === 'a' ? e.getAttribute('href') : null
    ctrls.push({ ref, kind, label: oneLine(label, 90), at: c.at, extra, href, disabled: !!e.disabled || e.getAttribute('aria-disabled') === 'true', where: e.closest('.toolbar') ? 'toolbar' : e.closest('.hud') ? 'hud' : e.closest('.overlay') ? 'panel' : e.closest('.notices') ? 'notice' : e.closest('.scene') ? 'world' : stageEl && stageEl.contains(e) ? 'screen' : '' })
  }
  out.ctrls = ctrls

  // ---------- the map: landmarks are image regions, not buttons (labels come from map.ts via opts) ----------
  const art = document.querySelector('.postcard-art')
  if (art && shown(art) && !opts.blind) {
    const info = []
    for (const img of art.querySelectorAll('img.map-cut')) {
      if (!img.complete || !img.naturalWidth) continue
      const id = (img.src.match(/\/map\/([^/.]+)\.png/) || [])[1]
      const r = img.getBoundingClientRect()
      const w = Math.max(1, Math.round(img.naturalWidth / 4)), h = Math.max(1, Math.round(img.naturalHeight / 4))
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h
      const cx = cv.getContext('2d', { willReadFrequently: true }); cx.drawImage(img, 0, 0, w, h)
      info.push({ id, r, w, h, data: cx.getImageData(0, 0, w, h).data, area: r.width * r.height })
    }
    const solid = (sh, x, y) => {
      const ax = Math.floor(((x - sh.r.left) / sh.r.width) * sh.w), ay = Math.floor(((y - sh.r.top) / sh.r.height) * sh.h)
      return ax >= 0 && ay >= 0 && ax < sh.w && ay < sh.h && sh.data[(ay * sh.w + ax) * 4 + 3] > 60
    }
    info.sort((a, b) => a.area - b.area)
    const labels = opts.mapLabels || {}
    out.map = []
    for (const sh of info) {
      let best = null, bd = 1e9
      const mx = sh.r.left + sh.r.width / 2, my = sh.r.top + sh.r.height / 2
      const N = 16
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const x = sh.r.left + (sh.r.width * (i + 0.5)) / N, y = sh.r.top + (sh.r.height * (j + 0.5)) / N
        if (x < 0 || y < 0 || x >= VW || y >= VH || !solid(sh, x, y)) continue
        if (info.some((o) => o !== sh && o.area < sh.area && solid(o, x, y))) continue
        const top = document.elementFromPoint(x, y)
        if (top && !art.contains(top)) continue
        const d = Math.hypot(x - mx, y - my)
        if (d < bd) { bd = d; best = [Math.round(x), Math.round(y)] }
      }
      if (best) out.map.push({ ref: 'm:' + sh.id, label: labels[sh.id] || sh.id, at: best })
    }
  }

  // ---------- the subway map: stations are SVG groups with click listeners ----------
  const board = document.querySelector('.subway-board')
  if (board && shown(board)) {
    out.stations = []
    board.querySelectorAll('g.stop').forEach((g, i) => {
      const hit = g.querySelector('.sw-hit') || g
      const r = hit.getBoundingClientRect()
      const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2)
      const name = oneLine((g.querySelector('.stop-name') || {}).textContent || '', 40)
      const sub = oneLine((g.querySelector('.stop-sub') || {}).textContent || '', 40)
      const top = document.elementFromPoint(x, y)
      if (top && !g.contains(top) && !board.contains(top)) return
      out.stations.push({ ref: 's:' + (i + 1), label: `${name}${sub ? ' (' + sub + ')' : ''}${g.classList.contains('here') ? ' ← you are here' : ''}`, at: [x, y] })
    })
  }

  // ---------- text on screen ----------
  const text = {}
  if (inGame) {
    const pick = (sel, max) => { const e = document.querySelector(sel); return e && shown(e) ? textOf(e, max) : '' }
    text.hud = oneLine(pick('.hud', 300), 200)
    text.panel = pick('.overlay', 2200)
    text.notices = pick('.notices', 500)
    text.toasts = pick('.toasts', 500)
    text.hover = oneLine(pick('.hover-label', 120), 120)
    // full-screen scenes mount on the stage itself (sign-in, consent, the creator, the arrival story, the tour)
    const LAYERS = /^(room-bg|scene|overhead-layer|fx-layer|hover-label|hud|toolbar|notices|overlay|toasts|fade)$/
    let extra = ''
    for (const c of stageEl.children) {
      if (LAYERS.test(c.classList[0] || '') || !shown(c)) continue
      const t = textOf(c, 1600)
      if (t) extra += t + '\n'
    }
    // and anything drawn outside the stage
    const vp = stageEl.closest('.viewport') || stageEl
    for (const c of document.body.children) {
      if (c === vp || c.contains(vp) || !shown(c)) continue
      if (c.matches('script, style')) continue
      extra += textOf(c, 1200, true) + '\n'
    }
    text.extra = extra.trim().slice(0, 1500)
  } else {
    text.page = textOf(document.body, 2600, true)
    text.scroll = { y: Math.round(scrollY), max: Math.max(0, Math.round(document.documentElement.scrollHeight - VH)) }
  }
  out.text = text
  out.focus = document.activeElement && document.activeElement !== document.body ? `${document.activeElement.nodeName.toLowerCase()}${document.activeElement.className ? '.' + String(document.activeElement.className).split(' ')[0] : ''}` : ''

  // ---------- chat log (kept in the DOM even when closed) ----------
  // (read raw: the log is usually closed, so its lines aren't "visible")
  const raw = (n) => n.nodeType === 3 ? n.data : n.nodeName === 'IMG' ? (n.alt || '') : [...n.childNodes].map(raw).join('')
  out.chat = [...document.querySelectorAll('.chat-log-list .chat-line')].slice(-14).map((l) => {
    const b = l.querySelector('b'), sp = l.querySelector('span')
    return oneLine(b ? `${raw(b)}: ${sp ? raw(sp) : ''}` : raw(l), 200)
  }).filter(Boolean)
  // sounds the game played since the last look (citysim hooks clubNyc.api.sfx)
  out.sounds = (window.__simSounds || []).splice(0)
  return out
}
