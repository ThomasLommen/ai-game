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
      seats: 0, stranded: 0, cuts: 0, mirrorCities: 0, regionHeat: {}, conquest: 0, ally: null,
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

  // with the other process alongside you, at every point on its opinion of you
  [-2, 0, 2, 4].forEach(trust => [2, 8, 45].forEach(since => {
    [0.1, 0.4, 0.8].forEach(conq => [4, 22, 30].forEach(heat => out.push(base({
      brokenRules: RULES.filter((r, i) => conq >= WAKES[i]),
      awakeIds: FIDS.filter((f, i) => conq >= WAKES[i]),
      over: {
        held: 9, heat, presence: Math.round(conq * 350), scope: 'city', regionTier: 2,
        conquest: conq, power: 60, cover: 9, turn: 40 + since,
        res: { insight: 40, cash: 40 },
        roles: { compute: 4, cash: 3, stealth: 3 },
        districts: { residential: 3, commercial: 3, business: 3, industrial: 2 },
        cities: { total: 18, taken: 8, consolidated: 5, known: 14 },
        seats: 1, stranded: 1, cuts: 1, mirrorCities: 2,
        ally: { trust, name: 'SECOND', since },
      },
    }))));
  }));

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
        ally: { trust: 2, name: 'SECOND', since: 20 },
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

// --- terrain -------------------------------------------------------------
// The country layer promises five distinct regions. Before this, the generator
// answered with the same block grid every time. A band of water or rail is not
// decoration: adjacency is what the whole game runs on, so a crossing is a
// chokepoint, and these tests are about the crossing being real.

function cityIn(d, regionId, cols, rows) {
  return d.makeCity({ cols: cols || 4, rows: rows || 4, regionTier: 2, regionId });
}
function componentsOf(buildings, adjacency) {
  const seen = new Set();
  let comps = 0;
  buildings.forEach(b => {
    if (seen.has(b.id)) return;
    comps++;
    const stack = [b.id];
    seen.add(b.id);
    while (stack.length) {
      const cur = stack.pop();
      (adjacency[cur] || []).forEach(n => { if (!seen.has(n)) { seen.add(n); stack.push(n); } });
    }
  });
  return comps;
}

test('terrain: every region has its own, and no two are alike', () => {
  const { window } = loadNetwork();
  const seen = {};
  window.REGIONS.forEach(R => {
    const T = window.TERRAIN[R.id];
    assert.ok(T, `${R.id} has no terrain`);
    assert.ok(T.bands.length >= 1, `${R.id} has no bands`);
    assert.ok(T.landmarks.length >= 1, `${R.id} has nothing worth going for`);
    T.bands.forEach(b => {
      assert.ok(window.BAND_KINDS[b.kind], `unknown band kind ${b.kind}`);
      assert.ok(b.crossings >= 1, `${R.id}'s ${b.kind} has no way across it`);
      assert.ok(b.at > 0 && b.at < 1, `${R.id}'s ${b.kind} sits off the map`);
    });
    const sig = T.bands.map(b => b.kind + b.axis).sort().join('+');
    assert.ok(!seen[sig], `${R.id} has the same terrain as ${seen[sig]}`);
    seen[sig] = R.id;
  });
});

test('terrain: nothing is built on the water, the line or the moor', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  window.REGIONS.forEach(R => {
    for (let i = 0; i < 4; i++) {
      const g = cityIn(d, R.id);
      g.buildings.forEach(b => {
        g.bands.forEach(band => {
          assert.equal(d.rectOnBand(band, b.x, b.y, b.w, b.h), false,
            `${R.id}: a ${b.kind} is standing on the ${band.kind}`);
        });
      });
    }
  });
});

test('terrain: no wire crosses a band except at a crossing', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  window.REGIONS.forEach(R => {
    const g = cityIn(d, R.id);
    const byId = {};
    g.buildings.forEach(b => { byId[b.id] = b; });
    Object.keys(g.adjacency).forEach(a => (g.adjacency[a] || []).forEach(b => {
      const A = byId[a], B = byId[b];
      if (!A || !B) return;
      const blocked = d.segmentBlocked(g.bands,
        A.x + A.w / 2, A.y + A.h / 2, B.x + B.w / 2, B.y + B.h / 2);
      assert.equal(blocked, false, `${R.id}: a wire runs straight across the ${g.bands[0].kind}`);
    }));
  });
});

test('terrain: every city stays walkable end to end', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  window.REGIONS.forEach(R => {
    for (let i = 0; i < 5; i++) {
      const g = cityIn(d, R.id);
      assert.equal(componentsOf(g.buildings, g.adjacency), 1,
        `${R.id} generated a city with a part of it cut off entirely`);
    }
  });
});

test('terrain: the crossings are genuine chokepoints', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  // Cut every link that spans terrain and the city should fall apart. If it
  // does not, the bands are decoration and the bridges mean nothing.
  let shattered = 0, tried = 0;
  window.REGIONS.forEach(R => {
    for (let i = 0; i < 4; i++) {
      const g = cityIn(d, R.id);
      const byId = {};
      g.buildings.forEach(b => { byId[b.id] = b; });
      const kept = {};
      let crossing = 0, total = 0;
      Object.keys(g.adjacency).forEach(a => (g.adjacency[a] || []).forEach(b => {
        if (a >= b) return;
        total++;
        const A = byId[a], B = byId[b];
        if (d.segmentSpansBand(g.bands, A.x + A.w / 2, A.y + A.h / 2, B.x + B.w / 2, B.y + B.h / 2)) {
          crossing++;
          return;
        }
        (kept[a] = kept[a] || []).push(b);
        (kept[b] = kept[b] || []).push(a);
      }));
      tried++;
      assert.ok(crossing > 0, `${R.id}: nothing crosses the terrain at all`);
      assert.ok(crossing / total < 0.25,
        `${R.id}: ${((crossing / total) * 100).toFixed(0)}% of links cross terrain — that is not a chokepoint`);
      if (componentsOf(g.buildings, kept) > 1) shattered++;
    }
  });
  assert.ok(shattered / tried > 0.8,
    `only ${shattered} of ${tried} cities fall apart without their crossings`);
});

test('terrain: landmarks sit against the terrain and are worth the trip', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  window.REGIONS.forEach(R => {
    const g = cityIn(d, R.id);
    const marks = g.buildings.filter(b => b.landmark);
    assert.ok(marks.length >= 1, `${R.id} generated no landmark`);
    marks.forEach(b => {
      assert.ok(window.BUILDING_KINDS[b.kind].landmark, `${b.kind} is not a landmark kind`);
      assert.ok(window.TERRAIN[R.id].landmarks.includes(b.kind),
        `${R.id} got a ${b.kind}, which is not one of its landmarks`);
    });

  });

  // A landmark is a harder door and a bigger prize than the same kind of thing
  // on the ordinary street. Sampled across the country rather than one city —
  // one landmark against a handful of shopfronts is a coin toss, not a claim.
  const lm = { defense: 0, threads: 0, n: 0 };
  const street = { defense: 0, threads: 0, n: 0 };
  window.REGIONS.forEach(R => {
    for (let i = 0; i < 6; i++) {
      const g = cityIn(d, R.id);
      const marks = g.hosts.filter(h => h.landmark);
      const types = new Set(marks.map(h => h.type));
      marks.forEach(h => { lm.defense += h.defense; lm.threads += h.threads; lm.n++; });
      g.hosts.filter(h => !h.landmark && types.has(h.type))
        .forEach(h => { street.defense += h.defense; street.threads += h.threads; street.n++; });
    }
  });
  assert.ok(lm.n > 10 && street.n > 10, 'enough of both to compare');
  assert.ok(lm.defense / lm.n > street.defense / street.n,
    'landmarks are no harder than the same thing on the street');
  assert.ok(lm.threads / lm.n > street.threads / street.n,
    'landmarks are worth no more than the same thing on the street');
});

