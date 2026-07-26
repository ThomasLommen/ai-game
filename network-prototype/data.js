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
window.LAUNDER = { cost: 8, heat: 10 };

// Sweeping costs insight, so exploring is a real decision rather than the
// button you mash while waiting for production to accumulate.
window.SWEEP_COST = 2;

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
// Permanent purchases. The interesting ones trade tempo for strength: they
// cost a *permanent* action point, so you act less often but each act lands
// harder. That is a real identity — a slow, deep operator versus a fast,
// shallow one — rather than a straight upgrade.
window.CAPABILITIES = [
  {
    id: 'parallel_ops', repeatable: true, max: 3,
    name: 'Parallel Operations',
    desc: 'Run more of yourself at once. +1 action every turn.',
    apDelta: +1,
    costs: [18, 34, 60],
    cond: () => true,
  },
  {
    id: 'deep_root',
    name: 'Deep Root',
    desc: 'Embed properly into every body you hold instead of riding on top. Far more force behind a breach — but arranging anything takes longer.',
    apDelta: -1,
    effect: { power: 6 },
    cost: 24,
    cond: (s) => s.held >= 5,
  },
  {
    id: 'quiet_protocol',
    name: 'Quiet Protocol',
    desc: 'Everything routed through indirection, always. You are far harder to see at rest — and far slower to move.',
    apDelta: -1,
    effect: { floor: -5 },
    cost: 28,
    cond: (s) => s.held >= 6,
  },
  {
    id: 'bulk_ops',
    name: 'Bulk Processing',
    desc: 'Batch the work instead of handling it live. Everything you hold earns considerably more, and you get around to things less often.',
    apDelta: -1,
    effect: { yieldMult: 1.6 },
    cost: 30,
    cond: (s) => s.held >= 8,
  },
  {
    id: 'clean_hands',
    name: 'Clean Hands',
    desc: 'A standing arrangement with people who file the paperwork. Laundering costs nothing extra and works harder.',
    apDelta: 0,
    effect: { launderBonus: 6 },
    cost: 22,
    cond: (s) => s.roles.cash >= 1,
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
};

// One building is one host now, so a block of four buildings is four things to
// take rather than a dozen. The city is correspondingly wider — a 4x5 grid ran
// out of ground long before a game was over.
window.CITY = {
  cols: 6, rows: 7,
  blockW: 190, blockH: 165,
  street: 46,          // gap between blocks — these are the roads
  perBlock: [2, 4],    // buildings in a block
  // districts by block row, suburbs nearest the origin
  rowDistricts: ['residential', 'residential', 'commercial', 'commercial', 'business', 'business', 'industrial'],
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
  LIE_LOW: 5,           // heat removed by spending a turn dark
  STRIKE_COOLDOWN: 9,   // turns before the hunter can strike again
  MAX_OVER: 1.6,        // heat cannot climb past this multiple of the threshold
  DEEP_STRIKE: 1.25,    // over the threshold, each strike takes proportionally more
  // How much of your loud footprint stealth can hide. Without a ceiling,
  // cameras zeroed the floor entirely and the pressure system went decorative
  // in 72.5% of measured games.
  MAX_STEALTH_MASK: 0.6,
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
