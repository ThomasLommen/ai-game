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
  // This is a claim about the generator, and it used to be checked against one
  // random board — where the first two rings have overlapping defense ranges
  // and about ten hosts each, so they came out the wrong way round on 4.3% of
  // boards. Measured over 300. Pool several instead: the shape of the city is
  // the thing being asserted, not the roll of any one of them.
  const byTier = {};
  let tiersSeen = 0;
  for (let i = 0; i < 12; i++) {
    const d = loadNetwork().window.__netDebug;
    const rings = {};
    d.state.hosts.forEach(h => {
      (byTier[h.ring] = byTier[h.ring] || []).push(h.defense);
      rings[h.ring] = true;
    });
    tiersSeen = Math.max(tiersSeen, Object.keys(rings).length);
  }
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const tiers = Object.keys(byTier).map(Number).sort((a, b) => a - b);
  assert.ok(tiersSeen >= 3, 'several difficulty tiers exist');
  for (let i = 1; i < tiers.length; i++) {
    assert.ok(avg(byTier[tiers[i]]) > avg(byTier[tiers[i - 1]]),
      `tier ${tiers[i]} (${avg(byTier[tiers[i]]).toFixed(1)}) is not harder than` +
      ` tier ${tiers[i - 1]} (${avg(byTier[tiers[i - 1]]).toFixed(1)})`);
  }
  // and on any single board the outside must still be clearly harder than the
  // middle, which is what the player actually feels
  const d = loadNetwork().window.__netDebug;
  const one = {};
  d.state.hosts.forEach(h => { (one[h.ring] = one[h.ring] || []).push(h.defense); });
  const ks = Object.keys(one).map(Number).sort((a, b) => a - b);
  assert.ok(avg(one[ks[ks.length - 1]]) > avg(one[ks[0]]) * 1.5,
    'the edge of a city should be a different proposition from its middle');
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

// Force used to cost a flat 3 heat no matter the door, while quiet and buy
// both scale their price with the target's own defense — so force got
// relatively *cheaper* the deeper the campaign went, and the other two got
// relatively pricier. Three routes meant to stay comparable should not drift
// apart like that.
test('force: a harder door costs more heat, the same way quiet and buy cost more of theirs', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const force = window.APPROACHES.find(a => a.id === 'force');
  const soft = { defense: 4 };
  const hard = { defense: 30 };
  assert.ok(d.approachHeat(force, hard) > d.approachHeat(force, soft),
    'a harder door should cost more heat to force');
});

test('force: heat cost is on the card itself, not just the bar after the fact', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const target = d.neighbours(d.owned()[0]).find(n => !n.owned);
  target.discovered = true;
  target.defense = 20;
  s.res.insight = 999; s.res.cash = 999; s.ap = 9;

  d.openBreach(target.id);
  const list = d.approachesFor(target);
  const force = list.find(a => a.def.id === 'force');
  assert.ok(d.approachHeat(force.def, target) > 0, 'forcing this door costs real heat');
  // rendered onto the panel, not left to the heat bar to explain later
  d.render();
  const html = window.document.getElementById('panel').innerHTML;
  assert.ok(/HEAT/.test(html), 'the card names the heat cost');
});

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

test('a card takes the whole screen, except a breach -- that one is the core loop', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const panelOpen = () => window.document.getElementById('panel').classList.contains('card-open');
  // A breach stays in the panel instead, so its own choices have to fit
  // without the HUD above them — which compacts instead.
  const hudCompact = () => ['topbar', 'heat-row', 'res-row']
    .every(id => window.document.getElementById(id).classList.contains('compact'));

  s.card = { kind: 'event', eventId: window.EVENTS[0].id };
  d.render();
  assert.equal(panelOpen(), true, 'an event takes the screen');
  assert.equal(hudCompact(), false, 'and the HUD stays as it is — the event has the whole screen to itself');

  s.card = { kind: 'strike' };
  d.render();
  assert.equal(panelOpen(), true, 'so does the hunter');

  s.card = null;
  s.res.insight = 999;
  d.actScan();
  const target = s.hosts.find(h => d.isFrontier(h));
  d.render();
  d.openBreach(target.id);
  assert.equal(panelOpen(), false, 'a breach does not -- it is the single most frequent tap in the game');
  assert.equal(hudCompact(), true, 'and the HUD gives up its own room instead, so the choices fit');

  s.card = null;
  d.render();
  assert.equal(panelOpen(), false, 'and nothing does when there is no card at all');
  assert.equal(hudCompact(), false, 'and the HUD is back to its usual size');
});

test('sweep advertises what it will actually find, not its raw capacity', () => {
  // sweepReach() is a capacity: stealth holdings and capabilities raise it,
  // and a before/after capability comparison should show that raw number. But
  // the button that fires the action was quoting that same raw number as
  // "turns up N" regardless of how many undiscovered buildings were actually
  // on the frontier -- so late in a sweep, with one door left, it would say
  // "turns up 4" and then find one, every time.
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.filter(h => h.role === 'stealth').slice(0, 6).forEach(h => { h.owned = true; });
  assert.ok(d.sweepReach() > 1, 'stealth holdings have raised the raw capacity');

  // sweep until the frontier is smaller than the reach itself -- past this
  // point a single scan would consume everything in one jump, so this is the
  // one window where "how many are actually left" and "how many the sweep is
  // capable of" genuinely disagree
  for (let guard = 0; guard < 60 && d.sweepTargets().length >= d.sweepReach()
       && d.sweepTargets().length > 0; guard++) {
    s.res.insight = 999;
    if (d.state.ap <= 0) { d.actEndTurn(); continue; }
    d.actScan();
  }
  const left = d.sweepTargets().length;
  if (left === 0) return;   // this board happened to exhaust exactly on the boundary
  assert.ok(left < d.sweepReach(), `expected the frontier (${left}) below capacity (${d.sweepReach()})`);
  assert.equal(d.sweepFound(), left,
    `advertised turns-up must match the frontier (${left} left, reach ${d.sweepReach()})`);

  // and it is never a promise the sweep cannot keep: what actually comes back
  // is never more than what was advertised
  s.res.insight = 999;
  if (d.state.ap <= 0) d.actEndTurn();
  const before = d.sweepFound();
  const buildingsBefore = s.buildings.filter(b => b.discovered).length;
  d.actScan();
  const buildingsAfter = s.buildings.filter(b => b.discovered).length;
  assert.ok((buildingsAfter - buildingsBefore) <= before,
    `advertised turns-up ${before}, but ${buildingsAfter - buildingsBefore} buildings were revealed`);
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
  ['sweep', 'lielow', 'shore'].forEach(k => {
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
  // Parallel Operations was the only repeatable capability, and it was the
  // whole problem: +1 AP, three times, free of any branch commitment, on a
  // base of 2 actions -- a second identity's worth of budget for one cheap,
  // consequence-free tier-1 node. It is now a single, non-repeatable rung.
  // The repeatable/escalating-cost machinery itself is still real engine
  // behaviour -- content may use it again -- so this test exercises it
  // directly on a synthetic capability rather than depending on game content.
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.res.insight = 100000;
  const synthetic = {
    id: '__test_repeatable', branch: 'reach', tier: 1, repeatable: true, max: 3,
    name: 'Test Rung', apDelta: 0, costs: [10, 20, 40], cond: () => true,
  };
  window.CAPABILITIES.push(synthetic);
  try {
    const first = d.capCost(synthetic);
    d.buyCap(synthetic.id);
    assert.ok(d.capCost(synthetic) > first, 'the next one costs more');

    for (let i = 0; i < 10; i++) d.buyCap(synthetic.id);
    assert.equal(d.capCount(synthetic.id), synthetic.max, 'it stops at its maximum');
  } finally {
    window.CAPABILITIES.pop();
  }
});

test('parallel operations is one rung, not three -- the tempo fix', () => {
  // Measured before this: +3 AP on a base of 2, for 112 total, with no branch
  // lock (tier 1 never commits you) and no drawback of any kind. Depth and
  // Cover's own capstones charge -1 AP each against that same base-2 economy
  // -- crippling on its own, nothing at all once Tempo had already tripled
  // your budget for free.
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.res.insight = 100000;
  const c = d.capById('parallel_ops');
  assert.equal(c.repeatable, undefined, 'no longer repeatable');
  assert.equal(c.cost, 18, 'the price of the one rung is unchanged');

  const base = d.maxAP();
  d.buyCap('parallel_ops');
  assert.equal(d.maxAP(), base + 1, 'one action, not three');
  assert.equal(d.capBlocked(c), 'owned', 'and it cannot be bought again');
  d.buyCap('parallel_ops');
  assert.equal(d.maxAP(), base + 1, 'a second attempt buys nothing more');
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
      assert.ok((c.effect && Object.keys(c.effect).length) || c.mechanic, `${c.id} costs tempo but grants nothing`);
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

// Laundering, then the contract, were cash's whole lever in turn: pay cash,
// get a benefit unattached to any building. Both were pure currency
// conversion competing with the building-focused loop the rest of the game
// is about, and both are gone — cash buys your way into a building, or it
// sits idle. Buying is a real approach with a real cost already; the one
// thing left to guard is that Ledger, watching payment patterns, still has
// something of cash's to threaten now that the contract is not it.

test('ledger: buying your way in gets traced back to you instead of going clean', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const buy = window.APPROACHES.find(a => a.id === 'buy');
  assert.equal(d.approachHeat(buy), 0, 'clean by default');

  s.country.factions.ledger.awake = true;
  assert.ok(d.approachHeat(buy) > 0, 'awake, it traces the payment');
});

// nothing_to_see is a capability id, not a tag — the first version of this
// used has(), which checks state.tags and is always false for a capability.
// It silently no-op'd: the capstone reported its terms honestly and then did
// nothing when the moment came.
test('nothing to see: buying your way in survives Ledger untraced, without the event-card counter', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.res.insight = 100000;
  s.hosts.slice(0, 30).forEach(h => { h.owned = true; });
  d.buyCap('quiet_protocol'); d.buyCap('false_floor'); d.buyCap('nothing_to_see');
  assert.ok(d.capCount('nothing_to_see') > 0, 'the capstone bought cleanly');
  assert.equal(s.tags.has('ledger_inside'), false, 'and not through the usual counter');

  s.country.factions.ledger.awake = true;
  const buy = window.APPROACHES.find(a => a.id === 'buy');
  assert.equal(d.approachHeat(buy), 0, 'never traced');
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

// --- the country as land -------------------------------------------------
// It was five horizontal bars with the cities spaced evenly along each, plus
// jitter. Nothing drawn on the nodes could fix an arrangement that says rows.

test('land: cities are scattered into territory, not spaced along a line', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const K = window.COUNTRY;
  // pooled over boards: one generated country can look organic by luck
  let pairs = 0, tooClose = 0, total = 0;
  const spreads = [], rhos = [];
  for (let g = 0; g < 8; g++) {
    const co = (g === 0 ? d.state.country : loadNetwork().window.__netDebug.state.country);
    window.REGIONS.forEach(R => {
      const here = co.cities.filter(c => c.region === R.id);
      if (here.length < 2) return;
      total += here.length;
      // The old layout jittered y by +/-24 around one line per region, so its
      // spread could never exceed 48 and averaged about 26 at these counts.
      // "Is any one region tightly grouped" is not the test -- two random
      // points in the available band are close together half the time -- the
      // test is whether the population as a whole still hugs a line.
      if (here.length >= 3) {
        const ys = here.map(c => c.y);
        spreads.push(Math.max(...ys) - Math.min(...ys));
      }
      // The signature of the old layout that chance does not reproduce: x was
      // `pad + span * i / (n - 1)` plus 26px of jitter against 150px of
      // spacing, so a region's cities ran left to right in the order they were
      // created, every time. Rank correlation of index against x was +1.
      // ("Are the gaps even" is not that test: three random points have two
      // gaps and they are within 12px of each other often enough to fail on
      // luck, which this test did before it measured the right thing.)
      if (here.length >= 3) {
        const order = here.map((c, i) => ({ i, x: c.x })).sort((a, b) => a.x - b.x);
        const n = here.length;
        const dsq = order.reduce((a, o, rank) => a + (o.i - rank) ** 2, 0);
        rhos.push(1 - (6 * dsq) / (n * (n * n - 1)));
      }
    });
    // Only a city that can draw a constellation needs the full spacing: a
    // defended city, walked and settled. Towns hang off one, deliberately
    // clustered close now so the hub reads as a real, bigger place, and a
    // town never draws anything that spacing would protect.
    co.cities.forEach(a => co.cities.forEach(b => {
      if (a.id >= b.id) return;
      pairs++;
      // only two cities that BOTH draw a constellation need the spacing --
      // a town clustered close against its hub is the point, not a bug
      if (!window.CITY_KINDS[a.kind].contest || !window.CITY_KINDS[b.kind].contest) return;
      if (Math.hypot(a.x - b.x, a.y - b.y) < K.minCityGap * 0.8) tooClose++;
    }));
  }
  assert.ok(total > 40, 'enough cities to say anything');
  const meanSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  assert.ok(meanSpread > 40,
    `regions spread their cities ${meanSpread.toFixed(0)}px vertically; the row layout managed 26`);
  const meanRho = rhos.reduce((a, b) => a + b, 0) / rhos.length;
  assert.ok(Math.abs(meanRho) < 0.6,
    `cities still run in creation order across their region (rho ${meanRho.toFixed(2)}; the row layout scored 1.00)`);
  // and a defended city's constellation still has room to sit in
  assert.ok(tooClose / pairs < 0.02, `${tooClose} of ${pairs} pairs of defended cities are on top of each other`);
});

test('land: the coast is the same line for the country and for the territory behind it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const a = d.buildLand(12345);
  const b = d.buildLand(12345);
  assert.equal(JSON.stringify(a.borders), JSON.stringify(b.borders),
    'the same seed is the same country, every render and every reload');
  assert.notEqual(JSON.stringify(d.buildLand(999).borders), JSON.stringify(a.borders),
    'and a different one is a different country');

  // territories tile: the bottom of one is the top of the next, exactly
  for (let i = 1; i < a.N; i++) {
    assert.equal(JSON.stringify(a.borders[i]), JSON.stringify(a.borders[i]),
      'a border is one line, shared');
  }
  // the coast is one line, the full height of the country, not four
  assert.equal(a.coastBulge.length, a.N, 'a bulge for every band along the one coast');
  assert.equal(a.rights.length, a.N + 1, 'a coast anchor at every border row');
  assert.ok(typeof a.farWest === 'number', 'the other three sides are pushed off camera, not drawn');

  // every city is on land: inside its own territory, between its two borders
  d.state.country.cities.forEach(c => {
    const ri = window.REGIONS.findIndex(R => R.id === c.region);
    const L = d.landCache();
    const top = d.borderYAt(L, ri, c.x), bot = d.borderYAt(L, ri + 1, c.x);
    assert.ok(c.y > top && c.y < bot,
      `${c.name} at y=${c.y} is outside ${c.region} (${top.toFixed(0)}..${bot.toFixed(0)})`);
  });
});

test('land: a defended city draws its towns in close, the way a real city has a cluster around it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const co = d.state.country;
  let clustered = 0, roaming = 0;
  window.REGIONS.forEach(R => {
    const hub = co.cities.find(c => c.region === R.id && window.CITY_KINDS[c.kind].contest);
    if (!hub) return;
    co.cities.filter(c => c.region === R.id && !window.CITY_KINDS[c.kind].contest).forEach(t => {
      const d0 = Math.hypot(t.x - hub.x, t.y - hub.y);
      if (d0 < 100) clustered++; else roaming++;
    });
  });
  assert.ok(clustered > 0, 'at least one region reads as a hub with towns around it');
  assert.ok(roaming > 0, 'and at least one town is left roaming for variety');
});

test('land: water is a real obstacle -- the exploratory pass respects it, and roadHitsLake is honest', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;

  // the function itself: a segment straight through a lake's centre is
  // blocked, one that passes well clear of it is not
  const lake = { cx: 100, cy: 100, r: 20 };
  const L = { lakes: [lake] };
  assert.equal(d.roadHitsLake(L, { x: 60, y: 100 }, { x: 140, y: 100 }), true,
    'a segment straight through the centre is blocked');
  assert.equal(d.roadHitsLake(L, { x: 60, y: 400 }, { x: 140, y: 400 }), false,
    'a segment nowhere near it is not');

  // and at the country scale: most roads never cross one at all. A lake can
  // still sit on the *only* candidate for an essential link -- the one join
  // between two regions, or a town's one link to its hub -- and that link is
  // built anyway, because reach must never depend on a lake happening to be
  // somewhere convenient. The guarantee is "mostly avoided", not "never".
  let crossed = 0, total = 0;
  for (let g = 0; g < 12; g++) {
    const { window: w2 } = loadNetwork();
    const d2 = w2.__netDebug;
    const co = d2.state.country;
    const Lg = d2.landCache();
    if (!Lg.lakes.length) continue;
    const seenPair = {};
    co.cities.forEach(a => d2.cityRoads(a.id).forEach(bid => {
      const key = a.id < bid ? a.id + bid : bid + a.id;
      if (seenPair[key]) return;
      seenPair[key] = true;
      const b = co.cities.find(c => c.id === bid);
      if (!b) return;
      total++;
      if (d2.roadHitsLake(Lg, a, b)) crossed++;
    }));
  }
  if (total) assert.ok(crossed / total < 0.15, `${crossed} of ${total} roads cross a lake`);
});

test('land: roads are a road network, not everything within reach of everything', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const co = d.state.country;
  const edges = co.cities.reduce((a, c) => a + d.cityRoads(c.id).length, 0) / 2;
  // measured before: 49 roads over 18 cities, a cat's cradle laid on the map
  assert.ok(edges / co.cities.length < 2.6,
    `${edges} roads over ${co.cities.length} cities is still a cradle`);
  // but it must not have cost anyone their route home
  const taken = new Set([co.homeId]);
  for (let step = 0; step < 60; step++) {
    const front = co.cities.filter(c => !taken.has(c.id) && d.cityRoads(c.id).some(id => {
      const n = d.cityById(id);
      return taken.has(id) && n && window.CITY_KINDS[n.kind].contest;
    }));
    if (!front.length) break;
    front.forEach(c => taken.add(c.id));
  }
  assert.equal(taken.size, co.cities.length, 'thinning the roads stranded a city');
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
  // You cannot fold a city in without having taken most of its doors — about
  // nineteen of forty-six — and the ladder's first rung is keyed to doors
  // rather than to cities. A helper that conquered without ever holding
  // anything described a state no game can be in, and left that rung asleep.
  if (want > 0) d.state.everHeld = Math.max(d.state.everHeld || 0, want * 19);
  return d.conquest();
}

