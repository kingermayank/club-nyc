import { CHAT_MAX } from '../../../app/src/net/protocol.ts'

/**
 * Chat filter. Free text is the most fun and the most risky part of a social world, so:
 * links / emails / phone numbers are removed (no off-platform contact), slurs and strong
 * profanity are masked (with basic leetspeak normalisation), and spammy repetition is squashed.
 * Mute, block and report live elsewhere; this is the first line of defence, not the only one.
 */
const BLOCKED = [
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'pussy', 'cock', 'whore', 'slut', 'bastard',
  'nigger', 'nigga', 'faggot', 'retard', 'kike', 'spic', 'chink', 'tranny', 'rape', 'nazi', 'kys',
]
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's', '!': 'i', '|': 'l' }
const norm = (w: string) =>
  w
    .toLowerCase()
    .replace(/[0134578@$!|]/g, (ch) => LEET[ch] ?? ch)
    .replace(/[^a-z]/g, '')
    .replace(/(.)\1{2,}/g, '$1$1')

const LINK = /\b((https?:\/\/|www\.)\S+|\S+\.(com|net|org|io|gg|co|me|ly|tv|xyz|app|dev)\b\S*)/gi
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/g
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g

export function cleanChat(raw: string): string {
  let s = String(raw).replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX)
  s = s.replace(EMAIL, '[removed]').replace(LINK, '[link removed]').replace(PHONE, '[removed]')
  s = s.replace(/(.)\1{5,}/g, '$1$1$1$1')
  return s
    .split(/(\s+)/)
    .map((tok) => {
      const n = norm(tok)
      return n && BLOCKED.some((b) => n.includes(b)) ? '★'.repeat(Math.min(6, Math.max(3, tok.length))) : tok
    })
    .join('')
}

export const isClean = (s: string) => cleanChat(s) === s.trim()
