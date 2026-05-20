// src/components/CallScreen.jsx
//
// Jitsi-based call screen for LikeChat.
// Uses the Jitsi meeting UI directly (meet.jit.si).
//
// Props:
//   callId, isCaller, callType ('audio'|'video')
//   callerName, callerPhoto, calleeName, calleePhoto
//   roomUrl  — Jitsi room URL
//   roomName — room name used for cleanup/state
//   currentUser
//   onEnd    — called when call is fully over

import { useEffect, useRef, useCallback } from 'react'
import {
  acceptCall,
  declineCall,
  endCall,
  watchCallAnswer,
  watchCallEnd,
} from '../services/callService'
import { getAvatarColor } from '../lib/utils'
import toast from 'react-hot-toast'

const JITSI_DOMAIN = 'meet.jit.si'
const JITSI_SCRIPT_URL = 'https://meet.jit.si/external_api.js'

// ─── Script loader (singleton) ───────────────────────────────────────────────

let jitsiScriptPromise = null

function loadJitsiScript() {
  if (window.JitsiMeetExternalAPI) return Promise.resolve()
  if (jitsiScriptPromise) return jitsiScriptPromise

  jitsiScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${JITSI_SCRIPT_URL}"]`)

    if (existing) {
      existing.addEventListener('load', resolve, { once: true })
      existing.addEventListener(
        'error',
        () => reject(new Error('Failed to load Jitsi script')),
        { once: true }
      )
      return
    }

    const script = document.createElement('script')
    script.src = JITSI_SCRIPT_URL
    script.async = true
    script.onload = resolve
    script.onerror = () => reject(new Error('Failed to load Jitsi script'))
    document.body.appendChild(script)
  })

  return jitsiScriptPromise
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractRoomName(roomUrlOrName) {
  if (!roomUrlOrName) return ''
  const raw = String(roomUrlOrName).trim()
  if (!raw) return ''
  if (!/^https?:\/\//i.test(raw)) return raw
  return raw.replace(/^https?:\/\/[^/]+\//i, '').replace(/\/+$/, '')
}

// ─── Component ───────────────────────────────────────────────────────────────

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
  const isVideo = callType === 'video'

  const apiRef      = useRef(null)
  const initRef     = useRef(false)   // prevents double joinRoom
  const mountedRef  = useRef(false)
  const endedRef    = useRef(false)   // prevents double finishEnd
  const unsubRef    = useRef(null)
  const containerRef = useRef(null)

  const otherName  = isCaller ? calleeName  : callerName
  // (photo / color kept for future overlay use)
  // const otherPhoto = isCaller ? calleePhoto : callerPhoto
  // const colors     = getAvatarColor(otherName || '')

  // ── Cleanup ────────────────────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    unsubRef.current?.()
    unsubRef.current = null
    initRef.current  = false

    const api = apiRef.current
    apiRef.current = null

    if (api) {
      try { api.removeAllListeners?.() } catch {}
      try { api.executeCommand?.('hangup') } catch {}
      try { api.dispose?.() } catch {}
    }
  }, [])

  // ── End / Decline ──────────────────────────────────────────────────────────

  const finishEnd = useCallback(async () => {
    if (endedRef.current) return
    endedRef.current = true

    try { await endCall(callId) } catch (err) {
      console.error('[CALL] endCall error:', err)
    }

    cleanup()
    onEnd?.()
  }, [callId, cleanup, onEnd])

  const finishDecline = useCallback(async () => {
    if (endedRef.current) return
    endedRef.current = true

    try { await declineCall(callId) } catch (err) {
      console.error('[CALL] declineCall error:', err)
    }

    cleanup()
    onEnd?.()
  }, [callId, cleanup, onEnd])

  // ── Join room ──────────────────────────────────────────────────────────────

  async function joinRoom(roomUrl) {
    if (!roomUrl) throw new Error('Missing room URL.')

    // Strict guard — only one instance allowed
    if (initRef.current || apiRef.current) return
    if (!containerRef.current) throw new Error('Call container is not ready.')

    initRef.current = true

    try {
      await loadJitsiScript()

      if (!window.JitsiMeetExternalAPI) {
        throw new Error('Jitsi API failed to load.')
      }

      const roomNameOnly = extractRoomName(roomUrl)

      const api = new window.JitsiMeetExternalAPI(JITSI_DOMAIN, {
        roomName: roomNameOnly,
        parentNode: containerRef.current,
        userInfo: {
          displayName: currentUser?.displayName || 'User',
          email: currentUser?.email || '',
        },
        configOverwrite: {
          // ── Pre-join / branding ──────────────────────────────────────────
          prejoinPageEnabled:      true,
          enableWelcomePage:       false,
          disableDeepLinking:      true,
          disableInviteFunctions:  true,
          enableClosePage:         false,
          hideLobbyButton:         true,
          hideConferenceSubject:   true,
          hideConferenceTimer:     true,
          disableReactions:        true,
          disableTileView:         false,
          // ── Media defaults (set here, NOT via executeCommand) ────────────
          startWithAudioMuted: false,
          startWithVideoMuted: !isVideo,
          // ── Toolbar ─────────────────────────────────────────────────────
          toolbarButtons: [
            'microphone',
            'camera',
            'hangup',
            'tileview',
            'select-background',
            'settings',
          ],
        },
        interfaceConfigOverwrite: {
          APP_NAME:                      'LikeChat',
          SHOW_JITSI_WATERMARK:          false,
          SHOW_WATERMARK_FOR_GUESTS:     false,
          SHOW_BRAND_WATERMARK:          false,
          SHOW_POWERED_BY:               false,
          SHOW_PROMOTIONAL_CLOSE_PAGE:   false,
          MOBILE_APP_PROMO:              false,
          DEFAULT_BACKGROUND:            '#0b0b0b',
          SHOW_CHROME_EXTENSION_BANNER:  false,
          TOOLBAR_BUTTONS: [
            'microphone',
            'camera',
            'hangup',
            'tileview',
            'select-background',
            'settings',
          ],
        },
      })

      apiRef.current = api

      // ── Event listeners ─────────────────────────────────────────────────

      api.addListener('videoConferenceLeft', () => {
        if (!mountedRef.current) return
        finishEnd()
      })

      api.addListener('readyToClose', () => {
        if (!mountedRef.current) return
        finishEnd()
      })

      // errorOccurred fires for many non-fatal things (e2ee, stats, etc.)
      // Log it but do NOT hang up automatically.
      api.addListener('errorOccurred', err => {
        console.warn('[JITSI] errorOccurred (non-fatal):', err)
      })

    } catch (err) {
      initRef.current = false
      throw err
    }
  }

  // ── Mount / unmount ────────────────────────────────────────────────────────

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      cleanup()
    }
  }, [cleanup])

  // ── Caller flow ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isCaller) return

    joinRoom(callerRoomUrl).catch(err => {
      console.error('[CALL] joinRoom (caller):', err)
      toast.error(err.message || 'Failed to start call')
      finishEnd()
    })

    unsubRef.current = watchCallAnswer(
      callId,
      () => { /* callee joined — Jitsi handles UI */ },
      () => {
        toast.error(`${otherName || 'The other user'} declined the call`)
        finishEnd()
      },
      () => { finishEnd() }
    )

    return () => {
      unsubRef.current?.()
      unsubRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once on mount — all deps are stable refs

  // ── Callee flow ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (isCaller) return

    let cancelled = false

    ;(async () => {
      try {
        const acceptedRoomUrl = await acceptCall(callId)
        if (cancelled) return

        await joinRoom(acceptedRoomUrl)

        unsubRef.current = watchCallEnd(callId, () => {
          if (!cancelled) finishEnd()
        })
      } catch (err) {
        if (cancelled) return
        console.error('[CALL] callee flow error:', err)
        toast.error(err.message || 'Could not connect call')
        finishEnd()
      }
    })()

    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // run once on mount

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{styles}</style>
      <div className="call-root">
        <div ref={containerRef} className="call-stage" />
      </div>
    </>
  )
}

