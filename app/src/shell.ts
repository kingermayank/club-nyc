import { LANGS, savedLang, setLang, type Lang } from './i18n'
import { isPhone } from './features/desktopOnly'

/**
 * The page around the game (the markup is in play.html, the look in style.css under ".shell-"):
 *  - By default the game sits in a frame with room on all four sides, under a bar with Home, Help, What's New and
 *    Rules, the language menu and Full Screen.
 *  - Full Screen is the game edge to edge (the browser's real full screen where it's allowed, the whole window where
 *    it isn't). Esc, or the small button in the corner, brings the page back.
 *  - Phones and automated browsers (the QA tools in tools/, which measure a stage that fills the window) start edge
 *    to edge, as does ?view=full. ?view=framed shows the page in either.
 */
const html = document.documentElement

export function startShell() {
  const q = new URLSearchParams(location.search)
  const asked = q.get('view')
  const edgeToEdge = asked ? asked === 'full' : navigator.webdriver || isPhone() || q.has('dev')
  html.classList.toggle('full', edgeToEdge)

  const bar = document.querySelector<HTMLElement>('.shell-bar')
  if (!bar) return
  // keys pressed in the bar (picking a language by its first letter) aren't the game's shortcuts
  bar.addEventListener('keydown', (e) => e.stopPropagation())

  // ---------- full screen ----------
  /** true while the page is in full screen because the player asked (so Esc and the corner button take it back) */
  let chosen = false
  const setFull = (on: boolean) => {
    chosen = on
    html.classList.toggle('full', on)
    html.classList.toggle('can-exit', on)
    if (on) void html.requestFullscreen?.().catch(() => {})
    else if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
  }
  bar.querySelector<HTMLButtonElement>('.shell-full')!.onclick = () => setFull(true)
  document.querySelector<HTMLButtonElement>('.shell-exit')!.onclick = () => setFull(false)
  // the browser's own way out (Esc in real full screen) brings the page back too
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && chosen) setFull(false)
  })
  // where real full screen wasn't allowed, Esc still leaves, unless the game needs it (a panel, a job, the way in)
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !chosen || document.fullscreenElement) return
    if (document.querySelector('.overlay.open, .game-shell, .lobby, .creator')) return
    setFull(false)
  })

  // ---------- language ----------
  // our own menu (not the system's): it opens under its button
  const box = bar.querySelector<HTMLElement>('.shell-lang')!
  const btn = box.querySelector<HTMLButtonElement>('.shell-lang-btn')!
  const name = box.querySelector<HTMLElement>('.shell-lang-name')!
  const menu = box.querySelector<HTMLUListElement>('.shell-lang-menu')!
  const rows = LANGS.map((l) => {
    const li = document.createElement('li')
    li.setAttribute('role', 'option')
    li.lang = l.id
    li.dataset.id = l.id
    li.textContent = l.name
    li.onclick = () => choose(l.id)
    li.onmouseenter = () => mark(li)
    menu.append(li)
    return li
  })
  let now: Lang = savedLang()
  const mark = (li: HTMLElement) => rows.forEach((r) => r.classList.toggle('on', r === li))
  const show = () => {
    const l = LANGS.find((x) => x.id === now)!
    name.textContent = l.name
    name.lang = l.id
    rows.forEach((r) => r.setAttribute('aria-selected', String(r.dataset.id === now)))
  }
  const open = (on: boolean) => {
    menu.hidden = !on
    btn.setAttribute('aria-expanded', String(on))
    if (on) mark(rows.find((r) => r.dataset.id === now)!)
  }
  const choose = (to: Lang) => {
    now = to
    show()
    open(false)
    void setLang(to)
  }
  btn.onclick = () => open(!!menu.hidden)
  document.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !box.contains(e.target as Node)) open(false)
  })
  box.addEventListener('keydown', (e) => {
    if (menu.hidden) {
      if (e.key === 'ArrowDown') (e.preventDefault(), open(true))
      return
    }
    const at = rows.findIndex((r) => r.classList.contains('on'))
    if (e.key === 'Escape') (e.preventDefault(), open(false))
    else if (e.key === 'ArrowDown') (e.preventDefault(), mark(rows[(at + 1) % rows.length]))
    else if (e.key === 'ArrowUp') (e.preventDefault(), mark(rows[(at + rows.length - 1) % rows.length]))
    else if (e.key === 'Enter' || e.key === ' ') (e.preventDefault(), choose(rows[Math.max(at, 0)].dataset.id as Lang))
  })
  show()
  if (now !== 'en') void setLang(now, false)
}
