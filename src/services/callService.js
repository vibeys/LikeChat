// src/services/callService.js
//
// Call signaling using Daily.co for media + Firestore for call state/notifications.
// Daily.co handles ALL WebRTC, ICE, TURN — we just create rooms and join them.
//
// Firestore schema:
//   calls/{callId}
//     callerId, calleeId, convId, type ('audio'|'video')
//     status: 'ringing' | 'active' | 'ended' | 'declined' | 'missed'
//     roomUrl: string   — Daily.co room URL
//     roomName: string  — Daily.co room name
//     createdAt, endedAt

import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

const DAILY_API_KEY    = '340064ddc13b2214b63a132d7c9fbc64b9c78624d02f035cf92991104588f5f1'
const DAILY_DOMAIN     = 'likechat.daily.co'
const DAILY_API_BASE   = 'https://api.daily.co/v1'

// ── Create a Daily.co room via REST API ───────────────────────────────────────
async function createDailyRoom() {
  const res = await fetch(`${DAILY_API_BASE}/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DAILY_API_KEY}`,
    },
    body: JSON.stringify({
      properties: {
        exp: Math.floor(Date.now() / 1000) + 3600, // expires in 1 hour
        enable_chat: false,
        enable_screenshare: false,
        max_participants: 2,
        start_video_off: false,
        start_audio_off: false,
      },
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    throw new Error(`Failed to create room: ${err.error || res.status}`)
  }

  const room = await res.json()
  return { roomUrl: room.url, roomName: room.name }
}

// ── Delete a Daily.co room ────────────────────────────────────────────────────
async function deleteDailyRoom(roomName) {
  try {
    await fetch(`${DAILY_API_BASE}/rooms/${roomName}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
    })
  } catch {
    // Ignore — room may already be deleted
  }
}

// ── Firestore helpers ─────────────────────────────────────────────────────────
function callRef(callId) { return doc(db, 'calls', callId) }

// ── Start a call (caller side) ────────────────────────────────────────────────
// Creates a Daily room, stores it in Firestore, returns { callId, roomUrl }
export async function startCall({ callerId, calleeId, convId, type }) {
  console.log('[CALL] startCall:', { callerId, calleeId, type })

  const { roomUrl, roomName } = await createDailyRoom()
  console.log('[CALL] room created:', roomUrl)

  const ref = await addDoc(collection(db, 'calls'), {
    callerId,
    calleeId,
    convId,
    type,
    status:   'ringing',
    roomUrl,
    roomName,
    createdAt: serverTimestamp(),
  })

  console.log('[CALL] Firestore doc created:', ref.id)
  return { callId: ref.id, roomUrl }
}

// ── Watch for call status changes (caller side) ───────────────────────────────
// Returns { roomUrl } when callee accepts, or status string when declined/ended
export function watchCallAnswer(callId, onAnswer, onDecline, onEnd) {
  return onSnapshot(callRef(callId), snap => {
    const data = snap.data()
    if (!data) return
    console.log('[CALL] status update:', data.status)

    if (data.status === 'active')   onAnswer?.(data.roomUrl)
    if (data.status === 'declined') onDecline?.()
    if (data.status === 'ended' || data.status === 'missed') onEnd?.()
  })
}

// ── Accept a call (callee side) ───────────────────────────────────────────────
// Returns roomUrl so callee can join the Daily room
export async function acceptCall(callId) {
  const snap = await new Promise(resolve => {
    const unsub = onSnapshot(callRef(callId), s => {
      unsub()
      resolve(s)
    })
  })

  const data = snap.data()
  if (!data?.roomUrl) throw new Error('No room URL found')

  await updateDoc(callRef(callId), { status: 'active' })
  return data.roomUrl
}

// ── Watch for caller hanging up (callee side) ─────────────────────────────────
export function watchCallEnd(callId, onEnd) {
  let activated = false
  return onSnapshot(callRef(callId), snap => {
    const s = snap.data()?.status
    if (s === 'active') { activated = true; return }
    if (activated && (s === 'ended' || s === 'missed')) onEnd?.()
  })
}

// ── Watch incoming calls ──────────────────────────────────────────────────────
export function watchIncomingCalls(uid, onIncoming) {
  const q = query(
    collection(db, 'calls'),
    where('calleeId', '==', uid),
    where('status',   '==', 'ringing')
  )
  return onSnapshot(q, snap => {
    snap.docChanges().forEach(ch => {
      if (ch.type === 'added') {
        console.log('[CALL] incoming call:', ch.doc.id)
        onIncoming({ callId: ch.doc.id, ...ch.doc.data() })
      }
    })
  })
}

// ── End / Decline / Missed ────────────────────────────────────────────────────
export async function endCall(callId, roomName) {
  try {
    await updateDoc(callRef(callId), { status: 'ended', endedAt: serverTimestamp() })
    if (roomName) await deleteDailyRoom(roomName)
  } catch (err) {
    console.error('[CALL] endCall error:', err)
  }
}

export async function declineCall(callId) {
  try {
    await updateDoc(callRef(callId), { status: 'declined', endedAt: serverTimestamp() })
  } catch (err) {
    console.error('[CALL] declineCall error:', err)
  }
}

export async function markCallMissed(callId) {
  try {
    await updateDoc(callRef(callId), { status: 'missed', endedAt: serverTimestamp() })
  } catch (err) {
    console.error('[CALL] markCallMissed error:', err)
  }
}