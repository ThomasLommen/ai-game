'use strict';
// The room tone. Synthesised at runtime — there is no audio file anywhere in
// this project and there is not going to be, for the same reason the map is
// drawn rather than painted: the whole thing has to stay self-contained.
//
// Two halves, deliberately separated. The musical logic below is arithmetic
// and can be tested with no audio device in the room; the engine under it
// only ever turns that arithmetic into nodes. Anything that cannot exist
// without an AudioContext is behind one check, in one place.
//
// Sound is never load-bearing. Every fact the pad colours is stated somewhere
// you can read; a player with this muted — which is everyone, until they turn
// it on — loses feel and nothing else.
(function () {
  const S = window.SOUND || {};
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Which chord is playing on the nth step, forever.
  function stepAt(i) {
    const L = S.loop || [];
    if (!L.length) return null;
    return L[((i % L.length) + L.length) % L.length];
  }
  function loopMs() { return (S.loop || []).length * (S.chordMs || 7000); }

  // Equal-power crossfade. A straight line dips in the middle — two chords at
  // half amplitude are less than one at full — and at seven seconds a chord
  // that dip lands often enough to hear as a wobble. sin/cos holds the level
  // through the change.
  function fadeCurve(n, up) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = up ? i / (n - 1) : 1 - i / (n - 1);
      out[i] = Math.sin(x * Math.PI / 2);
    }
    return out;
  }

  // The two slow readings, turned into a colour. Both are clamped, so no
  // amount of anything drives this past the stated ends.
  function moodFor(held, warmth) {
    const w = clamp((warmth || 0) / (S.warmthFull || 26), 0, 1);
    const size = clamp((held || 0) / (S.sizeFull || 40), 0, 1);
    return {
      cutoff: S.cutoff + (S.cutoffWatched - S.cutoff) * w,
      detune: S.detune + (S.detuneWatched - S.detune) * w,
      sub: S.subBase + S.subPerSize * size,
    };
  }

  // --- everything below needs a real audio device -------------------------
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  let ctx = null, master = null, filt = null, filt2 = null, dry = null, wet = null;
  let timer = null, step = 0, nextAt = 0, on = false;
  let mood = moodFor(0, 0);

  // A reverb with no impulse file: noise, shaped by an exponential decay —
  // and lowpassed as it is built, so the tail loses its top the way a real
  // room does. Undamped, this was bright hiss hanging behind every chord and
  // a good part of why the first pass sounded airy.
  function makeIR(seconds) {
    const n = Math.max(1, Math.round(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(2, n, ctx.sampleRate);
    const a = Math.exp(-2 * Math.PI * (S.damp || 2400) / ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      let y = 0;
      for (let i = 0; i < n; i++) {
        const x = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6);
        y = x * (1 - a) + y * a;
        d[i] = y * 3;                     // the lowpass costs level; take it back
      }
    }
    return buf;
  }

  // The timbre, built rather than borrowed. A plain `sawtooth` node carries
  // its full harmonic series falling at only 6dB an octave, and measured
  // against the render this was approved from it came out four times as
  // bright — 447 Hz of spectral centroid against 111. So the wave is
  // constructed with exactly the harmonic amplitudes that render used:
  // tone^(k-1)/k, ten harmonics and no more. The filter is then free to do
  // the colouring instead of spending itself fighting the oscillator.
  let wave = null;
  function padWave() {
    if (wave) return wave;
    const K = 11;                        // 1..10
    const real = new Float32Array(K), imag = new Float32Array(K);
    const tone = S.tone || 0.34;
    for (let k = 1; k < K; k++) imag[k] = Math.pow(tone, k - 1) / k;
    wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    return wave;
  }

  // Gentle saturation. It thickens the low end instead of brightening it,
  // which is the opposite of what distortion usually does and exactly what
  // this wants.
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

  function build() {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = S.master || 0.17;
    filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = mood.cutoff;
    filt.Q.value = 0.7;
    // a second pole: 12dB an octave leaves too much shine on a stack this
    // wide, and the mood coupling has more to bite on at 24
    filt2 = ctx.createBiquadFilter();
    filt2.type = 'lowpass';
    filt2.frequency.value = mood.cutoff;
    filt2.Q.value = 0.5;
    filt.connect(filt2);
    const conv = ctx.createConvolver();
    conv.buffer = makeIR(S.reverbS || 3.2);
    // ...and the wet path is taken off the top again on the way out, so the
    // reverb sits behind the pad rather than on top of it
    const wetLp = ctx.createBiquadFilter();
    wetLp.type = 'lowpass';
    wetLp.frequency.value = (S.damp || 2400) * 0.7;
    dry = ctx.createGain(); dry.gain.value = 0.62;
    wet = ctx.createGain(); wet.gain.value = 0.45;
    const sat = makeSat();
    filt2.connect(dry).connect(sat);
    filt2.connect(conv).connect(wetLp).connect(wet).connect(sat);
    sat.connect(master);
    master.connect(ctx.destination);
  }

  // One chord: a stack of detuned sawtooths under an equal-power envelope,
  // scheduled ahead of time and torn down after it has finished sounding.
  function scheduleChord(i, when) {
    const c = stepAt(i);
    if (!c) return;
    const holdS = (S.chordMs - S.fadeMs) / 1000;
    const fadeS = S.fadeMs / 1000;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(filt);
    // rise, hold, fall — the fall overlaps the next chord's rise exactly
    g.gain.setValueCurveAtTime(fadeCurve(32, true), when, fadeS);
    g.gain.setValueAtTime(1, when + fadeS);
    g.gain.setValueCurveAtTime(fadeCurve(32, false), when + fadeS + holdS, fadeS);

    const notes = [
      { m: c.bass, gain: 0.42 * (0.7 + mood.sub), det: 4 },
      { m: c.bass + 12, gain: 0.26, det: 6 },
    ].concat(c.up.map((m, j) => ({
      // the top of the stack is the airiest thing in it, so it is the
      // quietest — see SOUND.topVoice
      m, det: mood.detune + j * 1.5,
      gain: 0.15 * (j === c.up.length - 1 ? (S.topVoice || 0.62) : 1),
    })));

    const stopAt = when + fadeS + holdS + fadeS + 0.05;
    // the weight underneath: one sine an octave below the pedal, no harmonics
    // at all, there to be felt rather than heard
    if (S.deep) {
      const dg = ctx.createGain();
      dg.gain.value = S.deep;
      dg.connect(g);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = midiHz(c.bass - 12);
      o.connect(dg);
      o.start(when); o.stop(stopAt);
    }
    notes.forEach((n) => {
      const vg = ctx.createGain();
      vg.gain.value = n.gain;
      vg.connect(g);
      for (let d = -1; d <= 1; d++) {
        const o = ctx.createOscillator();
        o.setPeriodicWave(padWave());
        o.frequency.value = midiHz(n.m);
        o.detune.value = d * n.det;
        o.connect(vg);
        o.start(when);
        o.stop(stopAt);
      }
    });
    setTimeout(() => { try { g.disconnect(); } catch (e) {} },
      Math.max(0, (stopAt - ctx.currentTime) * 1000) + 400);
  }

  // Schedule a little ahead of the clock rather than on it: a timer that
  // fires late must not put a gap in the pad.
  function tick() {
    if (!ctx) return;
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
    step = 0;
    nextAt = ctx.currentTime + 0.15;
    tick();
    timer = setInterval(tick, 900);
    return true;
  }

  function stop() {
    if (!on) return;
    on = false;
    clearInterval(timer); timer = null;
    // let whatever is sounding finish rather than cutting it — this is a room
    // being left, not a switch being thrown
    if (master) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 1.4);
      setTimeout(() => {
        if (on || !ctx) return;
        try { ctx.close(); } catch (e) {}
        ctx = null; master = null; filt = null; filt2 = null; wave = null;
      }, 1800);
    }
  }

  // The colouring. Called on render with the two slow readings; everything
  // glides, so nothing here can ever arrive as an event.
  function setMood(held, warmth) {
    mood = moodFor(held, warmth);
    if (!ctx || !filt) return;
    const t = ctx.currentTime, k = (S.glideS || 9) / 3;
    [filt, filt2].forEach(f => {
      f.frequency.cancelScheduledValues(t);
      f.frequency.setTargetAtTime(mood.cutoff, t, k);
    });
  }

  const api = {
    // logic, always available
    stepAt, loopMs, fadeCurve, moodFor, midiHz,
    // engine, real only where there is audio
    available: !!AC,
    isOn: () => on,
    start, stop,
    toggle() { return on ? (stop(), false) : start(); },
    setMood,
    // The same affordance __netDebug is: a way in, for measuring. The pad is
    // the one thing in this project that cannot be checked by reading its
    // output, so a probe needs somewhere to attach an analyser.
    _nodes: () => ({ ctx, master, filt, filt2 }),
  };
  window.__sound = api;
})();
