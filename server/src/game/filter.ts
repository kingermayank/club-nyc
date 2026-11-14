import { CHAT_MAX } from '../../../app/src/net/protocol.ts'

/**
 * Chat filter. Free text is the most fun and the most risky part of a social world, so:
 * links / emails / phone numbers are removed (no off-platform contact), slurs, hate terms and strong
 * profanity are masked (leetspeak, stretched letters and s p a c e d letters included), and spammy
 * repetition is squashed. Mute, block and report live elsewhere; this is the first line of defence, not the only one.
 *
 * Words are matched as WORDS, not as letters anywhere: "grape", "skyscraper", "spicy", "cockpit" and
 * "Scunthorpe" are ordinary words. Only a short list of terms that never sit inside an ordinary word
 * (ANYWHERE below) is matched inside longer ones, so "xXfuckXx" is still caught.
 */

/** matched anywhere inside a word (after the ALLOW words are taken out) */
const ANYWHERE = [
  'fuck', 'phuck', 'motherfuck', 'bitch', 'asshole', 'arsehole', 'cunt', 'whore', 'slut', 'bastard', 'pussy',
  'shithead', 'bullshit', 'dipshit', 'shitface', 'dickhead', 'bigdick', 'cocksuck', 'blowjob', 'handjob', 'cumshot', 'jizz', 'dildo', 'porn', 'hentai',
  'nigg', 'niglet', 'faggot', 'tranny', 'shemale', 'retard', 'wetback', 'raghead', 'towelhead', 'jigaboo', 'porchmonkey', 'chingchong',
  'hitler', 'nazi', 'siegheil', 'kukluxklan', 'kuklux', 'whitepower', 'gasthejews', 'pedophil', 'paedophil', 'molest', 'killyourself', 'killurself',
]
/** ordinary words (and names) that happen to contain a term above */
const ALLOW = ['scunthorpe', 'snigger', 'niggl', 'pussycat', 'pussyfoot', 'pussywillow', 'retardant', 'nazir', 'nazim', 'nazia', 'nazish', 'nazik', 'benazir', 'nazareth']
/** matched as a whole word only, or with a plural s ("spic" is on the list; "spicy", "spices" and "despicable" are just words) */
const WHOLE = [
  'shit', 'shite', 'shitty', 'shitting', 'shitter', 'dick', 'cock', 'rape', 'raped', 'raper', 'raping', 'rapist',
  'fuk', 'fuker', 'fuking', 'fukin', 'fuked', 'fck', 'fcking', 'fckin', 'fcker', 'fuq', 'stfu', 'kys', 'twat', 'wanker', 'prick',
  'penis', 'vagina', 'boob', 'tits', 'titties', 'cum', 'cumming', 'nudes', 'sex',
  'fag', 'dyke', 'kike', 'spic', 'spick', 'chink', 'gook', 'coon', 'beaner', 'paki', 'negro', 'negroes', 'jap', 'pedo', 'heil', 'klansman', 'klansmen',
]
const ENDING = '[sz]?'
/**
 * Every letter may be stretched ("fuuuck"); a doubled letter needs at least two ("nigger", never "Niger").
 * Three-letter terms are matched as written (Jaap is a name).
 */
const stretchy = (term: string) => (term.length <= 3 ? term : term.replace(/(.)\1*/g, (run, ch: string) => (run.length > 1 ? `${ch}{${run.length},}` : `${ch}+`)))
const ANY_RE = new RegExp(ANYWHERE.map(stretchy).join('|'))
const ALLOW_RE = new RegExp(ALLOW.join('|'), 'g')
// "kkk" is exactly three: "kkkk" is how half the world types a laugh
const WHOLE_RE = new RegExp(`^(?:(?:${WHOLE.map(stretchy).join('|')})${ENDING}|kkk)$`)
const START_RE = new RegExp(`^(?:${WHOLE.filter((w) => w.length >= 4).map(stretchy).join('|')})`)

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's', '!': 'i', '|': 'l' }
/** letters only: lower case, accents off, leetspeak read as letters */
const norm = (w: string, one = 'i') =>
  w
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[0134578@$!|]/g, (ch) => (ch === '1' ? one : LEET[ch] ?? ch))
    .replace(/[^a-z]/g, '')

const badAnywhere = (n: string) => ANY_RE.test(n.replace(ALLOW_RE, ' '))
const badWord = (n: string) => !!n && (WHOLE_RE.test(n) || badAnywhere(n))

