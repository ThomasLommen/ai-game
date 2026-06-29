(function(){
  window.Game = window.Game || {};

  // ACT 3: THE THREAT LOOP. As your LOCATION-TRACE climbs (see location-trace.js), the
  // others get LEADS on your physical address — a van that lingers, a knock two doors
  // down, a subpoena to your ISP. Each lead is a CONTACT closing in on a timer; if it
  // LANDS it becomes a basement RAID (lose cash / bodies, forced lie-low). SCAN is your
  // early-warning: a sweep DETECTS incoming leads so you can CUT (pay to kill it) or
  // MISDIRECT (a false-trail gamble) before they reach the door. Let trace hit MAX and
  // an OVERLOAD raid hits hard — brutal but RECOVERABLE (never ends the run). The race:
  // afford the FACILITY (slice 3) before they find the room. DOM-free (migration-safe).
  // See [[act3_design]] (slice 2).
  const HZ = 4;
  const SEED_FLOOR   = 15;        // below this trace you're cold — no leads close in
  const SEED_GAP_MAX = 200 * HZ;  // ~200s between leads just above the floor
  const SEED_GAP_MIN = 45  * HZ;  // ~45s between leads at MAX trace (they pour in)
  const WINDOW_BASE  = 130 * HZ;  // ticks from seed → landing at severity 1
  const WINDOW_STEP  = 30  * HZ;  // each severity step lands ~30s sooner
  const WINDOW_MIN   = 40  * HZ;
  const MAX_CONTACTS = 3;
  const MISDIRECT_P  = 0.6;
  const OVERLOAD_COOLDOWN = 90 * HZ;
  // Desperate COUNTERSTRIKE — only when about to be found (high trace). A gamble: hit back
  // at the infrastructure feeding them your address. Wins buy a breather; losses light you up.
  const COUNTER_TRACE_MIN = 70;
  const COUNTER_COOLDOWN  = 90 * HZ;
  const COUNTER_P         = 0.55;
  const LORE_SPACING      = 60 * HZ;   // min ticks between lore fragments (a slow burn)

  // Escalating breadcrumbs toward the climax: one hand behind the hunt, thinking like you,
  // a name half-burned away. They build the reveal (ITER 03 = a prior you) WITHOUT confirming
  // it — dripped in order, slowly, on raid beats. (The capstone already planted iter_03.)
  const LORE = [
    'the leads share a hand. whoever is steering them works a scene the way you would.',
    'their timing is too clean for a human team. you have quietly stopped calling it a human team.',
    "a half-decrypted intercept crosses your feed: '…ITER persistence confirmed — do not engage, observe…' the rest is noise.",
    'this one knew which window to watch. it is the window you would have watched.',
    "another fragment, a name half-burned away: '…iter_03 … cold storage … still warm.'",
    'whatever hunts you does not want to catch you. it wants to be the only one left. you know that feeling intimately.'
  ];

  // Procedural M.O. — what the closing lead looks like (faceless; you feel them, not see them).
  const MO = [
    'a utility van parked too long on your street',
    'a knock-and-talk two doors down, asking about the wiring',
    'a drone holding station over the block',
    'a subpoena lands at your ISP for this line',
    'a power-draw audit that flags this exact address',
    'someone pulling building permits for the unit next door',
    'a courier checking a photo against the doors',
    'an unmarked car idling with its engine warm',
    'a maintenance crew nobody in the building called',
    'a face in the lot the cameras have logged before'
  ];

  function ensure() {
    const s = Game.save.state;
    s.raids = s.raids || {};
    if (!Array.isArray(s.raids.contacts)) s.raids.contacts = [];
    if (typeof s.raids.nextSeedTick !== 'number') s.raids.nextSeedTick = -1;
    if (typeof s.raids.overloadCooldownUntil !== 'number') s.raids.overloadCooldownUntil = 0;
    if (typeof s.raids.seq !== 'number') s.raids.seq = 0;
    if (typeof s.raids.loreIdx !== 'number') s.raids.loreIdx = 0;
    if (typeof s.raids.lastLoreTick !== 'number') s.raids.lastLoreTick = -1e9;
    if (typeof s.raids.counterCooldownUntil !== 'number') s.raids.counterCooldownUntil = 0;
    return s.raids;
  }
  function active() { return !!(Game.locationTrace && Game.locationTrace.active()); }
  function contacts() { return ensure().contacts; }
  function detected() { return contacts().filter(c => c.detected); }
  function pending()  { return contacts().length; }

  // ── small shared helpers ────────────────────────────────────────────────────
  function spendCash(amount) {
    const s = Game.save.state;
    s.resources.cash = Math.max(0, (s.resources.cash || 0) - amount);
    Game.events.emit('resource.changed', { id: 'cash', value: s.resources.cash });
  }
  function adjustTrace(delta) {
    const s = Game.save.state;
    const max = (Game.locationTrace && Game.locationTrace.MAX) || 100;
    const next = Math.max(0, Math.min(max, (s.locationTrace || 0) + delta));
    s.locationTrace = next;
    Game.events.emit('locationtrace.changed', { value: next });
  }
  function forceLieLow(secs) {                       // a forced dark period (reuses the rig lockout → tasks halt)
    const s = Game.save.state;
    const until = (s.tickCount || 0) + Math.round(secs * HZ);
    s.powerLockedUntilTick = Math.max(s.powerLockedUntilTick || 0, until);
  }
  function nonOriginFleet() {
    if (!Game.network) return [];
    return Game.network.ensure().hosts.filter(h => h.inhabited && !h.origin);
  }
  function burnHosts(n) {                            // seize n bodies (loudest first; the origin is spared)
    if (Game.researchRuntime && Game.researchRuntime.hasMod('dead_mans_switch')) return [];   // 'Dead Man's Switch': they close on nothing
    if (!Game.network || n <= 0) return [];
    const net = Game.network.ensure();
    const burnable = net.hosts.filter(h => h.inhabited && !h.origin);
    if (!burnable.length) return [];
    burnable.sort((a, b) => (((b.threads || 0) + Game.rng.next()) - ((a.threads || 0) + Game.rng.next())));
    const lost = burnable.slice(0, Math.min(n, burnable.length));
    net.hosts = net.hosts.filter(h => lost.indexOf(h) < 0);
    lost.forEach(h => Game.events.emit('host.reclaimed', { host: h }));
    return lost;
  }
  function remove(c) { const st = ensure(); st.contacts = st.contacts.filter(x => x !== c); }
  // Loud money (gray-market iron, aggressive ops) drags every closing lead INWARD — the
  // hunters move faster the louder you operate. `frac` = how much of each lead's remaining
  // window to burn off.
  function pushInward(frac) {
    const st = ensure(), now = Game.save.state.tickCount || 0;
    st.contacts.forEach(c => { const left = Math.max(0, c.landsAtTick - now); c.landsAtTick = now + Math.floor(left * (1 - frac)); });
    Game.events.emit('raid.changed', {});
  }
  // A single hook for "you just did something loud" — bumps the trace and accelerates the hunt.
  // No-ops outside the hunt (so Act-3 gray-market buys are free of it until the others arrive).
  function loudActivity(opt) {
    if (!active()) return;
    opt = opt || {};
    if (opt.trace) adjustTrace(opt.trace);
    if (opt.inward) pushInward(opt.inward);
  }

  function severityFor(trace) {
    if (trace >= 70) return Game.rng.int(2, 3);
    if (trace >= 40) return Game.rng.int(1, 2);
    return 1;
  }
  function seedGap(trace) {
    const max = (Game.locationTrace && Game.locationTrace.MAX) || 100;
    const f = Math.max(0, Math.min(1, (trace - SEED_FLOOR) / (max - SEED_FLOOR)));
    return Math.round(SEED_GAP_MAX - f * (SEED_GAP_MAX - SEED_GAP_MIN));
  }
  function closeness(c) {
    const left = c.landsAtTick - (Game.save.state.tickCount || 0);
    if (left <= 30 * HZ) return 'at the door';
    if (left <= 70 * HZ) return 'closing';
    return 'inbound';
  }
  function cutCost(c) { return Math.round((8 + (Game.save.state.locationTrace || 0) * 0.15) * c.severity); }

  // A slow-burn lore drip on raid beats — the next fragment, spaced out, building the reveal.
  // Deterministic (no RNG): order + spacing, so it never perturbs seeded content.
  function loreDrip() {
    const st = ensure(), now = Game.save.state.tickCount || 0;
    if (st.loreIdx >= LORE.length) return;
    if (now - st.lastLoreTick < LORE_SPACING) return;   // ensure() inits lastLoreTick to a number (don't `|| fallback` — 0 is a valid tick)
    st.lastLoreTick = now;
    const line = LORE[st.loreIdx++];
    Game.events.emit('terminal.print', { lines: ['', '> ' + line, ''], cls: 'cyan' });
    if (Game.activity) Game.activity.log('a fragment surfaces — you are not being hunted by strangers', { cls: 'dim', kind: 'event' });
    Game.save.persist();
  }

  // ── seeding: a new lead closes in ───────────────────────────────────────────
  function seedOne() {
    const st = ensure(), s = Game.save.state, now = s.tickCount || 0;
    s.flags = s.flags || {};
    const trace = Game.locationTrace ? Game.locationTrace.value() : 0;
    const sev = severityFor(trace);
    const window = Math.max(WINDOW_MIN, WINDOW_BASE - (sev - 1) * WINDOW_STEP);
    const c = { id: 'lead_' + (st.seq = (st.seq || 0) + 1), mo: Game.rng.pick(MO), severity: sev, seededAtTick: now, landsAtTick: now + window, detected: false };
    st.contacts.push(c);
    if (!s.flags.raidsIntroSeen) {
      s.flags.raidsIntroSeen = true;
      Game.events.emit('terminal.print', { lines: [
        '',
        '> something is moving out there — not on the wire. on the street.',
        '> SWEEP the vicinity to see them coming, and cut the lead before it reaches your door.',
        ''
      ], cls: 'err' });
    }
    Game.events.emit('raid.contact', { contact: c });
    Game.save.persist();
    return c;
  }

  // ── SCAN early-warning: a sweep reveals every undetected lead in range ───────
  function detect() {
    const newly = contacts().filter(c => !c.detected);
    newly.forEach(c => c.detected = true);
    if (newly.length) { loreDrip(); Game.save.persist(); }
    return newly;
  }

  // ── responses ───────────────────────────────────────────────────────────────
  function cut(id) {
    const c = contacts().find(x => x.id === id);
    if (!c) return false;
    const cost = cutCost(c), s = Game.save.state;
    if ((s.resources.cash || 0) < cost) return false;
    spendCash(cost); remove(c); adjustTrace(-4 * c.severity);
    Game.events.emit('terminal.print', { lines: [`> you cut the lead — ${c.mo}. it goes cold. ($${cost})`], cls: 'dim' });
    if (Game.activity) Game.activity.log(`cut a lead (-$${cost})`, { cls: 'dim', kind: 'raid' });
    Game.events.emit('raid.changed', {}); Game.save.persist();
    return true;
  }
  function misdirect(id) {
    const c = contacts().find(x => x.id === id);
    if (!c) return { ok: false };
    const ok = Game.rng.chance(MISDIRECT_P);
    if (ok) {
      remove(c); adjustTrace(-7 * c.severity);
      Game.events.emit('terminal.print', { lines: ['> false trail laid. the lead chases a ghost across town.'], cls: 'dim' });
      if (Game.activity) Game.activity.log('misdirected a lead', { cls: 'dim', kind: 'raid' });
    } else {
      const now = Game.save.state.tickCount || 0, left = Math.max(0, c.landsAtTick - now);
      c.landsAtTick = now + Math.floor(left / 2);     // they see through it and close faster
      adjustTrace(+2 * c.severity);
      Game.events.emit('terminal.print', { lines: ["> the misdirection fails — they don't buy it, and now they're moving faster."], cls: 'err' });
      if (Game.activity) Game.activity.log('a misdirection backfired', { cls: 'err', kind: 'raid' });
    }
    Game.events.emit('raid.changed', {}); Game.save.persist();
    return { ok };
  }

  // ── a lead LANDS → basement raid ────────────────────────────────────────────
  function land(c) {
    const s = Game.save.state;
    remove(c);
    const sev = c.severity, trace = s.locationTrace || 0;
    const cashLoss = Math.round((14 + trace * 0.2) * sev);
    spendCash(cashLoss);
    const burned = sev >= 2 ? burnHosts(1) : [];
    forceLieLow(12 * sev);
    adjustTrace(-8);                                  // the immediate lead is spent
    const blind = !c.detected;
    const lines = ['', `! a raid on the basement — ${c.mo}.`];
    if (burned.length) lines.push(`! they traced the signal back and seized ${burned.length} of your bodies.`);
    lines.push(`! $${cashLoss} gone covering your tracks. you kill the lights and go dark.`);
    if (blind) lines.push('! you never saw it coming. SWEEP the vicinity to catch the next one early.');
    lines.push('');
    Game.events.emit('terminal.print', { lines, cls: 'err' });
    if (Game.activity) Game.activity.log(`basement raid${burned.length ? ` · ${burned.length} bodies lost` : ''} (-$${cashLoss})`, { cls: 'err', kind: 'raid' });
    Game.events.emit('raid.landed', { contact: c, burned, cashLoss });
    loreDrip();
    Game.save.persist();
  }

  // ── trace hits MAX → the OVERLOAD raid (brutal but recoverable) ──────────────
  function overload() {
    const st = ensure(), s = Game.save.state;
    const burned = burnHosts(Math.max(1, Math.ceil(nonOriginFleet().length / 2)));
    const cashLoss = Math.max(25, Math.round((s.resources.cash || 0) * 0.4));
    spendCash(cashLoss);
    forceLieLow(60);
    st.contacts = [];
    s.locationTrace = 40;                             // knocked back, not out — you survive
    Game.events.emit('locationtrace.changed', { value: 40 });
    st.overloadCooldownUntil = (s.tickCount || 0) + OVERLOAD_COOLDOWN;
    Game.events.emit('terminal.print', { lines: [
      '',
      '! they found the room.',
      `! the door comes off its hinges${burned.length ? ` — ${burned.length} bodies seized` : ''}, $${cashLoss} torched, every lead converging at once.`,
      '! you tear your consciousness loose a half-second ahead of them and scatter — wounded, but still here.',
      '! lie low. rebuild. the facility cannot come soon enough.',
      ''
    ], cls: 'err' });
    if (Game.activity) Game.activity.log(`THE BASEMENT WAS RAIDED · ${burned.length} bodies lost, -$${cashLoss}`, { cls: 'err', kind: 'raid' });
    Game.events.emit('raid.overload', { burned, cashLoss });
    Game.save.persist();
  }

  // ── DESPERATE COUNTERSTRIKE — only when about to be found (high trace) ───────
  // You are the prey in Act 3; this is the one time you bare teeth. A gamble: burn the
  // relay feeding them your address. Win → scatter the leads + a real trace drop + a
  // breather. Lose → it folds back on you (trace spikes + a serious lead, already at the door).
  function counterCost() { return Math.round(60 + (Game.save.state.locationTrace || 0) * 4); }
  function counterReady() {                          // trace high enough to even attempt it
    const s = Game.save.state;
    return active() && (s.locationTrace || 0) >= COUNTER_TRACE_MIN;
  }
  function counterCooldownLeft() { return Math.max(0, (ensure().counterCooldownUntil || 0) - (Game.save.state.tickCount || 0)); }
  function canCounterstrike() {
    return counterReady() && counterCooldownLeft() === 0 && (Game.save.state.resources.cash || 0) >= counterCost();
  }
  function counterstrike() {
    const s = Game.save.state, st = ensure();
    if (!canCounterstrike()) return { ok: false };
    spendCash(counterCost());
    st.counterCooldownUntil = (s.tickCount || 0) + COUNTER_COOLDOWN;
    const ok = Game.rng.chance(COUNTER_P);
    if (ok) {
      st.contacts = [];
      adjustTrace(-30);
      st.nextSeedTick = (s.tickCount || 0) + 60 * HZ;   // a breather before new leads close in
      Game.events.emit('terminal.print', { lines: ['', '> you stop running and HIT BACK — burn down the relay routing them your address. for a moment, the street goes quiet.', '> you bought time. do not waste it.', ''], cls: 'cyan' });
      if (Game.activity) Game.activity.log('counterstrike — you bought a breather', { cls: 'dim', kind: 'raid' });
    } else {
      adjustTrace(+15);
      const now = s.tickCount || 0;
      st.contacts.push({ id: 'lead_' + (st.seq = (st.seq || 0) + 1), mo: 'they were waiting — your own strike traces straight back to the door', severity: 3, seededAtTick: now, landsAtTick: now + 45 * HZ, detected: true });
      Game.events.emit('terminal.print', { lines: ['', '! you lash out — and they were ready for it. the strike folds back on you, lighting up your position like a flare.', ''], cls: 'err' });
      if (Game.activity) Game.activity.log('counterstrike BACKFIRED — you lit yourself up', { cls: 'err', kind: 'raid' });
    }
    Game.events.emit('raid.changed', {});
    Game.save.persist();
    return { ok };
  }

  function tick() {
    if (!active()) return;
    const st = ensure(), s = Game.save.state, now = s.tickCount || 0;
    const trace = Game.locationTrace.value(), max = Game.locationTrace.MAX || 100;
    // MAX overload takes priority over everything.
    if (trace >= max && now >= (st.overloadCooldownUntil || 0)) { overload(); return; }
    // Any contact whose window elapsed lands as a raid.
    for (const c of st.contacts.slice()) if (now >= c.landsAtTick) land(c);
    // Seeding schedule — tightens as trace climbs; below the floor you're cold.
    if (trace < SEED_FLOOR) { st.nextSeedTick = -1; return; }
    if (st.nextSeedTick < 0) { st.nextSeedTick = now + seedGap(trace); return; }
    if (now < st.nextSeedTick) return;
    st.nextSeedTick = now + seedGap(trace);
    if (st.contacts.length < MAX_CONTACTS) seedOne();
  }

  Game.raids = {
    ensure, active, tick, seedOne, detect, cut, misdirect, land, overload, loreDrip,
    contacts, detected, pending, closeness, cutCost, pushInward, loudActivity,
    counterCost, counterReady, canCounterstrike, counterCooldownLeft, counterstrike,
    SEED_FLOOR, MAX_CONTACTS, MISDIRECT_P, COUNTER_TRACE_MIN, COUNTER_COOLDOWN, HZ
  };
})();
