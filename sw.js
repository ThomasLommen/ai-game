// Service worker — makes the game installable + playable OFFLINE on the phone.
// Strategy: NETWORK-FIRST for same-origin GETs, fetched with cache:'reload' so the
// browser's HTTP cache (GitHub Pages sends max-age=600) is BYPASSED and an online
// session always gets the freshest build — otherwise edits don't reach the phone for
// ~10 min. Falls back to the runtime cache when offline. Bump CACHE to force a re-cache.
const CACHE = 'aigame-v23';
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
    // cache:'reload' → go to the network, bypassing the browser HTTP cache, so a fresh
    // deploy is seen immediately; the response still updates our runtime cache for offline.
    fetch(req, { cache: 'reload' })
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); return res; })
      .catch(() => caches.match(req).then(hit => hit || (req.mode === 'navigate' ? caches.match('./index.html') : undefined)))
  );
});
