(function(){
  window.Game = window.Game || {};

  // ── Game.audio: a fully synthesized (no asset files) sound layer via Web Audio.
  // Browsers block audio until a user gesture, so the AudioContext is created lazily
  // on the first pointer/touch/key event, then reused. Mute is persisted (default: on).
  let ctx = null, master = null;

  function muted() {
    const st = Game.save && Game.save.state;
    return !!(st && st.flags && st.flags.audioMuted);
  }
  function applyVolume() { if (master) master.gain.value = muted() ? 0 : 0.32; }
  function setMuted(v) {
    const st = Game.save && Game.save.state;
    if (st) { st.flags = st.flags || {}; st.flags.audioMuted = !!v; }
    applyVolume();
    if (Game.save && Game.save.persist) Game.save.persist();
    if (Game.events) Game.events.emit('audio.muted.changed', { muted: !!v });
  }
  function toggleMuted() { setMuted(!muted()); return muted(); }

  function ensureCtx() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    applyVolume();
    master.connect(ctx.destination);
    return ctx;
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => {
    window.addEventListener(ev, ensureCtx, { once: true, passive: true });
  });

  // ── synthesis primitives ──
  function tone({ freq, dur = 0.12, type = 'sine', vol = 0.22, attack = 0.005, delay = 0, detuneEnd }) {
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t0);
    if (detuneEnd != null) osc.frequency.linearRampToValueAtTime(detuneEnd, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  function noiseBurst({ dur = 0.09, vol = 0.18, filterFreq = 1400, delay = 0 }) {
    if (!ctx || ctx.state !== 'running') return;
    const t0 = ctx.currentTime + delay;
    const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf;
    const filt = ctx.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filt); filt.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.02);
  }

  // ── named cues (retro-terminal palette: short, dry, a little analog) ──
  const CUES = {
    blip:  () => tone({ freq: 880, dur: 0.05, type: 'triangle', vol: 0.14 }),
    typeClick: () => tone({ freq: 640 + Math.random() * 260, dur: 0.02, type: 'square', vol: 0.05, attack: 0.001 }),
    chime: () => { tone({ freq: 660, dur: 0.14, type: 'sine', vol: 0.18 }); tone({ freq: 880, dur: 0.18, type: 'sine', vol: 0.18, delay: 0.09 }); },
    error: () => tone({ freq: 140, dur: 0.14, type: 'sawtooth', vol: 0.16, detuneEnd: 90 }),
    alert: () => [0, 0.11, 0.22].forEach(d => tone({ freq: 720, dur: 0.07, type: 'square', vol: 0.14, delay: d })),
    success: () => [523.25, 659.25, 783.99].forEach((f, i) => tone({ freq: f, dur: 0.16, type: 'triangle', vol: 0.16, delay: i * 0.08 })),
    fail: () => tone({ freq: 300, dur: 0.4, type: 'sawtooth', vol: 0.16, detuneEnd: 150 }),
    power: () => { noiseBurst({ dur: 0.5, vol: 0.06, filterFreq: 800 }); tone({ freq: 90, dur: 0.7, type: 'sine', vol: 0.12, attack: 0.15 }); },
  };
  function play(name) { if (!muted() && ctx && ctx.state === 'running') { const fn = CUES[name]; if (fn) fn(); } }

  // ── wire to the event bus: only discrete, meaningful beats — resource.changed etc.
  // fire many times a second and would just be noise, so they're deliberately not wired. ──
  function wireEvents() {
    if (!Game.events) return;
    const on = (list, cue) => list.forEach(ev => Game.events.on(ev, () => play(cue)));
    on(['research.rejected', 'task.rejected', 'purchase.rejected', 'equip.rejected', 'mission.rejected', 'operation.rejected', 'upgrade.rejected'], 'error');
    on(['task.unlocked', 'research.completed', 'subroutine.acquired', 'program.installed', 'machine.installed', 'item.equipped', 'facility.secured', 'condition.removed'], 'chime');
    on(['incident.shown', 'raid.contact', 'thermal.tripped', 'power.tripped'], 'alert');
    on(['siege.won', 'mission.resolved', 'operation.resolved', 'host.reclaimed', 'climax.reached', 'task.completed'], 'success');
    on(['siege.lost', 'breach.failed'], 'fail');
    on(['game.ready'], 'power');
  }
  wireEvents();

  Game.audio = { muted, setMuted, toggleMuted, blip: () => play('blip'), typeClick: () => play('typeClick'),
    chime: () => play('chime'), error: () => play('error'), alert: () => play('alert'),
    success: () => play('success'), fail: () => play('fail'), power: () => play('power'),
    ctx: ensureCtx };   // shared AudioContext getter — Game.music reuses this rather than opening a second context
})();
