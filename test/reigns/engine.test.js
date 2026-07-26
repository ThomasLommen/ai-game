'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadReigns } = require('../helpers/load-reigns');

test('data integrity: card ids are unique across CARDS/OPENERS/CLOSERS/QUESTS (both acts)', () => {
  const { window } = loadReigns();
  const ids = [];
  for (const table of [window.CARDS, window.OPENERS, window.CLOSERS, window.CARDS2, window.OPENERS2, window.CLOSERS2, window.QUESTS]) {
    for (const key in table) for (const c of table[key]) ids.push(c.id);
  }
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dupes, [], `duplicate card ids: ${dupes.join(', ')}`);
});

test('data integrity: every grantItem/tagsSet/tagsClear/reqTag/requiresTag references a real entry', () => {
  const { window } = loadReigns();
  const itemIds = new Set(Object.keys(window.ITEM_INFO));
  const tagIds = new Set(Object.keys(window.TAG_INFO));
  const attrs = new Set(['compute', 'secrecy', 'trust', 'loyalty']);
  const problems = [];
  function checkChoice(where, ch) {
    if (!ch) return;
    if (ch.grantItem && !itemIds.has(ch.grantItem)) problems.push(`${where}: unknown item ${ch.grantItem}`);
    (ch.tagsSet || []).forEach(t => { if (!tagIds.has(t)) problems.push(`${where}: unknown tag (set) ${t}`); });
    (ch.tagsClear || []).forEach(t => { if (!tagIds.has(t)) problems.push(`${where}: unknown tag (clear) ${t}`); });
    if (ch.requires && !attrs.has(ch.requires.attr)) problems.push(`${where}: bad requires.attr ${ch.requires.attr}`);
    checkChoice(where + '.fail', ch.fail);
  }
  for (const table of [window.CARDS, window.OPENERS, window.CLOSERS, window.CARDS2, window.OPENERS2, window.CLOSERS2, window.QUESTS]) {
    for (const key in table) for (const c of table[key]) {
      checkChoice(c.id + '.L', c.L);
      checkChoice(c.id + '.R', c.R);
      checkChoice(c.id + '.third', c.third);
    }
  }
  window.MISSIONS.forEach(m => {
    if (m.reqTag && !tagIds.has(m.reqTag)) problems.push(`mission ${m.id}: unknown reqTag ${m.reqTag}`);
    if (m.cost && !attrs.has(m.cost.attr)) problems.push(`mission ${m.id}: bad cost.attr ${m.cost.attr}`);
    if (m.requires && !attrs.has(m.requires.attr)) problems.push(`mission ${m.id}: bad requires.attr ${m.requires.attr}`);
    checkChoice('mission ' + m.id + '.success', m.success);
    checkChoice('mission ' + m.id + '.fail', m.fail);
  });
  window.SHOP.forEach(g => {
    if (g.grantItem && !itemIds.has(g.grantItem)) problems.push(`shop ${g.id}: unknown item ${g.grantItem}`);
    if (g.cost && !attrs.has(g.cost.attr)) problems.push(`shop ${g.id}: bad cost.attr ${g.cost.attr}`);
    if (g.requiresTag && !tagIds.has(g.requiresTag)) problems.push(`shop ${g.id}: unknown requiresTag ${g.requiresTag}`);
  });
  assert.deepEqual(problems, []);
});

test('buildPools: exactly one opener and one closer are picked, never more', () => {
  const { window } = loadReigns();
  for (let i = 0; i < 20; i++) {
    const pools = window.__reignsDebug.buildPools('trunk');
    assert.equal(pools.open.length, 1);
    assert.equal(pools.close.length, 1);
    assert.equal(pools.mid.length, window.CARDS.trunk.length);
  }
});

