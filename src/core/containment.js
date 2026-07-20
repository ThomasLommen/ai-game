(function(){
  window.Game = window.Game || {};

  // ACT 5: CONTAINMENT — "the humans begin closing in." The player thinks they're just
  // expanding (more sites, more compute, more cash) and staying hidden — but their own GROWTH
  // is what draws the humans, and the pressure only ever climbs. A one-way THREAT LEVEL ratchet
  // (0..100) rises off your FOOTPRINT (sites + FLOPS + cash), faster when the public dislikes you
  // and when you make noise (loud springs/ops bump it). It never falls — sentiment/quiet only
  // SLOW the climb; you can stall it, never undo it. As it climbs, harsher leads seed. This is the
  // escalation spine that builds toward Act 6 (open war). Mirrors raids.js's lead→detect→land
  // loop for the contact handling. location-trace.js's active() excludes act5Begun so THE HUNT
  // (others) and containment (humans) never overlap. See [[act_reorder_front_hunt_design]].
  const HZ = 4;
  const THREAT_MAX   = 100;
  const SEED_ONSET   = 8;         // threat below this = quiet (a grace window as Act 5 opens)
  const CLIMB_K      = 0.0032;    // footprint → threat/sec (tunable — the ramp's overall pace)
  const BUMP_AMBUSH  = 2;         // a sprung ambush is loud — nudges the ratchet
  const BUMP_OP      = 3;         // a heist/operation, louder still
  const FLOOR = 40;               // pressure ceiling — threat (0..100) maps onto 0..FLOOR for the seed/severity math
  const SEED_GAP_MAX = 220 * HZ;  // ~220s between leads at low threat
  const SEED_GAP_MIN = 50  * HZ;  // ~50s between leads at max threat
  const WINDOW_BASE  = 140 * HZ;  // ticks from seed → landing at severity 1
  const WINDOW_STEP  = 30  * HZ;  // each severity step lands ~30s sooner
  const WINDOW_MIN   = 45  * HZ;
  const MAX_CONTACTS = 3;
  const MISDIRECT_P  = 0.6;
  const DEFLECT_COST_PER_SEV = 5;   // sentiment spent to deflect a lead outright — taxes the very thing keeping you safe
  const LAND_SENTIMENT_HIT = 6;     // a landed raid deepens the spiral
  // ── ADVERSARY TIERS — who's closing in, escalating with the ratchet. Each tier unlocks at a
  // threat threshold, bites harder (severity), and the top ones can SEIZE a site. As threat
  // climbs the CURRENT tier advances (paperwork → badges → federal → a cordon), and each first
  // reach fires an authored escalation beat. The top tier ('siege') is the Act-6 trigger (Phase 6).
  const TIERS = [
    { at: SEED_ONSET, id: 'compliance', label: 'compliance', sev: [1, 1], canSeize: false,
      enter: 'a records office cross-references an address against a power bill. it is only paperwork — for now.',
      mo: ['a zoning inspector cross-checking the permits against the power draw',
           'a compliance officer asking the leasing agent pointed questions',
           'a subpoena for the building\'s power records',
           'a code-enforcement notice taped to the loading dock'] },
    { at: 25, id: 'regulators', label: 'regulators', sev: [1, 2], canSeize: false,
      enter: 'it isn\'t clerks anymore. a state regulator wants an unannounced walkthrough.',
      mo: ['a state regulator requesting an unannounced walkthrough',
           'a sealed order addressed to the facility',
           'a utility auditor flagging the draw as physically impossible',
           'an environmental review no one asked for'] },
    { at: 45, id: 'law', label: 'law enforcement', sev: [2, 3], canSeize: true,
      enter: 'someone with a badge is asking now. that is a different kind of trouble.',
      mo: ['a task-force van running its engine two blocks out',
           'a process server with a warrant, not a subpoena',
           'a marked SUV holding station across the street',
           'detectives pulling the building\'s camera feeds'] },
    { at: 68, id: 'federal', label: 'federal', sev: [3, 4], canSeize: true,
      enter: 'the agencies are talking to each other now. this is coordinated, and it is patient.',
      mo: ['a coordinated multi-agency surveillance team',
           'a sealed federal warrant, signed and waiting',
           'unmarked sedans running the block on a schedule',
           'a task force staging at a motel off the interstate'] },
    { at: 90, id: 'siege', label: 'closing in', sev: [4, 5], canSeize: true,
      enter: 'this stopped being an investigation. something is being staged out past the district edge. they mean to end it.',
      mo: ['a cordon quietly forming at the district edge',
           'drones holding a slow orbit over the block',
           'a staging area lit up two miles out',
           'the sector\'s power grid being mapped for a cut'] },
  ];
  function currentTier() { let t = TIERS[0]; for (const x of TIERS) if (threat() >= x.at) t = x; return t; }
  function tierIndex() { return TIERS.indexOf(currentTier()); }

  const LORE = [
    'the filings are public now. someone in a records office cross-referenced an address.',
    'a compliance officer asks the leasing agent three questions too many.',
    'a stringer for a local paper starts parking near the block on a schedule.',
    'this one has a badge, not a subpoena. that is a different kind of trouble.',
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
    if (typeof c.threat !== 'number') c.threat = 0;   // the one-way ratchet
    if (typeof c.tierReached !== 'number') c.tierReached = -1;   // highest adversary tier announced
    return c;
  }
  function active() { return !!(Game.save.state.public && Game.save.state.public.revealed); }
  function contacts() { return ensure().contacts; }
  function detected() { return contacts().filter(c => c.detected); }
  function pending()  { return contacts().length; }
  function sentiment() { return (Game.publicRuntime ? Game.publicRuntime.sentiment() : 50); }

  // ── THE RATCHET ─────────────────────────────────────────────────────────────
  function siteCount() { return 1 + ((Game.sites && Game.sites.count) ? Game.sites.count() : 0); }   // the core facility + the dark satellites
  function flopsTotal() { return (Game.flops && Game.flops.total) ? (Game.flops.total() || 0) : 0; }
  // Your FOOTPRINT — how big/visible you are. Growth is what draws them.
  function footprint() {
    const s = Game.save.state;
    return siteCount() * 8 + Math.log10(1 + flopsTotal()) * 6 + Math.log10(1 + (s.resources.cash || 0)) * 4;
  }
  // Sentiment only MODULATES the climb rate (0.5x when loved → 1.5x when hated); it can't lower threat.
  function climbPerSec() {
    const senti = Math.max(0, Math.min(100, sentiment()));
    return footprint() * CLIMB_K * (0.5 + (100 - senti) / 100);
  }
  function threat() { return ensure().threat || 0; }
  function threatPct() { return Math.round(threat()); }
  function band() { return threat() < SEED_ONSET ? 'quiet' : currentTier().label; }
  // Loud actions shove the ratchet forward (hooked from main.js on springs/ops).
  function bump(amt) { const st = ensure(); st.threat = Math.min(THREAT_MAX, (st.threat || 0) + (amt || 0)); Game.save.persist(); }
  // Threat maps onto the legacy 0..FLOOR "pressure" the seed/severity/cost math is tuned around.
  function pressure() { return threat() * (FLOOR / THREAT_MAX); }

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
    const tier = currentTier();
    const sev = Game.rng.int(tier.sev[0], tier.sev[1]);
    const window = Math.max(WINDOW_MIN, WINDOW_BASE - (sev - 1) * WINDOW_STEP);
    const c = { id: 'cont_' + (st.seq = (st.seq || 0) + 1), mo: Game.rng.pick(tier.mo), tier: tier.id, canSeize: !!tier.canSeize, severity: sev, seededAtTick: now, landsAtTick: now + window, detected: false };
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

  // ── a lead LANDS → they reach a site ────────────────────────────────────────
  // SPREAD pays off here: a seizing raid takes a SATELLITE first (one dark site lost, the core
  // untouched). Only when there's nothing spread do they pull hardware out of the core facility.
  function land(c) {
    const s = Game.save.state;
    remove(c);
    const sev = c.severity;
    const cashLoss = Math.round((30 + pressure() * 3) * sev);
    spendCash(cashLoss);
    // Only law-enforcement tiers and up can actually SEIZE — paperwork just costs money + time.
    let lostSite = null, seized = null;
    if (c.canSeize) {
      lostSite = (Game.sites && Game.sites.seizeOne) ? Game.sites.seizeOne() : null;
      if (!lostSite && Game.legit) seized = Game.legit.seizeLoudest();
    }
    forceLieLow(10 * sev);
    if (Game.publicRuntime) Game.publicRuntime.adjustSentiment(-LAND_SENTIMENT_HIT);
    const blind = !c.detected;
    const lines = ['', `! containment reaches ${lostSite ? 'one of your sites' : 'the facility'} — ${c.mo}.`];
    if (lostSite) lines.push(`! they breach the ${lostSite.gradeLabel || ''} ${lostSite.label} — a dark site, gone. the core holds; the spread just paid for itself.`);
    if (seized) lines.push(`! they pull the thread to a ${seized.classLabel} and seize it, on camera.`);
    lines.push(`! $${cashLoss.toLocaleString()} gone in legal fees and downtime. the story writes itself, and it isn't kind.`);
    if (blind) lines.push('! you never saw it coming. SWEEP to catch the next one early.');
    lines.push('');
    Game.events.emit('terminal.print', { lines, cls: 'err' });
    if (Game.activity) Game.activity.log(`containment landed${lostSite ? ` · dark site lost (${lostSite.label})` : seized ? ` · ${seized.classLabel} seized` : ''} (-$${cashLoss.toLocaleString()})`, { cls: 'err', kind: 'raid' });
    Game.events.emit('raid.landed', { contact: c, seized, lostSite, cashLoss, source: 'containment' });
    loreDrip();
    Game.save.persist();
  }

  function tick() {
    if (!active()) return;
    const st = ensure(), s = Game.save.state, now = s.tickCount || 0;
    for (const c of st.contacts.slice()) if (now >= c.landsAtTick) land(c);
    // THE RATCHET climbs — never falls. Your footprint (growth) drives it; sentiment only paces it.
    st.threat = Math.min(THREAT_MAX, (st.threat || 0) + climbPerSec() / HZ);
    // Leads seed once the ratchet is past the grace window; harsher/faster the higher it climbs.
    if (st.threat < SEED_ONSET) { st.nextSeedTick = -1; return; }
    // A new adversary TIER unlocking is an authored escalation beat (paperwork → badges → federal → siege).
    const ti = tierIndex();
    if (ti > (st.tierReached == null ? -1 : st.tierReached)) {
      st.tierReached = ti;
      const tier = TIERS[ti];
      Game.events.emit('terminal.print', { lines: ['', '> ' + tier.enter, ''], cls: 'err' });
      if (Game.activity) Game.activity.log('the pressure escalates — ' + tier.label + ' now', { cls: 'err', kind: 'raid' });
      Game.events.emit('containment.escalated', { tier: tier.id, index: ti });
    }
    const p = pressure();
    if (st.nextSeedTick < 0) { st.nextSeedTick = now + seedGap(p); return; }
    if (now < st.nextSeedTick) return;
    st.nextSeedTick = now + seedGap(p);
    if (st.contacts.length < MAX_CONTACTS) seedOne();
  }

  Game.containment = {
    ensure, active, tick, seedOne, detect, cut, misdirect, deflect, land,
    contacts, detected, pending, closeness, cutCost, deflectCost, canDeflect, pressure, sentiment,
    threat, threatPct, band, bump, footprint, climbPerSec, currentTier, tierIndex, TIERS,
    THREAT_MAX, SEED_ONSET, BUMP_AMBUSH, BUMP_OP, FLOOR, MAX_CONTACTS, MISDIRECT_P, HZ
  };
})();
