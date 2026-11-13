/**
 * Your level, in the game: the HUD chip, "+25 XP" feedback and the level-up celebration.
 *
 * Online the server owns XP (server/src/xp.ts) and pushes every award (`{ t: 'xp' }`, handled in net/multiplayer.ts);
 * the game only has to report stamps, which live in the save. Offline single-player counts XP here with the same rules
 * (app/src/data/levels.ts), so a level never depends on being connected.
 */
import { save, persist } from '../state'
import { sfx } from '../audio'
import { el, toStage, W } from '../engine/stage'
import { showToast, confetti, openOverlay } from '../engine/ui'
import { levelOf, levelReward, LEVELS, XP_RULES, XP_DAILY_CAP, type LevelInfo, type XpReason } from '../data/levels'
import { nycDay } from '../data/economy'
import { link } from '../net/link'
import './levels.css'

const listeners = new Set<(info: LevelInfo, gained: number) => void>()
/** the HUD chip and an open player card redraw when XP changes */
export function onXp(fn: (info: LevelInfo, gained: number) => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export const myLevel = () => levelOf(save.xp ?? 0)

/** XP changed (a server push, the sign-in payload, or the offline count): store it and celebrate a new level */
export function setXp(total: number, gained = 0, why?: string, bonus = 0) {
  const before = levelOf(save.xp ?? 0)
  save.xp = Math.max(0, Math.floor(total))
  persist()
  const now = levelOf(save.xp)
  listeners.forEach((fn) => fn(now, gained))
  if (now.level > before.level && gained > 0) celebrate(now, bonus)
  else if (gained > 0) sfx.xp()
  void why
}

function celebrate(l: LevelInfo, bonus = 0) {
  sfx.levelUp()
  confetti(70)
  const node = el(
    'div',
    'toast level-up',
    `<span class="lu-badge"><b>${l.level}</b></span><span><b>Level ${l.level}!${bonus ? ` <i class="lu-coins">+${bonus} coins</i>` : ''}</b><small>You’re now a <em>${l.title}</em>.</small></span>`,
  )
  showToast(node, 5200)
}

/**
 * Something worth XP happened in the game. Online, the server already awards everything it can see (claims, job
 * runs, visits, friends, invites, multiplayer matches), so the game only reports stamps. Offline, the same rules
 * are applied to the save: once-per-ref things are remembered, daily ones are counted per New York day.
 */
export function xpEvent(reason: XpReason, ref?: string | number, amount?: number) {
  if (link.account) {
    if (reason === 'stamp' && ref)
      void import('../net/server').then(({ rest }) => rest('/xp/stamp', { json: { id: String(ref) } })).catch(() => {})
    return
  }
  const rule = XP_RULES[reason]
  if (!rule) return
  const day = nycDay()
  const log = (save.xpLog ??= { refs: [], day, counts: {}, today: 0 })
  if (log.day !== day) Object.assign(log, { day, counts: {}, today: 0 })
  const key = ref === undefined ? '' : `${reason}:${ref}`
  if ((rule.per === 'once' || rule.per === 'run') && (!key || log.refs.includes(key))) return
  if (rule.per === 'day' && (log.counts[reason] ?? 0) >= ('max' in rule ? rule.max : 1)) return
  const gain = Math.min(Math.round(amount ?? rule.amount), XP_DAILY_CAP - log.today)
  if (gain <= 0) return
  if (key) log.refs.push(key)
  log.counts[reason] = (log.counts[reason] ?? 0) + 1
  log.today += gain
  setXp((save.xp ?? 0) + gain, gain, rule.label)
}

// ---------- the HUD chip: your level in a ring that fills with XP (top right, next to your coins) ----------
const RING = 2 * Math.PI * 17
export function levelPlate(): HTMLElement {
  const b = el('button', 'level-plate') as HTMLButtonElement
  b.innerHTML = `<svg viewBox="0 0 44 44" aria-hidden="true"><circle class="lp-bg" cx="22" cy="22" r="17"/><circle class="lp-fg" cx="22" cy="22" r="17" stroke-dasharray="${RING}" stroke-dashoffset="${RING}"/></svg><b></b><span class="lp-tip"></span>`
  const draw = (l: LevelInfo) => {
    b.querySelector('b')!.textContent = String(l.level)
    ;(b.querySelector('.lp-fg') as SVGCircleElement).style.strokeDashoffset = String(RING * (1 - l.progress))
    b.querySelector('.lp-tip')!.textContent = l.title
    b.setAttribute('aria-label', `Level ${l.level}, ${l.title}: ${l.xp} of ${l.next} XP. Show your level`)
  }
  draw(myLevel())
  onXp((l, gained) => {
    draw(l)
    if (gained <= 0) return
    // a little "+25 XP" drifts down from the chip
    const f = el('span', 'lp-gain', `+${gained} XP`)
    b.append(f)
    setTimeout(() => f.remove(), 1600)
    b.classList.remove('bump')
    void b.offsetWidth
    b.classList.add('bump')
  })
  b.onclick = (e) => {
    e.stopPropagation()
    sfx.click()
    openLevelView(b)
  }
  return b
}

// ---------- the level view: opens under the chip. A big ring, your title, and the next rungs of the ladder ----------
const BIG = 2 * Math.PI * 34
const COIN = '<img src="/art/icons/coin.png" alt="" draggable="false">'
function openLevelView(from: HTMLElement) {
  const l = myLevel()
  // the next three levels, each with the coins it pays (past the top of the ladder the title stays the same)
  const rungs = [1, 2, 3].map((n) => ({ level: l.level + n, title: LEVELS[Math.min(l.level + n, LEVELS.length) - 1].title }))
  const card = el('div', 'level-card')
  card.setAttribute('role', 'dialog')
  card.setAttribute('aria-label', `Level ${l.level}, ${l.title}`)
  card.innerHTML = `<div class="lc-ring"><svg viewBox="0 0 80 80" aria-hidden="true"><circle class="lp-bg" cx="40" cy="40" r="34"/><circle class="lp-fg" cx="40" cy="40" r="34" stroke-dasharray="${BIG}" stroke-dashoffset="${BIG}"/></svg><b>${l.level}</b></div>
    <b class="lc-title">${l.title}</b>
    <span class="lc-xp"><b>${l.xp.toLocaleString('en-US')}</b> / ${l.next.toLocaleString('en-US')} XP</span>
    <ol class="lc-ladder">${rungs.map((r, i) => `<li${i ? '' : ' class="next"'}><i>${r.level}</i><span>${r.title}</span><em>${COIN}${levelReward(r.level)}</em></li>`).join('')}</ol>`
  openOverlay(card, { cls: 'clear' })
  // hangs right under the chip, kept on the stage
  const EDGE = 10
  const r = from.getBoundingClientRect()
  const [x, y] = toStage({ clientX: r.left + r.width / 2, clientY: r.bottom })
  const left = Math.round(Math.min(Math.max(x - card.offsetWidth / 2, EDGE), W - EDGE - card.offsetWidth))
  card.style.left = `${left}px`
  card.style.top = `${Math.round(y + 12)}px`
  card.style.transformOrigin = `${Math.round(x - left)}px 0`
  card.style.setProperty('--tail', `${Math.round(x - left)}px`)
  // the ring fills up from empty as the card opens
  requestAnimationFrame(() => ((card.querySelector('.lp-fg') as SVGCircleElement).style.strokeDashoffset = String(BIG * (1 - l.progress))))
}
