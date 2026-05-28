import { ref, set, onValue, onDisconnect, serverTimestamp } from 'firebase/database'
import { rtdb } from './firebase'

function isPermissionDenied(err) {
  const code = err?.code || err?.message || ''
  return (
    code === 'PERMISSION_DENIED' ||
    code === 'permission_denied' ||
    String(code).toLowerCase().includes('permission_denied')
  )
}

function silentSet(nodeRef, value) {
  return set(nodeRef, value).catch(err => {
    if (!isPermissionDenied(err)) console.warn('presence write failed:', err?.message || err)
  })
}

// ── Go online ─────────────────────────────────────────────
// showStatus: if false, writes status:'hidden' so the user appears offline to others
export function goOnline(uid, showStatus = true) {
  if (!uid) return

  const presenceRef = ref(rtdb, `presence/${uid}`)
  const onlinePayload  = { status: showStatus ? 'online' : 'hidden', lastSeen: serverTimestamp() }
  const offlinePayload = { status: 'offline', lastSeen: serverTimestamp() }

  silentSet(presenceRef, onlinePayload)

  // When disconnected, mark offline
  try {
    onDisconnect(presenceRef).set(offlinePayload)
  } catch (_) {}

  // Refresh every 60s to keep lastSeen fresh
  const interval = setInterval(() => {
    silentSet(presenceRef, onlinePayload)
  }, 60_000)

  return () => {
    clearInterval(interval)
    silentSet(presenceRef, offlinePayload)
  }
}

// ── Go offline ────────────────────────────────────────────
export function goOffline(uid) {
  if (!uid) return
  const presenceRef = ref(rtdb, `presence/${uid}`)
  silentSet(presenceRef, { status: 'offline', lastSeen: serverTimestamp() })
}

// ── Watch a user's presence ───────────────────────────────
export function watchUserPresence(uid, callback) {
  if (!uid) return () => {}
  const presenceRef = ref(rtdb, `presence/${uid}`)
  return onValue(
    presenceRef,
    snap => {
      const data = snap.val() ?? { status: 'offline', lastSeen: null }
      // status:'hidden' means user disabled online status → treat as offline
      if (data.status === 'hidden') {
        callback({ status: 'offline', lastSeen: null })
      } else {
        callback(data)
      }
    },
    err => {
      if (!isPermissionDenied(err)) {
        console.warn('watchUserPresence failed:', err?.message || err)
      }
      callback({ status: 'offline', lastSeen: null })
    }
  )
}