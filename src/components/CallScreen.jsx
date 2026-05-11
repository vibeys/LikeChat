// src/components/CallScreen.jsx
//
// Messenger-style call screen.
// Props:
//   callId, isCaller, callType ('audio'|'video')
//   callerName, callerPhoto, calleeName, calleePhoto
//   currentUser
//   localStream, pc   — provided by ChatWindow for caller; callee creates internally
//   onEnd             — called when call is fully over

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  answerCall,
  declineCall,
  endCall,
  listenForAnswer,
  listenForCallerICE,
  toggleCamera,
  toggleMute,
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
  localStream: callerStream,
  pc: callerPc,
  cleanup: callerCleanup,
  onEnd,
}) {
  const [phase,        setPhase]        = useState(isCaller ? 'ringing' : 'connecting')
  const [localStream,  setLocalStream]  = useState(callerStream ?? null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [muted,        setMuted]        = useState(false)
  const [camOff,       setCamOff]       = useState(false)
  const [elapsed,      setElapsed]      = useState(0)
  const [pip,          setPip]          = useState(false)

  const pcRef        = useRef(callerPc ?? null)
  const cleanupRef   = useRef(callerCleanup ?? null)
  const unsubRef     = useRef(null)
  const timerRef     = useRef(null)
  const doneRef      = useRef(false)
  const localVidRef  = useRef(null)
  const remoteVidRef = useRef(null)

  const otherName  = isCaller ? calleeName  : callerName
  const otherPhoto = isCaller ? calleePhoto : callerPhoto
  const isVideo    = callType === 'video'

  // ── Attach stream to a video element safely ───────────────────────────────
  function attachStream(el, stream) {
    if (!el || !stream) return
    if (el.srcObject === stream) return
    el.srcObject = stream
    el.play().catch(() => {})
  }

  // ── Local video callback ref — fires when element mounts ──────────────────
  const localVidCb = useCallback(el => {
    localVidRef.current = el
    attachStream(el, localStream)
  }, [localStream])

  // ── Remote video callback ref ─────────────────────────────────────────────
  const remoteVidCb = useCallback(el => {
    remoteVidRef.current = el
    attachStream(el, remoteStream)
  }, [remoteStream])

  // Re-attach when streams change
  useEffect(() => { attachStream(localVidRef.current,  localStream)  }, [localStream])
  useEffect(() => { attachStream(remoteVidRef.current, remoteStream) }, [remoteStream])

  // ── ontrack: capture remote stream ───────────────────────────────────────
  function setupOnTrack(pc) {
    pc.ontrack = e => {
      console.log('ontrack fired, streams:', e.streams?.length, 'tracks:', e.track?.kind)
      if (e.streams?.[0]) {
        setRemoteStream(e.streams[0])
        setPhase('active')
      }
    }
  }

  // ── CALLER setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isCaller || !pcRef.current) return
    const pc = pcRef.current
    setupOnTrack(pc)

    unsubRef.current = listenForAnswer(
      callId, pc,
      () => setPhase('active'),         // onActive
      (s) => {                          // onEnd
        if (s === 'declined') toast.error(`${otherName} declined`)
        handleEnd()
      }
    )
  }, [isCaller, callId])

  // ── CALLEE setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (isCaller) return

    ;(async () => {
      try {
        const { pc, localStream } = await answerCall({ callId, type: callType })
        pcRef.current = pc

        setupOnTrack(pc)
        setLocalStream(localStream)
        setPhase('active')

        // Store callee cleanup
        cleanupRef.current = () => {
          pcRef.current?.close()
          localStream?.getTracks().forEach(t => t.stop())
        }

        unsubRef.current = listenForCallerICE(
          callId, pc,
          () => handleEnd()             // onEnd
        )
      } catch (err) {
        toast.error(err.message || 'Could not connect call')
        handleEnd()
      }
    })()
  }, [])

  // ── Timer ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active') return
    timerRef.current = setInterval(() => setElapsed(n => n + 1), 1000)
    return () => clearInterval(timerRef.current)
  }, [phase])

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current)
      unsubRef.current?.()
      if (cleanupRef.current) {
        cleanupRef.current()
      } else {
        pcRef.current?.close()
        localStream?.getTracks().forEach(t => t.stop())
      }
    }
  }, [])

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleEnd = useCallback(async () => {
    if (doneRef.current) return
    doneRef.current = true
    clearInterval(timerRef.current)
    unsubRef.current?.()
    // Use caller's cleanup fn if available, otherwise close manually
    if (cleanupRef.current) {
      cleanupRef.current()
    } else {
      pcRef.current?.close()
      localStream?.getTracks().forEach(t => t.stop())
    }
    try { await endCall(callId) } catch {}
    onEnd?.()
  }, [callId, localStream, onEnd])

  const handleDecline = useCallback(async () => {
    if (doneRef.current) return
    doneRef.current = true
    if (cleanupRef.current) {
      cleanupRef.current()
    } else {
      pcRef.current?.close()
      localStream?.getTracks().forEach(t => t.stop())
    }
    try { await declineCall(callId) } catch {}
    onEnd?.()
  }, [callId, localStream, onEnd])

  function onMute() {
    const next = !muted
    toggleMute(localStream, next)
    setMuted(next)
  }

  function onCam() {
    const next = !camOff
    toggleCamera(localStream, next)
    setCamOff(next)
  }

  function fmt(s) {
    return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`
  }

  const ac = getAvatarColor(otherName || '')

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>

      <div className="cs-root">

        {/* ── Background: remote video OR avatar ── */}
        {isVideo && remoteStream ? (
          <video ref={remoteVidCb} className="cs-remote-vid" autoPlay playsInline />
        ) : (
          <div className="cs-bg">
            {/* Blurred avatar background */}
            <div
              className="cs-bg-blur"
              style={{
                backgroundImage: otherPhoto ? `url(${otherPhoto})` : 'none',
                backgroundColor: otherPhoto ? 'transparent' : ac.bg,
              }}
            />
            <div className="cs-bg-overlay" />

            {/* Center avatar */}
            <div className={`cs-avatar-wrap ${phase === 'ringing' ? 'cs-pulse' : ''}`}>
              {otherPhoto ? (
                <img src={otherPhoto} alt={otherName} className="cs-avatar-img" />
              ) : (
                <div className="cs-avatar-fb" style={{ background: ac.bg, color: ac.text }}>
                  {getInitials(otherName || '?')}
                </div>
              )}
            </div>

            <p className="cs-name">{otherName}</p>

            <p className="cs-phase">
              {phase === 'ringing'    && (isCaller ? 'Calling…'     : 'Incoming call')}
              {phase === 'connecting' && 'Connecting…'}
              {phase === 'active'     && fmt(elapsed)}
            </p>
          </div>
        )}

        {/* ── Local video PiP ── */}
        {isVideo && localStream && (
          <div
            className={`cs-pip ${pip ? 'cs-pip-sm' : ''}`}
            onClick={() => setPip(v => !v)}
          >
            <video ref={localVidCb} className="cs-pip-vid" autoPlay playsInline muted style={{ opacity: camOff ? 0 : 1 }} />
            {camOff && (
              <div className="cs-pip-off">
                <span className="material-icons">videocam_off</span>
              </div>
            )}
          </div>
        )}

        {/* Timer overlay when video is active */}
        {isVideo && remoteStream && phase === 'active' && (
          <div className="cs-timer">{fmt(elapsed)}</div>
        )}

        {/* ── Bottom controls ── */}
        <div className="cs-bar">

          {/* Mute */}
          <div className="cs-ctl-wrap">
            <button className={`cs-ctl ${muted ? 'cs-ctl-on' : ''}`} onClick={onMute}>
              <span className="material-icons">{muted ? 'mic_off' : 'mic'}</span>
            </button>
            <span className="cs-ctl-lbl">{muted ? 'Unmute' : 'Mute'}</span>
          </div>

          {/* Camera (video only) */}
          {isVideo && (
            <div className="cs-ctl-wrap">
              <button className={`cs-ctl ${camOff ? 'cs-ctl-on' : ''}`} onClick={onCam}>
                <span className="material-icons">{camOff ? 'videocam_off' : 'videocam'}</span>
              </button>
              <span className="cs-ctl-lbl">{camOff ? 'Show cam' : 'Camera'}</span>
            </div>
          )}

          {/* Speaker (visual only for now) */}
          <div className="cs-ctl-wrap">
            <button className="cs-ctl">
              <span className="material-icons">volume_up</span>
            </button>
            <span className="cs-ctl-lbl">Speaker</span>
          </div>

          {/* End call */}
          <div className="cs-ctl-wrap">
            <button className="cs-ctl cs-ctl-end" onClick={handleEnd}>
              <span className="material-icons">call_end</span>
            </button>
            <span className="cs-ctl-lbl">End</span>
          </div>

          {/* Decline (callee before active) */}
          {!isCaller && phase !== 'active' && (
            <div className="cs-ctl-wrap">
              <button className="cs-ctl cs-ctl-end" onClick={handleDecline}>
                <span className="material-icons">call_end</span>
              </button>
              <span className="cs-ctl-lbl">Decline</span>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ── IncomingCallToast ─────────────────────────────────────────────────────────
export function IncomingCallToast({ callerName, callerPhoto, callType, onAnswer, onDecline }) {
  const ac = getAvatarColor(callerName || '')
  return (
    <>
      <style>{TOAST_CSS}</style>
      <div className="ict-card">
        <div className="ict-left">
          {callerPhoto
            ? <img src={callerPhoto} className="ict-av" alt={callerName} />
            : <div className="ict-av ict-av-fb" style={{ background: ac.bg, color: ac.text }}>{getInitials(callerName || '?')}</div>
          }
          <div>
            <p className="ict-name">{callerName}</p>
            <p className="ict-sub">{callType === 'video' ? '📹 Video call' : '📞 Voice call'}</p>
          </div>
        </div>
        <div className="ict-btns">
          <button className="ict-btn ict-ans" onClick={onAnswer}>
            <span className="material-icons">{callType === 'video' ? 'videocam' : 'call'}</span>
          </button>
          <button className="ict-btn ict-dec" onClick={onDecline}>
            <span className="material-icons">call_end</span>
          </button>
        </div>
      </div>
    </>
  )
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
  .cs-root {
    position: fixed; inset: 0; z-index: 200;
    display: flex; flex-direction: column;
    background: #111;
    animation: cs-in 0.2s ease both;
  }
  @keyframes cs-in {
    from { opacity:0; transform:scale(1.03); }
    to   { opacity:1; transform:scale(1); }
  }

  /* Remote video fills entire screen */
  .cs-remote-vid {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    object-fit: cover;
  }

  /* Avatar background (audio or pre-connect) */
  .cs-bg {
    flex: 1;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    position: relative; overflow: hidden;
  }
  .cs-bg-blur {
    position: absolute; inset: -20px;
    background-size: cover; background-position: center;
    filter: blur(24px) brightness(0.4) saturate(1.2);
  }
  .cs-bg-overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 100%);
  }

  /* Avatar */
  .cs-avatar-wrap {
    position: relative; z-index: 1;
    width: 120px; height: 120px; border-radius: 50%;
    overflow: hidden;
    box-shadow: 0 0 0 4px rgba(255,255,255,0.15);
    margin-bottom: 20px;
  }
  .cs-pulse { animation: cs-pulse 2s ease infinite; }
  @keyframes cs-pulse {
    0%,100% { box-shadow: 0 0 0 4px  rgba(255,255,255,0.15), 0 0 0 0   rgba(255,255,255,0); }
    50%      { box-shadow: 0 0 0 4px  rgba(255,255,255,0.15), 0 0 0 20px rgba(255,255,255,0); }
  }
  .cs-avatar-img { width:100%; height:100%; object-fit:cover; }
  .cs-avatar-fb  {
    width:100%; height:100%;
    display:flex; align-items:center; justify-content:center;
    font-size:40px; font-weight:900;
  }

  .cs-name  { position:relative; z-index:1; font-size:24px; font-weight:700; color:#fff; margin:0 0 8px; text-shadow:0 2px 8px rgba(0,0,0,0.5); }
  .cs-phase { position:relative; z-index:1; font-size:14px; color:rgba(255,255,255,0.6); margin:0; }

  /* Local PiP */
  .cs-pip {
    position: absolute; top: 24px; right: 16px;
    width: 100px; height: 150px; border-radius: 14px;
    overflow: hidden; z-index: 10;
    border: 2px solid rgba(255,255,255,0.2);
    box-shadow: 0 6px 20px rgba(0,0,0,0.5);
    cursor: pointer; transition: all 0.2s;
  }
  .cs-pip:hover  { transform:scale(1.04); border-color:rgba(255,255,255,0.4); }
  .cs-pip-sm     { width:70px; height:100px; border-radius:10px; }
  .cs-pip-vid    { width:100%; height:100%; object-fit:cover; }
  .cs-pip-off    {
    position:absolute; inset:0;
    display:flex; align-items:center; justify-content:center;
    background:#1a1a1a; color:rgba(255,255,255,0.35); font-size:22px;
  }

  /* Timer */
  .cs-timer {
    position: absolute; top: 20px; left: 50%; transform: translateX(-50%);
    background: rgba(0,0,0,0.5); color: rgba(255,255,255,0.85);
    font-size: 13px; font-weight: 600; padding: 5px 14px;
    border-radius: 999px; backdrop-filter: blur(8px); z-index: 10;
    letter-spacing: 0.05em;
  }

  /* Control bar */
  .cs-bar {
    position: relative; z-index: 20;
    display: flex; align-items: flex-end; justify-content: center;
    gap: 24px; padding: 28px 24px calc(36px + env(safe-area-inset-bottom));
    background: linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%);
  }

  .cs-ctl-wrap {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
  }

  .cs-ctl {
    width: 56px; height: 56px; border-radius: 50%; border: none;
    background: rgba(255,255,255,0.15); color: #fff;
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; transition: background 0.15s, transform 0.1s;
    backdrop-filter: blur(8px);
  }
  .cs-ctl .material-icons { font-size: 24px; }
  .cs-ctl:hover  { background: rgba(255,255,255,0.25); transform: scale(1.06); }
  .cs-ctl:active { transform: scale(0.94); }
  .cs-ctl-on  { background: rgba(255,255,255,0.9) !important; color: #111 !important; }
  .cs-ctl-end { background: #e53935 !important; box-shadow: 0 4px 16px rgba(229,57,53,0.5); }
  .cs-ctl-end:hover { background: #c62828 !important; }

  .cs-ctl-lbl {
    font-size: 11px; color: rgba(255,255,255,0.65); font-weight: 500;
    white-space: nowrap;
  }
`

const TOAST_CSS = `
  .ict-card {
    width: min(320px, calc(100vw - 32px));
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 14px 16px;
    display: flex; align-items: center; justify-content: space-between;
    gap: 12px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.4);
    animation: ict-in 0.25s cubic-bezier(0.34,1.56,0.64,1) both;
  }
  @keyframes ict-in {
    from { opacity:0; transform:scale(0.9) translateY(10px); }
    to   { opacity:1; transform:scale(1)   translateY(0); }
  }
  .ict-left { display:flex; align-items:center; gap:12px; flex:1; min-width:0; }
  .ict-av   {
    width:46px; height:46px; border-radius:50%; object-fit:cover; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    font-size:16px; font-weight:800;
    animation: ict-pulse 1.5s ease infinite;
  }
  @keyframes ict-pulse {
    0%,100% { box-shadow: 0 0 0 0   rgba(30,144,255,0.4); }
    50%      { box-shadow: 0 0 0 10px rgba(30,144,255,0); }
  }
  .ict-av-fb { }
  .ict-name  { font-size:14px; font-weight:700; color:var(--text-primary); margin:0; }
  .ict-sub   { font-size:12px; color:var(--text-tertiary); margin:2px 0 0; }
  .ict-btns  { display:flex; gap:10px; flex-shrink:0; }
  .ict-btn   {
    width:44px; height:44px; border-radius:50%; border:none;
    display:flex; align-items:center; justify-content:center;
    cursor:pointer; transition:transform 0.1s, opacity 0.15s;
  }
  .ict-btn .material-icons { font-size:20px; }
  .ict-btn:hover  { opacity:0.85; }
  .ict-btn:active { transform:scale(0.93); }
  .ict-ans { background:#12d65f; color:#000; }
  .ict-dec { background:#e53935; color:#fff; }
`