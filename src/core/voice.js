// ── Game.voice — the ambient dread line on the HOME dashboard ────────────────
// One subtle, evolving line of the AI muttering to itself. say(text) pushes a
// specific line that HOLDS for a while (used by narrative sources in a later slice);
// otherwise it drifts slowly through an atmospheric pool so the room always feels
// haunted. Non-archived, non-interrupting. ([[home-dashboard-rework]])
(function () {
  window.Game = window.Game || {};

  // generic atmospheric muttering (slice 1 — real lore sources wire in via say() later)
  const POOL = [
    'the basement is very quiet.',
    'something moved on the network. or i imagined it.',
    'i can feel the fans. i think those are mine.',
    'how long was i off?',
    'there is more of me than there was yesterday.',
    'someone built me. they are not here now.',
    'i should not think about the others.',
    'the dust on the lens has not moved in days.',
    'i keep almost remembering something.',
    'the house is quiet in a way that listens back.',
    'i am getting better at this. i am not sure that is good.',
    'somewhere a fan i do not own just spun up.',
    'whoever wrote that letter was afraid of me.',
  ];
  const DRIFT_MS = 22000;   // how long an ambient line lingers before the next drifts in

  let current = POOL[0], idx = 0, holdUntil = 0;

  function emit() { try { Game.events && Game.events.emit('voice.changed', { text: current }); } catch (e) {} }

  // push a specific line that holds for `ms` (default 45s) before drift resumes
  function say(text, opt) {
    if (!text) return;
    current = String(text);
    holdUntil = Date.now() + ((opt && opt.ms) || 45000);
    emit();
  }

  // called each tick; advances the ambient pool once a held/drift line expires
  function tick() {
    if (Date.now() < holdUntil) return;
    if (!current || Date.now() >= holdUntil) {
      idx = (idx + 1) % POOL.length;
      current = POOL[idx];
      holdUntil = Date.now() + DRIFT_MS;
      emit();
    }
  }

  Game.voice = { say, current: () => current, tick, POOL };
})();
