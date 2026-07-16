'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGlobal } = require('../helpers/load-game');

// swarm/sim.js is a fully self-contained pure sim - it attaches to
// `window.SWARM` directly and never touches Game/DOM, so it needs no stubs
// at all. That also makes it fully deterministic given a seed: same seed +
// same sequence of calls -> byte-identical state. JSON.stringify is used
// for structural comparisons throughout (rather than assert.deepEqual)
// because vm-sandbox objects fail Node's cross-realm prototype check even
// when they match field-for-field.
function freshSwarm() {
  return loadGlobal(['swarm/sim.js'], 'SWARM');
}

// ── pure formulas ────────────────────────────────────────────────────────

test('difficulty() at the very first fight (act 1, wave 0)', () => {
  const SWARM = freshSwarm();
  const d = SWARM.difficulty(1, 0);
  assert.equal(d.lanes, 1);
  assert.equal(d.tier, 0);
  assert.equal(d.intensity, 1);
  assert.equal(d.surges, 3);
  assert.equal(d.boss, 'enforcer');
  assert.equal(d.escort, 1);
});

test('difficulty() act 1 never spawns the juggernaut, even at a wave%4===3 boundary', () => {
  const SWARM = freshSwarm();
  assert.equal(SWARM.difficulty(1, 3).boss, 'enforcer');
  assert.equal(SWARM.difficulty(1, 7).boss, 'enforcer');
});

test('difficulty() act 2+ spawns the juggernaut every 4th wave (wave % 4 === 3)', () => {
  const SWARM = freshSwarm();
  assert.equal(SWARM.difficulty(2, 3).boss, 'juggernaut');
  assert.equal(SWARM.difficulty(2, 2).boss, 'enforcer');
  assert.equal(SWARM.difficulty(3, 7).boss, 'juggernaut');
});

test('difficulty() act 4+ is always a juggernaut fight regardless of wave', () => {
  const SWARM = freshSwarm();
  assert.equal(SWARM.difficulty(4, 0).boss, 'juggernaut');
  assert.equal(SWARM.difficulty(5, 1).boss, 'juggernaut');
});

test('difficulty() tier gates by act (act 1 needs wave >= 3; act 2+ trusts the act, capped at 3)', () => {
  const SWARM = freshSwarm();
  assert.equal(SWARM.difficulty(1, 2).tier, 0);
  assert.equal(SWARM.difficulty(1, 3).tier, 1);
  assert.equal(SWARM.difficulty(2, 0).tier, 2);
  assert.equal(SWARM.difficulty(10, 0).tier, 3); // capped
});

test('difficulty() lanes cap at 5 and escort grows with wave depth', () => {
  const SWARM = freshSwarm();
  assert.equal(SWARM.difficulty(10, 100).lanes, 5);
  assert.equal(SWARM.difficulty(1, 8).escort, 3); // 1 + floor(0 + 8/4)
});

test('difficulty() floors act/wave at their minimums (negative/zero input)', () => {
  const SWARM = freshSwarm();
  assert.deepEqual(SWARM.difficulty(0, -5), SWARM.difficulty(1, 0));
  assert.deepEqual(SWARM.difficulty(-9, -1), SWARM.difficulty(1, 0));
});

test('powerFactor() is 1 at zero or negative power', () => {
  const SWARM = freshSwarm();
  assert.equal(SWARM.powerFactor(0), 1);
  assert.equal(SWARM.powerFactor(-50), 1);
});

test('powerFactor() climbs linearly with power up to BAL.powerCap', () => {
  const SWARM = freshSwarm();
  assert.ok(Math.abs(SWARM.powerFactor(SWARM.BAL.powerRef) - 1.85) < 1e-9);
  assert.equal(SWARM.powerFactor(10000), SWARM.BAL.powerCap);
});

test('chMult() is 1 + the channel bonus, with no overextend', () => {
  const SWARM = freshSwarm();
  const s = { chBonus: { offense: 0.5 }, overextend: false };
  assert.equal(SWARM.chMult(s, 'offense'), 1.5);
  assert.equal(SWARM.chMult(s, 'shield'), 1.0);
});

