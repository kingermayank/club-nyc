/** Club Penguin ran a party every month. Ours: the Village Halloween Parade. */
export const PARTY = {
  id: 'halloween-2026',
  name: 'Halloween Parade Party',
  room: 'parade',
  /** switched off for now — flip back to true to bring back the badge, decorations, candy hunt, parade room and spooky extras */
  enabled: false,
  start: new Date('2026-10-01T00:00:00'),
  end: new Date('2026-11-03T00:00:00'),
  freebies: ['witch-hat', 'pumpkin-hat', 'skeleton-hoodie', 'vampire-cape', 'candy-bucket'],
}

export const partyOn = () => {
  if (!PARTY.enabled) return false
  const now = new Date()
  return now >= PARTY.start && now < PARTY.end
}
