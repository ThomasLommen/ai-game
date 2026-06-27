(function(){
  window.Game = window.Game || {};

  // Shared reward application for the procedural-content layer (events, missions,
  // and later research). Effects shape: { cash, insight, exposure, item:true|{slot} }.
  // Negative cash/exposure work too (a cost / a payment).

  // Build a plain common item instance from the archetype pool (for item rewards).
  function makeRandomItem(slot) {
    if (!Game.archetypes) return null;
    const archs = Game.archetypes.all().filter(a => !slot || a.slot === slot);
    if (!archs.length) return null;
    const arch = Game.rng.pick(archs);
    const model = Game.rng.pick(arch.models || []);
    if (!model) return null;
    const base = {};
    for (const k of ['cpu_threads', 'ram_mb', 'heat_output', 'power_draw', 'instability', 'cooling', 'power_capacity']) {
      if (model[k] !== undefined) base[k] = model[k];
    }
    let slots;
    if (model.slotRanges) { slots = {}; for (const [k, r] of Object.entries(model.slotRanges)) slots[k] = r[0] + Math.floor(Game.rng.next() * (r[1] - r[0] + 1)); }
    const brand = model.brand !== undefined ? model.brand : '';
    const name = (arch.name_template || '{brand}{model}').replace('{brand}', brand).replace('{model}', model.model || '').replace(/\s+/g, ' ').trim();
    return { id: Game.inventory.newInstanceId(), archetypeId: arch.id, tier: 'common', name, slot: arch.slot, base, affixes: [], slots, acquiredAt: Date.now() };
  }

  function apply(eff, st) {
    if (!eff) return {};
    const out = {};   // a summary of what was granted (for result pop-ups)
    if (eff.cash)     { st.resources.cash = (st.resources.cash || 0) + eff.cash;       out.cash = eff.cash; Game.events.emit('resource.changed', { id: 'cash', value: st.resources.cash }); }
    if (eff.insight)  { st.resources.insight = (st.resources.insight || 0) + eff.insight; out.insight = eff.insight; Game.events.emit('resource.changed', { id: 'insight', value: st.resources.insight }); }
    if (eff.exposure) { st.exposure = (st.exposure || 0) + eff.exposure;                out.exposure = eff.exposure; Game.events.emit('resource.changed', { id: 'exposure', value: st.exposure }); }
    if (eff.item) {
      const it = makeRandomItem(eff.item && eff.item.slot);
      if (it) {
        st.itemInstances = st.itemInstances || {}; st.itemInstances[it.id] = it;
        st.unequipped = st.unequipped || []; st.unequipped.push(it.id);
        out.item = it;
        Game.events.emit('terminal.print', { lines: [`> acquired: ${it.name}.`], cls: 'dim' });
        Game.events.emit('delivery.arrived', { instance: it });   // reuses the "a part arrived" plumbing
      }
    }
    // Event-pushed offers: drop a contract / operation lead onto the missions board.
    if (eff.pushOp && Game.missionRuntime)       Game.missionRuntime.pushContract(true);
    if (eff.pushContract && Game.missionRuntime) Game.missionRuntime.pushContract(false);
    // Living research tree: splice a (seed-chosen, off-theme-biased) node onto the frontier.
    if (eff.spliceResearch && Game.researchRuntime) {
      const node = Game.researchRuntime.spliceRandom();
      if (node) Game.events.emit('terminal.print', { lines: [`> a new branch opened in your research: ${node.label}.`], cls: 'dim' });
    }
    return out;
  }

  // Risk roll: pick ONE weighted outcome from `outcomes` ([{ w, effects, line, bad }]),
  // apply its effects, and print its result line (so the gamble RESOLVES on screen).
  // The shared primitive behind risk/reward choices in events, missions, and ops.
  // Telegraphing (which stat is at stake) is the caller's job; this just rolls + applies.
  function rollOutcome(outcomes, st) {
    if (!outcomes || !outcomes.length) return null;
    const pick = Game.rng.weighted(outcomes, o => (o.w != null ? o.w : (o.weight != null ? o.weight : 1)));
    if (pick.effects) apply(pick.effects, st);
    if (pick.line) Game.events.emit('terminal.print', { lines: ['> ' + pick.line], cls: pick.bad ? 'err' : 'dim' });
    return pick;
  }

  // Progression-scaled reward magnitudes (the events economy follows Coherence so a
  // payout feels proportional, never an early windfall that trivialises the curve).
  // A jackpot ≈ Coherence × mult, ±spread, floored. Computed at build() time and
  // stored in the event view so render + resolve agree.
  function coherenceScaled(st, mult, spread, steep) {
    const coh = (st && st.resources && st.resources.insight) || 0;
    const sp = (spread == null) ? 0.3 : spread;
    const f = 1 + (Game.rng.next() * 2 - 1) * sp;          // 1 ± spread
    const s = steep ? (1 + coh / steep) : 1;               // opt-in: payouts grow STEEPER at scale (combat passes this; event COSTS don't, so they don't balloon)
    return Math.max(5, Math.round(coh * (mult || 1) * f * s));
  }
  // The bust penalty (exposure) for a failed grab — scales with progression and the
  // greed of the take (bigger potential → bigger sting), capped so it can't one-shot.
  function bustExposure(st, greed) {
    const coh = (st && st.resources && st.resources.insight) || 0;
    return Math.min(25, Math.max(1, Math.round((2 + coh / 45) * (greed || 1))));
  }

  Game.rewards = { apply, makeRandomItem, rollOutcome, coherenceScaled, bustExposure };
})();
