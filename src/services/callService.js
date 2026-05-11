// src/services/callService.js
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

// ── ICE servers — Xirsys TURN ─────────────────────────────────────────────────
/**
 * Returns Xirsys TURN/STUN servers for NAT traversal.
 * These credentials allow ICE candidate gathering and relay through TURN servers.
 */
function getIceServers() {
  return {
    iceServers: [
      { urls: ['stun:hk-turn1.xirsys.com'] },
      {
        username:   'C7FKxQJlNf3hvKiDxLPrbWcgUqmXbCB7cVkKAWbTgUI1Uqqx0VR3Zqrq6NZjtWYFAAAAAGn-_R1saWtlY2hhdA==',
        credential: 'c4f4e4ea-4b88-11f1-b94d-9e3322f08ff8',
        urls: [
          'turn:hk-turn1.xirsys.com:80?transport=udp',
          'turn:hk-turn1.xirsys.com:3478?transport=udp',
          'turn:hk-turn1.xirsys.com:80?transport=tcp',
          'turn:hk-turn1.xirsys.com:3478?transport=tcp',
          'turns:hk-turn1.xirsys.com:443?transport=tcp',
          'turns:hk-turn1.xirsys.com:5349?transport=tcp',
        ],
      },
    ],
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function callRef(callId) { return doc(db, 'calls', callId) }
function candidatesRef(callId, side) {
  return collection(db, 'calls', callId, `${side}Candidates`)
}
function isOpen(pc) { return pc && pc.signalingState !== 'closed' }

// ── Initiate a call (caller side) ─────────────────────────────────────────────
/**
 * Initiates a call from the caller side.
 * - Gets local media stream (audio/video)
 * - Creates RTCPeerConnection with TURN servers
 * - Sets up ICE candidate gathering
 * - Creates offer and stores in Firestore
 * - Returns pc, localStream, and cleanup function to caller
 * 
 * IMPORTANT: The caller must set pc.ontrack BEFORE we start receiving ICE candidates.
 * CallScreen handles this by setting ontrack immediately upon receiving pc.
 */
export async function initiateCall({ callerId, calleeId, convId, type = 'video' }) {
  console.log('[CALLER] initiateCall starting, type:', type)
  
  const localStream = await getLocalStream(type)
  console.log('[CALLER] local stream acquired, tracks:', localStream.getTracks().length)
  
  const pc = new RTCPeerConnection(getIceServers())

  // ── Debug state changes ──────────────────────────────────────────────────
  pc.onconnectionstatechange = () => {
    console.log('[CALLER] connectionState:', pc.connectionState)
  }
  pc.oniceconnectionstatechange = () => {
    console.log('[CALLER] iceConnectionState:', pc.iceConnectionState)
  }
  pc.onicegatheringstatechange = () => {
    console.log('[CALLER] iceGatheringState:', pc.iceGatheringState)
  }

  // ── Add local tracks ─────────────────────────────────────────────────────
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream)
    console.log('[CALLER] added track:', track.kind)
  })

  // ── Create Firestore call document ───────────────────────────────────────
  const callDoc = await addDoc(collection(db, 'calls'), {
    callerId,
    calleeId,
    convId,
    type,
    status: 'ringing',
    createdAt: serverTimestamp(),
  })

  const callId = callDoc.id
  console.log('[CALLER] call created:', callId)

  // ── Set up ICE candidate trickling ───────────────────────────────────────
  pc.onicecandidate = e => {
    if (e.candidate && isOpen(pc)) {
      console.log('[CALLER] ICE candidate:', e.candidate.type)
      addDoc(candidatesRef(callId, 'caller'), e.candidate.toJSON()).catch(err => {
        console.error('[CALLER] failed to add ICE candidate:', err)
      })
    }
  }

  // ── Create and send offer ────────────────────────────────────────────────
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  await updateDoc(callRef(callId), {
    offer: { type: offer.type, sdp: offer.sdp },
  })
  console.log('[CALLER] offer set, callId:', callId)

  // ── Cleanup function (called when call ends) ─────────────────────────────
  function cleanup() {
    console.log('[CALLER] cleanup: closing pc and stopping tracks')
    pc.close()
    localStream.getTracks().forEach(t => t.stop())
  }

  return { callId, pc, localStream, cleanup }
}

