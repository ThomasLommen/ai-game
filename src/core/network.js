(function(){
  window.Game = window.Game || {};

  // THE NETWORK (Act 2). Expand past the basement into a fleet of inhabited remote
  // bodies. SCAN discovers hosts; BREACH is a COMPUTE POWER-CHECK (your breach-power
  // vs the host's defense) → INHABIT. Inhabited hosts' threads feed breach-power
  // (the flywheel): more bodies → more compute → crack harder hosts → more bodies.
  // Slice 1: model + scan + breach + the first (cyan) host. (Fleet runs tasks,
  // churn, and the hunter come in later slices — see [[act2_design]].)
  const SCAN_MIN = 2, SCAN_MAX = 4;
  // Hunter (slice 3): your trace = Exposure (its Act-2 evolution). A big network is
  // noisy; IoT covers for you; at STRIKE the hunter burns a chunk of the fleet.
  const STRIKE = 40;                    // trace at which the hunter strikes
  const STRIKE_FRACTION = 0.33;         // share of the (non-origin) fleet burned per strike
  const STRIKE_DROP = 0.25;             // trace falls to STRIKE×this after a strike (you go dark)
  const STRIKE_COOLDOWN_TICKS = 240;    // ~60s before it can strike again
  const FOOTPRINT_PER_HOST_SEC = 0.01;  // a sprawling network is inherently loud
  const IOT_COVER_PER_SEC = 0.02;       // each router/IoT body launders traffic (cuts trace)
  const HUNTER_CUES = [
    { at: 22, line: '> an abuse report is filed against a block you route through. probably nothing.' },
    { at: 30, line: '> a CERT advisory describes your traffic pattern. they have a name for it now.' }
  ];

  function ensure() {
    const s = Game.save.state;
    s.network = s.network || { hosts: [], online: false, scans: 0 };
    if (!Array.isArray(s.network.hosts)) s.network.hosts = [];
    // Seed the origin (cyan) host once Act 1's climax has found it.
    if (s.flags && s.flags.remoteFound && !s.network.hosts.some(h => h.id === 'host_origin')) {
      s.network.hosts.unshift(Game.hosts.origin());
    }
    return s.network;
  }

  const hosts   = () => ensure().hosts;
  const fleet   = () => hosts().filter(h => h.inhabited);
  const targets = () => hosts().filter(h => !h.inhabited);

  // Your breach-power = rig threads + every inhabited body's threads (the flywheel).
  // Routed through the effects pipeline so future breach-tool research can boost it.
  function breachPower() {
    const rig = Game.tasksRuntime ? Game.tasksRuntime.getCpu().total : 0;
    const fleetThreads = fleet().reduce((a, h) => a + (h.threads || 0), 0);
    const base = rig + fleetThreads;
    return Game.effects ? Game.effects.apply(base, 'breach.power') : base;
  }

  // The power-check: more compute over the host's defense = better odds.
  function breachChance(host) {
    if (!host) return 0;
    const P = breachPower(), D = Math.max(1, host.defense || 1);
    return Math.max(0.05, Math.min(0.98, (P / D) * 0.7));
  }

  function breach(hostId) {
    const net = ensure();
    const host = net.hosts.find(h => h.id === hostId);
    if (!host || host.inhabited) return false;
    if (Game.rng.chance(breachChance(host))) {
      host.inhabited = true;
      host.stability = 1;   // a fresh foothold; decays over time (churn) unless shored up
      const first = !!host.origin && !net.online;
      if (first) net.online = true;
      Game.events.emit('host.inhabited', { host, first });
      Game.save.persist();
      return true;
    }
    // A failed probe leaves a trace — proto hunter-heat (uses Exposure for now;
    // the dedicated hunter meter arrives in a later slice).
    if (typeof Game.save.state.exposure === 'number') Game.save.state.exposure += 1;
    Game.events.emit('breach.failed', { host });
    Game.events.emit('terminal.print', { lines: [`> breach failed: ${host.name}. the probe was logged.`], cls: 'err' });
    Game.save.persist();
    return false;
  }

  // Marquee targets (corporate/datacenter) are taken by a multi-stage OPERATION
  // (a heist), not a single breach roll — far more value, far more drama.
  function isMarquee(host) { return !!host && (host.type === 'corporate' || host.type === 'datacenter'); }
  function infiltrate(hostId) {
    const net = ensure();
    const host = net.hosts.find(h => h.id === hostId);
    if (!host || host.inhabited) return false;
    if (!isMarquee(host)) return false;
    const tmpl = Game.operations && Game.operations.forHostType(host.type);
    if (!tmpl || !Game.operationRuntime) return false;
    if (Game.save.state.operation) { Game.events.emit('operation.rejected', { reason: 'op_active' }); return false; }
    return Game.operationRuntime.begin({ opId: tmpl.id, hostId });
  }

  function scan() {
    const net = ensure();
    // IoT/router bodies are stealth REACH — each pair found extends a scan's range.
    const reach = fleet().filter(h => h.type === 'iot').length;
    const n = SCAN_MIN + Game.rng.int(0, SCAN_MAX - SCAN_MIN) + Math.min(3, Math.floor(reach / 2));
    for (let i = 0; i < n; i++) net.hosts.push(Game.hosts.generate());
    net.scans++;
    Game.events.emit('network.scanned', { count: n });
    Game.save.persist();
    return n;
  }

  // The fleet's passive ROLE output, summed (per second) — for the UI readout.
  function fleetOutput() {
    let coh = 0, cash = 0;
    for (const h of fleet()) {
      const pr = (Game.hosts.TYPES[h.type] || {}).produce;
      if (!pr) continue;
      const per = (pr.perThreadSec || 0) * (h.threads || 0);
      if (pr.res === 'insight') coh += per; else if (pr.res === 'cash') cash += per;
    }
    return {
      coherence: Game.effects ? Game.effects.apply(coh, 'fleet.coherence') : coh,
      cash:      Game.effects ? Game.effects.apply(cash, 'fleet.cash') : cash
    };
  }

  // Cost to shore up (reset) a host's stability — re-securing the foothold.
  function shoreCost(host) { return Math.round(8 + (host.threads || 0) * 3); }
  function shoreUp(hostId) {
    const net = ensure();
    const host = net.hosts.find(h => h.id === hostId && h.inhabited);
    if (!host) return false;
    const cost = shoreCost(host), s = Game.save.state;
    if ((s.resources.cash || 0) < cost) return false;
    s.resources.cash -= cost; host.stability = 1;
    Game.events.emit('resource.changed', { id: 'cash', value: s.resources.cash });
    Game.events.emit('network.changed', {});
    Game.save.persist();
    return true;
  }

  // The hunter: escalation cues as your trace climbs, then a STRIKE that burns a
  // chunk of the fleet (loudest first), drops your trace, and goes on cooldown.
  function checkHunter() {
    const net = ensure(), s = Game.save.state;
    if (!net.online) return;
    const e = s.exposure || 0;
    net.hunterCue = net.hunterCue || 0;
    for (let i = 0; i < HUNTER_CUES.length; i++) {
      if (e >= HUNTER_CUES[i].at && net.hunterCue < i + 1) {
        net.hunterCue = i + 1;
        Game.events.emit('terminal.print', { lines: ['', HUNTER_CUES[i].line, ''], cls: 'err' });
      }
    }
    if (e >= STRIKE && (s.tickCount || 0) >= (net.hunterCooldownUntil || 0)) strike();
  }
  function strike() {
    const net = ensure(), s = Game.save.state;
    const burnable = net.hosts.filter(h => h.inhabited && !h.origin);   // the origin body is spared
    const lost = [];
    if (burnable.length) {
      const lose = Math.max(1, Math.round(burnable.length * STRIKE_FRACTION));
      burnable.sort((a, b) => (((b.threads || 0) + (b.type === 'corporate' ? 5 : 0) + Game.rng.next()) - ((a.threads || 0) + (a.type === 'corporate' ? 5 : 0) + Game.rng.next())));
      lost.push(...burnable.slice(0, lose));
      net.hosts = net.hosts.filter(h => lost.indexOf(h) < 0);
    }
    s.exposure = STRIKE * STRIKE_DROP;
    net.hunterCue = 0;
    net.hunterCooldownUntil = (s.tickCount || 0) + STRIKE_COOLDOWN_TICKS;
    Game.events.emit('hunter.struck', { lost });
    Game.events.emit('terminal.print', { lines: ['', `! they moved on your network — ${lost.length} ${lost.length === 1 ? 'node' : 'nodes'} burned in seconds, faster than any human team.`, '! you go dark. for now.', ''], cls: 'err' });
    Game.save.persist();
  }
  function hunterTrace() { return { trace: Game.save.state.exposure || 0, strike: STRIKE, cue: (ensure().hunterCue || 0) }; }

  // Each game tick: the fleet earns by role (remote — no basement heat); stability
  // decays (churn → reclaim at 0); the network's footprint feeds the hunter.
  function tick() {
    const net = ensure();
    const f = net.hosts.filter(h => h.inhabited);
    if (!f.length && !net.online) return;
    const HZ = Game.tick.HZ || 4, s = Game.save.state;

    let coh = 0, cash = 0, exp = 0;
    for (const h of f) {
      const pr = (Game.hosts.TYPES[h.type] || {}).produce;
      if (pr) {
        const per = (pr.perThreadSec || 0) * (h.threads || 0) / HZ;
        if (pr.res === 'insight') coh += per; else if (pr.res === 'cash') cash += per;
        if (pr.exposurePerThreadSec) exp += pr.exposurePerThreadSec * (h.threads || 0) / HZ;
      }
    }
    // Churn: stability decays; reclaim at 0 (the origin body never churns).
    // Decay rate routed through 'host.churn' so Act-2 persistence research slows it.
    const reclaimed = [];
    for (const h of f) {
      if (h.origin) continue;
      if (h.stability == null) h.stability = 1;
      const churn = Game.effects.apply((Game.hosts.TYPES[h.type] || {}).churnPerSec || 0.003, 'host.churn');
      h.stability -= churn / HZ;
      if (h.stability <= 0) reclaimed.push(h);
    }
    // Hunter footprint: a noisy network raises your trace; IoT bodies cover for you.
    // The footprint term routes through 'hunter.trace' (obfuscation research cuts it);
    // IoT cover is applied AFTER so reducing footprint never weakens going dark.
    if (net.online) {
      const iot = f.filter(h => h.type === 'iot').length;
      const footprint = Game.effects.apply(FOOTPRINT_PER_HOST_SEC * f.length, 'hunter.trace');
      exp += (footprint - IOT_COVER_PER_SEC * iot) / HZ;
    }

    if (coh) { coh = Game.effects.apply(coh, 'fleet.coherence'); s.resources.insight = (s.resources.insight || 0) + coh; Game.events.emit('resource.changed', { id: 'insight', value: s.resources.insight, delta: coh }); }
    if (cash) { cash = Game.effects.apply(cash, 'fleet.cash'); s.resources.cash = (s.resources.cash || 0) + cash; Game.events.emit('resource.changed', { id: 'cash', value: s.resources.cash, delta: cash }); }
    if (exp && s.revealed && s.revealed.exposure) { s.exposure = Math.max(0, (s.exposure || 0) + exp); Game.events.emit('resource.changed', { id: 'exposure', value: s.exposure, delta: exp }); }

    if (reclaimed.length) {
      net.hosts = net.hosts.filter(h => reclaimed.indexOf(h) < 0);
      reclaimed.forEach(h => Game.events.emit('host.reclaimed', { host: h }));
      Game.save.persist();
    }
    checkHunter();
  }

  Game.network = { ensure, hosts, fleet, targets, breachPower, breachChance, breach, isMarquee, infiltrate, scan, tick, fleetOutput, shoreUp, shoreCost, hunterTrace, STRIKE };
})();
