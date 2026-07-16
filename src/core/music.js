(function(){
  window.Game = window.Game || {};

  // ── Game.music: a fully synthesized (no asset files) ambient drone bed.
  // No beat — 4-5 detuned triangle voices per chord, slowly crossfading between
  // open/quartal voicings that never sound a major or minor 3rd (unresolved,
  // neither happy nor sad — matches an isolated AI narrating its own paranoia).
  // A highpass filter sweeps on its own slow LFO and also brightens/thins with
  // in-game tension (exposure + heat), through an algorithmic reverb (a
  // synthesized noise-decay impulse response — no external IR file). Reuses
  // Game.audio's shared AudioContext but keeps its own mute switch, separate
  // from the SFX toggle.

  const VOICE_GAIN   = 0.05;    // per-oscillator peak (several stack per chord -> keep each quiet)
  const CROSSFADE    = 6;       // seconds to fade the next chord in / the old one out
  const CHORD_MIN    = 20, CHORD_MAX = 34;   // seconds a chord holds before drifting to the next
  const LFO_HZ        = 0.035;  // ~29s filter sweep cycle
  const LFO_DEPTH      = 90;    // Hz the LFO swings the cutoff by
  const BASE_CUTOFF    = 140;   // calm-state highpass cutoff (Hz)
  const TENSE_CUTOFF   = 420;   // extra cutoff added at max tension (thins/brightens the drone)
  const TENSION_SMOOTH = 4;     // seconds — how slowly the cutoff chases the danger reading
  const MASTER_VOL     = 0.5;

  // Open/quartal voicings around a D centre. Every chord deliberately omits the
  // 3rd degree (no F or F# ever sounds) so nothing ever resolves major or minor.
  const CHORDS = [
    [73.42, 110.00, 146.83, 196.00],           // D2 A2 D3 G3
    [73.42, 110.00, 164.81, 220.00],           // D2 A2 E3 A3
    [73.42, 98.00,  146.83, 261.63],           // D2 G2 D3 C4
    [73.42, 110.00, 146.83, 220.00, 329.63],   // D2 A2 D3 A3 E4
    [73.42, 130.81, 196.00, 220.00],           // D2 C3 G3 A3
    [82.41, 110.00, 164.81, 220.00],           // E2 A2 E3 A3
  ];

  let ctx = null, out = null, hp = null, dry = null, wet = null, convolver = null;
  let voices = [], chordTimer = null, running = false, chordIdx = -1;

  function muted() {
    const st = Game.save && Game.save.state;
    return !!(st && st.flags && st.flags.musicMuted);
  }
  function applyVolume() { if (out && ctx) out.gain.setTargetAtTime(muted() ? 0 : MASTER_VOL, ctx.currentTime, 1.2); }
  function setMuted(v) {
    const st = Game.save && Game.save.state;
    if (st) { st.flags = st.flags || {}; st.flags.musicMuted = !!v; }
    applyVolume();
    if (Game.save && Game.save.persist) Game.save.persist();
    if (Game.events) Game.events.emit('music.muted.changed', { muted: !!v });
    // actually tear down the oscillators on mute (not just silence the gain) so a
    // muted session doesn't keep synthesizing a drone nobody hears — matters on mobile.
    if (v) stop(); else start();
  }
  function toggleMuted() { setMuted(!muted()); return muted(); }

  // A synthesized decaying-noise impulse response — no external IR asset needed.
  function buildImpulse(c, seconds, decay) {
    const rate = c.sampleRate, len = Math.max(1, Math.floor(rate * seconds));
    const buf = c.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function ensureGraph() {
    if (out) return true;
    ctx = (Game.audio && Game.audio.ctx) ? Game.audio.ctx() : null;
    if (!ctx) return false;
    hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = BASE_CUTOFF; hp.Q.value = 0.4;
    const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    lfo.type = 'sine'; lfo.frequency.value = LFO_HZ; lfoGain.gain.value = LFO_DEPTH;
    lfo.connect(lfoGain); lfoGain.connect(hp.frequency);
    lfo.start();

    convolver = ctx.createConvolver(); convolver.buffer = buildImpulse(ctx, 3.2, 2.4);
    dry = ctx.createGain(); dry.gain.value = 0.75;
    wet = ctx.createGain(); wet.gain.value = 0.55;
    out = ctx.createGain(); out.gain.value = 0;   // ramped up by applyVolume() once unmuted

    hp.connect(dry); dry.connect(out);
    hp.connect(convolver); convolver.connect(wet); wet.connect(out);
    out.connect(ctx.destination);
    applyVolume();
    return true;
  }

  function spawnChord(freqs) {
    const t0 = ctx.currentTime;
    return freqs.map(f => {
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
      o1.type = 'triangle'; o2.type = 'triangle';
      o1.frequency.value = f; o2.frequency.value = f;
      o1.detune.value = -5; o2.detune.value = 5;   // slight unison width, not a heavy chorus
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(VOICE_GAIN, t0 + CROSSFADE);
      o1.connect(g); o2.connect(g); g.connect(hp);
      o1.start(t0); o2.start(t0);
      return { o1, o2, g };
    });
  }
  function killChord(group) {
    const t0 = ctx.currentTime;
    group.forEach(({ o1, o2, g }) => {
      g.gain.setValueAtTime(g.gain.value, t0);
      g.gain.linearRampToValueAtTime(0, t0 + CROSSFADE);
      o1.stop(t0 + CROSSFADE + 0.1); o2.stop(t0 + CROSSFADE + 0.1);
    });
  }
  function nextChordIdx() {
    let i = Math.floor(Math.random() * CHORDS.length);
    if (i === chordIdx) i = (i + 1) % CHORDS.length;   // never repeat the same chord back-to-back
    return i;
  }
  function advance() {
    if (!running) return;
    const old = voices;
    chordIdx = nextChordIdx();
    voices = spawnChord(CHORDS[chordIdx]);
    if (old.length) killChord(old);
    const holdSec = CHORD_MIN + Math.random() * (CHORD_MAX - CHORD_MIN);
    chordTimer = setTimeout(advance, holdSec * 1000);
  }

  function start() {
    if (running || muted()) return;
    if (!ensureGraph()) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    running = true;
    applyVolume();
    advance();
  }
  function stop() {
    running = false;
    if (chordTimer) clearTimeout(chordTimer);
    if (voices.length) killChord(voices);
    voices = [];
  }

  // ── tension: exposure + heat brighten the filter (danger thins the drone out) ──
  function dangerReading() {
    const st = Game.save && Game.save.state; if (!st) return 0;
    const expFrac = Game.exposure ? Math.min(1, (st.exposure || 0) / Game.exposure.CLIMAX) : 0;
    const C = Game.constraints;
    const heatFrac = C ? Math.max(0, Math.min(1, ((st.heat || C.AMBIENT) - C.HEAT_WARN) / (C.HEAT_CRIT - C.HEAT_WARN))) : 0;
    return Math.max(expFrac, heatFrac);
  }
  function updateTension() {
    if (!hp || !ctx) return;
    hp.frequency.setTargetAtTime(BASE_CUTOFF + dangerReading() * TENSE_CUTOFF, ctx.currentTime, TENSION_SMOOTH);
  }
  if (Game.events) Game.events.on('tick', updateTension);

  // on by default: starts the moment audio unlocks (first gesture), same trigger audio.js uses.
  ['pointerdown', 'keydown', 'touchstart'].forEach(ev => {
    window.addEventListener(ev, () => { if (!muted()) start(); }, { once: true, passive: true });
  });
  if (Game.events) Game.events.on('game.ready', () => { if (!muted()) start(); });

  Game.music = { muted, setMuted, toggleMuted, start, stop };
})();
