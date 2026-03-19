// VMS Insurance Monitor — Service Worker
// ⚠️ Bump CACHE version every time you push a new index.html to GitHub
const CACHE  = 'vms-insurance-v2';   // ← bumped from v1 to force old SW out
const BASE   = '/vmsInsurance';
const ASSETS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/manifest.json`,
  `${BASE}/logo.png`,
];

// ── Install: pre-cache the app shell ──────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(a => new Request(a, { cache: 'reload' }))))
      .catch(err => console.warn('[SW] Pre-cache partial failure:', err))
  );
  self.skipWaiting();
});

// ── Activate: delete all old caches, take control ─────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for app files, bypass Firebase/CDN ───────────────
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Bypass Firebase, Google APIs, fonts, CDN — never cache these
  const bypass = [
    'firebaseapp.com',
    'googleapis.com',
    'gstatic.com',
    'firestore.googleapis.com',
    'fonts.googleapis.com',
    'fonts.gstatic.com',
  ];
  if (bypass.some(host => url.hostname.includes(host))) return;

  // Only handle requests within our GitHub Pages scope
  if (!url.pathname.startsWith(BASE)) return;

  // Network-first: try network, cache on success, fall back to cache offline
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() =>
        caches.match(e.request)
          .then(cached => cached || caches.match(`${BASE}/index.html`))
      )
  );
});
