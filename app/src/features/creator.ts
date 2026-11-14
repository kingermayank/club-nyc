import { sfx } from '../audio'
import { save, persist } from '../state'
import { AvatarView, avatarMarkup } from '../avatar/render'
import { el, stage } from '../engine/stage'
import { lookEditor } from './playerCard'
import { HAIR_STYLES, SIG_COLORS, SKIN_ORDER, EYE_COLORS, type Look } from '../avatar/look'
import { pickLook, type Match } from '../avatar/match/pick'
import { iconHtml } from '../engine/iconize'
import { TEAMS, type TeamId } from '../social/teams'
import { track } from '../net/events'
import { consentFields } from './consent'
import { GOOGLE_G, X_LOGO } from './signin'

/**
 * First-run onboarding, about 40 seconds (docs/avatar-redesign.md):
 *  1. "Who's walking into Manhattan?": three doors. Use a Photo (a selfie or an upload is read on this computer and
 *     turned into a New Yorker: avatar/match), Surprise Me (a random one), Build My Own.
 *  2. "Is this you?" / "Make it yours": the look pickers (Basics, Face, Extras) and your signature colour.
 *  3. "What do New Yorkers call you?": type a name (or, as a guest, sign in with Google / X), tick "13 or older + I agree", then the city.
 * The neighborhood team, the MetroCard and the wardrobe come later, in the world.
 */
const STEPS = ['start', 'look', 'name'] as const
type Step = (typeof STEPS)[number] | 'photo'

/** what the photo reader says when it can't use a picture */
const PHOTO_PROBLEM: Record<string, string> = {
  'no-face': 'We couldn’t find a face in that one. Try a brighter photo, facing the camera.',
  'too-small': 'The face is too small to read. Move closer, or pick a closer photo.',
  turned: 'Look straight at the camera, then try again.',
  load: 'The photo reader didn’t load. Check your connection and try again, or build your own.',
}

/** names are what everyone sees online: letters, numbers and underscores */
const cleanName = (v: string) => v.replace(/[^A-Za-z0-9_]/g, '').slice(0, 14)

/**
 * Signing in with Google / X from the name screen leaves the page. The look and the name typed so far wait here
 * (this tab only, for half an hour) and the creator opens on the name screen with them when you come back.
 */
const DRAFT = 'club-nyc:creator-draft'
type Draft = { look: Look; name: string; at: number }
function takeDraft(): Draft | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT) ?? 'null') as Draft | null
    sessionStorage.removeItem(DRAFT)
    return d?.look && Date.now() - d.at < 30 * 60_000 ? d : null
  } catch {
    return null
  }
}
const SSO_LABEL = { google: 'Google', x: 'X' } as const
export type SsoProvider = keyof typeof SSO_LABEL

/** eight complete, coordinated starting looks across skin tones and hair textures (every item is a free starter).
 * No hats or shades: the creator has no way to take them off, and they'd hide the face you're making. */
const PRESETS: Look[] = [
  { skin: 3, hair: 'afro', hairColor: 0, color: 0, items: { body: 'sig-hoodie', legs: 'jeans', feet: 'sneakers' } },
  { skin: 0, hair: 'bob', hairColor: 4, color: 6, items: { body: 'sig-hoodie', legs: 'plaid-skirt', feet: 'boots' } },
  { skin: 5, hair: 'locs', hairColor: 0, color: 1, items: { body: 'sig-hoodie', legs: 'sweats', feet: 'runners' } },
  { skin: 1, hair: 'ponytail', hairColor: 3, color: 4, items: { body: 'sig-hoodie', legs: 'jeans', feet: 'sneakers' } },
  { skin: 6, hair: 'fade', hairColor: 0, color: 7, items: { body: 'sig-hoodie', legs: 'shorts', feet: 'runners' } },
  { skin: 2, hair: 'curly', hairColor: 1, color: 3, items: { body: 'sig-hoodie', legs: 'jeans', feet: 'boots' } },
  { skin: 7, hair: 'puffs', hairColor: 0, color: 2, items: { body: 'sig-hoodie', legs: 'plaid-skirt', feet: 'sneakers' } },
  { skin: 4, hair: 'short', hairColor: 0, color: 12, items: { body: 'sig-hoodie', legs: 'sweats', feet: 'sneakers' } },
]

