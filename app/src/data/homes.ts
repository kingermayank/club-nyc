/**
 * Places you can live. Each home is its own room (art + geometry); your furniture is kept per home.
 * Sold through StreetCheesy, the city's most honest listings app.
 */
export interface HomeDef {
  id: string
  /** room id (art + geometry) */
  room: string
  name: string
  hood: string
  price: number
  /** listing photo */
  img: string
  blurb: string
  perks: string[]
  /** fine print, StreetCheesy style */
  fine: string
  soon?: boolean
}

export const HOMES: HomeDef[] = [
  {
    id: 'walkup',
    room: 'apartment',
    name: '5th-Floor Walk-Up',
    hood: 'East Village',
    price: 0,
    img: '/art/rooms/apartment.jpg',
    blurb: 'Charming (tiny) one-bedroom with exposed brick, a radiator with opinions and a view of three water towers.',
    perks: ['Bodega downstairs', 'Fire-escape “balcony”', 'Steps = free gym'],
    fine: 'No elevator. No dishwasher. No regrets.',
  },
  {
    id: 'loft',
    room: 'loft',
    name: 'Cast-Iron Loft',
    hood: 'SoHo · Greene St',
    price: 1500,
    img: '/art/rooms/loft.jpg',
    blurb: 'Soaring arched windows, white iron columns and wide-plank floors in a landmarked cast-iron building. Artists lived here once. Now: you.',
    perks: ['14-ft ceilings', 'Cobblestone views', 'Room for a LOT of furniture'],
    fine: 'Freight elevator operated by a man named Sal. Be nice to Sal.',
  },
  {
    id: 'penthouse',
    room: 'penthouse',
    name: 'Billionaires’ Row Penthouse',
    hood: '57th Street · 90-something floors up',
    price: 4000,
    img: '/art/rooms/penthouse.jpg',
    blurb: 'A wraparound terrace above Central Park, a built-in bar and a DJ nook. The building sways a little in the wind. That’s normal. Probably.',
    perks: ['Party terrace', 'Whole-park views', 'Your own DJ booth'],
    fine: 'Ears pop in the elevator. Neighbors are mostly in Monaco.',
  },
  {
    id: 'brownstone',
    room: '',
    name: 'Park Slope Brownstone',
    hood: 'Brooklyn',
    price: 0,
    img: '',
    blurb: 'Stoop, garden, a stroller in every hallway.',
    perks: [],
    fine: 'Brooklyn opens soon.',
    soon: true,
  },
]
export const HOME: Record<string, HomeDef> = Object.fromEntries(HOMES.map((h) => [h.id, h]))
export const HOME_ROOMS = new Set(HOMES.filter((h) => h.room).map((h) => h.room))
export const isHomeRoom = (room: string) => HOME_ROOMS.has(room)
export const homeOfRoom = (room: string) => HOMES.find((h) => h.room === room)