// ── Watch for answer + callee ICE (caller side) ───────────────────────────────
/**
 * Called by the CALLER after initiateCall() to watch for:
 * 1. The answer (when callee accepts the call)
 * 2. Callee's ICE candidates (for connectivity)
 * 3. Status changes (decline, end, etc)
 * 
 * IMPORTANT: CallScreen sets pc.ontrack IMMEDIATELY after getting pc from initiateCall.
 * This ensures ontrack fires before we receive ICE candidates from callee.
 */
export function watchCallAsCallee_fromCaller({ callId, pc, onStatusChange }) {
  console.log('[CALLER] watching for answer and callee ICE on call:', callId)

  // ── Watch call doc for answer ────────────────────────────────────────────
  const unsubCall = onSnapshot(callRef(callId), snap => {
    const data = snap.data()
    if (!data) return

    // When callee sends answer, set it as remote description
    if (data.answer && !pc.currentRemoteDescription && isOpen(pc)) {
      console.log('[CALLER] received answer, setting remote description')
      pc.setRemoteDescription(new RTCSessionDescription(data.answer))
        .then(() => console.log('[CALLER] remote description set OK'))
        .catch(err => console.error('[CALLER] setRemoteDescription error:', err))
    }

    // Propagate status changes to UI (active, declined, ended, missed)
    if (['ended', 'declined', 'missed'].includes(data.status)) {
      console.log('[CALLER] call status:', data.status)
      onStatusChange?.(data.status)
    }
    if (data.status === 'active') {
      console.log('[CALLER] call is now active')
      onStatusChange?.('active')
    }
  })

  // ── Watch for callee's ICE candidates ────────────────────────────────────
  const unsubCandidates = onSnapshot(candidatesRef(callId, 'callee'), snap => {
    snap.docChanges().forEach(change => {
      if (change.type === 'added' && isOpen(pc)) {
        console.log('[CALLER] adding callee ICE candidate')
        pc.addIceCandidate(new RTCIceCandidate(change.doc.data()))
          .catch(err => console.error('[CALLER] addIceCandidate error:', err))
      }
    })
  })

  // Return unsubscribe function
  return () => {
    console.log('[CALLER] unsubscribing from answer/candidates watch')
    unsubCall()
    unsubCandidates()
  }
}

// ── Answer a call (callee side) ───────────────────────────────────────────────
/**
 * Answers an incoming call from the callee side.
 * - Fetches the offer from caller
 * - Gets local media stream
 * - Creates RTCPeerConnection and sets remote description with offer
 * - Sets up ICE candidate gathering
 * - Creates and sends answer back to caller
 * 
 * IMPORTANT: CallScreen sets pc.ontrack IMMEDIATELY after this function returns,
 * BEFORE we start listening for caller ICE candidates. This is critical.
 */
