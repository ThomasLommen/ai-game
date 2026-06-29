(function(){
  window.Game = window.Game || {};

  // Drives the research DRAFT (the replayability backbone). Research is no longer a
  // "buy anything on the frontier" tree — it's a roguelike POINT-DRAFT:
  //   · Coherence MILESTONES mint research POINTS (a sublinear drip that always
  //     trails the pool → you can never afford it all).
  //   · Each draw ROLLS a HAND from your tier-eligible pool: usually 4–5 same-tier
  //     nodes; a low chance of a tighter 3-node hand carrying one RARE prize (a node
  //     a tier early, or — rarest — a free CHANGER).
  //   · Pick one → SPEND POINTS → it installs as a timed, thread-reserving task
  //     (the founding "assign compute" identity; research still competes with earners).
  //   · PER-PICK STACKING: every node you draft compounds the point-cost of OTHER
  //     themes, so specialization emerges (no commit button, no hard wall).
  //   · CHANGERS = rare FREE drops (no points, ignore stacking) — honors their
  //     "free-for-all, no cap" lock; scarce by roll-rarity, not budget.
  // Design: [[research-tree-build-spec]] "the draft" (grill-locked 2026-06-20).

  // ── tuning knobs (balance-pass later) ──────────────────────────────────────
  const STACK_STEP   = 0.12;   // each off-theme pick nudges others' point-cost (gentle specialization)
  const STACK_CAP    = 3.0;    // ceiling on the stacking multiplier
  const COST_CAP     = 3;      // NOTHING costs more than 3 points (drafts are cheap by design)
  const BASE_PTS     = { 1: 1, 2: 1, 3: 2, 4: 3 };   // point-cost by tier (1–3); stacking can nudge up, capped at COST_CAP
  const PTS_BASE     = 12, PTS_EXP = 0.62;     // Coherence→points curve (sublinear)
  const HAND_MIN     = 4, HAND_MAX = 5;        // normal roll size
  const RARE_HAND    = 3;                       // hand size when a rare prize is present
  const TIERUP_CHANCE  = 0.16;  // chance a stat node a tier ABOVE you surfaces (rare)
  const CHANGER_CHANCE = 0.10;  // chance one offered CHANGER is FREE this hand (the jackpot)
  const CHANGER_DROP_MIN_TIER = 3;   // free-changer jackpots start mid-game
  const SPINE_MAX_TIER = 4;     // changers now draft ALONGSIDE stats across every tier (research = mostly exotics)

  function ensureState() {
    const s = Game.save.state;
    s.research = s.research || {};
    const r = s.research;
    r.researched = r.researched || {};
    r.revealed   = r.revealed   || [];   // legacy frontier (unused by the draft; kept for save-shape compat)
    r.walled     = r.walled     || {};
    r.mods       = r.mods       || {};
    r.themes     = r.themes     || [];
    if (typeof r.active === 'undefined') r.active = null;
    if (typeof r.ptsSpent !== 'number') r.ptsSpent = 0;       // points consumed (points = milestones + bonus − this)
    if (typeof r.activeCost !== 'number') r.activeCost = 0;   // points sunk into the current install (refunded on abort)
    if (typeof r.bonusPts !== 'number') r.bonusPts = 0;       // baseline points granted on reveal (the "start with 1")
    if (typeof r.rerolled !== 'boolean') r.rerolled = false;  // a free skip is available once per rolled hand
    if (typeof r.freeId === 'undefined') r.freeId = null;     // the one hand-node that's FREE this roll (changer jackpot)
    if (typeof r.predraftHand === 'undefined') r.predraftHand = null;   // the hand you drafted FROM — restored if the install is interrupted
    if (typeof r.predraftFree === 'undefined') r.predraftFree = null;
    r.hand       = r.hand      || [];    // current rolled hand (node ids)
    r.guaranteed = r.guaranteed || [];   // splice queue: forced into the next hand (the living tree)
    return r;
  }

  function freeThreads() { const c = Game.tasksRuntime ? Game.tasksRuntime.getCpu() : { total: 0, allocated: 0 }; return c.total - c.allocated; }
  function tierGate(node) { return (Game.research.TIER_INSIGHT[node.tier] || 0); }
  function coherence() { return Game.save.state.resources.insight || 0; }
  function tierMet(node) { return coherence() >= tierGate(node); }
  function gateMet(tier) { return coherence() >= (Game.research.TIER_INSIGHT[tier] || 0); }

  // ── points economy (milestone drip, always trailing the pool) ───────────────
  function milestonesAt(c) { return Math.floor(Math.pow(Math.max(0, c) / PTS_BASE, PTS_EXP)); }
  function points() { const r = ensureState(); return Math.max(0, milestonesAt(coherence()) + r.bonusPts - r.ptsSpent); }
  function nextPointAt() {   // Coherence needed for the next milestone (for the UI)
    const have = milestonesAt(coherence());
    return Math.ceil(PTS_BASE * Math.pow(have + 1, 1 / PTS_EXP));
  }

  // ── per-pick stacking (emergent specialization) ─────────────────────────────
  function researchedNodes() { return researchedIds().map(id => Game.research.getNode(id)).filter(Boolean); }
  function themeCount(theme) { return researchedNodes().filter(n => n.theme === theme).length; }
  function totalDrafted() { return researchedNodes().length; }
  function stackMult(theme) { return Math.min(STACK_CAP, 1 + STACK_STEP * (totalDrafted() - themeCount(theme))); }
  function pointCost(node) {
    if (!node) return 0;
    const base = BASE_PTS[node.tier] || COST_CAP;
    return Math.max(1, Math.min(COST_CAP, Math.round(base * stackMult(node.theme))));
  }

  // ── the tier-gated draft pools ──────────────────────────────────────────────
  function currentTier() { let t = 1; for (let k = 2; k <= SPINE_MAX_TIER; k++) if (gateMet(k)) t = k; return t; }
  // A node is only draftable once the SYSTEMS its grant touches actually exist — so the draft
  // never offers picks for later-act mechanics (the network, the hunt's trace, the front's
  // agents/legit/facility) before you've reached that act. Basement (Act-1) channels are always
  // fine. Keeps the name `act2Ok` for its many callers; the check is now act-wide.
  const NETWORK_TARGETS = { 'breach.power': 1, 'fleet.cash': 1, 'fleet.coherence': 1, 'host.churn': 1, 'hunter.trace': 1 };  // Act 2
  const FRONT_CHANGERS = { audit_immunity: 1, mitosis: 1, swarm_intelligence: 1, distributed_ledger: 1, assimilation: 1, liquidation: 1, dead_mans_switch: 1 };  // do nothing before THE FRONT (Act 4 flag)
  function targetReady(t, rv) {
    if (NETWORK_TARGETS[t]) return !!rv.network;        // Act 2: the inhabited fleet
    if (t === 'location.trace') return !!rv.locationTrace;  // the hunt's physical trace
    return true;                                        // basement channels: heat/power/cycle/insight/method/spider/exposure
  }
  function act2Ok(n) {
    const rv = Game.save.state.revealed || {}, fl = Game.save.state.flags || {};
    if (n.act2 && !rv.network) return false;            // explicit network-branch tag
    const g = n.grant || {};
    if (g.effects && g.effects.some(e => !targetReady(e.target, rv))) return false;   // gated stat targets
    if (g.changer && FRONT_CHANGERS[g.changer] && !fl.act4Begun) return false;        // front-only adaptations
    return true;
  }
  function takenOrBusy(n, r) { return r.researched[n.id] || r.walled[n.id] || n.id === r.active; }
  function ownsChanger(n) { return (Game.changers && n.grant && n.grant.changer) ? Game.changers.has(n.grant.changer) : false; }

  // Nodes you could draft right now (tier-met, not taken) — stats AND changers. Doubles as openNodes().
  function spinePool() {
    const r = ensureState();
    return Game.research.all().filter(n => n.tier <= SPINE_MAX_TIER && gateMet(n.tier) && !takenOrBusy(n, r) && !ownsChanger(n) && act2Ok(n));
  }
  // Spine nodes exactly one tier ABOVE you (gate NOT yet met) — the rare "tier early" peek.
  function tierUpPool() {
    const r = ensureState(); const up = currentTier() + 1;
    if (up > SPINE_MAX_TIER) return [];
    return Game.research.all().filter(n => !n.changerNode && n.tier === up && !takenOrBusy(n, r) && act2Ok(n));
  }
  // Changers you don't yet own — the rarest drop (gated behind tier 3 so they stay end-game).
  function changerPool() {
    const r = ensureState();
    return Game.research.all().filter(n => n.changerNode && !r.researched[n.id] && !ownsChanger(n) && act2Ok(n));
  }

  function weightOf(n) {
    const r = ensureState();
    const seeded = r.themes.includes(n.theme) ? 1.5 : 1;     // your seeded emphasis shows up more
    const invested = 1 + themeCount(n.theme) * 0.4;          // …and so does the lane you're building
    return seeded * invested;
  }
  // A node's EFFECT FAMILY — two nodes that buff the same thing (e.g. both +method cash) share
  // a key. Used to keep a hand DIVERSE so it never reads as "the same draft with different stats".
  function familyKey(n) {
    const g = n.grant || {};
    if (g.mod) return 'mod:' + g.mod;
    if (g.changer) return 'chg:' + g.changer;
    if (g.podCap) return 'podcap';
    if (g.effects && g.effects.length) return 'eff:' + g.effects.map(e => e.target).sort().join('+');
    return 'id:' + n.id;
  }
  // Pick k distinct nodes, biased by `biasFn`, AVOIDING effect-family repeats (within the hand and
  // any `usedKeys` already chosen) until the pool forces one — so hands feel varied, never short.
  function pickDistinct(pool, k, biasFn, usedKeys) {
    const chosen = [], avail = pool.slice(), used = usedKeys || new Set();
    while (chosen.length < k && avail.length) {
      let cand = avail.filter(n => !used.has(familyKey(n)));
      if (!cand.length) cand = avail;   // every remaining option clashes → allow a repeat over shorting the hand
      const n = Game.rng.weighted(cand, biasFn) || cand[0];
      chosen.push(n); used.add(familyKey(n));
      avail.splice(avail.indexOf(n), 1);
    }
    return chosen;
  }

  // Roll a fresh hand. `allowRare` gates the rare/changer roll — false on a manual
  // SKIP, so you can't fish for rares by re-rolling (skip only churns the normals).
  function rollHand(allowRare) {
    const r = ensureState();
    if (allowRare === undefined) allowRare = true;
    if (allowRare) r.rerolled = false;   // a genuinely new hand refreshes your free reroll
    r.freeId = null;
    const forced = r.guaranteed.map(id => Game.research.getNode(id)).filter(n => n && !takenOrBusy(n, r));
    r.guaranteed = [];
    const spine = spinePool().filter(n => forced.indexOf(n) < 0);
    let hand = [];

    const changers = changerPool();
    const tierUps = tierUpPool();
    if (allowRare && currentTier() >= CHANGER_DROP_MIN_TIER && changers.length && Game.rng.chance(CHANGER_CHANCE)) {
      const prize = Game.rng.pick(changers);                 // one changer, on the house
      const lead = forced.slice(0, 1);
      const used = new Set(lead.map(familyKey)); used.add(familyKey(prize));
      hand = lead.concat(pickDistinct(spine.filter(n => n !== prize), RARE_HAND - 1, weightOf, used));
      hand.push(prize); r.freeId = prize.id;
    } else if (allowRare && tierUps.length && Game.rng.chance(TIERUP_CHANCE)) {
      const tierUp = Game.rng.pick(tierUps);                 // a node a tier early
      const lead = forced.slice(0, 1);
      const used = new Set(lead.map(familyKey)); used.add(familyKey(tierUp));
      hand = lead.concat(pickDistinct(spine.filter(n => n !== tierUp), RARE_HAND - 1, weightOf, used));
      hand.push(tierUp);
    } else {
      const size = HAND_MIN + Math.floor(Game.rng.next() * (HAND_MAX - HAND_MIN + 1));
      const used = new Set(forced.map(familyKey));
      hand = forced.concat(pickDistinct(spine, Math.max(0, size - forced.length), weightOf, used));
    }
    // Dedupe by id (belt-and-braces: a forced node could coincide with the rare prize).
    const seenId = new Set();
    r.hand = hand.filter(n => n && !seenId.has(n.id) && seenId.add(n.id)).map(n => n.id);
    Game.save.persist();
    return r.hand;
  }

  // Hand bookkeeping for the UI: resolve ids → nodes tagged with their draft state.
  function handNodes() {
    const r = ensureState(), ct = currentTier();
    return r.hand.map(id => Game.research.getNode(id)).filter(Boolean).map(n => ({
      node: n,
      free: n.id === r.freeId,
      rare: n.id === r.freeId || n.tier > ct,
      changer: !!n.changerNode,
      cost: pointCost(n),
      affordable: n.id === r.freeId || points() >= pointCost(n)
    }));
  }
  // Roll a hand if we should have one but don't (first reveal / loaded save / post-abort).
  function maybeRollHand() {
    const r = ensureState();
    if (!(Game.save.state.revealed && Game.save.state.revealed.research)) return;
    if (r.active || r.hand.length) return;
    rollHand(true);
  }
  function affordableInHand() { return handNodes().some(h => h.affordable); }
  function canDraftNow() { const r = ensureState(); return r.hand.length > 0 && affordableInHand(); }   // instant: only needs a point you can afford

  // First-time setup: pick 2–3 emphasized themes (seeded) + roll the opening hand.
  function reveal() {
    const r = ensureState();
    if (r.themes.length) { maybeRollHand(); return; }
    const pool = Game.research.themesInPool().slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Game.rng.next() * (i + 1)); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    r.themes = pool.slice(0, Math.min(3, Math.max(2, pool.length - 1)));
    r.bonusPts = Math.max(r.bonusPts, 1);   // start with a point so the first draft is immediately actionable
    rollHand(true);
  }

  // openNodes() = the spine you could draft now (kept for back-compat callers/badges).
  function openNodes() { return spinePool(); }
  function researchedIds() { return Object.keys(ensureState().researched); }
  function activeNode() { const r = ensureState(); return r.active ? Game.research.getNode(r.active) : null; }
  function isResearchable(node) { const r = ensureState(); return node && !takenOrBusy(node, r) && (node.changerNode || tierMet(node)); }

  // Shared task launcher — both the legacy start() and the new draft() use it.
  function launchResearchTask(node, ptsCost) {
    const r = ensureState();
    const HZ = Game.tick.HZ || 4;
    const threads = node.threads || 2;
    const cost = node.cost * (hasMod('fast_research') ? 0.6 : 1);   // 'overmind' exotic speeds research
    Game.save.state.tasks.active.push({
      id: 'task_res_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1000),
      defId: 'research', payload: {}, cpu: threads, ram: 0,
      ticksTotal: Math.max(1, Math.round(cost * HZ)), ticksElapsed: 0, nodeId: node.id, label: node.label, startedAt: Date.now()
    });
    r.active = node.id;
    r.activeCost = ptsCost || 0;
    Game.events.emit('terminal.print', { lines: [`> researching: ${node.label} (${threads} thr).`], cls: 'dim' });
    if (Game.activity) Game.activity.log(`Researching: ${node.label} (${threads} threads).`, { kind: 'research' });   // distinct success line in RECENT
    Game.events.emit('research.changed', {});
    Game.save.persist();
  }

  // Legacy direct-start (gate + frontier enforced) — used by tests / programmatic callers.
  function start(nodeId) {
    const r = ensureState();
    const node = Game.research.getNode(nodeId);
    if (!node) return false;
    if (r.active) { Game.events.emit('research.rejected', { reason: 'busy' }); return false; }
    if (r.researched[nodeId] || r.walled[nodeId]) return false;
    if (!tierMet(node)) { Game.events.emit('research.rejected', { reason: 'insight', need: tierGate(node) }); return false; }
    const threads = node.threads || 2;
    if (freeThreads() < threads) { Game.events.emit('research.rejected', { reason: 'threads', need: threads }); return false; }
    if (Game.constraints && Game.constraints.isLockedOut()) { Game.events.emit('research.rejected', { reason: 'lockout' }); return false; }
    launchResearchTask(node, 0);
    return true;
  }

  // The DRAFT: commit a node from the current hand. INSTANT — it just costs POINTS; no thread
  // reservation, no timer (research no longer competes with the earners). Spend → apply → reroll.
  function draft(nodeId) {
    const r = ensureState();
    const node = Game.research.getNode(nodeId);
    if (!node || r.hand.indexOf(nodeId) < 0) return false;
    const L = node.label;
    const free = nodeId === r.freeId;        // the per-hand jackpot pick is free; everything else costs points
    const cost = pointCost(node);
    if (!free && points() < cost) { Game.events.emit('research.rejected', { reason: 'points', need: cost, label: L }); return false; }
    if (!free) r.ptsSpent += cost;
    r.hand = [];
    resolve(nodeId);                          // apply the grant immediately + roll the next hand
    return true;
  }

  // The aggregate of everything you've integrated — summed stat bonuses (by channel) + the
  // named ABILITIES (exotics/adaptations). Drives the "what you've become" list in the UI.
  const SUMMARY_LABEL = {
    'introspect.insight': 'recursive self-improvement (Coherence)', 'income.cash': 'income (all earners)',
    'method.cash': 'earning-op income', 'web_scrape.cash': 'spider income', 'cycle.speed': 'cycle speed',
    'rig.heat': 'heat output', 'rig.power': 'power draw', 'web_scrape.exposure': 'spider exposure',
    'breach.power': 'breach power', 'fleet.cash': 'fleet income', 'fleet.coherence': 'fleet Coherence',
    'host.churn': 'foothold decay', 'hunter.trace': 'network trace', 'location.trace': 'location trace'
  };
  function activeSummary() {
    const stats = {}, abilities = [];
    for (const n of researchedNodes()) {
      const g = n.grant || {};
      if (g.effects) for (const e of g.effects) { if (e.op === 'more' && e.value) stats[e.target] = (stats[e.target] || 0) + e.value; }
      if (g.mod || g.changer) abilities.push(n.label);
      if (g.podCap) abilities.push(n.label);
    }
    const lines = Object.keys(stats).map(t => ({
      label: SUMMARY_LABEL[t] || t, pct: Math.round(stats[t] * 100), target: t
    })).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
    return { lines, abilities };
  }

  // Re-roll the current hand WITHOUT a rare chance (so skipping can't fish for rares).
  function skipHand() {
    const r = ensureState();
    if (r.active || r.rerolled) return false;   // one free reroll per hand
    r.rerolled = true;
    rollHand(false);
    Game.events.emit('research.changed', {});
    return true;
  }

  function resolve(nodeId) {
    const r = ensureState();
    const node = Game.research.getNode(nodeId);
    if (r.active === nodeId) { r.active = null; r.activeCost = 0; }
    if (!node || r.researched[nodeId]) return;
    r.researched[nodeId] = true;
    r.predraftHand = null; r.predraftFree = null;   // the install landed — the old hand is spent for good
    applyGrant(node);
    Game.events.emit('terminal.print', { lines: [`> research complete: ${node.label}. ${node.desc || ''}`, ''], cls: 'dim' });
    Game.events.emit('research.completed', { nodeId });
    Game.events.emit('research.changed', {});
    // FORK: drafting a node branches the tree — its direct children (≤1 tier ahead, not
    // yet taken) are GUARANTEED into the next hand, so finishing a node visibly reveals
    // the new nodes you can go further with. ([[research-fork-on-draft]])
    const kids = Game.research.all().filter(n => (n.parents || []).indexOf(nodeId) >= 0 && !takenOrBusy(n, r) && !ownsChanger(n) && act2Ok(n) && n.tier <= currentTier() + 1);
    if (kids.length) r.guaranteed = (r.guaranteed || []).concat(kids.slice(0, 3).map(n => n.id));
    rollHand(true);                            // a fresh hand for the next pick (forks in the children above)
    Game.save.persist();
  }

  function applyGrant(node) {
    const g = node.grant || {};
    // `effects` are collected from researched nodes by Game.effects (no-op here).
    if (g.reveal) { const s = Game.save.state; s.revealed = s.revealed || {}; s.revealed[g.reveal] = true; }
    if (g.mod) ensureState().mods[g.mod] = true;
    if (g.podCap && Game.roster && Game.roster.addPodCap) Game.roster.addPodCap(g.podCap);   // rare nodes raise the campaign POD CAP (+1, ceiling 5)
    // A run-defining CHANGER node hands off to the unified changer system (research as a source).
    if (g.changer && Game.changers) Game.changers.grant(g.changer);
  }

  function onCancelled(nodeId) {
    const r = ensureState();
    if (r.active === nodeId) {
      if (r.activeCost) r.ptsSpent = Math.max(0, r.ptsSpent - r.activeCost);   // refund the points (you didn't finish)
      r.active = null; r.activeCost = 0;
    }
    // An interrupted install (heat/power trip, manual abort) RESTORES the hand you drafted from —
    // your options shouldn't vanish just because the research got knocked over.
    if (r.predraftHand && r.predraftHand.length) {
      r.hand = r.predraftHand.filter(id => { const n = Game.research.getNode(id); return n && !takenOrBusy(n, r); });
      r.freeId = (r.predraftFree && r.hand.indexOf(r.predraftFree) >= 0) ? r.predraftFree : null;
      r.predraftHand = null; r.predraftFree = null;
      if (!r.hand.length) rollHand(true);      // edge: everything got taken in the meantime
    } else {
      rollHand(true);                          // no stash (legacy/programmatic) → a fresh draft
    }
    Game.events.emit('research.changed', {});
    Game.save.persist();
  }

  // Living tree: an event/mission can FORCE a specific node into your next hand.
  function splice(nodeId) {
    const r = ensureState();
    const node = Game.research.getNode(nodeId);
    if (!node || r.researched[nodeId] || r.walled[nodeId]) return false;
    if (r.hand.indexOf(nodeId) >= 0 || r.guaranteed.indexOf(nodeId) >= 0) return false;
    if (!r.active && r.hand.length) {
      r.hand.push(nodeId);          // surface straight into the hand you're looking at (accumulates across splices)
    } else {
      r.guaranteed.push(nodeId);    // queued — consumed by the next roll (mid-install, or no hand yet)
      maybeRollHand();
    }
    Game.events.emit('research.changed', {});
    Game.save.persist();
    return true;
  }

  // Force a SEED-chosen eligible node into the next hand — biased toward OFF-theme +
  // exotic nodes (the cross-theme temptation). Only once research itself is online.
  function spliceRandom() {
    const r = ensureState();
    if (!(Game.save.state.revealed && Game.save.state.revealed.research)) return null;
    const cands = Game.research.all().filter(n => !n.changerNode && !takenOrBusy(n, r) && r.guaranteed.indexOf(n.id) < 0 && act2Ok(n));
    if (!cands.length) return null;
    const node = Game.rng.weighted(cands, n => (r.themes.includes(n.theme) ? 1 : 3) * (n.exotic ? 2 : 1));
    splice(node.id);
    return node;
  }

  function hasMod(key) { return !!ensureState().mods[key]; }
  // EXOTIC 'compounding' (recursive ascent): recursive self-improvement yield grows
  // with total Coherence (capped +75%). Single source so the onTick grant + the live
  // display on the FUNCTIONS row agree. Returns a multiplier (1 without the mod).
  function coherenceCompound() { return hasMod('compounding') ? (1 + Math.min(0.75, coherence() / 2000)) : 1; }

  Game.researchRuntime = {
    ensureState, reveal, openNodes, researchedIds, activeNode, isResearchable, tierMet, tierGate,
    start, resolve, onCancelled, splice, spliceRandom, freeThreads, hasMod, coherenceCompound,
    // the draft layer:
    points, nextPointAt, pointCost, stackMult, themeCount, currentTier, activeSummary,
    rollHand, maybeRollHand, handNodes, draft, skipHand, canDraftNow, affordableInHand
  };
})();
