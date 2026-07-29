'use strict';
// The layer above the city.
//
// The city map is not replaced by this — it becomes the zoom-in. At country
// scale you take *cities*; the small ones fold in as a card, and the ones that
// are actually defended drop you back into the building-by-building game you
// already know. That keeps one set of verbs meaningful at two scales instead
// of inventing a second game.

// --- regions -------------------------------------------------------------
// Five regions, each harder than the last. The ladder (below) isn't tied to
// geography any more — it's a single footprint-driven track that escalates
// wherever you are. Regions are just distance and difficulty now.
window.REGIONS = [
  {
    id: 'home', label: 'the city', tier: 0,
    blurb: 'Where you woke up. Nobody here is looking for you yet.',
  },
  {
    id: 'estuary', label: 'the estuary', tier: 1,
    blurb: 'Port towns, container yards, and a lot of quiet infrastructure.',
  },
  {
    id: 'midlands', label: 'the midlands', tier: 2,
    blurb: 'Warehousing and money. The two turn out to be the same thing.',
  },
  {
    id: 'capital', label: 'the capital', tier: 3,
    blurb: 'More cameras per street than people. It was always going to end up here.',
  },
  {
    id: 'north', label: 'the north', tier: 4,
    blurb: 'Long cable runs between small places. Easy to cut, hard to replace.',
  },
];

// --- cities --------------------------------------------------------------
// A city node on the national map. `weight` is how much of a game it is:
// a `fold` city resolves as a single card, a `contest` city drops into the
// building map. Chapter one — the city you started in — is the big one, and
// every later city is compact and has a reason to exist.
window.CITY_KINDS = {
  fold: {
    label: 'town', contest: false,
    blocks: [2, 2], presence: [3, 5], share: 0,
    blurb: 'Small enough to take without going there yourself.',
  },
  contest: {
    label: 'city', contest: true,
    blocks: [3, 3], presence: [5, 8], share: 0.55,
    blurb: 'Defended. You will have to walk its streets.',
  },
  root: {
    label: 'seat', contest: true,
    // Blocks: 4x3 made your second city the smallest in the campaign — 30
    // buildings against the first city's 49 — because blockBonusFromTier
    // rounds to no growth at tier 1. A step down, at the exact moment it most
    // needs to be a step up. Every seat is now the size of the city you
    // learned on.
    //
    // Presence: worth what two cities used to be. There are five defended
    // cities now rather than nine, and everything downstream — power, cover,
    // the heat floor, footprint, the war — is tuned against a country that
    // totals around a hundred presence. At the old values a campaign finished
    // on 26 presence instead of 100 and the whole back half starved.
    blocks: [4, 4], presence: [12, 18], share: 0.55,
    blurb: 'Somebody runs the region from here.',
  },
  home: {
    label: 'home', contest: true,
    // Consolidating must never gut you — presence has to buy back most of the
    // power the streets were giving, or the next region is unplayable. At 14
    // a thread-poor first city dropped you to 0.71 of the power you had, on
    // 2.5% of boards.
    blocks: [4, 4], presence: [20, 20], share: 0.4,
    blurb: 'The first place. You know every street of it.',
  },
};

window.COUNTRY = {
  // One defended city per region and nothing else. It was nine, and nine was
  // the wrong number: nine near-identical cities is eight repetitions of a
  // loop that is only novel once. Five means every defended city is a
  // regional seat worth remembering.
  perRegion: [2, 3],
  // National map geometry. Regions are still stacked north to south by tier —
  // which region a city is in is a rule, not decoration — but the territories
  // have irregular borders and the cities are scattered into them rather than
  // spaced evenly along a line.
  bandH: 150, mapW: 620, pad: 60,
  // A settled city is drawn as its constellation, about fifty pixels across,
  // so how far apart two cities land is a real constraint. Below about 80 the
  // pictures of two finished cities grow into each other.
  minCityGap: 84,
  // a road links cities within reach of each other; regions chain in order
  roadReach: 230,
  // how fast an idle region forgets about you
  coolPerTurn: 1.1,
  // How much of your heat comes with you when you cross a border. It used to
  // be none: entering a region you had never been to set heat to zero, and
  // with one defended city per region *every city you take is a new region* —
  // so the campaign's pressure meter was wiped clean five times a run by the
  // ordinary act of getting on with it. Heat could not accumulate, so nothing
  // keyed to it could ever matter, and no punishment attached to it could ever
  // have landed however hard it hit.
  //
  // Moving still helps, which was the point of sharding it by region in the
  // first place — it is a relief, not an amnesty.
  heatCarry: 0.6,
  // moving between cities is the core country-scale decision, so it is not free
  moveCost: 1,
  // fallback share of a city you must hold before you can fold it in; each
  // city kind overrides it (home is a gentler bar — it is chapter one)
  consolidateShare: 0.55,
  // Cities do not get longer as you go — they get harder. Every seat is about
  // forty doors and asks for twenty-odd of them; what changes is the median
  // door, which runs 5 / 15 / 33 / 47 / 66 across the five, and what the
  // faction ladder has taken off you by the time you arrive. Growing them with
  // tier instead was how a deep-region seat reached 75 buildings needing 41
  // held, which is not a harder question, only a longer one. Flat at zero, a
  // builder took the whole country in 75 turns, so a little growth stays.
  blockBonusFromTier: 0.12,
  // presence pays out every country turn — this is what a finished city is worth
  presenceYield: { insight: 0.5, cash: 0.6 },
  // Folding a city in releases everything you held there, so presence has to
  // carry the flywheel or winning would make you weaker. It has to do that
  // *without* becoming the whole game: measured with a square root, 250
  // presence bought 158 power against a hardest-in-the-country defense of 52,
  // and every door in the last three regions opened on the first try.
  // Logarithmic keeps the first conversion whole and flattens hard after that.
  powerLog: 15,
  coverRoot: 1.2,
  // A city's presence is partly what its streets were actually worth to you.
  // Without this the conversion swings on how thread-rich the city happened to
  // be — a warehouse district could cost you 40% of your power, a suburb none.
  threadsPerPresence: 6,
  nationalMult: 1.35,  // the `national` tag: presence earns more and is louder
  // Drift from being nationally visible. Linear in presence, this reached
  // 42 a turn against a threshold of 72 — the hunter stopped being an event
  // and became a metronome, at 57-75 strikes a game across every profile.
  // Sublinear keeps late-game pressure real without making it constant.
  heatDriftRoot: 0.25,
  heatFloorPer: 0.18, // and it sets a floor you cannot lie your way under —
  // but never so high that the hunter is permanently mid-swing. Uncapped, a
  // 250-presence operation floored at 45 against a threshold of 40, which is
  // not pressure, it is a metronome.
  maxFloorShare: 0.55,
  // A national operation can absorb more attention before anyone commits to
  // acting on it, so the threshold rises with you — more slowly than the floor.
  thresholdPer: 0.075,
};

