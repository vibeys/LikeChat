// src/services/callService.js
//
// Public Jitsi-based call signaling using Firestore only.
// No Daily, no JaaS JWT, no login required for the meeting itself.

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

const JITSI_DOMAIN = 'meet.jit.si'
const JITSI_BASE_URL = `https://${JITSI_DOMAIN}`

function safePart(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)
}

function makeRoomName({ convId, type, callerId }) {
  const conv = safePart(convId) || 'chat'
  const who = safePart(callerId) || 'user'
  const kind = type === 'video' ? 'video' : 'audio'
  const stamp = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `likechat-${conv}-${kind}-${who}-${stamp}-${rand}`
}

function buildRoomUrl(roomName) {
  return `${JITSI_BASE_URL}/${encodeURIComponent(roomName)}`
}

function callRef(callId) {
  return doc(db, 'calls', callId)
}

export async function startCall({ callerId, calleeId, convId, type }) {
  const roomName = makeRoomName({ convId, type, callerId })
  const roomUrl = buildRoomUrl(roomName)

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

  return {
    callId: ref.id,
    roomName,
    roomUrl,
  }
}

export const initiateCall = startCall

export function watchCallAnswer(callId, onAnswer, onDecline, onEnd) {
  return onSnapshot(callRef(callId), snap => {
    const data = snap.data()
    if (!data) return

    if (data.status === 'active') onAnswer?.(data.roomUrl)
    if (data.status === 'declined') onDecline?.()
    if (data.status === 'ended' || data.status === 'missed') onEnd?.()
  })
}

export async function acceptCall(callId) {
  const ref = callRef(callId)
  const snap = await getDoc(ref)
  const data = snap.data()

  if (!data?.roomUrl) {
    throw new Error('No room URL found for this call.')
  }

  if (data.status !== 'ringing') {
    throw new Error('This call is no longer available.')
  }

  await updateDoc(ref, { status: 'active' })
  return data.roomUrl
}

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

export function watchIncomingCalls(uid, onIncoming) {
  const q = query(
    collection(db, 'calls'),
    where('calleeId', '==', uid),
    where('status', '==', 'ringing')
  )

  return onSnapshot(q, snap => {
    snap.docChanges().forEach(ch => {
      if (ch.type === 'added') {
        onIncoming({ callId: ch.doc.id, ...ch.doc.data() })
      }
    })
  })
}

export async function endCall(callId) {
  try {
    await updateDoc(callRef(callId), {
      status: 'ended',
      endedAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('[CALL] endCall error:', err)
  }
}

export async function declineCall(callId) {
  try {
    await updateDoc(callRef(callId), {
      status: 'declined',
      endedAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('[CALL] declineCall error:', err)
  }
}

export async function markCallMissed(callId) {
  try {
    await updateDoc(callRef(callId), {
      status: 'missed',
      endedAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('[CALL] markCallMissed error:', err)
  }
}

export function getJitsiRoomUrl(roomName) {
  return buildRoomUrl(roomName)
}