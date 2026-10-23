/**
 * Dev builds only: every sound effect in the game on one board, so they can be heard (and QA'd) without playing
 * through each job. Open it from the console with `clubNycSounds.open()`; QA scripts use
 * `await clubNycSounds.list()` and `clubNycSounds.play('subway.arrive')`.
 */
import { sfx } from '../audio'
import { FOLEY } from '../foley'
import { el } from '../engine/stage'
import { openOverlay, closeButton } from '../engine/ui'

type Board = Record<string, () => unknown>

/** each group loads its own sounds (game sound modules stay out of the main bundle until asked for) */
const GROUPS: { title: string; load: () => Promise<Board> }[] = [
  {
    title: 'City',
    load: async () => {
      const out: Board = {}
      for (const [k, f] of Object.entries(sfx)) if (typeof f === 'function' && f.length === 0) out[`sfx.${k}`] = f as () => void
      out['sfx.piano'] = () => sfx.piano(64)
      return out
    },
  },
  { title: 'Places', load: async () => FOLEY },
  {
    title: 'Slice Factory',
    load: async () => {
      const { SliceSound } = await import('../games/slice-factory/sound')
      const s = new SliceSound(true)
      const out: Board = {}
      for (const k of ['squirt', 'sprinkle', 'plop', 'pickup', 'flop', 'whoosh', 'sizzle', 'smear', 'sad', 'sparkle', 'ovenDing', 'burnt', 'cut', 'box'] as const) {
        const f = (s as unknown as Record<string, () => void>)[k]
        if (typeof f === 'function')
          out[`slice.${k}`] = () => {
            s.wake()
            f.call(s)
          }
      }
      return out
    },
  },
  {
    title: 'Halal Rush',
    load: async () => {
      const { snd } = await import('../games/halal-rush/sound')
      return Object.fromEntries(Object.entries(snd).filter(([k]) => k !== 'stop').map(([k, f]) => [`halal.${k}`, () => (f as () => void)()]))
    },
  },
  {
    title: 'Bagel Counters',
    load: async () => {
      const { bagelSfx } = await import('../games/bagel-counters/sound')
      return Object.fromEntries(Object.entries(bagelSfx).map(([k, f]) => [`bagel.${k}`, () => (f as (...a: unknown[]) => void)()]))
    },
  },
  {
    title: 'Ferry Captain',
    load: async () => {
      const { ferrySfx } = await import('../games/ferry-captain/sound')
      return Object.fromEntries(Object.entries(ferrySfx).map(([k, f]) => [`ferry.${k}`, () => (f as () => void)()]))
    },
  },
  {
    title: 'Showtime',
    load: async () => {
      const { showSfx } = await import('../games/showtime/sound')
      return Object.fromEntries(Object.entries(showSfx).map(([k, f]) => [`showtime.${k}`, () => (f as () => void)()]))
    },
  },
  {
    title: 'Broadway Songs',
    load: async () => {
      const { previewSong, SHOW_IDS } = await import('../features/theater')
      return Object.fromEntries(SHOW_IDS.map((id) => [`song.${id}`, () => previewSong(id, 8)]))
    },
  },
]

let cache: Promise<{ title: string; sounds: Board }[]> | null = null
const all = () => (cache ??= Promise.all(GROUPS.map(async (g) => ({ title: g.title, sounds: await g.load().catch(() => ({}) as Board) }))))

export async function soundNames(): Promise<string[]> {
  return (await all()).flatMap((g) => Object.keys(g.sounds))
}

export async function playSound(name: string): Promise<boolean> {
  for (const g of await all()) {
    const f = g.sounds[name]
    if (f) {
      f()
      return true
    }
  }
  return false
}

export async function openSoundboard() {
  const groups = await all()
  const p = el('div', 'panel wide soundboard')
  p.style.cssText = 'width:860px;max-height:520px;overflow-y:auto;text-align:left'
  p.append(el('h2', '', 'Sound Board'))
  for (const g of groups) {
    p.append(el('h4', '', g.title))
    const row = el('div', '')
    row.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px'
    for (const [name, f] of Object.entries(g.sounds)) {
      const b = el('button', 'btn tiny', name.split('.').slice(1).join('.') || name)
      b.title = name
      b.onclick = () => f()
      row.append(b)
    }
    p.append(row)
  }
  p.append(closeButton())
  openOverlay(p)
}
