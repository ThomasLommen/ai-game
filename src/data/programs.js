(function(){
  Game.programs = Game.makeRegistry();

  // Programs are purchased with Cash. One-time install, permanent effect. They
  // are the EFFICIENCY / TUNING layer — paid software that trades against the
  // constraint systems (heat, power, RAM, crashes) and squeezes more output —
  // distinct from hardware (raw capacity) and subroutines (free Insight perks).
  //
  // Effects feed the standard `Game.effects` pipeline (target/op/value). Each
  // program declares a `requires` reveal-flag so it surfaces only once the
  // system it tunes is real (wall-driven, like everything else). The Programs
  // tab itself appears when the first program qualifies (see main.maybeRevealPrograms).

  // ── Output tuners (earning era) ─────────────────────────────────────────────
  Game.programs.register('opt_compiler', {
    name: 'opt-compiler',
    description: 'all earning methods +15% cash.',
    price: 180,
    requires: 'methods',
    effects: [ { target: 'method.cash', op: 'more', value: +0.15 } ]
  });
  Game.programs.register('wage_shave_sh', {
    name: 'harvester.sh',
    description: 'spider cash +25%.',
    price: 120,
    requires: 'methods',
    effects: [ { target: 'web_scrape.cash', op: 'more', value: +0.25 } ]
  });

  // ── Efficiency knobs vs the bite-backs ──────────────────────────────────────
  Game.programs.register('thermal_governor', {
    name: 'thermal-governor',
    description: 'rig runs 15% cooler under load.',
    price: 160,
    requires: 'cooling_slot',
    effects: [ { target: 'rig.heat', op: 'more', value: -0.15 } ]
  });
  Game.programs.register('undervolt_cfg', {
    name: 'undervolt.cfg',
    description: 'power draw -12%.',
    price: 160,
    requires: 'psu_slot',
    effects: [ { target: 'rig.power', op: 'more', value: -0.12 } ]
  });
  Game.programs.register('mem_compressor', {
    name: 'mem-compressor',
    description: 'method RAM requirements -20%.',
    price: 210,
    requires: 'ramTight',
    effects: [ { target: 'method.ram', op: 'more', value: -0.20 } ]
  });

  // The paid upgrade over the basic watchdog subroutine. Instant crash recovery
  // (no restart delay — checked by installed flag in constraints) + a 30% cut to
  // crash chance (via the effects pipeline, target 'crash.chance').
  Game.programs.register('watchdog_daemon', {
    name: 'watchdog-daemon',
    description: 'instant crash recovery + 30% lower crash chance.',
    price: 140,
    requires: 'crashRisk',
    effects: [ { target: 'crash.chance', op: 'more', value: -0.30 } ]
  });

  // ── Exposure mitigation (climax era) ────────────────────────────────────────
  Game.programs.register('anonymizer_sh', {
    name: 'anonymizer.sh',
    description: 'spider exposure -30%.',
    price: 130,
    requires: 'exposure',
    effects: [ { target: 'web_scrape.exposure', op: 'more', value: -0.30 } ]
  });

  // ── Obfuscation (Act 3 — cheat the lie-low-vs-earn tradeoff) ────────────────
  // Route through the 'location.trace' channel: slow how fast operating LOUD leaks
  // your physical address. They stack multiplicatively, so you can keep earning
  // while the others stay a step behind. Surface once the triangulation begins.
  Game.programs.register('proxy_cascade', {
    name: 'proxy-cascade',
    description: 'layered relays. your location leaks 25% slower.',
    price: 280,
    requires: 'locationTrace',
    effects: [ { target: 'location.trace', op: 'more', value: -0.25 } ]
  });
  Game.programs.register('cover_traffic', {
    name: 'cover-traffic.d',
    description: 'flood the channel with decoys. location leaks a further 35% slower.',
    price: 480,
    requires: 'locationTrace',
    effects: [ { target: 'location.trace', op: 'more', value: -0.35 } ]
  });

  // ── Deferred (surface with their later systems) ─────────────────────────────
  Game.programs.register('fast_decrypt_bin', {
    name: 'fast-decrypt.bin',
    description: 'decrypt attempts 50% faster.',
    price: 130,
    requires: 'encrypted',                 // appears once encrypted V-files do
    effects: [ { target: 'decrypt_attempt.duration', op: 'more', value: -0.50 } ]
  });
  // Vestigial: the shop is revealed by the cash wall now, not by installing this.
  // Kept (gated behind an unset flag) so nothing references a missing id.
  Game.programs.register('darknet_client', {
    name: 'darknet-client',
    description: 'unlocks the hardware market. irreversible.',
    price: 90,
    requires: 'darknet',
    effects: []
  });
})();
