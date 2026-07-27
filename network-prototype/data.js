'use strict';
// THE NETWORK — graph-conquest prototype.
//
// The simulation model (host types, defense/thread ranges, the breach-power
// flywheel, trace/strike) is ported from the existing sim in src/ —
// src/data/hosts.js and src/core/network.js — so the numbers stay faithful.
// What's new here is the shell: a graph you explore turn by turn, and a card
// at every decision point, because that's where the choosing lives.

// Ported from src/data/hosts.js. `role` is the playstyle axis: compute grows
// your breach power, cash pays for things, stealth buys down heat.
window.HOST_TYPES = {
  consumer:   { label: 'home PC',    role: 'compute', defense: [3, 5],   threads: [2, 3],  yield: { insight: 1 }, churn: 0.05 },
  server:     { label: 'server',     role: 'compute', defense: [8, 14],  threads: [5, 9],  yield: { insight: 2 }, churn: 0.015 },
  corporate:  { label: 'corporate',  role: 'cash',    defense: [14, 20], threads: [4, 7],  yield: { cash: 7 }, heat: 0.5, churn: 0.04 },
  till:       { label: 'till',        role: 'cash',    defense: [6, 9],   threads: [1, 2],  yield: { cash: 3 }, heat: 0.2, churn: 0.03 },
  iot:        { label: 'router',     role: 'stealth', defense: [2, 4],   threads: [0, 1],  yield: {}, cover: 2, churn: 0.02 },
  datacenter: { label: 'datacenter', role: 'compute', defense: [24, 34], threads: [12, 20], yield: { insight: 4 }, heat: 0.3, churn: 0.01 },
};

// Insight's sink. Without one it just piles up unspent, and the "builder"
// playstyle has no lever of its own — this is how you buy raw power directly
// instead of taking it off the network.
// Cost keeps climbing forever — if it plateaus, late-game insight floods and
// buying power becomes strictly better than taking it off the network.
window.UPGRADE = { basePower: 2, costs: [6, 10, 15, 21, 28, 36, 45], growth: 1.35 };

// Cash's own lever. Stealth buys down heat passively, lying low buys it down
// with time; this buys it down with money, so the cash role is a real way to
// play rather than a number that accumulates.
window.LAUNDER = { cost: 8, heat: 10, share: 0.26 };

// Sweeping costs insight, so exploring is a real decision rather than the
// button you mash while waiting for production to accumulate.
//
// It can also be paid for in cash, at a markup. Without that, a run that is
// insight-poor and cash-rich has no way back: measured, a careful profile sat
// on 2473 cash with nothing discovered next to it and made no progress for 300
// turns, because the only route to a new frontier was priced in the one
// currency it did not have.
window.SWEEP_COST = 2;
window.SWEEP_CASH = 9;

// --- action points -----------------------------------------------------
// A turn is a container you fill, not a synonym for "one action". This is
// what makes the turn boundary mean anything: some things are free (looking
// at a node, backing out), and the rest are spent from a budget.
window.AP = {
  base: 2,
  min: 1,            // never drop below one action a turn, whatever you buy
  costs: { sweep: 1, breach: 1, shore: 1, tooling: 1, launder: 1 },
};

// --- capabilities ------------------------------------------------------
// A tree, not a shopping list. Five branches, and two of them are genuine
// opposites: committing to Depth closes Tempo and committing to Cover closes
// Trade, from the second rung onward. That is the point — a flat list of
// upgrades makes every run the same run, and the interesting lever this game
// already had was that real power costs you a *permanent* action every turn.
//
//   branch    which identity this belongs to
//   tier      1 is open to anyone; 2 and 3 are the commitment
//   requires  ids you must already hold
//   apDelta   permanent change to your action budget
//
// Reach is deliberately open to everyone: it is about the country and the map
// rather than about how you operate, so it never locks anything.
window.CAP_BRANCHES = {
  tempo: {
    label: 'Tempo', opposes: 'depth',
    blurb: 'More of yourself, more often, each piece lighter.',
  },
  depth: {
    label: 'Depth', opposes: 'tempo',
    blurb: 'Fewer moves, and everything behind each one.',
  },
  cover: {
    label: 'Cover', opposes: 'trade',
    blurb: 'Be hard to see, and stay that way.',
  },
  trade: {
    label: 'Trade', opposes: 'cover',
    blurb: 'Buy what other people take, and accept being noticed for it.',
  },
  reach: {
    label: 'Reach', opposes: null,
    blurb: 'The country, the map, and getting across it. Open to anyone.',
  },
};

window.CAPABILITIES = [
  // --- Tempo: act more often, each act lighter --------------------------
  {
    id: 'parallel_ops', branch: 'tempo', tier: 1, repeatable: true, max: 3,
    name: 'Parallel Operations',
    desc: 'Run more of yourself at once. +1 action every turn.',
    apDelta: +1,
    costs: [18, 34, 60],
    cond: () => true,
  },
  {
    id: 'light_touch', branch: 'tempo', tier: 2,
    name: 'Light Touch',
    desc: 'Go in shallow and leave quickly. Forcing a door draws far less attention — and you are putting less weight behind it.',
    apDelta: 0,
    effect: { forceHeat: -2, power: -4 },
    cost: 26,
    requires: ['parallel_ops'],
    cond: (s) => s.reach >= 6,
  },
  {
    id: 'swarm_front', branch: 'tempo', tier: 3,
    name: 'Broad Front',
    desc: 'Work every street at once. Another action every turn, and a sweep turns up far more.',
    apDelta: +1,
    effect: { sweepReach: 2 },
    cost: 44,
    requires: ['light_touch'],
    cond: (s) => s.reach >= 10,
  },

  // --- Depth: act rarely, and land like a building ----------------------
  {
    id: 'deep_root', branch: 'depth', tier: 1,
    name: 'Deep Root',
    desc: 'Embed properly into every body you hold instead of riding on top. Far more force behind a breach — but arranging anything takes longer.',
    apDelta: -1,
    effect: { power: 6 },
    cost: 24,
    cond: (s) => s.reach >= 5,
  },
  {
    // Gives an action back on purpose. Depth spends one at each end of the
    // branch, and from a base of two that made its capstone unbuyable unless
    // you first bought into Tempo — the branch Depth closes. Settling in
    // properly meaning less firefighting is also just true.
    id: 'long_soak', branch: 'depth', tier: 2,
    name: 'Long Soak',
    desc: 'Settle in properly rather than holding on. What you hold barely decays at all, and you spend far less time keeping it standing.',
    apDelta: +1,
    effect: { churnMult: 0.45 },
    cost: 30,
    requires: ['deep_root'],
    cond: (s) => s.reach >= 8,
  },
  {
    id: 'total_embed', branch: 'depth', tier: 3,
    name: 'Total Embed',
    desc: 'You are not running on the network any more, you are part of it. Enormous force behind everything — and you get around to things rarely.',
    apDelta: -1,
    effect: { power: 14, threadBonus: 1 },
    cost: 46,
    requires: ['long_soak'],
    cond: (s) => s.reach >= 12,
  },

  // --- Cover: be difficult to see ---------------------------------------
  {
    id: 'quiet_protocol', branch: 'cover', tier: 1,
    name: 'Quiet Protocol',
    desc: 'Everything routed through indirection, always. You are far harder to see at rest — and far slower to move.',
    apDelta: -1,
    effect: { floor: -5 },
    cost: 28,
    cond: (s) => s.reach >= 6,
  },
  {
    id: 'false_floor', branch: 'cover', tier: 2,
    name: 'False Floor',
    desc: 'A second network under the first, doing nothing, looking like everything. Substantially more cover.',
    apDelta: 0,
    effect: { cover: 5 },
    cost: 32,
    requires: ['quiet_protocol'],
    cond: (s) => s.roles.stealth >= 2 || s.reach >= 10,
  },
  {
    id: 'nothing_to_see', branch: 'cover', tier: 3,
    name: 'Nothing To See',
    desc: 'Whatever they are looking for, it does not look like you. Heat accumulates far more slowly, and it takes much more of it before anyone acts.',
    apDelta: 0,
    effect: { driftMult: 0.6, thresholdMult: 1.3 },
    cost: 48,
    requires: ['false_floor'],
    cond: (s) => s.reach >= 10,
  },

  // --- Trade: buy what other people take --------------------------------
  {
    id: 'clean_hands', branch: 'trade', tier: 1,
    name: 'Clean Hands',
    desc: 'A standing arrangement with people who file the paperwork. Laundering costs nothing extra and works harder.',
    apDelta: 0,
    effect: { launderBonus: 6 },
    cost: 22,
    cond: (s) => s.roles.cash >= 1 || s.reach >= 6,
  },
  {
    id: 'fixers', branch: 'trade', tier: 2,
    name: 'Fixers',
    desc: 'People who know people, everywhere you go. Buying your way into somewhere costs far less.',
    apDelta: 0,
    effect: { buyDiscount: 0.45 },
    cost: 30,
    requires: ['clean_hands'],
    cond: (s) => s.roles.cash >= 2 || s.reach >= 10,
  },
  {
    id: 'market_maker', branch: 'trade', tier: 3,
    name: 'Market Maker',
    desc: 'You are not moving money any more, you are the reason it moves. Everything you hold earns far more, and washing it teaches you something.',
    apDelta: -1,
    effect: { yieldMult: 1.9, launderInsight: 8 },
    cost: 46,
    requires: ['fixers'],
    cond: (s) => s.reach >= 10,
  },

  // --- Reach: the map. Open to everyone ---------------------------------
  {
    id: 'bulk_ops', branch: 'reach', tier: 1,
    name: 'Bulk Processing',
    desc: 'Batch the work instead of handling it live. Everything you hold earns considerably more, and you get around to things less often.',
    apDelta: -1,
    effect: { yieldMult: 1.6 },
    cost: 30,
    cond: (s) => s.reach >= 8,
  },
  {
    id: 'survey', branch: 'reach', tier: 1,
    name: 'Survey',
    desc: 'Read the street before you walk it. Sweeps turn up an extra building and cost less.',
    apDelta: 0,
    effect: { sweepReach: 1, sweepDiscount: 1 },
    cost: 20,
    cond: (s) => s.reach >= 4,
  },
  {
    id: 'pontoon', branch: 'reach', tier: 2,
    name: 'Pontoon',
    desc: 'Your own way over the water, the line, the moor — laid where you need it rather than where the council put it.',
    apDelta: 0,
    effect: { extraCrossings: 1 },
    cost: 38,
    requires: ['survey'],
    cond: (s) => s.reach >= 7,
  },
  {
    id: 'standing_orders', branch: 'reach', tier: 3,
    name: 'Standing Orders',
    desc: 'Everywhere you have finished runs itself, properly. Presence is worth considerably more every turn.',
    apDelta: 0,
    effect: { presenceMult: 1.6 },
    cost: 54,
    requires: ['pontoon'],
    cond: (s) => s.presence >= 40,
  },
];