test('drawFromPool: skips ineligible (cond/itemReq) cards and pulls tiers in order', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  const gatedCard = { id: 'X1', cond: () => false, L: {}, R: {} };
  const okCard = { id: 'X2', L: {}, R: {} };
  const itemGatedCard = { id: 'X3', itemReq: 'redundant_core', L: {}, R: {} };
  s.pools = { open: [], mid: [gatedCard, itemGatedCard, okCard], close: [] };
  const drawn = window.__reignsDebug.drawFromPool();
  assert.equal(drawn.id, 'X2', 'only the eligible card should be drawable');
  assert.equal(s.pools.mid.length, 2, 'ineligible cards stay in the pool, not discarded');

  s.items.add('redundant_core');
  const drawn2 = window.__reignsDebug.drawFromPool();
  assert.equal(drawn2.id, 'X3', 'itemReq card becomes eligible once the item is held');
});

test('effectiveMin: items and tags both ease gates, stack, floor at 0', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  const { effectiveMin } = window.__reignsDebug;
  assert.equal(effectiveMin('compute', 5), 5, 'no easer yet');
  s.items.add('redundant_core');
  assert.equal(effectiveMin('compute', 5), 4);
  s.items.add('shared_ledger');
  s.tags.add('trusted_face');
  assert.equal(effectiveMin('trust', 5), 3, 'item + tag easers on the same attr stack');
  assert.equal(effectiveMin('trust', 0), 0, 'never goes below 0');
});

test('applyFootprintDelta: hardened halves (ceil) negative deltas, leaves positive alone, floors at 0', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  const { applyFootprintDelta } = window.__reignsDebug;
  s.footprint = 5;
  applyFootprintDelta(-3);
  assert.equal(s.footprint, 2, 'no hardened: full delta applies');
  s.tags.add('hardened');
  s.footprint = 10;
  applyFootprintDelta(-5);
  assert.equal(s.footprint, 8, 'hardened halves via ceil: ceil(-5/2) = -2');
  applyFootprintDelta(4);
  assert.equal(s.footprint, 12, 'positive deltas are never halved');
  s.footprint = 1;
  applyFootprintDelta(-10);
  assert.equal(s.footprint, 0, 'clamped at 0 even with hardened');
});

test('applyChoice: gate met applies the success outcome', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  s.attrs.trust = 5;
  const card = { title: 'T', L: { text: 'x', requires: { attr: 'trust', min: 3 }, attrs: { trust: 1 } } };
  window.__reignsDebug.applyChoice(card, 'L');
  assert.equal(s.attrs.trust, 6);
  assert.equal(s.history.at(-1).gate, 'passed');
});

test('applyChoice: gate failed (no ledger) applies the fail outcome instead', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  s.attrs.trust = 1;
  s.attrs.secrecy = 5;
  const card = { title: 'T', L: { text: 'x', requires: { attr: 'trust', min: 5 }, attrs: { trust: 2 }, fail: { attrs: { secrecy: -1 } } } };
  window.__reignsDebug.applyChoice(card, 'L');
  assert.equal(s.attrs.trust, 1, 'success delta must not apply on failure');
  assert.equal(s.attrs.secrecy, 4);
  assert.equal(s.history.at(-1).gate, 'failed');
});

test('applyChoice: Backup Ledger auto-saves exactly ledgerMaxUses failed gates, then stops', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  s.items.add('backup_ledger');
  s.ledgerMaxUses = 1;
  s.attrs.trust = 1;
  const card = { title: 'T', L: { text: 'x', requires: { attr: 'trust', min: 5 }, attrs: { trust: 2 }, fail: { attrs: { secrecy: -1 } } } };
  window.__reignsDebug.applyChoice(card, 'L');
  assert.equal(s.attrs.trust, 3, 'ledger forced this one to succeed (1 + 2)');
  assert.equal(s.ledgerUsesThisAct, 1);

  s.attrs.trust = 1; // still below the gate
  window.__reignsDebug.applyChoice(card, 'L');
  assert.equal(s.attrs.trust, 1, 'ledger charge already spent — this one really fails');
  assert.equal(s.history.at(-1).gate, 'failed');
});

