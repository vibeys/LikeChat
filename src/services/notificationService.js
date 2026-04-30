import { getToken, onMessage } from 'firebase/messaging'
import { doc, updateDoc, setDoc, collection, serverTimestamp } from 'firebase/firestore'
import { messaging, db } from '../lib/firebase'

export async function requestNotificationPermission(uid) {
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return null

    const token = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY
    })

    if (token) {
      await updateDoc(doc(db, 'users', uid), { fcmToken: token })
    }

    return token
  } catch (err) {
    console.error('Notification permission error:', err)
    return null
  }
}

export function onForegroundMessage(callback) {
  return onMessage(messaging, callback)
}

// ── Send notification to user ──────────────────────────────
export async function sendNotification(toUid, {
  type, // 'message', 'friend_request', 'group_invite'
  title,
  body,
  fromUid,
  fromName,
  fromPhoto = '',
  convId = null,
  data = {},
}) {
  try {
    const notifRef = doc(collection(db, 'notifications', toUid, 'items'))
    await setDoc(notifRef, {
      type,
      title,
      text: body,
      fromUid,
      fromName,
      fromPhoto,
      convId,
      read: false,
      createdAt: serverTimestamp(),
      ...data,
    })
  } catch (err) {
    console.error('Failed to send notification:', err)
  }
}