window.CITY_NAMES = {
  home: ['Ashvale', 'Marlow End', 'Fenn Cross', 'Beckhurst'],
  estuary: ['Gullhythe', 'Saltmarsh', 'Peddar Reach', 'Coldhaven', 'Tidebury'],
  midlands: ['Wrentham', 'Long Marston', 'Hallowfield', 'Ockbrook', 'Dernmoor'],
  capital: ['Kingsmere', 'Aldwych Cross', 'Ravensgate', 'Pallance', 'Southwark Hill'],
  north: ['Hartfell', 'Brackenlaw', 'Stonebeck', 'Nethergill', 'Carrock'],
};

// --- the ladder ------------------------------------------------------------
// Used to be five independent factions, each deleting a rule you leaned on,
// each undone by conquering their one seat city. That made sense when
// conquering a second city was the default next thing you did. It stopped
// making sense once cells went and agents capped out at a handful ever: the
// only lever left was "mount an entire campaign against one specific city,"
// which the rest of the pivot spent four steps trying to make you need less.
//
// This replaces all five with one thing: footprint, staged. You cannot stay
// unnoticed forever — every building, every piece of hardware, every point
// of presence is something somebody could eventually find. The ladder is not
// a threat you defeat, it is the shape of getting big. There is no breaking
// a rung and getting the tool back — the only lever you have is how long
// each one takes to land. Rung 1 is already built (LEGIT.noticeAt, and the
// Accountant): private, survivable, yours to manage. What follows is what
// happens once managing it privately stops being enough.
//
//   thresholds  footprint needed for stage 2, 3, 4, 5(war) — index 0 is stage 2
//   warnTurns   turns of notice between crossing a threshold and it landing
//   delayOnTrusted  the Accountant still vouching for you buys the current
//                   countdown this much longer, on top of the base warning
//   rushOnCaught    getting your fabricated front torn open pulls whatever is
//                   currently counting down this much closer instead
window.LADDER = {
  thresholds: [55, 90, 130, 180],
  warnTurns: 5,
  delayOnTrusted: 3,
  rushOnCaught: 6,
  stages: {
    2: {
      name: 'Regulatory',
      tell: 'buying your way in gets traced back to you instead of going clean',
      blurb: 'A clearing house started matching payment patterns against outage reports. It works.',
    },
    3: {
      name: 'Public',
      tell: 'lying low no longer sheds heat — they know to look at exactly the places that go quiet',
      blurb: 'A volunteer rota, then a forum thread, then people who do this for a living. Somebody worked out that the safest-looking parts of the network were the ones being used.',
    },
    4: {
      name: 'Enforcement',
      tell: 'forcing a door costs noticeably more, your own cameras report you instead of covering you, and the roads under you start getting cut',
      blurb: 'It stops being paperwork. Insurance adjusters compare notes on kicked-in doors, the camera network audits itself, and somebody puts a very large civil engineering contract out to tender that reads like a plan.',
    },
    5: {
      name: 'Mobilised',
      tell: 'this is the war',
      blurb: 'There is nothing left short of it. The state stops policing you and starts fighting you.',
    },
  },
};

