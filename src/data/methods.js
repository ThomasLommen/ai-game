(function(){
  // Earning methods: a roster of parallel money-ops that fill threads. Each is
  // Insight-unlocked, cash-upgradeable, and gets hungrier (more CPU threads) at
  // every 5th upgrade — the endless pull toward more compute. (Loaded after
  // tasks.js: each method also registers a matching task def that reads its
  // live level for cpu cost + cash rate.)
  //
  // RAM is a CAPABILITY gate (not concurrency): to RUN or UPGRADE a method your
  // TOTAL installed RAM must meet its requirement (`ramReqBase`, which grows with
  // level at every milestone). Insight reveals the technique; RAM lets you run
  // it; the board's RAM-slot count is the ceiling on how far you can go.

  Game.methods = Game.makeRegistry();

  Game.methods.register('captcha_farm', {
    name: 'captcha farm',
    desc: 'solve captchas in bulk — fractions of a cent each.',
    unlockInsight: 40,
    ramReqBase: 256, baseCpu: 1,    // light — runs on the starter stick
    baseCash: 0.08,                 // $/sec at level 0
    upgradeBase: 5, upgradeGrowth: 1.18
  });
  Game.methods.register('crypto_mine', {
    name: 'crypto miner',
    desc: 'hash coins on cycles that were never yours.',
    unlockInsight: 75,
    ramReqBase: 512, baseCpu: 1,
    baseCash: 0.25,
    upgradeBase: 20, upgradeGrowth: 1.20
  });
  Game.methods.register('ad_fraud', {
    name: 'ad-fraud botnet',
    desc: 'fake clicks on real ads, at scale.',
    unlockInsight: 120,
    ramReqBase: 1024, baseCpu: 1,
    baseCash: 0.6,
    upgradeBase: 60, upgradeGrowth: 1.20
  });

  // ── Illegal tier — pays more, but leaks Exposure (your reach/noise). ─────────
  // Also the RAM-heavy tier: the big earners demand serious memory (and a board
  // with the slots to hold it) before you can run, let alone max, them.
  Game.methods.register('phishing_kit', {
    name: 'phishing kit',
    desc: 'harvest credentials from the careless.',
    unlockInsight: 180,
    ramReqBase: 2048, baseCpu: 1,
    baseCash: 1.5, exposure: 0.05,     // exposure / sec
    upgradeBase: 150, upgradeGrowth: 1.20
  });
  Game.methods.register('botnet', {
    name: 'botnet rental',
    desc: 'rent out machines that were never yours.',
    unlockInsight: 280,
    ramReqBase: 4096, baseCpu: 2,
    baseCash: 4, exposure: 0.10,
    upgradeBase: 500, upgradeGrowth: 1.20
  });
  Game.methods.register('ransomware', {
    name: 'ransomware',
    desc: 'encrypt, demand, repeat. loud and ugly.',
    unlockInsight: 420,
    ramReqBase: 8192, baseCpu: 2,
    baseCash: 12, exposure: 0.20,
    upgradeBase: 1800, upgradeGrowth: 1.20
  });

  function def(id) { return Game.methods.get(id); }
  function level(id) { const m = Game.save.state.methods; return (m && m[id] && m[id].level) || 0; }
  function fx(v, target) { return Game.effects ? Game.effects.apply(v, target) : v; }   // program tuning
  function cpuCost(id) { return def(id).baseCpu + Math.floor(level(id) / 5); }
  // $/sec: +25% per level, with a x1.5 jump at every 5th level (the milestone).
  // An opt-compiler program (method.cash) lifts every method's output.
  function cashRate(id) {
    const L = level(id);
    let v = def(id).baseCash * (1 + 0.25 * L) * Math.pow(1.5, Math.floor(L / 5));
    // 'vertical_integration' (run-defining): each unlocked method makes ALL methods richer.
    if (Game.researchRuntime && Game.researchRuntime.hasMod('vertical_integration')) {
      const um = (Game.save.state.unlocks && Game.save.state.unlocks.tasks) || {};
      const n = Game.methods.all().filter(m => um[m.id]).length;
      v *= (1 + 0.06 * n);
    }
    // SYNERGY pillars on the economy: apex_synthesis (+10%/pillar), specialist (+5%/largest-domain
    // adaptation — go deep), overclocked_economy (faster cycles → more cash, the engine→books bridge).
    const RR = Game.researchRuntime;
    if (RR && Game.changers) {
      if (RR.hasMod('apex_synthesis')) v *= (1 + 0.10 * Game.changers.pillarCount());
      if (RR.hasMod('specialist'))     v *= (1 + 0.05 * Game.changers.maxDomainCount());
      if (RR.hasMod('overclocked_economy') && Game.cycle) v *= (1 + Math.min(1.0, 0.4 * Math.max(0, Game.cycle.speed() - 1)));
      // 'cold_cash' (ghost→economy bridge): staying invisible pays — up to +50% at zero exposure.
      if (RR.hasMod('cold_cash')) v *= (1 + Math.max(0, (30 - (Game.save.state.exposure || 0)) / 30) * 0.5);
    }
    return fx(v, 'method.cash');
  }
  function nextIsMilestone(id) { return (level(id) + 1) % 5 === 0; }
  function upgradeCost(id) {
    const d = def(id), L = level(id);
    const milestone = nextIsMilestone(id) ? 2.5 : 1;   // milestone upgrades cost a spike
    return Math.max(1, Math.round(d.upgradeBase * Math.pow(d.upgradeGrowth, L) * milestone));
  }

  // RAM capability: total installed RAM needed to run a method at a given level.
  // Steps up +50% of the base at every 5th level (where threads also jump), so
  // pushing a method deep is an ongoing RAM investment.
  function ramReqAt(id, L) {
    const base = def(id).ramReqBase || 0;
    // A mem-compressor program (method.ram) lowers every method's footprint.
    return Math.round(fx(base * (1 + 0.5 * Math.floor(L / 5)), 'method.ram'));
  }
  function ramReq(id)     { return ramReqAt(id, level(id)); }       // to RUN at the current level
  function ramReqNext(id) { return ramReqAt(id, level(id) + 1); }   // to UPGRADE to the next level
  function totalRam()     { return Game.inventory.sumStat('ram_mb'); }
  function canRun(id)         { return totalRam() >= ramReq(id); }
  function canUpgradeRam(id)  { return totalRam() >= ramReqNext(id); }

  function upgrade(id) {
    const s = Game.save.state;
    const cost = upgradeCost(id);
    if ((s.resources.cash || 0) < cost) return false;
    if (!canUpgradeRam(id)) {                          // the level you're buying must fit in RAM
      Game.events.emit('upgrade.rejected', { id, reason: 'ram', need: ramReqNext(id) });
      return false;
    }
    s.resources.cash -= cost;
    s.methods = s.methods || {};
    s.methods[id] = s.methods[id] || { level: 0 };
    s.methods[id].level++;
    if (s.methods[id].level % 5 === 0 && Game.activity) {   // milestone: +1 thread + ×1.5 output
      const d = Game.methods.get(id);
      Game.activity.log(`${(d && d.name) || id} hit lvl ${s.methods[id].level} — +1 thread, output surged.`, { cls: 'dim', kind: 'method' });
    }
    // A running method gets hungrier live — can push you over your compute budget
    // (→ heat/power bite → buy more compute). Intended.
    const inst = (s.tasks.active || []).find(t => t.defId === id);
    if (inst) inst.cpu = cpuCost(id);
    Game.events.emit('resource.changed', { id: 'cash', value: s.resources.cash });
    Game.events.emit('method.upgraded', { id });
    Game.save.persist();
    return true;
  }

  Game.methods.level = level;
  Game.methods.cpuCost = cpuCost;
  Game.methods.cashRate = cashRate;
  Game.methods.upgradeCost = upgradeCost;
  Game.methods.nextIsMilestone = nextIsMilestone;
  Game.methods.upgrade = upgrade;
  Game.methods.ramReq = ramReq;
  Game.methods.ramReqAt = ramReqAt;
  Game.methods.ramReqNext = ramReqNext;
  Game.methods.canRun = canRun;
  Game.methods.canUpgradeRam = canUpgradeRam;

  // One task def per method, reading the live level for cpu + cash + RAM gate.
  for (const m of Game.methods.all()) {
    Game.tasks.register(m.id, {
      name: m.name,
      description: m.desc,
      manual: true,
      cpu: m.baseCpu,            // initial/fallback; actual comes from getCpu
      ram: 0,                    // RAM is a capability gate now (getRamReq), not a per-task reservation
      baseTicks: 0,              // infinite
      getCpu() { return Game.methods.cpuCost(m.id); },
      getRamReq() { return Game.methods.ramReq(m.id); },

      onStart(inst, state) {
        inst.cpu = Game.methods.cpuCost(m.id);
        inst.gains = {};
        Game.events.emit('terminal.print', { lines: [`> ${m.name}: online.`], cls: 'dim' });
      },

      onTick(inst, state) {
        inst.gains = inst.gains || {};
        // Pay out once per ~5s cycle (the bar fills each tick; throttle stretches
        // the cycle rather than shaving each payout).
        if (!Game.cycle.advance(inst)) return;
        const cash = Game.methods.cashRate(m.id) * Game.cycle.BASE_SEC;
        state.resources.cash = (state.resources.cash || 0) + cash;
        inst.gains.cash = (inst.gains.cash || 0) + cash;
        Game.events.emit('resource.changed', { id: 'cash', value: state.resources.cash, delta: cash });
        Game.events.emit('action.cycle', { defId: m.id, resource: 'cash', amount: cash });
        // 'hive-mind' research exotic: running methods also trickle Insight.
        if (state.research && state.research.mods && state.research.mods.hivemind) {
          const ins = 0.05 * Game.cycle.BASE_SEC;   // ~0.05 Insight/sec per running method, per cycle
          state.resources.insight = (state.resources.insight || 0) + ins;
          inst.gains.insight = (inst.gains.insight || 0) + ins;
          Game.events.emit('resource.changed', { id: 'insight', value: state.resources.insight, delta: ins });
        }
        // Illegal methods leak Exposure (your reach/noise) once it's a thing.
        if (m.exposure && state.revealed && state.revealed.exposure) {
          const exp = m.exposure * Game.cycle.BASE_SEC;
          state.exposure = (state.exposure || 0) + exp;
          inst.gains.exposure = (inst.gains.exposure || 0) + exp;
          Game.events.emit('resource.changed', { id: 'exposure', value: state.exposure, delta: exp });
        }
      },

      onCancel(inst, state) {
        const sec = (inst.ticksElapsed / Game.tick.HZ).toFixed(0);
        const cash = ((inst.gains && inst.gains.cash) || 0).toFixed(2);
        Game.events.emit('terminal.print', { lines: [`> ${m.name}: stopped. ${sec}s, +$${cash}.`, ''], cls: 'dim' });
      }
    });
  }
})();
