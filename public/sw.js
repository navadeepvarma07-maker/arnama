// arnama service worker
// Plain JS, no dependencies. Handles push + offline fallback.

const CACHE = 'arnama-v1';
const OFFLINE_URL = '/offline.html';

const PRECACHE = [
  '/',
  '/offline.html',
  '/icon.svg',
  '/manifest.json',
];

// ============ INSTALL ============
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => {})
  );
  self.skipWaiting();
});

// ============ ACTIVATE ============
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ============ PUSH — the important one ============
self.addEventListener('push', (event) => {
  console.log('[sw] push received');
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'arnama', body: event.data.text() };
  }

  const title = payload.title || 'arnama';
  const options = {
    body: payload.body || 'new activity',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: payload.tag || 'arnama-notification',
    data: { url: payload.url || '/' },
  };

  event.waitUntil(
    self.registration
      .showNotification(title, options)
      .then(() => console.log('[sw] notification shown'))
      .catch((err) => console.error('[sw] showNotification failed:', err))
  );
});

// ============ NOTIFICATION CLICK ============
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const c of clients) {
          if ('focus' in c) {
            c.focus();
            if ('navigate' in c) c.navigate(url);
            return;
          }
        }
        return self.clients.openWindow(url);
      })
  );
});

// ============ FETCH — offline fallback for pages ============
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  // Only handle same-origin
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigation requests: network first, fall back to offline page
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((r) => r || Response.error())
      )
    );
  }
});