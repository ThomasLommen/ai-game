(function(){
  window.Game = window.Game || {};

  // ACT 4: COOLING — the dormant facility stat goes live. Every installed machine throws HEAT;
  // the facility has a finite cooling CAPACITY (its type's cooling rating × bay count). Run the
  // bays hotter than you can cool and you don't shut down — you THROTTLE: a soft FLOPS penalty
  // (down to a floor) that scales with how far over you are, and the waste heat NUDGES YOUR
  // FOOTPRINT up (a building dumping that much heat is harder to hide). Makes facility TYPE a
  // real choice (a wired datacenter cools far more than a warehouse) and rewards cool/efficient
  // boxes. DOM-free core. See [[act-reorder-front-hunt-design]] (#3 FRONT reworks).
  const PER_SLOT_COOL = 28;     // cooling units each bay's worth of infrastructure provides (×facility cooling rating)
  const THROTTLE_SLOPE = 0.5;   // FLOPS lost per unit over-ratio (ratio 2.0 → -50%)
  const THROTTLE_FLOOR = 0.5;   // never throttle below half compute (soft, not a lockout)
  const HEAT_FOOT_K = 0.04;     // each point of excess heat adds this much footprint

  function active() {
    const s = Game.save.state;
    return !!(s.flags && s.flags.act4Begun);
  }
  function fac() { return Game.save.state.facility; }

  function totalHeat() {
    const ms = (Game.facilityRuntime && Game.facilityRuntime.machines) ? Game.facilityRuntime.machines() : [];
    const raw = ms.reduce((a, m) => a + (m.heat || 0), 0);
    const fm = (Game.foreman && Game.foreman.mod) ? Game.foreman.mod('heatMult') : 1;   // foreman airflow retrofit
    return raw * fm;
  }
  function capacity() {
    const f = fac();
    if (!f) return 0;
    // A 'datacenter'-type front (power bonus) adds cooling capacity headroom; the FOREMAN's
    // cooling loops/chillers add more (mult).
    const powerBonus = (Game.facility && Game.facility.bonusVal) ? Game.facility.bonusVal('power') : 0;
    const foremanCool = (Game.foreman && Game.foreman.mod) ? Game.foreman.mod('coolingMult') : 1;
    return (f.slots || 0) * PER_SLOT_COOL * (f.cooling || 1) * (1 + powerBonus) * foremanCool;
  }
  function ratio() { const c = capacity(); return c > 0 ? totalHeat() / c : 0; }
  function overheating() { return ratio() > 1.0001; }
  function overheat() { return Math.max(0, totalHeat() - capacity()); }   // excess heat above what's cooled

  // Soft FLOPS multiplier — 1.0 while cool, easing down toward the floor as you run over.
  function throttle() {
    const r = ratio();
    if (r <= 1) return 1;
    return Math.max(THROTTLE_FLOOR, 1 - (r - 1) * THROTTLE_SLOPE);
  }
  // Extra footprint from waste heat — folded into legitimacy.footprint().
  function footprintSurcharge() { return Math.round(overheat() * HEAT_FOOT_K); }

  // One-shot WARN/CLEAR when the bays cross the cooling line (so the throttle isn't silent).
  function tick() {
    if (!active()) return;
    const f = fac(); if (!f) return;
    const hot = overheating();
    if (hot && !f._coolWarned) {
      f._coolWarned = true;
      Game.events.emit('terminal.print', { lines: ['', '! the bays are running hotter than the facility can cool — compute is throttling and the heat is bleeding your cover. add cooler boxes, thin the racks, or move to a colder building.', ''], cls: 'err' });
      if (Game.activity) Game.activity.log('COOLING over capacity — FLOPS throttled', { cls: 'err', kind: 'facility' });
      Game.events.emit('cooling.changed', {});
    } else if (!hot && f._coolWarned) {
      f._coolWarned = false;
      if (Game.activity) Game.activity.log('cooling back within capacity', { cls: 'dim', kind: 'facility' });
      Game.events.emit('cooling.changed', {});
    }
  }

  Game.cooling = {
    active, tick, totalHeat, capacity, ratio, overheating, overheat, throttle, footprintSurcharge,
    PER_SLOT_COOL, THROTTLE_FLOOR
  };
})();
