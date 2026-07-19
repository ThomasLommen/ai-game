(function(){
  window.Game = window.Game || {};

  // Tasks have static definitions (Game.tasks registry) and live instances
  // (Game.save.state.tasks.active). Instances are plain JSON so they survive
  // save/load. Definitions hold the callback logic.

  function newInstance(def, payload) {
    return {
      id: 'task_' + Date.now() + '_' + Math.floor(Math.random()*1000),
      defId: def.id,
      payload: payload || {},
      cpu: def.cpu,
      ram: def.ram,
      ticksTotal: def.baseTicks,
      ticksElapsed: 0,
      startedAt: Date.now()
    };
  }

  function sumStat(target) {
    return Game.inventory.sumStat(target);
  }

  function allocated(field) {
    return Game.save.state.tasks.active.reduce((a, t) => a + t[field], 0);
  }

  Game.tasksRuntime = {
    start(defId, payload) {
      const def = Game.tasks.get(defId);
      if (!def) { console.warn('[tasks] unknown def', defId); return null; }

      if (Game.constraints && Game.constraints.isLockedOut()) {
        Game.events.emit('task.rejected', { defId, reason: 'lockout' });
        return null;
      }

      const cpuTotal = sumStat('cpu_threads');
      const cpuAlloc = allocated('cpu');
      const needCpu = def.getCpu ? def.getCpu(Game.save.state) : def.cpu;   // methods scale their thread cost
      // RAM is a CAPABILITY gate (not consumed): total installed RAM must meet
      // the task's requirement. CPU threads remain the concurrency gate above.
      const needRam = def.getRamReq ? def.getRamReq(Game.save.state) : (def.ramReq || 0);

      if (cpuTotal - cpuAlloc < needCpu) {
        Game.events.emit('task.rejected', { defId, reason: 'cpu' });
        return null;
      }
      if (sumStat('ram_mb') < needRam) {
        Game.events.emit('task.rejected', { defId, reason: 'ram' });
        return null;
      }

      const inst = newInstance(def, payload);
      inst.cpu = needCpu;
      Game.save.state.tasks.active.push(inst);
      if (def.onStart) def.onStart(inst, Game.save.state);
      Game.events.emit('task.started', inst);
      Game.save.persist();
      return inst;
    },

    cancel(instanceId) {
      const arr = Game.save.state.tasks.active;
      const idx = arr.findIndex(t => t.id === instanceId);
      if (idx < 0) return;
      const [inst] = arr.splice(idx, 1);
      const def = Game.tasks.get(inst.defId);
      if (def && def.onCancel) def.onCancel(inst, Game.save.state);
      Game.events.emit('task.cancelled', inst);
      Game.save.persist();
    },

    // Click-to-decode: each click/hold-tick advances the active read by `step`.
    // Returns true when there is nothing left to decode (so the caller can stop
    // a hold loop). Completes the read inline when decode reaches 1.0.
    tapActiveRead(step) {
      const arr = Game.save.state.tasks.active;
      const inst = arr.find(t => t.defId === 'read_file');
      if (!inst) return true;
      const eff = Game.effects.apply(step, 'read_file.decode');   // deep-parse etc. speed this up
      inst.decode = Math.min(1, (inst.decode || 0) + eff);
      Game.decoder.update(inst.id, inst.decode);
      if (inst.decode >= 1) {
        const i = arr.indexOf(inst);
        if (i >= 0) arr.splice(i, 1);
        const def = Game.tasks.get('read_file');
        if (def && def.onComplete) def.onComplete(inst, Game.save.state);
        Game.events.emit('task.completed', inst);
        Game.save.persist();
        return true;
      }
      return false;
    },

    onTick() {
      const arr = Game.save.state.tasks.active;
      if (arr.length === 0) return;
      const completed = [];
      for (const inst of arr) {
        inst.ticksElapsed++;
        const def = Game.tasks.get(inst.defId);
        if (def && def.onTick) def.onTick(inst, Game.save.state);
        // ticksTotal <= 0 means infinite — never auto-completes.
        if (inst.ticksTotal > 0 && inst.ticksElapsed >= inst.ticksTotal) completed.push(inst);
      }
      Game.events.emit('task.progressed', { count: arr.length });
      for (const inst of completed) {
        const i = arr.indexOf(inst);
        if (i >= 0) arr.splice(i, 1);
        const def = Game.tasks.get(inst.defId);
        if (def && def.onComplete) def.onComplete(inst, Game.save.state);
        Game.events.emit('task.completed', inst);
      }
    },

    getActive() { return Game.save.state.tasks.active.slice(); },
    getCpu() { const RR = Game.researchRuntime; return { total: sumStat('cpu_threads') + ((RR && RR.hasMod('extra_thread')) ? 1 : 0) + ((RR && RR.hasMod('hyperthreading')) ? 2 : 0), allocated: allocated('cpu') }; },
    getRam() { return { total: sumStat('ram_mb'),      allocated: allocated('ram') }; }
  };
})();
