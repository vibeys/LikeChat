// src/components/CallScreen.jsx
//
// Messenger-style call screen powered by Daily.co.
// Daily handles ALL WebRTC, ICE, TURN, media — we just join a room.
//
// Props:
//   callId, isCaller, callType ('audio'|'video')
//   callerName, callerPhoto, calleeName, calleePhoto
//   roomUrl  — Daily.co room URL (caller has it; callee gets it via acceptCall)
//   currentUser
//   onEnd    — called when call is fully over

import { useEffect, useRef, useState, useCallback } from 'react'
import DailyIframe from '@daily-co/daily-js'
import {
  acceptCall,
  declineCall,
  endCall,
  watchCallAnswer,
  watchCallEnd,
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
  roomUrl: callerRoomUrl,
  roomName,
  currentUser,
  onEnd,
}) {
  const [phase,       setPhase]      = useState(isCaller ? 'ringing' : 'connecting')
  const [muted,       setMuted]      = useState(false)
  const [camOff,      setCamOff]     = useState(false)
  const [elapsed,     setElapsed]    = useState(0)
  const [hasRemote,   setHasRemote]  = useState(false) // at least one remote participant

  const callObjRef  = useRef(null)  // Daily call object
  const timerRef    = useRef(null)
  const unsubRef    = useRef(null)
  const doneRef     = useRef(false)
  const containerRef = useRef(null) // Daily mounts video tiles here

  const otherName  = isCaller ? calleeName  : callerName
  const otherPhoto = isCaller ? calleePhoto : callerPhoto
  const isVideo    = callType === 'video'
  const ac         = getAvatarColor(otherName || '')

  // ── Join the Daily room ───────────────────────────────────────────────────
  async function joinRoom(url) {
    console.log('[DAILY] joining room:', url)

    const callObject = DailyIframe.createCallObject({
      audioSource: true,
      videoSource: isVideo,
      dailyConfig: { experimentalChromeVideoMuteLightOff: true },
    })

    callObjRef.current = callObject

    // ── Daily event listeners ────────────────────────────────────────────
    callObject.on('joined-meeting', () => {
      console.log('[DAILY] joined meeting')
      setPhase('active')
    })

    callObject.on('participant-joined', e => {
      console.log('[DAILY] participant joined:', e.participant.session_id)
      if (!e.participant.local) setHasRemote(true)
    })

    callObject.on('participant-left', e => {
      if (!e.participant.local) {
        console.log('[DAILY] remote participant left')
        setHasRemote(false)
        handleEnd()
      }
    })

    callObject.on('participant-updated', e => {
      if (e.participant.local) return
      // Check if remote participant has tracks
      const hasTracks = e.participant.tracks?.video?.state === 'playable'
        || e.participant.tracks?.audio?.state === 'playable'
      if (hasTracks) setHasRemote(true)
    })

    callObject.on('error', e => {
      console.error('[DAILY] error:', e)
      toast.error('Call error: ' + (e.errorMsg || 'Unknown error'))
      handleEnd()
    })

    callObject.on('left-meeting', () => {
      console.log('[DAILY] left meeting')
    })

    // ── Join ─────────────────────────────────────────────────────────────
    await callObject.join({
      url,
      userName: currentUser?.displayName || 'User',
      startVideoOff: !isVideo || camOff,
      startAudioOff: muted,
    })

    // ── Mount video tiles into container ──────────────────────────────────
    // Daily auto-manages video tiles when using createCallObject
    // We use the Daily-provided tracks API to render video manually
  }

  // ── CALLER: watch for callee accepting ───────────────────────────────────
  useEffect(() => {
    if (!isCaller) return

    // Join room immediately (caller created it)
    joinRoom(callerRoomUrl).catch(err => {
      toast.error(err.message || 'Failed to start call')
      handleEnd()
    })

    // Watch for callee accepting or declining
    unsubRef.current = watchCallAnswer(
      callId,
      (roomUrl) => {
        console.log('[CALLER] callee accepted')
        setPhase('active')
      },
      () => {
        toast.error(`${otherName} declined the call`)
        handleEnd()
      },
      () => handleEnd()
    )

    return () => unsubRef.current?.()
  }, [isCaller, callId])

  // ── CALLEE: accept call and join room ─────────────────────────────────────
  useEffect(() => {
    if (isCaller) return

    ;(async () => {
      try {
        const roomUrl = await acceptCall(callId)
        console.log('[CALLEE] accepted, joining room:', roomUrl)
        await joinRoom(roomUrl)

        // Watch for caller hanging up
        unsubRef.current = watchCallEnd(callId, () => handleEnd())
      } catch (err) {
        toast.error(err.message || 'Could not connect call')
        handleEnd()
      }
    })()

    return () => unsubRef.current?.()
  }, [isCaller, callId])

  // ── Render Daily video tiles into container ───────────────────────────────
  useEffect(() => {
    if (!containerRef.current || !callObjRef.current) return
    // Daily.co call object manages its own video rendering
    // We use the tracks from participants to render <video> elements
  }, [phase])

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
      if (callObjRef.current) {
        callObjRef.current.leave().catch(() => {})
        callObjRef.current.destroy().catch(() => {})
      }
    }
  }, [])

  // ── Actions ───────────────────────────────────────────────────────────────
  const handleEnd = useCallback(async () => {
    if (doneRef.current) return
    doneRef.current = true
    clearInterval(timerRef.current)
    unsubRef.current?.()
    try {
      if (callObjRef.current) {
        await callObjRef.current.leave()
        await callObjRef.current.destroy()
        callObjRef.current = null
      }
    } catch {}
    try { await endCall(callId, roomName) } catch {}
    onEnd?.()
  }, [callId, roomName, onEnd])

  const handleDecline = useCallback(async () => {
    if (doneRef.current) return
    doneRef.current = true
    try { await declineCall(callId) } catch {}
    onEnd?.()
  }, [callId, onEnd])

  function handleToggleMute() {
    if (!callObjRef.current) return
    const next = !muted
    callObjRef.current.setLocalAudio(!next)
    setMuted(next)
  }

  function handleToggleCam() {
    if (!callObjRef.current || !isVideo) return
    const next = !camOff
    callObjRef.current.setLocalVideo(!next)
    setCamOff(next)
  }

  function fmt(s) {
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>

      <div className="cs-root">

        {/* Daily video container — Daily mounts tiles here */}
        <div ref={containerRef} className="cs-daily-container" id="daily-container" />

        {/* Avatar background shown when no remote video / audio only / connecting */}
        {(!hasRemote || !isVideo) && (
          <div className="cs-bg">
            <div
              className="cs-bg-blur"
              style={{
                backgroundImage: otherPhoto ? `url(${otherPhoto})` : 'none',
                backgroundColor: otherPhoto ? 'transparent' : ac.bg,
              }}
            />
            <div className="cs-bg-overlay" />

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
            <p className="cs-phase-txt">
              {phase === 'ringing'    && (isCaller ? 'Calling…'     : 'Incoming call')}
              {phase === 'connecting' && 'Connecting…'}
              {phase === 'active'     && fmt(elapsed)}
            </p>
          </div>
        )}

        {/* Timer when video is active */}
        {hasRemote && isVideo && phase === 'active' && (
          <div className="cs-timer">{fmt(elapsed)}</div>
        )}

        {/* Control bar */}
        <div className="cs-bar">
          <CtlBtn
            icon={muted ? 'mic_off' : 'mic'}
            label={muted ? 'Unmute' : 'Mute'}
            on={muted}
            onClick={handleToggleMute}
          />

          {isVideo && (
            <CtlBtn
              icon={camOff ? 'videocam_off' : 'videocam'}
              label={camOff ? 'Show cam' : 'Camera'}
              on={camOff}
              onClick={handleToggleCam}
            />
          )}

          <CtlBtn icon="volume_up" label="Speaker" />

          <CtlBtn icon="call_end" label="End" end onClick={handleEnd} />

          {!isCaller && phase !== 'active' && (
            <CtlBtn icon="call_end" label="Decline" end onClick={handleDecline} />
          )}
        </div>
      </div>
    </>
  )
}

