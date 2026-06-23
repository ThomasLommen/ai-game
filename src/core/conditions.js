(function(){
  window.Game = window.Game || {};

  // Stackable run CONDITIONS — wrinkles (downsides) and boons (upsides) GAINED and LOST
  // in play. The seeded opening wrinkle is the first; later, a failed threat/mission can
  // INFLICT one and a special event / multi-stage mission can GRANT one. Each condition's
  // `effects` feed the standard pipeline (effects.collect reads state.conditions), and
  // they're shown persistently in DIAGNOSTICS from boot. See [[balance-ui-rework-design]] #2.
  //
  // Shape: { id, label, line?, cls?:'dim'|'err', kind?:'wrinkle'|'boon', effects?:[], source? }

  function ensure() {
    const s = Game.save.state;
    if (!Array.isArray(s.conditions)) s.conditions = [];
    return s.conditions;
  }
  function all() { return ensure(); }
  function has(id) { return !!id && ensure().some(c => c && c.id === id); }

  function add(cond) {
    if (!cond) return false;
    const list = ensure();
    if (cond.id && has(cond.id)) return false;               // no duplicate by id
    list.push({
      id: cond.id, label: cond.label, line: cond.line,
      cls: cond.cls || 'dim', kind: cond.kind || 'wrinkle',
      effects: cond.effects || [], source: cond.source
    });
    Game.events.emit('condition.added', { cond });
    if (Game.save && Game.save.persist) Game.save.persist();
    return true;
  }
  function remove(id) {
    const s = Game.save.state;
    if (!Array.isArray(s.conditions)) return false;
    const before = s.conditions.length;
    s.conditions = s.conditions.filter(c => c && c.id !== id);
    if (s.conditions.length === before) return false;
    Game.events.emit('condition.removed', { id });
    if (Game.save && Game.save.persist) Game.save.persist();
    return true;
  }

  Game.conditions = { ensure, all, has, add, remove };
})();
