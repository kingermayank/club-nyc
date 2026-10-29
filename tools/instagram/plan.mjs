// The 60-day Instagram plan (Oct 29 to Dec 27, 2026): two posts a day, built from recurring series so each new post is
// a data entry in the video pipeline (video/src/reels.ts, posts.ts), not a new edit. No AI people or real people yet.
// make-schedule.mjs turns this into schedule.json; Launch HQ shows it; the publisher posts what's approved.
//
// Slots (New York time): A 12:00 is the reach slot (mostly reels, new people); B 19:00 is the community slot
// (carousels, singles, event reels an hour before the evening's event).
// asset: an id the publisher knows (already rendered), or 'make:<id>' with a production note (what to build it from).

export const PHASES = [
  { id: 'teaser', name: 'Teaser', from: '2026-10-29', to: '2026-11-09', ask: 'Follow, and claim your name on the waitlist' },
  { id: 'preview', name: 'Founders’ Preview', from: '2026-11-10', to: '2026-11-16', ask: 'Get an invite; see real players' },
  { id: 'launch', name: 'Launch week', from: '2026-11-17', to: '2026-11-23', ask: 'Come tonight, bring your friends' },
  { id: 'settle', name: 'First weeks', from: '2026-11-24', to: '2026-12-06', ask: 'Come back for this week’s thing' },
  { id: 'winter', name: 'Winter in the city', from: '2026-12-07', to: '2026-12-27', ask: 'Bring the people you’re home with' },
]

export const SERIES = {
  GRW: { name: 'The penguin game grew up', format: 'Reel', tags: '#nostalgia #nyc', cta: 'Claim your name: link in bio.', why: 'The scroll-stopper for anyone who grew up on penguin chat' },
  TOUR: { name: 'Manhattan in ten seconds', format: 'Reel', tags: '#nyc #manhattan', cta: 'Which one first? Comment it.', why: 'Saves and replays; shows the size of the city' },
  POV: { name: 'POV: a day in Manhattan', format: 'Reel', tags: '#dayinmylife #nyc', cta: 'Tag the friend this is.', why: 'The most native reel format there is' },
  TOT: { name: 'This or that', format: 'Reel', tags: '#thisorthat #nyc', cta: 'Pick one. Comment it.', why: 'Comment bait that’s actually fun' },
  TRL: { name: 'The Trailer', format: 'Reel', tags: '#trailer #nyc', cta: 'Send this to the friend who’d take this job.', why: 'Mock-epic for tiny jobs: built to be sent' },
  JOB: { name: 'Job of the Week', format: 'Reel', tags: '#nycjobs #cozygames', cta: 'Think you can beat it? Link in bio.', why: 'Weekly reason to come back; real leaderboard numbers' },
  BOARD: { name: 'Leaderboard', format: 'Carousel', tags: '#leaderboard #cozygames', cta: 'Resets Monday.', why: 'Real numbers, real names (with permission)' },
  APT: { name: 'Apartment tours', format: 'Reel', tags: '#apartmenttour #nycapartment', cta: 'No broker fee. Link in bio.', why: 'NYC rent is the joke everyone shares' },
  MOB: { name: 'Flash mobs & Dance Jams', format: 'Reel', tags: '#flashmob #nyc', cta: 'Tonight at 8. Bring someone.', why: 'Live moments: posted before the event, so a send means “come now”' },
  GLOS: { name: 'How to speak New Yorker', format: 'Carousel', tags: '#newyorker #nycslang', cta: 'Which word did we miss?', why: 'Saves; comments write the next part' },
  GUIDE: { name: 'City guides', format: 'Carousel', tags: '#nycguide #manhattan', cta: 'Save it for your first visit (real or not).', why: 'Useful, true, slightly ridiculous: the save button' },
  TIMES: { name: 'This week in the city', format: 'Carousel', tags: '#nyc #news', cta: 'A new paper every week, in the game.', why: 'Weekly ritual; mirrors the in-game paper' },
  QUIZ: { name: 'Quizzes', format: 'Carousel', tags: '#quiz #nyc', cta: 'Comment yours.', why: 'Identity posts people share to Stories' },
  LOCAL: { name: 'Locals say', format: 'Single', tags: '#nyc #newyorkers', cta: 'Send it to someone who says this.', why: 'One deadpan line; shares and Stories reposts' },
  META: { name: 'Behind the city', format: 'Reel', tags: '#gamedev #indiegame', cta: 'Follow to see what we build next.', why: 'Honest making-of (the art is AI-assisted: we say so)' },
  UGC: { name: 'You built this', format: 'Reel', tags: '#cozygames #nyc', cta: 'Tag us with a Photo Booth snap.', why: 'Real players’ clips, shared with permission (after launch)' },
  NUM: { name: 'Honestly, in numbers', format: 'Carousel', tags: '#buildinpublic', cta: 'What should we fix next?', why: 'Real numbers only; trust is the brand' },
  LAUNCH: { name: 'Launch', format: 'Reel', tags: '#launch #nyc', cta: 'Link in bio.', why: 'The doors opening' },
  HOL: { name: 'Winter in the city', format: 'Reel', tags: '#winter #nyc', cta: 'Bring the people you’re home with.', why: 'Seasonal, without seasonal art we don’t have' },
  MEME: { name: 'Memes', format: 'Single', tags: '#nycmemes #newyorkcity', cta: 'Send this to someone who gets it.', why: 'Sends: a meme in our own art gets forwarded more than anything polished' },
  NEWS: { name: 'New in the city', format: 'Carousel', tags: '#update #cozygames', cta: 'Link in bio.', why: 'Every feature that ships gets a post' },
}

