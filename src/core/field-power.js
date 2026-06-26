// ── Game.fieldPower — the standalone difficulty-tracking ledger ──────────────
// The SMOOTHED power you've been fielding in battles → scales the next fight's enemy
// COUNT (the sim's powerFactor). It LAGS ~2 fights, so a fresh build spike isn't matched
// until a battle or two later — you feel the jump before the enemy answers it.
//
// This used to live inside s.siege (the auto-siege loop). With that loop retired and the
// darknet (traps/missions/raids) now the day-to-day combat, the power-memory needs an
// act-agnostic home every battle SOURCE can read + feed. That's this: a tiny ledger keyed
// on s.fieldPower (NOT s.power — that's the hardware BREAKER, constraints.js).
// Migrates the old s.siege.laggedPower forward so live saves keep their difficulty.
// ([[difficulty-scaling-design]], [[start-defense-pivot]])
(function () {
  window.Game = window.Game || {};

  function ensure() {
    const s = Game.save.state;
    if (!s.fieldPower || typeof s.fieldPower.lagged !== 'number') {
      // migrate from the retired siege loop's home, if present (pre-perimeter-retire saves)
      const legacy = (s.siege && typeof s.siege.laggedPower === 'number') ? s.siege.laggedPower : 0;
      const keep = (s.fieldPower && typeof s.fieldPower.lagged === 'number') ? s.fieldPower.lagged : legacy;
      s.fieldPower = { lagged: keep };
    }
    return s.fieldPower;
  }

  function get() { return ensure().lagged; }

  // Feed the power you just FIELDED in a battle — eases toward it (catch-up over ~2 fights).
  // Every battle source calls this on resolve so difficulty stays coherent across the darknet.
  function feed(power) {
    if (typeof power !== 'number' || !isFinite(power)) return;
    const fp = ensure();
    const lag = (window.SWARM && SWARM.BAL && typeof SWARM.BAL.powerLag === 'number') ? SWARM.BAL.powerLag : 0.5;
    fp.lagged += (power - fp.lagged) * lag;
    Game.save.persist && Game.save.persist();
  }

  Game.fieldPower = { ensure, get, feed };
})();
