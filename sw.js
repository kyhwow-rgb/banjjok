const CACHE = 'banjjok-main-v2-1';
const ASSETS = [
  '/banjjok/',
  '/banjjok/index.html',
  '/banjjok/css/style.css',
  '/banjjok/js/common.js',
  '/banjjok/js/state.js',
  '/banjjok/js/notifications.js',
  '/banjjok/js/profile.js',
  '/banjjok/js/participant.js',
  '/banjjok/js/matchmaker.js',
  '/banjjok/js/chat.js',
  '/banjjok/js/mm_chat.js',
  '/banjjok/js/admin.js',
  '/banjjok/js/app.js',
  '/banjjok/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// Push notifications
self.addEventListener('push', e => {
  const data = e.data ? e.data.json() : {};
  const title = data.title || '반쪽';
  const options = {
    body: data.body || '',
    icon: '/banjjok/icons/icon-192.png',
    badge: '/banjjok/icons/icon-192.png',
    data: data.url || '/banjjok/',
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data));
});
