/**
 * Things you buy around the city that live at home: the Brooklyn Bridge painter's canvases (furniture, on easels)
 * and the souvenir stand's fridge magnets (they go on your apartment fridge).
 */

export interface Painting {
  id: string
  name: string
  price: number
  blurb: string
}

/** Art: art/furniture/<id>.png (sliced from art/raw/sheet-paintings.png). */
export const PAINTINGS: Painting[] = [
  { id: 'art-skyline', name: 'Manhattan at Dusk', price: 12, blurb: 'Painted from the Brooklyn side. He says the view is better from there. He would.' },
  { id: 'art-bridge-night', name: 'The Bridge at Night', price: 14, blurb: 'Every light bulb painted by hand. He counted. You don’t have to.' },
  { id: 'art-taxi-rain', name: 'Taxi in the Rain', price: 12, blurb: 'The only time you’ll ever see a free cab in the rain.' },
  { id: 'art-pigeon-king', name: 'His Majesty, the Pigeon', price: 15, blurb: 'Commissioned by no one. Adored by all.' },
  { id: 'art-pizza', name: 'Still Life with Slice', price: 10, blurb: 'Oil on canvas. Technically, grease on canvas.' },
  { id: 'art-park-autumn', name: 'Central Park in October', price: 14, blurb: 'Peak foliage, zero tourists. A work of fiction.' },
]

/** The paintings as apartment furniture (spread into FURNITURE in features/apartment.ts). Not in the furniture
 * catalog: only the painter on the bridge sells them. */
export const ART_FURNITURE = PAINTINGS.map((p) => ({ id: p.id, name: p.name, price: p.price, w: 92, src: `/art/furniture/${p.id}.png`, cat: 'Decor' as const }))

export interface Magnet {
  id: string
  name: string
  price: number
  blurb: string
}

/** Art: art/magnets/<id>.png (sliced from art/raw/sheet-magnets.png). Owned ones are save.magnets. */
export const MAGNETS: Magnet[] = [
  { id: 'pizza', name: 'Dollar Slice', price: 3, blurb: 'Holds up exactly one takeout menu.' },
  { id: 'taxi', name: 'Yellow Cab', price: 4, blurb: 'Light’s on. Still won’t stop for you.' },
  { id: 'liberty', name: 'Lady Liberty', price: 5, blurb: 'Holding the torch and your electric bill.' },
  { id: 'bagel', name: 'Everything Bagel', price: 3, blurb: 'Seeds may fall off. That’s how you know it’s real.' },
  { id: 'pigeon', name: 'City Pigeon', price: 3, blurb: 'The only pigeon in town that won’t steal your fries.' },
  { id: 'token', name: 'Subway Token', price: 4, blurb: 'Tokens retired in 2003. This one is still waiting for the train.' },
  { id: 'apple', name: 'The Big Apple', price: 3, blurb: 'A 1920s horse-racing writer called New York “the Big Apple”: the biggest prize around. It stuck.' },
  { id: 'hotdog', name: 'Dirty-Water Dog', price: 3, blurb: 'Mustard only. Ketchup sold separately (never).' },
  { id: 'empire', name: 'Empire State', price: 5, blurb: '1,454 feet tall in real life. Two inches on your fridge.' },
]
export const magnetSrc = (id: string) => `/art/magnets/${id}.png`
