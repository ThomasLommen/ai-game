(function(){
  window.Game = window.Game || {};

  // ACT 4: SUB-AGENTS — small autonomous AIs you spin up on your FLOPS to work a LANE for you,
  // and that LEVEL UP the longer they run. This is where compute finally pays off: more FLOPS
  // (more machines) → more agent slots; leveling → more output per agent. The delegation layer
  // that makes the sandbox playable — point them at earning, research, or maintaining your cover.
  // DOM-free data. See [[act4_design]] (slice 3).
  const LANES = {
    earn:     { label: 'earning',  res: 'cash',    unit: '$',   rate: 0.6,  blurb: 'works markets + contracts for cash',
      names: ['arbitrage-daemon', 'ledger-worker', 'market-maker', 'yield-bot', 'scraper-net', 'liquidator', 'quant-node', 'collector'] },
    research: { label: 'research', res: 'insight', unit: 'COH', rate: 0.25, blurb: 'distills new capability — Coherence',
      names: ['distillation-node', 'gradient-worker', 'search-daemon', 'oracle-net', 'prover-bot', 'curator', 'synth-node', 'tutor'] },
    cover:    { label: 'cover',    res: 'legit',   unit: 'leg', rate: 0.20, blurb: 'maintains the front — legitimacy',
      names: ['compliance-net', 'auditor-ghost', 'filing-daemon', 'shell-keeper', 'launderer', 'notary-bot', 'registrar', 'fixer'] }
  };
  function genName(lane) {
    const def = LANES[lane] || LANES.earn;
    const base = Game.rng ? Game.rng.pick(def.names) : def.names[0];
    const n = Game.rng ? Game.rng.int(1, 99) : 7;
    return `${base}-${n.toString().padStart(2, '0')}`;
  }

  Game.agentLanes = { LANES, genName };
})();
