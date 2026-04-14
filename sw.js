// ═══════════════════════════════════════════════════════════
//  VMS Insurance Monitor — Service Worker  (sw.js)
//  GitHub Pages: mun-balayan.github.io/vmsInsurance
//
//  Update strategy:
//  ┌─────────────────────────────────────────────────────┐
//  │  On every page open the app calls reg.update().     │
//  │  The browser re-fetches this file from the server   │
//  │  and does a byte-diff. If anything changed (even    │
//  │  just the CACHE_VERSION below), a new SW installs   │
//  │  immediately via skipWaiting() and posts            │
//  │  SW_UPDATED to all open tabs so they reload once.   │
//  │                                                     │
//  │  → Bump CACHE_VERSION on every deploy. Or use the   │
//  │    GitHub Actions snippet in the README to auto-    │
//  │    stamp it with the commit SHA.                    │
//  └─────────────────────────────────────────────────────┘
//
//  Local / file:// testing:
//  Service Workers cannot register on file:// URLs.
//  The app gracefully continues without the SW — Firebase
//  and all features work normally without it.
// ═══════════════════════════════════════════════════════════

// ── Bump this on every deploy to trigger a cache refresh ──
const CACHE_VERSION = 'v2026-04-14';          // ← change per deploy
const CACHE         = `vms-insurance-${CACHE_VERSION}`;
const BASE          = '/vmsInsurance';

const PRECACHE = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/styles.css`,
  `${BASE}/helpers.js`,
  `${BASE}/app.js`,
  `${BASE}/manifest.json`,
  `${BASE}/logo.png`,
];

// ── INSTALL ────────────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' }))))
      .catch(err => console.warn('[SW] Pre-cache partial failure:', err))
  );
  // Activate immediately — don't wait for old tabs to close.
  self.skipWaiting();
});

// ── ACTIVATE ───────────────────────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    // 1. Delete all old caches from previous versions.
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith('vms-insurance-') && k !== CACHE)
          .map(k  => caches.delete(k))
      ))
      // 2. Take control of all open tabs immediately.
      //    clients.claim() triggers 'controllerchange' on every controlled page.
      .then(() => self.clients.claim())
      // 3. Belt-and-suspenders: also explicitly message every open window tab
      //    so the page can reload even if controllerchange was already consumed.
      .then(() =>
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
          .then(clients => clients.forEach(c => c.postMessage({ type: 'SW_UPDATED' })))
      )
  );
});

// ── FETCH ──────────────────────────────────────────────────
// • Bypass all Firebase / Google CDN requests entirely.
// • For our own files: network-first → cache on success
//   → fallback to cached version when offline.
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

  // Let Firebase & external CDN calls go straight to the network.
  if (BYPASS_HOSTS.some(h => url.hostname.includes(h))) return;

  // Only intercept requests within our app scope.
  if (!url.pathname.startsWith(BASE)) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Cache a fresh copy on every successful network response.
        if (res.ok) {
          caches.open(CACHE).then(c => c.put(e.request, res.clone()));
        }
        return res;
      })
      .catch(() =>
        // Offline: serve from cache, fall back to index.html shell.
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
