// Service Worker: legt alle App-Dateien beim Installieren in den Cache, danach läuft die App ohne Internet.
// __BUILD__ wird beim Deployment (GitHub Action) durch die Commit-ID ersetzt, damit Updates erkannt werden.
const VERSION = '__BUILD__';
const CACHE = 'chat-archiv-' + VERSION;
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/nav.js', 'js/ui.js', 'js/settings.js', 'js/store.js', 'js/db.js', 'js/search.js', 'js/classify.js',
  'js/parse.js', 'js/tokens.js', 'js/markdown.js', 'js/defaults.js', 'vendor/fflate.min.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('chat-archiv-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;   // keine fremden Anfragen
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => {
    if (hit) return hit;
    return fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => (req.mode === 'navigate' ? caches.match('index.html') : Response.error()));
  }));
});

self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
