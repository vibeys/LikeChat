import { ref, set, onValue, onDisconnect, serverTimestamp } from 'firebase/database'
import { rtdb } from './firebase'

// ── Go online ─────────────────────────────────────────────
export function goOnline(uid) {
  if (!uid) return
  const presenceRef = ref(rtdb, `presence/${uid}`)

  set(presenceRef, { status: 'online', lastSeen: serverTimestamp() })

  // When disconnected, write offline + lastSeen
  onDisconnect(presenceRef).set({
    status: 'offline',
    lastSeen: serverTimestamp(),
  })

  // Refresh presence every 60 seconds so lastSeen stays fresh
  const interval = setInterval(() => {
    set(presenceRef, { status: 'online', lastSeen: serverTimestamp() })
  }, 60_000)

  return () => {
    clearInterval(interval)
    set(presenceRef, { status: 'offline', lastSeen: serverTimestamp() })
  }
}

// ── Go offline ────────────────────────────────────────────
export function goOffline(uid) {
  if (!uid) return
  const presenceRef = ref(rtdb, `presence/${uid}`)
  set(presenceRef, { status: 'offline', lastSeen: serverTimestamp() })
}

// ── Watch a user's presence ───────────────────────────────
export function watchUserPresence(uid, callback) {
  if (!uid) return () => {}
  const presenceRef = ref(rtdb, `presence/${uid}`)
  return onValue(presenceRef, snap => {
    callback(snap.val() ?? { status: 'offline', lastSeen: null })
  })
}