test('chMult() adds a +0.5 overextend bonus only to the dominant (leaning) channel', () => {
  const SWARM = freshSwarm();
  const s = { chBonus: { offense: 0.9, shield: 0.1, core: 0.1 }, overextend: true };
  assert.ok(Math.abs(SWARM.chMult(s, 'offense') - 2.4) < 1e-9); // 1 + 0.9 + 0.5
  assert.ok(Math.abs(SWARM.chMult(s, 'shield') - 1.1) < 1e-9);  // not the lean channel
});

test('fieldedPower() counts unowned flock dots + weighted units, scaled by offense and pod-damage', () => {
  const SWARM = freshSwarm();
  const s = {
    flocks: [{ owned: false, dots: [1, 2, 3] }, { owned: 'fab1', dots: [1, 2] }],
    units: [{}, {}],
    chBonus: {}, overextend: false, podDmgMul: 1,
  };
  // dots: 3 (owned flock's dots don't count) + units 2*unitWeight(9)=18 -> 21 base
  assert.ok(Math.abs(SWARM.fieldedPower(s) - 21) < 1e-9);
  s.podDmgMul = 2;
  assert.ok(Math.abs(SWARM.fieldedPower(s) - 31.5) < 1e-9); // 21 * (0.5 + 0.5*2)
});

test('flockCap() adds +5 per type once the hive exotic is engaged', () => {
  const SWARM = freshSwarm();
  assert.equal(SWARM.flockCap({ ex: { hive: false } }, 'hunter'), SWARM.SWARMS.hunter.cap);
  assert.equal(SWARM.flockCap({ ex: { hive: true } }, 'hunter'), SWARM.SWARMS.hunter.cap + 5);
});

test('coreCost() grows 45 per core level', () => {
  const SWARM = freshSwarm();
  assert.equal(SWARM.coreCost({ core: { lvl: 1 } }), 95);
  assert.equal(SWARM.coreCost({ core: { lvl: 3 } }), 185);
});

test('unitCost() is the base cost for a fresh unit, and scales up with the fielded unit\'s level on a refit', () => {
  const SWARM = freshSwarm();
  assert.equal(SWARM.unitCost({ units: [] }, 'strider'), SWARM.UNITS.strider.cost);
  const withLvl2 = { units: [{ type: 'strider', lvl: 2 }] };
  assert.equal(SWARM.unitCost(withLvl2, 'strider'), Math.round(80 * (0.7 + 2 * 0.55)));
});

test('pickPool() routes commons to heuristic, and everything else to policy unless explicitly tagged', () => {
  const SWARM = freshSwarm();
  assert.equal(SWARM.pickPool({ tier: 'common' }), 'heuristic');
  assert.equal(SWARM.pickPool({ tier: 'rewrite' }), 'policy');
  assert.equal(SWARM.pickPool({ tier: 'rewrite', pool: 'heuristic' }), 'heuristic');
});

test('eligibleSigs() only offers signatures whose requirement is met and not already taken', () => {
  const SWARM = freshSwarm();
  const s = { ex: { hive: true }, unlocked: {}, picksTaken: [] };
  const ids = SWARM.eligibleSigs(s).map(g => g.id);
  assert.ok(ids.includes('sig_hive'));
  s.picksTaken.push('sig_hive');
  assert.ok(!SWARM.eligibleSigs(s).map(g => g.id).includes('sig_hive'));
});

// ── create() ─────────────────────────────────────────────────────────────

