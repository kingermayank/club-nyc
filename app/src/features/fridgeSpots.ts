import { save } from '../state'

/**
 * Where each magnet sits on the fridge door, as a share of the door's width and height. Shared by the close-up
 * (features/fridge.ts), where you drag them, and the apartment (features/souvenirs.ts), where the same arrangement
 * shows on the fridge in the room.
 */
/** magnets stay clear of the handle (left) and inside the part of the door the close-up shows (it runs off the
 * bottom of the picture) */
export const DOOR_PAD = { l: 0.24, r: 0.92, t: 0.07, b: 0.56 }
/** where a magnet goes before you've ever moved it: a loose scatter, by its place in the collection */
const SCATTER: [number, number][] = [[0.36, 0.14], [0.62, 0.11], [0.82, 0.2], [0.47, 0.29], [0.72, 0.36], [0.34, 0.43], [0.58, 0.5], [0.84, 0.5], [0.3, 0.27]]

export function magnetSpot(id: string, index: number): [number, number] {
  const [x, y] = save.magnetAt?.[id] ?? SCATTER[index % SCATTER.length]
  return [Math.min(DOOR_PAD.r, Math.max(DOOR_PAD.l, x)), Math.min(DOOR_PAD.b, Math.max(DOOR_PAD.t, y))]
}