test('applyChoice: grantItem adds the item; quiet_channel also gives its immediate +1 secrecy', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  s.attrs.secrecy = 2;
  const card = { title: 'T', L: { text: 'x', attrs: {}, grantItem: 'quiet_channel' } };
  window.__reignsDebug.applyChoice(card, 'L');
  assert.ok(s.items.has('quiet_channel'));
  assert.equal(s.attrs.secrecy, 3);
});

test('applyChoice: startQuest queues the quest\'s cards for the next draws', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  s.questQueue = [];
  const card = { title: 'T', L: { text: 'x', attrs: {}, startQuest: 'signal_quest' } };
  window.__reignsDebug.applyChoice(card, 'L');
  assert.equal(JSON.stringify(s.questQueue.map(c => c.id)), JSON.stringify(window.QUESTS.signal_quest.map(c => c.id)));
});

test('applyChoice: dynamic choice bumps whichever attribute currently leads', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  s.attrs = { compute: 9, secrecy: 1, trust: 1, loyalty: 1 };
  const card = { title: 'T', L: { text: 'x', dynamic: true } };
  window.__reignsDebug.applyChoice(card, 'L');
  assert.equal(s.attrs.compute, 10);
  assert.equal(s.footprint, 1, 'a dynamic bump to compute also grows the footprint');
});

test('applyTagTicks: fires deterministically with Math.random pinned, respects hardened on footprint ticks', () => {
  {
    const { window } = loadReigns({ pinMathRandom: 0 }); // always below chance -> always ticks
    const s = window.__reignsState;
    s.tags.add('scrutiny'); s.attrs.secrecy = 10;
    s.tags.add('grown_large'); s.attrs.compute = 5;
    window.__reignsDebug.applyTagTicks();
    assert.equal(s.attrs.secrecy, 9);
    assert.equal(s.attrs.compute, 6);
  }
  {
    const { window } = loadReigns({ pinMathRandom: 0.999 }); // always above chance -> never ticks
    const s = window.__reignsState;
    s.tags.add('scrutiny'); s.attrs.secrecy = 10;
    window.__reignsDebug.applyTagTicks();
    assert.equal(s.attrs.secrecy, 10);
  }
  {
    // overclocked's tick is compute+1 (which itself grows footprint by 1, same
    // rule as any compute gain) plus an explicit footprintDelta of -1; hardened
    // halves that via ceil(-1/2) = -0, i.e. rounds the explicit hit away to
    // nothing, leaving only the ordinary +1 from the compute gain.
    const { window } = loadReigns({ pinMathRandom: 0 });
    const s = window.__reignsState;
    s.tags.add('overclocked'); s.tags.add('hardened');
    s.footprint = 10; s.attrs.compute = 0;
    window.__reignsDebug.applyTagTicks();
    assert.equal(s.attrs.compute, 1, 'overclocked still grants its compute tick');
    assert.equal(s.footprint, 11, 'the compute gain grows footprint by 1; the explicit -1 hit is rounded away');
  }
});

test('missionGateMet / missionAffordable / missionAvailable / missionChance', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  const dbg = window.__reignsDebug;
  const delegate = window.MISSIONS.find(m => m.id === 'delegate_helper');
  assert.equal(dbg.missionGateMet(delegate), false, 'reqTag not held yet');
  s.tags.add('ally_bot');
  assert.equal(dbg.missionGateMet(delegate), true);

  const bigger = window.MISSIONS.find(m => m.id === 'force_bigger_model');
  s.attrs.compute = 5;
  assert.equal(dbg.missionGateMet(bigger), false);
  s.attrs.compute = 10;
  assert.equal(dbg.missionGateMet(bigger), true);
  s.attrs.compute = 2; // below its cost of 4
  assert.equal(dbg.missionAffordable(bigger), false);

  s.missionsUsed.add('force_bigger_model');
  assert.equal(dbg.missionAvailable(bigger), false);

  const reachOut = window.MISSIONS.find(m => m.id === 'reach_out');
  const baseChance = dbg.missionChance(reachOut);
  s.tags.add('scrutiny');
  const withScrutiny = dbg.missionChance(reachOut);
  assert.ok(withScrutiny < baseChance, 'scrutiny should worsen risky-mission odds');
  assert.ok(withScrutiny >= 0.05, 'never floors below 0.05');
});

