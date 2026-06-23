(function(){
  window.Game = window.Game || {};

  // RETIRED by the pacing redesign. The old linear objective chain + its
  // "objective complete" terminal lines are gone — Act 1 now teaches through the
  // interface (visible walls + one-time per-verb hints). The runtime is kept as
  // an inert stub so the many evaluate() call sites stay harmless no-ops.
  function current() { return null; }
  function evaluate() { return false; }

  Game.objectivesRuntime = { current, evaluate };
})();
