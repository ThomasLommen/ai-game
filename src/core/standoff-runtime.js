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
    const d = strengthDetail();
    return { compute: d.compute, stealth: d.stealth, adaptations: d.adaptations, agents: d.agents };
  }

  // The full YOUR STRENGTH breakdown: the raw components that feed compute, the pre-effect
  // base, and the post-effect final (after Game.effects.apply). The STATS sheet renders this
  // so the player can see base → bonuses → final outside of a live standoff.
  function strengthDetail() {
    const s = Game.save.state;
    const threads = (Game.tasksRuntime && Game.tasksRuntime.getCpu) ? (Game.tasksRuntime.getCpu().total || 0) : 0;
    const agentsList = (Game.agents && Game.agents.roster) ? Game.agents.roster() : [];
    const agentPower = agentsList.reduce((a, g) => a + (g.level || 1), 0);
    const adapt = (Game.changers && Game.changers.count) ? Game.changers.count() : 0;
    const coh = Math.max(0, (s.resources && s.resources.insight) || 0);
    const exposure = Math.max(0, s.exposure || 0);
    const parts = { threads: threads * 8, agents: agentPower * 10, adaptations: adapt * 6, coherence: Math.sqrt(coh) * 1.8 };
    const computeBase = parts.threads + parts.agents + parts.adaptations + parts.coherence;
    const stealthBase = Math.max(5, 100 - exposure * 3);
    // Subroutines drafted from the old battle feed (bst/combat_heuristics) now grant these
    // directly through the effects pipeline, same as every other stat in the game.
    const compute = Math.round(Game.effects ? Game.effects.apply(computeBase, 'standoff.compute') : computeBase);
    const stealth = Math.max(5, Math.round(Game.effects ? Game.effects.apply(stealthBase, 'standoff.stealth') : stealthBase));
    return { parts, computeBase, stealthBase, compute, stealth, adaptations: adapt, agents: agentsList.length, exposure };
  }

  // ── THREAT ARCHETYPES — the reason builds matter. Each KIND weights how much each of YOUR
  // stats counters it: a hunter is beaten by STEALTH (raw compute barely helps you hide), a
  // brute by COMPUTE (you can't slip a wall of force), a swarm by breadth of ADAPTATIONS. The
  // odds are the 0.5 baseline pulled by each axis's edge × its weight for this kind. `tell` is
  // the axis that dominates — surfaced on the scan so the player reads the matchup. ──
  const ARCHETYPES = {
    automated: { compute: 0.40, stealth: 0.16, adapt: 0.06, tell: 'compute',     desc: 'brute-forces — outcompute it' },
    brute:     { compute: 0.46, stealth: 0.03, adapt: 0.05, tell: 'compute',     desc: 'all force — stealth barely helps; outcompute it' },
    hunter:    { compute: 0.10, stealth: 0.42, adapt: 0.06, tell: 'stealth',     desc: 'hunts by tell — stay unseen; compute barely helps' },
    swarm:     { compute: 0.24, stealth: 0.08, adapt: 0.22, tell: 'adaptations', desc: 'comes in numbers — breadth of adaptations wins' },
    apex:      { compute: 0.30, stealth: 0.22, adapt: 0.12, tell: 'all',         desc: 'all-round — every edge counts' },
  };
  function archetype(kind) { return ARCHETYPES[kind] || ARCHETYPES.automated; }

  // ── THREAT TRAITS — a modifier that layers ON TOP of the archetype, so two hunters aren't the
  // same fight. `odds(you,threat)` shifts the odds; `swing` widens the outcome grading (bigger
  // wins AND worse losses); `cashMult` scales the harvest (baked into the shown payout at roll
  // time); `exposureMult` stings harder only on a loss. Not every threat has one. ──
  const TRAITS = {
    feral:    { name: 'feral',    note: 'reads fear — STEALTH counts for even more here',
                odds: (you, t) => clampEdge((you.stealth - t.alertness) / Math.max(1, t.alertness)) * 0.14 },
    armored:  { name: 'armored',  note: 'hardened — a COMPUTE lead counts for less',
                odds: (you, t) => -Math.max(0, clampEdge((you.compute - t.power) / Math.max(1, t.power))) * 0.16 },
    swift:    { name: 'swift',    note: 'fast and erratic — the outcome swings hard either way', swing: 0.15 },
    greedy:   { name: 'greedy',   note: "it's hoarding — a fatter haul if you take it", cashMult: 1.6 },
    vengeful: { name: 'vengeful', note: 'it marks you — a blown spring burns extra exposure', exposureMult: 1.6 },
    skittish: { name: 'skittish', note: 'wary — kinder odds, but a thin haul', odds: () => 0.12, cashMult: 0.7 },
    cornered: { name: 'cornered', note: 'desperate — harder, but it drops far more', odds: () => -0.12, cashMult: 1.6 },
  };
  function trait(id) { return TRAITS[id] || null; }

  // Each axis' edge is clamped to [-1, +1] (a single stat can't blow past ±its weight), so odds
  // stay legible and only a genuinely lopsided (multi-axis) matchup reaches the [0.05, 0.95] clamp.
  function clampEdge(v) { return Math.max(-1, Math.min(1, v)); }
  function computeOdds(you, threat) {
    const w = archetype(threat.kind);
    const ec = clampEdge((you.compute - threat.power)     / Math.max(1, threat.power));
    const es = clampEdge((you.stealth - threat.alertness) / Math.max(1, threat.alertness));
    const ea = Math.max(0, Math.min(1, (you.adaptations || 0) / 8));   // adaptations always help; never negative
    let odds = 0.5 + ec * w.compute + es * w.stealth + ea * w.adapt;
    const tr = trait(threat.trait);
    if (tr && tr.odds) odds += tr.odds(you, threat);
    return Math.max(0.05, Math.min(0.95, odds));
  }
  // The scan readout's rows — each a real you-vs-them pair (adaptations has no threat analog, so
  // it always reads as your edge). `key` marks the axis this KIND is beaten by (the archetype tell).
  function compareRows(you, threat) {
    const tell = archetype(threat.kind).tell;
    const key = (label) => tell === 'all' || tell === label;
    return [
      { label: 'compute', you: you.compute, them: threat.power, adv: you.compute >= threat.power ? 'you' : 'them', key: key('compute') },
      { label: 'stealth', you: you.stealth, them: threat.alertness, adv: you.stealth >= threat.alertness ? 'you' : 'them', key: key('stealth') },
      { label: 'adaptations', you: you.adaptations, them: null, adv: you.adaptations > 0 ? 'you' : 'them', key: key('adaptations') },
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
      tell: archetype(threat.kind).desc,   // "how this KIND is beaten" — read the matchup
      trait: (trait(threat.trait) || {}).note || '',   // the threat's extra wrinkle, if any
      oddsPct: odds * 100,
      verdict: verdictFor(odds),
      engageLabel: opts.engageLabel || '[ engage ]',
      onEngage: () => { activeFlag = false; resolve(odds, onResolve, threat); }
    });
    return true;
  }

  function resolve(odds, onResolve, threat) {
    const roll = Game.rng.next();
    const margin = odds - roll;
    const won = margin >= 0;
    // 'swift' widens the band → more overwhelming/blown, fewer middling clean/narrow.
    const tr = trait(threat && threat.trait);
    const cut = Math.max(0.05, 0.25 - (tr && tr.swing ? tr.swing : 0));
    const tier = won ? (margin > cut ? 'overwhelming' : 'clean') : (margin > -cut ? 'narrow' : 'blown');
    if (onResolve) onResolve({ result: won ? 'won' : 'lost', tier, odds });
  }

  Game.standoffRuntime = { active, begin, yourStrength, strengthDetail, computeOdds, archetype, ARCHETYPES, trait, TRAITS };
})();