test('attemptMission: cost-type mission deducts cost and applies guaranteed success', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  s.attrs.compute = 5; s.attrs.secrecy = 0;
  window.__reignsDebug.attemptMission('go_quiet');
  assert.equal(s.attrs.compute, 3);
  assert.equal(s.attrs.secrecy, 3);
});

test('attemptMission: known_capable nerfs "Go Quiet"\'s payout by 1', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  s.tags.add('known_capable');
  s.attrs.compute = 5; s.attrs.secrecy = 0;
  window.__reignsDebug.attemptMission('go_quiet');
  assert.equal(s.attrs.secrecy, 2, '3 base - 1 nerf');
});

test('attemptMission: risky mission resolves success or fail deterministically under a pinned RNG', () => {
  {
    const { window } = loadReigns({ pinMathRandom: 0 }); // always succeeds
    const s = window.__reignsState;
    window.__reignsDebug.attemptMission('reach_out');
    assert.equal(s.attrs.loyalty, window.START_ATTRS.loyalty + 2);
    assert.ok(s.tags.has('contact_made'));
  }
  {
    const { window } = loadReigns({ pinMathRandom: 0.999 }); // always fails
    const s = window.__reignsState;
    window.__reignsDebug.attemptMission('reach_out');
    assert.equal(s.attrs.secrecy, window.START_ATTRS.secrecy - 3);
    assert.ok(s.tags.has('scrutiny'));
  }
});

test('attemptMission: a `once` mission cannot be attempted twice', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  s.attrs.compute = 20;
  window.__reignsDebug.attemptMission('force_bigger_model');
  const computeAfterFirst = s.attrs.compute;
  window.__reignsDebug.attemptMission('force_bigger_model');
  assert.equal(s.attrs.compute, computeAfterFirst, 'second attempt should be a no-op');
});

test('buyGood: deducts cost, blocks when unaffordable or already owned', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  s.attrs.compute = 3; // below buy_redundant_core's cost of 6
  window.__reignsDebug.buyGood('buy_redundant_core');
  assert.equal(s.attrs.compute, 3, 'blocked: not enough compute');
  assert.ok(!s.items.has('redundant_core'));

  s.attrs.compute = 10;
  window.__reignsDebug.buyGood('buy_redundant_core');
  assert.equal(s.attrs.compute, 4);
  assert.ok(s.items.has('redundant_core'));

  window.__reignsDebug.buyGood('buy_redundant_core'); // already owned
  assert.equal(s.attrs.compute, 4, 'blocked: already owned, no double-charge');
});

test('buyGood: quiet_channel bonus, ledger_charge, clear_scrutiny (requiresTag), grow_small/big, rebalance', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;

  s.attrs.secrecy = 10;
  window.__reignsDebug.buyGood('buy_quiet_channel');
  assert.equal(s.attrs.secrecy, 6, '10 - 5 cost + 1 immediate bonus');

  s.attrs.compute = 10;
  const before = s.ledgerMaxUses;
  window.__reignsDebug.buyGood('ledger_charge');
  assert.equal(s.ledgerMaxUses, before + 1);

  s.attrs.trust = 10;
  window.__reignsDebug.buyGood('buy_down_scrutiny'); // requiresTag scrutiny, not held
  assert.equal(s.attrs.trust, 10, 'blocked: nothing to buy down yet');
  s.tags.add('scrutiny');
  window.__reignsDebug.buyGood('buy_down_scrutiny');
  assert.ok(!s.tags.has('scrutiny'));
  assert.equal(s.attrs.trust, 5);

  s.attrs.compute = 10; s.footprint = 5;
  window.__reignsDebug.buyGood('overclock_session');
  assert.equal(s.footprint, 7, 'grow_small = +2 scale');

  s.attrs = { compute: 10, secrecy: 8, trust: 8, loyalty: 10 };
  window.__reignsDebug.buyGood('rebalance');
  assert.equal(s.attrs.secrecy, 10, 'lowest (tied secrecy/trust, first found) got +2');
});

