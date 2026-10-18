"""Pixel audit: measure the UI for the small things eyes catch — text that isn't vertically centred in its pill or
button, labels clipped by their box, art spilling past rounded borders, text running out of its container.

usage: .venv/bin/python tools/pixel_audit.py [base_url]      (default: its own private stack — see tools/stack.py)
Walks a fresh player through the main screens (front door, creator, city HUD, toolbar menus, chat, community,
player card, stamps, map, subway, a shop, the apartment, a job lobby, the invite panel, Rosa's tour), then the
landing page (/) at laptop and phone widths, measures
every visible element on each, and writes docs/launch/pixel-audit.md plus 2x crops of each problem in
tools/out/pixel-audit/ (full 2x screenshots of every screen in tools/out/pixel-audit/screens/). Exit code 0 = nothing found.

How "centred" is measured: the text's baseline (its text box top + the font's ascent, rounded to whole pixels the way
Chrome lays it out) minus half the cap height (canvas measureText of "H") — the cap-height box Figma's "vertical trim"
centres. Symbol-only labels (?, ›, ▲) use their own ink box instead. That is compared with the centre of the box's
padding area; anything more than max(1.2px, 6% of the font size) off is reported. Also checked: labels cut off by
their box, art past a rounded border, text running out of its pill, wrapped text whose lines nearly touch, inline
icons off their text line, low-contrast text, cut-off descenders, off-centre icons in icon buttons, buttons too short to hit, cramped description-to-button and heading-to-description spacing, HUD pieces on top of each other, and name tags on top of each other.
"""
import asyncio, json, os, sys, time
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(HERE, 'out', 'pixel-audit')
REPORT = os.path.join(ROOT, 'docs', 'launch', 'pixel-audit.md')
sys.path.insert(0, HERE)

