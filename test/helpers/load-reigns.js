'use strict';
// Loads reigns-prototype/cards.js + app.js into an isolated vm context with a
// minimal DOM + localStorage stub, so the prototype's engine logic can be
// unit tested without a real browser. app.js wires up the DOM immediately at
// load time (no deferred init()), so the stub has to be present *before* the
// file runs, not just "good enough to not throw" reactively.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const REIGNS_ROOT = path.join(__dirname, '..', '..', 'reigns-prototype');

function makeElement() {
  const el = {
    _text: '', _html: '', style: {}, dataset: {}, disabled: false,
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, force) {
        const has = this._set.has(c);
        const want = force === undefined ? !has : !!force;
        if (want) this._set.add(c); else this._set.delete(c);
      },
      contains(c) { return this._set.has(c); },
    },
    addEventListener() {}, removeEventListener() {},
    appendChild() {}, setPointerCapture() {},
    closest() { return null; },
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    get textContent() { return this._text; },
    set textContent(v) { this._text = v; },
    get innerHTML() { return this._html; },
    set innerHTML(v) { this._html = v; },
  };
  return el;
}

function makeDocumentStub() {
  const byId = new Map();
  return {
    getElementById(id) {
      if (!byId.has(id)) byId.set(id, makeElement());
      return byId.get(id);
    },
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    createElement() { return makeElement(); },
    addEventListener() {}, removeEventListener() {},
  };
}

function makeLocalStorageStub(seed) {
  const store = new Map(Object.entries(seed || {}));
  return {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); },
  };
}

// `preload.pinMathRandom` — number pins Math.random to a constant, function
// replaces it — for deterministic tests of chance-based mechanics (tag ticks,
// risky missions, shuffles).
function loadReigns(preload = {}) {
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.console = console;
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.document = makeDocumentStub();
  sandbox.localStorage = makeLocalStorageStub(preload.localStorageSeed);
  sandbox.setTimeout = (fn) => { fn(); return 0; }; // run "async" reveal transitions synchronously in tests
  sandbox.confirm = () => true;
  const context = vm.createContext(sandbox);

  if (preload.pinMathRandom != null) {
    vm.runInContext('this.__vmMath = Math;', context);
    sandbox.__vmMath.random = typeof preload.pinMathRandom === 'function' ? preload.pinMathRandom : () => preload.pinMathRandom;
    delete sandbox.__vmMath;
  }

  for (const file of ['cards.js', 'app.js']) {
    const full = path.join(REIGNS_ROOT, file);
    const code = fs.readFileSync(full, 'utf8');
    vm.runInContext(code, context, { filename: full });
  }
  return sandbox;
}

module.exports = { loadReigns };