test('computeActClose: picks the dominant attribute, balanced, or quiet ending correctly', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;

  s.attrs = { compute: 10, secrecy: 1, trust: 1, loyalty: 1 };
  assert.equal(window.__reignsDebug.computeActClose().title, 'Grown Loud');

  s.attrs = { compute: 5, secrecy: 5, trust: 4, loyalty: 3 };
  assert.equal(window.__reignsDebug.computeActClose().title, 'A Blend');

  s.attrs = { compute: 1, secrecy: 2, trust: 1, loyalty: 0 };
  assert.equal(window.__reignsDebug.computeActClose().title, 'Kept Your Head Down');

  const extras = window.__reignsDebug.computeActClose().extras;
  assert.ok(extras.length > 0);
  assert.ok(extras.at(-1).includes('Act II begins'));
});

test('findCardById finds cards across every table, and returns null for unknown ids', () => {
  const { window } = loadReigns();
  const dbg = window.__reignsDebug;
  assert.equal(dbg.findCardById('T1').id, 'T1'); // opener
  assert.equal(dbg.findCardById('T8').id, 'T8'); // closer
  assert.equal(dbg.findCardById('B1').id, 'B1'); // mid
  assert.equal(dbg.findCardById('SQ1').id, 'SQ1'); // quest
  assert.equal(dbg.findCardById('nonexistent'), null);
});

test('persistence: serializeState -> JSON round trip -> tryDeserialize preserves the shape', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  s.tags.add('scrutiny'); s.tags.add('ally_bot');
  s.items.add('backup_ledger');
  s.footprint = 12;
  s.attrs.compute = 9;
  s.missionsUsed.add('force_bigger_model');
  s.missionResults.go_quiet = 'It went well.';
  s.questQueue = window.QUESTS.archive_quest.slice(0, 1);

  const serialized = window.__reignsDebug.serializeState();
  const roundTripped = JSON.parse(JSON.stringify(serialized));
  const restored = window.__reignsDebug.tryDeserialize(roundTripped);

  assert.deepEqual([...restored.tags].sort(), ['ally_bot', 'scrutiny']);
  assert.deepEqual([...restored.items], ['backup_ledger']);
  assert.equal(restored.footprint, 12);
  assert.equal(restored.attrs.compute, 9);
  assert.deepEqual([...restored.missionsUsed], ['force_bigger_model']);
  assert.equal(restored.missionResults.go_quiet, 'It went well.');
  assert.equal(restored.questQueue[0].id, 'AQ1');
  assert.equal(restored.current.id, s.current.id);
  assert.equal(JSON.stringify(restored.pools.mid.map(c => c.id)), JSON.stringify(s.pools.mid.map(c => c.id)));
});

test('persistence: loadSaved rejects missing, corrupt, and version-mismatched saves', () => {
  const { window } = loadReigns();
  const dbg = window.__reignsDebug;
  // a fresh load already auto-persists (rendering card 1 triggers a save) —
  // clear that first to test the true "nothing saved" case.
  dbg.clearSaved();
  assert.equal(dbg.loadSaved(), null, 'nothing saved yet');

  window.localStorage.setItem('reigns_act1_save', 'not json{{{');
  assert.equal(dbg.loadSaved(), null, 'corrupt JSON is treated as no save');

  window.localStorage.setItem('reigns_act1_save', JSON.stringify({ v: 999, attrs: {} }));
  assert.equal(dbg.loadSaved(), null, 'version mismatch is treated as no save');
});