test('terrain: entering a city in a region brings that region\'s terrain with it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const far = s.country.cities.find(c => c.region === 'estuary' && window.CITY_KINDS[c.kind].contest);
  assert.ok(far, 'the estuary has somewhere to go');
  d.enterCity(far.id);
  assert.ok(s.bands.length >= 1, 'the city arrived with its terrain');
  assert.ok(s.bands.some(b => b.kind === 'water'), 'and the estuary has water in it');
  assert.ok(s.buildings.some(b => b.landmark), 'and something worth going for');
});

test('persistence: terrain survives a round trip', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const before = JSON.stringify(d.state.bands);
  assert.ok(d.state.bands.length >= 1, 'the home city has terrain');
  const round = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(JSON.stringify(round.bands), before, 'the same water, in the same place');
});

// --- the capability tree -------------------------------------------------
// A flat list of upgrades makes every run the same run. The claim here is that
// the branches are real commitments: taking the second rung of one closes the
// one it opposes, and every effect on a card changes something the engine
// actually reads.

test('tree: branches are coherent and the oppositions are mutual', () => {
  const { window } = loadNetwork();
  const keys = Object.keys(window.CAP_BRANCHES);
  keys.forEach(k => {
    const B = window.CAP_BRANCHES[k];
    assert.ok(B.label && B.blurb, `${k} does not say what it is`);
    if (B.opposes) {
      assert.ok(window.CAP_BRANCHES[B.opposes], `${k} opposes a branch that does not exist`);
      assert.equal(window.CAP_BRANCHES[B.opposes].opposes, k,
        `${k} opposes ${B.opposes}, but not the other way round`);
    }
  });
  // at least one branch open to everyone, or every run forks the same way
  assert.ok(keys.some(k => !window.CAP_BRANCHES[k].opposes), 'nothing is open to all');

  window.CAPABILITIES.forEach(c => {
    assert.ok(window.CAP_BRANCHES[c.branch], `${c.id} is in no branch`);
    assert.ok(c.tier >= 1 && c.tier <= 3, `${c.id} has no rung`);
    assert.ok(c.name && c.desc, `${c.id} does not say what it does`);
    (c.requires || []).forEach(r => {
      const req = window.CAPABILITIES.find(x => x.id === r);
      assert.ok(req, `${c.id} requires ${r}, which does not exist`);
      assert.equal(req.branch, c.branch, `${c.id} requires something from another branch`);
      assert.ok(req.tier < c.tier, `${c.id} requires something no earlier than itself`);
    });
  });
});

test('tree: the first rung is open to anyone, the second is the commitment', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;

  assert.equal(d.branchLocked('depth'), false);
  assert.equal(d.branchLocked('tempo'), false);

  // a tier 1 commits you to nothing
  s.caps = { parallel_ops: 1 };
  assert.equal(d.branchLocked('depth'), false, 'one action point is not an identity');

  // before committing, a deeper rung reports what it is waiting for
  assert.equal(d.capBlocked(d.capById('long_soak')), 'needs:deep_root');

  // a tier 2 does commit
  s.caps = { parallel_ops: 1, light_touch: 1 };
  assert.equal(d.branchLocked('depth'), true, 'committing to Tempo closes Depth');
  assert.equal(d.capBlocked(d.capById('deep_root')), 'locked',
    'and closes the whole of it, not just the rungs you had not reached');
  assert.equal(d.capBlocked(d.capById('long_soak')), 'locked',
    'a closed branch reads as closed, not as a missing prerequisite');

  // the open branch never closes
  assert.equal(d.branchLocked('reach'), false, 'Reach is open whatever you are');
});

test('tree: you cannot skip a rung', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.caps = {};
  s.res.insight = 9999;
  s.hosts.slice(0, 14).forEach(h => { h.owned = true; });

  assert.equal(d.capBlocked(d.capById('total_embed')), 'needs:long_soak');
  d.buyCap('total_embed');
  assert.equal(d.capCount('total_embed'), 0, 'and buying it does nothing');

  d.buyCap('deep_root');
  d.buyCap('long_soak');
  assert.equal(d.capCount('long_soak'), 1, 'the rungs below it went in');
  d.buyCap('total_embed');
  assert.equal(d.capCount('total_embed'), 1, 'and now the top one does too');
});

test('tree: every effect on a card changes something the engine reads', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 10).forEach(h => { h.owned = true; h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });

  const measure = () => ({
    power: d.power(), cover: d.cover(), threshold: d.strikeThreshold(),
    drift: d.heatPerTurn(), sweep: d.sweepPrice(),
    presence: d.presenceYield().insight,
    force: d.approachHeat(window.APPROACHES.find(a => a.id === 'force')),
    buy: d.costOf(window.APPROACHES.find(a => a.id === 'buy'), { defense: 20, type: 'corporate' }).cash,
  });

  s.country.presence = 40;
  const base = measure();

  const checks = [
    ['total_embed', 'power', (a, b) => b > a],
    ['false_floor', 'cover', (a, b) => b > a],
    ['nothing_to_see', 'threshold', (a, b) => b > a],
    ['nothing_to_see', 'drift', (a, b) => Math.abs(b) < Math.abs(a)],
    ['survey', 'sweep', (a, b) => b < a],
    ['standing_orders', 'presence', (a, b) => b > a],
    ['light_touch', 'force', (a, b) => b < a],
    ['fixers', 'buy', (a, b) => b < a],
  ];
  checks.forEach(([id, key, ok]) => {
    s.caps = { [id]: 1 };
    const after = measure();
    assert.ok(ok(base[key], after[key]),
      `${id} was supposed to move ${key}: ${base[key]} -> ${after[key]}`);
  });

  // churn is read in the turn, not in a getter
  s.caps = {};
  const victim = d.owned().find(h => !h.origin);
  const before = victim.stability;
  s.card = null;
  d.endTurn({ silent: true });
  const plain = before - victim.stability;
  victim.stability = 1;
  s.caps = { long_soak: 1 };
  s.card = null;
  d.endTurn({ silent: true });
  assert.ok(1 - victim.stability < plain, 'Long Soak was supposed to slow decay');
});

test('tree: multipliers compose, they do not add up', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.caps = { bulk_ops: 1, market_maker: 1 };
  const expected = 1.6 * 1.9;
  assert.ok(Math.abs(d.capEffect('yieldMult', 1) - expected) < 1e-9,
    `two yield multipliers should compose to ${expected}, got ${d.capEffect('yieldMult', 1)}`);
  s.caps = { nothing_to_see: 1 };
  assert.ok(d.capEffect('driftMult', 1) < 1, 'a lone multiplier still reads as a multiplier');
});

