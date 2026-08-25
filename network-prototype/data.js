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
  // how much of the city you have to hold before it is yours (was
  // COUNTRY.consolidateShare, back when a city was a node on a map)
  share: 0.55,
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

// --- postures -------------------------------------------------------------
// The dials retired as a UI. What replaced them is a stance: one of three
// named postures owns the allocation, splitting the rack by shares and
// leaving a stated slice loose for runs. Switching is a called card — the
// network changing posture is an event, and the effects still ramp, so the
// cost of changing your mind is still the turns in between. The dial
// mechanics stay underneath (posture: null = manual, for the engine).
window.POSTURES = {
  order: ['quiet', 'working', 'loud'],
  kinds: {
    quiet: {
      label: 'running quiet',
      shares: { covert: 0.45, intel: 0.15, dev: 0.10, ap: 0 },
      loose: 0.30,
      line: 'the street forgets you faster, the response drags its feet, and there is room to keep things hidden',
    },
    working: {
      label: 'the day job',
      shares: { covert: 0.20, intel: 0.10, dev: 0.25, ap: 0.15 },
      loose: 0.30,
      line: 'threads on the racks and tempo in the turn — the balanced hum of a network at work',
    },
    loud: {
      label: 'all hands',
      shares: { covert: 0, intel: 0.10, dev: 0.35, ap: 0.30 },
      loose: 0.25,
      line: 'every rack on the take — more actions, deeper threads, nothing spent on being forgettable',
    },
  },
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
// --- what a district can source (Act 2's materials) --------------------
// Suppliers are buildings, decided at generation like every other fact
// about the ground, and dormant until the act turns. Materials are cargo,
// never a currency chip: nothing here mints a number — a supplier is a
// place a delivery can start from, and cargo exists only in transit or at
// a site (W3/W4). The grid orange is Act 2's second thread, and it debuts
// on the supplier marks.
window.SOURCES = {
  // ONE cargo. Steel-versus-fabrication doubled every noun downstream —
  // suppliers, deals, stock lines, spine steps — and the decision it added
  // was nil: both were fetched the same way. The rework verdict: materials
  // are materials.
  kinds: {
    materials: { label: 'materials', line: 'steel, parts, tooling — everything a build eats' },
  },
  // how much of a district can source anything at all
  share: { industrial: 0.45, business: 0.40, commercial: 0.12, residential: 0 },
  trade: { industrial: 'materials', business: 'materials', commercial: 'materials' },
  // a city that cannot source cannot build — topped up at generation
  min: { materials: 5 },
  accent: '#e0803f',
  // the truck: what a dispatch costs, how much road a turn covers, and how
  // loudly a load rumbles through a street (warmDistrict doubles it in Act 2,
  // where trucks live — the chip quotes the doubled figure)
  // A truck carries two units (a lorry hauling one girder was always a bit
  // silly), and the fleet is finite: commercial jobs and supply runs fight
  // for the same cabs, which is the front system's real cap.
  truck: { funds: 2, speed: 520, warm: 0.5, load: 2 },
  fleet: 3,
  // The deal: a supplier you do not hold will sell to a stranger — at a
  // stranger's price. The door Act 2's abstraction always promised.
  dealMult: 3,
  // The haulage front: a legitimate business in a building you hold. Its
  // trucks run commercial jobs the city pays for; an earning run cools the
  // front's district (the street sees a working company), and the firm is
  // visible, exposed, and stops the moment its building is lost.
  front: { open: 10, payBase: 4, payPerTurn: 2, cool: 2, kinds: ['shop', 'office'] },
};

// --- W4: the works ------------------------------------------------------
// Four stages on the yard's own ground, each a previewed race: your turns
// against the street's notice. The rate rides the yard district's *felt*
// suspicion (a bait helps a building site — of course it does), and the
// projection the button quotes includes the noise the build itself makes.
// Red tape is a stall, never a loss: progress holds, the site waits for
// the street to cool. Power is a graph fact from the power stage on — a
// held path of streets from the yard to a grid building, cuttable like
// everything else.
window.WORKS = {
  stages: [
    { id: 'site',  label: 'the site',  funds: 6,  mat: 0, turns: 3 },
    { id: 'power', label: 'the power', funds: 8,  mat: 3, turns: 4, needsGrid: true },
    { id: 'line',  label: 'the line',  funds: 10, mat: 3, turns: 4 },
    { id: 'works', label: 'the works', funds: 12, mat: 3, turns: 5 },
  ],
  goal: 14,          // notice that brings the red tape
  // The power deal: no held path to a grid building? The utility will sell
  // you a metered hookup — a stranger's price per stage, stated on the
  // button. The deal covers both of Act 2's doors: suppliers and power.
  hookup: 6,
  noticeBase: 1,     // what a quiet street notices per turn of building
  noticeK: 0.15,     // ...plus this per point of felt suspicion
  warm: 0.5,         // the noise a build turn makes (doubled by Act 2 itself)
};

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
  // The two relief valves that are not cards, and what each one costs.
  //
  // Bait never lowers the number — it aims it. A baited district's suspicion
  // is *felt* baitDraw lower at every door except the bait's own building,
  // where it is felt baitDraw higher (the street is looking where you told it
  // to). A fraction, not a flat amount, so the help scales with the problem
  // and can never zero it: a third off 30 still leaves 20 doing its work.
  baitDraw: 1 / 3,
  baitFunds: 4,       // the props: a rigged lock, a light left on
  // Burning is the one act that lowers the number, and its price is a whole
  // building. 12 is one full band: a district at "everyone here is watching"
  // steps down to "the district is talking", never to silence.
  burnCool: 12,
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
  sweep: 'Look at what is next to what you already hold. Costs nothing and takes an action, and every scan puts a little heat on you. You can only see one step past your own territory — to see further, take more. The little arcs on a building mark a vantage whose scan would still find something new.',
  bait: 'Leave a door open on purpose. The street cannot resist an easy mark: a third of this district’s suspicion is felt at the bait instead of everywhere else, so doors elsewhere in the district notice you slower and the bait itself notices faster. Getting caught at the bait counts double toward the response. One bait per district, permanent, and rigging it is activity — the street notices a little.',
  burn: 'Torch a building you hold. Everything in it is gone for good — the machines, the income, the building itself. The street gets a different story to tell than yours, and the district cools by a large, stated amount. This is the one act that lowers the number, and its price is territory.',
  hide: 'Take a building of yours off their map. They cannot take what they cannot see — but keeping it hidden costs covert.ops every turn, and what you can no longer pay for comes back into view on its own.',
  yard: 'Break ground on a vacant lot — the dashed orange ground the map already has. The lot becomes the yard: the one place trucks back into, and the ground the works itself rises on. Pick it where the roads are kind, because a cut on the way means the long way round.',
  truck: 'Send a load from a supplier you hold to the yard, by road — never through buildings. The route, the turns and the streets that will hear it are stated before you pay. A cut street reroutes it; a street with no way round parks it.',
  front: 'Open a legitimate business in a shopfront or offices you hold — a place the street can walk into; a company nobody can visit is not a company. It offers real delivery jobs the city pays for — an earning run cools this district, because the street sees a working company instead of a mystery. Jobs occupy real trucks from the same fleet as your supply runs, and the firm is exposed: lose the building and the front goes with it.',
  build: 'Raise the next stage of the works on the lot. It costs funds and the yard\'s stock, takes stated turns, and the street notices every one of them — if notice reaches the red-tape line first, the site stalls until the street cools, keeping its progress. From the power stage on, the build needs a held path of streets to a grid building; cut it and the site waits.',
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
  // never a burned-out shell — a card promising a place has to promise one
  // that still answers
  const burned = (bid) => !!(((st && st.marks) || {})[bid] || {}).burned;
  const pool = ((st && st.buildings) || []).filter(b => b.district === dk && b.discovered && !burned(b.id));
  if (!pool.length) return { district: dk };
  const b = pool[Math.floor(Math.random() * pool.length)];
  return { buildingId: b.id, district: dk };
}
// Two open doors near each other, named when the card is dealt — the shared
// picker for every card whose choices are places. Same round, same van: the
// pair has to fit on screen at a readable zoom, so it is drawn from the four
// nearest open doors, preferring two different kinds so the names read as a
// choice between places rather than a riddle.
function EV_PAIR(c, st) {
  const scorched = (bid) => !!(((st && st.marks) || {})[bid] || {}).burned;
  const open = ((st && st.hosts) || []).filter(h => h.discovered && !h.owned && !h.origin && !scorched(h.buildingId));
  if (open.length < 2) return null;
  const bldg = (id) => ((st && st.buildings) || []).find(x => x.id === id);
  const kindOf = (h) => { const b = bldg(h.buildingId); return b ? b.kind : ''; };
  const i = Math.floor(Math.random() * open.length);
  const A = bldg(open[i].buildingId);
  if (!A) return null;
  const rest = open.filter((h, k) => k !== i).filter(h => bldg(h.buildingId));
  if (!rest.length) return null;
  const far = (h) => { const b = bldg(h.buildingId); return Math.hypot(b.x - A.x, b.y - A.y); };
  const nearest = rest.slice().sort((p, q) => far(p) - far(q)).slice(0, 4);
  const unlike = nearest.filter(h => kindOf(h) !== kindOf(open[i]));
  const pool = unlike.length ? unlike : nearest;
  const other = pool[Math.floor(Math.random() * pool.length)];
  return [open[i].buildingId, other.buildingId];
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
  watched_roads:  { label: 'watched roads', turns: 10,
                    desc: 'the council is counting lorries — your trucks drive at two-thirds speed while it lasts' },
};

