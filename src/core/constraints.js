(function(){
  window.Game = window.Game || {};

  const LOCKOUT_TICKS = 240;   // 60s lockout after an overload (power OR thermal)

  // ── Power: an instantaneous breaker (how much you can light up AT ONCE) ──────
  const BREAKER_W  = 340;      // the basement's sketchy circuit. headroom now; bites once GPUs stack.
  const PER_TASK_W = 20;       // each running compute task pulls extra watts under load

  // ── Heat: a live temperature in °C (how long/hot you can sustain) ────────────
  const AMBIENT       = 18;
  const HEAT_WARN     = 70;    // throttle begins
  const HEAT_CRIT     = 90;    // thermal shutdown
  const HEAT_K        = 2.2;   // °C of load per running task, per unit of the rig's heat rating
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
  // Cooling parts subtract from the rig's effective heat rating; a thermal-governor
  // program shaves it further. Floored so it never hits zero.
  function effectiveHeat() { return Math.max(2, fx(totalHeat() - Game.inventory.sumStat('cooling'), 'rig.heat')); }
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
  function tripThermal() {
    const s = Game.save.state;
    s.powerLockedUntilTick = (s.tickCount || 0) + LOCKOUT_TICKS;
    const active = (Game.tasksRuntime && Game.tasksRuntime.getActive()) || [];
    for (const t of active.slice()) Game.tasksRuntime.cancel(t.id);
    Game.events.emit('terminal.print', { lines: [
      '',
      '! THERMAL SHUTDOWN !',
      `core hit ${HEAT_CRIT}°C. emergency halt. lockout: ${(LOCKOUT_TICKS / Game.tick.HZ).toFixed(0)}s.`,
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
    s.powerLockedUntilTick = (s.tickCount || 0) + LOCKOUT_TICKS;
    const active = (Game.tasksRuntime && Game.tasksRuntime.getActive()) || [];
    for (const t of active.slice()) Game.tasksRuntime.cancel(t.id);
    Game.events.emit('terminal.print', { lines: [
      '',
      '! POWER OVERLOAD !',
      `breaker tripped at ${Math.round(totalPower())}W. lockout: ${(LOCKOUT_TICKS / Game.tick.HZ).toFixed(0)}s.`,
      'pull less at once — unequip something hungry, or run fewer tasks.',
      ''
    ], cls: 'err' });
    if (Game.activity) Game.activity.log(`Power overload — breaker tripped at ${Math.round(totalPower())}W.`, { cls: 'err', kind: 'warn' });
    Game.events.emit('power.tripped', {});
    Game.save.persist();
  }

  // ── Instability: random crashes scaled by how hard you run ──────────────────
  // The unpredictable gremlin (vs heat's ceiling / power's breaker). A crash =
  // a "watchdog reset": tasks halt + a short reboot lockout. Clean parts keep
  // instability under the floor (never crash); cursed/overclocked builds run hot
  // dice. A watchdog (subroutine slow / program instant) resumes the earners.
  const CRASH_FLOOR         = 0.08;   // total instability under this never crashes (starter rig ~0.043)
  const CRASH_K             = 0.003;  // per-tick chance = (instability − floor) × threads-in-use × K
  const CRASH_P_MAX         = 0.05;   // clamp on per-tick chance
  const CRASH_LOCKOUT_TICKS = 40;     // 10s reboot (shorter than the 60s overload lockout)
  const CRASH_COOLDOWN_TICKS= 60;     // 15s grace after the reboot before another roll can fire
  const RECOVER_DELAY_TICKS = 16;     // basic watchdog brings tasks back 4s after reboot; daemon = instant

  function ensureCrashState(s) {
    if (!s.crash) s.crash = { recover: [], recoverAtTick: 0, cooldownUntilTick: 0, lastCrashTick: 0, count: 0 };
    if (!Array.isArray(s.crash.recover)) s.crash.recover = [];
    return s.crash;
  }
  function totalInstability() { return Game.inventory.sumStat('instability'); }
  function hasWatchdog() {
    const ins = Game.save.state.installed || {};
    return !!((ins.subroutines && ins.subroutines.watchdog_basic) || (ins.programs && ins.programs.watchdog_daemon));
  }
  function recoverDelay() {
    const ins = Game.save.state.installed || {};
    return (ins.programs && ins.programs.watchdog_daemon) ? 0 : RECOVER_DELAY_TICKS;
  }
  // Per-tick crash probability. The daemon program cuts it via the effects pipe.
  function crashRiskPerTick() {
    const eff = Math.max(0, totalInstability() - CRASH_FLOOR);
    const load = activeLoad();
    if (eff <= 0 || load <= 0) return 0;
    let p = eff * load * CRASH_K;
    p = Game.effects ? Game.effects.apply(p, 'crash.chance') : p;
    return Math.max(0, Math.min(CRASH_P_MAX, p));
  }
  // Readable "chance per minute" for the VITALS readout.
  function crashRiskPerMinPct() {
    const p = crashRiskPerTick();
    if (p <= 0) return 0;
    return (1 - Math.pow(1 - p, (Game.tick.HZ || 4) * 60)) * 100;
  }

  function triggerCrash() {
    const s = Game.save.state;
    ensureCrashState(s);
    const now = s.tickCount || 0;
    // 'speculative' (run-defining): the fault never halts you — work ran ahead, commits, rolls on.
    if (Game.researchRuntime && Game.researchRuntime.hasMod('speculative')) {
      s.crash.lastCrashTick = now; s.crash.count = (s.crash.count || 0) + 1;
      Game.events.emit('terminal.print', { lines: ['', '> a fault — but speculative execution had already run the work ahead. it commits and rolls on. no reset.', ''], cls: 'dim' });
      return;
    }
    const active = (Game.tasksRuntime && Game.tasksRuntime.getActive()) || [];
    // Stash the background earners (infinite tasks) so a watchdog can resume them.
    const recover = active.filter(t => (t.ticksTotal || 0) <= 0).map(t => ({ defId: t.defId, payload: t.payload || {} }));
    const watchdog = hasWatchdog();   // decided BEFORE the reveal installs the basic one
    for (const t of active.slice()) Game.tasksRuntime.cancel(t.id);
    s.powerLockedUntilTick = now + CRASH_LOCKOUT_TICKS;
    s.crash.lastCrashTick = now;
    s.crash.count = (s.crash.count || 0) + 1;
    s.crash.cooldownUntilTick = now + CRASH_LOCKOUT_TICKS + CRASH_COOLDOWN_TICKS;
    if (watchdog && recover.length) {
      s.crash.recover = recover;
      s.crash.recoverAtTick = now + CRASH_LOCKOUT_TICKS + recoverDelay();
    } else {
      s.crash.recover = []; s.crash.recoverAtTick = 0;
    }
    const instPct = Math.round(totalInstability() * 100);
    const lockS = (CRASH_LOCKOUT_TICKS / Game.tick.HZ).toFixed(0);
    Game.events.emit('terminal.print', { lines: [
      '',
      '! WATCHDOG RESET — your rig crashed !',
      `WHY: unstable hardware (instability ${instPct}%) faulted under load — the harder you run unstable parts, the more often this happens.`,
      `WHAT: every running process was killed and the rig rebooted. you're locked out for ${lockS}s.`,
      watchdog ? '  a watchdog is installed — your background earners come back online shortly.' : '  no watchdog: your processes stay down until you restart them. (a watchdog daemon would auto-recover them.)',
      '  lower it: cleaner / higher-tier parts run more stable, and cooling helps.',
      ''
    ], cls: 'err' });
    Game.events.emit('crash.occurred', { count: s.crash.count });
    Game.save.persist();
  }

  function rollCrash() {
    const s = Game.save.state;
    ensureCrashState(s);
    const now = s.tickCount || 0;
    if (isLockedOut()) return;
    if (now < (s.crash.cooldownUntilTick || 0)) return;
    const p = crashRiskPerTick();
    if (p > 0 && Math.random() < p) triggerCrash();
  }

  function processRecovery() {
    const s = Game.save.state;
    ensureCrashState(s);
    if (!s.crash.recover.length) return;
    const now = s.tickCount || 0;
    if (now < (s.crash.recoverAtTick || 0) || isLockedOut()) return;
    const list = s.crash.recover.slice();
    s.crash.recover = []; s.crash.recoverAtTick = 0;
    for (const r of list) Game.tasksRuntime.start(r.defId, r.payload);
    Game.events.emit('terminal.print', { lines: ['> watchdog: processes restored.', ''], cls: 'dim' });
    if (Game.activity) Game.activity.log('Watchdog restored your processes after a crash.', { cls: 'dim', kind: 'event' });
    Game.events.emit('crash.recovered', {});
    Game.save.persist();
  }

  // One call per tick from main: temperature (may thermal-trip), breaker, then
  // the crash roll + any pending watchdog recovery.
  function tick() { updateHeat(); checkPower(); rollCrash(); processRecovery(); }

  Game.constraints = {
    tick, checkPower, trip, tripThermal, updateHeat, heatThrottle, heatTarget,
    totalPower, totalHeat, effectiveHeat, maxPower, activeLoad,
    isLockedOut, lockoutRemainingTicks,
    totalInstability, crashRiskPerTick, crashRiskPerMinPct, triggerCrash, hasWatchdog,
    AMBIENT, HEAT_WARN, HEAT_CRIT, BREAKER_W, CRASH_FLOOR
  };
})();
