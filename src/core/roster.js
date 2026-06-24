// ── Game.roster — the persistent run-ROSTER (the coherence backbone) ─────────
// The single source of truth for WHAT you field: the swarm UNIT types + EXOTICS you've
// drafted this run. BOTH the always-on PERIMETER (defense-widget) and the full BATTLES
// read it, so a unit you draft shows up in both. Numeric scaling stays in-battle (compute).
// Resets each run (no meta). ([[start-defense-pivot]])
(function () {
  window.Game = window.Game || {};

  // What's draftable (opening pick + prizes). Ids match the swarm proto's SWARMS/UNITS/exotics.
  const POOL = [
    { id: 'locust',     kind: 'unit',   name: 'Locust swarm',     desc: 'swirls a cluster · anti-horde' },
    { id: 'leech',      kind: 'unit',   name: 'Leech swarm',      desc: 'peels off · spreads contagion' },
    { id: 'strider',    kind: 'unit',   name: 'Strider',          desc: 'roams + railguns the heavies' },
    { id: 'bulwark',    kind: 'unit',   name: 'Bulwark',          desc: 'a wall you place · blocks + grinds' },
    { id: 'glacier',    kind: 'unit',   name: 'Glacier',          desc: 'chills → freezes (shatter)' },
    { id: 'siege',      kind: 'unit',   name: 'Siege',            desc: 'stationary · lobs AoE shells' },
    { id: 'reaper',     kind: 'unit',   name: 'Reaper',           desc: 'detonates poison · executes' },
    { id: 'conductor',  kind: 'unit',   name: 'Conductor',        desc: 'resonator · forks the chain' },
    { id: 'fabricator', kind: 'unit',   name: 'Fabricator',       desc: 'prints mini-drones that swarm' },
    { id: 'hive',       kind: 'exotic', name: 'HIVE',             desc: 'flock cap up · faster regen' },
    { id: 'flame',      kind: 'exotic', name: 'FLAME RIG',        desc: 'tripod → short cone · ignites' },
    { id: 'bloom',      kind: 'exotic', name: 'CONTAGION BLOOM',  desc: 'poisoned deaths seed neighbours' },
  ];
  const byId = id => POOL.find(p => p.id === id);

  function ensure() {
    const s = Game.save.state;
    if (!s.roster || typeof s.roster !== 'object') s.roster = { units: ['hunter'], exotics: [] };  // start with the one swarm
    if (!Array.isArray(s.roster.units)) s.roster.units = ['hunter'];
    if (!Array.isArray(s.roster.exotics)) s.roster.exotics = [];
    return s.roster;
  }
  function units()   { return ensure().units.slice(); }
  function exotics() { return ensure().exotics.slice(); }
  function has(id)   { const r = ensure(); return r.units.indexOf(id) >= 0 || r.exotics.indexOf(id) >= 0; }

  // add a drafted pick (unit or exotic) to the roster
  function add(id) {
    const def = byId(id); const r = ensure();
    if (!def || has(id)) return false;
    (def.kind === 'exotic' ? r.exotics : r.units).push(id);
    Game.save.persist && Game.save.persist();
    try { Game.events && Game.events.emit('roster.changed', { id }); } catch (e) {}
    return true;
  }
  function reset() { const s = Game.save.state; s.roster = { units: ['hunter'], exotics: [] }; }

  // roster → battle/perimeter opts (the proto's create() consumes unlock + ex)
  function toOpts() { const r = ensure(); return { unlock: r.units.slice(), ex: r.exotics.slice() }; }

  // n random draftable picks the roster doesn't already have
  function offer(n) {
    const avail = POOL.filter(p => !has(p.id));
    for (let i = avail.length - 1; i > 0; i--) { const j = (Game.rng ? Game.rng.next() : Math.random()) * (i + 1) | 0; const t = avail[i]; avail[i] = avail[j]; avail[j] = t; }
    return avail.slice(0, Math.min(n, avail.length));
  }

  Game.roster = { ensure, units, exotics, has, add, reset, toOpts, offer, POOL, byId };
})();
