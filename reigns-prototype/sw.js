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
const CACHE = 'reigns-cache-' + BUILD;
const ASSETS = ['./', './index.html', './style.css', './cards.js', './app.js', './manifest.json'];

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
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
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
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
