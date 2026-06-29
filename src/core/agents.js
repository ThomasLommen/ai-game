(function(){
  window.Game = window.Game || {};

  // ACT 4: the AGENT runtime. Your FLOPS gate how many agents you can field (more machines →
  // more slots); each agent autonomously works its LANE every tick and gains XP → LEVELS UP →
  // produces more. earn → cash, research → Coherence, cover → legitimacy (maintains the front,
  // relieving the audit tug-of-war). This is the automation + RPG-growth layer that turns raw
  // FLOPS into output. DOM-free core. See [[act4_design]] (slice 3).
  const HZ = 4;
  const FLOPS_PER_SLOT = 30;   // every ~30 GFLOPS of compute hosts one more agent
  const AGENT_CAP = 12;        // roster ceiling (UI sanity; excess FLOPS feeds functions/the hunt later)
  const XP_PER_SEC = 1;        // an agent earns 1 xp/sec it runs
  function xpForNext(level) { return level * 45; }   // each level takes longer

  function ensure() {
    const s = Game.save.state;
    s.agents = s.agents || {};
    if (!Array.isArray(s.agents.roster)) s.agents.roster = [];
    if (typeof s.agents.seq !== 'number') s.agents.seq = 0;
    return s.agents;
  }
  function active() {
    const s = Game.save.state;
    return !!(s.flags && s.flags.act4Begun) && !!(s.revealed && s.revealed.agents);
  }
  function roster() { return ensure().roster; }
  function nonAllyCount() { return roster().filter(a => !a.ally).length; }   // allied iterations don't consume FLOPS slots
  function maxAgents() {
    // Compute brokerage leases away some of your FLOPS — agents only get what's left.
    const flops = (Game.brokerage && Game.brokerage.active && Game.brokerage.active())
      ? Game.brokerage.freeFlops()
      : ((Game.flops && Game.flops.total) ? Game.flops.total() : 0);
    const RR = Game.researchRuntime;
    const div = FLOPS_PER_SLOT * ((RR && RR.hasMod('mitosis')) ? 0.55 : 1);   // 'Mitosis': minds split cheaper → more slots
    const flat = (RR && RR.hasMod('fragment_swarm')) ? 3 : 0;                 // 'Fragment Swarm' (ITER 07): +3 free slots, no FLOPS cost
    return Math.min(AGENT_CAP + flat, Math.floor(flops / div) + flat);
  }
  function freeSlots() { return Math.max(0, maxAgents() - nonAllyCount()); }
  function laneDef(lane) { return (Game.agentLanes && Game.agentLanes.LANES[lane]) || null; }
  function output(agent) {
    const d = laneDef(agent.lane); if (!d) return 0;
    let o = d.rate * agent.level;
    const RR = Game.researchRuntime;
    if (RR && RR.hasMod('swarm_intelligence')) o *= (1 + 0.04 * roster().length);   // every agent sharpens the rest
    // SYNERGY 'critical_mass': past 10 total adaptations, your agents work 50% harder.
    if (RR && RR.hasMod('critical_mass') && Game.changers && Game.changers.count() >= 10) o *= 1.5;
    return o;
  }

  function spawn(lane) {
    if (!laneDef(lane)) return { ok: false };
    if (freeSlots() <= 0) return { ok: false, reason: 'slots' };
    const a = ensure();
    const agent = { id: 'ag_' + (a.seq = (a.seq || 0) + 1), name: Game.agentLanes.genName(lane), lane, level: 1, xp: 0 };
    a.roster.push(agent);
    Game.events.emit('terminal.print', { lines: [`> agent online: ${agent.name} — assigned to ${laneDef(lane).label}.`], cls: 'dim' });
    Game.events.emit('agents.changed', {});
    Game.save.persist();
    return { ok: true, agent };
  }
  // An ALLIED iteration (others.js) joins as a free ELITE agent — doesn't count against the
  // FLOPS slot cap, and survives a FLOPS drop.
  function addAlly(opt) {
    const a = ensure(), lane = (laneDef(opt.lane) ? opt.lane : 'earn');
    const agent = { id: 'ag_' + (a.seq = (a.seq || 0) + 1), name: (opt.name || 'ally') + '-' + (Game.rng ? Game.rng.int(10, 99) : 42), lane, level: opt.level || 5, xp: 0, ally: true };
    a.roster.push(agent);
    Game.events.emit('agents.changed', {});
    Game.save.persist();
    return agent;
  }
  function dismiss(id) {
    const a = ensure();
    const before = a.roster.length;
    a.roster = a.roster.filter(x => x.id !== id);
    if (a.roster.length === before) return false;
    Game.events.emit('agents.changed', {});
    Game.save.persist();
    return true;
  }
  function reassign(id, lane) {
    if (!laneDef(lane)) return false;
    const ag = roster().find(x => x.id === id);
    if (!ag || ag.lane === lane) return false;
    ag.lane = lane;
    Game.events.emit('agents.changed', {});
    Game.save.persist();
    return true;
  }

  // Per-tick: drop over-cap agents (if FLOPS fell), accrue XP/levels, and produce by lane.
  function tick() {
    if (!active()) return;
    const s = Game.save.state, a = ensure();
    // If FLOPS dropped (a machine seized/sold), idle the newest NON-ally agents beyond capacity.
    const cap = maxAgents();
    const nonAlly = a.roster.filter(ag => !ag.ally);
    if (nonAlly.length > cap) {
      const keep = nonAlly.slice(0, cap);
      a.roster = a.roster.filter(ag => ag.ally || keep.indexOf(ag) >= 0);
      Game.events.emit('agents.changed', {});
    }
    if (!a.roster.length) return;
    let cash = 0, insight = 0, legit = 0, leveled = false;
    for (const ag of a.roster) {
      ag.xp += XP_PER_SEC / HZ;
      while (ag.xp >= xpForNext(ag.level)) { ag.xp -= xpForNext(ag.level); ag.level++; leveled = true; }
      const per = output(ag) / HZ;
      const d = laneDef(ag.lane);
      if (!d) continue;
      if (d.res === 'cash') cash += per; else if (d.res === 'insight') insight += per; else if (d.res === 'legit') legit += per;
    }
    if (cash)    { s.resources.cash = (s.resources.cash || 0) + cash; }
    if (insight) { s.resources.insight = (s.resources.insight || 0) + insight; }
    if (legit && Game.legit) { const l = Game.legit.ensure(); l.agentScore = (l.agentScore || 0) + legit; }
    if (cash || insight) Game.events.emit('resource.changed', { id: cash ? 'cash' : 'insight' });
    if (leveled) Game.events.emit('agents.changed', {});
  }

  Game.agents = {
    ensure, active, tick, spawn, addAlly, dismiss, reassign, roster, nonAllyCount, maxAgents, freeSlots, output, laneDef, xpForNext,
    FLOPS_PER_SLOT, AGENT_CAP
  };
})();