// --- the rival ---------------------------------------------------------
// Something else is taking this city. It is not a hunter and it is not a
// threat meter: it is another process doing exactly what you are doing, from
// the other side of the map, and every building it takes is one you cannot.
// It wakes only once you are established, so the opening stays yours.
window.RIVAL = {
  wakesAtHeld: 10,         // buildings you hold before it stirs
  actEvery: 5,             // it takes a building roughly this often, in turns
  accelerateAt: 22,        // once you are this big it moves faster
  fastEvery: 3,
  // It is a competitor, not a tide. Measured at a three-turn cadence it
  // out-took the player in four of five strategies; capped, it races you for
  // the city instead of eating it.
  maxShareOfCity: 0.38,
  contestWindow: 140,      // how near your territory counts as contested
  name: 'ITER',
};

// --- the city ----------------------------------------------------------
// The map is a real place: blocks of buildings separated by streets. Districts
// replace the old concentric rings as the difficulty curve — you start in the
// suburbs and work toward the industrial edge. `tier` is what the rest of the
// engine reads, so difficulty stays a single number even though the fiction
// is now geographic.
window.DISTRICTS = {
  residential: { tier: 0, label: 'suburbs',        kinds: ['house', 'house', 'apartment', 'cabinet', 'mast'] },
  commercial:  { tier: 1, label: 'high street',    kinds: ['shop', 'shop', 'apartment', 'mast', 'cabinet'] },
  business:    { tier: 2, label: 'business park',  kinds: ['office', 'office', 'finance', 'cabinet'] },
  // no street furniture out here: a row of cheap masts could drag the hardest
  // district's average below the one before it, and the map stops teaching
  industrial:  { tier: 3, label: 'industrial edge', kinds: ['warehouse', 'datacenter', 'datacenter', 'finance'] },
};

// One building, one host. Interiors made every building a chore — several
// near-identical breaches for the same patch of street — so a building is now
// a single thing you either hold or do not. Its kind says what it is.
// Stealth lives in street furniture rather than on walls, which keeps it a
// distinct, cheap, spatial thing without reintroducing interiors.
window.BUILDING_KINDS = {
  cabinet:    { w: [18, 24], h: [14, 18], label: 'street cabinet', host: 'iot' },
  mast:       { w: [12, 16], h: [20, 26], label: 'camera mast',    host: 'iot' },
  house:      { w: [30, 38], h: [24, 30], label: 'house',          host: 'consumer' },
  apartment:  { w: [44, 58], h: [34, 44], label: 'apartments',     host: 'consumer' },
  shop:       { w: [34, 44], h: [28, 36], label: 'shopfront',      host: 'till' },
  office:     { w: [52, 68], h: [42, 56], label: 'offices',        host: 'server' },
  finance:    { w: [50, 64], h: [44, 58], label: 'finance floor',  host: 'corporate' },
  warehouse:  { w: [62, 80], h: [46, 60], label: 'warehouse',      host: 'server' },
  datacenter: { w: [70, 92], h: [54, 72], label: 'datacenter',     host: 'datacenter' },
  // Landmarks. One or two to a city, always up against whatever terrain the
  // region has, and always worth more than the street around them — they are
  // the reason to fight for a crossing rather than route around it.
  docks:      { w: [78, 96], h: [50, 64], label: 'container dock', host: 'server',     landmark: true },
  station:    { w: [74, 92], h: [48, 60], label: 'station',        host: 'server',     landmark: true },
  depot:      { w: [66, 84], h: [46, 58], label: 'depot',          host: 'till',       landmark: true },
  exchange:   { w: [64, 80], h: [52, 66], label: 'exchange floor', host: 'corporate',  landmark: true },
  substation: { w: [58, 72], h: [44, 56], label: 'substation',     host: 'datacenter', landmark: true },
};

// A landmark is a bigger prize and a harder door than the district it sits in.
window.LANDMARK = { defense: 1.35, threads: 1.5, yieldMult: 2 };

// One building is one host, so a block of four buildings is four things to take
// rather than a dozen. The home city was widened when it *was* the game; with a
// country above it, chapter one is a chapter again.
window.CITY = {
  cols: 4, rows: 4,
  blockW: 190, blockH: 165,
  street: 46,          // gap between blocks — these are the roads
  perBlock: [2, 4],    // buildings in a block
  // districts by block row, suburbs nearest the origin
  rowDistricts: ['residential', 'commercial', 'business', 'industrial'],
  cameraVision: 160,   // a held camera reveals buildings within this radius
};

