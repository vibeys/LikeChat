// src/components/CallScreen.jsx
import { useEffect, useRef, useState, useCallback } from 'react'
import {
  answerCall,
  declineCall,
  endCall,
  toggleCamera,
  toggleMute,
  watchCallAsCallee_fromCaller,
  watchCallStatus,
} from '../services/callService'
import { getInitials, getAvatarColor } from '../lib/utils'
import toast from 'react-hot-toast'

export default function CallScreen({
  callId,
  isCaller,
  callType,
  callerName,
  callerPhoto,
  calleeName,
  calleePhoto,
  currentUser,
  localStream: initialLocalStream,
  pc: initialPc,
  cleanup: initialCleanup,
  onEnd,
}) {
  const [status,       setStatus]       = useState(isCaller ? 'ringing' : 'answering')
  const [remoteStream, setRemoteStream] = useState(null)
  const [localStream,  setLocalStream]  = useState(initialLocalStream ?? null)
  const [muted,        setMuted]        = useState(false)
  const [camOff,       setCamOff]       = useState(false)
  const [speaker,      setSpeaker]      = useState(true)
  const [elapsed,      setElapsed]      = useState(0)
  const [pipMode,      setPipMode]      = useState(false)

  const pcRef         = useRef(initialPc ?? null)
  const cleanupRef    = useRef(initialCleanup ?? null)
  const timerRef      = useRef(null)
  const localVideoRef  = useRef(null)
  const remoteVideoRef = useRef(null)
  const endedRef      = useRef(false)

  const otherName  = isCaller ? calleeName  : callerName
  const otherPhoto = isCaller ? calleePhoto : callerPhoto

  // ── Answer the call (callee side) ─────────────────────────────────────────
  useEffect(() => {
    if (isCaller) return

    ;(async () => {
      try {
        const { pc, localStream, cleanup } = await answerCall({
          callId,
          type: callType,
        })

        pcRef.current      = pc
        cleanupRef.current = cleanup
        setLocalStream(localStream)
        setStatus('active')

        // Attach ontrack directly — must be set before ICE exchange completes
        pc.ontrack = e => {
          console.log('callee ontrack fired', e.streams)
          if (e.streams?.[0]) setRemoteStream(e.streams[0])
        }

      } catch (err) {
        toast.error(err.message || 'Failed to connect call')
        handleEnd()
      }
    })()
  }, [])

  // ── Caller: watch for answer + remote stream ──────────────────────────────
  useEffect(() => {
    if (!isCaller || !pcRef.current) return

    const pc = pcRef.current

    // Set ontrack FIRST before any ICE exchange
    pc.ontrack = e => {
      console.log('caller ontrack fired', e.streams)
      if (e.streams?.[0]) {
        setRemoteStream(e.streams[0])
        setStatus('active')
      }
    }

    const unsub = watchCallAsCallee_fromCaller({
      callId,
      pc,
      onRemoteStream: stream => {
        setRemoteStream(stream)
        setStatus('active')
      },
      onStatusChange: s => {
        if (s === 'active')   setStatus('active')
        if (s === 'declined') {
          toast.error(`${otherName} declined the call`)
          handleEnd()
        }
        if (s === 'ended') handleEnd()
      },
    })

    return unsub
  }, [isCaller, callId])

  // ── Callee: watch if caller hangs up ──────────────────────────────────────
  useEffect(() => {
    if (isCaller) return
    const unsub = watchCallStatus(callId, s => {
      if (s === 'ended' || s === 'declined') handleEnd()
    })
    return unsub
  }, [isCaller, callId])

  // ── Attach local stream to video element ──────────────────────────────────
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  // ── Attach remote stream to video element ─────────────────────────────────
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      console.log('attaching remote stream to video element')
      remoteVideoRef.current.srcObject = remoteStream
      remoteVideoRef.current.play().catch(err => {
        console.warn('remote video play failed:', err)
      })
    }
  }, [remoteStream])

  // ── Elapsed timer ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'active') return
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    return () => clearInterval(timerRef.current)
  }, [status])

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current)
      cleanupRef.current?.()
    }
  }, [])

  // ── Actions ───────────────────────────────────────────────────────────────

  const handleEnd = useCallback(async () => {
    if (endedRef.current) return
    endedRef.current = true
    clearInterval(timerRef.current)
    cleanupRef.current?.()
    try { await endCall(callId) } catch {}
    onEnd?.()
  }, [callId, onEnd])

  const handleDecline = useCallback(async () => {
    if (endedRef.current) return
    endedRef.current = true
    cleanupRef.current?.()
    try { await declineCall(callId) } catch {}
    onEnd?.()
  }, [callId, onEnd])

  function handleToggleMute() {
    if (!localStream) return
    const next = !muted
    toggleMute(localStream, next)
    setMuted(next)
  }

  function handleToggleCam() {
    if (!localStream || callType !== 'video') return
    const next = !camOff
    toggleCamera(localStream, next)
    setCamOff(next)
  }

  function fmtTime(s) {
    const m   = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  const isVideo = callType === 'video'
  const ac      = getAvatarColor(otherName || '')

  return (
    <>
      <style>{CSS}</style>

      <div className={`cs-overlay ${isVideo && remoteStream ? 'cs-video-mode' : 'cs-audio-mode'}`}>

        {/* Remote video (full screen background) */}
        {isVideo && (
          <video
            ref={remoteVideoRef}
            className="cs-remote-video"
            autoPlay
            playsInline
            style={{ opacity: remoteStream ? 1 : 0 }}
          />
        )}

        {/* Audio / pre-connect background */}
        {(!isVideo || !remoteStream) && (
          <div className="cs-audio-bg">
            <div className={`cs-avatar-ring ${status === 'ringing' ? 'cs-ringing' : ''}`}>
              {otherPhoto ? (
                <img src={otherPhoto} alt={otherName} className="cs-big-avatar" />
              ) : (
                <div
                  className="cs-big-avatar cs-big-avatar-fallback"
                  style={{ background: ac.bg, color: ac.text }}
                >
                  {getInitials(otherName || '?')}
                </div>
              )}
            </div>

            <h2 className="cs-other-name">{otherName}</h2>

            <p className="cs-status-text">
              {status === 'ringing'   && (isCaller ? 'Calling…' : 'Incoming call')}
              {status === 'answering' && 'Connecting…'}
              {status === 'active'    && fmtTime(elapsed)}
            </p>
          </div>
        )}

        {/* Local video PiP */}
        {isVideo && localStream && (
          <div
            className={`cs-local-pip ${pipMode ? 'cs-pip-small' : ''}`}
            onClick={() => setPipMode(v => !v)}
          >
            <video
              ref={localVideoRef}
              className="cs-local-video"
              autoPlay
              playsInline
              muted
              style={{ opacity: camOff ? 0 : 1 }}
            />
            {camOff && (
              <div className="cs-cam-off-overlay">
                <span className="material-icons" style={{ fontSize: '20px' }}>videocam_off</span>
              </div>
            )}
          </div>
        )}

        {/* Timer badge (video active) */}
        {isVideo && remoteStream && status === 'active' && (
          <div className="cs-timer-badge">{fmtTime(elapsed)}</div>
        )}

        {/* Controls */}
        <div className="cs-controls">
          <CallBtn
            icon={muted ? 'mic_off' : 'mic'}
            label={muted ? 'Unmute' : 'Mute'}
            active={muted}
            onClick={handleToggleMute}
          />

          {isVideo && (
            <CallBtn
              icon={camOff ? 'videocam_off' : 'videocam'}
              label={camOff ? 'Show' : 'Camera'}
              active={camOff}
              onClick={handleToggleCam}
            />
          )}

          <CallBtn
            icon={speaker ? 'volume_up' : 'volume_off'}
            label="Speaker"
            active={!speaker}
            onClick={() => setSpeaker(v => !v)}
          />

          <CallBtn
            icon="call_end"
            label="End"
            danger
            onClick={handleEnd}
          />

          {!isCaller && status !== 'active' && (
            <CallBtn
              icon="call_end"
              label="Decline"
              danger
              onClick={handleDecline}
            />
          )}
        </div>
      </div>
    </>
  )
}

