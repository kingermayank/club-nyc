# Club NYC: legal and compliance callouts before launch

Status on 18 October 2026. **This is not legal advice.** It records what the game does, what's still to fill in,
and the questions to take to a lawyer before inviting the public. Sources are linked inline.

## In place

**Policies, live and linked everywhere**
- Terms of Service (`/terms.html`), Privacy Policy (`/privacy.html`) and Community Rules (`/rules.html`).
  Each is dated, written in plain language, and linked from the landing page, its footer, the sign-up screen and
  the player card.

**Consent at sign-up**
- **"I agree" is required.** A player must tick "I agree to the Terms, Privacy Policy and Community Rules" to
  create a New Yorker.
- **Agreement is recorded.** The server stores which policy version the player agreed to and when
  (`users.consent_version` and `consent_at`). Moderators can see it on a player's page in the dashboard.
- **Re-agreement after changes.** The version lives in `app/src/data/policy.ts`. Bump `POLICY_VERSION` whenever the
  terms, privacy policy or rules change in a way players should agree to. Every returning player then sees a
  "Before you head back in" panel and must agree before playing. The launch test checks this.

**Neutral age screen ([FTC COPPA FAQ](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions), D.7 and H.3)**
- **How it asks.** Players give a birth month and year. Every year is on the list and nothing is pre-selected, so
  the question doesn't hint at the "right" answer.
