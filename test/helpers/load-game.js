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

// `preload` seeds sandbox.Game with stub dependencies (e.g. Game.save,
// Game.events) *before* any file runs, so `window.Game = window.Game || {}`
// in the loaded files preserves them instead of clobbering with `{}`.
function loadGame(files, preload = {}) {
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.console = console;
  if (preload.Game) sandbox.Game = preload.Game;
  const context = vm.createContext(sandbox);
  for (const file of files) {
    const full = path.join(SRC_ROOT, file);
    const code = fs.readFileSync(full, 'utf8');
    vm.runInContext(code, context, { filename: full });
  }
  return sandbox.Game;
}

module.exports = { loadGame };