export interface CreatorOpts {
  /** online: check names as you type */
  checkName?: (name: string) => Promise<{ ok: boolean; reason: string | null }>
  /** online: claim the profile on the server (with the "13 or older + I agree" tick); resolves an error message or null */
  claim?: (name: string, look: Look, team: string) => Promise<string | null>
  /** online: your member number, once the profile is claimed */
  memberNo?: () => number
  /** a name already on this account (saved on the waitlist and claimed from the launch email): the name screen opens with it */
  presetName?: string
  /** online as a guest with no sign-in yet: which of Google / X are set up (the name screen offers them) */
  sso?: () => Promise<SsoProvider[]>
  /** already signed in with one (e.g. just back from Google): its name, said on the name screen */
  signedInWith?: string
}

export function openCreator(done: () => void, opts: CreatorOpts = {}) {
  const openedAt = performance.now()
  track('creator_open')
  // back from signing in with Google / X: the look and name from before the trip
  const draft = opts.claim ? takeDraft() : null
  // Build My Own starts from a plain New Yorker (a random one read as "this is you" before you'd chosen anything)
  let look: Look = draft ? draft.look : { skin: 2, hair: 'short', hairColor: 1, color: Math.floor(Math.random() * SIG_COLORS.length), nose: 1, items: { body: 'sig-hoodie', legs: 'jeans', feet: 'sneakers' } }
  let name = draft?.name || opts.presetName || ''
  let nameErr = ''
  // the "13 or older + I agree" tick (kept if the name screen redraws, e.g. after a taken name)
  let agreed = false
  let avail: { name: string; ok: boolean; reason: string | null } | null = null
  // which door you came through, and (after a photo) the reader's closest guesses
  let door: 'photo' | 'surprise' | 'build' = 'build'
  let near: Match['near'] | undefined
  let dark = false
  let cam: MediaStream | null = null
  const stopCam = () => {
    cam?.getTracks().forEach((t) => t.stop())
    cam = null
  }
  /** a curated random New Yorker: a preset's outfit with fresh skin, hair, face and colours, never a clash */
  const surprise = (): Look => {
    const r = (n: number) => Math.floor(Math.random() * n)
    const base = PRESETS[r(PRESETS.length)]
    const beard = Math.random() < 0.22 ? 1 + r(4) : 0
    return { ...structuredClone(base), skin: SKIN_ORDER[r(SKIN_ORDER.length)], hair: HAIR_STYLES[r(HAIR_STYLES.length)], hairColor: Math.random() < 0.85 ? r(6) : r(10), color: r(SIG_COLORS.length), shape: r(4), eyes: Math.random() < 0.6 ? r(2) : r(EYE_COLORS.length), brows: r(4), nose: r(3), beard, specs: Math.random() < 0.25 ? 1 + r(2) : 0, freckles: Math.random() < 0.15 ? 1 : 0, lashes: beard ? 0 : r(2) }
  }

  const screen = el('div', 'creator')
  screen.innerHTML = `<div class="creator-bg"></div>
    <img class="creator-logo" src="/art/ui/logo.png" alt="Club NYC">
    <div class="creator-card"><div class="creator-left"><div class="creator-stage"></div><div class="creator-plinth"></div><div class="creator-dots"></div></div><div class="creator-right"></div></div>`
  stage.root.append(screen)
  const right = screen.querySelector<HTMLElement>('.creator-right')!
  const stageEl = screen.querySelector<HTMLElement>('.creator-stage')!
  const dots = screen.querySelector<HTMLElement>('.creator-dots')!

  // a big, live you that reacts to every change
  const view = new AvatarView(look, 1.75)
  view.el.classList.add('creator-avatar')
  stageEl.append(view.el)
  view.setPose('wave')
  const sparkle = el('div', 'cr-sparkle')
  stageEl.append(sparkle)
  let raf = 0
  let last = performance.now()
  const loop = (t: number) => {
    view.update(Math.min(0.05, (t - last) / 1000))
    last = t
    raf = requestAnimationFrame(loop)
  }
  raf = requestAnimationFrame(loop)
  let poseTimer = 0
  const setLook = (l: Look, pose: 'cheer' | 'dance' | 'wave' | 'jump' = 'jump') => {
    look = l
    view.setLook(l)
    view.setPose(pose)
    view.setMood('grin')
    sparkle.classList.remove('go')
    void sparkle.offsetWidth
    sparkle.classList.add('go')
    clearTimeout(poseTimer)
    poseTimer = window.setTimeout(() => {
      view.setPose('idle')
      view.setMood('smile')
    }, 1100)
  }

  // Club Penguin's colour ring: your signature colours orbit the avatar; click one and you wear it
  const ring = el('div', 'cr-ring')
  screen.querySelector('.creator-left')!.append(ring)
  const ringName = el('div', 'cr-ring-name')
  screen.querySelector('.creator-left')!.append(ringName)
  const drawRing = () => {
    ring.innerHTML = ''
    const n = SIG_COLORS.length
    SIG_COLORS.forEach((c, i) => {
      // an arc over the top and down the sides, leaving the plinth clear
      const a = ((165 + (i * 210) / (n - 1)) * Math.PI) / 180
      const b = el('button', 'cr-dot' + ((look.color ?? 5) === i ? ' on' : ''))
      b.style.cssText = `left:calc(50% + ${Math.cos(a) * 122}px);top:calc(44% + ${Math.sin(a) * 132}px);background:${c.hex}`
      b.setAttribute('aria-label', c.name)
      b.onpointerenter = () => (ringName.textContent = c.name)
      b.onpointerleave = () => (ringName.textContent = SIG_COLORS[look.color ?? 5].name)
      b.onclick = () => {
        sfx.pop()
        track('look_colour', { once: true })
        setLook({ ...look, color: i }, 'cheer')
        ring.querySelectorAll('.cr-dot').forEach((x) => x.classList.toggle('on', x === b))
        ringName.textContent = c.name
      }
      ring.append(b)
    })
    ringName.textContent = SIG_COLORS[look.color ?? 5].name
  }
  // a new look from a preset or the dice: the ring just moves its highlight (redrawing it would replay the pop-in)
  const markRing = () => {
    ring.querySelectorAll('.cr-dot').forEach((x, i) => x.classList.toggle('on', i === (look.color ?? 5)))
    ringName.textContent = SIG_COLORS[look.color ?? 5].name
  }

  let at: Step | null = null
  const go = (s: Step) => {
    stopCam()
    screen.classList.toggle('naming', s === 'name')
    // nobody's been made yet on the first screens: a silhouette waits on the plinth
    screen.classList.toggle('blank', s === 'start' || s === 'photo')
    // the colour ring belongs to the look screen
    if (s !== 'look') ring.innerHTML = ringName.textContent = ''
    const dot = s === 'photo' ? 'start' : s
    dots.innerHTML = STEPS.map((x) => `<i class="${x === dot ? 'on' : STEPS.indexOf(x) < STEPS.indexOf(dot) ? 'done' : ''}"></i>`).join('')
    right.innerHTML = ''
    // the slide-in is for moving between the two screens, not for redrawing the one you're on
    if (s !== at) {
      right.classList.remove('swap')
      void right.offsetWidth
      right.classList.add('swap')
    }
    at = s
    // content scrolls if needed; the action buttons always stay visible at the bottom
    const scroll = el('div', 'creator-scroll')
    right.append(scroll)
    const put = (...nodes: HTMLElement[]) => nodes.forEach((n) => (n.classList.contains('creator-actions') ? right : scroll).append(n))
    const actions = (...btns: HTMLElement[]) => {
      const bar = el('div', 'creator-actions')
      bar.append(...btns)
      return bar
    }

    if (s === 'start') {
      put(el('h2', '', 'Who’s Walking into Manhattan?'), el('p', 'cr-sub', 'Pick how to start. You can change everything after.'))
      const doors = el('div', 'cr-doors')
      const add = (id: typeof door, pic: string, title: string, sub: string, open: () => void) => {
        const b = el('button', `cr-door ${id}`, `<span class="cr-door-pic">${pic}</span><b>${title}</b><small>${sub}</small>`)
        b.onclick = () => {
          sfx.pop()
          door = id
          near = undefined
          track('look_door', { detail: id })
          open()
        }
        doors.append(b)
      }
      add('photo', iconHtml('📸'), 'Use a Photo', 'A selfie becomes your New Yorker', () => go('photo'))
      add('surprise', iconHtml('🎲'), 'Surprise Me', 'A random New Yorker, ready to go', () => {
        setLook(surprise(), 'jump')
        go('look')
      })
      add('build', iconHtml('🎨'), 'Build My Own', 'Pick every detail yourself', () => go('look'))
      put(doors)
    }

    if (s === 'photo') {
      put(el('h2', '', 'Show Us a Face'), el('p', 'cr-sub', 'Take a photo or upload one. Yours, or a friend’s if you’re making theirs.'))
      const frame = el('div', 'cr-cam', `<video playsinline muted></video><div class="cr-oval"></div><div class="cr-cam-idle">${iconHtml('📸')}</div><div class="cr-cam-busy"><span>Reading the photo…</span></div>`)
      const video = frame.querySelector('video')!
      const msg = el('div', 'cr-err')
      const note = el('p', 'cr-private', `${iconHtml('🔒')} The photo stays on this computer. It is read here and thrown away, never uploaded.`)
      const file = document.createElement('input')
      file.type = 'file'
      file.accept = 'image/*'
      file.hidden = true
      put(frame, msg, note, file)
      // the reader is two small models: start fetching them the moment this screen opens
      const reader = import('../avatar/match/measure')
      void reader.then((m) => m.loadTools()).catch(() => {})
      const back = el('button', 'btn ghost', '← Back')
      const up = el('button', 'btn ghost', 'Upload a Photo')
      const shoot = el('button', 'btn go', 'Use Camera')
      let busy = false
      const read = async (draw: (m: typeof import('../avatar/match/measure')) => HTMLCanvasElement) => {
        if (busy) return
        busy = true
        msg.textContent = ''
        frame.classList.add('busy')
        let result: Awaited<ReturnType<typeof import('../avatar/match/measure').measure>> = 'load'
        try {
          const m = await reader
          const canvas = draw(m)
          result = await m.measure(canvas)
          // done with the picture: let go of its pixels
          canvas.width = canvas.height = 0
        } catch {
          /* 'load' */
        }
        busy = false
        if (!frame.isConnected) return
        frame.classList.remove('busy')
        if (typeof result === 'string') {
          track('look_photo', { detail: result })
          sfx.squawk()
          msg.textContent = PHOTO_PROBLEM[result]
          return
        }
        const match = pickLook(result)
        near = match.near
        dark = match.dark
        track('look_photo', { detail: 'ok' })
        // a plain outfit under the new face (hats and shades would hide what the photo found)
        setLook({ ...look, ...match.look, items: { body: 'sig-hoodie', legs: 'jeans', feet: 'sneakers' } }, 'cheer')
        go('look')
      }
      shoot.onclick = async () => {
        sfx.click()
        if (cam) return void read((m) => m.toCanvas(video, video.videoWidth, video.videoHeight))
        try {
          cam = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 720 } }, audio: false })
          if (!frame.isConnected) return stopCam()
          video.srcObject = cam
          await video.play()
          frame.classList.add('live')
          shoot.textContent = 'Take Photo'
        } catch {
          stopCam()
          msg.textContent = 'The camera isn’t available here. Upload a photo instead.'
        }
      }
      up.onclick = () => {
        sfx.click()
        file.click()
      }
      file.onchange = async () => {
        const f = file.files?.[0]
        file.value = ''
        if (!f) return
        try {
          const bmp = await createImageBitmap(f)
          await read((m) => {
            const c = m.toCanvas(bmp, bmp.width, bmp.height)
            bmp.close()
            return c
          })
        } catch {
          msg.textContent = 'That file isn’t a picture we can open. Try a JPG or PNG.'
        }
      }
      back.onclick = () => {
        sfx.click()
        go('start')
      }
      put(actions(back, up, shoot))
    }

    if (s === 'look') {
      put(
        el('h2', '', near ? 'Is This You?' : 'Make It Yours'),
        el('p', 'cr-sub', near ? (dark ? 'The photo was a little dark, so check the skin tone first. Then fix anything else that’s off.' : 'Our best read of the photo. Cameras often miss skin tone, so check that first.') : 'Change anything you like. All of it can change later from your player card.'),
      )
      const editor = () =>
        lookEditor(() => look, (l) => {
          // which picker changed
          const what = (Object.keys(l) as (keyof Look)[]).find((k) => k !== 'items' && l[k] !== look[k]) ?? 'look'
          track('look_tweak', { once: true, detail: what })
          setLook(l)
        }, { colour: false, near })
      let ed = editor()
      put(ed)
      drawRing()
      const back = el('button', 'btn ghost', '← Back')
      back.onclick = () => {
        sfx.click()
        go('start')
      }
      const nx = el('button', 'btn go', 'That’s Me →')
      nx.onclick = () => {
        sfx.pop()
        track('name_screen', { once: true })
        go('name')
      }
      if (door === 'surprise') {
        // came in by the dice: roll again without going back
        const again = el('button', 'btn ghost', `<span>${iconHtml('🎲')} Roll Again</span>`)
        again.onclick = () => {
          sfx.pop()
          track('look_shuffle', { once: true })
          setLook(surprise(), 'jump')
          const next = editor()
          ed.replaceWith(next)
          ed = next
          markRing()
        }
        put(actions(back, again, nx))
      } else put(actions(back, nx))
    }

    if (s === 'name') {
      put(el('h2', '', 'What Do New Yorkers Call You?'))
      if (opts.signedInWith) put(el('div', 'cr-linked', `✓ Signed in with ${opts.signedInWith}. Your New Yorker is saved to it.`))
      const wrap = el('label', 'creator-name', '<span>Your name</span>')
      const input = document.createElement('input')
      input.maxLength = 14
      input.placeholder = 'e.g. BagelKing'
      input.autocomplete = 'off'
      input.spellcheck = false
      wrap.append(input)
      const status = el('div', 'cr-avail')
      let checkTimer = 0
      const check = () => {
        clearTimeout(checkTimer)
        const v = cleanName(input.value)
        if (!opts.checkName || v.length < 2) {
          status.className = 'cr-avail'
          status.textContent = ''
          return
        }
        if (avail?.name === v) return show(avail)
        status.className = 'cr-avail checking'
        status.textContent = 'Checking…'
        checkTimer = window.setTimeout(async () => {
          const r = await opts.checkName!(v)
          avail = { name: v, ...r }
          if (cleanName(input.value) === v) show(avail)
        }, 320)
      }
      const show = (x: { name: string; ok: boolean; reason: string | null }) => {
        status.className = 'cr-avail ' + (x.ok ? 'ok' : 'bad')
        status.textContent = x.ok ? `✓ ${x.name} is all yours` : `✗ ${x.reason ?? 'That name is taken.'}`
      }
      input.oninput = () => {
        const c = cleanName(input.value)
        if (c !== input.value) input.value = c
        err.textContent = ''
        track('name_typed', { once: true })
        check()
      }
      const err = el('div', 'cr-err', nameErr)
      nameErr = ''
      const consent = consentFields({ agreed })
      put(wrap, status, err)
      // or skip naming here and keep this New Yorker on a Google / X account (guests only; coming back lands here again)
      if (opts.sso) {
        const or = el('div', 'si-or cr-or', '<span>or sign in to keep your New Yorker on every device</span>')
        const row = el('div', 'si-providers cr-sso')
        or.hidden = row.hidden = true
        put(or, row)
        void opts.sso().then((ps) => {
          if (!ps.length || !row.isConnected) return
          for (const p of ps) {
            const b = el('button', `si-btn ${p}`, `${p === 'google' ? GOOGLE_G : X_LOGO}<span>${SSO_LABEL[p]}</span>`)
            b.setAttribute('aria-label', `Continue with ${SSO_LABEL[p]}`)
            b.onclick = () => {
              sfx.click()
              track('name_sso', { detail: p })
              b.classList.add('busy')
              try {
                sessionStorage.setItem(DRAFT, JSON.stringify({ look, name: cleanName(input.value), at: Date.now() } satisfies Draft))
              } catch {
                /* the look is lost on the way back; the sign-in still works */
              }
              // full-page redirect to the provider; the server links it to this guest and sends us back
              location.href = `/api/auth/${p}`
            }
            row.append(b)
          }
          or.hidden = row.hidden = false
        })
      }
      put(consent.box)
      if (name) input.value = name
      if (input.value) check()
      setTimeout(() => input.focus({ preventScroll: true }), 60)

      const ok = (): boolean => {
        const v = cleanName(input.value)
        const nope = (target: HTMLElement, msg: string) => {
          if (msg) err.textContent = msg
          target.classList.remove('shake')
          void target.offsetWidth
          target.classList.add('shake')
          sfx.squawk()
          return false
        }
        if (v.length < 2) return nope(input, 'Names need at least 2 characters.')
        if (avail && avail.name === v && !avail.ok) return nope(input, avail.reason ?? 'That name is taken. Try another or add a number.')
        const missing = consent.problem()
        if (missing) return nope(missing.target, missing.msg)
        agreed = true
        name = v
        return true
      }
      const back = el('button', 'btn ghost', '← Back')
      back.onclick = () => {
        sfx.click()
        name = cleanName(input.value)
        go('look')
      }
      const nx = el('button', 'btn go', 'Walk into the City →')
      const submit = () => {
        if (!ok()) return
        if (!opts.claim) return finish()
        // online: claim the name now (the server checks it once more)
        void (async () => {
          nx.disabled = true
          nx.textContent = 'Printing your subway card…'
          const problem = await opts.claim!(name, look, '')
          if (problem) {
            nameErr = problem
            avail = null
            sfx.squawk()
            return go('name')
          }
          finish()
        })()
      }
      nx.onclick = submit
      input.onkeydown = (e) => {
        e.stopPropagation()
        if (e.key === 'Enter') submit()
      }
      put(actions(back, nx))
    }
  }

  const finish = () => {
    stopCam()
    track('creator_done', { ms: performance.now() - openedAt })
    cancelAnimationFrame(raf)
    sfx.stamp()
    save.name = name
    save.look = look
    save.team = ''
    save.created = true
    save.memberSince = new Date().toISOString().slice(0, 10)
    for (const id of [...Object.values(look.items)] as string[]) if (id && !save.owned.includes(id)) save.owned.push(id)
    persist()
    screen.classList.add('out')
    setTimeout(() => screen.remove(), 600)
    done()
  }
  go(draft ? 'name' : 'start')
}

