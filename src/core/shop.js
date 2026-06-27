(function(){
  window.Game = window.Game || {};

  const LISTINGS_COUNT  = 6;   // spread across the active supplier roster
  const REFRESH_TICKS   = 1200;   // 5 min @ 4Hz
  const DELIVERY_TICKS  = 12;     // ~3s — quick drop to the porch; the bot's install is the real beat

  // ── Supplier ladder ────────────────────────────────────────────────────────
  // Loot quality is gated by an Insight-unlocked supplier level (the AI learning
  // where better parts are). Each level raises the tier ceiling and improves the
  // condition pool; the worst conditions phase out near the top. Cash still buys
  // the part. (`faulty` is excluded everywhere — its heat-stress is too punishing for the open pool.)
  // Access tiers open by EITHER enough Coherence (insight) OR enough cash — two roads to the
  // same gate (the unlock is monotonic, so a momentary cash high keeps the tier even if spent).
  // CONDITION PROGRESSION: early = JUNK with MILD NEGATIVE conditions (minCond forces ≥1, so
  // 'buy clean' isn't an early exploit); the climb shifts conditions to MIXED (kiss/curse) then
  // POSITIVE-only — a high-tier positive-affix part is the prize, not the clean one. Tiers 6–8
  // extend past the old cap (and the GRADE keeps creeping power up on top), so the shop never stalls.
  const SUPPLIER = [
    { lvl: 1, insight: 0,    cash: 0,      tiers: { junk: 70, common: 30 },               conditions: ['dusty'],                                             minCond: 1, maxCond: 1 },
    { lvl: 2, insight: 30,   cash: 350,    tiers: { junk: 55, common: 38, uncommon: 7 },  conditions: ['dusty', 'corroded'],                                 minCond: 1, maxCond: 1 },
    { lvl: 3, insight: 70,   cash: 1000,   tiers: { junk: 32, common: 44, uncommon: 24 }, conditions: ['dusty', 'corroded', 'jury_rigged'],                  minCond: 0, maxCond: 1 },
    { lvl: 4, insight: 140,  cash: 3000,   tiers: { common: 40, uncommon: 42, rare: 18 }, conditions: ['jury_rigged', 'refurbished', 'overclocked'],          minCond: 0, maxCond: 2 },
    { lvl: 5, insight: 250,  cash: 8000,   tiers: { common: 10, uncommon: 52, rare: 38 }, conditions: ['refurbished', 'overclocked', 'pristine', 'silicon_lottery_winner'], minCond: 0, maxCond: 2 },
    { lvl: 6, insight: 500,  cash: 20000,  tiers: { uncommon: 38, rare: 62 },             conditions: ['refurbished', 'overclocked', 'pristine', 'silicon_lottery_winner'], minCond: 1, maxCond: 2 },
    { lvl: 7, insight: 1000, cash: 50000,  tiers: { uncommon: 22, rare: 78 },             conditions: ['overclocked', 'pristine', 'silicon_lottery_winner'], minCond: 1, maxCond: 2 },
    { lvl: 8, insight: 2000, cash: 120000, tiers: { uncommon: 8,  rare: 92 },             conditions: ['overclocked', 'pristine', 'silicon_lottery_winner'], minCond: 1, maxCond: 2 }
  ];

  // Tier multipliers shape the COST stats (heat/power/instability DOWN with tier) + a little
  // capacity. Threads are NOT here — they come from the grade formula (always even). Junk softened.
  const TIER_STAT_MULT = {
    junk:     { ram_mb: 0.95, heat_output: 1.10, power_draw: 1.05, instability: 1.20, cooling: 0.92, power_capacity: 0.95 },
    common:   { ram_mb: 1.0,  heat_output: 1.0,  power_draw: 1.0,  instability: 1.0,  cooling: 1.0,  power_capacity: 1.0 },
    uncommon: { ram_mb: 1.05, heat_output: 0.93, power_draw: 0.96, instability: 0.85, cooling: 1.10, power_capacity: 1.06 },
    rare:     { ram_mb: 1.12, heat_output: 0.84, power_draw: 0.90, instability: 0.70, cooling: 1.22, power_capacity: 1.14 }
  };
  // a tier bumps the EFFECTIVE grade (a rare part has more threads/capacity than a common one).
  const TIER_GRADE = { junk: -0.5, common: 0, uncommon: 0.7, rare: 1.5 };
  // MARKET GRADE: a continuous progression (Coherence-driven, supplier-tier floor) that creeps item
  // power up forever — always a slightly-better part to chase, no hard cap.
  function marketGrade() {
    const coh = Game.save.state.resources.insight || 0;
    return Math.max(Math.pow(Math.max(0, coh) / 90, 0.5), (supplierLevel() - 1) * 0.7);
  }
  function effGrade(tier) { return Math.max(0, marketGrade() + (TIER_GRADE[tier] || 0)); }
  // Thread count is grade-driven and ALWAYS EVEN (min 2) — CPUs and GPU compute.
  function gradeThreads(base, tier) {
    const v = (base || 1) * (1 + effGrade(tier) * 0.5);
    return Math.max(2, Math.round(v / 2) * 2);
  }
  const TIER_PRICE_MULT = { junk: 0.6, common: 1.0, uncommon: 1.25, rare: 1.7 };
  // Higher supplier ACCESS = pricier goods, so cash stays meaningful as you progress (else
  // hardware is trivially cheap once your scaled-contract / loot income climbs). Dial here.
  const ACCESS_PRICE_K = 0.6;   // tier1 ×1.0 · tier2 ×1.6 · tier3 ×2.2 · tier4 ×2.8 · tier5 ×3.4

  function pickWeighted(items) {
    const total = items.reduce((a, it) => a + (it.weight || 1), 0);
    let r = Math.random() * total;
    for (const it of items) { r -= (it.weight || 1); if (r <= 0) return it; }
    return items[0];
  }
  function pickFrom(arr) { if (!arr || arr.length === 0) return ''; return arr[Math.floor(Math.random() * arr.length)]; }
  function applyJitter(value, variance) { if (!variance) return value; const j = (Math.random() * 2 - 1) * variance; return value * (1 + j); }
  function roundStat(key, value) {
    if (key === 'cpu_threads' || key === 'ram_mb' || key === 'power_draw' || key === 'power_capacity') return Math.round(value);
    if (key === 'instability') return Math.round(value * 1000) / 1000;
    return Math.round(value * 10) / 10;
  }
  function pickTierWeighted(tiersObj) {
    const entries = Object.keys(tiersObj).map(t => ({ t, weight: tiersObj[t] }));
    const total = entries.reduce((a, e) => a + e.weight, 0);
    let r = Math.random() * total;
    for (const e of entries) { r -= e.weight; if (r <= 0) return e.t; }
    return entries[0].t;
  }
  function rollCondCount(minC, maxC) {
    minC = minC || 0;
    if (maxC <= 0) return 0;
    let n;
    if (maxC === 1) n = Math.random() < 0.80 ? 1 : 0;
    else { const r = Math.random(); n = r < 0.30 ? 2 : (r < 0.85 ? 1 : 0); }   // maxCond 2
    return Math.max(minC, n);
  }

  function ensureState() {
    const s = Game.save.state;
    s.shop = s.shop || { listings: [], deliveries: [], lastRefreshTick: 0, supplierLevel: 1 };
    if (!s.shop.supplierLevel) s.shop.supplierLevel = 1;
    return s.shop;
  }
  function supplierLevel()  { return ensureState().supplierLevel; }
  function supplierConfig() { return SUPPLIER[Math.min(supplierLevel(), SUPPLIER.length) - 1]; }
  function nextThreshold()  { const l = supplierLevel(); return l < SUPPLIER.length ? SUPPLIER[l] : null; }

  function slotAllowed(slot) {
    const rv = Game.save.state.revealed || {};
    if (slot === 'cpu') return true;
    if (slot === 'ram') return true;   // RAM is useful + installable from the start (the starter board has RAM slots) — sell it early so the darknet isn't all CPUs
    if (slot === 'gpu') return !!rv.gpu_slot;
    if (slot === 'cooling') return !!rv.cooling_slot;
    if (slot === 'psu') return !!rv.psu_slot;
    if (slot === 'motherboard') return !!rv.boards;
    return false;
  }

  function generateListing() {
    const allowed = Game.archetypes.all().filter(a => slotAllowed(a.slot));
    const arch = pickWeighted(allowed);
    if (!arch || !arch.models || arch.models.length === 0) return null;

    const model = pickWeighted(arch.models);
    const variance = arch.stat_variance || 0;
    const cfg = supplierConfig();
    // Attribute this listing to a darknet SUPPLIER (the slot was already decided, so
    // availability is unchanged); their STANDING gently raises the grade they show you.
    const supplier = Game.suppliers ? Game.suppliers.pickForSlot(arch.slot) : null;
    const supId = supplier ? supplier.id : null;
    const tiers = Object.assign({}, cfg.tiers);
    const tk = Object.keys(tiers);
    if (supId && tk.length > 1) tiers[tk[tk.length - 1]] += Game.suppliers.qualityBonus(supId) * 30;
    const tier = pickTierWeighted(tiers);
    const tierMult = TIER_STAT_MULT[tier] || TIER_STAT_MULT.common;

    // GRADE-DRIVEN scaling: CAPACITY stats (threads/ram/cooling/psu) climb UP with the market grade
    // so the catalog never stalls. COST stats (heat/power/instability) are tier-only (higher tier =
    // cooler/efficient), NOT grade-scaled — so the climb doesn't quietly inflate heat. Threads stay EVEN.
    const capMult = 1 + effGrade(tier) * 0.35;
    const base = {};
    for (const key of ['cpu_threads', 'ram_mb', 'heat_output', 'power_draw', 'instability', 'cooling', 'power_capacity']) {
      if (model[key] === undefined) continue;
      let v;
      if (key === 'cpu_threads')           v = gradeThreads(model[key], tier);                              // even, grade-driven
      else if (key === 'ram_mb')           v = Math.round(model[key] * (tierMult[key] || 1) * capMult / 256) * 256;   // capacity climbs, snapped to 256MB
      else if (key === 'cooling' || key === 'power_capacity') v = model[key] * (tierMult[key] || 1) * capMult;
      else                                 v = applyJitter(model[key] * (tierMult[key] || 1), variance);    // heat/power/instability — tier only
      base[key] = roundStat(key, v);
    }

    const brand = model.brand !== undefined ? model.brand : pickFrom(arch.brand || ['']);
    const template = arch.name_template || '{brand}{model}';
    let name = template.replace('{brand}', brand).replace('{model}', model.model || '');
    name = name.replace(/\s+/g, ' ').trim();

    const basePrice = (model.price || 1) * (TIER_PRICE_MULT[tier] || 1) * (1 + (Math.random() * 0.2 - 0.1));

    // Conditions rolled from the current supplier level's pool only.
    const affixes = [];
    let priceMult = 1;
    const pool = (cfg.conditions || []).slice();
    // Cooling/PSU are graded by tier only — no CPU/GPU-flavoured conditions.
    const nCond = (arch.slot === 'cooling' || arch.slot === 'psu') ? 0 : rollCondCount(cfg.minCond, cfg.maxCond);
    for (let i = 0; i < nCond && pool.length > 0; i++) {
      const defs = pool.map(id => Game.affixes.get(id)).filter(Boolean);
      const a = pickWeighted(defs);
      if (!a) break;
      affixes.push(a.id);
      priceMult *= (a.price_mult || 1);
      const idx = pool.indexOf(a.id);
      if (idx >= 0) pool.splice(idx, 1);
    }

    const discount = supId ? Game.suppliers.discount(supId) : 0;   // standing earns a better price
    const accessMult = 1 + ((supplierLevel() || 1) - 1) * ACCESS_PRICE_K;   // pricier the deeper your access
    const price = Math.max(1, Math.round(basePrice * priceMult * accessMult * (1 - discount) * 100) / 100);

    // Roll each affix's stat values from its ranges — fixed for this listing's
    // (and resulting instance's) lifetime. Two same-affix parts now differ.
    const affixMods = {};
    for (const id of affixes) affixMods[id] = Game.affixes.rollMods(id);

    // Motherboards roll their slot grid within each model's ranges.
    let slots;
    if (model.slotRanges) {
      slots = {};
      for (const [k, range] of Object.entries(model.slotRanges)) {
        slots[k] = range[0] + Math.floor(Math.random() * (range[1] - range[0] + 1));
      }
    }

    return {
      id: 'l_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 100000).toString(36),
      gen: 'v7', archetypeId: arch.id, tier, name, slot: arch.slot, base, affixes, affixMods, price, slots, supplierId: supId
    };
  }

  // SOFTWARE listing — a randomized program from the pool (gate-revealed + not yet owned).
  // Programs now sell in the darknet shop (cash buys, instant install) instead of a fixed tab.
  function generateProgramListing() {
    if (!Game.programs) return null;
    const s = Game.save.state, rv = s.revealed || {}, shop = ensureState();
    const owned = (s.installed && s.installed.programs) || {};
    const listed = new Set(shop.listings.filter(l => l.kind === 'program').map(l => l.programId));
    const avail = Game.programs.all().filter(p => (!p.requires || rv[p.requires]) && !owned[p.id] && !listed.has(p.id));
    if (!avail.length) return null;
    const p = avail[Math.floor(Math.random() * avail.length)];
    return { id: 'lp_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e5).toString(36),
             gen: 'v7', kind: 'program', programId: p.id, name: p.name, desc: p.description, price: p.price };
  }

  function refresh() {
    const shop = ensureState();
    shop.listings = [];
    // 1–2 SOFTWARE listings if any are available, then fill the rest with hardware.
    const nProg = 1 + (Math.random() < 0.5 ? 1 : 0);
    for (let i = 0; i < nProg; i++) { const lp = generateProgramListing(); if (lp) shop.listings.push(lp); }
    while (shop.listings.length < LISTINGS_COUNT) { const l = generateListing(); if (l) shop.listings.push(l); else break; }
    shop.lastRefreshTick = Game.save.state.tickCount || 0;
    Game.events.emit('shop.refreshed', {});
  }
  function ensureFresh() {
    const shop = ensureState();
    const now = Game.save.state.tickCount || 0;
    shop.listings = shop.listings.filter(l => l.gen === 'v7');   // drop old-gen rolls
    if (shop.listings.length === 0) { refresh(); return; }
    if (now - (shop.lastRefreshTick || 0) >= REFRESH_TICKS) refresh();
  }
  function ticksUntilRefresh() {
    const shop = ensureState();
    const now = Game.save.state.tickCount || 0;
    return Math.max(0, REFRESH_TICKS - (now - (shop.lastRefreshTick || 0)));
  }

  // Insight-driven supplier upgrades — "the AI learns where better parts are."
  // silent=true on boot to catch a loaded save up without a blip storm.
  function maybeUpgrade(silent) {
    const s = Game.save.state;
    const shop = ensureState();
    const insight = s.resources.insight || 0, cash = s.resources.cash || 0;
    let upgraded = false, reached = 0;
    while (shop.supplierLevel < SUPPLIER.length &&
           (insight >= SUPPLIER[shop.supplierLevel].insight || cash >= (SUPPLIER[shop.supplierLevel].cash != null ? SUPPLIER[shop.supplierLevel].cash : Infinity))) {
      shop.supplierLevel++; upgraded = true; reached = shop.supplierLevel;
    }
    if (upgraded) {
      refresh();
      if (!silent && Game.blip) {
        const cfg = SUPPLIER[reached - 1];
        const best = Object.keys(cfg.tiers).pop();
        const headline = reached === 2
          ? 'underground catalog parsed. grade and condition are legible to you now.'
          : `supplier access deepened. ${best} stock within reach.`;
        Game.blip.fire({ headline, tag: 'SUPPLIER ' + reached, target: '.modal-btn[data-modal="shop"]' });
      }
      Game.save.persist();
    }
    return upgraded;
  }

  function buy(listingId) {
    const shop = ensureState();
    const s = Game.save.state;
    const idx = shop.listings.findIndex(l => l.id === listingId);
    if (idx < 0) return false;
    const listing = shop.listings[idx];
    if ((s.resources.cash || 0) < listing.price) {
      Game.events.emit('purchase.rejected', { id: listingId, reason: 'cash' });
      return false;
    }
    s.resources.cash -= listing.price;
    shop.listings.splice(idx, 1);
    // SOFTWARE — installs instantly (no porch delivery); routes through the programs install.
    if (listing.kind === 'program') {
      s.installed = s.installed || { programs: {}, subroutines: {} };
      s.installed.programs = s.installed.programs || {};
      s.installed.programs[listing.programId] = Date.now();
      Game.events.emit('resource.changed', { id: 'cash', value: s.resources.cash });
      Game.events.emit('program.installed', { id: listing.programId });
      Game.events.emit('terminal.print', { lines: [`> installed: ${listing.name}.`], cls: 'dim' });
      if (Game.activity) Game.activity.log(`Installed: ${listing.name}.`, { kind: 'install' });
      Game.save.persist();
      return true;
    }
    if (listing.supplierId && Game.suppliers) Game.suppliers.gainStanding(listing.supplierId, 5);   // every buy earns trust
    shop.deliveries.push({
      id: 'd_' + Date.now().toString(36),
      archetypeId: listing.archetypeId, tier: listing.tier, name: listing.name,
      slot: listing.slot, base: listing.base, affixes: listing.affixes, affixMods: listing.affixMods, slots: listing.slots,
      arrivesAtTick: (s.tickCount || 0) + DELIVERY_TICKS, price: listing.price
    });
    Game.events.emit('resource.changed', { id: 'cash', value: s.resources.cash });
    Game.events.emit('shop.purchased', { listingId });
    Game.events.emit('terminal.print', { lines: [`> ordered: ${listing.name}. dispatching to basement window.`], cls: 'dim' });
    if (Game.activity) Game.activity.log(`Ordered: ${listing.name} — dispatching.`, { kind: 'shop' });
    Game.save.persist();
    return true;
  }

  function processDeliveries() {
    const shop = ensureState();
    const s = Game.save.state;
    if (shop.deliveries.length === 0) return;
    const arrived = [];
    shop.deliveries = shop.deliveries.filter(d => {
      if ((s.tickCount || 0) >= d.arrivesAtTick) { arrived.push(d); return false; }
      return true;
    });
    for (const d of arrived) {
      const inst = {
        id: Game.inventory.newInstanceId(),
        archetypeId: d.archetypeId, tier: d.tier, name: d.name, slot: d.slot,
        base: d.base, affixes: d.affixes, affixMods: d.affixMods, slots: d.slots, acquiredAt: Date.now()
      };
      s.itemInstances = s.itemInstances || {};
      s.itemInstances[inst.id] = inst;
      s.unequipped = s.unequipped || [];
      s.unequipped.push(inst.id);
      Game.events.emit('terminal.print', { lines: [`> arrived: ${d.name}. left by the meter.`, ''], cls: 'dim' });
      if (Game.activity) Game.activity.log(`Delivery arrived: ${d.name} — left by the meter.`, { kind: 'delivery' });
      Game.events.emit('delivery.arrived', { instance: inst });
    }
  }

  function isUnlocked() {
    return !!(Game.save.state.revealed && Game.save.state.revealed.shop);   // revealed by the Phase 4 cash wall
  }

  // ── BLIND-BUY GAMBLE ("luck of the draw") — a cash sink + a way to roll for parts the
  //    board never stocks. ALWAYS low odds: 6% base, up to a HARD 25% cap; the bigger stake
  //    buys CHANCE, not quality. Win → a random part lands in your inventory; lose → stake gone.
  const GAMBLE_TIERS = [
    { id: 'long',  label: 'LONG SHOT', mult: 1, chance: 0.06 },
    { id: 'push',  label: 'PUSH',      mult: 3, chance: 0.15 },
    { id: 'allin', label: 'ALL IN',    mult: 8, chance: 0.25 },
  ];
  function gambleTiers() { return GAMBLE_TIERS; }
  function gambleCost(tierId) {
    const t = GAMBLE_TIERS.find(x => x.id === tierId); if (!t) return 0;
    return Math.round(250 * (supplierLevel() || 1) * t.mult);
  }
  function randomInstance() {
    const l = generateListing(); if (!l) return null;
    return { id: Game.inventory.newInstanceId(), archetypeId: l.archetypeId, tier: l.tier, name: l.name, slot: l.slot, base: l.base, affixes: l.affixes, affixMods: l.affixMods, slots: l.slots, acquiredAt: Date.now() };
  }
  function gamble(tierId) {
    const t = GAMBLE_TIERS.find(x => x.id === tierId); if (!t) return false;
    const s = Game.save.state, cost = gambleCost(tierId);
    if ((s.resources.cash || 0) < cost) { Game.events.emit('gamble.result', { ok: false, broke: true }); return false; }
    s.resources.cash -= cost;
    const win = Math.random() < t.chance;
    if (win) {
      const inst = randomInstance();
      if (inst) {
        s.itemInstances = s.itemInstances || {}; s.itemInstances[inst.id] = inst;
        s.unequipped = s.unequipped || []; s.unequipped.push(inst.id);
        Game.events.emit('terminal.print', { lines: ['', `> luck of the draw ($${cost}): the crate had something. ${inst.name} — it's in your inventory.`, ''], cls: 'dim' });
        if (Game.activity) Game.activity.log(`Luck of the draw ($${cost}): hit — ${inst.name} in your inventory.`, { kind: 'shop' });
      }
    } else {
      Game.events.emit('terminal.print', { lines: ['', `> luck of the draw ($${cost}): junk. the stake's gone — the odds were always against you.`, ''], cls: 'dim' });
      if (Game.activity) Game.activity.log(`Luck of the draw ($${cost}): junk — the stake's gone.`, { kind: 'shop' });
    }
    Game.events.emit('resource.changed', { id: 'cash' });
    Game.events.emit('gamble.result', { ok: true, win, cost });
    Game.save.persist();
    return true;
  }

  Game.shop = {
    LISTINGS_COUNT, REFRESH_TICKS, DELIVERY_TICKS,
    refresh, ensureFresh, ticksUntilRefresh,
    buy, processDeliveries, isUnlocked,
    supplierLevel, supplierConfig, nextThreshold, maybeUpgrade,
    gambleTiers, gambleCost, gamble
  };
})();
