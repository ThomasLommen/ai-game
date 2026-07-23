'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadReigns } = require('../helpers/load-reigns');

test('data integrity: card ids are unique across CARDS/OPENERS/CLOSERS/QUESTS', () => {
  const { window } = loadReigns();
  const ids = [];
  for (const table of [window.CARDS, window.OPENERS, window.CLOSERS, window.QUESTS]) {
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
  for (const table of [window.CARDS, window.OPENERS, window.CLOSERS, window.QUESTS]) {
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
