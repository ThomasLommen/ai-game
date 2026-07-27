'use strict';
// Network-first, with one crucial detail: the fetch must bypass the HTTP cache.
// GitHub Pages serves `Cache-Control: max-age=600`, so a plain fetch() can be
// answered from the browser's HTTP cache without ever touching the network —
// which silently defeats "network-first" and serves a stale build. `no-store`
// forces the real request; the Cache API copy is kept only as the offline
// fallback.
//
// __BUILD__ is replaced at deploy time (see .github/workflows). A new build id
// means a byte-different sw.js, which is what makes the browser treat it as a
// new worker at all — without that, an unchanged sw.js is never reinstalled.
const BUILD = '__BUILD__';
const CACHE = 'network-cache-' + BUILD;
const ASSETS = [
  './', './index.html', './style.css',
  './data.js', './country.js', './app.js', './manifest.json',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((c) => Promise.all(
      // don't let one 404 abort the whole install, the way addAll would
      ASSETS.map((u) => fetch(u, { cache: 'no-store' })
        .then((r) => (r.ok ? c.put(u, r) : null))
        .catch(() => null))
    ))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    // Drop this app's older builds, and any cache left behind by whatever used
    // to own this scope — that second part is what lets a home screen app
    // installed when the card game lived at the root switch cleanly to this
    // game instead of serving the old one offline forever.
    //
    // It must NOT touch the other game's current caches: both apps share an
    // origin, so a blanket "delete everything that is not mine" meant visiting
    // one wiped the other's offline copy.
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => k !== CACHE && !k.startsWith('reigns-cache-'))
        .map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req, { cache: 'no-store' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      })
      // Scoped to this app's own cache on purpose. Bare caches.match() searches
      // every cache on the origin, so with both games sharing one it could
      // answer an offline request for this app with the other app's page.
      .catch(() => caches.open(CACHE).then((c) =>
        c.match(req).then((hit) => hit || c.match('./index.html'))))
  );
});
