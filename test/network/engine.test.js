'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadNetwork } = require('../helpers/load-network');

// Spend the turn's budget on sweeps, and return how many actually happened.
// An action that cannot proceed (nothing left to sweep, no insight) silently
// does nothing and spends no AP, so a `while (ap > 0)` loop around it never
// terminates — that mistake hung the suite roughly one run in eight.
function drainBudgetBySweeping(d) {
  let sweeps = 0;
  for (let guard = 0; guard < 20 && d.state.ap > 0; guard++) {
    const before = d.state.ap;
    d.actScan();
    if (d.state.ap === before) break;   // refused; stop rather than spin
    sweeps++;
  }
  return sweeps;
}

test('city: generates districts of buildings, each with a way in, all reachable', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;

  assert.ok(s.buildings.length > 20, `only ${s.buildings.length} buildings`);
  assert.ok(s.hosts.length > s.buildings.length, 'buildings hold more than one host between them');
  assert.equal(d.owned().length, 1, 'exactly one host is held at the start');

  // you start in the suburbs, and only that building is visible
  const seat = d.owned()[0];
  const home = d.buildingById(seat.buildingId);
  assert.equal(home.district, 'residential', 'the origin is in the suburbs');
  assert.equal(s.buildings.filter(b => b.discovered).length, 1, 'only home is visible at the start');

  // every district is represented, and difficulty rides the district
  const districts = new Set(s.buildings.map(b => b.district));
  Object.keys(window.DISTRICTS).forEach(k => assert.ok(districts.has(k), `district ${k} is missing`));

  // every building must be enterable, or it can never be taken
  s.buildings.forEach(b => {
    const inside = d.hostsIn(b);
    assert.ok(inside.length > 0, `${b.id} is empty`);
    assert.ok(inside.some(h => h.exterior), `${b.id} has no way in`);
  });

  // every building must be walkable from home, or part of the city is dead
  const seen = new Set([home.id]);
  const queue = [home.id];
  while (queue.length) {
    const cur = queue.shift();
    d.buildingNeighbours(cur).forEach(n => { if (!seen.has(n)) { seen.add(n); queue.push(n); } });
  }
  assert.equal(seen.size, s.buildings.length,
    `${s.buildings.length - seen.size} buildings are unreachable from home`);
});

test('city: difficulty rises with district, so expanding outward gets harder', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const byTier = {};
  d.state.hosts.forEach(h => {
    (byTier[h.ring] = byTier[h.ring] || []).push(h.defense);
  });
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const tiers = Object.keys(byTier).map(Number).sort((a, b) => a - b);
  assert.ok(tiers.length >= 3, 'several difficulty tiers exist');
  for (let i = 1; i < tiers.length; i++) {
    assert.ok(avg(byTier[tiers[i]]) > avg(byTier[tiers[i - 1]]),
      `tier ${tiers[i]} is not harder than tier ${tiers[i - 1]}`);
  }
});

test('city: the opening is never a hard stall', () => {
  // regression guard from the ring era: an early build made the first ring
  // uncrackable and playtests stalled after two holdings.
  // generating a whole city is expensive, so sample rather than hammer
  for (let i = 0; i < 10; i++) {
    const { window } = loadNetwork();
    const d = window.__netDebug;
    const openingPower = d.power();
    const escapePower = openingPower + window.UPGRADE.basePower; // one affordable upgrade
    // turn one is a sweep: you cannot act on a street you have not looked at
    assert.ok(d.sweepTargets().length > 0, 'there is always somewhere to sweep');
    while (d.state.ap > 0 && d.sweepBlocked() === null) d.actScan();
    const reachable = d.state.hosts.filter(h => d.isFrontier(h));
    assert.ok(reachable.length > 0, 'after the opening sweep something is reachable');
    const cheapest = Math.min(...reachable.map(h => h.defense));
    assert.ok(cheapest <= escapePower,
      `nothing crackable: cheapest reachable defense ${cheapest} vs ${escapePower} after an upgrade`);
  }
});

