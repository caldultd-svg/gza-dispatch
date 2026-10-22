// Offline shell: the app opens without network; data always comes fresh from the server.
const CACHE = 'gza-v1';
const SHELL = ['/', '/index.html', '/css/app.css', '/js/main.js', '/js/i18n.js', '/js/ui.js', '/js/store.js', '/js/common.js', '/js/calc.js', '/js/config.js', '/js/auth.js', '/js/driver.js',
  '/js/views/ops.js', '/js/views/team.js', '/js/views/cars.js', '/js/views/biz.js', '/manifest.webmanifest', '/icons/icon-192.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  // network first, cache as fallback (so updates arrive immediately)
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then((r) => r || caches.match('/'))));
});
