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
  arrayUnion,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { getUser } from './userService'
import { sendSystemMessage } from './chatService'
import { sendCallNotification } from './notificationService'

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

  // If this is a group call (convId present and no single callee), create
  // a session document plus per-recipient invite documents so each member
  // receives an incoming-call event (watchIncomingCalls listens by calleeId).
  if (convId && !calleeId) {
    try {
      const convSnap = await getDoc(doc(db, 'conversations', convId))
      const convData = convSnap.exists() ? convSnap.data() : null

            // create a session doc in the same collection so callers can watch it
      const sessionRef = await addDoc(collection(db, 'calls'), {
        callerId,
        calleeId: null,
        convId,
        type,
        status: 'ringing',
        roomName,
        roomUrl,
        createdAt: serverTimestamp(),
        session: true,
        participants: [callerId],
      })

      // create per-member invite docs and send notifications
      const members = (convData?.members || []).filter(u => u !== callerId)
      for (const m of members) {
        const inviteRef = await addDoc(collection(db, 'calls'), {
          callerId,
          calleeId: m,
          convId,
          type,
          status: 'ringing',
          roomName,
          roomUrl,
          createdAt: serverTimestamp(),
          sessionId: sessionRef.id,
        })

        // send push/notification per recipient
        try {
          const caller = await getUser(callerId).catch(() => null)
          await sendCallNotification(m, {
            callerUid: callerId,
            callerName: caller?.displayName || 'Someone',
            callerPhoto: caller?.photoURL || '',
            convId,
            callId: inviteRef.id,
            callType: type,
          })
        } catch (err) {
          console.warn('sendCallNotification (group) failed for', m, err)
        }
      }

            // system log
      try {
        const caller = await getUser(callerId).catch(() => null)
        const callerName = caller?.displayName || 'Someone'
        await sendSystemMessage(convId, `${callerName} started a ${type === 'video' ? 'video' : 'voice'} call`, { eventType: 'call_started', actorUid: callerId, callType: type, metadata: { callId: sessionRef.id, roomUrl, roomName } })
      } catch (err) {
        console.warn('sendSystemMessage (startCall group) failed:', err)
      }

      return { callId: sessionRef.id, roomName, roomUrl }
    } catch (err) {
      console.error('[CALL] startCall (group) failed:', err)
      throw err
    }
  }

  // Private/direct call (single callee)
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

  // Log a system message in the conversation that a call was started
  try {
    const caller = await getUser(callerId).catch(() => null)
    const callerName = caller?.displayName || 'Someone'
    if (convId) await sendSystemMessage(convId, `${callerName} started a ${type === 'video' ? 'video' : 'voice'} call`, { eventType: 'call_started', actorUid: callerId, callType: type })
  } catch (err) {
    console.warn('sendSystemMessage (startCall) failed:', err)
  }

  // send notification to the callee
  try {
    const caller = await getUser(callerId).catch(() => null)
    await sendCallNotification(calleeId, {
      callerUid: callerId,
      callerName: caller?.displayName || 'Someone',
      callerPhoto: caller?.photoURL || '',
      convId,
      callId: ref.id,
      callType: type,
    })
  } catch (err) {
    console.warn('sendCallNotification (private) failed:', err)
  }

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

  // If it's already active, just return the room URL (late join to group call)
  if (data.status === 'active') {
    return data.roomUrl
  }

  if (data.status !== 'ringing') {
    throw new Error('This call is no longer available.')
  }

  await updateDoc(ref, { status: 'active' })
  // If this invite belongs to a session, mark the session active and add participant
  try {
    if (data?.sessionId) {
      await updateDoc(doc(db, 'calls', data.sessionId), {
        status: 'active',
        participants: arrayUnion(data.calleeId || ''),
      })
    }
  } catch (err) {
    console.warn('acceptCall: failed to update session doc:', err)
  }
  // Log that the callee joined the call
  try {
    const callee = await getUser(data.calleeId).catch(() => null)
    const calleeName = callee?.displayName || 'Someone'
    if (data.convId) await sendSystemMessage(data.convId, `${calleeName} joined the call`, { eventType: 'call_joined', actorUid: data.calleeId, callType: data.type })
  } catch (err) {
    console.warn('sendSystemMessage (acceptCall) failed:', err)
  }
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

/**
 * Add the current user's uid to the session's participants list.
 * Used when a user joins the Jitsi room for a group call.
 */
export async function joinGroupCall(callId, uid) {
  try {
    await updateDoc(callRef(callId), {
      participants: arrayUnion(uid),
    })
  } catch (err) {
    console.warn('[CALL] joinGroupCall error:', err)
  }
}

/**
 * Remove the current user's uid from the session's participants list.
 * If no participants remain (or only the caller's entry), end the call.
 */
export async function leaveGroupCall(callId, uid) {
  try {
    const ref = callRef(callId)
    const snap = await getDoc(ref)
    const data = snap.data()
    if (!data) return

    // Remove uid from participants
    const current = data.participants || []
    const updated = current.filter(p => p !== uid)
    await updateDoc(ref, { participants: updated })

    // If no participants left, end the call for everyone
    if (updated.length === 0) {
      await endCall(callId)
    }
  } catch (err) {
    console.warn('[CALL] leaveGroupCall error:', err)
  }
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
    // Log call ended
    try {
      const snap = await getDoc(callRef(callId))
      const data = snap.data()
      if (data?.convId) await sendSystemMessage(data.convId, `Call ended`, { eventType: 'call_ended', callType: data?.type })
    } catch (err) {
      console.warn('sendSystemMessage (endCall) failed:', err)
    }
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
    // Log declined call
    try {
      const snap = await getDoc(callRef(callId))
      const data = snap.data()
      const callee = await getUser(data.calleeId).catch(() => null)
      const calleeName = callee?.displayName || 'Someone'
      if (data?.convId) await sendSystemMessage(data.convId, `${calleeName} declined the call`, { eventType: 'call_declined', actorUid: data.calleeId, callType: data?.type })
    } catch (err) {
      console.warn('sendSystemMessage (declineCall) failed:', err)
    }
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
    // Log missed call
    try {
      const snap = await getDoc(callRef(callId))
      const data = snap.data()
      const caller = await getUser(data.callerId).catch(() => null)
      const callerName = caller?.displayName || 'Someone'
      if (data?.convId) await sendSystemMessage(data.convId, `Missed call from ${callerName}`, { eventType: 'missed_call', actorUid: data?.callerId, callType: data?.type })
    } catch (err) {
      console.warn('sendSystemMessage (markCallMissed) failed:', err)
    }
  } catch (err) {
    console.error('[CALL] markCallMissed error:', err)
  }
}

export function getJitsiRoomUrl(roomName) {
  return buildRoomUrl(roomName)
}

/**
 * Watch a call session's status. Calls `onUpdate` with the current status string.
 * Returns an unsubscribe function.
 */
export function watchCallStatus(callId, onUpdate) {
  return onSnapshot(callRef(callId), snap => {
    const data = snap.data()
    onUpdate(data?.status || 'ended')
  })
}