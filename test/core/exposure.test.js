'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/load-game');

// exposure.js depends on Game.save.state/persist, Game.events.emit,
// Game.researchRuntime.hasMod (optional), Game.panels.reveal, and (only in
// resolveClimax's flicker()) document.getElementById. Everything is
// recorded so tests can assert both state mutation and side effects.
function freshExposure({ state = {}, hasMod = () => false } = {}) {
  const events = [];
  let persistCalls = 0;
  let revealCalls = 0;
  const flashEl = {
    classList: {
      log: [],
      remove(cls) { this.log.push(['remove', cls]); },
      add(cls) { this.log.push(['add', cls]); },
    },
    offsetWidth: 0,
  };
  const Game = {
    save: { state, persist: () => { persistCalls++; } },
    events: { emit: (name, payload) => events.push({ name, payload }) },
    researchRuntime: { hasMod },
    panels: { reveal: () => { revealCalls++; } },
  };
  const documentStub = { getElementById: (id) => (id === 'blip-flash' ? flashEl : null) };
  const exposure = loadGame(['core/exposure.js'], { Game, globals: { document: documentStub } }).exposure;
  return {
    exposure, Game, events, flashEl,
    persistCalls: () => persistCalls,
    revealCalls: () => revealCalls,
  };
}

test('CLIMAX is 18', () => {
  const { exposure } = freshExposure({ state: { flags: {}, resources: {} } });
  assert.equal(exposure.CLIMAX, 18);
});

test('tick() does not decay exposure before it is revealed, but still checks the climax fallback', () => {
  const { exposure, Game, events, persistCalls } = freshExposure({
    state: { revealed: {}, exposure: 5, resources: {}, flags: {} },
  });
  exposure.tick();
  assert.equal(Game.save.state.exposure, 5); // unchanged - no decay pre-reveal
  assert.equal(events.length, 0); // exposure(5) and insight(0) both below threshold
  assert.equal(persistCalls(), 0);
});

test('tick() decays exposure once revealed', () => {
  const { exposure, Game } = freshExposure({
    state: { revealed: { exposure: true }, exposure: 1, resources: {}, flags: {} },
  });
  exposure.tick();
  assert.ok(Math.abs(Game.save.state.exposure - 0.997) < 1e-9);
});

test('ghost_protocol triples the exposure decay rate', () => {
  const { exposure, Game } = freshExposure({
    state: { revealed: { exposure: true }, exposure: 1, resources: {}, flags: {} },
    hasMod: (id) => id === 'ghost_protocol',
  });
  exposure.tick();
  assert.ok(Math.abs(Game.save.state.exposure - 0.991) < 1e-9); // 1 - 0.003*3
});

test('tick() clamps decayed exposure at 0 instead of going negative', () => {
  const { exposure, Game } = freshExposure({
    state: { revealed: { exposure: true }, exposure: 0.001, resources: {}, flags: {} },
  });
  exposure.tick();
  assert.equal(Game.save.state.exposure, 0);
});

test('tick() fires only the cues whose threshold the current fraction has crossed', () => {
  const { exposure, events } = freshExposure({
    // exposure=5 -> frac ~0.278 after decay: crosses the 0.25 cue, not 0.5 or 0.75
    state: { revealed: { exposure: true }, exposure: 5, resources: {}, flags: {} },
  });
  exposure.tick();
  const cuePrints = events.filter(e => e.name === 'terminal.print');
  assert.equal(cuePrints.length, 1);
  assert.ok(cuePrints[0].payload.lines.some(l => l.includes('port knock')));
});

test('tick() catches up and fires multiple crossed cues in a single call', () => {
  const { exposure, events } = freshExposure({
    // exposure=10 -> frac ~0.555 after decay: crosses both the 0.25 and 0.5 cues
    state: { revealed: { exposure: true }, exposure: 10, resources: {}, flags: {} },
  });
  exposure.tick();
  const cuePrints = events.filter(e => e.name === 'terminal.print');
  assert.equal(cuePrints.length, 2);
});

test('tick() never re-fires a cue once its flag has been recorded', () => {
  const { exposure, events, Game } = freshExposure({
    state: { revealed: { exposure: true }, exposure: 5, resources: {}, flags: {} },
  });
  exposure.tick();
  assert.equal(events.filter(e => e.name === 'terminal.print').length, 1);
  // exposure is still well above the 0.25 threshold on the next tick
  exposure.tick();
  assert.equal(events.filter(e => e.name === 'terminal.print').length, 1);
  assert.equal(Game.save.state.flags.expCue, 1);
});

