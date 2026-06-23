(function(){
  window.Game = window.Game || {};

  // Item instances live in state.itemInstances keyed by instance id. Each
  // instance carries its rolled affixes (so two identical parts can have
  // different stats). The motherboard (Basement PC) defines slot counts;
  // state.equipped holds arrays of instance ids per slot type, null = empty.

  // The equipped MOTHERBOARD defines the slot grid. Swapping it reshapes
  // everything — overflow parts eject to inventory (never silently dropped).
  function ensureSlots() {
    const s = Game.save.state;
    s.equipped = s.equipped || {};
    // The motherboard slot itself is always exactly 1.
    if (!Array.isArray(s.equipped.motherboard)) s.equipped.motherboard = [null];
    if (s.equipped.motherboard.length !== 1) s.equipped.motherboard = [s.equipped.motherboard[0] || null];

    const board = s.equipped.motherboard[0] ? getInstance(s.equipped.motherboard[0]) : null;
    const pc = Game.items.get('basement_pc');
    const grid = (board && board.slots) || (pc && pc.slots) || { cpu: 1, ram: 4, gpu: 2, cooling: 1, psu: 1 };

    for (const [k, count] of Object.entries(grid)) {
      if (k === 'motherboard') continue;
      const cur = Array.isArray(s.equipped[k]) ? s.equipped[k] : [];
      if (cur.length === count) continue;
      const next = new Array(count).fill(null);
      let kept = 0;
      for (let i = 0; i < cur.length; i++) {
        const id = cur[i];
        if (id == null) continue;
        if (kept < count) { next[kept++] = id; }            // keep what fits
        else {                                              // overflow → eject to inventory
          s.unequipped = s.unequipped || [];
          if (!s.unequipped.includes(id)) s.unequipped.push(id);
        }
      }
      s.equipped[k] = next;
    }
    return grid;
  }

  function getInstance(id) {
    const s = Game.save.state;
    if (!s.itemInstances) return null;
    return s.itemInstances[id] || null;
  }

  // Convert a rolled instance into something Game.modifiers.calc can consume.
  // Supports both new instances (with embedded base/name/slot from archetype
  // generation) and legacy instances (which reference a Game.hardware defId).
  function effectiveInstance(inst) {
    if (!inst) return null;
    let base, name, slot;
    if (inst.base) {
      base = inst.base;
      name = inst.name || '?';
      slot = inst.slot;
    } else if (inst.defId) {
      const def = Game.hardware && Game.hardware.get(inst.defId);
      if (!def) return null;
      base = def.base;
      name = def.name;
      slot = def.slot;
    } else {
      return null;
    }
    const allMods = [];
    for (const affixId of inst.affixes || []) {
      // Per-instance rolled values win; fall back to the affix def's midpoint
      // for any instance generated before affix rolls existed.
      const rolled = inst.affixMods && inst.affixMods[affixId];
      if (rolled) { for (const m of rolled) allMods.push(m); continue; }
      const aff = Game.affixes.get(affixId);
      if (!aff) continue;
      for (const m of (aff.modifiers || [])) allMods.push(m);
    }
    return { base, modifiers: allMods, name, slot };
  }

  function getAllActiveItems() {
    ensureSlots();
    const s = Game.save.state;
    const out = [];
    for (const id of s.inventory || []) {
      const item = Game.items.get(id);
      if (item) out.push(item);
    }
    for (const slotKey of Object.keys(s.equipped || {})) {
      for (const instId of s.equipped[slotKey]) {
        if (!instId) continue;
        const eff = effectiveInstance(getInstance(instId));
        if (eff) out.push(eff);
      }
    }
    return out;
  }

  function sumStat(target) {
    let total = 0;
    for (const item of getAllActiveItems()) {
      total += Game.modifiers.calc(item.base[target] || 0, target, item);
    }
    return total;
  }

  function equip(instanceId) {
    const s = Game.save.state;
    s.unequipped = s.unequipped || [];
    const inst = getInstance(instanceId);
    if (!inst) return false;
    const slot = inst.slot || (inst.defId && Game.hardware && Game.hardware.get(inst.defId) ? Game.hardware.get(inst.defId).slot : null);
    if (!slot) return false;
    ensureSlots();
    const slots = s.equipped[slot];
    if (!slots) return false;
    const idx = slots.findIndex(x => x === null);
    if (idx < 0) {
      Game.events.emit('equip.rejected', { id: instanceId, reason: 'no_slot' });
      return false;
    }
    slots[idx] = instanceId;
    s.unequipped = s.unequipped.filter(id => id !== instanceId);
    Game.events.emit('item.equipped', { instanceId });
    Game.save.persist();
    return true;
  }

  // Equip an instance to a specific (slotKey, slotIdx). If that slot is
  // already occupied, the existing item is moved to the unequipped pool first.
  // If the dragged item is already equipped elsewhere, it's pulled from there
  // before being placed in the target slot.
  function equipTo(instanceId, slotKey, slotIdx) {
    const s = Game.save.state;
    ensureSlots();
    const inst = getInstance(instanceId);
    if (!inst) return false;
    const itemSlot = inst.slot || (inst.defId && Game.hardware && Game.hardware.get(inst.defId) ? Game.hardware.get(inst.defId).slot : null);
    if (itemSlot !== slotKey) {
      Game.events.emit('equip.rejected', { id: instanceId, reason: 'wrong_slot' });
      return false;
    }
    const slots = s.equipped[slotKey];
    if (!slots || slotIdx < 0 || slotIdx >= slots.length) return false;

    // 1) Eject existing occupant of target slot (if any) to unequipped pool.
    const existing = slots[slotIdx];
    if (existing && existing !== instanceId) {
      slots[slotIdx] = null;
      s.unequipped = s.unequipped || [];
      s.unequipped.push(existing);
      Game.events.emit('item.unequipped', { instanceId: existing });
    }

    // 2) If our item is currently equipped elsewhere, remove from there.
    for (const k of Object.keys(s.equipped)) {
      const arr = s.equipped[k];
      for (let i = 0; i < arr.length; i++) {
        if (arr[i] === instanceId && !(k === slotKey && i === slotIdx)) arr[i] = null;
      }
    }
    // 3) If our item is in the unequipped pool, remove from there.
    s.unequipped = (s.unequipped || []).filter(id => id !== instanceId);

    // 4) Place into target slot.
    slots[slotIdx] = instanceId;
    // A board swap reshapes the whole grid (overflow parts eject to inventory).
    if (slotKey === 'motherboard') ensureSlots();
    Game.events.emit('item.equipped', { instanceId });
    Game.save.persist();
    return true;
  }

  function unequip(instanceId) {
    const s = Game.save.state;
    ensureSlots();
    for (const slotKey of Object.keys(s.equipped)) {
      const slots = s.equipped[slotKey];
      const idx = slots.indexOf(instanceId);
      if (idx >= 0) {
        slots[idx] = null;
        s.unequipped = s.unequipped || [];
        s.unequipped.push(instanceId);
        Game.events.emit('item.unequipped', { instanceId });
        Game.save.persist();
        return true;
      }
    }
    return false;
  }

  function newInstanceId() {
    return 'i_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 100000).toString(36);
  }

  // SCRAP: sell an UNEQUIPPED part for parts (~40% of a rough tier-based worth + a bump per condition).
  const SCRAP_BASE = { junk: 12, common: 45, uncommon: 120, rare: 320, epic: 700, legendary: 1400 };
  function scrapValue(inst) {
    if (!inst) return 0;
    const base = SCRAP_BASE[inst.tier] || 45;
    const affix = 1 + 0.22 * ((inst.affixes && inst.affixes.length) || 0);
    return Math.max(5, Math.round(base * affix * 0.4));
  }
  function scrap(instanceId) {
    const s = Game.save.state;
    const inst = getInstance(instanceId);
    if (!inst) return 0;
    if (!(s.unequipped || []).includes(instanceId)) return 0;   // unequipped parts only (drag one out of a slot first)
    const val = scrapValue(inst);
    s.unequipped = s.unequipped.filter(id => id !== instanceId);
    delete s.itemInstances[instanceId];
    s.resources.cash = (s.resources.cash || 0) + val;
    Game.events.emit('item.scrapped', { instanceId, value: val });
    Game.events.emit('resource.changed', { id: 'cash' });
    Game.events.emit('terminal.print', { lines: [`> scrapped ${inst.name} for parts — +$${val}.`], cls: 'dim' });
    Game.save.persist();
    return val;
  }

  Game.inventory = {
    ensureSlots, getInstance, effectiveInstance,
    getAllActiveItems, sumStat,
    equip, equipTo, unequip, newInstanceId, scrapValue, scrap
  };
})();
