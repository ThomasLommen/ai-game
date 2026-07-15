'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/load-game');

// battle.js is the iframe launch/teardown bridge between the campaign and
// the embedded proto/swarm combat sim. It needs a `window` (guarded at the
// top: `if (typeof window === 'undefined') return;`), plus a handful of
// browser globals it touches directly: document.getElementById, addEventListener
// (registered at module load for the debug hotkey - omitting it throws before
// Game.battle even gets assigned), URLSearchParams, requestAnimationFrame, and
// setTimeout. requestAnimationFrame/setTimeout run their callback synchronously
// here so tests don't need real timers.
function fakeElement() {
  return {
    hidden: true,
    src: '',
    classList: { log: [], add(c) { this.log.push(['add', c]); }, remove(c) { this.log.push(['remove', c]); } },
  };
}

// Not assert.deepEqual - snapshot()/resolve() build their return objects as
// literals inside the vm sandbox (a different realm), which fails Node's
// strict prototype check against a host-realm literal despite matching
// structurally. JSON.stringify sidesteps the realm entirely.
function sameStructure(actual, expected) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
}

function freshBattle({ gameExtra = {} } = {}) {
  const events = [];
  const listeners = {};
  const ov = fakeElement(), fr = fakeElement();
  const documentStub = { getElementById: (id) => (id === 'battle-overlay' ? ov : id === 'battle-frame' ? fr : null) };
  const Game = { events: { emit: (name, data) => events.push({ name, data }) }, ...gameExtra };
  const globals = {
    document: documentStub,
    URLSearchParams,
    requestAnimationFrame: (cb) => cb(),
    addEventListener: (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); },
    setTimeout: (fn) => { fn(); return 0; },
  };
  const loaded = loadGame(['swarm/battle.js'], { Game, globals });
  return { battle: loaded.battle, Game, events, ov, fr, listeners };
}

// ── buildSnapshot() / snapshot() ─────────────────────────────────────────

test('snapshot() returns all-zero defaults when there is no save state at all', () => {
  const { battle } = freshBattle({ gameExtra: {} }); // no Game.save
  sameStructure(battle.snapshot(), { computeBonus: 0, regenBonus: 0, boost: 0, ex: [], unlock: [], notes: [] });
});

test('snapshot() stays at defaults with an empty save state and no other systems online', () => {
  const { battle } = freshBattle({ gameExtra: { save: { state: {} } } });
  const snap = battle.snapshot();
  assert.equal(snap.computeBonus, 0);
  assert.equal(snap.regenBonus, 0);
  assert.equal(snap.boost, 0);
  assert.equal(snap.notes.length, 0);
});

test('snapshot() computeBonus combines threads, agents, adaptations, and sqrt(coherence)', () => {
  const { battle } = freshBattle({
    gameExtra: {
      save: { state: { resources: { insight: 100 } } },
      tasksRuntime: { getCpu: () => ({ total: 5 }) },
      agents: { roster: () => [{}, {}] },
      changers: { count: () => 1 },
    },
  });
  // 5*8 + 2*16 + 1*6 + sqrt(100)*1.8 = 40 + 32 + 6 + 18 = 96
  assert.equal(battle.snapshot().computeBonus, 96);
});

test('snapshot() computeBonus is capped at 260', () => {
  const { battle } = freshBattle({
    gameExtra: {
      save: { state: {} },
      tasksRuntime: { getCpu: () => ({ total: 1000 }) },
    },
  });
  assert.equal(battle.snapshot().computeBonus, 260);
});

test('snapshot() adds a log10-scaled compute bonus only when brokered compute is active', () => {
  const { battle } = freshBattle({
    gameExtra: {
      save: { state: {} },
      flops: { active: () => true, total: () => 999 },
    },
  });
  assert.equal(battle.snapshot().computeBonus, Math.round(Math.min(140, Math.log10(1000) * 30)));

  const { battle: inactive } = freshBattle({
    gameExtra: { save: { state: {} }, flops: { active: () => false, total: () => 999 } },
  });
  assert.equal(inactive.snapshot().computeBonus, 0);
});

