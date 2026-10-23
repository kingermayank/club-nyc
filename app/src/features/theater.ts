import { onRoom, world, sitPlayer } from '../engine/world'
import { el, stage } from '../engine/stage'
import { hold, toast, openOverlay, closeOverlay } from '../engine/ui'
import { sfx } from '../audio'
import { theater as foley } from '../foley'
import { api } from '../game'
import { save } from '../state'
import { nycDay } from '../data/economy'
import { SHOWS, SHOW, type ShowDef, type ShowId } from './broadway/shows'
import type { ShowVideo } from './broadway/stage'

/**
 * The Broadway Theater. Buy a ticket (5 coins) and tonight's show plays: the curtain opens on a painted set and
 * a cast of New Yorkers performs the number live, with spotlights, an original song, surtitles, a bow and applause.
 * Three shows rotate by the New York date (the same show for everyone that night).
 *
 * A real video can stand in for the cast: put it in app/public/video/broadway/<show id>.mp4 (phantom, pizza-king,
 * bagels), optionally with a poster <show id>.jpg next to it, and that show plays the video on a screen in the
 * theater instead. Nothing else to change; without the file the cast performs.
 */
export const SHOW_IDS: ShowId[] = SHOWS.map((s) => s.id)

const dayNo = (day: string) => Math.round(Date.parse(`${day}T12:00:00Z`) / 86400_000)
/** tonight's show, by New York date */
export const tonight = (day = nycDay()): ShowDef => SHOWS[dayNo(day) % SHOWS.length]
const tomorrowNight = () => SHOWS[(dayNo(nycDay()) + 1) % SHOWS.length]

// ---------- a provided video for a show ----------
const found = new Map<ShowId, Promise<ShowVideo | null>>()
/** is there a file at `url` of this kind? (the dev server answers unknown paths with the game page, so check the type) */
async function exists(url: string, kind: 'video' | 'image'): Promise<boolean> {
  try {
    const r = await fetch(url, { method: 'HEAD', cache: 'no-store' })
    return r.ok && (r.headers.get('content-type') ?? '').startsWith(`${kind}/`)
  } catch {
    return false
  }
}
export function findVideo(id: ShowId): Promise<ShowVideo | null> {
  let p = found.get(id)
  if (!p) {
    p = (async () => {
      for (const ext of ['mp4', 'webm']) {
        const src = `/video/broadway/${id}.${ext}`
        if (await exists(src, 'video')) return { src, poster: (await exists(`/video/broadway/${id}.jpg`, 'image')) ? `/video/broadway/${id}.jpg` : undefined }
      }
      return null
    })()
    found.set(id, p)
  }
  return p
}

// ---------- the theater ----------
// the room's own painted curtain stays shut until you're in your seat; the house lights go down, and the show opens
// in the orchestra view (broadway/stage.ts)
onRoom('broadway', () => {
  // warm the cache: if tonight's show has a video, the ticket desk already knows
  void findVideo(tonight().id)
})

let running = false

export async function watchShow() {
  if (world.room.id !== 'broadway' || running) return
  const show = tonight()
  const video = findVideo(show.id)
  const v = await api.choose(
    `🎭 Tonight: ${show.title}`,
    `“${show.tagline}” Orchestra seats are 5 coins. The show runs about a minute, and you can skip to the bow any time.`,
    [
      { label: 'Buy a Ticket (5)', value: 'buy' },
      { label: 'Maybe Later', value: 'no' },
    ],
    `<img class="show-thumb" src="${show.poster}" alt="">`,
  )
  if (v !== 'buy' || world.room.id !== 'broadway' || !api.spend(5, 'theater-ticket')) return
  running = true
  sfx.register()
  setTimeout(() => foley.ticket(), 380)
  // grab a seat if there's one free
  const free = world.seats.filter((s) => ![world.player, ...world.npcs].some((a) => a.seat?.id === s.id))
  if (!world.player.seat && free.length) {
    const p = world.player.pos
    free.sort((a, b) => Math.hypot(a.sit[0] - p[0], a.sit[1] - p[1]) - Math.hypot(b.sit[0] - p[0], b.sit[1] - p[1]))
    sitPlayer(free[0])
  }
  // find your seat, the house lights go down, then we're in the orchestra
  const release = hold()
  await new Promise((r) => setTimeout(r, 900))
  stage.root.classList.add('house-dark')
  await new Promise((r) => setTimeout(r, 1100))
  release()
  await play(show, await video)
}

