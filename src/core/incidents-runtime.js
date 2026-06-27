(function(){
  window.Game = window.Game || {};

  // Drives dynamic EVENTS: when to fire one (seeded, state-gated, "naturally
  // occurring"), how to present it, and how to resolve the player's choice
  // (effects / gamble / item-grant / item-consume / chain). One active at a time.
  // Events are RARE and SURPRISING: the next one is scheduled at a uniform-random
  // point in [5 min, 15 min] (rolled fresh after each resolves), so there's no
  // regular cadence to anticipate. (Replaces the old fixed-cooldown + per-tick-chance,
  // which felt like a metronome.)
  const HZ = 4;
  const GAP_MIN_TICKS = 3 * 60 * HZ;   // 720  — events land more often now (dialed down from 5–15 min)
  const GAP_MAX_TICKS = 8 * 60 * HZ;   // 1920
  const THREAT_MIN_TICKS = 2 * 60 * HZ; // 480  — an ignored threat escalates 2–6 min later (unpredictable)
  const THREAT_MAX_TICKS = 6 * 60 * HZ; // 1440
  const FLAVOR_MIN_TICKS = 2 * 60 * HZ; // ambient atmosphere cadence (non-modal flavor between the rare event modals)
  const FLAVOR_MAX_TICKS = 5 * 60 * HZ;

  function scheduleNext(st) { st.incidentNextTick = (st.tickCount || 0) + Game.rng.int(GAP_MIN_TICKS, GAP_MAX_TICKS); }

  function ensureState() {
    const st = Game.save.state;
    if (typeof st.incident === 'undefined') st.incident = null;
    if (typeof st.incidentCooldownUntilTick !== 'number') st.incidentCooldownUntilTick = 0;   // legacy field (unused; kept for save-compat)
    if (typeof st.incidentNextTick !== 'number') st.incidentNextTick = -1;                     // -1 = unscheduled (roll the first gap when events come online)
    if (typeof st.pendingThreat === 'undefined') st.pendingThreat = null;                      // an ignored threat awaiting escalation
    if (typeof st.flavorNextTick !== 'number') st.flavorNextTick = -1;
    st.incidentsSeen = st.incidentsSeen || {};
    return st;
  }

  // Ambient flavor: a faint, non-modal atmosphere line on a light varied cadence — keeps
  // the world feeling alive (and watched) between the rare event modals.
  function flavorTick(st) {
    if (st.flavorNextTick < 0) { st.flavorNextTick = (st.tickCount || 0) + Game.rng.int(FLAVOR_MIN_TICKS, FLAVOR_MAX_TICKS); return; }
    if ((st.tickCount || 0) < st.flavorNextTick) return;
    st.flavorNextTick = (st.tickCount || 0) + Game.rng.int(FLAVOR_MIN_TICKS, FLAVOR_MAX_TICKS);
    const line = Game.incidents.flavorLine ? Game.incidents.flavorLine() : null;
    if (line) Game.events.emit('terminal.print', { lines: ['> ' + line], cls: 'faint' });
  }

  // Reward application (cash/insight/exposure/item) lives in the shared
  // Game.rewards module — see applyEffects calls below.

  function consumeRandomSpare(st) {
    const spares = (st.unequipped || []).filter(id => st.itemInstances && st.itemInstances[id]);
    if (!spares.length) return;
    const id = Game.rng.pick(spares);
    st.unequipped = st.unequipped.filter(x => x !== id);
    delete st.itemInstances[id];
    Game.events.emit('item.unequipped', { instanceId: id });
  }

  function eligible(def, st) {
    if ((def.weight || 0) <= 0) return false;            // weight 0 = chain-only, never fires cold
    if (def.oneShot && st.incidentsSeen[def.id]) return false;
    if (def.requires && !def.requires(st)) return false;
    return true;
  }

  // Show a specific incident (also used to advance a chain).
  function present(defId) {
    const st = ensureState();
    const def = Game.incidents.get(defId);
    if (!def) return false;
    st.incident = { defId, view: def.build(st) };        // view is plain data → render + resolve agree
    Game.events.emit('incident.shown', { defId });
    Game.save.persist();
    return true;
  }

  function fire() {
    const st = ensureState();
    const pool = Game.incidents.all().filter(d => eligible(d, st));
    if (!pool.length) return false;
    const def = Game.rng.weighted(pool, d => d.weight || 1);
    return present(def.id);
  }

  function tick() {
    const st = ensureState();
    if (st.flags && st.flags.noEvents) return;            // regression-test switch: suppress event firing
    if (Game.operationRuntime && Game.operationRuntime.current()) return;   // don't stack over an operation choice
    if (!(st.revealed && st.revealed.events)) return;
    flavorTick(st);                                       // ambient atmosphere (non-modal), independent of the event schedule
    if (st.incident) return;                              // one at a time
    // A pending THREAT escalation takes priority over the normal schedule.
    if (st.pendingThreat && (st.tickCount || 0) >= st.pendingThreat.atTick) {
      const def = st.pendingThreat.defId; st.pendingThreat = null;
      if (Game.incidents.get(def)) { present(def); return; }
    }
    if (st.incidentNextTick < 0) { scheduleNext(st); return; }   // first gap, rolled when events come online
    if ((st.tickCount || 0) < st.incidentNextTick) return;
    if (!fire()) scheduleNext(st);                        // nothing eligible right now → try again after another gap (a fired event reschedules on resolve)
  }

  function current() {
    const st = Game.save.state;
    if (!st.incident || !st.incident.view) return null;
    return { defId: st.incident.defId, view: st.incident.view, phase: st.incident.phase || 'choosing', result: st.incident.result || null };
  }

  // Mirror a meaningful event outcome into the persistent ACTIVITY log.
  function logActivity(line, bad, deltas) {
    if (!Game.activity) return;
    const parts = [];
    if (deltas) {
      if (deltas.cash)     parts.push((deltas.cash > 0 ? '+$' : '-$') + Math.abs(Math.round(deltas.cash)));
      if (deltas.insight)  parts.push((deltas.insight > 0 ? '+' : '') + Math.round(deltas.insight) + ' COH');
      if (deltas.exposure) parts.push('+' + deltas.exposure.toFixed(1) + ' exp');
    }
    if (!line && !parts.length) return;   // nothing happened (a clean walk-away) → don't log
    Game.activity.log((line || 'resolved') + (parts.length ? '  (' + parts.join(' · ') + ')' : ''), { cls: bad ? 'err' : 'dim', kind: 'event' });
  }

  function resolve(idx) {
    const st = ensureState();
    if (!st.incident || !st.incident.view) return;
    if (st.incident.phase === 'result') return;            // already resolved — waiting on acknowledge
    const opt = st.incident.view.options[idx];
    if (!opt || opt.disabled) return;
    const defId = st.incident.defId;
    const def = Game.incidents.get(defId);

    // A pure navigation step (a chain branch with no payoff of its own) advances at once.
    const isPureNav = opt.next && !opt.effects && !opt.outcomes && !opt.escalate && !opt.inflict && !opt.gamble && !opt.consumeItem;
    if (isPureNav && Game.incidents.get(opt.next)) { present(opt.next); return; }

    const c0 = st.resources.cash || 0, i0 = st.resources.insight || 0, e0 = st.exposure || 0;
    let picked = null;

    if (opt.consumeItem) consumeRandomSpare(st);
    if (opt.effects) Game.rewards.apply(opt.effects, st);
    if (opt.outcomes) picked = Game.rewards.rollOutcome(opt.outcomes, st);   // dud / jackpot / bust — returns the picked one
    // THREAT: letting it ride schedules a worse follow-up (2–6 min, unpredictable).
    if (opt.escalate && Game.incidents.get(opt.escalate)) {
      st.pendingThreat = { defId: opt.escalate, atTick: (st.tickCount || 0) + Game.rng.int(THREAT_MIN_TICKS, THREAT_MAX_TICKS) };
      Game.events.emit('terminal.print', { lines: ['> you let it ride. it will not stay quiet.'], cls: 'dim' });
    }
    // A threat's final neglect INFLICTS a lasting condition (shown in DIAGNOSTICS).
    if (opt.inflict && Game.conditions && Game.conditions.add(opt.inflict)) {
      Game.events.emit('terminal.print', { lines: [`> a condition takes hold: ${opt.inflict.label}.`], cls: 'err' });
    }
    // BETRAYAL: selling a darknet contact out BURNS them for good (cut off) and brings
    // BLOWBACK — a retaliation threat that closes in (reusing the threat-escalation system).
    if (opt.betray && Game.suppliers) {
      Game.suppliers.burn(opt.betray);
      if (!st.pendingThreat) st.pendingThreat = { defId: 'blowback_1', atTick: (st.tickCount || 0) + Game.rng.int(THREAT_MIN_TICKS, THREAT_MAX_TICKS) };
      Game.events.emit('terminal.print', { lines: ['> the name is sold. the money clears. somewhere, a door you used to walk through just locked for good.'], cls: 'err' });
    }
    if (opt.gamble) {                                       // legacy binary gamble (save-compat)
      const won = Game.rng.chance(opt.gamble.p);
      Game.rewards.apply(won ? opt.gamble.win : opt.gamble.lose, st);
      picked = { line: won ? '…it opens. something inside.' : '…empty. or it never was.', bad: !won };
    }
    // A run-defining ADAPTATION picked from an event (a discovery). The rolled def rides on the option.
    if (opt.grantChangerDef && Game.changers) {
      Game.changers.grantGenerated(opt.grantChangerDef, { silent: true });
      picked = { line: `you internalize ${opt.grantChangerDef.name} — ${opt.grantChangerDef.flavor}.`, bad: false };
    }
    if (def && def.oneShot) st.incidentsSeen[defId] = true;

    const deltas = { cash: (st.resources.cash || 0) - c0, insight: (st.resources.insight || 0) - i0, exposure: (st.exposure || 0) - e0 };
    let line = picked ? picked.line : null, bad = picked ? !!picked.bad : false;
    if (!line) {
      if (opt.escalate)     { line = 'you let it ride. it will come back worse.'; bad = true; }
      else if (opt.inflict) { line = `it takes hold: ${opt.inflict.label}.`; bad = true; }
      else if (opt.betray)  { line = 'the name is sold. they will know it was you.'; bad = true; }
    }
    const hasResult = !!line || deltas.cash || deltas.insight || deltas.exposure;
    const nextId = (opt.next && Game.incidents.get(opt.next)) ? opt.next : null;

    // No payoff (a clean walk-away / pure decline) closes at once; an OUTCOME flips the
    // overlay to a RESULT state you acknowledge — the payoff (or the sting) lands on screen.
    if (!hasResult) {
      if (nextId) { present(nextId); return; }
      st.incident = null; scheduleNext(st);
      Game.events.emit('incident.resolved', { defId });
      Game.save.persist();
      return;
    }
    logActivity(line, bad, deltas);
    st.incident.phase = 'result';
    st.incident.result = { line: line, deltas: deltas, bad: bad };
    st.incident.nextId = nextId;
    Game.events.emit('incident.shown', { defId });         // re-render → the result view
    Game.save.persist();
  }

  // Dismiss the RESULT view → chain on, or close + roll the next gap.
  function acknowledge() {
    const st = ensureState();
    if (!st.incident || st.incident.phase !== 'result') return;
    const defId = st.incident.defId, nextId = st.incident.nextId;
    if (nextId && Game.incidents.get(nextId)) { present(nextId); return; }
    st.incident = null;
    scheduleNext(st);
    Game.events.emit('incident.resolved', { defId });
    Game.save.persist();
  }

  Game.incidentRuntime = { tick, fire, present, resolve, acknowledge, current, ensureState, scheduleNext, GAP_MIN_TICKS, GAP_MAX_TICKS };
})();
