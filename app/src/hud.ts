import { sfx, setMuted } from './audio'
import { save, persist } from './state'
import { stage, el, W, toStage } from './engine/stage'
import { ui, openOverlay, closeOverlay } from './engine/ui'
import { world, onRoomChange } from './engine/world'
import { api } from './game'
import { posePictogram, type Pose } from './avatar/render'
import { chatBar } from './features/chat'
import { isHomeRoom } from './data/homes'
import { mailButton, startMail } from './features/mail'
import { levelPlate, xpEvent } from './social/levels'
import { SELFIE_SPOTS } from './data/selfieSpots'

/** the Discord mark (same drawing as the front door's sign-in button) */
const DISCORD_PATH = 'M20.32 4.37A19.8 19.8 0 0 0 15.4 2.84a.07.07 0 0 0-.08.04c-.21.38-.45.87-.61 1.25a18.27 18.27 0 0 0-5.49 0 12.6 12.6 0 0 0-.62-1.25.08.08 0 0 0-.08-.04 19.74 19.74 0 0 0-4.88 1.53.07.07 0 0 0-.03.03C.53 9.05-.32 13.58.1 18.06a.08.08 0 0 0 .03.06 19.9 19.9 0 0 0 5.99 3.03.08.08 0 0 0 .08-.03c.46-.63.87-1.3 1.22-2a.08.08 0 0 0-.04-.1 13.1 13.1 0 0 1-1.87-.9.08.08 0 0 1 0-.13l.37-.29a.07.07 0 0 1 .08-.01c3.93 1.79 8.18 1.79 12.06 0a.07.07 0 0 1 .08 0l.37.3a.08.08 0 0 1 0 .13c-.6.35-1.22.65-1.87.9a.08.08 0 0 0-.04.1c.36.7.77 1.37 1.22 2a.08.08 0 0 0 .08.03 19.84 19.84 0 0 0 6-3.03.08.08 0 0 0 .03-.06c.5-5.18-.84-9.67-3.55-13.66a.06.06 0 0 0-.03-.03zM8.02 15.33c-1.18 0-2.16-1.09-2.16-2.42 0-1.33.96-2.42 2.16-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.96 2.42-2.16 2.42zm7.97 0c-1.18 0-2.15-1.09-2.15-2.42 0-1.33.95-2.42 2.15-2.42 1.21 0 2.18 1.1 2.16 2.42 0 1.33-.95 2.42-2.16 2.42z'

const icon = (name: string) => `<img src="/art/icons/${name}.png" alt="" draggable="false">`

const placePlate = el('div', 'place-plate')
const coinPlate = el('div', 'coin-plate')
/** top-right row: the "who's online" pill (added once multiplayer starts) sits to the left of the coins */
const hudRight = el('div', 'hud-right')
/** top-left: where you are, and the ? that replays Rosa's tour */
const hudLeft = el('div', 'hud-left')
const helpBtn = el('button', 'help-btn', '?')
helpBtn.title = 'How to play (?)'
helpBtn.setAttribute('aria-label', 'How to play')
const replayTour = () => void import('./features/tour').then((m) => m.startTour())
helpBtn.onclick = (e) => {
  e.stopPropagation()
  sfx.click()
  replayTour()
}

export function renderCoins() {
  coinPlate.innerHTML = `${icon('coin')}<span>${save.coins}</span>`
}
export function bumpCoins() {
  coinPlate.classList.remove('bump')
  void coinPlate.offsetWidth
  coinPlate.classList.add('bump')
}

const MOVES: { pose: Pose; label: string; key: string }[] = [
  { pose: 'dance', label: 'Dance', key: 'D' },
  { pose: 'wave', label: 'Wave', key: 'W' },
  { pose: 'cheer', label: 'Cheer', key: 'C' },
  { pose: 'jump', label: 'Jump', key: 'J' },
]

