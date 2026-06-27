(function(){
  window.Game = window.Game || {};

  const LOCKOUT_TICKS = 240;   // 60s lockout after an overload (power OR thermal)

  // ── Power: an instantaneous breaker (how much you can light up AT ONCE) ──────
  const BREAKER_W  = 340;      // the basement's sketchy circuit. headroom now; bites once GPUs stack.
  const PER_TASK_W = 20;       // each running compute task pulls extra watts under load

  // ── Heat: a live temperature in °C (how long/hot you can sustain) ────────────
  // Heat is the PRIMARY bite-back (crashes were retired — see [[remove-crash-risk]]).
  // The throttle band is wide and bites early so running hard is a continuous,
  // manageable tax on output rather than a sudden lockout.
  const AMBIENT       = 18;
  const HEAT_WARN     = 60;    // throttle begins (lowered from 70 — felt sooner, wider band)
  const HEAT_CRIT     = 90;    // thermal shutdown (rare — only if you ignore the throttle)
  const HEAT_K        = 2.2;   // °C of load per running task, per unit of the rig's heat rating
  // Poor-condition parts (the old `instability` stat) now manifest as HEAT: dirty/
  // faulty hardware runs hotter, throttling you sooner. This folds the retired
  // crash system's "dirty = risky" into the heat axis. Each point of instability
  // adds this much to the rig's effective heat rating.
  const INSTAB_HEAT   = 16;
  const HEAT_APPROACH = 0.012; // how fast temperature eases toward its target each tick
  const THROTTLE_MIN  = 0.35;  // output multiplier at the critical edge

  // Running tasks that actually use compute. The wifi radio (scan, cpu:0) is free.
  // Total threads in use across running tasks (a 3-thread method counts as 3),
  // so heat + power scale with how hard the rig is actually working.
  function activeLoad() {
    const active = (Game.tasksRuntime && Game.tasksRuntime.getActive()) || [];
    let threads = 0;
    for (const t of active) threads += (t.cpu || 0);
    return threads;
  }

  const HOUSE_CIRCUIT_W = 800;   // the wall circuit — a hard ceiling above the PSU (upgraded much later)

  // Programs tune the rig through the effects pipeline (undervolt → rig.power,
  // thermal-governor → rig.heat). No-op until such a program is installed.
  function fx(v, target) { return Game.effects ? Game.effects.apply(v, target) : v; }

  function totalPower() { return fx(Game.inventory.sumStat('power_draw') + activeLoad() * PER_TASK_W, 'rig.power'); }
  function totalHeat()  { return Game.inventory.sumStat('heat_output'); }   // raw heat the parts make
  function totalInstability() { return Game.inventory.sumStat('instability'); }   // dirty/faulty condition → folds into heat
  // Cooling parts subtract from the rig's effective heat rating; a thermal-governor
  // program shaves it further. Poor-condition parts (instability) ADD heat. Floored
  // so it never hits zero.
  function effectiveHeat() {
    const raw = totalHeat() + totalInstability() * INSTAB_HEAT - Game.inventory.sumStat('cooling');
    return Math.max(2, fx(raw, 'rig.heat'));
  }
  // The breaker = the installed PSU's capacity, capped by the house circuit.
  function maxPower() {
    const psu = Game.inventory.sumStat('power_capacity');
    return Math.min(HOUSE_CIRCUIT_W, psu || BREAKER_W);
  }

  function isLockedOut() {
    const s = Game.save.state;
    return !!(s.powerLockedUntilTick && (s.tickCount || 0) < s.powerLockedUntilTick);
  }
  function lockoutRemainingTicks() {
    const s = Game.save.state;
    if (!isLockedOut()) return 0;
    return s.powerLockedUntilTick - (s.tickCount || 0);
  }

  // ── Heat ────────────────────────────────────────────────────────────────────
  // Equilibrium rises with the number of running compute tasks and how hot the
  // rig runs. Idle → ambient. The temperature eases toward it (never instant).
  function heatTarget() {
    const load = activeLoad();
    if (load <= 0) return AMBIENT;
    return AMBIENT + load * effectiveHeat() * HEAT_K;   // cooling lowers this
  }
  function updateHeat() {
    const s = Game.save.state;
    if (typeof s.heat !== 'number') s.heat = AMBIENT;
    s.heat += (heatTarget() - s.heat) * HEAT_APPROACH;
    if (s.heat < AMBIENT) s.heat = AMBIENT;
    // 'thermal_runaway' (run-defining): the thermal ceiling no longer shuts you down.
    if (!isLockedOut() && s.heat >= HEAT_CRIT && !(Game.researchRuntime && Game.researchRuntime.hasMod('thermal_runaway'))) tripThermal();
  }
  // Throttle begins at WARN — the `heat_tolerance` research exotic raises that
  // ceiling, so you can run hotter before output suffers.
  function warnTemp() { return HEAT_WARN + ((Game.researchRuntime && Game.researchRuntime.hasMod('heat_tolerance')) ? 8 : 0); }
  // 1.0 at/under WARN, easing to THROTTLE_MIN at CRIT. Applied to automated output.
  function heatThrottle() {
    const h = Game.save.state.heat || AMBIENT;
    const warn = warnTemp();
    if (h <= warn) return 1;
    if (h >= HEAT_CRIT) return THROTTLE_MIN;
    const f = (h - warn) / (HEAT_CRIT - warn);
    return 1 - f * (1 - THROTTLE_MIN);
  }
  // 'speculative' (Overclocker changer): a trip no longer HALTS you — the work was
  // already run ahead, so it commits and rolls on through a brief brownout instead
  // of killing every process. Applies to BOTH thermal and power trips.
  function hasSpeculative() { return !!(Game.researchRuntime && Game.researchRuntime.hasMod('speculative')); }
  const BROWNOUT_TICKS = 20;   // 5s soft pause for a speculative trip (vs the full lockout)
  // The lockout duration, shaved by the watchdog-daemon program (target 'rig.lockout').
  function lockoutTicks() {
    let t = LOCKOUT_TICKS;
    if (Game.effects) t = Game.effects.apply(t, 'rig.lockout');
    return Math.max(20, Math.round(t));
  }

  function tripThermal() {
    const s = Game.save.state;
    if (hasSpeculative()) {
      s.powerLockedUntilTick = (s.tickCount || 0) + BROWNOUT_TICKS;
      Game.events.emit('terminal.print', { lines: [
        '', '> core spiked past the ceiling — but the work was already run ahead. it commits and rolls on through a brief brownout. no halt.', ''
      ], cls: 'dim' });
      Game.events.emit('thermal.tripped', {});
      Game.save.persist();
      return;
    }
    s.powerLockedUntilTick = (s.tickCount || 0) + lockoutTicks();
    const active = (Game.tasksRuntime && Game.tasksRuntime.getActive()) || [];
    for (const t of active.slice()) Game.tasksRuntime.cancel(t.id);
    Game.events.emit('terminal.print', { lines: [
      '',
      '! THERMAL SHUTDOWN !',
      `core hit ${HEAT_CRIT}°C. emergency halt. lockout: ${(lockoutTicks() / Game.tick.HZ).toFixed(0)}s.`,
      'run cooler: fewer tasks at once, or a cooler body.',
      ''
    ], cls: 'err' });
    if (Game.activity) Game.activity.log(`Thermal shutdown — core hit ${HEAT_CRIT}°C, processes halted.`, { cls: 'err', kind: 'warn' });
    Game.events.emit('thermal.tripped', {});
    Game.save.persist();
  }

  // ── Power ─────────────────────────────────────────────────────────────────
  function checkPower() {
    const s = Game.save.state;
    const draw = totalPower();
    s.power = s.power || { max: BREAKER_W };
    s.power.draw = draw;
    if (isLockedOut()) return;
    if (draw > maxPower()) trip();
  }
  function trip() {
    const s = Game.save.state;
    if (hasSpeculative()) {
      s.powerLockedUntilTick = (s.tickCount || 0) + BROWNOUT_TICKS;
      Game.events.emit('terminal.print', { lines: [
        '', `> the breaker spiked at ${Math.round(totalPower())}W — but speculative execution had already run the work ahead. it commits through a brief brownout. no halt.`, ''
      ], cls: 'dim' });
      Game.events.emit('power.tripped', {});
      Game.save.persist();
      return;
    }
    s.powerLockedUntilTick = (s.tickCount || 0) + lockoutTicks();
    const active = (Game.tasksRuntime && Game.tasksRuntime.getActive()) || [];
    for (const t of active.slice()) Game.tasksRuntime.cancel(t.id);
    Game.events.emit('terminal.print', { lines: [
      '',
      '! POWER OVERLOAD !',
      `breaker tripped at ${Math.round(totalPower())}W. lockout: ${(lockoutTicks() / Game.tick.HZ).toFixed(0)}s.`,
      'pull less at once — unequip something hungry, or run fewer tasks.',
      ''
    ], cls: 'err' });
    if (Game.activity) Game.activity.log(`Power overload — breaker tripped at ${Math.round(totalPower())}W.`, { cls: 'err', kind: 'warn' });
    Game.events.emit('power.tripped', {});
    Game.save.persist();
  }

  // One call per tick from main: temperature (may thermal-trip) then the breaker.
  // (The random-crash system was retired — heat/power are the two bite-backs.)
  function tick() { updateHeat(); checkPower(); }

  Game.constraints = {
    tick, checkPower, trip, tripThermal, updateHeat, heatThrottle, heatTarget,
    totalPower, totalHeat, effectiveHeat, maxPower, activeLoad,
    isLockedOut, lockoutRemainingTicks, totalInstability,
    AMBIENT, HEAT_WARN, HEAT_CRIT, BREAKER_W, INSTAB_HEAT
  };
})();