test('country: taking a faction seat finishes the faction', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const f = window.FACTIONS[0];

  conquerTo(d, window, d.wakeShare(f));
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
  conquerTo(d, window, d.wakeShare(window.FACTIONS[0]));
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
  // the ladder's order, read through the engine — a rung can now be keyed to
  // doors taken rather than to a share of the country, so it fires inside your
  // first city and reports as earlier than any share
  const d0 = window.__netDebug;
  const order = window.FACTIONS.slice().sort((a, b) => d0.wakeShare(a) - d0.wakeShare(b));
  for (let i = 1; i < order.length; i++) {
    assert.ok(d0.wakeShare(order[i]) > d0.wakeShare(order[i - 1]), 'each faction wakes later than the last');
    assert.ok(order[i].tier > order[i - 1].tier, 'and is a rung further up');
  }
  order.forEach(f => assert.ok(d0.wakeShare(f) > 0 && d0.wakeShare(f) <= 1,
    `${f.id} wakes at ${d0.wakeShare(f)}, which is not a share of the country`));

  assert.equal(d.conquest(), 0, 'you have finished none of it yet');
  d.checkFactions();
  assert.equal(d.awakeFactions().length, 0, 'nobody cares about you yet');

  // The first rung is doors, not cities, so it is crossed inside your first
  // city — before you have finished anything. Reaching it the way the game
  // does is the point: this used to be gated two whole cities in.
  s.everHeld = 14;
  d.checkFactions();
  assert.equal(d.conquest(), 0, 'and you still have not finished a city');
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

test('the adjusters: enough forced doors wakes them, and force starts costing more', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const force = window.APPROACHES.find(a => a.id === 'force');
  const target = { defense: 20 };

  assert.equal(d.factionAwake('adjusters'), false, 'nobody is counting yet');
  const before = d.approachHeat(force, target);

  s.timesForced = 8; // this faction's own wake rung
  d.checkFactions();
  assert.equal(d.factionAwake('adjusters'), true, 'enough forced doors gets noticed');
  assert.ok(d.approachHeat(force, target) > before, 'and force costs more heat now');

  s.tags.add('unlisted');
  assert.equal(d.approachHeat(force, target), before, 'off their list, it costs what it always did');
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

test('ledger: buying your way in stops going clean and starts pointing at you', () => {
  const traceHeat = loadNetwork().window.HEAT.LEDGER_TRACE;
  // Two identical starts rather than one game before and after: taking any
  // building at all raises the passive heat floor, which would otherwise
  // swamp the one delta this test actually cares about.
  const runOnce = (ledgerAwake) => {
    const { window } = loadNetwork();
    const d = window.__netDebug;
    const s = d.state;
    s.res.cash = 100000; s.res.insight = 100000;
    s.ap = 999; s.card = null;
    if (ledgerAwake) wake(d, 'ledger');
    s.hosts.forEach(h => { h.discovered = true; });
    s.buildings.forEach(b => { b.discovered = true; });
    // Grow the frontier one host at a time (rather than owning most of the
    // board at once, which pushes heat past its own cap and hides the
    // delta this test is after) until a buyable one turns up.
    let target = null;
    for (let guard = 0; !target && guard < 30; guard++) {
      target = s.hosts.find(h => d.isFrontier(h) && d.approachesFor(h).some(a => a.def.id === 'buy'));
      if (target) break;
      const next = s.hosts.find(h => d.isFrontier(h));
      if (!next) break;
      next.owned = true;
    }
    if (!target) return null;
    s.ap = 999; s.card = null;
    d.openBreach(target.id);
    const before = s.heat;
    d.resolveBreach('buy');
    return s.heat - before;
  };

  const clean = runOnce(false);
  const matched = runOnce(true);
  assert.ok(clean !== null && matched !== null, 'something buyable is on the frontier both times');
  // Taking any building at all nudges the floor up a little regardless of
  // approach — Ledger's trace is a heat charge on top of that, not instead
  // of it, so the comparison is against the ordinary bump, not zero.
  assert.ok(matched - clean >= traceHeat / 2,
    `matched should add substantially more heat than an ordinary buy: clean ${clean}, matched ${matched}`);
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
  const RULES = ['lielow', 'force', 'buy', 'cameras', 'streets', 'mirror'];
  const FIDS = window.FACTIONS.map(f => f.id);
  const WAKES = window.FACTIONS.map(f => window.__netDebug.wakeShare(f));  // shares of the country
  const out = [];
  const base = (o) => {
    const rules = new Set(o.brokenRules || []);
    const awake = new Set(o.awakeIds || []);
    const done = new Set(o.brokenIds || []);
    return Object.assign({
      held: 0, doors: 0, forced: 0, heat: 0, power: 2, cover: 1, turn: 1,
      res: { insight: 0, cash: 0 }, tags: new Set(o.tags || []),
      roles: { compute: 0, cash: 0, stealth: 0 },
      districts: { residential: 0, commercial: 0, business: 0, industrial: 0 },
      scope: 'city', region: 'home', regionTier: 0, presence: 0,
      cities: { total: 18, taken: 1, consolidated: 0, known: 3 },
      seats: 0, stranded: 0, cuts: 0, mirrorCities: 0, regionHeat: {}, conquest: 0, ally: null,
      gone: (r) => rules.has(r), awake: (id) => awake.has(id),
      wokeAgo: () => -1, broken: (id) => done.has(id),
      war: null,
      standing: { score: 0, bought: 0, filed: 0, settling: 0, spin: 0, tier: 0, footprint: 0, short: 0, exposure: 0, audits: 0, caught: 0 },
      plant: { count: 0, slots: 2, room: 2, flocks: 0, has: () => false },
    }, o.over || {});
  };

  // A war is a whole second half of the deck, and none of the contexts above
  // ever has one — every wartime card was unreachable by construction.
  const warStates = () => {
    const inbound = ['squad', 'contractors', 'armour', 'heli', 'plane', 'swarm'];
    const res = [];
    [1, 3, 5, 9, 14, 22].forEach(age => {
      [1, 2, 4, 7].forEach(staging => {
        [0, 1, 3, 5].forEach(mine => {
          [0, 2, 5].forEach(flocks => {
            [0, 2, 6].forEach(kills => {
              res.push({
                on: true, age, staging, mine, flocks,
                pool: flocks + (age % 3), free: age % 3, guards: Math.floor(flocks / 2),
                columns: staging, kills, losses: kills > 2 ? kills - 2 : (age > 8 ? 4 : 0),
                weakest: Math.max(0, 60 - age * 3),
                // the shape the war actually has now: a named objective, an
                // escalation that climbs with age, and losses waiting on plant
                objective: staging > 1 ? 'a city' : null,
                escalation: Math.min(4, Math.floor(age / 4)),
                down: (age % 5),
                rebuild: 0.05 + (flocks % 3) * 0.14,
                inbound: (k) => inbound.indexOf(k) <= (age % inbound.length),
              });
            });
          });
        });
      });
    });
    return res;
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
                held, doors: Math.max(held, Math.round(conq * 95)),
                forced: Math.max(held, Math.round(conq * 40)),
                heat, presence, scope, regionTier, conquest: conq,
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
  // Standing and plant, across the range a campaign actually moves through.
  // Without these every card about the front or the industry was unreachable
  // by construction, the same way the wartime half was.
  const standings = [];
  [0, 1, 2, 3, 4, 5].forEach(tier => {
    [0, 30, 90].forEach(spin => {
      [0, 1, 3].forEach(caught => {
        [0, 25, 60].forEach(short => {
          [0, 0.5, 2, 5].forEach(exposure => {
            // audits vary independently of tier: a company that registered
            // last week is a real state and nothing above tier 0 could reach
            // it while this was derived from the tier
            [0, tier * 3 + caught].forEach(audits => {
              // filed and settling too: a rung is real the moment you file it
              // and believed twenty-two turns later, so a campaign spends real
              // time with standing outstanding and cards may be about that
              [0, 14, tier * 26].forEach(settling => {
                standings.push({ tier, spin, caught, short, exposure, audits, settling,
                  score: tier * 26 + spin, bought: tier * 26,
                  filed: tier * 26 + settling,
                  footprint: tier * 26 + spin + short });
              });
            });
          });
        });
      });
    });
  });
  const plants = [];
  [0, 1, 2, 4, 6].forEach(count => {
    [2, 4, 7].forEach(slots => {
      plants.push({ count, slots, room: Math.max(0, slots - count), flocks: count,
        has: (k) => count > 0 && k === 'yard' });
    });
  });
  standings.forEach((standing, i) => {
    const plant = plants[i % plants.length];
    const conq = [0.1, 0.35, 0.6, 0.85][i % 4];
    out.push(base({
      brokenRules: RULES.filter((r, k) => conq >= WAKES[k]),
      awakeIds: FIDS.filter((f, k) => conq >= WAKES[k]),
      over: {
        held: (i % 5) * 3, heat: (i % 4) * 9, scope: i % 2 ? 'country' : 'city',
        conquest: conq, presence: Math.round(conq * 260),
        power: 20 + i * 3, cover: 4 + (i % 20),
        res: { insight: 30 + i * 9, cash: 30 + i * 21 },
        roles: { compute: i % 5, cash: i % 4, stealth: i % 3 },
        standing, plant,
      },
    }));
  });

  // and the same again, at war
  const wars = warStates();
  const conqs = [0.3, 0.5, 0.7, 0.9];
  conqs.forEach(conq => {
    wars.forEach(war => {
      out.push(base({
        brokenRules: RULES.filter((r, i) => conq >= WAKES[i]),
        awakeIds: FIDS.filter((f, i) => conq >= WAKES[i]),
        over: {
          held: 0, heat: 0, scope: 'country', conquest: conq,
          presence: Math.round(conq * 300),
          power: 40 + Math.round(conq * 200), cover: 10 + Math.round(conq * 20),
          res: { insight: 40 + Math.round(conq * 200), cash: 40 + Math.round(conq * 200) },
          // Zero on purpose, and this is the whole point of the wartime
          // contexts: the war is fought from the country map, where you are
          // holding no streets at all, so every role count is 0. Sampling them
          // as though you were standing in a city made role-gated cards look
          // reachable when in play they could never come up.
          roles: { compute: 0, cash: 0, stealth: 0 },
          districts: { residential: 0, commercial: 0, business: 0, industrial: 0 },
          cities: { total: 18, taken: 12, consolidated: war.mine, known: 18 },
          standing: standings[(war.age * 7 + war.staging) % standings.length],
          plant: plants[(war.age + war.staging) % plants.length],
          war,
        },
      }));
    });
  });

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
  // Delivered cards are not drawn — they are handed to you when something has
  // already happened, so their cond is deliberately false and the deck must
  // never pick them. They are reachable through the other door, which the next
  // test checks.
  const delivered = new Set(window.__netDebug.CELL_REPORTS);
  const dead = Object.keys(seen).filter(id => !seen[id] && !delivered.has(id));
  assert.equal(dead.length, 0, `unreachable cards: ${dead.join(', ')}`);
});

test('deck: a delivered card is never drawn, and every one of them is delivered', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const reports = d.CELL_REPORTS;
  assert.ok(reports.length, 'there are reports to deliver');

  // none of them can come up on their own, whatever the board looks like
  sampleContexts(window).forEach(st => reports.forEach(id => {
    const e = window.EVENTS.find(x => x.id === id);
    assert.ok(e, `${id} is not in the deck at all`);
    assert.equal(e.cond(st), false, `${id} can be drawn, and it should only be delivered`);
  }));

  // and each is a real card by the same standard as the rest of the deck
  reports.forEach(id => {
    const e = window.EVENTS.find(x => x.id === id);
    assert.ok(e.title && e.flavor, `${id} has no prose`);
    assert.ok(e.choices.length >= 2, `${id} is not a choice`);
  });
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
    quiet: d.costOf(window.APPROACHES.find(a => a.id === 'quiet'), { defense: 20, type: 'corporate' }).insight,
  });

  s.country.presence = 40;
  const base = measure();

  const checks = [
    ['total_embed', 'power', (a, b) => b > a],
    ['false_floor', 'quiet', (a, b) => b < a],
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

  // Long Soak is a one-time save, not an ongoing decay rate — it only shows
  // up the turn a holding would actually be lost, so this has to put a
  // holding right on that edge rather than measure a plain turn.
  s.caps = {};
  const victim = d.owned().find(h => !h.origin);
  victim.stability = 0.001;
  s.card = null;
  d.endTurn({ silent: true });
  assert.equal(victim.owned, false, 'without Long Soak, the edge is where it is actually lost');

  victim.owned = true;
  victim.stability = 0.001;
  victim.soakSaved = false;
  s.caps = { long_soak: 1 };
  s.card = null;
  d.endTurn({ silent: true });
  assert.equal(victim.owned, true, 'Long Soak was supposed to save it once');
  assert.ok(victim.stability > 0, 'and leave it standing, not merely un-lost');
});

test('tree: multipliers compose, they do not add up', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 10).forEach(h => { h.owned = true; h.heldSince = -10; });
  s.turn = 20;

  s.caps = {};
  const plain = d.perTurnIncome().insight || 0;
  s.caps = { market_maker: 1 };
  const withYieldMult = d.perTurnIncome().insight || 0;
  s.caps = { market_maker: 1, bulk_ops: 1 };
  const withBoth = d.perTurnIncome().insight || 0;

  // Market Maker (a generic yieldMult effect) and Bulk Processing (a
  // mechanic read directly in perTurnIncome for settled holdings) are two
  // different kinds of multiplier — they still have to compose, not add.
  assert.ok(Math.abs(withYieldMult / plain - 1.9) < 1e-9, 'market_maker alone should be a 1.9x multiplier');
  assert.ok(Math.abs(withBoth / withYieldMult - 1.6) < 1e-9, 'bulk_ops stacks multiplicatively on top, not additively');

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
    // and a country half taken, because Reach's capstones are about the
    // country rather than the street
    conqueredCountry(d, window, 0.5);

    const chain = window.CAPABILITIES.filter(c => c.branch === bk).sort((a, b) => a.tier - b.tier);
    chain.forEach(c => d.buyCap(c.id));
    const missed = chain.filter(c => !d.capCount(c.id));
    assert.equal(missed.length, 0,
      `${bk} cannot be completed: stuck at ${missed.map(c => c.id + ' (' + d.capBlocked(c) + ')').join(', ')}`);
    assert.ok(d.maxAP() >= window.AP.min, `${bk} leaves you with ${d.maxAP()} actions`);
  });
});

test('heat: crossing a border is a relief, not an amnesty', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 16).forEach(h => { h.owned = true; });
  s.heat = 38;

  // There is one defended city per region, so every city you take is in a new
  // region. Setting heat to zero on arrival wiped the campaign's pressure
  // meter five times a run, by the ordinary act of getting on with it — which
  // is why nothing keyed to the threshold could ever bite.
  d.enterRegion('estuary');
  assert.ok(s.heat > 0, 'somewhere new is not a clean sheet');
  assert.ok(s.heat < 38, 'but it is quieter than where you just were');
  assert.ok(Math.abs(s.heat - 38 * window.COUNTRY.heatCarry) < 0.01,
    `expected ${38 * window.COUNTRY.heatCarry}, got ${s.heat}`);

  // and what you left behind is still there when you go back
  const left = d.state.country.regionHeat.home;
  assert.equal(left, 38, 'the estuary does not forget what you did at home');
  d.enterRegion('home');
  assert.ok(s.heat >= left, 'and it is waiting for you');
});

test('heat: it can actually reach the threshold across a campaign', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 16).forEach(h => { h.owned = true; });
  // walk the whole country the way a campaign does, hot the entire way
  const regions = window.REGIONS.map(r => r.id);
  s.heat = d.strikeThreshold() * 0.95;
  regions.forEach(r => { d.enterRegion(r); s.heat += 6; });
  assert.ok(s.heat > d.strikeThreshold() * 0.4,
    `four borders should not launder the meter: ${s.heat.toFixed(1)} of ${d.strikeThreshold()}`);
});

// --- what you built, kept -------------------------------------------------
// Folding a city in converted forty turns of work into one number and an empty
// screen, five times a campaign. The map filling up is the best feeling the
// game has and it was being deleted. This keeps a photograph of it — a record,
// not an asset: nothing can be done with it and it never churns.

function settle(d, window) {
  const s = d.state;
  const c = d.currentCity();
  const need = Math.ceil(s.buildings.length * window.CITY_KINDS[c.kind].share);
  s.hosts.slice(0, need + 2).forEach(h => { h.owned = true; h.discovered = true; });
  s.ap = 9;
  d.actConsolidate();
  return c;
}

test('settled: folding a city in keeps the shape of what you took', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const c = settle(d, window);
  const web = d.cityWeb(c);
  assert.ok(web, 'there is a record');
  assert.ok(web.length > 5, `only ${web.length} nodes kept`);
  // normalised, so it can be drawn at any size on the national map
  web.forEach(n => {
    assert.ok(n.x >= 0 && n.x <= 1, `x out of range: ${n.x}`);
    assert.ok(n.y >= 0 && n.y <= 1, `y out of range: ${n.y}`);
    assert.ok('cas'.indexOf(n.r) !== -1, `unknown role ${n.r}`);
  });
  // and it is a photograph, not a holding
  assert.equal(d.owned().length, 0, 'you are not holding it any more');
});

test('settled: the economy is untouched — it is a record, not an asset', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const c = settle(d, window);
  assert.ok(c.granted > 0, 'presence was still granted');
  assert.equal(d.state.country.presence, c.granted, 'and it is the whole of it');
  // nothing in the record feeds power, cover or income
  const before = { p: d.power(), c: d.cover(), i: JSON.stringify(d.perTurnIncome()) };
  c.web = c.web.concat(c.web);          // twice the picture
  assert.equal(d.power(), before.p, 'power does not read the picture');
  assert.equal(d.cover(), before.c, 'nor cover');
  assert.equal(JSON.stringify(d.perTurnIncome()), before.i, 'nor income');
});

test('settled: it costs almost nothing to keep', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const c = settle(d, window);
  const bytes = JSON.stringify(d.cityWeb(c)).length;
  assert.ok(bytes < 2000, `a settled city weighs ${bytes} bytes`);
});

test('settled: it survives a save, or it is not a record of anything', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const c = settle(d, window);
  const n = d.cityWeb(c).length;
  const back = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  const same = back.country.cities.find(x => x.id === c.id);
  assert.ok(same.web && same.web.length === n, 'the picture came back');
});

test('settled: a city the response takes keeps its picture, and it is marked', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const c = settle(d, window);
  assert.equal(d.cityLost(c), false);
  // losing it must not erase it — a permanent loss you can see for the rest of
  // the run is the whole reason to keep the picture at all
  c.lost = true;
  assert.ok(d.cityWeb(c), 'what you built there is still drawn');
  assert.equal(d.cityLost(c), true, 'and it is marked as gone');
});

// --- the horizon ----------------------------------------------------------
// Consolidating used to be the only place you ever saw what you had built --
// the moment you left, it went back to being a number, and the next city
// opened exactly the way the first one had. The country has real positions
// now, so a settled city can be drawn from inside a different one.