test('city: cameras are on the outside and are the way in', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const cams = d.state.hosts.filter(h => h.exterior && h.role === 'stealth');
  assert.ok(cams.length > 0, 'the city has cameras');
  cams.forEach(c => {
    const b = d.buildingById(c.buildingId);
    // a camera sits on the building's edge, not somewhere in its interior
    assert.ok(Math.abs(c.y - b.y) < 2, 'cameras hang on the wall');
  });
});

test('city: holding a camera reveals what is around it, without a sweep', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const before = s.buildings.filter(b => b.discovered).length;

  const cam = s.hosts.find(h => h.exterior && h.role === 'stealth');
  cam.owned = true;
  cam.discovered = true;
  d.cameraVision();

  const after = s.buildings.filter(b => b.discovered).length;
  assert.ok(after > before, 'an eye on the street shows you the street');
});

test('city: people appear only where you can see, and move when the world does', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;

  d.repopulatePeople();
  const atHome = s.people.length;

  s.buildings.slice(0, 12).forEach(b => d.revealBuilding(b));
  d.repopulatePeople();
  assert.ok(s.people.length > atHome, 'revealing more of the city reveals more life');

  const before = JSON.stringify(s.people);
  d.actEndTurn();
  assert.notEqual(JSON.stringify(s.people), before, 'the street moves on the world turn');
});

test('power: base rig + held threads + purchased tooling (the flywheel)', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;

  s.hosts.forEach(h => { h.owned = false; });
  assert.equal(d.power(), 2, 'base rig only when nothing is held');

  const a = s.hosts[1], b = s.hosts[2];
  a.owned = true; a.threads = 5;
  b.owned = true; b.threads = 3;
  assert.equal(d.power(), 2 + 8, 'held threads feed breach power');

  s.upgrades = 3;
  assert.equal(d.power(), 2 + 8 + 3 * window.UPGRADE.basePower, 'tooling adds on top');
});

test('upgrade cost keeps climbing past the table so it cannot be spammed', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const costs = window.UPGRADE.costs;

  d.state.upgrades = 0;
  assert.equal(d.upgradeCost(), costs[0]);
  d.state.upgrades = costs.length - 1;
  assert.equal(d.upgradeCost(), costs[costs.length - 1]);

  // past the end of the table it must keep growing, not plateau
  d.state.upgrades = costs.length;
  const first = d.upgradeCost();
  d.state.upgrades = costs.length + 4;
  const later = d.upgradeCost();
  assert.ok(first > costs[costs.length - 1], 'cost continues past the table');
  assert.ok(later > first * 2, 'and keeps compounding');
});

test('cover comes only from stealth holdings, and gates the quiet approach', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = false; });
  assert.equal(d.cover(), 1, 'base cover with nothing held');

  const routers = s.hosts.filter(h => h.type === 'iot').slice(0, 2);
  routers.forEach(h => { h.owned = true; });
  assert.equal(d.cover(), 1 + 2 * window.HOST_TYPES.iot.cover);
});

test('frontier: you can reach inside what you hold, but only the outside of what you do not', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const seat = d.owned()[0];
  const home = d.buildingById(seat.buildingId);

  // anything undiscovered is off limits, wherever it is
  const hidden = s.hosts.find(h => !h.discovered);
  assert.equal(d.isFrontier(hidden), false, 'you cannot act on what you have not seen');

  // inside a building you already hold, everything is reachable
  const sibling = d.hostsIn(home).find(h => !h.owned);
  if (sibling) assert.equal(d.isFrontier(sibling), true, 'being inside gets you the whole building');

  // a neighbouring building: its cameras are reachable, its interior is not
  const neighbourId = d.buildingNeighbours(home.id)[0];
  assert.ok(neighbourId, 'home has a neighbour across the street');
  const nb = d.buildingById(neighbourId);
  d.revealBuilding(nb);

  const outside = d.hostsIn(nb).filter(h => h.exterior);
  const inside = d.hostsIn(nb).filter(h => !h.exterior);
  assert.ok(outside.length, 'the neighbour has something on its wall');
  outside.forEach(h => assert.equal(d.isFrontier(h), true, 'wall-mounted kit is reachable from the street'));
  inside.forEach(h => assert.equal(d.isFrontier(h), false, 'you cannot reach through a wall you are not behind'));

  // once you are in, the interior opens up
  if (inside.length) {
    outside[0].owned = true;
    inside.forEach(h => assert.equal(d.isFrontier(h), true, 'now that you are inside, the rest follows'));
  }
});

