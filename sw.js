const CACHE = 'tokenq-v2';
const ASSETS = [
  './',
  './index.html',
  './owner.html',
  './manifest.json',
  './owner-manifest.json',
  './style.css',
  './shared.js',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './icon-owner-192.png',
  './icon-owner-512.png',
  './apple-touch-icon-owner.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).catch(() => cached))
  );
});
