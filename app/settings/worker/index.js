/// <reference lib="webworker" />

/* eslint-disable no-undef */

self.addEventListener('push', (event) => {
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
      vibrate: [80, 40, 80],
    };
  
    event.waitUntil(self.registration.showNotification(title, options));
  });
  
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