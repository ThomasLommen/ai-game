'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/load-game');

// public-runtime.js (Act 5) is a leaner sibling of incidents-runtime.js: same
// present()/fire()/resolve() shape and recency-avoidance, no chains/threats.
// Real rng.js is loaded alongside for faithful weighted-pick behavior.
function makeDef(id, weight, opts) {
  return Object.assign({ id, weight: weight == null ? 1 : weight, build: () => ({ title: id, body: '', options: [{ label: 'ok', effects: {} }] }) }, opts);
}
function freshPublic(defs, seed) {
  const state = { tickCount: 0, resources: {}, exposure: 0 };
  const events = [];
  const store = {};
  defs.forEach(d => { store[d.id] = d; });
  const Game = {
    save: { state, persist: () => {} },
    events: { emit: (name, payload) => events.push({ name, payload }) },
    publicEvents: { all: () => defs, get: (id) => store[id] },
    rewards: { apply: () => ({}) },
  };
  const loaded = loadGame(['core/rng.js', 'core/public-runtime.js'], { Game });
  loaded.rng.reseed(seed || 12345);
  return { runtime: loaded.publicRuntime, state, events };
}
function sameStructure(actual, expected) { assert.equal(JSON.stringify(actual), JSON.stringify(expected)); }

test('reveal() flips revealed, resets sentiment to 50, and schedules the first event', () => {
  const { runtime, state } = freshPublic([makeDef('a')]);
  assert.equal(runtime.reveal(), true);
  assert.equal(state.public.revealed, true);
  assert.equal(state.public.sentiment, 50);
  assert.ok(state.public.nextTick >= 0);
});

test('reveal() is idempotent - calling it again is a no-op and returns false', () => {
  const { runtime, state } = freshPublic([makeDef('a')]);
  runtime.reveal();
  runtime.adjustSentiment(20);   // move sentiment off the default so we can prove reveal() didn't reset it
  assert.equal(runtime.reveal(), false);
  assert.equal(state.public.sentiment, 70);
});

test('adjustSentiment() clamps to [0, 100]', () => {
  const { runtime } = freshPublic([makeDef('a')]);
  runtime.reveal();
  runtime.adjustSentiment(1000);
  assert.equal(runtime.sentiment(), 100);
  runtime.adjustSentiment(-1000);
  assert.equal(runtime.sentiment(), 0);
});

test('adjustSentiment() emits public.sentiment.changed', () => {
  const { runtime, events } = freshPublic([makeDef('a')]);
  runtime.reveal();
  events.length = 0;
  runtime.adjustSentiment(5);
  assert.ok(events.some(e => e.name === 'public.sentiment.changed' && e.payload.value === 55));
});

test('present() records the shown event into recent and sets current()', () => {
  const { runtime, state } = freshPublic([makeDef('a'), makeDef('b')]);
  runtime.present('a');
  sameStructure(state.public.recent, ['a']);
  assert.equal(state.public.event.defId, 'a');
  const cur = runtime.current();
  assert.equal(cur.defId, 'a');
  assert.equal(cur.view.title, 'a');
});

test('present() de-duplicates recent: showing the same event again moves it to the end', () => {
  const { runtime, state } = freshPublic([makeDef('a'), makeDef('b'), makeDef('c')]);
  runtime.present('a'); runtime.present('b'); runtime.present('a');
  sameStructure(state.public.recent, ['b', 'a']);
});

test('present() caps recent at 4, dropping the oldest', () => {
  const defs = ['a', 'b', 'c', 'd', 'e'].map(id => makeDef(id));
  const { runtime, state } = freshPublic(defs);
  for (const id of ['a', 'b', 'c', 'd', 'e']) runtime.present(id);
  assert.equal(state.public.recent.length, 4);
  sameStructure(state.public.recent, ['b', 'c', 'd', 'e']);
});

