'use strict';
// A minimal in-memory localStorage stand-in for the vm sandbox. Kept as a
// real object (not a jsdom/browser polyfill) so tests can also inspect the
// raw persisted string directly via `.raw(key)`.
class LocalStorageStub {
  constructor() { this._data = new Map(); }
  getItem(key) { return this._data.has(key) ? this._data.get(key) : null; }
  setItem(key, value) { this._data.set(key, String(value)); }
  removeItem(key) { this._data.delete(key); }
  clear() { this._data.clear(); }
  raw(key) { return this._data.get(key); }
}

function createLocalStorage() {
  return new LocalStorageStub();
}

module.exports = { createLocalStorage };