// ── CallBtn ───────────────────────────────────────────────────────────────────

function CallBtn({ icon, label, onClick, active = false, danger = false }) {
  return (
    <button
      onClick={onClick}
      className={`cs-btn ${danger ? 'cs-btn-danger' : active ? 'cs-btn-active' : ''}`}
      title={label}
    >
      <span className="material-icons" style={{ fontSize: '22px' }}>{icon}</span>
      <span className="cs-btn-label">{label}</span>
    </button>
  )
}

// ── IncomingCallToast ─────────────────────────────────────────────────────────

export function IncomingCallToast({ t, callerName, callerPhoto, callType, onAnswer, onDecline }) {
  const ac = getAvatarColor(callerName || '')

  return (
    <>
      <style>{`
        .ict-card {
          width: min(340px, calc(100vw - 24px));
          border-radius: 20px;
          border: 1px solid var(--border);
          background: var(--bg-primary);
          box-shadow: 0 16px 48px rgba(0,0,0,0.55);
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          animation: ict-pop 0.28s cubic-bezier(0.34,1.56,0.64,1) both;
        }
        @keyframes ict-pop {
          from { opacity:0; transform: scale(0.88) translateY(12px); }
          to   { opacity:1; transform: scale(1) translateY(0); }
        }
        .ict-top { display: flex; align-items: center; gap: 12px; }
        .ict-avatar {
          width: 52px; height: 52px; border-radius: 50%; object-fit: cover;
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; font-weight: 800; flex-shrink: 0;
        }
        .ict-pulse {
          animation: ict-pulse 1.4s ease infinite;
        }
        @keyframes ict-pulse {
          0%   { box-shadow: 0 0 0 0   rgba(30,144,255,0.45); }
          70%  { box-shadow: 0 0 0 12px rgba(30,144,255,0); }
          100% { box-shadow: 0 0 0 0   rgba(30,144,255,0); }
        }
        .ict-name { font-size: 15px; font-weight: 800; color: var(--text-primary); margin: 0; }
        .ict-sub  { font-size: 12px; color: var(--text-tertiary); margin: 3px 0 0; }
        .ict-btns { display: flex; gap: 10px; }
        .ict-btn {
          flex: 1; padding: 11px; border-radius: 14px; border: none;
          font-size: 13px; font-weight: 800; cursor: pointer;
          display: flex; align-items: center; justify-content: center; gap: 6px;
          transition: opacity 0.15s;
        }
        .ict-btn:hover { opacity: 0.85; }
        .ict-accept  { background: var(--success, #12d65f); color: #000; }
        .ict-decline { background: var(--danger,  #e53935); color: #fff; }
      `}</style>

      <div className="ict-card">
        <div className="ict-top">
          {callerPhoto ? (
            <img src={callerPhoto} alt={callerName} className="ict-avatar ict-pulse" />
          ) : (
            <div className="ict-avatar ict-pulse" style={{ background: ac.bg, color: ac.text }}>
              {getInitials(callerName || '?')}
            </div>
          )}
          <div>
            <p className="ict-name">{callerName}</p>
            <p className="ict-sub">
              {callType === 'video' ? '📹 Incoming video call' : '📞 Incoming voice call'}
            </p>
          </div>
        </div>

        <div className="ict-btns">
          <button className="ict-btn ict-accept" onClick={onAnswer}>
            <span className="material-icons" style={{ fontSize: '18px' }}>
              {callType === 'video' ? 'videocam' : 'call'}
            </span>
            Answer
          </button>
          <button className="ict-btn ict-decline" onClick={onDecline}>
            <span className="material-icons" style={{ fontSize: '18px' }}>call_end</span>
            Decline
          </button>
        </div>
      </div>
    </>
  )
}

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
  .cs-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    overflow: hidden;
    animation: cs-in 0.25s ease both;
  }

  @keyframes cs-in {
    from { opacity: 0; transform: scale(1.04); }
    to   { opacity: 1; transform: scale(1); }
  }

  .cs-audio-mode { background: #0a0a0a; }
  .cs-video-mode { background: #000; }

  .cs-remote-video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: opacity 0.4s ease;
  }

  .cs-audio-bg {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding-bottom: 160px;
    background: radial-gradient(ellipse at 50% 35%, #1a2a3a 0%, #0a0a0a 70%);
  }

  .cs-avatar-ring {
    border-radius: 50%;
    padding: 6px;
    border: 2px solid transparent;
  }

  .cs-ringing {
    animation: cs-ring 1.6s ease infinite;
  }

  @keyframes cs-ring {
    0%,100% { box-shadow: 0 0 0 0   rgba(30,144,255,0.5),  0 0 0 0   rgba(30,144,255,0.25); }
    50%      { box-shadow: 0 0 0 18px rgba(30,144,255,0),   0 0 0 36px rgba(30,144,255,0); }
  }

  .cs-big-avatar {
    width: 108px;
    height: 108px;
    border-radius: 50%;
    object-fit: cover;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .cs-big-avatar-fallback {
    font-size: 36px;
    font-weight: 900;
  }

  .cs-other-name {
    font-size: 26px;
    font-weight: 800;
    color: #fff;
    margin: 0;
    text-shadow: 0 2px 12px rgba(0,0,0,0.6);
  }

  .cs-status-text {
    font-size: 14px;
    color: rgba(255,255,255,0.55);
    margin: 0;
    letter-spacing: 0.02em;
  }

  .cs-local-pip {
    position: absolute;
    top: 20px;
    right: 16px;
    width: 110px;
    height: 160px;
    border-radius: 16px;
    overflow: hidden;
    border: 2px solid rgba(255,255,255,0.18);
    box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    cursor: pointer;
    transition: all 0.2s ease;
    z-index: 10;
  }

  .cs-local-pip:hover {
    border-color: rgba(30,144,255,0.6);
    transform: scale(1.03);
  }

  .cs-pip-small {
    width: 72px;
    height: 96px;
    border-radius: 12px;
  }

  .cs-local-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: opacity 0.2s;
  }

  .cs-cam-off-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #111;
    color: rgba(255,255,255,0.4);
  }

  .cs-timer-badge {
    position: absolute;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0,0,0,0.55);
    color: rgba(255,255,255,0.85);
    font-size: 13px;
    font-weight: 700;
    padding: 5px 12px;
    border-radius: 999px;
    backdrop-filter: blur(8px);
    letter-spacing: 0.05em;
    z-index: 10;
  }

  .cs-controls {
    position: relative;
    z-index: 20;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 20px 24px calc(20px + env(safe-area-inset-bottom));
    background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%);
    width: 100%;
  }

  .cs-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 14px;
    border-radius: 50%;
    border: none;
    background: rgba(255,255,255,0.12);
    color: #fff;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.12s ease;
    backdrop-filter: blur(8px);
    width: 60px;
    height: 60px;
  }

  .cs-btn:hover  { background: rgba(255,255,255,0.2); transform: scale(1.06); }
  .cs-btn:active { transform: scale(0.95); }
  .cs-btn-active { background: rgba(255,255,255,0.22); }

  .cs-btn-danger {
    background: var(--danger, #e53935);
    width: 68px;
    height: 68px;
    box-shadow: 0 6px 20px rgba(229,57,53,0.45);
  }
  .cs-btn-danger:hover { background: #c62828; }

  .cs-btn-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.02em;
    display: none;
  }

  @media (min-width: 480px) {
    .cs-btn-label { display: block; }
    .cs-btn       { width: auto; height: auto; border-radius: 20px; padding: 12px 16px; }
    .cs-btn-danger { width: auto; height: auto; border-radius: 20px; padding: 12px 20px; }
  }
`