test('heat: sprawl raises it, routers launder it, lying low cuts it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = false; });

  const plain = s.hosts.filter(h => h.type === 'consumer').slice(0, 4);
  plain.forEach(h => { h.owned = true; });
  const noisy = d.heatPerTurn();
  assert.ok(noisy > 0, 'a spread network is inherently loud');

  const routers = s.hosts.filter(h => h.type === 'iot').slice(0, 3);
  routers.forEach(h => { h.owned = true; });
  assert.ok(d.heatPerTurn() < noisy, 'routers cut the per-turn heat');

  s.heat = 20;
  d.actLieLow();
  assert.ok(s.heat < 20, 'lying low reduces heat');
});

test('breach: an unmet gate does not hand you the host', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const origin = d.owned()[0];
  const target = d.neighbours(origin).find(n => !n.owned);
  target.discovered = true;
  target.defense = 999; // unreachable by any route
  s.res.insight = 0;
  s.res.cash = 0;

  d.openBreach(target.id);
  assert.ok(s.card && s.card.kind === 'breach', 'the breach card opened');
  const opts = d.approachesFor(target);
  assert.ok(opts.filter(a => a.def.id !== 'walk').every(a => !a.usable), 'nothing is usable');

  d.resolveBreach('force');
  assert.equal(target.owned, false, 'a failed force does not take the host');
  assert.equal(s.card, null, 'the card closes either way');
});

test('breach: a met gate takes the host and grows your power', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const target = d.neighbours(d.owned()[0]).find(n => !n.owned);
  target.discovered = true;
  target.defense = 1;
  target.threads = 6;
  const before = d.power();

  d.openBreach(target.id);
  d.resolveBreach('force');
  assert.equal(target.owned, true, 'the host is taken');
  assert.equal(d.power(), before + 6, 'its threads join the flywheel');
});

// (walking away is covered by "backing out of a breach costs no turn" below —
// it used to spend a turn, which made "open the card, leave" a free turn button.)

test('sweeping cannot reveal the map: discovery follows territory, not sight', () => {
  // regression guard for a real exploit — discovery used to spread from any
  // *discovered* host, so a player could reveal all 30 hosts from the start
  // node without ever taking anything.
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const total = d.state.hosts.length;

  for (let i = 0; i < 60; i++) {
    d.state.res.insight = 999;          // money must not be the thing limiting this
    if (d.sweepBlocked() === 'nothing') break;
    if (d.state.ap <= 0) { d.actEndTurn(); continue; }  // budget, not sight, is the other limiter
    d.actScan();
  }
  const discovered = d.state.hosts.filter(h => h.discovered).length;
  assert.equal(d.owned().length, 1, 'still holding only the origin');
  assert.ok(discovered < total / 2, `revealed ${discovered}/${total} without taking anything`);
  assert.equal(d.sweepBlocked(), 'nothing', 'sweep reports itself exhausted rather than idling');
});

test('sweeping costs insight, and is blocked when you cannot pay', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  // check both branches from the opening position, where a target is guaranteed —
  // after a sweep the last adjacent building may be gone, and the answer would
  // then be 'nothing' rather than 'poor'
  assert.ok(d.sweepTargets().length > 0, 'there is somewhere to sweep on turn one');

  s.res.insight = 0;
  assert.equal(d.sweepBlocked(), 'poor', 'no insight, no sweep');
  const ap = s.ap;
  d.actScan();
  assert.equal(s.ap, ap, 'a sweep you cannot pay for costs nothing at all');

  s.res.insight = window.SWEEP_COST;
  assert.equal(d.sweepBlocked(), null, 'with the money in hand it is available');
  d.actScan();
  assert.equal(s.res.insight, 0, 'and the sweep was paid for');
  assert.equal(s.ap, ap - 1, 'and it cost an action');
});