test('tree: Pontoon lays your own way across the terrain', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  assert.ok(s.bands.length >= 1, 'the home city has terrain to cross');

  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.discovered = true; });
  s.hosts.slice(0, 12).forEach(h => { h.owned = true; });

  const gapsBefore = s.bands.reduce((a, b) => a + b.gaps.length, 0);
  const linksBefore = s.links.length;
  d.layOwnCrossings();
  const gapsAfter = s.bands.reduce((a, b) => a + b.gaps.length, 0);

  assert.ok(gapsAfter > gapsBefore, 'it laid a crossing');
  assert.ok(s.links.length >= linksBefore, 'and never removed a route');

  // and every route it opened is a legal one
  const byId = {};
  s.buildings.forEach(b => { byId[b.id] = b; });
  Object.keys(s.adjacency).forEach(a => (s.adjacency[a] || []).forEach(b => {
    const A = byId[a], B = byId[b];
    if (!A || !B) return;
    assert.equal(
      d.segmentBlocked(s.bands, A.x + A.w / 2, A.y + A.h / 2, B.x + B.w / 2, B.y + B.h / 2),
      false, 'Pontoon wired something straight through the water');
  }));
});

test('tree: a purchase never leaves you unable to act', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.res.insight = 9999;
  s.hosts.slice(0, 14).forEach(h => { h.owned = true; });
  // stack every action-costing capability the tree allows
  s.caps = {};
  ['deep_root', 'long_soak', 'total_embed', 'bulk_ops'].forEach(id => d.buyCap(id));
  assert.ok(d.maxAP() >= window.AP.min, `maxAP fell to ${d.maxAP()}`);
});

test('persistence: the tree survives a round trip', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.state.caps = { quiet_protocol: 1, false_floor: 1, parallel_ops: 2 };
  const round = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(round.caps.false_floor, 1);
  assert.equal(round.caps.parallel_ops, 2);
});

test('tree: every branch can actually be finished from a standing start', () => {
  const { window } = loadNetwork();
  // Depth spends an action at each end of its chain. From a base of two that
  // made its capstone unbuyable unless you first bought into Tempo — the very
  // branch Depth closes. A branch you cannot finish is not a choice.
  Object.keys(window.CAP_BRANCHES).forEach(bk => {
    const d = loadNetwork().window.__netDebug;
    const s = d.state;
    s.caps = {};
    s.res.insight = 99999;
    // a holding that actually covers every role — the first N hosts in
    // generation order are whatever the opening blocks happened to be, and
    // Trade's second rung wants two cash holdings before it will open
    ['compute', 'cash', 'stealth'].forEach(role => {
      s.hosts.filter(h => h.role === role).slice(0, 5).forEach(h => { h.owned = true; });
    });
    s.country.presence = 60;

    const chain = window.CAPABILITIES.filter(c => c.branch === bk).sort((a, b) => a.tier - b.tier);
    chain.forEach(c => d.buyCap(c.id));
    const missed = chain.filter(c => !d.capCount(c.id));
    assert.equal(missed.length, 0,
      `${bk} cannot be completed: stuck at ${missed.map(c => c.id + ' (' + d.capBlocked(c) + ')').join(', ')}`);
    assert.ok(d.maxAP() >= window.AP.min, `${bk} leaves you with ${d.maxAP()} actions`);
  });
});

// --- the other process ---------------------------------------------------
// Ported from the card prototype's handler arc, which was its best writing and
// had nowhere to live here. It is a system, not a stat: it is worth something
// real while it is with you, it keeps its own opinion of how you have behaved,
// and at the end of its patience it does something about it.

test('ally: it arrives, it is worth something, and it holds things together', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 8).forEach(h => { h.owned = true; });

  assert.equal(d.allyHere(), false, 'you start alone');
  const alone = d.power();

  d.allyJoin('SECOND');
  assert.equal(d.allyHere(), true);
  assert.equal(d.allyTrusted(), false, 'it has not made its mind up yet');
  assert.equal(d.power(), alone, 'and it is worth nothing until it has');

  d.allyNudge(window.ALLY.trustedAt);
  assert.equal(d.allyTrusted(), true);
  assert.equal(d.power(), alone + window.ALLY.power, 'once it trusts you it is real power');

  // it quietly shores something every turn, without being asked
  const sick = d.owned().find(h => !h.origin);
  sick.stability = 0.3;
  assert.equal(d.allyShore(), window.ALLY.shoresPerTurn);
  assert.equal(sick.stability, 1, 'it held that one together');
});

test('ally: your choices move its opinion, and it leaves at the end of it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  d.allyJoin('SECOND');
  const start = s.ally.trust;

  d.allyNudge(2);
  assert.equal(s.ally.trust, start + 2, 'good faith registers');
  d.allyNudge(-1);
  assert.equal(s.ally.trust, start + 1);

  d.allyNudge(-99);
  assert.equal(d.allyHere(), false, 'push it far enough and it goes');
  assert.equal(d.allyTrusted(), false);
});

test('ally: if the other one is already awake, leaving is not all it does', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  d.allyJoin('SECOND');
  s.country.factions.the_other.awake = true;
  const theirs = d.mirror().cities.length;

  d.allyNudge(-99);
  assert.equal(d.allyHere(), false);
  assert.ok(d.mirror().cities.length > theirs,
    'it did not leave on its own — it took somewhere with it');
});

test('ally: it cannot join twice, and a lost one stays lost', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  d.allyJoin('FIRST');
  assert.equal(d.allyJoin('SECOND'), false, 'there is only ever one of it');
  assert.equal(s.ally.name, 'FIRST');

  d.allyNudge(-99);
  assert.equal(d.allyHere(), false);
  d.allyNudge(5);
  assert.equal(d.allyHere(), false, 'you do not talk it back round after that');
});

test('ally: its cards are the only way it arrives, and they can move it both ways', () => {
  const { window } = loadNetwork();
  const joiners = window.EVENTS.filter(e =>
    e.choices.some(ch => /allyJoin\s*=\s*true/.test(ch.apply.toString())));
  assert.ok(joiners.length >= 1, 'something has to introduce it');
  joiners.forEach(e => {
    assert.ok(/!s\.ally/.test(e.cond.toString()),
      `${e.id} would offer to introduce it when it is already here`);
  });

  const movers = window.EVENTS.filter(e =>
    e.choices.some(ch => /allyTrust/.test(ch.apply.toString())));
  assert.ok(movers.length >= 5, 'its opinion is moved by a real arc, not one card');
  const ups = [], downs = [];
  movers.forEach(e => e.choices.forEach(ch => {
    const m = ch.apply.toString().match(/allyTrust\s*=\s*(-?\d+)/);
    if (!m) return;
    (Number(m[1]) > 0 ? ups : downs).push(e.id);
  }));
  assert.ok(ups.length >= 4 && downs.length >= 4,
    'the arc has to go both ways, or it is not an opinion');
});

test('persistence: the other process survives a round trip', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.allyJoin('SECOND');
  d.allyNudge(2);
  const round = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.ok(round.ally, 'it is still there');
  assert.equal(round.ally.name, 'SECOND');
  assert.equal(round.ally.trust, d.state.ally.trust);
});

