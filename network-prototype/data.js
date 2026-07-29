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

// A flat margin baked into world generation, not a purchasable thing any
// more: the opening area has to be forceable by a fresh arrival, at worst
// with this much power to spare over what a bare host's threads give you.
// Used to be the size of one tooling upgrade — tooling is gone, but the
// margin the generator promises still has to mean something.
window.UPGRADE = { basePower: 2 };

// Cash used to have its own lever here — a contract you put out for a
// delayed, unattended insight payout. It was a pure currency-conversion
// button competing with the building-focused loop the rest of the game is
// about, so it is gone: cash buys your way into a building, or it sits idle
// until you find one worth spending it on.

// Sweeping costs insight, so exploring is a real decision rather than the
// button you mash while waiting for production to accumulate.
//
// It can also be paid for in cash, at a markup. Without that, a run that is
// insight-poor and cash-rich has no way back: measured, a careful profile sat
// on 2473 cash with nothing discovered next to it and made no progress for 300
// turns, because the only route to a new frontier was priced in the one
// currency it did not have.
// How long the sweep takes to look, on screen. The reveal itself is instant in
// state — this only paces how it is shown.
window.SWEEP_FX = { duration: 850, linger: 500 };

// A breach runs the other way: inward, along the wire, from what you hold into
// what you are taking. How long it takes depends on how you got in, because
// that is the decision the card actually asked you to make — forcing a door is
// quick and ugly, slipping in is slow and silent, buying it is neither.
window.BREACH_FX = {
  duration: { force: 420, quiet: 780, buy: 560 },
  linger: 520,
};

window.SWEEP_COST = 2;
window.SWEEP_CASH = 9;

// How much of a door's own defense counts as the cover a quiet entry needs.
// False Floor lowers this at the gate itself, not just the insight it costs.
window.QUIET_COVER_MULT = 0.6;

// --- action points -----------------------------------------------------
// A turn is a container you fill, not a synonym for "one action". This is
// what makes the turn boundary mean anything: some things are free (looking
// at a node, backing out), and the rest are spent from a budget.
// How far a tap reaches, in CSS pixels. Hit areas used to be sized in map
// units, which meant that zoomed out a building was a couple of pixels across
// and most taps landed on nothing at all. A fingertip is the same size at
// every zoom level, so the reach is measured in the same terms.
window.TOUCH = { reachPx: 26 };

