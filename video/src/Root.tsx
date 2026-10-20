import type React from 'react'
import { Composition, Folder } from 'remotion'
import { HERO_FRAMES, HERO_H, HERO_W, HeroLoop } from './HeroLoop'
import { CAB_FRAMES, Creator, End, Explore, Finale, Hangout, Home, Jam, Jobs, Mob, More, Opening } from './scenes'
import { ShareCard } from './ShareCard'
import { BEAT, TOTAL } from './timeline'
import { Trailer } from './Trailer'

const scene = { fps: 30, width: 1920, height: 1080 } as const

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="Trailer" component={Trailer} durationInFrames={TOTAL} {...scene} defaultProps={{ url: '' }} />
    <Composition id="HeroLoop" component={HeroLoop} durationInFrames={HERO_FRAMES} fps={30} width={HERO_W} height={HERO_H} />
    <Composition
      id="ShareCard"
      component={ShareCard}
      durationInFrames={1}
      fps={30}
      width={1200}
      height={630}
      defaultProps={{ src: 'hero-liberty-island.mp4', at: 1.6, origin: '50% 50%', title: 'Waddle on over to New York.', sub: 'A cozy online hangout · Free in your browser' }}
    />
    <Folder name="Scenes">
      <Composition id="Opening" component={Opening} durationInFrames={12 * BEAT} {...scene} />
      <Composition id="Creator" component={Creator} durationInFrames={4 * BEAT + CAB_FRAMES} {...scene} />
      <Composition id="Explore" component={Explore} durationInFrames={8 * BEAT} {...scene} />
      <Composition id="Hangout" component={Hangout} durationInFrames={4 * BEAT} {...scene} />
      <Composition id="Jobs" component={Jobs} durationInFrames={4 * BEAT} {...scene} />
      <Composition id="Jam" component={Jam} durationInFrames={4 * BEAT} {...scene} />
      <Composition id="Mob" component={Mob} durationInFrames={4 * BEAT} {...scene} />
      <Composition id="Home" component={Home} durationInFrames={8 * BEAT + CAB_FRAMES} {...scene} />
      <Composition id="More" component={More} durationInFrames={8 * BEAT} {...scene} />
      <Composition id="Finale" component={Finale} durationInFrames={8 * BEAT} {...scene} />
      <Composition id="End" component={End} durationInFrames={TOTAL - 64 * BEAT} {...scene} defaultProps={{ url: '' }} />
    </Folder>
  </>
)