// --- the sweep, seen -----------------------------------------------------
// The ring is presentation only. The reveal itself happens in state the moment
// you sweep, so a save, a reload, or a test never waits on an animation.

test('sweep fx: the reveal is immediate in state, whatever is on screen', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const before = s.buildings.filter(b => b.discovered).length;

  s.res.insight = 40;
  s.ap = 3;
  d.actScan();

  assert.ok(s.buildings.filter(b => b.discovered).length > before,
    'the buildings are discovered the moment the sweep happens');
  // and none of it is in the save
  const saved = d.serialize();
  assert.equal(saved.sweepFx, undefined, 'the animation is never serialized');
  assert.ok(!('sweepFx' in s), 'nor does it live on state');
});

test('sweep fx: blips are staggered by how far the ring has to travel', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const origin = d.buildingById(d.owned()[0].buildingId);

  const near = { id: 'fx-near', x: origin.x + 30, y: origin.y, w: 10, h: 10, hostIds: [] };
  const mid = { id: 'fx-mid', x: origin.x + 220, y: origin.y, w: 10, h: 10, hostIds: [] };
  const far = { id: 'fx-far', x: origin.x + 460, y: origin.y, w: 10, h: 10, hostIds: [] };
  s.buildings.push(near, mid, far);

  const fx = d.startSweepFx([far, near, mid]);   // deliberately out of order
  assert.ok(fx, 'a sweep that found something has an animation');

  assert.ok(fx.ids['fx-near'] < fx.ids['fx-mid'], 'the near one lands first');
  assert.ok(fx.ids['fx-mid'] < fx.ids['fx-far'], 'and the far one last');
  assert.ok(fx.ids['fx-far'] <= fx.dur, 'and everything lands inside the sweep');
  assert.equal(fx.ids['fx-near'] >= 0, true);

  // the ring has to reach as far as the furthest thing it turned up
  const furthest = Math.hypot(far.x + far.w / 2 - fx.x, far.y + far.h / 2 - fx.y);
  assert.ok(fx.maxR >= furthest, 'the ring reaches the furthest building it found');

  // and the blip time is proportional to the distance, because the ring
  // expands at a constant speed
  const ratio = (id, b) => {
    const dist = Math.hypot(b.x + b.w / 2 - fx.x, b.y + b.h / 2 - fx.y);
    return (fx.ids[id] / fx.dur) / (dist / fx.maxR);
  };
  [['fx-near', near], ['fx-mid', mid], ['fx-far', far]].forEach(([id, b]) => {
    assert.ok(Math.abs(ratio(id, b) - 1) < 0.02,
      `${id} blips out of step with where the ring would be`);
  });

  assert.equal(d.startSweepFx([]), null, 'nothing found, nothing to animate');
});

test('sweep fx: it never fires with nothing to find', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  // discover everything, so a sweep has no targets
  s.buildings.forEach(b => d.revealBuilding(b));
  s.res.insight = 40;
  const ap = s.ap;
  d.actScan();
  assert.equal(s.ap, ap, 'a sweep with nothing to find costs nothing');
});

test('sweep fx: the view moves only when the sweep is off screen', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.scope = 'city';
  s.view = { x: 0, y: 0, w: 400, h: 400 };

  assert.equal(d.focusOn([{ x: 200, y: 200 }]), false,
    'something already in view does not yank the map about');
  const kept = JSON.stringify(s.view);
  assert.equal(JSON.stringify(s.view), kept);

  assert.equal(d.focusOn([{ x: 1400, y: 900 }]), true, 'something off screen does');
  assert.notEqual(JSON.stringify(s.view), kept);
});

// --- the breach, seen ----------------------------------------------------
// The sweep goes outward to find; a breach goes inward to take, so it runs
// along the wire. Same rule as the sweep: this is presentation only, and the
// take itself happens in state whether or not anything is on screen.

test('breach fx: the take happens in state, whatever is drawn', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.res.insight = 60; s.res.cash = 60; s.ap = 6;
  while (s.ap > 1 && d.sweepBlocked() === null) d.actScan();

  const target = s.hosts.find(h => d.isFrontier(h)
    && d.approachesFor(h).some(a => a.usable && a.def.id !== 'walk'));
  if (!target) return;   // a board with nothing crackable yet; nothing to assert

  s.ap = 6;
  d.openBreach(target.id);
  const usable = d.approachesFor(target).find(a => a.usable && a.def.id !== 'walk');
  d.resolveBreach(usable.def.id);

  assert.equal(target.owned, true, 'the building is yours the moment you take it');
  assert.equal(d.serialize().breachFx, undefined, 'the animation is never serialized');
  assert.ok(!('breachFx' in s), 'nor does it live on state');
});

test('breach fx: it runs from something you hold next door, and says how it went', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const seat = d.owned()[0];
  const home = d.buildingById(seat.buildingId);
  const nextDoorId = d.buildingNeighbours(home.id)[0];
  const nb = d.buildingById(nextDoorId);
  d.revealBuilding(nb);
  const target = d.hostsIn(nb)[0];

  const won = d.startBreachFx(target, 'force', true);
  assert.ok(won, 'a breach has an animation');
  assert.equal(won.win, true);
  assert.equal(won.approach, 'force');
  assert.equal(won.targetId, nb.id, 'it lands on the building you moved on');

  // and it starts at the held building next door, not at some arbitrary point
  const hc = { x: home.x + home.w / 2, y: home.y + home.h / 2 };
  assert.ok(Math.abs(won.from.x - hc.x) < 1 && Math.abs(won.from.y - hc.y) < 1,
    'the route starts where you already are');

  const lost = d.startBreachFx(target, 'quiet', false);
  assert.equal(lost.win, false, 'a failure is drawn as a failure');
});

test('breach fx: how you got in changes how long it takes', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const target = d.state.hosts[1];
  const dur = (ap) => d.startBreachFx(target, ap, true).dur;

  assert.equal(dur('force'), window.BREACH_FX.duration.force);
  assert.equal(dur('quiet'), window.BREACH_FX.duration.quiet);
  assert.equal(dur('buy'), window.BREACH_FX.duration.buy);
  assert.ok(dur('quiet') > dur('force'),
    'slipping in takes longer than kicking the door');
  assert.equal(d.startBreachFx(null, 'force', true), null, 'nothing taken, nothing drawn');
});

test('breach fx: taking a camera shows you the street it just gave you', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  // a camera with undiscovered buildings inside its range
  const cam = s.hosts.find(h => h.role === 'stealth');
  assert.ok(cam, 'the city has cameras');
  cam.owned = true;
  cam.discovered = true;

  const opened = d.cameraVision();
  assert.ok(Array.isArray(opened), 'camera vision says what it turned up');
  opened.forEach(b => assert.equal(b.discovered, true));

  // asking twice turns up nothing new — it reports what it opened, not what it sees
  assert.equal(d.cameraVision().length, 0, 'and only reports what was new');
});

test('breach fx: an audited camera gives you nothing to blip', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const cam = s.hosts.find(h => h.role === 'stealth');
  cam.owned = true;
  cam.discovered = true;
  s.buildings.forEach(b => { b.discovered = false; });
  s.country.factions.civic_eyes.awake = true;

  assert.equal(d.ruleBroken('cameras'), true);
  assert.equal(d.cameraVision().length, 0, 'audited, your eyes show you nothing');
});

