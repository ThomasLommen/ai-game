(function(){
  window.Game = window.Game || {};

  function buy(programId) {
    const s = Game.save.state;
    s.installed = s.installed || { programs: {}, subroutines: {} };
    s.installed.programs = s.installed.programs || {};
    if (s.installed.programs[programId]) return false;

    const p = Game.programs.get(programId);
    if (!p) return false;
    if ((s.resources.cash || 0) < p.price) {
      Game.events.emit('purchase.rejected', { id: programId, reason: 'cash' });
      return false;
    }

    s.resources.cash -= p.price;
    s.installed.programs[programId] = Date.now();
    Game.events.emit('resource.changed', { id: 'cash', value: s.resources.cash });
    Game.events.emit('program.installed', { id: programId });
    Game.events.emit('terminal.print', {
      lines: [`> installed: ${p.name}`, `  ${p.description}`, ''],
      cls: 'dim'
    });
    Game.save.persist();
    return true;
  }

  Game.market = { buy };
})();
