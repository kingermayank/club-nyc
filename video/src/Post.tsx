import type React from 'react'
import { AbsoluteFill, Img, staticFile } from 'remotion'
import { COLOURS, POSTS, type Slide } from './posts'
import { BLUE, BODY, DISPLAY, INK, PAPER } from './theme'

export const POST_W = 1080
export const POST_H = 1350
const TAXI = '#ffc634'
const GREEN = '#2f9e55'
const art = (f: string) => staticFile(`posts/${f}`)
/** the corner logo, cropped to the drawing itself (logo-trim.png: logo.png has a faint haze out to its edges), so
 *  it lines up with the 70 px text margin. 279 x 188, the drawing's size at 3x the old corner logo */
const LOGO = 279
/** text that sits on a colour: ink on light fills, paper on dark ones */
const on = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  const l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return l > 150 ? INK : PAPER
}

/** a framed picture: ink outline, rounded, hard ink shadow straight down (the brand book's card) */
const Card: React.FC<{ src: string; w: number; h: number; x: number; y: number; tilt?: number; fit?: 'cover' | 'contain'; pos?: string; bg?: string }> = ({ src, w, h, x, y, tilt = 0, fit = 'cover', pos = '50% 50%', bg = PAPER }) => (
  <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: 40, border: `8px solid ${INK}`, boxShadow: `0 14px 0 ${INK}`, overflow: 'hidden', rotate: `${tilt}deg`, background: bg }}>
    <Img src={art(src)} style={{ width: '100%', height: '100%', objectFit: fit, objectPosition: pos }} />
  </div>
)

const Pill: React.FC<{ children: React.ReactNode; bg?: string; size?: number; style?: React.CSSProperties }> = ({ children, bg = PAPER, size = 34, style }) => (
  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, padding: `${size * 0.3}px ${size * 0.7}px ${size * 0.36}px`, background: bg, color: on(bg), border: `5px solid ${INK}`, borderRadius: 999, boxShadow: `0 6px 0 ${INK}`, fontFamily: DISPLAY, fontSize: size, lineHeight: 1.1, whiteSpace: 'nowrap', ...style }}>
    {children}
  </div>
)

const Title: React.FC<{ children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> = ({ children, size = 96, color = INK, style }) => (
  <div style={{ fontFamily: DISPLAY, fontSize: size, lineHeight: 1.02, color, letterSpacing: '-0.01em', textWrap: 'balance', ...style }}>{children}</div>
)
const Body: React.FC<{ children: React.ReactNode; size?: number; color?: string; style?: React.CSSProperties }> = ({ children, size = 42, color = INK, style }) => (
  <div style={{ fontFamily: BODY, fontSize: size, lineHeight: 1.32, color, textWrap: 'pretty', ...style }}>{children}</div>
)

/** the corner marks every slide carries: the logo, and where you are in the carousel */
const Chrome: React.FC<{ index: number; count: number; dark?: boolean }> = ({ index, count, dark }) => (
  <>
    <Img src={art('logo-trim.png')} style={{ position: 'absolute', left: 70, bottom: 50, width: LOGO, filter: dark ? 'none' : 'drop-shadow(0 3px 0 rgba(29,33,64,0.25))' }} />
    {count > 1 ? <Pill size={26} style={{ position: 'absolute', right: 52, bottom: 52 }}>{`${index + 1} / ${count}`}</Pill> : null}
  </>
)

/** a meme's frame: paper, the content top to bottom, the logo small in the corner (memes are sent, not read as ads) */
const Meme: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ background: PAPER, padding: '70px 70px 46px', display: 'flex', flexDirection: 'column', gap: 34 }}>
    {children}
    <Img src={art('logo-trim.png')} style={{ width: 210, alignSelf: 'flex-start', flex: 'none' }} />
  </AbsoluteFill>
)
const Panel: React.FC<{ src: string; pos?: string; style?: React.CSSProperties }> = ({ src, pos = '50% 50%', style }) => (
  <div style={{ flex: 1, minHeight: 0, borderRadius: 40, border: `8px solid ${INK}`, boxShadow: `0 14px 0 ${INK}`, overflow: 'hidden', background: PAPER, ...style }}>
    <Img src={art(src)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: pos }} />
  </div>
)

