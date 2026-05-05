import { getToken, onMessage } from 'firebase/messaging'
import {
  doc,
  setDoc,
  deleteDoc,
  collection,
  serverTimestamp,
  getDocs,
  writeBatch,
} from 'firebase/firestore'
import { messaging, db } from '../lib/firebase'
import toast from 'react-hot-toast'

function ensureWindowTimers() {
  if (typeof window === 'undefined') return null
  if (!window._notifTimers) window._notifTimers = {}
  return window._notifTimers
}

function safeText(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function nowMs() {
  return Date.now()
}

// ── Request FCM permission + save token ───────────────────
export async function requestNotificationPermission(uid) {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return null

    // messaging can be null on unsupported browsers (see firebase.js)
    if (!messaging) return null

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return null

    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
    })

    if (token) {
      await setDoc(doc(db, 'users', uid), { fcmToken: token }, { merge: true })
    }

    return token
  } catch (err) {
    console.warn('Notification permission error:', err)
    return null
  }
}

// ── Foreground message listener ───────────────────────────
// Returns an unsubscribe function, or a no-op if messaging isn't supported.
export function onForegroundMessage(callback) {
  if (!messaging) return () => {}
  return onMessage(messaging, callback)
}

// ── Initialize notifications for a logged-in user ─────────
// Call this once after login (in AuthContext).
// Requests FCM permission + saves token. Does NOT set up a foreground
// toast listener here — that lives in App.jsx so the styled toast is used.
export function initNotifications(uid) {
  if (!uid) return () => {}

  // Request permission + register token (non-blocking)
  requestNotificationPermission(uid).catch(err =>
    console.warn('initNotifications: permission failed', err)
  )

  // No foreground listener here — App.jsx handles it with the styled toast.
  // Returning a no-op so AuthContext can still call the returned unsub safely.
  return () => {}
}

// ── Write a notification to Firestore ─────────────────────
export async function sendNotification(toUid, {
  type = 'message',
  title = 'Notification',
  body = '',
  fromUid = '',
  fromName = 'Someone',
  fromPhoto = '',
  convId = null,
  groupName = null,
  emoji = null,
  data = {},
}) {
  if (!toUid) return null

  // Validate notification type
const validTypes = ['message', 'media', 'reaction', 'friend_request', 'group_invite', 'announce', 'mention']
  const safeType = validTypes.includes(type) ? type : 'message'

  try {
    const notifRef = doc(collection(db, 'notifications', toUid, 'items'))

    await setDoc(notifRef, {
      type:      safeType,
      title:     safeText(title, 'Notification'),
      text:      safeText(body, ''),
      fromUid:   safeText(fromUid, ''),
      fromName:  safeText(fromName, 'Someone'),
      fromPhoto: safeText(fromPhoto, ''),
      convId:    convId    || null,
      groupName: groupName || null,
      emoji:     emoji     || null,
      read:      false,
      createdAt:   serverTimestamp(),
      createdAtMs: nowMs(),
      ...data,
    })

    return notifRef.id
  } catch (err) {
    // Silently swallow permission errors so they never block the UI.
    // The notification is best-effort — the app should work fine without it.
    if (err?.code === 'permission-denied') {
      console.warn('sendNotification: permission denied for uid', toUid)
    } else {
      console.error('sendNotification failed:', err?.message || err)
    }
    return null
  }
}

// ── Delete a notification ─────────────────────────────────
export async function deleteNotification(toUid, notifId) {
  if (!toUid || !notifId) return
  try {
    await deleteDoc(doc(db, 'notifications', toUid, 'items', notifId))
  } catch (err) {
    if (err?.code !== 'not-found') {
      console.warn('Failed to delete notification:', err?.message || err)
    }
  }
}

// ── Delete all notifications for a user ──────────────────
export async function deleteAllNotifications(uid) {
  if (!uid) return
  try {
    const itemsSnap = await collection(db, 'notifications', uid, 'items')
    const docs = await getDocs(itemsSnap)
    const batch = writeBatch(db)
    docs.docs.forEach(d => batch.delete(d.ref))
    if (docs.docs.length > 0) await batch.commit()
  } catch (err) {
    console.warn('Failed to delete all notifications:', err?.message || err)
  }
}

// ── Schedule a delayed message notification ───────────────
// Waits 10 seconds before writing — if the recipient reads the message
// in that window the notification is cancelled and never written.
export function scheduleMessageNotif(toUid, {
  fromUid,
  fromName,
  fromPhoto,
  convId,
  messageId,
  preview,
  isGroup,
  groupName,
  messageType = 'text',
}) {
  if (typeof window === 'undefined') return

  const key = `notif_timer_${convId}_${messageId}`
  const timers = ensureWindowTimers()
  if (!timers) return

  // Clear any existing timer for this message
  if (timers[key]) clearTimeout(timers[key])

  timers[key] = setTimeout(async () => {
    try {
      const { getDoc, doc: firestoreDoc } = await import('firebase/firestore')
      const { db: firestoreDb }           = await import('../lib/firebase')

      const msgSnap = await getDoc(
        firestoreDoc(firestoreDb, 'conversations', convId, 'messages', messageId)
      )
      const msgData = msgSnap.data()

      // Only notify if the recipient hasn't read the message yet
      if (!msgData?.readBy?.includes(toUid)) {
        const title    = isGroup ? groupName : fromName
        const notifType = ['image', 'video', 'file'].includes(messageType)
          ? 'media'
          : 'message'

        await sendNotification(toUid, {
          type: notifType,
          title,
          body: preview,
          fromUid,
          fromName,
          fromPhoto,
          convId,
          groupName,
          data: { messageId, messageType },
        })
      }
    } catch (err) {
      console.warn('Delayed notif error:', err?.message || err)
    }

    delete timers[key]
  }, 10_000) // 10 seconds — enough time to cancel if message is read
}

// ── Cancel a scheduled message notification ───────────────
export function cancelMessageNotif(convId, messageId) {
  if (typeof window === 'undefined') return

  const key = `notif_timer_${convId}_${messageId}`
  const timer = window._notifTimers?.[key]
  if (timer) {
    clearTimeout(timer)
    delete window._notifTimers[key]
  }
}

// ── Cancel ALL scheduled notifs for a conversation ────────
export function cancelAllConvNotifs(convId) {
  if (typeof window === 'undefined' || !window._notifTimers) return

  Object.keys(window._notifTimers).forEach(key => {
    if (key.startsWith(`notif_timer_${convId}_`)) {
      clearTimeout(window._notifTimers[key])
      delete window._notifTimers[key]
    }
  })
}