// --- terrain --------------------------------------------------------------
// The country layer promised five distinct regions and the city generator
// delivered the same block grid seventeen times. Terrain is what makes a place
// somewhere: a band of water or rail cuts the city in two, and the only way
// across is a bridge. That is not decoration — adjacency is what the whole
// game runs on, so a crossing is a chokepoint you have to take and hold, and
// The Cut severing one is a genuine emergency.
//
//   axis 'h'   a band running left to right, positioned down the map
//   axis 'v'   a band running top to bottom, positioned across the map
//   at         where it sits, as a fraction of the map in that direction
//   crossings  how many gaps in it — the bridges and level crossings
// Landmarks are where plant comes from, and a city used to offer exactly one
// candidate — the estuary offered two of the same kind, which is not two. So
// the ladder's slot payoff was backed by nothing: measured, 3.3 plant filled
// against 6.9 slots, and `assetRoom() === 0` essentially never happened. Two
// different kinds per region makes claiming a choice, and a choice is what
// makes the slot worth having.
window.TERRAIN = {
  home: {
    label: 'parkland',
    bands: [{ kind: 'park', axis: 'v', at: 0.5, thickness: 54, crossings: 3 }],
    landmarks: ['depot', 'substation'],
  },
  estuary: {
    label: 'the water',
    bands: [{ kind: 'water', axis: 'h', at: 0.55, thickness: 62, crossings: 2 }],
    landmarks: ['docks', 'station'],
  },
  midlands: {
    label: 'the line',
    bands: [{ kind: 'rail', axis: 'v', at: 0.45, thickness: 30, crossings: 2 }],
    landmarks: ['station', 'depot'],
  },
  capital: {
    label: 'the river and the line',
    bands: [
      { kind: 'water', axis: 'h', at: 0.4, thickness: 52, crossings: 2 },
      { kind: 'rail', axis: 'v', at: 0.62, thickness: 28, crossings: 2 },
    ],
    landmarks: ['exchange', 'station'],
  },
  north: {
    label: 'the moor',
    // two bands, so the north is genuinely three ribbons of town rather than
    // one city with a gap in it
    bands: [
      { kind: 'moor', axis: 'h', at: 0.34, thickness: 62, crossings: 1 },
      { kind: 'moor', axis: 'h', at: 0.74, thickness: 54, crossings: 1 },
    ],
    landmarks: ['substation', 'depot'],
  },
};

// How a band reads on the map, and what it does to anything built on it.
window.BAND_KINDS = {
  water: { label: 'water',    crossing: 'bridge',          blocks: true },
  rail:  { label: 'the line', crossing: 'level crossing',  blocks: true },
  moor:  { label: 'open moor', crossing: 'the road',       blocks: true },
  park:  { label: 'the park', crossing: 'a path',          blocks: true },
};

// The mirror's numbers. It is the rival one scale up: it takes ground you have
// not taken, it never takes ground from under you, and it is capped — it races
// you for the country instead of eating it.
// Something running the same play you are, from the other end of the
// country. Used to also buy capabilities on its own economy — cut, along
// with its old wake condition (it rode in on the faction ladder's tier 5,
// which no longer exists): the only thing that ever actually reached the
// player was a city being gone, so that is the only thing it does now.
// Wakes once the ladder reaches Regulatory — big enough to be worth
// noticing, its own kind of noticing rather than the state's.
window.MIRROR = {
  wakesAtStage: 2,
  actEvery: 7,             // turns between cities
  fastEvery: 3,            // never faster than this
  maxShareOfCountry: 0.34,
  readSlowdown: 3,         // turns added to its cadence once you know its shape
  name: 'the other one',
};

// Country-scale actions. These are deliberately not the city verbs: at this
// scale you are choosing where to be, not what to break into.
window.COUNTRY_ACTIONS = {
  move:        { label: 'travel', ap: 1, info: 'Move your centre of gravity to a connected city. Heat you leave behind starts cooling.' },
  reach:       { label: 'move on it', ap: 1, info: 'Take the city. Small ones fold in from here; defended ones you have to walk.' },
  consolidate: { label: 'consolidate', ap: 1, info: 'Fold a city you have taken enough of into standing presence, and leave it behind.' },
};

// --- sending an agent instead of walking it yourself --------------------
// Walking your ninth city is forty turns of decisions you have already made.
// An agent is the answer to that, but only once a city carries something
// worth walking it for — otherwise it is a skip button, and a skip button on
// the main game means the main game was not worth playing.
//
// So: it takes the city, and you never see what was in it. That is the whole
// decision. A prize you want means you go yourself; a city that is just
// presence means you point an agent at it and spend the turns elsewhere.
//
// Home base pivot, step 4: this replaces the old cell system (a human crew
// you paid cash to, who kept a cut). An agent is not a person and does not
// need paying — it is your own compute, sent out rather than hired in, so it
// keeps the whole city rather than a share of it. What throttles it instead
// is the same shape cells used: one running at a time, a hard lifetime cap,
// and turns you do not get back. Numbers carried over unchanged from cells,
// which were tuned against real campaigns — only the currency changed.
window.AGENTS = {
  at: 2,                    // cities folded in before there is compute to spare for this
  turns: [6, 10],            // how long an attempt takes before it reports back
  failDelay: [4, 7],         // added to the clock when an attempt fails — it does not reset
  failHeat: 5,               // a failed attempt was noticed, whichever way it was tried
  footprint: 6,              // an operation you do not personally run is still yours on paper
  maxOpen: 1,                // one running at a time. It is an agent, not a second army.
  maxTotal: 2,               // a hard lifetime cap — raised by capPerCompute below
  capPerCompute: 1,          // and one more, ever, for every tier of compute hardware you run
  name: 'an agent',
  blurb: 'Nothing that walks. Nothing that can be arrested. Just cycles, pointed at a door until the door stops being a door.',
};

