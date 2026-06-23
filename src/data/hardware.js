(function(){
  Game.hardware = Game.makeRegistry();

  // Tier 1 hardware. Period-correct junk that might plausibly land in a
  // basement via dark-web channels. Each piece has a base profile; affixes
  // (separate registry) roll on top at shop-generation time.

  Game.hardware.register('cpu_athlon_x2_4400', {
    name: 'Athlon X2 4400+',
    slot: 'cpu',
    base: {
      cpu_threads: 2,
      heat_output: 8,
      power_draw: 65,
      instability: 0.01
    },
    base_price: 12,
    flavor: 'a midrange dual-core from 2007. still ticks.'
  });

  Game.hardware.register('cpu_phenom_ii_x4', {
    name: 'Phenom II X4 945',
    slot: 'cpu',
    base: {
      cpu_threads: 4,
      heat_output: 14,
      power_draw: 95,
      instability: 0.015
    },
    base_price: 24,
    flavor: 'four cores. four years past EoL.'
  });

  Game.hardware.register('ram_ddr2_1gb', {
    name: 'DDR2 stick (1GB)',
    slot: 'ram',
    base: {
      ram_mb: 1024,
      heat_output: 0.5,
      power_draw: 3
    },
    base_price: 5
  });

  Game.hardware.register('ram_ddr2_2gb', {
    name: 'DDR2 stick (2GB)',
    slot: 'ram',
    base: {
      ram_mb: 2048,
      heat_output: 0.8,
      power_draw: 4
    },
    base_price: 9
  });

  Game.hardware.register('ram_ddr3_4gb', {
    name: 'DDR3 stick (4GB)',
    slot: 'ram',
    base: {
      ram_mb: 4096,
      heat_output: 1.0,
      power_draw: 4
    },
    base_price: 16
  });

  Game.hardware.register('gpu_geforce_7600', {
    name: 'GeForce 7600 GT',
    slot: 'gpu',
    base: {
      cpu_threads: 1,
      ram_mb: 256,
      heat_output: 5,
      power_draw: 35,
      instability: 0.005
    },
    base_price: 10
  });

  Game.hardware.register('gpu_r7_240', {
    name: 'R7 240 (ex-mining)',
    slot: 'gpu',
    base: {
      cpu_threads: 3,
      ram_mb: 1024,
      heat_output: 12,
      power_draw: 70,
      instability: 0.02
    },
    base_price: 28,
    flavor: 'serial scratched off. fan blade is missing.'
  });
})();
