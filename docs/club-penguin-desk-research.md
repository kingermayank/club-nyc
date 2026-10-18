# Club Penguin desk research for Club NYC: the parts the team doesn't have yet

Scope: the things the team does not already know. Room list, map, art, mini-game list, catalogs, puffles, stamps, pins and parties are deliberately left out.
Key: **[S]** = stated by the source. **[U]** = uncertain: from memory or inference and not checked against a source this session. Verify before building on it.
Most sources are the Club Penguin Fandom wiki (fan-written, but detailed and usually dated), Wikipedia, and one long Lance Priebe interview in a 2023 book.

---

## 0. Ten things worth stealing (TL;DR)

1. **Onboarding was a 3-errand quest, not a lecture.** From Dec 2013, a named guide NPC (Tourdude) sent each new player to the Clothes Shop, the Pet Shop and their own igloo. Each visit gave an exclusive free item. Players who had logged in before the launch could never get those items. [S] https://clubpenguin.fandom.com/wiki/Introduction_to_Club_Penguin
2. **Name approval was a visible state.** Until a moderator approved it (target: within 2 days), a new penguin showed to everyone as `P` + its ID number, e.g. `P12345678`. [S] https://thatpenguingame.com/club-penguin-help/penguin-account/my-account/
3. **Chat used a whitelist, not a blacklist.** Typed words had to be on a list of about 300,000 approved words. A message with anything else was hidden from other players, and the sender wasn't told. Numbers couldn't be typed at all from July 2007. The limit was 48 characters. [S] https://clubpenguin.fandom.com/wiki/Filters , https://clubpenguin.fandom.com/wiki/Standard_Safe_Chat
4. **Parents picked the chat mode.** Ultimate Safe Chat meant menu phrases only. It was chosen at signup and changed later in Parent Tools. Some servers were menu-only for everyone. [S] https://clubpenguin.fandom.com/wiki/Ultimate_Safe_Chat
5. **Moderation was mostly people.** In May 2007, about 70 of 100 staff policed the game. The target was roughly one moderator per server, with 300 players per server. [S] https://en.wikipedia.org/wiki/Club_Penguin , https://clubpenguin.fandom.com/wiki/Server
6. **Kids were recruited as safety deputies.** After 30 days, a player could become a "Secret Agent" by passing a quiz. Duty #1 was reporting rule-breakers. Agents got a monthly coin paycheck (250, later 350 for EPF). [S] https://clubpenguin.fandom.com/wiki/Secret_Agent , https://clubpenguin.fandom.com/wiki/Coin
7. **The ban ladder was short and legible.** 24h for swearing, 72h for cheating, permanent after repeated severe bans. Lighter tools: warnings, mutes and kicks. [S] https://clubpenguin.fandom.com/wiki/Ban
8. **Fewer than 5% paid.** Over 95% played free, and subscriptions were the only revenue. There were no ads, on purpose. [S] (Priebe interview, see §6) ; https://bencuan.me/blog/clubpenguin/
9. **Coins paid about 10% of score, and 2x once you had all of a game's stamps.** That kept mastered games worth replaying. There was a soft cap of 1,000,000 coins. [S] https://clubpenguin.fandom.com/wiki/Coin
10. **Priebe designed it like a kids' activity magazine, not a game.** Something new every week, plus planned venues for gathering. Kids arranged to meet at school and then went online at the same times. [S] (Priebe interview, see §6)

---

## 1. New-player experience

