import './photobooth.css'
import { sfx } from '../audio'
import { save, bump } from '../state'
import { el } from '../engine/stage'
import { openOverlay, closeOverlay, closeButton, toast, confetti } from '../engine/ui'
import { world } from '../engine/world'
import { avatarMarkup } from '../avatar/render'
import type { Look } from '../avatar/look'
import { api } from '../game'
import { link } from '../net/link'
import { mp } from '../net/multiplayer'
import { iconUrl, iconDataUrl, hasIcon } from '../engine/iconize'

/** Stickers on the strip are our illustrated icons. The saved PNG is drawn from an SVG, which can't fetch
 * images, so each sticker is embedded as a data: URL once it's loaded (until then the preview uses its URL). */
const stickerSrc: Record<string, string> = {}
const preloadStickers = (list: string[]) =>
  Promise.all(list.filter(hasIcon).map(async (s) => void (stickerSrc[s] = (await iconDataUrl(s)) || stickerSrc[s] || iconUrl(s))))
const sticker = (s: string, x: number, baseline: number, size: number) =>
  hasIcon(s) ? `<image href="${stickerSrc[s] ?? iconUrl(s)}" x="${x}" y="${baseline - size * 0.85}" width="${size}" height="${size}"/>` : `<text x="${x}" y="${baseline}" font-size="${size}">${s}</text>`

/**
 * The photo booth: four poses, one strip, everyone standing nearby squeezes into the shot (real players too).
 * The strip downloads as a PNG — made for sharing.
 */
interface Theme {
  bg: string
  frame: string
  ink: string
  title: string
  sticker: string[]
}
const THEMES: Record<string, Theme> = {
  'Ralph’s Coffee': { bg: '#1f4a35', frame: '#f4efe3', ink: '#12301f', title: 'RALPH’S COFFEE · SOHO', sticker: ['☕', '🥐', '💚', '🥯'] },
  'I ♥ NY': { bg: '#e1262b', frame: '#ffffff', ink: '#1d2140', title: 'I ♥ NY · TIMES SQUARE', sticker: ['❤️', '🗽', '🚕', '🍕'] },
  // the booth up on Sky Deck 102 at One World Trade, and the Halloween Parade's spooky one
  'Sky Deck': { bg: '#1d3b6e', frame: '#fff4d6', ink: '#1d2140', title: 'SKY DECK 102 · ONE WORLD TRADE', sticker: ['🏙️', '✨', '🗽', '🌉'] },
  Halloween: { bg: '#2b1a3d', frame: '#ffb347', ink: '#1d2140', title: 'HALLOWEEN PARADE · 6TH AVE', sticker: ['🎃', '👻', '🦇', '🍬'] },
  default: { bg: '#2a3b8f', frame: '#fffdf6', ink: '#1d2140', title: 'CLUB NYC', sticker: ['🗽', '🍕', '🚕', '✨'] },
}
const POSES = [
  { mood: 'smile' as const, tilt: 0, squeeze: 1, label: 'Smile!' },
  { mood: 'o' as const, tilt: -7, squeeze: 1, label: 'Silly!' },
  { mood: 'grin' as const, tilt: 4, squeeze: 1.18, label: 'Squeeze in!' },
  { mood: 'grin' as const, tilt: 0, squeeze: 1.05, label: 'Big finish!' },
]

/**
 * Everyone close enough to fit in the booth with you — your friends and the city's locals. Strangers stay out:
 * a strip is made for posting, and nobody should end up in someone else's photo (with their name on it) unasked.
 */
