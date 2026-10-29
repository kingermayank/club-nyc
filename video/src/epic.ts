/**
 * Mock-epic trailer reels: a blockbuster trailer about something tiny (here, a halal cart's lunch rush). The joke is
 * the gap between huge trailer grammar (letterbox bars, a serif title, booms, a dead-silent beat) and a cute game.
 *
 * Everything is placed in beats, so the cut follows the music. The prototype runs on Sidewalk Shuffle at 100 BPM; to
 * switch to a bought trailer track, drop it in video/public/audio and fill in `TRACK` (its BPM, and where its first
 * downbeat lands): the shots and hits re-time to it, and the hits render as their own track (renderEpicAudio 'hits').
 * The picture is EpicReel.tsx; the sound is capture/music-entry.ts → renderEpicAudio.
 */
import type { SfxKind } from './timeline'

/** null = the Sidewalk Shuffle prototype. For the Epikton track: { file: 'epikton-....wav', bpm: 122, offset: 0.0 } */
export const TRACK = null as { file: string; bpm: number; offset: number } | null

export const EPIC_BPM = TRACK?.bpm ?? 100
export const EPIC_BEATS = 32

export interface EpicShot {
  at: number
  beats: number
  /** footage in public/footage; leave out for a black card */
  src?: string
  from?: number
  /** playback speed: 0.5 = slow motion */
  rate?: number
  /** the crop inside the 16:9 frame: where to aim, and the push-in */
  origin?: string
  zoom?: [number, number]
  /** words slammed in over the shot, each on its own beat (relative to the shot's start) */
  slams?: { beat: number; text: string; size?: number }[]
  /** a cute, small line (the game's own font) instead of trailer type */
  cute?: string
  /** the money counter during the montage */
  money?: [number, number]
}

/** "Halal Rush: the trailer". Footage: public/footage/rush.mp4 (capture.py rush) */
export const EPIC_SHOTS: EpicShot[] = [
  // the cold open: a whole city, then one person
  { at: 0, beats: 4, src: 'hero-empire-deck.mp4', from: 0.2, rate: 0.5, origin: '92% 18%', zoom: [1.45, 1.6], slams: [{ beat: 0, text: 'In a city of' }, { beat: 2, text: '8 million people' }] },
  { at: 4, beats: 2, src: 'place-central-park.mp4', from: 1.5, rate: 0.5, origin: '52% 64%', zoom: [1.55, 1.7], slams: [{ beat: 0, text: 'one New Yorker' }] },
  { at: 6, beats: 2, slams: [{ beat: 0, text: 'had one job.' }] },
  // the job, one hit per word
  { at: 8, beats: 2, src: 'rush.mp4', from: 0.7, origin: '22% 62%', zoom: [1.35, 1.45], slams: [{ beat: 0, text: 'LUNCH.', size: 180 }] },
  { at: 10, beats: 2, src: 'rush.mp4', from: 2.5, rate: 0.45, origin: '45% 72%', zoom: [1.5, 1.7], slams: [{ beat: 0, text: 'IS.', size: 180 }] },
  { at: 12, beats: 2, src: 'rush.mp4', from: 4.5, origin: '70% 35%', zoom: [1.4, 1.5], slams: [{ beat: 0, text: 'COMING.', size: 150 }] },
  // the montage: a cut on every beat while the money climbs
  { at: 14, beats: 1, src: 'rush.mp4', from: 8.4, origin: '30% 70%', zoom: [1.35, 1.4], money: [13, 26] },
  { at: 15, beats: 1, src: 'rush.mp4', from: 10.7, origin: '72% 30%', zoom: [1.5, 1.55], money: [26, 26] },
  { at: 16, beats: 1, src: 'rush.mp4', from: 14.6, origin: '38% 70%', zoom: [1.5, 1.6], money: [26, 40] },
  { at: 17, beats: 1, src: 'rush.mp4', from: 16.8, origin: '70% 30%', zoom: [1.45, 1.5], money: [40, 40] },
  { at: 18, beats: 1, src: 'rush.mp4', from: 20.6, origin: '40% 72%', zoom: [1.45, 1.5], money: [40, 54] },
  { at: 19, beats: 1, src: 'rush.mp4', from: 22.6, origin: '72% 30%', zoom: [1.5, 1.55], money: [54, 54] },
  { at: 20, beats: 2, src: 'rush.mp4', from: 26.4, rate: 0.6, origin: '42% 74%', zoom: [1.4, 1.6], money: [54, 66] },
  { at: 22, beats: 2, src: 'rush.mp4', from: 29.0, rate: 0.5, origin: '50% 45%', zoom: [1.05, 1.12], slams: [{ beat: 0, text: '$66.' }], money: [66, 66] },
  // the gag: the band stops dead
  { at: 24, beats: 2, cute: '…and they still forgot to eat lunch.' },
  // the title
  { at: 26, beats: 6 },
]

/** the hits, in beats (they re-time with the track) */
export const EPIC_SFX: { beat: number; kind: SfxKind }[] = [
  { beat: 0, kind: 'boom' },
  { beat: 2, kind: 'braam' },
  { beat: 4, kind: 'braam' },
  { beat: 6, kind: 'boom' },
  { beat: 8, kind: 'braam' },
  { beat: 10, kind: 'braam' },
  { beat: 12, kind: 'braam' },
  { beat: 12, kind: 'crash' },
  { beat: 14, kind: 'coin' },
  { beat: 16, kind: 'coin' },
  { beat: 18, kind: 'coin' },
  { beat: 20, kind: 'coin' },
  // the riser lands on the dead air: the whole trailer builds to… nothing
  { beat: 24, kind: 'riser' },
  { beat: 22, kind: 'boom' },
  { beat: 26, kind: 'boom' },
  { beat: 26, kind: 'braam' },
  { beat: 26, kind: 'crash' },
  { beat: 29, kind: 'pop' },
]

/** where the music drops out (beats): the gag */
export const EPIC_RESTS: [number, number][] = [[24, 26]]
