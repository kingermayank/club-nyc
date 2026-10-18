import { save, persist } from '../state'
import { RESIDENT, type Resident } from './residents'

export const isFriend = (id: string) => save.friends.includes(id)
export const friends = (): Resident[] => save.friends.map((id) => RESIDENT[id]).filter(Boolean)

export function bond(id: string, by = 1) {
  save.affinity[id] = Math.min(10, (save.affinity[id] ?? 0) + by)
  persist()
}

/**
 * Ask a resident to be friends (Club Penguin's buddy request).
 * They say yes if you've hung out a little — or sometimes right away if you're neighbors.
 */
export function requestFriend(r: Resident): 'accepted' | 'later' | 'already' {
  if (isFriend(r.id)) return 'already'
  const aff = save.affinity[r.id] ?? 0
  const sameTeam = save.team === r.team
  const chance = 0.45 + (sameTeam ? 0.25 : 0) + Math.min(aff, 3) * 0.2
  if (Math.random() < chance) {
    save.friends.push(r.id)
    bond(r.id, 1)
    persist()
    return 'accepted'
  }
  bond(r.id, 1)
  return 'later'
}

export function unfriend(id: string) {
  save.friends = save.friends.filter((f) => f !== id)
  persist()
}

export const ACCEPT_LINES = ['Yes!! Friends! 🤝', 'Of course! Let’s hang out!', 'Buddy request accepted 😄', 'Finally! 🎉']
export const LATER_LINES = ['Let’s hang out a bit first! 😄', 'Wave at me more and we’ll see 😜', 'Hmm, do I know you? Dance with me first!']