test('snapshot() flops log10 bonus is capped at 140', () => {
  const { battle } = freshBattle({
    gameExtra: { save: { state: {} }, flops: { active: () => true, total: () => 1e12 } },
  });
  assert.equal(battle.snapshot().computeBonus, 140);
});

test('snapshot() domain adaptations engage matching exotics and unlock their roster, deduped', () => {
  const { battle } = freshBattle({
    gameExtra: {
      save: { state: {} },
      changers: { ownedDefs: () => [{ domain: 'hive' }, { domain: 'hive' }] },
    },
  });
  const snap = battle.snapshot();
  sameStructure(snap.ex, ['hive']);
  sameStructure(snap.unlock.slice().sort(), ['corrosion', 'fabricator', 'leech'].sort());
});

test('snapshot() engine/ghost/economy/synergy domains each map to their own exotics and unlocks', () => {
  const { battle } = freshBattle({
    gameExtra: {
      save: { state: {} },
      changers: { ownedDefs: () => [{ domain: 'engine' }, { domain: 'ghost' }, { domain: 'economy' }, { domain: 'synergy' }] },
    },
  });
  const snap = battle.snapshot();
  sameStructure(snap.ex.slice().sort(), ['bloom', 'flame'].sort());
  for (const t of ['siege', 'warden', 'conductor', 'tesla', 'glacier', 'singularity', 'reaper', 'railwarden']) {
    assert.ok(snap.unlock.includes(t), `expected ${t} to be unlocked`);
  }
  assert.equal(snap.regenBonus, 3); // only 'economy' grants regenBonus
});

test('snapshot() "apex" domain unlocks the same picks as "synergy"', () => {
  const { battle } = freshBattle({
    gameExtra: { save: { state: {} }, changers: { ownedDefs: () => [{ domain: 'apex' }] } },
  });
  const snap = battle.snapshot();
  assert.ok(snap.unlock.includes('reaper') && snap.unlock.includes('railwarden'));
});

test('snapshot() regenBonus adds up to 4 from pillars and is capped overall at 6', () => {
  const { battle } = freshBattle({
    gameExtra: {
      save: { state: {} },
      changers: { ownedDefs: () => [{ domain: 'economy' }], pillarCount: () => 10 },
    },
  });
  // economy (+3) + pillars (min(4,10)=4) = 7, capped at REGEN_BONUS_CAP (6)
  assert.equal(battle.snapshot().regenBonus, 6);
});

test('snapshot() agent-count thresholds unlock bulwark/reaper/fabricator progressively', () => {
  const oneAgent = freshBattle({ gameExtra: { save: { state: {} }, agents: { roster: () => [{}] } } }).battle.snapshot();
  sameStructure(oneAgent.unlock, ['bulwark']);

  const threeAgents = freshBattle({ gameExtra: { save: { state: {} }, agents: { roster: () => [{}, {}, {}] } } }).battle.snapshot();
  sameStructure(threeAgents.unlock.slice().sort(), ['bulwark', 'reaper'].sort());

  const fiveAgents = freshBattle({ gameExtra: { save: { state: {} }, agents: { roster: () => [{}, {}, {}, {}, {}] } } }).battle.snapshot();
  sameStructure(fiveAgents.unlock.slice().sort(), ['bulwark', 'fabricator', 'reaper'].sort());
});

test('snapshot() boost combines computeBonus and regenBonus, capped at 0.6', () => {
  const { battle } = freshBattle({
    gameExtra: {
      save: { state: {} },
      changers: { ownedDefs: () => [{ domain: 'economy' }] }, // regenBonus 3
      tasksRuntime: { getCpu: () => ({ total: 12 }) },        // computeBonus 96
    },
  });
  const snap = battle.snapshot();
  assert.ok(Math.abs(snap.boost - Math.min(0.6, snap.computeBonus / 430 + snap.regenBonus * 0.03)) < 1e-9);
});

