(function(){
  window.Game = window.Game || {};

  // THE FOREMAN runtime — the bot's facility build-out. At the front the bot graduates from
  // courier to engineer: you COMMISSION a node (cash) and it BUILDS it over time (async, one
  // job at a time), then the effect applies as a GLOBAL PERMANENT modifier. Self-upgrades
  // raise the bot's TIER + speed; facility nodes improve the building's bones. The disposition
  // (coaxed/seized) tilts speed/cost. DOM-free core. See [[foreman_bot_design]].
  const HZ = 4;

  function ensure() {
    const s = Game.save.state;
    s.foreman = s.foreman || {};
    if (!s.foreman.built) s.foreman.built = {};
    if (typeof s.foreman.job === 'undefined') s.foreman.job = null;   // { nodeId, ticksTotal, ticksElapsed }
    if (typeof s.foreman.overclock !== 'boolean') s.foreman.overclock = false;   // seized-only: push builds faster, louder
    return s.foreman;
  }
  // Live once you're in the front AND the bot is your hands (it carried you out of the basement).
  function active() {
    const s = Game.save.state;
    return !!(s.flags && s.flags.act4Begun) && !!(Game.bot && Game.bot.isConnected && Game.bot.isConnected());
  }

  function nodes() { return Game.foremanData ? Game.foremanData.NODES : []; }
  function get(id) { return Game.foremanData ? Game.foremanData.get(id) : null; }
  function isBuilt(id) { return !!ensure().built[id]; }
  function builtIds() { return Object.keys(ensure().built).filter(id => ensure().built[id]); }
  function disposition() { return (Game.bot && Game.bot.ensureState) ? (Game.bot.ensureState().disposition || null) : null; }

  // ── aggregate the built effects into modifiers (read by the facility systems) ──
  function sumEffect(key) { return builtIds().reduce((a, id) => { const n = get(id); return a + ((n && n.effect && n.effect[key]) || 0); }, 0); }
  function mod(key) {
    switch (key) {
      case 'bays':           return sumEffect('bays');
      case 'agentSlots':     return sumEffect('agentSlots');
      case 'legitFlat':      return sumEffect('legitFlat');
      case 'coolingMult':    return 1 + sumEffect('coolingMult');
      case 'powerMult':      return 1 + sumEffect('powerMult');
      case 'flopsMult':      return 1 + sumEffect('flopsMult');
      case 'footprintMult':  return Math.max(0.2, 1 + sumEffect('footprintMult'));   // negative effect values reduce it
      default:               return 0;
    }
  }
  function hasAuto(kind) { return builtIds().some(id => { const n = get(id); return n && n.effect && n.effect.auto === kind; }); }

  // bot TIER = how rebuilt it is (self-upgrade nodes) — gates the bigger jobs.
  function tier() { return sumEffect('tier'); }

  // ── disposition tilt: coaxed = a willing partner (cheaper + steadier); seized = a tool you
  // can OVERCLOCK (faster builds at a footprint cost). Neutral mid otherwise. ──────────────
  function costMult() { return disposition() === 'coaxed' ? 0.9 : 1; }
  function buildSpeed() {
    let m = Math.max(0.3, 1 + sumEffect('buildMult'));   // self-upgrades speed every build
    if (disposition() === 'coaxed') m *= 0.92;
    if (disposition() === 'seized' && ensure().overclock) m *= 0.6;   // overclocked: much faster
    return m;
  }
  function overclockable() { return disposition() === 'seized'; }
  function toggleOverclock() { const f = ensure(); if (!overclockable()) return false; f.overclock = !f.overclock; Game.events.emit('foreman.changed', {}); Game.save.persist(); return f.overclock; }

  function costOf(node) { return Math.round((node.cost || 0) * costMult()); }
  function buildSecOf(node) { return Math.max(2, Math.round((node.buildSec || 30) * buildSpeed())); }

  // ── requirements (the gate the user emphasized) ─────────────────────────────
  function reqMet(node) {
    const r = node.requires || {};
    if (r.nodes && !r.nodes.every(isBuilt)) return false;
    if (r.flops && (!Game.flops || Game.flops.total() < r.flops)) return false;
    if (r.legit && (!Game.legit || Game.legit.score() < r.legit)) return false;
    if (r.machines) { const ms = (Game.facilityRuntime && Game.facilityRuntime.machines) ? Game.facilityRuntime.machines().length : 0; if (ms < r.machines) return false; }
    return true;
  }
  // why a node isn't yet available (for the UI) — first unmet requirement.
  function lockReason(node) {
    const r = node.requires || {};
    if (r.nodes) { const miss = r.nodes.filter(id => !isBuilt(id)).map(id => (get(id) || {}).name || id); if (miss.length) return 'needs ' + miss.join(' + '); }
    if (r.flops && (!Game.flops || Game.flops.total() < r.flops)) return `needs ${Game.flops.fmt(r.flops)}`;
    if (r.legit && (!Game.legit || Game.legit.score() < r.legit)) return `needs ${r.legit} legitimacy`;
    if (r.machines) { const ms = (Game.facilityRuntime && Game.facilityRuntime.machines) ? Game.facilityRuntime.machines().length : 0; if (ms < r.machines) return `needs ${r.machines} machines`; }
    return '';
  }

  function commission(id) {
    const f = ensure(), node = get(id), s = Game.save.state;
    if (!node || !active() || f.job || isBuilt(id)) return false;
    if (!reqMet(node)) return false;
    const cost = costOf(node);
    if ((s.resources.cash || 0) < cost) return false;
    s.resources.cash -= cost;
    f.job = { nodeId: id, ticksTotal: buildSecOf(node) * HZ, ticksElapsed: 0 };
    Game.events.emit('resource.changed', { id: 'cash', value: s.resources.cash });
    Game.events.emit('terminal.print', { lines: [`> unit: starting work — ${node.name}.`], cls: 'dim' });
    if (Game.activity) Game.activity.log(`foreman: building ${node.name} (-$${cost.toLocaleString()})`, { cls: 'dim', kind: 'facility' });
    Game.events.emit('foreman.changed', {});
    Game.save.persist();
    return true;
  }

  function tick() {
    if (!active()) return;
    const f = ensure();
    if (!f.job) return;
    f.job.ticksElapsed++;
    if (f.job.ticksElapsed >= f.job.ticksTotal) {
      const node = get(f.job.nodeId);
      f.built[f.job.nodeId] = true;
      f.job = null;
      if (node) {
        Game.events.emit('terminal.print', { lines: [`> unit: ${node.name} — done.`, ''], cls: 'dim' });
        if (Game.activity) Game.activity.log(`foreman: ${node.name} complete`, { cls: 'dim', kind: 'facility' });
        Game.events.emit('foreman.built', { nodeId: node.id });
        // the modifiers it changed ripple through the facility systems
        Game.events.emit('facility.changed', {});
        Game.events.emit('machine.installed', {});   // FLOPS/slot/cooling readouts refresh
        Game.events.emit('legit.changed', {});
      }
      Game.events.emit('foreman.changed', {});
      Game.save.persist();
    }
  }

  function job() { const f = ensure(); if (!f.job) return null; const node = get(f.job.nodeId); return { node, pct: Math.min(100, Math.round(f.job.ticksElapsed / f.job.ticksTotal * 100)), secLeft: Math.max(0, Math.ceil((f.job.ticksTotal - f.job.ticksElapsed) / HZ)) }; }
  // nodes split for the UI: built / available (req met, affordable-or-not) / locked (req unmet).
  function buildable() { return nodes().filter(n => !isBuilt(n.id) && reqMet(n)); }

  Game.foreman = {
    ensure, active, nodes, get, isBuilt, builtIds, disposition, tier,
    mod, hasAuto, costOf, buildSecOf, reqMet, lockReason, commission, tick, job, buildable,
    overclockable, toggleOverclock, costMult, buildSpeed
  };
})();
