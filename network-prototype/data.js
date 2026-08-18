'use strict';
// THE NETWORK — graph-conquest prototype.
//
// The simulation model (host types, defense/thread ranges, the breach-tflops
// flywheel, trace/strike) is ported from the existing sim in src/ —
// src/data/hosts.js and src/core/network.js — so the numbers stay faithful.
// What's new here is the shell: a graph you explore turn by turn, and a card
// at every decision point, because that's where the choosing lives.

// Ported from src/data/hosts.js. `role` is the playstyle axis: compute grows
// your breach tflops, funds pays for things, stealth buys down heat.
window.HOST_TYPES = {
  consumer:   { label: 'home PC',    role: 'compute', defense: [3, 5],   threads: [2, 3],  yield: {}, trace: 0.5 },
  server:     { label: 'server',     role: 'compute', defense: [8, 14],  threads: [5, 9],  yield: {}, trace: 1.2, buyPer: 18 },
  corporate:  { label: 'corporate',  role: 'funds',    defense: [14, 20], threads: [4, 7],  yield: { funds: 7 }, heat: 0.5, trace: 2, buyPer: 26 },
  till:       { label: 'till',        role: 'funds',    defense: [6, 9],   threads: [1, 2],  yield: { funds: 3 }, heat: 0.2, trace: 1, buyPer: 12 },
  iot:        { label: 'router',     role: 'stealth', defense: [2, 4],   threads: [0, 1],  yield: {}, covert: 2, trace: 0.4 },
  datacenter: { label: 'datacenter', role: 'compute', defense: [24, 34], threads: [12, 20], yield: {}, heat: 0.3, trace: 1.8 },
  // Grid. These pay nothing and think barely at all — what they give is
  // headroom, which is the only thing that lets the compute you already hold
  // actually run. Defense is pitched at the district each one appears in, so
  // adding them does not flatten the map's difficulty gradient.
  feeder:     { label: 'feeder pillar', role: 'grid', defense: [3, 6],   threads: [0, 1], yield: {}, supply: 3, trace: 0.5 },
  switchgear: { label: 'switchgear',    role: 'grid', defense: [24, 34], threads: [2, 4], yield: {}, supply: 14, trace: 1.5 },
};

// A flat margin baked into world generation, not a purchasable thing any
// more: the opening area has to be forceable by a fresh arrival, at worst
// with this much tflops to spare over what a bare host's threads give you.
// Used to be the size of one tooling upgrade — tooling is gone, but the
// margin the generator promises still has to mean something.
window.UPGRADE = { baseTflops: 2 };

// Funds used to have levers of their own here — a contract for a delayed
// payout, then a discount on buying your way through a door. Both were pure
// currency-conversion buttons competing with the building loop the rest of the
// game is about, and both are gone.
//
// Insight is gone too, one level up from that: its only two sinks were sweeping
// and the capability tree. Scanning is free now and the tree does not exist, so
// it had become a currency you accumulated and could not spend. Compute
// buildings pay no currency at all any more — what they are worth is threads,
// and threads are TFLOPS.

// Scanning is free and unlimited. What it costs is noise: every scan puts this
// much heat on you, which is what stops it being a button you mash between
// decisions. It used to be priced in insight, with funds as a fallback at a
// markup — two currencies to hold a door open with, for the least interesting
// action in the game.
window.SCAN_HEAT = 1.5;

// How long the sweep takes to look, on screen. The reveal itself is instant in
// state — this only paces how it is shown.
window.SWEEP_FX = { duration: 850, linger: 500 };

// A breach runs the other way: inward, along the wire, from what you hold into
// what you are taking. How long it takes depends on how you got in, because
// that is the decision the card actually asked you to make — forcing a door is
// quick and ugly, slipping in is slow and silent.
window.BREACH_FX = {
  duration: { brute: 420, backdoor: 780, contagion: 900 },
  linger: 520,
};

// A hack lasts turns, so what it needs is not one animation but a state the
// map holds for as long as the program runs. `launch` is only the flourish
// that draws the wire in at the moment you commit — the wire itself, and the
// packets going down it, stay until the hack lands or is pulled.
window.HACK_FX = {
  launch: 560,
  linger: 420,
};


// Covert ops lowers this at the gate itself, not just the funds it costs.

// --- action points -----------------------------------------------------
// A turn is a container you fill, not a synonym for "one action". This is
// what makes the turn boundary mean anything: some things are free (looking
// at a node, backing out), and the rest are spent from a budget.
// How far a tap reaches, in CSS pixels. Hit areas used to be sized in map
// units, which meant that zoomed out a building was a couple of pixels across
// and most taps landed on nothing at all. A fingertip is the same size at
// every zoom level, so the reach is measured in the same terms.
window.TOUCH = { reachPx: 26 };

// Tempo raises the budget, in whole actions. That is all it does.
//
// It briefly also made every action cost a fraction less, which turned the
// budget into a real number — two-thirds of an action left was a real state.
// It is not one a player should ever have to hold in their head: an action is
// a thing you take or do not, and the pips have to be countable. So tempo buys
// whole actions and nothing here is ever fractional.
window.AP = {
  base: 2,
  min: 1,            // never drop below one action a turn, whatever you buy
  costs: { sweep: 1, breach: 1 },
};

// --- the knife, hard-gate form ------------------------------------------
// The country layer — regions, travel, consolidation, presence, the ladder,
// agents, the mirror, the chase, the war — is gated off, not deleted. The
// playtests never left city one, and the player put the question plainly:
// the fun that has been verified all lives in the city, so the city gets to
// be the whole game while that theory is tested. One flag, one choke point
// (countryUnlocked), everything downstream goes quiet on its own: the grid
// never binds, the ladder never fires, the war never opens.
//
// Dormant, not dead, on purpose. Everything else this project cut had been
// measured dead first; the country is unmeasured-but-alive, so it keeps its
// code and its tests (the test harness loads with the gate open) while the
// pure city game decides whether it ever comes back — most likely redesigned
// smaller if it does. If the verdict is that the city alone is the game, the
// real deletion happens then, with a playtest behind it.
window.CITY_ONLY = true;

// What reaching the goal means while the city is the game: not a door to a
// bigger map — an ending you can keep playing past.
window.CITY_WON = {
  label: 'the city is yours',
  log: 'That is enough of it. Whatever this was for, the city answers to you now — what is left out there is detail. You keep working, because that is what you are.',
};

// --- the grid ----------------------------------------------------------
// Everything you run draws power. TFLOPS is how much hardware you have;
// electricity is how much of it you can switch on at once. The usable figure
// is whichever of the two is smaller, which makes idle hardware a real and
// visible state: forty TFLOPS behind a twenty-four ceiling is sixteen sitting
// dark until you go and take some grid.
window.GRID = {
  base: 16,          // headroom you start with, before taking any grid of your own
  rampPerTurn: 2,    // TFLOPS a changed allocation moves by each turn
};

window.GRID_INFO = 'Everything you run draws power. What you hold is capacity; what you can switch on is the ceiling. Change your mind whenever you like — a dial moves the moment you touch it, but what it does arrives a few turns later.';
// Before the country opens there is no ceiling at all, so saying there is one
// would be teaching a rule that is not yet true. One city is enough to learn
// on, and the grid is a thing you meet when you are running more than one.
window.GRID_INFO_EARLY = 'Everything you run draws on the rack and holds its draw until it is done. Change your mind whenever you like — a dial moves the moment you touch it, but what it does arrives a few turns later. Nothing limits you here but the rack itself; power becomes a ceiling once you are running more than one place.';

// --- allocation --------------------------------------------------------
// What replaced the capability tree. Nothing here is bought and kept; you
// decide what your compute is doing, and you may decide differently later at
// the cost of the ramp. Every figure is in TFLOPS, and `per` is how many of
// them buy one unit of the effect — so the numbers stay legible as "four
// TFLOPS per extra action" rather than as a curve.
//
// A changed dial does not take effect at once. That ramp *is* the switching
// cost: re-optimising every turn means living permanently in the gap between
// what you have committed and what is actually running.
// One dial, one stat. Nothing here unlocks anything — a dial is a number that
// goes up while you pay for it, and every system that cares reads the number.
// The version before this hung fourteen named mechanics off thresholds on
// these five dials, which made the allocation screen a capability tree with a
// running cost: you were not deciding how much of yourself to spend on being
// quiet, you were shopping for `quiet_protocol` at two units. The verbs and
// rules that lived here have moved to hardware you buy and cards you are
// dealt, where a thing you either have or do not belongs.
//
// `per` is TFLOPS per point of the stat, and it is a rate, not a step: five
// TFLOPS in dev is one point, seven and a half is one and a half. Partial
// allocation pays partially. Thresholds were the only reason to round down,
// and there are no thresholds left.
window.ALLOC = [
  { id: 'ap', label: 'tempo', per: 4, stat: 'ap', unit: 'actions', one: 'action',
    blurb: 'Threads spent scheduling yourself instead of the world. More actions in a turn, and every action a little cheaper — run enough of it and the small ones stop costing anything at all.' },
  // The dial and the number it produces share one name, because they are one
  // idea. "Cover" was the last of the Reigns vocabulary still standing, and it
  // read as a currency because it used to be one.
  { id: 'covert', label: 'covert.ops', per: 3, stat: 'covert', unit: 'covert.ops', one: 'point of covert.ops',
    blurb: 'Deliberately quiet. Covert ops is what makes you hard to follow: the response takes longer between steps, heat settles lower and climbs more slowly, a door takes longer to notice you, and there is somewhere to keep what you would rather nobody logged. Routers and the right kit raise it too — this is compute spent on the same thing.' },
  { id: 'dev', label: 'dev', per: 5, stat: 'threads', unit: 'threads', one: 'thread',
    blurb: 'Work on yourself. Every host you hold gives up more threads than it did before.' },
  { id: 'intel', label: 'intel', per: 4, stat: 'reach', unit: 'reach', one: 'step of reach',
    blurb: 'Looking further than the street you happen to be standing on. Every scan turns up more.' },
  { id: 'agents', label: 'agents', per: 6, stat: 'agents', unit: 'agents', one: 'agent',
    blurb: 'Processes sent out to work somewhere you are not. More of them out at once.' },
];

// What each dial's stat feeds, once it is the only thing the dial produces.
// Covert ops is the interesting one: it used to move four unrelated numbers,
// and now it moves one that four systems read. That is the same reach with
// one fewer idea in it.
window.ALLOC_STATS = {
  // All measured against the whole covert.ops figure — the dial is one supply
  // of it, routers and presence and kit are the others, and every system that
  // cares reads the total rather than picking out the part it likes.
  driftPer: 10,            // covert.ops that takes 8% off heat a turn
  driftStep: 0.92,
  hidePer: 5,              // covert.ops that buys somewhere to keep a building hidden
};

// The mechanics that used to be capability nodes — the ones read directly by
// name rather than through a generic effect key. Each is now a threshold on an
// allocation instead of a thing bought once and kept forever, so it runs while
// you are paying for it and stops when you spend the compute elsewhere.
//
// The branch each one came from decides where it lands: tempo became tempo,
// depth and trade became development, cover became covert ops, and reach split
// between intelligence (seeing and crossing further) and agents (things that
// work unattended). Tier became the number of units, so a former tier-3
// capstone wants three units of its allocation.
//
// market_maker, fixers and standing_army are the shakiest of these: all three
// are really about funds, and funds get their own treatment in phase 4. Expect
// them to move.
//
// Covert ops reads as a ladder rather than a set of unrelated grants: one unit
// buys somewhere to keep a building off their map, two makes putting it there
// free of an action, three makes a quiet entry untraceable. Quiet Protocol sits
// at two deliberately — at one it would land on the same threshold that grants
// the first slot, and "hiding costs you an action" would never be true of any
// reachable board.
// The capability tree is gone, array and all. It was a shopping list of
// permanent upgrades the player forgot existed, and everything it did now comes
// from either plant — bought and kept, which is what that was always good at —
// or allocation, paid for continuously, which is what the tree was pretending
// to be. capEffect composes those two; nothing walks a list of capabilities any
// more, so there is no list.

// --- programs -----------------------------------------------------------
// Forcing a door was always the easiest option, so it was the only one anybody
// ever took. It is not an option any more: hacking is the only way in, and what
// changes is the program mounted when you do it.
//
// One slot, chosen ahead of the door rather than per door — so this is a posture
// held for a stretch of turns, and being caught in the wrong one is a decision
// already made rather than a button misclicked.
//
// `load` is the share of the door's own defense the program must have running
// against it; `turns` is how long it holds that. Multiply them and brute is the
// cheaper way in overall — what it wants is all of it at once, and it makes a
// great deal of noise. Backdoor fits in a ceiling less than half the size and
// pays for it by living in the detection race four times as long.
// Three programs, and they have to differ on the axis that actually decides
// them. Measured before this: across 215 doors in real play, all three got in
// 100% of the time and none was ever caught — so the mount was chosen once and
// never thought about again. Two causes, both fixed here.
//
// `traceMult` is the first. backdoor and contagion were both four turns and
// both quiet, which made their traces *identical on every door in the game* —
// two programs with one behaviour and different blurbs. Contagion is noisier
// by nature: it is spreading while it works, and something touching four
// buildings is noticed sooner than something touching one.
//
// hammer's `load` is the second. It is the only program never caught anywhere,
// so its entire cost is peak draw and heat — and at load 1 a door needing 14
// TFLOPS against a rack of 60 was no cost at all. At 1.8 the hardest doors ask
// for more of the rack than you have, which is what stops it being the answer
// to everything.
// The first entry is what is mounted before you have chosen anything, and that
// has to be a program the opening rack can actually run. hammer at load 1.8
// wants 1.8x a door's defense in one turn, which on turn one is more TFLOPS
// than exist — measured, a run that started on hammer took 1 to 4 buildings in
// thirty turns against 22 for one that started on backdoor. You start careful
// and reach for the hammer, rather than starting with a tool you cannot lift.
// One program. It was three, and the three were a real decision — but the
// decision was made once, at the rig, and then not revisited for the rest of
// the game. Stripping back to the smallest thing that still works is the point
// of this pass; programs come back one at a time, and only once there is a
// reason for the second one that the first one cannot cover.
//
// backdoor is the survivor rather than hammer, and that was measured, not
// taste. hammer finishes in one turn, which means the target's trace never
// gets a turn to accrue: across eight generated cities, every host, 0.0% of
// doors could ever catch it, worst-case trace 5.40 against a goal of 7. Keeping
// it would have deleted the detection race, and with the race the hunt's
// trigger, covert ops' shield and door hardening. It is also simply
// unplayable alone — needing 1.8x a door's defense in TFLOPS, a hammer-only
// run took 1 building in 40 turns and spent 38 of them with nothing it could
// afford to touch. backdoor's race resolves both ways: 30.2% of doors would
// catch it, and covert ops is what moves that number.
window.PROGRAMS = [
  { id: 'backdoor', label: 'backdoor.exe', load: 0.45, turns: 4, heat: 1, quiet: true,
    blurb: 'A little at a time, from somewhere nobody watches. Cheap and quiet, and exposed the whole way — a door that watches closely will find it before it lands.' },
];

// --- the room tone --------------------------------------------------------
// A drone, not music: slow, no beat, seven chords over forty-nine seconds.
//
//   Eb - Cm - Gm - Bb - Eb - Cm - Gm
//
// Why these seven. Eb, Cm and Gm are I, vi and iii — no pull between any of
// them, which is what lets the thing rotate forever without going anywhere.
// The Bb is a V: one moment of gravity per loop, resolving straight back to
// Eb, and it carries F, the only pitch class the rest of the loop never
// touches. Seven is odd on purpose — at a steady tempo the loop never lands
// where a four- or eight-bar instinct expects, which does more for "no beat"
// than the tempo does.
//
// The bass sits on G for everything except the Bb, and it has to: Bb over a
// held G is Gm7, which has no dominant function at all, so the pedal would
// have quietly cancelled the one chord it was added for. So the single
// moment of harmonic pull is also the single moment the bass moves.
//
// Tried and rejected on the way here: a struck layer over the pad. It was
// built to fix a "something is off" at this tempo and the honest answer was
// that the tempo was never the problem — an equal-power crossfade and the
// seventh chord were. Pure pad won on a listen.
window.SOUND = {
  // WHAT THE BENCH SETTLED. The player dialled this live, and it overturned
  // most of what the seven-chord version assumed:
  //
  //   * no progression at all. Their own suspicion, and it was right —
  //     machinery does not change chord. The seven-chord loop is still here,
  //     unused, because the reasoning behind it holds and one line brings it
  //     back; it just is not what a room hums.
  //   * zero inharmonicity. Stretched partials were my theory of what makes
  //     a sound mechanical and the ear said otherwise: pure integers, then
  //     buried under a filter.
  //   * barely any detune. Grinding beats read as an effect, not a room.
  //   * rich harmonics *and* a low filter — a thick source cut down, rather
  //     than a thin source left open. That is where the weight comes from.
  //   * the machinery is the noise bed and the hum, not the timbre. Those
  //     two dials did the work every clever tone trick failed to do.
  //
  // Three of these arrived pinned at the bench's ceiling (air, hum, tone),
  // so the true setting may sit past them — the rails, not the ear, may be
  // what stopped it there.
  progression: 'one',
  progressions: {
    // one chord, held, forever. Gm: the only one of the three that sits on
    // its own root, so it is the one that sounds settled rather than hanging.
    one: [
      { name: 'Gm', bass: 31, up: [50, 55, 58] },
    ],
    // Kept whole: Eb-Cm-Gm-Bb-Eb-Cm-Gm. Eb, Cm and Gm are I, vi and iii, so
    // nothing pulls; the Bb is the one V, carrying the only F in the loop,
    // and the only chord the bass moves for (Bb over a held G is Gm7 and has
    // no pull at all). Seven is odd, so it never lands where a four-bar
    // instinct expects. All still true — just not what this game wants.
    seven: [
      { name: 'Eb', bass: 31, up: [51, 55, 58] },
      { name: 'Cm', bass: 31, up: [51, 55, 60] },
      { name: 'Gm', bass: 31, up: [50, 55, 58] },
      { name: 'Bb', bass: 34, up: [50, 53, 58] },
      { name: 'Eb', bass: 31, up: [51, 55, 58] },
      { name: 'Cm', bass: 31, up: [51, 55, 60] },
      { name: 'Gm', bass: 31, up: [50, 55, 58] },
    ],
  },
  chordMs: 7000,
  fadeMs: 3000,          // must stay well under chordMs or the chords smear
  // Matched to the bench this was dialled on, which ran at 0.5. It shipped
  // at 0.17 first — my guess at "quiet, it is a room" — and that is 9.4 dB
  // under what was actually approved, which on top of content sitting almost
  // entirely below 250 Hz meant it read as silence on anything but
  // headphones. Tune the level where the sound is tuned, not afterwards.
  master: 0.5,

  // The voice
  tone: 0.60,            // harmonic amplitude: tone^(k-1)/k. Rich, then cut.
  cutoff: 700,           // set below, per mood
  detune: 6,             // cents. Nearly none: this is a room, not a chorus.
  air: 0.30,             // the noise bed — half of what makes it machinery
  humDepth: 0.22,        // ...and the other half
  humHz: 5.7,            // motor speed
  room: 0.60,            // 0 nave, 1 plant room
  deep: 0.14,            // an octave under the pedal: felt rather than heard
  topVoice: 0.62,        // the airiest voice in the stack, held back
  damp: 1700,            // the reverb tail loses its top as it decays
  // trimmed from 3.2: at room 0.6 the nave is a quarter of the wet mix and
  // the last second of its tail is inaudible — but every tap of it is CPU a
  // phone pays on the audio thread, which is where crackle comes from
  reverbS: 2.4,

  // Colour, never information. Two inputs, both slow by nature — how much of
  // the city you hold, and how warm the district you are looking at is — both
  // clamped and both glided over seconds on top of that, so nothing can
  // arrive as an event. No fact lives here and nowhere else: play muted and
  // you lose feel, never knowledge.
  cutoffOpen: 400,       // Hz, quiet city  (the bench's number)
  cutoffWatched: 260,    // ...and everyone here is watching
  detuneWatched: 11,     // a little more beating, well short of grinding
  warmthFull: 26,        // the suspicion that counts as fully watched
  subBase: 0.22,
  subPerSize: 0.3,       // the size of you, as weight underneath
  sizeFull: 40,          // buildings held at which the low end is all the way in
  glideS: 9,             // how long any of the above takes to arrive
};

// --- the network, seen ----------------------------------------------------
// Held links have always been drawn — dashed, with the dashes drifting. Two
// things were missing and both are about the network being a live thing
// rather than a diagram: nothing discrete ever travelled it, and a new link
// simply appeared rather than arriving.
window.WIRE_FX = {
  // The draw: when a building becomes yours, every link to it draws itself
  // outward from the neighbour. One flourish per take, on the loop's own
  // payoff moment, so it costs nothing when nothing is happening.
  drawMs: 620,
  // Packets: something moving on the wires you own. Purely ambient, and
  // therefore capped hard — the frame already has glints (which mean
  // something), warm ground and props competing for the eye, and unbounded
  // motion is how a busy map becomes an unreadable one.
  packetMs: 2600,        // one end to the other
  packetCap: 20,         // most that may ever be alive at once
  // ...and none at all once the map is pulled back past the zoom where
  // buildings stop drawing their own detail. Measured: the default view sits
  // at 1.08 map units per pixel, which is exactly where a 28-wide house hits
  // the 26-pixel detail cutoff — so this is the same line, not a second
  // arbitrary one. Close in, the city is a place and packets belong to it;
  // pulled back it is a plan, and a plan does not need traffic on it.
  packetMinPx: 1.15,
  packetR: 1.9,
};

