(function(){
  Game.items = Game.makeRegistry();

  Game.items.register('basement_pc', {
    name: 'Basement PC',
    slot: 'core',
    flavor: 'It hums. It has hummed for a long time.',
    slots: { cpu: 1, ram: 4, gpu: 2, cooling: 1, psu: 1 },
    // The motherboard chassis itself: no compute, just heat/power baseline
    // and the slot grid. CPU/RAM/GPU plug in to provide threads and memory.
    base: {
      cpu_threads: 0,
      ram_mb: 0,
      heat_output: 6,
      power_draw: 90,
      instability: 0.02
    },
    modifiers: [
      { target: 'heat_output', op: 'increased', value: 0.40, source: 'dusty interior' },
      { target: 'instability', op: 'flat',      value: 0.01, source: 'aging capacitors' }
    ]
  });
})();
