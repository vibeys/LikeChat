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

// ── ICE servers ───────────────────────────────────────────────────────────────
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

function callRef(callId) { return doc(db, 'calls', callId) }
function candidatesRef(callId, side) {
  return collection(db, 'calls', callId, `${side}Candidates`)
}
function isOpen(pc) { return pc && pc.signalingState !== 'closed' }

// ── Initiate a call (caller side) ─────────────────────────────────────────────
export async function initiateCall({ callerId, calleeId, convId, type = 'video' }) {
  const localStream = await getLocalStream(type)
  const pc          = new RTCPeerConnection(getIceServers())

  // Debug
  pc.onconnectionstatechange    = () => console.log('[CALLER] connectionState:', pc.connectionState)
  pc.oniceconnectionstatechange = () => console.log('[CALLER] iceConnectionState:', pc.iceConnectionState)
  pc.onicegatheringstatechange  = () => console.log('[CALLER] iceGatheringState:', pc.iceGatheringState)

  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream)
    console.log('[CALLER] added track:', track.kind)
  })

  const callDoc = await addDoc(collection(db, 'calls'), {
    callerId, calleeId, convId, type,
    status: 'ringing', createdAt: serverTimestamp(),
  })

  const callId = callDoc.id
  console.log('[CALLER] call created:', callId)

  pc.onicecandidate = e => {
    if (e.candidate && isOpen(pc)) {
      console.log('[CALLER] ICE candidate:', e.candidate.type)
      addDoc(candidatesRef(callId, 'caller'), e.candidate.toJSON()).catch(console.error)
    }
  }

  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  await updateDoc(callRef(callId), { offer: { type: offer.type, sdp: offer.sdp } })
  console.log('[CALLER] offer set')

  function cleanup() {
    pc.close()
    localStream.getTracks().forEach(t => t.stop())
  }

  return { callId, pc, localStream, cleanup }
}

// ── Watch for answer + callee ICE (caller side) ───────────────────────────────
// NOTE: does NOT set pc.ontrack — CallScreen handles that directly
export function watchCallAsCallee_fromCaller({ callId, pc, onStatusChange }) {
  const unsubCall = onSnapshot(callRef(callId), snap => {
    const data = snap.data()
    if (!data) return

    if (data.answer && !pc.currentRemoteDescription && isOpen(pc)) {
      console.log('[CALLER] setting remote description')
      pc.setRemoteDescription(new RTCSessionDescription(data.answer))
        .then(() => console.log('[CALLER] remote description set OK'))
        .catch(err => console.error('[CALLER] setRemoteDescription error:', err))
    }

    if (['ended', 'declined', 'missed'].includes(data.status)) onStatusChange?.(data.status)
    if (data.status === 'active') onStatusChange?.('active')
  })

  const unsubCandidates = onSnapshot(candidatesRef(callId, 'callee'), snap => {
    snap.docChanges().forEach(change => {
      if (change.type === 'added' && isOpen(pc)) {
        console.log('[CALLER] adding callee ICE candidate')
        pc.addIceCandidate(new RTCIceCandidate(change.doc.data())).catch(console.error)
      }
    })
  })

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

  // Debug
  pc.onconnectionstatechange    = () => console.log('[CALLEE] connectionState:', pc.connectionState)
  pc.oniceconnectionstatechange = () => console.log('[CALLEE] iceConnectionState:', pc.iceConnectionState)
  pc.onicegatheringstatechange  = () => console.log('[CALLEE] iceGatheringState:', pc.iceGatheringState)

  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream)
    console.log('[CALLEE] added track:', track.kind)
  })

  pc.onicecandidate = e => {
    if (e.candidate && isOpen(pc)) {
      console.log('[CALLEE] ICE candidate:', e.candidate.type)
      addDoc(candidatesRef(callId, 'callee'), e.candidate.toJSON()).catch(console.error)
    }
  }

  await pc.setRemoteDescription(new RTCSessionDescription(data.offer))
  console.log('[CALLEE] remote description set')

  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  console.log('[CALLEE] answer set')

  await updateDoc(callRef(callId), {
    answer: { type: answer.type, sdp: answer.sdp },
    status: 'active',
  })

  const unsubCandidates = onSnapshot(candidatesRef(callId, 'caller'), snap => {
    snap.docChanges().forEach(change => {
      if (change.type === 'added' && isOpen(pc)) {
        console.log('[CALLEE] adding caller ICE candidate')
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

export function watchCallStatus(callId, onStatusChange) {
  return onSnapshot(callRef(callId), snap => {
    const status = snap.data()?.status
    if (status) onStatusChange(status)
  })
}

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

export async function endCall(callId) {
  try { await updateDoc(callRef(callId), { status: 'ended', endedAt: serverTimestamp() }) } catch {}
}

export async function declineCall(callId) {
  try { await updateDoc(callRef(callId), { status: 'declined', endedAt: serverTimestamp() }) } catch {}
}

export async function markCallMissed(callId) {
  try { await updateDoc(callRef(callId), { status: 'missed', endedAt: serverTimestamp() }) } catch {}
}

async function getLocalStream(type) {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: type === 'video' ? { width: 1280, height: 720, facingMode: 'user' } : false,
    })
  } catch (err) {
    if (err.name === 'NotAllowedError') throw new Error('Camera/microphone permission denied.')
    if (err.name === 'NotFoundError')   throw new Error('No camera or microphone found.')
    throw err
  }
}

export async function getLocalAudioStream() { return getLocalStream('audio') }
export async function getLocalVideoStream() { return getLocalStream('video') }
export function toggleMute(stream, muted)   { stream.getAudioTracks().forEach(t => { t.enabled = !muted }) }
export function toggleCamera(stream, off)   { stream.getVideoTracks().forEach(t => { t.enabled = !off }) }
// attachRemoteStream kept for backward compat but not used
export function attachRemoteStream(pc, cb) { pc.ontrack = e => { if (e.streams?.[0]) cb(e.streams[0]) } }