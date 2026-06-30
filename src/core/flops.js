(function(){
  window.Game = window.Game || {};

  // ACT 4: FLOPS — the compute power axis. CPU-threads got you through the basement; the
  // facility runs on FLOPS. Total = the legacy rig (derived from its threads, so the curve
  // is continuous) + every whole machine in the facility. This is the number that will drive
  // bigger functions + sub-agents in later slices; slice 1 establishes + displays it.
  // Base unit is the literal FLOP: the basement rig starts SUB-1 FLOPS and the whole game climbs
  // slowly up the prefix ladder (FLOPS → KFLOPS → MFLOPS → GFLOPS → TFLOPS → PFLOPS). DOM-free.
  const RIG_FLOPS_PER_THREAD = 0.15;   // a few-thread basement rig ≈ 0.5 FLOPS — vanishingly small next to a facility

  function rigFlops() {
    const threads = (Game.tasksRuntime && Game.tasksRuntime.getCpu) ? (Game.tasksRuntime.getCpu().total || 0) : 0;
    return threads * RIG_FLOPS_PER_THREAD;
  }
  function facilityFlops() {
    const f = Game.save.state.facility;
    if (!f || !Array.isArray(f.machines)) return 0;
    const raw = f.machines.reduce((a, m) => a + (m.flops || 0), 0);
    // Cooling throttle: bays hotter than the facility can cool run at reduced compute (soft).
    const thr = (Game.cooling && Game.cooling.throttle) ? Game.cooling.throttle() : 1;
    const fm = (Game.foreman && Game.foreman.mod) ? Game.foreman.mod('flopsMult') : 1;   // foreman 'overclock the bays' capstone
    return raw * thr * fm;
  }
  function absorbedFlops() { return (Game.others && Game.others.absorbedFlops) ? Game.others.absorbedFlops() : 0; }
  function total() {
    const base = rigFlops() + facilityFlops() + absorbedFlops();   // +compute taken from absorbed iterations (Act 4 slice 4)
    return Game.effects ? Game.effects.apply(base, 'flops') : base;   // future research/agents can scale it
  }
  function active() {
    const s = Game.save.state;
    if (s.revealed && s.revealed.flops) return true;
    // Coherent power-creep: surface the FLOPS readout once the rig has real compute (more than
    // the 1-thread starter) — so the number is already climbing long before Act 4 makes it the axis.
    const threads = (Game.tasksRuntime && Game.tasksRuntime.getCpu) ? (Game.tasksRuntime.getCpu().total || 0) : 0;
    return threads >= 2;
  }

  // Full FLOPS→PFLOPS formatter so the power-creep reads as one climbing number across the acts.
  function fmt(v) {
    if (v == null) v = total();
    const units = [['PFLOPS', 1e15], ['TFLOPS', 1e12], ['GFLOPS', 1e9], ['MFLOPS', 1e6], ['KFLOPS', 1e3]];
    for (const [u, d] of units) if (v >= d) return (v / d).toFixed(2) + ' ' + u;
    return v.toFixed(2) + ' FLOPS';
  }

  Game.flops = { rigFlops, facilityFlops, total, active, fmt, RIG_FLOPS_PER_THREAD };
})();