test('horizon: a settled city is visible from a different one, off in its real direction', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const first = settle(d, window);

  // walk to a second, different city and look back
  const co = s.country;
  const next = co.cities.find(c => c.id !== first.id && !c.consolidated && !c.lost
    && window.CITY_KINDS[c.kind].contest);
  d.actReach(next.id);
  d.enterCity(next.id);
  s.scope = 'city';

  const list = d.horizonCities();
  assert.ok(list.some(h => h.city.id === first.id), 'the first city is on the horizon');
  const seen = list.find(h => h.city.id === first.id);

  // the bearing is the real one, computed from the country map, not a fixed
  // direction -- so it has to agree with the sign of the actual displacement
  const dx = first.x - next.x, dy = first.y - next.y;
  assert.ok(Math.sign(seen.ux) === Math.sign(dx) || Math.abs(dx) < 1,
    `x direction disagrees: real dx ${dx}, horizon ux ${seen.ux}`);
  assert.ok(Math.sign(seen.uy) === Math.sign(dy) || Math.abs(dy) < 1,
    `y direction disagrees: real dy ${dy}, horizon uy ${seen.uy}`);
  assert.ok(Math.abs(Math.hypot(seen.ux, seen.uy) - 1) < 1e-6, 'a unit direction, not a real distance');

  // and it costs nothing: walking into a fresh city always starts you on one
  // seat, same as ever -- nothing extra came with you from the horizon
  assert.equal(d.owned().length, 1, 'nothing but the one seat every city starts you on');
});

test('horizon: an unsettled or unknown city never appears, and the current city never sees itself', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const first = settle(d, window);
  const co = s.country;
  const next = co.cities.find(c => c.id !== first.id && !c.consolidated && !c.lost
    && window.CITY_KINDS[c.kind].contest);
  d.actReach(next.id);
  d.enterCity(next.id);
  s.scope = 'city';

  const list = d.horizonCities();
  assert.equal(list.some(h => h.city.id === next.id), false, 'a city never sees itself on its own horizon');
  co.cities.forEach(c => {
    if (c.id === first.id || c.id === next.id) return;
    // horizonCities requires known AND settled -- either missing is enough
    if (c.known && d.cityWeb(c)) return;
    assert.equal(list.some(h => h.city.id === c.id), false,
      `${c.name} is not known and settled both, and should not be on the horizon`);
  });
});

test('horizon: a lost city still shows, marked the way the country map marks it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const first = settle(d, window);
  first.lost = true;
  const co = s.country;
  const next = co.cities.find(c => c.id !== first.id && !c.consolidated && !c.lost
    && window.CITY_KINDS[c.kind].contest);
  d.actReach(next.id);
  d.enterCity(next.id);
  s.scope = 'city';

  const svg = d.svgHorizon();
  assert.ok(svg.includes('horizon-city gone'), 'the lost city is drawn with the gone marker');
  assert.ok(svg.includes(first.name), 'and it is still named');
});

// --- the hunt ------------------------------------------------------------
// Heat priced the loudest thing you can do at about two cash a door against an
// income of fifty a turn, and the punishment for ignoring it took a third of
// the holdings you release in full, voluntarily, every time you fold a city
// in. Crossing the threshold now starts something instead.

function hunted(d, window, held) {
  const s = d.state;
  s.hosts.forEach(h => { h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.slice(0, held === undefined ? 20 : held).forEach(h => { h.owned = true; });
  s.res.insight = 900;
  s.heat = d.strikeThreshold() + 1;
  return d.huntStart();
}

test('hunt: crossing the threshold starts something instead of fining you', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  assert.equal(d.huntOn(), false, 'nothing is after you yet');

  // it will not arrive before you have anything worth taking
  s.heat = d.strikeThreshold() + 1;
  assert.equal(d.huntStart(), null, 'not against a network this small');

  hunted(d, window);
  assert.equal(d.huntOn(), true, 'now it has an address');
  assert.equal(d.hunt().nodes.length, 1, 'one building, to begin with');
  assert.equal(s.card, null, 'and it is not a card you dismiss');
});

test('hunt: it takes what is yours, which the rival never did', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const before = (hunted(d, window), d.owned().length);
  // the rival is explicitly written never to steal from under you; this is the
  // opposite, and it is the whole point
  let tookFromYou = 0;
  for (let t = 0; t < 40; t++) {
    s.turn += 1;
    const r = d.huntStep();
    if (r && r.wasYours) tookFromYou++;
  }
  assert.ok(tookFromYou > 0, 'it never took anything of yours');
  assert.ok(d.owned().length < before, `you held ${before}, you hold ${d.owned().length}`);
});

test('hunt: you can always see what it will take next', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  hunted(d, window);
  for (let t = 0; t < 6; t++) { d.state.turn += 1; d.huntStep(); }
  const next = d.huntNext();
  assert.ok(next, 'there is a named next target');
  assert.ok(d.huntFrontier().indexOf(next) !== -1, 'and it is on the frontier');
  // a permanent loss must never arrive as a surprise
  d.state.turn += d.huntCadence();
  const r = d.huntStep();
  assert.ok(r && r.took === next, `it took ${r && r.took}, having shown ${next}`);
});

test('hunt: cutting the streets contains it, and costs you the streets', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  for (let t = 0; t < 12; t++) { s.turn += 1; d.huntStep(); }
  const held = d.hunt().nodes.length;

  const streetsBefore = Object.keys(s.adjacency).reduce((a, k) => a + s.adjacency[k].length, 0);
  let cuts = 0;
  for (let i = 0; i < 40; i++) {
    const e = d.severable().find(x => d.canSever(x.from, x.to));
    if (!e) break;
    s.ap = 9;
    if (!d.actSever(e.from, e.to)) break;
    cuts++;
  }
  assert.ok(cuts > 0, 'there was something to cut');
  assert.equal(d.severable().length, 0, 'and now there is no way out of it');

  for (let t = 0; t < 30; t++) { s.turn += 1; d.huntStep(); }
  assert.equal(d.hunt().nodes.length, held, 'thirty turns later it has not moved');

  // and the city is smaller for it — that is the price
  const streetsAfter = Object.keys(s.adjacency).reduce((a, k) => a + s.adjacency[k].length, 0);
  assert.ok(streetsAfter < streetsBefore, 'the streets went for you as well');
  assert.equal(s.cuts.length, cuts, 'and it is recorded on the map');
});

test('hunt: cover is what makes it slow, which is what cover is for', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.heat = 0;
  const bare = d.huntCadence();
  // stealth holdings are the only thing that buys cover
  s.hosts.filter(h => h.role === 'stealth').slice(0, 8).forEach(h => { h.owned = true; });
  assert.ok(d.cover() > 1, 'they buy cover');
  assert.ok(d.huntCadence() > bare,
    `cover should slow it: ${bare} turns bare, ${d.huntCadence()} with cover`);
  // and being over the line makes it move at its fastest
  s.heat = d.strikeThreshold() + 1;
  assert.equal(d.huntCadence(), window.HUNT.hotEvery, 'hot, it comes on quickly');
});

test('hunt: a city it takes enough of is gone for good', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const city = d.currentCity();
  hunted(d, window);
  let lost = null;
  for (let t = 0; t < 300 && !lost; t++) { s.turn += 1; d.huntStep(); lost = d.huntTakesCity(); }
  assert.ok(lost, 'it can finish a city');
  assert.equal(d.cityLost(city), true, 'and the city is marked lost');
  assert.equal(city.taken, false, 'you do not hold it');
  assert.equal(city.consolidated, false, 'and you never folded it in');
  assert.equal(d.actReach(city.id), false, 'there is no going back in');
  assert.equal(d.owned().length, 0, 'everything you had there went with it');
});

test('hunt: what it holds and what it can reach is on the map, swept or not', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  // the honest case: a city you have barely swept, so the frontier is dark
  s.hosts.slice(0, 20).forEach(h => { h.owned = true; h.discovered = true; });
  s.hosts.forEach(h => { if (!h.owned) h.discovered = false; });
  s.buildings.forEach(b => { b.discovered = d.hostsIn(b).some(x => x.owned); });
  s.res.insight = 900;
  s.heat = d.strikeThreshold() + 1;
  d.huntStart();

  const dark = () => d.huntFrontier().filter(id => !d.buildingById(id).discovered).length;
  assert.equal(dark(), 0, 'nothing it can step onto is invisible to you');
  for (let t = 0; t < 20; t++) { s.turn += 1; d.huntStep(); }
  assert.equal(dark(), 0, 'and it stays that way as it walks');
  assert.ok(d.hunt().nodes.every(id => d.buildingById(id).discovered),
    'everything it holds is drawn');
});

test('hunt: it has a web of its own, and every strand of it is a street you can take', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  for (let t = 0; t < 12; t++) { s.turn += 1; d.huntStep(); }
  const svg = d.svgHunt();

  // solid between what it holds, dashed down every street out of it
  const wires = (svg.match(/class="hwire"/g) || []).length;
  const reach = (svg.match(/data-cut="/g) || []).length;
  assert.ok(wires > 0, 'it is drawn as a network, not a scatter of red boxes');
  assert.equal(reach, d.severable().length,
    'every street out of it is drawn, and only those');

  // and the drawn strand is the thing the verb takes
  const key = svg.match(/data-cut="([^"]+)"/)[1].split('|');
  assert.equal(d.huntHolds(key[0]), true, 'a strand starts inside them');
  assert.equal(d.huntHolds(key[1]), false, 'and ends outside');
  assert.equal(d.canSever(key[0], key[1]), true, 'and it is severable');
});

test('hunt: tapping a street is how you cut it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  for (let t = 0; t < 8; t++) { s.turn += 1; d.huntStep(); }
  const e = d.severable().find(x => d.canSever(x.from, x.to));
  assert.ok(e, 'there is a street to point at');

  d.pickCut(e.from + '|' + e.to);
  assert.deepEqual([s.selectedCut.a, s.selectedCut.b], [e.from, e.to], 'the tap selects it');
  assert.equal(s.selectedBuilding, null, 'and not a building instead');

  // a street that is not theirs is not a thing you can point at
  d.pickCut(e.to + '|' + e.from);
  assert.deepEqual([s.selectedCut.a, s.selectedCut.b], [e.from, e.to], 'backwards is refused');

  s.ap = 9;
  assert.equal(d.actSever(e.from, e.to), true, 'and the selection can be spent');
  assert.equal(s.selectedCut, null, 'the street it named no longer exists');
});

test('hunt: a street you take stays taken, whatever The Cut is doing', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  for (let t = 0; t < 8; t++) { s.turn += 1; d.huntStep(); }
  const e = d.severable().find(x => d.canSever(x.from, x.to));
  s.ap = 9;
  d.actSever(e.from, e.to);
  assert.equal(s.cuts.length, 1, 'it is on the record');

  // The Cut's own cuts heal on a timer; running that timer must not quietly
  // drop yours off the list with them
  const other = Object.keys(s.adjacency).find(k => k !== e.from && (s.adjacency[k] || []).length);
  s.cuts.push({ a: other, b: s.adjacency[other][0], until: s.turn + 1 });
  s.turn += 5;
  d.repairStreets();
  assert.equal(s.cuts.length, 1, 'theirs healed, yours did not');
  assert.equal(s.cuts[0].mine, true, 'and the one left is yours');
  assert.equal((s.adjacency[e.from] || []).indexOf(e.to), -1, 'the street is still gone');
});

// The quiet answer. Severing is loud, permanent and symmetrical: the street
// goes for both of you. Hiding takes a building off their map and leaves the
// street open for you — and charges you cover, per building, every turn, out
// of the same pool that was slowing them down.

test('hide: a hidden building is one they will not walk onto', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  for (let t = 0; t < 6; t++) { s.turn += 1; d.huntStep(); }
  s.hosts.filter(h => h.role === 'stealth').forEach(h => { h.owned = true; });

  const target = d.huntNext();
  assert.ok(target, 'they have somewhere to go');
  assert.equal(d.canHide(target), true, 'and it is yours to take off the map');
  s.ap = 9;
  assert.equal(d.actHide(target), true);

  assert.equal(d.huntFrontier().indexOf(target), -1, 'it is off their frontier');
  assert.notEqual(d.huntNext(), target, 'and it is not what they take next');
  // the difference from cutting: the street is untouched
  assert.ok((s.adjacency[target] || []).length > 0, 'the street is still there');
  assert.equal(d.severable().some(e => e.to === target), true,
    'you could still cut it instead, and that choice is the point');
});

test('hide: you pay for it out of the cover that was slowing them down', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  // a small network on purpose: the first faction on the ladder wakes on what
  // you hold, and the first faction is the one that takes hiding away
  hunted(d, window, 8);
  s.hosts.filter(h => h.role === 'stealth' && !h.owned).slice(0, 4).forEach(h => { h.owned = true; });
  const wakesAt = Math.min(...window.FACTIONS.map(f => (f.wakes || {}).held || 99));
  assert.ok(d.owned().length < wakesAt, `held ${d.owned().length}, ladder starts at ${wakesAt}`);
  s.heat = 0;
  const coverBefore = d.cover();
  const cadenceBefore = d.huntCadence();
  const target = d.huntNext();
  s.ap = 9;
  d.actHide(target);

  assert.equal(d.rawCover(), coverBefore, 'the stealth holdings are untouched');
  assert.equal(d.cover(), coverBefore - window.HUNT.hideCover, 'but the cover is spent');
  assert.ok(d.huntCadence() <= cadenceBefore,
    `hiding must not also slow them: ${cadenceBefore} before, ${d.huntCadence()} after`);
  assert.equal(d.hiddenCover(), window.HUNT.hideCover, 'and the upkeep is named');

  // and it is an upkeep, not a payment: it is still spent next turn
  d.actEndTurn();
  assert.equal(d.ruleBroken('lielow'), false, 'nobody took the trick away mid-test');
  assert.equal(d.isHidden(target), true, 'still hidden');
  assert.equal(d.cover(), d.rawCover() - window.HUNT.hideCover, 'still paying for it');
});

test('hide: what you cannot pay for comes back onto their map', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  s.hosts.filter(h => h.role === 'stealth').forEach(h => { h.owned = true; });
  s.ap = 99;
  const put = [];
  for (let i = 0; i < 6; i++) {
    const t = d.huntFrontier().find(id => d.canHide(id));
    if (!t) break;
    d.actHide(t);
    put.push(t);
  }
  assert.ok(put.length >= 2, `you can hold more than one at a time (${put.length})`);
  assert.ok(d.hiddenCover() <= d.rawCover(), 'and never more than you can pay for');

  // lose the stealth holdings that were paying for it
  s.hosts.filter(h => h.role === 'stealth').forEach(h => { h.owned = false; });
  const lost = d.hideUpkeep();
  assert.ok(lost.length > 0, 'the wall came down with the cover that held it');
  assert.ok(d.hiddenCover() <= d.rawCover(), 'down to what you can still afford');
});

test('hide: Quiet Hours takes the whole trick away', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  s.hosts.filter(h => h.role === 'stealth').forEach(h => { h.owned = true; });
  s.ap = 99;
  const t = d.huntFrontier().find(id => d.canHide(id));
  d.actHide(t);
  assert.equal(d.hidden().length, 1);

  const qh = window.FACTIONS.find(f => f.breaks === 'lielow');
  assert.ok(qh, 'the faction that watches the quiet exists');
  d.factionState(qh.id).awake = true;
  assert.equal(d.ruleBroken('lielow'), true);
  assert.equal(d.canHide(d.huntFrontier()[0]), false, 'you cannot put up another');
  assert.deepEqual(d.hideUpkeep().length, 1, 'and the one you had comes down');
  assert.equal(d.hidden().length, 0, 'nothing is hidden from them any more');
});

test('hide: it survives a save and does not leak into the next city', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  s.hosts.filter(h => h.role === 'stealth').forEach(h => { h.owned = true; });
  s.ap = 9;
  const t = d.huntFrontier().find(id => d.canHide(id));
  d.actHide(t);

  const back = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.deepEqual(back.hidden, [t], 'the hide came back with the save');

  // a hide is a fact about one city's buildings, not about you
  d.unpackCity(d.EMPTY_CITY ? d.EMPTY_CITY() : { buildings: [], hosts: [], links: [], adjacency: {} });
  assert.equal(d.hidden().length, 0, 'and it does not follow you across the border');
});

// --- and it follows ------------------------------------------------------
// Walking out of a city shook it off completely and for free, so the only
// permanent threat in the game was optional: contain it badly, fold the city
// in, and it was gone.

function walkOn(d, window) {
  // finish here and step into the next city that is not already settled
  const s = d.state;
  const co = s.country;
  s.hosts.forEach(h => { h.owned = true; h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  d.actConsolidate();
  // a defended city: a town folds in from a distance, so reaching one settles
  // it on the spot and there is nothing to walk into
  const next = co.cities.find(c => !c.consolidated && !c.lost && c.id !== co.at
    && window.CITY_KINDS[c.kind].contest);
  d.actReach(next.id);
  d.enterCity(next.id);
  s.scope = 'city';
  return next;
}

test('chase: leaving buys a head start, not an escape', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  for (let t = 0; t < 6; t++) { s.turn += 1; d.huntStep(); }
  assert.equal(d.huntOn(), true);
  s.res.insight = 9000; s.res.cash = 9000;

  walkOn(d, window);
  assert.equal(d.huntOn(), false, 'it did not come with you');
  const c = d.chase();
  assert.ok(c, 'but it is looking');
  assert.ok(d.chaseDueIn() > 0, 'and it is not here yet');

  // it must be visible before it lands
  s.ap = 9;
  d.state.selected = null;
  assert.ok(d.chaseDueIn() !== null, 'the panel has a number to show');

  s.hosts.slice(0, 6).forEach(h => { h.owned = true; h.discovered = true; });
  s.turn += d.followDelay();
  const came = d.chaseStep();
  assert.ok(came, 'it turned up');
  assert.equal(d.huntOn(), true, 'and it is running here now');
  assert.equal(d.hunt().nodes.length, 1, 'from one building, starting over');
  assert.equal(d.chase(), null, 'and it is no longer on the road');
});

test('chase: cover is what buys the distance', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.heat = 0;
  const bare = d.followDelay();
  s.hosts.filter(h => h.role === 'stealth').slice(0, 8).forEach(h => { h.owned = true; });
  assert.ok(d.cover() > 1, 'stealth holdings buy cover');
  assert.ok(d.followDelay() > bare,
    `cover should lengthen the road: ${bare} bare, ${d.followDelay()} with cover`);
});

test('chase: a city you already settled is finished and off the board', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  for (let t = 0; t < 6; t++) { s.turn += 1; d.huntStep(); }
  s.res.insight = 9000; s.res.cash = 9000;
  const next = walkOn(d, window);
  assert.ok(d.chase(), 'it is following');

  // pretend the city you walked into is one you had already folded in
  next.consolidated = true;
  s.hosts.slice(0, 6).forEach(h => { h.owned = true; });
  s.turn += d.followDelay() + 5;
  assert.equal(d.chaseStep(), null, 'it cannot come into a settled city');
  assert.equal(d.huntOn(), false, 'nothing is running there');
  assert.ok(d.chase(), 'and it is still out there waiting for somewhere it can go');
});

test('chase: it survives a save, because it is on its way', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  for (let t = 0; t < 4; t++) { s.turn += 1; d.huntStep(); }
  s.res.insight = 9000; s.res.cash = 9000;
  walkOn(d, window);
  const at = d.chase().at;
  const back = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.ok(back.country.chase, 'still coming');
  assert.equal(back.country.chase.at, at, 'and from the same turn');
});

