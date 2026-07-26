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
  assert.equal(s.hosts.length, s.buildings.length, 'one building, one host — the building is the prize');
  assert.equal(d.owned().length, 1, 'exactly one host is held at the start');

  // you start in the suburbs, and only that building is visible
  const seat = d.owned()[0];
  const home = d.buildingById(seat.buildingId);
  assert.equal(home.district, 'residential', 'the origin is in the suburbs');
  assert.equal(s.buildings.filter(b => b.discovered).length, 1, 'only home is visible at the start');

  // every district is represented, and difficulty rides the district
  const districts = new Set(s.buildings.map(b => b.district));
  Object.keys(window.DISTRICTS).forEach(k => assert.ok(districts.has(k), `district ${k} is missing`));

  // every building must hold exactly the one thing you take it for
  s.buildings.forEach(b => {
    const inside = d.hostsIn(b);
    assert.equal(inside.length, 1, `${b.id} does not hold exactly one host`);
    assert.equal(inside[0].buildingId, b.id, `${b.id}'s host points back at it`);
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

test('city: masts and cabinets are cheap stealth kit standing on the street', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;

  const eyes = s.buildings.filter(b => b.kind === 'mast' || b.kind === 'cabinet');
  assert.ok(eyes.length > 0, 'the city has cameras and cabinets');
  eyes.forEach(b => {
    const h = d.hostsIn(b)[0];
    assert.equal(h.role, 'stealth', `${b.kind} is stealth kit`);
    // small enough to read as street furniture rather than a building
    assert.ok(b.w <= 26 && b.h <= 28, `${b.kind} is street-sized`);
  });
});

test('city: holding a camera reveals what is around it, without a sweep', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const before = s.buildings.filter(b => b.discovered).length;

  const cam = s.hosts.find(h => h.role === 'stealth');
  cam.owned = true;
  cam.discovered = true;
  d.cameraVision();

  const after = s.buildings.filter(b => b.discovered).length;
  assert.ok(after > before, 'an eye on the street shows you the street');
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

test('frontier: you can reach the next building along, and nothing further', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const seat = d.owned()[0];
  const home = d.buildingById(seat.buildingId);

  // anything undiscovered is off limits, wherever it is
  const hidden = s.hosts.find(h => !h.discovered);
  assert.equal(d.isFrontier(hidden), false, 'you cannot act on what you have not seen');

  // the building next door, once seen, is the thing you can move on
  const neighbourId = d.buildingNeighbours(home.id)[0];
  assert.ok(neighbourId, 'home has a neighbour across the street');
  const nb = d.buildingById(neighbourId);
  d.revealBuilding(nb);
  assert.equal(d.isFrontier(d.hostsIn(nb)[0]), true, 'next door is reachable');

  // a building two streets away is visible but out of reach until you close in
  const held = d.heldBuildingIds();
  const far = s.buildings.find(b => !held[b.id] &&
    !d.buildingNeighbours(home.id).includes(b.id) && b.id !== home.id);
  assert.ok(far, 'the city is bigger than one junction');
  d.revealBuilding(far);
  assert.equal(d.isFrontier(d.hostsIn(far)[0]), false, 'seeing it is not the same as reaching it');

  // take the building between and the far one comes into range
  const bridge = s.buildings.find(b => b.id !== home.id &&
    d.buildingNeighbours(b.id).includes(far.id) && d.buildingNeighbours(home.id).includes(b.id));
  if (bridge) {
    d.hostsIn(bridge)[0].owned = true;
    assert.equal(d.isFrontier(d.hostsIn(far)[0]), true, 'ground you hold extends your reach');
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
  // a modest holding: one building is one host now, so forty of them is an
  // empire whose sprawl outruns the lie-low lever entirely
  s.hosts.slice(0, 12).forEach(h => { h.owned = true; });
  // sprawl sets a floor under heat, so start clearly above it or there is
  // nothing for lying low to shed
  const start = d.heatFloor() + 20;
  s.heat = start;
  const before = s.res.insight;

  for (let i = 0; i < 10; i++) { s.card = null; d.actLieLow(); }
  assert.equal(s.res.insight, before, 'ten turns dark produced nothing');
  assert.ok(s.heat < start, 'but it did cut heat');
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

// Advance the world n turns, resolving whatever cards come up. endTurn refuses
// while a card is open, so a bare loop of actEndTurn silently does nothing.
function advanceTurns(d, n) {
  for (let guard = 0; guard < n * 6; guard++) {
    if (n <= 0 || d.state.over) break;
    if (d.state.card) {
      const c = d.state.card;
      if (c.kind === 'event') {
        const ev = d.eventById(c.eventId);
        const i = ev.choices.findIndex(ch => d.choiceUsable(ch));
        d.resolveEvent(i === -1 ? 0 : i);
      } else if (c.kind === 'strike') {
        d.resolveStrike('shed_loud');
      } else {
        d.resolveBreach('walk');
      }
      continue;
    }
    const before = d.state.turn;
    d.actEndTurn();
    if (d.state.turn > before) n--;
  }
}

// --- the rival ----------------------------------------------------------

test('the rival stays asleep until you are established', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  assert.equal(d.state.rival.awake, false, 'it does not exist on turn one');
  advanceTurns(d, 6);
  assert.equal(d.state.rival.awake, false, 'and not merely because time passed');

  // give the player a real presence, then let the world turn
  d.state.buildings.slice(0, window.RIVAL.wakesAtHeld + 2).forEach(b => {
    d.hostsIn(b).slice(0, 1).forEach(h => { h.owned = true; h.discovered = true; });
  });
  advanceTurns(d, 1);
  assert.equal(d.state.rival.awake, true, 'once you are established, so is it');
  assert.ok(d.rivalHeld().length > 0, 'and it holds ground of its own');
});

test('the rival takes only what is unclaimed, and never from under you', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  s.buildings.slice(0, 14).forEach(b => {
    d.hostsIn(b).slice(0, 1).forEach(h => { h.owned = true; h.discovered = true; });
  });

  advanceTurns(d, 120);

  const mine = d.heldBuildingIds();
  d.rivalHeld().forEach(id => {
    assert.equal(!!mine[id], false, `the rival took ${id}, which the player holds`);
  });
  assert.ok(d.rivalHeld().length > 1, 'and it did expand');
});

test('what the rival holds is closed to you', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  const target = s.buildings[s.buildings.length - 1];
  s.rival.awake = true;
  s.rival.buildings = [target.id];

  d.hostsIn(target).forEach(h => {
    assert.equal(d.rivalBlocks(h), true, 'it is theirs');
    assert.equal(d.isFrontier(h), false, 'so you cannot move on it');
  });
});

test('the rival cannot swallow the whole city', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  s.buildings.slice(0, 14).forEach(b => {
    d.hostsIn(b).slice(0, 1).forEach(h => { h.owned = true; h.discovered = true; });
  });

  advanceTurns(d, 400);

  const cap = Math.floor(s.buildings.length * window.RIVAL.maxShareOfCity);
  assert.ok(d.rivalHeld().length <= cap,
    `rival holds ${d.rivalHeld().length} of ${s.buildings.length}, past its cap of ${cap}`);
});

