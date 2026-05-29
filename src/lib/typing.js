import { useEffect, useRef, useState } from 'react'
import { ref, set, remove, onValue, onDisconnect } from 'firebase/database'
import { getAuth } from 'firebase/auth'
import { rtdb } from './firebase'

const STALE_MS   = 5000
const DEBOUNCE_MS = 1200
const typingTimers = new Map()

function clean(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function getTypingRef(convId, uid) {
  return ref(rtdb, `typing/${convId}/${uid}`)
}

function isPermissionDenied(err) {
  const msg = String(err?.code || err?.message || '').toLowerCase()
  return msg.includes('permission_denied') || msg.includes('permission denied')
}

/**
 * Returns the current Firebase Auth UID.
 * We check UID equality (not just "is someone logged in") to prevent
 * the SDK from even attempting a write for the wrong user — which is
 * what caused the per-keystroke permission_denied console spam.
 */
function currentUid() {
  try { return getAuth().currentUser?.uid ?? null } catch { return null }
}

async function writeTypingState(convId, uid, isTyping) {
  const safeConvId = clean(convId)
  const safeUid    = clean(uid)
  if (!safeConvId || !safeUid) return

  // Guard: only write if THIS uid is currently authenticated
  // This prevents the Firebase SDK from logging permission_denied
  // when the auth token is temporarily unavailable (navigation, reconnect)
  if (currentUid() !== safeUid) return

  const nodeRef = getTypingRef(safeConvId, safeUid)
  try {
    if (isTyping) {
      await set(nodeRef, { typing: true, ts: Date.now() })
      onDisconnect(nodeRef).remove().catch(() => {})
    } else {
      await remove(nodeRef)
    }
  } catch (err) {
    if (!isPermissionDenied(err)) {
      console.warn('[typing] write error:', err?.message || err)
    }
  }
}

/** Call on every keystroke — one write per burst, not per keystroke */
export function debounceTyping(convId, uid, isTyping, delay = DEBOUNCE_MS) {
  const safeConvId = clean(convId)
  const safeUid    = clean(uid)
  if (!safeConvId || !safeUid) return

  const key      = `${safeConvId}:${safeUid}`
  const existing = typingTimers.get(key)
  if (existing) { clearTimeout(existing); typingTimers.delete(key) }

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

/** Immediate set — call after send to clear typing state */
export function setTyping(convId, uid, isTyping) {
  if (currentUid() !== clean(uid)) return
  void writeTypingState(convId, uid, isTyping)
}

/** Force stop — clears timer AND writes false */
export function stopTypingNow(convId, uid) {
  const safeConvId = clean(convId)
  const safeUid    = clean(uid)
  if (!safeConvId || !safeUid) return

  const key = `${safeConvId}:${safeUid}`
  const t   = typingTimers.get(key)
  if (t) { clearTimeout(t); typingTimers.delete(key) }

  if (currentUid() === safeUid) void writeTypingState(safeConvId, safeUid, false)
}

export function watchTyping(convId, callback) {
  const safeConvId = clean(convId)
  if (!safeConvId) return () => {}

  const unsub = onValue(
    ref(rtdb, `typing/${safeConvId}`),
    snap => {
      const raw = snap.val() || {}
      const now = Date.now()
      const active = Object.fromEntries(
        Object.entries(raw).filter(([, v]) => v?.ts && now - v.ts < STALE_MS)
      )
      callback(active)
    },
    err => {
      if (!isPermissionDenied(err)) console.warn('[typing] watch error:', err?.message || err)
      callback({})
    }
  )
  return unsub
}

export function useTyping(convId, uid) {
  const [typingUsers, setTypingUsers] = useState({})
  const prevRef = useRef(false)

  useEffect(() => {
    if (!convId) return
    return watchTyping(convId, setTypingUsers)
  }, [convId])

  function sendTyping(isTyping) {
    const next = Boolean(isTyping)
    if (prevRef.current === next && !next) return
    prevRef.current = next
    debounceTyping(convId, uid, next)
  }

  useEffect(() => () => stopTypingNow(convId, uid), [convId, uid])

  return { typingUsers, sendTyping }
}