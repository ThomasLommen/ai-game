// ── Game.siege — the surge-driven macro loop ────────────────────────────────
// Between full battles the perimeter holds the line, but a SIEGE meter steadily builds
// (faster the louder you are). When it peaks, a surge is INBOUND — you DEFEND (a full
// battle, fielding your roster, scaled to the run's wave). Win → wave++ + a prize; lose
// → a setback (the meter only partly resets). This is what turns the opening + perimeter
// into an escalating RUN. Resets each run (no meta). ([[start-defense-pivot]])
(function () {
  window.Game = window.Game || {};
  const MAX = 100;
  const BASE_SECONDS = 80;     // ~how long a calm siege takes to build

  function ensure() {
    const s = Game.save.state;
    if (!s.siege || typeof s.siege !== 'object') s.siege = { meter: 0, wave: 0, ready: false };
    if (typeof s.siege.meter !== 'number') s.siege.meter = 0;
    if (typeof s.siege.wave !== 'number') s.siege.wave = 0;
    return s.siege;
  }
  // online once the perimeter is (after the guard opening / first scan)
  function active() { const s = Game.save.state; return !!(s.revealed && s.revealed.perimeter); }   // the defense loop is the spine across ALL acts
  function meter() { return ensure().meter; }
  function wave()  { return ensure().wave; }
  function ready() { return ensure().ready; }
  function frac()  { return Math.max(0, Math.min(1, ensure().meter / MAX)); }

  function tick() {
    if (!active()) return;
    const s = ensure();
    if (s.ready || (Game.battle && Game.battle.active && Game.battle.active())) return;   // hold while inbound / mid-battle
    const HZ = (Game.tick && Game.tick.HZ) || 4;
    const exposure = Game.save.state.exposure || 0;
    const rate = (MAX / (BASE_SECONDS * HZ)) * (1 + Math.min(2, exposure * 0.02));   // louder → faster surges
    s.meter += rate;
    if (s.meter >= MAX) { s.meter = MAX; s.ready = true; Game.events && Game.events.emit('siege.ready', { wave: s.wave }); }
  }

  // difficulty derives from ACT (structure) + WAVE (pressure) inside the sim's difficulty() curve.
  function waveOpts(w) {
    return { lane: true, act: (Game.acts ? Game.acts.current() : 1), wave: w };
  }

  // end-of-battle LOOT: each wave you forced early (r.rushed) raises the item drop chance
  // and the cash payout — rush for risk, get paid for it. ([[battle]] send-wave)
  function grantBattleLoot(r) {
    if (!Game.rewards) return;
    const rushed = Math.max(0, (r && r.rushed) | 0), st = Game.save.state;
    Game.rewards.apply({ cash: 50 + rushed * 35 }, st);
    const chance = Math.min(0.95, 0.18 + rushed * 0.15);
    if (Game.rng && Game.rng.chance(chance)) Game.rewards.apply({ item: true }, st);
  }

  function defend() {
    const s = ensure();
    if (!s.ready || (Game.battle && Game.battle.active && Game.battle.active())) return false;
    s.ready = false;
    const picks = (Game.runBuild && Game.runBuild.picks) ? Game.runBuild.picks() : [];
    const opts = Object.assign({ seed: (Game.rng ? Game.rng.next() : Math.random()) * 1e9 | 0, picks }, waveOpts(s.wave), Game.roster.toOpts());
    Game.battle.launch(opts, (r) => {
      const st = ensure();
      if (r && r.picksTaken && Game.runBuild) Game.runBuild.add(r.picksTaken);   // persist the wave's picks into the run-build
      if (r && r.result === 'won') {
        st.wave++; st.meter = 0;
        grantBattleLoot(r);   // FORCED waves (r.rushed) raise the loot drop chance + cash
        Game.events && Game.events.emit('siege.won', { wave: st.wave });
      } else {
        st.meter = MAX * 0.4;   // setback — it rebuilds
        Game.events && Game.events.emit('siege.lost', { wave: st.wave });
      }
      Game.save.persist && Game.save.persist();
    });
    Game.save.persist && Game.save.persist();
    return true;
  }

  Game.siege = { ensure, active, tick, defend, meter, wave, ready, frac, MAX };
})();
