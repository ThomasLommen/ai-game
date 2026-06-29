(function(){
  window.Game = window.Game || {};

  // ACT 4: COMPUTE BROKERAGE — the clean, legit FLOPS earner of THE FRONT. Commit a slice of
  // your TOTAL compute to LEASING it on the open market; the rest powers your agents + growth.
  // Leasing pays cash/sec scaled by LEGITIMACY (a trusted front leases its iron for more), so
  // it's the slow-but-compounding counterpart to the darknet's dirty-fast money. The allocation
  // is a FRACTION of total compute, so it auto-scales as you add (or lose) machines. The dial is
  // the strategic tension: every FLOP you lease is a FLOP your agents can't use. DOM-free core.
  // See [[act-reorder-front-hunt-design]] (#3 FRONT reworks).
  const HZ = 4;
  const CASH_PER_FLOP = 0.045;             // $/s per leased FLOP at baseline legitimacy
  const STEPS = [0, 0.25, 0.5, 0.75, 1];   // dial presets (fraction of total compute leased)

  function ensure() {
    const s = Game.save.state;
    s.brokerage = s.brokerage || {};
    if (typeof s.brokerage.alloc !== 'number') s.brokerage.alloc = 0;
    s.brokerage.alloc = Math.max(0, Math.min(1, s.brokerage.alloc));
    return s.brokerage;
  }
  // Live once the FRONT is online and there's compute to lease. Lives inside the AGENTS tab.
  function active() {
    const s = Game.save.state;
    return !!(s.flags && s.flags.act4Begun) && !!(Game.flops && Game.flops.total() > 0);
  }

  function alloc() { return ensure().alloc; }
  function totalFlops() { return (Game.flops && Game.flops.total) ? Game.flops.total() : 0; }
  function leasedFlops() { return totalFlops() * alloc(); }
  function freeFlops() { return totalFlops() * (1 - alloc()); }   // compute left for the agents

  // A trusted, legitimate front leases its compute for more: 0.5x at zero legitimacy, climbing
  // past 1x as you build cover. Clamped so leasing is always worth at least something.
  function legitMult() {
    const score = (Game.legit && Game.legit.score) ? Game.legit.score() : 0;
    return Math.max(0.5, 0.5 + score * 0.006);   // 0 legit → 0.5x · ~83 → 1x · 250 → 2x
  }
  function cashPerSec() { return leasedFlops() * CASH_PER_FLOP * legitMult(); }

  function setAlloc(f) {
    const b = ensure();
    const next = Math.max(0, Math.min(1, f));
    if (next === b.alloc) return;
    b.alloc = next;
    // Leasing steals FLOPS from the agents → their slot cap moves: re-render the whole tab.
    Game.events.emit('agents.changed', {});
    Game.save.persist();
  }

  function tick() {
    if (!active()) return;
    const cps = cashPerSec();
    if (cps <= 0) return;
    const s = Game.save.state;
    s.resources.cash = (s.resources.cash || 0) + cps / HZ;
    Game.events.emit('resource.changed', { id: 'cash' });
  }

  Game.brokerage = {
    ensure, active, alloc, setAlloc, totalFlops, leasedFlops, freeFlops, legitMult, cashPerSec, tick,
    STEPS, CASH_PER_FLOP
  };
})();