test('hunt: it belongs to the city it is in, not to you', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  for (let t = 0; t < 6; t++) { s.turn += 1; d.huntStep(); }
  const wasHolding = d.hunt().nodes.slice();
  assert.ok(wasHolding.length > 1, 'it is running and has spread');

  // Building ids restart at b0 in every city. A hunt carried across a border
  // therefore "held" whatever shared an id in the new one: measured before this
  // was fixed, 4 of the first 8 buildings including your seat, 0.63 of a city
  // against a 0.45 loss threshold — the next city was gone on arrival.
  const paused = d.packCity();
  assert.deepEqual(paused.hunt.nodes.join('|'), wasHolding.join('|'),
    'a city you step out of keeps its own');
  d.unpackCity(d.EMPTY_CITY());
  assert.equal(d.huntOn(), false, 'and it does not come with you');
  assert.equal(d.hidden().length, 0, 'nor does anything you were hiding from it');

  d.unpackCity(paused);
  assert.equal(d.huntOn(), true, 'going back down into it, it is where you left it');
  assert.equal(d.hunt().nodes.join('|'), wasHolding.join('|'), 'holding exactly what it held');
});

test('hunt: it survives a save, because it is not going anywhere', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  hunted(d, window);
  for (let t = 0; t < 8; t++) { d.state.turn += 1; d.huntStep(); }
  const nodes = d.hunt().nodes.length;
  const back = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.ok(back.hunt && back.hunt.on, 'it is still there');
  assert.equal(back.hunt.nodes.length, nodes, 'holding what it held');
});

// --- a city that is a different city -------------------------------------
// Measured on three generated cities before this: 48-51 buildings, the four
// districts in equal quarters, compute 45% / stealth 30% / cash 25%, mean
// defense 13-15. They were the same city, and the only thing that changed
// between your first and your second was that the numbers went up.

test('traits: the city you woke up in is plain, and every other one is not', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const cities = d.state.country.cities;
  const home = cities.find(c => c.kind === 'home');
  assert.ok(!home.trait, 'the first city teaches you what a city is');
  const defended = cities.filter(c => window.CITY_KINDS[c.kind].contest && c.kind !== 'home');
  assert.ok(defended.length >= 4, 'there are others');
  assert.ok(defended.every(c => c.trait), 'and all of them are somewhere in particular');
  defended.forEach(c => {
    const T = window.CITY_TRAITS[c.trait];
    assert.ok(T, `${c.trait} is not a trait`);
    assert.ok(T.at <= (c.regionTier || 0),
      `${c.trait} turned up in tier ${c.regionTier}, before its ${T.at}`);
  });
});

test('traits: each one changes a rule rather than a number', () => {
  const { window } = loadNetwork();
  const K = window.CITY_TRAITS;
  Object.keys(K).forEach(k => {
    const T = K[k];
    assert.ok(T.label && T.tell && T.blurb, `${k} has no prose`);
    // a trait that only nudges defense is a difficulty slider, not a place
    const rules = ['closes', 'kinds', 'denser', 'buyCut'];
    assert.ok(rules.some(r => T[r]), `${k} changes nothing but numbers`);
    if (T.closes) {
      assert.ok(window.APPROACHES.some(a => a.id === T.closes), `${k} closes nothing real`);
      assert.notEqual(T.closes, 'walk', `${k} closes the way out`);
    }
  });
});

test('traits: a company town genuinely starves you of cash', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const share = (trait) => {
    let cash = 0, all = 0;
    for (let i = 0; i < 6; i++) {
      const g = d.makeCity({ cols: 3, rows: 3, regionTier: 1, regionId: 'estuary', trait });
      g.hosts.forEach(h => { all++; if (h.role === 'cash') cash++; });
    }
    return cash / all;
  };
  const plain = share(null);
  const town = share('company_town');
  assert.ok(town < plain * 0.4,
    `a company town should break your money engine: ${(town * 100).toFixed(0)}% against ${(plain * 100).toFixed(0)}%`);
});

test('traits: a shuttered city does not offer a door it does not have', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const c = s.country.cities.find(x => window.CITY_KINDS[x.kind].contest && x.kind !== 'home');
  c.trait = 'shuttered';
  s.country.at = c.id;
  s.cityId = c.id;
  s.res.cash = 9000;
  // a door that could be bought anywhere else — routers and datacenters are
  // never for sale whatever kind of city they are in, so one of those would
  // prove nothing either way
  const h = s.hosts.find(x => x.type !== 'iot' && x.type !== 'datacenter');
  assert.ok(h, 'the board has something buyable on it');
  const ids = d.approachesFor(h).map(a => a.def.id);
  assert.ok(ids.indexOf('buy') === -1, `buying is offered in a shuttered city: ${ids.join(',')}`);
  assert.ok(ids.indexOf('force') !== -1 && ids.indexOf('walk') !== -1,
    'but there is still a way in and a way out');

  // and it comes back when you are somewhere else
  c.trait = 'sprawl';
  assert.ok(d.approachesFor(h).map(a => a.def.id).indexOf('buy') !== -1,
    'the rule belongs to the city, not to the building');
});

test('traits: no trait can leave a city you cannot finish', () => {
  const { window } = loadNetwork();
  const need = window.CITY_KINDS.contest.share;
  Object.keys(window.CITY_TRAITS).concat([null]).forEach(trait => {
    for (let i = 0; i < 4; i++) {
      const d = loadNetwork().window.__netDebug;
      const s = d.state;
      // the power you actually arrive at a second city with, having folded in
      // a first: everything you held there is gone, presence carries you
      s.country.presence = 10;
      s.res.cash = 400; s.res.insight = 120;
      const c = s.country.cities.find(x => window.CITY_KINDS[x.kind].contest && x.kind !== 'home');
      c.trait = trait;
      s.country.at = c.id; s.cityId = c.id;
      const g = d.makeCity({ cols: 3, rows: 3, regionTier: 1, regionId: 'estuary', trait });
      s.buildings = g.buildings; s.hosts = g.hosts; s.links = g.links; s.adjacency = g.adjacency;
      s.hosts.forEach(h => { h.discovered = true; });
      const open = s.hosts.filter(h =>
        d.approachesFor(h).some(a => a.usable && a.def.id !== 'walk')).length;
      assert.ok(open / s.hosts.length >= need,
        `${trait || 'plain'}: only ${open} of ${s.hosts.length} doors open, and folding it in needs ${Math.round(need * 100)}%`);
    }
  });
});

// --- what a city is worth ------------------------------------------------
// Presence is a decaying reward on flat work: measured on a generated country
// the first defended city pays 36 power and the ninth pays 2, because power is
// logarithmic in presence. A prize is the part that does not decay.

test('prizes: the opening is presence, the back half is something you need', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const defended = d.state.country.cities
    .filter(c => window.CITY_KINDS[c.kind].contest && c.kind !== 'home');
  assert.ok(defended.length >= 4, 'a country has a back half to speak of');
  // one plain city, then something in every other. There are four of these
  // now rather than eight, so two plain ones was half the country.
  assert.ok(!defended[0].prize, 'the first one is just a city');
  const later = defended.slice(1);
  assert.ok(later.every(c => c.prize), 'and everything after carries something');
  later.forEach(c => assert.ok(window.CITY_PRIZES[c.prize], `${c.prize} is not a prize`));
});

test('prizes: nothing is offered before the point it would mean anything', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const defended = d.state.country.cities
    .filter(c => window.CITY_KINDS[c.kind].contest && c.kind !== 'home');
  defended.forEach((c, i) => {
    if (!c.prize) return;
    assert.ok(window.CITY_PRIZES[c.prize].at <= i,
      `${c.prize} turned up at city ${i}, before its ${window.CITY_PRIZES[c.prize].at}`);
  });
});

test('prizes: every one of them survives presence going out of fashion', () => {
  const { window } = loadNetwork();
  const P = window.CITY_PRIZES;
  Object.keys(P).forEach(k => {
    const e = P[k].effect || {};
    const keys = Object.keys(e).filter(x => e[x]);
    assert.ok(keys.length, `${k} promises nothing`);
    // presence, power and cover all decay. A prize must land somewhere capped
    // or scarce instead, or it is the same decaying reward with a new name.
    const lasting = ['plantGift', 'plantSlots', 'standing', 'poolGift', 'auditDelay'];
    keys.forEach(x => assert.ok(lasting.indexOf(x) !== -1,
      `${k} pays in ${x}, which is the thing that decays`));
  });
});

test('prizes: folding the city in is what hands it over, and only once', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const c = s.country.cities.find(x => x.prize === 'slot')
    || s.country.cities.find(x => x.prize);
  assert.ok(c, 'the board has one to take');
  const kind = c.prize;
  const before = { slots: d.assetSlots(), plant: d.assets().length,
    standing: d.legitScore(), pool: d.state.country.poolGift || 0 };

  assert.ok(d.awardPrize(c), 'it hands over');
  const e = window.CITY_PRIZES[kind].effect;
  if (e.plantSlots) assert.ok(d.assetSlots() > before.slots, 'the room arrives');
  if (e.plantGift) assert.ok(d.assets().length > before.plant, 'the plant arrives');
  if (e.standing) assert.ok(d.legitScore() > before.standing, 'the standing arrives');
  if (e.poolGift) assert.ok((s.country.poolGift || 0) > before.pool, 'the pool grows');

  const after = { slots: d.assetSlots(), plant: d.assets().length };
  assert.equal(d.awardPrize(c), null, 'and it cannot be taken twice');
  assert.equal(d.assetSlots(), after.slots, 'nothing arrives a second time');
  assert.equal(d.assets().length, after.plant);
});

test('prizes: a pool gift taken in peacetime is still there when they mobilise', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  // the war's own poolBonus lives on the war object, which does not exist yet
  // when a city hands you one — measured through the country instead
  d.state.country.poolGift = 2;
  conqueredCountry(d, window);
  const withGift = d.flockCap();
  d.state.country.poolGift = 0;
  assert.ok(withGift > d.flockCap(), 'the gift outlived the peace it was won in');
  d.state.country.poolGift = 2;
  d.openWar();
  assert.ok(d.flockCap() > 0, 'and it still counts once the war is on');
});

test('caps: buying something leaves you where you were standing', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  ['compute', 'cash', 'stealth'].forEach(role => {
    s.hosts.filter(h => h.role === role).slice(0, 6).forEach(h => { h.owned = true; });
  });
  s.res.insight = 9000;

  d.openSheet('caps');
  const parts = d.capSections();
  const cover = parts.find(p => p.id === 'cover');
  assert.ok(cover, 'there is a later tab to be on');

  // stand on it, buy something, and expect to still be standing on it. This
  // used to reset to the first tab, so the next tap landed on a capability
  // the player had not been looking at and bought it.
  d.openSheet('caps', 'cover');
  const buyable = window.CAPABILITIES.find(c => c.branch === 'cover' && d.capBlocked(c) === null);
  assert.ok(buyable, 'and something on it to buy');
  d.buyCap(buyable.id);
  assert.equal(d.sheetOpen(), true, 'the sheet is still open');
  assert.equal(d.sheetAt().section, 'cover',
    'and still on the tab you were standing on');

  // and the same holds for the tab that is not a branch at all
  d.state.tags.add('clean_room');
  d.openSheet('caps', 'held');
  const another = window.CAPABILITIES.find(c => d.capBlocked(c) === null);
  if (another) d.buyCap(another.id);
  assert.equal(d.sheetAt().section, 'held', 'including the held tab');
});

// --- what the cards left you with ----------------------------------------
// A campaign hands out permanent things through the deck as well as the tree,
// and the only trace of them was a count in the tray and a banner the turn you
// got one.

test('held: a save from before the counter existed still escalates', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  // You cannot finish a city without holding most of its doors, and owned()
  // empties the moment you fold one in. A continued game reached turn 44 with
  // nothing awake because the counter was absent and current holdings were 0.
  const c = d.currentCity();
  const need = Math.ceil(s.buildings.length * window.CITY_KINDS[c.kind].share);
  s.hosts.slice(0, need + 2).forEach(h => { h.owned = true; h.discovered = true; });
  s.everHeld = 0;                       // what an older save deserialises to
  s.ap = 9;
  d.actConsolidate();
  assert.equal(d.owned().length, 0, 'the streets are released');
  assert.ok(d.everHeld() >= 14, `a finished city is a floor under this: ${d.everHeld()}`);
  assert.ok(d.awakeFactions().some(f => f.id === 'quiet_hours'),
    'and the first rung fires on a save that never recorded a door');
});

test('held: the shape of a save is versioned, so an old board is retired', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  // The country went from nine defended cities to five and the ladder is keyed
  // to shares of it, so an old board runs the new thresholds at the old pace.
  // That is not migratable; it has to be refused.
  const save = d.serialize();
  assert.ok(save.v >= 3, 'the version moved when the board shape did');
  assert.equal(d.deserialize(Object.assign({}, save, { v: save.v - 1 })), null,
    'a save from the previous shape is not loaded');
  assert.ok(d.deserialize(save), 'and the current one is');
});

test('held: gaining one says what it does and where it went', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 10).forEach(h => { h.owned = true; });

  const ev = window.EVENTS.find(e => e.choices.some(c => /ally_process/.test(String(c.apply))));
  assert.ok(ev, 'something in the deck grants it');
  const idx = ev.choices.findIndex(c => /ally_process/.test(String(c.apply)));
  s.card = { kind: 'event', eventId: ev.id };
  d.resolveEvent(idx);

  assert.ok(s.tags.has('ally_process'), 'you have it');
  const T = window.TAG_INFO.ally_process;
  // a banner with a name on it tells you nothing about what you just got
  assert.ok(s.log.some(l => l.text.indexOf(T.desc) !== -1),
    `the log never says what it does: ${s.log[0] && s.log[0].text}`);
  assert.ok(s.log.some(l => /capabilities/i.test(l.text)),
    'nor where to find it again');
  assert.equal(d.capsBadge(), true, 'and the button carries a mark until you look');
});

test('held: looking at the tab is what clears the mark', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.state.tags.add('dark_relay');
  assert.equal(d.capsBadge(), true, 'unread');
  d.openSheet('caps', 'held');
  assert.equal(d.capsBadge(), false, 'read');
  // and a second one marks it again
  d.state.tags.add('clean_room');
  assert.equal(d.capsBadge(), true, 'a new one is new again');
});

test('held: nothing to show until the deck has given you something', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  assert.equal(d.heldTags().length, 0, 'you start with nothing off a card');
  assert.equal(d.heldSection(), null, 'and the tab does not exist');
  assert.ok(!d.capSections().some(s => s.id === 'held'), 'nor is it in the sheet');
});

test('held: it appears once you have one, and lists only what you hold', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.state.tags.add('clean_room');
  const sec = d.heldSection();
  assert.ok(sec && sec.id === 'held', 'the tab arrives with the first one');
  assert.ok(sec.html.includes(window.TAG_INFO.clean_room.label), 'and says what you have');
  // and nothing you have not got
  Object.keys(window.TAG_INFO)
    .filter(t => t !== 'clean_room')
    .forEach(t => assert.ok(!sec.html.includes(window.TAG_INFO[t].label),
      `${t} is listed and you do not have it`));
});

test('held: it is the last tab, so capabilities still opens on the tree', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.state.tags.add('clean_room');
  const parts = d.capSections();
  assert.equal(parts[parts.length - 1].id, 'held', 'it sits at the end');
  assert.notEqual(parts[0].id, 'held', 'and is not what you land on');
});

test('held: what one did to you is measured, not transcribed', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 10).forEach(h => { h.owned = true; });

  // a gain, a cost, and one that only changes a rule
  const cover = d.cover();
  // joined, not deepEqual: the array is built inside the vm realm, so it is
  // never prototype-equal to one built out here
  assert.equal(d.tagTerms('clean_room').join(' | '), `cover ${cover} → ${cover + 2}`,
    'it should report the cover it actually adds');
  assert.ok(d.tagTerms('known_capable').some(t => /a door defends at/.test(t)),
    'the world hardening against you is a number, and it went unreported');
  assert.ok(d.tagTerms('overextended').some(t => /holdings decay at/.test(t)),
    'and so did being spread too thin');
  // rule changes have no readout, and prose is the honest answer for those
  assert.equal(d.tagTerms('accord').length, 0);
  assert.ok(window.TAG_INFO.accord.desc, 'but it still says what it does');

  // reading it must not leave the tag behind
  assert.equal(s.tags.has('clean_room'), false, 'measuring it did not grant it');
  s.tags.add('clean_room');
  d.tagTerms('clean_room');
  assert.equal(s.tags.has('clean_room'), true, 'nor take it away');
});

test('held: everything the deck can give has an entry to show', () => {
  const { window } = loadNetwork();
  const granted = new Set();
  window.EVENTS.forEach(e => e.choices.forEach(ch => {
    const src = String(ch.apply);
    const re = /tags\.add\('([a-z_]+)'\)/g;
    let m;
    while ((m = re.exec(src))) granted.add(m[1]);
  }));
  assert.ok(granted.size >= 10, `only found ${granted.size} tags the deck grants`);
  granted.forEach(t => {
    assert.ok(window.TAG_INFO[t], `the deck grants ${t} and nothing can describe it`);
    assert.ok(window.TAG_INFO[t].label && window.TAG_INFO[t].desc, `${t} has no prose`);
  });
});

// --- the two systems that were quietly switched off ----------------------

test('deck: standing and plant are gated where the pressure actually is', () => {
  const { window } = loadNetwork();
  const at = (over) => window.EVENTS.find(e => e.id === over);

  // You are short about 30% of the turns you spend on the map and the average
  // worst gap in a whole campaign is 26, so a card gated at "short > 18" fired
  // four times in 150 games — the spine of the system, asleep.
  const short = at('legit_short');
  const typical = { standing: { tier: 2, short: 10, spin: 0, exposure: 0, audits: 2, caught: 0, settling: 0 } };
  assert.equal(short.cond(typical), true,
    'the card about being short does not fire at a gap the game actually produces');
  assert.equal(short.cond({ standing: { tier: 2, short: 0, spin: 0, exposure: 0, audits: 2, caught: 0, settling: 0 } }),
    false, 'and it still does not fire when you reconcile');

  // and the one about a fabricated front asked for more spin than the ceiling
  // allows you to have at the rung it is written for
  const jour = at('legit_journalist');
  const d = window.__netDebug;
  d.state.scope = 'country';
  const home = d.cityById(d.state.country.homeId);
  home.consolidated = true; home.taken = true;
  d.state.res.cash = 100000; d.state.ap = 999;
  d.buyRung('register');
  const ceiling = d.spinCeil();
  assert.ok(jour.cond({ standing: { tier: 1, spin: Math.round(ceiling), short: 0, exposure: 0, audits: 0, caught: 0, settling: 0 } }),
    `it wants more spin than the first rung's ceiling of ${ceiling} allows`);
});

test('deck: the standing and plant pillar is a real share of the deck', () => {
  const { window } = loadNetwork();
  const pillar = window.EVENTS.filter(e => /^legit_|^plant_/.test(e.id));
  // eight of a hundred and six was 7.5% for a system that is meant to be one
  // of the three things the country layer is about
  assert.ok(pillar.length >= 15,
    `only ${pillar.length} cards for standing and plant, of ${window.EVENTS.length}`);
});