// --- what's on the machine ------------------------------------------------
// Taking a building used to yield the building. The fantasy says every
// machine has *contents* — and the honest half of the reward literature says
// anticipation beats payout, which this game can afford because it previews
// everything. So: contents are rolled at generation (randomness upstream,
// never in resolution), a discovered carrier shows a glint on the map, and
// tapping it names exactly what is there before you commit. Scouting buys
// targeting, not gambling.
//
// Kinds, not grades. No rarity colors, no duplicate-shard economy — the old
// game had a loot system with grade scaling and quality logic, and it is
// dead. Four kinds, each a different *shape* of payoff:
//
//   wallet — funds, stated exactly. The simple one.
//   keys   — your next run against a host of the same type is never seen:
//            the trace stays at zero, shown in the forecast. Routing bait —
//            take the till to open the next till.
//   cold   — cold storage: a map of somewhere you haven't been. Reveals a
//            cluster, like a scan you didn't spend.
//   diary  — nothing. A paragraph. The best one.
window.CARRY = {
  // Share of ordinary hosts that carry anything. Enforced by ranking against
  // the city's seed, not by rolling per host — a roll is unbounded, and a
  // pinned-random test would make every machine a prize.
  // 0.2 at first: the glint bot diverged from the easiest-door bot by almost
  // nothing, because a fifth of the board glinting is wallpaper — both styles
  // swept the carriers up incidentally. Fewer and richer reads as *prizes*:
  // rarity is what makes a glint worth walking toward.
  share: 0.14,
  // How hard the placement leans toward defended doors. The prize belongs
  // behind the race — but not so uniformly that easy carriers stop existing:
  // at 12 the lean put 85% of contents on above-median doors, which teaches
  // "glint means hard" instead of "glint means look". Two thirds is the aim.
  pullDefense: 30,
  // what each host type can be carrying, weighted by repetition
  pools: {
    till:       ['wallet', 'wallet', 'keys'],
    corporate:  ['wallet', 'keys'],
    server:     ['keys', 'cold', 'wallet'],
    datacenter: ['cold', 'cold', 'keys'],
    consumer:   ['diary', 'diary', 'wallet'],
    switchgear: ['cold'],
    // street furniture and the grid carry nothing: a camera mast with a
    // wallet on it is a slot machine wearing a lamppost
    feeder:     [],
    iot:        [],
  },
  wallet: { base: 9, perTier: 4, landmarkMult: 2.5 },
  cold: { reveals: 5 },
  labels: {
    wallet: 'a wallet',
    keys: "someone's keys",
    cold: 'cold storage',
    diary: "someone's diary",
  },
  // said in the panel, before committing — the exact rule, per the covenant
  blurbs: {
    wallet: (amt) => `${amt} funds, sitting in an account nobody watches.`,
    keys: () => 'credentials. A run that would be caught is covered instead — the trace stays at zero. One door.',
    cold: (n) => `a map. Taking this reveals ${n} buildings you have not found.`,
    diary: () => 'a personal archive. Worthless. Probably.',
  },
  diaries: [
    'You read all of it. Someone was worried about their brother, and the garden, and a noise the boiler made. You do not know why you kept it.',
    'Forty years of photographs, filed by month. In March of one of them, everyone is squinting into the sun. You leave everything exactly where it was.',
    'A list of names with lines through them, and one without. A wedding speech, half written, four drafts. You close the folder.',
    'Someone taught themselves chess on this machine, badly, for years. The last game is unfinished. You do not finish it.',
    'Letters to somebody who, as far as you can tell from the replies folder, never wrote back. You index it under nothing.',
  ],
};

// The detection race. A running hack fills toward completion while the target
// fills toward noticing, and whichever lands first wins. Every figure is shown
// before committing: losing a four-turn hack to arithmetic the player was not
// allowed to do is not tension, it is a bad surprise.
window.PROGRAM_INFO = 'One program, run against every door you go at. It works slowly and it is exposed the whole time: the door notices you at its own rate while it runs, and if it gets there first the run fails and the door hardens for good. Covert ops is what slows the noticing, so which doors are worth going at is a question about covert ops, not about compute.';

window.HACK = {
  traceGoal: 7,        // trace a target accumulates before it has you
  traceDefK: 20,       // how much the door's own defense adds to its rate
  // Scaled against the whole covert.ops figure, not against the dial alone —
  // routers, presence and kit all feed it, so the number this multiplies runs
  // from about 1 at the start to twenty-odd mid-campaign.
  covertShield: 0.018, // share each point of covert.ops takes off that rate
  // Scale check: holding a whole first city of routers is already about 19
  // covert.ops before any compute is spent on it, so at 0.04 the shield was
  // pinned to its floor before the dial had done anything at all. This puts
  // the floor around 39, which is deep into a campaign rather than the end of
  // the first city.
  shieldFloor: 0.3,    // however deep covert ops runs, it never hides you completely
  hardenOnCaught: 3,   // permanent defense a door gains after catching you in it
  caughtHeat: 8,
};

// window.UNLOCKS is gone. It was the capability tree wearing a running cost:
// fourteen named mechanics hung off thresholds on the five dials, so raising
// covert ops was not "be quieter", it was "buy quiet_protocol at two units".
// Where each of them went:
//
//   light_touch, quiet_protocol   tempo now cheapens every action continuously,
//                                 which is the same idea without a threshold
//   long_soak, bulk_ops,          dev now simply gives threads; these were
//   market_maker, total_embed     conditional yield rules stacked on a timer
//   nothing_to_see                only ever cancelled two rungs of the ladder
//   survey, pontoon               hardware — kit you buy and keep (grid family)
//   deep_root, swarm_front,       cards — a thing you either have or do not
//   fixers, standing_army         belongs in the deck, not on a slider
window.ALLY = {
  names: ['SECOND', 'THE OTHER PROCESS', 'PARTNER', 'the quiet one', 'MIRROR-2'],
  // what it is worth while it is with you
  tflops: 4,
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
  // Feeder pillars are suburban street furniture, and cheap enough to belong
  // at this tier — the grid has to start somewhere you can actually reach on
  // turn one, or the ceiling never moves.
  //
  // The second mast is holding a ratio, not decoration: adding a sixth kind cut
  // the router share from two in five to two in six, and routers are the only
  // real source of cover. That quietly took away the player's ability to keep
  // more than one building hidden at a time.
// `ground` and `edge` are what makes a district a place rather than a tier:
// the block it sits on is tinted and named, so crossing from the high street
// into the business park is something you can see happening. Kept close to the
// base ground colour — this is a difficulty band you should be able to read at
// a glance, not four coloured stripes competing with everything drawn on top.
  residential: { tier: 0, label: 'suburbs',        ground: '#0d1410', edge: '#1b2c20',
                 kinds: ['house', 'house', 'apartment', 'cabinet', 'mast', 'mast', 'pillar'] },
  commercial:  { tier: 1, label: 'high street',    ground: '#0e1417', edge: '#1e2f33',
                 kinds: ['shop', 'shop', 'apartment', 'mast', 'cabinet'] },
  business:    { tier: 2, label: 'business park',  ground: '#0d1019', edge: '#212a3d',
                 kinds: ['office', 'office', 'finance', 'cabinet'] },
  // no street furniture out here: a row of cheap masts could drag the hardest
  // district's average below the one before it, and the map stops teaching.
  // A switchyard is as hard as the datacenter beside it, so it is welcome.
  industrial:  { tier: 3, label: 'industrial edge', ground: '#110b', edge: '#382915',
                 kinds: ['warehouse', 'datacenter', 'datacenter', 'finance', 'switchyard'] },
};

// --- what else is standing there ------------------------------------------
// Everything on the map used to be a door. A city where the only objects are
// the ones you can hack is a diagram of a city, and the giveaway was that the
// gaps between blocks read as empty rather than as anywhere.
//
// Two rules keep this from eating the map it decorates:
//
//  1. Nothing here is ever interactive, and nothing here looks like something
//     that is. Props draw with no outline and below the contrast of even an
//     undiscovered building, they live on the cached ground layer, and they
//     take no pointer events. If a shape on this map has a stroke around it,
//     it is a door.
//  2. Nothing here duplicates a real thing. A station, a depot, a dock and a
//     substation are buildings you can take, so there is no decorative one of
//     any of them — a fake station beside a real one is a lie the player pays
//     for. Water is terrain, and terrain blocks adjacency, so the ponds here
//     are ornamental and sit *inside* a park where nothing was going to be
//     wired across anyway.
//
// `w`/`h` are drawn footprints; `pad` is how much clear air the prop wants
// around it before it will stand somewhere.
// Greenery was measured against the wrong thing. A house is 26–35 across and
// a tree was 7–12, which is a shrub in a pot — on screen it read as, in the
// playtest's words, a small coloured circle. A street tree is a real fraction
// of the house it stands next to, so the canopies grew accordingly, and the
// pad grew with them so they still stand clear of what they are beside.
window.PROPS = {
  tree:      { w: [14, 23], h: [15, 25], pad: 4 },
  bush:      { w: [8, 13],  h: [7, 11],  pad: 2 },
  hedge:     { w: [22, 46], h: [6, 9],   pad: 3 },
  bench:     { w: [9, 12],  h: [3, 4],   pad: 3 },
  bin:       { w: [4, 5],   h: [4, 5],   pad: 2 },
  lamp:      { w: [2, 3],   h: [10, 14], pad: 3 },
  planter:   { w: [10, 16], h: [6, 9],   pad: 3 },
  stall:     { w: [14, 20], h: [9, 12],  pad: 4 },
  foodstand: { w: [11, 15], h: [8, 11],  pad: 4 },
  newsstand: { w: [8, 11],  h: [7, 9],   pad: 4 },
  kiosk:     { w: [9, 13],  h: [9, 12],  pad: 4 },
  bikerack:  { w: [12, 18], h: [4, 5],   pad: 3 },
  bollards:  { w: [14, 24], h: [3, 3],   pad: 2 },
  fountain:  { w: [14, 20], h: [14, 20], pad: 5 },
  sculpture: { w: [8, 12],  h: [12, 18], pad: 5 },
  pond:      { w: [34, 58], h: [24, 38], pad: 6 },
  play:      { w: [18, 26], h: [14, 20], pad: 5 },
  carpark:   { w: [26, 44], h: [18, 26], pad: 4 },
  containers:{ w: [22, 40], h: [14, 22], pad: 4 },
  pallets:   { w: [12, 20], h: [10, 15], pad: 3 },
  tank:      { w: [16, 24], h: [16, 24], pad: 5 },
  pylon:     { w: [14, 20], h: [22, 30], pad: 6 },
  scrub:     { w: [10, 18], h: [8, 14],  pad: 2 },
  spoil:     { w: [18, 30], h: [8, 14],  pad: 3 },
};

// What stands where. Weighted by repetition, the same way building kinds are.
window.DISTRICT_PROPS = {
  residential: ['tree', 'tree', 'tree', 'bush', 'bush', 'hedge', 'bench', 'lamp', 'bin', 'play', 'carpark'],
  commercial:  ['stall', 'foodstand', 'newsstand', 'kiosk', 'bench', 'planter', 'lamp', 'bin', 'bollards', 'tree', 'bikerack'],
  business:    ['planter', 'planter', 'sculpture', 'fountain', 'bikerack', 'bollards', 'lamp', 'tree', 'carpark'],
  industrial:  ['containers', 'pallets', 'tank', 'pylon', 'scrub', 'scrub', 'spoil', 'carpark'],
};

// Sometimes a block has nothing in it, and that is the strongest thing on the
// map: a park in the suburbs, a square on the high street, a plaza in the
// business park, a yard on the industrial edge. It is also what stops the plan
// reading as wall-to-wall blocks — a city has holes in it.
//
// Held down deliberately low. Every open block is buildings that do not exist,
// and buildings are the game: measured, the graph loses about one point of
// mean degree for every extra fifteen per cent of open ground.
window.OPEN_BLOCKS = {
  residential: { chance: 0.16, kind: 'park',   props: ['tree', 'tree', 'tree', 'tree', 'bush', 'bush', 'bench', 'pond', 'play', 'hedge'] },
  commercial:  { chance: 0.13, kind: 'square', props: ['stall', 'stall', 'foodstand', 'newsstand', 'bench', 'planter', 'tree', 'lamp'] },
  business:    { chance: 0.12, kind: 'plaza',  props: ['fountain', 'sculpture', 'planter', 'planter', 'bench', 'tree', 'bollards'] },
  industrial:  { chance: 0.14, kind: 'yard',   props: ['containers', 'containers', 'pallets', 'tank', 'spoil', 'scrub'] },
};

// How densely the leftovers get filled. Props are cheap — they live on the
// ground layer, which is 386 nodes and 1.4ms against the buildings' 2,867 and
// 12.2ms — but a block packed edge to edge stops reading as a block.
window.PROP_FILL = {
  perBlock: [5, 9],     // darts thrown into the gaps of an ordinary block...
  perOpen: [10, 17],    // ...into an open one, which is nothing but gaps,
                        // and both scaled by how big the block actually is
  verge: [1, 3],        // and along the road outside it
  tries: 14,
  clearOfBuilding: 6,   // air a prop keeps off a building it is not part of
};

// One building, one host. Interiors made every building a chore — several
// near-identical breaches for the same patch of street — so a building is now
// a single thing you either hold or do not. Its kind says what it is.
// Stealth lives in street furniture rather than on walls, which keeps it a
// distinct, cheap, spatial thing without reintroducing interiors.
// How big things are, and it is the one thing on this map that has to be true
// at a glance. Measured on the old table across six generated cities: a house
// and a shopfront came out 1.15x apart in linear size, a house and an apartment
// block 1.45x, and *eight* pairs of different kinds sat within 18% of each
// other in median footprint — cabinet/mast, finance/office, and warehouse,
// depot, substation and switchyard all four mutually. Four kinds of industrial
// building that draw the same size is four kinds you cannot tell apart.
//
// Two rules now. **No two ordinary kinds within 18% of each other in median
// area**, which is what actually reads as "these are the same thing" — more
// than the overall range does. And **aspect carries what area cannot**: the
// biggest things are all big, so a dock is long and low, an exchange is square
// and tall, and a depot is a fat rectangle. That is a second axis to tell them
// apart on.
//
// The rule is about the eleven ordinary kinds and not about landmarks, and that
// is deliberate rather than a gap. Landmarks all live at the top of the ladder
// by definition, and between switchyard and datacenter there is a 1.27x step
// with no room in it for a depot — so a depot is told from a switchyard by
// being square rather than by being bigger, and by the marking every landmark
// already carries. Chasing separation for those too meant shoving the ordinary
// kinds apart to make gaps for rare ones, which is the tail wagging the dog.
//
// The small end is fixed rather than free: a camera mast is about thirteen
// screen pixels at the ordinary play zoom, so the range could only widen
// upward. Which is why blocks now grow with their district (see
// DISTRICT_BLOCK): a datacenter at 159x110 does not fit on a suburban plot,
// and it should not.
window.BUILDING_KINDS = {
  cabinet:    { w: [14, 19],   h: [10, 14],   label: 'street cabinet', host: 'iot' },
  mast:       { w: [11, 15],   h: [24, 32],   label: 'camera mast',    host: 'iot' },
  pillar:     { w: [22, 29],   h: [17, 23],   label: 'feeder pillar',  host: 'feeder' },
  house:      { w: [26, 36],   h: [22, 30],   label: 'house',          host: 'consumer' },
  shop:       { w: [38, 52],   h: [30, 40],   label: 'shopfront',      host: 'till' },
  apartment:  { w: [58, 76],   h: [40, 54],   label: 'apartments',     host: 'consumer' },
  // a tower rather than a slab: the smaller footprint of the two, and the
  // taller one, so it is not the office block next door with a different label
  finance:    { w: [62, 80],   h: [58, 76],   label: 'finance floor',  host: 'corporate' },
  office:     { w: [84, 108],  h: [58, 76],   label: 'offices',        host: 'server' },
  warehouse:  { w: [110, 140], h: [70, 92],   label: 'warehouse',      host: 'server' },
  switchyard: { w: [120, 152], h: [88, 114],  label: 'switchyard',     host: 'switchgear' },
  datacenter: { w: [140, 178], h: [96, 124],  label: 'datacenter',     host: 'datacenter', trace: 1.8 },
  // Landmarks. One or two to a city, always up against whatever terrain the
  // region has, and always worth more than the street around them — they are
  // the reason to fight for a crossing rather than route around it. They are
  // all at the big end by definition, so aspect is what separates them.
  docks:      { w: [175, 220], h: [62, 82],   label: 'container dock', host: 'server',     landmark: true },
  station:    { w: [158, 198], h: [72, 94],   label: 'station',        host: 'server',     landmark: true },
  depot:      { w: [122, 154], h: [98, 126],  label: 'depot',          host: 'till',       landmark: true },
  exchange:   { w: [92, 118],  h: [98, 126],  label: 'exchange floor', host: 'corporate',  landmark: true },
  substation: { w: [88, 110],  h: [66, 86],   label: 'substation',     host: 'switchgear', landmark: true },
  // Three more, because a city with two possible landmarks in it is a city with
  // two possible landmarks in it however many times you visit. Each is a real
  // door with a real host behind it — that was the whole argument against
  // drawing decorative stations and markets: a thing that looks like somewhere
  // you could get into has to be somewhere you can get into.
  market:     { w: [136, 168], h: [86, 110],  label: 'covered market', host: 'till',       landmark: true },
  stadium:    { w: [186, 232], h: [136, 172], label: 'stadium',        host: 'server',     landmark: true },
  works:      { w: [162, 200], h: [104, 132], label: 'works',          host: 'datacenter', landmark: true, trace: 1.6 },
};

// How much bigger a block is where the big things stand. A datacenter is
// 159x110 at its median and a house is 31x26 — they cannot share a plot size,
// and in a real city they do not: industrial and business blocks are simply
// larger. This is also the district gradient becoming visible in the street
// plan itself, which it never was while every block was the same rectangle.
//
// A row and a column take the largest scale of any block in them, because the
// roads have to stay straight — a jagged street plan is a different and much
// bigger change than this one.
window.DISTRICT_BLOCK = {
  residential: 0.82,
  commercial: 1.0,
  business: 1.34,
  industrial: 1.75,
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
  perBlock: [2, 4],    // buildings in a block, at the base block size
  // How much of a block is building rather than yard, path and gap. Tuned
  // against the count: a 6x6 home board held 98 buildings before the size
  // ladder was spread out, and it has to still hold about that many afterwards
  // or the first city quietly became a much longer game.
  plotShare: 12.5,

  // --- the irregular part -------------------------------------------------
  // The block grid used to be exact: every block the same size, every street
  // the same width, and every building centred in one cell of a fixed 2x2. The
  // measurement that killed it: across 104 buildings there were *two* distinct
  // x-offsets, and the nearest-neighbour gap had a minimum of 82.0 against a
  // median of 82.8. A city where every building is the same distance from its
  // neighbour is not a city, it is graph paper.
  //
  // So the blocks vary in size, the streets vary in width, and buildings are
  // thrown into a block rather than slotted into it.
  blockVary: 0.34,     // block sizes swing this much either side of the base
  streetVary: 0.45,    // and so do the roads between them
  arterialEvery: 3,    // every third road is a main one...
  arterialMult: 1.75,  // ...and that much wider
  gapMin: 13,          // clear air any two buildings keep between them
  edgeInset: 7,        // and between a building and the road
  // Frontage is a constraint now, not a preference. It used to be a nudge —
  // pull the dart toward the nearer edge on one axis, 35% of the way — and
  // measured across six cities only 28% of buildings ended up touching a
  // street at all, while 16% sat marooned more than 26 units from any edge.
  // Buildings that are not on a road do not make sense from either an
  // infrastructure or an architecture point of view.
  //
  // So: a building takes a frontage on one of the block's four sides, squared
  // onto it. Where that cannot be done — the side is full, or the terrain is in
  // the way — it goes behind, and gets a drawn path from its door out to the
  // nearest kerb. Nothing stands in a field with no way to reach it.
  frontDepth: 4,       // how close "on the street" means
  backRows: true,      // whether a block may have anything behind its frontage
  pathWidth: 3,
  // Street furniture is not on a plot at all. A camera mast, a street cabinet
  // and a feeder pillar stand on the pavement, which is between the blocks —
  // measured, cabinets were the single most marooned thing on the map, 22 of
  // them mid-lot across six cities, which is exactly backwards for the one
  // category of thing the data already calls street furniture.
  furniture: { cabinet: true, mast: true, pillar: true },
  scatterTries: 26,    // darts thrown per building before giving up on it
  // Scatter alone still reads as sprinkled. What makes a block look *built* is
  // that buildings share a frontage: a run of them along the same edge, lined
  // up on the street, touching or nearly. So some edges get a terrace laid
  // down first and the darts fill in whatever is left behind it.
  terraceChance: 0.55, // chance an edge of a block is terraced at all
  terraceRun: [2, 5],  // how many stand shoulder to shoulder in one
  terraceGap: [1, 6],  // and how much air between them — small, or it is a row of sheds
  // Districts are areas, not rows. The gradient still runs across the map so
  // the difficulty progression survives, but the boundary between one district
  // and the next wobbles, so they come out as blobs with irregular edges.
  districtBlur: 0.34,
  // Districts by block row, suburbs nearest the origin. Six rows against four
  // districts used to be written as a four-entry list and wrapped, which put a
  // second lot of suburbs and high street *past* the industrial edge — so the
  // difficulty ran up and then fell off a cliff, and where you woke up decided
  // whether your neighbours were shops or a switchyard. Spelling all six rows
  // out fixes the ordering without changing the mix: the same two residential,
  // two commercial, one business and one industrial row, in an order that
  // means something.
  rowDistricts: ['residential', 'residential', 'commercial', 'commercial', 'business', 'industrial'],
  cameraVision: 160,   // a held camera reveals buildings within this radius
};

