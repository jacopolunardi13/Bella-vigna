/**
 * The Staff console's service worker: the app shell offline, and notifications.
 *
 * Nothing under /console/api/ is ever cached — operational data is always live.
 * A notification carries its house in the title ("Bella Vigna · …") and opens the
 * console on that house.
 */

const CACHE = 'staff-console-v1';
const SHELL = [
  '/',
  '/assets/css/staff.css',
  '/assets/css/fonts.css',
  '/src/staff/app.js',
  '/assets/vendor/simplewebauthn-browser-13.3.0.umd.min.js',
  '/assets/icon-console.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/console/api/')) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match('/'))),
  );
});

self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() ?? {}; } catch { payload = { title: 'Staff', body: event.data?.text() ?? '' }; }
  event.waitUntil(self.registration.showNotification(payload.title ?? 'Staff', {
    body: payload.body ?? '',
    tag: payload.tag ?? 'staff',
    renotify: true,
    icon: '/assets/icon-console-192.png',
    badge: '/assets/icon-console-192.png',
    data: { url: payload.url ?? '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? '/';
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const open = clients.find((client) => new URL(client.url).origin === location.origin);
    if (open) return open.navigate(target).then((client) => client?.focus());
    return self.clients.openWindow(target);
  }));
});
