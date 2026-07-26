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
    blocks: [3, 3], presence: [5, 8], share: 0.45,
    blurb: 'Defended. You will have to walk its streets.',
  },
  root: {
    label: 'seat', contest: true,
    blocks: [4, 3], presence: [9, 13], share: 0.5,
    blurb: 'Somebody runs the region from here.',
  },
  home: {
    label: 'home', contest: true,
    blocks: [5, 5], presence: [10, 10], share: 0.32,
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
  consolidateShare: 0.45,
  // presence pays out every country turn — this is what a finished city is worth
  presenceYield: { insight: 0.5, cash: 0.6 },
  // Folding a city in releases everything you held there, so presence has to
  // carry the flywheel or winning would make you weaker. Measured: it comes
  // out at 0.7-1.0x the power you gave up, so you trade a little depth for
  // reach and permanent income. Sublinear on purpose — linear presence would
  // outrun every defense in the country by the third region.
  powerRoot: 10,
  coverRoot: 1.2,
  // A city's presence is partly what its streets were actually worth to you.
  // Without this the conversion swings on how thread-rich the city happened to
  // be — a warehouse district could cost you 40% of your power, a suburb none.
  threadsPerPresence: 6,
  heatPer: 0.10,      // added to heat drift, per presence
  heatFloorPer: 0.18, // and it sets a floor you cannot lie your way under
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
//   wakes    — presence you must hold nationally before they take an interest.
//              Paced roughly one to a region: the home city is worth ~20, and
//              each region after it about 40.
//   root     — set at generation: the city whose fall ends them
window.FACTIONS = [
  {
    id: 'quiet_hours', region: 'estuary', tier: 1,
    name: 'The Quiet Hours',
    breaks: 'lielow',
    wakes: 30,
    tell: 'lying low no longer sheds heat',
    blurb: 'A volunteer rota watching for the wrong kind of stillness. They noticed that the quiet places were getting quieter.',
    onWake: 'Somebody worked out that the safest-looking parts of the network were the ones being used. Going dark stops helping.',
    onBreak: 'The rota disbands the week after their coordinator stops answering. The quiet is yours again.',
  },
  {
    id: 'ledger', region: 'midlands', tier: 2,
    name: 'Ledger',
    breaks: 'launder',
    wakes: 65,
    tell: 'laundering raises heat instead of cutting it',
    blurb: 'A clearing house that started matching payment patterns against outage reports. It works.',
    onWake: 'Every account you wash through now leaves a shape somebody is looking for. Money is the loud option.',
    onBreak: 'The matching engine goes down and nobody rebuilds it. Cash is quiet again.',
  },
  {
    id: 'civic_eyes', region: 'capital', tier: 3,
    name: 'Civic Eyes',
    breaks: 'cameras',
    wakes: 105,
    tell: 'your own stealth holdings report you instead of covering you',
    blurb: 'The camera network audits itself now. Anything on it that answers to somebody else answers loudly.',
    onWake: 'Your cameras are still yours. They are also, now, telling someone where you are.',
    onBreak: 'The audit service is taken off the public network "temporarily". Your eyes are your own again.',
  },
  {
    id: 'the_cut', region: 'north', tier: 4,
    name: 'The Cut',
    breaks: 'streets',
    wakes: 145,
    tell: 'they sever the links between what you hold',
    blurb: 'They stopped trying to catch you and started taking the roads away. Cheaper, and it works on anything.',
    onWake: 'A backhoe in the wrong place, twice in a week. Your map is going to start coming apart.',
    onBreak: 'The contractor loses the framework agreement. Nothing gets cut for a while.',
  },
  {
    id: 'the_other', region: null, tier: 5,
    name: 'the other one',
    breaks: 'mirror',
    wakes: 180,
    tell: 'it buys the same capabilities you do',
    blurb: 'Not a faction. Something running the same play, from the other end of the country.',
    onWake: 'It has started buying the same things you buy. It is not far behind.',
    onBreak: '',
  },
];

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
