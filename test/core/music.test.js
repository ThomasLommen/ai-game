'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/load-game');

// music.js is a fully synthesized (no asset files) Web Audio ambient drone.
// Like audio.test.js, real synthesis can't be meaningfully asserted on in
// Node, so a fake AudioContext just counts/records node creation and param
// automation calls. Unlike audio.js (one-shot cues), music.js schedules its
// own chord-advance via setTimeout, so the harness also fakes timers -
// otherwise a real 20-34s setTimeout would leak past the test and hang the
// runner. Fake timers just record the callback; tests fire them manually.
function makeFakeAudioContext() {
  const created = { osc: 0, gain: 0, filter: 0, convolver: 0, buffer: 0 };
  const oscillators = [], filters = [];
  class Param {
    constructor(v) { this.value = v; }
    setValueAtTime(v) { this.value = v; }
    linearRampToValueAtTime(v) { this.value = v; }
    setTargetAtTime(v) { this.value = v; }
  }
  class FakeGain { constructor() { created.gain++; this.gain = new Param(1); } connect() {} }
  class FakeOsc {
    constructor() {
      created.osc++;
      this.frequency = new Param(440); this.detune = new Param(0); this.type = 'sine';
      this.started = false; this.stopped = false;
      oscillators.push(this);
    }
    connect() {} start() { this.started = true; } stop() { this.stopped = true; }
  }
  class FakeFilter {
    constructor() { created.filter++; this.frequency = new Param(0); this.Q = new Param(1); this.type = 'lowpass'; filters.push(this); }
    connect() {}
  }
  class FakeConvolver { constructor() { created.convolver++; this.buffer = null; } connect() {} }
  class FakeBuffer {
    constructor(ch, len) { created.buffer++; this._chs = Array.from({ length: ch }, () => new Float32Array(len)); }
    getChannelData(i) { return this._chs[i]; }
  }
  class FakeAC {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; this.sampleRate = 44100; }
    createGain() { return new FakeGain(); }
    createOscillator() { return new FakeOsc(); }
    createBiquadFilter() { return new FakeFilter(); }
    createConvolver() { return new FakeConvolver(); }
    createBuffer(ch, len) { return new FakeBuffer(ch, len); }
    resume() { return Promise.resolve(); }
  }
  return { ctx: new FakeAC(), created, oscillators, filters };
}

function makeFakeTimers() {
  let id = 1; const pending = {};
  return {
    setTimeout: (fn) => { const i = id++; pending[i] = fn; return i; },
    clearTimeout: (i) => { delete pending[i]; },
    fireOne: () => { const k = Object.keys(pending)[0]; if (k == null) return false; const fn = pending[k]; delete pending[k]; fn(); return true; },
    pendingCount: () => Object.keys(pending).length,
  };
}

function freshMusic({ hasCtx = true, randomSeq } = {}) {
  const listeners = {};
  const domListeners = {};
  let persistCount = 0;
  const state = { flags: {} };
  const audioFake = hasCtx ? makeFakeAudioContext() : null;
  const timers = makeFakeTimers();
  const Game = {
    save: { state, persist: () => { persistCount++; } },
    events: {
      on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
      emit(ev, payload) { (listeners[ev] || []).forEach(fn => fn(payload)); },
    },
    audio: { ctx: () => (audioFake ? audioFake.ctx : null) },
    exposure: { CLIMAX: 18 },
    constraints: { AMBIENT: 18, HEAT_WARN: 60, HEAT_CRIT: 90 },
  };
  const globals = {
    addEventListener: (type, fn) => { (domListeners[type] = domListeners[type] || []).push(fn); },
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
  };
  // pinMathRandom (load-game.js) accepts a plain constant, not just a function -
  // every roll returns the same value, which is exactly what's needed to prove
  // nextChordIdx()'s anti-repeat guard actually moves off a forced index 0.
  const pinMathRandom = randomSeq ? randomSeq[0] : undefined;
  const loaded = loadGame(['core/music.js'], { Game, globals, pinMathRandom });
  return {
    music: loaded.music, state, timers,
    created: audioFake ? audioFake.created : null,
    oscillators: audioFake ? audioFake.oscillators : null,
    filters: audioFake ? audioFake.filters : null,
    ctx: audioFake ? audioFake.ctx : null,
    persistCount: () => persistCount,
    emit: (ev, payload) => Game.events.emit(ev, payload),
    on: (ev, fn) => Game.events.on(ev, fn),
  };
}
// chord voices always set a nonzero detune (±5); the LFO oscillator never does.
const chordOscs = (oscillators) => oscillators.filter(o => o.detune.value !== 0);

test('muted() defaults to false on a fresh save', () => {
  const { music } = freshMusic();
  assert.equal(music.muted(), false);
});

test('setMuted() persists the flag, updates muted(), and persists the save', () => {
  const { music, state, persistCount } = freshMusic();
  music.setMuted(true);
  assert.equal(state.flags.musicMuted, true);
  assert.equal(music.muted(), true);
  assert.equal(persistCount(), 1);
  music.setMuted(false);
  assert.equal(music.muted(), false);
  assert.equal(persistCount(), 2);
});

test('toggleMuted() flips the current state and returns the new value', () => {
  const { music } = freshMusic();
  assert.equal(music.toggleMuted(), true);
  assert.equal(music.toggleMuted(), false);
});

