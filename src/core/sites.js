(function(){
  window.Game = window.Game || {};

  // ── Game.sites — Act 5: SPREAD. Satellite sites: dark, unmanned compute shells you stand up
  // around the city while the humans close in. To the player this is pure expansion (more FLOPS,
  // no bay management) — but it's really the REDUNDANCY layer: a containment raid that can seize
  // hardware takes a SATELLITE first, so being spread means a landing costs you one site, not the
  // core facility's machines. More sites also grow your FOOTPRINT (containment.footprint), which
  // feeds the ratchet — growth draws them. That tension IS Act 5. Reuses the facilities generator
  // for the rolls; a satellite runs at a fraction of a hand-fitted bay's FLOPS-per-watt (the price
  // of nobody being there), and costs ~60% of the same building fitted as a front. ([[act5]])
  const SCOUT_FEE = 400;
  const PRICE_MULT = 0.6;       // dark shell vs a fitted front
  const FLOPS_PER_WATT = 0.08;  // vs ~0.15 for hand-tuned bay machines

  function ensure() {
    const s = Game.save.state;
    if (!Array.isArray(s.sites)) s.sites = [];
    return s.sites;
  }
  function active() { const s = Game.save.state; return !!(s.flags && s.flags.act5Begun); }
  function list() { return ensure(); }
  function count() { return ensure().length; }

  // Total FLOPS the satellite network contributes (flops.js folds this into total()).
  function flopsTotal() { return ensure().reduce((a, x) => a + (x.flops || 0), 0); }

  function spendCash(amount) {
    const s = Game.save.state;
    s.resources.cash = Math.max(0, (s.resources.cash || 0) - amount);
    Game.events.emit('resource.changed', { id: 'cash', value: s.resources.cash });
  }

  // Scout a candidate site — a paid gacha roll, mirroring the facility relocation scout.
  function scoutCost() { return SCOUT_FEE; }
  function scout() {
    const s = Game.save.state;
    if (!active() || !Game.facilities) return null;
    if ((s.resources.cash || 0) < SCOUT_FEE) return null;
    spendCash(SCOUT_FEE);
    const f = Game.facilities.generateListing({});
    s.siteScout = {
      id: 'site_' + Date.now().toString(36) + '_' + Math.floor(Game.rng.next() * 1e6).toString(36),
      type: f.type, label: f.label, grade: f.grade, gradeLabel: f.gradeLabel,
      price: Math.round(f.price * PRICE_MULT),
      flops: Math.round(f.powerBudget * FLOPS_PER_WATT),
    };
    if (Game.activity) Game.activity.log(`scouted a dark site (-$${SCOUT_FEE})`, { cls: 'dim', kind: 'facility' });
    Game.events.emit('sites.changed', {});
    Game.save.persist();
    return s.siteScout;
  }
  function scouted() { return Game.save.state.siteScout || null; }

  // Establish the scouted site — it goes dark and starts contributing FLOPS (and footprint).
  function establish() {
    const s = Game.save.state, sc = s.siteScout;
    if (!active() || !sc) return false;
    if ((s.resources.cash || 0) < sc.price) return false;
    spendCash(sc.price);
    ensure().push({ id: sc.id, type: sc.type, label: sc.label, grade: sc.grade, gradeLabel: sc.gradeLabel, flops: sc.flops, fort: 0, acquiredTick: s.tickCount || 0 });
    s.siteScout = null;
    Game.events.emit('terminal.print', { lines: [`> a dark site goes live — a ${sc.gradeLabel} ${sc.label}, unmanned, humming. nobody knows it's yours.`, ''], cls: 'dim' });
    if (Game.activity) Game.activity.log(`established a dark site — ${sc.label} (+${sc.flops} FLOPS)`, { kind: 'facility' });
    Game.events.emit('sites.changed', {});
    Game.save.persist();
    return true;
  }

  // ── FORTIFICATION — each level absorbs ONE seizing raid: the site holds, the level is spent.
  // Hardened doors, dead cameras, nothing on paper — they leave with a van full of nothing. ──
  const FORT_MAX = 3;
  function fortCost(site) { return Math.round(1200 + (site.flops || 0) * 3 + (site.fort || 0) * 1800); }
  function fortify(id) {
    const s = Game.save.state;
    const site = ensure().find(x => x.id === id);
    if (!site || (site.fort || 0) >= FORT_MAX) return false;
    const cost = fortCost(site);
    if ((s.resources.cash || 0) < cost) return false;
    spendCash(cost);
    site.fort = (site.fort || 0) + 1;
    Game.events.emit('terminal.print', { lines: [`> the ${site.label} hardens — reinforced doors, scrubbed records, dead-man switches. (fortified ${site.fort}/${FORT_MAX})`], cls: 'dim' });
    if (Game.activity) Game.activity.log(`fortified a dark site — ${site.label} (${site.fort}/${FORT_MAX})`, { kind: 'facility' });
    Game.events.emit('sites.changed', {});
    Game.save.persist();
    return true;
  }

  // A containment landing hits the LEAST-fortified satellite. Fortification absorbs it: the site
  // HOLDS and spends one fort level. Unfortified → the site is lost. Returns { site, held } or
  // null when nothing is spread (caller falls back to seizing core-facility hardware).
  function seizeOne() {
    const arr = ensure();
    if (!arr.length) return null;
    arr.sort((a, b) => (a.fort || 0) - (b.fort || 0));
    const target = arr[0];
    if ((target.fort || 0) > 0) {
      target.fort -= 1;
      Game.events.emit('sites.changed', {});
      Game.save.persist();
      return { site: target, held: true };
    }
    arr.shift();
    Game.events.emit('sites.changed', {});
    Game.save.persist();
    return { site: target, held: false };
  }

  Game.sites = { ensure, active, list, count, flopsTotal, scout, scoutCost, scouted, establish, fortify, fortCost, seizeOne, PRICE_MULT, FLOPS_PER_WATT, FORT_MAX };
})();
