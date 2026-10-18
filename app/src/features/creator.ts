import { sfx } from '../audio'
import { save, persist } from '../state'
import { AvatarView, avatarMarkup, headPortrait } from '../avatar/render'
import { el, stage } from '../engine/stage'
import { lookEditor } from './playerCard'
import { HAIR_STYLES, SIG_COLORS, SKIN_ORDER, type Look } from '../avatar/look'
import { TEAMS, type TeamId } from '../social/teams'
import { track } from '../net/events'
import { consentFields, isOldEnough, tooYoungRecently, tooYoungScreen, type Birth } from './consent'

/**
 * First-run onboarding, two screens and about 40 seconds (docs/avatar-redesign.md):
 *  1. "Who's walking into Manhattan?": ready-made looks, Surprise me, skin / hair / hair colour / signature colour.
 *  2. "What do New Yorkers call you?": a two-wheel NYC name picker or your own, the 13+ check, then the city.
 * The neighborhood team, the MetroCard and the wardrobe now come later, in the world.
 */
const STEPS = ['look', 'name'] as const
type Step = (typeof STEPS)[number]

const ADJ = ['Big', 'Lucky', 'Sunny', 'Midnight', 'Express', 'Rooftop', 'Golden', 'Dollar', 'Brooklyn', 'Uptown', 'Downtown', 'Neon', 'Cozy', 'Rapid', 'Captain', 'Lil', 'Chef', 'DJ', 'Doc', 'Super']
const NOUN = ['Bagel', 'Pigeon', 'Slice', 'Taxi', 'Pretzel', 'Ferry', 'Knish', 'Cannoli', 'Subway', 'Hydrant', 'Skyline', 'Dumpling', 'Latte', 'Stoop', 'Bodega', 'Hotdog', 'Pickle', 'Gelato', 'Rooftop', 'Metro']
/** names are what everyone sees online: letters, numbers and underscores */
const cleanName = (v: string) => v.replace(/[^A-Za-z0-9_]/g, '').slice(0, 14)

/** eight complete, coordinated starting looks across skin tones and hair textures (every item is a free starter) */
const PRESETS: Look[] = [
  { skin: 3, hair: 'afro', hairColor: 0, color: 0, items: { body: 'sig-hoodie', legs: 'jeans', feet: 'sneakers' } },
  { skin: 0, hair: 'bob', hairColor: 4, color: 6, items: { body: 'sig-hoodie', legs: 'plaid-skirt', feet: 'boots' } },
  { skin: 5, hair: 'locs', hairColor: 0, color: 1, items: { body: 'sig-hoodie', legs: 'sweats', feet: 'runners', head: 'nyc-beanie' } },
  { skin: 1, hair: 'ponytail', hairColor: 3, color: 4, items: { body: 'sig-hoodie', legs: 'jeans', feet: 'sneakers' } },
  { skin: 6, hair: 'fade', hairColor: 0, color: 7, items: { body: 'sig-hoodie', legs: 'shorts', feet: 'runners', face: 'shades' } },
  { skin: 2, hair: 'curly', hairColor: 1, color: 3, items: { body: 'sig-hoodie', legs: 'jeans', feet: 'boots' } },
  { skin: 7, hair: 'puffs', hairColor: 0, color: 2, items: { body: 'sig-hoodie', legs: 'plaid-skirt', feet: 'sneakers' } },
  { skin: 4, hair: 'short', hairColor: 0, color: 12, items: { body: 'sig-hoodie', legs: 'sweats', feet: 'sneakers', head: 'nyc-cap' } },
]

export interface CreatorOpts {
  /** online: check names as you type */
  checkName?: (name: string) => Promise<{ ok: boolean; reason: string | null }>
  /** online: claim the profile on the server (with the birthday the server checks); resolves an error message or null */
  claim?: (name: string, look: Look, team: string, birth: Birth) => Promise<string | null>
  /** under 13: forget this visit (online, the guest account made for it is deleted) */
  tooYoung?: () => void
  /** online: your member number, once the profile is claimed */
  memberNo?: () => number
}