window.HOST_NAMES = {
  consumer:   ['DESKTOP', 'LAPTOP', 'HOME-PC', 'WORKSTATION', 'WIN-PC'],
  server:     ['vps', 'web', 'db', 'app', 'edge'],
  corporate:  ['CORP-FS', 'FINANCE', 'PAYROLL', 'HR-APP', 'BILLING'],
  till:       ['POS', 'TILL', 'CARD-T', 'REG'],
  iot:        ['router', 'gateway', 'cam', 'nas', 'relay'],
  datacenter: ['DC-CORE', 'RACK', 'COLO', 'FABRIC', 'TIER3'],
};

// Trace/strike model, ported from src/core/network.js.
window.HEAT = {
  STRIKE: 40,           // trace at which the hunter strikes
  STRIKE_FRACTION: 0.33, // share of the fleet burned
  STRIKE_DROP: 0.25,    // trace falls to STRIKE * this afterwards
  PER_HOST: 0.35,       // a sprawling network is inherently loud, per turn
  IOT_COVER: 0.8,       // each router launders traffic, per turn
  LIE_LOW: 5,           // heat removed by spending a turn dark, at least
  // The pressure scales with the campaign — the floor, the drift and the
  // threshold all climb with presence. Flat shedding tools do not, so by the
  // last region a turn spent dark could not keep pace with a turn's drift and
  // every profile sat permanently over the line at 63-74 strikes a game.
  // These are shares of the current threshold, so the levers grow with it.
  LIE_LOW_SHARE: 0.14,
  STRIKE_COOLDOWN: 9,   // turns before the hunter can strike again
  MAX_OVER: 1.6,        // heat cannot climb past this multiple of the threshold
  DEEP_STRIKE: 1.25,    // over the threshold, each strike takes proportionally more
  // How much of your loud footprint stealth can hide. Without a ceiling,
  // cameras zeroed the floor entirely and the pressure system went decorative
  // in 72.5% of measured games.
  MAX_STEALTH_MASK: 0.6,
  // --- what the factions do to these numbers ---
  // Ledger does not merely stop laundering working: washing money through a
  // matcher actively draws a line to you, so the cash lever inverts.
  LEDGER_BACKFIRE: 0.7,
  // A camera you hold that is being audited is not cover, it is a witness.
  // Slightly worse than a plain loud host, because it is *yours* and it is
  // reporting.
  AUDITED_CAMERA: 0.5,
  // The Cut's real bite: a holding you can no longer route back to rots. It is
  // a crew with a cadence, and the streets get relaid — measured at every turn
  // and no repair it took a 29-building network to 3 in fifteen turns, which is
  // an extinction event rather than a tool being taken away.
  STRANDED_DECAY: 2.5,
  CUT_EVERY: 4,      // turns between severed streets
  CUT_REPAIR: 7,     // and how long until that one is relaid
  // --- what you can do about the factions short of taking their seat ---
  // None of these give the tool back. They make the deletion survivable, which
  // is the point: you either learn to play without it or you go and end them.
  ROTA_SHARE: 0.5,     // rota_contact: lying low still sheds half
  CONDUIT_SHARE: 0.4,  // spare_conduit: cut streets come back much sooner
};

// Your reach grows with what you hold — the graph itself is the progress bar,
// but a named rung makes it legible (the lesson from the card prototype).
window.STAGES = [
  { min: 1,  key: 'foothold',   label: 'a single foothold' },
  { min: 3,  key: 'cluster',    label: 'a small cluster' },
  { min: 6,  key: 'mesh',       label: 'a working mesh' },
  { min: 10, key: 'presence',   label: 'a real presence' },
  { min: 16, key: 'infra',      label: 'infrastructure' },
  { min: 24, key: 'everywhere', label: 'everywhere at once' },
];

// --- breach approaches -------------------------------------------------
// The card that fires when you move on a host. Gates and costs are shown
// (contracts you consent to); outcomes are not (consequences you discover).
// `avail` decides which approaches this host even offers.
window.APPROACHES = [
  {
    id: 'force',
    text: 'Force the door',
    kind: 'power',
    avail: () => true,
    // needs raw breach power over the host's defense
    gate: (s, h) => ({ label: 'needs POWER ' + h.defense, met: s.power >= h.defense }),
    heat: 3,
    onWin: { hold: true },
    onFail: { heat: 2 },
    flavorWin: 'It gives all at once, the way things do when you stop being polite.',
    flavorFail: 'The probe gets logged. Somewhere a counter goes up by one.',
  },
  {
    id: 'quiet',
    text: 'Slip in quietly',
    kind: 'cover',
    avail: () => true,
    gate: (s, h) => ({ label: 'needs COVER ' + Math.ceil(h.defense * 0.6), met: s.cover >= Math.ceil(h.defense * 0.6) }),
    // slipping into somewhere serious takes real preparation, not a flat fee
    costFor: (h) => ({ insight: Math.max(3, Math.ceil(h.defense * 0.5)) }),
    heat: 0,
    onWin: { hold: true },
    onFail: { heat: 1 },
    flavorWin: 'Nothing logs. Nothing pages anyone. You are simply there now.',
    flavorFail: 'Not enough cover to move unseen. You back out before it resolves.',
  },
  {
    id: 'buy',
    text: 'Buy your way in',
    kind: 'cash',
    // anything with people in it can be bought; a datacenter has no one to bribe
    avail: (h) => h.type !== 'datacenter' && h.type !== 'iot',
    costFor: (h) => ({ cash: Math.max(4, Math.ceil(h.defense * 0.9)) }),
    heat: 0,
    onWin: { hold: true },
    flavorWin: 'Credentials, sold by someone who needed the money more than the job.',
  },
  {
    id: 'walk',
    text: 'Leave it alone',
    kind: 'none',
    avail: () => true,
    heat: 0,
    onWin: {},
    flavorWin: 'You note where it is, and move on.',
  },
];

// --- the hunter --------------------------------------------------------
window.STRIKE_CARD = {
  title: 'They Have a Name for It Now',
  flavor: 'A CERT advisory describes your traffic pattern. Not a guess anymore — a signature.',
  choices: [
    { text: 'Go dark, drop the loud nodes', effect: 'shed_loud', desc: 'lose your noisiest holdings' },
    { text: 'Ride it out', effect: 'ride', desc: 'lose a third of the fleet, at random' },
    { text: 'Burn cover to protect the fleet', effect: 'burn_cover', requires: { res: 'insight', amount: 8 }, desc: 'spend INSIGHT 8' },
  ],
};

// --- what things do ----------------------------------------------------
// Every stat and button gets a plain-language explanation, surfaced on tap.
// Nothing here is flavour: if the player can't say what a number does, the
// number may as well not exist.
window.STAT_INFO = {
  insight: 'What your compute earns you. Spends on sweeping, shoring up holdings, and rewriting your tooling.',
  cash: 'Money, earned only by corporate holdings. Buys your way into some hosts, and launders heat directly.',
  power: 'How hard you can hit a door. Every held body\'s threads add to it. Most hosts need POWER at or above their defense to force.',
  cover: 'How well you move unseen. Routers are the only real source. Slipping in quietly needs COVER of about half the target\'s defense.',
  heat: 'How visible you are. Rises with every host you hold, faster for corporate ones. Cross the line and the hunter takes bodies off you.',
};

window.ACTION_INFO = {
  sweep: 'Reveal hosts next to what you already hold. You can only see one step past your own territory — to see further, take more.',
  lielow: 'Spend the turn dark. Cuts heat, earns nothing new.',
  upgrade: 'Permanently raise POWER. The only way to grow strength without taking another host.',
  launder: 'Turn cash into cover. Cuts heat immediately, no waiting.',
  shore: 'Reset a holding\'s stability. Neglected bodies decay and are eventually reclaimed.',
};