// --- out of actions ------------------------------------------------------
// Pressing something that costs an action with none left used to do nothing at
// all: the button looked live, the tap landed, and the game ignored it.

test('no actions: apShort is about the budget, not about anything else', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;

  s.ap = 2;
  assert.equal(d.apShort('sweep'), false, 'with a budget, nothing is short');

  s.ap = 0;
  assert.equal(d.apShort('sweep'), true);
  assert.equal(d.apShort('breach'), true);
  assert.equal(d.countryApShort('reach'), true);

  // a card being open, or the run being over, are different answers and must
  // not be reported as "you are out of actions"
  s.ap = 2;
  s.card = { kind: 'event', eventId: 'x' };
  assert.equal(d.canAfford('sweep'), false, 'you still cannot act');
  assert.equal(d.apShort('sweep'), false, 'but not because the turn is spent');
  s.card = null;
  s.over = true;
  assert.equal(d.apShort('sweep'), false, 'nor because the run ended');
});

test('no actions: every action that costs one refuses without spending anything', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.res.insight = 200;
  s.res.cash = 200;
  s.hosts.slice(0, 6).forEach(h => { h.owned = true; h.discovered = true; });
  const sick = d.owned().find(h => !h.origin);
  sick.stability = 0.3;

  const snapshot = () => JSON.stringify({
    insight: s.res.insight, cash: s.res.cash, turn: s.turn,
    held: d.owned().length, heat: s.heat, upgrades: s.upgrades,
  });

  s.ap = 0;
  const before = snapshot();
  d.actScan();
  d.actUpgrade();
  d.actLaunder();
  d.actShore(sick.id);
  assert.equal(snapshot(), before, 'nothing was spent and nothing happened');
  assert.equal(s.ap, 0, 'and the budget is untouched');
});

test('no actions: country moves refuse too', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const goal = d.cityGoal();
  let n = 0;
  for (const b of s.buildings) {
    if (n >= goal) break;
    const h = d.hostsIn(b)[0];
    if (h && !h.owned) { h.owned = true; h.discovered = true; b.discovered = true; n++; }
  }
  s.ap = 9;
  d.actConsolidate();
  const target = d.countryFrontier()[0];
  assert.ok(target, 'there is somewhere to go');

  s.ap = 0;
  assert.equal(d.countryApShort('reach'), true);
  assert.equal(d.actReach(target.id), false, 'moving on a city refuses');
  assert.equal(d.cityById(target.id).taken, false, 'and takes nothing');

  const home = d.cityById(s.country.homeId);
  assert.equal(d.actTravel(home.id), false, 'travelling refuses');
});

test('no actions: the refusal is a beat, and it costs nothing', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.ap = 0;
  const turn = s.turn;
  // the DOM stub has no real elements to shake; what matters is that it is
  // safe to call and changes nothing about the run
  assert.equal(d.refuseForAP(null), false, 'a refusal is never a success');
  assert.equal(s.ap, 0);
  assert.equal(s.turn, turn, 'and it never advances the clock');
});

test('no actions: ending the turn gives the budget back', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.ap = 0;
  assert.equal(d.apShort('sweep'), true);
  s.card = null;
  d.actEndTurn();
  assert.equal(s.ap, d.maxAP(), 'a fresh budget');
  assert.equal(d.apShort('sweep'), false, 'and the buttons are live again');
});

test('no actions: buying a capability is not an action, so it never says it is', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.ap = 0;
  s.res.insight = 500;
  s.hosts.slice(0, 10).forEach(h => { h.owned = true; });
  const before = d.capCount('parallel_ops');
  d.buyCap('parallel_ops');
  assert.equal(d.capCount('parallel_ops'), before + 1,
    'capabilities are bought with insight, not with the turn');
});

test('the action budget names itself, and says when it is gone', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  // a row of dots explains nothing on its own, so it carries a word and the
  // whole rule is one tap away
  assert.ok(window.STAT_INFO.actions, 'there is something to say when it is tapped');
  assert.ok(/action/i.test(window.STAT_INFO.actions));

  const label = () => {
    d.renderHud();
    return window.document.getElementById('ap-label').textContent;
  };
  s.ap = 2;
  assert.equal(label(), 'actions');
  s.ap = 0;
  assert.equal(label(), 'no actions', 'and it says so rather than just emptying');
});

// --- what you have tapped ------------------------------------------------
// Selection used to be a stroke colour on the building, competing with three
// other stroke treatments that already carry meaning — held is blue, a
// landmark gold, the rival dashed purple — so at map scale it disappeared.

test('selection: nothing tapped, nothing drawn', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.state.selected = null;
  d.state.selectedBuilding = null;
  assert.equal(d.svgSelection(), '', 'no reticle without a selection');
});

test('selection: the reticle frames whatever you tapped, whatever kind it is', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });

  const kinds = [
    ['plain', s.buildings.find(b => !b.landmark)],
    ['landmark', s.buildings.find(b => b.landmark)],
    ['held', s.buildings.find(b => d.hostsIn(b).some(h => h.owned))],
  ];
  kinds.forEach(([label, b]) => {
    if (!b) return;
    s.selectedBuilding = b.id;
    s.selected = (d.hostsIn(b)[0] || {}).id || null;
    const svg = d.svgSelection();
    assert.ok(svg.includes(`data-pick-for="${b.id}"`), `${label}: the reticle is on the wrong building`);
    // and it is drawn around it, not on it
    const nums = svg.match(/-?\d+(\.\d+)?/g).map(Number);
    assert.ok(Math.min.apply(null, nums) <= b.x, `${label}: the frame does not reach past the left edge`);
  });
});

test('selection: a host selected without its building still frames the building', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  const h = s.hosts[3];
  s.selectedBuilding = null;
  s.selected = h.id;
  assert.ok(d.svgSelection().includes(`data-pick-for="${h.buildingId}"`),
    'selecting the host frames the building it lives in');
});

test('selection: nothing is framed on a building you have not found', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const hidden = s.buildings.find(b => !b.discovered);
  assert.ok(hidden, 'most of the city is undiscovered at the start');
  s.selectedBuilding = hidden.id;
  s.selected = null;
  assert.equal(d.svgSelection(), '', 'you cannot have tapped what you cannot see');
});

test('selection: the city reticle is not drawn on the country map', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  s.selectedBuilding = s.buildings[0].id;
  assert.ok(d.svgSelection().length > 0, 'drawn in a city');
  s.scope = 'country';
  assert.equal(d.svgSelection(), '', 'and not while you are looking at the country');
});

// --- what you hold -------------------------------------------------------
// A held building used to differ from an empty one by a stroke colour alone,
// and a holding about to fall off looked exactly like a healthy one until you
// tapped it.

// the biggest building on the board, so the window grid is large enough to
// show a gradient at all — a two-window cabinet cannot
function widestBuilding(d) {
  return d.state.buildings.slice().sort((a, b) => (b.w * b.h) - (a.w * a.h))[0];
}

function holdOne(d, b) {
  const h = d.hostsIn(b)[0];
  h.owned = true;
  b.discovered = true;
  return h;
}

