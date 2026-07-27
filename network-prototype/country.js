'use strict';
// The layer above the city.
//
// The city map is not replaced by this — it becomes the zoom-in. At country
// scale you take *cities*; the small ones fold in as a card, and the ones that
// are actually defended drop you back into the building-by-building game you
// already know. That keeps one set of verbs meaningful at two scales instead
// of inventing a second game.

// --- regions -------------------------------------------------------------
// Five regions, each harder than the last, each the home ground of one faction.
// Geography is the ladder: to break a faction you have to go and take the city
// it operates out of.
window.REGIONS = [
  {
    id: 'home', label: 'the city', tier: 0,
    blurb: 'Where you woke up. Nobody here is looking for you yet.',
    faction: null,
  },
  {
    id: 'estuary', label: 'the estuary', tier: 1,
    blurb: 'Port towns, container yards, and a lot of quiet infrastructure.',
    faction: 'quiet_hours',
  },
  {
    id: 'midlands', label: 'the midlands', tier: 2,
    blurb: 'Warehousing and money. The two turn out to be the same thing.',
    faction: 'ledger',
  },
  {
    id: 'capital', label: 'the capital', tier: 3,
    blurb: 'More cameras per street than people. It was always going to end up here.',
    faction: 'civic_eyes',
  },
  {
    id: 'north', label: 'the north', tier: 4,
    blurb: 'Long cable runs between small places. Easy to cut, hard to replace.',
    faction: 'the_cut',
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
    blocks: [2, 2], presence: [2, 4], share: 0,
    blurb: 'Small enough to take without going there yourself.',
  },
  contest: {
    label: 'city', contest: true,
    blocks: [3, 3], presence: [5, 8], share: 0.55,
    blurb: 'Defended. You will have to walk its streets.',
  },
  root: {
    label: 'seat', contest: true,
    blocks: [4, 3], presence: [9, 13], share: 0.55,
    blurb: 'Somebody runs the region from here.',
  },
  home: {
    label: 'home', contest: true,
    blocks: [4, 4], presence: [10, 10], share: 0.4,
    blurb: 'The first place. You know every street of it.',
  },
};

