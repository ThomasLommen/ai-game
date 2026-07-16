'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/load-game');

// incidents-runtime.js depends on Game.save.state, Game.incidents.all()/get(),
// Game.events.emit, and Game.rng (real rng.js is loaded alongside for faithful
// weighted-pick behavior rather than a mock).
function makeDef(id, weight) {
  return { id, weight: weight == null ? 1 : weight, build: () => ({ options: [{ label: 'ok', safe: true }] }) };
}
function freshIncidents(defs, seed) {
  const state = { tickCount: 0, resources: {}, exposure: 0 };
  const events = [];
  const store = {};
  defs.forEach(d => { store[d.id] = d; });
  const Game = {
    save: { state, persist: () => {} },
    events: { emit: (name, payload) => events.push({ name, payload }) },
    incidents: { all: () => defs, get: (id) => store[id] },
  };
  const loaded = loadGame(['core/rng.js', 'core/incidents-runtime.js'], { Game });
  loaded.rng.reseed(seed || 12345);
  return { runtime: loaded.incidentRuntime, state, events };
}

// Not assert.deepEqual - incidentRecent is an array built inside the vm sandbox
// (a different realm), which fails Node's strict prototype check against a
// host-realm array literal despite matching structurally. JSON.stringify
// sidesteps the realm entirely.
function sameStructure(actual, expected) { assert.equal(JSON.stringify(actual), JSON.stringify(expected)); }

test('present() records the shown incident into incidentRecent', () => {
  const { runtime, state } = freshIncidents([makeDef('a'), makeDef('b')]);
  runtime.present('a');
  sameStructure(state.incidentRecent, ['a']);
  assert.equal(state.incident.defId, 'a');
});

test('present() de-duplicates: showing the same incident again moves it to the end, not a duplicate', () => {
  const { runtime, state } = freshIncidents([makeDef('a'), makeDef('b'), makeDef('c')]);
  runtime.present('a');
  runtime.present('b');
  runtime.present('a');
  sameStructure(state.incidentRecent, ['b', 'a']);
});

test('present() caps incidentRecent at 5, dropping the oldest', () => {
  const defs = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => makeDef(id));
  const { runtime, state } = freshIncidents(defs);
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) runtime.present(id);
  assert.equal(state.incidentRecent.length, 5);
  sameStructure(state.incidentRecent, ['b', 'c', 'd', 'e', 'f']); // 'a' aged out
});

test('fire() never re-picks an incident still in the recent list, while alternatives exist', () => {
  const defs = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => makeDef(id));
  const { runtime, state } = freshIncidents(defs, 777);
  const seedRecent = ['a', 'b', 'c', 'd', 'e']; // only 'f' and 'g' should ever come up
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    state.incident = null;
    state.incidentRecent = seedRecent.slice(); // fire()->present() mutates this - reset each iteration
    runtime.fire();
    seen.add(state.incident.defId);
  }
  assert.ok([...seen].every(id => id === 'f' || id === 'g'), `unexpected pick outside {f,g}: ${[...seen]}`);
});

test('fire() falls back to the full pool (allows a repeat) rather than stalling when everything eligible is recent', () => {
  const defs = ['a', 'b', 'c'].map(id => makeDef(id));
  const { runtime, state } = freshIncidents(defs, 42);
  state.incidentRecent = ['a', 'b', 'c']; // the entire eligible pool has been "recently" shown
  const ok = runtime.fire();
  assert.equal(ok, true);
  assert.ok(['a', 'b', 'c'].includes(state.incident.defId));
});

test('fire() respects relative weight among non-recent candidates', () => {
  const defs = [makeDef('rare', 1), makeDef('common', 99)];
  const { runtime, state } = freshIncidents(defs, 9001);
  const counts = { rare: 0, common: 0 };
  for (let i = 0; i < 300; i++) {
    state.incident = null; state.incidentRecent = []; // isolate from the recency mechanic for this check
    runtime.fire();
    counts[state.incident.defId]++;
  }
  assert.ok(counts.common > counts.rare * 5, `expected 'common' to dominate: ${JSON.stringify(counts)}`);
});

test('fire() returns false when nothing is eligible (all weight 0)', () => {
  const { runtime, state } = freshIncidents([makeDef('a', 0), makeDef('b', 0)]);
  assert.equal(runtime.fire(), false);
  assert.equal(state.incident, null);
});

test('fire() honors a def\'s requires() gate', () => {
  const gated = { id: 'gated', weight: 1, requires: (st) => st.resources.cash >= 100, build: () => ({ options: [] }) };
  const open = makeDef('open');
  const { runtime, state } = freshIncidents([gated, open], 55);
  for (let i = 0; i < 20; i++) { state.incident = null; runtime.fire(); assert.equal(state.incident.defId, 'open'); }
  state.resources.cash = 100;
  const seen = new Set();
  for (let i = 0; i < 40; i++) { state.incident = null; state.incidentRecent = []; runtime.fire(); seen.add(state.incident.defId); }
  assert.ok(seen.has('gated'), 'gated incident should become reachable once its requires() passes');
});
