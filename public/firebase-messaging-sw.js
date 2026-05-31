importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js')

let messaging = null

// Firebase config is loaded at runtime from /firebase-config.json.
// This keeps the service worker free of hardcoded project credentials.
async function loadFirebaseConfig() {
  try {
    const response = await fetch('/firebase-config.json')
    if (!response.ok) throw new Error('Firebase config missing')
    return await response.json()
  } catch (err) {
    console.warn('FCM service worker: unable to load config:', err)
    return null
  }
}

async function initFirebaseMessaging() {
  const config = await loadFirebaseConfig()
  if (!config) return null

  firebase.initializeApp(config)
  return firebase.messaging()
}

initFirebaseMessaging().then(m => {
  messaging = m
  if (messaging) {
    messaging.onBackgroundMessage((payload) => {
      const notifData  = payload.notification || {}
      const extraData  = payload.data         || {}

      const type  = extraData.type  || 'message'
      const title = notifData.title || extraData.title || 'LikeChat'
      const body  = notifData.body  || extraData.body  || ''
      const icon  = notifData.icon  || extraData.icon  || '/favicon.ico'

      const mergedData = { ...extraData }

      const options = buildNotifOptions(type, title, body, icon, mergedData)
      self.registration.showNotification(title, options)
    })
  }
})

// ── Notification options per type ─────────────────────────
function buildNotifOptions(type, title, body, icon, data) {
  const base = {
    body,
    icon: icon || '/favicon.ico',
    badge: '/favicon.ico',
    data,
    // Deduplicate: same conversation shows only one notification
    tag: data?.convId ? `conv-${data.convId}` : `notif-${Date.now()}`,
    renotify: true,
  }

  switch (type) {
    case 'call':
      return {
        ...base,
        tag: `call-${data?.callId || Date.now()}`, // calls never deduplicate
        requireInteraction: true,   // stay on screen until user acts
        vibrate: [300, 100, 300, 100, 300],
        actions: [
          { action: 'answer', title: '✅ Answer' },
          { action: 'decline', title: '❌ Decline' },
        ],
      }

    case 'missed_call':
      return {
        ...base,
        tag: `missed-${data?.callId || Date.now()}`,
        vibrate: [200, 100, 200],
      }

    case 'friend_request':
    case 'friend_accepted':
      return {
        ...base,
        tag: `friend-${data?.fromUid || Date.now()}`,
        vibrate: [150, 75, 150],
        actions: [
          { action: 'open_friends', title: '👥 Open Friends' },
        ],
      }

    case 'group_invite':
      return {
        ...base,
        requireInteraction: true,
        vibrate: [200],
        actions: [
          { action: 'join', title: '✅ Join' },
          { action: 'later', title: '⏰ Later' },
        ],
      }

    case 'reaction':
    case 'mention':
      return {
        ...base,
        vibrate: [100, 50, 100],
      }

    case 'announce':
      return {
        ...base,
        vibrate: [250, 100, 250],
      }

    default: // message, media
      return {
        ...base,
        vibrate: [150],
      }
  }
}

// ── Notification click handler ────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const data   = event.notification.data || {}
  const action = event.action

  let url = '/app/chats'

  if (action === 'open_friends' || ['friend_request', 'friend_accepted'].includes(data.type)) {
    url = '/app/friends'
  } else if (action === 'join' || data.type === 'group_invite') {
    url = data.convId ? `/app/chats/${data.convId}` : '/app/notifications'
  } else if (data.convId) {
    url = `/app/chats/${data.convId}`
  } else if (data.type === 'friend_request' || data.type === 'friend_accepted') {
    url = '/app/friends'
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      // Focus an existing window on the correct URL if possible
      for (const client of windowClients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus()
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) return clients.openWindow(url)
    })
  )
})

// ── Notification close handler (analytics / cleanup) ──────
self.addEventListener('notificationclose', (_event) => {
  // No-op — placeholder for future analytics
})