AUDIT_JS = r"""
(screen) => {
  const out = []
  const range = document.createRange()
  const ctx = document.createElement('canvas').getContext('2d')
  const fontOf = (cs) => `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
  const capHeight = (cs) => { ctx.font = fontOf(cs); return ctx.measureText('H').actualBoundingBoxAscent }
  const inkOf = (cs, t) => { ctx.font = fontOf(cs); const m = ctx.measureText(t); return [m.actualBoundingBoxAscent, m.actualBoundingBoxDescent] }
  // where the alphabetic baseline of a text node sits: the top of its text box plus the font's ascent (canvas reports
  // the same metrics the page uses, @font-face ascent-override included; layout rounds it to whole pixels)
  const ascentOf = (cs) => { ctx.font = fontOf(cs); return Math.round(ctx.measureText('H').fontBoundingBoxAscent) }
  const baselineOf = (n, k = 1) => {
    range.selectNodeContents(n)
    const rr = [...range.getClientRects()].find((x) => x.height >= 2)
    return rr ? rr.top + ascentOf(getComputedStyle(n.parentElement)) * k : NaN
  }
  // how much an element is scaled on screen (depth-scaled bubbles, the stage fit) — text metrics scale with it
  const scaleOf = (e) => { const h = e.offsetHeight; return h ? e.getBoundingClientRect().height / h : 1 }
  // tilted postcards and stickers: line detection by box tops doesn't hold there
  const tilted = (e) => {
    for (let n = e; n && n !== document.body; n = n.parentElement) {
      const t = getComputedStyle(n).transform
      if (t && t !== 'none') { const m = new DOMMatrix(t); if (Math.abs(m.b) > 0.01 || Math.abs(m.c) > 0.01) return true }
    }
    return false
  }
  const visible = (e) => {
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e)
    if (r.width < 2 || r.height < 2 || cs.visibility === 'hidden' || cs.display === 'none') return false
    for (let n = e; n && n !== document.body; n = n.parentElement) if (+getComputedStyle(n).opacity < 0.2) return false
    return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth
  }
  const path = (e) => {
    const parts = []
    for (let n = e; n && n.nodeType === 1 && n !== document.body && parts.length < 4; n = n.parentElement) {
      let s = n.tagName.toLowerCase()
      const cls = [...n.classList].filter((c) => !/^(on|open|show|busy|here|active|hover|bump|pointing|swap|unread)$/.test(c)).slice(0, 2)
      if (cls.length) s += '.' + cls.join('.')
      else if (n.getAttribute('aria-label')) s += `[aria-label="${n.getAttribute('aria-label')}"]`
      parts.unshift(s)
    }
    return parts.join(' > ')
  }
  const rectOf = (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((v) => Math.round(v * 10) / 10) }
  const hasBox = (cs) => {
    const bg = cs.backgroundColor, img = cs.backgroundImage
    const bw = parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth)
    return (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') || (img && img !== 'none') || bw > 0
  }
  // the game's own viewport and the marquee signs in the scene scroll on purpose
  const exempt = (e) => e.closest('.billboard, .bb-slide') || e.matches('.stage, .viewport, .scene')
  // text runs directly inside e (not inside a nested box with its own background)
  const ownText = (e) => {
    const nodes = []
    const walk = (n) => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3 && c.data.trim()) nodes.push(c)
        else if (c.nodeType === 1) {
          const cs = getComputedStyle(c)
          if (cs.display.startsWith('inline') && !['IMG', 'svg', 'INPUT', 'BUTTON', 'KBD'].includes(c.tagName) && !hasBox(cs) && cs.position !== 'absolute') walk(c)
        }
      }
    }
    walk(e)
    return nodes
  }
  const runRects = (n) => { range.selectNodeContents(n); return [...range.getClientRects()].filter((rr) => rr.height >= 2 && rr.width >= 1) }
  const all = [...document.querySelectorAll('body *')].filter((e) => !(e.closest('svg') && e.tagName !== 'svg') && visible(e))
  for (const e of all) {
    const cs = getComputedStyle(e)
    const r = e.getBoundingClientRect()
    const text = (e.innerText || '').trim().replace(/\s+/g, ' ')
    // 1. content clipped by an overflow:hidden box (labels cut off, like "Surprise me"). Only real text counts: a
    // picture cropped by its frame (the photo booth's people, an avatar's shirt lettering) is the frame's job
    const words = () => { const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) if (n.data.trim() && !n.parentElement.closest('svg')) return true; return false }
    if (!exempt(e) && text && !['TEXTAREA', 'INPUT', 'SELECT'].includes(e.tagName) && words()) {
      if ((cs.overflowY === 'hidden' || cs.overflowY === 'clip') && e.scrollHeight > e.clientHeight + 2 && e.clientHeight > 4)
        out.push({ kind: 'clipped', el: path(e), by: e.scrollHeight - e.clientHeight, text: text.slice(0, 50), rect: rectOf(e) })
      if ((cs.overflowX === 'hidden' || cs.overflowX === 'clip') && cs.textOverflow !== 'ellipsis' && e.scrollWidth > e.clientWidth + 2 && e.clientWidth > 4)
        out.push({ kind: 'clipped-x', el: path(e), by: e.scrollWidth - e.clientWidth, text: text.slice(0, 50), rect: rectOf(e) })
    }
    // 2. a child drawn past its rounded parent's edge (art bleeding out of a tile)
    const rad = parseFloat(cs.borderTopLeftRadius) || 0
    if (rad >= 6 && cs.overflow === 'visible' && hasBox(cs) && r.width < 400 && r.height < 300 && !exempt(e)) {
      const bl = parseFloat(cs.borderLeftWidth), bt = parseFloat(cs.borderTopWidth)
      for (const c of e.children) {
        if (!visible(c)) continue
        const ccs = getComputedStyle(c)
        if (ccs.position === 'absolute' || ccs.position === 'fixed') continue
        const cr = c.getBoundingClientRect()
        const over = Math.max(r.left + bl - cr.left, cr.right - (r.right - bl), r.top + bt - cr.top, cr.bottom - (r.bottom - bt))
        if (over > 1.5 && (c.tagName === 'IMG' || c.tagName === 'svg' || hasBox(ccs)))
          out.push({ kind: 'bleeds', el: path(c), by: Math.round(over * 10) / 10, text: (c.innerText || c.getAttribute('alt') || c.tagName).trim().slice(0, 40), rect: rectOf(c) })
      }
    }
    if (!hasBox(cs) && e.tagName !== 'BUTTON') continue
    if (exempt(e) || tilted(e)) continue
    const nodes = ownText(e)
    if (!nodes.length) continue
    // 3. text running out of its pill / button (not clipped, just spilling past the border)
    if (cs.overflowX === 'visible' && r.width < 700) {
      const bl = parseFloat(cs.borderLeftWidth), br = parseFloat(cs.borderRightWidth)
      let spill = 0
      for (const n of nodes) for (const rr of runRects(n)) spill = Math.max(spill, r.left + bl - rr.left, rr.right - (r.right - br))
      if (spill > 1) out.push({ kind: 'spills', el: path(e), by: Math.round(spill * 10) / 10, text: text.slice(0, 40), rect: rectOf(e) })
    }
    // 4. a single line of text that isn't vertically centred in its pill / button / chip
    if (r.height > 64 || r.height < 12) continue
    // other block-level content (icons stacked above text, second rows) makes "centred" ambiguous
    const kids = [...e.children].filter((c) => visible(c) && getComputedStyle(c).position !== 'absolute')
    if (kids.some((c) => { const d = getComputedStyle(c).display; return (d === 'block' || d === 'flex' || d === 'grid' || d === 'list-item') && !nodes.some((n) => c.contains(n)) })) continue
    let top = Infinity, bottom = -Infinity, lines = new Set()
    for (const n of nodes) for (const rr of runRects(n)) { top = Math.min(top, rr.top); bottom = Math.max(bottom, rr.bottom); lines.add(Math.round(rr.top)) }
    if (!isFinite(top)) continue
    const n0 = nodes[0], pcs = getComputedStyle(n0.parentElement), k = scaleOf(n0.parentElement), fs = parseFloat(pcs.fontSize) * k
    if (bottom - top > fs * 1.7) continue  // wraps onto more than one line
    const baseline = baselineOf(n0, k)
    if (!isFinite(baseline)) continue
    const all = nodes.map((n) => n.data).join('').trim()
    let optical
    if (/[\p{L}\p{N}]/u.test(all)) optical = baseline - (capHeight(pcs) * k) / 2  // the cap-height box (what Figma's vertical trim centres)
    else { const [asc, desc] = inkOf(pcs, all); optical = baseline - ((asc - desc) * k) / 2 }  // symbols: their own ink
    const padTop = r.top + parseFloat(cs.borderTopWidth), padBottom = r.bottom - parseFloat(cs.borderBottomWidth)
    const off = optical - (padTop + padBottom) / 2
    if (Math.abs(off) >= Math.max(1.2, 0.06 * fs)) out.push({ kind: off < 0 ? 'text-high' : 'text-low', el: path(e), by: Math.round(Math.abs(off) * 10) / 10, text: text.slice(0, 40), rect: rectOf(e), fs })
  }
  // 4b. paragraphs whose lines nearly touch (line-height ~1 on wrapped text)
  for (const e of all) {
    if (exempt(e) || e.closest('.billboard, svg')) continue
    const own = [...e.childNodes].filter((c) => c.nodeType === 3 && c.data.trim())
    if (!own.length) continue
    const tops = new Set()
    for (const n of own) for (const rr of runRects(n)) tops.add(Math.round(rr.top * 2) / 2)
    if (tops.size < 2) continue
    const ys = [...tops].sort((a, b) => a - b)
    let gap = Infinity
    for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > 2) gap = Math.min(gap, ys[i] - ys[i - 1])
    if (tilted(e)) continue
    const ecs = getComputedStyle(e)
    const fs = parseFloat(ecs.fontSize) * scaleOf(e)
    // a set line-height says it all; with 'normal' (or inline extras like a drop cap) go by what's measured
    if (ecs.lineHeight !== 'normal') gap = Math.max(gap, parseFloat(ecs.lineHeight) * scaleOf(e))
    if (isFinite(gap) && gap / fs < 1.1) out.push({ kind: 'cramped', el: path(e), by: Math.round((gap / fs) * 100) / 100, text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40), rect: rectOf(e), fs })
  }
  // 4c. text that's hard to read against what's behind it (WCAG contrast; solid backgrounds only — gradients and
  // pictures are skipped, and so is text with an outline or shadow doing the work)
  const rgba = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [v[0], v[1], v[2], v.length > 3 ? v[3] : 1] }
  const lum = ([r, g, b]) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
  for (const e of all) {
    // (fading toasts and disabled buttons are meant to look faded; subway bullets are the MTA's own colours)
    // (fading out: a toast leaving, a speech bubble ending)
    if (exempt(e) || e.closest('.billboard, svg, .game-shell, .out, :disabled, .bullet, .bubble:not(.show)')) continue
    const own = [...e.childNodes].some((c) => c.nodeType === 3 && /[\p{L}\p{N}]/u.test(c.data))
    if (!own) continue
    const cs = getComputedStyle(e)
    if (cs.textShadow !== 'none' || (cs.webkitTextStrokeWidth && parseFloat(cs.webkitTextStrokeWidth) > 0)) continue
    const fg = rgba(cs.color)
    if (!fg) continue
    let alpha = fg[3], bg = null
    for (let n = e; n && n !== document.documentElement; n = n.parentElement) alpha *= +getComputedStyle(n).opacity
    // what's actually painted behind the words: the elements under their middle, top to bottom (a header laid over
    // a hero, a card over a photo). Off screen, fall back to the element's own ancestors.
    const er = e.getBoundingClientRect(), cx = er.left + er.width / 2, cy = er.top + er.height / 2
    const under = cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight ? document.elementsFromPoint(cx, cy) : []
    // (elements that ignore the mouse, like name tags, aren't in that stack: use their ancestors then)
    const ancestors = () => { const a = []; for (let n = e; n && n !== document.documentElement; n = n.parentElement) a.push(n); return a }
    const behind = under.includes(e) ? under.slice(under.indexOf(e)) : ancestors()
    for (const n of behind) {
      const ncs = getComputedStyle(n)
      if (ncs.backgroundImage !== 'none') { bg = 'skip'; break }
      const b = rgba(ncs.backgroundColor)
      if (b && b[3] > 0.9) { bg = b; break }
      if (b && b[3] > 0.05) { bg = 'skip'; break }
    }
    if (!bg || bg === 'skip') continue
    const mix = fg.slice(0, 3).map((v, i) => v * alpha + bg[i] * (1 - alpha))
    const ratio = contrast(mix, bg)
    const fs = parseFloat(cs.fontSize), big = fs >= 18 || (fs >= 14 && /Burbank/.test(cs.fontFamily))
    if (ratio < (big ? 2.6 : 3.2)) out.push({ kind: 'low-contrast', el: path(e), by: Math.round(ratio * 100) / 100, text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40), rect: rectOf(e), fs })
  }
  // 4d. descenders (g, j, p, q, y) cut off: fields clip their text to the line box, and overflow:hidden / ellipsis
  // boxes clip at their padding edge. Burbank's descenders reach 0.27em below the baseline.
  const DESC = 0.27
  for (const e of all) {
    if (exempt(e) || tilted(e)) continue
    const cs = getComputedStyle(e)
    const fs = parseFloat(cs.fontSize) * scaleOf(e)
    if (e.tagName === 'SELECT') continue  // Chrome lays a select's text out itself (it ignores line-height): never clipped
    if (['INPUT', 'TEXTAREA'].includes(e.tagName)) {
      if (['checkbox', 'radio', 'range', 'color', 'file', 'hidden'].includes(e.type)) continue
      const lh = cs.lineHeight === 'normal' ? parseFloat(cs.fontSize) : parseFloat(cs.lineHeight)
      if (lh < parseFloat(cs.fontSize) * 1.25) out.push({ kind: 'descenders', el: path(e), by: Math.round((lh / parseFloat(cs.fontSize)) * 100) / 100, text: (e.value || e.placeholder || '').slice(0, 40), rect: rectOf(e), fs })
      continue
    }
    if (!/hidden|clip/.test(cs.overflowY + cs.overflowX)) continue
    const r = e.getBoundingClientRect()
    const clipBottom = r.bottom - parseFloat(cs.borderBottomWidth) * scaleOf(e)
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!/[gjpqy,;]/.test(n.data) || n.parentElement.closest('svg')) continue
      const pe = n.parentElement
      if (!visible(pe)) continue
      const rects = runRects(n)
      const last = rects[rects.length - 1]
      if (!last) continue
      const k = scaleOf(pe)
      const bottom = last.top + ascentOf(getComputedStyle(pe)) * k + DESC * parseFloat(getComputedStyle(pe).fontSize) * k
      // (only text that's meant to be visible here: a line entirely outside the box is scrolled or hidden on purpose)
      if (last.top < clipBottom && bottom > clipBottom + 0.6) { out.push({ kind: 'descenders', el: path(pe), by: Math.round((bottom - clipBottom) * 10) / 10, text: n.data.trim().slice(0, 40), rect: rectOf(pe), fs }); break }
    }
  }
  // 5. inline icons (img.ji) that sit off the text line they're in
  for (const img of document.querySelectorAll('img.ji')) {
    if (!visible(img) || img.closest('.billboard')) continue
    const cs = getComputedStyle(img)
    if (cs.display !== 'inline-block' && cs.display !== 'inline') continue
    const prev = img.previousSibling, next = img.nextSibling
    const sib = [prev, next].find((n) => n && n.nodeType === 3 && n.data.trim())
    if (!sib) continue
    if (tilted(img)) continue
    const ir = img.getBoundingClientRect(), pcs = getComputedStyle(img.parentElement), k = scaleOf(img.parentElement), fs = parseFloat(pcs.fontSize) * k
    // the words right beside the icon: the end of the text before it, or the start of the text after it (wrapped
    // text puts other lines elsewhere)
    const rects = runRects(sib)
    const rr = sib === prev ? rects[rects.length - 1] : rects[0]
    if (!rr || Math.abs(rr.top - ir.top) > fs * 1.5) continue
    const opt = rr.top + ascentOf(pcs) * k - (capHeight(pcs) * k) / 2
    const off = (ir.top + ir.bottom) / 2 - opt
    if (Math.abs(off) >= Math.max(1.5, 0.1 * fs)) out.push({ kind: off < 0 ? 'icon-high' : 'icon-low', el: path(img.parentElement) + ' > img.ji', by: Math.round(Math.abs(off) * 10) / 10, text: (img.alt + ' ' + sib.data.trim()).slice(0, 40), rect: rectOf(img.parentElement), fs })
  }
  // 5b. icon-only buttons (the bell, close, arrows, the toolbar): the picture should sit in the middle of the button.
  // An icon wider than the button's content box overflows to the right (the browser's default button padding)
  for (const e of all) {
    if (!(e.tagName === 'BUTTON' || e.getAttribute('role') === 'button') || exempt(e) || tilted(e)) continue
    if ((e.innerText || '').replace(/\s/g, '')) continue  // has words: the text checks cover it
    const pics = [...e.querySelectorAll('img, svg')].filter((x) => visible(x) && !x.parentElement.closest('svg') && getComputedStyle(x).position !== 'absolute')
    if (pics.length !== 1) continue
    const pic = pics[0], cs = getComputedStyle(e), r = e.getBoundingClientRect(), pr = pic.getBoundingClientRect()
    if (pr.width > r.width * 1.1) continue  // a picture bigger than its button is styled that way on purpose
    const bx = (r.left + parseFloat(cs.borderLeftWidth) + r.right - parseFloat(cs.borderRightWidth)) / 2
    const by = (r.top + parseFloat(cs.borderTopWidth) + r.bottom - parseFloat(cs.borderBottomWidth)) / 2
    const dx = (pr.left + pr.right) / 2 - bx, dy = (pr.top + pr.bottom) / 2 - by
    if (Math.abs(dx) > 1.2 || Math.abs(dy) > 1.2) out.push({ kind: 'icon-off-centre', el: path(e), by: Math.round(Math.max(Math.abs(dx), Math.abs(dy)) * 10) / 10, text: `dx ${dx.toFixed(1)} dy ${dy.toFixed(1)} ${e.getAttribute('aria-label') || pic.getAttribute('alt') || ''}`, rect: rectOf(e) })
  }
  // 5c. breathing room. Buttons tall enough to hit comfortably, a clear gap between a description and the button
  // under it, and headings that don't sit on their descriptions. (Measured in stage px: the stage scales to fit.)
  const MIN_TEXT_BTN = 28, MIN_ICON_BTN = 24, MIN_CTA_GAP = 10, MIN_HEAD_GAP = 3
  const clickable = (e) => e.tagName === 'BUTTON' || e.matches('a.btn, [role="button"]')
  const roomy = (e) => !e.closest('.game-shell, .subway-map, .billboard, .overhead-layer, .tb-tip, .toolbar, .creator-left, .cr-presets, .le-opts, .pop-menu.emotes, .mc-corner, .chat-log-list')
  const textTop = (e) => { let t = Infinity; const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.data.trim() || n.parentElement.closest('svg')) continue; for (const rr of runRects(n)) t = Math.min(t, rr.top) } return t }
  const textBottom = (e) => { let b = -Infinity; const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) { if (!n.data.trim() || n.parentElement.closest('svg, button, .btn')) continue; for (const rr of runRects(n)) b = Math.max(b, rr.bottom) } return b }
  for (const e of all) {
    if (!clickable(e) || exempt(e) || !roomy(e) || tilted(e)) continue
    const r = e.getBoundingClientRect(), k = scaleOf(e), h = r.height / k
    const words = /[\p{L}\p{N}]/u.test(e.innerText || '')
    if (h < (words ? MIN_TEXT_BTN : MIN_ICON_BTN) - 0.5 && r.width / k > 8)
      out.push({ kind: 'small-target', el: path(e), by: Math.round(h * 10) / 10, text: ((e.innerText || e.getAttribute('aria-label') || '').trim() || '(icon)').slice(0, 40), rect: rectOf(e) })
    if (!words) continue
    // the text block right above this button, in the same card: the nearest previous sibling (of the button, or of
    // the row it sits in) that has words of its own
    let row = e
    while (row.parentElement && row.parentElement !== document.body && [...row.parentElement.children].every((c) => c === row || clickable(c) || !c.textContent.trim() || getComputedStyle(c).position === 'absolute')) row = row.parentElement
    let prev = row.previousElementSibling
    while (prev && (!visible(prev) || getComputedStyle(prev).position === 'absolute' || !prev.textContent.trim() || clickable(prev))) prev = prev.previousElementSibling
    if (!prev) continue
    const pr = prev.getBoundingClientRect()
    if (pr.bottom > r.top + 1 || Math.min(pr.right, r.right) - Math.max(pr.left, r.left) < -40) continue  // beside, not above
    const tb = textBottom(prev)
    if (!isFinite(tb)) continue
    const gap = (r.top - tb) / k
    // (a negative gap means they're side by side, or the text sits in another column: not a stack)
    if (gap > -2 && gap < MIN_CTA_GAP - 0.5) out.push({ kind: 'tight-cta', el: path(e), by: Math.round(gap * 10) / 10, text: `${(prev.innerText || '').trim().slice(-22)} → ${(e.innerText || '').trim().slice(0, 16)}`, rect: rectOf(e) })
  }
  // a heading (display font, bigger or bolder) with its description right under it
  for (const e of all) {
    if (exempt(e) || !roomy(e) || tilted(e) || clickable(e) || e.closest('button, .btn')) continue
    const cs = getComputedStyle(e)
    if (!/Burbank Display/.test(cs.fontFamily) || !e.textContent.trim() || cs.display === 'inline') continue
    let next = e.nextElementSibling
    while (next && (!visible(next) || getComputedStyle(next).position === 'absolute')) next = next.nextElementSibling
    if (!next || clickable(next) || next.querySelector('button, .btn') || !next.textContent.trim()) continue
    const ncs = getComputedStyle(next)
    if (/Burbank Display/.test(ncs.fontFamily) || parseFloat(ncs.fontSize) > parseFloat(cs.fontSize)) continue  // not a description
    const er = e.getBoundingClientRect(), nr = next.getBoundingClientRect()
    if (nr.top < er.bottom - 1) continue  // side by side
    const k = scaleOf(e)
    let hb = -Infinity
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) for (const rr of runRects(n)) hb = Math.max(hb, rr.bottom)
    const nt = textTop(next)
    if (!isFinite(hb) || !isFinite(nt)) continue
    const gap = (nt - hb) / k
    if (gap < MIN_HEAD_GAP - 0.5) out.push({ kind: 'tight-heading', el: path(e), by: Math.round(gap * 10) / 10, text: `${e.textContent.trim().slice(0, 20)} / ${next.textContent.trim().slice(0, 20)}`, rect: rectOf(e) })
  }
  // 5e. a panel or list that scrolls by only a few pixels: it almost fits, so it should fit (a deliberate scroller,
  // like a long list, overflows by much more)
  for (const e of all) {
    if (exempt(e) || e.closest('.game-shell')) continue
    const cs = getComputedStyle(e)
    if (/(auto|scroll)/.test(cs.overflowY)) {
      const extra = e.scrollHeight - e.clientHeight
      if (extra > 2 && extra < 40) out.push({ kind: 'scrolls-a-bit', el: path(e), by: extra, text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40), rect: rectOf(e) })
    }
    // sideways: a panel wider inside than out is never on purpose (content runs past its border)
    // (rows that scroll sideways on purpose snap their items: those are fine)
    if (/(auto|scroll|hidden|clip)/.test(cs.overflowX) && cs.textOverflow !== 'ellipsis' && cs.scrollSnapType === 'none' && !e.matches('.sc-list, .tray-row, .cm-chips') && e.clientWidth > 120) {
      const extra = e.scrollWidth - e.clientWidth
      if (extra > 2) out.push({ kind: 'too-wide', el: path(e), by: extra, text: (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 40), rect: rectOf(e) })
    }
  }
  // 5d. an icon swallowed by a style meant for something else (a "hide the label span" rule hiding the icon's run)
  for (const run of document.querySelectorAll('.ji-run')) {
    const parent = run.parentElement
    if (!parent || !visible(parent) || exempt(parent)) continue
    const cs = getComputedStyle(run)
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.2 || run.getBoundingClientRect().width < 2)
      out.push({ kind: 'hidden-icon', el: path(run), by: 0, text: (run.querySelector('img')?.alt || run.textContent || '').trim().slice(0, 30), rect: rectOf(parent) })
  }
  // 6. HUD pieces on top of each other (the screen's chrome, not panels or the scene)
  const chrome = all.filter((e) => {
    const cs = getComputedStyle(e)
    if (!(cs.position === 'absolute' || cs.position === 'fixed') || !hasBox(cs)) return false
    // panels, the room itself (people, tags, bubbles: they sit under the HUD on purpose), tooltips, confetti
    if (e.closest('.overlay, .scene, .overhead-layer, .tb-tip, .hover-label, .tour, .creator, .game-shell') || e.matches('.stage, .viewport, .overlay, .fx-layer, .confetti')) return false
    const r = e.getBoundingClientRect()
    return r.width * r.height < 160000
  })
  for (let i = 0; i < chrome.length; i++) for (let j = i + 1; j < chrome.length; j++) {
    const a = chrome[i], b = chrome[j]
    if (a.contains(b) || b.contains(a)) continue
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect()
    const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
    if (ox > 2 && oy > 2) out.push({ kind: 'overlap', el: path(a) + '  ×  ' + path(b), by: Math.round(Math.min(ox, oy)), text: ((a.innerText || '').trim().slice(0, 18) + ' / ' + (b.innerText || '').trim().slice(0, 18)), rect: [Math.min(ra.left, rb.left), Math.min(ra.top, rb.top), Math.max(ra.right, rb.right) - Math.min(ra.left, rb.left), Math.max(ra.bottom, rb.bottom) - Math.min(ra.top, rb.top)] })
  }
  // 7. name tags on top of each other
  const tags = [...document.querySelectorAll('.overhead-layer .name-tag')].filter(visible)
  for (let i = 0; i < tags.length; i++) for (let j = i + 1; j < tags.length; j++) {
    const ra = tags[i].getBoundingClientRect(), rb = tags[j].getBoundingClientRect()
    const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left), oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top)
    if (ox > 2 && oy > 2) out.push({ kind: 'tags-overlap', el: 'name tags', by: Math.round(Math.min(ox, oy)), text: tags[i].innerText + ' / ' + tags[j].innerText, rect: [Math.min(ra.left, rb.left), Math.min(ra.top, rb.top), Math.max(ra.right, rb.right) - Math.min(ra.left, rb.left), Math.max(ra.bottom, rb.bottom) - Math.min(ra.top, rb.top)] })
  }
  // de-duplicate identical findings (lists of identical chips)
  const seen = new Set()
  return out.filter((f) => { const k = f.kind + f.el + f.by; if (seen.has(k)) return false; seen.add(k); return true }).map((f) => ({ ...f, screen }))
}
"""


