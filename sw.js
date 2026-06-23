// Service worker — makes the game installable + playable OFFLINE on the phone.
// Strategy: NETWORK-FIRST for same-origin GETs (so an online session always gets the
// freshest build during development), falling back to the cache when offline. Every
// successful response is cached, so after one online load the whole game works offline.
// Navigations fall back to the cached shell. Bump CACHE to force a clean re-cache.
const CACHE = 'aigame-v1';
const CORE = [
  './index.html', './style.css', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()).catch(() => {}));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  let url; try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== location.origin) return;   // leave cross-origin (CDNs, tunnels) to the network
  e.respondWith(
    fetch(req)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); return res; })
      .catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
