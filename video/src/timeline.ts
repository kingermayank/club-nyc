/**
 * The trailer's beat grid. The soundtrack is "Sidewalk Shuffle", an original bouncy theme in the spirit of Club
 * Penguin's music, at 100 BPM, so at 30 fps one beat is exactly 18 frames and one bar (4 beats) is 72. Scenes cut on beats, and the music
 * renderer (video/capture/music.py) reads this same file for its arrangement and sound effects, so picture and sound
 * can't drift apart.
 */
export const FPS = 30
export const BPM = 100
export const BEAT = 18
export const BAR = 4 * BEAT
/** 16 bars of song; the last chord lands on the end card and rings out for 2 more bars */
export const SONG_BARS = 16
export const TOTAL = (SONG_BARS + 2) * BAR

export const beats = (n: number) => Math.round(n * BEAT)

/** each scene's first beat and length in beats */
export const SCENE = {
  chat: { at: 0, len: 8 },
  title: { at: 8, len: 4 },
  creator: { at: 12, len: 4 },
  explore: { at: 16, len: 8 },
  hangout: { at: 24, len: 4 },
  jobs: { at: 28, len: 4 },
  jam: { at: 32, len: 4 },
  mob: { at: 36, len: 4 },
  home: { at: 40, len: 8 },
  more: { at: 48, len: 8 },
  finale: { at: 56, len: 8 },
  end: { at: 64, len: TOTAL / BEAT - 64 },
} as const

/** the yellow cab drives across these cuts (in beats), honking on the way */
export const TAXI = [SCENE.explore.at, SCENE.more.at] as const

/** pop…honk: the game's own sounds. boom, braam, riser, crash: movie-trailer hits for the mock-epic reels */
export type SfxKind = 'pop' | 'coin' | 'stamp' | 'thud' | 'whoosh' | 'click' | 'honk' | 'boom' | 'braam' | 'riser' | 'crash'

/** sound effects that land with something on screen, in beats from the start (`notes`: a honk's two pitches, MIDI) */
export const SFX: { beat: number; kind: SfxKind; notes?: [number, number] }[] = [
  // the group chat
  { beat: 1, kind: 'pop' },
  { beat: 2.5, kind: 'pop' },
  { beat: 4, kind: 'pop' },
  { beat: 5.5, kind: 'pop' },
  // into the logo
  { beat: 7.25, kind: 'whoosh' },
  // "wait, new fit first": a new look on each beat
  { beat: 12, kind: 'pop' },
  { beat: 13, kind: 'click' },
  { beat: 14, kind: 'click' },
  { beat: 15, kind: 'click' },
  // the cab: a honk as it comes, a whoosh as it drives across the cut (its horn in tune with the chord underneath)
  { beat: 15.75, kind: 'honk', notes: [69, 72] },
  { beat: 16, kind: 'whoosh' },
  { beat: 16.5, kind: 'pop' },
  // "brb, gotta make rent"
  { beat: 28, kind: 'pop' },
  { beat: 29, kind: 'coin' },
  { beat: 31, kind: 'coin' },
  // the Dance Jam, the flash mob, the afterparty
  { beat: 32, kind: 'pop' },
  { beat: 36, kind: 'pop' },
  { beat: 40, kind: 'pop' },
  // furniture lands
  { beat: 40.5, kind: 'thud' },
  { beat: 41, kind: 'thud' },
  { beat: 41.5, kind: 'thud' },
  { beat: 42, kind: 'thud' },
  { beat: 42.5, kind: 'thud' },
  // the cab again, into the last chorus
  { beat: 47.75, kind: 'honk', notes: [67, 71] },
  { beat: 48, kind: 'whoosh' },
  { beat: 48.5, kind: 'stamp' },
  // "same time tomorrow?"
  { beat: 56.5, kind: 'pop' },
  // the Play now button
  { beat: 68, kind: 'pop' },
]