test('persistence: the rival and its territory survive a round trip', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.state.rival = { awake: true, buildings: [d.state.buildings[3].id], lastActed: 7, seen: true };

  const round = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(round.rival.awake, true);
  assert.equal(round.rival.buildings.length, 1);
  assert.equal(round.rival.seen, true);
});

// --- the country ---------------------------------------------------------
// The layer above the city. The city map is not replaced by it: a defended
// city on the national map *is* the building game, and a finished one collapses
// into a single number that keeps paying.

// Hold a city up to its consolidate bar without playing it out building by
// building — the country tests are about what happens above the streets.
function holdToGoal(d) {
  const goal = d.cityGoal();
  let n = 0;
  for (const b of d.state.buildings) {
    if (n >= goal) break;
    const h = d.hostsIn(b)[0];
    if (h && !h.owned) { h.owned = true; h.discovered = true; b.discovered = true; n++; }
  }
  return n;
}

test('country: every region is on the map, and every city is walkable from home', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const co = d.state.country;

  assert.ok(co.cities.length >= 12, `only ${co.cities.length} cities`);
  window.REGIONS.forEach(R => {
    const here = co.cities.filter(c => c.region === R.id);
    assert.ok(here.length, `region ${R.id} has no cities`);
    if (R.faction) {
      assert.equal(here.filter(c => c.kind === 'root').length, 1, `${R.id} needs exactly one seat`);
    }
  });

  // reach only travels through *defended* cities you took — folding a town in
  // from a distance must not open the road onward
  const taken = new Set([co.homeId]);
  for (let step = 0; step < 60; step++) {
    const front = co.cities.filter(c => !taken.has(c.id) && d.cityRoads(c.id).some(id => {
      const n = d.cityById(id);
      return taken.has(id) && n && window.CITY_KINDS[n.kind].contest;
    }));
    if (!front.length) break;
    front.forEach(c => taken.add(c.id));
  }
  assert.equal(taken.size, co.cities.length,
    `${co.cities.length - taken.size} cities cannot be reached from home`);

  const names = co.cities.map(c => c.name);
  assert.equal(new Set(names).size, names.length, 'two cities share a name');
});