/** a small menu that pops up right above the toolbar button that opened it (kept on the stage) */
function popMenu(cls: string, items: { html: string; act: () => void }[], from: HTMLElement) {
  const m = el('div', 'pop-menu ' + cls)
  for (const it of items) {
    const b = el('button', '', it.html)
    b.onclick = () => {
      sfx.pop()
      closeOverlay()
      it.act()
    }
    m.append(b)
  }
  openOverlay(m, { cls: 'clear' })
  // centred on its button unless that would push it off the stage's edge; it grows out of the button
  const EDGE = 10
  const r = from.getBoundingClientRect()
  const [x] = toStage({ clientX: r.left + r.width / 2, clientY: r.top })
  const left = Math.round(Math.min(Math.max(x - m.offsetWidth / 2, EDGE), W - EDGE - m.offsetWidth))
  m.style.left = `${left}px`
  m.style.transformOrigin = `${Math.round(x - left)}px 100%`
}

export function buildHud() {
  // your level (a ring that fills with XP) sits next to your coins; clicking it opens its own little level view
  hudRight.append(levelPlate(), coinPlate)
  hudLeft.append(placePlate, helpBtn, mailButton())
  startMail()
  stage.hud.append(hudLeft, hudRight)
  renderCoins()
  const setPlace = () => (placePlate.innerHTML = `<b>${world.plate?.name ?? world.room.name}</b><span>${(world.plate?.area ?? world.room.area).split(' · ')[0]}</span>`)
  setPlace()
  onRoomChange((r) => {
    setPlace()
    homeBtn.classList.toggle('active', isHomeRoom(world.room.id))
    // a first visit somewhere is worth a little XP (online the server awards it when you arrive)
    xpEvent('visit', isHomeRoom(r.id) ? 'home' : r.id)
  })

  const takeSelfie = () => void import('./features/moments/selfie').then((m) => m.landmarkSelfie(api, world.room.id))
  const tb = (name: string, label: string, fn: (b: HTMLButtonElement) => void, key?: string) => {
    const b = el('button', 'tb-btn', icon(name))
    // one small label on hover, the same for every button: its name and its key
    b.append(el('span', 'tb-tip', `${label}${key ? `<kbd>${key}</kbd>` : ''}`))
    b.setAttribute('aria-label', label)
    b.onclick = (e) => {
      e.stopPropagation()
      sfx.click()
      if (ui.busy && !ui.modal) return
      fn(b)
    }
    stage.toolbar.append(b)
    return b
  }
  tb('dance', 'Moves', (b) =>
    popMenu('moves', [
      // each move shows a little you doing it (Club Penguin's action menu is all pictures)
      ...MOVES.map((m) => ({ html: `${posePictogram(save.look, m.pose)}<span>${m.label}<kbd>${m.key}</kbd></span>`, act: () => world.player.emote(m.pose, m.pose === 'dance' ? 0 : 3) })),
      { html: `${posePictogram(save.look, 'sit')}<span>Sit<kbd>S</kbd></span>`, act: () => sitHere() },
      // (no snowballs: there's no snow in the city right now)
    ], b),
  )
  stage.toolbar.append(chatBar())
  tb('map', 'Map', () => api.openMap(), 'M')
  tb('metrocard', 'Subway', () => api.openSubway(), 'U')
  tb('news', 'Club NYC Times', () => api.newspaper(), 'N')
  // the phone: NYCgram, selfies, friends, and help (photo booths live in places now)
  tb('phone', 'Phone: NYCgram & Friends', (b) =>
    popMenu('phone', [
      {
        html: `<img class="pm-nycgram" src="/art/icons/nycgram.png.webp" alt="" width="20" height="20" onerror="this.src='/art/icons/nycgram.png'"> NYCgram`,
        act: () => void import('./features/nycgram').then((m) => m.openNycgram()),
      },
      // a selfie with the landmark here (the Bull, the bridge, Lady Liberty…)
      ...(SELFIE_SPOTS[world.room.id] ? [{ html: `📸 Selfie: ${SELFIE_SPOTS[world.room.id].title}<kbd>K</kbd>`, act: takeSelfie }] : []),
      { html: '💌 Invite Friends<kbd>I</kbd>', act: () => void import('./features/invite').then((m) => m.openInvite()) },
      { html: '💬 Text a Friend<kbd>T</kbd>', act: () => void import('./features/textFriend').then((m) => m.openTextFriend()) },
      { html: '🗽 How to Play<kbd>?</kbd>', act: replayTour },
      { html: '📖 Help Center', act: () => void window.open('/help/', '_blank', 'noopener') },
      // the Club NYC Discord (/discord follows DISCORD_INVITE_URL on the server)
      { html: `<svg class="pm-discord" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${DISCORD_PATH}"/></svg> Join the Discord`, act: () => void window.open('/discord', '_blank', 'noopener') },
    ], b),
  )
  stage.toolbar.append(el('div', 'tb-gap'))
  tb('wave', 'Friends & Leaderboards', () => import('./social/community').then((m) => m.openCommunity()), 'F')
  tb('card', 'Player Card & Wardrobe', () => import('./features/playerCard').then((m) => m.openPlayerCard()), 'P')
  tb('stamps', 'Stamp Book', () => import('./features/stampbook').then((m) => m.openStampBook()))
  const homeBtn = tb('home', 'My Apartment', () => (isHomeRoom(world.room.id) ? api.furniture() : goHome()), 'H')
  const sound = tb(save.muted ? 'sound' : 'sound', 'Sound On/Off', () => {
    save.muted = !save.muted
    setMuted(save.muted)
    sound.classList.toggle('off', save.muted)
    persist()
  })
  sound.classList.toggle('off', save.muted)

  // clicking yourself opens your player card (like Club Penguin)
  world.player.wrap.addEventListener('click', (e) => {
    e.stopPropagation()
    // mid-tour Rosa is showing you around: clicking yourself points you at the ground instead of opening your card
    if (stage.root.querySelector('.tour')) return world.player.say('Click the ground to walk! 👇', 2400)
    import('./features/playerCard').then((m) => m.openPlayerCard())
  })

  window.addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return
    if (e.key === 'Escape' && ui.modal) {
      const x = stage.overlay.querySelector<HTMLButtonElement>('.x-btn')
      return x ? x.click() : closeOverlay()
    }
    if (ui.busy) return
    const k = e.key.toLowerCase()
    const move = MOVES.find((m) => m.key.toLowerCase() === k)
    if (move) world.player.emote(move.pose, move.pose === 'dance' ? 0 : 3)
    if (k === 's') sitHere()
    if (k === 'm') api.openMap()
    if (k === 'u') api.openSubway()
    if (k === 't') void import('./features/textFriend').then((m) => m.openTextFriend())
    if (k === 'n') api.newspaper()
    if (k === 'p') import('./features/playerCard').then((m) => m.openPlayerCard())
    if (k === 'f') import('./social/community').then((m) => m.openCommunity())
    if (k === 'h') goHome()
    if (k === 'i') void import('./features/invite').then((m) => m.openInvite())
    if (k === 'k' && SELFIE_SPOTS[world.room.id]) takeSelfie()
    if (e.key === '?') replayTour()
  })
}

const goHome = () => void import('./features/apartment').then((m) => m.goHome())

function sitHere() {
  // sit on the nearest free seat if one is close, otherwise plop down on the floor
  const p = world.player
  const near = world.seats
    .filter((s) => ![world.player, ...world.npcs].some((a) => a.seat?.id === s.id))
    .sort((a, b) => Math.hypot(a.sit[0] - p.pos[0], a.sit[1] - p.pos[1]) - Math.hypot(b.sit[0] - p.pos[0], b.sit[1] - p.pos[1]))[0]
  if (near && Math.hypot(near.sit[0] - p.pos[0], near.sit[1] - p.pos[1]) < 160) {
    import('./engine/world').then((m) => m.sitPlayer(near))
  } else p.emote('sit' as Pose, 6)
}
