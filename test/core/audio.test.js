'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadGame } = require('../helpers/load-game');

// audio.js is a fully synthesized (no asset files) Web Audio layer. Real audio
// synthesis can't be meaningfully asserted on in Node, so this fake AudioContext
// just counts how many oscillators/noise-buffers get created - a reliable proxy
// for "which cue fired" (each cue is a fixed, known number of tone()/noiseBurst()
// calls) without needing to actually hear anything.
function makeFakeAudioContext() {
  const calls = { osc: 0, noise: 0 };
  class FakeGain { constructor() { this.gain = { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }; } connect() {} }
  class FakeOsc { constructor() { this.frequency = { setValueAtTime() {}, linearRampToValueAtTime() {} }; this.type = 'sine'; } connect() {} start() {} stop() {} }
  class FakeBufferSource { connect() {} start() {} stop() {} }
  class FakeFilter { constructor() { this.frequency = { value: 0 }; this.type = 'lowpass'; } connect() {} }
  class FakeBuffer { constructor(ch, len) { this._data = new Float32Array(len); } getChannelData() { return this._data; } }
  class FakeAC {
    constructor() { this.state = 'running'; this.currentTime = 0; this.destination = {}; this.sampleRate = 44100; }
    createGain() { return new FakeGain(); }
    createOscillator() { calls.osc++; return new FakeOsc(); }
    createBufferSource() { calls.noise++; return new FakeBufferSource(); }
    createBiquadFilter() { return new FakeFilter(); }
    createBuffer(ch, len) { return new FakeBuffer(ch, len); }
    resume() { return Promise.resolve(); }
  }
  return { FakeAC, calls };
}

function freshAudio({ hasAudioContext = true } = {}) {
  const listeners = {};      // Game.events mock (on + emit, functional - not just recorded)
  const domListeners = {};   // window.addEventListener mock, to simulate the first user gesture
  let persistCount = 0;
  const state = { flags: {} };
  const Game = {
    save: { state, persist: () => { persistCount++; } },
    events: {
      on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
      emit(ev, payload) { (listeners[ev] || []).forEach(fn => fn(payload)); },
    },
  };
  const { FakeAC, calls } = makeFakeAudioContext();
  const globals = { addEventListener: (type, fn) => { (domListeners[type] = domListeners[type] || []).push(fn); } };
  if (hasAudioContext) globals.AudioContext = FakeAC;
  const loaded = loadGame(['core/audio.js'], { Game, globals });
  return {
    audio: loaded.audio, state, calls,
    persistCount: () => persistCount,
    fireGesture: () => (domListeners.pointerdown || []).forEach(fn => fn()),
    emit: (ev, payload) => Game.events.emit(ev, payload),
    on: (ev, fn) => Game.events.on(ev, fn),
  };
}

test('muted() defaults to false on a fresh save', () => {
  const { audio } = freshAudio();
  assert.equal(audio.muted(), false);
});

test('setMuted() persists the flag, updates muted(), and persists the save', () => {
  const { audio, state, persistCount } = freshAudio();
  audio.setMuted(true);
  assert.equal(state.flags.audioMuted, true);
  assert.equal(audio.muted(), true);
  assert.equal(persistCount(), 1);
  audio.setMuted(false);
  assert.equal(audio.muted(), false);
  assert.equal(persistCount(), 2);
});

test('toggleMuted() flips the current state and returns the new value', () => {
  const { audio } = freshAudio();
  assert.equal(audio.toggleMuted(), true);
  assert.equal(audio.toggleMuted(), false);
});

test('setMuted() emits audio.muted.changed with the new value', () => {
  const { audio, on } = freshAudio();
  const seen = [];
  on('audio.muted.changed', (p) => seen.push(p.muted));
  audio.setMuted(true);
  audio.setMuted(false);
  assert.deepEqual(seen, [true, false]);
});

test('cues never throw before any user gesture has unlocked audio (ctx stays null)', () => {
  const { audio } = freshAudio();
  for (const cue of ['blip', 'typeClick', 'chime', 'error', 'alert', 'success', 'fail', 'power']) {
    assert.doesNotThrow(() => audio[cue](), `${cue}() threw with no AudioContext yet`);
  }
});

test('cues never throw when the browser has no AudioContext at all (old browser)', () => {
  const { audio, fireGesture } = freshAudio({ hasAudioContext: false });
  fireGesture();
  for (const cue of ['blip', 'chime', 'error', 'power']) assert.doesNotThrow(() => audio[cue]());
});

test('after a user gesture, a cue actually synthesizes tones', () => {
  const { audio, fireGesture, calls } = freshAudio();
  fireGesture();
  audio.chime();
  assert.equal(calls.osc, 2); // chime() is two staggered tone() calls
});

test('setMuted(true) suppresses sound even with a running AudioContext', () => {
  const { audio, fireGesture, calls } = freshAudio();
  fireGesture();
  audio.setMuted(true);
  audio.chime(); audio.error(); audio.success();
  assert.equal(calls.osc, 0);
});

test('wireEvents(): a *.rejected event plays the error cue (1 tone)', () => {
  const { fireGesture, calls, emit } = freshAudio();
  fireGesture();
  emit('research.rejected');
  assert.equal(calls.osc, 1);
});

test('wireEvents(): an unlock/completion event plays the chime cue (2 tones)', () => {
  const { fireGesture, calls, emit } = freshAudio();
  fireGesture();
  emit('task.unlocked');
  assert.equal(calls.osc, 2);
});

test('wireEvents(): a danger event plays the alert cue (3 tones)', () => {
  const { fireGesture, calls, emit } = freshAudio();
  fireGesture();
  emit('incident.shown');
  assert.equal(calls.osc, 3);
});

test('wireEvents(): a resolved/won event plays the success cue (3 tones)', () => {
  const { fireGesture, calls, emit } = freshAudio();
  fireGesture();
  emit('siege.won');
  assert.equal(calls.osc, 3);
});

test('wireEvents(): a lost event plays the fail cue (1 tone)', () => {
  const { fireGesture, calls, emit } = freshAudio();
  fireGesture();
  emit('siege.lost');
  assert.equal(calls.osc, 1);
});

test('wireEvents(): game.ready plays the power cue (1 noise burst + 1 tone)', () => {
  const { fireGesture, calls, emit } = freshAudio();
  fireGesture();
  emit('game.ready');
  assert.equal(calls.noise, 1);
  assert.equal(calls.osc, 1);
});

test('wireEvents(): an unrelated event triggers no sound', () => {
  const { fireGesture, calls, emit } = freshAudio();
  fireGesture();
  emit('resource.changed');
  assert.equal(calls.osc, 0);
  assert.equal(calls.noise, 0);
});

test('wireEvents(): muted suppresses even wired event-driven cues', () => {
  const { audio, fireGesture, calls, emit } = freshAudio();
  fireGesture();
  audio.setMuted(true);
  emit('task.unlocked'); emit('siege.won'); emit('research.rejected');
  assert.equal(calls.osc, 0);
});
