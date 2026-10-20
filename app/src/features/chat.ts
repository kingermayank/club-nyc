import { sfx } from '../audio'
import { save, bump } from '../state'
import { el } from '../engine/stage'
import { ui } from '../engine/ui'
import { world, onRoomChange } from '../engine/world'
import { link } from '../net/link'
import { CHAT_MAX, EMOTES } from '../net/protocol'
import { TEAMS, type TeamId } from '../social/teams'

/**
 * Chat: type anything (Enter to open, Enter to send), quick phrases (they pop up from the empty chat box), emote bubbles, and a
 * scrollback log. Online, everyone in your room sees your bubble; the server filters it first.
 */
export interface ChatLine {
  name: string
  text: string
  /** user id (click a name to open their card) */
  id?: string
  team?: string
  kind: 'chat' | 'me' | 'sys'
}

const lines: ChatLine[] = []
const log = el('div', 'chat-log')
const logList = el('div', 'chat-log-list')
let logBtn: HTMLButtonElement | null = null
let unread = 0
let onName: ((id: string) => void) | null = null

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

export function logLine(l: ChatLine) {
  lines.push(l)
  if (lines.length > 80) lines.shift()
  const row = el('div', 'chat-line ' + l.kind)
  if (l.kind === 'sys') row.innerHTML = `<span>${esc(l.text)}</span>`
  else {
    const color = l.team ? TEAMS[l.team as TeamId]?.color : undefined
    row.innerHTML = `<b ${color ? `style="--team:${color}"` : ''}>${esc(l.name)}</b><span>${esc(l.text)}</span>`
    if (l.id && onName) {
      const id = l.id
      row.querySelector('b')!.onclick = () => onName?.(id)
    }
  }
  logList.append(row)
  while (logList.children.length > 80) logList.firstElementChild?.remove()
  if (log.classList.contains('open')) logList.scrollTop = logList.scrollHeight
  else if (l.kind !== 'me') {
    unread++
    logBtn?.setAttribute('data-unread', String(Math.min(unread, 9)))
  }
}
export const chatHistory = () => lines

/** The log is something you open to read back (the ^ button), not a fixture: it closes again when you click
 * anywhere else, press Escape, or change rooms. */
function setLog(open: boolean) {
  log.classList.toggle('open', open)
  logBtn?.classList.toggle('on', open)
  if (!open) return
  unread = 0
  logBtn?.removeAttribute('data-unread')
  logList.scrollTop = logList.scrollHeight
}

/** Clicking a name in the log (multiplayer opens that player's card). */
export function onChatName(f: (id: string) => void) {
  onName = f
}

/** Say something out loud. */
export function say(text: string) {
  const t = text.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX)
  if (!t) return
  world.player.say(t)
  bump('chats')
  // online, the log shows the server's (filtered) echo — that's exactly what everyone else saw
  if (link.online) link.send({ t: 's', m: t })
  else logLine({ name: save.name || 'You', text: t, kind: 'me', team: save.team })
}

/** A big emoji bubble. */
export function emoteBubble(e: string) {
  world.player.say(e)
  if (link.online && EMOTES.includes(e)) link.send({ t: 'e', e })
}

/** One-tap things to say: they pop up from the chat box while it's empty (and vanish as you type). */
export const PHRASES = [
  'Hi!', 'How YOU doin’?', 'I’m walkin’ here!', 'Fuggedaboutit!', 'Let’s get pizza!', 'Halal run?', 'Meet me at the clock.',
  'Stand clear of the closing doors!', 'Is this the line for brunch?', 'Only in New York…', 'See you on the subway!', 'Bye! 👋',
]

export function chatBar(): HTMLElement {
  const bar = el('div', 'chat-bar')
  const input = document.createElement('input')
  input.className = 'chat-input'
  input.maxLength = CHAT_MAX
  input.placeholder = 'Say something…'
  input.autocomplete = 'off'
  input.spellcheck = true
  input.setAttribute('aria-label', 'Chat message')
  input.setAttribute('enterkeyhint', 'send')
  const send = el('button', 'chat-send', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 L20 4 L15 20 L11.5 13.2 Z" fill="#fff" stroke="#1d2140" stroke-width="2.2" stroke-linejoin="round"/></svg>')
  send.title = 'Send (Enter)'
  send.setAttribute('aria-label', 'Send message')
  logBtn = el('button', 'chat-log-btn', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15 L12 9 L18 15" fill="none" stroke="#1d2140" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>')
  logBtn.title = 'Chat log'
  logBtn.setAttribute('aria-label', 'Chat log')
  bar.append(logBtn, input, send)

  // quick phrases live in the chat box: they pop up when you click into it empty, and vanish as you type
  const phrases = el('div', 'chat-phrases')
  phrases.setAttribute('role', 'listbox')
  phrases.setAttribute('aria-label', 'Quick phrases')
  for (const line of PHRASES) {
    const b = el('button', 'chat-phrase', line)
    b.onmousedown = (e) => e.preventDefault() // keep the box focused so the click lands
    b.onclick = (e) => {
      e.stopPropagation()
      sfx.pop()
      say(line)
      input.value = ''
      input.blur()
    }
    phrases.append(b)
  }
  bar.append(phrases)
  // (not while the log is open: they'd pop up on top of what you're reading)
  const syncPhrases = () => phrases.classList.toggle('open', document.activeElement === input && !input.value && !log.classList.contains('open'))
  input.addEventListener('focus', syncPhrases)
  input.addEventListener('input', syncPhrases)
  input.addEventListener('blur', () => phrases.classList.remove('open'))

  const submit = () => {
    const v = input.value
    input.value = ''
    if (v.trim()) {
      sfx.pop()
      say(v)
    }
    input.blur()
  }
  input.onkeydown = (e) => {
    e.stopPropagation()
    if (e.key === 'Enter') submit()
    if (e.key === 'Escape') {
      input.value = ''
      input.blur()
    }
  }
  // typing in the chat never makes you walk or triggers the room under the toolbar
  for (const ev of ['click', 'pointerdown'] as const) bar.addEventListener(ev, (e) => e.stopPropagation())
  send.onclick = submit
  logBtn.onclick = () => {
    sfx.click()
    setLog(!log.classList.contains('open'))
    syncPhrases()
  }
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (log.classList.contains('open') && !(e.target as Element).closest?.('.chat-log, .chat-bar')) setLog(false)
    },
    true,
  )
  onRoomChange(() => setLog(false))
  // the log opens out of the chat bar, edge to edge with it (like the quick phrases)
  if (!log.childElementCount) log.append(el('div', 'chat-log-head', '<b>Chat</b><small>Only people in this room can see what you say</small>'), logList)
  bar.append(log)
  // Enter anywhere opens the chat; Escape closes the log
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && log.classList.contains('open')) return setLog(false)
    if (e.key !== 'Enter' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
    if (ui.modal || document.querySelector('.creator, .game-shell')) return
    e.preventDefault()
    input.focus({ preventScroll: true })
  })
  return bar
}
