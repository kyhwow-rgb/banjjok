const CACHE = 'banjjok-v3';
const ASSETS = ['/banjjok/', '/banjjok/index.html', '/banjjok/dashboard.html', '/banjjok/icons/icon-192.png', '/banjjok/icons/icon-512.png', '/banjjok/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok && e.request.url.includes('/banjjok/')) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() => caches.match(e.request))
  );
});

// ── 웹 푸시 ──
self.addEventListener('push', e => {
  let data = { title: '반쪽', body: '새 알림이 있어요' };
  try { if (e.data) data = e.data.json(); } catch {}
  const title = data.title || '반쪽';
  const options = {
    body: data.body || '',
    icon: '/banjjok/icons/icon-192.png',
    badge: '/banjjok/icons/icon-192.png',
    vibrate: [120, 60, 120],
    tag: data.tag || 'banjjok-notif',
    renotify: true,
    data: { url: data.url || '/banjjok/dashboard.html' }
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/banjjok/dashboard.html';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes('/banjjok/') && 'focus' in c) { c.focus(); c.navigate && c.navigate(url); return; }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
