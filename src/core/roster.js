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
    { id: 'tesla',      kind: 'unit',   name: 'Tesla',            desc: 'chain lightning · stuns clusters' },
    { id: 'warden',     kind: 'unit',   name: 'Warden',           desc: 'EMP · disables elite abilities' },
    { id: 'railwarden', kind: 'unit',   name: 'Railwarden',       desc: 'charges a map-long piercing lance' },
    { id: 'corrosion',  kind: 'unit',   name: 'Corrosion',        desc: 'acid mark · +damage from all' },
    { id: 'singularity',kind: 'unit',   name: 'Singularity',      desc: 'gravity well · slows + clumps' },
    { id: 'hive',       kind: 'exotic', name: 'HIVE',             desc: 'flock cap up · faster regen' },
    { id: 'flame',      kind: 'exotic', name: 'FLAME RIG',        desc: 'tripod → short cone · ignites' },
    { id: 'bloom',      kind: 'exotic', name: 'CONTAGION BLOOM',  desc: 'poisoned deaths seed neighbours' },
  ];
  const byId = id => POOL.find(p => p.id === id);

  // Display-only unit stats for the ROSTER tab (the battle defs live in the proto iframe,
  // out of reach here). pod=greater unit (levels + counts vs pod cap); swarm=a flock.
  // base hp/dmg mirror the sim's UNITS; the tab scales them by the persistent run-level.
  const INFO = {
    hunter:     { kind: 'swarm', role: 'the starter swarm — chases the nearest threat' },
    locust:     { kind: 'swarm', role: 'swirls a cluster · anti-horde' },
    leech:      { kind: 'swarm', role: 'peels off · spreads contagion' },
    strider:    { kind: 'pod', hp: 300, dmg: 60, role: 'Roams the field and railguns the heaviest targets — your anti-elite single-target striker.' },
    bulwark:    { kind: 'pod', hp: 820, dmg: 10, placeable: true, role: 'A wall you place on a lane: enemies pile up and grind against it while your swarm cleans up.' },
    siege:      { kind: 'pod', hp: 240, dmg: 48, placeable: true, role: 'Artillery you place: lobs cluster rockets that scatter AoE over a packed lane.' },
    glacier:    { kind: 'pod', hp: 320, dmg: 7,  role: 'Roams and thumps a freezing shockwave — chills, then FREEZES enemies solid (shatter bonus).' },
    conductor:  { kind: 'pod', hp: 260, dmg: 0,  support: 'OVERCLOCK', role: 'Plants in the swarm and overclocks nearby flocks — faster, harder, quicker regrow.' },
    reaper:     { kind: 'pod', hp: 230, dmg: 28, role: 'Fast hunter: DETONATES a poisoned target’s stacks as AoE and EXECUTES low-HP enemies.' },
    fabricator: { kind: 'pod', hp: 380, dmg: 0,  support: 'PRINTS DRONES', role: 'Slow carrier that prints a free brood of mini-drones — its drones do the fighting, not the chassis.' },
    tesla:      { kind: 'pod', hp: 240, dmg: 20, role: 'A coil that ARCS chain lightning between clustered enemies, forking and leaving them shocked (stunned).' },
    warden:     { kind: 'pod', hp: 280, dmg: 0,  support: 'EMP', role: 'EMP pulses DISABLE elite abilities — drops ward shields, kills disruptor jam, stops boss shield-regen.' },
    railwarden: { kind: 'pod', hp: 210, dmg: 80, placeable: true, role: 'Place it, then it CHARGES and fires a map-long PIERCING lance at the biggest threat — anti-boss.' },
    corrosion:  { kind: 'pod', hp: 250, dmg: 6,  support: 'ACID MARK', role: 'Sprays acid: marked enemies take +30% damage from EVERYTHING you field — a force-multiplier.' },
    singularity:{ kind: 'pod', hp: 300, dmg: 4,  support: 'GRAVITY WELL', role: 'A roaming well that hunts the densest clump, hauls enemies together, slows them to a crawl and grinds them down — sets up your AoE.' },
  };
  function info(id) { return INFO[id] || { kind: 'unit', role: '' }; }
  function isPod(id) { return info(id).kind === 'pod'; }
  // POD-CAP gate on the ROSTER: you can only OWN as many pods as your campaign pod cap.
  function podCount() { return units().filter(isPod).length; }
  function roomForPod() { return podCount() < podCap(); }
  // base stats scaled by the persistent run-level (mirrors the sim: ×1.25 dmg, +25 HP per level)
  function leveledStats(id) {
    const i = info(id); if (i.kind !== 'pod') return null;
    const lv = levelOf(id).lvl; let hp = i.hp, dmg = i.dmg;
    for (let k = 1; k < lv; k++) { dmg = Math.round(dmg * 1.25); hp += 25; }
    return { hp, dmg, lvl: lv };
  }

  const POD_CAP_BASE = 2, POD_CAP_MAX = 5;

  function ensure() {
    const s = Game.save.state;
    if (!s.roster || typeof s.roster !== 'object') s.roster = { units: ['hunter'], exotics: [] };  // start with the one swarm
    if (!Array.isArray(s.roster.units)) s.roster.units = ['hunter'];
    if (!Array.isArray(s.roster.exotics)) s.roster.exotics = [];
    if (!s.roster.levels || typeof s.roster.levels !== 'object') s.roster.levels = {};   // persistent run-level per POD {type:{lvl,xp}}
    if (typeof s.roster.podCap !== 'number') s.roster.podCap = POD_CAP_BASE;             // campaign pod cap (base 2, grows via rare research/policy, ceiling 5)
    return s.roster;
  }
  function units()   { return ensure().units.slice(); }
  function exotics() { return ensure().exotics.slice(); }
  function has(id)   { const r = ensure(); return r.units.indexOf(id) >= 0 || r.exotics.indexOf(id) >= 0; }

  // ── persistent POD run-level (banked from in-battle field-XP) ───────────────
  function levelOf(type) { const lv = ensure().levels[type]; return lv && typeof lv === 'object' ? { lvl: lv.lvl || 1, xp: lv.xp || 0 } : { lvl: 1, xp: 0 }; }
  // bank a battle's fielded-pod outcomes: [{type, lvl, xp}] — only ever ratchets UP.
  function bankUnits(arr) {
    if (!Array.isArray(arr) || !arr.length) return;
    const r = ensure(); let changed = false;
    for (const u of arr) {
      if (!u || !u.type) continue;
      const cur = levelOf(u.type), nl = u.lvl || 1, nx = u.xp || 0;
      if (nl > cur.lvl || (nl === cur.lvl && nx > cur.xp)) { r.levels[u.type] = { lvl: nl, xp: nx }; changed = true; }
    }
    if (changed) { Game.save.persist && Game.save.persist(); try { Game.events && Game.events.emit('roster.changed', { levels: true }); } catch (e) {} }
  }

  // ── campaign POD CAP (base 2, +1 per rare research node / rare policy, ceiling 5) ──
  function podCap() { return Math.min(POD_CAP_MAX, Math.max(POD_CAP_BASE, ensure().podCap || POD_CAP_BASE)); }
  function addPodCap(n) { const r = ensure(); const before = podCap(); r.podCap = Math.min(POD_CAP_MAX, (r.podCap || POD_CAP_BASE) + (n || 1)); Game.save.persist && Game.save.persist(); if (podCap() > before) { try { Game.events && Game.events.emit('roster.changed', { podCap: true }); } catch (e) {} } return podCap(); }

  // add a drafted pick (unit or exotic) to the roster
  function add(id) {
    const def = byId(id); const r = ensure();
    if (!def || has(id)) return false;
    if (isPod(id) && !roomForPod()) return false;   // pod cap limits how many PODS the roster can hold (raise it via rare research/policy)
    (def.kind === 'exotic' ? r.exotics : r.units).push(id);
    Game.save.persist && Game.save.persist();
    try { Game.events && Game.events.emit('roster.changed', { id }); } catch (e) {}
    return true;
  }
  function reset() { const s = Game.save.state; s.roster = { units: ['hunter'], exotics: [], levels: {}, podCap: POD_CAP_BASE }; }

  // roster → battle/perimeter opts (the proto's create() consumes unlock + ex + unitLevels + podCap)
  function toOpts() { const r = ensure(); return { unlock: r.units.slice(), ex: r.exotics.slice(), unitLevels: Object.assign({}, r.levels), podCap: podCap() }; }

  // n random draftable picks the roster doesn't already have
  function offer(n) {
    const avail = POOL.filter(p => !has(p.id));
    for (let i = avail.length - 1; i > 0; i--) { const j = (Game.rng ? Game.rng.next() : Math.random()) * (i + 1) | 0; const t = avail[i]; avail[i] = avail[j]; avail[j] = t; }
    return avail.slice(0, Math.min(n, avail.length));
  }

  Game.roster = { ensure, units, exotics, has, add, reset, toOpts, offer, POOL, byId, info, isPod, podCount, roomForPod, leveledStats, levelOf, bankUnits, podCap, addPodCap, POD_CAP_BASE, POD_CAP_MAX };
})();
