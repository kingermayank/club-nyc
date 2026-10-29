import type React from 'react'
import { Composition, Folder } from 'remotion'
import { HERO_FRAMES, HERO_H, HERO_W, HeroLoop } from './HeroLoop'
import { CAB_FRAMES, Creator, End, Explore, Finale, Hangout, Home, Jam, Jobs, Mob, More, Opening } from './scenes'
import { EPIC_FRAMES, EpicReel } from './EpicReel'
import { HOSTS } from './host'
import { hostFrames, HostReel } from './HostReel'
import { Post, POST_H, POST_W } from './Post'
import { Reel, REEL_H, REEL_W } from './Reel'
import { REEL_BEATS, REELS } from './reels'
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
      defaultProps={{ src: 'hero-liberty-island.mp4', at: 1.6, origin: '50% 50%', title: 'Waddle on over to New York.', sub: 'A cozy online hangout' }}
    />
    <Composition id="Post" component={Post} durationInFrames={1} fps={30} width={POST_W} height={POST_H} defaultProps={{ post: 'speak-new-yorker', index: 0 }} />
    <Folder name="Reels">
      {Object.entries(REELS).map(([id, r]) => (
        <Composition key={id} id={`Reel-${id}`} component={Reel} durationInFrames={(r.beats ?? REEL_BEATS) * BEAT} fps={30} width={REEL_W} height={REEL_H} defaultProps={{ id, audio: 'music' as 'music' | 'sfx' }} />
      ))}
      {Object.values(HOSTS).map((h) => (
        <Composition key={h.id} id={`Host-${h.id}`} component={HostReel} durationInFrames={hostFrames(h)} fps={30} width={REEL_W} height={REEL_H} defaultProps={{ id: h.id }} />
      ))}
      <Composition id="Reel-epic-halal" component={EpicReel} durationInFrames={EPIC_FRAMES} fps={30} width={REEL_W} height={REEL_H} defaultProps={{ music: 'shuffle' as 'shuffle' | 'track' }} />
    </Folder>
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