/**
 * The MetroCard, earned in the world: a few seconds after the tour it flips in at the corner, then tucks away.
 * Click it to keep a PNG of it (the shareable keepsake the old creator ended on).
 */
export function flipMetroCard(memberNo = 0) {
  const t = save.team ? TEAMS[save.team as TeamId] : null
  const no = memberNo ? String(memberNo).padStart(4, '0') : 'OFFLINE'
  const since = new Date(save.memberSince || Date.now()).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  const card = el('button', 'mc-corner', `<div class="metrocard-id"><div class="mc-strip"><span>NYC Subway</span><i></i></div>
    <div class="mc-body"><div class="mc-photo">${miniPortrait(save.look)}</div><div class="mc-info"><b>${save.name}</b><span>${t ? `<i style="background:${t.color}"></i>${t.emoji} ${t.name}` : '🗽 New Yorker'}</span><small>Member since ${since}</small><small>No. ${no}</small></div></div>
    <div class="mc-mag"></div></div><small class="mc-hint">📸 Click to save your card</small>`)
  card.setAttribute('aria-label', 'Your subway card: click to save it')
  card.onclick = () => {
    sfx.click()
    void downloadCard(save.look, save.name, t?.name ?? 'New Yorker', t?.color ?? '#3d72d9', since, no)
  }
  stage.root.append(card)
  sfx.stamp()
  setTimeout(() => card.classList.add('out'), 6000)
  setTimeout(() => card.remove(), 6600)
}

