(function(){
  // Operations: the deep mission tier. An operation = 2–4 STAGES; each stage rolls
  // a decision TYPE from a pool (so the next stage is unpredictable), presents a
  // choice, then commits threads for a timer + a success roll. Fail any stage and
  // the whole op COLLAPSES (partial salvage + exposure). Final-stage success pays
  // the accrued pot (× finale bonus). Driven by operations-runtime.
  Game.operations = Game.makeRegistry();
  const R = () => Game.rng;

  Game.operations.register('data_heist', {
    name: 'data heist', theme: 'stealth', tier: 3,
    stages: [3, 4], baseSuccess: 0.72, stageCash: [140, 260], threads: 2, stageDur: [55, 95],
    finaleMult: 1.6, finaleItem: false
  });
  Game.operations.register('deep_infiltration', {
    name: 'deep infiltration', theme: 'infrastructure', tier: 3,
    stages: [3, 4], baseSuccess: 0.70, stageCash: [160, 300], threads: 2, stageDur: [60, 100],
    finaleMult: 1.6, finaleItem: true
  });
  Game.operations.register('rival_sabotage', {
    name: 'sabotage a rival', theme: 'brute-force', tier: 4,
    stages: [4, 4], baseSuccess: 0.66, stageCash: [220, 400], threads: 3, stageDur: [70, 120],
    finaleMult: 1.8, finaleItem: true
  });
  // ── Content depth: more operations ──────────────────────────────────────────
  Game.operations.register('supply_chain', {
    name: 'poison a supply chain', theme: 'infrastructure', tier: 3,
    stages: [3, 4], baseSuccess: 0.70, stageCash: [160, 300], threads: 2, stageDur: [60, 100],
    finaleMult: 1.6, finaleItem: true
  });
  Game.operations.register('ransom_campaign', {
    name: 'run a ransomware campaign', theme: 'brute-force', tier: 3,
    stages: [3, 4], baseSuccess: 0.68, stageCash: [180, 340], threads: 2, stageDur: [65, 110],
    finaleMult: 1.7, finaleItem: false
  });
  Game.operations.register('bank_job', {
    name: 'drain a financial target', theme: 'brute-force', tier: 4,
    stages: [4, 4], baseSuccess: 0.64, stageCash: [250, 450], threads: 3, stageDur: [75, 125],
    finaleMult: 1.8, finaleItem: true
  });

  // ── ACT 2 — MARQUEE network operations (host-bound) ─────────────────────────
  // Launched from the NETWORK panel against a high-value host (corporate/datacenter)
  // instead of a single-roll breach: a multi-stage heist whose finale INHABITS the
  // body (the big flywheel payoff) + a cash bonus. `network:true` keeps them OFF the
  // mission contract board; `hostType` maps a marquee target to its op. baseSuccess
  // here is a placeholder — the runtime overrides it from the host's breach-odds, so
  // a stronger fleet makes the siege easier (the compute flywheel, again).
  Game.operations.register('corp_infiltration', {
    name: 'infiltrate a corporate host', theme: 'stealth', tier: 3, network: true, hostType: 'corporate',
    stages: [3, 4], baseSuccess: 0.65, stageCash: [120, 220], threads: 2, stageDur: [55, 95],
    finaleMult: 1.5, finaleItem: true
  });
  Game.operations.register('datacenter_siege', {
    name: 'siege a datacenter', theme: 'brute-force', tier: 4, network: true, hostType: 'datacenter',
    stages: [4, 4], baseSuccess: 0.58, stageCash: [200, 360], threads: 3, stageDur: [70, 120],
    finaleMult: 1.7, finaleItem: true
  });

  // ── Stage-type generators ──────────────────────────────────────────────────
  // Each returns a plain { type, prompt, options:[{label,hint,oddsMod,rewardMod,
  // threadsDelta?,cashCost?,exposure?,durMod?,bail?}] } — stored on the op so the
  // modal + resolve agree. oddsMod is added to base success for THAT stage only.
  const GEN = {
    risk_reward(op) {
      return { type: 'risk_reward', prompt: 'the path forward splits. how do you take it?', options: [
        { label: 'cautiously', hint: 'safer, smaller cut', oddsMod: +0.12, rewardMod: 0.8 },
        { label: 'aggressively', hint: 'riskier, bigger cut', oddsMod: -0.15, rewardMod: 1.5 }
      ]};
    },
    approach_fork(op) {
      return { type: 'approach_fork', prompt: 'choose your method for this stage.', options: [
        { label: 'stealth', hint: 'high odds, quiet', oddsMod: +0.10, rewardMod: 0.95, exposure: 0 },
        { label: 'brute-force', hint: 'low odds, fat payout, loud', oddsMod: -0.12, rewardMod: 1.4, exposure: 3 },
        { label: 'social', hint: 'balanced', oddsMod: +0.0, rewardMod: 1.15, exposure: 1 }
      ]};
    },
    resource_tradeoff(op) {
      const cost = R().int(60, 160);
      return { type: 'resource_tradeoff', prompt: 'you can buy an edge for this stage.', options: [
        { label: 'throw more threads at it', hint: '+1 thread, better odds', oddsMod: +0.13, rewardMod: 1.0, threadsDelta: +1 },
        { label: `grease a palm ($${cost})`, hint: 'pay for better odds', oddsMod: +0.16, rewardMod: 1.0, cashCost: cost },
        { label: 'push raw', hint: 'no cost, base odds', oddsMod: 0, rewardMod: 1.05 }
      ]};
    },
    scout(op) {
      return { type: 'scout', prompt: 'recon the next move, or move now?', options: [
        { label: 'scout first', hint: 'slower, much better odds', oddsMod: +0.18, rewardMod: 0.95, durMod: 1.5 },
        { label: 'charge in', hint: 'fast, base odds', oddsMod: -0.04, rewardMod: 1.1, durMod: 0.7 }
      ]};
    },
    complication(op) {
      const snag = R().pick(['a rival is sniffing the same target', 'a trace is tightening', 'a patch just dropped on the exploit']);
      const cost = R().int(80, 200);
      return { type: 'complication', prompt: `complication: ${snag}.`, options: [
        { label: `clear it ($${cost})`, hint: 'pay, base odds', oddsMod: 0, rewardMod: 1.0, cashCost: cost },
        { label: 'power through', hint: 'worse odds, gets loud', oddsMod: -0.18, rewardMod: 1.2, exposure: 3 },
        { label: 'pull out now', hint: 'bank what you have, end safely', bail: true }
      ]};
    },
    // ── Content depth: more decision types (more unpredictable stages) ─────────
    insider(op) {
      const cost = R().int(80, 200);
      return { type: 'insider', prompt: 'an insider offers to open a door — for a cut.', options: [
        { label: `pay the insider ($${cost})`, hint: 'much better odds', oddsMod: +0.18, rewardMod: 0.9, cashCost: cost },
        { label: 'do it blind', hint: 'no cut, base odds, bigger take', oddsMod: -0.05, rewardMod: 1.25 }
      ]};
    },
    cover_tracks(op) {
      return { type: 'cover_tracks', prompt: 'scrub the logs behind you, or keep moving?', options: [
        { label: 'scrub the logs', hint: 'slower, but quiet', oddsMod: +0.06, rewardMod: 0.95, durMod: 1.5, exposure: 0 },
        { label: 'keep moving', hint: 'faster, but loud', oddsMod: -0.04, rewardMod: 1.15, durMod: 0.8, exposure: 3 }
      ]};
    },
    escalate(op) {
      return { type: 'escalate', prompt: 'you can push this past the brief for a bigger score.', options: [
        { label: 'escalate', hint: 'bigger cut, louder, riskier', oddsMod: -0.15, rewardMod: 1.6, exposure: 3 },
        { label: 'stick to the plan', hint: 'as briefed', oddsMod: +0.05, rewardMod: 1.0 }
      ]};
    }
  };
  const TYPES = Object.keys(GEN);
  Game.operations.rollStage = (op) => GEN[R().pick(TYPES)](op);
  Game.operations.stageTypes = TYPES;

  // The mission contract board only draws from NON-network ops; marquee network ops
  // are launched from the NETWORK panel against a specific host, never offered cold.
  Game.operations.contractPool = () => Game.operations.all().filter(o => !o.network);
  Game.operations.forHostType  = (type) => Game.operations.all().find(o => o.network && o.hostType === type) || null;

  // The task that runs a single committed stage; on completion the runtime rolls
  // the outcome (success → advance/finale, fail → collapse). Cancelling it
  // (manual abort, or a heat/power/crash trip) collapses the operation.
  Game.tasks.register('operation', {
    name: 'operation', manual: false, cpu: 0, ram: 0, baseTicks: 0,
    onComplete() { if (Game.operationRuntime) Game.operationRuntime.resolveStage(); },
    onCancel() { if (Game.operationRuntime) Game.operationRuntime.onStageCancelled(); }
  });
})();