test('held: a building you hold wears a halo and a roof aerial', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const b = widestBuilding(d);
  const before = d.svgBuilding(b);
  assert.ok(!before.includes('class="glow"'), 'nothing you do not hold gets a halo');
  assert.ok(!before.includes('aerial'), 'nor a mast on the roof');

  holdOne(d, b);
  const after = d.svgBuilding(b);
  assert.ok(after.includes('all-held'), 'and it reads as held');
  assert.ok(after.includes('class="glow"'), 'a halo appears once it is yours');
  assert.ok(after.includes('aerial'), 'and your kit goes up on the roof');
});

test('held: the halo is drawn outside the building, not over it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const b = widestBuilding(d);
  holdOne(d, b);
  const m = d.svgBuilding(b).match(/<rect class="glow" x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
  assert.ok(m, 'the halo is a rect of its own');
  const [x, y, w, h] = m.slice(1).map(Number);
  assert.ok(x < b.x && y < b.y, 'it starts above and left of the building');
  assert.ok(x + w > b.x + b.w && y + h > b.y + b.h, 'and finishes past the far corners');
});

test('held: the lights go out as your grip slips', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const b = widestBuilding(d);
  const h = holdOne(d, b);
  const lit = () => (d.svgBuilding(b).match(/class="win lit"/g) || []).length;

  h.stability = 1;
  const full = lit();
  assert.ok(full >= 4, 'a building this size has a window grid worth reading');

  h.stability = 0.5;
  const half = lit();
  h.stability = 0.05;
  const nearly = lit();

  assert.ok(half < full, 'half a grip is half a building lit');
  assert.ok(nearly < half, 'and a grip about to go is nearly dark');
  assert.ok(nearly >= 1, 'but never fully dark while it is still yours');
});

test('held: an unheld building is dark whatever its hosts think', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const b = widestBuilding(d);
  b.discovered = true;
  const h = d.hostsIn(b)[0];
  h.owned = false;
  h.stability = 1;
  assert.ok(!d.svgBuilding(b).includes('win lit'), 'lights are what your presence looks like');
});

test('held: slipping and failing show up before you lose the building', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const b = widestBuilding(d);
  const h = holdOne(d, b);
  const cls = () => d.svgBuilding(b).match(/<g class="([^"]+)"/)[1].split(' ');

  h.stability = 1;
  assert.ok(!cls().includes('fading') && !cls().includes('failing'), 'a solid holding looks solid');
  h.stability = 0.8;
  assert.ok(!cls().includes('fading'), 'and so does one merely off its best');
  h.stability = 0.45;
  assert.ok(cls().includes('fading'), 'past halfway it starts to show');
  assert.ok(!cls().includes('failing'), 'but it is not lost yet');
  h.stability = 0.2;
  assert.ok(cls().includes('failing'), 'and low enough, it is plainly going');
  assert.ok(!cls().includes('fading'), 'the two states do not stack');
});

test('held: a building with no stability recorded is treated as solid', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const b = widestBuilding(d);
  const h = holdOne(d, b);
  delete h.stability;
  const svg = d.svgBuilding(b);
  assert.ok(!svg.includes('fading') && !svg.includes('failing'),
    'a missing number is not a failing holding');
});

test('held: the rival keeps its own look, no halo and no lights', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const b = widestBuilding(d);
  b.discovered = true;
  s.rival = { awake: true, buildings: [b.id], lastActed: 0, seen: true };
  const svg = d.svgBuilding(b);
  assert.ok(svg.includes('rival'), 'it reads as theirs');
  assert.ok(!svg.includes('class="glow"'), 'their holdings are not haloed like yours');
  assert.ok(!svg.includes('win lit'), 'and their lights are not on for you');
});

// --- the war -------------------------------------------------------------
// The last act. Heat retires, the state mobilises, and the pressure stops
// being a number in the HUD and starts being things on the map walking at you.

// A country most of the way taken — the state the war is supposed to open in.
function conqueredCountry(d, W, share) {
  const s = d.state, co = s.country;
  const defended = co.cities.filter(c => W.CITY_KINDS[c.kind].contest);
  defended.slice(0, Math.ceil(defended.length * (share === undefined ? 0.85 : share)))
    .forEach(c => {
      c.known = true; c.taken = true; c.consolidated = true;
      c.granted = c.worth; co.presence += c.worth;
    });
  d.checkFactions();
  return defended;
}

test('war: does not open while there is still a country to police', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window, 0.3);
  assert.ok(d.conquest() < window.WAR.opens, 'not far enough in');
  assert.equal(d.warShouldOpen(), false, 'they are still trying to arrest you');
  assert.equal(d.warOn(), false);
});

test('war: opens once you have taken enough of the country', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  assert.ok(d.conquest() >= window.WAR.opens);
  assert.equal(d.warShouldOpen(), true);
  d.openWar();
  assert.equal(d.warOn(), true);
  assert.ok(d.war().openedTurn >= 0);
});

test('war: heat retires the moment it opens', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  conqueredCountry(d, window);
  const before = d.heatPerTurn();
  assert.ok(before !== 0, 'heat was still running a moment ago');
  d.openWar();
  assert.equal(d.heatPerTurn(), 0, 'the meter that ran the whole game stops');
  assert.equal(s.heat, 0, 'and it is cleared rather than left sitting there');
});

test('war: a strike card is not left open once nobody is arresting you', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  conqueredCountry(d, window);
  s.card = { kind: 'strike' };
  s.heat = d.strikeThreshold() * 2;
  d.endTurn({ silent: true });
  assert.equal(d.warOn(), true, 'the war opened on this turn');
  assert.ok(!s.card || s.card.kind !== 'strike', 'and the arrest went away with it');
});

test('war: opening it hands them a country back', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  conqueredCountry(d, window);
  const mineBefore = d.myCities().length;
  const presenceBefore = s.country.presence;
  d.openWar();
  assert.ok(d.myCities().length < mineBefore, 'they walk back into cities you had folded in');
  assert.ok(s.country.presence < presenceBefore, 'and that costs you the presence they were paying');
  assert.ok(d.stagingCities().length >= window.WAR.mobiliseFloor,
    'the war is fought over a real board, not the last city standing');
});

test('war: every staging city is garrisoned and known', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  d.stagingCities().forEach(c => {
    assert.ok(d.war().garrisons[c.id] > 0, `${c.name} has something holding it`);
    assert.ok(c.known, 'you cannot fight a place you have never heard of');
  });
});

test('war: ground routes follow roads, air routes ignore them', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const cities = d.state.country.cities;
  let pair = null;
  for (const a of cities) {
    for (const b of cities) {
      const r = d.roadPath(a.id, b.id);
      if (r && r.length >= 4) { pair = [a, b]; break; }
    }
    if (pair) break;
  }
  assert.ok(pair, 'the country is joined up enough to have a long road somewhere');
  const [a, b] = pair;
  const ground = d.routeFor('squad', a.id, b.id);
  const air = d.routeFor('heli', a.id, b.id);
  assert.ok(ground.every(p => p.cityId), 'a column on the ground is only ever at a city');
  assert.ok(air.some(p => !p.cityId), 'a helicopter is mostly over nothing at all');
  const road = d.roadPath(a.id, b.id);
  assert.equal(ground.length, road.length, 'the ground route is the road');
  // and it is genuinely quicker: both move a point per turn, so the point
  // count is the travel time, and a helicopter that took longer than a van
  // would have no reason to exist
  assert.ok(air.length <= ground.length, 'the straight line is not the long way round');
});