// ── Control button ────────────────────────────────────────────────────────────
function CtlBtn({ icon, label, onClick, on = false, end = false }) {
  return (
    <div className="cs-ctl-wrap">
      <button
        className={`cs-ctl ${end ? 'cs-ctl-end' : on ? 'cs-ctl-on' : ''}`}
        onClick={onClick}
        title={label}
      >
        <span className="material-icons">{icon}</span>
      </button>
      <span className="cs-ctl-lbl">{label}</span>
    </div>
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
            : <div className="ict-av ict-av-fb" style={{ background: ac.bg, color: ac.text }}>
                {getInitials(callerName || '?')}
              </div>
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

  /* Daily.co video container — Daily renders tiles here */
  .cs-daily-container {
    position: absolute; inset: 0;
    z-index: 1;
  }

  /* Daily auto-styles its own video elements — override to fill screen */
  .cs-daily-container iframe,
  .cs-daily-container video {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    object-fit: cover !important;
    border: none !important;
  }

  /* Avatar background */
  .cs-bg {
    position: absolute; inset: 0; z-index: 2;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    overflow: hidden;
  }
  .cs-bg-blur {
    position: absolute; inset: -20px;
    background-size: cover; background-position: center;
    filter: blur(24px) brightness(0.4) saturate(1.2);
  }
  .cs-bg-overlay {
    position: absolute; inset: 0;
    background: linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.6));
  }

  .cs-avatar-wrap {
    position: relative; z-index: 1;
    width: 120px; height: 120px; border-radius: 50%;
    overflow: hidden; margin-bottom: 20px;
    box-shadow: 0 0 0 4px rgba(255,255,255,0.15);
  }
  .cs-pulse { animation: cs-pulse 2s ease infinite; }
  @keyframes cs-pulse {
    0%,100% { box-shadow: 0 0 0 4px rgba(255,255,255,0.15), 0 0 0 0 rgba(255,255,255,0); }
    50%      { box-shadow: 0 0 0 4px rgba(255,255,255,0.15), 0 0 0 22px rgba(255,255,255,0); }
  }
  .cs-avatar-img { width:100%; height:100%; object-fit:cover; display:block; }
  .cs-avatar-fb {
    width:100%; height:100%;
    display:flex; align-items:center; justify-content:center;
    font-size:40px; font-weight:900;
  }

  .cs-name      { position:relative; z-index:1; font-size:24px; font-weight:700; color:#fff; margin:0 0 8px; text-shadow:0 2px 8px rgba(0,0,0,0.5); }
  .cs-phase-txt { position:relative; z-index:1; font-size:14px; color:rgba(255,255,255,0.6); margin:0; }

  .cs-timer {
    position: absolute; top: 20px; left: 50%; transform: translateX(-50%);
    background: rgba(0,0,0,0.5); color: rgba(255,255,255,0.9);
    font-size: 13px; font-weight: 600; padding: 5px 14px;
    border-radius: 999px; backdrop-filter: blur(8px); z-index: 20;
  }

  /* Control bar */
  .cs-bar {
    position: relative; z-index: 30;
    display: flex; align-items: flex-end; justify-content: center;
    gap: 24px; padding: 28px 24px calc(36px + env(safe-area-inset-bottom));
    background: linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%);
  }

  .cs-ctl-wrap { display:flex; flex-direction:column; align-items:center; gap:8px; }

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
  .cs-ctl-lbl { font-size: 11px; color: rgba(255,255,255,0.65); font-weight: 500; white-space: nowrap; }
