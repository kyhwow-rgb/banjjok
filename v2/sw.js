const CACHE = 'banjjok-v2-2';
const ASSETS = [
  '/banjjok/v2/',
  '/banjjok/v2/index.html',
  '/banjjok/v2/css/style.css',
  '/banjjok/v2/js/common.js',
  '/banjjok/v2/js/state.js',
  '/banjjok/v2/js/notifications.js',
  '/banjjok/v2/js/profile.js',
  '/banjjok/v2/js/participant.js',
  '/banjjok/v2/js/matchmaker.js',
  '/banjjok/v2/js/chat.js',
  '/banjjok/v2/js/admin.js',
  '/banjjok/v2/js/app.js',
  '/banjjok/v2/manifest.json',
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
    icon: '/banjjok/v2/icons/icon-192.png',
    badge: '/banjjok/v2/icons/icon-192.png',
    data: data.url || '/banjjok/v2/',
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow(e.notification.data));
});
