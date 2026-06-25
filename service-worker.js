/* Kill-switch service worker.
 *
 * Earlier versions of this app shipped a cache-first service worker. Because
 * cache-first keeps serving the stored shell, those installs could get stuck
 * on a stale (broken) version of the page no matter what was redeployed.
 *
 * This worker exists only to undo that: when the browser picks it up it
 * deletes every cache, unregisters itself, and reloads open tabs so they load
 * fresh from the network. After that the app runs with no service worker at
 * all (see index.html), so there is no caching layer left to go stale.
 */

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Drop all caches from previous versions.
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));

      // Take control, then remove ourselves.
      await self.clients.claim();
      await self.registration.unregister();

      // Reload any open windows once so they re-fetch everything cleanly.
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.navigate(client.url));
    })()
  );
});