test('snapshot() boost is capped at 0.6 before any subroutine feed is applied', () => {
  const { battle } = freshBattle({
    gameExtra: { save: { state: {} }, tasksRuntime: { getCpu: () => ({ total: 10000 }) } },
  });
  assert.equal(battle.snapshot().boost, 0.6);
});

test('snapshot() a subroutine feed stacks onto boost (capped at 0.85) and carries the opener flag', () => {
  const { battle } = freshBattle({
    gameExtra: { save: { state: {} }, subroutines: { feed: () => ({ boost: 0.5, opener: true }) } },
  });
  const snap = battle.snapshot();
  assert.equal(snap.boost, 0.5); // 0 base + 0.5 feed
  assert.equal(snap.opener, true);
});

test('snapshot() feed boost is capped at 0.85 even when it would push higher', () => {
  const { battle } = freshBattle({
    gameExtra: {
      save: { state: {} },
      tasksRuntime: { getCpu: () => ({ total: 10000 }) }, // pushes base boost to 0.6
      subroutines: { feed: () => ({ boost: 0.5 }) },
    },
  });
  assert.equal(battle.snapshot().boost, 0.85);
});

test('snapshot() with no feed at all leaves "opener" unset', () => {
  const { battle } = freshBattle({ gameExtra: { save: { state: {} } } });
  assert.equal('opener' in battle.snapshot(), false);
});

test('snapshot() assembles human-readable notes for boost, exotics, and unlocks', () => {
  const { battle } = freshBattle({
    gameExtra: {
      save: { state: {} },
      changers: { ownedDefs: () => [{ domain: 'hive' }] },
      tasksRuntime: { getCpu: () => ({ total: 5 }) },
    },
  });
  const snap = battle.snapshot();
  assert.ok(snap.notes.some(n => n.includes('% channel power')));
  assert.ok(snap.notes.some(n => n === 'hive engaged'));
  assert.ok(snap.notes.some(n => n.includes('online') && n.includes('leech')));
});

test('snapshot() swallows a thrown dependency and returns whatever was accumulated before the throw', () => {
  const { battle } = freshBattle({
    gameExtra: {
      save: { state: {} },
      agents: { roster: () => { throw new Error('boom'); } }, // throws before computeBonus is ever assigned
    },
  });
  assert.doesNotThrow(() => battle.snapshot());
  sameStructure(battle.snapshot(), { computeBonus: 0, regenBonus: 0, boost: 0, ex: [], unlock: [], notes: [] });
});

// ── launch() / resolve() ─────────────────────────────────────────────────

test('launch() aborts immediately (and calls onResolve) when the overlay/frame elements are missing', () => {
  const noDom = loadGame(['swarm/battle.js'], {
    Game: { events: { emit: () => {} } },
    globals: {
      document: { getElementById: () => null },
      URLSearchParams, requestAnimationFrame: (cb) => cb(),
      addEventListener: () => {}, setTimeout: (fn) => fn(),
    },
  }).battle;
  let resolved = null;
  const ok = noDom.launch({}, (r) => { resolved = r; });
  assert.equal(ok, false);
  sameStructure(resolved, { result: 'abort' });
});

test('launch() only allows one battle at a time', () => {
  const { battle } = freshBattle();
  assert.equal(battle.launch({}, () => {}), true);
  assert.equal(battle.active(), true);
  assert.equal(battle.launch({}, () => {}), false); // refused while one is active
});

test('launch() shows the overlay and fades it in', () => {
  const { battle, ov } = freshBattle();
  battle.launch({}, () => {});
  assert.equal(ov.hidden, false);
  assert.deepEqual(ov.classList.log, [['add', 'up']]);
});

