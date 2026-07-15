'use strict';
// Loads one or more src/**/*.js files (the browser IIFEs that attach to
// window.Game) into an isolated vm context, so core logic can be unit
// tested without a browser. `window` is self-referential (window.window
// === window), matching the real global object, so bare `Game` references
// inside the IIFEs resolve to the same object as `window.Game`.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC_ROOT = path.join(__dirname, '..', '..', 'src');

// `preload.Game` seeds sandbox.Game with stub dependencies (e.g. Game.save,
// Game.events) *before* any file runs, so `window.Game = window.Game || {}`
// in the loaded files preserves them instead of clobbering with `{}`.
// `preload.globals` adds/overrides other browser globals a module touches
// (localStorage, document, ...) - a fresh vm context has neither Node's nor
// a browser's globals, only bare V8 intrinsics, so anything non-ECMA-262
// (btoa/atob, localStorage, document, ...) must be supplied explicitly.
function loadGame(files, preload = {}) {
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.console = console;
  // btoa/atob are Node/browser globals, not part of the JS spec, so a fresh
  // vm context doesn't have them unless copied in from the host realm.
  sandbox.btoa = (...args) => globalThis.btoa(...args);
  sandbox.atob = (...args) => globalThis.atob(...args);
  if (preload.Game) sandbox.Game = preload.Game;
  Object.assign(sandbox, preload.globals);
  const context = vm.createContext(sandbox);
  for (const file of files) {
    const full = path.join(SRC_ROOT, file);
    const code = fs.readFileSync(full, 'utf8');
    vm.runInContext(code, context, { filename: full });
  }
  return sandbox.Game;
}

module.exports = { loadGame };
