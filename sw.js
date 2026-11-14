// PulseLive Service Worker - Live Network First Cache-Buster v6
const CACHE_NAME = 'pulselive-v6';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((k) => caches.delete(k)));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Always fetch fresh from network to guarantee latest updates
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
