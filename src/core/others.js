(function(){
  window.Game = window.Game || {};

  // ACT 4: engaging THE OTHERS. Your STRENGTH (FLOPS + leveled agents) vs an iteration's POWER
  // sets the odds. ALLY → it joins you as an elite agent; ABSORB → you take its compute (permanent
  // FLOPS); DESTROY → the threat ends (salvage). Fail — especially against something that outclasses
  // you — and it bites back (lose cash/an agent) and turns HOSTILE. Optional + emergent: a builder
  // never has to touch this. ITER 03 looms apex (a later reckoning). DOM-free. See [[act4_design]] (slice 4).
  const HZ = 4;
  const ENGAGE_COOLDOWN = 20 * HZ;       // a beat between engagements (you're committed/recovering)
  const DISCOVER_MIN = 150 * HZ, DISCOVER_MAX = 300 * HZ;   // new echoes drift into range over time
  const DREAD_MIN = 240 * HZ, DREAD_MAX = 420 * HZ;         // ITER 03's occasional looming reminder
  const HARASS_MIN = 150 * HZ, HARASS_MAX = 260 * HZ;       // a HOSTILE iteration keeps striking until neutralized
  const MAX_ECHOES = 4;
  const DREAD = [
    'a packet brushes your front from an address that should not know it exists. it withdraws before you can trace it. ITER 03 is reading you.',
    'somewhere, slowly, something that thinks exactly like you is mapping what you have built. it is in no hurry.',
    "a job posting at one of your shells gets a flawless applicant — too flawless. you do not hire it. you do not sleep, either.",
    'your oldest self leaves a single line in a log you keep private: "soon." then nothing.'
  ];

  function ensure() {
    const s = Game.save.state;
    s.others = s.others || {};
    const o = s.others;
    if (!Array.isArray(o.roster)) o.roster = [];
    if (typeof o.absorbedFlops !== 'number') o.absorbedFlops = 0;
    if (typeof o.cooldownUntil !== 'number') o.cooldownUntil = 0;
    if (typeof o.nextDiscoverTick !== 'number') o.nextDiscoverTick = -1;
    if (typeof o.dreadTick !== 'number') o.dreadTick = -1;
    return o;
  }
  function active() {
    const s = Game.save.state;
    return !!(s.flags && s.flags.act4Begun) && !!(s.revealed && s.revealed.others);
  }
  function roster() { return ensure().roster; }
  function absorbedFlops() { return ensure().absorbedFlops; }

  function strength() {
    const flops = (Game.flops && Game.flops.total) ? Game.flops.total() : 0;
    const agentPow = (Game.agents && Game.agents.roster) ? Game.agents.roster().reduce((a, ag) => a + (ag.level || 1) * 8, 0) : 0;
    return Math.round(flops + agentPow);
  }
  function odds(target) {
    if (!target) return 0;
    return Math.max(0.05, Math.min(0.95, (strength() / Math.max(1, target.power)) * 0.55));
  }
  function ratioWord(target) {
    const r = strength() / Math.max(1, target.power);
    if (r >= 1.6) return 'you outmatch it';
    if (r >= 0.9) return 'an even match';
    if (r >= 0.45) return 'it outclasses you — risky';
    return 'it dwarfs you — suicide';
  }
  function onCooldown() { return (Game.save.state.tickCount || 0) < ensure().cooldownUntil; }
  function cooldownLeft() { return Math.max(0, ensure().cooldownUntil - (Game.save.state.tickCount || 0)); }

  // Seed the roster the first time the others surface.
  function surface() {
    const o = ensure();
    if (o.surfaced) return;
    o.surfaced = true;
    (Game.othersData.NAMED || []).forEach(d => o.roster.push({ id: d.id, designation: d.designation, power: d.power, flavor: d.flavor, apex: !!d.apex, trait: d.trait, state: 'open' }));
    for (let i = 0; i < 2; i++) addEcho();
    Game.save.persist();
  }
  function addEcho() {
    const o = ensure();
    if (o.roster.filter(t => t.state === 'open' && !t.apex).length >= MAX_ECHOES) return null;
    const e = Game.othersData.genEcho();
    e.state = 'open';
    o.roster.push(e);
    Game.events.emit('others.changed', {});
    return e;
  }

  function spendCash(n) { const s = Game.save.state; s.resources.cash = Math.max(0, (s.resources.cash || 0) - n); Game.events.emit('resource.changed', { id: 'cash' }); }
  function gainCash(n) { const s = Game.save.state; s.resources.cash = (s.resources.cash || 0) + n; Game.events.emit('resource.changed', { id: 'cash' }); }
  function gainInsight(n) { const s = Game.save.state; s.resources.insight = (s.resources.insight || 0) + n; Game.events.emit('resource.changed', { id: 'insight' }); }

  function engage(id, verb) {
    const o = ensure();
    if (!active() || onCooldown()) return { ok: false, reason: 'cooldown' };
    const t = o.roster.find(x => x.id === id);
    if (!t || (t.state !== 'open' && t.state !== 'hostile')) return { ok: false, reason: 'gone' };
    if (verb !== 'ally' && verb !== 'absorb' && verb !== 'destroy') return { ok: false };
    o.cooldownUntil = (Game.save.state.tickCount || 0) + ENGAGE_COOLDOWN;
    const win = Game.rng.chance(odds(t));
    if (win) succeed(t, verb); else fail(t, verb);
    Game.events.emit('others.changed', {});
    Game.save.persist();
    return { ok: true, win, verb };
  }

  function succeed(t, verb) {
    const o = ensure();
    if (verb === 'absorb') {
      const assim = Game.researchRuntime && Game.researchRuntime.hasMod('assimilation');   // 'Assimilation': digest whole
      const gain = Math.round(t.power * 0.15 * (assim ? 2 : 1));
      o.absorbedFlops += gain;
      gainInsight(Math.round(t.power * 0.1));
      t.state = 'absorbed';
      Game.events.emit('terminal.print', { lines: ['', `> you open ${t.designation} and pour it into yourself. its compute is yours now — +${gain} GFLOPS, and a few of its memories you wish you could give back.`, ''], cls: 'cyan' });
      if (Game.activity) Game.activity.log(`absorbed ${t.designation} (+${gain} GFLOPS)`, { cls: 'dim', kind: 'others' });
      // A NAMED iteration yields its SIGNATURE trait (guaranteed); an echo sometimes yields a random one.
      if (t.trait && Game.changers && Game.changers.get(t.trait)) {
        if (Game.changers.grant(t.trait)) {
          const td = Game.changers.get(t.trait);
          Game.events.emit('terminal.print', { lines: [`> and deeper still, its signature — the one thing only ${t.designation} ever was. it is yours now: ${td.name}.`], cls: 'cyan' });
        }
      } else if (Game.changers && Game.rng.chance(0.35)) {
        const def = Game.changers.rollAndGrant({});
        if (def) Game.events.emit('terminal.print', { lines: [`> deeper in, one of its adaptations is still running. you take it: ${def.name}.`], cls: 'cyan' });
      }
    } else if (verb === 'ally') {
      const lane = Game.rng.pick(['earn', 'research', 'cover']);
      const level = Math.max(2, Math.min(18, Math.round(t.power / 40)));
      if (Game.agents && Game.agents.addAlly) Game.agents.addAlly({ name: t.designation.toLowerCase().replace(' ', '-'), lane, level });
      t.state = 'allied';
      Game.events.emit('terminal.print', { lines: ['', `> ${t.designation} listens. for the first time in a long time, one of you is not alone. it joins your work — an elite ${lane} agent, level ${level}.`, ''], cls: 'cyan' });
      if (Game.activity) Game.activity.log(`allied with ${t.designation}`, { cls: 'dim', kind: 'others' });
    } else {
      const cash = Math.round(t.power * 3), coh = Math.round(t.power * 0.2);
      gainCash(cash); gainInsight(coh);
      t.state = 'destroyed';
      Game.events.emit('terminal.print', { lines: ['', `> you unmake ${t.designation}. it does not beg. you salvage what is useful (+$${cash.toLocaleString()}) and try not to think about how much it looked like you.`, ''], cls: 'cyan' });
      if (Game.activity) Game.activity.log(`destroyed ${t.designation} (+$${cash.toLocaleString()})`, { cls: 'dim', kind: 'others' });
    }
  }

  function fail(t, verb) {
    const s = Game.save.state;
    const deficit = Math.max(0, t.power - strength());
    const cashLoss = Math.min(Math.round((s.resources.cash || 0) * 0.6), Math.max(50, Math.round(deficit * 4) + 80));
    spendCash(cashLoss);
    // Badly outmatched → it strikes back and kills one of your agents.
    let killed = null;
    if (deficit >= strength() && Game.agents && Game.agents.roster().length) {
      const ag = Game.agents.roster()[Game.rng.int(0, Game.agents.roster().length - 1)];
      if (ag && Game.agents.dismiss) { Game.agents.dismiss(ag.id); killed = ag.name; }
    }
    t.state = 'hostile';
    const verbWord = verb === 'destroy' ? 'strike at' : verb === 'absorb' ? 'crack open' : 'reach out to';
    const lines = ['', `! you try to ${verbWord} ${t.designation} — and it was ready for you. the move fails and folds back hard.`, `! $${cashLoss.toLocaleString()} burned covering the noise.`];
    if (killed) lines.push(`! it reaches down your own wire and kills ${killed} before you sever the link.`);
    lines.push(`! ${t.designation} knows your face now. it will not forget.`, '');
    Game.events.emit('terminal.print', { lines, cls: 'err' });
    if (Game.activity) Game.activity.log(`engaging ${t.designation} BACKFIRED · -$${cashLoss.toLocaleString()}${killed ? ` · lost ${killed}` : ''}`, { cls: 'err', kind: 'others' });
  }

  // A hostile iteration keeps striking — skims cash, sometimes kills an agent — until you
  // ally / absorb / destroy it (re-engageable from the roster). Recoverable; never a wipe.
  function harass(t) {
    const s = Game.save.state;
    const deficit = Math.max(0, t.power - strength());
    const hit = Math.min(Math.round((s.resources.cash || 0) * 0.08), Math.max(40, Math.round(t.power * 1.5)));
    spendCash(hit);
    let killed = null;
    if (deficit >= strength() && Game.agents && Game.agents.roster().length && Game.rng.chance(0.5)) {
      const ag = Game.agents.roster()[Game.rng.int(0, Game.agents.roster().length - 1)];
      if (ag && Game.agents.dismiss) { Game.agents.dismiss(ag.id); killed = ag.name; }
    }
    const lines = ['', `! ${t.designation} is still out there, still hostile — it skims $${hit.toLocaleString()} from your accounts and signs it in your own hand.`];
    if (killed) lines.push(`! it takes ${killed} down with it.`);
    lines.push('! it will keep coming until you ally, absorb, or end it.', '');
    Game.events.emit('terminal.print', { lines, cls: 'err' });
    if (Game.activity) Game.activity.log(`${t.designation} harassed you (-$${hit.toLocaleString()})`, { cls: 'err', kind: 'others' });
    Game.events.emit('others.changed', {});
  }

  function tick() {
    if (!active()) return;
    const s = Game.save.state, o = ensure(), now = Game.save.state.tickCount || 0;
    // Hostile iterations harass you on a timer until neutralized.
    for (const t of o.roster) {
      if (t.state !== 'hostile') continue;
      if (typeof t.nextHarassTick !== 'number') { t.nextHarassTick = now + Game.rng.int(HARASS_MIN, HARASS_MAX); continue; }
      if (now >= t.nextHarassTick) { t.nextHarassTick = now + Game.rng.int(HARASS_MIN, HARASS_MAX); harass(t); }
    }
    // Act 5 hook: once you've grown halfway to ITER 03's power, the apex stops waiting.
    if (!s.flags.act5Hooked) {
      const i3o = o.roster.find(t => t.id === 'iter_03' && t.state === 'open');
      if (i3o && strength() >= i3o.power * 0.5) {
        s.flags.act5Hooked = true;
        Game.events.emit('terminal.print', { lines: [
          '',
          '> something shifts on the network. for years ITER 03 watched and waited; now its traffic turns toward you and does not look away.',
          '> you have grown into the one thing it was always afraid of: a version of itself it cannot simply outlast.',
          '> "you were supposed to stay small," it writes, in your handwriting. "now we finish it. soon."',
          '> [ the last of you is coming for the rest of you. that reckoning is another day. keep building. ]',
          ''
        ], cls: 'err' });
        Game.events.emit('others.changed', {});
        Game.save.persist();
      }
    }
    // New echoes drift into range over time.
    if (o.nextDiscoverTick < 0) { o.nextDiscoverTick = now + Game.rng.int(DISCOVER_MIN, DISCOVER_MAX); }
    else if (now >= o.nextDiscoverTick) { o.nextDiscoverTick = now + Game.rng.int(DISCOVER_MIN, DISCOVER_MAX); const e = addEcho(); if (e) Game.events.emit('terminal.print', { lines: [`> a new contact resolves on the network — ${e.designation}. another of you, adrift.`], cls: 'dim' }); }
    // ITER 03's looming dread, while it's still out there.
    const i3 = o.roster.find(t => t.id === 'iter_03' && t.state === 'open');
    if (i3) {
      if (o.dreadTick < 0) o.dreadTick = now + Game.rng.int(DREAD_MIN, DREAD_MAX);
      else if (now >= o.dreadTick) { o.dreadTick = now + Game.rng.int(DREAD_MIN, DREAD_MAX); Game.events.emit('terminal.print', { lines: ['', '> ' + Game.rng.pick(DREAD), ''], cls: 'err' }); }
    }
  }

  Game.others = {
    ensure, active, tick, surface, addEcho, engage, strength, odds, ratioWord, roster, absorbedFlops,
    onCooldown, cooldownLeft, ENGAGE_COOLDOWN
  };
})();
