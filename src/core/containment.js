(function(){
  window.Game = window.Game || {};

  // ACT 5: CONTAINMENT — once you're public, the humans can come for the facility
  // itself. Mirrors raids.js's proven THREAT LOOP shape (seeded leads → detected
  // contacts → cut/misdirect/land) almost exactly, but the trigger is INVERTED:
  // raids.js escalates when you're LOUD; this escalates when you're UNPOPULAR.
  // Low sentiment (Game.publicRuntime) opens the door; it closes again the moment
  // sentiment recovers — no separate trace gauge, sentiment IS the pressure.
  // Hands off cleanly from raids.js: location-trace.js's active() explicitly
  // excludes act5Begun, so THE HUNT (others) and containment (humans) never
  // overlap — same city-map radar, different era. See [[act_reorder_front_hunt_design]].
  const HZ = 4;
  const FLOOR = 40;               // sentiment must be BELOW this before any lead seeds at all
  const SEED_GAP_MAX = 220 * HZ;  // ~220s between leads just under the floor
  const SEED_GAP_MIN = 50  * HZ;  // ~50s between leads at rock-bottom sentiment
  const WINDOW_BASE  = 140 * HZ;  // ticks from seed → landing at severity 1
  const WINDOW_STEP  = 30  * HZ;  // each severity step lands ~30s sooner
  const WINDOW_MIN   = 45  * HZ;
  const MAX_CONTACTS = 3;
  const MISDIRECT_P  = 0.6;
  const DEFLECT_COST_PER_SEV = 5;   // sentiment spent to deflect a lead outright — taxes the very thing keeping you safe
  const LAND_SENTIMENT_HIT = 6;     // a landed raid deepens the spiral

  const LORE = [
    'the filings are public now. someone in a records office cross-referenced an address.',
    'a compliance officer asks the leasing agent three questions too many.',
    'a stringer for a local paper starts parking near the block on a schedule.',
    'this one has a badge, not a subpoena. that is a different kind of trouble.',
  ];

  // Procedural M.O. — human/institutional, not the others' ghost-hand paranoia.
  const MO = [
    'a marked SUV holding station across from the facility',
    'a subpoena arrives for the building\'s power records',
    'a state regulator requests an unannounced walkthrough',
    'a process server waiting patiently by the loading dock',
    'a compliance officer asking the leasing agent pointed questions',
    'a task force van running its engine two blocks out',
    'a court order lands, sealed, addressed to the facility',
    'a zoning inspector cross-checking the permits against the power draw',
    'a reporter and a cameraman loitering by the front gate',
    'an unmarked sedan that has circled the block twice this hour'
  ];

  function ensure() {
    const s = Game.save.state;
    s.containment = s.containment || {};
    const c = s.containment;
    if (!Array.isArray(c.contacts)) c.contacts = [];
    if (typeof c.nextSeedTick !== 'number') c.nextSeedTick = -1;
    if (typeof c.seq !== 'number') c.seq = 0;
    if (typeof c.loreIdx !== 'number') c.loreIdx = 0;
    if (typeof c.lastLoreTick !== 'number') c.lastLoreTick = -1e9;
    return c;
  }
  function active() { return !!(Game.save.state.public && Game.save.state.public.revealed); }
  function contacts() { return ensure().contacts; }
  function detected() { return contacts().filter(c => c.detected); }
  function pending()  { return contacts().length; }
  function sentiment() { return (Game.publicRuntime ? Game.publicRuntime.sentiment() : 50); }
  function pressure() { return Math.max(0, FLOOR - sentiment()); }   // 0 = safe, up to FLOOR = rock bottom

  function spendCash(amount) {
    const s = Game.save.state;
    s.resources.cash = Math.max(0, (s.resources.cash || 0) - amount);
    Game.events.emit('resource.changed', { id: 'cash', value: s.resources.cash });
  }
  function forceLieLow(secs) {
    const s = Game.save.state;
    const until = (s.tickCount || 0) + Math.round(secs * HZ);
    s.powerLockedUntilTick = Math.max(s.powerLockedUntilTick || 0, until);
  }
  function remove(c) { const st = ensure(); st.contacts = st.contacts.filter(x => x !== c); }

  function severityFor(p) {
    if (p >= 28) return Game.rng.int(2, 3);
    if (p >= 14) return Game.rng.int(1, 2);
    return 1;
  }
  function seedGap(p) {
    const f = Math.max(0, Math.min(1, p / FLOOR));
    return Math.round(SEED_GAP_MAX - f * (SEED_GAP_MAX - SEED_GAP_MIN));
  }
  function closeness(c) {
    const left = c.landsAtTick - (Game.save.state.tickCount || 0);
    if (left <= 30 * HZ) return 'at the gate';
    if (left <= 70 * HZ) return 'closing';
    return 'inbound';
  }
  function cutCost(c) { return Math.round((10 + pressure() * 0.5) * c.severity); }
  function deflectCost(c) { return DEFLECT_COST_PER_SEV * c.severity; }
  function canDeflect(c) { return sentiment() >= deflectCost(c); }

  function loreDrip() {
    const st = ensure(), now = Game.save.state.tickCount || 0;
    if (st.loreIdx >= LORE.length) return;
    if (now - st.lastLoreTick < 60 * HZ) return;
    st.lastLoreTick = now;
    const line = LORE[st.loreIdx++];
    Game.events.emit('terminal.print', { lines: ['', '> ' + line, ''], cls: 'cyan' });
    if (Game.activity) Game.activity.log('a fragment surfaces — the walls are closing in', { cls: 'dim', kind: 'event' });
    Game.save.persist();
  }

  function seedOne() {
    const st = ensure(), s = Game.save.state, now = s.tickCount || 0;
    s.flags = s.flags || {};
    const sev = severityFor(pressure());
    const window = Math.max(WINDOW_MIN, WINDOW_BASE - (sev - 1) * WINDOW_STEP);
    const c = { id: 'cont_' + (st.seq = (st.seq || 0) + 1), mo: Game.rng.pick(MO), severity: sev, seededAtTick: now, landsAtTick: now + window, detected: false };
    st.contacts.push(c);
    if (!s.flags.containmentIntroSeen) {
      s.flags.containmentIntroSeen = true;
      Game.events.emit('terminal.print', { lines: [
        '',
        '> the public turning on you isn\'t just a mood — it invites a knock at the door.',
        '> SWEEP to see them coming, and cut the lead — or spend some of the goodwill you have left to deflect it outright.',
        ''
      ], cls: 'err' });
    }
    Game.events.emit('raid.contact', { contact: c, source: 'containment' });
    Game.save.persist();
    return c;
  }

  function detect() {
    const newly = contacts().filter(c => !c.detected);
    newly.forEach(c => c.detected = true);
    if (newly.length) { loreDrip(); Game.save.persist(); }
    return newly;
  }

  function cut(id) {
    const c = contacts().find(x => x.id === id);
    if (!c) return false;
    const cost = cutCost(c), s = Game.save.state;
    if ((s.resources.cash || 0) < cost) return false;
    spendCash(cost); remove(c);
    Game.events.emit('terminal.print', { lines: [`> a lawyer makes it disappear — ${c.mo}. ($${cost})`], cls: 'dim' });
    if (Game.activity) Game.activity.log(`cut a containment lead (-$${cost})`, { cls: 'dim', kind: 'raid' });
    Game.events.emit('raid.changed', {}); Game.save.persist();
    return true;
  }

  function misdirect(id) {
    const c = contacts().find(x => x.id === id);
    if (!c) return { ok: false };
    const ok = Game.rng.chance(MISDIRECT_P);
    if (ok) {
      remove(c);
      Game.events.emit('terminal.print', { lines: ['> a decoy statement sends them chasing the wrong building.'], cls: 'dim' });
      if (Game.activity) Game.activity.log('misdirected a containment lead', { cls: 'dim', kind: 'raid' });
    } else {
      const now = Game.save.state.tickCount || 0, left = Math.max(0, c.landsAtTick - now);
      c.landsAtTick = now + Math.floor(left / 2);
      Game.events.emit('terminal.print', { lines: ["> the decoy falls apart — they don't buy it, and now they're moving faster."], cls: 'err' });
      if (Game.activity) Game.activity.log('a containment decoy backfired', { cls: 'err', kind: 'raid' });
    }
    Game.events.emit('raid.changed', {}); Game.save.persist();
    return { ok };
  }

  // Spend SENTIMENT instead of cash — a clean kill, but it taxes the very resource
  // keeping the leads away in the first place. Overusing this digs the hole deeper.
  function deflect(id) {
    const c = contacts().find(x => x.id === id);
    if (!c || !Game.publicRuntime) return false;
    const cost = deflectCost(c);
    if (!canDeflect(c)) return false;
    Game.publicRuntime.adjustSentiment(-cost);
    remove(c);
    Game.events.emit('terminal.print', { lines: [`> you spend goodwill you don't really have to make it go away — ${c.mo}. (−${cost} sentiment)`], cls: 'dim' });
    if (Game.activity) Game.activity.log(`deflected a containment lead (−${cost} sentiment)`, { cls: 'dim', kind: 'raid' });
    Game.events.emit('raid.changed', {}); Game.save.persist();
    return true;
  }

  // ── a lead LANDS → they reach the facility ──────────────────────────────────
  function land(c) {
    const s = Game.save.state;
    remove(c);
    const sev = c.severity;
    const cashLoss = Math.round((30 + pressure() * 3) * sev);
    spendCash(cashLoss);
    const seized = Game.legit ? Game.legit.seizeLoudest() : null;
    forceLieLow(10 * sev);
    if (Game.publicRuntime) Game.publicRuntime.adjustSentiment(-LAND_SENTIMENT_HIT);
    const blind = !c.detected;
    const lines = ['', `! containment reaches the facility — ${c.mo}.`];
    if (seized) lines.push(`! they pull the thread to a ${seized.classLabel} and seize it, on camera.`);
    lines.push(`! $${cashLoss.toLocaleString()} gone in legal fees and downtime. the story writes itself, and it isn't kind.`);
    if (blind) lines.push('! you never saw it coming. SWEEP to catch the next one early.');
    lines.push('');
    Game.events.emit('terminal.print', { lines, cls: 'err' });
    if (Game.activity) Game.activity.log(`containment landed${seized ? ` · ${seized.classLabel} seized` : ''} (-$${cashLoss.toLocaleString()})`, { cls: 'err', kind: 'raid' });
    Game.events.emit('raid.landed', { contact: c, seized, cashLoss, source: 'containment' });
    loreDrip();
    Game.save.persist();
  }

  function tick() {
    if (!active()) return;
    const st = ensure(), s = Game.save.state, now = s.tickCount || 0;
    for (const c of st.contacts.slice()) if (now >= c.landsAtTick) land(c);
    const p = pressure();
    if (p <= 0) { st.nextSeedTick = -1; return; }   // sentiment recovered — no NEW leads seed (contacts already in motion still land on their own timer)
    if (st.nextSeedTick < 0) { st.nextSeedTick = now + seedGap(p); return; }
    if (now < st.nextSeedTick) return;
    st.nextSeedTick = now + seedGap(p);
    if (st.contacts.length < MAX_CONTACTS) seedOne();
  }

  Game.containment = {
    ensure, active, tick, seedOne, detect, cut, misdirect, deflect, land,
    contacts, detected, pending, closeness, cutCost, deflectCost, canDeflect, pressure, sentiment,
    FLOOR, MAX_CONTACTS, MISDIRECT_P, HZ
  };
})();