test('events are only eligible when the board is actually in that situation', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;

  // nothing held beyond the origin: the sprawl and corporate events must not offer
  let ids = d.eligibleEvents().map(e => e.id);
  assert.ok(!ids.includes('sprawl_warning'), 'sprawl event needs a real fleet');
  assert.ok(!ids.includes('payroll_window'), 'payroll event needs a corporate holding');

  s.hosts.forEach(h => { h.discovered = true; h.owned = true; });
  ids = d.eligibleEvents().map(e => e.id);
  assert.ok(ids.includes('sprawl_warning'), 'now that you are spread thin, it offers');
  if (d.ownedOf('cash').length) assert.ok(ids.includes('payroll_window'));
});

test('once-only events do not come back', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.state.hosts.forEach(h => { if (h.ring <= 1) h.owned = true; });
  d.state.heat = 1;
  assert.ok(d.eligibleEvents().some(e => e.id === 'first_quiet'));
  d.state.eventsSeen.push('first_quiet');
  assert.ok(!d.eligibleEvents().some(e => e.id === 'first_quiet'), 'already seen, never again');
});

test('an event choice applies its cost and its effect, and closes the card', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.res.insight = 20;
  s.card = { kind: 'event', eventId: 'first_quiet' };

  d.resolveEvent(0); // "Build the habit properly" — costs 4 insight, grants clean_room
  assert.ok(s.tags.has('clean_room'), 'the tag was granted');
  assert.ok(s.res.insight < 20, 'the cost was paid');
  assert.equal(s.card, null, 'the card closed');
  assert.ok(s.eventsSeen.includes('first_quiet'), 'and it is recorded as seen');
});

test('an unaffordable event choice cannot be taken', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.res.insight = 0;
  s.card = { kind: 'event', eventId: 'first_quiet' };

  const ev = d.eventById('first_quiet');
  assert.equal(d.choiceUsable(ev.choices[0]), false, 'the paid option is not usable while broke');
  d.resolveEvent(0);
  assert.ok(s.card, 'the card stays open rather than resolving for free');
  assert.ok(!s.tags.has('clean_room'));
});

test('tags feed back into the simulation rather than sitting in a tray', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 40).forEach(h => { h.owned = true; });

  const base = { power: d.power(), cover: d.cover(), heat: d.heatPerTurn(), strike: d.strikeThreshold() };
  const host = s.hosts.find(h => h.ring === 2);
  const baseDef = d.defenseOf(host);

  s.tags.add('ally_process');
  assert.equal(d.power(), base.power + 3, 'an ally raises POWER');

  s.tags.add('clean_room');
  assert.equal(d.cover(), base.cover + 2, 'discipline raises COVER');

  s.tags.add('dark_relay');
  assert.ok(d.heatPerTurn() < base.heat, 'a dark relay slows heat');

  s.tags.add('hunted');
  assert.ok(d.strikeThreshold() < base.strike, 'being hunted brings the strike forward');

  s.tags.add('known_capable');
  assert.ok(d.defenseOf(host) > baseDef, 'being known hardens every host against you');
});

test('overextended makes holdings decay faster', () => {
  // must be the same host in the same graph — a fresh load would roll a
  // different type, and types have different churn rates
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const h = d.state.hosts.find(x => x.ring === 1);
  h.owned = true;

  h.stability = 1;
  d.endTurn();
  const normal = 1 - h.stability;

  h.stability = 1;
  d.state.tags.add('overextended');
  d.endTurn();
  const stretched = 1 - h.stability;

  assert.ok(stretched > normal, `sprawl costs more upkeep (${stretched} vs ${normal})`);
});