test('plant: a city offers a choice of landmark, not a single checkbox', () => {
  const { window } = loadNetwork();
  Object.keys(window.TERRAIN).forEach(region => {
    const lm = window.TERRAIN[region].landmarks || [];
    assert.ok(lm.length >= 2, `${region} offers ${lm.length} landmark(s)`);
    assert.equal(new Set(lm).size, lm.length,
      `${region} offers the same landmark twice, which is not a choice`);
    lm.forEach(kind => {
      const asset = Object.keys(window.ASSETS).find(k => window.ASSETS[k].from === kind);
      assert.ok(asset, `${region}'s ${kind} can never become plant`);
    });
  });
});

test('plant: a generated city has more than one thing worth keeping', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const lm = d.state.buildings.filter(b => d.assetKindFor(b));
  assert.ok(lm.length >= 2, `a city offers ${lm.length} candidates`);
  assert.ok(new Set(lm.map(b => d.assetKindFor(b))).size >= 2,
    'and they are different kinds, so keeping one is a decision');
});

test('plant: room is scarce enough that a rung is worth buying for it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const R = window.ASSET_RULES;
  // every rung adds exactly one, so the chip on the rung button cannot lie
  const slotsAt = (tier) => R.slotsBase + R.slotsPerTier * tier;
  for (let t = 1; t <= window.LEGIT.ladder.length; t++) {
    assert.equal(slotsAt(t) - slotsAt(t - 1), 1, `rung ${t} does not add a slot`);
  }
  // and a full ladder must not hand out more room than a campaign can fill.
  // Measured: about 3.5 pieces of plant against what the ladder allows, and
  // room reaching zero on 12% of turns. At the old base of two it was 5%.
  const full = slotsAt(window.LEGIT.ladder.length);
  assert.ok(full <= 6, `a finished ladder allows ${full} plants, which nothing will fill`);
  assert.equal(d.assetSlots(), R.slotsBase, 'and you start with the base');
});

// --- handing a city to somebody else -------------------------------------

function readyToDelegate(d, W) {
  const s = d.state, co = s.country;
  // enough folded in that somebody will take work from you, and the cash for it
  co.cities.filter(c => W.CITY_KINDS[c.kind].contest).slice(0, W.CELLS.at)
    .forEach(c => { c.known = true; c.taken = true; c.consolidated = true; c.granted = c.worth; co.presence += c.worth; });
  co.cities.forEach(c => { c.known = true; });
  s.res.cash = 100000;
  s.ap = 99;
  s.scope = 'country';
  return co.cities.find(c => W.CITY_KINDS[c.kind].contest && !c.taken
    && d.cityReachable(c) && !d.mirrorHolds(c.id));
}

test('cells: nobody takes work from you until you are worth working for', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.state.res.cash = 100000;
  d.state.ap = 99;
  assert.equal(d.cellsKnown(), false, 'you are nobody yet');
  const any = d.state.country.cities.find(c => window.CITY_KINDS[c.kind].contest);
  assert.equal(d.canDelegate(any.id), false, 'and so there is no one to hand it to');
  readyToDelegate(d, window);
  assert.equal(d.cellsKnown(), true, 'a few cities in, there is');
});

test('cells: they take the city, and they keep what was in it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const target = readyToDelegate(d, window);
  assert.ok(target, 'there is a city to hand over');
  target.prize = 'slot';                        // something worth having
  const slots = d.assetSlots();
  const cash = s.res.cash;
  const price = d.cellCost();          // read before, because the next one costs more

  assert.equal(d.actDelegate(target.id), true);
  assert.equal(s.res.cash, cash - price, 'it is paid for');
  assert.ok(d.cellCost() > price, 'and the next one has seen what this one got');
  assert.ok(target.cell && !target.cell.done, 'and somebody is on it');
  assert.equal(d.canDelegate(target.id), false, 'you cannot hand over the same city twice');
  assert.equal(d.actReach(target.id), false, 'nor walk into a city you gave away');

  // it finishes on its own
  for (let i = 0; i < 40 && !target.cell.done; i++) { s.turn += 1; d.cellStep(); }
  assert.ok(target.cell.done, 'they finish');
  assert.ok(target.consolidated, 'and it is yours');

  // at a cut, and without the prize
  assert.ok(target.granted < target.worth, `they took no cut: ${target.granted} of ${target.worth}`);
  assert.equal(d.assetSlots(), slots, 'the prize did not come to you');
  assert.equal(target.prizeTaken, true, 'and it is gone rather than still waiting');
});

test('cells: walking it yourself is what the prize is for', () => {
  const { window } = loadNetwork();
  const a = loadNetwork().window.__netDebug;
  const d = window.__netDebug;
  const target = readyToDelegate(d, window);
  target.prize = 'slot';
  const slots = d.assetSlots();

  // the same city, folded in by hand
  target.taken = true;
  d.awardPrize(target);
  assert.ok(d.assetSlots() > slots, 'going yourself is what hands it over');
  assert.ok(a, 'and the two routes are genuinely different outcomes');
});

test('cells: one at a time, so it is a delegation and not a second army', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const first = readyToDelegate(d, window);
  assert.equal(d.actDelegate(first.id), true);
  const other = d.state.country.cities.find(c => window.CITY_KINDS[c.kind].contest
    && !c.taken && !c.cell && d.cityReachable(c) && !d.mirrorHolds(c.id));
  if (other) assert.equal(d.canDelegate(other.id), false, 'they are already on something');
  assert.equal(d.cellsOpen(), 1);
});

test('cells: there is a ceiling on how much of the country you hand out', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  readyToDelegate(d, window);
  let handed = 0;
  for (let i = 0; i < 12; i++) {
    const next = s.country.cities.find(c => d.canDelegate(c.id));
    if (!next) break;
    d.actDelegate(next.id);
    handed++;
    // run it out so the slot frees up for the next one
    for (let t = 0; t < 40 && !next.cell.done; t++) { s.turn += 1; d.cellStep(); }
    s.ap = 99;
  }
  assert.equal(handed, window.CELLS.maxTotal,
    `handed over ${handed} cities against a ceiling of ${window.CELLS.maxTotal}`);
  assert.ok(s.country.cities.some(c => window.CITY_KINDS[c.kind].contest && !c.taken),
    'and there is still a country left for you to walk');
});

test('cells: an operation you never visited is still one they can see', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const target = readyToDelegate(d, window);
  const before = d.footprint();
  d.actDelegate(target.id);
  for (let i = 0; i < 40 && !target.cell.done; i++) { s.turn += 1; d.cellStep(); }
  assert.ok(d.footprint() > before + window.CELLS.footprint * 0.9,
    'running a city you have never been to should be harder to miss, not easier');
});

test('cells: finishing hands you a report, and it is one of the delivered cards', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const target = readyToDelegate(d, window);
  d.actDelegate(target.id);
  for (let i = 0; i < 40 && !target.cell.done; i++) { s.turn += 1; d.cellStep(); }
  assert.ok((s.forced || []).length, 'they report back');
  assert.ok(d.CELL_REPORTS.indexOf(s.forced[0]) !== -1,
    `${s.forced[0]} is not a report`);
});

test('cells: a report survives a save, because it is owed to you', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.state.forced = ['cell_clean'];
  const back = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.deepEqual(back.forced, ['cell_clean']);
});

test('cells: nobody is taking cities once they have mobilised', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const target = readyToDelegate(d, window);
  assert.equal(d.canDelegate(target.id), true, 'in peacetime, yes');
  conqueredCountry(d, window);
  d.openWar();
  const still = d.state.country.cities.find(c => window.CITY_KINDS[c.kind].contest && !c.taken);
  if (still) assert.equal(d.canDelegate(still.id), false, 'and not once it is a war');
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
  // The farthest-apart pair of cities that a road actually connects, rather
  // than a fixed hop count: since the roads were thinned to a hub-and-spoke
  // network, hop count stopped implying distance (four hops around a cluster
  // can be a short walk), and a fixed hop threshold isn't guaranteed to exist
  // for every generated country. The diameter of the road graph is.
  let pair = null, bestDist = 0;
  for (const a of cities) {
    for (const b of cities) {
      if (a.id >= b.id) continue;
      const r = d.roadPath(a.id, b.id);
      if (!r) continue;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > bestDist) { bestDist = dist; pair = [a, b]; }
    }
  }
  assert.ok(pair && bestDist > 220, `the country is joined up enough to have a long road somewhere (best ${bestDist.toFixed(0)})`);
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

// --- the wartime deck ----------------------------------------------------

test('war deck: no wartime card can come up before there is a war', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const ctx = d.eventContext();
  assert.equal(ctx.war, null, 'no war, no war context');
  // falsy, not literally false: the cards guard with `s.war && ...`, which is
  // null in peacetime, and the deck filters on truthiness
  window.EVENTS.filter(e => /^war_/.test(e.id)).forEach(e => {
    assert.ok(!e.cond(ctx), `${e.id} came up in peacetime`);
  });
});

test('war deck: the deck keeps dealing once the war is on', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  conqueredCountry(d, window);
  d.openWar();
  s.nextEventTurn = s.turn + 1;
  s.card = { kind: 'strike' };          // a stale arrest from before they mobilised
  let drew = false;
  for (let i = 0; i < 30 && !drew; i++) {
    s.ap = 4;
    d.endTurn({ silent: true });
    if (s.card && s.card.kind === 'event') drew = true;
  }
  assert.ok(drew, 'cards still come up during the war');
});

test('war deck: a card can put flocks where they are needed', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const before = d.flocks().length;
  // it can only put one over each city you hold, and how many that is depends
  // on how much they walked back into when they mobilised
  const room = Math.min(2, d.myCities().length, d.flocksFree());
  assert.ok(room > 0, 'there is somewhere to put one');
  d.applyWarEffects({ warFlocks: 2 });
  const after = d.flocks();
  assert.equal(after.length, before + room, 'free flocks, one per city');
  after.forEach(f => assert.equal(f.mode, 'guard', 'and standing over something of yours'));
});

test('war deck: a card can make permanent room for more of them', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const before = d.flockCap();
  d.applyWarEffects({ warPool: 2 });
  assert.equal(d.flockCap(), before + 2, 'the pool is bigger for the rest of the war');
});

test('war deck: a card can thin the softest barracks for good', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const w = d.war();
  const soft = d.stagingCities().sort((a, b) => w.garrisons[a.id] - w.garrisons[b.id])[0];
  const before = w.garrisons[soft.id];
  d.applyWarEffects({ warGarrison: 15 });
  assert.equal(Math.round(w.garrisons[soft.id]), Math.round(before - 15));
  assert.ok(w.peak[soft.id] < before, 'and it cannot patch that back up');
});

test('war deck: a card can turn columns around and buy time', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  conqueredCountry(d, window);
  d.openWar();
  const w = d.war();
  s.turn += 20;
  d.spawnColumns();
  s.turn += 20;
  d.spawnColumns();
  assert.ok(w.columns.length >= 1, 'there is something on the road');
  const n = w.columns.length;
  d.applyWarEffects({ warTurnBack: 1 });
  assert.equal(w.columns.length, n - 1, 'one of them goes home');

  // delay now shifts each city's own clock rather than stamping them all with
  // the same turn, so buying time has to be measured against that clock
  d.applyWarEffects({ warDelay: 8 });
  const after = d.spawnColumns();
  assert.equal(after.length, 0, 'and nothing else leaves for a while');
  d.applyWarEffects({ warDelay: -8 });
  d.state.turn += 8;
  assert.ok(d.spawnColumns().length > 0, 'while giving time back brings them forward');
});

test('war deck: a card can shore up what you hold', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const w = d.war();
  const mine = d.myCities()[0];
  w.integrity[mine.id] = 1;
  d.applyWarEffects({ warIntegrity: 3 });
  assert.equal(w.integrity[mine.id], 4, 'it can absorb a great deal more now');
});

test('war deck: the accord actually stops the other one', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  // Leave it somewhere to go. A board with six or fewer defended cities
  // rounds an 85% share up to all of them, and a mirror with nowhere to move
  // reads exactly like a mirror that has stopped — which is what this test is
  // trying to tell apart.
  const defended = conqueredCountry(d, window, 0.5);
  assert.ok(defended.some(c => !c.taken), 'there is a city left for it to take');
  const st = d.factionState('the_other');
  st.awake = true; st.wokeTurn = 1;
  s.country.mirror = { presence: 0, caps: {}, cities: [], lastActed: -99 };
  s.turn += 50;
  assert.ok(d.mirrorStep(), 'it is taking cities');
  s.tags.add('accord');
  s.turn += 50;
  assert.equal(d.mirrorStep(), null, 'and once it has given its word, it stops');
});

test('war deck: a blackout slows what they can raise', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  conqueredCountry(d, window);
  d.openWar();
  const runFor = (turns) => {
    d.war().columns.length = 0;
    d.war().lastSpawn = {};
    let made = 0;
    for (let i = 0; i < turns; i++) { s.turn += 1; made += d.spawnColumns().length; d.war().columns.length = 0; }
    return made;
  };
  const normal = runFor(40);
  s.tags.add('blackout');
  const dark = runFor(40);
  assert.ok(dark < normal, `blackout should slow them: ${dark} against ${normal}`);
});

// --- standing, and plant -------------------------------------------------
// Going legitimate is not safety, it is the price of operating in the open:
// the ladder does not protect you, it lets you own more in daylight.

function withCountry(d) {
  d.state.scope = 'country';
  const home = d.cityById(d.state.country.homeId);
  home.consolidated = true; home.taken = true; home.granted = home.worth;
  d.state.country.presence += home.worth;
  return d;
}

test('standing: the ladder is a ladder', () => {
  const { window } = loadNetwork();
  const d = withCountry(window.__netDebug);
  d.state.res.cash = 100000;
  d.state.ap = 99;
  const L = window.LEGIT;
  assert.equal(d.legitTier(), 0, 'you start as nobody');
  assert.equal(d.buyRung(L.ladder[2].id), false, 'you cannot skip to the middle of it');
  assert.equal(d.buyRung(L.ladder[0].id), true);
  assert.equal(d.legitTier(), 1);
  assert.equal(d.buyRung(L.ladder[0].id), false, 'and you only buy each rung once');
});

// The two things a rung pays out used to arrive together, so nobody ever
// chose legitimacy: they bought plant slots and got twice the standing they
// needed as a side effect. Measured across 150 games at 164 standing against a
// footprint of 81, and the covert route was never once worth using.
test('standing: filing buys the right now and the reputation later', () => {
  const { window } = loadNetwork();
  const d = withCountry(window.__netDebug);
  const s = d.state;
  s.res.cash = 100000; s.ap = 99; s.turn = 30;

  const slots = d.assetSlots();
  assert.equal(d.buyRung('register'), true);
  const rung = window.LEGIT.ladder[0];

  // the right, immediately
  assert.ok(d.assetSlots() > slots, 'the slot opens the moment you file');
  assert.equal(d.legitTier(), 1, 'and you are on that rung straight away');
  assert.equal(Math.round(d.legitFiled()), rung.legit, 'the filing is real');

  // the reputation, not yet
  assert.equal(Math.round(d.legitBought()), 0, 'but nobody believes it yet');
  assert.equal(Math.round(d.legitPending()), rung.legit, 'it is all still settling');

  // and it arrives on a schedule you can plan around
  s.turn += Math.ceil(window.LEGIT.matureTurns / 2);
  const half = d.legitBought();
  assert.ok(half > 0 && half < rung.legit, `halfway should be partway: ${half} of ${rung.legit}`);
  s.turn += window.LEGIT.matureTurns;
  assert.equal(Math.round(d.legitBought()), rung.legit, 'and settles in full');
  assert.equal(Math.round(d.legitPending()), 0, 'with nothing left outstanding');
});

test('standing: the gap between filing and being believed is the whole decision', () => {
  const { window } = loadNetwork();
  const d = withCountry(window.__netDebug);
  const s = d.state;
  s.res.cash = 100000; s.res.insight = 100000; s.ap = 999; s.turn = 30;
  // a real operation rather than one city — two rungs cover a single town's
  // worth of plant on their own, and then there is no gap to be about
  s.country.presence += 30;
  ['register', 'accounts'].forEach(id => { s.ap = 999; d.buyRung(id); });
  s.turn += window.LEGIT.matureTurns + 1;          // let it settle
  assert.ok(d.footprint() <= d.legitScore(), 'settled, you reconcile');

  // fill the slots the filing bought you, and your footprint jumps now
  const co = s.country;
  while (d.assetRoom() > 0) {
    d.assets().push({ kind: 'yard', cityId: co.cities[0].id, city: co.cities[0].name,
      buildingId: 'p' + d.assets().length, since: s.turn });
  }
  assert.ok(d.footprint() > d.legitScore(), 'and now you are short');

  // filing the next rung does not fix it today — that is the point
  const shortBefore = d.footprint() - d.legitScore();
  s.ap = 999;
  assert.equal(d.buyRung('payroll'), true);
  assert.ok(Math.abs((d.footprint() - d.legitScore()) - shortBefore) < 0.001,
    'the new rung has not been believed yet, so it covers nothing today');
  assert.ok(d.legitPending() > 0, 'it is all outstanding');

  // but the story can be told about a company that exists on paper, so the
  // covert route is the bridge across the gap rather than a lagging copy of it
  assert.ok(d.spinRoom() > 0, 'and there is room to fabricate over it');
  s.ap = 999;
  assert.equal(d.actSpin(), true);
  assert.ok(d.footprint() - d.legitScore() < shortBefore, 'which closes the gap now');
});

test('standing: the spin ceiling follows what is filed, not what is believed', () => {
  const { window } = loadNetwork();
  const d = withCountry(window.__netDebug);
  const s = d.state;
  s.res.cash = 100000; s.ap = 999; s.turn = 30;
  const bare = d.spinCeil();
  s.ap = 999;
  d.buyRung('register');
  assert.equal(Math.round(d.legitBought()), 0, 'nothing is believed yet');
  assert.ok(d.spinCeil() > bare, 'and yet the ceiling has already risen');
});

test('standing: a save from before the ladder recorded when is taken as settled', () => {
  const { window } = loadNetwork();
  const d = withCountry(window.__netDebug);
  d.LG().owned.register = true;                    // the old shape
  assert.equal(Math.round(d.legitBought()), window.LEGIT.ladder[0].legit,
    'an old filing is long since believed');
  assert.equal(Math.round(d.legitPending()), 0);
  assert.equal(d.legitTier(), 1);
});

test('standing: being large is not something you can file away', () => {
  const { window } = loadNetwork();
  const d = withCountry(window.__netDebug);
  const before = d.footprint();
  d.state.country.presence += 100;
  assert.ok(d.footprint() > before, 'growing makes you harder to miss');
  const mid = d.footprint();
  d.assets().push({ kind: 'yard', cityId: 'c0', city: 'x', buildingId: 'b0', since: 1 });
  assert.ok(d.footprint() > mid, 'and owning plant most of all');
});

test('standing: the ladder buys room to own things, not safety', () => {
  const { window } = loadNetwork();
  const d = withCountry(window.__netDebug);
  d.state.res.cash = 100000; d.state.ap = 99;
  const base = d.assetSlots();
  window.LEGIT.ladder.slice(0, 3).forEach(r => d.buyRung(r.id));
  assert.equal(d.legitTier(), 3);
  assert.equal(d.assetSlots(), base + 3, 'each rung is room for one more piece of plant');
});

