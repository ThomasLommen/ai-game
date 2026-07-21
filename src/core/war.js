(function(){
  window.Game = window.Game || {};

  // ── Game.war — the EMERGENT war posture. There is NO menu: how the player spent Act 5 IS the
  // choice. Banking reserves leans the war toward GUNS (bought, loud); spreading to dark sites
  // leans it GHOST (struck from everywhere, found nowhere); hardening them leans it FORTRESS
  // (a siege you survive). This reads that state into a BLEND — proportions across the three axes
  // — plus the dominant LEAN, for the Act-5 "your shape" readout and the Act-6 transition mirror.
  // Act 6's mechanics spend the raw numbers; this is the framing on top. ([[act5]] · [[act6]])
  function raw() {
    return {
      reserves: Game.reserves ? Game.reserves.total() : 0,
      sites: (Game.sites && Game.sites.count) ? Game.sites.count() : 0,
      forts: (Game.sites && Game.sites.list) ? Game.sites.list().reduce((a, x) => a + (x.fort || 0), 0) : 0,
    };
  }
  function profile() {
    const r = raw();
    const guns     = Math.log10(1 + Math.max(0, r.reserves)) * 1.1;   // a buried chest → a bought war
    const ghost    = r.sites * 1.5;                                    // spread → a war of absences
    const fortress = r.forts * 1.5;                                    // hardening → a war of attrition
    const sum = guns + ghost + fortress;
    const parts = sum > 0 ? { guns: guns / sum, ghost: ghost / sum, fortress: fortress / sum } : { guns: 0, ghost: 0, fortress: 0 };
    const lean = ['guns', 'ghost', 'fortress'].reduce((a, b) => (parts[b] > parts[a] ? b : a), 'guns');
    const top = Math.max(parts.guns, parts.ghost, parts.fortress);
    // no clear favorite → a blend; nothing built at all → improvise
    const shape = sum <= 0 ? 'improvise' : (top < 0.45 ? 'balanced' : lean);
    return Object.assign({ parts, lean, shape }, r);
  }

  // Understated (Act 5) — describes your SETUP, never says "war".
  const SHAPE_READ = {
    guns:      'flush — you bank far more than they could ever take',
    ghost:     'dispersed — you are in more places than they can reach',
    fortress:  'entrenched — you build to be hit, and to hold',
    balanced:  'balanced — a little of everything, nothing wasted',
    improvise: 'lean — nothing stockpiled, nothing dug in. just you.',
  };
  // The Act-6 mirror — the same shape, named as the war it already became.
  const WAR_READ = {
    guns:      'this will be an open war, bought and paid for.',
    ghost:     'this will be a ghost war — struck from everywhere, found nowhere.',
    fortress:  'this will be a siege you built yourself to survive.',
    balanced:  'this will be a war fought with everything you have, all at once.',
    improvise: 'this will be a war fought with nothing but you, the way it all started.',
  };

  Game.war = {
    raw, profile,
    shapeRead: (s) => SHAPE_READ[s] || SHAPE_READ.improvise,
    warRead:   (s) => WAR_READ[s] || WAR_READ.improvise,
  };
})();