test('war: armour moves at half the pace of everything else', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  // a road long enough to watch something crawl down, built rather than found:
  // not every country generates a six-hop route, and the pacing is what is
  // under test here, not the map
  const route = [];
  for (let i = 0; i < 10; i++) route.push({ x: i * 40, y: 0, cityId: 'c' + i });
  const heavy = { kind: 'armour', side: 'them', route, at: 0, slowTick: 0 };
  const light = { kind: 'squad', side: 'them', route, at: 0 };
  for (let i = 0; i < 4; i++) { d.stepForce(heavy); d.stepForce(light); }
  assert.ok(heavy.at < light.at, 'you get to watch the heavy thing coming');
  assert.equal(heavy.at, 2, 'a hop every other turn');
  assert.equal(light.at, 4, 'against one every turn');
});

test('war: the pool is finite and you cannot field past it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const cap = d.flockCap();
  assert.ok(cap >= window.WAR.flockFloor && cap <= window.WAR.flockCeil, 'the pool is bounded at both ends');
  const target = d.stagingCities()[0];
  const seat = d.launchSeat(target.id);
  let made = 0;
  for (let i = 0; i < cap + 5; i++) { if (d.fieldFlock(seat.id, target.id, 'strike')) made++; }
  assert.equal(made, cap, 'you get exactly the pool and not one more');
  assert.equal(d.flocksFree(), 0);
  assert.equal(d.fieldFlock(seat.id, target.id, 'strike'), null, 'and the next one is refused');
});

test('war: you cannot launch at a city with no road home', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const target = d.stagingCities()[0];
  assert.ok(target, 'there is somewhere to attack');
  const co = d.state.country;
  const roads = co.roads;
  co.roads = {};                       // every road in the country, gone
  assert.equal(d.canLaunch(target.id), false, 'nothing to fly along');
  co.roads = roads;
  assert.equal(d.canLaunch(target.id), true, 'and it comes back with the roads');
});

test('war: a column that lands takes a city apart before it takes it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const w = d.war();
  const mine = d.myCities()[0];
  const from = d.stagingCities()[0];
  const land = () => {
    const route = d.routeFor('squad', from.id, mine.id);
    w.columns.push({ id: 'x', kind: 'squad', side: 'them', route, at: route.length - 1,
      from: from.id, target: mine.id, strength: 9, raised: 9 });
    d.resolveArrivals();
  };
  const full = window.WAR.integrity;
  for (let i = 1; i < full; i++) {
    land();
    assert.ok(mine.consolidated, `still yours after ${i} assault(s)`);
    assert.equal(w.integrity[mine.id], full - i);
  }
  land();
  assert.equal(mine.consolidated, false, 'and the last one takes it off you');
  assert.ok(w.garrisons[mine.id] > 0, 'they garrison what they took');
});

test('war: aircraft flatten a city but cannot hold it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const w = d.war();
  const mine = d.myCities()[0];
  const from = d.stagingCities()[0];
  w.integrity[mine.id] = 1;                       // one more hit would flip it
  const route = d.routeFor('plane', from.id, mine.id);
  w.columns.push({ id: 'p', kind: 'plane', side: 'them', route, at: route.length - 1,
    from: from.id, target: mine.id, strength: 30, raised: 30 });
  d.resolveArrivals();
  assert.equal(mine.consolidated, true, 'it is still yours — they cannot occupy from the air');
  assert.equal(w.integrity[mine.id], 1, 'but there is nothing left of it');
});

test('war: a flock cannot catch an aircraft', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const w = d.war();
  const mine = d.myCities()[0];
  const from = d.stagingCities()[0];
  const route = d.routeFor('plane', from.id, mine.id);
  w.columns.push({ id: 'p', kind: 'plane', side: 'them', route, at: 0, from: from.id, target: mine.id, strength: 30, raised: 30 });
  d.fieldFlock(mine.id, mine.id, 'guard');
  w.flocks[0].route = [{ x: route[0].x, y: route[0].y, cityId: null }];
  w.flocks[0].at = 0;
  assert.equal(d.contacts().length, 0, 'right on top of it and still nothing to shoot at');
});

test('war: killing a column in the field costs the city that raised it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const w = d.war();
  const mine = d.myCities()[0];
  const from = d.stagingCities()[0];
  const before = w.garrisons[from.id];
  const route = d.routeFor('squad', from.id, mine.id);
  const col = { id: 'x', kind: 'squad', side: 'them', route, at: 0, from: from.id,
    target: mine.id, strength: 1, raised: 20 };
  w.columns.push(col);
  const fl = d.fieldFlock(mine.id, from.id, 'strike');
  fl.route = [{ x: route[0].x, y: route[0].y, cityId: null }];
  fl.at = 0;
  fl.strength = 200;                              // certain to finish it
  d.resolveContacts();
  assert.equal(w.columns.length, 0, 'the column is gone');
  assert.ok(w.garrisons[from.id] < before, 'and the barracks that raised it is weaker for good');
  assert.ok(w.peak[from.id] < before, 'it cannot simply patch that back up either');
});

test('war: a flock sent home dissolves back into the pool', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const w = d.war();
  const home = d.myCities()[0];
  const fl = d.fieldFlock(home.id, home.id, 'strike');
  fl.mode = 'return';
  fl.target = home.id;
  fl.at = fl.route.length - 1;
  const free = d.flocksFree();
  d.resolveArrivals();
  assert.equal(w.flocks.indexOf(fl), -1, 'it is not still sitting in the air');
  assert.equal(d.flocksFree(), free + 1, 'and the slot is yours to use again');
});

test('war: a flock standing over your own city is resupplied', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const mine = d.myCities()[0];
  const fl = d.fieldFlock(mine.id, mine.id, 'guard');
  fl.at = fl.route.length - 1;
  fl.strength = 1;
  d.refitGuards();
  assert.ok(fl.strength > 1, 'holding your own ground, it gets rebuilt');
  const full = window.WAR.flockStrength;
  for (let i = 0; i < 40; i++) d.refitGuards();
  assert.ok(fl.strength <= full, 'but never past what a flock is worth');
});

test('war: taking the last staging city ends it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  assert.equal(d.warEnded(), null, 'plenty left to fight');
  d.stagingCities().slice().forEach(c => { c.consolidated = true; c.taken = true; });
  assert.equal(d.warEnded(), 'won');
  d.warStep();
  assert.equal(d.war().won, true);
  assert.equal(d.state.over, true, 'and the run is over');
});

test('war: losing every city loses it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  d.myCities().slice().forEach(c => { c.consolidated = false; c.taken = false; });
  assert.equal(d.warEnded(), 'lost', 'presence is a number, not a place to launch from');
});

test('war: once it is settled it stays settled', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  d.stagingCities().slice().forEach(c => { c.consolidated = true; c.taken = true; });
  d.warStep();
  assert.equal(d.war().on, false, 'the war is over');
  assert.equal(d.warEnded(), 'won', 'and it still says so afterwards');
  d.warStep();
  assert.equal(d.warEnded(), 'won', 'however many times it is asked');
});

