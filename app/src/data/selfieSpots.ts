/** Where you can take a selfie with a landmark (features/moments/selfie.ts; the phone menu and the K key open it). */
/**
 * Every famous place you can take one at. Liberty Island is the full set (her poses, the palm trick); everywhere else
 * gets the phone pointed back at the landmark and two poses. `box` is the landmark in the room's logical 1000 × 565
 * space (its traced cutout, mostly); the frame is worked out from it so the landmark stands over your shoulder.
 */
export interface SelfieSpot {
  title: string
  art: string
  box: [x: number, y: number, w: number, h: number]
  sky: string
  /** wind and gulls */
  harbor?: boolean
}
export const SELFIE_SPOTS: Record<string, SelfieSpot> = {
  'liberty-island': { title: 'Liberty Island', art: 'liberty-island-v2', box: [672, 7, 90, 224], sky: '#038ede', harbor: true },
  'wall-street': { title: 'The Bull', art: 'wall-street', box: [598, 216, 192, 164], sky: '#8ec9ef' },
  'brooklyn-bridge': { title: 'Brooklyn Bridge', art: 'brooklyn-bridge-v2', box: [388, 28, 214, 218], sky: '#8ec9ef', harbor: true },
  'times-square': { title: 'Times Square', art: 'times-square-v2', box: [400, 0, 200, 300], sky: '#1b2350' },
  rockefeller: { title: 'Rockefeller Center', art: 'rockefeller', box: [388, 82, 222, 202], sky: '#8ec9ef' },
  'grand-central': { title: 'Grand Central', art: 'grand-central', box: [394, 150, 206, 224], sky: '#e9d7b0' },
  'the-met': { title: 'The Met', art: 'the-met', box: [380, 60, 250, 250], sky: '#8ec9ef' },
  'one-world-trade': { title: 'One World Trade', art: 'one-world-trade', box: [391, 0, 225, 247], sky: '#8ec9ef' },
  'fifth-ave': { title: 'St. Patrick’s Cathedral', art: 'fifth-ave-v2', box: [791, 4, 132, 249], sky: '#8ec9ef' },
  chinatown: { title: 'Chinatown', art: 'chinatown', box: [574, 67, 223, 285], sky: '#8ec9ef' },
  'central-park': { title: 'Central Park', art: 'central-park', box: [356, 30, 311, 137], sky: '#8ec9ef' },
}