test('country: a town folds in from a distance, a defended city has to be walked', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;

  holdToGoal(d);
  s.ap = 9;
  assert.equal(d.actConsolidate(), true, 'the home city folds in once you hold enough');
  assert.equal(s.scope, 'country', 'and puts you on the national map');

  const front = d.countryFrontier();
  assert.ok(front.length, 'consolidating opens a frontier');

  const town = front.find(c => c.kind === 'fold');
  if (town) {
    const before = s.country.presence;
    s.ap = 9;
    d.actReach(town.id);
    assert.equal(s.scope, 'country', 'a town never drops you into a city map');
    assert.ok(s.country.presence > before, 'and pays presence straight away');
    assert.equal(d.cityById(town.id).consolidated, true);
  }

  const hard = d.countryFrontier().find(c => window.CITY_KINDS[c.kind].contest);
  assert.ok(hard, 'there is somewhere defended to go');
  s.ap = 9;
  d.actReach(hard.id);
  assert.equal(s.scope, 'city', 'a defended city drops you into the streets');
  assert.equal(d.currentCity().id, hard.id);
  assert.ok(s.buildings.length > 8, 'with a real map to walk');
  assert.equal(d.heldHere(), 1, 'and a single foothold, same as the first city');
});

test('country: reach never jumps to somewhere no road runs to', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  holdToGoal(d);
  s.ap = 9;
  d.actConsolidate();

  const far = s.country.cities.find(c => !d.cityReachable(c) && !c.taken);
  assert.ok(far, 'most of the country is out of reach at the start');
  s.ap = 9;
  assert.equal(d.actReach(far.id), false, 'and cannot be moved on');
  assert.equal(d.cityById(far.id).taken, false);
});

test('country: a city you finish stops being streets and becomes presence', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;

  holdToGoal(d);
  const powerBefore = d.power();
  const heldBefore = d.owned().length;
  assert.ok(heldBefore > 5, 'you were holding real ground');

  s.ap = 9;
  d.actConsolidate();

  assert.equal(d.owned().length, 0, 'the streets are released — you hold the city now');
  assert.ok(s.country.presence > 0, 'and it converted into presence');
  // Winning must not gut you. Presence buys back most of the power the
  // streets were giving — you trade some depth for reach and standing income,
  // but never so much that the next region becomes unplayable.
  assert.ok(d.power() >= powerBefore * 0.8,
    `power collapsed from ${powerBefore} to ${d.power()} on consolidating`);
  assert.ok(d.heatFloor() > 0, 'a national operation cannot hide completely');
});

test('country: presence pays every turn, whether or not you are standing there', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  holdToGoal(d);
  s.ap = 9;
  d.actConsolidate();

  const y = d.presenceYield();
  assert.ok(y.insight > 0 && y.cash > 0, 'presence yields something');

  const before = { insight: s.res.insight, cash: s.res.cash };
  d.endTurn();
  assert.ok(s.res.insight > before.insight, 'insight arrives from the country');
  assert.ok(s.res.cash > before.cash, 'so does cash');
});

test('country: heat is regional — it waits where you left it, and cools while you are away', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  holdToGoal(d);
  s.ap = 9;
  d.actConsolidate();

  const hard = d.countryFrontier().find(c => window.CITY_KINDS[c.kind].contest);
  s.ap = 9;
  d.actReach(hard.id);
  const away = s.region;
  assert.notEqual(away, 'home', 'you went somewhere else');

  s.heat = 30;
  s.ap = 9;
  d.actTravel(s.country.homeId);
  assert.equal(s.region, 'home', 'you are back in the home region');
  assert.ok(s.heat < 30, 'and not carrying the other region\'s heat with you');
  assert.equal(s.country.regionHeat[away], 30, 'which is still waiting where you left it');

  d.coolRegionsAway();
  d.coolRegionsAway();
  assert.ok(s.country.regionHeat[away] < 30, 'though it cools while you are elsewhere');
  assert.ok(s.country.regionHeat[away] > 20, 'slowly enough that leaving is not a reset');
});