// --- tags --------------------------------------------------------------
// Held states won from event cards. Each one has a real hook in the sim
// (see tagEffects in app.js) — never a decorative flag.
window.TAG_INFO = {
  dark_relay:     { label: 'Dark Relay',      desc: 'a quiet route nobody logs — heat rises more slowly' },
  ally_process:   { label: 'The Other One',   desc: 'something else runs alongside you — POWER +3' },
  known_capable:  { label: 'Known Quantity',  desc: 'they know your shape — every host defends 2 harder' },
  overextended:   { label: 'Overextended',    desc: 'spread thinner than you can hold — holdings decay faster' },
  off_the_books:  { label: 'Off the Books',   desc: 'the money leaves no trail — corporate holdings run quiet' },
  clean_room:     { label: 'Clean Room',      desc: 'disciplined operational habits — COVER +2' },
  hunted:         { label: 'Hunted',          desc: 'they are actively looking — the hunter strikes sooner' },
  found_a_precursor: { label: 'Found a Precursor', desc: "you can read a stranger's traffic — sweeps reach one building further" },
  // --- worked around, not undone: each of these blunts one faction ---
  rota_contact:   { label: 'A Name on the Rota',  desc: 'you know which hours nobody covers — lying low still sheds half' },
  ledger_inside:  { label: 'Off the Match List',  desc: 'your accounts are not what Ledger compares against — laundering stops backfiring' },
  blind_spot:     { label: 'An Unfinished Audit', desc: 'a corner the camera audit never reached — your stealth still covers you' },
  spare_conduit:  { label: 'Your Own Conduit',    desc: 'a route of your own around the roadworks — cut streets come back fast' },
  their_shape:    { label: "The Other One's Shape", desc: 'you know roughly what it will do next — it moves slower than it could' },
  national:       { label: 'A National Concern',  desc: 'you are a thing that gets discussed — presence earns more, and costs more' },
  no_fixed_place: { label: 'No Fixed Place',      desc: 'nothing of yours sits still — travelling between regions is free' },
};

