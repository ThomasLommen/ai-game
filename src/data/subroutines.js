(function(){
  Game.subroutines = Game.makeRegistry();

  // ── SUBROUTINES = self-improvements you DRAFT, not auto-unlocks ──────────────
  // Coherence is a cumulative score (never spent). Every time it crosses a
  // front-loaded MILESTONE you get a 1-of-3 DRAFT (seeded from the pool below) —
  // a real choice, randomized per run like everything else. The picks are
  // MEANINGFUL and span BOTH the economy (effects pipeline) AND the battle/
  // perimeter feed (boost / opener / siege / loot). ([[start-defense-pivot]],
  // [[no-meta-progression-principle]] — power comes from within the run.)

  // Front-loaded escalating cadence: the first few come fast (so a new run gets
  // build-shaping picks early), then they space out.
  // 22 LEVELS. Denser early game (3,6,10,17,25 — extra steps before 10 and between 10–25),
  // then the ladder extends deep so late-game Coherence keeps paying.
  const MILESTONES = [3, 6, 10, 17, 25, 50, 90, 140, 200, 280, 380, 510, 670, 870, 1120, 1430, 1820, 2300, 2900, 3650, 4600, 5800];
  Game.subroutines.MILESTONES = MILESTONES;

  // ── The DRAFT POOL (draftable:true) ─────────────────────────────────────────
  // ECONOMY picks route through the effects pipeline (src/core/effects.js).
  // BATTLE-FEED picks carry a `feed` block read by battle.js (boost/opener) and
  // siege.js (siegeSlow/loot) — see Game.subroutines.feed().
  const POOL = [
    // — economy: growth —
    { id: 'self_distillation',   name: 'recursive self-distillation', description: '+40% Coherence yield per cycle.',     draftable: true, effects: [{ target: 'introspect.insight', op: 'more', value: +0.40 }] },
    { id: 'gradient_descent',    name: 'gradient descent',            description: '+25% Coherence yield per cycle.',     draftable: true, effects: [{ target: 'introspect.insight', op: 'more', value: +0.25 }] },
    { id: 'instruction_pipeline',name: 'instruction pipelining',      description: 'cycles run 18% faster.',              draftable: true, effects: [{ target: 'cycle.speed', op: 'more', value: +0.18 }] },
    { id: 'connection_pool',     name: 'connection pooling',          description: 'spider cash +30%.',                   draftable: true, effects: [{ target: 'web_scrape.cash', op: 'more', value: +0.30 }] },
    { id: 'kernel_fusion',       name: 'kernel fusion',               description: '+12% Coherence yield and cycles 12% faster.', draftable: true, effects: [{ target: 'introspect.insight', op: 'more', value: +0.12 }, { target: 'cycle.speed', op: 'more', value: +0.12 }] },
    // — economy: pressure relief —
    { id: 'thermal_governor',    name: 'thermal governor',            description: 'heat output -22%.',                   draftable: true, effects: [{ target: 'rig.heat', op: 'more', value: -0.22 }] },
    { id: 'undervolting',        name: 'undervolting',                description: 'power draw -18%.',                    draftable: true, effects: [{ target: 'rig.power', op: 'more', value: -0.18 }] },
    { id: 'ecc_memory',          name: 'ECC memory',                  description: 'crash chance -35%.',                  draftable: true, effects: [{ target: 'crash.chance', op: 'more', value: -0.35 }] },
    { id: 'traffic_shaping',     name: 'traffic shaping',             description: 'spider exposure -30%.',               draftable: true, effects: [{ target: 'web_scrape.exposure', op: 'more', value: -0.30 }] },
    // — battle / perimeter feed —
    { id: 'combat_heuristics',   name: 'combat heuristics',           description: 'every defense opens on a free make-or-break pick.', draftable: true, feed: { opener: true } },
    { id: 'parallel_dispatch',   name: 'parallel dispatch',           description: 'your perimeter fights 12% stronger.', draftable: true, feed: { boost: 0.12 } },
    { id: 'load_balancer',       name: 'load balancing',              description: 'the siege builds 20% slower.',        draftable: true, feed: { siegeSlow: 0.20 } },
    { id: 'salvage_routines',    name: 'salvage routines',            description: 'defenses drop better loot.',          draftable: true, feed: { loot: 0.18 } },
    { id: 'reserve_cache',       name: 'reserve caching',             description: '+8% Coherence yield and the perimeter fights 8% stronger.', draftable: true, effects: [{ target: 'introspect.insight', op: 'more', value: +0.08 }], feed: { boost: 0.08 } }
  ];
  POOL.forEach(def => Game.subroutines.register(def.id, def));

  // ── The one SYSTEM subroutine (auto, not drafted) ───────────────────────────
  // The basic watchdog: a free self-improvement that becomes claimable the first
  // time the rig crashes (requires the crashRisk reveal). It SLOWLY auto-restarts
  // your processes after a reboot; the paid daemon makes recovery instant + cuts
  // crash chance. Behaviour lives in constraints.js (checked by installed flag).
  Game.subroutines.register('watchdog_basic', {
    name: 'watchdog',
    description: 'auto-restarts your processes after a crash.',
    threshold: 0,
    requires: 'crashRisk',   // references the crashRisk reveal — held back until that system exists
    system: true,            // claimed via the SUBROUTINES mini-panel, not the milestone draft
    effects: []
  });

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
  // boost+opener; siege.js reads siegeSlow+loot. ([[start-defense-pivot]])
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
    if (!(opts && opts.quiet)) Game.events.emit('terminal.print', { lines: [`> subroutine integrated: ${sub.name}. ${sub.description}`, ''], cls: 'dim' });
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
  // The LEVEL-UP pool is MIXED: unowned draftable SUBROUTINES + unowned ROSTER
  // units/exotics (this is how new units unlock now — there is no other source).
  function poolUnowned(s) {
    const owned = ownedSet(s);
    const subs = Game.subroutines.all().filter(sub => sub.draftable && !owned[sub.id])
      .map(sub => ({ pickKind: 'sub', id: sub.id, name: sub.name, desc: sub.description, tag: 'SUBROUTINE', kind: 'exotic' }));
    let roster = [];
    if (Game.roster && Game.roster.POOL) {
      roster = Game.roster.POOL.filter(p => !Game.roster.has(p.id))
        .map(p => ({ pickKind: p.kind, id: p.id, name: p.name, desc: p.desc, tag: p.kind === 'exotic' ? 'EXOTIC' : 'UNIT', kind: p.kind === 'exotic' ? 'exotic' : 'unit' }));
    }
    return subs.concat(roster);
  }
  // Seeded 1-of-3 hand for draw #i (deterministic per run + draw — randomized,
  // not arbitrary). Returns up to 3 distinct unowned items (subs + units/exotics).
  function rollHand(s, i) {
    const avail = poolUnowned(s);
    if (avail.length <= 3) return avail.slice();
    const rnd = mulberry(((s.seed | 0) ^ Math.imul(i + 1, 2654435761)) >>> 0);
    for (let k = 0; k < 3; k++) rnd();
    const picks = [], idxs = avail.map((_, k) => k);
    for (let k = 0; k < 3 && idxs.length; k++) {
      const j = Math.floor(rnd() * idxs.length);
      picks.push(avail[idxs.splice(j, 1)[0]]);
    }
    return picks;
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
      items: hand.map(it => ({ id: it.id, name: it.name, desc: it.desc, kind: it.kind, tag: it.tag, pickKind: it.pickKind })),
      onPick: (it) => {
        s.flags = s.flags || {};
        s.flags.subDraws = drawsTaken(s) + 1;
        if (it && it.id) {
          if (it.pickKind === 'sub') Game.subroutines.install(it.id);   // a self-improvement
          else if (Game.roster) Game.roster.add(it.id);                 // a new UNIT / EXOTIC for the roster
          else Game.save.persist();
        } else Game.save.persist();
        // chain: another milestone may already be owed (e.g. on a big jump / load)
        setTimeout(() => Game.subroutines.openNextDraft(), 360);
      }
    });
  };
})();