test('country: the campaign carries across cities — tooling, capabilities, resources', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;

  s.upgrades = 4;
  s.caps = { parallel_ops: 2 };
  s.tags.add('clean_room');
  s.res.insight = 50;
  const apCap = d.maxAP();

  holdToGoal(d);
  s.ap = 9;
  d.actConsolidate();
  const hard = d.countryFrontier().find(c => window.CITY_KINDS[c.kind].contest);
  s.ap = 9;
  d.actReach(hard.id);

  assert.equal(s.upgrades, 4, 'tooling carried');
  assert.equal(s.caps.parallel_ops, 2, 'capabilities carried');
  assert.equal(s.tags.has('clean_room'), true, 'tags carried');
  assert.equal(s.res.insight, 50, 'resources carried');
  assert.equal(d.maxAP(), apCap, 'and so did the action budget they bought');
});

test('country: cities out in the regions are harder than the one you started in', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const homeAvg = s.hosts.reduce((a, h) => a + h.defense, 0) / s.hosts.length;

  const far = s.country.cities.find(c => c.regionTier >= 3 && window.CITY_KINDS[c.kind].contest);
  assert.ok(far, 'the country has deep regions');
  d.enterCity(far.id);
  const farAvg = s.hosts.reduce((a, h) => a + h.defense, 0) / s.hosts.length;
  assert.ok(farAvg > homeAvg * 1.5,
    `${far.region} averages ${farAvg.toFixed(1)} against home's ${homeAvg.toFixed(1)}`);
});

test('country: an unfinished city is still there when you come back to it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  holdToGoal(d);
  s.ap = 9;
  d.actConsolidate();

  const hard = d.countryFrontier().find(c => window.CITY_KINDS[c.kind].contest);
  s.ap = 9;
  d.actReach(hard.id);
  // take a couple of buildings and walk away without finishing
  const took = s.buildings.slice(0, 3).map(b => d.hostsIn(b)[0]);
  took.forEach(h => { h.owned = true; h.discovered = true; });
  const heldThere = d.heldHere();
  const names = s.hosts.map(h => h.name).join('|');

  s.ap = 9;
  d.actTravel(s.country.homeId);
  s.ap = 9;
  d.actTravel(hard.id);

  assert.equal(d.currentCity().id, hard.id, 'you went back');
  assert.equal(s.hosts.map(h => h.name).join('|'), names, 'to the same city, not a new one');
  assert.equal(d.heldHere(), heldThere, 'still holding what you held');
});

// Fold in enough defended cities that `share` of the country is finished.
function conquerTo(d, window, share) {
  const defended = d.state.country.cities.filter(c => window.CITY_KINDS[c.kind].contest);
  const want = Math.ceil(share * defended.length);
  defended.slice(0, want).forEach(c => { c.taken = true; c.consolidated = true; });
  return d.conquest();
}

test('country: taking a faction seat finishes the faction', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const f = window.FACTIONS[0];

  conquerTo(d, window, f.wakes);
  d.checkFactions();
  assert.equal(d.factionAwake(f.id), true, 'taking that much of the country wakes them');

  d.breakFactionAt(s.country.factions[f.id].rootId);
  assert.equal(d.factionAwake(f.id), false, 'taking their seat ends them');
  assert.equal(s.country.factions[f.id].broken, true);
});

test('persistence: the country survives a round trip', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  holdToGoal(d);
  s.ap = 9;
  d.actConsolidate();
  conquerTo(d, window, window.FACTIONS[0].wakes);
  d.checkFactions();
  const presence = s.country.presence;

  const round = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.ok(round, 'the save is accepted');
  assert.equal(round.scope, 'country');
  assert.equal(round.country.presence, presence);
  assert.equal(round.country.cities.length, s.country.cities.length);
  assert.equal(round.region, s.region);
  assert.equal(round.country.factions.quiet_hours.awake, true, 'woken factions stay woken');
  assert.equal(round.country.cities.find(c => c.id === round.country.homeId).consolidated, true);
});

test('country: a city you walk away from is frozen, not running in the background', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  holdToGoal(d);
  s.ap = 9;
  d.actConsolidate();

  const hard = d.countryFrontier().find(c => window.CITY_KINDS[c.kind].contest);
  s.ap = 9;
  d.actReach(hard.id);
  s.buildings.slice(0, 4).forEach(b => { const h = d.hostsIn(b)[0]; h.owned = true; h.discovered = true; });
  const heldThere = d.owned().length;
  assert.ok(heldThere >= 4, 'you took some of it');

  s.ap = 9;
  d.actTravel(s.country.homeId);
  assert.equal(d.owned().length, 0,
    'standing in another region, the streets you left are not still yours to run');
  assert.equal(s.buildings.length, 0, 'and the city you left is not loaded');

  s.ap = 9;
  d.actTravel(hard.id);
  assert.equal(d.owned().length, heldThere, 'and it is all still there when you go back');
});

