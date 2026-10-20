import { continueRender, delayRender, staticFile } from 'remotion'

/** The game's palette (app/src/style.css :root) */
export const INK = '#1d2140'
export const BLUE = '#2a7bd5'
export const BLUE_DARK = '#134a96'
export const BLUE_LIGHT = '#6fb6ff'
export const SUN = '#ffd166'
export const PAPER = '#fffdf6'
export const NIGHT = '#101b3f'

/** Burbank Small, as in the game: Bold for titles and buttons, Medium for sentences */
export const DISPLAY = 'Burbank Display'
export const BODY = 'Burbank'

// Same metrics as the game's @font-face (ascent 85%, descent 15%), so text sits centred in plates and buttons.
const FACES: [string, string, string][] = [
  [DISPLAY, 'game/fonts/BurbankSmall-Bold.otf', '400'],
  [BODY, 'game/fonts/BurbankSmall-Medium.otf', '400'],
  [BODY, 'game/fonts/BurbankSmall-Bold.otf', '700'],
]
const fonts = delayRender('Loading Burbank')
Promise.all(
  FACES.map(async ([family, file, weight]) => {
    const face = new FontFace(family, `url(${staticFile(file)})`, { weight, ascentOverride: '85%', descentOverride: '15%', lineGapOverride: '0%' })
    await face.load()
    document.fonts.add(face)
  }),
).then(
  () => continueRender(fonts),
  (err) => {
    console.error(err)
    continueRender(fonts)
  },
)
