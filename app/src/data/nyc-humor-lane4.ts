/**
 * Lane 4: NYC Humor Content
 * Additional interactive NYC jokes and surprises for first-time players
 */
import type { Game } from '../types'
import type { Act } from './rooms'
import { bump } from '../state'

// ---------- Bodega Cat ----------
export const bodegaCat: Act = (g: Game) => {
  const visits = (g.flags.bodegaCatPets ?? 0) + 1
  g.flags.bodegaCatPets = visits
  
  const lines = [
    'Prrrrr… the bodega cat accepts your offering. 🐈',
    'The cat stretches, knocks over a bag of chips, and goes back to sleep.',
    'You pet the cat. The cat allows it. This is a big honor.',
    'The bodega cat wakes up just long enough to judge you, then sleeps again.',
    '*purr purr purr* The cat is pleased.',
  ]
  
  g.say(lines[Math.min(visits - 1, lines.length - 1)])
  g.sfx.coo() // closest sound to a purr
  
  // Reward for persistence
  if (visits === 1) {
    g.confetti(8)
    g.stamp('bodega-cat-fan')
  }
  if (visits === 5) {
    g.say('The bodega cat has decided you're acceptable. Here's a coin. 🪙')
    g.give(1)
    g.confetti(12)
  }
}

// ---------- Pizza Rat Sighting ----------
export const pizzaRatSighting: Act = (g: Game) => {
  if (g.flags.pizzaRatSeen) {
    g.say('Pizza Rat was here. Left a trail of grease. 🐀🍕')
    return
  }
  
  g.flags.pizzaRatSeen = true
  g.sfx.squawk()
  g.say('PIZZA RAT! A LEGEND! It's bigger in person! 🐀🍕')
  g.confetti(16)
  g.stamp('pizza-rat')
  bump('pizza-rat-sightings')
  
  // Give a small coin reward for finding it
  setTimeout(() => {
    g.say('(You snap a photo. Every New Yorker needs proof.)')
    g.give(2)
  }, 1500)
}

// ---------- Aggressive Pigeon Swarm ----------
export const pigeonSwarm: Act = (g: Game) => {
  const swarms = (g.flags.pigeonSwarms ?? 0) + 1
  g.flags.pigeonSwarms = swarms
  
  if (swarms === 1) {
    g.say('The pigeons swarm! They want your food! 🐦🐦🐦')
    g.sfx.coo()
    setTimeout(() => g.sfx.coo(), 200)
    setTimeout(() => g.sfx.coo(), 400)
  } else if (swarms === 2) {
    g.say('PIGEONS EVERYWHERE. This is my life now. 🐦🐦🐦')
    g.sfx.coo()
    setTimeout(() => g.sfx.coo(), 150)
    setTimeout(() => g.sfx.coo(), 300)
  } else {
    g.say('Coo coo! More pigeons! They remember you! 🐦')
    g.sfx.coo()
  }
  
  if (swarms === 3) {
    g.stamp('pigeon-whisperer')
    g.confetti(6)
  }
}

// ---------- Times Square Costume Character ----------
export const costumeCharacter: Act = async (g: Game) => {
  const encounters = (g.flags.costumeCharEncounters ?? 0) + 1
  g.flags.costumeCharEncounters = encounters
  
  if (encounters === 1) {
    const v = await g.choose(
      '🎭 ELMO WANTS PHOTO!',
      '"HEY! HEY YOU! PICTURE WITH ELMO! ONLY FIVE COINS! BEST PRICE! HEY!"',
      [
        { label: 'Take a Photo (5)', value: 'yes' },
        { label: 'Walk Away Quickly', value: 'no' },
      ]
    )
    
    if (v === 'yes' && g.spend(5, 'elmo-photo')) {
      g.say('Got a photo with Elmo. He followed me for three blocks. 📸')
      g.confetti(10)
      g.stamp('tourist-trap-survivor')
    } else {
      g.say('"HEY! YOU SAID YOU\'D TAKE A PICTURE! HEY!" (I did not.)')
    }
  } else {
    g.say('The costume characters are out. I'm not making eye contact. 👀')
  }
}

// ---------- Taxi Puddle Splash ----------
export const taxiSplash: Act = (g: Game) => {
  if (g.flags.taxiSplashed) {
    g.say('I've learned my lesson. Stay away from the curb. 🚕💦')
    return
  }
  
  g.flags.taxiSplashed = true
  g.sfx.honk()
  
  setTimeout(() => {
    g.say('A TAXI JUST SPLASHED ME! My shoes! My dignity! 💦')
    g.confetti(8) // not a good confetti, but marks the moment
  }, 400)
  
  setTimeout(() => {
    g.stamp('puddle-splash-victim')
  }, 1000)
}

// ---------- Manhole Steam Boost ----------
export const manholeVent: Act = (g: Game) => {
  const vents = (g.flags.steamVents ?? 0) + 1
  g.flags.steamVents = vents
  
  if (vents === 1) {
    g.say('Standing over a steam vent. I feel like Marilyn Monroe. 💨')
    g.confetti(12)
  } else if (vents === 2) {
    g.say('Free sidewalk heating. Peak NYC efficiency. 💨')
  } else {
    g.say('Ahhhh, toasty. 💨')
  }
  
  if (vents === 5) {
    g.stamp('steam-connoisseur')
  }
}

// ---------- Subway Rat (different from Pizza Rat) ----------
export const subwayRat: Act = (g: Game) => {
  const rats = (g.flags.subwayRatsSeen ?? 0) + 1
  g.flags.subwayRatsSeen = rats
  
  const lines = [
    'A subway rat! They're everywhere! 🐀',
    'Another rat. At this point we're roommates. 🐀',
    'Rat #3. We made eye contact. I looked away first. 🐀',
    'The rats run this city. I'm just visiting. 🐀',
  ]
  
  g.say(lines[Math.min(rats - 1, lines.length - 1)])
  g.sfx.squawk()
  
  if (rats === 4) {
    g.stamp('rat-spotter')
    g.confetti(8)
  }
}

// ---------- "I'm Walking Here!" Collision ----------
export const walkingHere: Act = (g: Game) => {
  const bumps = (g.flags.nycBumps ?? 0) + 1
  g.flags.nycBumps = bumps
  
  if (bumps === 1) {
    g.say('HEY! I'M WALKIN' HERE! 🚶')
  } else if (bumps === 2) {
    g.say('WATCH IT! This is MY sidewalk! 🚶')
  } else {
    g.say('Ope! Sorry! (Wait, that's Midwest. I mean: MOVE!) 🚶')
  }
}

// ---------- Street Vendor Hype ----------
export const streetVendorCall: Act = (g: Game) => {
  const lines = [
    '"YO! Check out these watches! Rolex! Very real!"',
    '"Designer bags! Louis! Gucci! Ten dollars!"',
    '"I got DVDs! All the movies! Three for five!"',
    '"Perfume! Chanel! Smell just like the real thing!"',
  ]
  
  g.say(lines[Math.floor(Math.random() * lines.length)])
}

// ---------- Times Square Overwhelm ----------
export const timesSquareOverwhelm: Act = (g: Game) => {
  if (g.flags.tsOverwhelm) return
  
  g.flags.tsOverwhelm = true
  g.say('Times Square is… a LOT. Lights! Sounds! Elmo! 🗽✨')
  g.confetti(20)
  
  setTimeout(() => {
    g.say('(Deep breath. I can do this. I'm a New Yorker now.)')
  }, 2000)
}

// ---------- Starducks Order (misspelled name) ----------
export const starducksCoffee = (playerName: string): Act => async (g: Game) => {
  // Mangle the name like the code already does for Ralph's
  const mangled = mangleName(playerName)
  
  const v = await g.choose(
    '☕ Starducks Coffee',
    `"Welcome to Starducks! Can I get a name for your order?"`,
    [
      { label: `"${playerName}"`, value: 'order' },
      { label: 'Just Browsing', value: 'no' },
    ]
  )
  
  if (v === 'order') {
    g.say(`They wrote "${mangled}" on my cup. Classic. ☕`)
    g.confetti(8)
    
    // Give them a coffee item (we'd need to add this to items.ts)
    // For now, just a stamp
    if (!g.flags.starducksCoffee) {
      g.flags.starducksCoffee = true
      g.stamp('starducks-regular')
    }
  }
}

// Name mangling logic (borrowed from baristaName in rooms.ts)
function mangleName(name: string): string {
  const word = name.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])/)?.[0] ?? ''
  const n = word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  if (n.length < 2) return 'Mystery Person'
  if (/^ma/i.test(n)) return 'Mayonnaise'
  
  const LAST_VOWEL: Record<string, string> = { a: 'e', e: 'i', i: 'y', o: 'u', u: 'oo', y: 'ie' }
  const tries = [
    (s: string) => s.replace(/^([BCDFGJKLMNPRSTVWZ])(?!h)/, '$1h'),
    (s: string) => s.replace(/[aeiouy](?=[^aeiouy]*$)/, (v) => LAST_VOWEL[v] ?? v),
    (s: string) => s.replace(/([bcdfgklmnprstvz])$/, '$1$1e'),
    (s: string) => `${s}ford`,
  ]
  
  const start = (n.length + new Date().getDate()) % tries.length
  for (let i = 0; i < tries.length; i++) {
    const out = tries[(start + i) % tries.length](n)
    if (out.toLowerCase() !== n.toLowerCase()) return out
  }
  return `${n}ish`
}

// ---------- Alternate Side Parking Joke ----------
export const parkingSign: Act = (g: Game) => {
  g.say('I've been staring at this sign for 5 minutes. Still no idea when I can park. 🅿️')
  
  if (!g.flags.parkingConfusion) {
    g.flags.parkingConfusion = true
    setTimeout(() => {
      g.say('(Narrator: No one knows. Not even the cars.)')
      g.stamp('parking-confused')
    }, 2000)
  }
}
