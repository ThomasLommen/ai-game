(function(){
  window.Game = window.Game || {};
  const listeners = {};
  const recent = [];

  Game.events = {
    on(event, fn) {
      (listeners[event] = listeners[event] || []).push(fn);
    },
    off(event, fn) {
      if (!listeners[event]) return;
      listeners[event] = listeners[event].filter(f => f !== fn);
    },
    emit(event, payload) {
      recent.unshift({ event, t: Date.now() });
      if (recent.length > 30) recent.pop();
      (listeners[event] || []).slice().forEach(fn => {
        try { fn(payload); } catch (e) { console.error('[events]', event, e); }
      });
    },
    recent(n = 10) { return recent.slice(0, n); }
  };
})();
