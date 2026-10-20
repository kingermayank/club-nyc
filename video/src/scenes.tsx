import type React from 'react'
import { AbsoluteFill, Img, Interactive, interpolate, Sequence, staticFile, useCurrentFrame } from 'remotion'
import { Flash, Shot, Vignette } from './Shot'
import { BODY, DISPLAY, INK, SUN } from './theme'
import { BEAT } from './timeline'
import { Caption, ChatCard, CoinPop, Icon, Msg, PlaceSign, PlayButton, TaxiReveal, usePop } from './ui'

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
/** how long the cab takes to drive across a cut (frames); the scene before it stays on screen under the cab */
export const CAB_FRAMES = 16

// ---------------------------------------------------------------- 0:00 the group chat makes plans, then the logo lands
const OpeningInner: React.FC = () => {
  const frame = useCurrentFrame()
  const focus = [8 * BEAT - 16, 8 * BEAT + 22]
  const blur = interpolate(frame, focus, [16, 0], clamp)
  const dim = interpolate(frame, focus, [0.5, 1], clamp)
  const logo = usePop(8 * BEAT, 9)
  return (
    <>
      <AbsoluteFill style={{ filter: blur > 0.05 ? `blur(${blur}px) brightness(${dim})` : undefined }}>
        <Shot src="crowd.mp4" at={0.3} len={12 * BEAT} zoom={[1.14, 1]} origin="50% 78%" />
      </AbsoluteFill>
      <Vignette strength={interpolate(frame, [8 * BEAT, 8 * BEAT + 20], [0.2, 0.5], clamp)} top={interpolate(frame, [8 * BEAT, 8 * BEAT + 20], [0, 0.55], clamp)} />
      <ChatCard
        leave={7.25 * BEAT}
        lines={[
          { who: 'ana', at: BEAT, text: 'who’s around today?' },
          { who: 'ben', at: 2.5 * BEAT, text: 'me!!' },
          { who: 'cleo', at: 4 * BEAT, text: <>meet in Times Square?<Icon name="pizza" size={50} /></> },
          { who: 'ana', at: 5.5 * BEAT, text: <>omw!<Icon name="taxi" size={50} /></> },
        ]}
      />
      <Flash at={8 * BEAT} strength={0.55} />
      <Img
        src={staticFile('game/art/ui/logo.png')}
        style={{
          position: 'absolute',
          left: 960,
          top: 350,
          width: 760,
          translate: '-50% -50%',
          scale: interpolate(logo, [0, 1], [1.9, 1]),
          rotate: `${interpolate(logo, [0, 1], [-10, 0])}deg`,
          opacity: frame < 8 * BEAT ? 0 : Math.min(1, logo * 4),
          filter: 'drop-shadow(0 14px 0 rgba(16,27,63,0.55))',
        }}
      />
      <Caption at={10 * BEAT} y={710} size={84}>
        Waddle on over to New York.
      </Caption>
    </>
  )
}
export const Opening = Interactive.create({ Component: OpeningInner, layout: 'absolute-fill' })

// ---------------------------------------------------------------- 0:07 "wait, new fit first": a new look on every beat
const CreatorInner: React.FC = () => (
  <>
    {[1, 2, 3, 4].map((n, i) => (
      // the last look stays on screen while the cab drives over it
      <Sequence key={n} from={i * BEAT} durationInFrames={i === 3 ? BEAT + CAB_FRAMES : BEAT}>
        <Shot src={`creator-${n}.png`} len={BEAT} zoom={[1.24, 1.27]} origin="22% 64%" />
        <Flash strength={i ? 0.3 : 0.5} />
      </Sequence>
    ))}
    <Caption at={2} y={960} size={84}>
      Make your New Yorker
    </Caption>
    <Msg who="cleo" until={2.6 * BEAT} top>
      wait, new fit first
      <Icon name="sunglasses" size={52} />
    </Msg>
  </>
)
export const Creator = Interactive.create({ Component: CreatorInner, layout: 'absolute-fill' })

