'use strict';
// Loads network-prototype/data.js + app.js into an isolated vm context with a
// minimal DOM + localStorage stub, mirroring test/helpers/load-reigns.js.
// app.js renders immediately at load, so the stub must exist before it runs.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..', '..', 'network-prototype');

function makeElement() {
  const el = {
    _text: '', _html: '', style: {}, dataset: {},
    className: '', disabled: false,
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
    appendChild() {}, removeChild() {},
    setAttribute() {}, getAttribute() { return null; },
    // the map measures its own viewport to work out pan/zoom; give it a
    // plausible phone-sized box so the view maths is exercised, not skipped
    getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 355, right: 390, bottom: 355 }; },
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

// `preload.pinMathRandom` — number pins Math.random, function replaces it, for
// deterministic tests of graph generation and the random strike burn.
function loadNetwork(preload = {}) {
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.console = console;
  sandbox.addEventListener = () => {};
  sandbox.removeEventListener = () => {};
  sandbox.document = makeDocumentStub();
  sandbox.localStorage = makeLocalStorageStub(preload.localStorageSeed);
  sandbox.setTimeout = (fn) => { fn(); return 0; };
  // pan/zoom coalesces viewBox writes into a frame; run them straight through
  sandbox.requestAnimationFrame = (fn) => { fn(); return 0; };
  sandbox.cancelAnimationFrame = () => {};
  const context = vm.createContext(sandbox);

  if (preload.pinMathRandom != null) {
    vm.runInContext('this.__vmMath = Math;', context);
    sandbox.__vmMath.random = typeof preload.pinMathRandom === 'function'
      ? preload.pinMathRandom : () => preload.pinMathRandom;
    delete sandbox.__vmMath;
  }

  for (const file of ['data.js', 'app.js']) {
    const full = path.join(ROOT, file);
    vm.runInContext(fs.readFileSync(full, 'utf8'), context, { filename: full });
  }
  return sandbox;
}

module.exports = { loadNetwork };