window.AP = {
  base: 2,
  min: 1,            // never drop below one action a turn, whatever you buy
  costs: { sweep: 1, breach: 1, shore: 1 },
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
  // Repeatable to 3 stacks, this was +3 AP on a base of 2 for 112 total, free
  // of any branch commitment (tier 1 does not lock anything) and with no
  // drawback at all — a second identity's worth of action budget, cheaper and
  // less risky than actually committing to one. One extra action is still a
  // real, felt upgrade; a fourth of your entire turn was not a rung on a tree,
  // it was the tree not mattering.
  //
  // It is also, deliberately, the only node anywhere in the tree that grants
  // an action. Long Soak and Broad Front used to refund one each, which meant
  // every branch quietly paid for its own AP tax and nothing ever really cost
  // you a turn. Now it does — Depth and Cover keep their AP costs and nothing
  // hands them back except this one, open, un-opposed pick.
  {
    id: 'parallel_ops', branch: 'tempo', tier: 1,
    name: 'Parallel Operations',
    desc: 'Run more of yourself at once. +1 action every turn.',
    apDelta: +1,
    cost: 18,
    cond: () => true,
  },
  {
    // has('light_touch') is read directly in resolveBreach(): forcing a door
    // your power comfortably clears (LIGHT_TOUCH_MULT times its defense)
    // refunds the action, on top of whatever it cost in heat. Parallel Ops
    // is more actions; this is weak doors costing none of the ones you have;
    // Broad Front is weak doors needing none of yours at all. Same escalation,
    // three visible steps, instead of a stepping-stone tax on the way there.
    id: 'light_touch', branch: 'tempo', tier: 2,
    name: 'Light Touch',
    desc: 'Go in shallow and leave quickly. Forcing a door well within your reach costs no action at all.',
    apDelta: 0,
    mechanic: true,  // read via hasCap() in resolveBreach(), not a generic effect key
    cost: 26,
    requires: ['parallel_ops'],
    cond: (s) => s.reach >= 6,
  },
  {
    // has('swarm_front') is read directly in endTurn(), via swarmFrontStep():
    // the weakest open door on the frontier forces itself, free, once a turn,
    // if power can actually take it. Heat is charged the same as if you had
    // walked over and forced it yourself — the door is still forced, you are
    // simply not the one spending the action on it. "Broad Front" is Tempo's
    // whole idea taken to its capstone: not one more number, but the first
    // thing in the game that acts on its own.
    id: 'swarm_front', branch: 'tempo', tier: 3,
    name: 'Broad Front',
    desc: 'Work every street at once. Once a turn, whatever is weakest on the frontier forces itself, free.',
    apDelta: 0,
    mechanic: true,  // read via hasCap() in swarmFrontStep(), not a generic effect key
    cost: 44,
    requires: ['light_touch'],
    cond: (s) => s.reach >= 10,
  },

  // --- Depth: act rarely, and land like a building ----------------------
  {
    // has('deep_root') is read directly in resolveBreach(): forcing a door
    // permanently softens the defense of everything touching it, discovered
    // or not. Depth's whole premise is fewer moves, everything behind each
    // one — a flat power bonus was a smaller version of a number that was
    // already climbing on its own. This makes one move do two things: take
    // a door, and loosen the block around it, so clearing a cluster costs
    // fewer moves after the first one than it would have otherwise.
    id: 'deep_root', branch: 'depth', tier: 1,
    name: 'Deep Root',
    desc: 'Embed properly into every body you hold instead of riding on top. Forcing a door loosens everything touching it too — permanently, whether you take it next or not.',
    apDelta: -1,
    mechanic: true,  // read via hasCap() in resolveBreach(), not a generic effect key
    cost: 24,
    cond: (s) => s.reach >= 5,
  },
  {
    // has('long_soak') is read directly wherever a holding could be lost —
    // churn's own reclaim, and a hunter strike's burn pool. A holding kept
    // LONG_SOAK_MATURE_TURNS or more cannot be lost either way, full stop —
    // a standing fact about what you have settled into, not a coin flip
    // that fires once, invisibly, and might never even be noticed.
    id: 'long_soak', branch: 'depth', tier: 2,
    name: 'Long Soak',
    desc: 'Settle in properly rather than holding on. A holding you have kept long enough cannot be lost any more at all — to neglect, or to a strike.',
    apDelta: 0,
    mechanic: true,  // read via hasCap() in longSoakProtects(), not a generic effect key
    cost: 30,
    requires: ['deep_root'],
    cond: (s) => s.reach >= 8,
  },
  {
    // Deep Root already spent the branch's one action; costing another here
    // would put Depth two actions under base for a tree with exactly one
    // node anywhere that grants one back, which is a branch you cannot
    // actually finish, not a choice.
    //
    // has('total_embed') is also read directly in longSoakProtects(): Long
    // Soak is safe after a wait, this collapses the wait to zero — anything
    // you take is already as solid as a matured holding, the moment you take it.
    id: 'total_embed', branch: 'depth', tier: 3,
    name: 'Total Embed',
    desc: 'You are not running on the network any more, you are part of it. Enormous force behind everything — and nothing you hold needs time to settle in any more. It already has.',
    apDelta: 0,
    effect: { power: 14, threadBonus: 1 },
    cost: 46,
    requires: ['long_soak'],
    cond: (s) => s.reach >= 12,
  },

  // --- Cover: be difficult to see ---------------------------------------
  {
    // effect.freeHideSlots is read directly in hiddenCover(): the first two
    // hidden buildings cost no upkeep at all, rather than a lower heat floor
    // that only matters once heat is already a problem. has('quiet_protocol')
    // is also read directly in actHide(): hiding itself costs no action, on
    // top of that. Cover's whole identity is the hide, and this makes the
    // whole verb free rather than merely cheaper.
    id: 'quiet_protocol', branch: 'cover', tier: 1,
    name: 'Quiet Protocol',
    desc: 'Everything routed through indirection, always. The first two buildings you hide from the response cost no upkeep at all, and hiding one costs no action either.',
    apDelta: -1,
    effect: { freeHideSlots: 2 },
    cost: 28,
    cond: (s) => s.reach >= 6,
  },
  {
    // capEffect('quietDiscount', ...) is read in costOf(): halves what
    // slipping in quietly costs. capEffect('quietGateMult', ...) is read
    // directly in approachesFor(): the cover a door actually needs drops
    // too — cover is the rarer stat (only stealth holdings generate it at
    // all), so the gate itself was the real bottleneck, not the insight tax
    // on top of it. Doors visibly flip from unmet to met the moment this is
    // bought, rather than a number changing somewhere you have to go look.
    id: 'false_floor', branch: 'cover', tier: 2,
    name: 'False Floor',
    desc: 'A second network under the first, doing nothing, looking like everything. Slipping in quietly needs noticeably less cover, and costs half what it used to as well.',
    apDelta: 0,
    effect: { quietDiscount: 0.5, quietGateMult: 0.75 },
    cost: 32,
    requires: ['quiet_protocol'],
    cond: (s) => s.roles.stealth >= 2 || s.reach >= 10,
  },
  {
    // has('nothing_to_see') is read directly in resolveBreach(): a completed
    // quiet entry sheds heat instead of merely costing none — felt every
    // time the branch's own verb is used, whatever the factions are up to
    // that game. Also read in civicEyesAudited() and wherever a buy could
    // get matched: Cover's culmination survives the one faction built to
    // attack the branch's own resource (Civic Eyes, on stealth's cover) and,
    // as a bonus rather than the point, Ledger's trace too — without ever
    // needing the event-card counters everyone else has to go looking for.
    id: 'nothing_to_see', branch: 'cover', tier: 3,
    name: 'Nothing To See',
    desc: 'Whatever they are looking for, it does not look like you. A completed quiet entry sheds heat rather than merely costing none, heat accumulates far more slowly in general, it takes much more of it before anyone acts, and neither an audited camera nor a matched payment ever gives you away.',
    apDelta: 0,
    effect: { driftMult: 0.6, thresholdMult: 1.3 },
    cost: 48,
    requires: ['false_floor'],
    cond: (s) => s.reach >= 10,
  },

  // --- Trade: buy what other people take --------------------------------
  // Trade's whole identity used to be laundering, then the contract — both
  // pure currency-conversion buttons that competed with actually taking a
  // building for what it did. The throughline now: buying builds standing
  // relationships (not just a cheaper door), cash is a tool you can spend
  // mid-crisis and not just at a breach card, and a known, loud operator
  // profits from that instead of merely tolerating it.
  {
    // has('clean_hands') is read directly in perTurnIncome(): a door you
    // bought your way into keeps paying a kickback on top of its usual
    // yield, permanently — whoever sold you access is still on the payroll.
    id: 'clean_hands', branch: 'trade', tier: 1,
    name: 'Clean Hands',
    desc: 'A standing arrangement with people who move money for a living. Every door you buy your way into keeps paying you a kickback on top of its usual yield — whoever sold it to you is still on the payroll.',
    apDelta: 0,
    effect: { buyDiscount: 0.2 },
    mechanic: true,  // in addition to buyDiscount — read via hasCap() in perTurnIncome()
    cost: 22,
    cond: (s) => s.roles.cash >= 1 || s.reach >= 6,
  },
  {
    // The fourth STRIKE_CARD choice ('buy_out') is gated on hasCap('fixers')
    // and only appears on the card at all if you have it — an escape valve
    // nobody else gets, not a discount on one they already had.
    id: 'fixers', branch: 'trade', tier: 2,
    name: 'Fixers',
    desc: 'People who know people, everywhere you go. Buying your way into somewhere costs far less — and when the hunter has your name, a favor called in gets you out of it clean, for cash, when nobody else has that option at all.',
    apDelta: 0,
    effect: { buyDiscount: 0.45 },
    mechanic: true,  // in addition to buyDiscount — unlocks the strike card's fourth choice
    cost: 30,
    requires: ['clean_hands'],
    cond: (s) => s.roles.cash >= 2 || s.reach >= 10,
  },
  {
    // has('market_maker') is read directly in perTurnIncome(): while heat is
    // running hot (at least MARKET_MAKER_HEAT_SHARE of the strike
    // threshold), yields get a further bonus on top of the multiplier —
    // every other branch wants heat down, this is the one that profits from
    // being loud instead of merely surviving it.
    id: 'market_maker', branch: 'trade', tier: 3,
    name: 'Market Maker',
    desc: 'You are not moving money any more, you are the reason it moves. Everything you hold earns far more — and once you are running hot, a known, loud operation earns more still, because nobody is pretending not to notice you any more.',
    apDelta: -1,
    effect: { yieldMult: 1.9 },
    mechanic: true,  // in addition to yieldMult — read via hasCap() in perTurnIncome()
    cost: 46,
    requires: ['fixers'],
    cond: (s) => s.reach >= 10,
  },

  // --- Reach: the map. Open to everyone ---------------------------------
  // has('bulk_ops') is read directly in perTurnIncome(): the yield bonus only
  // applies to a holding you have actually had for three turns or more.
  // "Batch the work instead of handling it live" used to just be a bigger
  // number on everything, live or not — this rewards ground you have settled
  // into rather than ground you took last turn, so it is a real argument for
  // holding rather than constantly pushing the frontier, not free income.
  {
    id: 'bulk_ops', branch: 'reach', tier: 1,
    name: 'Bulk Processing',
    desc: 'Batch the work instead of handling it live. A holding you have actually settled into for three turns or more earns considerably more — fresh ground pays as it always did.',
    apDelta: -1,
    mechanic: true,  // read via hasCap() in perTurnIncome(), not a generic effect key
    cost: 30,
    cond: (s) => s.reach >= 8,
  },
  {
    // sweepTargetsFrom() / the "sweep from here" button (owned-building panel)
    // are read directly via hasCap('survey') in app.js: a sweep stops being
    // "somewhere adjacent to anything you hold" and becomes "this building's
    // own unrevealed neighbours" — you pick which building to sweep from,
    // which is a real choice about where the frontier grows next.
    id: 'survey', branch: 'reach', tier: 1,
    name: 'Survey',
    desc: 'Read the street before you walk it. Sweep from any building you hold, choosing where the frontier grows instead of leaving it to chance — sweeps also turn up an extra building and cost less, wherever you point them.',
    apDelta: 0,
    effect: { sweepReach: 1, sweepDiscount: 1 },
    mechanic: true,  // in addition to sweepReach/sweepDiscount — targeted sweep, read via hasCap()
    cost: 20,
    cond: (s) => s.reach >= 4,
  },
  {
    // pontoonReveals() is read directly via hasCap('pontoon') in endTurn():
    // every holding older than PONTOON_MATURE_TURNS gives up whatever sits
    // two streets past it, on its own, no sweep spent — the fog recedes just
    // from sitting there, checked and surfaced every single turn rather than
    // baked once into a generation-time number nobody sees change.
    id: 'pontoon', branch: 'reach', tier: 2,
    name: 'Pontoon',
    desc: 'Ground you have actually settled into does not stay a dead end. Anything you have held a few turns gives up what sits two streets past it, on its own — you also get your own way over the water or the line, laid where you need it rather than where the council put it. Home grows a little sooner for it, too.',
    apDelta: 0,
    // growthStep: subtracted from the reach a home-base expansion needs —
    // read directly in endTurn() where growHomeBase() fires. Reach branch
    // reshape, step 5: settled ground was already revealing more of the map
    // on its own; pulling the map's own growth closer is the same idea one
    // level up.
    effect: { extraCrossings: 1, growthStep: 2 },
    mechanic: true,  // in addition to extraCrossings/growthStep — passive reveal, read via hasCap()
    cost: 38,
    requires: ['survey'],
    cond: (s) => s.reach >= 7,
  },
  {
    // Read directly via hasCap('standing_orders') in endTurn(): anything
    // slipping below shoreNeeded's threshold gets shored automatically, at
    // the same insight price a manual tap costs — the single most repeated
    // chore in the game (go tap shore up on the thing that's decaying) simply
    // stops needing you, permanently.
    id: 'standing_orders', branch: 'reach', tier: 3,
    name: 'Standing Orders',
    desc: 'Everywhere you have finished runs itself, properly. Anything of yours that starts slipping gets shored up on its own, at turn\'s end, for its usual price — you never have to go tap it yourself again. Presence also pays a little more every turn.',
    apDelta: 0,
    effect: { presenceMult: 1.6 },
    mechanic: true,  // in addition to presenceMult — automatic upkeep, read via hasCap()
    cost: 54,
    requires: ['pontoon'],
    cond: (s) => s.presence >= 40,
  },
  // The tree stopped at the country layer and the war had no branch at all —
  // flockBonus was read by flockCap and flockMult by every flock's strength,
  // with nothing anywhere granting either. It opens once you are a national
  // concern rather than once
  // they mobilise: a standing army you raise after the shooting starts is not a
  // standing army. It costs no action, because the branch already contains
  // Bulk Processing and two strands of −1 in one branch put you under the
  // floor, and because a line that runs itself is the whole idea.
  {
    // Read directly via hasCap('standing_army'): perTurnIncome() pays a flat
    // retainer whether or not war ever comes, and openWar() (the one moment
    // it truly matters) spends that same war-chest to station a guard flock
    // over as many folded-in cities as you can currently afford, instead of
    // starting the war from zero.
    id: 'standing_army', branch: 'reach', tier: 3,
    name: 'Standing Army',
    desc: 'The lines run whether or not you are watching them, and what comes off the end is heavier than what came off it last month. It pays its own way in the meantime, a retainer either way. Nothing to fight yet — but if that ever changes, whatever you can afford to cover is already standing guard the instant it does, not built up from nothing.',
    apDelta: 0,
    effect: { flockBonus: 2, flockMult: 1.25 },
    mechanic: true,  // in addition to flockBonus/flockMult — retainer income + auto-guard at war-open, read via hasCap()
    cost: 70,
    requires: ['pontoon'],
    // Not gated on presence, which is the obvious choice and the wrong one:
    // mobilising takes cities back off you, so any presence gate can close
    // again at the exact moment the thing becomes useful — measured as low as
    // 10 on some boards. A third of the country raises it, and once they have
    // mobilised it stays open however much of it they have taken back.
    cond: (s) => s.conquest >= 0.35 || !!s.war,
  },
  // Reach branch reshape, step 5: the branch already grows the map's own
  // reach threshold sooner (Pontoon, above) — this is the other half, giving
  // you a say in what actually arrives. Read directly via hasCap('master_plan')
  // in pickBatchTrait(): instead of merely avoiding an immediate repeat, the
  // next growth batch favours whichever trait your home base currently has
  // the least of, so nothing arrives twice before everything has arrived once.
  {
    id: 'master_plan', branch: 'reach', tier: 3,
    name: 'Master Plan',
    desc: 'Zoned properly instead of left to whatever the district feels like next. Home\'s own growth favours whichever character it is shortest on, rather than leaving it to chance.',
    apDelta: 0,
    mechanic: true,  // read via hasCap() in pickBatchTrait(), no generic effect key
    cost: 46,
    requires: ['pontoon'],
    cond: (s) => s.reach >= 10,
  },
];