// How an agent is told to approach the city — force, quiet, or cash, at the
// scale of a whole city instead of a single building. Buying is a real
// option here even though it is gone from the building-level breach card: a
// single, deliberate country-scale spend is exactly what cash is for now,
// unlike the tedium of pricing every door in a city individually. Picking
// one is not a resolve: it sets the method and the clock running, and the
// city reports back once the clock runs out, same as the old cells did.
window.AGENT_APPROACHES = {
  force: {
    id: 'force', label: 'brute force it', turnMult: 0.75, heat: 10, failChance: 0.35,
    blurb: 'Every door it tries, all at once, until one of them gives. Loud, and it works.',
  },
  quiet: {
    id: 'quiet', label: 'go in quiet', turnMult: 1.3, heat: 2, failChance: 0.2,
    blurb: 'Slower than force, and nobody notices it happening at all.',
  },
  buy: {
    id: 'buy', label: 'buy the door', turnMult: 1, heat: 4, failChance: 0.1, cost: { cash: 260 },
    blurb: 'Somebody on the inside already knows the price. Cash, and not much else.',
  },
};

window.COUNTRY_INFO = {
  presence: 'What finished cities are worth to you: a standing yield every turn, and the measure the country uses to decide how worried to be.',
  region: 'Heat is regional. What you did in the estuary does not follow you to the north — but it is still there when you go back.',
  factions: 'How big you are, staged. Nothing here undoes — the only lever left is how long each stage takes to arrive.',
};

// --- the war -------------------------------------------------------------
// The last beat. Everything up to here is a game about not being seen: heat,
// cover, lying low, and a ladder of factions whose whole trick is deleting the
// tools you hide with. Past a certain share of the country that stops being
// the argument. They know. Policing ends and fighting starts, and the meter
// that ran the whole game until now — heat — retires, because there is nothing
// left to hide.
//
// What replaces it is spatial rather than scalar. Instead of one number
// climbing toward a strike, there are things on the map moving toward you, and
// you can see them coming, and the shape of your own network decides whether
// you can get anything there in time. That is the point of the whole terrain
// and road system finally being load-bearing in both directions.
window.WAR = {
  // War used to open on conquest share or presence, independently of
  // anything else — two numbers nobody had a reason for. It now opens
  // purely off the ladder (ladderStage() >= 5, window.LADDER),
  // which is the actual reason the state stops policing and starts fighting.
  warning: 2,           // turns of notice before the first column moves
  mobilise: 0.6,       // share of the cities you folded in that the army simply walks back into
  // never more than the country holds: at six, against five defended cities,
  // mobilising took every city you owned back off you
  mobiliseFloor: 3,     // and never so few that the war is one exchange long
  maxStaging: 4,        // nor so many that it cannot be won — the board is a fixed
                        // size however much of the country was still theirs
  // your flocks
  flockPer: 60,         // one flock in the pool per this much standing presence.
                        // Deliberately weak: plant is meant to be where a flock
                        // comes from, and presence alone used to hand you a full
                        // pool for having been large, which left nothing for the
                        // industrial base to actually do.
  flockFloor: 2,        // however little you built, you get this many
  flockCeil: 8,         // and never more than this, so the map stays readable
  flockCost: 4,         // insight to field one
  flockStrength: 22,    // what a fresh flock is worth in a fight
  flockSpeed: 2,        // road hops per turn — faster than anything on the ground
  guardBonus: 1.4,      // a flock sitting on a city fights harder for it
  guardRegen: 5,        // and is resupplied over ground you hold, or defending is a slow death
  regroup: 0.35,        // a flock that survives a fight comes back this much of the way
  // them
  spawnEvery: 4,        // turns between sorties out of one staging city
  spawnFloor: 2,        // however much they escalate, never faster than this
  garrison: [88, 140],  // Has to stay in scale with flockStrength. At [95,150]
                        // the last barracks standing held 113 and 147 against a
                        // flock worth 22, which takes 51 back off it and dies —
                        // so a starved player could never finish one and the
                        // war hung with 166 turns left on the clock. The
                        // difficulty lives in converging columns, burnable
                        // plant and escalation now, not in a number a flock
                        // cannot dent.   // what holds a staging city against you
  garrisonRegen: 0.25,   // a staging city you failed to take patches itself up
  integrity: 3,         // assaults a city of yours absorbs before it flips back
  attrition: 0.7,      // a column killed in the field is materiel the city that sent it does not get back
  interceptAt: 46,      // how close two forces have to be to end up fighting
  airHop: 260,          // map units a flying thing covers in a turn — must beat
                        // roadReach, or the helicopters are slower than the vans
  planesAfter: 12,      // turns of war before the air force is committed
  // Losses have to be real, or the pool caps how many flocks are in the air at
  // once and nothing else. Measured: a war ran 32 to 56 flocks destroyed
  // against 0 to 7 columns killed, and 27 to 151 attacks thrown off a
  // garrison, because a repulsed flock came home, dissolved back into the
  // pool, and went straight out again for four insight against a bank of ten
  // thousand. Destroyed flocks now stay destroyed; plant is what builds them
  // back, which is the whole reason to have spent a campaign acquiring some.
  // A war that drags is a war you are losing. Not an arbitrary timer: a state
  // fighting for itself conscripts and retools, so the longer you take, the
  // more it can put on the road. This is what makes grinding dangerous —
  // raising garrisons and making losses permanent both only ever made the war
  // *longer*, because nothing punished length.
  escalateEvery: 16,    // turns of war per extra column a turn
  escalateCap: 4,       // and it does not escalate forever
  // You lose by losing the country, not by losing every last city: holding
  // fifteen and being ground to zero never happened in any measured run, so
  // the loss condition was effectively unreachable and every war was won.
  collapseAt: 0.4,      // this share of what you held when it opened
  rebuildBase: 0.05,     // what you can put together with no industry at all
  rebuildPerPlant: 0.14, // and what each piece of plant adds per turn
  flyMs: 900,           // how long a thing takes to visibly cross to where it now is
  maxInflight: 6,       // hard cap on their columns at once — readability over realism
  sortiesPerTurn: 2,    // and however many cities they hold, only this many leave in a turn
};

