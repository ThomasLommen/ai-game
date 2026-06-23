(function(){
  window.Game = window.Game || {};

  // ACT 4: WHOLE MACHINES — the loot units that fill your facility. You've outgrown the one
  // basement chassis; now you buy whole boxes: desktop towers → workstations → rack servers →
  // server racks → mainframes. Each is ONE object (you don't crack it open) carrying a TIER, a
  // CONDITION/CAPABILITY or two, and a FLOPS rating (+ power draw, heat). Total FLOPS across the
  // facility = your compute power (see flops.js). Handled like Act-1/2 hardware loot, minus the
  // per-part micromanage. DOM-free data. See [[act4_design]] (slice 1).
  //
  // FLOPS values are in literal FLOPS: a tower is tens of FLOPS, a mainframe ~1000+ (~1.5 KFLOPS),
  // so a facility climbs from FLOPS into the KFLOPS range — one continuous curve above the sub-1
  // FLOPS basement rig (the prefix ladder keeps going MFLOPS/GFLOPS/TFLOPS in the later acts).
  const CLASSES = [
    { id: 'tower',      label: 'desktop tower', flops: [8, 16],     power: [120, 220],   heat: [6, 11],   price: [380, 750],     minLegit: 0, weight: 30 },
    { id: 'workstation',label: 'workstation',   flops: [22, 44],    power: [260, 420],   heat: [11, 18],  price: [1300, 2400],   minLegit: 0, weight: 22 },
    { id: 'server',     label: 'rack server',   flops: [65, 130],   power: [520, 850],   heat: [20, 32],  price: [3800, 7000],   minLegit: 1, weight: 16 },
    { id: 'rack',       label: 'server rack',   flops: [210, 420],  power: [1600, 2700], heat: [48, 75],  price: [13000, 24000], minLegit: 2, weight: 9 },
    { id: 'mainframe',  label: 'mainframe',     flops: [720, 1500], power: [4200, 7200], heat: [115, 180], price: [48000, 95000], minLegit: 3, weight: 4 }
  ];
  // Tier ladder (shared vocabulary + CSS with Act-1/2 loot). Scales flops + price.
  const TIERS = {
    junk:     { flops: 0.7, price: 0.6,  weight: 26 },
    common:   { flops: 1.0, price: 1.0,  weight: 40 },
    uncommon: { flops: 1.3, price: 1.4,  weight: 22 },
    rare:     { flops: 1.75, price: 2.1, weight: 12 }
  };
  // CAPABILITIES — the "some have extra stats" loot flavour. Light, self-contained (not the
  // board affix engine). 0–2 per machine, more likely on higher tiers.
  const CAPS = [
    { id: 'oc',     label: 'overclocked',     flopsMult: 1.25, heatMult: 1.30, priceMult: 1.20, weight: 7 },
    { id: 'gpu',    label: 'GPU-dense',       flopsMult: 1.55, powerMult: 1.30, heatMult: 1.30, priceMult: 1.45, weight: 5 },
    { id: 'eff',    label: 'energy-efficient',powerMult: 0.78, priceMult: 1.20, weight: 7 },
    { id: 'cool',   label: 'liquid-cooled',   heatMult: 0.55, priceMult: 1.15, weight: 7 },
    { id: 'refurb', label: 'refurbished',     flopsMult: 0.85, priceMult: 0.65, weight: 9 }
  ];

  function rngInt(lo, hi) { return Game.rng ? Game.rng.int(lo, hi) : lo + Math.floor(Math.random() * (hi - lo + 1)); }
  function rngFloat(lo, hi) { const f = Game.rng ? Game.rng.next() : Math.random(); return lo + f * (hi - lo); }
  function pickW(list) { return Game.rng ? Game.rng.weighted(list, x => x.weight || 1) : list[0]; }
  function pickTier() {
    const ids = Object.keys(TIERS);
    return Game.rng ? Game.rng.weighted(ids, id => TIERS[id].weight) : ids[1];
  }

  // Roll a whole-machine listing. `maxClassIdx` (set by legitimacy later) caps the tier of box
  // available; for slice 1 it's open (cash is the gate).
  function generate(opts) {
    opts = opts || {};
    let pool = CLASSES.slice();
    if (typeof opts.maxClassIdx === 'number') pool = pool.filter((c, i) => i <= opts.maxClassIdx);
    const cls = opts.classId ? CLASSES.find(c => c.id === opts.classId) : pickW(pool);
    const tier = opts.tier || pickTier();
    const tm = TIERS[tier];

    let flops = rngFloat(cls.flops[0], cls.flops[1]) * tm.flops;
    let power = rngFloat(cls.power[0], cls.power[1]);
    let heat  = rngFloat(cls.heat[0], cls.heat[1]);
    let price = rngFloat(cls.price[0], cls.price[1]) * tm.price;

    // 0–2 capabilities, weighted up by tier.
    const caps = [];
    const nCap = (tier === 'rare') ? rngInt(1, 2) : (tier === 'uncommon') ? rngInt(0, 2) : rngInt(0, 1);
    const avail = CAPS.slice();
    for (let i = 0; i < nCap && avail.length; i++) {
      const c = pickW(avail);
      avail.splice(avail.indexOf(c), 1);
      caps.push(c.id);
      flops *= (c.flopsMult || 1); power *= (c.powerMult || 1); heat *= (c.heatMult || 1); price *= (c.priceMult || 1);
    }

    const round1 = v => Math.round(v * 10) / 10;
    return {
      id: 'm_' + Date.now().toString(36) + '_' + Math.floor((Game.rng ? Game.rng.next() : Math.random()) * 1e6).toString(36),
      cls: cls.id, classLabel: cls.label, tier,
      flops: round1(flops), power: Math.round(power), heat: round1(heat),
      price: Math.max(1, Math.round(price)),
      caps
    };
  }

  function capLabel(id) { const c = CAPS.find(x => x.id === id); return c ? c.label : id; }
  function classIdx(clsId) { return CLASSES.findIndex(c => c.id === clsId); }

  Game.machines = { CLASSES, TIERS, CAPS, generate, capLabel, classIdx };
})();