function crowd(): { name: string; look: Look }[] {
  const me = world.player
  const near = world.npcs
    .filter((a) => !a.leaving && (!a.remote || mp.friends.has(a.remote.id)) && Math.hypot(a.pos[0] - me.pos[0], (a.pos[1] - me.pos[1]) * 1.6) < 210)
    .sort((a, b) => Math.hypot(a.pos[0] - me.pos[0], a.pos[1] - me.pos[1]) - Math.hypot(b.pos[0] - me.pos[0], b.pos[1] - me.pos[1]))
    .slice(0, 3)
  return [{ name: save.name || 'You', look: save.look }, ...near.map((a) => ({ name: a.name, look: a.look }))]
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
/** online, the strip's footer is your invite link — every shared photo is an invitation */
const footer = () => (link.account && save.name ? `${location.host}/join/${save.name}` : 'CLUB NYC')

/** One frame of the strip as SVG (480 × 330). */
function frameSvg(people: { look: Look }[], pose: (typeof POSES)[number], t: Theme, i: number) {
  const n = people.length
  // head-and-shoulders: heads near the top, the frame crops everyone around the waist
  const scale = (n <= 1 ? 2.9 : n === 2 ? 2.45 : n === 3 ? 2.15 : 1.9) * pose.squeeze
  const spacing = Math.min(200, 430 / n) / pose.squeeze
  const x0 = 240 - (spacing * (n - 1)) / 2
  const feet = 62 + 160 * scale
  const figs = people
    .map((p, k) => {
      const tilt = pose.tilt * (k % 2 ? -1 : 1)
      const bob = pose.squeeze > 1.1 ? (k % 2) * 10 : 0
      return `<g transform="translate(${x0 + spacing * k} ${feet + bob}) rotate(${tilt}) scale(${scale})">${avatarMarkup(p.look, { mood: pose.mood, d: k < n / 2 ? 1 : -1 })}</g>`
    })
    .join('')
  const stickers = i === 3 ? t.sticker.map((s, k) => sticker(s, 40 + k * 130, 70 + (k % 2) * 30, 50)).join('') : i === 1 ? sticker('🤪', 396, 84, 62) : ''
  const confettiDots = i === 3 ? Array.from({ length: 26 }, (_, k) => `<rect x="${(k * 97) % 470}" y="${(k * 53) % 300}" width="8" height="14" rx="2" fill="${['#ff5a5f', '#ffd23f', '#3fd0ff', '#8cff6a'][k % 4]}" transform="rotate(${(k * 37) % 90} ${(k * 97) % 470} ${(k * 53) % 300})"/>`).join('') : ''
  return `<svg x="0" y="0" width="480" height="330" viewBox="0 0 480 330">
    <rect width="480" height="330" fill="${i % 2 ? '#ffe9a8' : '#cfe8ff'}"/>
    <path d="M0 0 H480 V40 Q440 70 400 40 Q360 70 320 40 Q280 70 240 40 Q200 70 160 40 Q120 70 80 40 Q40 70 0 40Z" fill="${t.bg}" opacity="0.85"/>
    ${confettiDots}${figs}${stickers}</svg>`
}

function stripSvg(people: { name: string; look: Look }[], where: string) {
  const t = THEMES[where] ?? THEMES.default
  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()
  const frames = POSES.map((p, i) => `<g transform="translate(30 ${30 + i * 360})"><rect x="-6" y="-6" width="492" height="342" rx="10" fill="${t.frame}"/>${frameSvg(people, p, t, i)}</g>`).join('')
  const names = people.map((p) => p.name).join(' · ')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="1600" viewBox="0 0 540 1600">
    <rect width="540" height="1600" rx="18" fill="${t.bg}"/>
    ${frames}
    <text x="270" y="1490" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="34" fill="${t.frame}">${esc(t.title)}</text>
    <text x="270" y="1530" text-anchor="middle" font-family="Arial, sans-serif" font-weight="700" font-size="20" fill="${t.frame}" opacity="0.9">${esc(names.length > 46 ? names.slice(0, 44) + '…' : names)}</text>
    <text x="270" y="1566" text-anchor="middle" font-family="Arial, sans-serif" font-size="17" fill="${t.frame}" opacity="0.75">${date} · ${esc(footer())}</text>
  </svg>`
}

function toPng(svg: string): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = 1080
      c.height = 3200
      c.getContext('2d')!.drawImage(img, 0, 0, 1080, 3200)
      resolve(c)
    }
    img.onerror = reject
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
  })
}

export function openPhotoBooth(where = 'default') {
  const people = crowd()
  const t = THEMES[where] ?? THEMES.default
  const stickersReady = preloadStickers([...t.sticker, '🤪'])
  const box = el('div', 'photobooth')
  box.style.setProperty('--pb', t.bg)
  box.innerHTML = `<div class="pb-curtain"></div><div class="pb-body">
      <h2>📸 Photo Booth</h2>
      <p class="pb-who">${people.length > 1 ? `Squeezing in: <b>${people.map((p) => esc(p.name)).join(', ')}</b>` : 'Just you? Grab a friend: anyone standing next to you squeezes into the shot.'}</p>
      <div class="pb-stage"><div class="pb-flash"></div><div class="pb-count"></div><div class="pb-preview"></div></div>
      <div class="pb-actions"></div></div>`
  const preview = box.querySelector<HTMLElement>('.pb-preview')!
  const count = box.querySelector<HTMLElement>('.pb-count')!
  const flash = box.querySelector<HTMLElement>('.pb-flash')!
  const actions = box.querySelector<HTMLElement>('.pb-actions')!
  preview.innerHTML = frameSvg(people, POSES[0], t, 0)
  const go = el('button', 'btn go', 'Take 4 Photos')
  actions.append(go)
  box.append(closeButton())
  openOverlay(box, { backdrop: false })
  world.player.emote('cheer', 2)

  go.onclick = async () => {
    go.disabled = true
    for (let i = 0; i < 4; i++) {
      preview.innerHTML = frameSvg(people, POSES[i], t, i)
      for (const n of [3, 2, 1]) {
        count.textContent = `${POSES[i].label} ${n}`
        sfx.tick()
        await new Promise((r) => setTimeout(r, 520))
        if (!box.isConnected) return
      }
      count.textContent = ''
      flash.classList.remove('go')
      void flash.offsetWidth
      flash.classList.add('go')
      sfx.clapper()
    }
    await showStrip()
  }

  const showStrip = async () => {
    await stickersReady
    const svg = stripSvg(people, where)
    box.querySelector('.pb-body')!.innerHTML = `<h2>Your Strip!</h2><div class="pb-strip">${svg.replace('<svg ', '<svg class="pb-strip-svg" ')}</div><div class="pb-actions"></div>`
    const bar = box.querySelector<HTMLElement>('.pb-actions')!
    const dl = el('button', 'btn go', '⬇️ Save Photo')
    dl.onclick = async () => {
      const c = await toPng(svg)
      const a = document.createElement('a')
      a.href = c.toDataURL('image/png')
      a.download = `club-nyc-photobooth-${Date.now()}.png`
      a.click()
      toast('Saved! Post it and tag your friends 📸', '📸')
    }
    bar.append(dl)
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
    if (nav.share && nav.canShare) {
      const share = el('button', 'btn ghost', '↗️ Share')
      share.onclick = async () => {
        const c = await toPng(svg)
        const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'))
        if (!blob) return
        const file = new File([blob], 'club-nyc.png', { type: 'image/png' })
        if (nav.canShare!({ files: [file] })) await nav.share({ files: [file], title: 'Club NYC', text: 'Hanging out in Club NYC 🗽' }).catch(() => {})
      }
      bar.append(share)
    }
    const done = el('button', 'btn ghost', 'Done')
    done.onclick = () => closeOverlay()
    bar.append(done)
    confetti(40)
    sfx.stamp()
    bump('photos')
    api.stamp('photo-booth')
  }
}