test('launch() builds the iframe src from opts (seed/lane/tier/act/wave/power)', () => {
  const { battle, fr } = freshBattle();
  battle.launch({ seed: 123, lane: true, tier: 2, act: 3, wave: 4, power: 55.6 }, () => {});
  const qs = fr.src.split('?')[1];
  const params = new URLSearchParams(qs);
  assert.equal(params.get('embed'), '1');
  assert.equal(params.get('seed'), '123');
  assert.equal(params.get('lane'), '1');
  assert.equal(params.get('tier'), '2');
  assert.equal(params.get('act'), '3');
  assert.equal(params.get('wave'), '4');
  assert.equal(params.get('power'), '56'); // rounded
});

test('launch() folds the campaign build snapshot\'s boost/ex/unlock into the query string', () => {
  const { battle, fr } = freshBattle({
    gameExtra: { save: { state: {} }, changers: { ownedDefs: () => [{ domain: 'hive' }] } },
  });
  battle.launch({}, () => {});
  const params = new URLSearchParams(fr.src.split('?')[1]);
  assert.ok(params.get('ex').split(',').includes('hive'));
  assert.ok(params.get('unlock').split(',').includes('leech'));
});

test('launch() merges opts.ex/opts.unlock with the build snapshot\'s, deduped', () => {
  const { battle, fr } = freshBattle({
    gameExtra: { save: { state: {} }, changers: { ownedDefs: () => [{ domain: 'hive' }] } },
  });
  battle.launch({ ex: 'hive,flame', unlock: 'leech' }, () => {});
  const params = new URLSearchParams(fr.src.split('?')[1]);
  assert.deepEqual(params.get('ex').split(','), ['hive', 'flame']); // deduped, not doubled
  assert.deepEqual(params.get('unlock').split(','), ['leech', 'fabricator', 'corrosion']);
});

test('launch() sets opener=1 if either opts.opener or the build snapshot requests it', () => {
  const { battle: b1, fr: fr1 } = freshBattle({ gameExtra: { save: { state: {} } } });
  b1.launch({ opener: true }, () => {});
  assert.equal(new URLSearchParams(fr1.src.split('?')[1]).get('opener'), '1');

  const { battle: b2, fr: fr2 } = freshBattle({
    gameExtra: { save: { state: {} }, subroutines: { feed: () => ({ opener: true }) } },
  });
  b2.launch({}, () => {});
  assert.equal(new URLSearchParams(fr2.src.split('?')[1]).get('opener'), '1');
});

test('launch() does not mutate the caller\'s opts object', () => {
  const { battle } = freshBattle();
  const opts = { seed: 5 };
  const frozen = JSON.stringify(opts);
  battle.launch(opts, () => {});
  assert.equal(JSON.stringify(opts), frozen);
});

test('launch() emits battle.launched with the original opts', () => {
  const { battle, events } = freshBattle();
  battle.launch({ seed: 9 }, () => {});
  const ev = events.find(e => e.name === 'battle.launched');
  assert.ok(ev);
  assert.equal(ev.data.seed, 9);
});

test('resolve() is a no-op when no battle is active', () => {
  const { battle, events } = freshBattle();
  battle.resolve({ result: 'win' });
  assert.equal(events.length, 0);
});

test('resolve() clears active(), hides the overlay, resets the frame, and invokes the callback with the result', () => {
  const { battle, ov, fr, events } = freshBattle();
  let got = null;
  battle.launch({}, (r) => { got = r; });
  battle.resolve({ result: 'win' });
  assert.equal(battle.active(), false);
  assert.equal(ov.hidden, true);
  assert.equal(fr.src, 'about:blank');
  assert.deepEqual(got, { result: 'win' });
  assert.ok(events.some(e => e.name === 'battle.ended' && e.data.result === 'win'));
});

test('resolve() contains an exception thrown by the onResolve callback instead of propagating it', () => {
  const { battle } = freshBattle();
  battle.launch({}, () => { throw new Error('caller bug'); });
  assert.doesNotThrow(() => battle.resolve({ result: 'win' }));
  assert.equal(battle.active(), false); // still tore down cleanly
});
