/**
 * Every email Club NYC sends or plans to send, by journey: when it goes, to whom, why, and the email itself (in the
 * same layout as the live ones, email.ts renderEmail). Launch HQ (hq.ts) lists them and previews each one; nothing here
 * sends anything. The live ones (waitlist confirm and launch, sign-in) are the real templates from waitlist.ts / auth.ts.
 *
 * Rules every journey follows (docs/launch/gtm-plan.md has the reasoning):
 *  - Transactional (sign-in, confirmations, account changes) always sends. Everything else needs consent and has a
 *    one-click unsubscribe per topic, and goes out 11:00 to 19:00 New York time.
 *  - At most one non-transactional email every 3 days per person, 2 a week. A sequence stops the moment its goal
 *    happens (they claimed their name, they came back) or they unsubscribe.
 *  - The waitlist was promised: the confirmation, the launch email, one reminder. Anything more only for people who
 *    tick "send me updates".
 *  - No fake scarcity, no countdowns to nothing, honest numbers, no em dashes, the brand voice (about 30% funny,
 *    never in the instructions).
 */
import { type EmailContent, siteUrl } from './email.ts'
import { previewContent } from './waitlist.ts'
import { signInPreview } from './auth.ts'

export type Kind = 'transactional' | 'lifecycle' | 'marketing'
export type Status = 'live' | 'built' | 'planned'
export interface JourneyEmail {
  id: string
  name: string
  /** what makes it go */
  trigger: string
  /** when, relative to the trigger */
  timing: string
  /** who gets it (and who doesn't) */
  audience: string
  /** the one thing it's for */
  goal: string
  kind: Kind
  /** live: sending today · built: written and previewable, not wired · planned: needs a feature first */
  status: Status
  /** who sends it: our server (it knows names and stats) or a Resend broadcast (newsletters) */
  sender: 'server' | 'resend-broadcast'
  /** what ends the sequence early */
  stop?: string
  content: () => EmailContent
}
export interface Journey {
  id: string
  name: string
  why: string
  emails: JourneyEmail[]
}

const NAME = 'Taxi_Tina'
const play = siteUrl('/play')
const unsub = siteUrl('/api/waitlist/unsubscribe?u=preview')
const PLAYER = 'You’re getting this because you play Club NYC and asked for emails like this. Turn them off any time.'

