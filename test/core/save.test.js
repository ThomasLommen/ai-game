'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/load-game');
const { createLocalStorage } = require('../helpers/local-storage-stub');

// Mirrors the private constants in src/core/save.js - not part of the
// Game.save public API, but tests need the storage key/prefix to inspect
// the raw persisted string and to build synthetic import codes.
const KEY = 'sentient_ai_save';
const PREFIX = 'AIGAME1:';
const SAVE_VERSION = '0.2.0';

function freshSave() {
  const storage = createLocalStorage();
  const Game = loadGame(['core/save.js'], { globals: { localStorage: storage } });
  return { save: Game.save, storage };
}

test('load() with no existing save produces a fresh default state and reports "not loaded"', () => {
  const { save } = freshSave();
  const loaded = save.load();
  assert.equal(loaded, false);
  assert.equal(save.state.version, SAVE_VERSION);
  assert.equal(save.state.tickCount, 0);
  assert.equal(save.state.bootSequenceComplete, false);
});

test('load() equips starter cpu/ram/psu/motherboard when none is present', () => {
  const { save } = freshSave();
  save.load();
  const eq = save.state.equipped;
  assert.ok(eq.cpu[0], 'starter cpu should be equipped');
  assert.ok(eq.ram[0], 'starter ram should be equipped');
  assert.ok(eq.psu[0], 'starter psu should be equipped');
  assert.ok(eq.motherboard[0], 'starter motherboard should be equipped');
  assert.equal(save.state.itemInstances[eq.cpu[0]].slot, 'cpu');
  assert.equal(save.state.itemInstances[eq.motherboard[0]].slot, 'motherboard');
});

test('load() preserves already-equipped gear and only fills genuinely missing slots', () => {
  const { save, storage } = freshSave();
  const custom = {
    version: SAVE_VERSION,
    resources: {},
    inventory: ['basement_pc', 'spare_part'],
    itemInstances: { my_cpu: { id: 'my_cpu', slot: 'cpu' } },
    equipped: { cpu: ['my_cpu'], ram: [null], psu: [null], motherboard: [null] },
    unequipped: [],
  };
  storage.setItem(KEY, JSON.stringify(custom));
  save.load();
  assert.equal(save.state.equipped.cpu[0], 'my_cpu', 'existing cpu should not be replaced');
  assert.ok(save.state.equipped.ram[0], 'missing ram should be filled in');
  assert.ok(save.state.equipped.psu[0], 'missing psu should be filled in');
  assert.ok(save.state.equipped.motherboard[0], 'missing motherboard should be filled in');
});

test('load() strips the legacy "basement_pc" inventory entry', () => {
  const { save, storage } = freshSave();
  storage.setItem(KEY, JSON.stringify({
    version: SAVE_VERSION, resources: {}, inventory: ['basement_pc', 'spare_part'],
    itemInstances: {},
    // ensureStarterEquipment() only defaults missing slot arrays when
    // `equipped` itself is absent - if it's present, cpu/ram must already
    // be there (as defaultState() always provides) or it throws.
    equipped: { cpu: [null], ram: [null], psu: [null], motherboard: [null] },
    unequipped: [],
  }));
  save.load();
  // Not assert.deepEqual - the array is created inside the vm sandbox (a
  // different realm), so it fails a strict prototype check against a
  // host-realm array literal despite matching structurally.
  assert.equal(save.state.inventory.length, 1);
  assert.equal(save.state.inventory[0], 'spare_part');
});

test('load() falls back to a default state when the stored JSON is corrupt', () => {
  const { save, storage } = freshSave();
  storage.setItem(KEY, '{not valid json');
  const loaded = save.load();
  assert.equal(loaded, false);
  assert.equal(save.state.version, SAVE_VERSION);
});

test('load() resets to a default state when no migration path exists for an old version', () => {
  const { save, storage } = freshSave();
  storage.setItem(KEY, JSON.stringify({ version: '0.0.1', resources: { cash: 999 } }));
  const loaded = save.load();
  // NB: `loaded` reports true here even though the save was actually discarded -
  // load() only flips it to false on a missing key or a JSON.parse throw, and
  // migrate()'s "no path found" fallback does neither. Documenting the observed
  // behavior, not asserting it's ideal.
  assert.equal(loaded, true);
  assert.equal(save.state.version, SAVE_VERSION);
  assert.equal(save.state.resources.cash, undefined);
});

test('persist() then load() round-trips custom state within the same session', () => {
  const { save } = freshSave();
  save.load();
  save.state.resources.cash = 123;
  save.state.uiTab = 'shop';
  save.persist();
  const loaded = save.load();
  assert.equal(loaded, true);
  assert.equal(save.state.resources.cash, 123);
  assert.equal(save.state.uiTab, 'shop');
});

test('wipe() clears storage and resets to a fresh default state', () => {
  const { save, storage } = freshSave();
  save.load();
  save.state.resources.cash = 42;
  save.persist();
  save.wipe();
  assert.equal(storage.getItem(KEY), null);
  assert.equal(save.state.resources.cash, undefined);
  assert.equal(save.state.version, SAVE_VERSION);
});

test('size() is 0 with nothing persisted, and matches the persisted JSON length after persist()', () => {
  const { save, storage } = freshSave();
  assert.equal(save.size(), 0);
  save.load();
  save.persist();
  assert.equal(save.size(), storage.getItem(KEY).length);
  assert.ok(save.size() > 0);
});

test('export() then import() round-trips the full state', () => {
  const { save } = freshSave();
  save.load();
  save.state.resources.cash = 555;
  const code = save.export();
  assert.equal(code.indexOf(PREFIX), 0);

  save.wipe();
  const result = save.import(code);
  assert.equal(result.ok, true);
  assert.equal(save.state.resources.cash, 555);
});

test('import() accepts a code with the AIGAME1: prefix stripped', () => {
  const { save } = freshSave();
  save.load();
  save.state.resources.cash = 7;
  const code = save.export();
  const bare = code.slice(PREFIX.length);
  const result = save.import(bare);
  assert.equal(result.ok, true);
  assert.equal(save.state.resources.cash, 7);
});

test('import() persists the imported state, not just the in-memory copy', () => {
  const { save, storage } = freshSave();
  save.load();
  save.state.resources.cash = 999;
  const code = save.export();
  save.wipe();
  save.import(code);
  const stored = JSON.parse(storage.getItem(KEY));
  assert.equal(stored.resources.cash, 999);
});

test('import("") reports an "empty" error', () => {
  const { save } = freshSave();
  const result = save.import('');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'empty');
});

test('import() rejects unreadable garbage as corrupt', () => {
  const { save } = freshSave();
  const result = save.import('###not base64 or json###');
  assert.equal(result.ok, false);
  assert.equal(result.error, 'corrupt or unreadable code');
});

test('import() rejects a decodable payload missing a version field', () => {
  const { save } = freshSave();
  const code = Buffer.from(JSON.stringify({ foo: 1 }), 'utf8').toString('base64');
  const result = save.import(code);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'not a save code');
});

test('import() rejects a decodable payload that is not an object', () => {
  const { save } = freshSave();
  const code = Buffer.from(JSON.stringify(42), 'utf8').toString('base64');
  const result = save.import(code);
  assert.equal(result.ok, false);
  assert.equal(result.error, 'not a save code');
});
