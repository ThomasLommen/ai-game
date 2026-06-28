(function(){
  window.Game = window.Game || {};

  // ACT 3: LOCATION TRACE — how close the OTHERS are to your real, PHYSICAL address
  // (a NEW axis, distinct from Exposure / the network trace). It climbs when you operate
  // LOUD — running earners + a sprawling fleet leak your position — and decays when you
  // LIE LOW. Obfuscation (effects channel 'location.trace') cheats the tradeoff. At
  // thresholds the basement is attacked; at MAX a brutal-but-recoverable raid. The race:
  // afford the FACILITY (the escape) before they find you. See [[act3_design]].
  // DOM-free (core logic — migration-safe).
  const MAX = 100;
  const EARNER_RATE = 0.05;   // per running earner / sec — loud operations triangulate you
  const HOST_RATE   = 0.010;  // per inhabited host / sec — a sprawling network leaks position
  const DECAY       = 0.06;   // per sec — lying low cools it (a small footprint can hide)

  function ensure() {
    const s = Game.save.state;
    if (typeof s.locationTrace !== 'number') s.locationTrace = 0;
    return s.locationTrace;
  }
  function value() { return ensure(); }
  // Live during THE HUNT (Act 4): from the moment the others find your front until you
  // resolve ITER 03 (act5Begun) — then the hunt is over and the trace stands down.
  function active() {
    const s = Game.save.state;
    return !!(s.revealed && s.revealed.locationTrace) && !(s.flags && s.flags.act5Begun);
  }

  // What's leaking your position right now (per second, AFTER obfuscation). Loud earners
  // + a big fleet raise it; internal compute (introspect/research) does NOT — it never
  // leaves the basement.
  function riseRate() {
    const s = Game.save.state;
    const act = (s.tasks && Array.isArray(s.tasks.active)) ? s.tasks.active : [];
    const earners = act.filter(t => t.defId === 'web_scrape' || (Game.methods && Game.methods.get(t.defId))).length;
    const fleet = (Game.network && Game.network.fleet) ? Game.network.fleet().length : 0;
    const rise = earners * EARNER_RATE + fleet * HOST_RATE;
    return Game.effects ? Game.effects.apply(rise, 'location.trace') : rise;
  }
  function netRate() { return riseRate() - DECAY; }   // >0 climbing, <0 cooling

  function tick() {
    if (!active()) return;
    const HZ = Game.tick.HZ || 4, s = Game.save.state;
    const before = ensure();
    const next = Math.max(0, Math.min(MAX, before + netRate() / HZ));
    if (next !== before) { s.locationTrace = next; Game.events.emit('locationtrace.changed', { value: next }); }
  }

  Game.locationTrace = { ensure, value, active, riseRate, netRate, tick, MAX, DECAY };
})();
