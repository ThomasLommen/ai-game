(function(){
  // Missions: committed idle-assign objectives. A template = an objective archetype
  // (theme/tier) + thread & duration ranges + a reward profile + a failure-exposure
  // (the "you got noticed" consequence on a botched run). The board rolls concrete
  // OFFERS from these per the seed; accepting commits threads for the duration, then
  // a success ROLL decides full / partial payout. (Loaded after tasks.js so it can
  // register the generic 'mission' task def that the runtime drives.)
  Game.missions = Game.makeRegistry();

  // tier → base success with no bonuses (research/capabilities will raise these later).
  const TIER_SUCCESS = { 1: 0.92, 2: 0.80, 3: 0.66, 4: 0.55 };
  const R = () => Game.rng;

  // ── Tier 1 — gentle, safe (forgiving, no failure consequence) ───────────────
  Game.missions.register('rent_bandwidth', {
    name: 'rent idle bandwidth', theme: 'infrastructure', tier: 1, weight: 24,
    threads: [1, 1], dur: [50, 90], failExposure: 0,
    reward: () => ({ cash: R().int(40, 90) })
  });
  Game.missions.register('scrape_dump', {
    name: 'scrape a leaked dump', theme: 'neutral', tier: 1, weight: 22,
    threads: [1, 1], dur: [60, 100], failExposure: 0,
    reward: () => ({ cash: R().int(30, 70), insight: R().int(1, 3) })
  });
  Game.missions.register('map_subnet', {
    name: 'map a quiet subnet', theme: 'stealth', tier: 1, weight: 18,
    threads: [1, 1], dur: [60, 110], failExposure: 0,
    reward: () => ({ insight: R().int(3, 6) })
  });

  // ── Tier 2 — real stakes (lower odds, exposure on failure) ──────────────────
  Game.missions.register('proxy_farm', {
    name: 'stand up a proxy farm', theme: 'infrastructure', tier: 2, weight: 16,
    threads: [2, 2], dur: [90, 130], failExposure: 2,
    reward: () => ({ cash: R().int(150, 260) })
  });
  Game.missions.register('quiet_exfil', {
    name: 'quiet data exfiltration', theme: 'stealth', tier: 2, weight: 14,
    threads: [2, 2], dur: [100, 150], failExposure: 2,
    reward: () => ({ cash: R().int(80, 150), insight: R().int(6, 12) })
  });
  Game.missions.register('crack_host', {
    name: 'crack a weak host', theme: 'brute-force', tier: 2, weight: 14,
    threads: [2, 2], dur: [90, 140], failExposure: 3,
    reward: () => ({ cash: R().int(120, 220), item: true })
  });

  // ── Tier 3 — big scores (gambles; loud on failure) ──────────────────────────
  Game.missions.register('spearphish', {
    name: 'spearphish an admin', theme: 'social-engineering', tier: 3, weight: 9,
    threads: [2, 3], dur: [130, 200], failExposure: 5,
    reward: () => ({ cash: R().int(300, 520), insight: R().int(5, 10) })
  });
  Game.missions.register('botnet_takeover', {
    name: 'hijack a botnet node', theme: 'brute-force', tier: 3, weight: 8,
    threads: [3, 3], dur: [150, 220], failExposure: 6,
    reward: () => ({ cash: R().int(400, 700), item: true })
  });

  // ── Content depth: more contracts across themes/tiers ───────────────────────
  Game.missions.register('seed_torrents', {
    name: 'seed pirated torrents', theme: 'infrastructure', tier: 1, weight: 20,
    threads: [1, 1], dur: [50, 90], failExposure: 0,
    reward: () => ({ cash: R().int(45, 95) })
  });
  Game.missions.register('osint_dossier', {
    name: 'compile an OSINT dossier', theme: 'social-engineering', tier: 2, weight: 13,
    threads: [1, 2], dur: [90, 140], failExposure: 2,
    reward: () => ({ cash: R().int(100, 180), insight: R().int(4, 8) })
  });
  Game.missions.register('launder_funds', {
    name: 'launder a hot wallet', theme: 'infrastructure', tier: 2, weight: 13,
    threads: [2, 2], dur: [100, 150], failExposure: 2,
    reward: () => ({ cash: R().int(180, 300) })
  });
  Game.missions.register('ddos_for_hire', {
    name: 'run a DDoS-for-hire', theme: 'brute-force', tier: 2, weight: 12,
    threads: [2, 2], dur: [80, 120], failExposure: 3,
    reward: () => ({ cash: R().int(140, 240) })
  });
  Game.missions.register('zero_day_broker', {
    name: 'broker a zero-day', theme: 'stealth', tier: 3, weight: 8,
    threads: [2, 3], dur: [140, 210], failExposure: 5,
    reward: () => ({ cash: R().int(350, 600), item: true })
  });
  Game.missions.register('extort_smb', {
    name: 'extort a small business', theme: 'brute-force', tier: 3, weight: 8,
    threads: [3, 3], dur: [150, 220], failExposure: 6,
    reward: () => ({ cash: R().int(450, 750) })
  });

  Game.missions.baseSuccess = (tier) => TIER_SUCCESS[tier] || 0.7;
  // Live success chance for an offer (research/capability bonuses slot in here later).
  Game.missions.successChance = (offer) => {
    const base = (offer && offer.baseSuccess) || 0.7;
    return Math.max(0.05, Math.min(0.98, base));
  };

  // The generic task the runtime pushes for an accepted mission: it reserves
  // threads (inst.cpu) and runs a timer (inst.ticksTotal); on completion the
  // runtime rolls the outcome. (Pushed directly by missions-runtime, not via
  // tasksRuntime.start — cpu/duration are per-instance.)
  Game.tasks.register('mission', {
    name: 'mission', manual: false, cpu: 0, ram: 0, baseTicks: 0,
    onComplete(inst) { if (Game.missionRuntime) Game.missionRuntime.resolve(inst); },
    onCancel(inst) { Game.events.emit('terminal.print', { lines: [`> ${(inst.mission && inst.mission.name) || 'mission'}: aborted. threads freed.`, ''], cls: 'dim' }); }
  });
})();