function miniPortrait(look: Look) {
  return `<svg viewBox="-52 -174 104 122">${avatarMarkup(look, { mood: 'grin' })}</svg>`
}

/** the game's own Burbank, inlined: an SVG drawn into a canvas can't load the page's web fonts */
let fontCss: Promise<string> | null = null
function burbankFaces(): Promise<string> {
  const inline = (url: string) =>
    fetch(url)
      .then((r) => r.blob())
      .then((b) => new Promise<string>((ok) => {
        const fr = new FileReader()
        fr.onload = () => ok(String(fr.result).replace(/^data:[^;]*;/, 'data:font/otf;'))
        fr.readAsDataURL(b)
      }))
  fontCss ??= Promise.all([inline('/fonts/BurbankSmall-Bold.otf'), inline('/fonts/BurbankSmall-Medium.otf')])
    .then(([bold, med]) => `@font-face{font-family:'CardBold';src:url(${bold}) format('opentype')}@font-face{font-family:'CardMed';src:url(${med}) format('opentype')}`)
    .catch(() => '')
  return fontCss
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/**
 * Shareable keepsake: your subway card as a PNG. The Club NYC card (blue bands, the yellow card, the train) with your
 * photo and name on it.
 */
export async function downloadCard(look: Look, name: string, team: string, color: string, since: string, no: string) {
  const faces = await burbankFaces()
  const BOLD = `font-family="CardBold, 'Arial Rounded MT Bold', Arial"`
  const MED = `font-family="CardMed, Arial"`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
    <defs>
      <style>${faces}</style>
      <linearGradient id="mcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd31c"/><stop offset="0.55" stop-color="#fecd01"/><stop offset="1" stop-color="#f7c200"/></linearGradient>
      <linearGradient id="mcb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a5fe6"/><stop offset="1" stop-color="#0a4fd6"/></linearGradient>
      <linearGradient id="mcshine" x1="0" y1="0" x2="1" y2="0.6"><stop offset="0.36" stop-color="#fff" stop-opacity="0"/><stop offset="0.47" stop-color="#fff" stop-opacity="0.3"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.08"/><stop offset="0.56" stop-color="#fff" stop-opacity="0.2"/><stop offset="0.66" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <linearGradient id="mcsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e4f2ff"/><stop offset="1" stop-color="#b9dcf7"/></linearGradient>
      <filter id="mcdrop" x="-10%" y="-10%" width="120%" height="130%"><feGaussianBlur stdDeviation="9"/></filter>
      <clipPath id="mcc"><rect x="18" y="12" width="604" height="362" rx="26"/></clipPath>
      <clipPath id="mcp"><rect x="46" y="128" width="164" height="168" rx="16"/></clipPath>
    </defs>
    <rect x="30" y="34" width="588" height="352" rx="28" fill="#1d2140" opacity="0.35" filter="url(#mcdrop)"/>
    <rect x="18" y="12" width="604" height="362" rx="26" fill="url(#mcg)"/>
    <g clip-path="url(#mcc)">
      <rect x="18" y="12" width="604" height="92" fill="url(#mcb)"/>
      <rect x="18" y="338" width="604" height="36" fill="#0a4fd6"/>
      <ellipse cx="74" cy="38" rx="24" ry="9" fill="#fff" opacity="0.9" transform="rotate(-8 74 38)"/>
      <text x="46" y="84" ${BOLD} font-size="46" fill="#fff">NYC Subway</text>
      <g transform="translate(528 22) scale(2.9)"><rect x="4" y="2" width="16" height="16" rx="5" fill="#fff"/><rect x="6.5" y="6" width="4.6" height="5" rx="1" fill="#0a4fd6"/><rect x="12.9" y="6" width="4.6" height="5" rx="1" fill="#0a4fd6"/><rect x="9" y="3.4" width="6" height="1.2" rx="0.6" fill="#0a4fd6"/><circle cx="8" cy="14.5" r="1.3" fill="#0a4fd6"/><circle cx="16" cy="14.5" r="1.3" fill="#0a4fd6"/><path d="M8 18l-3 4h2.6l1.6-2.2h5.6l1.6 2.2H19l-3-4z" fill="#fff"/></g>
      <rect x="18" y="12" width="604" height="362" fill="url(#mcshine)"/>
    </g>
    <rect x="18" y="12" width="604" height="362" rx="26" fill="none" stroke="#1d2140" stroke-width="7"/>
    <rect x="46" y="128" width="164" height="168" rx="16" fill="url(#mcsky)"/>
    <g clip-path="url(#mcp)"><g transform="translate(128 330) scale(1.38)">${avatarMarkup(look, { mood: 'grin' })}</g>
      <rect x="46" y="128" width="164" height="168" fill="none" stroke="#1d2140" stroke-opacity="0.18" stroke-width="10"/></g>
    <rect x="46" y="128" width="164" height="168" rx="16" fill="none" stroke="#1d2140" stroke-width="5"/>
    <text x="236" y="178" ${BOLD} font-size="40" fill="#1d2140">${esc(name)}</text>
    <circle cx="247" cy="208" r="9" fill="${color}" stroke="#1d2140" stroke-width="3.5"/>
    <text x="264" y="216" ${BOLD} font-size="23" fill="#1d2140">${esc(team)}</text>
    <text x="236" y="254" ${MED} font-size="20" fill="#1d2140" opacity="0.85">Member since ${esc(since)}</text>
    <text x="236" y="282" ${MED} font-size="20" fill="#1d2140" opacity="0.85">No. ${esc(no)}</text>
  </svg>`
  const img = new Image()
  img.onload = () => {
    const c = document.createElement('canvas')
    c.width = 1280
    c.height = 800
    c.getContext('2d')!.drawImage(img, 0, 0, 1280, 800)
    const a = document.createElement('a')
    a.href = c.toDataURL('image/png')
    a.download = `club-nyc-subway-card-${name}.png`
    a.click()
  }
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

/** Returning players get a quick title card instead. */
export function titleCard() {
  const t = el('div', 'title-card', `<img src="/art/ui/logo.png" alt="Club NYC"><p>Welcome back, <b>${save.name}</b>!</p>`)
  stage.root.append(t)
  setTimeout(() => t.classList.add('out'), 1600)
  setTimeout(() => t.remove(), 2300)
}
