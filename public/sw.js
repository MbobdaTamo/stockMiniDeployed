/**
 * Stockware Service Worker
 * Handles:
 *  - Web Push notification reception and display
 *  - Local notifications triggered by the app via postMessage
 *  - Notification click → open / focus the app
 */

const APP_URL = self.location.origin

// ── Push event: fired when the server sends a push message ───────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return requestPermission

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'Stockware', body: event.data.text() }
  }

  const options = {
    body:    payload.body || '',
    icon:    '/icons/icon-192.png',
    badge:   '/icons/badge-72.png',
    tag:     payload.tag  ?? 'stockware-default',
    data:    payload.data ?? {},
    vibrate: [200, 100, 200],
    requireInteraction: payload.requireInteraction ?? false,
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, options)
  )
})

// ── Notification click ────────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url ?? APP_URL

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(APP_URL) && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})

// ── Message from app → SW ─────────────────────────────────────────────────────
// Used to show local-style notifications from the app without a server push.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, requireInteraction, url } = event.data
    self.registration.showNotification(title, {
      body,
      icon:    '/icons/icon-192.png',
      badge:   '/icons/badge-72.png',
      tag:     tag ?? 'stockware',
      data:    { url: url ?? APP_URL },
      vibrate: [200, 100, 200],
      requireInteraction: requireInteraction ?? false,
    })
  }
})