// src/pages/app/ChatWindow.jsx
import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useAuth } from '../../context/AuthContext'
import {
  watchMessages,
  getConversation,
  markSeen,
} from '../../services/chatService'
import {
  startCall as initiateCall,
  watchIncomingCalls,
  declineCall,
} from '../../services/callService'
import { watchUserPresence } from '../../lib/presence'
import { useTyping } from '../../lib/typing'
import MessageBubble from '../../components/MessageBubble'
import MessageInput from '../../components/MessageInput'
import TypingIndicator from '../../components/TypingIndicator'
import CallScreen, { IncomingCallToast } from '../../components/CallScreen'
import { getInitials, getAvatarColor, formatDate } from '../../lib/utils'
import { ArrowLeft, Search } from 'lucide-react'
import toast from 'react-hot-toast'

function formatLastSeen(lastSeen) {
  if (!lastSeen) return 'Offline'
  const date =
    typeof lastSeen === 'number'
      ? new Date(lastSeen)
      : lastSeen?.toDate?.() ?? new Date(lastSeen)

  const diff = Date.now() - date.getTime()
  const mins = Math.floor(diff / 60000)

  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`

  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`

  return formatDate(date)
}

function groupByDate(msgs) {
  const groups = []
  let lastDate = null

  msgs.forEach(msg => {
    const d = msg.createdAt?.toDate?.()
    const dateStr = d ? formatDate(d) : null

    if (dateStr && dateStr !== lastDate) {
      groups.push({ type: 'divider', label: dateStr, id: `div-${dateStr}` })
      lastDate = dateStr
    }

    groups.push({ type: 'msg', ...msg })
  })

  return groups
}

