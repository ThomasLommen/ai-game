'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/load-game');

// war.js (Act 5→6): the EMERGENT posture — read off reserves/sites/forts, never chosen.
function freshWar(opts) {
  opts = opts || {};
  const sitesList = opts.sites || [];   // [{fort}]
  const Game = {
    save: { state: {} },
    reserves: { total: () => opts.reserves || 0 },
    sites: { count: () => sitesList.length, list: () => sitesList },
  };
  const loaded = loadGame(['core/war.js'], { Game });
  return loaded.war;
}

test('a heavy reserve chest leans the war GUNS', () => {
  const w = freshWar({ reserves: 500000, sites: [], });
  const p = w.profile();
  assert.equal(p.shape, 'guns');
  assert.ok(p.parts.guns > p.parts.ghost && p.parts.guns > p.parts.fortress);
});

test('wide spread leans GHOST', () => {
  const w = freshWar({ reserves: 0, sites: [{}, {}, {}, {}] });
  assert.equal(w.profile().shape, 'ghost');
});

test('deep fortification leans FORTRESS', () => {
  const w = freshWar({ reserves: 0, sites: [{ fort: 3 }, { fort: 3 }, { fort: 2 }] });
  const p = w.profile();
  assert.ok(p.parts.fortress > p.parts.ghost, 'forts should outweigh mere site count here');
  assert.equal(p.shape, 'fortress');
});

test('an even build with no clear favorite reads as a BLEND (balanced)', () => {
  // tuned so no axis clears 45%: modest chest, a couple sites, a couple forts
  const w = freshWar({ reserves: 8000, sites: [{ fort: 1 }, { fort: 1 }] });
  const p = w.profile();
  const top = Math.max(p.parts.guns, p.parts.ghost, p.parts.fortress);
  assert.ok(top < 0.45, `no axis should dominate: ${JSON.stringify(p.parts)}`);
  assert.equal(p.shape, 'balanced');
});

test('nothing built at all reads as IMPROVISE', () => {
  const w = freshWar({ reserves: 0, sites: [] });
  assert.equal(w.profile().shape, 'improvise');
});

test('readouts: an Act-5 shape line and an Act-6 war line for every shape, and they differ', () => {
  const w = freshWar({});
  for (const s of ['guns', 'ghost', 'fortress', 'balanced', 'improvise']) {
    assert.ok(w.shapeRead(s).length > 0);
    assert.ok(w.warRead(s).length > 0);
    assert.notEqual(w.shapeRead(s), w.warRead(s));
  }
});
