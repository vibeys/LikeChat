/**
 * presence.js — Firestore-based
 *
 * WHY Firestore instead of RTDB:
 * Firebase Realtime Database rules were never deployed (no firebase.json existed),
 * so every RTDB write failed with permission_denied → everyone showed as Offline.
 * Firestore rules ARE already deployed and allow read/write for any auth'd user
 * on users/{uid}, so switching here fixes online status with zero CLI commands.
 *
 * Trade-off: no onDisconnect (RTDB feature). We compensate with a heartbeat
 * every 90s + a 3-minute TTL — after 3 minutes of no heartbeat, the user
 * is considered offline (handles closed-browser-without-logout gracefully).
 */

import { doc, updateDoc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { getAuth } from 'firebase/auth'
import { db } from './firebase'

const HEARTBEAT_MS  = 90_000        // refresh lastSeen every 90 seconds
const ONLINE_TTL_MS = 3 * 60_000   // treat as offline after 3 min of no heartbeat

function currentUid() {
  try { return getAuth().currentUser?.uid ?? null } catch { return null }
}

function silentUpdate(ref, data) {
  return updateDoc(ref, data).catch(err => {
    // Only log unexpected errors — permission issues mean wrong auth state
    if (!String(err?.code || '').includes('permission')) {
      console.warn('[presence]', err?.message || err)
    }
  })
}

/**
 * Call once on login. Returns a cleanup function — call it on logout.
 * @param {string}  uid         current user's UID
 * @param {boolean} showStatus  false → writes 'hidden' so others see Offline
 */
export function goOnline(uid, showStatus = true) {
  if (!uid) return () => {}

  const userRef = doc(db, 'users', uid)
  const status  = showStatus ? 'online' : 'hidden'

  // Write immediately on login
  silentUpdate(userRef, { onlineStatus: status, lastSeen: serverTimestamp() })

  // Heartbeat — keeps lastSeen fresh so the TTL check works
  const interval = setInterval(() => {
    if (currentUid() === uid) {
      silentUpdate(userRef, { onlineStatus: status, lastSeen: serverTimestamp() })
    }
  }, HEARTBEAT_MS)

  // Return cleanup for AuthContext to call on logout
  return () => {
    clearInterval(interval)
    silentUpdate(userRef, { onlineStatus: 'offline', lastSeen: serverTimestamp() })
  }
}

/** Mark offline immediately — called on explicit logout */
export function goOffline(uid) {
  if (!uid) return
  silentUpdate(
    doc(db, 'users', uid),
    { onlineStatus: 'offline', lastSeen: serverTimestamp() }
  )
}

/**
 * Watch another user's realtime presence.
 * Callback shape: { status: 'online' | 'offline', lastSeen: Timestamp | null }
 * Returns unsubscribe function.
 */
export function watchUserPresence(uid, callback) {
  if (!uid) return () => {}

  return onSnapshot(
    doc(db, 'users', uid),
    snap => {
      if (!snap.exists()) {
        callback({ status: 'offline', lastSeen: null })
        return
      }

      const data         = snap.data()
      const onlineStatus = data.onlineStatus || 'offline'
      const lastSeen     = data.lastSeen ?? null

      // 'hidden' = user disabled their online status setting → always show as offline
      if (onlineStatus === 'hidden' || onlineStatus === 'offline') {
        callback({ status: 'offline', lastSeen })
        return
      }

      if (onlineStatus === 'online') {
        // Use TTL to handle closed-browser-without-logout
        const lastSeenMs = lastSeen?.toDate?.()?.getTime() ?? 0
        const isRecent   = Date.now() - lastSeenMs < ONLINE_TTL_MS
        callback({ status: isRecent ? 'online' : 'offline', lastSeen })
        return
      }

      callback({ status: 'offline', lastSeen })
    },
    err => {
      // Read errors are unexpected since Firestore rules allow all auth'd reads
      console.warn('[presence] watch error:', err?.message || err)
      callback({ status: 'offline', lastSeen: null })
    }
  )
}