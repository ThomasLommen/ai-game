(function(){
  Game.affixes = Game.makeRegistry();

  // RPG-flavor "condition" prefixes. Short, evocative, displayed inline in
  // listing names (e.g. "Uncommon Dusty Athlon X2 4400+"). Each affix carries
  // a price multiplier and a set of modifiers that stack through the standard
  // modifier engine.
  //
  // Each modifier declares a `range: [lo, hi]` — the value is ROLLED per listing
  // (so two Dusty cards differ: one +12% heat, one +21%). `value` is the
  // midpoint, kept as a fallback for any instance generated before rolls existed
  // (and for direct, non-rolled use). Roll granularity is 0.01 (= 1 point).
  //
  // Instability modifiers use flat `op: 'flat'` adds: +5% Instability = +0.05
  // absolute. Instability now feeds HEAT (each point adds INSTAB_HEAT to the rig's
  // effective heat rating — see constraints.js), so poor-condition parts run hotter
  // and throttle you sooner. (The random-crash system it once fed was retired —
  // see [[remove-crash-risk]].) Other stat modifiers use 'more' multiplicatively
  // so they read intuitively against base values.

  // ── Positive ──────────────────────────────────────────────────────────────
  Game.affixes.register('pristine', {
    name: 'Pristine',
    short: 'Pristine',
    polarity: 'positive',
    weight: 5,
    price_mult: 1.25,
    modifiers: [
      { target: 'cpu_threads', op: 'flat', value: 2,     source: 'pristine' },
      { target: 'heat_output', op: 'more', value: -0.05, range: [-0.08, -0.03], source: 'pristine' }
    ]
  });

  Game.affixes.register('refurbished', {
    name: 'Refurbished',
    short: 'Refurbished',
    polarity: 'positive',
    weight: 20,
    price_mult: 0.9,
    modifiers: []
  });

  Game.affixes.register('silicon_lottery_winner', {
    name: 'Silicon Lottery Winner',
    short: 'Silicon Lottery',
    polarity: 'positive',
    weight: 3,
    price_mult: 1.5,
    modifiers: [
      { target: 'cpu_threads', op: 'flat', value: 4,     source: 'silicon lottery' },
      { target: 'power_draw',  op: 'more', value: -0.10, range: [-0.15, -0.06], source: 'silicon lottery' }
    ]
  });

  // ── Negative ──────────────────────────────────────────────────────────────
  Game.affixes.register('dusty', {
    name: 'Dusty',
    short: 'Dusty',
    polarity: 'negative',
    weight: 35,
    price_mult: 0.95,
    modifiers: [
      { target: 'heat_output', op: 'more', value: 0.10, range: [0.06, 0.14], source: 'dusty' },
      { target: 'instability', op: 'flat', value: 0.03, range: [0.02, 0.05], source: 'dusty' }
    ]
  });

  Game.affixes.register('corroded', {
    name: 'Corroded',
    short: 'Corroded',
    polarity: 'negative',
    weight: 20,
    price_mult: 0.5,
    modifiers: [
      { target: 'heat_output', op: 'more', value: 0.22, range: [0.15, 0.30], source: 'corroded' },
      { target: 'instability', op: 'flat', value: 0.12, range: [0.08, 0.16], source: 'corroded' }
    ]
  });

  Game.affixes.register('stripped', {
    name: 'Stripped',
    short: 'Stripped',
    polarity: 'negative',
    weight: 12,
    price_mult: 0.7,
    modifiers: [
      { target: 'heat_output', op: 'more', value: 0.50, range: [0.35, 0.65], source: 'stripped' }
    ]
  });

  Game.affixes.register('faulty', {
    name: 'Faulty',
    short: 'Faulty',
    polarity: 'negative',
    weight: 10,
    price_mult: 0.3,
    modifiers: [
      { target: 'instability', op: 'flat', value: 0.35, range: [0.22, 0.48], source: 'faulty' }
    ]
  });

  // ── Mixed (high-variance enthusiast mods) ────────────────────────────────
  Game.affixes.register('overclocked', {
    name: 'Overclocked',
    short: 'Overclocked',
    polarity: 'mixed',
    weight: 12,
    price_mult: 1.15,
    modifiers: [
      { target: 'cpu_threads', op: 'flat', value: 2,    source: 'overclocked' },
      { target: 'heat_output', op: 'more', value: 0.35, range: [0.25, 0.48], source: 'overclocked' },
      { target: 'power_draw',  op: 'more', value: 0.20, range: [0.12, 0.30], source: 'overclocked' }
    ]
  });

  Game.affixes.register('jury_rigged', {
    name: 'Jury-Rigged',
    short: 'Jury-Rigged',
    polarity: 'mixed',
    weight: 10,
    price_mult: 0.85,
    modifiers: [
      { target: 'cpu_threads', op: 'flat', value: 2,    source: 'jury-rigged' },
      { target: 'power_draw',  op: 'more', value: 0.25, range: [0.15, 0.38], source: 'jury-rigged' },
      { target: 'instability', op: 'flat', value: 0.15, range: [0.08, 0.24], source: 'jury-rigged' }
    ]
  });

  // Roll concrete modifier values for an affix instance from its ranges. Returns
  // a fresh array of {target, op, value, source} — stored on the item instance
  // as `affixMods[affixId]` so the roll is fixed for that part's lifetime.
  function rollOne(m) {
    let v = m.value;
    if (Array.isArray(m.range) && m.range.length === 2) {
      v = m.range[0] + Math.random() * (m.range[1] - m.range[0]);
      v = Math.round(v * 100) / 100;   // 0.01 granularity (1 point)
    }
    return { target: m.target, op: m.op, value: v, source: m.source };
  }
  Game.affixes.rollMods = function(id) {
    const aff = Game.affixes.get(id);
    if (!aff || !aff.modifiers) return [];
    return aff.modifiers.map(rollOne);
  };
})();
