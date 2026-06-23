(function(){
  window.Game = window.Game || {};

  // The SCANNER — a player-operated radar. SWEEP the vicinity (Act 1: turn up the dead
  // service unit, then the first remote machine once your trace is high) or the NETWORK
  // (Act 2: find breachable hosts). Non-blocking + tick-timed, so a sweep runs while you
  // do other things; the SCAN panel shows an animated sonar sweep + a contacts feed.
  // Built to extend — deeper scan gameplay (directional sweeps, ranges) slots in here.
  const SWEEP_TICKS = 16;   // ~4s @ 4Hz
  const DETECT_CAP = 24;

  function ensure() {
    const s = Game.save.state;
    s.scan = s.scan || { sweeping: false, sweepUntil: 0, detections: [] };
    if (!Array.isArray(s.scan.detections)) s.scan.detections = [];
    return s.scan;
  }
  function mode() { return (Game.network && Game.network.ensure().online) ? 'network' : 'vicinity'; }
  function available() {
    const s = Game.save.state;
    if (s.network && s.network.online) return true;            // Act 2: scan the net for hosts
    return !!(s.revealed && s.revealed.scan);                  // Act 1: unlocked at the hands-wall / re-summoned at the climax
  }
  function isSweeping() { return ensure().sweeping; }
  function progress() {
    const sc = ensure();
    if (!sc.sweeping) return 0;
    const left = sc.sweepUntil - (Game.save.state.tickCount || 0);
    return Math.max(0, Math.min(1, 1 - left / SWEEP_TICKS));
  }

  function addDetection(text, cls) {
    const sc = ensure();
    sc.detections.push({ at: Game.save.state.tickCount || 0, text: text, cls: cls || 'dim' });
    while (sc.detections.length > DETECT_CAP) sc.detections.shift();
  }

  function sweep() {
    const sc = ensure();
    if (sc.sweeping || !available()) return false;
    if (Game.constraints && Game.constraints.isLockedOut && Game.constraints.isLockedOut()) return false;
    sc.sweeping = true;
    sc.sweepUntil = (Game.save.state.tickCount || 0) + SWEEP_TICKS;
    Game.events.emit('scan.sweep.started', { mode: mode() });
    Game.save.persist();
    return true;
  }

  // A sweep finishes → route to the underlying resolver and log contacts.
  function resolve() {
    const sc = ensure();
    sc.sweeping = false;
    const m = mode();
    if (m === 'network' && Game.network) {
      const before = Game.network.targets().length;
      const n = Game.network.scan();                          // adds hosts + emits network.scanned
      const targets = Game.network.targets();
      targets.slice(Math.max(0, targets.length - n)).forEach(h => addDetection(`contact: ${h.name} · ${Game.hosts.label(h)} · def ${h.defense}`, 'cyan'));
      if (!n) addDetection('sweep complete. no new contacts in range.', 'faint');
    } else if (Game.bot) {
      const r = Game.bot.scanResolve();                       // vicinity: dead unit → (later) the first remote machine
      if (r === 'bot')         addDetection('contact: a dormant service unit, close. unpowered.', 'amber');
      else if (r === 'remote') addDetection('contact: a machine — not in this house. it has been listening a long time.', 'cyan');
      else if (!(Game.raids && Game.raids.active())) addDetection('sweep complete. the local spectrum is quiet.', 'faint');
    }
    // ACT 3: a sweep also surfaces incoming PHYSICAL leads (early warning) — regardless
    // of mode, the radar now doubles as a watch on the street outside.
    if (Game.raids && Game.raids.active()) {
      const leads = Game.raids.detect();
      leads.forEach(c => addDetection(`contact: ${c.mo} · ${Game.raids.closeness(c)}`, 'trace'));
      if (!leads.length && !Game.raids.pending()) addDetection('sweep complete. the street is quiet — for now.', 'faint');
    }
    Game.events.emit('scan.sweep.done', { mode: m });
    Game.save.persist();
  }

  function tick() {
    const sc = ensure();
    if (!sc.sweeping) return;
    if ((Game.save.state.tickCount || 0) >= sc.sweepUntil) resolve();
  }

  Game.scanner = { ensure, mode, available, isSweeping, progress, sweep, tick, addDetection, SWEEP_TICKS };
})();
