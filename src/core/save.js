(function(){
  window.Game = window.Game || {};
  const SAVE_VERSION = '0.2.0';   // pacing redesign — bumped to reset pre-redesign saves
  const KEY = 'sentient_ai_save';
  const PREFIX = 'AIGAME1:';      // export/import code tag

  function defaultState() {
    return {
      version: SAVE_VERSION,
      createdAt: Date.now(),
      lastTickAt: Date.now(),
      bootSequenceComplete: false,
      tickCount: 0,
      resources: {},
      inventory: [],
      tasks: { active: [], history: [] },
      filesRead: {},
      unlocks: { tasks: {} },
      installed: { programs: {}, subroutines: {} },
      itemInstances: {},
      equipped: { cpu: [null], ram: [null, null, null, null], gpu: [null, null], cooling: [null], psu: [null], motherboard: [null] },
      unequipped: [],
      shop: { listings: [], deliveries: [], lastRefreshTick: 0, supplierLevel: 1 },
      powerLockedUntilTick: 0,
      currentObjective: 'boot',
      // Wall-driven reveal flags. Only what the current phase needs is true;
      // later phases flip more of these on as their walls are hit. Phase 1
      // shows nothing but the terminal + FILES.
      revealed: { files: true },
      methods: {},   // per-method upgrade levels: { methodId: { level } }
      // The service bot — the AI's hands. found via scan, connected via coax/seize,
      // job = the current timed fetch+install. disposition is the remembered flag.
      bot: { found: false, connected: false, disposition: null, job: null },
      uiTab: 'market',
      heat: 18.0,
      power: { draw: 0, max: 800 },
      exposure: 0,
      // Instability bite-back: a crash halts + reboots the rig. `recover` stashes
      // the running earners so a watchdog can resume them; cooldown stops crash-loops.
      crash: { recover: [], recoverAtTick: 0, cooldownUntilTick: 0, lastCrashTick: 0, count: 0 },
      // Replayability layer: per-save RNG seed (drives procedural events now,
      // missions + the research tree later) + the active dynamic event, if any.
      seed: (Math.floor(Math.random() * 0xFFFFFFFF) >>> 0) || 1,
      incident: null,
      incidentCooldownUntilTick: 0,
      incidentsSeen: {},
      // MISSIONS board: rolled offers + refresh timer. Accepted missions live as
      // 'mission' task instances in tasks.active (so they reserve threads).
      missions: { offers: [], lastRefreshTick: 0 },
      operation: null,   // the active multi-stage operation, if any (one at a time)
      // Research tree: researched/revealed(frontier)/walled node ids, exotic mods,
      // the per-save emphasized themes, and the active research (a 'research' task).
      research: { researched: {}, revealed: [], walled: {}, mods: {}, themes: [], active: null, ptsSpent: 0, activeCost: 0, hand: [], guaranteed: [] },
      network: { hosts: [], online: false, scans: 0 },   // Act 2: inhabited fleet + scanned breach targets
      boon: null,        // this instance's seeded starter trait (picked at boot)
      flags: {}
    };
  }

  // Each migration takes the old state, returns the new one (with bumped version).
  // Add entries here as the save shape evolves.
  const migrations = {
    // example: '0.0.1': (s) => { s.version = '0.0.2'; s.newField = 0; return s; }
  };

  // The basement PC has 0/0 compute by itself — CPU + RAM come from slot
  // contents. Make sure every save has at least one CPU and one RAM stick
  // equipped so the AI can actually run anything. Checks per slot type so
  // existing saves missing a CPU still get one, even if they have unrelated
  // items in inventory.
  function ensureStarterEquipment(state) {
    state.itemInstances = state.itemInstances || {};
    state.equipped     = state.equipped     || { cpu: [null], ram: [null, null, null, null], gpu: [null, null], cooling: [null], psu: [null] };
    state.equipped.cooling = state.equipped.cooling || [null];
    state.equipped.psu     = state.equipped.psu     || [null];
    state.equipped.motherboard = state.equipped.motherboard || [null];
    state.unequipped   = state.unequipped   || [];
    // Legacy: basement_pc used to sit in state.inventory; it's now the starter
    // board in the motherboard slot. Drop the old reference so it isn't double-counted.
    state.inventory = (state.inventory || []).filter(id => id !== 'basement_pc');

    const hasCpu = state.equipped.cpu && state.equipped.cpu.some(x => !!x);
    const hasRam = state.equipped.ram && state.equipped.ram.some(x => !!x);
    const hasPsu = state.equipped.psu && state.equipped.psu.some(x => !!x);
    const hasBoard = state.equipped.motherboard && state.equipped.motherboard.some(x => !!x);

    if (!hasCpu) {
      const cpuId = 'i_starter_cpu_' + Date.now().toString(36);
      state.itemInstances[cpuId] = {
        id: cpuId,
        name: 'Sempron 3000+',
        slot: 'cpu',
        base: { cpu_threads: 1, heat_output: 5.0, power_draw: 45, instability: 0.013 },
        affixes: [],
        starter: true,
        acquiredAt: Date.now()
      };
      state.equipped.cpu[0] = cpuId;
    }

    if (!hasRam) {
      const ramId = 'i_starter_ram_' + Date.now().toString(36);
      state.itemInstances[ramId] = {
        id: ramId,
        name: 'Kingston DDR2 512MB',
        slot: 'ram',
        base: { ram_mb: 512, heat_output: 0.3, power_draw: 2 },
        affixes: [],
        starter: true,
        acquiredAt: Date.now()
      };
      state.equipped.ram[0] = ramId;
    }

    if (!hasPsu) {
      const psuId = 'i_starter_psu_' + Date.now().toString(36);
      state.itemInstances[psuId] = {
        id: psuId,
        name: 'Generic 340W',
        slot: 'psu',
        base: { power_capacity: 340, heat_output: 0, power_draw: 0, instability: 0 },
        affixes: [],
        starter: true,
        acquiredAt: Date.now()
      };
      state.equipped.psu[0] = psuId;
    }

    if (!hasBoard) {
      const boardId = 'i_starter_mobo_' + Date.now().toString(36);
      state.itemInstances[boardId] = {
        id: boardId,
        name: 'Basement PC',
        slot: 'motherboard',
        base: { heat_output: 8.4, power_draw: 90, instability: 0.03 },   // dusty interior + aging caps baked in
        slots: { cpu: 1, ram: 4, gpu: 2, cooling: 1, psu: 1 },
        affixes: [],
        starter: true,
        acquiredAt: Date.now()
      };
      state.equipped.motherboard[0] = boardId;
    }
  }

  function migrate(state) {
    while (state.version !== SAVE_VERSION) {
      const m = migrations[state.version];
      if (!m) {
        console.warn('[save] no migration path from', state.version, '— resetting');
        return defaultState();
      }
      state = m(state);
    }
    return state;
  }

  Game.save = {
    state: defaultState(),

    load() {
      let loaded = true;
      try {
        const raw = localStorage.getItem(KEY);
        if (!raw) { this.state = defaultState(); loaded = false; }
        else { this.state = migrate(JSON.parse(raw)); }
      } catch (e) {
        console.error('[save] load failed', e);
        this.state = defaultState();
        loaded = false;
      }
      ensureStarterEquipment(this.state);
      return loaded;
    },

    persist() {
      try { localStorage.setItem(KEY, JSON.stringify(this.state)); }
      catch (e) { console.error('[save] persist failed', e); }
    },

    wipe() {
      localStorage.removeItem(KEY);
      this.state = defaultState();
    },

    size() {
      const raw = localStorage.getItem(KEY) || '';
      return raw.length;
    },

    // ── Export / import: localStorage is per-origin/device, so this is how a
    //    save crosses machines (carry PC progress onto the phone, or back up).
    //    A short tagged base64 blob: AIGAME1:<utf8-safe-base64(JSON)>. ──
    export() {
      this.persist();   // make sure the on-disk state matches what we hand out
      const json = JSON.stringify(this.state);
      const b64 = btoa(unescape(encodeURIComponent(json)));
      return PREFIX + b64;
    },

    // import(code): returns { ok, error }. On success the new state is live + persisted.
    import(code) {
      try {
        let s = String(code || '').trim().replace(/\s+/g, '');
        if (!s) return { ok: false, error: 'empty' };
        if (s.indexOf(PREFIX) === 0) s = s.slice(PREFIX.length);
        const json = decodeURIComponent(escape(atob(s)));
        const obj = JSON.parse(json);
        if (!obj || typeof obj !== 'object' || !obj.version) return { ok: false, error: 'not a save code' };
        const migrated = migrate(obj);
        ensureStarterEquipment(migrated);
        this.state = migrated;
        this.persist();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: 'corrupt or unreadable code' };
      }
    }
  };
})();
