'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/load-game');

// cycle.js reads Game.tick.HZ unconditionally (no `Game.tick &&` guard), so
// every test stubs it. effects/constraints/researchRuntime/changers are all
// optional (each access is guarded with `Game.x ? ... : default`).
function freshCycle(stubs = {}) {
  const Game = {
    tick: { HZ: 4 },
    ...stubs,
  };
  return loadGame(['core/cycle.js'], { Game }).cycle;
}

test('BASE_SEC is 5', () => {
  assert.equal(freshCycle().BASE_SEC, 5);
});

test('perCycle() scales a per-second rate by BASE_SEC', () => {
  const cycle = freshCycle();
  assert.equal(cycle.perCycle(2), 10);
  assert.equal(cycle.perCycle(0), 0);
});

test('speed() defaults to 1 when no optional systems are present', () => {
  const cycle = freshCycle();
  assert.equal(cycle.speed(), 1);
});

test('speed() applies the cycle.speed effect multiplier', () => {
  const cycle = freshCycle({
    effects: { apply: (base, key) => (key === 'cycle.speed' ? base * 3 : base) },
  });
  assert.equal(cycle.speed(), 3);
});

test('speed() applies heat throttle from constraints', () => {
  const cycle = freshCycle({
    constraints: { heatThrottle: () => 0.5 },
  });
  assert.equal(cycle.speed(), 0.5);
});

test('heat_engine mod overclocks proportionally to how much heat would have throttled', () => {
  const cycle = freshCycle({
    constraints: { heatThrottle: () => 0.5 },
    researchRuntime: { hasMod: (id) => id === 'heat_engine' },
  });
  // thr = 1 + (1 - 0.5) * 1.5 = 1.75
  assert.equal(cycle.speed(), 1.75);
});

test('thermal_runaway mod wins over heat_engine when it would be faster', () => {
  const cycle = freshCycle({
    constraints: { heatThrottle: () => 0.5 },
    researchRuntime: { hasMod: (id) => id === 'heat_engine' || id === 'thermal_runaway' }, // both thermal mods active
  });
  // heat_engine thr = 1.75, thermal_runaway thr = 1 + (1 - 0.5) * 2.5 = 2.25 -> max wins
  assert.equal(cycle.speed(), 2.25);
});

test('thermal_runaway alone (no heat_engine) still applies', () => {
  const cycle = freshCycle({
    constraints: { heatThrottle: () => 0.2 },
    researchRuntime: { hasMod: (id) => id === 'thermal_runaway' },
  });
  // rawThr = 0.2, thr starts at 0.2 (no heat_engine), thermal = 1 + 0.8*2.5 = 3 -> max(0.2, 3) = 3
  assert.equal(cycle.speed(), 3);
});

test('polymath and resonance synergies stack multiplicatively', () => {
  const cycle = freshCycle({
    researchRuntime: { hasMod: (id) => id === 'polymath' || id === 'resonance' },
    changers: { domainsCount: () => 2, exoticCount: () => 1 },
  });
  // syn = (1 + 0.08*2) * (1 + 0.03*1) = 1.16 * 1.03 = 1.1948
  assert.ok(Math.abs(cycle.speed() - 1.1948) < 1e-9);
});

test('speed() never drops below the 0.05 floor even with a negative effect', () => {
  const cycle = freshCycle({
    effects: { apply: () => -10 },
  });
  assert.equal(cycle.speed(), 0.05);
});

test('len() derives tick length from BASE_SEC, tick.HZ, and speed', () => {
  const cycle = freshCycle(); // speed() === 1, tick.HZ === 4
  assert.equal(cycle.len(), 20); // round(5 * 4 * 1)
});

test('len() shrinks as speed increases and never drops below 1', () => {
  const cycle = freshCycle({
    effects: { apply: (base) => base * 1000 },
  });
  assert.equal(cycle.len(), 1);
});

test('len() grows as speed drops (heat throttle stretches the bar)', () => {
  const cycle = freshCycle({
    constraints: { heatThrottle: () => 0.25 },
  });
  assert.equal(cycle.len(), 80); // round(5 * 4 * (1/0.25))
});

test('advance() increments cycle count and only completes at cycleLen', () => {
  const cycle = freshCycle(); // len() === 20
  const inst = {};
  for (let i = 1; i <= 19; i++) {
    assert.equal(cycle.advance(inst), false, `unexpected completion at tick ${i}`);
    assert.equal(inst.cycle, i);
  }
  assert.equal(cycle.advance(inst), true); // 20th tick completes
  assert.equal(inst.cycle, 0); // resets
});

test('advance() recomputes cycleLen on the instance every call', () => {
  const cycle = freshCycle();
  const inst = {};
  cycle.advance(inst);
  assert.equal(inst.cycleLen, 20);
});
