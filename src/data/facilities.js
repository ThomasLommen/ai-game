(function(){
  window.Game = window.Game || {};

  // ACT 3 — FACILITY TYPES + GRADES. The building you operate from is a procedural, TYPED
  // kiss/curse (like the motherboards) rolled as a GACHA PULL when you move in. Two axes:
  //   · TYPE  — your strategic flavour (warehouse/datacenter/office/bunker), each with a REAL
  //             mechanical BONUS (not just a label).
  //   · GRADE — the jackpot axis (derelict → standard → prime → landmark): scales the raw
  //             capacity (slots/power/cooling-headroom) AND the bonus magnitude.
  // Any type can roll any grade. The pull is dramatized in the reveal cutscene (see ui).
  // DOM-free data. See [[facility-acquisition-rework]] + [[act4_design]].
  const TYPES = {
    warehouse:  { label: 'disused warehouse',     slots: [9, 13], power: [7000, 10000],  cooling: 1.0, bonus: 'space'  },
    datacenter: { label: 'gutted datacenter',     slots: [6, 9],  power: [14000, 20000], cooling: 1.6, bonus: 'power'  },
    office:     { label: 'shuttered office park', slots: [5, 8],  power: [6000, 9000],   cooling: 1.0, bonus: 'legit'  },
    bunker:     { label: 'cold-war bunker',       slots: [4, 6],  power: [8000, 11000],  cooling: 1.2, bonus: 'quiet'  }
  };

  // GRADES — the rarity ladder. `mult` scales raw capacity + bonus magnitude. `w` = buy weight,
  // `wInf` = infiltrate weight (seizing a built-out building rolls luckier). `css` reuses the
  // shared loot-tier palette for the reveal aura.
  const GRADES = {
    derelict: { label: 'derelict', mult: 0.8, w: 30, wInf: 12, css: 'junk',     stars: 1 },
    standard: { label: 'standard', mult: 1.0, w: 45, wInf: 38, css: 'common',   stars: 2 },
    prime:    { label: 'prime',    mult: 1.3, w: 20, wInf: 35, css: 'uncommon', stars: 3 },
    landmark: { label: 'landmark', mult: 1.7, w: 5,  wInf: 15, css: 'rare',     stars: 4 }
  };

  // The mechanical BONUS each type carries, at STANDARD grade (×1.0). Grade scales the magnitude.
  //   space → extra machine BAYS (folded into slots)         [warehouse]
  //   power → +cooling capacity fraction                      [datacenter]
  //   legit → flat legitimacy points                          [office]
  //   quiet → footprint reduction fraction                    [bunker]
  const BONUS = {
    space: { base: 3,    label: m => `room to grow — +${m} machine bays` },
    power: { base: 0.30, label: m => `wired for load — +${Math.round(m * 100)}% cooling capacity` },
    legit: { base: 40,   label: m => `looks legitimate — +${m} legitimacy` },
    quiet: { base: 0.18, label: m => `off the books — −${Math.round(m * 100)}% footprint` }
  };

  function rngInt(lo, hi) { return Game.rng ? Game.rng.int(lo, hi) : lo + Math.floor(Math.random() * (hi - lo + 1)); }
  function pickWeighted(map, weightKey) {
    const ids = Object.keys(map);
    if (Game.rng && Game.rng.weighted) return Game.rng.weighted(ids, id => map[id][weightKey] || 0);
    return ids[0];
  }

  function rollGrade(infiltrate) { return pickWeighted(GRADES, infiltrate ? 'wInf' : 'w'); }
  function pickType(opts) {
    if (opts.typeId && TYPES[opts.typeId]) return opts.typeId;
    const keys = Object.keys(TYPES);
    // Infiltrate leans DATACENTER (you broke into a real data facility).
    if (opts.infiltrate && Game.rng && Game.rng.weighted) return Game.rng.weighted(keys, k => k === 'datacenter' ? 2.4 : 1);
    return Game.rng ? Game.rng.pick(keys) : keys[0];
  }

  // Build the mechanical bonus object (grade-scaled).
  function makeBonus(typeBonusId, gradeMult) {
    const b = BONUS[typeBonusId];
    const mag = typeBonusId === 'space' ? Math.max(1, Math.round(b.base * gradeMult))
              : typeBonusId === 'legit' ? Math.round(b.base * gradeMult)
              : Math.round(b.base * gradeMult * 100) / 100;   // fractions (power/quiet)
    return { id: typeBonusId, mag, label: b.label(mag) };
  }

  // Roll a facility — a TYPE × a GRADE, with capacity + bonus scaled by grade.
  // opts: { typeId, gradeId, infiltrate }.
  function generate(opts) {
    opts = opts || {};
    const t = pickType(opts);
    const def = TYPES[t];
    const gradeId = (opts.gradeId && GRADES[opts.gradeId]) ? opts.gradeId : rollGrade(!!opts.infiltrate);
    const g = GRADES[gradeId], m = g.mult;
    const bonus = makeBonus(def.bonus, m);
    let slots = Math.max(2, Math.round(rngInt(def.slots[0], def.slots[1]) * m));
    if (def.bonus === 'space') slots += bonus.mag;   // the warehouse perk = extra bays, folded into the bay count
    const powerBudget = Math.max(1000, Math.round(rngInt(def.power[0], def.power[1]) * m / 100) * 100);
    return {
      type: t, label: def.label, name: def.label,
      grade: gradeId, gradeLabel: g.label, gradeMult: m,
      slots, powerBudget, cooling: def.cooling, bonus
    };
  }

  // A priced facility LISTING — the relocation pull. Price scales with capacity (+ a grade premium).
  function generateListing(opts) {
    const f = generate(opts);
    f.id = 'fac_' + Date.now().toString(36) + '_' + Math.floor((Game.rng ? Game.rng.next() : Math.random()) * 1e6).toString(36);
    f.price = Math.round((f.slots * 900 + f.powerBudget * 2.2) * (0.7 + 0.6 * f.gradeMult));
    return f;
  }

  Game.facilities = { TYPES, GRADES, BONUS, generate, generateListing, makeBonus };
})();
