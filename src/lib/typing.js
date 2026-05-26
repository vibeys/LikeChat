// src/lib/typing.js
import { useEffect, useRef, useState } from 'react'
import { ref, set, remove, onValue, onDisconnect } from 'firebase/database'
import { rtdb } from './firebase'

const STALE_MS = 5000
const DEBOUNCE_MS = 1200

const typingTimers = new Map()

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function getTypingRef(convId, uid) {
  return ref(rtdb, `typing/${convId}/${uid}`)
}

function isPermissionDenied(err) {
  const code = err?.code || err?.message || ''
  return (
    code === 'PERMISSION_DENIED' ||
    code === 'permission_denied' ||
    String(code).toLowerCase().includes('permission_denied')
  )
}

async function writeTypingState(convId, uid, isTyping) {
  const safeConvId = clean(convId)
  const safeUid = clean(uid)

  if (!safeConvId || !safeUid) return

  const nodeRef = getTypingRef(safeConvId, safeUid)

  try {
    if (isTyping) {
      await set(nodeRef, {
        typing: true,
        ts: Date.now(),
      })

      try {
        await onDisconnect(nodeRef).remove()
      } catch (_) {
        // No-op. onDisconnect may fail in some environments, but typing still works without it.
      }
    } else {
      await remove(nodeRef)
    }
  } catch (err) {
    if (!isPermissionDenied(err)) {
      console.warn('writeTypingState failed:', err?.message || err)
    }
  }
}

// Public API: immediate set/remove
export function setTyping(convId, uid, isTyping) {
  void writeTypingState(convId, uid, isTyping)
}

// Public API: debounced typing updates
export function debounceTyping(convId, uid, isTyping, delay = DEBOUNCE_MS) {
  const safeConvId = clean(convId)
  const safeUid = clean(uid)

  if (!safeConvId || !safeUid) return

  const key = `${safeConvId}:${safeUid}`
  const existing = typingTimers.get(key)

  if (existing) {
    clearTimeout(existing)
    typingTimers.delete(key)
  }

  if (!isTyping) {
    void writeTypingState(safeConvId, safeUid, false)
    return
  }

  void writeTypingState(safeConvId, safeUid, true)

  const timer = setTimeout(() => {
    void writeTypingState(safeConvId, safeUid, false)
    typingTimers.delete(key)
  }, delay)

  typingTimers.set(key, timer)
}

// Public API: force stop typing
export function stopTypingNow(convId, uid) {
  const safeConvId = clean(convId)
  const safeUid = clean(uid)

  if (!safeConvId || !safeUid) return

  const key = `${safeConvId}:${safeUid}`
  const existing = typingTimers.get(key)

  if (existing) {
    clearTimeout(existing)
    typingTimers.delete(key)
  }

  void writeTypingState(safeConvId, safeUid, false)
}

// Watch typing state in a conversation
export function watchTyping(convId, callback) {
  const safeConvId = clean(convId)
  if (!safeConvId) return () => {}

  const typingRef = ref(rtdb, `typing/${safeConvId}`)

  const unsub = onValue(
    typingRef,
    snap => {
      const raw = snap.val() || {}
      const now = Date.now()

      const active = Object.fromEntries(
        Object.entries(raw).filter(([, v]) => {
          return v?.ts && now - v.ts < STALE_MS
        })
      )

      callback(active)
    },
    err => {
      if (!isPermissionDenied(err)) {
        console.warn('watchTyping failed:', err?.message || err)
      }
      callback({})
    }
  )

  return unsub
}

// Hook used by chat UI
export function useTyping(convId, uid) {
  const [typingUsers, setTypingUsers] = useState({})
  const prevTypingRef = useRef(false)

  useEffect(() => {
    if (!convId) return

    const unsub = watchTyping(convId, activeMap => {
      setTypingUsers(activeMap)
    })

    return () => unsub()
  }, [convId])

  function sendTyping(isTyping) {
    const next = Boolean(isTyping)

    if (prevTypingRef.current === next && next === false) {
      return
    }

    prevTypingRef.current = next
    debounceTyping(convId, uid, next)
  }

  useEffect(() => {
    return () => {
      stopTypingNow(convId, uid)
    }
  }, [convId, uid])

  return { typingUsers, sendTyping }
}