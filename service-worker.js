/* Service worker for the Meditation Timer PWA.
 *
 * Caching strategy:
 *   - Navigations (the HTML document): network-first, falling back to the
 *     cached shell when offline. This guarantees a fresh index.html whenever
 *     the network is available, so an updated app is never trapped behind a
 *     stale cache.
 *   - Everything else (versioned JS, icons, manifest): cache-first for instant
 *     loads, falling back to the network and caching the result.
 *
 * Bump CACHE on every release so old caches are dropped on activate.
 */

const CACHE = 'meditation-timer-v3';

const APP_SHELL = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './favicon.svg',
  './icon-192.png',
  './icon-512.png',
  './vendor/react.production.min.js',
  './vendor/react-dom.production.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // Don't let one missing optional asset abort the whole install.
      Promise.allSettled(APP_SHELL.map((url) => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Network-first for page navigations so updates are picked up immediately.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((c) => c || caches.match('./index.html'))
        )
    );
    return;
  }

  // Cache-first for static assets.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