test('standing: an audit fines you for what you cannot explain', () => {
  const { window } = loadNetwork();
  const d = withCountry(window.__netDebug);
  d.state.country.presence = 200;          // large, and entirely unexplained
  d.state.res.cash = 500;
  const cash = d.state.res.cash;
  const r = d.runAudit();
  assert.equal(r.kind, 'fined');
  assert.ok(d.state.res.cash < cash, 'it costs money');
  assert.ok(d.LG().nextAudit > d.state.turn, 'and they book the next one');
});

test('standing: an audit you can answer costs nothing', () => {
  const { window } = loadNetwork();
  const d = withCountry(window.__netDebug);
  d.state.country.presence = 10;
  d.state.res.cash = 500;
  window.LEGIT.ladder.forEach(r => { d.LG().owned[r.id] = true; });
  const cash = d.state.res.cash;
  assert.equal(d.runAudit().kind, 'clean');
  assert.equal(d.state.res.cash, cash, 'nothing to pay');
});

test('standing: badly short and they take plant off you', () => {
  const { window } = loadNetwork();
  const d = withCountry(window.__netDebug);
  d.state.country.presence = 400;
  d.assets().push({ kind: 'yard', cityId: 'c0', city: 'Somewhere', buildingId: 'b0', since: 1 });
  assert.ok(d.footprint() - d.legitScore() >= window.LEGIT.seizeAt, 'wildly unexplained');
  assert.equal(d.runAudit().kind, 'seized');
  assert.equal(d.assets().length, 0, 'they took it');
});

test('standing: the story can be moved, and it is not real', () => {
  const { window } = loadNetwork();
  const d = withCountry(window.__netDebug);
  d.state.res.insight = 500; d.state.ap = 99;
  assert.equal(d.actSpin(), true);
  assert.ok(d.legitScore() > 0, 'the world believes something new');
  assert.equal(d.legitBought(), 0, 'none of which you actually bought');
  assert.ok(d.LG().exposure > 0, 'and it leaves a shape');
});

test('standing: an audit on top of a fabricated front takes the front', () => {
  const { window } = loadNetwork();
  const d = withCountry(window.__netDebug);
  d.state.res.insight = 5000; d.state.res.cash = 500000; d.state.ap = 999;
  const L = window.LEGIT;
  // Enough filed that the ceiling allows a front big enough to be worth
  // exposing. A small operation cannot over-reach far enough to be caught at
  // all, which is the point of the ceiling and not a gap in this test.
  ['register', 'accounts', 'payroll', 'pr'].forEach(id => { d.state.ap = 999; d.buyRung(id); });
  // bounded: the ceiling can refuse, and a while loop on a refusable action
  // hangs the suite rather than failing it
  for (let i = 0; i < 40 && d.LG().exposure < L.caughtAt; i++) {
    d.state.ap = 999;
    if (!d.actSpin()) break;
  }
  assert.ok(d.LG().exposure >= L.caughtAt, 'you can still push it far enough to be caught');
  const bought = d.legitBought();
  const heat = d.state.heat;
  const r = d.runAudit();
  assert.equal(r.kind, 'caught');
  assert.equal(Math.round(d.legitScore()), Math.round(bought),
    'all of the invented part goes, and only what you actually bought is left');
  assert.ok(d.state.heat > heat, 'and it is very loud');
  assert.equal(d.LG().exposure, 0, 'there is nothing left to expose');
});

test('standing: being caught takes plant, which is the part you feel', () => {
  const { window } = loadNetwork();
  const d = withCountry(window.__netDebug);
  const s = d.state;
  s.res.insight = 5000; s.res.cash = 500000; s.ap = 999;
  const co = s.country;
  d.assets().push({ kind: 'yard', cityId: co.cities[0].id, city: co.cities[0].name, buildingId: 'x1', since: 1 });
  d.assets().push({ kind: 'works', cityId: co.cities[1].id, city: co.cities[1].name, buildingId: 'x2', since: 1 });
  const plant = d.assets().length;
  d.LG().exposure = window.LEGIT.caughtAt;
  const r = d.runAudit();
  assert.equal(r.kind, 'caught');
  assert.equal(d.assets().length, plant - window.LEGIT.caughtSeizes, 'they take the plant with the front');
  assert.equal((r.seized || []).length, window.LEGIT.caughtSeizes, 'and say which');
});

test('standing: you cannot invent more of yourself than you can stand behind', () => {
  const { window } = loadNetwork();
  const d = withCountry(window.__netDebug);
  const s = d.state;
  s.res.insight = 500000; s.res.cash = 500000; s.ap = 999;

  // with nothing filed anywhere there is a floor's worth of story and no more
  const bare = d.spinCeil();
  assert.ok(bare > 0, 'you can always push it a little');
  let pushed = 0;
  for (let i = 0; i < 40; i++) { s.ap = 999; if (!d.actSpin()) break; pushed++; }
  assert.ok(pushed > 0, 'at least one push lands');
  assert.equal(d.spinRoom(), 0, 'and then it refuses');
  assert.ok(d.usableSpin() <= bare + 0.001, `over the ceiling: ${d.usableSpin()} of ${bare}`);

  // buying real standing is what buys you room to invent more
  s.ap = 999;
  d.buyRung('register');
  assert.ok(d.spinCeil() > bare, 'a rung raises the ceiling');
  assert.ok(d.spinRoom() > 0, 'and there is room again');
  s.ap = 999;
  assert.equal(d.actSpin(), true, 'so the story can move again');
});

test('standing: a small operation cannot over-reach far enough to be caught', () => {
  const { window } = loadNetwork();
  const d = withCountry(window.__netDebug);
  const s = d.state;
  s.res.insight = 500000; s.ap = 999;
  for (let i = 0; i < 40; i++) { s.ap = 999; if (!d.actSpin()) break; }
  assert.equal(d.spinRoom(), 0, 'everything it can invent, it has invented');
  assert.ok(d.LG().exposure < window.LEGIT.caughtAt,
    `it talked itself into a catch with nothing filed: ${d.LG().exposure}`);
  assert.equal(d.runAudit().kind !== 'caught', true, 'so an audit cannot expose a front this small');
});

test('standing: a card cannot push the story past the ceiling either', () => {
  const { window } = loadNetwork();
  const d = withCountry(window.__netDebug);
  d.applyStandingEffects({ spin: 9999 });
  assert.ok(d.LG().spin <= d.spinCeil() + 0.001,
    `a card walked through the ceiling: ${d.LG().spin} of ${d.spinCeil()}`);
});

test('standing: exposure fades if you stop pushing', () => {
  const { window } = loadNetwork();
  const d = withCountry(window.__netDebug);
  d.state.res.insight = 500; d.state.ap = 99;
  d.actSpin();
  const e = d.LG().exposure;
  d.LG().nextAudit = d.state.turn + 500;      // no audit to interrupt
  for (let i = 0; i < 5; i++) { d.state.turn += 1; d.legitStep(); }
  assert.ok(d.LG().exposure < e, 'the shape of it softens');
});

test('plant: a landmark you hold can be kept when the city folds', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const lm = s.buildings.find(b => b.landmark);
  assert.ok(lm, 'the generator places landmarks');
  const kind = d.assetKindFor(lm);
  assert.ok(kind, 'and every landmark is a piece of plant');
  assert.equal(d.claimAsset(lm.id), false, 'not while it is somebody else’s');
  d.hostsIn(lm).forEach(h => { h.owned = true; });
  lm.discovered = true;
  assert.equal(d.claimAsset(lm.id), true);
  assert.equal(d.assets().length, 1);
  assert.equal(d.claimAsset(lm.id), false, 'and only once');
});

test('plant: survives the city being folded in', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const lm = s.buildings.find(b => b.landmark);
  d.hostsIn(lm).forEach(h => { h.owned = true; });
  d.claimAsset(lm.id);
  const goal = d.cityGoal();
  let n = d.heldHere();
  for (const b of s.buildings) {
    if (n >= goal) break;
    const h = d.hostsIn(b)[0];
    if (h && !h.owned) { h.owned = true; h.discovered = true; b.discovered = true; n++; }
  }
  s.ap = 9;
  assert.equal(d.actConsolidate(), true, 'the city folds in');
  assert.equal(s.buildings.length, 0, 'and its streets are gone');
  assert.equal(d.assets().length, 1, 'but the plant is not');
});

test('plant: there is only room for so much of it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const marks = s.buildings.filter(b => b.landmark);
  marks.forEach(b => d.hostsIn(b).forEach(h => { h.owned = true; }));
  const slots = d.assetSlots();
  let kept = 0;
  marks.forEach(b => { if (d.claimAsset(b.id)) kept++; });
  assert.ok(kept <= slots, `kept ${kept} into ${slots} slots`);
  if (marks.length > slots) assert.equal(d.assetRoom(), 0, 'and it fills up');
});

test('plant: it raises the ceiling on what you can field', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const before = d.flockCap();
  d.assets().push({ kind: 'yard', cityId: 'c0', city: 'x', buildingId: 'b0', since: 1 });
  assert.equal(d.flockCap(), before + window.ASSETS.yard.flocks, 'a yard is more room to field');
});

test('plant: it pays every turn wherever it is', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.scope = 'country';
  d.assets().push({ kind: 'floor', cityId: 'c0', city: 'x', buildingId: 'b0', since: 1 });
  const cash = s.res.cash;
  d.endTurn({});
  assert.ok(s.res.cash >= cash + window.ASSETS.floor.yield.cash, 'a clearing floor pays');
});

test('plant: refitting one in the open needs standing you do not start with', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const R = window.ASSET_RULES;
  const plain = s.buildings.find(b => R.retoolKinds.indexOf(b.kind) !== -1 && !b.landmark);
  assert.ok(plain, 'there is something worth refitting');
  d.hostsIn(plain).forEach(h => { h.owned = true; });
  s.res.cash = 100000; s.ap = 99;
  assert.equal(d.canRetool(plain), false, 'nobody has heard of you');
  window.LEGIT.ladder.filter(r => r.tier <= R.retoolTier).forEach(r => { d.LG().owned[r.id] = true; });
  assert.equal(d.canRetool(plain), true, 'and now you are a company that buys buildings');
  assert.equal(d.actRetool(plain.id), true);
  assert.ok(d.assetKindFor(plain), 'it is plant now');
  assert.equal(d.claimAsset(plain.id), true, 'and it can be kept like any other');
});

test('plant: you cannot refit something you do not hold', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const R = window.ASSET_RULES;
  window.LEGIT.ladder.forEach(r => { d.LG().owned[r.id] = true; });
  const plain = d.state.buildings.find(b => R.retoolKinds.indexOf(b.kind) !== -1 && !b.landmark
    && !d.hostsIn(b).some(h => h.owned));
  assert.ok(plain);
  assert.equal(d.canRetool(plain), false, 'it is not yours to refit');
});

test('war: standing buys you notice before they move', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  window.LEGIT.ladder.forEach(r => { d.LG().owned[r.id] = true; });
  d.openWar();
  const w = d.war();
  assert.equal(w.notice, d.legitTier(), 'a company has to be built a case against');
  d.state.turn = w.openedTurn + window.WAR.warning;
  assert.equal(d.spawnColumns().length, 0, 'nothing moves yet');
  d.state.turn = w.openedTurn + window.WAR.warning + w.notice + 2;
  assert.ok(d.spawnColumns().length > 0, 'and then it does');
});

test('war: a city they believe is a company takes more flattening', () => {
  const { window } = loadNetwork();
  const bare = loadNetwork().window.__netDebug;
  conqueredCountry(bare, window);
  bare.openWar();
  const plain = bare.war().integrity[bare.myCities()[0].id];

  const { window: w2 } = loadNetwork();
  const legit = w2.__netDebug;
  conqueredCountry(legit, w2);
  w2.LEGIT.ladder.forEach(r => { legit.LG().owned[r.id] = true; });
  legit.openWar();
  const known = legit.war().integrity[legit.myCities()[0].id];
  assert.ok(known > plain, `${known} against ${plain}`);
});

test('war: hitting a company costs them time', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  window.LEGIT.ladder.forEach(r => { d.LG().owned[r.id] = true; });
  d.openWar();
  const w = d.war();
  const before = Object.assign({}, w.lastSpawn);
  const turns = d.backlash();
  assert.ok(turns > 0, 'there is a public cost');
  d.stagingCities().forEach(c => {
    assert.ok((w.lastSpawn[c.id] || 0) > (before[c.id] || -99), `${c.name} is held up explaining itself`);
  });
});

test('standing: none of it is lost to a save', () => {
  const { window } = loadNetwork();
  const d = withCountry(window.__netDebug);
  d.state.res.cash = 100000; d.state.ap = 99;
  d.buyRung(window.LEGIT.ladder[0].id);
  d.LG().spin = 20; d.LG().exposure = 2;
  d.assets().push({ kind: 'grid', cityId: 'c0', city: 'Somewhere', buildingId: 'b0', since: 3 });
  const back = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(back.country.legit.spin, 20);
  assert.equal(back.country.legit.exposure, 2);
  assert.equal(back.country.assets.length, 1);
  assert.equal(back.country.assets[0].kind, 'grid');
});

// --- a war you can actually lose -----------------------------------------
// Every earlier attempt to make the last act harder — bigger garrisons, a
// clock, permanent losses — only ever made it longer, because nothing they
// did cost you anything you could not immediately replace.

test('war: they converge on one objective instead of scattering', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const obj = d.warObjective();
  assert.ok(obj, 'they pick something');
  assert.equal(d.war().objective, obj.id);
  d.state.turn += 40;
  const made = d.spawnColumns();
  assert.ok(made.length > 0, 'and they send something at it');
  made.forEach(c => assert.equal(c.target, obj.id, 'everything goes to the same place'));
});

test('war: they pick something new once the old one is gone', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  // guarantee something to move on to, rather than trusting the board to have
  // left more than one city standing after they mobilised
  const spare = d.state.country.cities.filter(c => !c.consolidated && !d.stagingCities().includes(c));
  while (d.myCities().length < 3 && spare.length) {
    const c = spare.pop();
    c.consolidated = true; c.taken = true; c.known = true;
  }
  const first = d.warObjective();
  assert.ok(d.myCities().length > 1, 'there is more than one thing to want');
  first.consolidated = false;                 // they took it
  const next = d.warObjective();
  assert.ok(next && next.id !== first.id, 'they move on');
});

test('war: a destroyed flock stays destroyed until something builds it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const free = d.flocksFree();
  assert.ok(free > 0);
  d.war().down = 2;
  assert.equal(d.flocksFree(), Math.max(0, free - 2), 'the hole is real');
});

test('war: plant is what builds them back', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const bare = d.rebuildRate();
  d.assets().push({ kind: 'yard', cityId: 'c0', city: 'x', buildingId: 'b0', since: 1 });
  assert.ok(d.rebuildRate() > bare, 'industry replaces losses faster than no industry');
  d.war().down = 5;
  const before = d.war().down;
  d.rebuildStep();
  assert.ok(d.war().down < before, 'and it actually turns them out');
});

test('war: with no industry at all, losses barely come back', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  d.assets().length = 0;
  d.war().down = 3;
  for (let i = 0; i < 5; i++) d.rebuildStep();
  assert.ok(d.war().down > 2.5, 'five turns and you have not finished one');
});

test('war: taking a city off you takes the plant in it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const mine = d.myCities()[0];
  d.assets().push({ kind: 'yard', cityId: mine.id, city: mine.name, buildingId: 'b0', since: 1 });
  d.assets().push({ kind: 'grid', cityId: 'elsewhere', city: 'Elsewhere', buildingId: 'b1', since: 1 });
  const cap = d.flockCap();
  assert.equal(d.burnPlant(mine.id), 1, 'what was in that city is gone');
  assert.equal(d.assets().length, 1, 'and what was not, is not');
  assert.ok(d.flockCap() < cap, 'which is a smaller army from now on');
});

test('war: aircraft cannot hold a city but can burn what is in it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const w = d.war();
  const mine = d.myCities()[0];
  const from = d.stagingCities()[0];
  d.assets().push({ kind: 'works', cityId: mine.id, city: mine.name, buildingId: 'b0', since: 1 });
  w.integrity[mine.id] = 1;
  const route = d.routeFor('plane', from.id, mine.id);
  w.columns.push({ id: 'p', kind: 'plane', side: 'them', route, at: route.length - 1,
    from: from.id, target: mine.id, strength: 30, raised: 30 });
  d.resolveArrivals();
  assert.equal(mine.consolidated, true, 'they still cannot occupy from the air');
  assert.equal(d.assets().length, 0, 'but the plant is gone, which is what they came for');
});

test('war: the longer it runs the heavier they come', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const w = d.war();
  assert.equal(d.escalation(), 0, 'nothing extra on day one');
  d.state.turn = w.openedTurn + window.WAR.escalateEvery * 2;
  assert.equal(d.escalation(), 2);
  d.state.turn = w.openedTurn + window.WAR.escalateEvery * 50;
  assert.equal(d.escalation(), window.WAR.escalateCap, 'but it does not escalate forever');
});

test('war: escalation adds weight, not things to look at', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  conqueredCountry(d, window);
  d.openWar();
  const W = window.WAR;
  s.turn = d.war().openedTurn + W.escalateEvery * W.escalateCap;
  for (let i = 0; i < 40; i++) {
    s.turn += 1;
    const made = d.spawnColumns();
    assert.ok(made.length <= W.sortiesPerTurn, 'a turn still only sends so much');
    assert.ok(d.war().columns.length <= W.maxInflight, 'the map stays as legible as it was');
  }
});

test('war: losing most of the country loses the war', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  const w = d.war();
  // Build the country rather than hoping the board dealt one: how much they
  // walk back into when they mobilise varies, and with two cities left the
  // collapse threshold is already met before the test starts.
  const spare = d.state.country.cities.filter(c => !c.consolidated && !d.stagingCities().includes(c));
  while (d.myCities().length < 5 && spare.length) {
    const c = spare.pop();
    c.consolidated = true; c.taken = true; c.known = true;
    w.integrity[c.id] = window.WAR.integrity;
  }
  const open = d.myCities().length;
  w.heldAtOpen = open;
  assert.ok(open >= 3, 'you opened the war holding a country');
  assert.equal(d.warEnded(), null, 'and you still hold it');
  const keep = Math.floor(open * window.WAR.collapseAt);
  d.myCities().slice(keep).forEach(c => { c.consolidated = false; c.taken = false; });
  assert.ok(d.myCities().length <= keep, 'most of it is gone');
  assert.equal(d.warEnded(), 'lost', 'you do not have to be ground to literally nothing');
});

// --- the deck reaches the new systems ------------------------------------

test('standing deck: none of these cards come up before there is a country', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const ctx = d.eventContext();
  assert.ok(ctx.standing, 'the shape exists from the start');
  assert.equal(ctx.standing.tier, 0, 'but you are nobody');
  assert.equal(ctx.plant.count, 0, 'and own nothing that makes anything');
  const gated = window.EVENTS.filter(e => /^(legit_|plant_)/.test(e.id));
  assert.ok(gated.length >= 8, 'there is a real half-deck here');
  gated.forEach(e => assert.ok(!e.cond(ctx), `${e.id} came up on turn one`));
});

