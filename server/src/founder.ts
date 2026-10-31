/**
 * Mayank's own posts for LinkedIn and X: five each, from the waitlist to opening day, with three behind-the-scenes
 * posts in between. Shown in Launch HQ → Content → Founder posts, to copy and post by hand (these go out from a
 * personal account, so nothing here is posted automatically).
 *
 * Every number is true as written (sources: docs/launch/load-test-report.md, tools/instagram/schedule.json,
 * server/src/journeys.ts, the git history, docs/art-pipeline.md). Re-check anything marked in `check` before posting.
 * House rules: no em dashes, "Club Penguin" only with the not-affiliated line, the AI art said plainly.
 */
export type FounderPost = {
  id: string
  network: 'linkedin' | 'x'
  n: number
  title: string
  /** suggested date and time, New York */
  when: string
  goal: string
  /** a LinkedIn post, or one tweet */
  text?: string
  /** an X thread, one tweet per entry */
  thread?: string[]
  /** what to attach: rendered files (video/out/…) shown in Launch HQ */
  media: { file: string; label: string }[]
  tip: string
  check?: string
}

const SITE = 'playclubnyc.com'

export const FOUNDER: { intro: string; trailer: string[]; posts: FounderPost[] } = {
  intro: 'Five posts each for LinkedIn and X, in your voice, from the waitlist to opening day. Copy, attach the files shown, post. Nothing here goes out by itself.',
  // which film goes with which post, and why
  trailer: [
    'For the waitlist: the story film “Same crew. Bigger city.” (19 s, vertical). It sells the feeling, not the features, and it works on phones, where most people scroll both apps.',
    'For opening day: the full trailer (the group chat and the taxi, 16:9). It shows the game itself, and on desktop, where people can actually play it.',
    'Upload the video file itself to LinkedIn and X; never a YouTube link. Both apps push native video and quietly bury outside links.',
  ],
  posts: [
    // ---------- LinkedIn ----------
    {
      id: 'li-waitlist', network: 'linkedin', n: 1, title: 'The waitlist is open', when: 'Fri Oct 30, 9:00 ET',
      goal: 'Sign-ups: claim a name before the city opens',
      text: `I built a city.

Not a real one. New York rent is already doing enough.

Club NYC is a free online game where you and your friends move to a cartoon Manhattan. You make a New Yorker, get a job folding pizza or running a halal cart, and get an apartment on day one. The rent is zero. The radiator still clanks.

Why? Because the group chat says “we should all hang out more” about once a month, and then nobody does. A lot of us grew up hanging out after school in an online world with our friends. We grew up. The friends moved to other cities. I wanted that place back, just older, and in New York.

The city opens on Tuesday, November 17 at 10:00 ET.

Until then you can claim your name, so nobody else gets it. Bring your group chat.

The link is in the first comment.

#buildinpublic #indiegame #newyorkcity`,
      media: [{ file: 'video/out/reels/club-nyc-reel-move-to-ny.mp4', label: 'Story film, 19 s' }],
      tip: `Put ${SITE} in the first comment, not the post: LinkedIn shows posts with outside links to fewer people. Answer every comment in the first hour.`,
    },
    {
      id: 'li-build', network: 'linkedin', n: 2, title: 'How I built it', when: 'Tue Nov 3, 8:30 ET',
      goal: 'Reach builders and press; trust through honesty',
      text: `I'm a team of one, and I built a multiplayer game.

People keep asking how, so here's the honest version.

The code: every one of the commits in this project was written with Claude Code, an AI coding agent. I decide what the game is, how it should feel and what's good enough. It writes, tests and fixes. My job turned into product manager, art director and very picky QA.

The art: every room is generated with an AI image model, then every clickable object is traced (with Meta's SAM 2) so the hover outline follows its real shape and your character walks around the street carts, not through them. I'm saying this up front because you should know, and because the tracing is the part nobody sees and I'm proud of anyway.

What AI didn't do: decide that the bodega cat is the most important character in the game. That was me.

What I learned:
→ Taste is the bottleneck now. Building is cheap; deciding is not.
→ Write the rules down. “No em dashes, no fake scarcity, the rent is always 0.” The agent follows them better than I do.
→ Test like a stranger. The bugs live in the clicks you'd never make.

Club NYC opens November 17. Waitlist in the comments.

#AI #buildinpublic #gamedev`,
      media: [{ file: 'video/out/posts/founder-wip/01.jpg', label: 'Work in progress: the art pipeline' }, { file: 'video/out/posts/founder-wip/02.jpg', label: 'Work in progress: the traced objects' }],
      tip: 'This one gets the most argument in the comments (AI art). Reply calmly and with facts; arguments are reach. Pin the waitlist comment.',
      check: '“A team of one” is true, and you are comfortable naming Claude Code and saying the art is AI-generated in public (the press kit says to own it early).',
    },
    {
      id: 'li-hq', network: 'linkedin', n: 3, title: 'How I’m running the launch', when: 'Fri Nov 6, 9:00 ET',
      goal: 'Founders and marketers; show the machine',
      text: `A launch is mostly logistics wearing a party hat.

So before building anything flashy, I built myself a control room. I call it Launch HQ. It's one page with seven sections:

1. Today: what needs me, and nothing else
2. Launch: the countdown, the checklist and the open switch
3. Content: 120 Instagram posts planned over 60 days, each one waiting for my approval
4. Emails: 18 emails in 6 journeys, each with a preview
5. People: how many New Yorkers, and where the sign-ups come from
6. Safety: reports, chat, moderation
7. Controls: the city, live

My favorite part is the switch. At 10:00 ET on November 17, the city opens by itself. The waitlist email goes out in batches, everyone who got in early gets a Founder badge, and I don't have to be awake for it. (I will be. Obviously.)

The lesson: decide everything you can before launch day, so on launch day you only have to decide the things you couldn't have.

#launch #startups #buildinpublic`,
      media: [{ file: 'video/out/posts/founder-hq/01.jpg', label: 'Launch HQ: the switch that opens the city' }, { file: 'video/out/posts/founder-hq/02.jpg', label: 'Launch HQ: the content calendar' }, { file: 'video/out/posts/founder-hq/03.jpg', label: 'Launch HQ: the Instagram feed preview' }],
      tip: 'Carousel-style: attach the three screenshots in order. Blur nothing; there are no player emails in them.',
    },
    {
      id: 'li-stress', network: 'linkedin', n: 4, title: 'I tried to break my own game', when: 'Thu Nov 12, 8:30 ET',
      goal: 'Credibility before opening day; engineers',
      text: `I tried to break my own game.

On purpose. Before strangers do it for free.

I sent bots into Club NYC that do what people do: sign up, walk, chat, dance, visit apartments, change rooms. Several times busier than a person.

What held:
→ 1,000 simulated players at once: 5 ms per update (the budget is 66 ms), 0 errors, 0 players dropped
→ 3,000 players: 12 ms, still 0 errors
→ I killed the server mid-game. 300 players were back in about 1 second

(Measured on my laptop, so read it as headroom, not a promise.)

What broke:
→ You could “visit” apartments that didn't exist, and one connection could create about 90,000 empty rooms an hour. Fixed.
→ A 50 MB upload went into memory before being refused. Now it's refused at the door.

None of that is glamorous. All of it is the difference between “we're open!” and “we're down!”

The city opens Tuesday at 10:00 ET.

#engineering #buildinpublic #gamedev`,
      media: [{ file: 'video/out/posts/founder-wip/03.jpg', label: 'A flash mob in Central Park' }],
      tip: 'Engineers share numbers. Keep the numbers exactly as written: they are from the load test report, measured on a laptop, which the post doesn’t overclaim.',
    },
    {
      id: 'li-open', network: 'linkedin', n: 5, title: 'We’re open', when: 'Tue Nov 17, 10:05 ET',
      goal: 'Players: play now, bring friends',
      text: `Club NYC is open.

As of 10:00 this morning, anyone can move to New York for free. No download, no rent, no broker.

Here's what to do on your first day:
→ Make your New Yorker
→ Get a job. Bagel Counters pays best. The bagels are not optional
→ Send your invite link to your group chat. It drops them right next to you
→ Be in Times Square for the Dance Jam. It starts every 8 minutes

It's built for a computer with a mouse, so open it on your laptop tonight.

To everyone who claimed a name: it's waiting for you. Thank you for being here before there was a here.

Link in the first comment. Come say hi; I'll be the one at the bagel counter.

Not affiliated with Disney or Club Penguin.

#indiegame #newyorkcity #launch`,
      media: [{ file: 'video/out/club-nyc-trailer.mp4', label: 'The trailer' }],
      tip: 'Post at 10:05, after the switch flips and you’ve checked the city is open. Reply to everyone for the first two hours; LinkedIn rewards a busy comment section.',
      check: 'The trailer shows the I ♥ NY souvenir sign in Times Square. Fine if the IP review clears it; otherwise use the story film instead.',
    },
    // ---------- X ----------
    {
      id: 'x-waitlist', network: 'x', n: 1, title: 'The waitlist is open', when: 'Fri Oct 30, 12:00 ET',
      goal: 'Sign-ups; the quote-tweetable hook',
      thread: [
        `the penguin game generation grew up and now we can't afford new york

so i built us a free one

Club NYC opens nov 17. claim your name before someone else does 👇`,
        `you make a new yorker, get a job folding pizza, and move into an apartment on day one

rent: 0 coins
roommate: a pigeon
the radiator: clanks, for realism`,
        `bring the group chat. your invite link drops them right next to you

${SITE}`,
      ],
      media: [{ file: 'video/out/reels/club-nyc-reel-move-to-ny.mp4', label: 'Story film, 19 s (on the first tweet)' }],
      tip: 'Video on the first tweet, the link only in the last one: X shows posts with links to fewer people. Pin this thread to your profile until launch.',
    },
    {
      id: 'x-build', network: 'x', n: 2, title: 'How I built it', when: 'Tue Nov 3, 12:00 ET',
      goal: 'Builder Twitter; replies',
      thread: [
        `i built a multiplayer game solo

every commit was written with an AI coding agent. every room was generated with an AI image model

here's what that actually looked like 🧵`,
        `the code: i decide what it is, how it feels, and what "done" means. claude code writes it, tests it, fixes it

my job is now product manager, art director and the world's pickiest QA`,
        `the art: AI image model for the rooms, then SAM 2 traces every clickable object so the hover outline is the real shape

and you walk around the street carts, not through them. small thing. took forever`,
        `biggest lesson: taste is the bottleneck now

building is cheap. deciding is not`,
        `it opens nov 17. it's a cartoon new york where the rent is 0

${SITE}`,
      ],
      media: [{ file: 'video/out/posts/founder-wip/01.jpg', label: 'The art pipeline (tweet 3)' }, { file: 'video/out/posts/founder-wip/02.jpg', label: 'Traced objects (tweet 3)' }],
      tip: 'Expect “AI slop” replies. Answer with specifics (what you traced, what you decided), never defensively.',
      check: 'Same as the LinkedIn version: “solo” is true, and you are comfortable saying the code and art are made with AI.',
    },
    {
      id: 'x-hq', network: 'x', n: 3, title: 'The launch control room', when: 'Fri Nov 6, 12:00 ET',
      goal: 'Founder Twitter; bookmarks',
      thread: [
        `i built a control room for my game launch before i built the launch

one page. 120 instagram posts waiting for approval, 18 emails, the countdown, and a switch that opens the city by itself at 10:00 on nov 17`,
        `the switch is my favorite part

at 10:00 et the waitlist email goes out in batches and early players get a founder badge. no deploy, nobody has to be awake

(i will be awake)`,
        `it even previews the instagram grid on a phone, so i can see which posts get cropped before they go out

turns out a few of them do`,
        `decide everything you can before launch day. then launch day is just a party

${SITE}`,
      ],
      media: [{ file: 'video/out/posts/founder-hq/01.jpg', label: 'The switch (tweet 1)' }, { file: 'video/out/posts/founder-hq/03.jpg', label: 'The feed preview (tweet 3)' }],
      tip: 'Screenshots get bookmarked; bookmarks count. Reply to “what did you build it with?” with the build thread.',
    },
    {
      id: 'x-stress', network: 'x', n: 4, title: 'I tried to break it', when: 'Thu Nov 12, 12:00 ET',
      goal: 'Credibility; engineers',
      thread: [
        `tried to break my own game before strangers do it for free

1,000 bots at once: 5ms per tick, 0 errors
3,000: 12ms, still 0
killed the server mid-game: everyone back in ~1 second`,
        `what broke: you could visit apartments that didn't exist. one connection could spawn ~90k empty rooms an hour

fixed. the city has a housing shortage now, like a real one`,
        `opens tuesday 10:00 et

${SITE}`,
      ],
      media: [{ file: 'video/out/posts/founder-wip/03.jpg', label: 'A flash mob in Central Park' }],
      tip: 'Quote-tweet it on launch morning: “ok it’s real now.”',
    },
    {
      id: 'x-open', network: 'x', n: 5, title: 'We’re open', when: 'Tue Nov 17, 10:01 ET',
      goal: 'Players, right now',
      thread: [
        `club nyc is open

free. no download. no rent. bring your group chat 🗽`,
        `first day checklist:
→ make your new yorker
→ get a job (bagels pay best. respect the bagel)
→ send your invite link to the group chat
→ times square at the dance jam, every 8 minutes`,
        `laptop recommended. it's a whole city

${SITE}`,
      ],
      media: [{ file: 'video/out/club-nyc-trailer.mp4', label: 'The trailer (on the first tweet)' }],
      tip: 'Post the second the city is open, then reply to your own pinned waitlist thread: “it’s open.” Everyone who liked it gets nudged.',
      check: 'The trailer shows the I ♥ NY souvenir sign in Times Square. Fine if the IP review clears it; otherwise use the story film instead.',
    },
  ],
}