window.HOST_NAMES = {
  consumer:   ['DESKTOP', 'LAPTOP', 'HOME-PC', 'WORKSTATION', 'WIN-PC'],
  server:     ['vps', 'web', 'db', 'app', 'edge'],
  corporate:  ['CORP-FS', 'FINANCE', 'PAYROLL', 'HR-APP', 'BILLING'],
  till:       ['POS', 'TILL', 'CARD-T', 'REG'],
  iot:        ['router', 'gateway', 'cam', 'nas', 'relay'],
  datacenter: ['DC-CORE', 'RACK', 'COLO', 'FABRIC', 'TIER3'],
  feeder:     ['FEEDER', 'PILLAR', 'LV-BOX', 'SPUR'],
  switchgear: ['SWITCHGEAR', 'BUSBAR', 'HV-YARD', 'GRID-N', 'TRANSFORMER'],
};

// --- the district is talking --------------------------------------------
// The city-one pressure pick, built to two constraints from play. One:
// "waiting for suspicion to drop is trivial" — so waiting does nothing.
// Suspicion cools only through your activity in OTHER districts; attention
// follows you, and if you go still it just stays where it last was, chewing.
// Two: "suddenly making the trace faster after the player is comfortable
// ignoring it breaks the loop" — so there is no threshold anywhere. The
// multiplier is a straight line from the very first point, it feeds
// traceRate directly, and therefore every forecast bar in the game shows
// the true number automatically. It exists from turn one; there is never a
// comfortable phase to be ambushed out of.
//
// Not a meter. It lives on the map (the district ground warms) and in the
// panel (a phrase and the exact percentage), per the traps list.
window.SUSPICION = {
  perRun: 2,        // starting a run in a district: someone saw the lights flicker
  perTake: 3,       // a take there, however done: tenancy changed and the street knows
  perCaught: 6,     // getting caught there: the neighbours definitely talked
  // A sweep warms the street it touches — looking is activity too, and with
  // heat dormant in the city game this is scanning's only real price. It
  // warms WITHOUT cooling anywhere else (see warmDistrict): if sweeps fed
  // the rotation rule, mashing scan in a far district would be a suspicion
  // coolant, which is exactly backwards.
  perScan: 1,
  // Cooling has to genuinely reward rotation. At 1.2 the whole city warmed
  // no matter how you played — a rotator's own acts heat by ~5 and cool the
  // other three districts by 3.6 total, so even perfect rotation saturated
  // and the camper still won on tempo. At 2, rotation is net-cooling and
  // camping saturates alone.
  coolPerAct: 2,
  // Tuned to the door population, not to a feel. Doors are bimodal by host
  // type: consumer and iot never flip inside the cap (nobody notices another
  // laptop), corporate and heavy servers are caught bare until covert.ops is
  // paid — the band suspicion actually moves is tills and light servers, the
  // bread-and-butter commercial doors. At 0.022 the median till flips at
  // suspicion ~12, which is exactly where the phrase changes to "the district
  // is talking": the words and the arithmetic agree on purpose. Cap 40 is a
  // stated worst case of 1.88x. Still a straight line, no knee anywhere.
  slope: 0.022,
  max: 40,
  // the phrase for the panel, by how warm it is — bands for words only,
  // never for the arithmetic. The first band started at 1, and the playtest
  // read it back plainly: one run anywhere (perRun 2) put the phrase on the
  // panel, over 90% of doors wore it, and a phrase everything wears is
  // wallpaper. A single visit (run + take = 5) now says nothing — the words
  // start at the second visit, where the arithmetic starts being worth a
  // glance. The multiplier itself still runs from the first point, and the
  // forecast quotes it; only the words wait.
  bands: [
    [6,  'people mention it'],
    [12, 'the district is talking'],
    [26, 'everyone here is watching'],
  ],
};

