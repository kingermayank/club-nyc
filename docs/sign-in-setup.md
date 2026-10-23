# Sign-in and email: what to set up

Club NYC has five ways in. Two work with no setup at all; the other three need an account with another company,
which only you can create. This page lists exactly what to create, what to copy, and where to paste it.

| Way in | Works without setup? | What you need |
|---|---|---|
| **Play Now** (guest) | Yes | Nothing |
| **Continue with Email** | In development (links print to the server log) | A Resend account and a domain you can add DNS records to |
| **Google** | No | A Google Cloud project with an OAuth client |
| **X** | No | An X developer app, with pay-per-use credits |
| **Discord** | No | A Discord application |

Paste every value into `server/.env` on your Mac (copy `server/.env.example` first) and into Railway's
**Variables** for the live site ([deploy-railway.md § 5](deploy-railway.md#5-set-the-variables)). Keys and secrets
are passwords: keep them in your password manager, never in the code, chat or a screenshot. If one leaks, delete
it in that company's console and make a new one.

Your web address matters everywhere below. Locally it's `http://localhost:5173` (or `5174`, if another project
already uses 5173: then also set `PUBLIC_URL=http://localhost:5174` in `server/.env`). Live, it's your
`PUBLIC_URL`, for example `https://play.clubnyc.com`. The sign-in buttons always come back to `PUBLIC_URL`.

---

## Email (sign-in links, the waitlist, the launch email)

The server sends email through [Resend](https://resend.com). Without it, development prints every email to the
server log (a line starting `[email] {`, with its links), and production sends nothing: the waitlist still takes
addresses (without a confirmation email) and "Continue with Email" is hidden.

**You'll create:** a Resend account, a sending domain, and an API key.

1. Sign up at [resend.com](https://resend.com).
2. **Domains → Add Domain.** Use a subdomain of your site, for example `mail.clubnyc.com` (Resend recommends a
   subdomain, so your main domain's reputation is separate). Pick the region closest to your players
   (North Virginia, `us-east-1`, for the US).
3. Resend shows DNS records to add at your DNS provider. Copy them exactly:
   - **DKIM:** a `TXT` record named like `resend._domainkey.mail`.
   - **SPF:** an `MX` record and a `TXT` record on the Return-Path subdomain (by default `send.mail`).
   - On Cloudflare, set them to **DNS only** (grey cloud).
4. Wait until the domain says **Verified** (often about 15 minutes, up to 72 hours).
5. Add a **DMARC** record too (Resend's domain page links to how). Gmail and Yahoo expect SPF, DKIM and DMARC from
   anyone sending to many of their users. Start with `v=DMARC1; p=none;` and tighten it later.
6. **API Keys → Create API Key:** permission **Sending access**, limited to your domain. Copy it now: it's shown
   once.
7. Leave **open and click tracking off** for this domain (Resend's default). The privacy policy promises no
   tracking, and click tracking would also send sign-in links through a redirect.

**You'll set:**

```bash
RESEND_API_KEY=re_...                                  # the key from step 6
EMAIL_FROM=Club NYC <hello@mail.clubnyc.com>           # any address on the verified domain
EMAIL_REPLY_TO=you@yourdomain.com                      # optional: where replies go (defaults to CONTACT_EMAIL)
```

**Plan:** the Free plan sends 3,000 emails a month, at most 100 a day. Every confirmation, sign-in link and launch
email counts. The launch email goes to the whole waitlist at once, so for more than about 100 people you need **Pro**
($20 a month, 50,000 emails, no daily limit) at least for launch week. Prices checked on 20 October 2026 at
[resend.com/pricing](https://resend.com/pricing).

**Check it:** restart the server, open `/admin.html` → **Waitlist** → type your own address next to **Send a
Test** and press it. The test should arrive within a minute. Look in the spam folder too, and if it's there, check
the DNS records again.

**Good to know:**
- Sign-in links work once, for 15 minutes. Some school and work inboxes "scan" links before you click them, which
  can use a link up; the person then sees "That link expired" and can ask for a fresh one.
- The unsubscribe links in waitlist emails are signed with a secret the server makes once and keeps next to the
  database (`/data/club-nyc.db.secret` on Railway). To pin it yourself, set `EMAIL_LINK_SECRET` to any long random
  string (for example `openssl rand -hex 32`). Changing it breaks the unsubscribe links in emails already sent.

---

## Google

**You'll create:** a Google Cloud project, its sign-in "branding" (Google calls it the OAuth consent screen) and
an OAuth client.

1. Open [console.cloud.google.com](https://console.cloud.google.com) and create a project (for example
   "Club NYC").
2. Go to **Google Auth Platform** (search for it at the top). If it says it isn't configured yet, press **Get
   Started**.
3. **Branding:**
   - App name: `Club NYC`. User support email: an inbox you read.
   - App logo: optional (adding one means Google reviews it).
   - App domain: home page `https://<your domain>/`, privacy policy `https://<your domain>/privacy.html`, terms of
     service `https://<your domain>/terms.html`.
   - Authorized domains: your domain (for example `clubnyc.com`).
   - Developer contact: your email.
4. **Audience:** user type **External**. While it's in **Testing**, only the test users you list can sign in. Add
   yourself as a test user now; press **Publish app** (status **In production**) before launch.
5. **Data Access:** add the scopes `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile`. These are
   Google's basic "non-sensitive" scopes: no security review.
6. **Clients → Create client:**
   - Application type: **Web application**. Name: `Club NYC`.
   - Authorized JavaScript origins: none needed.
   - **Authorized redirect URIs**, one per address you play on:
     - `http://localhost:5173/api/auth/google/callback` (and `http://localhost:5174/...` if you use that)
     - `https://<your domain>/api/auth/google/callback`
7. Copy the **Client ID** and **Client secret** (download the JSON too: Google may not show the secret again).

**You'll set:**

```bash
GOOGLE_CLIENT_ID=1234567890-abc...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
```

**Before launch:** on **Branding**, submit for **brand verification**, so the consent screen shows "Club NYC" and
your logo. Google checks that you own the domain (verify it in [Google Search Console](https://search.google.com/search-console)
first) and usually takes a few business days.

What Club NYC asks Google for: your name and email address, and Google's account ID for you. That's all
([privacy policy](../app/public/privacy.html), "Sign-ins you link").

---

## X

**You'll create:** an X developer account, a project with an app, and the app's OAuth 2.0 settings. **X charges per
use**: since February 2026 new developer accounts are on pay-per-use credits, and there's no free tier.

1. Sign in at [developer.x.com](https://developer.x.com) with an X account that has a verified phone number, and
   finish the developer sign-up (it asks you to describe the use: "Sign in with X for a browser game. We read the
   signed-in user's ID and @username to create their account. We never post.").
2. Create a **Project**, then an **App** inside it (apps outside a project can't use the v2 API).
3. In the app, **User authentication settings → Set up:**
   - App permissions: **Read**.
   - Type of App: **Web App, Automated App or Bot** (a confidential client, so you get a client secret).
   - **Callback URI / Redirect URL**, one per address:
     - `http://localhost:5173/api/auth/x/callback` (and `5174` if you use that)
     - `https://<your domain>/api/auth/x/callback`
   - Website URL: `https://<your domain>/`. Terms of service and privacy policy: the `/terms.html` and
     `/privacy.html` addresses.
   - Leave "Request email from users" off: Club NYC doesn't use it.
4. Copy the **OAuth 2.0 Client ID and Client Secret** (not the "API Key" pair: that's the older OAuth 1.0a).
5. **Billing:** buy a small amount of credits in the developer console. Each "Sign in with X" reads the person's own
   profile once (`GET /2/users/me`). Third-party price lists put a user lookup at about $0.01 (October 2026; check
   the console's current rate). Without credits, X sign-in fails with an error like `client-not-enrolled`, and
   players see "That sign-in didn't work".

**You'll set:**

```bash
X_CLIENT_ID=...
X_CLIENT_SECRET=...
```

What Club NYC asks X for: the scopes `users.read` and `tweet.read` (X requires the second one to read a profile),
and it keeps your X account ID and @username. It never posts.

---

## Discord

Already built; it just needs keys.

1. [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application**
   (`Club NYC`).
2. **OAuth2:** copy the **Client ID**; press **Reset Secret** and copy the **Client Secret**.
3. **Redirects:** add `http://localhost:5173/api/auth/discord/callback` and
   `https://<your domain>/api/auth/discord/callback`.

```bash
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
```

Club NYC asks only for the `identify` scope (your Discord ID and display name).

---

## The launch waitlist (no account needed)

These are settings, not accounts, but they decide what the public sees:

```bash
LAUNCH_MODE=waitlist        # "waitlist" (Coming Soon + email signups) or "open". Production defaults to waitlist.
PREVIEW_CODE=<a long random string>   # testers open https://<your domain>/play?preview=<code> once to play
# optional
WAITLIST_CONFIRM=true       # false = no confirmation email (by default new signups confirm by email when email is on)
WAITLIST_PUBLIC_MIN=100     # the landing page shows how many are in line only from this many
```

- Make the preview code with `openssl rand -hex 12`. Open `/play?preview=<code>` once in each browser you test
  with; `/play?preview=off` turns it off again so you see what visitors see. Changing `PREVIEW_CODE` locks out every
  tester until they use the new one.
- **Launch day:** set `LAUNCH_MODE=open` and deploy, check the game, then `/admin.html` → **Waitlist** → **Email the
  Waitlist That We're Open**. It sends in batches of 100, skips anyone who unsubscribed, didn't confirm, or already got
  it, and pressing it again later only reaches new people.

## Checklist

- [ ] Resend: domain verified, DMARC added, `RESEND_API_KEY` and `EMAIL_FROM` set, a test email arrived (not in spam)
- [ ] Resend plan covers the launch email (Pro if the list is over about 100)
- [ ] Google: client created, both redirect URIs added, app **In production**, brand verification submitted
- [ ] X: OAuth 2.0 client (Web App), both callback URIs, credits bought, sign-in tested on the live site
- [ ] Discord: both redirects added, sign-in tested
- [ ] `PREVIEW_CODE` set and saved in your password manager; `LAUNCH_MODE` is `waitlist` until launch day
- [ ] Every button tested in a private window on the live address

Sources (checked 20 October 2026): Resend [sending API](https://resend.com/docs/api-reference/emails/send-email),
[batch API](https://resend.com/docs/api-reference/emails/send-batch-emails),
[usage limits](https://resend.com/docs/api-reference/rate-limit), [domains](https://resend.com/docs/add-a-domain),
[pricing](https://resend.com/pricing); Google [OAuth consent and scopes](https://developers.google.com/workspace/guides/configure-oauth-consent),
[brand verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification);
X [pricing in 2026](https://postproxy.dev/blog/x-api-pricing-2026/) (third-party summary; X's own pricing page is in
the developer console).
