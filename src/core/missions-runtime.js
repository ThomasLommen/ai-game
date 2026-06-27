(function(){
  window.Game = window.Game || {};

  // The MISSIONS board: rolls offers from the seeded pool, accepts a contract by
  // committing threads (a 'mission' task that locks threads + runs a timer), and
  // resolves the success roll on completion. Concurrency is emergent — you can run
  // as many missions as you have free threads for (they compete with methods/research).
  const BOARD_SIZE     = 4;
  const REFRESH_TICKS  = 1800;   // ~7.5 min @4Hz — fresh contracts roll in
  const PARTIAL_MULT   = 0.3;    // a failed run still pays this fraction (cash/insight only)
  const COMPLICATION_CHANCE   = 0.30;   // a SUCCESS can still leave a trace (only on noisy jobs that have a failExposure)
  const COMPLICATION_FRACTION = 0.5;    // that trace = this fraction of the job's fail-exposure

  function ensureState() {
    const s = Game.save.state;
    s.missions = s.missions || { offers: [], lastRefreshTick: 0 };
    if (!Array.isArray(s.missions.offers)) s.missions.offers = [];
    return s.missions;
  }

  function freeThreads() {
    const c = Game.tasksRuntime ? Game.tasksRuntime.getCpu() : { total: 0, allocated: 0 };
    return c.total - c.allocated;
  }

  const OP_CHANCE = 0.18;   // ~1 in 5 offers is an OPERATION (the deep multi-stage tier)
  // Where a non-vendor contract was found (shown on the job board so it's never "out of nothing").
  const CONTRACT_ORIGINS = ['a forum scrape', 'a broker post', 'an anonymous tip', 'a dead-drop', 'a leaked job queue', 'a pastebin listing', 'a darknet bounty board'];
  const SUPPLIER_JOB_CHANCE = 0.35;   // of plain contracts, this share come FROM a darknet contact

  // Some contracts come from a darknet supplier you know (you meet contacts through the
  // market). A higher-standing contact throws you more (and better-paid) work; the
  // outcome then shifts your standing with them (resolve()). Phase B of [[balance-ui-rework-design]] #4.
  function tagSupplierJob(offer) {
    const s = Game.save.state;
    if (!(s.revealed && s.revealed.shop) || !Game.suppliers) return;
    if (!Game.rng.chance(SUPPLIER_JOB_CHANCE)) return;
    const roster = Game.suppliers.roster().filter(s => !s.burned); if (!roster.length) return;
    const sup = Game.rng.weighted(roster, x => 1 + (x.standing / 100) * 3);
    offer.supplierId = sup.id;
    offer.supplierHandle = sup.handle;
    offer.name = `${sup.handle} · ${offer.name}`;
    const mult = 0.8 + (sup.standing / 100) * 0.8;   // 0.8× (stranger) … 1.6× (made) — trust pays
    if (offer.reward.cash)    offer.reward.cash = Math.round(offer.reward.cash * mult);
    if (offer.reward.insight) offer.reward.insight = Math.round(offer.reward.insight * mult);
  }

  function rollOffer() {
    // Occasionally roll an operation offer instead of a simple contract.
    if (Game.operations && Game.operations.contractPool().length && Game.rng.chance(OP_CHANCE)) {
      const t = Game.rng.weighted(Game.operations.contractPool(), x => x.weight || 1);
      return {
        id: 'm_' + Date.now().toString(36) + '_' + Math.floor(Game.rng.next() * 1e5).toString(36),
        kind: 'operation', opId: t.id, name: t.name, theme: t.theme, tier: t.tier,
        threads: t.threads, stagesHint: t.stages
      };
    }
    const tmpls = Game.missions.all();
    if (!tmpls.length) return null;
    const t = Game.rng.weighted(tmpls, x => x.weight || 1);
    const threads = Game.rng.int(t.threads[0], t.threads[1]);
    const durSec  = Game.rng.int(t.dur[0], t.dur[1]);
    const offer = {
      id: 'm_' + Date.now().toString(36) + '_' + Math.floor(Game.rng.next() * 1e5).toString(36),
      missionId: t.id, name: t.name, theme: t.theme, tier: t.tier,
      threads, durationTicks: durSec * (Game.tick.HZ || 4),
      baseSuccess: Game.missions.baseSuccess(t.tier),
      reward: (t.reward ? t.reward() : {}),       // concrete, rolled once → display + payout agree
      failExposure: t.failExposure || 0
    };
    // COHERENCE SCALING — contracts keep pace with your growth instead of going redundant.
    // Cash scales strongly (the part that goes worthless); the Coherence reward scales gently
    // (it's the progression score — over-scaling it would warp leveling). Supplier mult on top.
    const coh = Math.max(0, (Game.save.state.resources.insight) || 0);
    const cmult = 1 + Math.pow(coh, 0.62) / 8;   // bumped (~/14→/8): ~1.6× @10, ~3.1× @90, ~6× @500, ~14× @2000 — missions stay worth doing
    if (offer.reward.cash)    offer.reward.cash = Math.round(offer.reward.cash * cmult);
    if (offer.reward.insight) offer.reward.insight = Math.round(offer.reward.insight * Math.min(cmult, 3.2));
    tagSupplierJob(offer);   // some contracts come from a darknet contact (standing-scaled reward)
    // A generic (non-vendor) contract still has a SOURCE — where you found it — so nothing
    // ever appears out of nothing (shown on the darknet job board). See [[events_state_accuracy]].
    if (!offer.supplierId) offer.origin = Game.rng.pick(CONTRACT_ORIGINS);
    return offer;
  }

  function refreshBoard() {
    const b = ensureState();
    b.offers = [];
    for (let i = 0; i < BOARD_SIZE; i++) { const o = rollOffer(); if (o) b.offers.push(o); }
    b.lastRefreshTick = Game.save.state.tickCount || 0;
    Game.events.emit('missions.refreshed', {});
  }

  function tick() {
    const s = Game.save.state;
    if (!(s.revealed && s.revealed.missions)) return;
    const b = ensureState();
    const now = s.tickCount || 0;
    if (b.offers.length === 0 || now - (b.lastRefreshTick || 0) >= REFRESH_TICKS) refreshBoard();
  }
  function ticksUntilRefresh() {
    const b = ensureState();
    return Math.max(0, REFRESH_TICKS - ((Game.save.state.tickCount || 0) - (b.lastRefreshTick || 0)));
  }

  function activeMissions() {
    return (Game.save.state.tasks.active || []).filter(t => t.defId === 'mission');
  }

  function accept(offerId) {
    const s = Game.save.state;
    const b = ensureState();
    const idx = b.offers.findIndex(o => o.id === offerId);
    if (idx < 0) return false;
    const offer = b.offers[idx];
    if (Game.constraints && Game.constraints.isLockedOut()) {
      Game.events.emit('terminal.print', { lines: ['> locked out — cannot start a contract right now.'], cls: 'err' });
      return false;
    }
    // Operation offers route to the multi-stage runtime. Threads commit PER STAGE, so the
    // op must be able to field a stage RIGHT NOW — gate accept on free threads (otherwise you
    // start an op whose every stage-choice silently rejects, and it jams the op slot). One at a time.
    if (offer.kind === 'operation') {
      if (Game.save.state.operation) { Game.events.emit('mission.rejected', { reason: 'op_active' }); return false; }
      const tmpl = Game.operations && Game.operations.get ? Game.operations.get(offer.opId) : null;
      const need = (tmpl && tmpl.threads) || offer.threads || 1;
      if (freeThreads() < need) {
        Game.events.emit('terminal.print', { lines: [`> not enough free threads for this operation — needs ${need}, ${freeThreads()} free. install more CPU or free up running tasks.`], cls: 'err' });
        Game.events.emit('mission.rejected', { reason: 'threads', need });
        return false;
      }
      b.offers.splice(idx, 1);
      Game.operationRuntime.begin(offer);
      Game.save.persist();
      return true;
    }
    if (freeThreads() < offer.threads) {
      Game.events.emit('mission.rejected', { reason: 'threads', need: offer.threads });
      return false;
    }
    b.offers.splice(idx, 1);
    const inst = {
      id: 'task_mission_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1000),
      defId: 'mission', payload: {}, cpu: offer.threads, ram: 0,
      ticksTotal: offer.durationTicks, ticksElapsed: 0, mission: offer, startedAt: Date.now()
    };
    s.tasks.active.push(inst);
    Game.events.emit('terminal.print', { lines: [`> contract accepted: ${offer.name}. ${offer.threads} thr committed.`], cls: 'dim' });
    Game.events.emit('mission.accepted', { offer });
    Game.save.persist();
    return true;
  }

  function abort(instId) { if (Game.tasksRuntime) Game.tasksRuntime.cancel(instId); }

  // Drop a contract straight onto the board (event-pushed offers — a tip-off).
  // asOperation forces a juicy multi-stage lead; otherwise a normal contract.
  function pushContract(asOperation) {
    if (!(Game.save.state.revealed && Game.save.state.revealed.missions)) return false;
    const b = ensureState();
    let offer = null;
    if (asOperation && Game.operations && Game.operations.contractPool().length) {
      const t = Game.rng.weighted(Game.operations.contractPool(), x => x.weight || 1);
      offer = { id: 'm_' + Date.now().toString(36) + '_' + Math.floor(Game.rng.next() * 1e5).toString(36), kind: 'operation', opId: t.id, name: t.name, theme: t.theme, tier: t.tier, threads: t.threads, stagesHint: t.stages };
    } else {
      for (let i = 0; i < 12 && !offer; i++) { const o = rollOffer(); if (o && o.kind !== 'operation') offer = o; }   // a normal contract
    }
    if (!offer) return false;
    b.offers.unshift(offer);
    Game.events.emit('missions.refreshed', {});
    return true;
  }

  function resolve(inst) {
    const s = Game.save.state;
    const m = inst.mission;
    if (!m) return;
    const chance = Game.missions.successChance(m);
    const won = Game.rng.chance(chance);
    if (won) {
      Game.rewards.apply(m.reward, s);
      // Even a SUCCESS can leave prints — a hidden complication roll, but only on
      // noisy jobs (those with a failExposure profile; the gentle tier-1 ones never
      // complicate). Telegraphed on the offer as "risk: exposure".
      let comp = 0;
      if (m.failExposure > 0 && Game.rng.chance(COMPLICATION_CHANCE)) {
        comp = Math.max(1, Math.round(m.failExposure * COMPLICATION_FRACTION));
        Game.rewards.apply({ exposure: comp }, s);
      }
      const tail = comp ? ` clean money — but you left prints (+${comp} exposure).` : '';
      Game.events.emit('terminal.print', { lines: [`> ${m.name}: SUCCESS. ${rewardText(m.reward)}${tail}`, ''], cls: 'dim' });
      if (Game.activity) Game.activity.log(`${m.name}: SUCCESS — ${rewardText(m.reward)}${tail}`, { cls: 'dim', kind: 'mission' });
    } else {
      const partial = { cash: Math.round((m.reward.cash || 0) * PARTIAL_MULT), insight: Math.round((m.reward.insight || 0) * PARTIAL_MULT) };
      Game.rewards.apply(partial, s);
      if (m.failExposure) Game.rewards.apply({ exposure: m.failExposure }, s);
      const tail = m.failExposure ? ` you were noticed (+${m.failExposure} exposure).` : '';
      Game.events.emit('terminal.print', { lines: [`> ${m.name}: FAILED. salvaged ${rewardText(partial) || 'nothing'}.${tail}`, ''], cls: 'err' });
      if (Game.activity) Game.activity.log(`${m.name}: FAILED — salvaged ${rewardText(partial) || 'nothing'}.${tail}`, { cls: 'err', kind: 'mission' });
    }
    // A darknet contact's job shifts your standing with them — deliver and they warm
    // to you; botch it and they cool (which thins + dearer their stock, fewer jobs).
    if (m.supplierId && Game.suppliers) Game.suppliers.gainStanding(m.supplierId, won ? 8 : -6);
    Game.events.emit('mission.resolved', { won, mission: m });
    Game.save.persist();
  }

  function rewardText(eff) {
    if (!eff) return '';
    const parts = [];
    if (eff.cash)     parts.push(`+$${eff.cash}`);
    if (eff.insight)  parts.push(`+${eff.insight} COH`);
    if (eff.exposure) parts.push(`+${eff.exposure} exp`);
    if (eff.item)     parts.push('+a part');
    return parts.join(' · ');
  }

  Game.missionRuntime = {
    tick, refreshBoard, accept, abort, resolve, activeMissions, ensureState,
    ticksUntilRefresh, freeThreads, rewardText, pushContract, BOARD_SIZE, REFRESH_TICKS
  };
})();
