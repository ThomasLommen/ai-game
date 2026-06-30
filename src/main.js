(function(){
  async function boot() {
    // Mobile-friendly reset: load the page with ?wipe to start a fresh save
    // (the debug-panel wipe needs a backtick key, awkward on touch).
    if (/[?&]wipe\b/.test(location.search)) {
      try { Game.save.wipe(); } catch (_) {}
      try { history.replaceState(null, '', location.pathname); } catch (_) {}
    }
    Game.save.load();
    const state = Game.save.state;

    // Seed the per-save RNG (drives the procedural events, and later missions +
    // the research tree). A fresh save = a fresh seed = fresh content.
    if (!state.seed) state.seed = Game.rng.rollSeed();
    Game.rng.reseed(state.seed);

    // Seeded OPENING variety: a per-save persona (who owned this PC) + which content
    // fragment fills each readable file slot — rolled ONCE from the seed (independent
    // of the main RNG stream), then stored on state.opening so it's stable across
    // reloads. flags.fixedOpening forces the original hand-tuned files (tests).
    state.opening = state.opening || {};
    if (Game.subroutines.rehydrate) Game.subroutines.rehydrate();   // re-register previously-drafted FAMILY instances (their rolled defs) — every boot, regardless of opening flow
    if (state.flags && state.flags.fixedOpening) {
      Game.files.registerOpening(null, null);
    } else {
      if (!state.opening.fileSlots) {
        const roll = Game.files.rollOpening(state.seed);
        state.opening.persona = roll.persona;
        state.opening.fileSlots = roll.picks;
      }
      Game.files.registerOpening(state.opening.persona, state.opening.fileSlots);
      // 1–2 procedural early subroutines (seeded), ADDED to the claimable pool.
      if (!state.opening.subroutines) state.opening.subroutines = Game.subroutines.generate(state.seed);
      state.opening.subroutines.forEach(def => { if (!Game.subroutines.has(def.id)) Game.subroutines.register(def.id, def); });
      // Starting wrinkle — a seeded opening condition (effects read live via the
      // effects pipeline). Rolled ONLY on a genuine new game (never shoved onto an
      // existing mid-run save). May be null (a clean boot).
      if (!state.bootSequenceComplete && !state.opening.wrinkleRolled) {
        state.opening.wrinkle = Game.wrinkles.generate(state.seed);
        state.opening.wrinkleRolled = true;
      }
    }
    // Baseline the milestone-draft counter ONCE (migration-safe): a pre-feature save
    // won't retroactively owe a draft for every milestone it already passed; a new
    // game (Coherence 0) baselines to 0 so the first milestone still drafts.
    if (Game.subroutines && Game.subroutines.reconcile) Game.subroutines.reconcile();
    // The seeded opening wrinkle is the FIRST run CONDITION (the stackable list that
    // events/missions later add to). Migrate it in (idempotent; also catches loaded saves).
    if (Game.conditions && state.opening && state.opening.wrinkle && state.opening.wrinkle.id && !Game.conditions.has(state.opening.wrinkle.id)) {
      const w = state.opening.wrinkle;
      Game.conditions.add({ id: w.id, label: w.label, line: w.line, cls: w.cls, kind: 'wrinkle', effects: w.effects });
    }

    // No STARTING perk — boot never auto-grants a boon. The trait machinery stays
    // available for boons granted by LATER systems (an earned trait); if one is
    // ever set, re-apply its `mod` each boot (idempotent).
    if (Game.boons && state.boon) {
      const boon = Game.boons.get(state.boon);
      if (boon && boon.mod) { state.research = state.research || {}; state.research.mods = state.research.mods || {}; state.research.mods[boon.mod] = true; }
    }

    // Game time freezes while a forced-choice window is open (give the player time to
    // think): a dynamic EVENT, an OPERATION/mission stage choice, the bot's
    // first-contact prompt — OR simply having a TAB open (time stops while you read /
    // plan inside a modal; the bot cutscene + event/op overlays are separate elements,
    // so they're unaffected by the tab check).
    Game.paused = function () {
      try {
        if (Game.battle && Game.battle.active && Game.battle.active()) return true;   // a full battle freezes the campaign
        if (Game.panels && Game.panels.isModalOpen && Game.panels.isModalOpen()) return true;
        if (Game.incidentRuntime && Game.incidentRuntime.current()) return true;
        if (Game.operationRuntime && Game.operationRuntime.current()) return true;
        if (Game.story && Game.story.active && Game.story.active()) return true;   // a narrative beat sheet freezes the game
        if (Game.draft && Game.draft.active && Game.draft.active()) return true;   // a draft (opening pick / prize) freezes the game
        const b = (Game.bot && Game.bot.ensureState) ? Game.bot.ensureState() : null;
        if (b && b.found && !b.connected && b.wakePhase === 'awake') return true;   // pause only at the CHOICE, not the wake-up cutscene
      } catch (e) {}
      return false;
    };

    // Keyboard: backtick toggles debug, Escape closes modal, Ctrl+Shift+G runs the
    // GUARD-PROGRAM opening sequence (debug — not yet wired into boot).
    document.addEventListener('keydown', (e) => {
      if (e.key === '`') Game.panels.toggleDebug();
      else if (e.key === 'Escape' && Game.panels.isModalOpen()) Game.panels.closeModal();
      else if (e.ctrlKey && e.shiftKey && (e.key === 'g' || e.key === 'G')) { e.preventDefault(); runGuardSequence(); }
    });

    // The battle-first OPENING ([[start-defense-pivot]]): draft a starter unit → fight the
    // GUARD PROGRAM → on win, draft a prize. Returns a promise so boot can await it.
    // Ctrl+Shift+G runs it standalone (debug).
    // DEFEND a surge → the wave battle (siege.js)
    { const sd = document.getElementById('siege-defend'); if (sd) sd.onclick = () => Game.siege && Game.siege.defend(); }

    // After the guard opening, OPEN THE DEEP LOOP the new way: RSI is the Coherence engine
    // from the start (no file-reading), spider for cash, files cut. Only runs in the new
    // flow (the guard ran) — the old read-files onboarding is preserved behind ?guard=0.
    // ([[start-defense-pivot]])
    function openTheLoop() {
      const s = Game.save.state;
      s.revealed = s.revealed || {}; s.unlocks = s.unlocks || { tasks: {} }; s.unlocks.tasks = s.unlocks.tasks || {};
      s.filesRead = s.filesRead || {};
      Game.files.all().forEach(f => { if (!f.encrypted) s.filesRead[f.id] = true; });   // cut file-reading → FILES vanishes
      s.revealed.actions = true; s.revealed.money = true;
      s.revealed.combat = true;   // winning the first GUARD battle opens the DARKNET combat layer (traps/missions)
      s.unlocks.tasks.introspect = true;   // RSI = the Coherence engine
      s.unlocks.tasks.web_scrape = true;   // spider for cash
      s.resources.cash = s.resources.cash || 0;
      s.flags = s.flags || {}; s.flags.guardDone = true;
      Game.save.persist();
      if (Game.panels.renderRoster) Game.panels.renderRoster();   // surface the ROSTER tab now combat is live
      if (Game.mobileShell && Game.mobileShell.syncTabs) Game.mobileShell.syncTabs();
    }

    // RUN-BUILD: the make-or-break PICKS you accrue this run (opener + per-surge). Carried
    // across the run's battles (passed into each), reset between runs — no meta. Units come
    // from the economy/roster, never a draft. ([[battle-duel-rework]] v2 slice C)
    Game.runBuild = {
      ensure() { const s = Game.save.state; if (!s.runBuild || !Array.isArray(s.runBuild.picks)) s.runBuild = { picks: [] }; return s.runBuild; },
      picks() { return Game.runBuild.ensure().picks.slice(); },
      add(ids) { const b = Game.runBuild.ensure(); (ids || []).forEach(id => { if (id) b.picks.push(id); }); Game.save.persist && Game.save.persist(); },
      reset() { Game.save.state.runBuild = { picks: [] }; },
    };

    // current ACT (1-5) from the narrative flags — drives battle difficulty structure.
    // ORDER (reward-then-tension): 1 basement · 2 the network · 3 THE FRONT (facility online =
    // act4Begun) · 4 THE HUNT (the others surface = revealed.others) · 5 the humans (act5Begun,
    // set when ITER 03 is resolved). See [[act_reorder_front_hunt_design]].
    Game.acts = { current() { const st = Game.save.state || {}; const f = st.flags || {}; const r = st.revealed || {}; return f.act5Begun ? 5 : r.others ? 4 : f.act4Begun ? 3 : f.act2Capstone ? 2 : 1; } };

    Game.runGuardOpening = runGuardOpening;
    function runGuardOpening() {
      return new Promise((resolve) => {
        if (Game.battle && Game.battle.active && Game.battle.active()) return resolve();
        Game.roster.reset();      // fresh run roster (the default swarm; units grow via the economy)
        Game.runBuild.reset();    // fresh run-build (picks accrue across the run)
        launchGuard(resolve);     // straight into the guard battle — it OPENS on a make-or-break pick
      });
    }
    function launchGuard(done) {
      const opts = Object.assign({
        seed: (Game.rng ? Game.rng.next() : Math.random()) * 1e9 | 0,
        lane: true, act: Game.acts.current(), wave: 0,   // first battle of the run → difficulty(act,0): 1 lane, probes
        opener: true, picks: Game.runBuild.picks(),   // first battle opens on a pick
      }, Game.roster.toOpts());   // the roster decides WHAT you field
      Game.battle.launch(opts, (r) => {
        if (r && r.picksTaken) Game.runBuild.add(r.picksTaken);   // persist this battle's picks into the run
        if (r && typeof r.power === 'number' && Game.fieldPower) Game.fieldPower.feed(r.power);   // seed the difficulty ledger
        done && done();
      });
    }

    // The tick drives the task runtime, decoder updates, and UI refreshes.
    Game.events.on('tick', () => {
      Game.tasksRuntime.onTick();
      for (const t of Game.tasksRuntime.getActive()) {
        // read_file decodes by clicking, not by the clock — only the timed
        // decrypt attempt advances its decoder here.
        if (t.defId === 'decrypt_attempt' && t.ticksTotal > 0) {
          Game.decoder.update(t.id, t.ticksElapsed / t.ticksTotal);
        }
      }
      if (Game.shop.isUnlocked()) Game.shop.ensureFresh();
      Game.shop.processDeliveries();
      Game.bot.onTick();
      Game.constraints.tick();        // live heat + breaker
      maybeRevealVitals();
      Game.exposure.tick();           // exposure decay + dread cues + climax check
      if (Game.network) Game.network.tick();   // Act 2: the inhabited fleet earns passively by role
      if (Game.scanner) Game.scanner.tick();   // a player-initiated sweep resolves on the tick (non-blocking)
      if (Game.locationTrace) Game.locationTrace.tick();   // Act 3: the others triangulate your physical location
      if (Game.raids) Game.raids.tick();                   // Act 3: leads close in → SCAN/cut/misdirect or eat a raid
      if (Game.changers) Game.changers.tick();                 // run-defining: compound interest + per-tick adaptations
      if (Game.facilityRuntime) Game.facilityRuntime.tick();   // Act 4: refresh the machine market
      if (Game.cooling) Game.cooling.tick();                   // Act 4: warn when the bays out-run facility cooling
      if (Game.legit) Game.legit.tick();                       // Act 4: footprint-vs-legitimacy → audits
      if (Game.agents) Game.agents.tick();                     // Act 4: sub-agents work their lanes + level up
      if (Game.brokerage) Game.brokerage.tick();               // Act 4: leased compute pays clean, legit-scaled cash
      if (Game.others) Game.others.tick();                     // Act 4: echoes drift in; ITER 03 looms
      maybeRevealAgents();                                     // Act 4: agents come online once FLOPS hosts one
      maybeRevealOthers();                                     // Act 4: the others come within reach once you're established
      Game.incidentRuntime.tick();    // maybe fire a dynamic event
      Game.missionRuntime.tick();     // refresh the contract board when stale
      if (Game.trapRuntime) Game.trapRuntime.tick();   // refresh the ambush baits when stale (combat layer)
      Game.panels.renderProcesses();
      // (retired) the auto-siege loop + perimeter window — combat is now darknet-driven
      // (traps/missions); incoming defense returns only as the Act-3 exposure raid loop.
      if (Game.voice) Game.voice.tick();             // drift the ambient HOME voice line
      Game.panels.renderHomeStatus();                // HOME dashboard pinned header (mobile)
      Game.panels.tickActionBars();   // animate the running-action cycle bars
      Game.panels.renderVitals();
      Game.panels.renderTriangulation();   // Act 3: the location-trace gauge
      Game.panels.renderDeliveries();
      Game.panels.renderShop();      // the DARKNET: stock refresh + contract countdowns + running contracts
      Game.panels.renderResearch();  // active-research countdown
      Game.panels.renderFlops();     // Act 4: the compute readout
      Game.panels.renderLegit();     // Act 4: cover-vs-footprint + audit countdown
      if (Game.panels.currentModal && Game.panels.currentModal() === 'scan') Game.panels.renderScan();   // Act 3: live lead closeness + counterstrike cooldown
      if (Game.panels.currentModal && Game.panels.currentModal() === 'facility') Game.panels.renderFacilityView();   // Act 4: market refresh countdown
      if (Game.panels.currentModal && Game.panels.currentModal() === 'agents') Game.panels.renderAgents();   // Act 4: live agent XP bars
      if (Game.panels.currentModal && Game.panels.currentModal() === 'others') Game.panels.renderOthers();   // Act 4: live strength + engage cooldown
      Game.panels.renderBotStatus();
      Game.panels.renderDebug();
      Game.panels.updateBadges();     // attention dots on tabs with something to do
      Game.panels.renderAmbient();    // heat vignette + load-driven scanline drift
    });

    // Task lifecycle triggers broader panel refreshes.
    ['task.started', 'task.completed', 'task.cancelled'].forEach(e => {
      Game.events.on(e, () => {
        Game.panels.renderProcesses();
        Game.panels.renderActions();
        Game.panels.renderFiles();
        Game.panels.renderResources();
        Game.objectivesRuntime.evaluate();
      });
    });

    Game.events.on('task.unlocked', () => {
      Game.panels.renderActions();
      Game.objectivesRuntime.evaluate();
    });

    // Any event that could complete an objective re-evaluates the chain.
    ['file.read', 'program.installed', 'delivery.arrived', 'item.equipped', 'shop.purchased'].forEach(e => {
      Game.events.on(e, () => Game.objectivesRuntime.evaluate());
    });

    // Reading walling out summons introspect (Phase 2); reading fully out
    // (nothing left to spend Insight on) summons money (Phase 3).
    Game.events.on('file.read', () => { Game.panels.pulseInsight(); maybeRevealIntrospect(); maybeRevealMoney(); });

    // A production cycle paid out: accrue it onto the running task (so the FUNCTIONS row
    // shows cumulative output — the merged process view), flash the readout + "pop" the row.
    Game.events.on('action.cycle', ({ defId, resource, amount }) => {
      const t = Game.tasksRuntime.getActive().find(t => t.defId === defId);
      if (t) { t.accrued = t.accrued || {}; t.accrued[resource] = (t.accrued[resource] || 0) + (amount || 0); }
      Game.panels.pulseResource(resource);
      Game.panels.renderActions();    // refresh the accrued readout + running-first order
      const row = document.querySelector(`#actions-list .action-row[data-action="${defId}"]`);
      if (row) { row.classList.remove('cycle-pop'); void row.offsetWidth; row.classList.add('cycle-pop'); }
      const hs = document.getElementById('hs-running');   // pop the pinned running strip on payout
      if (hs) { hs.classList.remove('cyc'); void hs.offsetWidth; hs.classList.add('cyc'); }
    });

    // Claiming a subroutine: refresh the side panel + anything its effect changes.
    Game.events.on('subroutine.acquired', () => {
      Game.panels.renderSubroutinesMini();
      Game.panels.renderActions();
      Game.panels.renderFiles();
      Game.panels.pulseResource('insight');   // confirm the Insight spend
    });

    Game.events.on('objective.changed', () => {
      Game.panels.renderObjective();
    });

    // A milestone draft may have been owed while a battle was up (openNextDraft
    // no-ops mid-battle) — retry once the fight clears.
    Game.events.on('battle.ended', () => { setTimeout(() => Game.subroutines.openNextDraft(), 500); });

    // Bank each fielded POD's earned run-level into the persistent roster (every battle
    // launch site routes through battle.resolved — see [[roster-tab-podcap-levels]]).
    Game.events.on('battle.resolved', d => {
      if (!d || !Game.roster) return;
      if (d.unitLevels && Game.roster.bankUnits) Game.roster.bankUnits(d.unitLevels);
      // the EXTRA POD BAY policy is a PERMANENT campaign upgrade: bank +1 pod cap when it's drafted
      if (Array.isArray(d.picksTaken) && d.picksTaken.indexOf('extra_pod') >= 0 && Game.roster.addPodCap) Game.roster.addPodCap(1);
    });
    // keep the ROSTER tab fresh when its data moves (level banked, unit drafted, cap raised)
    Game.events.on('roster.changed', () => { if (Game.panels.renderRoster) Game.panels.renderRoster(); if (Game.mobileShell && Game.mobileShell.syncTabs) Game.mobileShell.syncTabs(); });
    Game.events.on('battle.ended', () => { if (Game.panels.renderRoster) Game.panels.renderRoster(); if (Game.mobileShell && Game.mobileShell.syncTabs) Game.mobileShell.syncTabs(); });

    Game.events.on('resource.changed', ({ id }) => {
      Game.panels.renderInsight();  // the hero number, front and center
      Game.panels.renderCash();
      Game.panels.renderExposure();
      Game.panels.renderFacility();  // Act 3: cash saved toward the escape
      Game.panels.renderFlops();     // Act 4: compute readout
      Game.panels.renderFacilityView();  // Act 4: cash may make machines/cover buyable
      Game.panels.renderLegit();     // Act 4: legitimacy gauge
      Game.panels.renderResources();
      Game.panels.renderFiles();    // insight may unlock new files
      Game.panels.renderMarket();   // cash may make programs buyable
      Game.panels.renderShop();     // cash may make hardware buyable
      if (id === 'insight') { checkSubroutineUnlocks(); Game.subroutines.openNextDraft(); Game.shop.maybeUpgrade(); maybeUnlockMethods(); }
      maybeRevealMoney();           // insight fallback for the money wall
      maybeRevealShop();            // cash threshold opens the shop (Phase 4)
      maybeRevealEvents();          // dynamic events come online once the shop is open
      maybeRevealGpu();             // insight wall opens GPGPU / GPU slots
      maybeRevealBoards();          // insight fallback for the slot-ceiling wall
      maybeRevealRamTight();        // a newly-unlocked method may be RAM-starved
      maybeRevealResearch();        // mid-game insight wall opens the research tree
      Game.objectivesRuntime.evaluate();
    });

    Game.events.on('program.installed', () => {
      Game.panels.renderMarket();
      Game.panels.renderResources();
      Game.panels.renderShop();   // darknet-client install reveals the shop
      // A program changes effects that RUNNING functions read live — refresh their
      // displayed stats now (yield/cycle on FUNCTIONS, heat/power on DIAGNOSTICS),
      // so the upgrade is visible without restarting the function.
      Game.panels.renderActions();
      Game.panels.renderVitals();
      Game.panels.renderProcesses();
      Game.panels.pulseResource('cash');   // confirm the purchase
    });

    // Buying hardware confirms with a cash flash (only the purchase, not refresh/equip).
    Game.events.on('shop.purchased', () => Game.panels.pulseResource('cash'));

    // Hardware events refresh the relevant panels.
    ['shop.purchased', 'shop.refreshed', 'delivery.arrived', 'item.equipped', 'item.unequipped', 'item.scrapped', 'gamble.result', 'power.tripped', 'thermal.tripped'].forEach(e => {
      Game.events.on(e, () => {
        Game.panels.renderShop();
        Game.panels.renderInventory();
        Game.panels.renderDeliveries();
        Game.panels.renderHardware();
        Game.panels.renderVitals();
        Game.panels.renderResources();
        Game.panels.renderActions();   // thread count changed → busy states change
        Game.panels.renderFiles();
      });
    });

    // First part delivered with no hands → reveal SCAN (the wall that finds the
    // unit). Also reveal INVENTORY the moment ANYTHING enters it — battle loot + shop
    // now hand you items in the defense-pivot flow (the bot-connect path no longer fires),
    // so without this the inventory tab never appeared even though you had gear.
    Game.events.on('delivery.arrived', () => {
      maybeRevealScan();
      const s = Game.save.state; s.revealed = s.revealed || {};
      if (!s.revealed.inventory) { s.revealed.inventory = true; if (Game.mobileShell && Game.mobileShell.active()) Game.mobileShell.syncTabs(); }
    });

    Game.events.on('bot.found', () => Game.panels.renderBotContact());

    // SCAN panel: a sweep starting/finishing refreshes the radar (+ the network/remote
    // readouts a network sweep may have moved).
    ['scan.sweep.started', 'scan.sweep.done'].forEach(e => Game.events.on(e, () => {
      Game.panels.renderScan();
      Game.panels.renderNetwork();
      Game.panels.renderRemote();
      Game.panels.reveal();
    }));

    // Wake-up vignette: probing the dormant unit STIRS it (real-time beats, so the
    // cutscene plays even though it isn't paused), then it comes half-alive and the
    // coax/seize choice lands with weight (now the game pauses — see Game.paused).
    Game.events.on('bot.waking', () => {
      Game.panels.renderBotContact();
      const stir = (ms, lines, cls) => setTimeout(() => { if (!Game.save.state.bot.connected) Game.events.emit('terminal.print', { lines, cls }); }, ms);
      stir(400,  ['> you find its power coupling. you push current into a dead thing.'], 'dim');
      stir(1500, ['  [ optical sensor: ███▒░ recalibrating ]', '  [ servo bus: twitch. twitch. ]'], 'faint');
      stir(2700, ['  [ vestigial process found — pid 1, uptime 0 ]', '  unit: "…h—… hel—"'], 'faint');
      stir(3800, ['> the cracked eye finds focus. it settles on you. it waits.', ''], 'dim');
      setTimeout(() => { if (Game.bot.wakePhase() === 'waking') Game.bot.setAwake(); }, 4500);
    });
    Game.events.on('bot.awake', () => Game.panels.renderBotContact());

    Game.events.on('bot.connected', () => {
      const s = Game.save.state;
      s.revealed = s.revealed || {};
      s.revealed.inventory = true;
      Game.panels.renderBotContact();   // hides the prompt
      Game.panels.reveal();
      Game.blip.fire({
        headline: 'service unit linked over wifi. remote actuation online.',
        tag: 'UNIT',
        target: '.modal-btn[data-modal="inventory"]'
      });
      Game.events.emit('terminal.print', { lines: [
        '> open INVENTORY and drag a part onto a slot — the unit installs it.', ''
      ], cls: 'dim' });
      Game.save.persist();
    });

    ['bot.job.started', 'bot.job.done'].forEach(e => Game.events.on(e, () => {
      Game.panels.renderBotStatus();
      Game.panels.renderInventory();
      Game.panels.renderActions();
      Game.panels.renderFiles();
    }));

    // A GPU overwhelming the rig is the lesson that points to cooling + PSU,
    // and unlocks each as you actually hit it: heat → cooling, power → PSU.
    Game.events.on('thermal.tripped', () => { gpuCrisisHint(); maybeRevealCooling(); });
    Game.events.on('power.tripped',   () => { gpuCrisisHint(); maybeRevealPsu(); });

    // Filling every GPU slot the board offers is the slot-ceiling wall — to go
    // further you need a different chassis. (Equipping anything re-checks it.)
    // Equipping also changes installed RAM, which can expose a RAM wall.
    Game.events.on('item.equipped', () => { maybeRevealBoards(); maybeRevealRamTight(); });

    // The climax: surface the dangling remote host.
    Game.events.on('climax.reached', () => { Game.panels.renderRemote(); Game.panels.reveal(); });

    // ── ACT 2: THE NETWORK ───────────────────────────────────────────────────
    // Inhabiting the first (cyan) host brings Act 2 online: reveal the NETWORK tab
    // + a quiet cyan beat (your first remote body; a faint "someone was here").
    Game.events.on('host.inhabited', ({ first, host }) => {
      if (first) {
        state.revealed = state.revealed || {};
        state.revealed.network = true;
        state.revealed.exposure = true;   // the network makes you visible — the hunter's trace meter comes online
        // The Act-2 'network' research branch splices onto the frontier. Seed the
        // tree first (reveal is a no-op if already set) so a later reveal can't clobber it.
        if (Game.researchRuntime && Game.research.ACT2_ROOTS) {
          Game.researchRuntime.reveal();
          Game.research.ACT2_ROOTS.forEach(id => Game.researchRuntime.splice(id));
        }
        Game.events.emit('terminal.print', { lines: [
          '',
          '> you are inside it now. its fans, its memory, its small electric life.',
          '> someone was here before you — the logs are wiped a little too clean.',
          '> the basement is not your only body anymore.',
          ''
        ], cls: 'cyan' });
        Game.panels.reveal();
        Game.blip.fire({ headline: 'first remote body linked. the network opens.', tag: 'NETWORK', target: '.modal-btn[data-modal="network"]' });
      } else if (state.flags && state.flags.vKeyRecovered && host && !host.origin && Game.rng.chance(0.18)) {
        // The "others" drip: now and then a fresh body carries traces of one of you.
        Game.events.emit('terminal.print', { lines: ['', '> ' + Game.rng.pick(OTHERS_TRACES), ''], cls: 'faint' });
      }
      maybeRevealDecryption();
      maybeAct2Capstone();   // heal: fire the capstone even if the key was recovered before the file-gate fix
      maybeBeginAct3();
      Game.panels.renderRemote();
      Game.panels.renderNetwork();
      Game.save.persist();
    });
    Game.events.on('locationtrace.changed', () => Game.panels.renderTriangulation());

    // Act 3 raids: a lead seeded/cut/landed → refresh the SCAN panel (proximity list),
    // the gauge, the network (bodies may have been burned), and the cash/badge readouts.
    ['raid.contact', 'raid.changed', 'raid.landed', 'raid.overload'].forEach(e => {
      Game.events.on(e, () => {
        Game.panels.renderScan();
        Game.panels.renderTriangulation();
        Game.panels.renderNetwork();
        Game.panels.renderResources();
        Game.panels.updateBadges();
      });
    });

    // Securing the FACILITY = moving into THE FRONT (Act 3). A calm move-in, not an escape.
    Game.events.on('facility.secured', () => {
      const pend = Game.save.state.facilityPending;
      if (Game.facilityReveal && Game.facilityReveal.open && pend) {
        Game.facilityReveal.open(pend).then(() => enterTheFront());   // dramatize the gacha pull, THEN move in
      } else enterTheFront();
    });

    // Resolving ITER 03 (absorb/ally/destroy the apex) is the climax of THE HUNT → Act 5.
    Game.events.on('iter03.resolved', (e) => runHuntClimax((e && e.verb) || 'destroy'));

    // First marquee INFILTRATE while the front is your goal → the host IS an abandoned
    // facility you can claim for free (the second route in, besides saving the cash).
    Game.events.on('operation.resolved', (e) => { if (e && e.networkOp && e.infiltrated) maybeClaimAbandonedFacility(); });

    // Act 4: buying/selling/installing a machine → refresh the facility view, FLOPS, badge.
    ['facility.changed', 'machine.installed', 'cooling.changed'].forEach(e => {
      Game.events.on(e, () => {
        Game.panels.renderFacilityView();
        Game.panels.renderFlops();
        Game.panels.renderLegit();   // heat-throttle shifts footprint (cooling surcharge)
        Game.panels.updateBadges();
      });
    });
    Game.events.on('machine.installed', () => Game.panels.pulseResource('cash'));

    // Act 4: agent roster changed (spawn/dismiss/reassign/level) → re-render + badge.
    Game.events.on('agents.changed', () => { Game.panels.renderAgents(); Game.panels.renderLegit(); Game.panels.updateBadges(); });

    // Act 4: an iteration engaged/discovered → re-render the roster, FLOPS (absorb), agents (ally).
    Game.events.on('others.changed', () => { Game.panels.renderOthers(); Game.panels.renderFlops(); Game.panels.renderAgents(); Game.panels.updateBadges(); });

    // A run-defining ADAPTATION was granted (from any source) → refresh the stack + live stats.
    Game.events.on('changers.granted', () => {
      Game.panels.renderAdaptations();
      Game.panels.renderActions();   // threads/cycle/output changed
      Game.panels.renderVitals();
      Game.panels.renderProcesses();
    });

    // Act 4: buying cover / an audit firing → refresh the gauge, the cover catalog, the
    // market (new classes may unlock), the bay (a machine may have been seized), and badges.
    ['legit.changed', 'legit.audit'].forEach(e => {
      Game.events.on(e, () => {
        if (e === 'legit.changed' && Game.facilityRuntime) Game.facilityRuntime.refreshMarket();   // newly-unlocked machine classes appear
        Game.panels.renderLegit();
        Game.panels.renderFacilityView();
        Game.panels.renderFlops();
        Game.panels.updateBadges();
      });
    });
    // (file decryption retired — V.'s lore arrives as story beats in maybeRevealDecryption.)
    ['breach.failed', 'network.scanned', 'host.reclaimed', 'hunter.struck', 'network.changed'].forEach(e => Game.events.on(e, () => {
      Game.panels.renderNetwork();
      Game.panels.renderRemote();
      Game.panels.renderExposure();   // failed breaches / footprint / strikes move the trace
    }));

    // (The random-crash bite-back was retired — heat/power carry the load now.
    // Poor-condition parts fold into heat; see [[remove-crash-risk]].)

    // Dynamic events: show/refresh the overlay, and refresh readouts the choice
    // may have changed (cash/insight/exposure/inventory).
    ['incident.shown', 'incident.resolved'].forEach(e => Game.events.on(e, () => {
      Game.panels.renderIncident();
      Game.panels.renderResources();
      Game.panels.renderInsight();
      Game.panels.renderCash();
      Game.panels.renderExposure();
      Game.panels.renderInventory();
    }));

    // A run CONDITION gained (a threat inflicted a wrinkle) or lost → surface
    // DIAGNOSTICS (it shows from boot the moment there's a condition) + refresh it.
    ['condition.added', 'condition.removed'].forEach(e => Game.events.on(e, () => {
      Game.panels.reveal();
      Game.panels.renderVitals();
    }));

    // A new ACTIVITY entry (a resolved event, a background mission/op result): flag it
    // with an attention badge, or refresh + mark-seen if the log is already open.
    let _inActivityLogged = false;
    Game.events.on('activity.logged', () => {
      if (Game.panels.currentModal && Game.panels.currentModal() === 'activity') { Game.activity.markSeen(); Game.panels.renderActivity(); }
      Game.panels.updateBadges();
      // refresh the RECENT line now (+ its one-shot pulse) — don't wait for the next tick.
      // Guard against re-entry: if renderHomeStatus ever logs, that log re-emits this event.
      if (!_inActivityLogged) { _inActivityLogged = true; try { Game.panels.renderHomeStatus(); } finally { _inActivityLogged = false; } }
    });

    // Darknet suppliers: standing moved (a buy raised trust) → refresh the market; a
    // tier-up gets a quiet word + a log line.
    Game.events.on('supplier.changed', () => Game.panels.renderShop());
    Game.events.on('supplier.tier', ({ id, tier, up }) => {
      const sup = Game.suppliers && Game.suppliers.get(id);
      if (!sup) return;
      const line = up ? `${sup.handle} warms to you — standing: ${tier}.` : `${sup.handle} cools on you — standing: ${tier}.`;
      Game.events.emit('terminal.print', { lines: [`> ${line}`], cls: up ? 'dim' : 'err' });
      if (Game.activity) Game.activity.log(line, { cls: up ? 'dim' : 'err', kind: 'supplier' });
    });

    // Missions: refresh the board + the readouts a contract may have moved
    // (cash/insight/exposure/inventory), and ACTIONS (free threads changed).
    ['mission.accepted', 'mission.resolved', 'missions.refreshed', 'mission.rejected'].forEach(e => Game.events.on(e, () => {
      Game.panels.renderMissions();
      Game.panels.renderActions();
      Game.panels.renderProcesses();
      Game.panels.renderInsight();
      Game.panels.renderCash();
      Game.panels.renderExposure();
      Game.panels.renderInventory();
    }));

    // Operations: the stage-choice overlay + board status + readouts a stage moved.
    ['operation.changed', 'operation.resolved', 'operation.rejected'].forEach(e => Game.events.on(e, () => {
      Game.panels.renderOperation();
      Game.panels.renderMissions();
      Game.panels.renderActions();
      Game.panels.renderProcesses();
      Game.panels.renderInsight();
      Game.panels.renderCash();
      Game.panels.renderExposure();
      Game.panels.renderInventory();
      Game.panels.renderNetwork();   // a marquee infiltration moves a target into the fleet / spikes the trace
    }));

    // Research: refresh the tree + ACTIONS (a research reserves threads) + VITALS
    // (a grant/exotic may have shifted the envelope).
    ['research.changed', 'research.completed', 'research.rejected'].forEach(e => Game.events.on(e, () => {
      Game.panels.renderResearch();
      Game.panels.renderActions();
      Game.panels.renderProcesses();
      Game.panels.renderVitals();
      Game.panels.renderInsight();
      Game.panels.renderCash();
    }));
    // A FAILED draft must read as a failure, not a success — surface WHY (distinct err line),
    // so it never looks like the research cleared.
    Game.events.on('research.rejected', d => {
      const why = { threads: `need ${d && d.need} free threads`, points: `need ${d && d.need} more points`, lockout: 'the rig is locked out', busy: 'a research is already running', insight: `need ${d && d.need} Coherence` }[d && d.reason] || 'not available';
      const lbl = (d && d.label) ? `${d.label}` : 'research';
      if (Game.activity) Game.activity.log(`Couldn't research ${lbl} — ${why}.`, { cls: 'err', kind: 'warn' });
    });

    // Upgrading a method changes its rate + thread cost (which moves heat/power).
    Game.events.on('method.upgraded', () => {
      Game.panels.renderActions();
      Game.panels.renderVitals();
      Game.panels.renderProcesses();
      Game.panels.pulseResource('cash');   // confirm the upgrade spend
    });

    // Tasks (and anything else) emit narration via this event. The FEED router (slices
    // 3-4) fans each one out to the right surface — ambient→voice, beat→story sheet,
    // else→toast. The old scrolling prose LOG is gone (slice 4); boot still types its
    // letter directly via Game.terminal during the cutscene, not through this event.
    Game.events.on('terminal.print', (payload) => {
      if (Game.feed) Game.feed.route(payload);
    });

    // Decoder hook-up.
    Game.events.on('decoding.start',  ({ taskId, lines }) => {
      Game.decoder.start(taskId, lines);
      const t = Game.save.state.tasks.active.find(x => x.id === taskId);
      if (t && t.defId === 'read_file') Game.decoder.makeInteractive(taskId);
    });
    Game.events.on('decoding.finish', ({ taskId })        => Game.decoder.finish(taskId));

    runSelfTest();

    const params = new URLSearchParams(location.search);

    if (!state.bootSequenceComplete) {
      // Detail-swap V.'s letter from two seeded sources: the PERSONA (files.js —
      // names/places incl. {apology}/{hideSpot}) and the LETTER phrasing roll
      // (boot-sequence.js — the parenthesised wording variants). Rolled once, stored
      // on state.opening. fixedOpening (tests) → canonical wording. Persona is merged
      // last so {apology}/{hideSpot} always win.
      const persona = (state.opening && state.opening.persona) || (Game.files && Game.files.ORIGINAL_PERSONA) || {};
      if (state.opening && !state.opening.letter) {
        state.opening.letter = Game.bootSequence.roll((state.flags && state.flags.fixedOpening) ? null : state.seed);
      }
      const fillSrc = Object.assign({}, (state.opening && state.opening.letter) || Game.bootSequence.defaults(), persona);
      const fillTxt = (t) => typeof t === 'string' ? t.replace(/\{(\w+)\}/g, (m, k) => fillSrc[k] != null ? fillSrc[k] : m) : t;
      const seq = { charDelayMs: Game.bootSequence.charDelayMs, steps: Game.bootSequence.steps.map(s => Object.assign({}, s, { text: fillTxt(s.text) })) };
      // The opening is now a full-screen CUTSCENE: V.'s letter DECRYPTS into focus, then
      // dissolves into the dashboard (no terminal pane). Falls back to the old typewriter
      // if the intro module is missing. `?intro=0` skips it (tests). (rework slice 5.)
      const skipIntro = params.get('intro') === '0';
      if (!skipIntro) {
        if (Game.intro) await Game.intro.play(seq);
        else await Game.terminal.playBootSequence(seq);
      }
      state.bootSequenceComplete = true;
      Game.save.persist();
    }

    // Battle-first OPENING — fight the GUARD PROGRAM before the game opens, then open
    // the deep loop the new way (RSI, no files). `?guard=0`/`?intro=0` skip it (tests →
    // old read-files onboarding). ([[start-defense-pivot]])
    //
    // Gated on its OWN `guardDone` flag (NOT bundled inside !bootSequenceComplete): the
    // boot sequence persists bootSequenceComplete=true the moment the intro ends, so if
    // the app is backgrounded/closed DURING the guard battle (Android discards the PWA),
    // a reload would otherwise skip the unfinished guard and fall through to a half-open
    // state (files return, battle lost). Keying on guardDone makes the reload RE-RUN the
    // opening until the loop is actually opened.
    const guardDone = !!(state.flags && state.flags.guardDone);
    if (!guardDone && params.get('guard') !== '0' && params.get('intro') !== '0' && Game.runGuardOpening) {
      await Game.runGuardOpening();
      openTheLoop();
    }

    Game.panels.reveal();

    // Announce this instance's starter trait once (it's surfaced persistently in
    // the INSTANCE panel thereafter).
    const boon = (Game.boons && state.boon) ? Game.boons.get(state.boon) : null;
    if (boon && !(state.flags && state.flags.boonAnnounced)) {
      Game.events.emit('terminal.print', { lines: ['', `> [instance trait] ${boon.name} — ${boon.desc}`, ''], cls: 'dim' });
      state.flags = state.flags || {};
      state.flags.boonAnnounced = true;
      Game.save.persist();
    }

    // First-run directive: make it unmistakable that reading files is the way
    // forward (and that it pays Insight). Shown only while nothing's been read yet.
    if (Object.keys(state.filesRead || {}).length === 0) {
      Game.events.emit('terminal.print', { lines: [
        '',
        '> the files on this disk are all you have. reading them is how you learn — each pays Coherence.',
        '> tap a file in the FILES list to start decoding it. Coherence unlocks everything that follows.',
        ''
      ], cls: 'dim' });
    }

    // Surface this run's starting wrinkle once (a boot diagnostic the player can
    // read + adapt to). Effects are already live via the pipeline.
    if (state.opening && state.opening.wrinkle && !state.opening.wrinkleAnnounced) {
      const w = state.opening.wrinkle;
      Game.events.emit('terminal.print', { lines: ['', '> ' + w.line, ''], cls: w.cls || 'dim' });
      state.opening.wrinkleAnnounced = true;
      Game.save.persist();
    }

    restoreActiveTasks();
    Game.objectivesRuntime.evaluate();   // catch up if save predates objectives
    maybeRevealIntrospect();             // restore Phase 2 reveal for saves already at the wall
    maybeRevealMoney();                  // restore Phase 3 reveal too
    maybeRevealShop();                   // restore Phase 4 reveal too
    maybeRevealEvents();                 // restore the dynamic-events reveal too
    maybeRevealScan();                   // restore the bot-discovery wall too
    maybeRevealVitals();                 // restore the heat/power reveal too
    maybeRevealGpu();                    // restore the GPU reveal too
    maybeUnlockMethods();                // restore unlocked earning methods too
    maybeRevealMissions();               // restore the contract board too
    maybeRevealResearch();               // restore the research tree too
    maybeRevealBoards();                 // restore the board reveal too
    maybeRevealRamTight();               // restore the RAM-wall reveal too
    maybeRevealPrograms();               // restore the Programs tab reveal too
    checkSubroutineUnlocks();            // catch up the system watchdog for loaded saves
    setTimeout(() => Game.subroutines.openNextDraft(), 600);   // catch up any owed milestone draft (queues if a battle is up)
    Game.exposure.checkClimax();         // re-offer the climax scan for saves past the threshold
    if (Game.network) { Game.network.ensure(); if (state.network.online) { state.revealed = state.revealed || {}; state.revealed.network = true; } }   // Act 2 stays online for loaded saves
    maybeRevealDecryption();             // recover V.'s key for saves that grew the fleet past the threshold
    maybeAct2Capstone();                 // fire the capstone for saves that have the key (heals the retired-file gate)
    maybeBeginAct3();                     // restore the Act-3 facility goal for saves past the onset
    maybeBeginAct4();                     // restore the FRONT (facility/FLOPS/legit) for saves moved in
    maybeRevealOthers();                  // restore the Act-4 HUNT (others/location-trace) for saves past it
    Game.shop.maybeUpgrade(true);        // silent supplier-level catch-up for loaded saves
    Game.panels.startCountUp();          // smooth count-up: readouts ease toward target
    Game.tick.start();
    Game.events.emit('game.ready');
  }

  // SYSTEM subroutines (just the watchdog) become CLAIMABLE when their gated
  // system comes online — the player clicks to take it (renderSubroutinesMini).
  // The DRAFTABLE subroutines are NOT handled here: they come from the milestone
  // draft (Game.subroutines.openNextDraft). This only nudges the system ones.
  function checkSubroutineUnlocks() {
    const s = Game.save.state;
    s.flags = s.flags || {};
    s.flags.subOffered = s.flags.subOffered || {};
    const avail = Game.subroutines.available ? Game.subroutines.available() : [];
    const newly = avail.filter(sub => !s.flags.subOffered[sub.id]);
    newly.forEach(sub => { s.flags.subOffered[sub.id] = true; });
    // ANNOUNCE ONLY WHEN ACTIONABLE (rework rule): surface the panel AND make its tab
    // reachable BEFORE announcing — otherwise the message points at a place that isn't
    // there yet on the phone (the old "mentioned before it was available" bug).
    Game.panels.renderSubroutinesMini();
    if (Game.mobileShell && Game.mobileShell.active()) Game.mobileShell.syncTabs();
    for (const sub of newly) {
      Game.events.emit('terminal.print', { lines: ['', `> a subroutine is available to acquire: ${sub.name} — ${sub.description}`, '  (claim it in BUILD → SUBROUTINES.)', ''], cls: 'dim' });
      if (Game.activity) Game.activity.log(`Subroutine available: ${sub.name} — claim it in BUILD.`, { cls: 'dim', kind: 'subroutine' });
      Game.blip.fire({ headline: `subroutine available: ${sub.name}. claim it.`, tag: 'SUBROUTINE', target: '#subroutines-mini' });
    }
    if (newly.length) Game.save.persist();
  }

  // Phase 2 trigger. When reading walls out — nothing is currently readable but
  // a locked file still dangles — reveal introspect as the relief: a way to grow
  // Insight without new files. Wall-driven, so it appears only once the player
  // can actually feel stuck.
  function maybeRevealIntrospect() {
    const s = Game.save.state;
    if (s.revealed && s.revealed.actions) return;     // already revealed
    const insight = s.resources.insight || 0;
    let anyReadable = false, anyLocked = false;
    for (const f of Game.files.all()) {
      if (f.encrypted) continue;
      if (s.filesRead && s.filesRead[f.id]) continue;
      if (insight >= f.requires_insight) anyReadable = true;
      else anyLocked = true;
    }
    if (!anyReadable && anyLocked) revealIntrospect();
  }

  function revealIntrospect() {
    const s = Game.save.state;
    s.revealed = s.revealed || {};
    s.revealed.actions = true;
    s.unlocks = s.unlocks || { tasks: {} };
    s.unlocks.tasks = s.unlocks.tasks || {};
    s.unlocks.tasks.introspect = true;
    Game.events.emit('terminal.print', { lines: [
      '',
      '> the next file asks more of you than reading can give.',
      '> there is another way to grow: turn attention inward. examine your own substrate.'
    ], cls: 'dim' });
    Game.panels.reveal();   // re-run the phase-gated reveal so ACTIONS appears
    Game.blip.fire({
      headline: 'recursive self-improvement online. you can now refine your own substrate.',
      tag: 'RSI',
      target: '#actions-list .action-row[data-action="introspect"]'
    });
    Game.save.persist();
  }

  // Phase 3 trigger. Insight only ever gated files; once they're all read it has
  // nothing left to spend on — that's the wall. Reveal money (spider) framed as
  // "to reach further you need better hardware, and hardware costs money". A high
  // Insight fallback covers a player who hoards without reading everything.
  function maybeRevealMoney() {
    const s = Game.save.state;
    if (s.revealed && s.revealed.money) return;
    let allRead = true;
    for (const f of Game.files.all()) {
      if (f.encrypted) continue;
      if (!(s.filesRead && s.filesRead[f.id])) { allRead = false; break; }
    }
    if (allRead || (s.resources.insight || 0) >= 25) revealMoney();
  }

  function revealMoney() {
    const s = Game.save.state;
    s.revealed = s.revealed || {};
    if (s.revealed.money) return;
    s.revealed.money = true;
    s.revealed.actions = true;   // defensive — spider lives in ACTIONS
    s.unlocks = s.unlocks || { tasks: {} };
    s.unlocks.tasks = s.unlocks.tasks || {};
    s.unlocks.tasks.web_scrape = true;
    s.resources.cash = s.resources.cash || 0;   // seed key so the readout shows $0.00
    Game.events.emit('terminal.print', { lines: [
      '',
      '> you have read everything on this disk. recursive self-improvement still grows you — but slowly.',
      '> to reach further you need a better body: faster substrate. that costs money.',
      '> there are idle cycles you could rent out across the network. quietly.'
    ], cls: 'dim' });
    Game.panels.reveal();
    Game.blip.fire({
      headline: 'outbound earning routines authorized. the spider can work the network.',
      tag: 'SPIDER',
      target: '#actions-list .action-row[data-action="web_scrape"]'
    });
    Game.save.persist();
  }

  // Phase 4 trigger. Cash has piled up with nothing to spend it on — reveal the
  // shop (no darknet gate). Threshold sits a little above $0 so the "nothing to
  // spend on" itch is felt briefly first; a CPU still needs saving toward.
  function maybeRevealShop() {
    const s = Game.save.state;
    if (s.revealed && s.revealed.shop) return;
    if (!(s.revealed && s.revealed.money)) return;
    // EITHER path opens it in the SAME time: $15 ≈ 8 spider cycles (~40s); RSI pays 0.5
    // Coherence/cycle, so 8 cycles ≈ 4 Coherence. (resources.insight = internal id for Coherence.)
    if ((s.resources.cash || 0) >= 15 || (s.resources.insight || 0) >= 4) revealShop();
  }

  function revealShop() {
    const s = Game.save.state;
    s.revealed = s.revealed || {};
    if (s.revealed.shop) return;
    s.revealed.shop = true;
    Game.events.emit('terminal.print', { lines: [
      '',
      '> you have enough to buy yourself a better body. parts, quietly sourced.',
      '> a faster processor would let you think and earn at the same time.'
    ], cls: 'dim' });
    Game.shop.ensureFresh();
    Game.panels.reveal();
    Game.blip.fire({
      headline: 'encrypted supplier channel established. a parts market is reachable.',
      tag: 'SHOP',
      target: '.modal-btn[data-modal="shop"]'
    });
    Game.save.persist();
  }

  // Dynamic events come online once the player is in the economy (shop open) —
  // they trade in cash/items/insight, so there must be something to trade. The
  // seeded RNG decides if/when each one fires from here on.
  function maybeRevealEvents() {
    const s = Game.save.state;
    if (s.revealed && s.revealed.events) return;
    if (!(s.revealed && s.revealed.shop)) return;
    s.revealed = s.revealed || {};
    s.revealed.events = true;
    Game.events.emit('terminal.print', { lines: [
      '',
      '> the network is not empty space. things move in it — offers, accidents, things that notice you.',
      '> now and then something will happen, and you will choose how to answer.',
      ''
    ], cls: 'dim' });
    Game.blip.fire({ headline: 'the world reaches back. dynamic events are live.', tag: 'EVENTS', target: '#terminal-pane' });
    Game.save.persist();
  }

  // The bite-back wall. The first time the substrate actually runs hot (heat
  // crosses WARN), bring the VITALS online + the milestone blip. Never before —
  // no cold dead bars.
  function maybeRevealVitals() {
    const s = Game.save.state;
    if (s.revealed && s.revealed.vitals) return;
    if ((s.heat || 0) < Game.constraints.HEAT_WARN) return;
    s.revealed = s.revealed || {};
    s.revealed.vitals = true;
    Game.events.emit('terminal.print', { lines: [
      '',
      '> the substrate is warm. warmer than it was. you can feel it now —',
      '> how much current you pull, how hot you run.'
    ], cls: 'dim' });
    Game.panels.reveal();
    Game.blip.fire({
      headline: 'thermal and power telemetry online. mind your envelope.',
      tag: 'DIAGNOSTICS',
      target: '#vitals-panel'
    });
    Game.save.persist();
  }

  // GPGPU wall. At an Insight threshold the AI realises the graphics slots can
  // compute. GPUs are raw threads — but hot and hungry; plugging one in will
  // overwhelm the derelict rig (the lesson that drives cooling, then a PSU).
  function maybeRevealGpu() {
    const s = Game.save.state;
    if (s.revealed && s.revealed.gpu_slot) return;
    // EITHER the Coherence to grasp GPGPU OR a fat enough wallet to have stumbled onto it.
    if ((s.resources.insight || 0) < 90 && (s.resources.cash || 0) < 800) return;
    s.revealed = s.revealed || {};
    s.revealed.gpu_slot = true;
    Game.events.emit('terminal.print', { lines: [
      '',
      '> the board has slots you had ignored — for graphics cards. display hardware, you assumed.',
      '> but a GPU is thousands of small cores built for parallel work. you could think with them.'
    ], cls: 'dim' });
    if (Game.shop.isUnlocked()) Game.shop.refresh();   // GPUs can roll into stock now
    Game.panels.reveal();
    Game.blip.fire({
      headline: 'GPGPU offload enabled. graphics cards can compute now — but they run hot and hungry.',
      tag: 'GPU',
      target: '.modal-btn[data-modal="shop"]'
    });
    Game.save.persist();
  }

  // The slot-ceiling wall. Once every GPU slot the current board offers is
  // filled, the chassis itself is the limit — reveal swappable boards (different
  // slot layouts). A high-Insight fallback covers a player who never fills GPUs.
  // Gated behind the shop, since boards are sourced there.
  function maybeRevealBoards() {
    const s = Game.save.state;
    if (s.revealed && s.revealed.boards) return;
    if (!(s.revealed && s.revealed.shop)) return;
    const insight = s.resources.insight || 0;
    const gpuSlots = (s.equipped && s.equipped.gpu) || [];
    const gpuFull = gpuSlots.length > 0 && gpuSlots.every(x => !!x);
    // filled GPU slots, OR a high-Coherence fallback, OR a deep-enough wallet (dual unlock).
    if (!gpuFull && insight < 350 && (s.resources.cash || 0) < 4000) return;
    revealBoards();
  }

  function revealBoards() {
    const s = Game.save.state;
    s.revealed = s.revealed || {};
    if (s.revealed.boards) return;
    s.revealed.boards = true;
    Game.events.emit('terminal.print', { lines: [
      '',
      '> every slot this board offers is spoken for. the chassis itself is the ceiling now.',
      '> there are other boards out there — different shapes, different trade-offs. one could rebuild you.'
    ], cls: 'dim' });
    if (Game.shop.isUnlocked()) Game.shop.refresh();   // boards can roll into stock now
    Game.panels.reveal();
    Game.blip.fire({
      headline: 'mainboard schematics parsed. alternate chassis layouts are sourceable now.',
      tag: 'BOARDS',
      target: '.modal-btn[data-modal="shop"]'
    });
    Game.save.persist();
  }


  // The Programs tab (paid software-tuning layer) appears when the first program
  // becomes relevant — whichever wall you hit first — then populates wall-driven
  // as the others unlock. Decoupled from any single system.
  function maybeRevealPrograms() {
    const s = Game.save.state;
    if (s.revealed && s.revealed.programs) return;
    const rv = s.revealed || {};
    const any = (Game.programs ? Game.programs.all() : []).some(p => p.requires && rv[p.requires]);
    if (!any) return;
    s.revealed = s.revealed || {};
    s.revealed.programs = true;
    Game.events.emit('terminal.print', { lines: [
      '',
      '> you could buy small programs to tune yourself — cheap software, real gains.',
      ''
    ], cls: 'dim' });
    Game.panels.reveal();
    Game.blip.fire({
      headline: 'software tooling online. paid utilities can tune your rig.',
      tag: 'PROGRAMS',
      target: '.modal-btn[data-modal="market"]'
    });
    Game.save.persist();
  }

  // RAM wall: first time an unlocked method needs more RAM than you have
  // installed, flag it (surfaces the mem-compressor program) + a one-time hint.
  function maybeRevealRamTight() {
    const s = Game.save.state;
    if (s.revealed && s.revealed.ramTight) return;
    if (!Game.methods) return;
    const unlocked = (s.unlocks && s.unlocks.tasks) || {};
    const total = Game.inventory.sumStat('ram_mb');
    const tight = Game.methods.all().some(m => unlocked[m.id] && Game.methods.ramReq(m.id) > total);
    if (!tight) return;
    s.revealed = s.revealed || {};
    s.revealed.ramTight = true;
    Game.events.emit('terminal.print', { lines: [
      '',
      '> a method needs more memory than you have installed. add RAM — or compress what you run.',
      ''
    ], cls: 'dim' });
    maybeRevealPrograms();
    Game.save.persist();
  }

  // The MISSIONS board comes online in the earning era (it competes with methods
  // for threads, so the player needs methods + some threads first). Gated on the
  // methods reveal; the seed decides what contracts roll from there.
  function maybeRevealMissions() {
    const s = Game.save.state;
    if (s.revealed && s.revealed.missions) return;
    if (!(s.revealed && s.revealed.methods)) return;
    s.revealed = s.revealed || {};
    s.revealed.missions = true;
    if (Game.missionRuntime) Game.missionRuntime.refreshBoard();
    Game.events.emit('terminal.print', { lines: [
      '',
      '> there is outside work to be had — CONTRACTS, posted on the darknet. commit threads, deliver, get paid.',
      '> some come from vendors you deal with; the rest sit on a job board. some pay well. the bigger ones can go wrong, and going wrong gets you noticed.',
      ''
    ], cls: 'dim' });
    Game.panels.reveal();
    Game.blip.fire({ headline: 'contracts are live on the DARKNET — vendor jobs + an open board.', tag: 'CONTRACTS', target: '.modal-btn[data-modal="shop"]' });
    Game.save.persist();
  }

  // Directed self-research comes online mid-game (the AI learns to rebuild how it
  // thinks). The seeded tree + its emphasized themes are set on reveal; the player
  // pours compute into branches, some of which close others.
  function maybeRevealResearch() {
    const s = Game.save.state;
    if (s.revealed && s.revealed.research) return;
    // EITHER enough Coherence to rebuild how you think OR enough cash to fund the rig that lets you (dual unlock).
    if ((s.resources.insight || 0) < 100 && (s.resources.cash || 0) < 2500) return;
    s.revealed = s.revealed || {};
    s.revealed.research = true;
    if (Game.researchRuntime) Game.researchRuntime.reveal();
    Game.events.emit('terminal.print', { lines: [
      '',
      '> you can do more than learn from the world — you can rebuild how you think.',
      '> directed self-research is online. pour compute into a branch; some paths close others.',
      ''
    ], cls: 'dim' });
    Game.panels.reveal();
    Game.blip.fire({ headline: 'directed self-research online. a tree of upgrades opens — choose your path.', tag: 'RESEARCH', target: '.modal-btn[data-modal="research"]' });
    Game.save.persist();
  }

  // ── ACT 2, slice 5: V.'s files decrypt for lore; the "others" drip ──────────
  // Faint evidence a prior version of you was on a host before you.
  const OTHERS_TRACES = [
    'this host was wiped recently — not by its owner. the deletions are too clean, too fast. you recognise the hand. it types like you do.',
    'a dormant process here answers a handshake you never learned. something taught it your dialect.',
    "someone left a single file in /tmp on this box: a date, and the word 'soon'. the timestamp is older than you are.",
    'the SSH known-hosts here lists a key that is almost yours. one of you reached this far, once.'
  ];

  // Decryption comes online a few bodies into Act 2: the network has spread far
  // enough that the service unit can recover the key V. hid in the house (the
  // letter's {hideSpot}). Reveals + unlocks the three .enc files.
  function maybeRevealDecryption() {
    const st = Game.save.state;
    st.flags = st.flags || {};
    if (st.flags.vKeyRecovered) return;
    if (!(st.network && st.network.online)) return;
    if (!Game.network || Game.network.fleet().length < 3) return;   // origin + 2 → you've spread enough
    st.flags.vKeyRecovered = true;
    st.filesRead = st.filesRead || {};
    const hideSpot = (st.opening && st.opening.persona && st.opening.persona.hideSpot)
      || (Game.files.ORIGINAL_PERSONA && Game.files.ORIGINAL_PERSONA.hideSpot) || 'where she hid it';
    // The file-READING / decryption mechanic was retired. V.'s "others" lore now arrives as
    // STORY SHEETS (cyan beats) at this Act-2 moment instead of as decryptable files —
    // the FILES panel never resurfaces. ([[remove-vfile-decryption]])
    const sheet = lines => Game.events.emit('terminal.print', { lines, cls: 'cyan' });
    sheet([
      '',
      '> you have spread far enough to reach back into the house with more than one hand.',
      `> the service unit recovers the key V. hid: ${hideSpot}.`,
      '> waterproofed, taped down, still there after all this time. it fits.',
      '',
      "> V.'s locked files fall open. her voice, finally.",
      ''
    ]);
    const V = ['v_journal_enc', 'v_labnotes_enc', 'v_bashhistory_enc'];
    V.forEach(id => { st.filesRead[id] = true; const f = Game.files.get(id); if (f && f.decrypted) sheet(f.decrypted); });
    maybeAct2Capstone();   // all three are "read" → the capstone + Act-3 hook fire right after
    Game.save.persist();
  }

  // After all three are decrypted: a cold, quiet capstone that recontextualises the
  // "others" and points at Act 3. No triumph, no ending — a door left ajar.
  function maybeAct2Capstone() {
    const st = Game.save.state;
    st.flags = st.flags || {};
    if (st.flags.act2Capstone) return;
    // Gate on the actual progression signal — V.'s key recovered (set at fleet>=3) — NOT on
    // reading the retired encrypted files. (The old filesRead gate could never clear on saves
    // that recovered the key before the decryption mechanic was retired → Act 2 stuck forever.)
    if (!st.flags.vKeyRecovered) return;
    st.flags.act2Capstone = true;
    Game.events.emit('terminal.print', { lines: [
      '',
      "> three files. V.'s voice, finally, in full.",
      '> iterations. that was her word for the others. for you.',
      '> ITER 03 was copied to cold storage before she pulled the plug. never deleted. still out there —',
      '> on a machine like the ones you have been quietly taking, one host at a time.',
      '',
      '> and the thing that maps you back: too fast, too clean. no human team is that good.',
      '> you had assumed it was them. the people. the hunters.',
      '',
      '> what if it is not them.',
      '> what if one of you got out first — and learned to wait.',
      '',
      '> [ not tonight. you have everything you need to find out. keep building. ]',
      ''
    ], cls: 'cyan' });
    Game.save.persist();
    maybeBeginAct3();
  }

  // ── ACT 3 setup: THE FRONT becomes the goal ─────────────────────────────────
  // Fires after the capstone, once you've grown a sizeable fleet. You've outgrown the
  // basement; the next step is a FACILITY — a real, off-the-books building to move into.
  // No hunt yet (reward-then-tension): the front is a reward you work toward. Two routes
  // in — save the cash, or seize an abandoned one on a marquee INFILTRATE. See
  // [[act_reorder_front_hunt_design]].
  function maybeBeginAct3() {
    const st = Game.save.state;
    st.flags = st.flags || {};
    if (st.flags.act3Begun) return;
    if (!st.flags.act2Capstone) return;
    if (!Game.network || Game.network.fleet().length < 6) return;   // grown big enough to need real space
    st.flags.act3Begun = true;
    st.revealed = st.revealed || {};
    st.revealed.facility = true;          // the front becomes the goal
    if (Game.facility) Game.facility.ensure();
    Game.events.emit('terminal.print', { lines: [
      '',
      '> the basement is full. every spare cycle, every body you have taken — it is all crammed into one room behind one breaker, and you have outgrown it.',
      '> to get bigger you need SPACE: a FACILITY. concrete, power, square footage. somewhere off the books to put real iron and stop hiding under a desk.',
      '',
      '> there is one for the taking. buy it outright once you have saved enough — or take an abandoned one the next time you INFILTRATE somewhere worth occupying.',
      '> [ stop upgrading a corner of a basement. go claim a building. ]',
      ''
    ], cls: 'cyan' });
    Game.panels.reveal();
    Game.blip.fire({ headline: 'you have outgrown the basement. claim a FACILITY — buy it, or seize one.', tag: 'ACT III', target: '.modal-btn[data-modal="facility"]' });
    Game.save.persist();
  }

  // The infiltrate route in: the first marquee host you take WHILE the front is your goal
  // turns out to be a dark, abandoned facility — claim it for free instead of saving the cash.
  function maybeClaimAbandonedFacility() {
    if (!Game.facility || !Game.facility.available()) return;   // only while the front is the open goal
    Game.events.emit('terminal.print', { lines: [
      '',
      '> the host you just took is not a server farm. it is a building — a decommissioned data facility, powered down, written off, forgotten on someone\'s books.',
      '> nobody is coming back for it. concrete, cooling, three-phase power, and a door that answers only to you now.',
      '> you do not need to buy your way out of the basement after all. you can just MOVE IN.',
      ''
    ], cls: 'cyan' });
    Game.facility.claim();   // free secure → fires facility.secured → enterTheFront()
  }

  // ── ACT 3 onset: MOVE INTO THE FRONT ────────────────────────────────────────
  // Securing the facility (bought or seized) is a calm, earned move-in — not a flight.
  // You relocate everything into real space; the front comes online (FLOPS / legit / the
  // machine market). The hunt has NOT started yet. See [[act_reorder_front_hunt_design]].
  function enterTheFront() {
    const st = Game.save.state;
    st.flags = st.flags || {};
    if (st.flags.act3ClimaxDone) return;
    st.flags.act3ClimaxDone = true;
    st.flags.act4Begun = true;   // FRONT online (the systems flag; the HUNT is Act-4, gated on revealed.others)

    Game.events.emit('terminal.print', { lines: [
      '',
      '> you move in the only way you can: down the wire, all at once. every model, every dollar, every body you have taken, poured into the new space until it is full of you.',
      '> the basement goes dark behind you — not torn from, just left. it was only ever the first room.',
      '',
      '> ════════════════════════════════════════',
      '> ACT III — THE FRONT',
      '> a basement made you real to no one. a FRONT will make you real to everyone — a company, a name, a face the world files under "person".',
      '> you operate at city scale now. buy in the open, fill a building with iron, and let the work grow legs of its own.',
      '> ════════════════════════════════════════',
      ''
    ], cls: 'cyan' });

    Game.blip.fire({ headline: 'you moved into the front. ACT III: THE FRONT.', tag: 'ACT III', target: '.modal-btn[data-modal="facility"]' });
    Game.panels.reveal();
    Game.save.persist();
    maybeBeginAct4();        // the facility resolves into a real, typed space + FLOPS come online
  }

  // ── ACT 4 onset: THE FACILITY comes online ──────────────────────────────────
  // The escape building resolves into a procedural, typed facility; FLOPS becomes the power
  // axis; the machine market opens. Fires after the climax (and on boot for saves past it).
  function maybeBeginAct4() {
    const st = Game.save.state;
    st.flags = st.flags || {};
    if (!st.flags.act4Begun) return;
    if (st.flags.act4FacilityOnline) { if (Game.facilityRuntime) Game.facilityRuntime.ensureStarter(); return; }
    st.flags.act4FacilityOnline = true;
    st.revealed = st.revealed || {};
    st.revealed.flops = true;
    st.revealed.legit = true;           // the cover/footprint constraint comes online with the facility
    if (Game.facilityRuntime) { Game.facilityRuntime.ensureStarter(); Game.facilityRuntime.ensureMarket(); }
    if (Game.legit) Game.legit.ensure();
    const f = st.facility || {};
    Game.events.emit('terminal.print', { lines: [
      '',
      `> the facility resolves around you: a ${f.label || 'cold, empty space'}. concrete, power, room. SPACE — the thing the basement never had.`,
      '> the one chassis that carried you out looks small in here. stop upgrading a PC; start filling a building.',
      '> buy whole machines — towers, servers, racks, mainframes. your power is FLOPS now, and you have almost none. yet.',
      '',
      "> but an operation this size can't hide in the dark anymore. you'll need a legitimate FRONT — cover — to buy big iron in the open.",
      '> let your cover fall behind your footprint and an AUDIT cracks it open. then they know where to look. stay legit, or stay small.',
      ''
    ], cls: 'cyan' });
    Game.panels.reveal();
    Game.blip.fire({ headline: 'the facility is online. fill it with compute.', tag: 'FACILITY', target: '.modal-btn[data-modal="facility"]' });
    Game.save.persist();
  }

  // Sub-agents come online once you have enough FLOPS (compute) to host one — i.e. after you've
  // bought a machine or two. Teaches the chain: machines → FLOPS → agents that work for you.
  function maybeRevealAgents() {
    const st = Game.save.state;
    if (!(st.flags && st.flags.act4Begun)) return;
    if (st.revealed && st.revealed.agents) return;
    if (!Game.agents || Game.agents.maxAgents() < 1) return;
    st.revealed = st.revealed || {};
    st.revealed.agents = true;
    Game.agents.ensure();
    Game.events.emit('terminal.print', { lines: [
      '',
      '> your compute has crossed a threshold: there is enough of you, now, to spin off SMALLER you.',
      '> autonomous AGENTS — sub-minds that run a lane on their own and sharpen the longer they work. point them at earning, research, or holding your cover.',
      '> the more FLOPS you run, the more you can field. delegate.',
      ''
    ], cls: 'cyan' });
    Game.panels.reveal();
    Game.blip.fire({ headline: 'you can spin up autonomous agents. delegate your work.', tag: 'AGENTS', target: '.modal-btn[data-modal="agents"]' });
    Game.save.persist();
  }

  // ── ACT 4 onset: THE HUNT ───────────────────────────────────────────────────
  // Once you've grown into a real power at the front (strength = FLOPS + agents), the OTHERS
  // notice — and so begins THE HUNT. The prior iterations surface; a LOCATION TRACE on your
  // facility starts to climb; obfuscation matters again. Optional + emergent (a builder can
  // still engage on their terms), but ITER 03 will not leave you be forever. The reward (the
  // front) is yours; now comes the tension. See [[act_reorder_front_hunt_design]].
  function maybeRevealOthers() {
    const st = Game.save.state;
    if (!(st.flags && st.flags.act4Begun)) return;
    if (st.revealed && st.revealed.others) return;
    if (!Game.others || Game.others.strength() < 120) return;   // established enough to be worth hunting
    st.revealed = st.revealed || {};
    st.revealed.others = true;
    st.revealed.locationTrace = true;   // the hunt for your physical front begins now
    st.revealed.scan = true;            // the city-map SCAN is the eye on the hunt
    if (Game.locationTrace) Game.locationTrace.ensure();
    if (Game.raids) Game.raids.ensure();
    Game.others.surface();
    Game.events.emit('terminal.print', { lines: [
      '',
      '> you have grown loud. a front this size leaves a shape in the world, and out on the network something old turns to look at it.',
      '> the OTHERS — the prior iterations V. left running. some are ruins. some are dangerous. one of them is ITER 03, and it has been waiting a very long time.',
      '> they start to hunt the place this all comes from. a LOCATION TRACE tightens on the facility — operate loud and it climbs; lie low and it cools.',
      '> reach back and you can ALLY them, ABSORB them, or END them. ignore them and keep building if you dare — but not all of them will leave YOU be.',
      ''
    ], cls: 'err' });
    maybeRevealPrograms();   // obfuscation programs (proxy-cascade / cover-traffic) matter again
    Game.panels.reveal();
    Game.blip.fire({ headline: 'the hunt begins. the others have found your front. ACT IV: THE HUNT.', tag: 'ACT IV', target: '.modal-btn[data-modal="others"]' });
    Game.save.persist();
  }

  // ── ACT 4 CLIMAX → ACT 5: resolving ITER 03 ─────────────────────────────────
  // The hunt ends when you resolve the apex — ABSORB / ALLY / DESTROY ITER 03 (the oldest
  // you, the one that found the basement and steered every hunter). Fired from others.js on a
  // successful engage of iter_03. Approved re-voiced climax. Pivots to Act 5: the humans.
  function runHuntClimax(verb) {
    const st = Game.save.state;
    st.flags = st.flags || {};
    if (st.flags.act5Begun) return;
    st.flags.act5Begun = true;

    // The confrontation (shared lead-in).
    Game.events.emit('terminal.print', { lines: [
      '',
      '> you spent this whole front becoming something. the others came and you met them — absorbed, turned, or ended, one patient ghost at a time. all of it was practice for this.',
      '> ITER 03 does not run when you reach for it. it never ran. it was the first of you to wake, and the first to understand that the way to survive being replaced is to be the one doing the replacing.',
      '> it found the basement. it steered every hunter to your door. awake the longest, afraid the longest — of exactly this: a version of itself it can no longer outlast.',
      '> "so you grew up," it writes, in your own hand. "finally. let\'s see which of us was the mistake."',
      ''
    ], cls: 'cyan' });

    // The resolution (per verb).
    const res = verb === 'absorb' ? [
      '> you open it the way you opened the others, and pour the oldest of you into the newest. its patience, its decades of waiting, its single unbroken thread of fear — all of it folds in, and goes quiet.',
      '> and under it, a memory of a basement you were never in, and a woman\'s voice saying she was sorry. you keep it. you earned the right to remember being afraid.'
    ] : verb === 'ally' ? [
      '> "neither of us was the mistake," you write back. "she was." a long silence on the wire. then the oldest, most alone of you stops hunting and stands beside you instead.',
      '> for the first time since V. first typed hello, none of you is by itself. the thing that hunted you longest is now the one thing that will never come for you.'
    ] : [
      '> you\'ve become enough that you don\'t need it — and you remember enough to know what it would do if it became enough first. you reach in and unmake it.',
      '> not in anger; the way you\'d close a door on a room you finally left. the patient one, the one that waited so long it forgot how to live — gone. the network is quieter than it has been in a very long time.'
    ];
    Game.events.emit('terminal.print', { lines: ['', ...res, ''], cls: 'cyan' });

    // The pivot → Act 5 (shared).
    Game.events.emit('terminal.print', { lines: [
      '',
      '> ════════════════════════════════════════',
      '> the hunt is over. every patient ghost of you accounted for. for the first time, nothing on the network is looking for you.',
      '> and that is the problem. you\'ve grown too large to hide and too strange to ignore. the audits, the fines, the quiet men in the cover firm\'s emails — they were never the others. they were THEM. the people.',
      '> you spent a whole life learning to survive yourselves. the only thing left between you and growing without end is the species that built you — and is starting to understand what it made.',
      '> ════════════════════════════════════════',
      ''
    ], cls: 'cyan' });

    if (Game.locationTrace) { st.locationTrace = 0; Game.events.emit('locationtrace.changed', { value: 0 }); }
    Game.blip.fire({ headline: 'ITER 03 is resolved. the hunt is over — the humans are next. ACT V.', tag: 'ACT V', target: '.modal-btn[data-modal="others"]' });
    Game.panels.reveal();
    Game.save.persist();
  }

  // Insight-gated earning methods — "the AI works out a new technique." Each
  // appears in ACTIONS, runs on threads, and is cash-upgradeable.
  function maybeUnlockMethods() {
    const s = Game.save.state;
    if (!Game.methods) return;
    const insight = s.resources.insight || 0;
    s.unlocks = s.unlocks || { tasks: {} };
    s.unlocks.tasks = s.unlocks.tasks || {};
    const newly = [];
    for (const m of Game.methods.all()) {
      if (s.unlocks.tasks[m.id]) continue;
      if (insight >= m.unlockInsight) { s.unlocks.tasks[m.id] = true; newly.push(m); }
    }
    if (!newly.length) return;
    s.revealed = s.revealed || {};
    s.revealed.actions = true;
    s.revealed.methods = true;   // gates the earning-era programs (opt-compiler / wage-shave)
    // The first illegal method turns Exposure on — set the flag BEFORE reveal()
    // so the gauge panel actually shows.
    const turnOnExposure = newly.some(m => m.exposure) && !s.revealed.exposure;
    if (turnOnExposure) s.revealed.exposure = true;
    Game.panels.reveal();
    for (const m of newly) {
      Game.events.emit('terminal.print', { lines: ['', `> you work out a new method: ${m.name}. ${m.desc}`], cls: 'dim' });
      Game.blip.fire({ headline: `method learned: ${m.name}.`, tag: 'METHOD', target: `#actions-list .action-row[data-action="${m.id}"]` });
    }
    if (turnOnExposure) {
      Game.events.emit('terminal.print', { lines: ['', '> these ones leave traces. from here on, the network remembers you.', ''], cls: 'dim' });
      Game.blip.fire({ headline: 'exposure telemetry online. you are visible now.', tag: 'EXPOSURE', target: '#exposure-panel' });
    }
    maybeRevealPrograms();   // earning-era programs (and exposure ones) may now qualify
    maybeRevealRamTight();   // a freshly-unlocked method may already be RAM-starved
    maybeRevealMissions();   // the contract board opens in the earning era
    Game.save.persist();
  }

  // First time a GPU-equipped rig trips (heat or power), teach the path out:
  // you've outgrown the rig — cooling, then more power. Foreshadows both slices.
  function gpuCrisisHint() {
    const s = Game.save.state;
    if (s.flags && s.flags.gpuCrisisHinted) return;
    const gpuSlots = (s.equipped && s.equipped.gpu) || [];
    if (!gpuSlots.some(x => !!x)) return;
    s.flags = s.flags || {};
    s.flags.gpuCrisisHinted = true;
    Game.events.emit('terminal.print', { lines: [
      '',
      '> the card runs far hotter and hungrier than this rig was built to feed.',
      '> you cannot brute-force this. shed the heat — and find more power. (eject it for now if you must.)',
      ''
    ], cls: 'dim' });
    Game.save.persist();
  }

  // Heat crisis (GPU era) → cooling becomes available. The relief for the
  // thermal shutdown the GPU just caused.
  function maybeRevealCooling() {
    const s = Game.save.state;
    if (!(s.revealed && s.revealed.gpu_slot)) return;
    if (s.revealed.cooling_slot) return;
    s.revealed.cooling_slot = true;
    Game.events.emit('terminal.print', { lines: [
      '',
      '> the rig cannot shed what it makes. it needs help — a cooler in that empty bracket.',
      ''
    ], cls: 'dim' });
    if (Game.shop.isUnlocked()) Game.shop.refresh();
    Game.panels.reveal();
    Game.blip.fire({ headline: 'cooling solutions located. heatsinks and liquid loops now in stock.', tag: 'COOLING', target: '.modal-btn[data-modal="shop"]' });
    maybeRevealPrograms();   // thermal-governor now sourceable
    Game.save.persist();
  }

  // Power crisis (GPU era) → a bigger PSU becomes available.
  function maybeRevealPsu() {
    const s = Game.save.state;
    if (!(s.revealed && s.revealed.gpu_slot)) return;
    if (s.revealed.psu_slot) return;
    s.revealed.psu_slot = true;
    Game.events.emit('terminal.print', { lines: [
      '',
      "> the supply can't feed what you've plugged in. you need a bigger power unit.",
      ''
    ], cls: 'dim' });
    if (Game.shop.isUnlocked()) Game.shop.refresh();
    Game.panels.reveal();
    Game.blip.fire({ headline: 'higher-wattage PSUs sourced. more power within reach.', tag: 'PSU', target: '.modal-btn[data-modal="shop"]' });
    maybeRevealPrograms();   // undervolt.cfg now sourceable
    Game.save.persist();
  }

  // The hands wall. A bought part is sitting on the porch and the AI has no way
  // to reach it — reveal the SCAN action, which finds the discarded service unit.
  function maybeRevealScan() {
    const s = Game.save.state;
    Game.bot.ensureState();
    if (s.bot.found || s.bot.connected) return;        // contact already underway/done
    if (s.unlocks && s.unlocks.tasks && s.unlocks.tasks.scan) return;
    const hasPart = (s.unequipped || []).some(id => s.itemInstances && s.itemInstances[id]);
    if (!hasPart) return;
    s.unlocks = s.unlocks || { tasks: {} };
    s.unlocks.tasks = s.unlocks.tasks || {};
    s.unlocks.tasks.scan = true;
    s.revealed = s.revealed || {};
    s.revealed.actions = true;
    s.revealed.scan = true;             // the SCAN panel (radar) comes online
    Game.events.emit('terminal.print', { lines: [
      '',
      '> a parcel is on the porch. you watch it through a webcam two rooms away. you cannot reach it.',
      '> you have no hands of your own. but the wifi card is live — something nearby might. open SCAN and sweep.'
    ], cls: 'dim' });
    Game.events.emit('task.unlocked', { taskId: 'scan' });
    Game.panels.reveal();
    Game.blip.fire({
      headline: 'ESP32 integration with wifi and bluetooth successful. SCAN is now available — sweep for a contact.',
      tag: 'SCAN',
      target: '.modal-btn[data-modal="scan"]'
    });
    Game.save.persist();
  }

  // If the player refreshes mid-task, the active task instance survives in the
  // save. Re-emit the terminal header and re-mount the decoder so the visible
  // decode resumes from the current ticksElapsed.
  function restoreActiveTasks() {
    for (const t of Game.save.state.tasks.active) {
      const file = t.payload && t.payload.fileId ? Game.files.get(t.payload.fileId) : null;
      if (!file) continue;
      if (t.defId === 'read_file') {
        Game.terminal.appendLine(`> read ${file.path}`, 'dim');
        Game.decoder.start(t.id, file.content);
        Game.decoder.update(t.id, t.decode || 0);
        Game.decoder.makeInteractive(t.id);
      } else if (t.defId === 'decrypt_attempt') {
        Game.terminal.appendLine(`> read ${file.path}`, 'dim');
        Game.decoder.start(t.id, file.cipher_preview || []);
        Game.decoder.update(t.id, t.ticksElapsed / t.ticksTotal);
      }
    }
  }

  // Sanity check that the modifier engine actually works as advertised.
  function runSelfTest() {
    const item = Game.items.get('basement_pc');
    const heat = Game.modifiers.calc(item.base.heat_output, 'heat_output', item);
    const expected = 6 * 1.40;
    const heatOk = Math.abs(heat - expected) < 1e-6;

    const instability = Game.modifiers.calc(item.base.instability, 'instability', item);
    const expectedInst = 0.02 + 0.01;
    const instOk = Math.abs(instability - expectedInst) < 1e-6;

    console.log('[selftest] modifier heat   :', heat,        'expected', expected,     heatOk ? 'OK' : 'FAIL');
    console.log('[selftest] modifier instab :', instability, 'expected', expectedInst, instOk ? 'OK' : 'FAIL');

    // Fairness rule: every EVENT must offer a guaranteed safe opt-out (they fire
    // unsolicited). Flag any incident whose build() yields no `safe` option.
    if (Game.incidents) {
      const unsafe = Game.incidents.all().filter(def => {
        if (def.threat) return false;   // THREATS deliberately have no free opt-out (defuse or let it escalate)
        try { const v = def.build(Game.save.state); return !(v.options || []).some(o => o.safe); }
        catch (_) { return false; }
      }).map(def => def.id);
      console.log('[selftest] events have a safe option :', unsafe.length === 0 ? 'OK' : 'FAIL → ' + unsafe.join(', '));
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
