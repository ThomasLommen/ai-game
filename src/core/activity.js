(function(){
  window.Game = window.Game || {};

  // Persistent ACTIVITY LOG — a home for outcomes that would otherwise scroll away or
  // happen off-screen: resolved events, background mission/operation results, threat
  // escalations (and later supplier-standing shifts). Surfaced in the ACTIVITY tab; an
  // attention badge flags unseen entries. See [[balance-ui-rework-design]] #5.
  const CAP = 40;

  function ensure() {
    const s = Game.save.state;
    if (!Array.isArray(s.activityLog)) s.activityLog = [];
    if (typeof s.activityCount !== 'number') s.activityCount = s.activityLog.length;
    if (typeof s.activitySeen !== 'number')  s.activitySeen = s.activityCount;
    return s.activityLog;
  }
  function all() { return ensure(); }

  function log(text, opt) {
    if (!text) return;
    const s = Game.save.state;
    const list = ensure();
    list.push({ at: s.tickCount || 0, text: String(text), cls: (opt && opt.cls) || 'dim', kind: (opt && opt.kind) || 'event' });
    while (list.length > CAP) list.shift();
    s.activityCount = (s.activityCount || 0) + 1;
    Game.events.emit('activity.logged', {});
    if (Game.save && Game.save.persist) Game.save.persist();
  }

  function unseen()   { const s = Game.save.state; ensure(); return Math.max(0, (s.activityCount || 0) - (s.activitySeen || 0)); }
  function markSeen() { const s = Game.save.state; ensure(); s.activitySeen = s.activityCount || 0; }

  Game.activity = { ensure, all, log, unseen, markSeen, CAP };
})();
