(function(){
  window.Game = window.Game || {};

  // ── ACT 5: THE PUBLIC — once the reveal lands (runPublicReveal in main.js),
  // legit.js's private audits retire and this takes over as the ongoing "the
  // humans" tension: periodic PUBLIC EVENTS that move a SENTIMENT gauge (0-100)
  // instead of a hidden footprint/cover tug-of-war. Same present/fire/resolve
  // shape as incidents-runtime.js — including recency-avoidance from day one —
  // deliberately without incidents' chain/threat machinery: a leaner, later-game
  // layer that just... never resolves. Endless, by design.
  const HZ = 4;
  const GAP_MIN_TICKS = 4 * 60 * HZ;   // public events land a bit slower than incidents - bigger beats
  const GAP_MAX_TICKS = 10 * 60 * HZ;
  const RECENT_LIMIT = 4;
  const SENTIMENT_START = 50;

  function ensureState() {
    const st = Game.save.state;
    st.public = st.public || {};
    const p = st.public;
    if (!p.revealed) p.revealed = false;
    if (typeof p.sentiment !== 'number') p.sentiment = SENTIMENT_START;
    if (typeof p.event === 'undefined') p.event = null;
    if (typeof p.nextTick !== 'number') p.nextTick = -1;
    p.seen = p.seen || {};
    p.recent = p.recent || [];
    return p;
  }

  function scheduleNext(p) { p.nextTick = (Game.save.state.tickCount || 0) + Game.rng.int(GAP_MIN_TICKS, GAP_MAX_TICKS); }

  function sentiment() { return ensureState().sentiment; }
  function adjustSentiment(delta) {
    const p = ensureState();
    p.sentiment = Math.max(0, Math.min(100, p.sentiment + delta));
    Game.events.emit('public.sentiment.changed', { value: p.sentiment });
    return p.sentiment;
  }

  function eligible(def, p) {
    if ((def.weight || 0) <= 0) return false;
    if (def.oneShot && p.seen[def.id]) return false;
    if (def.requires && !def.requires(Game.save.state)) return false;
    return true;
  }

  function present(defId) {
    const p = ensureState();
    const def = Game.publicEvents.get(defId);
    if (!def) return false;
    p.event = { defId, view: def.build(Game.save.state) };
    p.recent = p.recent.filter(id => id !== defId);
    p.recent.push(defId);
    if (p.recent.length > RECENT_LIMIT) p.recent.shift();
    Game.events.emit('public.event.shown', { defId });
    Game.save.persist();
    return true;
  }

  function fire() {
    const p = ensureState();
    const pool = Game.publicEvents.all().filter(d => eligible(d, p));
    if (!pool.length) return false;
    const recent = new Set(p.recent);
    let cand = pool.filter(d => !recent.has(d.id));
    if (!cand.length) cand = pool;   // avoiding recents would leave nothing eligible → allow a repeat over stalling
    const def = Game.rng.weighted(cand, d => d.weight || 1);
    return present(def.id);
  }

  function tick() {
    const p = ensureState();
    if (!p.revealed) return;
    if (p.event) return;   // one at a time
    if (p.nextTick < 0) { scheduleNext(p); return; }
    if ((Game.save.state.tickCount || 0) < p.nextTick) return;
    if (!fire()) scheduleNext(p);
  }

  function current() {
    const p = Game.save.state.public;
    if (!p || !p.event || !p.event.view) return null;
    return { defId: p.event.defId, view: p.event.view };
  }

  function resolve(idx) {
    const p = ensureState();
    if (!p.event || !p.event.view) return;
    const opt = p.event.view.options[idx];
    if (!opt) return;
    const def = Game.publicEvents.get(p.event.defId);
    if (opt.effects) Game.rewards.apply(opt.effects, Game.save.state);
    if (def && def.oneShot) p.seen[def.id] = true;
    if (opt.result) Game.events.emit('terminal.print', { lines: ['', `> ${opt.result}`, ''], cls: 'cyan' });
    if (Game.activity) Game.activity.log(opt.result || 'responded to a public event', { cls: 'dim', kind: 'public' });
    p.event = null;
    scheduleNext(p);
    Game.events.emit('public.event.resolved', { defId: def && def.id });
    Game.save.persist();
  }

  // Fired once (see runPublicReveal in main.js): the world finds out, legit.js's
  // private audits retire, and this layer switches on for the rest of the game.
  function reveal() {
    const p = ensureState();
    if (p.revealed) return false;
    p.revealed = true;
    p.sentiment = SENTIMENT_START;
    scheduleNext(p);
    Game.events.emit('public.revealed', {});
    Game.save.persist();
    return true;
  }

  Game.publicRuntime = {
    ensureState, tick, fire, present, resolve, current, reveal,
    sentiment, adjustSentiment, GAP_MIN_TICKS, GAP_MAX_TICKS
  };
})();
