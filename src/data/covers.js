(function(){
  window.Game = window.Game || {};

  // ACT 4: COVER — the legitimate front you buy so you can acquire mainframes in the open.
  // An ordered ladder of one-time purchases; each adds LEGITIMACY (score) and raises your
  // legit TIER, which tech-gates which machine classes you can buy (a sole-prop can't be
  // seen wiring a datacenter). Legitimacy must stay ahead of your FOOTPRINT or audits crack
  // your cover (see legitimacy.js). Cash is the shared currency — every dollar on cover is a
  // dollar not on compute: the tug-of-war. DOM-free data. See [[act4_design]] (slice 2).
  const LADDER = [
    { id: 'sole_prop',  label: 'register a sole proprietorship', cost: 600,    legit: 12,  tier: 1 },
    { id: 'llc',        label: 'incorporate an LLC',             cost: 3500,   legit: 26,  tier: 1 },
    { id: 'accountant', label: 'retain a real accountant',       cost: 10000,  legit: 46,  tier: 2 },
    { id: 'payroll',    label: 'hire staff + run payroll',       cost: 28000,  legit: 72,  tier: 2 },
    { id: 'pr_firm',    label: 'engage a PR firm',               cost: 65000,  legit: 104, tier: 3 },
    { id: 'lobbyist',   label: 'put a lobbyist on retainer',     cost: 150000, legit: 150, tier: 3 }
  ];
  function get(id) { return LADDER.find(c => c.id === id) || null; }

  Game.covers = { LADDER, get };
})();
