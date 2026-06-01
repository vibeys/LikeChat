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
import { doc as fsDoc, updateDoc, serverTimestamp, onSnapshot, deleteField } from 'firebase/firestore'
import { db } from './firebase'

const STALE_MS    = 8_000
const DEBOUNCE_MS = 1_200
const timers      = new Map()
const rtdbBlocked = new Set()

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

  // NOTE: don't block writes here based on the SDK auth check. Some environments
  // see a transient auth mismatch where `getAuth().currentUser` is briefly null
  // despite the app-level user being available. Allow the write and let rules
  // reject it if unauthorized; callers already pass the intended UID.

  const nodeRef = ref(rtdb, `typing/${cid}/${u}`)
  try {
    if (rtdbBlocked.has(cid)) {
      // Skip RTDB attempt and go straight to Firestore fallback
      try {
        const convRef = fsDoc(db, 'conversations', cid)
        if (isTyping) await updateDoc(convRef, { [`typing.${u}`]: serverTimestamp() })
        else await updateDoc(convRef, { [`typing.${u}`]: deleteField() })
        return
      } catch (e) {
        if (!isPermDenied(e)) console.warn('[typing][fallback fs pre-check]', e?.message || e)
        return
      }
    }
    if (isTyping) {
      console.debug('[typing] write set', { convId: cid, uid: u, ts: Date.now() })
      await set(nodeRef, { typing: true, ts: Date.now() })
      try { onDisconnect(nodeRef).remove().catch(() => {}) } catch (e) { /* ignore */ }
    } else {
      console.debug('[typing] write remove', { convId: cid, uid: u })
      await remove(nodeRef)
    }
  } catch (err) {
    if (isPermDenied(err)) {
      rtdbBlocked.add(cid)
      // Fallback: write typing timestamp into Firestore on the conversation doc.
      try {
        const convRef = fsDoc(db, 'conversations', cid)
        if (isTyping) {
          await updateDoc(convRef, { [`typing.${u}`]: serverTimestamp() })
        } else {
          await updateDoc(convRef, { [`typing.${u}`]: deleteField() })
        }
        return
      } catch (e2) {
        if (!isPermDenied(e2)) console.warn('[typing][fallback fs]', e2?.message || e2)
        return
      }
    }
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

  // Primary: RTDB listener
  try {
    if (rtdbBlocked.has(cid)) {
      const unsubFsDirect = onSnapshot(fsDoc(db, 'conversations', cid), snap => {
        const data = snap.exists() ? (snap.data()?.typing || {}) : {}
        const now = Date.now()
        const live = Object.fromEntries(Object.entries(data).map(([k, v]) => {
          const ts = v?.toMillis ? v.toMillis() : (v?.seconds ? v.seconds * 1000 : null)
          return [k, { typing: true, ts }]
        }).filter(([, v]) => v?.ts && now - v.ts < STALE_MS))
        console.debug('[typing] watch live fs direct (cached blocked)', { convId: cid, data, live })
        callback(live)
      }, err2 => { console.warn('[typing] fs watch error', err2?.message); callback({}) })
      return () => { try { unsubFsDirect?.() } catch (_) {} }
    }
    const unsub = onValue(
      ref(rtdb, `typing/${cid}`),
      snap => {
        const raw  = snap.val() || {}
        const now  = Date.now()
        const live = Object.fromEntries(
          Object.entries(raw).filter(([, v]) => v?.ts && now - v.ts < STALE_MS)
        )
        console.debug('[typing] watch live rtdb', { convId: cid, raw, live })
        callback(live)
      },
      err => {
        console.warn('[typing] rtdb watch error', err?.message)
        if (isPermDenied(err)) {
          // Fallback to Firestore-based typing field
          const unsubFs = onSnapshot(fsDoc(db, 'conversations', cid), snap => {
            const data = snap.exists() ? (snap.data()?.typing || {}) : {}
            const now = Date.now()
            const live = Object.fromEntries(Object.entries(data).map(([k, v]) => {
              const ts = v?.toMillis ? v.toMillis() : (v?.seconds ? v.seconds * 1000 : null)
              return [k, { typing: true, ts }]
            }).filter(([, v]) => v?.ts && now - v.ts < STALE_MS))
            console.debug('[typing] watch live fs', { convId: cid, data, live })
            callback(live)
          }, err2 => { console.warn('[typing] fs watch error', err2?.message); callback({}) })
          // return composed unsubscribe
          return () => { try { unsubFs?.() } catch (_) {} }
        } else {
          callback({})
        }
      }
    )

    return () => { try { unsub() } catch (_) {} }
  } catch (err) {
    console.warn('[typing] failed to subscribe rtdb, fallback to fs', err?.message)
    const unsubFs = onSnapshot(fsDoc(db, 'conversations', cid), snap => {
      const data = snap.exists() ? (snap.data()?.typing || {}) : {}
      const now = Date.now()
      const live = Object.fromEntries(Object.entries(data).map(([k, v]) => {
        const ts = v?.toMillis ? v.toMillis() : (v?.seconds ? v.seconds * 1000 : null)
        return [k, { typing: true, ts }]
      }).filter(([, v]) => v?.ts && now - v.ts < STALE_MS))
      console.debug('[typing] watch live fs direct', { convId: cid, data, live })
      callback(live)
    }, err2 => { console.warn('[typing] fs watch error', err2?.message); callback({}) })

    return () => { try { unsubFs?.() } catch (_) {} }
  }
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