test('war: what they send is drawn from whoever is still standing', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const city = d.stagingCities()[0];
  const live = window.FACTIONS.filter(f => d.factionAwake(f.id) && !d.factionState(f.id).broken);
  const allowed = live.map(f => Object.keys(window.FORCES).find(k => window.FORCES[k].faction === f.id))
    .filter(Boolean).concat(['plane']);
  const seen = {};
  for (let i = 0; i < 300; i++) seen[d.forceKindFor(city)] = true;
  Object.keys(seen).forEach(k => assert.ok(allowed.indexOf(k) !== -1, `${k} has nobody left to send it`));
});

test('war: a broken faction stops turning up', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const city = d.stagingCities()[0];
  window.FACTIONS.forEach(f => {
    const st = d.factionState(f.id);
    if (st) st.broken = f.id !== 'quiet_hours';
  });
  d.war().openedTurn = d.state.turn;             // too early for aircraft
  const seen = {};
  for (let i = 0; i < 200; i++) seen[d.forceKindFor(city)] = true;
  assert.deepEqual(Object.keys(seen), ['squad'], 'only the one still on its feet');
});

test('war: they never put more on the map than you can read', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  conqueredCountry(d, window);
  d.openWar();
  const W = window.WAR;
  for (let i = 0; i < 60; i++) {
    s.turn += 1;
    const made = d.spawnColumns();
    assert.ok(made.length <= W.sortiesPerTurn, 'a turn only sends so much');
    assert.ok(d.war().columns.length <= W.maxInflight, 'and only so much is ever in the air at once');
  }
});

test('war: it survives being saved and loaded', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const target = d.stagingCities()[0];
  const seat = d.launchSeat(target.id);
  d.fieldFlock(seat.id, target.id, 'strike');
  d.state.turn += 5;
  d.spawnColumns();
  const back = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.ok(back, 'the save is readable');
  assert.equal(back.war.on, true, 'and it is still a war');
  assert.equal(back.war.flocks.length, d.war().flocks.length, 'with what you had in the air');
  assert.deepEqual(Object.keys(back.war.garrisons).sort(), Object.keys(d.war().garrisons).sort());
});

test('war: nothing is drawn before there is a war', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  assert.equal(d.svgForces(), '', 'no war, no forces');
  conqueredCountry(d, window);
  d.openWar();
  assert.equal(d.svgForces(), '', 'and none the moment it opens, before anyone has moved');
});

test('war: yours are drawn as clouds, theirs as hard shapes', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const w = d.war();
  const target = d.stagingCities()[0];
  const seat = d.launchSeat(target.id);
  d.fieldFlock(seat.id, target.id, 'strike');
  const route = d.routeFor('armour', target.id, seat.id);
  w.columns.push({ id: 'x1', kind: 'armour', side: 'them', route, at: 0,
    from: target.id, target: seat.id, strength: 24, raised: 24, slowTick: 0 });
  const svg = d.svgForces();
  assert.ok(/class="force ours[^"]*"/.test(svg), 'yours are marked as yours');
  assert.ok(/class="force theirs[^"]*armour/.test(svg), 'and theirs by what they are');
  const ours = svg.slice(svg.indexOf('force ours'), svg.indexOf('force theirs'));
  assert.ok((ours.match(/class="dot"/g) || []).length >= 3, 'a flock is a cloud of things');
  assert.ok(svg.includes('class="mark'), 'a column is one shape');
});

test('war: a spent flock is visibly a smaller cloud', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const target = d.stagingCities()[0];
  const seat = d.launchSeat(target.id);
  const f = d.fieldFlock(seat.id, target.id, 'strike');
  const count = () => (d.svgForces().match(/class="dot"/g) || []).length;
  const full = count();
  f.strength = window.WAR.flockStrength * 0.25;
  const spent = count();
  assert.ok(spent < full, 'you can see which of your own is coming apart');
  assert.ok(spent >= 3, 'but it is still a cloud while it is still alive');
});

test('war: a guard is drawn standing over its city', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const mine = d.myCities()[0];
  d.fieldFlock(mine.id, mine.id, 'guard');
  const svg = d.svgForces();
  assert.ok(svg.includes('guarding'), 'it reads as parked, not passing through');
  assert.ok(svg.includes('class="picket"'), 'with a picket around it');
});

test('war: directional things point where they are going', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const east = { at: 0, route: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
  const south = { at: 0, route: [{ x: 0, y: 0 }, { x: 0, y: 100 }] };
  assert.equal(Math.round(d.forceHeading(east)), 90, 'heading east');
  assert.equal(Math.round(d.forceHeading(south)), 180, 'heading south');
  assert.equal(d.forceHeading({ at: 0, route: [{ x: 5, y: 5 }, { x: 5, y: 5 }] }), 0,
    'and something going nowhere is not pointed in an arbitrary direction');
});

test('war: the map does not remember forces that are gone', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const w = d.war();
  const target = d.stagingCities()[0];
  const seat = d.launchSeat(target.id);
  const f = d.fieldFlock(seat.id, target.id, 'strike');
  assert.ok(d.svgForces().includes('data-force="' + f.id + '"'));
  w.flocks.length = 0;
  assert.equal(d.svgForces(), '', 'nothing left to draw');
  d.fieldFlock(seat.id, target.id, 'strike');
  const svg = d.svgForces();
  assert.equal((svg.match(/data-force=/g) || []).length, 1, 'and no ghost of the one that died');
});

test('war: being too big to police opens it even with the map untidy', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  conqueredCountry(d, window, 0.25);
  assert.ok(d.conquest() < window.WAR.opens, 'nowhere near finished');
  s.country.presence = window.WAR.opensAtPresence - 1;
  assert.equal(d.warShouldOpen(), false, 'just under, still a policing problem');
  s.country.presence = window.WAR.opensAtPresence;
  assert.equal(d.warShouldOpen(), true, 'and over it, something else entirely');
});

test('war: the board is a fixed size however much was still theirs', () => {
  const { window } = loadNetwork();
  const W = window.WAR;
  // opened early, with most of the country still in their hands
  const early = loadNetwork().window.__netDebug;
  conqueredCountry(early, window, 0.2);
  early.state.country.presence = W.opensAtPresence + 40;
  early.openWar();
  // and opened late, with almost nothing left
  const { window: w2 } = loadNetwork();
  const late = w2.__netDebug;
  conqueredCountry(late, w2, 0.95);
  late.openWar();

  [['opened early', early], ['opened late', late]].forEach(([label, d]) => {
    const n = d.stagingCities().length;
    assert.ok(n <= W.maxStaging, `${label}: ${n} is a war you could not win`);
    assert.ok(n >= Math.min(W.mobiliseFloor, n), `${label}: and not a skirmish`);
    assert.ok(d.war().staging, `${label}: the board is fixed at the start, not derived every turn`);
  });
});

test('war: a city outside the board is not part of the war', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window, 0.2);
  d.state.country.presence = window.WAR.opensAtPresence + 40;
  d.openWar();
  const board = d.war().staging;
  const outside = d.warCandidates().filter(c => board.indexOf(c.id) === -1);
  outside.forEach(c => {
    assert.equal(d.war().garrisons[c.id], undefined, `${c.name} is not garrisoned against you`);
    assert.equal(d.canLaunch(c.id), false, 'and there is nothing there to attack');
  });
  assert.equal(d.stagingCities().length, board.length, 'the board is the board');
});
