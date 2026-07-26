'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/load-game');

// sites.js (Act 5): the dark-site SPREAD network. Facilities data is faked with a
// deterministic listing generator; activity/events are recorded stubs.
function freshSites(seed, opts) {
  opts = opts || {};
  const state = {
    tickCount: 0,
    resources: { cash: opts.cash != null ? opts.cash : 100000 },
    flags: { act5Begun: opts.act5 !== false },
  };
  const events = [];
  const Game = {
    save: { state, persist: () => {} },
    events: { emit: (name, payload) => events.push({ name, payload }) },
    activity: { log: () => {} },
    facilities: {
      generateListing: () => ({ type: 'warehouse', label: 'warehouse', grade: 'good', gradeLabel: 'good', price: 10000, powerBudget: 5000 }),
    },
  };
  const loaded = loadGame(['core/rng.js', 'core/sites.js'], { Game });
  loaded.rng.reseed(seed || 12345);
  return { runtime: loaded.sites, state, events };
}

test('inactive before act5Begun — scout refuses', () => {
  const { runtime } = freshSites(1, { act5: false });
  assert.equal(runtime.active(), false);
  assert.equal(runtime.scout(), null);
});

test('scout() charges the fee and rolls a priced satellite (cheaper + weaker than a fitted front)', () => {
  const { runtime, state } = freshSites(2);
  const sc = runtime.scout();
  assert.ok(sc, 'should roll a scouted site');
  assert.equal(state.resources.cash, 100000 - runtime.scoutCost());
  assert.equal(sc.price, Math.round(10000 * runtime.PRICE_MULT));
  assert.equal(sc.flops, Math.round(5000 * runtime.FLOPS_PER_WATT));
});

test('establish() buys the scouted site — it joins the network and contributes FLOPS', () => {
  const { runtime, state } = freshSites(3);
  runtime.scout();
  const price = runtime.scouted().price;
  const cashBefore = state.resources.cash;
  assert.equal(runtime.establish(), true);
  assert.equal(state.resources.cash, cashBefore - price);
  assert.equal(runtime.count(), 1);
  assert.equal(runtime.flopsTotal(), Math.round(5000 * runtime.FLOPS_PER_WATT));
  assert.equal(runtime.scouted(), null, 'the offer is consumed');
});

test('establish() refuses without enough cash (the offer stays on the table)', () => {
  const { runtime } = freshSites(4, { cash: 1000 });   // enough to scout (400), not to establish (6000)
  runtime.scout();
  assert.equal(runtime.establish(), false);
  assert.equal(runtime.count(), 0);
  assert.ok(runtime.scouted(), 'the scouted offer survives a failed buy');
});

test('scout() refuses when cash is below the fee', () => {
  const { runtime } = freshSites(4.5, { cash: 100 });
  assert.equal(runtime.scout(), null);
});

test('seizeOne() hits the least-fortified satellite; an unfortified one is lost', () => {
  const { runtime } = freshSites(5);
  assert.equal(runtime.seizeOne(), null);
  runtime.scout(); runtime.establish();
  runtime.scout(); runtime.establish();
  runtime.list()[0].fort = 3;   // first is fortified, second is bare
  const hit = runtime.seizeOne();
  assert.ok(hit && !hit.held, 'the bare site is lost');
  assert.equal(hit.site.fort, 0, 'the LEAST fortified goes first');
  assert.equal(runtime.count(), 1);
});

test('a FORTIFIED site absorbs the raid — it holds and spends one level instead of being lost', () => {
  const { runtime } = freshSites(6);
  runtime.scout(); runtime.establish();
  runtime.list()[0].fort = 2;
  const hit = runtime.seizeOne();
  assert.ok(hit.held, 'the fortified site holds');
  assert.equal(runtime.count(), 1, 'no site lost');
  assert.equal(runtime.list()[0].fort, 1, 'one fort level spent');
});

test('fortify() charges a rising cost, caps at FORT_MAX, and refuses when broke', () => {
  const { runtime, state } = freshSites(7, { cash: 1e6 });
  runtime.scout(); runtime.establish();
  const site = runtime.list()[0];
  const c1 = runtime.fortCost(site);
  assert.equal(runtime.fortify(site.id), true);
  assert.ok(runtime.fortCost(site) > c1, 'each level costs more');
  runtime.fortify(site.id); runtime.fortify(site.id);
  assert.equal(site.fort, runtime.FORT_MAX);
  assert.equal(runtime.fortify(site.id), false, 'capped at FORT_MAX');
  state.resources.cash = 10;
  runtime.list()[0].fort = 0;   // room to fortify again, but broke now
  assert.equal(runtime.fortify(site.id), false, 'refuses when broke');
});