export function openCreator(done: () => void, opts: CreatorOpts = {}) {
  // said "under 13" in this browser in the last day: no going back to pick another year
  if (tooYoungRecently()) {
    opts.tooYoung?.()
    return tooYoungScreen()
  }
  const openedAt = performance.now()
  track('creator_open')
  let look: Look = structuredClone(PRESETS[Math.floor(Math.random() * PRESETS.length)])
  let name = ''
  let nameErr = ''
  // the birthday and "I agree" (kept if the name screen redraws, e.g. after a taken name)
  let birth: Birth | null = null
  let agreed = false
  let avail: { name: string; ok: boolean; reason: string | null } | null = null
  let wheelA = 0
  let wheelB = 0
  do {
    wheelA = Math.floor(Math.random() * ADJ.length)
    wheelB = Math.floor(Math.random() * NOUN.length)
  } while ((ADJ[wheelA] + NOUN[wheelB]).length > 14)

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

  const go = (s: Step) => {
    screen.classList.toggle('naming', s === 'name')
    dots.innerHTML = STEPS.map((x) => `<i class="${x === s ? 'on' : STEPS.indexOf(x) < STEPS.indexOf(s) ? 'done' : ''}"></i>`).join('')
    right.innerHTML = ''
    right.classList.remove('swap')
    void right.offsetWidth
    right.classList.add('swap')
    // content scrolls if needed; the action buttons always stay visible at the bottom
    const scroll = el('div', 'creator-scroll')
    right.append(scroll)
    const put = (...nodes: HTMLElement[]) => nodes.forEach((n) => (n.classList.contains('creator-actions') ? right : scroll).append(n))
    const actions = (...btns: HTMLElement[]) => {
      const bar = el('div', 'creator-actions')
      bar.append(...btns)
      return bar
    }

    if (s === 'look') {
      put(el('h2', '', 'Who’s walking into Manhattan?'), el('p', 'cr-sub', 'Start from a look, or make it yours. You can change all of this later from your player card.'))
      const presets = el('div', 'cr-presets')
      PRESETS.forEach((p) => {
        const b = el('button', 'cr-preset', headPortrait(p, 'smile'))
        b.setAttribute('aria-label', 'Use this look')
        b.onclick = () => {
          sfx.pop()
          track('look_preset', { once: true })
          setLook(structuredClone(p), 'cheer')
          go('look')
        }
        presets.append(b)
      })
      const dice = el('button', 'cr-preset dice', '🎲')
      dice.title = 'Surprise me'
      dice.setAttribute('aria-label', 'Surprise me: a random look')
      dice.onclick = () => {
        sfx.pop()
        track('look_shuffle', { once: true })
        // a curated reroll: a preset's outfit with fresh skin, hair and colours, never a clash
        const base = PRESETS[Math.floor(Math.random() * PRESETS.length)]
        setLook({ ...structuredClone(base), skin: SKIN_ORDER[Math.floor(Math.random() * SKIN_ORDER.length)], hair: HAIR_STYLES[Math.floor(Math.random() * HAIR_STYLES.length)], hairColor: Math.random() < 0.85 ? Math.floor(Math.random() * 6) : Math.floor(Math.random() * 10), color: Math.floor(Math.random() * SIG_COLORS.length) }, 'jump')
        go('look')
      }
      presets.append(dice)
      put(presets, lookEditor(() => look, (l) => {
        // which row changed: skin, hair or hairColor
        const what = l.skin !== look.skin ? 'skin' : l.hair !== look.hair ? 'hair' : 'hairColor'
        track('look_tweak', { once: true, detail: what })
        setLook(l)
      }, { colour: false }))
      drawRing()
      const nx = el('button', 'btn go', 'That’s me →')
      nx.onclick = () => {
        sfx.pop()
        track('name_screen', { once: true })
        go('name')
      }
      put(actions(nx))
    }

    if (s === 'name') {
      put(el('h2', '', 'What do New Yorkers call you?'), el('p', 'cr-sub', 'Spin a name or type your own. It goes on your name tag.'))
      // two-wheel NYC name picker: every combination is pre-approved and fits the 14-character limit
      const wheels = el('div', 'cr-wheels')
      const wheel = (list: string[], get: () => number, setIdx: (i: number) => void) => {
        const w = el('div', 'cr-wheel', `<button class="up" aria-label="Previous">▲</button><b></b><button class="dn" aria-label="Next">▼</button>`)
        const show = () => (w.querySelector('b')!.textContent = list[get()])
        const step = (k: number) => {
          sfx.tick()
          // skip pairs that would run past the 14-character name limit
          for (let n = 0; n < list.length; n++) {
            setIdx((get() + k + list.length) % list.length)
            if ((ADJ[wheelA] + NOUN[wheelB]).length <= 14) break
          }
          show()
          w.classList.remove('spin')
          void w.offsetWidth
          w.classList.add('spin')
          track('name_wheel', { once: true })
          fromWheels()
        }
        w.querySelector<HTMLButtonElement>('.up')!.onclick = () => step(-1)
        w.querySelector<HTMLButtonElement>('.dn')!.onclick = () => step(1)
        w.onwheel = (e) => {
          e.preventDefault()
          step(e.deltaY > 0 ? 1 : -1)
        }
        show()
        return { w, show }
      }
      const a = wheel(ADJ, () => wheelA, (i) => (wheelA = i))
      const b = wheel(NOUN, () => wheelB, (i) => (wheelB = i))
      const spin = el('button', 'cr-spin', '🎲')
      spin.setAttribute('aria-label', 'Spin both')
      spin.onclick = () => {
        sfx.pop()
        do {
          wheelA = Math.floor(Math.random() * ADJ.length)
          wheelB = Math.floor(Math.random() * NOUN.length)
        } while ((ADJ[wheelA] + NOUN[wheelB]).length > 14)
        a.show()
        b.show()
        wheels.classList.remove('spin')
        void wheels.offsetWidth
        wheels.classList.add('spin')
        track('name_wheel', { once: true })
        fromWheels()
      }
      wheels.append(a.w, b.w, spin)

      const wrap = el('label', 'creator-name', '<span>Or type your own</span>')
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
      const fromWheels = () => {
        input.value = cleanName(ADJ[wheelA] + NOUN[wheelB])
        err.textContent = ''
        check()
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
      const consent = consentFields({ birth, agreed })
      put(wheels, wrap, status, err, consent.box)
      if (name) input.value = name
      else fromWheels()
      if (input.value) check()

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
        if (avail && avail.name === v && !avail.ok) return nope(input, avail.reason ?? 'That name is taken. Spin again or add a number.')
        const missing = consent.problem()
        if (missing) return nope(missing.target, missing.msg)
        birth = consent.birth()
        agreed = true
        if (birth && !isOldEnough(birth)) {
          opts.tooYoung?.()
          tooYoungScreen()
          return false
        }
        name = v
        return true
      }
      const back = el('button', 'btn ghost', '← Back')
      back.onclick = () => {
        sfx.click()
        name = cleanName(input.value)
        go('look')
      }
      const nx = el('button', 'btn go', 'Walk into the city →')
      const submit = () => {
        if (!ok()) return
        if (!opts.claim) return finish()
        // online: claim the name now (the server checks it once more)
        void (async () => {
          nx.disabled = true
          nx.textContent = 'Printing your MetroCard…'
          const problem = await opts.claim!(name, look, '', birth!)
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
  go('look')
}

/**
 * The MetroCard, earned in the world: a few seconds after the tour it flips in at the corner, then tucks away.
 * Click it to keep a PNG of it (the shareable keepsake the old creator ended on).
 */
export function flipMetroCard(memberNo = 0) {
  const t = save.team ? TEAMS[save.team as TeamId] : null
  const no = memberNo ? String(memberNo).padStart(4, '0') : 'OFFLINE'
  const since = new Date(save.memberSince || Date.now()).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  const card = el('button', 'mc-corner', `<div class="metrocard-id"><div class="mc-strip"><span>CLUB NYC</span><span>MetroCard</span></div>
    <div class="mc-body"><div class="mc-photo">${miniPortrait(save.look)}</div><div class="mc-info"><b>${save.name}</b><span>${t ? `<i style="background:${t.color}"></i>${t.emoji} ${t.name}` : '🗽 New Yorker'}</span><small>Member since ${since}</small><small>No. ${no}</small></div></div>
    <div class="mc-mag"></div></div><small class="mc-hint">📸 Click to save your card</small>`)
  card.setAttribute('aria-label', 'Your MetroCard: click to save it')
  card.onclick = () => {
    sfx.click()
    downloadCard(save.look, save.name, t?.name ?? 'New Yorker', t?.color ?? '#3d72d9', since, no)
  }
  stage.root.append(card)
  sfx.stamp()
  setTimeout(() => card.classList.add('out'), 6000)
  setTimeout(() => card.remove(), 6600)
}

function miniPortrait(look: Look) {
  return `<svg viewBox="-52 -174 104 122">${avatarMarkup(look, { mood: 'grin' })}</svg>`
}

/** Shareable keepsake: your MetroCard as a PNG. */
function downloadCard(look: Look, name: string, team: string, color: string, since: string, no: string) {
  const join = `${location.host}/join/${name}`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
    <rect x="8" y="8" width="624" height="384" rx="32" fill="#ffcf1f" stroke="#1d2140" stroke-width="10"/>
    <rect x="8" y="8" width="624" height="70" rx="32" fill="#1f3c88"/><rect x="8" y="48" width="624" height="30" fill="#1f3c88"/>
    <text x="40" y="58" font-family="Arial Black, Arial" font-weight="900" font-size="34" fill="#fff">CLUB NYC</text>
    <text x="600" y="58" text-anchor="end" font-family="Arial Black, Arial" font-weight="900" font-size="28" fill="#ffcf1f">MetroCard</text>
    <rect x="40" y="104" width="200" height="236" rx="20" fill="#cfe8ff" stroke="#1d2140" stroke-width="6"/>
    <g transform="translate(140 352) scale(1.65)">${avatarMarkup(look, { mood: 'grin' })}</g>
    <text x="270" y="160" font-family="Arial Black, Arial" font-weight="900" font-size="44" fill="#1d2140">${name}</text>
    <circle cx="282" cy="196" r="11" fill="${color}" stroke="#1d2140" stroke-width="4"/>
    <text x="302" y="206" font-family="Arial" font-weight="700" font-size="26" fill="#1d2140">${team}</text>
    <text x="270" y="262" font-family="Arial" font-size="22" fill="#1d2140">Member since ${since}</text>
    <text x="270" y="296" font-family="Arial" font-size="22" fill="#1d2140">No. ${no}</text>
    <rect x="8" y="340" width="624" height="44" fill="#1d2140"/>
    <text x="320" y="369" text-anchor="middle" font-family="Arial" font-weight="700" font-size="19" fill="#ffcf1f">Come hang out → ${join}</text>
  </svg>`
  const img = new Image()
  img.onload = () => {
    const c = document.createElement('canvas')
    c.width = 1280
    c.height = 800
    c.getContext('2d')!.drawImage(img, 0, 0, 1280, 800)
    const a = document.createElement('a')
    a.href = c.toDataURL('image/png')
    a.download = `club-nyc-metrocard-${name}.png`
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
