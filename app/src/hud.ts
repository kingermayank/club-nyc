import { sfx, setMuted } from './audio'
import { save, persist } from './state'
import { stage, el, W, toStage } from './engine/stage'
import { ui, openOverlay, closeOverlay } from './engine/ui'
import { world, onRoomChange } from './engine/world'
import { api } from './game'
import { posePictogram, type Pose } from './avatar/render'
import { chatBar, emoteBubble } from './features/chat'
import { isHomeRoom } from './data/homes'
import { mailButton, startMail } from './features/mail'

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

const EMOTES = ['😀', '😂', '😍', '😎', '😮', '😢', '😡', '🍕', '🗽', '❤️', '🚕', '☕', '🎉', '👍', '💡', '👋']
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
  hudRight.append(coinPlate)
  hudLeft.append(placePlate, helpBtn, mailButton())
  startMail()
  stage.hud.append(hudLeft, hudRight)
  renderCoins()
  const setPlace = () => (placePlate.innerHTML = `<b>${world.plate?.name ?? world.room.name}</b><span>${world.plate?.area ?? world.room.area}</span>`)
  setPlace()
  onRoomChange(() => {
    setPlace()
    homeBtn.classList.toggle('active', isHomeRoom(world.room.id))
  })

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
  tb('emote', 'Emotes', (b) => popMenu('emotes', EMOTES.map((e) => ({ html: e, act: () => emoteBubble(e) })), b))
  tb('dance', 'Moves', (b) =>
    popMenu('moves', [
      // each move shows a little you doing it (Club Penguin's action menu is all pictures)
      ...MOVES.map((m) => ({ html: `${posePictogram(save.look, m.pose)}<span>${m.label}<kbd>${m.key}</kbd></span>`, act: () => world.player.emote(m.pose, m.pose === 'dance' ? 0 : 3) })),
      { html: `${posePictogram(save.look, 'sit')}<span>Sit<kbd>S</kbd></span>`, act: () => sitHere() },
      { html: `${posePictogram({ ...save.look, items: { ...save.look.items, hand: undefined } }, 'wave', 0.12)}<span>Snowball<kbd>T</kbd></span>`, act: () => void import('./features/snowball').then((m) => m.armSnowball()) },
    ], b),
  )
  stage.toolbar.append(chatBar())
  tb('map', 'Map', () => api.openMap(), 'M')
  tb('metrocard', 'Subway', () => api.openSubway(), 'U')
  tb('news', 'Club NYC Times', () => api.newspaper(), 'N')
  tb('phone', 'Phone: camera & invite friends', (b) =>
    popMenu('phone', [
      { html: '📸 Group photo<kbd>B</kbd>', act: () => openCamera() },
      { html: '💌 Invite friends<kbd>I</kbd>', act: () => void import('./features/invite').then((m) => m.openInvite()) },
      { html: '🗽 How to play<kbd>?</kbd>', act: replayTour },
    ], b),
  )
  stage.toolbar.append(el('div', 'tb-gap'))
  tb('wave', 'Friends & leaderboards', () => import('./social/community').then((m) => m.openCommunity()), 'F')
  tb('card', 'Player card & wardrobe', () => import('./features/playerCard').then((m) => m.openPlayerCard()), 'P')
  tb('stamps', 'Stamp book', () => import('./features/stampbook').then((m) => m.openStampBook()))
  const homeBtn = tb('home', 'My apartment', () => (isHomeRoom(world.room.id) ? api.furniture() : goHome()), 'H')
  const sound = tb(save.muted ? 'sound' : 'sound', 'Sound on/off', () => {
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
    if (k === 't') void import('./features/snowball').then((m) => m.armSnowball())
    if (k === 'n') api.newspaper()
    if (k === 'p') import('./features/playerCard').then((m) => m.openPlayerCard())
    if (k === 'f') import('./social/community').then((m) => m.openCommunity())
    if (k === 'h') goHome()
    if (k === 'b') openCamera()
    if (k === 'i') void import('./features/invite').then((m) => m.openInvite())
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

/** The phone camera opens the photo booth, themed for where you are; everyone nearby squeezes in. */
function openCamera() {
  const where = ['times-square', 'iloveny'].includes(world.room.id) ? 'I ♥ NY' : 'default'
  void import('./features/photobooth').then((m) => m.openPhotoBooth(where))
}
