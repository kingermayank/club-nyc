import { Audio } from '@remotion/media'
import type React from 'react'
import { AbsoluteFill, staticFile, Track } from 'remotion'
import { CAB_FRAMES, Creator, End, Explore, Finale, Hangout, Home, Jam, Jobs, Mob, More, Opening } from './scenes'
import './theme'
import { beats, SCENE, TOTAL } from './timeline'

const at = (s: keyof typeof SCENE) => beats(SCENE[s].at)
const len = (s: keyof typeof SCENE) => beats(SCENE[s].len)

/**
 * The launch trailer: a day in the city told by a group chat, 43 s of real gameplay cut to an acoustic arrangement of
 * the game's own "Empire State of Mine" (see docs/marketing/launch-video.md). The yellow cab drives across two cuts;
 * the scene before each of those stays on screen under it for CAB_FRAMES.
 */
export const Trailer: React.FC<{ url: string }> = ({ url }) => (
  <AbsoluteFill style={{ backgroundColor: '#101b3f' }}>
    <Track name="Scenes">
      <Opening name="The group chat, then the logo" from={at('chat')} durationInFrames={len('chat') + len('title')} />
      <Creator name="Wait, new fit first" from={at('creator')} durationInFrames={len('creator') + CAB_FRAMES} />
      <Explore name="Taking the scenic route" from={at('explore')} durationInFrames={len('explore')} />
      <Hangout name="Meet your friends" from={at('hangout')} durationInFrames={len('hangout')} />
      <Jobs name="Gotta make rent" from={at('jobs')} durationInFrames={len('jobs')} />
      <Jam name="Dance Jam in 1 min" from={at('jam')} durationInFrames={len('jam')} />
      <Mob name="Too late, started my own" from={at('mob')} durationInFrames={len('mob')} />
      <Home name="Afterparty at mine" from={at('home')} durationInFrames={len('home') + CAB_FRAMES} />
      <More name="And so much more" from={at('more')} durationInFrames={len('more')} />
      <Finale name="The Big Apple is waiting" from={at('finale')} durationInFrames={len('finale')} />
      <End name="End card" from={at('end')} durationInFrames={TOTAL - at('end')} url={url} />
    </Track>
    <Audio name="Empire State of Mine (acoustic trailer edit)" src={staticFile('audio/trailer.wav')} />
  </AbsoluteFill>
)