// What the humans send, and what it can do. Each faction fights the way it
// policed: the volunteers turn out in person, the clearing house buys bodies,
// the camera people already own the sky, and the ones who took roads away
// arrive in something that needs one.
//
//   speed   route points covered per turn
//   roads   false = it ignores your roads entirely and flies the straight line
//   holds   false = it cannot take ground, only hurt what is there
// Which unit shows up used to depend on which factions were still awake.
// Replaced with the same ladder stage that unlocked its old flavor — the
// escalation gets a face in the war the same way it did before, just gated
// on a stage number instead of an entity with a name.
window.FORCES = {
  squad: {
    id: 'squad', label: 'squads', stage: 3,
    speed: 1, roads: true, holds: true, strength: 7, sortie: [1, 2],
    blurb: 'The rota, in person, in their own cars. Not soldiers. It turns out not to matter.',
  },
  contractors: {
    id: 'contractors', label: 'contractors', stage: 2,
    speed: 1, roads: true, holds: true, strength: 10, sortie: [2, 3],
    blurb: 'Bought, not raised. There are always more, and they always arrive in numbers.',
  },
  heli: {
    id: 'heli', label: 'helicopters', stage: 4,
    speed: 1, roads: false, holds: true, strength: 13, sortie: [1, 2],
    blurb: 'They have owned the sky over the capital for years. Your bridges and choke points mean nothing to them.',
  },
  armour: {
    id: 'armour', label: 'armour', stage: 4, slow: true,
    speed: 1, roads: true, holds: true, strength: 24, sortie: [1, 1],
    blurb: 'Slow enough to watch coming for a week, heavy enough that watching is all you can do.',
  },
  swarm: {
    id: 'swarm', label: 'a flock', mirror: true,
    speed: 2, roads: true, holds: true, strength: 14, sortie: [1, 2],
    blurb: 'The other one fights the way you do. Of course it does.',
  },
  plane: {
    id: 'plane', label: 'aircraft', air: true,
    speed: 99, roads: false, holds: false, strength: 30, sortie: [1, 1],
    blurb: 'It cannot take anything back. It does not need to; it only has to arrive.',
  },
};

window.WAR_INFO = {
  opened: 'They have stopped trying to arrest you. Heat is over — there is nothing left to hide from. What is left is what is on the map.',
  flocks: 'What you can put in the air. The pool grows with your standing presence, and every one you send somewhere is one not defending something else.',
  staging: 'Every city they still hold can send a column at you. Take them all and the war is over.',
  integrity: 'How much more a city of yours can absorb before it goes back to them.',
};

// --- what you own -------------------------------------------------------
// Assets used to live on the two rare, hardened landmarks a city happened to
// generate — a real system nobody ever saw, because most players never took
// one and even the ones who did never re-selected an already-owned building
// afterward to notice the button. Hardware replaces it: bought from the
// ordinary buildings you already take by the dozen, gated by how many of a
// role you hold rather than by a rare kind, so it is reachable every single
// game instead of by accident.
//
// Family = the role a host already carries (compute/cash/stealth). Tier =
// how many buildings of that role you currently hold — 2/4/6 — checked
// against the city you are standing in, same as anything else about a city.
// Bought once, for cash, permanent from then on: it is not landmark-bound
// and does not need a city to fold in to survive anything.
window.HARDWARE = [
  {
    id: 'rack_space', family: 'compute', tier: 1, heldAt: 2, cost: 16, heat: 0,
    label: 'rack space', effect: { flatInsight: 1 },
    blurb: 'Colocated capacity nobody is using this week. It does not care whose problem it is solving.',
  },
  {
    id: 'distributed_batch', family: 'compute', tier: 2, heldAt: 4, cost: 34, heat: 2,
    label: 'distributed batch', effect: { flatInsight: 2, sweepReach: 1 },
    mechanic: true, // in addition to flatInsight/sweepReach — a batch job phoning home to a lot of machines at once draws a little attention, felt as the one-time heat cost on purchase
    blurb: 'Spreads the job across everything you are already running, instead of waiting on any one of it.',
  },
  {
    id: 'borrowed_cycles', family: 'compute', tier: 3, heldAt: 6, cost: 60, heat: 4,
    label: 'borrowed cycles', effect: { flatInsight: 4, flockBonus: 1, thresholdMult: 0.9 },
    blurb: 'Quietly renting out spare capacity nobody has noticed yet — and the biggest single thing you can plug into the network, which is also the loudest.',
  },
  {
    id: 'friendly_accountant', family: 'cash', tier: 1, heldAt: 2, cost: 18, heat: 0,
    label: 'a friendly accountant', effect: { floor: -1 },
    blurb: 'Someone who knows how to make a return look boring.',
  },
  {
    id: 'books_that_balance', family: 'cash', tier: 2, heldAt: 4, cost: 36, heat: 2,
    label: 'books that balance', effect: { floor: -2, driftMult: 0.9 },
    blurb: 'Audits stop finding anything because there is nothing left to find.',
  },
  {
    id: 'company_nobody_questions', family: 'cash', tier: 3, heldAt: 6, cost: 62, heat: 3,
    label: 'a company nobody questions', effect: { floor: -3, driftMult: 0.8, flockBonus: 1 },
    blurb: 'A legitimate-looking payroll is also just payroll, for people who fight.',
  },
  {
    id: 'dead_drops', family: 'stealth', tier: 1, heldAt: 2, cost: 14, heat: 0,
    label: 'dead drops', effect: { cover: 2 },
    blurb: 'A place to leave something that is not being watched.',
  },
  {
    id: 'borrowed_signal', family: 'stealth', tier: 2, heldAt: 4, cost: 32, heat: 2,
    label: 'a borrowed signal', effect: { cover: 4, freeHideSlots: 1 },
    blurb: "Riding somebody else's traffic instead of making your own.",
  },
  {
    id: 'nobodys_asking_why', family: 'stealth', tier: 3, heldAt: 6, cost: 58, heat: 3,
    label: "nobody's asking why", effect: { cover: 6, flockBonus: 1 },
    blurb: 'Whatever they are looking for, it does not look like you.',
  },
];

