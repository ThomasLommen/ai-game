'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/load-game');

// missions-runtime.js depends on Game.save.state, Game.missions.all()/baseSuccess/successChance,
// Game.tick.HZ, Game.tasksRuntime.getCpu, Game.rewards.apply, Game.events.emit, and Game.rng
// (real rng.js loaded alongside for faithful weighted-pick behavior).
function makeTmpl(id, weight) {
  return {
    id, name: id, theme: 'x', tier: 1, weight: weight == null ? 1 : weight,
    threads: [1, 1], dur: [10, 10], failExposure: 0,
    reward: () => ({ cash: 10 })
  };
}
function freshMissions(tmpls, seed) {
  const state = { tickCount: 0, resources: { insight: 0 }, tasks: { active: [] }, revealed: { missions: true } };
  const events = [];
  const store = {};
  tmpls.forEach(t => { store[t.id] = t; });
  const Game = {
    save: { state, persist: () => {} },
    events: { emit: (name, payload) => events.push({ name, payload }) },
    missions: { all: () => tmpls, get: (id) => store[id], baseSuccess: () => 0.9, successChance: () => 0.9 },
    tasksRuntime: { getCpu: () => ({ total: 100, allocated: 0 }) },
    tick: { HZ: 4 },
    rewards: { apply: () => {} }
  };
  const loaded = loadGame(['core/rng.js', 'core/missions-runtime.js'], { Game });
  loaded.rng.reseed(seed || 12345);
  return { runtime: loaded.missionRuntime, state, events };
}

// pushContract() rolls exactly one plain-contract offer per call (unlike refreshBoard(),
// which rolls BOARD_SIZE at once) - use it to isolate a single rollOffer() pick.
function rollOne(runtime, state) {
  runtime.ensureState().offers = [];
  runtime.pushContract(false);
  return state.missions.offers[0].missionId;
}

function sameStructure(actual, expected) { assert.equal(JSON.stringify(actual), JSON.stringify(expected)); }

test('refreshBoard() fills the board without repeating a template while enough alternatives exist', () => {
  const tmpls = ['a', 'b', 'c', 'd', 'e'].map(id => makeTmpl(id));
  const { runtime, state } = freshMissions(tmpls, 1);
  runtime.refreshBoard();
  const ids = state.missions.offers.map(o => o.missionId);
  assert.equal(ids.length, runtime.BOARD_SIZE);
  assert.equal(new Set(ids).size, ids.length, `expected no repeats within a board: ${ids}`);
});

test('rollOffer() records the rolled template into recentTemplates, capped at 6', () => {
  const tmpls = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map(id => makeTmpl(id));
  const { runtime, state } = freshMissions(tmpls, 2);
  for (let i = 0; i < 6; i++) runtime.refreshBoard();
  assert.ok(state.missions.recentTemplates.length <= 6);
});

test('rollOffer() avoids a template still in recentTemplates while alternatives exist', () => {
  const tmpls = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(id => makeTmpl(id));
  const { runtime, state } = freshMissions(tmpls, 777);
  const ensure = runtime.ensureState();
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    ensure.recentTemplates = ['a', 'b', 'c', 'd', 'e']; // reset each iteration - only 'f'/'g' are non-recent
    seen.add(rollOne(runtime, state));
  }
  assert.ok([...seen].every(id => id === 'f' || id === 'g'), `unexpected pick outside {f,g}: ${[...seen]}`);
});

test('rollOffer() falls back to the full pool rather than stalling when every template is recent', () => {
  const tmpls = ['a', 'b', 'c'].map(id => makeTmpl(id));
  const { runtime, state } = freshMissions(tmpls, 42);
  const ensure = runtime.ensureState();
  ensure.recentTemplates = ['a', 'b', 'c']; // entire pool is "recently" used
  runtime.refreshBoard();
  assert.equal(state.missions.offers.length, runtime.BOARD_SIZE);
  assert.ok(state.missions.offers.every(o => ['a', 'b', 'c'].includes(o.missionId)));
});

test('rollOffer() respects relative weight among non-recent candidates', () => {
  const tmpls = [makeTmpl('rare', 1), makeTmpl('common', 99)];
  const { runtime, state } = freshMissions(tmpls, 9001);
  const counts = { rare: 0, common: 0 };
  const ensure = runtime.ensureState();
  for (let i = 0; i < 300; i++) {
    ensure.recentTemplates = []; // isolate from the recency mechanic for this check
    counts[rollOne(runtime, state)]++;
  }
  assert.ok(counts.common > counts.rare * 5, `expected 'common' to dominate: ${JSON.stringify(counts)}`);
});

test('refreshBoard() returns null offers gracefully when the template pool is empty', () => {
  const { runtime, state } = freshMissions([]);
  runtime.refreshBoard();
  sameStructure(state.missions.offers, []);
});