// ---------------------------------------------------------------- 0:09 the cab, the map, then a landmark on every beat
const PLACES: [string, string, string, number][] = [
  ['hero-central-park.mp4', 'Central Park', 'The Lake · Bow Bridge', 0.8],
  ['hero-brooklyn-bridge.mp4', 'Brooklyn Bridge', 'Pedestrian Promenade', 0.8],
  ['hero-liberty-island.mp4', 'Liberty Island', 'New York Harbor', 0.8],
  ['hero-empire-deck.mp4', 'Empire State Building', '86th Floor Observatory', 0.8],
  ['hero-grand-central.mp4', 'Grand Central', 'Main Concourse · 42nd St', 0.8],
  ['hero-rockefeller.mp4', 'Rockefeller Center', 'Midtown · The Rink', 0.8],
]
const ExploreInner: React.FC = () => (
  <TaxiReveal frames={CAB_FRAMES}>
    <Sequence durationInFrames={2 * BEAT}>
      <Shot src="map.png" len={2 * BEAT} zoom={[1.0, 1.14]} origin="50% 55%" />
    </Sequence>
    {PLACES.map(([src, name, area, at], i) => (
      <Sequence key={src} from={(i + 2) * BEAT} durationInFrames={BEAT}>
        <Shot src={src} at={at} len={BEAT} zoom={[1.06, 1.1]} origin="50% 60%" />
        <PlaceSign name={name} area={area} at={1} />
      </Sequence>
    ))}
    <Vignette strength={0.25} top={0.4} />
    <Caption at={CAB_FRAMES} y={124} size={88}>
      Explore 20+ places
    </Caption>
    <Msg who="ben" at={BEAT / 2} until={2 * BEAT}>
      taking the scenic route
      <Icon name="liberty" size={52} />
    </Msg>
  </TaxiReveal>
)
export const Explore = Interactive.create({ Component: ExploreInner, layout: 'absolute-fill' })

// ---------------------------------------------------------------- 0:14 friends in the middle of Times Square
const HangoutInner: React.FC = () => (
  <>
    <Shot src="crowd.mp4" at={8.6} len={4 * BEAT} zoom={[1.3, 1.38]} origin="52% 94%" />
    <Vignette strength={0.3} top={0.45} />
    <Caption at={3} until={2 * BEAT} y={124} size={88}>
      Meet your friends
    </Caption>
    <Caption at={2 * BEAT + 2} y={124} size={88}>
      Make new ones
    </Caption>
  </>
)
export const Hangout = Interactive.create({ Component: HangoutInner, layout: 'absolute-fill' })

// ---------------------------------------------------------------- 0:17 "brb, gotta make rent": a job on every beat
const JOBS: [string, number, number?, string?][] = [
  // Showtime, framed below the subway car's line strip
  ['job-showtime.mp4', 4.3, 1.27, '50% 100%'],
  ['job-ferry-captain.mp4', 2.0],
  ['job-halal-rush.mp4', 3.5],
  ['job-bagel-counters.mp4', 3.2],
]
const JobsInner: React.FC = () => (
  <>
    {JOBS.map(([src, at, zoom, origin], i) => (
      <Sequence key={src} from={i * BEAT} durationInFrames={BEAT}>
        <Shot src={src} at={at} len={BEAT} zoom={zoom ? [zoom, zoom + 0.03] : [1.03, 1.08]} origin={origin} />
      </Sequence>
    ))}
    <CoinPop at={BEAT} x={1480} y={400} amount={20} />
    <CoinPop at={3 * BEAT} x={1440} y={410} amount={35} />
    {/* after Showtime's banner has had its moment */}
    <Caption at={BEAT + 2} y={124} size={84}>
      Work silly jobs
    </Caption>
    <Msg who="ben" until={2.4 * BEAT}>
      brb, gotta make rent
      <Icon name="coin" size={52} />
    </Msg>
  </>
)
export const Jobs = Interactive.create({ Component: JobsInner, layout: 'absolute-fill' })

// ---------------------------------------------------------------- 0:19 the Dance Jam starts
const JamInner: React.FC = () => (
  <>
    <Shot src="jam.mp4" at={3.0} len={4 * BEAT} zoom={[1.1, 1.2]} origin="50% 88%" />
    <Vignette strength={0.3} top={0.45} />
    <Caption at={3} y={124} size={84}>
      Dance Jams every 8 minutes
    </Caption>
    <Msg who="cleo" until={2.4 * BEAT}>
      DANCE JAM IN 1 MIN!!!
      <Icon name="disco-ball" size={52} />
    </Msg>
  </>
)
export const Jam = Interactive.create({ Component: JamInner, layout: 'absolute-fill' })

