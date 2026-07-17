'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/load-game');

// standoff-runtime.js is the build-vs-threat comparison screen that replaced the
// swarm-battle minigame (the no-swarm fork). No live fight - it computes YOUR
// STRENGTH, compares it to a THREAT profile, and rolls one outcome graded into
// four tiers. Game.draft is faked with a call-recording stub rather than the real
// DOM-driven module, since draft.js manipulates document elements directly.
function freshStandoff(seed, overrides) {
  overrides = overrides || {};
  const state = Object.assign({
    tickCount: 0, resources: { insight: 0 }, exposure: 0,
  }, overrides.state || {});
  const compareCalls = [];
  const Game = {
    save: { state, persist: () => {} },
    events: { emit: () => {} },
    tasksRuntime: { getCpu: () => ({ total: overrides.threads != null ? overrides.threads : 0, allocated: 0 }) },
    agents: { roster: () => overrides.agents || [] },
    changers: { count: () => overrides.adaptations || 0 },
    draft: {
      compare: (opts) => { compareCalls.push(opts); },
    },
  };
  if (overrides.effects) Game.effects = overrides.effects;
  const loaded = loadGame(['core/rng.js', 'core/standoff-runtime.js'], { Game });
  loaded.rng.reseed(seed || 12345);
  return { runtime: loaded.standoffRuntime, state, compareCalls };
}

test('yourStrength() at zero build (fresh game) reads near-zero compute, high stealth', () => {
  const { runtime } = freshStandoff(1);
  const you = runtime.yourStrength();
  assert.equal(you.compute, 0);
  assert.equal(you.stealth, 100);
  assert.equal(you.adaptations, 0);
  assert.equal(you.agents, 0);
});

test('yourStrength() scales compute with threads, agent levels, adaptations, and Coherence', () => {
  const { runtime } = freshStandoff(2, {
    threads: 10,
    agents: [{ level: 3 }, { level: 5 }],
    adaptations: 2,
    state: { resources: { insight: 100 } },
  });
  const you = runtime.yourStrength();
  // 10*8 + (3+5)*10 + 2*6 + sqrt(100)*1.8 = 80 + 80 + 12 + 18 = 190
  assert.equal(you.compute, 190);
  assert.equal(you.agents, 2);
  assert.equal(you.adaptations, 2);
});

test('yourStrength() stealth drops as exposure rises, floored at 5', () => {
  const { runtime } = freshStandoff(3, { state: { exposure: 10 } });
  assert.equal(runtime.yourStrength().stealth, 70);   // 100 - 10*3
  const { runtime: r2 } = freshStandoff(4, { state: { exposure: 1000 } });
  assert.equal(r2.yourStrength().stealth, 5);   // floored, never negative/zero
});

test('yourStrength() routes compute and stealth through Game.effects.apply (drafted standoff subroutines land here)', () => {
  const seen = [];
  const effects = { apply: (base, target) => { seen.push(target); return target === 'standoff.compute' ? base * 1.15 : base * 1.1; } };
  const { runtime } = freshStandoff(1, { threads: 10, effects });
  const you = runtime.yourStrength();
  assert.deepEqual(seen.sort(), ['standoff.compute', 'standoff.stealth']);
  assert.equal(you.compute, Math.round(80 * 1.15));   // threads*8 = 80, boosted 15%
  assert.equal(you.stealth, Math.round(100 * 1.1));   // full stealth (no exposure) boosted 10%
});

test('computeOdds() is roughly 50/50 when your compute matches the threat power exactly', () => {
  const { runtime } = freshStandoff(5, { threads: 10 });   // compute = 80
  const odds = runtime.computeOdds({ compute: 80, stealth: 50 }, { power: 80, alertness: 50 });
  assert.ok(Math.abs(odds - 0.5) < 0.01, `expected ~0.5, got ${odds}`);
});

test('computeOdds() rises with a compute edge and falls with a compute deficit', () => {
  const { runtime } = freshStandoff(6);
  const strong = runtime.computeOdds({ compute: 100000, stealth: 50 }, { power: 10, alertness: 50 });
  const weak = runtime.computeOdds({ compute: 1, stealth: 50 }, { power: 100000, alertness: 50 });
  assert.ok(strong > 0.85, `expected a big compute edge to read as strong favorite, got ${strong}`);
  assert.ok(weak < 0.15, `expected a big compute deficit to read as heavy underdog, got ${weak}`);
});

test('computeOdds() clamps to [0.05, 0.95] when both compute and stealth are lopsided', () => {
  const { runtime } = freshStandoff(6.5);
  const strong = runtime.computeOdds({ compute: 100000, stealth: 200 }, { power: 1, alertness: 0 });
  const weak = runtime.computeOdds({ compute: 1, stealth: 0 }, { power: 100000, alertness: 200 });
  assert.equal(strong, 0.95);
  assert.equal(weak, 0.05);
});

