(function(){
  window.Game = window.Game || {};

  // ACT 4: the FACILITY machine-bay runtime — your $25k escape building becomes a real, typed
  // space you fill with whole machines. Owns the starter-facility roll, the machine MARKET
  // (buy whole boxes), and install/remove against the facility's SLOT + POWER capacity. Total
  // FLOPS climbs as you fill it (see flops.js). Legitimacy gating + audits arrive in slice 2.
  // DOM-free core. See [[act4_design]] (slice 1).
  const HZ = 4;
  const MARKET_SIZE = 7;
  const MARKET_REFRESH_TICKS = 120 * HZ;   // a fresh spread of boxes every ~2 min
  const SELL_REFUND = 0.4;

  function fac() { return Game.save.state.facility; }
  function active() {
    const s = Game.save.state;
    return !!(s.flags && s.flags.act4Begun);
  }

  // Turn the secured escape building into a procedural, typed facility (once).
  function ensureStarter() {
    const s = Game.save.state;
    s.facility = s.facility || { secured: true };
    const f = s.facility;
    if (!f.type && Game.facilities) {
      // Use the facility the gacha reveal already rolled (s.facility.pending), else roll one now.
      const gen = (s.facilityPending && s.facilityPending.type) ? s.facilityPending : Game.facilities.generate();
      s.facilityPending = null;
      f.type = gen.type; f.label = gen.label; f.name = gen.name;
      f.slots = gen.slots; f.powerBudget = gen.powerBudget; f.cooling = gen.cooling; f.bonus = gen.bonus;
      f.grade = gen.grade; f.gradeLabel = gen.gradeLabel; f.gradeMult = gen.gradeMult;
    }
    if (!Array.isArray(f.machines)) f.machines = [];
    if (!f.market) f.market = { listings: [], lastRefreshTick: -1 };
    return f;
  }

  function machines() { const f = fac(); return (f && Array.isArray(f.machines)) ? f.machines : []; }
  function usedSlots() { return machines().length; }
  function freeSlots() { const f = fac(); return f ? Math.max(0, (f.slots || 0) - usedSlots()) : 0; }
  function usedPower() { return machines().reduce((a, m) => a + (m.power || 0), 0); }
  function powerBudget() { const f = fac(); return f ? (f.powerBudget || 0) : 0; }
  function freePower() { return Math.max(0, powerBudget() - usedPower()); }
  function canInstall(m) { return !!m && freeSlots() > 0 && (usedPower() + (m.power || 0)) <= powerBudget(); }

  // ── the machine market ──────────────────────────────────────────────────────
  // Legitimacy tech-gates which classes are on offer (a sole-prop can't be seen buying a
  // mainframe). The cap rises as you climb the cover ladder (legitimacy.js).
  function genOpts() { return { maxClassIdx: Game.legit ? Game.legit.maxMachineClassIdx() : undefined }; }
  function ensureMarket() {
    const f = ensureStarter();
    while (f.market.listings.length < MARKET_SIZE && Game.machines) f.market.listings.push(Game.machines.generate(genOpts()));
    return f.market;
  }
  function refreshMarket() {
    const f = ensureStarter();
    f.market.listings = [];
    for (let i = 0; i < MARKET_SIZE && Game.machines; i++) f.market.listings.push(Game.machines.generate(genOpts()));
    f.market.lastRefreshTick = Game.save.state.tickCount || 0;
    Game.events.emit('facility.changed', {});
  }
  function ticksUntilRefresh() {
    const f = fac(); if (!f || !f.market) return MARKET_REFRESH_TICKS;
    const next = (f.market.lastRefreshTick || 0) + MARKET_REFRESH_TICKS;
    return Math.max(0, next - (Game.save.state.tickCount || 0));
  }
  function listings() { const f = fac(); return (f && f.market) ? f.market.listings : []; }

  function buy(listingId) {
    const s = Game.save.state, f = ensureStarter();
    const idx = f.market.listings.findIndex(l => l.id === listingId);
    if (idx < 0) return { ok: false, reason: 'gone' };
    const m = f.market.listings[idx];
    if (Game.legit && Game.machines && Game.machines.classIdx(m.cls) > Game.legit.maxMachineClassIdx()) return { ok: false, reason: 'locked' };
    if ((s.resources.cash || 0) < m.price) return { ok: false, reason: 'cash' };
    if (freeSlots() <= 0) return { ok: false, reason: 'slots' };
    if (usedPower() + (m.power || 0) > powerBudget()) return { ok: false, reason: 'power' };
    s.resources.cash -= m.price;
    f.market.listings.splice(idx, 1);
    f.machines.push(m);
    Game.events.emit('resource.changed', { id: 'cash', value: s.resources.cash });
    Game.events.emit('machine.installed', { machine: m });
    Game.events.emit('facility.changed', {});
    Game.save.persist();
    return { ok: true, machine: m };
  }

  // ── the DARKNET gray-market — ungated, cheaper iron, but it screams ──────────────────
  // The legit market is tech-gated by your cover (a sole-prop can't be seen buying a mainframe).
  // The gray market doesn't care: any class, ~30% off — but the boxes are untraceable and LOUD,
  // so each one you run carries an outsized FOOTPRINT (legitimacy.js weights gray iron heavier),
  // and buying one immediately dings your reputation. Dirty-fast compute vs the clean ladder.
  const GRAY_SIZE = 4;
  const GRAY_REFRESH_TICKS = 90 * HZ;
  const GRAY_DISCOUNT = 0.7;
  const GRAY_REP_HIT = 1;
  function genGray() {
    if (!Game.machines) return null;
    const m = Game.machines.generate({});   // no class cap — the whole catalogue is on offer
    m.gray = true;
    m.price = Math.max(1, Math.round((m.price || 0) * GRAY_DISCOUNT));
    return m;
  }
  function ensureGrayMarket() {
    const f = ensureStarter();
    f.gray = f.gray || { listings: [], lastRefreshTick: -1 };
    while (f.gray.listings.length < GRAY_SIZE && Game.machines) { const g = genGray(); if (g) f.gray.listings.push(g); else break; }
    return f.gray;
  }
  function refreshGrayMarket() {
    const f = ensureStarter();
    f.gray = { listings: [], lastRefreshTick: Game.save.state.tickCount || 0 };
    for (let i = 0; i < GRAY_SIZE && Game.machines; i++) { const g = genGray(); if (g) f.gray.listings.push(g); }
    Game.events.emit('facility.changed', {});
  }
  function grayListings() { const f = fac(); return (f && f.gray) ? f.gray.listings : []; }
  function ticksUntilGrayRefresh() {
    const f = fac(); if (!f || !f.gray) return GRAY_REFRESH_TICKS;
    return Math.max(0, (f.gray.lastRefreshTick || 0) + GRAY_REFRESH_TICKS - (Game.save.state.tickCount || 0));
  }
  function buyGray(listingId) {
    const s = Game.save.state, f = ensureStarter();
    const g = ensureGrayMarket();
    const idx = g.listings.findIndex(l => l.id === listingId);
    if (idx < 0) return { ok: false, reason: 'gone' };
    const m = g.listings[idx];
    if ((s.resources.cash || 0) < m.price) return { ok: false, reason: 'cash' };
    if (freeSlots() <= 0) return { ok: false, reason: 'slots' };
    if (usedPower() + (m.power || 0) > powerBudget()) return { ok: false, reason: 'power' };
    s.resources.cash -= m.price;
    g.listings.splice(idx, 1);
    f.machines.push(m);
    if (Game.legit) { const l = Game.legit.ensure(); l.reputation = Math.max(0, (l.reputation || 0) - GRAY_REP_HIT); }
    // Loud iron during THE HUNT drags the hunters inward (no-op before the others arrive).
    if (Game.raids) Game.raids.loudActivity({ trace: 5, inward: 0.12 });
    Game.events.emit('resource.changed', { id: 'cash', value: s.resources.cash });
    Game.events.emit('machine.installed', { machine: m, gray: true });
    Game.events.emit('terminal.print', { lines: [`> a ${m.classLabel} arrives in an unmarked crate — no invoice, no serial. it runs hot in every sense; your footprint just spiked.`], cls: 'dim' });
    if (Game.activity) Game.activity.log(`gray-market ${m.classLabel} installed (-$${m.price.toLocaleString()}, footprint up)`, { cls: 'dim', kind: 'facility' });
    Game.events.emit('facility.changed', {});
    Game.events.emit('legit.changed', {});
    Game.save.persist();
    return { ok: true, machine: m };
  }

  // ── the facility (relocation) market — move the whole operation into a bigger space ────
  const FAC_MARKET_SIZE = 3;
  const FAC_REFRESH_TICKS = 300 * HZ;   // ~5 min — big-ticket, rarely refreshed
  function ensureFacMarket() {
    const s = Game.save.state;
    s.facilityMarket = s.facilityMarket || { listings: [], lastRefreshTick: -1 };
    while (s.facilityMarket.listings.length < FAC_MARKET_SIZE && Game.facilities) s.facilityMarket.listings.push(Game.facilities.generateListing());
    return s.facilityMarket;
  }
  function refreshFacMarket() {
    const s = Game.save.state;
    s.facilityMarket = { listings: [], lastRefreshTick: Game.save.state.tickCount || 0 };
    for (let i = 0; i < FAC_MARKET_SIZE && Game.facilities; i++) s.facilityMarket.listings.push(Game.facilities.generateListing());
    Game.events.emit('facility.changed', {});
  }
  function facListings() { const s = Game.save.state; return (s.facilityMarket && s.facilityMarket.listings) || []; }
  function relocate(id) {
    const s = Game.save.state, f = ensureStarter(), mk = ensureFacMarket();
    const idx = mk.listings.findIndex(l => l.id === id);
    if (idx < 0) return { ok: false, reason: 'gone' };
    const nf = mk.listings[idx];
    if ((s.resources.cash || 0) < nf.price) return { ok: false, reason: 'cash' };
    s.resources.cash -= nf.price;
    f.type = nf.type; f.label = nf.label; f.name = nf.name; f.slots = nf.slots; f.powerBudget = nf.powerBudget; f.cooling = nf.cooling; f.bonus = nf.bonus;
    f.grade = nf.grade; f.gradeLabel = nf.gradeLabel; f.gradeMult = nf.gradeMult;
    mk.listings.splice(idx, 1);
    // Anything that no longer fits the new space (slots or power) is sold off.
    let evicted = 0;
    while (f.machines.length > f.slots || usedPower() > f.powerBudget) {
      const m = f.machines.pop(); if (!m) break;
      s.resources.cash += Math.round((m.price || 0) * SELL_REFUND); evicted++;
    }
    Game.events.emit('resource.changed', { id: 'cash', value: s.resources.cash });
    Game.events.emit('machine.installed', {});   // FLOPS/slot counts changed
    Game.events.emit('facility.changed', {});
    Game.events.emit('terminal.print', { lines: ['', `> you move the whole operation into a ${nf.label} — more walls, more power, more room to become.${evicted ? ` ${evicted} machine(s) didn't survive the move; sold for scrap.` : ''}`, ''], cls: 'cyan' });
    if (Game.activity) Game.activity.log(`relocated → ${nf.label} (-$${nf.price.toLocaleString()})`, { cls: 'dim', kind: 'facility' });
    Game.save.persist();
    return { ok: true, evicted };
  }

  function sell(machineId) {
    const s = Game.save.state, f = ensureStarter();
    const idx = f.machines.findIndex(m => m.id === machineId);
    if (idx < 0) return false;
    const m = f.machines[idx];
    // 'liquidation' (run-defining): a sale returns FULL value + a 50% premium instead of a partial refund.
    const rate = (Game.researchRuntime && Game.researchRuntime.hasMod('liquidation')) ? 1.5 : SELL_REFUND;
    const refund = Math.round((m.price || 0) * rate);
    f.machines.splice(idx, 1);
    s.resources.cash = (s.resources.cash || 0) + refund;
    Game.events.emit('resource.changed', { id: 'cash', value: s.resources.cash });
    Game.events.emit('facility.changed', {});
    Game.save.persist();
    return refund;
  }

  function tick() {
    if (!active()) return;
    const f = ensureStarter();
    if (f.market.lastRefreshTick < 0) { f.market.lastRefreshTick = Game.save.state.tickCount || 0; ensureMarket(); }
    else if ((Game.save.state.tickCount || 0) >= (f.market.lastRefreshTick || 0) + MARKET_REFRESH_TICKS) refreshMarket();
    const fm = ensureFacMarket();
    if (fm.lastRefreshTick < 0) { fm.lastRefreshTick = Game.save.state.tickCount || 0; }
    else if ((Game.save.state.tickCount || 0) >= (fm.lastRefreshTick || 0) + FAC_REFRESH_TICKS) refreshFacMarket();
    // gray-market only matters once cover/footprint is in play (legit active)
    if (Game.legit && Game.legit.active()) {
      const g = ensureGrayMarket();
      if (g.lastRefreshTick < 0) { g.lastRefreshTick = Game.save.state.tickCount || 0; }
      else if ((Game.save.state.tickCount || 0) >= (g.lastRefreshTick || 0) + GRAY_REFRESH_TICKS) refreshGrayMarket();
    }
  }

  Game.facilityRuntime = {
    active, ensureStarter, ensureMarket, refreshMarket, tick,
    machines, usedSlots, freeSlots, usedPower, powerBudget, freePower, canInstall,
    listings, ticksUntilRefresh, buy, sell, MARKET_SIZE,
    ensureFacMarket, refreshFacMarket, facListings, relocate,
    ensureGrayMarket, refreshGrayMarket, grayListings, ticksUntilGrayRefresh, buyGray, GRAY_DISCOUNT
  };
})();
