(function(){
  window.Game = window.Game || {};

  // ACT 4: FACILITY TYPES — the building you operate from is procedural + TYPED, a
  // kiss/curse like the motherboards ([[motherboard_design]]) but at building scale. The
  // type sets your machine-bay CAPACITY (slots), POWER budget, and COOLING, plus a themed
  // BONUS (footprint/legitimacy hooks wired in slice 2). Your $25k escape building is a
  // rolled STARTER facility; acquiring better/typed facilities is a later progression vector.
  // DOM-free data. See [[act4_design]] (slice 1).
  const TYPES = {
    warehouse:  { label: 'disused warehouse',     slots: [9, 13], power: [7000, 10000],  cooling: 1.0, bonus: { id: 'space',  label: 'room to grow — extra machine bays' } },
    datacenter: { label: 'gutted datacenter',     slots: [6, 9],  power: [14000, 20000], cooling: 1.6, bonus: { id: 'power',  label: 'wired for load — huge power + cooling' } },
    office:     { label: 'shuttered office park', slots: [5, 8],  power: [6000, 9000],   cooling: 1.0, bonus: { id: 'legit',  label: 'looks legitimate — easier cover' } },
    bunker:     { label: 'cold-war bunker',       slots: [4, 6],  power: [8000, 11000],  cooling: 1.2, bonus: { id: 'quiet',  label: 'off the books — low footprint' } }
  };

  function rngInt(lo, hi) { return Game.rng ? Game.rng.int(lo, hi) : lo + Math.floor(Math.random() * (hi - lo + 1)); }

  // Roll a procedural facility instance (a specific type + concrete capacity values).
  function generate(typeId) {
    const keys = Object.keys(TYPES);
    const t = typeId && TYPES[typeId] ? typeId : (Game.rng ? Game.rng.pick(keys) : keys[0]);
    const def = TYPES[t];
    const slots = rngInt(def.slots[0], def.slots[1]);
    const powerBudget = Math.round(rngInt(def.power[0], def.power[1]) / 100) * 100;
    return {
      type: t, label: def.label, name: def.label,
      slots: slots, powerBudget: powerBudget, cooling: def.cooling,
      bonus: def.bonus
    };
  }

  // A priced facility LISTING — what the relocation market offers (a bigger/typed space to
  // move the whole operation into). Price scales with its capacity (slots + power).
  function generateListing(typeId) {
    const f = generate(typeId);
    f.id = 'fac_' + Date.now().toString(36) + '_' + Math.floor((Game.rng ? Game.rng.next() : Math.random()) * 1e6).toString(36);
    f.price = Math.round(f.slots * 900 + f.powerBudget * 2.2);
    return f;
  }

  Game.facilities = { TYPES, generate, generateListing };
})();
