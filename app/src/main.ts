import './style.css'
import { installErrorReporting } from './net/errors'
import { captureInvite } from './net/invite'
import { isPhone, desktopOnly } from './features/desktopOnly'
import { startIconizer } from './engine/iconize'

installErrorReporting()
// every emoji on the page is drawn as one of our illustrated icons
startIconizer()
// /join/<name> — remember who invited you before anything else happens
captureInvite()

const root = document.querySelector<HTMLDivElement>('#app')!
const q = new URLSearchParams(location.search)
const start = () => void import('./game').then((m) => m.startGame(root))
// Each entry point is imported lazily so editing the world doesn't reload a mini-game being tested (and vice versa).
if (q.get('dev') === 'avatar') import('./dev/avatarLab').then((m) => m.avatarLab(root))
else if (q.get('game')) import('./dev/gameLab').then((m) => m.gameLab(root, q.get('game')!))
else if (isPhone() && !q.has('desktop')) desktopOnly(root, start)
else start()
