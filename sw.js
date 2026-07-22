// Nest service worker — cache-first for same-origin assets, network-first for
// navigation (falling back to cache offline). Never caches the sync worker origin.
const CACHE_NAME = 'nest-v77';
const PRECACHE = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
const SYNC_ORIGIN = 'workers.dev';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      // cache:'reload' bypasses the HTTP cache so a new SW can never precache the
      // PREVIOUS build's index.html served from the browser's own cache.
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Never touch the sync worker — always go to the network, never cache.
  if (url.hostname.includes(SYNC_ORIGIN)) {
    event.respondWith(fetch(req));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Only cache GOOD shells: a transient 404/503 (mid-deploy Pages window)
          // must never overwrite the offline app shell.
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