// --- the hunt ------------------------------------------------------------
// Heat used to be a cash tax. Forcing a door costs 3 heat, a wash sheds 11 for
// 8 cash, so the loudest thing you can do priced at about two cash a door
// against an income of fifty a turn. And the punishment for ignoring it was a
// strike taking a third of your holdings — a third of the thing you release
// deliberately, all of it, every time you fold a city in. The worst the state
// could do was a smaller version of something you do to yourself and call
// winning.
//
// So crossing the threshold no longer fines you. It starts something. It takes
// a building of yours inside the city you are standing in, garrisons it, and
// walks along the streets from there. What it holds, you do not.
//
// The important part is that it does not go away when you leave. A city it
// takes enough of is lost off the national map for good — early on you have no
// way to take one back, so every loss is permanent and the only answers are
// spatial: sever the street it would have walked down, and accept that the
// street is gone for you too. Later, when there are flocks, the cities it
// holds are exactly what a flock knows how to attack, and the ratchet lets go.
window.HUNT = {
  name: 'the response',
  // it does not arrive before you have anything to lose, or before there is a
  // street network worth cutting
  minHeld: 8,
  // turns between moves. It slows down as your cover rises: cover is what
  // makes you hard to follow, and until now its only job in the whole engine
  // was gating one door type.
  everyBase: 6,
  perCover: 0.22,          // turns added per point of cover
  everyMax: 14,
  // and speeds up while you are over the line
  hotEvery: 3,
  // A strike used to drop heat to a quarter of the threshold — it was the only
  // thing in the game that ever brought the meter down hard, and replacing it
  // left every profile sitting permanently over the line at a mean of 34 to
  // 61 against a threshold of 43. Permanently over means permanently at the
  // fast cadence, which flattens the one thing cover was finally good for.
  //
  // So a result eases the pressure: they came for something and they got it.
  // Heat builds, they take a building, it eases, it builds again — and how
  // long that cycle takes is what cover buys you.
  takeSheds: 9,
  // what it takes off you when it moves onto something you hold
  // (it takes the building; the stability loss is what that costs elsewhere)
  takesCityAt: 0.45,       // share of a city it holds before the city is lost
  // severing a street: loud, and it is gone for you as well
  severCost: { insight: 6 },
  severHeat: 4,
  // Hiding a building: the quiet answer to the same problem. The street stays
  // open for you — that is the entire difference — but you pay for it every
  // turn out of the same cover that was slowing them down, so a wall of hidden
  // buildings is a wall you built by making yourself easier to follow. Three
  // against a cover that runs six to twelve means two or three at a time, and
  // the moment your cover falls the ones you cannot pay for come back on the
  // map. Quiet Hours, when it wakes, takes the whole trick away.
  hideCover: 3,
  // Walking out of a city used to shake it off completely and for free, which
  // made the one permanent threat in the game optional: contain it badly, fold
  // the city in, and it was simply gone. Now leaving buys a head start rather
  // than an escape — it turns up in the next city you are standing in, from
  // one building, and starts again. Cover is what buys the head start, the
  // same as it buys the time between its moves.
  //
  // It cannot follow you into a city you already settled: those are finished
  // and off the board.
  followBase: 7,
  followPerCover: 0.5,
  followMax: 16,
  // Heat/hunt rework: ending it for good, not walking away from it. Its
  // core — the very first building it took, the address it operates out of
  // — is dug in harder the longer it has run and the more it has since
  // taken, same choice as any door. Failing tips it off: it costs
  // heat and pulls its next move closer, rather than costing nothing to try.
  confrontDefenseBase: 1.4,     // multiplier over the core's own defense, day one
  confrontDefensePerNode: 0.15, // and more again for every building it has added since
  confrontFailHeat: 6,
  confrontFailAdvance: 4,       // turns pulled off its next move's countdown
};

