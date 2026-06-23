(function(){
  window.Game = window.Game || {};

  // Stat model (Path of Exile style):
  //   final = (base + sum(flat)) * (1 + sum(increased)) * product(1 + more)
  //
  // A modifier looks like:
  //   { target: 'heat_output', op: 'flat'|'increased'|'more', value: number, source?: string }
  //
  // Sources are anything with a `.modifiers` array (items, conditions, buffs).
  // You can also pass a raw array of modifiers.

  function collect(modSources) {
    const out = [];
    for (const src of modSources) {
      if (!src) continue;
      const list = Array.isArray(src) ? src : (src.modifiers || []);
      for (const m of list) out.push(m);
    }
    return out;
  }

  Game.modifiers = {
    calc(baseStat, target, ...modSources) {
      const mods = collect(modSources).filter(m => m.target === target);
      let flat = 0;
      let inc = 0;
      let more = 1;
      for (const m of mods) {
        if (m.op === 'flat') flat += m.value;
        else if (m.op === 'increased') inc += m.value;
        else if (m.op === 'more') more *= (1 + m.value);
      }
      return (baseStat + flat) * (1 + inc) * more;
    },

    describe(target, ...modSources) {
      const mods = collect(modSources).filter(m => m.target === target);
      return mods.map(m => {
        const sign = m.value >= 0 ? '+' : '';
        if (m.op === 'flat') return `${sign}${m.value} ${target}`;
        if (m.op === 'increased') return `${sign}${(m.value*100).toFixed(0)}% increased ${target}`;
        if (m.op === 'more') return `${sign}${(m.value*100).toFixed(0)}% more ${target}`;
        return '';
      });
    }
  };
})();
