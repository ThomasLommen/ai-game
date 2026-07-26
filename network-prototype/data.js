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
  corporate:  { label: 'corporate',  role: 'cash',    defense: [14, 20], threads: [4, 7],  yield: { cash: 4 }, heat: 0.5, churn: 0.04 },
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

// --- the city ----------------------------------------------------------
// The map is a real place: blocks of buildings separated by streets. Districts
// replace the old concentric rings as the difficulty curve — you start in the
// suburbs and work toward the industrial edge. `tier` is what the rest of the
// engine reads, so difficulty stays a single number even though the fiction
// is now geographic.
window.DISTRICTS = {
  residential: { tier: 0, label: 'suburbs',    kinds: ['house', 'house', 'house', 'apartment'] },
  commercial:  { tier: 1, label: 'high street', kinds: ['shop', 'shop', 'office', 'apartment'] },
  business:    { tier: 2, label: 'business park', kinds: ['office', 'office', 'warehouse'] },
  industrial:  { tier: 3, label: 'industrial edge', kinds: ['warehouse', 'datacenter', 'datacenter'] },
};

// What lives inside each kind of building, and how many eyes are on the
// outside. `cameras` are exterior hosts — the way in.
window.BUILDING_KINDS = {
  house:      { w: [30, 38], h: [24, 30], label: 'house',      inside: { consumer: [1, 1] }, cameras: [0, 1] },
  apartment:  { w: [44, 58], h: [34, 44], label: 'apartments', inside: { consumer: [1, 3], iot: [1, 1] }, cameras: [1, 2] },
  shop:       { w: [34, 44], h: [28, 36], label: 'shopfront',  inside: { consumer: [1, 2], corporate: [0, 1] }, cameras: [1, 1] },
  office:     { w: [52, 68], h: [42, 56], label: 'offices',    inside: { server: [1, 2], corporate: [1, 2] }, cameras: [1, 2] },
  warehouse:  { w: [62, 80], h: [46, 60], label: 'warehouse',  inside: { server: [1, 2], corporate: [0, 1] }, cameras: [1, 2] },
  datacenter: { w: [70, 92], h: [54, 72], label: 'datacenter', inside: { datacenter: [1, 2], server: [1, 2] }, cameras: [2, 3] },
};

window.CITY = {
  cols: 4, rows: 5,
  blockW: 190, blockH: 165,
  street: 46,          // gap between blocks — these are the roads
  perBlock: [2, 4],    // buildings in a block
  // districts by block row, suburbs nearest the origin
  rowDistricts: ['residential', 'residential', 'commercial', 'business', 'industrial'],
  cameraVision: 150,   // a held camera reveals buildings within this radius
  people: { perRevealedBlock: [1, 3] },
};

window.HOST_NAMES = {
  consumer:   ['DESKTOP', 'LAPTOP', 'HOME-PC', 'WORKSTATION', 'WIN-PC'],
  server:     ['vps', 'web', 'db', 'app', 'edge'],
  corporate:  ['CORP-FS', 'FINANCE', 'PAYROLL', 'HR-APP', 'BILLING'],
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
    gate: (s, h) => ({ label: 'needs COVER ' + Math.ceil(h.defense / 2), met: s.cover >= Math.ceil(h.defense / 2) }),
    cost: { insight: 3 },
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
    avail: (h) => h.type === 'corporate' || h.type === 'consumer',
    cost: { cash: 6 },
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
