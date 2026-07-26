'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/load-game');

// reserves.js (Act 5): the one-way, raid-proof stash (secretly the Act-6 war chest).
function freshReserves(opts) {
  opts = opts || {};
  const state = {
    tickCount: 0,
    resources: { cash: opts.cash != null ? opts.cash : 5000 },
    flags: { act5Begun: opts.act5 !== false },
  };
  const Game = {
    save: { state, persist: () => {} },
    events: { emit: () => {} },
    activity: { log: () => {} },
    sites: { count: () => (opts.sites != null ? opts.sites : 0) },
  };
  const loaded = loadGame(['core/reserves.js'], { Game });
  return { runtime: loaded.reserves, state };
}

test('bank() moves cash into reserves one-way, clamped to available cash', () => {
  const { runtime, state } = freshReserves({ cash: 5000 });
  assert.equal(runtime.bank(2000), 2000);
  assert.equal(state.resources.cash, 3000);
  assert.equal(runtime.total(), 2000);
  assert.equal(runtime.bank(99999), 3000, 'clamped to what you have');
  assert.equal(state.resources.cash, 0);
  assert.equal(runtime.total(), 5000);
});

test('bank() refuses zero/negative and no-ops when broke', () => {
  const { runtime } = freshReserves({ cash: 0 });
  assert.equal(runtime.bank(1000), 0);
  assert.equal(runtime.bank(-50), 0);
  assert.equal(runtime.total(), 0);
});

test('dark sites trickle reserves in on their own; no sites, no trickle', () => {
  const { runtime } = freshReserves({ sites: 3 });
  for (let i = 0; i < 40; i++) runtime.tick();   // 10s at 4Hz
  assert.ok(Math.abs(runtime.total() - 3 * runtime.SITE_TRICKLE_PER_SEC * 10) < 1e-9);
  const { runtime: r2 } = freshReserves({ sites: 0 });
  for (let i = 0; i < 40; i++) r2.tick();
  assert.equal(r2.total(), 0);
});

test('inactive before act5Begun — tick is a no-op', () => {
  const { runtime } = freshReserves({ act5: false, sites: 5 });
  for (let i = 0; i < 40; i++) runtime.tick();
  assert.equal(runtime.total(), 0);
});