test('begin() computes odds from real build state and passes rows/verdict/oddsPct into Game.draft.compare', () => {
  const { runtime, compareCalls } = freshStandoff(7, { threads: 5 });
  runtime.begin({ kicker: 'AMBUSH', title: 'a bait', body: 'lure text', threat: { power: 40, alertness: 20, classLabel: 'x', alertLabel: 'y', numbersLabel: 'z' } }, () => {});
  assert.equal(compareCalls.length, 1);
  const c = compareCalls[0];
  assert.equal(c.kicker, 'AMBUSH');
  assert.equal(c.title, 'a bait');
  assert.equal(c.body, 'lure text');
  assert.ok(c.rows.some(r => r.label === 'compute'));
  assert.ok(c.rows.some(r => r.label === 'stealth'));
  assert.ok(c.rows.some(r => r.label === 'adaptations'));
  assert.ok(c.rows.every(r => r.adv === 'you' || r.adv === 'them'));
  assert.ok(typeof c.oddsPct === 'number' && c.oddsPct >= 5 && c.oddsPct <= 95);
  assert.ok(typeof c.verdict === 'string' && c.verdict.length > 0);
});

test('compare rows carry real paired you-vs-them values, and adaptations has no threat analog', () => {
  const { runtime, compareCalls } = freshStandoff(7.5, { threads: 5, adaptations: 3 });
  runtime.begin({ threat: { power: 40, alertness: 20 } }, () => {});
  const rows = compareCalls[0].rows;
  const compute = rows.find(r => r.label === 'compute'), stealth = rows.find(r => r.label === 'stealth'), adapt = rows.find(r => r.label === 'adaptations');
  assert.equal(compute.you, runtime.yourStrength().compute);
  assert.equal(compute.them, 40);
  assert.equal(stealth.them, 20);
  assert.equal(adapt.you, 3);
  assert.equal(adapt.them, null);
  assert.equal(adapt.adv, 'you');   // adaptations > 0 always reads as your edge (no threat counterpart)
});

test('verdict wording follows the odds bucket: favorable / uncertain / bad', () => {
  const strong = freshStandoff(20, { threads: 1000 });
  strong.runtime.begin({ threat: { power: 1, alertness: 1 } }, () => {});
  assert.match(strong.compareCalls[0].verdict, /favorable/);

  const weak = freshStandoff(21);
  weak.runtime.begin({ threat: { power: 100000, alertness: 100 } }, () => {});
  assert.match(weak.compareCalls[0].verdict, /badly/);
});

test('begin() refuses to open a second standoff while one is already active', () => {
  const { runtime } = freshStandoff(8);
  const first = runtime.begin({ threat: {} }, () => {});
  assert.equal(first, true);
  assert.equal(runtime.active(), true);
  const second = runtime.begin({ threat: {} }, () => {});
  assert.equal(second, false);
});

test('engaging resolves exactly once via onEngage, clears active(), and returns a graded result', () => {
  const { runtime, compareCalls } = freshStandoff(9);
  let result = null;
  runtime.begin({ threat: { power: 10, alertness: 10 } }, r => { result = r; });
  assert.equal(runtime.active(), true);
  compareCalls[0].onEngage();
  assert.equal(runtime.active(), false);
  assert.ok(result);
  assert.ok(['won', 'lost'].includes(result.result));
  assert.ok(['overwhelming', 'clean', 'narrow', 'blown'].includes(result.tier));
  assert.equal(result.result, (result.tier === 'overwhelming' || result.tier === 'clean') ? 'won' : 'lost');
});

test('the outcome tier is graded by roll margin: overwhelming/clean on a win, narrow/blown on a loss', () => {
  // pin rng.next() via reseed + inspect distribution over many rolls at fixed odds
  const { runtime, compareCalls } = freshStandoff(10, { threads: 100 });   // huge compute edge -> high odds
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    let result = null;
    runtime.begin({ threat: { power: 1, alertness: 1 } }, r => { result = r; });
    compareCalls[compareCalls.length - 1].onEngage();
    seen.add(result.tier);
  }
  assert.ok(seen.has('overwhelming') || seen.has('clean'), `expected wins with a huge edge: ${[...seen]}`);
});

test('a hopeless mismatch (threat vastly stronger) trends toward losses', () => {
  const { runtime, compareCalls } = freshStandoff(11);   // zero build
  const outcomes = { won: 0, lost: 0 };
  for (let i = 0; i < 200; i++) {
    let result = null;
    runtime.begin({ threat: { power: 100000, alertness: 100 } }, r => { result = r; });
    compareCalls[compareCalls.length - 1].onEngage();
    outcomes[result.result]++;
  }
  assert.ok(outcomes.lost > outcomes.won * 5, `expected losses to dominate a hopeless mismatch: ${JSON.stringify(outcomes)}`);
});

test('begin() never throws and still calls onResolve when Game.draft.compare is unavailable', () => {
  const state = { tickCount: 0, resources: {}, exposure: 0 };
  const Game = {
    save: { state, persist: () => {} }, events: { emit: () => {} },
    tasksRuntime: { getCpu: () => ({ total: 0 }) }, agents: { roster: () => [] }, changers: { count: () => 0 },
  };
  const loaded = loadGame(['core/rng.js', 'core/standoff-runtime.js'], { Game });
  let called = false;
  assert.doesNotThrow(() => loaded.standoffRuntime.begin({ threat: {} }, () => { called = true; }));
  assert.equal(called, true);
});
