// VMS Insurance Service Worker — network-first so updates show automatically
const CACHE = 'vms-ins-v11';  // ← bump this number every time you upload a new index.html
const ASSETS = [
  './',
  './index.html',
];

// Install: pre-cache the app shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting(); // activate immediately
});

// Activate: wipe all old caches, then claim all clients right away
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()) // take over open tabs immediately
  );
});

// Fetch: NETWORK FIRST for same-origin HTML.
// Always try server first → cache on success → fallback to cache if offline.
// Firebase, Google Fonts, CDN requests pass through untouched.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request))
    );
  }
});