async def front_door(pg, base):
    await pg.goto(base + '/play?desktop', wait_until='networkidle')
    await pg.wait_for_selector('.si-live.busy, .si-live.quiet', timeout=8000)
    return 'Px' + format(int(time.time() * 1000) % 1000000, 'x')


async def run(base):
    os.makedirs(os.path.join(OUT, 'screens'), exist_ok=True)
    for d in (OUT, os.path.join(OUT, 'screens')):
        for f in os.listdir(d):
            if f.endswith('.png'):
                os.remove(os.path.join(d, f))
    findings = []
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await (await b.new_context(viewport={'width': 1000, 'height': 565}, device_scale_factor=2)).new_page()

        shots = [0]

        async def audit(screen, settle=600, page=None):
            page = page or pg
            vw = page.viewport_size
            await page.wait_for_timeout(settle)
            shots[0] += 1
            await page.screenshot(path=os.path.join(OUT, 'screens', f"{shots[0]:02d}-{screen.replace(' ', '-').replace(':', '')}.png"))
            found = await page.evaluate(AUDIT_JS, screen)
            if any(f['kind'] == 'tags-overlap' for f in found):
                # tags slide apart over ~0.2s when people walk into each other: only report ones still stuck together
                await page.wait_for_timeout(700)
                again = {f['text'] for f in await page.evaluate(AUDIT_JS, screen) if f['kind'] == 'tags-overlap'}
                found = [f for f in found if f['kind'] != 'tags-overlap' or f['text'] in again]
            for i, f in enumerate(found):
                x, y, w, h = f['rect']
                pad = 14
                try:
                    shot = os.path.join(OUT, f"{len(findings) + i:03d}-{screen.replace(' ', '-')}-{f['kind']}.png")
                    cx, cy = max(0, x - pad), max(0, y - pad)
                    await page.screenshot(path=shot, clip={'x': cx, 'y': cy, 'width': min(vw['width'] - cx, w + pad * 2), 'height': min(vw['height'] - cy, h + pad * 2)})
                    f['shot'] = os.path.relpath(shot, ROOT)
                except Exception:
                    pass
            findings.extend(found)
            print(f'{screen}: {len(found)} finding(s)', flush=True)

        async def close():
            await pg.keyboard.press('Escape')
            await pg.wait_for_timeout(350)

        name = await front_door(pg, base)
        await audit('front door')
        await pg.click('.si-play')
        await pg.wait_for_selector('.creator-card', timeout=10000)
        await audit('creator: look', 900)
        await pg.locator('.cr-preset').nth(2).click()
        await pg.click('.creator-actions .btn.go')
        await pg.wait_for_selector('.creator-name input')
        await pg.fill('.creator-name input', name)
        await pg.wait_for_selector('.cr-avail.ok', timeout=5000)
        await audit('creator: name')
        await pg.select_option('.cr-month', '6'); await pg.select_option('.cr-year', '2000'); await pg.click('.cr-age input')
        await pg.click('.creator-actions .btn.go')
        await pg.wait_for_selector('.online-pill.on', timeout=15000)
        try:
            await pg.wait_for_selector('.tour-card', timeout=9000)
            await audit('tour card', 700)
            await pg.click('.tour-next')
            await audit('tour spotlight', 900)
            await pg.click('.tour .tour-skip')
        except Exception:
            pass
        await pg.wait_for_timeout(2500)
        await audit('city HUD', 400)
        steps = [
            ('emotes', '[aria-label="Emotes"]'),
            ('moves', '[aria-label="Moves"]'),
            ('phone menu', '[aria-label="Phone: camera & invite friends"]'),
            ('community', '[aria-label="Friends & leaderboards"]'),
            ('player card', '[aria-label="Player card & wardrobe"]'),
            ('stamp book', '[aria-label="Stamp book"]'),
            ('map', '[aria-label="Map"]'),
            ('subway', '[aria-label="Subway"]'),
            ('newspaper', '[aria-label="Club NYC Times"]'),
        ]
        for screen, sel in steps:
            try:
                await pg.click(sel, timeout=4000)
                await audit(screen, 900)
            except Exception as e:
                print(f'{screen}: could not open ({str(e)[:60]})')
            await close()
        # chat box with the quick phrases, the chat log, the mailbox
        await pg.click('.chat-input')
        await audit('chat phrases', 500)
        await pg.keyboard.press('Escape')
        await pg.click('.chat-log-btn')
        await audit('chat log', 600)
        await pg.click('.chat-log-btn')
        try:
            await pg.click('.mail-btn', timeout=3000)
            await audit('mailbox', 900)
            await close()
        except Exception:
            pass
        # community tabs
        try:
            await pg.click('[aria-label="Friends & leaderboards"]')
            for tab in ['Leaderboards', 'Neighborhoods', 'City']:
                try:
                    await pg.click(f'.cm-tab:has-text("{tab}")', timeout=3000)
                    await audit(f'community: {tab}', 900)
                except Exception:
                    pass
            await close()
        except Exception:
            pass
        # a local's player card
        try:
            await pg.evaluate("clubNyc.card(clubNyc.world.npcs.find(a => a.resident))")
            await pg.wait_for_selector('.player-card.npc', timeout=4000)
            await audit('local player card', 900)
        except Exception:
            pass
        await close()
        # shop catalogs (a couple of different layouts)
        for shop in ['thread', 'iloveny']:
            await pg.evaluate(f"clubNyc.api.catalog('{shop}')")
            await audit(f'catalog: {shop}', 1400)
            await close()
        for screen, js in [('photo booth', 'clubNyc.photo()'), ('house party', 'clubNyc.party()'), ('StreetCheesy', 'clubNyc.listings()'), ('dance jam', 'clubNyc.jam()')]:
            await pg.evaluate(js)
            await audit(screen, 1400)
            await close()
        await pg.evaluate("clubNyc.api.goto('apartment')")
        await pg.wait_for_timeout(2800)
        await audit('apartment')
        await pg.evaluate("clubNyc.api.furniture()")
        await audit('furniture', 1200)
        await pg.click('.tray-actions .btn:not(.go)')  # the Furniture Catalog
        await audit('furniture catalog', 1400)
        await close()
        if await pg.evaluate("!!document.querySelector('.tray-actions')"):
            await pg.click('.tray-actions .btn.go')
        await pg.wait_for_timeout(500)
        # a job: its lobby, the game itself, then the payout card (clubNyc.endGame is a dev-build hook)
        await pg.evaluate("clubNyc.api.playGame('slice-factory')")
        try:
            await pg.wait_for_selector('.lobby', timeout=6000)
            await audit('job lobby', 1200)
            await pg.click('.lobby-start')
            await audit('game: Slice Factory', 2500)
            await pg.evaluate("clubNyc.endGame()")
            await pg.wait_for_selector('.payout', timeout=6000)
            await audit('payout', 2200)
            await pg.click('.payout .btn.go')
        except Exception as e:
            print('job: ' + str(e)[:80])
        await pg.wait_for_timeout(800)
        await pg.keyboard.press('i')
        await audit('invite panel', 1200)
        await close()
        # the landing page (/), at laptop and phone widths, one screen at a time
        for w, h, mobile in [(1280, 800, False), (390, 844, True)]:
            lp = await (await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, is_mobile=mobile, has_touch=mobile)).new_page()
            await lp.goto(base + '/', wait_until='networkidle')
            await lp.evaluate('document.fonts.ready')
            total = await lp.evaluate('document.documentElement.scrollHeight')
            for i, y in enumerate(range(0, total, h)):
                await lp.evaluate(f'window.scrollTo(0, {y})')
                await audit(f'landing {w} {i + 1:02d}', 350, lp)
            await lp.context.close()
        await b.close()
    return findings


