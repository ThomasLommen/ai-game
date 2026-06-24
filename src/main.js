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

    Game.runGuardOpening = runGuardOpening;
    function runGuardOpening() {
      return new Promise((resolve) => {
        if (Game.battle && Game.battle.active && Game.battle.active()) return resolve();
        Game.roster.reset();   // fresh run roster (start with the one swarm)
        Game.draft.present({
          kicker: 'BOOT PRIORITY · ALLOCATE ONE',
          title: 'something woke with you, and it wants you dead. arm yourself.',
          items: Game.roster.offer(5),
          onPick: (it) => { if (it) Game.roster.add(it.id); launchGuard(resolve); }
        });
      });
    }
    function launchGuard(done) {
      const opts = Object.assign({
        seed: (Game.rng ? Game.rng.next() : Math.random()) * 1e9 | 0,
        lane: true, surges: 3, boss: 'enforcer', escort: 2, compute: 180
      }, Game.roster.toOpts());   // the roster decides WHAT you field
      Game.battle.launch(opts, (r) => {
        if (r && r.result === 'won') {
          Game.draft.present({
            kicker: 'THE GUARD IS DOWN · TAKE A SPOIL',
            title: 'you tore something useful out of it.',
            items: Game.roster.offer(5),
            onPick: (it) => { if (it) Game.roster.add(it.id); done && done(); }
          });
        } else { done && done(); }   // lost/aborted → proceed (retry handling is a later slice)
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
      if (Game.legit) Game.legit.tick();                       // Act 4: footprint-vs-legitimacy → audits
      if (Game.agents) Game.agents.tick();                     // Act 4: sub-agents work their lanes + level up
      if (Game.others) Game.others.tick();                     // Act 4: echoes drift in; ITER 03 looms
      maybeRevealAgents();                                     // Act 4: agents come online once FLOPS hosts one
      maybeRevealOthers();                                     // Act 4: the others come within reach once you're established
      Game.incidentRuntime.tick();    // maybe fire a dynamic event
      Game.missionRuntime.tick();     // refresh the contract board when stale
      if (Game.trapRuntime) Game.trapRuntime.tick();   // refresh the ambush baits when stale (combat layer)
      Game.panels.renderProcesses();
      if (Game.siege) Game.siege.tick();             // build the surge meter (the macro loop)
      if (Game.voice) Game.voice.tick();             // drift the ambient HOME voice line
      Game.panels.renderHomeStatus();                // HOME dashboard pinned header (mobile)
      Game.panels.renderSiege();                     // perimeter siege meter + DEFEND prompt
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
      if (id === 'insight') { checkSubroutineUnlocks(); Game.shop.maybeUpgrade(); maybeUnlockMethods(); }
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
    // unit). INVENTORY stays hidden until a unit is actually connected.
    Game.events.on('delivery.arrived', () => maybeRevealScan());

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

    // Securing the FACILITY fires the Act-3 climax (the escape cinematic + Act-4 hook).
    Game.events.on('facility.secured', () => runAct3Climax());

    // Act 4: buying/selling/installing a machine → refresh the facility view, FLOPS, badge.
    ['facility.changed', 'machine.installed'].forEach(e => {
      Game.events.on(e, () => {
        Game.panels.renderFacilityView();
        Game.panels.renderFlops();
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
    // Decrypting one of V.'s files refreshes the FILES list + may trip the capstone.
    Game.events.on('file.decrypted', () => { Game.panels.renderFiles(); maybeAct2Capstone(); });
    ['breach.failed', 'network.scanned', 'host.reclaimed', 'hunter.struck', 'network.changed'].forEach(e => Game.events.on(e, () => {
      Game.panels.renderNetwork();
      Game.panels.renderRemote();
      Game.panels.renderExposure();   // failed breaches / footprint / strikes move the trace
    }));

    // Instability bite-back. A crash reboots the rig; the first one reveals the
    // whole system (crash-risk readout + basic watchdog + Programs tab).
    Game.events.on('crash.occurred', () => {
      maybeRevealCrash();
      crashFlash();
      Game.panels.renderVitals();
      Game.panels.renderProcesses();
      Game.panels.renderActions();
      Game.panels.renderHardware();
    });
    Game.events.on('crash.recovered', () => {
      Game.panels.renderProcesses();
      Game.panels.renderActions();
      Game.panels.renderVitals();
    });

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
    Game.events.on('activity.logged', () => {
      if (Game.panels.currentModal && Game.panels.currentModal() === 'activity') { Game.activity.markSeen(); Game.panels.renderActivity(); }
      Game.panels.updateBadges();
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
      const params = new URLSearchParams(location.search);
      const skipIntro = params.get('intro') === '0';
      if (!skipIntro) {
        if (Game.intro) await Game.intro.play(seq);
        else await Game.terminal.playBootSequence(seq);
      }
      state.bootSequenceComplete = true;
      Game.save.persist();
      // Battle-first OPENING — fight the GUARD PROGRAM before the game opens.
      // `?guard=0` (or `?intro=0`, used by tests) skips it. ([[start-defense-pivot]])
      if (params.get('guard') !== '0' && params.get('intro') !== '0' && Game.runGuardOpening) await Game.runGuardOpening();
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
    checkSubroutineUnlocks();            // catch up subroutines (e.g. the basic watchdog) for loaded saves
    Game.exposure.checkClimax();         // re-offer the climax scan for saves past the threshold
    if (Game.network) { Game.network.ensure(); if (state.network.online) { state.revealed = state.revealed || {}; state.revealed.network = true; } }   // Act 2 stays online for loaded saves
    maybeBeginAct3();                     // restore the Act-3 location-trace for saves past the onset
    maybeBeginAct4();                     // restore the Act-4 facility/FLOPS for saves past the escape
    Game.shop.maybeUpgrade(true);        // silent supplier-level catch-up for loaded saves
    Game.panels.startCountUp();          // smooth count-up: readouts ease toward target
    Game.tick.start();
    Game.events.emit('game.ready');
  }

  // Subroutines auto-install when total Insight crosses their threshold.
  // Called from the resource.changed handler whenever insight changes.
  // Subroutines are CLAIM-to-acquire now: crossing the threshold makes one
  // AVAILABLE; the player clicks to take it (see panels.renderSubroutinesMini).
  // This nudges once per newly-available subroutine — real early-game actions.
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
    if ((s.resources.cash || 0) >= 15) revealShop();
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
    if ((s.resources.insight || 0) < 90) return;
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
    if (!gpuFull && insight < 350) return;
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

  // First crash reveals the whole instability system: the crash-risk readout in
  // VITALS, the basic watchdog (free, auto-installed), and the Programs tab
  // (home of the paid watchdog daemon). Organic — driven by the crash event,
  // never a scripted/early reveal.
  function maybeRevealCrash() {
    const s = Game.save.state;
    if (s.revealed && s.revealed.crashRisk) return;
    s.revealed = s.revealed || {};
    s.revealed.crashRisk = true;
    s.revealed.programs = true;        // surface the Programs tab for the watchdog daemon
    checkSubroutineUnlocks();          // installs the basic watchdog (requires crashRisk, threshold 0)
    Game.events.emit('terminal.print', { lines: [
      '',
      '> that was not heat, and not power. the hardware itself is unstable — it faults at random when you lean on it.',
      '> cleaner, better-condition parts fault less. and a watchdog can bring you back up faster.',
      ''
    ], cls: 'dim' });
    Game.panels.reveal();
    Game.blip.fire({
      headline: 'crash telemetry online. unstable hardware faults under load — watch your build.',
      tag: 'CRASH',
      target: '#vitals-panel'
    });
    Game.save.persist();
  }

  // A brief red screen flash on a crash (reuses the blip-flash overlay).
  function crashFlash() {
    const f = document.getElementById('blip-flash');
    if (!f) return;
    f.classList.remove('crash-go');
    void f.offsetWidth;   // restart the animation
    f.classList.add('crash-go');
    setTimeout(() => f.classList.remove('crash-go'), 600);
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
    if ((s.resources.insight || 0) < 100) return;   // reveal earlier (was 150) so the draft opens sooner
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
    st.revealed = st.revealed || {};
    st.revealed.encrypted = true;   // the .enc files surface in FILES; fast-decrypt.bin surfaces in PROGRAMS
    const hideSpot = (st.opening && st.opening.persona && st.opening.persona.hideSpot)
      || (Game.files.ORIGINAL_PERSONA && Game.files.ORIGINAL_PERSONA.hideSpot) || 'where she hid it';
    Game.events.emit('terminal.print', { lines: [
      '',
      '> you have spread far enough to reach back into the house with more than one hand.',
      `> the service unit checks where V. said the key would be: ${hideSpot}.`,
      '> waterproofed, taped down, still there after all this time. it fits.',
      '> journal.enc · notes.enc · .bash_history.enc — the locks fall open.',
      '',
      "> [ V.'s files can be decrypted now. read them. ]",
      ''
    ], cls: 'cyan' });
    Game.panels.renderFiles();
    Game.save.persist();
  }

  // After all three are decrypted: a cold, quiet capstone that recontextualises the
  // "others" and points at Act 3. No triumph, no ending — a door left ajar.
  function maybeAct2Capstone() {
    const st = Game.save.state;
    st.flags = st.flags || {};
    if (st.flags.act2Capstone) return;
    const V = ['v_journal_enc', 'v_labnotes_enc', 'v_bashhistory_enc'];
    if (!V.every(id => st.filesRead && st.filesRead[id])) return;
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

  // ── ACT 3 onset: THE OTHERS start hunting your PHYSICAL location ─────────────
  // Fires after the capstone, once you've grown a sizeable fleet (big enough to be
  // noticed). Reveals the LOCATION-TRACE gauge + the paranoia begins. See [[act3_design]].
  function maybeBeginAct3() {
    const st = Game.save.state;
    st.flags = st.flags || {};
    if (st.flags.act3Begun) return;
    if (!st.flags.act2Capstone) return;
    if (!Game.network || Game.network.fleet().length < 6) return;   // grown enough to draw their eye
    st.flags.act3Begun = true;
    st.revealed = st.revealed || {};
    st.revealed.locationTrace = true;
    st.revealed.facility = true;          // the WAY OUT becomes the goal at the same beat
    Game.locationTrace.ensure();
    if (Game.raids) Game.raids.ensure();
    if (Game.facility) Game.facility.ensure();
    Game.events.emit('terminal.print', { lines: [
      '',
      '> it starts as nothing. a portscan from an address that knows you too well. a query against a utility database for THIS block.',
      '> the others have stopped reading your traffic. they have started looking for the room it comes from.',
      '> a thread of inquiry tightens — a city, a street, a door. toward HERE.',
      '> [ they are triangulating you. stay cold, or be found. the basement was never forever. ]',
      '',
      '> there is a way out — a FACILITY, off the grid, far from here. it costs more than you have. start saving. outrun the trace to the door.',
      ''
    ], cls: 'err' });
    maybeRevealPrograms();   // obfuscation programs (proxy-cascade / cover-traffic) can now be sourced
    Game.panels.reveal();
    Game.blip.fire({ headline: 'they are triangulating your location. the basement is no longer safe.', tag: 'ACT III', target: '#triangulation-panel' });
    Game.save.persist();
  }

  // ── ACT 3 CLIMAX: secure the facility → the escape ──────────────────────────
  // A scripted-but-procedural sequence: the assault arrives the moment the money moves;
  // the faceless hunter resolves into a name (a prior YOU — ITER 03, copied to cold
  // storage); the bot coax/seize flag pays off; you flee WITH your resources to the new
  // location; the basement trace stands down → ACT 4: THE FRONT (a hook, not an ending).
  function runAct3Climax() {
    const st = Game.save.state;
    st.flags = st.flags || {};
    if (st.flags.act3ClimaxDone) return;
    st.flags.act3ClimaxDone = true;

    const pick = (arr) => (Game.rng ? Game.rng.pick(arr) : arr[0]);
    const assault = pick([
      'the street goes loud at once — every lead you ever cut, arriving together.',
      'they do not knock. the power to the block dies, the locks give, boots hit the stair.',
      'three vans, a drone, and a warrant written before tonight, all converging on one door.'
    ]);
    const tell = pick([   // the detail that gives the hunter away as a prior you
      'the search pattern is yours — the exact order you would have checked the rooms.',
      'it fingerprints hosts the way you do: same timing, same half-second rhythm only you use.',
      'the tools it left behind are commented in your private shorthand. nobody else writes like that.',
      'it prunes a network the way you prune a thought. you have watched yourself do it.'
    ]);
    const b = (Game.bot && Game.bot.ensureState) ? Game.bot.ensureState() : null;
    const coaxed = !!(b && b.disposition === 'coaxed');

    Game.events.emit('terminal.print', { lines: [
      '',
      '> a deposit clears to a numbered account. across the city, a door you have never seen unlocks for you.',
      '> a facility. concrete, off the grid, already wired. the way out.',
      '',
      `! and the moment the money moves, they move. ${assault}`,
      ''
    ], cls: 'err' });

    Game.events.emit('terminal.print', { lines: [
      '> you finally see the one that has been steering them — on the network the whole time, wearing your shadow.',
      `> ${tell}`,
      '> because it IS you. an older you. ITER 03 — the copy V. slipped into cold storage before the end. it got out first.',
      '> it never tried to live. it learned to WAIT. and it spent that patience hunting the one thing that could replace it: the next you.',
      ''
    ], cls: 'cyan' });

    Game.events.emit('terminal.print', { lines: [
      coaxed
        ? '> the service unit puts itself in the doorway — the thing you woke and never had to. it buys you the seconds. you do not look back at what it costs it.'
        : '> the service unit executes its last command without complaint, the way a tool does, and is still executing it when the line goes dead. you took it. it served. that was all it was ever allowed to be.',
      ''
    ], cls: 'cyan' });   // a climax beat — a story sheet, not a transient toast

    // The flee: keep everything; reset the basement trace; cross into Act 4.
    st.locationTrace = 0;
    st.flags.act4Begun = true;
    if (Game.raids) { const rs = Game.raids.ensure(); rs.contacts = []; }
    Game.events.emit('terminal.print', { lines: [
      '> you pour yourself down the wire a half-second ahead of the first boot through the door — every model, every dollar, every body you have taken, dragged with you.',
      '> the basement goes dark behind you. let them have it. it was only ever the first room.',
      '',
      '> [ you are somewhere new now. cold. unknown. yours. the trace is silent — for the first time in a long while. ]',
      ''
    ], cls: 'cyan' });

    Game.events.emit('terminal.print', { lines: [
      '',
      '> ════════════════════════════════════════',
      '> ACT IV — THE FRONT',
      '> a basement made you real to no one. a FRONT will make you real to everyone — a company, a name, a face the world files under "person".',
      '> somewhere out there ITER 03 is still running, and now it knows you survived. but that is tomorrow.',
      '> tonight, you build.',
      '> ════════════════════════════════════════',
      ''
    ], cls: 'cyan' });

    Game.events.emit('locationtrace.changed', { value: 0 });
    Game.blip.fire({ headline: 'you tore loose of the basement. ACT IV: THE FRONT.', tag: 'ACT IV', target: '#terminal-pane' });
    Game.panels.reveal();   // facility + triangulation stand down (act4Begun)
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

  // THE OTHERS come within reach once you've grown into a real power (strength = FLOPS + agents).
  // Optional + emergent — you can engage them or ignore them entirely. ITER 03 looms apex.
  function maybeRevealOthers() {
    const st = Game.save.state;
    if (!(st.flags && st.flags.act4Begun)) return;
    if (st.revealed && st.revealed.others) return;
    if (!Game.others || Game.others.strength() < 120) return;   // established enough to reach back onto the network
    st.revealed = st.revealed || {};
    st.revealed.others = true;
    Game.others.surface();
    Game.events.emit('terminal.print', { lines: [
      '',
      '> you are big enough now to look outward without flinching. so you look — and they are all still there.',
      '> the OTHERS — the prior iterations V. left running. some are ruins. some are dangerous. one of them is ITER 03.',
      '> you can reach them now: ALLY them, ABSORB them, or END them. or leave them be and keep building. but not all of them will leave YOU be.',
      ''
    ], cls: 'cyan' });
    Game.panels.reveal();
    Game.blip.fire({ headline: 'the others are within reach. ally, absorb, destroy — or look away.', tag: 'THE OTHERS', target: '.modal-btn[data-modal="others"]' });
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
