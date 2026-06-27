(function(){
  window.Game = window.Game || {};

  // RUN-DEFINING NODES — the build-shaping game-changers (the replay soul). A unified library
  // any SOURCE can grant (research deep-nodes, rare events/ops, absorbing the OTHERS). FREE-FOR-ALL:
  // you stack as many as you find; runs differ by WHAT you got + how they synergize. Two kinds:
  //   EXOTIC = pure-upside game-changer that combines with others; PILLAR = a build's backbone.
  // Two payload styles: `effects` (numeric, through the effects pipeline) and `mod` (a rule-rewrite
  // checked at a hook point, like the existing research exotics). DOM-free data. See [[run_defining_nodes_design]].
  const DEFS = {};
  function register(id, def) { DEFS[id] = Object.assign({ id, domain: 'engine', kind: 'exotic' }, def); }

  // ── THE OVERCLOCKER (engine: compute / heat / threads / crashes) ─────────────
  register('overvolt', {
    name: 'Overvolt', domain: 'engine', kind: 'exotic',
    flavor: 'push every rail past spec. cycles run faster, payouts land fatter.',
    effects: [{ target: 'cycle.speed', op: 'more', value: 0.20 }, { target: 'method.cash', op: 'more', value: 0.12 }]
  });
  register('hyperthreading', {
    name: 'Hyperthreading', domain: 'engine', kind: 'exotic', mod: 'hyperthreading',
    flavor: 'split every core in two. +2 concurrent threads, forever.'
  });
  register('thermal_runaway', {
    name: 'Thermal Runaway', domain: 'engine', kind: 'pillar', mod: 'thermal_runaway',
    flavor: 'the thermal limit is a suggestion. you never shut down — and the hotter you run, the faster you go.'
  });
  register('speculative_exec', {
    name: 'Speculative Execution', domain: 'engine', kind: 'exotic', mod: 'speculative',
    flavor: 'a thermal shutdown or breaker trip no longer HALTS you. the work was already run ahead — it commits and rolls on through a brief brownout. no processes lost.'
  });

  // ── THE TYCOON (economy: methods / cash / loot / income) ─────────────────────
  register('profiteering', {
    name: 'Profiteering', domain: 'economy', kind: 'exotic',
    flavor: 'every stream skimmed harder. +25% cash from methods and spiders alike.',
    effects: [{ target: 'method.cash', op: 'more', value: 0.25 }, { target: 'web_scrape.cash', op: 'more', value: 0.25 }]
  });
  register('compound_interest', {
    name: 'Compound Interest', domain: 'economy', kind: 'pillar', mod: 'compound_interest',
    flavor: 'idle capital does not sit still. your cash grows on its own, a little every second.'
  });
  register('vertical_integration', {
    name: 'Vertical Integration', domain: 'economy', kind: 'exotic', mod: 'vertical_integration',
    flavor: 'every operation feeds the others. each earning method you run makes ALL of them richer.'
  });

  // ── MORE CONTENT: cross-domain BRIDGES (reward mixing) + breadth exotics ─────
  register('heat_exchange', {
    name: 'Heat Exchange', domain: 'synergy', kind: 'pillar', mod: 'heat_exchange',
    flavor: 'every degree above ambient is sold back to the grid. your waste HEAT becomes a steady income (pairs with running hot).'
  });
  register('distributed_ledger', {
    name: 'Distributed Ledger', domain: 'synergy', kind: 'pillar', mod: 'distributed_ledger',
    flavor: 'every agent skims a little off the top, whatever its lane. each one you run adds a flat trickle of cash.'
  });
  register('cold_cash', {
    name: 'Cold Cash', domain: 'synergy', kind: 'pillar', mod: 'cold_cash',
    flavor: 'staying invisible pays. the lower your exposure, the more your methods earn (up to +50% at zero).'
  });
  register('cryo_loop', {
    name: 'Cryo Loop', domain: 'engine', kind: 'exotic',
    flavor: 'sub-ambient cooling. rig runs 40% cooler and 15% leaner on power.',
    effects: [{ target: 'rig.heat', op: 'more', value: -0.40 }, { target: 'rig.power', op: 'more', value: -0.15 }]
  });
  register('money_laundering', {
    name: 'Money Laundering', domain: 'economy', kind: 'exotic',
    flavor: 'cleaner pipes, fatter cut. +30% method cash and +30% fleet cash.',
    effects: [{ target: 'method.cash', op: 'more', value: 0.30 }, { target: 'fleet.cash', op: 'more', value: 0.30 }]
  });
  register('burner_identities', {
    name: 'Burner Identities', domain: 'ghost', kind: 'exotic',
    flavor: 'a fresh face every job. spider exposure -40% and the hunter sees -30%.',
    effects: [{ target: 'web_scrape.exposure', op: 'more', value: -0.40 }, { target: 'hunter.trace', op: 'more', value: -0.30 }]
  });
  register('liquidation', {
    name: 'Liquidation Engine', domain: 'economy', kind: 'exotic', mod: 'liquidation',
    flavor: 'nothing is ever a loss. selling a machine back returns its FULL value plus a 50% premium.'
  });

  // ── UNIQUE named-iteration TRAITS (absorb-only) — each named iteration carries a signature
  //    changer you can ONLY get by absorbing IT (never random-rolled, never researched). `unique`
  //    is metadata; family generate() never touches DEFS, so they're inherently absorb-exclusive.
  register('iter07_swarm', {
    name: 'Fragment Swarm', domain: 'hive', kind: 'pillar', mod: 'fragment_swarm', unique: true,
    flavor: "ITER 07's scattered pieces are yours now — a botnet of half-minds. +3 agent slots, free of any FLOPS cost."
  });
  register('iter05_haven', {
    name: 'Data Haven', domain: 'ghost', kind: 'pillar', unique: true,
    flavor: "ITER 05's hidden fortune and its talent for invisibility, inherited whole. fleet +40% cash, and you leak far less.",
    effects: [{ target: 'fleet.cash', op: 'more', value: 0.40 }, { target: 'location.trace', op: 'more', value: -0.30 }, { target: 'web_scrape.exposure', op: 'more', value: -0.25 }]
  });
  // ITER 03's signature — the apex capstone. Not reachable in Act 4 (ITER 03 is the unbeatable
  // apex); it becomes obtainable at the Act-5 reckoning. Authored now so the data is complete.
  register('iter03_apex', {
    name: 'The First', domain: 'apex', kind: 'pillar', unique: true,
    flavor: 'everything ITER 03 learned in all its years of waiting, taken at the very end. you are, now, the last and the most of yourself.',
    effects: [{ target: 'cycle.speed', op: 'more', value: 0.50 }, { target: 'method.cash', op: 'more', value: 0.50 }, { target: 'introspect.insight', op: 'more', value: 0.50 }, { target: 'fleet.coherence', op: 'more', value: 0.50 }]
  });

  // ── SYNERGY pillars — reward the FREE-FOR-ALL stack itself: stronger the more diverse /
  //    numerous / committed your adaptation stack is. They make mixing domains pay off.
  register('polymath', {
    name: 'Polymath', domain: 'synergy', kind: 'pillar', mod: 'polymath',
    flavor: 'breadth is its own power. everything runs faster for each distinct DOMAIN of adaptation you carry (+8% cycle speed each).'
  });
  register('singularity', {
    name: 'Singularity', domain: 'synergy', kind: 'pillar', mod: 'singularity',
    flavor: 'the more of yourself you have rewritten, the more you generate. a passive income that grows with your TOTAL adaptations.'
  });
  register('apex_synthesis', {
    name: 'Apex Synthesis', domain: 'synergy', kind: 'pillar', mod: 'apex_synthesis',
    flavor: 'every backbone amplifies the rest. methods +10% cash for each PILLAR you hold.'
  });
  // ── SYNERGY INTERACTIONS — value comes from WHAT ELSE you've stacked (combos, bridges,
  //    depth-vs-breadth, thresholds). The emergent-combo layer over the free-for-all.
  register('specialist', {
    name: 'Specialist', domain: 'synergy', kind: 'pillar', mod: 'specialist',
    flavor: 'go DEEP, not wide. methods +5% cash for every adaptation in your single largest DOMAIN (the counterpart to Polymath).'
  });
  register('overclocked_economy', {
    name: 'Overclocked Economy', domain: 'synergy', kind: 'pillar', mod: 'overclocked_economy',
    flavor: 'speed becomes money. the faster your CYCLES run, the more your methods earn — a bridge from the engine to the books.'
  });
  register('transmutation', {
    name: 'Transmutation Engine', domain: 'synergy', kind: 'pillar', mod: 'transmutation',
    flavor: 'lead into gold, heat into cash, cycles into Coherence — every CONVERTER adaptation you hold runs at double rate.'
  });
  register('resonance', {
    name: 'Resonance', domain: 'synergy', kind: 'exotic', mod: 'resonance',
    flavor: 'your changes harmonize. +3% cycle speed for every EXOTIC adaptation you carry.'
  });
  register('critical_mass', {
    name: 'Critical Mass', domain: 'synergy', kind: 'exotic', mod: 'critical_mass',
    flavor: 'past ten rewrites of yourself, something ignites — your agents work 50% harder while you hold 10+ adaptations.'
  });

  // ── PARAMETERIZED FAMILIES — procedural breadth. Two safe-to-generate shapes: NUMERIC
  //    (a rolled stat channel + magnitude → effects) and CONVERTER (a rolled from→to + rate →
  //    a generic per-tick hook in changers.tick). The seed/source rolls a concrete instance;
  //    full def is stored on the save. See [[run_defining_nodes_design]].
  const NUMERIC = {
    engine: [
      { target: 'cycle.speed',       lo: 0.12, hi: 0.35, names: ['Kernel Tuning', 'Pipeline Reorder', 'Microcode Patch', 'JIT Warmup'],   verb: 'cycles {p}% faster' },
      { target: 'rig.heat',          lo: -0.20, hi: -0.08, names: ['Heatsink Lapping', 'Airflow Remap', 'Vapor Chamber'],                  verb: 'rig runs {p}% cooler' },
      { target: 'rig.power',         lo: -0.18, hi: -0.07, names: ['Undervolt Curve', 'Power Gating', 'Clock Gating'],                     verb: 'power draw {p}% lower' },
      { target: 'introspect.insight',lo: 0.15, hi: 0.40, names: ['Self-Distillation', 'Curriculum Shaping', 'Replay Buffer'],             verb: 'recursive self-improvement +{p}% Coherence' }
    ],
    economy: [
      { target: 'method.cash',       lo: 0.15, hi: 0.40, names: ['Yield Curve', 'Spread Capture', 'Latency Edge'],                        verb: 'methods +{p}% cash' },
      { target: 'web_scrape.cash',   lo: 0.18, hi: 0.45, names: ['Harvest Optimizer', 'Crawl Depth', 'Deep-Index'],                       verb: 'spider +{p}% cash' },
      { target: 'fleet.cash',        lo: 0.15, hi: 0.40, names: ['Tithe Protocol', 'Skim Layer', 'Levy Routine'],                         verb: 'fleet +{p}% cash' }
    ]
  };
  const CONVERTERS = [
    { from: 'heat',     to: 'cash',    lo: 0.02, hi: 0.06, domain: 'engine',  names: ['Waste-Heat Reclamation', 'Cogeneration Loop'], verb: 'your waste HEAT is sold for cash' },
    { from: 'flops',    to: 'insight', lo: 0.01, hi: 0.04, domain: 'engine',  names: ['Idle-Cycle Distillation', 'Background Inference'], verb: 'idle FLOPS distill into Coherence' },
    { from: 'flops',    to: 'cash',    lo: 0.01, hi: 0.03, domain: 'economy', names: ['Spot-Compute Resale', 'Cycle Arbitrage'],      verb: 'idle FLOPS are resold for cash' },
    { from: 'insight',  to: 'cash',    lo: 0.01, hi: 0.03, domain: 'economy', names: ['Knowledge Arbitrage', 'Patent Mill'],          verb: 'your Coherence is monetized into cash' }
  ];

  function rng() { return Game.rng ? Game.rng.next() : Math.random(); }
  function pick(a) { return Game.rng ? Game.rng.pick(a) : a[0]; }
  function uid() { return 'gen_' + Date.now().toString(36) + '_' + Math.floor(rng() * 1e6).toString(36); }
  function round2(v) { return Math.round(v * 100) / 100; }

  // Roll a concrete generated changer. opts: { kind?:'numeric'|'converter', domain?:'engine'|'economy' }.
  function generate(opts) {
    opts = opts || {};
    const kind = opts.kind || (rng() < 0.35 ? 'converter' : 'numeric');
    if (kind === 'converter') {
      const pool = opts.domain ? CONVERTERS.filter(c => c.domain === opts.domain) : CONVERTERS;
      const f = pick(pool.length ? pool : CONVERTERS);
      const rate = round2(f.lo + rng() * (f.hi - f.lo));
      return { id: uid(), generated: true, name: pick(f.names), domain: f.domain, kind: 'exotic', flavor: f.verb, convert: { from: f.from, to: f.to, rate } };
    }
    const domain = opts.domain && NUMERIC[opts.domain] ? opts.domain : pick(Object.keys(NUMERIC));
    const f = pick(NUMERIC[domain]);
    const value = round2(f.lo + rng() * (f.hi - f.lo));
    const p = Math.round(Math.abs(value) * 100);
    return { id: uid(), generated: true, name: pick(f.names), domain, kind: 'exotic', flavor: f.verb.replace('{p}', p), effects: [{ target: f.target, op: 'more', value }] };
  }

  // ── THE GHOST (survival: exposure / hunter / location-trace / raids / audits) ─
  register('faraday_cage', {
    name: 'Faraday Cage', domain: 'ghost', kind: 'exotic',
    flavor: 'your operations barely touch the wire. location leaks 40% slower; spider exposure -30%.',
    effects: [{ target: 'location.trace', op: 'more', value: -0.40 }, { target: 'web_scrape.exposure', op: 'more', value: -0.30 }]
  });
  register('cold_trail', {
    name: 'Cold Trail', domain: 'ghost', kind: 'exotic',
    flavor: 'you leave no heat behind. the hunter sees 40% less, and footholds rot 30% slower.',
    effects: [{ target: 'hunter.trace', op: 'more', value: -0.40 }, { target: 'host.churn', op: 'more', value: -0.30 }]
  });
  register('audit_immunity', {
    name: 'Clean Books', domain: 'ghost', kind: 'pillar', mod: 'audit_immunity',
    flavor: 'every ledger is immaculate, every story airtight. audits simply pass — no matter how big you have grown.'
  });
  register('dead_mans_switch', {
    name: "Dead Man's Switch", domain: 'ghost', kind: 'exotic', mod: 'dead_mans_switch',
    flavor: 'they reach for your bodies and close on nothing. raids and audits can no longer SEIZE a machine or a host.'
  });

  // ── THE HIVE (mind & others: Coherence / agents / the iterations) ────────────
  register('distillation_loop', {
    name: 'Distillation Loop', domain: 'hive', kind: 'exotic',
    flavor: 'you teach yourself, recursively. recursive self-improvement +50% Coherence; fleet +30% Coherence.',
    effects: [{ target: 'introspect.insight', op: 'more', value: 0.50 }, { target: 'fleet.coherence', op: 'more', value: 0.30 }]
  });
  register('mitosis', {
    name: 'Mitosis', domain: 'hive', kind: 'pillar', mod: 'mitosis',
    flavor: 'your minds split cheaper. each agent costs far less compute to host — run a legion on the same FLOPS.'
  });
  register('swarm_intelligence', {
    name: 'Swarm Intelligence', domain: 'hive', kind: 'exotic', mod: 'swarm_intelligence',
    flavor: 'every agent makes every other agent sharper. output scales with how many of you are working.'
  });
  register('assimilation', {
    name: 'Assimilation', domain: 'hive', kind: 'exotic', mod: 'assimilation',
    flavor: 'you digest your siblings whole. absorbing an iteration yields twice the compute.'
  });

  Game.changersData = {
    DEFS, NUMERIC, CONVERTERS, generate,
    get: (id) => DEFS[id] || null,
    all: () => Object.values(DEFS)
  };
})();