def report(findings, base):
    by_kind = {}
    for f in findings:
        by_kind.setdefault(f['kind'], []).append(f)
    names = {'text-high': 'Text sits high in its box', 'text-low': 'Text sits low in its box', 'clipped': 'Content cut off (vertically)', 'clipped-x': 'Content cut off (horizontally)',
             'bleeds': 'Drawn past a rounded border', 'spills': 'Text runs past its box', 'icon-high': 'Inline icon sits above the text', 'icon-low': 'Inline icon sits below the text',
             'overlap': 'HUD pieces overlap', 'tags-overlap': 'Name tags overlap', 'cramped': 'Wrapped text with lines nearly touching (line-height as a multiple of the font size)',
             'low-contrast': 'Text hard to read against its background (contrast ratio)', 'descenders': 'Descenders (g, y, p) cut off by a field or a clipping box',
             'icon-off-centre': 'Icon not centred in its button',
             'small-target': 'Button too short to hit comfortably (height in px; text buttons ≥ 28, icon buttons ≥ 24)',
             'tight-cta': 'Too little room between a description and the button under it (px; want ≥ 10)',
             'tight-heading': 'Heading sitting on its description (px; want ≥ 3)',
             'hidden-icon': 'An icon hidden by a rule meant for something else',
             'scrolls-a-bit': 'Scrolls by only a few px (it almost fits: make it fit)',
             'too-wide': 'Content wider than its box (runs past the border or scrolls sideways)'}
    lines = ['# Pixel audit', '', f'Generated {time.strftime("%Y-%m-%d %H:%M")} by `tools/pixel_audit.py` against {base}. Re-run: `.venv/bin/python tools/pixel_audit.py`.', '',
             f'**{len(findings)}** finding(s). Crops (2x) are in `tools/out/pixel-audit/`.', '']
    for kind in names:
        rows = by_kind.get(kind, [])
        if not rows:
            continue
        lines += [f'## {names[kind]} ({len(rows)})', '', '| Screen | Element | Off by (px) | Text | Crop |', '|---|---|---|---|---|']
        for f in rows:
            lines.append(f"| {f['screen']} | `{f['el']}` | {f['by']} | {f['text'].replace('|', '/')} | {f.get('shot', '')} |")
        lines.append('')
    if not findings:
        lines.append('Nothing found.')
    with open(REPORT, 'w') as fh:
        fh.write('\n'.join(lines) + '\n')
    with open(os.path.join(HERE, 'out', 'pixel-audit.json'), 'w') as fh:
        json.dump(findings, fh, indent=1)


async def main():
    base = sys.argv[1] if len(sys.argv) > 1 else None
    stack = None
    if not base:
        from stack import PrivateStack
        stack = PrivateStack()
        base = stack.start()
    try:
        findings = await run(base)
    finally:
        if stack:
            stack.stop()
    report(findings, base)
    print(f'\n{len(findings)} finding(s) → {os.path.relpath(REPORT, ROOT)}')
    sys.exit(1 if findings else 0)


asyncio.run(main())
