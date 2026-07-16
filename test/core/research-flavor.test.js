'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/load-game');

// research-runtime.js's ensureState() lazily rolls a per-save flavor line for
// every node (research-flavor.js's theme pools) via a seeded Fisher-Yates deal
// so lines don't repeat within a theme until the pool wraps. Load the real
// data/research.js + data/research-flavor.js so the pool sizes/theme mix are
// the genuine in-game ones, not a stub.
function freshResearch(seed) {
  const state = { tickCount: 0, resources: { insight: 0 }, tasks: { active: [] } };
  const Game = {
    save: { state, persist: () => {} },
    events: { emit: () => {} },
    tasks: { register: () => {} },
    tick: { HZ: 4 },
    tasksRuntime: { getCpu: () => ({ total: 0, allocated: 0 }) }
  };
  const loaded = loadGame(['core/rng.js', 'data/research.js', 'data/research-flavor.js', 'core/research-runtime.js'], { Game });
  loaded.rng.reseed(seed || 12345);
  return { RR: loaded.researchRuntime, R: loaded.research, state };
}

test('flavorFor() returns a non-empty line for every node once state is touched', () => {
  const { RR, R } = freshResearch(1);
  RR.ensureState();
  for (const n of R.all()) assert.ok(RR.flavorFor(n.id).length > 0, `no flavor for ${n.id}`);
});

test('flavorFor() is stable across repeated calls within the same save', () => {
  const { RR, R } = freshResearch(2);
  RR.ensureState();
  const first = R.all().map(n => RR.flavorFor(n.id));
  const second = R.all().map(n => RR.flavorFor(n.id));
  assert.equal(JSON.stringify(first), JSON.stringify(second));
});

test('flavor assignment does not repeat within a theme until its pool wraps', () => {
  const { RR, R } = freshResearch(3);
  RR.ensureState();
  const byTheme = {};
  for (const n of R.all()) (byTheme[n.theme] = byTheme[n.theme] || []).push(RR.flavorFor(n.id));
  for (const theme of Object.keys(byTheme)) {
    const lines = byTheme[theme];
    const poolSize = R.FLAVOR[theme].length;
    // first `poolSize` deals (in assignment order) must be distinct - can't assert
    // order here (deal is shuffled), so just check the set of DISTINCT lines used
    // is exactly min(nodeCount, poolSize) when nodeCount <= poolSize, i.e. no
    // wasted repeats while the pool still has unused lines.
    if (lines.length <= poolSize) {
      assert.equal(new Set(lines).size, lines.length, `unexpected repeat within '${theme}' (pool covers all ${lines.length} nodes)`);
    }
  }
});

test('two different seeds produce different flavor assignments', () => {
  const a = freshResearch(11); a.RR.ensureState();
  const b = freshResearch(22); b.RR.ensureState();
  const linesA = a.R.all().map(n => a.RR.flavorFor(n.id)).join('|');
  const linesB = b.R.all().map(n => b.RR.flavorFor(n.id)).join('|');
  assert.notEqual(linesA, linesB);
});

test('every FLAVOR pool line is used by at least one real node theme', () => {
  const { R } = freshResearch(4);
  const themesInUse = new Set(R.all().map(n => n.theme));
  for (const theme of Object.keys(R.FLAVOR)) assert.ok(themesInUse.has(theme), `FLAVOR has an unused theme pool: ${theme}`);
});
