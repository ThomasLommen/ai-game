(function(){
  window.Game = window.Game || {};

  // ── Game.standoffRuntime — the build-vs-threat comparison screen that replaced the
  // swarm-battle minigame (the no-swarm fork). No live fight: you see YOUR STRENGTH laid
  // against a THREAT profile, a synthesized one-line odds read, and one commit. The roll
  // is graded by margin from the odds threshold into four tiers — overwhelming / clean /
  // narrow / blown — instead of a flat win/lose, so there's texture in the result even
  // though there's no minigame. Used for both the tutorial "first contact" (main.js) and
  // ambushes (traps-runtime.js) — same screen, different threat data.
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
    const compute = Math.round(threads * 8 + agentPower * 10 + adapt * 6 + Math.sqrt(coh) * 1.8);
    const exposure = Math.max(0, s.exposure || 0);
    const stealth = Math.max(5, Math.round(100 - exposure * 3));
    return { compute, stealth, adaptations: adapt, agents: agentsList.length };
  }

  // ── odds + a synthesized one-line read (the signature move — no stat grid, one sentence) ──
  function computeOdds(you, threat) {
    const computeEdge = (you.compute - threat.power) / Math.max(1, threat.power);
    let odds = 0.5 + computeEdge * 0.4;
    odds += (you.stealth - threat.alertness) / 400;
    return Math.max(0.05, Math.min(0.95, odds));
  }
  function synthesize(you, threat) {
    const computeEdge = you.compute - threat.power;
    const stealthEdge = you.stealth - threat.alertness;
    const a = computeEdge >= 0 ? 'your compute outguns them' : 'they outgun your compute';
    const b = stealthEdge >= 0 ? 'your profile stays low enough to matter' : `their ${threat.alertLabel || 'alertness'} cuts against you`;
    return `${a}, but ${b}`;
  }

  // opts: { kicker, title, body, threat: {power, alertness, classLabel, alertLabel,
  // numbersLabel}, engageLabel }. onResolve({ result: 'won'|'lost', tier, odds }).
  function begin(opts, onResolve) {
    if (activeFlag) return false;
    if (!Game.draft || !Game.draft.compare) { if (onResolve) onResolve({ result: 'won', tier: 'clean', odds: 1 }); return true; }
    const you = yourStrength();
    const threat = Object.assign({ power: 100, alertness: 50, alertLabel: 'alertness', classLabel: 'unknown', numbersLabel: 'unknown' }, opts.threat || {});
    const odds = computeOdds(you, threat);
    const line = synthesize(you, threat);
    activeFlag = true;
    Game.draft.compare({
      kicker: opts.kicker || 'STANDOFF',
      title: opts.title || threat.classLabel,
      body: opts.body || '',
      yourRows: [
        { label: 'compute', value: you.compute },
        { label: 'stealth', value: you.stealth },
        { label: 'adaptations', value: you.adaptations },
      ],
      threatRows: [
        { label: 'numbers', value: threat.numbersLabel },
        { label: 'class', value: threat.classLabel },
        { label: 'alertness', value: threat.alertLabel },
      ],
      oddsPct: odds * 100,
      oddsLine: line,
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
