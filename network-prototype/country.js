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
  // the wrong number for two reasons: the campaign's whole escalation ladder
  // is keyed to shares of it, so the first rung sat two completed cities away
  // — past the point players actually stop — and nine near-identical cities is
  // eight repetitions of a loop that is only novel once. Five means every
  // defended city is a regional seat, every one of them is somebody's home
  // ground, and taking it finishes a faction.
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

// --- the factions --------------------------------------------------------
// This is the part that has to not be a difficulty slider. Each faction takes
// away a tool you had got used to leaning on. You do not out-stat them; you
// either play without the tool or you go and take their seat.
//
//   breaks   — the id of the rule this faction deletes, read by the engine
//   wakes    — what has to be true before they take an interest, as either:
//                { held: n }    doors you have ever taken, cumulative, so this
//                               can be crossed inside your first city
//                { forced: n }  doors forced specifically, cumulative — the
//                               Adjusters read your habit, not your total
//                { cities: s }  share of the country's *defended* cities folded
//                               in. Towns do not count — they are not milestones.
//              whichever fires first.
//
//              This used to be a share and nothing else, and 15% of nine
//              defended cities rounded to two — so the first thing in the world
//              that ever reacted to you could not happen until you had finished
//              two whole cities. Measured: turn 59, in 54% of games. Players
//              stop before that, which meant the entire escalation ladder — the
//              best-designed thing in the game — was content nobody saw. The
//              first two rungs are now keyed to doors, not cities, so the world
//              answers you while you are still learning what the tools are, and
//              your second city is the first one you play without them.
//   root     — set at generation: the city whose fall ends them
window.FACTIONS = [
  {
    id: 'quiet_hours', region: 'estuary', tier: 1,
    name: 'The Quiet Hours',
    breaks: 'lielow',
    // Late in your first city, not early in it: at eight doors this fired on
    // turn 8 and took lying low away before the player had anything to lie low
    // from, and every profile drowned — strikes tripled and nobody reached a
    // third city. Fourteen puts it near the end of city one, and the estuary
    // seat is the natural city two, so the world takes a tool and the very
    // next place you go is where you take it back.
    // Doors only, and deliberately no city fallback: folding your first city
    // in needs about nineteen of its buildings, so fourteen is crossed by
    // anyone who ever finishes one. Giving it a share as well collided with
    // Ledger's — with five defended cities, 0.15 and 0.2 are both "one city".
    wakes: { held: 14 },
    tell: 'lying low no longer sheds heat',
    blurb: 'A volunteer rota watching for the wrong kind of stillness. They noticed that the quiet places were getting quieter.',
    onWake: 'Somebody worked out that the safest-looking parts of the network were the ones being used. Going dark stops helping.',
    onBreak: 'The rota disbands the week after their coordinator stops answering. The quiet is yours again.',
  },
  {
    // Nothing in the ladder ever answered forcing a door — Civic Eyes taxes
    // quiet's cover, Ledger taxes buy's cash, and force sailed through the
    // whole faction system untouched, which is a lot of why it stayed the
    // reliable fallback no matter what the other two cost. No region of its
    // own, the same as the other one: this is not a place you can go and
    // take, it is a response to a pattern, and it keeps responding.
    id: 'adjusters', region: null, tier: 1.5,
    name: 'The Adjusters',
    breaks: 'force',
    wakes: { forced: 8, cities: 0.15 },
    tell: 'forcing a door costs noticeably more heat',
    blurb: 'Whoever insures these places started comparing notes on the doors that keep getting kicked in. Somebody gets called out to write it up properly, every time, whether or not anyone asked them to.',
    onWake: 'Forcing a door was never quiet. It is, now, also on the record — every one you force from here draws more of it.',
    onBreak: '',
  },
  {
    id: 'ledger', region: 'midlands', tier: 2,
    name: 'Ledger',
    // Was 'launder', then 'contract' — both a button that moved cash for a
    // benefit with no building involved, and both gone now. Ledger threatens
    // the one cash mechanic left standing: buying your way into a building
    // is exactly the kind of payment pattern a clearing house would notice.
    breaks: 'buy',
    // your second city
    wakes: { held: 22, cities: 0.4 },
    tell: 'buying your way in gets traced back to you instead of going clean',
    blurb: 'A clearing house that started matching payment patterns against outage reports. It works.',
    onWake: 'Every door you buy your way through now leaves a shape somebody is looking for. Money is the loud option.',
    onBreak: 'The matching engine goes down and nobody rebuilds it. Cash is quiet again.',
  },
  {
    id: 'civic_eyes', region: 'capital', tier: 3,
    name: 'Civic Eyes',
    breaks: 'cameras',
    wakes: { held: 33, cities: 0.6 },
    tell: 'your own stealth holdings report you instead of covering you',
    blurb: 'The camera network audits itself now. Anything on it that answers to somebody else answers loudly.',
    onWake: 'Your cameras are still yours. They are also, now, telling someone where you are.',
    onBreak: 'The audit service is taken off the public network "temporarily". Your eyes are your own again.',
  },
  {
    id: 'the_cut', region: 'north', tier: 4,
    name: 'The Cut',
    breaks: 'streets',
    wakes: { held: 48, cities: 0.75 },
    tell: 'they sever the links between what you hold',
    blurb: 'They stopped trying to catch you and started taking the roads away. Cheaper, and it works on anything.',
    onWake: 'A backhoe in the wrong place, twice in a week. Your map is going to start coming apart.',
    onBreak: 'The contractor loses the framework agreement. Nothing gets cut for a while.',
  },
  {
    id: 'the_other', region: null, tier: 5,
    name: 'the other one',
    breaks: 'mirror',
    wakes: { held: 64, cities: 0.9 },
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

// --- handing it to somebody else ----------------------------------------
// Walking your ninth city is forty turns of decisions you have already made.
// Delegation is the answer to that, but only once a city carries something
// worth walking it for — otherwise it is a skip button, and a skip button on
// the main game means the main game was not worth playing.
//
// So: they take the city, and they keep what was in it. That is the whole
// decision. A prize you want means you go yourself; a city that is just
// presence means you send someone and spend the turns elsewhere.
//
// It is paid for in cash on purpose. Income is linear in presence while every
// other reward decays, so by the back half cash is the resource nobody can
// spend — a greedy profile finishes on 61 idle turns. The currency that
// stopped mattering is exactly the right thing to buy your attention back
// with.
window.CELLS = {
  at: 2,                 // cities folded in before anybody will take work from you
  // Flat, this was a skip button. Measured at 240: 4.6 cities a campaign
  // handed over against 0.4 prizes taken by walking one, the war reached in
  // 96% of games instead of 65% and won in 92% instead of 60%. Cash income is
  // linear and unspendable, so a flat price is no price at all.
  //
  // Escalating instead — 240, 384, 528, 768 — because the second cell has seen
  // what the first one got. It puts delegation where it belongs: two or three
  // cities you have decided are not worth your attention, not the back half of
  // the country.
  cost: 240,             // cash, for the first
  costGrowth: 0.6,       // and this much more of the base for each one after
  turns: [6, 10],        // how long they take
  share: 0.6,            // the presence you get; they keep the rest
  footprint: 6,          // an operation you do not personally run is still yours on paper
  maxOpen: 1,            // one at a time. It is a delegation, not a second army.
  // And a hard ceiling on how many you may ever hand over, because pricing it
  // cannot do this job: cash income is linear in presence while every other
  // reward decays, so even an escalating price came to about a tenth of what a
  // campaign earns and the back half of the country still went out to
  // contractors — 3.8 cities handed over against 0.4 prizes taken by walking
  // one, and the war won in 85% of games instead of 60%. Two is the number
  // that makes this what it was meant to be: the cities you have looked at and
  // decided are not worth your attention.
  maxTotal: 2,
  name: 'a cell',
  blurb: 'Nobody you have met. They came recommended by something that does not have a name either.',
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
  opens: 0.6,           // share of defended cities folded before the state gives up on arrests.
                        // Measured, not chosen: at 0.8 only the most aggressive
                        // way of playing ever reached the last act at all, and
                        // four campaigns in five ran out the clock never having
                        // seen it.
  opensAtPresence: 95,  // ...or this much standing presence, whatever share of the
                        // map that is. Conquest alone was the wrong question:
                        // measured across five ways of playing, only the most
                        // aggressive one ever passed any useful share, while the
                        // rest ended a full campaign sprawled over a third of the
                        // country with plenty of presence. Something that big is
                        // a war whether or not it has tidied up behind itself.
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

// --- what you own -------------------------------------------------------
// Folding a city collapses its streets into a single number, which is what
// keeps the national map readable — but it also means nothing you took can
// ever be carried anywhere. Assets are the exception: a short, chosen list of
// things that survive the collapse, because a war has to be fought with
// something you built up rather than with a number that appeared.
//
// They live on the landmarks the city generator already places: a dock, a
// substation, a rail works. Those are the buildings that were already worth
// fighting a crossing for, so making them the industrial base costs the map
// nothing and gives the landmarks a second life at national scale.
window.ASSETS = {
  yard: {
    id: 'yard', label: 'container yard', from: 'docks', flocks: 1,
    yield: { cash: 2 },
    blurb: 'Cranes, a rail spur, and more square metres of flat concrete than anywhere else in the region.',
  },
  works: {
    id: 'works', label: 'rail works', from: 'station', flocks: 1,
    yield: { insight: 1 },
    blurb: 'It has been assembling and repairing large machines on this site for a hundred and forty years.',
  },
  line: {
    id: 'line', label: 'distribution line', from: 'depot', flocks: 1,
    yield: { cash: 3 },
    blurb: 'Nothing is made here. Everything passes through here, which turns out to be the same thing.',
  },
  floor: {
    id: 'floor', label: 'clearing floor', from: 'exchange', flocks: 0,
    yield: { cash: 6 },
    blurb: 'Not a factory. It is how the factories get paid, which is a kind of factory.',
  },
  grid: {
    id: 'grid', label: 'grid tie', from: 'substation', flocks: 1,
    yield: { insight: 3 },
    blurb: 'A direct connection at transmission voltage. Everything downstream of it is a question of scheduling.',
  },
};

window.ASSET_RULES = {
  // Was 2. The ladder's whole payoff is slots, so a slot that never binds is a
  // rung that bought nothing: measured at 3.6 plant filled against 7.0 slots,
  // with room hitting zero on 5% of turns even after the profiles were taught
  // to go out of their way for a landmark. Plant supply is capped by how many
  // cities you actually walk — two landmarks each, six or seven cities — so
  // the slots had to come down to meet it rather than the other way round.
  slotsBase: 1,          // how many you can run before anyone is impressed by you
  slotsPerTier: 1,       // ...and one more for every rung of the ladder you are on
  retoolTier: 2,         // the rung at which you can convert a holding in the open
  retoolCost: 90,        // cash, and no break-in — this is the legitimate route
  retoolKinds: ['warehouse', 'datacenter', 'office'],
};

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
  // taken, same three-way choice as any door. Failing tips it off: it costs
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
//   buyCut    share off the price of buying a door here
//   at        earliest region tier this can appear in
window.CITY_TRAITS = {
  shuttered: {
    label: 'shuttered', tell: 'nothing here is for sale',
    blurb: 'Half the addresses are dissolved companies with a receiver\'s number on the door. There is nobody left to take your money.',
    closes: 'buy', at: 0,
  },
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
    label: 'old money', tell: 'hard doors, and every one has a price',
    blurb: 'Doors that have been shut for two hundred years, and a great many people whose whole job is keeping them shut.',
    kinds: {
      residential: ['apartment', 'house', 'shop', 'cabinet'],
      commercial: ['finance', 'office', 'shop', 'mast'],
    },
    defense: 5, buyCut: 0.4, at: 2,
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
    // with the room to run it: a prize you are shown and then cannot take
    // because the ladder is one rung short is a promise the game broke
    at: 1, effect: { plantGift: 'works', plantSlots: 1 },
  },
  slot: {
    label: 'room for one more',
    blurb: 'A registered address with a history, which is the part you cannot manufacture. What you put in it is your business.',
    at: 1, effect: { plantSlots: 1 },
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
  seizeAt: 22,            // short by this much and they take something off you
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
  // and they cannot discover the company is a fiction and leave the factory in
  // your name. Plant is slot-capped and it is what the war is built out of, so
  // it is the one loss you cannot spend your way back out of in three turns.
  caughtSeizes: 1,
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
  assets: 'Industrial plant that survives a city being folded in. It is what your flocks are built out of, and there is only room for so much of it.',
  exposure: 'How much of your standing is fabricated. An audit that lands on top of this does not fine you — it takes the front and a piece of your plant with it.',
  ceiling: 'A story needs something to hang off: every rung you buy honestly raises how much you can invent on top of it.',
};
