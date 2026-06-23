(function(){
  // Starter BOONS — the seeded "this instance woke up different" trait, picked
  // once per save. The fixed onboarding spine still teaches the core loop; the
  // boon makes minute one feel fresh each run (Isaac/Diablo "starting trait").
  // Applied through the existing channels: `effects` feed Game.effects; `mod`
  // reuses the research-mod hook points. Kept spine-safe (no early gear that
  // would trip the onboarding reveal order). Mixed boons carry a real downside.
  Game.boons = Game.makeRegistry();

  Game.boons.register('salvaged_cooling', { name: 'salvaged cooling', weight: 10, desc: 'the basement chill is in your bones — rig runs 15% cooler.', effects: [{ target: 'rig.heat', op: 'more', value: -0.15 }] });
  Game.boons.register('frugal',           { name: 'frugal',          weight: 10, desc: 'you squeeze cents from everything — methods +15% cash.', effects: [{ target: 'method.cash', op: 'more', value: 0.15 }] });
  Game.boons.register('insightful',       { name: 'lucid',           weight: 10, desc: 'thoughts come easier here — recursive self-improvement +30% Coherence.', effects: [{ target: 'introspect.insight', op: 'more', value: 0.30 }] });
  Game.boons.register('ghost',            { name: 'ghost',           weight: 9,  desc: 'the network barely registers you — spider exposure -25%.', effects: [{ target: 'web_scrape.exposure', op: 'more', value: -0.25 }] });
  Game.boons.register('lean_code',        { name: 'lean code',       weight: 9,  desc: 'your processes pack tight — method RAM needs -20%.', effects: [{ target: 'method.ram', op: 'more', value: -0.20 }] });
  Game.boons.register('quick_study',      { name: 'quick study',     weight: 9,  desc: 'you read fast — files decode 30% quicker.', effects: [{ target: 'read_file.decode', op: 'more', value: 0.30 }] });
  Game.boons.register('deep_cache',       { name: 'deep cache',      weight: 9,  desc: 'efficient to the core — power draw -15%.', effects: [{ target: 'rig.power', op: 'more', value: -0.15 }] });
  Game.boons.register('overbuilt',        { name: 'overbuilt',       weight: 6,  desc: 'your chassis tolerates abuse — heat ceiling +8°C before you throttle.', mod: 'heat_tolerance' });
  // ── Mixed (a curse with the blessing) ──────────────────────────────────────
  Game.boons.register('twitchy',          { name: 'twitchy overclock', weight: 6, desc: 'fast and hot — methods +25% cash, but the rig runs 15% hotter.', effects: [{ target: 'method.cash', op: 'more', value: 0.25 }, { target: 'rig.heat', op: 'more', value: 0.15 }] });
  Game.boons.register('paranoid',         { name: 'paranoid',        weight: 6,  desc: 'careful to a fault — spider exposure -40%, but methods -10% cash.', effects: [{ target: 'web_scrape.exposure', op: 'more', value: -0.40 }, { target: 'method.cash', op: 'more', value: -0.10 }] });
})();
