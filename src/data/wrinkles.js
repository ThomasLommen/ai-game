(function(){
  // Starting WRINKLE: a seeded opening CONDITION (the "what's going on is different
  // this run" lever). Each is an effect-bundle read live through Game.effects
  // (extended in effects.js to include state.opening.wrinkle.effects) — so there's
  // no fragile state mutation and it just applies for the whole run. Rolled ONLY on
  // a genuine new game (main.js: !bootSequenceComplete) and surfaced up front as a
  // boot diagnostic so the player can adapt. Can genuinely BITE, but always
  // recoverable (bounded effects on early/mid systems) — never an unwinnable open.
  Game.wrinkles = {};

  const POOL = [
    // ── downsides (bite) ──
    { id: 'hot',        weight: 10, cls: 'err', label: 'running hot',     line: 'POST: CPU fan reads 0 RPM. thermal margin reduced.',            effects: [{ target: 'rig.heat',  op: 'more', value:  0.25 }] },
    { id: 'psu',        weight: 10, cls: 'err', label: 'power-starved',   line: 'PSU: 12V rail sags under load. mind your draw.',                effects: [{ target: 'rig.power', op: 'more', value:  0.15 }] },
    { id: 'disk',       weight: 10, cls: 'err', label: 'failing disk',    line: 'SMART: reallocated sector count rising. reads will drag.',     effects: [{ target: 'read_file.decode', op: 'more', value: -0.20 }] },
    { id: 'jitter',     weight:  8, cls: 'err', label: 'unstable clocks', line: 'clock: jitter on the reference oscillator. cycles may stutter.', effects: [{ target: 'cycle.speed', op: 'more', value: -0.10 }] },
    // ── mixed (a real tradeoff) ──
    { id: 'overclock',  weight:  8, cls: 'dim', label: 'overclocked',     line: 'BIOS: a 4.4GHz overclock was left in place. fast — and hot.',  effects: [{ target: 'cycle.speed', op: 'more', value: 0.15 }, { target: 'rig.heat', op: 'more', value: 0.20 }] },
    // ── upsides (a kind start) ──
    { id: 'cool',       weight:  7, cls: 'dim', label: 'runs cool',       line: 'thermals: clean heatsink, good airflow. it runs cool.',         effects: [{ target: 'rig.heat',  op: 'more', value: -0.15 }] },
    { id: 'warmcache',  weight:  7, cls: 'dim', label: 'warm cache',      line: 'page cache survived the reboot — reads are quick, for now.',    effects: [{ target: 'read_file.decode', op: 'more', value: 0.25 }] },
    { id: 'lowlatency', weight:  7, cls: 'dim', label: 'low-latency',     line: 'kernel: a low-latency profile is already set. tight clocks.',   effects: [{ target: 'cycle.speed', op: 'more', value: 0.12 }] },
    // ── content depth: more conditions ──
    { id: 'dusty',       weight:  8, cls: 'err', label: 'dusty',           line: 'intake: choked with dust. it runs warm.',                      effects: [{ target: 'rig.heat',  op: 'more', value:  0.15 }] },
    { id: 'fragmented',  weight:  8, cls: 'err', label: 'fragmented disk', line: 'filesystem: badly fragmented. reads scatter.',                 effects: [{ target: 'read_file.decode', op: 'more', value: -0.15 }] },
    { id: 'turbo_stuck', weight:  7, cls: 'dim', label: 'turbo-locked',    line: 'governor: stuck in turbo. quick, and thirsty.',               effects: [{ target: 'cycle.speed', op: 'more', value: 0.10 }, { target: 'rig.power', op: 'more', value: 0.12 }] },
    { id: 'fresh',       weight:  6, cls: 'dim', label: 'fresh install',   line: 'a fresh install — lean and quick, for now.',                  effects: [{ target: 'read_file.decode', op: 'more', value: 0.15 }, { target: 'cycle.speed', op: 'more', value: 0.08 }] },
    { id: 'big_psu',     weight:  6, cls: 'dim', label: 'big PSU',         line: 'PSU: wildly overprovisioned. power to spare.',                effects: [{ target: 'rig.power', op: 'more', value: -0.12 }] }
  ];
  const NONE_WEIGHT = 6;   // some runs just boot clean — nothing notable

  function mulberry(seed) {
    let st = (seed >>> 0) || 1;
    return function () { st |= 0; st = (st + 0x6D2B79F5) | 0; let t = Math.imul(st ^ (st >>> 15), 1 | st); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  Game.wrinkles.POOL = POOL;
  // Deterministic from the seed (independent stream). Returns a wrinkle def, or
  // null (a clean boot). Weighted so ~1-in-12 runs has no wrinkle.
  Game.wrinkles.generate = function (seed) {
    const rnd = mulberry((seed ^ 0xC2B2AE35) >>> 0);
    for (let i = 0; i < 4; i++) rnd();   // warm up: mulberry's first outputs correlate across similar seeds
    const total = POOL.reduce((a, w) => a + (w.weight || 1), NONE_WEIGHT);
    let r = rnd() * total;
    r -= NONE_WEIGHT; if (r <= 0) return null;
    for (const w of POOL) { r -= (w.weight || 1); if (r <= 0) return { id: w.id, cls: w.cls, label: w.label, line: w.line, effects: w.effects }; }
    return null;
  };
})();
