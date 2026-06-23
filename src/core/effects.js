(function(){
  window.Game = window.Game || {};

  // Collects all currently-active modifier sources (installed programs +
  // unlocked subroutines) and runs them through the standard modifier engine.
  // Tasks call Game.effects.apply(base, target) wherever they need an
  // effective stat — so installing/unlocking anything takes effect immediately
  // on the next computation without per-task wiring.

  function collect(target) {
    const s = Game.save.state;
    const out = [];

    const programs = (s.installed && s.installed.programs) || {};
    for (const id of Object.keys(programs)) {
      const p = Game.programs && Game.programs.get(id);
      if (!p || !p.effects) continue;
      for (const e of p.effects) if (e.target === target) out.push(e);
    }

    const subs = (s.installed && s.installed.subroutines) || {};
    for (const id of Object.keys(subs)) {
      const sub = Game.subroutines && Game.subroutines.get(id);
      if (!sub || !sub.effects) continue;
      for (const e of sub.effects) if (e.target === target) out.push(e);
    }

    // Researched tree nodes contribute their grant effects (stat upgrades).
    const researched = (s.research && s.research.researched) || {};
    for (const id of Object.keys(researched)) {
      const node = (Game.research && Game.research.getNode) ? Game.research.getNode(id) : null;
      if (!node || !node.grant || !node.grant.effects) continue;
      for (const e of node.grant.effects) if (e.target === target) out.push(e);
    }

    // The per-save starter boon (Isaac/Diablo-style starting trait).
    if (s.boon && Game.boons) {
      const b = Game.boons.get(s.boon);
      if (b && b.effects) for (const e of b.effects) if (e.target === target) out.push(e);
    }

    // Run CONDITIONS (stackable) — the seeded opening wrinkle + anything inflicted or
    // granted in play (see conditions.js). Each contributes its matching effects.
    const conds = (s.conditions && Array.isArray(s.conditions)) ? s.conditions : [];
    for (const c of conds) { if (c && c.effects) for (const e of c.effects) if (e.target === target) out.push(e); }

    // RUN-DEFINING CHANGERS (free-for-all stack) — pure-`effects` adaptations contribute here;
    // `mod` rule-rewrites act at their own hook points (see changers.js / researchRuntime.hasMod).
    const owned = (s.changers && s.changers.owned) || {};
    for (const id of Object.keys(owned)) {
      if (!owned[id]) continue;
      const def = (Game.changers && Game.changers.get) ? Game.changers.get(id) : (Game.changersData && Game.changersData.get(id));   // resolves authored + generated
      if (!def || !def.effects) continue;
      for (const e of def.effects) if (e.target === target) out.push(e);
    }

    return out;
  }

  function apply(base, target) {
    return Game.modifiers.calc(base, target, collect(target));
  }

  Game.effects = { collect, apply };
})();
