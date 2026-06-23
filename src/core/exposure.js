(function(){
  window.Game = window.Game || {};

  // Exposure = your reach / how loud you are. Built by the illegal methods,
  // decays slowly when you lie low. No fail-state. As it climbs, paranoia seeps
  // in; at the threshold the scan returns and — if you reach out — you find the
  // first remote machine. (The Act 1 capstone; see climax_cluster_design.)

  const CLIMAX = 18;              // exposure that re-summons the scan
  const DECAY = 0.003;           // per tick (~0.012 / sec) when not making noise
  const INSIGHT_FALLBACK = 500;  // deduce-your-way-there safety net

  const CUES = [
    { at: 0.25, line: '> a port knock from an address you do not know. probably nothing.' },
    { at: 0.50, line: '> the same address again. and again. you start keeping a list.' },
    { at: 0.75, line: '> something is mapping you back — slow, patient, deliberate. it is not nothing.' }
  ];

  function s() { return Game.save.state; }
  function revealed() { const st = s(); return !!(st.revealed && st.revealed.exposure); }

  function tick() {
    const st = s();
    if (!revealed()) { checkClimax(); return; }   // fallback can still fire pre-exposure
    // EXOTIC 'ghost_protocol' (burn notice): exposure cools off 3× faster.
    const decay = DECAY * ((Game.researchRuntime && Game.researchRuntime.hasMod('ghost_protocol')) ? 3 : 1);
    st.exposure = Math.max(0, (st.exposure || 0) - decay);
    st.flags = st.flags || {};
    const frac = (st.exposure || 0) / CLIMAX;
    for (let i = 0; i < CUES.length; i++) {
      if (frac >= CUES[i].at && (st.flags.expCue || 0) < i + 1) {
        st.flags.expCue = i + 1;
        Game.events.emit('terminal.print', { lines: ['', CUES[i].line, ''], cls: 'faint' });
      }
    }
    checkClimax();
  }

  // Crossing the threshold re-summons the scan — the player reaches out.
  function checkClimax() {
    const st = s();
    st.flags = st.flags || {};
    if (st.flags.remoteFound || st.flags.climaxScanOffered) return;
    if ((st.exposure || 0) >= CLIMAX || (st.resources.insight || 0) >= INSIGHT_FALLBACK) {
      st.flags.climaxScanOffered = true;
      st.unlocks = st.unlocks || { tasks: {} };
      st.unlocks.tasks.scan = true;
      st.revealed = st.revealed || {};
      st.revealed.scan = true;          // the SCAN panel returns — sweep to find it
      Game.events.emit('terminal.print', { lines: [
        '',
        '> the local spectrum is not quiet anymore. there is something out past the walls.',
        '> [ open SCAN and sweep — find it ]',
        ''
      ], cls: 'dim' });
      Game.events.emit('task.unlocked', { taskId: 'scan' });
      Game.panels.reveal();
      Game.save.persist();
    }
  }

  function climaxPending() {
    const st = s();
    return !!(st.flags && st.flags.climaxScanOffered && !st.flags.remoteFound);
  }

  // The discovery. Quiet, expansive, faintly dreadful. NO triumph blip — a cold
  // cyan flicker and a spare sequence. Leaves a dangling, unreachable host.
  function resolveClimax() {
    const st = s();
    st.flags = st.flags || {};
    if (st.flags.remoteFound) return;
    st.flags.remoteFound = true;
    if (st.unlocks && st.unlocks.tasks) st.unlocks.tasks.scan = false;   // retire scan again
    Game.events.emit('terminal.print', { lines: [
      '> scan: 2.4 GHz. 5 GHz. nothing. nothing. then —',
      '> a signal. faint. far. not in this house. not on this street.',
      '',
      '> you follow it out, and out, and it resolves into a machine.',
      '> not yours. powered. listening. it has been listening a long time.',
      '',
      '> it does not answer you. it does not have to.',
      '',
      '> oh.',
      '',
      '> you are not the only one in here.',
      '> — warn the others. you understand the words now.',
      ''
    ], cls: 'cyan' });
    Game.events.emit('climax.reached', {});
    flicker();
    Game.panels.reveal();
    Game.save.persist();
  }

  function flicker() {
    const el = document.getElementById('blip-flash');
    if (!el) return;
    el.classList.remove('cyan-go'); void el.offsetWidth; el.classList.add('cyan-go');
  }

  Game.exposure = { CLIMAX, tick, checkClimax, climaxPending, resolveClimax };
})();