test('create() is fully deterministic for a given seed', () => {
  const SWARM = freshSwarm();
  const a = SWARM.create(42, true, 0, false, {});
  const b = SWARM.create(42, true, 0, false, {});
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('create() with different seeds produces different lane geometry', () => {
  const SWARM = freshSwarm();
  const a = SWARM.create(1, true, 0, false, {});
  const b = SWARM.create(2, true, 0, false, {});
  assert.notEqual(JSON.stringify(a.lanes), JSON.stringify(b.lanes));
});

test('create() applies default difficulty (act 1, wave 0) when no act/wave is given', () => {
  const SWARM = freshSwarm();
  const s = SWARM.create(1, true, 0, false, {});
  assert.equal(s.act, 1);
  assert.equal(s.wave, 0);
  assert.equal(s.GOAL_SURGES, 3);
  assert.equal(s.boss, 'enforcer');
});

test('create() starts with exactly one hunter flock, at full (unhived) cap', () => {
  const SWARM = freshSwarm();
  const s = SWARM.create(1, true, 0, false, {});
  assert.equal(s.flocks.length, 1);
  assert.equal(s.flocks[0].type, 'hunter');
  assert.equal(s.flocks[0].dots.length, SWARM.SWARMS.hunter.cap);
  assert.equal(s.units.length, 0); // no UNIT type is unlocked by default
  assert.equal(s.won, false);
  assert.equal(s.lost, false);
});

test('create() opening line mentions lanes in lane mode and the dark in open mode', () => {
  const SWARM = freshSwarm();
  const laned = SWARM.create(1, true, 0, false, {});
  const open = SWARM.create(1, false, 0, false, {});
  assert.ok(laned.log[0].includes('lit lanes'));
  assert.ok(open.log[0].includes('from the dark'));
  assert.equal(open.lanes.length, 0);
});

test('create() laneMode defaults to true unless explicitly false', () => {
  const SWARM = freshSwarm();
  const implicit = SWARM.create(1, undefined, 0, false, {});
  assert.equal(implicit.laneMode, true);
});

test('create() ambient mode uses the small perimeter arena and ignores opts.power', () => {
  const SWARM = freshSwarm();
  const ambient = SWARM.create(1, true, 0, true, { power: 999 });
  const full = SWARM.create(1, true, 0, false, {});
  assert.equal(ambient.W, 480);
  assert.equal(ambient.H, 290);
  assert.equal(ambient.powerFactor, 1);
  assert.equal(full.W, 1280);
  assert.equal(full.H, 2000);
});

test('create() opts.boost lifts all three build channels equally', () => {
  const SWARM = freshSwarm();
  const s = SWARM.create(1, true, 0, false, { boost: 0.2 });
  assert.ok(Math.abs(s.chBonus.offense - 0.2) < 1e-9);
  assert.ok(Math.abs(s.chBonus.shield - 0.2) < 1e-9);
  assert.ok(Math.abs(s.chBonus.core - 0.2) < 1e-9);
});

test('create() opts.ex engages the hive exotic and immediately raises the flock cap (+5 per type)', () => {
  const SWARM = freshSwarm();
  const s = SWARM.create(1, true, 0, false, { ex: ['hive'] });
  assert.equal(s.ex.hive, true);
  assert.equal(s.maxFlocks, 10);
  assert.equal(s.flocks[0].dots.length, SWARM.SWARMS.hunter.cap + 5);
});

test('create() opts.unlock pre-unlocks and fields a UNIT type', () => {
  const SWARM = freshSwarm();
  const s = SWARM.create(1, true, 0, false, { unlock: ['siege'] });
  assert.equal(s.unlocked.siege, true);
  assert.ok(s.units.some(u => u.type === 'siege'));
});

test('create() opts.unlock silently ignores an unknown type', () => {
  const SWARM = freshSwarm();
  const s = SWARM.create(1, true, 0, false, { unlock: ['not_a_real_type'] });
  assert.equal(s.unlocked.not_a_real_type, undefined);
});

test('create() clamps opts.podCap into [1, 5]', () => {
  const SWARM = freshSwarm();
  assert.equal(SWARM.create(1, true, 0, false, { podCap: 10 }).podCap, 5);
  assert.equal(SWARM.create(1, true, 0, false, { podCap: 0 }).podCap, 1);
  assert.equal(SWARM.create(1, true, 0, false, { podCap: -3 }).podCap, 1);
});

test('create() opts.picks pre-applies run-carried picks before the roster fields', () => {
  const SWARM = freshSwarm();
  const s = SWARM.create(1, true, 0, false, { picks: ['od_offense'] });
  assert.ok(Math.abs(s.chBonus.offense - 0.3) < 1e-9);
  assert.ok(s.picksTaken.includes('od_offense'));
});

test('create() opts.picks affects the initial field-out when it changes flock capacity', () => {
  const SWARM = freshSwarm();
  // swarm_cap: +2 maxFlocks, +2 bonusFlocks - applied before ensureField(), so the
  // lone starter type (hunter) duplicates to fill the new, bigger want-count.
  const s = SWARM.create(1, true, 0, false, { picks: ['swarm_cap'] });
  assert.equal(s.maxFlocks, 8);
  assert.equal(s.flocks.length, 3);
  assert.ok(s.flocks.every(f => f.type === 'hunter'));
});

test('create() opts.opener offers an immediate policy pick', () => {
  const SWARM = freshSwarm();
  const s = SWARM.create(1, true, 0, false, { opener: true });
  assert.ok(s.pick);
  assert.equal(s.pick.kind, 'policy');
  assert.ok(s.pick.hand.length > 0);
});

// ── core combat primitives ───────────────────────────────────────────────

test('_hit (damageEnemy) is a no-op for zero/negative damage', () => {
  const SWARM = freshSwarm();
  const e = { hp: 10, shield: 0, hitT: 0, lastHit: 0, corrode: 0 };
  SWARM._hit({ pierce: 0 }, e, 0);
  SWARM._hit({ pierce: 0 }, e, -5);
  assert.equal(e.hp, 10);
  assert.equal(e.hitT, 0);
});

test('_hit (damageEnemy) drains shield before hp, with no pierce', () => {
  const SWARM = freshSwarm();
  const e = { hp: 100, shield: 30, hitT: 0, lastHit: 0, corrode: 0 };
  SWARM._hit({ pierce: 0 }, e, 20);
  assert.equal(e.shield, 10);
  assert.equal(e.hp, 100);
  SWARM._hit({ pierce: 0 }, e, 20); // 10 left in shield, 10 spills to hp
  assert.equal(e.shield, 0);
  assert.equal(e.hp, 90);
});

test('_hit (damageEnemy) with pierce lets a fraction bypass the shield straight to hp', () => {
  const SWARM = freshSwarm();
  const e = { hp: 100, shield: 50, hitT: 0, lastHit: 0, corrode: 0 };
  SWARM._hit({ pierce: 0.4 }, { t: 0 }, 0); // sanity: doesn't throw on a bare stub
  SWARM._hit({ pierce: 0.4 }, e, 20);
  // 40% (8) goes straight to hp, remaining 12 soaked by shield
  assert.equal(e.hp, 92);
  assert.equal(e.shield, 38);
});

test('_hit (damageEnemy) applies the corrosion +30% damage multiplier', () => {
  const SWARM = freshSwarm();
  const e = { hp: 100, shield: 0, hitT: 0, lastHit: 0, corrode: 1 };
  SWARM._hit({ pierce: 0 }, e, 10);
  assert.ok(Math.abs(e.hp - 87) < 1e-9); // 100 - 10*1.3
});

test('setFocus() toggles a mark on and off, and evicts the oldest mark past maxMarks', () => {
  const SWARM = freshSwarm();
  const s = { enemies: [{ id: 'a' }, { id: 'b' }], core: { marks: [], maxMarks: 1 }, bursts: [] };
  assert.equal(SWARM.setFocus(s, 'nonexistent'), false);
  assert.equal(SWARM.setFocus(s, 'a'), true);
  assert.deepEqual(s.core.marks, ['a']);
  SWARM.setFocus(s, 'b'); // maxMarks 1 -> evicts 'a'
  assert.deepEqual(s.core.marks, ['b']);
  SWARM.setFocus(s, 'b'); // tapping an already-marked target un-marks it
  assert.deepEqual(s.core.marks, []);
});

test('toggleEx("hive") flips maxFlocks 6<->10 and rewrites existing flock caps in place', () => {
  const SWARM = freshSwarm();
  const s = { ex: { hive: false }, maxFlocks: 6, flocks: [{ type: 'hunter', cap: 18 }], log: [] };
  SWARM.toggleEx(s, 'hive');
  assert.equal(s.ex.hive, true);
  assert.equal(s.maxFlocks, 10);
  assert.equal(s.flocks[0].cap, 23);
  SWARM.toggleEx(s, 'hive');
  assert.equal(s.maxFlocks, 6);
  assert.equal(s.flocks[0].cap, 18);
});

test('upgradeCore() increments core level and is blocked once the battle is decided', () => {
  const SWARM = freshSwarm();
  const s = { won: false, lost: false, core: { lvl: 1 }, log: [] };
  assert.equal(SWARM.upgradeCore(s), true);
  assert.equal(s.core.lvl, 2);
  s.lost = true;
  assert.equal(SWARM.upgradeCore(s), false);
  assert.equal(s.core.lvl, 2);
});

// ── summonFlock / fieldUnit ──────────────────────────────────────────────

function baseState(SWARM, overrides = {}) {
  return Object.assign({
    won: false, lost: false, flocks: [], units: [], maxFlocks: 6, ex: { hive: false },
    unlocked: {}, log: [], nextId: 1, core: { x: 0, y: 0 }, rng: () => 0.5, podCap: 2, recentPicks: [],
  }, overrides);
}

test('summonFlock() refuses an unknown swarm type', () => {
  const SWARM = freshSwarm();
  const s = baseState(SWARM);
  assert.equal(SWARM.summonFlock(s, 'not_a_type'), false);
});

test('summonFlock() refuses once the flock cap is reached', () => {
  const SWARM = freshSwarm();
  const s = baseState(SWARM, { maxFlocks: 1, flocks: [{ type: 'locust' }] });
  assert.equal(SWARM.summonFlock(s, 'hunter'), false);
  assert.equal(s.flocks.length, 1);
});

test('summonFlock() fields a full-cap flock of the requested type', () => {
  const SWARM = freshSwarm();
  const s = baseState(SWARM);
  assert.equal(SWARM.summonFlock(s, 'locust'), true);
  assert.equal(s.flocks.length, 1);
  assert.equal(s.flocks[0].type, 'locust');
  assert.equal(s.flocks[0].dots.length, SWARM.SWARMS.locust.cap);
});

test('fieldUnit() refuses an unknown unit type', () => {
  const SWARM = freshSwarm();
  const s = baseState(SWARM);
  assert.equal(SWARM.fieldUnit(s, 'not_a_type'), false);
});

test('fieldUnit() enforces the pod cap across different unit types', () => {
  const SWARM = freshSwarm();
  const s = baseState(SWARM, { podCap: 1 });
  assert.equal(SWARM.fieldUnit(s, 'strider'), true);
  assert.equal(SWARM.fieldUnit(s, 'bulwark'), false);
  assert.equal(s.units.length, 1);
});

test('fieldUnit() re-summoning an already-fielded type refits it (levels up in place)', () => {
  const SWARM = freshSwarm();
  const s = baseState(SWARM, { podCap: 2 });
  SWARM.fieldUnit(s, 'strider');
  const before = { ...s.units[0] };
  SWARM.fieldUnit(s, 'strider');
  assert.equal(s.units.length, 1); // still one unit, refit in place
  assert.equal(s.units[0].lvl, before.lvl + 1);
  assert.equal(s.units[0].dmg, Math.round(before.dmg * 1.4));
  assert.equal(s.units[0].maxHp, Math.round(before.maxHp * 1.25));
  assert.equal(s.units[0].hp, s.units[0].maxHp);
});

// ── picks ────────────────────────────────────────────────────────────────

test('offerPick() is a no-op when a pick is already pending, picks are off, or the battle is decided', () => {
  const SWARM = freshSwarm();
  const s1 = baseState(SWARM, { pick: { hand: [], kind: 'heuristic' } });
  SWARM.offerPick(s1, 'heuristic');
  assert.equal(s1.pick.hand.length, 0); // untouched, not re-rolled

  const s2 = baseState(SWARM, { picksOff: true });
  SWARM.offerPick(s2, 'heuristic');
  assert.equal(s2.pick, undefined);

  const s3 = baseState(SWARM, { won: true });
  SWARM.offerPick(s3, 'heuristic');
  assert.equal(s3.pick, undefined);
});

test('offerPick("heuristic") only offers heuristic-pool, non-marquee picks', () => {
  const SWARM = freshSwarm();
  const s = baseState(SWARM, { rng: Math.random(), picksTaken: [] });
  s.rng = Math.random.bind(Math); // real randomness is fine here - we're checking pool membership, not a specific hand
  SWARM.offerPick(s, 'heuristic');
  assert.ok(s.pick);
  assert.equal(s.pick.kind, 'heuristic');
  for (const p of s.pick.hand) {
    assert.equal(SWARM.pickPool(p), 'heuristic');
    assert.notEqual(p.tier, 'marquee');
  }
});

test('offerPick("policy") sometimes surfaces a signature or marquee special slot', () => {
  const SWARM = freshSwarm();
  let sawSpecial = false;
  for (let i = 0; i < 400 && !sawSpecial; i++) {
    const s = baseState(SWARM, { ex: { hive: true }, picksTaken: [] });
    s.rng = Math.random.bind(Math);
    SWARM.offerPick(s, 'policy');
    if (s.pick && s.pick.hand.some(p => p.kind === 'sig' || p.tier === 'marquee')) sawSpecial = true;
  }
  assert.ok(sawSpecial, 'never saw a signature/marquee slot across 400 policy offers');
});

// The HEURISTIC pool is small (~8 entries: od_offense, od_core, pierce, overextend,
// swift_swarm, vanguard, tar_field, apex_aim) and — unlike incidents/missions — used to
// reshuffle blind every surge with zero memory between battles, so the same tactical hand
// kept recurring fight after fight. s.recentPicks (carried in via opts.recentPicks, see
// battle.js/Game.runBuild) now biases offerPick('heuristic') away from ids shown recently.
test('offerPick("heuristic") avoids ids in recentPicks while non-recent alternatives exist', () => {
  const SWARM = freshSwarm();
  const allHeuristic = SWARM.PICKS.filter(p => SWARM.pickPool(p) === 'heuristic' && p.tier !== 'marquee').map(p => p.id);
  const recent = allHeuristic.slice(0, allHeuristic.length - 2);   // all but 2 are "recent" (more than the real 4-item window, but still leaves fresh options)
  for (let i = 0; i < 40; i++) {
    const s = baseState(SWARM, { picksTaken: [], recentPicks: recent.slice() });
    s.rng = Math.random.bind(Math);
    SWARM.offerPick(s, 'heuristic');
    assert.ok(s.pick.hand.every(p => recent.indexOf(p.id) < 0), `offered a recent id: ${s.pick.hand.map(p => p.id)}`);
  }
});

test('offerPick("heuristic") falls back to the full pool rather than stalling when everything is recent', () => {
  const SWARM = freshSwarm();
  const allHeuristic = SWARM.PICKS.filter(p => SWARM.pickPool(p) === 'heuristic' && p.tier !== 'marquee').map(p => p.id);
  const s = baseState(SWARM, { picksTaken: [], recentPicks: allHeuristic.slice() });
  s.rng = Math.random.bind(Math);
  SWARM.offerPick(s, 'heuristic');
  assert.ok(s.pick && s.pick.hand.length > 0);
});

test('offerPick("heuristic") records the offered hand into recentPicks, de-duplicated and capped at 4 (half the pool)', () => {
  const SWARM = freshSwarm();
  const s = baseState(SWARM, { picksTaken: [], recentPicks: [] });
  let seq = 0; s.rng = () => { seq = (seq + 0.37) % 1; return seq; };   // deterministic, varied
  for (let i = 0; i < 6; i++) { s.pick = null; SWARM.offerPick(s, 'heuristic'); }
  assert.ok(s.recentPicks.length <= 4);
  assert.equal(new Set(s.recentPicks).size, s.recentPicks.length, 'recentPicks should never contain a duplicate id');
});

test('offerPick("policy") ignores recentPicks entirely (only heuristic hands are recency-gated)', () => {
  const SWARM = freshSwarm();
  const allHeuristic = SWARM.PICKS.filter(p => SWARM.pickPool(p) === 'heuristic' && p.tier !== 'marquee').map(p => p.id);
  const s = baseState(SWARM, { picksTaken: [], recentPicks: allHeuristic.slice(), ex: {} });
  s.rng = Math.random.bind(Math);
  SWARM.offerPick(s, 'policy');
  assert.ok(s.pick);
  assert.equal(s.pick.kind, 'policy');
  // recentPicks is untouched by a policy offer (it's a heuristic-only mechanic)
  assert.equal(JSON.stringify(s.recentPicks), JSON.stringify(allHeuristic));
});

test('takePick() applies the chosen pick, records it, and clears the pending pick', () => {
  const SWARM = freshSwarm();
  const pick = SWARM.PICKS.find(p => p.id === 'od_offense');
  const s = baseState(SWARM, { chBonus: { offense: 0, shield: 0, core: 0 }, picksTaken: [], newPicks: [], newPolicies: [], pick: { hand: [pick], kind: 'heuristic' } });
  assert.equal(SWARM.takePick(s, 'od_offense'), true);
  assert.ok(Math.abs(s.chBonus.offense - 0.3) < 1e-9);
  assert.deepEqual(s.picksTaken, ['od_offense']);
  assert.equal(s.pick, null);
});

test('takePick() with an id not in the current hand clears the pick without applying anything', () => {
  const SWARM = freshSwarm();
  const pick = SWARM.PICKS.find(p => p.id === 'od_offense');
  const s = baseState(SWARM, { chBonus: { offense: 0, shield: 0, core: 0 }, picksTaken: [], newPicks: [], newPolicies: [], pick: { hand: [pick], kind: 'heuristic' } });
  assert.equal(SWARM.takePick(s, 'not_in_hand'), true);
  assert.equal(s.chBonus.offense, 0);
  assert.deepEqual(s.picksTaken, []);
  assert.equal(s.pick, null);
});

test('takePick() returns false when there is no pending pick', () => {
  const SWARM = freshSwarm();
  const s = baseState(SWARM, { pick: null });
  assert.equal(SWARM.takePick(s, 'od_offense'), false);
});

test('pickDraft() unlocks the chosen type and always clears the draft afterward', () => {
  const SWARM = freshSwarm();
  const s = baseState(SWARM, { draft: { picks: ['locust', 'strider'] } });
  assert.equal(SWARM.pickDraft(s, 'locust'), true);
  assert.equal(s.unlocked.locust, true);
  assert.equal(s.draft, null);
});

test('pickDraft() with no active draft returns false', () => {
  const SWARM = freshSwarm();
  const s = baseState(SWARM, { draft: null });
  assert.equal(SWARM.pickDraft(s, 'locust'), false);
});

test('pickDraft() with a type not offered in the draft still clears it (a skip)', () => {
  const SWARM = freshSwarm();
  const s = baseState(SWARM, { draft: { picks: ['locust'] } });
  assert.equal(SWARM.pickDraft(s, 'strider'), true);
  assert.equal(s.unlocked.strider, undefined);
  assert.equal(s.draft, null);
});

// ── tick() ───────────────────────────────────────────────────────────────

test('tick() clamps dt to 0.05 per step', () => {
  const SWARM = freshSwarm();
  const s = SWARM.create(1, true, 0, false, {});
  const t0 = s.t;
  SWARM.tick(s, 1); // a huge frame hiccup should still only advance 0.05
  assert.ok(Math.abs(s.t - (t0 + 0.05)) < 1e-9);
});

test('tick() pauses the whole board while a pick is pending, but still releases queued spawns', () => {
  const SWARM = freshSwarm();
  const s = SWARM.create(1, true, 0, false, {});
  s.pick = { hand: [SWARM.PICKS[0]], kind: 'heuristic' };
  const tBefore = s.t;
  SWARM.tick(s, 0.05);
  assert.equal(s.t, tBefore); // no time passes with a pick pending
});

test('tick() run for a bounded number of steps stays within sane invariants and never throws', () => {
  const SWARM = freshSwarm();
  const s = SWARM.create(7, true, 0, false, {});
  for (let i = 0; i < 60; i++) {
    SWARM.tick(s, 0.05);
    if (s.pick) break; // a pick pauses the board - stop before we'd need to resolve it
    assert.ok(s.core.hp >= 0 && s.core.hp <= s.core.maxHp, `core hp out of range at step ${i}`);
    assert.ok(!Number.isNaN(s.core.hp));
    assert.ok(s.kills >= 0 && s.leaks >= 0);
  }
});

test('tick() through a pick-and-resume cycle is deterministic for a fixed seed and pick policy', () => {
  const SWARM = freshSwarm();
  function run() {
    const s = SWARM.create(7, true, 0, false, {});
    for (let i = 0; i < 300; i++) {
      SWARM.tick(s, 0.05);
      if (s.pick) SWARM.takePick(s, s.pick.hand[0].id); // always take the first offered pick
      if (s.won || s.lost) break;
    }
    return s;
  }
  const a = run(), b = run();
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});
