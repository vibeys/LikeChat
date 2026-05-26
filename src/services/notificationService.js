import {
  getToken,
  onMessage,
} from 'firebase/messaging'
import {
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  collection,
  serverTimestamp,
  getDocs,
  writeBatch,
} from 'firebase/firestore'
import { messaging, db } from '../lib/firebase'
import { getUser } from './userService'
import { shouldDeliverNotification } from './settingsService'

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

async function canStoreNotification(toUid, type) {
  const user = await getUser(toUid).catch(() => null)
  if (!user) return true
  return shouldDeliverNotification(user.notifications, type)
}

export async function requestNotificationPermission(uid) {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return null
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

export function onForegroundMessage(callback) {
  if (!messaging) return () => {}
  return onMessage(messaging, callback)
}

export function initNotifications(uid) {
  if (!uid) return () => {}
  requestNotificationPermission(uid).catch(err =>
    console.warn('initNotifications: permission failed', err)
  )
  return () => {}
}

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

  const validTypes = [
    'message',
    'media',
    'reaction',
    'friend_request',
    'friend_accepted',
    'group_invite',
    'announce',
    'mention',
    'call',
    'missed_call',
  ]
  const safeType = validTypes.includes(type) ? type : 'message'

  try {
    const allowed = await canStoreNotification(toUid, safeType)
    if (!allowed) return null

    const notifRef = doc(collection(db, 'notifications', toUid, 'items'))

    await setDoc(notifRef, {
      type: safeType,
      title: safeText(title, 'Notification'),
      text: safeText(body, ''),
      fromUid: safeText(fromUid, ''),
      fromName: safeText(fromName, 'Someone'),
      fromPhoto: safeText(fromPhoto, ''),
      convId: convId || null,
      groupName: groupName || null,
      emoji: emoji || null,
      read: false,
      createdAt: serverTimestamp(),
      createdAtMs: nowMs(),
      ...data,
    })

    return notifRef.id
  } catch (err) {
    if (err?.code === 'permission-denied') {
      console.warn('sendNotification: permission denied for uid', toUid)
    } else {
      console.error('sendNotification failed:', err?.message || err)
    }
    return null
  }
}

export async function markNotificationRead(toUid, notifId) {
  if (!toUid || !notifId) return
  try {
    await updateDoc(doc(db, 'notifications', toUid, 'items', notifId), { read: true })
  } catch (err) {
    if (err?.code !== 'not-found') {
      console.warn('Failed to mark notification as read:', err?.message || err)
    }
  }
}

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

export async function deleteAllNotifications(uid) {
  if (!uid) return
  try {
    const itemsRef = collection(db, 'notifications', uid, 'items')
    const docsSnap = await getDocs(itemsRef)
    if (docsSnap.empty) return

    const batch = writeBatch(db)
    docsSnap.docs.forEach(d => batch.delete(d.ref))
    await batch.commit()
  } catch (err) {
    console.warn('Failed to delete all notifications:', err?.message || err)
  }
}

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

  if (timers[key]) clearTimeout(timers[key])

  timers[key] = setTimeout(async () => {
    try {
      const { getDoc, doc: firestoreDoc } = await import('firebase/firestore')
      const { db: firestoreDb } = await import('../lib/firebase')

      const msgSnap = await getDoc(
        firestoreDoc(firestoreDb, 'conversations', convId, 'messages', messageId)
      )
      const msgData = msgSnap.data()

      if (!msgData?.readBy?.includes(toUid)) {
        const title = isGroup ? (groupName || 'Group') : fromName
        const notifType = ['image', 'video', 'file'].includes(messageType) ? 'media' : 'message'

        await sendNotification(toUid, {
          type: notifType,
          title,
          body: isGroup ? `${fromName}: ${preview}` : preview,
          fromUid,
          fromName,
          fromPhoto,
          convId,
          groupName: isGroup ? (groupName || null) : null,
          data: { messageId, messageType },
        })
      }
    } catch (err) {
      console.warn('Delayed notif error:', err?.message || err)
    }

    delete timers[key]
  }, 10_000)
}

export function cancelMessageNotif(convId, messageId) {
  if (typeof window === 'undefined') return

  const key = `notif_timer_${convId}_${messageId}`
  const timer = window._notifTimers?.[key]
  if (timer) {
    clearTimeout(timer)
    delete window._notifTimers[key]
  }
}

export function cancelAllConvNotifs(convId) {
  if (typeof window === 'undefined' || !window._notifTimers) return

  Object.keys(window._notifTimers).forEach(key => {
    if (key.startsWith(`notif_timer_${convId}_`)) {
      clearTimeout(window._notifTimers[key])
      delete window._notifTimers[key]
    }
  })
}

export async function sendCallNotification(calleeUid, {
  callerUid,
  callerName,
  callerPhoto,
  convId,
  callId,
  callType = 'audio',
}) {
  return sendNotification(calleeUid, {
    type: 'call',
    title: callerName || 'Incoming call',
    body: callType === 'video' ? 'Incoming video call' : 'Incoming audio call',
    fromUid: callerUid,
    fromName: callerName,
    fromPhoto: callerPhoto,
    convId,
    data: { callId, callType },
  })
}

export async function sendMissedCallNotification(calleeUid, {
  callerUid,
  callerName,
  callerPhoto,
  convId,
  callId,
  callType = 'audio',
}) {
  return sendNotification(calleeUid, {
    type: 'missed_call',
    title: callerName || 'Missed call',
    body: callType === 'video' ? 'Missed video call' : 'Missed audio call',
    fromUid: callerUid,
    fromName: callerName,
    fromPhoto: callerPhoto,
    convId,
    data: { callId, callType },
  })
}

export async function sendFriendAcceptedNotification(toUid, {
  fromUid,
  fromName,
  fromPhoto,
}) {
  return sendNotification(toUid, {
    type: 'friend_accepted',
    title: `${fromName || 'Someone'} accepted your friend request`,
    body: 'You are now friends!',
    fromUid,
    fromName,
    fromPhoto,
  })
}