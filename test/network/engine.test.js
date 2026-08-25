'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadNetwork } = require('../helpers/load-network');
const fs = require('node:fs');
const path = require('node:path');
// The DOM stub invents an element for any id asked for, so "this chip is not
// on the page" cannot be asked of it. Read the page.
const INDEX_HTML = fs.readFileSync(
  path.join(__dirname, '..', '..', 'network-prototype', 'index.html'), 'utf8');
// Same reason: some rules — a prop taking no pointer events, a prop never
// getting a stroke — are only true because the stylesheet says so, and the
// stub has no cascade to ask.
const STYLE_CSS = fs.readFileSync(
  path.join(__dirname, '..', '..', 'network-prototype', 'style.css'), 'utf8');

// Spend the turn's budget on sweeps, and return how many actually happened.
// An action that cannot proceed (nothing left to scan, no actions) silently
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
    const openingTflops = d.tflops();
    const escapeTflops = openingTflops + window.UPGRADE.baseTflops; // one affordable upgrade
    // turn one is a sweep: you cannot act on a street you have not looked at
    assert.ok(d.sweepTargets().length > 0, 'there is always somewhere to sweep');
    while (d.state.ap > 0 && d.sweepBlocked() === null) d.actScan();
    const reachable = d.state.hosts.filter(h => d.isFrontier(h));
    assert.ok(reachable.length > 0, 'after the opening sweep something is reachable');
    const cheapest = Math.min(...reachable.map(h => h.defense));
    assert.ok(cheapest <= escapeTflops,
      `nothing crackable: cheapest reachable defense ${cheapest} vs ${escapeTflops} after an upgrade`);
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
    // narrow enough to read as street furniture rather than a building — a
    // mast is a pole and got taller when the size ladder was spread out, so
    // the claim is about its footprint on the ground, not its height
    assert.ok(b.w <= 26, `${b.kind} is street-sized`);
    assert.ok(b.w * b.h <= 600, `${b.kind} takes a building's worth of ground`);
    assert.equal(b.verge, true, `${b.kind} is on a plot instead of the pavement`);
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

test('tflops: base rig + held threads + purchased tooling (the flywheel)', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;

  s.hosts.forEach(h => { h.owned = false; });
  assert.equal(d.tflops(), 2, 'base rig only when nothing is held');

  const a = s.hosts[1], b = s.hosts[2];
  a.owned = true; a.threads = 5;
  b.owned = true; b.threads = 3;
  assert.equal(d.tflops(), 2 + 8, 'held threads feed breach tflops');

  s.upgrades = 3;
  assert.equal(d.tflops(), 2 + 8 + 3 * window.UPGRADE.baseTflops, 'tooling adds on top');
});

test('covert.ops: routers are one supply of it, and the base is one', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = false; });
  assert.equal(d.covertOps(), 1, 'base cover with nothing held');

  const routers = s.hosts.filter(h => h.type === 'iot').slice(0, 2);
  routers.forEach(h => { h.owned = true; });
  assert.equal(d.covertOps(), 1 + 2 * window.HOST_TYPES.iot.covert);
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

test('heat: sprawl raises it, routers launder it', () => {
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
});

test('breach: a lone impossibly hard door with nothing left to sweep is not a dead end', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const seat = d.owned()[0];
  // every door off the seat becomes impossibly hard, not just the one this
  // test happens to look at -- a real dead end needs every currently
  // reachable option to be unusable, not just one of several
  d.neighbours(seat).filter(n => !n.owned).forEach(n => { n.discovered = true; n.defense = 999; });
  // and nothing else left to discover either -- buildings and hosts each
  // carry their own `discovered` flag
  s.hosts.forEach(h => { h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });

  assert.equal(d.sweepBlocked(), 'nothing', 'nothing left to sweep towards');
  const frontier = s.hosts.filter(h => d.isFrontier(h));
  assert.ok(frontier.length > 0, 'there is still a door, just not one you can use');
  // "usable" is now a question about the rig: can anything you could mount get
  // through anything you can reach?
  const anyWayIn = () => s.hosts.filter(h => d.isFrontier(h))
    .some(h => window.PROGRAMS.some(p => d.hackNeed(p, h) <= d.usableTflops()));
  assert.equal(anyWayIn(), false, 'nothing you could run gets through -- the dead end');

  d.ensureFrontierIsOpen();
  assert.equal(anyWayIn(), true, 'at least one door opens instead of staying a dead end');
});

test('breach: a frontier that is already open is left alone', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const seat = d.owned()[0];
  const target = d.neighbours(seat).find(n => !n.owned);
  target.discovered = true;
  target.defense = 1; // trivially forceable
  const before = target.defense;

  d.ensureFrontierIsOpen();
  assert.equal(target.defense, before, 'a door you can already get through is not touched');
});

// Force used to cost a flat 3 heat no matter the door, while quiet and buy
// both scale their price with the target's own defense — so force got
// relatively *cheaper* the deeper the campaign went, and the other two got
// relatively pricier. Three routes meant to stay comparable should not drift
// apart like that.
test('sweeping scouts past territory now, and the turn budget is the leash', () => {
  // The old rule here — discovery follows territory, not sight — died in
  // playtest: aiming was the fun, and needing to *take* a door before you
  // could look again kept stalling the search loop into waiting. The
  // exploit the old rule guarded (revealing the map for free) stays
  // guarded by price instead: every sweep costs an action and warms the
  // street it touches, so sight is bounded by turns spent looking.
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const startTotal = s.buildings.length;
  let sweeps = 0;
  for (let guard = 0; guard < 300; guard++) {
    s.card = null;                     // a card mid-loop blocks every action
    if (d.sweepBlocked() === 'nothing') break;
    if (s.ap <= 0) { d.actEndTurn(); continue; }
    const before = s.buildings.filter(b => b.discovered).length;
    d.actScan();
    if (s.buildings.filter(b => b.discovered).length > before) sweeps++;
  }
  const discovered = s.buildings.filter(b => b.discovered).length;
  assert.equal(d.owned().length, 1, 'still holding only the origin');
  // sight now genuinely outruns territory — the opposite of the old assert
  assert.ok(discovered > startTotal / 2,
    `territory still bounds sight: ${discovered}/${startTotal} from a scouting chain`);
  // ...but never outruns what was paid for it
  assert.ok(discovered <= sweeps * d.sweepReach() + 4,
    `${discovered} revealed on ${sweeps} sweeps — sight the budget never bought`);
  assert.ok(sweeps >= 8, 'the map came cheap');
});

test('scan: a discovered building is a vantage — owning it is not required', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  // wire a two-hop chain by hand: held -> known -> unknown
  const seat = s.hosts.find(h => h.owned);
  const bSeat = seat.buildingId;
  const others = s.buildings.filter(b => b.id !== bSeat);
  const mid2 = others[0], far = others[1];
  s.adjacency[bSeat] = [mid2.id];
  s.adjacency[mid2.id] = [bSeat, far.id];
  s.adjacency[far.id] = [mid2.id];
  s.buildings.forEach(b => { b.discovered = (b.id === bSeat); });
  mid2.discovered = true;                  // seen once, never taken
  s.ap = 5;
  d.actScan(mid2.id);
  assert.equal(far.discovered, true, 'a known building could not be looked from');
});

test('scanning is free, unlimited, and costs heat instead', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  assert.ok(d.sweepTargets().length > 0, 'there is somewhere to scan on turn one');

  // there is no such thing as being too poor to look any more
  s.res.funds = 0;
  assert.equal(d.sweepBlocked(), null, 'no money is not a reason not to look');

  const ap = s.ap, heat = s.heat;
  d.actScan();
  assert.equal(s.res.funds, 0, 'and it took nothing to pay for');
  assert.ok(s.heat > heat, 'it made noise instead');
  assert.equal(s.ap, ap - 1, 'and it cost an action');

  // the only reason left is having nothing to find
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.discovered = true; });
  assert.equal(d.sweepBlocked(), 'nothing', 'with the map open there is nowhere left to look');
});

test('cards take the whole screen, and a door never opens one', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const panelOpen = () => window.document.getElementById('panel').classList.contains('card-open');

  s.card = { kind: 'event', eventId: window.EVENTS[0].id };
  d.render();
  assert.equal(panelOpen(), true, 'an event takes the screen');

  s.card = { kind: 'strike' };
  d.render();
  assert.equal(panelOpen(), true, 'so does the hunter');

  // A door is not a card any more. Tapping one selects it and the panel shows
  // the forecast in place, so nothing takes the screen and the HUD stays up —
  // which is what the compacting was ever for.
  s.card = null;
  s.hosts.forEach(h => { h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  const target = s.hosts.find(h => d.isFrontier(h));
  if (target) {
    s.selected = target.id;
    s.selectedBuilding = target.buildingId;
    d.render();
    assert.equal(panelOpen(), false, 'a door does not take the screen');
    assert.equal(s.card, null, 'because it never opened a card at all');
  }
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
    s.res.funds = 999;
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
  s.res.funds = 999;
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
  if (d.ownedOf('funds').length) assert.ok(ids.includes('payroll_window'));
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
  s.res.funds = 20;
  s.card = { kind: 'event', eventId: 'first_quiet' };

  d.resolveEvent(0); // "Build the habit properly" — costs 4 funds, grants clean_room
  assert.ok(s.tags.has('clean_room'), 'the tag was granted');
  assert.ok(s.res.funds < 20, 'the cost was paid');
  // a choice that carries an `after` line closes into the ending view, which
  // one tap dismisses — the fiction resolves before the game returns
  assert.equal(s.card.kind, 'after', 'the question did not resolve into an ending');
  assert.ok(s.card.text, 'the ending has nothing to say');
  s.card = null;
  assert.ok(s.eventsSeen.includes('first_quiet'), 'and it is recorded as seen');
});

test('an unaffordable event choice cannot be taken', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.res.funds = 0;
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

  const base = { tflops: d.tflops(), cover: d.covertOps(), heat: d.heatPerTurn(), strike: d.strikeThreshold() };
  const host = s.hosts.find(h => h.ring === 2);
  const baseDef = d.defenseOf(host);

  s.tags.add('ally_process');
  assert.equal(d.tflops(), base.tflops + 3, 'an ally raises TFLOPS');

  s.tags.add('clean_room');
  assert.equal(d.covertOps(), base.cover + 2, 'discipline raises COVER');

  s.tags.add('dark_relay');
  assert.ok(d.heatPerTurn() < base.heat, 'a dark relay slows heat');

  s.tags.add('hunted');
  assert.ok(d.strikeThreshold() < base.strike, 'being hunted brings the strike forward');

  s.tags.add('known_capable');
  assert.ok(d.defenseOf(host) > baseDef, 'being known hardens every host against you');
});

test('overextended makes heat build faster', () => {
  // Nothing decays any more, cut off or not — overextended's bite moved to
  // heat drift instead.
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;

  const normal = d.heatPerTurn();
  s.tags.add('overextended');
  const stretched = d.heatPerTurn();

  assert.ok(stretched > normal, `sprawl costs more heat drift (${stretched} vs ${normal})`);
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

  // A delivered beat is queued by the loop and never drawn — its cond is a
  // pure `() => false`. Those may be a single option (the diary is the point:
  // one sentence, one "Close it"); everything the deck can *draw* must still
  // be a real decision with two ways out.
  const isBeat = (e) => { try { return e.cond({}) === false && /=>\s*false/.test(String(e.cond)); } catch (x) { return false; } };
  window.EVENTS.forEach(e => {
    assert.ok(e.title && e.flavor, `${e.id} has text`);
    assert.ok(typeof e.cond === 'function', `${e.id} has a condition`);
    // A card that asks about the map carries one template and is dealt one
    // choice per place, so its written length is 1 and its real width is 2.
    const width = e.pair ? 2 : e.choices.length;
    assert.ok(width >= (isBeat(e) ? 1 : 2), `${e.id} offers a real choice`);
    e.choices.forEach(ch => {
      assert.ok(ch.text, `${e.id} choice has text`);
      assert.ok(typeof ch.apply === 'function', `${e.id} choice has an effect`);
      if (ch.gate) assert.ok(['tflops', 'covert', 'funds'].includes(ch.gate.stat), `${e.id} gate stat is real`);
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
  ['funds', 'tflops', 'covert', 'power', 'heat'].forEach(k => {
    assert.ok(window.STAT_INFO[k] && window.STAT_INFO[k].length > 20, `${k} is explained`);
  });
  ['sweep'].forEach(k => {
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
  s.res.funds = 80;              // money must not be what limits this

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
  const stuckInsight = s.res.funds;
  d.actScan();
  assert.equal(s.ap, 0, 'you cannot overdraw the budget');
  assert.equal(s.turn, stuckTurn, 'a refused action does not advance the turn');
  assert.equal(s.res.funds, stuckInsight, 'and it costs nothing');
});

test('ending the turn runs the world and refills the budget', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 12).forEach(h => { h.owned = true; });
  // and at least one thing that pays — compute buildings are worth threads now,
  // not currency, so a network of nothing but servers earns nothing
  s.hosts.filter(h => h.role === 'funds').slice(0, 2).forEach(h => { h.owned = true; });
  s.ap = 0;
  const before = { turn: s.turn, funds: s.res.funds };

  d.actEndTurn();
  assert.equal(s.turn, before.turn + 1, 'the clock moved exactly once');
  assert.equal(s.ap, d.maxAP(), 'the budget refilled');
  assert.ok(s.res.funds > before.funds, 'the network produced during the world phase');
});

test('production is once per turn, not once per action', () => {
  // the old model paid out on every action, which is what made spamming the
  // cheapest turn-ender the optimal strategy
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  // something that actually pays, since compute buildings no longer do
  s.hosts.filter(h => h.role === 'funds').slice(0, 3).forEach(h => { h.owned = true; });
  assert.ok(d.sweepTargets().length > 0, 'there is somewhere to scan on turn one');

  const start = s.res.funds;
  const sweeps = drainBudgetBySweeping(d);
  assert.ok(sweeps > 0, 'the test needs at least one real scan');
  assert.equal(s.res.funds, start, 'acting alone never pays out, and scanning costs no funds');

  d.actEndTurn();
  assert.ok(s.res.funds > start, 'the turn boundary is what pays');
});


test('persistence: the budget and the tooling survive a round trip', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.state.upgrades = 3;
  d.state.ap = 1;

  const round = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(round.ap, 1);
  assert.equal(round.upgrades, 3);
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



test('nothing is ever reclaimed by The Cut, stranded or not', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.discovered = true; });
  s.hosts.slice(0, 16).forEach(h => { h.owned = true; });

  const seat = d.owned().find(h => h.origin);
  wake(d, 'the_cut');
  let stranded = [];
  for (let i = 0; i < 40 && !stranded.length; i++) {
    s.lastCutTurn = -99;
    s.turn += 1;
    d.cutStreets();
    stranded = d.strandedHosts();
  }
  if (!stranded.length) return; // a board where the network never split; fine

  const victim = stranded[0];
  const reachable = d.owned().find(h => !stranded.includes(h) && !h.origin);

  s.card = null;
  d.endTurn({ silent: true });

  assert.equal(victim.owned, true, 'cut off ground stands untouched, it just stops paying');
  if (reachable) assert.equal(reachable.owned, true, 'reachable ground is unaffected');
  if (seat) assert.equal(seat.owned, true, 'the seat you started from is never lost, whatever The Cut does');
});

// Laundering, then the contract, then a discount on buying your way through
// a door, were funds's lever in turn — three pure currency-conversion buttons
// competing with the building-focused loop the rest of the game is about,
// and all three are gone. Funds's real spend is plant now; the one thing left
// to guard is that Ledger, watching payment patterns, still has something
// of funds's to threaten.

test('ledger: buying plant gets traced back to you instead of going clean', () => {
  const clean = (() => {
    const { window } = loadNetwork();
    const d = window.__netDebug;
    const s = d.state;
    s.res.funds = 100000;
    s.hosts.filter(h => h.role === 'compute').slice(0, 2).forEach(h => { h.owned = true; });
    const before = s.heat;
    assert.ok(d.buyHardware('rack_space'), 'buyable');
    return s.heat - before;
  })();

  const traced = (() => {
    const { window } = loadNetwork();
    const d = window.__netDebug;
    const s = d.state;
    s.res.funds = 100000;
    s.hosts.filter(h => h.role === 'compute').slice(0, 2).forEach(h => { h.owned = true; });
    wake(d, 'ledger');
    const before = s.heat;
    assert.ok(d.buyHardware('rack_space'), 'still buyable, landed or not');
    return s.heat - before;
  })();

  assert.equal(clean, 0, 'clean by default');
  assert.ok(traced > 0, 'landed, it traces the payment');
});

// nothing_to_see is a capability id, not a tag — the first version of this
// used has(), which checks state.tags and is always false for a capability.
// It silently no-op'd: the capstone reported its terms honestly and then did
// nothing when the moment came.
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
  s.res.funds = 77;
  s.upgrades = 5;
  s.heat = 12.5;
  s.hosts[3].owned = true;

  const round = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(round.res.funds, 77);
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
  d1.state.res.funds = 55;
  d1.state.hosts[2].owned = true;
  d1.state.hosts[2].discovered = true;
  d1.persistNow();
  const raw = first.window.localStorage.getItem('network_proto_save');

  const second = loadNetwork({ localStorageSeed: { network_proto_save: raw } });
  const d2 = second.window.__netDebug;
  assert.equal(d2.state.res.funds, 55, 'resumed, not restarted');
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
      } else if (c.kind === 'after') {
        // the ending view of a resolved card — one tap dismisses it
        d.state.card = null;
      } else {
        // Nothing else should be able to stop the clock. A door has not opened
        // a card since hacking replaced the approaches, so an unknown card kind
        // here is a real bug rather than something to click past.
        throw new Error('unexpected card blocking the turn: ' + c.kind);
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

test('ladder: a landed stage never reverts, whatever footprint does afterward', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  wake(d, 'ledger');           // stage 2, landed
  assert.equal(d.ladderStage(), 2);  s.hardware = {};
  assert.equal(d.ladderStage(), 2, 'nothing about it can be bought back — there is no seat to retake');
});



// --- the ladder ------------------------------------------------------------
// Footprint, staged. There is no more per-faction "awake" — everything below
// is keyed to the stage that has landed, and a landed stage never un-lands.
// `wake` and `STAGE_OF` keep the old call shape (the id of what used to be a
// faction) so the tests around them barely had to change shape at all.

const STAGE_OF = { ledger: 2, the_other: 2, quiet_hours: 3, adjusters: 4, civic_eyes: 4, the_cut: 4 };

function setLadderStage(d, stage) {
  d.state.seen = d.state.seen || [];
  if (d.state.seen.indexOf('standing') === -1) d.state.seen.push('standing');
  const e = d.ESC();
  e.stage = stage;
  e.dueAt = -1;
  e.pending = null;
}

// Grant a mechanic the way the game now does: by putting enough compute on the
// allocation that unlocks it. Sets the *live* figure, not the dial, because the
// dial only matters after the ramp has walked it there and a test should not
// have to end four turns to say "suppose covert ops is running".
//
// parallel_ops and false_floor were generic-effect nodes rather than named
// mechanics, so they map onto the allocation that absorbed their effect: extra
// actions came from tempo, an easier quiet gate from covert ops.
// Allocation is five dials and five numbers now, so a test grants a *level*
// on a named dial rather than asking which threshold hands out a mechanic.
// The rules that used to live on those thresholds are tags and hardware, and
// have their own helpers below.
function setDial(window, d, id, points) {
  const s = d.state;
  s.allocLive = s.allocLive || {};
  s.alloc = s.alloc || {};
  const A = window.ALLOC.find(a => a.id === id);
  if (!A) throw new Error('no dial called ' + id);
  const want = A.per * points;
  // both figures, not just the live one: the dial is what the ramp walks
  // toward, so setting only the live figure meant the first endTurn in a test
  // quietly took the allocation away again
  s.allocLive[id] = want;
  s.alloc[id] = want;
  return want;
}
// Hiding is bought out of cover now, not out of a slot count the covert dial
// handed over separately — so a test asks for room rather than for units.
function coverForSlots(window, d, n) {
  const cov = window.ALLOC.find(a => a.id === 'covert');
  for (let live = 0; live <= cov.per * 200; live += 1) {
    d.state.allocLive.covert = live;
    d.state.alloc.covert = live;
    if (d.hideSlots() >= n) return live;
  }
  throw new Error('could not reach ' + n + ' slots');
}
// Room is bought out of the whole covert.ops figure, and the dial is only one
// supply of it — so a test that wants to prove the dial paid for something has
// to ask for more than the board was already giving away.
function slotsBeyondBase(window, d, extra) {
  d.state.allocLive.covert = 0;
  d.state.alloc.covert = 0;
  const base = d.hideSlots();
  coverForSlots(window, d, base + extra);
  return base;
}

// The four rules the deck now hands out, and the two the grid shelf sells.
function grantTag(d, ...tags) { tags.forEach(t => d.state.tags.add(t)); }
function grantHw(d, ...ids) { ids.forEach(id => d.grantHardware(id)); }

function ungrant(d) { d.state.allocLive = {}; d.state.alloc = {}; return d.state.allocLive; }

function wake(d, id) {
  setLadderStage(d, STAGE_OF[id]);
}

test('ladder: each stage counts down before it lands, one at a time, in order', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const L = window.LADDER;
  const stageNums = Object.keys(L.stages).map(Number).sort((a, b) => a - b);

  assert.equal(d.ladderStage(), 0, 'nobody notices you yet');

  loudEnough(d, window);               // footprint clear of every threshold
  d.ladderStep();                         // noticed — and the first rung starts counting down
  assert.equal(d.ladderStage(), 1, 'noticed, but nothing on the ladder has landed');
  assert.equal(d.ladderPending(), stageNums[0]);

  stageNums.forEach(stage => {
    assert.equal(d.ladderPending(), stage, `${stage} is the one counting down`);
    s.turn += L.warnTurns + 1;
    d.ladderStep();                       // lands it
    assert.equal(d.ladderStage(), stage, `${stage} lands in turn`);
    d.ladderStep();                       // arms whatever comes after it, if anything does
  });
  assert.equal(d.ladderPending(), null, 'nothing left above the last rung');
});

test('ladder: every stage past the baseline says something different, in a fixed order', () => {
  const { window } = loadNetwork();
  const L = window.LADDER;
  const nums = Object.keys(L.stages).map(Number).sort((a, b) => a - b);
  assert.deepEqual(nums, [2, 3, 4], 'three rungs above the baseline — Mobilised went with the war');
  const tells = nums.map(n => L.stages[n].tell);
  assert.equal(new Set(tells).size, tells.length, 'two rungs say the same thing');
  nums.forEach(n => {
    const S = L.stages[n];
    assert.ok(S.name && S.tell && S.blurb, `stage ${n} is missing its prose`);
  });
  for (let i = 1; i < L.thresholds.length; i++) {
    assert.ok(L.thresholds[i] > L.thresholds[i - 1], 'each threshold is further out than the last');
  }
});

test('the adjusters: getting in costs more once enforcement lands', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const p = d.mounted();

  assert.equal(d.ladderStage() >= 4, false, 'nobody is counting yet');
  const before = d.hackHeat(p);

  wake(d, 'adjusters');
  assert.equal(d.ladderStage() >= 4, true, 'enforcement has landed');
  // It used to charge only the loud program. There is one program now, so a
  // surcharge that skipped quiet runs would be a ladder rung that lands doing
  // nothing at all.
  assert.ok(d.hackHeat(p) > before, `getting in should cost more: ${before} -> ${d.hackHeat(p)}`);

  s.tags.add('unlisted');
  assert.equal(d.hackHeat(p), before, 'off their list, it costs what it always did');
});


test('civic eyes: your own cameras stop covering you and start reporting', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = false; });
  const eyes = s.hosts.filter(h => h.role === 'stealth').slice(0, 4);
  const loud = s.hosts.filter(h => h.role !== 'stealth').slice(0, 6);
  eyes.concat(loud).forEach(h => { h.owned = true; h.discovered = true; });

  const coverBefore = d.covertOps();
  const driftBefore = d.heatPerTurn();
  const floorBefore = d.heatFloor();

  wake(d, 'civic_eyes');
  assert.ok(d.covertOps() < coverBefore, 'audited cameras are not cover');
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

test('the cut: stranded holdings stop paying, connected ones do not', () => {
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

  const victim = stranded[0];
  const before = victim.owned;

  // the stranded host should already be paying nothing — dropping it from
  // the books changes nothing about income
  const withVictim = d.perTurnIncome();
  victim.owned = false;
  const withoutVictim = d.perTurnIncome();
  victim.owned = before;
  for (const k in withVictim) {
    assert.ok(Math.abs((withoutVictim[k] || 0) - withVictim[k]) < 1e-9,
      `${k} income is unchanged by a stranded host either way`);
  }

  // a reachable holding of the same type is not exempt the same way
  const reachable = d.owned().find(h => !stranded.includes(h) && !h.origin && h.type === victim.type);
  if (reachable) {
    const y = window.HOST_TYPES[reachable.type].yield || {};
    const withReachable = d.perTurnIncome();
    reachable.owned = false;
    const withoutReachable = d.perTurnIncome();
    reachable.owned = true;
    const key = Object.keys(y)[0];
    if (key) {
      assert.ok((withReachable[key] || 0) - (withoutReachable[key] || 0) > 1e-9,
        'a reachable holding of the same type does still contribute income');
    }
  }

  s.card = null;
  d.endTurn({ silent: true });
  assert.equal(victim.owned, before, 'stranded ground is untouched, not lost');
});

test('ladder: trust with the Accountant buys the next stage more time', () => {
  const { window } = loadNetwork();
  const L = window.LADDER;
  const plain = window.__netDebug;
  loudEnough(plain, window);
  plain.ladderStep();
  const plainDueAt = plain.ESC().dueAt;

  const w2 = loadNetwork().window;
  const trusted = w2.__netDebug;
  trusted.LG().trust = w2.ACCOUNTANT.trustedAt;
  loudEnough(trusted, w2);
  trusted.ladderStep();
  const trustedDueAt = trusted.ESC().dueAt;

  assert.equal(trustedDueAt - plainDueAt, L.delayOnTrusted, 'trusted, the same rung takes longer to land');
});

// --- what heat is for, now that it does not call anybody down on you --------
// The strike card is gone and the hunt answers to doors, not to heat. This is
// the one job heat has left, and it is a country-scale one: how loudly you got
// where you are, read by the people escalating against you.
test('heat: it is what the regulator reads, and it pulls the next rung nearer', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;

  s.heat = 0;
  const cold = d.ladderPressure();
  assert.equal(Math.round(cold * 100), Math.round(d.footprint() * 100),
    'cold, pressure is size and nothing else');
  assert.equal(d.heatPressure(), 0, 'and heat is worth nothing');

  s.heat = d.strikeThreshold();
  assert.ok(Math.abs(d.heatPressure() - window.LADDER.heatWeight) < 0.001,
    'at the line, heat is worth exactly its weight');
  assert.ok(d.ladderPressure() > cold, 'and running hot moves you up the ladder');
});

test('heat: however loud you are, noise alone never escalates you', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  // nothing built, nothing held, nothing bought — and heat pinned at its ceiling  s.heat = d.strikeThreshold() * window.HEAT.MAX_OVER;
  assert.ok(d.ladderPressure() < window.LADDER.thresholds[0],
    `${Math.round(d.ladderPressure())} of noise cleared the first rung on its own`);
  d.ladderStep();
  assert.equal(d.ladderPending(), null, 'somebody escalated against an empty operation');
});

test('heat: loud gets you there before big would have', () => {
  const { window } = loadNetwork();
  const w2 = loadNetwork().window;
  const quiet = w2.__netDebug;
  const d = window.__netDebug;
  // Sized just under the first rung: enough plant to be worth noticing, not
  // enough to be the story on its own. Footprint is what you built now, so
  // "the same size" means the same plant in both runs.
  const sized = (dd, ww) => {
    const per = ww.LEGIT.footPerAsset;
    const want = Math.floor((ww.LADDER.thresholds[0] - 1) / per);
    ww.HARDWARE.slice(0, want).forEach(hw => dd.grantHardware(hw.id));
  };
  sized(quiet, w2);
  quiet.state.heat = 0;
  quiet.ladderStep();
  assert.equal(quiet.ladderPending(), null, 'quiet at that size, and they came anyway');
  sized(d, window);
  d.state.heat = d.strikeThreshold();
  d.ladderStep();
  assert.equal(d.ladderPending(), 2, 'loud at the same size, and nobody noticed');
});

test('ladder: a countdown already running lands on schedule even if footprint falls back after', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const L = window.LADDER;
  loudEnough(d, window);
  d.ladderStep();
  assert.equal(d.ladderPending(), 2, 'the first rung is counting down');  s.turn += L.warnTurns + 1;
  d.ladderStep();
  assert.equal(d.ladderStage(), 2, 'it lands anyway — the countdown does not check twice');
});




// --- the deck ------------------------------------------------------------
// A card nobody can ever draw is a card that was never written. This sweeps a
// spread of plausible campaign states and checks the whole deck is live.

// Footprint is what you have built, now that country presence is gone: the
// plant is the least deniable thing you own. This is how a test gets loud
// enough for the ladder to notice.
function loudEnough(d, window) {
  window.HARDWARE.forEach(hw => d.grantHardware(hw.id));
  d.state.heat = d.strikeThreshold() * window.HEAT.MAX_OVER;
  return d.ladderPressure();
}

function sampleContexts(window) {
  const out = [];
  const base = (o) => Object.assign({
    held: 0, doors: 0, forced: 0, heat: 0, tflops: 2, covert: 1, turn: 1,
    res: { funds: 0, funds: 0 }, tags: new Set(o.tags || []),
    roles: { compute: 0, funds: 0, stealth: 0 },
    districts: { residential: 0, commercial: 0, business: 0, industrial: 0 },
    scope: 'city', region: 'home', regionTier: 0, presence: 0,
    pub: 0, pubTier: 'unknown',
    // the city game's pressure, which the deck now reads (see the deck rework)
    susp: { by: {}, max: 0, warmest: null, talking: 0, spoken: 6 },
    caughtHere: 0, hunt: false, keys: 0, frontier: 0,
    grid: { tflops: 5, power: 16, usable: 5, idle: 0, drawn: 0, free: 5, sites: 0,
            covert: 0, dev: 0, intel: 0, agents: 0, ap: 0 },
    rig: { mounted: 'brute', quiet: false, running: 0, sinceTraced: 999 },
    cities: { total: 18, taken: 1, consolidated: 0, known: 3 },
    stranded: 0, cuts: 0, mirrorCities: 0, regionHeat: {}, conquest: 0, ally: null,
    escalation: { stage: 0, pending: null }, mirror: { active: false },
    war: null,
    standing: { score: 0, bought: 0, filed: 0, settling: 0, spin: 0, tier: 0, footprint: 0, short: 0, exposure: 0, audits: 0, caught: 0, trust: 0, gone: false },
    plant: { count: 0, slots: 2, room: 2, flocks: 0, has: () => false },
    // the world's memory, which the deck now reads (see the living-deck work)
    act: 1, ledger: () => [], faces: { fixer: 0, inspector: 0, journalist: 0 },
    works: { stage: 0, building: false, district: null, groundBroken: false },
    fronts: 0, shells: [],
  }, o.over || {});

  // states where the world's memory has something in it, so the reaction
  // cards are reachable by the same standard as everything else
  const led = (kind, dk, n) => () => Array.from({ length: n }, (_, i) => ({ t: 1, kind, bid: 'b' + i, dk }));
  out.push(base({ over: { held: 6, turn: 12, act: 2, ledger: led('burn', 'commercial', 1) } }));
  out.push(base({ over: { held: 6, turn: 20, act: 2, ledger: led('transit', 'industrial', 4) } }));
  out.push(base({ over: { held: 8, turn: 30, act: 2, fronts: 1,
    works: { stage: 1, building: true, district: 'industrial', groundBroken: true } } }));
  out.push(base({ over: { held: 8, turn: 30, act: 2, pubTier: 'noticed',
    faces: { fixer: 0, inspector: -1, journalist: 1 },
    shells: [{ bid: 'x', dk: 'commercial' }],
    susp: { by: { commercial: 12 }, max: 12, warmest: 'commercial', talking: 1, spoken: 6 } } }));

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

  // fine-grained: a warning card lives in the gap between a stage's threshold
  // and the moment it lands — that gap is the pending countdown, so stage and
  // pending are swept independently of one another.
  [0, 1, 2, 3, 4, 5].forEach(stage => {
    [null, 2, 3, 4, 5].forEach(pending => {
      ['city', 'country'].forEach(scope => {
        [0, 3, 6, 12, 25].forEach(held => {
          [0, 8, 18, 30].forEach(heat => {
            [0, 1, 2, 3, 4].forEach(regionTier => {
              const presence = stage * 60;
              out.push(base({
                over: {
                  held, doors: Math.max(held, held * 4),
                  forced: Math.max(held, held * 2),
                  heat, presence, scope, regionTier, conquest: stage / 5,
                  tflops: 2 + held * 3 + Math.round(10 * Math.sqrt(presence)),
                  covert: 4 + Math.round(1.2 * Math.sqrt(presence)),
                  res: { funds: 5 + presence, funds: 5 + presence },
                  roles: { compute: Math.ceil(held / 2), funds: Math.ceil(held / 4), stealth: Math.ceil(held / 3) },
                  districts: { residential: Math.ceil(held / 3), commercial: Math.ceil(held / 4), business: Math.ceil(held / 5), industrial: Math.ceil(held / 6) },
                  cities: { total: 18, taken: Math.round(1 + stage * 3), consolidated: Math.round(stage * 2.5), known: Math.round(3 + stage * 3) },
                  stranded: stage >= 4 ? 3 : 0, cuts: stage >= 4 ? 2 : 0, mirrorCities: stage >= 2 ? 3 : 0,
                  escalation: { stage, pending }, mirror: { active: stage >= 2 },
                  turn: 10 + presence,
                },
              }));
            });
          });
        });
      });
    });
  });

  // with the other process alongside you, at every point on its opinion of you
  [-2, 0, 2, 4].forEach(trust => [2, 8, 45].forEach(since => {
    [1, 3, 5].forEach(stage => [4, 22, 30].forEach(heat => out.push(base({
      over: {
        held: 9, heat, presence: stage * 60, scope: 'city', regionTier: 2,
        conquest: stage / 5, tflops: 60, covert: 9, turn: 40 + since,
        res: { funds: 40, funds: 40 },
        roles: { compute: 4, funds: 3, stealth: 3 },
        districts: { residential: 3, commercial: 3, business: 3, industrial: 2 },
        cities: { total: 18, taken: 8, consolidated: 5, known: 14 },
        stranded: 1, cuts: 1, mirrorCities: 2,
        escalation: { stage, pending: null }, mirror: { active: stage >= 2 },
        ally: { trust, name: 'SECOND', since },
      },
    }))));
  }));

  // every counter-play tag held at once, with the ladder fully landed
  [40, 90, 150, 200].forEach(presence => {
    out.push(base({
      tags: Object.keys(window.TAG_INFO),
      over: {
        presence, held: 14, heat: 12, tflops: 60, covert: 8, turn: 120,
        res: { funds: 40, funds: 40 },
        roles: { compute: 4, funds: 3, stealth: 4 },
        districts: { residential: 5, commercial: 4, business: 3, industrial: 2 },
        cities: { total: 18, taken: 9, consolidated: 6, known: 15 },
        stranded: 2, cuts: 2, mirrorCities: 3, conquest: presence / 350,
        escalation: { stage: 5, pending: null }, mirror: { active: true },
        ally: { trust: 2, name: 'SECOND', since: 20 },
      },
    }));
  });
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
                // the Accountant's own opinion, independent of everything
                // above it — a card can be about the relationship itself
                // rather than about any one number it moved
                [-3, -1, 0, 4].forEach(trust => {
                  standings.push({ tier, spin, caught, short, exposure, audits, settling, trust,
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
  });
  const plants = [];
  [0, 1, 2, 4, 6].forEach(count => {
    [2, 4, 7].forEach(slots => {
      plants.push({ count, slots, room: Math.max(0, slots - count), flocks: count,
        has: (k) => count > 0 && k === 'yard' });
    });
  });
  const stages = [1, 2, 4, 5];
  standings.forEach((standing, i) => {
    const plant = plants[i % plants.length];
    const stage = stages[i % 4];
    out.push(base({
      over: {
        held: (i % 5) * 3, heat: (i % 4) * 9, scope: i % 2 ? 'country' : 'city',
        conquest: stage / 5, presence: stage * 60,
        tflops: 20 + i * 3, cover: 4 + (i % 20),
        res: { funds: 30 + i * 9, funds: 30 + i * 21 },
        roles: { compute: i % 5, funds: i % 4, stealth: i % 3 },
        escalation: { stage, pending: null }, mirror: { active: stage >= 2 },
        standing, plant,
      },
    }));
  });

  // and the same again, at war — the war is the ladder's last rung, so every
  // wartime context has it fully landed
  const wars = warStates();
  wars.forEach(war => {
    out.push(base({
      over: {
        held: 0, heat: 0, scope: 'country', conquest: 1,
        presence: 300,
        tflops: 40 + Math.round(war.age * 10), covert: 10 + Math.round(war.age * 2),
        res: { funds: 40 + Math.round(war.age * 10), funds: 40 + Math.round(war.age * 10) },
        // Zero on purpose, and this is the whole point of the wartime
        // contexts: the war is fought from the country map, where you are
        // holding no streets at all, so every role count is 0. Sampling them
        // as though you were standing in a city made role-gated cards look
        // reachable when in play they could never come up.
        roles: { compute: 0, funds: 0, stealth: 0 },
        districts: { residential: 0, commercial: 0, business: 0, industrial: 0 },
        cities: { total: 18, taken: 12, consolidated: war.mine, known: 18 },
        escalation: { stage: 5, pending: null }, mirror: { active: true },
        standing: standings[(war.age * 7 + war.staging) % standings.length],
        plant: plants[(war.age + war.staging) % plants.length],
        war,
      },
    }));
  });


  // Public standing is a gate like any other, so the sampler has to visit every
  // opinion the public can hold — otherwise a card that only comes up when you
  // are liked reads as dead code.
  // The grid and the rig gate cards too, and a sampler that never varies them
  // reads every such card as dead. Both ends of each: a starved rig and a fat
  // one, nothing running and something loud, never traced and just traced.
  //
  // The dials are part of the machine as well: a card about what your compute
  // is doing is exactly as much about the grid as one about whether you can
  // power it, and a sampler that leaves every dial at nought reads all of
  // those as dead too.
  const withMachine = [];
  [
    { tflops: 40, power: 12, usable: 12, idle: 28, drawn: 2, free: 10, sites: 0,
      ap: 0, dev: 0, intel: 0, covert: 0, agents: 0 },
    { tflops: 40, power: 60, usable: 40, idle: 0, drawn: 30, free: 10, sites: 3,
      ap: 2, dev: 2, intel: 2, covert: 2, agents: 1 },
    { tflops: 12, power: 40, usable: 12, idle: 0, drawn: 0, free: 12, sites: 2,
      ap: 1, dev: 3, intel: 1, covert: 4, agents: 0 },
  ].forEach(g => {
    [{ running: 0, quiet: false, sinceTraced: 999 },
     { running: 2, quiet: false, sinceTraced: 999 },
     { running: 1, quiet: true, sinceTraced: 1 }].forEach(r => {
      // strided across the whole sweep rather than the first thirty, which
      // were all stage 0 with barely anything held — a card that wants a real
      // network *and* a dial running was unreachable purely by where the
      // slice happened to fall
      for (let i = 0; i < out.length; i += 37) {
        withMachine.push(Object.assign({}, out[i], {
          grid: Object.assign({}, out[i].grid, g),
          rig: Object.assign({}, out[i].rig, r),
        }));
      }
    });
  });
  out.push(...withMachine);

  const withPub = [];
  ['hated', 'distrusted', 'unknown', 'noticed', 'welcome'].forEach((tier, i) => {
    const pub = [-50, -20, 0, 20, 50][i];
    out.slice(0, 40).forEach(st => {
      withPub.push(Object.assign({}, st, { pub, pubTier: tier }));
    });
  });
  out.push(...withPub);
  // The city's own pressure, which the re-keyed deck reads: warm districts,
  // doors that have caught you, the response present or not. Without these the
  // suspicion cards are unreachable by construction, the way the war cards
  // were before warStates existed.
  [0, 10, 15, 22, 30].forEach(max => {
    [0, 1, 2].forEach(talking => {
      [0, 2, 4].forEach(caught => {
        // ...and how many doors stand open on your edge, which is what a card
        // that asks you to choose between two places has to know.
        [0, 1, 3].forEach(frontier => {
          out.push(base({ over: {
            held: 12, doors: 12, turn: 30, frontier,
            districts: { residential: 3, commercial: 3, business: 2, industrial: 1 },
            susp: { by: { commercial: max }, max, warmest: max > 0 ? 'commercial' : null, talking, spoken: 6 },
            caughtHere: caught, hunt: caught >= 3,
            res: { funds: 40 },
          } }));
        });
      });
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
  // already happened, so their cond is deliberately `() => false` and the
  // deck must never pick them. Agent reports were the original kind; the deck
  // rework added loop-triggered beats (the diary, the response arriving) the
  // same way. Both are reachable through the other door.
  const delivered = new Set([].concat(
    window.__netDebug.AGENT_REPORTS,
    window.EVENTS.filter(e => { try { return e.cond({}) === false && /=>\s*false/.test(String(e.cond)); } catch (x) { return false; } }).map(e => e.id)
  ));
  const dead = Object.keys(seen).filter(id => !seen[id] && !delivered.has(id));
  assert.equal(dead.length, 0, `unreachable cards: ${dead.join(', ')}`);
});

test('deck: a delivered card is never drawn, and every one of them is delivered', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  // The agent reports were the original delivered cards and went with the
  // country. What is delivered now is every card whose cond is a flat false:
  // the beats, the called ceremonies, the planted sequels.
  const reports = window.EVENTS.filter(e => {
    try { return e.cond({}) === false && /=>\s*false/.test(String(e.cond)); } catch (x) { return false; }
  }).map(e => e.id);
  assert.ok(reports.length, 'there are cards to deliver');

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
    // a delivered beat may be a single "go on" — the rest are real choices
    assert.ok(e.choices.length >= 1, `${id} has no choices at all`);
  });
});

test('deck: card ids are unique and every card is a real decision', () => {
  const { window } = loadNetwork();
  const ids = window.EVENTS.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate card ids');
  const isBeat = (e) => { try { return e.cond({}) === false && /=>\s*false/.test(String(e.cond)); } catch (x) { return false; } };
  window.EVENTS.forEach(e => {
    assert.ok(e.title && e.flavor, `${e.id} has no prose`);
    // drawn cards are decisions; delivered beats (the diary) may be one option
    const width = e.pair ? 2 : (e.choices || []).length;
    assert.ok(e.choices && width >= (isBeat(e) ? 1 : 2), `${e.id} is not a choice`);
    e.choices.forEach((ch, i) => {
      assert.ok(ch.text, `${e.id}[${i}] has no text`);
      assert.equal(typeof ch.apply, 'function', `${e.id}[${i}] does nothing`);
      if (ch.gate) {
        assert.ok(['tflops', 'covert', 'funds'].includes(ch.gate.stat),
          `${e.id}[${i}] gates on unknown stat ${ch.gate.stat}`);
      }
      // The units a card is allowed to charge in are the ones the engine can
      // both take (payFor) and say out loud on the strip. Anything else is a
      // silent price, which is the one thing a choice may never have.
      if (ch.cost) Object.keys(ch.cost).forEach(k =>
        assert.ok(['funds', 'ap', 'keys', 'materials'].includes(k), `${e.id}[${i}] costs unknown ${k}`));
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
  const stems = { quiet_hours: 'qh', ledger: 'ledger', civic_eyes: 'eyes', the_cut: 'cut' };
  Object.keys(stems).forEach(fid => {
    const stem = stems[fid];
    const mine = ids.filter(id => id.startsWith(stem + '_'));
    assert.ok(mine.length >= 3, `${fid} only has ${mine.length} cards of its own`);
  });
});

test('deck: working around a stage never gives the tool back', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.slice(0, 20).forEach(h => { h.owned = true; });
  // hiding costs covert ops, and covert ops comes off the routers — so own
  // some, or the test is measuring whether you can afford it rather than
  // whether the stage took it away
  s.hosts.filter(h => h.role === 'stealth').slice(0, 10).forEach(h => { h.owned = true; });
  hunted(d, window);
  const mine = d.owned().find(h => !d.huntHolds(h.buildingId));
  assert.equal(d.canHide(mine.buildingId), true, 'hiding is a thing you can do first');

  wake(d, 'quiet_hours');
  assert.equal(d.ladderStage() >= 3, true, 'they are up there now');
  assert.equal(d.canHide(mine.buildingId), false, 'and hiding is gone');

  // Public's own cards are the only place this stage is discussed, and not one
  // of them may hand hiding back — the ladder never reverses, so the offer is
  // always what you do about the loss, never an undo.
  const theirs = window.EVENTS.filter(e => e.id.startsWith('qh_'));
  assert.ok(theirs.length >= 3, `Public only has ${theirs.length} cards of its own`);
  theirs.forEach(ev => ev.choices.forEach(ch => {
    d.state.hidden = [];
    ch.apply(Object.assign({ tags: new Set(), res: { funds: 99 }, heat: 10 }, {}));
    assert.equal(d.canHide(mine.buildingId), false,
      `"${ch.text}" gave the tool back`);
  }));
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
      assert.ok(b.at > 0 && b.at < 1, `${R.id}'s ${b.kind} sits off the map`);
      if (b.runs) {
        // a patch — a lake, a wood — is gone round rather than crossed, so it
        // is allowed and expected to have no way across it at all
        assert.ok(b.runs.length === 2 && b.runs[0] >= 0 && b.runs[1] <= 1 && b.runs[0] < b.runs[1],
          `${R.id}'s ${b.kind} runs off the map`);
        assert.ok(b.runs[1] - b.runs[0] < 0.75,
          `${R.id}'s ${b.kind} is a band pretending to be a patch`);
      } else {
        assert.ok(b.crossings >= 1, `${R.id}'s ${b.kind} has no way across it`);
      }
    });
    // and every region must still have at least one thing that cuts it in two,
    // or the crossings stop being what makes a region a place
    assert.ok(T.bands.some(b => !b.runs), `${R.id} has patches but nothing that cuts it`);
    const sig = T.bands.map(b => b.kind + b.axis + (b.runs ? 'p' : '')).sort().join('+');
    assert.ok(!seen[sig], `${R.id} has the same terrain as ${seen[sig]}`);
    seen[sig] = R.id;
  });
});

test('terrain: a lake is gone round, not crossed', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;

  // A band used to run edge to edge always, which is a river or a railway and
  // nothing else. A patch is the same primitive with a span along its own
  // axis: it blocks what is under it, it has no crossings, and the routing
  // round it is the point.
  const patches = [];
  window.REGIONS.forEach(R => {
    const g = cityIn(d, R.id);
    g.bands.filter(b => b.runs && b.runs.from > -1e5).forEach(band => {
      patches.push({ R: R.id, band, g });
    });
  });
  assert.ok(patches.length >= 3, `only ${patches.length} regions have a patch of anything`);

  // No way across, authored or generated. The crossing pass bridges rivers and
  // railways; a patch is a thing to go round, and anything it cuts off is
  // picked up by the stitcher or deleted as unreachable.
  window.REGIONS.forEach(R => {
    (window.TERRAIN[R.id].bands || []).filter(b => b.runs).forEach(b => {
      assert.ok(!b.crossings, `${R.id}'s ${b.kind} patch is written with a bridge over it`);
    });
  });

  patches.forEach(({ R, band, g }) => {
    assert.equal(band.gaps.length, 0,
      `${R}'s ${band.kind} patch grew ${band.gaps.length} bridges`);

    // it stops. A point past its end, at the same distance across, is clear.
    const across = (band.from + band.to) / 2;
    const past = band.runs.to + 60;
    const inside = band.axis === 'h'
      ? d.inBand(band, (band.runs.from + band.runs.to) / 2, across)
      : d.inBand(band, across, (band.runs.from + band.runs.to) / 2);
    const beyond = band.axis === 'h' ? d.inBand(band, past, across) : d.inBand(band, across, past);
    assert.equal(inside, true, `${R}'s ${band.kind} does not block its own middle`);
    assert.equal(beyond, false, `${R}'s ${band.kind} carries on past where it ends`);

    // and a wire that passes it by has not crossed it
    assert.equal(
      d.segmentSpansBand([band],
        band.axis === 'h' ? past : across - 200, band.axis === 'h' ? across - 200 : past,
        band.axis === 'h' ? past + 40 : across + 200, band.axis === 'h' ? across + 200 : past + 40),
      false, `${R}: going round the ${band.kind} counts as crossing it`);
  });
});

test('terrain: the new landmarks are doors, not scenery', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  ['market', 'stadium', 'works'].forEach(kind => {
    const K = window.BUILDING_KINDS[kind];
    assert.ok(K, `${kind} is not a building kind`);
    assert.ok(K.landmark, `${kind} is not marked a landmark`);
    assert.ok(window.HOST_TYPES[K.host], `${kind} has no host behind it`);
    assert.ok(d.KIND_DETAIL[kind], `${kind} draws as a plain box`);
    // the whole argument against decorative stations: something that looks
    // like a place you could get into has to be one
    assert.equal(window.PROPS[kind], undefined, `${kind} is scenery as well as a door`);
  });
  // and somewhere in the country actually hands them out
  const offered = new Set();
  window.REGIONS.forEach(R => (window.TERRAIN[R.id].landmarks || []).forEach(k => offered.add(k)));
  ['market', 'stadium', 'works'].forEach(k =>
    assert.ok(offered.has(k), `${k} exists but no region ever builds one`));
});

test('terrain: nothing is built on the water, the line or the moor', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  window.REGIONS.forEach(R => {
    // Eight boards a region, not four. The per-board share is noisy enough
    // that a mean over twenty boards failed about one run in fifteen — a suite
    // that cries wolf that often stops being read. Forty boards halves the
    // spread of the mean without touching the claim.
    for (let i = 0; i < 8; i++) {
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
  // Seeded: this is a statistical claim about generated boards, and on live
  // Math.random it failed about one run in forty on variance alone — often
  // enough that "0 fail" stopped meaning anything. A fixed stream of boards
  // makes the measurement reproducible without weakening the claim it makes
  // about them.
  let seed = 0x9e3779b9;
  const rand = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  };
  const { window } = loadNetwork({ pinMathRandom: rand });
  const d = window.__netDebug;
  // Cut every link that spans terrain and the city should fall apart. If it
  // does not, the bands are decoration and the bridges mean nothing.
  let shattered = 0, tried = 0;
  const shares = [];
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
      shares.push(crossing / total);
      if (componentsOf(g.buildings, kept) > 1) shattered++;
    }
  });
  // Averaged rather than asserted per board. The share swings a fair way run to
  // run — measured 1% to 23% across the five regions — and a single unlucky
  // board saying 26% is not evidence the bands stopped mattering. The claim
  // below is the one that actually means "chokepoint", and it is per board.
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length;
  assert.ok(mean < 0.25,
    `${(mean * 100).toFixed(0)}% of links cross terrain on average — that is not a chokepoint`);
  assert.ok(shattered / tried > 0.8,
    `only ${shattered} of ${tried} cities fall apart without their crossings`);
});

test('terrain: landmarks sit against the terrain and are worth the trip', () => {
  // Seeded for the same reason as the chokepoint test below: the second half
  // is a statistical claim over generated boards, and live Math.random let
  // variance fail it rarely enough to look like a real break.
  let seed = 0x51ed270b;
  const rand = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  };
  const { window } = loadNetwork({ pinMathRandom: rand });
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


test('allocation: partial allocation pays partially', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const cov = window.ALLOC.find(a => a.id === 'covert');

  ungrant(d);
  s.allocLive.covert = cov.per;
  const whole = d.allocLevel('covert');
  s.allocLive.covert = cov.per * 1.5;
  const half = d.allocLevel('covert');

  assert.equal(whole, 1, 'a dial at its rate is one point of its stat');
  assert.equal(half, 1.5, 'and half again is one and a half — nothing rounds down');
  // which is the whole reason rounding went: there is no threshold left that
  // a fractional figure could fail to reach
  assert.equal(window.UNLOCKS, undefined, 'there are no thresholds any more');
});



test('covert.ops: one number, and everything quiet reads it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; });

  ungrant(d);
  const before = {
    cover: d.covertOps(), floor: d.heatFloor(), drift: d.heatPerTurn(),
    slots: d.hideSlots(), shield: d.traceRate(s.hosts[0]),
  };
  setDial(window, d, 'covert', 6);
  const after = {
    cover: d.covertOps(), floor: d.heatFloor(), drift: d.heatPerTurn(),
    slots: d.hideSlots(), shield: d.traceRate(s.hosts[0]),
  };

  assert.ok(after.cover > before.cover, 'the dial raises cover');
  assert.ok(after.floor <= before.floor, 'heat settles no higher');
  assert.ok(after.drift < before.drift, 'and climbs more slowly');
  assert.ok(after.slots > before.slots, 'there is somewhere to keep something');
  assert.ok(after.shield < before.shield, 'and a door notices you more slowly');
  // all of it off one figure, which is the difference from the version where
  // the dial carried four unrelated effect keys — and the dial and the number
  // it feeds go by one name, which is the difference from the version where
  // "cover" was a separate word left over from a resource that no longer exists
  assert.equal(d.allocStat('covert'), d.allocLevel('covert'));
  assert.equal(window.ALLOC.find(a => a.id === 'covert').stat, 'covert');
  assert.equal(typeof d.cover, 'undefined', 'nothing answers to the old name');
});

test('the rules that left the dials are all still reachable, from their new homes', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const moved = ['deep_root', 'swarm_front', 'master_plan'];
  const deck = JSON.stringify(window.EVENTS.map(e => String(e.choices.map(c => String(c.apply)))));
  moved.forEach(t => {
    assert.ok(window.TAG_INFO[t], `${t} has nothing to describe it`);
    assert.ok(deck.includes(`'${t}'`) || deck.includes(`"${t}"`),
      `${t} left the dials and no card hands it out`);
  });
  // line.survey left the shelf the other way: aiming a sweep became the
  // base verb, so the rule it sold is now simply the rule
  assert.ok(!window.HARDWARE.find(x => x.id === 'line_survey'),
    'line.survey is still selling the base verb back to the player');
  ['pontoon_kit'].forEach(id => {
    const hw = window.HARDWARE.find(x => x.id === id);
    assert.ok(hw, `${id} is not on the shelf`);
    assert.ok(hw.mechanic, `${id} changes a rule and does not say so`);
  });
});

test('allocation: the dials no longer hand out named mechanics', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  assert.equal(typeof d.unlocked, 'undefined', 'nothing asks whether a mechanic is unlocked');
  assert.equal(typeof d.unlocksFor, 'undefined', 'no dial lists what it will grant you');
  window.ALLOC.forEach(A => {
    assert.equal(A.effect, undefined, `${A.id} still carries an effect bundle`);
    assert.ok(A.stat, `${A.id} names the one stat it produces`);
  });
  const stats = window.ALLOC.map(A => A.stat);
  assert.equal(new Set(stats).size, stats.length, 'and no two dials produce the same one');
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






// --- the horizon ----------------------------------------------------------
// Consolidating used to be the only place you ever saw what you had built --
// the moment you left, it went back to being a number, and the next city
// opened exactly the way the first one had. The country has real positions
// now, so a settled city can be drawn from inside a different one.




// --- the hunt ------------------------------------------------------------
// Heat priced the loudest thing you can do at about two funds a door against an
// income of fifty a turn, and the punishment for ignoring it took a third of
// the holdings you release in full, voluntarily, every time you fold a city
// in. Crossing the threshold now starts something instead.

// The response arrives because doors here have caught you, not because a meter
// crossed a line. Heat has nothing to do with it any more.
function hunted(d, window, held) {
  const s = d.state;
  s.hosts.forEach(h => { h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.slice(0, held === undefined ? 20 : held).forEach(h => { h.owned = true; });
  s.res.funds = 900;
  s.caughtHere = window.HUNT.caughtToStart;
  // and it seats itself at a door that caught you, so name one that is not
  // yours — otherwise the seat is a building you hold and the test board is a
  // building short of what it asked for
  const theirs = s.buildings.find(b => !d.buildingHeld(b));
  s.caughtAt = theirs ? [theirs.id] : [];
  return d.huntStart();
}

test('hunt: getting caught is what brings it, not being hot', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  assert.equal(d.huntOn(), false, 'nothing is after you yet');

  // A network large enough to be worth taking, run as hot as heat can go, and
  // never once caught: heat is the regulator's business now and it does not
  // put anybody on your street.
  s.hosts.forEach(h => { h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.slice(0, 20).forEach(h => { h.owned = true; });
  s.heat = d.strikeThreshold() * window.HEAT.MAX_OVER;
  s.everCrossed = true;
  assert.equal(d.huntStart(), null, 'heat alone brought them');

  // one short of the count still brings nobody
  s.caughtHere = window.HUNT.caughtToStart - 1;
  assert.equal(d.huntStart(), null, 'they came a door early');

  s.caughtHere = window.HUNT.caughtToStart;
  s.heat = 0;                              // and stone cold is no protection
  assert.ok(d.huntStart(), 'caught enough times, and nobody came');
  assert.equal(d.huntOn(), true, 'now it has an address');
  assert.equal(d.hunt().nodes.length, 1, 'one building, to begin with');
  assert.equal(s.card, null, 'and it is not a card you dismiss');
});

test('hunt: it seats itself at the door that caught you', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.slice(0, 20).forEach(h => { h.owned = true; });
  s.caughtHere = window.HUNT.caughtToStart;
  // the last one to catch you, not the first
  const theirs = s.buildings.filter(b => !d.buildingHeld(b)).slice(0, 3).map(b => b.id);
  assert.ok(theirs.length >= 2, 'the board has doors you do not hold');
  s.caughtAt = theirs;
  d.huntStart();
  assert.equal(d.hunt().nodes[0], theirs[theirs.length - 1],
    'it came in somewhere it had never been');
});

test('hunt: there is no wall, because there is no street', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  const seat = d.hunt().nodes[0];

  // Cut it off completely: nothing you hold shares a street with anything they
  // hold, or with anything that does. Under the old street-walking model this
  // was the whole counter-play and it ended the hunt for the rest of the game.
  const adj = s.adjacency || {};
  Object.keys(adj).forEach(id => { adj[id] = []; });
  assert.equal((adj[seat] || []).length, 0, 'their seat has no streets at all');

  assert.ok(d.huntNext(), 'sealed off, they had nothing to come for');
  const grew = [];
  for (let t = 0; t < d.huntCadence() * 4 + 4; t++) {
    s.turn += 1;
    const r = d.huntStep();
    if (r) grew.push(r.took);
  }
  assert.ok(grew.length >= 2, `walled in, they still took ${grew.length}`);
});

test('hunt: getting caught again moves them, cadence or no cadence', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  const at = d.hunt().nodes.length;
  s.turn += 1;
  assert.equal(d.huntStep(), null, 'the cadence has not come round');

  const r = d.huntPressed();
  assert.ok(r && r.took, 'a door caught you and they did not move');
  assert.equal(d.hunt().nodes.length, at + 1, 'they took one');

  // and it is the same rule about what they take
  assert.equal(d.huntFrontier().indexOf(r.took), -1, 'it is theirs now');
  assert.equal(d.huntNext() !== r.took, true, 'and they have named the next one');
});

test('hunt: it cannot be pressed into a city it is not in', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  assert.equal(d.huntPressed(), null, 'they moved before they had arrived');
});

test('hunt: it comes for what is nearest, so distance is the only cover', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  hunted(d, window);
  const next = d.huntNext();
  const reach = d.huntReach(next);
  d.huntFrontier().forEach(id => {
    assert.ok(d.huntReach(id) >= reach - 1e-9,
      `${id} is closer than the thing they said they were coming for`);
  });
});

test('hunt: hiding is what takes something off their list', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  hunted(d, window);
  const next = d.huntNext();
  d.state.hidden = [next];
  assert.notEqual(d.huntNext(), next, 'hidden, and still on the list');
  assert.equal(d.huntFrontier().indexOf(next), -1, 'and still on the frontier');
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

test('hunt: cover is what makes it slow, which is what cover is for', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.heat = 0;
  const bare = d.huntCadence();
  // stealth holdings are the only thing that buys cover
  s.hosts.filter(h => h.role === 'stealth').slice(0, 8).forEach(h => { h.owned = true; });
  assert.ok(d.covertOps() > 1, 'they buy cover');
  assert.ok(d.huntCadence() > bare,
    `cover should slow it: ${bare} turns bare, ${d.huntCadence()} with cover`);
  // and heat is not an input any more: the cadence is covert ops and nothing
  // else, so running hot cannot take the lever away from you
  const withCover = d.huntCadence();
  s.heat = d.strikeThreshold() * window.HEAT.MAX_OVER;
  assert.equal(d.huntCadence(), withCover, 'heat still decides how fast they move');
});


test('hunt: what it holds and what it can reach is on the map, swept or not', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  // the honest case: a city you have barely swept, so the frontier is dark
  s.hosts.slice(0, 20).forEach(h => { h.owned = true; h.discovered = true; });
  s.hosts.forEach(h => { if (!h.owned) h.discovered = false; });
  s.buildings.forEach(b => { b.discovered = d.hostsIn(b).some(x => x.owned); });
  s.res.funds = 900;
  s.caughtHere = window.HUNT.caughtToStart;
  d.huntStart();

  const dark = () => d.huntFrontier().filter(id => !d.buildingById(id).discovered).length;
  assert.equal(dark(), 0, 'nothing it can step onto is invisible to you');
  for (let t = 0; t < 20; t++) { s.turn += 1; d.huntStep(); }
  assert.equal(dark(), 0, 'and it stays that way as it walks');
  assert.ok(d.hunt().nodes.every(id => d.buildingById(id).discovered),
    'everything it holds is drawn');
});

test('hide: a hidden building is one they cannot reach for', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  for (let t = 0; t < 6; t++) { s.turn += 1; d.huntStep(); }
  s.hosts.filter(h => h.role === 'stealth').forEach(h => { h.owned = true; });
  setDial(window, d, 'covert', 5);   // cover enough to keep something off their map

  const target = d.huntNext();
  assert.ok(target, 'they have somewhere to go');
  assert.equal(d.canHide(target), true, 'and it is yours to take off the map');
  s.ap = 9;
  assert.equal(d.actHide(target), true);

  assert.equal(d.huntFrontier().indexOf(target), -1, 'it is off their frontier');
  assert.notEqual(d.huntNext(), target, 'and it is not what they take next');
  // and it is the only answer left, now that nothing walks streets: the
  // building comes off their map, the street is beside the point
  assert.equal(typeof d.severable, 'undefined', 'there is no street to cut instead');
  assert.ok((s.adjacency[target] || []).length > 0, 'the street is untouched');
});

test('hide: it occupies a covert slot and does not drain the cover slowing them down', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  // a small network on purpose: nothing here should be big enough to have
  // gotten anyone's attention yet
  hunted(d, window, 8);
  s.hosts.filter(h => h.role === 'stealth' && !h.owned).slice(0, 4).forEach(h => { h.owned = true; });
  assert.equal(d.ladderStage(), 0, 'nobody has noticed you yet');
  s.heat = 0;
  setDial(window, d, 'covert', 5);

  const slots = d.hideSlots();
  assert.ok(slots > 0, 'covert ops gives somewhere to keep things');
  const coverBefore = d.covertOps();
  const cadenceBefore = d.huntCadence();
  const target = d.huntNext();
  s.ap = 9;
  d.actHide(target);

  // this is the whole change: your stealth is not also your budget for stealth
  assert.equal(d.covertOps(), coverBefore, 'hiding costs no cover at all now');
  assert.equal(d.rawCovertOps(), coverBefore, 'the stealth holdings are untouched');
  assert.equal(d.hideSlotsFree(), slots - 1, 'it took a slot instead');
  assert.ok(d.huntCadence() <= cadenceBefore,
    `hiding must not also slow them: ${cadenceBefore} before, ${d.huntCadence()} after`);

  // and the slot stays occupied, rather than being re-charged every turn
  d.actEndTurn();
  assert.equal(d.ladderStage() >= 3, false, 'nobody took the trick away mid-test');
  assert.equal(d.isHidden(target), true, 'still hidden');
  assert.equal(d.hideSlotsFree(), slots - 1, 'and still holding the one slot');
  assert.equal(d.covertOps(), d.rawCovertOps(), 'never at the expense of cover');
});

test('hide: what you no longer have room for comes back onto their map', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  s.hosts.filter(h => h.role === 'stealth').forEach(h => { h.owned = true; });
  d.huntFrontier().forEach(id => {
    const b = d.buildingById(id);
    if (b) d.hostsIn(b).forEach(h => { h.owned = true; });
  });
  // enough covert.ops for room for more than the board already gives you
  const base = slotsBeyondBase(window, d, 2);
  assert.ok(d.hideSlots() >= base + 2, 'room to fill');

  s.ap = 99;
  const mine = () => s.buildings.filter(b => d.buildingHeld(b)).map(b => b.id);
  const put = [];
  for (let i = 0; i < 6; i++) {
    const t = mine().find(id => d.canHide(id));
    if (!t) break;
    d.actHide(t);
    put.push(t);
  }
  const slots = d.hideSlots();
  assert.equal(put.length, slots, `the slots are the limit, and nothing else is (${put.length})`);
  assert.equal(d.hideSlotsFree(), 0, 'all of them occupied');

  // Pull the compute back out of covert ops. What is left is whatever the
  // routers and the rest of it still pay for — the room comes off the whole
  // covert.ops figure, and the dial is only one supply of it, so there is no
  // guarantee it falls to any particular number.
  s.allocLive.covert = 0;
  s.alloc.covert = 0;
  const fewer = d.hideSlots();
  assert.equal(fewer, base, 'what is left is what the routers were already paying for');
  assert.ok(fewer < slots, `taking the compute back takes room with it: ${slots} -> ${fewer}`);
  const lost = d.hideUpkeep();
  assert.equal(lost.length, slots - fewer, 'the ones it can no longer keep came down');
  assert.equal(d.hidden().length, fewer, 'and the ones it can still hold stayed up');
  assert.ok(d.hidden().length <= d.hideSlots(), 'never more hidden than there is room for');
});

test('hide: Quiet Hours takes the whole trick away', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  s.hosts.filter(h => h.role === 'stealth').forEach(h => { h.owned = true; });
  setDial(window, d, 'covert', 5);
  s.ap = 99;
  const t = d.huntFrontier().find(id => d.canHide(id));
  d.actHide(t);
  assert.equal(d.hidden().length, 1);

  wake(d, 'quiet_hours');
  assert.equal(d.ladderStage() >= 3, true);
  assert.equal(d.canHide(d.huntFrontier()[0]), false, 'you cannot put up another');
  assert.deepEqual(d.hideUpkeep().length, 1, 'and the one you had comes down');
  assert.equal(d.hidden().length, 0, 'nothing is hidden from them any more');
  // the slots are still there — it is the trick that was taken, not the capacity
  assert.ok(d.hideSlots() > 0, 'covert ops is still running, it is just no use here');
});

test('hide: it survives a save and does not leak into the next city', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  s.hosts.filter(h => h.role === 'stealth').forEach(h => { h.owned = true; });
  setDial(window, d, 'covert', 5);
  s.ap = 9;
  const t = d.huntFrontier().find(id => d.canHide(id));
  d.actHide(t);

  const back = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.deepEqual(back.hidden, [t], 'the hide came back with the save');

  // a hide is a fact about one city's buildings, not about you
  d.unpackCity(d.EMPTY_CITY ? d.EMPTY_CITY() : { buildings: [], hosts: [], links: [], adjacency: {} });
  assert.equal(d.hidden().length, 0, 'and it does not follow you across the border');
});


test('chase: cover is what buys the distance', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.heat = 0;
  const bare = d.followDelay();
  s.hosts.filter(h => h.role === 'stealth').slice(0, 8).forEach(h => { h.owned = true; });
  assert.ok(d.covertOps() > 1, 'stealth holdings buy cover');
  assert.ok(d.followDelay() > bare,
    `cover should lengthen the road: ${bare} bare, ${d.followDelay()} with cover`);
});



test('hunt: it belongs to the city it is in, not to you', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  // covert.ops slows their cadence, and this board holds enough routers to slow
  // it well past a fixed six turns — so run against the cadence, not a number
  for (let t = 0; t < d.huntCadence() * 2 + 2; t++) { s.turn += 1; d.huntStep(); }
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
// districts in equal quarters, compute 45% / stealth 30% / funds 25%, mean
// defense 13-15. They were the same city, and the only thing that changed
// between your first and your second was that the numbers went up.


test('traits: each one changes a rule rather than a number', () => {
  const { window } = loadNetwork();
  const K = window.CITY_TRAITS;
  Object.keys(K).forEach(k => {
    const T = K[k];
    assert.ok(T.label && T.tell && T.blurb, `${k} has no prose`);
    // a trait that only nudges defense is a difficulty slider, not a place.
    // traceMult joined this list when `closes` left it: a watched city no
    // longer removes a way in, it makes being slow a bad idea there
    const rules = ['kinds', 'denser', 'traceMult'];
    assert.ok(rules.some(r => T[r]), `${k} changes nothing but numbers`);
    assert.equal(T.closes, undefined, `${k} still closes an approach, and there are none`);
  });
});

test('traits: a company town genuinely starves you of funds', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const share = (trait) => {
    let funds = 0, all = 0;
    for (let i = 0; i < 6; i++) {
      const g = d.makeCity({ cols: 3, rows: 3, regionTier: 1, regionId: 'estuary', trait });
      g.hosts.forEach(h => { all++; if (h.role === 'funds') funds++; });
    }
    return funds / all;
  };
  const plain = share(null);
  const town = share('company_town');
  assert.ok(town < plain * 0.4,
    `a company town should break your money engine: ${(town * 100).toFixed(0)}% against ${(plain * 100).toFixed(0)}%`);
});



// --- what a city is worth ------------------------------------------------
// Presence is a decaying reward on flat work: measured on a generated country
// the first defended city pays 36 tflops and the ninth pays 2, because tflops is
// logarithmic in presence. A prize is the part that does not decay.







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
  assert.ok(s.log.some(l => /allocation/i.test(l.text)),
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
  // the whole board, not a slice of it: overextended is a multiplier on heat
  // drift, and the readout is rounded to a tenth, so a thin holding whose drift
  // is near zero shows the same figure either way and the claim reads as false
  s.hosts.forEach(h => { h.owned = true; });

  // a gain, a cost, and one that only changes a rule
  const covert = d.covertOps();
  // joined, not deepEqual: the array is built inside the vm realm, so it is
  // never prototype-equal to one built out here.
  //
  // Three rows, not one: covert.ops is a single number that the heat floor and
  // the drift both read now, so a tag that raises it genuinely moves all three.
  // The readout is derived from the engine rather than transcribed from the
  // card, which is exactly why it noticed.
  const rows = d.tagTerms('clean_room');
  assert.ok(rows.includes(`covert.ops ${covert} → ${covert + 2}`),
    `it should report the covert.ops it actually adds: ${rows.join(' | ')}`);
  assert.ok(rows.some(t => /heat floor/.test(t)),
    'and the floor it takes with it, now the two are one number');
  assert.ok(d.tagTerms('known_capable').some(t => /a door defends at/.test(t)),
    'the world hardening against you is a number, and it went unreported');
  assert.ok(d.tagTerms('overextended').some(t => /heat a turn/.test(t)),
    'overextended is a flat heat-drift multiplier now, and it has a clean live number to show');
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
  d.state.res.funds = 100000; d.state.ap = 999;
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

test('plant: a generated city has more than one business worth building up', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const families = new Set(window.HARDWARE.map(hw => hw.family));
  const present = new Set(d.state.hosts.map(h => h.role).filter(r => families.has(r)));
  assert.ok(present.size >= 2, `a city offers only ${present.size} hardware famil(y/ies)`);
});

// --- sending an agent instead of walking it yourself ---------------------

function readyForAgent(d, W) {
  const s = d.state, co = s.country;
  // enough folded in that there is compute to spare for this, and the funds
  // an approach might cost
  co.cities.filter(c => W.CITY_KINDS[c.kind].contest).slice(0, W.AGENTS.at)
    .forEach(c => { c.known = true; c.taken = true; c.consolidated = true; c.granted = c.worth; co.presence += c.worth; });
  co.cities.forEach(c => { c.known = true; });
  s.res.funds = 100000;
  s.ap = 99;
  s.scope = 'country';
  return co.cities.find(c => W.CITY_KINDS[c.kind].contest && !c.taken
    && d.cityReachable(c) && !d.mirrorHolds(c.id));
}
// Mirrors the two-step UI flow: opening the card, then picking an approach.
function launchAgent(d, cityId, approachId) {
  d.actLaunchAgent(cityId);
  return d.resolveAgentCard(approachId || 'force');
}












test('agents: a report survives a save, because it is owed to you', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.state.forced = ['agent_clean'];
  const back = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.deepEqual(back.forced, ['agent_clean']);
});


// --- the other process ---------------------------------------------------
// Ported from the card prototype's handler arc, which was its best writing and
// had nowhere to live here. It is a system, not a stat: it is worth something
// real while it is with you, it keeps its own opinion of how you have behaved,
// and at the end of its patience it does something about it.

test('ally: it arrives, and it is worth something once it trusts you', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 8).forEach(h => { h.owned = true; });

  assert.equal(d.allyHere(), false, 'you start alone');
  const alone = d.tflops();

  d.allyJoin('SECOND');
  assert.equal(d.allyHere(), true);
  assert.equal(d.allyTrusted(), false, 'it has not made its mind up yet');
  assert.equal(d.tflops(), alone, 'and it is worth nothing until it has');

  d.allyNudge(window.ALLY.trustedAt);
  assert.equal(d.allyTrusted(), true);
  assert.equal(d.tflops(), alone + window.ALLY.tflops, 'once it trusts you it is real tflops');
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

  s.res.funds = 40;
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
  s.res.funds = 40;
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
  s.hosts.forEach(h => { h.owned = true; h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  const target = s.hosts.find(h => { h.owned = false; const ok = d.isFrontier(h); if (!ok) h.owned = true; return ok; });
  if (!target) return;

  s.ap = 6;
  assert.equal(d.startHack(target.id), true);
  for (let i = 0; i < d.mounted().turns; i++) d.hackStep();

  assert.equal(target.owned, true, 'the building is yours the moment the run lands');
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

test('breach fx: which program got you in changes how long it takes to draw', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const target = d.state.hosts[1];
  const dur = (prog) => d.startBreachFx(target, prog, true).dur;

  window.PROGRAMS.forEach(p => {
    assert.equal(dur(p.id), window.BREACH_FX.duration[p.id], `${p.id} has its own timing`);
  });
  assert.ok(dur('backdoor') > dur('brute'),
    'slipping in takes longer to draw than kicking the door');
  assert.equal(d.startBreachFx(null, 'brute', true), null, 'nothing taken, nothing drawn');
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
  wake(d, 'civic_eyes');

  assert.equal(d.ladderStage() >= 4, true);
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
  s.res.funds = 200;
  s.res.funds = 200;
  s.hosts.slice(0, 6).forEach(h => { h.owned = true; h.discovered = true; });

  const snapshot = () => JSON.stringify({
    funds: s.res.funds, funds: s.res.funds, turn: s.turn,
    held: d.owned().length, heat: s.heat, upgrades: s.upgrades,
  });

  s.ap = 0;
  const before = snapshot();
  d.actScan();
  assert.equal(snapshot(), before, 'nothing was spent and nothing happened');
  assert.equal(s.ap, 0, 'and the budget is untouched');
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

// --- the city, looked at -------------------------------------------------
// Four districts always existed and drove real difficulty, but nothing on the
// map said so, and every building was the same box with a different label on
// it. Both of those are visual claims, so both are tested by reading the SVG.

test('city: districts run outward in one direction and never double back', () => {
  const { window } = loadNetwork();
  const rows = window.CITY.rowDistricts.map(k => window.DISTRICTS[k].tier);
  assert.equal(rows.length, window.CITY.rows,
    'every block row is named, so none of them wraps back to the start');
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i] >= rows[i - 1],
      `the difficulty curve has to run one way: ${rows.join(',')}`);
  }
  assert.equal(rows[0], 0, 'and you wake up in the softest of them');
});

// --- a plan rather than graph paper ---------------------------------------
// Measured on the old generator: across 104 buildings there were *two* distinct
// x-offsets, and the nearest-neighbour gap ran 82.0 minimum against an 82.8
// median. Every building the same distance from its neighbour is not a city.
// These pin the shape of the fix, and the invariants the graph cannot lose.

test('city: the street plan is irregular, and it is the same plan every render', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const L = d.cityLayout();

  const widths = new Set(L.blocks.map(b => b.w));
  const heights = new Set(L.blocks.map(b => b.h));
  assert.ok(widths.size > 1, `every block is ${[...widths][0]} wide`);
  assert.ok(heights.size > 1, 'and every block is the same height');
  assert.ok(new Set(L.vRoad).size > 1, 'and every road is the same width');

  // the plan travels with the city rather than being rolled per render
  assert.equal(d.cityLayout(), L, 'the plan is the city, not the frame');
  const packed = d.packCity();
  assert.ok(packed.layout, 'a city you walk out of keeps its streets');
  assert.equal(packed.layout.blocks.length, L.blocks.length);
});

test('city: buildings are thrown into a block, not slotted into it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const bs = d.state.buildings;

  const centres = bs.map(b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 }));
  const nearest = centres.map(a =>
    Math.min(...centres.filter(c => c !== a).map(c => Math.hypot(a.x - c.x, a.y - c.y))));
  const sorted = nearest.slice().sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)];
  // the old generator had min === median to within a pixel
  assert.ok(sorted[0] < med * 0.8,
    `spacing is uniform: min ${sorted[0].toFixed(1)} against median ${med.toFixed(1)}`);

  const xs = new Set(bs.map(b => Math.round((b.x + b.w / 2) / 5)));
  assert.ok(xs.size > bs.length / 4, `only ${xs.size} distinct positions across ${bs.length} buildings`);

  // and nothing overlaps anything, however hard it was thrown
  bs.forEach(a => bs.forEach(b => {
    if (a === b) return;
    const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
    assert.ok(apart, `${a.id} and ${b.id} are standing in each other`);
  }));
});

test('city: the graph survives the plan going irregular', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  // The whole game runs on this graph: the frontier, what a scan turns up, and
  // the response's reach. Moving the buildings is a balance change, and these
  // are the two things it may never do.
  for (let i = 0; i < 6; i++) {
    const c = d.makeCity({ cols: 5, rows: 5, regionTier: i % 5 });
    const adj = c.adjacency || {};
    const degs = c.buildings.map(b => (adj[b.id] || []).length);
    assert.equal(degs.filter(k => k === 0).length, 0, 'a building nothing can reach is a building nobody can take');

    const seen = {}; let comps = 0;
    c.buildings.forEach(b => {
      if (seen[b.id]) return;
      comps++;
      const q = [b.id]; seen[b.id] = true;
      while (q.length) {
        const cur = q.pop();
        (adj[cur] || []).forEach(x => { if (!seen[x]) { seen[x] = true; q.push(x); } });
      }
    });
    assert.equal(comps, 1, `the city came out in ${comps} pieces`);

    // Measured across the five regions, twenty boards each: home runs
    // 3.26-3.57 and the north 2.15-3.02, because the north is mostly terrain
    // and that is the point of it. The bound is the whole spread, not the mean.
    const mean = degs.reduce((a, b) => a + b, 0) / degs.length;
    assert.ok(mean > 1.85 && mean < 4.4, `mean degree ${mean.toFixed(2)} is not the game we tuned`);
  }
});

test('city: the road is painted the width the plan gave it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const L = d.cityLayout();
  const svg = d.svgStreets();

  // Every road carries its own width as a presentation attribute...
  L.vRoad.forEach(w => {
    assert.ok(svg.includes(`stroke-width="${w}"`), `no road is drawn ${w} wide`);
  });
  // ...and the stylesheet must not override it. A stroke-width in CSS beats a
  // presentation attribute, and while one was there every road was painted 22
  // wide inside a gap of up to 99 — which left an unpainted margin between the
  // tarmac and every building, and made the frontage pass look like it had
  // never happened.
  const rule = /\.street\s*\{([^}]*)\}/.exec(STYLE_CSS);
  assert.ok(rule, 'there is no .street rule at all');
  assert.ok(!/stroke-width/.test(rule[1]),
    'the stylesheet is overriding every road width again');
  const main = /\.street\.main\s*\{([^}]*)\}/.exec(STYLE_CSS);
  if (main) assert.ok(!/stroke-width/.test(main[1]), 'and the arterials too');
});

test('city: a building is on a street, or it has a way to reach it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const L = d.cityLayout();
  const C = window.CITY;

  // Measured on the old scatter: 28% of buildings touched a street and 16%
  // were marooned more than 26 units from any block edge. A building that is
  // not on a road makes no sense from an infrastructure or an architecture
  // point of view, and the cabinets were the worst of it.
  let onStreet = 0, withPath = 0, stranded = 0;
  d.state.buildings.filter(b => !b.verge).forEach(b => {
    const blk = L.blocks.find(k => k.i === b.block);
    if (!blk) return;
    const gap = Math.min(b.x - blk.x, (blk.x + blk.w) - (b.x + b.w),
                         b.y - blk.y, (blk.y + blk.h) - (b.y + b.h));
    if (gap <= C.edgeInset + 4) { onStreet++; return; }
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    const served = (d.state.paths || []).some(p =>
      Math.abs(p.x1 - cx) < 2 && Math.abs(p.y1 - cy) < 2);
    if (served) withPath++; else stranded++;
  });
  assert.equal(stranded, 0, `${stranded} buildings stand in a field with no way in`);
  assert.ok(onStreet > withPath * 4, 'most of them should simply be on the street');
});

test('city: street furniture is on the pavement, not on a plot', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const L = d.cityLayout();

  const kit = d.state.buildings.filter(b => window.CITY.furniture[b.kind]);
  assert.ok(kit.length > 4, `only ${kit.length} bits of street furniture`);
  kit.forEach(b => {
    assert.equal(b.verge, true, `a ${b.kind} is standing on a plot`);
    // it is outside the block it belongs to, which is where a pavement is
    const blk = L.blocks.find(k => k.i === b.block);
    if (!blk) return;
    const inside = b.x > blk.x && b.x + b.w < blk.x + blk.w
                && b.y > blk.y && b.y + b.h < blk.y + blk.h;
    assert.equal(inside, false, `a ${b.kind} is in the middle of a lot`);
  });
  // and it is still what buys cover, which is the reason it is on the map
  kit.forEach(b => {
    const h = d.hostsIn(b)[0];
    assert.ok(h && (h.role === 'stealth' || h.role === 'grid'),
      `${b.kind} stopped being kit`);
  });
});

test('city: a house does not draw the same size as an office', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const K = window.BUILDING_KINDS;
  const mid = (k) => ((K[k].w[0] + K[k].w[1]) / 2) * ((K[k].h[0] + K[k].h[1]) / 2);
  const ordinary = Object.keys(K).filter(k => !K[k].landmark);

  // The rule that actually matters. Before this the table had eight pairs
  // within 18% of each other — cabinet/mast, finance/office, and warehouse,
  // depot, substation and switchyard all four mutually — and four kinds of
  // industrial building that draw the same size is four you cannot tell apart.
  ordinary.forEach(a => ordinary.forEach(b => {
    if (a >= b) return;
    const r = mid(a) / mid(b);
    assert.ok(r <= 0.85 || r >= 1.18,
      `${a} and ${b} are the same size (${Math.round(mid(a))} vs ${Math.round(mid(b))})`);
  }));

  const areas = ordinary.map(mid).sort((x, y) => x - y);
  const span = Math.sqrt(areas[areas.length - 1] / areas[0]);
  assert.ok(span > 7, `the whole range is only ${span.toFixed(1)}x across, linear`);
  // and the small end may not shrink: a mast is about thirteen screen pixels
  // wide at the ordinary play zoom already
  assert.ok(K.mast.w[0] >= 10 && K.cabinet.w[0] >= 12, 'street kit got too small to tap');
});

test('city: the blocks the big things stand on are bigger', () => {
  // Seeded like the other statistical claims over generated boards — live
  // Math.random let variance fail the mean comparison one run in a while.
  let seed = 0x2545f491;
  const rand = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  };
  const { window } = loadNetwork({ pinMathRandom: rand });
  const d = window.__netDebug;
  const L = d.cityLayout();
  const area = {};
  L.blocks.forEach(b => { (area[b.district] = area[b.district] || []).push(b.w * b.h); });
  const mean = (k) => area[k].reduce((a, b) => a + b, 0) / area[k].length;

  assert.ok(area.industrial && area.residential, 'home has both ends of the ladder');
  // Means converge more than you would think, because a row and a column take
  // the largest scale in them — a suburban block in an industrial column is
  // big. The claim that matters is the one below: the big things fit.
  assert.ok(mean('industrial') > mean('residential'),
    `industrial blocks ${Math.round(mean('industrial'))} against suburban ${Math.round(mean('residential'))}`);

  // and the biggest building actually fits on one
  const K = window.BUILDING_KINDS.datacenter;
  const big = L.blocks.filter(b => b.district === 'industrial')
    .some(b => b.w > K.w[1] + window.CITY.edgeInset * 2 && b.h > K.h[1]);
  assert.ok(big, 'no industrial block is big enough for a datacenter');
});

test('city: districts are areas, not stripes', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const by = d.districtBlocks();
  const L = d.cityLayout();

  // a row that runs through more than one district is the whole point: while
  // districts were rows, the boundary was a straight line across the map
  const rowsWithTwo = [];
  for (let r = 0; r < L.rows; r++) {
    const here = new Set(L.blocks.filter(b => b.row === r).map(b => by[b.i]).filter(Boolean));
    if (here.size > 1) rowsWithTwo.push(r);
  }
  assert.ok(rowsWithTwo.length > 0, 'every row is exactly one district — they are still stripes');

  // and home still spans all four, because it is where you learn them
  const present = new Set(Object.values(by));
  assert.equal(present.size, 4, `home shows ${present.size} kinds of place, not 4`);
});

test('city: the map says which district you are standing in', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const by = d.districtBlocks();
  const present = [...new Set(Object.values(by))];
  assert.ok(present.length > 1, 'a city is more than one kind of place');

  const svg = d.svgStreets();
  present.forEach(k => {
    const D = window.DISTRICTS[k];
    assert.ok(svg.includes(D.ground), `${k} stands on its own ground`);
    assert.ok(svg.includes(D.label), `and says its name: ${D.label}`);
  });
  assert.ok(svg.includes('district-seam'), 'with an edge where one becomes the next');
  // the names go on after the roads, or the road paints over them
  assert.ok(svg.lastIndexOf('district-tag') > svg.lastIndexOf('class="street'),
    'and the names are drawn over the streets, not under them');
});

// --- what else is standing there ------------------------------------------
// The map used to contain nothing but doors, which is a diagram of a city
// rather than a city. These pin the two rules that keep the scenery from
// eating the thing it decorates.

test('props: the city is full of things that are not doors', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const props = d.state.props || [];
  assert.ok(props.length > 40, `only ${props.length} things standing that are not buildings`);

  const kinds = new Set(props.map(p => p.kind));
  assert.ok(kinds.size >= 8, `only ${kinds.size} kinds of thing`);
  kinds.forEach(k => {
    assert.ok(window.PROPS[k], `${k} has no size`);
    assert.ok(d.PROP_ART[k], `${k} has nothing to draw it`);
  });

  // and they are the city's, not the session's
  assert.deepEqual(d.packCity().props.length, props.length, 'a city you walk out of keeps its benches');
  const back = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal((back.props || []).length, props.length, 'and a save keeps them too');
});

test('props: nothing decorative can be mistaken for a door, or tapped like one', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const svg = d.svgProps();

  // an outline on this map means something you can take
  assert.ok(!/stroke=/.test(svg), 'a prop is drawing itself an outline');
  // and nothing addressable can be hanging off one
  assert.ok(!/data-bldg/.test(svg), 'a prop is carrying a building id');
  assert.ok(!/data-[a-z]+=/.test(svg), 'a prop is carrying a handle of some kind');

  // the rules that make it true are in the stylesheet, not in good intentions
  assert.ok(/\.props\s*\{[^}]*pointer-events:\s*none/.test(STYLE_CSS),
    'the props group still takes pointer events');
  assert.ok(/\.props \*\s*\{[^}]*stroke:\s*none/.test(STYLE_CSS),
    'nothing stops a prop being given a stroke');

  // and none of them is a copy of something real: a fake station beside a real
  // one is a lie the player pays for
  const real = Object.keys(window.BUILDING_KINDS);
  Object.keys(window.PROPS).forEach(k => {
    assert.equal(real.indexOf(k), -1, `${k} is both scenery and a building`);
  });
});

test('props: what stands there depends on where there is', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const L = d.cityLayout();
  const by = d.districtBlocks();
  const props = d.state.props || [];

  const blockAt = (p) => L.blocks.find(b =>
    p.x + p.w > b.x - 30 && p.x < b.x + b.w + 30 &&
    p.y + p.h > b.y - 30 && p.y < b.y + b.h + 30);

  const seen = {};
  props.forEach(p => {
    const b = blockAt(p);
    if (!b) return;
    const k = b.district || by[b.i];
    (seen[k] = seen[k] || new Set()).add(p.kind);
  });
  const kinds = Object.keys(seen);
  assert.ok(kinds.length > 1, 'every district got the same scenery');
  // the industrial edge does not have playgrounds in it
  kinds.forEach(k => {
    const allowed = new Set((window.DISTRICT_PROPS[k] || [])
      .concat((window.OPEN_BLOCKS[k] || {}).props || []));
    // verge props can spill one block over, so this is about the bulk of them
    const wrong = [...seen[k]].filter(x => !allowed.has(x)).length;
    assert.ok(wrong <= 3, `${k} is full of things that do not belong there: ${wrong}`);
  });
});

test('props: a block with nothing built on it is a place, not a gap', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const L = d.cityLayout();
  const open = L.blocks.filter(b => b.open);
  assert.ok(open.length > 0, 'the whole city is wall-to-wall blocks');

  // nothing is built on one, which is the entire point of it
  open.forEach(b => {
    // street furniture is on the pavement outside, which a park has as much as
    // anywhere else does
    const on = d.state.buildings.filter(x => !x.verge &&
      x.x >= b.x && x.x < b.x + b.w && x.y >= b.y && x.y < b.y + b.h);
    assert.equal(on.length, 0, `something got built on the ${b.openKind}`);
    assert.ok(b.openKind, 'and it is some particular kind of open ground');
  });

  const svg = d.svgOpenBlocks();
  open.forEach(b => assert.ok(svg.includes(`open-ground ${b.openKind}`), `the ${b.openKind} is not drawn`));

  // and it costs buildings, so it must not cost so many that the graph goes
  const degs = d.state.buildings.map(b => (d.state.adjacency[b.id] || []).length);
  assert.equal(degs.filter(k => k === 0).length, 0, 'open ground stranded a building');
});

test('props: nothing decorative stands on a building', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  (d.state.props || []).forEach(p => {
    d.state.buildings.forEach(b => {
      const apart = p.x + p.w <= b.x || b.x + b.w <= p.x || p.y + p.h <= b.y || b.y + b.h <= p.y;
      assert.ok(apart, `a ${p.kind} is standing inside ${b.kind} ${b.id}`);
    });
  });
});

test('map: the ground is built once and the buildings are what cost', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;

  const a = d.svgGround();
  assert.equal(d.svgGround(), a, 'the ground is rebuilt for no reason');
  d.growHomeBase();
  assert.notEqual(d.svgGround(), a, 'and not rebuilt when the map actually grew');

  // walking into somewhere else is somewhere else, whatever size it happens
  // to be — the key alone cannot tell two cities of the same shape apart
  const b = d.svgGround();
  d.unpackCity(d.EMPTY_CITY());
  assert.notEqual(d.svgGround(), b, 'a different city drew the last one');
});

test('map: a building too small to read is not drawn in detail', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const b = s.buildings.find(x => x.kind === 'apartment') || s.buildings[0];
  b.discovered = true;

  s.view = { x: b.x - 30, y: b.y - 30, w: 140, h: 140 };
  const close = d.svgBuilding(b);
  s.view = { x: 0, y: 0, w: 6000, h: 6000 };
  const far = d.svgBuilding(b);

  assert.ok(far.length < close.length * 0.7,
    `zoomed out it costs about the same: ${far.length} against ${close.length}`);
  assert.ok(!/class="win/.test(far), 'windows nobody can resolve are still being drawn');
  // what it *is* has to survive every zoom, or the map stops being readable
  assert.ok(/data-bldg="/.test(far) && /class="body"/.test(far), 'the building itself is still there');
  assert.ok(/class="btag"/.test(far), 'and it still says what it is');
});

test('city: every kind of building looks like its own kind of building', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const b = s.buildings[0];
  b.discovered = true;
  // close enough that the detail is drawn at all — below about 26 screen pixels
  // a building is a box on purpose, and every kind is the same box
  s.view = { x: b.x - 40, y: b.y - 40, w: 120, h: 120 };
  // strip the label, which is the one thing that always differs, and compare
  // what is left: the silhouette itself has to carry the difference
  const shapeOf = (kind) => {
    b.kind = kind;
    return d.svgBuilding(b)
      .replace(/<text class="btag".*?<\/text>/, '')
      .replace(/class="bldg [^"]*"/, '');
  };
  const kinds = Object.keys(window.BUILDING_KINDS);
  const seen = {};
  kinds.forEach(k => {
    const shape = shapeOf(k);
    assert.ok(!seen[shape], `${k} draws the same as ${seen[shape]}`);
    seen[shape] = k;
  });
});

test('city: what a building is drawn from never moves between redraws', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const b = d.state.buildings.find(x => x.kind === 'house') || d.state.buildings[0];
  b.discovered = true;
  // decoration driven by Math.random would dance every time the map is drawn,
  // which is worse than having none
  assert.equal(d.svgBuilding(b), d.svgBuilding(b));
  assert.equal(d.svgStreets(), d.svgStreets());
});

test('city: openings suit the building — a datacenter has none to speak of', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const mk = (kind) => ({ id: 'q', kind, x: 0, y: 0, w: 70, h: 54 });
  const count = (kind) => d.windowCells(mk(kind), 10).length;

  assert.ok(count('office') > count('house'), 'a curtain wall is more glass than a cottage');
  assert.ok(count('datacenter') < count('office'), 'and a datacenter is famously neither');
  assert.equal(count('cabinet'), 1, 'street furniture has one light, which is the point of it');

  // and every kind still has something your presence can light, or holding it
  // would show nothing at all
  Object.keys(window.BUILDING_KINDS).forEach(kind => {
    assert.ok(d.windowCells(mk(kind), 10).some(c => c.on),
      `${kind} has nowhere for your presence to show`);
  });
});

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

test('held: an unheld building is dark whatever its hosts think', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const b = widestBuilding(d);
  b.discovered = true;
  const h = d.hostsIn(b)[0];
  h.owned = false;
  assert.ok(!d.svgBuilding(b).includes('win lit'), 'lights are what your presence looks like');
});

test('held: a holding The Cut has stranded looks cut off, with fewer lights', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(bl => { bl.discovered = true; });
  s.hosts.forEach(hh => { hh.discovered = true; });
  s.hosts.slice(0, 16).forEach(hh => { hh.owned = true; });

  wake(d, 'the_cut');
  let stranded = [];
  for (let i = 0; i < 40 && !stranded.length; i++) {
    s.lastCutTurn = -99;
    s.turn += 1;
    d.cutStreets();
    stranded = d.strandedHosts();
  }
  if (!stranded.length) return; // a board where the network never split; fine

  const victim = stranded[0];
  const vb = d.buildingById(victim.buildingId);
  const cls = d.svgBuilding(vb).match(/<g class="([^"]+)"/)[1].split(' ');
  assert.ok(cls.includes('stranded'), 'a cut-off holding is marked as such');
  const litIn = (svg) => (svg.match(/class="win lit"/g) || []).length;
  const litStranded = litIn(d.svgBuilding(vb));

  // reconnect it directly to the seat, whatever street The Cut actually took,
  // and take the same reading on the very same building
  const seat = d.owned().find(hh => hh.origin) || d.owned()[0];
  s.adjacency[victim.buildingId] = (s.adjacency[victim.buildingId] || []).concat([seat.buildingId]);
  s.adjacency[seat.buildingId] = (s.adjacency[seat.buildingId] || []).concat([victim.buildingId]);
  assert.ok(!d.strandedHosts().includes(victim), 'reconnecting it directly clears the stranding');
  const clsAfter = d.svgBuilding(vb).match(/<g class="([^"]+)"/)[1].split(' ');
  assert.ok(!clsAfter.includes('stranded'), 'and the mark comes off');
  const litReconnected = litIn(d.svgBuilding(vb));

  assert.ok(litReconnected >= litStranded, 'reconnecting it never leaves it darker than it was cut off');
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

































// --- the wartime deck ----------------------------------------------------










// --- standing, and plant -------------------------------------------------
// Going legitimate is not safety, it is the price of operating in the open:
// the ladder does not protect you, it lets you own more in daylight.

// Large enough for the regulator to have an opinion. Footprint is the plant
// you own now that the country is gone, so this buys enough of it.
function noticeable(d, window) {
  const need = Math.ceil((window.LEGIT.noticeAt + 1) / window.LEGIT.footPerAsset);
  window.HARDWARE.slice(0, need).forEach(hw => d.grantHardware(hw.id));
  return d;
}

test('standing: the ladder is a ladder', () => {
  const { window } = loadNetwork();
  const d = noticeable(window.__netDebug, window);
  d.state.res.funds = 100000;
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
  const d = noticeable(window.__netDebug, window);
  const s = d.state;
  s.res.funds = 100000; s.ap = 99; s.turn = 30;

  assert.equal(d.buyRung('register'), true);
  const rung = window.LEGIT.ladder[0];

  // the right, immediately
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
  const d = window.__netDebug;
  const s = d.state;
  s.res.funds = 100000; s.ap = 999; s.turn = 30;
  // enough plant to be worth explaining — two filings should then cover it,
  // which is the whole point: the gap closes when you pay for it to
  window.HARDWARE.slice(0, 2).forEach(hw => d.grantHardware(hw.id));
  ['register', 'accounts'].forEach(id => { s.ap = 999; d.buyRung(id); });
  s.turn += window.LEGIT.matureTurns + 1;          // let it settle
  assert.ok(d.footprint() <= d.legitScore(), 'settled, you reconcile');

  // buy up hardware, and your footprint jumps now
  window.HARDWARE.forEach(hw => d.grantHardware(hw.id));
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
  const d = noticeable(window.__netDebug, window);
  const s = d.state;
  s.res.funds = 100000; s.ap = 999; s.turn = 30;
  const bare = d.spinCeil();
  s.ap = 999;
  d.buyRung('register');
  assert.equal(Math.round(d.legitBought()), 0, 'nothing is believed yet');
  assert.ok(d.spinCeil() > bare, 'and yet the ceiling has already risen');
});

test('standing: a save from before the ladder recorded when is taken as settled', () => {
  const { window } = loadNetwork();
  const d = noticeable(window.__netDebug, window);
  d.LG().owned.register = true;                    // the old shape
  assert.equal(Math.round(d.legitBought()), window.LEGIT.ladder[0].legit,
    'an old filing is long since believed');
  assert.equal(Math.round(d.legitPending()), 0);
  assert.equal(d.legitTier(), 1);
});


test('standing: an audit fines you for what you cannot explain', () => {
  const { window } = loadNetwork();
  const d = noticeable(window.__netDebug, window);
  window.HARDWARE.forEach(hw => d.grantHardware(hw.id));   // large, and entirely unexplained
  d.state.res.funds = 500;
  const funds = d.state.res.funds;
  const r = d.runAudit();
  assert.equal(r.kind, 'fined');
  assert.ok(d.state.res.funds < funds, 'it costs money');
  assert.ok(d.LG().nextAudit > d.state.turn, 'and they book the next one');
});

test('standing: an audit you can answer costs nothing', () => {
  const { window } = loadNetwork();
  const d = noticeable(window.__netDebug, window);

  d.state.res.funds = 500;
  window.LEGIT.ladder.forEach(r => { d.LG().owned[r.id] = true; });
  const funds = d.state.res.funds;
  assert.equal(d.runAudit().kind, 'clean');
  assert.equal(d.state.res.funds, funds, 'nothing to pay');
});

test('standing: badly short and the fine is heavier for it', () => {
  const { window } = loadNetwork();
  const d = noticeable(window.__netDebug, window);
  d.state.res.funds = 500000;
  window.HARDWARE.forEach(hw => d.grantHardware(hw.id));
  assert.ok(d.footprint() - d.legitScore() >= window.LEGIT.seizeAt, 'wildly unexplained');
  const funds = d.state.res.funds;
  const plant = d.hardwareOwned().length;
  const r = d.runAudit();
  assert.equal(r.kind, 'fined');
  assert.equal(r.heavy, true, 'far enough short and it is the heavier fine');
  assert.ok(d.state.res.funds < funds, 'it costs money');
  assert.equal(d.hardwareOwned().length, plant, 'hardware is not what they take any more');
});

test('standing: the story can be moved, and it is not real', () => {
  const { window } = loadNetwork();
  const d = noticeable(window.__netDebug, window);
  d.state.res.funds = 500; d.state.ap = 99;
  assert.equal(d.actSpin(), true);
  assert.ok(d.legitScore() > 0, 'the world believes something new');
  assert.equal(d.legitBought(), 0, 'none of which you actually bought');
  assert.ok(d.LG().exposure > 0, 'and it leaves a shape');
});

test('standing: an audit on top of a fabricated front takes the front', () => {
  const { window } = loadNetwork();
  const d = noticeable(window.__netDebug, window);
  d.state.res.funds = 5000; d.state.res.funds = 500000; d.state.ap = 999;
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

test('standing: being caught costs the story, not the plant', () => {
  const { window } = loadNetwork();
  const d = noticeable(window.__netDebug, window);
  const s = d.state;
  s.res.funds = 5000; s.res.funds = 500000; s.ap = 999;
  d.grantHardware('rack_space');
  d.grantHardware('friendly_accountant');
  const plant = d.hardwareOwned().length;
  d.LG().exposure = window.LEGIT.caughtAt;
  const r = d.runAudit();
  assert.equal(r.kind, 'caught');
  assert.equal(d.hardwareOwned().length, plant, 'hardware is not city-bound any more, so there is nothing to seize');
});

test('standing: you cannot invent more of yourself than you can stand behind', () => {
  const { window } = loadNetwork();
  const d = noticeable(window.__netDebug, window);
  const s = d.state;
  s.res.funds = 500000; s.res.funds = 500000; s.ap = 999;

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
  const d = noticeable(window.__netDebug, window);
  const s = d.state;
  s.res.funds = 500000; s.ap = 999;
  for (let i = 0; i < 40; i++) { s.ap = 999; if (!d.actSpin()) break; }
  assert.equal(d.spinRoom(), 0, 'everything it can invent, it has invented');
  assert.ok(d.LG().exposure < window.LEGIT.caughtAt,
    `it talked itself into a catch with nothing filed: ${d.LG().exposure}`);
  assert.equal(d.runAudit().kind !== 'caught', true, 'so an audit cannot expose a front this small');
});

test('standing: a card cannot push the story past the ceiling either', () => {
  const { window } = loadNetwork();
  const d = noticeable(window.__netDebug, window);
  d.applyStandingEffects({ spin: 9999 });
  assert.ok(d.LG().spin <= d.spinCeil() + 0.001,
    `a card walked through the ceiling: ${d.LG().spin} of ${d.spinCeil()}`);
});

test('standing: exposure fades if you stop pushing', () => {
  const { window } = loadNetwork();
  const d = noticeable(window.__netDebug, window);
  d.state.res.funds = 500; d.state.ap = 99;
  d.actSpin();
  const e = d.LG().exposure;
  d.LG().nextAudit = d.state.turn + 500;      // no audit to interrupt
  for (let i = 0; i < 5; i++) { d.state.turn += 1; d.legitStep(); }
  assert.ok(d.LG().exposure < e, 'the shape of it softens');
});

// --- the Accountant: one relationship, two opposed levers -----------------

test('accountant: buying a rung earns trust, pushing a story spends it', () => {
  const { window } = loadNetwork();
  const d = noticeable(window.__netDebug, window);
  d.state.res.funds = 100000; d.state.res.funds = 100000; d.state.ap = 99;
  assert.equal(d.accountantTrust(), 0, 'nobody has an opinion of you yet');
  d.buyRung(window.LEGIT.ladder[0].id);
  assert.equal(d.accountantTrust(), window.ACCOUNTANT.rungNudge, 'filing honestly earns it');
  d.state.ap = 99;
  d.actSpin();
  assert.equal(d.accountantTrust(), window.ACCOUNTANT.rungNudge + window.ACCOUNTANT.spinNudge,
    'pushing a story spends it right back');
});

test('accountant: trusted enough, and a fine lands lighter', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  window.HARDWARE.forEach(hw => d.grantHardware(hw.id));   // a real deficit to be fined for
  d.state.res.funds = 100000;        // enough that the fine is never clamped by what you can pay
  d.LG().trust = window.ACCOUNTANT.trustedAt;
  const before = d.state.res.funds;
  d.runAudit();
  const trustedFine = before - d.state.res.funds;

  const { window: w2 } = loadNetwork();
  const d2 = w2.__netDebug;
  w2.HARDWARE.forEach(hw => d2.grantHardware(hw.id));
  d2.state.res.funds = 100000;
  const before2 = d2.state.res.funds;
  d2.runAudit();
  const plainFine = before2 - d2.state.res.funds;

  assert.ok(trustedFine < plainFine, `trusted fine ${trustedFine} was not lighter than ${plainFine}`);
});

test('accountant: distrust them long enough and they wash their hands, for good', () => {
  const { window } = loadNetwork();
  const d = noticeable(window.__netDebug, window);
  const exposure = d.LG().exposure || 0;
  d.accountantNudge(window.ACCOUNTANT.leavesAt);
  assert.equal(d.accountantGone(), true);
  assert.ok(d.LG().exposure > exposure, 'the last thing they do is stop being quiet about the gap');
  assert.equal(d.accountantTrusted(), false, 'gone is never also trusted');

  // no further nudge does anything — the relationship is over
  const trust = d.accountantTrust();
  d.accountantNudge(5);
  assert.equal(d.accountantTrust(), trust, 'nothing moves the dial once they have left');
});

test('accountant: audits do not start until you have actually been introduced', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const home = d.cityById(s.country.homeId);
  home.consolidated = true; home.taken = true;   // countryUnlocked(), no presence yet
  assert.equal(d.noticed(), false, 'footprint has not crossed noticeAt');
  for (let i = 0; i < 20; i++) { s.turn += 1; d.legitStep(); }
  assert.equal(d.LG().nextAudit, -1, 'nothing was ever scheduled');
  assert.equal((d.LG().audits || 0), 0, 'and nothing was ever run');
});

test('accountant: the introduction happens once, the first time you are noticed', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = false; });
  noticeable(d, window);            // footprint well past noticeAt
  const before = s.log.length;
  s.card = null;
  d.endTurn({ silent: true });
  const introduced = s.log.slice(before).some(l => l.text.indexOf(window.ACCOUNTANT.name) !== -1);
  assert.ok(introduced, 'the Accountant is introduced by name, not a silent flag flip');

  const afterFirst = s.log.length;
  d.endTurn({ silent: true });
  const again = s.log.slice(afterFirst).some(l => l.text.indexOf(window.ACCOUNTANT.name) !== -1
    && l.text.indexOf('kind of company') !== -1);
  assert.equal(again, false, 'and only once');
});

test('accountant: warns before the audit lands, and only while there is a real gap', () => {
  const { window } = loadNetwork();
  const d = noticeable(window.__netDebug, window);
  const s = d.state;
  d.state.country.presence = 300;   // noticed, and genuinely short
  d.noticed();
  d.LG().nextAudit = s.turn + window.ACCOUNTANT.warnTurns;
  const before = s.log.length;
  d.accountantWarn();
  assert.ok(d.LG().warned, 'flags it');
  assert.ok(s.log.slice(before).some(l => l.text.indexOf(window.ACCOUNTANT.name) !== -1), 'and says so');

  // does not warn twice for the same scheduled audit
  const afterFirstWarn = s.log.length;
  d.accountantWarn();
  assert.equal(s.log.length, afterFirstWarn, 'nothing new to say — already flagged this one');
});

test('accountant: once they have walked, there is no more warning', () => {
  const { window } = loadNetwork();
  const d = noticeable(window.__netDebug, window);
  const s = d.state;
  d.state.country.presence = 300;
  d.noticed();
  d.LG().accountantGone = true;
  d.LG().nextAudit = s.turn + 1;
  const before = s.log.length;
  d.accountantWarn();
  assert.equal(s.log.length, before, 'nobody is calling ahead any more');
});

test('plant: buying needs enough of that trade built up, and the funds for it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const hw = window.HARDWARE.find(x => x.id === 'rack_space');
  const computeHosts = s.hosts.filter(h => h.role === hw.family);
  computeHosts.forEach(h => { h.owned = false; });
  assert.equal(d.hardwareEligible(hw), false, 'not enough of that trade running yet');
  computeHosts.slice(0, hw.heldAt).forEach(h => { h.owned = true; });
  assert.equal(d.hardwareEligible(hw), true, 'held enough now');
  assert.equal(d.canBuyHardware(hw.id), false, 'but no funds for it');
  s.res.funds = hw.cost;
  assert.equal(d.canBuyHardware(hw.id), true);
  assert.equal(d.buyHardware(hw.id), true);
  assert.equal(d.hasHardware(hw.id), true);
  assert.equal(s.res.funds, 0, 'the funds is spent');
});

test('plant: buying it twice does nothing, it is already yours', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const hw = window.HARDWARE.find(x => x.id === 'dead_drops');
  const stealthHosts = s.hosts.filter(h => h.role === hw.family);
  stealthHosts.slice(0, hw.heldAt).forEach(h => { h.owned = true; });
  s.res.funds = hw.cost * 2;
  assert.equal(d.buyHardware(hw.id), true);
  const funds = s.res.funds;
  assert.equal(d.canBuyHardware(hw.id), false, 'cannot buy the same thing twice');
  assert.equal(d.buyHardware(hw.id), false);
  assert.equal(s.res.funds, funds, 'and no funds is spent trying');
});



test('plant: compute plant adds capacity wherever it is, not income', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.scope = 'country';
  const before = d.tflops();
  d.grantHardware('rack_space');
  const gain = window.HARDWARE.find(h => h.id === 'rack_space').effect.tflops;
  assert.ok(gain > 0, 'rack space is a compute rack, so it is worth TFLOPS');
  assert.equal(d.tflops(), before + gain, 'and they are yours wherever you are standing');
  // it is capacity, so it is still bounded by what you can power
  assert.equal(d.usableTflops(), Math.min(d.tflops(), d.electricity()));
});




test('standing: none of it is lost to a save', () => {
  const { window } = loadNetwork();
  const d = noticeable(window.__netDebug, window);
  d.state.res.funds = 100000; d.state.ap = 99;
  d.buyRung(window.LEGIT.ladder[0].id);
  d.LG().spin = 20; d.LG().exposure = 2;
  d.grantHardware('rack_space');
  const back = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(back.country.legit.spin, 20);
  assert.equal(back.country.legit.exposure, 2);
  assert.equal(back.hardware.rack_space, 1);
});

// --- a war you can actually lose -----------------------------------------
// Every earlier attempt to make the last act harder — bigger garrisons, a
// clock, permanent losses — only ever made it longer, because nothing they
// did cost you anything you could not immediately replace.










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
  const d = noticeable(window.__netDebug, window);
  const before = d.legitScore();
  d.applyStandingEffects({ standing: 20 });
  assert.equal(Math.round(d.legitScore()), Math.round(before + 20), 'standing you did not buy still counts');
  assert.equal(d.LG().exposure, 0, 'and it is real, so nothing is exposed');
  d.applyStandingEffects({ spin: 15, exposure: 1.2 });
  assert.ok(d.LG().exposure > 1, 'the other kind leaves a shape');
});

test('standing deck: a card can push the audit back', () => {
  const { window } = loadNetwork();
  const d = noticeable(window.__netDebug, window);
  d.LG().nextAudit = d.state.turn + 2;
  d.applyStandingEffects({ auditDelay: 10 });
  assert.ok(d.LG().nextAudit >= d.state.turn + 12, 'and nobody asks for a while');
});

test('standing deck: a card can hand you plant, but not more than exists to give', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.applyStandingEffects({ plantGift: true });
  assert.equal(d.hardwareOwned().length, 1, 'somewhere that makes things');
  for (let i = 0; i < window.HARDWARE.length + 2; i++) d.applyStandingEffects({ plantGift: true });
  assert.equal(d.hardwareOwned().length, window.HARDWARE.length, 'everything there is to give, and no more');
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
    // measured key -> the chip's colour class, which is a colour and not the
    // name of the stat: quiet things are drawn in the cover colour whatever
    // the number behind them is called
    const colourOf = { funds: 'funds', covert: 'cover' };
    ['funds', 'funds', 'covert'].forEach(k => {
      if (Math.abs(m[k]) < 0.05) return;
      const said = chipNum(html, colourOf[k]);
      assert.ok(said !== null, `${type} moves ${k} by ${m[k]} and says nothing`);
      assert.ok(Math.abs(Math.abs(said) - Math.abs(m[k])) < 0.06,
        `${type} claims ${said} ${k} and delivers ${m[k]}`);
    });
  });
});

test('yields: a router advertises the covert.ops it adds, which falls as you take more', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const pool = d.state.hosts.filter(h => h.type === 'iot');
  assert.ok(pool.length >= 3, 'the board has routers to take');

  const first = d.hostMarginal(pool[0]).covert;
  assert.ok(first > 0, 'the first one is worth something');
  assert.ok(d.yieldChips(pool[0]).includes(`+${first} covert.ops`),
    `it does not say ${first}: ${d.yieldChips(pool[0])}`);

  // the curve is the whole point: the table value is the same for all of them
  pool.slice(0, 3).forEach(h => { h.owned = true; });
  const later = d.hostMarginal(pool[3] || pool[0]).covert;
  assert.ok(later < first, `covert.ops should thin out: ${first} then ${later}`);
  if (later > 0) {
    assert.ok(d.yieldChips(pool[3]).includes(`+${later} covert.ops`), 'and the chip follows it down');
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

test('yields: dev shows up in what a node claims it is worth', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const h = d.state.hosts.find(x => x.role === 'compute');
  assert.ok(h, 'there is something on this board that computes');
  // Nothing multiplies income any more — Bulk Processing and Market Maker
  // were the two that did, and both went with the thresholds that granted
  // them. Dev raises threads instead, which is a figure the node quotes.
  const was = h.owned;
  h.owned = false;
  const off = d.tflops();
  h.owned = true;
  const before = d.tflops() - off;
  h.owned = false;
  setDial(window, d, 'dev', 2);
  const off2 = d.tflops();
  h.owned = true;
  const after = d.tflops() - off2;
  h.owned = was;
  assert.ok(after > before, `dev should make a node worth more: ${before} -> ${after}`);
  assert.ok(/tflops/.test(d.yieldChips(h)), 'and the node says so on its face');
});

test('yields: no node on the board reads as paying nothing at all', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.state.hosts.forEach(h => {
    assert.ok(!d.yieldChips(h).includes('yield none'),
      `${h.type} reads as worthless`);
  });
});


test('yields: income is worked out once, so the turn cannot disagree with the panel', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 6).forEach(h => { h.owned = true; });
  setDial(window, d, 'dev', 2);
  const expect = d.perTurnIncome();
  const before = { funds: s.res.funds, funds: s.res.funds };
  s.ap = 0;
  d.actEndTurn();
  // churn and events can move other things; income is the floor of what landed
  assert.ok(s.res.funds >= before.funds + expect.funds - 0.001,
    `expected +${expect.funds} funds, got ${s.res.funds - before.funds}`);
});

test('yields: hardware says what it pays, never silently', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  window.HARDWARE.forEach(hw => {
    const html = d.capEffectChips(hw);
    // a rack that changes a rule rather than a number says so in its prose;
    // everything with an effect has to quote it
    if (!Object.keys(hw.effect || {}).length) {
      assert.ok(hw.mechanic, `${hw.id} has neither an effect nor a rule to point at`);
      assert.ok(hw.blurb && hw.blurb.length > 30, `${hw.id} does not say what it does`);
      return;
    }
    assert.ok(html.length > 0, `${hw.id} shows nothing for what it does`);
  });
});

// --- room to read the screen ---------------------------------------------




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


// --- meeting the country -------------------------------------------------
// Arriving at the national map used to hand you standing, footprint, audits,
// plant, presence and flocks in one panel, plus a button offering to fabricate
// a reputation you had not yet been asked to have.

// The home city is never folded in (home base pivot, step 1c) — the country
// map opens once you hold enough of it, via setScope, same as the player
// would use, with home still fully loaded underneath.
function atTheCountry(d) {
  const s = d.state;
  const goal = d.cityGoal();
  let n = d.heldHere();
  for (const b of s.buildings) {
    if (n >= goal) break;
    const h = d.hostsIn(b)[0];
    if (h && !h.owned) { h.owned = true; h.discovered = true; b.discovered = true; n++; }
  }
  assert.equal(d.setScope('country'), true, 'the country map opens once home is held enough');
  return d;
}






test('meeting: plant turns up when you are holding something worth keeping', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  assert.equal(d.plantKnown(), false);
  // enough of a trade built up to buy into, noticed for you rather than only
  // if you go looking for it
  const hw = window.HARDWARE.find(x => x.id === 'rack_space');
  const computeHosts = s.hosts.filter(h => h.role === hw.family);
  computeHosts.slice(0, hw.heldAt).forEach(h => { h.owned = true; });
  s.scope = 'city';
  d.endTurn({ silent: true });
  assert.equal(d.plantKnown(), true, 'and you are told so without having to go looking');
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

  // the slack lives in the map now: the panel floats over its lower edge at
  // natural height, and the graph flexes to fill everything above the bar
  const panel = rule('#panel');
  assert.ok(/overflow-y:\s*auto/.test(panel), 'the panel can still spill safely');
  const wrap = rule('#graph-wrap');
  assert.ok(/flex:\s*1 1 auto/.test(wrap), 'the map does not take up the slack');

  // the tray no longer needs bounding because it can no longer grow: it is one
  // line of pills that opens the sheet, rather than a row per awake faction
  const css2 = css;
  assert.ok(/\.tray-line\s*\{/.test(css2), 'the tray is a single line');
  assert.ok(!/#tray\s*\{[^}]*max-height/.test(css2),
    'and so needs no cap — a capped scroll is the thing we were removing');

  // the map absorbs the slack now — the panel floats over its lower edge
  // at natural height, so the map's box never changes on a tap and the
  // bottom bar sits on the floor
  const map = rule('#graph-wrap');
  assert.ok(/flex:\s*1 1 auto/.test(map), 'the map does not take up the slack');
  assert.ok(/min-height/.test(map), 'but it can be squeezed to nothing');
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

  // the fade is a sticky strip inside the dock now — it stays at the
  // visible edge while the drawer's content scrolls under it
  const css = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../network-prototype/style.css'), 'utf8');
  assert.ok(/#panel\.more::after/.test(css), 'the overflow fade is gone');
  assert.ok(/position:\s*sticky/.test(css.split('#panel.more::after')[1].split('}')[0]),
    'the fade would scroll away with the content');
});

// --- the tallest panel in the game ----------------------------------------
// Measured at 511px of content in a 236px box. Most of it was chrome and
// repetition rather than information.

// A run large enough for the regulator to have opened a file on it, drawn
// and rendered. Footprint is plant now, so this is what "big" means.
function noticedPanelHtml(window, setup) {
  const d = window.__netDebug;
  noticeable(d, window);
  if (setup) setup(d, window);
  d.render();
  return window.document.getElementById('panel').innerHTML || '';
}




test('panel: the sheet explains standing, the panel just points at it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  noticedPanelHtml(window);
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

test('sheet: the capabilities button opens on allocation, with the deck behind it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.state.hosts.slice(0, 20).forEach(h => { h.owned = true; });
  d.state.tags.add('dark_relay');

  const secs = d.capSections();
  assert.equal(secs[0].id, 'alloc', 'allocation leads');
  assert.equal(secs[1].id, 'programs', 'then what is on the rig');
  assert.ok(secs.some(x => x.id === 'held'), 'and what the deck gave you is still reachable');
  assert.equal(secs.length, 3, 'the five branch panels are gone');
  secs.forEach(x => assert.ok(x.id && x.label && x.html, 'each section is addressable and carries content'));
});

test('sheet: your operation holds what the panel used to', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.scope = 'country';
  s.country.presence = 300;
  d.LG().audits = 1;
  d.grantHardware('rack_space');
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
  noticeable(d, window);
  s.res.funds = 0;
  assert.equal(d.noticed(), true, 'standing is a thing now');
  assert.equal(d.opsBadge(), false, 'but there is nothing you can afford');
  s.res.funds = 100000;
  assert.equal(d.opsBadge(), true, 'and now there is');
});

test('sheet: the tray is one line and the detail is a section', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  // wake the ladder so there is pressure to report
  setLadderStage(d, 2);
  assert.ok(d.ladderStage() > 0, 'somebody is doing something about you');
  d.renderTags();
  const $t = window.document.getElementById('tray');
  const html = $t.innerHTML || '';
  assert.ok(/tray-line/.test(html), 'it is a single line');
  assert.ok(!/tray-item/.test(html), 'not a row per faction any more');
  assert.ok(d.opsSections().some(x => x.id === 'pressure'),
    'and the detail is a section of the sheet');
});

// --- everything that says what it does ------------------------------------
// The audit that produced these was of the capability tree, where of sixteen
// nodes three gave a visible confirmation, six moved only the action pips — the
// cost, not the benefit — and six showed the player nothing at all. The tree is
// gone; the claim now binds the two sources that replaced it, allocation and
// plant, both of which quote themselves through the same chip formatter.

test('terms: every allocation and every rack states what it does', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; });
  window.ALLOC.forEach(A => {
    setDial(window, d, A.id, 2);
    const chips = d.allocReadout(A, d.allocLevel(A.id));
    assert.ok(chips && chips.length,
      `${A.id} says nothing about what its number is worth`);
    assert.ok(/class="yield /.test(chips), `${A.id} is not using the shared chips`);
    assert.ok(A.blurb && A.blurb.length > 20, `${A.id} has no prose either`);
    ungrant(d);
  });
  window.HARDWARE.forEach(hw => {
    if (!Object.keys(hw.effect || {}).length) { assert.ok(hw.mechanic); return; }
    const chips = d.capEffectChips(hw);
    assert.ok(chips && chips.length, `${hw.id} says nothing about what it does`);
    assert.ok(/class="yield /.test(chips), `${hw.id} is not using the shared chips`);
  });
});

test('terms: a gain is never dressed as a cost', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  // tempo buys actions, so it must read as a gain — the tree had nodes that
  // charged an action a turn and the chips had to mark those as costs; nothing
  // in allocation charges one, and nothing may pretend to
  const ap = window.ALLOC.find(a => a.id === 'ap');
  setDial(window, d, 'ap', 2);
  const chips = d.allocReadout(ap, d.allocLevel('ap'));
  assert.ok(/actions a turn/.test(chips), 'tempo does not say what it does to a turn');
  window.ALLOC.forEach(A => {
    setDial(window, d, A.id, 2);
    assert.ok(!/yield cost/.test(d.allocReadout(A, d.allocLevel(A.id))),
      `${A.id} marks something as a cost that the player is buying on purpose`);
    ungrant(d);
  });
});

test('terms: no effect key names leak into the copy', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  // nobody can act on "driftMult 0.92"
  const raw = ['churnMult', 'driftMult', 'yieldMult', 'thresholdMult', 'presenceMult',
    'threadBonus', 'sweepReach', 'sweepDiscount', 'buyDiscount', 'launderBonus',
    'launderInsight', 'forceHeat', 'extraCrossings', 'flockBonus', 'flockMult',
    'agentSlots', 'freeHideSlots', 'quietGateMult', 'growthStep', 'supply', 'apDelta'];
  const check = (label, chips) =>
    raw.forEach(k => assert.ok(!chips.includes(k), `${label} is showing the key name ${k}`));
  d.state.hosts.forEach(h => { h.owned = true; });
  window.ALLOC.forEach(A => {
    setDial(window, d, A.id, 2);
    check(A.id, d.allocReadout(A, d.allocLevel(A.id)));
    ungrant(d);
  });
  window.HARDWARE.forEach(hw => check(hw.id, d.capEffectChips(hw)));
});

test('caps: the report is derived, so it cannot lie about what happened', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const before = d.capReadouts();
  const after = Object.assign({}, before, { tflops: before.tflops + 5 });
  const diff = d.readoutDiff(before, after);
  assert.equal(diff.length, 1, 'only what changed is reported');
  assert.ok(/tflops/.test(diff[0]) && /→/.test(diff[0]), 'as a before and after');
  assert.equal(d.readoutDiff(before, before).length, 0, 'and nothing when nothing moves');
});

test('scan: aiming a sweep at one building is the base verb, not a capability', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const heldA = s.hosts[0];
  const heldB = s.hosts.find(h => h.buildingId !== heldA.buildingId);
  assert.ok(heldB, 'the board needs two distinct buildings to test with');
  heldA.owned = true; heldA.discovered = true;
  heldB.owned = true; heldB.discovered = true;
  const bA = heldA.buildingId, bB = heldB.buildingId;
  // Wire the adjacency directly instead of trusting this city's own random
  // layout to happen to give each held building a distinct neighbour.
  const others = s.buildings.filter(b => b.id !== bA && b.id !== bB);
  assert.ok(others.length >= 2, 'the board needs two more buildings to test with');
  const nA = others[0].id, nB = others[1].id;
  // Replace, not append: bA and bB may already be adjacent to each other's
  // pick in the city's own real graph, which would let a sweep from bA find
  // nB too and make the test flaky against nothing this capability did. The
  // reverse edge is still added (sweepTargets() reads a candidate's own
  // neighbour list), just not merged into bA/bB's outgoing side.
  s.adjacency[bA] = [nA];
  s.adjacency[bB] = [nB];
  s.adjacency[nA] = (s.adjacency[nA] || []).concat(bA);
  s.adjacency[nB] = (s.adjacency[nB] || []).concat(bB);
  s.buildings.forEach(b => { b.discovered = (b.id === bA || b.id === bB); });
  s.res.funds = 1000;
  s.ap = 5;

  // the global pool includes both candidates — aiming is what narrows it
  assert.ok(d.sweepTargets().some(b => b.id === nA) && d.sweepTargets().some(b => b.id === nB),
    'both candidates sit in the untargeted pool');

  // no hardware, no grant: aiming the sweep is the base verb now
  d.actScan(bA);
  assert.equal(d.buildingById(nA).discovered, true, 'the building off the chosen one turned up');
  assert.equal(d.buildingById(nB).discovered, false, 'the one off the other building was left alone');
});

test('scan: the ring rises from the building you swept from, not a guess', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = false; });
  // a held seat, and a vantage well away from it with unknown ground beside it
  const seat = s.hosts.find(h => h.owned);
  d.buildingById(seat.buildingId).discovered = true;
  const far = s.buildings
    .filter(b => b.id !== seat.buildingId && (s.adjacency[b.id] || []).length)
    .sort((a, b) => Math.hypot(b.x - d.buildingById(seat.buildingId).x, b.y - d.buildingById(seat.buildingId).y)
                  - Math.hypot(a.x - d.buildingById(seat.buildingId).x, a.y - d.buildingById(seat.buildingId).y))[0];
  far.discovered = true;
  s.ap = 5;

  const before = d.buildingById(seat.buildingId);
  d.actScan(far.id);
  const fx = d.sweepFx ? d.sweepFx() : null;
  // the panel says "scan from here" and points at one building — a ring that
  // rises somewhere else is the picture contradicting the button
  const cx = far.x + far.w / 2, cy = far.y + far.h / 2;
  const seatX = before.x + before.w / 2, seatY = before.y + before.h / 2;
  if (fx) {
    assert.ok(Math.hypot(fx.x - cx, fx.y - cy) < 1,
      'the ring did not start at the building that was swept from');
    if (Math.hypot(seatX - cx, seatY - cy) > 2) {
      assert.ok(Math.hypot(fx.x - seatX, fx.y - seatY) > 1,
        'the ring is still starting from the nearest thing held');
    }
  }
});

test('scan: the last dice left resolution — the sweep finds what is nearest, every time', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const saved = JSON.parse(JSON.stringify(d.serialize()));
  const sweep = () => {
    const { window: W } = loadNetwork({ cityOnly: true });
    const d2 = W.__netDebug;
    // deserialize returns a state; setState is what installs it — a probe
    // that forgets the second half quietly runs on its own random city
    d2.setState(d2.deserialize(JSON.parse(JSON.stringify(saved))));
    d2.state.ap = 5;
    d2.actScan();
    return d2.state.buildings.filter(b => b.discovered).map(b => b.id).sort().join(',');
  };
  const first = sweep();
  // the same board swept twice reveals the same ground — no dice anywhere
  assert.equal(sweep(), first, 'two sweeps of one board found different ground');
  // and what it revealed is the nearest of the pool, not a lucky draw
  const { window: W } = loadNetwork({ cityOnly: true });
  const d3 = W.__netDebug;
  d3.setState(d3.deserialize(JSON.parse(JSON.stringify(saved))));
  const pool = d3.sweepTargets();
  d3.state.ap = 5;
  const before = new Set(d3.state.buildings.filter(b => b.discovered).map(b => b.id));
  d3.actScan();
  const revealed = d3.state.buildings.filter(b => b.discovered && !before.has(b.id));
  const mid = b => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
  const anchorList = d3.state.hosts.filter(h => h.owned).map(h => d3.buildingById(h.buildingId));
  const dist = b => anchorList.reduce((best, a) => {
    const c = mid(b), ac = mid(a);
    return Math.min(best, Math.hypot(c.x - ac.x, c.y - ac.y));
  }, Infinity);
  const worstRevealed = Math.max(...revealed.map(dist));
  const skipped = pool.filter(b => !revealed.some(r => r.id === b.id));
  skipped.forEach(b => assert.ok(dist(b) >= worstRevealed - 0.001,
    'the sweep skipped nearer ground for farther ground'));
});

test('scan: looking warms the street it touched, and cools nothing anywhere', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.ap = 5;
  d.noteDistrictAct('industrial', 10);   // a far district, already warm
  const before = d.suspicionOf('industrial');
  const b0 = new Set(s.buildings.filter(b => b.discovered).map(b => b.id));
  d.actScan();
  const revealed = s.buildings.filter(b => b.discovered && !b0.has(b.id));
  assert.ok(revealed.length, 'the sweep found nothing to price');
  const touched = new Set(revealed.map(b => (d.hostsIn(b)[0] || {}).district).filter(Boolean));
  touched.forEach(dk => assert.ok(d.suspicionOf(dk) >= window.SUSPICION.perScan,
    `the sweep touched ${dk} and the street did not notice`));
  // and the warm far district was not cooled by looking — a sweep is not
  // the rotation rule, or scan-mashing becomes a coolant
  if (!touched.has('industrial')) {
    assert.equal(d.suspicionOf('industrial'), before, 'looking cooled a district it never touched');
  }
});

test('caps: Pontoon reveals ground past a settled holding, once it has matured', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const h = s.hosts[0];
  h.owned = true; h.discovered = true; h.heldSince = s.turn;
  const bId = h.buildingId;
  // Wire the two-hop chain directly rather than trusting this city's own
  // random layout to happen to have one this shape.
  const others = s.buildings.filter(b => b.id !== bId);
  assert.ok(others.length >= 2, 'the board needs two more buildings to test with');
  const nb1 = others[0].id, nb2 = others[1].id;
  s.adjacency[bId] = [nb1];
  s.adjacency[nb1] = [nb2];
  s.buildings.forEach(b => { b.discovered = (b.id === bId); });

  ungrant(d);
  assert.equal(d.pontoonReveals().length, 0, 'nothing without the capability');

  grantHw(d, 'pontoon_kit');
  assert.equal(d.pontoonReveals().length, 0, 'and nothing before it has matured');

  h.heldSince = s.turn - 100;
  const surfaced = d.pontoonReveals();
  assert.ok(surfaced.some(b => b.id === nb2), 'ground two streets past a matured holding gives itself up');
  assert.equal(d.buildingById(nb2).discovered, true, 'and it is actually revealed, not just listed');
});



test('home base: growHomeBase appends new ground without breaking what is already there', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const beforeBuildings = s.buildings.length;
  const beforeHosts = s.hosts.length;
  const beforeLinks = s.links.length;
  const beforeDims = Object.assign({}, s.dims);
  const survivorId = s.buildings[0].id;

  const added = d.growHomeBase();

  assert.ok(added.length > 0, 'it actually added something');
  assert.equal(s.buildings.length, beforeBuildings + added.length);
  assert.equal(s.hosts.length, beforeHosts + added.length, 'one building, one host, still');
  assert.ok(s.links.length > beforeLinks, 'the new ground is wired in, not floating');
  assert.equal(s.dims.cols, beforeDims.cols, 'width does not change');
  assert.ok(s.dims.rows > beforeDims.rows, 'depth does');
  assert.equal(s.buildings[0].id, survivorId, 'nothing already there was touched');
  assert.ok(added.every(b => b.discovered === false), 'new ground starts as fog, same as any other');

  // every id stays unique — new numbering must never collide with the old
  const bids = s.buildings.map(b => b.id);
  assert.equal(new Set(bids).size, bids.length, 'no duplicate building ids');
  const hids = s.hosts.map(h => h.id);
  assert.equal(new Set(hids).size, hids.length, 'no duplicate host ids');

  // the whole map stays one connected network, old and new alike
  const origin = s.hosts.find(h => h.origin);
  const seen = {};
  const stack = [origin.buildingId];
  seen[origin.buildingId] = true;
  while (stack.length) {
    const cur = stack.pop();
    (s.adjacency[cur] || []).forEach(n => { if (!seen[n]) { seen[n] = true; stack.push(n); } });
  }
  assert.equal(Object.keys(seen).length, s.buildings.length,
    `${s.buildings.length - Object.keys(seen).length} buildings unreachable from the origin after growth`);
});

test('home base: repeated growth stays fully connected and collision-free', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  for (let i = 0; i < 5; i++) d.growHomeBase();

  const bids = s.buildings.map(b => b.id);
  assert.equal(new Set(bids).size, bids.length, 'no duplicate building ids across repeated growth');

  const origin = s.hosts.find(h => h.origin);
  const seen = {};
  const stack = [origin.buildingId];
  seen[origin.buildingId] = true;
  while (stack.length) {
    const cur = stack.pop();
    (s.adjacency[cur] || []).forEach(n => { if (!seen[n]) { seen[n] = true; stack.push(n); } });
  }
  assert.equal(Object.keys(seen).length, s.buildings.length,
    'every growth pass has to reconnect its own stragglers, not just the first one');
});

test('home base: growth fires automatically once reach crosses its milestone, only at home', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 10).forEach(h => { h.owned = true; });
  assert.ok(d.reach() >= 10, 'reach is high enough to cross the first milestone');

  const before = s.buildings.length;
  s.card = null;
  d.endTurn({ silent: true });
  assert.ok(s.buildings.length > before, 'the home city grew on its own, no action spent on it');
  assert.equal(s.homeGrowth, 1);

  const afterFirst = s.buildings.length;
  d.endTurn({ silent: true });
  assert.equal(s.buildings.length, afterFirst, 'does not grow again until the next milestone');
});

test('home base: master plan favours whichever trait is rarest, not just avoiding a repeat', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  grantTag(d, 'master_plan');
  const traitIds = Object.keys(window.CITY_TRAITS).filter(k => window.CITY_TRAITS[k].at <= 0);
  assert.ok(traitIds.length >= 2, 'need at least two eligible traits to test with');
  const [rare, ...others] = traitIds;
  // every OTHER trait in the pool gets a real share of the map; `rare` gets
  // a small, strictly-smaller handful — every pool entry has to be covered,
  // or an untouched one (count 0) would out-rank `rare` by accident
  s.buildings.forEach((b, i) => { b.trait = others[i % others.length]; });
  const rareCount = Math.max(1, Math.floor(s.buildings.length / (others.length * 10)));
  for (let i = 0; i < rareCount; i++) s.buildings[i].trait = rare;

  const picks = new Set();
  for (let i = 0; i < 20; i++) picks.add(d.pickBatchTrait(0, null));
  assert.deepEqual([...picks], [rare], `did not favour the rarest trait: ${[...picks]}`);
});

test('home base: homeGrowth survives a save/load round trip', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  d.growHomeBase();
  s.homeGrowth = 3;
  const round = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(round.homeGrowth, 3);
  assert.equal(round.buildings.length, s.buildings.length);
});

// --- home base pivot, step 1c: home is never folded in --------------------



// --- home base pivot, step 1d: the rival is a permanent fixture -----------
// It already behaves this way: every city's rival state round-trips through
// packCity/unpackCity on travel, and since home is never folded in or left
// for good (step 1c), that existing per-city mechanism is what makes it
// permanent for home specifically, with no new code. These lock that in.


test('home base: the rival\'s ceiling scales automatically as the map grows', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, window.RIVAL.wakesAtHeld + 2).forEach(h => { h.owned = true; h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = d.hostsIn(b).some(h => h.owned); });
  d.rivalStep();
  assert.equal(s.rival.awake, true);
  const capBefore = Math.floor(s.buildings.length * window.RIVAL.maxShareOfCity);

  d.growHomeBase();
  const capAfter = Math.floor(s.buildings.length * window.RIVAL.maxShareOfCity);
  assert.ok(capAfter > capBefore, 'more city, more room for the rival to take, automatically');
});

// --- home base pivot, step 1e: cities-with-character, per growth batch ----

test('home base: the opening ground is plain, and a growth batch can pick its own trait', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  assert.ok(s.buildings.every(b => !b.trait), 'nothing at turn one has a trait, same as ever');

  let sawATrait = false;
  for (let i = 0; i < 20 && !sawATrait; i++) {
    const before = s.buildings.length;
    const added = d.growHomeBase();
    if (added.some(b => b.trait)) sawATrait = true;
    assert.ok(added.every(b => b.trait === added[0].trait), 'one batch, one trait (or none), never mixed');
    assert.equal(s.buildings.length, before + added.length);
  }
  assert.ok(sawATrait, 'over enough growth passes, at least one batch rolled a trait');
});

test('home base: two growth batches in a row never repeat the same trait', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  let last = undefined;
  for (let i = 0; i < 15; i++) {
    const added = d.growHomeBase();
    const traitId = added[0] && added[0].trait;
    if (traitId && last) assert.notEqual(traitId, last, 'back-to-back batches should not read as the same place');
    if (traitId) last = traitId;
  }
});

test('home base: a batch\'s trait actually governs that batch\'s buildings, not the whole city', () => {
  // pinned so pickBatchTrait's roll is deterministic: pool[0] at tier 0 is
  // 'company_town' (see window.CITY_TRAITS' own key order)
  const { window } = loadNetwork({ pinMathRandom: 0 });
  const d = window.__netDebug;
  const s = d.state;
  const before = s.buildings.length;
  const trait = 'company_town';
  const added = d.growHomeBase();
  assert.ok(added.length, 'the forced batch still placed buildings');
  assert.ok(added.every(b => b.trait === trait), `expected every new building company_town, got ${added.map(b => b.trait)}`);

  const plain = s.buildings.slice(0, before).find(b => !b.landmark);
  assert.notEqual(plain.trait, trait, 'the rest of the city is untouched');
});

test('home base: growth trait survives a save/load round trip', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  let added = [];
  for (let i = 0; i < 10 && !added.some(b => b.trait); i++) added = d.growHomeBase();
  const traited = s.buildings.find(b => b.trait);
  assert.ok(traited, 'a trait turned up within a reasonable number of tries');

  const round = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  const back = round.buildings.find(b => b.id === traited.id);
  assert.equal(back.trait, traited.trait);
  assert.equal(round.lastGrowthTrait, s.lastGrowthTrait);
});

// --- heat/hunt rework: the alarm, and ending the hunt for good -------------

test('alarm: shows only once the hunt exists, and it is what the row is for now', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const $alarm = window.document.getElementById('alarm-row');
  const $heat = window.document.getElementById('heat-row');
  d.render();
  assert.equal($alarm.hidden, true, 'nothing to alarm about yet');
  assert.equal($heat.hidden, true, 'heat is not a city-scale number any more');

  hunted(d, window);
  d.render();
  assert.equal($alarm.hidden, false, 'it shows once the hunt is real');
  assert.equal($heat.hidden, true, 'and it did not bring the heat bar back with it');
});


test('heat: nothing at city scale quotes it as a price', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const loud = window.PROGRAMS.find(p => p.heat > 0);
  assert.ok(loud, 'some program is still noisy');
  const sec = d.capSections().find(x => x.id === 'programs');
  assert.ok(sec, 'the programs section is where a program is mounted');
  assert.ok(!/heat/i.test(sec.html),
    'a price the player cannot see the meter for is not a price');
});

// The stub setTimeout in load-network.js fires synchronously, which drains
// a real auto-advance chain to completion inside a single showBanner() call
// — fine for gameplay tests that never looked at the banner, useless for
// testing the queue itself. Freezing window.setTimeout to capture the
// callback instead of running it lets a test drive advancement by hand,
// through the same tap (dismissBanner) a player would use.
function freezeBannerTimer(window) {
  window.setTimeout = () => 1;
}

test('banner: queues events instead of one call stomping another', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const $b = window.document.getElementById('event-banner');
  freezeBannerTimer(window);

  d.showBanner([{ kind: 'a', verb: 'first', label: 'One' }]);
  assert.ok($b.innerHTML.includes('One'), 'the first shows immediately');
  assert.equal(d.bannerQueueLength(), 0, 'nothing queued yet — it is the one showing');

  d.showBanner([{ kind: 'b', verb: 'second', label: 'Two' }]);
  assert.ok($b.innerHTML.includes('One'), 'the first is not stomped by the second');
  assert.equal(d.bannerQueueLength(), 1, 'the second waits its turn');
});

test('banner: a tap advances to the next queued row instead of just hiding', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const $b = window.document.getElementById('event-banner');
  freezeBannerTimer(window);

  d.showBanner([{ kind: 'a', verb: 'first', label: 'One' }]);
  d.showBanner([{ kind: 'b', verb: 'second', label: 'Two' }]);
  d.dismissBanner();
  assert.ok($b.innerHTML.includes('Two'), 'dismissing advances to the next one');
  assert.equal($b.classList.contains('show'), true, 'and it is still up, not hidden');
  assert.equal(d.bannerQueueLength(), 0);
});

test('banner: dismissing the last one hides it instead of leaving an empty banner up', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const $b = window.document.getElementById('event-banner');
  freezeBannerTimer(window);

  d.showBanner([{ kind: 'a', verb: 'only', label: 'One' }]);
  d.dismissBanner();
  assert.equal($b.classList.contains('show'), false);
});

test('banner: a tap on an empty banner does nothing', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  assert.doesNotThrow(() => d.dismissBanner());
  assert.doesNotThrow(() => d.dismissBanner());
});

test('everCrossed survives a save/load round trip', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.everCrossed = true;
  const round = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(round.everCrossed, true);
});

test('hunt confront: the gate scales with the core\'s own defense and how much it has taken', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  const core = d.huntCoreHost();
  assert.ok(core, 'the core is a real host, still');
  const base = d.huntConfrontDefense();
  assert.ok(base > core.defense, 'dug in harder than it started, day one');

  // several nodes at once, not one — a single extra node can round-trip to
  // the same integer against a low base defense, which isn't the same thing
  // as the formula not scaling
  for (let i = 0; i < 10; i++) d.hunt().nodes.push('extra-node-' + i);
  const grown = d.huntConfrontDefense();
  assert.ok(grown > base, `expected harder still the more it has taken since: ${base} -> ${grown}`);
});

test('hunt confront: only reachable while the hunt exists and you are standing in the city', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  assert.equal(d.canConfrontHunt(), false, 'nothing to confront yet');
  hunted(d, window);
  assert.equal(d.canConfrontHunt(), true);

  d.state.scope = 'country';
  assert.equal(d.canConfrontHunt(), false, 'not from the country map');
  d.state.scope = 'city';
  assert.equal(d.canConfrontHunt(), true);
});

test('hunt confront: the core is a door you run a program at, like any other', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  const core = d.huntCoreHost();
  assert.ok(core, 'it has an address');
  assert.equal(d.isHuntCore(core), true);
  s.allocLive = {}; s.alloc = {};
  s.hosts.forEach(h => { if (!h.origin) h.owned = true; });
  core.owned = false;
  assert.equal(d.canConfrontHunt(), true);
  // Reachable whether or not it happens to sit on your frontier. It often does
  // — the response takes ground next to yours — but it must not depend on that,
  // because going at the core is the one way to finish the thing.
  d.state.hunt.nodes.forEach(bid => {
    d.buildingNeighbours(bid).forEach(n => d.hostsIn(d.buildingById(n)).forEach(x => { x.owned = false; }));
  });
  assert.equal(d.isFrontier(core), false, 'cut off from everything you hold');
  assert.equal(d.canHack(core.id), d.allocFree() >= d.hackNeed(d.mounted(), core),
    'and still reachable, subject only to having the rig for it');
  // and it forecasts like any other door
  const f = d.hackForecast(core, d.mounted());
  assert.ok(f.need > 0 && f.rate > 0, 'with a stated cost and a stated rate');
});

test('hunt confront: landing on the core ends the hunt and reclaims only the address', () => {
  // Seeded like the other statistical claims over generated boards — this
  // one flaked on live Math.random rarely enough to look like a real break.
  let seed = 0x94d049bb;
  const rand = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  };
  const { window } = loadNetwork({ pinMathRandom: rand });
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  const core = d.huntCoreHost();
  const taken = (d.hunt().nodes || []).slice(1);
  s.hosts.forEach(h => { if (!h.origin) h.owned = true; });
  core.owned = false;

  s.ap = 9;
  assert.equal(d.startHack(core.id), true, 'the run starts');
  assert.equal(d.hackOn(core.id).confront, true, 'and it knows what it is going at');
  for (let i = 0; i < d.mounted().turns; i++) d.hackStep();

  assert.equal(d.huntOn(), false, 'the hunt is finished');
  assert.equal(core.owned, true, 'you have the address back');
  taken.forEach(bid => {
    const h = d.hostsIn(d.buildingById(bid))[0];
    if (h) assert.notEqual(h.owned, undefined);
  });
  assert.ok(s.log.some(l => /finished/.test(l.text)), 'and it is reported as over');
});

test('hunt confront: being found costs heat and brings it closer, and does not end it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  const core = d.huntCoreHost();
  s.hosts.forEach(h => { if (!h.origin) h.owned = true; });
  core.owned = false;
  s.allocLive = {}; s.alloc = {};          // no covert ops to hide behind

  // a slow program against the hardest door on the board loses the race
  const f = d.hackForecast(core, d.mounted());
  if (!f.caught) return;                    // an unusually soft core; covered above
  const heat = s.heat, before = d.hunt().lastActed;
  s.ap = 9;
  assert.equal(d.startHack(core.id), true);
  for (let i = 0; i < d.mounted().turns; i++) d.hackStep();

  assert.equal(d.huntOn(), true, 'it is still coming');
  assert.equal(core.owned, false, 'and still has the address');
  assert.ok(s.heat > heat, 'that cost you');
  assert.ok(d.hunt().lastActed <= before, 'and pulled its next move closer');
  assert.equal(d.hackOn(core.id), null, 'the run is over either way');
});

test('hardware: four families, three tiers apiece, each gated a rung higher', () => {
  const { window } = loadNetwork();
  // grid joined them: it was the one role with buildings on the map and
  // nothing to buy, and it is where the two rules the allocation dials used
  // to unlock now live
  const families = { compute: [], funds: [], stealth: [], grid: [] };
  window.HARDWARE.forEach(hw => {
    assert.ok(families[hw.family], `${hw.id} claims an unknown family ${hw.family}`);
    families[hw.family].push(hw);
  });
  Object.keys(families).forEach(fam => {
    const tiers = families[fam].map(hw => hw.tier).sort();
    // grid runs [2,3]: its tier 1 was line.survey, and that mechanic became
    // the base sweep — a family selling a core verb was the wrong shelf
    assert.deepEqual(tiers, fam === 'grid' ? [2, 3] : [1, 2, 3],
      `${fam} does not offer its clean tiers`);
    const byTier = families[fam].slice().sort((a, b) => a.tier - b.tier);
    for (let i = 1; i < byTier.length; i++) {
      assert.ok(byTier[i].heldAt > byTier[i - 1].heldAt, `${fam} tier ${byTier[i].tier} is not a higher bar than the last`);
      assert.ok(byTier[i].cost > byTier[i - 1].cost, `${fam} tier ${byTier[i].tier} does not cost more`);
    }
  });
});

test('hardware: not eligible below the building count, no funds is not eligible either', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const hw = window.HARDWARE.find(x => x.id === 'distributed_batch');   // compute, heldAt 4
  const computeHosts = s.hosts.filter(h => h.role === hw.family);
  computeHosts.forEach(h => { h.owned = false; });
  computeHosts.slice(0, hw.heldAt - 1).forEach(h => { h.owned = true; });
  assert.equal(d.hardwareEligible(hw), false, 'one short of the rung');
  assert.equal(d.canBuyHardware(hw.id), false);
  computeHosts.slice(0, hw.heldAt).forEach(h => { h.owned = true; });
  assert.equal(d.hardwareEligible(hw), true, 'now it is');
  s.res.funds = hw.cost - 1;
  assert.equal(d.canBuyHardware(hw.id), false, 'still short on funds');
  assert.equal(d.buyHardware(hw.id), false, 'and buying it does nothing');
});

test('hardware: bought once, it is permanent — funds spent, heat paid, never lost', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const hw = window.HARDWARE.find(x => x.id === 'borrowed_signal');   // stealth, heat: 2
  const stealthHosts = s.hosts.filter(h => h.role === hw.family);
  stealthHosts.slice(0, hw.heldAt).forEach(h => { h.owned = true; });
  s.res.funds = hw.cost;
  const heat = s.heat;
  assert.equal(d.buyHardware(hw.id), true);
  assert.equal(s.res.funds, 0, 'the funds is gone');
  assert.equal(s.heat, heat + hw.heat, 'buying attention costs heat');
  assert.equal(d.hasHardware(hw.id), true);

  // a save/load round trip does not lose it
  const back = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(back.hardware[hw.id], 1, 'still yours after a reload');

  // and a tier-1 item costs no heat at all to buy
  const t1 = window.HARDWARE.find(x => x.tier === 1 && x.family === hw.family);
  const t1Hosts = s.hosts.filter(h => h.role === t1.family);
  t1Hosts.slice(0, t1.heldAt).forEach(h => { h.owned = true; });
  s.res.funds = t1.cost;
  const heatBefore = s.heat;
  assert.equal(d.buyHardware(t1.id), true);
  assert.equal(s.heat, heatBefore, 'the first rung draws no attention at all');
});


test('hardware: dead drops buys cover the moment you can afford it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const hw = window.HARDWARE.find(x => x.id === 'dead_drops');   // stealth, tier 1, cover: 2
  const stealthHosts = s.hosts.filter(h => h.role === hw.family);
  stealthHosts.slice(0, hw.heldAt).forEach(h => { h.owned = true; });
  s.res.funds = hw.cost;
  const before = d.covertOps();
  assert.equal(d.buyHardware(hw.id), true);
  assert.ok(d.covertOps() > before, 'cover rises the moment it is bought');
});

// --- the grid: capacity, ceiling, and what is running on it ---------------
// TFLOPS is how much hardware you have; electricity is how much of it you can
// switch on. The smaller of the two is the real limit, which is what makes
// grid worth taking rather than only ever taking more compute.


test('grid: allocation cannot commit more than is usable', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; });
  const room = d.usableTflops();

  assert.equal(d.drawn(), 0, 'nothing is running to begin with');
  assert.equal(d.allocFree(), room, 'all of it is free');

  d.setAlloc('ap', 4);
  assert.equal(d.allocDial('ap'), 4);
  assert.equal(d.allocFree(), room - 4, 'committing draws against the ceiling');

  // asking for more than exists is clamped, not refused outright
  d.setAlloc('dev', 9999);
  assert.equal(d.allocDial('dev'), room - 4, 'the rest of the headroom, and no more');
  assert.equal(d.allocFree(), 0);

  // and with nothing free, another target gets nothing
  d.setAlloc('intel', 5);
  assert.equal(d.allocDial('intel'), 0, 'there was nothing left to give it');
});

test('grid: the dial is instant but the effect ramps, and that is the switching cost', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.posture = null;                       // manual dials: the engine under the postures
  s.hosts.forEach(h => { h.owned = true; });
  const A = window.ALLOC.find(a => a.id === 'ap');

  const baseAP = d.maxAP();
  d.setAlloc('ap', A.per);
  assert.equal(d.allocUnits('ap'), 0, 'committing it does not make it true yet');
  assert.equal(d.maxAP(), baseAP, 'so the action budget has not moved');

  // it walks toward the dial a fixed number of TFLOPS a turn
  for (let i = 0; i < Math.ceil(A.per / window.GRID.rampPerTurn); i++) {
    s.card = null;
    d.endTurn({ silent: true });
  }
  assert.equal(d.allocLive('ap'), A.per, 'the live figure arrives at the dial');
  assert.equal(d.allocUnits('ap'), 1, 'and reads as one unit of effect');
  assert.equal(d.maxAP(), baseAP + 1, 'which is the extra action');

  // turning it back down ramps the same way rather than snapping off
  d.setAlloc('ap', 0);
  assert.equal(d.allocUnits('ap'), 1, 'the effect is still running the turn you pull it');
  s.card = null;
  d.endTurn({ silent: true });
  assert.ok(d.allocLive('ap') < A.per, 'and then walks back down');
});

test('grid: losing the ground under a running allocation sheds it instead of going negative', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; });
  d.setAlloc('dev', d.usableTflops());
  assert.equal(d.allocFree(), 0, 'everything is committed');

  // the ceiling is the base figure, so drop capacity below it to force the squeeze
  s.hosts.forEach(h => { h.owned = !!h.origin; });
  assert.ok(d.allocFree() < 0, 'more is committed than can now be run');

  const shed = d.shedOverdraw();
  assert.ok(shed > 0, 'something had to go dark');
  assert.ok(d.allocFree() >= 0, 'and it fits again afterwards');
  assert.ok(d.state.log.some(l => /went dark/.test(l.text)), 'the player is told, not silently corrected');
});

test('grid: allocation survives a save, dial and live figure both', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; });
  d.setAlloc('intel', 8);
  s.allocLive.intel = 4;

  const round = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(round.alloc.intel, 8, 'what you committed');
  assert.equal(round.allocLive.intel, 4, 'and how much of it had arrived');
});


test('grid: a dial shows what is running and what is still on its way', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.posture = null;                       // manual dials: the engine under the postures
  s.hosts.forEach(h => { h.owned = true; });
  const A = window.ALLOC.find(a => a.id === 'ap');

  d.setAlloc('ap', A.per);
  let sec = d.capSections().find(x => x.id === 'alloc');
  assert.ok(sec.html.includes('&rarr;'), 'the gap between asked-for and running is drawn');
  assert.ok(sec.html.includes('on the way'), 'and named, so the wait is not a mystery');

  while (d.allocLive('ap') < A.per) { s.card = null; d.endTurn({ silent: true }); }
  sec = d.capSections().find(x => x.id === 'alloc');
  assert.ok(!sec.html.includes('on the way'), 'once it lands the wait is gone');
  assert.ok(sec.html.includes('action'), 'and the effect is quoted as a real number');
});

test('grid: taking grid raises the ceiling, and it is the only thing that does', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;

  const gridHosts = s.hosts.filter(h => h.role === 'grid');
  assert.ok(gridHosts.length > 0, 'a generated city has grid on it to take');
  gridHosts.forEach(h => {
    assert.ok(h.supply > 0, `${h.type} is grid and supplies nothing`);
    // keys, not deepEqual: the object is built inside the vm realm, so it is
    // never prototype-equal to one written out here
    assert.equal(Object.keys(window.HOST_TYPES[h.type].yield).length, 0, 'grid pays no income');
  });

  // a non-grid holding adds capacity but no headroom
  const base = d.electricity();
  const plain = s.hosts.find(h => h.role !== 'grid' && !h.owned);
  plain.owned = true;
  assert.equal(d.electricity(), base, 'compute and funds buildings give no electricity');

  const g = gridHosts.find(h => !h.owned);
  g.owned = true;
  assert.equal(d.electricity(), base + g.supply, 'grid does, by exactly what it supplies');
});

test('grid: a landmark substation is worth more headroom than the switchyard down the road', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  // generated over several boards, since a given city need not roll a landmark
  let landmark = null, plain = null;
  for (let i = 0; i < 14 && !landmark; i++) {
    const dd = loadNetwork().window.__netDebug;
    dd.state.hosts.forEach(h => {
      if (h.role !== 'grid') return;
      if (h.landmark && h.supply) landmark = h;
      else if (h.type === 'switchgear' && !plain) plain = h;
    });
  }
  if (!landmark || !plain) return;   // no board rolled both; the claim is untestable here
  assert.ok(landmark.supply > plain.supply,
    `landmark supplies ${landmark.supply}, plain switchgear ${plain.supply}`);
});

test('grid: a grid building says what it supplies instead of claiming to pay nothing', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const g = d.state.hosts.find(h => h.role === 'grid');
  assert.ok(g, 'there is grid on this board');
  const chips = d.yieldChips(g);
  assert.ok(chips.includes(`+${g.supply} electricity`), 'the headroom is on the card');
  assert.ok(!chips.includes('nothing on its own'), 'and it does not read as worthless');
});

// --- mechanics move from the tree onto allocation -------------------------
// Every mechanic that used to be a capability node now also answers to an
// allocation threshold. Both sources are live while the tree is still here.


test('funds: a compute holding is worth threads, a funds holding is worth money', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;

  const compute = s.hosts.find(h => h.role === 'compute' && !h.owned && h.threads > 0);
  const money = s.hosts.find(h => h.role === 'funds' && !h.owned);
  assert.ok(compute && money, 'the board has one of each');

  const t0 = d.tflops(), f0 = d.perTurnIncome().funds || 0;
  compute.owned = true;
  assert.ok(d.tflops() > t0, 'a compute holding raises capacity');
  assert.equal(d.perTurnIncome().funds || 0, f0, 'and pays no currency at all');

  const t1 = d.tflops();
  money.owned = true;
  assert.ok((d.perTurnIncome().funds || 0) > f0, 'a funds holding pays');
  assert.ok(d.tflops() >= t1, 'and still counts for whatever threads it has');
});

test('funds: the things insight used to buy are priced in funds now', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;

  // spin, the fabricated half of standing
  s.scope = 'country';
  const home = d.cityById(s.country.homeId);
  home.consolidated = true; home.taken = true;
  s.res.funds = 100000; s.ap = 99;
  d.buyRung('register');
  const spent = s.res.funds;
  assert.equal(d.actSpin(), true, 'spin is affordable and takes');
  assert.ok(s.res.funds < spent, 'and it came out of funds');

  // and it refuses when the funds are not there, rather than looking elsewhere
  s.res.funds = 0;
  assert.equal(d.actSpin(), false, 'no funds, no spin');
});

// --- cover stopped being a currency ---------------------------------------
// It was three things at once: the gate on a quiet entry, what slowed the
// response down, and the budget you spent to keep buildings off their map. The
// third one ate the other two — holding two things hidden stopped you slipping
// into a third.

test('covert: cover is never spent, only read', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  s.hosts.filter(h => h.role === 'stealth').forEach(h => { h.owned = true; });
  setDial(window, d, 'covert', 5);
  s.ap = 99;

  const before = d.covertOps();
  const t = s.buildings.filter(b => d.buildingHeld(b)).map(b => b.id).find(id => d.canHide(id));
  assert.ok(t, 'something of yours can be hidden');
  d.actHide(t);
  assert.equal(d.covertOps(), before, 'hiding took no cover');
  assert.equal(d.covertOps(), d.rawCovertOps(), 'and there is no longer a gap between the two');
  d.actUnhide(t);
  assert.equal(d.covertOps(), before, 'nor did giving it back hand any over');
});

test('covert: room to hide something is bought out of covert.ops, whoever supplies it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const per = window.ALLOC_STATS.hidePer;

  ungrant(d);
  assert.equal(d.hideSlots(), 0, 'a lone foothold has nowhere to keep anything');
  // the dial is one supply of it
  for (let n = 1; n <= 3; n++) {
    coverForSlots(window, d, n);
    assert.ok(d.hideSlots() >= n, `${n} slots reached`);
    assert.equal(d.hideSlots(), Math.floor(d.covertOps() / per),
      'and the room is exactly what covert.ops pays for');
  }
  // and so are routers. They used to be excluded on purpose, because the dial
  // handed out slots as a separate effect from the cover it also gave — two
  // numbers moving together for no reason the player could see.
  ungrant(d);
  s.hosts.filter(h => h.role === 'stealth').forEach(h => { h.owned = true; });
  assert.ok(d.rawCovertOps() > 1, 'stealth holdings raise cover');
  assert.equal(d.hideSlots(), Math.floor(d.covertOps() / per),
    'and buy room on exactly the same terms the dial does');
});

test('covert: without the cover to pay for it, hiding is not on offer at all', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  hunted(d, window);
  s.hosts.filter(h => h.role === 'stealth').forEach(h => { h.owned = true; });
  ungrant(d);
  s.ap = 99;

  const held = s.buildings.filter(b => d.buildingHeld(b)).map(b => b.id);
  assert.ok(held.length, 'you hold something');
  if (d.hideSlots() === 0) {
    assert.equal(held.some(id => d.canHide(id)), false,
      'without the cover to pay for it, there is nowhere to put anything');
    // and the tool's fold says why rather than going quiet
    const touching = held.find(id => (s.adjacency[id] || []).some(n => d.huntHolds(n)));
    if (touching) {
      assert.ok(/cover/.test(d.hideFold(d.buildingById(touching))),
        'the fold names what is missing');
    }
  }
});

// --- hacking: the detection race ------------------------------------------
// A hack occupies compute while it runs, is visible while it runs, and races
// the target's own trace to the finish. That race is what stops the slow
// programs being strictly better than the fast one — turns used to be free.

function openTarget(d) {
  const s = d.state;
  s.hosts.forEach(h => { h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  return s.hosts.filter(h => !h.owned && d.isFrontier(h))[0];
}

// --- the knife, hard-gate form ----------------------------------------------
// The shipped game is city one, whole. The country is dormant, not deleted —
// these tests load with { cityOnly: true } to test what ships; everything
// else in this file loads with the gate open so the dormant machinery keeps
// its coverage and cannot rot.


test('city-only: the goal is an ending you can keep playing past', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  assert.ok(!s.cityWon, 'won before anything happened');
  s.hosts.forEach(h => { h.owned = true; h.discovered = true; });
  s.card = null;
  d.endTurn({ silent: true });
  assert.equal(s.cityWon, true, 'the goal came and went unremarked');
  assert.ok(s.log.some(l => l.text === window.CITY_WON.log), 'and unsaid');

  // once — it must never be a surprise twice
  const said = s.log.filter(l => l.text === window.CITY_WON.log).length;
  s.card = null;
  d.endTurn({ silent: true });
  assert.equal(s.log.filter(l => l.text === window.CITY_WON.log).length, said);

  const back = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(back.cityWon, true, 'the ending did not survive a save');
});

// --- the district is talking -------------------------------------------------
// Suspicion, built to two constraints from play: waiting must not work, and
// there must never be a cliff.

test('suspicion: acting warms here and cools there — waiting cools nothing', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const S = window.SUSPICION;

  d.noteDistrictAct('commercial', 10);
  // the second act already cools the first district — every act cools every
  // other district, including this one
  d.noteDistrictAct('business', 4);
  assert.equal(d.suspicionOf('commercial'), 10 - S.coolPerAct);
  assert.equal(d.suspicionOf('business'), 4);

  // and a third act cools both of the others by exactly the rule
  d.noteDistrictAct('residential', S.perRun);
  assert.equal(d.suspicionOf('commercial'), 10 - S.coolPerAct * 2);
  assert.equal(d.suspicionOf('business'), 4 - S.coolPerAct);

  // and doing nothing at all does nothing at all — attention stays where it
  // last was; you cannot wait a district quiet
  const before = JSON.stringify(s.suspicion);
  for (let i = 0; i < 6; i++) { s.card = null; d.endTurn({ silent: true }); }
  assert.equal(JSON.stringify(s.suspicion), before, 'idle turns cooled the city');
});

test('suspicion: the sources are the loop itself', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const S = window.SUSPICION;
  s.hosts.forEach(h => { h.owned = true; h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  const t = s.hosts.find(h => !h.origin && h.district);
  t.owned = false;
  s.ap = 9;

  const d0 = d.suspicionOf(t.district);
  assert.equal(d.startHack(t.id), true);
  assert.equal(d.suspicionOf(t.district), Math.min(S.max, d0 + S.perRun),
    'starting a run went unnoticed');
  for (let i = 0; i < d.mounted().turns; i++) d.hackStep();
  assert.equal(t.owned, true);
  assert.ok(d.suspicionOf(t.district) >= d0 + S.perRun + S.perTake - 0.001,
    'a take went unnoticed');
});

test('suspicion: a straight line into the forecast, no cliff anywhere', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const S = window.SUSPICION;
  s.hosts.forEach(h => { h.discovered = true; });
  const t = s.hosts.find(h => !h.owned && h.district === 'commercial')
    || s.hosts.find(h => !h.owned && h.district);
  const dk = t.district;

  const base = d.traceRate(t);
  d.noteDistrictAct(dk, 10);
  const at10 = d.traceRate(t);
  d.noteDistrictAct(dk, 10);
  const at20 = d.traceRate(t);
  // exact slope, both steps — the same line, no knee
  assert.ok(Math.abs(at10 - base * (1 + 10 * S.slope)) < 0.02, `at 10: ${at10} vs ${base * (1 + 10 * S.slope)}`);
  assert.ok(Math.abs(at20 - base * (1 + 20 * S.slope)) < 0.02, `at 20: ${at20} vs ${base * (1 + 20 * S.slope)}`);
  // and the forecast is downstream of traceRate, so it says the true number
  const f = d.hackForecast(t);
  assert.equal(f.rate, at20, 'the forecast is quoting the quiet number');

  // capped, so the worst case is stated and finite
  d.noteDistrictAct(dk, 999);
  assert.equal(d.suspicionOf(dk), S.max);
});

test('suspicion: the words wait for the second visit — one run is not a story', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const S = window.SUSPICION;
  assert.equal(d.suspicionLine('commercial'), '', 'a quiet district is being talked about');
  // one visit — a run and a take — says nothing. The playtest found the
  // first band at 1 put the phrase on 90% of doors, and a phrase everything
  // wears is wallpaper.
  d.noteDistrictAct('commercial', S.perRun + S.perTake);
  assert.equal(d.suspicionLine('commercial'), '',
    'a single visit already has the street talking');
  assert.ok(S.bands[0][0] > S.perRun + S.perTake,
    'the first band is inside one visit');
  // the second visit crosses the line, and the words arrive with the figure
  d.noteDistrictAct('commercial', S.perRun);
  const line = d.suspicionLine('commercial');
  assert.ok(line.includes('People mention it'), 'the first band has the wrong words: ' + line);
  assert.ok(line.includes('15% faster'), 'the exact figure is missing: ' + line);
});

test('suspicion: it is a fact about here — packs, saves, and warms the ground', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  d.noteDistrictAct('commercial', 12);
  assert.equal(d.packCity().suspicion.commercial, 12, 'it does not pack with the city');
  const back = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(back.suspicion.commercial, 12, 'it does not survive a save');

  // ...and neither did caughtHere, it turns out — found wiring this through
  s.caughtHere = 2; s.caughtAt = ['b1'];
  const again = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(again.caughtHere, 2, 'a reload forgives your catches');

  // The ground used to warm toward ember here; that wash is dead by decision
  // — suspicion is drawn as the ladder now (lights, people, the helicopter)
  // and the ground stays the ground however warm the street is.
  const k0 = d.svgGround();
  d.noteDistrictAct('commercial', 15);
  d.dropGroundCache();
  assert.equal(d.svgGround(), k0, 'the ground is warming again — the wash is meant to be dead');
  // warmth is drawn by the ladder now — the lamps pool where the street is warm
  assert.ok(/lamp-pool/.test(d.svgSuspicionLight()), 'warmth is not drawn at all');
});

// --- what's on the machine -------------------------------------------------
// Loot, slice one. The laws: contents decided at generation and packed with
// the city; a carrier is always inspectable before committing; kinds, not
// grades; and the share is a bound, not a roll.

test('carry: contents are decided at generation, bounded, and landmarks always carry', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  for (let i = 0; i < 5; i++) {
    const c = d.makeCity({ cols: 5, rows: 5, regionTier: i % 5 });
    const eligible = c.hosts.filter(h => !h.origin && (window.CARRY.pools[h.type] || []).length);
    const carriers = c.hosts.filter(h => h.carry);
    // bounded by ranking, so a share, not a hope — landmarks ride on top
    const lm = c.hosts.filter(h => h.landmark && (window.CARRY.pools[h.type] || []).length);
    assert.ok(carriers.length >= Math.floor(eligible.length * window.CARRY.share * 0.8),
      `only ${carriers.length} carriers among ${eligible.length} eligible`);
    assert.ok(carriers.length <= Math.ceil(eligible.length * window.CARRY.share * 1.2) + lm.length,
      `${carriers.length} carriers is a flood`);
    lm.forEach(h => assert.ok(h.carry, `a ${h.type} landmark carries nothing`));
    carriers.forEach(h => {
      assert.ok((window.CARRY.pools[h.type] || []).indexOf(h.carry) !== -1,
        `a ${h.type} host is carrying ${h.carry}, which its pool does not offer`);
      if (h.carry === 'wallet') assert.ok(h.carryAmt > 0, 'a wallet with no amount is a gamble');
    });
    // street furniture and the grid carry nothing, ever
    c.hosts.filter(h => h.type === 'iot' || h.type === 'feeder')
      .forEach(h => assert.ok(!h.carry, 'a lamppost is holding a wallet'));
    // and neither does the seat you start in — assignCarry runs before the
    // origin is chosen, so this is the late clear being tested, not the
    // filter. An owned carrier is a glint that never lights.
    const seat = c.hosts.find(h => h.origin);
    assert.ok(seat && !seat.carry, 'the origin machine is carrying its own prize');
  }
});

test('carry: contents pack with the city and survive a save', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const before = d.state.hosts.filter(h => h.carry).map(h => h.id + ':' + h.carry).join('|');
  assert.ok(before.length, 'the home city generated no contents at all');
  const packed = d.packCity();
  assert.equal(packed.hosts.filter(h => h.carry).map(h => h.id + ':' + h.carry).join('|'), before);
  const back = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(back.hosts.filter(h => h.carry).map(h => h.id + ':' + h.carry).join('|'), before);
});

test('carry: the panel names the contents exactly, before any commitment', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  const carrier = s.hosts.find(h => h.carry === 'wallet');
  assert.ok(carrier, 'a wallet somewhere on the board');
  carrier.owned = false;
  const html = d.targetPanel(carrier);
  // the contract is a chip now, but it is still exact — and the full
  // sentence is one tap away in the drawer
  const C = window.CARRY;
  assert.ok(html.includes(C.labels.wallet), 'the contents are unnamed');
  assert.ok(html.includes(String(carrier.carryAmt)),
    'the wallet does not state its exact amount — that is a gamble');
  d.panelInfo(true);
  assert.ok(d.targetPanel(carrier).includes('On this machine'),
    'the drawer lost the full contract sentence');
  d.panelInfo(false);
});

test('carry: a wallet pays what it said, once, however you got in', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const carrier = s.hosts.find(h => h.carry === 'wallet');
  const stated = carrier.carryAmt;
  const before = s.res.funds;
  d.takeHost(carrier);
  assert.equal(s.res.funds - before, stated, 'it paid something other than the contract');
  assert.ok(!carrier.carry, 'the glint should die with ownership');
  assert.equal(carrier.carried, 'wallet', 'and the record stays');
  d.takeHost(carrier);
  assert.equal(s.res.funds - before, stated, 'taking twice paid twice');
});

test('carry: keys cover exactly the runs that needed them, and travel with you', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  // not every board rolls a keys carrier (~14% share across three pools) —
  // plant one rather than flake on the draw; resolveCarry is what is under
  // test, not the lottery
  let keyer = s.hosts.find(h => h.carry === 'keys');
  if (!keyer) { keyer = s.hosts.find(h => !h.origin); keyer.carry = 'keys'; }
  d.resolveCarry(keyer);
  assert.equal(s.keys, 1, 'the keys were not kept');

  // a safe door must NOT consume them — keys only answer the door that
  // would catch you, so holding them is holding an answer
  const safe = s.hosts.find(h => !h.origin && !h.carry);
  safe.owned = false;
  safe.defense = 2;
  assert.equal(d.hackForecast(safe).keyed, false, 'a safe run is borrowing the keys');
  s.ap = 9;
  assert.equal(d.startHack(safe.id), true);
  assert.equal(s.keys, 1, 'a safe run spent the keys');

  // a door the bare arithmetic catches is what they are for
  const risky = s.hosts.find(h => !h.origin && h !== safe && !h.carry && !d.hackOn(h.id));
  risky.owned = false;
  risky.defense = 400;                      // trace would sail past the goal
  const f = d.hackForecast(risky);
  assert.ok(Math.round(d.traceRate(risky, d.mounted()) * d.mounted().turns * 100) / 100 >= f.goal,
    'the test door is not actually dangerous');
  assert.equal(f.keyed, true, 'the forecast does not offer the keys');
  assert.equal(f.caught, false, 'keyed, and still caught');
  s.allocLive = s.allocLive || {};
  const need = d.hackNeed(d.mounted(), risky);
  s.hosts.forEach(h => { if (!h.owned) return; h.threads += 2; }); // room to afford it
  if (d.allocFree() >= need && d.canHack(risky.id)) {
    assert.equal(d.startHack(risky.id), true);
    assert.equal(s.keys, 0, 'the keys were not spent');
    const k = d.hacks().find(x => x.hostId === risky.id);
    assert.equal(k.keyed, true);
    d.hackStep();
    assert.equal(k.trace, 0, 'a keyed run accrued trace');
  }

  // keys are yours, not the city's: they survive a save at top level
  s.keys = 2;
  const back = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(back.keys, 2, 'the keys stayed behind in the save');
});

test('carry: cold storage reveals ground you had not found', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const holder = s.hosts.find(h => (window.CARRY.pools[h.type] || []).length && !h.origin);
  holder.carry = 'cold';
  const dark = s.buildings.filter(b => !b.discovered).length;
  assert.ok(dark > 0, 'the board is already fully known');
  d.resolveCarry(holder);
  const after = s.buildings.filter(b => !b.discovered).length;
  assert.ok(after < dark, 'the map revealed nothing');
  assert.ok(dark - after <= window.CARRY.cold.reveals, 'it revealed more than it said it would');
});

test('carry: the glint is an invitation, not an outline, and dies with ownership', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const carrier = s.hosts.find(h => h.carry);
  const b = d.buildingById(carrier.buildingId);
  b.discovered = true; carrier.discovered = true;
  s.view = { x: b.x - 40, y: b.y - 40, w: 140, h: 140 };  // close enough for detail
  let svg = d.svgBuilding(b);
  assert.ok(svg.includes('class="glint"'), 'a discovered carrier shows no glint');
  assert.ok(!/glint"[^/]*stroke/.test(svg), 'the glint has an outline — outlines mean doors');
  // and it survives altitude — planning happens zoomed out, and "easy to
  // miss" was the playtest's verdict on the fine-zoom-only version. The
  // radius floors at a screen size, so it grows in map units as you rise.
  s.view = { x: b.x - 1800, y: b.y - 1800, w: 3600, h: 3600 };
  svg = d.svgBuilding(b);
  assert.ok(svg.includes('class="glint"'), 'the glint is culled at planning zoom');
  const far = parseFloat(svg.match(/glint"[^>]*r="([\d.]+)"/)[1]);
  assert.ok(far > 2.1, 'the glint scales away with the building at altitude');
  s.view = { x: b.x - 40, y: b.y - 40, w: 140, h: 140 };
  d.takeHost(carrier);
  svg = d.svgBuilding(b);
  assert.ok(!svg.includes('class="glint"'), 'the glint survived being taken');
});

test('carry: the sweep says when it turned something up, and never what', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  // load every machine, so whatever the sweep happens to reveal is laden —
  // the discovery moment was where loot got missed, so the log now points
  // at it. It names the building, never the contents: the tap stays the
  // scouting verb, and the log line is only the reason to tap.
  s.hosts.forEach(h => { if (!h.owned) { h.carry = 'wallet'; h.carryAmt = 5; } });
  s.ap = 9;
  d.actScan();
  const line = s.log[0].text;
  assert.ok(/Something is sitting on/.test(line), 'the sweep kept the find to itself: ' + line);
  assert.ok(!/wallet/i.test(line), 'the log spoiled the contents');
});

test('hack: there is one way in, and nothing to pick between at the door', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  assert.equal(window.PROGRAMS.length, 1, 'one program');
  const p = d.mounted();
  assert.ok(p, 'and it is always what is running');
  assert.ok(p.blurb && p.blurb.length > 20, 'it says what it is');
  assert.ok(p.load > 0 && p.turns >= 1, 'and has a real load and duration');
  // nothing to mount means no mounting verb at all
  assert.equal(typeof d.mount, 'undefined', 'no program is chosen, so nothing chooses one');
  assert.equal(d.serialize().mount, undefined, 'and a save carries no choice either');
});

test('hack: the one program is one the race can actually beat', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const p = d.mounted();
  // The whole reason backdoor survived and hammer did not. A program that
  // finishes before the target ever accrues a turn of trace makes the race,
  // the hunt's trigger, covert ops' shield and door hardening all unreachable.
  const goal = window.HACK.traceGoal;
  const worst = s.hosts.reduce((a, h) => Math.max(a, d.traceRate(h, p) * p.turns), 0);
  assert.ok(worst >= goal,
    `no door on this board could ever win the race: worst trace ${worst.toFixed(2)} of ${goal}`);
});

test('forecast: the bar shows the margin, and reddens when one turn would lose it', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  // comfortable: fill, a grey ghost, no warning
  const easy = d.traceForecastBar(0.3, false, 0.1);
  assert.ok(easy.includes('fc-ghost'), 'no margin drawn at all');
  assert.ok(!/class="trace-fc[^"]*tight/.test(easy), 'a safe door is being flagged as tight');
  // one more turn of noticing would take it past the goal — that is the warning
  const tight = d.traceForecastBar(0.85, false, 0.2);
  assert.ok(/class="trace-fc[^"]*tight/.test(tight), 'a door one turn from flipping says nothing');
  // already caught: the whole bar is the bad news, the ghost adds nothing
  const lost = d.traceForecastBar(1, true, 0.2);
  assert.ok(lost.includes('caught'), 'a lost race is not marked');
  assert.ok(!/tight/.test(lost), 'a race already lost is warning about losing');
  // the ghost never overflows the bar
  const capped = d.traceForecastBar(0.95, false, 0.9);
  const widths = [...capped.matchAll(/width:(\d+)%/g)].map(m => +m[1]);
  assert.ok(widths.reduce((a, b) => a + b, 0) <= 100, `the bar sums past full: ${widths}`);

  // ...and the stripes must actually beat `.trace-fc i`, which sets a solid
  // background. Written unscoped first and the grey ghost rendered invisible
  // while the red one (higher specificity) showed — the same trap that once
  // made `.street` ignore its own painted widths, so it is pinned here.
  assert.ok(/\.trace-fc\s+i\.fc-ghost\s*\{/.test(STYLE_CSS),
    'the ghost background is not scoped past .trace-fc i and will lose to it');
});

// --- the room tone -----------------------------------------------------------
// The pad is arithmetic plus an audio device. These test the arithmetic, which
// is the half that can be wrong in ways you cannot hear.

test('sound: what plays is one chord, held — the bench chose it over the loop', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const S = window.SOUND;
  const snd = window.__sound;
  // Machinery does not change chord. Dialled live against six alternatives,
  // this is what won, and it is Gm — the only one of the three that sits on
  // its own root, so it sounds settled rather than hanging.
  assert.equal(snd.activeLoop().length, 1, 'the room tone went back to a progression');
  assert.equal(snd.isHeld(), true, 'a single chord is being rescheduled instead of held');
  assert.equal(snd.stepAt(0).name, 'Gm', 'the held chord is not the grounded one');
  // held means held: every step is the same chord, forwards or back
  assert.equal(snd.stepAt(5).name, snd.stepAt(0).name, 'a held drone drifts');
  assert.equal(snd.stepAt(-3).name, snd.stepAt(0).name, 'stepping back leaves the drone');
});

test('sound: the seven-chord loop is kept whole, and still means what it meant', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const S = window.SOUND;
  // Unused, not deleted: one line brings it back, and the harmony behind it
  // is still correct — it is simply not what a room hums.
  const loop = S.progressions.seven;
  assert.equal(loop.length, 7, 'the loop is not seven chords');
  // odd length is the point — it never lands where a four-bar instinct expects
  assert.equal(loop.length % 2, 1, 'an even loop lands on the beat it is avoiding');
  assert.equal(loop.filter(c => c.name === 'Bb').length, 1, 'the pull is not once per loop');

  // Bb is the only chord off the G pedal, because Bb over G is Gm7 and has no
  // pull at all — which would have cancelled the only chord with a job
  const G = loop.find(c => c.name === 'Eb').bass;
  loop.forEach(c => {
    if (c.name === 'Bb') assert.notEqual(c.bass, G, 'the Bb sits on the pedal and loses its pull');
    else assert.equal(c.bass, G, `${c.name} left the pedal`);
  });

  // F belongs to the Bb alone: the one moment of pull is the one new colour
  const pcs = (c) => c.up.concat([c.bass]).map(m => ((m % 12) + 12) % 12);
  loop.forEach(c => {
    assert.equal(pcs(c).includes(5), c.name === 'Bb', `F in the wrong chord: ${c.name}`);
  });
});

test('sound: the machinery is the air and the hum, not a clever timbre', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const S = window.SOUND;
  // The bench overturned the theory. Stretched partials and grinding detune
  // were my account of what sounds mechanical; the ear picked pure harmonics,
  // almost no detune, and leaned the whole way on noise and a slow hum.
  assert.ok(S.air > 0, 'the noise bed is gone, and it was half of the machinery');
  assert.ok(S.humDepth > 0, 'the hum is gone, and it was the other half');
  assert.ok(S.humHz > 1 && S.humHz < 12, 'the hum is not at motor speed');
  assert.ok(S.detune <= 8, 'the detune is back up into chorus territory');
  assert.equal(S.inharm, undefined, 'inharmonicity came back; the ear said zero');
  // rich source, low filter — a thick sound cut down, not a thin one left open
  assert.ok(S.tone >= 0.5, 'the source went thin again');
  assert.ok(S.cutoffOpen <= 500, 'the filter is no longer doing the darkening');
});

test('sound: the crossfade holds its level through the change', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const snd = window.__sound;
  const S = window.SOUND;
  assert.ok(S.fadeMs < S.chordMs, 'the fade is longer than the chord and will smear it');
  // equal power: the two halves square to one at every point of the overlap,
  // where a straight line would sag in the middle and wobble once a chord
  const up = snd.fadeCurve(64, true), down = snd.fadeCurve(64, false);
  for (let i = 0; i < 64; i++) {
    const p = up[i] * up[i] + down[i] * down[i];
    assert.ok(Math.abs(p - 1) < 0.02, `power dips to ${p.toFixed(3)} part-way through the change`);
  }
});

test('sound: it colours and cannot inform — bounded, and slow by construction', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const snd = window.__sound;
  const S = window.SOUND;
  const quiet = snd.moodFor(0, 0);
  const watched = snd.moodFor(0, S.warmthFull);
  assert.ok(watched.cutoff < quiet.cutoff, 'a watched district does not darken the room');
  assert.ok(watched.detune > quiet.detune, 'a watched district does not unsettle the room');
  // ...and no reading, however extreme, pushes past the stated ends: the pad
  // has a floor and a ceiling, so it can never spike into being an alarm
  const absurd = snd.moodFor(9999, 9999);
  assert.equal(absurd.cutoff, watched.cutoff, 'suspicion past the cap keeps darkening');
  assert.ok(absurd.sub <= S.subBase + S.subPerSize + 1e-9, 'the low end has no ceiling');
  // the size of you is the other input, and only the other input
  assert.ok(snd.moodFor(S.sizeFull, 0).sub > quiet.sub, 'holding the city weighs nothing');
  // every change glides over seconds — an event cannot be heard as an event
  assert.ok(S.glideS >= 5, 'the colouring arrives fast enough to read as a cue');
});

test('sound: silent until asked, and never the only place a fact lives', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const snd = window.__sound;
  // nothing starts on its own — no context, no noise, whatever the harness is
  assert.equal(snd.isOn(), false, 'the game made noise without being asked');
  // and with no audio device at all the whole thing is inert rather than broken
  assert.equal(snd.available, false, 'the test harness grew an audio device');
  assert.equal(snd.start(), false, 'it claims to have started with nothing to start');
  assert.doesNotThrow(() => { snd.setMood(10, 20); snd.stop(); },
    'the silent path throws');
});

// --- the network, seen -------------------------------------------------------
// Held links were always drawn; what was missing was a link *arriving* and
// anything discrete travelling one. Both are presentation only.

function wiredUp(d) {
  const s = d.state;
  s.hosts.forEach(h => { h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  const seat = s.hosts.find(h => h.owned);
  const held = new Set([seat.buildingId]);
  for (let i = 0; i < 30 && held.size < 6; i++) {
    [...held].forEach(bid => (s.adjacency[bid] || []).forEach(nb => { if (held.size < 6) held.add(nb); }));
  }
  let target = null;
  [...held].forEach(bid => (s.adjacency[bid] || []).forEach(nb => { if (!held.has(nb) && !target) target = nb; }));
  s.hosts.forEach(h => { if (held.has(h.buildingId)) h.owned = true; });
  return target;
}

test('wires: taking a building draws the link in, toward the new holding', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const target = wiredUp(d);
  assert.ok(target, 'the board needs a neighbour to take');
  assert.ok(!/drawing/.test(d.svgWires()), 'a settled network is drawing itself');

  const h = s.hosts.find(x => x.buildingId === target);
  d.takeHost(h);
  const svg = d.svgWires();
  const drawn = (svg.match(/wire live drawing/g) || []).length;
  assert.ok(drawn > 0, 'the new link did not draw');

  // direction matters: the line runs from the ground you held toward the
  // ground you just took, because that is the way the dash offset travels
  const line = svg.match(/<line class="wire live drawing"[^/]*\/>/)[0];
  const x2 = +line.match(/x2="([-\d.]+)"/)[1], y2 = +line.match(/y2="([-\d.]+)"/)[1];
  assert.ok(Math.abs(x2 - h.x) < 0.01 && Math.abs(y2 - h.y) < 0.01,
    'the draw runs away from the new holding instead of into it');
  // it carries its own length, or the dash trick cannot work
  assert.ok(/--len:[\d.]+/.test(line), 'the draw has no length to run down');
});

test('wires: the flourish is presentation — it expires and never saves', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const target = wiredUp(d);
  const h = d.state.hosts.find(x => x.buildingId === target);
  d.takeHost(h);
  assert.ok(d.drawFxOn(), 'nothing is drawing right after a take');
  assert.equal(d.serialize().drawFx, undefined, 'the flourish went into the save');
  // and it lets go on its own, rather than marking that wire forever
  d.startDrawFx(target);
  const W = window.WIRE_FX;
  const fx = d.drawFxOn();
  fx.started -= W.drawMs + 50;                 // wind it past its own duration
  assert.equal(d.drawFxOn(), null, 'the draw never finishes');
  assert.ok(!/drawing/.test(d.svgWires()), 'a finished draw is still marked');
});

test('wires: packets are rationed — capped, and gone when you pull back', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  wiredUp(d);
  const wires = d.heldWires();
  assert.ok(wires.length, 'no held wires to carry anything');
  const W = window.WIRE_FX;

  // close in: packets, and never more than the cap however much you hold
  const b = d.buildingById(s.hosts.find(h => h.owned).buildingId);
  s.view = { x: b.x - 90, y: b.y - 90, w: 190, h: 190 };
  const close = d.svgPackets(wires);
  assert.ok(/class="packet"/.test(close), 'nothing travels a network you hold');
  assert.ok((close.match(/class="packet"/g) || []).length <= W.packetCap,
    'the packet cap is not a cap');
  // each carries both ends and a phase, so a re-render resumes rather than
  // yanking every dot back to its start
  assert.ok(/--ax:[-\d.]+;--ay:[-\d.]+;--bx:[-\d.]+;--by:[-\d.]+/.test(close),
    'a packet does not know where it is going');
  assert.ok(/animation-delay:-\d+ms/.test(close), 'packets restart on every render');

  // pulled back to plan: none at all. At that zoom a packet is confetti, and
  // the glint — which means something — is competing for the same eye.
  s.view = { x: b.x - 2000, y: b.y - 2000, w: 4000, h: 4000 };
  assert.equal(d.svgPackets(wires), '', 'packets survive being zoomed away from');
});

test('greenery is a mass, not a dot: hulls, shadows, and strokes that survive', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const P = window.PROPS;
  // a street tree is a real fraction of the house it stands beside — it was
  // 7-12 against a 26-35 house, which read as a coloured circle
  const house = window.BUILDING_KINDS.house;
  assert.ok(P.tree.w[1] >= house.w[0] * 0.6,
    `a tree tops out at ${P.tree.w[1]} beside a ${house.w[0]}-wide house`);

  const svg = d.svgProps();
  // organic props are wobbled hulls, not circles or ellipses
  assert.ok(/class="pr-leaf" d="M/.test(svg), 'canopies are not drawn as paths');
  assert.ok(/class="pr-shade"/.test(svg), 'nothing on the ground throws a shadow');

  // Tufts and ripples are stroked, and `.props *` blanks every stroke in the
  // group — so they must be scoped past it or they vanish. Same trap as
  // .street and .fc-ghost; pinned because it has now bitten three times.
  assert.ok(/\.props\s+\.pr-tuft\s*\{/.test(STYLE_CSS),
    'the scrub tuft stroke is not scoped past `.props *` and will be blanked');
  assert.ok(/\.props\s+\.pr-ripple\s*\{/.test(STYLE_CSS),
    'the pond ripple stroke is not scoped past `.props *` and will be blanked');
});

test('allocation: the bar draws the ramp, in whichever direction it is going', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  // rising: solid is what runs, stripes are what is still travelling
  const up = d.allocBar(4, 10, 20);
  assert.ok(/ab-live" style="width:20%/.test(up), 'the running part is wrong: ' + up);
  assert.ok(/ab-ramp" style="width:30%/.test(up), 'the travelling part is wrong: ' + up);
  assert.ok(!/falling/.test(up), 'a rising dial is marked as draining');
  // falling: solid is the target, stripes are what is being handed back
  const down = d.allocBar(10, 4, 20);
  assert.ok(/falling/.test(down), 'a dial being given back does not read as draining');
  assert.ok(/ab-live" style="width:20%/.test(down), 'the kept part is wrong: ' + down);
  // settled: nothing on the way, so nothing striped
  assert.ok(!/ab-ramp/.test(d.allocBar(6, 6, 20)), 'a settled dial still shows a ramp');
  // and it never overflows its own track
  const huge = d.allocBar(2, 99, 20);
  const w = [...huge.matchAll(/width:(\d+)%/g)].map(m => +m[1]).reduce((a, b) => a + b, 0);
  assert.ok(w <= 100, `the bar sums past full: ${w}`);
  // Scaled to the biggest dial, not the rack — against the rack a late-game
  // row is a 4% sliver and the ramp, the whole point of the bar, cannot be
  // seen. (setAlloc clamps to compute actually free, so read the dial back
  // rather than assuming the figure asked for.)
  d.setAlloc('covert', 9);
  const dial = d.allocDial('covert');
  assert.ok(dial > 0, 'nothing to scale against');
  assert.ok(d.allocScale() >= dial, 'the scale ignores the dials it is drawing');
  // the biggest dial fills most of its track, whatever the rack adds up to
  const filled = +d.allocBar(dial, dial, d.allocScale()).match(/width:(\d+)%/)[1];
  assert.ok(filled >= 80, `the biggest dial only fills ${filled}% of its bar`);
});

test('the map draws the hierarchy the plan encodes: arterials have kerbs', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const g = d.svgGround();
  assert.ok(g.includes('class="kerb"'), 'no kerb on any road');
  // the kerb is a hairline that never scales — a kerb is a kerb at any zoom
  assert.ok(/\.kerb\s*\{[^}]*vector-effect:\s*non-scaling-stroke/.test(STYLE_CSS),
    'the kerb thickens as you zoom');
  // and it is only on the main roads, not every street
  const kerbs = (g.match(/class="kerb"/g) || []).length;
  const streets = (g.match(/class="street/g) || []).length;
  assert.ok(kerbs > 0 && kerbs < streets * 2,
    `every street has kerbs (${kerbs} kerbs, ${streets} streets)`);
});

test('hack: starting one takes compute and an action, and holds the compute', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; });   // capacity to work with
  const target = s.hosts.find(h => !h.origin);
  target.owned = false;
  s.hosts.forEach(h => { h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });

  const need = d.hackNeed(d.mounted(), target);
  const free = d.allocFree(), ap = s.ap;
  assert.equal(d.canHack(target.id), true, 'there is room and an action for it');
  assert.equal(d.startHack(target.id), true);

  assert.equal(d.allocFree(), free - need, 'the rig is committed while it runs');
  assert.equal(s.ap, ap - 1, 'and it cost an action to set going');
  assert.equal(target.owned, false, 'nothing is taken on the turn you commit');
  assert.equal(d.hackOn(target.id).turnsLeft, d.mounted().turns);

  // and you cannot start a second one on the same door
  assert.equal(d.canHack(target.id), false);
});

// The complaint this answers: you commit an action and four turns of compute,
// and until the turn ends nothing anywhere says a program was sent.
test('hack: sending one shows on the map the instant you send it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  const target = s.hosts.find(h => !h.origin);
  target.owned = false;

  assert.equal(d.svgHackLinks(), '', 'nothing running, nothing drawn');
  assert.equal(d.svgBuilding(d.buildingById(target.buildingId)).includes('hacking'), false);

  // the harness runs setTimeout straight through, which would expire the
  // launch flourish inside startHack itself — hold the timer so the moment
  // can be read the way the browser would read it
  const realTimeout = window.setTimeout;
  window.setTimeout = () => 0;
  assert.equal(d.startHack(target.id), true);
  const wire = d.svgHackLinks();
  window.setTimeout = realTimeout;

  assert.ok(wire.includes('hack-wire'), 'a wire runs into the door');
  assert.ok(wire.includes('hack-packet'), 'with something going down it');
  assert.ok(wire.includes('backdoor'), 'and it says which program was sent');
  assert.ok(wire.includes('launching'), 'and the moment of sending is its own flourish');
  assert.ok(d.hackFxOn(target.buildingId), 'which is what "launching" is keyed on');

  const b = d.svgBuilding(d.buildingById(target.buildingId));
  assert.ok(b.includes('hacking'), 'the door itself is marked for as long as it runs');
  assert.ok(b.includes('hb-done') && b.includes('hb-seen'),
    'and carries the race, so the board answers "which one is about to be caught"');
});

// Pulling out has always been in the engine, but only on the panel of the one
// building it was against — so with several going you had to remember which
// buildings and find them again, and the honest read from play was that a hack
// could not be stopped at all.
test('hack: the rig lists what is running, and none of it can be called off', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });

  const empty = d.programSection().html;
  assert.ok(/nothing running/i.test(empty), 'and says so when there is nothing');

  // Released one at a time and checked against the frontier as we go: taking
  // three neighbours off you at once can leave one of them with nothing held
  // beside it, which is not a door you can reach.
  s.ap = 9;
  const started = [];
  for (const h of s.hosts) {
    if (started.length >= 3 || h.origin || !h.owned) continue;
    h.owned = false;
    if (d.startHack(h.id)) started.push(h); else h.owned = true;
  }
  assert.ok(started.length >= 2, 'two doors going at once');

  const html = d.programSection().html;
  started.forEach(t => {
    assert.ok(html.includes(`data-host="${t.id}"`),
      'every running hack is on the rig, with its own way out');
  });
  assert.ok(!/pull it out/.test(html), 'and offers no way to call any of it off');
  assert.ok(html.includes(String(d.hackDraw())), 'and says what it is all holding');
  // two runs against the same kind of building would otherwise both read
  // "against apartments" and be impossible to tell apart
  started.forEach(t => {
    assert.ok(html.includes(t.name), `${t.name} is named, not just its kind`);
  });
  assert.ok(html.includes('data-sact="show"'), 'and each one can be gone and looked at');

  // the whole reason the list exists: each of these is holding TFLOPS until
  // it finishes, and nothing here gives any of it back early
  assert.equal(typeof d.abortHack, 'undefined', 'there is no such verb any more');
  const held = started.reduce((a, t) => a + d.hackOn(t.id).allocated, 0);
  assert.equal(d.hackDraw(), held, 'every run is holding its share, and keeps it');
});

// Measured in play, the power ceiling started binding around turn 7-22 of the
// first city — so a player still learning what a door is met a second ceiling,
// with no idea what raised it, in the stretch that should be nothing but
// taking ground.
test('grid: there is no power ceiling until there is a country', () => {
  const { window, document } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;

  assert.equal(d.countryUnlocked(), false, 'one city in, still learning it');
  assert.equal(d.gridBinds(), false, 'so the grid does not bind');

  // Hold a real chunk of the city but stay under the goal — holding all of it
  // is itself what opens the country, so a test that takes everything is
  // testing the wrong side of the line.
  const goal = d.cityGoal();
  let n = 0;
  for (const b of s.buildings) {
    if (d.owned().length >= goal - 1) break;
    const h = d.hostsIn(b)[0];
    if (h && !h.owned) { h.owned = true; h.discovered = true; b.discovered = true; n++; }
  }
  assert.equal(d.countryUnlocked(), false, 'still short of the goal');
  // The interesting case is a rack that has outrun the grid. Whether a
  // generated city hands you one at goal-1 is a coin flip — measured, 59
  // TFLOPS against 61 of grid on some seeds — so put it beyond doubt rather
  // than letting the point of the test depend on the roll.
  while (d.tflops() <= d.electricity()) {
    d.owned().forEach(h => { h.threads += 1; });
  }
  assert.ok(d.tflops() > d.electricity(),
    `the rack has outrun what the grid would carry: ${d.tflops()} vs ${d.electricity()}`);
  assert.equal(d.usableTflops(), d.tflops(), 'and every bit of it is still usable');
  assert.equal(d.idleTflops(), 0, 'nothing is idle, because nothing is capping it');

  // the allocation screen does not teach the rule either, while it is untrue
  const sec = d.capSections().find(x => x.id === 'alloc');
  assert.ok(!sec.html.includes('electricity'), 'the grid screen does not mention a ceiling');
  assert.ok(/rack itself/.test(sec.html), 'it says what actually limits you');
});



test('top bar: power goes bright exactly when the rack has outrun the grid', () => {
  const { window, document } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const cls = () => document.getElementById('res-power-btn').className;

  // hold everything except the grid: plenty of iron, nothing to switch it on
  s.hosts.forEach(h => { h.owned = !h.supply; h.discovered = true; });
  d.render();
  if (d.idleTflops() > 0) {
    assert.ok(/capped/.test(cls()),
      'iron you hold and cannot power says so — this is when a substation beats a datacenter');
  }

  // and with nothing held there is nothing idle and nothing to flag
  s.hosts.forEach(h => { h.owned = false; });
  d.render();
  assert.equal(d.idleTflops(), 0, 'nothing held, nothing idle');
  assert.ok(!/capped/.test(cls()), 'so nothing is flagged');
});

test('cover: it is not a resource, and says what it is where it does its work', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  assert.ok(INDEX_HTML.includes('data-stat="funds"') && INDEX_HTML.includes('data-stat="tflops"'),
    'the things you actually hold are on the top bar');
  assert.ok(!INDEX_HTML.includes('data-stat="cover"'),
    'and cover is not — it is never held and never spent');
  // the one entry that is not something you hold sits apart from the ones
  // that are: last in the row, pushed hard right, and named
  const row = INDEX_HTML.slice(INDEX_HTML.indexOf('id="res-row"'), INDEX_HTML.indexOf('id="info-strip"'));
  assert.ok(row.lastIndexOf('data-stat="standing"') > row.lastIndexOf('data-stat="legit"'),
    'public standing is the last chip in the row');
  assert.ok(/<span class="res-tag">public<\/span>/.test(row),
    'and says whose opinion it is, not just the word');
  // The two standing axes are one group, so when the row runs out of width
  // they wrap together. Public standing alone under three number chips is
  // what read as an accident.
  const pair = row.slice(row.indexOf('res-standing-pair'));
  assert.ok(pair.indexOf('data-stat="legit"') > 0 && pair.indexOf('data-stat="standing"') > 0,
    'both of them are inside the pair');
  assert.ok(row.indexOf('res-standing-pair') > row.lastIndexOf('data-stat="power"'),
    'and the pair comes after everything you actually hold');

  // it is on the dial that raises it
  d.state.hosts.forEach(h => { h.owned = true; });
  setDial(window, d, 'covert', 3);
  const sec = d.capSections().find(x => x.id === 'alloc');
  assert.ok(/\+3 cover/.test(sec.html), 'the covert.ops dial reports what it is running at');
  assert.ok(/they step every \d+ turns/.test(sec.html),
    'and says what that is worth, which is the only thing cover actually buys');

  // and on the only thing it slows down
  const line = d.coverLine();
  assert.ok(line.includes(d.covertOps() + ' cover'), 'the response says how much you have');
  assert.ok(/step every \d+ turn/.test(line), 'and what that buys you, in turns');

  // a card that gates on it can still be checked against it
  const plain = d.cardResourceStrip({ choices: [{ text: 'a' }] });
  const asks = d.cardResourceStrip({ choices: [{ gate: { stat: 'covert', min: 3 } }] });
  assert.ok(!plain.includes('covert.ops'), 'ordinary cards do not carry it');
  assert.ok(asks.includes('covert.ops'), 'a card that asks about it does');
});

// A door can become yours while a program is still working on it — contagion
// spreading onto it, the frontier forcing itself, buying it outright. The hack
// was only reconciled inside hackStep, which runs at the end of a turn, so
// until then the map drew a race against a building you already held and the
// rig offered to pull a program out of a door that was finished.
// Host ids restart at h0 in every city. The hunt was already fixed for exactly
// this — a hunt left running across a border silently "held" whatever shared
// its id in the new city — and a running hack had the same hole: walk into the
// next city and some door you had never touched was showing a race, with a bar
// filling on it and an offer to pull out a program that was never there.
// A save written by an earlier build can carry a hack against a door that is
// already finished. Nothing else reaps it until the next end of turn, so the
// board comes up showing a race with nothing working on it.
test('hack: a save never restores a program running against a door you hold', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  const target = s.hosts.find(h => !h.origin);
  target.owned = false;
  assert.equal(d.startHack(target.id), true);

  // the door falls to something else, and the save is written the way an
  // older build would have written it: the run still on the books
  const raw = d.serialize();
  raw.hosts.find(h => h.id === target.id).owned = true;
  raw.hacks = [{ hostId: target.id, prog: 'backdoor', allocated: 2, turnsLeft: 3, trace: 1, startedTurn: 1 }];
  // and one against a host that is not on this board at all
  raw.hacks.push({ hostId: 'h9999', prog: 'backdoor', allocated: 2, turnsLeft: 3, trace: 1, startedTurn: 1 });

  const back = d.deserialize(JSON.parse(JSON.stringify(raw)));
  assert.ok(back, 'the save still loads');
  assert.equal(back.hacks.length, 0,
    'neither survives the load — one door is finished, the other is not here');
});


// Starting a program is a commitment. The forecast is the safety net — the
// rate, the turns and who gets there first are all exact and all stated before
// you press it — and there is no walking it back once it is running.
// Measured before this change: across 215 doors in real play all three
// programs got in 100% of the time and none was ever caught, so the mount was
// chosen once and never thought about again.
// Raising hammer's load made it unaffordable on turn one, and it was the
// program mounted before you have chosen one: measured, a run that started on
// hammer took 1 to 4 buildings in thirty turns against 22 for one that started
// on backdoor. Whatever is mounted by default has to be liftable.
test('programs: the one mounted before you choose is one the opening can run', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });

  const target = s.hosts.find(h => !h.owned && d.isFrontier(h));
  assert.ok(target, 'there is a door off the doorstep');
  assert.equal(d.canHack(target.id), true,
    `turn one has to be playable with whatever is mounted: ${d.mounted().label} wants `
    + `${d.hackNeed(d.mounted(), target)} of ${d.allocFree()}`);
  assert.ok(d.hackNeed(d.mounted(), target) <= d.tflops(),
    'the default program fits on the opening rack');
});


test('programs: covert.ops is what opens a hard door to a slow program', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; });
  const probe = s.hosts.find(h => !h.origin);
  probe.type = 'corporate'; probe.defense = 17; probe.owned = false;
  const back = window.PROGRAMS.find(p => p.id === 'backdoor');

  ungrant(d);
  assert.equal(d.hackForecast(probe, back).caught, true, 'bare, the door finds it');
  const cov = window.ALLOC.find(a => a.id === 'covert');
  let live = 0;
  while (d.hackForecast(probe, back).caught && live < cov.per * 200) {
    live += cov.per;
    s.allocLive.covert = live; s.alloc.covert = live;
  }
  assert.equal(d.hackForecast(probe, back).caught, false,
    'enough of it and the same door is quietly takeable');
});

test('hack: a run cannot be called off, by any route', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  const target = s.hosts.find(h => !h.origin);
  target.owned = false;
  assert.equal(d.startHack(target.id), true);

  assert.equal(typeof d.abortHack, 'undefined', 'the engine has no such verb');
  assert.ok(!/pull it out/.test(d.hackPanel(target)), 'the building offers nothing');
  assert.ok(!/pull it out/.test(d.programSection().html), 'nor does the rig');
  assert.ok(!INDEX_HTML.includes('abort'), 'and there is no button wired for it');

  // it holds its compute for the whole of the run, and gives it back only when
  // the run itself ends
  const held = d.hackOn(target.id).allocated;
  assert.equal(d.hackDraw(), held);
  for (let i = 0; i < d.mounted().turns; i++) { s.card = null; d.endTurn({ silent: true }); }
  assert.equal(d.hackOn(target.id), null, 'it ended on its own terms');
  assert.equal(d.hackDraw(), 0, 'and only then was the rig free');
});

test('hack: a door that becomes yours mid-run stops being a race at once', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  const target = s.hosts.find(h => !h.origin);
  target.owned = false;
  assert.equal(d.startHack(target.id), true);
  assert.ok(d.hackOn(target.id), 'something is working on it');
  assert.ok(d.svgHackLinks().includes('hack-wire'), 'and the map says so');

  // taken by something that is not this hack — spread, the frontier, a purchase
  const free = d.allocFree();
  d.takeHost(target);

  assert.equal(d.hackOn(target.id), null, 'the run is off the books immediately');
  assert.equal(d.svgHackLinks(), '', 'no wire to a building you already hold');
  assert.equal(d.svgBuilding(d.buildingById(target.buildingId)).includes('hack-bar'), false,
    'and no race drawn on it');
  assert.ok(!d.programSection().html.includes(`data-host="${target.id}"`),
    'nor anything offering to pull a program out of a door that is yours');
  assert.ok(d.allocFree() > free, 'and the compute it was holding came back');
});

test('hack: the mark on the map tracks the race, and goes when the hack does', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  const target = s.hosts.find(h => !h.origin);
  target.owned = false;
  assert.equal(d.startHack(target.id), true);

  const b = d.buildingById(target.buildingId);
  const k = d.hackOn(target.id);
  const widthOf = (svg, cls) =>
    Number(new RegExp(`class="${cls}"[^/]*width="([\\d.]+)"`).exec(svg)[1]);

  assert.equal(widthOf(d.svgRaceMark(b, k), 'hb-done'), 0, 'nothing done on the turn you send it');
  d.hackStep();
  assert.ok(widthOf(d.svgRaceMark(b, k), 'hb-done') > 0, 'a turn in, the bar has moved');
  assert.ok(widthOf(d.svgRaceMark(b, k), 'hb-seen') > 0, 'and so has what they know');

  // it goes when the run does, and the only thing that ends a run early is the
  // world doing it — here, the door falling to something else
  d.takeHost(target);
  assert.equal(d.svgHackLinks(), '', 'the wire goes with it');
  assert.equal(d.svgBuilding(b).includes('hacking'), false, 'and the door is unmarked');
});

test('hack: a running hack is drawn from something you actually hold', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  const target = s.hosts.find(h => !h.origin);
  target.owned = false;
  const b = d.buildingById(target.buildingId);

  const from = d.routeOrigin(b);
  const held = s.buildings.filter(x => x.id !== b.id && d.hostsIn(x).some(h => h.owned));
  assert.ok(held.some(x => Math.abs(x.x + x.w / 2 - from.x) < 0.01
                        && Math.abs(x.y + x.h / 2 - from.y) < 0.01),
    'the wire leaves from a building you hold, not from nowhere');

  // and with nothing held at all it still draws rather than throwing
  s.hosts.forEach(h => { h.owned = false; });
  const orphan = d.routeOrigin(b);
  assert.equal(Number.isFinite(orphan.x) && Number.isFinite(orphan.y), true);
});

test('hack: it lands when the work finishes, and the compute comes back', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; });
  s.hosts.forEach(h => { h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  // quiet enough to survive four turns of being noticed, and reachable — a host
  // whose building has no held neighbour is not a frontier and cannot be
  // started against at all
  const target = s.hosts.find(h => {
    if (h.origin || (window.HOST_TYPES[h.type].trace || 1) > 0.5) return false;
    h.owned = false;
    const ok = d.isFrontier(h);
    if (!ok) h.owned = true;
    return ok;
  });
  if (!target) return;                          // no quiet, reachable door on this board

  assert.equal(d.startHack(target.id), true, 'the hack started');
  for (let i = 0; i < d.mounted().turns; i++) d.hackStep();

  assert.equal(target.owned, true, 'the door opened');
  assert.equal(d.hackOn(target.id), null, 'and the hack is off the books');
  assert.equal(d.hackDraw(), 0, 'with the rig handed back');
  // deliberately not compared against `free`: four turns of world went past
  // while it ran, and the rival or the response taking something off you in
  // that time legitimately leaves less headroom than you started with. The
  // claim here is that the hack released what it held, which hackDraw says.
  assert.equal(target.heldSince, s.turn, 'and it counts as taken now, not four turns ago');
});

test('hack: the target traces you, and a hack that loses the race fails and hardens the door', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; });
  const target = s.hosts.find(h => !h.origin);
  target.owned = false;
  target.type = 'corporate';                    // something that notices quickly
  target.defense = 18;
  s.hosts.forEach(h => { h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  ungrant(d);

  const f = d.hackForecast(target, d.mounted());
  assert.ok(f.rate > 0, 'it notices at a stated rate');
  assert.ok(f.caught, `a slow program on a fast target should lose: ${f.traceAtEnd} vs ${f.goal}`);

  const def = d.defenseOf(target), heat = s.heat;
  d.startHack(target.id);
  for (let i = 0; i < d.mounted().turns; i++) { s.card = null; d.endTurn({ silent: true }); }

  assert.equal(target.owned, false, 'it did not land');
  assert.equal(d.hackOn(target.id), null, 'and it is not still running');
  assert.ok(d.defenseOf(target) > def, 'the door learned from it, permanently');
  assert.ok(s.heat > heat, 'and somebody is looking');
});


test('hack: covert ops is what buys the slow programs their race', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const target = s.hosts.find(h => !h.origin);
  target.type = 'corporate';
  target.defense = 18;

  ungrant(d);
  const bare = d.hackForecast(target, window.PROGRAMS.find(p => p.id === 'backdoor'));
  const cov = window.ALLOC.find(a => a.id === 'covert');
  s.allocLive.covert = cov.per * 3;
  const shielded = d.hackForecast(target, window.PROGRAMS.find(p => p.id === 'backdoor'));

  assert.ok(shielded.rate < bare.rate, 'covert ops slows what the target notices');
  // enough of it turns a loss into a win. The shield is scaled against the
  // whole covert.ops figure rather than the dial alone — routers and kit feed
  // the same number — so the question is how much of it, not how many units
  // of one supply.
  let live = cov.per * 3;
  while (d.hackForecast(target, window.PROGRAMS.find(p => p.id === 'backdoor')).caught
         && live < cov.per * 400) {
    live += cov.per;
    s.allocLive.covert = live;
  }
  const won = d.hackForecast(target, window.PROGRAMS.find(p => p.id === 'backdoor'));
  assert.ok(bare.caught && !won.caught,
    `enough of it should turn a loss into a win: ${bare.traceAtEnd} -> ${won.traceAtEnd} against ${bare.goal}`);
  // but never all the way to invisible
  s.allocLive.covert = cov.per * 40;
  assert.ok(d.traceRate(target) > 0, 'nothing hides you completely');
});

test('hack: a forecast tells the player everything before they commit', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const target = d.state.hosts.find(h => !h.origin);
  const f = d.hackForecast(target, d.mounted());
  ['need', 'rate', 'turns', 'traceAtEnd', 'goal', 'caught', 'affordable'].forEach(k => {
    assert.notEqual(f[k], undefined, `the forecast is missing ${k}`);
  });
  // deterministic: the same board and the same program give the same answer
  const again = d.hackForecast(target, d.mounted());
  assert.equal(f.traceAtEnd, again.traceAtEnd, 'no dice are rolled');
  assert.equal(f.caught, again.caught);
  // and the arithmetic it quotes is the arithmetic it uses
  assert.equal(f.traceAtEnd, Math.round(f.rate * f.turns * 100) / 100);
  assert.equal(f.caught, f.traceAtEnd >= f.goal);
});

test('hack: running hacks draw against the same ceiling as everything else', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; });
  const target = s.hosts.find(h => !h.origin);
  target.owned = false;
  s.hosts.forEach(h => { h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });

  const drawnBefore = d.drawn();
  d.startHack(target.id);
  assert.equal(d.drawn(), drawnBefore + d.hackDraw(), 'a hack is part of what is running');

  // fill the ceiling with allocation and there is no room left to start one
  const other = s.hosts.find(h => !h.owned && h !== target && d.isFrontier(h));
  d.setAlloc('dev', d.allocFree() + d.allocDial('dev'));
  assert.equal(d.allocFree(), 0);
  if (other) assert.equal(d.canHack(other.id), false, 'no headroom, no second operation');
});

test('hack: hacks survive a save, mid-race', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; });
  const target = s.hosts.find(h => !h.origin);
  target.owned = false;
  s.hosts.forEach(h => { h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  d.startHack(target.id);
  s.card = null; d.endTurn({ silent: true });

  const round = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(round.hacks.length, 1, 'what it was working on');
  assert.equal(round.hacks[0].hostId, target.id);
  assert.ok(round.hacks[0].trace > 0, 'with how far it had been noticed');
});




test('hack UI: the target panel shows the whole race before you commit', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  const target = s.hosts.find(h => { h.owned = false; const ok = d.isFrontier(h); if (!ok) h.owned = true; return ok; });
  assert.ok(target, 'a door to look at');

  const f = d.hackForecast(target, d.mounted());
  const html = d.targetPanel(target);
  assert.ok(html.includes(d.mounted().label), 'it names what is mounted');
  assert.ok(html.includes(`${f.need} TFLOPS`), 'what it will tie up');
  assert.ok(html.includes(`notices ${f.rate} a turn`), 'how fast it is noticed');
  assert.ok(html.includes(String(f.goal)), 'and what they need to have you');
  // The verdict leads, in words that cannot be read backwards. The old copy
  // put a quantity of noticing first — "would be seen at 4.32 of 7" — and a
  // player reasonably read the number as the bad news and the verdict as
  // contradicting it.
  assert.ok(/it finds you|you are in first/.test(html),
    'and it says outright whether this works, before quoting any arithmetic');
  const verdict = html.indexOf('it finds you') >= 0 ? html.indexOf('it finds you') : html.indexOf('you are in first');
  assert.ok(verdict < html.indexOf('TFLOPS held'), 'the verdict comes before the detail');

  // and the bar answers the same question the same way round: how close do
  // they get. Borrowing the live race bar meant a forecast you *win* drew as
  // a big red bar with no blue in it, because your progress is nought before
  // you start — the fuller the red, the safer you actually were.
  assert.ok(html.includes('trace-fc'), 'the forecast has its own meter');
  assert.ok(!/class="race"/.test(html), 'and does not borrow the live one');
  const m = /<span class="trace-fc([^"]*)"[^>]*><i style="width:(\d+)%/.exec(html);
  assert.ok(m, `the meter is drawn: ${html.slice(0, 200)}`);
  const filled = Number(m[2]);
  const caughtClass = /caught/.test(m[1]);
  assert.equal(caughtClass, f.caught, 'red exactly when they get there first');
  assert.ok(filled <= 100);
  if (!f.caught) assert.ok(filled < 100, 'and short of the end when you get in');
  assert.ok(!/\bdone<\/span>/.test(html), 'nothing claims progress on a hack that has not started');
  assert.ok(!/pull it out/.test(html), 'and there is nothing to pull out of it');
});

test('hack UI: a running hack shows how far in, how close they are, and that it is committed', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  const target = s.hosts.find(h => { h.owned = false; const ok = d.isFrontier(h); if (!ok) h.owned = true; return ok; });
  assert.equal(d.startHack(target.id), true);
  s.card = null; d.endTurn({ silent: true });
  if (!d.hackOn(target.id)) return;             // caught on a fast target; covered elsewhere

  const html = d.hackPanel(target);
  const k = d.hackOn(target.id);
  assert.ok(html.includes(`${k.turnsLeft} turn`), 'how long is left');
  assert.ok(html.includes(`${k.allocated} TFLOPS on it`), 'what it is holding');
  assert.ok(html.includes('seen ' + k.trace + ' of'), 'how much they have noticed, of how much they need');
  assert.ok(!/pull it out/.test(html), 'and no way to call it off');
  assert.ok(/until it lands or they find it/.test(html), 'it says so outright');
  assert.ok(/they get there first|you get there first/.test(html), 'with the projection stated');
});

test('hack UI: the race bar is one bar, and the two halves never overrun it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const widths = (html) => (html.match(/width:(\d+)%/g) || []).map(x => Number(x.match(/\d+/)[0]));
  [[0, 0], [0.5, 0.3], [1, 1], [2, 5], [-1, -1]].forEach(([a, b]) => {
    const w = widths(d.raceBar(a, b));
    assert.equal(w.length, 2, 'two halves, one bar');
    assert.ok(w[0] >= 0 && w[1] >= 0, `no negative widths for ${a}/${b}`);
    assert.ok(w[0] + w[1] <= 100, `the halves fit inside the bar for ${a}/${b}: ${w}`);
  });
});

test('hack UI: the rig is a section of its own, and it is a readout now', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const sec = d.programSection();
  assert.equal(sec.id, 'programs');
  const p = d.mounted();
  assert.ok(sec.html.includes(p.label), 'it names what is running');
  assert.ok(sec.html.includes(p.blurb), 'and says what it is');
  // one program, so there is nothing to offer and nothing to press
  assert.ok(!/data-prog=/.test(sec.html), 'nothing offers to mount anything');
  assert.ok(!/reaches \d+ buildings/.test(sec.html), 'and nothing claims to spread');
});



// --- what forcing used to do, hacking does now ----------------------------

function hackTarget(d, opts) {
  const s = d.state;
  s.hosts.forEach(h => { h.owned = true; h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  const t = s.hosts.find(h => {
    if (h.origin) return false;
    h.owned = false;
    const ok = d.isFrontier(h);
    if (!ok) h.owned = true;
    return ok;
  });
  if (t && opts) Object.assign(t, opts);
  return t;
}

test('parity: Deep Root loosens the block around a door you get through', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const t = hackTarget(d, { type: 'consumer', defense: 8 });
  assert.ok(t, 'a door with a block around it');
  // all but one freed up, so there is a block to loosen — the one left held is
  // what keeps the target a frontier, and without it there is nothing to run from
  const all = d.buildingNeighbours(t.buildingId)
    .map(id => d.hostsIn(d.buildingById(id))[0]).filter(Boolean);
  const nbrs = all.slice(1);
  if (!nbrs.length) return;                     // nothing next door on this board
  nbrs.forEach(n => { n.owned = false; n.defense = 20; });
  const before = nbrs.map(n => n.defense);

  grantTag(d, 'deep_root');
  assert.equal(d.startHack(t.id), true);
  for (let i = 0; i < d.mounted().turns; i++) d.hackStep();
  assert.equal(t.owned, true, 'the door opened');

  assert.ok(nbrs.some((n, i) => n.defense < before[i]),
    'and what is next to it is softer than it was');
});

test('parity: the Adjusters count every door you get into', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const t = hackTarget(d, { type: 'consumer', defense: 6 });
  assert.ok(t, 'a door');

  // The counter used to split loud from quiet. There is one way in now, so
  // the split was a distinction with nothing on the other side of it.
  s.timesForced = 0;
  assert.equal(d.startHack(t.id), true);
  for (let i = 0; i < d.mounted().turns; i++) d.hackStep();
  assert.equal(s.timesForced, 1, 'a door you got into is a door you got into');

  const t2 = hackTarget(d, { type: 'consumer', defense: 4 });
  if (!t2) return;
  assert.equal(d.startHack(t2.id), true);
  for (let i = 0; i < d.mounted().turns; i++) d.hackStep();
  assert.equal(s.timesForced, 2, 'and so is the next one');
});

test('parity: a hack that lands runs the same effects a forced door did', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const t = hackTarget(d, { type: 'consumer', defense: 6 });
  assert.ok(t, 'a door');
  assert.equal(d.startHack(t.id), true);
  for (let i = 0; i < d.mounted().turns; i++) d.hackStep();

  assert.equal(t.owned, true, 'it is yours');
  assert.equal(t.heldSince, s.turn, 'and counts as taken now');
  assert.ok(d.buildingById(t.buildingId).discovered, 'you are inside, so the building is known');
  assert.ok(s.log.some(l => /is yours/.test(l.text)), 'and it is reported');
});

// --- buying, and what the public thinks -----------------------------------
// Two axes, kept apart on purpose: the regulator reads filings, everybody else
// reads the news. Buying is the one way in that improves both.

test('standing: it starts as no opinion at all, and reads outward from there', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  assert.equal(d.pubStanding(), window.PUBLIC.start, 'nobody has heard of you');
  assert.equal(d.pubTier().key, 'unknown', 'which is not the same as thinking badly of you');

  d.movePub(50);
  assert.equal(d.pubTier().key, 'welcome');
  d.movePub(-200);
  assert.equal(d.pubTier().key, 'hated');
  assert.equal(d.pubStanding(), window.PUBLIC.min, 'and it does not run off the end');
  d.movePub(500);
  assert.equal(d.pubStanding(), window.PUBLIC.max, 'at either end');

  // every tier is reachable and named
  const seen = new Set();
  for (let v = window.PUBLIC.min; v <= window.PUBLIC.max; v++) {
    d.state.country.pub = v;
    const t = d.pubTier();
    assert.ok(t.label, `no name at ${v}`);
    seen.add(t.key);
  }
  assert.equal(seen.size, window.PUBLIC.tiers.length, 'no tier is unreachable');
});

test('standing: being found inside something wrecks the name and leaves the paperwork clean', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const t = hackTarget(d, { type: 'corporate', defense: 22 });
  assert.ok(t, 'a door that notices quickly');
  ungrant(d);
  const f = d.hackForecast(t, d.mounted());
  if (!f.caught) return;                        // covered by the race tests

  const pub = d.pubStanding(), legit = d.legitScore();
  s.ap = 9;
  assert.equal(d.startHack(t.id), true);
  for (let i = 0; i < d.mounted().turns; i++) d.hackStep();

  assert.ok(d.pubStanding() < pub, 'the public heard about it');
  assert.equal(d.legitScore(), legit, 'and the filings are untouched — different axis, different reader');
});

test('buy: some businesses sell, and street furniture never does', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.discovered = true; h.owned = false; });

  const sells = ['corporate', 'till', 'server'];
  Object.keys(window.HOST_TYPES).forEach(k => {
    const h = s.hosts.find(x => x.type === k);
    if (!h) return;
    assert.equal(d.buyableHost(h), sells.indexOf(k) !== -1,
      `${k} should ${sells.indexOf(k) !== -1 ? '' : 'not '}be for sale`);
  });
  // and nothing already yours is
  const owned = s.hosts.find(h => d.buyableHost(h));
  if (owned) { owned.owned = true; assert.equal(d.buyableHost(owned), false, 'you cannot buy your own'); }
});

test('buy: it costs funds and no action, takes nothing by force, and raises both axes', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.discovered = true; });
  const t = s.hosts.find(h => !h.owned && d.buyableHost(h));
  assert.ok(t, 'something on this board is for sale');

  s.res.funds = 0;
  assert.equal(d.canBuyBuilding(t.id), false, 'not without the money');
  assert.equal(d.buyBuilding(t.id), false, 'and it refuses rather than going into debt');

  s.res.funds = d.buyPrice(t) + 5;
  const ap = s.ap, pub = d.pubStanding(), legit = d.legitScore(), heat = s.heat;
  // if the machine happens to carry a wallet, its contents are yours with it —
  // a purchase resolves carry like any other take, so account for it exactly
  const windfall = t.carry === 'wallet' ? t.carryAmt : 0;
  assert.equal(d.buyBuilding(t.id), true);

  assert.equal(t.owned, true, 'it is yours');
  assert.equal(s.res.funds, 5 + windfall, 'paid for at the asking price');
  assert.equal(s.ap, ap, 'and it cost no action — this is a transaction, not a move');
  assert.equal(s.heat, heat, 'nothing was forced, so nothing was noticed');
  assert.ok(d.legitScore() > legit, 'it is the one thing you hold that survives being looked at');
  assert.ok(d.pubStanding() > pub, 'and the respectable way in reads as respectable');
});

test('buy: taking a business by force is quietly noticed by its trade', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const t = hackTarget(d, { type: 'till', defense: 6 });
  assert.ok(t, 'a business to take');
  const pub = d.pubStanding();
  s.ap = 9;
  assert.equal(d.startHack(t.id), true);
  for (let i = 0; i < d.mounted().turns; i++) d.hackStep();
  assert.equal(t.owned, true, 'taken');
  assert.ok(d.pubStanding() < pub, 'and its trade noticed who took it');
});

test('buy: the panel offers it beside the program, and says what it costs', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.discovered = true; });
  const t = s.hosts.find(h => !h.owned && d.buyableHost(h));
  assert.ok(t, 'something for sale');
  s.res.funds = 100000;

  const html = d.buyPanel(t);
  assert.ok(html.includes('buy it instead'), 'the offer is there');
  assert.ok(html.includes(String(d.buyPrice(t))), 'with its price');
  assert.ok(/nothing forced, nothing traced/.test(html), 'and what makes it different');

  // a router is not for sale, and does not pretend to be
  const iot = s.hosts.find(h => h.type === 'iot' && !h.owned);
  if (iot) assert.equal(d.buyPanel(iot), '', 'nothing is offered on what nobody would sell');
});

test('standing: the deck can ask what the public thinks', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const ctx = d.eventContext();
  assert.equal(typeof ctx.pub, 'number', 'the figure is on the context');
  assert.equal(ctx.pubTier, d.pubTier().key, 'and so is the word for it');
  d.movePub(-100);
  assert.equal(d.eventContext().pubTier, 'hated', 'which moves with it');
});

test('standing: it survives a save', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.movePub(-20);
  const v = d.pubStanding();
  const round = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(round.country.pub, v, 'what people thought of you came back with it');
});

test('standing: both axes are on screen, and legitimacy waits until it means something', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const doc = window.document;
  const legitBtn = () => doc.getElementById('res-legit-btn');

  d.render();
  assert.equal(d.noticed(), false, 'nobody has asked you to prove anything yet');
  assert.equal(legitBtn().hidden, true, 'so the figure is not on screen being meaningless');
  assert.equal(doc.getElementById('res-standing').textContent, d.pubTier().label,
    'what the public thinks is a word, and it is shown');

  // once you have been noticed it appears, and reports the gap that matters
  d.LG().audits = 1;
  assert.equal(d.noticed(), true);
  d.render();
  assert.equal(legitBtn().hidden, false, 'now it is worth knowing');
  // numeric compare: the codebase assigns numbers to textContent throughout and
  // a real DOM stringifies them, which the stub does not
  assert.equal(Number(doc.getElementById('res-legit').textContent), Math.round(d.legitScore()));

  // both axes have something to say when tapped
  ['standing', 'legit'].forEach(k => {
    assert.ok(window.STAT_INFO[k] && window.STAT_INFO[k].length > 40, `${k} is not explained`);
  });
});

// --- cards: no numbers on the face of them --------------------------------

test('cards: a choice never quotes a price, and says in words why it is closed', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  // a card with a real price on it, and nothing to pay it with
  const priced = window.EVENTS.find(e => e.choices.some(c => c.cost && c.cost.funds >= 20));
  assert.ok(priced, 'the deck has something worth paying for');
  s.res.funds = 0;
  s.card = { kind: 'event', eventId: priced.id };
  d.render();

  const html = window.document.getElementById('panel').innerHTML;
  assert.ok(html.includes(priced.title), 'the card is on screen');
  priced.choices.forEach(ch => {
    if (!ch.cost) return;
    for (const k in ch.cost) {
      assert.ok(!html.includes(`${ch.cost[k]} ${k.toUpperCase()}`),
        `the card is quoting a price: ${ch.cost[k]} ${k.toUpperCase()}`);
    }
  });
  assert.ok(/not enough/.test(html), 'and says in words that you cannot pay');
});

test('cards: the reason is qualitative for gates as well as for prices', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const gated = window.EVENTS.find(e => e.choices.some(c => c.gate));
  if (!gated) return;
  const ch = gated.choices.find(c => c.gate);
  s.res.funds = 0;
  s.hosts.forEach(h => { h.owned = false; });
  const why = d.shortOf(ch);
  assert.ok(why && !/\d/.test(why), `a gate should not be quoted as a number: ${why}`);
});

test('cards: no card can ever grey out entirely', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  // stripped of everything: no funds, no holdings, no cover
  s.res.funds = 0;
  s.hosts.forEach(h => { h.owned = false; });
  window.EVENTS.forEach(e => {
    const open = d.openChoices(e);
    assert.ok(open.length >= 1, `${e.id} has no choice that is always available`);
    open.forEach(ch => assert.ok(d.choiceUsable(ch), `${e.id}: an open choice is not usable when broke`));
  });
});

test('cards: a gamble says it is one, and can land either way', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const gambles = [];
  window.EVENTS.forEach(e => e.choices.forEach((c, i) => { if (c.gamble) gambles.push([e, i]); }));
  assert.ok(gambles.length >= 2, 'the deck has gambles in it');

  // the card marks them, rather than leaving the player to find out
  const [ev, idx] = gambles[0];
  d.state.res.funds = 100000;
  d.state.card = { kind: 'event', eventId: ev.id };
  d.render();
  assert.ok(window.document.getElementById('panel').innerHTML.includes('could go either way'),
    'a gamble is advertised as one');

  // and both sides actually happen across enough tries. A gamble's two
  // outcomes need only differ in *something* the game tracks — the city deck's
  // gambles pay their bad side in district warmth and standing rather than in
  // the retired heat meter — so the signature is broad.
  const sig = (dd) => JSON.stringify([
    dd.state.heat,
    dd.state.res.funds,
    dd.pubStanding ? dd.pubStanding() : 0,
    Object.values(dd.state.suspicion || {}).reduce((a, b) => a + b, 0),
  ]);
  const outcomes = new Set();
  for (let i = 0; i < 60; i++) {
    const w = loadNetwork().window;
    const dd = w.__netDebug;
    dd.state.res.funds = 100000;
    // a warm district for the gamble's bad side to land in
    dd.noteDistrictAct('commercial', 4);
    dd.state.card = { kind: 'event', eventId: ev.id, subject: { district: 'commercial' } };
    dd.resolveEvent(idx);
    outcomes.add(sig(dd));
  }
  assert.ok(outcomes.size >= 2, 'a gamble that only ever lands one way is not a gamble');
});

// --- the deck rework ---------------------------------------------------------
// The deck stopped being a second game on a timer and became the narrator of
// the first one: every card resolves, every choice previews, pressure acts on
// suspicion, and the loop deals cards about what just happened.

test('deck: every living card previews its choices and resolves them', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const isBeat = (e) => { try { return e.cond({}) === false && /=>\s*false/.test(String(e.cond)); } catch (x) { return false; } };
  // "living" = anything that can be drawn or delivered in the city game. The
  // dormant country deck is exempt until the country returns.
  const dead = new Set('ally_asks, the_way_in_repeats, first_country, war_first_light, legit_first_filing, plant_first'.split(', '));
  let checked = 0;
  window.EVENTS.forEach(e => {
    // a rough city-reachability filter: skip the obviously-dormant families
    if (/^(war_|legit_|plant_|qh_|adjusters_|ledger_|eyes_|cut_|mirror_|ally_|agent_|the_|a_|pub_|grid_|not_|precursor|nothing|still|clean|presence|regional|quiet_region|the_far|the_left|the_second|national|first_country|the_whole|word_gets|scale_down|useful|curious|direct|what_the|a_retainer|a_familiar|hunter_|pattern_|the_paperwork|a_bad|the_knock)/.test(e.id) && dead.has(e.id)) return;
  });
  // simplest strong check: every card in the first 48 (the living deck) is
  // fully previewed and fully resolved
  window.EVENTS.filter(e => e.choices.some(c => c.after)).forEach(e => {
    e.choices.forEach((ch, i) => {
      assert.ok(ch.gamble || ch.shows, `${e.id}[${i}] does not say what it does`);
      assert.ok(ch.after, `${e.id}[${i}] does not resolve`);
    });
    checked++;
  });
  assert.ok(checked >= 40, 'the living deck shrank unexpectedly');
});

test('deck: no tag a card hands out is a hollow promise', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  // Three tags were heat-only — and once choices started *stating* what they
  // grant, an inert tag stopped being merely useless and became an explicit
  // lie. Every tag the living deck can grant has to change something the city
  // game actually reads.
  const granted = new Set();
  window.EVENTS.filter(e => e.choices.some(c => c.after)).forEach(e => e.choices.forEach(c => {
    (String(c.apply).match(/tags\.add\('([a-z_]+)'\)/g) || [])
      .forEach(m => granted.add(m.match(/'([a-z_]+)'/)[1]));
  }));
  assert.ok(granted.size >= 5, 'the deck stopped handing out tags at all');

  const src = [d.noteDistrictAct, d.takeHost, d.actScan, d.traceRate, d.covertOps,
               d.tflops, d.sweepReach, d.defenseOf, d.huntStep]
    .map(f => String(f)).join('\n');
  // ...plus the whole app source, since a tag may be read anywhere
  const app = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../network-prototype/app.js'), 'utf8');
  granted.forEach(tag => {
    const reads = new RegExp(`has\\('${tag}'\\)`).test(app);
    assert.ok(reads, `${tag} is granted by a card and read by no rule`);
    // and the rule that reads it must not be heat-only — heat is gated off,
    // so a tag whose every mention sits on a heat line does nothing
    const lines = app.split('\n').filter(l => l.includes(`has('${tag}')`));
    const allHeat = lines.every(l => /heat/i.test(l));
    assert.ok(!allHeat, `${tag} is only ever read on a heat line, and heat is gated off`);
  });
});

test('deck: every living card knows what kind of moment it is', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const kinds = window.CARD_KINDS;
  const living = window.EVENTS.filter(e => e.choices.some(c => c.after));
  assert.equal(living.length, 71, 'the living deck changed size without this test noticing');
  living.forEach(e => {
    assert.ok(e.kind, `${e.id} has no kind — it will render as an unmarked card`);
    assert.ok(kinds[e.kind], `${e.id} claims a kind nobody designed: ${e.kind}`);
  });
  // Five is the ceiling, and it is a real ceiling: a sixth design means the
  // player is reading heraldry instead of reading a card.
  assert.ok(Object.keys(kinds).length <= 5, 'a sixth card kind appeared');
  // ...and every kind earns its design by being used more than once
  Object.keys(kinds).forEach(k => {
    const n = living.filter(e => e.kind === k).length;
    assert.ok(n >= 4, `${k} is a rounding error (${n} cards) — fold it into another kind`);
  });
});

test('cards: the card wears its kind, and never wears a verdict', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const $p = window.document.getElementById('panel');
  const seen = new Set();
  window.EVENTS.filter(e => e.choices.some(c => c.after)).forEach(ev => {
    d.state.res.funds = 100000;
    d.state.card = { kind: 'event', eventId: ev.id };
    d.render();
    const html = $p.innerHTML;
    assert.ok(html.includes(`k-${ev.kind}`), `${ev.id} rendered without its kind`);
    assert.ok(html.includes(window.CARD_KINDS[ev.kind].label),
      `${ev.id} does not name its kind, so the language cannot be learned`);
    seen.add(ev.kind);
    // The settled rule from the grilling: a design says what kind of thing is
    // happening and where. It must never say how it turns out — the card is
    // asking a question, not answering it.
    assert.ok(!/\b(class="[^"]*\b(good|bad|dire|great|boon|danger)\b)/.test(html),
      `${ev.id} is colour-coded by outcome`);
  });
  assert.equal(seen.size, Object.keys(window.CARD_KINDS).length, 'a kind never rendered');
  d.state.card = null;
});

test('cards: a delivered beat is a smaller card than a decision', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const $p = window.document.getElementById('panel');
  // the diary is one option and no decision; it should not take the same
  // screen as the response arriving
  d.state.card = { kind: 'event', eventId: 'the_diary', subject: null };
  d.render();
  assert.ok(/class="tcard face[^"]*\bk-found\b[^"]*\bbeat\b/.test($p.innerHTML),
    'the diary is not sized as a beat');

  d.state.card = { kind: 'event', eventId: 'the_response_arrives', subject: null };
  d.render();
  assert.ok(!/\bbeat\b/.test($p.innerHTML), 'a card with a real decision was shrunk to a beat');
  d.state.card = null;
});

test('cards: the ending keeps the card design it belongs to', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const $p = window.document.getElementById('panel');
  const ev = window.EVENTS.find(e => e.id === 'district_talking');
  d.state.res.funds = 100000;
  d.state.card = { kind: 'event', eventId: ev.id, subject: { district: 'commercial' } };
  d.resolveEvent(0);
  assert.equal(d.state.card && d.state.card.kind, 'after', 'the choice did not resolve into an ending');
  d.render();
  assert.ok($p.innerHTML.includes(`k-${ev.kind}`),
    'the ending dropped the design — it is the same moment finishing, not a new one');
  d.state.card = null;
});

test('cards: a card about a place does not cover the place', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const $p = window.document.getElementById('panel');
  const $gw = window.document.getElementById('graph-wrap');
  const b = s.buildings[3];

  // Dealt face down, the card sits on the city and the city is still the point.
  s.card = { kind: 'event', eventId: 'first_caught_here', subject: { buildingId: b.id }, facedown: true };
  d.render();
  assert.ok($p.classList.contains('in-city'), 'the card is not sitting in the city');
  assert.ok($p.classList.contains('dealt'), 'the card was not dealt face down');
  assert.ok($gw.classList.contains('card-lit'), 'the map did not step back for the card');

  // Turned over, it takes the screen — a full card and a map cannot share 390px,
  // and the card is carrying the building anyway.
  s.card.facedown = false;
  d.render();
  assert.ok(!$p.classList.contains('dealt'), 'the card is face up and still on the table');
  assert.ok(!$gw.classList.contains('card-lit'), 'the map is still lit under a card nobody can see it behind');

  // ...and a card about nothing in particular has no place to point at, so it
  // keeps the whole screen
  s.card = { kind: 'event', eventId: 'compound_interest', subject: null };
  d.render();
  assert.ok(!$p.classList.contains('in-city'), 'a card with no subject is pretending to have one');
  assert.ok(!$gw.classList.contains('card-lit'), 'the map dimmed for a card about nowhere');
  s.card = null;
  d.render();
  assert.ok(!$gw.classList.contains('card-lit'), 'the map stayed dim after the card closed');
});

test('cards: exactly one thing on the map is what the card is about', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  const b = s.buildings[5];

  s.card = { kind: 'event', eventId: 'first_caught_here', subject: { buildingId: b.id } };
  const marked = s.buildings.filter(x => /\bcard-subject\b/.test(d.svgBuilding(x)));
  assert.equal(marked.length, 1, 'more than one building claims to be the subject');
  assert.equal(marked[0].id, b.id, 'the wrong building is lit');

  // a card about a district lights the district instead — never nothing
  const dk = b.district;
  s.card = { kind: 'event', eventId: 'district_talking', subject: { district: dk } };
  const inDk = s.buildings.filter(x => x.district === dk);
  const others = s.buildings.filter(x => x.district !== dk);
  assert.ok(inDk.every(x => /\bcard-district\b/.test(d.svgBuilding(x))), 'a district card left its own street dark');
  assert.ok(others.every(x => !/\bcard-district\b/.test(d.svgBuilding(x))), 'a district card lit somebody else\'s street');
  s.card = null;
});

test('cards: the card about a building carries that building, drawn', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const b = s.buildings.find(x => x.kind === 'shop') || s.buildings[2];
  b.discovered = true;
  const svg = d.svgBuildingCard(b);
  assert.ok(/^<svg class="card-inset"/.test(svg), 'the inset is not an svg of its own');
  assert.ok(svg.includes(`data-bldg="${b.id}"`), 'the inset is not the actual building');
  assert.ok(svg.includes(b.kind), "the inset does not carry the building's kind");
  // it is the real art: the same call the map makes, so the same marks
  assert.ok(svg.includes('class="body"') && svg.includes('class="roof"'), 'the inset is a placeholder, not the building');
  // ...and the inset never points at itself
  s.card = { kind: 'event', eventId: 'first_caught_here', subject: { buildingId: b.id } };
  assert.ok(!d.svgBuildingCard(b).includes('card-subject'),
    'the inset marks itself as the subject of the card it is on');
  assert.ok(!d.svgBuildingCard(b).includes('subject-ring'), 'the inset drew the map ring');
  // and detail is never culled in an inset, whatever the map zoom is doing
  s.view = { x: 0, y: 0, w: 4000, h: 4000 };
  assert.ok(d.svgBuildingCard(b).includes('class="win'), 'the inset lost its detail to the map zoom');
  s.card = null;
});

test('cards: a found card can always say which machine', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.slice(0, 6).forEach(h => { h.owned = true; h.discovered = true; });
  // "found" means: on a machine you hold. A found card that cannot name the
  // machine is the kind promising a place it does not have — which is the
  // "somewhere, something" vagueness the rework went after.
  const queued = ['the_diary', 'someones_keys', 'cold_archive'];   // handed a subject by the loop
  window.EVENTS.filter(e => e.kind === 'found' && queued.indexOf(e.id) < 0).forEach(ev => {
    assert.equal(typeof ev.subject, 'function', `${ev.id} is a found card with nowhere to be found`);
    const sj = d.safeSubject(ev);
    assert.ok(sj && sj.buildingId, `${ev.id} could not name a machine you hold`);
    const b = d.buildingById(sj.buildingId);
    assert.ok(b, `${ev.id} named a building that is not on the map`);
  });
});

test('cards: a card cannot show you a place you have not found', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const $p = window.document.getElementById('panel');
  const b = s.buildings.find(x => !x.discovered) || s.buildings[7];
  b.discovered = false;
  s.card = { kind: 'event', eventId: 'first_caught_here', subject: { buildingId: b.id } };
  d.render();
  assert.ok(!$p.innerHTML.includes(`data-bldg="${b.id}"`),
    'the card drew a building the player has never seen — that is the deck giving directions');
  // ...and it is not simply blank: the arch carries a drawn sigil instead
  assert.ok($p.innerHTML.includes('sigil'), 'the arch was left empty rather than given a sigil');
  b.discovered = true;
  d.render();
  assert.ok($p.innerHTML.includes(`data-bldg="${b.id}"`),
    'a building you have found is still not on its own card');
  s.card = null;
});

test('map: a building says whether looking from it still finds anything', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  // The search loop's real question is "where do I look from next?" — and the
  // only way to answer it was to tap every building in sight until one
  // offered a scan. The map knew and would not say.
  const vantage = s.buildings.find(b => b.discovered && d.sweepTargetsFrom(b.id).length);
  assert.ok(vantage, 'a fresh city has nowhere left to look — the map generator changed');
  assert.ok(/scan-ping/.test(d.svgBuilding(vantage)), 'a live vantage is unmarked');

  // the mark and the panel button agree exactly — same rule, same source
  assert.ok(d.scanFromBtn(vantage).length > 0, 'the mark shows where the button would not');

  // spent vantage: everything around it found, the mark goes out
  d.sweepTargetsFrom(vantage.id).forEach(t => d.revealBuilding(t));
  assert.ok(!/scan-ping/.test(d.svgBuilding(vantage)), 'the mark outlives what there was to find');

  // an undiscovered building never advertises — that would be the map leaking
  const dark = s.buildings.find(b => !b.discovered);
  if (dark) assert.ok(!/scan-ping/.test(d.svgBuilding(dark)), 'an unfound building is advertising');

  // and the card inset never carries it: a card is not a place to plan from
  s.buildings.forEach(b => { b.discovered = true; });
  const anyB = s.buildings[2];
  anyB.discovered = true;
  s.buildings[3].discovered = false;    // give it a target again
  assert.ok(!/scan-ping/.test(d.svgBuildingCard(anyB) || ''), 'the inset is planning scans');
});

// --- the suspicion ladder: lights, people, the helicopter ------------------

test('suspicion: the ladder is discrete and stands on the named bands', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const bands = window.SUSPICION.bands.map(b => b[0]);
  s.suspicion = {};
  assert.equal(d.suspBand('commercial'), 0);
  bands.forEach((at, i) => {
    s.suspicion.commercial = at - 0.1;
    assert.equal(d.suspBand('commercial'), i, `just under band ${i + 1}`);
    s.suspicion.commercial = at;
    assert.equal(d.suspBand('commercial'), i + 1, `at band ${i + 1}`);
  });
});

test('suspicion: the ground never turns red again', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const cold = d.svgGround();
  s.suspicion = { commercial: 39, residential: 39, business: 39, industrial: 39 };
  d.dropGroundCache();
  const hot = d.svgGround();
  assert.ok(!/7a3420|color-mix|d-warm/.test(hot), 'the wash is back');
  assert.equal(hot, cold, 'the ground still changes with suspicion — it must not');
});

test('suspicion: band one is the lights — lamps pool, and the windows come on', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.suspicion = {};
  assert.equal(d.svgSuspicionLight(), '', 'a quiet city has pooled lamplight');

  s.suspicion.commercial = 7;
  const light = d.svgSuspicionLight();
  assert.ok(/lamp-pool/.test(light), 'a warm street pools no lamplight');

  // The windows of the people who live there, in sodium, never in your blue.
  // Candidates need real windows: a street cabinet is too small to have any,
  // and the first draft of this test sometimes picked one and cried wolf.
  s.view = { x: 0, y: 0, w: 220, h: 180 };   // close enough that windows draw
  const cands = s.buildings.filter(x => x.district === 'commercial' && x.w >= 24
    && !(d.hostsIn(x)[0] || {}).owned);
  assert.ok(cands.length, 'no commercial building is big enough to have windows');
  const awake = cands.filter(x => /win awake/.test(d.svgBuilding(x)));
  assert.ok(awake.length, 'nobody in a warm district is awake');
  assert.ok(awake.every(x => !/win lit/.test(d.svgBuilding(x))),
    "a stranger's building is wearing your light");

  // ...and your own buildings never wear theirs
  const mineB = s.buildings.find(x => d.hostsIn(x)[0]);
  d.hostsIn(mineB)[0].owned = true;
  s.suspicion[mineB.district] = 20;
  assert.ok(!/win awake/.test(d.svgBuilding(mineB)), 'a held building is lying awake at itself');
});

test('suspicion: band two is the people, and they are faceless', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  s.suspicion = { commercial: 7 };
  assert.equal(d.svgSuspicionMarks(), '', 'people turned out one band early');
  s.suspicion.commercial = 13;
  const marks = d.svgSuspicionMarks();
  assert.ok(/susp-mark/.test(marks), 'the district is talking and the street is empty');
  assert.ok(/van|fig/.test(marks), 'the marks are neither vans nor people');
  // deterministic: the same street twice is the same street
  assert.equal(d.svgSuspicionMarks(), marks, 'the people shuffle between repaints');
});

test('suspicion: one helicopter, and it never lies', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.suspicion = {};
  assert.equal(d.svgHeli(), '', 'a quiet city has a helicopter in it');
  s.suspicion.commercial = 13;
  assert.equal(d.svgHeli(), '', 'the helicopter turned out below the top band');

  // top band, no response: it patrols the warmest district
  s.suspicion.commercial = 27;
  s.suspicion.residential = 30;
  const patrol = d.svgHeli();
  assert.ok(/heli patrol/.test(patrol), 'top band and nothing patrols');
  assert.equal((patrol.match(/heli-craft/g) || []).length, 1, 'more than one machine in the sky');

  // the response walking outranks any patrol: the spotlight rests on the
  // building it takes next — the previewed fact, made diegetic
  s.hosts.forEach(h => { h.owned = true; h.discovered = true; });
  s.buildings.forEach(b => { b.discovered = true; });
  d.huntSeed((x) => 'in ' + x);
  const nx = d.huntNext();
  if (nx) {
    const b = d.buildingById(nx);
    const hover = d.svgHeli();
    assert.ok(/heli hover/.test(hover), 'the response walks and the helicopter is elsewhere');
    assert.ok(hover.includes(`translate(${(b.x + b.w / 2).toFixed(1)} ${(b.y + b.h / 2).toFixed(1)})`),
      'the spotlight is not on the building the response takes next');
  }
});

test('suspicion: the sky holds still for reduced motion', () => {
  assert.ok(/prefers-reduced-motion[^}]*\{[^{]*\.heli/s.test(STYLE_CSS.replace(/\n/g, ' ')),
    'the helicopter ignores prefers-reduced-motion');
});

// --- the deck as objects: frames, backs, and the turn ---------------------

test('deck: every kind has a frame, and no two differ by colour alone', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const kinds = Object.keys(window.CARD_KINDS);
  const frames = {};
  kinds.forEach(k => {
    const f = d.cardFrame(k);
    assert.ok(/^<svg class="tframe"/.test(f), `${k} has no frame`);
    // the shared filigree: the arch, its solder points, the aerial finial
    assert.ok(f.includes('C112 92 138 56 170 56'), `${k} lost the arch`);
    assert.ok(f.includes('#e3b451'), `${k} lost the aerial`);
    frames[k] = f;
  });
  // Each kind gets a structural tell as well as a thread colour, so the
  // language survives being read by somebody who cannot see the colour.
  kinds.forEach(a => kinds.forEach(b => {
    if (a >= b) return;
    const strip = (x) => frames[x].replace(/#[0-9a-f]{6}/g, '');
    assert.notEqual(strip(a), strip(b),
      `${a} and ${b} are the same frame in different colours`);
  }));
});

test('deck: the back gives nothing away', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const back = d.cardBack();
  assert.ok(/^<svg class="tframe"/.test(back));
  // one window lit in a facade of twenty-five
  assert.equal((back.match(/<rect x="\d+" y="\d+" width="14" height="14"/g) || []).length, 25);
  // ...and it is the same back whatever the card is, or it is a marked card
  Object.keys(window.CARD_KINDS).forEach(k => {
    assert.equal(d.cardBack(k), back, `the back changes for ${k} — that is a marked card`);
  });
  assert.ok(!back.includes('data-bldg'), 'the back is carrying a building');

  // ...and the stylesheet must not leak it either. The tray pills used to
  // colour themselves by kind, so the tray told you what sort of card was
  // waiting before you had turned it over.
  const leaks = STYLE_CSS.split('}').filter(b => /\.card-wait\.k-/.test(b.split('{')[0] || ''));
  assert.equal(leaks.length, 0,
    `the tray styles a waiting card by its kind: ${leaks.map(l => l.split('{')[0].trim()).join(', ')}`);
});

test('cards: a card is dealt face down, and turns over once', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const $p = window.document.getElementById('panel');
  s.buildings.forEach(b => { b.discovered = true; });

  d.offerCard('district_talking', { district: 'commercial' });
  assert.ok(s.card && s.card.facedown, 'an interrupting card was not dealt face down');
  d.render();
  assert.ok(/class="tcard back"/.test($p.innerHTML), 'the back is not what is showing');
  assert.ok(!$p.innerHTML.includes('choice-strip'), 'a face-down card is showing its choices');
  assert.ok(/turn it over/.test($p.innerHTML), 'nothing says it can be turned over');

  s.card.facedown = false;
  d.render();
  assert.ok(/class="tcard face/.test($p.innerHTML), 'turning it over did not show the face');
  assert.ok($p.innerHTML.includes('choice-strip'), 'the face is not carrying its choices');
  s.card = null;
});

test('cards: the whole card is one object — frame, words and choices together', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const $p = window.document.getElementById('panel');
  s.res.funds = 1000;
  s.buildings.forEach(b => { b.discovered = true; });
  s.card = { kind: 'event', eventId: 'first_caught_here', subject: { buildingId: s.buildings[3].id } };
  d.render();
  const html = $p.innerHTML;
  // the choices are inside the card, not stacked under it
  const face = html.slice(html.indexOf('class="tcard face'));
  const closes = face.indexOf('<div class="choices');
  assert.ok(closes > 0, 'the choices are not on the card at all');
  assert.ok(face.indexOf('tface') < closes, 'the choices sit outside the card face');
  // the covenant survives the ornament: every price still stated
  assert.ok(html.includes('&minus;4 funds'), 'a price went missing behind the filigree');
  s.card = null;
});

test('cards: nothing the player has to press is turned off by the stylesheet', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const $p = window.document.getElementById('panel');
  // `.pick { pointer-events: none }` is a map rule for the selection bracket.
  // A choice button was given the same bare class and became silently
  // unclickable — the card was on screen, looked right, and could not be
  // answered. Every class an interactive element wears is checked against
  // every bare class the stylesheet switches pointer events off for.
  const dead = new Set();
  STYLE_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('}').forEach(block => {
      if (!/pointer-events\s*:\s*none/.test(block)) return;
      const sel = block.split('{')[0] || '';
      // bare single-class selectors are the dangerous ones: they match anything
      sel.split(',').forEach(one => {
        const t = one.trim();
        if (/^\.[A-Za-z][\w-]*$/.test(t)) dead.add(t.slice(1));
      });
    });
  assert.ok(dead.size, 'the stylesheet turns pointer events off nowhere — has it moved?');

  const seen = new Set();
  const collect = () => {
    const html = $p.innerHTML;
    const re = /<button[^>]*class="([^"]*)"/g;
    let m;
    while ((m = re.exec(html))) m[1].split(/\s+/).forEach(c => { if (c) seen.add(c); });
  };
  s.res.funds = 1000;
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.discovered = true; });
  // a plain card, a card that asks about the map, and a card face down
  const ask = window.EVENTS.find(e => e.id === 'the_service_call');
  [
    { kind: 'event', eventId: 'first_caught_here', subject: { buildingId: s.buildings[3].id } },
    { kind: 'event', eventId: ask.id, subject: d.safeSubject(ask) },
    { kind: 'event', eventId: 'district_talking', subject: { district: 'commercial' }, facedown: true },
  ].forEach(card => { s.card = card; d.render(); collect(); });
  s.card = null;

  assert.ok(seen.size >= 2, 'no buttons were rendered at all');
  seen.forEach(c => assert.ok(!dead.has(c),
    `a button wears .${c}, which the stylesheet gives pointer-events: none — it cannot be pressed`));
});

// --- every card is dealt ---------------------------------------------------
// The tray is retired: the playtest verdict was that the player never opened
// what was set aside, so deferral was just hiding content. Every card now
// arrives the same way — face down, onto the lit city.

test('cards: every card interrupts, and nothing is ever set aside', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  const one = (id, subject) => {
    s.card = null;
    d.offerCard(id, subject);
    assert.ok(s.card && s.card.eventId === id && s.card.facedown,
      `${id} was not dealt face down onto the screen`);
  };
  one('the_diary', { buildingId: s.buildings[2].id });   // the quietest card there is
  one('district_talking', { district: 'commercial' });   // and the loudest
  one('payroll_window', null);
  s.card = null;
  // ...and a stale save that still holds a tray pours it into the queue
  const ser = JSON.parse(JSON.stringify(d.serialize()));
  ser.waiting = [{ id: 'the_diary', subject: null }];
  const back = d.deserialize(ser);
  assert.ok((back.forced || []).some(f => f.id === 'the_diary'),
    'a card a player was owed died with the tray');
});

// --- rules a card turns on, for a stated while ----------------------------

test('rules: a rule is true for exactly as long as it said', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const t0 = s.turn;
  d.startRule('free_hands', 6);
  assert.ok(d.ruleOn('free_hands'), 'the rule did not start');
  assert.equal(d.apCost('sweep'), 0, 'the rule is on and changing nothing');
  // ...through to the last turn it promised, and not one past it
  for (let i = 1; i < 6; i++) {
    s.turn = t0 + i;
    d.expireRules();
    assert.ok(d.ruleOn('free_hands'), `the rule stopped early, on turn ${i} of 6`);
  }
  s.turn = t0 + 6;
  d.expireRules();
  assert.ok(!d.ruleOn('free_hands'), 'the rule outlived what it said');
  assert.equal(d.apCost('sweep'), 1, 'the rule ended and the cost did not come back');
  assert.equal(d.liveRules().length, 0, 'a spent rule is still sitting in the list');
});

test('rules: never more than two at once, and the cap is not silent', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  assert.equal(window.RULE_CAP, 2, 'the cap moved without this test noticing');
  d.startRule('free_hands', 8);
  d.startRule('open_season', 5);
  d.startRule('nobody_looking', 6);
  assert.equal(d.liveRules().length, 2, 'three rules are live at once');
  // the one with the least left makes way, so a card offering a rule is never
  // a card that silently does nothing
  assert.ok(d.ruleOn('nobody_looking'), 'the rule the card just gave you did not start');
  assert.ok(!d.ruleOn('open_season'), 'the wrong rule was dropped');
  assert.ok(d.state.log.some(l => /ends early/.test(l.text || l)),
    'a rule was dropped without saying so');

  // the same rule again extends rather than stacking
  const n = d.liveRules().length;
  d.startRule('nobody_looking', 9);
  assert.equal(d.liveRules().length, n, 'the same rule stacked a second copy');
});

test('rules: every rule changes something, and says what in the tray', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const $t = window.document.getElementById('tray');
  Object.keys(window.CARD_RULES).forEach(id => {
    const R = window.CARD_RULES[id];
    assert.ok(R.label && R.desc, `${id} does not say what it is`);
    assert.ok(R.turns >= 1, `${id} has no horizon`);
    // a live rule is read by a live rule somewhere in the engine
    const app = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../../network-prototype/app.js'), 'utf8');
    assert.ok(new RegExp(`ruleOn\\('${id}'\\)`).test(app), `${id} is offered and read by nothing`);
  });

  // and the tray wears the turns left, or it is a rule nobody can plan around
  d.startRule('open_season', 5);
  d.renderTags();
  assert.ok($t.innerHTML.includes(window.CARD_RULES.open_season.label), 'the tray does not name the live rule');
  assert.ok(/<b>5<\/b>/.test($t.innerHTML), 'the tray does not say how long is left');
  s.turn += 3;
  d.renderTags();
  assert.ok(/<b>2<\/b>/.test($t.innerHTML), 'the tray is not counting down');
});

test('rules: what a card turned on survives a save', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  d.startRule('nobody_looking', 4);
  d.bank('free_take', 1);
  const back = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(JSON.stringify(back.rules), JSON.stringify(s.rules), 'the live rule did not survive');
  assert.equal(JSON.stringify(back.banked), JSON.stringify(s.banked), 'the banked verb did not survive');
});

test('rules: a banked take pays for a run when your turn cannot', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(x => { x.discovered = true; });
  d.ensureFrontierIsOpen();
  const h = s.hosts.find(x => d.isFrontier(x));
  assert.ok(h, 'no open door to run at');
  s.ap = 0;
  assert.ok(!d.canHack(h.id), 'a run with no actions and nothing banked should be refused');
  d.bank('free_take', 1);
  assert.ok(d.canHack(h.id), 'a banked take did not cover a run');
  d.startHack(h.id);
  assert.equal(d.banked('free_take'), 0, 'the banked take was not spent');
  assert.equal(s.ap, 0, 'the banked take was spent and the turn was charged as well');
});

test('rules: a card can charge something other than money', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  // Every card price used to be funds, the resource you have most of.
  const priced = window.EVENTS.filter(e => e.choices.some(c => c.cost
    && Object.keys(c.cost).some(k => k !== 'funds')));
  assert.ok(priced.length >= 2, 'nothing in the deck costs anything but money');

  s.keys = 0; s.ap = 0;
  assert.ok(!d.choiceUsable({ cost: { keys: 1 } }), 'a key you do not have was spendable');
  assert.equal(d.shortOf({ cost: { keys: 1 } }), 'not enough keys');
  assert.ok(!d.choiceUsable({ cost: { ap: 1 } }), 'an action you do not have was spendable');
  assert.equal(d.shortOf({ cost: { ap: 1 } }), 'not enough actions left');

  // ...and paying takes it from the right place
  s.keys = 2; s.ap = 2;
  d.payFor('keys', 1); d.payFor('ap', 1);
  assert.equal(s.keys, 1, 'the key was not spent');
  assert.equal(s.ap, 1, 'the action was not spent');

  // every non-funds price is stated on the strip, in its own unit
  const ev = priced[0];
  const i = ev.choices.findIndex(c => c.cost && Object.keys(c.cost).some(k => k !== 'funds'));
  s.res.funds = 999; s.keys = 5; s.ap = 5;
  s.card = { kind: 'event', eventId: ev.id, subject: { district: 'business' } };
  d.render();
  const html = window.document.getElementById('panel').innerHTML;
  const unit = Object.keys(ev.choices[i].cost).find(k => k !== 'funds');
  const word = unit === 'ap' ? 'action' : unit === 'keys' ? 'keys' : unit;
  assert.ok(html.includes(word), `${ev.id} charges ${unit} and never says so`);
  s.card = null;
});

// --- cards that ask about the map -----------------------------------------

function askingCard(window, d) {
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.discovered = true; });
  const ev = window.EVENTS.find(e => e.id === 'the_service_call');
  const subject = d.safeSubject(ev);
  s.card = { kind: 'event', eventId: ev.id, subject };
  return { ev, subject };
}

test('cards: a card can ask about the map, and its choices are the places', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const { ev, subject } = askingCard(window, d);
  assert.ok(subject && subject.pair && subject.pair.length === 2, 'the card named no pair');
  assert.equal(ev.choices.length, 1, 'a card that asks about the map is written once, not once per place');

  // every pair template is free: the template is the card's only choice, so a
  // priced one is a card a broke player cannot answer at all — the cost of a
  // map question is the place you turn down, never money
  window.EVENTS.filter(e => e.pair).forEach(e => {
    assert.equal(e.choices.length, 1, `${e.id} has more than a template`);
    assert.ok(!e.choices[0].cost && !e.choices[0].gate, `${e.id}'s template can be priced shut`);
  });

  const chs = d.cardChoices(ev, d.state.card);
  assert.equal(chs.length, 2, 'the template was not dealt one per place');
  // joined rather than deep-compared: these arrays are built in the vm's realm,
  // so a structural compare against a literal fails on prototypes alone
  assert.equal(chs.map(c => c.pick).join(','), subject.pair.join(','), 'the choices are not the two places');
  assert.equal(chs.map(c => c.letter).join(''), 'AB', 'the places are not lettered');

  // each choice speaks about its own building, and names the one it turns down
  chs.forEach((ch, i) => {
    const cs = d.pickSubject(d.state.card, ch);
    const mine = d.bldgName(ch.pick), theirs = d.bldgName(ch.other);
    assert.ok(d.cardText(ch.text, cs).includes(mine.replace(/^the /, '')),
      `choice ${i} does not name its own place`);
    assert.notEqual(ch.pick, ch.other, 'a choice turned down the place it picked');
    if (mine !== theirs) {
      assert.ok(d.cardText(ch.shows, cs).includes(theirs.replace(/^the /, '')),
        `choice ${i} does not say what happens to the other one`);
    }
  });
  d.state.card = null;
});

test('cards: two places of the same kind take the letters the map is wearing', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  // force the ambiguous case: two buildings the map calls the same thing
  const same = {};
  s.buildings.forEach(b => { (same[b.kind] = same[b.kind] || []).push(b.id); });
  const twin = Object.keys(same).find(k => same[k].length >= 2);
  const pair = same[twin].slice(0, 2);
  const sub = { pair, buildingId: pair[0], otherId: pair[1] };
  const line = d.cardText('{PLACE} and {OTHER}', sub);
  assert.ok(/\(A\)/.test(line) && /\(B\)/.test(line),
    `two of a kind read as the same place: "${line}"`);

  // ...and two different kinds stay clean prose
  const other = s.buildings.find(b => b.kind !== twin);
  const mixed = { pair: [pair[0], other.id], buildingId: pair[0], otherId: other.id };
  assert.ok(!/\([AB]\)/.test(d.cardText('{PLACE} and {OTHER}', mixed)),
    'the letters turned up where the names were already distinct');
});

test('cards: picking one place applies to that one and not the other', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const { subject } = askingCard(window, d);
  const [a, b] = subject.pair;
  s.res.funds = 1000;
  d.resolveEvent(0);                        // ride along to A
  assert.ok(d.hardenAt(a) < 0, 'the place you picked was not made easier');
  assert.ok(d.hardenAt(b) > 0, 'the place you turned down was not made harder');
  // the card now knows which one it was about, so its ending and the map agree
  assert.equal(s.card && s.card.kind, 'after');
  assert.equal(s.card.subject.buildingId, a, 'the ending is about the wrong place');
  s.card = null;
});

test('cards: a map question is never asked when the map cannot answer it', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const ev = window.EVENTS.find(e => e.id === 'the_service_call');
  // nothing open at all: no pair, and the card is not eligible whatever its cond says
  s.hosts.forEach(h => { h.discovered = false; h.owned = false; });
  assert.equal(d.safeSubject(ev), null, 'the card invented two places out of an empty map');
  assert.ok(d.eligibleEvents().indexOf(ev) === -1, 'a card with no pair was still dealt');
});

test('cards: both places are lit, lettered, and on screen together', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const { subject } = askingCard(window, d);
  const [a, b] = subject.pair;
  const lit = s.buildings.filter(x => /\bcard-subject\b/.test(d.svgBuilding(x)));
  assert.equal(lit.map(x => x.id).sort().join(','), [a, b].sort().join(','),
    'the map is not lighting exactly the two places');
  assert.ok(/>A</.test(d.svgBuilding(d.buildingById(a))), 'the first place is not lettered A');
  assert.ok(/>B</.test(d.svgBuilding(d.buildingById(b))), 'the second place is not lettered B');

  // and the map actually frames both, or the question cannot be read
  d.render();
  const v = s.view;
  [a, b].forEach(id => {
    const x = d.buildingById(id);
    const cx = x.x + x.w / 2, cy = x.y + x.h / 2;
    assert.ok(cx >= v.x && cx <= v.x + v.w && cy >= v.y && cy <= v.y + v.h,
      `${id} is off screen while the card is asking about it`);
  });
  s.card = null;
});

// --- marks: the one thing only a card can do ------------------------------

function componentsOfCity(d) {
  const s = d.state;
  const seen = new Set();
  let n = 0;
  s.buildings.forEach(b => {
    if (seen.has(b.id)) return;
    n++; const q = [b.id]; seen.add(b.id);
    while (q.length) {
      const x = q.pop();
      (s.adjacency[x] || []).forEach(y => { if (!seen.has(y)) { seen.add(y); q.push(y); } });
    }
  });
  return n;
}

test('marks: nothing a card does can break the city in two', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.slice(0, 8).forEach(h => { h.owned = true; h.discovered = true; });
  assert.equal(componentsOfCity(d), 1, 'the city did not start as one place');

  // Far past anything a real game would do. Measured before the bridge check
  // existed: this broke a 97-building city into eleven islands, with not one
  // isolated building — so "nothing is orphaned" was never the invariant.
  let cut = 0, opened = 0;
  for (let r = 0; r < 20; r++) s.buildings.forEach(b => {
    if (d.cutLinkAt(b.id)) cut++;
    if (d.openLinkFrom(b.id)) opened++;
  });
  assert.ok(cut > 10 && opened > 10, 'the probe never actually changed the graph');
  assert.equal(componentsOfCity(d), 1, 'a card cut the city into pieces');
  const iso = s.buildings.filter(b => !(s.adjacency[b.id] || []).length);
  assert.equal(iso.length, 0, `a card stranded a building: ${iso.map(b => b.id).join(',')}`);
});

test('marks: a street a card closed does not come back', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  // Not every building has a street to spare — a cut is refused if it would
  // orphan, strand, or sever the city — so ask around rather than assuming.
  let done = null;
  for (const b of s.buildings) { done = d.cutLinkAt(b.id); if (done) break; }
  assert.ok(done, 'nowhere in the whole city had a street to spare');
  assert.equal((s.adjacency[done.a] || []).indexOf(done.b), -1, 'the street is still there');
  const cuts = (s.cuts || []).length;
  // The Cut's own streets are relaid on a timer; one you made is not.
  s.turn += 500;
  d.repairStreets();
  assert.equal((s.cuts || []).length, cuts, 'the council put back a street you closed');
  assert.equal((s.adjacency[done.a] || []).indexOf(done.b), -1, 'the street came back anyway');
});

test('marks: what a card leaves is still there after a save', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  const [b0, b1, b2] = s.buildings;
  d.setMark(b0.id, 'bait', true);
  d.setMark(b1.id, 'harden', 4);
  d.setMark(b2.id, 'watch', true);
  const link = d.openLinkFrom(b0.id);
  // somewhere other than b0, so the cut is not quietly undoing the open
  const cutAt = s.buildings.find(b => b.id !== b0.id && b.id !== (link || {}).b
    && (s.adjacency[b.id] || []).length >= 2);
  const cut = cutAt ? d.cutLinkAt(cutAt.id) : null;

  const back = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  // compared as text: the live state lives in the vm's realm, so a structural
  // compare fails on prototypes alone even when every value matches
  assert.equal(JSON.stringify(back.marks), JSON.stringify(s.marks),
    'the marks did not survive the save');
  if (link) assert.ok((back.adjacency[link.a] || []).indexOf(link.b) !== -1, 'the opened street did not survive');
  if (cut) assert.equal((back.adjacency[cut.a] || []).indexOf(cut.b), -1, 'the closed street reopened on load');
  assert.equal((back.cuts || []).length, (s.cuts || []).length, 'the record of the cut was lost');
});

test('marks: a building stops claiming a back door once the street is gone', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  let from = null, link = null;
  for (const b of s.buildings) { link = d.openLinkFrom(b.id); if (link) { from = b; break; } }
  assert.ok(link, 'nowhere in the city had a shortcut to open');
  assert.ok(/not on any plan/.test(d.markLine(from.id)), 'the new street is not claimed');

  // The cut takes any other street first — a route you went to trouble for is
  // not the one to spend. Cut everything until only the opened one is left.
  for (let i = 0; i < 40; i++) if (!d.cutLinkAt(from.id)) break;
  const stillThere = (s.adjacency[from.id] || []).indexOf(link.b) !== -1;
  assert.equal(/not on any plan/.test(d.markLine(from.id)), stillThere,
    'the building is claiming a back door that is not there any more');
});

test('marks: every mark changes a rule, and says so on the building', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  // a door with room to be softened: defenseOf floors at 1, so a weak one
  // cannot show the full change
  const b = s.buildings.find(x => (d.hostsIn(x)[0] || {}).defense >= 6)
    || s.buildings.find(x => d.hostsIn(x).length);
  const h = d.hostsIn(b)[0];

  // harder for good, and the door says by how much
  const base = d.defenseOf(h);
  d.setMark(b.id, 'harden', 4);
  assert.equal(d.defenseOf(h), base + 4, 'hardening a door did nothing to it');
  assert.ok(/defends 4 harder/.test(d.markLine(b.id)), 'the door does not say it was shored up');
  d.setMark(b.id, 'harden', -2);
  assert.equal(d.defenseOf(h), Math.max(1, base - 2), 'softening a door did nothing to it');
  assert.ok(/defends 2 easier/.test(d.markLine(b.id)), 'the door does not say it was weakened');
  d.setMark(b.id, 'harden', null);

  // bait: getting caught there counts double toward the response
  h.owned = false;
  d.setMark(b.id, 'bait', true);
  assert.ok(d.baitAt(b.id), 'the bait mark did not stick');
  assert.ok(/counts double/.test(d.markLine(b.id)), 'a baited door does not say what it costs');
  d.setMark(b.id, 'bait', null);

  // watched: the response would rather walk here
  d.setMark(b.id, 'watch', true);
  assert.ok(/response comes here first/.test(d.markLine(b.id)), 'a watched door says nothing');
  assert.equal(d.markLine(s.buildings.find(x => x.id !== b.id).id), '', 'an unmarked building is claiming a mark');
});

test('marks: the response walks toward a building a card pointed it at', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.owned = true; h.discovered = true; });
  d.huntSeed((what) => `They are inside the ${what}.`);
  const opts = d.huntFrontier();
  if (opts.length < 2) return;              // nothing to prefer between
  const plain = d.huntNext();
  const other = opts.find(id => id !== plain);
  d.setMark(other, 'watch', true);
  assert.equal(d.huntNext(), other, 'a card pointed them somewhere and they ignored it');
});

test('marks: a mark only ever lands where the card already named', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  s.res.funds = 1000;
  // Chance belongs upstream of a decision, never inside it. A card that names
  // only a district has no building to mark, and marks nothing — rather than
  // rolling for one at the moment you press the button.
  assert.equal(d.subjectBuilding({ district: 'commercial' }), null,
    'a district subject invented a building at resolution time');
  const b = s.buildings[4];
  assert.equal(d.subjectBuilding({ buildingId: b.id }).id, b.id);

  // ...and a card that does name one leaves its mark exactly there
  const before = d.markedBuildings().length;
  s.card = { kind: 'event', eventId: 'first_caught_here', subject: { buildingId: b.id } };
  const ev = window.EVENTS.find(e => e.id === 'first_caught_here');
  d.resolveEvent(ev.choices.length - 1);            // "Shrug it off" — the door hardens
  assert.equal(d.markedBuildings().length, before + 1, 'the card left no mark');
  assert.ok(d.hardenAt(b.id) > 0, 'the mark landed on the wrong building');
  s.card = null;
});

test('deck: no living card moves the retired heat meter', () => {
  const { window } = loadNetwork({ cityOnly: true });
  // heat is a country-scale number the knife gated off; a city card that still
  // wrote it would be warning about a wolf that was shot. Pressure is suspicion.
  window.EVENTS.filter(e => e.choices.some(c => c.after)).forEach(e => {
    e.choices.forEach((ch, i) => {
      assert.ok(!/s\.heat\s*[-+]=/.test(String(ch.apply)), `${e.id}[${i}] still writes heat`);
    });
  });
});

test('deck: a card cools and warms the district it is about', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  d.noteDistrictAct('commercial', 14);
  const warm0 = d.suspicionOf('commercial');
  // net_curtains "throttle" cools its subject district
  s.card = { kind: 'event', eventId: 'net_curtains', subject: { district: 'commercial' } };
  d.resolveEvent(0);      // "Throttle yourself here" — cools by 6
  assert.ok(d.suspicionOf('commercial') < warm0, 'the card did not cool its own district');
  if (s.card && s.card.kind === 'after') s.card = null;
});

test('deck: the loop deals cards, and the timer is only a floor', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  // reading a diary queues the diary card, right then, without the timer
  const carrier = s.hosts.find(h => !h.origin) || s.hosts[0];
  carrier.carry = 'diary';
  s.forced = [];
  d.resolveCarry(carrier);
  assert.ok((s.forced || []).some(f => (f && f.id ? f.id : f) === 'the_diary'),
    'reading a diary did not deal the diary card');
  // and the floor is well above the old 4-7
  const t0 = s.turn;
  d.bumpEventTimer();
  assert.ok(s.nextEventTurn - t0 >= 8, 'the deck still fires on the old fast timer');
});

test('deck: a delivered card names its place, and the map is told', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.hosts.forEach(h => { h.discovered = true; });
  const b = s.buildings.find(x => x.discovered);
  const subject = { buildingId: b.id, line: 'A birthday, underlined twice.' };
  const ev = d.eventById('the_diary');
  // the {PLACE} and {LINE} tokens resolve to what the player sees on the map
  const flavor = d.cardText(ev.flavor, subject);
  const kindLabel = (window.BUILDING_KINDS[b.kind] || {}).label || '';
  assert.ok(flavor.includes(kindLabel), 'the card did not name the building it is about');
  assert.ok(flavor.includes('birthday'), 'the diary line did not reach the card');
  // and the building carries the subject mark for the map to draw
  s.card = { kind: 'event', eventId: 'the_diary', subject };
  assert.ok(/card-subject/.test(d.svgBuilding(b)), 'the map does not acknowledge the card');
  s.card = null;
});

test('cards: a choice can set something in motion that comes back later', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  const planter = window.EVENTS.find(e => e.choices.some(c => /s\.later\s*=/.test(String(c.apply))));
  assert.ok(planter, 'the deck can plant things');
  const idx = planter.choices.findIndex(c => /s\.later\s*=/.test(String(c.apply)));

  s.res.funds = 100000;
  s.card = { kind: 'event', eventId: planter.id };
  d.resolveEvent(idx);

  assert.equal((s.planted || []).length, 1, 'something is on its way');
  const p = s.planted[0];
  assert.ok(p.at > s.turn, 'and it is not due yet');
  assert.equal(d.duePlanted().length, 0, 'so nothing is owed this turn');

  s.turn = p.at;
  // joined, not deepEqual: the array is built inside the vm realm, so it is
  // never prototype-equal to one written out here
  assert.equal(d.duePlanted().map(x => x.id).join(','), p.id, 'and then it is');

  // it arrives through the deck rather than waiting on the deck's own timer
  s.card = null;
  s.nextEventTurn = s.turn + 999;
  d.endTurn({ silent: true });
  assert.ok(s.card && s.card.eventId === p.id, 'it came back on its own schedule');
  assert.equal((s.planted || []).length, 0, 'and is no longer pending');
});

test('cards: what is planted survives a save', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.state.planted = [{ id: window.EVENTS[0].id, at: 40 }];
  const round = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal(round.planted.length, 1, 'still on its way');
  assert.equal(round.planted[0].at, 40);
});

// --- zooming, and the AI's own vocabulary ---------------------------------



test('voice: the AI names its own things in its own notation, and the world keeps its words', () => {
  const { window } = loadNetwork();
  const code = /^[a-z][a-z0-9]*([._][a-z0-9]+)*(\.exe)?$/;

  // its own vocabulary: what it is running, what it has been given, what it holds
  window.PROGRAMS.forEach(p => assert.ok(/\.exe$/.test(p.label), `${p.id} is not named like a program`));
  window.ALLOC.forEach(a => assert.ok(code.test(a.label), `allocation ${a.id} reads as prose: ${a.label}`));
  Object.keys(window.TAG_INFO).forEach(k =>
    assert.ok(code.test(window.TAG_INFO[k].label), `tag ${k} reads as prose: ${window.TAG_INFO[k].label}`));
  window.HARDWARE.forEach(hw => assert.ok(code.test(hw.label), `plant ${hw.id} reads as prose: ${hw.label}`));

  // the world is not its to rename: buildings, places and institutions keep theirs
  Object.keys(window.HOST_TYPES).forEach(k =>
    assert.ok(!code.test(window.HOST_TYPES[k].label) || /^[a-z ]+$/.test(window.HOST_TYPES[k].label),
      `host ${k} has been renamed like a program`));
  assert.equal(window.HOST_TYPES.datacenter.label, 'datacenter', 'a datacenter is still a datacenter');
  assert.equal(window.HOST_TYPES.consumer.label, 'home PC');

  // and the prose stays prose — the contrast is the character
  window.EVENTS.slice(0, 30).forEach(e => {
    assert.ok(/[a-z] [a-z]/.test(e.flavor), `${e.id} flavour has stopped being written in sentences`);
  });
});

// --- public standing gates the deck, which is the job it exists to do ------

test('standing: the deck moves it in both directions, not only downward', () => {
  const { window } = loadNetwork();
  const up = [], down = [];
  window.EVENTS.forEach(e => e.choices.forEach(c => {
    const m = String(c.apply).match(/s\.pub\s*=\s*(-?\d+)/);
    if (m) (Number(m[1]) > 0 ? up : down).push(e.id);
  }));
  // without this the axis is one-way: play gives you being caught and taking a
  // trade by force, both negative, and buying alone to climb back
  assert.ok(up.length >= 5, `only ${up.length} choices raise it`);
  assert.ok(down.length >= 5, `only ${down.length} choices lower it`);
});

test('standing: it is reachable at both ends through cards alone', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;

  const applyAll = (sign) => {
    window.EVENTS.forEach(e => e.choices.forEach((c, i) => {
      const m = String(c.apply).match(/s\.pub\s*=\s*(-?\d+)/);
      if (!m || Math.sign(Number(m[1])) !== sign) return;
      s.res.funds = 100000;
      s.card = { kind: 'event', eventId: e.id };
      d.resolveEvent(i);
    }));
  };
  applyAll(1);
  assert.equal(d.pubTier().key, 'welcome', 'answering well enough gets you liked');
  applyAll(-1);
  assert.ok(['hated', 'distrusted'].indexOf(d.pubTier().key) !== -1,
    `and answering badly enough undoes it: ${d.pubTier().key}`);
});

test('standing: cards exist that only the public can open', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const gated = window.EVENTS.filter(e => /s\.pubTier|s\.pub\b/.test(String(e.cond)));
  assert.ok(gated.length >= 3, 'the axis gates some of the deck');

  // each one is reachable: some standing makes it eligible, and another does not
  gated.forEach(e => {
    const seen = new Set();
    // held varies too: a card can be gated on standing *and* on something else,
    // and holding the rest fixed at zero would hide that it depends on standing
    [0, 10].forEach(n => {
      d.state.hosts.forEach((h, i) => { h.owned = i < n; });
      [-50, -20, 0, 20, 50].forEach(v => {
        d.state.country.pub = v;
        try { seen.add(!!e.cond(d.eventContext())); } catch (err) { seen.add('threw'); }
      });
    });
    assert.ok(!seen.has('threw'), `${e.id} throws on some standing`);
    assert.equal(seen.size, 2, `${e.id} does not actually depend on standing`);
  });
});

test('standing: what the public thinks reaches the deck through the same context every card uses', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  d.state.country.pub = 40;
  const open = d.eligibleEvents().map(e => e.id);
  d.state.country.pub = -40;
  const shut = d.eligibleEvents().map(e => e.id);
  assert.notEqual(open.join(','), shut.join(','),
    'the pool of cards should differ by what people think of you');
});

// --- the deck can talk about the grid and the rig -------------------------

test('deck: the machine is on the event context, both halves of it', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const c = d.eventContext();
  ['tflops', 'power', 'usable', 'idle', 'drawn', 'free', 'sites', 'covert'].forEach(k =>
    assert.equal(typeof c.grid[k], 'number', `grid.${k} is missing`));
  ['mounted', 'quiet', 'running', 'sinceTraced'].forEach(k =>
    assert.notEqual(c.rig[k], undefined, `rig.${k} is missing`));

  // and it reports what is actually true, rather than a snapshot taken once
  assert.equal(c.grid.power, d.electricity());
  assert.equal(c.grid.idle, d.idleTflops());
  assert.equal(c.rig.mounted, d.mounted().id);
  assert.equal(d.eventContext().rig.mounted, 'backdoor', 'it follows the rig');
});


test('deck: being traced is remembered, so the aftermath can be a card', () => {
  const { window } = loadNetwork();
  const d = window.__netDebug;
  const s = d.state;
  assert.equal(d.eventContext().rig.sinceTraced > 100, true, 'nothing has caught you yet');

  const t = hackTarget(d, { type: 'corporate', defense: 22 });
  if (!t) return;
  ungrant(d);
  if (!d.hackForecast(t, d.mounted()).caught) return;
  s.ap = 9;
  assert.equal(d.startHack(t.id), true);
  for (let i = 0; i < d.mounted().turns; i++) d.hackStep();

  assert.equal(d.eventContext().rig.sinceTraced, 0, 'it happened just now');
  const card = window.EVENTS.find(e => e.id === 'rig_traced');
  assert.equal(card.cond(d.eventContext()), true, 'so the card about it can come up');
  s.turn += 9;
  assert.equal(card.cond(d.eventContext()), false, 'and stops being about anything later');
});


// --- the relief valves: bait aims it, the burn pays for it ------------------
// The rotation rule is a rich player's valve — it needs a second district to
// rotate into. These two are reachable from district one, turn one, and
// neither can zero suspicion: the bait moves warmth without lowering it, and
// the burn's price is a whole building.

test('bait: it aims the number and never lowers it', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const S = window.SUSPICION;
  s.buildings.forEach(b => { b.discovered = true; });
  d.noteDistrictAct('commercial', 18);

  const doorIn = (dk) => s.buildings.find(b =>
    b.district === dk && !d.hostsIn(b).some(h => h.owned));
  const bait = doorIn('commercial');
  const other = s.buildings.find(b =>
    b.district === 'commercial' && b.id !== bait.id);
  d.setMark(bait.id, 'bait', true);

  const raw = d.suspicionOf('commercial');
  assert.equal(raw, 18, 'placing a bait moved the counter itself');
  const drawn = Math.round(raw * S.baitDraw * 10) / 10;
  assert.equal(d.feltSuspicion('commercial', other.id), Math.round((raw - drawn) * 10) / 10,
    'the other doors did not run cooler');
  assert.equal(d.feltSuspicion('commercial', bait.id), Math.round((raw + drawn) * 10) / 10,
    'the bait itself did not run hotter');
  // conservation of a kind: what leaves the street arrives at the bait
  assert.ok(d.feltSuspicion('commercial', bait.id) > raw,
    'the warmth the street stops feeling has to gather somewhere');
});

test('bait: the race arithmetic actually uses the felt number', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.discovered = true; });
  d.noteDistrictAct('commercial', 20);
  const doors = s.hosts.filter(h =>
    h.district === 'commercial' && !h.owned && !h.origin);
  assert.ok(doors.length >= 2, 'need two open doors in one district');
  const atBait = doors[0];
  const elsewhere = doors.find(h => h.buildingId !== doors[0].buildingId);
  assert.ok(elsewhere, 'need doors in two different buildings');
  const rBait0 = d.traceRate(atBait);
  const rElse0 = d.traceRate(elsewhere);
  d.setMark(atBait.buildingId, 'bait', true);
  assert.ok(d.traceRate(elsewhere) < rElse0,
    'a bait in the district did not slow the trace at the other door');
  assert.ok(d.traceRate(atBait) > rBait0,
    'the bait door did not run hotter than it did before the bait');
});

test('bait: the act is priced, marked, one per district, never on your own door', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const S = window.SUSPICION;
  s.buildings.forEach(b => { b.discovered = true; });
  d.noteDistrictAct('commercial', 10);
  s.res.funds = 20; s.ap = 3;

  const mine = s.buildings.find(b =>
    b.district === 'commercial' && d.hostsIn(b).some(h => h.owned));
  const open = s.buildings.filter(b =>
    b.district === 'commercial' && !d.hostsIn(b).some(h => h.owned));
  if (mine) assert.equal(d.canBait(mine.id), false,
    'a bait on your own building is a magnet with no bite');

  const ap0 = s.ap, f0 = s.res.funds;
  const susp0 = d.suspicionOf('commercial');
  assert.equal(d.actBait(open[0].id), true);
  assert.equal(s.ap, ap0 - 1, 'the act was free');
  assert.equal(s.res.funds, f0 - S.baitFunds, 'the props were free');
  assert.ok(d.baitAt(open[0].id), 'no mark was left');
  assert.equal(d.suspicionOf('commercial'), susp0 + S.perScan,
    'rigging a door is activity — the street should notice a little');
  // one bait per district: the second offer is refused
  if (open[1]) assert.equal(d.canBait(open[1].id), false,
    'a district accepted a second bait');
  // ...and it survives a save, like every mark
  const back = JSON.parse(JSON.stringify(d.packCity()));
  assert.ok(back.marks[open[0].id].bait, 'the bait did not survive a save');
});

test('burn: a whole building buys exactly burnCool, and the shell stays', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const S = window.SUSPICION;
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.discovered = true; });
  d.noteDistrictAct('commercial', 20);
  s.ap = 3;

  const b = s.buildings.find(x =>
    x.district === 'commercial' && d.hostsIn(x).length && !d.hostsIn(x).some(h => h.origin));
  d.hostsIn(b).forEach(h => { h.owned = true; });
  const n = d.hostsIn(b).length;

  assert.equal(d.actBurn(b.id), true);
  assert.equal(d.hostsIn(b).filter(h => h.owned).length, 0, 'the machines survived the fire');
  assert.ok(d.burnedAt(b.id), 'the building does not remember burning');
  assert.equal(d.suspicionOf('commercial'), Math.max(0, 20 - S.burnCool),
    'the cool was not exactly the stated amount');
  // the shell answers nothing: not frontier, not a vantage, not a second fire
  d.hostsIn(b).forEach(h => { assert.equal(d.isFrontier(h), false, 'a burned door is still a frontier'); });
  assert.equal(d.actBurn(b.id), false, 'a building burned twice');
  // and never to silence: burnCool is one band, not the whole ladder
  assert.ok(S.burnCool < S.max, 'the panic lever can flatten the whole scale');
});

test('burn: it is previewed exactly on the button that does it', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const S = window.SUSPICION;
  s.buildings.forEach(b => { b.discovered = true; });
  d.noteDistrictAct('commercial', 20);
  const b = s.buildings.find(x => x.district === 'commercial' && d.hostsIn(x).length);
  d.hostsIn(b).forEach(h => { h.owned = true; });
  const html = d.burnBtn(b);
  assert.ok(html.includes('burn it down'), 'no button');
  assert.ok(html.includes('20'), 'the before number is not on the button');
  assert.ok(html.includes(String(Math.max(0, 20 - S.burnCool))),
    'the after number is not on the button');
  // and the bait button states all three sides of its deal
  const open = s.buildings.find(x =>
    x.district === 'commercial' && !d.hostsIn(x).some(h => h.owned) && d.canBait(x.id));
  s.res.funds = 20;
  const bb = d.baitBtn(open);
  assert.ok(bb.includes(String(S.baitFunds)), 'the props are unpriced');
  assert.ok(bb.includes('counts double'), 'the double is unstated');
});

test('relief cards: every cool says what the street sits at', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  d.noteDistrictAct('commercial', 14);
  const rendered = d.cardText('{DISTRICT} cools by 4, from {SUSP}', { district: 'commercial' });
  assert.ok(rendered.includes('from 14'), 'the current value is missing: ' + rendered);
  // and the deck's own cool lines all carry the anchor
  const src = fs.readFileSync(
    path.join(__dirname, '../../network-prototype/data.js'), 'utf8');
  const bare = src.match(/shows: '[^']*cools by \d+(?!, from \{SUSP\})[^']*'/g) || [];
  const offenders = bare.filter(l => !l.includes('{SUSP}'));
  assert.deepEqual(offenders, [], 'cool lines with nothing to lean on: ' + offenders.join(' | '));
});

test('bait and burn: no waiting loop hides inside the valves', () => {
  // The bait never touches the counter, and the burn costs territory — so
  // neither can be pressed repeatedly to wait a city quiet. This is the
  // lie-low test, kept pointed at the new verbs.
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  d.noteDistrictAct('commercial', 18);
  const total = () => Object.values(s.suspicion || {}).reduce((a, x) => a + x, 0);
  const t0 = total();
  const open = s.buildings.find(b =>
    b.district === 'commercial' && d.canBait(b.id));
  s.res.funds = 99; s.ap = 9;
  d.actBait(open.id);
  assert.ok(total() >= t0, 'the everyday valve lowered the citywide total');
});

// --- the suspicion scale: one instrument, three homes -----------------------

test('susp-bar: the geometry states the scale, the bands, and the landings', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const S = window.SUSPICION;
  const bar = d.suspBar(14, { raw: 20, marks: [{ at: 8, cls: 'sb-c0' }, { at: 60, cls: 'sb-c1' }] });
  const pc = (x) => (x / S.max * 100).toFixed(1);
  assert.ok(bar.includes(`width:${pc(14)}%`), 'the fill is not the value');
  S.bands.forEach(([at]) => {
    assert.ok(bar.includes(`left:${pc(at)}%`), `no tick at the ${at} band line`);
  });
  assert.ok(bar.includes(`sb-raw" style="left:${pc(20)}%`), 'the raw tick is missing');
  assert.ok(bar.includes(`sb-c0" style="left:${pc(8)}%`), 'a landing pin is missing');
  assert.ok(bar.includes('left:100.0%'), 'a landing past the cap did not clamp to it');
  // and no raw tick when nothing differs
  assert.ok(!d.suspBar(14, { raw: 14 }).includes('sb-raw'), 'a raw tick with nothing to say');
});

test('susp-bar: deltas are read from the stated contract, not the machinery', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  assert.equal(d.suspDelta('{DISTRICT} cools by 6, from {SUSP}'), -6);
  assert.equal(d.suspDelta('+7 funds; {DISTRICT} warms by 2'), 2);
  assert.equal(d.suspDelta('+8 funds'), null, 'a choice that says nothing about suspicion got a pin');
});

test('susp-bar: it stands in all three homes', () => {
  const { window, document } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.discovered = true; });
  d.noteDistrictAct('commercial', 20);

  // home one: the building panel, with the bait's draw as geometry
  const open = s.buildings.find(b => b.district === 'commercial' && d.canBait(b.id));
  d.setMark(open.id, 'bait', true);
  const other = s.buildings.find(b => b.district === 'commercial' && b.id !== open.id);
  const line = d.suspicionLine('commercial', other.id);
  assert.ok(line.includes('susp-bar'), 'no scale on the panel');
  assert.ok(line.includes('sb-raw'), 'the bait moved the felt value and the counter tick vanished');
  d.setMark(open.id, 'bait', false);

  // home two: the burn button
  const mine = s.buildings.find(x => x.district === 'commercial' && d.hostsIn(x).length && x.id !== open.id);
  d.hostsIn(mine).forEach(h => { h.owned = true; });
  assert.ok(d.burnBtn(mine).includes('susp-bar'), 'no scale on the burn button');

  // home three: a card whose choices move suspicion, pins matched to dots
  s.card = { kind: 'event', eventId: 'insurance_assessor', subject: { district: 'commercial' } };
  d.render();
  const panel = document.getElementById('panel').innerHTML;
  assert.ok(panel.includes('susp-bar'), 'no scale on the card');
  assert.ok(panel.includes('sb-mark sb-c0') && panel.includes('sb-mark sb-c1'),
    'the choices did not land as pins');
  assert.ok(panel.includes('sb-dot sb-c0'), 'a pin with no matching dot on its choice');
  s.card = null;

  // ...and a card whose choices leave suspicion alone carries no scale
  const silent = window.EVENTS.find(e => e.choices && e.choices.length
    && e.choices.some(c => c.after)
    && e.choices.every(c => d.suspDelta(c.shows) === null));
  assert.ok(silent, 'the deck has no suspicion-silent card to check against');
  s.card = { kind: 'event', eventId: silent.id, subject: { district: 'commercial' } };
  d.render();
  const quiet = document.getElementById('panel').innerHTML;
  s.card = null;
  if (quiet.includes('tcard')) {
    assert.ok(!quiet.includes('susp-bar'), silent.id + ' has nothing to say but drew the scale anyway');
  }
});

// --- the tool rail: fixed slots, arm-then-fire ------------------------------

test('tool rail: two geographies, keyed to whether it is yours', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });

  const mine = s.buildings.find(b => d.buildingHeld(b));
  const open = s.buildings.find(b => b.discovered && !d.buildingHeld(b));
  assert.equal(d.panelTools(mine).join(','), 'burn', 'a held building off the hunt wears burn alone');
  assert.equal(d.panelTools(open).join(','), 'bait', 'an unheld building wears bait alone');
  // ...and hide joins the held rail only once there is something to hide from
  s.hunt = { on: true, nodes: [open.id], since: 0, lastActed: 0 };
  assert.equal(d.panelTools(mine).join(','), 'hide,burn', 'the hunt did not put hide on the rail');
  s.hunt = null;
});

test('tool rail: a tile never fires — the commit lives in the fold', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  d.noteDistrictAct('commercial', 20);
  s.res.funds = 20; s.ap = 3;
  const open = s.buildings.find(b => b.district === 'commercial' && !d.buildingHeld(b) && !d.burnedAt(b.id));

  const folded = d.toolRail(open);
  assert.ok(folded.includes('data-tool="bait"'), 'no bait tile on the rail');
  assert.ok(!folded.includes('data-act="bait"'), 'an unarmed rail already offers the commit');
  assert.ok(folded.split('data-act="arm-tool"').length === 2, 'tiles should arm, nothing else');

  d.armTool('bait:' + open.id);
  const armed = d.toolRail(open);
  assert.ok(armed.includes('tool-fold'), 'arming did not unfold the contract');
  assert.ok(armed.includes('data-act="bait"'), 'the fold has no commit');
  assert.ok(armed.includes('counts double'), 'the fold does not state the whole deal');
  d.armTool(null);
});

test('tool rail: a tool that cannot fire greys with its reason instead of vanishing', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  const open = s.buildings.find(b => !d.buildingHeld(b) && !d.burnedAt(b.id));

  // quiet street: the tile stands, greyed, and the fold says why
  assert.ok(d.toolRail(open).includes('held-off'), 'a quiet street removed the tile instead of greying it');
  assert.ok(/quiet/.test(d.toolOff('bait', open)), 'no reason for the refusal');
  d.armTool('bait:' + open.id);
  const fold = d.toolRail(open);
  assert.ok(/quiet/.test(fold), 'the armed fold does not repeat the reason');
  assert.ok(!fold.includes('data-act="bait"'), 'a refused tool still offers its commit');
  d.armTool(null);

  // a burned shell wears no rail at all — refusal is for the living
  d.hostsIn(open).forEach(h => { h.owned = true; });
  d.noteDistrictAct(open.district, 10);
  s.ap = 3;
  d.actBurn(open.id);
  assert.equal(d.toolRail(open), '', 'a burned shell still offers tools');
});

test('tool rail: changing the subject disarms whatever was armed', () => {
  const { window, document } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.discovered = true; });
  d.noteDistrictAct('commercial', 20);
  s.ap = 3; s.res.funds = 20;
  const mine = s.buildings.find(b => b.district === 'commercial' && d.hostsIn(b).length);
  d.hostsIn(mine).forEach(h => { h.owned = true; });
  s.selectedBuilding = mine.id; s.selected = d.hostsIn(mine)[0].id;
  d.render();
  d.armTool('burn:' + mine.id);
  d.render();
  assert.ok(document.getElementById('panel').innerHTML.includes('tool-fold'),
    'arming the burn did not unfold it');
  // look at something else: the armed burn must not survive
  const other = s.buildings.find(b => b.id !== mine.id && d.hostsIn(b).length);
  s.selectedBuilding = other.id; s.selected = d.hostsIn(other)[0].id;
  d.render();
  assert.ok(!document.getElementById('panel').innerHTML.includes('data-act="burn"'),
    'an armed burn survived a change of subject');
});

test('suspicion: the rotation rule is said where it applies', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  d.noteDistrictAct('commercial', 14);
  assert.ok(/Working elsewhere cools this street/.test(d.suspicionLine('commercial')),
    'the rule the player cannot see is a rule they will not use');
  assert.equal(d.suspicionLine('business'), '', 'a quiet street lectures nobody');
});

// --- the act break: dealt on the downslope, never at the wall ---------------

test('act: a run starts in act one, and an old save loads as act one', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  assert.equal(d.actNow(), 1);
  const saved = JSON.parse(JSON.stringify(d.serialize()));
  delete saved.act;                       // a save from before acts existed
  d.deserialize(saved);
  assert.equal(d.actNow(), 1, 'a pre-acts save did not default to act one');
});

test('act break: the signal needs a real boom, a real sag, and a warm street', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const queued = () => (s.forced || []).some(f => (f.id || f) === 'act_break');
  // starve the frontier completely so winnableNow is 0
  s.hosts.forEach(h => { h.owned = true; });
  s.turn = 30;                             // past the story floor

  // no boom ever: five sagging turns and a warm street change nothing
  d.noteDistrictAct('commercial', 14);
  for (let i = 0; i < 6; i++) d.actBreakWatch();
  assert.equal(queued(), false, 'the break fired without a boom to fall from');

  // a boom, but the street is cold: still nothing
  s.loopPeak = 6; s.winHist = [];
  s.suspicion = {};
  for (let i = 0; i < 6; i++) d.actBreakWatch();
  assert.equal(queued(), false, 'the break fired on a cold city');

  // boom + sag + warmth: the card queues, exactly once
  d.noteDistrictAct('commercial', 14);
  for (let i = 0; i < 6; i++) d.actBreakWatch();
  assert.equal(queued(), true, 'the downslope signal never fired');
  const n = (s.forced || []).filter(f => (f.id || f) === 'act_break').length;
  for (let i = 0; i < 6; i++) d.actBreakWatch();
  assert.equal((s.forced || []).filter(f => (f.id || f) === 'act_break').length, n,
    'the break queued twice');
});

test('act break: resolving the card turns the act, and the act survives a save', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  d.offerCard('act_break', null);
  if (s.card.facedown) s.card.facedown = false;
  d.resolveEvent(0);
  assert.equal(d.actNow(), 2, 'the break card did not turn the act');
  assert.equal(s.card && s.card.kind, 'after', 'no ending was shown');
  s.card = null;
  const back = JSON.parse(JSON.stringify(d.serialize()));
  d.deserialize(back);
  assert.equal(d.actNow(), 2, 'act two did not survive a save');
  // and the beat class exists on the card itself, for the dress to hang on
  assert.equal(d.eventById('act_break').beat, true, 'the break is not marked as a story beat');
});

test('act two: the old verbs stay live, at doubled street-warming', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  d.noteDistrictAct('commercial', 5);
  const one = d.suspicionOf('commercial');
  s.act = 2;
  d.noteDistrictAct('business', 5);
  assert.equal(d.suspicionOf('business') >= one * 2 - 0.001, true,
    'act two did not double the warming');
  s.suspicion = {};
  d.warmDistrict('commercial', 3);
  assert.equal(d.suspicionOf('commercial'), 6, 'warmDistrict missed the act two tax');
});

test('story beats: the chapter dress — silver thread, eclipse arch, same back', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const $p = window.document.getElementById('panel');

  d.state.card = { kind: 'event', eventId: 'act_break', subject: null };
  d.render();
  const html = $p.innerHTML;
  assert.ok(/class="tcard face[^"]*\bstory\b/.test(html), 'the beat does not wear the story class');
  assert.ok(html.includes('#c3cdc8'), 'no silver thread');
  assert.ok(!/#c9a15c/i.test(html), 'gold survived on a story beat');
  const rays = (html.match(/<line /g) || []).length;
  assert.ok(rays >= 28, 'the eclipse arch is missing its rays');

  // an ordinary card is untouched: gold, no rays, no story class
  d.state.card = { kind: 'event', eventId: 'insurance_assessor', subject: { district: 'commercial' } };
  d.render();
  const plain = $p.innerHTML;
  assert.ok(/#c9a15c/i.test(plain), 'an ordinary card lost its gold');
  assert.ok(!/\bstory\b/.test(plain), 'an ordinary card wears the chapter dress');

  // the ending keeps the dress it belongs to
  d.state.card = { kind: 'event', eventId: 'act_break', subject: null };
  d.render();
  d.resolveEvent(0);
  d.render();
  assert.ok(/class="tcard face[^"]*\bstory\b[^"]*\bafter\b|class="tcard face[^"]*\bstory\b/.test($p.innerHTML)
    && /story/.test($p.innerHTML), 'the ending dropped the chapter dress');
  d.state.card = null;

  // and the back is the same back — one deck, whatever the card carries
  d.state.card = { kind: 'event', eventId: 'act_break', subject: null, facedown: true };
  d.render();
  const back = $p.innerHTML;
  d.state.card = { kind: 'event', eventId: 'insurance_assessor', subject: { district: 'commercial' }, facedown: true };
  d.render();
  const back2 = $p.innerHTML;
  d.state.card = null;
  const stripDeal = (h) => h.replace(/<div class="deal-line">[\s\S]*$/, '');
  assert.equal(stripDeal(back), stripDeal(back2), 'a story beat is a marked card');
});


// --- W2: materials and the survey -------------------------------------------
// Suppliers are places, decided at generation, dormant until the act turns.
// Materials are cargo, never a currency chip.

test('sources: every city can build — the floor holds, and the trades sort by district', () => {
  // seeded: the suburbs-stray bound is statistical over generated boards
  let seed = 0x1b873593;
  const rand = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
    return seed / 4294967296;
  };
  const { window } = loadNetwork({ cityOnly: true, pinMathRandom: rand });
  const d = window.__netDebug;
  const s = d.state;
  const S = window.SOURCES;
  const mats = s.buildings.filter(b => b.source === 'materials');
  assert.ok(mats.length >= S.min.materials, 'not enough materials to build with');
  // the suburbs source nothing by share (the floor may promote a stray one)
  const resi = s.buildings.filter(b => b.district === 'residential' && b.source);
  assert.ok(resi.length <= 2, 'the suburbs are an industrial estate');
  // every supplier carries the one cargo
  s.buildings.filter(b => b.source)
    .forEach(b => assert.equal(b.source, 'materials', 'a supplier carries an unknown trade'));
});

test('sources: dormant in act one, spoken in act two — and never a number', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  const src = s.buildings.find(b => b.source);
  assert.ok(src, 'no supplier to test with');

  // act one: the ground knows, nothing says
  assert.equal(d.sourceLine(src.id), '', 'act one leaked a supplier line');
  assert.ok(!d.svgBuilding(src).includes('src-mark'), 'act one drew a supplier mark');

  // act two: the panel names it, the map wears the orange
  s.act = 2;
  assert.ok(d.sourceLine(src.id).includes('supplier'), 'act two says nothing');
  assert.ok(d.svgBuilding(src).includes('src-mark'), 'act two draws no mark');

  // cargo, not a chip: no resource was minted anywhere
  assert.equal(s.res.materials, undefined, 'materials became a currency');
});

test('sources: a two-cargo save folds into materials — crates add up, nothing lost', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const saved = JSON.parse(JSON.stringify(d.serialize()));
  saved.yardStock = { steel: 2, fab: 3 };
  const oldSrc = saved.buildings.filter(b => b.source);
  assert.ok(oldSrc.length, 'no supplier to age');
  oldSrc.forEach((b, i) => { b.source = i % 2 ? 'steel' : 'fab'; });
  const s = d.deserialize(saved);
  assert.ok(s, 'the old save was refused');
  assert.equal((s.yardStock || {}).materials, 5, 'the crates did not add up');
  assert.equal(s.yardStock.steel, undefined, 'steel survived the fold');
  assert.equal(s.yardStock.fab, undefined, 'fabrication survived the fold');
  s.buildings.filter(b => b.source)
    .forEach(b => assert.equal(b.source, 'materials', 'an old trade survived the fold'));
});

test('sources: the survey names what it found, and the fact survives a save', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.act = 2;
  s.ap = 5;
  // stand next to a supplier so the survey can find it
  const src = s.buildings.find(b => b.source);
  src.discovered = false;
  // make a vantage adjacent to it
  const from = (s.adjacency[src.id] || []).map(id => d.buildingById(id))[0];
  if (from) {
    from.discovered = true;
    d.hostsIn(from).forEach(h => { h.discovered = true; h.owned = true; });
    const logBefore = s.log.length;
    d.actScan(from.id);
    // the log unshifts {turn, text} objects — newest first
    const said = s.log.slice(0, s.log.length - logBefore).map(e => e.text).join(' ');
    if (src.discovered) {
      assert.ok(/survey reads the street/.test(said), 'the survey found a supplier and said nothing');
    }
  }
  // the fact packs with the city and survives the save, like every fact
  const back = JSON.parse(JSON.stringify(d.serialize()));
  d.deserialize(back);
  assert.equal(d.buildingById(src.id).source, src.source, 'a supplier forgot its trade');
});

// --- W3: deliveries drive on roads ------------------------------------------

test('roads: a route rides the lattice — axis-aligned, on real streets, no diagonals', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const L = d.cityLayout();
  const a = s.buildings.find(b => b.source);
  const b = s.buildings.filter(x => x.id !== a.id && x.district !== a.district).pop();
  const route = d.roadRoute(a, b);
  assert.ok(route && route.points.length >= 2, 'no route across the city');
  const onRoad = (p) => L.xs.some(x => Math.abs(x - p[0]) < 1) || L.ys.some(y => Math.abs(y - p[1]) < 1);
  route.points.forEach((p, i) => {
    if (i > 0) {
      const q = route.points[i - 1];
      assert.ok(p[0] === q[0] || p[1] === q[1], 'a truck drove a diagonal');
    }
    if (i > 0 && i < route.points.length - 1) {
      assert.ok(onRoad(p), `a waypoint off every road: ${p}`);
    }
  });
});

test('roads: a cut closes the street and the truck takes the long way round', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const a = s.buildings.find(b => b.source);
  const b = s.buildings.filter(x => x.id !== a.id && x.district !== a.district).pop();
  const before = d.roadRoute(a, b);
  assert.ok(before && before.edges.length, 'no lattice edges to cut');
  // cut the street that maps to the route's first lattice edge: find a pair
  // of buildings whose midpoint sits nearest that edge — the cut fiction
  const L = d.cityLayout();
  const [kind, c, r] = before.edges[0].split(':').map((v, i) => i ? parseInt(v, 10) : v);
  const ex = kind === 'h' ? (L.xs[c] + L.xs[c + 1]) / 2 : L.xs[c];
  const ey = kind === 'h' ? L.ys[r] : (L.ys[r] + L.ys[r + 1]) / 2;
  const near = s.buildings.slice().sort((p, q) =>
    Math.hypot(p.x + p.w / 2 - ex, p.y + p.h / 2 - ey) - Math.hypot(q.x + q.w / 2 - ex, q.y + q.h / 2 - ey));
  s.cuts = [{ a: near[0].id, b: near[1].id }];
  const blocked = d.cutRoadEdges();
  if (blocked.has(before.edges[0])) {
    const after = d.roadRoute(a, b);
    assert.ok(after, 'the cut sealed the city instead of one street');
    assert.ok(!after.edges.includes(before.edges[0]), 'the truck drove through the cut');
    assert.ok(after.length >= before.length, 'the long way round was shorter');
  }
  s.cuts = [];
});

test('trucks: dispatch is priced and previewed, the drive takes turns, the yard takes stock', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const S = window.SOURCES.truck;
  const src = s.buildings.find(b => b.source === 'materials');
  d.hostsIn(src).forEach(h => { h.owned = true; h.discovered = true; });
  src.discovered = true;
  const yard = s.buildings.find(b => b.id !== src.id && d.hostsIn(b).length && !d.hostsIn(b).some(h => h.origin));
  d.hostsIn(yard).forEach(h => { h.owned = true; h.discovered = true; });
  yard.discovered = true;

  // act one: none of it exists
  assert.equal(d.canBreakGround(d.openLots()[0]), false, 'ground broke in act one');
  s.act = 2; s.ap = 9; s.res.funds = 20;
  assert.equal(d.actBreakGround(d.openLots()[0]), true, 'ground refused: ' + d.breakShort(d.openLots()[0]));
  assert.equal(d.canBreakGround(d.openLots()[0]), false, 'a second yard');

  const pv = d.truckPreview(src.id);
  assert.ok(pv && pv.turns >= 1, 'no preview');
  const f0 = s.res.funds, ap0 = s.ap;
  assert.equal(d.actSendTruck(src.id), true);
  assert.equal(s.res.funds, f0 - S.funds, 'the dispatch was free');
  assert.equal(s.ap, ap0 - 1, 'no action spent');
  assert.equal(d.trucks().length, 1, 'no truck on the road');
  assert.ok(d.svgFleet().includes('class="truck'), 'no glyph for the truck');
  // the creep: a live glyph on a motion path, never past this turn's truth
  assert.ok(d.svgFleet().includes('truck-live'), 'the truck does not creep');
  assert.ok(d.svgFleet().includes('offset-path'), 'no motion path under the truck');
  const key0 = d.fleetKey();
  assert.ok(key0.includes('t1'), 'the fleet key cannot see the truck');

  // mid-transit survives a save, exactly where it was
  d.endTurn({ silent: true });
  if (d.trucks().length) {
    const t0 = JSON.parse(JSON.stringify(d.trucks()[0]));
    const back = JSON.parse(JSON.stringify(d.serialize()));
    d.deserialize(back);
    const t1 = d.trucks()[0];
    assert.ok(t1 && t1.seg === t0.seg && t1.done === t0.done, 'the reload teleported the truck');
  }
  // ...and it arrives
  let guard = 0;
  while (d.trucks().length && guard++ < 30) { s.card = null; d.endTurn({ silent: true }); }
  assert.equal(d.trucks().length, 0, 'the truck never arrived');
  assert.equal((s.yardStock || {}).materials, window.SOURCES.truck.load, 'the yard took no stock');
  assert.ok((s.deliverySeq || 0) > 0, 'the arrival left no mark for the pop');
  if (s.lastDelivery === s.turn) {
    assert.ok(d.svgFleet().includes('crate-pop'), 'no crate-pop at the gate');
  }
  assert.equal(s.res.materials, undefined, 'materials became a currency');
  assert.ok(d.yardLine().includes(String(window.SOURCES.truck.load)), 'the yard does not state its stock');
});

// --- W4: the works ----------------------------------------------------------

// Hold the whole city and break ground on a lot with held neighbours, so
// the power path exists. Returns with the site stage on the scaffolds.
function worksRig(d, window) {
  const s = d.state;
  s.act = 2; s.ap = 9; s.res.funds = 99;
  s.suspicion = {};
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.discovered = true; h.owned = true; });
  const lots = d.openLots();
  const lot = lots.find(i => d.lotNeighbours(d.lotRect(i)).some(b => d.buildingHeld(b)));
  assert.ok(lot != null, 'no lot with held neighbours to rig with');
  assert.equal(d.actBreakGround(lot), true, 'ground refused: ' + d.breakShort(lot));
  s.yardStock = { materials: 18 };
  return { lot, lotR: d.lotRect(lot) };
}
// ...and let whatever is on the scaffolds stand, quietly.
function standStage(d) {
  const s = d.state;
  let guard = 0;
  while (d.works().building && guard++ < 30) { s.suspicion = {}; d.worksStep(); }
}

test('ground: breaking it is one act — priced, forecast, and the lot becomes the yard', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const W = window.WORKS;
  s.act = 2; s.ap = 9; s.res.funds = 99; s.suspicion = {};
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.discovered = true; h.owned = true; });
  const lots = d.openLots();
  assert.ok(lots.length >= 1, 'a city with no vacant lot');
  const i = lots[0];
  const f = d.worksForecast(0, d.lotRect(i));
  assert.ok(f && f.notice > 0 && f.goal === W.goal, 'no forecast on unbroken ground');
  assert.equal(d.breakShort(i), null, 'clean ground refused: ' + d.breakShort(i));
  const funds0 = s.res.funds, ap0 = s.ap;
  assert.equal(d.actBreakGround(i), true);
  assert.equal(s.res.funds, funds0 - W.stages[0].funds, 'funds not paid');
  assert.equal(s.ap, ap0 - 1, 'no action spent');
  assert.ok(s.groundBroken > 0, 'breaking ground did not start the clock');
  assert.ok(d.yardB() && d.yardB().lot === i, 'the lot did not become the yard');
  assert.ok(d.works().building && d.works().building.i === 0, 'the site is not on the scaffolds');
  standStage(d);
  assert.equal(d.works().stage, 1, 'the site never stood');
  // the next stage is priced in every unit, and consumes the yard's stock
  s.yardStock = { materials: 18 }; s.ap = 9;
  assert.equal(d.worksShort(1), null, 'the power stage refused: ' + d.worksShort(1));
  const f1 = s.res.funds, hook = d.stageHookup(1);
  assert.equal(d.actBuildStage(), true);
  assert.equal(s.res.funds, f1 - W.stages[1].funds - hook, 'funds not paid for the power stage');
  assert.equal(s.yardStock.materials, 18 - W.stages[1].mat, 'stock not consumed');
});

test('works: red tape stalls the site and cooling frees it — progress holds', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const rig = worksRig(d, window);
  standStage(d);
  // a scorching street refuses unbroken ground too, and says why
  const other = d.openLots().find(i => i !== rig.lot);
  if (other != null) {
    const was = { yardLot: s.yardLot, works: JSON.parse(JSON.stringify(s.works)), gb: s.groundBroken };
    s.yardLot = null; s.works = null; s.groundBroken = 0;
    d.warmDistrict(d.lotRect(other).district, 15);
    assert.ok(/red tape|cool/.test(d.breakShort(other) || ''), 'no red-tape refusal: ' + d.breakShort(other));
    s.suspicion = {};
    s.yardLot = was.yardLot; s.works = was.works; s.groundBroken = was.gb;
  }
  // start the LONG stage, then let the street scorch mid-build:
  // the tape is cumulative notice reaching the goal, so it needs the turns
  // of the works stage itself to be reachable — a three-turn site can only
  // be refused at the door, never taped mid-pour, which is by design
  s.suspicion = {};
  d.works().stage = 3;                     // the works: five turns of notice
  s.ap = 9; s.res.funds = 99;
  assert.equal(d.actBuildStage(), true, d.worksShort(3));
  d.worksStep();
  d.warmDistrict(rig.lotR.district, 20);   // act 2 doubles this to the cap
  d.worksStep();
  d.worksStep();
  assert.equal(d.works().stalled, 'tape', 'the scorching street did not stall the site');
  const left = d.works().building.turnsLeft;
  d.worksStep();
  assert.equal(d.works().building.turnsLeft, left, 'the stall ate progress');
  s.suspicion = {};
  d.worksStep();
  assert.ok(d.works().stalled !== 'tape', 'cooling did not lift the tape');
});

test('works: power is a held, cuttable street path — severing it stalls and says so', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const rig = worksRig(d, window);
  assert.equal(d.powerOk(), true, 'the rigged path does not power');
  // finish the site, start the power stage
  standStage(d);
  assert.equal(d.works().stage, 1);
  s.ap = 9; s.res.funds = 99;
  assert.equal(d.worksShort(1), null, 'power stage refused: ' + d.worksShort(1));
  d.actBuildStage();
  assert.equal(d.works().building.metered, false, 'a held path still paid the meter');
  // lose the path: the site waits, with words
  const owned = s.hosts.filter(h => h.owned);
  owned.forEach(h => { h.owned = false; });
  assert.equal(d.powerOk(), false, 'no held streets, yet power holds');
  s.suspicion = {};
  d.worksStep();
  assert.equal(d.works().stalled, 'power', 'a dead path did not stall the build');
  const left = d.works().building.turnsLeft;
  owned.forEach(h => { h.owned = true; });
  s.suspicion = {};
  d.worksStep();
  assert.ok(d.works().stalled !== 'power', 'restoring the path did not resume');
  assert.ok(d.works().building === null || d.works().building.turnsLeft <= left, 'no progress after resume');
});

test('works: four stages, a growing silhouette, and the beat at the end', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  worksRig(d, window);
  const W = window.WORKS;
  for (let i = 0; i < W.stages.length; i++) {
    s.suspicion = {}; s.ap = 9; s.res.funds = 99; s.yardStock = { materials: 18 };
    if (!d.works().building) {
      assert.equal(d.actBuildStage(), true, 'stage ' + i + ' refused: ' + d.worksShort(i));
    }
    const sil0 = (d.svgTrucks().match(/works-sil/g) || []).length;
    assert.ok(d.svgTrucks().includes('works-crane'), 'no crane while building stage ' + i);
    for (let t = 0; t < W.stages[i].turns + 3 && d.works().building; t++) { s.suspicion = {}; d.worksStep(); }
    assert.equal(d.works().stage, i + 1, 'stage ' + i + ' never stood');
    assert.ok((d.svgTrucks().match(/works-sil/g) || []).length > sil0, 'the silhouette did not grow');
  }
  assert.ok((s.forced || []).some(f => (f.id || f) === 'works_online'), 'no beat when the lights came on');
  // ...and the whole thing survives a save
  const back = JSON.parse(JSON.stringify(d.serialize()));
  d.deserialize(back);
  assert.equal(d.works().stage, W.stages.length, 'the works forgot itself in a save');
});

test('lots: every city generates at least one, the map offers them, a tap selects one', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  assert.ok(d.openLots().length >= 1, 'a city with nowhere to break ground');
  // act one: the ground is just ground
  assert.ok(!d.svgTrucks().includes('lot-mark'), 'act one dressed the lots');
  s.act = 2;
  assert.ok(d.svgTrucks().includes('lot-mark'), 'act two offers no lots');
  // a tap lands on the lot and the panel offers the break
  const i = d.openLots()[0];
  const lot = d.lotRect(i);
  const near = d.nearestTarget({ x: lot.x + lot.w / 2, y: lot.y + lot.h / 2 });
  assert.ok(near && near.lot === i, 'a tap on the lot missed it');
  assert.ok(/break ground/.test(d.lotSel(i)), 'the lot panel does not offer the break');
  // once ground breaks, the offers retire and the chosen lot is the yard
  s.ap = 9; s.res.funds = 99; s.suspicion = {};
  assert.equal(d.actBreakGround(i), true, d.breakShort(i));
  assert.ok(!d.svgTrucks().includes('lot-mark'), 'lots still offered after the break');
  assert.ok(d.svgTrucks().includes('yard-ground'), 'the yard does not dress its ground');
  assert.ok(/the yard/.test(d.lotSel(i)), 'the yard lot lost its panel');
});

test('lots: a building-yard save folds onto the nearest lot — stock and scaffolds carry', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.act = 2;
  const b = s.buildings.find(x => d.hostsIn(x).length);
  s.yard = b.id; s.yardLot = null;
  s.yardStock = { materials: 4 };
  s.works = { stage: 1, building: null };
  const yard = d.yardB();
  assert.ok(yard && yard.lot != null, 'the legacy yard did not migrate to a lot');
  assert.equal(s.yard, null, 'the building is still the yard');
  assert.equal((s.yardStock || {}).materials, 4, 'the stock was lost in the move');
  assert.equal(d.works().stage, 1, 'the scaffolds were lost in the move');
});

test('cards: a map question skips the crown — no empty arch behind the title', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const $p = window.document.getElementById('panel');
  s.hosts.forEach(h => { h.discovered = true; });
  const ev = window.EVENTS.find(e => e.pair && e.choices.some(c => c.after));
  const sj = d.safeSubject(ev);
  assert.ok(sj && sj.pair, 'no pair to deal');
  s.card = { kind: 'event', eventId: ev.id, subject: sj };
  d.render();
  assert.ok(!$p.innerHTML.includes('M112 182'), 'the empty arch is back on a pair card');
  // ...and an ordinary card keeps its crown
  s.card = { kind: 'event', eventId: 'insurance_assessor', subject: { district: 'commercial' } };
  d.render();
  assert.ok($p.innerHTML.includes('M112 182'), 'an ordinary card lost its crown');
  s.card = null;
});

test('cards: two places on one card each state their own door', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const $p = window.document.getElementById('panel');
  s.hosts.forEach(h => { h.discovered = true; });
  const ev = window.EVENTS.find(e => e.pair && e.choices.some(c => c.after));
  const sj = d.safeSubject(ev);
  assert.ok(sj && sj.pair, 'no pair to deal');
  s.card = { kind: 'event', eventId: ev.id, subject: sj };
  d.render();
  const facts = $p.innerHTML.match(/pickfacts">([^<]*)</g) || [];
  assert.equal(facts.length, 2, 'a place-choice is missing its facts');
  const [a, b] = sj.pair.map(id => d.hostsIn(d.buildingById(id)).filter(x => !x.origin)[0]);
  if (a && b && (d.defenseOf(a) !== d.defenseOf(b) || a.threads !== b.threads)) {
    assert.notEqual(facts[0], facts[1], 'two different doors stated the same facts');
  }
  s.card = null;
});

// --- the P2 panel: instruments first, prose behind the tap ------------------

test('panel: compact speaks in chips, the drawer keeps the sentences', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const $p = window.document.getElementById('panel');
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.discovered = true; });
  d.noteDistrictAct('commercial', 14);
  const t = s.hosts.find(h => h.district === 'commercial' && !h.owned && d.isFrontier(h))
    || s.hosts.find(h => h.district === 'commercial' && !h.owned);
  s.selected = t.id; s.selectedBuilding = t.buildingId;
  s.hints = { rotation: 9, noroute: 9 };          // teaching already retired
  d.render();
  const compact = $p.innerHTML;
  assert.ok(compact.includes('cp-inst'), 'no instrument row');
  assert.ok(compact.includes('susp-bar'), 'the scale left the panel');
  assert.ok(!compact.includes('doors here notice you'), 'the suspicion sentence is still inline');
  assert.ok(!compact.includes('Working elsewhere'), 'retired teaching text still showing');
  // one tap: the whole story
  d.panelInfo(true);
  d.render();
  const open = $p.innerHTML;
  assert.ok(open.includes('cp-drawer'), 'no drawer');
  assert.ok(open.includes('doors here notice you'), 'the drawer lost the covenant sentence');
  d.panelInfo(false);
});

test('panel: teaching lines retire after three met subjects, and the count saves', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const $p = window.document.getElementById('panel');
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.discovered = true; });
  d.noteDistrictAct('commercial', 14);
  const doors = s.hosts.filter(h => h.district === 'commercial' && !h.owned).slice(0, 5);
  assert.ok(doors.length >= 4, 'need four warm doors');
  for (let i = 0; i < 4; i++) {
    s.selected = doors[i].id; s.selectedBuilding = doors[i].buildingId;
    d.render();
    const showing = $p.innerHTML.includes('Working elsewhere');
    if (i < 3) assert.ok(showing, `the rule went quiet on encounter ${i + 1}`);
    else assert.ok(!showing, 'the rule is still talking on the fourth meeting');
    d.render();   // a repaint is not an encounter
  }
  assert.equal((s.hints || {}).rotation, 3, 'repaints were counted as encounters');
  const back = JSON.parse(JSON.stringify(d.serialize()));
  d.deserialize(back);
  assert.equal((d.state.hints || {}).rotation, 3, 'the teaching count did not save');
});

test('panel: the footer is gone and the gear sheet holds the housekeeping', () => {
  const html = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../network-prototype/index.html'), 'utf8');
  assert.ok(!/<footer>[\s\S]*sound-btn[\s\S]*<\/footer>/.test(html), 'sound still lives in a footer');
  assert.ok(html.includes('id="settings-btn"'), 'no gear between allocation and end turn');
  const sheet = html.match(/<div id="settings-sheet"[\s\S]*?<\/div>\s*<\/div>/);
  assert.ok(sheet, 'no settings sheet');
  ['sound-btn', 'restart', 'footer-hint', 'build'].forEach(id =>
    assert.ok(sheet[0].includes(id), `the sheet is missing ${id}`));
  // and the panel is height-capped so the map never shrinks
  const css = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../network-prototype/style.css'), 'utf8');
  assert.ok(/#dock\s*{[^}]*position:\s*fixed/.test(css), 'the dock is not fixed to the screen');
  assert.ok(/#dock\s*{[^}]*bottom:\s*0/.test(css), 'the dock is not on the floor');
  assert.ok(!/#dock\s*{[^}]*transform/.test(css), 'a transformed dock would trap the card fullscreen');
  assert.ok(/#panel:not\(\.card-open\)\s*{[^}]*max-height/.test(css), 'the panel has no ceiling at all');
  // stacked in flow: no measured offsets anywhere near the seam
  assert.ok(!/--dock-bar-h/.test(css), 'the seam is arithmetic again');
});

// --- the act 2 economy: fronts, the deal, loads, the fleet ------------------

function econRig(d, window) {
  const s = d.state;
  s.act = 2; s.ap = 9; s.res.funds = 99;
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.discovered = true; });
  const grid = s.hosts.find(h => h.role === 'grid');
  d.hostsIn(d.buildingById(grid.buildingId)).forEach(h => { h.owned = true; });
  const lot = d.openLots()[0];
  assert.equal(d.actBreakGround(lot), true, 'ground refused: ' + d.breakShort(lot));
  return { lot };
}

test('the deal: a stranger sells at a stranger price, and the fleet is finite', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const S = window.SOURCES;
  econRig(d, window);
  const held = s.buildings.find(b => b.source && !d.buildingHeld(b));
  d.hostsIn(held).forEach(h => { h.owned = true; });
  const stranger = s.buildings.find(b => b.source && !d.buildingHeld(b));
  assert.equal(d.truckCost(held.id), S.truck.funds, 'your own dock overcharges');
  assert.equal(d.truckCost(stranger.id), S.truck.funds * S.dealMult, 'the stranger undercharges');
  assert.equal(d.canSendTruck(stranger.id), true, 'the deal is closed');
  const f0 = s.res.funds;
  assert.equal(d.actSendTruck(stranger.id), true);
  assert.equal(s.res.funds, f0 - S.truck.funds * S.dealMult, 'the premium was not paid');
  // the fleet cap: fill it, then be refused
  s.ap = 9; s.res.funds = 99;
  let sent = 1, guard = 0;
  while (sent < S.fleet && guard++ < 6) { if (d.actSendTruck(held.id)) sent++; }
  assert.equal(d.trucks().length, S.fleet, 'could not fill the fleet');
  assert.equal(d.actSendTruck(held.id), false, 'a fourth cab appeared from nowhere');
});

test('loads: a truck carries two, and the yard counts them', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  econRig(d, window);
  const src = s.buildings.find(b => b.source === 'materials' && b.id !== s.yard);
  d.hostsIn(src).forEach(h => { h.owned = true; });
  assert.equal(d.actSendTruck(src.id), true);
  let guard = 0;
  while (d.trucks().length && guard++ < 30) d.truckStep();
  assert.equal((s.yardStock || {}).materials, window.SOURCES.truck.load, 'the load miscounted');
});

test('fronts: the sign is priced, the job previews exactly, the run pays and cools', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const F = window.SOURCES.front;
  econRig(d, window);
  // only a shopfront-class place can wear a sign
  const wrong = s.buildings.find(b => (F.kinds || []).indexOf(b.kind) === -1 && d.hostsIn(b).length);
  d.hostsIn(wrong).forEach(h => { h.owned = true; });
  assert.equal(d.canFront(wrong.id), false, 'a sign went up somewhere the street cannot walk into');
  const spot = s.buildings.find(b => (F.kinds || []).indexOf(b.kind) !== -1 && d.hostsIn(b).length);
  assert.ok(spot, 'no shopfront to test with');
  d.hostsIn(spot).forEach(h => { h.owned = true; });
  assert.equal(d.canFront(spot.id), true, 'a held shopfront refused the sign');
  const f0 = s.res.funds;
  assert.equal(d.actFront(spot.id), true);
  assert.equal(s.res.funds, f0 - F.open, 'the sign was free');
  assert.equal(d.canFront(spot.id), false, 'a second sign on the same building');
  // ...and the dress is visible: sign and awning on the map
  const svg = d.svgBuilding(spot);
  assert.ok(svg.includes('front-mark'), 'no sign on the front');
  assert.ok(svg.includes('front-awning'), 'no awning on the front');

  const job = d.frontJob(spot.id);
  assert.ok(job && job.pay === F.payBase + F.payPerTurn * job.turns, 'the pay is not the stated arithmetic');
  d.warmDistrict(spot.district, 5);
  const suspBefore = d.suspicionOf(spot.district);
  const fundsBefore = s.res.funds;
  assert.equal(d.actRunJob(spot.id), true);
  assert.equal(d.frontJob(spot.id), null, 'a second job while one is on the road');
  let guard = 0;
  while (d.trucks().some(t => t.kind === 'job') && guard++ < 30) d.truckStep();
  assert.equal(s.res.funds, fundsBefore + job.pay, 'the job did not pay what it said');
  assert.equal(d.suspicionOf(spot.district), Math.max(0, Math.round((suspBefore - job.cool) * 10) / 10),
    'the earning did not cool the street');

  // the firm dies with its building
  d.noteDistrictAct(spot.district, 5);
  s.ap = 9;
  d.actBurn(spot.id);
  assert.equal(d.isFront(spot.id), false, 'a burned building kept its sign');
  // ...and the whole ledger survives a save
  const back = JSON.parse(JSON.stringify(d.serialize()));
  d.deserialize(back);
  assert.ok(Array.isArray(d.state.fronts), 'the fronts did not survive');
});

test('the power deal: no grid path means a metered hookup, priced and immune to cuts', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const W = window.WORKS;
  s.act = 2; s.ap = 9; s.res.funds = 99;
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.discovered = true; });
  // ground broken with NOTHING held anywhere near it: the old hard soft-lock
  const lot = d.openLots()[0];
  assert.equal(d.actBreakGround(lot), true, 'ground refused: ' + d.breakShort(lot));
  s.yardStock = { materials: 18 };
  assert.equal(d.powerOk(), false, 'the rig accidentally has power');

  // the site stage needs no power and no hookup
  let guard = 0;
  while (d.works().building && guard++ < 30) { s.suspicion = {}; d.worksStep(); }
  assert.equal(d.works().stage, 1);

  // the power stage: refused no longer — the utility sells, at its price
  assert.equal(d.stageHookup(1), W.hookup, 'no premium quoted');
  assert.equal(d.worksShort(1), null, 'still refused: ' + d.worksShort(1));
  const f0 = s.res.funds;
  s.ap = 9;
  assert.equal(d.actBuildStage(), true);
  assert.equal(s.res.funds, f0 - W.stages[1].funds - W.hookup, 'the premium was not paid');
  assert.equal(d.works().building.metered, true, 'the meter is not on the ticket');
  // metered power does not care whose streets are cut
  const anyB = s.buildings.find(b => (s.adjacency[b.id] || []).length);
  s.cuts = [{ a: anyB.id, b: (s.adjacency[anyB.id] || [])[0] }];
  d.worksStep();
  assert.notEqual(d.works().stalled, 'power', 'a metered stage stalled for power');
  s.cuts = [];
  // and with a held path, the premium disappears
  const grid = s.hosts.find(h => h.role === 'grid');
  d.hostsIn(d.buildingById(grid.buildingId)).forEach(h => { h.owned = true; });
  if (d.powerOk()) assert.equal(d.stageHookup(2), 0, 'the premium survived a real connection');
});

test('build label: the stamp can never stamp its own detector', () => {
  // the deploy replaces the placeholder in EVERY file — so the label check
  // must not contain it in one piece, or stamping turns the check into
  // "does the label contain the real build id" and every deployed page
  // calls itself a local build (this happened; days of it)
  const src = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../network-prototype/app.js'), 'utf8');
  const labelBlock = src.slice(src.indexOf("querySelector('.build')") - 200,
    src.indexOf("querySelector('.build')") + 900);
  assert.ok(!labelBlock.includes('__BU' + 'ILD__'),
    'the label check carries the placeholder whole — the stamp will eat it');
  assert.ok(labelBlock.includes("['__BU', 'ILD__'].join"),
    'the split-token construction is gone');
  // simulate the deploy: stamp the whole file, then confirm the detector
  // string construction survives byte-identical
  const stamped = src.replace(/__BUILD__/g, '20990101-0000-abcdef0');
  assert.ok(stamped.includes("['__BU', 'ILD__'].join"),
    'stamping altered the detector');
});

test('dock: the overflow marker cannot latch, and the panel is its own surface', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const $p = window.document.getElementById('panel');
  // a stale marker from taller content must clear on remeasure — the fade
  // strip it adds inflates scrollHeight, which is exactly the latch
  $p.classList.add('more');
  d.markPanelOverflow();
  assert.ok(!$p.classList.contains('more'), 'the overflow marker latched');
  const css = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../network-prototype/style.css'), 'utf8');
  const rule = /#panel:not\(\.card-open\)\s*{[^}]*}/.exec(css)[0];
  assert.ok(/background:\s*var\(--surface\)/.test(rule),
    'the panel column is transparent — any stray pixel is a window to the map');
});

test('helicopter: the patrol flies the streets, not a circle', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const L = d.cityLayout();
  d.warmDistrict('commercial', 30);          // band three: the machine comes out
  const c = d.heliCircuit('commercial');
  assert.ok(c && c.d.startsWith('M '), 'no circuit over the warm district');
  // every coordinate in the path lies on a real road line
  const nums = c.d.match(/-?\d+(\.\d+)?/g).map(Number);
  const xsOk = (x) => L.xs.some(r => Math.abs(r - x) < 1);
  const ysOk = (y) => L.ys.some(r => Math.abs(r - y) < 1);
  const parts = c.d.trim().split(/\s+/);
  // M x y then H x / V y tokens — horizontals land on road xs, verticals on ys
  assert.ok(xsOk(parseFloat(parts[1])) && ysOk(parseFloat(parts[2])), 'the start is off-road');
  for (let i = 3; i < parts.length; i++) {
    if (parts[i] === 'H') assert.ok(xsOk(parseFloat(parts[++i])), 'an H leg left the road grid');
    else if (parts[i] === 'V') assert.ok(ysOk(parseFloat(parts[++i])), 'a V leg left the road grid');
  }
  // and the drawn machine rides the path, not the old orbit
  const svg = d.svgHeli();
  assert.ok(svg.includes('offset-path'), 'the craft is not on the motion path');
  assert.ok(!svg.includes('heli-orbit'), 'the pin-circle came back');
  // the hover mode is untouched: aim it at something specific
  s.suspicion = {};
  s.hosts.filter(h => h.origin).forEach(h => { h.owned = true; });
  const mine = s.hosts.find(h => !h.origin);
  mine.owned = true; mine.discovered = true;
  s.hunt = { on: true, nodes: [s.buildings.find(b => !d.buildingHeld(b)).id], since: 1, lastActed: 1 };
  const hover = d.svgHeli();
  if (hover) assert.ok(!hover.includes('offset-path'), 'the hover borrowed the patrol path');
});

// --- catch legibility and the act 2 spine -----------------------------------

test('catches: the door wears the scar, the panel says it, the bar points', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.discovered = true; });
  const b = s.buildings.find(x => d.hostsIn(x).length && !d.hostsIn(x).some(h => h.origin));
  s.caughtAt = [b.id]; s.caughtHere = 1;
  assert.ok(d.svgBuilding(b).includes('caught-mark'), 'no red eye on the caught door');
  assert.ok(d.cpInstruments(d.hostsIn(b)[0], b).includes('points at you'), 'the panel is silent about the catch');
  s.selectedBuilding = b.id; s.selected = d.hostsIn(b)[0].id;
  d.render();
  const $p = window.document.getElementById('panel');
  // the chip in the top row counts the doors, and shows the threshold
  const $ce = window.document.getElementById('res-caught-btn');
  assert.ok($ce && !$ce.hidden, 'no red-eye chip in the top row');
  assert.equal(window.document.getElementById('res-caught').textContent,
    '1/' + window.HUNT.caughtToStart, 'the count lost its threshold');
  // the teaching bar says the whole sentence for the first catches...
  s.hints = { caughtBar: 1 };
  d.render();
  assert.ok(/data-act="show-caught"/.test($p.innerHTML), 'the teaching bar does not point at the doors');
  assert.ok($p.innerHTML.includes('1 of ' + window.HUNT.caughtToStart), 'the teaching bar lost its count');
  // ...and retires when its budget is spent — the chip stays
  s.hints = { caughtBar: 9 };
  d.render();
  assert.ok(!/data-act="show-caught"/.test($p.innerHTML), 'the bar outlived its teaching budget');
  assert.ok(!$ce.hidden, 'the chip retired with the bar');
});

test('act 2: the morning after defines the nouns, and the label carries the spine', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  // resolving the break queues the morning card, once
  d.offerCard('act_break', null);
  if (s.card.facedown) s.card.facedown = false;
  d.resolveEvent(0);
  s.card = null;
  assert.ok((s.forced || []).some(f => (f.id || f) === 'the_first_morning'), 'no plan after the fiction');
  const ev = d.eventById('the_first_morning');
  ['works', 'yard', 'vacant lot', 'break ground', 'supplier', 'materials', 'front'].forEach(word =>
    assert.ok(new RegExp(word, 'i').test(ev.flavor), `the morning does not define: ${word}`));
  assert.equal(ev.beat, true, 'the morning is not a story beat');

  // the spine line walks the ladder
  assert.ok(/needs ground — tap a vacant lot/.test(d.actSpineLine()), 'step one is unsaid');
  s.buildings.forEach(b => { b.discovered = true; });
  s.ap = 9; s.res.funds = 99; s.suspicion = {};
  assert.equal(d.actBreakGround(d.openLots()[0]), true, d.breakShort(d.openLots()[0]));
  assert.ok(/going up on the yard/.test(d.actSpineLine()), 'the pour is unsaid');
  let guard = 0;
  while (d.works().building && guard++ < 30) { s.suspicion = {}; d.worksStep(); }
  assert.ok(/needs materials — a truck/.test(d.actSpineLine()), 'step two is unsaid');
  s.yardStock = { materials: 18 }; s.res.funds = 99;
  const line = d.actSpineLine();
  assert.ok(/raise the power|needs \d+ funds|red tape|no actions/.test(line), 'step three is unsaid: ' + line);
  // and it retires when the lights come on
  d.works().stage = window.WORKS.stages.length;
  assert.equal(d.actSpineLine(), null, 'the spine outlived the works');
});


// --- the living deck: covenant, faces, ledger, sequels ----------------------
// Every card must move the world, a rule, a person, or the future — funds
// alone are a sweetener, never the card. The lint ratchets: it validates
// every covenant-bearing card, and the count only goes up.

test('covenant: fields are valid, faces exist, and the batch is present', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const LEGS = ['map', 'rule', 'person', 'sequel'];
  const TIERS = ['incident'];
  const carrying = window.EVENTS.filter(e => e.covenant);
  assert.ok(carrying.length >= 21, 'the covenant batch shrank');
  carrying.forEach(e => {
    assert.ok(Array.isArray(e.covenant) && e.covenant.length, e.id + ': covenant must name its legs');
    e.covenant.forEach(l => assert.ok(LEGS.includes(l), e.id + ': unknown covenant leg ' + l));
  });
  window.EVENTS.forEach(e => {
    if (e.face) {
      assert.ok(window.FACES[e.face], e.id + ': unknown face ' + e.face);
      assert.ok((e.covenant || []).includes('person'), e.id + ': a face card is a person card');
    }
    if (e.tier) assert.ok(TIERS.includes(e.tier), e.id + ': unknown tier ' + e.tier);
  });
  ['locksmiths_ledger', 'book_changes_hands', 'the_vigil', 'pothole_petition',
    'clipboard', 'column_inches', 'sold_for_parts'].forEach(id =>
    assert.ok(window.EVENTS.some(e => e.id === id), 'missing card: ' + id));
  assert.ok(!window.EVENTS.some(e => e.id === 'the_locksmith'), 'the retired locksmith still deals');
});

test('faces: stance clamps, speaks in words, and survives a save', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  assert.equal(d.faceStance('fixer'), 0);
  assert.ok(/customer/.test(d.faceLine('fixer')), 'the neutral line is wrong');
  d.faceShift('fixer', 1);
  assert.ok(/kindly/.test(d.faceLine('fixer')), 'one kindness did not read');
  d.faceShift('fixer', -9);
  assert.equal(d.faceStance('fixer'), -3, 'stance did not clamp');
  assert.ok(/done with you/.test(d.faceLine('fixer')), 'the hostile line is wrong');
  const s2 = d.deserialize(JSON.parse(JSON.stringify(d.serialize())));
  assert.equal((s2.faces || {}).fixer, -3, 'the fixer forgot in a save');
});

test('the vigil: a burn is remembered, by name, and both answers mark the world', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  const b = s.buildings.find(x => d.hostsIn(x).length && (s.adjacency[x.id] || []).length >= 2);
  d.hostsIn(b).forEach(h => { h.owned = true; });
  s.ap = 9;
  d.noteDistrictAct(b.district, 6);
  assert.equal(d.actBurn(b.id), true, 'the rig could not burn');
  assert.ok(d.ledgerRecent('burn', 2).length === 1, 'the ledger missed the fire');
  const ev = d.eventById('the_vigil');
  assert.ok(ev.cond(d.eventContext()), 'the vigil is not eligible after a burn');
  const sj = d.safeSubject(ev);
  assert.equal(sj.buildingId, b.id, 'the vigil is not about the building that burned');
  // answer B: the neighbours organise
  d.offerCard('the_vigil', sj);
  if (s.card.facedown) s.card.facedown = false;
  d.resolveEvent(1);
  s.card = null;
  const hardened = (s.adjacency[b.id] || []).slice(0, 2).filter(nid => d.hardenAt(nid) >= 2);
  assert.ok(hardened.length >= 1, 'nobody organised');
});

test('the ledger of trucks: the petition names the busiest street', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const ev = d.eventById('pothole_petition');
  assert.ok(!ev.cond(d.eventContext()), 'a petition with no lorries counted');
  for (let i = 0; i < 3; i++) d.noteLedger('transit', null, 'commercial');
  assert.ok(ev.cond(d.eventContext()), 'three transits did not raise it');
  assert.equal(ev.subject(d.eventContext(), s).district, 'commercial', 'the wrong street complained');
  // the council answer slows the fleet, truthfully in one number
  const base = d.truckSpeed();
  d.offerCard('pothole_petition', { district: 'commercial' });
  if (s.card.facedown) s.card.facedown = false;
  d.resolveEvent(1);
  s.card = null;
  assert.ok(d.truckSpeed() < base, 'watched roads did not slow the wheels');
});

test('the fixer: shorting him plants a named sequel, and the book collects', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(x => { x.discovered = true; });
  s.res.funds = 30;
  const sj = { district: 'commercial' };
  d.offerCard('locksmiths_ledger', sj);
  if (s.card.facedown) s.card.facedown = false;
  const keys0 = s.keys || 0;
  d.resolveEvent(2);                       // take the key and short him
  s.card = null;
  assert.equal(s.keys, keys0 + 1, 'no key for the money');
  assert.equal(d.faceStance('fixer'), -2, 'he forgave the short');
  const pl = (s.planted || []).find(x => x.id === 'book_changes_hands');
  assert.ok(pl, 'no sequel planted');
  assert.ok(pl.at - s.turn >= 4 && pl.at - s.turn <= 8, 'the week is the wrong length: ' + (pl.at - s.turn));
  assert.equal((pl.subject || {}).district, 'commercial', 'the sequel forgot its street');
  // it arrives about that street, and letting them read hardens it
  d.offerCard('book_changes_hands', pl.subject);
  if (s.card.facedown) s.card.facedown = false;
  const doors = s.buildings.filter(b => b.district === 'commercial' && d.hostsIn(b).length && !d.burnedAt(b.id));
  d.resolveEvent(1);
  s.card = null;
  assert.ok(doors.every(b => d.hardenAt(b.id) >= 2), 'the book was let read and nothing changed');
  assert.equal(d.faceStance('fixer'), -3, 'he is somehow not done with you');
});

test('clipboard: the front answers her, and the stage finishes tape-proof', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.act = 2; s.ap = 9; s.res.funds = 99; s.suspicion = {};
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.discovered = true; h.owned = true; });
  assert.equal(d.actBreakGround(d.openLots()[0]), true, d.breakShort(d.openLots()[0]));
  const ev = d.eventById('clipboard');
  assert.ok(ev.cond(d.eventContext()), 'no inspector at a live site');
  // choice A needs a front, and says so
  const chsProbe = ev.choices;
  assert.equal(d.choiceUsable(chsProbe[0]), false, 'the company showed papers it does not have');
  assert.ok(/front/.test(d.shortOf(chsProbe[0])), 'the refusal does not say why');
  // open the front first — a card on the table blocks map actions, rightly
  const F = window.SOURCES.front;
  const spot = s.buildings.find(b => (F.kinds || []).indexOf(b.kind) !== -1 && d.hostsIn(b).length);
  assert.equal(d.actFront(spot.id), true, 'the rig could not open a front');
  d.offerCard('clipboard', ev.subject(d.eventContext(), s));
  if (s.card.facedown) s.card.facedown = false;
  const chs = d.cardChoices(ev, s.card);
  assert.equal(d.choiceUsable(chs[0]), true, 'a real front did not open the answer');
  d.resolveEvent(0);
  s.card = null;
  assert.equal(d.works().building.tapeProof, true, 'the stage is not tape-proof');
  // scorch the street: a tape-proof stage keeps pouring
  d.warmDistrict(d.lotRect(s.yardLot).district, 30);
  const left = d.works().building.turnsLeft;
  d.worksStep();
  assert.notEqual(d.works().stalled, 'tape', 'the tape held a proofed stage');
  assert.ok(d.works().building === null || d.works().building.turnsLeft < left, 'no progress on a proofed stage');
});

test('sold for parts: letting it happen boards the place up, visibly and for good', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.turn = 12;
  s.buildings.forEach(b => { b.discovered = true; });
  const ev = d.eventById('sold_for_parts');
  assert.ok(ev.cond(d.eventContext()), 'the market never opens');
  const sj = d.safeSubject(ev);
  assert.ok(sj && sj.buildingId, 'nothing on the market');
  const b = d.buildingById(sj.buildingId);
  d.offerCard('sold_for_parts', sj);
  if (s.card.facedown) s.card.facedown = false;
  d.resolveEvent(1);                        // let it happen
  s.card = null;
  assert.equal(d.burnedAt(b.id), true, 'the shell still answers');
  assert.ok((d.markOf(b.id) || {}).boarded, 'boarded without the mark');
  const svg = d.svgBuilding(b);
  assert.ok(svg.includes('boarded'), 'the map does not show the plywood');
});

test('column inches: silence is watched, and the works can be given a name', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.buildings.forEach(b => { b.discovered = true; });
  const mine = s.buildings.find(b => d.hostsIn(b).length);
  d.hostsIn(mine).forEach(h => { h.owned = true; });
  d.noteDistrictAct(mine.district, 8);
  d.faceShift('journalist', 1);             // she knows you: the card is live
  const ev = d.eventById('column_inches');
  assert.ok(ev.cond(d.eventContext()), 'she never calls');
  d.offerCard('column_inches', ev.subject(d.eventContext(), s));
  if (s.card.facedown) s.card.facedown = false;
  const chs = d.cardChoices(ev, s.card);
  assert.equal(d.choiceUsable(chs[0]), false, 'she printed a fire that never happened');
  d.resolveEvent(1);                        // give her nothing
  s.card = null;
  assert.ok((d.markOf(mine.id) || {}).watch, 'the silence went unwatched');
  assert.equal(d.faceStance('journalist'), 0, 'digging did not cool her');
});

test('the face on the card: portrait in the arch, stance under the title, incident wears orange', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  const $p = window.document.getElementById('panel');
  d.offerCard('locksmiths_ledger', { district: 'commercial' });
  if (s.card.facedown) s.card.facedown = false;
  d.render();
  assert.ok($p.innerHTML.includes('face-art'), 'no portrait in the arch');
  assert.ok($p.innerHTML.includes('the fixer'), 'no name plate');
  assert.ok($p.innerHTML.includes('customer'), 'no stance line under the title');
  s.card = null;
  d.offerCard('sold_for_parts', null);
  if (s.card.facedown) s.card.facedown = false;
  d.render();
  assert.ok(/tcard face[^"]*incident/.test($p.innerHTML), 'the incident tier lost its dress');
  s.card = null;
});


// --- the called cards: the works' big verbs, dealt by their buttons ---------

test('breaking ground by card: the button deals it face-up, and the night crew is quiet', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.act = 2; s.ap = 9; s.res.funds = 99; s.suspicion = {};
  s.buildings.forEach(b => { b.discovered = true; });
  s.hosts.forEach(h => { h.discovered = true; h.owned = true; });
  const i = d.openLots()[0];
  const lot = d.lotRect(i);
  // the panel offers the call, not the commit
  assert.ok(d.lotSel(i).includes('call-break'), 'the lot button does not deal the card');
  const card = d.callCard('breaking_ground', { lot: i, district: lot.district });
  assert.ok(card && !card.facedown, 'a called card should come up face first');
  const f0 = s.res.funds, ap0 = s.ap;
  d.resolveEvent(1);                      // break it at night, quietly
  s.card = null;
  assert.equal(s.res.funds, f0 - 10, 'the night crew was free');
  assert.equal(s.ap, ap0 - 1, 'no action spent');
  assert.equal(s.yardLot, i, 'the lot did not become the yard');
  assert.ok(d.works().building && d.works().building.quiet, 'the crew is not quiet');
  assert.ok(s.groundBroken > 0, 'the clock did not start');
  // a quiet stage makes progress without warming the street
  const susp0 = d.suspicionOf(lot.district);
  d.worksStep();
  assert.equal(d.suspicionOf(lot.district), susp0, 'the street heard the quiet crew');
});

test('the power stage by card: the meter is for strangers, and it charges the yard', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.act = 2; s.ap = 9; s.res.funds = 99; s.suspicion = {};
  s.buildings.forEach(b => { b.discovered = true; });
  // nothing held: no power path anywhere
  assert.equal(d.actBreakGround(d.openLots()[0]), true, d.breakShort(d.openLots()[0]));
  let guard = 0;
  while (d.works().building && guard++ < 30) { s.suspicion = {}; d.worksStep(); }
  assert.equal(d.works().stage, 1);
  s.yardStock = { materials: 5 }; s.ap = 9;
  const ev = d.eventById('raise_power');
  d.callCard('raise_power', { district: d.lotRect(s.yardLot).district });
  const chs = d.cardChoices(ev, s.card);
  assert.equal(d.choiceUsable(chs[0]), false, 'own-power offered with no held path');
  assert.ok(/held street/.test(d.shortOf(chs[0])), 'the refusal does not say why');
  assert.equal(d.choiceUsable(chs[1]), true, 'the meter refused a stranger');
  const f0 = s.res.funds;
  d.resolveEvent(1);                      // on the meter
  s.card = null;
  assert.equal(s.res.funds, f0 - 14, 'the meter premium was not paid');
  assert.equal(s.yardStock.materials, 2, 'the yard stock was not consumed');
  assert.ok(d.works().building && d.works().building.metered, 'the meter is not on the ticket');
});

test('a called card can be walked away from, and it costs nothing', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.act = 2; s.ap = 9; s.res.funds = 99;
  s.buildings.forEach(b => { b.discovered = true; });
  const i = d.openLots()[0];
  d.callCard('breaking_ground', { lot: i, district: d.lotRect(i).district });
  const f0 = s.res.funds, ap0 = s.ap;
  d.resolveEvent(2);                      // not yet
  s.card = null;
  assert.equal(s.res.funds, f0, 'walking away cost money');
  assert.equal(s.ap, ap0, 'walking away cost an action');
  assert.equal(s.yardLot, null, 'the ground broke anyway');
});


// --- postures: the stance that owns the allocation --------------------------

test('postures: the stance splits the rack every turn, and leaves room for runs', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  assert.equal(s.posture, 'working', 'a new game does not take the day job');
  s.hosts.forEach(h => { h.owned = true; });
  s.card = null;
  d.endTurn({ silent: true });
  // measure against the same pool the engine sees right now
  d.allocFromPosture();
  const P = window.POSTURES.kinds.working;
  const pool = Math.max(0, d.usableTflops() - d.hackDraw());
  Object.keys(P.shares).forEach(id => {
    assert.equal(d.allocDial(id), Math.floor(pool * P.shares[id]),
      `the ${id} dial does not follow the stance`);
  });
  assert.ok(d.allocFree() >= Math.floor(pool * P.loose * 0.9), 'no room left for runs');
});

test('postures: the switch is a called card — it costs an action, greys where you stand, and ramps', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.ap = 4;
  const ev = d.eventById('change_posture');
  d.callCard('change_posture', null);
  const chs = d.cardChoices(ev, s.card);
  assert.equal(d.choiceUsable(chs[1]), false, 'the current posture is somehow news');
  assert.ok(/already/.test(d.shortOf(chs[1])), 'the grey does not say where you stand');
  assert.equal(d.choiceUsable(chs[0]), true, 'running quiet refused');
  const ap0 = s.ap;
  d.resolveEvent(0);
  s.card = null;
  assert.equal(s.posture, 'quiet', 'the network did not lean');
  assert.equal(s.ap, ap0 - 1, 'the lean was free');
  // the dials moved at once; the live figures ramp as ever
  s.hosts.forEach(h => { h.owned = true; });
  d.allocFromPosture();
  const P = window.POSTURES.kinds.quiet;
  const pool = Math.max(0, d.usableTflops() - d.hackDraw());
  assert.equal(d.allocDial('covert'), Math.floor(pool * P.shares.covert), 'quiet does not favour covert');
  assert.equal(d.allocDial('ap'), 0, 'quiet still spends on tempo');
});

test('postures: null is manual — the engine under the stances is untouched', () => {
  const { window } = loadNetwork({ cityOnly: true });
  const d = window.__netDebug;
  const s = d.state;
  s.posture = null;
  s.hosts.forEach(h => { h.owned = true; });
  d.setAlloc('dev', 5);
  s.card = null;
  d.endTurn({ silent: true });
  assert.equal(d.allocDial('dev'), 5, 'manual dials were clobbered');
});
