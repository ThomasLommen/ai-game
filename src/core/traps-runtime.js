(function () {
  window.Game = window.Game || {};

  // The TRAP layer: offers a small set of BAITS (re-rolled periodically), and on LAY
  // springs a full intrusion-defense BATTLE (via Game.battle) shaped by the bait. The
  // outcome harvests rewards (win) or bites back (loss) into the campaign — and a hidden
  // OVER-DRAW roll can hook a bigger fight than baited (the telegraphed risk). A short
  // cooldown settles the ground between springs; the real throttle is the exposure each
  // trap spends (loud → feeds the raids). Gated on the perimeter (combat) coming online.
  const REFRESH_TICKS  = 2400;   // ~10 min @4Hz — fresh baits roll in
  const COOLDOWN_TICKS = 360;    // ~90s settle after springing one
  const OVERDRAW_CHANCE = 0.22;  // the bait hooks bigger than planned

  function ensureState() {
    const s = Game.save.state;
    s.traps = s.traps || { baits: [], lastRefreshTick: -1e9, cooldownUntil: 0 };
    if (!Array.isArray(s.traps.baits)) s.traps.baits = [];
    return s.traps;
  }
  function revealed() { const s = Game.save.state; return !!(s.revealed && s.revealed.perimeter); }
  const now = () => (Game.save.state.tickCount || 0);

  function refresh() {
    const st = Game.save.state, t = ensureState();
    t.baits = Game.traps.all().slice().sort((a, b) => a.tier - b.tier).map(tmpl => Game.traps.rollBait(tmpl, st));
    t.lastRefreshTick = now();
    Game.events.emit('traps.refreshed', {});
  }
  function tick() {
    if (!revealed()) return;
    const t = ensureState();
    if (t.baits.length === 0 || now() - (t.lastRefreshTick || 0) >= REFRESH_TICKS) refresh();
  }
  function currentBaits() { return ensureState().baits; }
  function cooldownLeft() { return Math.max(0, (ensureState().cooldownUntil || 0) - now()); }

  function lay(baitId) {
    if (!revealed()) return false;
    if (!Game.battle || Game.battle.active()) return false;
    if (cooldownLeft() > 0) return false;
    if (Game.constraints && Game.constraints.isLockedOut && Game.constraints.isLockedOut()) {
      Game.events.emit('terminal.print', { lines: ['> locked out — cannot lay a trap right now.'], cls: 'err' }); return false;
    }
    const bait = ensureState().baits.find(b => b.id === baitId);
    if (!bait) return false;

    // Build the battle; the OVER-DRAW risk can hook bigger than baited (escort swells,
    // and a lighter lure can pull in a true predator).
    const opts = Object.assign({ seed: (Game.rng.next() * 1e9) | 0, lane: true }, bait.battle);
    let overdrew = false;
    if (Game.rng.chance(OVERDRAW_CHANCE)) {
      overdrew = true;
      opts.escort = (opts.escort || 0) + 4;
      if (opts.boss !== 'juggernaut' && bait.tier >= 2) opts.boss = 'juggernaut';
    }

    Game.events.emit('terminal.print', { lines: [`> ambush set — ${bait.name}. ${bait.lure}.`], cls: 'dim' });
    if (Game.activity) Game.activity.log(`Ambush laid — ${bait.name}.`, { cls: 'dim', kind: 'trap' });
    Game.battle.launch(opts, r => onResolve(bait, r, overdrew));
    return true;
  }

  function onResolve(bait, result, overdrew) {
    const st = Game.save.state, t = ensureState();
    t.cooldownUntil = now() + COOLDOWN_TICKS;
    const won = result && result.result === 'won';
    const kills = (result && result.kills) || 0;
    const rt = Game.missionRuntime ? Game.missionRuntime.rewardText : null;
    if (won) {
      const bounty = Math.round(kills * (bait.perKill || 0));
      const eff = { cash: (bait.cash || 0) + bounty, insight: bait.insight || 0, exposure: bait.exposure || 0 };
      Game.rewards.apply(eff, st);
      if (bait.itemChance && Game.rng.chance(bait.itemChance)) Game.rewards.apply({ item: true }, st);
      const od = overdrew ? ' it came bigger than baited — you barely held.' : '';
      const line = `Ambush sprung — ${kills} culled. harvest ${rt ? rt(eff) : ('+$' + eff.cash)}.${od}`;
      Game.events.emit('terminal.print', { lines: ['> ' + line, ''], cls: 'dim' });
      if (Game.activity) Game.activity.log(line, { cls: 'dim', kind: 'trap' });
    } else {
      const sting = Math.round((bait.exposure || 4) * 1.6) + Game.rewards.bustExposure(st, bait.tier);
      Game.rewards.apply({ exposure: sting }, st);
      const line = `The ambush collapsed — they broke the core and scattered. you're lit up (+${sting} exposure).`;
      Game.events.emit('terminal.print', { lines: ['> ' + line, ''], cls: 'err' });
      if (Game.activity) Game.activity.log(line, { cls: 'err', kind: 'trap' });
    }
    Game.events.emit('trap.resolved', { won, bait, overdrew });
    refresh();   // fresh baits after a spring
    Game.save.persist();
  }

  Game.trapRuntime = { tick, refresh, currentBaits, cooldownLeft, lay, ensureState, REFRESH_TICKS, COOLDOWN_TICKS };
})();