export async function answerCall({ callId, type = 'video' }) {
  console.log('[CALLEE] answerCall starting, callId:', callId, 'type:', type)

  // ── Fetch the call doc with caller's offer ───────────────────────────────
  const snap = await getDoc(callRef(callId))
  if (!snap.exists()) {
    throw new Error('Call not found')
  }

  const data = snap.data()
  if (!data.offer) {
    throw new Error('No offer found in call document')
  }
  console.log('[CALLEE] offer retrieved from call doc')

  // ── Get local media stream ───────────────────────────────────────────────
  const localStream = await getLocalStream(type)
  console.log('[CALLEE] local stream acquired, tracks:', localStream.getTracks().length)

  // ── Create peer connection ───────────────────────────────────────────────
  const pc = new RTCPeerConnection(getIceServers())

  // ── Debug state changes ──────────────────────────────────────────────────
  pc.onconnectionstatechange = () => {
    console.log('[CALLEE] connectionState:', pc.connectionState)
  }
  pc.oniceconnectionstatechange = () => {
    console.log('[CALLEE] iceConnectionState:', pc.iceConnectionState)
  }
  pc.onicegatheringstatechange = () => {
    console.log('[CALLEE] iceGatheringState:', pc.iceGatheringState)
  }

  // ── Add local tracks ─────────────────────────────────────────────────────
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream)
    console.log('[CALLEE] added track:', track.kind)
  })

  // ── Set up ICE candidate trickling ───────────────────────────────────────
  pc.onicecandidate = e => {
    if (e.candidate && isOpen(pc)) {
      console.log('[CALLEE] ICE candidate:', e.candidate.type)
      addDoc(candidatesRef(callId, 'callee'), e.candidate.toJSON()).catch(err => {
        console.error('[CALLEE] failed to add ICE candidate:', err)
      })
    }
  }

  // ── Set remote description with caller's offer ──────────────────────────
  await pc.setRemoteDescription(new RTCSessionDescription(data.offer))
  console.log('[CALLEE] remote description set (offer)')

  // ── Create answer ────────────────────────────────────────────────────────
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  console.log('[CALLEE] answer created and set as local description')

  // ── Send answer back to caller ───────────────────────────────────────────
  await updateDoc(callRef(callId), {
    answer: { type: answer.type, sdp: answer.sdp },
    status: 'active',
  })
  console.log('[CALLEE] answer sent to firestore, call status set to active')

  // ── Watch for caller's ICE candidates ────────────────────────────────────
  // IMPORTANT: CallScreen will set pc.ontrack IMMEDIATELY before we return,
  // so ICE candidates will be added after ontrack is ready.
  const unsubCandidates = onSnapshot(candidatesRef(callId, 'caller'), snap => {
    snap.docChanges().forEach(change => {
      if (change.type === 'added' && isOpen(pc)) {
        console.log('[CALLEE] adding caller ICE candidate')
        pc.addIceCandidate(new RTCIceCandidate(change.doc.data()))
          .catch(err => console.error('[CALLEE] addIceCandidate error:', err))
      }
    })
  })

  // ── Cleanup function (called when call ends) ─────────────────────────────
  function cleanup() {
    console.log('[CALLEE] cleanup: unsubscribing from candidates and closing pc')
    unsubCandidates()
    pc.close()
    localStream.getTracks().forEach(t => t.stop())
  }

  return { pc, localStream, cleanup }
}

// ── Watch call status (callee side) ──────────────────────────────────────────
/**
 * Called by CALLEE to watch for caller hanging up.
 * Fires whenever call status changes (ringing → active → ended, etc).
 * 
 * IMPORTANT: CallScreen uses callActiveRef to prevent premature cleanup.
 * We only end the call if status is 'ended'|'declined'|'missed' AND callActiveRef is true.
 * This prevents re-reading a stale 'ringing' status on component mount.
 */
export function watchCallStatus(callId, onStatusChange) {
  console.log('[CALLEE] watching call status, callId:', callId)
  return onSnapshot(callRef(callId), snap => {
    const status = snap.data()?.status
    if (status) {
      console.log('[CALLEE] call status:', status)
      onStatusChange(status)
    }
  })
}

// ── Watch incoming calls ──────────────────────────────────────────────────────
/**
 * Listens for incoming calls where the given uid is the callee.
 * Fires when a new ringing call is created.
 * Used by ChatWindow to show IncomingCallToast.
 */
export function watchIncomingCalls(uid, onIncoming) {
  console.log('[INCOMING] watching for incoming calls to:', uid)
  const q = query(
    collection(db, 'calls'),
    where('calleeId', '==', uid),
    where('status', '==', 'ringing')
  )
  return onSnapshot(q, snap => {
    snap.docChanges().forEach(change => {
      if (change.type === 'added') {
        console.log('[INCOMING] new incoming call:', change.doc.id)
        onIncoming({ callId: change.doc.id, ...change.doc.data() })
      }
    })
  })
}

