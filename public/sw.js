// Minimal service worker for Web Push (spec 063) — registers a listener for
// 'push' events and shows a notification built from the JSON payload
// send-web-push/index.ts sends. No caching/offline behavior is added here;
// this file's only job is receiving pushes.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Alert', body: event.data ? event.data.text() : '' }
  }

  const title = data.title || 'Alert'
  const options = {
    body: data.body || '',
    data: { draftId: data.draftId || null },
    tag: data.draftId || undefined,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.openWindow('/portal'))
})
