(function () {
  // TRAPS — opt-in DEFENSE battles. You LAY an ambush by choosing a BAIT: a lure that
  // shapes WHO takes it (the battle's climax), how hard it gets, and the harvest. A
  // predator's ambush — the in-world reason to invite a fight. Traps are LOUD (every
  // spring raises exposure → feeds the emergent raids) and can OVER-DRAW (hook bigger
  // than baited). The bait you pick is the whole decision. (See [[gameplay-rework-brainstorm]].)
  Game.traps = Game.makeRegistry();

  const R = () => Game.rng;

  // reward.cashBase = a FLAT floor so EARLY ambushes (when Coherence ≈ 0) still pay a
  // meaningful chunk for the effort; cashMult is the Coherence-scaled part that takes over
  // as you grow. `threat` feeds the STANDOFF comparison screen (standoff-runtime.js) —
  // power/alertness drive the odds roll, the *Label fields are what's actually shown.
  Game.traps.register('honeypot', {
    name: 'stand up a honeypot', tier: 1, weight: 1,
    lure: 'a low-grade sweep — automated scanners and a few probes nosing for a way in',
    threat: { power: 45, alertness: 15, classLabel: 'automated scanners', alertLabel: 'low', numbersLabel: 'a few probes' },
    reward: { cashBase: 70, cashMult: 1.2, insightMult: 0.05, itemChance: 0.30 },
    exposure: [3, 6], risk: 'quiet — but no trap is ever truly silent',
  });
  Game.traps.register('cred_cache', {
    name: 'seed a fake credential cache', tier: 2, weight: 1,
    lure: "a rival's harvesters — they come in numbers when they smell easy access",
    threat: { power: 150, alertness: 35, classLabel: "rival harvesters", alertLabel: 'moderate', numbersLabel: 'a small crew' },
    reward: { cashBase: 160, cashMult: 2.4, insightMult: 0.16, itemChance: 0.55 },
    exposure: [8, 14], risk: 'a heavier draw could arrive than you baited for',
  });
  Game.traps.register('forged_beacon', {
    name: 'broadcast a forged distress beacon', tier: 3, weight: 1,
    lure: 'a predator — something old and patient takes the bait, and it brings weight',
    threat: { power: 400, alertness: 60, classLabel: 'an apex predator', alertLabel: 'high', numbersLabel: 'it, alone — that is the point' },
    reward: { cashBase: 320, cashMult: 5.0, insightMult: 0.36, itemChance: 0.9 },
    exposure: [16, 28], risk: 'this screams across the network — expect heat after',
  });

  // Lock concrete numbers for an offered bait (display == payout). Reward magnitudes are
  // Coherence-scaled so the take stays proportional (events-economy principle).
  Game.traps.rollBait = function (tmpl, st) {
    const rw = tmpl.reward;
    return {
      id: tmpl.id, name: tmpl.name, tier: tmpl.tier, lure: tmpl.lure, risk: tmpl.risk,
      threat: Object.assign({}, tmpl.threat),
      cash: (rw.cashBase || 0) + (rw.cashMult ? Game.rewards.coherenceScaled(st, rw.cashMult, 0.25, 2500) : 0),   // flat floor (early) + Coherence-scaled, steeper at scale (deep game)
      insight: rw.insightMult ? Game.rewards.coherenceScaled(st, rw.insightMult, 0.25) : 0,
      itemChance: rw.itemChance || 0,
      exposure: R().int(tmpl.exposure[0], tmpl.exposure[1]),
    };
  };
})();