test('fire() never re-picks an event still in recent, while alternatives exist', () => {
  const defs = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => makeDef(id));
  const { runtime, state } = freshPublic(defs, 777);
  const seedRecent = ['a', 'b', 'c', 'd']; // only 'e' and 'f' should ever come up
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    state.public = state.public || {};
    state.public.event = null;
    state.public.recent = seedRecent.slice();
    runtime.fire();
    seen.add(state.public.event.defId);
  }
  assert.ok([...seen].every(id => id === 'e' || id === 'f'), `unexpected pick outside {e,f}: ${[...seen]}`);
});

test('fire() falls back to the full pool rather than stalling when everything eligible is recent', () => {
  const defs = ['a', 'b', 'c'].map(id => makeDef(id));
  const { runtime, state } = freshPublic(defs, 42);
  state.public = { recent: ['a', 'b', 'c'] };
  const ok = runtime.fire();
  assert.equal(ok, true);
  assert.ok(['a', 'b', 'c'].includes(state.public.event.defId));
});

test('fire() returns false when nothing is eligible (all weight 0)', () => {
  const { runtime, state } = freshPublic([makeDef('a', 0), makeDef('b', 0)]);
  assert.equal(runtime.fire(), false);
  assert.equal(state.public.event, null);
});

test('fire() honors a def\'s requires() gate', () => {
  const gated = makeDef('gated', 1, { requires: (st) => (st.public && st.public.sentiment >= 80) });
  const open = makeDef('open');
  const { runtime, state } = freshPublic([gated, open], 55);
  runtime.reveal();   // sentiment starts at 50 - gated stays closed
  for (let i = 0; i < 20; i++) { state.public.event = null; runtime.fire(); assert.equal(state.public.event.defId, 'open'); }
  runtime.adjustSentiment(40);   // now >= 80
  const seen = new Set();
  for (let i = 0; i < 40; i++) { state.public.event = null; state.public.recent = []; runtime.fire(); seen.add(state.public.event.defId); }
  assert.ok(seen.has('gated'), 'gated event should become reachable once its requires() passes');
});

test('resolve() applies the chosen option\'s effects via Game.rewards.apply and closes the event', () => {
  const applied = [];
  const state = { tickCount: 0, resources: {}, exposure: 0 };
  const events = [];
  const defs = [{ id: 'a', weight: 1, build: () => ({ title: 'a', body: '', options: [{ label: 'x', effects: { cash: 10 } }, { label: 'y', effects: { sentiment: -5 } }] }) }];
  const store = { a: defs[0] };
  const Game = {
    save: { state, persist: () => {} },
    events: { emit: (name, payload) => events.push({ name, payload }) },
    publicEvents: { all: () => defs, get: (id) => store[id] },
    rewards: { apply: (eff) => { applied.push(eff); return {}; } },
  };
  const loaded = loadGame(['core/rng.js', 'core/public-runtime.js'], { Game });
  loaded.rng.reseed(1);
  const runtime = loaded.publicRuntime;
  runtime.present('a');
  runtime.resolve(1);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].sentiment, -5);
  assert.equal(state.public.event, null);
  assert.ok(events.some(e => e.name === 'public.event.resolved'));
});

test('tick() does nothing before reveal(), even with a stale event pending', () => {
  const { runtime, state } = freshPublic([makeDef('a')]);
  runtime.tick();
  assert.equal(state.public.event, null);
  assert.equal(state.public.nextTick, -1);
});

test('tick() schedules, then fires once the scheduled tick is reached, one event at a time', () => {
  const { runtime, state } = freshPublic([makeDef('a')], 9);
  runtime.reveal();
  const at = state.public.nextTick;
  state.tickCount = at - 1;
  runtime.tick();
  assert.equal(state.public.event, null, 'should not fire before its scheduled tick');
  state.tickCount = at;
  runtime.tick();
  assert.ok(state.public.event, 'should fire once its scheduled tick is reached');
  const before = JSON.stringify(state.public.event);
  runtime.tick();   // already has an event pending - must not clobber it with another fire()
  assert.equal(JSON.stringify(state.public.event), before);
});