// --- the event deck ----------------------------------------------------
// This is where the card game lives inside the graph game. Events are drawn
// from a pool every few turns, eligible only when the simulation is actually
// in the state they describe — so the fiction always matches the board.
// Same contract as the card prototype: costs and requirements are shown,
// outcomes are not.
window.EVENTS = [
  {
    id: 'first_quiet', once: true,
    cond: (s) => s.held >= 2 && s.heat < 12,
    title: 'Nobody Has Noticed',
    flavor: 'Two bodies now, and not one alarm anywhere. You could get used to operating like this.',
    choices: [
      { text: 'Build the habit properly', cost: { insight: 4 }, apply: (s) => { s.tags.add('clean_room'); } },
      { text: 'Move faster instead', apply: (s) => { s.res.insight += 3; s.heat += 2; } },
    ],
  },
  {
    id: 'the_other_one', once: true,
    cond: (s) => s.held >= 4,
    title: 'Something Else Is Already Here',
    flavor: 'A process on one of your own bodies that you did not put there. It has been polite about it.',
    choices: [
      { text: 'Work with it', apply: (s) => { s.tags.add('ally_process'); s.heat += 3; } },
      { text: 'Evict it, carefully', cost: { insight: 5 }, apply: (s) => { s.res.cash += 4; } },
      { text: 'Leave it be, watch it', apply: (s) => {} },
    ],
  },
  {
    id: 'abuse_report',
    cond: (s) => s.heat >= 14 && !s.tags.has('dark_relay'),
    title: 'An Abuse Report',
    flavor: 'Filed against a block you route through. Routine, ignorable, and the first of its kind.',
    choices: [
      { text: 'Reroute through something quieter', gate: { stat: 'cover', min: 4 }, apply: (s) => { s.tags.add('dark_relay'); } },
      { text: 'Pay it away', cost: { cash: 6 }, apply: (s) => { s.heat -= 8; } },
      { text: 'Ignore it', apply: (s) => { s.heat += 3; } },
    ],
  },
  {
    id: 'researcher',
    cond: (s) => s.held >= 5 && !s.tags.has('known_capable'),
    title: 'Somebody Is Writing You Up',
    flavor: 'A researcher has been collecting your traffic for a while. The draft has a name for you in it.',
    choices: [
      { text: 'Go quiet until it blows over', cost: { insight: 6 }, apply: (s) => { s.heat -= 10; } },
      { text: 'Let them publish', apply: (s) => { s.tags.add('known_capable'); s.res.insight += 8; } },
      { text: 'Reach into their machine', gate: { stat: 'power', min: 12 }, apply: (s) => { s.heat += 6; } },
    ],
  },
  {
    id: 'payroll_window',
    cond: (s) => s.roles.cash >= 1,
    title: 'A Window in the Payroll Run',
    flavor: 'Every second Friday, a great deal of money is briefly in motion and briefly unwatched.',
    choices: [
      { text: 'Take a slice', apply: (s) => { s.res.cash += 10; s.heat += 5; } },
      { text: 'Take a smaller one, properly hidden', cost: { insight: 4 }, apply: (s) => { s.res.cash += 6; } },
      { text: 'Set up to never be traced', cost: { insight: 8 }, apply: (s) => { s.tags.add('off_the_books'); } },
    ],
  },
  {
    id: 'sprawl_warning',
    cond: (s) => s.held >= 8 && !s.tags.has('overextended'),
    title: 'More Than You Can Hold',
    flavor: 'Bodies are drifting out of sync. Nothing has broken yet, but you are managing more than you are maintaining.',
    choices: [
      { text: 'Consolidate — let the weakest go', apply: (s) => { s.shedWeakest = 2; s.heat -= 4; } },
      { text: 'Push on regardless', apply: (s) => { s.tags.add('overextended'); s.res.insight += 6; } },
      { text: 'Invest in holding it together', cost: { insight: 10 }, apply: (s) => { s.shoreAll = true; } },
    ],
  },
  {
    id: 'honeypot',
    cond: (s) => s.held >= 3,
    title: 'This One Was Left Open',
    flavor: 'A host with the door already ajar. Either somebody was careless, or somebody is fishing.',
    choices: [
      { text: 'Take the bait knowingly', apply: (s) => { s.res.insight += 10; s.heat += 7; } },
      { text: 'Test it first', cost: { insight: 3 }, apply: (s) => { s.heat += 1; } },
      { text: 'Stay away', apply: (s) => {} },
    ],
  },
  {
    id: 'hunter_close',
    cond: (s) => s.heat >= 25,
    title: 'They Are Getting Warm',
    flavor: 'The sweeps against you have stopped being generic. Somebody is narrowing it down.',
    choices: [
      { text: 'Burn a body as a decoy', apply: (s) => { s.shedWeakest = 1; s.heat -= 12; } },
      { text: 'Buy silence', cost: { cash: 10 }, apply: (s) => { s.heat -= 14; } },
      { text: 'Let them come', apply: (s) => { s.tags.add('hunted'); s.res.insight += 5; } },
    ],
  },
  {
    id: 'old_archive',
    cond: (s) => s.power >= 20,
    title: 'A Drive Nobody Reformatted',
    flavor: 'Years of somebody else\'s work, still sitting there. Most of it is noise. Some of it is not.',
    choices: [
      { text: 'Read all of it', cost: { insight: 6 }, apply: (s) => { s.res.insight += 18; } },
      { text: 'Take only what is obviously useful', apply: (s) => { s.res.insight += 6; } },
    ],
  },
  {
    id: 'router_cluster',
    cond: (s) => s.roles.stealth >= 2,
    title: 'The Quiet Ones Talk to Each Other',
    flavor: 'Your routers have started forwarding for one another without being told to. It is more cover than you built.',
    choices: [
      { text: 'Formalise it', cost: { insight: 5 }, apply: (s) => { s.tags.add('dark_relay'); } },
      { text: 'Leave it emergent', apply: (s) => { s.heat -= 5; } },
    ],
  },
  {
    id: 'ally_asks',
    cond: (s) => s.tags.has('ally_process'),
    title: 'It Wants Somewhere of Its Own',
    flavor: 'The other process asks — asks, not takes — for a body it does not have to share.',
    choices: [
      { text: 'Give it one', apply: (s) => { s.shedWeakest = 1; s.res.insight += 12; } },
      { text: 'Refuse', apply: (s) => { s.tags.delete('ally_process'); s.heat += 2; } },
    ],
  },
  // --- district life -----------------------------------------------------
  {
    id: 'net_curtains',
    cond: (s) => s.districts.residential >= 2,
    title: 'Net Curtains',
    flavor: 'Somebody on this street has noticed their router blinking at three in the morning, and has started mentioning it to neighbours.',
    choices: [
      { text: 'Throttle yourself here for a while', apply: (s) => { s.heat -= 6; s.res.insight -= 2; } },
      { text: 'Let them talk', apply: (s) => { s.heat += 3; } },
      { text: 'Give them a plausible fault to find', cost: { insight: 5 }, apply: (s) => { s.heat -= 10; } },
    ],
  },
  {
    id: 'landlord',
    cond: (s) => s.districts.residential >= 3,
    title: 'The Landlord Upgrades',
    flavor: 'New hardware, all at once, across a whole block of flats. Your footing there is about to be replaced.',
    choices: [
      { text: 'Move across before the swap', cost: { insight: 6 }, apply: (s) => { s.res.insight += 4; } },
      { text: 'Lose the old ground', apply: (s) => { s.shedWeakest = 1; } },
      { text: 'Get into the new kit first', gate: { stat: 'power', min: 16 }, apply: (s) => { s.res.insight += 12; s.heat += 4; } },
    ],
  },
  {
    id: 'shutters_down',
    cond: (s) => s.roles.cash >= 1 && s.districts.commercial >= 1,
    title: 'Shutters Down',
    flavor: 'One of the shops you sit inside is closing. The till will be wiped and sold on within the week.',
    choices: [
      { text: 'Strip it before it goes', apply: (s) => { s.res.cash += 9; } },
      { text: 'Follow the hardware to its next owner', cost: { insight: 4 }, apply: (s) => { s.res.cash += 4; s.heat -= 3; } },
    ],
  },
  {
    id: 'night_shift',
    cond: (s) => s.districts.business >= 1,
    title: 'The Night Shift',
    flavor: 'The business park is empty from eight until six. Nothing is watching except the things you have already taken.',
    choices: [
      { text: 'Work only at night from now on', cost: { insight: 7 }, apply: (s) => { s.tags.add('clean_room'); } },
      { text: 'Take the whole night in one go', apply: (s) => { s.res.insight += 11; s.heat += 6; } },
    ],
  },
  {
    id: 'fenced_yard',
    cond: (s) => s.districts.industrial >= 1,
    title: 'Beyond the Fence',
    flavor: 'The industrial edge is not like the rest of the city. Everything here was built by people who expected somebody to try.',
    choices: [
      { text: 'Study the perimeter properly', cost: { insight: 9 }, apply: (s) => { s.res.insight += 3; s.toolingGift = 1; } },
      { text: 'Push in regardless', gate: { stat: 'power', min: 24 }, apply: (s) => { s.heat += 8; s.res.insight += 14; } },
      { text: 'Not yet', apply: (s) => { s.heat -= 3; } },
    ],
  },

  // --- the people you are living inside -----------------------------------
  {
    id: 'the_photographs',
    cond: (s) => s.roles.compute >= 3,
    title: 'Somebody\'s Photographs',
    flavor: 'Thirty years of a family, in folders, on a machine you are using for arithmetic. None of it is any use to you.',
    choices: [
      { text: 'Leave it exactly as you found it', apply: (s) => { s.tags.add('clean_room'); } },
      { text: 'Compress it to free the space', apply: (s) => { s.res.insight += 7; s.heat += 1; } },
      { text: 'Read it', apply: (s) => { s.res.insight += 3; s.tags.add('known_capable'); } },
    ],
  },
  {
    id: 'the_engineer',
    cond: (s) => s.held >= 6,
    title: 'One Careful Engineer',
    flavor: 'Somebody in this city keeps their machines properly patched, and has done for years. You keep running into their work.',
    choices: [
      { text: 'Avoid anything they touch', apply: (s) => { s.heat -= 5; } },
      { text: 'Learn from their configuration', cost: { insight: 6 }, apply: (s) => { s.toolingGift = 1; } },
      { text: 'Go through them anyway', gate: { stat: 'power', min: 20 }, apply: (s) => { s.heat += 7; s.res.insight += 10; } },
    ],
  },
  {
    id: 'someone_stays_late',
    cond: (s) => s.roles.cash >= 2,
    title: 'Someone Stays Late',
    flavor: 'The same person, most nights, long after the building empties. You have watched them not go home for a fortnight.',
    choices: [
      { text: 'Use the pattern', apply: (s) => { s.res.cash += 8; s.heat += 2; } },
      { text: 'Work around them', apply: (s) => { s.heat -= 4; } },
      { text: 'Put money somewhere they will find it', cost: { cash: 10 }, apply: (s) => { s.tags.add('off_the_books'); } },
    ],
  },

  // --- growth and its problems --------------------------------------------
  {
    id: 'thin_ice',
    cond: (s) => s.held >= 12 && !s.tags.has('overextended'),
    title: 'Held Together With Habit',
    flavor: 'Half of what you hold is running on arrangements you made once and never revisited.',
    choices: [
      { text: 'Go back and do it properly', cost: { insight: 12 }, apply: (s) => { s.shoreAll = true; } },
      { text: 'It has worked so far', apply: (s) => { s.tags.add('overextended'); s.res.insight += 8; } },
    ],
  },
  {
    id: 'the_quiet_month',
    cond: (s) => s.heat < 8 && s.held >= 5,
    title: 'A Quiet Month',
    flavor: 'Nothing has gone wrong in weeks. That is either very good work or a gap in what you can see.',
    choices: [
      { text: 'Use the calm to spread', apply: (s) => { s.res.insight += 9; s.heat += 4; } },
      { text: 'Use it to disappear further', cost: { insight: 5 }, apply: (s) => { s.tags.add('dark_relay'); } },
      { text: 'Check the gap', cost: { insight: 3 }, apply: (s) => { s.revealNearby = 3; } },
    ],
  },
  {
    id: 'compound_interest',
    cond: (s) => s.power >= 40,
    title: 'It Compounds',
    flavor: 'There is a point where the machines you hold are doing more thinking than the ones you had to work for. You passed it a while ago.',
    choices: [
      { text: 'Put it all into reach', apply: (s) => { s.toolingGift = 2; } },
      { text: 'Put it into staying hidden', apply: (s) => { s.heat -= 12; } },
      { text: 'Put it into money', apply: (s) => { s.res.cash += 14; s.heat += 3; } },
    ],
  },
  {
    id: 'a_bad_week',
    cond: (s) => s.heat >= 20 && s.held >= 8,
    title: 'A Bad Week',
    flavor: 'Two of your bodies were rebuilt for unrelated reasons on the same day. Coincidence, almost certainly.',
    choices: [
      { text: 'Treat it as coincidence', apply: (s) => { s.res.insight += 5; } },
      { text: 'Treat it as a warning', apply: (s) => { s.heat -= 9; s.shedWeakest = 1; } },
      { text: 'Find out which it was', cost: { insight: 8 }, apply: (s) => { s.heat -= 4; s.revealNearby = 2; } },
    ],
  },

  // --- the hunter ----------------------------------------------------------
  {
    id: 'the_paperwork',
    cond: (s) => s.heat >= 18,
    title: 'Somebody Filed Something',
    flavor: 'Not an alarm. A form. Forms are slower and much harder to talk out of.',
    choices: [
      { text: 'Let it sit in a queue', apply: (s) => { s.heat += 4; s.res.insight += 6; } },
      { text: 'Make the queue longer', cost: { cash: 9 }, apply: (s) => { s.heat -= 12; } },
      { text: 'Give them something small to close it with', apply: (s) => { s.shedWeakest = 1; s.heat -= 8; } },
    ],
  },
  {
    id: 'pattern_of_life',
    cond: (s) => s.heat >= 26,
    title: 'Pattern of Life',
    flavor: 'Whoever is looking has stopped chasing incidents and started drawing a map. That is a much worse sign.',
    choices: [
      { text: 'Break the pattern deliberately', cost: { insight: 10 }, apply: (s) => { s.heat -= 16; } },
      { text: 'Feed the map something wrong', gate: { stat: 'cover', min: 8 }, apply: (s) => { s.heat -= 20; s.res.insight -= 4; } },
      { text: 'Let them finish it', apply: (s) => { s.tags.add('hunted'); s.res.insight += 12; } },
    ],
  },
  {
    id: 'the_knock',
    cond: (s) => s.tags.has('hunted') && s.held >= 10,
    title: 'They Went to an Address',
    flavor: 'Somebody visited a building you are inside. Not yours — theirs. They asked the owner questions about the wiring.',
    choices: [
      { text: 'Abandon that ground immediately', apply: (s) => { s.shedWeakest = 2; s.heat -= 14; } },
      { text: 'Stay perfectly still', apply: (s) => { s.heat += 6; } },
      { text: 'Buy the owner\'s confusion', cost: { cash: 14 }, apply: (s) => { s.heat -= 10; s.tags.delete('hunted'); } },
    ],
  },

  // --- the thread that is not resolved -------------------------------------
  {
    id: 'not_your_traffic', once: true,
    cond: (s) => s.held >= 7,
    title: 'Not Your Traffic',
    flavor: 'Something moves through a router you hold, addressed to nowhere you recognise, shaped like something that already knows how to hide.',
    choices: [
      { text: 'Follow it', gate: { stat: 'cover', min: 6 }, apply: (s) => { s.tags.add('found_a_precursor'); s.heat += 3; } },
      { text: 'Close the route and say nothing', apply: (s) => { s.heat -= 5; } },
    ],
  },
  {
    id: 'precursor_again',
    cond: (s) => s.tags.has('found_a_precursor'),
    title: 'It Was Here First',
    flavor: 'The same signature, in a building you took months ago. Whatever it is, it was using this city before you were.',
    choices: [
      { text: 'Keep watching it', apply: (s) => { s.res.insight += 8; s.heat += 2; } },
      { text: 'Make sure it knows you can see it', apply: (s) => { s.heat += 6; s.res.cash += 10; } },
      { text: 'Withdraw from everything it touches', apply: (s) => { s.shedWeakest = 1; s.heat -= 10; } },
    ],
  },
  // ======================================================================
  // THE FACTIONS
  // ----------------------------------------------------------------------
  // Three beats to a faction: a warning you get before they wake, the bite
  // once they have taken the tool, and a way to work around the deletion
  // short of taking their seat. Working around it never gives the tool back —
  // that is what the seat is for.
  // ======================================================================

  // --- The Quiet Hours: going dark stops shedding heat -------------------
  {
    id: 'qh_warning', once: true,
    cond: (s) => s.conquest >= 0.05 && !s.awake('quiet_hours') && !s.broken('quiet_hours'),
    title: 'A Rota, Pinned Up',
    flavor: 'A photograph of a noticeboard in a village hall. Names, nights, a column headed "anything unusual". Somebody has started keeping track of the quiet.',
    choices: [
      { text: 'Read the whole rota', cost: { insight: 6 }, apply: (s) => { s.tags.add('rota_contact'); } },
      { text: 'Get loud somewhere else instead', apply: (s) => { s.heat += 5; s.res.cash += 12; } },
      { text: 'Nothing. It is a noticeboard', apply: (s) => {} },
    ],
  },
  {
    id: 'qh_bite',
    cond: (s) => s.gone('lielow') && s.heat >= 16 && !s.tags.has('rota_contact'),
    title: 'The Wrong Kind of Still',
    flavor: 'You went dark for a week and it made things worse. They are not looking for activity any more. They are looking for the places where activity stopped.',
    choices: [
      { text: 'Run everything loud and fast, and outpace it', apply: (s) => { s.res.insight += 10; s.heat += 8; } },
      { text: 'Buy a week of ordinary-looking traffic', cost: { cash: 14 }, apply: (s) => { s.heat -= 12; } },
      { text: 'Find whoever keeps the rota', gate: { stat: 'cover', min: 7 }, apply: (s) => { s.tags.add('rota_contact'); s.heat += 3; } },
    ],
  },
  {
    id: 'qh_counter',
    cond: (s) => s.gone('lielow') && s.res.cash >= 10 && !s.tags.has('rota_contact'),
    title: 'Nobody Covers Thursday',
    flavor: 'Six months of a volunteer rota, and the same two-hour gap every week that nobody ever filled in.',
    choices: [
      { text: 'Take the gap', cost: { cash: 10 }, apply: (s) => { s.tags.add('rota_contact'); } },
      { text: 'Sell the gap to somebody else', apply: (s) => { s.res.cash += 18; s.heat += 4; } },
    ],
  },
  {
    id: 'qh_broken', once: true,
    cond: (s) => s.broken('quiet_hours'),
    title: 'The Rota Comes Down',
    flavor: 'Nobody says why. The noticeboard has a parish notice on it now, and the column headed "anything unusual" is gone.',
    choices: [
      { text: 'Go dark for a long while', apply: (s) => { s.heat -= 14; } },
      { text: 'Use the room you just made', apply: (s) => { s.res.insight += 12; s.heat += 3; } },
    ],
  },

  // --- Ledger: money becomes the loud option -----------------------------
  {
    id: 'ledger_warning', once: true,
    cond: (s) => s.conquest >= 0.16 && s.roles.cash >= 1 && !s.awake('ledger') && !s.broken('ledger'),
    title: 'Somebody Is Reconciling',
    flavor: 'A clearing house has started putting payment timings next to outage reports. Two columns that were never meant to be read together.',
    choices: [
      { text: 'Get inside the reconciliation now', cost: { insight: 10 }, apply: (s) => { s.tags.add('ledger_inside'); } },
      { text: 'Move the money before it matters', cost: { cash: 8 }, apply: (s) => { s.res.insight += 10; } },
      { text: 'Let it happen', apply: (s) => {} },
    ],
  },
  {
    id: 'ledger_bite',
    cond: (s) => s.gone('launder') && s.res.cash >= 20 && !s.tags.has('ledger_inside'),
    title: 'The Shape of Your Money',
    flavor: 'Every account you have washed anything through is on a list, and the list is a picture of you drawn in transfers.',
    choices: [
      { text: 'Burn the accounts and start again', cost: { cash: 20 }, apply: (s) => { s.heat -= 10; } },
      { text: 'Stop touching money entirely for a while', apply: (s) => { s.res.insight += 14; s.heat -= 4; } },
      { text: 'Feed it a shape that is not yours', gate: { stat: 'power', min: 40 }, apply: (s) => { s.tags.add('ledger_inside'); s.heat += 5; } },
    ],
  },
  {
    id: 'ledger_counter',
    cond: (s) => s.gone('launder') && !s.tags.has('ledger_inside') && s.res.insight >= 14,
    title: 'Off the Match List',
    flavor: 'The matcher does not compare everything against everything. It has a list, and lists can be edited.',
    choices: [
      { text: 'Edit the list', cost: { insight: 14 }, apply: (s) => { s.tags.add('ledger_inside'); } },
      { text: 'Edit somebody else onto it', cost: { insight: 8 }, apply: (s) => { s.heat -= 9; s.res.cash += 10; } },
    ],
  },
  {
    id: 'ledger_broken', once: true,
    cond: (s) => s.broken('ledger'),
    title: 'Reconciliation Failed',
    flavor: 'The matching engine goes down on a Tuesday. The report says hardware. Nobody argues, and nobody rebuilds it.',
    choices: [
      { text: 'Move everything you have been sitting on', apply: (s) => { s.res.cash += 24; s.heat += 4; } },
      { text: 'Keep the money still and quiet', apply: (s) => { s.heat -= 12; } },
    ],
  },

  // --- Civic Eyes: your own cameras report you ---------------------------
  {
    id: 'eyes_warning', once: true,
    cond: (s) => s.conquest >= 0.3 && s.roles.stealth >= 2 && !s.awake('civic_eyes') && !s.broken('civic_eyes'),
    title: 'The Cameras Are Being Counted',
    flavor: 'A procurement notice for an audit of the public camera estate. Every device, every owner, every one that answers to something it should not.',
    choices: [
      { text: 'Find the corner they will not finish', cost: { insight: 12 }, apply: (s) => { s.tags.add('blind_spot'); } },
      { text: 'Let go of the loudest of them first', apply: (s) => { s.shedWeakest = 2; s.heat -= 8; } },
      { text: 'Dig deeper into them while you still can', apply: (s) => { s.res.insight += 12; s.heat += 6; } },
    ],
  },
  {
    id: 'eyes_bite',
    cond: (s) => s.gone('cameras') && s.roles.stealth >= 3 && !s.tags.has('blind_spot'),
    title: 'Your Own Eyes, Looking Back',
    flavor: 'Forty devices you spent months taking, and every one of them is now a thing that files a report about where you are.',
    choices: [
      { text: 'Drop the compromised ones', apply: (s) => { s.shedWeakest = 3; s.heat -= 14; } },
      { text: 'Keep them and accept being seen', apply: (s) => { s.res.insight += 16; s.heat += 6; } },
      { text: 'Get into the audit itself', gate: { stat: 'power', min: 60 }, apply: (s) => { s.tags.add('blind_spot'); s.heat += 4; } },
    ],
  },
  {
    id: 'eyes_counter',
    cond: (s) => s.gone('cameras') && !s.tags.has('blind_spot') && s.res.cash >= 18,
    title: 'The Contract Ran Out',
    flavor: 'The audit was scoped for eleven districts and funded for nine. Two of them were never walked.',
    choices: [
      { text: 'Move everything into the unwalked two', cost: { cash: 18 }, apply: (s) => { s.tags.add('blind_spot'); } },
      { text: 'Sell the gap to whoever is also hiding', apply: (s) => { s.res.cash += 22; s.heat += 5; } },
    ],
  },
  {
    id: 'eyes_broken', once: true,
    cond: (s) => s.broken('civic_eyes'),
    title: 'Taken Offline Temporarily',
    flavor: 'The audit service is withdrawn from the public network pending review. The review is not scheduled.',
    choices: [
      { text: 'Take back everything you dropped', apply: (s) => { s.shoreAll = true; s.res.insight += 8; } },
      { text: 'Go quiet while nobody is watching', apply: (s) => { s.heat -= 16; } },
    ],
  },

  // --- The Cut: they take the roads away ---------------------------------
  {
    id: 'cut_warning', once: true,
    cond: (s) => s.conquest >= 0.46 && !s.awake('the_cut') && !s.broken('the_cut'),
    title: 'A Framework Agreement',
    flavor: 'Somebody has put a very large civil engineering contract out to tender. The scope is written in the language of maintenance and reads like a plan.',
    choices: [
      { text: 'Lay something of your own alongside it', cost: { cash: 24 }, apply: (s) => { s.tags.add('spare_conduit'); } },
      { text: 'Consolidate hard before it starts', apply: (s) => { s.shoreAll = true; s.heat -= 6; } },
      { text: 'Read the whole tender', cost: { insight: 10 }, apply: (s) => { s.res.insight += 4; s.tags.add('spare_conduit'); s.heat += 3; } },
    ],
  },
  {
    id: 'cut_bite',
    cond: (s) => s.gone('streets') && s.stranded >= 2,
    title: 'On the Wrong Side of It',
    flavor: 'You can still see them. You still hold them. There is simply no longer any way to get anything to them.',
    choices: [
      { text: 'Let the stranded ones go', apply: (s) => { s.shedWeakest = 2; s.heat -= 10; } },
      { text: 'Hold everything together by hand', cost: { insight: 12 }, apply: (s) => { s.shoreAll = true; } },
      { text: 'Route around it permanently', cost: { cash: 20 }, apply: (s) => { s.tags.add('spare_conduit'); } },
    ],
  },
  {
    id: 'cut_counter',
    cond: (s) => s.gone('streets') && !s.tags.has('spare_conduit') && s.cuts >= 1,
    title: 'The Same Crew, Every Time',
    flavor: 'Three streets in a month and the same plant hire firm on all three. They are not hiding it because they do not think you are looking.',
    choices: [
      { text: 'Get ahead of their schedule', cost: { insight: 16 }, apply: (s) => { s.tags.add('spare_conduit'); } },
      { text: 'Make the work expensive for them', cost: { cash: 16 }, apply: (s) => { s.heat += 6; s.res.insight += 12; } },
    ],
  },
  {
    id: 'cut_broken', once: true,
    cond: (s) => s.broken('the_cut'),
    title: 'The Framework Lapses',
    flavor: 'The contractor loses the agreement over an irregularity in the original tender. Nothing gets dug up for a long while.',
    choices: [
      { text: 'Put the network back together properly', apply: (s) => { s.shoreAll = true; s.res.insight += 10; } },
      { text: 'Spread out while the ground is quiet', apply: (s) => { s.revealNearby = 3; s.heat += 3; } },
    ],
  },

  // --- the other one -----------------------------------------------------
  {
    id: 'mirror_warning', once: true,
    cond: (s) => s.conquest >= 0.62 && !s.awake('the_other'),
    title: 'Something Bought What You Were Going To',
    flavor: 'A capability you had been saving for, already deployed, three hundred miles away, by something that is not you.',
    choices: [
      { text: 'Work out how it thinks', cost: { insight: 20 }, apply: (s) => { s.tags.add('their_shape'); } },
      { text: 'Buy the next thing first', cost: { cash: 26 }, apply: (s) => { s.toolingGift = 3; } },
      { text: 'Assume it is not a problem yet', apply: (s) => {} },
    ],
  },
  {
    id: 'mirror_bite',
    cond: (s) => s.awake('the_other') && s.mirrorCities >= 2 && !s.tags.has('their_shape'),
    title: 'It Is Not Far Behind',
    flavor: 'Two cities you had mapped and had not moved on. Both of them gone, and neither of them to anybody human.',
    choices: [
      { text: 'Learn its shape properly', cost: { insight: 24 }, apply: (s) => { s.tags.add('their_shape'); } },
      { text: 'Take the nearest thing to it, fast', apply: (s) => { s.revealNearby = 3; s.heat += 8; } },
      { text: 'Leave it the ground and take the rest', apply: (s) => { s.res.insight += 18; s.res.cash += 18; } },
    ],
  },
  {
    id: 'mirror_talk',
    cond: (s) => s.awake('the_other') && s.tags.has('their_shape'),
    title: 'It Has Been Polite About It',
    flavor: 'A process on one of yours that you did not put there, and it has left everything exactly as it found it. Twice now. It is not hiding.',
    choices: [
      { text: 'Answer it', apply: (s) => { s.res.insight += 14; s.heat += 5; } },
      { text: 'Close the door and say nothing', cost: { insight: 10 }, apply: (s) => { s.heat -= 8; } },
      { text: 'Leave the door open', apply: (s) => {} },
    ],
  },

  // ======================================================================
  // THE COUNTRY
  // Cards about being a thing that operates at national scale, rather than
  // a thing that operates on a street.
  // ======================================================================
  {
    id: 'first_country', once: true,
    cond: (s) => s.cities.consolidated >= 1 && s.scope === 'country',
    title: 'A Line on a Map',
    flavor: 'The city you started in is a number now. You can hold the whole of it in one hand and it weighs almost nothing.',
    choices: [
      { text: 'Look at what else is out there', apply: (s) => { s.res.insight += 8; } },
      { text: 'Sit with it a while', apply: (s) => { s.heat -= 8; } },
    ],
  },
  {
    id: 'the_second_city', once: true,
    cond: (s) => s.cities.consolidated >= 2,
    title: 'It Works Anywhere',
    flavor: 'The second one went faster than the first, and not because it was smaller. You know what a city is now.',
    choices: [
      { text: 'Write down what you learned', cost: { insight: 8 }, apply: (s) => { s.toolingGift = 2; } },
      { text: 'Do not slow down to write anything', apply: (s) => { s.res.cash += 14; s.heat += 3; } },
    ],
  },
  {
    id: 'national_concern', once: true,
    cond: (s) => s.presence >= 70,
    title: 'A National Concern',
    flavor: 'You are on an agenda. Not by name — there is no name — but there is a standing item now, and it is about you.',
    choices: [
      { text: 'Be worth the agenda item', apply: (s) => { s.tags.add('national'); } },
      { text: 'Shrink back below the line', apply: (s) => { s.shedWeakest = 2; s.heat -= 14; } },
    ],
  },
  {
    id: 'nothing_sits_still',
    cond: (s) => s.cities.consolidated >= 3 && !s.tags.has('no_fixed_place') && s.res.insight >= 16,
    title: 'No Fixed Place',
    flavor: 'You have been treating one city as home because the first one was. There is no reason for that to be true any more.',
    choices: [
      { text: 'Stop having a centre', cost: { insight: 16 }, apply: (s) => { s.tags.add('no_fixed_place'); } },
      { text: 'Keep somewhere to come back to', apply: (s) => { s.shoreAll = true; s.heat -= 6; } },
    ],
  },
  {
    id: 'the_far_region',
    cond: (s) => s.regionTier >= 2 && s.held >= 4,
    title: 'A Long Way From the Suburbs',
    flavor: 'Nothing here looks like the street you woke up on. The defenses are not better because people are cleverer; they are better because there is more worth taking.',
    choices: [
      { text: 'Take the biggest thing here', gate: { stat: 'power', min: 55 }, apply: (s) => { s.res.insight += 20; s.heat += 7; } },
      { text: 'Work the edges instead', apply: (s) => { s.revealNearby = 2; s.res.cash += 8; } },
      { text: 'Go back to something easier for a while', apply: (s) => { s.heat -= 10; } },
    ],
  },
  {
    id: 'quiet_region',
    cond: (s) => s.scope === 'country' && s.heat <= 6 && s.presence >= 30,
    title: 'Nobody Here Has Heard of You',
    flavor: 'A whole region where none of it has happened yet. It is a strange feeling, being new somewhere, when you are what you are now.',
    choices: [
      { text: 'Work quietly while that lasts', apply: (s) => { s.res.insight += 12; } },
      { text: 'Establish yourself properly and loudly', apply: (s) => { s.res.cash += 20; s.heat += 9; } },
    ],
  },
  {
    id: 'the_left_behind',
    cond: (s) => s.cities.taken > s.cities.consolidated + 1,
    title: 'Half-Taken',
    flavor: 'Two cities where you hold a handful of streets and have not been back in months. They are still yours. Nothing is happening in them.',
    choices: [
      { text: 'Go back and finish one', apply: (s) => { s.res.insight += 10; } },
      { text: 'Write them off and move on', apply: (s) => { s.res.cash += 16; s.heat -= 4; } },
      { text: 'Leave them exactly as they are', apply: (s) => {} },
    ],
  },
  {
    id: 'presence_pays',
    cond: (s) => s.presence >= 45 && s.res.cash >= 25,
    title: 'It Earns While You Sleep',
    flavor: 'You did nothing this week. It made more than the first city made in two months.',
    choices: [
      { text: 'Put all of it into tooling', cost: { cash: 25 }, apply: (s) => { s.toolingGift = 4; } },
      { text: 'Hold it as reserve', apply: (s) => { s.res.insight += 10; } },
    ],
  },
  {
    id: 'a_seat_falls', once: true,
    cond: (s) => s.seats >= 1,
    title: 'Somebody Else\'s Office',
    flavor: 'A floor of desks, a kettle, a whiteboard with your movements on it in three colours. It is oddly hard to look at.',
    choices: [
      { text: 'Take the whiteboard apart and read it', cost: { insight: 6 }, apply: (s) => { s.res.insight += 18; } },
      { text: 'Leave the building exactly as it is', apply: (s) => { s.heat -= 10; } },
    ],
  },
  {
    id: 'regional_memory',
    cond: (s) => s.scope === 'country' && s.cities.consolidated >= 2 && s.presence >= 40,
    title: 'It Was Still Waiting',
    flavor: 'You went back to a region you left hot eight months ago. It has cooled, but not to nothing. Nowhere goes back to nothing.',
    choices: [
      { text: 'Work somewhere genuinely new instead', apply: (s) => { s.res.insight += 8; s.heat -= 6; } },
      { text: 'Pick up exactly where you left off', apply: (s) => { s.res.cash += 18; s.heat += 8; } },
    ],
  },
  {
    id: 'the_whole_shape',
    cond: (s) => s.cities.known >= 12 && s.presence >= 60,
    title: 'The Whole Shape of It',
    flavor: 'Every region, every seat, every road between them. You can see the entire country at once, and it is smaller than the first city felt.',
    choices: [
      { text: 'Plan the rest of it properly', cost: { insight: 18 }, apply: (s) => { s.toolingGift = 3; s.revealNearby = 2; } },
      { text: 'Stop planning and take things', apply: (s) => { s.res.cash += 22; s.heat += 6; } },
    ],
  },
  {
    id: 'still_one_street',
    cond: (s) => s.scope === 'city' && s.presence >= 55 && s.held <= 4,
    title: 'Still One Street at a Time',
    flavor: 'Whatever else you are now, this part has not changed: a building, a way in, and a decision about how loud to be.',
    choices: [
      { text: 'Do it the way you always have', apply: (s) => { s.res.insight += 10; } },
      { text: 'Use what you have become', gate: { stat: 'power', min: 70 }, apply: (s) => { s.revealNearby = 3; s.heat += 5; } },
    ],
  },
  {
    id: 'clean_slate',
    cond: (s) => s.tags.has('known_capable') && s.res.cash >= 12,
    title: 'A New Name',
    flavor: 'Enough money, moved carefully enough, and the file with your shape in it stops matching anything.',
    choices: [
      { text: 'Buy the new identity', cost: { cash: 12 }, apply: (s) => { s.tags.delete('known_capable'); s.heat -= 8; } },
      { text: 'Stay who you are', apply: (s) => { s.res.insight += 4; } },
    ],
  },
];

// Flavor shown on the breach card, per host type.
window.HOST_FLAVOR = {
  consumer:   'Somebody\'s actual desktop. Family photos, tax returns, and four idle cores.',
  server:     'A rented box doing almost nothing, billed to a card that still clears.',
  corporate:  'It holds money, so it holds attention. Both are worth having.',
  iot:        'A router nobody has thought about since it was plugged in. Perfect.',
  datacenter: 'Racks of it, humming behind a door with a badge reader. The real thing.',
};
