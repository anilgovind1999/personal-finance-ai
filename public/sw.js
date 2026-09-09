/**
 * Service worker: makes the app installable and usable offline.
 *
 * Assets are content-hashed by the build, so a cached file is never stale —
 * a new build produces new names. The document itself is fetched network-first
 * so a deployed update is picked up, falling back to cache when offline.
 * Only same-origin GETs are touched; Firebase traffic is left alone.
 */
// Rewritten at build time with the commit id, so a new deploy never serves the
// previous build's cached files — see scripts/build-stamp.ts.
const VERSION = 'finsight-__BUILD_ID__';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(SHELL).catch(() => undefined)),
  );
  // Deliberately NOT skipWaiting() here: a running app should not be swapped
  // out from under someone mid-entry. The page asks for the swap when the user
  // accepts the update prompt.
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // never intercept Firebase

  // Navigations: fresh if possible, cached if not, so the app opens offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html').then((hit) => hit ?? caches.match('./'))),
    );
    return;
  }

  // Hashed assets: cache-first is safe, since a change means a new filename.
  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