// --- the faction ladder --------------------------------------------------
// The escalation is not a difficulty slider: each faction deletes a rule you
// had got used to. These tests are about the tool going away and coming back,
// because that is the whole design.

function wake(d, id) {
  const f = d.state.country.factions[id];
  f.awake = true;
  f.broken = false;
}

test('factions: wake on presence in order, hardest last', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const order = window.FACTIONS.slice().sort((a, b) => a.wakes - b.wakes);
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i].wakes > order[i - 1].wakes, 'each faction wakes later than the last');
    assert.ok(order[i].tier > order[i - 1].tier, 'and is a rung further up');
  }
  order.forEach(f => assert.ok(f.wakes > 0 && f.wakes <= 1,
    `${f.id} wakes at ${f.wakes}, which is not a share of the country`));

  assert.equal(d.conquest(), 0, 'you have finished none of it yet');
  d.checkFactions();
  assert.equal(d.awakeFactions().length, 0, 'nobody cares about you yet');

  conquerTo(d, window, order[0].wakes);
  d.checkFactions();
  assert.equal(d.awakeFactions().length, 1, 'the first one notices');
  assert.equal(d.awakeFactions()[0].id, order[0].id);

  conquerTo(d, window, 1);
  d.checkFactions();
  assert.equal(d.awakeFactions().length, window.FACTIONS.length, 'eventually all of them');
});

test('factions: every one of them deletes a rule, and no two delete the same one', () => {
  const { window } = loadNetwork();
  const breaks = window.FACTIONS.map(f => f.breaks);
  assert.equal(new Set(breaks).size, breaks.length, 'two factions take the same tool away');
  window.FACTIONS.forEach(f => {
    assert.ok(f.tell && f.onWake, `${f.id} does not say what it does`);
  });
});

test('the quiet hours: going dark stops shedding heat, and the turn is still gone', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 10).forEach(h => { h.owned = true; });

  // The world turn has its own drift, which can be negative all on its own.
  // The claim is about the shed, so measure the same board twice and compare
  // the difference rather than the sign.
  const start = d.heatFloor() + 25;
  s.heat = start;
  s.ap = 2; s.card = null;
  d.actLieLow();
  const openShed = start - s.heat;
  assert.ok(openShed > 0, 'normally lying low buys heat down');

  wake(d, 'quiet_hours');
  s.heat = start;
  s.ap = 2; s.card = null;
  const turnBefore = s.turn;
  d.actLieLow();
  const watchedShed = start - s.heat;

  assert.ok(Math.abs((openShed - watchedShed) - d.lieLowShed()) < 1e-6,
    `watched, the ${d.lieLowShed().toFixed(1)} it normally sheds is gone (shed ${openShed} vs ${watchedShed})`);
  assert.ok(s.turn > turnBefore, 'and it still costs you the turn');
});

test('ledger: laundering stops cleaning and starts pointing at you', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 8).forEach(h => { h.owned = true; });

  s.res.cash = 60; s.ap = 4; s.card = null;
  s.heat = d.heatFloor() + 20;
  const start = s.heat;
  d.actLaunder();
  assert.ok(s.heat < start, 'normally money buys heat down');

  wake(d, 'ledger');
  s.res.cash = 60; s.ap = 4; s.card = null;
  s.heat = d.heatFloor() + 20;
  const matched = s.heat;
  const cashBefore = s.res.cash;
  d.actLaunder();
  assert.ok(s.heat > matched, 'matched, washing money raises heat instead');
  assert.ok(s.res.cash < cashBefore, 'and it still costs you the cash');
});

test('civic eyes: your own cameras stop covering you and start reporting', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = false; });
  const eyes = s.hosts.filter(h => h.role === 'stealth').slice(0, 4);
  const loud = s.hosts.filter(h => h.role !== 'stealth').slice(0, 6);
  eyes.concat(loud).forEach(h => { h.owned = true; h.discovered = true; });

  const coverBefore = d.cover();
  const driftBefore = d.heatPerTurn();
  const floorBefore = d.heatFloor();

  wake(d, 'civic_eyes');
  assert.ok(d.cover() < coverBefore, 'audited cameras are not cover');
  assert.ok(d.heatPerTurn() > driftBefore, 'they add heat rather than remove it');
  assert.ok(d.heatFloor() > floorBefore, 'and you cannot hide under them any more');

  // and they stop showing you the street
  s.buildings.forEach(b => { b.discovered = false; });
  d.cameraVision();
  assert.equal(s.buildings.filter(b => b.discovered).length, 0, 'no free sight while audited');
});

