import { sfx } from '../audio'
import { save, bump } from '../state'
import { el } from '../engine/stage'
import { ui } from '../engine/ui'
import { world, onRoomChange } from '../engine/world'
import { link } from '../net/link'
import { CHAT_MAX, EMOTES } from '../net/protocol'

/**
 * Chat: type anything (Enter to open, Enter to send), and the smiley next to the box for emoji bubbles. Online, everyone
 * in your room sees your bubble; the server filters it first.
 */
export interface ChatLine {
  name: string
  text: string
  /** user id (click a name to open their card) */
  id?: string
  team?: string
  kind: 'chat' | 'me' | 'sys'
}

// what was said lately, kept for context when a player is reported (there's no scrollback to read it back on screen)
const lines: ChatLine[] = []
let onName: ((id: string) => void) | null = null

export function logLine(l: ChatLine) {
  lines.push(l)
  if (lines.length > 80) lines.shift()
}
export const chatHistory = () => lines

/** Clicking a name (multiplayer opens that player's card). */
export function onChatName(f: (id: string) => void) {
  onName = f
}
export const openNameCard = (id: string) => onName?.(id)

/** Say something out loud. */
export function say(text: string) {
  const t = text.replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX)
  if (!t) return
  world.player.say(t)
  bump('chats')
  // online, the server's (filtered) echo is what everyone else saw
  if (link.online) link.send({ t: 's', m: t })
  else logLine({ name: save.name || 'You', text: t, kind: 'me', team: save.team })
}

/** A big emoji bubble. */
export function emoteBubble(e: string) {
  world.player.say(e)
  if (link.online && EMOTES.includes(e)) link.send({ t: 'e', e })
}

const SMILEY =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="#ffe08a" stroke="#1d2140" stroke-width="2.2"/><circle cx="9" cy="10" r="1.4" fill="#1d2140"/><circle cx="15" cy="10" r="1.4" fill="#1d2140"/><path d="M8 14 Q12 17.5 16 14" fill="none" stroke="#1d2140" stroke-width="2.2" stroke-linecap="round"/></svg>'

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
  const emojiBtn = el('button', 'chat-emoji-btn', SMILEY)
  emojiBtn.title = 'Emojis'
  emojiBtn.setAttribute('aria-label', 'Emojis')
  emojiBtn.setAttribute('aria-expanded', 'false')
  bar.append(emojiBtn, input, send)

  // the emoji tray opens out of the chat bar; one tap and the emoji pops over your head
  const tray = el('div', 'chat-emojis')
  tray.setAttribute('role', 'menu')
  tray.setAttribute('aria-label', 'Emojis')
  const setTray = (open: boolean) => {
    tray.classList.toggle('open', open)
    emojiBtn.classList.toggle('on', open)
    emojiBtn.setAttribute('aria-expanded', String(open))
  }
  for (const e of EMOTES) {
    const b = el('button', 'chat-emoji', e)
    b.setAttribute('role', 'menuitem')
    b.onclick = (ev) => {
      ev.stopPropagation()
      sfx.pop()
      emoteBubble(e)
      setTray(false)
    }
    tray.append(b)
  }
  bar.append(tray)

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
  input.addEventListener('focus', () => setTray(false))
  // typing in the chat never makes you walk or triggers the room under the toolbar
  for (const ev of ['click', 'pointerdown'] as const) bar.addEventListener(ev, (e) => e.stopPropagation())
  send.onclick = submit
  emojiBtn.onclick = () => {
    sfx.click()
    setTray(!tray.classList.contains('open'))
  }
  document.addEventListener(
    'pointerdown',
    (e) => {
      if (tray.classList.contains('open') && !(e.target as Element).closest?.('.chat-bar')) setTray(false)
    },
    true,
  )
  onRoomChange(() => setTray(false))
  // Enter anywhere opens the chat; Escape closes the tray
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && tray.classList.contains('open')) return setTray(false)
    if (e.key !== 'Enter' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
    if (ui.modal || document.querySelector('.creator, .game-shell')) return
    e.preventDefault()
    input.focus({ preventScroll: true })
  })
  return bar
}
