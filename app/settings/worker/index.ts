/// <reference lib="webworker" />

const sw = self as unknown as ServiceWorkerGlobalScope;

sw.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  let payload: any = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'arnama', body: event.data.text() };
  }

  const title = payload.title || 'arnama';
  const options: NotificationOptions = {
    body: payload.body || 'new activity',
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag: payload.tag || 'arnama-notification',
    data: { url: payload.url || '/' },
  };

  event.waitUntil(sw.registration.showNotification(title, options));
});

sw.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const url =
    (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    sw.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        for (const c of clients) {
          if ('focus' in c) {
            c.focus();
            if ('navigate' in c) c.navigate(url);
            return;
          }
        }
        return sw.clients.openWindow(url);
      })
  );
});