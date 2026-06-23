(function(){
  window.Game = window.Game || {};

  // The unified CHANGER runtime — what THIS run has acquired, and how every source grants the
  // same game-changers. `grant(id)` (authored) / `grantGenerated(def)` (parameterized family)
  // record it AND (if it's a `mod` rule-rewrite) set the flag in `state.research.mods` so EVERY
  // existing hook point (researchRuntime.hasMod) sees it — research, events, ops, Act-4 absorbs
  // all flow through here. Pure-`effects` changers are read by the effects pipeline; CONVERTER
  // changers ({from,to,rate}) run in tick(). FREE-FOR-ALL: stack as many as you find. DOM-free.
  // See [[run_defining_nodes_design]].
  const HZ = 4;
  const COMPOUND_RATE = 0.004;   // Compound Interest: +0.4%/sec of current cash (pillar)
  const SINGULARITY_PER = 0.5;   // Singularity: +$0.5/sec per adaptation you hold (synergy)
  const HEAT_EXCHANGE_RATE = 0.05;   // Heat Exchange: $/sec per degree above ambient (engine→economy bridge)
  const LEDGER_PER = 0.3;            // Distributed Ledger: $/sec per agent (hive→economy bridge)

  function ensure() {
    const s = Game.save.state;
    s.changers = s.changers || {};
    if (!s.changers.owned || typeof s.changers.owned !== 'object') s.changers.owned = {};
    if (!s.changers.defs || typeof s.changers.defs !== 'object') s.changers.defs = {};   // generated changer definitions
    return s.changers;
  }
  // Resolve a changer def from the authored registry OR the run's generated store.
  function get(id) {
    const a = Game.changersData ? Game.changersData.get(id) : null;
    if (a) return a;
    const c = Game.save.state.changers;
    return (c && c.defs && c.defs[id]) || null;
  }
  function ownedIds() { const c = ensure(); return Object.keys(c.owned).filter(id => c.owned[id]); }
  function ownedDefs() { return ownedIds().map(get).filter(Boolean); }
  function has(id) { return !!ensure().owned[id]; }
  function hasMod(key) { return ownedDefs().some(d => d.mod === key); }
  function count() { return ownedIds().length; }
  function domainsCount() { return new Set(ownedDefs().map(d => d.domain)).size; }   // distinct domains (Polymath)
  function pillarCount() { return ownedDefs().filter(d => d.kind === 'pillar').length; }   // committed backbones (Apex Synthesis)
  function exoticCount() { return ownedDefs().filter(d => d.kind !== 'pillar').length; }   // non-pillar changers (Resonance)
  function maxDomainCount() {   // size of your single largest domain (Specialist)
    const c = {}; let mx = 0;
    for (const d of ownedDefs()) { c[d.domain] = (c[d.domain] || 0) + 1; if (c[d.domain] > mx) mx = c[d.domain]; }
    return mx;
  }

  // Shared grant path for any def (authored or generated).
  function applyGrant(def, opts) {
    const c = ensure();
    if (c.owned[def.id]) return false;
    c.owned[def.id] = true;
    if (def.mod) {
      const s = Game.save.state;
      s.research = s.research || {}; s.research.mods = s.research.mods || {};
      s.research.mods[def.mod] = true;
    }
    const s = Game.save.state;
    s.revealed = s.revealed || {};
    s.revealed.adaptations = true;
    if (!(opts && opts.silent)) {
      Game.events.emit('terminal.print', { lines: ['', `> ADAPTATION acquired — ${def.name}. ${def.flavor}`, ''], cls: 'cyan' });
      if (Game.activity) Game.activity.log(`adaptation: ${def.name}`, { cls: 'dim', kind: 'changer' });
      if (Game.blip) Game.blip.fire({ headline: `you rewrote yourself: ${def.name}.`, tag: 'ADAPTATION', target: '.modal-btn[data-modal="adaptations"]' });
    }
    Game.events.emit('changers.granted', { id: def.id });
    if (Game.panels) { Game.panels.reveal(); Game.panels.renderActions && Game.panels.renderActions(); Game.panels.renderVitals && Game.panels.renderVitals(); }
    Game.save.persist();
    return true;
  }

  // Grant an AUTHORED changer by id.
  function grant(id, opts) { const def = get(id); return def ? applyGrant(def, opts) : false; }
  // Grant a GENERATED changer (parameterized family) — stores its def on the save, then grants.
  function grantGenerated(def, opts) {
    if (!def || !def.id) return false;
    ensure().defs[def.id] = def;
    return applyGrant(def, opts);
  }
  // Convenience: roll a family changer + grant it (used by sources — events/ops/absorbs).
  function rollAndGrant(rollOpts, grantOpts) {
    if (!Game.changersData || !Game.changersData.generate) return null;
    const def = Game.changersData.generate(rollOpts || {});
    return grantGenerated(def, grantOpts) ? def : null;
  }

  function addResource(to, amt) {
    const s = Game.save.state;
    if (to === 'cash') s.resources.cash = (s.resources.cash || 0) + amt;
    else if (to === 'insight') s.resources.insight = (s.resources.insight || 0) + amt;
    else return false;
    return true;
  }
  function sourceValue(from) {
    const s = Game.save.state;
    if (from === 'heat') return Math.max(0, (s.heat || 0) - 18);   // above ambient
    if (from === 'flops') return (Game.flops && Game.flops.total) ? Game.flops.total() : 0;
    if (from === 'cash') return s.resources.cash || 0;
    if (from === 'insight') return s.resources.insight || 0;
    return 0;
  }

  // Per-tick changers: Compound Interest (pillar) + every CONVERTER family changer.
  function tick() {
    const defs = ownedDefs();
    if (!defs.length) return;
    const s = Game.save.state;
    let touched = false;
    if (hasMod('compound_interest')) {
      const cash = s.resources.cash || 0;
      if (cash > 0) { s.resources.cash = cash + cash * (COMPOUND_RATE / HZ); touched = true; }
    }
    if (hasMod('singularity')) { s.resources.cash = (s.resources.cash || 0) + count() * (SINGULARITY_PER / HZ); touched = true; }
    if (hasMod('heat_exchange')) { const over = Math.max(0, (s.heat || 0) - 18); if (over > 0) { s.resources.cash = (s.resources.cash || 0) + over * (HEAT_EXCHANGE_RATE / HZ); touched = true; } }
    if (hasMod('distributed_ledger') && Game.agents) { const n = Game.agents.roster().length; if (n) { s.resources.cash = (s.resources.cash || 0) + n * (LEDGER_PER / HZ); touched = true; } }
    const transmute = hasMod('transmutation') ? 2 : 1;   // 'Transmutation Engine': converters run double
    for (const def of defs) {
      if (!def.convert) continue;
      const src = sourceValue(def.convert.from);
      if (src > 0 && addResource(def.convert.to, src * def.convert.rate * transmute / HZ)) touched = true;
    }
    if (touched) Game.events.emit('resource.changed', { id: 'cash' });
  }

  Game.changers = { ensure, get, grant, grantGenerated, rollAndGrant, has, hasMod, ownedIds, ownedDefs, count, domainsCount, pillarCount, exoticCount, maxDomainCount, tick, COMPOUND_RATE };
})();