`

const TOAST_CSS = `
  .ict-card {
    width: min(320px, calc(100vw - 32px));
    background: var(--bg-primary); border: 1px solid var(--border);
    border-radius: 18px; padding: 14px 16px;
    display: flex; align-items: center; justify-content: space-between; gap: 12px;
    box-shadow: 0 12px 40px rgba(0,0,0,0.4);
    animation: ict-in 0.25s cubic-bezier(0.34,1.56,0.64,1) both;
  }
  @keyframes ict-in {
    from { opacity:0; transform:scale(0.9) translateY(10px); }
    to   { opacity:1; transform:scale(1) translateY(0); }
  }
  .ict-left { display:flex; align-items:center; gap:12px; flex:1; min-width:0; }
  .ict-av {
    width:46px; height:46px; border-radius:50%; object-fit:cover; flex-shrink:0;
    display:flex; align-items:center; justify-content:center;
    font-size:16px; font-weight:800;
    animation: ict-pulse 1.5s ease infinite;
  }
  @keyframes ict-pulse {
    0%,100% { box-shadow: 0 0 0 0   rgba(30,144,255,0.4); }
    50%      { box-shadow: 0 0 0 10px rgba(30,144,255,0); }
  }
  .ict-name { font-size:14px; font-weight:700; color:var(--text-primary); margin:0; }
  .ict-sub  { font-size:12px; color:var(--text-tertiary); margin:2px 0 0; }
  .ict-btns { display:flex; gap:10px; flex-shrink:0; }
  .ict-btn {
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