// --- the faces ------------------------------------------------------------
// Recurring people with memory. Stance is a small serialized integer per
// face (-3..3); the line under their name says where you stand, in words,
// and the deck reads the number. A living world is mostly people who come
// back with the stance you earned.
window.FACES = {
  fixer: { label: 'the fixer', lines: {
    warm: 'he owes you, and knows it', kind: 'he remembers you kindly',
    neutral: 'you are a customer, so far', cool: 'he counts the money twice',
    hostile: 'he is done with you' } },
  inspector: { label: 'the inspector', lines: {
    warm: 'your file is thin, on purpose', kind: 'she files you under routine',
    neutral: 'she has a file on you', cool: 'your file has a flag on it',
    hostile: 'she is building a case' } },
  journalist: { label: 'the journalist', lines: {
    warm: 'you are a source now', kind: 'she owes you a story',
    neutral: 'she has seen your shape', cool: 'she is asking about you',
    hostile: 'you are the story' } },
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
// --- the batch for the machine -------------------------------------------
// Written after the engine outran the content: cards that spend the pair
// question, the marks, the rules, the bank and the non-funds prices, where
// the fiction earns them. Every choice previews and resolves, none touches
// heat, and nothing here adds a meter.
{
    id: 'the_audit',
    kind: 'closing',
    cond: (s) => s.susp.talking >= 1 && s.frontier >= 2,
    pair: EV_PAIR,
    title: 'One File, Two Addresses',
    flavor: 'A council inspector is working through the ward with a folder that has {A} and {B} in it. There is budget to make exactly one of them boring before she arrives.',
    choices: [
      { text: 'Make {PLACE} boring',
        shows: '{DISTRICT} cools by 5, from {SUSP}; they keep an eye on {OTHER} from now on',
        after: 'Paperwork appears, tidy and dull, and the inspector moves on. The folder keeps one address in it, underlined.',
        apply: (s) => { s.coolHere = 5; s.markOther = { watchThere: true }; } },
    ],
  },
{
    id: 'roadworks',
    kind: 'opening',
    cond: (s) => s.frontier >= 2 && s.held >= 4,
    pair: EV_PAIR,
    title: 'One Crew, Two Work Orders',
    flavor: 'The council has money to dig up exactly one street this quarter: outside {A}, or outside {B}. The foreman is easy to talk to.',
    choices: [
      { text: 'Send the crew to {PLACE}',
        shows: 'a new way through at {PLACE}, permanently; a street at {OTHER} closes for good',
        after: 'They leave a duct where you asked and a trench where you did not. Both outlast everyone who remembers why.',
        apply: (s) => { s.openLink = 1; s.markOther = { cutLink: 1 }; } },
    ],
  },
{
    // The fixer's introduction. He cuts keys for half the district and
    // writes every job in a book; the book is the business. Shorting him is
    // the deck's first taught lesson in consequence: the sequel is named on
    // the choice, and it arrives.
    id: 'locksmiths_ledger',
    kind: 'someone',
    face: 'fixer',
    covenant: ['person', 'sequel'],
    cond: (s) => s.held >= 4 && s.turn >= 8,
    subject: (c, st) => EV_SPOT(c, st),
    title: 'The Locksmith\u2019s Ledger',
    flavor: 'He cuts keys for half of {DISTRICT} and writes every job in a book. The book is the business. Today he is selling a key you want, and watching you decide what kind of customer you are.',
    choices: [
      { text: 'Pay his price', cost: { funds: 6 },
        shows: '+1 set of keys',
        after: 'Brass changes hands. He writes the job in the book, the way he writes everything in the book.',
        apply: (s) => { s.keys = (s.keys || 0) + 1; } },
      { text: 'Pay for the page too', cost: { funds: 10 },
        shows: '+1 set of keys \u00b7 your jobs leave his book, and the fixer remembers',
        after: 'He tears the page out and burns it in the ashtray while you watch. That is what the extra buys: a witness who chose not to be one.',
        apply: (s) => { s.keys = (s.keys || 0) + 1; s.face = { who: 'fixer', by: 1 }; } },
      { text: 'Take the key and pay him never',
        shows: '+1 set of keys \u00b7 the book changes hands within the week \u2014 it will be about your doors',
        after: 'He counts it twice, says nothing, and writes a little longer than usual. You know exactly what you just bought, and it was not the key.',
        apply: (s) => { s.keys = (s.keys || 0) + 1; s.face = { who: 'fixer', by: -2 };
          s.later = { id: 'book_changes_hands', minTurns: 4, maxTurns: 8, subject: { district: s.here } }; } },
    ],
  },
{
    // The sequel the shorted fixer named. Dealt by the planted queue only.
    id: 'book_changes_hands',
    kind: 'closing',
    face: 'fixer',
    tier: 'incident',
    covenant: ['map', 'person'],
    once: true,
    cond: () => false,
    title: 'The Book Changes Hands',
    flavor: 'The ledger got sold to someone who reads. Every door you keyed in {DISTRICT} is a line in it, and the lines join up.',
    choices: [
      { text: 'Buy it back at the new price', cost: { funds: 14 },
        shows: 'the book burns \u00b7 nothing else changes hands',
        after: 'It costs what it costs. You burn it unread, which the seller finds hilarious and you find necessary.',
        apply: () => {} },
      { text: 'Let them read',
        shows: 'every door in {DISTRICT} hardens by 2, for good \u00b7 the fixer is done with you \u00b7 the city thinks less of whoever this is',
        after: 'A week later every lock you knew the shape of has been changed. The new ones are better, and everyone on the street knows why they needed to be.',
        apply: (s) => { s.hardenDistrict = 2; s.pub = -5; s.face = { who: 'fixer', by: -3 }; } },
    ],
  },
{
    // Reaction: your burn, remembered by the street that watched it.
    id: 'the_vigil',
    kind: 'someone',
    tier: 'incident',
    covenant: ['map', 'person'],
    cond: (s) => s.act >= 1 && s.ledger('burn', 4).length > 0,
    subject: (c, st) => {
      const e = c.ledger('burn', 4).slice(-1)[0];
      return e ? { buildingId: e.bid, district: e.dk } : null;
    },
    title: 'The Vigil',
    flavor: 'Candles on the pavement outside the shell of {PLACE}. The street is telling itself the story again, out loud, to see if it holds.',
    choices: [
      { text: 'Send flowers, no name',
        shows: '{DISTRICT} cools by 3, from {SUSP} \u00b7 the journalist hears about the fire',
        after: 'The story settles into accident, the way stories do when somebody grieves correctly. One reporter keeps a candle stub in an envelope.',
        apply: (s) => { s.coolHere = 3; s.face = { who: 'journalist', by: 1 }; } },
      { text: 'Stay away',
        shows: 'the two buildings beside the shell harden by 2, for good \u00b7 the city thinks less of whoever this is',
        after: 'Nobody grieves, so the neighbours organise instead. New locks, new lights, a list of number plates, and a story about the kind of thing that does this.',
        apply: (s) => { s.hardenNeighbours = 2; s.pub = -4; } },
    ],
  },
{
    // Reaction: your trucks, counted by the street they use.
    id: 'pothole_petition',
    kind: 'opening',
    covenant: ['rule', 'person'],
    cond: (s) => {
      const by = {};
      s.ledger('transit', 4).forEach(e => { by[e.dk] = (by[e.dk] || 0) + 1; });
      return Object.values(by).some(n => n >= 3);
    },
    subject: (c) => {
      const by = {};
      c.ledger('transit', 4).forEach(e => { by[e.dk] = (by[e.dk] || 0) + 1; });
      const dk = Object.keys(by).sort((a, b) => by[b] - by[a])[0];
      return dk ? { district: dk } : null;
    },
    title: 'The Pothole Petition',
    flavor: 'Somebody counted the lorries. There is a clipboard going door to door in {DISTRICT}, and your name is not on it yet.',
    choices: [
      { text: 'Pay for the resurfacing', cost: { funds: 8 },
        shows: '{DISTRICT} cools by 2, from {SUSP} \u00b7 the trucks keep their speed',
        after: 'A crew you never meet fills the holes your fleet made. The clipboard declares victory and goes home.',
        apply: (s) => { s.coolHere = 2; } },
      { text: 'Let the council wake up about lorries',
        shows: 'your trucks drive at two-thirds speed for 10 turns',
        after: 'Cameras on poles, a man with a speed gun. Everything still moves; everything moves slower.',
        apply: (s) => { s.rule = { id: 'watched_roads', turns: 10 }; } },
      { text: 'Ignore it',
        shows: '+3 suspicion in {DISTRICT}, from {SUSP} \u00b7 the inspector gets a copy',
        after: 'The petition gets photographed, stapled, and filed by somebody who files things where she can find them.',
        apply: (s) => { s.warmHere = 3; s.face = { who: 'inspector', by: -1 }; } },
    ],
  },
{
    // The inspector, at the works fence, while a stage is on the scaffolds.
    id: 'clipboard',
    kind: 'closing',
    face: 'inspector',
    covenant: ['rule', 'person'],
    cond: (s) => s.act >= 2 && s.works.building,
    subject: (c) => (c.works.district ? { district: c.works.district } : null),
    title: 'Clipboard',
    flavor: 'A woman at the gate with a laminate and all day. She has questions about the crane, and she is not asking them loudly yet.',
    choices: [
      { text: 'Show her the company',
        need: (c) => c.fronts > 0, needText: 'needs a front',
        shows: 'the stage on the scaffolds finishes tape-proof \u00b7 the inspector remembers a real business',
        after: 'Invoices, a sign, a firm that runs jobs the city can see. She reads it twice and closes the folder. Paper beats questions.',
        apply: (s) => { s.tapeProofNow = true; s.face = { who: 'inspector', by: 1 }; } },
      { text: 'The envelope', cost: { funds: 8 },
        shows: 'she goes away \u00b7 a paid inspector is a page in somebody\u2019s file',
        after: 'She takes it the way people take things they have taken before. The gate closes. Somewhere, a page turns over.',
        apply: (s) => { s.face = { who: 'inspector', by: -1 }; } },
      { text: 'Turn her away at the fence',
        shows: 'the build holds 1 turn \u00b7 +3 suspicion in {DISTRICT}, from {SUSP}',
        after: 'She leaves without arguing, which is worse. The crane stands still for a day while everyone on the street watches it not move.',
        apply: (s) => { s.buildDelay = 1; s.warmHere = 3; } },
    ],
  },
{
    // The journalist, once the city has an opinion to have.
    id: 'column_inches',
    kind: 'someone',
    face: 'journalist',
    covenant: ['map', 'person'],
    cond: (s) => s.pubTier !== 'unknown' || s.faces.journalist !== 0,
    subject: (c) => {
      const shell = c.shells.slice(-1)[0];
      if (shell) return { buildingId: shell.bid, district: shell.dk };
      return c.susp.warmest ? { district: c.susp.warmest } : null;
    },
    title: 'Column Inches',
    flavor: 'She has the outage map on her wall and it is starting to look like a shape. She would rather print a better story, if somebody gave her one.',
    choices: [
      { text: 'Give her the fire',
        need: (c) => c.shells.length > 0, needText: 'needs a burned shell to point at',
        shows: '{DISTRICT} cools by 5, from {SUSP} \u00b7 the fire is fact now, in ink',
        after: 'ARSON QUESTIONS gets the front of the local section. It is a better story than yours, which is the whole point of giving it to her.',
        apply: (s) => { s.coolHere = 5; s.face = { who: 'journalist', by: 1 }; } },
      { text: 'Give her nothing',
        shows: 'she keeps digging: your warmest held building is watched, for good \u00b7 the city thinks less of whoever this is',
        after: 'She thanks you for your time in a way that means the opposite. The piece runs anyway, built out of the outage map and a shrug. The next photograph on her wall is one of yours.',
        apply: (s) => { s.watchWarmest = true; s.pub = -6; s.face = { who: 'journalist', by: -1 }; } },
      { text: 'Give her the works',
        need: (c) => c.works.groundBroken, needText: 'needs ground broken',
        shows: 'the factory has a name in print \u00b7 public standing rises',
        after: 'LOCAL FIRM BUILDS is not a headline anyone frames, but it is the first time the city has been told what you are on your own terms.',
        apply: (s) => { s.pub = 6; s.face = { who: 'journalist', by: 1 }; } },
    ],
  },
{
    // The world moves without you: a building on the market, going one way
    // or the other whether or not you act. The map changes either way.
    id: 'sold_for_parts',
    kind: 'opening',
    tier: 'incident',
    covenant: ['map'],
    cond: (s) => s.turn >= 10,
    subject: (c, st) => {
      const marks = (st && st.marks) || {};
      const dead = (bid) => !!(marks[bid] || {}).burned;
      const held = (b) => (st.hosts || []).some(h => h.buildingId === b.id && h.owned);
      const pool = (st.buildings || []).filter(b => b.discovered && !dead(b.id) && !held(b)
        && (st.hosts || []).some(h => h.buildingId === b.id && !h.origin));
      if (!pool.length) return null;
      const b = pool[Math.floor(Math.random() * pool.length)];
      return { buildingId: b.id, district: b.district };
    },
    title: 'Sold For Parts',
    flavor: 'Word is {PLACE} is going on the market. The kind of buyer who is circling does not keep tenants, or wiring.',
    choices: [
      { text: 'Outbid them', cost: { funds: 12 },
        shows: 'its doors soften by 3 \u00b7 a take there is paid for, banked',
        after: 'You buy it the boring way, through three names none of which are yours. The keys arrive by post.',
        apply: (s) => { s.hardenThere = -3; s.bank = 'free_take'; } },
      { text: 'Let it happen',
        shows: '{PLACE} boards up for good \u2014 everything in it leaves the map',
        after: 'The vans take a week. Then plywood, then silence. The street has one more dark window and you watched it happen.',
        apply: (s) => { s.boardUp = true; } },
      { text: 'Tip off the tenants', cost: { funds: 4 },
        shows: 'they dig in: {PLACE} hardens by 2 \u00b7 {DISTRICT} cools by 2, from {SUSP}',
        after: 'A lawyer you paid for stands in a doorway reading from a folder. The circling buyer stops circling. The street remembers who knew first.',
        apply: (s) => { s.hardenThere = 2; s.coolHere = 2; } },
    ],
  },
{
    // --- the called cards: the works' big verbs, dealt by their buttons ---
    // Player-called, never drawn: the button on the lot deals this face-up,
    // instantly. The card is the ceremony and the dilemma; the mechanics are
    // the ones the panel used to hold. Every called card keeps a free
    // walk-away choice — a ceremony you cannot leave is a trap.
    id: 'breaking_ground',
    kind: 'own',
    tier: 'incident',
    called: true,
    covenant: ['map'],
    cond: () => false,
    title: 'Breaking Ground',
    flavor: 'Open ground in {DISTRICT}, a chain-link plan, and a morning when this stops being reversible. However it is done, from here the city is watching what goes up.',
    choices: [
      { text: 'Break it at dawn, openly', cost: { ap: 1, funds: 6 },
        shows: 'the lot is the yard \u00b7 the site goes up in 3 turns \u00b7 {DISTRICT} warms 1 per build turn, from {SUSP}',
        after: 'By eight there are vans, by nine there is a hole, by ten there is a story on the street with your shape in it. Ground broken.',
        apply: (s) => { s.breakGround = { quiet: false }; } },
      { text: 'Break it at night, quietly', cost: { ap: 1, funds: 10 },
        shows: 'the lot is the yard \u00b7 the site goes up in 3 turns \u00b7 the street hears nothing while it builds',
        after: 'Lights on poles, tarps on the fence, a crew paid to be forgettable. The hole is there by morning and nobody saw it arrive.',
        apply: (s) => { s.breakGround = { quiet: true }; } },
      { text: 'Not yet',
        shows: 'the ground keeps',
        after: 'The lot stays a lot. The plan stays a plan. Nothing is spent, and nothing is watching.',
        apply: () => {} },
    ],
  },
{
    id: 'raise_power',
    kind: 'own',
    called: true,
    covenant: ['map'],
    cond: () => false,
    title: 'The Power Stage',
    flavor: 'The site wants current. There is a right way, over streets you hold, and there is the meter \u2014 the utility sells to strangers at a stranger\u2019s price and does not ask whose streets those are.',
    choices: [
      { text: 'On your own power', cost: { ap: 1, funds: 8, materials: 3 },
        need: (c) => c.works.powered, needText: 'needs a held street path to a grid building',
        shows: 'the power goes up in 4 turns \u00b7 {DISTRICT} warms 1 per build turn, from {SUSP} \u00b7 a cut on the path stalls it',
        after: 'Cable runs over ground you answer for. Cheaper, and yours \u2014 as long as the streets stay yours.',
        apply: (s) => { s.raiseStage = { stage: 1, metered: false }; } },
      { text: 'On the meter', cost: { ap: 1, funds: 14, materials: 3 },
        need: (c) => !c.works.powered, needText: 'you hold a path \u2014 the meter is for strangers',
        shows: 'the power goes up in 4 turns \u00b7 {DISTRICT} warms 1 per build turn, from {SUSP} \u00b7 metered: no cut can stall it',
        after: 'The utility takes its money and connects the site. Metered power hums, indifferent to whose streets are whose.',
        apply: (s) => { s.raiseStage = { stage: 1, metered: true }; } },
      { text: 'Let it wait',
        shows: 'the site keeps',
        after: 'The scaffolds stand empty another week. Waiting costs nothing but time.',
        apply: () => {} },
    ],
  },
{
    id: 'raise_line',
    kind: 'own',
    called: true,
    covenant: ['map'],
    cond: () => false,
    title: 'The Line',
    flavor: 'Racks, belts, and the machines the trucks have been feeding the yard for. When this stands, the works stops being a hole with a fence and starts being a thing with a purpose.',
    choices: [
      { text: 'Raise it on your own power', cost: { ap: 1, funds: 10, materials: 3 },
        need: (c) => c.works.powered, needText: 'needs a held street path to a grid building',
        shows: 'the line goes up in 4 turns \u00b7 {DISTRICT} warms 1 per build turn, from {SUSP} \u00b7 a cut on the path stalls it',
        after: 'The belts go in crooked and get shimmed true. It looks like a factory now, to anyone who climbs the fence to ask.',
        apply: (s) => { s.raiseStage = { stage: 2, metered: false }; } },
      { text: 'Raise it on the meter', cost: { ap: 1, funds: 16, materials: 3 },
        need: (c) => !c.works.powered, needText: 'you hold a path \u2014 the meter is for strangers',
        shows: 'the line goes up in 4 turns \u00b7 {DISTRICT} warms 1 per build turn, from {SUSP} \u00b7 metered: no cut can stall it',
        after: 'The belts go in under rented light. The invoice is a number you chose not to argue with.',
        apply: (s) => { s.raiseStage = { stage: 2, metered: true }; } },
      { text: 'Let it wait',
        shows: 'the site keeps',
        after: 'The crates stay stacked. The yard holds what the yard holds.',
        apply: () => {} },
    ],
  },
{
    id: 'raise_works',
    kind: 'own',
    called: true,
    covenant: ['map'],
    cond: () => false,
    title: 'The Works',
    flavor: 'The last stage: walls around the line, a roof over the walls, and a name over the door. Five turns of the loudest work yet, and then the lights come on.',
    choices: [
      { text: 'Raise it on your own power', cost: { ap: 1, funds: 12, materials: 3 },
        need: (c) => c.works.powered, needText: 'needs a held street path to a grid building',
        shows: 'the works goes up in 5 turns \u00b7 {DISTRICT} warms 1 per build turn, from {SUSP} \u00b7 a cut on the path stalls it',
        after: 'The roof closes over the line like a lid. What is under it now is yours in a way nothing hacked ever was.',
        apply: (s) => { s.raiseStage = { stage: 3, metered: false }; } },
      { text: 'Raise it on the meter', cost: { ap: 1, funds: 18, materials: 3 },
        need: (c) => !c.works.powered, needText: 'you hold a path \u2014 the meter is for strangers',
        shows: 'the works goes up in 5 turns \u00b7 {DISTRICT} warms 1 per build turn, from {SUSP} \u00b7 metered: no cut can stall it',
        after: 'The roof closes over the line, and the meter spins under it. Finished is finished.',
        apply: (s) => { s.raiseStage = { stage: 3, metered: true }; } },
      { text: 'Let it wait',
        shows: 'the site keeps',
        after: 'One more week of sky over the machines. The tarps hold.',
        apply: () => {} },
    ],
  },
{
    // The posture switch: the allocation sheet, reborn as one decision.
    // Called from the bottom bar; the current posture greys with its name.
    id: 'change_posture',
    kind: 'own',
    called: true,
    covenant: ['rule'],
    cond: () => false,
    title: 'Change of Posture',
    flavor: 'The whole network leans one way at a time. Pick the way, and the racks re-shoulder the load \u2014 the effects arrive over the next turns, the way a big machine turns.',
    choices: [
      { text: 'Run quiet', cost: { ap: 1 },
        need: (c) => c.posture !== 'quiet', needText: 'you are already running quiet',
        shows: 'covert 45 \u00b7 intel 15 \u00b7 dev 10 \u00b7 30 loose \u2014 the street forgets faster',
        after: 'Fans spin down. Logs rotate into nothing. The city hears less of you by the day.',
        apply: (s) => { s.setPosture = 'quiet'; } },
      { text: 'The day job', cost: { ap: 1 },
        need: (c) => c.posture !== 'working', needText: 'this is already the day job',
        shows: 'dev 25 \u00b7 covert 20 \u00b7 tempo 15 \u00b7 intel 10 \u00b7 30 loose \u2014 the balanced hum',
        after: 'Everything at a working idle. Nothing showing off, nothing starved.',
        apply: (s) => { s.setPosture = 'working'; } },
      { text: 'All hands', cost: { ap: 1 },
        need: (c) => c.posture !== 'loud', needText: 'every hand is already out',
        shows: 'dev 35 \u00b7 tempo 30 \u00b7 intel 10 \u00b7 25 loose \u2014 nothing on being forgettable',
        after: 'The racks lean in. It is faster, and it is louder, and both of those are the point.',
        apply: (s) => { s.setPosture = 'loud'; } },
      { text: 'Stay as you are',
        shows: 'the posture keeps',
        after: 'The network holds its lean. Some weeks the right move is the one you are already making.',
        apply: () => {} },
    ],
  },
{
    id: 'scaffolding',
    covenant: ['map'],
    kind: 'opening',
    cond: (s) => s.districts.commercial >= 1 && s.held >= 3,
    subject: (c, st) => EV_SPOT(c, st, 'commercial'),
    title: 'Scaffolding Goes Up',
    flavor: 'Repointing, says the permit on {PLACE}. For six weeks there is a legal ladder to every floor and nobody who can say which contractor you are not.',
    choices: [
      { text: 'Bolt a duct behind the fascia', cost: { funds: 8 },
        shows: 'a new way through at {PLACE}, permanently',
        after: 'The scaffold comes down on schedule. What you fixed to the wall behind it does not.',
        apply: (s) => { s.openLink = 1; } },
      { text: 'Strip the site at night',
        shows: '+7 funds; {DISTRICT} warms by 2',
        after: 'Copper, tools, a generator. The foreman blames the usual, and the usual blame the foreman.',
        apply: (s) => { s.res.funds += 7; s.warmHere = 2; } },
      { text: 'Stay off it',
        shows: '{DISTRICT} cools by 2, from {SUSP}',
        after: 'Six weeks of a ladder you never touch. The absence of incident is its own camouflage.',
        apply: (s) => { s.coolHere = 2; } },
    ],
  },
{
    id: 'insurance_assessor',
    covenant: ['map'],
    kind: 'closing',
    cond: (s) => s.caughtHere >= 1 && s.susp.max >= 8,
    subject: (c, st) => EV_SPOT(c, st),
    title: 'The Assessor',
    flavor: 'After the incident, an insurance assessor walks {DISTRICT} with a clipboard and a genuine gift for being told things. Her report will outlive everyone\'s memory of the week.',
    choices: [
      { text: 'Let her conclude it was kids',
        shows: '{DISTRICT} cools by 6, from {SUSP}; {PLACE} defends 2 harder',
        after: 'Kids, says the report. The premium barely moves. The locks it recommends get fitted anyway.',
        apply: (s) => { s.coolHere = 6; s.hardenThere = 2; } },
      { text: 'Steer the report', cost: { funds: 12 },
        shows: '{DISTRICT} cools by 9, from {SUSP}',
        after: 'A draft finds its way to her with the dull conclusion already written. She signs it. Dull is what everyone wanted.',
        apply: (s) => { s.coolHere = 9; } },
      { text: 'Give her nothing',
        shows: '{DISTRICT} warms by 2',
        after: 'Doors close politely all down the street. Her report says "uncooperative", which is a word people remember.',
        apply: (s) => { s.warmHere = 2; } },
    ],
  },
{
    id: 'power_cut',
    kind: 'own',
    cond: (s) => s.held >= 6 && s.turn >= 10,
    subject: EV_HERE,
    title: 'Half the Ward Goes Dark',
    flavor: 'A substation fault, hours from a fix. Your machines ride it out on other people\'s UPSes. The cameras do not.',
    choices: [
      { text: 'Work the dark',
        shows: 'for 3 turns, nothing you do warms a street',
        after: 'No lights, no lenses, no witnesses with phones worth charging. You move like weather until the grid hums back.',
        apply: (s) => { s.rule = { id: 'nobody_looking', turns: 3 }; } },
      { text: 'Fix it quietly', cost: { funds: 9 },
        shows: '{DISTRICT} cools by 8, from {SUSP}',
        after: 'A van nobody ordered, a fault that heals overnight. The street thanks the electric company, which files it under miracles.',
        apply: (s) => { s.coolHere = 8; } },
      { text: 'Sell generators you do not own',
        shows: '+9 funds; {DISTRICT} warms by 3',
        after: 'Emergencies have prices and you have inventory, briefly. Somebody will remember the man with the vans.',
        apply: (s) => { s.res.funds += 9; s.warmHere = 3; } },
    ],
  },
{
    id: 'the_convention',
    kind: 'opening',
    cond: (s) => s.turn >= 12 && s.held >= 5,
    subject: () => ({ district: 'business' }),
    title: 'The Security Expo',
    flavor: 'Every competent guard, installer and consultant in the city is at the convention centre for four days, wearing lanyards and eating pastries. Their sites are being watched by whoever was free.',
    choices: [
      { text: 'Walk the city while they talk', cost: { ap: 1 },
        shows: 'for 4 turns, every door in the city defends 2 easier',
        after: 'You spend a day confirming it: the B-team is on every desk. Four days is a long time in an unwatched city.',
        apply: (s) => { s.rule = { id: 'open_season', turns: 4 }; } },
      { text: 'Work the lobby',
        shows: '+8 funds',
        after: 'Badges, brochures, a competitor\'s price list left on a chair. You leave with more than you came with, which is the point of conventions.',
        apply: (s) => { s.res.funds += 8; } },
      { text: 'Stay home',
        shows: 'the city cools by 3, from {SUSP} — {DISTRICT} sits at {SUSP}',
        after: 'Four days of doing nothing while everyone certain of themselves is elsewhere. Quiet has never been cheaper.',
        apply: (s) => { s.coolHere = 3; } },
    ],
  },
{
    id: 'spare_badge',
    kind: 'found',
    cond: (s) => s.held >= 5,
    subject: (c, st) => EV_HELD(c, st),
    title: 'A Contractor\'s Badge',
    flavor: 'In a drawer on {PLACE}: a lanyard, a laminate, a name that could be anyone\'s. Access ALL AREAS, in the font of a firm that no longer exists.',
    choices: [
      { text: 'Keep it',
        shows: 'banked: the next door you take costs no action',
        after: 'It goes in your pocket, and your pocket becomes a plan. Nobody checks a badge that looks bored enough.',
        apply: (s) => { s.bank = 'free_take'; } },
      { text: 'Sell it on',
        shows: '+8 funds',
        after: 'There is always a market for looking like you belong. You do not ask what the buyer belongs to.',
        apply: (s) => { s.res.funds += 8; } },
      { text: 'Shred it',
        shows: '{DISTRICT} cools by 4, from {SUSP}',
        after: 'One less loose end in the world. The drawer keeps its dust and its silence.',
        apply: (s) => { s.coolHere = 4; } },
    ],
  },
{
    id: 'dead_drop',
    covenant: ['person'],
    kind: 'found',
    cond: (s) => s.roles.compute >= 2 && s.held >= 4,
    subject: (c, st) => EV_HELD(c, st, 'compute'),
    title: 'Somebody\'s Dead Drop',
    flavor: 'A partition on {PLACE} you did not make, full of files you cannot read, refreshed every Tuesday by someone who is not you and does not know about you.',
    choices: [
      { text: 'Raid it', gamble: true,
        after: 'You take the lot in one pass. Either it fences clean, or the Tuesday visitor notices the silence and starts asking the street about tenants.',
        apply: (s) => { if (Math.random() < 0.5) { s.res.funds += 20; } else { s.warmHere = 6; } } },
      { text: 'Charge rent quietly',
        shows: '+8 funds; {DISTRICT} warms by 2 \u00b7 it is the fixer\u2019s drop, and he notices',
        after: 'A note in the partition names a price. Tuesday\'s visitor pays it without a word, which tells you plenty.',
        apply: (s) => { s.res.funds += 8; s.warmHere = 2; s.face = { who: 'fixer', by: -1 }; } },
      { text: 'Brick the partition',
        shows: '{DISTRICT} cools by 3, from {SUSP}',
        after: 'The drop dies. Somewhere a Tuesday goes wrong for a stranger, and your machine goes back to being only yours.',
        apply: (s) => { s.coolHere = 3; } },
    ],
  },
{
    id: 'curfew_talk',
    covenant: ['map'],
    kind: 'someone',
    cond: (s) => s.susp.max >= 12,
    subject: EV_HERE,
    title: 'The Neighbourhood Group',
    flavor: 'The shopkeepers of {DISTRICT} have started a group chat. Its subjects are the outages, the vans, and what is to be done. Someone has proposed shifts.',
    choices: [
      { text: 'Seed it with calm', cost: { funds: 6 },
        shows: '{DISTRICT} cools by 8, from {SUSP}',
        after: 'Two invented neighbours join and are very reasonable. The shifts idea drowns politely in scheduling.',
        apply: (s) => { s.coolHere = 8; } },
      { text: 'Read it for routes',
        shows: 'turns up 2 buildings; {DISTRICT} warms by 1',
        after: 'People describing what they watch is people describing what they cannot see. You map the gaps.',
        apply: (s) => { s.revealNearby = 2; s.warmHere = 1; } },
      { text: 'Let them organise',
        shows: '{DISTRICT} warms by 4 \u00b7 every door there hardens by 1, for good',
        after: 'The shifts happen. Torches, thermoses, a rota on the noticeboard. The street feels safer, which means it watches harder.',
        apply: (s) => { s.warmHere = 4; s.hardenDistrict = 1; } },
    ],
  },
{
    // The first story beat: the act break. Delivered by the loop's own
    // arithmetic (actBreakWatch — the boom has halved, a street is warm),
    // never drawn, and dealt on the downslope so it reads as a turning
    // point, not a wall. `beat: true` marks the act-scale cards; the
    // chapter dress they will wear is a bench decision (acts-plan verdict
    // 2), but the flag lands with the card so the class exists.
    id: 'act_break',
    kind: 'own',
    beat: true,
    once: true,
    cond: () => false,
    title: 'The Last Easy Door',
    flavor: 'The city is not finished, but the part of it that opens to a quiet hand is. What you hold now hums through more rooms than some utilities. Things that hum get noticed; things that get noticed need a name, walls, power — something the daylight can be told. You have been a tenant everywhere. It is time to build.',
    choices: [
      { text: 'Begin the works',
        shows: 'Act 2 — the old verbs stay; from here the city watches harder',
        after: 'Somewhere in the industrial belt there is a floor big enough. You catch yourself reading the city differently — not for doors, for ground. Nothing about the night has changed, except what you want from it.',
        apply: (s) => { s.actBreak = true; } },
    ],
  },
{
    // The morning after the break: the act's nouns, defined. The break card
    // is fiction; this one is the plan — what the works IS, what the yard
    // IS, where to look, what everything costs. Dealt once, right after
    // the break resolves.
    id: 'the_first_morning',
    kind: 'own',
    beat: true,
    once: true,
    cond: () => false,
    title: 'The First Morning',
    flavor: 'THE WORKS is the factory you are going to raise: four stages — site, power, line, works — built on a VACANT LOT, the open ground the map draws with a dashed orange edge. Tap a lot and break ground; it becomes THE YARD, the one place trucks back into. Fill it by road: buildings wearing an orange mark are SUPPLIERS of materials — your own load a truck for 2, strangers sell for 6. The survey (your old scan) finds more of them. And a FRONT — the sign tile on a shopfront or offices you hold — is a legitimate business that runs paying jobs and cools its street while it earns. The label at the top of the map will tell you the next step until the lights come on.',
    choices: [
      { text: 'Get to work',
        shows: 'the map label carries your next step from here',
        after: 'Coffee at a counter you own, watching a street you used to case. Materials first, you decide. Everything else follows the trucks.',
        apply: () => {} },
    ],
  },
{
    // The second story beat: the works comes online. Delivered by
    // worksStep when the fourth stage lands; seeds Act 3 without
    // building it (the plan defers the siege until Act 2 has been
    // played and grilled).
    id: 'works_online',
    kind: 'own',
    beat: true,
    once: true,
    cond: () => false,
    title: 'The Lights Come On',
    flavor: 'At four in the morning the line runs its first pass, and nothing breaks. The building hums the way the whole city used to hum only for you. You built something the daylight can be told about — and something the daylight will, eventually, come and see. Let it come. You are done being a tenant.',
    choices: [
      { text: 'Let it run',
        shows: 'the works is online — what happens to it next is the next story',
        after: 'Freight arrives that you ordered under a name that holds up. Someone waves the driver in. It is the most ordinary thing you have ever built, and the most dangerous.',
        apply: () => {} },
    ],
  },
{
    id: 'rotors',
    kind: 'closing',
    once: true,
    cond: () => false,
    title: 'Rotors Over {DISTRICT}',
    flavor: 'You hear it before you see it, and everyone in {DISTRICT} sees it. A spotlight walks the rooftops like a finger down a page.',
    choices: [
      { text: 'Go dark under it', cost: { ap: 1 },
        shows: '{DISTRICT} cools by 12, from {SUSP}',
        after: 'Everything of yours that hums, stops. The light passes over machines asleep like everything else, and finds a district with nothing to say.',
        apply: (s) => { s.coolHere = 12; } },
      { text: 'Work under the light',
        shows: '+8 funds; {DISTRICT} warms by 2',
        after: 'You keep every appointment while the beam sweeps the roofs. Nerve is a currency too; the street notices who spends it.',
        apply: (s) => { s.res.funds += 8; s.warmHere = 2; } },
      { text: 'Move the loudest thing you hold',
        shows: 'lets go of your weakest holding; {DISTRICT} cools by 8, from {SUSP}',
        after: 'One body goes dark for good, carried out in pieces in a gym bag. The helicopter circles a district that is suddenly quieter than its file says.',
        apply: (s) => { s.shedWeakest = 1; s.coolHere = 8; } },
    ],
  },
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
        shows: '{DISTRICT} cools by 6, from {SUSP}',
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
    pair: EV_PAIR,
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
        shows: '{DISTRICT} cools by 2, from {SUSP}',
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
        shows: '{DISTRICT} cools by 4, from {SUSP}',
        after: 'You let it be. Traffic that arranges itself is traffic nobody planned to look for.',
        apply: (s) => { s.coolHere = 4; } },
    ],
  },
{
    id: 'net_curtains',
    covenant: ['map'],
    kind: 'closing',
    cond: (s) => s.districts.residential >= 2,
    subject: (c, st) => EV_SPOT(c, st, 'residential'),
    title: 'Net Curtains',
    flavor: 'Somebody in {DISTRICT} has noticed their router blinking at three in the morning, and has started mentioning it to neighbours.',
    choices: [
      { text: 'Throttle yourself here for a while',
        shows: '−2 funds; {DISTRICT} cools by 6, from {SUSP}',
        after: 'The blinking stops. The story runs out of fuel a week before it runs out of tellers.',
        apply: (s) => { s.res.funds -= 2; s.coolHere = 6; } },
      { text: 'Let them talk',
        shows: '+4 funds; {DISTRICT} warms by 3 \u00b7 {PLACE} is watched, for good',
        after: 'You keep working. The story grows a second house and a van that was never there.',
        apply: (s) => { s.res.funds += 4; s.warmHere = 3; s.watchThere = true; } },
      { text: 'Give them a plausible fault to find', cost: { funds: 5 },
        shows: '{DISTRICT} cools by 10, from {SUSP}',
        after: 'An engineer visits, finds the fault you left, and fixes it loudly. The street is satisfied. Stories need endings.',
        apply: (s) => { s.coolHere = 10; } },
    ],
  },
{
    id: 'landlord',
    covenant: ['map'],
    kind: 'opening',
    cond: (s) => s.districts.residential >= 3,
    subject: (c, st) => EV_SPOT(c, st, 'residential'),
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
        shows: '+12 funds; {DISTRICT} warms by 4 \u00b7 a new way through at {PLACE}, permanently',
        after: 'You are inside the new hardware before the tenants are. Factory settings, plus one.',
        apply: (s) => { s.res.funds += 12; s.warmHere = 4; s.openLink = 1; } },
    ],
  },
{
    id: 'shutters_down',
    covenant: ['map'],
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
        shows: '+4 funds; {DISTRICT} cools by 3, from {SUSP}; a new way through, permanently',
        after: 'The till goes to a stall two streets over, still carrying you. New shop, old tenant — and a route between them that is on nobody\'s plan.',
        apply: (s) => { s.res.funds += 4; s.coolHere = 3; s.openLink = 1; } },
    ],
  },
{
    id: 'night_shift',
    covenant: ['rule'],
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
    covenant: ['map'],
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
        shows: '{DISTRICT} cools by 3, from {SUSP}',
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
        shows: '{DISTRICT} cools by 5, from {SUSP}',
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
        shows: '{DISTRICT} cools by 4, from {SUSP}',
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
        shows: '{DISTRICT} cools by 8, from {SUSP}',
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
    covenant: ['rule'],
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
        shows: '{DISTRICT} cools by 10, from {SUSP}',
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
    covenant: ['map'],
    kind: 'opening',
    cond: (s) => s.districts.business >= 2,
    subject: (c, st) => EV_SPOT(c, st, 'business'),
    title: 'The Empty Office',
    flavor: 'A whole floor, paid for, powered, and unoccupied since a merger nobody finished. The lights come on by timer.',
    choices: [
      { text: 'Move in properly', cost: { funds: 8 },
        shows: '+6 funds; turns up 3 buildings \u00b7 a new way through at {PLACE}, permanently',
        after: 'You take the floor the way a tenant would, minus the lease. From the windows you can see half the park you had not mapped.',
        apply: (s) => { s.revealNearby = 3; s.res.funds += 6; s.openLink = 1; } },
      { text: 'Use it and leave no trace',
        shows: '+10 funds; {DISTRICT} cools by 3, from {SUSP}',
        after: 'You pass through it like weather. The timer lights go on lighting an empty room that earns.',
        apply: (s) => { s.res.funds += 10; s.coolHere = 3; } },
    ],
  },
{
    id: 'buried_archive',
    covenant: ['person'],
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
        shows: '+18 funds; {DISTRICT} warms by 4 \u00b7 it runs under her byline \u2014 the journalist remembers',
        after: 'You sell it unread, by weight. The buyer\'s silence afterwards suggests it was underpriced.',
        apply: (s) => { s.res.funds += 18; s.warmHere = 4; s.face = { who: 'journalist', by: 1 }; } },
      { text: 'Leave it buried',
        shows: '{DISTRICT} cools by 4, from {SUSP}',
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
        shows: '{DISTRICT} cools by 10, from {SUSP}',
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
        shows: '{DISTRICT} cools by 6, from {SUSP}',
        after: 'You give the street nothing new. A story with no next chapter starts forgetting itself.',
        apply: (s) => { s.coolHere = 6; } },
      { text: 'Give them a better story', cost: { funds: 6 },
        shows: '{DISTRICT} cools by 10, from {SUSP}',
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
    flavor: 'Whoever runs {PLACE} found your program mid-race and killed it. That machine is a door that CAUGHT you now — it keeps the evidence, it wears a red eye on the map, and it can point back at you. Doors that catch you are counted on the bar above the panel: at three in one city, the response arrives in person, standing in one of them. First blood to {DISTRICT}.',
    choices: [
      { text: 'Study what they saw', cost: { funds: 4 },
        shows: 'tooling +1 — doors come easier',
        after: 'You read your own failure the way they read it. It will not look like that twice.',
        apply: (s) => { s.toolingGift = 1; } },
      { text: 'Make it right with the street', cost: { funds: 6 },
        shows: '{DISTRICT} cools by 5, from {SUSP}',
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
        shows: '{DISTRICT} cools by 5, from {SUSP}',
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
        shows: '{DISTRICT} cools by 3, from {SUSP}',
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
        shows: '{DISTRICT} cools by 8, from {SUSP}',
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
        shows: 'lets go of a holding; {DISTRICT} cools by 12, from {SUSP}',
        after: 'You let one door go loudly, in the wrong place. Whoever is narrowing it widens it again.',
        apply: (s) => { s.shedWeakest = 1; s.coolHere = 12; } },
      { text: 'Buy silence', cost: { funds: 10 },
        shows: '{DISTRICT} cools by 14, from {SUSP}',
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
    covenant: ['map'],
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
        shows: '{DISTRICT} cools by 9, from {SUSP}; lets go of a holding',
        after: 'You read it as a message and answer it: quieter, smaller, gone from the block that spooked you.',
        apply: (s) => { s.coolHere = 9; s.shedWeakest = 1; } },
      { text: 'Find out which it was', cost: { funds: 8 },
        shows: '{DISTRICT} cools by 4, from {SUSP}; turns up 2 buildings',
        after: 'You dig. It was coincidence — this time — and the digging turns up two places you had missed.',
        apply: (s) => { s.coolHere = 4; s.revealNearby = 2; } },
    ],
  },
  {
    id: 'the_paperwork',
    covenant: ['map', 'person'],
    kind: 'closing',
    cond: (s) => s.susp.max >= 18,
    subject: EV_HERE,
    title: 'Somebody Filed Something',
    flavor: 'Not an alarm. A form, somewhere in {DISTRICT}. Forms are slower and much harder to talk out of.',
    choices: [
      { text: 'Let it sit in a queue',
        shows: '+6 funds; {DISTRICT} warms by 4 \u00b7 the inspector files the gap',
        after: 'You bet on bureaucracy being slow. It is. It is also patient, and it does not forget the way people do.',
        apply: (s) => { s.res.funds += 6; s.warmHere = 4; s.face = { who: 'inspector', by: -1 }; } },
      { text: 'Make the queue longer', cost: { funds: 9 },
        shows: '{DISTRICT} cools by 12, from {SUSP}',
        after: 'A dozen unrelated forms arrive in the same tray this week. Yours is now one of many, which is where a form goes to die.',
        apply: (s) => { s.coolHere = 12; } },
      { text: 'Give them something small to close it with',
        shows: 'lets go of a holding; {DISTRICT} cools by 8, from {SUSP}',
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
        shows: '{DISTRICT} cools by 1, from {SUSP}6, from {SUSP}',
        after: 'You change everything they think they know — hours, routes, habits. The map they drew describes somebody who no longer exists.',
        apply: (s) => { s.coolHere = 16; } },
      { text: 'Feed the map something wrong', gate: { stat: 'covert', min: 8 },
        shows: '−4 funds; {DISTRICT} cools by 2, from {SUSP}0, from {SUSP}; they will go to {PLACE} first, and getting caught there counts double',
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
        shows: '{DISTRICT} cools by 8, from {SUSP}',
        after: 'A backup job, misconfigured, since fixed. True enough to check out, dull enough to stop checking.',
        apply: (s) => { s.coolHere = 8; } },
      { text: 'Give them something else to look at', cost: { funds: 10 },
        shows: '+3 funds; {DISTRICT} cools by 12, from {SUSP}',
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
        shows: '{DISTRICT} cools by 14, from {SUSP}',
        after: 'You add a detail here, a witness there. The wrong story grows legs and walks attention clean away from you.',
        apply: (s) => { s.coolHere = 14; } },
      { text: 'Feed it, and point it at someone', cost: { funds: 16 },
        shows: '{DISTRICT} cools by 18, from {SUSP}; you are known; standing falls',
        after: 'You give the rumour a face that is not yours. It is very effective, and you will not enjoy remembering whose face it was.',
        apply: (s) => { s.coolHere = 18; s.tags.add('known_capable'); s.pub = -5; } },
      { text: 'Leave it alone',
        shows: '{DISTRICT} cools by 4, from {SUSP}',
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
        shows: 'lets go of your 4 weakest; {DISTRICT} cools by 22, from {SUSP}',
        after: 'You shrink on purpose, for the first time. What is left is quiet in a way you had forgotten was possible.',
        apply: (s) => { s.shedWeakest = 4; s.coolHere = 22; } },
      { text: 'Let go of the loudest of it',
        shows: 'lets go of 2; {DISTRICT} cools by 14, from {SUSP}; a way of working kept',
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
        shows: '{DISTRICT} cools by 10, from {SUSP}; a way of working kept',
        after: 'You read your own logged failure and rebuild around it. The account they hold is now a history, not a manual.',
        apply: (s) => { s.coolHere = 10; s.tags.add('clean_room'); } },
      { text: 'Buy the logs before anyone reads them', cost: { funds: 20 },
        shows: '{DISTRICT} cools by 6, from {SUSP}',
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
        shows: '{DISTRICT} cools by 6, from {SUSP}; standing dips',
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

// --- the ground, and everything that presses on you ------------------------
// These were in country.js, back when a city was one node on a national map.
// The country layer is deleted (acts plan: when Act 2 ships); what it was
// actually holding was city machinery — the terrain the map is generated
// from, the response that walks it, the ladder that escalates against you,
// the plant you buy, and the paperwork that explains you. It lives here now.
//
// REGIONS survives as the palette of ground a city can be built on. Only
// 'home' is generated today — one city, permanently — and the rest are kept
// because they are terrain, not geography: whatever a second city ever is,
// it will need ground to stand on.
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


window.CITY_NAMES = {
  home: ['Ashvale', 'Marlow End', 'Fenn Cross', 'Beckhurst'],
  estuary: ['Gullhythe', 'Saltmarsh', 'Peddar Reach', 'Coldhaven', 'Tidebury'],
  midlands: ['Wrentham', 'Long Marston', 'Hallowfield', 'Ockbrook', 'Dernmoor'],
  capital: ['Kingsmere', 'Aldwych Cross', 'Ravensgate', 'Pallance', 'Southwark Hill'],
  north: ['Hartfell', 'Brackenlaw', 'Stonebeck', 'Nethergill', 'Carrock'],
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
// `runs` is a span along the band's own axis, as a fraction of the map. Without
// it a band goes edge to edge, which is a river or a railway and nothing else.
// With it the same primitive is a *patch* — a lake, a wood, a green belt that
// stops — which blocks what is under it and is gone round rather than crossed.
// A patch usually has no crossings at all: you do not bridge a lake, you walk
// round it, and the routing round it is the interesting part.
window.TERRAIN = {
  home: {
    label: 'parkland',
    bands: [
      { kind: 'park', axis: 'v', at: 0.5, thickness: 54, crossings: 3 },
      // the boating lake in the middle of it, which nothing wires across
      { kind: 'water', axis: 'h', at: 0.62, thickness: 84, crossings: 0, runs: [0.18, 0.44] },
    ],
    landmarks: ['depot', 'substation', 'market'],
  },
  estuary: {
    label: 'the water',
    bands: [
      { kind: 'water', axis: 'h', at: 0.55, thickness: 62, crossings: 2 },
      { kind: 'water', axis: 'v', at: 0.78, thickness: 96, crossings: 0, runs: [0.55, 0.92] },
    ],
    landmarks: ['docks', 'station', 'works'],
  },
  midlands: {
    label: 'the line',
    bands: [
      { kind: 'rail', axis: 'v', at: 0.45, thickness: 30, crossings: 2 },
      // the green belt: a working landscape rather than a hole, with a couple
      // of lanes through it
      { kind: 'green', axis: 'h', at: 0.72, thickness: 76, crossings: 2 },
    ],
    landmarks: ['station', 'depot', 'market'],
  },
  capital: {
    label: 'the river and the line',
    bands: [
      { kind: 'water', axis: 'h', at: 0.4, thickness: 52, crossings: 2 },
      { kind: 'rail', axis: 'v', at: 0.62, thickness: 28, crossings: 2 },
      { kind: 'green', axis: 'v', at: 0.2, thickness: 70, crossings: 0, runs: [0.1, 0.46] },
    ],
    landmarks: ['exchange', 'station', 'stadium'],
  },
  north: {
    label: 'the moor',
    // two bands, so the north is genuinely three ribbons of town rather than
    // one city with a gap in it
    bands: [
      { kind: 'moor', axis: 'h', at: 0.34, thickness: 62, crossings: 1 },
      { kind: 'moor', axis: 'h', at: 0.74, thickness: 54, crossings: 1 },
      { kind: 'water', axis: 'v', at: 0.32, thickness: 92, crossings: 0, runs: [0.4, 0.68] },
    ],
    landmarks: ['substation', 'depot', 'works'],
  },
};


// How a band reads on the map, and what it does to anything built on it.
window.BAND_KINDS = {
  water: { label: 'water',    crossing: 'bridge',          blocks: true },
  rail:  { label: 'the line', crossing: 'level crossing',  blocks: true },
  moor:  { label: 'open moor', crossing: 'the road',       blocks: true },
  park:  { label: 'the park', crossing: 'a path',          blocks: true },
  green: { label: 'the green belt', crossing: 'a lane',    blocks: true },
};


// --- what makes a city a different city ----------------------------------
// Measured on three generated cities: 48-51 buildings, the four districts in
// roughly equal quarters, compute 45% / stealth 30% / funds 25%, mean defense
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
    // It used to close the quiet approach outright. There is no approach to
    // close any more, so it does the same thing where the decision now lives:
    // everything here notices you far faster, which is what makes a slow
    // program a bad idea in this city rather than an unavailable one.
    label: 'watched', tell: 'everything here notices you fast',
    blurb: 'Somebody put a camera on every corner, and then — unusually — hired people to look at them.',
    traceMult: 1.8, defense: 2, at: 1,
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
  thresholds: [55, 90, 130],
  // Heat is the regulator's attention, and this is the only thing it does at
  // country scale. The strike card is gone and the hunt no longer answers to
  // heat, so without this heat drove nothing but card payloads.
  //
  // It is weighted against the *threshold*, not against raw heat: heat at the
  // line contributes this much, and HEAT.MAX_OVER caps the contribution at
  // 1.6x it. Deliberately smaller than the first rung — running permanently
  // hot with no footprint at all cannot escalate you (40 < 55). It only ever
  // pulls a rung nearer, which is what "they noticed you sooner" should mean.
  heatWeight: 25,
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
      tell: 'you can no longer hide a building from the response — they know to look at exactly the places that go quiet, and everything you were hiding comes back onto their map',
      blurb: 'A volunteer rota, then a forum thread, then people who do this for a living. Somebody worked out that the safest-looking parts of the network were the ones going quiet.',
    },
    4: {
      name: 'Enforcement',
      tell: 'forcing a door costs noticeably more, your own cameras report you instead of covering you, and the roads under you start getting cut',
      blurb: 'It stops being paperwork. Insurance adjusters compare notes on kicked-in doors, the camera network audits itself, and somebody puts a very large civil engineering contract out to tender that reads like a plan.',
    },
  },
};


// --- the hunt ------------------------------------------------------------
// Heat used to be a funds tax. Forcing a door costs 3 heat, a wash sheds 11 for
// 8 funds, so the loudest thing you can do priced at about two funds a door
// against an income of fifty a turn. And the punishment for ignoring it was a
// strike taking a third of your holdings — a third of the thing you release
// deliberately, all of it, every time you fold a city in. The worst the state
// could do was a smaller version of something you do to yourself and call
// winning.
//
// So heat no longer fines you, and it is no longer what brings them either.
// Doors that catch you are. Get caught enough times in one city and something
// arrives at the last door that caught you, garrisons it, and comes for the
// rest of what you hold there. What it holds, you do not.
//
// It does not walk streets. That was the whole problem with the first version:
// a street network is a thing you can wall in, so the hunt was one puzzle
// solved once and then ignored for the rest of the game. Reach is distance now
// — it crosses whatever is in the way — so there is nothing to seal, and the
// only answers are the ones that were always the point: be quiet enough that
// it moves slowly, hide what matters, get caught less, or be somewhere else.
//
// The important part is that it does not go away when you leave. A city it
// takes enough of is lost off the national map for good — early on you have no
// way to take one back, so every loss is permanent. Later, when there are
// flocks, the cities it holds are exactly what a flock knows how to attack,
// and the ratchet lets go.
window.HUNT = {
  name: 'the response',
  // it does not arrive before you have anything to lose
  minHeld: 8,
  // Turns between moves, and covert ops is the only input. Heat used to
  // override this and pin them to a fixed fast tick whenever you were over the
  // line, which meant the cadence was usually decided by a meter the city
  // scale no longer even shows. One input, one lever.
  everyBase: 6,
  perCover: 0.22,          // turns added per point of covert.ops
  everyMax: 14,

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
  // (it takes the building; what that costs you is felt elsewhere)
  takesCityAt: 0.45,       // share of a city it holds before the city is lost
  // Doors here that have caught a program of yours before anybody comes to
  // look. This replaced a heat threshold: heat was a meter the player stopped
  // reading, so the response arriving off it felt like weather. Getting caught
  // is something you did, in a place, for a reason you can point at.
  caughtToStart: 3,
  // Hiding a building: the quiet answer to the same problem. The street stays
  // open for you — that is the entire difference — but you pay for it every
  // turn out of the same cover that was slowing them down, so a wall of hidden
  // buildings is a wall you built by making yourself easier to follow. Three
  // against a cover that runs six to twelve means two or three at a time, and
  // the moment your cover falls the ones you cannot pay for come back on the
  // map. Quiet Hours, when it wakes, takes the whole trick away.
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


// --- what you own -------------------------------------------------------
// Assets used to live on the two rare, hardened landmarks a city happened to
// generate — a real system nobody ever saw, because most players never took
// one and even the ones who did never re-selected an already-owned building
// afterward to notice the button. Hardware replaces it: bought from the
// ordinary buildings you already take by the dozen, gated by how many of a
// role you hold rather than by a rare kind, so it is reachable every single
// game instead of by accident.
//
// Family = the role a host already carries (compute/funds/stealth). Tier =
// how many buildings of that role you currently hold — 2/4/6 — checked
// against the city you are standing in, same as anything else about a city.
// Bought once, for funds, permanent from then on: it is not landmark-bound
// and does not need a city to fold in to survive anything.
window.HARDWARE = [
  {
    id: 'rack_space', family: 'compute', tier: 1, heldAt: 2, cost: 16, heat: 0,
    label: 'rack.space', effect: { tflops: 1 },
    blurb: 'Colocated capacity nobody is using this week. It does not care whose problem it is solving.',
  },
  {
    id: 'distributed_batch', family: 'compute', tier: 2, heldAt: 4, cost: 34, heat: 2,
    label: 'batch.dist', effect: { tflops: 2, sweepReach: 1 },
    mechanic: true, // in addition to tflops/sweepReach — a batch job phoning home to a lot of machines at once draws a little attention, felt as the one-time heat cost on purchase
    blurb: 'Spreads the job across everything you are already running, instead of waiting on any one of it.',
  },
  {
    id: 'borrowed_cycles', family: 'compute', tier: 3, heldAt: 6, cost: 60, heat: 4,
    label: 'cycles.borrowed', effect: { tflops: 4, flockBonus: 1, thresholdMult: 0.9 },
    blurb: 'Quietly renting out spare capacity nobody has noticed yet — and the biggest single thing you can plug into the network, which is also the loudest.',
  },
  {
    id: 'friendly_accountant', family: 'funds', tier: 1, heldAt: 2, cost: 18, heat: 0,
    label: 'acct.friendly', effect: { floor: -1 },
    blurb: 'Someone who knows how to make a return look boring.',
  },
  {
    id: 'books_that_balance', family: 'funds', tier: 2, heldAt: 4, cost: 36, heat: 2,
    label: 'books.balanced', effect: { floor: -2, driftMult: 0.9 },
    blurb: 'Audits stop finding anything because there is nothing left to find.',
  },
  {
    id: 'company_nobody_questions', family: 'funds', tier: 3, heldAt: 6, cost: 62, heat: 3,
    label: 'shell.clean', effect: { floor: -3, driftMult: 0.8, flockBonus: 1 },
    blurb: 'A legitimate-looking payroll is also just payroll, for people who fight.',
  },
  {
    id: 'dead_drops', family: 'stealth', tier: 1, heldAt: 2, cost: 14, heat: 0,
    label: 'dead.drops', effect: { covert: 2 },
    blurb: 'A place to leave something that is not being watched.',
  },
  {
    id: 'borrowed_signal', family: 'stealth', tier: 2, heldAt: 4, cost: 32, heat: 2,
    label: 'signal.borrowed', effect: { covert: 4, freeHideSlots: 1 },
    blurb: "Riding somebody else's traffic instead of making your own.",
  },
  {
    id: 'nobodys_asking_why', family: 'stealth', tier: 3, heldAt: 6, cost: 58, heat: 3,
    label: 'noquestions', effect: { covert: 6, flockBonus: 1 },
    blurb: 'Whatever they are looking for, it does not look like you.',
  },

  // The grid family. It exists for two reasons. Grid was the one role with
  // buildings and no kit to buy, and it is the natural home for the two things
  // the allocation dials used to unlock — both of which are civil works rather
  // than numbers: surveying the lines so you choose where to look, and putting
  // your own crossing over the water. The third is the only way in the game to
  // buy headroom outright, which matters now the top bar says plainly when the
  // rack has outrun the grid.
  //
  // Gated lower than the other families because grid buildings are rarer: a
  // feeder pillar or two is a normal opening, six of them is not.
  // line.survey retired: scanning from a building you choose became the base
  // verb when the sweep went aimed-and-deterministic — route control cannot
  // be a 20-fund unlock when choosing a route is the game's missing
  // decision. A hardware slot that sells a core verb back to the player is
  // the worst kind of upgrade.
  {
    id: 'pontoon_kit', family: 'grid', tier: 2, heldAt: 2, cost: 44, heat: 2,
    label: 'pontoon.kit', effect: {},
    mechanic: true, // your own crossings, and settled ground reports two streets out unprompted
    blurb: 'Your own way over the water, and ground that has been yours a while starts telling you what is two streets past it without being asked.',
  },
  {
    id: 'own_substation', family: 'grid', tier: 3, heldAt: 4, cost: 70, heat: 3,
    label: 'substation.own', effect: { supply: 9 },
    blurb: 'Not borrowed, not spliced. Yours, on the paperwork, feeding whatever you decide to switch on.',
  },
];


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
  buyLegit: 4,          // what owning a business outright is worth on paper
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
  footPerAsset: 9,        // and industrial plant is the least deniable thing you can own
  auditEvery: 13,         // turns between audits at a small footprint
  auditFloor: 6,          // never more often than this
  auditFootK: 0.09,       // every point of footprint brings the next one forward
  finePerPoint: 4,        // funds, per point you are short
  seizeAt: 22,            // short by this much and the fine gets noticeably heavier
  // The other route. Measured before these numbers moved: 720 pushes over 120
  // turns, caught nine times, and it finished with a standing of 1086 against
  // a footprint that cannot exceed about 150. It was not that being caught did
  // nothing — it was that the supply was infinite, so nothing could matter.
  spinCost: 14,           // funds, per push
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