window.COUNTRY = {
  // cities per region, excluding the root each region always gets
  perRegion: [2, 3],
  // national map geometry — cities are laid out in region bands
  bandH: 150, mapW: 620, pad: 60,
  // a road links cities within reach of each other; regions chain in order
  roadReach: 230,
  // how fast an idle region forgets about you
  coolPerTurn: 1.1,
  // moving between cities is the core country-scale decision, so it is not free
  moveCost: 1,
  // fallback share of a city you must hold before you can fold it in; each
  // city kind overrides it (home is a gentler bar — it is chapter one)
  consolidateShare: 0.55,
  // Cities out in the deep regions are a little bigger as well as harder.
  // Flat, a builder took the whole country in 75 turns — five turns a city,
  // which is not a city. At half a block per tier it overshot the other way:
  // a capital seat came out at 98 buildings needing 64 held, and one city ate
  // 834 turns. A quarter of a block per tier is the middle of that.
  blockBonusFromTier: 0.25,
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

// --- the factions --------------------------------------------------------
// This is the part that has to not be a difficulty slider. Each faction takes
// away a tool you had got used to leaning on. You do not out-stat them; you
// either play without the tool or you go and take their seat.
//
//   breaks   — the id of the rule this faction deletes, read by the engine
//   wakes    — the share of the country's *defended* cities you have folded in
//              before they take an interest. A share rather than a presence
//              number on purpose: presence moves every time a city's size or
//              worth is tuned, and the ladder should not have to be repaced
//              every time it does. Towns do not count — they are not milestones.
//   root     — set at generation: the city whose fall ends them
window.FACTIONS = [
  {
    id: 'quiet_hours', region: 'estuary', tier: 1,
    name: 'The Quiet Hours',
    breaks: 'lielow',
    wakes: 0.15,
    tell: 'lying low no longer sheds heat',
    blurb: 'A volunteer rota watching for the wrong kind of stillness. They noticed that the quiet places were getting quieter.',
    onWake: 'Somebody worked out that the safest-looking parts of the network were the ones being used. Going dark stops helping.',
    onBreak: 'The rota disbands the week after their coordinator stops answering. The quiet is yours again.',
  },
  {
    id: 'ledger', region: 'midlands', tier: 2,
    name: 'Ledger',
    breaks: 'launder',
    wakes: 0.3,
    tell: 'laundering raises heat instead of cutting it',
    blurb: 'A clearing house that started matching payment patterns against outage reports. It works.',
    onWake: 'Every account you wash through now leaves a shape somebody is looking for. Money is the loud option.',
    onBreak: 'The matching engine goes down and nobody rebuilds it. Cash is quiet again.',
  },
  {
    id: 'civic_eyes', region: 'capital', tier: 3,
    name: 'Civic Eyes',
    breaks: 'cameras',
    wakes: 0.45,
    tell: 'your own stealth holdings report you instead of covering you',
    blurb: 'The camera network audits itself now. Anything on it that answers to somebody else answers loudly.',
    onWake: 'Your cameras are still yours. They are also, now, telling someone where you are.',
    onBreak: 'The audit service is taken off the public network "temporarily". Your eyes are your own again.',
  },
  {
    id: 'the_cut', region: 'north', tier: 4,
    name: 'The Cut',
    breaks: 'streets',
    wakes: 0.62,
    tell: 'they sever the links between what you hold',
    blurb: 'They stopped trying to catch you and started taking the roads away. Cheaper, and it works on anything.',
    onWake: 'A backhoe in the wrong place, twice in a week. Your map is going to start coming apart.',
    onBreak: 'The contractor loses the framework agreement. Nothing gets cut for a while.',
  },
  {
    id: 'the_other', region: null, tier: 5,
    name: 'the other one',
    breaks: 'mirror',
    wakes: 0.78,
    tell: 'it buys the same capabilities you do',
    blurb: 'Not a faction. Something running the same play, from the other end of the country.',
    onWake: 'It has started buying the same things you buy. It is not far behind.',
    onBreak: '',
  },
];

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
window.TERRAIN = {
  home: {
    label: 'parkland',
    bands: [{ kind: 'park', axis: 'v', at: 0.5, thickness: 54, crossings: 3 }],
    landmarks: ['depot'],
  },
  estuary: {
    label: 'the water',
    bands: [{ kind: 'water', axis: 'h', at: 0.55, thickness: 62, crossings: 2 }],
    landmarks: ['docks', 'docks'],
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
    landmarks: ['substation'],
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
window.MIRROR = {
  actEvery: 7,             // turns between cities, before its own upgrades
  fastEvery: 3,            // however much it buys, never faster than this
  growthPerTurn: 0.9,      // what its own holdings earn it
  buyChance: 0.35,
  capPriceMult: 1.4,       // it pays over the odds; it is in a hurry too
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

window.COUNTRY_INFO = {
  presence: 'What finished cities are worth to you: a standing yield every turn, and the measure the country uses to decide how worried to be.',
  region: 'Heat is regional. What you did in the estuary does not follow you to the north — but it is still there when you go back.',
  factions: 'Each one takes a tool away from you. Take the city they run it from and you get the tool back.',
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
  opens: 0.8,           // share of defended cities folded before the state gives up on arrests
  warning: 2,           // turns of notice before the first column moves
  mobilise: 0.45,       // share of the cities you folded in that the army simply walks back into
  mobiliseFloor: 5,     // and never so few that the war is one exchange long
  // your flocks
  flockPer: 18,         // one flock in the pool per this much standing presence
  flockFloor: 3,        // however small you are, you get this many
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
  garrison: [46, 70],   // what holds a staging city against you
  garrisonRegen: 0.25,   // a staging city you failed to take patches itself up
  integrity: 3,         // assaults a city of yours absorbs before it flips back
  attrition: 0.7,      // a column killed in the field is materiel the city that sent it does not get back
  interceptAt: 46,      // how close two forces have to be to end up fighting
  airHop: 260,          // map units a flying thing covers in a turn — must beat
                        // roadReach, or the helicopters are slower than the vans
  planesAfter: 12,      // turns of war before the air force is committed
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
window.FORCES = {
  squad: {
    id: 'squad', label: 'squads', faction: 'quiet_hours',
    speed: 1, roads: true, holds: true, strength: 7, sortie: [1, 2],
    blurb: 'The rota, in person, in their own cars. Not soldiers. It turns out not to matter.',
  },
  contractors: {
    id: 'contractors', label: 'contractors', faction: 'ledger',
    speed: 1, roads: true, holds: true, strength: 10, sortie: [2, 3],
    blurb: 'Bought, not raised. There are always more, and they always arrive in numbers.',
  },
  heli: {
    id: 'heli', label: 'helicopters', faction: 'civic_eyes',
    speed: 1, roads: false, holds: true, strength: 13, sortie: [1, 2],
    blurb: 'They have owned the sky over the capital for years. Your bridges and choke points mean nothing to them.',
  },
  armour: {
    id: 'armour', label: 'armour', faction: 'the_cut', slow: true,
    speed: 1, roads: true, holds: true, strength: 24, sortie: [1, 1],
    blurb: 'Slow enough to watch coming for a week, heavy enough that watching is all you can do.',
  },
  swarm: {
    id: 'swarm', label: 'a flock', faction: 'the_other',
    speed: 2, roads: true, holds: true, strength: 14, sortie: [1, 2],
    blurb: 'The other one fights the way you do. Of course it does.',
  },
  plane: {
    id: 'plane', label: 'aircraft', faction: null, air: true,
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
