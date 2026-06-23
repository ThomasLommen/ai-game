(function(){
  window.Game = window.Game || {};

  // Drives an OPERATION: a 2–4 stage state machine. Each stage rolls a decision
  // type (operations.rollStage), the player chooses, then a stage TASK commits
  // threads + runs a timer; on completion a success roll advances or COLLAPSES the
  // whole op. One operation at a time (state.operation). Reuses Game.rewards.
  const SALVAGE = 0.3;   // collapse pays this fraction of the accrued pot
  const STAGE_COMPLICATION_CHANCE = 0.25;   // even a CLEARED stage can leave prints (hidden roll on top of the choice)

  function freeThreads() {
    const c = Game.tasksRuntime ? Game.tasksRuntime.getCpu() : { total: 0, allocated: 0 };
    return c.total - c.allocated;
  }
  function clamp(x) { return Math.max(0.05, Math.min(0.95, x)); }

  function active() { return Game.save.state.operation || null; }

  // Modal view only while choosing (running stages show as a PROCESS, no modal).
  function current() {
    const op = active();
    return (op && op.phase === 'choosing' && op.stage) ? op : null;
  }

  function begin(offer) {
    const s = Game.save.state;
    if (s.operation) return false;                       // one at a time
    const tmpl = Game.operations.get(offer.opId);
    if (!tmpl) return false;
    s.operation = {
      opId: tmpl.id, name: tmpl.name, theme: tmpl.theme, tier: tmpl.tier,
      stagesTotal: Game.rng.int(tmpl.stages[0], tmpl.stages[1]), stageIdx: 0,
      baseSuccess: tmpl.baseSuccess, threads: tmpl.threads,
      stageCash: tmpl.stageCash, stageDur: tmpl.stageDur,
      finaleMult: tmpl.finaleMult, finaleItem: !!tmpl.finaleItem,
      pot: 0, exposureAccrued: 0, phase: 'choosing', stage: null, curOdds: 0, curReward: 0
    };
    // Marquee NETWORK op: bound to a specific target host. Its base odds come from
    // the host's breach-odds, so a stronger fleet makes the siege easier (flywheel);
    // the finale INHABITS the body rather than just paying out.
    if (offer.hostId && Game.network) {
      s.operation.networkOp = true;
      s.operation.hostId = offer.hostId;
      const h = (Game.network.hosts() || []).find(x => x.id === offer.hostId);
      if (h) {
        s.operation.hostName = h.name;
        s.operation.baseSuccess = clamp(0.30 + 0.5 * Game.network.breachChance(h));
      }
    }
    s.operation.stage = Game.operations.rollStage(s.operation);
    Game.events.emit('terminal.print', { lines: [`> operation begun: ${tmpl.name}. ${s.operation.stagesTotal} stages. no turning back once you're in.`], cls: 'dim' });
    Game.events.emit('operation.changed', {});
    Game.save.persist();
    return true;
  }

  function chooseOption(idx) {
    const s = Game.save.state;
    const op = s.operation;
    if (!op || op.phase !== 'choosing' || !op.stage) return;
    const opt = op.stage.options[idx];
    if (!opt) return;

    if (opt.bail) { finaleCashOut(); return; }
    if (opt.cashCost && (s.resources.cash || 0) < opt.cashCost) {
      Game.events.emit('operation.rejected', { reason: 'cash' }); return;
    }
    const threads = Math.max(1, op.threads + (opt.threadsDelta || 0));
    if (freeThreads() < threads) { Game.events.emit('operation.rejected', { reason: 'threads', need: threads }); return; }
    if (Game.constraints && Game.constraints.isLockedOut()) { Game.events.emit('operation.rejected', { reason: 'lockout' }); return; }

    if (opt.cashCost) Game.rewards.apply({ cash: -opt.cashCost }, s);
    op.exposureAccrued += (opt.exposure || 0);
    op.threads = threads;
    op.curOdds = clamp(op.baseSuccess + (opt.oddsMod || 0));
    op.curReward = Math.round(Game.rng.int(op.stageCash[0], op.stageCash[1]) * (opt.rewardMod || 1));
    const HZ = Game.tick.HZ || 4;
    const dur = Math.max(1, Math.round(Game.rng.int(op.stageDur[0], op.stageDur[1]) * (opt.durMod || 1))) * HZ;

    op.phase = 'running';
    s.tasks.active.push({
      id: 'task_op_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1000),
      defId: 'operation', payload: {}, cpu: op.threads, ram: 0,
      ticksTotal: dur, ticksElapsed: 0, op: true, opLabel: `${op.name} · stage ${op.stageIdx + 1}/${op.stagesTotal}`, startedAt: Date.now()
    });
    Game.events.emit('terminal.print', { lines: [`> ${op.name}: stage ${op.stageIdx + 1}/${op.stagesTotal} underway (${op.threads} thr, ${Math.round(op.curOdds * 100)}%).`], cls: 'dim' });
    Game.events.emit('operation.changed', {});
    Game.save.persist();
  }

  function clearOp() { Game.save.state.operation = null; }

  function resolveStage() {
    const s = Game.save.state;
    const op = s.operation;
    if (!op || op.phase !== 'running') return;
    const won = Game.rng.chance(op.curOdds);
    if (!won) { collapse(); return; }
    op.pot += op.curReward;
    // Hidden complication: even a CLEAN stage can draw heat — a roll on top of the
    // explicit choice (accrued like other op exposure, realized when the op ends).
    if (Game.rng.chance(STAGE_COMPLICATION_CHANCE)) {
      const extra = Game.rng.int(1, 2) + (op.tier >= 4 ? 1 : 0);
      op.exposureAccrued += extra;
      Game.events.emit('terminal.print', { lines: [`> stage clear — but it got noisy (+${extra} exposure on the way out).`], cls: 'dim' });
    }
    op.stageIdx++;
    if (op.stageIdx >= op.stagesTotal) { finale(); return; }
    op.phase = 'choosing';
    op.stage = Game.operations.rollStage(op);
    Game.events.emit('terminal.print', { lines: [`> stage clear. pot: $${op.pot}. ${op.stagesTotal - op.stageIdx} to go.`], cls: 'dim' });
    Game.events.emit('operation.changed', {});
    Game.save.persist();
  }

  function finale() {
    const s = Game.save.state, op = s.operation;
    const payout = Math.round(op.pot * (op.finaleMult || 1.5));
    const reward = { cash: payout };
    if (op.finaleItem) reward.item = true;
    if (op.exposureAccrued) reward.exposure = op.exposureAccrued;
    Game.rewards.apply(reward, s);
    // Marquee network op: the real prize is the BODY — inhabit the target host (its
    // threads join the fleet → breach-power; it starts producing by role).
    let inhabited = false;
    if (op.networkOp && op.hostId && Game.network) {
      const host = (Game.network.hosts() || []).find(h => h.id === op.hostId);
      if (host && !host.inhabited) {
        host.inhabited = true; host.stability = 1; inhabited = true;
        Game.events.emit('host.inhabited', { host, first: false });
        Game.events.emit('terminal.print', { lines: [`> ${op.name}: BREACHED. ${host.name} is yours now — a heavy new body on the network.`, `> payout $${payout}${op.finaleItem ? ' + a part' : ''}.`, ''], cls: 'cyan' });
      }
    }
    if (!inhabited) Game.events.emit('terminal.print', { lines: [`> ${op.name}: COMPLETE. payout $${payout}${op.finaleItem ? ' + a part' : ''}.`, ''], cls: 'dim' });
    // A big score can turn up a research lead (the living tree).
    if (s.revealed && s.revealed.research && Game.researchRuntime && Game.rng.chance(0.30)) {
      const node = Game.researchRuntime.spliceRandom();
      if (node) Game.events.emit('terminal.print', { lines: [`> the job also turned up a research lead: ${node.label}.`], cls: 'dim' });
    }
    if (Game.activity) Game.activity.log(`${op.name}: ${inhabited ? 'BREACHED a marquee host' : 'COMPLETE'} — payout $${payout}${op.finaleItem ? ' + a part' : ''}.`, { cls: 'dim', kind: 'operation' });
    const spoils = Game.changers && Game.rng.chance(0.22);   // a marquee score sometimes yields a run-defining ADAPTATION
    clearOp();
    Game.events.emit('operation.resolved', { won: true });
    Game.save.persist();
    // PICK-A-CHANGER: present the spoils as a choice (after the op overlay closes) — pauses the game.
    if (spoils && Game.incidentRuntime && !Game.incidentRuntime.current()) Game.incidentRuntime.present('op_spoils');
  }

  function finaleCashOut() {
    const s = Game.save.state, op = s.operation;
    const reward = { cash: op.pot };
    if (op.exposureAccrued) reward.exposure = op.exposureAccrued;
    Game.rewards.apply(reward, s);
    Game.events.emit('terminal.print', { lines: [`> ${op.name}: pulled out. banked $${op.pot}.`, ''], cls: 'dim' });
    if (Game.activity) Game.activity.log(`${op.name}: pulled out — banked $${op.pot}.`, { cls: 'dim', kind: 'operation' });
    clearOp();
    Game.events.emit('operation.resolved', { won: 'bailed' });
    Game.save.persist();
  }

  function collapse() {
    const s = Game.save.state, op = s.operation;
    if (!op) return;
    const salvage = Math.round(op.pot * SALVAGE);
    const exposure = op.exposureAccrued + op.stageIdx * 1.5;
    Game.rewards.apply({ cash: salvage, exposure }, s);
    // A marquee infiltration that collapses spikes the hunter's trace and leaves the
    // host hardened-but-still-a-target (grow the fleet and try again).
    const where = op.networkOp && op.hostName ? ` the intrusion of ${op.hostName} was traced.` : '';
    Game.events.emit('terminal.print', { lines: [`! ${op.name}: COLLAPSED at stage ${op.stageIdx + 1}.${where} salvaged $${salvage}. you were noticed (+${exposure.toFixed(1)} exposure).`, ''], cls: 'err' });
    if (Game.activity) Game.activity.log(`${op.name}: COLLAPSED at stage ${op.stageIdx + 1} — salvaged $${salvage}, +${exposure.toFixed(1)} exp.`, { cls: 'err', kind: 'operation' });
    clearOp();
    Game.events.emit('operation.resolved', { won: false });
    Game.save.persist();
  }

  // The running stage task was cancelled (manual abort, or a heat/power/crash
  // trip mid-stage) → the operation falls apart.
  function onStageCancelled() {
    const op = Game.save.state.operation;
    if (op && op.phase === 'running') collapse();
  }

  Game.operationRuntime = { begin, chooseOption, resolveStage, onStageCancelled, current, active, freeThreads, clearOp };
})();
