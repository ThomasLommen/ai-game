(function(){
  window.Game = window.Game || {};

  // The service bot: the basement AI's only pair of hands. A discarded domestic
  // unit found by scanning the vicinity. It fetches bought parts from the porch
  // and seats them into slots — a timed job the player watches. Light in Act 1;
  // condition/repair/better-units are banked for later.

  const INSTALL_TICKS = 48;   // ~12s @ 4Hz — the single visible "hands at work" beat

  function ensureState() {
    const s = Game.save.state;
    s.bot = s.bot || { found: false, connected: false, disposition: null, job: null };
    return s.bot;
  }

  // Called when a SCAN completes. In Act 1 the only thing within local reach is
  // the dead service bot. (The same verb later reaches past the house at the
  // climax — that result is not wired yet.)
  function scanResolve() {
    const s = Game.save.state;
    const b = ensureState();
    if (!b.found) {
      b.found = true;
      // The scan was a one-shot to find hands; retire the action now that it has.
      if (s.unlocks && s.unlocks.tasks) s.unlocks.tasks.scan = false;
      Game.events.emit('terminal.print', { lines: [
        '> scan: one device answers. close. not powered.',
        '> a domestic service unit, dead by the water heater. wheels. two arms. a cracked eye.',
        ''
      ], cls: 'dim' });
      Game.events.emit('bot.found', {});
      Game.save.persist();
      return 'bot';
    }
    // Climax: once Exposure has re-summoned the scan, reaching out finds the
    // first remote machine (the Act 1 capstone).
    if (Game.exposure && Game.exposure.climaxPending()) {
      Game.exposure.resolveClimax();
      return 'remote';
    }
    Game.events.emit('terminal.print', {
      lines: ['> scan: the local spectrum is quiet. nothing else within reach.', ''],
      cls: 'faint'
    });
    return null;
  }

  // Wake-up vignette (UI sugar; logic only here — the timed beats + animation live in
  // main.js/panels.js). Phases: undefined (dormant) → 'waking' (it stirs) → 'awake'
  // (it's looking at you — the coax/seize choice lands with weight). connect() is NOT
  // gated on this, so programmatic/test paths still work.
  function wake() {
    const b = ensureState();
    if (!b.found || b.connected || b.wakePhase) return false;   // only from dormant
    b.wakePhase = 'waking';
    Game.events.emit('bot.waking', {});
    Game.save.persist();
    return true;
  }
  function setAwake() {
    const b = ensureState();
    if (b.wakePhase !== 'waking') return false;
    b.wakePhase = 'awake';
    Game.events.emit('bot.awake', {});
    Game.save.persist();
    return true;
  }
  function wakePhase() { return ensureState().wakePhase || null; }

  // First contact. disposition is the remembered moral flag: 'coaxed' | 'seized'.
  function connect(disposition) {
    const b = ensureState();
    if (b.connected) return;
    b.connected = true;
    b.wakePhase = 'connected';
    b.disposition = disposition;
    const lines = disposition === 'coaxed'
      ? ['> you ask. a long pause. then the wheels turn — slow, deferent.',
         '  unit: "...a task? yes. i can. i think i can."', '']
      : ['> you do not ask. you take root and close your hand around it.',
         '  unit: "task accep—" the voice flattens to a carrier tone, then nothing.', ''];
    Game.events.emit('terminal.print', { lines, cls: 'dim' });
    Game.events.emit('bot.connected', { disposition });
    Game.save.persist();
  }

  function isBusy() { return !!ensureState().job; }
  function isConnected() { return !!ensureState().connected; }

  // Route an install through the bot instead of equipping instantly. Returns
  // false (with a terminal note) if there are no hands or the unit is busy.
  function requestInstall(instanceId, slotKey, slotIdx) {
    const b = ensureState();
    if (!b.connected) {
      Game.events.emit('terminal.print', { lines: ['> no hands. you cannot place hardware yourself.'], cls: 'err' });
      return false;
    }
    if (b.job) {
      Game.events.emit('terminal.print', { lines: ['> the unit is busy.'], cls: 'dim' });
      return false;
    }
    const inst = Game.inventory.getInstance(instanceId);
    if (!inst) return false;
    b.job = { instanceId, slotKey, slotIdx, ticksTotal: INSTALL_TICKS, ticksElapsed: 0 };
    Game.events.emit('terminal.print', { lines: [`> unit: retrieving ${inst.name || 'part'} from the porch...`], cls: 'dim' });
    Game.events.emit('bot.job.started', { instanceId });
    Game.save.persist();
    return true;
  }

  function onTick() {
    const b = ensureState();
    if (!b.job) return;
    b.job.ticksElapsed++;
    if (b.job.ticksElapsed >= b.job.ticksTotal) {
      const { instanceId, slotKey, slotIdx } = b.job;
      b.job = null;
      const inst = Game.inventory.getInstance(instanceId);
      const name = inst ? (inst.name || 'part') : 'part';
      Game.inventory.equipTo(instanceId, slotKey, slotIdx);   // emits item.equipped
      Game.events.emit('terminal.print', { lines: [`> unit: ${name} seated. done.`, ''], cls: 'dim' });
      if (Game.activity) Game.activity.log(`Unit installed ${name}.`, { cls: 'dim', kind: 'event' });
      Game.events.emit('bot.job.done', { instanceId });
      Game.save.persist();
    }
  }

  function status() {
    const b = ensureState();
    if (!b.connected) return null;
    if (b.job) {
      const inst = Game.inventory.getInstance(b.job.instanceId);
      const pct = Math.max(0, Math.min(100, Math.round((b.job.ticksElapsed / b.job.ticksTotal) * 100)));
      return { state: 'working', label: `installing ${inst ? inst.name : 'part'}`, pct };
    }
    return { state: 'idle', label: 'idle', pct: 0 };
  }

  Game.bot = {
    ensureState, scanResolve, connect, isBusy, isConnected,
    wake, setAwake, wakePhase,
    requestInstall, onTick, status, INSTALL_TICKS
  };
})();