### 1.1 Create-a-Penguin flow
- **Steps (late-era web flow):** pick a name → pick a color → set a password → enter an email (meant to be a **parent's** email) → agree to the rules/terms → activate through the emailed link. The order is confirmed by modern recreations (CP Journey copies the original: name, color, password, email, agree to terms). [S for the recreation; U that the original order matched exactly] https://templarscp.com/2025/10/16/club-penguin-journey-how-to-make-an-account/ , https://support.cpjourney.net/articles/getting-started ; on the parent email: https://tagn.wordpress.com/2010/07/13/we-learn-about-account-security-with-club-penguin/
- **Colors at creation:** a grid of about 15 swatches (Blue, Green, Pink, Black, Yellow, Dark Purple, Brown, Peach, Red, Orange, Dark Green, Light Blue, Lime Green, Aqua, Arctic White). You could change color later for **20 coins** at the Clothes Shop, even as a non-member. So the first choice was cheap to undo. [S] https://clubpenguin.fandom.com/wiki/Club_Penguin/Tutorial
- **Bot check on signup:** at some point the Create-a-Penguin page had a picture "security check" (pick the matching image, such as an igloo). It was not a text CAPTCHA. [S that it existed; U on the exact mechanic] https://clubpenguin.fandom.com/wiki/Igloo_Pin
- **Username rules:** at most **12 characters**. Latin letters, numbers and spaces only, no punctuation. Some words are blocked when you create the name. Early beta allowed 2-letter or all-number names; that was removed later. Real names and school names were rejected: "James1" was OK, "James Thompson" was not. [S] https://clubpenguin.fandom.com/wiki/Penguin_Names
- **Names were permanent.** You couldn't rename; you made a new penguin instead. [S] https://thatpenguingame.com/club-penguin-help/penguin-account/my-account/
- **Name approval:** until approved, other players saw `P########` (the penguin ID). Moderators aimed to review within **2 days**, and the official FAQ said to contact support after 3. From Sept 12, 2013, you saw the ID on top with your chosen name in parentheses underneath, visible only to you. If a name was rejected, a popup at next login asked you to pick a new one. [S] https://clubpenguin.fandom.com/wiki/Penguin_Names , https://thatpenguingame.com/club-penguin-help/penguin-account/my-account/
- **Starting money:** **500 coins**, originally 100. The CPIP beta test server gave 20,000. [S] https://clubpenguin.fandom.com/wiki/Coin
- **Parent account:** one parent email could hold many penguins. Parent Tools offered chat mode (Ultimate vs Standard), a play timer, a connection history (logins per day over the last 7 days, with total time), ban history, membership status and payment history. [S] https://clubpenguin.fandom.com/wiki/Parent_Tools

### 1.2 First login: server selection
- **Servers held 300 players** each, with about one moderator per server. They were named mostly after ski runs and snowy words (Abominable, Alpine, Avalanche, Belly Slide, Big Surf, Blizzard, Bunny Hill…). Servers were grouped by language (EN, PT, FR, ES, DE, RU), and **Ultimate Safe Chat servers** were marked separately. "Tea" was a popular menu-only server. [S] https://clubpenguin.fandom.com/wiki/Server , https://clubpenguin.fandom.com/wiki/List_of_servers , https://clubpenguin.fandom.com/wiki/Ultimate_Safe_Chat
- **Screen layout:** after CPIP (2008) the picker showed a short "Suggested Servers" list first, with a "More servers" option for the full list. [S that these two screens existed] https://clubpenguin.fandom.com/wiki/Server
- **Population and buddy indicators:** each server row showed a population meter (several bars, more filled = busier, "Full" at capacity). A small icon marked servers where you had online buddies. [U, from memory; the wiki gallery shows these screens but I didn't get the text] https://clubpenguin.fandom.com/wiki/Server
- **Full server:** you couldn't join a full server. A Tab-key glitch once let players sneak in, and it was patched. [S] https://clubpenguin.fandom.com/wiki/Server
- **Planned but never shipped:** "Server Jumping" (jump to a buddy on another server) was announced in 2011 and never built for the web game. "CPNext" would have replaced servers with automatic copies of each room "so the island never feels empty." It became the model for the 2015 app and Club Penguin Island. **This is relevant to Club NYC's one-shared-world decision.** [S] https://clubpenguin.fandom.com/wiki/Server

### 1.3 Tutorials across three eras
1. **Before June 2011:** a short overlay popup at first login explaining the basics. [S]
2. **June 27, 2011 to Nov 2013, the "Welcome Solo" room:** a private one-time room (a small clearing with pine trees and a lake). An orange penguin welcomed you and explained the toolbar; you could never return. [S] https://clubpenguin.fandom.com/wiki/Welcome_Solo
3. **Dec 19, 2013 onward, "Introduction to Club Penguin":** a quest on the map's quest tray (the only time that tray was ever used). Tourdude taught the map and coins, then sent you on three errands, each with an exclusive reward:
   - Clothes Shop → "The Insta-Hero" outfit
   - Pet Shop → Polka Puffle Hat
   - Your igloo → "Table for Two" furniture

   From 2015 he also briefly explained whatever party was running. [S] https://clubpenguin.fandom.com/wiki/Introduction_to_Club_Penguin , https://clubpenguin.fandom.com/wiki/Tourdude
- **Player Tour Guides (from Jan 26, 2007):** players with accounts 45 days or older could take an **8-question quiz (7 right to pass)** at the Ski Village Tour Booth. Passing earned a Tour Guide Hat. While wearing it, the Safe Chat menu gained Activities → "Give a tour," which posted a canned description of the current room. Guides were paid **250 coins/month**. [S] https://clubpenguin.fandom.com/wiki/Tour_guide , https://clubpenguin.fandom.com/wiki/Coin
- **Safety Quiz (Feb 6, 2014):** 6 questions (don't share your password, tell a parent, pick a name with no personal info, and so on). Passing earned the "Online Safety Sweater." Until a player finished it, the quiz icon temporarily replaced the moderator-badge icon. [S] https://clubpenguin.fandom.com/wiki/Safety_Quiz
- **Membership trial:** around 2013, new players sometimes got a 7-day free membership trial. [U, one fan blog line] https://clubpenguin.fandom.com/wiki/Blog:Blogs?page=75

### 1.4 How non-members met the paywall
- **Gated:** buying clothing; owning more than 2 puffles (members up to 75); member-only stamps; member areas and items at parties; most igloo types and furniture; opening your igloo on the public map. Non-members could still walk everywhere public, play the mini-games, earn coins, chat, add buddies, buy colors, and collect free party items and pins. [S] https://clubpenguin.fandom.com/wiki/Membership , https://clubpenguin.fandom.com/wiki/Map
- **How the gate felt:** a "non-member lock" icon on things you couldn't use, plus a popup when you tried to buy (2009, 2012 and 2013 versions exist). The kid could browse the whole catalog and only hit the wall at "Buy." [S that these existed; exact wording not captured] https://clubpenguin.fandom.com/wiki/Membership
- **Status signaling:** from Jan 19, 2009, members had a member badge on their player card. From Mar 2010 [U on the year] the badge had 5 levels by tenure: 0–179 days, 180–359, 360–539, 540–720, and 721+. Non-members had a plain star. [S] https://clubpenguin.fandom.com/wiki/Membership , https://clubpenguin.fandom.com/wiki/Player_card

---

## 2. Social mechanics

### 2.1 Chat
- **Two modes.** *Standard Safe Chat* let you type freely, through the filter. *Ultimate Safe Chat* meant menu phrases only. Typed-chat users could also use the menu. [S] https://clubpenguin.fandom.com/wiki/Ultimate_Safe_Chat
- **48-character limit.** Numbers blocked from the weekend before July 23, 2007. Apostrophes allowed, and the cap of 2 "!" or "?" lifted, on Apr 4–5, 2013. A "quick chat" phrase button for all players arrived Oct 28, 2011. [S] https://clubpenguin.fandom.com/wiki/Standard_Safe_Chat
- **The filter:**
  - The list held about **300,000 allowed words**; anything not on it was blocked. Priebe described it as approving a small share of phrases rather than banning bad ones.
  - Blocked messages were **silently dropped**: others saw nothing. That's why players asked "did it show?"
  - Some swears triggered an **instant automatic ban**.
  - "Creative" spellings were caught. Phone numbers, emails and even innocent words like "mom" were blocked.

  [S] https://clubpenguin.fandom.com/wiki/Filters , https://en.wikipedia.org/wiki/Club_Penguin
- **Safe Chat menu tree (top level):** Hello · Goodbye · Friend · Questions · Answers · Game · Activities · Grub! (anti-bullying lines like "Please go away," "Stop that!") · Hurray! · Yes · No · Ok · Party (swapped for each event). Each branch opened sub-menus of fixed phrases. Note that kids got a built-in, polite way to say "go away." [S] https://clubpenguin.fandom.com/wiki/List_of_Safe_Chat_Messages
- **Weakness:** a menu-only player could be asked "What's your puffle's name?" and have no way to answer. [S] https://clubpenguin.fandom.com/wiki/Ultimate_Safe_Chat
- **Speech bubbles:** bubbles appeared over the penguin and faded after a few seconds (about 5). [U, exact timing not sourced]
- **Private chat** was planned for 2013 and never shipped. [S] https://clubpenguin.fandom.com/wiki/Ultimate_Safe_Chat

### 2.2 Emotes and actions (keyboard)
- **Actions:**

  | Key | Action |
  |---|---|
  | D | Dance |
  | W | Wave |
  | S | Sit, facing the mouse; hold S and move the mouse to spin while seated |
  | J | Joke; the punchline appears about 3 seconds later |
  | T | Snowball: press T, then click where to throw |

  [S] https://clubpenguin.fandom.com/wiki/Actions
- **Emotes** were E followed by a second key:

  | Keys | Emote |
  |---|---|
  | E+1 | Laugh |
  | E+2 | Happy |
  | E+3 | Indifferent |
  | E+4 | Sad |
  | E+5 | Surprised |
  | E+6 | Tongue |
  | E+7 | Wink |
  | E+8 | Sick |
  | E+9 | Mad |
  | E+0 | Upset |
  | E+H | Heart |
  | E+F | Flower |
  | E+L | Shamrock |
  | E+P | Puffle |
  | E+Z | Pizza |
  | E+K | Cake |
  | E+C | Coffee |
  | E+O | Popcorn |
  | E+G | Game controller |
  | E+D | Sun |
  | E+N | Moon |
  | E+B | Light bulb |
  | E+M | Coin |
  | E+I | Igloo |
  | E+T | Toot |
  | E+S | Skull |

  "?" and "!" were single keys. The 2012 Holiday Party was the first to add party-only emotes. [S] https://clubpenguin.fandom.com/wiki/List_of_Emoticons
- **Outfit-triggered dances:** from Sept 12, 2013, the Action button glowed green when your outfit unlocked a special dance. That rewarded collecting and made it visible to others. [S] https://clubpenguin.fandom.com/wiki/Toolbar

### 2.3 Player card
- **Opening it:** click a penguin in the room or in the buddy list, or click your own icon in the toolbar. Players who "liked" your igloo could also be opened from the likes list. [S] https://clubpenguin.fandom.com/wiki/Player_card
- **Your own card:** your coins, a stamp-book button, and an inventory button. Click any worn item on the card to take it off. [S]
- **Someone else's card:** their coin count was hidden. Bottom icons, in order: add or remove friend · find (friends only) · visit igloo (friends only, or a member's opened igloo) · send postcard · view stamp book · ignore/unignore · report. [S]
- **Badge:** a star in the corner, or a member badge by tenure. [S]
- **Mascot cards:** most buttons were disabled. The "find" button became a **gift box** that gave the mascot's autographed background, and adding the mascot as a friend was instant. [S] https://clubpenguin.fandom.com/wiki/Player_card , https://clubpenguin.fandom.com/wiki/Autographed_Backgrounds
- **Layer order on the card, back to front:** background → body color → feet → body → neck → face → head → hand → pins and flags. [S] https://clubpenguin.fandom.com/wiki/Player_card

### 2.4 Buddies and Best Friends
- **Limit:** **500 friends**, originally 100. [S] https://clubpenguin.fandom.com/wiki/Friends_List
- **Sorting:** online friends were pinned to the top, the rest alphabetical. Offline friends showed with a dark shadow; the old version used a smiley for online and a mouthless face for offline. [S]
- **Requests:** from Oct 28, 2011 you could search any name, even offline players, and click "+ Add Friend" to send a request. At login you were told how many requests were waiting. [S]
- **Best Friends (from 2011–12):** a badge toggle on a friend pinned them to the top of the list. [S that it existed; U on the date]
- **"Find":** shown for online friends only, as a popup saying which room they were in. [S] Wording list: https://clubpenguin.fandom.com/wiki/Friends_List/Search_messages
- **Mascots:** you could search for them but not request them; they had to be met in person. They sat at the bottom of the list, couldn't be best friends, and couldn't be located. [S]

### 2.5 Postcards and mail
- **Cost:** **10 coins** each. Canned messages only: greetings, compliments, invitations. Invitations had a **"Go There!" button** that teleported you to the room. [S] https://clubpenguin.fandom.com/wiki/Postcard
- **Inbox:** capped at **50**. A full inbox blocked player mail but not system mail. [S]
- **System postcards** did a lot of retention work: party invites, paychecks, puffle-adopted, "hungry puffle," igloo-contest winner, "membership expires in 7 days." [S]
- **History:** introduced May 19, 2006. Before July 14, 2008, a smiley icon appeared top-left next to the newspaper; after, an envelope opened the "Penguin Mail" inbox. You could reply only if the sender was a buddy. [S]

### 2.6 Igloo visiting
- **Igloo list:** clicking the igloo icon on the map listed that server's opened igloos. Members opened theirs by clicking a **lock icon** inside it (since Dec 20, 2005). That feature existed because kids had been adding strangers as buddies just to visit igloos. [S] https://clubpenguin.fandom.com/wiki/Igloo , https://clubpenguin.fandom.com/wiki/Map
- **July 26, 2012 update:** 3 saved igloo layouts, plus a "likes" counter that displayed up to 99,999. Music needed a stereo-type furniture item (since May 2006). [S] https://clubpenguin.fandom.com/wiki/Igloo

### 2.7 Mascots
- Mascots wandered to particular servers. Meeting one gave a stamp, and their card's gift box gave a background. Fans tracked their visits, and rooms filled up when one appeared. [S on the gift and backgrounds; U on fan tracker detail] https://clubpenguin.fandom.com/wiki/Autographed_Backgrounds

---

## 3. Safety and moderation design

- **Stated reason for the whole design:** Merrifield said they built a world he and the other two founders would feel safe letting their own kids visit. No ads, because "within two or three clicks" a child could reach gambling or dating sites. [S] https://en.wikipedia.org/wiki/Club_Penguin
- **Target ages:** 6–14. The press called the safety features almost "fastidious"; Wikipedia also cites a view that it reassured more parents than it put off. [S] https://en.wikipedia.org/wiki/Club_Penguin
- **Staffing:**
  - About 70 of 100 staff policed the game in May 2007.
  - About 200 staff answered roughly 40,000 player emails a week and replied to every one.
  - International moderation offices opened in Brighton (2008), São Paulo and Buenos Aires.

  [S] https://en.wikipedia.org/wiki/Club_Penguin , https://clubpenguin.fandom.com/wiki/Club_Penguin
- **Report a Player:** opened from the player card. Reasons: bad language · rude or mean · lying · cheating · bad penguin name · **asking for personal information**. Moderators reviewed reports and could ban the reporter for a false report. A moderator badge in the top-right corner showed the rules and how to report. Early PSA applications were hidden behind it too. [S] https://clubpenguin.fandom.com/wiki/Report_a_Player , https://clubpenguin.fandom.com/wiki/Spy_Phone
- **Penalties:**
  - Warning (you stay online)
  - Mute for a set time
  - Kick (you can come back)
  - **24h ban** for swearing or inappropriate talk; often automatic, through the filter
  - **72h ban** for cheating or hacking
  - **Permanent** after multiple severe bans

  The wiki also notes bans ranged from 12h. A banned email couldn't make a new penguin until the ban ended. [S] https://clubpenguin.fandom.com/wiki/Ban
- **Secret Agents (PSA, then EPF from 2010):**
  - **Joining:** accounts 30 days or older. At first you applied through a hidden form behind the moderator badge and staff approved you by hand; later it became a multiple-choice test.
  - **Duties:** report rule-breakers · keep identities secret · check HQ for missions · help others · keep CP safe.
  - **Rewards:** a Spy Phone and a monthly paycheck (250 coins, 350 as EPF). A welcome postcard was added in 2009.
  - **Why it mattered:** kids got status for safety behavior, and a crowd of extra reporters came free.

  [S] https://clubpenguin.fandom.com/wiki/Secret_Agent , https://clubpenguin.fandom.com/wiki/Spy_Phone , https://clubpenguin.fandom.com/wiki/Coin
- **Parental Timer (July 14, 2008):** parents set allowed hours and a daily maximum. In-game warnings came at 7 minutes and 1 minute left. When time ran out, a friendly sign-off pointed kids to activities outside the game; logging in again showed "you've used up your time." [S] https://clubpenguin.fandom.com/wiki/Parental_Timer
- **Emergency fallback:** on June 10, 2010, while fixing a filter bypass, CP switched **every server to menu-only chat**. A whitelist plus a menu mode gives you a kill switch. [S] https://clubpenguin.fandom.com/wiki/Ultimate_Safe_Chat
- **Account deletion:** only for free accounts inactive for 90 days, through support. [S] https://thatpenguingame.com/club-penguin-help/penguin-account/my-account/

---

## 4. Economy and retention

- **Membership price (final era):**

  | Plan | Price (USD/CAD) |
  |---|---|
  | 1 month | $7.95 |
  | 3 months | $19.95 |
  | 6 months | $39.95 |
  | 12 months | $59.95 |

  Prices rose on July 13, 2011; before that it was about $5.95/month [U]. Club Penguin Island charged $4.99/month. [S] https://clubpenguin.fandom.com/wiki/Membership
- **Scale:** at Disney's purchase (Aug 2007, $350M plus up to $350M in earn-outs) there were about 700k subscribers, 11–12M accounts and about $40M a year in revenue. [S] https://en.wikipedia.org/wiki/Club_Penguin
- **Purchase promotions:** a membership bought Dec 9–31, 2010 came with 1,000 coins per month. Twelve-month buyers in Dec 2012 got 5,000 coins plus a code. [S] https://clubpenguin.fandom.com/wiki/Membership
- **Coin sources:**
  - Mini-games paid about **10% of score**, and **2x if you had all of that game's stamps**. Card-Jitsu, fair games and newspaper games paid nothing.
  - Monthly paychecks by mail for Tour Guides (250) and agents (250, later 350), from May 2, 2009.
  - Code redemptions worth 100–5,000 coins (toys, books).
  - Puffle digging.
  - Soft cap of 1,000,000: above it, games paid nothing. Hard cap 9,999,999.

  [S] https://clubpenguin.fandom.com/wiki/Coin
- **Real prices:** a 20-coin color change and a 10-coin postcard. [S] Most clothing ran a few hundred coins, rare items 1,000+. [U]
- **Weekly and monthly cadence:**
  - Newspaper every **Thursday**, in the top-left corner. It went every 2 weeks (Wednesdays) from Apr 2016. 566 issues in total.
  - Penguin Style catalog in the first week of each month.
  - A party roughly every month.
  - Priebe: parties drove subscriptions, since attending as a member unlocked an extra item the following month [S per the interview; exact rule U].

  [S] https://clubpenguin.fandom.com/wiki/Club_Penguin_Times , https://clubpenguin.fandom.com/wiki/Penguin_Style
- **Coins for Change (every December, 2007–2016):** players donated coins at stations in fixed amounts (2011–12: 100 / 500 / 1,000 / 5,000 / 10,000) to one of three causes. Their votes divided about **$1M a year in real money** between the charities.
  - 2007: 2.5M participants and 2B coins.
  - 2009: 2.9M participants.
  - Rewards: pins, a background, and Volunteer/Top Volunteer stamps.
  - From 2014, coins spent in the catalog also counted as donations.
  - It began because players asked to "make a difference."

  It was also a very effective coin sink. [S] https://clubpenguin.fandom.com/wiki/Coins_For_Change
- **Stamps** came in 4 tiers by color: easy green, medium yellow, hard blue, extreme red. 352 in total, launched July 26, 2010. Stamps doubled coin payouts once a game was complete. [S] https://clubpenguin.fandom.com/wiki/Stamps
- **Why kids came back** (Priebe):
  - Kids organized at school and then met online.
  - They played on a schedule to catch the same friends.
  - There was always something new each week.
  - Party items worked as visible status ("social capital").

  [S] Priebe interview, §6.

---

## 5. UI specifics

- **Toolbar** (blue bar along the bottom; layout as of 2014):
  - **Left corner:** the map icon (blue).
  - **Left to right:** Puffle button (added Apr 17, 2014) · Quick/Safe Chat speech bubble · Emote menu (winking face; plain smiley before late 2007) · Actions (sitting penguin) · Snowball · **chat text field** (typed-chat servers only) · your own player card (blue penguin, earlier a star or member badge) · Buddies (two penguins) · Igloo (went from a yellow-roof house to an igloo on July 26, 2012) · gear/info.
  - **Gear/info panel:** penguin age in days, current server, mute music, ignore list, friend count, account links.

  Toolbar recolored Apr 14, 2008 (CPIP) and redesigned Apr 17, 2014. [S] https://clubpenguin.fandom.com/wiki/Toolbar
- **Top corners:** newspaper icon top-left (and, before July 2008, the postcard smiley next to it); moderator badge top-right. [S] https://clubpenguin.fandom.com/wiki/Club_Penguin_Times , https://clubpenguin.fandom.com/wiki/Postcard
- **Map:** opens from the bottom-left icon. Hovering a room shows its name; clicking teleports you instantly. A quest tray was added Dec 19, 2008, and redesigns came Nov 3, 2008 and June 27, 2011. **Entering a full room shows a popup and then opens the map automatically**, so the player always has a next step. [S] https://clubpenguin.fandom.com/wiki/Map , https://clubpenguin.fandom.com/wiki/Server
- **Newspaper:** started as a multi-page paper:

  | Section | Contents |
  |---|---|
  | A | Headlines |
  | B | In Focus, Ask Aunt Arctic, Secrets |
  | C | Jokes, Riddles, Poetry, Games, Upcoming Events |
  | D | Submit Your Content |

  On Nov 18, 2010 it became a single long sheet with a front and back you flipped. Front: Feature, Support story, News Flash, Upcoming Events/Island Rumors, Aunt Arctic. Back: Comics, Secrets, Jokes. **"Secrets" (hidden item locations) and "Upcoming Events" were the retention hooks.** [S] https://clubpenguin.fandom.com/wiki/Club_Penguin_Times
- **Catalogs:** a page-flip book with a Buy button on each item. **Hidden items** appeared when you clicked particular spots on a page; this ran until June 2015 and fueled a whole "catalog secrets" fan culture. [S] https://clubpenguin.fandom.com/wiki/Penguin_Style
- **Spy Phone/EPF phone:** a handheld device for agents to teleport to HQ and receive messages. [S that it was an agent award; U on button details] https://clubpenguin.fandom.com/wiki/Spy_Phone
- **Music:** some rooms always had music (Pizza Parlor, for example), others only during events; igloos and games had their own tracks. Composers included Chris Hendricks (2005–2010) and Toby Hulse (2012–18). Mute lived in the gear menu. [S] https://clubpenguin.fandom.com/wiki/Music , https://clubpenguin.fandom.com/wiki/Toolbar
- **Error messages.** Each one was a small modal with a code; the wording was short, apologetic and told you what to do next.

  | Code | Wording |
  |---|---|
  | 10004 | "Connection was lost. Please click to learn more." The last day of the game used "The connection has been lost. Thank you for playing Club Penguin. Waddle on!" |
  | s210 / s212 | "Sorry this room is currently full" (then the map opens) |
  | c103 | "Sorry this server is full. Please select another server." |
  | s101 | "Sorry! Incorrect penguin name or password. Passwords are CaSe SeNsiTIVE." |
  | s601 / s602 | Ban message telling you how many hours until it expires |

  Entering a wrong code 5 times locked you out for 45 minutes. [S] https://clubpenguin.fandom.com/wiki/List_of_Error_Messages , https://en.wikipedia.org/wiki/Club_Penguin
- **Login screen:** the art above "Play" changed with each party. Quick links went to the What's New Blog and the Membership page. [S] https://clubpenguin.fandom.com/wiki/Login_Screen
- **Cursor and loading screens:** CP used a custom cursor and themed loading animations. [U, no details captured]

---

## 6. Founders' design philosophy, and why it declined

**Main source.** Lance Priebe (co-founder, CTO and CCO) interviewed in Amber Atherton, *The Rise of Virtual Communities: In Conversation with Virtual World Pioneers* (Apress, 2023, ISBN 9781484292969), ch. 7, pp. 79–88. Read through an online copy at https://dokumen.pub/the-rise-of-virtual-communities-in-conversation-with-virtual-world-pioneers-9781484292969-9781484292976-1484292960.html , so cite the book, not that URL.

What Priebe said:
- **"An activity magazine, not a game":** new content and challenges every week was the core loop.
- **Layout was planned like architecture.** Kitchen-triangle thinking and Disneyland-style hubs mix venues, shops and social spots, steering foot traffic so crowds don't collide.
- **Whitelist safety:** filters blocked everything except a small set of approved phrases. Parents could add Ultimate Safe Chat on top.
- **Safety as a status game:** agent status rewarded kids for passing a safety test and for reporting.
- **Money:** under 5% paid; the free 95% was the audience and word-of-mouth.
- **Two things every community needs:** a **venue** that gives a sense of "being here together" (ski village, ice rink) and an **event or story** to gather around (parties). Founders should lead by example; in practice, staff played as named penguins (Billybob, Rsnail, Gizmo).
- **On Disney:** Priebe credits Disney with scaling localization (PT, FR, ES, DE, RU) to hundreds of millions of kids, and rejects the fan idea that Disney ruined the game.
- **Self-funding:** the founders paid with credit cards to keep 100% ownership.

Other sources:
- **Merrifield on ads:** keeping ads away from kids was a core belief; the goal was an ad-free, safe "walled environment," because that is what they wanted for their own children. [S] https://bencuan.me/blog/clubpenguin/
- **Priebe on launching unfinished:** CP launched with unexplained things (a Dojo, a lighthouse, a pet shop, a tippable iceberg). That left room for lore and rumors to grow. [S] https://bencuan.me/blog/clubpenguin/
- **Reliability:** players forgave crashes because they trusted the team. Not every technical problem needed engineering for extreme uptime. [S] https://bencuan.me/blog/clubpenguin/
- **Origins:** Snow Blasters (2000) → Experimental Penguins (2000) → Penguin Chat 1–3 (Penguin Chat 3 in Mar 2005 tested the CP client and servers) → Club Penguin beta Aug 22, 2005 → launch Oct 24, 2005. [S] https://en.wikipedia.org/wiki/Club_Penguin , https://clubpenguin.fandom.com/wiki/Club_Penguin

**Decline:**
- Kids moved to phones and tablets. Disney's executive producer, Liza Wood, told [a]listdaily that kids were now playing more on mobile.
- Monthly visitors fell to about 5.6M by Dec 2016.
- 28 Kelowna staff were laid off in Apr 2015, and Disney Interactive was restructured.
- The game depended on Flash.
- It shut down Mar 30, 2017.
- The 3D portrait-mode replacement, Club Penguin Island (CPI), closed in 2018. CPI was widely seen as more restrictive for free players.

[S] https://www.alistdaily.com/digital/disney-interactive-explains-club-penguin-migrated-mobile/ , https://en.wikipedia.org/wiki/Club_Penguin , https://tvtropes.org/pmwiki/pmwiki.php/Main/AllegedlyFreeGame

My inference: what kept people coming was the school-to-online social link and the weekly or monthly calendar, more than the platform. The sequel dropped the 2D toolbar, the familiar island, and free players' access. [U, interpretation]

---

## 7. What this means for Club NYC (suggestions, not research)

- **Pending-name state:** show a neutral handle like `New Yorker #4821` until a name is approved, so that bad names never get airtime.
- **Errand-style onboarding:** a named guide sends the player to 3 places (a shop, the pet or bodega equivalent, their apartment), each with an exclusive starter item that can never be bought later.
- **Chat:** whitelist words, block digits, and drop failed messages silently. Add a menu-only mode, plus a server-wide "menu-only" kill switch for incidents. Include menu phrases that let kids defuse a situation politely ("Please stop").
- **Player card actions in CP's order:** friend · find · visit home · mail · badges · ignore · report. Report reasons should include "asking for personal info."
- **Full-room handling:** never dead-end the player. Opening the map is a good model, and since Club NYC is one shared world, offer room copies the way CPNext planned.
- **Coin payout:** about 10% of score, doubled after completing a game's achievements. Add a December charity-vote coin sink.
- **Calendar:** a Thursday paper with "Secrets" and "Upcoming Events," a first-week-of-month catalog with hidden items, and monthly events with exclusive wearables.
- **Gating:** let free players browse everything and gate only at "Buy." Show tenure badges on cards so long-time players have visible status.
