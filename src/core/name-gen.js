(function(){
  window.Game = window.Game || {};

  // Rolls a name from an archetype's `name_template` by replacing {placeholders}
  // with random picks from the archetype's same-named array fields.
  //
  // Example archetype:
  //   { name_template: '{brand} {model}{suffix}',
  //     brand: ['Athlon', 'Sempron'],
  //     model: ['X2 4000+', 'X2 4400+'],
  //     suffix: ['', ' (OEM)'] }

  function pickFrom(arr) {
    if (!arr || arr.length === 0) return '';
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function rollName(archetype) {
    let name = archetype.name_template || archetype.name || '?';
    // Replace each {key} where archetype[key] is an array.
    name = name.replace(/\{(\w+)\}/g, (_, key) => {
      const pool = archetype[key];
      if (Array.isArray(pool)) return pickFrom(pool);
      return '';
    });
    // Collapse double spaces and trim.
    return name.replace(/\s+/g, ' ').trim();
  }

  function rollStats(archetype) {
    const out = {};
    const stats = archetype.stats || {};
    for (const [k, range] of Object.entries(stats)) {
      if (!Array.isArray(range) || range.length < 2) { out[k] = range; continue; }
      const v = range[0] + Math.random() * (range[1] - range[0]);
      if (k === 'cpu_threads' || k === 'ram_mb' || k === 'power_draw') out[k] = Math.round(v);
      else if (k === 'instability') out[k] = Math.round(v * 1000) / 1000;
      else out[k] = Math.round(v * 10) / 10;
    }
    return out;
  }

  function rollPrice(archetype) {
    const r = archetype.price || [0, 0];
    return Math.round((r[0] + Math.random() * (r[1] - r[0])) * 100) / 100;
  }

  Game.nameGen = { rollName, rollStats, rollPrice };
})();