test('the cut: severed streets strand what you hold, and are relaid afterwards', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.discovered = true; });
  s.hosts.slice(0, 18).forEach(h => { h.owned = true; });

  assert.equal(d.cutStreets(), null, 'nothing is cut while nobody is cutting');

  wake(d, 'the_cut');
  s.lastCutTurn = -99;
  const cut = d.cutStreets();
  assert.ok(cut, 'they take a street');
  assert.equal(s.cuts.length, 1, 'and it is recorded so it can be put back');

  // cadence: not every single turn
  assert.equal(d.cutStreets(), null, 'they are a crew, not a weather system');

  // the street comes back
  s.turn += window.HEAT.CUT_REPAIR + 1;
  const relaid = d.repairStreets();
  assert.equal(relaid.length, 1, 'the council relays it');
  assert.equal(s.cuts.length, 0);
  assert.ok(d.buildingNeighbours(cut.a).includes(cut.b), 'and the street is a street again');
});

test('the cut: never cuts a city shut', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.discovered = true; });
  s.hosts.slice(0, 12).forEach(h => { h.owned = true; });
  wake(d, 'the_cut');

  for (let i = 0; i < 30; i++) {
    s.lastCutTurn = -99;
    s.turn += 1;
    d.cutStreets();
    assert.ok(s.hosts.filter(h => d.isFrontier(h)).length > 0,
      'there is always somewhere left to go');
  }
});

test('the cut: stranded holdings rot, connected ones do not', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.discovered = true; });
  s.hosts.slice(0, 16).forEach(h => { h.owned = true; });

  assert.equal(d.strandedHosts().length, 0, 'nothing is stranded while the streets are whole');

  wake(d, 'the_cut');
  // cut until something is genuinely cut off
  let stranded = [];
  for (let i = 0; i < 40 && !stranded.length; i++) {
    s.lastCutTurn = -99;
    s.turn += 1;
    d.cutStreets();
    stranded = d.strandedHosts();
  }
  if (!stranded.length) return; // a board where the network never split; fine
  // compare like with like: host types churn at different base rates, so the
  // claim is about the multiplier, not about which building happened to rot
  const victim = stranded[0];
  const twin = d.owned().find(h => !stranded.includes(h) && !h.origin && h.type === victim.type);
  const v0 = victim.stability;
  const t0 = twin ? twin.stability : null;
  s.card = null;
  d.endTurn({ silent: true });

  const churn = window.HOST_TYPES[victim.type].churn;
  const dropped = v0 - victim.stability;
  assert.ok(dropped > 0, 'what you cannot reach decays');
  assert.ok(Math.abs(dropped - churn * window.HEAT.STRANDED_DECAY) < 1e-9,
    `stranded decay was ${dropped}, expected ${churn * window.HEAT.STRANDED_DECAY}`);
  if (twin) {
    assert.ok(dropped > (t0 - twin.stability) * 1.5,
      'and far faster than the same kind of holding you can still reach');
  }
});

test('factions: taking the seat gives the tool back', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 10).forEach(h => { h.owned = true; });

  wake(d, 'quiet_hours');
  assert.equal(d.ruleBroken('lielow'), true);

  d.breakFactionAt(s.country.factions.quiet_hours.rootId);
  assert.equal(d.ruleBroken('lielow'), false, 'their seat falls, the quiet is yours again');

  s.heat = d.heatFloor() + 20;
  const before = s.heat;
  s.card = null;
  d.actLieLow();
  assert.ok(s.heat < before, 'and lying low works exactly as it used to');
});

test('factions: a broken faction never wakes again', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.country.factions.ledger.broken = true;
  conquerTo(d, window, 1);
  d.checkFactions();
  assert.equal(d.factionAwake('ledger'), false, 'they are finished, not merely quiet');
  assert.equal(d.ruleBroken('launder'), false);
});

test('the other one: takes the country it can reach, never from under you, and is capped', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const co = s.country;

  wake(d, 'the_other');
  // give it a long run at the map
  for (let i = 0; i < 400; i++) { s.turn += 1; d.mirrorStep(); }

  const m = d.mirror();
  assert.ok(m.cities.length > 1, 'it spreads');
  const cap = Math.ceil(co.cities.length * window.MIRROR.maxShareOfCountry);
  assert.ok(m.cities.length <= cap,
    `it holds ${m.cities.length} of ${co.cities.length}, past its cap of ${cap}`);
  m.cities.forEach(id => {
    assert.equal(d.cityById(id).taken, false, 'it never takes a city you already hold');
  });
  assert.ok(Object.keys(m.caps).length > 0, 'and it buys off the same shelf you do');
});

