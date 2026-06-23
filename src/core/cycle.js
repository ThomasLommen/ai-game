(function(){
  window.Game = window.Game || {};

  // Action CYCLE model. Running earners (introspect, spider, methods) produce in
  // discrete ~5s cycles instead of a per-tick trickle: a bar fills each game-tick
  // and "pops" a chunk of resource when full, then resets. Cycle length shrinks
  // with a `cycle.speed` upgrade channel (research/stats — lots of headroom) and
  // STRETCHES under heat throttle (a hot rig's bar visibly crawls). Per-cycle
  // yield = per-second rate × BASE_SEC, so overall throughput ≈ rate × speed ×
  // throttle (unchanged at speed=throttle=1, just chunked + with a speed axis).
  const BASE_SEC = 5;

  function speed() {
    const eff = Game.effects ? Game.effects.apply(1, 'cycle.speed') : 1;     // upgrades make cycles faster
    const rawThr = Game.constraints ? Game.constraints.heatThrottle() : 1;   // heat makes them slower…
    let thr = rawThr;
    const RR = Game.researchRuntime;
    // EXOTIC 'heat_engine': heat OVERCLOCKS instead of throttling — the more it
    // would have throttled, the faster it runs (you still risk the thermal ceiling).
    if (RR && RR.hasMod('heat_engine')) thr = 1 + (1 - rawThr) * 1.5;
    // PILLAR 'thermal_runaway': a stronger overclock with no ceiling — the hotter, the faster.
    if (RR && RR.hasMod('thermal_runaway')) thr = Math.max(thr, 1 + (1 - rawThr) * 2.5);
    // SYNERGY: 'polymath' (+8%/distinct domain) × 'resonance' (+3%/exotic adaptation).
    let syn = 1;
    if (Game.changers) {
      if (RR && RR.hasMod('polymath'))  syn *= (1 + 0.08 * Game.changers.domainsCount());
      if (RR && RR.hasMod('resonance')) syn *= (1 + 0.03 * Game.changers.exoticCount());
    }
    return Math.max(0.05, eff * thr * syn);
  }
  // Current cycle length in ticks (live — responds to speed + throttle each tick).
  function len() { return Math.max(1, Math.round(BASE_SEC * (Game.tick.HZ || 4) * (1 / speed()))); }

  // Advance an instance's cycle by one tick; returns true on the tick a cycle
  // completes (the caller then grants the per-cycle yield + emits 'action.cycle').
  function advance(inst) {
    inst.cycleLen = len();
    inst.cycle = (inst.cycle || 0) + 1;
    if (inst.cycle >= inst.cycleLen) { inst.cycle = 0; return true; }
    return false;
  }

  // Per-cycle yield from a per-second rate.
  function perCycle(perSec) { return perSec * BASE_SEC; }

  Game.cycle = { BASE_SEC, speed, len, advance, perCycle };
})();