// [date, slot, series, title, hook, asset]
const rows = [
  // ---- teaser
  ['2026-10-29', 'A', 'GRW', 'The penguin game grew up', 'POV: the penguin game you played after school grew up', 'grew-up-tall'],
  ['2026-10-29', 'B', 'GLOS', 'How to speak New Yorker', 'How to speak New Yorker', 'speak-new-yorker'],
  ['2026-10-30', 'A', 'TOUR', 'Manhattan in ten seconds', 'Manhattan in ten seconds', 'tour-tall'],
  ['2026-10-30', 'B', 'LOCAL', 'Fold it. Always fold it.', 'Fold it. Always fold it.', 'fold-it'],
  ['2026-10-31', 'A', 'TOT', 'Pick one. Comment it', 'Central Park or the High Line?', 'this-or-that'],
  ['2026-10-31', 'B', 'QUIZ', 'Pick your colour', 'Your New Yorker wears one of 14 colours', 'colour-grid'],
  ['2026-11-01', 'A', 'POV', 'A morning in Manhattan', 'POV: a morning in Manhattan', 'pov-morning'],
  ['2026-11-01', 'B', 'GUIDE', 'Your first day in Manhattan', 'Your first day in Manhattan, in six stops', 'first-day'],
  ['2026-11-02', 'A', 'TRL', 'Halal Rush: the trailer', 'In a city of 8 million people, one New Yorker had one job', 'halal-trailer'],
  ['2026-11-02', 'B', 'LOCAL', 'Tag the friend who’d wait in this line', 'Tag the friend who would wait in this line', 'tag-the-line'],
  ['2026-11-03', 'A', 'APT', 'Apartment tour, no broker fee', 'Touring apartments in Manhattan. No broker fee', 'apartment-tour'],
  ['2026-11-03', 'B', 'MEME', 'What I pictured vs what I got', 'Moving to New York: what I pictured, what I got', 'meme-pictured'],
  ['2026-11-04', 'A', 'GRW', 'Trial: the window version', 'Same hook, in a window (Trial Reel: full screen vs window)', 'grew-up'],
  ['2026-11-04', 'B', 'QUIZ', 'Which New Yorker are you?', 'Which New Yorker are you? Pick your colour', 'which-new-yorker'],
  ['2026-11-05', 'A', 'JOB', 'Five jobs. Zero rent', 'Five jobs. Zero rent', 'jobs-stack'],
  ['2026-11-05', 'B', 'LOCAL', 'Now hiring: five jobs, no interview', 'Now hiring: five jobs, no interview', 'now-hiring'],
  ['2026-11-06', 'A', 'MOB', 'Start a flash mob', 'Start dancing in Central Park', 'flash-mob'],
  ['2026-11-06', 'B', 'GUIDE', 'Things that are free in Club NYC', 'Things that are free in Club NYC', 'free-in-club'],
  ['2026-11-07', 'A', 'GRW', 'For the friend who moved away', 'For the friend who moved away', 'moved-away'],
  ['2026-11-07', 'B', 'TIMES', 'This week in the city #1', 'This week in the city', 'city-news'],
  ['2026-11-08', 'A', 'META', 'How we drew Manhattan', 'We drew Manhattan. With help', 'make:bts-drawing | reel: raw art → room in game, 3 rooms; says AI-assisted in line one'],
  ['2026-11-08', 'B', 'LOCAL', 'Local resident. Has opinions.', 'Local resident. Has opinions.', 'pigeon'],
  ['2026-11-09', 'A', 'TOUR', 'Downtown in ten seconds', 'Downtown in ten seconds', 'make:tour-downtown | portrait reel: wall-street, battery-park, liberty, brooklyn-bridge, one-world-trade (capture tall: battery-park, one-world-trade)'],
  ['2026-11-09', 'B', 'GUIDE', 'How to eat a slice', 'How to eat a slice like a New Yorker', 'fold-a-slice'],
  // ---- founders' preview
  ['2026-11-10', 'A', 'LAUNCH', 'The Founders’ Preview is open', 'The Founders’ Preview is open', 'make:trailer-tall | the launch trailer recut 9:16 (stack/tall crops of its shots), end card "Preview open"'],
  ['2026-11-10', 'B', 'QUIZ', 'Where would you live?', 'Where would you live? Comment your neighbourhood', 'where-live'],
  ['2026-11-11', 'A', 'TRL', 'Ferry Captain: the trailer', 'One captain. One ferry. 400 tourists', 'make:epic-ferry | EpicReel shots from job-ferry-captain.mp4'],
  ['2026-11-11', 'B', 'GLOS', 'How to speak New Yorker, part 2', 'Part 2: schlep, regular coffee, the stoop, a BEC', 'make:speak-2 | posts.ts glossary, 6 words'],
  ['2026-11-12', 'A', 'POV', 'POV: your first night out', 'POV: your first night out in Manhattan', 'make:pov-night | tall clips: broadway, penthouse, sky-deck, empire-deck (sunset art)'],
  ['2026-11-12', 'B', 'MEME', 'The new New Yorker starter pack', 'The new New Yorker starter pack', 'meme-starter'],
  ['2026-11-13', 'A', 'TOT', 'This or that: food edition', 'Pizza or bagels? Halal or coffee?', 'make:tot-food | stack: game-slice/bagel, halal/coffee tall clips'],
  ['2026-11-13', 'B', 'GUIDE', 'Subway etiquette', 'Subway etiquette, a short guide', 'make:subway-rules | carousel over subway art'],
  ['2026-11-14', 'A', 'MOB', 'Live: walk the city with the founders', 'Live tonight: a walk through the city', 'manual:live | Instagram Live (not in the API)'],
  ['2026-11-14', 'B', 'TIMES', 'This week in the city #2', 'This week in the city', 'make:news-2 | posts.ts news, 5 headlines from the preview'],
  ['2026-11-15', 'A', 'LAUNCH', 'The city opens Nov 17', 'The city opens Tuesday, Nov 17', 'open-date'],
  ['2026-11-15', 'B', 'GUIDE', '20 places, one map', '20+ places you can walk into', 'make:places-map | carousel: map then 8 rooms'],
  ['2026-11-16', 'A', 'TRL', 'Bagel Counter: the trailer', 'They said it couldn’t be done. Before 9 AM', 'make:epic-bagel | EpicReel from job-bagel-counters.mp4'],
  ['2026-11-16', 'B', 'QUIZ', 'Pick your first job', 'Pick your first job', 'make:quiz-job | carousel, 5 jobs'],
  // ---- launch week
  ['2026-11-17', 'A', 'LAUNCH', 'It’s open. Bring your friends', 'It’s open. Bring your friends', 'make:launch-open | grew-up-tall recut, end card "Open now"; co-post with every seeded creator'],
  ['2026-11-17', 'B', 'MOB', 'Opening night Dance Jam', 'Opening night: Dance Jam at 8', 'dance-jam'],
  ['2026-11-18', 'A', 'UGC', 'Day one, by you', 'You built this in 24 hours', 'make:ugc-day1 | capture.py on the live server, tall crops, names with permission'],
  ['2026-11-18', 'B', 'GUIDE', 'Your first hour in Club NYC', 'Your first hour in Club NYC', 'make:first-hour | carousel: creator, Rosa, first job, apartment, Dance Jam'],
  ['2026-11-19', 'A', 'JOB', 'Job of the Week: Slice Factory', 'Job of the Week: Slice Factory', 'make:job-slice | portrait reel from job-slice-factory.mp4 + real top score'],
  ['2026-11-19', 'B', 'BOARD', 'Slice Factory leaderboard', 'This week’s top 5 pizza folders', 'make:board-slice | carousel, real numbers'],
  ['2026-11-20', 'A', 'APT', 'Rate my apartment: players edition', 'Rating your apartments (with permission)', 'make:apt-players | tall clips of 4 player homes'],
  ['2026-11-20', 'B', 'TIMES', 'This week in the city #3', 'Week one in the city', 'make:news-3'],
  ['2026-11-21', 'A', 'MOB', 'Flash mob tonight', 'A flash mob in Central Park. Tonight', 'make:mob-park | flash-mob recut with "Tonight 8 PM" chip'],
  ['2026-11-21', 'B', 'MEME', 'Nobody: pizza rat', 'Nobody: pizza rat at rush hour, carrying the whole slice', 'meme-pizza-rat'],
  ['2026-11-22', 'A', 'TOUR', 'Uptown in ten seconds', 'Uptown in ten seconds', 'make:tour-uptown | the-met, central-park, grand-central, rockefeller, empire-deck'],
  ['2026-11-22', 'B', 'NUM', 'Week one, honestly', 'Week one in real numbers', 'make:num-week1 | carousel from the dashboard, nothing rounded up'],
  ['2026-11-23', 'A', 'TRL', 'Showtime: the trailer', 'What time is it?', 'make:epic-showtime | EpicReel from job-showtime.mp4'],
  ['2026-11-23', 'B', 'MEME', 'The bodega cat', 'The bodega cat when you don’t buy anything', 'meme-bodega-cat'],
  // ---- first weeks
  ['2026-11-24', 'A', 'GRW', 'Home for the holidays?', 'Can’t make it home this week?', 'moved-away'],
  ['2026-11-24', 'B', 'GUIDE', 'How to host Friendsgiving in your apartment', 'Friendsgiving in your apartment: a host’s guide', 'make:host-guide | carousel: invite link, furniture, party, Dance Jam'],
  ['2026-11-25', 'A', 'POV', 'POV: hosting Friendsgiving', 'POV: hosting Friendsgiving in a Manhattan apartment', 'make:pov-party | tall clips in apartment/loft/penthouse with party'],
  ['2026-11-25', 'B', 'LOCAL', 'Who’s at your table?', 'Who’s at your table this year? Add yours', 'make:single-table'],
  ['2026-11-26', 'A', 'LOCAL', 'Thank you, New York', 'Thank you, New York. Go eat', 'make:single-thanks | poster over park art; no ask'],
  ['2026-11-26', 'B', 'LOCAL', 'The parade is in the city', 'The parade is in the city today', 'make:single-parade | parade news art (no real parade name)'],
  ['2026-11-27', 'A', 'JOB', 'Job of the Week: Halal Rush', 'Job of the Week: Halal Rush', 'make:job-halal | portrait reel from rush.mp4 + real top score'],
  ['2026-11-27', 'B', 'BOARD', 'Halal Rush leaderboard', 'This week’s fastest carts', 'make:board-halal'],
  ['2026-11-28', 'A', 'TOT', 'This or that: views', 'Observation deck or the sky deck?', 'make:tot-views | stack: empire-deck, sky-deck, penthouse, brooklyn-bridge'],
  ['2026-11-28', 'B', 'TIMES', 'This week in the city #4', 'This week in the city', 'make:news-4'],
  ['2026-11-29', 'A', 'META', 'How the bagel game works', 'How we made a bagel counter fun (we think)', 'make:bts-bagel | screen recording + reel frame'],
  ['2026-11-29', 'B', 'GLOS', 'How to speak New Yorker, part 3', 'Part 3: the words your super uses', 'make:speak-3'],
  ['2026-11-30', 'A', 'TRL', 'The Bike Dash: the trailer', 'One bike. One High Line. No brakes (there are brakes)', 'make:epic-bike | capture the bike dash mini-game (no sponsor names on screen)'],
  ['2026-11-30', 'B', 'MEME', 'Tell me you’re a New Yorker', '“It’s only 30 blocks. We can walk”', 'meme-walk'],
  ['2026-12-01', 'A', 'UGC', 'Your New Yorkers this week', 'Your New Yorkers this week', 'make:ugc-looks | creator stills shared with permission'],
  ['2026-12-01', 'B', 'GUIDE', 'Five things to do on a Tuesday night', 'Five things to do on a Tuesday night in Club NYC', 'make:guide-tuesday'],
  ['2026-12-02', 'A', 'APT', 'Loft or penthouse?', 'Loft or penthouse? Wrong answers only', 'make:apt-stack | stack: loft vs penthouse'],
  ['2026-12-02', 'B', 'MEME', 'The radiator, in October', 'Is the heat coming on soon? The radiator:', 'meme-radiator'],
  ['2026-12-03', 'A', 'JOB', 'Job of the Week: Ferry Captain', 'Job of the Week: Ferry Captain', 'make:job-ferry'],
  ['2026-12-03', 'B', 'BOARD', 'Ferry Captain leaderboard', 'This week’s best captains', 'make:board-ferry'],
  ['2026-12-04', 'A', 'MOB', 'Community night: the big Dance Jam', 'Saturday: the big Dance Jam in Central Park', 'make:mob-community | flash-mob recut, event card'],
  ['2026-12-04', 'B', 'TIMES', 'This week in the city #5', 'This week in the city', 'make:news-5'],
  ['2026-12-05', 'A', 'TOUR', 'Manhattan at sunset', 'Manhattan at sunset, in ten seconds', 'make:tour-sunset | empire-deck, sky-deck, penthouse, brooklyn-bridge, liberty'],
  ['2026-12-05', 'B', 'NEWS', 'New in the city', 'New this week in Club NYC', 'make:news-update | patch notes carousel'],
  ['2026-12-06', 'A', 'POV', 'POV: a lazy Sunday', 'POV: a lazy Sunday in Manhattan', 'make:pov-sunday | coffee, park, the met steps, apartment'],
  ['2026-12-06', 'B', 'MEME', 'My weekend', 'My weekend: the plan vs what happened', 'meme-weekend'],
  // ---- winter
  ['2026-12-07', 'A', 'HOL', 'Skating at the rink', 'Skating at the rink. Falling is part of it', 'make:hol-rink | tall clips at rockefeller rink'],
  ['2026-12-07', 'B', 'GUIDE', 'Winter in the city', 'Winter in the city: a guide', 'make:guide-winter'],
  ['2026-12-08', 'A', 'TRL', 'Rush Hour Run: the trailer', 'Three lanes. One train. Rush hour', 'make:epic-runner | capture Rush Hour Run'],
  ['2026-12-08', 'B', 'MEME', 'Arriving now', 'The sign says “arriving now.” The train, four minutes later', 'meme-train'],
  ['2026-12-09', 'A', 'TOT', 'This or that: winter', 'Hot chocolate or the rink?', 'make:tot-winter'],
  ['2026-12-09', 'B', 'GLOS', 'How to speak New Yorker, part 4', 'Part 4: winter words', 'make:speak-4'],
  ['2026-12-10', 'A', 'JOB', 'Job of the Week: Bagel Counter', 'Job of the Week: Bagel Counter', 'make:job-bagel'],
  ['2026-12-10', 'B', 'BOARD', 'Bagel Counter leaderboard', 'This week’s fastest bagel counters', 'make:board-bagel'],
  ['2026-12-11', 'A', 'UGC', 'Best apartments this month', 'Your best apartments this month', 'make:ugc-apts'],
  ['2026-12-11', 'B', 'TIMES', 'This week in the city #6', 'This week in the city', 'make:news-6'],
  ['2026-12-12', 'A', 'GRW', 'Remember waddling around after school?', 'Remember waddling around after school?', 'make:grew-up-v3 | new hook over grew-up-tall shots'],
  ['2026-12-12', 'B', 'QUIZ', 'Your New York holiday move', 'What’s your New York holiday move?', 'make:quiz-holiday'],
  ['2026-12-13', 'A', 'POV', 'POV: holiday lights downtown', 'POV: the holiday lights downtown', 'make:pov-lights | downtown tall clips (no store names)'],
  ['2026-12-13', 'B', 'MEME', 'Lines, ranked', 'New York lines, ranked by worth it. Wrong answers in the comments', 'meme-tier'],
  ['2026-12-14', 'A', 'MOB', 'Holiday flash mob at the rink', 'A flash mob on the ice. Tonight', 'make:mob-rink'],
  ['2026-12-14', 'B', 'GUIDE', 'Gifts that cost zero coins', 'Gifts that cost zero coins', 'make:guide-gifts'],
  ['2026-12-15', 'A', 'META', 'One month in: what we fixed', 'One month in: what you told us, what we fixed', 'make:bts-month'],
  ['2026-12-15', 'B', 'NUM', 'One month, honestly', 'One month in real numbers', 'make:num-month'],
  ['2026-12-16', 'A', 'APT', 'Decorating for the holidays', 'Decorating a Manhattan apartment for the holidays', 'make:apt-decor'],
  ['2026-12-16', 'B', 'LOCAL', 'The elevator is out. Again.', 'The elevator is out. Again.', 'elevator'],
  ['2026-12-17', 'A', 'JOB', 'Job of the Week: Showtime', 'Job of the Week: Showtime', 'make:job-showtime'],
  ['2026-12-17', 'B', 'BOARD', 'Showtime leaderboard', 'This week’s best performers', 'make:board-showtime'],
  ['2026-12-18', 'A', 'TOT', 'This or that: holiday edition', 'The rink or the deck? Pick one', 'make:tot-holiday'],
  ['2026-12-18', 'B', 'TIMES', 'This week in the city #7', 'This week in the city', 'make:news-7'],
  ['2026-12-19', 'A', 'TOUR', 'Manhattan at night in ten seconds', 'Manhattan at night, in ten seconds', 'make:tour-night'],
  ['2026-12-19', 'B', 'MEME', 'The group chat', 'The group chat: “we should all hang out more”', 'meme-group-chat'],
  ['2026-12-20', 'A', 'UGC', 'Your best photos this month', 'Your best Photo Booth snaps this month', 'make:ugc-photos'],
  ['2026-12-20', 'B', 'GUIDE', 'How to throw an apartment party', 'How to throw an apartment party', 'make:guide-party'],
  ['2026-12-21', 'A', 'POV', 'POV: the shortest day of the year', 'POV: it’s dark at 4:30', 'make:pov-shortest'],
  ['2026-12-21', 'B', 'LOCAL', 'It’s 4:30 PM and it’s dark', 'It’s 4:30 PM and it’s dark. We’re fine', 'make:single-dark'],
  ['2026-12-22', 'A', 'MOB', 'The last Dance Jam before the holidays', 'The last Dance Jam before the holidays', 'make:mob-holiday'],
  ['2026-12-22', 'B', 'GLOS', 'Holiday words, New York edition', 'Holiday words, New York edition', 'make:speak-5'],
  ['2026-12-23', 'A', 'GRW', 'For the friend who’s home for the holidays', 'For the friend who’s home for the holidays', 'make:moved-away-holiday | moved-away recut, new hook'],
  ['2026-12-23', 'B', 'GUIDE', 'Bring your cousin into the city', 'How to bring your cousin into the city', 'make:guide-cousin'],
  ['2026-12-24', 'A', 'HOL', 'Happy holidays from the city', 'Happy holidays from the city', 'make:hol-card | loop over landmarks'],
  ['2026-12-24', 'B', 'LOCAL', 'Closed for the holidays (not really)', 'Closed for the holidays (not really)', 'make:single-closed'],
  ['2026-12-25', 'A', 'HOL', 'Merry everything', 'Merry everything, New York', 'make:hol-merry'],
  ['2026-12-25', 'B', 'LOCAL', 'Leftovers, a New York tradition', 'Leftovers: a New York tradition', 'make:single-leftovers'],
  ['2026-12-26', 'A', 'TIMES', 'The year in the city', 'The year in the city', 'make:times-year | reel over the year’s clips'],
  ['2026-12-26', 'B', 'NUM', 'Club NYC in numbers, 2026', 'Club NYC in numbers, 2026', 'make:num-year'],
  ['2026-12-27', 'A', 'TRL', 'Next year in the city: the trailer', 'Next year in the city', 'make:epic-next | roadmap teaser'],
  ['2026-12-27', 'B', 'QUIZ', 'What should we build next?', 'What should we build next? Vote', 'make:quiz-next'],
]