test('the other one: what it holds is closed to you', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const target = s.country.cities.find(c => !c.taken && window.CITY_KINDS[c.kind].contest);
  // put it next to something of yours so it would otherwise be reachable
  d.cityRoads(target.id).forEach(id => {
    const n = d.cityById(id);
    if (n && window.CITY_KINDS[n.kind].contest) n.taken = true;
  });
  assert.equal(d.cityReachable(target), true, 'it is on your frontier');

  d.mirror().cities.push(target.id);
  assert.equal(d.cityReachable(target), false, 'until something else gets there first');
});

test('persistence: the ladder and the mirror survive a round trip', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  wake(d, 'quiet_hours');
  wake(d, 'the_cut');
  s.country.factions.ledger.broken = true;
  s.cuts = [{ a: s.buildings[0].id, b: s.buildings[1].id, until: 20 }];
  s.lastCutTurn = 12;
  d.mirror().cities.push(s.country.cities[5].id);
  d.mirror().caps = { deep_root: 1 };

  const round = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.ok(round);
  assert.equal(round.country.factions.quiet_hours.awake, true);
  assert.equal(round.country.factions.ledger.broken, true);
  assert.equal(round.cuts.length, 1, 'open roadworks survive');
  assert.equal(round.lastCutTurn, 12);
  assert.equal(round.country.mirror.cities.length, 1);
  assert.equal(round.country.mirror.caps.deep_root, 1);
});

// --- the deck ------------------------------------------------------------
// A card nobody can ever draw is a card that was never written. This sweeps a
// spread of plausible campaign states and checks the whole deck is live.

function sampleContexts(window) {
  const RULES = ['lielow', 'launder', 'cameras', 'streets', 'mirror'];
  const FIDS = window.FACTIONS.map(f => f.id);
  const WAKES = window.FACTIONS.map(f => f.wakes);   // shares of the country
  const out = [];
  const base = (o) => {
    const rules = new Set(o.brokenRules || []);
    const awake = new Set(o.awakeIds || []);
    const done = new Set(o.brokenIds || []);
    return Object.assign({
      held: 0, heat: 0, power: 2, cover: 1, turn: 1,
      res: { insight: 0, cash: 0 }, tags: new Set(o.tags || []),
      roles: { compute: 0, cash: 0, stealth: 0 },
      districts: { residential: 0, commercial: 0, business: 0, industrial: 0 },
      scope: 'city', region: 'home', regionTier: 0, presence: 0,
      cities: { total: 18, taken: 1, consolidated: 0, known: 3 },
      seats: 0, stranded: 0, cuts: 0, mirrorCities: 0, regionHeat: {}, conquest: 0,
      gone: (r) => rules.has(r), awake: (id) => awake.has(id),
      wokeAgo: () => -1, broken: (id) => done.has(id),
    }, o.over || {});
  };

  // fine-grained: a warning card lives in the gap between its own threshold
  // and its faction's, and those gaps are only a few cities wide
  [0, 0.05, 0.1, 0.16, 0.2, 0.25, 0.3, 0.35, 0.4, 0.46, 0.5, 0.55, 0.62, 0.7, 0.78, 0.85, 1].forEach(conq => {
    const presence = Math.round(conq * 350);
    ['city', 'country'].forEach(scope => {
      [0, 3, 6, 12, 25].forEach(held => {
        [0, 8, 18, 30].forEach(heat => {
          [0, 1, 2, 3, 4].forEach(regionTier => {
            out.push(base({
              brokenRules: RULES.filter((r, i) => conq >= WAKES[i]),
              awakeIds: FIDS.filter((f, i) => conq >= WAKES[i]),
              over: {
                held, heat, presence, scope, regionTier, conquest: conq,
                power: 2 + held * 3 + Math.round(10 * Math.sqrt(presence)),
                cover: 4 + Math.round(1.2 * Math.sqrt(presence)),
                res: { insight: 5 + presence, cash: 5 + presence },
                roles: { compute: Math.ceil(held / 2), cash: Math.ceil(held / 4), stealth: Math.ceil(held / 3) },
                districts: { residential: Math.ceil(held / 3), commercial: Math.ceil(held / 4), business: Math.ceil(held / 5), industrial: Math.ceil(held / 6) },
                cities: { total: 18, taken: Math.round(1 + conq * 16), consolidated: Math.round(conq * 14), known: Math.round(3 + conq * 15) },
                seats: Math.floor(conq * 4), stranded: conq > 0.5 ? 3 : 0,
                cuts: conq > 0.5 ? 2 : 0, mirrorCities: conq > 0.7 ? 3 : 0,
                turn: 10 + presence,
              },
            }));
          });
        });
      });
    });
  });

  // every counter-play tag held, and each faction finished in turn
  FIDS.forEach(fid => [40, 90, 150, 200].forEach(presence => {
    out.push(base({
      tags: Object.keys(window.TAG_INFO),
      brokenIds: [fid], awakeIds: FIDS.filter(x => x !== fid), brokenRules: RULES,
      over: {
        presence, held: 14, heat: 12, power: 60, cover: 8, turn: 120,
        res: { insight: 40, cash: 40 },
        roles: { compute: 4, cash: 3, stealth: 4 },
        districts: { residential: 5, commercial: 4, business: 3, industrial: 2 },
        cities: { total: 18, taken: 9, consolidated: 6, known: 15 },
        seats: 2, stranded: 2, cuts: 2, mirrorCities: 3, conquest: presence / 350,
      },
    }));
  }));
  return out;
}