export const JOURNEYS: Journey[] = [
  {
    id: 'waitlist',
    name: 'Waitlist',
    why: 'From "Claim your name" to opening night: confirm, keep the name warm, get them in on day one.',
    emails: [
      {
        id: 'wl-confirm', name: 'Your name is saved', kind: 'transactional', status: 'live', sender: 'server',
        trigger: 'Joins the waitlist with a name', timing: 'Immediately', audience: 'Everyone who joins', goal: 'Confirm the address (double opt-in)',
        content: () => previewContent.confirm(1, 'preview', NAME),
      },
      {
        id: 'wl-confirmed', name: 'You’re in line (+ bring a friend)', kind: 'transactional', status: 'built', sender: 'server',
        trigger: 'Clicks Confirm My Spot', timing: 'Immediately', audience: 'Confirmed waitlisters', goal: 'Share their invite link; offer opt-in to updates',
        content: () => ({
          subject: `${NAME} is confirmed`,
          preheader: 'You’re in line. Your group chat can be too.',
          hero: { src: '/email/hero-park.jpg', alt: 'Central Park in Club NYC' },
          title: `You’re in line, ${NAME}!`,
          paragraphs: [
            `Your name is held until the city opens, and we’ll email you the day it does.`,
            'Club NYC is better with your people. Send them your link: when they join, they’ll land right next to you on day one.',
          ],
          button: { label: 'Copy My Invite Link', url: siteUrl(`/join/${NAME}`) },
          after: ['Want the occasional behind-the-scenes update before launch (the trailer, the first look)? Reply “updates” and we’ll add you. Otherwise, the next email is the day the doors open.'],
          unsubscribeUrl: unsub,
          reason: 'You’re getting this because you confirmed your spot on the Club NYC waitlist.',
        }),
      },
      {
        id: 'wl-firstlook', name: 'First look: the trailer', kind: 'marketing', status: 'built', sender: 'resend-broadcast',
        trigger: 'Trailer day (L-10)', timing: '11:00 ET', audience: 'Waitlisters who opted in to updates', goal: 'Watch the trailer, forward it',
        content: () => ({
          subject: 'First look at Club NYC',
          preheader: '43 seconds of the city before anyone else sees it.',
          hero: { src: '/email/hero-stage.jpg', alt: 'A Broadway stage in Club NYC' },
          title: 'You get the first look',
          paragraphs: ['The trailer is done, and you’re seeing it before it goes anywhere else: a group chat, a yellow cab and the whole city.', 'If it makes you think of someone, send it to them. That’s what it’s for.'],
          button: { label: 'Watch the Trailer', url: siteUrl('/?trailer=1') },
          unsubscribeUrl: unsub,
          reason: 'You’re getting this because you asked for updates before launch.',
        }),
      },
      {
        id: 'wl-preview', name: 'Founders’ Preview invite', kind: 'marketing', status: 'built', sender: 'server',
        trigger: 'Preview opens (L-7)', timing: '11:00 ET, in waves', audience: 'Opted-in waitlisters, earliest first, plus anyone who invited a friend', goal: 'Play early, find bugs, make the first clips',
        content: () => ({
          subject: `${NAME}, you’re invited to the preview`,
          preheader: 'The city opens to a few hundred people first. You’re one of them.',
          hero: { src: '/email/hero-station.jpg', alt: 'Grand Central in Club NYC' },
          title: 'Come in before everyone else',
          paragraphs: [`The Founders’ Preview opens today, and you’re on the list. Your name ${NAME} is ready for you.`, 'Bring your group chat, try a job, throw a party in your apartment. Tell us what breaks: you’re helping build the city.'],
          button: { label: 'Open the Preview', url: siteUrl('/play?preview=code') },
          after: ['The preview runs until launch day. Everything you earn carries over.'],
          unsubscribeUrl: unsub,
          reason: 'You’re getting this because you asked for updates before launch.',
        }),
      },
      {
        id: 'wl-launch', name: 'The city is open (claim your name)', kind: 'transactional', status: 'live', sender: 'server',
        trigger: 'Launch (the moderator starts it after LAUNCH_AT)', timing: 'Launch morning, in batches', audience: 'Every confirmed waitlister', goal: 'Claim the name and play', stop: 'Claimed',
        content: () => previewContent.launch(1, NAME),
      },
      {
        id: 'wl-reminder', name: 'Your name is still waiting', kind: 'lifecycle', status: 'built', sender: 'server',
        trigger: 'Launch email sent, name not claimed', timing: 'L+3, once', audience: 'Waitlisters who haven’t claimed', goal: 'Claim before the hold ends', stop: 'Claimed, or unsubscribed',
        content: () => ({
          subject: `${NAME} is still yours (for now)`,
          preheader: 'We’re holding your name until next week. One click claims it.',
          hero: { src: '/email/hero.jpg', alt: 'Liberty Island in Club NYC' },
          title: `${NAME} is still waiting`,
          paragraphs: [`You saved ${NAME} on the waitlist and the city’s open. We’ll hold it for you until next Tuesday; after that, anyone can take it.`, 'One click signs you in with your name already on your New Yorker.'],
          button: { label: `Claim ${NAME}`, url: siteUrl('/api/auth/claim?u=preview') },
          after: ['This is the only reminder. If Club NYC isn’t for you, no hard feelings, and no more emails.'],
          unsubscribeUrl: unsub,
          reason: 'You’re getting this because you joined the Club NYC waitlist.',
        }),
      },
    ],
  },
  {
    id: 'welcome',
    name: 'New New Yorker',
    why: 'The first week decides whether someone stays: one welcome, one nudge if they don’t come back, one recap.',
    emails: [
      {
        id: 'nw-welcome', name: 'Welcome to the city', kind: 'lifecycle', status: 'built', sender: 'server',
        trigger: 'Finishes making their New Yorker (and has an email on the account)', timing: '10 minutes later', audience: 'New players with a linked email', goal: 'Three things to do first; the invite link',
        content: () => ({
          subject: `Welcome to the city, ${NAME}`,
          preheader: 'Your MetroCard is loaded. Here’s where locals start.',
          hero: { src: '/email/hero-home.jpg', alt: 'An apartment in Club NYC' },
          title: `Welcome to the city, ${NAME}!`,
          paragraphs: ['You’re New Yorker No. 1,240. Rent is free and the elevator is out, so you’re already a local.', 'Three things worth doing this week:'],
          features: { heading: 'Start Here', items: [
            { img: '/email/jobs.jpg', title: 'Work a Shift', text: 'Fold slices, run the halal cart or captain the ferry. Coins buy outfits and furniture.' },
            { img: '/email/home.jpg', title: 'Make Your Place Yours', text: 'Your apartment starts empty. Locals start with a rug.' },
            { img: '/email/games.jpg', title: 'Catch a Dance Jam', text: 'Times Square, every few minutes. Nobody can dance. Everybody dances.' },
          ] },
          button: { label: 'Back to the City', url: play },
          unsubscribeUrl: unsub,
          reason: PLAYER,
        }),
      },
      {
        id: 'nw-day3', name: 'Rosa saved you a slice', kind: 'lifecycle', status: 'built', sender: 'server',
        trigger: 'Hasn’t come back', timing: '3 days after joining', audience: 'New players who haven’t returned since day one', goal: 'A second visit', stop: 'They come back',
        content: () => ({
          subject: 'Your building misses you',
          preheader: 'Rosa saved you a slice. It’s cold now, but it’s the thought.',
          hero: { src: '/email/hero-park.jpg', alt: 'Central Park in Club NYC' },
          title: 'The city kept your spot',
          paragraphs: [`${NAME}, your apartment’s right where you left it, and so is your MetroCard.`, 'A quick one if you’ve got five minutes: one shift at the pizzeria pays for your first piece of furniture.'],
          button: { label: 'Take Me Back', url: play },
          unsubscribeUrl: unsub,
          reason: PLAYER,
        }),
      },
      {
        id: 'nw-week', name: 'Your first week', kind: 'lifecycle', status: 'built', sender: 'server',
        trigger: 'Seven days since joining, played at least twice', timing: 'Day 7, 11:00 ET', audience: 'Players who came back at least once', goal: 'Feel the progress; invite one friend',
        content: () => ({
          subject: `${NAME}’s first week in the city`,
          preheader: '6 stamps, 420 coins and one very questionable outfit.',
          hero: { src: '/email/hero-deck.jpg', alt: 'The observation deck in Club NYC' },
          title: 'One week in New York',
          paragraphs: ['Your week: 6 stamps, 420 coins earned, 3 friends made, 2 Dance Jams survived.', 'Next stamp you’re closest to: Ferry Regular. Two more trips to Liberty Island.'],
          button: { label: 'Keep Going', url: play },
          after: ['The numbers come from your own account and are shown only to you.'],
          unsubscribeUrl: unsub,
          reason: PLAYER,
        }),
      },
    ],
  },
  {
    id: 'friends',
    name: 'Friends',
    why: 'The loop that grows the city: a friend arriving is the best reason to come back.',
    emails: [
      {
        id: 'fr-moved-in', name: 'Your friend moved in', kind: 'lifecycle', status: 'built', sender: 'server',
        trigger: 'Someone joins through their invite link', timing: 'Within the hour (at most one a day, combined)', audience: 'The inviter, if they’re not online', goal: 'Come back and meet them',
        content: () => ({
          subject: 'BagelBen just moved in',
          preheader: 'They joined from your link. They’re standing in Times Square looking lost.',
          hero: { src: '/email/hero-station.jpg', alt: 'Grand Central in Club NYC' },
          title: 'Your friend is in the city',
          paragraphs: ['BagelBen joined Club NYC from your invite link. They’re new, so show them around: the halal cart, the good bench in Central Park, where the pigeons gather.'],
          button: { label: 'Go Say Hi', url: play },
          unsubscribeUrl: unsub,
          reason: PLAYER,
        }),
      },
      {
        id: 'fr-request', name: 'Someone wants to be friends', kind: 'lifecycle', status: 'planned', sender: 'server',
        trigger: 'A friend request waits 24 hours', timing: '24 h after the request', audience: 'Players offline when it arrived', goal: 'Accept it',
        content: () => ({
          subject: 'DeliDanny wants to be friends',
          preheader: 'They sent a friend request yesterday. One click to say yes.',
          title: 'A friend request is waiting',
          paragraphs: ['DeliDanny sent you a friend request in Club NYC. Friends can join each other anywhere in the city and visit each other’s apartments.'],
          button: { label: 'See the Request', url: play },
          unsubscribeUrl: unsub,
          reason: PLAYER,
        }),
      },
    ],
  },
  {
    id: 'winback',
    name: 'Win back',
    why: 'Two tries, then we stop. Lapsed players hear what’s new, not that they’re missed.',
    emails: [
      {
        id: 'wb-14', name: 'New in the city', kind: 'lifecycle', status: 'built', sender: 'server',
        trigger: 'No visit for 14 days', timing: 'Day 14, 11:00 ET', audience: 'Players with at least 2 visits ever', goal: 'Come back for something new', stop: 'They come back',
        content: () => ({
          subject: 'The city changed while you were out',
          preheader: 'A new job, a new room and the pigeons have unionised. (Not really.)',
          hero: { src: '/email/hero-rink.jpg', alt: 'The rink in Club NYC' },
          title: 'New since you’ve been gone',
          paragraphs: [`Hey ${NAME}. Here’s what changed:`],
          features: { heading: 'What’s New', items: [
            { img: '/email/jobs.jpg', title: 'A New Job', text: 'Run the bagel counter at the morning rush. The tips are mostly sesame seeds.' },
            { img: '/email/games.jpg', title: 'Skating at the Rink', text: 'Rockefeller Center has ice now. Falling over is part of it.' },
          ] },
          button: { label: 'See What’s New', url: play },
          unsubscribeUrl: unsub,
          reason: PLAYER,
        }),
      },
      {
        id: 'wb-30', name: 'Last one from us', kind: 'lifecycle', status: 'built', sender: 'server',
        trigger: 'No visit for 30 days', timing: 'Day 30, then the sequence ends', audience: 'Lapsed players who didn’t open the last one', goal: 'One last door, then silence', stop: 'Ends here either way',
        content: () => ({
          subject: 'We’ll stop emailing (your name stays yours)',
          preheader: 'Your apartment and your name are kept. No more of these unless you come back.',
          title: 'Your spot’s still here',
          paragraphs: [`${NAME}, this is the last nudge from us. Your name, your apartment and your coins stay exactly where they are, whenever you want them.`],
          button: { label: 'Visit the City', url: play },
          unsubscribeUrl: unsub,
          reason: PLAYER,
        }),
      },
    ],
  },
  {
    id: 'news',
    name: 'Newsletter & events',
    why: 'Opt-in only (the “Club NYC Times” topic, the “Events” topic). Sent from Resend as broadcasts.',
    emails: [
      {
        id: 'nl-times', name: 'The Club NYC Times', kind: 'marketing', status: 'built', sender: 'resend-broadcast',
        trigger: 'Every other Thursday', timing: '11:00 ET', audience: 'Subscribers to the Club NYC Times', goal: 'Stay in touch; one thing to do this week',
        content: () => ({
          subject: 'The Club NYC Times: bodega cat wins in a landslide',
          preheader: 'Plus: the halal line, a new job and this week’s best apartment.',
          hero: { src: '/email/hero-station.jpg', alt: 'Grand Central in Club NYC' },
          title: 'The Club NYC Times',
          paragraphs: ['Your city, every other Thursday, in about a minute.'],
          features: { heading: 'This Week in the City', items: [
            { img: '/email/games.jpg', title: 'Bodega Cat Elected Mayor', text: 'Promises more naps, fewer mice. Turnout was mostly pigeons.' },
            { img: '/email/jobs.jpg', title: 'Job of the Week: Halal Rush', text: 'This week’s top shift served 61 plates in 90 seconds. Can you beat it?' },
            { img: '/email/home.jpg', title: 'Apartment of the Week', text: 'A loft with eleven plants and one very tired couch. Shared with permission.' },
          ] },
          button: { label: 'Open the City', url: play },
          unsubscribeUrl: unsub,
          reason: 'You’re getting this because you subscribed to the Club NYC Times.',
        }),
      },
      {
        id: 'nl-event', name: 'Event invite', kind: 'marketing', status: 'built', sender: 'resend-broadcast',
        trigger: 'A community night is scheduled', timing: '2 days before, 11:00 ET', audience: 'Subscribers to Events', goal: 'Show up at the time',
        content: () => ({
          subject: 'Saturday: the big Dance Jam in Central Park',
          preheader: '8 PM ET. Bring the group chat. Commemorative stamp for everyone there.',
          hero: { src: '/email/hero-park.jpg', alt: 'Central Park in Club NYC' },
          title: 'Saturday, 8 PM: the big Dance Jam',
          paragraphs: ['The whole city in Central Park, one flash mob, one stamp you can only get that night.', 'Saturday at 8 PM New York time (5 PM in LA, 1 AM Sunday in London).'],
          button: { label: 'Add It to My Calendar', url: siteUrl('/events/dance-jam.ics') },
          unsubscribeUrl: unsub,
          reason: 'You’re getting this because you subscribed to Club NYC events.',
        }),
      },
    ],
  },
  {
    id: 'account',
    name: 'Account & safety',
    why: 'Always sent, never marketing. Short, plain, no jokes.',
    emails: [
      {
        id: 'ac-signin', name: 'Sign-in link', kind: 'transactional', status: 'live', sender: 'server',
        trigger: 'Continue with Email', timing: 'Immediately', audience: 'Whoever asked', goal: 'Sign in',
        content: () => signInPreview(siteUrl('/api/auth/email/verify?token=preview')),
      },
      {
        id: 'ac-linked', name: 'A new sign-in was linked', kind: 'transactional', status: 'built', sender: 'server',
        trigger: 'Google, X, Discord or an email is linked to the account', timing: 'Immediately', audience: 'The account’s email', goal: 'Spot a takeover early',
        content: () => ({
          subject: 'Google is now linked to your New Yorker',
          preheader: 'If this was you, there’s nothing to do.',
          title: 'A new way to sign in',
          paragraphs: [`Google was just linked to ${NAME}. You can now sign in with it.`, 'If this wasn’t you, reply to this email and we’ll lock the account while we sort it out.'],
          reason: 'You’re getting this because it’s about your account’s security.',
        }),
      },
      {
        id: 'ac-deleted', name: 'Your account is deleted', kind: 'transactional', status: 'built', sender: 'server',
        trigger: 'Deletes their account', timing: 'Immediately', audience: 'The account’s email', goal: 'Confirm it’s done',
        content: () => ({
          subject: 'Your Club NYC account is deleted',
          preheader: 'Your New Yorker, apartment and coins are gone, as you asked.',
          title: 'Your account is deleted',
          paragraphs: [`${NAME} and everything attached to it (apartment, coins, friends list) has been deleted, as you asked. This is the last email you’ll get from us.`],
          reason: 'You’re getting this because the account linked to this email was deleted.',
        }),
      },
    ],
  },
]

export const journeyEmail = (id: string) => JOURNEYS.flatMap((j) => j.emails).find((e) => e.id === id) ?? null
