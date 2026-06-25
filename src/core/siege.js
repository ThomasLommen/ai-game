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

  // OVERRUN: how much stalling past a FULL siege escalates the next DEFEND. +1 wave of
  // pressure per OVERRUN_SECS overdue — UNCAPPED: a rising tide that just keeps growing, so
  // stalling forever eventually guarantees you're overrun. No auto-launch (you still choose).
  const OVERRUN_SECS = 15;
  function overrunWaves() { const HZ = (Game.tick && Game.tick.HZ) || 4; return Math.floor((ensure().overdue || 0) / (OVERRUN_SECS * HZ)); }

  function tick() {
    if (!active()) return;
    const s = ensure();
    if (Game.battle && Game.battle.active && Game.battle.active()) return;   // hold mid-battle
    if (s.ready) {
      // STALLING past a full siege has teeth now: the longer you wait, the harder the next
      // DEFEND (overrunWaves), and the massing force PRESSES the line — the perimeter NET
      // bleeds, so you can't farm it forever. No auto-launch; the choice stays yours.
      s.overdue = (s.overdue || 0) + 1;
      const p = Game.save.state.perimeter;
      if (p && p.net > -40) p.net = Math.max(-40, p.net - 0.05);
      return;
    }
    if (s.overdue) s.overdue = 0;   // defensive: OVERRUN only exists while the siege is FULL — never let it linger once it's building again
    const HZ = (Game.tick && Game.tick.HZ) || 4;
    const exposure = Game.save.state.exposure || 0;
    const feed = (Game.subroutines && Game.subroutines.feed) ? Game.subroutines.feed() : null;
    const slow = feed ? (1 - (feed.siegeSlow || 0)) : 1;   // load-balancer subroutine eases the siege
    // PERIMETER STAKES: a NEGATIVE net (more leaks than kills — a porous perimeter) accelerates
    // the siege; positive net does not slow it (net+ pays out as loot instead). One signed knob.
    const net = (Game.save.state.perimeter && Game.save.state.perimeter.net) || 0;
    const leakPush = net < 0 ? 1 + Math.min(1.2, -net * 0.03) : 1;   // net −40 → +120% cap
    const rate = (MAX / (BASE_SECONDS * HZ)) * (1 + Math.min(2, exposure * 0.02)) * slow * leakPush;   // louder / leakier → faster surges
    s.meter += rate;
    if (s.meter >= MAX) { s.meter = MAX; s.ready = true; Game.events && Game.events.emit('siege.ready', { wave: s.wave }); }
  }

  // difficulty derives from ACT (structure) + WAVE (pressure) inside the sim's difficulty() curve.
  function waveOpts(w) {
    return { lane: true, act: (Game.acts ? Game.acts.current() : 1), wave: w + overrunWaves() };   // stalling stacks OVERRUN pressure onto the fight
  }

  // end-of-battle LOOT: each wave you forced early (r.rushed) raises the item drop chance
  // and the cash payout — rush for risk, get paid for it. ([[battle]] send-wave)
  function grantBattleLoot(r, periNet) {
    if (!Game.rewards) return;
    const rushed = Math.max(0, (r && r.rushed) | 0), st = Game.save.state;
    const feed = (Game.subroutines && Game.subroutines.feed) ? Game.subroutines.feed() : null;
    const lootBonus = feed ? (feed.loot || 0) : 0;   // salvage-routines subroutine sweetens every drop
    // PERIMETER STAKES: a POSITIVE net (kills beat leaks — a roster that held the line)
    // banks into the loot, riding the same credit as forced waves (r.rushed). Uses the
    // net SNAPSHOT taken at battle launch (the calm BEFORE this fight), not the live value.
    const net = periNet != null ? periNet : ((st.perimeter && st.perimeter.net) || 0);
    const pcred = Math.max(0, Math.min(60, net)) / 14;   // ~a full clean calm (~50 net) ≈ +3.5 credit
    const credit = rushed + pcred;
    const cash = Math.round((50 + credit * 35) * (1 + lootBonus));
    Game.rewards.apply({ cash }, st);
    const chance = Math.min(0.95, 0.18 + credit * 0.15 + lootBonus);
    let item = null;
    if (Game.rng && Game.rng.chance(chance)) { const res = Game.rewards.apply({ item: true }, st); item = res && res.item; }
    return { cash, item, net: Math.round(net), rushed };
  }

  // The end-of-battle SPOILS pop-up — shows exactly what the win paid out, then hands off
  // to the make-or-break calm pick. Reuses the paused draft overlay as a result screen.
  function showSpoils(spoils, wave, onClose) {
    if (!Game.draft || !Game.draft.info) { if (onClose) onClose(); return; }
    const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const lines = [`<span class="spoil-k">+ $${spoils.cash}</span> <span class="spoil-d">salvage</span>`];
    if (spoils.item) lines.push(`<span class="spoil-k">◈ ${esc(spoils.item.name)}</span> <span class="spoil-d">${esc(spoils.item.slot || 'part')} recovered</span>`);
    else lines.push(`<span class="spoil-d">no hardware recovered this time</span>`);
    if (spoils.rushed > 0) lines.push(`<span class="spoil-d">+${spoils.rushed} forced wave${spoils.rushed > 1 ? 's' : ''} · richer haul</span>`);
    if (spoils.net > 0) lines.push(`<span class="spoil-d">perimeter held (NET +${spoils.net}) · loot boosted</span>`);
    Game.draft.info({ kicker: 'WAVE ' + wave + ' REPELLED', title: 'spoils', lines, onClose });
  }

  // ── CALM PICK DRAFT ─────────────────────────────────────────────────────────
  // Every DEFEND win opens a deliberate 1-of-3 make-or-break PICK in the calm (on top
  // of loot), additive to the in-battle per-surge picks. Same rule-rewrite deck, drawn
  // campaign-side from the sim's catalog (SWARM.PICKS/SIGNATURES — already loaded for the
  // perimeter), excluding picks you already hold. Stacks into Game.runBuild (no meta).
  function calmDraft() {
    const SW = window.SWARM;
    if (!SW || !SW.PICKS || !Game.draft || !Game.runBuild) return;
    const rng = () => (Game.rng ? Game.rng.next() : Math.random());
    const held = Game.runBuild.picks();
    const count = id => held.filter(x => x === id).length;
    // everyday pool: commons + solid rewrites still under their cap (marquees are the rare slot)
    const pool = SW.PICKS.filter(p => p.tier !== 'marquee' && count(p.id) < (p.max || 99));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    const hand = pool.slice(0, 3);
    if (!hand.length) return;
    // ONE special slot: a roster SIGNATURE (more likely), else sometimes a rare MARQUEE — mirrors offerPick
    const roster = new Set(((Game.roster && Game.roster.units) ? Game.roster.units() : []).concat((Game.roster && Game.roster.exotics) ? Game.roster.exotics() : []));
    const SIGS = SW.SIGNATURES || {};
    const sigs = Object.keys(SIGS).filter(k => roster.has(k)).map(k => SIGS[k]).filter(sg => count(sg.id) < 1);
    const marquees = SW.PICKS.filter(p => p.tier === 'marquee' && count(p.id) < (p.max || 1));
    const r = rng();
    if (sigs.length && r < 0.5) hand[Math.floor(rng() * hand.length)] = sigs[Math.floor(rng() * sigs.length)];
    else if (marquees.length && r < 0.78) hand[Math.floor(rng() * hand.length)] = marquees[Math.floor(rng() * marquees.length)];
    Game.draft.present({
      kicker: 'BETWEEN-BATTLE PICK',
      title: 'reshape your build',
      items: hand.map(p => ({ id: p.id, name: p.name, desc: p.cost ? (p.desc + ' — cost: ' + p.cost) : p.desc, kind: (p.tier === 'marquee' || p.kind === 'sig') ? 'exotic' : 'unit' })),
      onPick: (it) => {
        if (it && it.id) Game.runBuild.add([it.id]);
        if (Game.subroutines && Game.subroutines.openNextDraft) setTimeout(() => Game.subroutines.openNextDraft(), 360);   // chain any owed milestone draft
      }
    });
  }

  function defend() {
    const s = ensure();
    if (!s.ready || (Game.battle && Game.battle.active && Game.battle.active())) return false;
    const picks = (Game.runBuild && Game.runBuild.picks) ? Game.runBuild.picks() : [];
    // BUILD the fight FIRST (waveOpts bakes in overrunWaves() while overdue is still high — so a
    // stalled siege genuinely launches a harder wave), THEN clear the stall.
    const opts = Object.assign({ seed: (Game.rng ? Game.rng.next() : Math.random()) * 1e9 | 0, picks }, waveOpts(s.wave), Game.roster.toOpts());
    const periNet = (Game.save.state.perimeter && Game.save.state.perimeter.net) || 0;   // snapshot the calm BEFORE this fight → feeds the loot
    s.ready = false; s.overdue = 0;   // clear the OVERRUN stall now that the fight's locked in
    Game.battle.launch(opts, (r) => {
      const st = ensure();
      if (r && r.picksTaken && Game.runBuild) Game.runBuild.add(r.picksTaken);   // persist the wave's picks into the run-build
      if (r && r.result === 'won') {
        st.wave++; st.meter = 0;
        const spoils = grantBattleLoot(r, periNet);   // FORCED waves + the pre-battle perimeter NET raise the loot drop chance + cash
        Game.events && Game.events.emit('siege.won', { wave: st.wave });
        showSpoils(spoils, st.wave, () => calmDraft());   // SHOW what you got, then the make-or-break PICK
      } else {
        st.meter = MAX * 0.4;   // setback — it rebuilds
        Game.events && Game.events.emit('siege.lost', { wave: st.wave });
      }
      Game.save.persist && Game.save.persist();
    });
    Game.save.persist && Game.save.persist();
    return true;
  }

  Game.siege = { ensure, active, tick, defend, meter, wave, ready, frac, MAX, grantBattleLoot, overrunWaves, _calmDraft: calmDraft };

  // The perimeter NET scoreboard resets after EVERY battle (siege loot already snapshotted
  // the pre-battle value at launch). Global so it covers trap/event battles too, not just
  // the siege DEFEND. battle.ended fires once the player returns from the fight.
  if (Game.events) Game.events.on('battle.ended', () => { const p = Game.save.state && Game.save.state.perimeter; if (p) p.net = 0; });
})();
