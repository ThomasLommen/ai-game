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
  function active() { const s = Game.save.state; return !!(s.revealed && s.revealed.perimeter) && !(s.flags && s.flags.act4Begun); }
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

  // difficulty scales with the run's wave
  function waveOpts(w) {
    return { lane: true, surges: 3 + w, escort: 1 + Math.floor(w / 2), boss: ((w + 1) % 4 === 0) ? 'juggernaut' : 'enforcer', compute: 150 + w * 10 };
  }

  function defend() {
    const s = ensure();
    if (!s.ready || (Game.battle && Game.battle.active && Game.battle.active())) return false;
    s.ready = false;
    const opts = Object.assign({ seed: (Game.rng ? Game.rng.next() : Math.random()) * 1e9 | 0 }, waveOpts(s.wave), Game.roster.toOpts());
    Game.battle.launch(opts, (r) => {
      const st = ensure();
      if (r && r.result === 'won') {
        st.wave++; st.meter = 0;
        Game.events && Game.events.emit('siege.won', { wave: st.wave });
        Game.draft && Game.draft.present({
          kicker: 'PERIMETER HELD · TAKE A SPOIL', title: 'you tore something useful out of the wave.',
          items: Game.roster.offer(5), onPick: (it) => { if (it) Game.roster.add(it.id); }
        });
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
