// ═══════════════════════════════════════════════════════════
//  VMS Insurance Monitor — Service Worker
//  GitHub Pages: mun-balayan.github.io/vmsInsurance
//
//  Auto-update strategy:
//  • The cache name embeds a BUILD_TIME timestamp.
//    Every time you push to GitHub, this file changes →
//    browser detects a new SW → installs & activates
//    automatically → posts a message to every open tab
//    → tabs reload once to pick up fresh assets.
//  • No manual version bump needed.
// ═══════════════════════════════════════════════════════════

const BUILD_TIME = new Date().toISOString().slice(0, 16); // e.g. "2026-03-19T15:30"
const CACHE      = `vms-insurance-${BUILD_TIME}`;
const BASE       = '/vmsInsurance';

const PRECACHE = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/manifest.json`,
  `${BASE}/logo.png`,
];

// ── INSTALL ────────────────────────────────────────────────
// Pre-cache app shell. skipWaiting() so the new SW activates
// immediately instead of waiting for all tabs to close.
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' }))))
      .catch(err => console.warn('[SW] Pre-cache partial failure:', err))
  );
  self.skipWaiting(); // activate immediately on install
});

// ── ACTIVATE ───────────────────────────────────────────────
// 1. Delete every cache that isn't this build's cache.
// 2. Claim all open clients immediately.
// 3. Post 'SW_UPDATED' to every tab so they reload once.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith('vms-insurance-') && k !== CACHE)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => self.clients.matchAll({ type: 'window' }))
      .then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'SW_UPDATED', cache: CACHE });
        });
      })
  );
});

// ── FETCH ──────────────────────────────────────────────────
// Bypass Firebase / Google APIs / fonts completely.
// For everything in our scope: network-first, cache on success,
// fall back to cache when offline.
const BYPASS_HOSTS = [
  'firebaseapp.com',
  'googleapis.com',
  'gstatic.com',
  'firestore.googleapis.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Let Firebase & CDN calls go straight to the network
  if (BYPASS_HOSTS.some(h => url.hostname.includes(h))) return;

  // Only intercept our own scope
  if (!url.pathname.startsWith(BASE)) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request)
          .then(cached => cached || caches.match(`${BASE}/index.html`))
      )
  );
});

// ── MESSAGE ────────────────────────────────────────────────
// Allow the page to manually trigger skipWaiting if needed.
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
