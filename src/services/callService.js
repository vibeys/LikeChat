// src/services/callService.js
//
// Jitsi-based call signaling using Firestore only.
// No Daily API key, no room creation API, no billing.
// Jitsi rooms are public room names on meet.jit.si.
//
// Firestore schema:
//   calls/{callId}
//     callerId, calleeId, convId, type ('audio'|'video')
//     status: 'ringing' | 'active' | 'ended' | 'declined' | 'missed'
//     roomName: string
//     roomUrl:  string
//     createdAt, endedAt

import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

const JITSI_DOMAIN   = 'meet.jit.si'
const JITSI_BASE_URL = `https://${JITSI_DOMAIN}`

// ─── Helpers ──────────────────────────────────────────────────────────────────

function safePart(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)
}

function makeRoomName({ convId, type, callerId }) {
  const conv  = safePart(convId)   || 'chat'
  const who   = safePart(callerId) || 'user'
  const kind  = type === 'video' ? 'video' : 'audio'
  const stamp = Date.now().toString(36)
  const rand  = Math.random().toString(36).slice(2, 8)
  return `likechat-${conv}-${kind}-${who}-${stamp}-${rand}`
}

function buildRoomUrl(roomName) {
  return `${JITSI_BASE_URL}/${encodeURIComponent(roomName)}`
}

function callRef(callId) {
  return doc(db, 'calls', callId)
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Start a call (caller side). Returns { callId, roomName, roomUrl }. */
export async function startCall({ callerId, calleeId, convId, type }) {
  const roomName = makeRoomName({ convId, type, callerId })
  const roomUrl  = buildRoomUrl(roomName)

  const ref = await addDoc(collection(db, 'calls'), {
    callerId,
    calleeId,
    convId,
    type,
    status: 'ringing',
    roomName,
    roomUrl,
    createdAt: serverTimestamp(),
  })

  return { callId: ref.id, roomName, roomUrl }
}

/** Backward-compatible alias. */
export const initiateCall = startCall

/**
 * Caller watches for answer / decline / end.
 * Returns an unsubscribe function.
 */
export function watchCallAnswer(callId, onAnswer, onDecline, onEnd) {
  return onSnapshot(callRef(callId), snap => {
    const data = snap.data()
    if (!data) return

    if (data.status === 'active')                         onAnswer?.(data.roomUrl)
    if (data.status === 'declined')                       onDecline?.()
    if (data.status === 'ended' || data.status === 'missed') onEnd?.()
  })
}

/** Callee accepts a ringing call. Returns the Jitsi room URL. */
export async function acceptCall(callId) {
  const snap = await getDoc(callRef(callId))
  const data = snap.data()

  if (!data?.roomUrl) throw new Error('No room URL found for this call.')

  await updateDoc(callRef(callId), { status: 'active' })
  return data.roomUrl
}

/**
 * Callee watches for the caller hanging up.
 * Returns an unsubscribe function.
 */
export function watchCallEnd(callId, onEnd) {
  let activated = false

  return onSnapshot(callRef(callId), snap => {
    const status = snap.data()?.status

    if (status === 'active') {
      activated = true
      return
    }

    if (activated && (status === 'ended' || status === 'missed')) {
      onEnd?.()
    }
  })
}

/** Watch for incoming calls directed at a given uid. */
export function watchIncomingCalls(uid, onIncoming) {
  const q = query(
    collection(db, 'calls'),
    where('calleeId', '==', uid),
    where('status',   '==', 'ringing')
  )

  return onSnapshot(q, snap => {
    snap.docChanges().forEach(ch => {
      if (ch.type === 'added') {
        onIncoming({ callId: ch.doc.id, ...ch.doc.data() })
      }
    })
  })
}

/** Mark a call as ended. */
export async function endCall(callId) {
  try {
    await updateDoc(callRef(callId), {
      status:  'ended',
      endedAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('[CALL] endCall error:', err)
  }
}

/** Mark a call as declined. */
export async function declineCall(callId) {
  try {
    await updateDoc(callRef(callId), {
      status:  'declined',
      endedAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('[CALL] declineCall error:', err)
  }
}

/** Mark a call as missed. */
export async function markCallMissed(callId) {
  try {
    await updateDoc(callRef(callId), {
      status:  'missed',
      endedAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('[CALL] markCallMissed error:', err)
  }
}

/** Build a Jitsi room URL from a room name. */
export function getJitsiRoomUrl(roomName) {
  return buildRoomUrl(roomName)
}