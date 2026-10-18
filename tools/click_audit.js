/* In-page helpers for tools/click_audit.py — injected with add_init_script before the game loads.
 *
 * 1. An event log of everything a player could notice after a click: panels opening or changing, toasts,
 *    notices, stamps, tour cards, speech bubbles, emotes, sitting, room changes, mini-games and lobbies,
 *    rides, effects, sounds, downloads/new windows (window.open is recorded, never followed).
 * 2. A snapshot of the screen's state (room, open panel, player, …) for before/after comparisons.
 * 3. Finders that locate clickable things the way a player sees them: a room's hotspots (pixel-exact, using
 *    the game's own hit test rules), map shapes, and every button/link inside a panel.
 * Nothing here changes what the game does, except the explicit `teleport` used to skip long walks.
 */
(() => {
  if (window.__audit) return
  const A = (window.__audit = { log: [], seq: 0, attached: false })
  const now = () => Math.round(performance.now())
  const push = (e) => {
    e.seq = ++A.seq
    e.t = now()
    A.log.push(e)
    if (A.log.length > 6000) A.log.splice(0, 3000)
  }
  A.push = push
  // text as the player reads it: the game draws emoji as <img class="ji" alt="🍕">, so images count as their alt text
  const rawText = (x) =>
    x.nodeType === 3 ? x.data : x.nodeName === 'IMG' ? x.alt || '' : x.nodeName === 'STYLE' || x.nodeName === 'SCRIPT' ? '' : [...x.childNodes].map(rawText).join(x.nodeType === 1 ? ' ' : '')
  const txt = (n) => (n ? rawText(n) : '').replace(/\s+/g, ' ').trim().slice(0, 300)
  A.txt = txt
  const hash = (s) => {
    let h = 2166136261
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
    return (h >>> 0).toString(36)
  }
  A.hash = hash
  const clsOf = (n) => (typeof n.className === 'string' ? n.className : n.getAttribute?.('class') || '')

  // external windows are recorded, never opened
  window.open = function (url) {
    push({ kind: 'window-open', url: String(url) })
    return null
  }

  // ---------- watching the screen ----------
  const ADDED = [
    ['toast', '.toast'],
    ['stamp', '.stamp-toast'],
    ['notice', '.notice'],
    ['lobby', '.lobby'],
    ['game', '.game-shell'],
    ['ride', '.ride-car'],
    ['scene', '.scene-card'],
    ['payout', '.payout'],
    ['tour', '.tour'],
    ['announce', '.announce'],
    ['creator', '.creator'],
    ['title-card', '.title-card'],
    ['confetti', '.confetti'],
    ['fx', '.on-air, .house-lights, .snowball, .snow-splat, .float-text, .party-fx, .party-chip, .decor-tray, .mob-badge, .coin.rain, .bino'],
  ]
  let lastConfetti = -1e9
  function added(n) {
    if (!(n instanceof Element)) return
    for (const [kind, sel] of ADDED) {
      if (!n.matches(sel)) continue
      if (kind === 'confetti') {
        if (now() - lastConfetti < 500) return
        lastConfetti = now()
      }
      const e = { kind, cls: clsOf(n) }
      if (kind === 'tour') e.text = txt(n.querySelector('.tour-card b'))
      else if (kind !== 'confetti' && kind !== 'fx') e.text = txt(n)
      push(e)
      return
    }
  }
  const CLASS_WATCH = '.stage, .chat-log, .jam-join, .tb-btn, .furniture, .apt-btn, .cm-bell, .quests, .help-btn, .online-pill'
  let lastOverlay = ''
  function overlayCheck() {
    const ov = document.querySelector('.overlay')
    const info = ov && ov.classList.contains('open') && ov.firstElementChild ? A.overlayInfo(ov) : null
    const sig = info ? info.cls + '|' + info.title + '|' + info.sig : ''
    if (sig === lastOverlay) return
    lastOverlay = sig
    push({ kind: 'overlay', open: !!info, title: info?.title ?? '', cls: info?.cls ?? '', choices: info?.choices ?? [] })
  }
  const mo = new MutationObserver((recs) => {
    let ov = false
    for (const r of recs) {
      if (r.type === 'childList') {
        r.addedNodes.forEach(added)
        if (r.target instanceof Element && r.target.closest('.overlay')) ov = true
      } else if (r.type === 'attributes' && r.target instanceof Element) {
        const t = r.target
        if (t.classList.contains('overlay')) ov = true
        else if (t.closest('.overlay')) ov = true
        else if (t.classList.contains('shake') && !(r.oldValue || '').split(/\s+/).includes('shake')) {
          push({ kind: 'class', target: clsOf(t).split(' ')[0] || t.tagName.toLowerCase(), label: '', plus: ['shake'], minus: [] })
        } else if (t.matches(CLASS_WATCH)) {
          const before = new Set((r.oldValue || '').split(/\s+/).filter(Boolean))
          const after = new Set(t.classList)
          const plus = [...after].filter((c) => !before.has(c) && !['hover', 'pointing', 'bump'].includes(c))
          const minus = [...before].filter((c) => !after.has(c) && !['hover', 'pointing', 'bump'].includes(c))
          if (plus.length || minus.length) push({ kind: 'class', target: clsOf(t).split(' ')[0], label: t.getAttribute('aria-label') || '', plus, minus })
        }
      }
    }
    if (ov) overlayCheck()
  })
  const start = () => mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true })
  if (document.documentElement) start()
  else document.addEventListener('DOMContentLoaded', start)

  A.overlayInfo = (ov) => {
    const root = ov.firstElementChild
    const head = root.querySelector('h2, h3, .cat-masthead, .sw-title b, .sb-title, .np-mast, .sc-head b, .pc-name, .bino-hint')
    const title = txt(head) || clsOf(root)
    const choices = [...root.querySelectorAll('.choices > button, .pop-menu > button')].map(txt)
    return { cls: clsOf(root), title, choices, sig: hash(root.innerHTML.replace(/\d+(\.\d+)?px/g, '')) }
  }

  // ---------- hooks into the game (once window.clubNyc exists) ----------
  A.attach = () => {
    const c = window.clubNyc
    if (A.attached) return true
    if (!c || !c.world || !c.world.player) return false
    A.attached = true
    const who = (a) => (a.isPlayer ? 'player' : a.remote ? 'remote' : 'npc')
    const proto = Object.getPrototypeOf(c.world.player)
    const say = proto.say
    proto.say = function (text, ms) {
      push({ kind: 'say', who: who(this), name: this.name, text: String(text) })
      return say.call(this, text, ms)
    }
    const emote = proto.emote
    proto.emote = function (pose, s) {
      push({ kind: 'emote', who: who(this), name: this.name, pose })
      return emote.call(this, pose, s)
    }
    const sitOn = proto.sitOn
    proto.sitOn = function (seat) {
      push({ kind: 'sit', who: who(this), name: this.name, seat: seat && seat.id })
      return sitOn.call(this, seat)
    }
    const setLook = proto.setLook
    proto.setLook = function (l) {
      if (this.isPlayer) push({ kind: 'look', who: 'player' })
      return setLook.call(this, l)
    }
    const sfx = c.api.sfx
    for (const k of Object.keys(sfx)) {
      const f = sfx[k]
      if (typeof f !== 'function') continue
      sfx[k] = (...a) => {
        push({ kind: 'sfx', name: k })
        return f(...a)
      }
    }
    const goto = c.api.goto
    c.api.goto = (room, from) => {
      push({ kind: 'goto', room })
      return goto(room, from)
    }
    let lastRoom = c.world.room && c.world.room.id
    setInterval(() => {
      const r = c.world.room && c.world.room.id
      if (r !== lastRoom) {
        push({ kind: 'room', from: lastRoom, to: r })
        lastRoom = r
      }
    }, 40)
    return true
  }

  A.mark = () => A.seq
  A.since = (m) => A.log.filter((e) => e.seq > m)

  // ---------- what's on screen ----------
  const vis = (n) => {
    if (!n) return false
    const r = n.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return false
    const s = getComputedStyle(n)
    return s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05
  }
  A.vis = vis
  A.state = () => {
    const c = window.clubNyc
    const w = c && c.world
    const p = w && w.player
    const ov = document.querySelector('.overlay')
    const open = !!ov && ov.classList.contains('open') && !!ov.firstElementChild
    const stage = document.querySelector('.stage')
    const tour = document.querySelector('.tour:not(.out)')
    return {
      ready: !!(c && w && p),
      room: w && w.room ? w.room.id : null,
      plate: txt(document.querySelector('.place-plate')),
      overlay: open ? A.overlayInfo(ov) : null,
      lobby: !!document.querySelector('.lobby'),
      game: !!document.querySelector('.game-shell:not(.out)'),
      gameLoading: !!document.querySelector('.game-shell:not(.out) .game-loading:not([hidden])'),
      ride: !!document.querySelector('.ride-car'),
      scene: !!document.querySelector('.scene-card:not(.out)'),
      payout: !!document.querySelector('.payout:not(.out)'),
      tour: tour ? txt(tour.querySelector('.tour-card b')) || '(tour)' : null,
      creator: !!document.querySelector('.creator:not(.out):not(.signin)'),
      creatorSig: A.sig('.creator:not(.signin) .creator-right'),
      questsSig: A.sig('.quests'),
      furniture: document.querySelectorAll('.furniture-layer .furniture').length,
      traySig: A.sig('.decor-tray'),
      signin: !!document.querySelector('.signin:not(.out)'),
      stageCls: stage ? [...stage.classList].filter((k) => ['decorating', 'aiming', 'house-dark', 'debug'].includes(k)) : [],
      fading: !!document.querySelector('.fade.on'),
      player: p ? { x: Math.round(p.pos[0]), y: Math.round(p.pos[1]), seat: p.seat ? p.seat.id : null, held: p.held, said: p.said, moving: p.path.length > 0, tag: hash(p.wrap.querySelector('.name-tag')?.innerHTML || '') } : null,
      coins: c && c.save ? c.save.coins : null,
      url: location.pathname + location.search,
      chatLog: !!document.querySelector('.chat-log.open'),
      partyChip: !!document.querySelector('.party-chip'),
      notices: [...document.querySelectorAll('.notice:not(.out)')].map(txt),
      online: !!document.querySelector('.online-pill.on'),
      changing: !!document.querySelector('.fade.on'),
    }
  }
  A.poll = (m) => ({ ev: A.since(m), st: A.state() })

  // ---------- the game's hit test, replicated (engine/world.ts hitAt) ----------
  const inPoly = ([x, y], poly) => {
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]
      const [xj, yj] = poly[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
    }
    return inside
  }
  const inRect = ([x, y], [x1, y1, x2, y2]) => x >= x1 && x <= x2 && y >= y1 && y <= y2
  A.depth = (y) => {
    const g = window.clubNyc.world.geo
    const [y0, s0, y1, s1] = (g && g.depth) || [300, 0.62, 545, 1]
    const t = Math.max(-0.1, Math.min(1.15, (y - y0) / (y1 - y0)))
    return s0 + (s1 - s0) * t
  }
  A.npcBox = (a, m = 0) => {
    const s = A.depth(a.pos[1])
    const yy = a.seat ? a.pos[1] + 24 * s : a.pos[1]
    return [a.pos[0] - 22 * s - m, yy - 112 * s - m, a.pos[0] + 22 * s + m, yy + m]
  }
  A.npcAt = (p, m = 0) => {
    let best = null
    for (const a of window.clubNyc.world.npcs) {
      if (a.leaving) continue
      const b = A.npcBox(a, m)
      if (p[0] > b[0] && p[0] < b[2] && p[1] > b[1] && p[1] < b[3] && (!best || a.pos[1] > best.pos[1])) best = a
    }
    return best
  }
  const alphaAt = (h, p) => {
    const a = h.alpha
    if (!a) return -1
    const [x1, y1, x2, y2] = h.rect
    const ax = Math.floor(((p[0] - x1) / (x2 - x1)) * a.w)
    const ay = Math.floor(((p[1] - y1) / (y2 - y1)) * a.h)
    if (ax < 0 || ay < 0 || ax >= a.w || ay >= a.h) return -1
    return a.data[(ay * a.w + ax) * 4 + 3]
  }
  A.hitAt = (p, m = 0) => {
    const w = window.clubNyc.world
    const npc = A.npcAt(p, m)
    if (npc) return { npc }
    for (const h of w.hits) {
      if (!inRect(p, h.rect)) continue
      if (h.kind === 'cutout') {
        if (alphaAt(h, p) > 60) return { h }
      } else if (h.poly) {
        if (inPoly(p, h.poly)) return { h }
      } else return { h }
    }
    return {}
  }
  const stageEl = () => document.querySelector('.stage')
  const sceneEl = () => document.querySelector('.scene')
  A.toClient = (p) => {
    const r = stageEl().getBoundingClientRect()
    const k = r.width / 1000
    return [r.left + p[0] * k, r.top + p[1] * k]
  }
  A.toStage = (cx, cy) => {
    const r = stageEl().getBoundingClientRect()
    const k = r.width / 1000
    return [(cx - r.left) / k, (cy - r.top) / k]
  }
  /** what a click at this stage point would land on (null = the city itself) */
  A.blockerAt = (p) => {
    const [cx, cy] = A.toClient(p)
    const el = document.elementFromPoint(cx, cy)
    const scene = sceneEl()
    if (!el) return 'nothing'
    if (el === scene) return null
    if (scene.contains(el)) {
      const b = el.closest('.actor.is-player, .coin, .furniture, .candy-corn, button, a')
      return b ? clsOf(b).split(' ').slice(0, 2).join('.') || b.tagName.toLowerCase() : null
    }
    const top = el.closest('.quests, .online-pill, .help-btn, .jam-chip, .notice, .toolbar, .apt-controls, .party-chip, .chat-log, .jam-join, .decor-tray, .overlay, .tour, .hud, .announce, .mob-badge, .game-shell, .payout')
    return top ? '.' + clsOf(top).split(' ')[0] : el.tagName.toLowerCase() + (clsOf(el) ? '.' + clsOf(el).split(' ')[0] : '')
  }
  A.hoverLabel = () => {
    const l = document.querySelector('.hover-label.show')
    return l ? txt(l) : null
  }

  /** the residents' homes (features/apartment.ts residentHome, social/rng.ts) — for evidence only */
  const rngHash = (str) => {
    let h = 2166136261
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
    h = Math.imul(h ^ (h >>> 15), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return (h ^= h >>> 16) >>> 0
  }
  const rng = (seed) => {
    let a = rngHash(seed)
    return () => {
      a = (a + 0x6d2b79f5) | 0
      let t = Math.imul(a ^ (a >>> 15), 1 | a)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }
  A.residentHome = (id) => {
    const x = rng('home:' + id)()
    return x < 0.06 ? 'penthouse' : x < 0.3 ? 'loft' : 'apartment'
  }

  // ---------- a room's hotspots ----------
  A.roomInfo = () => {
    const w = window.clubNyc.world
    const room = w.room
    const geo = w.geo || { cutouts: {}, zones: {} }
    const placed = new Set([...Object.keys(geo.cutouts || {}), ...Object.keys(geo.zones || {})])
    const defs = [...Object.entries(room.objects || {}), ...Object.entries(room.zones || {})]
    return {
      room: room.id,
      name: room.name,
      geo: !!w.geo,
      hits: w.hits.map((h, i) => ({
        i,
        kind: h.kind,
        id: h.id,
        label: h.def ? h.def.label : '',
        go: h.def && h.def.go ? h.def.go : null,
        soon: !!(h.def && h.def.soon),
        sit: !!(h.def && h.def.sit),
        instant: !!(h.def && h.def.instant),
        act: !!(h.def && h.def.act),
        rect: h.rect.map((v) => Math.round(v)),
        alpha: h.kind !== 'cutout' || !!h.alpha,
      })),
      unplaced: defs.filter(([id, d]) => !placed.has(id) && !d.decor).map(([id, d]) => ({ id, label: d.label, go: d.go || null })),
      npcs: w.npcs.filter((a) => !a.leaving).map((a) => ({ name: a.name, local: !!a.resident, remote: !!a.remote, id: a.resident ? a.resident.id : a.remote ? a.remote.id : '', home: a.resident ? A.residentHome(a.resident.id) : null })),
      coins: [...document.querySelectorAll('.scene .coin:not(.got)')].length,
    }
  }
  A.alphaReady = () => window.clubNyc.world.hits.every((h) => h.kind !== 'cutout' || !!h.alpha)

  const frames = (n = 2) => new Promise((r) => {
    const step = () => (--n <= 0 ? r() : requestAnimationFrame(step))
    requestAnimationFrame(step)
  })

  /** Put the player down at a walkable spot (skips the walk over; the click itself stays a real one). */
  A.teleport = (pt) => {
    const w = window.clubNyc.world
    const p = w.player
    if (p.seat) p.standUp()
    p.path = []
    p.onArrive = null
    p.held = null
    p.pos = w.nav.nearest(pt)
    return p.pos
  }

  /**
   * Find a pixel of hotspot #i a player could click: inside its traced shape, on top (the game's hit test picks
   * it, not a person or something drawn over it), and not covered by the HUD. Walks the player close first.
   */
  A.prepHit = async (i, id) => {
    const w = window.clubNyc.world
    const h = w.hits[i]
    if (!h || h.id !== id) return { ok: false, reason: 'hotspot list changed' }
    const [x1, y1, x2, y2] = h.rect
    const cands = []
    const stepX = Math.max(3, (x2 - x1) / 28)
    const stepY = Math.max(3, (y2 - y1) / 28)
    const seen = new Set()
    for (let y0 = y1 + stepY / 2; y0 < y2; y0 += stepY)
      for (let x0 = x1 + stepX / 2; x0 < x2; x0 += stepX) {
        // mouse clicks arrive on whole client pixels (hover events don't): test exactly the pixel that will be clicked
        const [cx0, cy0] = A.toClient([x0, y0]).map(Math.round)
        const k = cx0 + ',' + cy0
        if (seen.has(k)) continue
        seen.add(k)
        const p = A.toStage(cx0, cy0)
        const [x, y] = p
        if (p[0] < 4 || p[1] < 4 || p[0] > 996 || p[1] > 561) continue
        if (h.kind === 'cutout') {
          let solid = true
          for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, -2]])
            if (!(alphaAt(h, [x + dx, y + dy]) > 200)) {
              solid = false
              break
            }
          if (!solid) continue
        } else if (h.poly && !(inPoly(p, h.poly) && inPoly([x + 4, y], h.poly) && inPoly([x - 4, y], h.poly) && inPoly([x, y + 4], h.poly) && inPoly([x, y - 4], h.poly))) continue
        cands.push(p)
      }
    if (!cands.length) return { ok: false, reason: h.kind === 'cutout' && !h.alpha ? 'cutout image never loaded' : 'no clickable pixels' }
    if (h.kind === 'seat') {
      const sitter = [w.player, ...w.npcs].find((a) => a.seat && a.seat.id === h.seat.id)
      if (sitter && sitter !== w.player) return { ok: false, reason: 'taken by ' + sitter.name }
    }
    // stand near where the click walks you (but not on top of the spot we're about to click)
    const at = h.at || (h.seat ? h.seat.stand : [(x1 + x2) / 2, y2 + 10])
    const cx = cands.reduce((s, p) => s + p[0], 0) / cands.length
    const cy = cands.reduce((s, p) => s + p[1], 0) / cands.length
    const covers = (pp) => {
      const s = A.depth(pp[1])
      return (q) => q[0] > pp[0] - 30 * s && q[0] < pp[0] + 30 * s && q[1] > pp[1] - 105 * s && q[1] < pp[1] + 6
    }
    let spot = w.nav.nearest(at)
    const target = [cx, cy]
    if (covers(spot)(target)) {
      for (const dx of [70, -70, 120, -120, 180, -180, 0]) {
        const s2 = w.nav.nearest([at[0] + dx, at[1] + (dx === 0 ? 60 : 0)])
        if (!covers(s2)(target)) {
          spot = s2
          break
        }
      }
    }
    A.teleport(spot)
    await frames(2)
    let blockers = {}
    let good = []
    const scan = () => {
      blockers = {}
      good = []
      for (const p of cands) {
        const hit = A.hitAt(p, 10)
        if (hit.npc) {
          blockers['person:' + hit.npc.name] = (blockers['person:' + hit.npc.name] || 0) + 1
          continue
        }
        if (hit.h !== h) {
          const k = hit.h ? 'hotspot:' + (hit.h.def ? hit.h.def.label : hit.h.id) + (hit.h.def && hit.h.def.sit ? ' [sit]' : '') : 'nothing'
          blockers[k] = (blockers[k] || 0) + 1
          continue
        }
        let b = null
        for (const [dx, dy] of [[0, 0], [4, 0], [-4, 0], [0, 4], [0, -4], [10, 0], [-10, 0], [0, 10], [0, -10]]) {
          b = A.blockerAt([p[0] + dx, p[1] + dy])
          // a little clearance from everything; more from things that animate (the quest box bumps, notices slide in)
          if (b && (Math.abs(dx) + Math.abs(dy) <= 4 || b === '.quests' || b === '.notice')) break
          b = null
        }
        if (b) {
          blockers[b] = (blockers[b] || 0) + 1
          continue
        }
        good.push(p)
      }
    }
    scan()
    // our own avatar in the way (we just put it there): step further aside and look again
    if (!good.length && blockers['actor.is-player']) {
      for (const dx of [240, -240, 360, -360]) {
        A.teleport([at[0] + dx, at[1] + 30])
        await frames(2)
        scan()
        if (good.length || !blockers['actor.is-player']) break
      }
    }
    if (!good.length) return { ok: false, reason: 'covered', blockers, total: cands.length }
    const gx = good.reduce((s, p) => s + p[0], 0) / good.length
    const gy = good.reduce((s, p) => s + p[1], 0) / good.length
    good.sort((a, b) => Math.hypot(a[0] - gx, a[1] - gy) - Math.hypot(b[0] - gx, b[1] - gy))
    const picks = [good[0], good[Math.floor(good.length / 3)], good[Math.floor((2 * good.length) / 3)]].filter(Boolean)
    const label = h.kind === 'seat' ? 'Sit' : h.def ? h.def.label + (h.def.soon ? ' · coming soon' : '') : ''
    const freeSeats = w.seats.filter((s) => ![w.player, ...w.npcs].some((a) => a.seat && a.seat.id === s.id)).length
    return { ok: true, label, points: picks.map((p) => A.toClient(p).map(Math.round)), stage: picks.map((p) => p.map(Math.round)), coverage: good.length / cands.length, blockers, freeSeats, seats: w.seats.length }
  }

  /** a point on a person (city local or real player) a click would pick: hitAt returns them */
  A.prepPerson = async (name) => {
    const w = window.clubNyc.world
    const a = w.npcs.find((n) => n.name === name && !n.leaving)
    if (!a) return { ok: false, reason: 'not here' }
    await frames(1)
    const s = A.depth(a.pos[1])
    const yy = a.seat ? a.pos[1] + 24 * s : a.pos[1]
    for (const f of [0.45, 0.6, 0.3, 0.75, 0.2]) {
      for (const dx of [0, -8, 8]) {
        const c = A.toClient([a.pos[0] + dx * s, yy - 112 * s * f]).map(Math.round)
        const p = A.toStage(c[0], c[1])
        const hit = A.hitAt(p)
        if (hit.npc !== a || A.blockerAt(p)) continue
        return { ok: true, point: c, stage: p.map(Math.round) }
      }
    }
    return { ok: false, reason: 'someone else is in front' }
  }

  /** move the player out of the way of a person we want to click */
  A.clearView = (name) => {
    const w = window.clubNyc.world
    const a = w.npcs.find((n) => n.name === name)
    if (!a) return
    const p = w.player.pos
    if (Math.abs(p[0] - a.pos[0]) < 90 && Math.abs(p[1] - a.pos[1]) < 140) A.teleport([a.pos[0] + (a.pos[0] > 500 ? -220 : 220), a.pos[1]])
  }

  // ---------- the map (features/map.ts): shapes, smallest first, alpha-tested like the game ----------
  A.mapShapes = async () => {
    const art = document.querySelector('.postcard-art')
    if (!art) return []
    const b = art.getBoundingClientRect()
    const imgs = [...art.querySelectorAll('img.map-cut')]
    await Promise.all(imgs.map((im) => (im.complete && im.naturalWidth ? null : new Promise((r) => im.addEventListener('load', r, { once: true })))))
    const shapes = imgs.map((im) => {
      const r = im.getBoundingClientRect()
      const c = document.createElement('canvas')
      c.width = Math.max(1, Math.round(im.naturalWidth / 2))
      c.height = Math.max(1, Math.round(im.naturalHeight / 2))
      const g = c.getContext('2d', { willReadFrequently: true })
      g.drawImage(im, 0, 0, c.width, c.height)
      const id = (im.getAttribute('src') || '').split('/').pop().replace('.png', '')
      return { id, r, data: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height, area: r.width * r.height }
    })
    shapes.sort((a, b) => a.area - b.area)
    const alpha = (s, x, y) => {
      if (x < s.r.left || y < s.r.top || x > s.r.right || y > s.r.bottom) return 0
      const ax = Math.floor(((x - s.r.left) / s.r.width) * s.w)
      const ay = Math.floor(((y - s.r.top) / s.r.height) * s.h)
      return s.data[(ay * s.w + ax) * 4 + 3] || 0
    }
    const out = []
    for (const s of shapes) {
      const pts = []
      const step = Math.max(2, Math.min(s.r.width, s.r.height) / 14)
      for (let y0 = s.r.top + step / 2; y0 < s.r.bottom; y0 += step)
        for (let x0 = s.r.left + step / 2; x0 < s.r.right; x0 += step) {
          const x = Math.round(x0), y = Math.round(y0)
          if (x < b.left + 2 || y < b.top + 2 || x > b.right - 2 || y > b.bottom - 2) continue
          if (alpha(s, x, y) < 200) continue
          // a smaller shape on top wins (the game tests smallest first)
          if (shapes.some((o) => o !== s && o.area < s.area && alpha(o, x, y) > 60)) continue
          const el = document.elementFromPoint(x, y)
          if (!el || !art.contains(el) || el.closest('button')) continue
          pts.push([x, y])
        }
      if (!pts.length) {
        out.push({ id: s.id, ok: false })
        continue
      }
      const gx = pts.reduce((a, p) => a + p[0], 0) / pts.length
      const gy = pts.reduce((a, p) => a + p[1], 0) / pts.length
      pts.sort((a, c) => Math.hypot(a[0] - gx, a[1] - gy) - Math.hypot(c[0] - gx, c[1] - gy))
      out.push({ id: s.id, ok: true, points: [pts[0], pts[Math.floor(pts.length / 2)]] })
    }
    return out
  }
  A.mapTip = () => {
    const t = document.querySelector('.map-tip.show')
    return t ? txt(t) : null
  }

  // ---------- generic: every clickable thing inside a container ----------
  const pathOf = (e, root) => {
    const parts = []
    while (e && e !== root) {
      const p = e.parentElement
      if (!p) break
      parts.unshift(`${e.tagName.toLowerCase()}:nth-child(${[...p.children].indexOf(e) + 1})`)
      e = p
    }
    return parts.join(' > ')
  }
  const SEL = 'button, a[href], select, input[type=checkbox], input[type=radio], input[type=text], input:not([type]), [role=button]'
  A.clickables = (rootSel) => {
    const root = typeof rootSel === 'string' ? document.querySelector(rootSel) : rootSel
    if (!root) return []
    // the city's hover state paints everything with a pointer cursor; don't let that look "clickable"
    document.querySelector('.stage')?.classList.remove('pointing')
    const els = [...root.querySelectorAll(SEL)]
    // anything else that *looks* clickable (pointer cursor) and isn't inside one of the above
    for (const e of root.querySelectorAll('div, span, li, img, i, b, svg, g, circle, p')) {
      if (els.some((x) => x.contains(e) || e.contains(x))) continue
      try {
        if (getComputedStyle(e).cursor === 'pointer' && !e.parentElement?.closest('[data-audit-ptr]')) {
          e.setAttribute('data-audit-ptr', '1')
          els.push(e)
        }
      } catch {}
    }
    root.querySelectorAll('[data-audit-ptr]').forEach((e) => e.removeAttribute('data-audit-ptr'))
    return els
      .filter((e) => vis(e))
      .map((e) => {
        const r = e.getBoundingClientRect()
        return {
          path: pathOf(e, root),
          text: (txt(e) || e.getAttribute('aria-label') || e.getAttribute('title') || e.getAttribute('placeholder') || '').slice(0, 120),
          tag: e.tagName.toLowerCase(),
          cls: clsOf(e),
          type: e.getAttribute('type') || '',
          disabled: !!e.disabled || e.getAttribute('aria-disabled') === 'true',
          title: e.getAttribute('title') || '',
          href: e.getAttribute('href') || '',
          target: e.getAttribute('target') || '',
          pointerOnly: !e.matches(SEL),
          rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        }
      })
  }
  /** tag an element under root for Playwright (data-audit="t"): the one at `path`, or else the one showing `text` */
  A.tag = (rootSel, path, text) => {
    document.querySelectorAll('[data-audit="t"]').forEach((e) => e.removeAttribute('data-audit'))
    const root = typeof rootSel === 'string' ? document.querySelector(rootSel) : rootSel
    if (!root) return null
    const n = (t) => (t || '').replace(/\d[\d,]*/g, '#').replace(/\s+/g, ' ').trim().toLowerCase()
    let e = null
    if (path) {
      try {
        e = root.querySelector(':scope > ' + path)
      } catch {
        e = null
      }
    }
    const label = (x) => (txt(x) || x.getAttribute('aria-label') || x.getAttribute('title') || '').slice(0, 120)
    if (text && (!e || n(label(e)) !== n(text))) {
      // the panel re-opened on another tab: look for the same control by its exact text
      const exact = (t) => (t || '').replace(/\s+/g, ' ').trim()
      const alt = [...root.querySelectorAll(SEL)].find((x) => vis(x) && exact(label(x)) === exact(text))
      e = alt || null
    }
    if (!e) return null
    e.setAttribute('data-audit', 't')
    return { text: label(e), disabled: !!e.disabled, cls: clsOf(e) }
  }
  A.sig = (sel) => {
    const e = document.querySelector(sel)
    return e ? hash(e.innerHTML.replace(/\d+(\.\d+)?px/g, '')) : ''
  }
  A.tagSig = () => {
    const e = document.querySelector('[data-audit="t"]')
    return e ? clsOf(e) + '|' + hash(e.outerHTML) : ''
  }
})()