test('setMuted() emits music.muted.changed with the new value', () => {
  const { music, on } = freshMusic();
  const seen = [];
  on('music.muted.changed', (p) => seen.push(p.muted));
  music.setMuted(true);
  music.setMuted(false);
  assert.deepEqual(seen, [true, false]);
});

test('start() (via setMuted(false)) is a no-op and does not throw when there is no AudioContext at all', () => {
  const { music, created } = freshMusic({ hasCtx: false });
  assert.doesNotThrow(() => music.start());
  assert.equal(created, null);
});

test('start() builds the audio graph exactly once and spawns an opening chord', () => {
  const { music, created, oscillators } = freshMusic();
  music.start();
  assert.equal(created.filter, 1);      // the highpass
  assert.equal(created.convolver, 1);   // the algorithmic reverb
  assert.equal(created.buffer, 1);      // its synthesized impulse response
  const voices = chordOscs(oscillators);
  assert.ok(voices.length === 8 || voices.length === 10, `expected 4 or 5 chord notes x2 oscillators, got ${voices.length}`);
});

test('start() called twice does not rebuild the graph or double-schedule', () => {
  const { music, created, timers } = freshMusic();
  music.start();
  music.start();
  assert.equal(created.filter, 1);
  assert.equal(timers.pendingCount(), 1);   // exactly one chord-advance scheduled, not two
});

test('stop() clears the pending chord-advance timer and stops the current chord\'s oscillators', () => {
  const { music, oscillators, timers } = freshMusic();
  music.start();
  assert.equal(timers.pendingCount(), 1);
  music.stop();
  assert.equal(timers.pendingCount(), 0);
  assert.ok(chordOscs(oscillators).every(o => o.stopped), 'every chord oscillator should be stopped');
});

test('setMuted(true) tears the graph down (stops oscillators); setMuted(false) restarts it fresh', () => {
  const { music, oscillators, timers } = freshMusic();
  music.start();
  const firstGen = chordOscs(oscillators).length;
  music.setMuted(true);
  assert.equal(timers.pendingCount(), 0);
  assert.ok(chordOscs(oscillators).slice(0, firstGen).every(o => o.stopped));
  music.setMuted(false);
  assert.equal(timers.pendingCount(), 1);
  assert.ok(chordOscs(oscillators).length > firstGen, 'a fresh chord should spawn on restart');
});

test('advancing to the next chord stops the old chord and starts a new one, never picking the same chord twice in a row', () => {
  // pin Math.random to always land on chord index 0 - advance() must still move
  // off it on the very next roll (nextChordIdx's anti-repeat), proving the guard
  // actually does something rather than relying on luck.
  const { music, oscillators, timers } = freshMusic({ randomSeq: [0, 0, 0, 0, 0, 0] });
  music.start();
  const gen1 = chordOscs(oscillators).slice();
  timers.fireOne();   // advance() fires -> should spawn a DIFFERENT chord
  const gen2 = chordOscs(oscillators).filter(o => !gen1.includes(o));
  assert.ok(gen1.every(o => o.stopped), 'the old chord should be stopped once the new one is scheduled');
  assert.ok(gen2.length > 0, 'a new chord should have spawned');
  const freqs1 = gen1.map(o => o.frequency.value).sort().join(',');
  const freqs2 = gen2.map(o => o.frequency.value).sort().join(',');
  assert.notEqual(freqs1, freqs2, 'consecutive chords should never be identical');
});

test('updateTension(): calm state (no exposure, ambient heat) holds the highpass at its base cutoff', () => {
  const { music, filters, emit } = freshMusic();
  music.start();
  emit('tick', {});
  assert.equal(filters[0].frequency.value, 140);   // BASE_CUTOFF
});

test('updateTension(): full exposure (at CLIMAX) brightens the highpass to its tense ceiling', () => {
  const { music, state, filters, emit } = freshMusic();
  music.start();
  state.exposure = 18; // == Game.exposure.CLIMAX in the test harness
  emit('tick', {});
  assert.equal(filters[0].frequency.value, 560);   // BASE_CUTOFF (140) + TENSE_CUTOFF (420)
});

test('updateTension(): heat at HEAT_CRIT reads as full danger even with zero exposure', () => {
  const { music, state, filters, emit } = freshMusic();
  music.start();
  state.heat = 90; // == Game.constraints.HEAT_CRIT in the test harness
  emit('tick', {});
  assert.equal(filters[0].frequency.value, 560);
});

test('updateTension(): the worse of exposure/heat wins, not their sum', () => {
  const { music, state, filters, emit } = freshMusic();
  music.start();
  state.exposure = 18; state.heat = 90;   // both maxed
  emit('tick', {});
  assert.equal(filters[0].frequency.value, 560, 'should cap at the same ceiling as either alone, not double it');
});

test('updateTension(): heat below HEAT_WARN contributes no danger (only the throttle band matters)', () => {
  const { music, state, filters, emit } = freshMusic();
  music.start();
  state.heat = 40; // under HEAT_WARN(60) - not yet a real thermal risk
  emit('tick', {});
  assert.equal(filters[0].frequency.value, 140);
});

test('dangerReading-driven tension never throws before start() has built the graph', () => {
  const { emit } = freshMusic();
  assert.doesNotThrow(() => emit('tick', {}));
});
