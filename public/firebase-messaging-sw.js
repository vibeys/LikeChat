importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/11.0.0/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey:            'AIzaSyAUqbngBGAtCZwWzhcfWcGbQVImJz2HXo8',
  authDomain:        'likechaties.firebaseapp.com',
  projectId:         'likechaties',
  storageBucket:     'likechaties.firebasestorage.app',
  messagingSenderId: '764245011074',
  appId:             '1:764245011074:web:e06d5ad912c9038640629b',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const { title, body, icon } = payload.notification
  self.registration.showNotification(title, {
    body,
    icon: icon ?? '/favicon.ico',
    badge: '/favicon.ico',
    data: payload.data,
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const convId = event.notification.data?.convId
  const url = convId ? `/chats/${convId}` : '/chats'
  event.waitUntil(clients.openWindow(url))
})