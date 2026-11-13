/**
 * Measurements → a Look. Plain rules, tuned on test portraits in lab/match.html (no model, nothing to pay per use).
 * A photo can't be read perfectly (light changes skin, and curls vs. straight is a guess from a silhouette), so every
 * pick comes with its nearest neighbours: the creator shows them first so a wrong guess is one click to fix.
 */
import { SKIN_ORDER, type HairStyle, type Look } from '../look'
import type { Lab, Reading } from './measure'

export interface Match {
  /** the fields the photo decided (laid over whatever look you had: outfit and signature colour stay) */
  look: Pick<Look, 'skin' | 'hair' | 'hairColor' | 'shape' | 'eyes' | 'brows' | 'nose' | 'beard' | 'specs'>
  /** close seconds, best first (the pick itself is first in each) */
  near: { skin: number[]; hair: HairStyle[]; hairColor: number[] }
  /** the photo was dark: the skin tone is the least certain part */
  dark: boolean
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/**
 * Skin tone. Brightness alone can't be trusted: a dim room (or a webcam's auto-exposure) moves every face towards
 * the same grey. How golden the skin is for its brightness barely changes with the light, and deeper tones are more
 * golden, so the tone is half brightness and half that. It's still a guess, which is why the creator asks you to
 * confirm it. Returns a level (higher is lighter); skinPlace turns it into a place in SKIN_ORDER, light to deep.
 */
export function skinLevel(r: Reading): number {
  const golden = clamp(r.skin.b / Math.max(20, r.skin.L), 0.2, 0.56)
  return 0.5 * r.skin.L + 0.5 * (95 - 100 * golden)
}
function skinPlace(r: Reading): number {
  const L = skinLevel(r)
  const steps = [68, 63, 57, 53, 49, 43.5, 38]
  const i = steps.findIndex((s) => L >= s)
  return i < 0 ? steps.length : i
}

/** Hair colour → HAIR_COLORS index, plus two near ones. */
function hairColors(h: Lab | null): number[] {
  if (!h) return [0, 1, 5]
  const chroma = Math.hypot(h.a, h.b)
  // dyed: pink, blue, purple, green
  if (chroma > 40) {
    if (h.a < -20) return [9, 7, 0]
    if (h.b < -22 && h.a > 14) return [8, 7, 6]
    if (h.b < -22) return [7, 8, 0]
    if (h.a > 34 && h.b < 16) return [6, 8, 4]
  }
  if ((chroma < 18 && h.L > 62) || (chroma < 10 && h.L > 45)) return [5, 3, 2]
  if (h.L < 17 || (h.L < 30 && chroma < 7)) return [0, 1, 5]
  if (h.a > 18 && h.b > 20 && h.L > 24 && h.L < 62) return [4, 2, 1]
  if (h.L > 50 && h.b > 16) return [3, 2, 4]
  if (h.L > 36) return [2, 1, 3]
  return [1, 0, 2]
}

/** Hairstyle from the silhouette: how much hair, how tall, how wide, how far it hangs. */
function hairStyles(r: Reading): HairStyle[] {
  if (r.hairArea < 0.05) return ['bald', 'buzz', 'short']
  if (r.hairDrop > 0.6) return ['long', 'locs', 'braids']
  if (r.hairDrop > -0.05) return ['wavy', 'bob', 'long']
  if (r.hairDrop > -0.45) return r.hairSides >= 0.2 ? ['bob', 'curly', 'short'] : ['curly', 'bob', 'afro']
  if (r.hairTop >= 0.6 && r.hairWidth >= 1.6) return ['afro', 'curly', 'twists']
  if (r.hairTop >= 0.5 && r.hairArea >= 0.5) return ['curly', 'afro', 'fade']
  if (r.hairArea < 0.2) return ['buzz', 'crop', 'short']
  return r.hairTop >= 0.45 ? ['quiff', 'sidepart', 'short'] : ['short', 'sidepart', 'crop']
}

function beard(r: Reading): number {
  if (r.chin.dark >= 0.18 && r.jaw.dark >= 0.18 && r.lip.dark >= 0.12) return 4
  if (r.chin.dark >= 0.2 && r.jaw.dark < 0.15) return r.lip.dark >= 0.2 ? 5 : 3
  if (r.lip.dark >= 0.25 && r.chin.dark < 0.12) return 2
  if (r.chin.dark >= 0.1 && r.lip.dark >= 0.1) return 1
  return 0
}

function specs(r: Reading): number {
  if (r.eyeGear < 0.012 && r.bridge < 0.38) return 0
  return r.bridge >= 0.3 ? 2 : 1
}

function shape(r: Reading): number {
  if (r.jawRatio >= 0.83 && r.faceRatio < 1.2) return 2
  if (r.faceRatio >= 1.23) return 1
  if (r.jawRatio <= 0.785) return 3
  return 0
}

function eyes(i: Lab | null): number {
  if (!i || i.L < 20) return 0
  if (i.b < 6 && i.L > 30) return Math.hypot(i.a, i.b) < 4 ? 5 : 4
  if (i.a < 4 && i.L > 30) return 3
  if (i.L > 36 && i.b >= 16) return 2
  return i.L > 28 ? 1 : 0
}

export function pickLook(r: Reading): Match {
  const place = skinPlace(r)
  const around = [place, place + 1, place - 1].filter((i) => i >= 0 && i < SKIN_ORDER.length)
  const cols = hairColors(r.hair)
  const styles = hairStyles(r)
  return {
    look: {
      skin: SKIN_ORDER[place],
      hair: styles[0],
      hairColor: cols[0],
      shape: shape(r),
      eyes: eyes(r.iris),
      brows: r.browDark >= 0.3 ? 1 : 0,
      nose: r.noseWidth >= 0.335 ? 2 : r.noseWidth <= 0.285 ? 0 : 1,
      beard: beard(r),
      specs: specs(r),
    },
    near: { skin: around.map((i) => SKIN_ORDER[i]), hair: styles, hairColor: cols },
    dark: r.faceLum < 80,
  }
}