test('persistence: tags and seen events survive a round trip', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.state.tags.add('dark_relay');
  d.state.tags.add('hunted');
  d.state.eventsSeen.push('first_quiet');

  const round = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.ok(round.tags.has('dark_relay'));
  assert.ok(round.tags.has('hunted'));
  assert.ok(round.eventsSeen.includes('first_quiet'));
});

test('data integrity: every event is reachable, well formed, and references real tags', () => {
  const { window } = loadNetwork();
  const tagIds = new Set(Object.keys(window.TAG_INFO));
  const ids = window.EVENTS.map(e => e.id);
  assert.equal(ids.filter((id, i) => ids.indexOf(id) !== i).length, 0, 'event ids are unique');

  window.EVENTS.forEach(e => {
    assert.ok(e.title && e.flavor, `${e.id} has text`);
    assert.ok(typeof e.cond === 'function', `${e.id} has a condition`);
    assert.ok(e.choices.length >= 2, `${e.id} offers a real choice`);
    e.choices.forEach(ch => {
      assert.ok(ch.text, `${e.id} choice has text`);
      assert.ok(typeof ch.apply === 'function', `${e.id} choice has an effect`);
      if (ch.gate) assert.ok(['power', 'cover', 'insight', 'cash'].includes(ch.gate.stat), `${e.id} gate stat is real`);
    });
  });

  // every tag the events can grant must be described to the player
  const src = window.EVENTS.map(e => e.choices.map(c => c.apply.toString()).join(' ')).join(' ');
  [...src.matchAll(/tags\.(?:add|delete)\('([a-z_]+)'\)/g)].forEach(m => {
    assert.ok(tagIds.has(m[1]), `event tag ${m[1]} has no TAG_INFO entry`);
  });
});

test('every stat and action shown to the player has an explanation', () => {
  const { window } = loadNetwork();
  ['insight', 'cash', 'power', 'cover', 'heat'].forEach(k => {
    assert.ok(window.STAT_INFO[k] && window.STAT_INFO[k].length > 20, `${k} is explained`);
  });
  ['sweep', 'lielow', 'upgrade', 'launder', 'shore'].forEach(k => {
    assert.ok(window.ACTION_INFO[k] && window.ACTION_INFO[k].length > 20, `${k} is explained`);
  });
});

// --- action points ------------------------------------------------------
// A turn is a budget you spend, not a synonym for one action. This is what
// makes the turn boundary mean something.

test('actions spend the budget without advancing the turn', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.res.insight = 80;              // money must not be what limits this

  // a fresh city always has a street left to look down, so a sweep is real
  assert.ok(d.sweepTargets().length > 0, 'there is somewhere to sweep on turn one');
  assert.equal(s.ap, window.AP.base, 'the turn opens with a full budget');

  const turn = s.turn;
  d.actScan();
  assert.equal(s.ap, window.AP.base - 1, 'one action spent');
  assert.equal(s.turn, turn, 'and the clock did not move');

  // spend whatever is left, then confirm you cannot overdraw
  drainBudgetBySweeping(d);
  s.ap = 0;
  const stuckTurn = s.turn;
  const stuckInsight = s.res.insight;
  d.actScan();
  assert.equal(s.ap, 0, 'you cannot overdraw the budget');
  assert.equal(s.turn, stuckTurn, 'a refused action does not advance the turn');
  assert.equal(s.res.insight, stuckInsight, 'and it costs nothing');
});

test('ending the turn runs the world and refills the budget', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 12).forEach(h => { h.owned = true; });
  s.ap = 0;
  const before = { turn: s.turn, insight: s.res.insight };

  d.actEndTurn();
  assert.equal(s.turn, before.turn + 1, 'the clock moved exactly once');
  assert.equal(s.ap, d.maxAP(), 'the budget refilled');
  assert.ok(s.res.insight > before.insight, 'the network produced during the world phase');
});