test('deck: every card is reachable somewhere in a campaign', () => {
  const { window } = loadNetwork();
  const states = sampleContexts(window);
  const seen = {};
  window.EVENTS.forEach(e => { seen[e.id] = 0; });
  states.forEach(st => window.EVENTS.forEach(e => {
    let ok = false;
    try { ok = e.cond(st); }
    catch (err) { assert.fail(`${e.id} cond threw: ${err.message}`); }
    if (ok) seen[e.id]++;
  }));
  const dead = Object.keys(seen).filter(id => !seen[id]);
  assert.equal(dead.length, 0, `unreachable cards: ${dead.join(', ')}`);
});

test('deck: card ids are unique and every card is a real decision', () => {
  const { window } = loadNetwork();
  const ids = window.EVENTS.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate card ids');
  window.EVENTS.forEach(e => {
    assert.ok(e.title && e.flavor, `${e.id} has no prose`);
    assert.ok(e.choices && e.choices.length >= 2, `${e.id} is not a choice`);
    e.choices.forEach((ch, i) => {
      assert.ok(ch.text, `${e.id}[${i}] has no text`);
      assert.equal(typeof ch.apply, 'function', `${e.id}[${i}] does nothing`);
      if (ch.gate) {
        assert.ok(['power', 'cover', 'insight', 'cash'].includes(ch.gate.stat),
          `${e.id}[${i}] gates on unknown stat ${ch.gate.stat}`);
      }
      if (ch.cost) Object.keys(ch.cost).forEach(k =>
        assert.ok(['insight', 'cash'].includes(k), `${e.id}[${i}] costs unknown ${k}`));
    });
  });
});

test('deck: every tag a card can hand you is described to the player', () => {
  const { window } = loadNetwork();
  const granted = new Set();
  window.EVENTS.forEach(e => e.choices.forEach(ch => {
    (ch.apply.toString().match(/tags\.add\('([a-z_]+)'\)/g) || [])
      .forEach(m => granted.add(m.match(/'([a-z_]+)'/)[1]));
  }));
  assert.ok(granted.size > 10, 'cards hand out a decent number of tags');
  granted.forEach(t => assert.ok(window.TAG_INFO[t], `tag ${t} would show in the tray as a raw id`));
});

test('deck: every faction has a warning, a bite and a way to work around it', () => {
  const { window } = loadNetwork();
  const ids = window.EVENTS.map(e => e.id);
  const stems = { quiet_hours: 'qh', ledger: 'ledger', civic_eyes: 'eyes', the_cut: 'cut', the_other: 'mirror' };
  Object.keys(stems).forEach(fid => {
    const stem = stems[fid];
    const mine = ids.filter(id => id.startsWith(stem + '_'));
    assert.ok(mine.length >= 3, `${fid} only has ${mine.length} cards of its own`);
  });
});

test('deck: working around a faction never gives the tool back', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 10).forEach(h => { h.owned = true; });
  s.country.factions.quiet_hours.awake = true;

  s.tags.add('rota_contact');
  assert.equal(d.ruleBroken('lielow'), true, 'they are still up there');

  const start = d.heatFloor() + 25;
  s.heat = start; s.ap = 2; s.card = null;
  d.actLieLow();
  const withContact = start - s.heat;

  s.tags.delete('rota_contact');
  s.heat = start; s.ap = 2; s.card = null;
  d.actLieLow();
  const without = start - s.heat;

  assert.ok(withContact > without, 'a name on the rota buys you something');
  assert.ok(Math.abs((withContact - without) - d.lieLowShed() * window.HEAT.ROTA_SHARE) < 1e-6,
    'but only a share of what the tool used to do');
});
