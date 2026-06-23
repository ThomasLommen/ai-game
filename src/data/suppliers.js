(function(){
  window.Game = window.Game || {};

  // DARKNET SUPPLIERS — named handles you build STANDING with. A seeded subset of the
  // pool is active each run (a different roster every time). Standing (a per-supplier
  // trust meter) gates their stock quality + price; buying raises it (later: their jobs
  // raise it, and you can betray them). Phase A = roster + standing + gating.
  // See [[balance-ui-rework-design]] #4.
  Game.suppliers = {};

  // bias = how much each handle leans toward a slot (used to ATTRIBUTE rolled listings,
  // not to gate which slots exist — so slot availability is unchanged).
  const POOL = [
    { id: 'compute',   handle: 'dr_silicon',     vibe: 'compute, mostly. swears every chip is hand-binned. half of them are.',   bias: { cpu: 3, ram: 2 } },
    { id: 'thermal',   handle: 'c0ld_storage',   vibe: 'cooling + power off data-center decom. runs cold, talks colder.',        bias: { cooling: 3, psu: 3 } },
    { id: 'graphics',  handle: 'the_fence',      vibe: 'GPUs that "fell off a render farm." no serials. no questions.',          bias: { gpu: 3 } },
    { id: 'boards',    handle: 'quartermaster',  vibe: 'boards + whole rigs. methodical. keeps a ledger on everyone.',           bias: { motherboard: 3, cpu: 1 } },
    { id: 'general',   handle: 'salvage_priest', vibe: 'a bit of everything. mostly junk, occasionally a miracle. blesses each sale.', bias: { cpu: 1, ram: 1, gpu: 1, cooling: 1, psu: 1 } },
    { id: 'premium',   handle: 'blacksite',      vibe: 'high-grade only. pricey. does not suffer tire-kickers.',                 bias: { cpu: 2, gpu: 2 } },
    { id: 'cheap',     handle: 'rusty_relay',    vibe: 'cheapest on the board. you get what you pay for. sometimes less.',        bias: { ram: 2, cooling: 1, psu: 1 } },
    { id: 'archivist', handle: 'the_archivist',  vibe: 'rare + odd parts. trades in information as much as hardware.',           bias: { gpu: 1, motherboard: 1, cpu: 1 } }
  ];
  const START = 10, MAX = 100, ROSTER_SIZE = 4;
  function def(id) { return POOL.find(p => p.id === id) || null; }

  function mulberry(seed) {
    let st = (seed >>> 0) || 1;
    return function () { st |= 0; st = (st + 0x6D2B79F5) | 0; let t = Math.imul(st ^ (st >>> 15), 1 | st); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // Seed-pick the active roster (a different darknet crowd each run).
  Game.suppliers.generate = function (seed) {
    const rnd = mulberry((seed ^ 0x27D4EB2F) >>> 0); for (let i = 0; i < 4; i++) rnd();
    const pool = POOL.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    return pool.slice(0, ROSTER_SIZE).map(p => p.id);
  };

  function ensure() {
    const s = Game.save.state;
    s.suppliers = s.suppliers || {};
    s.opening = s.opening || {};
    if (!Array.isArray(s.opening.supplierRoster)) s.opening.supplierRoster = Game.suppliers.generate(s.seed || 1);
    s.opening.supplierRoster.forEach(id => { if (!s.suppliers[id]) s.suppliers[id] = { standing: START }; });
    return s.suppliers;
  }
  Game.suppliers.ensure = ensure;
  Game.suppliers.roster = function () { ensure(); return Game.save.state.opening.supplierRoster.map(id => Game.suppliers.get(id)).filter(Boolean); };
  Game.suppliers.get = function (id) { ensure(); const d = def(id); if (!d) return null; const st = Game.save.state.suppliers[id] || {}; return Object.assign({}, d, { standing: standing(id), burned: !!st.burned }); };
  function standing(id) { ensure(); return (Game.save.state.suppliers[id] || {}).standing || START; }
  Game.suppliers.standing = standing;
  Game.suppliers.tierName = function (st) { return st >= 75 ? 'made' : st >= 50 ? 'trusted' : st >= 25 ? 'contact' : 'stranger'; };
  Game.suppliers.discount = function (id) { return Math.min(0.25, (standing(id) / MAX) * 0.25); };   // up to −25% at "made"
  Game.suppliers.qualityBonus = function (id) { return standing(id) / MAX; };                        // 0..1, gently nudges the tier roll

  Game.suppliers.isBurned = function (id) { ensure(); return !!(Game.save.state.suppliers[id] && Game.save.state.suppliers[id].burned); };
  // BETRAYAL (Phase C): selling a contact out burns the relationship for good — standing
  // to zero, cut off (no stock, no jobs). They stay on the board, dead, so the choice sits there.
  Game.suppliers.burn = function (id) {
    ensure(); const sup = Game.save.state.suppliers[id]; if (!sup) return;
    sup.standing = 0; sup.burned = true;
    Game.events.emit('supplier.changed', { id });
  };

  // Attribute a rolled listing of `slot` to a roster supplier (weighted by their bias;
  // any can carry anything). Burned contacts carry nothing. Slot was decided BEFORE this.
  Game.suppliers.pickForSlot = function (slot) {
    const r = Game.suppliers.roster().filter(s => !s.burned); if (!r.length) return null;
    const w = r.map(s => (s.bias && s.bias[slot]) || 0.4);
    const total = w.reduce((a, b) => a + b, 0); let x = Math.random() * total;
    for (let i = 0; i < r.length; i++) { x -= w[i]; if (x <= 0) return r[i]; }
    return r[0];
  };

  Game.suppliers.gainStanding = function (id, amt) {
    ensure(); const sup = Game.save.state.suppliers[id]; if (!sup) return;
    const before = Game.suppliers.tierName(sup.standing);
    sup.standing = Math.max(0, Math.min(MAX, sup.standing + amt));
    const after = Game.suppliers.tierName(sup.standing);
    if (after !== before) Game.events.emit('supplier.tier', { id, tier: after, up: sup.standing > 0 && amt > 0 });
    Game.events.emit('supplier.changed', { id });
  };

  Game.suppliers.START = START; Game.suppliers.MAX = MAX;
})();
