// src/lib/typing.js
import { useEffect, useState } from 'react'
import { ref, set, onValue } from 'firebase/database'
import { rtdb } from './firebase'

// ── Set typing status ─────────────────────────────────────
export function setTyping(convId, uid, isTyping) {
  if (!convId || !uid) return
  const typingRef = ref(rtdb, `typing/${convId}/${uid}`)
  if (isTyping) {
    set(typingRef, { typing: true, ts: Date.now() })
  } else {
    set(typingRef, null)
  }
}

// ── Watch typing (raw listener) ───────────────────────────
export function watchTyping(convId, callback) {
  if (!convId) return () => {}
  const typingRef = ref(rtdb, `typing/${convId}`)
  const unsub = onValue(typingRef, snap => {
    const val = snap.val() || {}
    const now = Date.now()
    // Filter out stale entries older than 5 seconds
    const active = Object.fromEntries(
      Object.entries(val).filter(([, v]) => v?.ts && now - v.ts < 5000)
    )
    callback(active)
  })
  return unsub
}

// ── useTyping hook (used by ChatWindow) ───────────────────
export function useTyping(convId, uid) {
  const [typingUsers, setTypingUsers] = useState({})

  useEffect(() => {
    if (!convId) return
    const unsub = watchTyping(convId, activeMap => {
      setTypingUsers(activeMap)
    })
    return () => unsub()
  }, [convId])

  function sendTyping(isTyping) {
    setTyping(convId, uid, isTyping)
  }

  return { typingUsers, sendTyping }
}