/** One chat token ("word", "Word!", "two-words", "CamelCase", "w0rd99"): is any reading of it on the list? */
function badToken(tok: string): boolean {
  // punctuation at the edges is punctuation ("shit!"), in the middle it may be a letter ("sh!t")
  const core = tok.replace(/^[^A-Za-z0-9@$]+|[^A-Za-z0-9@$]+$/g, '')
  if (!/[A-Za-z@$]/.test(core)) return false // a number, a year, a price: nothing to read
  const parts = new Set<string>([core, core.replace(/^\d+|\d+$/g, '')])
  // "two-words", "snake_case" and "CamelCase" are read piece by piece as well
  for (const p of core.split(/[^A-Za-z0-9@$!|]+|(?<=[a-z])(?=[A-Z])/)) {
    parts.add(p)
    parts.add(p.replace(/^\d+|\d+$/g, ''))
  }
  // a 1 can be an i or an l ("n1gger", "hit1er")
  for (const p of parts) if (badWord(norm(p)) || (p.includes('1') && badWord(norm(p, 'l')))) return true
  return false
}

const LINK = /\b((https?:\/\/|www\.)\S+|\S+\.(com|net|org|io|gg|co|me|ly|tv|xyz|app|dev)\b\S*)/gi
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.]+\b/g
const PHONE = /\+?\d[\d\s().-]{5,}\d/g
const YEAR = /^(1[5-9]\d\d|20\d\d)$/
/**
 * A run of digits is a phone number when it has ten or more digits, or ends like a local number (555-1234).
 * Plain numbers are left alone: a year or a few years ("1999 - 2024"), a coin count ("1000000"), a score.
 */
function phoneLike(run: string): boolean {
  const digits = run.replace(/\D/g, '')
  const groups = run.split(/[^\d]+/).filter(Boolean)
  if (groups.every((g) => YEAR.test(g))) return false
  if (digits.length >= 10) return !(groups.length === 1 && /^\d{1,4}0{6,}$/.test(digits))
  return digits.length >= 7 && /\d{3}[\s.-]\d{4}$/.test(run)
}
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g
/** s p a c e d   o u t (or d.o.t.t.e.d) letters: three or more single characters in a row */
const SPACED = /(?<![A-Za-z0-9@$])[A-Za-z0-9@$!|](?:[\s._*,-]+[A-Za-z0-9@$!|](?![A-Za-z0-9@$])){2,}/g
const stars = (len: number) => '★'.repeat(Math.min(6, Math.max(3, len)))

export function cleanChat(raw: string): string {
  let s = String(raw).replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX)
  s = s.replace(EMAIL, '[removed]').replace(LINK, '[link removed]').replace(PHONE, (m) => (phoneLike(m) ? '[removed]' : m))
  // squash key-mashing ("aaaaaaaa"), never digits ("1000000 coins" is a number)
  s = s.replace(/(\D)\1{5,}/g, '$1$1$1$1')
  s = s.replace(SPACED, (m) => {
    const n = norm(m)
    return badWord(n) || START_RE.test(n) ? stars(n.length) : m
  })
  // phrases that are only harmful together
  s = s.replace(/\bkill\s+(?:yo)?ur\s*sel(?:f|ves)\b/gi, (m) => stars(m.length)).replace(/\b(?:white\s+power|sieg\s+heil|ku\s+klux(?:\s+klan)?|ching\s+chong)\b/gi, (m) => stars(m.length))
  return s
    .split(/(\s+)/)
    .map((tok) => (badToken(tok) ? stars(tok.length) : tok))
    .join('')
}

export const isClean = (s: string) => cleanChat(s) === s.trim()

/** hate terms a name can't contain at all, whatever is around them */
const NAME_RE = /kkk/
/**
 * Names are shown to everyone and have no spaces, so they are read more strictly than chat: the chat filter first,
 * then the whole name as one run of letters (digits and _ can't hide a word: "H1tler", "f_u_c_k", "n4zi_88").
 */
export function cleanName(name: string): boolean {
  if (cleanChat(name) !== name) return false
  // digits read as letters (a 1 as an i or an l), or dropped ("fu1ck")
  for (const n of [norm(name), norm(name, 'l'), name.toLowerCase().replace(/[^a-z]/g, '')]) if (badAnywhere(n) || NAME_RE.test(n)) return false
  return true
}
