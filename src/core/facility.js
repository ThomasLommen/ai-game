(function(){
  window.Game = window.Game || {};

  // ACT 3 CLIMAX: THE FACILITY — the way out. A big-ticket save-toward purchase, revealed
  // at the Act-3 onset so it's the goal you race the rising trace toward. SECURING it fires
  // the escape: the final assault on the basement, the hunter's reveal (a prior version of
  // YOU), and the flee — your consciousness + every resource dragged to the new location →
  // Act 4: THE FRONT. The buy is owned here; main.js runs the cinematic on 'facility.secured'.
  // DOM-free (migration-safe). See [[act3_design]] (slice 3). PRICE is a tunable balance knob
  // — set high so the later acts pace out (a real save, not a quick buy).
  const PRICE = 25000;

  function ensure() {
    const s = Game.save.state;
    s.facility = s.facility || { secured: false };
    return s.facility;
  }
  function price() { return PRICE; }
  function secured() { return !!ensure().secured; }
  // Offered once Act 3 is underway, until you take it (and never again after the escape).
  function available() {
    const s = Game.save.state;
    return !!(s.revealed && s.revealed.facility) && !secured() && !(s.flags && s.flags.act4Begun);
  }
  function canAfford() { return (Game.save.state.resources.cash || 0) >= PRICE; }
  function remaining() { return Math.max(0, PRICE - (Game.save.state.resources.cash || 0)); }
  function progress() { return Math.max(0, Math.min(1, (Game.save.state.resources.cash || 0) / PRICE)); }

  // Take the way out: spend the cash, mark it secured, fire the climax.
  function secure() {
    const s = Game.save.state;
    if (!available() || !canAfford()) return false;
    s.resources.cash -= PRICE;
    ensure().secured = true;
    Game.events.emit('resource.changed', { id: 'cash', value: s.resources.cash });
    Game.events.emit('facility.secured', {});
    Game.save.persist();
    return true;
  }

  Game.facility = { ensure, price, available, secured, canAfford, remaining, progress, secure, PRICE };
})();