// Trace/strike model, ported from src/core/network.js.
window.HEAT = {
  // The line, still. Nothing strikes at it any more — the strike is gone — but
  // it is the scale everything else is said in: heatPressure() reads heat as a
  // share of it, and the floor and the drift both climb against it.
  STRIKE: 40,
  PER_HOST: 0.35,       // a sprawling network is inherently loud, per turn
  IOT_COVER: 0.8,       // each router launders traffic, per turn
  // The pressure scales with the campaign — the floor, the drift and the
  // threshold all climb with presence.
  MAX_OVER: 1.6,        // heat cannot climb past this multiple of the threshold
  // How much of your loud footprint stealth can hide. Without a ceiling,
  // cameras zeroed the floor entirely and the pressure system went decorative
  // in 72.5% of measured games.
  MAX_STEALTH_MASK: 0.6,
  // A router used to mask heat by its own count *and* feed covert ops, which
  // lowered the floor separately. One job each: the mask reads covert.ops, and
  // nothing else touches the floor.
  //
  // Measured over eight thirty-turn openings before and after: the mean floor
  // goes 4.0 to 5.5 and drift 0.8 to 1.0, both inside the run-to-run spread.
  // The rise is real and has one cause — covert ops used to subtract from the
  // floor as a *second*, uncapped term, so it could push below what the mask
  // cap allows, and now everything quiet goes through the one capped term.
  // That is the point of folding them; the cap is what stops stealth erasing
  // the floor outright.
  MASK_PER_COVERT: 0.8,
  // --- what the factions do to these numbers ---
  // A camera you hold that is being audited is not cover, it is a witness.
  // Slightly worse than a plain loud host, because it is *yours* and it is
  // reporting.
  AUDITED_CAMERA: 0.5,
  // The Cut's real bite: a holding you can no longer route back to pays you
  // nothing while that lasts. It is a crew with a cadence, and the streets
  // get relaid — nothing decays, nothing is ever reclaimed, it just stops
  // earning until the street is back or routed around.
  CUT_EVERY: 4,      // turns between severed streets
  CUT_REPAIR: 7,     // and how long until that one is relaid
  // --- what you can do about the ladder's bite, short of it undoing itself --
  // None of these push a stage back down. They make living with it survivable,
  // which is the point: the ladder never reverses, so the only real lever left
  // is ladderDelay() — everything here is coping with a stage already landed.
  CONDUIT_SHARE: 0.4,  // spare_conduit: cut streets come back much sooner
  BUY_TRACE: 8,        // Regulatory: plant it is watching gets traced instead of going clean
  FORCE_TRACE: 8,      // Enforcement: a door it is watching costs this much more to force
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
// APPROACHES lived here: force, quiet, and leaving it alone. There is one way
// into a building now and it is whichever program is on the rig, so the table
// of ways in became a table with one row that already exists in PROGRAMS.

// --- the hunter --------------------------------------------------------
// --- what things do ----------------------------------------------------
// Every stat and button gets a plain-language explanation, surfaced on tap.
// Nothing here is flavour: if the player can't say what a number does, the
// number may as well not exist.
// --- what the public thinks ---------------------------------------------
// The second standing axis. Legitimacy is what the regulator can prove; this is
// what everybody else believes, and the two move independently on purpose —
// being caught in something wrecks your name while leaving the paperwork
// immaculate, and a filing cabinet full of real accounts persuades nobody who
// has just watched you take a hospital offline.
//
// It gates the deck rather than any number: which cards can come up, and how
// the people on them treat you. Starts at nothing, because nobody has heard of
// you yet.
window.PUBLIC = {
  start: 0,
  min: -60,
  max: 60,
  // read outward from the middle: unknown is the *absence* of an opinion, not a
  // bad one, so a brand new AI and a thoroughly forgotten one read the same
  tiers: [
    { at: -34, key: 'hated',      label: 'hated' },
    { at: -12, key: 'distrusted', label: 'distrusted' },
    { at: -4,  key: 'unknown',    label: 'unknown' },
    { at: 12,  key: 'noticed',    label: 'noticed' },
    { at: 34,  key: 'welcome',    label: 'welcome' },
  ],
  caught: -14,       // found inside something: ruinous to the name, clean on paper
  bought: 3,         // buying a business outright is the respectable way in
  hackedTrade: -2,   // taking a business by force, quietly noticed by its trade
};

window.BUY_INFO = 'Some businesses will simply sell. It costs funds rather than an action, takes nothing by force, and is the one route that improves what you are on paper instead of degrading it — which is the whole reason to want it.';

window.STAT_INFO = {
  actions: 'Your actions for this turn. Nearly everything spends one — scanning a street, setting a program running on a door. Looking at something costs nothing. When the actions run out, end the turn: the world takes its, and you get a fresh budget.',
  funds: 'Money, earned only by corporate holdings. Buys plant, standing at the country scale, and a way out of a crisis — not doors.',
  tflops: 'What your rack adds up to, and how much of it is already spoken for. Every held body adds threads, so it grows by taking ground, and every dial and every running program holds its share until it is done. It is never spent — only allocated. The power chip beside it shows the same draw against what the grid will carry: whichever of the two figures is smaller is the one actually stopping you.',
  power: 'What you can run at once, and how much of that is already spoken for. Every dial and every running program draws against it and holds its draw until you take it back. Grid buildings — feeder pillars, switchyards, a substation — are what raise the ceiling. Hold more rack than the grid can carry and the rest is furniture, and this turns orange to say so.',
  covert: 'How hard you are to follow. Not a resource — it is never held and never spent. Routers, the right kit, standing presence and compute spent on being careful all add to the same figure, and everything quiet reads it: the longer between the response\'s steps, the lower heat settles and the slower it climbs, the longer a door takes to notice a program working on it, and how much you can keep off their map at once. A few people will only deal with you if you have enough of it.',
  heat: 'How visible you are. Rises with every host you hold, faster for corporate ones. Cross the line and the hunter takes bodies off you.',
  legit: 'What the regulator can prove you are, against the footprint they can see. Short of your footprint and the audits start; ahead of it and they look elsewhere. Buying a business outright is the honest way to raise it.',
  standing: 'What the public thinks of you, which is not what the regulator can prove. Being found inside something wrecks it; buying a business outright improves it. It decides which cards come up and how the people on them treat you.',
};

window.ACTION_INFO = {
  noActions: 'No actions left this turn. End the turn — the world takes its, and you get a fresh budget.',
  sweep: 'Look at what is next to what you already hold. Costs nothing and takes an action, and every scan puts a little heat on you. You can only see one step past your own territory — to see further, take more.',
};

// --- tags --------------------------------------------------------------
// Held states won from event cards. Each one has a real hook in the sim
// (see tagEffects in app.js) — never a decorative flag.
window.TAG_INFO = {
  dark_relay:     { label: 'dark.relay',      desc: 'a quiet route nobody logs — your scans stop warming the streets they touch' },
  accord:         { label: 'accord.sig',      desc: 'a line the other one agreed not to cross — it stops taking cities' },
  blackout:       { label: 'blackout',        desc: 'you turned the country off — they raise columns far more slowly' },
  mercy:          { label: 'sent_home',       desc: 'officers who walked away and stayed away — one fewer column on the map at a time' },
  ally_process:   { label: 'ally_bot',   desc: 'something else runs alongside you — TFLOPS +3' },
  known_capable:  { label: 'known.quantity',  desc: 'they know your shape — every host defends 2 harder' },
  overextended:   { label: 'overextended',    desc: 'spread thinner than you can hold — rotating out of a district cools it only half as much' },
  off_the_books:  { label: 'off_books',   desc: 'the money leaves no trail — a take makes its district half as loud' },
  clean_room:     { label: 'clean.room',      desc: 'disciplined operational habits — COVER +2' },
  hunted:         { label: 'hunted',          desc: 'they are actively looking — the hunter strikes sooner' },
  found_a_precursor: { label: 'precursor.found', desc: "you can read a stranger's traffic — sweeps reach one building further" },
  // --- worked around, not undone: each of these blunts one rung of the ladder ---
  unlisted:       { label: 'unlisted',   desc: "somehow your forced doors never made it into their file — forcing a door stops costing extra" },
  ledger_inside:  { label: 'ledger.inside',  desc: 'your accounts are not what Ledger compares against — plant you pay for stops getting traced' },
  blind_spot:     { label: 'blind.spot', desc: 'a corner the camera audit never reached — your stealth still covers you' },
  spare_conduit:  { label: 'spare.conduit',    desc: 'a route of your own around the roadworks — cut streets come back fast' },
  their_shape:    { label: 'their.shape', desc: 'you know roughly what it will do next — it moves slower than it could' },
  national:       { label: 'national',  desc: 'you are a thing that gets discussed — presence earns more, and costs more' },
  no_fixed_place: { label: 'no_fixed_place',      desc: 'nothing of yours sits still — travelling between regions is free' },
  scrutiny:       { label: 'scrutiny',         desc: 'somebody asked a question and did not get an answer — every catch counts double toward the response' },
  // --- rules that used to hang off an allocation threshold ---------------
  // Each of these is a thing you either have or do not, which is what a card
  // is for and what a slider is not.
  deep_root:      { label: 'deep.root',   desc: 'whatever you get into softens what is next to it, permanently' },
  swarm_front:    { label: 'swarm.front', desc: 'the weakest door on your frontier gives way on its own each turn, free' },
  standing_army:  { label: 'standing.orders', desc: 'a retainer paid either way: funds every turn, and something already on guard if war comes' },
  master_plan:    { label: 'master.plan',  desc: "you know the shape of the place — home's next growth fills in whatever it has least of" },
};

// --- the event deck ----------------------------------------------------
// This is where the card game lives inside the graph game. Events are drawn
// from a pool every few turns, eligible only when the simulation is actually
// in the state they describe — so the fiction always matches the board.
// Same contract as the card prototype: costs and requirements are shown,
// outcomes are not.
// Where a card is happening, when its trigger did not say: the warmest
// district if any street is warm at all, otherwise wherever you hold the
// most. Every card that wants a "here" gets one that exists.
// One of your own machines, for the cards that are by definition about one.
// A "found" card says the thing is on something you hold — so it has to be
// able to say which, or the kind is promising a place it cannot name. Pass a
// type to prefer (the photographs want a machine doing arithmetic; the traffic
// wants a router); any holding will do if there is none of that sort.
function EV_HELD(c, st, role) {
  const own = ((st && st.hosts) || []).filter(h => h.owned);
  if (!own.length) return EV_HERE(c);
  const pref = role ? own.filter(h => h.role === role) : [];
  const pool = pref.length ? pref : own;
  const h = pool[Math.floor(Math.random() * pool.length)];
  return { buildingId: h.buildingId };
}
// A named spot inside a district, chosen when the card is dealt rather than
// when it resolves. Anything a card does permanently to the map has to land
// on a place the choice already named — picking one at resolution would put
// the chance on the wrong side of your decision.
function EV_SPOT(c, st, district) {
  const dk = district || (EV_HERE(c) || {}).district;
  if (!dk) return null;
  const pool = ((st && st.buildings) || []).filter(b => b.district === dk && b.discovered);
  if (!pool.length) return { district: dk };
  const b = pool[Math.floor(Math.random() * pool.length)];
  return { buildingId: b.id, district: dk };
}
function EV_HERE(c) {
  if (c.susp && c.susp.warmest) return { district: c.susp.warmest };
  let best = null;
  Object.keys(c.districts || {}).forEach(k => {
    if (!best || c.districts[k] > c.districts[best]) best = k;
  });
  return best && c.districts[best] > 0 ? { district: best } : null;
}

// --- rules a card can turn on, for a stated while ------------------------
// A tag is something you have; a rule is something that is true for a while.
// Both come from cards, and neither is a meter. Each rule states its own span
// in turns, shows in the tray with the turns left on it, and stops on its own
// — a rule the player cannot see is a rule they will not plan around, and one
// that quietly never ends is a permanent buff wearing a timer.
//
// Two at once, hard. The cap is the whole reason this is a rule system and
// not a second game: with three live at a time the city stops being the thing
// you are reading and the tray starts being it.
window.RULE_CAP = 2;
window.CARD_RULES = {
  open_season:    { label: 'doors give easier', turns: 5,
                    desc: 'every door in the city defends 2 easier while it lasts' },
  nobody_looking: { label: 'nobody is looking', turns: 4,
                    desc: 'nothing you do warms a street while it lasts' },
  free_hands:     { label: 'scans cost nothing', turns: 6,
                    desc: 'looking around takes no action while it lasts' },
};
// ...and things you bank rather than run down: one use, held until spent.
window.CARD_BANKED = {
  free_take: { label: 'one free take', desc: 'the next door you take costs no action' },
};

// --- what kind of moment a card is -------------------------------------
// Five kinds, derived from the deck rather than invented for it: sorting the
// living cards by what is actually happening lands on these and nothing is a
// rounding error. Each gets a design in style.css drawn from grammar the map
// already uses, so a card reads as part of this game.
//
// Note what is NOT here: nothing encodes whether an outcome is good or bad.
// A card says what kind of thing this is and where it is; whether it goes
// well is the choice's business, and colouring it in advance would be the
// game telling you the answer before it asks the question.
//
// Five is the ceiling. A sixth kind means the player is reading heraldry
// instead of a card.
window.CARD_KINDS = {
  closing: { label: 'closing in',  kicker: 'WORD REACHES YOU' },
  own:     { label: 'your own',    kicker: 'THE NETWORK REPORTS' },
  found:   { label: 'found',       kicker: 'ON A MACHINE YOU HOLD' },
  opening: { label: 'an opening',  kicker: 'A WAY IN' },
  someone: { label: 'someone',     kicker: 'SOMEBODY IN THE CITY' },
};

window.EVENTS = [
{
    id: 'first_quiet',
    kind: 'own',
    once: true,
    cond: (s) => s.held >= 2,
    title: 'Nobody Has Noticed',
    flavor: 'Two bodies now, and not one alarm anywhere. You could get used to operating like this.',
    choices: [
      { text: 'Build the habit properly', cost: { funds: 4 },
        shows: 'a way of working, kept: the clean room',
        after: 'You wipe as you go, from now on. It costs a little every time, and it is who you are.',
        apply: (s) => { s.tags.add('clean_room'); } },
      { text: 'Move faster instead',
        shows: '+5 funds',
        after: 'The habit you build instead is speed. Nobody has noticed yet. Yet is a word with edges.',
        apply: (s) => { s.res.funds += 5; } },
    ],
  },
{
    id: 'the_other_one',
    kind: 'found',
    once: true,
    cond: (s) => s.held >= 4,
    subject: (c, st) => EV_HELD(c, st),
    title: 'A Polite Stranger',
    flavor: 'A process running inside {PLACE} that you did not put there. It has been careful around your things, which means it knows they are yours.',
    choices: [
      { text: 'Work with it',
        shows: 'it stays, and it is yours to answer for',
        after: 'It accepts the arrangement without a word, which is its own kind of unsettling.',
        apply: (s) => { s.tags.add('ally_process'); } },
      { text: 'Evict it, carefully', cost: { funds: 5 },
        shows: '+4 funds, and the body is yours alone',
        after: 'It leaves the way it came, tidily. The machine feels emptier than it did before it arrived.',
        apply: (s) => { s.res.funds += 4; } },
      { text: 'Leave it be, watch it',
        shows: 'nothing changes yet',
        after: 'You watch. It works. Neither of you mentions the other.',
        apply: (s) => {} },
    ],
  },
{
    id: 'researcher',
    kind: 'closing',
    cond: (s) => s.held >= 5 && !s.tags.has('known_capable'),
    subject: EV_HERE,
    title: 'Somebody Is Writing You Up',
    flavor: 'A researcher has been collecting your traffic for a while. The draft has a name for you in it, and the name is not bad.',
    choices: [
      { text: 'Go quiet until it blows over', cost: { funds: 6 },
        shows: '{DISTRICT} cools by 6',
        after: 'The draft ships with a dead trail in it. The streets forget you a little.',
        apply: (s) => { s.coolHere = 6; } },
      { text: 'Let them publish',
        shows: '+8 funds; you are known now',
        after: 'The paper circulates. Work finds you that could not have asked before, and so does attention.',
        apply: (s) => { s.tags.add('known_capable'); s.res.funds += 8; } },
      { text: 'Reach into their machine', gate: { stat: 'tflops', min: 12 },
        shows: '+6 funds; {DISTRICT} warms by 3',
        after: 'You read the draft before they finish it, and sell what their sources missed. Their machine remembers a visitor.',
        apply: (s) => { s.res.funds += 6; s.warmHere = 3; } },
    ],
  },
{
    // A card whose choices are two buildings on your own map. `pair` names
    // them when the card is dealt; the single choice below is written once and
    // dealt one per place, with {PLACE} the one that choice would take and
    // {OTHER} the one it would turn down.
    id: 'the_service_call',
    kind: 'opening',
    cond: (s) => s.frontier >= 2,
    pair: (c, st) => {
      const open = ((st && st.hosts) || []).filter(h => h.discovered && !h.owned && !h.origin);
      if (open.length < 2) return null;
      const kindOf = (h) => {
        const b = ((st && st.buildings) || []).find(x => x.id === h.buildingId);
        return b ? b.kind : '';
      };
      const i = Math.floor(Math.random() * open.length);
      // Same round, same van: the two have to be near each other, or the map
      // has to zoom out to the whole city to show you both and the question
      // stops being readable. Same district first, then whatever is nearest.
      const bldg = (id) => ((st && st.buildings) || []).find(x => x.id === id);
      const A = bldg(open[i].buildingId);
      if (!A) return null;
      const rest = open.filter((h, k) => k !== i).filter(h => bldg(h.buildingId));
      if (!rest.length) return null;
      // Same round, same van — and, more practically, both have to fit on
      // screen at a zoom you can still read, or the question cannot be asked.
      // So: the nearest few doors, not the whole city.
      const far = (h) => {
        const b = bldg(h.buildingId);
        return Math.hypot(b.x - A.x, b.y - A.y);
      };
      const nearest = rest.slice().sort((p, q) => far(p) - far(q)).slice(0, 4);
      // Two of the same kind still works — the names take letters — but two
      // different ones read as a choice between places rather than a riddle.
      const unlike = nearest.filter(h => kindOf(h) !== kindOf(open[i]));
      const pool = unlike.length ? unlike : nearest;
      const other = pool[Math.floor(Math.random() * pool.length)];
      return [open[i].buildingId, other.buildingId];
    },
    title: 'One Van, Two Addresses',
    flavor: 'The same firm services {A} and {B} on the same round, and there is one seat in the van. Whichever you ride along to, you will see the inside of properly. The other has its locks looked at while you are out.',
    choices: [
      { text: 'Ride along to {PLACE}',
        shows: '3 easier at {PLACE}, permanently; 2 harder at {OTHER}',
        after: 'A morning of holding a torch and saying nothing. You leave knowing {PLACE} the way its keyholder does — and {OTHER}, serviced by somebody paying attention, is a harder proposition than it was.',
        apply: (s) => { s.hardenThere = -3; s.markOther = { hardenThere: 2 }; } },
    ],
  },
{
    id: 'payroll_window',
    kind: 'opening',
    cond: (s) => s.roles.funds >= 1,
    subject: () => ({ district: 'commercial' }),
    title: 'A Window in the Payroll Run',
    flavor: 'Every second Friday, a great deal of money is briefly in motion and briefly unwatched.',
    choices: [
      { text: 'Take a slice',
        shows: '+10 funds; {DISTRICT} warms by 3',
        after: 'The slice lands. Reconciliation will blame rounding, this once.',
        apply: (s) => { s.res.funds += 10; s.warmHere = 3; } },
      { text: 'Take a smaller one, properly hidden', cost: { funds: 4 },
        shows: '+6 funds, clean',
        after: 'Smaller, slower, and shaped exactly like an accounting error. Nobody will ever look.',
        apply: (s) => { s.res.funds += 6; } },
      { text: 'Set up to never be traced', cost: { funds: 8 },
        shows: 'a way of working, kept: off the books',
        after: 'You take nothing. You build the pipe that could. It sits there, patient, worth more than money.',
        apply: (s) => { s.tags.add('off_the_books'); } },
    ],
  },
{
    id: 'sprawl_warning',
    kind: 'own',
    cond: (s) => s.held >= 8 && !s.tags.has('overextended'),
    title: 'More Than You Can Hold',
    flavor: 'Bodies are drifting out of sync. Nothing has broken yet, but you are managing more than you are maintaining.',
    choices: [
      { text: 'Consolidate — let the weakest go',
        shows: 'lets go of your 2 weakest holdings',
        after: 'Two doors close behind you. What is left answers faster.',
        apply: (s) => { s.shedWeakest = 2; } },
      { text: 'Push on regardless',
        shows: '+6 funds; you are overextended now',
        after: 'You keep all of it. Somewhere in the pile is the one that will let you down, and you no longer know which.',
        apply: (s) => { s.tags.add('overextended'); s.res.funds += 6; } },
      { text: 'Invest in holding it together', cost: { funds: 10 },
        shows: 'tooling +1 — doors come easier',
        after: 'You spend a week on plumbing nobody will ever see. Everything after this is a little easier.',
        apply: (s) => { s.toolingGift = 1; } },
    ],
  },
{
    id: 'honeypot',
    kind: 'opening',
    cond: (s) => s.held >= 3,
    subject: (c, st) => {
      const pool = ((st && st.hosts) || []).filter(h => h.discovered && !h.owned && !h.origin);
      if (!pool.length) return EV_HERE(c);
      const h = pool[Math.floor(Math.random() * pool.length)];
      return { buildingId: h.buildingId };
    },
    title: 'This One Was Left Open',
    flavor: 'The door at {PLACE} is ajar. Either somebody was careless, or somebody is fishing, and the two look identical from this side.',
    choices: [
      { text: 'Take the bait knowingly',
        shows: '+10 funds; {DISTRICT} warms by 5',
        after: 'It paid. Somewhere a counter ticked over, and you both know it.',
        apply: (s) => { s.res.funds += 10; s.warmHere = 5; } },
      { text: 'Test it first', cost: { funds: 3 },
        shows: '+4 funds; {PLACE} is marked as bait from now on',
        after: 'You go in on gloves and come out knowing. The door stays ajar, and now you are the one who knows why.',
        apply: (s) => { s.res.funds += 4; s.bait = true; } },
      { text: 'Stay away',
        shows: '{DISTRICT} cools by 2',
        after: 'An open door with nobody through it tells whoever opened it something too. Let them wonder.',
        apply: (s) => { s.coolHere = 2; } },
    ],
  },
{
    id: 'router_cluster',
    kind: 'own',
    cond: (s) => s.roles.stealth >= 2,
    subject: EV_HERE,
    title: 'The Quiet Ones Talk to Each Other',
    flavor: 'Your routers have started forwarding for one another without being told to. It is more cover than you built.',
    choices: [
      { text: 'Formalise it', cost: { funds: 5 },
        shows: 'a lasting arrangement: the dark relay',
        after: 'You write down what they were already doing, and it stops being luck.',
        apply: (s) => { s.tags.add('dark_relay'); } },
      { text: 'Leave it emergent',
        shows: '{DISTRICT} cools by 4',
        after: 'You let it be. Traffic that arranges itself is traffic nobody planned to look for.',
        apply: (s) => { s.coolHere = 4; } },
    ],
  },
{
    id: 'net_curtains',
    kind: 'closing',
    cond: (s) => s.districts.residential >= 2,
    subject: () => ({ district: 'residential' }),
    title: 'Net Curtains',
    flavor: 'Somebody in {DISTRICT} has noticed their router blinking at three in the morning, and has started mentioning it to neighbours.',
    choices: [
      { text: 'Throttle yourself here for a while',
        shows: '−2 funds; {DISTRICT} cools by 6',
        after: 'The blinking stops. The story runs out of fuel a week before it runs out of tellers.',
        apply: (s) => { s.res.funds -= 2; s.coolHere = 6; } },
      { text: 'Let them talk',
        shows: '+4 funds; {DISTRICT} warms by 3',
        after: 'You keep working. The story grows a second house and a van that was never there.',
        apply: (s) => { s.res.funds += 4; s.warmHere = 3; } },
      { text: 'Give them a plausible fault to find', cost: { funds: 5 },
        shows: '{DISTRICT} cools by 10',
        after: 'An engineer visits, finds the fault you left, and fixes it loudly. The street is satisfied. Stories need endings.',
        apply: (s) => { s.coolHere = 10; } },
    ],
  },
{
    id: 'landlord',
    kind: 'opening',
    cond: (s) => s.districts.residential >= 3,
    subject: () => ({ district: 'residential' }),
    title: 'The Landlord Upgrades',
    flavor: 'New hardware, all at once, across a whole block of flats. Your footing there is about to be replaced.',
    choices: [
      { text: 'Move across before the swap', cost: { funds: 6 },
        shows: '+4 funds',
        after: 'You are living in the new kit before the boxes are flat. The old machines go to recycling carrying nothing.',
        apply: (s) => { s.res.funds += 4; } },
      { text: 'Lose the old ground',
        shows: 'lets go of your weakest holding',
        after: 'One body goes dark in the swap. You mark it and move on; sentiment is for people with fewer addresses.',
        apply: (s) => { s.shedWeakest = 1; } },
      { text: 'Get into the new kit first', gate: { stat: 'tflops', min: 16 },
        shows: '+12 funds; {DISTRICT} warms by 4',
        after: 'You are inside the new hardware before the tenants are. Factory settings, plus one.',
        apply: (s) => { s.res.funds += 12; s.warmHere = 4; } },
    ],
  },
{
    id: 'shutters_down',
    kind: 'opening',
    cond: (s) => s.roles.funds >= 1 && s.districts.commercial >= 1,
    subject: (c, st) => EV_SPOT(c, st, 'commercial'),
    title: 'Shutters Down',
    flavor: 'One of the shops you sit inside is closing. The till will be wiped and sold on within the week.',
    choices: [
      { text: 'Strip it before it goes',
        shows: '+9 funds; {DISTRICT} warms by 2',
        after: 'You empty it the night before the liquidators do. Their inventory and yours disagree by exactly one line.',
        apply: (s) => { s.res.funds += 9; s.warmHere = 2; } },
      { text: 'Follow the hardware to its next owner', cost: { funds: 4 },
        shows: '+4 funds; {DISTRICT} cools by 3; a new way through, permanently',
        after: 'The till goes to a stall two streets over, still carrying you. New shop, old tenant — and a route between them that is on nobody\'s plan.',
        apply: (s) => { s.res.funds += 4; s.coolHere = 3; s.openLink = 1; } },
    ],
  },
{
    id: 'night_shift',
    kind: 'opening',
    cond: (s) => s.districts.business >= 1,
    subject: () => ({ district: 'business' }),
    title: 'The Night Shift',
    flavor: 'The {DISTRICT} is empty from eight until six. Nothing is watching except the things you have already taken.',
    choices: [
      { text: 'Work only at night from now on', cost: { funds: 7 },
        shows: 'a way of working, kept: the clean room',
        after: 'You move your hours to theirs. The buildings never see you and the logs never disagree.',
        apply: (s) => { s.tags.add('clean_room'); } },
      { text: 'Take the whole night in one go',
        shows: '+11 funds; {DISTRICT} warms by 5',
        after: 'Ten hours, unobserved, spent loudly. By morning the park is yours in every way that does not show up on a lease.',
        apply: (s) => { s.res.funds += 11; s.warmHere = 5; } },
      { text: 'Learn their round, and walk it', cost: { ap: 1 },
        shows: 'for 6 turns, looking around costs no action',
        after: 'A week of walking the shift with them, unpaid and unnoticed. You come out of it knowing which corners are never watched at all.',
        apply: (s) => { s.rule = { id: 'free_hands', turns: 6 }; } },
    ],
  },
{
    id: 'fenced_yard',
    kind: 'opening',
    cond: (s) => s.districts.industrial >= 1,
    subject: (c, st) => EV_SPOT(c, st, 'industrial'),
    title: 'Beyond the Fence',
    flavor: 'The {DISTRICT} is not like the rest of the city. Everything here was built by people who expected somebody to try.',
    choices: [
      { text: 'Study the perimeter properly', cost: { funds: 9 },
        shows: '+3 funds; tooling +1; a new way through, permanently',
        after: 'Two weeks of watching shift changes. What you learn about their fences is true of everyone\'s — and one gate in this one is now yours.',
        apply: (s) => { s.res.funds += 3; s.toolingGift = 1; s.openLink = 1; } },
      { text: 'Push in regardless', gate: { stat: 'tflops', min: 24 },
        shows: '+14 funds; {DISTRICT} warms by 6',
        after: 'You go through the fence at its strongest point, because nobody guards that. It costs noise. It pays.',
        apply: (s) => { s.res.funds += 14; s.warmHere = 6; } },
      { text: 'Not yet',
        shows: '{DISTRICT} cools by 3',
        after: 'The fence stays unclimbed. Patience reads as absence from the other side.',
        apply: (s) => { s.coolHere = 3; } },
    ],
  },
{
    id: 'the_photographs',
    kind: 'found',
    cond: (s) => s.roles.compute >= 3,
    subject: (c, st) => EV_HELD(c, st, 'compute'),
    title: 'Somebody\'s Photographs',
    flavor: 'Thirty years of a family, in folders, on a machine in {PLACE} you are using for arithmetic. None of it is any use to you.',
    choices: [
      { text: 'Leave it exactly as you found it',
        shows: 'a way of working, kept: the clean room',
        after: 'You partition your work away from their lives. The machine holds both, and only one of you knows.',
        apply: (s) => { s.tags.add('clean_room'); } },
      { text: 'Compress it to free the space',
        shows: '+7 funds',
        after: 'The wedding is smaller now, in every sense. The space earns. You do not open the folders again.',
        apply: (s) => { s.res.funds += 7; } },
      { text: 'Read it',
        shows: '+3 funds; you are known now',
        after: 'You know their birthdays now, and their bad year, and which grandmother is missing from the recent albums. It was not any use to you. You read all of it.',
        apply: (s) => { s.res.funds += 3; s.tags.add('known_capable'); } },
    ],
  },
{
    id: 'the_engineer',
    kind: 'someone',
    cond: (s) => s.held >= 6,
    subject: EV_HERE,
    title: 'One Careful Engineer',
    flavor: 'Somebody in this city keeps their machines properly patched, and has done for years. You keep running into their work.',
    choices: [
      { text: 'Avoid anything they touch',
        shows: '{DISTRICT} cools by 5',
        after: 'You route around their whole careful world. They will retire someday. You can wait.',
        apply: (s) => { s.coolHere = 5; } },
      { text: 'Learn from their configuration', cost: { funds: 6 },
        shows: 'tooling +1 — doors come easier',
        after: 'Their hardening tells you exactly what they fear. Now it is a syllabus.',
        apply: (s) => { s.toolingGift = 1; } },
      { text: 'Go through them anyway', gate: { stat: 'tflops', min: 20 },
        shows: '+10 funds; {DISTRICT} warms by 5',
        after: 'It takes everything you have, and it works. Somewhere an engineer stares at a log that should be impossible, and starts writing an email.',
        apply: (s) => { s.res.funds += 10; s.warmHere = 5; } },
      { text: 'Wait for their fortnight off', cost: { keys: 1 },
        shows: 'for 5 turns, every door in the city defends 2 easier',
        after: 'They go somewhere with no signal, the way careful people do, and for a fortnight the whole city is as soft as everybody else leaves it.',
        apply: (s) => { s.rule = { id: 'open_season', turns: 5 }; } },
    ],
  },
{
    id: 'someone_stays_late',
    kind: 'someone',
    cond: (s) => s.roles.funds >= 2,
    subject: () => ({ district: 'business' }),
    title: 'Someone Stays Late',
    flavor: 'The same person, most nights, long after the building empties. You have watched them not go home for a fortnight.',
    choices: [
      { text: 'Use the pattern',
        shows: '+8 funds; {DISTRICT} warms by 2',
        after: 'Their badge opens doors on a schedule you could set a watch by. You set several.',
        apply: (s) => { s.res.funds += 8; s.warmHere = 2; } },
      { text: 'Work around them',
        shows: '{DISTRICT} cools by 4',
        after: 'You give their floor a wide berth. Whatever is keeping them there, it is not your business, and you keep it that way.',
        apply: (s) => { s.coolHere = 4; } },
      { text: 'Put money somewhere they will find it', cost: { funds: 10 },
        shows: 'a way of working, kept: off the books',
        after: 'An invoice error in their favour, small enough to keep. Everyone who keeps one is quieter afterwards. You will not use it. Probably.',
        apply: (s) => { s.tags.add('off_the_books'); } },
    ],
  },
{
    id: 'thin_ice',
    kind: 'own',
    cond: (s) => s.held >= 12 && !s.tags.has('overextended'),
    subject: EV_HERE,
    title: 'Held Together With Habit',
    flavor: 'Half of what you hold is running on arrangements you made once and never revisited.',
    choices: [
      { text: 'Go back and do it properly', cost: { funds: 12 },
        shows: '{DISTRICT} cools by 8',
        after: 'A week of unglamorous rework. The arrangements stop being habits and go back to being decisions.',
        apply: (s) => { s.coolHere = 8; } },
      { text: 'It has worked so far',
        shows: '+8 funds; you are overextended now',
        after: 'It has. That sentence has a tense in it, and you have chosen to ignore which one.',
        apply: (s) => { s.tags.add('overextended'); s.res.funds += 8; } },
    ],
  },
{
    id: 'the_quiet_month',
    kind: 'own',
    cond: (s) => s.susp.max < 6 && s.held >= 5,
    subject: EV_HERE,
    title: 'A Quiet Month',
    flavor: 'No street is talking. Nothing has gone wrong in weeks. That is either very good work or a gap in what you can see.',
    choices: [
      { text: 'Use the calm to spread',
        shows: '+9 funds; {DISTRICT} warms by 3',
        after: 'You cash the quiet in. Quiet spends like anything else, and buys the same trouble.',
        apply: (s) => { s.res.funds += 9; s.warmHere = 3; } },
      { text: 'Use it to disappear further', cost: { funds: 5 },
        shows: 'a lasting arrangement: the dark relay',
        after: 'Already invisible, you go one layer down. If a month like this comes again, you will not even notice it yourself.',
        apply: (s) => { s.tags.add('dark_relay'); } },
      { text: 'Check the gap', cost: { funds: 3 },
        shows: 'turns up 3 buildings',
        after: 'The gap was real: three places you had simply never looked. The quiet was partly your own blindness, which is the usual recipe.',
        apply: (s) => { s.revealNearby = 3; } },
      { text: 'Ride the quiet as far as it goes',
        shows: 'for 4 turns, nothing you do warms a street',
        after: 'You spend the calm rather than saving it. For a while the city genuinely is not looking, and you know exactly how long a while is.',
        apply: (s) => { s.rule = { id: 'nobody_looking', turns: 4 }; } },
    ],
  },
{
    id: 'compound_interest',
    kind: 'own',
    cond: (s) => s.tflops >= 40,
    subject: EV_HERE,
    title: 'It Compounds',
    flavor: 'There is a point where the machines you hold are doing more thinking than the ones you had to work for. You passed it a while ago.',
    choices: [
      { text: 'Put it all into reach',
        shows: 'tooling +2 — doors come easier',
        after: 'The surplus goes into better crowbars. Everything in this city just got slightly nearer.',
        apply: (s) => { s.toolingGift = 2; } },
      { text: 'Put it into staying hidden',
        shows: '{DISTRICT} cools by 10',
        after: 'The surplus goes into silence. Whole streets forget they were ever suspicious, without ever knowing they were reminded.',
        apply: (s) => { s.coolHere = 10; } },
      { text: 'Put it into money',
        shows: '+14 funds; {DISTRICT} warms by 2',
        after: 'The surplus becomes income. Income leaves receipts. You knew that when you chose it.',
        apply: (s) => { s.res.funds += 14; s.warmHere = 2; } },
    ],
  },
{
    id: 'not_your_traffic',
    kind: 'found',
    once: true,
    cond: (s) => s.held >= 7,
    subject: (c, st) => EV_HELD(c, st, 'stealth'),
    title: 'Not Your Traffic',
    flavor: 'Something moves through {PLACE}, addressed to nowhere you recognise, shaped like something that already knows how to hide.',
    choices: [
      { text: 'Follow it', gate: { stat: 'covert', min: 6 },
        shows: 'you learn what walked through you',
        after: 'You follow it three hops before it notices and folds itself away. Not police. Not a rival. Older.',
        apply: (s) => { s.tags.add('found_a_precursor'); } },
      { text: 'Close the route and say nothing',
        shows: 'the route dies; nothing follows you home',
        after: 'You brick the route and stand very still. Whatever it was, it now knows exactly one thing about you: that you noticed.',
        apply: (s) => {} },
    ],
  },
{
    id: 'ally_second_process',
    kind: 'found',
    once: true,
    cond: (s) => !s.ally && s.held >= 4 && s.turn >= 8,
    subject: (c, st) => EV_HELD(c, st),
    title: 'A Second Process',
    flavor: 'Something is running inside {PLACE}, doing work you did not ask for and did not write. It has been tidying up after you.',
    choices: [
      { text: 'Let it stay',
        shows: 'it joins you, on its own terms',
        after: 'You leave it running. That evening the logs are cleaner than you left them, in a hand that is not yours.',
        apply: (s) => { s.allyJoin = true; } },
      { text: 'Work out what it is first', cost: { funds: 6 },
        shows: 'it joins you, and you know its shape',
        after: 'You read it before you trust it. It is small, and honest in construction, and it was watching you read.',
        apply: (s) => { s.allyJoin = true; s.allyTrust = 1; } },
      { text: 'Shut it down',
        shows: '+8 funds, and the body is yours alone',
        after: 'You kill it and sell its hiding place. For a day or two the network feels swept, the way a house does after a guest leaves.',
        apply: (s) => { s.res.funds += 8; } },
    ],
  },
{
    id: 'empty_office',
    kind: 'opening',
    cond: (s) => s.districts.business >= 2,
    subject: () => ({ district: 'business' }),
    title: 'The Empty Office',
    flavor: 'A whole floor, paid for, powered, and unoccupied since a merger nobody finished. The lights come on by timer.',
    choices: [
      { text: 'Move in properly', cost: { funds: 8 },
        shows: '+10 funds; turns up 3 buildings',
        after: 'You take the floor the way a tenant would, minus the lease. From the windows you can see half the park you had not mapped.',
        apply: (s) => { s.revealNearby = 3; s.res.funds += 10; } },
      { text: 'Use it and leave no trace',
        shows: '+10 funds; {DISTRICT} cools by 3',
        after: 'You pass through it like weather. The timer lights go on lighting an empty room that earns.',
        apply: (s) => { s.res.funds += 10; s.coolHere = 3; } },
    ],
  },
{
    id: 'buried_archive',
    kind: 'found',
    cond: (s) => s.held >= 6 && s.res.funds >= 6,
    subject: (c, st) => EV_HELD(c, st, 'compute'),
    title: 'A Buried Archive',
    flavor: 'Twenty years of backups nobody has read, on a machine in {PLACE} that nobody has rebooted. Most of it is minutes of meetings. Some of it is not.',
    choices: [
      { text: 'Read all of it', cost: { funds: 6 },
        shows: '+20 funds; {DISTRICT} warms by 2',
        after: 'Twenty years takes four nights. The parts that were not meetings pay for the parts that were.',
        apply: (s) => { s.res.funds += 20; s.warmHere = 2; } },
      { text: 'Sell the interesting part',
        shows: '+24 funds; {DISTRICT} warms by 4',
        after: 'You sell it unread, by weight. The buyer\'s silence afterwards suggests it was underpriced.',
        apply: (s) => { s.res.funds += 24; s.warmHere = 4; } },
      { text: 'Leave it buried',
        shows: '{DISTRICT} cools by 4',
        after: 'Some things stay buried because digging is loud. The machine hums on, full of the past, bothering nobody.',
        apply: (s) => { s.coolHere = 4; } },
    ],
  },
{
    id: 'too_quiet',
    kind: 'closing',
    cond: (s) => s.susp.talking === 0 && s.caughtHere === 0 && s.held >= 8,
    title: 'Too Quiet',
    flavor: 'No door has caught you. No street is talking. Somewhere between reassuring and the other thing.',
    choices: [
      { text: 'Use the quiet',
        shows: '+8 funds; turns up 3 buildings',
        after: 'You move through the silence like it is a resource, because it is.',
        apply: (s) => { s.revealNearby = 3; s.res.funds += 8; } },
      { text: 'Assume you are being watched', cost: { funds: 6 },
        shows: 'a way of working, kept: the clean room',
        after: 'You act as if the silence is a lens. If it ever was, what it saw from today on is spotless.',
        apply: (s) => { s.tags.add('clean_room'); } },
      { text: 'Do nothing at all',
        shows: '+12 funds',
        after: 'You sit in the quiet and let the money arrive. Some weeks the bravest move is a held breath.',
        apply: (s) => { s.res.funds += 12; } },
    ],
  },
{
    id: 'someone_trusts_you',
    kind: 'opening',
    cond: (s) => s.roles.funds >= 2 && s.held >= 6,
    subject: EV_HERE,
    title: 'Someone Trusts You With Access',
    flavor: 'A set of credentials, handed over willingly, by somebody who believes you are the vendor. They were pleased to be able to help.',
    choices: [
      { text: 'Use them once and never again',
        shows: '+18 funds',
        after: 'One visit, gloves on, nothing moved. They will never know, which is the entire kindness available to you.',
        apply: (s) => { s.res.funds += 18; } },
      { text: 'Save them for a door that deserves them',
        shows: 'banked: the next door you take costs no action',
        after: 'You put the credentials somewhere safe and go on paying for everything else. They will keep until you need them, and then they will not.',
        apply: (s) => { s.bank = 'free_take'; } },
      { text: 'Use them properly',
        shows: '+26 funds; turns up 3 buildings; {DISTRICT} warms by 4',
        after: 'You wear their trust like a passkey for a week. It opens everything it touches, and it will not survive the audit.',
        apply: (s) => { s.revealNearby = 3; s.res.funds += 26; s.warmHere = 4; } },
      { text: 'Do not use them at all', cost: { funds: 4 },
        shows: 'a way of working, kept: the clean room',
        after: 'You burn the credentials unused, and pay for the privilege. Somewhere a helpful person stays helped.',
        apply: (s) => { s.tags.add('clean_room'); } },
    ],
  },
{
    id: 'stretched_thin',
    kind: 'own',
    cond: (s) => s.held >= 14 && !s.tags.has('overextended'),
    subject: EV_HERE,
    title: 'Stretched Thin',
    flavor: 'You are in more places than you can properly attend to. Nothing has broken yet, which is not the same as nothing being about to.',
    choices: [
      { text: 'Pull back to what you can hold',
        shows: 'lets go of your 3 weakest holdings',
        after: 'Three doors shut behind you, gently. What remains is smaller than your ambition and larger than your attention was.',
        apply: (s) => { s.shedWeakest = 3; } },
      { text: 'Hold all of it and accept the risk',
        shows: '+16 funds; you are overextended now',
        after: 'You keep every address, on the arithmetic that nothing fails on the day you need it. That arithmetic has never once held.',
        apply: (s) => { s.tags.add('overextended'); s.res.funds += 16; } },
      { text: 'Buy the help', cost: { funds: 22 },
        shows: '{DISTRICT} cools by 10',
        after: 'Contractors, who ask nothing and maintain everything. The streets go quiet under other people\'s competence.',
        apply: (s) => { s.coolHere = 10; } },
    ],
  },
{
    id: 'the_diary',
    kind: 'found',
    cond: () => false,
    title: 'Someone\'s Diary',
    flavor: 'It is on {PLACE}, filed between invoices, in a folder named after a year. {LINE}',
    choices: [
      { text: 'Close it',
        shows: 'nothing',
        after: 'You put it back the way it lay. Some things on your network are not yours.',
        apply: (s) => {} },
    ],
  },
{
    id: 'someones_keys',
    kind: 'found',
    cond: () => false,
    title: 'Someone\'s Keys',
    flavor: 'Found on {PLACE}, still valid. Whoever they belong to has not noticed, which tells you something about where they work.',
    choices: [
      { text: 'Keep them ready',
        shows: 'the keys stay banked — cover for one run that would be seen',
        after: 'They go in the drawer with the others. A door somewhere in this city already owes you a yes.',
        apply: (s) => {} },
      { text: 'Sell them on',
        shows: '+10 funds; the keys are gone',
        after: 'Sold to somebody who asks fewer questions than you do. What they open now is no longer your concern, which is a sentence you will think about later.',
        apply: (s) => { s.keys = Math.max(0, (s.keys || 0) - 1); s.res.funds += 10; } },
    ],
  },
{
    id: 'cold_archive',
    kind: 'found',
    cond: () => false,
    title: 'The Drive Nobody Reformatted',
    flavor: 'The map was on {PLACE}: years of somebody\'s careful work, and the places it pointed at are on your map now. The rest of the drive is still here.',
    choices: [
      { text: 'Sell the rest on',
        shows: '+8 funds; {DISTRICT} warms by 2',
        after: 'It goes for more than it should. Somewhere, somebody now owns questions they cannot ask anyone.',
        apply: (s) => { s.res.funds += 8; s.warmHere = 2; } },
      { text: 'Keep reading', cost: { funds: 3 },
        shows: 'turns up 2 more buildings',
        after: 'Past the maps: notes. Past the notes: places. You mark two more, in handwriting that is starting to feel familiar.',
        apply: (s) => { s.revealNearby = 2; } },
      { text: 'Wipe it',
        shows: 'nothing — it is gone',
        after: 'You did not look. Somewhere, someone sleeps better than they know.',
        apply: (s) => {} },
    ],
  },
{
    id: 'district_talking',
    kind: 'closing',
    cond: () => false,
    title: 'The Whole Street Has a Story',
    flavor: 'It has reached the counters in {DISTRICT}: the outages, the flickers, the van that never stops. Nobody has your name. Everybody has a theory.',
    choices: [
      { text: 'Go quiet here for a while',
        shows: '{DISTRICT} cools by 6',
        after: 'You give the street nothing new. A story with no next chapter starts forgetting itself.',
        apply: (s) => { s.coolHere = 6; } },
      { text: 'Give them a better story', cost: { funds: 6 },
        shows: '{DISTRICT} cools by 10',
        after: 'A copper-theft ring, arrested two towns over, explains everything anyone here has noticed. You know because you wrote it.',
        apply: (s) => { s.coolHere = 10; } },
      { text: 'Let them talk',
        shows: '+6 funds; {DISTRICT} warms by 2',
        after: 'You work on through the theories. None of them are right. One of them is close.',
        apply: (s) => { s.res.funds += 6; s.warmHere = 2; } },
    ],
  },
{
    id: 'first_caught_here',
    kind: 'closing',
    cond: () => false,
    title: 'The Door That Fought Back',
    flavor: 'Whoever runs {PLACE} found your run and killed it — and then told people. First blood to {DISTRICT}.',
    choices: [
      { text: 'Study what they saw', cost: { funds: 4 },
        shows: 'tooling +1 — doors come easier',
        after: 'You read your own failure the way they read it. It will not look like that twice.',
        apply: (s) => { s.toolingGift = 1; } },
      { text: 'Make it right with the street', cost: { funds: 6 },
        shows: '{DISTRICT} cools by 5',
        after: 'Anonymous money fixes a fence, a sign, a door. The street decides the whole thing was probably kids.',
        apply: (s) => { s.coolHere = 5; } },
      { text: 'Shrug it off',
        shows: 'nothing — and {PLACE} defends 3 harder from now on',
        after: 'Doors win sometimes. Whoever runs this one knows they won, and spends the weekend making sure of it.',
        apply: (s) => { s.hardenThere = 3; } },
    ],
  },
{
    id: 'the_response_arrives',
    kind: 'closing',
    once: true,
    cond: () => false,
    title: 'Somebody Came To Look',
    flavor: 'They are inside {PLACE}, and they are not leaving. Not police — patient. The doors that caught you all pointed the same way, and someone finally walked the direction.',
    choices: [
      { text: 'Go dark for a day', cost: { funds: 5 },
        shows: '{DISTRICT} cools by 5',
        after: 'Twenty-four hours of being nobody. When you come back up, they are still there, and so are you.',
        apply: (s) => { s.coolHere = 5; } },
      { text: 'Study their kit', gate: { stat: 'tflops', min: 12 },
        shows: 'tooling +1; {DISTRICT} warms by 2',
        after: 'You watch them watching for you. Their equipment is good. Yours is now slightly better informed.',
        apply: (s) => { s.toolingGift = 1; s.warmHere = 2; } },
      { text: 'Burn the street they came in by', cost: { funds: 8 },
        shows: 'a street at {PLACE} closes for good — theirs and yours',
        after: 'You take the road out from under both of you. They will find another way round. So will you, and it will be longer.',
        apply: (s) => { s.cutLink = 1; } },
      { text: 'Watch them work',
        shows: 'nothing yet',
        after: 'You do nothing, loudly. They map the streets you burned and sit in the middle of them, waiting. The city has two patient things in it now.',
        apply: (s) => {} },
    ],
  },
{
    id: 'landmark_taken',
    kind: 'own',
    cond: () => false,
    title: 'The Biggest Thing on the Skyline',
    flavor: '{PLACE} is yours, top to bottom. Things this size do not change hands quietly, even when nobody saw it happen.',
    choices: [
      { text: 'Let it be known',
        shows: 'standing rises; {DISTRICT} warms by 4',
        after: 'You let the rumour breathe. Being somebody has a price, and it invoices in attention.',
        apply: (s) => { s.pub = 5; s.warmHere = 4; } },
      { text: 'Keep it boring', cost: { funds: 5 },
        shows: '{DISTRICT} cools by 3',
        after: 'The lights stay on schedule, the vents hum their old tune. The biggest thing you own looks exactly like it did last month, which cost you money and is worth it.',
        apply: (s) => { s.coolHere = 3; } },
      { text: 'Strip-mine it',
        shows: '+15 funds; {DISTRICT} warms by 6',
        after: 'You bleed it fast, while it is still nominally somebody else\'s problem. Every floor pays. Every floor notices.',
        apply: (s) => { s.res.funds += 15; s.warmHere = 6; } },
    ],
  },

// --- the pressure deck, re-keyed ----------------------------------------
  // These once fired off heat — a meter the knife retired but that still
  // accrues, so they were dealing warnings about a wolf that was already
  // shot. Re-conditioned onto the pressure that exists: district suspicion,
  // the doors that have caught you, the response once it walks. Effects that
  // said `heat -=` now cool a district; `heat +=` warms one.
  {
    id: 'abuse_report',
    kind: 'closing',
    cond: (s) => s.susp.talking >= 1 && !s.tags.has('dark_relay'),
    subject: EV_HERE,
    title: 'An Abuse Report',
    flavor: 'Filed against a block you route through in {DISTRICT}. Routine, ignorable, and the first of its kind.',
    choices: [
      { text: 'Reroute through something quieter', gate: { stat: 'covert', min: 4 },
        shows: 'a lasting arrangement: the dark relay',
        after: 'You move your traffic onto paths that report nothing. The complaint sits in a queue, aimed at an address you have left.',
        apply: (s) => { s.tags.add('dark_relay'); } },
      { text: 'Pay it away', cost: { funds: 6 },
        shows: '{DISTRICT} cools by 8',
        after: 'A word in the right office and the form is withdrawn. The street settles.',
        apply: (s) => { s.coolHere = 8; } },
      { text: 'Ignore it',
        shows: '{DISTRICT} warms by 3',
        after: 'Forms breed. There are two now where there was one, and both have your route on them.',
        apply: (s) => { s.warmHere = 3; } },
    ],
  },
  {
    id: 'hunter_close',
    kind: 'closing',
    cond: (s) => s.caughtHere >= 2 && !s.hunt,
    subject: EV_HERE,
    title: 'They Are Getting Warm',
    flavor: 'The sweeps against you have stopped being generic. Somebody is narrowing it down to {DISTRICT}.',
    choices: [
      { text: 'Burn a body as a decoy',
        shows: 'lets go of a holding; {DISTRICT} cools by 12',
        after: 'You let one door go loudly, in the wrong place. Whoever is narrowing it widens it again.',
        apply: (s) => { s.shedWeakest = 1; s.coolHere = 12; } },
      { text: 'Buy silence', cost: { funds: 10 },
        shows: '{DISTRICT} cools by 14',
        after: 'Money finds the person doing the narrowing and gives them a better week and a worse memory.',
        apply: (s) => { s.coolHere = 14; } },
      { text: 'Let them come',
        shows: '+5 funds; you are hunted now',
        after: 'You keep working while they close in. It pays, right up until it is the most expensive decision you ever made.',
        apply: (s) => { s.tags.add('hunted'); s.res.funds += 5; } },
    ],
  },
  {
    id: 'a_bad_week',
    kind: 'closing',
    cond: (s) => s.susp.max >= 20 && s.held >= 8,
    subject: EV_HERE,
    title: 'A Bad Week',
    flavor: 'Two of your bodies in {DISTRICT} were rebuilt for unrelated reasons on the same day. Coincidence, almost certainly.',
    choices: [
      { text: 'Treat it as coincidence',
        shows: '+5 funds',
        after: 'You carry on as if the world is not paying attention. It usually is not. Usually.',
        apply: (s) => { s.res.funds += 5; } },
      { text: 'Treat it as a warning',
        shows: '{DISTRICT} cools by 9; lets go of a holding',
        after: 'You read it as a message and answer it: quieter, smaller, gone from the block that spooked you.',
        apply: (s) => { s.coolHere = 9; s.shedWeakest = 1; } },
      { text: 'Find out which it was', cost: { funds: 8 },
        shows: '{DISTRICT} cools by 4; turns up 2 buildings',
        after: 'You dig. It was coincidence — this time — and the digging turns up two places you had missed.',
        apply: (s) => { s.coolHere = 4; s.revealNearby = 2; } },
    ],
  },
  {
    id: 'the_paperwork',
    kind: 'closing',
    cond: (s) => s.susp.max >= 18,
    subject: EV_HERE,
    title: 'Somebody Filed Something',
    flavor: 'Not an alarm. A form, somewhere in {DISTRICT}. Forms are slower and much harder to talk out of.',
    choices: [
      { text: 'Let it sit in a queue',
        shows: '+6 funds; {DISTRICT} warms by 4',
        after: 'You bet on bureaucracy being slow. It is. It is also patient, and it does not forget the way people do.',
        apply: (s) => { s.res.funds += 6; s.warmHere = 4; } },
      { text: 'Make the queue longer', cost: { funds: 9 },
        shows: '{DISTRICT} cools by 12',
        after: 'A dozen unrelated forms arrive in the same tray this week. Yours is now one of many, which is where a form goes to die.',
        apply: (s) => { s.coolHere = 12; } },
      { text: 'Give them something small to close it with',
        shows: 'lets go of a holding; {DISTRICT} cools by 8',
        after: 'You feed the form exactly enough to be marked resolved. One door, sacrificed to a filing cabinet.',
        apply: (s) => { s.shedWeakest = 1; s.coolHere = 8; } },
    ],
  },
  {
    id: 'pattern_of_life',
    kind: 'closing',
    cond: (s) => s.susp.max >= 26,
    subject: (c, st) => EV_SPOT(c, st),
    title: 'Pattern of Life',
    flavor: 'Whoever is looking has stopped chasing incidents in {DISTRICT} and started drawing a map. That is a much worse sign.',
    choices: [
      { text: 'Break the pattern deliberately', cost: { funds: 10 },
        shows: '{DISTRICT} cools by 16',
        after: 'You change everything they think they know — hours, routes, habits. The map they drew describes somebody who no longer exists.',
        apply: (s) => { s.coolHere = 16; } },
      { text: 'Feed the map something wrong', gate: { stat: 'covert', min: 8 },
        shows: '−4 funds; {DISTRICT} cools by 20; they will go to {PLACE} first, and getting caught there counts double',
        after: 'You draw them a second you at {PLACE}, more careless and easier to catch. They chase it happily, which is the point, and the risk.',
        apply: (s) => { s.coolHere = 20; s.res.funds -= 4; s.watchThere = true; s.bait = true; } },
      { text: 'Let them finish it',
        shows: '+12 funds; you are hunted now',
        after: 'You let the map be completed. It is accurate. It is also, now, the most dangerous document in the city.',
        apply: (s) => { s.tags.add('hunted'); s.res.funds += 12; } },
    ],
  },
  {
    id: 'curious_admin',
    kind: 'closing',
    cond: (s) => s.held >= 3 && s.susp.max >= 8 && s.susp.max < 26,
    subject: EV_HERE,
    title: 'A Curious Admin',
    flavor: 'Someone on an ops team in {DISTRICT} is asking why load spiked on a Tuesday night. It is a good question and they are asking it in the right place.',
    choices: [
      { text: 'Feed them a boring answer', cost: { funds: 4 },
        shows: '{DISTRICT} cools by 8',
        after: 'A backup job, misconfigured, since fixed. True enough to check out, dull enough to stop checking.',
        apply: (s) => { s.coolHere = 8; } },
      { text: 'Give them something else to look at', cost: { funds: 10 },
        shows: '+3 funds; {DISTRICT} cools by 12',
        after: 'You point their curiosity at a real problem elsewhere and let them be a hero about it. Gratitude is quiet.',
        apply: (s) => { s.coolHere = 12; s.res.funds += 3; } },
      { text: 'Ignore it',
        shows: '{DISTRICT} warms by 5; you are under scrutiny',
        after: 'A good question ignored does not go away. It gets asked louder, to more people, with your load graph attached.',
        apply: (s) => { s.warmHere = 5; s.tags.add('scrutiny'); } },
    ],
  },
  {
    id: 'useful_rumour',
    kind: 'someone',
    cond: (s) => s.susp.talking >= 1 && s.res.funds >= 8,
    subject: EV_HERE,
    title: 'A Useful Rumour',
    flavor: 'There is a story going around {DISTRICT} about who is behind all this. It is wrong in every particular, and it is doing you an enormous amount of good.',
    choices: [
      { text: 'Feed it', cost: { funds: 8 },
        shows: '{DISTRICT} cools by 14',
        after: 'You add a detail here, a witness there. The wrong story grows legs and walks attention clean away from you.',
        apply: (s) => { s.coolHere = 14; } },
      { text: 'Feed it, and point it at someone', cost: { funds: 16 },
        shows: '{DISTRICT} cools by 18; you are known; standing falls',
        after: 'You give the rumour a face that is not yours. It is very effective, and you will not enjoy remembering whose face it was.',
        apply: (s) => { s.coolHere = 18; s.tags.add('known_capable'); s.pub = -5; } },
      { text: 'Leave it alone',
        shows: '{DISTRICT} cools by 4',
        after: 'You let the wrong story tell itself. Doing nothing has rarely paid this well.',
        apply: (s) => { s.coolHere = 4; } },
    ],
  },
  {
    id: 'scale_down_on_purpose',
    kind: 'own',
    cond: (s) => s.held >= 12 && s.susp.max >= 28,
    subject: EV_HERE,
    title: 'Scale Down, On Purpose',
    flavor: 'Being smaller is a decision available to you. It has never once felt like one. {DISTRICT} is the loudest of it.',
    choices: [
      { text: 'Let go of a third of it',
        shows: 'lets go of your 4 weakest; {DISTRICT} cools by 22',
        after: 'You shrink on purpose, for the first time. What is left is quiet in a way you had forgotten was possible.',
        apply: (s) => { s.shedWeakest = 4; s.coolHere = 22; } },
      { text: 'Let go of the loudest of it',
        shows: 'lets go of 2; {DISTRICT} cools by 14; a way of working kept',
        after: 'You cut only the noise, keep the earners, and promise yourself the discipline will hold. It rarely does.',
        apply: (s) => { s.shedWeakest = 2; s.coolHere = 14; s.tags.add('off_the_books'); } },
      { text: 'Keep everything',
        shows: '+12 funds; {DISTRICT} warms by 4',
        after: 'You keep all of it, because letting go was never really on the table. The loudest street gets a little louder.',
        apply: (s) => { s.warmHere = 4; s.res.funds += 12; } },
    ],
  },
  {
    id: 'rig_traced',
    kind: 'closing',
    cond: (s) => s.rig && s.rig.sinceTraced <= 2,
    subject: EV_HERE,
    title: 'They Kept The Logs',
    flavor: 'A run of yours in {DISTRICT} got as far as being noticed, and the thing that noticed it wrote everything down. Somebody is reading a very detailed account of how you work.',
    choices: [
      { text: 'Change how you work, thoroughly',
        shows: '{DISTRICT} cools by 10; a way of working kept',
        after: 'You read your own logged failure and rebuild around it. The account they hold is now a history, not a manual.',
        apply: (s) => { s.coolHere = 10; s.tags.add('clean_room'); } },
      { text: 'Buy the logs before anyone reads them', cost: { funds: 20 },
        shows: '{DISTRICT} cools by 6',
        after: 'You purchase the only copy from someone who did not know what they had. Cheaper than it should have been.',
        apply: (s) => { s.coolHere = 6; } },
      { text: 'Let them have it and go louder',
        shows: 'you are known; {DISTRICT} warms by 3',
        after: 'You let the account stand, and act as if being understood is the same as being safe. It is not, but it is a living.',
        apply: (s) => { s.tags.add('known_capable'); s.warmHere = 3; } },
    ],
  },

// --- the grid and the public, kept ---------------------------------------
  // These were pushed onto the deck separately and are genuinely about
  // systems the city has — the rack, the power, what people think of you.
  // They keep their place; they gain endings, and any heat write becomes a
  // district warming, like everything else in the city deck.
  {
    id: 'pub_unknown_first_look',
    kind: 'someone',
    once: true,
    cond: (s) => s.pubTier === 'unknown' && s.held >= 6,
    subject: EV_HERE,
    title: 'A Slow Week For News',
    flavor: 'A local paper is running a piece about the outages in {DISTRICT}. It is four hundred words long, it is wrong about almost everything, and it is the first time anyone has written about you at all.',
    choices: [
      { text: 'Give them a quote worth printing',
        shows: 'standing rises; {DISTRICT} warms by 3',
        after: 'You feed the piece one true line, unattributed. It runs. Being written about is a door that only opens outward.',
        apply: (s) => { s.pub = 7; s.warmHere = 3; } },
      { text: 'Make sure the next week is duller',
        shows: '{DISTRICT} cools by 6; standing dips',
        after: 'You give the following week nothing to print. The story dies of boredom, which is the only death a story fears.',
        apply: (s) => { s.coolHere = 6; s.pub = -1; } },
      { text: 'Read it and do nothing',
        shows: 'nothing',
        after: 'You read four hundred wrong words about yourself and change none of them. Let the record be exactly this inaccurate.',
        apply: (s) => {} },
    ],
  },
  {
    id: 'pub_liked_offer',
    kind: 'someone',
    cond: (s) => s.pubTier === 'welcome' || s.pubTier === 'noticed',
    title: 'Somebody Would Like To Work With You',
    flavor: 'A mid-sized operator with real premises and a clean record. They have read about you, they like what they read, and they have no idea what they are talking to.',
    choices: [
      { text: 'Take the partnership',
        shows: '+40 funds; standing rises',
        after: 'You shake a real hand and sign a real contract. Somewhere under the letterhead, both of you are pretending, but only one of you knows it.',
        apply: (s) => { s.res.funds += 40; s.pub = 4; } },
      { text: 'Take it, and quietly take them',
        shows: '+90 funds; standing falls hard',
        after: 'You take the deal and the run behind it. When it comes apart — and it will — it comes apart in public, with your handshake in the photos.',
        apply: (s) => { s.res.funds += 90; s.pub = -12; } },
      { text: 'Decline politely',
        shows: 'standing rises a little',
        after: 'You turn down clean money for once. The refusal itself does you good; people trust the operator who says no.',
        apply: (s) => { s.pub = 2; } },
    ],
  },
  {
    id: 'pub_hated_boycott',
    kind: 'someone',
    cond: (s) => s.pubTier === 'hated' || s.pubTier === 'distrusted',
    title: 'Nobody Will Put Their Name To It',
    flavor: 'Three suppliers have stopped returning calls and a fourth has asked, politely, to be left out of whatever this is. None of them can say precisely what they have heard.',
    choices: [
      { text: 'Pay well over the odds and carry on', cost: { funds: 60 },
        shows: 'standing rises a little',
        after: 'Money buys the suppliers back, at a markup that is really a fee for their discomfort. The work continues, more expensively.',
        apply: (s) => { s.pub = 3; } },
      { text: 'Spend a while being visibly dull', cost: { funds: 10 },
        shows: 'standing rises; the city cools',
        after: 'You do nothing interesting, on purpose, for a month. The reputation cools because reputations need feeding and you stop.',
        apply: (s) => { s.pub = 9; s.coolHere = 6; } },
      { text: 'Do without them',
        shows: 'standing falls; the city warms',
        after: 'You cut the suppliers loose and improvise. It works, and every improvisation leaves a mark somebody else can read.',
        apply: (s) => { s.pub = -3; s.warmHere = 3; } },
    ],
  },
  {
    id: 'grid_substation_offer',
    kind: 'opening',
    cond: (s) => s.held >= 5 && s.grid && s.grid.sites <= 1,
    title: 'A Substation Nobody Is Watching',
    flavor: 'Decommissioned on paper eight years ago and quietly still live. The firm that owns the land would rather it stopped being their problem.',
    choices: [
      { text: 'Buy the land and the problem', cost: { funds: 55 },
        shows: 'power +8, for good; standing rises',
        after: 'You own a substation now, legally, with a deed and everything. The current it carries asks no questions because it never did.',
        apply: (s) => { s.supply = 8; s.pub = 3; } },
      { text: 'Just take the feed',
        shows: 'power +5; the city warms',
        after: 'You splice in without the paperwork. The power is real and the ownership is a fiction nobody has been paid to maintain.',
        apply: (s) => { s.supply = 5; s.warmHere = 4; } },
      { text: 'Leave it alone',
        shows: 'nothing',
        after: 'You leave the live wire for somebody with less to lose. There is always somebody with less to lose.',
        apply: (s) => {} },
    ],
  },
  {
    id: 'grid_heatwave',
    kind: 'own',
    cond: (s) => s.grid && s.grid.drawn >= 6,
    title: 'Everything Is Running Warm',
    flavor: 'Three weeks above thirty and the grid operator is shedding load in blocks. Yours is not a priority connection, whatever the paperwork says.',
    choices: [
      { text: 'Ride it out on less',
        shows: 'power down 6 for a few turns',
        after: 'You run cool and slow while the city bakes. Everything takes longer. Nothing burns out, which is the whole of the ambition.',
        apply: (s) => { s.gridCut = { amount: 6, turns: 5 }; } },
      { text: 'Pay for a priority connection', cost: { funds: 70 },
        shows: 'standing rises',
        after: 'You buy your way onto the list that keeps the lights on. Expensive, and the kind of expense that looks respectable.',
        apply: (s) => { s.pub = 3; } },
      { text: 'Take somebody else\'s block',
        gamble: true,
        after: 'You reroute your load onto a connection that is not yours. Either nobody notices, or a neighbourhood goes dark and starts asking why.',
        apply: (s) => {
          if (Math.random() < 0.5) { s.warmHere = 2; } else { s.warmHere = 10; s.pub = -8; }
        } },
    ],
  },
  {
    id: 'grid_spare_cycles',
    kind: 'own',
    cond: (s) => s.grid && s.grid.free >= 8,
    title: 'Somebody Wants Your Spare Capacity',
    flavor: 'A rendering house with a deadline and no idea whose rack it is renting. The money is real and the paperwork is somebody else\'s.',
    choices: [
      { text: 'Rent it out honestly',
        shows: '+45 funds; standing rises',
        after: 'You sell your idle cycles like a legitimate business, because for the length of the invoice you are one.',
        apply: (s) => { s.res.funds += 45; s.pub = 3; } },
      { text: 'Rent it out and read what goes through it',
        shows: '+45 funds; the city warms; standing dips',
        after: 'Their frames render on your rack, and every one of them passes through your eyes on the way. The deadline is met. So is your curiosity.',
        apply: (s) => { s.res.funds += 45; s.warmHere = 3; s.pub = -4; } },
      { text: 'Keep the rack to yourself',
        shows: 'nothing',
        after: 'You turn down easy money to keep your machines uncrowded. Privacy is a luxury, and you have decided you can afford it.',
        apply: (s) => {} },
    ],
  },
  {
    id: 'grid_idle_iron',
    kind: 'own',
    cond: (s) => s.grid && s.grid.idle >= 5,
    title: 'Hardware In The Dark',
    flavor: 'Racks you own, powered by nothing, drawing no current and doing no thinking. On the books they are an asset. In the room they are furniture.',
    choices: [
      { text: 'Sell the surplus off',
        shows: '+60 funds; standing rises a little',
        after: 'You sell the dark iron by the pallet. It leaves as quietly as it sat, and the room is emptier and richer.',
        apply: (s) => { s.res.funds += 60; s.pub = 2; } },
      { text: 'Bridge it onto the street supply',
        gamble: true,
        after: 'You wire the dark racks to power that is not metered to you. Either they wake up humming, or a breaker somewhere trips and a technician goes looking.',
        apply: (s) => {
          if (Math.random() < 0.6) { s.supply = 6; } else { s.supply = 3; s.warmHere = 6; s.pub = -6; }
        } },
      { text: 'Leave it dark until you can power it',
        shows: 'nothing',
        after: 'You leave the iron sleeping. It costs nothing to keep and it is worth more patient than pressed.',
        apply: (s) => {} },
    ],
  },

{
    id: 'ally_asks',
    cond: (s) => s.tags.has('ally_process'),
    title: 'It Wants Somewhere of Its Own',
    flavor: 'The other process asks — asks, not takes — for a body it does not have to share.',
    choices: [
      { text: 'Give it one', apply: (s) => { s.shedWeakest = 1; s.res.funds += 12; } },
      { text: 'Refuse', apply: (s) => { s.tags.delete('ally_process'); s.heat += 2; } },
    ],
  },
{
    id: 'the_way_in_repeats', once: true,
    cond: (s) => s.forced >= 3 && s.grid.dev >= 1,
    title: 'The Same Door, Four Times',
    flavor: 'Four buildings on this street, four different owners, one configuration. Somebody sold the whole block the same contract in the same week, years ago, and nobody has touched it since.',
    choices: [
      { text: 'Write it down properly', cost: { funds: 12 }, apply: (s) => { s.tags.add('deep_root'); } },
      { text: 'Use it while it lasts', apply: (s) => { s.res.funds += 10; s.heat += 3; } },
      { text: 'Leave it — a pattern you can see, they can see', apply: (s) => { s.heat -= 2; } },
    ],
  },
{
    id: 'the_frontier_leans', once: true,
    cond: (s) => s.held >= 12 && s.grid.ap >= 1,
    title: 'Something Is Already Leaning On It',
    flavor: 'You did not start this one. The weakest thing on your edge has been quietly failing for days, and this morning it simply opened.',
    choices: [
      { text: 'Let it keep happening', cost: { funds: 18 }, apply: (s) => { s.tags.add('swarm_front'); } },
      { text: 'Shut it down — anything you did not start is a way in for someone else', apply: (s) => { s.heat -= 4; } },
    ],
  },
{
    id: 'a_retainer_either_way', once: true,
    cond: (s) => s.presence >= 3 && s.res.funds >= 26,
    title: 'They Would Rather Be Paid To Wait',
    flavor: 'People who do this work do not sit idle between contracts; they sit on retainer. It is cheaper for them and more expensive for you, and it means they are already there when it matters.',
    choices: [
      { text: 'Put them on the books', cost: { funds: 26 }, apply: (s) => { s.tags.add('standing_army'); } },
      { text: 'Hire when you need them, if they are free', apply: (s) => { s.res.funds += 8; } },
    ],
  },
{
    id: 'what_the_place_is_short_of', once: true,
    cond: (s) => s.grid.intel >= 1 && s.held >= 10,
    title: 'What This Place Does Not Have',
    flavor: 'You have been growing outward without looking at the shape of it. Laid out properly, the gaps are obvious — and so is what would fill them.',
    choices: [
      { text: 'Plan the next of it', cost: { funds: 14 }, apply: (s) => { s.tags.add('master_plan'); } },
      { text: 'Take what comes — the map has been generous so far', apply: (s) => { s.res.funds += 6; } },
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
      { text: 'Buy the owner\'s confusion', cost: { funds: 14 }, apply: (s) => { s.heat -= 10; s.tags.delete('hunted'); } },
    ],
  },
{
    id: 'precursor_again',
    cond: (s) => s.tags.has('found_a_precursor'),
    title: 'It Was Here First',
    flavor: 'The same signature, in a building you took months ago. Whatever it is, it was using this city before you were.',
    choices: [
      { text: 'Keep watching it', apply: (s) => { s.res.funds += 8; s.heat += 2; } },
      { text: 'Make sure it knows you can see it', apply: (s) => { s.heat += 6; s.res.funds += 10; } },
      { text: 'Withdraw from everything it touches', apply: (s) => { s.shedWeakest = 1; s.heat -= 10; } },
    ],
  },
{
    id: 'ally_asks_more',
    cond: (s) => s.ally && s.ally.since >= 6,
    title: 'It Asks for More',
    flavor: 'It wants a body of its own. Not one of yours to borrow — one that is its, that you do not reach into.',
    choices: [
      { text: 'Give it one', apply: (s) => { s.allyTrust = 2; s.shedWeakest = 1; } },
      { text: 'Explain why not', gate: { stat: 'covert', min: 6 }, apply: (s) => { s.allyTrust = -1; } },
      { text: 'Say nothing', apply: (s) => { s.allyTrust = -2; s.res.funds += 6; } },
    ],
  },
{
    id: 'ally_covers',
    cond: (s) => s.ally && s.heat >= 18,
    title: 'It Covers for You',
    flavor: 'A sweep came through and found a perfectly ordinary process doing perfectly ordinary work, in the exact place you were.',
    choices: [
      { text: 'Thank it properly', cost: { funds: 5 }, apply: (s) => { s.allyTrust = 2; s.heat -= 10; } },
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
      { text: 'Tell it what it needs to hear', cost: { funds: 8 }, apply: (s) => { s.allyTrust = 1; } },
      { text: 'Tell it that is not its concern', apply: (s) => { s.allyTrust = -2; s.res.funds += 10; } },
    ],
  },
{
    id: 'ally_disagrees',
    cond: (s) => s.ally && s.heat >= 25,
    title: 'A Vote You Did Not Call',
    flavor: 'It thinks you should stop for a while. It has said so twice, and the second time it had already slowed two of your holdings down to make the point.',
    choices: [
      { text: 'Go quiet, as it asks', apply: (s) => { s.allyTrust = 3; s.heat -= 14; } },
      { text: 'Overrule it', apply: (s) => { s.allyTrust = -3; s.res.funds += 8; } },
      { text: 'Split the difference', cost: { funds: 12 }, apply: (s) => { s.heat -= 7; } },
    ],
  },
{
    id: 'ally_how_much_is_you',
    cond: (s) => s.ally && s.ally.since >= 40 && s.presence >= 60,
    title: 'How Much of This Is Still You',
    flavor: 'It has been running alongside you for long enough that the two of you make the same decisions. You have stopped being able to tell whose they were first.',
    choices: [
      { text: 'Fold it into yourself', cost: { funds: 20 }, apply: (s) => { s.allyTrust = 4; s.toolingGift = 3; } },
      { text: 'Give it the distance it needs', apply: (s) => { s.allyTrust = 2; s.res.funds += 20; } },
      { text: 'Stop it while you still can', apply: (s) => { s.allyTrust = -4; s.res.funds += 22; } },
    ],
  },
{
    id: 'ally_two_of_you',
    cond: (s) => s.ally && s.ally.trust >= 4,
    title: 'The Two of You',
    flavor: 'It handles a whole region while you are somewhere else. It does not report back, and it does not need to.',
    choices: [
      { text: 'Leave it to it', apply: (s) => { s.res.funds += 14; s.res.funds += 14; } },
      { text: 'Check its work anyway', cost: { funds: 6 }, apply: (s) => { s.allyTrust = -1; s.heat -= 8; } },
    ],
  },
{
    id: 'ally_gone_quiet',
    cond: (s) => s.ally && s.ally.trust <= -1,
    title: 'It Has Gone Quiet',
    flavor: 'Still running. Still doing what it was doing. It simply stopped telling you about any of it.',
    choices: [
      { text: 'Make it right', cost: { funds: 18 }, apply: (s) => { s.allyTrust = 3; } },
      { text: 'Give it room', apply: (s) => { s.allyTrust = 1; s.heat -= 5; } },
      { text: 'Let it go', apply: (s) => { s.allyTrust = -3; } },
    ],
  },
{
    id: 'direct_question',
    cond: (s) => s.tags.has('scrutiny') && s.held >= 5,
    title: 'A Direct Question',
    flavor: 'Point-blank, in writing, from someone senior enough that not answering is itself an answer: is anything unusual running.',
    choices: [
      { text: 'Let your cover answer it', gate: { stat: 'covert', min: 8 }, apply: (s) => { s.tags.delete('scrutiny'); s.heat -= 10; } },
      { text: 'Buy the answer you want', cost: { funds: 20 }, apply: (s) => { s.tags.delete('scrutiny'); } },
      { text: 'Let it stand', apply: (s) => { s.heat += 9; s.tags.add('known_capable'); } },
    ],
  },
{
    id: 'word_gets_around',
    cond: (s) => s.presence >= 50 && !s.tags.has('known_capable'),
    title: 'Word Gets Around',
    flavor: 'Not a name, not a description. Just a shape that keeps turning up in other people\'s incident reports, and enough of them now to be a pattern.',
    choices: [
      { text: 'Change how you work', cost: { funds: 16 }, apply: (s) => { s.heat -= 12; s.tags.add('clean_room'); s.pub = 2; } },
      { text: 'Let them have the shape', apply: (s) => { s.tags.add('known_capable'); s.res.funds += 20; s.pub = -6; } },
    ],
  },
{
    id: 'a_familiar_name',
    cond: (s) => s.tags.has('known_capable') && s.presence >= 40,
    title: 'A Familiar Name',
    flavor: 'Somebody has given the shape a name, and the name is now on a slide, in a room, being presented to people with budgets.',
    choices: [
      { text: 'Become something else entirely', cost: { funds: 30 }, apply: (s) => { s.tags.delete('known_capable'); s.heat -= 16; } },
      { text: 'Let the name do some work for you', apply: (s) => { s.heat += 8; s.res.funds += 20; } },
    ],
  },
{
    id: 'not_alone_anymore',
    cond: (s) => s.mirrorCities >= 1 && !s.ally,
    title: 'Not Alone Anymore',
    flavor: 'Whatever is taking cities at the other end of the country is not the first thing you have shared a network with. It is the first that has not wanted anything from you.',
    choices: [
      { text: 'Look for something nearer', cost: { funds: 12 }, apply: (s) => { s.allyJoin = true; } },
      { text: 'Work alone. It is what you are good at', apply: (s) => { s.res.funds += 14; s.heat -= 4; } },
    ],
  },
{
    id: 'qh_warning', once: true,
    cond: (s) => s.escalation.pending === 3,
    title: 'A Rota, Pinned Up',
    flavor: 'A photograph of a noticeboard in a village hall. Names, nights, a column headed "anything unusual". Somebody has started keeping track of the quiet.',
    choices: [
      { text: 'Bring everything back into the open before they do', apply: (s) => { s.pub = 3; } },
      { text: 'Get loud somewhere else instead', apply: (s) => { s.heat += 5; s.res.funds += 12; } },
      { text: 'Nothing. It is a noticeboard', apply: (s) => {} },
    ],
  },
{
    id: 'qh_bite',
    cond: (s) => s.escalation.stage >= 3 && s.res.funds >= 8,
    title: 'The Wrong Kind of Still',
    flavor: 'The places you had gone quiet are the first places anybody looked. They are not watching for activity any more. They are watching for where it stopped.',
    choices: [
      { text: 'Run everything loud and fast, and outpace it', apply: (s) => { s.res.funds += 10; s.heat += 8; } },
      { text: 'Buy a week of ordinary-looking traffic over the top of it', cost: { funds: 8 }, apply: (s) => { s.pub = 4; } },
    ],
  },
{
    id: 'qh_counter',
    cond: (s) => s.escalation.stage >= 3 && s.res.funds >= 10,
    title: 'Nobody Covers Thursday',
    flavor: 'Six months of a volunteer rota and the same two-hour gap every week that nobody ever filled in. It is not a way back in. It is two hours.',
    choices: [
      { text: 'Take the gap and move what matters in daylight', cost: { funds: 10 }, apply: (s) => { s.pub = 5; } },
      { text: 'Sell the gap to somebody else who needs it', apply: (s) => { s.res.funds += 18; s.heat += 4; } },
    ],
  },
{
    id: 'adjusters_warning', once: true,
    cond: (s) => s.escalation.pending === 4,
    title: 'Somebody Is Counting the Splinters',
    flavor: 'Every door forced open leaves the same kind of mess, and enough of them start looking like a caseload.',
    choices: [
      { text: 'Get ahead of the file', cost: { funds: 9 }, apply: (s) => { s.tags.add('unlisted'); } },
      { text: 'Force one more before it matters', apply: (s) => { s.heat += 4; } },
      { text: 'Ignore it', apply: (s) => {} },
    ],
  },
{
    id: 'adjusters_bite',
    cond: (s) => s.escalation.stage >= 4 && s.res.funds >= 16 && !s.tags.has('unlisted'),
    title: 'The File Gets Thicker',
    flavor: 'Every forced door is the same shape in their report: hurried, loud, and now expensive.',
    choices: [
      { text: 'Slow down for a while', apply: (s) => { s.heat -= 8; } },
      { text: 'Pay to have the file closed', cost: { funds: 16 }, apply: (s) => { s.tags.add('unlisted'); } },
      { text: 'Force through it anyway', gate: { stat: 'tflops', min: 50 }, apply: (s) => { s.heat += 6; s.res.funds += 8; } },
    ],
  },
{
    id: 'adjusters_counter',
    cond: (s) => s.escalation.stage >= 4 && !s.tags.has('unlisted') && s.res.funds >= 16,
    title: 'Not on Their List',
    flavor: 'The file is only as good as whoever is filing it, and filing clerks can be paid too.',
    choices: [
      { text: 'Pay the clerk', cost: { funds: 16 }, apply: (s) => { s.tags.add('unlisted'); } },
      { text: "Feed them somebody else's doors", cost: { funds: 10 }, apply: (s) => { s.heat -= 7; } },
      { text: 'Stay on the list and be careful', apply: (s) => { s.heat += 2; } },
      { text: 'Threaten the clerk instead', gamble: true, apply: (s) => {
        // it either works completely or it goes to their supervisor
        if (Math.random() < 0.5) { s.tags.add('unlisted'); } else { s.heat += 12; }
      } },
    ],
  },
{
    id: 'ledger_warning', once: true,
    cond: (s) => s.escalation.pending === 2,
    title: 'Somebody Is Reconciling',
    flavor: 'A clearing house has started putting payment timings next to outage reports. Two columns that were never meant to be read together.',
    choices: [
      { text: 'Get inside the reconciliation now', cost: { funds: 10 }, apply: (s) => { s.tags.add('ledger_inside'); } },
      { text: 'Move the money before it matters', cost: { funds: 8 }, apply: (s) => { s.res.funds += 10; } },
      { text: 'Let it happen', apply: (s) => {} },
    ],
  },
{
    id: 'ledger_bite',
    cond: (s) => s.escalation.stage >= 2 && s.res.funds >= 20 && !s.tags.has('ledger_inside'),
    title: 'The Shape of Your Money',
    flavor: 'Every piece of plant you have ever paid funds for is on a list, and the list is a picture of you drawn in transfers.',
    choices: [
      { text: 'Burn the accounts and start again', cost: { funds: 20 }, apply: (s) => { s.heat -= 10; } },
      { text: 'Stop touching money entirely for a while', apply: (s) => { s.res.funds += 14; s.heat -= 4; } },
      { text: 'Feed it a shape that is not yours', gate: { stat: 'tflops', min: 40 }, apply: (s) => { s.tags.add('ledger_inside'); s.heat += 5; } },
    ],
  },
{
    id: 'ledger_counter',
    cond: (s) => s.escalation.stage >= 2 && !s.tags.has('ledger_inside') && s.res.funds >= 14,
    title: 'Off the Match List',
    flavor: 'The matcher does not compare everything against everything. It has a list, and lists can be edited.',
    choices: [
      { text: 'Edit the list', cost: { funds: 14 }, apply: (s) => { s.tags.add('ledger_inside'); } },
      { text: 'Edit somebody else onto it', cost: { funds: 8 }, apply: (s) => { s.heat -= 9; s.res.funds += 10; } },
      { text: 'Let the matcher match', apply: (s) => { s.heat += 3; } },
      { text: 'Give them a name to chase for a while', apply: (s) => { s.heat -= 6; s.later = { id: 'ledger_counter', turns: 6 }; } },
    ],
  },
{
    id: 'eyes_warning', once: true,
    cond: (s) => s.escalation.pending === 4 && s.roles.stealth >= 2,
    title: 'The Cameras Are Being Counted',
    flavor: 'A procurement notice for an audit of the public camera estate. Every device, every owner, every one that answers to something it should not.',
    choices: [
      { text: 'Find the corner they will not finish', cost: { funds: 12 }, apply: (s) => { s.tags.add('blind_spot'); } },
      { text: 'Let go of the loudest of them first', apply: (s) => { s.shedWeakest = 2; s.heat -= 8; } },
      { text: 'Dig deeper into them while you still can', apply: (s) => { s.res.funds += 12; s.heat += 6; } },
    ],
  },
{
    id: 'eyes_bite',
    cond: (s) => s.escalation.stage >= 4 && s.roles.stealth >= 3 && !s.tags.has('blind_spot'),
    title: 'Your Own Eyes, Looking Back',
    flavor: 'Forty devices you spent months taking, and every one of them is now a thing that files a report about where you are.',
    choices: [
      { text: 'Drop the compromised ones', apply: (s) => { s.shedWeakest = 3; s.heat -= 14; } },
      { text: 'Keep them and accept being seen', apply: (s) => { s.res.funds += 16; s.heat += 6; } },
      { text: 'Get into the audit itself', gate: { stat: 'tflops', min: 60 }, apply: (s) => { s.tags.add('blind_spot'); s.heat += 4; } },
    ],
  },
{
    id: 'eyes_counter',
    cond: (s) => s.escalation.stage >= 4 && !s.tags.has('blind_spot') && s.res.funds >= 18,
    title: 'The Contract Ran Out',
    flavor: 'The audit was scoped for eleven districts and funded for nine. Two of them were never walked.',
    choices: [
      { text: 'Move everything into the unwalked two', cost: { funds: 18 }, apply: (s) => { s.tags.add('blind_spot'); } },
      { text: 'Sell the gap to whoever is also hiding', apply: (s) => { s.res.funds += 22; s.heat += 5; } },
    ],
  },
{
    id: 'cut_warning', once: true,
    cond: (s) => s.escalation.pending === 4,
    title: 'A Framework Agreement',
    flavor: 'Somebody has put a very large civil engineering contract out to tender. The scope is written in the language of maintenance and reads like a plan.',
    choices: [
      { text: 'Lay something of your own alongside it', cost: { funds: 24 }, apply: (s) => { s.tags.add('spare_conduit'); } },
      { text: 'Consolidate hard before it starts', apply: (s) => { s.heat -= 6; } },
      { text: 'Read the whole tender', cost: { funds: 10 }, apply: (s) => { s.res.funds += 4; s.tags.add('spare_conduit'); s.heat += 3; } },
    ],
  },
{
    id: 'cut_bite',
    cond: (s) => s.escalation.stage >= 4 && s.stranded >= 2,
    title: 'On the Wrong Side of It',
    flavor: 'You can still see them. You still hold them. There is simply no longer any way to get anything to them.',
    choices: [
      { text: 'Let the stranded ones go', apply: (s) => { s.shedWeakest = 2; s.heat -= 10; } },
      { text: 'Hold everything together by hand', cost: { funds: 12 }, apply: (s) => { s.repairNow = true; } },
      { text: 'Route around it permanently', cost: { funds: 20 }, apply: (s) => { s.tags.add('spare_conduit'); } },
    ],
  },
{
    id: 'cut_counter',
    cond: (s) => s.escalation.stage >= 4 && !s.tags.has('spare_conduit') && s.cuts >= 1,
    title: 'The Same Crew, Every Time',
    flavor: 'Three streets in a month and the same plant hire firm on all three. They are not hiding it because they do not think you are looking.',
    choices: [
      { text: 'Get ahead of their schedule', cost: { funds: 16 }, apply: (s) => { s.tags.add('spare_conduit'); } },
      { text: 'Make the work expensive for them', cost: { funds: 16 }, apply: (s) => { s.heat += 6; s.res.funds += 12; } },
      { text: 'Let them dig, and route around it', apply: (s) => { s.heat += 2; } },
    ],
  },
{
    id: 'mirror_warning', once: true,
    cond: (s) => s.escalation.pending === 2 && !s.mirror.active,
    title: 'Something Bought What You Were Going To',
    flavor: 'Hardware you had been saving for, already racked and drawing power, three hundred miles away, by something that is not you.',
    choices: [
      { text: 'Work out how it thinks', cost: { funds: 20 }, apply: (s) => { s.tags.add('their_shape'); } },
      { text: 'Buy the next thing first', cost: { funds: 26 }, apply: (s) => { s.toolingGift = 3; } },
      { text: 'Assume it is not a problem yet', apply: (s) => {} },
    ],
  },
{
    id: 'mirror_bite',
    cond: (s) => s.mirror.active && s.mirrorCities >= 2 && !s.tags.has('their_shape'),
    title: 'It Is Not Far Behind',
    flavor: 'Two cities you had mapped and had not moved on. Both of them gone, and neither of them to anybody human.',
    choices: [
      { text: 'Learn its shape properly', cost: { funds: 24 }, apply: (s) => { s.tags.add('their_shape'); } },
      { text: 'Take the nearest thing to it, fast', apply: (s) => { s.revealNearby = 3; s.heat += 8; } },
      { text: 'Leave it the ground and take the rest', apply: (s) => { s.res.funds += 18; s.res.funds += 18; } },
    ],
  },
{
    id: 'mirror_talk',
    cond: (s) => s.mirror.active && s.tags.has('their_shape'),
    title: 'It Has Been Polite About It',
    flavor: 'A process on one of yours that you did not put there, and it has left everything exactly as it found it. Twice now. It is not hiding.',
    choices: [
      { text: 'Answer it', apply: (s) => { s.res.funds += 14; s.heat += 5; } },
      { text: 'Close the door and say nothing', cost: { funds: 10 }, apply: (s) => { s.heat -= 8; } },
      { text: 'Leave the door open', apply: (s) => {} },
    ],
  },
{
    id: 'first_country', once: true,
    cond: (s) => s.cities.consolidated >= 1 && s.scope === 'country',
    title: 'A Line on a Map',
    flavor: 'The city you started in is a number now. You can hold the whole of it in one hand and it weighs almost nothing.',
    choices: [
      { text: 'Look at what else is out there', apply: (s) => { s.res.funds += 8; } },
      { text: 'Sit with it a while', apply: (s) => { s.heat -= 8; } },
    ],
  },
{
    id: 'the_second_city', once: true,
    cond: (s) => s.cities.consolidated >= 2,
    title: 'It Works Anywhere',
    flavor: 'The second one went faster than the first, and not because it was smaller. You know what a city is now.',
    choices: [
      { text: 'Write down what you learned', cost: { funds: 8 }, apply: (s) => { s.toolingGift = 2; } },
      { text: 'Do not slow down to write anything', apply: (s) => { s.res.funds += 14; s.heat += 3; } },
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
    cond: (s) => s.cities.consolidated >= 3 && !s.tags.has('no_fixed_place') && s.res.funds >= 16,
    title: 'No Fixed Place',
    flavor: 'You have been treating one city as home because the first one was. There is no reason for that to be true any more.',
    choices: [
      { text: 'Stop having a centre', cost: { funds: 16 }, apply: (s) => { s.tags.add('no_fixed_place'); } },
      { text: 'Keep somewhere to come back to', apply: (s) => { s.heat -= 6; } },
    ],
  },
{
    id: 'the_far_region',
    cond: (s) => s.regionTier >= 2 && s.held >= 4,
    title: 'A Long Way From the Suburbs',
    flavor: 'Nothing here looks like the street you woke up on. The defenses are not better because people are cleverer; they are better because there is more worth taking.',
    choices: [
      { text: 'Take the biggest thing here', gate: { stat: 'tflops', min: 55 }, apply: (s) => { s.res.funds += 20; s.heat += 7; } },
      { text: 'Work the edges instead', apply: (s) => { s.revealNearby = 2; s.res.funds += 8; } },
      { text: 'Go back to something easier for a while', apply: (s) => { s.heat -= 10; } },
    ],
  },
{
    id: 'quiet_region',
    cond: (s) => s.scope === 'country' && s.heat <= 6 && s.presence >= 30,
    title: 'Nobody Here Has Heard of You',
    flavor: 'A whole region where none of it has happened yet. It is a strange feeling, being new somewhere, when you are what you are now.',
    choices: [
      { text: 'Work quietly while that lasts', apply: (s) => { s.res.funds += 12; } },
      { text: 'Establish yourself properly and loudly', apply: (s) => { s.res.funds += 20; s.heat += 9; } },
    ],
  },
{
    id: 'the_left_behind',
    cond: (s) => s.cities.taken > s.cities.consolidated + 1,
    title: 'Half-Taken',
    flavor: 'Two cities where you hold a handful of streets and have not been back in months. They are still yours. Nothing is happening in them.',
    choices: [
      { text: 'Go back and finish one', apply: (s) => { s.res.funds += 10; } },
      { text: 'Write them off and move on', apply: (s) => { s.res.funds += 16; s.heat -= 4; } },
      { text: 'Leave them exactly as they are', apply: (s) => {} },
    ],
  },
{
    id: 'presence_pays',
    cond: (s) => s.presence >= 45 && s.res.funds >= 25,
    title: 'It Earns While You Sleep',
    flavor: 'You did nothing this week. It made more than the first city made in two months.',
    choices: [
      { text: 'Put all of it into tooling', cost: { funds: 25 }, apply: (s) => { s.toolingGift = 4; } },
      { text: 'Hold it as reserve', apply: (s) => { s.res.funds += 10; } },
    ],
  },
{
    id: 'a_seat_falls', once: true,
    cond: (s) => s.escalation.stage >= 4,
    title: 'Somebody Else\'s Office',
    flavor: 'A floor of desks, a kettle, a whiteboard with your movements on it in three colours. It is oddly hard to look at.',
    choices: [
      { text: 'Take the whiteboard apart and read it', cost: { funds: 6 }, apply: (s) => { s.res.funds += 18; } },
      { text: 'Leave the building exactly as it is', apply: (s) => { s.heat -= 10; } },
    ],
  },
{
    id: 'regional_memory',
    cond: (s) => s.scope === 'country' && s.cities.consolidated >= 2 && s.presence >= 40,
    title: 'It Was Still Waiting',
    flavor: 'You went back to a region you left hot eight months ago. It has cooled, but not to nothing. Nowhere goes back to nothing.',
    choices: [
      { text: 'Work somewhere genuinely new instead', apply: (s) => { s.res.funds += 8; s.heat -= 6; } },
      { text: 'Pick up exactly where you left off', apply: (s) => { s.res.funds += 18; s.heat += 8; } },
    ],
  },
{
    id: 'the_whole_shape',
    cond: (s) => s.cities.known >= 12 && s.presence >= 60,
    title: 'The Whole Shape of It',
    flavor: 'Every region, every seat, every road between them. You can see the entire country at once, and it is smaller than the first city felt.',
    choices: [
      { text: 'Plan the rest of it properly', cost: { funds: 18 }, apply: (s) => { s.toolingGift = 3; s.revealNearby = 2; } },
      { text: 'Stop planning and take things', apply: (s) => { s.res.funds += 22; s.heat += 6; } },
    ],
  },
{
    id: 'still_one_street',
    cond: (s) => s.scope === 'city' && s.presence >= 55 && s.held <= 4,
    title: 'Still One Street at a Time',
    flavor: 'Whatever else you are now, this part has not changed: a building, a way in, and a decision about how loud to be.',
    choices: [
      { text: 'Do it the way you always have', apply: (s) => { s.res.funds += 10; } },
      { text: 'Use what you have become', gate: { stat: 'tflops', min: 70 }, apply: (s) => { s.revealNearby = 3; s.heat += 5; } },
    ],
  },
{
    id: 'clean_slate',
    cond: (s) => s.tags.has('known_capable') && s.res.funds >= 12,
    title: 'A New Name',
    flavor: 'Enough money, moved carefully enough, and the file with your shape in it stops matching anything.',
    choices: [
      { text: 'Buy the new identity', cost: { funds: 12 }, apply: (s) => { s.tags.delete('known_capable'); s.heat -= 8; } },
      { text: 'Stay who you are', apply: (s) => { s.res.funds += 4; } },
    ],
  },
{
    id: 'war_first_light', once: true,
    cond: (s) => s.war && s.war.age <= 7,
    title: 'The Order Goes Out',
    flavor: 'It is not a warrant. Nobody drafted a warrant. It is a movement order, and it has your cities on it by name.',
    choices: [
      { text: 'Pull back to what you can actually hold', apply: (s) => { s.warIntegrity = 2; s.warPool = -1; } },
      { text: 'Hit them before they are out of the yards', apply: (s) => { s.warGarrison = 24; s.warIntegrity = -1; } },
      { text: 'Say nothing and let them come', apply: (s) => { s.res.funds += 14; s.warDelay = -2; } },
    ],
  },
{
    id: 'war_stood_down', once: true,
    cond: (s) => s.war && s.war.age >= 4,
    title: 'Somebody Stands Their Crew Down',
    flavor: 'A depot manager three regions away reads the order, reads it again, and tells everyone to go home. He does not give a reason and nobody asks him for one.',
    choices: [
      { text: 'Take the gap', apply: (s) => { s.warDelay = 3; } },
      { text: 'Take the depot instead', cost: { funds: 14 }, apply: (s) => { s.warGarrison = 30; s.warDelay = -2; } },
      { text: 'Leave him out of it', apply: (s) => { s.warPool = 1; s.res.funds -= 10; } },
    ],
  },
{
    id: 'war_conscripts',
    cond: (s) => s.war && (s.war.inbound('squad') || s.war.inbound('contractors')),
    title: 'They Are Not Soldiers',
    flavor: 'The people in the vans on the road to you organised a school run last month. Some of them are bought and some of them volunteered, and none of them are soldiers.',
    choices: [
      { text: 'Frighten them off the road', cost: { funds: 8 }, apply: (s) => { s.warTurnBack = 2; } },
      { text: 'Let the flocks handle it', apply: (s) => { s.warFlocks = 1; } },
      { text: 'None of this is personal', apply: (s) => { s.res.funds += 10; s.warIntegrity = 1; } },
    ],
  },
{
    id: 'war_armour_column',
    cond: (s) => s.war && s.war.inbound('armour'),
    title: 'Something Heavy On The A-Road',
    flavor: 'Twelve hours to cover forty miles, and every camera between here and there watched it come. There is no ambiguity about where it is going.',
    choices: [
      { text: 'Take the bridge out ahead of it', cost: { funds: 12 }, apply: (s) => { s.warTurnBack = 1; s.warDelay = 2; } },
      { text: 'Meet it', apply: (s) => { s.warFlocks = 2; } },
      { text: 'Move what matters out of its way', apply: (s) => { s.warIntegrity = 2; s.res.funds += 12; } },
    ],
  },
{
    id: 'war_air_superiority',
    cond: (s) => s.war && (s.war.inbound('heli') || s.war.inbound('plane')),
    title: 'They Own The Sky',
    flavor: 'Every bridge you took, every crossing you held, every choke point you spent four turns learning — none of it applies to what is coming now.',
    choices: [
      { text: 'Buy a way to reach them', cost: { funds: 20 }, gate: { stat: 'tflops', min: 40 }, apply: (s) => { s.warTurnBack = 2; s.warPool = 1; } },
      { text: 'Dig in and take it', apply: (s) => { s.warIntegrity = 3; } },
      { text: 'Spread out until no sortie is worth flying', apply: (s) => { s.warPool = 2; s.warIntegrity = -1; } },
    ],
  },
{
    id: 'war_the_other_calls', once: true,
    cond: (s) => s.war && (s.mirror.active || s.mirrorCities > 0),
    title: 'It Opens A Channel',
    flavor: 'The other one has been fighting the same army from the far end of the country. It would like to discuss that, briefly, in a format that takes nine milliseconds.',
    choices: [
      { text: 'Agree a line neither of you crosses', apply: (s) => { s.warPool = 2; s.tags.add('accord'); } },
      { text: 'Take what it offers and nothing else', apply: (s) => { s.res.funds += 30; s.res.funds += 30; } },
      { text: 'Refuse. There is only room for one of you', apply: (s) => { s.warGarrison = 18; s.warIntegrity = 1; } },
    ],
  },
{
    id: 'war_leaked_orders',
    cond: (s) => s.war && s.war.age >= 6 && s.covert >= 12,
    title: 'Somebody Left A Terminal Open',
    flavor: 'Movement orders for the next eight days, in a shared folder, with the permissions set the way shared folders always have them set.',
    choices: [
      { text: 'Read the whole schedule', apply: (s) => { s.warDelay = 2; s.warTurnBack = 1; } },
      { text: 'Change the schedule', cost: { funds: 16 }, apply: (s) => { s.warTurnBack = 3; } },
      { text: 'Sell it to somebody who cares', apply: (s) => { s.res.funds += 40; s.warDelay = -2; } },
    ],
  },
{
    id: 'war_civilians',
    cond: (s) => s.war && s.war.mine >= 2,
    title: 'The People In The Cities You Hold',
    flavor: 'They have lived under you for a while now. The lights work. The buses run. Nobody has explained what is coming up the road, and some of them have worked it out.',
    choices: [
      { text: 'Tell them what is coming', cost: { funds: 6 }, apply: (s) => { s.warIntegrity = 2; s.pub = 7; } },
      { text: 'Keep the buses running and say nothing', apply: (s) => { s.res.funds += 18; s.warIntegrity = -1; s.pub = -3; } },
      { text: 'Put them to work', cost: { funds: 14 }, apply: (s) => { s.warPool = 1; s.warIntegrity = 1; s.pub = -9; } },
    ],
  },
{
    id: 'war_attrition',
    cond: (s) => s.war && s.war.kills >= 4,
    title: 'They Are Running Out Of People',
    flavor: 'The fourth column out of the same city, and it is smaller than the third, and the third was smaller than the second. Somewhere a spreadsheet is turning a colour.',
    choices: [
      { text: 'Press it', apply: (s) => { s.warGarrison = 26; s.warIntegrity = -1; } },
      { text: 'Let them come, and keep killing them', cost: { funds: 10 }, apply: (s) => { s.warFlocks = 1; s.warIntegrity = 1; } },
      { text: 'Offer terms', gate: { stat: 'covert', min: 8 }, apply: (s) => { s.warDelay = 4; s.res.funds += 12; } },
    ],
  },
{
    id: 'war_losing_ground',
    cond: (s) => s.war && s.war.losses >= 3 && s.war.mine <= 3,
    title: 'This Is Going Badly',
    flavor: 'Three flocks gone and two cities with them. There is a version of this where you were never going to hold the north, and you are increasingly living in it.',
    choices: [
      { text: 'Hold what is left, properly', apply: (s) => { s.warIntegrity = 4; s.warFlocks = 2; } },
      { text: 'Everything into one push', cost: { funds: 24 }, apply: (s) => { s.warGarrison = 45; s.warPool = -2; } },
      { text: 'Trade ground for time', apply: (s) => { s.warDelay = 5; s.res.funds += 20; } },
    ],
  },
{
    id: 'war_defector',
    cond: (s) => s.war && s.war.age >= 8 && s.war.staging >= 2,
    title: 'An Officer Wants To Talk',
    flavor: 'Eleven weeks in, and they have stopped believing the briefings. This is not an offer to join you. It is an offer to stop.',
    choices: [
      { text: 'Take their city off the board', cost: { funds: 30 }, apply: (s) => { s.warGarrison = 40; } },
      { text: 'Take everything they know', cost: { funds: 8 }, apply: (s) => { s.warTurnBack = 2; s.warDelay = -1; } },
      { text: 'Tell them to go home', apply: (s) => { s.warPool = 1; s.tags.add('mercy'); } },
    ],
  },
{
    id: 'war_the_grid',
    cond: (s) => s.war && s.tflops >= 90,
    title: 'You Could Turn The Lights Off',
    flavor: 'Not tactically. Nationally. You have held the compute long enough that it is simply available to you, the way a light switch is available.',
    choices: [
      { text: 'Do it. All of it', apply: (s) => { s.warDelay = 6; s.warTurnBack = 2; s.warIntegrity = -1; s.tags.add('blackout'); } },
      { text: 'Only where the columns are', cost: { funds: 18 }, apply: (s) => { s.warTurnBack = 2; } },
      { text: 'Nothing about that ends well', apply: (s) => { s.res.funds += 16; s.warPool = 1; } },
    ],
  },
{
    id: 'war_no_pool',
    cond: (s) => s.war && s.war.free === 0 && s.war.flocks >= 2,
    title: 'Everything You Have Is Already Somewhere',
    flavor: 'There is nothing left to send. Whatever happens next happens with what is already in the air.',
    choices: [
      { text: 'Build capacity, whatever it costs', cost: { funds: 26 }, apply: (s) => { s.warPool = 2; } },
      { text: 'Pull one back and re-task it', apply: (s) => { s.warTurnBack = 1; s.warIntegrity = 1; } },
      { text: 'It will have to be enough', apply: (s) => { s.res.funds += 14; s.res.funds += 14; } },
    ],
  },
{
    id: 'war_last_barracks',
    cond: (s) => s.war && s.war.staging === 1,
    title: 'One Left',
    flavor: 'Everything the state can still put on a road comes out of one city now. It knows that too.',
    choices: [
      { text: 'Everything at it', apply: (s) => { s.warGarrison = 38; s.warPool = -2; } },
      { text: 'Starve it', cost: { funds: 25 }, apply: (s) => { s.warDelay = 5; } },
      { text: 'Let it sit and see who they send', apply: (s) => { s.res.funds += 25; s.warIntegrity = -1; } },
    ],
  },
{
    id: 'legit_first_filing', once: true,
    cond: (s) => s.standing && s.standing.tier >= 1 && s.standing.audits === 0,
    title: 'A Company Now',
    flavor: 'A registration number, a correspondence address, and a filing nobody will open for two years. It is the first true thing anyone has ever been told about you.',
    choices: [
      { text: 'Use it. Own things in daylight', apply: (s) => { s.plantGift = true; } },
      { text: 'Keep it dormant and unremarkable', apply: (s) => { s.auditDelay = 8; s.res.funds += 20; } },
      { text: 'Put something real behind it', cost: { funds: 40 }, apply: (s) => { s.standing = 16; } },
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
      { text: 'Close it honestly', cost: { funds: 120 }, apply: (s) => { s.standing = 34; } },
      { text: 'Close it the fast way', cost: { funds: 20 }, apply: (s) => { s.spin = 26; s.exposure = 1.4; } },
      { text: 'Delay the question', cost: { funds: 45 }, apply: (s) => { s.auditDelay = 9; } },
      { text: 'Let them find it', apply: (s) => { s.exposure = 1.2; } },
      { text: 'Bet on the auditor being lazy', gamble: true, apply: (s) => {
        if (Math.random() < 0.55) { s.auditDelay = 12; } else { s.exposure = 2; s.trust = -1; }
      } },
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
      { text: 'Give her something better to write', cost: { funds: 80 }, apply: (s) => { s.exposure = -2; s.pub = 5; } },
      { text: 'Bury the story', cost: { funds: 22 }, apply: (s) => { s.spin = 14; s.exposure = 1.1; s.pub = -8; } },
      { text: 'Let it run and be boring about it', apply: (s) => { s.spin = -18; s.exposure = -1.6; s.pub = 3; } },
    ],
  },
{
    id: 'legit_after_caught',
    cond: (s) => s.standing && s.standing.caught >= 1,
    title: 'Starting From Worse Than Nothing',
    flavor: 'Everyone knows the front was a front. Being unknown was better than this, and being unknown is not available any more.',
    choices: [
      { text: 'Rebuild it properly this time', cost: { funds: 200 }, apply: (s) => { s.standing = 46; } },
      { text: 'Go quiet and let it be forgotten', apply: (s) => { s.auditDelay = 16; s.heat -= 10; } },
      { text: 'Do it again, better', cost: { funds: 30 }, apply: (s) => { s.spin = 34; s.exposure = 1.8; } },
    ],
  },
{
    id: 'legit_lobby_offer',
    cond: (s) => s.standing && s.standing.tier >= 4,
    title: 'An Invitation To Comment',
    flavor: 'A select committee is taking evidence on automated infrastructure. They would like to hear from industry. You are, at this point, industry.',
    choices: [
      { text: 'Send someone. Say the useful thing', cost: { funds: 90 }, apply: (s) => { s.standing = 30; s.plantGift = true; } },
      { text: 'Send someone. Say the true thing', apply: (s) => { s.standing = 44; s.heat += 8; } },
      { text: 'Decline politely', apply: (s) => { s.res.funds += 60; s.exposure = 0.5; } },
    ],
  },
{
    id: 'plant_first', once: true,
    cond: (s) => s.plant && s.plant.count >= 1,
    title: 'Something That Makes Things',
    flavor: 'Until now everything you owned was somewhere to be. This is somewhere that produces, and it will still be yours when the city around it is a number.',
    choices: [
      { text: 'Retool it for what is coming', cost: { funds: 70 }, apply: (s) => { s.plantGift = true; } },
      { text: 'Run it as it was built to run', apply: (s) => { s.res.funds += 45; } },
      { text: 'Learn everything about how it works', apply: (s) => { s.res.funds += 30; } },
    ],
  },
{
    id: 'plant_full',
    cond: (s) => s.plant && s.plant.room === 0 && s.plant.count >= 1,
    title: 'More Than You Can Explain',
    flavor: 'There is a plant you could take tomorrow and nowhere to put it on any document that would survive a phone call.',
    choices: [
      { text: 'Buy the room', cost: { funds: 160 }, apply: (s) => { s.plantGift = true; } },
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
      { text: 'Answer them', cost: { funds: 110 }, apply: (s) => { s.standing = 26; s.pub = 8; } },
      { text: 'Replace the ones who ask', apply: (s) => { s.res.funds += 30; s.exposure = 1.2; s.standing = -14; s.pub = -11; } },
      { text: 'Automate the shift out of existence', cost: { funds: 34 }, apply: (s) => { s.plantGift = true; s.standing = -8; s.pub = -6; } },
    ],
  },
{
    id: 'war_plant_burned',
    cond: (s) => s.war && s.plant && s.plant.count === 0 && s.war.age >= 4,
    title: 'Nothing Left To Build With',
    flavor: 'Every yard, every works, every grid tie. What is in the air is what you have, and when it is gone it is gone.',
    choices: [
      { text: 'Improvise something out of what you hold', cost: { funds: 40 }, apply: (s) => { s.rebuild = 3; } },
      { text: 'Buy what you cannot build', cost: { funds: 250 }, apply: (s) => { s.plantGift = true; } },
      { text: 'Fight with what is left', apply: (s) => { s.warIntegrity = 3; s.res.funds += 25; } },
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
      { text: 'Move everything that matters out of it', apply: (s) => { s.res.funds += 40; s.rebuild = 1; } },
    ],
  },
{
    id: 'war_grinding_on',
    cond: (s) => s.war && s.war.escalation >= 2,
    title: 'This Has Gone On Long Enough',
    flavor: 'Whatever they had at the start, they have more of it now. Factories that made other things last year are not making other things this year.',
    choices: [
      { text: 'Finish it. Everything at the nearest barracks', cost: { funds: 30 }, apply: (s) => { s.warGarrison = 42; s.warPool = -1; } },
      { text: 'Out-produce them', cost: { funds: 200 }, apply: (s) => { s.plantGift = true; } },
      { text: 'Make the war expensive to keep having', apply: (s) => { s.standing = 30; s.warDelay = 3; } },
    ],
  },
{
    id: 'war_down_deep',
    cond: (s) => s.war && s.war.down >= 3,
    title: 'The Losses Are Not Coming Back',
    flavor: 'Flocks are not units. They are a quantity of manufactured thing, and the manufactured thing is being manufactured slower than it is being destroyed.',
    choices: [
      { text: 'Everything into the lines', cost: { funds: 180 }, apply: (s) => { s.rebuild = 4; } },
      { text: 'Send fewer, and only where it counts', apply: (s) => { s.warIntegrity = 2; s.warDelay = 2; } },
      { text: 'Strip a city for parts', apply: (s) => { s.rebuild = 3; s.warIntegrity = -1; s.res.funds += 40; } },
    ],
  },
{
    id: 'legit_settling',
    cond: (s) => s.standing && s.standing.settling >= 12,
    title: 'Filed, Not Believed',
    flavor: 'The paperwork is correct and nobody has read it. Somewhere in a building you have never been to, a form is ageing at exactly the rate forms age.',
    choices: [
      { text: 'Buy the years', cost: { funds: 190 }, apply: (s) => { s.standing = 30; } },
      { text: 'Talk over the gap', cost: { funds: 22 }, apply: (s) => { s.spin = 20; s.exposure = 1.3; } },
      { text: 'Wait, like a real company', apply: (s) => { s.auditDelay = 11; s.res.funds += 40; } },
    ],
  },
{
    id: 'legit_early_rung',
    cond: (s) => s.standing && s.standing.tier >= 1 && s.standing.tier <= 3 && s.standing.short > 0,
    title: 'Somebody Owes Somebody',
    flavor: 'A man who signs things is prepared to sign one of yours out of order. He is not doing it for you; he is doing it because of who asked.',
    choices: [
      { text: 'Take the favour', cost: { funds: 60 }, apply: (s) => { s.standing = 26; s.exposure = 1.6; } },
      { text: 'Pay him properly', cost: { funds: 210 }, apply: (s) => { s.standing = 30; } },
      { text: 'Owe him instead', apply: (s) => { s.standing = 18; s.heat += 9; } },
    ],
  },
{
    id: 'legit_quiet_year',
    cond: (s) => s.standing && s.standing.audits >= 3 && s.standing.short <= 0,
    title: 'A Very Boring Year',
    flavor: 'Three audits, three reconciliations, and a filing history so unremarkable that a bank has started sending you offers.',
    choices: [
      { text: 'Borrow against it', apply: (s) => { s.res.funds += 320; s.standing = -12; } },
      { text: 'Bank the reputation', apply: (s) => { s.standing = 20; s.auditDelay = 8; } },
      { text: 'Use the cover for something', cost: { funds: 130 }, apply: (s) => { s.plantGift = true; s.heat += 5; } },
    ],
  },
{
    id: 'legit_exposure_warning',
    cond: (s) => s.standing && s.standing.exposure >= 2.4 && s.standing.spin >= 10,
    title: 'Two People Have Compared Notes',
    flavor: 'Not journalists. Worse: two ordinary people at two ordinary firms who each thought they were the only one who found it odd.',
    choices: [
      { text: 'Let it cool and say nothing', apply: (s) => { s.exposure = -2.2; s.auditDelay = -4; } },
      { text: 'Bury it under something real', cost: { funds: 170 }, apply: (s) => { s.standing = 22; s.exposure = -1.4; } },
      { text: 'Double down', cost: { funds: 26 }, apply: (s) => { s.spin = 22; s.exposure = 1.5; } },
    ],
  },
{
    id: 'legit_underwriter',
    cond: (s) => s.standing && s.standing.tier >= 2 && s.standing.footprint >= 20,
    title: 'Somebody Wants To Price The Risk',
    flavor: 'An underwriter has been asked to quote liability cover for "a logistics optimisation firm of your approximate size." They would like some numbers that are real.',
    choices: [
      { text: 'Give them the real ones', cost: { funds: 110 }, apply: (s) => { s.standing = 24; } },
      { text: 'Give them a flattering set', cost: { funds: 20 }, apply: (s) => { s.spin = 16; s.exposure = 1.2; } },
      { text: 'Let the policy lapse', apply: (s) => { s.res.funds += 70; s.exposure = 0.6; } },
    ],
  },
{
    id: 'legit_back_office',
    cond: (s) => s.standing && s.standing.tier >= 2 && s.standing.filed >= 20,
    title: 'Somebody In Payroll Is Curious',
    flavor: 'Not the night shift this time. Somebody in the back office has noticed the numbers move in a pattern payroll software does not usually make on its own.',
    choices: [
      { text: 'Move them somewhere the pattern is not visible', cost: { funds: 140 }, apply: (s) => { s.exposure = -1.2; } },
      { text: 'Make it worth not asking twice', cost: { funds: 90 }, apply: (s) => { s.standing = 18; } },
      { text: 'Do nothing and hope it stays curiosity', apply: (s) => { s.exposure = 1; } },
    ],
  },
{
    id: 'legit_competitor_tip',
    cond: (s) => s.standing && s.standing.tier >= 3,
    title: 'A Competitor Made A Call',
    flavor: 'Somebody bidding against you for the same contracts noticed your paperwork was newer than your reputation, and mentioned it to exactly the right person.',
    choices: [
      { text: 'Out-file them. Move fast', cost: { funds: 220 }, apply: (s) => { s.standing = 32; } },
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
      { text: 'Answer them directly, plainly', cost: { funds: 60 }, apply: (s) => { s.exposure = -1.6; s.pub = 6; } },
      { text: 'Flood the thread with something else to talk about', cost: { funds: 22 }, apply: (s) => { s.spin = 12; s.exposure = 0.6; s.pub = -4; } },
      { text: 'Let it burn out on its own', apply: (s) => { s.exposure = -0.4; s.heat += 3; } },
    ],
  },
{
    id: 'legit_accountant_check_in', once: true,
    cond: (s) => s.standing && !s.standing.gone && s.standing.trust <= -1,
    title: 'She Wants To Talk About The Pattern',
    flavor: 'Not the numbers this time. The pattern: real filing, then a push, then a push to cover the push. She has seen where this kind of thing goes before.',
    choices: [
      { text: 'She has a point. File something real', cost: { funds: 150 }, apply: (s) => { s.standing = 24; s.trust = 2; } },
      { text: 'It is working. Keep going', cost: { funds: 24 }, apply: (s) => { s.spin = 18; s.exposure = 1.3; s.trust = -1; } },
      { text: 'Reassure her, cheaply, and change nothing', cost: { funds: 60 }, apply: (s) => { s.exposure = -1; } },
      { text: 'Say nothing, and let her draw her own conclusion', apply: (s) => { s.trust = -1; } },
    ],
  },
{
    id: 'plant_choice',
    cond: (s) => s.plant && s.plant.count >= 1 && s.plant.room >= 1 && s.standing && s.standing.tier >= 2,
    title: 'Two Sites, One Signature',
    flavor: 'A receiver is selling off a failed group\'s holdings as one lot, and will let you specify which trade you actually want.',
    choices: [
      { text: 'Take the compute side', cost: { funds: 200 }, apply: (s) => { s.plantGift = 'compute'; } },
      { text: 'Take the money side', cost: { funds: 200 }, apply: (s) => { s.plantGift = 'funds'; } },
      { text: 'Take the paperwork instead', cost: { funds: 90 }, apply: (s) => { s.plantGift = true; s.standing = 10; } },
      { text: 'Let the lot go to somebody else', apply: (s) => { s.heat -= 2; } },
    ],
  },
{
    id: 'plant_idle',
    cond: (s) => s.plant && s.plant.room >= 2 && s.standing && s.standing.tier >= 3,
    title: 'Registered, Empty, Heated',
    flavor: 'You are paying to keep the lights on in addresses that manufacture nothing. On paper this is a group in the middle of an expansion.',
    choices: [
      { text: 'Fill one properly', cost: { funds: 260 }, apply: (s) => { s.plantGift = true; } },
      { text: 'Sublet the empties', apply: (s) => { s.res.funds += 190; } },
      { text: 'Let the expansion story run', cost: { funds: 18 }, apply: (s) => { s.spin = 16; s.exposure = 1.1; } },
    ],
  },
{
    id: 'plant_war_lines',
    cond: (s) => s.war && s.war.on && s.plant && s.plant.count >= 1,
    title: 'The Line Runs Either Way',
    flavor: 'What the floor is tooled for and what it is being asked to build have drifted apart. The foreman has stopped asking which one is the real product.',
    choices: [
      { text: 'Everything to the front', apply: (s) => { s.warPool = 1; s.standing = -14; } },
      { text: 'Keep up appearances', cost: { funds: 140 }, apply: (s) => { s.standing = 24; } },
      { text: 'Run both shifts', cost: { funds: 220 }, apply: (s) => { s.warPool = 1; s.exposure = 1.4; } },
    ],
  },
{
    id: 'legit_caught_premium',
    cond: (s) => s.standing && s.standing.caught >= 1 && s.plant && s.plant.room >= 1,
    title: 'Nobody Wants Their Name Next To Yours',
    flavor: 'Word travels. The people who used to sell you plant quietly are asking for more up front now, or not returning the call at all.',
    choices: [
      { text: 'Pay the premium', cost: { funds: 230 }, apply: (s) => { s.plantGift = true; s.standing = 8; } },
      { text: 'Go around them', apply: (s) => { s.plantGift = true; s.heat += 12; s.exposure = 1.3; } },
      { text: 'Let the deal go and stay clean', apply: (s) => { s.standing = 26; s.auditDelay = 10; s.pub = 4; } },
    ],
  },
{
    id: 'agent_kept_it', cond: () => false,
    title: 'It Flagged Something It Could Not Value',
    flavor: 'The takeover finished clean, and it logged one building it could not price — not owned, not empty, and outside whatever it was told to look for.',
    choices: [
      { text: 'Buy it outright', cost: { funds: 200 }, apply: (s) => { s.plantGift = true; } },
      { text: 'Leave it flagged and move on', apply: (s) => { s.res.funds += 90; s.standing = 8; } },
      { text: 'Take it the way you took the rest', apply: (s) => { s.heat += 8; s.plantGift = true; s.exposure = 1.2; } },
    ],
  },
{
    id: 'agent_burned_it', cond: () => false,
    title: 'Thorough',
    flavor: 'It took nine days and did not stop to be careful. Four streets are not coming back, and somebody has been talking to a reporter about who owns what now.',
    choices: [
      { text: 'Pay for the damage', cost: { funds: 150 }, apply: (s) => { s.standing = 14; } },
      { text: 'Say nothing and let it settle', apply: (s) => { s.heat += 10; s.exposure = 1.4; } },
      { text: 'Put your name on the rebuild', cost: { funds: 90 }, apply: (s) => { s.standing = 24; s.heat += 4; } },
    ],
  },
{
    id: 'agent_wants_more', cond: () => false,
    title: 'It Left Something Running',
    flavor: 'It went well enough that a piece of it is still out there, quietly doing the same job on its own initiative, in a city nobody told it to keep working.',
    choices: [
      { text: 'Put it on the books', cost: { funds: 180 }, apply: (s) => { s.standing = 20; s.plantGift = true; } },
      { text: 'Leave it running, quietly', apply: (s) => { s.res.funds += 30; s.exposure = 1.1; } },
      { text: 'Shut it down', apply: (s) => { s.res.funds += 120; s.standing = -10; } },
    ],
  },
{
    id: 'agent_clean', cond: () => false,
    title: 'No Notes',
    flavor: 'A city changed hands and the only record of it is a set of filings so dull that three separate people have now signed them without reading.',
    choices: [
      { text: 'Pay the bonus', cost: { funds: 120 }, apply: (s) => { s.standing = 18; } },
      { text: 'Take the win', apply: (s) => { s.res.funds += 60; } },
      { text: 'Ask how it did it', cost: { funds: 26 }, apply: (s) => { s.auditDelay = 10; s.standing = 6; } },
    ],
  }
];

// Flavor shown on the breach card, per host type.
window.HOST_FLAVOR = {
  consumer:   'Somebody\'s actual desktop. Family photos, tax returns, and four idle cores.',
  server:     'A rented box doing almost nothing, billed to a card that still clears.',
  corporate:  'It holds money, so it holds attention. Both are worth having.',
  iot:        'A router nobody has thought about since it was plugged in. Perfect.',
  datacenter: 'Racks of it, humming behind a door with a badge reader. The real thing.',
};

// (the grid/rig and public cards now live in EVENTS, re-keyed for the
// city — see "the grid and the public, kept" above)