function SlideView({ s, index, count }: { s: Slide; index: number; count: number }) {
  switch (s.kind) {
    case 'cover':
      return (
        <AbsoluteFill style={{ background: s.bg }}>
          {s.faces ? (
            [1, 2, 3, 4, 5, 6].map((n, i) => <Card key={n} src={`face-${n}.png`} w={290} h={290} x={60 + (i % 3) * 330} y={70 + Math.floor(i / 3) * 330} tilt={[-4, 3, -2, 2, -3, 4][i]} />)
          ) : (
            <Card src={s.art} w={940} h={620} x={70} y={70} tilt={-2} />
          )}
          <div style={{ position: 'absolute', left: 70, right: 70, top: 790, display: 'flex', flexDirection: 'column', gap: 22 }}>
            <Title size={s.title.length > 26 ? 92 : 108} color={on(s.bg)}>{s.title}</Title>
            {s.kicker ? <Body size={40} color={on(s.bg)} style={{ opacity: 0.85 }}>{s.kicker}</Body> : null}
          </div>
          <Pill bg={TAXI} size={34} style={{ position: 'absolute', right: 52, bottom: 50, background: s.bg === TAXI ? PAPER : TAXI, color: INK }}>Swipe ›</Pill>
          <Img src={art('logo-trim.png')} style={{ position: 'absolute', left: 70, bottom: 50, width: LOGO }} />
        </AbsoluteFill>
      )
    case 'word':
      return (
        <AbsoluteFill style={{ background: PAPER }}>
          <div style={{ position: 'absolute', left: 70, right: 70, top: 80, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <Pill size={28} bg={BLUE}>{s.type}</Pill>
            </div>
            <Title size={150}>{s.word}</Title>
            <Body size={46}>{s.def}</Body>
          </div>
          <Card src={s.art} w={940} h={420} x={70} y={630} />
          {/* the example, as a speech bubble on the picture */}
          <div style={{ position: 'absolute', left: 110, top: 590, maxWidth: 820, padding: '18px 30px 22px', background: PAPER, border: `6px solid ${INK}`, borderRadius: 28, boxShadow: `0 8px 0 ${INK}`, fontFamily: DISPLAY, fontSize: 40, color: INK }}>
            “{s.example}”
          </div>
          <Chrome index={index} count={count} />
        </AbsoluteFill>
      )
    case 'place':
      return (
        <AbsoluteFill style={{ background: PAPER }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: POST_W, height: 760, borderBottom: `8px solid ${INK}`, overflow: 'hidden' }}>
            <Img src={art(s.art)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <Pill bg={BLUE} size={32} style={{ position: 'absolute', left: 70, top: 712 }}>{s.tag}</Pill>
          <div style={{ position: 'absolute', left: 70, right: 70, top: 840, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Title size={92}>{s.title}</Title>
            <Body size={42}>{s.body}</Body>
          </div>
          <Chrome index={index} count={count} />
        </AbsoluteFill>
      )
    case 'compare':
      return (
        <AbsoluteFill style={{ background: PAPER }}>
          <Card src={s.art} w={940} h={560} x={70} y={70} />
          <Title size={86} style={{ position: 'absolute', left: 70, right: 70, top: 680 }}>{s.title}</Title>
          <div style={{ position: 'absolute', left: 70, right: 70, top: 800, display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
            {[
              ['In New York', s.nyc, PAPER],
              ['In Club NYC', s.club, GREEN],
            ].map(([k, v, bg]) => (
              <div key={k} style={{ background: bg, color: on(bg), border: `6px solid ${INK}`, borderRadius: 30, boxShadow: `0 8px 0 ${INK}`, padding: '22px 26px 26px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <Body size={30} color={on(bg)} style={{ opacity: 0.8 }}>{k}</Body>
                <Title size={56} color={on(bg)}>{v}</Title>
              </div>
            ))}
          </div>
          {s.note ? <Body size={36} style={{ opacity: 0.75 }}>{s.note}</Body> : null}
          </div>
          <Chrome index={index} count={count} />
        </AbsoluteFill>
      )
    case 'colours':
      return (
        <AbsoluteFill style={{ background: PAPER }}>
          {s.pairs.map(([name, hex, line], i) => (
            <div key={name} style={{ position: 'absolute', left: 70, right: 70, top: 70 + i * 510, height: 460, borderRadius: 44, background: hex, border: `8px solid ${INK}`, boxShadow: `0 14px 0 ${INK}`, padding: '56px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 16 }}>
              <Title size={104} color={on(hex)}>{name}</Title>
              <Body size={44} color={on(hex)}>{line}</Body>
            </div>
          ))}
          <Chrome index={index} count={count} />
        </AbsoluteFill>
      )
    case 'step':
      return (
        <AbsoluteFill style={{ background: PAPER }}>
          <Card src={s.art} w={940} h={620} x={70} y={70} />
          <div style={{ position: 'absolute', left: 70, top: 620, width: 170, height: 170, borderRadius: '50%', background: TAXI, border: `8px solid ${INK}`, boxShadow: `0 10px 0 ${INK}`, display: 'grid', placeItems: 'center', fontFamily: DISPLAY, fontSize: 100, color: INK }}>{s.n}</div>
          <div style={{ position: 'absolute', left: 70, right: 70, top: 830, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Title size={92}>{s.title}</Title>
            <Body size={44}>{s.body}</Body>
          </div>
          <Chrome index={index} count={count} />
        </AbsoluteFill>
      )
    case 'news':
      return (
        <AbsoluteFill style={{ background: PAPER }}>
          <div style={{ position: 'absolute', left: 70, right: 70, top: 60, borderBottom: `6px solid ${INK}`, paddingBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 52, color: INK }}>The Club NYC Times</span>
            <span style={{ fontFamily: BODY, fontSize: 30, color: INK, opacity: 0.7 }}>Late edition</span>
          </div>
          <Title size={88} style={{ position: 'absolute', left: 70, right: 70, top: 170 }}>{s.headline}</Title>
          <Card src={s.art} w={940} h={520} x={70} y={400} pos="50% 40%" />
          <Body size={44} style={{ position: 'absolute', left: 70, right: 70, top: 955 }}>{s.deck}</Body>
          <Chrome index={index} count={count} />
        </AbsoluteFill>
      )
    case 'quote':
      return (
        <AbsoluteFill style={{ background: INK }}>
          <Img src={art(s.art)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
          <AbsoluteFill style={{ background: 'linear-gradient(rgba(29,33,64,0.1), rgba(29,33,64,0.55))' }} />
          <div style={{ position: 'absolute', left: 70, right: 70, top: 380, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
            <div style={{ background: PAPER, border: `10px solid ${INK}`, borderRadius: 54, boxShadow: `0 16px 0 ${INK}`, padding: '56px 60px 64px', textAlign: 'center' }}>
              <Title size={124}>{s.line}</Title>
            </div>
            <div style={{ width: 0, height: 0, borderLeft: '44px solid transparent', borderRight: '44px solid transparent', borderTop: `56px solid ${INK}`, marginTop: -2 }} />
          </div>
          <Pill bg={TAXI} size={38} style={{ position: 'absolute', left: '50%', translate: '-50% 0', top: 950 }}>{s.who}</Pill>
          <Chrome index={index} count={count} dark />
        </AbsoluteFill>
      )
    case 'poster':
      return (
        <AbsoluteFill style={{ background: s.bg }}>
          {s.round ? (
            <div style={{ position: 'absolute', left: 240, top: 70, width: 600, height: 600, borderRadius: '50%', background: PAPER, border: `10px solid ${INK}`, boxShadow: `0 16px 0 ${INK}`, overflow: 'hidden' }}>
              <Img src={art(s.art)} style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 70 }} />
            </div>
          ) : (
            <Card src={s.art} w={940} h={580} x={70} y={70} tilt={2} />
          )}
          <div style={{ position: 'absolute', left: 70, right: 70, top: 720, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Title size={s.title.length > 30 ? 82 : 100} color={on(s.bg)}>{s.title}</Title>
            {s.sub ? <Body size={40} color={on(s.bg)} style={{ opacity: 0.85 }}>{s.sub}</Body> : null}
          </div>
          {s.cta ? <Pill bg={s.bg === TAXI ? PAPER : TAXI} size={34} style={{ position: 'absolute', right: 52, bottom: 50 }}>{s.cta}</Pill> : null}
          <Img src={art('logo-trim.png')} style={{ position: 'absolute', left: 70, bottom: 50, width: LOGO }} />
        </AbsoluteFill>
      )
    case 'grid':
      return (
        <AbsoluteFill style={{ background: PAPER }}>
          <Title size={110} style={{ position: 'absolute', left: 70, right: 70, top: 70 }}>{s.title}</Title>
          <Body size={38} style={{ position: 'absolute', left: 70, right: 70, top: 200, opacity: 0.8 }}>{s.sub}</Body>
          <div style={{ position: 'absolute', left: 70, right: 70, top: 330, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '46px 22px' }}>
            {COLOURS.map(([name, hex]) => (
              <div key={name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 160, height: 160, borderRadius: '50%', background: hex, border: `7px solid ${INK}`, boxShadow: `0 8px 0 ${INK}` }} />
                <span style={{ fontFamily: DISPLAY, fontSize: 28, color: INK, textAlign: 'center' }}>{name}</span>
              </div>
            ))}
          </div>
          <Img src={art('logo-trim.png')} style={{ position: 'absolute', right: 70, bottom: 50, width: LOGO }} />
        </AbsoluteFill>
      )
    case 'caption':
      return (
        <Meme>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 'none' }}>
            {s.lines.map((l, i) => (i === s.lines.length - 1 ? <Title key={i} size={s.lines.length > 2 ? 66 : 74}>{l}</Title> : <Body key={i} size={50} style={{ opacity: 0.8 }}>{l}</Body>))}
          </div>
          <Panel src={s.art} pos={s.pos} />
        </Meme>
      )
    case 'versus':
      return (
        <Meme>
          {s.title ? <Title size={88} style={{ flex: 'none' }}>{s.title}</Title> : null}
          <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 30 }}>
            {[s.left, s.right].map(([label, src, bg], i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 22, minHeight: 0 }}>
                <Pill bg={bg} size={36} style={{ alignSelf: 'flex-start' }}>{label}</Pill>
                <Panel src={src} style={{ rotate: `${i ? 1.5 : -1.5}deg` }} />
              </div>
            ))}
          </div>
          {s.note ? <Body size={42} style={{ flex: 'none' }}>{s.note}</Body> : null}
        </Meme>
      )
    case 'starter':
      return (
        <Meme>
          <Title size={84} style={{ flex: 'none' }}>{s.title}</Title>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gridTemplateRows: '1fr 1fr', gap: '30px 26px' }}>
            {s.items.map(([icon, label, bg]) => (
              <div key={icon} style={{ display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
                <div style={{ flex: 1, minHeight: 0, borderRadius: 34, background: bg, border: `7px solid ${INK}`, boxShadow: `0 10px 0 ${INK}`, display: 'grid', placeItems: 'center' }}>
                  <Img src={art(`e/${icon}.png`)} style={{ height: '62%', width: 'auto', objectFit: 'contain' }} />
                </div>
                <Body size={32} style={{ textAlign: 'center', lineHeight: 1.2, flex: 'none', minHeight: 78 }}>{label}</Body>
              </div>
            ))}
          </div>
        </Meme>
      )
    case 'tier':
      return (
        <Meme>
          <Title size={78} style={{ flex: 'none' }}>{s.title}</Title>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {s.rows.map(([tier, bg, items]) => (
              <div key={tier} style={{ flex: 1, display: 'flex', gap: 20, minHeight: 0 }}>
                <div style={{ width: 170, flex: 'none', borderRadius: 30, background: bg, border: `7px solid ${INK}`, boxShadow: `0 8px 0 ${INK}`, display: 'grid', placeItems: 'center', fontFamily: DISPLAY, fontSize: 110, color: INK }}>{tier}</div>
                <div style={{ flex: 1, borderRadius: 30, background: '#fbf8ef', border: `7px solid ${INK}`, display: 'grid', gridTemplateColumns: '1fr 1fr', alignItems: 'center', padding: '0 24px' }}>
                  {items.map(([icon, label]) => (
                    <div key={icon} style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <Img src={art(`e/${icon}.png`)} style={{ height: 104, width: 'auto', objectFit: 'contain', flex: 'none' }} />
                      <Body size={32} style={{ lineHeight: 1.15 }}>{label}</Body>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Meme>
      )
    case 'end':
      return (
        <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 38%, #4a86e8, ${INK} 78%)`, alignItems: 'center', justifyContent: 'center', gap: 46, padding: '0 80px', textAlign: 'center' }}>
          <Img src={art('logo-trim.png')} style={{ width: 520, filter: 'drop-shadow(0 14px 0 rgba(0,0,0,0.3))' }} />
          <Title size={86} color={PAPER} style={{ textShadow: `0 7px 0 ${INK}` }}>{s.title}</Title>
          <Pill bg={TAXI} size={44}>{s.line}</Pill>
          {count > 1 ? <Pill size={26} style={{ position: 'absolute', right: 52, bottom: 52 }}>{`${index + 1} / ${count}`}</Pill> : null}
        </AbsoluteFill>
      )
  }
}

/** one slide of a post (posts.ts), picked by `post` id and `index` */
export const Post: React.FC<{ post: string; index: number }> = ({ post, index }) => {
  const p = POSTS.find((x) => x.id === post) ?? POSTS[0]
  return <SlideView s={p.slides[index]} index={index} count={p.slides.length} />
}