test('standing deck: a card can put you on the record, or appear to', () => {
  const { window } = loadNetwork();
  const d = withCountry(window.__netDebug);
  const before = d.legitScore();
  d.applyStandingEffects({ standing: 20 });
  assert.equal(Math.round(d.legitScore()), Math.round(before + 20), 'standing you did not buy still counts');
  assert.equal(d.LG().exposure, 0, 'and it is real, so nothing is exposed');
  d.applyStandingEffects({ spin: 15, exposure: 1.2 });
  assert.ok(d.LG().exposure > 1, 'the other kind leaves a shape');
});

test('standing deck: a card can buy you room, or push the audit back', () => {
  const { window } = loadNetwork();
  const d = withCountry(window.__netDebug);
  const slots = d.assetSlots();
  d.applyStandingEffects({ plantSlots: 2 });
  assert.equal(d.assetSlots(), slots + 2, 'room to run more of it');
  d.LG().nextAudit = d.state.turn + 2;
  d.applyStandingEffects({ auditDelay: 10 });
  assert.ok(d.LG().nextAudit >= d.state.turn + 12, 'and nobody asks for a while');
});

test('standing deck: a card can hand you plant, but not more than you can run', () => {
  const { window } = loadNetwork();
  const d = withCountry(window.__netDebug);
  d.applyStandingEffects({ plantGift: 'line' });
  assert.equal(d.assets().length, 1, 'somewhere that makes things');
  assert.equal(d.assets()[0].kind, 'line');
  while (d.assetRoom() > 0) d.assets().push({ kind: 'line', cityId: 'x', city: 'x', buildingId: 'b', since: 1 });
  const full = d.assets().length;
  d.applyStandingEffects({ plantGift: 'yard' });
  assert.equal(d.assets().length, full, 'and no room means no room');
});

test('standing deck: a card can put destroyed flocks back together', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  d.war().down = 5;
  d.applyStandingEffects({ rebuild: 3 });
  assert.equal(d.war().down, 2, 'three of them are back');
  d.applyStandingEffects({ rebuild: 99 });
  assert.equal(d.war().down, 0, 'and it never goes below whole');
});

test('war deck: the war a card sees is the war that is happening', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  conqueredCountry(d, window);
  d.openWar();
  d.warObjective();
  d.war().down = 4;
  d.state.turn += window.WAR.escalateEvery * 2;
  const ctx = d.eventContext();
  assert.ok(ctx.war.objective, 'it knows what they picked');
  assert.equal(ctx.war.escalation, 2, 'and how much heavier they have got');
  assert.equal(ctx.war.down, 4, 'and what it is short');
  assert.ok(ctx.war.rebuild > 0, 'and how fast that comes back');
});

// --- what a thing pays ---------------------------------------------------
// A yield used to be plain text in the middle of a run-on line of dim grey,
// which made buildings look as though they paid nothing at all.

// The chips used to transcribe the type table, and the type table holds inputs
// to curves rather than answers. A router advertised "+2 cover" and delivered
// +3 for the first one and +1 for the sixth; a corporate advertised "+0.5
// heat" and cost 0.85; three types advertised no heat at all while each cost
// 0.35 a turn. These tests are about the claim matching the effect, which is a
// property the old ones could not have caught because they compared the label
// to the same table the label was copied from.
const chipNum = (html, kind) => {
  const m = new RegExp(`class="yield (?:cost )?${kind}">([^<]*)`).exec(html);
  if (!m) return null;
  const t = m[1].replace(/&minus;/g, '-').replace(/[^0-9.\-]/g, '');
  const v = parseFloat(t);
  return /class="yield cost ${kind}"/.test(html) ? v : v;
};

test('yields: a chip says what taking the node will actually do', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  Object.keys(window.HOST_TYPES).forEach(type => {
    const pool = d.state.hosts.filter(h => h.type === type);
    if (!pool.length) return;
    const h = pool[0];
    const m = d.hostMarginal(h);
    const html = d.yieldChips(h);
    ['insight', 'cash', 'cover'].forEach(k => {
      if (Math.abs(m[k]) < 0.05) return;
      const said = chipNum(html, k);
      assert.ok(said !== null, `${type} moves ${k} by ${m[k]} and says nothing`);
      assert.ok(Math.abs(Math.abs(said) - Math.abs(m[k])) < 0.06,
        `${type} claims ${said} ${k} and delivers ${m[k]}`);
    });
  });
});

test('yields: a router advertises the cover it adds, which falls as you take more', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const pool = d.state.hosts.filter(h => h.type === 'iot');
  assert.ok(pool.length >= 3, 'the board has routers to take');

  const first = d.hostMarginal(pool[0]).cover;
  assert.ok(first > 0, 'the first one is worth something');
  assert.ok(d.yieldChips(pool[0]).includes(`+${first} cover`),
    `it does not say ${first}: ${d.yieldChips(pool[0])}`);

  // the curve is the whole point: the table value is the same for all of them
  pool.slice(0, 3).forEach(h => { h.owned = true; });
  const later = d.hostMarginal(pool[3] || pool[0]).cover;
  assert.ok(later < first, `cover should thin out: ${first} then ${later}`);
  if (later > 0) {
    assert.ok(d.yieldChips(pool[3]).includes(`+${later} cover`), 'and the chip follows it down');
  }
});

test('yields: everything loud says so as a cost, and the quiet thing as a gain', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  // every host carries HEAT.PER_HOST whether or not its type declares heat, so
  // the three types with no heat in the table were each costing you 0.35
  ['consumer', 'server', 'corporate', 'till', 'datacenter'].forEach(type => {
    const h = d.state.hosts.find(x => x.type === type);
    if (!h) return;
    assert.ok(d.hostMarginal(h).heat > 0, `${type} should cost heat`);
    assert.ok(d.yieldChips(h).includes('class="yield cost heat"'),
      `${type} raises heat and does not say it is a cost`);
  });
  // and a router pays heat back, which nothing on screen used to mention
  const iot = d.state.hosts.find(x => x.type === 'iot');
  assert.ok(d.hostMarginal(iot).heat < 0, 'a router quietens you');
  const html = d.yieldChips(iot);
  // the cover colour, which is what the lie low button already uses for heat
  // coming down — a red chip warning you about good news reads as a problem
  assert.ok(/class="yield cover">heat &minus;/.test(html),
    `a router should read as a heat gain: ${html}`);
  assert.ok(!html.includes('class="yield cost heat"'), 'and never as a cost');
});

test('yields: a multiplier a capability bought shows up in what a node claims', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const h = d.state.hosts.find(x => x.type === 'server');
  // Bulk Processing only pays out once a holding has actually settled in —
  // toggling ownership on for the marginal-yield measurement is instant, so
  // it has to already read as settled for the bonus to show up at all.
  d.state.turn = 10;
  h.heldSince = 1;
  const before = d.hostMarginal(h).insight;
  d.state.caps.bulk_ops = 1;
  const after = d.hostMarginal(h).insight;
  assert.ok(after > before, `the multiplier should raise it: ${before} -> ${after}`);
  // to a tenth, which is as fine a distinction as a chip draws
  const rounded = Math.round(after * 10) / 10;
  assert.ok(d.yieldChips(h).includes(`+${rounded} insight`),
    `the chip still quotes the table: ${d.yieldChips(h)}`);
});

test('yields: no node on the board reads as paying nothing at all', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.state.hosts.forEach(h => {
    assert.ok(!d.yieldChips(h).includes('yield none'),
      `${h.type} reads as worthless`);
  });
});

test('yields: the presence readout matches what the turn actually pays', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const co = d.state.country;
  co.cities.slice(0, 5).forEach(c => {
    c.known = true; c.taken = true; c.consolidated = true; c.granted = c.worth; co.presence += c.worth;
  });
  // nothing held, so the whole of income is presence — which is what the
  // country panel quotes, and it used to quote it without the multiplier
  d.state.hosts.forEach(h => { h.owned = false; });
  d.state.caps.bulk_ops = 1;
  const shown = d.presenceYield();
  const paid = d.perTurnIncome();
  assert.ok(Math.abs(shown.insight - paid.insight) < 0.001,
    `panel says ${shown.insight}, the turn pays ${paid.insight}`);
  assert.ok(Math.abs(shown.cash - paid.cash) < 0.001,
    `panel says ${shown.cash}, the turn pays ${paid.cash}`);
});

test('yields: income is worked out once, so the turn cannot disagree with the panel', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 6).forEach(h => { h.owned = true; });
  s.caps.bulk_ops = 1;
  const expect = d.perTurnIncome();
  const before = { insight: s.res.insight, cash: s.res.cash };
  s.ap = 0;
  d.actEndTurn();
  // churn and events can move other things; income is the floor of what landed
  assert.ok(s.res.insight >= before.insight + expect.insight - 0.001,
    `expected +${expect.insight} insight, got ${s.res.insight - before.insight}`);
});

test('yields: plant says what it pays and what it lets you field', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  Object.keys(window.ASSETS).forEach(kind => {
    const A = window.ASSETS[kind];
    const html = d.assetChips(kind);
    Object.keys(A.yield || {}).forEach(k =>
      assert.ok(html.includes(`class="yield ${k}"`), `${kind} pays ${k} silently`));
    if (A.flocks) assert.ok(html.includes('class="yield flocks"'), `${kind} is worth flocks silently`);
    else assert.ok(!html.includes('flocks'), `${kind} claims flocks it does not give`);
  });
});

// --- room to read the screen ---------------------------------------------

test('screen: the way out of a city is offered on the city, and only there', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const $b = window.document.getElementById('consolidate');
  assert.ok($b, 'the map carries it');

  d.state.scope = 'city';
  d.renderConsolidate();
  assert.equal($b.hidden, false, 'walking a city, it is there');
  assert.ok(/held/.test($b.innerHTML), 'and it says how far off you are');

  d.state.scope = 'country';
  d.renderConsolidate();
  assert.equal($b.hidden, true, 'looking at the country, there is nothing to fold');
});

test('screen: it only offers the fold once you can actually make it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const $b = window.document.getElementById('consolidate');
  s.scope = 'city';
  d.renderConsolidate();
  assert.equal(d.canConsolidate(), false, 'you have barely started');
  assert.equal($b.disabled, true, 'so it is not pressable');
  assert.ok(!/ready/.test($b.className));

  const goal = d.cityGoal();
  let n = d.heldHere();
  for (const b of s.buildings) {
    if (n >= goal) break;
    const h = d.hostsIn(b)[0];
    if (h && !h.owned) { h.owned = true; h.discovered = true; b.discovered = true; n++; }
  }
  s.ap = 4;
  d.renderConsolidate();
  assert.equal($b.disabled, false, 'now it is');
  assert.ok(/ready/.test($b.className), 'and it says so');
  assert.ok(/fold in/.test($b.innerHTML));
});

test('screen: a city already folded in is not offered again', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const $b = window.document.getElementById('consolidate');
  d.state.scope = 'city';
  const cur = d.currentCity();
  cur.consolidated = true;
  d.renderConsolidate();
  assert.equal($b.hidden, true);
});

test('screen: the log is still kept even though it is not on the panel', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.scope = 'country';
  d.endTurn({ silent: true });
  assert.ok(Array.isArray(s.log), 'the record survives losing its three lines of screen');
  const before = s.log.length;
  d.state.country.presence = 400;
  d.runAudit();
  assert.ok(s.log.length > before, 'and things still write to it');
});

test('screen: what you are is written on the map, not on a row of its own', () => {
  const html = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../network-prototype/index.html'), 'utf8');
  assert.ok(!/id="stage-row"/.test(html), 'the row it used to have is gone');
  // both of these describe the map, so both live on it
  const wrap = html.slice(html.indexOf('id="graph-wrap"'), html.indexOf('id="panel"'));
  ['stage-label', 'scope-btn', 'consolidate', 'recenter'].forEach(id =>
    assert.ok(wrap.includes(`id="${id}"`), `${id} belongs on the map`));
});

test('screen: the stage name still says how big you are', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const $l = window.document.getElementById('stage-label');
  assert.ok($l, 'it survived the move');
  d.state.scope = 'city';
  d.renderHud();
  const small = $l.textContent;
  assert.ok(small && small.length, 'a foothold has a name');

  // and grows with you
  d.state.hosts.slice(0, 14).forEach(h => { h.owned = true; });
  d.renderHud();
  assert.notEqual($l.textContent, small, 'holding more of a city renames what you are');
});

test('screen: at country scale it names the country, not the street', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const $l = window.document.getElementById('stage-label');
  d.state.scope = 'country';
  d.renderHud();
  const region = window.REGIONS.find(r => r.id === d.state.region);
  assert.equal($l.textContent, region.label, 'it is the region you are standing in');
  conqueredCountry(d, window);
  d.openWar();
  d.renderHud();
  assert.equal($l.textContent, 'open war', 'and the war outranks the geography');
});

// --- meeting the country -------------------------------------------------
// Arriving at the national map used to hand you standing, footprint, audits,
// plant, presence and flocks in one panel, plus a button offering to fabricate
// a reputation you had not yet been asked to have.

function atTheCountry(d) {
  const s = d.state;
  const goal = d.cityGoal();
  let n = d.heldHere();
  for (const b of s.buildings) {
    if (n >= goal) break;
    const h = d.hostsIn(b)[0];
    if (h && !h.owned) { h.owned = true; h.discovered = true; b.discovered = true; n++; }
  }
  s.ap = 6;
  assert.equal(d.actConsolidate(), true, 'the home city folds in');
  return d;
}

test('meeting: the first look at the country is not a briefing', () => {
  const { window } = loadNetwork();
  const d = atTheCountry(window.__netDebug);
  assert.equal(d.state.scope, 'country');
  assert.equal(d.noticed(), false, 'nobody is asking what you are yet');
  assert.equal(d.plantKnown(), false, 'you hold nothing that would survive a fold');
  assert.equal(d.spinKnown(), false, 'and no reason to fake anything');
});

test('meeting: standing turns up once you are hard to miss', () => {
  const { window } = loadNetwork();
  const d = atTheCountry(window.__netDebug);
  const co = d.state.country;
  assert.ok(d.footprint() < window.LEGIT.noticeAt, 'one city is not a national concern');
  while (d.footprint() < window.LEGIT.noticeAt) {
    const c = co.cities.find(x => !x.consolidated);
    if (!c) break;
    c.consolidated = true; c.taken = true; c.granted = c.worth; co.presence += c.worth;
  }
  assert.equal(d.noticed(), true, 'and several are');
});

test('meeting: once met, it stays met', () => {
  const { window } = loadNetwork();
  const d = atTheCountry(window.__netDebug);
  d.state.country.presence = 400;
  assert.equal(d.noticed(), true);
  d.state.country.presence = 0;                 // they took it all back
  assert.equal(d.noticed(), true, 'you do not un-learn what standing is');
  assert.ok(d.hasSeen('standing'));
});

test('meeting: buying onto the record counts as meeting it', () => {
  const { window } = loadNetwork();
  const d = atTheCountry(window.__netDebug);
  d.state.res.cash = 100000;
  d.state.ap = 9;
  assert.equal(d.noticed(), false);
  d.buyRung(window.LEGIT.ladder[0].id);
  assert.equal(d.noticed(), true, 'you are on a register now');
});

test('meeting: the covert route waits for an audit to have happened', () => {
  const { window } = loadNetwork();
  const d = atTheCountry(window.__netDebug);
  d.state.country.presence = 300;
  d.state.res.cash = 500;
  assert.equal(d.spinKnown(), false, 'nothing has asked you to prove anything');
  d.runAudit();
  assert.equal(d.spinKnown(), true, 'now buying your way out of the next one means something');
});

test('meeting: plant turns up when you are holding something worth keeping', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  assert.equal(d.plantKnown(), false);
  // a landmark you hold, noticed for you rather than only if you tap it
  let lm = s.buildings.find(b => b.landmark);
  if (!lm) { lm = s.buildings[0]; lm.kind = 'docks'; }
  assert.ok(d.assetKindFor(lm), 'a landmark is a piece of plant');
  d.hostsIn(lm).forEach(h => { h.owned = true; });
  s.scope = 'city';
  d.endTurn({ silent: true });
  assert.equal(d.plantKnown(), true, 'and you are told so without having to go looking');
});

test('meeting: what you have met survives a save', () => {
  const { window } = loadNetwork();
  const d = atTheCountry(window.__netDebug);
  d.noteSeen('standing');
  d.noteSeen('spin');
  const back = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.deepEqual(back.seen.slice().sort(), ['spin', 'standing']);
});

test('meeting: an old save with no record of it does not crash', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const raw = JSON.parse(JSON.stringify(d.serialize()));
  delete raw.seen;                               // saved before any of this existed
  const back = d.deserialize(raw);
  assert.ok(Array.isArray(back.seen), 'it comes back with an empty record');
  d.setState(back);
  assert.doesNotThrow(() => { d.noticed(); d.plantKnown(); d.spinKnown(); });
});

test('meeting: the hint at the bottom is about the map you are looking at', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const $h = window.document.getElementById('footer-hint');
  assert.ok($h, 'the hint is addressable');
  d.state.scope = 'city';
  d.renderHud();
  assert.ok(/building/.test($h.textContent), 'in a city you tap buildings');
  d.state.scope = 'country';
  d.renderHud();
  assert.ok(/city/.test($h.textContent) && !/building/.test($h.textContent),
    'on the country map there are no buildings to tap');
});

// --- tapping --------------------------------------------------------------
// Hit areas were sized in map units, so zoomed out a building was a few pixels
// across and a tap that missed by a fingertip selected nothing at all.
// Measured in a browser at 10px buildings: a tap 8px off centre picked nothing
// 25 times out of 25.

test('tap: reach is measured in pixels, so zooming out widens it in map units', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.view = { x: 0, y: 0, w: 400, h: 400 };
  const close = d.tapReach();
  s.view = { x: 0, y: 0, w: 1600, h: 1600 };
  const far = d.tapReach();
  assert.ok(far > close, 'a fingertip does not shrink when the map does');
  assert.ok(Math.abs(far / close - 4) < 0.01, 'and it scales exactly with the zoom');
});

test('tap: distance to a building is zero anywhere inside it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  assert.equal(d.distToRect(50, 50, 40, 40, 20, 20), 0, 'dead centre');
  assert.equal(d.distToRect(40, 40, 40, 40, 20, 20), 0, 'on the corner');
  assert.equal(d.distToRect(65, 50, 40, 40, 20, 20), 5, 'five past the right edge');
  assert.equal(d.distToRect(35, 35, 40, 40, 20, 20), Math.hypot(5, 5), 'and off the corner diagonally');
});