// ─── Incoming call toast ──────────────────────────────────────────────────────

export function IncomingCallToast({
  callerName,
  callerPhoto,
  callType,
  onAnswer,
  onDecline,
}) {
  const colors = getAvatarColor(callerName || '')

  return (
    <>
      <style>{toastStyles}</style>
      <div className="ict-card">
        <div className="ict-left">
          {callerPhoto ? (
            <img src={callerPhoto} className="ict-av" alt={callerName} />
          ) : (
            <div
              className="ict-av ict-av-fb"
              style={{ background: colors.bg, color: colors.text }}
            >
              <span className="material-icons ict-av-icon">person</span>
            </div>
          )}

          <div className="ict-text">
            <p className="ict-name">{callerName}</p>
            <p className="ict-sub">
              <span className="material-icons ict-sub-icon">
                {callType === 'video' ? 'videocam' : 'call'}
              </span>
              <span>{callType === 'video' ? 'Video call' : 'Voice call'}</span>
            </p>
          </div>
        </div>

        <div className="ict-btns">
          <button className="ict-btn ict-ans" onClick={onAnswer} type="button" title="Answer">
            <span className="material-icons">call</span>
          </button>
          <button className="ict-btn ict-dec" onClick={onDecline} type="button" title="Decline">
            <span className="material-icons">call_end</span>
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = `
  .call-root {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: #0b0b0b;
    overflow: hidden;
  }

  .call-stage {
    position: absolute;
    inset: 0;
    z-index: 1;
    background: #0b0b0b;
  }

  .call-stage iframe {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    border: 0 !important;
    background: #0b0b0b !important;
  }
`

const toastStyles = `
  .ict-card {
    width: min(340px, calc(100vw - 24px));
    background: rgba(18,18,18,0.98);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 18px;
    padding: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    box-shadow: 0 14px 34px rgba(0,0,0,0.35);
    backdrop-filter: blur(12px);
  }

  .ict-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex: 1;
  }

  .ict-av {
    width: 46px;
    height: 46px;
    border-radius: 50%;
    object-fit: cover;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255,255,255,0.08);
  }

  .ict-av-fb { overflow: hidden; }
  .ict-av-icon { font-size: 22px; }

  .ict-text { min-width: 0; }

  .ict-name {
    margin: 0;
    color: #fff;
    font-size: 14px;
    font-weight: 800;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ict-sub {
    margin: 4px 0 0;
    color: rgba(255,255,255,0.72);
    font-size: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    line-height: 1.2;
  }

  .ict-sub-icon { font-size: 16px; }

  .ict-btns {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  .ict-btn {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform .15s ease, opacity .15s ease;
  }

  .ict-btn:hover { transform: translateY(-1px); opacity: 0.95; }
  .ict-btn .material-icons { font-size: 20px; }

  .ict-ans { background: #1ea752; }
  .ict-dec { background: #e93d4c; }

  @media (max-width: 480px) {
    .ict-card { width: calc(100vw - 16px); padding: 12px; }
    .ict-btns { gap: 8px; }
    .ict-btn  { width: 40px; height: 40px; }
  }
`