export default function ChatWindow() {
  const { convId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const [convo, setConvo] = useState(null)
  const [messages, setMessages] = useState([])
  const [presence, setPresence] = useState(null)
  const [replyTo, setReplyTo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showInfo, setShowInfo] = useState(false)
  const [searchMode, setSearchMode] = useState(false)
  const [searchQ, setSearchQ] = useState('')

  const [activeCall, setActiveCall] = useState(null)
  const [startingCall, setStartingCall] = useState(false)

  const bottomRef = useRef(null)
  const searchRef = useRef(null)
  const messagesRef = useRef([])
  const isAtBottom = useRef(true)

  const { typingUsers } = useTyping(convId, user?.uid)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    if (!convId) return
    setLoading(true)

    getConversation(convId)
      .then(data => {
        setConvo(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [convId])

  useEffect(() => {
    if (!convId || !user?.uid) return

    const unsub = watchMessages(convId, msgs => {
      setMessages(msgs)
      if (isAtBottom.current && document.hasFocus()) {
        markSeen(convId, user.uid, msgs).catch(() => {})
      }
    })

    return unsub
  }, [convId, user?.uid])

  useEffect(() => {
    function onFocus() {
      if (convId && user?.uid && isAtBottom.current) {
        markSeen(convId, user.uid, messagesRef.current).catch(() => {})
      }
    }

    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [convId, user?.uid])

  useEffect(() => {
    if (!convo || convo.type === 'group') return

    const otherUid = convo.members?.find(uid => uid !== user.uid)
    if (!otherUid) return

    return watchUserPresence(otherUid, setPresence)
  }, [convo, user?.uid])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    isAtBottom.current = true
  }, [messages.length])

  useEffect(() => {
    if (searchMode) searchRef.current?.focus()
  }, [searchMode])

  useEffect(() => {
    if (!user?.uid || !convo || convo.type === 'group') return

    const unsub = watchIncomingCalls(user.uid, incoming => {
      if (incoming.convId !== convId) return
      if (activeCall) return

      toast.custom(
        t => (
          <IncomingCallToast
            callerName={convo.memberNames?.[incoming.callerId] || 'Someone'}
            callerPhoto={convo.memberPhotos?.[incoming.callerId]}
            callType={incoming.type}
            onAnswer={() => {
              toast.dismiss(t.id)
              handleAnswerCall(incoming)
            }}
            onDecline={() => {
              toast.dismiss(t.id)
              handleDeclineCall(incoming.callId)
            }}
          />
        ),
        { duration: 30000, id: `incoming-${incoming.callId}` }
      )
    })

    return unsub
  }, [user?.uid, convo, convId, activeCall])

  const startCall = useCallback(async (type) => {
    if (!convo || convo.type === 'group') {
      toast.error('Voice/video calls are only available in direct messages')
      return
    }

    if (activeCall) {
      toast.error('You are already in a call')
      return
    }

    const otherUid = convo.members?.find(uid => uid !== user.uid)
    const calleeName = convo.memberNames?.[otherUid] || 'Unknown'
    const calleePhoto = convo.memberPhotos?.[otherUid] || null

    setStartingCall(true)
    try {
      const { callId, roomUrl, roomName } = await initiateCall({
        callerId: user.uid,
        calleeId: otherUid,
        convId,
        type,
      })

      setActiveCall({
        callId,
        isCaller: true,
        callType: type,
        callerName: user.displayName || 'Me',
        callerPhoto: user.photoURL || null,
        calleeName,
        calleePhoto,
        roomUrl,
        roomName,
      })
    } catch (err) {
      toast.error(err.message || 'Failed to start call')
    } finally {
      setStartingCall(false)
    }
  }, [convo, convId, user, activeCall])

  const handleAnswerCall = useCallback((incoming) => {
    const callerName = convo?.memberNames?.[incoming.callerId] || 'Someone'
    const callerPhoto = convo?.memberPhotos?.[incoming.callerId] || null

    setActiveCall({
      callId: incoming.callId,
      isCaller: false,
      callType: incoming.type,
      callerName,
      callerPhoto,
      calleeName: user.displayName || 'Me',
      calleePhoto: user.photoURL || null,
    })
  }, [convo, user])

  const handleDeclineCall = useCallback(async (callId) => {
    try {
      await declineCall(callId)
    } catch {}
  }, [])

  const handleCallEnd = useCallback(() => {
    setActiveCall(null)
  }, [])

  const isGroup = convo?.type === 'group'
  const otherUid = convo?.members?.find(uid => uid !== user.uid)
  const chatName = isGroup ? convo?.groupName : convo?.memberNames?.[otherUid] || 'Chat'
  const chatPhoto = isGroup ? convo?.groupPhoto : convo?.memberPhotos?.[otherUid]
  const avatarColor = getAvatarColor(chatName || '')

  const isOnline = !isGroup && presence?.status === 'online'
  const isAway = !isGroup && presence?.status === 'away'

  const statusText = isGroup
    ? `${convo?.members?.length || 0} members`
    : isOnline
      ? 'Online'
      : isAway
        ? 'Away'
        : presence?.lastSeen
          ? `Last seen ${formatLastSeen(presence.lastSeen)}`
          : 'Offline'

  const whoTyping = Object.keys(typingUsers || {})
    .filter(uid => uid !== user.uid)
    .map(uid => convo?.memberNames?.[uid]?.split(' ')[0] || 'Someone')

  const displayed = searchQ.trim()
    ? messages.filter(m => m.text?.toLowerCase().includes(searchQ.toLowerCase()))
    : messages

  if (loading) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-secondary)',
      }}>
        <div className="spinner" />
      </div>
    )
  }

  if (!convo) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--text-tertiary)' }}>Conversation not found.</p>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg-primary)',
      overflow: 'hidden',
      position: 'relative',
    }}>
      <div className="chat-topbar">
        <button
          onClick={() => navigate('/app/chats')}
          className="hide-desktop topbar-btn"
          style={{ color: 'var(--text-primary)', marginRight: '4px' }}
        >
          <ArrowLeft size={20} />
        </button>

        <div
          style={{ position: 'relative', flexShrink: 0, cursor: 'pointer' }}
          onClick={() => setShowInfo(v => !v)}
        >
          {chatPhoto ? (
            <img
              src={chatPhoto}
              alt={chatName}
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                objectFit: 'cover',
              }}
            />
          ) : (
            <div
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: avatarColor.bg,
                color: avatarColor.text,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '15px',
                fontWeight: 700,
              }}
            >
              {getInitials(chatName || '?')}
            </div>
          )}

          {!isGroup && (
            <span
              style={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                width: '11px',
                height: '11px',
                borderRadius: '50%',
                border: '2px solid var(--bg-primary)',
                background: isOnline ? 'var(--online)' : isAway ? 'var(--away)' : 'var(--offline)',
              }}
            />
          )}
        </div>

        <div
          style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
          onClick={() => setShowInfo(v => !v)}
        >
          <p style={{
            fontSize: '15px',
            fontWeight: 600,
            color: 'var(--text-primary)',
            margin: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {chatName}
          </p>
          <p style={{
            fontSize: '12px',
            margin: 0,
            color: isOnline ? 'var(--online)' : isAway ? 'var(--away)' : 'var(--text-tertiary)',
          }}>
            {statusText}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <TBtn onClick={() => setSearchMode(v => !v)} icon="search" />

          {!isGroup && (
            <TBtn
              onClick={() => startCall('audio')}
              icon={startingCall ? 'hourglass_empty' : 'call'}
              title="Voice call"
              disabled={startingCall}
            />
          )}

          {!isGroup && (
            <TBtn
              onClick={() => startCall('video')}
              icon={startingCall ? 'hourglass_empty' : 'videocam'}
              title="Video call"
              disabled={startingCall}
            />
          )}

          <TBtn onClick={() => setShowInfo(v => !v)} icon="more_vert" />
        </div>
      </div>

      {searchMode && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 14px',
          background: 'var(--bg-primary)',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <Search size={15} style={{ color: 'var(--text-tertiary)' }} />
          <input
            ref={searchRef}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: '14px',
              color: 'var(--text-primary)',
            }}
            placeholder="Search messages..."
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
          <button
            onClick={() => {
              setSearchMode(false)
              setSearchQ('')
            }}
            style={{
              fontSize: '13px',
              color: 'var(--primary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Cancel
          </button>
        </div>
      )}

      <div
        className="message-area"
        onScroll={e => {
          const el = e.currentTarget
          isAtBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
        }}
      >
        {groupByDate(displayed).map(item =>
          item.type === 'divider' ? (
            <div key={item.id} className="date-divider">
              <span>{item.label}</span>
            </div>
          ) : (
            <MessageBubble
              key={item.id}
              msg={item}
              isMine={item.senderId === user.uid}
              convId={convId}
              currentUid={user.uid}
              isGroup={isGroup}
              senderName={isGroup ? convo.memberNames?.[item.senderId] : null}
              senderPhoto={isGroup ? convo.memberPhotos?.[item.senderId] : null}
              onReply={setReplyTo}
            />
          )
        )}

        {whoTyping.length > 0 && (
          <div style={{ padding: '4px 14px' }}>
            <TypingIndicator names={whoTyping} />
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <MessageInput
        convId={convId}
        currentUser={user}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
      />

      {showInfo && (
        <InfoPanel
          convo={convo}
          chatName={chatName}
          chatPhoto={chatPhoto}
          avatarColor={avatarColor}
          isGroup={isGroup}
          currentUid={user.uid}
          onClose={() => setShowInfo(false)}
          navigate={navigate}
          onStartCall={startCall}
        />
      )}

      {activeCall && (
        <CallScreen
          {...activeCall}
          currentUser={user}
          onEnd={handleCallEnd}
        />
      )}
    </div>
  )
}

function TBtn({ icon, onClick, title, disabled }) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="topbar-btn"
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      <span className="material-icons" style={{ fontSize: '20px' }}>{icon}</span>
    </button>
  )
}

