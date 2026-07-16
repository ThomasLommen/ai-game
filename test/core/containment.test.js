'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/load-game');

// containment.js (Act 5) mirrors raids.js's THREAT LOOP shape almost exactly, but
// inverted: low sentiment (not loud activity) opens the door. Real rng.js is loaded
// alongside for faithful weighted-pick / chance behavior.
function freshContainment(seed, opts) {
  opts = opts || {};
  const state = { tickCount: 0, resources: { cash: opts.cash != null ? opts.cash : 1000 }, public: { revealed: opts.revealed !== false, sentiment: opts.sentiment != null ? opts.sentiment : 20 } };
  const sentimentAdjustments = [];
  const seized = [];
  const events = [];
  const Game = {
    save: { state, persist: () => {} },
    events: { emit: (name, payload) => events.push({ name, payload }) },
    publicRuntime: {
      sentiment: () => state.public.sentiment,
      adjustSentiment: (d) => { state.public.sentiment = Math.max(0, Math.min(100, state.public.sentiment + d)); sentimentAdjustments.push(d); return state.public.sentiment; },
    },
    legit: { seizeLoudest: () => (opts.seizeReturns !== undefined ? opts.seizeReturns : (() => { const m = { classLabel: 'rack' }; seized.push(m); return m; })()) },
  };
  const loaded = loadGame(['core/rng.js', 'core/containment.js'], { Game });
  loaded.rng.reseed(seed || 12345);
  return { runtime: loaded.containment, state, events, sentimentAdjustments, seized };
}

test('active() reflects state.public.revealed', () => {
  const { runtime, state } = freshContainment(1);
  assert.equal(runtime.active(), true);
  state.public.revealed = false;
  assert.equal(runtime.active(), false);
});

test('pressure() is 0 at or above FLOOR sentiment, and rises as sentiment drops below it', () => {
  const { runtime, state } = freshContainment(1, { sentiment: 60 });
  assert.equal(runtime.pressure(), 0);
  state.public.sentiment = 10;
  assert.equal(runtime.pressure(), runtime.FLOOR - 10);
});

test('tick() seeds no leads while sentiment is at or above FLOOR', () => {
  const { runtime, state } = freshContainment(2, { sentiment: 40 });
  for (let i = 0; i < 50; i++) { state.tickCount += 10; runtime.tick(); }
  assert.equal(runtime.pending(), 0);
});

test('tick() seeds leads once sentiment drops below FLOOR, up to MAX_CONTACTS', () => {
  const { runtime, state } = freshContainment(3, { sentiment: 5 });
  for (let i = 0; i < 20000 && runtime.pending() < runtime.MAX_CONTACTS; i++) { state.tickCount += 5; runtime.tick(); }
  assert.equal(runtime.pending(), runtime.MAX_CONTACTS);
});

test('detect() marks all pending contacts detected and only returns the newly-detected ones', () => {
  const { runtime, state } = freshContainment(4, { sentiment: 0 });
  runtime.seedOne(); runtime.seedOne();
  const first = runtime.detect();
  assert.equal(first.length, 2);
  assert.ok(runtime.contacts().every(c => c.detected));
  const second = runtime.detect();
  assert.equal(second.length, 0);
});

test('cut() spends cash and removes the contact, without touching sentiment', () => {
  const { runtime, state, sentimentAdjustments } = freshContainment(5, { sentiment: 0, cash: 1000 });
  const c = runtime.seedOne();
  const cost = runtime.cutCost(c);
  assert.equal(runtime.cut(c.id), true);
  assert.equal(state.resources.cash, 1000 - cost);
  assert.equal(runtime.pending(), 0);
  assert.equal(sentimentAdjustments.length, 0);
});

test('cut() fails without enough cash, leaving the contact in place', () => {
  const { runtime } = freshContainment(6, { sentiment: 0, cash: 0 });
  const c = runtime.seedOne();
  assert.equal(runtime.cut(c.id), false);
  assert.equal(runtime.pending(), 1);
});

test('deflect() spends sentiment (not cash) and removes the contact', () => {
  const { runtime, state, sentimentAdjustments } = freshContainment(7, { sentiment: 30, cash: 0 });
  const c = runtime.seedOne();
  const cost = runtime.deflectCost(c);
  assert.equal(runtime.deflect(c.id), true);
  assert.equal(state.public.sentiment, 30 - cost);
  assert.equal(sentimentAdjustments[0], -cost);
  assert.equal(runtime.pending(), 0);
});

test('deflect() fails when sentiment is below the deflect cost', () => {
  const { runtime, state } = freshContainment(8, { sentiment: 1 });
  const c = runtime.seedOne();
  assert.ok(!runtime.canDeflect(c));
  assert.equal(runtime.deflect(c.id), false);
  assert.equal(runtime.pending(), 1);
  assert.equal(state.public.sentiment, 1);   // untouched by the failed attempt
});

test('misdirect() either removes the contact (success) or speeds it up (failure), never both', () => {
  const outcomes = { removed: 0, sped: 0 };
  for (let seed = 1; seed <= 40; seed++) {
    const { runtime, state } = freshContainment(seed, { sentiment: 0 });
    const c = runtime.seedOne();
    const landsBefore = c.landsAtTick;
    const r = runtime.misdirect(c.id);
    if (r.ok) { outcomes.removed++; assert.equal(runtime.pending(), 0); }
    else { outcomes.sped++; assert.equal(runtime.pending(), 1); assert.ok(runtime.contacts()[0].landsAtTick < landsBefore); }
  }
  assert.ok(outcomes.removed > 0 && outcomes.sped > 0, `expected both outcomes across 40 seeds: ${JSON.stringify(outcomes)}`);
});

test('land() applies a cash fine, seizes a machine via Game.legit, forces a lie-low window, and dents sentiment', () => {
  const { runtime, state, seized } = freshContainment(9, { sentiment: 30, cash: 5000 });
  const c = runtime.seedOne();
  const cashBefore = state.resources.cash, sentBefore = state.public.sentiment;
  runtime.land(c);
  assert.ok(state.resources.cash < cashBefore, 'a landed raid should cost cash');
  assert.equal(seized.length, 1, 'should have seized exactly one machine');
  assert.ok(state.powerLockedUntilTick > 0, 'should force a lie-low window');
  assert.equal(state.public.sentiment, sentBefore - 6);   // LAND_SENTIMENT_HIT
  assert.equal(runtime.pending(), 0);
});

test('tick() lands overdue contacts even after sentiment has recovered above FLOOR', () => {
  const { runtime, state } = freshContainment(10, { sentiment: 5 });
  const c = runtime.seedOne();
  state.public.sentiment = 90;   // recovered - but this contact is already in motion
  state.tickCount = c.landsAtTick;
  runtime.tick();
  assert.equal(runtime.pending(), 0, 'the in-flight contact should still land on its own timer');
});

test('tick() is a no-op entirely when not active (pre-reveal)', () => {
  const { runtime, state } = freshContainment(11, { revealed: false, sentiment: 0 });
  for (let i = 0; i < 100; i++) { state.tickCount += 100; runtime.tick(); }
  assert.equal(runtime.pending(), 0);
});