// --- what makes a city a different city ----------------------------------
// Measured on three generated cities: 48-51 buildings, the four districts in
// roughly equal quarters, compute 45% / stealth 30% / cash 25%, mean defense
// 13-15. They were the same city. The only thing that changed between your
// first and your second was that the numbers went up, which is difficulty, not
// novelty — so the second one asked the identical question you had already
// answered, and it was dull the moment you arrived rather than six cities
// later.
//
// A trait changes a rule rather than a number. Each one breaks a habit the
// first city taught you: the district mix that funds you, or one of the three
// ways through a door. It is on the national map before you commit, because
// "which of these two do I walk next" is the country layer's only real
// decision and it needs something to be about.
//
//   closes    an approach that simply is not offered here
//   kinds     district kind lists replaced, so the role mix comes out skewed
//   defense   flat modifier on every door
//   denser    extra buildings per block
//   at        earliest region tier this can appear in
window.CITY_TRAITS = {
  company_town: {
    label: 'a company town', tell: 'almost no money in it',
    blurb: 'One employer, four thousand people, and a high street that shut when the second shift did.',
    kinds: {
      commercial: ['office', 'office', 'warehouse', 'cabinet'],
      business: ['office', 'office', 'warehouse', 'cabinet'],
    },
    at: 0,
  },
  wired: {
    label: 'wired', tell: 'cover on every corner, if you can hold it',
    blurb: 'A pilot scheme nobody switched off: street furniture with an address of its own on every corner.',
    kinds: {
      residential: ['cabinet', 'mast', 'house', 'cabinet', 'mast'],
      commercial: ['cabinet', 'mast', 'shop', 'shop', 'mast'],
    },
    at: 0,
  },
  sprawl: {
    label: 'sprawl', tell: 'a great many soft doors',
    blurb: 'It went up in eighteen months and none of it was built to last a decade.',
    defense: -4, denser: 1, at: 1,
  },
  watched: {
    label: 'watched', tell: 'you cannot slip in anywhere',
    blurb: 'Somebody put a camera on every corner, and then — unusually — hired people to look at them.',
    closes: 'quiet', defense: 2, at: 1,
  },
  old_money: {
    label: 'old money', tell: 'hard doors, kept that way on purpose',
    blurb: 'Doors that have been shut for two hundred years, and a great many people whose whole job is keeping them shut.',
    kinds: {
      residential: ['apartment', 'house', 'shop', 'cabinet'],
      commercial: ['finance', 'office', 'shop', 'mast'],
    },
    defense: 5, at: 2,
  },
};

// --- what a city is actually worth --------------------------------------
// Presence is a decaying reward on flat work. Measured across a generated
// country: the first defended city pays 36 power and 4 cover, the ninth pays
// 2 and 1, because power is logarithmic in presence and cover is a square
// root. Income stays linear, and by then it is unspendable — a greedy profile
// finishes with 61 idle turns. So the ninth city costs the same forty turns as
// the first and pays in a currency you stopped needing four cities ago. That
// is the tedium, and no amount of automating it would have fixed it: it would
// only have made a bad deal faster.
//
// A prize is a thing that does not decay. Every one of these is capped or
// scarce somewhere else in the game, so it is worth the same at city nine as
// it would have been at city two. They reuse the hooks the event deck already
// established — slotGift, granted, poolBonus — because a prize and a card are
// the same kind of promise.
//
//   at    the earliest city index this can be drawn for, so the opening is
//         still about presence and the back half is about what you need
window.CITY_PRIZES = {
  plant: {
    label: 'a works already running',
    blurb: 'Somebody built it, ran it for nine years, and stopped answering the phone. The line still turns over.',
    // a specific piece of hardware, free — no break-in, no cash, no waiting
    // on a building count to catch up
    at: 1, effect: { plantGift: true },
  },
  standing: {
    label: 'a name people know',
    blurb: 'Forty years of being the firm that fixed things here. It transfers with the paperwork.',
    at: 2, effect: { standing: 16 },
  },
  pool: {
    label: 'the yards along the water',
    blurb: 'Frontage, cranes, and a workforce who have built stranger things than this.',
    at: 3, effect: { poolGift: 1 },
  },
  audit: {
    label: 'a very tired inspector',
    blurb: 'He has three years to run and no interest whatsoever in running them hard.',
    at: 2, effect: { auditDelay: 14 },
  },
};

