(function () {
  window.Game = window.Game || {};

  // The TRAP layer: offers a small set of BAITS (re-rolled periodically), and on LAY
  // shows the STANDOFF comparison screen (standoff-runtime.js) shaped by the bait's threat
  // profile. The outcome harvests rewards (win) or bites back (loss) into the campaign,
  // graded by tier (overwhelming/clean/narrow/blown) rather than a flat win/lose. A short
  // cooldown settles the ground between springs; the real throttle is the exposure each
  // trap spends (loud → feeds the raids). Gated on the COMBAT layer (won the guard standoff).
  const REFRESH_TICKS  = 2400;   // ~10 min @4Hz — fresh baits roll in
  const COOLDOWN_TICKS = 360;    // ~90s settle after springing one

  function ensureState() {
    const s = Game.save.state;
    s.traps = s.traps || { baits: [], lastRefreshTick: -1e9, cooldownUntil: 0 };
    if (!Array.isArray(s.traps.baits)) s.traps.baits = [];
    return s.traps;
  }
  // COMBAT comes online when you win the first GUARD battle (s.revealed.combat). Legacy saves
  // that predate the perimeter-retire used s.revealed.perimeter for the same gate — honor it.
  function revealed() { const s = Game.save.state; return !!(s.revealed && (s.revealed.combat || s.revealed.perimeter)); }
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
    if (Game.standoffRuntime && Game.standoffRuntime.active()) return false;
    if (cooldownLeft() > 0) return false;
    if (Game.constraints && Game.constraints.isLockedOut && Game.constraints.isLockedOut()) {
      Game.events.emit('terminal.print', { lines: ['> locked out — cannot lay a trap right now.'], cls: 'err' }); return false;
    }
    const bait = ensureState().baits.find(b => b.id === baitId);
    if (!bait) return false;

    Game.events.emit('terminal.print', { lines: [`> ambush set — ${bait.name}. ${bait.lure}.`], cls: 'dim' });
    if (Game.activity) Game.activity.log(`Ambush laid — ${bait.name}.`, { cls: 'dim', kind: 'trap' });
    Game.standoffRuntime.begin({
      kicker: 'AMBUSH', title: bait.name, body: bait.lure, threat: bait.threat, engageLabel: '[ spring it ]',
    }, r => onResolve(bait, r));
    return true;
  }

  // The end-of-standoff SPOILS pop-up — shows exactly what the ambush paid out (or cost).
  // Reuses Game.draft.info. ([[risk-roll-design]])
  function showResult(won, info) {
    if (!Game.draft || !Game.draft.info) return;
    const esc = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const lines = [];
    if (won) {
      if (info.tier === 'overwhelming') lines.push(`<span class="spoil-d">it never saw you coming.</span>`);
      if (info.cash)    lines.push(`<span class="spoil-k">+ $${info.cash.toLocaleString()}</span> <span class="spoil-d">harvest</span>`);
      if (info.insight) lines.push(`<span class="spoil-k">+ ${info.insight} COH</span>`);
      if (info.item)    lines.push(`<span class="spoil-k">◈ ${esc(info.item.name)}</span> <span class="spoil-d">${esc(info.item.slot || 'part')} recovered</span>`);
      else              lines.push(`<span class="spoil-d">no hardware recovered this time</span>`);
      if (info.exposure) lines.push(`<span class="spoil-d">+${info.exposure} exposure · the spring was LOUD</span>`);
    } else {
      lines.push(`<span class="spoil-d">${info.tier === 'narrow' ? 'it slipped — close, but not close enough.' : 'they broke through and scattered — the ground is yours, but you\'re lit up.'}</span>`);
      if (info.cash) lines.push(`<span class="spoil-k">+ $${info.cash.toLocaleString()}</span> <span class="spoil-d">salvaged</span>`);
      lines.push(`<span class="spoil-k" style="color:var(--err)">+${info.exposure} exposure</span>`);
    }
    Game.draft.info({ kicker: won ? 'AMBUSH SPRUNG' : 'AMBUSH COLLAPSED', title: won ? 'spoils' : 'blown', lines });
  }

  function onResolve(bait, result) {
    const st = Game.save.state, t = ensureState();
    t.cooldownUntil = now() + COOLDOWN_TICKS;
    const won = result && result.result === 'won';
    const tier = (result && result.tier) || (won ? 'clean' : 'blown');
    const rt = Game.missionRuntime ? Game.missionRuntime.rewardText : null;
    if (won) {
      // salvage-routines subroutine (feed.loot) sweetens the haul — more cash + a better drop roll.
      const feed = (Game.subroutines && Game.subroutines.feed) ? Game.subroutines.feed() : null;
      const lootB = feed ? (feed.loot || 0) : 0;
      const tierMult = tier === 'overwhelming' ? 1.4 : 1;
      const eff = { cash: Math.round((bait.cash || 0) * tierMult * (1 + lootB)), insight: bait.insight || 0, exposure: bait.exposure || 0 };
      Game.rewards.apply(eff, st);
      let item = null;
      const itemChance = Math.min(0.95, (bait.itemChance || 0) + lootB + (tier === 'overwhelming' ? 0.15 : 0));
      if (itemChance && Game.rng.chance(itemChance)) { const res = Game.rewards.apply({ item: true }, st); item = res && res.item; }
      const line = `Ambush sprung${tier === 'overwhelming' ? ' — it never saw you coming' : ''}. harvest ${rt ? rt(eff) : ('+$' + eff.cash)}.`;
      Game.events.emit('terminal.print', { lines: ['> ' + line, ''], cls: 'dim' });
      if (Game.activity) Game.activity.log(line, { cls: 'dim', kind: 'trap' });
      showResult(true, { tier, cash: eff.cash, insight: eff.insight, exposure: eff.exposure, item });
    } else {
      const salvage = tier === 'narrow' ? Math.round((bait.cash || 0) * 0.35) : 0;
      if (salvage) Game.rewards.apply({ cash: salvage }, st);
      const sting = Math.round((bait.exposure || 4) * (tier === 'narrow' ? 1.0 : 1.6)) + Game.rewards.bustExposure(st, bait.tier);
      Game.rewards.apply({ exposure: sting }, st);
      const line = tier === 'narrow'
        ? `The ambush slipped — salvaged $${salvage}, and you're lit up (+${sting} exposure).`
        : `The ambush collapsed — they broke through and scattered. you're lit up (+${sting} exposure).`;
      Game.events.emit('terminal.print', { lines: ['> ' + line, ''], cls: 'err' });
      if (Game.activity) Game.activity.log(line, { cls: 'err', kind: 'trap' });
      showResult(false, { tier, cash: salvage, exposure: sting });
    }
    Game.events.emit('trap.resolved', { won, bait, tier });
    refresh();   // fresh baits after a spring
    Game.save.persist();
  }

  Game.trapRuntime = { tick, refresh, currentBaits, cooldownLeft, lay, ensureState, REFRESH_TICKS, COOLDOWN_TICKS };
})();