test('production is once per turn, not once per action', () => {
  // the old model paid out on every action, which is what made spamming the
  // cheapest turn-ender the optimal strategy
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.res.insight = 80;
  assert.ok(d.sweepTargets().length > 0, 'there is somewhere to sweep on turn one');

  const start = s.res.insight;
  const sweeps = drainBudgetBySweeping(d);
  assert.ok(sweeps > 0, 'the test needs at least one real sweep');
  assert.equal(s.res.insight, start - sweeps * window.SWEEP_COST, 'acting alone never pays out');

  d.actEndTurn();
  assert.ok(s.res.insight > start - sweeps * window.SWEEP_COST, 'only the world phase pays');
});

test('lying low costs the entire turn, not one action of it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 12).forEach(h => { h.owned = true; });
  s.heat = 20;
  const turn = s.turn;

  d.actLieLow();
  assert.equal(s.turn, turn + 1, 'going dark ends the turn there and then');
  assert.ok(s.heat < 20, 'and it did cut heat');
});

test('capabilities move the action budget in both directions', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 40).forEach(h => { h.discovered = true; h.owned = true; });
  s.res.insight = 1000;

  const base = d.maxAP();
  d.buyCap('parallel_ops');
  assert.equal(d.maxAP(), base + 1, 'parallel operations buy you tempo');

  const powerBefore = d.power();
  d.buyCap('deep_root');
  assert.equal(d.maxAP(), base, 'deep root costs a permanent action');
  assert.ok(d.power() > powerBefore, 'and pays for it in force');
});

test('a capability can never strand you with no actions at all', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 40).forEach(h => { h.discovered = true; h.owned = true; });
  s.res.insight = 5000;

  // buy every action-costing capability we can; the floor must hold
  for (let i = 0; i < 12; i++) {
    window.CAPABILITIES.filter(c => (c.apDelta || 0) < 0).forEach(c => d.buyCap(c.id));
  }
  assert.ok(d.maxAP() >= window.AP.min, `budget fell to ${d.maxAP()}`);
  assert.equal(d.maxAP(), window.AP.min, 'and it bottoms out exactly at the floor');
});

test('repeatable capabilities respect their cap and escalate in price', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.res.insight = 100000;
  const c = d.capById('parallel_ops');

  const first = d.capCost(c);
  d.buyCap('parallel_ops');
  assert.ok(d.capCost(c) > first, 'the next one costs more');

  for (let i = 0; i < 10; i++) d.buyCap('parallel_ops');
  assert.equal(d.capCount('parallel_ops'), c.max, 'it stops at its maximum');
});

test('persistence: the budget and everything bought survive a round trip', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.state.res.insight = 1000;
  d.state.hosts.forEach(h => { if (h.ring <= 2) h.owned = true; });
  d.buyCap('parallel_ops');
  d.state.ap = 1;

  const round = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(round.ap, 1);
  assert.equal(round.caps.parallel_ops, 1);
});

test('data integrity: capabilities are well formed and honestly priced', () => {
  const { window } = loadNetwork();
  const ids = window.CAPABILITIES.map(c => c.id);
  assert.equal(ids.filter((id, i) => ids.indexOf(id) !== i).length, 0, 'capability ids are unique');

  window.CAPABILITIES.forEach(c => {
    assert.ok(c.name && c.desc, `${c.id} is described to the player`);
    assert.ok(typeof c.cond === 'function', `${c.id} has an availability rule`);
    if (c.repeatable) {
      assert.ok(Array.isArray(c.costs) && c.costs.length, `${c.id} has a cost table`);
      assert.ok(c.max >= 1, `${c.id} has a maximum`);
      for (let i = 1; i < c.costs.length; i++) {
        assert.ok(c.costs[i] > c.costs[i - 1], `${c.id} costs must escalate`);
      }
    } else {
      assert.ok(typeof c.cost === 'number', `${c.id} has a cost`);
    }
    // anything that takes an action away must give something real back
    if ((c.apDelta || 0) < 0) {
      assert.ok(c.effect && Object.keys(c.effect).length, `${c.id} costs tempo but grants nothing`);
    }
  });
});