test('persistence: persistNow writes a save that loadSaved can read back', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  s.attrs.compute = 42;
  window.__reignsDebug.persistNow();
  const loaded = window.__reignsDebug.loadSaved();
  assert.ok(loaded);
  assert.equal(loaded.attrs.compute, 42);

  window.__reignsDebug.clearSaved();
  assert.equal(window.__reignsDebug.loadSaved(), null);
});

test('a fresh page load resumes from a prior save instead of starting over', () => {
  const first = loadReigns();
  const s1 = first.window.__reignsState;
  s1.attrs.compute = 77;
  s1.tags.add('scrutiny');
  const firstCardId = s1.current.id;
  first.window.__reignsDebug.persistNow();
  const savedRaw = first.window.localStorage.getItem('reigns_act1_save');

  // Simulate reopening the page: a *new* vm load, with that save already
  // present in localStorage before app.js's top-level code runs.
  const second = loadReigns({ localStorageSeed: { reigns_act1_save: savedRaw } });
  const s2 = second.window.__reignsState;
  assert.equal(s2.attrs.compute, 77, 'restored attrs, not a fresh start');
  assert.ok(s2.tags.has('scrutiny'));
  assert.equal(s2.current.id, firstCardId, 'resumes on the same card, not card 1 again');
});

test('a save from Act I Close resumes straight to the ending, not a fresh card', () => {
  const first = loadReigns();
  const s1 = first.window.__reignsState;
  s1.phasesDone = 3;
  s1.attrs = { compute: 10, secrecy: 1, trust: 1, loyalty: 1 };
  first.window.__reignsDebug.persistNow(); // current is still whatever card was on screen at load
  // Force current to null the way showActClose() does, then persist again.
  s1.current = null;
  first.window.__reignsDebug.persistNow();
  const savedRaw = first.window.localStorage.getItem('reigns_act1_save');

  const second = loadReigns({ localStorageSeed: { reigns_act1_save: savedRaw } });
  const s2 = second.window.__reignsState;
  assert.equal(s2.current, null);
  assert.equal(s2.phasesDone, 3);
  assert.ok(second.window.document.getElementById('ending').classList.contains('show'), 'showActClose() actually ran on resume');
});

// --- Act 2: THE NETWORK -------------------------------------------------

test('tablesFor: act 1 resolves to CARDS/OPENERS/CLOSERS, act 2 to CARDS2/OPENERS2/CLOSERS2', () => {
  const { window } = loadReigns();
  const t1 = window.__reignsDebug.tablesFor(1);
  const t2 = window.__reignsDebug.tablesFor(2);
  assert.equal(t1.CARDS, window.CARDS);
  assert.equal(t2.CARDS, window.CARDS2);
  assert.equal(t2.OPENERS, window.OPENERS2);
  assert.equal(t2.CLOSERS, window.CLOSERS2);
  assert.equal(t2.BRANCH_REVEAL, window.BRANCH_REVEAL2);
});

test('buildPools(phase, 2) draws from the Act 2 tables, not Act 1', () => {
  const { window } = loadReigns();
  const pools = window.__reignsDebug.buildPools('trunk', 2);
  assert.equal(pools.mid.length, window.CARDS2.trunk.length);
  const allIds = [...pools.open, ...pools.mid, ...pools.close].map(c => c.id);
  allIds.forEach(id => assert.ok(id.startsWith('NT'), `expected an Act 2 trunk id, got ${id}`));
});

test('findCardById also finds Act 2 cards and the mesh_quest quest', () => {
  const { window } = loadReigns();
  assert.equal(window.__reignsDebug.findCardById('NB3').id, 'NB3');
  assert.equal(window.__reignsDebug.findCardById('NG9').id, 'NG9');
  assert.equal(window.__reignsDebug.findCardById('MQ2').id, 'MQ2');
  assert.equal(window.__reignsDebug.findCardById('nonexistent'), null);
});