- **What's stored.** The birth date is checked by the game and again by the server, then forgotten.
- **Under 13:**
  - First, one look: "Is that your birthday? You picked June 2016." It never mentions the age limit, so it doesn't
    hint at a "right" answer; it catches a slip in the 100-year list. "Let me fix it" is offered once per visit: a
    second under-13 answer goes straight to the goodbye.
  - No New Yorker is created, and the player sees a friendly goodbye with a way out: back to the home page.
  - The guest account made for that visit is deleted on the server, so nothing from it is kept.
  - **No lock (owner's decision, 19 October 2026).** Play now from the home page starts over, so a person who
    picked the wrong birthday isn't stuck. The FTC's FAQ suggests a cookie that stops children from going back to
    enter a different age; that 24-hour lock was removed because it also stranded real teens and adults. The
    neutral "Is that your birthday?" check stays. Ask the lawyer whether to bring a lock back (for example for the
    rest of the browser session) before launch.
- **Coming online after playing offline.** Those players give a birthday and agree too.

**Data minimization**
- **Guests:** no email, real name or birthday stored.
- **Chat:** filtered, and links, emails and phone numbers are removed automatically.
- **Deletion:** players can delete their account from their player card, and everything attached to it goes.

**Safety tools**
- Report, block and mute are on every player card.
- Several reports in an hour pause someone's chat automatically.
- The moderator dashboard handles reports, mutes, suspensions and bans.
- Banned players see the reason and the appeal contact.
- The landing page and FAQ say "filtered and moderated", never "100% safe".

**Security**
- **Browser protections:** a strict Content-Security-Policy (only our own scripts run), no framing, HSTS on HTTPS,
  and same-origin checks on every API call.
- **Session cookie:** HttpOnly, SameSite=Lax, and Secure over HTTPS.
- **Abuse limits:** rate limits on sign-ups, sign-ins and writes; request size limits; and malformed or oversized
  messages are refused.
- **Dependencies:** `npm audit` found 0 known vulnerabilities in either package.
- **Repository:** no secrets are in it. `.env`, databases and scratch files are git-ignored. The one key-shaped
  string is AWS's documentation example in a backup test.

**Disclaimer**
- The landing page footer and FAQ say Club NYC is independent, "not affiliated with or endorsed by the City of New
  York, the MTA or any brand parodied in it."

## Fill in before launch (blocking)

Set these in Railway's variables (see [deploy-railway.md § 5](../deploy-railway.md#5-set-the-variables)). The pages
show the `[…]` placeholder until each is set.

| Setting | Where it appears | Notes |
|---|---|---|
| `COMPANY_NAME` | Terms and privacy policy (the party players contract with), landing footer | Your legal name, or your company's |
| `CONTACT_EMAIL` | Everywhere help, appeals and privacy requests go | An inbox someone reads; the game shows it to banned players |
| `GOVERNING_STATE` | Terms § 12: governing law and courts | A legal choice: ask your lawyer |
| `MAILING_ADDRESS` | Terms: where legal notices go | Many people use a registered agent or PO box |
| `DISCORD_INVITE_URL` | `/discord` | A never-expiring invite; until set, buttons say "opens soon" |

## Questions for a lawyer

1. **COPPA: is the site "directed to children"?**
   - The FTC weighs visual content and animated characters, and since the 2025 amendments (in force from
     22 April 2026) marketing materials too.
   - Club NYC's cartoon style could count toward that, whatever the 13+ label says
     ([FTC FAQ D.1](https://www.ftc.gov/business-guidance/resources/complying-coppa-frequently-asked-questions),
     [Federal Register](https://www.federalregister.gov/documents/2025/04/22/2025-05904/childrens-online-privacy-protection-rule)).
   - The marketing copy speaks to teens and adults, and uses no kid-targeted terms. Ask whether that, plus the
     neutral age screen, is enough.
2. **EU: the age of digital consent.**
   - It varies from 13 to 16 by country: for example 16 in Germany, Ireland and the Netherlands, and 13 in
     Belgium, Denmark and Sweden ([euCONSENT](https://euconsent.eu/digital-age-of-consent-under-the-gdpr/)).
   - Club NYC lets everyone 13+ in. Options: raise the minimum age where required, add parental consent, or rely
     on another lawful basis. This is a decision for counsel.
3. **UK.**
   - The Children's Code likely applies to a game teens use. It expects high-privacy defaults, minimal data and
     easy-to-find reporting ([ICO](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/)).
   - Because players chat, the Online Safety Act likely applies. Ofcom expects an illegal-content risk assessment
     within three months of launch, a children's access assessment, and reporting and complaint routes
     ([Ofcom](https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/illegal-content-duties-under-the-online-safety-act)).
   - Since 7 April 2026, services must also report child sexual abuse material to the National Crime Agency.
4. **Trademarks: logos and real marks carry the most risk.**
   - **"I ♥ NY"** is a New York State trademark that needs approval to use
     ([NYS guidelines](https://assets.simpleviewinc.com/simpleview/image/upload/v1/clients/newyorkstate/ILNYLogoSheet_TM_NEW20151_1118f008-579e-43a1-8ba6-3fc6932decb6.pdf)).
     It appears as an in-game shop and its storefront in Times Square, and as small postcards and stickers on the
     Brooklyn Bridge souvenir stand. Marketing keeps it out where it can: the landing page's hero loop frames Times
     Square below the sign, and the share images show Liberty Island and the Empire State Building. It still shows in
     the trailer's Times Square shots and wherever the Brooklyn Bridge appears (hero loop, trailer, Explore tile).
     Repainting those two bits of art removes it everywhere.
   - **"Club Penguin"** is Disney's trademark. The landing page hints at it ("Waddle on over to New York.",
     "Remember waddling around… discovering secret rooms?") without using the name, logo, art or penguins. If the
     name is ever used, say Club NYC isn't affiliated with or endorsed by Disney, and never suggest Disney made or
     approved it.
   - **MTA:** it holds trademarks in the MetroCard name and the subway route bullets, and copyright in its map
     ([MTA licensing](https://www.mta.info/doing-business-with-us/licensing-program)). The game calls your ID card
     a "MetroCard", and the subway art shows route bullets.
   - **The logo:** the Club NYC logo includes an Empire State Building silhouette. The building's owners have
     opposed lookalike marks before ([BFKN](https://www.bfkn.com/newsroom/publications/Cant-Make-It-There-Cant-Make-That-Mark-Says-TTAB)).
   - **Parody brands** (shop and product names that riff on real ones): keep them as scenery inside the game, never
     as merch or product names. *Jack Daniel's v. VIP* (2023) weakened the parody defence for marks used as your own
     brand ([opinion](https://www.supremecourt.gov/opinions/22pdf/22-148_3e04.pdf)).
   - **The name:** search "Club NYC" on the [USPTO](https://tmsearch.uspto.gov/) before launch.
5. **Real people in the in-game newspaper.**
   - `app/src/data/news.ts` mentions real public figures by name: the mayor, Knicks players, and a celebrity
     engagement.
   - Ask whether satire about public figures is fine as is, or should use invented names.
6. **The Burbank font licence.**
   - The game embeds Burbank Small (Bold and Medium) as web fonts. Confirm your licence covers web embedding for
     a public site at this traffic.
7. **AI-generated art.**
   - Check whether any platform or jurisdiction you launch in expects you to disclose AI-generated art.
8. **California (CalOPPA).**
   - It requires a conspicuous privacy policy, which is done. Whether a free game counts as a "commercial" site is
     itself a question for counsel
     ([California AG](https://oag.ca.gov/system/files/attachments/press_releases/CalOPPA%20Letter_0.pdf)).

## Keeping it right after launch

- **When the terms, privacy policy or rules change:** update the page's "Last updated" date and bump
  `POLICY_VERSION`, so everyone agrees again.
- **Keep the pages honest.** If the game starts collecting something new, the privacy policy says it first.
- **Answer requests and reports:** deletion requests and appeals through `CONTACT_EMAIL`, and reports in the
  moderator dashboard.
- **Discord:**
  - Use a never-expiring invite, through `/discord`. Expired invites can be taken over by other servers
    ([Check Point](https://research.checkpoint.com/2025/from-trust-to-threat-hijacked-discord-invites-used-for-multi-stage-malware-delivery/)).
  - Discord itself is 13+, and older in some countries.
  - Follow Discord's [branding rules](https://discord.com/branding).
