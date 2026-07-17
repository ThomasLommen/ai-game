(function(){
  window.Game = window.Game || {};

  // ── Game.standoffRuntime — the build-vs-threat comparison screen that replaced the
  // swarm-battle minigame (the no-swarm fork). No live fight: a terminal SCAN readout
  // (Game.draft.compare) lines up YOUR STRENGTH against a THREAT profile row by row, then
  // one commit. The roll is graded by margin from the odds threshold into four tiers —
  // overwhelming / clean / narrow / blown — instead of a flat win/lose, so there's texture
  // in the result even though there's no minigame. Used for both the tutorial "first
  // contact" (main.js) and ambushes (traps-runtime.js) — same screen, different threat data.
  let activeFlag = false;

  function active() { return activeFlag; }

  // ── YOUR STRENGTH — adapted from the old battle.js buildSnapshot() formula: threads +
  // agents (count/levels) + adaptations + Coherence. No FLOPS/roster-specific terms left
  // (those only ever mattered to the swarm fight). ──
  function yourStrength() {
    const s = Game.save.state;
    const threads = (Game.tasksRuntime && Game.tasksRuntime.getCpu) ? (Game.tasksRuntime.getCpu().total || 0) : 0;
    const agentsList = (Game.agents && Game.agents.roster) ? Game.agents.roster() : [];
    const agentPower = agentsList.reduce((a, g) => a + (g.level || 1), 0);
    const adapt = (Game.changers && Game.changers.count) ? Game.changers.count() : 0;
    const coh = Math.max(0, (s.resources && s.resources.insight) || 0);
    const exposure = Math.max(0, s.exposure || 0);
    let compute = threads * 8 + agentPower * 10 + adapt * 6 + Math.sqrt(coh) * 1.8;
    let stealth = Math.max(5, 100 - exposure * 3);
    // Subroutines drafted from the old battle feed (bst/combat_heuristics) now grant
    // these directly through the effects pipeline, same as every other stat in the game.
    compute = Game.effects ? Game.effects.apply(compute, 'standoff.compute') : compute;
    stealth = Game.effects ? Game.effects.apply(stealth, 'standoff.stealth') : stealth;
    compute = Math.round(compute);
    stealth = Math.max(5, Math.round(stealth));
    return { compute, stealth, adaptations: adapt, agents: agentsList.length };
  }

  // ── odds ──
  function computeOdds(you, threat) {
    const computeEdge = (you.compute - threat.power) / Math.max(1, threat.power);
    let odds = 0.5 + computeEdge * 0.4;
    odds += (you.stealth - threat.alertness) / 400;
    return Math.max(0.05, Math.min(0.95, odds));
  }
  // The scan readout's rows — each a real you-vs-them pair (adaptations has no threat
  // analog, so it always reads as your edge). Ties render as your favor.
  function compareRows(you, threat) {
    return [
      { label: 'compute', you: you.compute, them: threat.power, adv: you.compute >= threat.power ? 'you' : 'them' },
      { label: 'stealth', you: you.stealth, them: threat.alertness, adv: you.stealth >= threat.alertness ? 'you' : 'them' },
      { label: 'adaptations', you: you.adaptations, them: null, adv: you.adaptations > 0 ? 'you' : 'them' },
    ];
  }
  function verdictFor(odds) {
    if (odds >= 0.65) return 'favorable — go.';
    if (odds >= 0.35) return 'uncertain, but worth the risk.';
    return 'this could go badly.';
  }

  // opts: { kicker, title, body, threat: {power, alertness, classLabel, alertLabel,
  // numbersLabel}, engageLabel }. onResolve({ result: 'won'|'lost', tier, odds }).
  function begin(opts, onResolve) {
    if (activeFlag) return false;
    if (!Game.draft || !Game.draft.compare) { if (onResolve) onResolve({ result: 'won', tier: 'clean', odds: 1 }); return true; }
    const you = yourStrength();
    const threat = Object.assign({ power: 100, alertness: 50, alertLabel: 'alertness', classLabel: 'unknown', numbersLabel: 'unknown' }, opts.threat || {});
    const odds = computeOdds(you, threat);
    activeFlag = true;
    Game.draft.compare({
      kicker: opts.kicker || 'STANDOFF',
      title: opts.title || threat.classLabel,
      body: opts.body || '',
      rows: compareRows(you, threat),
      oddsPct: odds * 100,
      verdict: verdictFor(odds),
      engageLabel: opts.engageLabel || '[ engage ]',
      onEngage: () => { activeFlag = false; resolve(odds, onResolve); }
    });
    return true;
  }

  function resolve(odds, onResolve) {
    const roll = Game.rng.next();
    const margin = odds - roll;
    const won = margin >= 0;
    const tier = won ? (margin > 0.25 ? 'overwhelming' : 'clean') : (margin > -0.25 ? 'narrow' : 'blown');
    if (onResolve) onResolve({ result: won ? 'won' : 'lost', tier, odds });
  }

  Game.standoffRuntime = { active, begin, yourStrength, computeOdds };
})();
