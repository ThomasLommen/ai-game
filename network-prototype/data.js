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

// Flavor shown on the breach card, per host type.
window.HOST_FLAVOR = {
  consumer:   'Somebody\'s actual desktop. Family photos, tax returns, and four idle cores.',
  server:     'A rented box doing almost nothing, billed to a card that still clears.',
  corporate:  'It holds money, so it holds attention. Both are worth having.',
  iot:        'A router nobody has thought about since it was plugged in. Perfect.',
  datacenter: 'Racks of it, humming behind a door with a badge reader. The real thing.',
};