// ── End / Decline / Missed ──────────────────────────────────────────────────

/**
 * Marks a call as ended (was connected, now disconnected).
 */
export async function endCall(callId) {
  try {
    console.log('[CALL] ending call:', callId)
    await updateDoc(callRef(callId), {
      status: 'ended',
      endedAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('[CALL] endCall error:', err)
  }
}

/**
 * Marks a call as declined (callee rejected before answering).
 */
export async function declineCall(callId) {
  try {
    console.log('[CALL] declining call:', callId)
    await updateDoc(callRef(callId), {
      status: 'declined',
      endedAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('[CALL] declineCall error:', err)
  }
}

/**
 * Marks a call as missed (caller hung up before callee answered).
 */
export async function markCallMissed(callId) {
  try {
    console.log('[CALL] marking call missed:', callId)
    await updateDoc(callRef(callId), {
      status: 'missed',
      endedAt: serverTimestamp(),
    })
  } catch (err) {
    console.error('[CALL] markCallMissed error:', err)
  }
}

// ── Media helpers ─────────────────────────────────────────────────────────────

/**
 * Gets local media stream (audio, and optionally video).
 * Handles permission denials and missing devices gracefully.
 */
async function getLocalStream(type) {
  try {
    console.log('[MEDIA] requesting getUserMedia, type:', type)
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video:
        type === 'video'
          ? { width: 1280, height: 720, facingMode: 'user' }
          : false,
    })
    console.log('[MEDIA] getUserMedia success, tracks:', stream.getTracks().length)
    return stream
  } catch (err) {
    console.error('[MEDIA] getUserMedia error:', err.name, err.message)
    if (err.name === 'NotAllowedError') {
      throw new Error('Camera/microphone permission denied. Please allow access and try again.')
    }
    if (err.name === 'NotFoundError') {
      throw new Error('No camera or microphone found on this device.')
    }
    throw err
  }
}

export async function getLocalAudioStream() {
  return getLocalStream('audio')
}

export async function getLocalVideoStream() {
  return getLocalStream('video')
}

/**
 * Toggles audio mute for all audio tracks in the stream.
 */
export function toggleMute(stream, muted) {
  console.log('[MEDIA] toggleMute:', muted)
  stream.getAudioTracks().forEach(t => {
    t.enabled = !muted
  })
}

/**
 * Toggles video (camera) on/off for all video tracks in the stream.
 */
export function toggleCamera(stream, off) {
  console.log('[MEDIA] toggleCamera off:', off)
  stream.getVideoTracks().forEach(t => {
    t.enabled = !off
  })
}
// ── Aliases for CallScreen.jsx compatibility ──────────────────────────────────
// CallScreen imports listenForAnswer and listenForCallerICE

/**
 * listenForAnswer — alias for watchCallAsCallee_fromCaller
 * Called by CALLER to watch for callee's answer + ICE candidates.
 * onActive() called when call goes active.
 * onEnd(status) called when call ends/declines.
 */
export function listenForAnswer(callId, pc, onActive, onEnd) {
  return watchCallAsCallee_fromCaller({
    callId,
    pc,
    onStatusChange: s => {
      if (s === 'active') onActive?.()
      else onEnd?.(s)
    },
  })
}

/**
 * listenForCallerICE — alias for watchCallStatus (callee side)
 * Called by CALLEE to watch for caller ICE candidates + call end.
 * The actual ICE candidate watching is already set up inside answerCall().
 * This just watches for call status changes (ended, declined).
 */
export function listenForCallerICE(callId, pc, onEnd) {
  return watchCallStatus(callId, s => {
    if (['ended', 'declined', 'missed'].includes(s)) onEnd?.(s)
  })
}