/** one performance in the full-stage view; Watch Again starts another */
async function play(show: ShowDef, video: ShowVideo | null) {
  const release = hold()
  // the show itself (cast, lights, the pit orchestra) loads with the first ticket
  const { ShowNight } = await import('./broadway/stage')
  let finished = false
  let again = false
  const night = new ShowNight(
    show,
    {
      onFinish: () => {
        finished = true
        api.stamp('curtain-call')
        let reward = ''
        if (!save.owned.includes('playbill')) {
          api.give('playbill')
          reward = `<p class="bw-reward">🎁 <span>You got a Playbill! Hold it from your player card.</span></p>`
        }
        const watchAgain = el('button', 'btn', 'Watch Again (5)')
        watchAgain.onclick = () => {
          if (!api.spend(5, 'theater-ticket')) return
          sfx.register()
          setTimeout(() => foley.ticket(), 380)
          again = true
          closeOverlay()
        }
        const back = el('button', 'btn go', 'Back to the Theater')
        back.onclick = () => {
          sfx.click()
          closeOverlay()
        }
        const next = tomorrowNight()
        night.showCard(
          `<h2>Bravo!</h2><p>What a show. The cast of “${show.title}” thanks you for coming.</p>${reward}<p class="bw-next">${next.id === show.id ? 'Tomorrow night: the same show, by popular demand' : `Tomorrow night: <b>${next.title}</b>`}</p>`,
          [watchAgain, back],
        )
      },
      onLeave: () => closeOverlay(),
    },
    video,
  )
  const keys = (e: KeyboardEvent) => {
    if (!night.root.isConnected) return
    if (e.key === 's' || e.key === 'S') {
      e.preventDefault()
      e.stopPropagation()
      night.skip()
    }
  }
  window.addEventListener('keydown', keys, true)
  openOverlay(night.root, {
    cls: 'bw-overlay',
    backdrop: false,
    onClose: () => {
      night.dispose()
      window.removeEventListener('keydown', keys, true)
      release()
      if (again) return void setTimeout(() => void play(show, video), 60)
      afterShow(finished)
    },
  })
  night.start()
}

/** back in the room: the lights come up and the audience is on its feet */
function afterShow(finished: boolean) {
  running = false
  stage.root.classList.remove('house-dark')
  if (!finished) return
  world.npcs.forEach((a) => !a.remote && a.emote('cheer', 3))
  world.player.emote('cheer', 3)
  setTimeout(() => toast('Bravo! 👏 What a show.', '🎭'), 400)
}

// dev builds: play any show (or a test video) without waiting for its night: clubNycShow.play('bagels')
if (import.meta.env.DEV)
  (window as unknown as { clubNycShow: unknown }).clubNycShow = {
    play: (id: ShowId, video?: ShowVideo) => {
      running = true
      void play(SHOW[id] ?? tonight(), video ?? null)
    },
    tonight: () => tonight().id,
    findVideo,
  }

/** dev sound board: the first few seconds of a show's song */
export async function previewSong(id: ShowId, seconds = 8) {
  const { songPlayer, songSeconds } = await import('./broadway/music')
  const p = songPlayer(SHOW[id].song)
  const t0 = performance.now()
  const len = Math.min(seconds, songSeconds(SHOW[id].song))
  const iv = window.setInterval(() => {
    const t = (performance.now() - t0) / 1000
    if (t > len) {
      window.clearInterval(iv)
      p.stop(0.5)
      return
    }
    p.tick(t)
  }, 40)
}
