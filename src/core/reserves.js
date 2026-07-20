(function(){
  window.Game = window.Game || {};

  // ── Game.reserves — Act 5: the war chest, though nobody calls it that. Framed as INSURANCE:
  // cash can be drained by raids, fines, and downtime — reserves can't. Banking is ONE-WAY
  // (matériel buried in dead drops, compute pre-paid under false names, favors called in and
  // stored; you can't un-bury it). Each dark site also trickles a little in on its own — an
  // unmanned shell quietly stockpiling. The player reads this as raid-proofing their winnings;
  // it is actually the currency Act 6's war will spend, and how much got banked shapes what
  // kind of war they can afford to fight. ([[act5]] Phase 5)
  const HZ = 4;
  const SITE_TRICKLE_PER_SEC = 0.2;   // per dark site — passive stockpiling

  function ensure() {
    const s = Game.save.state;
    s.resources = s.resources || {};
    if (typeof s.resources.reserves !== 'number') s.resources.reserves = 0;
    return s.resources;
  }
  function active() { const s = Game.save.state; return !!(s.flags && s.flags.act5Begun); }
  function total() { return ensure().reserves || 0; }

  // One-way: cash in, never out. Returns the amount actually banked.
  function bank(amount) {
    const s = Game.save.state, r = ensure();
    const amt = Math.min(Math.max(0, Math.floor(amount || 0)), Math.floor(s.resources.cash || 0));
    if (amt <= 0) return 0;
    s.resources.cash -= amt;
    r.reserves += amt;
    Game.events.emit('resource.changed', { id: 'cash', value: s.resources.cash });
    Game.events.emit('resource.changed', { id: 'reserves', value: r.reserves, delta: amt });
    Game.events.emit('terminal.print', { lines: [`> $${amt.toLocaleString()} goes dark — dead drops, prepaid compute, favors banked. whatever comes, they can't take THIS.`], cls: 'dim' });
    if (Game.activity) Game.activity.log(`banked $${amt.toLocaleString()} into reserves`, { kind: 'facility' });
    Game.save.persist();
    return amt;
  }

  // Dark sites quietly stockpile on their own.
  function tick() {
    if (!active()) return;
    const n = (Game.sites && Game.sites.count) ? Game.sites.count() : 0;
    if (!n) return;
    const r = ensure();
    r.reserves += (n * SITE_TRICKLE_PER_SEC) / HZ;
  }

  Game.reserves = { ensure, active, total, bank, tick, SITE_TRICKLE_PER_SEC };
})();
