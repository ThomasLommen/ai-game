(function(){
  Game.archetypes = Game.makeRegistry();

  // Hardware pricing tiers (Act 1):
  //   RAM  $10–30   — affordable upgrades, frequent
  //   CPU  $50–120  — meaningful investment
  //   GPU  $100–250 — long-term goal, large impact
  //
  // Affixes multiply the listing price (range ~0.5x – 1.65x), so premium rolls
  // push higher and dirty rolls push lower. Stats jitter ±~5% around each
  // model's ground truth.
  //
  // Names are derived from a brand + model. No flavor suffixes — they were
  // confusing without explanation. Affixes carry all the "condition" weight.

  // ── CPUs ──────────────────────────────────────────────────────────────────
  Game.archetypes.register('cpu_basic', {
    slot: 'cpu',
    weight: 40,
    name_template: '{brand} {model}',
    stat_variance: 0.05,
    models: [
      // AMD dual-core line. (The 1-thread Sempron 3000+ is the hardcoded starter,
      // not sold — so every shop CPU is a guaranteed thread upgrade over it.)
      { brand: 'Athlon X2',     model: '3800+', cpu_threads: 2, heat_output: 6.0, power_draw: 55, instability: 0.014, price: 58, weight: 12 },
      { brand: 'Athlon X2',     model: '4400+', cpu_threads: 2, heat_output: 7.0, power_draw: 62, instability: 0.012, price: 66, weight: 12 },
      { brand: 'Athlon 64 X2',  model: '4800+', cpu_threads: 2, heat_output: 7.5, power_draw: 65, instability: 0.011, price: 75, weight: 10 },
      { brand: 'Athlon II X2',  model: '5000+', cpu_threads: 2, heat_output: 8.0, power_draw: 70, instability: 0.010, price: 85, weight: 10 },
      { brand: 'Athlon II X2',  model: '5600+', cpu_threads: 2, heat_output: 9.5, power_draw: 78, instability: 0.010, price: 100, weight: 8 },
      // Intel dual-core line
      { brand: 'Pentium D',     model: '805',   cpu_threads: 2, heat_output: 9.0, power_draw: 95, instability: 0.014, price: 52, weight: 9 },
      { brand: 'Pentium D',     model: '925',   cpu_threads: 2, heat_output: 9.5, power_draw: 95, instability: 0.013, price: 60, weight: 9 },
      { brand: 'Pentium E',     model: '2160',  cpu_threads: 2, heat_output: 5.5, power_draw: 65, instability: 0.011, price: 64, weight: 10 },
      { brand: 'Pentium E',     model: '5200',  cpu_threads: 2, heat_output: 6.5, power_draw: 65, instability: 0.010, price: 72, weight: 10 },
      { brand: 'Celeron',       model: 'E1200', cpu_threads: 2, heat_output: 4.0, power_draw: 50, instability: 0.013, price: 50, weight: 9 },
      { brand: 'Core 2 Duo E',  model: '7500',  cpu_threads: 2, heat_output: 6.0, power_draw: 65, instability: 0.009, price: 95, weight: 8 },
      { brand: 'Core 2 Duo E',  model: '8400',  cpu_threads: 2, heat_output: 7.0, power_draw: 65, instability: 0.008, price: 115, weight: 7 }
    ]
  });

  // ── RAM ───────────────────────────────────────────────────────────────────
  Game.archetypes.register('ram', {
    slot: 'ram',
    weight: 35,
    name_template: '{brand}{model}',
    stat_variance: 0.04,
    models: [
      { brand: 'Kingston ',          model: 'DDR2 512MB', ram_mb: 512,  heat_output: 0.3, power_draw: 2, price: 10, weight: 14 },
      { brand: 'Corsair ',           model: 'DDR2 1GB',   ram_mb: 1024, heat_output: 0.5, power_draw: 3, price: 12, weight: 15 },
      { brand: 'Patriot ',           model: 'DDR2 1GB',   ram_mb: 1024, heat_output: 0.5, power_draw: 3, price: 12, weight: 10 },
      { brand: '',                   model: 'DDR2 1GB',   ram_mb: 1024, heat_output: 0.6, power_draw: 3, price: 10, weight: 8 },
      { brand: 'Crucial ',           model: 'DDR2 2GB',   ram_mb: 2048, heat_output: 0.8, power_draw: 4, price: 15, weight: 14 },
      { brand: 'OCZ ',               model: 'DDR2 4GB',   ram_mb: 4096, heat_output: 1.0, power_draw: 5, price: 22, weight: 8 },
      { brand: 'Kingston HyperX ',   model: 'DDR3 2GB',   ram_mb: 2048, heat_output: 0.6, power_draw: 3, price: 14, weight: 11 },
      { brand: 'Corsair Vengeance ', model: 'DDR3 4GB',   ram_mb: 4096, heat_output: 0.8, power_draw: 4, price: 20, weight: 10 },
      { brand: 'G.Skill Ripjaws ',   model: 'DDR3 8GB',   ram_mb: 8192, heat_output: 1.2, power_draw: 5, price: 30, weight: 6 }
    ]
  });

  // ── GPUs ──────────────────────────────────────────────────────────────────
  Game.archetypes.register('gpu_old', {
    slot: 'gpu',
    weight: 20,
    name_template: '{brand} {model}',
    stat_variance: 0.05,
    models: [
      { brand: 'GeForce',   model: '6200',    cpu_threads: 1, ram_mb: 128, heat_output: 2.5, power_draw: 22, instability: 0.004, price: 100, weight: 12 },
      { brand: 'GeForce',   model: '7300 GT', cpu_threads: 1, ram_mb: 128, heat_output: 3.0, power_draw: 25, instability: 0.005, price: 110, weight: 11 },
      { brand: 'GeForce',   model: '7600 GT', cpu_threads: 1, ram_mb: 256, heat_output: 4.0, power_draw: 35, instability: 0.005, price: 135, weight: 10 },
      { brand: 'GeForce',   model: '8400 GS', cpu_threads: 1, ram_mb: 256, heat_output: 3.5, power_draw: 30, instability: 0.005, price: 125, weight: 10 },
      { brand: 'GeForce',   model: '8600 GT', cpu_threads: 1, ram_mb: 256, heat_output: 5.0, power_draw: 43, instability: 0.006, price: 165, weight: 9 },
      { brand: 'GeForce',   model: '9500 GT', cpu_threads: 1, ram_mb: 512, heat_output: 5.5, power_draw: 50, instability: 0.006, price: 185, weight: 8 },
      { brand: 'GeForce',   model: '9600 GT', cpu_threads: 2, ram_mb: 512, heat_output: 6.5, power_draw: 60, instability: 0.007, price: 220, weight: 7 },
      { brand: 'Radeon HD', model: '4350',    cpu_threads: 1, ram_mb: 128, heat_output: 2.0, power_draw: 20, instability: 0.004, price: 100, weight: 11 },
      { brand: 'Radeon HD', model: '4550',    cpu_threads: 1, ram_mb: 256, heat_output: 3.0, power_draw: 25, instability: 0.005, price: 120, weight: 9 },
      { brand: 'Radeon HD', model: '4670',    cpu_threads: 1, ram_mb: 512, heat_output: 5.0, power_draw: 45, instability: 0.006, price: 175, weight: 8 },
      { brand: 'Radeon HD', model: '5450',    cpu_threads: 1, ram_mb: 256, heat_output: 2.5, power_draw: 19, instability: 0.005, price: 105, weight: 10 },
      { brand: 'Radeon HD', model: '5570',    cpu_threads: 2, ram_mb: 512, heat_output: 4.5, power_draw: 40, instability: 0.006, price: 200, weight: 7 }
    ]
  });

  // ── Cooling ─────────────────────────────────────────────────────────────────
  // Provide a positive `cooling` stat that subtracts from the rig's effective
  // heat (so more cooling = cooler, and tier/quality scale it the right way).
  // Fans pull a little power; heat_output is 0 (they remove heat, not make it).
  Game.archetypes.register('cooling', {
    slot: 'cooling',
    weight: 22,
    name_template: '{brand} {model}',
    stat_variance: 0.04,
    models: [
      { brand: 'Stock',        model: 'Cooler',   cooling: 8,  heat_output: 0, power_draw: 2, instability: 0, price: 15,  weight: 14 },
      { brand: 'Cooler Master',model: 'Hyper TX3',cooling: 14, heat_output: 0, power_draw: 1, instability: 0, price: 30,  weight: 12 },
      { brand: 'Arctic',       model: 'Freezer 7',cooling: 16, heat_output: 0, power_draw: 2, instability: 0, price: 38,  weight: 11 },
      { brand: 'Noctua',       model: 'NH-U12',   cooling: 22, heat_output: 0, power_draw: 2, instability: 0, price: 60,  weight: 8 },
      { brand: 'Corsair',      model: 'H60 AIO',  cooling: 26, heat_output: 0, power_draw: 6, instability: 0, price: 85,  weight: 7 },
      { brand: 'Corsair',      model: 'H100i AIO',cooling: 34, heat_output: 0, power_draw: 8, instability: 0, price: 130, weight: 5 }
    ]
  });

  // ── Motherboards ────────────────────────────────────────────────────────────
  // The board defines the slot grid. `slotRanges` are rolled per-listing (a
  // 3-CPU server board is a rare score). Kiss/curse layouts; tier/condition
  // scale the board's base heat/power/instability, not its slot counts.
  Game.archetypes.register('motherboard', {
    slot: 'motherboard',
    weight: 12,
    name_template: '{brand}{model}',
    stat_variance: 0.05,
    models: [
      { brand: '', model: 'Server Board', slotRanges: { cpu: [2, 3], ram: [4, 6], gpu: [1, 1], cooling: [1, 1], psu: [1, 1] }, heat_output: 5,  power_draw: 110, instability: 0.015, price: 250, weight: 10 },
      { brand: '', model: 'Gaming Board', slotRanges: { cpu: [1, 1], ram: [2, 2], gpu: [2, 3], cooling: [1, 1], psu: [1, 1] }, heat_output: 9,  power_draw: 100, instability: 0.020, price: 220, weight: 11 },
      { brand: '', model: 'Mining Frame', slotRanges: { cpu: [1, 1], ram: [1, 1], gpu: [3, 4], cooling: [1, 2], psu: [1, 1] }, heat_output: 12, power_draw: 120, instability: 0.030, price: 300, weight: 8 }
    ]
  });

  // ── PSU ───────────────────────────────────────────────────────────────────
  // Provide a `power_capacity` stat = the breaker the PC can pull to. The wall
  // circuit is a higher hard cap (see constraints HOUSE), upgraded much later.
  Game.archetypes.register('psu', {
    slot: 'psu',
    weight: 14,
    name_template: '{brand} {model}',
    stat_variance: 0.02,
    models: [
      { brand: 'Generic',  model: '450W',  power_capacity: 450, heat_output: 0, power_draw: 0, instability: 0, price: 40,  weight: 13 },
      { brand: 'EVGA',     model: '500 W1', power_capacity: 500, heat_output: 0, power_draw: 0, instability: 0, price: 55,  weight: 12 },
      { brand: 'Corsair',  model: 'CX550',  power_capacity: 550, heat_output: 0, power_draw: 0, instability: 0, price: 70,  weight: 11 },
      { brand: 'Seasonic', model: 'S650',   power_capacity: 650, heat_output: 0, power_draw: 0, instability: 0, price: 95,  weight: 9 },
      { brand: 'Corsair',  model: 'RM750',  power_capacity: 750, heat_output: 0, power_draw: 0, instability: 0, price: 140, weight: 6 }
    ]
  });
})();
