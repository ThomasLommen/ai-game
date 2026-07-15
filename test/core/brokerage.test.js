'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/load-game');

// brokerage.js depends on Game.save.state/persist, Game.flops.total(),
// Game.legit.score(), and Game.events.emit(). Everything is recorded on the
// stub so assertions can check both state mutation and side effects.
function freshBrokerage({ totalFlops = 0, legitScore = 0, state = {} } = {}) {
  const events = [];
  let persistCalls = 0;
  const Game = {
    save: {
      state: state,
      persist: () => { persistCalls++; },
    },
    flops: { total: () => totalFlops },
    legit: { score: () => legitScore },
    events: { emit: (name, payload) => events.push({ name, payload }) },
  };
  const brokerage = loadGame(['core/brokerage.js'], { Game }).brokerage;
  return { brokerage, Game, events, persistCalls: () => persistCalls };
}

test('ensure() defaults alloc to 0 and creates s.brokerage', () => {
  const { brokerage, Game } = freshBrokerage();
  const b = brokerage.ensure();
  assert.equal(b.alloc, 0);
  assert.equal(Game.save.state.brokerage, b);
});

test('ensure() clamps an out-of-range alloc into [0, 1]', () => {
  const { brokerage, Game } = freshBrokerage({ state: { brokerage: { alloc: 5 } } });
  assert.equal(brokerage.ensure().alloc, 1);

  const { brokerage: b2, Game: g2 } = freshBrokerage({ state: { brokerage: { alloc: -3 } } });
  assert.equal(b2.ensure().alloc, 0);
});

test('active() is false without act4Begun', () => {
  const { brokerage } = freshBrokerage({ totalFlops: 100, state: { flags: {} } });
  assert.equal(brokerage.active(), false);
});

test('active() is false with act4Begun but zero compute', () => {
  const { brokerage } = freshBrokerage({ totalFlops: 0, state: { flags: { act4Begun: true } } });
  assert.equal(brokerage.active(), false);
});

test('active() is true once the front is begun and there is compute to lease', () => {
  const { brokerage } = freshBrokerage({ totalFlops: 50, state: { flags: { act4Begun: true } } });
  assert.equal(brokerage.active(), true);
});

test('leasedFlops()/freeFlops() split total compute by the alloc fraction', () => {
  const { brokerage } = freshBrokerage({ totalFlops: 100, state: { brokerage: { alloc: 0.25 } } });
  assert.equal(brokerage.totalFlops(), 100);
  assert.equal(brokerage.leasedFlops(), 25);
  assert.equal(brokerage.freeFlops(), 75);
});

test('legitMult() is 0.5x at zero legitimacy', () => {
  const { brokerage } = freshBrokerage({ legitScore: 0 });
  assert.equal(brokerage.legitMult(), 0.5);
});

test('legitMult() climbs linearly with legitimacy score', () => {
  const { brokerage } = freshBrokerage({ legitScore: 250 });
  assert.equal(brokerage.legitMult(), 2.0); // 0.5 + 250 * 0.006
});

test('legitMult() never drops below 0.5 even with negative legitimacy', () => {
  const { brokerage } = freshBrokerage({ legitScore: -100 });
  assert.equal(brokerage.legitMult(), 0.5);
});

test('cashPerSec() combines leased flops, the flat rate, and the legitimacy multiplier', () => {
  const { brokerage } = freshBrokerage({
    totalFlops: 100,
    legitScore: 0,
    state: { brokerage: { alloc: 0.5 } },
  });
  // leased = 50, CASH_PER_FLOP = 0.045, legitMult = 0.5 -> 50 * 0.045 * 0.5
  assert.equal(brokerage.cashPerSec(), 50 * brokerage.CASH_PER_FLOP * 0.5);
});

test('setAlloc() clamps into [0, 1], updates state, emits agents.changed, and persists', () => {
  const { brokerage, Game, events, persistCalls } = freshBrokerage();
  brokerage.setAlloc(1.5);
  assert.equal(Game.save.state.brokerage.alloc, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0].name, 'agents.changed');
  assert.equal(persistCalls(), 1);

  brokerage.setAlloc(-2);
  assert.equal(Game.save.state.brokerage.alloc, 0);
});

test('setAlloc() is a no-op (no event, no persist) when the value does not change', () => {
  const { brokerage, events, persistCalls } = freshBrokerage({ state: { brokerage: { alloc: 0.5 } } });
  brokerage.setAlloc(0.5);
  assert.equal(events.length, 0);
  assert.equal(persistCalls(), 0);
});

test('tick() does nothing while inactive', () => {
  const { brokerage, Game, events } = freshBrokerage({
    totalFlops: 100,
    state: { flags: {}, brokerage: { alloc: 1 }, resources: { cash: 10 } },
  });
  brokerage.tick();
  assert.equal(Game.save.state.resources.cash, 10);
  assert.equal(events.length, 0);
});

test('tick() does nothing when active but leasing zero compute', () => {
  const { brokerage, Game, events } = freshBrokerage({
    totalFlops: 100,
    legitScore: 100,
    state: { flags: { act4Begun: true }, brokerage: { alloc: 0 }, resources: { cash: 10 } },
  });
  brokerage.tick();
  assert.equal(Game.save.state.resources.cash, 10);
  assert.equal(events.length, 0);
});

test('tick() adds cashPerSec/HZ to cash and emits resource.changed when active', () => {
  const { brokerage, Game, events } = freshBrokerage({
    totalFlops: 100,
    legitScore: 0,
    state: { flags: { act4Begun: true }, brokerage: { alloc: 0.5 }, resources: { cash: 10 } },
  });
  const cps = brokerage.cashPerSec();
  brokerage.tick();
  assert.equal(Game.save.state.resources.cash, 10 + cps / 4);
  assert.equal(events.length, 1);
  // NB: not assert.deepEqual here - payload is an object literal created
  // inside the vm sandbox (a different realm), so it fails a strict
  // reference/prototype check against a host-realm object despite matching
  // structurally. Compare fields individually instead.
  assert.equal(events[0].name, 'resource.changed');
  assert.equal(events[0].payload.id, 'cash');
});
