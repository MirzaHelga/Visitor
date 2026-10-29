// Service worker sederhana: app shell di-cache supaya bisa di-install & cepat dibuka.
// Data (Supabase) TIDAK pernah di-cache — selalu langsung ke jaringan.
const CACHE = 'visitor-app-v6';
const SHELL = [
  './', 'index.html', 'pages/admin.html',
  'assets/css/form.css', 'assets/css/admin.css',
  'assets/js/form.js', 'assets/js/admin.js', 'assets/js/builder.js', 'assets/js/config.js', 'assets/js/pwa.js',
  'assets/images/logo.png', 'assets/images/icon-192.png', 'manifest.webmanifest'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // Supabase & CDN: biarkan
  // Network-first: selalu coba versi terbaru, jatuh ke cache kalau offline
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok){ const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('index.html')))
  );
});
