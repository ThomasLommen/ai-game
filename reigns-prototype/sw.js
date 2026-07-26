'use strict';
// Network-first: always prefer the freshest deploy when online (so a new
// commit shows up as soon as the page is reloaded), fall back to cache only
// when offline. Cache name isn't versioned per-deploy on purpose -- staleness
// only matters for the offline fallback, and network-first already keeps the
// live cache fresh on every successful fetch.
const CACHE = 'reigns-cache-v1';
const ASSETS = ['./', './index.html', './style.css', './cards.js', './app.js', './manifest.json'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
