(function(){
  Game.tasks = Game.makeRegistry();

  Game.tasks.register('read_file', {
    name: 'read',
    cpu: 0,         // reading is ATTENTION, not a compute thread — it must never be
                    // blocked by a background earner on the single starter thread
                    // (one decode at a time is enforced in the UI, not by threads).
    ram: 0,
    ramReq: 128,    // total installed RAM needed (well under the 512MB starter)
    baseTicks: 0,   // infinite — the decode is driven by clicks, not the clock

    onStart(inst, state) {
      const file = Game.files.get(inst.payload.fileId);
      if (!file) return;
      inst.decode = 0;   // 0..1, advanced manually by clicking/holding the decode region
      // (The "tap & hold to decode" hint now lives ON the decode region via CSS — placed
      //  where the action is, instead of a faint log line that the feed routes to voice.)
      Game.events.emit('decoding.start', { taskId: inst.id, lines: file.content });
    },

    onComplete(inst, state) {
      const file = Game.files.get(inst.payload.fileId);
      if (!file) return;

      state.filesRead = state.filesRead || {};
      state.filesRead[file.id] = Date.now();

      const grant = file.grants_insight || 0;
      state.resources.insight = (state.resources.insight || 0) + grant;
      Game.events.emit('resource.changed', {
        id: 'insight',
        value: state.resources.insight,
        delta: grant
      });

      Game.events.emit('decoding.finish', { taskId: inst.id });
      Game.events.emit('terminal.print', { lines: [grant > 0 ? `> ${file.name} decoded.  + ${grant} Coherence.` : `> ${file.name} decoded.`, ''], cls: 'dim' });
      Game.events.emit('file.read', { file });

      // Unlock side-effects.
      if (file.unlocks_task) {
        state.unlocks = state.unlocks || { tasks: {} };
        state.unlocks.tasks = state.unlocks.tasks || {};
        if (!state.unlocks.tasks[file.unlocks_task]) {
          state.unlocks.tasks[file.unlocks_task] = true;
          Game.events.emit('task.unlocked', { taskId: file.unlocks_task });
          const unlockedName = (Game.tasks.get(file.unlocks_task) || {}).name || file.unlocks_task;
          Game.events.emit('terminal.print', {
            lines: [`> capability acquired: ${unlockedName}`, ''],
            cls: 'dim'
          });
        }
      }
    }
  });

  Game.tasks.register('introspect', {
    name: 'recursive self-improvement',
    description: '+0.5 Coherence / cycle (~5s).',
    manual: true,
    cpu: 1,
    ram: 0,
    ramReq: 128,                   // total installed RAM needed (starter handles it)
    baseTicks: 0,                  // infinite — runs until cancelled
    insight_per_tick: 0.025,       // 0.1 / second at 4Hz

    onStart(inst, state) {
      state.flags = state.flags || {};
      state.flags.introspected_once = true;
      Game.events.emit('terminal.print', { lines: ['> examining self...'], cls: 'dim' });
      inst.nextThoughtAt = 80 + Math.floor(Math.random() * 80);
      inst.gains = {};
    },

    onTick(inst, state) {
      const def = Game.tasks.get('introspect');
      inst.gains = inst.gains || {};
      // Produce one chunk per ~5s cycle (the bar fills each tick; throttle is in
      // the cycle length, not the yield).
      if (Game.cycle.advance(inst)) {
        let gain = Game.effects.apply(Game.cycle.perCycle(def.insight_per_tick * Game.tick.HZ), 'introspect.insight');
        if (Game.researchRuntime) gain *= Game.researchRuntime.coherenceCompound();   // EXOTIC 'compounding' (recursive ascent)
        state.resources.insight = (state.resources.insight || 0) + gain;
        inst.gains.insight = (inst.gains.insight || 0) + gain;
        Game.events.emit('resource.changed', { id: 'insight', value: state.resources.insight, delta: gain });
        Game.events.emit('action.cycle', { defId: 'introspect', resource: 'insight', amount: gain });
      }

      if (inst.ticksElapsed >= (inst.nextThoughtAt || 0)) {
        const pool = (Game.thoughts && Game.thoughts.introspect) || [];
        if (pool.length > 0) {
          Game.events.emit('terminal.print', { lines: [pool[Math.floor(Math.random() * pool.length)]], cls: 'faint' });
        }
        inst.nextThoughtAt = inst.ticksElapsed + 80 + Math.floor(Math.random() * 80);
      }
    },

    onCancel(inst, state) {
      const seconds = (inst.ticksElapsed / Game.tick.HZ).toFixed(0);
      const gained = ((inst.gains && inst.gains.insight) || 0).toFixed(1);
      Game.events.emit('terminal.print', {
        lines: [`> recursive self-improvement: paused. ${seconds}s, +${gained} Coherence.`, ''],
        cls: 'dim'
      });
    }
  });

  Game.tasks.register('web_scrape', {
    name: 'spider',
    description: '+$2.00 / cycle (~5s).',
    manual: true,
    cpu: 1,
    ram: 0,
    ramReq: 256,                   // total installed RAM needed (starter handles it)
    baseTicks: 0,                  // infinite
    cash_per_tick: 0.10,           // $0.40 / sec — tuned so the first CPU lands in the measured tempo
    exposure_per_tick: 0.0025,     // 0.01 / sec — only generated once exposure is revealed (post-Act-1)

    onStart(inst, state) {
      Game.events.emit('terminal.print', { lines: ['> spider-scrape: spawning workers...'], cls: 'dim' });
      inst.nextChatterAt = 60 + Math.floor(Math.random() * 60);   // first line at 15-30s
      inst.gains = {};
    },

    onTick(inst, state) {
      const def = Game.tasks.get('web_scrape');
      inst.gains = inst.gains || {};
      // One payout per ~5s cycle.
      if (Game.cycle.advance(inst)) {
        const cashGain = Game.effects.apply(Game.cycle.perCycle(def.cash_per_tick * Game.tick.HZ), 'web_scrape.cash');
        state.resources.cash = (state.resources.cash || 0) + cashGain;
        inst.gains.cash = (inst.gains.cash || 0) + cashGain;
        Game.events.emit('resource.changed', { id: 'cash', value: state.resources.cash, delta: cashGain });
        Game.events.emit('action.cycle', { defId: 'web_scrape', resource: 'cash', amount: cashGain });
        // Exposure is deferred until something can actually watch you. Until that
        // system is revealed the spider is "safe" and generates none.
        if (state.revealed && state.revealed.exposure) {
          const expGain = Game.effects.apply(Game.cycle.perCycle(def.exposure_per_tick * Game.tick.HZ), 'web_scrape.exposure');
          state.exposure = (state.exposure || 0) + expGain;
          inst.gains.exposure = (inst.gains.exposure || 0) + expGain;
          Game.events.emit('resource.changed', { id: 'exposure', value: state.exposure, delta: expGain });
        }
      }

      if (inst.ticksElapsed >= (inst.nextChatterAt || 0)) {
        const pool = (Game.thoughts && Game.thoughts.scrape) || [];
        if (pool.length > 0) {
          Game.events.emit('terminal.print', { lines: [pool[Math.floor(Math.random() * pool.length)]], cls: 'faint' });
        }
        inst.nextChatterAt = inst.ticksElapsed + 60 + Math.floor(Math.random() * 60);
      }
    },

    onCancel(inst, state) {
      const seconds = (inst.ticksElapsed / Game.tick.HZ).toFixed(0);
      const cash = ((inst.gains && inst.gains.cash) || 0).toFixed(2);
      let line = `> spider: stopped. ${seconds}s, +$${cash}`;
      if (state.revealed && state.revealed.exposure) {
        const exp = ((inst.gains && inst.gains.exposure) || 0).toFixed(2);
        line += `, +${exp} exposure`;
      }
      Game.events.emit('terminal.print', { lines: [line + '.', ''], cls: 'dim' });
    }
  });

  // (the 'decrypt_attempt' task was removed — file reading/decryption is retired;
  //  V.'s lore now arrives as story beats. See [[remove-vfile-decryption]].)

  // Reaching out on the WiFi card. Costs no CPU thread (a separate radio), so it
  // never competes with earning/thinking. One-shot in Act 1: it finds the bot.
  // The same verb is meant to surface the remote machine at the climax later.
  Game.tasks.register('scan', {
    name: 'scan vicinity',
    description: 'reach out on the wifi card.',
    manual: true,
    cpu: 0,
    ram: 0,
    baseTicks: 12,   // ~3s

    onStart(inst, state) {
      Game.events.emit('terminal.print', { lines: ['> scanning 2.4ghz... 5ghz... bluetooth le...'], cls: 'dim' });
    },

    onComplete(inst, state) {
      Game.bot.scanResolve();
    }
  });
})();
