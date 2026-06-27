(function () {
  // TRAPS — opt-in DEFENSE battles. You LAY an ambush by choosing a BAIT: a lure that
  // shapes WHO takes it (the battle's climax), how hard it gets, and the harvest. A
  // predator's ambush — the in-world reason to invite a fight. Traps are LOUD (every
  // spring raises exposure → feeds the emergent raids) and can OVER-DRAW (hook bigger
  // than baited). The bait you pick is the whole decision. (See [[gameplay-rework-brainstorm]].)
  Game.traps = Game.makeRegistry();

  const R = () => Game.rng;

  Game.traps.register('honeypot', {
    name: 'stand up a honeypot', tier: 1, weight: 1,
    lure: 'a low-grade sweep — automated scanners and a few probes nosing for a way in',
    battle: { surges: 3, boss: 'enforcer', escort: 2, compute: 220 },
    reward: { cashMult: 1.2, insightMult: 0.05, itemChance: 0.15, perKill: 0.9 },
    exposure: [3, 6], risk: 'quiet — but no trap is ever truly silent',
  });
  Game.traps.register('cred_cache', {
    name: 'seed a fake credential cache', tier: 2, weight: 1,
    lure: "a rival's harvesters — they come in numbers when they smell easy access",
    battle: { surges: 5, boss: 'enforcer', escort: 5, compute: 150 },
    reward: { cashMult: 2.4, insightMult: 0.16, itemChance: 0.55, perKill: 1.3 },
    exposure: [8, 14], risk: 'a heavier draw could arrive than you baited for',
  });
  Game.traps.register('forged_beacon', {
    name: 'broadcast a forged distress beacon', tier: 3, weight: 1,
    lure: 'a predator — something old and patient takes the bait, and it brings weight',
    battle: { surges: 8, boss: 'juggernaut', escort: 6, compute: 120 },
    reward: { cashMult: 5.0, insightMult: 0.36, itemChance: 0.9, perKill: 2.0 },
    exposure: [16, 28], risk: 'this screams across the network — expect heat after',
  });

  // Lock concrete numbers for an offered bait (display == payout). Reward magnitudes are
  // Coherence-scaled so the take stays proportional (events-economy principle); the
  // per-kill bounty is added at resolve from the actual body count.
  Game.traps.rollBait = function (tmpl, st) {
    const rw = tmpl.reward;
    return {
      id: tmpl.id, name: tmpl.name, tier: tmpl.tier, lure: tmpl.lure, risk: tmpl.risk,
      battle: Object.assign({}, tmpl.battle),
      cash: rw.cashMult ? Game.rewards.coherenceScaled(st, rw.cashMult, 0.25, 2500) : 0,   // steeper at scale — stays worth it deep in the game
      insight: rw.insightMult ? Game.rewards.coherenceScaled(st, rw.insightMult, 0.25) : 0,
      itemChance: rw.itemChance || 0, perKill: rw.perKill || 0,
      exposure: R().int(tmpl.exposure[0], tmpl.exposure[1]),
    };
  };
})();