// ---------------------------------------------------------------- 0:22 ...or a flash mob of your own, in Central Park
const MobInner: React.FC = () => (
  <>
    <Shot src="flashmob.mp4" at={9.5} len={4 * BEAT} zoom={[1.5, 1.58]} origin="52% 90%" />
    <Vignette strength={0.3} top={0.45} />
    <Caption at={3} y={124} size={84}>
      Start a flash mob anywhere
    </Caption>
    <Msg who="ana" until={2.4 * BEAT}>
      too late, started my own
      <Icon name="dancer" size={52} />
    </Msg>
  </>
)
export const Mob = Interactive.create({ Component: MobInner, layout: 'absolute-fill' })

// ---------------------------------------------------------------- 0:24 "afterparty at mine?": furniture lands on the beat
// where the game draws each piece (its own positions and sizes, at 1920 px); they land on the half beats
const FURNITURE: { id: string; x: number; y: number; w: number; at: number; flat?: boolean }[] = [
  { id: 'rug', x: 960, y: 919, w: 416, at: BEAT / 2, flat: true },
  { id: 'sofa', x: 634, y: 823, w: 343, at: BEAT },
  { id: 'jukebox', x: 1344, y: 784, w: 161, at: 1.5 * BEAT },
  { id: 'lamp', x: 403, y: 803, w: 95, at: 2 * BEAT },
  { id: 'plant', x: 1517, y: 842, w: 135, at: 2.5 * BEAT },
]
const Piece: React.FC<{ id: string; x: number; y: number; w: number; at: number; flat?: boolean }> = ({ id, x, y, w, at, flat }) => {
  const frame = useCurrentFrame()
  const p = usePop(at, 13)
  const t = frame - at
  if (t < -2) return null
  const squash = interpolate(t, [3, 6, 10], [1, flat ? 0.96 : 0.88, 1], clamp)
  return (
    <Img
      src={staticFile(`game/art/furniture/${id}.png`)}
      style={{
        position: 'absolute',
        left: x - w / 2,
        top: 0,
        width: w,
        translate: `0 calc(${y}px - 100% + ${interpolate(p, [0, 1], [-560, 0])}px)`,
        scale: `${2 - squash} ${squash}`,
        transformOrigin: '50% 100%',
        opacity: Math.min(1, p * 4),
        filter: 'drop-shadow(0 10px 6px rgba(29,33,64,0.25))',
      }}
    />
  )
}
const HomeInner: React.FC = () => {
  const frame = useCurrentFrame()
  return (
    <>
      <Sequence durationInFrames={4 * BEAT}>
        <AbsoluteFill style={{ scale: interpolate(frame, [0, 4 * BEAT], [1.0, 1.05], clamp), transformOrigin: '50% 70%' }}>
          <Img src={staticFile('game/art/rooms/apartment.jpg')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          {FURNITURE.map((f) => (
            <Piece key={f.id} {...f} />
          ))}
        </AbsoluteFill>
        <Vignette strength={0.25} top={0.4} />
        <Caption at={2} y={124} size={84}>
          Decorate your place
        </Caption>
        <Msg who="ana" until={3 * BEAT}>
          afterparty at mine?
          <Icon name="party-popper" size={52} />
        </Msg>
      </Sequence>
      {/* the party runs on under the cab */}
      <Sequence from={4 * BEAT}>
        <Shot src="party.mp4" at={0.6} len={4 * BEAT + CAB_FRAMES} zoom={[1.04, 1.1]} />
        <Flash strength={0.35} />
        <Vignette strength={0.25} top={0.4} />
        <Caption at={2} y={124} size={84}>
          Throw a house party
        </Caption>
      </Sequence>
    </>
  )
}
export const Home = Interactive.create({ Component: HomeInner, layout: 'absolute-fill' })

// ---------------------------------------------------------------- 0:28 the last chorus: one more thing on every beat
const MORE: [string, number, string, string?][] = [
  ['stampbook.mp4', 0.2, 'Collect 50 stamps'],
  ['photobooth.png', 0, 'Group photos', '50% 45%'],
  ['community-teams.png', 0, 'Neighborhood Wars', '35% 50%'],
  ['community-city.png', 0, 'Today in the City', '40% 50%'],
  ['place-soho.mp4', 1.5, 'Shop the city'],
  ['place-the-met.mp4', 1.4, 'The Met steps'],
  ['job-slice-factory-intro.png', 0, 'Slice Factory', '50% 40%'],
]
const MoreInner: React.FC = () => {
  const last = usePop(7 * BEAT, 10)
  return (
    <TaxiReveal frames={CAB_FRAMES}>
      {MORE.map(([src, at, label, origin], i) => (
        <Sequence key={src} from={i * BEAT} durationInFrames={BEAT}>
          <Shot src={src} at={at} len={BEAT} zoom={src.endsWith('.png') ? [1.16, 1.22] : [1.05, 1.1]} origin={origin ?? '50% 55%'} />
          <PlaceSign name={label} at={i ? 1 : CAB_FRAMES - 4} />
        </Sequence>
      ))}
      <Sequence from={7 * BEAT} durationInFrames={BEAT}>
        <AbsoluteFill style={{ background: `radial-gradient(circle at 50% 45%, #ffe7a6, ${SUN})`, justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 132, color: INK, scale: 0.6 + 0.4 * last, opacity: Math.min(1, last * 3) }}>and so much more</div>
        </AbsoluteFill>
      </Sequence>
    </TaxiReveal>
  )
}
export const More = Interactive.create({ Component: MoreInner, layout: 'absolute-fill' })

// ---------------------------------------------------------------- 0:33 everyone together: "same time tomorrow?"
const FinaleInner: React.FC = () => (
  <>
    <Shot src="crowd.mp4" at={13.2} len={8 * BEAT} zoom={[1.02, 1.12]} origin="50% 80%" />
    <Vignette strength={0.5} top={0.6} />
    <Msg who="cleo" at={BEAT / 2} until={2.2 * BEAT}>
      same time tomorrow?
    </Msg>
    <Caption at={2 * BEAT} y={170} size={112}>
      The Big Apple is waiting.
    </Caption>
  </>
)
export const Finale = Interactive.create({ Component: FinaleInner, layout: 'absolute-fill' })

// ---------------------------------------------------------------- 0:38 the end card, on the final chord
const EndInner: React.FC<{ url: string }> = ({ url }) => {
  const frame = useCurrentFrame()
  const logo = usePop(0, 10)
  const line = usePop(2 * BEAT, 12)
  const small = usePop(4 * BEAT + 8, 14)
  return (
    <>
      <AbsoluteFill style={{ filter: 'blur(14px) brightness(0.42)', scale: interpolate(frame, [0, 150], [1.12, 1.04], clamp) }}>
        <Img src={staticFile('footage/crowd-end.png')} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </AbsoluteFill>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        <Img
          src={staticFile('game/art/ui/logo.png')}
          style={{ width: 600, scale: interpolate(logo, [0, 1], [0.5, 1]), opacity: Math.min(1, logo * 3), filter: 'drop-shadow(0 12px 0 rgba(16,27,63,0.6))' }}
        />
        <div
          style={{
            marginTop: 26,
            fontFamily: DISPLAY,
            fontSize: 84,
            color: '#fff',
            textShadow: `0 6px 0 ${INK}`,
            translate: `0 ${interpolate(line, [0, 1], [30, 0])}px`,
            opacity: Math.min(1, line * 2.5),
          }}
        >
          Play free in your browser
        </div>
        <div style={{ marginTop: 44 }}>
          <PlayButton at={4 * BEAT} />
        </div>
        <div style={{ marginTop: 44, fontFamily: BODY, fontSize: 40, color: '#fff', opacity: Math.min(0.92, small * 2), letterSpacing: 0.5 }}>
          {[url, 'No download', 'Ages 13+', 'Early access'].filter(Boolean).join('  ·  ')}
        </div>
      </AbsoluteFill>
    </>
  )
}
export const End = Interactive.create({ Component: EndInner, layout: 'absolute-fill' })