// --- time must never be free -------------------------------------------
// Three separate exploits shared one root cause: any action that ended a turn
// granted production, so the best play was to spam the cheapest turn-ender.

test('lying low earns nothing — hiding costs you the turn', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 40).forEach(h => { h.owned = true; });
  s.heat = 20;
  const before = s.res.insight;

  for (let i = 0; i < 10; i++) { s.card = null; d.actLieLow(); }
  assert.equal(s.res.insight, before, 'ten turns dark produced nothing');
  assert.ok(s.heat < 20, 'but it did cut heat');
});

test('backing out of a breach costs no turn and yields nothing', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const target = d.neighbours(d.owned()[0]).find(n => !n.owned);
  target.discovered = true;
  const before = { insight: s.res.insight, cash: s.res.cash, turn: s.turn, heat: s.heat };

  for (let i = 0; i < 15; i++) { d.openBreach(target.id); d.resolveBreach('walk'); }

  assert.equal(s.turn, before.turn, 'walking away never ticks the clock');
  assert.equal(s.res.insight, before.insight, 'and never pays out');
  assert.equal(s.heat, before.heat);
  assert.equal(s.card, null, 'the card is closed');
});

test('a healthy holding cannot be shored for a free turn', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const h = s.hosts.find(x => !x.origin);
  h.owned = true;
  h.stability = 1;
  s.res.insight = 100;
  const before = { insight: s.res.insight, turn: s.turn };

  assert.equal(d.shoreNeeded(h), false, 'nothing to shore on a healthy host');
  for (let i = 0; i < 10; i++) d.actShore(h.id);
  assert.equal(s.turn, before.turn, 'no turn was spent');
  assert.equal(s.res.insight, before.insight, 'and no insight cycled into production');

  h.stability = 0.4;
  assert.equal(d.shoreNeeded(h), true, 'a decayed host can be shored');
});

test('heat has a floor that scales with holdings, so a sprawl cannot hide', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = false; });
  s.tags.clear();
  assert.equal(d.heatFloor(), 0, 'holding nothing, you are invisible');

  const loud = s.hosts.filter(h => h.role !== 'stealth').slice(0, 10);
  loud.forEach(h => { h.owned = true; });
  const loudFloor = d.heatFloor();
  assert.ok(loudFloor > 0, 'a loud network can never be fully hidden');

  s.hosts.filter(h => h.role === 'stealth').slice(0, 4).forEach(h => { h.owned = true; });
  assert.ok(d.heatFloor() < loudFloor, 'routers lower the floor — that is what stealth buys');

  s.tags.add('dark_relay');
  assert.ok(d.heatFloor() < loudFloor, 'and a dark relay lowers it further');
});

test('lying low cannot drive heat below the floor', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.filter(h => h.role !== 'stealth').slice(0, 12).forEach(h => { h.owned = true; });
  const floor = d.heatFloor();
  assert.ok(floor > 0, 'test needs a real floor to be meaningful');

  s.heat = floor + 20;
  for (let i = 0; i < 40; i++) { s.card = null; d.actLieLow(); }
  assert.ok(s.heat >= d.heatFloor() - 0.001, `heat ${s.heat} fell below the floor ${d.heatFloor()}`);
});

test('the hunter fires once heat crosses the threshold', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.state.heat = window.HEAT.STRIKE + 1;
  d.endTurn();
  assert.ok(d.state.card && d.state.card.kind === 'strike', 'the strike card is raised');
});

