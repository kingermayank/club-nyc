import { createLogo, type LogoHandle } from '../src/features/logoMotion'

const sound = document.getElementById('sound') as HTMLInputElement
const hero: LogoHandle = createLogo({ sound: false, delay: 250 })
document.getElementById('hero')!.appendChild(hero.el)
document.getElementById('small')!.appendChild(createLogo({ delay: 600 }).el)
document.getElementById('card')!.appendChild(createLogo({ delay: 900 }).el)
document.getElementById('night')!.appendChild(createLogo({ intro: false }).el)

// the sound checkbox swaps in a logo that honks (sound is an option at creation: it never plays on load)
let current = hero
sound.addEventListener('change', () => {
  const next = createLogo({ sound: sound.checked, intro: false })
  current.el.replaceWith(next.el)
  current.destroy()
  current = next
})

document.querySelectorAll<HTMLButtonElement>('[data-do]').forEach((b) =>
  b.addEventListener('click', () => {
    const what = b.dataset.do as 'intro' | 'wave' | 'honk' | 'sway' | 'twinkle'
    void current[what]()
  }),
)
