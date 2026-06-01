// src/components/CallScreen.jsx
//
// Public Jitsi call screen for LikeChat.
// No Daily, no JaaS login, no moderator lobby, no extra "Join meeting" click.
// The call joins automatically after the callee accepts.
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
  joinGroupCall,
  leaveGroupCall,
} from '../services/callService'
import { getAvatarColor } from '../lib/utils'
import toast from 'react-hot-toast'

const JITSI_DOMAIN = 'meet.jit.si'
const JITSI_SCRIPT_URL = `https://${JITSI_DOMAIN}/external_api.js`

let jitsiScriptPromise = null
const activeCallIds = new Set()

function loadJitsiScript() {
  if (window.JitsiMeetExternalAPI) return Promise.resolve()
  if (jitsiScriptPromise) return jitsiScriptPromise

  jitsiScriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${JITSI_SCRIPT_URL}"]`)

    if (existing) {
      if (window.JitsiMeetExternalAPI) {
        resolve()
        return
      }

      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Failed to load Jitsi script')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = JITSI_SCRIPT_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Jitsi script'))
    document.body.appendChild(script)
  })

  return jitsiScriptPromise
}

function extractRoomName(roomUrlOrName) {
  if (!roomUrlOrName) return ''
  const raw = String(roomUrlOrName).trim()
  if (!raw) return ''

  if (!/^https?:\/\//i.test(raw)) return raw

  return raw.replace(/^https?:\/\/[^/]+\//i, '').replace(/\/+$/, '')
}

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
  isGroup,
}) {
  const isVideo = callType === 'video'

  const apiRef = useRef(null)
  const initRef = useRef(false)
  const mountedRef = useRef(false)
  const endedRef = useRef(false)
  const unsubRef = useRef(null)
  const containerRef = useRef(null)

  const otherName = isCaller ? calleeName : callerName
  const otherPhoto = isCaller ? calleePhoto : callerPhoto
  const colors = getAvatarColor(otherName || '')

  const cleanup = useCallback(async () => {
    unsubRef.current?.()
    unsubRef.current = null
    initRef.current = false
    activeCallIds.delete(callId)

    const api = apiRef.current
    apiRef.current = null

    if (api) {
      try {
        api.removeAllListeners?.()
      } catch {}

      try {
        api.executeCommand?.('hangup')
      } catch {}

      try {
        api.dispose?.()
      } catch {}
    }
  }, [callId])

    const finishEnd = useCallback(async () => {
      if (endedRef.current) return
      endedRef.current = true

      // For group calls, remove ourselves from participants (may end call if last to leave)
      if (isGroup && currentUser?.uid) {
        await leaveGroupCall(callId, currentUser.uid).catch(() => {})
      } else if (!isGroup) {
        // For private calls, end the call
        try {
          await endCall(callId)
        } catch (err) {
          console.error('[CALL] endCall error:', err)
        }
      }

      await cleanup()
      onEnd?.()
    }, [callId, isGroup, currentUser, cleanup, onEnd])

  const finishDecline = useCallback(async () => {
    if (endedRef.current) return
    endedRef.current = true

    try {
      await declineCall(callId)
    } catch (err) {
      console.error('[CALL] declineCall error:', err)
    }

    await cleanup()
    onEnd?.()
  }, [callId, cleanup, onEnd])

  async function joinRoom(roomUrl) {
    if (!roomUrl) {
      throw new Error('Missing room URL.')
    }

    if (initRef.current || apiRef.current || activeCallIds.has(callId)) {
      return
    }

    if (!containerRef.current) {
      throw new Error('Call container is not ready.')
    }

    initRef.current = true
    activeCallIds.add(callId)

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
          prejoinPageEnabled: false,
          enableWelcomePage: false,
          disableDeepLinking: true,
          disableInviteFunctions: true,
          enableClosePage: false,
          hideLobbyButton: true,
          hideConferenceSubject: true,
          hideConferenceTimer: true,
          disableReactions: true,
          startWithAudioMuted: false,
          startWithVideoMuted: !isVideo,

          // Make sure no lobby / moderator gating appears
          enableLobby: false,
          autoKnockLobby: false,
          disableLobbyPassword: true,
          disablePrivateChat: true,
        },
        interfaceConfigOverwrite: {
          APP_NAME: 'LikeChat',
          SHOW_JITSI_WATERMARK: false,
          SHOW_WATERMARK_FOR_GUESTS: false,
          SHOW_BRAND_WATERMARK: false,
          SHOW_POWERED_BY: false,
          SHOW_PROMOTIONAL_CLOSE_PAGE: false,
          MOBILE_APP_PROMO: false,
          DEFAULT_BACKGROUND: '#0b0b0b',
          SHOW_CHROME_EXTENSION_BANNER: false,
          TOOLBAR_BUTTONS: [
            'microphone',
            'camera',
            'hangup',
            'tileview',
            'settings',
          ],
        },
      })

            apiRef.current = api

      api.addListener('videoConferenceJoined', () => {
        if (!mountedRef.current) return
        // Track ourselves in the session so others know who's in the call
        if (isGroup && currentUser?.uid) {
          joinGroupCall(callId, currentUser.uid).catch(() => {})
        }
      })

      api.addListener('videoConferenceLeft', () => {
        if (!mountedRef.current) return
        finishEnd()
      })

      api.addListener('readyToClose', () => {
        if (!mountedRef.current) return
        finishEnd()
      })

      api.addListener('errorOccurred', err => {
        if (!mountedRef.current) return
        console.warn('[JITSI] errorOccurred (non-fatal):', err)
      })
    } catch (err) {
      initRef.current = false
      activeCallIds.delete(callId)
      throw err
    }
  }

  useEffect(() => {
    mountedRef.current = true

    return () => {
      mountedRef.current = false
      initRef.current = false
      activeCallIds.delete(callId)

      const api = apiRef.current
      apiRef.current = null

      if (api) {
        try {
          api.removeAllListeners?.()
        } catch {}
        try {
          api.dispose?.()
        } catch {}
      }
    }
  }, [callId])

  useEffect(() => {
    if (!isCaller) return

    joinRoom(callerRoomUrl).catch(err => {
      console.error('[CALL] joinRoom (caller):', err)
      toast.error(err.message || 'Failed to start call')
      finishEnd()
    })

    unsubRef.current = watchCallAnswer(
      callId,
      () => {
        // callee joined
      },
      () => {
        toast.error(`${otherName || 'The other user'} declined the call`)
        finishEnd()
      },
      () => {
        finishEnd()
      }
    )

    return () => {
      unsubRef.current?.()
      unsubRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
  }, [])

  return (
    <>
      <style>{styles}</style>
      <div className="call-root">
        <div ref={containerRef} className="call-stage" />
        <div className="call-badge" aria-hidden="true">
          {otherPhoto ? (
            <img src={otherPhoto} alt={otherName} className="call-badge-photo" />
          ) : (
            <div
              className="call-badge-fallback"
              style={{ background: colors.bg, color: colors.text }}
            />
          )}
          <div className="call-badge-text">
            <div className="call-badge-name">{otherName}</div>
            <div className="call-badge-sub">
              {isVideo ? 'Video call' : 'Voice call'}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export function IncomingCallToast({ callerName, callerPhoto, callType, onAnswer, onDecline }) {
  const colors = getAvatarColor(callerName || '')

  return (
    <>
      <style>{toastStyles}</style>
      <div className="ict-card">
        <div className="ict-left">
          {callerPhoto ? (
            <img src={callerPhoto} className="ict-av" alt={callerName} />
          ) : (
            <div className="ict-av ict-av-fb" style={{ background: colors.bg, color: colors.text }} />
          )}
          <div className="ict-text">
            <p className="ict-name">{callerName}</p>
            <p className="ict-sub">
              {callType === 'video' ? 'Video call' : 'Voice call'}
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

const styles = `
  .call-root{
    position:fixed;
    inset:0;
    z-index:9999;
    background:#0b0b0b;
    overflow:hidden;
  }

  .call-stage{
    position:absolute;
    inset:0;
    z-index:1;
    background:#0b0b0b;
  }

  .call-stage iframe{
    position:absolute !important;
    inset:0 !important;
    width:100% !important;
    height:100% !important;
    border:0 !important;
    background:#0b0b0b !important;
  }

  .call-badge{
    position:absolute;
    top:16px;
    left:50%;
    transform:translateX(-50%);
    z-index:2;
    pointer-events:none;
    display:flex;
    align-items:center;
    gap:10px;
    padding:10px 14px;
    border-radius:999px;
    background:rgba(10,10,10,0.45);
    backdrop-filter: blur(10px);
    color:#fff;
  }

  .call-badge-photo,
  .call-badge-fallback{
    width:36px;
    height:36px;
    border-radius:50%;
    object-fit:cover;
    flex-shrink:0;
  }

  .call-badge-fallback{
    display:block;
  }

  .call-badge-name{
    font-size:13px;
    font-weight:800;
    line-height:1.1;
  }

  .call-badge-sub{
    font-size:11px;
    color:rgba(255,255,255,0.72);
    margin-top:2px;
  }
`

const toastStyles = `
  .ict-card{
    width:min(340px, calc(100vw - 24px));
    background:rgba(18,18,18,0.98);
    border:1px solid rgba(255,255,255,0.08);
    border-radius:18px;
    padding:14px 14px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap:12px;
    box-shadow:0 14px 34px rgba(0,0,0,0.35);
    backdrop-filter: blur(12px);
  }

  .ict-left{
    display:flex;
    align-items:center;
    gap:12px;
    min-width:0;
    flex:1;
  }

  .ict-av{
    width:46px;
    height:46px;
    border-radius:50%;
    object-fit:cover;
    flex-shrink:0;
    display:flex;
    align-items:center;
    justify-content:center;
    border:1px solid rgba(255,255,255,0.08);
  }

  .ict-av-fb{
    overflow:hidden;
  }

  .ict-text{
    min-width:0;
  }

  .ict-name{
    margin:0;
    color:#fff;
    font-size:14px;
    font-weight:800;
    line-height:1.2;
    overflow:hidden;
    text-overflow:ellipsis;
    white-space:nowrap;
  }

  .ict-sub{
    margin:4px 0 0;
    color:rgba(255,255,255,0.72);
    font-size:12px;
    line-height:1.2;
  }

  .ict-btns{
    display:flex;
    align-items:center;
    gap:10px;
    flex-shrink:0;
  }

  .ict-btn{
    width:42px;
    height:42px;
    border-radius:50%;
    border:none;
    cursor:pointer;
    color:#fff;
    display:flex;
    align-items:center;
    justify-content:center;
    transition:transform .15s ease, opacity .15s ease;
  }

  .ict-btn:hover{
    transform:translateY(-1px);
    opacity:0.95;
  }

  .ict-btn .material-icons{
    font-size:20px;
  }

  .ict-ans{
    background:#1ea752;
  }

  .ict-dec{
    background:#e93d4c;
  }

  @media (max-width: 480px){
    .ict-card{
      width: calc(100vw - 16px);
      padding:12px;
    }

    .ict-btns{
      gap:8px;
    }

    .ict-btn{
      width:40px;
      height:40px;
    }
  }
`