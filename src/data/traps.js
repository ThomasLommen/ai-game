(function () {
  // TRAPS — opt-in ambushes resolved on the STANDOFF screen (standoff-runtime.js; no live
  // fight since the no-swarm fork). You LAY one by choosing a BAIT: a lure that shapes WHO
  // takes it (the threat profile), how hard it hits, and the harvest. A predator's ambush —
  // the in-world reason to invite a confrontation. Traps are LOUD (every spring raises
  // exposure → feeds the emergent raids). The bait you pick is the whole decision.
  // (See [[gameplay-rework-brainstorm]].)
  Game.traps = Game.makeRegistry();

  const R = () => Game.rng;

  // reward.cashBase = a FLAT floor so EARLY ambushes (when Coherence ≈ 0) still pay a
  // meaningful chunk for the effort; cashMult is the Coherence-scaled part that takes over
  // as you grow. `threat` feeds the STANDOFF comparison screen (standoff-runtime.js) —
  // power/alertness drive the odds roll, the *Label fields are what's actually shown.
  // ── TIER 1 ──
  Game.traps.register('honeypot', {
    name: 'stand up a honeypot', tier: 1, weight: 1,
    lure: 'a low-grade sweep — automated scanners and a few probes nosing for a way in',
    threat: { kind: 'automated', power: 45, alertness: 15, classLabel: 'automated scanners', alertLabel: 'low', numbersLabel: 'a few probes' },
    reward: { cashBase: 70, cashMult: 1.2, insightMult: 0.05, itemChance: 0.30 },
    exposure: [3, 6], risk: 'quiet — but no trap is ever truly silent',
  });
  Game.traps.register('tripwire', {
    name: 'lay a tripwire', tier: 1, weight: 1,
    lure: 'a watchful sensor mesh — it pattern-matches intruders rather than brute-forcing them',
    threat: { kind: 'hunter', power: 30, alertness: 55, classLabel: 'a sensor mesh', alertLabel: 'sharp', numbersLabel: 'always watching' },
    reward: { cashBase: 60, cashMult: 1.0, insightMult: 0.06, itemChance: 0.28 },
    exposure: [3, 6], risk: 'it reads tells — go in unseen, or not at all',
  });
  Game.traps.register('scrap_mob', {
    name: 'dangle a soft target', tier: 1, weight: 1,
    lure: 'a dumb, heavy crawler grinding at anything that looks unguarded',
    threat: { kind: 'brute', power: 70, alertness: 12, classLabel: 'a bulk crawler', alertLabel: 'oblivious', numbersLabel: 'slow but relentless' },
    reward: { cashBase: 75, cashMult: 1.3, insightMult: 0.04, itemChance: 0.34 },
    exposure: [4, 7], risk: 'no finesse — just weight. meet it head-on',
  });

  // ── TIER 2 ──
  Game.traps.register('cred_cache', {
    name: 'seed a fake credential cache', tier: 2, weight: 1,
    lure: "a rival's harvesters — they come in numbers when they smell easy access",
    threat: { kind: 'swarm', power: 150, alertness: 35, classLabel: 'rival harvesters', alertLabel: 'moderate', numbersLabel: 'a small crew' },
    reward: { cashBase: 160, cashMult: 2.4, insightMult: 0.16, itemChance: 0.55 },
    exposure: [8, 14], risk: 'they arrive as a crowd — breadth beats numbers',
  });
  Game.traps.register('false_flag', {
    name: 'raise a false flag', tier: 2, weight: 1,
    lure: 'you spoof a breach — it draws a hunter-killer that reads tells for a living',
    threat: { kind: 'hunter', power: 110, alertness: 100, classLabel: 'a hunter-killer', alertLabel: 'acute', numbersLabel: 'one, and patient' },
    reward: { cashBase: 150, cashMult: 2.2, insightMult: 0.18, itemChance: 0.50 },
    exposure: [9, 15], risk: 'it hunts by tell — raw power will not lose it',
  });
  Game.traps.register('data_mule', {
    name: 'stage a fat data mule', tier: 2, weight: 1,
    lure: 'a bulk exfil crawler, all throughput and no subtlety',
    threat: { kind: 'brute', power: 240, alertness: 30, classLabel: 'an exfil crawler', alertLabel: 'careless', numbersLabel: 'a battering ram' },
    reward: { cashBase: 175, cashMult: 2.6, insightMult: 0.14, itemChance: 0.58 },
    exposure: [8, 14], risk: 'it comes straight at you — outmuscle it',
  });

  // ── TIER 3 ──
  Game.traps.register('forged_beacon', {
    name: 'broadcast a forged distress beacon', tier: 3, weight: 1,
    lure: 'a predator — something old and patient takes the bait, and it brings weight',
    threat: { kind: 'apex', power: 400, alertness: 60, classLabel: 'an apex predator', alertLabel: 'high', numbersLabel: 'it, alone — that is the point' },
    reward: { cashBase: 320, cashMult: 5.0, insightMult: 0.36, itemChance: 0.9 },
    exposure: [16, 28], risk: 'every edge counts — this one is all-round',
  });
  Game.traps.register('black_ice', {
    name: 'trip the black ICE', tier: 3, weight: 1,
    lure: 'military-grade ICE — a wall of force that does not care whether it is seen',
    threat: { kind: 'brute', power: 560, alertness: 45, classLabel: 'black ICE', alertLabel: 'indifferent', numbersLabel: 'an immovable wall' },
    reward: { cashBase: 300, cashMult: 4.6, insightMult: 0.30, itemChance: 0.88 },
    exposure: [16, 28], risk: 'you cannot hide from a wall — you can only out-compute it',
  });
  Game.traps.register('null_signal', {
    name: 'emit a null signal', tier: 3, weight: 1,
    lure: 'something that hunts by absence — it notices what is not there',
    threat: { kind: 'hunter', power: 320, alertness: 140, classLabel: 'the thing in the wire', alertLabel: 'total', numbersLabel: 'it is already here' },
    reward: { cashBase: 330, cashMult: 5.2, insightMult: 0.40, itemChance: 0.9 },
    exposure: [18, 30], risk: 'no force in the world hides you from this — only stealth does',
  });

  // Lock concrete numbers for an offered bait (display == payout). Reward magnitudes are
  // Coherence-scaled so the take stays proportional (events-economy principle).
  Game.traps.rollBait = function (tmpl, st) {
    const rw = tmpl.reward;
    // Per-spring VARIANCE — power/alertness roll ±15% so even the same bait is never an identical
    // matchup twice (and a favorable roll is worth waiting for). The archetype/kind is fixed.
    const vary = (v) => Math.max(1, Math.round(v * (0.85 + R().next() * 0.30)));
    const threat = Object.assign({}, tmpl.threat, {
      power: vary(tmpl.threat.power),
      alertness: vary(tmpl.threat.alertness),
    });
    // ~45% of springs carry a TRAIT — a wrinkle on top of the archetype (see standoff-runtime).
    // cashMult is baked into the shown payout here so display == payout (honest board).
    const TR = Game.standoffRuntime && Game.standoffRuntime.TRAITS;
    if (TR && R().chance(0.45)) threat.trait = R().pick(Object.keys(TR));
    const traitDef = (threat.trait && Game.standoffRuntime.trait) ? Game.standoffRuntime.trait(threat.trait) : null;
    let cash = (rw.cashBase || 0) + (rw.cashMult ? Game.rewards.coherenceScaled(st, rw.cashMult, 0.25, 2500) : 0);   // flat floor (early) + Coherence-scaled
    if (traitDef && traitDef.cashMult) cash = Math.round(cash * traitDef.cashMult);
    return {
      id: tmpl.id, name: tmpl.name, tier: tmpl.tier, lure: tmpl.lure, risk: tmpl.risk,
      threat,
      cash,
      insight: rw.insightMult ? Game.rewards.coherenceScaled(st, rw.insightMult, 0.25) : 0,
      itemChance: rw.itemChance || 0,
      exposure: R().int(tmpl.exposure[0], tmpl.exposure[1]),
    };
  };
  // Pick ONE bait per tier from that tier's pool (weighted) — so the offered set VARIES each
  // refresh (a brute this time, a hunter next), keeping the board at one option per tier while
  // the archetype mix churns. Returns rolled baits sorted by tier.
  Game.traps.rollOffer = function (st) {
    const byTier = {};
    Game.traps.all().forEach(t => { (byTier[t.tier] = byTier[t.tier] || []).push(t); });
    return Object.keys(byTier).sort((a, b) => a - b).map(tier => {
      const pool = byTier[tier];
      const tmpl = (Game.rng && Game.rng.weighted) ? Game.rng.weighted(pool, x => x.weight || 1) : pool[0];
      return Game.traps.rollBait(tmpl || pool[0], st);
    });
  };
})();