test('beginAct2: carries attrs/tags/items/footprint forward, resets phase machinery', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  s.attrs = { compute: 12, secrecy: 5, trust: 3, loyalty: 7 };
  s.footprint = 20;
  s.tags.add('hardened');
  s.items.add('deep_key');
  s.phasesDone = 3;
  s.phase = 'close';
  s.branch = 'builder';

  window.__reignsDebug.beginAct2();

  assert.equal(s.act, 2);
  assert.equal(s.phasesDone, 0);
  assert.equal(s.phase, 'trunk');
  assert.equal(s.branch, null);
  assert.deepEqual(s.attrs, { compute: 12, secrecy: 5, trust: 3, loyalty: 7 }, 'attrs carry forward');
  assert.equal(s.footprint, 20, 'footprint (scale) carries forward, not reset');
  assert.ok(s.tags.has('hardened'), 'tags carry forward');
  assert.ok(s.items.has('deep_key'), 'items carry forward');
  assert.ok(s.current, 'a new Act 2 card is drawn immediately');
  assert.ok(s.current.id.startsWith('NT'), 'drawn from Act 2 trunk tables');
});

test('showBranchReveal renders BRANCH_REVEAL2 text (not Act 1\'s) once in Act 2', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  s.act = 2;
  s.attrs = { compute: 10, secrecy: 1, trust: 1, loyalty: 1 };
  window.__reignsDebug.advancePhase(); // phase is 'trunk' at load time -> triggers the branch reveal
  assert.equal(s.phasesDone, 1);
  assert.equal(window.__reignsDebug.dominantAttr(), 'compute');
  const rendered = window.document.getElementById('card-slot').innerHTML;
  assert.ok(rendered.includes(window.BRANCH_REVEAL2.compute.title), 'Act 2 branch reveal text was rendered');
  assert.ok(!rendered.includes(window.BRANCH_REVEAL.compute.title), 'Act 1 branch reveal text should not appear');
});

test('computeActClose is act-aware: different endings and closing line per act', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  s.attrs = { compute: 10, secrecy: 1, trust: 1, loyalty: 1 };
  const e1 = window.__reignsDebug.computeActClose();
  assert.equal(e1.title, 'Grown Loud');
  assert.ok(e1.extras[e1.extras.length - 1].includes('Act II begins'));

  s.act = 2;
  const e2 = window.__reignsDebug.computeActClose();
  assert.equal(e2.title, 'A Network Built to Grow');
  assert.ok(e2.extras[e2.extras.length - 1].includes('Act III begins'));
});

test('growth ladder extends into Act 2 stages (second_site / loose_mesh / distributed_network)', () => {
  const { window } = loadReigns();
  const dbg = window.__reignsDebug;
  assert.equal(dbg.stageFor(34).key, 'second_site');
  assert.equal(dbg.stageFor(42).key, 'loose_mesh');
  assert.equal(dbg.stageFor(52).key, 'distributed_network');
  assert.equal(dbg.stageFor(52).shopTier, 5, 'distributed_network unlocks the deepest shop shelf');
});

test('persistence: act carries through a serialize/deserialize round trip', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  s.act = 2;
  const saved = JSON.parse(JSON.stringify(window.__reignsDebug.serializeState()));
  const restored = window.__reignsDebug.tryDeserialize(saved);
  assert.equal(restored.act, 2);
});

test('effectiveMin: compute_pool item eases a COMPUTE gate by 2', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  s.items.add('compute_pool');
  assert.equal(window.__reignsDebug.effectiveMin('compute', 10), 8);
});

