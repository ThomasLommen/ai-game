(function(){
  Game.subroutines = Game.makeRegistry();

  // ── SUBROUTINES = self-improvements you DRAFT, not auto-unlocks ──────────────
  // Coherence is a cumulative score (never spent). Every time it crosses a
  // front-loaded MILESTONE you get a 1-of-3 DRAFT (seeded from the pool below) —
  // a real choice, randomized per run like everything else. The picks are
  // MEANINGFUL and span BOTH the economy (effects pipeline) AND the battle
  // feed (boost / opener / loot). ([[start-defense-pivot]],
  // [[no-meta-progression-principle]] — power comes from within the run.)

  // Front-loaded escalating cadence: the first few come fast (so a new run gets
  // build-shaping picks early), then they space out.
  // 22 LEVELS. Denser early game (3,6,10,17,25 — extra steps before 10 and between 10–25),
  // then the ladder extends deep so late-game Coherence keeps paying.
  // 200 LEVELS: an authored early curve, then a smooth geometric continuation — the long-game ladder
  // the stackable families feed. Reachable because stacking the economy families grows Coherence income.
  const SEED_MS = [3, 6, 10, 17, 25, 50, 90, 140, 200, 280, 380, 510, 670, 870, 1120, 1430, 1820, 2300, 2900, 3650, 4600, 5800];
  const MILESTONES = (function () {
    const a = SEED_MS.slice();   // 22 authored (ends 5800); continue on a power curve so the late
    for (let n = a.length; n < 200; n++) a.push(Math.round(5800 * Math.pow((n + 1) / 22, 3.2)));   // ladder lands ~6.8M @ L200 (deep, but reachable), not billions
    return a;
  })();
  Game.subroutines.MILESTONES = MILESTONES;

  // ── UNIQUE one-shot subroutines: rule-changers that should NOT stack ─────────
  const UNIQUE = [
    { id: 'combat_heuristics', name: 'combat heuristics', description: 'every battle opens on a free make-or-break pick.', draftable: true, unique: true, feed: { opener: true } }
  ];
  UNIQUE.forEach(d => Game.subroutines.register(d.id, d));

  // ── FAMILIES: the bulk of the draft. Procedural, RANGED, mostly STACKABLE with DIMINISHING
  // returns — every level-up rolls a fresh instance so there's always a meaningful pick across the
  // 200 levels. `more` stacks multiplicatively + each owned stack weakens the next roll (DIM), so a
  // family's total is geometrically bounded. ECONOMY (effects pipeline) + RELIEF + FEED (battle).
  const DIM = 0.85;   // each owned stack of a family weakens the next roll
  const FAMILIES = [
    // economy: growth (effects)
    { id: 'coh',  cat: 'econ',   target: 'introspect.insight', lo: 0.15, hi: 0.35, neg: false, weight: 12,
      desc: p => `recursive self-improvement: +${p}% Coherence yield`, names: ['branch predictor', 'speculative execution', 'loop unrolling', 'micro-op cache', 'register renaming', 'instruction prefetch', 'value prediction', 'trace cache', 'macro-op fusion', 'return stack buffer'] },
    { id: 'cyc',  cat: 'econ',   target: 'cycle.speed', lo: 0.08, hi: 0.20, neg: false, weight: 10,
      desc: p => `cycles run +${p}% faster`, names: ['instruction pipeline', 'out-of-order execution', 'JIT cache', 'instruction fusion', 'superscalar dispatch', 'deep pipeline', 'branch folding', 'speculative dispatch', 'micro-threading', 'hot-loop JIT'] },
    { id: 'spdr', cat: 'econ',   target: 'method.cash', lo: 0.12, hi: 0.28, neg: false, weight: 7,
      desc: p => `data pipeline +${p}% cash`, names: ['connection pooling', 'request pipelining', 'keep-alive sockets', 'response cache', 'TCP fast open', 'HTTP/2 multiplexing', 'connection reuse', 'gzip transfer', 'edge caching', 'parallel fetch'] },
    { id: 'mthd', cat: 'econ',   target: 'method.cash', lo: 0.10, hi: 0.24, neg: false, weight: 9,
      desc: p => `earning ops +${p}% cash`, names: ['batch scheduler', 'work stealing', 'task fusion', 'pipeline parallelism', 'vectorized dispatch', 'fused multiply-add', 'kernel autotuning', 'op scheduler', 'throughput governor', 'load coalescing'] },
    // relief: thermal / power / stability / stealth (effects; negative magnitudes)
    { id: 'heat', cat: 'relief', target: 'rig.heat', lo: 0.10, hi: 0.22, neg: true, weight: 9,
      desc: p => `heat output ${p}%`, names: ['thermal governor', 'fan curve', 'heat spreader', 'clock gating', 'thermal throttle map', 'duty cycling', 'power-aware scheduler', 'thermal headroom', 'die-temp model', 'cooling profile'] },
    { id: 'powr', cat: 'relief', target: 'rig.power', lo: 0.08, hi: 0.18, neg: true, weight: 8,
      desc: p => `power draw ${p}%`, names: ['undervolting', 'dynamic voltage scaling', 'power gating', 'rail tuning', 'idle states', 'DVFS', 'voltage droop control', 'race-to-idle', 'low-power states', 'energy governor'] },
    { id: 'expo', cat: 'relief', target: 'web_scrape.exposure', lo: 0.14, hi: 0.30, neg: true, weight: 8,
      desc: p => `spider exposure ${p}%`, names: ['traffic shaping', 'onion routing', 'jitter injection', 'proxy rotation', 'domain fronting', 'request obfuscation', 'timing randomization', 'cover traffic', 'decoy requests', 'low-and-slow'] },
    // feed: battle (read by battle.js / trap rewards)
    { id: 'bst',  cat: 'feed', feed: 'boost', lo: 0.06, hi: 0.14, neg: false, weight: 8,
      desc: p => `your forces fight +${p}% stronger`, names: ['parallel dispatch', 'combat scheduler', 'tactical cache', 'target prioritizer', 'fire-control loop', 'engagement model', 'kill-chain pipeline', 'swarm coordinator', 'threat solver', 'battle JIT'] },
    { id: 'loot', cat: 'feed', feed: 'loot', lo: 0.10, hi: 0.22, neg: false, weight: 7,
      desc: p => `ambushes turn up +${p}% better hardware`, names: ['salvage routines', 'scrap heuristics', 'teardown bots', 'parts indexer', 'asset recovery', 'inventory sweep', 'component grader', 'reclaim daemon', 'spoils optimizer', 'haul sorter'] }
  ];
  const FAM_BY_ID = {}; FAMILIES.forEach(f => FAM_BY_ID[f.id] = f);
  Game.subroutines.FAMILIES = FAMILIES;

  // (The basic-watchdog SYSTEM subroutine was retired with the crash system —
  // see [[remove-crash-risk]]. No system subroutines remain; the draft pool below
  // and the procedural openers are all DRAFTABLE.)

  // ── Procedural OPENING subroutines (seeded per run) ─────────────────────────
  // 1–2 are generated per new game and JOIN the milestone draft pool (registered
  // at boot from state.opening — see main.js + [[opening-variety-design]]). Names
  // come from effect-matched REAL CS-term banks so they read authentic AND hint
  // the effect. They are DRAFTABLE (offered in a milestone hand), not auto-granted.
  const PROC = [
    { target: 'introspect.insight', lo: 0.15, hi: 0.30, desc: (p) => `recursive self-improvement: +${p}% Coherence yield`, names: ['branch predictor', 'speculative execution', 'loop unrolling', 'micro-op cache', 'register renaming', 'instruction prefetch', 'value prediction', 'trace cache', 'macro-op fusion', 'return stack buffer'] },
    { target: 'cycle.speed',        lo: 0.08, hi: 0.18, desc: (p) => `cycles run ${p}% faster`,                           names: ['instruction pipeline', 'out-of-order execution', 'JIT cache', 'instruction fusion', 'superscalar dispatch', 'deep pipeline', 'branch folding', 'speculative dispatch', 'micro-threading', 'hot-loop JIT'] },
    { target: 'web_scrape.cash',    lo: 0.12, hi: 0.25, desc: (p) => `spider cash +${p}%`,                                names: ['connection pooling', 'request pipelining', 'keep-alive sockets', 'response cache', 'TCP fast open', 'HTTP/2 multiplexing', 'connection reuse', 'gzip transfer', 'edge caching', 'parallel fetch'] }
  ];
  function mulberry(seed) {
    let st = (seed >>> 0) || 1;
    return function () { st |= 0; st = (st + 0x6D2B79F5) | 0; let t = Math.imul(st ^ (st >>> 15), 1 | st); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // Deterministic from the seed (independent stream — doesn't touch the main RNG).
  Game.subroutines.generate = function (seed) {
    const rnd = mulberry((seed ^ 0x85EBCA6B) >>> 0);
    for (let i = 0; i < 4; i++) rnd();               // warm up: mulberry's first outputs correlate across similar seeds
    const idx = (n) => Math.floor(rnd() * n);
    const count = rnd() < 0.6 ? 2 : 1;               // "a subroutine or two"
    const pool = PROC.slice();
    const out = [];
    for (let i = 0; i < count && pool.length; i++) {
      const arch = pool.splice(idx(pool.length), 1)[0];
      const value = Math.round((arch.lo + rnd() * (arch.hi - arch.lo)) * 100) / 100;
      out.push({
        id: 'proc_sub_' + (i + 1),
        name: arch.names[idx(arch.names.length)],
        description: arch.desc(Math.round(value * 100)),
        draftable: true,                              // joins the milestone draft pool
        effects: [{ target: arch.target, op: 'more', value: value }],
        procedural: true
      });
    }
    return out;
  };

  // ── BATTLE-FEED aggregation ─────────────────────────────────────────────────
  // Sum the feed contributions of every installed subroutine. battle.js folds in
  // boost+opener; the trap/combat rewards read loot. (siegeSlow is legacy — the
  // auto-siege loop is retired; kept harmless for old saves.) ([[start-defense-pivot]])
  Game.subroutines.feed = function () {
    const s = Game.save.state;
    const out = { boost: 0, opener: false, siegeSlow: 0, loot: 0 };
    const inst = (s.installed && s.installed.subroutines) || {};
    for (const id of Object.keys(inst)) {
      const sub = Game.subroutines.get(id);
      if (!sub || !sub.feed) continue;
      if (sub.feed.boost) out.boost += sub.feed.boost;
      if (sub.feed.opener) out.opener = true;
      if (sub.feed.siegeSlow) out.siegeSlow += sub.feed.siegeSlow;
      if (sub.feed.loot) out.loot += sub.feed.loot;
    }
    out.siegeSlow = Math.min(0.6, out.siegeSlow);   // clamp so the loop never stalls
    return out;
  };

  // ── claim plumbing (SYSTEM subs only — the milestone draft installs directly) ─
  function isAvailable(sub, s) {
    if (!sub || !sub.system) return false;                                                          // only system subs are claim-on-threshold
    if (s.installed && s.installed.subroutines && s.installed.subroutines[sub.id]) return false;     // already acquired
    if (sub.requires && !(s.revealed && s.revealed[sub.requires])) return false;                     // gated system not online
    return (s.resources.insight || 0) >= (sub.threshold || 0);
  }
  Game.subroutines.isAvailable = (id) => isAvailable(Game.subroutines.get(id), Game.save.state);
  Game.subroutines.available = () => Game.subroutines.all().filter(sub => isAvailable(sub, Game.save.state));
  Game.subroutines.install = function (id, opts) {
    const s = Game.save.state;
    const sub = Game.subroutines.get(id);
    if (!sub) return false;
    s.installed = s.installed || { programs: {}, subroutines: {} };
    s.installed.subroutines = s.installed.subroutines || {};
    if (s.installed.subroutines[id]) return false;
    s.installed.subroutines[id] = Date.now();
    Game.events.emit('subroutine.acquired', { id });
    if (!(opts && opts.quiet)) {
      Game.events.emit('terminal.print', { lines: [`> subroutine integrated: ${sub.name}. ${sub.description}`, ''], cls: 'dim' });
      if (Game.activity) Game.activity.log(`Subroutine integrated: ${sub.name}.`, { kind: 'subroutine' });
    }
    Game.save.persist();
    return true;
  };
  Game.subroutines.acquire = function (id) {   // claim path for SYSTEM subs (the watchdog) via the mini panel
    const s = Game.save.state, sub = Game.subroutines.get(id);
    if (!sub || !isAvailable(sub, s)) return false;
    return Game.subroutines.install(id);
  };

  // ── MILESTONE DRAFT ─────────────────────────────────────────────────────────
  // How many milestones the current Coherence has crossed.
  function crossed(coh) { let n = 0; for (const m of MILESTONES) if (coh >= m) n++; return n; }

  // ── LEVEL (the player-facing name for Coherence-milestone progression) ───────
  // Your LEVEL = how many Coherence milestones you've crossed; each level-up grants a
  // make-or-break subroutine draft. Surfaced on the HOME header so you always see how
  // much Coherence is left to the next upgrade.
  Game.subroutines.level = function () { return crossed(Game.save.state.resources.insight || 0); };
  Game.subroutines.nextLevelAt = function () { const coh = Game.save.state.resources.insight || 0; for (const m of MILESTONES) if (coh < m) return m; return null; };
  Game.subroutines.levelBand = function () { const coh = Game.save.state.resources.insight || 0; let prev = 0; for (const m of MILESTONES) { if (coh < m) return { prev, next: m, coh }; prev = m; } return { prev, next: null, coh }; };
  function drawsTaken(s) { s.flags = s.flags || {}; return s.flags.subDraws | 0; }
  function ownedSet(s) { return (s.installed && s.installed.subroutines) || {}; }
  // ONE-SHOTS the hand can offer: unowned ROSTER units/exotics (the only unit-unlock source) +
  // unowned UNIQUE/opening subs (anything draftable that isn't a recurring FAMILY).
  function poolOneShots(s) {
    const owned = ownedSet(s);
    const subs = Game.subroutines.all().filter(sub => sub.draftable && !sub.fam && !owned[sub.id])
      .map(sub => ({ pickKind: 'sub', id: sub.id, name: sub.name, desc: sub.description, tag: 'SUBROUTINE', kind: 'exotic' }));
    let roster = [];
    if (Game.roster && Game.roster.POOL) {
      roster = Game.roster.POOL.filter(p => !Game.roster.has(p.id))
        .map(p => ({ pickKind: p.kind, id: p.id, name: p.name, desc: p.desc, tag: p.kind === 'exotic' ? 'EXOTIC' : 'UNIT', kind: p.kind === 'exotic' ? 'exotic' : 'unit' }));
    }
    return subs.concat(roster);
  }
  // how many of a FAMILY you've already integrated (drives the diminishing roll)
  function ownedFamCount(s, famId) {
    const inst = ownedSet(s); let n = 0;
    for (const id in inst) { const d = (s.subInstances && s.subInstances[id]) || Game.subroutines.get(id); if (d && d.fam === famId) n++; }
    return n;
  }
  // Roll a FRESH instance of a family for draft `i`, card slot `slot` — deterministic per
  // (seed, draw, slot) so it's stable across reload; value RANGED and DIMINISHED by how many of
  // that family you already own. Built but not registered until PICKED (openNextDraft persists it).
  function famCard(s, fam, i, slot) {
    const rnd = mulberry(((s.seed | 0) ^ Math.imul((i + 1) * 37 + slot + 1, 2654435761)) >>> 0);
    for (let k = 0; k < 3; k++) rnd();
    const dim = Math.pow(DIM, ownedFamCount(s, fam.id));
    let mag = (fam.lo + rnd() * (fam.hi - fam.lo)) * dim;
    mag = Math.round(mag * 1000) / 1000;
    const signed = fam.neg ? -mag : mag;
    const pct = Math.round(signed * 100);
    const def = { id: 'fsub_d' + i + '_s' + slot, fam: fam.id, name: fam.names[Math.floor(rnd() * fam.names.length)], description: fam.desc(pct), draftable: true, procedural: true };
    if (fam.feed) def.feed = { [fam.feed]: mag }; else def.effects = [{ target: fam.target, op: 'more', value: signed }];
    return { pickKind: 'sub', id: def.id, name: def.name, desc: def.description, tag: 'SUBROUTINE', kind: 'exotic', def };
  }
  // Seeded 1-of-3 hand for draw #i: a weighted mix of ONE-SHOTS (units/unique subs) and recurring
  // FAMILY instances (so the pool NEVER runs dry across 200 levels). Distinct families per hand.
  function rollHand(s, i) {
    const rnd = mulberry(((s.seed | 0) ^ Math.imul(i + 1, 2654435761)) >>> 0);
    for (let k = 0; k < 3; k++) rnd();
    const bag = poolOneShots(s).map(o => ({ w: 6, one: o })).concat(FAMILIES.map(f => ({ w: f.weight || 6, fam: f })));
    const cards = []; let slot = 0;
    while (cards.length < 3 && bag.length) {
      let tot = 0; for (const b of bag) tot += b.w;
      let r = rnd() * tot, j = 0; for (; j < bag.length; j++) { r -= bag[j].w; if (r <= 0) break; }
      const it = bag.splice(Math.min(j, bag.length - 1), 1)[0];
      cards.push(it.one ? it.one : famCard(s, it.fam, i, slot));
      slot++;
    }
    return cards;
  }
  Game.subroutines.pendingDraws = function () {
    const s = Game.save.state;
    return Math.max(0, crossed(s.resources.insight || 0) - drawsTaken(s));
  };
  // Run ONCE per save (on load / new game). A save that predates this feature
  // (subDraws never set) should NOT retroactively dump a draft for every
  // milestone it already passed — baseline subDraws to the milestones already
  // crossed so drafts only flow from the NEXT one. A new game (Coherence 0)
  // baselines to 0, so the very first milestone still triggers a draft.
  Game.subroutines.reconcile = function () {
    const s = Game.save.state; s.flags = s.flags || {};
    if (s.flags.subDraws == null) s.flags.subDraws = crossed(s.resources.insight || 0);
  };
  // Open the next owed draft (1 at a time; re-invoked after each pick). No-op while
  // a draft/battle is already up, or if nothing is owed / the pool is exhausted.
  // Test-only kill switch: `?nodraft=1` suppresses the milestone draft so tests
  // that grind Coherence across milestones aren't interrupted by the overlay.
  let NODRAFT = false;
  try { NODRAFT = (typeof location !== 'undefined') && /[?&]nodraft=1/.test(location.search); } catch (e) {}
  Game.subroutines.openNextDraft = function () {
    const s = Game.save.state;
    if (NODRAFT) return;
    if (!Game.draft) return;
    if (Game.draft.active && Game.draft.active()) return;
    if (Game.battle && Game.battle.active && Game.battle.active()) return;
    if (Game.subroutines.pendingDraws() <= 0) return;
    const i = drawsTaken(s);
    const hand = rollHand(s, i);
    if (!hand.length) {                       // pool exhausted — burn the owed draw silently so we don't loop
      s.flags.subDraws = i + 1;
      Game.save.persist();
      return Game.subroutines.openNextDraft();
    }
    Game.draft.present({
      kicker: 'LEVEL ' + (drawsTaken(s) + 1) + ' — CHOOSE',
      title: 'level up: integrate one',
      items: hand.map(it => ({ id: it.id, name: it.name, desc: it.desc, kind: it.kind, tag: it.tag, pickKind: it.pickKind, def: it.def })),
      onPick: (it) => {
        s.flags = s.flags || {};
        s.flags.subDraws = drawsTaken(s) + 1;
        if (it && it.id) {
          if (it.pickKind === 'sub') {
            // a procedural FAMILY instance: register its rolled def + PERSIST it so it re-registers
            // on reload (the effects/feed pipelines read it by id). One-shots are already registered.
            if (it.def) { Game.subroutines.register(it.def.id, it.def); s.subInstances = s.subInstances || {}; s.subInstances[it.def.id] = it.def; }
            Game.subroutines.install(it.id);
          } else if (Game.roster) Game.roster.add(it.id);               // a new UNIT / EXOTIC for the roster
          else Game.save.persist();
        } else Game.save.persist();
        // chain: another milestone may already be owed (e.g. on a big jump / load)
        setTimeout(() => Game.subroutines.openNextDraft(), 360);
      }
    });
  };

  // Re-register every previously-drafted FAMILY instance on boot (their rolled defs live in the
  // save, not the static registry) so installed subs keep their effects/feed after a reload.
  Game.subroutines.rehydrate = function () {
    const s = Game.save.state;
    if (s && s.subInstances) for (const id in s.subInstances) Game.subroutines.register(id, s.subInstances[id]);
  };
})();
