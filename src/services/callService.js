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

// ── ICE servers with Open Relay TURN ─────────────────────────────────────────
function getIceServers() {
  return {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: 'turn:openrelay.metered.ca:80',
        username: 'openrelay',
        credential: 'openrelay',
      },
      {
        urls: 'turn:openrelay.metered.ca:443',
        username: 'openrelay',
        credential: 'openrelay',
      },
      {
        urls: 'turns:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelay',
        credential: 'openrelay',
      },
    ],
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function callRef(callId) {
  return doc(db, 'calls', callId)
}

function candidatesRef(callId, side) {
  return collection(db, 'calls', callId, `${side}Candidates`)
}

function isOpen(pc) {
  return pc && pc.signalingState !== 'closed'
}

// ── Initiate a call (caller side) ─────────────────────────────────────────────

export async function initiateCall({ callerId, calleeId, convId, type = 'video' }) {
  const localStream = await getLocalStream(type)
  const pc          = new RTCPeerConnection(getIceServers())

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream))

  const callDoc = await addDoc(collection(db, 'calls'), {
    callerId,
    calleeId,
    convId,
    type,
    status:    'ringing',
    createdAt: serverTimestamp(),
  })

  const callId = callDoc.id

  pc.onicecandidate = e => {
    if (e.candidate && isOpen(pc)) {
      addDoc(candidatesRef(callId, 'caller'), e.candidate.toJSON()).catch(console.error)
    }
  }

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)

  await updateDoc(callRef(callId), {
    offer: { type: offer.type, sdp: offer.sdp },
  })

  function cleanup() {
    pc.close()
    localStream.getTracks().forEach(t => t.stop())
  }

  return { callId, pc, localStream, cleanup }
}

// ── Watch for answer + callee ICE candidates (caller side) ────────────────────

export function watchCallAsCallee_fromCaller({ callId, pc, onRemoteStream, onStatusChange }) {
  const unsubCall = onSnapshot(callRef(callId), snap => {
    const data = snap.data()
    if (!data) return

    if (data.answer && !pc.currentRemoteDescription && isOpen(pc)) {
      pc.setRemoteDescription(new RTCSessionDescription(data.answer)).catch(console.error)
    }

    if (['ended', 'declined', 'missed'].includes(data.status)) {
      onStatusChange?.(data.status)
    }
    if (data.status === 'active') {
      onStatusChange?.('active')
    }
  })

  const unsubCandidates = onSnapshot(candidatesRef(callId, 'callee'), snap => {
    snap.docChanges().forEach(change => {
      if (change.type === 'added' && isOpen(pc)) {
        pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(console.error)
      }
    })
  })

  // Also set ontrack here as fallback
  pc.ontrack = e => {
    if (e.streams?.[0]) onRemoteStream?.(e.streams[0])
  }

  return () => { unsubCall(); unsubCandidates() }
}

// ── Answer a call (callee side) ───────────────────────────────────────────────

export async function answerCall({ callId, type = 'video' }) {
  const snap = await getDoc(callRef(callId))
  if (!snap.exists()) throw new Error('Call not found')

  const data = snap.data()
  if (!data.offer) throw new Error('No offer found in call document')

  const localStream = await getLocalStream(type)
  const pc          = new RTCPeerConnection(getIceServers())

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream))

  pc.onicecandidate = e => {
    if (e.candidate && isOpen(pc)) {
      addDoc(candidatesRef(callId, 'callee'), e.candidate.toJSON()).catch(console.error)
    }
  }

  await pc.setRemoteDescription(new RTCSessionDescription(data.offer))

  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)

  await updateDoc(callRef(callId), {
    answer: { type: answer.type, sdp: answer.sdp },
    status: 'active',
  })

  const unsubCandidates = onSnapshot(candidatesRef(callId, 'caller'), snap => {
    snap.docChanges().forEach(change => {
      if (change.type === 'added' && isOpen(pc)) {
        pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(console.error)
      }
    })
  })

  function cleanup() {
    unsubCandidates()
    pc.close()
    localStream.getTracks().forEach(t => t.stop())
  }

  return { pc, localStream, cleanup }
}

// ── Attach remote stream ──────────────────────────────────────────────────────

export function attachRemoteStream(pc, onRemoteStream) {
  pc.ontrack = e => {
    if (e.streams?.[0]) onRemoteStream(e.streams[0])
  }
}

// ── Watch call status ─────────────────────────────────────────────────────────

export function watchCallStatus(callId, onStatusChange) {
  return onSnapshot(callRef(callId), snap => {
    const status = snap.data()?.status
    if (status) onStatusChange(status)
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
    snap.docChanges().forEach(change => {
      if (change.type === 'added') {
        onIncoming({ callId: change.doc.id, ...change.doc.data() })
      }
    })
  })
}

// ── End a call ────────────────────────────────────────────────────────────────

export async function endCall(callId) {
  try {
    await updateDoc(callRef(callId), { status: 'ended', endedAt: serverTimestamp() })
  } catch {}
}

// ── Decline a call ────────────────────────────────────────────────────────────

export async function declineCall(callId) {
  try {
    await updateDoc(callRef(callId), { status: 'declined', endedAt: serverTimestamp() })
  } catch {}
}

// ── Mark missed ───────────────────────────────────────────────────────────────

export async function markCallMissed(callId) {
  try {
    await updateDoc(callRef(callId), { status: 'missed', endedAt: serverTimestamp() })
  } catch {}
}

// ── Media helpers ─────────────────────────────────────────────────────────────

async function getLocalStream(type) {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video'
        ? { width: 1280, height: 720, facingMode: 'user' }
        : false,
    })
  } catch (err) {
    if (err.name === 'NotAllowedError') {
      throw new Error('Camera/microphone permission denied. Please allow access and try again.')
    }
    if (err.name === 'NotFoundError') {
      throw new Error('No camera or microphone found on this device.')
    }
    throw err
  }
}

export async function getLocalAudioStream() { return getLocalStream('audio') }
export async function getLocalVideoStream() { return getLocalStream('video') }

export function toggleMute(stream, muted) {
  stream.getAudioTracks().forEach(t => { t.enabled = !muted })
}

export function toggleCamera(stream, off) {
  stream.getVideoTracks().forEach(t => { t.enabled = !off })
}