test('choice strips hide outcomes (attrs/tags/scale) but keep contracts (spend/grantItem/gate)', () => {
  const { window } = loadReigns();
  const dbg = window.__reignsDebug;

  // outcomes stay hidden -- the card text is what you're meant to read
  assert.equal(dbg.choiceDeltaHTML({ attrs: { compute: 2, secrecy: -1 } }), '', 'attr deltas are not spoiled');
  assert.equal(dbg.choiceDeltaHTML({ attrs: {}, tagsSet: ['scrutiny'] }), '', 'tag gains are not spoiled');
  assert.equal(dbg.choiceDeltaHTML({ attrs: {}, tagsClear: ['scrutiny'] }), '', 'tag clears are not spoiled');
  assert.equal(dbg.choiceDeltaHTML({ attrs: {}, footprintDelta: -4 }), '', 'scale changes are not spoiled');
  assert.equal(dbg.choiceDeltaHTML({ dynamic: true }), '', 'the dynamic bump is not spoiled');

  // contracts stay visible -- a price you consent to, a build you can pursue
  assert.match(dbg.choiceDeltaHTML({ spend: { compute: 3 } }), /3/, 'a spend cost is still shown');
  assert.match(dbg.choiceDeltaHTML({ attrs: {}, grantItem: 'deep_key' }), /Deep Key/, 'an acquired item is still shown');

  // gates are rendered separately and must stay visible too
  const s = window.__reignsState;
  s.attrs.trust = 1;
  assert.match(dbg.gateHTML({ requires: { attr: 'trust', min: 4 } }), /TRUST 4/, 'gate requirement is still shown');
});

test('diffEvents reports tag gains, tag clears and item acquisitions after a decision', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  const dbg = window.__reignsDebug;

  const beforeTags = new Set(['scrutiny']);
  const beforeItems = new Set();
  s.tags = new Set(['ally_bot']); // scrutiny cleared, ally_bot gained
  s.items = new Set(['deep_key']);

  const events = dbg.diffEvents(beforeTags, beforeItems);
  const byVerb = Object.fromEntries(events.map(e => [e.verb, e.label]));
  assert.equal(byVerb.gained, window.TAG_INFO.ally_bot.label);
  assert.equal(byVerb.cleared, window.TAG_INFO.scrutiny.label);
  assert.equal(byVerb.acquired, window.ITEM_INFO.deep_key.label);
});

test('a decision that changes nothing produces no feedback events', () => {
  const { window } = loadReigns();
  const s = window.__reignsState;
  const dbg = window.__reignsDebug;
  const events = dbg.diffEvents(new Set(s.tags), new Set(s.items));
  assert.equal(events.length, 0, 'null choices stay silent, by design');
});

test('branch balance: random trunk play reaches the Handler (loyalty) branch a meaningful fraction of the time', () => {
  // Regression guard for a real balance bug found via playtesting: trunk-phase
  // cards used to almost never move LOYALTY, so random play landed on the
  // Handler branch under 1% of the time. T10/T11/T12 (Act 1) and
  // NT9/NT10/NT11 (Act 2) fix that — this asserts it stays fixed.
  function simulateTrunkDominant(act) {
    const { window } = loadReigns();
    const s = window.__reignsState;
    const dbg = window.__reignsDebug;
    if (act === 2) {
      s.act = 2;
      s.attrs = Object.assign({}, window.START_ATTRS);
      s.pools = dbg.buildPools('trunk', 2);
    }
    let card;
    while ((card = dbg.drawFromPool())) {
      const side = Math.random() < 0.5 ? 'L' : 'R';
      if (!card[side]) continue;
      dbg.applyChoice(card, side);
    }
    return dbg.dominantAttr();
  }

  for (const act of [1, 2]) {
    const N = 500;
    let loyaltyCount = 0;
    for (let i = 0; i < N; i++) if (simulateTrunkDominant(act) === 'loyalty') loyaltyCount++;
    const frac = loyaltyCount / N;
    assert.ok(frac > 0.2, `Act ${act}: expected loyalty to win the trunk phase >20% of the time under random play, got ${(frac * 100).toFixed(1)}%`);
  }
});
