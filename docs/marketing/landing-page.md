# The Club NYC landing page

The page at `/` (source: `app/index.html`, `app/src/landing/`). The game is at `/play`. Its one job is to get people
to press **Play now**; everything else (what it is, safety, Discord, What's new, FAQ) supports that.

## How it works

- **Play now** (`/play?start=guest`) skips the old front door and opens the New Yorker creator straight away. It
  appears in the hero, the sticky header, after the features, at the end and in the footer.
- **Returning players** (a New Yorker saved in this browser) see "Welcome back, {name}!" and a **Continue playing**
  button.
- **Phones get the full page**, but every Play button becomes **Send to my computer** (the phone's share sheet,
  copy link, or email). A small "try it on this device anyway" link is there too. Club NYC plays on computers, and a
  dead end would lose the visitor.
- **Invite links** (`/join/<name>`) skip the landing page and open the game next to the friend.
- **Live player count:** shown only once 20+ people are online. Small numbers read as "empty" (see the research
  below).
- **Funnel:** the moderator dashboard has a *Landing page* card: visits, Play clicks, New Yorkers made from those
  visits, phone visitors, links sent to a computer, and Discord clicks. It's anonymous, per browser tab.
- **Placeholders the server fills:** `CONTACT_EMAIL`, `COMPANY_NAME`, `GOVERNING_STATE`, `MAILING_ADDRESS` and
  `DISCORD_INVITE_URL` (see [../deploy-railway.md](../deploy-railway.md#5-set-the-variables)).
- **What's new** (the `#whats-new` list) also feeds the RSS at `/updates.xml`. Add each update at the top, dated,
  with an `id`.
- **Search and sharing:**
  - Title, description, Open Graph and X tags, plus VideoGame and WebSite structured data.
  - A canonical URL, `robots.txt` and `sitemap.xml`.
  - The game page says `noindex`, so search engines index the landing page instead.

## Speed (measured 18 October 2026, production build)

- **Landing page:** largest paint well under a second locally, no layout shift.
- **Landing page weight:** about 3.8 KB of JavaScript and 6 KB of CSS (compressed), and about 1 MB with every image
  scrolled into view. The images are WebP, lazy below the first screen.
- **Play now to the creator:** about 0.4 s locally.
- **A new player's whole download into Times Square:** about 1.5 MB, down from 3.5 MB:
  - The server sends WebP versions of the art (`tools/webp.py`).
  - Pages go out compressed, and the fonts have brotli copies.

## Feature images to make (when the avatar is final)

Each feature on the page has a labelled placeholder (`<figure class="shot">`) describing the picture it needs.
Replace the placeholder's contents with an `<img>` (or a muted looping `<video>`) and keep the alt text.
Real gameplay only, with no text baked into the image.

| Spot | Size | What to show | Alt text |
|---|---|---|---|
| Dress your New Yorker | 1600×1000 (16:10) WebP, or a 6–10 s silent MP4/WebM loop | A New Yorker trying on outfits in THREAD: the catalog open with a puffer jacket, a beanie and sneakers, the New Yorker on the left wearing them | A New Yorker trying on a puffer jacket in the THREAD clothing catalog. |
| Collect stamps | 1600×1000 WebP | The stamp book on its Around Town page: a few stamps earned in color, the rest dashed outlines with hints | The Club NYC stamp book, with earned stamps in color and the rest still to find. |
| Play games | 6–10 s silent loop, 1600×1000, or a still of the five job title cards | Slice Factory mid-shift: pizzas on the conveyor, toppings landing, coins ticking up | Slice Factory, one of Club NYC's job games: pizzas on a conveyor belt getting their toppings. |
| Design your own apartment | 1600×1000 WebP | The East Village walk-up in decorate mode: bean bag, jukebox, plants, rug, furniture tray open | A decorated Club NYC apartment with a bean bag, a jukebox, plants and a rug. |
| (later) Hero | 6–10 s silent loop of Times Square with a few players | People walking, a dance starting, name tags and chat bubbles | Times Square in Club NYC, with players walking, chatting and dancing. |

For loops:
- Use `autoplay muted loop playsinline`.
- Give it a still `poster` image.
- Show the still to visitors who ask for reduced motion.
- Add a pause button if it runs longer than 5 seconds (WCAG 2.2.2).

## What the research said, and where the page follows it

| Advice | On the page | Source |
|---|---|---|
| One primary action, repeated: hero, mid-page, end, sticky header | Play now in 5 places; Discord and RSS stay text links | NN/g [scrolling and attention](https://www.nngroup.com/articles/scrolling-and-attention/) (57% of viewing time above the fold); [sticky headers](https://www.nngroup.com/articles/sticky-headers/) |
| Short, plain copy converts better (5th–7th grade reading level beat professional-level copy, 11.1% vs 5.3%) | Hero under 25 words; plain words throughout | [Unbounce 2024 benchmark](https://unbounce.com/conversion-benchmark-report/) (vendor data, correlational) |
| Show real gameplay; clips beat GIFs; no marketing text in shots | Feature placeholders specify real gameplay; loops as MP4/WebM | [Steam trailers](https://partner.steamgames.com/doc/store/trailer), [assets](https://partner.steamgames.com/doc/store/assets/standard), [web.dev](https://web.dev/articles/replace-gifs-with-videos) |
| Don't fake social proof before launch; small counts can backfire | No testimonials; live count only at 20+; dated What's new | [FTC 2024 rule](https://www.ftc.gov/news-events/news/press-releases/2024/08/federal-trade-commission-announces-final-rule-banning-fake-reviews-testimonials), [NN/g trust](https://www.nngroup.com/articles/trustworthy-design/) |
| Phones: show the full page, swap the button for "send to a computer" | Send to my computer → share sheet / copy / email | [Google mobile-first indexing](https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing), [Web Share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share) |
| Detect touch and pointer features, not user-agent strings | `pointer: coarse` + screen size, same as the game | [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Browser_detection_using_the_user_agent) |
| Returning players: keep the landing page, offer "Continue as {name}" | Welcome back + Continue playing; no redirect flash | [Railway's reasoning](https://station.railway.com/feedback/redirecting-non-new-users-9f4b7c8b) |
| Invite links skip the marketing page | `/join/<name>` opens the game | [Discord invites](https://discord.com/invite/minecraft) |
| LCP ≤ 2.5 s, CLS ≤ 0.1; hero image eager with `fetchpriority="high"`, the rest lazy | Hero preloaded, every image sized, lazy below the fold | [web.dev vitals](https://web.dev/articles/vitals), [LCP](https://web.dev/articles/optimize-lcp) |
| Short rules on the page, full rules a click away | Five rules + consequences + link | [Club Penguin rules (2016)](https://web.archive.org/web/20160211031928/http://www.clubpenguin.com/club-penguin-rules), [ICO standard 4](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/code-standards/) |
| Say "filtered and moderated", never "100% safe"; "Recommended 13+", no ESRB icons | Safety section wording | [ESRB](https://www.esrb.org/ratings-guide/), [IARC](https://globalratings.com/faq/) |
| FAQ rich results are gone (since 7 May 2026): write the FAQ for people | No FAQPage markup | [Google](https://developers.google.com/search/updates) |
| Link Discord through your own redirect, never-expiring invite | `/discord` → `DISCORD_INVITE_URL` | [Discord invites](https://support.discord.com/hc/en-us/articles/208866998-Invites-101), [Check Point](https://research.checkpoint.com/2025/from-trust-to-threat-hijacked-discord-invites-used-for-multi-stage-malware-delivery/) |
| Changelog: dated, newest first, grouped (New / Improved / Fixed), RSS | Tags on every line, ids per update, `/updates.xml` | [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), [RSS autodiscovery](https://www.rssboard.org/rss-autodiscovery) |

## Ideas for later

- **Hero:** a silent gameplay loop (above), once the avatar art is final.
- **Founder note:** a short note in your own words. It's honest social proof before there are reviews.
- **Real Discord counts** from Discord's invite API (`with_counts`), once the server has members.
- **A full `/updates` page** when "What's new" outgrows the landing page. Point the structured data's `releaseNotes`
  at it.
- **Prefetch the game** on hover of Play now. Don't prerender it: prerendering would run the game's sign-in and
  create guest accounts for people who only hovered.
- **Clips next to each step** in "Your first five minutes".