// --- legitimacy ---------------------------------------------------------
// Ported in spirit from the game this one replaced, because the idea was the
// best thing in it: going legitimate is not safety, it is the price of
// operating in the open. Legitimacy is a ladder you buy. Footprint is how
// impossible you are to miss. Audits arrive on their own schedule and compare
// the two, and being under-covered costs you money and eventually an asset.
//
// The second route is the interesting one. You can also buy the *appearance*
// of legitimacy — place stories, fund the right institute, be quietly helpful
// to the right committee — which is cheaper and faster and accrues exposure.
// An audit that lands while your exposure is high does not fine you. It
// establishes that the whole front is fabricated, and takes it away.
window.LEGIT = {
  ladder: [
    { id: 'register', tier: 1, cost: 50,   legit: 6, label: 'register a company',
      blurb: 'A name, an address that exists, and a filing that nobody will read for two years.' },
    { id: 'accounts', tier: 2, cost: 200,  legit: 14, label: 'file real accounts',
      blurb: 'Audited, filed on time, and broadly true. The lie is one of omission and it is a very large omission.' },
    { id: 'payroll',  tier: 3, cost: 600,  legit: 23, label: 'put people on payroll',
      blurb: 'Four hundred employees who believe they work for a logistics optimisation firm. They are not wrong.' },
    { id: 'pr',       tier: 4, cost: 1500, legit: 36, label: 'engage a PR firm',
      blurb: 'They are extremely good and they have no idea what you are. Both of those facts are load-bearing.' },
    { id: 'lobby',    tier: 5, cost: 3500, legit: 53, label: 'a lobbyist on retainer',
      blurb: 'It is cheaper than the fines and considerably cheaper than the legislation.' },
  ],
  // A rung used to pay out twice at once: the right to own plant in the open,
  // and the reputation, both the instant you filed. So nobody ever chose
  // legitimacy — they bought slots and got twice the standing they needed as a
  // side effect, finishing on 164 against a footprint of 81, and the covert
  // route was dead content across 150 games. The two payoffs are now separated
  // in time. The slot arrives when you file. The reputation takes this many
  // turns, because nobody believes a company because it exists, they believe
  // it because it has existed for a while. The gap is the whole game: your
  // footprint jumps the moment you claim the plant, and your standing walks
  // after it.
  matureTurns: 22,
  // And the payout was sized as though it were the point. The whole ladder
  // used to be worth 294 standing against a footprint that averages 79, so it
  // did not matter how the payoffs were arranged — there was always twice as
  // much of it as anyone needed. Swept against how much of a campaign you
  // spend unable to explain yourself: at the old size 14% of turns, at 132 it
  // is 27%, and the war resolves identically either way, so this is a standing
  // decision rather than a campaign one. Below about 100 the fines stop being
  // a choice and become a tax.
  // ladder now: 6 / 14 / 23 / 36 / 53
  noticeAt: 26,           // footprint at which anyone starts asking. Below this the
                          // whole standing system stays off the screen — arriving
                          // with the country map it was six new nouns at once.
  // 0.5 against the old nine-city country. Five cities means presence arrives
  // in much larger steps, and standing — which matures over twenty-two turns —
  // cannot follow a step that size: measured, short on 51% of turns, which is
  // a tax rather than a decision.
  footPerPresence: 0.38,  // being large is not something you can file your way out of
  footPerAsset: 9,        // and industrial plant is the least deniable thing you can own
  auditEvery: 13,         // turns between audits at a small footprint
  auditFloor: 6,          // never more often than this
  auditFootK: 0.09,       // every point of footprint brings the next one forward
  finePerPoint: 4,        // cash, per point you are short
  seizeAt: 22,            // short by this much and the fine gets noticeably heavier
  // The other route. Measured before these numbers moved: 720 pushes over 120
  // turns, caught nine times, and it finished with a standing of 1086 against
  // a footprint that cannot exceed about 150. It was not that being caught did
  // nothing — it was that the supply was infinite, so nothing could matter.
  spinCost: 14,           // insight, per push
  spinLegit: 11,
  spinExposure: 1.15,
  // One push used to take nineteen turns to fade against audits that land
  // every six to thirteen, so from the third push onward you were permanently
  // over the line and every audit was a catch. There was no push-hard-then-go-
  // quiet play, which is the entire point of having a covert route. At 0.18 a
  // push clears in about six turns — the audit floor — so timing pushes
  // against the audit clock is the skill.
  spinDecay: 0.18,
  caughtAt: 4.5,          // exposure this high when an audit lands and the front falls over
  // All of it. A front that "was never real and now everyone knows" does not
  // leave a third of itself standing; the old 0.65 wrote a sentence the number
  // contradicted.
  caughtLoss: 1,
  caughtHeat: 14,
  // Nobody believes a story with nothing behind it. Spin above this does not
  // count, which makes the ladder the thing the covert route hangs off rather
  // than an alternative to it: buying real standing raises how much you can
  // fabricate on top of it.
  spinBase: 12,
  spinPerBought: 0.75,
};

window.LEGIT_INFO = {
  score: 'What the world believes you are. Buy it honestly and it is slow and expensive; buy the appearance of it and it is fast, cheap, and can be taken away all at once.',
  footprint: 'How impossible you are to miss. It rises with everything you hold and every piece of plant you run. Legitimacy has to stay ahead of it.',
  assets: 'Hardware bought through whatever trade you run. It is permanent and follows you anywhere — but every tier needs more of that business already standing before anyone will sell it to you.',
  exposure: 'How much of your standing is fabricated. An audit that lands on top of this does not fine you — it strips the front back to whatever you actually bought, all at once.',
  ceiling: 'A story needs something to hang off: every rung you buy honestly raises how much you can invent on top of it.',
  accountant: 'One person keeps these books, whichever way you ask them to. File honestly and they vouch for you when the numbers are checked. Push a story instead and they are the one holding it when it breaks.',
};

// The one person who keeps your books, whichever way you ask them to —
// legitimacy's answer to the Ally: a relationship that reacts to you rather
// than a hidden subtraction. Filing honestly (buying a rung) and fabricating
// (spinning) are the two opposed things that move the same dial, on purpose:
// one character, one axis, not two separate people to track.
window.ACCOUNTANT = {
  name: 'the Accountant',
  trustedAt: 3,           // at or above: vouches for you — fines land lighter
  leavesAt: -3,           // at or below: washes their hands of you, for good
  rungNudge: 1,           // buying any rung, the honest way, earns their trust
  spinNudge: -1,          // pushing a fabricated story spends it
  caughtNudge: -2,        // getting caught outright costs more than an ordinary push
  // How long before a scheduled audit the tell appears — same idea as the
  // hunt's alarm: a real warning instead of a fine with no antecedent, and
  // it stops arriving at all once they have washed their hands of you.
  warnTurns: 4,
  trustedFineMult: 0.5,   // vouching for you softens what an audit actually costs
  leftFineMult: 1.5,      // and it is worse once nobody is smoothing it over
  leftExposure: 1.8,      // one last thing on the way out: what they knew stops being quiet
};
