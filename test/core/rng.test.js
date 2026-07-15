'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/load-game');

function freshRng() {
  return loadGame(['core/rng.js']).rng;
}

test('reseed + next is deterministic for a given seed', () => {
  const rng = freshRng();
  rng.reseed(42);
  const a = [rng.next(), rng.next(), rng.next()];
  rng.reseed(42);
  const b = [rng.next(), rng.next(), rng.next()];
  assert.deepEqual(a, b);
});

test('reseed(0) falls back to seed 1 (falsy-seed guard)', () => {
  const rng = freshRng();
  rng.reseed(0);
  const a = rng.next();
  rng.reseed(1);
  const b = rng.next();
  assert.equal(a, b);
});

test('different seeds diverge', () => {
  const rng = freshRng();
  rng.reseed(1);
  const a = rng.next();
  rng.reseed(2);
  const b = rng.next();
  assert.notEqual(a, b);
});

test('next() stays within [0, 1)', () => {
  const rng = freshRng();
  rng.reseed(7);
  for (let i = 0; i < 2000; i++) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1, `next() out of range: ${v}`);
  }
});

test('int(min, max) is inclusive on both ends and never out of range', () => {
  const rng = freshRng();
  rng.reseed(123);
  let sawMin = false, sawMax = false;
  for (let i = 0; i < 5000; i++) {
    const v = rng.int(3, 5);
    assert.ok(v >= 3 && v <= 5, `int() out of range: ${v}`);
    assert.equal(v, Math.trunc(v));
    if (v === 3) sawMin = true;
    if (v === 5) sawMax = true;
  }
  assert.ok(sawMin, 'never rolled the minimum in 5000 draws');
  assert.ok(sawMax, 'never rolled the maximum in 5000 draws');
});

test('int(n, n) always returns n', () => {
  const rng = freshRng();
  rng.reseed(9);
  for (let i = 0; i < 50; i++) assert.equal(rng.int(4, 4), 4);
});

test('chance(0) is never true, chance(1) is always true', () => {
  const rng = freshRng();
  rng.reseed(55);
  for (let i = 0; i < 500; i++) {
    assert.equal(rng.chance(0), false);
    assert.equal(rng.chance(1), true);
  }
});

test('pick() returns undefined for an empty array', () => {
  const rng = freshRng();
  assert.equal(rng.pick([]), undefined);
});

test('pick() always returns a member of the array', () => {
  const rng = freshRng();
  rng.reseed(3);
  const arr = ['a', 'b', 'c'];
  for (let i = 0; i < 200; i++) assert.ok(arr.includes(rng.pick(arr)));
});

test('pick() on a single-element array always returns that element', () => {
  const rng = freshRng();
  rng.reseed(3);
  for (let i = 0; i < 20; i++) assert.equal(rng.pick(['only']), 'only');
});

test('weighted() returns undefined for an empty array', () => {
  const rng = freshRng();
  assert.equal(rng.weighted([]), undefined);
});

test('weighted() falls back to arr[0] when all weights are zero', () => {
  const rng = freshRng();
  rng.reseed(11);
  const arr = [{ w: 0 }, { w: 0 }, { w: 0 }];
  for (let i = 0; i < 20; i++) {
    assert.equal(rng.weighted(arr, x => x.w), arr[0]);
  }
});

test('weighted() only ever selects entries with positive weight', () => {
  const rng = freshRng();
  rng.reseed(2024);
  const arr = [{ id: 'never', w: 0 }, { id: 'always', w: 1 }];
  for (let i = 0; i < 200; i++) {
    assert.equal(rng.weighted(arr, x => x.w).id, 'always');
  }
});

test('weighted() defaults to x.weight, but a falsy weight (0/undefined) still counts as 1', () => {
  // `x.weight || 1` in the implementation means an explicit weight: 0 is
  // indistinguishable from "no weight set" - both resolve to 1, not 0.
  const rng = freshRng();
  rng.reseed(2024);
  const arr = [{ id: 'zero', weight: 0 }, { id: 'unset' }];
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(rng.weighted(arr).id);
  assert.ok(seen.has('zero'), 'weight: 0 should still be pickable (treated as 1)');
  assert.ok(seen.has('unset'), 'a missing weight should default to 1');
});

test('rollSeed() produces a positive uint32-range integer', () => {
  const rng = freshRng();
  for (let i = 0; i < 100; i++) {
    const seed = rng.rollSeed();
    assert.equal(Number.isInteger(seed), true);
    assert.ok(seed >= 1 && seed <= 0xFFFFFFFF, `seed out of range: ${seed}`);
  }
});
