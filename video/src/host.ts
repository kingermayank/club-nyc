/**
 * Creator-style reels with Bea, Club NYC's disclosed AI host (HostReel.tsx). Bea is an AI character (Higgsfield:
 * a Soul 2 portrait, then a Kling 3.0 talking clip with its own voice); she is never presented as a real player, the
 * "AI host" label stays on screen, and captions say so too. One ~10 s clip per reel is the only paid part: the
 * gameplay, captions and end card are ours.
 *
 * Times are seconds into the host's clip, fitted to where she actually says each phrase (ffmpeg silencedetect on the
 * clip). Cuts cover 0 to `talk` back to back; `broll` cuts show full-screen gameplay with Bea in the corner bubble.
 */
export interface HostCut {
  from: number
  to: number
  /** gameplay over the voice: a tall crop of a 16:9 clip (see reels.ts for the footage) */
  broll?: { src: string; at?: number; cx: number; pan?: number; zoom?: [number, number] }
}

export interface HostDef {
  id: string
  name: string
  /** public/ path of the talking clip */
  clip: string
  /** seconds of the clip to use (the end card follows) */
  talk: number
  endSeconds: number
  cuts: HostCut[]
  captions: { from: number; to: number; text: string }[]
  end: { title?: string; line: string }
  /** our tune, quiet under the voice */
  music: string
}

export const HOSTS: Record<string, HostDef> = {
  // "Remember the penguin game from after school? It grew up and moved to New York.
  //  Make a New Yorker, fold pizza for coins, dance in Central Park."
  'bea-grew-up': {
    id: 'bea-grew-up',
    name: 'Bea',
    clip: 'host/bea-grew-up.mp4',
    talk: 10,
    endSeconds: 2,
    // fitted to Whisper word timings: "school?" ends 2.48, "York." 5.04, "coins." 8.14, "Park." 9.76
    cuts: [
      { from: 0, to: 3.1 },
      { from: 3.1, to: 5.8, broll: { src: 'tall-liberty-island.mp4', at: 0.3, cx: 0.62 } },
      { from: 5.8, to: 6.66, broll: { src: 'creator.mp4', at: 0.3, cx: 0.15 } },
      { from: 6.66, to: 8.7, broll: { src: 'job-slice-factory.mp4', at: 1.0, cx: 0.5, zoom: [1.1, 1.15] } },
      { from: 8.7, to: 10, broll: { src: 'flashmob.mp4', at: 6, cx: 0.45 } },
    ],
    captions: [
      { from: 0, to: 3.1, text: 'Remember the *penguin game* from after school?' },
      { from: 3.1, to: 5.8, text: 'It grew up and moved to *New York*' },
      { from: 5.8, to: 6.66, text: 'Make a *New Yorker*' },
      { from: 6.66, to: 8.7, text: 'fold pizza for *coins*' },
      { from: 8.7, to: 10, text: 'dance in *Central Park*' },
    ],
    end: { line: 'Link in bio' },
    music: 'audio/reel-pov-morning.wav',
  },
  // "I'm an AI, and even I can't afford rent in Manhattan. So I moved into Club NYC.
  //  Zero rent, exposed brick, a spiral staircase, and the penthouse view."
  'bea-rent': {
    id: 'bea-rent',
    name: 'Bea',
    clip: 'host/bea-rent.mp4',
    talk: 10,
    endSeconds: 2,
    // she says she's an AI full screen, then the tour: "NYC" ends 5.32, "rent" 6.66, "brick" 7.48, "staircase" 8.54
    cuts: [
      { from: 0, to: 5.32 },
      { from: 5.32, to: 6.66, broll: { src: 'tall-apartment.mp4', at: 0.3, cx: 0.45 } },
      { from: 6.66, to: 7.48, broll: { src: 'tall-apartment.mp4', at: 1.6, cx: 0.35, pan: 0.5, zoom: [1.1, 1.16] } },
      { from: 7.48, to: 8.54, broll: { src: 'tall-loft.mp4', at: 0.3, cx: 0.16, pan: 0.22 } },
      { from: 8.54, to: 10, broll: { src: 'tall-penthouse.mp4', at: 0.3, cx: 0.55 } },
    ],
    captions: [
      { from: 0, to: 3.1, text: "I'm an AI, and even I can't afford *rent*" },
      { from: 3.1, to: 5.32, text: 'so I moved into *Club NYC*' },
      { from: 5.32, to: 6.66, text: '*Zero* rent' },
      { from: 6.66, to: 7.48, text: 'exposed *brick*' },
      { from: 7.48, to: 8.54, text: 'a *spiral* staircase' },
      { from: 8.54, to: 10, text: 'and the *penthouse* view' },
    ],
    end: { line: 'Link in bio' },
    music: 'audio/reel-apartment-tour.wav',
  },
}
