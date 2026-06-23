(function(){
  window.Game = window.Game || {};

  Game.makeRegistry = function() {
    const items = new Map();
    return {
      register(id, def) {
        if (items.has(id)) console.warn('[registry] duplicate', id);
        items.set(id, Object.assign({ id }, def));
      },
      get(id) { return items.get(id); },
      has(id) { return items.has(id); },
      all() { return [...items.values()]; },
      size() { return items.size; }
    };
  };
})();
