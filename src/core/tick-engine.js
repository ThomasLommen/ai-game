(function(){
  window.Game = window.Game || {};

  const TICK_HZ = 4;                       // ticks per second
  const TICK_MS = 1000 / TICK_HZ;
  const MAX_OFFLINE_HOURS = 8;
  const PERSIST_EVERY_N_TICKS = 40;        // ~10s at 4Hz

  let running = false;
  let last = 0;
  let acc = 0;

  function loop(now) {
    if (!running) return;
    const dt = now - last;
    last = now;
    // PAUSE: while a forced-decision overlay is open (an event, an operation/mission
    // stage choice, the bot first-contact), freeze game time entirely — no production,
    // timers, schedules, or decay — so the player decides without a clock running.
    // Reset the accumulator so resuming doesn't dump a burst of catch-up ticks.
    if (Game.paused && Game.paused()) { acc = 0; requestAnimationFrame(loop); return; }
    acc += dt;
    let safety = 0;
    while (acc >= TICK_MS && safety < 200) {
      doTick();
      acc -= TICK_MS;
      safety++;
    }
    requestAnimationFrame(loop);
  }

  function doTick() {
    const s = Game.save.state;
    s.tickCount = (s.tickCount || 0) + 1;
    s.lastTickAt = Date.now();
    Game.events.emit('tick', { count: s.tickCount });
    if (s.tickCount % PERSIST_EVERY_N_TICKS === 0) Game.save.persist();
  }

  Game.tick = {
    HZ: TICK_HZ,
    MS: TICK_MS,

    start() {
      if (running) return;
      running = true;
      last = performance.now();
      acc = 0;
      requestAnimationFrame(loop);
      Game.events.emit('engine.start');
    },

    stop() { running = false; },

    runOfflineCatchup() {
      const s = Game.save.state;
      const now = Date.now();
      const elapsed = Math.min(now - (s.lastTickAt || now), MAX_OFFLINE_HOURS * 3600 * 1000);
      const ticks = Math.floor(elapsed / TICK_MS);
      if (ticks <= 0) return 0;
      for (let i = 0; i < ticks; i++) doTick();
      Game.events.emit('engine.offlineCatchup', { ticks, elapsedMs: elapsed });
      return ticks;
    }
  };
})();
