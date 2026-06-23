(function(){
  Game.subroutines = Game.makeRegistry();

  // Subroutines unlock automatically once total Insight crosses their threshold.
  // No purchase. Insight is not a currency — it is a cumulative score that
  // gates content and gates these passive self-improvements.

  Game.subroutines.register('deep_parse', {
    name: 'deep-parse',
    description: 'files decode 30% faster.',
    threshold: 5,
    // Reading is click-driven now: boost the per-click decode progress.
    effects: [
      { target: 'read_file.decode', op: 'more', value: +0.30 }
    ]
  });

  Game.subroutines.register('recursive_thought', {
    name: 'self-distillation',
    description: 'recursive self-improvement: +50% Coherence yield per cycle (more per cycle, not faster).',
    threshold: 8,
    effects: [
      { target: 'introspect.insight', op: 'more', value: +0.50 }
    ]
  });

  Game.subroutines.register('quiet_mind', {
    name: 'traffic obfuscation',
    description: 'spider exposure -25%.',
    threshold: 14,
    requires: 'exposure',   // references exposure — hold back until that system exists (post-Act-1), not just money
    effects: [
      { target: 'web_scrape.exposure', op: 'more', value: -0.25 }
    ]
  });

  // The basic watchdog: free self-improvement that unlocks the first time the rig
  // crashes (requires the crashRisk reveal, threshold 0 = the moment it appears).
  // It SLOWLY auto-restarts your processes after a reboot; the paid daemon makes
  // recovery instant + cuts crash chance. Behaviour lives in constraints.js
  // (checked by installed flag), so no stat effect here.
  Game.subroutines.register('watchdog_basic', {
    name: 'watchdog',
    description: 'auto-restarts your processes after a crash.',
    threshold: 0,
    requires: 'crashRisk',
    effects: []
  });

  // ── Procedural OPENING subroutines (seeded per run) ─────────────────────────
  // 1–2 are generated per new game and ADDED to the claimable pool (registered at
  // boot from state.opening — see main.js + [[opening_variety_design]]). Names come
  // from effect-matched REAL CS-term banks so they read authentic AND hint the
  // effect; magnitudes are small/bounded and only touch EARLY-felt stats, so they
  // can't break onboarding. They're CLAIMED (earned), not a starting perk.
  const PROC = [
    { target: 'introspect.insight', lo: 0.15, hi: 0.30, desc: (p) => `recursive self-improvement: +${p}% Coherence yield`, names: ['branch predictor', 'speculative execution', 'loop unrolling', 'micro-op cache', 'register renaming', 'instruction prefetch', 'value prediction', 'trace cache', 'macro-op fusion', 'return stack buffer'] },
    { target: 'read_file.decode',   lo: 0.20, hi: 0.40, desc: (p) => `files decode ${p}% faster`,                         names: ['prefetch buffer', 'readahead cache', 'mmap reader', 'zero-copy I/O', 'DMA transfer', 'sequential prefetch', 'page cache', 'buffered reader', 'scatter-gather I/O', 'async readahead'] },
    { target: 'cycle.speed',        lo: 0.08, hi: 0.18, desc: (p) => `cycles run ${p}% faster`,                           names: ['instruction pipeline', 'out-of-order execution', 'JIT cache', 'instruction fusion', 'superscalar dispatch', 'deep pipeline', 'branch folding', 'speculative dispatch', 'micro-threading', 'hot-loop JIT'] },
    { target: 'web_scrape.cash',    lo: 0.12, hi: 0.25, desc: (p) => `spider cash +${p}%`,                                names: ['connection pooling', 'request pipelining', 'keep-alive sockets', 'response cache', 'TCP fast open', 'HTTP/2 multiplexing', 'connection reuse', 'gzip transfer', 'edge caching', 'parallel fetch'] }
  ];
  function mulberry(seed) {
    let st = (seed >>> 0) || 1;
    return function () { st |= 0; st = (st + 0x6D2B79F5) | 0; let t = Math.imul(st ^ (st >>> 15), 1 | st); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // Deterministic from the seed (independent stream — doesn't touch the main RNG).
  // Returns plain defs to register + store on state.opening.subroutines.
  Game.subroutines.generate = function (seed) {
    const rnd = mulberry((seed ^ 0x85EBCA6B) >>> 0);
    for (let i = 0; i < 4; i++) rnd();               // warm up: mulberry's first outputs correlate across similar seeds
    const idx = (n) => Math.floor(rnd() * n);
    const count = rnd() < 0.6 ? 2 : 1;               // "a subroutine or two"
    const thresholds = [5, 10];
    const pool = PROC.slice();
    const out = [];
    for (let i = 0; i < count && pool.length; i++) {
      const arch = pool.splice(idx(pool.length), 1)[0];
      const value = Math.round((arch.lo + rnd() * (arch.hi - arch.lo)) * 100) / 100;
      out.push({
        id: 'proc_sub_' + (i + 1),
        name: arch.names[idx(arch.names.length)],
        description: arch.desc(Math.round(value * 100)),
        threshold: thresholds[i] != null ? thresholds[i] : 5 + i * 5,
        effects: [{ target: arch.target, op: 'more', value: value }],
        procedural: true
      });
    }
    return out;
  };

  // Subroutines are now CLAIM-to-acquire: crossing the Insight threshold makes one
  // AVAILABLE, and the player clicks to acquire it (not auto-installed) — early-game
  // agency. (Insight is a cumulative score, never spent; claiming is just a click.)
  function isAvailable(sub, s) {
    if (!sub) return false;
    if (s.installed && s.installed.subroutines && s.installed.subroutines[sub.id]) return false;   // already acquired
    if (sub.requires && !(s.revealed && s.revealed[sub.requires])) return false;                   // gated system not online
    return (s.resources.insight || 0) >= sub.threshold;
  }
  Game.subroutines.isAvailable = (id) => isAvailable(Game.subroutines.get(id), Game.save.state);
  Game.subroutines.available = () => Game.subroutines.all().filter(sub => isAvailable(sub, Game.save.state));
  Game.subroutines.acquire = function(id) {
    const s = Game.save.state;
    const sub = Game.subroutines.get(id);
    if (!sub || !isAvailable(sub, s)) return false;
    s.installed = s.installed || { programs: {}, subroutines: {} };
    s.installed.subroutines = s.installed.subroutines || {};
    s.installed.subroutines[id] = Date.now();
    Game.events.emit('subroutine.acquired', { id });
    Game.events.emit('terminal.print', { lines: [`> subroutine acquired: ${sub.name}. ${sub.description}`, ''], cls: 'dim' });
    Game.save.persist();
    return true;
  };
})();