function InfoPanel({ convo, chatName, chatPhoto, avatarColor, isGroup, currentUid, onClose, navigate, onStartCall }) {
  const actions = [
    { label: 'Pin conversation', icon: 'push_pin', action: () => toast('Coming soon') },
    { label: 'Mute notifications', icon: 'notifications_off', action: () => toast('Coming soon') },
    ...(!isGroup
      ? [{ label: 'Block user', icon: 'block', action: () => toast('Coming soon'), danger: true }]
      : [{ label: 'Manage group', icon: 'group', action: () => { onClose(); navigate(`/app/group/${convo.id}`) } }]
    ),
  ]

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        justifyContent: 'flex-end',
        background: 'rgba(0,0,0,0.4)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '300px',
          height: '100%',
          overflowY: 'auto',
          background: 'var(--bg-primary)',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px',
          borderBottom: '1px solid var(--border)',
        }}>
          <p style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text-primary)', margin: 0 }}>
            {isGroup ? 'Group Info' : 'Contact Info'}
          </p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: '20px' }}>
            ✕
          </button>
        </div>

        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '24px 16px 16px',
          gap: '8px',
        }}>
          {chatPhoto ? (
            <img
              src={chatPhoto}
              alt={chatName}
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                objectFit: 'cover',
              }}
            />
          ) : (
            <div
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: avatarColor.bg,
                color: avatarColor.text,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 700,
              }}
            >
              {getInitials(chatName || '?')}
            </div>
          )}
          <p style={{ fontWeight: 700, fontSize: '17px', color: 'var(--text-primary)', margin: 0 }}>{chatName}</p>
          {isGroup && <p style={{ fontSize: '13px', color: 'var(--text-tertiary)', margin: 0 }}>{convo.members?.length} members</p>}
        </div>

        {!isGroup && onStartCall && (
          <div style={{ display: 'flex', gap: '10px', padding: '0 16px 16px' }}>
            <button
              onClick={() => {
                onClose()
                onStartCall('audio')
              }}
              style={quickCallBtn}
            >
              <span className="material-icons" style={{ fontSize: '18px' }}>call</span>
              Voice
            </button>
            <button
              onClick={() => {
                onClose()
                onStartCall('video')
              }}
              style={quickCallBtn}
            >
              <span className="material-icons" style={{ fontSize: '18px' }}>videocam</span>
              Video
            </button>
          </div>
        )}

        <div style={{ borderTop: '1px solid var(--border)', padding: '8px' }}>
          {actions.map(({ label, icon, action, danger }) => (
            <button
              key={label}
              onClick={action}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 12px',
                borderRadius: '10px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: danger ? 'var(--danger)' : 'var(--text-primary)',
                fontSize: '14px',
                textAlign: 'left',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-secondary)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span className="material-icons" style={{ fontSize: '20px', color: danger ? 'var(--danger)' : 'var(--primary)' }}>{icon}</span>
              {label}
            </button>
          ))}
        </div>

        {isGroup && convo.members && (
          <div style={{ borderTop: '1px solid var(--border)', padding: '8px' }}>
            <p style={{
              fontSize: '11px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.6px',
              color: 'var(--text-tertiary)',
              padding: '8px 12px 4px',
              margin: 0,
            }}>
              Members
            </p>
            {convo.members.map(uid => (
              <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: getAvatarColor(convo.memberNames?.[uid] || '').bg,
                  color: getAvatarColor(convo.memberNames?.[uid] || '').text,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '13px',
                  fontWeight: 700,
                  flexShrink: 0,
                }}>
                  {getInitials(convo.memberNames?.[uid] || '?')}
                </div>
                <div>
                  <p style={{ margin: 0, fontSize: '14px', fontWeight: 500, color: 'var(--text-primary)' }}>
                    {convo.memberNames?.[uid] || uid}
                  </p>
                  {convo.admins?.includes(uid) && (
                    <p style={{ margin: 0, fontSize: '12px', color: 'var(--primary)' }}>Admin</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const quickCallBtn = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '10px',
  borderRadius: '12px',
  border: '1px solid var(--border)',
  background: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'background 0.15s',
}