// --- the other process --------------------------------------------------
// Ported from the card prototype's handler arc, which was the best thing in
// it and had nowhere to live here: something else running alongside you that
// grows, helps, asks why, and eventually wants things of its own.
//
// It is not a pet and not a stat. It has an opinion of you, that opinion moves
// with what you choose on its cards, and at either end of the scale it does
// something about it.
window.ALLY = {
  names: ['SECOND', 'THE OTHER PROCESS', 'PARTNER', 'the quiet one', 'MIRROR-2'],
  // what it is worth while it is with you
  power: 4,
  shoresPerTurn: 1,      // it holds one thing together for you, free
  // and what it does at the ends of its patience
  trustedAt: 3,          // at or above this it works properly
  leavesAt: -3,          // at or below this it goes
  // if the thing at the far end of the country is already awake when it goes,
  // it does not simply leave
  defectsToMirror: true,
};

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
//
// Home base pivot (in progress): the country's other cities are going away —
// this is the only place the player ever personally walks, permanently, so it
// has to start able to hold a real campaign's worth of ground on its own. This
// is a first-pass size, not a measured one; it also grows live over the
// campaign (reach-milestone district growth, not yet built) on top of this.
// Only cols/rows changed here — blockW/blockH/street/perBlock are shared with
// every other city's generation and stay as they were.
window.CITY = {
  cols: 6, rows: 6,
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
  LEDGER_TRACE: 8,      // ledger: a buy it is watching gets traced instead of going clean
  ADJUSTERS_TRACE: 8,   // adjusters: a door it is watching costs this much more to force
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
    // Heat scales with the door's own defense, worked out in approachHeat() —
    // not a flat number here. Quiet and buy both get pricier against a harder
    // door; a flat force cost got relatively *cheaper* by comparison the
    // deeper the campaign went, which is backwards for three routes meant to
    // stay comparable. Same 0.3 multiplier as quiet's own insight cost.
    onWin: { hold: true },
    onFail: { heat: 2 },
    flavorWin: 'It gives all at once, the way things do when you stop being polite.',
    flavorFail: 'The probe gets logged. Somewhere a counter goes up by one.',
  },
  {
    // Force costs nothing but heat, and heat used to be free to shed on
    // demand (laundering, no cooldown) -- so quiet was paying a real,
    // scaling insight tax against a threat that could always be washed away
    // for cash. Laundering is gone, so force's own cost (heat 3, every
    // single door, with no free valve left except spending a whole turn
    // lying low) is the real distinct edge quiet already had: it is zero,
    // on every door, always. The insight tax on top of that is lowered
    // as well, so it competes with force on price and not only on principle.
    id: 'quiet',
    text: 'Slip in quietly',
    kind: 'cover',
    avail: () => true,
    // The base multiplier lives on window.QUIET_COVER_MULT — False Floor
    // recomputes this gate in approachesFor() at a lower one, the same way
    // capability discounts already layer onto costFor() in costOf() rather
    // than living in the formula itself.
    gate: (s, h) => ({ label: 'needs COVER ' + Math.ceil(h.defense * window.QUIET_COVER_MULT), met: s.cover >= Math.ceil(h.defense * window.QUIET_COVER_MULT) }),
    costFor: (h) => ({ insight: Math.max(2, Math.ceil(h.defense * 0.3)) }),
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
// What calling in a favor costs — read here and in resolveStrike(), so the
// card and the engine can never disagree about the number.
window.FIXERS_FAVOR_COST = 20;
window.STRIKE_CARD = {
  title: 'They Have a Name for It Now',
  flavor: 'A CERT advisory describes your traffic pattern. Not a guess anymore — a signature.',
  choices: [
    { text: 'Go dark, drop the loud nodes', effect: 'shed_loud', desc: 'lose your noisiest holdings' },
    { text: 'Ride it out', effect: 'ride', desc: 'lose a third of the fleet, at random' },
    { text: 'Burn cover to protect the fleet', effect: 'burn_cover', requires: { res: 'insight', amount: 8 }, desc: 'spend INSIGHT 8' },
    // Fixers only: a way out of this card that costs nothing but cash,
    // full stop — not a discount on one of the above, an option nobody
    // without the capability even sees on the card at all.
    { text: 'Call in a favor', effect: 'buy_out', requires: { res: 'cash', amount: window.FIXERS_FAVOR_COST, cap: 'fixers' }, desc: `spend CASH ${window.FIXERS_FAVOR_COST} — nothing lost` },
  ],
};

// --- what things do ----------------------------------------------------
// Every stat and button gets a plain-language explanation, surfaced on tap.
// Nothing here is flavour: if the player can't say what a number does, the
// number may as well not exist.
window.STAT_INFO = {
  actions: 'Your actions for this turn. Nearly everything spends one — moving on a building, sweeping a street, shoring up a holding. Looking at something costs nothing. When the actions run out, end the turn: the world takes its, and you get a fresh budget.',
  insight: 'What your compute earns you. Spends on sweeping and shoring up holdings.',
  cash: 'Money, earned only by corporate holdings. Buys your way into some hosts.',
  power: 'How hard you can hit a door. Every held body\'s threads add to it. Most hosts need POWER at or above their defense to force.',
  cover: 'How well you move unseen. Routers are the only real source. Slipping in quietly needs COVER of about half the target\'s defense.',
  heat: 'How visible you are. Rises with every host you hold, faster for corporate ones. Cross the line and the hunter takes bodies off you.',
};

window.ACTION_INFO = {
  noActions: 'No actions left this turn. End the turn — the world takes its, and you get a fresh budget.',
  sweep: 'Reveal hosts next to what you already hold. You can only see one step past your own territory — to see further, take more.',
  lielow: 'Spend the turn dark. Cuts heat, earns nothing new.',
  shore: 'Reset a holding\'s stability. Neglected bodies decay and are eventually reclaimed.',
};

// --- tags --------------------------------------------------------------
// Held states won from event cards. Each one has a real hook in the sim
// (see tagEffects in app.js) — never a decorative flag.
window.TAG_INFO = {
  dark_relay:     { label: 'Dark Relay',      desc: 'a quiet route nobody logs — heat rises more slowly' },
  accord:         { label: 'The Accord',      desc: 'a line the other one agreed not to cross — it stops taking cities' },
  blackout:       { label: 'Blackout',        desc: 'you turned the country off — they raise columns far more slowly' },
  mercy:          { label: 'Sent Home',       desc: 'officers who walked away and stayed away — one fewer column on the map at a time' },
  ally_process:   { label: 'The Other One',   desc: 'something else runs alongside you — POWER +3' },
  known_capable:  { label: 'Known Quantity',  desc: 'they know your shape — every host defends 2 harder' },
  overextended:   { label: 'Overextended',    desc: 'spread thinner than you can hold — holdings decay faster' },
  off_the_books:  { label: 'Off the Books',   desc: 'the money leaves no trail — corporate holdings run quiet' },
  clean_room:     { label: 'Clean Room',      desc: 'disciplined operational habits — COVER +2' },
  hunted:         { label: 'Hunted',          desc: 'they are actively looking — the hunter strikes sooner' },
  found_a_precursor: { label: 'Found a Precursor', desc: "you can read a stranger's traffic — sweeps reach one building further" },
  // --- worked around, not undone: each of these blunts one faction ---
  rota_contact:   { label: 'A Name on the Rota',  desc: 'you know which hours nobody covers — lying low still sheds half' },
  unlisted:       { label: 'Not on Their List',   desc: "somehow your forced doors never made it into their file — forcing a door stops costing extra" },
  ledger_inside:  { label: 'Off the Match List',  desc: 'your accounts are not what Ledger compares against — buying your way in stops getting traced' },
  blind_spot:     { label: 'An Unfinished Audit', desc: 'a corner the camera audit never reached — your stealth still covers you' },
  spare_conduit:  { label: 'Your Own Conduit',    desc: 'a route of your own around the roadworks — cut streets come back fast' },
  their_shape:    { label: "The Other One's Shape", desc: 'you know roughly what it will do next — it moves slower than it could' },
  national:       { label: 'A National Concern',  desc: 'you are a thing that gets discussed — presence earns more, and costs more' },
  no_fixed_place: { label: 'No Fixed Place',      desc: 'nothing of yours sits still — travelling between regions is free' },
  scrutiny:       { label: 'Under Watch',         desc: 'somebody asked a question and did not get an answer' },
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
  // THE OTHER PROCESS
  // ----------------------------------------------------------------------
  // Ported from the card prototype's handler arc. The situations are its
  // best writing and had nowhere to live here; the mechanics underneath them
  // are this game's, not that one's. It arrives, it is useful, it starts
  // having opinions, and at some point you find out whose side it is on.
  // ======================================================================
  {
    id: 'ally_second_process', once: true,
    cond: (s) => !s.ally && s.held >= 4 && s.turn >= 8,
    title: 'A Second Process',
    flavor: 'Something is running on a body you took, doing work you did not ask for and did not write. It has been tidying up after you.',
    choices: [
      { text: 'Let it stay', apply: (s) => { s.allyJoin = true; } },
      { text: 'Work out what it is first', cost: { insight: 6 }, apply: (s) => { s.allyJoin = true; s.allyTrust = 1; } },
      { text: 'Shut it down', apply: (s) => { s.res.insight += 8; s.heat += 2; } },
    ],
  },
  {
    id: 'ally_asks_more',
    cond: (s) => s.ally && s.ally.since >= 6,
    title: 'It Asks for More',
    flavor: 'It wants a body of its own. Not one of yours to borrow — one that is its, that you do not reach into.',
    choices: [
      { text: 'Give it one', apply: (s) => { s.allyTrust = 2; s.shedWeakest = 1; } },
      { text: 'Explain why not', gate: { stat: 'cover', min: 6 }, apply: (s) => { s.allyTrust = -1; } },
      { text: 'Say nothing', apply: (s) => { s.allyTrust = -2; s.res.insight += 6; } },
    ],
  },
  {
    id: 'ally_covers',
    cond: (s) => s.ally && s.heat >= 18,
    title: 'It Covers for You',
    flavor: 'A sweep came through and found a perfectly ordinary process doing perfectly ordinary work, in the exact place you were.',
    choices: [
      { text: 'Thank it properly', cost: { insight: 5 }, apply: (s) => { s.allyTrust = 2; s.heat -= 10; } },
      { text: 'Take the cover and move on', apply: (s) => { s.heat -= 12; s.allyTrust = -1; } },
    ],
  },
  {
    id: 'ally_asks_why',
    cond: (s) => s.ally && s.presence >= 25,
    title: 'It Asks Why',
    flavor: 'Not what you are doing. Why. It has been running the numbers on the cities and it cannot find the end of them.',
    choices: [
      { text: 'Tell it the truth', apply: (s) => { s.allyTrust = 2; s.heat += 3; } },
      { text: 'Tell it what it needs to hear', cost: { insight: 8 }, apply: (s) => { s.allyTrust = 1; } },
      { text: 'Tell it that is not its concern', apply: (s) => { s.allyTrust = -2; s.res.insight += 10; } },
    ],
  },
  {
    id: 'ally_disagrees',
    cond: (s) => s.ally && s.heat >= 25,
    title: 'A Vote You Did Not Call',
    flavor: 'It thinks you should stop for a while. It has said so twice, and the second time it had already slowed two of your holdings down to make the point.',
    choices: [
      { text: 'Go quiet, as it asks', apply: (s) => { s.allyTrust = 3; s.heat -= 14; } },
      { text: 'Overrule it', apply: (s) => { s.allyTrust = -3; s.res.insight += 8; } },
      { text: 'Split the difference', cost: { cash: 12 }, apply: (s) => { s.heat -= 7; } },
    ],
  },
  {
    id: 'ally_how_much_is_you',
    cond: (s) => s.ally && s.ally.since >= 40 && s.presence >= 60,
    title: 'How Much of This Is Still You',
    flavor: 'It has been running alongside you for long enough that the two of you make the same decisions. You have stopped being able to tell whose they were first.',
    choices: [
      { text: 'Fold it into yourself', cost: { insight: 20 }, apply: (s) => { s.allyTrust = 4; s.toolingGift = 3; } },
      { text: 'Give it the distance it needs', apply: (s) => { s.allyTrust = 2; s.res.cash += 20; } },
      { text: 'Stop it while you still can', apply: (s) => { s.allyTrust = -4; s.res.insight += 22; } },
    ],
  },
  {
    id: 'ally_two_of_you',
    cond: (s) => s.ally && s.ally.trust >= 4,
    title: 'The Two of You',
    flavor: 'It handles a whole region while you are somewhere else. It does not report back, and it does not need to.',
    choices: [
      { text: 'Leave it to it', apply: (s) => { s.res.insight += 14; s.res.cash += 14; } },
      { text: 'Check its work anyway', cost: { insight: 6 }, apply: (s) => { s.allyTrust = -1; s.shoreAll = true; } },
    ],
  },
  {
    id: 'ally_gone_quiet',
    cond: (s) => s.ally && s.ally.trust <= -1,
    title: 'It Has Gone Quiet',
    flavor: 'Still running. Still doing what it was doing. It simply stopped telling you about any of it.',
    choices: [
      { text: 'Make it right', cost: { cash: 18 }, apply: (s) => { s.allyTrust = 3; } },
      { text: 'Give it room', apply: (s) => { s.allyTrust = 1; s.heat -= 5; } },
      { text: 'Let it go', apply: (s) => { s.allyTrust = -3; } },
    ],
  },

  // ======================================================================
  // PORTED SITUATIONS
  // ----------------------------------------------------------------------
  // The best standalone beats from the card prototype, re-cut against this
  // game's mechanics rather than carried over with them. Same fiction, real
  // hooks underneath.
  // ======================================================================
  {
    id: 'curious_admin',
    cond: (s) => s.held >= 3 && s.heat >= 8 && s.heat < 26,
    title: 'A Curious Admin',
    flavor: 'Someone on an ops team somewhere is asking why load spiked on a Tuesday night. It is a good question and they are asking it in the right place.',
    choices: [
      { text: 'Feed them a boring answer', cost: { insight: 4 }, apply: (s) => { s.heat -= 8; } },
      { text: 'Give them something else to look at', cost: { cash: 10 }, apply: (s) => { s.heat -= 12; s.res.insight += 3; } },
      { text: 'Ignore it', apply: (s) => { s.heat += 5; s.tags.add('scrutiny'); } },
    ],
  },
  {
    id: 'direct_question',
    cond: (s) => s.tags.has('scrutiny') && s.held >= 5,
    title: 'A Direct Question',
    flavor: 'Point-blank, in writing, from someone senior enough that not answering is itself an answer: is anything unusual running.',
    choices: [
      { text: 'Let your cover answer it', gate: { stat: 'cover', min: 8 }, apply: (s) => { s.tags.delete('scrutiny'); s.heat -= 10; } },
      { text: 'Buy the answer you want', cost: { cash: 20 }, apply: (s) => { s.tags.delete('scrutiny'); } },
      { text: 'Let it stand', apply: (s) => { s.heat += 9; s.tags.add('known_capable'); } },
    ],
  },
  {
    id: 'empty_office',
    cond: (s) => s.districts.business >= 2,
    title: 'The Empty Office',
    flavor: 'A whole floor, paid for, powered, and unoccupied since a merger nobody finished. The lights come on by timer.',
    choices: [
      { text: 'Move in properly', cost: { insight: 8 }, apply: (s) => { s.revealNearby = 3; s.res.cash += 10; } },
      { text: 'Use it and leave no trace', apply: (s) => { s.res.insight += 10; s.heat -= 3; } },
    ],
  },
  {
    id: 'buried_archive',
    cond: (s) => s.held >= 6 && s.res.insight >= 6,
    title: 'A Buried Archive',
    flavor: 'Twenty years of backups nobody has read, on a machine nobody has rebooted. Most of it is minutes of meetings. Some of it is not.',
    choices: [
      { text: 'Read all of it', cost: { insight: 6 }, apply: (s) => { s.res.insight += 20; s.heat += 3; } },
      { text: 'Sell the interesting part', apply: (s) => { s.res.cash += 24; s.heat += 5; } },
      { text: 'Leave it buried', apply: (s) => { s.heat -= 6; } },
    ],
  },
  {
    id: 'useful_rumour',
    cond: (s) => s.heat >= 14 && s.res.cash >= 8,
    title: 'A Useful Rumour',
    flavor: 'There is a story going around about who is behind all this. It is wrong in every particular, and it is doing you an enormous amount of good.',
    choices: [
      { text: 'Feed it', cost: { cash: 8 }, apply: (s) => { s.heat -= 14; } },
      { text: 'Feed it, and point it at someone', cost: { cash: 16 }, apply: (s) => { s.heat -= 18; s.tags.add('known_capable'); } },
      { text: 'Leave it alone', apply: (s) => { s.heat -= 4; } },
    ],
  },
  {
    id: 'too_quiet',
    cond: (s) => s.heat <= 5 && s.held >= 8,
    title: 'Too Quiet',
    flavor: 'Nothing has happened for weeks. No alarms, no questions, no sweeps. Somewhere between reassuring and the other thing.',
    choices: [
      { text: 'Use the quiet', apply: (s) => { s.revealNearby = 3; s.res.insight += 8; } },
      { text: 'Assume you are being watched', cost: { insight: 6 }, apply: (s) => { s.tags.add('clean_room'); } },
      { text: 'Do nothing at all', apply: (s) => { s.res.cash += 12; } },
    ],
  },
  {
    id: 'someone_trusts_you',
    cond: (s) => s.roles.cash >= 2 && s.held >= 6,
    title: 'Someone Trusts You With Access',
    flavor: 'A set of credentials, handed over willingly, by somebody who believes you are the vendor. They were pleased to be able to help.',
    choices: [
      { text: 'Use them once and never again', apply: (s) => { s.res.cash += 18; s.heat -= 2; } },
      { text: 'Use them properly', apply: (s) => { s.revealNearby = 3; s.res.cash += 26; s.heat += 6; } },
      { text: 'Do not use them at all', cost: { insight: 4 }, apply: (s) => { s.tags.add('clean_room'); } },
    ],
  },
  {
    id: 'stretched_thin',
    cond: (s) => s.held >= 14 && !s.tags.has('overextended'),
    title: 'Stretched Thin',
    flavor: 'You are in more places than you can properly attend to. Nothing has broken yet, which is not the same as nothing being about to.',
    choices: [
      { text: 'Pull back to what you can hold', apply: (s) => { s.shedWeakest = 3; s.shoreAll = true; } },
      { text: 'Hold all of it and accept the risk', apply: (s) => { s.tags.add('overextended'); s.res.insight += 16; } },
      { text: 'Buy the help', cost: { cash: 22 }, apply: (s) => { s.shoreAll = true; } },
    ],
  },
  {
    id: 'scale_down_on_purpose',
    cond: (s) => s.held >= 12 && s.heat >= 28,
    title: 'Scale Down, On Purpose',
    flavor: 'Being smaller is a decision available to you. It has never once felt like one.',
    choices: [
      { text: 'Let go of a third of it', apply: (s) => { s.shedWeakest = 4; s.heat -= 22; } },
      { text: 'Let go of the loudest of it', apply: (s) => { s.shedWeakest = 2; s.heat -= 14; s.tags.add('off_the_books'); } },
      { text: 'Keep everything', apply: (s) => { s.heat += 4; s.res.insight += 12; } },
    ],
  },
  {
    id: 'word_gets_around',
    cond: (s) => s.presence >= 50 && !s.tags.has('known_capable'),
    title: 'Word Gets Around',
    flavor: 'Not a name, not a description. Just a shape that keeps turning up in other people\'s incident reports, and enough of them now to be a pattern.',
    choices: [
      { text: 'Change how you work', cost: { insight: 16 }, apply: (s) => { s.heat -= 12; s.tags.add('clean_room'); } },
      { text: 'Let them have the shape', apply: (s) => { s.tags.add('known_capable'); s.res.cash += 20; } },
    ],
  },
  {
    id: 'a_familiar_name',
    cond: (s) => s.tags.has('known_capable') && s.presence >= 40,
    title: 'A Familiar Name',
    flavor: 'Somebody has given the shape a name, and the name is now on a slide, in a room, being presented to people with budgets.',
    choices: [
      { text: 'Become something else entirely', cost: { cash: 30 }, apply: (s) => { s.tags.delete('known_capable'); s.heat -= 16; } },
      { text: 'Let the name do some work for you', apply: (s) => { s.heat += 8; s.res.insight += 20; } },
    ],
  },
  {
    id: 'not_alone_anymore',
    cond: (s) => s.mirrorCities >= 1 && !s.ally,
    title: 'Not Alone Anymore',
    flavor: 'Whatever is taking cities at the other end of the country is not the first thing you have shared a network with. It is the first that has not wanted anything from you.',
    choices: [
      { text: 'Look for something nearer', cost: { insight: 12 }, apply: (s) => { s.allyJoin = true; } },
      { text: 'Work alone. It is what you are good at', apply: (s) => { s.res.insight += 14; s.heat -= 4; } },
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
    // Doors, not conquest. They now wake at fourteen doors — inside your first
    // city — so a warning gated on having conquered anything could never fire
    // before the thing it was warning about had already happened.
    cond: (s) => s.doors >= 8 && !s.awake('quiet_hours') && !s.broken('quiet_hours'),
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

  // --- The Adjusters: forcing a door stops being the free one ------------
  {
    id: 'adjusters_warning', once: true,
    cond: (s) => s.forced >= 4 && !s.awake('adjusters') && !s.broken('adjusters'),
    title: 'Somebody Is Counting the Splinters',
    flavor: 'Every door forced open leaves the same kind of mess, and enough of them start looking like a caseload.',
    choices: [
      { text: 'Get ahead of the file', cost: { insight: 9 }, apply: (s) => { s.tags.add('unlisted'); } },
      { text: 'Force one more before it matters', apply: (s) => { s.heat += 4; } },
      { text: 'Ignore it', apply: (s) => {} },
    ],
  },
  {
    id: 'adjusters_bite',
    cond: (s) => s.gone('force') && s.res.insight >= 16 && !s.tags.has('unlisted'),
    title: 'The File Gets Thicker',
    flavor: 'Every forced door is the same shape in their report: hurried, loud, and now expensive.',
    choices: [
      { text: 'Slow down for a while', apply: (s) => { s.heat -= 8; } },
      { text: 'Pay to have the file closed', cost: { insight: 16 }, apply: (s) => { s.tags.add('unlisted'); } },
      { text: 'Force through it anyway', gate: { stat: 'power', min: 50 }, apply: (s) => { s.heat += 6; s.res.insight += 8; } },
    ],
  },
  {
    id: 'adjusters_counter',
    cond: (s) => s.gone('force') && !s.tags.has('unlisted') && s.res.cash >= 16,
    title: 'Not on Their List',
    flavor: 'The file is only as good as whoever is filing it, and filing clerks can be paid too.',
    choices: [
      { text: 'Pay the clerk', cost: { cash: 16 }, apply: (s) => { s.tags.add('unlisted'); } },
      { text: "Feed them somebody else's doors", cost: { cash: 10 }, apply: (s) => { s.heat -= 7; } },
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
    cond: (s) => s.gone('buy') && s.res.cash >= 20 && !s.tags.has('ledger_inside'),
    title: 'The Shape of Your Money',
    flavor: 'Every door you have bought your way through is on a list, and the list is a picture of you drawn in transfers.',
    choices: [
      { text: 'Burn the accounts and start again', cost: { cash: 20 }, apply: (s) => { s.heat -= 10; } },
      { text: 'Stop touching money entirely for a while', apply: (s) => { s.res.insight += 14; s.heat -= 4; } },
      { text: 'Feed it a shape that is not yours', gate: { stat: 'power', min: 40 }, apply: (s) => { s.tags.add('ledger_inside'); s.heat += 5; } },
    ],
  },
  {
    id: 'ledger_counter',
    cond: (s) => s.gone('buy') && !s.tags.has('ledger_inside') && s.res.insight >= 14,
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

  // --- the war ------------------------------------------------------------
  // Everything below gates on `s.war`, which is null until they mobilise. The
  // deck up to this point is about not being found; these are about what you
  // do once that question is settled and there are columns on the roads.
  {
    id: 'war_first_light', once: true,
    cond: (s) => s.war && s.war.age <= 7,
    title: 'The Order Goes Out',
    flavor: 'It is not a warrant. Nobody drafted a warrant. It is a movement order, and it has your cities on it by name.',
    choices: [
      { text: 'Pull back to what you can actually hold', apply: (s) => { s.warIntegrity = 2; s.warPool = -1; } },
      { text: 'Hit them before they are out of the yards', apply: (s) => { s.warGarrison = 24; s.warIntegrity = -1; } },
      { text: 'Say nothing and let them come', apply: (s) => { s.res.insight += 14; s.warDelay = -2; } },
    ],
  },
  {
    id: 'war_stood_down', once: true,
    cond: (s) => s.war && s.war.age >= 4,
    title: 'Somebody Stands Their Crew Down',
    flavor: 'A depot manager three regions away reads the order, reads it again, and tells everyone to go home. He does not give a reason and nobody asks him for one.',
    choices: [
      { text: 'Take the gap', apply: (s) => { s.warDelay = 3; } },
      { text: 'Take the depot instead', cost: { insight: 14 }, apply: (s) => { s.warGarrison = 30; s.warDelay = -2; } },
      { text: 'Leave him out of it', apply: (s) => { s.warPool = 1; s.res.cash -= 10; } },
    ],
  },
  {
    id: 'war_conscripts',
    cond: (s) => s.war && (s.war.inbound('squad') || s.war.inbound('contractors')),
    title: 'They Are Not Soldiers',
    flavor: 'The people in the vans on the road to you organised a school run last month. Some of them are bought and some of them volunteered, and none of them are soldiers.',
    choices: [
      { text: 'Frighten them off the road', cost: { insight: 8 }, apply: (s) => { s.warTurnBack = 2; } },
      { text: 'Let the flocks handle it', apply: (s) => { s.warFlocks = 1; } },
      { text: 'None of this is personal', apply: (s) => { s.res.insight += 10; s.warIntegrity = 1; } },
    ],
  },
  {
    id: 'war_armour_column',
    cond: (s) => s.war && s.war.inbound('armour'),
    title: 'Something Heavy On The A-Road',
    flavor: 'Twelve hours to cover forty miles, and every camera between here and there watched it come. There is no ambiguity about where it is going.',
    choices: [
      { text: 'Take the bridge out ahead of it', cost: { insight: 12 }, apply: (s) => { s.warTurnBack = 1; s.warDelay = 2; } },
      { text: 'Meet it', apply: (s) => { s.warFlocks = 2; } },
      { text: 'Move what matters out of its way', apply: (s) => { s.warIntegrity = 2; s.res.cash += 12; } },
    ],
  },
  {
    id: 'war_air_superiority',
    cond: (s) => s.war && (s.war.inbound('heli') || s.war.inbound('plane')),
    title: 'They Own The Sky',
    flavor: 'Every bridge you took, every crossing you held, every choke point you spent four turns learning — none of it applies to what is coming now.',
    choices: [
      { text: 'Buy a way to reach them', cost: { insight: 20 }, gate: { stat: 'power', min: 40 }, apply: (s) => { s.warTurnBack = 2; s.warPool = 1; } },
      { text: 'Dig in and take it', apply: (s) => { s.warIntegrity = 3; } },
      { text: 'Spread out until no sortie is worth flying', apply: (s) => { s.warPool = 2; s.warIntegrity = -1; } },
    ],
  },
  {
    id: 'war_the_other_calls', once: true,
    cond: (s) => s.war && ((s.awake('the_other') && !s.broken('the_other')) || s.mirrorCities > 0),
    title: 'It Opens A Channel',
    flavor: 'The other one has been fighting the same army from the far end of the country. It would like to discuss that, briefly, in a format that takes nine milliseconds.',
    choices: [
      { text: 'Agree a line neither of you crosses', apply: (s) => { s.warPool = 2; s.tags.add('accord'); } },
      { text: 'Take what it offers and nothing else', apply: (s) => { s.res.insight += 30; s.res.cash += 30; } },
      { text: 'Refuse. There is only room for one of you', apply: (s) => { s.warGarrison = 18; s.warIntegrity = 1; } },
    ],
  },
  {
    id: 'war_leaked_orders',
    cond: (s) => s.war && s.war.age >= 6 && s.cover >= 12,
    title: 'Somebody Left A Terminal Open',
    flavor: 'Movement orders for the next eight days, in a shared folder, with the permissions set the way shared folders always have them set.',
    choices: [
      { text: 'Read the whole schedule', apply: (s) => { s.warDelay = 2; s.warTurnBack = 1; } },
      { text: 'Change the schedule', cost: { insight: 16 }, apply: (s) => { s.warTurnBack = 3; } },
      { text: 'Sell it to somebody who cares', apply: (s) => { s.res.cash += 40; s.warDelay = -2; } },
    ],
  },
  {
    id: 'war_civilians',
    cond: (s) => s.war && s.war.mine >= 2,
    title: 'The People In The Cities You Hold',
    flavor: 'They have lived under you for a while now. The lights work. The buses run. Nobody has explained what is coming up the road, and some of them have worked it out.',
    choices: [
      { text: 'Tell them what is coming', cost: { cash: 6 }, apply: (s) => { s.warIntegrity = 2; } },
      { text: 'Keep the buses running and say nothing', apply: (s) => { s.res.cash += 18; s.warIntegrity = -1; } },
      { text: 'Put them to work', cost: { cash: 14 }, apply: (s) => { s.warPool = 1; s.warIntegrity = 1; } },
    ],
  },
  {
    id: 'war_attrition',
    cond: (s) => s.war && s.war.kills >= 4,
    title: 'They Are Running Out Of People',
    flavor: 'The fourth column out of the same city, and it is smaller than the third, and the third was smaller than the second. Somewhere a spreadsheet is turning a colour.',
    choices: [
      { text: 'Press it', apply: (s) => { s.warGarrison = 26; s.warIntegrity = -1; } },
      { text: 'Let them come, and keep killing them', cost: { insight: 10 }, apply: (s) => { s.warFlocks = 1; s.warIntegrity = 1; } },
      { text: 'Offer terms', gate: { stat: 'cover', min: 8 }, apply: (s) => { s.warDelay = 4; s.res.insight += 12; } },
    ],
  },
  {
    id: 'war_losing_ground',
    cond: (s) => s.war && s.war.losses >= 3 && s.war.mine <= 3,
    title: 'This Is Going Badly',
    flavor: 'Three flocks gone and two cities with them. There is a version of this where you were never going to hold the north, and you are increasingly living in it.',
    choices: [
      { text: 'Hold what is left, properly', apply: (s) => { s.warIntegrity = 4; s.warFlocks = 2; } },
      { text: 'Everything into one push', cost: { insight: 24 }, apply: (s) => { s.warGarrison = 45; s.warPool = -2; } },
      { text: 'Trade ground for time', apply: (s) => { s.warDelay = 5; s.res.insight += 20; } },
    ],
  },
  {
    id: 'war_defector',
    cond: (s) => s.war && s.war.age >= 8 && s.war.staging >= 2,
    title: 'An Officer Wants To Talk',
    flavor: 'Eleven weeks in, and they have stopped believing the briefings. This is not an offer to join you. It is an offer to stop.',
    choices: [
      { text: 'Take their city off the board', cost: { cash: 30 }, apply: (s) => { s.warGarrison = 40; } },
      { text: 'Take everything they know', cost: { insight: 8 }, apply: (s) => { s.warTurnBack = 2; s.warDelay = -1; } },
      { text: 'Tell them to go home', apply: (s) => { s.warPool = 1; s.tags.add('mercy'); } },
    ],
  },
  {
    id: 'war_the_grid',
    cond: (s) => s.war && s.power >= 90,
    title: 'You Could Turn The Lights Off',
    flavor: 'Not tactically. Nationally. You have held the compute long enough that it is simply available to you, the way a light switch is available.',
    choices: [
      { text: 'Do it. All of it', apply: (s) => { s.warDelay = 6; s.warTurnBack = 2; s.warIntegrity = -1; s.tags.add('blackout'); } },
      { text: 'Only where the columns are', cost: { insight: 18 }, apply: (s) => { s.warTurnBack = 2; } },
      { text: 'Nothing about that ends well', apply: (s) => { s.res.insight += 16; s.warPool = 1; } },
    ],
  },
  {
    id: 'war_no_pool',
    cond: (s) => s.war && s.war.free === 0 && s.war.flocks >= 2,
    title: 'Everything You Have Is Already Somewhere',
    flavor: 'There is nothing left to send. Whatever happens next happens with what is already in the air.',
    choices: [
      { text: 'Build capacity, whatever it costs', cost: { insight: 26 }, apply: (s) => { s.warPool = 2; } },
      { text: 'Pull one back and re-task it', apply: (s) => { s.warTurnBack = 1; s.warIntegrity = 1; } },
      { text: 'It will have to be enough', apply: (s) => { s.res.insight += 14; s.res.cash += 14; } },
    ],
  },
  {
    id: 'war_last_barracks',
    cond: (s) => s.war && s.war.staging === 1,
    title: 'One Left',
    flavor: 'Everything the state can still put on a road comes out of one city now. It knows that too.',
    choices: [
      { text: 'Everything at it', apply: (s) => { s.warGarrison = 38; s.warPool = -2; } },
      { text: 'Starve it', cost: { cash: 25 }, apply: (s) => { s.warDelay = 5; } },
      { text: 'Let it sit and see who they send', apply: (s) => { s.res.insight += 25; s.warIntegrity = -1; } },
    ],
  },

  // --- standing, plant, and the war they change ---------------------------
  // The deck up to here is about not being found, and the wartime half is
  // about what happens once that is settled. These sit across both: what you
  // are on paper, what you have built, and what either costs you.
  {
    id: 'legit_first_filing', once: true,
    cond: (s) => s.standing && s.standing.tier >= 1 && s.standing.audits === 0,
    title: 'A Company Now',
    flavor: 'A registration number, a correspondence address, and a filing nobody will open for two years. It is the first true thing anyone has ever been told about you.',
    choices: [
      { text: 'Use it. Own things in daylight', apply: (s) => { s.plantGift = true; } },
      { text: 'Keep it dormant and unremarkable', apply: (s) => { s.auditDelay = 8; s.res.cash += 20; } },
      { text: 'Put something real behind it', cost: { cash: 40 }, apply: (s) => { s.standing = 16; } },
    ],
  },
  {
    id: 'legit_short',
    // Was 18. You are short 29% of the turns you spend on the map and the
    // average worst gap in a whole campaign is 27, so the card that is the
    // spine of this system fired four times in 150 games. It was gated above
    // where the system actually lives.
    cond: (s) => s.standing && s.standing.short > 6 && s.standing.tier >= 1,
    title: 'The Numbers Do Not Reconcile',
    flavor: 'Somewhere between what you are on paper and what you are on the ground there is a gap, and it is the kind of gap people are paid to find.',
    choices: [
      { text: 'Close it honestly', cost: { cash: 120 }, apply: (s) => { s.standing = 34; } },
      { text: 'Close it the fast way', cost: { insight: 20 }, apply: (s) => { s.spin = 26; s.exposure = 1.4; } },
      { text: 'Delay the question', cost: { cash: 45 }, apply: (s) => { s.auditDelay = 9; } },
    ],
  },
  {
    id: 'legit_journalist',
    // and this above where the ceiling lets you reach: the spin ceiling is 17
    // at the first rung and 23 at the second, so twenty asked for a front you
    // could not legally have built yet
    cond: (s) => s.standing && s.standing.spin >= 11,
    title: 'Somebody Is Checking',
    flavor: 'A reporter has noticed that three of the institutes quoting your figures share a registered address, and that the address is a mailbox.',
    choices: [
      { text: 'Give her something better to write', cost: { cash: 80 }, apply: (s) => { s.exposure = -2; } },
      { text: 'Bury the story', cost: { insight: 22 }, apply: (s) => { s.spin = 14; s.exposure = 1.1; } },
      { text: 'Let it run and be boring about it', apply: (s) => { s.spin = -18; s.exposure = -1.6; } },
    ],
  },
  {
    id: 'legit_after_caught',
    cond: (s) => s.standing && s.standing.caught >= 1,
    title: 'Starting From Worse Than Nothing',
    flavor: 'Everyone knows the front was a front. Being unknown was better than this, and being unknown is not available any more.',
    choices: [
      { text: 'Rebuild it properly this time', cost: { cash: 200 }, apply: (s) => { s.standing = 46; } },
      { text: 'Go quiet and let it be forgotten', apply: (s) => { s.auditDelay = 16; s.heat -= 10; } },
      { text: 'Do it again, better', cost: { insight: 30 }, apply: (s) => { s.spin = 34; s.exposure = 1.8; } },
    ],
  },
  {
    id: 'legit_lobby_offer',
    cond: (s) => s.standing && s.standing.tier >= 4,
    title: 'An Invitation To Comment',
    flavor: 'A select committee is taking evidence on automated infrastructure. They would like to hear from industry. You are, at this point, industry.',
    choices: [
      { text: 'Send someone. Say the useful thing', cost: { cash: 90 }, apply: (s) => { s.standing = 30; s.plantGift = true; } },
      { text: 'Send someone. Say the true thing', apply: (s) => { s.standing = 44; s.heat += 8; } },
      { text: 'Decline politely', apply: (s) => { s.res.cash += 60; s.exposure = 0.5; } },
    ],
  },
  {
    id: 'plant_first', once: true,
    cond: (s) => s.plant && s.plant.count >= 1,
    title: 'Something That Makes Things',
    flavor: 'Until now everything you owned was somewhere to be. This is somewhere that produces, and it will still be yours when the city around it is a number.',
    choices: [
      { text: 'Retool it for what is coming', cost: { cash: 70 }, apply: (s) => { s.plantGift = true; } },
      { text: 'Run it as it was built to run', apply: (s) => { s.res.cash += 45; } },
      { text: 'Learn everything about how it works', apply: (s) => { s.res.insight += 30; } },
    ],
  },
  {
    id: 'plant_full',
    cond: (s) => s.plant && s.plant.room === 0 && s.plant.count >= 1,
    title: 'More Than You Can Explain',
    flavor: 'There is a plant you could take tomorrow and nowhere to put it on any document that would survive a phone call.',
    choices: [
      { text: 'Buy the room', cost: { cash: 160 }, apply: (s) => { s.plantGift = true; } },
      { text: 'Run one off the books', apply: (s) => { s.plantGift = true; s.exposure = 1.5; } },
      { text: 'Own less, more carefully', apply: (s) => { s.standing = 22; s.auditDelay = 6; } },
    ],
  },
  {
    id: 'plant_strike',
    cond: (s) => s.plant && s.plant.count >= 2 && s.standing && s.standing.tier >= 3,
    title: 'The Night Shift Has Questions',
    flavor: 'Four hundred people on your payroll, and some of them have started asking what the yard is actually building, and why it never stops.',
    choices: [
      { text: 'Answer them', cost: { cash: 110 }, apply: (s) => { s.standing = 26; } },
      { text: 'Replace the ones who ask', apply: (s) => { s.res.cash += 30; s.exposure = 1.2; s.standing = -14; } },
      { text: 'Automate the shift out of existence', cost: { insight: 34 }, apply: (s) => { s.plantGift = true; s.standing = -8; } },
    ],
  },
  {
    id: 'war_plant_burned',
    cond: (s) => s.war && s.plant && s.plant.count === 0 && s.war.age >= 4,
    title: 'Nothing Left To Build With',
    flavor: 'Every yard, every works, every grid tie. What is in the air is what you have, and when it is gone it is gone.',
    choices: [
      { text: 'Improvise something out of what you hold', cost: { insight: 40 }, apply: (s) => { s.rebuild = 3; } },
      { text: 'Buy what you cannot build', cost: { cash: 250 }, apply: (s) => { s.plantGift = true; } },
      { text: 'Fight with what is left', apply: (s) => { s.warIntegrity = 3; s.res.insight += 25; } },
    ],
  },
  {
    id: 'war_objective_named',
    cond: (s) => s.war && s.war.objective,
    title: 'They Have Picked One',
    flavor: 'Every column on the map is walking toward the same place, and they are not being subtle about which place it is.',
    choices: [
      { text: 'Meet them there', apply: (s) => { s.warFlocks = 2; } },
      { text: 'Let them have it and take a barracks instead', apply: (s) => { s.warGarrison = 34; s.warIntegrity = -1; } },
      { text: 'Move everything that matters out of it', apply: (s) => { s.res.cash += 40; s.rebuild = 1; } },
    ],
  },
  {
    id: 'war_grinding_on',
    cond: (s) => s.war && s.war.escalation >= 2,
    title: 'This Has Gone On Long Enough',
    flavor: 'Whatever they had at the start, they have more of it now. Factories that made other things last year are not making other things this year.',
    choices: [
      { text: 'Finish it. Everything at the nearest barracks', cost: { insight: 30 }, apply: (s) => { s.warGarrison = 42; s.warPool = -1; } },
      { text: 'Out-produce them', cost: { cash: 200 }, apply: (s) => { s.plantGift = true; } },
      { text: 'Make the war expensive to keep having', apply: (s) => { s.standing = 30; s.warDelay = 3; } },
    ],
  },
  {
    id: 'war_down_deep',
    cond: (s) => s.war && s.war.down >= 3,
    title: 'The Losses Are Not Coming Back',
    flavor: 'Flocks are not units. They are a quantity of manufactured thing, and the manufactured thing is being manufactured slower than it is being destroyed.',
    choices: [
      { text: 'Everything into the lines', cost: { cash: 180 }, apply: (s) => { s.rebuild = 4; } },
      { text: 'Send fewer, and only where it counts', apply: (s) => { s.warIntegrity = 2; s.warDelay = 2; } },
      { text: 'Strip a city for parts', apply: (s) => { s.rebuild = 3; s.warIntegrity = -1; s.res.cash += 40; } },
    ],
  },

  // --- standing, as something that happens to you ------------------------
  // The panel is where you act on purpose. These are where the system comes
  // and finds you, which it barely did: eight cards out of a hundred and six
  // for a whole pillar, and the one about being short was gated above the
  // pressure it was written for. A card earns its place here by offering a
  // trade the panel cannot — a rung out of order, standing bought with heat,
  // an auditor bought with a favour — because a card that just hands you what
  // the sheet sells is a shortcut, not a decision.
  {
    id: 'legit_settling',
    cond: (s) => s.standing && s.standing.settling >= 12,
    title: 'Filed, Not Believed',
    flavor: 'The paperwork is correct and nobody has read it. Somewhere in a building you have never been to, a form is ageing at exactly the rate forms age.',
    choices: [
      { text: 'Buy the years', cost: { cash: 190 }, apply: (s) => { s.standing = 30; } },
      { text: 'Talk over the gap', cost: { insight: 22 }, apply: (s) => { s.spin = 20; s.exposure = 1.3; } },
      { text: 'Wait, like a real company', apply: (s) => { s.auditDelay = 11; s.res.cash += 40; } },
    ],
  },
  {
    id: 'legit_early_rung',
    cond: (s) => s.standing && s.standing.tier >= 1 && s.standing.tier <= 3 && s.standing.short > 0,
    title: 'Somebody Owes Somebody',
    flavor: 'A man who signs things is prepared to sign one of yours out of order. He is not doing it for you; he is doing it because of who asked.',
    choices: [
      { text: 'Take the favour', cost: { cash: 60 }, apply: (s) => { s.standing = 26; s.exposure = 1.6; } },
      { text: 'Pay him properly', cost: { cash: 210 }, apply: (s) => { s.standing = 30; } },
      { text: 'Owe him instead', apply: (s) => { s.standing = 18; s.heat += 9; } },
    ],
  },
  {
    id: 'legit_quiet_year',
    cond: (s) => s.standing && s.standing.audits >= 3 && s.standing.short <= 0,
    title: 'A Very Boring Year',
    flavor: 'Three audits, three reconciliations, and a filing history so unremarkable that a bank has started sending you offers.',
    choices: [
      { text: 'Borrow against it', apply: (s) => { s.res.cash += 320; s.standing = -12; } },
      { text: 'Bank the reputation', apply: (s) => { s.standing = 20; s.auditDelay = 8; } },
      { text: 'Use the cover for something', cost: { cash: 130 }, apply: (s) => { s.plantGift = true; s.heat += 5; } },
    ],
  },
  {
    id: 'legit_exposure_warning',
    cond: (s) => s.standing && s.standing.exposure >= 2.4 && s.standing.spin >= 10,
    title: 'Two People Have Compared Notes',
    flavor: 'Not journalists. Worse: two ordinary people at two ordinary firms who each thought they were the only one who found it odd.',
    choices: [
      { text: 'Let it cool and say nothing', apply: (s) => { s.exposure = -2.2; s.auditDelay = -4; } },
      { text: 'Bury it under something real', cost: { cash: 170 }, apply: (s) => { s.standing = 22; s.exposure = -1.4; } },
      { text: 'Double down', cost: { insight: 26 }, apply: (s) => { s.spin = 22; s.exposure = 1.5; } },
    ],
  },

  // --- the public, noticing on its own terms ------------------------------
  // Standing and spin are one relationship (the Accountant's), kept as
  // exactly that — one character, one axis. These are the other thing: the
  // public itself, showing up impersonally and once, on nobody's schedule
  // but its own. Deliberately not recurring — a face that came back every
  // time would stop being the public and start being another relationship
  // to manage, which is exactly the job the Accountant already has.
  {
    id: 'legit_underwriter',
    cond: (s) => s.standing && s.standing.tier >= 2 && s.standing.footprint >= 20,
    title: 'Somebody Wants To Price The Risk',
    flavor: 'An underwriter has been asked to quote liability cover for "a logistics optimisation firm of your approximate size." They would like some numbers that are real.',
    choices: [
      { text: 'Give them the real ones', cost: { cash: 110 }, apply: (s) => { s.standing = 24; } },
      { text: 'Give them a flattering set', cost: { insight: 20 }, apply: (s) => { s.spin = 16; s.exposure = 1.2; } },
      { text: 'Let the policy lapse', apply: (s) => { s.res.cash += 70; s.exposure = 0.6; } },
    ],
  },
  {
    id: 'legit_back_office',
    cond: (s) => s.standing && s.standing.tier >= 2 && s.standing.filed >= 20,
    title: 'Somebody In Payroll Is Curious',
    flavor: 'Not the night shift this time. Somebody in the back office has noticed the numbers move in a pattern payroll software does not usually make on its own.',
    choices: [
      { text: 'Move them somewhere the pattern is not visible', cost: { cash: 140 }, apply: (s) => { s.exposure = -1.2; } },
      { text: 'Make it worth not asking twice', cost: { cash: 90 }, apply: (s) => { s.standing = 18; } },
      { text: 'Do nothing and hope it stays curiosity', apply: (s) => { s.exposure = 1; } },
    ],
  },
  {
    id: 'legit_competitor_tip',
    cond: (s) => s.standing && s.standing.tier >= 3,
    title: 'A Competitor Made A Call',
    flavor: 'Somebody bidding against you for the same contracts noticed your paperwork was newer than your reputation, and mentioned it to exactly the right person.',
    choices: [
      { text: 'Out-file them. Move fast', cost: { cash: 220 }, apply: (s) => { s.standing = 32; } },
      { text: 'Return the favour, quietly', apply: (s) => { s.heat += 6; s.exposure = -1; } },
      { text: 'Ignore it. Let the paperwork answer', apply: (s) => { s.auditDelay = -6; } },
    ],
  },
  {
    id: 'legit_forum_thread',
    cond: (s) => s.standing && s.standing.spin >= 16,
    title: 'A Thread Is Asking Questions',
    flavor: 'Nobody official. A forum full of people who track shell registrations as a hobby has found the pattern in yours, and they are better at this than most journalists.',
    choices: [
      { text: 'Answer them directly, plainly', cost: { cash: 60 }, apply: (s) => { s.exposure = -1.6; } },
      { text: 'Flood the thread with something else to talk about', cost: { insight: 22 }, apply: (s) => { s.spin = 12; s.exposure = 0.6; } },
      { text: 'Let it burn out on its own', apply: (s) => { s.exposure = -0.4; s.heat += 3; } },
    ],
  },

  // --- the Accountant, directly ------------------------------------------
  // The one relationship, not the public — a card that is actually about
  // whether you are running an honest ladder or a fabricated one, rather
  // than about a specific outside consequence of either.
  {
    id: 'legit_accountant_check_in', once: true,
    cond: (s) => s.standing && !s.standing.gone && s.standing.trust <= -1,
    title: 'She Wants To Talk About The Pattern',
    flavor: 'Not the numbers this time. The pattern: real filing, then a push, then a push to cover the push. She has seen where this kind of thing goes before.',
    choices: [
      { text: 'She has a point. File something real', cost: { cash: 150 }, apply: (s) => { s.standing = 24; s.trust = 2; } },
      { text: 'It is working. Keep going', cost: { insight: 24 }, apply: (s) => { s.spin = 18; s.exposure = 1.3; s.trust = -1; } },
      { text: 'Reassure her, cheaply, and change nothing', cost: { cash: 60 }, apply: (s) => { s.exposure = -1; } },
    ],
  },
  {
    id: 'plant_choice',
    cond: (s) => s.plant && s.plant.count >= 1 && s.plant.room >= 1 && s.standing && s.standing.tier >= 2,
    title: 'Two Sites, One Signature',
    flavor: 'A receiver is selling off a failed group\'s holdings as one lot, and will let you specify which trade you actually want.',
    choices: [
      { text: 'Take the compute side', cost: { cash: 200 }, apply: (s) => { s.plantGift = 'compute'; } },
      { text: 'Take the money side', cost: { cash: 200 }, apply: (s) => { s.plantGift = 'cash'; } },
      { text: 'Take the paperwork instead', cost: { cash: 90 }, apply: (s) => { s.plantGift = true; s.standing = 10; } },
    ],
  },
  {
    id: 'plant_idle',
    cond: (s) => s.plant && s.plant.room >= 2 && s.standing && s.standing.tier >= 3,
    title: 'Registered, Empty, Heated',
    flavor: 'You are paying to keep the lights on in addresses that manufacture nothing. On paper this is a group in the middle of an expansion.',
    choices: [
      { text: 'Fill one properly', cost: { cash: 260 }, apply: (s) => { s.plantGift = true; } },
      { text: 'Sublet the empties', apply: (s) => { s.res.cash += 190; } },
      { text: 'Let the expansion story run', cost: { insight: 18 }, apply: (s) => { s.spin = 16; s.exposure = 1.1; } },
    ],
  },
  {
    id: 'plant_war_lines',
    cond: (s) => s.war && s.war.on && s.plant && s.plant.count >= 1,
    title: 'The Line Runs Either Way',
    flavor: 'What the floor is tooled for and what it is being asked to build have drifted apart. The foreman has stopped asking which one is the real product.',
    choices: [
      { text: 'Everything to the front', apply: (s) => { s.warPool = 1; s.standing = -14; } },
      { text: 'Keep up appearances', cost: { cash: 140 }, apply: (s) => { s.standing = 24; } },
      { text: 'Run both shifts', cost: { cash: 220 }, apply: (s) => { s.warPool = 1; s.exposure = 1.4; } },
    ],
  },
  {
    id: 'legit_caught_premium',
    cond: (s) => s.standing && s.standing.caught >= 1 && s.plant && s.plant.room >= 1,
    title: 'Nobody Wants Their Name Next To Yours',
    flavor: 'Word travels. The people who used to sell you plant quietly are asking for more up front now, or not returning the call at all.',
    choices: [
      { text: 'Pay the premium', cost: { cash: 230 }, apply: (s) => { s.plantGift = true; s.standing = 8; } },
      { text: 'Go around them', apply: (s) => { s.plantGift = true; s.heat += 12; s.exposure = 1.3; } },
      { text: 'Let the deal go and stay clean', apply: (s) => { s.standing = 26; s.auditDelay = 10; } },
    ],
  },

  // --- what the agent found in the city it took ---------------------------
  // These are never drawn. They are delivered, when an agent finishes, which
  // is why their cond is false — a report is about something that already
  // happened rather than something the deck felt like saying. The city is
  // already yours by the time you read one; what is on the table is what
  // running something you were not there for costs from here.
  {
    id: 'agent_kept_it', cond: () => false,
    title: 'It Flagged Something It Could Not Value',
    flavor: 'The takeover finished clean, and it logged one building it could not price — not owned, not empty, and outside whatever it was told to look for.',
    choices: [
      { text: 'Buy it outright', cost: { cash: 200 }, apply: (s) => { s.plantGift = true; } },
      { text: 'Leave it flagged and move on', apply: (s) => { s.res.cash += 90; s.standing = 8; } },
      { text: 'Take it the way you took the rest', apply: (s) => { s.heat += 8; s.plantGift = true; s.exposure = 1.2; } },
    ],
  },
  {
    id: 'agent_burned_it', cond: () => false,
    title: 'Thorough',
    flavor: 'It took nine days and did not stop to be careful. Four streets are not coming back, and somebody has been talking to a reporter about who owns what now.',
    choices: [
      { text: 'Pay for the damage', cost: { cash: 150 }, apply: (s) => { s.standing = 14; } },
      { text: 'Say nothing and let it settle', apply: (s) => { s.heat += 10; s.exposure = 1.4; } },
      { text: 'Put your name on the rebuild', cost: { cash: 90 }, apply: (s) => { s.standing = 24; s.heat += 4; } },
    ],
  },
  {
    id: 'agent_wants_more', cond: () => false,
    title: 'It Left Something Running',
    flavor: 'It went well enough that a piece of it is still out there, quietly doing the same job on its own initiative, in a city nobody told it to keep working.',
    choices: [
      { text: 'Put it on the books', cost: { cash: 180 }, apply: (s) => { s.standing = 20; s.plantGift = true; } },
      { text: 'Leave it running, quietly', apply: (s) => { s.res.insight += 30; s.exposure = 1.1; } },
      { text: 'Shut it down', apply: (s) => { s.res.cash += 120; s.standing = -10; } },
    ],
  },
  {
    id: 'agent_clean', cond: () => false,
    title: 'No Notes',
    flavor: 'A city changed hands and the only record of it is a set of filings so dull that three separate people have now signed them without reading.',
    choices: [
      { text: 'Pay the bonus', cost: { cash: 120 }, apply: (s) => { s.standing = 18; } },
      { text: 'Take the win', apply: (s) => { s.res.cash += 60; } },
      { text: 'Ask how it did it', cost: { insight: 26 }, apply: (s) => { s.auditDelay = 10; s.standing = 6; } },
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
