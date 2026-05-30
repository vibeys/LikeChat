/**
 * typing.js
 *
 * KEY FIX: replaced isAuthenticated() (checks "is ANYONE logged in?")
 * with currentUid() === safeUid (checks "is THIS EXACT USER authenticated?").
 *
 * The old check allowed writes for the wrong user during auth transitions,
 * causing Firebase to log permission_denied to the console SYNCHRONOUSLY
 * before any .catch() could run — that's why catch() couldn't suppress it.
 * By skipping the write entirely when the UID doesn't match, the error
 * never happens at all.
 */

import { useEffect, useRef, useState } from 'react'
import { ref, set, remove, onValue, onDisconnect } from 'firebase/database'
import { getAuth } from 'firebase/auth'
import { rtdb } from './firebase'

const STALE_MS    = 5_000
const DEBOUNCE_MS = 1_200
const timers      = new Map()

function clean(v) { return typeof v === 'string' ? v.trim() : '' }

function isPermDenied(err) {
  return String(err?.code || err?.message || '').toLowerCase().includes('permission')
}

function currentUid() {
  try { return getAuth().currentUser?.uid ?? null } catch { return null }
}

async function writeTyping(convId, uid, isTyping) {
  const cid = clean(convId)
  const u   = clean(uid)
  if (!cid || !u) return

  // Only write if this UID is currently authenticated — prevents permission_denied spam
  if (currentUid() !== u) return

  const nodeRef = ref(rtdb, `typing/${cid}/${u}`)
  try {
    if (isTyping) {
      await set(nodeRef, { typing: true, ts: Date.now() })
      onDisconnect(nodeRef).remove().catch(() => {})
    } else {
      await remove(nodeRef)
    }
  } catch (err) {
    if (!isPermDenied(err)) console.warn('[typing]', err?.message || err)
  }
}

/** Call on each keystroke. One RTDB write per burst, not per key. */
export function debounceTyping(convId, uid, isTyping, delay = DEBOUNCE_MS) {
  const cid = clean(convId)
  const u   = clean(uid)
  if (!cid || !u) return

  const key = `${cid}:${u}`
  const t   = timers.get(key)
  if (t) { clearTimeout(t); timers.delete(key) }

  if (!isTyping) { void writeTyping(cid, u, false); return }

  void writeTyping(cid, u, true)

  timers.set(key, setTimeout(() => {
    void writeTyping(cid, u, false)
    timers.delete(key)
  }, delay))
}

/** Immediate clear — call after message is sent */
export function setTyping(convId, uid, isTyping) {
  if (currentUid() !== clean(uid)) return
  void writeTyping(convId, uid, isTyping)
}

/** Force stop + clear timer */
export function stopTypingNow(convId, uid) {
  const cid = clean(convId)
  const u   = clean(uid)
  if (!cid || !u) return
  const t = timers.get(`${cid}:${u}`)
  if (t) { clearTimeout(t); timers.delete(`${cid}:${u}`) }
  if (currentUid() === u) void writeTyping(cid, u, false)
}

export function watchTyping(convId, callback) {
  const cid = clean(convId)
  if (!cid) return () => {}

  return onValue(
    ref(rtdb, `typing/${cid}`),
    snap => {
      const raw  = snap.val() || {}
      const now  = Date.now()
      const live = Object.fromEntries(
        Object.entries(raw).filter(([, v]) => v?.ts && now - v.ts < STALE_MS)
      )
      callback(live)
    },
    err => {
      if (!isPermDenied(err)) console.warn('[typing] watch', err?.message || err)
      callback({})
    }
  )
}

export function useTyping(convId, uid) {
  const [typingUsers, setTypingUsers] = useState({})
  const prev = useRef(false)

  useEffect(() => {
    if (!convId) return
    return watchTyping(convId, setTypingUsers)
  }, [convId])

  function sendTyping(isTyping) {
    const next = Boolean(isTyping)
    if (prev.current === next && !next) return
    prev.current = next
    debounceTyping(convId, uid, next)
  }

  useEffect(() => () => stopTypingNow(convId, uid), [convId, uid])

  return { typingUsers, sendTyping }
}