// captions already written in the 30-day plan (kept), by asset
const WRITTEN = {
  'grew-up-tall': `It moved to Manhattan, takes the subway now and still dances. Claim your name before someone else does: link in bio.\n\nNot affiliated with Disney or Club Penguin.`,
  'halal-trailer': `Lunch. Is. Coming. A Club NYC job, rated E for extra white sauce.\n\nSend this to the friend who would wait in that line.`,
  'pov-morning': `7:02 AM to 8:00 PM. The train was not right there.\n\nTag the friend who is always late.`,
  'apartment-tour': `Exposed brick. A spiral staircase. A view. No broker fee. The elevator is out, though.`,
  'free-in-club': `And very not free in New York. Except the Staten Island Ferry. New York got that one right.`,
}

export const POSTS = rows.map(([date, slot, series, title, hook, asset]) => {
  const s = SERIES[series]
  const make = asset.startsWith('make:') ? asset.slice(5) : null
  const manual = asset.startsWith('manual:') ? asset.slice(7) : null
  const id = (make ?? manual ?? asset).split(' | ')[0]
  const note = (make ?? manual ?? '').split(' | ')[1] ?? ''
  const phase = PHASES.find((p) => date >= p.from && date <= p.to)?.id ?? 'winter'
  const caption = `${WRITTEN[id] ?? `${hook}. ${s.cta}`}\n\n${s.tags} #clubnyc`
  return { date, slot, time: slot === 'A' ? '12:00' : '19:00', series, seriesName: s.name, format: series === 'GRW' && title.startsWith('Trial') ? 'Trial' : s.format, title, hook, asset: id, make: !!make, manual: manual ? note || 'manual' : null, note, phase, caption }
})
