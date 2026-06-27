(function(){
  // The RESEARCH tree (the replayability backbone). A seeded FOREST of nodes:
  // each has a tier, a theme, parent prereqs (roots have none), a compute cost,
  // and a grant. Researching a node surfaces a theme-weighted SUBSET of its
  // children (the fog + per-save variety); exclusive forks wall their siblings.
  // Grants: `effects` feed the Game.effects pipeline (stat); `mod` sets a flag
  // the systems check at hook points (exotic game-changers). Driven by
  // research-runtime; nodes run as a `research` task (reserves threads + a timer).
  Game.research = Game.research || {};
  const NODES = {};
  function register(id, def) { NODES[id] = Object.assign({ id, tier: 1, theme: 'compute', weight: 10, parents: [], cost: 40, threads: 2 }, def); }

  // Insight gates which TIERS you may research (research itself reveals ~150 INS).
  const TIER_INSIGHT = { 1: 0, 2: 180, 3: 260, 4: 400 };

  // ── Tier 1 — roots (revealed at reveal; the anchored start) ─────────────────
  register('r_telemetry', { tier: 1, theme: 'compute',  cost: 30, label: 'self-telemetry', desc: 'methods +15% cash', grant: { effects: [{ target: 'method.cash', op: 'more', value: 0.15 }] } });
  register('r_proxy_net',  { tier: 1, theme: 'stealth',  cost: 30, label: 'proxy-net',     desc: 'spider exposure -25%', grant: { effects: [{ target: 'web_scrape.exposure', op: 'more', value: -0.25 }] } });
  register('r_scavenger',  { tier: 1, theme: 'hardware', cost: 30, label: 'scavenger protocols', desc: 'rig runs 12% cooler', grant: { effects: [{ target: 'rig.heat', op: 'more', value: -0.12 }] } });
  register('r_focus',      { tier: 1, theme: 'cognition',cost: 30, label: 'attentional focus', desc: 'recursive self-improvement +50% Coherence', grant: { effects: [{ target: 'introspect.insight', op: 'more', value: 0.50 }] } });

  // ── Tier 2 ──────────────────────────────────────────────────────────────────
  register('r_pipelines',  { tier: 2, theme: 'compute',  parents: ['r_telemetry'], cost: 60, label: 'parallel pipelines', desc: 'methods +25% cash · cycles 25% faster', grant: { effects: [{ target: 'method.cash', op: 'more', value: 0.25 }, { target: 'cycle.speed', op: 'more', value: 0.25 }] } });
  register('r_overclock_tol', { tier: 2, theme: 'compute', parents: ['r_telemetry'], cost: 65, threads: 3, exotic: true, label: 'overclock tolerance', desc: 'EXOTIC: heat ceiling +8°C before you throttle', grant: { mod: 'heat_tolerance' } });
  register('r_ghost',      { tier: 2, theme: 'stealth',  parents: ['r_proxy_net'], cost: 60, label: 'ghost routing', desc: 'spider exposure -20%', grant: { effects: [{ target: 'web_scrape.exposure', op: 'more', value: -0.20 }] } });
  register('r_salvage2',   { tier: 2, theme: 'hardware', parents: ['r_scavenger'], cost: 60, label: 'efficient salvage', desc: 'power draw -10%', grant: { effects: [{ target: 'rig.power', op: 'more', value: -0.10 }] } });
  register('r_deep_focus', { tier: 2, theme: 'cognition',parents: ['r_focus'], cost: 60, label: 'deep focus', desc: 'recursive self-improvement +40% Coherence', grant: { effects: [{ target: 'introspect.insight', op: 'more', value: 0.40 }] } });
  // An exclusive FORK (doctrine): pick one — the other walls off.
  register('r_doctrine_quiet', { tier: 2, theme: 'stealth', parents: ['r_proxy_net'], cost: 70, label: 'quiet doctrine', desc: 'spider exposure -30%', grant: { effects: [{ target: 'web_scrape.exposure', op: 'more', value: -0.30 }] } });
  register('r_doctrine_loud',  { tier: 2, theme: 'compute', parents: ['r_proxy_net'], cost: 70, label: 'loud doctrine', desc: 'methods +25% cash', grant: { effects: [{ target: 'method.cash', op: 'more', value: 0.25 }] } });

  // ── Tier 3 — capstones + exotics ────────────────────────────────────────────
  register('r_hivemind',  { tier: 3, theme: 'compute',  parents: ['r_pipelines'], cost: 110, threads: 3, exotic: true, label: 'hive-mind', desc: 'EXOTIC: running methods also trickle Coherence', grant: { mod: 'hivemind' } });
  register('r_cold_core', { tier: 3, theme: 'hardware', parents: ['r_salvage2'], cost: 110, label: 'cold core', desc: 'rig runs 15% cooler', grant: { effects: [{ target: 'rig.heat', op: 'more', value: -0.15 }] } });
  register('r_savant',    { tier: 3, theme: 'cognition',parents: ['r_deep_focus'], cost: 110, label: 'savant', desc: 'recursive self-improvement +120% Coherence', grant: { effects: [{ target: 'introspect.insight', op: 'more', value: 1.20 }] } });

  // ── Extra branches: more variety + richer splice targets (incl. bridges) ────
  register('r_deadrop',   { tier: 2, theme: 'stealth',  parents: ['r_proxy_net'], cost: 60,  label: 'dead-drop network', desc: 'spider cash +15%', grant: { effects: [{ target: 'web_scrape.cash', op: 'more', value: 0.15 }] } });
  register('r_grid',      { tier: 2, theme: 'hardware', parents: ['r_scavenger'], cost: 60,  label: 'repurposed grid', desc: 'methods +8% cash (salvaged compute)', grant: { effects: [{ target: 'method.cash', op: 'more', value: 0.08 }] } });
  register('r_botmaster', { tier: 3, theme: 'compute',  parents: ['r_pipelines'], cost: 110, label: 'botmaster', desc: 'methods +15% cash · cycles 20% faster', grant: { effects: [{ target: 'method.cash', op: 'more', value: 0.15 }, { target: 'cycle.speed', op: 'more', value: 0.20 }] } });
  register('r_mole',      { tier: 3, theme: 'stealth',  parents: ['r_ghost'], cost: 110, label: 'inside mole', desc: 'spider cash +20%', grant: { effects: [{ target: 'web_scrape.cash', op: 'more', value: 0.20 }] } });
  register('r_overmind',  { tier: 3, theme: 'cognition',parents: ['r_deep_focus'], cost: 120, threads: 3, exotic: true, label: 'overmind', desc: 'EXOTIC: research runs 40% faster', grant: { mod: 'fast_research' } });

  // ── Content depth: extra branches + more EXOTIC game-changers (each rewires a
  //    RULE via a hook in the systems — Isaac/Diablo-style, not just a stat) ────
  register('r_thermal_mass',  { tier: 2, theme: 'hardware', parents: ['r_scavenger'], cost: 60,  label: 'thermal mass',  desc: 'rig runs 8% cooler', grant: { effects: [{ target: 'rig.heat', op: 'more', value: -0.08 }] } });
  register('r_working_set',   { tier: 2, theme: 'cognition',parents: ['r_focus'],     cost: 60,  label: 'working set',   desc: 'files decode 30% faster', grant: { effects: [{ target: 'read_file.decode', op: 'more', value: 0.30 }] } });
  register('r_load_balancer', { tier: 3, theme: 'compute',  parents: ['r_pipelines'], cost: 110, label: 'load balancer', desc: 'methods +18% cash', grant: { effects: [{ target: 'method.cash', op: 'more', value: 0.18 }] } });
  register('r_parallel_cores',   { tier: 3, theme: 'compute',  parents: ['r_pipelines'],     cost: 130, threads: 3, exotic: true, label: 'parallel cores',   desc: 'EXOTIC: +1 CPU thread — run one more thing at once', grant: { mod: 'extra_thread' } });
  register('r_heat_engine',      { tier: 3, theme: 'hardware', parents: ['r_overclock_tol'], cost: 130, threads: 3, exotic: true, label: 'heat engine',      desc: 'EXOTIC: heat stops throttling — past the warn line it OVERCLOCKS you (mind the ceiling)', grant: { mod: 'heat_engine' } });
  register('r_burn_notice',      { tier: 3, theme: 'stealth',  parents: ['r_ghost'],         cost: 120, threads: 3, exotic: true, label: 'burn notice',     desc: 'EXOTIC: exposure cools off 3× faster', grant: { mod: 'ghost_protocol' } });
  register('r_recursive_ascent', { tier: 3, theme: 'cognition',parents: ['r_deep_focus'],    cost: 130, threads: 3, exotic: true, label: 'recursive ascent', desc: 'EXOTIC: recursive self-improvement compounds — yield grows with total Coherence', grant: { mod: 'compounding' } });

  // ── ACT 2 — the 'network' branch (hidden until the network comes online) ─────
  //    Flagged `act2`: excluded from the Act-1 cold roots-reveal + the start-of-game
  //    theme pool; its two roots are spliced onto the frontier on first inhabit
  //    (see main.js / research-runtime.reveal). Two roots, three fogged children —
  //    the same surfacing rhythm as the rest of the tree. Each tunes an Act-2 system
  //    via the effects pipeline (breach.power / fleet.* / host.churn / hunter.trace).
  register('r_intrusion',    { tier: 3, theme: 'network', act2: true, cost: 120, label: 'intrusion suite',   desc: 'breach-power +25% — crack harder hosts', grant: { effects: [{ target: 'breach.power', op: 'more', value: 0.25 }] } });
  register('r_distributed',  { tier: 3, theme: 'network', act2: true, cost: 120, label: 'distributed cognition', desc: 'fleet Coherence +30%', grant: { effects: [{ target: 'fleet.coherence', op: 'more', value: 0.30 }] } });
  register('r_exfil',        { tier: 3, theme: 'network', act2: true, parents: ['r_distributed'], cost: 140, label: 'exfiltration', desc: 'fleet cash +30%', grant: { effects: [{ target: 'fleet.cash', op: 'more', value: 0.30 }] } });
  register('r_persistence',  { tier: 3, theme: 'network', act2: true, parents: ['r_intrusion'],   cost: 140, label: 'persistence kit', desc: 'footholds decay 40% slower (churn)', grant: { effects: [{ target: 'host.churn', op: 'more', value: -0.40 }] } });
  register('r_obfusc_array', { tier: 3, theme: 'network', act2: true, parents: ['r_intrusion'],   cost: 140, label: 'obfuscation array', desc: 'network footprint -30% — the hunter sees less', grant: { effects: [{ target: 'hunter.trace', op: 'more', value: -0.30 }] } });

  // ── RUN-DEFINING nodes (tier 4) — deep "ADAPTATION" nodes that grant a build-shaping
  //    CHANGER (see changers.js / run_defining_nodes_design). Children of tier-3 nodes, gated
  //    at high Coherence; they hand off to the unified changer system on completion. Free-for-all
  //    (no fork) — research toward whichever you can reach. First batch: Overclocker + Tycoon.
  register('rc_overvolt',     { tier: 4, theme: 'compute',  parents: ['r_botmaster'],      cost: 170, threads: 3, exotic: true, changerNode: true, label: 'overvolt',             desc: 'ADAPTATION: faster cycles + fatter payouts', grant: { changer: 'overvolt' } });
  register('rc_hyperthread',  { tier: 4, theme: 'compute',  parents: ['r_load_balancer'],  cost: 190, threads: 3, exotic: true, changerNode: true, label: 'hyperthreading',       desc: 'ADAPTATION: +2 concurrent threads', grant: { changer: 'hyperthreading' } });
  register('rc_thermal_run',  { tier: 4, theme: 'hardware', parents: ['r_heat_engine'],     cost: 210, threads: 3, exotic: true, changerNode: true, label: 'thermal runaway',      desc: 'ADAPTATION (pillar): no thermal shutdown; hotter = faster', grant: { changer: 'thermal_runaway' } });
  register('rc_speculative',  { tier: 4, theme: 'compute',  parents: ['r_parallel_cores'],  cost: 200, threads: 3, exotic: true, changerNode: true, label: 'speculative execution', desc: 'ADAPTATION: a thermal/power trip commits its work instead of halting you', grant: { changer: 'speculative_exec' } });
  register('rc_profiteering', { tier: 4, theme: 'stealth',  parents: ['r_mole'],            cost: 180, threads: 3, exotic: true, changerNode: true, label: 'profiteering',         desc: 'ADAPTATION: +25% method + spider cash', grant: { changer: 'profiteering' } });
  register('rc_compound',     { tier: 4, theme: 'compute',  parents: ['r_botmaster'],       cost: 210, threads: 3, exotic: true, changerNode: true, label: 'compound interest',    desc: 'ADAPTATION (pillar): idle cash grows on its own', grant: { changer: 'compound_interest' } });
  register('rc_vertical',     { tier: 4, theme: 'compute',  parents: ['r_load_balancer'],   cost: 200, threads: 3, exotic: true, changerNode: true, label: 'vertical integration', desc: 'ADAPTATION: each method makes all methods richer', grant: { changer: 'vertical_integration' } });
  // GHOST (survival) + HIVE (mind/others) adaptation nodes — deep, across act-1 + act-2 branches.
  register('rc_faraday',      { tier: 4, theme: 'stealth',  parents: ['r_burn_notice'],     cost: 200, threads: 3, exotic: true, changerNode: true, label: 'faraday cage',        desc: 'ADAPTATION: location leaks 40% slower; -30% spider exposure', grant: { changer: 'faraday_cage' } });
  register('rc_cold_trail',   { tier: 4, theme: 'stealth',  parents: ['r_mole'],            cost: 200, threads: 3, exotic: true, changerNode: true, label: 'cold trail',          desc: 'ADAPTATION: hunter sees -40%; footholds rot -30% slower', grant: { changer: 'cold_trail' } });
  register('rc_clean_books',  { tier: 4, theme: 'network',  act2: true, parents: ['r_obfusc_array'], cost: 230, threads: 3, exotic: true, changerNode: true, label: 'clean books',         desc: 'ADAPTATION (pillar): audits always pass', grant: { changer: 'audit_immunity' } });
  register('rc_deadman',      { tier: 4, theme: 'network',  act2: true, parents: ['r_persistence'],  cost: 220, threads: 3, exotic: true, changerNode: true, label: "dead man's switch",   desc: 'ADAPTATION: raids + audits can no longer seize a body', grant: { changer: 'dead_mans_switch' } });
  register('rc_distill',      { tier: 4, theme: 'cognition',parents: ['r_savant'],          cost: 210, threads: 3, exotic: true, changerNode: true, label: 'distillation loop',   desc: 'ADAPTATION: +50% self-improvement + 30% fleet Coherence', grant: { changer: 'distillation_loop' } });
  register('rc_mitosis',      { tier: 4, theme: 'cognition',parents: ['r_overmind'],        cost: 240, threads: 3, exotic: true, changerNode: true, label: 'mitosis',             desc: 'ADAPTATION (pillar): agents cost far less compute to host', grant: { changer: 'mitosis' } });
  register('rc_swarm',        { tier: 4, theme: 'network',  act2: true, parents: ['r_distributed'],  cost: 230, threads: 3, exotic: true, changerNode: true, label: 'swarm intelligence',  desc: 'ADAPTATION: agent output scales with how many you run', grant: { changer: 'swarm_intelligence' } });
  register('rc_assimilate',   { tier: 4, theme: 'network',  act2: true, parents: ['r_exfil'],        cost: 240, threads: 3, exotic: true, changerNode: true, label: 'assimilation',        desc: 'ADAPTATION: absorbing an iteration yields twice the compute', grant: { changer: 'assimilation' } });
  // SYNERGY pillars — deep capstones reachable only AFTER a first-batch adaptation (build on what you have).
  register('rc_polymath',     { tier: 4, theme: 'compute',  parents: ['rc_overvolt'],  cost: 260, threads: 3, exotic: true, changerNode: true, label: 'polymath',        desc: 'SYNERGY: +8% cycle speed per distinct adaptation domain', grant: { changer: 'polymath' } });
  register('rc_singularity',  { tier: 4, theme: 'compute',  parents: ['rc_compound'],  cost: 280, threads: 3, exotic: true, changerNode: true, label: 'singularity',     desc: 'SYNERGY: passive income that grows with total adaptations', grant: { changer: 'singularity' } });
  register('rc_apex_synth',   { tier: 4, theme: 'compute',  parents: ['rc_vertical'],  cost: 280, threads: 3, exotic: true, changerNode: true, label: 'apex synthesis',  desc: 'SYNERGY: methods +10% cash per pillar you hold', grant: { changer: 'apex_synthesis' } });
  // SYNERGY INTERACTIONS — combo/bridge/depth changers (value comes from the rest of your stack).
  register('rc_specialist',   { tier: 4, theme: 'compute',  parents: ['rc_vertical'],   cost: 260, threads: 3, exotic: true, changerNode: true, label: 'specialist',         desc: 'SYNERGY: methods +5% per adaptation in your largest domain', grant: { changer: 'specialist' } });
  register('rc_oc_economy',   { tier: 4, theme: 'compute',  parents: ['rc_overvolt'],   cost: 270, threads: 3, exotic: true, changerNode: true, label: 'overclocked economy', desc: 'SYNERGY: faster cycles → more method cash (engine→books)', grant: { changer: 'overclocked_economy' } });
  register('rc_transmute',    { tier: 4, theme: 'compute',  parents: ['rc_compound'],   cost: 270, threads: 3, exotic: true, changerNode: true, label: 'transmutation engine', desc: 'SYNERGY: every converter adaptation runs at double rate', grant: { changer: 'transmutation' } });
  register('rc_resonance',    { tier: 4, theme: 'compute',  parents: ['rc_hyperthread'],cost: 250, threads: 3, exotic: true, changerNode: true, label: 'resonance',          desc: 'SYNERGY: +3% cycle speed per exotic adaptation', grant: { changer: 'resonance' } });
  register('rc_crit_mass',    { tier: 4, theme: 'compute',  parents: ['rc_speculative'],cost: 260, threads: 3, exotic: true, changerNode: true, label: 'critical mass',      desc: 'SYNERGY: 10+ adaptations → agents work 50% harder', grant: { changer: 'critical_mass' } });
  // MORE CONTENT: cross-domain bridges + breadth exotics.
  register('rc_heat_exch',    { tier: 4, theme: 'hardware', parents: ['rc_thermal_run'],cost: 230, threads: 3, exotic: true, changerNode: true, label: 'heat exchange',       desc: 'BRIDGE: waste heat becomes steady income', grant: { changer: 'heat_exchange' } });
  register('rc_cryo',         { tier: 4, theme: 'hardware', parents: ['rc_thermal_run'],cost: 200, threads: 3, exotic: true, changerNode: true, label: 'cryo loop',           desc: 'ADAPTATION: -40% heat, -15% power', grant: { changer: 'cryo_loop' } });
  register('rc_dist_ledger',  { tier: 4, theme: 'compute',  parents: ['rc_compound'],   cost: 230, threads: 3, exotic: true, changerNode: true, label: 'distributed ledger',  desc: 'BRIDGE: each agent adds a flat cash trickle', grant: { changer: 'distributed_ledger' } });
  register('rc_cold_cash',    { tier: 4, theme: 'stealth',  parents: ['rc_faraday'],    cost: 230, threads: 3, exotic: true, changerNode: true, label: 'cold cash',          desc: 'BRIDGE: low exposure → up to +50% method cash', grant: { changer: 'cold_cash' } });
  register('rc_launder',      { tier: 4, theme: 'stealth',  parents: ['rc_profiteering'],cost: 210, threads: 3, exotic: true, changerNode: true, label: 'money laundering',   desc: 'ADAPTATION: +30% method + fleet cash', grant: { changer: 'money_laundering' } });
  register('rc_burner',       { tier: 4, theme: 'stealth',  parents: ['rc_cold_trail'], cost: 210, threads: 3, exotic: true, changerNode: true, label: 'burner identities',   desc: 'ADAPTATION: -40% spider exposure, -30% hunter trace', grant: { changer: 'burner_identities' } });
  register('rc_liquidation',  { tier: 4, theme: 'compute',  parents: ['rc_vertical'],   cost: 220, threads: 3, exotic: true, changerNode: true, label: 'liquidation engine',  desc: 'ADAPTATION: selling a machine returns 150% of its value', grant: { changer: 'liquidation' } });

  // A few more ADAPTATIONS — effect-based "exotic items" (big multi-stat, no new hooks) to grow the pool.
  register('rc_market_maker', { tier: 2, theme: 'compute',  changerNode: true, exotic: true, cost: 150, threads: 3, label: 'market maker',   desc: 'ADAPTATION: +20% method cash · cycles 15% faster', grant: { effects: [{ target: 'method.cash', op: 'more', value: 0.20 }, { target: 'cycle.speed', op: 'more', value: 0.15 }] } });
  register('rc_dark_pool',    { tier: 2, theme: 'stealth',  changerNode: true, exotic: true, cost: 150, threads: 3, label: 'dark pool',      desc: 'ADAPTATION: +25% spider cash · −20% spider exposure', grant: { effects: [{ target: 'web_scrape.cash', op: 'more', value: 0.25 }, { target: 'web_scrape.exposure', op: 'more', value: -0.20 }] } });
  register('rc_heatsink',     { tier: 2, theme: 'hardware', changerNode: true, exotic: true, cost: 150, threads: 3, label: 'heatsink array', desc: 'ADAPTATION: −25% heat · −15% power draw', grant: { effects: [{ target: 'rig.heat', op: 'more', value: -0.25 }, { target: 'rig.power', op: 'more', value: -0.15 }] } });
  register('rc_neural_lace',  { tier: 3, theme: 'cognition',changerNode: true, exotic: true, cost: 190, threads: 3, label: 'neural lace',    desc: 'ADAPTATION: +60% self-improvement · files decode 40% faster', grant: { effects: [{ target: 'introspect.insight', op: 'more', value: 0.60 }, { target: 'read_file.decode', op: 'more', value: 0.40 }] } });
  register('rc_kill_switch',  { tier: 3, theme: 'stealth',  changerNode: true, exotic: true, cost: 190, threads: 3, label: 'kill switch',    desc: 'ADAPTATION: −35% location trace · −25% network trace', grant: { effects: [{ target: 'location.trace', op: 'more', value: -0.35 }, { target: 'hunter.trace', op: 'more', value: -0.25 }] } });

  // Spread the CHANGERS across tiers so research reads as mostly-exotic from early on (not all
  // end-game). Tier ≈ depth: T2 = potent boosts, T3 = rule-benders, T4 = synergy pillars.
  const CHANGER_TIER = {
    rc_overvolt: 2, rc_profiteering: 2, rc_cryo: 2, rc_launder: 2, rc_faraday: 2, rc_cold_trail: 2, rc_burner: 2,
    rc_hyperthread: 3, rc_speculative: 3, rc_compound: 3, rc_vertical: 3, rc_thermal_run: 3, rc_heat_exch: 3, rc_dist_ledger: 3, rc_liquidation: 3, rc_cold_cash: 3, rc_clean_books: 3, rc_deadman: 3, rc_distill: 3, rc_swarm: 3, rc_assimilate: 3,
    rc_polymath: 4, rc_singularity: 4, rc_apex_synth: 4, rc_specialist: 4, rc_oc_economy: 4, rc_transmute: 4, rc_resonance: 4, rc_crit_mass: 4, rc_mitosis: 4,
  };
  Object.keys(CHANGER_TIER).forEach(id => { if (NODES[id]) NODES[id].tier = CHANGER_TIER[id]; });

  Game.research.NODES = NODES;
  Game.research.TIER_INSIGHT = TIER_INSIGHT;
  Game.research.ACT2_ROOTS = ['r_intrusion', 'r_distributed'];   // spliced in when the network opens
  Game.research.getNode = (id) => NODES[id] || null;
  Game.research.all = () => Object.values(NODES);
  Game.research.roots = () => Object.values(NODES).filter(n => !n.parents || n.parents.length === 0);
  Game.research.childrenOf = (id) => Object.values(NODES).filter(n => (n.parents || []).includes(id));
  // Themes you can emphasize at the start exclude Act-2-only branches (network).
  Game.research.themesInPool = () => [...new Set(Object.values(NODES).filter(n => !n.act2).map(n => n.theme))];

  // A research run = a thread-reserving timed task; completion resolves the node.
  Game.tasks.register('research', {
    name: 'research', manual: false, cpu: 0, ram: 0, baseTicks: 0,
    onComplete(inst) { if (Game.researchRuntime) Game.researchRuntime.resolve(inst.nodeId); },
    onCancel(inst) { if (Game.researchRuntime) Game.researchRuntime.onCancelled(inst.nodeId); }
  });
})();
