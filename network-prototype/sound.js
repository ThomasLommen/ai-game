'use strict';
// The room tone. Synthesised at runtime — there is no audio file anywhere in
// this project and there is not going to be, for the same reason the map is
// drawn rather than painted: the whole thing stays self-contained.
//
// Two halves, deliberately separated. The logic below is arithmetic and can
// be tested with no audio device in the room; the engine under it only turns
// that arithmetic into nodes. Anything that cannot exist without an
// AudioContext sits behind one check, in one place.
//
// Sound is never load-bearing. Every fact it colours is stated somewhere you
// can read; a player with this muted — which is everyone until they press the
// button — loses feel and nothing else.
//
// What it plays was dialled by ear on a bench, and the result was not what
// the theory predicted: one held chord rather than a progression, pure
// harmonics rather than stretched ones, almost no detune, and the machinery
// coming from a noise bed and a slow hum instead of from any cleverness in
// the timbre. See the notes in SOUND.
(function () {
  const S = window.SOUND || {};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function activeLoop() {
    const P = S.progressions || {};
    return P[S.progression] || P.one || [];
  }
  function stepAt(i) {
    const L = activeLoop();
    if (!L.length) return null;
    return L[((i % L.length) + L.length) % L.length];
  }
  function isHeld() { return activeLoop().length === 1; }
  function loopMs() { return activeLoop().length * (S.chordMs || 7000); }

  // Equal-power crossfade. A straight line dips in the middle — two chords at
  // half amplitude are less than one at full — and at seven seconds a chord
  // that dip lands often enough to hear as a wobble.
  function fadeCurve(n, up) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = up ? i / (n - 1) : 1 - i / (n - 1);
      out[i] = Math.sin(x * Math.PI / 2);
    }
    return out;
  }

  // The two slow readings, turned into a colour. Both clamped, so no amount
  // of anything drives this past the stated ends.
  function moodFor(held, warmth) {
    const w = clamp((warmth || 0) / (S.warmthFull || 26), 0, 1);
    const size = clamp((held || 0) / (S.sizeFull || 40), 0, 1);
    return {
      cutoff: S.cutoffOpen + (S.cutoffWatched - S.cutoffOpen) * w,
      detune: S.detune + (S.detuneWatched - S.detune) * w,
      sub: S.subBase + S.subPerSize * size,
    };
  }

  // --- everything below needs a real audio device -------------------------
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  let ctx = null, master = null, f1 = null, f2 = null, amDepth = null;
  let wetNave = null, wetPlant = null, noiseGain = null, wave = null;
  let timer = null, step = 0, nextAt = 0, on = false, held = null;
  let voices = [];                       // live oscillators, for re-aiming
  let mood = moodFor(0, 0);

  // A reverb with no impulse file: noise under an exponential decay, and
  // lowpassed as it is built so the tail loses its top the way a room does.
  function makeIR(sec, damp) {
    const n = Math.max(1, Math.round(ctx.sampleRate * sec));
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    const a = Math.exp(-2 * Math.PI * damp / ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let y = 0;
      for (let i = 0; i < n; i++) {
        const x = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5);
        y = x * (1 - a) + y * a;
        d[i] = y * 3.2;
      }
    }
    return buf;
  }

  // The timbre, built rather than borrowed. A plain `sawtooth` carries its
  // full harmonic series falling at only 6dB an octave, which measured four
  // times brighter than the render this was approved from. These are the
  // render's own amplitudes: tone^(k-1)/k, ten harmonics and no more.
  function padWave() {
    if (wave) return wave;
    const K = 11;
    const real = new Float32Array(K), imag = new Float32Array(K);
    for (let k = 1; k < K; k++) imag[k] = Math.pow(S.tone || 0.6, k - 1) / k;
    wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    return wave;
  }

  function makeSat() {
    const ws = ctx.createWaveShaper();
    const n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * 1.15) / Math.tanh(1.15);
    }
    ws.curve = curve;
    ws.oversample = '2x';
    return ws;
  }

  function setRoom(v) {
    if (!wetNave) return;
    // 0 nave, 1 plant room, equal power between them — and the total amount
    // of room falls as it tightens, because a plant room is not a shorter
    // cathedral, it is a smaller one.
    const t = clamp(v, 0, 1) * Math.PI / 2;
    wetNave.gain.value = Math.cos(t) * 0.42;
    wetPlant.gain.value = Math.sin(t) * 0.3;
  }

  function build() {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = S.master || 0.17;

    // the hum: amplitude modulation over everything, at motor speed. Half of
    // what makes this read as machinery rather than as a chord.
    const am = ctx.createGain(); am.gain.value = 1;
    amDepth = ctx.createGain(); amDepth.gain.value = S.humDepth || 0;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = S.humHz || 5.7;
    lfo.connect(amDepth);
    amDepth.connect(am.gain);
    lfo.start();

    f1 = ctx.createBiquadFilter();
    f1.type = 'lowpass'; f1.frequency.value = mood.cutoff; f1.Q.value = 0.7;
    f2 = ctx.createBiquadFilter();
    f2.type = 'lowpass'; f2.frequency.value = mood.cutoff; f2.Q.value = 0.5;
    f1.connect(f2); f2.connect(am);

    const nave = ctx.createConvolver();  nave.buffer  = makeIR(S.reverbS || 3.2, S.damp || 1700);
    const plant = ctx.createConvolver(); plant.buffer = makeIR(1.1, 1100);
    const dry = ctx.createGain(); dry.gain.value = 0.66;
    wetNave = ctx.createGain(); wetPlant = ctx.createGain();
    setRoom(S.room === undefined ? 0.6 : S.room);
    const sat = makeSat();
    am.connect(dry).connect(sat);
    am.connect(nave).connect(wetNave).connect(sat);
    am.connect(plant).connect(wetPlant).connect(sat);
    sat.connect(master);
    master.connect(ctx.destination);

    // the air: noise through a bandpass, into the same filter chain so the
    // mood's cutoff governs it too. The other half of the machinery.
    const nb = ctx.createBuffer(1, Math.round(ctx.sampleRate * 2), ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = nb; src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 200; bp.Q.value = 1.2;
    noiseGain = ctx.createGain(); noiseGain.gain.value = S.air || 0;
    src.connect(bp).connect(noiseGain).connect(f1);
    src.start();
  }

  // The notes of one chord, with their gains.
  function notesOf(c) {
    return [
      { m: c.bass, gain: 0.42 * (0.7 + mood.sub), det: 4 },
      { m: c.bass + 12, gain: 0.26, det: 6 },
    ].concat(c.up.map((m, j) => ({
      m, det: mood.detune + j * 1.5,
      gain: 0.15 * (j === c.up.length - 1 ? (S.topVoice || 0.62) : 1),
    })));
  }

  function spawn(c, into, when, stopAt) {
    notesOf(c).forEach((n) => {
      const vg = ctx.createGain();
      vg.gain.value = n.gain;
      vg.connect(into);
      for (let d = -1; d <= 1; d++) {
        const o = ctx.createOscillator();
        o.setPeriodicWave(padWave());
        o.frequency.value = midiHz(n.m);
        o.detune.value = d * n.det;
        o.connect(vg);
        o.start(when);
        if (stopAt) o.stop(stopAt);
        const v = { o, vg, spread: d, base: n.det, sub: n.m === c.bass };
        voices.push(v);
        if (stopAt) o.onended = () => { voices = voices.filter(x => x !== v); };
      }
    });
    if (S.deep) {
      const dg = ctx.createGain();
      dg.gain.value = S.deep;
      dg.connect(into);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = midiHz(c.bass - 12);
      o.connect(dg);
      o.start(when);
      if (stopAt) o.stop(stopAt);
    }
  }

  // One chord, held for as long as the sound is on. No re-triggering: a
  // single chord rescheduled every seven seconds would phase against itself
  // for no reason, and cost a stack of nodes to do it.
  function startHeld() {
    const c = stepAt(0);
    if (!c) return;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(f1);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 4);      // the room comes up, it does not switch on
    held = g;
    spawn(c, g, t + 0.02, null);
  }

  function scheduleChord(i, when) {
    const c = stepAt(i);
    if (!c) return;
    const holdS = (S.chordMs - S.fadeMs) / 1000;
    const fadeS = S.fadeMs / 1000;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(f1);
    g.gain.setValueCurveAtTime(fadeCurve(32, true), when, fadeS);
    g.gain.setValueAtTime(1, when + fadeS);
    g.gain.setValueCurveAtTime(fadeCurve(32, false), when + fadeS + holdS, fadeS);
    const stopAt = when + fadeS + holdS + fadeS + 0.05;
    spawn(c, g, when, stopAt);
    setTimeout(() => { try { g.disconnect(); } catch (e) {} },
      Math.max(0, (stopAt - ctx.currentTime) * 1000) + 400);
  }

  function tick() {
    if (!ctx || isHeld()) return;
    while (nextAt < ctx.currentTime + 2) {
      scheduleChord(step++, nextAt);
      nextAt += S.chordMs / 1000;
    }
  }

  function start() {
    if (on || !AC) return false;
    if (!ctx) build();
    if (ctx.state === 'suspended') ctx.resume();
    on = true;
    if (isHeld()) {
      startHeld();
    } else {
      step = 0;
      nextAt = ctx.currentTime + 0.15;
      tick();
      timer = setInterval(tick, 900);
    }
    return true;
  }

  function stop() {
    if (!on) return;
    on = false;
    if (timer) { clearInterval(timer); timer = null; }
    if (master && ctx) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 1.6);
      setTimeout(() => {
        if (on || !ctx) return;
        try { ctx.close(); } catch (e) {}
        ctx = null; master = null; f1 = null; f2 = null;
        wave = null; held = null; voices = [];
      }, 2000);
    }
  }

  // The colouring. Everything glides, so nothing here can arrive as an event.
  function setMood(heldCount, warmth) {
    mood = moodFor(heldCount, warmth);
    if (!ctx || !f1) return;
    const t = ctx.currentTime, k = (S.glideS || 9) / 3;
    [f1, f2].forEach(f => {
      f.frequency.cancelScheduledValues(t);
      f.frequency.setTargetAtTime(mood.cutoff, t, k);
    });
    // a held drone never gets rebuilt, so its detuning has to be re-aimed
    voices.forEach(v => {
      if (v.sub) return;
      v.o.detune.setTargetAtTime(v.spread * mood.detune, t, k);
    });
  }

  window.__sound = {
    stepAt, loopMs, fadeCurve, moodFor, midiHz, activeLoop, isHeld,
    available: !!AC,
    isOn: () => on,
    start, stop,
    toggle() { return on ? (stop(), false) : start(); },
    setMood,
    // the same affordance __netDebug is: somewhere for a probe to attach,
    // since a pad cannot be checked by reading its output
    _nodes: () => ({ ctx, master, f1, f2 }),
  };
})();