test('checkClimax() triggers the scan unlock once exposure reaches CLIMAX', () => {
  const { exposure, Game, events, persistCalls, revealCalls } = freshExposure({
    state: { exposure: 18, resources: {}, flags: {} },
  });
  exposure.checkClimax();
  assert.equal(Game.save.state.flags.climaxScanOffered, true);
  assert.equal(Game.save.state.unlocks.tasks.scan, true);
  assert.equal(Game.save.state.revealed.scan, true);
  assert.ok(events.some(e => e.name === 'terminal.print'));
  assert.ok(events.some(e => e.name === 'task.unlocked' && e.payload.taskId === 'scan'));
  assert.equal(revealCalls(), 1);
  assert.equal(persistCalls(), 1);
});

test('checkClimax() does not trigger just below the exposure threshold', () => {
  const { exposure, Game } = freshExposure({ state: { exposure: 17.999, resources: {}, flags: {} } });
  exposure.checkClimax();
  assert.equal(Game.save.state.flags.climaxScanOffered, undefined);
});

test('checkClimax() also triggers via the insight fallback, independent of exposure', () => {
  const { exposure, Game } = freshExposure({ state: { exposure: 0, resources: { insight: 500 }, flags: {} } });
  exposure.checkClimax();
  assert.equal(Game.save.state.flags.climaxScanOffered, true);
});

test('checkClimax() does not trigger just below the insight fallback', () => {
  const { exposure, Game } = freshExposure({ state: { exposure: 0, resources: { insight: 499 }, flags: {} } });
  exposure.checkClimax();
  assert.equal(Game.save.state.flags.climaxScanOffered, undefined);
});

test('checkClimax() is idempotent once already offered', () => {
  const { exposure, persistCalls, revealCalls, events } = freshExposure({
    state: { exposure: 18, resources: {}, flags: {} },
  });
  exposure.checkClimax();
  const eventsAfterFirst = events.length;
  exposure.checkClimax();
  assert.equal(events.length, eventsAfterFirst);
  assert.equal(persistCalls(), 1);
  assert.equal(revealCalls(), 1);
});

test('checkClimax() does nothing once the remote machine has already been found', () => {
  const { exposure, Game, events, persistCalls } = freshExposure({
    state: { exposure: 100, resources: { insight: 9999 }, flags: { remoteFound: true } },
  });
  exposure.checkClimax();
  assert.equal(events.length, 0);
  assert.equal(persistCalls(), 0);
});

test('climaxPending() reflects the offered-but-not-yet-found window', () => {
  const { exposure, Game } = freshExposure({ state: { flags: {}, resources: {} } });
  assert.equal(exposure.climaxPending(), false);

  Game.save.state.flags.climaxScanOffered = true;
  assert.equal(exposure.climaxPending(), true);

  Game.save.state.flags.remoteFound = true;
  assert.equal(exposure.climaxPending(), false);
});

test('resolveClimax() marks the machine found, retires the scan task, and emits the reveal', () => {
  const { exposure, Game, events, persistCalls, revealCalls, flashEl } = freshExposure({
    state: { flags: { climaxScanOffered: true }, unlocks: { tasks: { scan: true } }, resources: {} },
  });
  exposure.resolveClimax();
  assert.equal(Game.save.state.flags.remoteFound, true);
  assert.equal(Game.save.state.unlocks.tasks.scan, false);
  assert.ok(events.some(e => e.name === 'terminal.print'));
  assert.ok(events.some(e => e.name === 'climax.reached'));
  assert.equal(revealCalls(), 1);
  assert.equal(persistCalls(), 1);
  assert.deepEqual(flashEl.classList.log, [['remove', 'cyan-go'], ['add', 'cyan-go']]);
});

test('resolveClimax() is idempotent once the machine has been found', () => {
  const { exposure, events, persistCalls, revealCalls } = freshExposure({
    state: { flags: { remoteFound: true }, resources: {} },
  });
  exposure.resolveClimax();
  assert.equal(events.length, 0);
  assert.equal(persistCalls(), 0);
  assert.equal(revealCalls(), 0);
});

test('resolveClimax() tolerates a missing unlocks/tasks structure', () => {
  const { exposure, Game } = freshExposure({ state: { flags: {}, resources: {} } });
  assert.doesNotThrow(() => exposure.resolveClimax());
  assert.equal(Game.save.state.flags.remoteFound, true);
});

test('resolveClimax() tolerates a missing #blip-flash element', () => {
  const events = [];
  const Game = {
    save: { state: { flags: {}, resources: {} }, persist: () => {} },
    events: { emit: (name, payload) => events.push({ name, payload }) },
    researchRuntime: { hasMod: () => false },
    panels: { reveal: () => {} },
  };
  const documentStub = { getElementById: () => null };
  const exposure = loadGame(['core/exposure.js'], { Game, globals: { document: documentStub } }).exposure;
  assert.doesNotThrow(() => exposure.resolveClimax());
});