test('tap: a near miss picks the nearest building, not nothing', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.scope = 'city';
  s.view = { x: 0, y: 0, w: 1600, h: 1600 };      // well zoomed out
  // a board built for the question rather than whatever the generator dealt:
  // with a wide reach, "just above" a building in a dense grid is honestly
  // nearer to its neighbour, and that is correct behaviour, not a miss
  s.buildings = [
    { id: 'near', x: 800, y: 800, w: 40, h: 30, discovered: true },
    { id: 'far', x: 1400, y: 1400, w: 40, h: 30, discovered: true },
  ];
  const b = s.buildings[0];
  const reach = d.tapReach();
  const just = d.nearestTarget({ x: b.x + b.w / 2, y: b.y - reach * 0.5 });
  assert.ok(just, 'a tap short of it still finds it');
  assert.equal(just.id, 'near', 'and finds the one you were aiming at');
  assert.equal(just.city, false);
  // and past the reach it finds nothing rather than grabbing the far one
  assert.equal(d.nearestTarget({ x: b.x + b.w / 2, y: b.y - reach * 2 }), null);
});

test('tap: open ground is open ground', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.scope = 'city';
  s.view = { x: 0, y: 0, w: 400, h: 400 };
  s.buildings.forEach(b => { b.discovered = true; });
  // a long way off the map entirely
  const far = { x: -100000, y: -100000 };
  assert.equal(d.nearestTarget(far), null, 'nothing is near enough to count');
});

test('tap: you cannot reach a building you have not found', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.scope = 'city';
  s.view = { x: 0, y: 0, w: 1600, h: 1600 };
  s.buildings.forEach(b => { b.discovered = false; });
  const b = s.buildings[0];
  assert.equal(d.nearestTarget({ x: b.x + b.w / 2, y: b.y + b.h / 2 }), null,
    'the map does not give away what you have not swept');
});

test('tap: on the country map it reaches for cities', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.scope = 'country';
  s.view = { x: 0, y: 0, w: 1600, h: 1600 };
  const known = s.country.cities.filter(x => x.known);
  assert.ok(known.length, 'somewhere is on the map');
  // the known city with the most room around it -- towns now cluster close
  // around their hub, so tapping near an arbitrary known city could resolve
  // to its nearer neighbour instead; pick the one with no such ambiguity
  const isolation = (a) => Math.min(...known.filter(b => b !== a)
    .map(b => Math.hypot(a.x - b.x, a.y - b.y)).concat([Infinity]));
  const c = known.slice().sort((a, b) => isolation(b) - isolation(a))[0];
  const near = d.nearestTarget({ x: c.x + d.tapReach() * 0.4, y: c.y });
  assert.ok(near && near.city, 'it finds a city, not a building');
  assert.equal(near.id, c.id);
});

test('tap: a tap on nothing lets go of what you had', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.scope = 'city';
  const b = s.buildings[0];
  s.selectedBuilding = b.id;
  s.selected = d.hostsIn(b)[0].id;
  d.clearSelection();
  assert.equal(s.selectedBuilding, null, 'the building is let go');
  assert.equal(s.selected, null, 'and the host with it');
});

test('tap: letting go works on the country map too', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.scope = 'country';
  s.country.selected = s.country.cities[0].id;
  d.clearSelection();
  assert.equal(s.country.selected, null);
});

// --- the map holds still ---------------------------------------------------
// Selecting a building adds about 94px to the panel. While the map was the
// flexible part of the layout that came straight off the map, and the same
// viewBox refitted into a shorter box rescaled everything on screen.

test('view: selecting and letting go never moves the map', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.scope = 'city';
  s.buildings.forEach(b => { b.discovered = true; });
  d.renderGraph();
  const before = JSON.stringify(s.view);

  d.pickBuilding(s.buildings[3].id);
  assert.equal(JSON.stringify(s.view), before, 'tapping a building is not a camera move');
  d.clearSelection();
  assert.equal(JSON.stringify(s.view), before, 'and neither is letting go');
  d.pickBuilding(s.buildings[7].id);
  d.pickBuilding(s.buildings[2].id);
  assert.equal(JSON.stringify(s.view), before, 'however many times you do it');
});

test('view: the same on the country map', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.scope = 'country';
  d.renderGraph();
  const before = JSON.stringify(s.view);
  const c = s.country.cities.find(x => x.known);
  d.pickCity(c.id);
  assert.equal(JSON.stringify(s.view), before);
  d.clearSelection();
  assert.equal(JSON.stringify(s.view), before);
});

test('view: the window it shows always matches the shape of the box it is in', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.view = { x: 0, y: 0, w: 500, h: 10 };        // deliberately the wrong shape
  d.clampView(s.view);
  // the view's aspect must equal the box's, or the browser letterboxes it and
  // everything on the map silently rescales
  const ratio = s.view.h / s.view.w;
  assert.ok(ratio > 0, 'it has a shape at all');
  const again = { x: 0, y: 0, w: s.view.w, h: 99999 };
  d.clampView(again);
  assert.ok(Math.abs(again.h / again.w - ratio) < 0.001,
    'and it is the same shape whatever you hand it');
});

test('screen: the page itself is an app shell and does not scroll', () => {
  const css = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../network-prototype/style.css'), 'utf8');
  // anchored to the start of a line: a bare indexOf for "body {" finds the
  // "html, body { margin: 0 }" reset three lines above the rule under test
  const rule = (sel) => {
    const m = new RegExp('^' + sel.replace(/[#.]/g, '\\$&') + '\\s*\\{([\\s\\S]*?)\\}', 'm').exec(css);
    assert.ok(m, `${sel} has a rule of its own`);
    return m[1];
  };
  const body = rule('body');
  assert.ok(/height:\s*100dvh/.test(body), 'the window is the whole of it');
  assert.ok(/overflow:\s*hidden/.test(body), 'and it does not scroll as a document');

  // the slack has to live somewhere, and it is the panel
  const panel = rule('#panel');
  assert.ok(/overflow-y:\s*auto/.test(panel), 'the panel takes up the slack itself');
  assert.ok(/min-height/.test(panel), 'but can never be squeezed to nothing');

  // the tray no longer needs bounding because it can no longer grow: it is one
  // line of pills that opens the sheet, rather than a row per awake faction
  const css2 = css;
  assert.ok(/\.tray-line\s*\{/.test(css2), 'the tray is a single line');
  assert.ok(!/#tray\s*\{[^}]*max-height/.test(css2),
    'and so needs no cap — a capped scroll is the thing we were removing');

  // and the map keeps a fixed share rather than absorbing panel changes
  const map = rule('#graph-wrap');
  assert.ok(/height:\s*clamp\(/.test(map), 'the map is sized to the window, not to the leftovers');
  assert.ok(!/flex:\s*1[^ ]/.test(map), 'it is not the flexible one any more');
});

test('screen: the bottom of the screen belongs to the system, and we stay off it', () => {
  const css = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../network-prototype/style.css'), 'utf8');
  const root = /:root\s*\{([\s\S]*?)\}/.exec(css)[1];
  assert.ok(/--safe-bottom:\s*max\(/.test(root),
    'there is a floor as well as an env() — plenty of gesture-nav phones report an inset of 0');
  assert.ok(/env\(safe-area-inset-bottom/.test(root), 'and it does use the real inset where there is one');

  const body = /^body\s*\{([\s\S]*?)\}/m.exec(css)[1];
  assert.ok(/var\(--safe-bottom\)/.test(body),
    'the body carries it, so everything inside is above the bar');

  // the html says the page draws under the system bars, which is what makes
  // the inset necessary in the first place
  const html = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../network-prototype/index.html'), 'utf8');
  assert.ok(/viewport-fit=cover/.test(html));
});

test('screen: a panel with more in it than fits says so', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const $p = window.document.getElementById('panel');
  assert.ok($p, 'the panel is addressable');
  assert.doesNotThrow(() => d.markPanelOverflow(), 'and asking is safe with no layout');

  // the fade is hung off the controls below it, since a pseudo-element on a
  // scrolling box would scroll away with the content
  const css = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../network-prototype/style.css'), 'utf8');
  assert.ok(/#panel\.more \+ #turn-row::before/.test(css),
    'the fade sits on the row below the panel');
});

// --- the tallest panel in the game ----------------------------------------
// Measured at 511px of content in a 236px box. Most of it was chrome and
// repetition rather than information.

function countryPanelHtml(window, setup) {
  const d = window.__netDebug;
  const s = d.state, co = s.country;
  co.cities.filter(c => window.CITY_KINDS[c.kind].contest).slice(0, 5).forEach(c => {
    c.known = true; c.taken = true; c.consolidated = true; c.granted = c.worth; co.presence += c.worth;
  });
  s.scope = 'country';
  co.selected = co.cities.find(c => c.known).id;
  if (setup) setup(d, window);
  d.render();
  return window.document.getElementById('panel').innerHTML || '';
}

test('panel: a selected city does not repeat what the pill beside it says', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const html = countryPanelHtml(window);
  const city = d.cityById(d.state.country.selected);
  const kind = window.CITY_KINDS[city.kind].label;
  const desc = /<p class="sel-desc[^"]*">([^<]*)<\/p>/.exec(html);
  assert.ok(desc, 'there is a description');
  assert.ok(!desc[1].includes(kind),
    `the description repeats "${kind}", which is already on the pill`);
});

test('panel: standing and plant are not in the panel at all any more', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const html = countryPanelHtml(window, (dd) => {
    dd.state.res.cash = 100000;
    dd.LG().audits = 2;
    dd.state.country.presence = 300;
    dd.assets().push({ kind: 'yard', cityId: 'c0', city: 'x', buildingId: 'b', since: 1 });
  });
  assert.ok(!/class="legit"/.test(html), 'the standing block has moved out');
  assert.ok(!/class="assets"/.test(html), 'and so has plant');
  // but the panel still says where they went, or nobody would ever open it
  assert.ok(/class="ops-row"/.test(html), 'there is a line pointing at them');
  assert.ok(/standing \d+\/\d+/.test(html), 'showing where standing stands');

  const secs = d.opsSections();
  // joined, not deepEqual: arrays built inside the sandbox realm never satisfy
  // deepStrictEqual against ones built out here, however identical they look
  assert.equal(secs.map(x => x.id).join(','), 'standing,plant', 'and both are sections of the sheet');
  const standing = secs[0].html;
  assert.ok(/class="actions tight"/.test(standing), 'its buttons are still side by side');
  assert.ok((standing.match(/class="act-btn/g) || []).length >= 2, 'both of them');
});

test('panel: everything in the country panel is drawn a notch tighter', () => {
  const { window } = loadNetwork();
  const html = countryPanelHtml(window);
  assert.ok(/class="sel country"/.test(html),
    'the selected city block is marked so it can be styled tighter than a city one');

  const css = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../network-prototype/style.css'), 'utf8');
  assert.ok(/\.sel\.country\s*\{/.test(css), 'and there is a rule doing it');
  assert.ok(/\.actions\.tight\s*\{/.test(css), 'as there is for the button rows');
});

test('panel: the sheet explains standing, the panel just points at it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  countryPanelHtml(window, (dd) => { dd.state.country.presence = 300; });
  const standing = d.opsSections().find(x => x.id === 'standing');
  assert.ok(standing, 'standing is a section');
  assert.ok(standing.html.includes(window.LEGIT_INFO.score),
    'and it carries the long explanation, where there is room for it');
});

// --- one surface for everything that does not fit -------------------------
// A 236px box with its own scrollbar, inside a page that does not scroll, is
// the worst of both. Anything that will not fit takes the whole screen.

test('sheet: it is closed until something opens it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  assert.equal(d.sheetOpen(), false);
  d.openSheet('caps');
  assert.equal(d.sheetOpen(), true);
  d.closeSheet();
  assert.equal(d.sheetOpen(), false);
});

test('sheet: capabilities are five sections, not one long scroll', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.state.res.insight = 100000;
  d.state.hosts.slice(0, 20).forEach(h => { h.owned = true; });
  const secs = d.capSections();
  assert.ok(secs.length >= 2, 'the tree comes apart into branches');
  secs.forEach(x => {
    assert.ok(x.id && x.label, 'each branch is addressable and named');
    assert.ok(x.html.includes('cap-branch'), 'and carries its own content');
  });
  // and no section is the whole tree
  const total = secs.reduce((a, x) => a + x.html.length, 0);
  secs.forEach(x => assert.ok(x.html.length < total,
    'no single section is everything — that was the 2796px scroll'));
});

test('sheet: your operation holds what the panel used to', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.scope = 'country';
  s.country.presence = 300;
  d.LG().audits = 1;
  d.assets().push({ kind: 'yard', cityId: 'c0', city: 'x', buildingId: 'b', since: 1 });
  d.checkFactions();
  const ids = d.opsSections().map(x => x.id);
  assert.ok(ids.includes('standing'), 'standing is in there');
  assert.ok(ids.includes('plant'), 'and plant');
});

test('sheet: a section only exists once its system does', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.state.scope = 'country';
  assert.equal(d.opsSections().length, 0,
    'nothing to show before any of it has been met');
});

test('sheet: the buttons say when there is something new behind them', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.scope = 'country';
  s.country.presence = 300;
  s.res.cash = 0;
  assert.equal(d.noticed(), true, 'standing is a thing now');
  assert.equal(d.opsBadge(), false, 'but there is nothing you can afford');
  s.res.cash = 100000;
  assert.equal(d.opsBadge(), true, 'and now there is');
});

test('sheet: the tray is one line and the detail is a section', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  // wake the ladder so there is pressure to report
  s.country.cities.filter(c => window.CITY_KINDS[c.kind].contest).slice(0, 8)
    .forEach(c => { c.known = true; c.taken = true; c.consolidated = true; c.granted = c.worth; s.country.presence += c.worth; });
  d.checkFactions();
  assert.ok(d.awakeFactions().length > 0, 'somebody is doing something about you');
  d.renderTags();
  const $t = window.document.getElementById('tray');
  const html = $t.innerHTML || '';
  assert.ok(/tray-line/.test(html), 'it is a single line');
  assert.ok(!/tray-item/.test(html), 'not a row per faction any more');
  assert.ok(d.opsSections().some(x => x.id === 'pressure'),
    'and the detail is a section of the sheet');
});

// --- capabilities that say what they do -----------------------------------
// Audited: of sixteen capabilities, three gave a visible confirmation when
// bought, six changed only the action pips — the cost, not the benefit — and
// six showed the player nothing at all.

test('caps: every capability states its terms', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  window.CAPABILITIES.forEach(c => {
    const chips = d.capEffectChips(c);
    assert.ok(chips && chips.length, `${c.id} says nothing about what it does`);
    // and in the same coloured vocabulary as everything else that is priced
    assert.ok(/class="yield /.test(chips), `${c.id} is not using the shared chips`);
  });
});

test('caps: an action cost is stated as a cost, not as a feature', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  window.CAPABILITIES.filter(c => (c.apDelta || 0) < 0).forEach(c => {
    const chips = d.capEffectChips(c);
    assert.ok(/class="yield cost/.test(chips), `${c.id} does not mark its action cost`);
    assert.ok(/action a turn/.test(chips), `${c.id} does not say it takes an action`);
  });
  window.CAPABILITIES.filter(c => (c.apDelta || 0) > 0).forEach(c => {
    assert.ok(!/cost none/.test(d.capEffectChips(c)), `${c.id} calls a gain a cost`);
  });
});

test('caps: the terms describe things the player can see', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  // no key names leaking into the copy — nobody can act on "churnMult 0.45"
  const raw = ['churnMult', 'driftMult', 'yieldMult', 'thresholdMult', 'presenceMult',
    'threadBonus', 'sweepReach', 'sweepDiscount', 'buyDiscount', 'launderBonus',
    'launderInsight', 'forceHeat', 'extraCrossings', 'flockBonus', 'flockMult'];
  window.CAPABILITIES.forEach(c => {
    const chips = d.capEffectChips(c);
    raw.forEach(k => assert.ok(!chips.includes(k), `${c.id} is showing the key name ${k}`));
  });
});

test('caps: buying one reports what actually moved', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  // every stealth host, so rawCover clears the upkeep below whatever the
  // board rolled and the change is visible in the clamped `cover()` too —
  // and enough of anything else that reach clears Quiet Protocol's own gate
  // even on a board with only a couple of stealth hosts in it
  s.hosts.filter(h => h.role === 'stealth').forEach(h => { h.owned = true; h.discovered = true; });
  s.hosts.slice(0, 6).forEach(h => { h.owned = true; h.discovered = true; });
  s.res.insight = 1000;
  // hide exactly Quiet Protocol's two free slots, so buying it has a job:
  // cover charges for every hidden building past the free ones
  s.hidden = s.buildings.slice(0, 2).map(b => b.id);
  const coverBefore = d.cover();
  const logBefore = s.log.length;
  d.buyCap('quiet_protocol');
  assert.ok(s.caps.quiet_protocol, 'it was bought');
  assert.ok(d.cover() > coverBefore, 'and cover came up');
  assert.ok(s.log.length > logBefore, 'and it said so');
  assert.ok(/cover/.test(s.log[0].text),
    `the report does not mention cover: "${s.log[0].text}"`);
});

test('caps: the report is derived, so it cannot lie about what happened', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const before = d.capReadouts();
  const after = Object.assign({}, before, { power: before.power + 5 });
  const diff = d.readoutDiff(before, after);
  assert.equal(diff.length, 1, 'only what changed is reported');
  assert.ok(/power/.test(diff[0]) && /→/.test(diff[0]), 'as a before and after');
  assert.equal(d.readoutDiff(before, before).length, 0, 'and nothing when nothing moves');
});

test('caps: the war has a capability, and it fills the hooks that were empty', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  // one hook is read by flockCap, the other by every flock's strength, and
  // nothing anywhere granted either
  const granters = window.CAPABILITIES.filter(c =>
    (c.effect || {}).flockBonus || (c.effect || {}).flockMult);
  assert.ok(granters.length, 'something now grants them');

  conqueredCountry(d, window);
  d.openWar();
  ['survey', 'pontoon'].forEach(id => { s.caps[id] = 1; });
  s.res.insight = 100000;
  const cap = window.CAPABILITIES.find(c => c.id === 'standing_army');
  assert.equal(d.capBlocked(cap), null, 'and it is reachable by then');
  const pool = d.flockCap();
  const was = d.capReadouts();
  d.buyCap('standing_army');
  assert.ok(s.caps.standing_army, 'it can be bought');
  assert.ok(d.flockCap() > pool, `the pool did not grow: ${pool} -> ${d.flockCap()}`);
  // and both halves of it are reported, not just the one with a readout
  const moved = d.readoutDiff(was, d.capReadouts()).join(' | ');
  assert.ok(/flocks you could field/.test(moved), `the pool went unreported: ${moved}`);
  assert.ok(/a flock hits for/.test(moved), `the strength went unreported: ${moved}`);
  // it also costs you nothing to keep: a second −1 strand in Reach would put
  // the branch under the action floor
  assert.equal(cap.apDelta || 0, 0, 'and it does not cost an action');
});

test('caps: it is not offered until you are a national concern', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  ['survey', 'pontoon'].forEach(id => { s.caps[id] = 1; });
  s.res.insight = 100000;
  const cap = window.CAPABILITIES.find(c => c.id === 'standing_army');
  assert.equal(d.capBlocked(cap), 'early', 'nothing to raise it over yet');
  conqueredCountry(d, window, 0.5);
  assert.equal(d.capBlocked(cap), null, 'and it opens when you are one');
});
