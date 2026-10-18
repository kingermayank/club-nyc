export type Slot = 'head' | 'face' | 'neck' | 'body' | 'legs' | 'feet' | 'hand'
export const SLOTS: Slot[] = ['head', 'face', 'neck', 'body', 'legs', 'feet', 'hand']
export const SLOT_LABEL: Record<Slot, string> = {
  head: 'Hats',
  face: 'Glasses',
  neck: 'Neck',
  body: 'Tops',
  legs: 'Bottoms',
  feet: 'Shoes',
  hand: 'In hand',
}

export interface Look {
  skin: number
  hair: HairStyle
  hairColor: number
  /** signature colour (index into SIG_COLORS): your "penguin colour", worn by the signature hoodie */
  color?: number
  items: Partial<Record<Slot, string>>
}

export type HairStyle = 'short' | 'bob' | 'long' | 'curly' | 'bun' | 'ponytail' | 'spiky' | 'buzz' | 'braids' | 'afro' | 'puffs' | 'locs' | 'twists' | 'fade'
/** picker order: silhouettes alternate so neighbours look different; a third are textured styles */
export const HAIR_STYLES: HairStyle[] = ['short', 'fade', 'curly', 'afro', 'bob', 'puffs', 'long', 'locs', 'twists', 'braids', 'bun', 'ponytail', 'spiky', 'buzz']

// saved looks store an index, so new tones are appended; SKIN_ORDER is how pickers lay them out, light to deep
export const SKINS = ['#ffe3cc', '#f7cba4', '#e6ad80', '#c98c5c', '#9c6440', '#6e4228', '#b47a4e', '#4f2e1c']
export const SKIN_ORDER = [0, 1, 2, 3, 6, 4, 5, 7]
export const HAIR_COLORS = ['#2a2321', '#5a3a26', '#8b5b33', '#f2c85b', '#d7712c', '#c9c8d2', '#ff8fc8', '#5aa7ff', '#9a6cff', '#4fc27e']

/** Signature colours: the one bold colour that makes you recognisable across Times Square (Club Penguin's penguin colour). */
export const SIG_COLORS: { name: string; hex: string }[] = [
  { name: 'Taxi Yellow', hex: '#ffc634' },
  { name: 'Hydrant Red', hex: '#e2453c' },
  { name: 'Pizza Orange', hex: '#ff8a2a' },
  { name: 'Lox Pink', hex: '#ff8fae' },
  { name: 'Broadway Purple', hex: '#8a5cd6' },
  { name: 'Bodega Blue', hex: '#3d72d9' },
  { name: 'Liberty Teal', hex: '#36b5a6' },
  { name: 'Subway Green', hex: '#2f9e55' },
  { name: 'Mint Chip', hex: '#9fe0b8' },
  { name: 'Brooklyn Brick', hex: '#b9533a' },
  { name: 'Pretzel Brown', hex: '#8f5d36' },
  { name: 'Pigeon Grey', hex: '#8c93a6' },
  { name: 'Midnight', hex: '#2d3352' },
  { name: 'Snow White', hex: '#f3f3f6' },
]
export const sigColor = (look: Pick<Look, 'color'>) => SIG_COLORS[look.color ?? 5]?.hex ?? SIG_COLORS[5].hex

export const OUTLINE = '#1d2140'

export function shade(hex: string, amt = 0.16): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amt))))
  const r = f(n >> 16)
  const g = f((n >> 8) & 255)
  const b = f(n & 255)
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

export function tint(hex: string, amt = 0.25): string {
  const n = parseInt(hex.slice(1), 16)
  const f = (c: number) => Math.round(c + (255 - c) * amt)
  return '#' + ((f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).padStart(6, '0')
}