test('strike branches differ: ride burns a share, shed drops the loud ones, cover pays', () => {
  const HEAT = loadNetwork().window.HEAT;
  function primed(effect) {
    const { window } = loadNetwork();
    const d = window.__netDebug;
    const s = d.state;
    s.hosts.forEach(h => { h.discovered = true; h.owned = true; });
    s.res.insight = 40;
    s.heat = HEAT.STRIKE + 2;
    s.card = { kind: 'strike' };
    const before = d.owned().length;
    d.resolveStrike(effect);
    return { before, after: d.owned().length, heat: s.heat, floor: d.heatFloor(),
             insight: s.res.insight, strikes: s.strikes };
  }

  const ride = primed('ride');
  assert.ok(ride.after < ride.before, 'riding it out costs you bodies');

  const cover = primed('burn_cover');
  assert.equal(cover.after, cover.before, 'paying protects the whole fleet');
  assert.equal(cover.insight, 32, 'and costs 8 insight');

  const shed = primed('shed_loud');
  assert.ok(shed.after <= shed.before, 'shedding drops the noisy holdings');

  for (const r of [ride, cover, shed]) {
    assert.equal(r.strikes, 1);
    // heat falls as far as the rules allow. Holding most of the city can put
    // the floor above the strike line — permanently hunted is a real state,
    // not a bug — so the claim is "it dropped to the floor", not "below 40".
    const lowest = Math.max(r.floor, HEAT.STRIKE * HEAT.STRIKE_DROP);
    assert.ok(r.heat <= lowest + 0.001, `heat ${r.heat} did not fall to ${lowest}`);
  }
});

test('churn reclaims neglected holdings, but never the origin', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const seat = d.owned()[0];
  const victim = s.hosts.find(h => !h.origin);
  victim.owned = true;
  victim.stability = 0.001;
  seat.stability = 0.001; // the origin should survive regardless

  d.endTurn();
  assert.equal(victim.owned, false, 'a decayed holding is reclaimed');
  assert.equal(seat.owned, true, 'the seat you started from is never lost to churn');
});

test('shoring up spends insight and restores stability', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const h = s.hosts.find(x => !x.origin);
  h.owned = true;
  h.discovered = true;
  h.stability = 0.2;
  s.res.insight = 10;

  d.actShore(h.id);
  assert.equal(s.res.insight, 8, 'it costs 2, and acting alone does not pay out');
  assert.ok(h.stability > 0.5, 'stability restored');
});

test('laundering converts cash into heat relief — the cash playstyle lever', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.res.cash = window.LAUNDER.cost;
  s.heat = 20;

  d.actLaunder();
  assert.equal(s.res.cash, 0, 'cash is spent');
  assert.ok(s.heat < 20 - window.LAUNDER.heat + 5, 'heat dropped meaningfully');
});

test('stage label tracks how much you hold', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  assert.equal(d.stageFor(1).key, 'foothold');
  assert.equal(d.stageFor(3).key, 'cluster');
  assert.equal(d.stageFor(24).key, 'everywhere');
});

test('persistence: serialize -> JSON -> deserialize keeps the whole board', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.res.insight = 77;
  s.upgrades = 5;
  s.heat = 12.5;
  s.hosts[3].owned = true;

  const round = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(round.res.insight, 77);
  assert.equal(round.upgrades, 5);
  assert.equal(round.heat, 12.5);
  assert.equal(round.hosts.length, s.hosts.length);
  assert.equal(round.hosts[3].owned, true, 'ownership survives the round trip');
});

test('persistence: a stale or corrupt save is rejected rather than half-loaded', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  assert.equal(d.deserialize(null), null);
  assert.equal(d.deserialize({ v: 999, hosts: [] }), null, 'version mismatch');
  assert.equal(d.deserialize({ v: 1 }), null, 'missing hosts');
});

test('a fresh page load resumes the saved board instead of regenerating it', () => {
  const first = loadNetwork();
  const d1 = first.window.__netDebug;
  d1.state.res.insight = 55;
  d1.state.hosts[2].owned = true;
  d1.state.hosts[2].discovered = true;
  d1.persistNow();
  const raw = first.window.localStorage.getItem('network_proto_save');

  const second = loadNetwork({ localStorageSeed: { network_proto_save: raw } });
  const d2 = second.window.__netDebug;
  assert.equal(d2.state.res.insight, 55, 'resumed, not restarted');
  assert.equal(d2.state.hosts[2].owned, true, 'the same board came back');
});
